//! `narrc-core` — fingerprint identities that hold up under inspection.
//!
//! # What this crate is for
//!
//! A browser profile is a claim about a machine: that machine has a graphics
//! card, a display, a keyboard, a set of installed fonts, a place, an audio
//! device and a version of Windows. Websites cross-check those claims against
//! each other, and the failures are cheap to automate and expensive to notice.
//! A profile whose `webGl:renderer` is an AMD card and whose
//! `hardwareConcurrency` is an M-series Mac core count is not a machine; it is
//! a machine *and* its contradiction, both delivered in the same response.
//!
//! So this crate is built around one rule: **draw a machine, then check it.**
//!
//! * [`generator`] draws a whole device from a single seed. It is deterministic
//!   — the same seed always presents the same machine, forever — and it draws
//!   in dependency order, each step reading the previous ones.
//! * [`coherence`] holds the cross-field rules and can both
//!   [validate](coherence::validate) a profile and
//!   [repair](coherence::apply) one that a user has hand-edited into
//!   incoherence.
//! * [`engine`] translates an [`Identity`] into the payload the browser
//!   process actually consumes, chunked to respect the platform's environment
//!   block limit.
//! * [`profile`] stores the *seed* rather than the identity it draws, so an
//!   improved generator makes every existing profile better instead of leaving
//!   them frozen on the code that happened to create them.
//!
//! # The layer above
//!
//! The generator writes *plain data*: strings, numbers, arrays, in a
//! [`serde_json::Map`]. It has no idea whether the process being launched is
//! Firefox, nor how that Firefox is told about the identity. That
//! translation — and only that translation — belongs to [`engine`], which is
//! why the generator can be tested exhaustively without a browser installed and
//! why swapping engines does not invalidate a stored profile.
//!
//! # Determinism, and why it is not negotiable
//!
//! A profile is a long-lived asset. A user who opens an account in March and
//! returns in September must be recognised as the same client, and if the
//! screen height or the GPU changed in between, that is a stronger signal than
//! anything the profile was trying to hide. So:
//!
//! * every draw comes from a *named* sub-stream, [`Rng::stream`], never from one
//!   long shared sequence — adding a field cannot shift every existing value;
//! * no wall-clock, no OS entropy, no dependency on iteration order;
//! * [`Identity::digest`] is a content hash, so two profiles can be compared
//!   and duplicates detected without diffing a hundred fields by hand.

pub mod assignment;
pub mod automation;
pub mod coherence;
pub mod engine;
pub mod error;
pub mod generator;
pub mod identity;
pub mod os;
pub mod pools;
pub mod profile;
pub mod proxy_store;
pub mod rng;
pub mod schema;
pub mod seal;
pub mod subscription;
pub mod verify;

pub use assignment::{Assignment, AssignmentStore};
pub use error::{Error, Result};
pub use generator::{generate, FontProfile, GeneratedIdentity, GeneratorOptions};
pub use identity::Identity;
pub use os::TargetOs;
pub use profile::{
    GeoGate, Profile, ProfileExport, ProfileStore, ProxyConfig, TrashedProfile,
};
pub use proxy_store::{ProxyCheck, ProxyStore, StoredProxy};
pub use rng::Rng;
pub use schema::PropertySchema;
pub use seal::{seal_available, seal_note};
pub use subscription::{StoredSubscription, SubscriptionStore};
pub use verify::{Report as VerificationReport, VerifyError};

/// The crate version, for the about:pages and the log line.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// The Firefox build this generator targets.
///
/// Frozen rather than looked up: the user agent, the `buildID` and the
/// properties schema all have to agree on one build, and a release bump that
/// changed the user agent without changing the engine would be exactly the
/// kind of split-second identity this crate exists to prevent.
///
/// The trailing patch component is the build, not part of the version string
/// the browser reports, so the two are kept separate on purpose.
pub const ENGINE_TARGET: &str = "camoufox/firefox-156.0.1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_crate_has_a_version() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn the_engine_target_names_a_pinned_build() {
        // A release bump has to be a deliberate edit here, not a side effect of
        // a dependency resolving to a newer build. `FIREFOX_VERSION` is the
        // string the user agent reports; the engine may be a patch ahead of it,
        // so the check is containment rather than equality.
        assert!(ENGINE_TARGET.starts_with("camoufox/"));
        assert!(
            ENGINE_TARGET.contains(pools::FIREFOX_VERSION),
            "{ENGINE_TARGET} does not carry the version the generator writes"
        );
    }
}
