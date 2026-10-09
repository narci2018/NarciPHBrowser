import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuCloud, LuKeyboard, LuPlug } from "react-icons/lu";
import { toast } from "sonner";
import type {
  ClearOverrideResult,
  CreateResult,
  CreateSpec,
  Inspection,
  Launched,
  ListResult,
  Profile,
  ProfileSummary,
  Report,
  SetOverrideResult,
  VerifyReport,
} from "@narc/sdk";
import { AboutDialog } from "@/components/about-dialog";
import { CreateProfileDialog } from "@/components/create-profile-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { ProfileExportDialog, type ExportTarget } from "@/components/profile-export-dialog";
import { TrashDialog } from "@/components/trash-dialog";
import { Logo } from "@/components/icons/logo";
import HomeHeader from "@/components/home-header";
import { ProfileInfoDialog } from "@/components/profile-info-dialog";
import { RailNav, type AppPage } from "@/components/rail-nav";
import { Progress } from "@/components/ui/progress";
import { WindowDragArea } from "@/components/window-drag-area";
import { PlaceholderPage } from "@/pages/placeholder";
import { ProfilesPage } from "@/pages/profiles";
import { listGroups, type GroupInfo } from "@/lib/groups";
import {
  assignNode,
  listAssignments,
  unassignNode,
  type NodeAssignment,
  type StoredAssignment,
} from "@/lib/subscriptions";

// Only the profiles page is needed for the first paint; the rest are fetched
// when the rail navigates to them, so startup parses less JavaScript. The
// fallback is deliberately empty — the chunks come off local disk, so a spinner
// would only flash.
const AgentPage = lazy(() => import("@/pages/agent").then((m) => ({ default: m.AgentPage })));
const ExtensionsPage = lazy(() =>
  import("@/pages/extensions").then((m) => ({ default: m.ExtensionsPage })),
);
const GroupsPage = lazy(() => import("@/pages/groups").then((m) => ({ default: m.GroupsPage })));
const NetworkPage = lazy(() =>
  import("@/pages/network").then((m) => ({ default: m.NetworkPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.SettingsPage })),
);

type PlaceholderKey = Exclude<
  AppPage,
  "profiles" | "groups" | "proxies" | "settings" | "about" | "extensions" | "agent"
>;

type PlaceholderEntry = { titleKey: string; descKey: string; Icon: React.ComponentType<{ className?: string }> };

const PLACEHOLDER_KEYS: Record<PlaceholderKey, PlaceholderEntry> = {
  integrations: { titleKey: "common.integrationsTitle", descKey: "common.integrationsDescription", Icon: LuPlug },
  account: { titleKey: "common.accountTitle", descKey: "common.accountDescription", Icon: LuCloud },
  shortcuts: { titleKey: "common.shortcutsTitle", descKey: "common.shortcutsDescription", Icon: LuKeyboard },
};

const PAGE_TITLE_KEYS: Partial<Record<AppPage, string>> = {
  groups: "common.groupsTitle",
  proxies: "common.networkTitle",
  extensions: "common.extensionsTitle",
  agent: "common.agentTitle",
  integrations: "common.integrationsTitle",
  account: "common.accountTitle",
  shortcuts: "common.shortcutsTitle",
  settings: "common.settingsTitle",
};

interface DownloadState {
  phase: string;
  percent: number;
}

const ENGINE_TOAST_ID = "engine-download";
const CORE_TOAST_ID = "core-download";

export function App() {
  const { t } = useTranslation();
  // `t` is rebound whenever the language changes, so a callback memoized over it
  // directly would keep emitting the language that was active when it was
  // created. The two bootstrap callbacks below must also stay identity-stable —
  // they are dependencies of the mount effect — so they read the current `t`
  // through a ref instead of taking it as a dependency, which would re-run the
  // whole bootstrap on every language switch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [versionLine, setVersionLine] = useState("");
  const [download, setDownload] = useState<DownloadState | null>(null);

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  // Where each profile's traffic leaves is stored beside the profile: an
  // assignment file holds the subscription routes, `profile.proxy` the URLs.
  // The rows and the info dialog show all three kinds, so both need it.
  const [assignments, setAssignments] = useState<StoredAssignment[]>([]);
  // Group names live in their own file beside the profiles: the groups page
  // lists and edits them, and the pickers offer them, so both read this copy
  // — refreshed with the profiles, since a save can file one under a new name.
  const [groups, setGroups] = useState<GroupInfo[]>([]);

  const [page, setPage] = useState<AppPage>("profiles");
  const [searchQuery, setSearchQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [infoProfileId, setInfoProfileId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProfileSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkTrashIds, setBulkTrashIds] = useState<string[] | null>(null);
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerifyReport | null>(null);
  const [verifying, setVerifying] = useState(false);

  // The profile the dialog is showing, readable from a callback that has been
  // awaiting a browser start for several seconds.
  const infoProfileIdRef = useRef<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    try {
      const result = await invoke<ListResult>("list_profiles");
      setProfiles(result.profiles);
      if (result.unreadable.length > 0) {
        toast.warning(
          tRef.current("common.profilesCouldNotRead", { count: result.unreadable.length }),
        );
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setProfilesLoading(false);
    }
    // The route is a separate file from the profile, so it is read on its own:
    // a failing assignment list must not hide the profiles themselves.
    try {
      setAssignments(await listAssignments());
    } catch (error) {
      toast.error(String(error));
    }
    // So are the group names: a failing group file must not take the profile
    // list down with it, and the pickers read this refresh too.
    try {
      setGroups(await listGroups());
    } catch (error) {
      toast.error(String(error));
    }
  }, []);

  const downloadToastOpen = useRef(false);

  const showDownload = useCallback((payload: DownloadState) => {
    setDownload(payload);
    downloadToastOpen.current = true;
    toast.loading(`${payload.phase} · ${Math.round(payload.percent)}%`, {
      id: ENGINE_TOAST_ID,
      duration: Infinity,
    });
  }, []);

  // The retry action re-runs this same call, so it reaches the callback through
  // a ref rather than referencing the const while it is still being initialized.
  const ensureEngineRef = useRef<() => void>(() => {});
  const ensureEngine = useCallback((): void => {
    void invoke<string>("ensure_engine")
      .then(() => {
        if (downloadToastOpen.current) {
          downloadToastOpen.current = false;
          setDownload(null);
          toast.success(tRef.current("common.engineReady"), { id: ENGINE_TOAST_ID, duration: 5000 });
        }
      })
      .catch((error) => {
        setDownload(null);
        const message = String(error);
        const retry = {
          label: tRef.current("common.retry"),
          onClick: () => ensureEngineRef.current(),
        };
        if (downloadToastOpen.current) {
          downloadToastOpen.current = false;
          toast.error(message, { id: ENGINE_TOAST_ID, duration: Infinity, action: retry });
        } else {
          toast.error(message, { action: retry });
        }
      });
  }, []);
  useEffect(() => {
    ensureEngineRef.current = ensureEngine;
  }, [ensureEngine]);

  useEffect(() => {
    let disposed = false;

    const unlisten = listen<DownloadState>("download-progress", (event) => {
      if (!disposed) showDownload(event.payload);
    });

    invoke<string>("app_info")
      .then((message) => {
        if (disposed) return;
        setVersionLine(message);
        setReady(true);
        ensureEngine();
        return refreshProfiles();
      })
      .catch((error) => {
        if (!disposed) setFatal(String(error));
      });

    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, [ensureEngine, refreshProfiles, showDownload]);

  useEffect(() => {
    let disposed = false;

    const unlisten = listen<DownloadState>("core-download-progress", (event) => {
      if (disposed) return;
      const { phase, percent } = event.payload;
      if (percent >= 100) {
        toast.success(phase, { id: CORE_TOAST_ID, duration: 4000 });
      } else {
        toast.loading(`${phase} · ${Math.round(percent)}%`, {
          id: CORE_TOAST_ID,
          duration: Infinity,
        });
      }
    });

    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  const loadInfo = useCallback(async (id: string) => {
    return Promise.all([
      invoke<Inspection>("inspect_profile", { id }),
      invoke<Report>("validate_profile", { id }),
    ]);
  }, []);

  useEffect(() => {
    // A verification belongs to the profile it was run against, so opening
    // another profile drops the last report rather than showing it under a
    // different name.
    infoProfileIdRef.current = infoProfileId;
    setVerification(null);
    setVerifying(false);

    if (!infoProfileId) {
      setInspection(null);
      setReport(null);
      setInfoLoading(false);
      return;
    }

    let cancelled = false;
    setInfoLoading(true);

    void (async () => {
      try {
        const [nextInspection, nextReport] = await loadInfo(infoProfileId);
        if (!cancelled) {
          setInspection(nextInspection);
          setReport(nextReport);
        }
      } catch (error) {
        if (!cancelled) toast.error(String(error));
      } finally {
        if (!cancelled) setInfoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [infoProfileId, loadInfo]);

  const handleSubmit = useCallback(
    async (spec: CreateSpec, assignment?: NodeAssignment | null) => {
      // The route lives beside the profile rather than inside it: an inline
      // proxy URL and a node assignment are two ways of saying where the
      // traffic leaves, so the stored route is rewritten on every save instead
      // of being left to describe an older profile.
      const route = async (id: string) => {
        if (assignment) {
          await assignNode(id, assignment);
        } else {
          await unassignNode(id);
        }
      };
      try {
        if (editingProfile) {
          await invoke<CreateResult>("update_profile", {
            id: editingProfile.id,
            spec,
          });
          await route(editingProfile.id);
          await refreshProfiles();
          setCreateOpen(false);
          setEditingProfile(null);
          toast.success(t("common.savedProfile", { name: spec.name }));
          if (infoProfileId) {
            const [nextInspection, nextReport] = await loadInfo(infoProfileId);
            setInspection(nextInspection);
            setReport(nextReport);
          }
          return;
        }
        const result = await invoke<CreateResult>("create_profile", { spec });
        try {
          await route(result.summary.id);
        } catch (routeError) {
          // The profile exists now. Reopening the dialog instead of closing it
          // would offer a second create of the same profile, so the route's
          // failure is reported and the dialog closes on the profile it made.
          toast.error(String(routeError));
        }
        await refreshProfiles();
        setCreateOpen(false);
        toast.success(t("common.createdProfile", { name: result.summary.name }));
        setInfoProfileId(result.summary.id);
      } catch (error) {
        toast.error(String(error));
        throw error;
      }
    },
    [editingProfile, infoProfileId, loadInfo, refreshProfiles, t],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await invoke("trash_profile", { id: deleteTarget.id });
      if (infoProfileId === deleteTarget.id) setInfoProfileId(null);
      await refreshProfiles();
      setDeleteTarget(null);
      toast.success(t("common.movedToTrash", { name: deleteTarget.name }), {
        description: t("common.movedToTrashHint"),
      });
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, infoProfileId, refreshProfiles, t]);

  const handleBulkSetGroup = useCallback(
    async (ids: string[], group: string) => {
      try {
        const result = await invoke<{
          updated: string[];
          failed: { id: string; error: string }[];
        }>("bulk_set_group", { ids, group });
        await refreshProfiles();
        if (result.failed.length > 0) {
          toast.error(t("common.couldNotFile", { failed: result.failed.length, total: ids.length }), {
            description: result.failed.map((f) => `${f.id}: ${f.error}`).join("\n"),
          });
        } else if (group) {
          toast.success(t("common.filedUnder", { count: result.updated.length, group }));
        } else {
          toast.success(t("common.removedFromGroups", { count: result.updated.length }));
        }
      } catch (error) {
        toast.error(String(error));
      }
    },
    [refreshProfiles, t],
  );

  // Group mutations report whether they went through, so the groups page can
  // keep an inline rename or a delete confirmation open on a refusal instead
  // of closing over a change that never landed.
  const handleCreateGroup = useCallback(
    async (name: string) => {
      try {
        await invoke("create_group", { name });
        await refreshProfiles();
        toast.success(t("common.groupCreated", { name: name.trim() }));
        return true;
      } catch (error) {
        toast.error(String(error));
        return false;
      }
    },
    [refreshProfiles, t],
  );

  const handleRenameGroup = useCallback(
    async (from: string, to: string) => {
      try {
        await invoke("rename_group", { from, to });
        await refreshProfiles();
        toast.success(t("common.groupRenamed", { name: to.trim() }));
        return true;
      } catch (error) {
        toast.error(String(error));
        return false;
      }
    },
    [refreshProfiles, t],
  );

  const handleDeleteGroup = useCallback(
    async (name: string) => {
      try {
        await invoke("delete_group", { name });
        await refreshProfiles();
        toast.success(t("common.groupDeleted", { name }));
        return true;
      } catch (error) {
        toast.error(String(error));
        return false;
      }
    },
    [refreshProfiles, t],
  );

  // The confirm dialog is shared with the single delete; which action it
  // takes is decided here, from whether a bulk selection is pending.
  const handleBulkTrash = useCallback(async () => {
    if (!bulkTrashIds) return;
    setDeleteBusy(true);
    try {
      const result = await invoke<{
        trashed: string[];
        failed: { id: string; error: string }[];
      }>("bulk_trash", { ids: bulkTrashIds });
      await refreshProfiles();
      setBulkTrashIds(null);
      if (result.failed.length > 0) {
        toast.error(t("common.couldNotTrash", { failed: result.failed.length, total: bulkTrashIds.length }), {
          description: result.failed.map((f) => `${f.id}: ${f.error}`).join("\n"),
        });
      } else {
        toast.success(t("common.movedToTrashCount", { count: result.trashed.length }), {
          description: t("common.movedToTrashHint"),
        });
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [bulkTrashIds, refreshProfiles, t]);

  const handleLaunch = useCallback(async (id: string) => {
    setLaunchingId(id);
    try {
      const launched = await invoke<Launched>("launch_profile", { id });
      const pid = typeof launched.pid === "number" ? ` (pid ${launched.pid})` : "";
      toast.success(t("common.browserLaunched", { pid }));
      if (launched.geo_gate && launched.geo_gate.verdict === "unknown") {
        toast.warning(
          t("common.geoGateUnknown", { expected: launched.geo_gate.expected }),
        );
      } else if (launched.geo_gate && launched.geo_gate.verdict === "mismatch") {
        toast.warning(
          t("common.geoGateMismatch", { observed: launched.geo_gate.observed, expected: launched.geo_gate.expected }),
        );
      }
      if (launched.discarded.length > 0) {
        toast.info(t("common.discardedValues", { count: launched.discarded.length }));
      }
      // Plan warnings do not block the launch, but they name things the user
      // would otherwise only find out by testing the browser themselves — a
      // missing engine, an addon the engine will skip, a WebGL renderer whose
      // limits will come from the host and contradict it.
      for (const warning of launched.plan?.warnings ?? []) {
        toast.warning(warning, { duration: 12000 });
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLaunchingId(null);
    }
  }, [t]);

  const handleVerify = useCallback(
    async (keepAgreements: boolean) => {
      const id = infoProfileId;
      if (!id) return;
      setVerifying(true);
      setVerification(null);
      try {
        const result = await invoke<VerifyReport>("verify_profile", {
          id,
          keepAgreements,
        });
        // The user may have opened another profile while the browser was
        // starting. The report belongs to the profile it was run against, and
        // showing it under a different name would be a lie about that profile.
        if (infoProfileIdRef.current !== id) return;
        setVerification(result);
        const mismatches = result.differences.filter(
          (difference) =>
            difference.verdict !== "match" &&
            difference.verdict !== "equivalent" &&
            difference.verdict !== "refused",
        );
        if (mismatches.length === 0) {
          toast.success(t("common.verifiedAgreed", { agreed: result.agreed, checked: result.checked }));
        } else {
          toast.warning(
            t("common.verificationFound", { count: mismatches.length }),
          );
        }
      } catch (error) {
        toast.error(String(error));
      } finally {
        setVerifying(false);
      }
    },
    [infoProfileId, t],
  );

  const handleOverrideChange = useCallback(
    async (property: string, value: unknown) => {
      if (!infoProfileId) return;
      try {
        const result = await invoke<SetOverrideResult>("set_override", {
          id: infoProfileId,
          property,
          value,
        });
        setReport(result.report);
        const next = await invoke<Inspection>("inspect_profile", { id: infoProfileId });
        setInspection(next);
        await refreshProfiles();
        toast.success(t("common.updatedProperty", { property, coerced: result.coerced }));
      } catch (error) {
        toast.error(String(error));
      }
    },
    [infoProfileId, refreshProfiles, t],
  );

  const handleOverrideRemove = useCallback(
    async (property: string) => {
      if (!infoProfileId) return;
      try {
        const result = await invoke<ClearOverrideResult>("clear_override", {
          id: infoProfileId,
          property,
        });
        setReport(result.report);
        const next = await invoke<Inspection>("inspect_profile", { id: infoProfileId });
        setInspection(next);
        await refreshProfiles();
        toast.success(t("common.resetProperty", { property }));
      } catch (error) {
        toast.error(String(error));
      }
    },
    [infoProfileId, refreshProfiles, t],
  );

  // The export dialog reads the proxy straight off the inspection the info
  // dialog is showing, so its login warning describes the real proxy.
  const handleExportRequest = useCallback(() => {
    if (!inspection || !infoProfileId) return;
    setExportTarget({
      id: infoProfileId,
      name: inspection.profile.name,
      proxyUrl: inspection.profile.proxy?.url ?? null,
    });
  }, [inspection, infoProfileId]);

  const handleImportProfile = useCallback(async () => {
    try {
      const result = await invoke<{ cancelled?: boolean; name?: string }>("import_profile", {});
      if (result.cancelled) return;
      await refreshProfiles();
      toast.success(t("common.importedProfile", { name: result.name }));
    } catch (error) {
      toast.error(String(error));
    }
  }, [refreshProfiles, t]);

  const filteredProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return profiles;
    return profiles.filter((profile) =>
      [
        profile.name,
        profile.summary,
        profile.country,
        profile.os,
        profile.coherent ? "coherent" : "issues",
        profile.proxied ? "proxy" : "",
      ].some((field) => field.toLowerCase().includes(query)),
    );
  }, [profiles, searchQuery]);

  const navigate = useCallback((next: AppPage) => {
    if (next === "about") {
      setAboutOpen(true);
      return;
    }
    setPage(next);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <Logo className="size-10 animate-pulse text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {fatal ? `Error: ${fatal}` : t("common.startingEngine")}
        </p>
        {download && (
          <div className="w-64 space-y-2">
            <Progress value={download.percent} />
            <p className="text-center text-xs text-muted-foreground">
              {download.phase} ({Math.round(download.percent)}%)
            </p>
          </div>
        )}
      </div>
    );
  }

  const placeholderKey = PLACEHOLDER_KEYS[page as PlaceholderKey] ?? null;
  const placeholder = placeholderKey
    ? { title: t(placeholderKey.titleKey), description: t(placeholderKey.descKey), Icon: placeholderKey.Icon }
    : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <RailNav
        currentPage={page}
        onNavigate={navigate}
        onOpenTrash={() => {
          setTrashOpen(true);
        }}
        onOpenAbout={() => {
          setAboutOpen(true);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <HomeHeader
          onCreateProfileDialogOpen={() => {
            setEditingProfile(null);
            setCreateOpen(true);
          }}
          onImportProfiles={() => {
            void handleImportProfile();
          }}
          onOpenTrash={() => {
            setTrashOpen(true);
          }}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          totalProfiles={profiles.length}
          pageTitle={page === "profiles" ? undefined : (PAGE_TITLE_KEYS[page] ? t(PAGE_TITLE_KEYS[page]!) : page)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="flex min-h-0 flex-1" />}>
            {page === "profiles" ? (
              <ProfilesPage
                profiles={filteredProfiles}
                totalCount={profiles.length}
                isLoading={profilesLoading}
                assignments={assignments}
                launchingId={launchingId}
                onCreate={() => {
                  setEditingProfile(null);
                  setCreateOpen(true);
                }}
                onInspect={(profile) => {
                  setInfoProfileId(profile.id);
                }}
                onLaunch={(profile) => {
                  void handleLaunch(profile.id);
                }}
                onDelete={(profile) => {
                  setDeleteTarget(profile);
                }}
                onBulkSetGroup={(ids, group) => {
                  void handleBulkSetGroup(ids, group);
                }}
                onBulkTrash={(ids) => {
                  setBulkTrashIds(ids);
                  setDeleteTarget(null);
                }}
                groupNames={groups.map((group) => group.name)}
              />
            ) : page === "groups" ? (
              <GroupsPage
                groups={groups}
                isLoading={profilesLoading}
                onCreate={handleCreateGroup}
                onRename={handleRenameGroup}
                onDelete={handleDeleteGroup}
              />
            ) : page === "proxies" ? (
              <NetworkPage
                profiles={profiles}
                onProfilesChanged={() => {
                  void refreshProfiles();
                }}
              />
            ) : page === "extensions" ? (
              <ExtensionsPage
                profiles={profiles}
                onProfilesChanged={() => {
                  void refreshProfiles();
                }}
              />
            ) : page === "agent" ? (
              <AgentPage profiles={profiles} />
            ) : page === "settings" ? (
              <SettingsPage versionLine={versionLine} download={download} />
            ) : placeholder ? (
              <PlaceholderPage
                title={placeholder.title}
                description={placeholder.description}
                Icon={placeholder.Icon}
              />
            ) : null}
          </Suspense>
        </main>
      </div>

      <WindowDragArea />

      <CreateProfileDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditingProfile(null);
        }}
        profile={editingProfile}
        groupNames={groups.map((group) => group.name)}
        onSubmit={handleSubmit}
      />

      <ProfileInfoDialog
        open={infoProfileId !== null}
        onOpenChange={(open) => {
          if (!open) setInfoProfileId(null);
        }}
        inspection={inspection}
        report={report}
        loading={infoLoading}
        assignments={assignments}
        launching={launchingId === infoProfileId}
        verification={verification}
        verifying={verifying}
        onVerify={(keepAgreements) => {
          void handleVerify(keepAgreements);
        }}
        onLaunch={() => {
          if (infoProfileId) void handleLaunch(infoProfileId);
        }}
        onEdit={() => {
          if (inspection) {
            setEditingProfile(inspection.profile);
            setCreateOpen(true);
          }
        }}
        onDelete={() => {
          const profile = profiles.find((candidate) => candidate.id === infoProfileId);
          if (profile) setDeleteTarget(profile);
        }}
        onExport={() => {
          handleExportRequest();
        }}
        onOverrideChange={(property, value) => {
          void handleOverrideChange(property, value);
        }}
        onOverrideRemove={(property) => {
          void handleOverrideRemove(property);
        }}
      />

      <ProfileExportDialog
        target={exportTarget}
        onOpenChange={(open) => {
          if (!open) setExportTarget(null);
        }}
        onExported={() => {
          void refreshProfiles();
        }}
      />

      <TrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onChanged={() => {
          void refreshProfiles();
        }}
      />

      <DeleteConfirmationDialog
        open={deleteTarget !== null || bulkTrashIds !== null}
        profileName={bulkTrashIds !== null ? t("common.selectedProfiles", { count: bulkTrashIds.length }) : (deleteTarget?.name ?? "")}
        busy={deleteBusy}
        onConfirm={() => {
          if (bulkTrashIds !== null) {
            void handleBulkTrash();
          } else {
            void handleDelete();
          }
        }}
        onCancel={() => {
          setDeleteTarget(null);
          setBulkTrashIds(null);
        }}
      />

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        versionLine={versionLine}
      />
    </div>
  );
}
