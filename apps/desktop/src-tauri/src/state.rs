use std::path::PathBuf;
use std::sync::Mutex;

use crate::mihomo::MihomoManager;

/// The application state: the store path and the proxy core manager.
pub struct AppState {
    /// The store path, if known.
    pub store_path: Mutex<Option<PathBuf>>,
    /// The single owner of every proxy core process.
    pub mihomo: Mutex<MihomoManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    /// A new, unconnected state.
    pub fn new() -> Self {
        Self {
            store_path: Mutex::new(None),
            mihomo: Mutex::new(MihomoManager::new()),
        }
    }
}
