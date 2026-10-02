import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { geoCompatible, type StoredProxy } from "@/lib/proxies";
import type { ProfileSummaryLike } from "@/components/proxy-assign-dialog";

interface ProxyDistributeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proxies: StoredProxy[];
  profiles: ProfileSummaryLike[];
  onDone: () => void;
}

export function ProxyDistributeDialog({
  open,
  onOpenChange,
  proxies,
  profiles,
  onDone,
}: ProxyDistributeDialogProps) {
  const [proxyIds, setProxyIds] = useState<string[]>([]);
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProxyIds(proxies.map((proxy) => proxy.id));
    setProfileIds(profiles.map((profile) => profile.id));
    setBusy(false);
  }, [open, proxies, profiles]);

  const selected = useMemo(
    () => proxies.filter((proxy) => proxyIds.includes(proxy.id)),
    [proxies, proxyIds],
  );

  // A profile only takes a proxy that exits where the profile claims to be.
  // Round-robin over compatible pairs, skipping profiles no proxy accepts.
  const plan = useMemo(() => {
    const canTake = (profileId: string, proxy: StoredProxy): boolean => {
      const profile = profiles.find((entry) => entry.id === profileId);
      return geoCompatible(proxy.exit_country, profile?.country);
    };
    const buckets = new Map<string, string[]>();
    if (selected.length === 0) return buckets;
    let cursor = 0;
    for (const profileId of profileIds) {
      for (let attempt = 0; attempt < selected.length; attempt += 1) {
        const candidate = selected[(cursor + attempt) % selected.length];
        if (!canTake(profileId, candidate)) continue;
        const list = buckets.get(candidate.id) ?? [];
        list.push(profileId);
        buckets.set(candidate.id, list);
        cursor = (cursor + attempt + 1) % selected.length;
        break;
      }
    }
    return buckets;
  }, [selected, profileIds, profiles]);

  const plannedProfiles = [...plan.values()].reduce((sum, list) => sum + list.length, 0);
  const unplanned = profileIds.length - plannedProfiles;

  const toggle = (
    id: string,
    current: string[],
    setter: (next: string[]) => void,
  ) => {
    setter(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const submit = async () => {
    if (busy || selected.length === 0 || profileIds.length === 0) return;
    setBusy(true);
    try {
      let updated = 0;
      let failed = 0;
      for (const [proxyId, ids] of plan) {
        const proxy = proxies.find((entry) => entry.id === proxyId);
        if (!proxy || ids.length === 0) continue;
        const result = await invoke<{
          updated: string[];
          failed: { id: string; error: string }[];
        }>("assign_proxy", {
          payload: {
            profile_ids: ids,
            proxy: { url: proxy.url, exit_country: proxy.exit_country ?? null },
          },
        });
        updated += result.updated.length;
        failed += result.failed.length;
      }
      if (failed > 0) {
        toast.error(`${failed} profile${failed === 1 ? "" : "s"} could not be assigned`);
      } else {
        toast.success(`Distributed across ${updated} profile${updated === 1 ? "" : "s"}`);
      }
      onDone();
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Distribute proxies</DialogTitle>
          <DialogDescription>
            Hands the selected proxies to the selected profiles round-robin, one profile per slot.
            Profiles whose country no selected proxy exits from stay on their current routing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Proxies</span>
              <span>
                {proxyIds.length} of {proxies.length}
              </span>
            </div>
            <ScrollArea className="h-56 rounded-md border border-border">
              <div className="divide-y divide-border">
                {proxies.map((proxy) => (
                  <div
                    key={proxy.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50"
                    onClick={() => {
                      toggle(proxy.id, proxyIds, setProxyIds);
                    }}
                  >
                    <Checkbox
                      checked={proxyIds.includes(proxy.id)}
                      onCheckedChange={() => {
                        toggle(proxy.id, proxyIds, setProxyIds);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {proxy.name}
                    </span>
                    {proxy.exit_country && (
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {proxy.exit_country}
                      </span>
                    )}
                  </div>
                ))}
                {proxies.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No proxies yet.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Profiles</span>
              <span>
                {profileIds.length} of {profiles.length}
              </span>
            </div>
            <ScrollArea className="h-56 rounded-md border border-border">
              <div className="divide-y divide-border">
                {profiles.map((profile) => {
                  const reachable = selected.some((proxy) =>
                    geoCompatible(proxy.exit_country, profile.country),
                  );
                  return (
                    <div
                      key={profile.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50"
                      onClick={() => {
                        toggle(profile.id, profileIds, setProfileIds);
                      }}
                    >
                      <Checkbox
                        checked={profileIds.includes(profile.id)}
                        onCheckedChange={() => {
                          toggle(profile.id, profileIds, setProfileIds);
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {profile.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {profile.country ?? "—"}
                      </span>
                      {!reachable && (
                        <span className="shrink-0 rounded-sm border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning-text">
                          no match
                        </span>
                      )}
                    </div>
                  );
                })}
                {profiles.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No profiles yet.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {plannedProfiles} profile{plannedProfiles === 1 ? "" : "s"} will be assigned
          {unplanned > 0 && `; ${unplanned} skipped (no geo match)`}.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || plan.size === 0}
            onClick={() => {
              void submit();
            }}
          >
            {busy ? "Distributing…" : `Distribute ${plan.size} prox${plan.size === 1 ? "y" : "ies"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
