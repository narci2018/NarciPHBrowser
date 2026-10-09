import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuDownload, LuLoaderCircle, LuPencil, LuPlay, LuRefreshCw, LuShieldCheck, LuTrash2 } from "react-icons/lu";
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
import { IdentityFieldsTab } from "@/components/identity-fields-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StoredAssignment } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const OS_LABEL_KEY: Record<string, string> = {
  windows: "common.osWindows",
  macos: "common.osMacos",
  linux: "common.osLinux",
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
  labelKey: string;
  descKey: string;
}

const FINGERPRINT_ROWS: FingerprintRow[] = [
  { key: "navigator.userAgent", labelKey: "common.userAgent", descKey: "common.userAgentDescription" },
  { key: "navigator.platform", labelKey: "common.platform", descKey: "common.platformDescription" },
  { key: "navigator.language", labelKey: "common.language", descKey: "common.languageDescription" },
  { key: "navigator.hardwareConcurrency", labelKey: "common.hardwareCores", descKey: "common.hardwareCoresDescription" },
  { key: "navigator.devicePixelRatio", labelKey: "common.devicePixelRatio", descKey: "common.devicePixelRatioDescription" },
  { key: "navigator.maxTouchPoints", labelKey: "common.maxTouchPoints", descKey: "common.maxTouchPointsDescription" },
  { key: "screen.width", labelKey: "common.screenWidth", descKey: "common.screenWidthDescription" },
  { key: "screen.height", labelKey: "common.screenHeight", descKey: "common.screenHeightDescription" },
  { key: "screen.availWidth", labelKey: "common.availableWidth", descKey: "common.availableWidthDescription" },
  { key: "screen.availHeight", labelKey: "common.availableHeight", descKey: "common.availableHeightDescription" },
  { key: "screen.colorDepth", labelKey: "common.colorDepth", descKey: "common.colorDepthDescription" },
  { key: "webGl:renderer", labelKey: "common.webglRenderer", descKey: "common.webglRendererDescription" },
  { key: "webGl:vendor", labelKey: "common.webglVendor", descKey: "common.webglVendorDescription" },
  { key: "fonts", labelKey: "common.fonts", descKey: "common.fontsDescription" },
  { key: "timezone", labelKey: "common.timezone", descKey: "common.timezoneDescription" },
];

function FingerprintTab({ inspection }: { inspection: Inspection }) {
  const { t } = useTranslation();
  const valueOf = (key: string) => formatValue(inspection.effective[key]);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[180px]">{t("common.property")}</TableHead>
          <TableHead>{t("common.value")}</TableHead>
          <TableHead className="w-[160px]">{t("common.description")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FINGERPRINT_ROWS.map((row) => (
          <TableRow key={row.key} className="hover:bg-transparent">
            <TableCell className="align-top font-medium text-foreground">
              {t(row.labelKey)}
            </TableCell>
            <TableCell className="align-top font-mono text-xs break-all whitespace-normal text-muted-foreground">
              {valueOf(row.key)}
            </TableCell>
            <TableCell className="align-top text-muted-foreground">
              {t(row.descKey)}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="hover:bg-transparent">
          <TableCell className="align-top font-medium text-foreground">{t("common.timezone")}</TableCell>
          <TableCell className="align-top font-mono text-xs break-all text-muted-foreground">
            {inspection.geo.timezone} ({inspection.geo.utc_offset >= 0 ? "+" : ""}
            {inspection.geo.utc_offset} min)
          </TableCell>
          <TableCell className="align-top text-muted-foreground">{t("common.utcOffset")}</TableCell>
        </TableRow>
        <TableRow className="hover:bg-transparent">
          <TableCell className="align-top font-medium text-foreground">{t("common.coordinates")}</TableCell>
          <TableCell className="align-top font-mono text-xs break-all text-muted-foreground">
            {inspection.geo.latitude.toFixed(4)}, {inspection.geo.longitude.toFixed(4)}
          </TableCell>
          <TableCell className="align-top text-muted-foreground">{t("common.coordinatesDescription")}</TableCell>
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
  const { t } = useTranslation();
  const diffs = inspection.override_diff;

  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-foreground">{t("common.noHandOverrides")}</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t("common.noHandOverridesHint")}
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
                {t("common.edited")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              {t("common.drawn")}
            </span>
            <code className="max-w-40 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {formatValue(diff.drawn)}
            </code>
          </div>
          <Input
            key={`${diff.property}:${formatValue(diff.effective)}`}
            defaultValue={formatValue(diff.effective)}
            aria-label={t("common.effectiveValueFor", { property: diff.property })}
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
            {t("common.reset")}
          </Button>
        </div>
      ))}
    </div>
  );
}

function NetworkTab({
  inspection,
  assignment,
}: {
  inspection: Inspection;
  assignment: StoredAssignment | undefined;
}) {
  const { t } = useTranslation();
  const proxy = inspection.profile.proxy;

  // A launch through a subscription replaces the proxy URL with the core's
  // local port, so the node is the route the traffic really takes — and it is
  // read from the assignment file, not from `profile.proxy`.
  if (assignment) {
    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
            <span className="text-xs text-muted-foreground">{t("common.routeSubscription")}</span>
            <code className="truncate font-mono text-xs text-foreground" title={assignment.subscription_id}>
              {assignment.subscription_id}
            </code>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">{t("common.node")}</span>
            <code className="truncate font-mono text-xs text-foreground" title={assignment.node}>
              {assignment.node}
            </code>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("common.subscriptionRouteHint")}</p>
      </div>
    );
  }

  if (!proxy) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-foreground">{t("common.routeDirect")}</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t("common.directRouteHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">{t("common.url")}</span>
          <code className="truncate font-mono text-xs text-foreground" title={proxy.url}>
            {proxy.url}
          </code>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <span className="text-xs text-muted-foreground">{t("common.exitCountry")}</span>
          <Badge variant="outline">{proxy.exit_country ?? t("common.unset")}</Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("common.proxyGeoHint", { country: inspection.geo.country })}
      </p>
    </div>
  );
}

function CoherenceTab({ report }: { report: Report }) {
  const { t } = useTranslation();
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
            ? t("common.everyInvariantHolds")
            : t("common.coherenceIssues")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{t("common.properties")}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {report.property_count}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{t("common.brokenInvariants")}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {report.violations.length}
          </p>
        </div>
      </div>

      {report.violations.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            {t("common.violations")} ({report.violations.length})
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
            {t("common.overrideProblems")} ({report.override_problems.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {report.override_problems.map((problem, index) => (
              <li
                key={`${problem.property}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2"
              >
                <Badge variant="outline" className="border-warning/40 text-warning-text">
                  {problem.problem === "wrong-type" ? t("common.wrongType") : problem.problem}
                </Badge>
                <code className="text-xs text-foreground">{problem.property}</code>
                {problem.problem === "wrong-type" && (
                  <span className="text-[11px] text-muted-foreground">
                    {t("common.expected")} {problem.expected}, {t("common.got")} {problem.found}
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

const VERDICT_LABEL_KEY: Record<Verdict, string> = {
  match: "common.match",
  equivalent: "common.equivalent",
  mismatch: "common.mismatch",
  unread: "common.unread",
  unclaimed: "common.unclaimed",
  refused: "common.refused",
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
  const { t } = useTranslation();
  const [keepAgreements, setKeepAgreements] = useState(false);

  if (verifying) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <LuLoaderCircle className="size-6 animate-spin text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{t("common.readingProfile")}</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {t("common.readingProfileHint")}
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
            {t("common.verifyProfile")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("common.verifyDescription")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("common.verifyHint")}
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
          {t("common.listEveryValue")}
        </label>
        <div>
          <Button size="sm" onClick={() => onVerify(keepAgreements)}>
            <LuShieldCheck className="size-3.5" />
            {t("common.runVerification")}
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
            {t("common.comparedValuesAgreed", { agreed: verification.agreed, checked: verification.checked })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {seconds}s · {verification.program}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onVerify(keepAgreements)}>
          <LuRefreshCw className="size-3.5" />
          {t("common.runAgain")}
        </Button>
      </div>

      {verification.unmasked_renderer && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">{t("common.rendererRead")}</p>
          <code className="text-xs break-all text-foreground">
            {verification.unmasked_renderer}
          </code>
        </div>
      )}

      {mismatches.length === 0 ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2">
          <p className="text-xs text-success-text">
            {t("common.everythingAgreed")}
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            {t("common.differences")} ({mismatches.length})
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
                    {t(VERDICT_LABEL_KEY[difference.verdict])}
                  </Badge>
                  <code className="text-xs text-foreground">{difference.property}</code>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                  <span>{t("common.claimedLabel")} {formatValue(difference.expected)}</span>
                  <span>{t("common.readLabel")} {formatValue(difference.observed)}</span>
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
            {t("common.agreed")} ({verification.differences.length - mismatches.length})
          </p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px]">{t("common.property")}</TableHead>
                <TableHead>{t("common.readBack")}</TableHead>
                <TableHead className="w-[110px]">{t("common.verdict")}</TableHead>
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
                      {t(VERDICT_LABEL_KEY[difference.verdict])}
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
  assignments: StoredAssignment[];
  launching: boolean;
  verification: VerifyReport | null;
  verifying: boolean;
  onVerify: (keepAgreements: boolean) => void;
  onLaunch: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
  onOverrideChange: (property: string, value: unknown) => void;
  onOverrideRemove: (property: string) => void;
}

export function ProfileInfoDialog({
  open,
  onOpenChange,
  inspection,
  report,
  loading,
  assignments,
  launching,
  verification,
  verifying,
  onVerify,
  onLaunch,
  onEdit,
  onDelete,
  onExport,
  onOverrideChange,
  onOverrideRemove,
}: ProfileInfoDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("fingerprint");

  useEffect(() => {
    if (!open) setTab("fingerprint");
  }, [open]);

  const profile = inspection?.profile;
  const summary = inspection?.summary ?? "";
  const assignment = profile
    ? assignments.find((candidate) => candidate.profile_id === profile.id)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("common.profileDetails")}</DialogTitle>
          <DialogDescription>{t("common.fingerprintDescription")}</DialogDescription>
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
                      {report.launchable ? t("common.coherent") : t("common.issues")}
                    </Badge>
                  )}
                  {assignment ? (
                    <Badge variant="secondary">{t("common.routeSubscription")}</Badge>
                  ) : (
                    profile.proxy && <Badge variant="secondary">{t("common.proxy")}</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {t(OS_LABEL_KEY[profile.options.os] ?? profile.options.os)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {inspection.geo.country}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {profile.notes ? profile.notes : t("common.seedLabel", { seed: profile.seed })}
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
                  {launching ? t("common.launching") : t("common.launch")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={onEdit}
                  aria-label={t("common.editProfile")}
                >
                  <LuPencil className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={onExport}
                  aria-label={t("common.exportProfileAction")}
                >
                  <LuDownload className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  aria-label={t("common.deleteProfileAction")}
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
                {t("common.fingerprint")}
              </TabsTrigger>
              <TabsTrigger value="overrides" className="py-1 text-xs">
                {t("common.overrides")}
                {inspection && inspection.override_diff.length > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    {inspection.override_diff.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="fields" className="py-1 text-xs">
                {t("common.fields")}
              </TabsTrigger>
              <TabsTrigger value="network" className="py-1 text-xs">
                {t("common.networkTab")}
              </TabsTrigger>
              <TabsTrigger value="coherence" className="py-1 text-xs">
                {t("common.coherence")}
                {report && report.violations.length > 0 && (
                  <span className="ml-1 text-muted-foreground">{report.violations.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="verify" className="py-1 text-xs">
                {t("common.verify")}
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
                <TabsContent value="fields" className="mt-0">
                  <IdentityFieldsTab
                    inspection={inspection}
                    onOverrideChange={onOverrideChange}
                    onOverrideRemove={onOverrideRemove}
                  />
                </TabsContent>
                <TabsContent value="network" className="mt-0">
                  <NetworkTab inspection={inspection} assignment={assignment} />
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
