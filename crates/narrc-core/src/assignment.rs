//! The stored node assignments.
//!
//! # What lives here
//!
//! An assignment says "this profile routes through this node of this
//! subscription". It is the link between a profile and a subscription node,
//! stored beside the profiles so it survives a restart.
//!
//! # What is deliberately not here
//!
//! The assignment stores only ids and a node name — never a resolved local
//! port. A port is handed out by the proxy core when the profile launches and
//! is gone when its browser closes, so storing one would be storing a value
//! that is wrong the moment the browser stops.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// The on-disk format version of the assignment file.
const ASSIGNMENT_FORMAT: u32 = 1;

/// One profile's route through a subscription node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Assignment {
    /// The profile being routed.
    pub profile_id: String,
    /// The subscription the node belongs to.
    pub subscription_id: String,
    /// The node's name within that subscription.
    pub node: String,
}

/// The file envelope, so a future format can be told from a corrupt one.
#[derive(Debug, Serialize, Deserialize)]
struct AssignmentFile {
    format: u32,
    assignments: Vec<Assignment>,
}

/// The assignment list, loaded whole.
pub struct AssignmentStore {
    path: PathBuf,
    assignments: Vec<Assignment>,
}

impl AssignmentStore {
    /// Opens the list at `path`, which is created on first save.
    ///
    /// A missing file is an empty list, not an error.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let assignments = if path.exists() {
            let bytes = std::fs::read(&path).map_err(|source| {
                Error::environment(format!("could not read {}: {source}", path.display()))
            })?;
            let file: AssignmentFile = serde_json::from_slice(&bytes).map_err(|source| {
                Error::identity(format!(
                    "{} is not a readable assignment list: {source}",
                    path.display()
                ))
            })?;
            if file.format > ASSIGNMENT_FORMAT {
                return Err(Error::identity(format!(
                    "{} was written by a newer version of NarciPHBrowser (format {}, this build \
                     understands {}); upgrade rather than letting it be rewritten",
                    path.display(),
                    file.format,
                    ASSIGNMENT_FORMAT
                )));
            }
            file.assignments
        } else {
            Vec::new()
        };
        Ok(Self { path, assignments })
    }

    /// Every stored assignment, in insertion order.
    pub fn list(&self) -> &[Assignment] {
        &self.assignments
    }

    /// One profile's assignment, or `None`.
    pub fn get(&self, profile_id: &str) -> Option<&Assignment> {
        self.assignments.iter().find(|entry| entry.profile_id == profile_id)
    }

    /// Sets a profile's assignment, replacing any it already had.
    pub fn set(
        &mut self,
        profile_id: &str,
        subscription_id: &str,
        node: &str,
    ) -> Result<Assignment> {
        let profile_id = profile_id.trim();
        let subscription_id = subscription_id.trim();
        let node = node.trim();
        if profile_id.is_empty() || subscription_id.is_empty() || node.is_empty() {
            return Err(Error::identity(
                "an assignment needs a profile, a subscription and a node",
            ));
        }
        let assignment = Assignment {
            profile_id: profile_id.to_owned(),
            subscription_id: subscription_id.to_owned(),
            node: node.to_owned(),
        };
        match self
            .assignments
            .iter_mut()
            .find(|entry| entry.profile_id == profile_id)
        {
            Some(existing) => *existing = assignment.clone(),
            None => self.assignments.push(assignment.clone()),
        }
        self.save()?;
        Ok(assignment)
    }

    /// Removes a profile's assignment, reporting whether one was there.
    pub fn remove(&mut self, profile_id: &str) -> Result<bool> {
        let before = self.assignments.len();
        self.assignments.retain(|entry| entry.profile_id != profile_id);
        if self.assignments.len() == before {
            return Ok(false);
        }
        self.save()?;
        Ok(true)
    }

    /// Removes every assignment pointing at a subscription, reporting how many.
    ///
    /// Called when a subscription is deleted, so no profile is left pointing at
    /// a provider that no longer exists.
    pub fn remove_by_subscription(&mut self, subscription_id: &str) -> Result<usize> {
        let before = self.assignments.len();
        self.assignments
            .retain(|entry| entry.subscription_id != subscription_id);
        let removed = before - self.assignments.len();
        if removed > 0 {
            self.save()?;
        }
        Ok(removed)
    }

    /// Writes the list, replacing any previous version of it.
    fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|source| {
                    Error::environment(format!("could not create {}: {source}", parent.display()))
                })?;
            }
        }
        let file = AssignmentFile {
            format: ASSIGNMENT_FORMAT,
            assignments: self.assignments.clone(),
        };
        let json = serde_json::to_string_pretty(&file)?;
        let temp = temp_path(&self.path);
        std::fs::write(&temp, json.as_bytes()).map_err(|source| {
            Error::environment(format!("could not write {}: {source}", temp.display()))
        })?;
        std::fs::rename(&temp, &self.path).map_err(|source| {
            Error::environment(format!(
                "could not replace {}: {source}",
                self.path.display()
            ))
        })?;
        Ok(())
    }
}

/// The temp file a save writes before it renames.
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "assignments.json".into());
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A path no other test will touch, removed on drop.
    struct TempFile(PathBuf);

    impl TempFile {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "narrc-assign-test-{name}-{}-{}.json",
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
    fn an_assignment_survives_a_reopen() {
        let file = TempFile::new("persist");
        let made = {
            let mut store = AssignmentStore::open(&file.0).unwrap();
            store.set("profile-1", "sub-1", "Node A").unwrap()
        };
        let store = AssignmentStore::open(&file.0).unwrap();
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.get("profile-1").unwrap().node, "Node A");
        assert_eq!(made.profile_id, "profile-1");
    }

    #[test]
    fn setting_twice_replaces_rather_than_duplicates() {
        let file = TempFile::new("upsert");
        let mut store = AssignmentStore::open(&file.0).unwrap();
        store.set("p", "s1", "Node A").unwrap();
        store.set("p", "s2", "Node B").unwrap();
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.get("p").unwrap().subscription_id, "s2");
    }

    #[test]
    fn remove_reports_whether_one_was_there() {
        let file = TempFile::new("remove");
        let mut store = AssignmentStore::open(&file.0).unwrap();
        store.set("p", "s", "Node A").unwrap();
        assert!(store.remove("p").unwrap());
        assert!(!store.remove("p").unwrap());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn remove_by_subscription_clears_its_profiles() {
        let file = TempFile::new("bysub");
        let mut store = AssignmentStore::open(&file.0).unwrap();
        store.set("p1", "s1", "Node A").unwrap();
        store.set("p2", "s1", "Node B").unwrap();
        store.set("p3", "s2", "Node C").unwrap();
        assert_eq!(store.remove_by_subscription("s1").unwrap(), 2);
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.get("p3").unwrap().subscription_id, "s2");
    }

    #[test]
    fn an_empty_field_is_refused() {
        let file = TempFile::new("empty");
        let mut store = AssignmentStore::open(&file.0).unwrap();
        assert!(store.set("", "s", "Node A").is_err());
        assert!(store.set("p", "", "Node A").is_err());
        assert!(store.set("p", "s", "").is_err());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn a_newer_format_is_refused_rather_than_rewritten() {
        let file = TempFile::new("format");
        std::fs::write(&file.0, br#"{"format":99,"assignments":[]}"#).unwrap();
        assert!(AssignmentStore::open(&file.0).is_err());
    }
}
