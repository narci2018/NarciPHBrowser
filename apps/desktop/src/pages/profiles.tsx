import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuChevronUp, LuInfo, LuPlay, LuTrash2 } from "react-icons/lu";
import type { ProfileSummary, TargetOs } from "@narc/sdk";
import { Logo } from "@/components/icons/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StoredAssignment } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const OS_LABEL_KEY: Record<TargetOs, string> = {
  windows: "common.osWindows",
  macos: "common.osMacos",
  linux: "common.osLinux",
};

const AVATAR_COLORS = [
  "#6c5ce7",
  "#0984e3",
  "#00b894",
  "#e17055",
  "#fd79a8",
  "#00cec9",
  "#e84393",
  "#74b9ff",
  "#a29bfe",
  "#fab1a0",
  "#55efc4",
  "#fdcb6e",
];

const avatarColor = (seed: number) => AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length];

const initialsOf = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const ROW_HEIGHT = 44;

interface ProfilesPageProps {
  profiles: ProfileSummary[];
  totalCount: number;
  isLoading: boolean;
  assignments: StoredAssignment[];
  /** Every group's name — the datalist offers all of them, empty ones too. */
  groupNames: string[];
  onCreate: () => void;
  onInspect: (profile: ProfileSummary) => void;
  onLaunch: (profile: ProfileSummary) => void;
  onDelete: (profile: ProfileSummary) => void;
  onBulkSetGroup: (ids: string[], group: string) => void;
  onBulkTrash: (ids: string[]) => void;
  /** Reports the visible selection upward (for the header's export), [] on unmount. */
  onSelectionChange?: (ids: string[]) => void;
  launchingId: string | null;
}

export function ProfilesPage({
  profiles,
  totalCount,
  isLoading,
  assignments,
  groupNames,
  onCreate,
  onInspect,
  onLaunch,
  onDelete,
  onBulkSetGroup,
  onBulkTrash,
  onSelectionChange,
  launchingId,
}: ProfilesPageProps) {
  const { t } = useTranslation();
  const [sortDesc, setSortDesc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");

  // The chips are the buckets the visible profiles are actually in, so the
  // counts follow a search. The bulk input below offers *every* group — an
  // empty one included, straight from the group list — because a group
  // created before it has a member is still a group one can file into.
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of profiles) {
      if (profile.group) {
        counts.set(profile.group, (counts.get(profile.group) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [profiles]);

  const rows = useMemo(() => {
    const visible = groupFilter
      ? profiles.filter((profile) => profile.group === groupFilter)
      : profiles;
    const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name));
    return sortDesc ? sorted.reverse() : sorted;
  }, [profiles, groupFilter, sortDesc]);

  // Selection only names rows the user can still see: after a group filter or
  // a search narrows the list, stale ids would silently widen the bulk blast
  // radius beyond what the user is looking at.
  const selectedIds = useMemo(
    () => rows.filter((profile) => selected.has(profile.id)).map((profile) => profile.id),
    [rows, selected],
  );
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  // The header exports whatever is checked here, so the selection is
  // mirrored upward. Unmount reports [] — leaving the page clears it, or a
  // stale selection would export rows nobody can see.
  useEffect(() => {
    onSelectionChange?.(selectedIds);
    return () => onSelectionChange?.([]);
  }, [selectedIds, onSelectionChange]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkApplies = selectedIds.length > 0;

  const applyGroup = () => {
    if (!bulkApplies) return;
    onBulkSetGroup(selectedIds, groupDraft.trim());
    setSelected(new Set());
    setGroupDraft("");
  };

  const trashSelection = () => {
    if (!bulkApplies) return;
    onBulkTrash(selectedIds);
    setSelected(new Set());
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setGroupFilter(null);
            }}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
              groupFilter === null
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("common.all")} <span className="tabular-nums">{profiles.length}</span>
          </button>
          {groups.map(([group, count]) => (
            <button
              key={group}
              type="button"
              onClick={() => {
                setGroupFilter(groupFilter === group ? null : group);
              }}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                groupFilter === group
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {group} <span className="tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      )}

      {bulkApplies && (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {t("common.selectedCount", { count: selectedIds.length })}
          </span>
          <input
            list="profile-groups"
            value={groupDraft}
            onChange={(event) => {
              setGroupDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyGroup();
            }}
            placeholder={t("common.groupNamePlaceholder")}
            aria-label={t("common.groupForSelected")}
            className="h-7 w-52 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <datalist id="profile-groups">
            {groupNames.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
          <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={applyGroup}>
            {t("common.applyGroup")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive"
            onClick={trashSelection}
          >
            <LuTrash2 className="size-3.5" />
            {t("common.moveToTrash")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSelected(new Set());
            }}
          >
            {t("common.clearSelection")}
          </Button>
        </div>
      )}

      <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
            <TableRow className="border-0! hover:bg-transparent">
              <TableHead className="w-[36px] pl-3">
                <input
                  type="checkbox"
                  aria-label={t("common.selectEveryVisible")}
                  checked={allSelected}
                  className="size-3.5 accent-current"
                  onChange={() => {
                    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
                  }}
                />
              </TableHead>
              <TableHead className="pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setSortDesc((v) => !v);
                  }}
                  className="flex cursor-pointer items-center gap-1 text-left font-semibold transition-colors hover:text-foreground"
                >
                  {t("common.name")}
                  {sortDesc ? (
                    <LuChevronDown className="size-3.5" />
                  ) : (
                    <LuChevronUp className="size-3.5" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[110px]">{t("common.os")}</TableHead>
              <TableHead className="w-[90px]">{t("common.country")}</TableHead>
              <TableHead className="w-[120px]">{t("common.fingerprint")}</TableHead>
              <TableHead className="w-[96px]">{t("common.overrides")}</TableHead>
              <TableHead className="w-[88px]">{t("common.networkTab")}</TableHead>
              <TableHead className="w-[112px] pr-3 text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-visible">
          {isLoading && rows.length === 0 ? (
            Array.from({ length: 8 }, (_, index) => (
              <TableRow key={`skeleton-${index}`} className="border-0!" style={{ height: ROW_HEIGHT }}>
                <TableCell colSpan={8} className="py-0 pl-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-7 shrink-0 rounded-md" />
                    <Skeleton className="h-3" style={{ width: `${30 + ((index * 17) % 40)}%` }} />
                    <div className="flex-1" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="border-0! hover:bg-transparent">
              <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Logo className="size-12 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {totalCount === 0 ? t("common.noProfilesYet") : t("common.noProfilesMatch")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {totalCount === 0
                          ? t("common.noProfilesHint")
                          : t("common.noProfilesMatchHint")}
                      </p>
                    </div>
                    {totalCount === 0 && (
                      <Button size="sm" onClick={onCreate} className="mt-1">
                        {t("common.createFirstProfile")}
                      </Button>
                    )}
                  </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((profile) => {
              const assignment = assignments.find(
                (candidate) => candidate.profile_id === profile.id,
              );
              return (
              <TableRow
                key={profile.id}
                data-profile-id={profile.id}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  "group/row border-0! hover:bg-muted",
                  launchingId === profile.id && "bg-muted/60",
                  selected.has(profile.id) && "bg-primary/5",
                )}
              >
                <TableCell className="overflow-visible py-0 pl-3">
                  <input
                    type="checkbox"
                    aria-label={t("common.selectProfile", { name: profile.name })}
                    checked={selected.has(profile.id)}
                    className="size-3.5 accent-current"
                    onChange={() => {
                      toggleOne(profile.id);
                    }}
                  />
                </TableCell>
                <TableCell className="overflow-visible py-0 pl-1">
                  <button
                    type="button"
                    onClick={() => {
                      onInspect(profile);
                    }}
                    className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-semibold text-white select-none"
                      style={{ background: avatarColor(profile.seed) }}
                    >
                      {initialsOf(profile.name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm leading-tight font-medium text-foreground">
                          {profile.name}
                        </span>
                        {profile.group && (
                          <span className="shrink-0 rounded border border-border px-1 py-px text-[10px] leading-tight text-muted-foreground">
                            {profile.group}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">
                        {profile.summary}
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{t(OS_LABEL_KEY[profile.os])}</TableCell>
                <TableCell className="text-muted-foreground">{profile.country || "—"}</TableCell>
                <TableCell>
                  {profile.coherent ? (
                    <Badge
                      variant="outline"
                      className="border-success/30 bg-success/10 text-success-text"
                    >
                      {t("common.coherent")}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-destructive/30 bg-destructive/10 text-destructive-text"
                    >
                      {t("common.issues")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {profile.override_count > 0 ? `${profile.override_count}` : "—"}
                </TableCell>
                <TableCell>
                  {assignment ? (
                    <Badge
                      variant="secondary"
                      title={`${assignment.subscription_id} · ${assignment.node}`}
                    >
                      {t("common.routeSubscription")}
                    </Badge>
                  ) : profile.proxied ? (
                    <Badge variant="secondary">{t("common.proxy")}</Badge>
                  ) : (
                    <span className="text-muted-foreground">{t("common.routeDirect")}</span>
                  )}
                </TableCell>
                <TableCell className="pr-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("common.launchProfile", { name: profile.name })}
                          disabled={!profile.coherent || launchingId === profile.id}
                          onClick={() => {
                            onLaunch(profile);
                          }}
                          className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <LuPlay className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {profile.coherent ? t("common.launch") : t("common.fixCoherenceFirst")}
                      </TooltipContent>
                    </Tooltip>
                    <button
                      type="button"
                      aria-label={t("common.openProfile", { name: profile.name })}
                      onClick={() => {
                        onInspect(profile);
                      }}
                      className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <LuInfo className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("common.deleteProfile", { name: profile.name })}
                      onClick={() => {
                        onDelete(profile);
                      }}
                      className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <LuTrash2 className="size-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })
          )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
