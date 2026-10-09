import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

export function ProxyFormDialog({ open, onOpenChange, proxy, onSubmit }: ProxyFormDialogProps) {
  const { t } = useTranslation();
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
  const urlError = host.trim() ? validateProxyUrl(builtUrl) : t("common.proxyHostRequired");
  const error = !name.trim()
    ? t("common.proxyNameRequired")
    : password && !username.trim()
      ? t("common.authError")
      : !host.trim()
        ? urlError
        : !portValid
          ? t("common.proxyPortRange")
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
          <DialogTitle>{editing ? t("common.editProxy") : t("common.newProxy")}</DialogTitle>
          <DialogDescription>
            {editing
              ? t("common.editProxyDescription")
              : t("common.newProxyDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="proxy-name">{t("common.proxyName")}</Label>
            <Input
              id="proxy-name"
              autoFocus
              placeholder={t("common.proxyNamePlaceholder")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="proxy-type">{t("common.proxyType")}</Label>
              <Select value={scheme} onValueChange={setScheme}>
                <SelectTrigger id="proxy-type" className="w-full">
                  <SelectValue placeholder={t("common.proxyType")} />
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
              <Label htmlFor="proxy-exit-country">{t("common.exitCountry")}</Label>
              <Input
                id="proxy-exit-country"
                placeholder={t("common.countryPlaceholder")}
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
              <Label htmlFor="proxy-host">{t("common.proxyHost")}</Label>
              <Input
                id="proxy-host"
                placeholder={t("common.proxyHostPlaceholder")}
                value={host}
                onChange={(event) => {
                  setHost(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-port">{t("common.proxyPort")}</Label>
              <Input
                id="proxy-port"
                inputMode="numeric"
                placeholder={t("common.proxyPortPlaceholder")}
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
              <Label htmlFor="proxy-username">{t("common.proxyUsername")}</Label>
              <Input
                id="proxy-username"
                placeholder={t("common.optional")}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-password">{t("common.proxyPassword")}</Label>
              <Input
                id="proxy-password"
                type="password"
                placeholder={t("common.optional")}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t("common.proxyUrlLabel")}</Label>
            <code className="block truncate rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              {host.trim() ? maskPassword(builtUrl) : t("common.proxyUrlPlaceholder")}
            </code>
            <p className="text-[11px] text-muted-foreground">
              {t("common.proxyUrlHint")}
            </p>
          </div>

          {plaintext && host.trim() && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning-text">
                {username.trim()
                  ? t("common.proxyCredentialsWarning")
                  : t("common.proxyNoEncryptionWarning")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {username.trim()
                  ? t("common.proxyCredentialsWarningHint")
                  : t("common.proxyNoEncryptionWarningHint")}
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
                  {t("common.syncProfiles", { count: usage.length})}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("common.syncProfilesHint")}
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
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              onClick={() => {
                setTouched(true);
              }}
            >
              {busy ? t("common.saving") : editing ? t("common.saveChanges") : t("common.createProxy")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
