import { useEffect, useMemo, useState } from "react";
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
import {
  buildProxyUrl,
  defaultPort,
  isPlaintextFirstHop,
  maskPassword,
  parseProxyUrl,
  SCHEME_OPTIONS,
  validateProxyUrl,
  type StoredProxy,
} from "@/lib/proxies";

export interface ProxyFormValue {
  name: string;
  url: string;
  exit_country?: string;
  update_profiles?: boolean;
}

interface ProxyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The proxy being edited, or `null` to add one. */
  proxy: StoredProxy | null;
  onSubmit: (value: ProxyFormValue) => Promise<void>;
}

const AUTH_ERROR = "A username is required to send a password.";

export function ProxyFormDialog({ open, onOpenChange, proxy, onSubmit }: ProxyFormDialogProps) {
  const editing = proxy !== null;
  const [name, setName] = useState("");
  const [scheme, setScheme] = useState("http");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8080");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [exitCountry, setExitCountry] = useState("");
  const [syncProfiles, setSyncProfiles] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setName("");
    setScheme("http");
    setHost("");
    setPort("8080");
    setUsername("");
    setPassword("");
    setExitCountry("");
    setSyncProfiles(false);
    setTouched(false);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open || !proxy) return;
    setName(proxy.name);
    setExitCountry(proxy.exit_country ?? "");
    setSyncProfiles(false);
    const parsed = parseProxyUrl(proxy.url);
    if (parsed) {
      setScheme(parsed.scheme);
      setHost(parsed.host);
      setPort(String(parsed.port));
      setUsername(parsed.username ?? "");
      setPassword(parsed.password ?? "");
    } else {
      setScheme("http");
      setHost("");
      setPort("8080");
      setUsername("");
      setPassword("");
    }
  }, [open, proxy]);

  const builtUrl = useMemo(
    () => buildProxyUrl({ scheme, host, port, username, password }),
    [scheme, host, port, username, password],
  );

  const schemeOptions = useMemo(() => {
    const known = SCHEME_OPTIONS.some((option) => option.value === scheme);
    return known ? SCHEME_OPTIONS : [{ value: scheme, label: scheme.toUpperCase() }, ...SCHEME_OPTIONS];
  }, [scheme]);

  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const urlError = host.trim() ? validateProxyUrl(builtUrl) : "A host is required.";
  const error = !name.trim()
    ? "A name is required"
    : password && !username.trim()
      ? AUTH_ERROR
      : !host.trim()
        ? urlError
        : !portValid
          ? "Port must be between 1 and 65535."
          : urlError;

  const usage = proxy?.used_by ?? [];
  const urlChanged = editing && proxy !== null && builtUrl !== proxy.url;
  const canSync = editing && urlChanged && usage.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (error || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: builtUrl,
        exit_country: exitCountry.trim().toUpperCase() || undefined,
        update_profiles: canSync && syncProfiles,
      });
    } catch {
      // The page toasts the failure; keep the dialog open for corrections.
    } finally {
      setBusy(false);
    }
  };

  const plaintext = isPlaintextFirstHop(builtUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit proxy" : "New proxy"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Stored once here, then assigned to any profile that should exit through it."
              : "A named proxy you keep once and assign to profiles instead of retyping per profile."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="proxy-name">Name</Label>
            <Input
              id="proxy-name"
              autoFocus
              placeholder="e.g. Berlin residential"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="proxy-type">Type</Label>
              <Select value={scheme} onValueChange={setScheme}>
                <SelectTrigger id="proxy-type" className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {schemeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-exit-country">Exit country</Label>
              <Input
                id="proxy-exit-country"
                placeholder="DE"
                maxLength={2}
                value={exitCountry}
                onChange={(event) => {
                  setExitCountry(event.target.value.toUpperCase());
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_110px] gap-4">
            <div className="grid gap-2">
              <Label htmlFor="proxy-host">Host</Label>
              <Input
                id="proxy-host"
                placeholder="proxy.example.com"
                value={host}
                onChange={(event) => {
                  setHost(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-port">Port</Label>
              <Input
                id="proxy-port"
                inputMode="numeric"
                placeholder="8080"
                value={port}
                onChange={(event) => {
                  setPort(event.target.value.replace(/[^\d]/g, ""));
                }}
                onBlur={() => {
                  if (!port) setPort(String(defaultPort(scheme)));
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="proxy-username">Username</Label>
              <Input
                id="proxy-username"
                placeholder="Optional"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-password">Password</Label>
              <Input
                id="proxy-password"
                type="password"
                placeholder="Optional"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>URL</Label>
            <code className="block truncate rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              {host.trim() ? maskPassword(builtUrl) : "scheme://host:port"}
            </code>
            <p className="text-[11px] text-muted-foreground">
              The exit IP must sit where a profile claims, or the geo gate refuses the launch.
            </p>
          </div>

          {plaintext && host.trim() && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning-text">
                {username.trim()
                  ? "These credentials cross the network readable"
                  : "The connection to this proxy is not encrypted"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {username.trim()
                  ? "This type sends the username and password without encryption. Treat them as exposed on any network you do not control."
                  : "Anyone between this machine and the proxy sees where you go and everything sent outside HTTPS."}
              </p>
            </div>
          )}

          {canSync && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 accent-current"
                checked={syncProfiles}
                onChange={(event) => {
                  setSyncProfiles(event.target.checked);
                }}
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">
                  Also update {usage.length} profile{usage.length === 1 ? "" : "s"} using this proxy
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  The URL changes, so the profiles carrying the old one are rewritten with the new.
                </span>
              </span>
            </label>
          )}

          {touched && error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

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
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              onClick={() => {
                setTouched(true);
              }}
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Create proxy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
