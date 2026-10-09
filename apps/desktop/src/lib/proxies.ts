import i18n from "@/i18n";

/** A stored proxy as the list command returns it. */
export interface StoredProxy {
  id: string;
  name: string;
  url: string;
  exit_country?: string | null;
  last_check?: ProxyCheck | null;
  used_by?: ProxyUsage[];
}

/** A health check's receipt, as `check_proxy` records it. */
export interface ProxyCheck {
  ok: boolean;
  ip?: string | null;
  country?: string | null;
  city?: string | null;
  error?: string | null;
  latency_ms: number;
  checked_at: number;
}

export interface ProxyUsage {
  id: string;
  name: string;
}

export type ImportCandidate =
  | { kind: "ready"; url: string; exitCountry?: string; suggestedName?: string; source: string }
  | { kind: "ambiguous"; source: string; options: string[] }
  | { kind: "invalid"; source: string; reason: string };

const ALLOWED_SCHEMES = ["http", "https", "socks", "socks5", "socks5h"];

export const SCHEME_OPTIONS: { value: string; label: string }[] = [
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS (CONNECT)" },
  { value: "socks5", label: "SOCKS5" },
];

export function defaultPort(scheme: string): number {
  if (scheme === "https") return 443;
  if (scheme === "socks" || scheme === "socks5" || scheme === "socks5h") return 1080;
  return 80;
}

export interface ParsedProxy {
  scheme: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

function decode(component: string): string {
  try {
    return decodeURIComponent(component);
  } catch {
    return component;
  }
}

/** The URL split the way `ProxyConfig::parts` splits it, or `null` when the launcher would refuse it. */
export function parseProxyUrl(raw: string): ParsedProxy | null {
  const url = raw.trim();
  const split = url.split("://");
  if (split.length !== 2 || !split[0] || !split[1]) return null;
  const scheme = split[0].toLowerCase();
  if (!ALLOWED_SCHEMES.includes(scheme)) return null;
  const rest = split[1];
  if (rest.includes("/") || rest.includes("?") || rest.includes("#")) return null;

  let credentials: string | undefined;
  let hostPort = rest;
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    credentials = rest.slice(0, at);
    hostPort = rest.slice(at + 1);
  }

  let host: string;
  let port: number;
  const colon = hostPort.lastIndexOf(":");
  if (colon >= 0) {
    host = hostPort.slice(0, colon);
    const rawPort = Number(hostPort.slice(colon + 1));
    if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) return null;
    port = rawPort;
  } else {
    host = hostPort;
    port = defaultPort(scheme);
  }
  if (!host) return null;

  let username: string | undefined;
  let password: string | undefined;
  if (credentials !== undefined) {
    const sep = credentials.indexOf(":");
    if (sep >= 0) {
      username = decode(credentials.slice(0, sep));
      password = decode(credentials.slice(sep + 1));
    } else {
      username = decode(credentials);
    }
  }

  return { scheme, host, port, username, password };
}

export interface ProxyUrlParts {
  scheme: string;
  host: string;
  port: number | string;
  username: string;
  password: string;
}

/** Assembles a proxy URL from form fields, percent-encoding the credentials. */
export function buildProxyUrl(parts: ProxyUrlParts): string {
  const scheme = parts.scheme || "http";
  const port = String(parts.port ?? "").trim();
  const host = parts.host.trim();
  const username = parts.username.trim();
  const password = parts.password;
  let credentials = "";
  if (username) {
    credentials = password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : `${encodeURIComponent(username)}@`;
  }
  const portSuffix = port ? `:${port}` : "";
  return `${scheme}://${credentials}${host}${portSuffix}`;
}

/** A message the backend would refuse, or `null` when the URL is acceptable. */
export function validateProxyUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return "A proxy URL is required.";
  if (!url.includes("://")) return "The URL needs a scheme, e.g. http://";
  const parsed = parseProxyUrl(url);
  if (!parsed) {
    const scheme = url.split("://")[0]?.toLowerCase() ?? "";
    if (scheme && !ALLOWED_SCHEMES.includes(scheme)) {
      return `Unsupported scheme "${scheme}". Use http, https or socks5.`;
    }
    return "The URL must look like scheme://host:port with a port between 1 and 65535.";
  }
  return null;
}

export function schemeOf(url: string): string {
  return url.split("://")[0]?.toLowerCase() ?? "";
}

export function schemeLabel(url: string): string {
  const scheme = schemeOf(url);
  return scheme ? scheme.toUpperCase() : "?";
}

/** Whether the connection to this proxy is encrypted on the wire. */
export function isPlaintextFirstHop(url: string): boolean {
  return schemeOf(url) !== "https";
}

export function hostPortOf(url: string): string {
  const parsed = parseProxyUrl(url);
  if (!parsed) return url;
  return `${parsed.host}:${parsed.port}`;
}

export function maskPassword(url: string): string {
  const parsed = parseProxyUrl(url);
  if (!parsed || !parsed.username) return url;
  const credentials = parsed.password
    ? `${parsed.username}:••••`
    : parsed.username;
  return `${parsed.scheme}://${credentials}@${parsed.host}:${parsed.port}`;
}

function looksLikePort(token: string): boolean {
  const value = Number(token);
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** One line of an import file, judged the way the list would judge it. */
export function parseImportLine(raw: string): ImportCandidate {
  const line = raw.split("#")[0].trim();
  if (!line) {
    return { kind: "invalid", source: raw, reason: "empty" };
  }
  if (line.includes("://")) {
    const error = validateProxyUrl(line);
    if (error) return { kind: "invalid", source: line, reason: error };
    const parsed = parseProxyUrl(line);
    return {
      kind: "ready",
      url: line,
      source: line,
      suggestedName: parsed ? `${parsed.host}:${parsed.port}` : undefined,
    };
  }

  const parts = line.split(/[\s,;]+/).filter(Boolean);
  let tokens = parts;
  if (parts.length === 1 && parts[0].includes(":")) {
    tokens = parts[0].split(":");
  }

  if (tokens.length === 2 && looksLikePort(tokens[1])) {
    const url = `http://${tokens[0]}:${tokens[1]}`;
    const error = validateProxyUrl(url);
    if (error) return { kind: "invalid", source: line, reason: error };
    return { kind: "ready", url, source: line, suggestedName: `${tokens[0]}:${tokens[1]}` };
  }
  if (tokens.length === 4) {
    const hostFirst = looksLikePort(tokens[1]);
    const userFirst = looksLikePort(tokens[3]);
    const asHostFirst = `http://${tokens[2]}:${tokens[3]}@${tokens[0]}:${tokens[1]}`;
    const asUserFirst = `http://${tokens[0]}:${tokens[1]}@${tokens[2]}:${tokens[3]}`;
    if (hostFirst && !userFirst) {
      return { kind: "ready", url: asHostFirst, source: line, suggestedName: `${tokens[0]}:${tokens[1]}` };
    }
    if (userFirst && !hostFirst) {
      return { kind: "ready", url: asUserFirst, source: line, suggestedName: `${tokens[2]}:${tokens[3]}` };
    }
    if (hostFirst && userFirst) {
      return { kind: "ambiguous", source: line, options: [asHostFirst, asUserFirst] };
    }
    return { kind: "invalid", source: line, reason: "No port between 1 and 65535 in the line." };
  }
  return {
    kind: "invalid",
    source: line,
    reason: "Expected scheme://host:port, host:port, or host:port:user:pass.",
  };
}

/** Judged lines for a whole pasted file, JSON or TXT. */
export function parseImport(text: string): ImportCandidate[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : (parsed as { proxies?: unknown }).proxies;
      if (!Array.isArray(items)) {
        return [{ kind: "invalid", source: trimmed.slice(0, 80), reason: "JSON must be an array." }];
      }
      return items.map((item, index): ImportCandidate => {
        if (typeof item === "string") {
          const candidate = parseImportLine(item);
          return candidate;
        }
        const record = item as Record<string, unknown>;
        const url = typeof record.url === "string" ? record.url : "";
        const error = validateProxyUrl(url);
        if (error) {
          return { kind: "invalid", source: `item ${index + 1}`, reason: error };
        }
        return {
          kind: "ready",
          url: url.trim(),
          exitCountry:
            typeof record.exit_country === "string" && record.exit_country.trim()
              ? record.exit_country.trim().toUpperCase()
              : undefined,
          suggestedName: typeof record.name === "string" && record.name.trim() ? record.name.trim() : undefined,
          source: `item ${index + 1}`,
        };
      });
    } catch {
      return [{ kind: "invalid", source: trimmed.slice(0, 80), reason: "Not valid JSON." }];
    }
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => parseImportLine(line))
    .filter((candidate) => candidate.kind !== "invalid" || candidate.reason !== "empty");
}

export function formatExport(proxies: StoredProxy[], format: "txt" | "json"): string {
  if (format === "json") {
    return JSON.stringify(
      proxies.map((proxy) => ({
        name: proxy.name,
        url: proxy.url,
        ...(proxy.exit_country ? { exit_country: proxy.exit_country } : {}),
      })),
      null,
      2,
    );
  }
  return proxies.map((proxy) => proxy.url).join("\n");
}

/** A short relative description of when a check ran, in the active UI locale. */
export function relativeTime(unixSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  const format = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto", style: "narrow" });
  if (seconds < 10) return format.format(0, "second");
  if (seconds < 60) return format.format(-seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.floor(hours / 24), "day");
}

/** A profile and a proxy agree when the proxy's exit sits where the profile claims. */
export function geoCompatible(
  exitCountry: string | null | undefined,
  profileCountry: string | null | undefined,
): boolean {
  if (!exitCountry) return true;
  if (!profileCountry) return false;
  return exitCountry.toUpperCase() === profileCountry.toUpperCase();
}
