//! Pins a launched browser's window title to its profile, and draws the
//! same name into the window's own top row.
//!
//! A Firefox window is titled after its active tab, so a taskbar full of
//! windows all sitting on the same site is a row of identical entries — the
//! window cannot be told apart from the profile it belongs to. The launch
//! pins the native window title to `name-group` instead and holds it there
//! for as long as the browser runs: the taskbar, the hover preview and
//! Alt+Tab all read that caption.
//!
//! The window itself draws in tabs-in-titlebar mode, where there is no
//! system titlebar row and the caption has nowhere to render inside the
//! window. The same name therefore also goes into the tab strip: each
//! launch writes it into the profile's own `narrc-title.css`, and the
//! engine's autoconfig file — kept in step by [`ensure_loader`] — injects
//! that file into every browser window as a sheet, sizing the leading
//! titlebar spacer to carry it. One row reads
//! `Profile-1-cool  [tab] [tab]  □ ×`; tabs keep their page titles and
//! dialogs keep theirs.
//!
//! The engine cannot load a profile stylesheet on its own (its
//! `userChrome.css` loader was removed, and the profile's `chrome.manifest`
//! is ignored — both measured), and the install's `chrome.css` is shared by
//! every profile, which is why the label lives in a per-profile file the
//! loader reads: the file is per-profile, the loader is per-install.

/// The title a profile's window carries: the profile name, and the group
/// behind a dash when the profile has one.
///
/// Both halves are trimmed, and an absent or blank group leaves the profile
/// named alone — a trailing dash would say less than the name does.
pub fn label(profile_name: &str, group: Option<&str>) -> String {
    let name = profile_name.trim();
    match group.map(str::trim).filter(|group| !group.is_empty()) {
        Some(group) => format!("{name}-{group}"),
        None => name.to_owned(),
    }
}

/// The per-profile stylesheet the loader injects, at the profile root —
/// where the loader's `ProfD` lookup points.
const TITLE_CSS: &str = "narrc-title.css";

/// The markers wrapping the block [`ensure_loader`] owns inside the
/// engine's `camoufox.cfg`.
///
/// Everything outside them is camoufox's own autoconfig and is left alone;
/// the block itself is static — the per-profile part travels in
/// [`TITLE_CSS`] — so it is written once and only rewritten if it ever
/// changes shape.
const LOADER_BEGIN: &str = "/* narrc-title-loader:begin */";
const LOADER_END: &str = "/* narrc-title-loader:end */";

/// The engine's autoconfig file, where the loader block lives.
const LOADER_CFG: &str = "camoufox.cfg";

/// Writes the profile's in-window title into its `narrc-title.css`.
///
/// The tab strip's leading spacer is the empty titlebar drag region at the
/// row's left edge — the one place a title fits beside the tabs. In
/// tabs-in-titlebar mode the spacer exists and nothing renders in it; this
/// stylesheet lets it size itself to the label and puts the label there.
/// The rules are scoped to `:root[customtitlebar]`, the state in which the
/// spacer is visible, so a window without that state shows no stray text.
///
/// The file is per-profile because the label is per-profile, and it is
/// written wholesale because it belongs to the app alone: a rename or a new
/// group rewrites it on the next launch, and a blank label removes it. Text
/// is escaped down to printable ASCII ([`css_string`]) so the loader's
/// byte-wise read reconstructs the label exactly whatever it is named.
pub fn apply_display(browser_dir: &std::path::Path, label: &str) -> Result<(), String> {
    let path = browser_dir.join(TITLE_CSS);
    let label = label.trim();
    if label.is_empty() {
        return match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("could not remove {}: {error}", path.display())),
        };
    }
    let css = title_css(label);
    if std::fs::read_to_string(&path).is_ok_and(|current| current == css) {
        return Ok(());
    }
    std::fs::create_dir_all(browser_dir)
        .map_err(|error| format!("could not create {}: {error}", browser_dir.display()))?;
    std::fs::write(&path, css)
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

/// Keeps the engine's `camoufox.cfg` carrying the loader block.
///
/// The engine ships without a way to load a per-profile stylesheet, so the
/// block is appended to its autoconfig: at startup it observes each browser
/// window and injects that profile's [`TITLE_CSS`] into it. The block is
/// app-owned but the file is not — only the delimited region is rewritten,
/// any camoufox content around it survives, and a file with the current
/// block already in place is not touched at all.
pub fn ensure_loader(engine_dir: &std::path::Path) -> Result<(), String> {
    let path = engine_dir.join(LOADER_CFG);
    let existing = std::fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let block = loader_block();
    if existing.contains(&block) {
        return Ok(());
    }
    let mut out = strip_loader_block(&existing);
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out.push_str(&block);
    if out == existing {
        return Ok(());
    }
    std::fs::write(&path, out)
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

/// The delimited stylesheet block that renders `label` in the tab strip.
fn title_css(label: &str) -> String {
    format!(
        "/* narrc-window-title: rewritten at every launch; edit the app, not this file. */\n\
         :root[customtitlebar] #TabsToolbar .titlebar-spacer[type=\"pre-tabs\"] {{\n\
           width: auto;\n\
           min-width: 40px;\n\
           display: flex;\n\
           align-items: center;\n\
           padding-inline: 12px 8px;\n\
         }}\n\
         :root[customtitlebar] #TabsToolbar .titlebar-spacer[type=\"pre-tabs\"]::before {{\n\
           content: \"{label}\";\n\
           font-size: 12px;\n\
           font-weight: 600;\n\
           white-space: nowrap;\n\
           user-select: none;\n\
           color: var(--lwt-text-color, -moz-dialog);\n\
         }}\n",
        label = css_string(label)
    )
}

/// The autoconfig block that reads a profile's [`TITLE_CSS`] into each
/// browser window as it finishes starting up.
///
/// The reader walks the file byte by byte — the stylesheet is escaped to
/// printable ASCII, so each byte is the character — and injects it through
/// an XHTML-namespaced `<style>` element: a plain `createElement` in a XUL
/// document makes a XUL-namespace element the style engine ignores, which
/// measured as a sheet that parses and computes yet paints nothing.
fn loader_block() -> String {
    format!("{LOADER_BEGIN}\n{}\n{LOADER_END}\n", LOADER_JS)
}

const LOADER_JS: &str = r#"(function () {
  try {
    Services.obs.addObserver({
      observe: function (subject) {
        try {
          var file = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
          file.append("narrc-title.css");
          if (!file.exists()) {
            return;
          }
          var fis = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
          fis.init(file, 0x01, 444, 0);
          var sis = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);
          sis.init(fis);
          var bytes = [];
          var avail = sis.available();
          while (avail > 0) {
            var chunk = sis.read(avail);
            for (var i = 0; i < chunk.length; i++) {
              bytes.push(chunk.charCodeAt(i) & 255);
            }
            avail = sis.available();
          }
          sis.close();
          fis.close();
          var text = "";
          for (var j = 0; j < bytes.length; j++) {
            text += String.fromCharCode(bytes[j]);
          }
          var doc = subject.document;
          var old = doc.getElementById("narrc-title-style");
          if (old) {
            old.parentNode.removeChild(old);
          }
          var style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
          style.id = "narrc-title-style";
          style.textContent = text;
          doc.documentElement.appendChild(style);
        } catch (e) {}
      }
    }, "browser-delayed-startup-finished");
  } catch (e) {}
})();"#;

/// Removes the delimited loader block, leaving the rest of `camoufox.cfg`
/// byte-for-byte intact.
fn strip_loader_block(text: &str) -> String {
    let mut out = text.to_owned();
    while let (Some(begin), Some(end)) = (out.find(LOADER_BEGIN), out.find(LOADER_END)) {
        if end < begin {
            break;
        }
        let after = end + LOADER_END.len();
        let after = if out[after..].starts_with('\n') {
            after + 1
        } else {
            after
        };
        out = format!("{}{}", &out[..begin], &out[after..]);
    }
    out
}

/// Escapes a label for a CSS string literal.
///
/// A profile may be named with quotes, backslashes, a newline or any
/// non-ASCII text — each would terminate, corrupt, or (because the loader
/// reconstructs the file byte by byte) mistranslate the `content:` string,
/// so control characters get their CSS escape, and everything outside
/// printable ASCII is written as a hexadecimal escape the parser folds back
/// to the original character.
fn css_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\A "),
            '\r' => {}
            c if c.is_ascii_graphic() || c == ' ' => out.push(c),
            c => out.push_str(&format!("\\{:x} ", c as u32)),
        }
    }
    out
}

/// A line in the pin's diagnostic trail, in the temp directory as
/// `narrc-window-title.log`.
///
/// A launch that ends in a browser still showing page titles cannot say
/// which of the three layers failed — the pid handed to the pin, the window
/// enumeration, or the title write — and the browser is gone by the time
/// anyone looks. The trace is the only witness that survives it.
pub fn trace(line: impl AsRef<str>) {
    use std::io::Write;
    let path = std::env::temp_dir().join("narrc-window-title.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{stamp}] {}", line.as_ref());
    }
}

/// Pins `pid`'s browser windows to `label` until that browser exits.
///
/// Returns immediately: the pin runs on a thread of its own, because a
/// browser outlives the launch command that started it.
pub fn pin(pid: u32, label: String) {
    #[cfg(windows)]
    pin_thread(pid, label);
    #[cfg(not(windows))]
    let _ = (pid, label);
}

#[cfg(windows)]
fn pin_thread(pid: u32, label: String) {
    std::thread::spawn(move || {
        trace(format!("pin start pid={pid} label={label:?}"));
        // The same incarnation guard as the core watcher: once this browser
        // exits the OS may hand the pid to a stranger, and the pin must not
        // follow it onto an unrelated window.
        let started = crate::mihomo::process_started_at(pid);
        let mut windowless_ticks = 0u32;
        let mut known_windows: Vec<isize> = Vec::new();
        let mut tick: u32 = 0;
        loop {
            if !crate::mihomo::process_alive_with(pid, started) {
                trace(format!(
                    "pin exit pid={pid} tick={tick}: process gone (found_windows={})",
                    !known_windows.is_empty()
                ));
                return;
            }
            // The windows are re-enumerated every tick rather than cached:
            // a session can restore a second window at any moment, and a
            // cached handle to a closed window would silently pin nothing.
            let windows = find_windows(pid);
            if windows != known_windows {
                trace(format!(
                    "pin pid={pid} tick={tick}: windows changed {} -> {:?}",
                    known_windows.len(),
                    windows
                ));
                known_windows = windows.clone();
            }
            if windows.is_empty() {
                // The window takes a moment to exist. Never finding one is
                // a launch that has no window at all, and deserves a bound
                // rather than a thread spinning for nothing.
                windowless_ticks += 1;
                if windowless_ticks > 240 {
                    trace(format!("pin exit pid={pid}: never a window"));
                    return;
                }
            } else {
                windowless_ticks = 0;
                for hwnd in &windows {
                    // Re-asserted rather than set once: session restore
                    // rewrites the title while it loads, and every later
                    // navigation rewrites it again. Firefox only writes on
                    // a title or tab event, so a correction every half
                    // second wins the taskbar back without a visible fight.
                    let current = title_of(*hwnd);
                    if current != label {
                        set_title(*hwnd, &label);
                        trace(format!(
                            "pin pid={pid} tick={tick}: set hwnd={hwnd} {current:?} -> {label:?}"
                        ));
                    }
                }
            }
            tick += 1;
            if tick % 120 == 0 {
                trace(format!(
                    "pin pid={pid} tick={tick}: alive, {} window(s)",
                    windows.len()
                ));
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}

/// Every visible, unowned top-level window of `pid`.
///
/// Unowned skips the dialogs Firefox opens as children of a window; what is
/// left is the browser's own windows — the main window, a restored second
/// window, the Library — each of which the taskbar shows separately and each
/// of which therefore carries the pin.
#[cfg(windows)]
fn find_windows(pid: u32) -> Vec<isize> {
    struct Search {
        pid: u32,
        windows: Vec<isize>,
    }
    extern "system" fn collect(hwnd: isize, lparam: isize) -> i32 {
        let search = unsafe { &mut *(lparam as *mut Search) };
        let mut window_pid = 0u32;
        unsafe { user32::GetWindowThreadProcessId(hwnd, &mut window_pid) };
        if window_pid == search.pid
            && unsafe { user32::IsWindowVisible(hwnd) } != 0
            && unsafe { user32::GetWindow(hwnd, GW_OWNER) } == 0
        {
            search.windows.push(hwnd);
        }
        1
    }

    let mut search = Search {
        pid,
        windows: Vec::new(),
    };
    unsafe { user32::EnumWindows(Some(collect), &mut search as *mut Search as isize) };
    search.windows
}

/// The window's current title. An empty result means "no title to read",
/// which the pin treats as a mismatch and overwrites.
#[cfg(windows)]
fn title_of(hwnd: isize) -> String {
    let length = unsafe { user32::GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; length as usize + 1];
    let written = unsafe { user32::GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    String::from_utf16_lossy(&buffer[..written.max(0) as usize])
}

#[cfg(windows)]
fn set_title(hwnd: isize, title: &str) {
    let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe { user32::SetWindowTextW(hwnd, wide.as_ptr()) };
}

/// GW_OWNER: the GetWindow selector asking for a window's owner, which is 0
/// for a top-level main window and non-zero for a dialog.
#[cfg(windows)]
const GW_OWNER: u32 = 4;

#[cfg(windows)]
mod user32 {
    #[link(name = "user32")]
    extern "system" {
        pub(super) fn EnumWindows(
            lpenumfunc: Option<extern "system" fn(isize, isize) -> i32>,
            lparam: isize,
        ) -> i32;
        pub(super) fn GetWindowThreadProcessId(hwnd: isize, lpdwprocessid: *mut u32) -> u32;
        pub(super) fn IsWindowVisible(hwnd: isize) -> i32;
        pub(super) fn GetWindow(hwnd: isize, ucmd: u32) -> isize;
        pub(super) fn GetWindowTextLengthW(hwnd: isize) -> i32;
        pub(super) fn GetWindowTextW(hwnd: isize, lpstring: *mut u16, cchmaxcount: i32) -> i32;
        pub(super) fn SetWindowTextW(hwnd: isize, lpstring: *const u16) -> i32;
    }
}

#[cfg(test)]
mod tests {
    use super::label;

    #[test]
    fn a_grouped_profile_carries_both_halves() {
        assert_eq!(label("Shop", Some("Main")), "Shop-Main");
        assert_eq!(label(" 主号 ", Some(" 拼车 ")), "主号-拼车");
    }

    #[test]
    fn an_ungrouped_profile_is_named_alone() {
        assert_eq!(label("Shop", None), "Shop");
        assert_eq!(label("Shop", Some("")), "Shop");
        assert_eq!(label("Shop", Some("   ")), "Shop");
    }

    fn scratch() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "narrc-title-css-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_title_file_is_rewritten_wholesale_and_idempotent() {
        let dir = scratch();
        let path = dir.join(super::TITLE_CSS);
        std::fs::write(&path, "/* hand-edited once */\n").unwrap();

        super::apply_display(&dir, "Profile-1-cool").unwrap();
        let first = std::fs::read_to_string(&path).unwrap();
        assert!(first.contains("Profile-1-cool"));
        assert!(!first.contains("hand-edited"));

        super::apply_display(&dir, "Profile-2").unwrap();
        let second = std::fs::read_to_string(&path).unwrap();
        assert!(!second.contains("Profile-1-cool"));
        assert!(second.contains("Profile-2"));

        // Writing the same label again changes nothing — not the bytes.
        let stamp = std::fs::metadata(&path).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(50));
        super::apply_display(&dir, "Profile-2").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), second);
        assert_eq!(std::fs::metadata(&path).unwrap().modified().unwrap(), stamp);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn labels_are_escaped_for_the_content_string() {
        let dir = scratch();
        super::apply_display(&dir, "a\"b\\c\nd").unwrap();
        let text = std::fs::read_to_string(dir.join(super::TITLE_CSS)).unwrap();
        assert!(text.contains("content: \"a\\\"b\\\\c\\A d\""), "{text}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The loader rebuilds the stylesheet byte by byte, so anything outside
    /// printable ASCII has to travel as a CSS escape the parser folds back.
    #[test]
    fn a_label_beyond_ascii_is_hex_escaped() {
        let dir = scratch();
        super::apply_display(&dir, "主号-拼车").unwrap();
        let text = std::fs::read_to_string(dir.join(super::TITLE_CSS)).unwrap();
        assert!(
            text.contains("content: \"\\4e3b \\53f7 -\\62fc \\8f66 \""),
            "{text}"
        );
        assert!(text.is_ascii(), "{text}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_empty_label_leaves_no_title_file() {
        let dir = scratch();
        super::apply_display(&dir, "Shop").unwrap();
        super::apply_display(&dir, "  ").unwrap();
        assert!(!dir.join(super::TITLE_CSS).exists());
        // A profile that never carried a title is a success, not a failure.
        super::apply_display(&dir, "").unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_loader_block_is_appended_once_and_keeps_the_rest() {
        let dir = scratch();
        let path = dir.join(super::LOADER_CFG);
        std::fs::write(&path, "// camoufox's own\npref(\"a\", 1);\n").unwrap();

        super::ensure_loader(&dir).unwrap();
        let first = std::fs::read_to_string(&path).unwrap();
        assert!(first.starts_with("// camoufox's own\npref(\"a\", 1);\n"));
        assert_eq!(first.matches(super::LOADER_BEGIN).count(), 1);
        assert_eq!(first.matches(super::LOADER_END).count(), 1);
        assert!(
            first.contains("browser-delayed-startup-finished"),
            "{first}"
        );

        // The block is static: an engine already carrying it is untouched.
        let stamp = std::fs::metadata(&path).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(50));
        super::ensure_loader(&dir).unwrap();
        assert_eq!(std::fs::metadata(&path).unwrap().modified().unwrap(), stamp);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// An engine touched by an older build (or edited by hand between the
    /// markers) is brought back to the current block, never doubled.
    #[test]
    fn a_stale_loader_block_is_replaced_in_place() {
        let dir = scratch();
        let path = dir.join(super::LOADER_CFG);
        std::fs::write(
            &path,
            "// camoufox's own\n\
             /* narrc-title-loader:begin */\n\
             var stale = true;\n\
             /* narrc-title-loader:end */\n\
             pref(\"z\", 9);\n",
        )
        .unwrap();

        super::ensure_loader(&dir).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(!text.contains("stale"), "{text}");
        assert_eq!(text.matches(super::LOADER_BEGIN).count(), 1);
        assert_eq!(text.matches(super::LOADER_END).count(), 1);
        assert!(text.starts_with("// camoufox's own\n"), "{text}");
        assert!(text.contains("pref(\"z\", 9);"), "{text}");
        assert!(text.contains("browser-delayed-startup-finished"), "{text}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The autoconfig file it edits must actually exist — an engine without
    /// one is an error the launch can see, not a file created from nothing.
    #[test]
    fn the_loader_needs_a_real_autoconfig() {
        let dir = scratch();
        let error = super::ensure_loader(&dir).unwrap_err();
        assert!(error.contains("camoufox.cfg"), "{error}");
        assert!(!dir.join(super::LOADER_CFG).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The whole pipeline against the real engine and the real profile:
    /// loader into `camoufox.cfg`, title into the profile, then a spawn
    /// whose pid the caller captures a window of — the pieces verified
    /// one at a time only add up if they land together, on the real paths,
    /// in the launch order the command uses.
    #[cfg(windows)]
    #[test]
    #[ignore = "edits the real engine and profile and opens a browser; run by hand"]
    fn the_real_title_pipeline_lands() {
        let engine = narrc_core::engine::engine_install_dir();
        super::ensure_loader(&engine).expect("the loader did not land");

        let root = narrc_sidecar::store_path::default_store().expect("no default store");
        let store = narrc_core::profile::ProfileStore::open(root).expect("could not open store");
        let profile = store
            .list()
            .into_iter()
            .find(|profile| profile.name == "Profile-1")
            .expect("Profile-1 is missing");
        let dir = store.browser_dir(&profile.id);
        let wanted = super::label(&profile.name, profile.group.as_deref());
        super::apply_display(&dir, &wanted).expect("the title css did not land");

        let css = std::fs::read_to_string(dir.join(super::TITLE_CSS)).expect("no title css");
        assert!(
            css.is_ascii(),
            "the title css must stay byte-transparent: {css}"
        );
        assert!(css.contains(&super::css_string(&wanted)), "{css}");
        let cfg = std::fs::read_to_string(engine.join(super::LOADER_CFG)).expect("no cfg");
        assert_eq!(cfg.matches(super::LOADER_BEGIN).count(), 1);
        assert_eq!(cfg.matches(super::LOADER_END).count(), 1);

        let (plan, _) = profile
            .launch_plan_after_discarding_conflicts(&dir, None, false)
            .expect("could not build a plan");
        let chunks =
            narrc_core::engine::numbered_chunks(&plan.env, narrc_core::engine::PREFS_PREFIX);
        let prefs: serde_json::Value =
            serde_json::from_str(&narrc_core::engine::rejoin_chunks(&chunks))
                .expect("the prefs are JSON");
        assert_eq!(prefs["browser.tabs.inTitlebar"], serde_json::json!(1));
        let pid = narrc_sidecar::protocol::spawn_with_program(&plan, &plan.program)
            .expect("could not spawn the engine")
            .expect("the engine spawned without a pid");
        std::fs::write(
            std::env::temp_dir().join("narrc-e2e-pid.txt"),
            pid.to_string(),
        )
        .expect("could not hand the pid to the caller");
        println!("e2e: pid={pid} label={wanted:?}");
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "opens a real browser window; run by hand"]
    fn a_launched_window_title_is_pinned_to_the_profile() {
        let engine =
            narrc_core::engine::engine_install_dir().join(narrc_core::engine::engine_binary_name());
        assert!(
            engine.exists(),
            "the engine is not installed at {}",
            engine.display()
        );

        let dir = std::env::temp_dir().join(format!("narrc-title-smoke-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let plan = narrc_core::engine::LaunchPlan {
            program: engine.display().to_string(),
            args: vec![
                "--profile".to_owned(),
                dir.display().to_string(),
                "--no-remote".to_owned(),
                "--new-instance".to_owned(),
                "--no-first-run".to_owned(),
                "--no-default-browser-check".to_owned(),
                "about:blank".to_owned(),
            ],
            env: std::collections::BTreeMap::new(),
            headless: false,
            warnings: Vec::new(),
        };
        let pid = narrc_sidecar::protocol::spawn_with_program(&plan, &plan.program)
            .expect("could not spawn the engine")
            .expect("the engine spawned without a pid");
        let wanted = label("冒烟", Some("测试"));
        super::pin(pid, wanted.clone());

        let mut verdict = String::new();
        for _ in 0..120 {
            let titles: Vec<String> = super::find_windows(pid)
                .iter()
                .map(|hwnd| super::title_of(*hwnd))
                .collect();
            if titles.iter().any(|title| *title == wanted) {
                verdict = format!("pinned after the wait: {titles:?}");
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        if verdict.is_empty() {
            let titles: Vec<String> = super::find_windows(pid)
                .iter()
                .map(|hwnd| super::title_of(*hwnd))
                .collect();
            verdict = format!("never reached {wanted:?}; windows {titles:?}");
        }

        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let _ = std::fs::remove_dir_all(&dir);

        assert!(verdict.starts_with("pinned"), "{verdict}");
    }
}
