# Profile export from the toolbar — design

Date: 2026-10-09
Status: approved, awaiting implementation plan

## Problem

Profiles can be imported from the toolbar, but export has no toolbar entry: it
lives only inside a profile's info dialog and only ever writes one profile at
a time. A user who wants to hand someone a set of profiles — or back the store
up — has no visible way to do it, and no file shape that holds more than one
profile.

## Decisions (from Q&A)

1. **Scope of the toolbar export**: what is checked is what is exported;
   with nothing checked, everything is exported (the dialog states the
   count). With an empty store and no selection the button is disabled.
2. **File shape**: one `.narci.json` carrying N profiles, mirroring how proxy
   import/export already packs many entries into one file. Import reads both
   the single-profile shape (every file written by older builds) and the new
   bundle shape.
3. **Route**: a new bundle format in `narrc-core` (option A), not a
   folder-of-files export — one dialog out, one dialog back in.

## 1. Data format (narrc-core)

New `ProfileExportBundle`, sibling of the untouched `ProfileExport`:

```jsonc
{
  "kind": "narciphbrowser-profiles",   // single is "narciphbrowser-profile"
  "version": 1,                        // EXPORT_FORMAT, shared
  "exported_at": 1770000000,
  "profiles": [ /* Profile, in the store's own shape */ ]
}
```

- `new(profiles)` packages as it stands; `without_credentials()` rewrites each
  profile's proxy exactly as the single export does (same URL, no login);
  `to_json()` pretty-prints; `from_json()` checks `kind` and refuses a
  `version` newer than this build with the same wording family as the single
  export.
- `read_profiles_export(bytes) -> Vec<ProfileExport>`: parse once, sniff
  `kind`, expand a bundle into one `ProfileExport` per profile, pass a single
  export through as a one-element vector; unknown kinds and malformed files
  keep the existing refusal messages.
- The single format is not modified in any way: files written by earlier
  builds keep importing.

## 2. Backend commands (commands.rs)

- **New `export_profiles(ids, include_proxy_login)`**: load each profile
  (a missing id errors and names it) → build the bundle →
  `without_credentials()` unless opted in → save dialog (default
  `profiles.narci.json`, json filter) → write. Cancelled returns
  `{ cancelled: true }`; success returns `{ path, count }`.
- **Existing `import_profile` gains the bundle**: reads via
  `read_profiles_export`, imports every entry through the existing
  `store.import` (an id collision moves aside — a bundle import never
  overwrites), returns `{ count, names, path }`.
- The single-profile `export_profile` command and the info-dialog entry that
  uses it do not change.

## 3. Frontend

- **Toolbar** (`home-header.tsx`, directly after 导入): an outline `导出`
  button, icon `LuUpload` paired with the import's `LuDownload`, new prop
  `onExportProfiles`, tooltip `exportTooltip`.
- **Selection plumbing**: `ProfilesPage` gains `onSelectionChange(ids)`,
  reporting its visible selection upward (and `[]` on unmount). The header's
  export action resolves the id list at click time: selection if non-empty,
  else every profile; disabled when that resolves to nothing.
- **Dialog**: `ProfileExportDialog` switches from `target: ExportTarget |
  null` to `targets: ExportTarget[] | null`; one component serves both the
  info dialog (a single-element array, unchanged behaviour) and the toolbar:
  - `ExportTarget` becomes `{ id, name, proxied: boolean, proxyUrl?: string
    | null }`: the info dialog still passes the real proxy URL from its
    inspection, so a single export detects a login exactly;
    `loginInUse = targets.some(t => t.proxyUrl ? hasProxyLogin(t.proxyUrl) :
    t.proxied)` — bundle targets have no URL in hand and use the summary's
    `proxied` flag, coarse but never wrongly excluding a login that exists.
  - Title: single → `导出 {{name}}`; bundle → the count title.
  - The three existing warning branches — enabled-checked (plaintext
    warning), enabled-unchecked (no login in the file), disabled (no proxy
    at all) — are kept.
  - Success toast: single → existing `exportedProfile`; bundle →
    `exportedProfilesCount` with the path as description.

## 4. Copy (i18n, zh + en)

New keys: `exportTooltip`, `exportProfilesCount` (plural via the existing
`_one` / `_other` convention), `exportProfilesDescription` (carries the
existing portability explanation — seeds, options, hand edits, extensions,
proxies; browser data is not exported — plus the count),
`exportedProfilesCount`, `importedProfilesCount`. Single-item paths keep
using `exportedProfile` / `importedProfile` unchanged: the import command
now returns `{ count, names, path }`, and the frontend feeds `names[0]` to
`importedProfile` when `count === 1` (the info dialog's export toast is
untouched).

## 5. States and errors

- Empty store: export disabled; import unchanged.
- Export: write failure → toast with the raw error; cancel → silent.
- Import: not-a-NarciPHBrowser-file and newer-version refusals reuse the
  current wording. There is no rollback in a bundle that fails part-way:
  entries imported before the failure stay (import is additive; rerunning
  the same file yields fresh copies with new ids, exactly like importing one
  file twice), and the returned error names the entry that failed.
- Success toasts state the path (export) or the count (import).

## 6. Tests

- Rust: bundle round-trip; `without_credentials` over multiple profiles;
  `read_profiles_export` recognises both shapes and refuses a foreign kind
  and a newer version; importing a two-profile bundle gives both profiles
  free ids when they collide with the store. Existing single-export tests
  stay as they are.
- Frontend: `pnpm typecheck`, `pnpm lint`; manual smoke — export a selection
  of two, re-import the file, see both arrive.

## Out of scope

- Exporting browser data directories (unchanged: never portable).
- Import preview/selection inside a file (import takes the file as given,
  same as today).
- Changing the info dialog's per-profile export entry.
