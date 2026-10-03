/**
 * The NarciPHBrowser SDK.
 *
 * The SDK is two things: the wire types, which are the contract between the
 * sidecar and the UI, and the client, which is the only way the UI should
 * talk to the sidecar.
 *
 * # The rule
 *
 * The UI must not speak the line protocol directly. Every command goes
 * through the client, so the protocol lives in one place and a change to it
 * is a change to the client rather than to every call site.
 */

export { SidecarClient, SidecarClientError } from "./client.js";
export type {
  AgentSession,
  AgentStartSpec,
  AgentStarted,
  ClearOverrideResult,
  CreateProxy,
  CreateResult,
  CreateSpec,
  DeleteResult,
  DiffEntry,
  ErrorKind,
  FontProfile,
  GeoGate,
  GeoView,
  Inspection,
  Launched,
  ListResult,
  LaunchPlan,
  OverrideProblem,
  Profile,
  ProfileSummary,
  PropertySchema,
  ProxyConfig,
  Report,
  SetOverrideResult,
  SidecarError,
  TargetOs,
  UpdateSpec,
  Verdict,
  VerifyDifference,
  VerifyReport,
  Version,
  Violation,
} from "./types.js";
