import { invoke } from "@tauri-apps/api/core";

/** A stored subscription as the list command returns it. */
export interface SubscriptionRow {
  id: string;
  name: string;
  url: string;
  updated_at?: number | null;
  node_count?: number | null;
}

/** One node inside a subscription, as the core reports it. */
export interface SubscriptionNode {
  name: string;
  kind: string;
  alive: boolean;
  delay?: number | null;
  speed?: number | null;
  exit_country?: string | null;
}

/** A profile's route through a subscription node, as stored. */
export interface StoredAssignment {
  profile_id: string;
  subscription_id: string;
  node: string;
}

/** What a profile should be routed through, decided when it is saved. */
export interface NodeAssignment {
  subscription_id: string;
  node: string;
}

/** What a test measured for one node, and whether it is running. */
export interface NodeResult {
  delay?: number | null;
  speed?: number | null;
  /** The exit an echo service saw through the node, when one was measured. */
  exit?: NodeExit | null;
  delayError?: string | null;
  speedError?: string | null;
  exitError?: string | null;
  testingDelay?: boolean;
  testingSpeed?: boolean;
  testingExit?: boolean;
}

/** The exit an echo service reported for a node. */
export interface NodeExit {
  ip: string;
  country?: string | null;
  city?: string | null;
}

/** A URL with its path and query hidden, so a token never sits on screen. */
export function maskSubscriptionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return url.length > 32 ? `${url.slice(0, 32)}…` : url;
  }
}

/** Which colour a measured latency earns. */
export function delayTone(delay: number | null | undefined): "fast" | "ok" | "slow" | "none" {
  if (delay == null) return "none";
  if (delay <= 200) return "fast";
  if (delay <= 500) return "ok";
  return "slow";
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: width }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

/** Lists the stored subscriptions. */
export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const result = await invoke<{ subscriptions: SubscriptionRow[] }>("list_subscriptions");
  return result.subscriptions;
}

/** Lists a subscription's nodes. */
export async function listSubscriptionNodes(id: string): Promise<SubscriptionNode[]> {
  const result = await invoke<{ nodes: SubscriptionNode[] }>("list_subscription_nodes", { id });
  return result.nodes;
}

/** Re-fetches a subscription's nodes from its provider. */
export async function refreshSubscription(id: string): Promise<SubscriptionNode[]> {
  const result = await invoke<{ nodes: SubscriptionNode[] }>("refresh_subscription", { id });
  return result.nodes;
}

/** Measures one node's latency, in milliseconds. */
export async function testNodeDelay(id: string, node: string): Promise<number | null> {
  const result = await invoke<{ delay: number | null }>("test_node_delay", {
    payload: { subscription_id: id, node },
  });
  return result.delay;
}

/** Measures every node in one batch: node name to delay in milliseconds. */
export async function testAllNodeDelays(id: string): Promise<Record<string, number>> {
  const result = await invoke<{ delays: Record<string, number> }>("test_subscription_delays", {
    id,
  });
  return result.delays;
}

/** Measures one node's download speed, in megabits per second.
 * Returns null if the node is alive but speed cannot be measured (e.g. bandwidth-capped exits). */
export async function testNodeSpeed(id: string, node: string): Promise<number | null> {
  const result = await invoke<{ mbps: number | null }>("test_node_speed", {
    payload: { subscription_id: id, node },
  });
  return result.mbps ?? null;
}

/** Reports which country a node's traffic really exits from. */
export async function testNodeExit(id: string, node: string): Promise<NodeExit> {
  const result = await invoke<NodeExit>("test_node_exit", {
    payload: { subscription_id: id, node },
  });
  return result;
}

/** Every stored profile-to-node route. */
export async function listAssignments(): Promise<StoredAssignment[]> {
  const result = await invoke<{ assignments: StoredAssignment[] }>("list_assignments");
  return result.assignments;
}

/** Routes `profileId` through `assignment`'s node, replacing any earlier route. */
export async function assignNode(profileId: string, assignment: NodeAssignment): Promise<void> {
  await invoke("assign_node", {
    payload: {
      profile_ids: [profileId],
      subscription_id: assignment.subscription_id,
      node: assignment.node,
    },
  });
}

/** Drops the route `profileId` had, leaving it direct. */
export async function unassignNode(profileId: string): Promise<void> {
  await invoke("unassign_node", { payload: { profile_ids: [profileId] } });
}

export const BUILTIN_PSIPHON_ID = "builtin-psiphon";
export const BUILTIN_VPNGATE_ID = "builtin-vpngate";
export const BUILTIN_MEGAV_ID = "builtin-megav";

export type SpecialSubscriptionType = "psiphon" | "vpngate" | "megav";

export const SPECIAL_SUBSCRIPTIONS: Record<
  SpecialSubscriptionType,
  { id: string; name: string; title: string; desc: string }
> = {
  psiphon: {
    id: BUILTIN_PSIPHON_ID,
    name: "Psiphon",
    title: "Psiphon (赛风)",
    desc: "赛风官方全球免费抗审查节点，高混淆强穿透。",
  },
  vpngate: {
    id: BUILTIN_VPNGATE_ID,
    name: "VPNGate",
    title: "VPN Gate (筑波大学)",
    desc: "全球志愿者公开公共中继节点，实时轮换更新。",
  },
  megav: {
    id: BUILTIN_MEGAV_ID,
    name: "MegaV",
    title: "MegaV",
    desc: "专为突破审查打造的高性能 VLESS Reality / VMess 免费节点。",
  },
};

/** Ensures built-in special subscriptions are ready in store and disk. */
export async function ensureSpecialSubscriptions(): Promise<void> {
  await invoke("ensure_special_subscriptions");
}

/** Refreshes a special subscription's nodes by re-fetching upstream and pruning timed-out nodes. */
export async function refreshSpecialSubscription(
  id: string,
  timedOutNodes?: string[],
): Promise<SubscriptionNode[]> {
  const result = await invoke<{ nodes: SubscriptionNode[] }>("refresh_special_subscription", {
    id,
    timedOutNodes: timedOutNodes && timedOutNodes.length > 0 ? timedOutNodes : null,
  });
  return result.nodes;
}

/** Immediately removes timed-out nodes from a special subscription. */
export async function pruneSpecialNodes(
  id: string,
  timedOutNodes: string[],
): Promise<SubscriptionNode[]> {
  const result = await invoke<{ nodes: SubscriptionNode[] }>("prune_special_subscription_nodes", {
    id,
    timedOutNodes,
  });
  return result.nodes;
}

/** Lists nodes for a special subscription. */
export async function listSpecialNodes(id: string): Promise<SubscriptionNode[]> {
  const result = await invoke<{ nodes: SubscriptionNode[] }>("list_special_nodes", { id });
  return result.nodes;
}

export interface CountryGroup {
  countryCode: string;
  countryName: string;
  flag: string;
  nodes: SubscriptionNode[];
}

const COUNTRY_MAP: Record<string, { code: string; name: string; flag: string }> = {
  US: { code: "US", name: "美国", flag: "🇺🇸" },
  JP: { code: "JP", name: "日本", flag: "🇯🇵" },
  KR: { code: "KR", name: "韩国", flag: "🇰🇷" },
  DE: { code: "DE", name: "德国", flag: "🇩🇪" },
  GB: { code: "GB", name: "英国", flag: "🇬🇧" },
  UK: { code: "GB", name: "英国", flag: "🇬🇧" },
  SG: { code: "SG", name: "新加坡", flag: "🇸🇬" },
  HK: { code: "HK", name: "中国香港", flag: "🇭🇰" },
  TW: { code: "TW", name: "中国台湾", flag: "🇹🇼" },
  NL: { code: "NL", name: "荷兰", flag: "🇳🇱" },
  FI: { code: "FI", name: "芬兰", flag: "🇫🇮" },
  FR: { code: "FR", name: "法国", flag: "🇫🇷" },
  CA: { code: "CA", name: "加拿大", flag: "🇨🇦" },
  AU: { code: "AU", name: "澳大利亚", flag: "🇦🇺" },
  RU: { code: "RU", name: "俄罗斯", flag: "🇷🇺" },
  IN: { code: "IN", name: "印度", flag: "🇮🇳" },
  TR: { code: "TR", name: "土耳其", flag: "🇹🇷" },
  BR: { code: "BR", name: "巴西", flag: "🇧🇷" },
  CH: { code: "CH", name: "瑞士", flag: "🇨🇭" },
  SE: { code: "SE", name: "瑞典", flag: "🇸🇪" },
  PL: { code: "PL", name: "波兰", flag: "🇵🇱" },
  IT: { code: "IT", name: "意大利", flag: "🇮🇹" },
  ES: { code: "ES", name: "西班牙", flag: "🇪🇸" },
};

const FLAG_TO_COUNTRY: Record<string, { code: string; name: string; flag: string }> = {
  "🇺🇸": { code: "US", name: "美国", flag: "🇺🇸" },
  "🇯🇵": { code: "JP", name: "日本", flag: "🇯🇵" },
  "🇰🇷": { code: "KR", name: "韩国", flag: "🇰🇷" },
  "🇩🇪": { code: "DE", name: "德国", flag: "🇩🇪" },
  "🇬🇧": { code: "GB", name: "英国", flag: "🇬🇧" },
  "🇸🇬": { code: "SG", name: "新加坡", flag: "🇸🇬" },
  "🇭🇰": { code: "HK", name: "中国香港", flag: "🇭🇰" },
  "🇹🇼": { code: "TW", name: "中国台湾", flag: "🇹🇼" },
  "🇳🇱": { code: "NL", name: "荷兰", flag: "🇳🇱" },
  "🇫🇮": { code: "FI", name: "芬兰", flag: "🇫🇮" },
  "🇫🇷": { code: "FR", name: "法国", flag: "🇫🇷" },
  "🇨🇦": { code: "CA", name: "加拿大", flag: "🇨🇦" },
  "🇦🇺": { code: "AU", name: "澳大利亚", flag: "🇦🇺" },
};

/** Extracts country info from a node name or its exit country. */
export function extractNodeCountry(node: SubscriptionNode): { code: string; name: string; flag: string } {
  if (node.exit_country && COUNTRY_MAP[node.exit_country.toUpperCase()]) {
    return COUNTRY_MAP[node.exit_country.toUpperCase()];
  }

  const name = node.name;

  // 1. Check flag emoji
  for (const [flag, info] of Object.entries(FLAG_TO_COUNTRY)) {
    if (name.includes(flag)) {
      return info;
    }
  }

  // 2. Check Chinese country name
  for (const info of Object.values(COUNTRY_MAP)) {
    if (name.includes(info.name)) {
      return info;
    }
  }

  // 3. Check ISO code token in name e.g. [US], US -, _US_, JP, DE
  for (const [code, info] of Object.entries(COUNTRY_MAP)) {
    const regex = new RegExp(`(^|[\\[\\(_\\-\\s])${code}([\\]\\)_\\-\\s]|$)`, "i");
    if (regex.test(name)) {
      return info;
    }
  }

  return { code: "OTHER", name: "其他地区", flag: "🌐" };
}

/** Groups nodes by their resolved country into CountryGroup array. */
export function groupNodesByCountry(nodes: SubscriptionNode[]): CountryGroup[] {
  const map = new Map<string, CountryGroup>();

  for (const node of nodes) {
    const { code, name, flag } = extractNodeCountry(node);
    if (!map.has(code)) {
      map.set(code, {
        countryCode: code,
        countryName: name,
        flag,
        nodes: [],
      });
    }
    map.get(code)!.nodes.push(node);
  }

  // Sort groups: US, JP, KR, HK, SG first if present, then alphabetical, OTHER last
  const priorityOrder = ["US", "JP", "KR", "HK", "TW", "SG", "GB", "DE", "NL", "FI", "CA", "AU", "FR"];
  return Array.from(map.values()).sort((a, b) => {
    if (a.countryCode === "OTHER") return 1;
    if (b.countryCode === "OTHER") return -1;
    const idxA = priorityOrder.indexOf(a.countryCode);
    const idxB = priorityOrder.indexOf(b.countryCode);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return b.nodes.length - a.nodes.length;
  });
}

export type TransitSource = "direct" | "proxy" | "subscription" | "psiphon" | "megav";

export interface VpngateTransitConfig {
  source: TransitSource;
  proxy_id?: string | null;
  proxy_url?: string | null;
  proxy_name?: string | null;
  subscription_id?: string | null;
  subscription_name?: string | null;
  node_name?: string | null;
}

export async function getVpngateTransitNode(): Promise<VpngateTransitConfig> {
  return invoke<VpngateTransitConfig>("get_vpngate_transit_node");
}

export async function setVpngateTransitNode(config: VpngateTransitConfig): Promise<VpngateTransitConfig> {
  return invoke<VpngateTransitConfig>("set_vpngate_transit_node", { config });
}

export function formatTransitSummary(config?: VpngateTransitConfig | null): string {
  if (!config || config.source === "direct") {
    return "直连 (无中转)";
  }
  if (config.source === "proxy") {
    return `[代理] ${config.proxy_name || config.proxy_url || "代理节点"}`;
  }
  if (config.source === "psiphon") {
    return `[Psiphon] ${config.node_name || "Psiphon 节点"}`;
  }
  if (config.source === "megav") {
    return `[MegaV] ${config.node_name || "MegaV 节点"}`;
  }
  if (config.source === "subscription") {
    const subLabel = config.subscription_name ? `订阅: ${config.subscription_name}` : "订阅";
    return `[${subLabel}] ${config.node_name || "节点"}`;
  }
  return "直连 (无中转)";
}

