# Upstream provenance

NarciPHBrowser does not ship a browser engine. It composes one: the fingerprints
are applied by [Camoufox](https://github.com/daijro/camoufox), a Firefox
patch-set, and NarciPHBrowser's job is to decide *what* to claim and to hand
that decision to the engine correctly.

Everything in this directory is either copied from Camoufox verbatim or
derived from it. This file records where the copy came from so that a browser
bump can tell you whether it is still valid.

## `camoufox-properties.json`

| | |
| --- | --- |
| Upstream path | `settings/properties.json` |
| Upstream repo | `daijro/camoufox` |
| Taken from | Firefox **156.0.1** (`upstream.sh`: `version=156.0.1`, `release=beta.32`) |
| Upstream licence | MPL-2.0 |
| Modified | No — byte-for-byte copy |

This file is the list of property names Camoufox reads out of `CAMOU_CONFIG_*`
and their expected value types. Camoufox looks every key up by name inside
Gecko; a key it does not recognise is **silently dropped**, with no warning and
no error. That makes this file load-bearing in a way a normal config schema is
not: an out-of-date copy produces profiles that launch cleanly and quietly
present the wrong device.

`schema.rs` compiles the copy in with `include_str!` and asserts that every
name in `schema::keys` exists in it, so a stale constant fails the build rather
than failing silently in production.

## When to re-vendor

Re-copy the file when either happens:

1. Camoufox bumps its Firefox pin past 156, **and** the upstream file changed.
2. A key you need does not appear in `schema::keys`.

To check whether upstream actually changed:

```sh
curl -fsSL https://raw.githubusercontent.com/daijro/camoufox/main/settings/properties.json \
  | diff -u crates/narrc-core/resources/camoufox-properties.json - && echo "identical"
```

If it is identical, bump the version line above anyway — the pin is a claim
about which Firefox the schema was verified against, and a stale claim is worse
than no claim.

## `launchServer.js`

| | |
| --- | --- |
| Upstream path | `pythonlib/camoufox/launchServer.js` |
| Upstream repo | `daijro/camoufox` |
| Taken from | `main` (October 2026) |
| Upstream licence | MPL-2.0 |
| Modified | No — byte-for-byte copy |

This is the automation mount point. Upstream's Python lib runs it as
`node launchServer.js <playwright-core-package-dir>`, writes a single line of
base64-encoded JSON launch options to stdin, reads back a single JSON line
carrying `{"wsEndpoint": "ws://…"}`, and shuts the server down by closing
stdin. `automation.rs` compiles the copy in with `include_str!`, writes it
into the store's `automation/` directory (rewriting whenever the vendored
bytes change), and drives it from [`narrc_core::automation::spawn_agent`] with
the same launch plan an interactive launch uses. A test pins the vendored
bytes by length and by the protocol-critical fragments, so an accidental edit
fails the build rather than changing the protocol under the sidecar and the UI.

## When to re-vendor

Re-copy `camoufox-properties.json` when either happens:

1. Camoufox bumps its Firefox pin past 156, **and** the upstream file changed.
2. A key you need does not appear in `schema::keys`.

To check whether upstream actually changed:

```sh
curl -fsSL https://raw.githubusercontent.com/daijro/camoufox/main/settings/properties.json \
  | diff -u crates/narrc-core/resources/camoufox-properties.json - && echo "identical"
```

If it is identical, bump the version line above anyway — the pin is a claim
about which Firefox the schema was verified against, and a stale claim is worse
than no claim.

Re-copy `launchServer.js` when upstream changes the script's protocol (the
stdin options, the endpoint line, or the shutdown contract). The pinning test
in `automation.rs` will not detect an upstream change by itself — diff before
bumping.

## `webgl-presets.json` — the derived WebGL corpus

The engine can spoof everything a page reads from WebGL beyond the
vendor/renderer pair: `webGl:parameters`, `webGl2:parameters`,
`webGl:supportedExtensions`, `webGl:shaderPrecisionFormats`,
`webGl:contextAttributes`, and the `webGl2:` twins. The values are not
invented — upstream's launcher draws them, conditioned on the GPU it picked,
from **fpgen**, a separate statistical model downloaded from a pinned release.

The pin, verified against the live release on 2026-10-03:

| | |
| --- | --- |
| Upstream repo | `scrapfly/fingerprint-generator` |
| Release | `model-2/2026` |
| Asset | `model-release.zip` — 1,564,571 bytes |
| zip sha256 | `6530b8322cdaa4ec042921c8d9a0369a0e6e0269ba636c01a7203e4a2f109936` |

The zip is small; it unpacks to three zstd files whose decompressed payload is
the bulk: `values.dat` (211,540,141 bytes — a concatenated stream of JSON
values recorded from real machines), `fingerprint-network.json` (a Bayesian
network over 120 nodes with conditional probabilities), and `values.json`
(12,256 record entries keyed by id). The `gpu`, `webgl`, `webgl2` and
`gpuInfo` nodes are exactly the families this crate needs. Upstream pins the
sha256 of each file in `pythonlib/camoufox/fpgen-model.json` and refuses to run
the model against files that do not match.

### What was done instead of porting the sampler

Porting fpgen's Bayesian sampler is the heavy option: it needs the network's
value-code alphabet, which lives in fpgen's *code*, not in the data. The
lighter honest option was taken instead — the corpus was walked once, offline,
and the recorded contexts for the GPUs `pools.rs` already offers were extracted
into this crate's own file:

| | |
| --- | --- |
| Vendored file | `crates/narrc-core/resources/webgl-presets.json` — 207,718 bytes |
| Derived from | `values.dat` in the pinned `model-2/2026` release above |
| Structure | `families["<os>/<family>"] → { vendor, renderer, variants[] }` |
| Keying | `"<os>/<family_of(pool renderer)>"`, the exact normalization Rust applies |
| Transform | upstream `webgl.py`'s `_context_config` — parameters keyed by their recorded constant id, `shaderPrecisionFormats` keyed `"shaderType,precisionType"` |
| Variant cap | 4 recorded contexts per family (a device class is not one machine) |
| Derived corpus | 253 families — Windows 177, Linux 73, macOS 3 — over 327 variants |
| Coverage | 16 of the 31 pool GPUs: 11/11 Windows, 2/12 macOS, 3/8 Linux |

The extraction exploits an ordering fact about the recorded stream, verified
against the file: each `{"vendor":…,"renderer":…}` GPU-pair token is
immediately followed by its WebGL1 context record, its WebGL2 context record,
and a WebGPU/WGSL info token — so the pairs and their contexts can be
associated offline without decoding the network. The extraction scripts are
not kept in the repository (they were throwaway, run against the temp
decompression); to reproduce, decompress the pinned zip, apply `webgl.py`'s
transform to each GPU-pair token's following two records, key each family with
a port of `generator::webgl::family_of`, then prune to the families named in
`pools.rs`. The keying port has to be byte-faithful, including the three
recorded shapes in the table below; the `every_pool_gpu_with_a_recorded_family_resolves`
test is what catches it when it is not.

The extension lists are filtered at draw time by
`generator::webgl::is_blocked`, with upstream's own sets: four extensions a
release Firefox never exposes (`WEBGL_multi_draw`, `WEBGL_clip_cull_distance`,
`EXT_texture_norm16`, `WEBGL_compressed_texture_etc1`) are dropped everywhere,
and `OVR_multiview2` additionally off Windows, where the host GL driver decides
whether it exists.

### Why a missing family is worse than a missing value

This is the part worth reading before touching the extraction, because it is the
difference between "less detailed" and "self-contradictory". Three sites in the
patch set the semantics, all quoted from the pinned upstream sources
(`additions/camoucfg/MaskConfig.hpp` and `patches/webgl-spoofing.patch`):

```cpp
// MaskConfig.hpp — an unset parameter returns the caller's default, and the
// caller passes the *host's* real GL limit as that default.
template <typename T>
inline T MParamGL(uint32_t pname, T defaultValue, bool isWebGL2) {
  if (auto value = MaskConfig::GetNested(
          isWebGL2 ? "webGl2:parameters" : "webGl:parameters",
          std::to_string(pname));
      value.has_value()) {
    return value.value().get<T>();
  }
  return defaultValue;
}
```

```cpp
// webgl-spoofing.patch — GetSupportedExtensions: an empty or absent configured
// list falls through to the host's, so "no extensions" is not expressible.
if (std::vector<std::string> maskValues =
        MaskConfig::GetStringList(mIsWebGL2 ? "webGl2:supportedExtensions"
                                            : "webGl:supportedExtensions");
    !maskValues.empty()) { /* use the list */ }
```

```cpp
// webgl-spoofing.patch — getShaderPrecisionFormat: this is the one WebGL read
// that can be *refused* rather than answered.
if (MaskConfig::CheckBool(
        mIsWebGL2 ? "webGl2:shaderPrecisionFormats:blockIfNotDefined"
                  : "webGl:shaderPrecisionFormats:blockIfNotDefined")) {
  return nullptr;
}
```

So an identity whose renderer is spoofed but whose `webGl:parameters` is absent
presents a name next to the host's real limits — `MAX_TEXTURE_SIZE` from the
machine actually running, beside a renderer string from somewhere else. That is
a stronger tell than either half alone, because the two can be checked against
each other. An absent extension list behaves the same way, and an absent
precision table falls through to the host's unless the block flag is set.

Upstream itself never hits this: `webgl.py` picks the GPU out of the model's own
recorded set and then reads that device's context, so its coverage is 100% by
construction and it never sets `blockIfNotDefined`. The gap is created by this
crate's design — a curated `pools.rs` plus a corpus lookup — and is therefore
this crate's to close.

### The residual gap, and what happens in it

`generator::webgl::write_webgl` handles a miss in the only honest way available:

* it sets `webGl:shaderPrecisionFormats:blockIfNotDefined` and its `webGl2:`
  twin, so the precision query is refused rather than answered with the host's
  values. A refusal carries no information about the machine;
* it leaves the parameter table and the extension list alone, because there is
  no flag that suppresses either — those still come from the host. **This is a
  mitigation, not a fix, and the difference is not cosmetic**;
* `engine::build_plan` adds a non-blocking warning naming the renderer and the
  consequence, which the desktop app shows as a toast on launch. It is a
  warning rather than a coherence rule on purpose: rules are violation-severity
  and any violation makes a profile unlaunchable (`profile.rs::launch_plan`),
  which would turn a corpus gap into a refusal to run roughly half the pool.

The real fix is coverage, and there are two ways to get it:

1. **Widen the extraction.** The corpus holds 253 families (Windows 177, Linux
   73, macOS 3); the current file keeps the 16 that a `pools.rs` renderer
   normalizes onto. Adding a corpus family to the pool also requires inventing
   that GPU's `cores`, `panel` and `weight` — real hardware facts and
   market-share estimates, which `pools.rs` refuses to invent. The
   evidence-based source for them is the network's `gpuInfo` and
   `hardwareConcurrency` conditionals; doing it properly is a larger job than
   this file.
2. **Constrain the pool to the covered GPUs.** Honest and cheap, but it shrinks
   the pool to 11 Windows / 2 macOS / 3 Linux entries and gives up the
   diversity the pool exists for.

Neither is done. The gap is 15 of 31 pool GPUs: 0 of the Windows pool's 11,
10 of the macOS pool's 12 (all the Intel Macs, the M1 Pro/Max, M2, M2 Pro, M3,
M3 Pro — the corpus records only M1 and M4), and 5 of the Linux pool's 8.

### What the engine does *not* read out of the table

Reading the patch says which ids it spoofs; measuring says the same thing back, and the
two agree. `cargo run -p narrc-core --example spoofable` claims a sentinel value for every
id the corpus records and reports which sentinels come back: **15 of WebGL1's 82 ids and 44
of WebGL2's 132** are applied, and the rest — 67 and 88 — are answered by the real GL
context.

That is not a defect in the patch. It answers those from the live context on purpose,
because answering them from a table reads back state the page just changed:
`UNPACK_FLIP_Y_WEBGL` after a `pixelStorei`, `ALPHA_BITS` on an `{alpha: false}` context,
`DRAW_BUFFER0` after `drawBuffers`. What it *is* is a reason not to claim them: the
recorded values are the recorder's state, not the profile's, and a claim the engine ignores
is a claim that becomes a lie the day the engine starts honouring it.

The worst of them are the four WebGL **strings** — `VENDOR`, `RENDERER`, `VERSION`,
`SHADING_LANGUAGE_VERSION` (7936, 7937, 7938, 35724). Stock Firefox answers those itself,
and the fpgen model records **Chrome-shaped** values (`"WebKit"`, `"WebKit WebGL"`,
`"WebGL 1.0 (OpenGL ES 2.0 Chromium)"`) because it models Chrome. They are inert today and
would be a Chrome-only tell in a Firefox profile if the allowlist were ever widened.

`generator::webgl::UNSPOOFED_PARAMETERS` records the measured list, `write_context` drops
those ids at draw time, and `the_corpus_claims_only_parameters_the_engine_reads` fails if a
regenerated corpus reintroduces one. The list belongs to one engine build: it was taken
against Camoufox `156.0.1-beta.33`.

One incidental finding, recorded because it took a crash to learn: a config whose *type*
for an array parameter disagrees with the recording — an array of numbers where
`COLOR_WRITEMASK` records booleans — does not fall back to the real context. The engine
reads the value through a typed cast and the browser dies before loading a page. The
generator writes the corpus's own types, so no profile this crate produces can do it, but
it is a sharp edge worth knowing about.

### A property the engine declares and does not deliver

`navigator.buildID` is in `camoufox-properties.json` with type `str`, and the installed
build does not apply it. Claiming a distinctive value and reading it back returns the
engine's own answer:

* `navigator.buildID` → `20181001000000`, a 14-digit build date from October 2018. A
  claimed value is ignored even when it is a well-formed stamp, so this cannot be patched
  from the config: no pref reaches a compile-time constant. It is a **shared tell** — every
  profile claims Firefox 156 while reporting a 2018 buildID — and the README says so.

`engine::UNAPPLIED_PROPERTIES` records the measured pair, and `build_plan` warns when a
profile claims a different value, in the same non-blocking way as the coverage gap.

### One property we mis-read as unapplied: `navigator.doNotTrack`

`navigator.doNotTrack` was the second entry in that list, and the entry was wrong. It is
in `camoufox-properties.json` with type `str`, and the engine never reads that config key
— but that is because Firefox does not back the value with the property at all. The
main-thread getter, the `WorkerNavigator` getter and the `DNT` request header all derive
from the pref `privacy.donottrackheader.enabled`, which the engine leaves to the build
default. So a profile claiming `"1"` read back `"unspecified"` not because the engine
refuses the value but because nothing had set the pref the value lives in.

The fix is in `Identity::to_prefs_json`, which now writes
`privacy.donottrackheader.enabled` (and its sibling `privacy.globalprivacycontrol.enabled`)
as **JSON booleans**: the startup path in `settings/camoufox.cfg` applies each pref with
`defaultPref(name, prefs[name])`, which is typed by the JSON value, so a string would
silently not set a boolean pref. With the pref in place the read-back returns `"1"` and the
request carries `dnt: 1` — measured, 119/119 compared values agreed.

`navigator.globalPrivacyControl` is the case that *is* applied directly: the engine patches
it from the config key and the launcher mirrors it into the same-named pref
(daijro/camoufox#760), which is why only the `doNotTrack` half of the pair ever diverged.

### Properties whose upstream meaning is not what the name suggests

Six further properties were reachable in the schema but never written by the generator.
Reading the patch set and the launcher (`settings/camoufox.cfg`, `patches/`, `additions/`)
showed several of them are *not* free-standing values: each is a fragment of a coherence
rule the engine applies elsewhere, and writing only the fragment the name suggests produces
a profile that contradicts itself. They are now written by default, and the reason is worth
keeping:

* **`locale:all` becomes `intl.accept_languages`.** It is not one locale — it is the
  accept-languages *list*, and `navigator.languages` is derived from that same pref. An
  earlier version wrote `"en_US"`, which parses to nothing: the page saw an empty
  `navigator.languages` while `navigator.language` claimed `en-US`. It is now the
  hyphenated BCP-47 list (`"en-US, en"`), and the verifier compares `navigator.languages`
  against it — a comparison that was collected but never diffed, which is how the malformed
  value stayed hidden.
* **`locale:script` reaches `intl.locale.requested`**, which selects the browser *UI*
  locale — validation messages, XML parse errors, string bundles — and is a different thing
  from the locale `Intl` formats in. Upstream always sets it as `language-Script-REGION`; a
  `zh-TW` profile that omits the script asks the engine to localize a Taiwan machine as
  Simplified Chinese. `intl.locale.requested` is written unconditionally from the identity's
  own locale, because an absent pref follows the host OS now that more than `en-US` is
  packaged.
* **`mediaDevices:{microphone,speaker,webcam}Groups`.** With none set, the patch answers
  `camou-audio-group-N` / `camou-video-group-N` — a constant on every profile, carrying a
  `camou-` prefix that names the browser. The groups are now drawn per profile as
  `hw-<12 hex>` and shared the way a real machine shares them: a sound card's input and
  output together, a camera its own group, an external webcam's microphone with the camera.
  Matching on the label is the only signal available — the pools are label lists, not device
  trees — so this is one rule keyed on `"Webcam Audio"` and stated as such in the code.
* **`voices:blockIfNotDefined`** is pinned `true` upstream as the fail-closed guard: it is
  what makes an empty or malformed spoofed voice list mean "no voices" rather than "every
  native voice on the host". Not writing it leaves the guard to the engine's default.
* **`humanize:maxTime`** bounds how long one humanized cursor move may take. The engine's
  default is `1.5` s (`kDefaultMaxTimeSeconds`); a profile that enables humanization now
  states its own bound rather than following whatever the engine decides next.
* **`humanize:minTime`** stays deliberately unwritten: it is the *lower* bound, and the
  generator has no reason to force a floor on move duration.

Eleven further properties are behaviour switches or caller-supplied paths, not identity:
`addons`, `certificates`, `certificatePaths`, `debug`, `disableTheming`, `instantAnimations`,
`allowMainWorld`, `allowAddonNewtab`, `disableWorldIsolation`, `forceScopeAccess` and
`humanize:minTime`. Upstream sets none of them by default, and `instantAnimations` is
explicitly documented as observable. They remain reachable through an explicit override and
are listed in `schema::NEVER_DRAWN`, whose test sweeps the generator's option space to fail
the moment a property that *should* be drawn for every profile silently stops being.

A latent generator bug surfaced while writing the groups: `draw_devices` drew the first
`count` entries of a label pool rather than a sample, so every label past the ceiling was
unreachable dead data — on Linux that hid `Webcam Audio` (index 2 of 4), the one label the
group rule above keys on, and on Windows it meant the same two of six microphones on every
profile. A pool whose tail can never be drawn is not a pool.

### Re-vendoring

Re-run the extraction only when the fpgen pin changes (a new model release) or
when `pools.rs` gains a GPU whose family is in the corpus. Both the keying test
(`every_pool_gpu_with_a_recorded_family_resolves`) and the well-formedness test
in `generator/webgl.rs` will fail loudly if the file and the Rust normalization
drift apart.

`family_of` is a two-language contract — the offline script keys the corpus with
a hand-port of the same function — and three recorded shapes had to be handled
for the two sides to meet:

| Shape | Recorded | Pool | Both normalize to |
| --- | --- | --- | --- |
| ANGLE repeats the vendor | `ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) …)` | `ANGLE (AMD, Radeon RX 6600 …)` | `AMD Radeon RX 6600` |
| macOS Metal | `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)` | `Apple M4, or similar` | `Apple M4` |
| Mesa parenthetical | `AMD Radeon Graphics (radeonsi renoir ACO)` | `… (radeonsi, renoir LLVM 15.0.7)` | `AMD Radeon Graphics (renoir)` |

The Mesa rule drops the driver token as well as the version numbers, and that is
load-bearing rather than cosmetic: the corpus records one chip under both
spellings — `AMD Radeon Vega 8 Graphics (radeonsi raven ACO)` and
`(raven LLVM 15.0.7)`, `AMD Radeon Graphics (radeonsi renoir ACO)` and
`(renoir LLVM 19.1.1)`, `(radeonsi rembrandt LLVM 20.1.2)` and
`(… LLVM 21.1.6)`. Keeping the driver would key one device several times and let
a draw depend on which driver build happened to be recorded first.

The coherence layer still guards the *inverse* direction for the uncovered GPUs:
`webgl-context-override` refuses a parameter family that arrives without a
`webGl:renderer` (unset renderer means the engine falls back to the *host's* GPU,
and the parameters would describe a different machine), and
`drop_incoherent_source_values` discards the family together with the GPU pair
that owns it.

## What is *not* here

Fonts. Camoufox ships a ~2.16 GB per-OS font bundle as a release asset and
points Linux at it through `FONTCONFIG_FILE`. NarciPHBrowser never
redistributes the bundle, for the licensing reasons upstream documents in
`scripts/font-metrics/licences.py`. The launcher sets `FONTCONFIG_FILE` only
when a per-profile `fonts.conf` exists beside the profile's browser data —
nothing writes one yet, so on Windows (where Firefox does not use fontconfig)
the variable is simply absent rather than pointing at a file that is not
there.

The wiring is specified and deliberately not implemented until it can be
*run* on Linux, because a wrong `fonts.conf` does not degrade gracefully —
it takes out every font in the browser at once, and none of that is visible
from this Windows machine. The spec, so the work does not start from
nothing:

* The user downloads the bundle for their OS from upstream's own release
  page and unpacks it at `<store root>/fonts/<os>/`; the app never ships
  those bytes.
* At launch, when `<store root>/fonts/<os>/fonts.conf` exists, the launch
  path copies it beside the profile's browser data — the location the plan
  builder already looks at — and `build_plan` then sets `FONTCONFIG_FILE`
  to it in the plan's environment.
* The conf itself must name the bundle's font directories and a per-profile
  cache directory, and its exact shape is the one piece that has to come
  from reading upstream's font script rather than from this document: the
  bundle's internal layout is upstream's, and guessing it is how a Linux
  launch loses all its fonts.
* Unit-testable from any platform: that the env var appears only when the
  conf exists, that its value is the copied file, and that a profile
  without the bundle launches exactly as today. Not testable here: what
  fontconfig does with it.

## Platform coverage: what has actually been run

This file records upstream facts, so it is also the place to be explicit about
which of them were *observed* and which were *reasoned about*.

**Observed, on Windows** (the machine this was developed on, 2026-10-03):
the fpgen release download and its zip sha256; the decompressed sizes of the
three model files; the token ordering in `values.dat`; the extracted corpus and
its keying against `pools.rs`; `launchServer.js` byte-for-byte from upstream's
`pythonlib/camoufox/`; the whole workspace building and its test suites passing.
The three upstream source sites quoted above (`MParamGL`, the extension list
guard, the precision block) were read from the pinned upstream files, not
inferred.

**Observed, on Windows, in a running browser:** the read-back. The engine was
launched at a bundled probe page over a loopback port, with a real profile's own
launch plan, and the page posted back what it could read. That is where the
spoofability measurements, the engine-owned parameter ids, the
`navigator.doNotTrack` and `navigator.buildID` findings, and the array-type crash
above come from — none of them were reasoned about. The host baseline run
(`--example probe -- host`, an empty identity) is what makes the difference
between "the engine applied this" and "the host agrees with it" measurable, and
the answer for two same-vendor GPUs is that most limits agree, so only the few
that differ are evidence. The `doNotTrack` finding was the one that a read-back
*corrected*: the original run recorded the divergence and blamed the engine, and
only the upstream source showed the value is pref-backed and the missing pref was
ours, which the re-run then confirmed.

**Reasoned about, not run:** macOS and Linux. The per-platform code paths exist
and are unit-tested — the engine/core asset-name selection against real upstream
release listings, the POSIX environment ceiling, the WebGL extension filter, the
`ANGLE`/`Mesa`/Apple renderer normalization — but no browser has been launched on
either platform from this codebase. The font bundle that Linux needs is not
wired up (above), and store sealing falls back to plaintext off Windows. The
first real launch on macOS or Linux should be treated as untested, and any
platform claim in the README is a claim about the code, not a report of a run.
**The read-back in particular is a Windows-only result**: the same command on
macOS or Linux would exercise the same code, but nothing here has run it there,
and the macOS pool is the least covered (2 of 12).
