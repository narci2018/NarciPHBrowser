import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
import { LuActivity, LuLoaderCircle } from "react-icons/lu";
import { toast } from "sonner";
import type { CreateSpec, Profile, TargetOs } from "@narc/sdk";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { maskPassword, type StoredProxy } from "@/lib/proxies";
import {
  listAssignments,
  listSubscriptionNodes,
  listSubscriptions,
  testAllNodeDelays,
  type NodeAssignment,
  type SubscriptionNode,
  type SubscriptionRow,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const OS_OPTIONS: { value: TargetOs; labelKey: string }[] = [
  { value: "windows", labelKey: "common.osWindows" },
  { value: "macos", labelKey: "common.osMacos" },
  { value: "linux", labelKey: "common.osLinux" },
];

/** Where a profile's traffic should leave: nowhere, a stored proxy, a node, or a typed URL. */
type ProxySource = "direct" | "library" | "subscription" | "manual";

const PROXY_SOURCES: { value: ProxySource; labelKey: string }[] = [
  { value: "direct", labelKey: "common.proxySourceDirect" },
  { value: "library", labelKey: "common.proxySourceLibrary" },
  { value: "subscription", labelKey: "common.proxySourceSubscription" },
  { value: "manual", labelKey: "common.proxySourceManual" },
];

/** The delay that decides whether a node may be picked: the batch's when one ran, else the stored reading. */
function delayOf(entry: SubscriptionNode, batch: Record<string, number> | null): number | null {
  return batch ? (batch[entry.name] ?? null) : (entry.delay ?? null);
}

const AUTO_SCREEN = "auto";

interface ScreenPreset {
  width: number;
  height: number;
  weight: number;
}

interface HostMonitor {
  width: number;
  height: number;
  scale: number;
}

interface CreateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile being edited, or `null` to create a new one. */
  profile?: Profile | null;
  /** Every group's name, for the picker; typing one that is missing creates it. */
  groupNames: string[];
  /** The node route to store alongside the profile, or `null` for no route. */
  onSubmit: (spec: CreateSpec, assignment?: NodeAssignment | null) => Promise<void>;
}

export function CreateProfileDialog({
  open,
  onOpenChange,
  profile,
  groupNames,
  onSubmit,
}: CreateProfileDialogProps) {
  const { t } = useTranslation();
  const editing = Boolean(profile);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [os, setOs] = useState<TargetOs>("windows");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyCountry, setProxyCountry] = useState("");
  const [proxySource, setProxySource] = useState<ProxySource>("direct");
  const [proxies, setProxies] = useState<StoredProxy[]>([]);
  const [proxyId, setProxyId] = useState("");
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [nodes, setNodes] = useState<SubscriptionNode[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [node, setNode] = useState("");
  const [testingDelays, setTestingDelays] = useState(false);
  const [batchDelays, setBatchDelays] = useState<Record<string, number> | null>(null);
  const [screen, setScreen] = useState(AUTO_SCREEN);
  const [dpr, setDpr] = useState<number | null>(null);
  const [presets, setPresets] = useState<ScreenPreset[]>([]);
  const [monitor, setMonitor] = useState<HostMonitor | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setName("");
    setGroup("");
    setOs("windows");
    setCountry("");
    setNotes("");
    setProxyUrl("");
    setProxyCountry("");
    setProxySource("direct");
    setProxyId("");
    setSubscriptionId("");
    setNodes([]);
    setNodesLoading(false);
    setNode("");
    setTestingDelays(false);
    setBatchDelays(null);
    setScreen(AUTO_SCREEN);
    setDpr(null);
    setMonitor(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open || !profile) return;
    setName(profile.name);
    setGroup(profile.group ?? "");
    setOs(profile.options.os);
    setCountry(profile.options.country ?? "");
    setNotes(profile.notes);
    setProxyUrl(profile.proxy?.url ?? "");
    setProxyCountry(profile.proxy?.exit_country ?? "");
    setScreen(
      profile.options.screen
        ? `${profile.options.screen[0]}x${profile.options.screen[1]}`
        : AUTO_SCREEN,
    );
    setDpr(profile.options.dpr ?? null);
  }, [open, profile]);

  // The picker's lists, loaded once per opening, and — while editing — where
  // the profile routes today, so the dialog opens on the source it already
  // uses instead of on a guess.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      let nextProxies: StoredProxy[] = [];
      let nextSubscriptions: SubscriptionRow[] = [];
      try {
        nextProxies = await invoke<StoredProxy[]>("list_proxies");
      } catch (error) {
        if (!cancelled) toast.error(String(error));
      }
      try {
        nextSubscriptions = await listSubscriptions();
      } catch (error) {
        if (!cancelled) toast.error(String(error));
      }
      if (cancelled) return;
      setProxies(nextProxies);
      setSubscriptions(nextSubscriptions);

      if (!profile) return;
      let assigned: NodeAssignment | null = null;
      try {
        const stored = await listAssignments();
        assigned = stored.find((entry) => entry.profile_id === profile.id) ?? null;
      } catch {
        // No route could be read: fall back to what the profile itself carries.
      }
      if (cancelled) return;
      if (assigned) {
        setProxySource("subscription");
        setSubscriptionId(assigned.subscription_id);
        setNode(assigned.node);
        return;
      }
      const url = profile.proxy?.url ?? "";
      if (!url) {
        setProxySource("direct");
        return;
      }
      const stored = nextProxies.find((entry) => entry.url === url);
      setProxySource(stored ? "library" : "manual");
      setProxyId(stored?.id ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profile]);

  // The nodes of the chosen subscription. The delay batch is dropped with the
  // subscription it measured, so readings never describe another list.
  useEffect(() => {
    setBatchDelays(null);
    if (!open || !subscriptionId) {
      setNodes([]);
      return;
    }
    let cancelled = false;
    setNodesLoading(true);
    void listSubscriptionNodes(subscriptionId)
      .then((list) => {
        if (!cancelled) setNodes(list);
      })
      .catch((error) => {
        if (!cancelled) toast.error(String(error));
      })
      .finally(() => {
        if (!cancelled) setNodesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, subscriptionId]);

  useEffect(() => {
    if (!open || presets.length > 0) return;
    let cancelled = false;
    void invoke<ScreenPreset[]>("screen_presets")
      .then((list) => {
        if (cancelled) return;
        setPresets([...list].sort((a, b) => b.weight - a.weight));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, presets.length]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = (await currentMonitor()) ?? (await primaryMonitor());
        if (!cancelled && found) {
          setMonitor({
            width: found.size.width,
            height: found.size.height,
            scale: found.scaleFactor,
          });
        }
      } catch {
        // No monitor information: Auto falls back to a drawn display.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const autoLabel = monitor
    ? t("common.autoDisplayWithSize", { width: monitor.width, height: monitor.height })
    : t("common.autoDisplay");

  const screenOptions = [...presets];
  if (
    screen !== AUTO_SCREEN &&
    !screenOptions.some((preset) => `${preset.width}x${preset.height}` === screen)
  ) {
    const [width, height] = screen.split("x").map(Number);
    screenOptions.push({ width, height, weight: -1 });
  }

  // Every node of the chosen subscription may be picked, so a route can be
  // changed without measuring first. The measurement only decides the order:
  // nodes that answered sort fastest first, the rest follow — alive ahead of
  // the ones the health check has not seen.
  const availableNodes = useMemo(() => {
    const measured: { entry: SubscriptionNode; delay: number }[] = [];
    const unmeasured: SubscriptionNode[] = [];
    for (const entry of nodes) {
      const delay = delayOf(entry, batchDelays);
      if (delay != null && delay > 0 && (batchDelays || entry.alive)) {
        measured.push({ entry, delay });
      } else {
        unmeasured.push(entry);
      }
    }
    measured.sort((first, second) => first.delay - second.delay);
    unmeasured.sort((first, second) => Number(second.alive) - Number(first.alive));
    return [...measured.map((candidate) => candidate.entry), ...unmeasured];
  }, [nodes, batchDelays]);

  const nodeOptions = useMemo(() => {
    const chosen = nodes.find((entry) => entry.name === node);
    if (chosen) {
      if (!availableNodes.some((entry) => entry.name === chosen.name)) {
        return [...availableNodes, chosen];
      }
      return availableNodes;
    }
    // The routed node is not in the current fetch of the subscription. Its
    // name embeds a latency the provider re-measures, so a stored route can
    // outlive the name it was saved under. Keep it in view, clearly marked,
    // so an edit reads back what is routed instead of a blank picker.
    if (!node) return availableNodes;
    const savedChoice: SubscriptionNode = { name: node, kind: "", alive: true, delay: null };
    return [savedChoice, ...availableNodes];
  }, [availableNodes, nodes, node]);

  const chosenProxy = proxies.find((entry) => entry.id === proxyId);
  const sourceReady =
    proxySource === "library"
      ? Boolean(chosenProxy)
      : proxySource === "manual"
        ? Boolean(proxyUrl.trim())
        : proxySource === "subscription"
          ? Boolean(subscriptionId && node)
          : true;

  const canSubmit = name.trim().length > 0 && sourceReady && !busy;

  // One core request measures the whole provider, so the list settles after a
  // single timeout window rather than one per node.
  const measureAllDelays = async () => {
    if (!subscriptionId || testingDelays) return;
    setTestingDelays(true);
    try {
      const delays = await testAllNodeDelays(subscriptionId);
      setBatchDelays(delays);
      // A node that stopped answering stops being pickable, so an open
      // selection on one is dropped instead of being kept by accident.
      setNode((current) =>
        current && (delays[current] == null || delays[current] <= 0) ? "" : current,
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setTestingDelays(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      let screenPin: [number, number] | undefined;
      let dprPin: number | undefined;
      const [width, height] = screen.split("x").map(Number);
      const pinned =
        screen !== AUTO_SCREEN &&
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0;
      if (pinned) {
        screenPin = [width, height];
        dprPin = dpr ?? undefined;
      } else if (monitor) {
        screenPin = [monitor.width, monitor.height];
        dprPin = monitor.scale;
      }
      // The proxy and the node route are two ways of saying the same thing:
      // where this profile's traffic leaves. Only one of them is ever set.
      let specProxy: CreateSpec["proxy"];
      let assignment: NodeAssignment | null = null;
      if (proxySource === "library") {
        specProxy = chosenProxy
          ? {
              url: chosenProxy.url,
              exit_country: (chosenProxy.exit_country ?? "").trim().toUpperCase() || undefined,
            }
          : undefined;
      } else if (proxySource === "manual") {
        specProxy = proxyUrl.trim()
          ? {
              url: proxyUrl.trim(),
              exit_country: proxyCountry.trim().toUpperCase() || undefined,
            }
          : undefined;
      } else if (proxySource === "subscription" && subscriptionId && node) {
        assignment = { subscription_id: subscriptionId, node };
      }
      await onSubmit(
        {
          name: name.trim(),
          os,
          country: country.trim().toUpperCase() || undefined,
          notes: notes.trim() || undefined,
          // An empty field files the profile nowhere — `""` would be a group
          // named nothing, which `set_group` reads as none anyway.
          group: group.trim() || undefined,
          screen: screenPin,
          dpr: dprPin,
          proxy: specProxy,
          extra_args: [],
        },
        assignment,
      );
    } catch {
      // The parent toasts the failure; keep the dialog open for corrections.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t("common.editProfile") : t("common.createProfile")}</DialogTitle>
          <DialogDescription>
            {editing
              ? t("common.editProfileDescription")
              : t("common.createProfileDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">{t("common.profileName")}</Label>
            <Input
              id="profile-name"
              autoFocus
              placeholder={t("common.profileNamePlaceholder")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-group">{t("common.group")}</Label>
            <Input
              id="profile-group"
              list="profile-group-options"
              placeholder={t("common.groupPlaceholder")}
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
              }}
            />
            {/* The suggestions are every group, empty ones included: filing a
                profile into a group someone just created must not need the
                group to have a member first. */}
            <datalist id="profile-group-options">
              {groupNames.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
            <p className="text-[11px] text-muted-foreground">{t("common.groupHint")}</p>
          </div>

          <div className="grid gap-2">
            <Label>{t("common.operatingSystem")}</Label>
            <div className="grid grid-cols-3 gap-1.5 rounded-md border border-input bg-transparent p-1 dark:bg-input/30">
              {OS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={os === option.value}
                  onClick={() => {
                    setOs(option.value);
                  }}
                  className={cn(
                    "h-7 cursor-pointer rounded-sm text-xs font-medium transition-colors",
                    os === option.value
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-screen">{t("common.displayResolution")}</Label>
            <Select
              value={screen}
              onValueChange={(value) => {
                if (value !== AUTO_SCREEN && !/^\d+x\d+$/.test(value)) return;
                setScreen(value);
                setDpr(null);
              }}
            >
              <SelectTrigger id="profile-screen" className="w-full">
                <SelectValue placeholder={t("common.auto")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_SCREEN}>{autoLabel}</SelectItem>
                {screenOptions.map((preset) => (
                  <SelectItem
                    key={`${preset.width}x${preset.height}`}
                    value={`${preset.width}x${preset.height}`}
                  >
                    {preset.width} × {preset.height}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t("common.autoHint")}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-country">{t("common.country")}</Label>
            <Input
              id="profile-country"
              placeholder={t("common.countryPlaceholder")}
              maxLength={2}
              value={country}
              onChange={(event) => {
                setCountry(event.target.value.toUpperCase());
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("common.proxySource")}</Label>
            <div className="grid grid-cols-4 gap-1.5 rounded-md border border-input bg-transparent p-1 dark:bg-input/30">
              {PROXY_SOURCES.map((option) => {
                // An empty list makes a source unofferable — but never at the
                // cost of hiding the one already in use, which an edit may
                // have landed on from the stored route.
                const disabled =
                  proxySource !== option.value &&
                  ((option.value === "library" && proxies.length === 0) ||
                    (option.value === "subscription" && subscriptions.length === 0));
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={proxySource === option.value}
                    disabled={disabled}
                    onClick={() => {
                      setProxySource(option.value);
                    }}
                    className={cn(
                      "h-7 cursor-pointer rounded-sm text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      proxySource === option.value
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
            {proxySource === "direct" && (
              <p className="text-[11px] text-muted-foreground">{t("common.proxyDirectHint")}</p>
            )}
          </div>

          {proxySource === "library" && (
            <div className="grid gap-2">
              <Label htmlFor="profile-proxy-pick">{t("common.selectProxy")}</Label>
              <Select value={proxyId} onValueChange={setProxyId}>
                <SelectTrigger id="profile-proxy-pick" className="w-full">
                  <SelectValue placeholder={t("common.selectProxy")} />
                </SelectTrigger>
                <SelectContent>
                  {proxies.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name} · {maskPassword(entry.url)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("common.proxyLibraryHint")}</p>
            </div>
          )}

          {proxySource === "subscription" && (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="profile-subscription">
                    {t("common.selectSubscription")}
                  </Label>
                  <Select
                    value={subscriptionId}
                    onValueChange={(value) => {
                      setSubscriptionId(value);
                      setNode("");
                    }}
                  >
                    <SelectTrigger id="profile-subscription" className="w-full">
                      <SelectValue placeholder={t("common.selectSubscription")} />
                    </SelectTrigger>
                    <SelectContent>
                      {subscriptions.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-node">{t("common.selectNode")}</Label>
                  <Select
                    value={nodesLoading ? "" : node}
                    onValueChange={setNode}
                    disabled={!subscriptionId || nodesLoading}
                  >
                    <SelectTrigger id="profile-node" className="w-full">
                      <SelectValue
                        placeholder={
                          nodesLoading ? t("common.loading") : t("common.selectNode")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {nodeOptions.map((entry) => {
                        const delay = delayOf(entry, batchDelays);
                        return (
                          <SelectItem key={entry.name} value={entry.name}>
                            {entry.name}
                            {delay != null ? ` · ${delay} ms` : ""}
                            {!nodes.some((candidate) => candidate.name === entry.name)
                              ? t("common.storedRouteSuffix")
                              : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  {subscriptionId && availableNodes.length === 0 && !nodesLoading
                    ? t("common.noAvailableNodes")
                    : t("common.subscriptionNodeHint")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!subscriptionId || testingDelays || nodes.length === 0}
                  onClick={() => void measureAllDelays()}
                >
                  {testingDelays ? (
                    <LuLoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <LuActivity className="size-3.5" />
                  )}
                  {t("common.testLatency")}
                </Button>
              </div>
            </div>
          )}

          {proxySource === "manual" && (
            <div className="grid gap-2">
              <Label htmlFor="profile-proxy">{t("common.proxyUrl")}</Label>
              <Input
                id="profile-proxy"
                placeholder={t("common.proxyUrlPlaceholder")}
                value={proxyUrl}
                onChange={(event) => {
                  setProxyUrl(event.target.value);
                }}
              />
              <Label htmlFor="profile-proxy-country">{t("common.proxyExitCountry")}</Label>
              <Input
                id="profile-proxy-country"
                placeholder={t("common.countryPlaceholder")}
                maxLength={2}
                value={proxyCountry}
                onChange={(event) => {
                  setProxyCountry(event.target.value.toUpperCase());
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("common.proxyUrlHint")}
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="profile-notes">{t("common.notes")}</Label>
            <Textarea
              id="profile-notes"
              rows={2}
              placeholder={t("common.notesPlaceholder")}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </div>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {busy
                ? editing
                  ? t("common.saving")
                  : t("common.creating")
                : editing
                  ? t("common.saveChanges")
                  : t("common.createProfileButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
