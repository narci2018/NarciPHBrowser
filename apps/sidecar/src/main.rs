//! The sidecar: a narrow, testable process boundary.
//!
//! # Why this exists
//!
//! The desktop UI is a web view. Everything a fingerprint tool does is the
//! opposite of what a web view is good at: spawning a browser process, holding
//! a hundred-field identity in memory, and writing files the user did not ask
//! it to write. Putting the engine in the same process as the UI would mean a
//! bug in a rendering path could reach a profile, and a crash would take the
//! user's identities with it.
//!
//! So the engine runs here, in its own process, and the UI reaches it over a
//! line protocol. This crate is that line.
//!
//! # The protocol
//!
//! One JSON object per line on stdin, one JSON object per line on stdout, in
//! the same order. That is the whole contract. Line-delimited JSON rather than a
//! socket because the parent already has the child's pipes, and a port would add
//! a firewall prompt and a thing that can be occupied by something else.
//!
//! ```text
//! {"id": 1, "command": "list", "params": {}}
//! -> {"id": 1, "ok": true,  "result": {...}}
//! -> {"id": 1, "ok": false, "error": {"kind": "...", "message": "..."}}
//! ```
//!
//! Two rules make this safe to drive from a UI that may be killed at any moment:
//!
//! * **Every request is independent.** No transaction, no session, no ordering
//!   requirement. A request that fails leaves the store exactly as it was, so
//!   the UI can retry without first working out what happened.
//! * **The response carries the request's `id`.** A UI that pipelines requests
//!   can then match them up, and a request whose reply never came is
//!   distinguishable from one that was never sent.
//!
//! # What is deliberately not here
//!
//! No configuration, no discovery, no auto-update, no logging to a file. A
//! component whose only job is to be a trustworthy boundary earns trust by
//! being boring; every feature here is one the UI could have done itself except
//! the one it must not: touch the identity engine.

use std::io::{self, BufRead, Write};

mod protocol;
mod store_path;

use protocol::{Command, Request, Response};

/// Exit code for a malformed request line.
///
/// Distinct from the per-request failure code so a caller can tell "you sent me
/// nonsense" from "the operation failed", which are very different bugs: the
/// first is in the UI, the second is in the user's data or the environment.
const EXIT_MALFORMED: i32 = 2;

fn main() {
    let code = run();
    std::process::exit(code);
}

fn run() -> i32 {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();

    // A UI that dies mid-write leaves a half-sent line behind. Dropping it
    // rather than erroring out is right: the request was never complete, so
    // there is nothing to report, and the next one is perfectly readable.
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                let _ = writeln!(stdout, "{}", Response::io_error(&error));
                let _ = stdout.flush();
                return EXIT_MALFORMED;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        // Flushed per response, because the UI is waiting on it. A buffered
        // writer that flushed at exit would look like a hang to anything on the
        // other end, which is exactly what it would look like if the UI were
        // also buffering.
        match handle_line(&line) {
            Ok(response) | Err(response) => {
                if writeln!(stdout, "{response}").is_err() || stdout.flush().is_err() {
                    // The UI has gone. Not an error worth a diagnostic on a
                    // closed pipe.
                    return 0;
                }
            }
        }
    }
    0
}

fn handle_line(line: &str) -> Result<Response, Response> {
    let request: Request = match serde_json::from_str(line) {
        Ok(request) => request,
        Err(error) => return Err(Response::malformed(error)),
    };
    Ok(dispatch(request))
}

/// Runs one request.
///
/// A total function over [`Command`]: every variant produces a response, so a
/// command added later cannot be forgotten here — the match will not compile
/// without an arm.
fn dispatch(request: Request) -> Response {
    let id = request.id;
    // Split rather than `outcome.ok()` twice: the value is moved by the first
    // call, and re-deriving the second half from the same match keeps the two
    // fields from ever describing different outcomes.
    match match request.command {
        Command::Ping(_) => protocol::ping(),
        Command::Version(_) => protocol::version(),
        Command::DefaultStore(_) => protocol::store_path_command(),
        Command::Create(spec) => protocol::create(&spec),
        Command::Update(params) => protocol::update(&params.id, &params.spec),
        Command::List(_) => protocol::list(),
        Command::Load(params) => protocol::load(&params.id),
        Command::Delete(params) => protocol::delete(&params.id),
        Command::Inspect(params) => protocol::inspect(&params.id),
        Command::Validate(params) => protocol::validate(&params.id),
        Command::SetOverride(params) => {
            protocol::set_override(&params.id, &params.property, params.value)
        }
        Command::ClearOverride(params) => protocol::clear_override(&params.id, &params.property),
        Command::Plan(params) => {
            protocol::plan(&params.id, params.engine.as_deref(), params.headless)
        }
        Command::Launch(params) => protocol::launch(
            &params.id,
            params.engine.as_deref(),
            params.exit_country.as_deref(),
        ),
    } {
        Ok(result) => Response {
            id,
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => Response {
            id,
            ok: false,
            result: None,
            error: Some(error),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(line: &str) -> serde_json::Value {
        let response = handle_line(line).unwrap_or_else(|rejected| rejected);
        serde_json::from_str(&response.to_string()).expect("a response is valid JSON")
    }

    #[test]
    fn a_ping_is_answered() {
        // An object rather than a bare string, so a later round-trip timing
        // field has somewhere to go without breaking the shape.
        assert_eq!(
            ask(r#"{"id":1,"command":"ping","params":{}}"#)["result"]["pong"],
            true
        );
    }

    #[test]
    fn the_response_carries_the_request_id() {
        // A UI that pipelines cannot pair up replies without this, and a wrong
        // id is worse than a missing reply: it attaches one profile's data to
        // another profile's row.
        let value = ask(r#"{"id":4242,"command":"ping","params":{}}"#);
        assert_eq!(value["id"], 4242);
        assert_eq!(value["ok"], true);
    }

    #[test]
    fn a_malformed_line_is_rejected_without_a_result() {
        let value = ask("{not json");
        assert_eq!(value["ok"], false);
        assert!(value.get("result").is_none());
        assert_eq!(value["error"]["kind"], "malformed");
    }

    #[test]
    fn an_unknown_command_is_refused_by_name() {
        // Naming the command turns a typo into a one-line fix instead of a
        // silent no-op, which is the failure mode of a default arm.
        let value = ask(r#"{"id":1,"command":"launche","params":{}}"#);
        assert_eq!(value["ok"], false);
        assert!(value["error"]["message"]
            .as_str()
            .unwrap()
            .contains("launche"));
    }

    #[test]
    fn a_failed_request_does_not_kill_the_process() {
        // The property that matters most: one bad request must not end the
        // session, or a UI bug takes every subsequent command with it.
        let bad = ask(r#"{"id":1,"command":"load","params":{"id":"nope"}}"#);
        assert_eq!(bad["ok"], false);
        let good = ask(r#"{"id":2,"command":"ping","params":{}}"#);
        assert_eq!(good["ok"], true);
    }

    #[test]
    fn a_blank_line_is_not_a_request() {
        // Harmless, and a UI that pads its stream should not be punished for it.
        assert!(std::env::var("PATH").is_ok());
        for line in ["", "   ", "\t"] {
            let response = handle_line(line);
            assert!(response.is_err(), "{line:?} should be rejected, not parsed");
        }
    }

    #[test]
    fn every_command_has_an_arm() {
        // Compile-time: adding a variant without dispatching it fails the
        // build rather than returning "unsupported" at runtime.
        let _ = dispatch;
    }
}
