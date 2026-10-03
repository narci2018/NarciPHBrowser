import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { LuBot, LuCopy, LuPlay, LuSquare } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProfileSummary } from "@narc/sdk";

/** Where the driver path persists between sessions. */
const DRIVER_STORAGE_KEY = "narc.driverPath";

interface AgentSessionRow {
  id: string;
  wsEndpoint: string;
  pid: number;
}

interface StartForm {
  driverPath: string;
  nodePath: string;
  headless: boolean;
  port: string;
}

/**
 * The Agent page: drive a profile's browser over Playwright.
 *
 * Starting a session launches the profile's browser behind a Playwright
 * server and hands back a WebSocket endpoint; any Playwright client — Node,
 * Python, Java, .NET — connects to it with `firefox.connect` and drives that
 * browser, which presents the profile's fingerprint the whole time. The
 * session belongs to the app: closing it closes the server and the browser.
 */
export function AgentPage({ profiles }: { profiles: ProfileSummary[] }) {
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ProfileSummary | null>(null);
  const [form, setForm] = useState<StartForm>({
    driverPath: "",
    nodePath: "",
    headless: true,
    port: "",
  });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<{ sessions: AgentSessionRow[] }>("list_automation");
      setSessions(result.sessions);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      driverPath: window.localStorage.getItem(DRIVER_STORAGE_KEY) ?? "",
    }));
  }, []);

  const openStart = (profile: ProfileSummary) => {
    setTarget(profile);
  };

  const start = async () => {
    if (!target || !form.driverPath.trim()) return;
    setBusy(true);
    try {
      window.localStorage.setItem(DRIVER_STORAGE_KEY, form.driverPath.trim());
      const result = await invoke<{ wsEndpoint: string }>("start_automation", {
        id: target.id,
        driverPath: form.driverPath.trim(),
        nodePath: form.nodePath.trim() || null,
        port: form.port.trim() ? Number(form.port.trim()) : null,
        headless: form.headless,
      });
      await navigator.clipboard.writeText(result.wsEndpoint).catch(() => {});
      toast.success(`Session running — endpoint copied to the clipboard`);
      setTarget(null);
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (session: AgentSessionRow) => {
    try {
      await invoke("stop_automation", { id: session.id });
      toast.success(`Stopped the session for “${session.id}”`);
      await refresh();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const sessionFor = (id: string) => sessions.find((session) => session.id === id);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {sessions.length} running session{sessions.length === 1 ? "" : "s"}
        </span>
        <div className="flex-1" />
      </div>

      <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
            <TableRow className="border-0! hover:bg-transparent">
              <TableHead className="pl-3">Profile</TableHead>
              <TableHead>WebSocket endpoint</TableHead>
              <TableHead className="w-[90px]">PID</TableHead>
              <TableHead className="w-[110px] pr-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-visible">
            {loading ? (
              <TableRow className="border-0! hover:bg-transparent">
                <TableCell colSpan={4} className="py-16 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : profiles.length === 0 ? (
              <TableRow className="border-0! hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <LuBot className="size-12 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">No profiles yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Create a profile first, then start an automation session for it here.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((profile) => {
                const session = sessionFor(profile.id);
                return (
                  <TableRow key={profile.id} className="group/row border-0! hover:bg-muted">
                    <TableCell className="min-w-0 pl-3">
                      <div className="block max-w-full truncate text-sm font-medium text-foreground">
                        {profile.name}
                      </div>
                      <div className="block max-w-full truncate font-mono text-xs text-muted-foreground">
                        {profile.id}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0">
                      {session ? (
                        <button
                          type="button"
                          title={session.wsEndpoint}
                          onClick={() => {
                            void navigator.clipboard.writeText(session.wsEndpoint);
                            toast.success("Endpoint copied");
                          }}
                          className="flex w-full items-center gap-1.5 text-left"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                            {session.wsEndpoint}
                          </span>
                          <LuCopy className="size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {session ? session.pid : "—"}
                    </TableCell>
                    <TableCell className="pr-3">
                      <div className="flex items-center justify-end">
                        {session ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void stop(session);
                            }}
                          >
                            <LuSquare className="size-3.5" />
                            Stop
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openStart(profile)}>
                            <LuPlay className="size-3.5" />
                            Start
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start automation — {target?.name}</DialogTitle>
            <DialogDescription>
              The profile's browser starts behind a Playwright server; connect from any
              Playwright client with <span className="font-mono">firefox.connect</span>. The
              endpoint is copied to the clipboard when the session is up.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-driver">Playwright driver path</Label>
              <Input
                id="agent-driver"
                value={form.driverPath}
                placeholder="…\\node_modules\\playwright-core"
                onChange={(event) => {
                  setForm((current) => ({ ...current, driverPath: event.target.value }));
                }}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                The <span className="font-mono">playwright-core</span> package directory. Python
                Playwright bundles one at <span className="font-mono">…\\playwright\\driver\\package</span>.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-node">Node runtime (optional)</Label>
              <Input
                id="agent-node"
                value={form.nodePath}
                placeholder="node"
                onChange={(event) => {
                  setForm((current) => ({ ...current, nodePath: event.target.value }));
                }}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use <span className="font-mono">node</span> from PATH. Python
                Playwright ships one at <span className="font-mono">…\\playwright\\driver\\node</span>.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="agent-headless"
                  checked={form.headless}
                  onCheckedChange={(checked) => {
                    setForm((current) => ({ ...current, headless: checked === true }));
                  }}
                />
                <Label htmlFor="agent-headless" className="text-sm">
                  Headless
                </Label>
              </div>
              <div className="flex flex-1 items-center gap-2">
                <Label htmlFor="agent-port" className="shrink-0 text-sm">
                  Port
                </Label>
                <Input
                  id="agent-port"
                  value={form.port}
                  placeholder="auto"
                  onChange={(event) => {
                    setForm((current) => ({ ...current, port: event.target.value }));
                  }}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              size="sm"
              disabled={busy || !form.driverPath.trim()}
              onClick={() => {
                void start();
              }}
            >
              <LuPlay className="size-3.5" />
              {busy ? "Starting…" : "Start session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
