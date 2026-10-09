import { invoke } from "@tauri-apps/api/core";

/**
 * A group with how many profiles are filed under it.
 *
 * The name is the whole identity of a group; the count comes from the
 * profiles, so an empty group — created before it has a member — shows as
 * zero rather than as nothing.
 */
export interface GroupInfo {
  name: string;
  count: number;
}

/** Every group, by name, with its member count. */
export async function listGroups(): Promise<GroupInfo[]> {
  const result = await invoke<{ groups: GroupInfo[] }>("list_groups");
  return result.groups;
}
