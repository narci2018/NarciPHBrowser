//! The stored subscription list.
//!
//! # What lives here
//!
//! A subscription is a URL a proxy core fetches and turns into a set of nodes.
//! This module stores what the user typed — a name and a URL — when it was
//! last refreshed, and the newest run's outcome for each of its nodes: latency
//! (milliseconds), download speed (megabits per second, or `null` when the
//! exit is alive but bandwidth-capped), and exit country (when the echo probe
//! could resolve one). Only the latest run of each kind is kept — a new test
//! replaces the map wholesale, so the dialog always shows one number per node.
//!
//! # What is deliberately not here
//!
//! The nodes themselves. They are produced by the core (Mihomo), which is the
//! only thing that can actually use them, and a stored copy would be a second
//! source of truth that goes stale the moment the provider changes a node. The
//! list is read live from the core, and this module never parses a share link,
//! never speaks a protocol, and never touches the network. What is stored is
//! only the measured delay per node name — a number the dialog would otherwise
//! lose whenever the core restarts — and only the latest run of them, never a
//! history.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::proxy_store::slug_with;
use crate::seal;

/// The on-disk format version of the subscription file.
const SUBSCRIPTION_FORMAT: u32 = 2;

pub const BUILTIN_PSIPHON_ID: &str = "builtin-psiphon";
pub const BUILTIN_VPNGATE_ID: &str = "builtin-vpngate";
pub const BUILTIN_MEGAV_ID: &str = "builtin-megav";

pub fn is_builtin_subscription(id: &str) -> bool {
    id == BUILTIN_PSIPHON_ID || id == BUILTIN_VPNGATE_ID || id == BUILTIN_MEGAV_ID
}

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
    /// The newest latency run's outcome per node name, in milliseconds.
    ///
    /// `null` marks a node that run failed to measure; a name absent from the
    /// map was not part of it. Only the latest run is kept — a test replaces
    /// the map wholesale — because the dialog shows one number per node, and a
    /// history of them would be a second source of truth for a value that
    /// changes every run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delays: Option<HashMap<String, Option<u32>>>,
    /// The newest speed run's outcome per node name, in megabits per second.
    ///
    /// `Some(0.0)` is a measured rate; `None` means the exit is alive but
    /// bandwidth could not be measured (e.g. a VLESS-WSS node whose websocket
    /// path only accepts the origin site). A missing name was not part of the
    /// run. Only the latest run is kept.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speeds: Option<HashMap<String, Option<f64>>>,
    /// The newest exit run's outcome per node name.
    ///
    /// `null` marks a node the echo probe could not resolve; a missing name
    /// was not part of the run. Only the latest run is kept.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exits: Option<HashMap<String, Option<String>>>,
}

impl StoredSubscription {
    /// The name the core knows this subscription by.
    ///
    /// Prefixed so a subscription can never collide with a node or group name
    /// in the generated configuration.
    pub fn provider_name(&self) -> String {
        format!("sub-{}", self.id)
    }

    /// The select group holding exactly this subscription's nodes.
    ///
    /// A latency batch tests one group at a time, and the group must be this
    /// narrow: testing the shared speed group would measure every
    /// subscription's nodes at once, and that contention — hundreds of dials
    /// and DNS lookups racing each other — would show up in the numbers as
    /// inflated delays and spurious timeouts.
    pub fn node_group_name(&self) -> String {
        format!("nodes-{}", self.id)
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

    /// Ensures the three special built-in subscriptions (Psiphon, VPNGate, MegaV) exist.
    pub fn ensure_builtins(&mut self) -> Result<()> {
        let builtins = [
            (
                BUILTIN_PSIPHON_ID,
                "Psiphon",
                "https://raw.githubusercontent.com/vpngate-or-provider/psiphon/main/sub.yaml",
            ),
            (
                BUILTIN_VPNGATE_ID,
                "VPNGate",
                "https://www.vpngate.net/api/iphone/",
            ),
            (
                BUILTIN_MEGAV_ID,
                "MegaV",
                "https://raw.githubusercontent.com/Romaxa55/MegaV_Public/main/sub.yaml",
            ),
        ];
        let mut changed = false;
        for (id, name, url) in builtins {
            if !self.subscriptions.iter().any(|entry| entry.id == id) {
                self.subscriptions.push(StoredSubscription {
                    id: id.to_owned(),
                    name: name.to_owned(),
                    url: url.to_owned(),
                    updated_at: None,
                    delays: None,
                    speeds: None,
                    exits: None,
                });
                changed = true;
            }
        }
        if changed {
            self.save()?;
        }
        Ok(())
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
            delays: None,
            speeds: None,
            exits: None,
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
        let previous = &self.subscriptions[index];
        // A new URL is a new list of nodes: measurements kept across it would
        // claim to describe names that happen to repeat.
        let delays = if previous.url == url {
            previous.delays.clone()
        } else {
            None
        };
        let stored = StoredSubscription {
            id: id.to_owned(),
            name,
            url,
            updated_at: previous.updated_at,
            delays,
            speeds: None,
            exits: None,
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

    /// Records one node's outcome in the latest latency run, and writes the
    /// list.
    ///
    /// `Some(ms)` is a measurement; `None` is a run that failed to measure the
    /// node. The failure is recorded rather than dropped, so reopening the
    /// dialog shows it instead of a number an older run left behind.
    pub fn set_delay(&mut self, id: &str, node: &str, delay: Option<u32>) -> Result<()> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        let entry = self.subscriptions[index]
            .delays
            .get_or_insert_with(HashMap::new);
        entry.insert(node.to_owned(), delay);
        self.save()
    }

    /// Replaces the latest latency run wholesale, and writes the list.
    ///
    /// One test stores its whole snapshot at once — successes as milliseconds,
    /// failures as `null` — so nothing from a previous run survives it: what
    /// the dialog shows is always the newest test, and only that.
    pub fn set_delays(&mut self, id: &str, delays: HashMap<String, Option<u32>>) -> Result<()> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        self.subscriptions[index].delays = if delays.is_empty() {
            None
        } else {
            Some(delays)
        };
        self.save()
    }

    /// Records one node's speed in the latest run, and writes the list.
    ///
    /// `Some(mbps)` is a measurement; `None` is a run that could not measure
    /// bandwidth through the exit (alive but capped). The failure is recorded
    /// rather than dropped so reopening the dialog shows it instead of a number
    /// an older run left behind.
    pub fn set_speed(&mut self, id: &str, node: &str, speed: Option<f64>) -> Result<()> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        let entry = self.subscriptions[index]
            .speeds
            .get_or_insert_with(HashMap::new);
        entry.insert(node.to_owned(), speed);
        self.save()
    }

    /// Replaces the latest speed run wholesale, and writes the list.
    pub fn set_speeds(&mut self, id: &str, speeds: HashMap<String, Option<f64>>) -> Result<()> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        self.subscriptions[index].speeds = if speeds.is_empty() {
            None
        } else {
            Some(speeds)
        };
        self.save()
    }

    /// Records one node's exit country in the latest run, and writes the list.
    ///
    /// `Some(country)` is a two-letter code; `None` means the echo probe could
    /// not resolve a country. A missing name was not part of the run.
    pub fn set_exit(&mut self, id: &str, node: &str, country: Option<String>) -> Result<()> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        let entry = self.subscriptions[index]
            .exits
            .get_or_insert_with(HashMap::new);
        entry.insert(node.to_owned(), country);
        self.save()
    }

    /// Replaces the latest exit run wholesale, and writes the list.
    pub fn set_exits(&mut self, id: &str, exits: HashMap<String, Option<String>>) -> Result<()> {
        let index = self
            .subscriptions
            .iter()
            .position(|entry| entry.id == id)
            .ok_or_else(|| Error::identity(format!("no subscription with the id {id:?}")))?;
        self.subscriptions[index].exits = if exits.is_empty() {
            None
        } else {
            Some(exits)
        };
        self.save()
    }

    /// Removes a subscription, reporting whether one was there.
    pub fn delete(&mut self, id: &str) -> Result<bool> {
        if is_builtin_subscription(id) {
            return Err(Error::identity("builtin subscriptions cannot be deleted"));
        }
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
    fn a_latency_run_replaces_the_previous_one_wholesale() {
        let file = TempFile::new("latency-run");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let created = store.create("Airport", "https://example.com/sub").unwrap();
        let first: HashMap<String, Option<u32>> =
            HashMap::from([("a".to_owned(), Some(120)), ("b".to_owned(), None)]);
        store.set_delays(&created.id, first).unwrap();
        let second: HashMap<String, Option<u32>> = HashMap::from([("a".to_owned(), Some(90))]);
        store.set_delays(&created.id, second).unwrap();

        let reloaded = SubscriptionStore::open(&file.0).unwrap();
        let delays = reloaded.get(&created.id).unwrap().delays.as_ref().unwrap();
        assert_eq!(delays.get("a").copied(), Some(Some(90)));
        // The node the newer run did not measure is gone, not left over.
        assert_eq!(delays.get("b"), None);
    }

    #[test]
    fn one_node_measured_keeps_the_rest_of_the_run() {
        let file = TempFile::new("latency-one");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let created = store.create("Airport", "https://example.com/sub").unwrap();
        let run: HashMap<String, Option<u32>> = HashMap::from([
            ("a".to_owned(), Some(100)),
            ("b".to_owned(), None),
            ("c".to_owned(), None),
        ]);
        store.set_delays(&created.id, run).unwrap();

        store.set_delay(&created.id, "c", Some(55)).unwrap();
        store.set_delay(&created.id, "a", None).unwrap();

        let reloaded = SubscriptionStore::open(&file.0).unwrap();
        let delays = reloaded.get(&created.id).unwrap().delays.as_ref().unwrap();
        assert_eq!(delays.get("c").copied(), Some(Some(55)));
        // A node whose run failed is recorded as such, not silently dropped.
        assert_eq!(delays.get("a").copied(), Some(None));
        assert_eq!(delays.get("b").copied(), Some(None));
    }

    #[test]
    fn a_rename_keeps_measurements_and_a_new_url_forgets_them() {
        let file = TempFile::new("latency-url");
        let mut store = SubscriptionStore::open(&file.0).unwrap();
        let created = store.create("Airport", "https://a.example/sub").unwrap();
        store.set_delay(&created.id, "node", Some(120)).unwrap();

        store
            .update(&created.id, "Renamed", "https://a.example/sub")
            .unwrap();
        assert_eq!(
            store
                .get(&created.id)
                .unwrap()
                .delays
                .as_ref()
                .unwrap()
                .get("node")
                .copied(),
            Some(Some(120))
        );

        store
            .update(&created.id, "Renamed", "https://b.example/other")
            .unwrap();
        assert_eq!(store.get(&created.id).unwrap().delays, None);
    }

    #[test]
    fn a_list_written_before_measurements_existed_still_opens() {
        let file = TempFile::new("latency-old");
        std::fs::write(
            &file.0,
            br#"{"format":1,"subscriptions":[{"id":"a","name":"A","url":"https://e.example/s"}]}"#,
        )
        .unwrap();
        let store = SubscriptionStore::open(&file.0).unwrap();
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.list()[0].delays, None);
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
