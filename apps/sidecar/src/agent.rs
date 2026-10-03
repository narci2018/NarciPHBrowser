//! Automation sessions: profiles driven over Playwright's WebSocket endpoint.
//!
//! An interactive launch is detached on purpose — the browser outlives the
//! sidecar because a person may close the app before the browser. An
//! automation session is the opposite trade: the Node process running the
//! automation server is a direct child of the sidecar, its stdin is the
//! session's life line, and when the sidecar exits, stdin closes and the
//! server and the browser behind it go with it. An unattended browser that
//! no process owns is a session leaking into somebody's task manager.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use narrc_core::automation::{self, AgentSession};
use serde_json::{json, Value};

use crate::protocol::{store, load_profile, ErrorKind, SidecarError};

/// The sessions this sidecar owns, keyed by profile id.
///
/// One session per profile: two automation servers cannot share a browser
/// data directory, and the second launch would fail in the engine with an
/// error about a locked profile rather than in here with an error about a
/// duplicate session.
fn sessions() -> &'static Mutex<HashMap<String, AgentSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, AgentSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Starts an automation server for a profile and returns its endpoint.
///
/// The launch plan is the same one an interactive launch builds — the same
/// identity, the same engine, the same profile directory — so an automated
/// browser is indistinguishable from a hand-launched one at the plan level.
pub fn start(
    id: &str,
    engine: Option<&str>,
    exit_country: Option<&str>,
    driver_path: &str,
    node_path: Option<&str>,
    port: Option<u16>,
    headless: bool,
) -> Result<Value, SidecarError> {
    {
        let sessions = sessions().lock().expect("the session lock");
        if sessions.contains_key(id) {
            return Err(SidecarError::new(
                ErrorKind::Conflict,
                format!("an automation session for {id:?} is already running"),
            ));
        }
    }

    let store = store()?;
    let profile = load_profile(&store, id)?;

    // The same gate an interactive launch passes: a browser that presents one
    // country from an address in another is the contradiction this tool
    // exists to prevent, and automation is the easiest place to trip it.
    let geo_gate = profile
        .proxy
        .as_ref()
        .map(|_| profile.check_geo_gate(exit_country));
    if let Some(gate) = &geo_gate {
        if !gate.allows_launch() {
            return Err(SidecarError::new(
                ErrorKind::Conflict,
                format!("the geo gate refused this launch: {gate:?}"),
            ));
        }
    }

    let dir = store.browser_dir(id);
    let (plan, _discarded) = profile
        .launch_plan_after_discarding_conflicts(&dir, engine, headless)
        .map_err(SidecarError::from)?;

    let script = automation::write_automation_script(&store.automation_dir())
        .map_err(|error| SidecarError::new(ErrorKind::Io, format!("automation script: {error}")))?;
    let node = node_path.unwrap_or("node");

    let session = automation::spawn_agent(
        &plan,
        node,
        driver_path,
        &script,
        port,
        automation::DEFAULT_ENDPOINT_TIMEOUT,
    )
    .map_err(|error| SidecarError::new(ErrorKind::Io, error.to_string()))?;

    let reply = json!({
        "wsEndpoint": session.ws_endpoint,
        "pid": session.pid(),
        "geoGate": geo_gate,
    });
    sessions()
        .lock()
        .expect("the session lock")
        .insert(id.to_string(), session);
    Ok(reply)
}

/// Stops a profile's automation session.
pub fn stop(id: &str) -> Result<Value, SidecarError> {
    let session = sessions()
        .lock()
        .expect("the session lock")
        .remove(id)
        .ok_or_else(|| {
            SidecarError::new(
                ErrorKind::NotFound,
                format!("no automation session for {id:?}"),
            )
        })?;
    session.stop();
    Ok(json!({ "stopped": true }))
}

/// Every running session, for a UI reconnecting after a page reload.
pub fn list() -> Result<Value, SidecarError> {
    let sessions = sessions().lock().expect("the session lock");
    let rows: Vec<Value> = sessions
        .iter()
        .map(|(id, session)| {
            json!({
                "id": id,
                "wsEndpoint": session.ws_endpoint,
                "pid": session.pid(),
            })
        })
        .collect();
    Ok(json!({ "sessions": rows }))
}
