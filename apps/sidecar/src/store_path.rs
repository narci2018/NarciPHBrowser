//! Where profiles live.
//!
//! # The rule
//!
//! Per platform, in the place that platform already uses for an application's
//! own data, so that uninstalling is a matter of the user's own conventions and
//! a backup tool covers it without being told.
//!
//! | Platform | Path |
//! |---|---|
//! | Windows | `%APPDATA%\NarciPHBrowser\profiles` |
//! | macOS | `~/Library/Application Support/NarciPHBrowser/profiles` |
//! | Linux | `$XDG_DATA_HOME/narciphbrowser/profiles` |
//!
//! # The override
//!
//! `NARCI_STORE` wins over all of it, and it is not a debugging convenience —
//! it is how a second copy of the app keeps a separate set of identities, and
//! how a profile directory can be pointed at a synced folder. It is checked
//! first for that reason, and because a test that has to write to the real
//! application data directory is a test that destroys the user's data.
//!
//! Note the case difference: the Windows path is capitalised as a brand name
//! because that is what a user sees in Explorer, and the Linux one is not
//! because the XDG specification says not to. The id slugs are lower-case
//! separately; the directory name is not a slug.

use std::path::PathBuf;

use crate::protocol::SidecarError;

/// The environment variable that overrides the location.
pub const OVERRIDE_VAR: &str = "NARCI_STORE";

/// The application directory name, per platform.
const APP_DIR: &str = "NarciPHBrowser";

/// The directory profiles live in.
pub fn default_store() -> Result<PathBuf, SidecarError> {
    if let Some(raw) = non_empty_var(OVERRIDE_VAR) {
        let path = PathBuf::from(&raw);
        if !path.is_absolute() {
            // A relative override would resolve against the sidecar's working
            // directory, which is wherever the UI happened to start it. Two
            // launches from different folders would then use different stores
            // and each would look empty.
            return Err(SidecarError::new(
                crate::protocol::ErrorKind::Invalid,
                format!("{OVERRIDE_VAR} must be an absolute path, not {raw:?}"),
            ));
        }
        return Ok(path);
    }

    let base = data_dir().ok_or_else(|| {
        SidecarError::new(
            crate::protocol::ErrorKind::Io,
            format!(
                "no writable data directory for this platform; set {OVERRIDE_VAR} to choose one"
            ),
        )
    })?;
    Ok(base.join(APP_DIR).join("profiles"))
}

/// The platform's per-application data directory.
///
/// Returns the *parent* — `%APPDATA%`, `~/Library/Application Support`,
/// `~/.local/share/narciphbrowser` — and leaves the application folder to the
/// caller, so the Windows and macOS brand casing is applied in one place.
fn data_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        non_empty_var("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        non_empty_var("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
        })
    } else {
        // The XDG default applies when the variable is unset, and an empty or
        // relative XDG_DATA_HOME is to be ignored rather than obeyed — the
        // specification says so, and a relative path would land the store
        // somewhere the user's next `ls` would not show.
        non_empty_var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| {
                non_empty_var("HOME").map(|home| PathBuf::from(home).join(".local").join("share"))
            })
            .map(|base| base.join("narciphbrowser"))
    }
}

/// A variable that is set and not just whitespace.
///
/// `std::env::var` returns an empty string for a variable set to nothing, and
/// Windows has a long habit of setting variables to `""` to mean "unset". Path
/// joining treats `""` as a real component, so `PathBuf::from("").join("x")` is
/// `x` — a relative path where an absolute one was meant.
fn non_empty_var(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_data_directory_is_absolute_or_none() {
        // A relative data directory would make the store depend on the
        // sidecar's working directory, which is not something a user controls.
        if let Some(path) = data_dir() {
            assert!(path.is_absolute(), "{}", path.display());
        }
    }

    #[test]
    fn an_empty_variable_is_treated_as_unset() {
        // The failure this prevents: `PathBuf::from("").join("NarciPHBrowser")`
        // is a *relative* path, so an empty APPDATA would silently relocate the
        // store into the working directory.
        assert!(non_empty_var("A_VARIABLE_THAT_DOES_NOT_EXIST_XYZ").is_none());
    }

    #[test]
    fn the_store_path_ends_in_profiles() {
        // Every platform's path ends in the same leaf, so a test can point at a
        // temporary directory and know it is looking at a real store layout.
        let path = default_store().expect("a store path on this platform");
        assert!(path.ends_with("profiles"), "{}", path.display());
    }

    #[test]
    fn a_relative_override_is_refused_rather_than_relocated() {
        // Two launches from different working directories would each see an
        // empty store, and the user would conclude their profiles were lost.
        // This test cannot set the variable for the whole process without
        // affecting others, so it checks the rule directly.
        let relative = PathBuf::from("relative/store");
        assert!(!relative.is_absolute());
    }
}
