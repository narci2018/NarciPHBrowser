//! The stored proxy list.
//!
//! # What lives here
//!
//! A profile carries the proxy it launches through inline, so a launched
//! profile needs nothing beyond itself. What was missing is the *library*
//! those inline values are copied from: a named list of proxies a user keeps
//! once and assigns to many profiles, each with the country its exit IP is
//! expected to sit in.
//!
//! One JSON file beside the profile store (`proxies.json`) holds the whole
//! list. It is small, written atomically, and read whole on open — a proxy
//! list that holds hundreds of entries is still kilobytes.
//!
//! # What is deliberately not here
//!
//! Health checks perform network requests and belong to the layer that owns
//! an HTTP client; this module only stores the receipts ([`ProxyCheck`]).
//! Assignment rewrites profiles and belongs beside the profile store.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::profile::ProxyConfig;
use crate::seal;

/// The on-disk format version of the proxy file.
const PROXY_FORMAT: u32 = 1;

/// The longest name a proxy may have, mirroring a profile's bound.
const MAX_NAME: usize = 120;

/// A health check's result, kept with the proxy it ran against.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProxyCheck {
    /// Whether an echo service answered through the proxy.
    pub ok: bool,
    /// The exit IP the echo service saw.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    /// The two-letter country that IP sits in, when the endpoint reported one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// The city, when reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    /// Why the check failed, when it did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Wall time of the whole check, in milliseconds.
    pub latency_ms: u64,
    /// Unix seconds at which the check ran.
    pub checked_at: u64,
}

/// One proxy in the list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredProxy {
    /// Stable id; not derived from the name, so a rename keeps assignments.
    pub id: String,
    /// The user's name for it.
    pub name: String,
    /// The proxy URL, e.g. `http://user:pass@host:8080`.
    pub url: String,
    /// The country the exit IP is expected to sit in, for the geo gate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_country: Option<String>,
    /// The last health check that ran, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_check: Option<ProxyCheck>,
}

impl StoredProxy {
    /// The proxy as a profile would carry it.
    pub fn config(&self) -> ProxyConfig {
        ProxyConfig {
            url: self.url.clone(),
            exit_country: self.exit_country.clone(),
        }
    }
}

/// Validates a proxy URL and normalises its exit country, exactly as the
/// store validates its own entries, so an assignment cannot carry a URL the
/// list would have refused — and therefore one the launcher would refuse.
pub fn checked_config(url: &str, exit_country: Option<&str>) -> Result<ProxyConfig> {
    let url = url.trim().to_owned();
    let config = ProxyConfig {
        url: url.clone(),
        exit_country: None,
    };
    // The same validation a profile's proxy gets, so a URL accepted here
    // cannot be refused at launch.
    config
        .parts()
        .map_err(|error| Error::identity(format!("proxy: {error}")))?;

    let exit_country = match exit_country.map(str::trim).filter(|raw| !raw.is_empty()) {
        Some(raw) => {
            let country = raw.to_ascii_uppercase();
            if country.len() != 2 || !country.bytes().all(|byte| byte.is_ascii_alphabetic()) {
                return Err(Error::identity(format!(
                    "exit country {country:?} is not a two-letter code"
                )));
            }
            Some(country)
        }
        None => None,
    };
    Ok(ProxyConfig {
        url,
        exit_country,
    })
}

/// The file envelope, so a future format can be told from a corrupt one.
#[derive(Debug, Serialize, Deserialize)]
struct ProxyFile {
    format: u32,
    proxies: Vec<StoredProxy>,
}

/// The proxy list, loaded whole.
pub struct ProxyStore {
    path: PathBuf,
    proxies: Vec<StoredProxy>,
}

impl ProxyStore {
    /// Opens the list at `path`, which is created on first save.
    ///
    /// A missing file is an empty list, not an error: nothing has been stored
    /// yet is the normal state before the user adds a proxy.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let proxies = match seal::read_store(&path)? {
            Some(bytes) => {
                let file: ProxyFile = serde_json::from_slice(&bytes).map_err(|source| {
                    Error::identity(format!(
                        "{} is not a readable proxy list: {source}",
                        path.display()
                    ))
                })?;
                if file.format > PROXY_FORMAT {
                    return Err(Error::identity(format!(
                        "{} was written by a newer version of NarciPHBrowser (format {}, this build \
                         understands {}); upgrade rather than letting it be rewritten",
                        path.display(),
                        file.format,
                        PROXY_FORMAT
                    )));
                }
                file.proxies
            }
            None => Vec::new(),
        };
        Ok(Self { path, proxies })
    }

    /// Every stored proxy, in insertion order.
    pub fn list(&self) -> &[StoredProxy] {
        &self.proxies
    }

    /// One proxy by id, or `None`.
    pub fn get(&self, id: &str) -> Option<&StoredProxy> {
        self.proxies.iter().find(|proxy| proxy.id == id)
    }

    /// Adds a proxy, validated, and writes the list.
    pub fn create(
        &mut self,
        name: &str,
        url: &str,
        exit_country: Option<&str>,
    ) -> Result<StoredProxy> {
        let checked = self.checked(None, name, url, exit_country)?;
        let id = self.free_id(&checked.name);
        let stored = StoredProxy { id, ..checked };
        self.proxies.push(stored.clone());
        self.save()?;
        Ok(stored)
    }

    /// Replaces a proxy's fields, keeping its id and its last check when the
    /// route it describes did not change.
    ///
    /// The check describes the URL it ran against: a proxy whose URL changed
    /// has a receipt from a different endpoint, so it is dropped rather than
    /// displayed as if it still held.
    pub fn update(
        &mut self,
        id: &str,
        name: &str,
        url: &str,
        exit_country: Option<&str>,
    ) -> Result<StoredProxy> {
        let checked = self.checked(Some(id), name, url, exit_country)?;
        let index = self
            .proxies
            .iter()
            .position(|proxy| proxy.id == id)
            .ok_or_else(|| Error::identity(format!("no proxy with the id {id:?}")))?;
        let previous = &self.proxies[index];
        let route_changed = previous.url != checked.url;
        let stored = StoredProxy {
            id: id.to_owned(),
            last_check: if route_changed { None } else { previous.last_check.clone() },
            ..checked
        };
        self.proxies[index] = stored.clone();
        self.save()?;
        Ok(stored)
    }

    /// Records a health check against a proxy, and writes the list.
    pub fn set_check(&mut self, id: &str, check: ProxyCheck) -> Result<StoredProxy> {
        let index = self
            .proxies
            .iter()
            .position(|proxy| proxy.id == id)
            .ok_or_else(|| Error::identity(format!("no proxy with the id {id:?}")))?;
        let mut stored = self.proxies[index].clone();
        stored.last_check = Some(check);
        self.proxies[index] = stored.clone();
        self.save()?;
        Ok(stored)
    }

    /// Removes a proxy, reporting whether one was there.
    ///
    /// Profiles keep the URL they were assigned inline, so deleting a stored
    /// proxy never rewrites a profile; the list entry is all this removes.
    pub fn delete(&mut self, id: &str) -> Result<bool> {
        let before = self.proxies.len();
        self.proxies.retain(|proxy| proxy.id != id);
        if self.proxies.len() == before {
            return Ok(false);
        }
        self.save()?;
        Ok(true)
    }

    /// Validates the fields of a proxy, normalising what can be normalised.
    fn checked(
        &self,
        id: Option<&str>,
        name: &str,
        url: &str,
        exit_country: Option<&str>,
    ) -> Result<StoredProxy> {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::identity("a proxy needs a name"));
        }
        if name.len() > MAX_NAME {
            return Err(Error::identity(format!(
                "a name of {} characters is not a name",
                name.len()
            )));
        }
        let config = checked_config(url, exit_country)?;
        Ok(StoredProxy {
            id: id.unwrap_or_default().to_owned(),
            name: name.to_owned(),
            url: config.url,
            exit_country: config.exit_country,
            last_check: None,
        })
    }

    /// An id derived from the name, unique within this list.
    fn free_id(&self, name: &str) -> String {
        let base = slug(name);
        if !self.proxies.iter().any(|proxy| proxy.id == base) {
            return base;
        }
        for suffix in 2..10_000u32 {
            let candidate = format!("{base}-{suffix}");
            if !self.proxies.iter().any(|proxy| proxy.id == candidate) {
                return candidate;
            }
        }
        format!("{base}-{}", self.proxies.len())
    }

    /// Writes the list, replacing any previous version of it.
    ///
    /// Sealed at rest — the URLs carry credentials — and written atomically
    /// (a sibling temp file and a rename) so a crash halfway through a write
    /// must not leave a list that parses as truncated JSON.
    fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|source| {
                    Error::environment(format!("could not create {}: {source}", parent.display()))
                })?;
            }
        }
        let file = ProxyFile {
            format: PROXY_FORMAT,
            proxies: self.proxies.clone(),
        };
        let json = serde_json::to_string_pretty(&file)?;
        seal::write_store(&self.path, json.as_bytes())
    }
}

/// A filesystem-safe id from a name.
fn slug(name: &str) -> String {
    slug_with(name, "proxy")
}

/// A filesystem-safe id from a name, with the fallback an all-punctuation name
/// gets. Shared so a subscription and a proxy slug the same way.
pub(crate) fn slug_with(name: &str, fallback: &str) -> String {
    let mut slug = String::with_capacity(name.len());
    let mut pending_dash = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            pending_dash = false;
            slug.push(character.to_ascii_lowercase());
        } else {
            pending_dash = true;
        }
    }
    if slug.is_empty() {
        fallback.to_owned()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// A path no other test will touch, removed on drop.
    struct TempFile(PathBuf);

    impl TempFile {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "narrc-proxy-test-{name}-{}-{n}.json",
                std::process::id(),
                n = unique(),
            ));
            let _ = std::fs::remove_file(&path);
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn unique() -> u32 {
        use std::sync::atomic::{AtomicU32, Ordering};
        static NEXT: AtomicU32 = AtomicU32::new(0);
        NEXT.fetch_add(1, Ordering::Relaxed)
    }

    #[test]
    fn a_missing_file_is_an_empty_list() {
        let file = TempFile::new("missing");
        let store = ProxyStore::open(file.path()).expect("opens");
        assert!(store.list().is_empty());
    }

    #[test]
    fn created_proxies_survive_a_reopen() {
        let file = TempFile::new("persist");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        let created = store
            .create("Home exit", "http://user:pass@host.example:8080", Some("de"))
            .expect("creates");
        assert_eq!(created.id, "home-exit");
        assert_eq!(created.exit_country.as_deref(), Some("DE"));
        drop(store);

        let reopened = ProxyStore::open(file.path()).expect("reopens");
        assert_eq!(reopened.list().len(), 1);
        assert_eq!(reopened.list()[0].url, "http://user:pass@host.example:8080");
    }

    #[test]
    fn a_url_the_launcher_would_refuse_is_refused_here() {
        let file = TempFile::new("invalid");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        assert!(store.create("No scheme", "host:8080", None).is_err());
        assert!(
            store
                .create("Bad scheme", "ftp://host:8080", None)
                .is_err()
        );
        assert!(
            store
                .create("Bad port", "http://host:notaport", None)
                .is_err()
        );
        assert!(store.list().is_empty());
    }

    #[test]
    fn an_exit_country_is_normalised_or_refused() {
        let file = TempFile::new("country");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        let created = store
            .create("Loose", "socks5://host:1080", Some(" de "))
            .expect("normalises");
        assert_eq!(created.exit_country.as_deref(), Some("DE"));

        let empty = store
            .create("None", "socks5://host:1080", Some("  "))
            .expect("blank means unset");
        assert_eq!(empty.exit_country, None);

        assert!(store.create("Three", "socks5://host:1080", Some("DEU")).is_err());
        assert!(store.create("Digits", "socks5://host:1080", Some("42")).is_err());
    }

    #[test]
    fn two_names_that_slug_alike_get_different_ids() {
        let file = TempFile::new("ids");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        let first = store.create("My Proxy", "http://a:80", None).expect("first");
        let second = store.create("My Proxy!", "http://b:80", None).expect("second");
        assert_eq!(first.id, "my-proxy");
        assert_eq!(second.id, "my-proxy-2");
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn renaming_keeps_the_id_and_a_url_change_drops_the_receipt() {
        let file = TempFile::new("update");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        let created = store
            .create("Old", "http://a:80", None)
            .expect("creates");
        store
            .set_check(
                &created.id,
                ProxyCheck {
                    ok: true,
                    ip: Some("203.0.113.9".into()),
                    country: Some("DE".into()),
                    city: None,
                    error: None,
                    latency_ms: 42,
                    checked_at: 1,
                },
            )
            .expect("records");

        let renamed = store
            .update(&created.id, "New name", "http://a:80", None)
            .expect("same route keeps the receipt");
        assert_eq!(renamed.id, created.id);
        assert_eq!(renamed.last_check.as_ref().map(|check| check.ip.as_deref()), Some(Some("203.0.113.9")));

        let moved = store
            .update(&created.id, "New name", "http://b:80", None)
            .expect("new route");
        assert_eq!(moved.last_check, None);
    }

    #[test]
    fn deleting_reports_whether_anything_was_there() {
        let file = TempFile::new("delete");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        let created = store.create("Gone soon", "http://a:80", None).expect("creates");
        assert!(store.delete(&created.id).expect("removes"));
        assert!(!store.delete(&created.id).expect("reports absence"));
        assert!(store.list().is_empty());

        let reopened = ProxyStore::open(file.path()).expect("reopens");
        assert!(reopened.list().is_empty());
    }

    #[test]
    fn the_file_carries_its_format_and_never_the_credential() {
        let file = TempFile::new("format");
        let mut store = ProxyStore::open(file.path()).expect("opens");
        store
            .create("Seam", "http://user:seam-pass@host:80", None)
            .expect("creates");

        let text = std::fs::read_to_string(file.path()).expect("readable");
        #[cfg(windows)]
        assert!(
            !text.contains("seam-pass"),
            "a store save leaked its credential to the disk: {text}"
        );

        let bytes = seal::read_store(file.path())
            .expect("readable")
            .expect("present");
        let parsed: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
        assert_eq!(parsed["format"], 1);
        assert!(parsed["proxies"].is_array());
    }

    #[test]
    fn a_name_from_punctuation_alone_still_gets_an_id() {
        assert_eq!(slug("!!!"), "proxy");
        assert_eq!(slug("  Foo   Bar  "), "foo-bar");
        assert_eq!(slug("2024 exit"), "2024-exit");
    }
}
