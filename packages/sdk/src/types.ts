/**
 * The wire types, mirrored from the Rust sidecar.
 *
 * # Why these are hand-written
 *
 * The Rust side serialises with serde, and serde's shapes are not always
 * obvious from the Rust source: `#[serde(tag = "...")]` changes the JSON
 * structure, `skip_serializing_if` omits fields, and a `BTreeMap` serialises
 * as an object with sorted keys. A type declaration that guesses at any of
 * this will be wrong in a way that only shows up at runtime, in a UI, when
 * a field is `undefined`.
 *
 * So every type here is written out in full, and `src/wire.test.mjs` pins the
 * protocol envelope — the request line the client emits and the reply shapes
 * the parsers accept — against byte-exact fixtures. A change on either side
 * fails the build rather than the user's UI.
 *
 * # The rule for adding a field
 *
 * A field added to a Rust struct must be added here in the same commit, or
 * the type check fails. That is the point: the two cannot drift silently.
 */

// --------------------------------------------------------------------- OS

/** The OS a profile presents. */
export type TargetOs = "windows" | "macos" | "linux";

/** How many fonts to claim. */
export type FontProfile = "stock" | "extended";

// ----------------------------------------------------------------- profile

/** A proxy to launch through. */
export interface ProxyConfig {
  /** A full proxy URL, e.g. `http://user:pass@host:8080`. */
  url: string;
  /** The country the exit IP is expected to be in. */
  exit_country?: string;
}

/** What to draw, and any constraints the user pinned. */
export interface GeneratorOptions {
  /** The OS to impersonate. */
  os: TargetOs;
  /** An explicit display, or `undefined` to draw one the GPU is known to drive. */
  screen?: [number, number];
  /** The display scale pinned alongside the screen, e.g. `1.25`. */
  dpr?: number;
  /** How many fonts to claim. */
  fonts: FontProfile;
  /** Whether to claim `doNotTrack` and `globalPrivacyControl`. */
  tracking_protection: boolean;
  /** A locale tag to pin, e.g. `de-DE`. */
  locale?: string;
  /** A country to pin, which the proxy's exit IP usually determines. */
  country?: string;
}

/**
 * One profile: a name, a seed, and what to draw from it.
 *
 * The identity is *not* stored — only the seed and the options. The same
 * seed always presents the same machine, so an improved generator makes
 * every existing profile better instead of freezing them on the code that
 * happened to create them.
 */
export interface Profile {
  /** The on-disk format version. */
  format: number;
  /** A filesystem-safe identifier, unique within a store. */
  id: string;
  /** What the user calls it. */
  name: string;
  /** Free text the user wrote. Never interpreted. */
  notes: string;
  /** The profile's identity. The same seed always presents the same machine. */
  seed: number;
  /** What to draw, and any constraints the user pinned. */
  options: GeneratorOptions;
  /**
   * Properties the user edited by hand, as a sparse diff over the drawn
   * identity. Empty for a freshly generated profile.
   */
  overrides: Record<string, unknown>;
  /** The proxy to launch through, if any. */
  proxy?: ProxyConfig;
  /** Extra engine arguments, verbatim. */
  extra_args: string[];
  /**
   * Browser extensions that load with the profile, as paths to `.xpi` files
   * or unpacked addon directories. Absent when the profile carries none.
   */
  addons?: string[];
}

// ---------------------------------------------------------------- summary

/**
 * A profile as a list row: what fits on one line, and nothing else.
 *
 * A separate shape from {@link Profile} on purpose. A list of a hundred
 * profiles should not carry a hundred identities — that is megabytes of JSON
 * to render thirty rows, and every one of them is a value the UI has no
 * business holding until the user asks for that profile.
 */
export interface ProfileSummary {
  /** The filesystem-safe id. */
  id: string;
  /** The user's name for it. */
  name: string;
  /** The seed the machine is drawn from. */
  seed: number;
  /** The OS it presents. */
  os: TargetOs;
  /** The country it claims. */
  country: string;
  /** A content hash of the identity, for spotting duplicates. */
  digest: string;
  /** How many hand edits are in force. */
  override_count: number;
  /** Whether it would launch as it stands. */
  coherent: boolean;
  /** Whether a proxy is configured. */
  proxied: boolean;
  /** How many browser extensions load with this profile. */
  addon_count: number;
  /** A one-line summary, for the row. */
  summary: string;
}

// -------------------------------------------------------------- inspection

/**
 * The engine's property schema.
 *
 * The types are the ones `set-override` coerces against — `str`, `uint`,
 * `int`, `double`, `bool`, `array`, `dict` — so a caller can render the right
 * input and refuse a value the engine would drop before sending it.
 */
export interface PropertySchema {
  /** Every property name with its declared type. */
  properties: Record<string, string>;
  /**
   * Properties the generator deliberately never draws.
   *
   * Each is a behaviour switch or a caller-supplied path rather than part of a
   * machine's identity, so an editor should present it as an engine opt-in —
   * with the reasons a user should be asked — instead of as an ordinary field.
   */
  never_drawn: string[];
}

/** One property, before and after. */
export interface DiffEntry {
  /** The property name. */
  property: string;
  /** The drawn value. */
  drawn: unknown;
  /** The effective value. */
  effective: unknown;
  /** Whether the hand edit changed it. */
  overridden: boolean;
}

/** The place a profile claims, flattened for display. */
export interface GeoView {
  /** BCP-47 language. */
  language: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** IANA zone. */
  timezone: string;
  /** Minutes east of UTC. */
  utc_offset: number;
  /** Approximate coordinates. */
  latitude: number;
  longitude: number;
}

/** A profile and everything the UI needs to show it. */
export interface Inspection {
  /** The stored profile. */
  profile: Profile;
  /** What the profile will actually present. */
  effective: Record<string, unknown>;
  /** The identity the seed draws, for diffing against the edits. */
  drawn: Record<string, unknown>;
  /** Properties the edits changed, with both values. */
  override_diff: DiffEntry[];
  /** Every broken invariant. */
  violations: Violation[];
  /** Edits the engine would drop. */
  override_problems: OverrideProblem[];
  /** The place the profile claims. */
  geo: GeoView;
  /** A one-line summary of the machine. */
  summary: string;
}

// ----------------------------------------------------------------- report

/** One broken invariant. */
export interface Violation {
  /** The rule's name, stable across releases so the UI can localise it. */
  rule: string;
  /** A human explanation naming the actual values. */
  detail: string;
}

/**
 * An override the engine would not apply.
 *
 * Both cases are the same failure from the user's side — the value they
 * see in the editor is not the value the page gets — and both are silent
 * in Firefox, so both have to be caught here or not at all.
 */
export type OverrideProblem =
  | {
      /** No such property: a typo, or a name from a newer engine build. */
      problem: "unknown";
      /** The property name. */
      property: string;
    }
  | {
      /** The property exists and wants a different type. */
      problem: "wrong-type";
      /** The property name. */
      property: string;
      /** The type the property wants. */
      expected: string;
      /** The type the value actually is. */
      found: string;
    };

/** A coherence report. */
export interface Report {
  /** The profile's id. */
  id: string;
  /** Every broken invariant. Empty means coherent. */
  violations: Violation[];
  /** Edits the engine would drop. */
  override_problems: OverrideProblem[];
  /** Whether the profile would launch as it stands. */
  launchable: boolean;
  /** The count of properties in the effective identity. */
  property_count: number;
}

// --------------------------------------------------------------- geo gate

/**
 * The outcome of the proxy-country gate.
 *
 * The gate is deliberately one-directional: a mismatch is refused, a match
 * is not proof. A proxy that has moved since it was configured, or a GeoIP
 * database that is simply wrong about a country, both produce a false
 * refusal — which costs the user one dialog, while a false pass costs them
 * an account.
 */
export type GeoGate =
  | { verdict: "not-configured" }
  | { verdict: "pass" }
  | { verdict: "mismatch"; expected: string; observed: string }
  | { verdict: "unknown"; expected: string };

// ----------------------------------------------------------------- launch

/** A launchable description of a browser process. */
export interface LaunchPlan {
  /** The engine binary to run. */
  program: string;
  /** The arguments, in order. */
  args: string[];
  /** The environment, sorted and chunked. */
  env: Record<string, string>;
  /** A no-window launch versus a visible one. */
  headless: boolean;
  /** Warnings raised while building the plan, which do not block the launch. */
  warnings: string[];
}

/** A launch, and the process it made. */
export interface Launched {
  /** The process id, or `undefined` if it could not be read. */
  pid?: number;
  /** The plan that was used. */
  plan: LaunchPlan;
  /** The geo gate's verdict, when a proxy was configured. */
  geo_gate?: GeoGate;
  /** Values the coherence layer dropped to make the profile launchable. */
  discarded: Violation[];
}

// ------------------------------------------------------------------ verify

/**
 * What the comparison concluded about one property.
 *
 * Mirrors the Rust `Verdict`; kebab-case on the wire.
 */
export type Verdict =
  /** The browser exposed exactly what the identity claimed. */
  | "match"
  /**
   * The same value in a different representation — a signed 32-bit reading of
   * an unsigned limit, or an unspecified `doNotTrack` for `"0"`. The `note`
   * says which.
   */
  | "equivalent"
  /** The browser exposed a different value. */
  | "mismatch"
  /** The identity claims a value the probe could not read at all. */
  | "unread"
  /**
   * The browser exposed a value the identity does not claim. With no recorded
   * table this is the host's own value, which is the leak the corpus exists to
   * close.
   */
  | "unclaimed"
  /** The identity asked for the query to be refused and it was. */
  | "refused";

/** One property, its claim, its observation, and the verdict. */
export interface VerifyDifference {
  /** The identity key, so a mismatch names the field to edit. */
  property: string;
  /** What the comparison concluded. */
  verdict: Verdict;
  /** What the identity claimed, or `null` when it claimed nothing. */
  expected: unknown;
  /** What the browser exposed, or `null` when it exposed nothing. */
  observed: unknown;
  /** A short explanation, when the verdict needs one. */
  note?: string;
}

/**
 * The result of one read-back verification run.
 *
 * Produced by launching the engine at a bundled probe page and diffing what a
 * page can read against the identity the engine was handed. The only result in
 * this SDK that is measured rather than asserted.
 */
export interface VerifyReport {
  /** The engine binary that was launched. */
  program: string;
  /** How long the run took, in milliseconds. */
  elapsed_ms: number;
  /** How many properties were compared. */
  checked: number;
  /** How many of them agreed. */
  agreed: number;
  /**
   * Every comparison that did not agree, plus the ones that did when
   * `keep_agreements` was set. The default report is the problems.
   */
  differences: VerifyDifference[];
  /**
   * The request headers the browser sent for the probe page — the only place
   * the wire-level claims can be observed from inside the run.
   */
  headers: Record<string, string>;
  /** The renderer the page read back through `WEBGL_debug_renderer_info`. */
  unmasked_renderer: string | null;
}

/**
 * What an automation session needs beyond a launch.
 *
 * The session drives the profile's browser over Playwright's WebSocket
 * endpoint; `driver_path` is the `playwright-core` package root the vendored
 * automation script requires — `node_modules/playwright-core` for the Node
 * package, `site-packages/playwright/driver/package` for Python Playwright.
 */
export interface AgentStartSpec {
  /** The profile's id. */
  id: string;
  /** An explicit engine binary. Omit for the default. */
  engine?: string;
  /** The proxy's observed exit country, for the geo gate. */
  exit_country?: string;
  /** The `playwright-core` package root to require. */
  driver_path: string;
  /** An explicit Node runtime. Omit to run `node` from `PATH`. */
  node_path?: string;
  /** A WebSocket port to ask for. Omit for Playwright's choice. */
  port?: number;
  /** Whether the automated browser opens a window. Default `false`. */
  headless?: boolean;
}

/** A running automation session: where Playwright clients connect. */
export interface AgentSession {
  /** The profile's id. */
  id: string;
  /** The endpoint a Playwright client passes to `firefox.connect`. */
  wsEndpoint: string;
  /** The Node process running the automation server. */
  pid: number;
}

/** The reply to starting one automation session. */
export interface AgentStarted {
  /** The endpoint a Playwright client passes to `firefox.connect`. */
  wsEndpoint: string;
  /** The Node process running the automation server. */
  pid: number;
  /** The geo gate's verdict, when a proxy was configured. */
  geo_gate?: GeoGate;
}

// ------------------------------------------------------------------ error

/** How a failure should be presented, as data rather than prose. */
export type ErrorKind =
  /** The request could not be parsed, or named a command that does not exist. */
  | "malformed"
  /** No such profile. */
  | "not-found"
  /** The profile exists but the request cannot be carried out as stated. */
  | "invalid"
  /** Two profiles would collide, or a gate refused. */
  | "conflict"
  /** The environment failed: permissions, disk, a missing engine. */
  | "io";

/** A failure, in a form the UI can branch on. */
export interface SidecarError {
  /** The category. */
  kind: ErrorKind;
  /** The explanation, naming the actual values. */
  message: string;
  /**
   * Whether retrying the same request could plausibly succeed.
   *
   * Drives whether the UI offers a retry button. A `not-found` retry is
   * always the same answer; an `io` one might not be.
   */
  retryable: boolean;
}

// ----------------------------------------------------------------- create

/** A proxy as the UI supplies one. */
export interface CreateProxy {
  /** The proxy URL. */
  url: string;
  /** The country the exit IP is expected to be in. */
  exit_country?: string;
}

/** A profile to create, as the UI describes one. */
export interface CreateSpec {
  /** What to call it. */
  name: string;
  /** The identity's seed. Omit to have one drawn. */
  seed?: number;
  /** The OS to present. */
  os: TargetOs;
  /** A country to pin, which a proxy's exit IP usually determines. */
  country?: string;
  /** A locale to pin, e.g. `de-DE`. */
  locale?: string;
  /** A screen to pin, as `[width, height]`. */
  screen?: [number, number];
  /** The display scale to pin alongside the screen, e.g. `1.25`. */
  dpr?: number;
  /** `stock` or `extended` fonts. */
  fonts?: FontProfile;
  /** Whether to claim tracking protection. */
  tracking_protection?: boolean;
  /** Whether the engine humanises programmatic cursor movement. */
  humanize?: boolean;
  /** Notes the user wrote. */
  notes?: string;
  /** A proxy to launch through. */
  proxy?: CreateProxy;
  /** Extra engine arguments, verbatim. */
  extra_args?: string[];
  /**
   * Browser extensions that load with the profile, as paths to `.xpi` files
   * or unpacked addon directories. Absent when the profile carries none.
   */
  addons?: string[];
}

/**
 * A profile to rewrite, as the UI edits one.
 *
 * The same description as {@link CreateSpec} without the seed: editing a
 * profile changes what it looks like, never which machine it is.
 */
export type UpdateSpec = Omit<CreateSpec, "seed">;

// ----------------------------------------------------------------- result

/** The versions of the sidecar and the engine it targets. */
export interface Version {
  /** The sidecar's own version. */
  sidecar: string;
  /** The core library's version. */
  core: string;
  /** The pinned engine build. */
  engine: string;
}

/** The result of a create. */
export interface CreateResult {
  /** The new profile's id. */
  id: string;
  /** The new profile's summary. */
  summary: ProfileSummary;
  /** The new profile's coherence report. */
  report: Report;
}

/** The result of a list. */
export interface ListResult {
  /** Every profile, as summaries. */
  profiles: ProfileSummary[];
  /** Ids on disk that could not be parsed. */
  unreadable: string[];
}

/** The result of a set-override. */
export interface SetOverrideResult {
  /** The property that was set. */
  property: string;
  /** The value that was stored, after coercion. */
  value: unknown;
  /** Whether the value was coerced to a different type. */
  coerced: boolean;
  /** Edits the engine would drop. */
  problems: OverrideProblem[];
  /** The profile's coherence report after the edit. */
  report: Report;
}

/** The result of a clear-override. */
export interface ClearOverrideResult {
  /** The property that was cleared. */
  property: string;
  /** The profile's coherence report after the edit. */
  report: Report;
}

/** The result of a delete. */
export interface DeleteResult {
  /** The id that was deleted. */
  deleted: string;
}
