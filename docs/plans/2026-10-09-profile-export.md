# Profile Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A toolbar 导出 button that writes the selected profiles — or every profile when nothing is selected — into one `.narci.json` bundle, which the existing 导入 button reads alongside single-profile files.

**Architecture:** `narrc-core` gains a `ProfileExportBundle` (same envelope fields as the untouched single `ProfileExport`, `kind: "narciphbrowser-profiles"`) plus `read_profiles_export`, which sniffs `kind` and returns `Vec<ProfileExport>` for either shape. Tauri gains `export_profiles` and `import_profile` learns the bundle. Frontend: `ProfileExportDialog` becomes multi-target, `ProfilesPage` reports its selection upward, and `HomeHeader` gains the 导出 button.

**Tech Stack:** Rust (serde, rfd), Tauri commands, React/TS, react-i18next (`_one`/`_other` plural keys), `pnpm typecheck` / `pnpm lint` / `cargo test -p narrc-core -p narrc-desktop -p narrc-sidecar`.

Spec: `docs/specs/2026-10-09-profile-export-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| Create: `crates/narrc-core/src/profile.rs` (append) | `ProfileExportBundle` + `read_profiles_export` + tests, beside the existing `ProfileExport` |
| Modify: `crates/narrc-core/src/lib.rs:74-76` | Re-export the two new items |
| Modify: `apps/desktop/src-tauri/src/commands.rs:991-1048` | New `export_profiles`; `import_profile` reads both shapes |
| Modify: `apps/desktop/src-tauri/src/main.rs:14,66` | Register `export_profiles` |
| Modify: `apps/desktop/src/i18n/locales/zh.json` + `en.json` | Five new keys (`exportTooltip` + four plural pairs/`_other`s) |
| Rewrite: `apps/desktop/src/components/profile-export-dialog.tsx` | `targets: ExportTarget[]`, single/bundle routing |
| Modify: `apps/desktop/src/pages/profiles.tsx` | `onSelectionChange` callback |
| Modify: `apps/desktop/src/components/home-header.tsx` | 导出 button |
| Modify: `apps/desktop/src/App.tsx` | Selection state, export targets, dialog wiring, import toast |

Task order: core format → reader → commands → copy → dialog → page callbacks → header → App wiring → verify.

---

### Task 1: `ProfileExportBundle` in narrc-core

**Files:**
- Modify: `crates/narrc-core/src/profile.rs` (insert after the `impl ProfileExport` block, before `#[cfg(test)]`, ~line 1129)
- Modify: `crates/narrc-core/src/lib.rs:74-76`
- Test: same file, `mod tests` (append before the closing brace)

- [ ] **Step 1: Write the failing tests**

Append inside `mod tests` in `crates/narrc-core/src/profile.rs` (helpers `sample`, `EXPORT_FORMAT`, `ProxyConfig` are already in scope):

```rust
    #[test]
    fn a_bundle_carries_every_profile_and_scrubs_each_login() {
        let mut with_login = sample("Alpha", 3);
        with_login.proxy = Some(ProxyConfig::new("http://user:pass@10.0.0.1:8080"));
        let without = sample("Beta", 4);

        let bundle = ProfileExportBundle::new(vec![with_login, without]).without_credentials();
        assert_eq!(bundle.profiles.len(), 2);
        let proxy = bundle.profiles[0].proxy.as_ref().expect("the proxy stayed");
        assert_eq!(proxy.url, "http://10.0.0.1:8080");
        assert!(proxy.parts().unwrap().credentials.is_none());
        assert!(bundle.profiles[1].proxy.is_none());

        let parsed = ProfileExportBundle::from_json(bundle.to_json().unwrap().as_bytes()).unwrap();
        assert_eq!(parsed.kind, ProfileExportBundle::KIND);
        assert_eq!(parsed.version, EXPORT_FORMAT);
        assert_eq!(parsed.profiles.len(), 2);
        assert_eq!(parsed.profiles[0].name, "Alpha");
        assert_eq!(parsed.profiles[1].name, "Beta");
    }

    #[test]
    fn a_bundle_refuses_foreign_and_newer_files() {
        let mut value =
            serde_json::to_value(ProfileExportBundle::new(vec![sample("Work", 7)])).unwrap();
        value["kind"] = serde_json::json!("some-other-app");
        let error = ProfileExportBundle::from_json(value.to_string().as_bytes()).unwrap_err();
        assert!(error.to_string().contains("some-other-app"), "{error}");

        let mut value =
            serde_json::to_value(ProfileExportBundle::new(vec![sample("Work", 7)])).unwrap();
        value["version"] = serde_json::json!(EXPORT_FORMAT + 1);
        let error = ProfileExportBundle::from_json(value.to_string().as_bytes()).unwrap_err();
        assert!(error.to_string().contains("newer version"), "{error}");
    }
```

- [ ] **Step 2: Run and watch it fail to compile**

Run: `cargo test -p narrc-core a_bundle_ 2>&1 | Select-Object -First 15`
Expected: `error[E0433]: use of undeclared type or module ProfileExportBundle`

- [ ] **Step 3: Implement the struct and its two mutating steps**

In `crates/narrc-core/src/profile.rs`, insert between the `impl ProfileExport` closing brace and `#[cfg(test)]`:

```rust
/// Many profiles in one export file — the batch the toolbar's 导出 writes
/// and the 导入 button reads back in one go.
///
/// The envelope mirrors [`ProfileExport`] field for field so a reader can
/// sniff `kind` and dispatch without parsing either payload twice; the
/// profiles ride in the store's own shape, exactly as in a single export,
/// and so carry the same deliberate omission — browser data never travels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileExportBundle {
    /// What file this is, so a reader refuses the wrong file politely.
    pub kind: String,
    /// The export format version, shared with [`ProfileExport`].
    pub version: u32,
    /// Unix seconds at which the file was written.
    pub exported_at: u64,
    /// The profiles themselves, in the store's own shape.
    pub profiles: Vec<Profile>,
}

impl ProfileExportBundle {
    /// What a bundle export file calls itself.
    pub const KIND: &str = "narciphbrowser-profiles";

    /// Packages the profiles, as they stand.
    pub fn new(profiles: Vec<Profile>) -> Self {
        Self {
            kind: Self::KIND.to_owned(),
            version: EXPORT_FORMAT,
            exported_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|since| since.as_secs())
                .unwrap_or(0),
            profiles,
        }
    }

    /// The same bundle with every proxy login removed.
    ///
    /// Each profile gets exactly the rewrite a single export gives it —
    /// the same proxy, minus `user:pass` — so a bundle with no credentials
    /// in it needs no per-profile decision from the caller.
    pub fn without_credentials(mut self) -> Self {
        self.profiles = std::mem::take(&mut self.profiles)
            .into_iter()
            .map(|profile| ProfileExport::new(profile).without_credentials().profile)
            .collect();
        self
    }
```

- [ ] **Step 4: Implement `to_json` / `from_json`**

Append inside the same `impl ProfileExportBundle` block:

```rust
    /// The bundle as pretty JSON, for a file a user can read and keep.
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self)
            .map_err(|error| Error::identity(format!("could not serialize the export: {error}")))
    }

    /// Parses a bundle file, refusing files that are not this format.
    pub fn from_json(bytes: &[u8]) -> Result<Self> {
        let bundle: Self = serde_json::from_slice(bytes).map_err(|error| {
            Error::identity(format!(
                "that file is not a NarciPHBrowser profile bundle: {error}"
            ))
        })?;
        if bundle.kind != Self::KIND {
            return Err(Error::identity(format!(
                "that file is a {:?} export, not a {:?} one",
                bundle.kind,
                Self::KIND
            )));
        }
        if bundle.version > EXPORT_FORMAT {
            return Err(Error::identity(format!(
                "that export was written by a newer version of NarciPHBrowser (format {}, this \
                 build understands {}); upgrade before importing",
                bundle.version, EXPORT_FORMAT
            )));
        }
        Ok(bundle)
    }
}
```

- [ ] **Step 5: Re-export from `lib.rs`**

`crates/narrc-core/src/lib.rs` — replace the `pub use profile::{...}` block (lines 74-76) with:

```rust
pub use profile::{GeoGate, Profile, ProfileExport, ProfileExportBundle, ProfileStore, ProxyConfig, TrashedProfile};
```

(Formatting may need to wrap to the repo's line width — run rustfmt on the hunk. `read_profiles_export` joins this list in Task 2.)

- [ ] **Step 6: Run the tests**

Run: `cargo test -p narrc-core a_bundle_`
Expected: `2 passed`.

- [ ] **Step 7: Commit**

```powershell
git add crates/narrc-core/src/profile.rs crates/narrc-core/src/lib.rs
git commit -m "Bundle many profiles into one export file"
```


### Task 2: `read_profiles_export`

**Files:**
- Modify: `crates/narrc-core/src/profile.rs` (free function after `impl ProfileExportBundle`)
- Modify: `crates/narrc-core/src/lib.rs:74-76`
- Test: same file, `mod tests`

- [ ] **Step 1: Write the failing tests**

Append inside `mod tests`:

```rust
    #[test]
    fn the_reader_accepts_both_shapes_and_refuses_foreign_files() {
        // Single: the shape every file written by older builds has.
        let single = ProfileExport::new(sample("Solo", 7)).to_json().unwrap();
        let read = read_profiles_export(single.as_bytes()).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].profile.name, "Solo");

        // Bundle: many profiles, one file.
        let bundle =
            ProfileExportBundle::new(vec![sample("Alpha", 3), sample("Beta", 4)]).to_json().unwrap();
        let read = read_profiles_export(bundle.as_bytes()).unwrap();
        assert_eq!(read.len(), 2);
        assert_eq!(read[0].profile.name, "Alpha");
        assert_eq!(read[1].profile.name, "Beta");

        // Neither shape: the single reader's refusal carries the wrong kind.
        let mut value = serde_json::to_value(ProfileExport::new(sample("Solo", 7))).unwrap();
        value["kind"] = serde_json::json!("some-other-app");
        let error = read_profiles_export(value.to_string().as_bytes()).unwrap_err();
        assert!(error.to_string().contains("some-other-app"), "{error}");

        // A bundle from a future build is this build's problem to refuse.
        let mut value =
            serde_json::to_value(ProfileExportBundle::new(vec![sample("Alpha", 3)])).unwrap();
        value["version"] = serde_json::json!(EXPORT_FORMAT + 1);
        let error = read_profiles_export(value.to_string().as_bytes()).unwrap_err();
        assert!(error.to_string().contains("newer version"), "{error}");
    }

    #[test]
    fn a_read_bundle_imports_into_a_store_that_already_has_the_profile() {
        let store = temp_store("bundle-import");
        let taken = store
            .import(&ProfileExport::new(sample("Alpha", 3)))
            .unwrap();

        let bundle =
            ProfileExportBundle::new(vec![sample("Alpha", 3), sample("Beta", 4)]).to_json().unwrap();
        let mut imported = Vec::new();
        for export in read_profiles_export(bundle.as_bytes()).unwrap() {
            imported.push(store.import(&export).unwrap());
        }
        assert_eq!(imported.len(), 2);
        // The name the store already held keeps its id; the arriving Alpha
        // moves beside it, and Beta takes the free id its name implies.
        assert_eq!(taken.name, "Alpha");
        assert_ne!(imported[0].id, taken.id);
        assert!(store.load(&imported[0].id).unwrap().is_some());
        assert!(store.load(&imported[1].id).unwrap().is_some());
    }
```

- [ ] **Step 2: Run, expect compile failure**

Run: `cargo test -p narrc-core the_reader_accepts 2>&1 | Select-Object -First 15`
Expected: `error[E0425]: cannot find function read_profiles_export in this scope`

- [ ] **Step 3: Implement the reader**

Append after the `impl ProfileExportBundle` closing brace in `crates/narrc-core/src/profile.rs`:

```rust
/// Reads a profile export of either shape: a single [`ProfileExport`] file
/// or a [`ProfileExportBundle`], as a list ready for [`ProfileStore::import`].
///
/// The `kind` field decides — sniffed from one parse, then the chosen
/// reader parses its own payload and applies its own kind and version
/// checks — so a foreign file fails with the wording of the shape it
/// most pretends to be, and a bundle never has to be unwrapped to discover
/// it was a single all along. Older single files keep reading untouched.
pub fn read_profiles_export(bytes: &[u8]) -> Result<Vec<ProfileExport>> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|error| {
        Error::identity(format!("that file is not a NarciPHBrowser profile export: {error}"))
    })?;
    let kind = value.get("kind").and_then(|kind| kind.as_str()).unwrap_or("");
    if kind == ProfileExportBundle::KIND {
        let bundle = ProfileExportBundle::from_json(bytes)?;
        Ok(bundle
            .profiles
            .into_iter()
            .map(ProfileExport::new)
            .collect())
    } else {
        Ok(vec![ProfileExport::from_json(bytes)?])
    }
}
```

- [ ] **Step 4: Re-export**

`crates/narrc-core/src/lib.rs` — the `pub use profile::{...}` block must read exactly:

```rust
pub use profile::{
    read_profiles_export, GeoGate, Profile, ProfileExport, ProfileExportBundle, ProfileStore,
    ProxyConfig, TrashedProfile,
};
```

- [ ] **Step 5: Run, expect pass**

Run: `cargo test -p narrc-core`
Expected: all pass (365), including both new tests.

- [ ] **Step 6: Commit**

```powershell
git add crates/narrc-core/src/profile.rs crates/narrc-core/src/lib.rs
git commit -m "Read single and bundle profile exports through one function"
```


### Task 3: Tauri commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs` (insert `export_profiles` after `export_profile`, ~line 1021; rewrite `import_profile` body, lines 1029-1048)
- Modify: `apps/desktop/src-tauri/src/main.rs:14,66`

- [ ] **Step 1: Add `export_profiles`**

Insert after `export_profile` in `commands.rs` (doc comment included):

```rust
/// Writes the profiles the ids name into one bundle file the user picks.
///
/// Same rationale as [`export_profile`] for being sync, and the same rule
/// about credentials: the file is plain JSON the user may share, so proxy
/// logins leave it unless `include_proxy_login` says otherwise — now for
/// every profile in the file at once. A missing id stops the export before
/// the dialog opens: a bundle silently missing one of its members is worse
/// than no bundle.
#[tauri::command]
pub fn export_profiles(
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
    include_proxy_login: bool,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut profiles = Vec::with_capacity(ids.len());
    for id in &ids {
        let profile = store
            .load(id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("no profile with the id {id:?}"))?;
        profiles.push(profile);
    }
    if profiles.is_empty() {
        return Err("there is nothing to export".to_string());
    }

    let export = narrc_core::ProfileExportBundle::new(profiles);
    let export = if include_proxy_login {
        export
    } else {
        export.without_credentials()
    };

    let Some(path) = rfd::FileDialog::new()
        .set_file_name("profiles.narci.json")
        .add_filter("NarciPHBrowser profile export", &["json"])
        .save_file()
    else {
        // The user closed the dialog; that is a decision, not an error.
        return Ok(serde_json::json!({ "cancelled": true }));
    };

    std::fs::write(&path, export.to_json().map_err(|error| error.to_string())?)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(serde_json::json!({
        "path": path.display().to_string(),
        "count": profiles.len(),
    }))
}
```

- [ ] Step 2: Rewire `import_profile` to the reader

Replace the body of `import_profile` (keep the doc comment; extend its last sentence) with:

```rust
/// Reads a profile file the user picks and adds every profile it holds to
/// the store.
///
/// Same rationale as [`export_profile`] for being sync. An import never
/// overwrites: the store resolves an id collision by moving aside, exactly
/// as a second create of the same name does — and that holds per entry in
/// a bundle, where a failure part-way leaves what imported already in
/// place rather than rolling it back.
#[tauri::command]
pub fn import_profile(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("NarciPHBrowser profile export", &["json"])
        .pick_file()
    else {
        return Ok(serde_json::json!({ "cancelled": true }));
    };

    let bytes = std::fs::read(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let exports =
        narrc_core::read_profiles_export(&bytes).map_err(|error| error.to_string())?;

    let store = open_store(&state)?;
    let mut names = Vec::with_capacity(exports.len());
    for export in &exports {
        let profile = store
            .import(export)
            .map_err(|error| format!("could not import {:?}: {error}", export.profile.name))?;
        names.push(profile.name);
    }
    Ok(serde_json::json!({
        "count": names.len(),
        "names": names,
        "path": path.display().to_string(),
    }))
}
```

- [ ] **Step 3: Register the command**

`apps/desktop/src-tauri/src/main.rs` — in the `commands::{...}` import list (line 14) add `export_profiles,` after `export_profile,`; in the `invoke_handler` list (line 66) add `export_profiles,` after `export_profile,`.

- [ ] **Step 4: Compile**

Run: `cargo check --workspace --all-targets`
Expected: no errors (existing warnings baseline unchanged).

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/main.rs
git commit -m "Export a selection of profiles as one file, import either shape"
```


### Task 4: i18n keys

**Files:**
- Modify: `apps/desktop/src/i18n/locales/zh.json`
- Modify: `apps/desktop/src/i18n/locales/en.json`

Keys are alphabetical. `zh.json` carries `_other` only (Chinese has a single plural form in this app's i18next setup — zero `_one` keys exist); `en.json` carries `_one` + `_other`.

- [ ] **Step 1: zh.json — five lines at four anchor points**

1. After the `"exportProfileDescription"` line, before `"exportProxies"`:

```json
    "exportProfilesCount_other": "导出 {{count}} 个配置文件",
    "exportProfilesDescription_other": "{{count}} 个配置文件 —— 含种子、选项、手动修改、扩展和代理；浏览器数据不随之导出。",
```

2. After `"exportProxiesDescription_other"`, before `"exportedProfile"`:

```json
    "exportTooltip": "将配置文件导出到文件",
```

3. After `"exportedProfile"`:

```json
    "exportedProfilesCount_other": "已导出 {{count}} 个配置文件",
```

4. After `"importedProfile"`:

```json
    "importedProfilesCount_other": "已导入 {{count}} 个配置文件",
```

- [ ] **Step 2: en.json — nine lines at the same anchors**

1. After `"exportProfileDescription"`, before `"exportProxies"`:

```json
    "exportProfilesCount_one": "Export {{count}} profile",
    "exportProfilesCount_other": "Export {{count}} profiles",
    "exportProfilesDescription_one": "{{count}} profile — its seed, options, hand edits, addons and proxy. Importing it elsewhere re-draws the same machine; browser data stays behind.",
    "exportProfilesDescription_other": "{{count}} profiles — their seeds, options, hand edits, addons and proxies. Importing them elsewhere re-draws the same machines; browser data stays behind.",
```

2. After `"exportProxiesDescription_other"`, before `"exportedProfile"`:

```json
    "exportTooltip": "Export profiles to a file",
```

3. After `"exportedProfile"`:

```json
    "exportedProfilesCount_one": "Exported {{count}} profile",
    "exportedProfilesCount_other": "Exported {{count}} profiles",
```

4. After `"importedProfile"`:

```json
    "importedProfilesCount_one": "Imported {{count}} profile",
    "importedProfilesCount_other": "Imported {{count}} profiles",
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/desktop/src/i18n/locales/zh.json','utf8')); JSON.parse(require('fs').readFileSync('apps/desktop/src/i18n/locales/en.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```powershell
git add apps/desktop/src/i18n/locales/zh.json apps/desktop/src/i18n/locales/en.json
git commit -m "Copy for exporting and importing a bundle of profiles"
```


### Task 5: `ProfileExportDialog` multi-target

**Files:**
- Rewrite: `apps/desktop/src/components/profile-export-dialog.tsx` (keep imports, dialog shell, footer structure from the current file; everything below is the new content)

- [ ] **Step 1: Types, props, and the confirm logic (top half of the file)**

Replace everything from `export interface ExportTarget` through the end of `confirm` with:

```tsx
export interface ExportTarget {
  id: string;
  name: string;
  /** Whether the profile has a proxy at all — what a bulk target knows. */
  proxied: boolean;
  /**
   * The proxy URL when the caller knows it exactly (the info dialog reads
   * it off its inspection); absent for bulk targets, which fall back to
   * `proxied` — coarse, but never wrongly excluding a login that exists.
   */
  proxyUrl?: string | null;
}

interface ProfileExportDialogProps {
  targets: ExportTarget[] | null;
  onOpenChange: (open: boolean) => void;
  onExported: () => void;
}

/** Whether a proxy URL carries a login, the way the engine splits it. */
const hasProxyLogin = (url: string): boolean =>
  url.includes("://") && url.slice(url.indexOf("://") + 3).includes("@");

/** Whether any target in the set can carry a login worth asking about. */
const someLogin = (targets: ExportTarget[]): boolean =>
  targets.some((target) =>
    target.proxyUrl === undefined
      ? target.proxied
      : target.proxyUrl !== null && hasProxyLogin(target.proxyUrl),
  );

export function ProfileExportDialog({
  targets,
  onOpenChange,
  onExported,
}: ProfileExportDialogProps) {
  const { t } = useTranslation();
  const [includeLogin, setIncludeLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (targets) return;
    setIncludeLogin(false);
    setBusy(false);
  }, [targets]);

  if (!targets || targets.length === 0) return null;

  const single = targets.length === 1 ? targets[0] : null;
  const loginInUse = someLogin(targets);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = single
        ? await invoke<{ cancelled?: boolean; path?: string }>("export_profile", {
            id: single.id,
            includeProxyLogin: includeLogin,
          })
        : await invoke<{ cancelled?: boolean; path?: string; count?: number }>(
            "export_profiles",
            { ids: targets.map((target) => target.id), includeProxyLogin: includeLogin },
          );
      if (result.cancelled) {
        onOpenChange(false);
        return;
      }
      if (single) {
        toast.success(t("common.exportedProfile", { name: single.name }), {
          description: result.path,
        });
      } else {
        toast.success(
          t("common.exportedProfilesCount", { count: result.count ?? targets.length }),
          { description: result.path },
        );
      }
      onExported();
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };
```

Everything above this point in the current file — the old `ExportTarget`, props interface, `hasProxyLogin`, and the old `confirm` — is deleted; the imports at the top of the file stay as they are.

- [ ] **Step 2: JSX — title and description**

Replace the `<DialogTitle>` and `<DialogDescription>` bodies:

```tsx
          <DialogTitle>
            {single
              ? t("common.exportProfile", { name: single.name })
              : t("common.exportProfilesCount", { count: targets.length })}
          </DialogTitle>
          <DialogDescription>
            {single
              ? t("common.exportProfileDescription")
              : t("common.exportProfilesDescription", { count: targets.length })}
          </DialogDescription>
```

The login checkbox block and footer below are unchanged from the current file (they already read `includeLogin`, `loginInUse`, `busy`, `confirm`).

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: passes — but `App.tsx` still passes `target=` and will error until Task 8. If the only errors are in `App.tsx` about `target`/`targets`, that is the expected intermediate state; note it and continue.

- [ ] **Step 4: Commit**

```powershell
git add apps/desktop/src/components/profile-export-dialog.tsx
git commit -m "Export dialog serves one profile or a whole selection"
```


### Task 6: `ProfilesPage` selection callback

**Files:**
- Modify: `apps/desktop/src/pages/profiles.tsx:1,55-69,116-120`

- [ ] **Step 1: Prop and effect**

1. Line 1 — add `useEffect` to the React import:

```tsx
import { useEffect, useMemo, useState } from "react";
```

2. In `ProfilesPageProps`, after `onBulkTrash: (ids: string[]) => void;`:

```tsx
  /** Reports the visible selection upward (for the header's export), [] on unmount. */
  onSelectionChange?: (ids: string[]) => void;
```

3. Destructure it in the component signature, after `onBulkTrash`:

```tsx
  onSelectionChange,
```

4. After the `selectedIds` / `allSelected` block (line ~120), add:

```tsx
  // The header exports whatever is checked here, so the selection is
  // mirrored upward. Unmount reports [] — leaving the page clears it, or a
  // stale selection would export rows nobody can see.
  useEffect(() => {
    onSelectionChange?.(selectedIds);
    return () => onSelectionChange?.([]);
  }, [selectedIds, onSelectionChange]);
```

(The parent passes the stable `setSelectedProfileIds`, so this effect runs only when the selection itself changes — no render loop.)

- [ ] **Step 2: Commit**

```powershell
git add apps/desktop/src/pages/profiles.tsx
git commit -m "Profiles page reports its selection to the shell"
```

### Task 7: `HomeHeader` 导出 button

**Files:**
- Modify: `apps/desktop/src/components/home-header.tsx:5,77-95,255-272`

- [ ] **Step 1: Prop and button**

1. Line 5 — add `LuUpload` to the react-icons/lu import:

```tsx
import { LuCircleHelp, LuDownload, LuSearch, LuTrash2, LuUpload, LuX } from "react-icons/lu";
```

2. In `Props`, after `onImportProfiles: () => void;`:

```tsx
  onExportProfiles: () => void;
```

3. In the `HomeHeader` destructuring, after `onImportProfiles,`:

```tsx
  onExportProfiles,
```

4. After the 导入 button block (the `{showProfileToolbar && (<Tooltip>...onImportProfiles...</Tooltip>)}` at ~255-272), insert a sibling block — same shape, before the 新建 button:

```tsx
      {showProfileToolbar && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={onExportProfiles}
                disabled={totalProfiles === 0}
                className="flex h-7 items-center gap-1.5 px-2.5 text-xs"
              >
                <LuUpload className="size-3.5" />
                {t("common.export")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("common.exportTooltip")}</TooltipContent>
        </Tooltip>
      )}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/desktop/src/components/home-header.tsx
git commit -m "Toolbar gains an export button beside import"
```


### Task 8: App wiring

**Files:**
- Modify: `apps/desktop/src/App.tsx` (state ~line 131; `handleExportRequest`/`handleImportProfile` ~585-605; `HomeHeader` ~668; `ProfilesPage` ~688; `ProfileExportDialog` ~805)

- [ ] **Step 1: Selection state and export targets**

Next to the existing `const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);` (~line 131) — replace that line and add the selection:

```tsx
  const [exportTargets, setExportTargets] = useState<ExportTarget[] | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
```

- [ ] **Step 2: Handlers**

Replace `handleExportRequest` (~585-594) with the single-element array, and add the toolbar handler after it:

```tsx
  // The export dialog reads the proxy straight off the inspection the info
  // dialog is showing, so its login warning describes the real proxy.
  const handleExportRequest = useCallback(() => {
    if (!inspection || !infoProfileId) return;
    const proxyUrl = inspection.profile.proxy?.url ?? null;
    setExportTargets([
      { id: infoProfileId, name: inspection.profile.name, proxied: proxyUrl !== null, proxyUrl },
    ]);
  }, [inspection, infoProfileId]);

  // The toolbar exports what is checked, or everything when nothing is —
  // the backup path. Bulk targets carry only `proxied`; the dialog's login
  // checkbox treats that as "may carry a login", never as "has none".
  const handleExportProfiles = useCallback(() => {
    const chosen =
      selectedProfileIds.length > 0 ? selectedProfileIds : profiles.map((profile) => profile.id);
    const targets = chosen.flatMap((id) => {
      const profile = profiles.find((candidate) => candidate.id === id);
      return profile ? [{ id: profile.id, name: profile.name, proxied: profile.proxied }] : [];
    });
    if (targets.length === 0) return;
    setExportTargets(targets);
  }, [profiles, selectedProfileIds]);
```

Replace `handleImportProfile` (~596-605) — the command now returns the bundle shape:

```tsx
  const handleImportProfile = useCallback(async () => {
    try {
      const result = await invoke<{ cancelled?: boolean; count?: number; names?: string[] }>(
        "import_profile",
        {},
      );
      if (result.cancelled) return;
      await refreshProfiles();
      const count = result.count ?? 1;
      toast.success(
        count === 1
          ? t("common.importedProfile", { name: result.names?.[0] ?? "" })
          : t("common.importedProfilesCount", { count }),
      );
    } catch (error) {
      toast.error(String(error));
    }
  }, [refreshProfiles, t]);
```

- [ ] **Step 3: Render wiring**

1. `HomeHeader` (~668) — add after the `onImportProfiles` prop:

```tsx
          onExportProfiles={handleExportProfiles}
```

2. `ProfilesPage` (~688) — add after `onBulkTrash`:

```tsx
                onSelectionChange={setSelectedProfileIds}
```

3. `ProfileExportDialog` (~805) — the prop and its closer:

```tsx
      <ProfileExportDialog
        targets={exportTargets}
        onOpenChange={(open) => {
          if (!open) setExportTargets(null);
        }}
        onExported={() => {
          void refreshProfiles();
        }}
      />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/App.tsx
git commit -m "Wire the toolbar export through selection and the dialog"
```


### Task 9: Verify

**Files:** none — commands only.

- [ ] **Step 1: Frontend gates**

Run: `pnpm typecheck`
Expected: passes (all packages).

Run: `pnpm lint`
Expected: `0 errors, 26 warnings` — the pre-existing baseline; a new warning in a touched file is a bug in our code.

- [ ] **Step 2: Rust tests**

Run: `cargo test -p narrc-core -p narrc-desktop -p narrc-sidecar`
Expected: every `test result: ok`, `0 failed` (361+ core tests including the four new bundle/reader tests).

- [ ] **Step 3: rustfmt on my hunks only**

Run: `rustfmt --edition 2021 --check crates\narrc-core\src\profile.rs apps\desktop\src-tauri\src\commands.rs apps\desktop\src-tauri\src\main.rs`

These files carry pre-existing repo-wide rustfmt diffs (profile.rs has ~11 in regions we did not write; commands.rs ~32). The gate: **no diff line may point into the code this plan added** — `ProfileExportBundle`, `read_profiles_export`, the new tests, `export_profiles`, the rewritten `import_profile`. If one does, fix that hunk by hand to match surrounding style; never run `rustfmt` over the whole file.

- [ ] **Step 4: Release build**

Run: `pnpm app:release`
Expected: `Finished release profile` twice (desktop + sidecar), no errors; `target\release\narrc-desktop.exe` timestamped now.

- [ ] **Step 5: Commit any fixes**

```powershell
git add -u
git commit -m "Fix issues found while verifying the profile bundle export"
```

(Only if Step 1-4 required changes; otherwise skip — the per-task commits already carry the work.)

- [ ] **Step 6: Ask the user to smoke-test the UI**

Report in Chinese and ask the user to restart the app, then: check two profiles → 导出 → save → clear selection → 导入 → pick the file → expect a toast `已导入 2 个配置文件` and both profiles present (ids may differ, names may get suffixes if they collide). Also verify a single export from a profile's info dialog still works.

