/**
 * The sidecar client: a typed, promise-based interface over the line protocol.
 *
 * # Why a client rather than raw JSON
 *
 * The sidecar speaks line-delimited JSON on stdin/stdout. That is the right
 * wire format — it is debuggable, it needs no port, and the parent already
 * has the child's pipes — but it is the wrong API for a UI to call directly.
 * Every call site would need to serialise a request, write it, read a line,
 * parse the reply, match the id, and handle the error. That is ten lines of
 * boilerplate per command, and a mistake in any of them is a bug in the UI
 * rather than in the protocol.
 *
 * So the client owns all of it: the id matching, the line buffering, the
 * error construction. The UI calls `client.create({...})` and gets a typed
 * result or a typed error.
 *
 * # The protocol, for reference
 *
 * ```text
 * {"id": 1, "command": "list", "params": {}}
 * -> {"id": 1, "ok": true,  "result": {...}}
 * -> {"id": 1, "ok": false, "error": {"kind": "...", "message": "...", "retryable": false}}
 * ```
 *
 * One JSON object per line, in order. Every request is independent — no
 * transaction, no session, no ordering requirement — so a failed request
 * leaves the store exactly as it was and the UI can retry without first
 * working out what happened.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";

import type {
  AgentSession,
  AgentStartSpec,
  AgentStarted,
  ClearOverrideResult,
  CreateResult,
  CreateSpec,
  DeleteResult,
  Inspection,
  Launched,
  ListResult,
  LaunchPlan,
  Profile,
  Report,
  SetOverrideResult,
  SidecarError,
  UpdateSpec,
  VerifyReport,
  Version,
} from "./types.js";

/** A pending request, awaiting its reply. */
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: SidecarClientError) => void;
}

/**
 * Builds one request line: the whole of the client's half of the wire format.
 *
 * Extracted from the client so the wire shape is testable without spawning a
 * sidecar; `src/wire.test.mjs` pins it byte for byte.
 */
export function buildRequest(id: number, command: string, params: unknown): string {
  return JSON.stringify({ id, command, params }) + "\n";
}

/**
 * Splits sidecar output into complete reply lines.
 *
 * The protocol is line-delimited, but the transport is a pipe: a chunk can end
 * halfway through a reply, and a reply can span any number of chunks. Returns
 * the lines completed by this chunk (blank lines dropped — the protocol never
 * emits one, and a trailing newline would otherwise look like a reply) and the
 * partial tail to prepend to the next chunk.
 */
export function splitLines(
  buffer: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const lines = (buffer + chunk).split("\n");
  const rest = lines.pop() ?? "";
  return { lines: lines.filter((line) => line.trim()), rest };
}

/**
 * An error from the sidecar, with the kind and retry flag the UI branches on.
 *
 * Extends `Error` so it can be thrown and caught normally, and carries the
 * wire fields so the UI can decide what to show without parsing a message.
 */
export class SidecarClientError extends Error {
  /** The category. */
  readonly kind: SidecarError["kind"];
  /** Whether retrying could plausibly succeed. */
  readonly retryable: boolean;

  constructor(error: SidecarError) {
    super(error.message);
    this.name = "SidecarClientError";
    this.kind = error.kind;
    this.retryable = error.retryable;
  }
}

/**
 * A running sidecar, driven over its pipes.
 *
 * The client is `async` throughout because the protocol is inherently
 * asynchronous: every command is a round trip. A synchronous API would
 * block the UI thread for the duration of every call, which for a launch
 * is the entire lifetime of a browser.
 */
export class SidecarClient {
  private readonly child: ChildProcess;
  private readonly stdin: Writable;
  private readonly stdout: Readable;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private buffer = "";

  private constructor(child: ChildProcess) {
    if (!child.stdin) {
      throw new Error("the sidecar has no stdin");
    }
    if (!child.stdout) {
      throw new Error("the sidecar has no stdout");
    }
    this.child = child;
    this.stdin = child.stdin;
    this.stdout = child.stdout;
    this.stdout.on("data", (data: Buffer) => this.handleData(data));
    this.child.on("exit", (code) => this.handleExit(code));
  }

  /**
   * Starts a sidecar and returns a client for it.
   *
   * @param sidecarPath The path to the sidecar binary.
   * @param storePath An explicit store directory. Omit to use the platform
   *   default. An absolute path is required — a relative one would resolve
   *   against the sidecar's working directory, which is wherever the UI
   *   happened to start it, and two launches from different folders would
   *   then use different stores and each would look empty.
   */
  static start(sidecarPath: string, storePath?: string): SidecarClient {
    const env = { ...process.env };
    if (storePath) {
      env.NARCI_STORE = storePath;
    }
    const child = spawn(sidecarPath, [], {
      env,
      stdio: ["pipe", "pipe", "ignore"],
    });
    return new SidecarClient(child);
  }

  /**
   * Sends one request and returns its reply.
   *
   * The id is allocated here and the reply is matched to it, so a UI that
   * pipelines requests can rely on the order of the replies rather than
   * having to match them up itself.
   */
  private send(command: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.stdin.write(buildRequest(id, command, params));
    });
  }

  /** Handles a chunk of output from the sidecar. */
  private handleData(data: Buffer): void {
    const { lines, rest } = splitLines(this.buffer, data.toString());
    this.buffer = rest;
    for (const line of lines) {
      this.handleLine(line);
    }
  }

  /** Handles one complete reply. */
  private handleLine(line: string): void {
    const response = JSON.parse(line) as {
      id: number;
      ok: boolean;
      result?: unknown;
      error?: SidecarError;
    };
    const { id, ok, result, error } = response;
    const pending = this.pending.get(id);
    if (!pending) {
      // A reply to a request that is not pending. This can happen if the
      // UI timed out and abandoned a request, and the reply arrived later.
      // There is nothing to do with it, and it is not an error.
      return;
    }
    this.pending.delete(id);
    if (ok) {
      pending.resolve(result);
    } else if (error) {
      pending.reject(new SidecarClientError(error));
    } else {
      // A reply with neither a result nor an error is a protocol violation.
      // It should never happen, and if it does, the sidecar has a bug.
      pending.reject(
        new SidecarClientError({
          kind: "malformed",
          message: "the sidecar sent a reply with neither a result nor an error",
          retryable: false,
        }),
      );
    }
  }

  /** Handles the sidecar exiting. */
  private handleExit(code: number | null): void {
    // Every pending request is rejected, because the sidecar is gone and
    // will not answer them. The UI should show a "the engine stopped"
    // message rather than a spinner that never ends.
    const error = new SidecarClientError({
      kind: "io",
      message: `the sidecar exited with code ${code ?? "unknown"}`,
      retryable: true,
    });
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  // --------------------------------------------------------------- commands

  /** Liveness, and a round trip for the UI to measure latency with. */
  async ping(): Promise<{ pong: boolean }> {
    return (await this.send("ping", {})) as { pong: boolean };
  }

  /** The versions of the sidecar and the engine it targets. */
  async version(): Promise<Version> {
    return (await this.send("version", {})) as Version;
  }

  /** Where profiles are kept, without creating anything. */
  async defaultStore(): Promise<{ path: string }> {
    return (await this.send("default-store", {})) as { path: string };
  }

  /** A new profile from a description. */
  async create(spec: CreateSpec): Promise<CreateResult> {
    return (await this.send("create", spec)) as CreateResult;
  }

  /** An existing profile rewritten from a description, keeping its seed. */
  async update(id: string, spec: UpdateSpec): Promise<CreateResult> {
    return (await this.send("update", { id, spec })) as CreateResult;
  }

  /** Every profile, as summaries. */
  async list(): Promise<ListResult> {
    return (await this.send("list", {})) as ListResult;
  }

  /** One profile in full. */
  async load(id: string): Promise<Profile> {
    return (await this.send("load", { id })) as Profile;
  }

  /** A profile and everything known about it. */
  async inspect(id: string): Promise<Inspection> {
    return (await this.send("inspect", { id })) as Inspection;
  }

  /** A profile's coherence report. */
  async validate(id: string): Promise<Report> {
    return (await this.send("validate", { id })) as Report;
  }

  /** A profile plus a hand edit. */
  async setOverride(
    id: string,
    property: string,
    value: unknown,
  ): Promise<SetOverrideResult> {
    return (await this.send("set-override", { id, property, value })) as SetOverrideResult;
  }

  /** A profile minus a hand edit. */
  async clearOverride(id: string, property: string): Promise<ClearOverrideResult> {
    return (await this.send("clear-override", { id, property })) as ClearOverrideResult;
  }

  /** A profile removed, with its browser data. */
  async delete(id: string): Promise<DeleteResult> {
    return (await this.send("delete", { id })) as DeleteResult;
  }

  /** The launch plan, without launching. */
  async plan(id: string, engine?: string, headless?: boolean): Promise<LaunchPlan> {
    return (await this.send("plan", { id, engine, headless })) as LaunchPlan;
  }

  /**
   * Launches the profile's engine at a probe page and reports what it exposed.
   *
   * The only call that measures rather than asserts, and the only one that
   * starts a browser: it takes seconds and opens a window, so a UI must ask
   * before calling it. The profile's identity is diffed against what a page
   * could actually read; `keepAgreements` also lists the values that matched,
   * which is over a hundred for a covered GPU.
   */
  async verify(id: string, engine?: string, keepAgreements?: boolean): Promise<VerifyReport> {
    return (await this.send("verify", {
      id,
      engine,
      keep_agreements: keepAgreements,
    })) as VerifyReport;
  }

  /** A profile launched. */
  async launch(id: string, engine?: string, exitCountry?: string): Promise<Launched> {
    return (await this.send("launch", { id, engine, exit_country: exitCountry })) as Launched;
  }

  /** Starts a profile's automation session and returns the connect endpoint. */
  async agentStart(spec: AgentStartSpec): Promise<AgentStarted> {
    return (await this.send("agent-start", spec)) as AgentStarted;
  }

  /** Stops a profile's automation session. */
  async agentStop(id: string): Promise<{ stopped: boolean }> {
    return (await this.send("agent-stop", { id })) as { stopped: boolean };
  }

  /** Every running automation session, for reconnecting after a reload. */
  async agentList(): Promise<{ sessions: AgentSession[] }> {
    return (await this.send("agent-list", {})) as { sessions: AgentSession[] };
  }

  /**
   * Closes the sidecar.
   *
   * Closes stdin, which is the sidecar's exit condition, and waits for the
   * process to exit. The store is flushed the way it would be in production.
   */
  async close(): Promise<void> {
    this.stdin.end();
    await new Promise<void>((resolve) => {
      if (this.child.exitCode !== null) {
        resolve();
        return;
      }
      this.child.on("exit", () => resolve());
    });
  }
}
