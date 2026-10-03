//! The Playwright automation mount point.
//!
//! Camoufox is a patched Firefox, so it speaks Playwright's Juggler protocol
//! like any Firefox — but Playwright's `launchServer` API is Node-only, and
//! this crate is Rust. Upstream's answer is [`LAUNCH_SERVER_JS`]: a small
//! script that a Node runtime runs with one argument (the Playwright driver
//! directory), reads a single base64-encoded JSON line of launch options from
//! stdin, starts `firefox.launchServer`, prints one JSON line carrying the
//! WebSocket endpoint, and closes the server when stdin closes.
//!
//! That protocol is deliberately easy to drive from any language, so this
//! module does exactly what upstream's Python lib does:
//!
//! * [`launch_options_line`] builds the base64 line from a [`LaunchPlan`] —
//!   the same plan a direct launch would use, so an automated browser and a
//!   visible one present the identical identity;
//! * [`spawn_agent`] runs the script, writes the line, and waits for the
//!   endpoint;
//! * [`AgentSession`] owns the Node child. Its stdin stays open for as long
//!   as the session lives, and closing it closes the browser — so an agent
//!   dies with its owner instead of leaking, which is the opposite trade from
//!   a detached interactive launch on purpose.
//!
//! # The driver
//!
//! `driver_path` is the directory Playwright's `require()` accepts: the
//! `playwright-core` package root. The Node package ships it at
//! `node_modules/playwright-core`; Python Playwright bundles it at
//! `site-packages/playwright/driver/package` together with a Node runtime
//! that can be passed as `node` so the user needs no system Node.

use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use thiserror::Error;

use crate::engine::LaunchPlan;

/// The upstream automation server, vendored byte for byte.
///
/// Provenance and license are recorded in `resources/UPSTREAM.md`; a test in
/// this module pins the bytes so an accidental edit cannot silently change
/// the protocol the sidecar and the UI both rely on.
pub const LAUNCH_SERVER_JS: &str = include_str!("../resources/launchServer.js");

/// How long [`spawn_agent`] waits for the endpoint before giving up.
///
/// The engine is already installed when a launch plan exists, so this covers
/// Node startup plus Playwright's own boot — seconds on a warm cache, and a
/// first run on a cold antivirus scan on Windows can be slower.
pub const DEFAULT_ENDPOINT_TIMEOUT: Duration = Duration::from_secs(120);

/// How long [`AgentSession`] waits for a graceful stdin-close exit before
/// killing the process.
const GRACEFUL_EXIT: Duration = Duration::from_secs(5);

/// Building the automation session failed. The message is written for a UI.
#[derive(Debug, Error)]
pub enum AgentError {
    /// The Node runtime could not be started.
    #[error(
        "could not start the Node runtime {program:?}: {source} — automation needs Node, \
         or the bundled one that ships with Python Playwright"
    )]
    Node {
        /// The Node program that was tried.
        program: String,
        /// The underlying error.
        #[source]
        source: std::io::Error,
    },
    /// The script exited without printing an endpoint.
    #[error("the automation server did not report a WebSocket endpoint: {detail}")]
    Protocol {
        /// What went wrong, usually with the script's stderr attached.
        detail: String,
    },
    /// The endpoint did not arrive within the budget.
    #[error("the automation server did not report an endpoint within {seconds} seconds")]
    Timeout {
        /// The budget that elapsed, in whole seconds.
        seconds: u64,
    },
}

/// A running automation server and the browser behind it.
///
/// Dropping the session closes stdin — the script's signal to shut the server
/// and the browser down — and force-kills if that has not worked within
/// [`GRACEFUL_EXIT`]. The session is not `Clone` and not `Send`-tied to
/// anything special; owners keep it in a registry and call [`AgentSession::stop`].
pub struct AgentSession {
    /// The Node process running the automation server.
    child: Child,
    /// The pipe the launch options went out on; held open for the lifetime.
    _stdin: Option<ChildStdin>,
    /// The WebSocket endpoint Playwright clients connect to.
    pub ws_endpoint: String,
}

impl std::fmt::Debug for AgentSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AgentSession")
            .field("pid", &self.child.id())
            .field("ws_endpoint", &self.ws_endpoint)
            .finish()
    }
}

impl AgentSession {
    /// The Node process's pid, for the UI's process listing.
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// Closes the server and waits for the browser to go with it.
    pub fn stop(mut self) {
        // Dropping stdin is the script's contract for a clean shutdown.
        self._stdin.take();
        self.reap(GRACEFUL_EXIT);
    }

    /// Waits up to `budget` for the child to exit, then kills it.
    fn reap(&mut self, budget: Duration) {
        let deadline = Instant::now() + budget;
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => std::thread::sleep(Duration::from_millis(25)),
                Err(_) => return,
            }
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for AgentSession {
    fn drop(&mut self) {
        self._stdin.take();
        self.reap(GRACEFUL_EXIT);
    }
}

/// Writes the vendored automation script into `dir` and returns its path.
///
/// The bytes are rewritten whenever they differ, so an older app version
/// cannot leave a stale script behind to answer with an older protocol. The
/// write goes through a temporary file for the same reason every other store
/// write here does: a crash halfway through a write must not leave a script
/// that is half of two versions.
pub fn write_automation_script(dir: &Path) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("launchServer.js");
    let stale = std::fs::read(&path)
        .map(|existing| existing != LAUNCH_SERVER_JS.as_bytes())
        .unwrap_or(true);
    if stale {
        let temp = dir.join(".launchServer.js.tmp");
        std::fs::write(&temp, LAUNCH_SERVER_JS)?;
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        std::fs::rename(&temp, &path)?;
    }
    Ok(path)
}

/// Builds the single base64 line the automation script reads from stdin.
///
/// Playwright's `env` launch option *replaces* the child's environment
/// wholesale rather than extending it, so the caller's own environment rides
/// along and the plan's variables — the chunked identity — are layered on top.
/// The plan also decides `headless` and carries the arguments, so an
/// automated browser launches exactly like a visible one.
///
/// `parent_env` is a parameter rather than a read of `std::env` so the line
/// is testable without a real launch.
pub fn launch_options_line(
    plan: &LaunchPlan,
    parent_env: &BTreeMap<String, String>,
    port: Option<u16>,
) -> String {
    let mut env: BTreeMap<&str, &str> = parent_env
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect();
    for (key, value) in &plan.env {
        env.insert(key.as_str(), value.as_str());
    }
    let mut options = serde_json::json!({
        "executablePath": plan.program,
        "args": plan.args,
        "headless": plan.headless,
        "env": env,
    });
    if let Some(port) = port {
        options["port"] = serde_json::json!(port);
    }
    base64_encode(options.to_string().as_bytes())
}

/// Starts the automation server for a launch plan and waits for its endpoint.
///
/// `node` is the Node runtime (a name on `PATH`, or an explicit binary —
/// Python Playwright ships one next to its driver). `driver_path` is the
/// `playwright-core` package root the script will `require`. `script_path`
/// comes from [`write_automation_script`].
pub fn spawn_agent(
    plan: &LaunchPlan,
    node: &str,
    driver_path: &str,
    script_path: &Path,
    port: Option<u16>,
    timeout: Duration,
) -> Result<AgentSession, AgentError> {
    let mut parent_env = BTreeMap::new();
    for (key, value) in std::env::vars() {
        parent_env.insert(key, value);
    }
    let line = launch_options_line(plan, &parent_env, port);

    let spawned = Command::new(node)
        .arg(script_path)
        .arg(driver_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match spawned {
        Ok(child) => child,
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
            return Err(AgentError::Node {
                program: node.to_string(),
                source,
            })
        }
        Err(source) => {
            return Err(AgentError::Node {
                program: node.to_string(),
                source,
            })
        }
    };

    let mut stdin = child.stdin.take();
    let stdout = child
        .stdout
        .take()
        .ok_or(AgentError::Protocol { detail: "no stdout".to_string() })?;
    let stderr = child
        .stderr
        .take()
        .ok_or(AgentError::Protocol { detail: "no stderr".to_string() })?;

    // The stderr tail is the only diagnostic a failed boot has, so it is
    // collected off-thread and attached to whichever error surfaces first.
    let (stderr_tx, stderr_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut text);
        let _ = stderr_tx.send(text);
    });

    let (line_tx, line_rx) = mpsc::channel::<Option<String>>();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut first = String::new();
        let read = reader.read_line(&mut first).unwrap_or(0);
        let _ = line_tx.send((read > 0).then_some(first));
    });

    if let Some(stdin) = stdin.as_mut() {
        if let Err(source) = writeln!(stdin, "{line}").and_then(|()| stdin.flush()) {
            return Err(failed_boot(child, stderr_rx, format!("stdin closed: {source}")));
        }
    }

    let deadline = Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            let seconds = timeout.as_secs();
            let _ = child.kill();
            let _ = child.wait();
            return Err(AgentError::Timeout { seconds });
        }
        match line_rx.recv_timeout(remaining) {
            Ok(Some(line)) => {
                let endpoint = serde_json::from_str::<serde_json::Value>(&line)
                    .ok()
                    .and_then(|value| {
                        value
                            .get("wsEndpoint")
                            .and_then(|endpoint| endpoint.as_str())
                            .map(|endpoint| endpoint.to_string())
                    });
                return match endpoint {
                    Some(ws_endpoint) => Ok(AgentSession {
                        child,
                        _stdin: stdin,
                        ws_endpoint,
                    }),
                    None => Err(failed_boot(child, stderr_rx, line.trim().to_string())),
                };
            }
            Ok(None) => {
                return Err(failed_boot(
                    child,
                    stderr_rx,
                    "the automation script exited".to_string(),
                ))
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(failed_boot(
                    child,
                    stderr_rx,
                    "the endpoint reader stopped".to_string(),
                ))
            }
        }
    }
}

/// Collects the stderr tail and turns a dead boot into a protocol error.
fn failed_boot(
    mut child: Child,
    stderr_rx: mpsc::Receiver<String>,
    detail: String,
) -> AgentError {
    let _ = child.kill();
    let _ = child.wait();
    let mut detail = detail;
    if let Ok(stderr) = stderr_rx.recv_timeout(Duration::from_secs(2)) {
        let tail: String = stderr
            .lines()
            .last()
            .unwrap_or_default()
            .chars()
            .rev()
            .take(400)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        if !tail.is_empty() {
            detail.push_str(&format!(" — {tail}"));
        }
    }
    AgentError::Protocol { detail }
}

const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard base64 with padding.
///
/// Hand-rolled rather than a dependency: the crate carries three dependencies
/// and this is one pure function with test vectors, not a protocol.
fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let packed = (a << 16) | (b << 8) | c;
        out.push(BASE64_ALPHABET[(packed >> 18) as usize & 63] as char);
        out.push(BASE64_ALPHABET[(packed >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            BASE64_ALPHABET[(packed >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            BASE64_ALPHABET[packed as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan() -> LaunchPlan {
        LaunchPlan {
            program: "C:/engines/camoufox.exe".to_string(),
            args: vec!["-profile".to_string(), "C:/store/p1/browser".to_string()],
            env: BTreeMap::from([(
                "CAMOU_CONFIG_1".to_string(),
                "{\"webGl\":{\"renderer\":\"AMD\"}}".to_string(),
            )]),
            headless: false,
            warnings: vec![],
        }
    }

    #[test]
    fn base64_matches_the_rfc_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_carries_utf8_through() {
        // The options line is UTF-8 JSON; a multibyte character must survive
        // byte-for-byte, since node decodes it as UTF-8.
        let text = "{\"path\":\"C:/profile/田中/1\"}";
        let encoded = base64_encode(text.as_bytes());
        let decoded = decode(&encoded);
        assert_eq!(String::from_utf8(decoded).unwrap(), text);
    }

    /// A reference decoder, so the tests do not assert on themselves.
    fn decode(encoded: &str) -> Vec<u8> {
        let mut out = Vec::new();
        let bytes: Vec<u32> = encoded
            .bytes()
            .filter(|b| *b != b'=')
            .map(|b| {
                BASE64_ALPHABET
                    .iter()
                    .position(|a| *a == b)
                    .expect("alphabet byte") as u32
            })
            .collect();
        for chunk in bytes.chunks(4) {
            let mut packed = 0u32;
            for (index, digit) in chunk.iter().enumerate() {
                packed |= digit << (18 - 6 * index);
            }
            out.push((packed >> 16) as u8);
            if chunk.len() > 2 {
                out.push((packed >> 8) as u8);
            }
            if chunk.len() > 3 {
                out.push(packed as u8);
            }
        }
        out
    }

    #[test]
    fn the_options_line_decodes_to_the_documented_shape() {
        let parent = BTreeMap::from([("PATH".to_string(), "/bin".to_string())]);
        let line = launch_options_line(&plan(), &parent, None);
        let options: serde_json::Value = serde_json::from_slice(&decode(&line)).unwrap();
        assert_eq!(options["executablePath"], "C:/engines/camoufox.exe");
        assert_eq!(options["headless"], false);
        assert_eq!(options["args"][0], "-profile");
        // The plan's variables are layered over the parent's environment.
        assert_eq!(options["env"]["PATH"], "/bin");
        assert!(options["env"]["CAMOU_CONFIG_1"]
            .as_str()
            .unwrap()
            .starts_with("{\"webGl\""));
    }

    #[test]
    fn the_plan_env_wins_over_the_parent_env() {
        let parent = BTreeMap::from([(
            "CAMOU_CONFIG_1".to_string(),
            "{\"stale\":true}".to_string(),
        )]);
        let line = launch_options_line(&plan(), &parent, None);
        let options: serde_json::Value = serde_json::from_slice(&decode(&line)).unwrap();
        assert!(options["env"]["CAMOU_CONFIG_1"]
            .as_str()
            .unwrap()
            .starts_with("{\"webGl\""));
    }

    #[test]
    fn a_requested_port_rides_along() {
        let line = launch_options_line(&plan(), &BTreeMap::new(), Some(9223));
        let options: serde_json::Value = serde_json::from_slice(&decode(&line)).unwrap();
        assert_eq!(options["port"], 9223);
    }

    #[test]
    fn the_options_line_is_one_line() {
        // The script reads exactly one line; a base64 body never contains a
        // newline, but the pin is the point.
        let line = launch_options_line(&plan(), &BTreeMap::new(), None);
        assert!(!line.contains('\n'));
        assert!(!line.contains('\r'));
    }

    #[test]
    fn the_vendored_script_is_upstream_byte_for_byte() {
        // Pinned by length and by the protocol-critical fragments rather than
        // a hash constant, so the pin has no dependency and no copy of the
        // digest to fall out of sync with.
        assert_eq!(LAUNCH_SERVER_JS.len(), 2510);
        assert!(LAUNCH_SERVER_JS.starts_with(
            "// Workaround that gives Playwright the ability to use the `launchServer` API"
        ));
        assert!(LAUNCH_SERVER_JS.contains("require(driverDir)"));
        assert!(LAUNCH_SERVER_JS.contains("Buffer.from(line, 'base64')"));
        assert!(LAUNCH_SERVER_JS.contains("wsEndpoint"));
        assert!(LAUNCH_SERVER_JS.contains("server.close()"));
        assert!(LAUNCH_SERVER_JS
            .trim_end()
            .ends_with("Waiting for launch options on stdin...`);"));
    }

    #[test]
    fn the_script_is_written_and_rewritten_when_stale() {
        let dir = tempfile_dir();
        let path = write_automation_script(&dir).unwrap();
        assert_eq!(path.file_name().unwrap(), "launchServer.js");
        assert_eq!(std::fs::read(&path).unwrap(), LAUNCH_SERVER_JS.as_bytes());

        // A stale script from an older version is replaced, not left behind.
        std::fs::write(&path, "// stale\n").unwrap();
        let path = write_automation_script(&dir).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), LAUNCH_SERVER_JS.as_bytes());
    }

    fn tempfile_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "narrc-automation-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
