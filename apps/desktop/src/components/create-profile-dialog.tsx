import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
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
import { cn } from "@/lib/utils";

const OS_OPTIONS: { value: TargetOs; label: string }[] = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
];

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
  onSubmit: (spec: CreateSpec) => Promise<void>;
}

export function CreateProfileDialog({
  open,
  onOpenChange,
  profile,
  onSubmit,
}: CreateProfileDialogProps) {
  const editing = Boolean(profile);
  const [name, setName] = useState("");
  const [os, setOs] = useState<TargetOs>("windows");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyCountry, setProxyCountry] = useState("");
  const [screen, setScreen] = useState(AUTO_SCREEN);
  const [dpr, setDpr] = useState<number | null>(null);
  const [presets, setPresets] = useState<ScreenPreset[]>([]);
  const [monitor, setMonitor] = useState<HostMonitor | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setName("");
    setOs("windows");
    setCountry("");
    setNotes("");
    setProxyUrl("");
    setProxyCountry("");
    setScreen(AUTO_SCREEN);
    setDpr(null);
    setMonitor(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open || !profile) return;
    setName(profile.name);
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
    ? `Auto — this display (${monitor.width} × ${monitor.height})`
    : "Auto — this display";

  const screenOptions = [...presets];
  if (
    screen !== AUTO_SCREEN &&
    !screenOptions.some((preset) => `${preset.width}x${preset.height}` === screen)
  ) {
    const [width, height] = screen.split("x").map(Number);
    screenOptions.push({ width, height, weight: -1 });
  }

  const canSubmit = name.trim().length > 0 && !busy;

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
      await onSubmit({
        name: name.trim(),
        os,
        country: country.trim().toUpperCase() || undefined,
        notes: notes.trim() || undefined,
        screen: screenPin,
        dpr: dprPin,
        proxy: proxyUrl.trim()
          ? {
              url: proxyUrl.trim(),
              exit_country: proxyCountry.trim().toUpperCase() || undefined,
            }
          : undefined,
        extra_args: [],
      });
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
          <DialogTitle>{editing ? "Edit profile" : "Create profile"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "The seed stays put — these settings reshape what the profile presents."
              : "A seed is drawn for you. The identity it presents is derived on read, so the same profile always looks like the same machine."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              autoFocus
              placeholder="e.g. Marketplace DE"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label>Operating system</Label>
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
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-screen">Display resolution</Label>
            <Select
              value={screen}
              onValueChange={(value) => {
                if (value !== AUTO_SCREEN && !/^\d+x\d+$/.test(value)) return;
                setScreen(value);
                setDpr(null);
              }}
            >
              <SelectTrigger id="profile-screen" className="w-full">
                <SelectValue placeholder="Auto" />
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
              Auto pins this display exactly — its physical size and scale, so a page
              sees what this machine shows. A pinned resolution draws a scale the
              target OS offers.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-country">Country</Label>
              <Input
                id="profile-country"
                placeholder="DE"
                maxLength={2}
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value.toUpperCase());
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-proxy-country">Proxy exit country</Label>
              <Input
                id="profile-proxy-country"
                placeholder="DE"
                maxLength={2}
                value={proxyCountry}
                onChange={(event) => {
                  setProxyCountry(event.target.value.toUpperCase());
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-proxy">Proxy URL</Label>
            <Input
              id="profile-proxy"
              placeholder="http://user:pass@host:8080"
              value={proxyUrl}
              onChange={(event) => {
                setProxyUrl(event.target.value);
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              The exit IP must sit in the profile's country, or the launch is refused.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-notes">Notes</Label>
            <Textarea
              id="profile-notes"
              rows={2}
              placeholder="Anything you want to remember about this identity"
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
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {busy
                ? editing
                  ? "Saving…"
                  : "Creating…"
                : editing
                  ? "Save changes"
                  : "Create profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
