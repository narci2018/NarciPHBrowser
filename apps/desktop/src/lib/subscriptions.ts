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

/** Measures one node's download speed, in megabits per second. */
export async function testNodeSpeed(id: string, node: string): Promise<number> {
  const result = await invoke<{ mbps: number }>("test_node_speed", {
    payload: { subscription_id: id, node },
  });
  return result.mbps;
}

/** Reports which country a node's traffic really exits from. */
export async function testNodeExit(id: string, node: string): Promise<NodeExit> {
  const result = await invoke<NodeExit>("test_node_exit", {
    payload: { subscription_id: id, node },
  });
  return result;
}
