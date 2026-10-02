import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

const OS_LABEL: Record<TargetOs, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
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
  onCreate: () => void;
  onInspect: (profile: ProfileSummary) => void;
  onLaunch: (profile: ProfileSummary) => void;
  onDelete: (profile: ProfileSummary) => void;
  launchingId: string | null;
}

export function ProfilesPage({
  profiles,
  totalCount,
  isLoading,
  onCreate,
  onInspect,
  onLaunch,
  onDelete,
  launchingId,
}: ProfilesPageProps) {
  const [sortDesc, setSortDesc] = useState(false);

  const rows = useMemo(() => {
    const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
    return sortDesc ? sorted.reverse() : sorted;
  }, [profiles, sortDesc]);

  return (
    <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
      <Table className="table-fixed" containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
          <TableRow className="border-0! hover:bg-transparent">
            <TableHead className="pl-3">
              <button
                type="button"
                onClick={() => {
                  setSortDesc((v) => !v);
                }}
                className="flex cursor-pointer items-center gap-1 text-left font-semibold transition-colors hover:text-foreground"
              >
                Name
                {sortDesc ? (
                  <LuChevronDown className="size-3.5" />
                ) : (
                  <LuChevronUp className="size-3.5" />
                )}
              </button>
            </TableHead>
            <TableHead className="w-[110px]">OS</TableHead>
            <TableHead className="w-[90px]">Country</TableHead>
            <TableHead className="w-[120px]">Fingerprint</TableHead>
            <TableHead className="w-[96px]">Overrides</TableHead>
            <TableHead className="w-[88px]">Proxy</TableHead>
            <TableHead className="w-[112px] pr-3 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="overflow-visible">
          {isLoading && rows.length === 0 ? (
            Array.from({ length: 8 }, (_, index) => (
              <TableRow key={`skeleton-${index}`} className="border-0!" style={{ height: ROW_HEIGHT }}>
                <TableCell colSpan={7} className="py-0 pl-3">
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
              <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Logo className="size-12 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {totalCount === 0 ? "No profiles yet" : "No profiles match your search"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {totalCount === 0
                          ? "Each profile is a seed plus options — the identity is drawn, never stored."
                          : "Try a shorter query, or clear the search field."}
                      </p>
                    </div>
                    {totalCount === 0 && (
                      <Button size="sm" onClick={onCreate} className="mt-1">
                        Create your first profile
                      </Button>
                    )}
                  </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((profile) => (
              <TableRow
                key={profile.id}
                data-profile-id={profile.id}
                style={{ height: ROW_HEIGHT }}
                className={cn("group/row border-0! hover:bg-muted", launchingId === profile.id && "bg-muted/60")}
              >
                <TableCell className="overflow-visible py-0 pl-3">
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
                      <span className="truncate text-sm leading-tight font-medium text-foreground">
                        {profile.name}
                      </span>
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">
                        {profile.summary}
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{OS_LABEL[profile.os]}</TableCell>
                <TableCell className="text-muted-foreground">{profile.country || "—"}</TableCell>
                <TableCell>
                  {profile.coherent ? (
                    <Badge
                      variant="outline"
                      className="border-success/30 bg-success/10 text-success-text"
                    >
                      Coherent
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-destructive/30 bg-destructive/10 text-destructive-text"
                    >
                      Issues
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {profile.override_count > 0 ? `${profile.override_count}` : "—"}
                </TableCell>
                <TableCell>
                  {profile.proxied ? (
                    <Badge variant="secondary">Proxy</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="pr-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Launch ${profile.name}`}
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
                        {profile.coherent ? "Launch" : "Fix coherence issues first"}
                      </TooltipContent>
                    </Tooltip>
                    <button
                      type="button"
                      aria-label={`Open ${profile.name}`}
                      onClick={() => {
                        onInspect(profile);
                      }}
                      className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <LuInfo className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${profile.name}`}
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
