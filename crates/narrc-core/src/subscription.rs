//! The stored subscription list.
//!
//! # What lives here
//!
//! A subscription is a URL a proxy core fetches and turns into a set of nodes.
//! This module stores only what the user typed — a name and a URL — and when it
//! was last refreshed. It is a small JSON file beside the profile store
//! (`subscriptions.json`), written atomically and read whole on open.
//!
//! # What is deliberately not here
//!
//! The nodes themselves. They are produced by the core (Mihomo), which is the
//! only thing that can actually use them, and a stored copy would be a second
//! source of truth that goes stale the moment the provider changes a node. The
//! list is read live from the core, and this module never parses a share link,
//! never speaks a protocol, and never touches the network.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::proxy_store::slug_with;
use crate::seal;

/// The on-disk format version of the subscription file.
const SUBSCRIPTION_FORMAT: u32 = 1;

/// The longest name a subscription may have, mirroring a profile's bound.
const MAX_NAME: usize = 120;

/// One subscription in the list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredSubscription {
    /// Stable id; not derived from the name, so a rename keeps assignments.
    pub id: String,
    /// The user's name for it.
    pub name: String,
    /// The URL the core fetches.
    pub url: String,
    /// Unix seconds of the last successful refresh, when one has run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
}

impl StoredSubscription {
    /// The name the core knows this subscription by.
    ///
    /// Prefixed so a subscription can never collide with a node or group name
    /// in the generated configuration.
    pub fn provider_name(&self) -> String {
        format!("sub-{}", self.id)
    }
}

/// The file envelope, so a future format can be told from a corrupt one.
#[derive(Debug, Serialize, Deserialize)]
struct SubscriptionFile {
    format: u32,
    subscriptions: Vec<StoredSubscription>,
}

/// The subscription list, loaded whole.
pub struct SubscriptionStore {
    path: PathBuf,
    subscriptions: Vec<StoredSubscription>,
}

impl SubscriptionStore {
    /// Opens the list at `path`, which is created on first save.
    ///
    /// A missing file is an empty list, not an error: nothing stored yet is the
    /// normal state before the user adds a subscription.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let subscriptions = match seal::read_store(&path)? {
            Some(bytes) => {
                let file: SubscriptionFile = serde_json::from_slice(&bytes).map_err(|source| {
                    Error::identity(format!(
                        "{} is not a readable subscription list: {source}",
                        path.display()
                    ))
                })?;
                if file.format > SUBSCRIPTION_FORMAT {
                    return Err(Error::identity(format!(
                        "{} was written by a newer version of NarciPHBrowser (format {}, this build \
                         understands {}); upgrade rather than letting it be rewritten",
                        path.display(),
                        file.format,
                        SUBSCRIPTION_FORMAT
                    )));
                }
                file.subscriptions
            }
            None => Vec::new(),
        };
        Ok(Self { path, subscriptions })
    }

    /// Every stored subscription, in insertion order.
    pub fn list(&self) -> &[StoredSubscription] {
        &self.subscriptions
    }

    /// One subscription by id, or `None`.
    pub fn get(&self, id: &str) -> Option<&StoredSubscription> {
        self.subscriptions.iter().find(|entry| entry.id == id)
    }

    /// Adds a subscription, validated, and writes the list.
    pub fn create(&mut self, name: &str, url: &str) -> Result<StoredSubscription> {
        let (name, url) = checked(name, url)?;
        let id = self.free_id(&name);
        let stored = StoredSubscription {
            id,
            name,
            url,
            updated_at: None,
        };
        self.subscriptions.push(stored.clone());
        self.save()?;
        Ok(stored)
    }

    /// Replaces a subscription's name and URL, keeping its id.
    pub fn update(&mut self, id: &str, name: &str, url: &str) -> Result<StoredSubscription> {
        let (name, url) = checked(name, url)?;
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        let stored = StoredSubscription {
            id: id.to_owned(),
            name,
            url,
            updated_at: self.subscriptions[index].updated_at,
        };
        self.subscriptions[index] = stored.clone();
        self.save()?;
        Ok(stored)
    }

    /// Records a successful refresh, and writes the list.
    pub fn touch(&mut self, id: &str, at: u64) -> Result<StoredSubscription> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        let mut stored = self.subscriptions[index].clone();
        stored.updated_at = Some(at);
        self.subscriptions[index] = stored.clone();
        self.save()?;
        Ok(stored)
    }

    /// Removes a subscription, reporting whether one was there.
    pub fn delete(&mut self, id: &str) -> Result<bool> {
        let before = self.subscriptions.len();
        self.subscriptions.retain(|entry| entry.id != id);
        if self.subscriptions.len() == before {
            return Ok(false);
        }
        self.save()?;
        Ok(true)
    }

    /// An id derived from the name, unique within this list.
    fn free_id(&self, name: &str) -> String {
        let base = slug_with(name, "sub");
        if !self.subscriptions.iter().any(|entry| entry.id == base) {
            return base;
        }
        for suffix in 2..10_000u32 {
            let candidate = format!("{base}-{suffix}");
            if !self.subscriptions.iter().any(|entry| entry.id == candidate) {
                return candidate;
            }
        }
        format!("{base}-{}", self.subscriptions.len())
    }

    /// Writes the list, replacing any previous version of it.
    ///
    /// Written sealed — a subscription URL is a bearer credential — and
    /// atomically: a crash halfway through a write must not leave a list that
    /// parses as truncated JSON.
    fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|source| {
                    Error::environment(format!("could not create {}: {source}", parent.display()))
                })?;
            }
        }
        let file = SubscriptionFile {
            format: SUBSCRIPTION_FORMAT,
            subscriptions: self.subscriptions.clone(),
        };
        let json = serde_json::to_string_pretty(&file)?;
        seal::write_store(&self.path, json.as_bytes())
    }
}

/// Validates the fields of a subscription.
fn checked(name: &str, url: &str) -> Result<(String, String)> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::identity("a subscription needs a name"));
    }
    if name.len() > MAX_NAME {
        return Err(Error::identity(format!(
            "a name of {} characters is not a name",
            name.len()
        )));
    }
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(Error::identity(
            "a subscription URL must start with http:// or https://",
        ));
    }
    if url.len() > 2048 {
        return Err(Error::identity("that subscription URL is unreasonably long"));
    }
    Ok((name.to_owned(), url.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A path no other test will touch, removed on drop.
    struct TempFile(PathBuf);

    impl TempFile {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "narrc-sub-test-{name}-{}-{}.json",
                std::process::id(),
                unique()
            ));
            let _ = std::fs::remove_file(&path);
            Self(path)
        }
    }

    impl Drop for TempFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn unique() -> u64 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        NEXT.fetch_add(1, Ordering::Relaxed)
    }

    #[test]
    fn a_subscription_survives_a_reopen() {
        let file = TempFile::new("persist");
        let created = {
            let mut store = SubscriptionStore::open(&file.0).unwrap();
            store
                .create("Airport", "https://example.com/sub?token=abc")
                .unwrap()
        };
        let store = SubscriptionStore::open(&file.0).unwrap();
        assert_eq!(store.list().len(), 1);
        let reloaded = store.get(&created.id).unwrap();
        assert_eq!(reloaded.name, "Airport");
        assert_eq!(reloaded.url, "https://example.com/sub?token=abc");
        assert_eq!(reloaded.updated_at, None);
    }

    #[test]
    fn a_non_http_url_is_refused() {
        let file = TempFile::new("url");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        assert!(store.create("Bad", "ftp://example.com/sub").is_err());
        assert!(store.create("Bad", "example.com/sub").is_err());
        assert!(store.create("", "https://example.com/sub").is_err());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn ids_are_unique_and_derived_from_the_name() {
        let file = TempFile::new("ids");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let first = store.create("Airport", "https://a.example/sub").unwrap();
        let second = store.create("Airport", "https://b.example/sub").unwrap();
        assert_eq!(first.id, "airport");
        assert_eq!(second.id, "airport-2");
        assert_eq!(first.provider_name(), "sub-airport");
    }

    #[test]
    fn a_rename_keeps_the_id() {
        let file = TempFile::new("rename");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let created = store.create("Old", "https://a.example/sub").unwrap();
        let updated = store.update(&created.id, "New", "https://a.example/sub").unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name, "New");
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn touch_records_the_refresh_time() {
        let file = TempFile::new("touch");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let created = store.create("Airport", "https://a.example/sub").unwrap();
        let touched = store.touch(&created.id, 1_700_000_000).unwrap();
        assert_eq!(touched.updated_at, Some(1_700_000_000));
        let reloaded = SubscriptionStore::open(&file.0).unwrap();
        assert_eq!(reloaded.get(&created.id).unwrap().updated_at, Some(1_700_000_000));
    }

    #[test]
    fn delete_reports_whether_one_was_there() {
        let file = TempFile::new("delete");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let created = store.create("Airport", "https://a.example/sub").unwrap();
        assert!(store.delete(&created.id).unwrap());
        assert!(!store.delete(&created.id).unwrap());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn a_newer_format_is_refused_rather_than_rewritten() {
        let file = TempFile::new("format");
        std::fs::write(
            &file.0,
            br#"{"format":99,"subscriptions":[]}"#,
        )
        .unwrap();
        assert!(SubscriptionStore::open(&file.0).is_err());
    }
}
