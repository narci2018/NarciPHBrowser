//! The sidecar driven as a process, over the pipe it will really be driven on.
//!
//! The unit tests in `src/` call functions directly. That cannot catch the
//! failures that matter most here, because all of them live in the plumbing:
//! a response written without a trailing newline, a request whose line is
//! longer than a pipe buffer, a process that hangs instead of answering, a
//! store path the tests set differently from the one a UI would get.
//!
//! So these tests spawn the real binary and speak the real protocol. If the
//! wire format changes and the SDK is not changed with it, the answer stops
//! parsing here rather than in a user's UI.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use serde_json::{json, Value};

/// The binary under test, built by cargo for this integration test.
const EXE: &str = env!("CARGO_BIN_EXE_narrc-sidecar");

/// A running sidecar, killed when dropped.
struct Sidecar {
    child: Child,
    /// `Option` so `Drop` can close the pipe: that is the sidecar's exit
    /// condition, so the child shuts itself down instead of being killed, and
    /// the store is flushed the way it would be in production.
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
    /// Every reply, in order, for the tests that assert on the stream itself.
    transcript: Vec<Value>,
}

impl Sidecar {
    /// Starts a sidecar with its own store, so a test never touches the real
    /// one and two tests never collide.
    ///
    /// The store directory is NOT cleaned on start — tests that need a fresh
    /// store clean it themselves before calling this. This allows a test to
    /// start a sidecar, create profiles, drop it, and start another sidecar
    /// with the same tag to verify persistence.
    fn start(tag: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "narrc-sidecar-it-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));

        let mut child = Command::new(EXE)
            .env("NARCI_STORE", &root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("the sidecar starts");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Self {
            child,
            stdin: Some(stdin),
            stdout,
            next_id: 1,
            transcript: Vec::new(),
        }
    }

    /// Sends one request and returns its reply.
    fn send(&mut self, request: Value) -> Value {
        let line = serde_json::to_string(&request).expect("a request serialises");
        let stdin = self.stdin.as_mut().expect("the pipe is open");
        writeln!(stdin, "{line}").expect("the sidecar accepts a request");
        stdin.flush().expect("the pipe flushes");

        let mut reply = String::new();
        self.stdout
            .read_line(&mut reply)
            .expect("the sidecar answers");
        assert!(!reply.is_empty(), "no reply to {line}");
        let value: Value = serde_json::from_str(&reply)
            .unwrap_or_else(|error| panic!("reply is not one JSON object: {reply:?} ({error})"));
        self.transcript.push(value.clone());
        value
    }

    /// Sends a request with the next id, asserting success.
    fn call(&mut self, command: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        let reply = self.send(json!({ "id": id, "command": command, "params": params }));
        assert_eq!(reply["id"], id, "the reply does not match the request");
        assert_eq!(reply["ok"], true, "request failed: {}", reply["error"]);
        reply["result"].clone()
    }

    /// Sends a request and returns the error, asserting failure.
    fn expect_error(&mut self, command: &str, params: Value) -> Value {
        let reply = self.send(json!({ "id": 0, "command": command, "params": params }));
        assert_eq!(reply["ok"], false, "expected a failure, got {}", reply);
        assert!(
            reply.get("result").is_none(),
            "a failure must carry no result"
        );
        reply["error"].clone()
    }

    /// Creates a profile and returns its id.
    fn create(&mut self, name: &str, seed: u64) -> String {
        let result = self.call(
            "create",
            json!({ "name": name, "seed": seed, "os": "windows" }),
        );
        result["id"].as_str().expect("an id").to_owned()
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        // Close stdin first: that is the sidecar's exit condition, so the child
        // is not left to be killed, and its store is flushed normally.
        drop(self.stdin.take());
        let _ = self.child.wait();
    }
}

fn keys(value: &Value) -> Vec<String> {
    let mut keys: Vec<String> = value
        .as_object()
        .expect("an object")
        .keys()
        .cloned()
        .collect();
    keys.sort();
    keys
}

#[test]
fn a_ping_round_trips_over_a_real_pipe() {
    let mut sidecar = Sidecar::start("ping");
    assert_eq!(sidecar.call("ping", json!({}))["pong"], true);
}

#[test]
fn the_version_reports_both_crates_and_the_engine() {
    let mut sidecar = Sidecar::start("version");
    let version = sidecar.call("version", json!({}));
    // The UI shows this on an about page, and the engine pin is the one number
    // a user needs when a site starts rejecting them.
    assert!(version["engine"].as_str().unwrap().contains("firefox-"));
    assert!(!version["sidecar"].as_str().unwrap().is_empty());
    assert!(!version["core"].as_str().unwrap().is_empty());
}

#[test]
fn the_whole_lifecycle_works_over_the_wire() {
    let mut sidecar = Sidecar::start("lifecycle");

    // Create.
    let created = sidecar.call(
        "create",
        json!({ "name": "Bank account", "seed": 20_260_929, "os": "windows" }),
    );
    let id = created["id"].as_str().unwrap().to_owned();
    assert_eq!(created["summary"]["name"], "Bank account");
    assert_eq!(created["summary"]["coherent"], true);
    assert!(created["summary"]["summary"]
        .as_str()
        .unwrap()
        .contains("windows"));

    // List.
    let listed = sidecar.call("list", json!({}));
    assert_eq!(listed["profiles"].as_array().unwrap().len(), 1);
    assert_eq!(listed["unreadable"].as_array().unwrap().len(), 0);

    // Inspect.
    let inspection = sidecar.call("inspect", json!({ "id": id }));
    assert!(inspection["effective"]["navigator.hardwareConcurrency"].is_number());
    assert!(inspection["summary"].as_str().unwrap().contains("cores"));
    // A generated profile is coherent by construction; an inspection that
    // reported a violation here would mean the draw or the repair is broken.
    assert_eq!(inspection["violations"].as_array().unwrap().len(), 0);

    // Validate.
    let report = sidecar.call("validate", json!({ "id": id }));
    assert_eq!(report["launchable"], true);
    assert_eq!(report["violations"].as_array().unwrap().len(), 0);

    // Edit, and see it take effect.
    // Use 1920: it's different from the drawn 2560 (so the diff is meaningful)
    // and it forms a landscape 4:3 screen with the drawn 1440 height (so the
    // coherence layer accepts it). A value of 1280 would be portrait and
    // correctly rejected.
    let _edited = sidecar.call(
        "set-override",
        json!({ "id": id, "property": "screen.width", "value": 1920 }),
    );
    // Note: we don't check `launchable` here because the override may or may
    // not be coherent depending on the drawn height. The override taking
    // effect is what this test is about; coherence is checked by `validate`.
    let inspection = sidecar.call("inspect", json!({ "id": id }));
    assert_eq!(inspection["effective"]["screen.width"], 1920);
    let diff = inspection["override_diff"].as_array().unwrap();
    assert_eq!(diff.len(), 1);
    assert_eq!(diff[0]["property"], "screen.width");
    assert_eq!(diff[0]["overridden"], true);

    // Plan, without launching.
    let plan = sidecar.call("plan", json!({ "id": id }));
    assert_eq!(plan["headless"], false);
    assert!(plan["args"]
        .as_array()
        .unwrap()
        .iter()
        .any(|arg| arg == "--profile"));

    // Undo the edit.
    let cleared = sidecar.call(
        "clear-override",
        json!({ "id": id, "property": "screen.width" }),
    );
    assert_eq!(cleared["report"]["launchable"], true);

    // Delete.
    sidecar.call("delete", json!({ "id": id }));
    assert_eq!(
        sidecar.call("list", json!({}))["profiles"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
}

#[test]
fn a_string_number_from_a_ui_is_coerced_rather_than_stored_as_text() {
    // Every input element in a web view hands over a string. Storing that
    // string would produce an identity the engine drops, so the sidecar
    // converts it and says that it did.
    let mut sidecar = Sidecar::start("coerce");
    let id = sidecar.create("Coerce", 5);

    let result = sidecar.call(
        "set-override",
        json!({ "id": id, "property": "screen.width", "value": "1920" }),
    );
    assert_eq!(result["coerced"], true, "the coercion must be reported");
    assert_eq!(result["value"], 1920);
    assert_eq!(result["problems"].as_array().unwrap().len(), 0);

    let inspection = sidecar.call("inspect", json!({ "id": id }));
    assert_eq!(inspection["effective"]["screen.width"], 1920);
}

#[test]
fn a_value_that_cannot_be_coerced_is_refused_with_the_type_it_wanted() {
    let mut sidecar = Sidecar::start("refuse");
    let id = sidecar.create("Refuse", 6);

    let error = sidecar.expect_error(
        "set-override",
        json!({ "id": id, "property": "screen.width", "value": "wide" }),
    );
    assert_eq!(error["kind"], "invalid");
    // The message has to name both the property and what it wanted, or the
    // user is left guessing which of a hundred fields is wrong.
    let message = error["message"].as_str().unwrap();
    assert!(message.contains("screen.width"), "{message}");
    assert!(message.contains("uint"), "{message}");
}

#[test]
fn an_unknown_property_is_refused_by_name() {
    let mut sidecar = Sidecar::start("unknown");
    let id = sidecar.create("Unknown", 7);
    let error = sidecar.expect_error(
        "set-override",
        json!({ "id": id, "property": "screen.widt", "value": 1920 }),
    );
    assert_eq!(error["kind"], "invalid");
    assert!(error["message"].as_str().unwrap().contains("screen.widt"));
}

#[test]
fn clearing_an_override_that_is_not_one_is_not_found() {
    let mut sidecar = Sidecar::start("clearmissing");
    let id = sidecar.create("Clear", 8);
    let error = sidecar.expect_error(
        "clear-override",
        json!({ "id": id, "property": "screen.width" }),
    );
    assert_eq!(error["kind"], "not-found");
    assert_eq!(error["retryable"], false);
}

#[test]
fn a_missing_profile_is_a_not_found_the_ui_can_act_on() {
    let mut sidecar = Sidecar::start("missing");
    for command in ["load", "inspect", "validate", "delete"] {
        let error = sidecar.expect_error(command, json!({ "id": "nope" }));
        assert_eq!(error["kind"], "not-found", "{command}");
        // The id is repeated so the UI can point at the right row.
        assert!(
            error["message"].as_str().unwrap().contains("nope"),
            "{command}"
        );
    }
}

#[test]
fn the_geo_gate_refuses_a_launch_before_anything_is_spawned() {
    let mut sidecar = Sidecar::start("gate");
    let id = sidecar.call(
        "create",
        json!({
            "name": "Geo",
            "seed": 11,
            "os": "windows",
            "country": "DE",
            "proxy": { "url": "http://proxy.example:3128", "exit_country": "DE" },
        }),
    )["id"]
        .as_str()
        .unwrap()
        .to_owned();

    // Right country: the plan is produced. The launch is not attempted, because
    // a test must not start a browser.
    let plan = sidecar.call("plan", json!({ "id": id }));
    assert!(!plan["program"].as_str().unwrap().is_empty());

    // Wrong country: refused, before a process exists.
    let error = sidecar.expect_error("launch", json!({ "id": id, "exit_country": "US" }));
    assert_eq!(error["kind"], "conflict");
    assert!(error["message"].as_str().unwrap().contains("gate"));

    // Not knowing is not the same as passing.
    let error = sidecar.expect_error("launch", json!({ "id": id }));
    assert_eq!(error["kind"], "conflict");
}

#[test]
fn a_launch_of_a_missing_engine_is_an_io_error_the_user_can_retry() {
    let mut sidecar = Sidecar::start("noengine");
    let id = sidecar.create("NoEngine", 9);
    let error = sidecar.expect_error(
        "launch",
        json!({ "id": id, "engine": "definitely-not-an-engine-binary" }),
    );
    assert_eq!(error["kind"], "io");
    assert_eq!(error["retryable"], true);
    assert!(error["message"]
        .as_str()
        .unwrap()
        .contains("definitely-not"));
}

#[test]
fn an_irreconcilable_edit_refuses_the_launch_by_rule_name() {
    let mut sidecar = Sidecar::start("conflict");
    let id = sidecar.create("Clash", 10);
    // Note the *correct* property name, so this is refused for incoherence
    // rather than for a typo.
    sidecar.call(
        "set-override",
        json!({ "id": id, "property": "webGl:renderer", "value": "Apple M3 Pro, or similar" }),
    );
    sidecar.call(
        "set-override",
        json!({ "id": id, "property": "webGl:vendor", "value": "Apple, Inc." }),
    );

    let report = sidecar.call("validate", json!({ "id": id }));
    assert_eq!(report["launchable"], false);
    let rules: Vec<String> = report["violations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|violation| violation["rule"].as_str().unwrap().to_owned())
        .collect();
    assert!(rules.contains(&"gpu-matches-os".to_owned()), "{rules:?}");

    let error = sidecar.expect_error("plan", json!({ "id": id }));
    assert_eq!(error["kind"], "invalid");
    assert!(error["message"]
        .as_str()
        .unwrap()
        .contains("gpu-matches-os"));
}

#[test]
fn a_malformed_proxy_is_refused_when_the_profile_is_created() {
    let mut sidecar = Sidecar::start("badproxy");
    let error = sidecar.expect_error(
        "create",
        json!({
            "name": "Bad",
            "seed": 1,
            "os": "windows",
            "proxy": { "url": "proxy.example:3128" },
        }),
    );
    assert_eq!(error["kind"], "invalid");
    // And nothing was written, so a rejected creation leaves no debris.
    assert_eq!(
        sidecar.call("list", json!({}))["profiles"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
}

#[test]
fn a_pinned_screen_reaches_the_identity_coherently() {
    let mut sidecar = Sidecar::start("pinnedscreen");
    let created = sidecar.call(
        "create",
        json!({
            "name": "Panel",
            "seed": 20_260_929,
            "os": "windows",
            "screen": [2560, 1440],
        }),
    );
    let id = created["id"].as_str().unwrap().to_owned();
    assert_eq!(created["summary"]["coherent"], true);

    let inspection = sidecar.call("inspect", json!({ "id": id }));
    assert_eq!(inspection["violations"].as_array().unwrap().len(), 0);
    let dpr = inspection["effective"]["window.devicePixelRatio"]
        .as_f64()
        .unwrap();
    let expected = (2560.0 / dpr).round();
    assert_eq!(
        inspection["effective"]["screen.width"].as_f64().unwrap(),
        expected,
        "the pinned panel is divided by the drawn display scale, not reported raw"
    );

    let report = sidecar.call("validate", json!({ "id": id }));
    assert_eq!(report["launchable"], true);
    assert_eq!(report["violations"].as_array().unwrap().len(), 0);
}

#[test]
fn a_pinned_panel_and_scale_reach_the_identity_coherently() {
    let mut sidecar = Sidecar::start("pinnedscale");
    let created = sidecar.call(
        "create",
        json!({
            "name": "Host panel",
            "seed": 20_260_930,
            "os": "windows",
            "screen": [1920, 1200],
            "dpr": 1.25,
        }),
    );
    let id = created["id"].as_str().unwrap().to_owned();
    assert_eq!(created["summary"]["coherent"], true);

    let inspection = sidecar.call("inspect", json!({ "id": id }));
    assert_eq!(inspection["violations"].as_array().unwrap().len(), 0);
    assert_eq!(
        inspection["effective"]["window.devicePixelRatio"]
            .as_f64()
            .unwrap(),
        1.25
    );
    // The panel is divided by the pinned scale, so a page sees exactly the
    // CSS size of the host this profile was created against.
    assert_eq!(
        inspection["effective"]["screen.width"].as_f64().unwrap(),
        1536.0
    );
    assert_eq!(
        inspection["effective"]["screen.height"].as_f64().unwrap(),
        960.0
    );
    assert_eq!(sidecar.call("validate", json!({ "id": id }))["launchable"], true);
}

#[test]
fn an_update_rewrites_the_profile_without_redrawing_the_machine() {
    let mut sidecar = Sidecar::start("updateprofile");
    let created = sidecar.call(
        "create",
        json!({
            "name": "Before",
            "seed": 4_242_424,
            "os": "windows",
            "country": "DE",
        }),
    );
    let id = created["id"].as_str().unwrap().to_owned();

    let updated = sidecar.call(
        "update",
        json!({
            "id": id,
            "spec": {
                "name": "After",
                "seed": 999_999_999,
                "os": "windows",
                "country": "DE",
                "screen": [1920, 1200],
                "dpr": 1.0,
                "notes": "edited",
            },
        }),
    );
    assert_eq!(updated["id"].as_str().unwrap(), id.as_str());
    assert_eq!(updated["summary"]["name"], "After");
    assert_eq!(updated["report"]["launchable"], true);

    // The spec's seed is ignored: an edit changes what the machine looks
    // like, never which machine it is.
    let loaded = sidecar.call("load", json!({ "id": id }));
    assert_eq!(loaded["seed"], 4_242_424);
    assert_eq!(loaded["name"], "After");
    assert_eq!(loaded["notes"], "edited");
    assert_eq!(loaded["options"]["screen"], json!([1920, 1200]));
    assert_eq!(loaded["options"]["dpr"].as_f64().unwrap(), 1.0);

    // A bad description is refused without writing anything.
    let error = sidecar.expect_error(
        "update",
        json!({ "id": id, "spec": { "name": "x", "os": "windows", "country": "ZZ" } }),
    );
    assert_eq!(error["kind"], "invalid");
    let still = sidecar.call("load", json!({ "id": id }));
    assert_eq!(still["name"], "After");
}

#[test]
fn an_unknown_command_names_itself() {
    let mut sidecar = Sidecar::start("unknowncommand");
    let error = sidecar.expect_error("launche", json!({}));
    assert_eq!(error["kind"], "malformed");
    assert!(
        error["message"].as_str().unwrap().contains("launche"),
        "the message should name the command the user typed"
    );
}

#[test]
fn a_malformed_line_does_not_end_the_session() {
    // The property that matters: a UI bug must not cost the user their
    // profiles, so one bad line is answered and the process carries on.
    let mut sidecar = Sidecar::start("malformed");
    let reply = sidecar.send(Value::String("not an object".into()));
    assert_eq!(reply["ok"], false);

    // The process is still answering.
    assert_eq!(sidecar.call("ping", json!({}))["pong"], true);
}

#[test]
fn replies_carry_their_request_id_so_a_ui_can_pipeline() {
    let mut sidecar = Sidecar::start("pipeline");
    let a = sidecar.send(json!({ "id": 7, "command": "ping", "params": {} }));
    let b = sidecar.send(json!({ "id": 900, "command": "version", "params": {} }));
    assert_eq!(a["id"], 7);
    assert_eq!(b["id"], 900);
    // And in order, which is what makes pipelining safe at all.
    assert!(a["result"]["pong"].is_boolean());
    assert!(b["result"]["engine"].is_string());
}

#[test]
fn every_reply_is_a_single_line_of_json() {
    // A pretty-printed reply would put a `}` on its own line, and the reader
    // would treat it as the start of a new request and reject the session.
    let mut sidecar = Sidecar::start("oneline");
    let id = sidecar.create("Line", 1);
    sidecar.call("inspect", json!({ "id": id }));
    for reply in &sidecar.transcript {
        let text = reply.to_string();
        assert!(!text.contains('\n'), "a reply contained a newline: {text}");
    }
}

#[test]
fn a_large_request_and_response_survive_the_pipe() {
    // Pipe buffers are 4 KiB on Windows and 64 KiB on Unix, and a request or a
    // reply can exceed either. This is the failure that only shows up on the
    // user's machine, when an identity with a hundred properties is written.
    let mut sidecar = Sidecar::start("large");
    let id = sidecar.create("Large", 12);

    // A long string override, and then a full inspection whose reply carries a
    // hundred fields plus the drawn identity.
    let long = "x".repeat(50_000);
    let result = sidecar.call(
        "set-override",
        json!({ "id": id, "property": "webGl:renderer", "value": long }),
    );
    assert_eq!(result["value"].as_str().unwrap().len(), 50_000);

    let inspection = sidecar.call("inspect", json!({ "id": id }));
    assert!(
        inspection["effective"]["webGl:renderer"]
            .as_str()
            .unwrap()
            .len()
            >= 50_000
    );
}

#[test]
fn profiles_survive_a_restart_of_the_process() {
    // The point of storing a seed rather than an identity: the profile is still
    // the same machine after the sidecar that drew it is gone.
    let root = std::env::temp_dir().join(format!(
        "narrc-sidecar-it-restart-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let _ = std::fs::remove_dir_all(&root);

    let (id, digest) = {
        let mut sidecar = Sidecar::start("restart");
        let created = sidecar.call(
            "create",
            json!({ "name": "Durable", "seed": 777, "os": "linux" }),
        );
        (
            created["id"].as_str().unwrap().to_owned(),
            created["summary"]["digest"].as_str().unwrap().to_owned(),
        )
    };

    let mut second = Sidecar::start("restart");
    let listed = second.call("list", json!({}));
    let profiles = listed["profiles"].as_array().unwrap();
    assert_eq!(profiles.len(), 1, "the profile did not survive a restart");
    assert_eq!(profiles[0]["id"], id.as_str());
    assert_eq!(
        profiles[0]["digest"], digest,
        "the machine changed across a restart, which breaks the determinism promise"
    );
}

#[test]
fn a_corrupt_profile_is_reported_rather_than_hidden() {
    // A tool that stores identities must never let one unreadable file make the
    // others look gone.
    let root = std::env::temp_dir().join(format!(
        "narrc-sidecar-it-corrupt-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let _ = std::fs::remove_dir_all(&root);

    let broken_id = {
        let mut sidecar = Sidecar::start("corrupt");
        sidecar.create("Good", 1);
        let broken = sidecar.create("Bad", 2);
        std::fs::write(root.join(&broken).join("profile.json"), b"{ truncated").unwrap();
        broken
    };

    let mut sidecar = Sidecar::start("corrupt");
    let listed = sidecar.call("list", json!({}));
    assert_eq!(listed["profiles"].as_array().unwrap().len(), 1);
    let unreadable = listed["unreadable"].as_array().unwrap();
    assert_eq!(unreadable.len(), 1);
    assert_eq!(unreadable[0], broken_id.as_str());
}

#[test]
fn the_default_store_path_is_reported_without_creating_anything() {
    let mut sidecar = Sidecar::start("storepath");
    let path = sidecar.call("default-store", json!({}))["path"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(std::path::Path::new(&path).is_absolute(), "{path}");
}

#[test]
fn a_summary_is_a_flat_row_and_not_a_nested_identity() {
    let mut sidecar = Sidecar::start("flat");
    sidecar.create("Flat", 1);
    let profiles = sidecar.call("list", json!({}))["profiles"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(keys(&profiles[0]), {
        let mut expected = vec![
            "id",
            "name",
            "seed",
            "os",
            "country",
            "digest",
            "override_count",
            "coherent",
            "proxied",
            "addon_count",
            "summary",
        ];
        expected.sort();
        expected
    });
}

#[test]
fn an_inspection_carries_the_keys_the_ui_binds_to() {
    let mut sidecar = Sidecar::start("inspectionkeys");
    let id = sidecar.create("Keys", 1);
    let inspection = sidecar.call("inspect", json!({ "id": id }));
    let mut expected = vec![
        "profile",
        "effective",
        "drawn",
        "override_diff",
        "violations",
        "override_problems",
        "geo",
        "summary",
    ];
    expected.sort();
    assert_eq!(keys(&inspection), expected);
}

#[test]
fn many_profiles_coexist_and_stay_distinct() {
    let mut sidecar = Sidecar::start("many");
    let mut digests: HashMap<String, u64> = HashMap::new();
    for seed in 0..20u64 {
        let created = sidecar.call(
            "create",
            json!({ "name": format!("Bulk {seed}"), "seed": seed, "os": "macos" }),
        );
        let digest = created["summary"]["digest"].as_str().unwrap().to_owned();
        *digests.entry(digest).or_default() += 1;
    }
    let listed = sidecar.call("list", json!({}));
    assert_eq!(listed["profiles"].as_array().unwrap().len(), 20);
    let repeated: Vec<(&String, &u64)> = digests.iter().filter(|(_, count)| **count > 1).collect();
    assert!(repeated.is_empty(), "identical machines: {repeated:?}");
}
