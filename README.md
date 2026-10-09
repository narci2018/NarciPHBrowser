# NarciPHBrowser

An open-source fingerprint browser: a **Donut-style** product surface on a **Camoufox** engine.

NarciPHBrowser manages browser profiles whose entire device fingerprint — GPU, display,
locale, fonts, audio devices, user agent — is generated from a seed, kept coherent, and
held stable for the lifetime of the profile. It exists so that a second browser window
can be, and stay, a different machine.

## What it does

- **Profiles** — create, inspect, edit and launch isolated browser identities. Each
  profile stores a *seed* and the options it was drawn with, not the fingerprint itself,
  so an improved generator quietly improves every existing profile while each stays
  deterministic and recognisable.
- **Coherence** — a profile is a set of claims about one machine, and websites cross-
  check them. A port of Camoufox's `coherence.py` validates and repairs the claims
  (an Apple GPU must sit behind Apple core counts, a window must fit inside its work
  area, a macOS identity has no touchscreen); what cannot be repaired without inventing
  a machine is reported, and an unlaunchable profile is refused at the button.
- **Proxies** — a sealed credential store, health checks with GeoIP receipts, bulk
  assignment, import/export, and a geo gate that refuses to launch a profile whose
  claimed place disagrees with its proxy's observed exit country.
- **Subscriptions & nodes** — Clash-style subscription URLs are served to a bundled
  [mihomo](https://github.com/MetaCubeX/mihomo) core; each node can be latency- and
  speed-tested, and assigning a node to a profile starts a dedicated core instance
  whose local socks5 port lives exactly as long as that browser.
- **Extensions** — per-profile browser extensions: point a profile at an `.xpi` file
  or an unpacked addon directory and the engine loads it at launch (missing paths
  are warned about, never silent).
- **WebGL contexts** — the WebGL1 and WebGL2 parameter tables (limits, precisions,
  extension lists, context attributes) are drawn from a corpus of *recorded* devices,
  conditioned on the GPU the identity already claims, rather than invented as ranges.
  See [WebGL contexts](#webgl-contexts).
- **Automation** — start a profile behind a Playwright server and drive it from any
  Playwright client over a WebSocket endpoint, with the profile's fingerprint applied
  the whole time. See [Driving a profile with Playwright](#driving-a-profile-with-playwright).
- **Deterministic identity** — the same seed always draws the same machine, from named
  RNG sub-streams so new fields never shift the values existing fields draw.
- **Languages** — the interface ships in English and Simplified Chinese. The switcher
  lives under Settings → Appearance, the choice is cached locally and restored on the
  next launch, and a first run follows the system language (`zh-CN`, `zh-TW` and
  `zh-Hans` all resolve to Simplified Chinese). Relative timestamps and counts are
  formatted for the active language rather than translated word-for-word.

## Architecture

```
React UI (Tauri 2 webview)
  │  invoke()
  ▼
Tauri commands (apps/desktop/src-tauri) ─── mihomo bridge (subscription nodes)
  │ in-process
  ▼
narrc-sidecar (apps/sidecar)
  │  also a standalone binary speaking line-delimited JSON on stdin/stdout
  ▼
narrc-core (crates/narrc-core)
  ├─ generator/   seed → hardware → display → place → peripherals → user agent
  ├─ coherence/   cross-field validation and repair
  ├─ engine.rs    identity → chunked CAMOU_CONFIG environment, launch plan
  ├─ automation.rs identity + launchServer.js → Playwright WebSocket endpoint
  └─ profile.rs   seed + options + overrides on disk (sealed at rest)
  ▼
Camoufox (Firefox 156.0.1 patch-set, downloaded from its releases)
```

The generator writes plain data and knows nothing about Firefox; the engine bridge knows
Firefox and nothing about generation. That split is why the fingerprint layer is tested
exhaustively without a browser installed, and why swapping engines would not invalidate a
stored profile.

The sidecar is also a standalone binary (`narrc-sidecar`) with a TypeScript SDK
(`packages/sdk`) over its stdin/stdout protocol, for Node.js consumers and tests.

## WebGL contexts

A GPU name alone is easy to check against a WebGL parameter table: a machine that claims
an RTX 4070 but reports the maximum texture size of an Intel iGPU is not a real machine.
So the generator draws the WebGL1 and WebGL2 contexts — `MAX_TEXTURE_SIZE`,
`MAX_RENDERBUFFER_SIZE`, the shader precision formats, the context attributes, the
supported-extension list — from **real recorded devices**, not from invented ranges.

The recordings come from the [fingerprint-generator](https://github.com/scrapfly/fingerprint-generator)
model (`model-2/2026`, a 1.5 MB pinned release). Its 211 MB corpus was walked once,
offline, and every WebGL context belonging to a GPU `pools.rs` already offers was
extracted into `crates/narrc-core/resources/webgl-presets.json` (203 KB), already in the
exact value shape the engine consumes — the transform is upstream `webgl.py`'s own. The
draw is conditioned on the GPU the identity already claims and picked from a named RNG
sub-stream, so a profile's WebGL limits never change between regenerations.

Three honest gaps, one of which is now closed by measurement rather than provenance:

- **Coverage is partial.** 16 of the 31 pool GPUs have a recorded family (all 11 Windows,
  2 of 12 macOS, 3 of 8 Linux). For the rest, the engine's `MaskConfig::MParamGL` returns
  the *host's* value for every parameter the config omits — so the profile would present a
  spoofed renderer beside the real machine's limits, which is a stronger tell than either
  half alone. The generator refuses the one query it can (the shader-precision format,
  through `blockIfNotDefined`), and launching such a profile raises a warning naming the
  GPU; neither supplies the missing values. Closing the gap means widening the extraction
  or shrinking the pool, and both are documented trade-offs rather than done deals — see
  [`UPSTREAM.md`](crates/narrc-core/resources/UPSTREAM.md).
- **The extension list is filtered per platform**, with upstream's own sets: four
  extensions a release Firefox never exposes are dropped everywhere, and `OVR_multiview2`
  additionally off Windows, where the host GL driver decides whether it exists and a
  spoofed list cannot ask it.
- **The values have now been read back out of a running browser** — see
  [Verifying a profile](#verifying-a-profile). What that found is not all good news, and it
  is reported there rather than here: the parameter table *is* applied (measured, not
  assumed), the engine answers a dozen of the recorded ids itself, and one navigator
  property the engine's own list declares is not delivered by the installed build.

Provenance, the pinned release digest, the upstream source semantics, and the extraction
transform are recorded in
[`crates/narrc-core/resources/UPSTREAM.md`](crates/narrc-core/resources/UPSTREAM.md).

## Verifying a profile

Everything else in this project is a claim about data. The verifier is the one part that
launches the engine, serves a page from a loopback port, and reads back what a site would
actually see — then diffs it against the config the engine was handed.

From the app: open a profile and use the **Verify** tab. It starts the profile's engine at
the bundled probe page, reports how many of the compared values came back as claimed, and
lists every one that did not. The browser closes itself when the page is done, and the run
uses a throwaway profile directory, so nothing is added to the profile's own data. Listing
the agreements too is offered because for a covered GPU most of them are uninteresting; the
mismatches are the answer.

From a shell:

```sh
cargo run -p narrc-core --example probe -- 7 windows   # one profile
cargo run -p narrc-core --example probe -- host        # the host baseline, no identity
```

`host` is the run worth knowing about: it launches the engine with an *empty* identity, so
every value in its report is this machine's own. Diffing a profile's claims against it is
how a value the engine actually applied is told apart from a value the host happened to
agree on — the report on its own cannot tell those apart, because for two NVIDIA GPUs most
limits are identical.

The same thing is on the wire as the `verify` command
(`{"command":"verify","params":{"id":"…","keep_agreements":false}}`) and in the TypeScript
SDK as `client.verify(id, engine?, keepAgreements?)`. A UI must ask before calling it: it
takes seconds and opens a window.

The wired path reproduces the CLI's result on the same machine: for a generated Windows
profile, the `verify` command now answers 119 of 119 compared values agreed in 2.2 s. That
is one more comparison and one more agreement than the first run reported — the extra
comparison is `navigator.languages`, which the verifier collected but never diffed, and the
extra agreement is `navigator.doNotTrack`, which an earlier version of this file blamed on
the engine and which turned out to be our own bug (see below).

### What the read-back found

Run on Windows against Camoufox `156.0.1-beta.33`, on a machine whose real GPU is an
RTX 4070:

- **The parameter table is applied.** Claiming an Intel HD 630's values on that machine
  returns Intel's `MAX_VERTEX_UNIFORM_VECTORS` of 4096 (not the host's 4095), 16 samples
  (not 8), and 212992 combined vertex uniform components (not 212988). The corpus changes
  what a page sees, which is the whole point of it.
- **Most of the table is unprovable, not proven.** Of the ids a family claims, roughly 76
  of 82 (WebGL1) and 115 of 132 (WebGL2) are byte-identical to the host's, because
  Windows ANGLE reports the same limits across modern GPUs. Those agreements are
  consistent with the table being applied; they are not evidence of it. The evidence is the
  handful that differ.
- **The engine answers a dozen of the recorded ids itself.** Measured with
  `cargo run -p narrc-core --example spoofable`: 67 of WebGL1's 82 recorded ids and 88 of
  WebGL2's 132 come from the real context, not the config. They are live state (viewport,
  scissor, enables, bindings, pixel-store flags, draw buffers), framebuffer-dependent bit
  depths, values the patch derives from the page's enabled extensions, and the four WebGL
  *strings*. The generator no longer claims them — see
  `generator::webgl::UNSPOOFED_PARAMETERS` — which is also what keeps the recordings'
  Chrome-shaped strings (`"WebKit"`, `"WebKit WebGL"`) out of a Firefox profile's config.
- **One navigator property the engine declares is not delivered — and one we mis-blamed.**
  `navigator.buildID` is answered by the engine with a fixed `20181001000000` — October
  2018, while the user agent claims Firefox 156, a contradiction present in **every**
  profile and unfixable from the config, because no pref reaches a compile-time constant.
  It is named in `engine::UNAPPLIED_PROPERTIES`, and launching a profile that claims a
  different value raises a warning.
  `navigator.doNotTrack` was the second entry in that list, and it was wrong. Firefox does
  not back that value with the config property at all: the getter, the `WorkerNavigator`
  getter and the `DNT` request header all derive from `privacy.donottrackheader.enabled`,
  which the engine never sets from the config key — so the claim was being dropped and the
  divergence was ours to close, not the engine's. The launch plan now writes that pref (as
  a JSON boolean, since `defaultPref` is typed by the value), and the read-back confirms
  it: `navigator.doNotTrack` returns `"1"` and the request carries `dnt: 1`. Recording a
  leak that no longer exists would have been worse than not testing at all.

A verifier that reported only "everything agrees" would be the least useful version of it.
The point of the list above is that it does not.

## Driving a profile with Playwright

The **Agent** page starts a profile's browser behind a Playwright server and hands back a
WebSocket endpoint. Any Playwright client — Node, Python, Java, .NET — connects to it with
`firefox.connect` and drives a browser that presents that profile's fingerprint the whole
time.

From the GUI: pick a profile, **Start**, and the endpoint is copied to the clipboard.
The start dialog needs one path, the Playwright driver:

| Client | `playwright-core` root | Node runtime |
| --- | --- | --- |
| Node | `node_modules/playwright-core` | `node` on `PATH` |
| Python | `…/site-packages/playwright/driver/package` | `…/site-packages/playwright/driver/node` |

Then, from a Playwright client:

```js
const { firefox } = require("playwright-core");
const browser = await firefox.connect(process.argv[2]); // the ws endpoint
const page = await browser.newPage();
await page.goto("https://example.com");
await browser.close();
```

The same thing without the GUI, over the sidecar's stdin/stdout protocol:

```sh
echo '{"command":"agent-start","params":{"id":"<profile id>","driver_path":"/path/to/playwright-core"}}' \
  | narrc-sidecar
```

or through the SDK:

```ts
import { SidecarClient } from "@narc/sdk";
const client = new SidecarClient();
const { wsEndpoint } = await client.agentStart({
  id: "<profile id>",
  driver_path: "/path/to/playwright-core",
});
```

**Lifecycle is the opposite of a normal launch, on purpose.** An interactive launch is
detached and outlives the app; an automation session is *owned* — closing the app, or
**Stop**, closes the Node server and the browser with it. A session that outlived its
driver would be a browser no one can reach and no one can close. The `port` is optional
(Playwright picks one), and `headless` defaults to `true`.

## Security model

- **Store encryption** — `proxies.json`, `subscriptions.json` and every `profile.json`
  are sealed with Windows DPAPI (current-user scope) before they touch the disk. They
  defend against everything *not* running as your user: synced folders, stolen or
  imaged disks, another machine. They do not defend against malware running in your
  own session — no local app can. Plaintext files from older builds are read and
  migrated on the next save.
- **Proxy core** — each mihomo instance binds its controller to `127.0.0.1` with a
  256-bit CSPRNG secret; cores are tied to the app's Windows job object and reaped even
  on a crash. Browsers spawn detached and break away, so they outlive the app.
- **Geo gate** — a launch with an expected exit country is refused unless the proxy's
  last check agrees, or no check has run.
- Downloads are pinned (engine: `firefox-156.0.1`; core: a tagged mihomo release) and
  the core archive is sha256-verified against the release metadata before extraction.

## Building and running

Requirements: Node ≥ 22, pnpm 10, Rust stable (see `rust-toolchain.toml`).

```sh
pnpm install
pnpm app:dev        # debug build + app window
pnpm app:build      # release build without bundling
cargo test --workspace   # Rust test suites
pnpm test           # TypeScript test suites
pnpm typecheck      # TypeScript across the workspace
```

The Camoufox engine and the mihomo core are downloaded on first use (to
`%USERPROFILE%\camoufox` and `%USERPROFILE%\mihomo` on Windows); profile data lives
under the platform data directory, overridable with `NARCI_STORE`.

## Current limitations

- **Runtime verification is Windows-first.** The engine and core downloaders
  select per-platform assets (zip on Windows, single-file gzip elsewhere) and
  the asset-name logic is tested against real upstream release listings, but
  the macOS and Linux install paths themselves have not been exercised on
  those platforms yet. Concretely: the code paths that differ per platform are
  unit-tested (asset selection, path layout, the WebGL extension filter, the
  POSIX environment ceiling), and the whole workspace builds and tests on
  Windows; **no browser has been launched on macOS or Linux from this codebase**,
  so the first real launch there should be treated as untested. This README
  says so rather than implying a green light.
- **WebGL parameter coverage is partial** — 16 of 31 pool GPUs have a recorded
  family. For the rest the engine answers from the host and the renderer
  contradicts its own limits; a launch warning says so, and the shader-precision
  query is refused instead of answered. See [WebGL contexts](#webgl-contexts).
- Store sealing uses Windows DPAPI; on other platforms stores are written as plaintext
  (readable either way, so files stay portable). The Settings page states this plainly
  rather than showing a lock icon either way.
- The mihomo `config.yaml` written per instance necessarily carries the subscription
  URL in plaintext — the core itself needs it.
- **There is no auto-update.** Wiring Tauri's updater needs a signing keypair and a
  release endpoint that serves signed manifests; adding the plugin without both would
  ship an updater that cannot verify anything, which is worse than no updater. The
  engine itself can be updated from the app — the installer re-checks upstream's
  releases — but the application updates by re-downloading it.
- **The Linux font bundle is unwired, deliberately.** Camoufox ships a ~2.16 GB font
  bundle that this project never redistributes, and a wrong `fonts.conf` takes out
  every font in a Linux browser at once — none of which is visible from the Windows
  machine this is developed on. The wiring spec is written out in
  [`crates/narrc-core/resources/UPSTREAM.md`](crates/narrc-core/resources/UPSTREAM.md)
  and stays unimplemented until it can be run on Linux.
- Integrations and Account remain placeholders. Groups, the cookie-bot warm-up,
  import/export and the trash are implemented — groups and bulk actions live on the
  profiles page, the warm-up on the Agent page.
- **Only the interface is translated.** The Rust backend returns its error and status
  strings in English, and those reach the UI verbatim (via the error path, not the
  translation catalog), so a Chinese-language session still shows English text when a
  backend operation fails. Translating the backend needs a locale plumbed through
  `invoke`, which is not wired up.

## Provenance and licensing

NarciPHBrowser is MPL-2.0 — the full text is in [`LICENSE`](LICENSE). It ships no browser engine: fingerprints are applied by
[Camoufox](https://github.com/daijro/camoufox) (MPL-2.0), whose property list is
vendored byte-for-byte under `crates/narrc-core/resources/` with its provenance
recorded in `crates/narrc-core/resources/UPSTREAM.md`. The same directory holds
`launchServer.js` (upstream's automation server, MPL-2.0) and
`webgl-presets.json`, a derived subset of the
[fingerprint-generator](https://github.com/scrapfly/fingerprint-generator) model
— both documented in `UPSTREAM.md`, with the pinned release digest. Camoufox's
per-OS font bundle is deliberately not redistributed; see that file for the
licensing reasons.
