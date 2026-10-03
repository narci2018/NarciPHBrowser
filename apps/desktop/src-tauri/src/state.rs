use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::mihomo::MihomoManager;

/// The application state: the store path and the proxy core manager.
pub struct AppState {
    /// The store path, if known.
    pub store_path: Mutex<Option<PathBuf>>,
    /// The single owner of every proxy core process.
    pub mihomo: Mutex<MihomoManager>,
    /// Serialises speed tests.
    ///
    /// A speed test repoints the shared `SPEEDTEST` group at the node under
    /// test and then downloads through it. Two tests running at once would
    /// each switch the group out from under the other and both would measure
    /// the wrong node, so a test takes this lock for its whole run.
    pub speed_lock: Mutex<()>,
    /// The running automation sessions, keyed by profile id.
    ///
    /// Unlike interactive browsers, automation sessions are owned: the Node
    /// process is a direct child and its stdin is the session's life line, so
    /// closing the app closes the servers and the browsers behind them
    /// instead of leaking unattended processes.
    pub agents: Mutex<HashMap<String, narrc_core::automation::AgentSession>>,
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
            speed_lock: Mutex::new(()),
            agents: Mutex::new(HashMap::new()),
        }
    }
}
