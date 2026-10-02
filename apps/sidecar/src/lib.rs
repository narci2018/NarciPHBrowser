//! The sidecar's library interface.
//!
//! The binary (`main.rs`) and the library (`lib.rs`) share the same protocol
//! implementation. The binary speaks the line protocol over stdin/stdout;
//! the library exposes the same commands as typed Rust functions. The Tauri
//! application uses the library directly, in-process, rather than spawning
//! a child process — the sidecar binary is for standalone use and testing.

pub mod protocol;
pub mod store_path;

pub use narrc_core::profile::{GeoGate, OverrideProblem};
pub use protocol::{
    Command, CreateProxy, CreateSpec, DiffEntry, ErrorKind, GeoView, Inspection, Launched,
    ProfileSummary, Report, Response, SidecarError,
};
pub use store_path::default_store;
