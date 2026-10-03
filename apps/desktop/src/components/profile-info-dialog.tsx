import { useEffect, useState } from "react";
import { LuLoaderCircle, LuPencil, LuPlay, LuRefreshCw, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import type { Inspection, Report, Verdict, VerifyReport } from "@narc/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const OS_LABEL: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const avatarColors = [
  "#6c5ce7",
  "#0984e3",
  "#00b894",
  "#e17055",
  "#fd79a8",
  "#00cec9",
  "#e84393",
  "#74b9ff",
];

const avatarColor = (seed: number) => avatarColors[Math.abs(seed) % avatarColors.length];

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

interface FingerprintRow {
  key: string;
  label: string;
  description: string;
}

const FINGERPRINT_ROWS: FingerprintRow[] = [
  { key: "navigator.userAgent", label: "User Agent", description: "Full UA string" },
  { key: "navigator.platform", label: "Platform", description: "OS platform token" },
  { key: "navigator.language", label: "Language", description: "UI language" },
  { key: "navigator.hardwareConcurrency", label: "Hardware Cores", description: "CPU thread count" },
  { key: "navigator.devicePixelRatio", label: "Device Pixel Ratio", description: "Screen scaling factor" },
  { key: "navigator.maxTouchPoints", label: "Max Touch Points", description: "Touch capability" },
  { key: "screen.width", label: "Screen Width", description: "Logical pixels" },
  { key: "screen.height", label: "Screen Height", description: "Logical pixels" },
  { key: "screen.availWidth", label: "Available Width", description: "Usable screen area" },
  { key: "screen.availHeight", label: "Available Height", description: "Usable screen area" },
  { key: "screen.colorDepth", label: "Color Depth", description: "Bits per pixel" },
  { key: "webGl:renderer", label: "WebGL Renderer", description: "GPU renderer string" },
  { key: "webGl:vendor", label: "WebGL Vendor", description: "GPU vendor" },
  { key: "fonts", label: "Fonts", description: "Installed font list" },
  { key: "timezone", label: "Timezone", description: "IANA zone" },
];

function FingerprintTab({ inspection }: { inspection: Inspection }) {
  const valueOf = (key: string) => formatValue(inspection.effective[key]);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[180px]">Property</TableHead>
          <TableHead>Value</TableHead>
          <TableHead className="w-[160px]">Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FINGERPRINT_ROWS.map((row) => (
          <TableRow key={row.key} className="hover:bg-transparent">
            <TableCell className="align-top font-medium text-foreground">
              {row.label}
            </TableCell>
            <TableCell className="align-top font-mono text-xs break-all whitespace-normal text-muted-foreground">
              {valueOf(row.key)}
            </TableCell>
            <TableCell className="align-top text-muted-foreground">
              {row.description}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="hover:bg-transparent">
          <TableCell className="align-top font-medium text-foreground">Timezone</TableCell>
          <TableCell className="align-top font-mono text-xs break-all text-muted-foreground">
            {inspection.geo.timezone} ({inspection.geo.utc_offset >= 0 ? "+" : ""}
            {inspection.geo.utc_offset} min)
          </TableCell>
          <TableCell className="align-top text-muted-foreground">UTC offset</TableCell>
        </TableRow>
        <TableRow className="hover:bg-transparent">
          <TableCell className="align-top font-medium text-foreground">Coordinates</TableCell>
          <TableCell className="align-top font-mono text-xs break-all text-muted-foreground">
            {inspection.geo.latitude.toFixed(4)}, {inspection.geo.longitude.toFixed(4)}
          </TableCell>
          <TableCell className="align-top text-muted-foreground">Approximate GPS</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

interface OverridesTabProps {
  inspection: Inspection;
  onOverrideChange: (property: string, value: unknown) => void;
  onOverrideRemove: (property: string) => void;
}

function OverridesTab({ inspection, onOverrideChange, onOverrideRemove }: OverridesTabProps) {
  const diffs = inspection.override_diff;

  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-foreground">No hand overrides</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Edit a value in the fingerprint to pin it. Overrides are stored as a
          sparse diff over the drawn identity.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {diffs.map((diff) => (
        <div
          key={diff.property}
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2",
            diff.overridden && "border-primary/40",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <code className="truncate text-xs font-medium text-foreground">{diff.property}</code>
            {diff.overridden && (
              <Badge variant="secondary" className="text-[10px]">
                Edited
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Drawn
            </span>
            <code className="max-w-40 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {formatValue(diff.drawn)}
            </code>
          </div>
          <Input
            key={`${diff.property}:${formatValue(diff.effective)}`}
            defaultValue={formatValue(diff.effective)}
            aria-label={`Effective value for ${diff.property}`}
            className="h-7 w-44 font-mono text-xs"
            onBlur={(event) => {
              const raw = event.target.value;
              let parsed: unknown;
              try {
                parsed = JSON.parse(raw);
              } catch {
                parsed = raw;
              }
              if (JSON.stringify(parsed) !== JSON.stringify(diff.effective)) {
                onOverrideChange(diff.property, parsed);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => {
              onOverrideRemove(diff.property);
            }}
          >
            Reset
          </Button>
        </div>
      ))}
    </div>
  );
}

function ProxyTab({ inspection }: { inspection: Inspection }) {
  const proxy = inspection.profile.proxy;

  if (!proxy) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-foreground">No proxy configured</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          A profile launches directly unless a proxy URL is set. Configure one when
          the profile is created.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">URL</span>
          <code className="truncate font-mono text-xs text-foreground" title={proxy.url}>
            {proxy.url}
          </code>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <span className="text-xs text-muted-foreground">Exit country</span>
          <Badge variant="outline">{proxy.exit_country ?? "unset"}</Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The exit IP must sit in the profile's country ({inspection.geo.country}), or the
        launch is refused at the geo gate.
      </p>
    </div>
  );
}

function CoherenceTab({ report }: { report: Report }) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm",
          report.launchable
            ? "border-success/30 bg-success/10 text-success-text"
            : "border-destructive/30 bg-destructive/10 text-destructive-text",
        )}
      >
        <span className="text-base leading-none">{report.launchable ? "✓" : "✕"}</span>
        <span>
          {report.launchable
            ? "Every invariant holds — the profile will launch as it stands"
            : "This profile has coherence issues and will not launch"}
        </span>
      </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Properties</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {report.property_count}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Broken invariants</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {report.violations.length}
            </p>
          </div>
        </div>

      {report.violations.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Violations ({report.violations.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {report.violations.map((violation, index) => (
              <li
                key={`${violation.rule}-${index}`}
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
              >
                <p className="font-mono text-[11px] text-destructive-text">{violation.rule}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{violation.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.override_problems.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Override problems ({report.override_problems.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {report.override_problems.map((problem, index) => (
              <li
                key={`${problem.property}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2"
              >
                <Badge variant="outline" className="border-warning/40 text-warning-text">
                  {problem.problem}
                </Badge>
                <code className="text-xs text-foreground">{problem.property}</code>
                {problem.problem === "wrong-type" && (
                  <span className="text-[11px] text-muted-foreground">
                    expected {problem.expected}, got {problem.found}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface VerifyTabProps {
  verification: VerifyReport | null;
  verifying: boolean;
  onVerify: (keepAgreements: boolean) => void;
}

/** Whether a verdict counts as the browser agreeing with the identity. */
const isAgreement = (verdict: Verdict) =>
  verdict === "match" || verdict === "equivalent" || verdict === "refused";

const VERDICT_LABEL: Record<Verdict, string> = {
  match: "match",
  equivalent: "equivalent",
  mismatch: "mismatch",
  unread: "unread",
  unclaimed: "unclaimed",
  refused: "refused",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  match: "border-success/30 bg-success/10 text-success-text",
  equivalent: "border-success/30 bg-success/10 text-success-text",
  refused: "border-success/30 bg-success/10 text-success-text",
  mismatch: "border-destructive/30 bg-destructive/10 text-destructive-text",
  unread: "border-warning/30 bg-warning/10 text-warning-text",
  unclaimed: "border-warning/30 bg-warning/10 text-warning-text",
};

/**
 * The read-back: what a page can actually see, against what the profile claims.
 *
 * Every other tab reasons about the identity the engine is handed. This one
 * launches the profile's engine at a bundled probe page and diffs the two, so
 * it is the only place a value is *measured* rather than asserted — and the
 * only place that opens a browser, which is why it waits for a click.
 */
function VerifyTab({ verification, verifying, onVerify }: VerifyTabProps) {
  const [keepAgreements, setKeepAgreements] = useState(false);

  if (verifying) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <LuLoaderCircle className="size-6 animate-spin text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Reading the profile back…</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            A browser is starting with this profile's identity, loading a bundled test page and
            closing itself. A cold start takes a few seconds; nothing is written to the profile.
          </p>
        </div>
      </div>
    );
  }

  if (!verification) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Verify this profile against a running browser
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The Fingerprint tab shows what the engine is <em>handed</em>. This launches a real
            browser with that identity, loads a bundled probe page and reads back what a page can
            actually see — navigator, screen, WebGL limits, extensions, headers — then reports
            every value that did not come back as claimed.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          The browser opens a window for a few seconds and closes itself. It uses a throwaway
          profile directory, so nothing here is added to the profile's own data.
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={keepAgreements}
            onChange={(event) => {
              setKeepAgreements(event.target.checked);
            }}
            className="size-3.5 accent-current"
          />
          List every compared value, not just the differences
        </label>
        <div>
          <Button size="sm" onClick={() => onVerify(keepAgreements)}>
            <LuShieldCheck className="size-3.5" />
            Run verification
          </Button>
        </div>
      </div>
    );
  }

  const mismatches = verification.differences.filter(
    (difference) => !isAgreement(difference.verdict),
  );
  const seconds = (verification.elapsed_ms / 1000).toFixed(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {verification.agreed} of {verification.checked} compared values agreed
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {seconds}s · {verification.program}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onVerify(keepAgreements)}>
          <LuRefreshCw className="size-3.5" />
          Run again
        </Button>
      </div>

      {verification.unmasked_renderer && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Renderer a page reads</p>
          <code className="text-xs break-all text-foreground">
            {verification.unmasked_renderer}
          </code>
        </div>
      )}

      {mismatches.length === 0 ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2">
          <p className="text-xs text-success-text">
            Everything the page could read came back as the profile claims it.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Differences ({mismatches.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {mismatches.map((difference, index) => (
              <li
                key={`${difference.property}-${index}`}
                className="flex flex-col gap-1 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", VERDICT_CLASS[difference.verdict])}
                  >
                    {VERDICT_LABEL[difference.verdict]}
                  </Badge>
                  <code className="text-xs text-foreground">{difference.property}</code>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                  <span>claimed: {formatValue(difference.expected)}</span>
                  <span>read: {formatValue(difference.observed)}</span>
                </div>
                {difference.note && (
                  <p className="text-[11px] text-muted-foreground">{difference.note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {keepAgreements && verification.differences.length > mismatches.length && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Agreed ({verification.differences.length - mismatches.length})
          </p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px]">Property</TableHead>
                <TableHead>Read back</TableHead>
                <TableHead className="w-[110px]">Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verification.differences
                .filter((difference) => isAgreement(difference.verdict))
                .map((difference, index) => (
                  <TableRow key={`${difference.property}-${index}`} className="hover:bg-transparent">
                    <TableCell className="align-top font-mono text-xs break-all whitespace-normal">
                      {difference.property}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs break-all whitespace-normal text-muted-foreground">
                      {formatValue(difference.observed)}
                    </TableCell>
                    <TableCell className="align-top text-[11px] text-muted-foreground">
                      {VERDICT_LABEL[difference.verdict]}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

interface ProfileInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: Inspection | null;
  report: Report | null;
  loading: boolean;
  launching: boolean;
  verification: VerifyReport | null;
  verifying: boolean;
  onVerify: (keepAgreements: boolean) => void;
  onLaunch: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOverrideChange: (property: string, value: unknown) => void;
  onOverrideRemove: (property: string) => void;
}

export function ProfileInfoDialog({
  open,
  onOpenChange,
  inspection,
  report,
  loading,
  launching,
  verification,
  verifying,
  onVerify,
  onLaunch,
  onEdit,
  onDelete,
  onOverrideChange,
  onOverrideRemove,
}: ProfileInfoDialogProps) {
  const [tab, setTab] = useState("fingerprint");

  useEffect(() => {
    if (!open) setTab("fingerprint");
  }, [open]);

  const profile = inspection?.profile;
  const summary = inspection?.summary ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Profile details</DialogTitle>
          <DialogDescription>Fingerprint, overrides, proxy and coherence.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 border-b border-border px-5 py-4 pr-14">
          {profile ? (
            <>
              <span
                className="grid size-9 shrink-0 place-items-center rounded-md text-xs font-semibold text-white select-none"
                style={{ background: avatarColor(profile.seed) }}
              >
                {profile.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-foreground">{profile.name}</h2>
                  {report && (
                    <Badge
                      variant="outline"
                      className={cn(
                        report.launchable
                          ? "border-success/30 bg-success/10 text-success-text"
                          : "border-destructive/30 bg-destructive/10 text-destructive-text",
                      )}
                    >
                      {report.launchable ? "Coherent" : "Issues"}
                    </Badge>
                  )}
                  {profile.proxy && <Badge variant="secondary">Proxy</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {OS_LABEL[profile.options.os] ?? profile.options.os}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {inspection.geo.country}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {profile.notes ? profile.notes : `seed ${profile.seed}`}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  disabled={!report?.launchable || launching}
                  onClick={onLaunch}
                >
                  <LuPlay className="size-3.5" />
                  {launching ? "Launching…" : "Launch"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={onEdit}
                  aria-label="Edit profile"
                >
                  <LuPencil className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  aria-label="Delete profile"
                >
                  <LuTrash2 className="size-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex w-full items-center gap-3">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-5 pt-3">
            <TabsList className="h-9">
              <TabsTrigger value="fingerprint" className="py-1 text-xs">
                Fingerprint
              </TabsTrigger>
              <TabsTrigger value="overrides" className="py-1 text-xs">
                Overrides
                {inspection && inspection.override_diff.length > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    {inspection.override_diff.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="proxy" className="py-1 text-xs">
                Proxy
              </TabsTrigger>
              <TabsTrigger value="coherence" className="py-1 text-xs">
                Coherence
                {report && report.violations.length > 0 && (
                  <span className="ml-1 text-muted-foreground">{report.violations.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="verify" className="py-1 text-xs">
                Verify
                {verification && (
                  <span className="ml-1 text-muted-foreground">
                    {verification.agreed}/{verification.checked}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {loading || !inspection || !report ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : (
              <>
                <TabsContent value="fingerprint" className="mt-0">
                  <FingerprintTab inspection={inspection} />
                </TabsContent>
                <TabsContent value="overrides" className="mt-0">
                  <OverridesTab
                    inspection={inspection}
                    onOverrideChange={onOverrideChange}
                    onOverrideRemove={onOverrideRemove}
                  />
                </TabsContent>
                <TabsContent value="proxy" className="mt-0">
                  <ProxyTab inspection={inspection} />
                </TabsContent>
                <TabsContent value="coherence" className="mt-0">
                  <CoherenceTab report={report} />
                </TabsContent>
                <TabsContent value="verify" className="mt-0">
                  <VerifyTab
                    verification={verification}
                    verifying={verifying}
                    onVerify={onVerify}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

