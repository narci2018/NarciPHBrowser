//! The stored profile groups.
//!
//! # What lives here
//!
//! A group is a name profiles are filed under — "the accounts", "the shop",
//! "warm-up" — so profiles of one purpose can be seen and acted on together.
//! It is a name and nothing else: no icon, no colour, no nesting, because the
//! thing being grouped is a list row and a row has one label's worth of room.
//!
//! # The split between this file and the profile
//!
//! *Membership* lives on the profile (`profile.group`), where it was before
//! groups became an entity — a profile's filing travels with it through export
//! and import that way, and there is no second copy to fall out of step. This
//! store holds the *names that exist*, which is what lets a group be created
//! before it has a single member, renamed in one action rather than once per
//! profile, and deleted even when the profiles it once held are elsewhere.
//!
//! The two are read together at the edge: a name only carried by profiles
//! counts as a group (it is one, to the profiles filed under it), so listing
//! merges both sides and rename and delete touch both. This module stays
//! ignorant of profiles — the coordinating belongs to the commands, which can
//! see the profile store and this one at the same time.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// The on-disk format version of the group file.
const GROUP_FORMAT: u32 = 1;

/// The file envelope, so a future format can be told from a corrupt one.
#[derive(Debug, Serialize, Deserialize)]
struct GroupFile {
    format: u32,
    groups: Vec<String>,
}

/// The group name list, loaded whole.
pub struct GroupStore {
    path: PathBuf,
    groups: Vec<String>,
}

impl GroupStore {
    /// Opens the list at `path`, which is created on first save.
    ///
    /// A missing file is an empty list, not an error.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let groups = if path.exists() {
            let bytes = std::fs::read(&path).map_err(|source| {
                Error::environment(format!("could not read {}: {source}", path.display()))
            })?;
            let file: GroupFile = serde_json::from_slice(&bytes).map_err(|source| {
                Error::identity(format!(
                    "{} is not a readable group list: {source}",
                    path.display()
                ))
            })?;
            if file.format > GROUP_FORMAT {
                return Err(Error::identity(format!(
                    "{} was written by a newer version of NarciPHBrowser (format {}, this build \
                     understands {}); upgrade rather than letting it be rewritten",
                    path.display(),
                    file.format,
                    GROUP_FORMAT
                )));
            }
            file.groups
        } else {
            Vec::new()
        };
        Ok(Self { path, groups })
    }

    /// Every stored name, in insertion order.
    pub fn list(&self) -> &[String] {
        &self.groups
    }

    /// Whether a name is already a group here.
    pub fn contains(&self, name: &str) -> bool {
        self.groups.iter().any(|entry| entry == name)
    }

    /// Adds a name, refusing an empty one or a second of the same.
    ///
    /// Refusing the duplicate rather than treating create as an upsert keeps
    /// the button's meaning honest: it says "new group", and a name that
    /// exists is not one.
    pub fn create(&mut self, name: &str) -> Result<String> {
        let name = checked_name(name)?;
        if self.contains(name) {
            return Err(Error::identity(format!(
                "a group named {name:?} already exists"
            )));
        }
        self.groups.push(name.to_owned());
        self.save()?;
        Ok(name.to_owned())
    }

    /// Renames a name in place, reporting whether it was there.
    ///
    /// `Ok(false)` means no such group — the caller decides whether that is an
    /// error, because the name may exist on profiles alone and the store is
    /// only one of the two places it can be found.
    pub fn rename(&mut self, from: &str, to: &str) -> Result<bool> {
        let from = from.trim();
        let to = checked_name(to)?;
        if from == to {
            return Ok(self.contains(from));
        }
        let Some(index) = self.groups.iter().position(|entry| entry == from) else {
            return Ok(false);
        };
        if self.contains(to) {
            return Err(Error::identity(format!(
                "a group named {to:?} already exists"
            )));
        }
        self.groups[index] = to.to_owned();
        self.save()?;
        Ok(true)
    }

    /// Removes a name, reporting whether it was there.
    pub fn remove(&mut self, name: &str) -> Result<bool> {
        let name = name.trim();
        let before = self.groups.len();
        self.groups.retain(|entry| entry != name);
        if self.groups.len() == before {
            return Ok(false);
        }
        self.save()?;
        Ok(true)
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
        let file = GroupFile {
            format: GROUP_FORMAT,
            groups: self.groups.clone(),
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

/// A name a group may be called: trimmed, and never nothing.
///
/// Whitespace is trimmed for the same reason `set_group` trims it — the value
/// arrives from an input, and `"  Work"` must not become a second group next
/// to `Work`.
fn checked_name(name: &str) -> Result<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::identity("a group needs a name"));
    }
    Ok(name)
}

/// The temp file a save writes before it renames.
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "groups.json".into());
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
                "narrc-group-test-{name}-{}-{}.json",
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
    fn a_group_survives_a_reopen() {
        let file = TempFile::new("persist");
        {
            let mut store = GroupStore::open(&file.0).unwrap();
            store.create("Accounts").unwrap();
            assert_eq!(store.list(), ["Accounts"]);
        }
        let store = GroupStore::open(&file.0).unwrap();
        assert_eq!(store.list(), ["Accounts"]);
        assert!(store.contains("Accounts"));
    }

    #[test]
    fn a_name_is_trimmed_and_a_blank_one_refused() {
        let file = TempFile::new("trim");
        let mut store = GroupStore::open(&file.0).unwrap();
        assert_eq!(store.create("  Shop  ").unwrap(), "Shop");
        assert!(store.create("   ").is_err());
        // The store is unchanged by the refusal, not left half-written.
        assert_eq!(store.list(), ["Shop"]);
    }

    #[test]
    fn a_second_of_the_same_name_is_refused() {
        let file = TempFile::new("dup");
        let mut store = GroupStore::open(&file.0).unwrap();
        store.create("Shop").unwrap();
        assert!(store.create("Shop").is_err());
        assert!(store.create("  Shop ").is_err());
        assert_eq!(store.list(), ["Shop"]);
    }

    #[test]
    fn a_rename_changes_the_name_in_place() {
        let file = TempFile::new("rename");
        let mut store = GroupStore::open(&file.0).unwrap();
        store.create("Accounts").unwrap();
        store.create("Shop").unwrap();
        assert!(store.rename("Accounts", "Logins").unwrap());
        // The order is kept: a rename is a rename, not a reorder.
        assert_eq!(store.list(), ["Logins", "Shop"]);
        assert!(store.rename("Logins", "  Logins  ").unwrap());
        assert_eq!(store.list(), ["Logins", "Shop"]);
    }

    #[test]
    fn a_rename_onto_an_existing_name_is_refused() {
        let file = TempFile::new("renamedup");
        let mut store = GroupStore::open(&file.0).unwrap();
        store.create("Accounts").unwrap();
        store.create("Shop").unwrap();
        assert!(store.rename("Shop", "Accounts").is_err());
        assert_eq!(store.list(), ["Accounts", "Shop"]);
        assert!(store.rename("Shop", "  ").is_err());
        assert_eq!(store.list(), ["Accounts", "Shop"]);
    }

    #[test]
    fn renaming_a_name_the_store_lacks_reads_as_absent_not_failed() {
        let file = TempFile::new("renamemissing");
        let mut store = GroupStore::open(&file.0).unwrap();
        store.create("Accounts").unwrap();
        // Absent here is a legitimate answer: the name may live on profiles,
        // and the caller asks both places.
        assert!(!store.rename("Nope", "Whatever").unwrap());
        assert_eq!(store.list(), ["Accounts"]);
        // Renaming a name to itself is likewise just a membership question.
        assert!(store.rename("Accounts", "Accounts").unwrap());
        assert!(!store.rename("Nope", "Nope").unwrap());
    }

    #[test]
    fn remove_reports_whether_one_was_there() {
        let file = TempFile::new("remove");
        let mut store = GroupStore::open(&file.0).unwrap();
        store.create("Shop").unwrap();
        assert!(store.remove("Shop").unwrap());
        assert!(!store.remove("Shop").unwrap());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn a_newer_format_is_refused_rather_than_rewritten() {
        let file = TempFile::new("format");
        std::fs::write(&file.0, br#"{"format":99,"groups":[]}"#).unwrap();
        assert!(GroupStore::open(&file.0).is_err());
    }
}
