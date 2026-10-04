import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AgentPage } from "@/pages/agent";
import { ExtensionsPage } from "@/pages/extensions";
import { NetworkPage } from "@/pages/network";
import { ProfilesPage } from "@/pages/profiles";
import { SettingsPage } from "@/pages/settings";

type PlaceholderKey = Exclude<
  AppPage,
  "profiles" | "proxies" | "settings" | "about" | "extensions" | "agent"
>;

const PLACEHOLDERS: Record<
  PlaceholderKey,
  { title: string; description: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  integrations: {
    title: "Integrations",
    description:
      "Connect external tools to profiles, groups and session data through a local API.",
    Icon: LuPlug,
  },
  account: {
    title: "Account",
    description:
      "Licence, sync and team membership. Everything on this machine stays local without an account.",
    Icon: LuCloud,
  },
  shortcuts: {
    title: "Keyboard shortcuts",
    description:
      "Every shortcut the application binds, in one list.",
    Icon: LuKeyboard,
  },
};

const PAGE_TITLE: Partial<Record<AppPage, string>> = {
  proxies: "Network",
  extensions: "Extensions",
  agent: "Agent",
  integrations: "Integrations",
  account: "Account",
  shortcuts: "Shortcuts",
  settings: "Settings",
};

interface DownloadState {
  phase: string;
  percent: number;
}

const ENGINE_TOAST_ID = "engine-download";
const CORE_TOAST_ID = "core-download";

export function App() {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [versionLine, setVersionLine] = useState("");
  const [download, setDownload] = useState<DownloadState | null>(null);

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);

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
          `${result.unreadable.length} profile${result.unreadable.length === 1 ? "" : "s"} could not be read`,
        );
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setProfilesLoading(false);
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

  const ensureEngine = useCallback((): void => {
    void invoke<string>("ensure_engine")
      .then(() => {
        if (downloadToastOpen.current) {
          downloadToastOpen.current = false;
          setDownload(null);
          toast.success("Engine ready", { id: ENGINE_TOAST_ID, duration: 5000 });
        }
      })
      .catch((error) => {
        setDownload(null);
        const message = String(error);
        const retry = { label: "Retry", onClick: () => ensureEngine() };
        if (downloadToastOpen.current) {
          downloadToastOpen.current = false;
          toast.error(message, { id: ENGINE_TOAST_ID, duration: Infinity, action: retry });
        } else {
          toast.error(message, { action: retry });
        }
      });
  }, []);

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
    async (spec: CreateSpec) => {
      try {
        if (editingProfile) {
          await invoke<CreateResult>("update_profile", {
            id: editingProfile.id,
            spec,
          });
          await refreshProfiles();
          setCreateOpen(false);
          setEditingProfile(null);
          toast.success(`Saved "${spec.name}"`);
          if (infoProfileId) {
            const [nextInspection, nextReport] = await loadInfo(infoProfileId);
            setInspection(nextInspection);
            setReport(nextReport);
          }
          return;
        }
        const result = await invoke<CreateResult>("create_profile", { spec });
        await refreshProfiles();
        setCreateOpen(false);
        toast.success(`Created "${result.summary.name}"`);
        setInfoProfileId(result.summary.id);
      } catch (error) {
        toast.error(String(error));
        throw error;
      }
    },
    [editingProfile, infoProfileId, loadInfo, refreshProfiles],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await invoke("trash_profile", { id: deleteTarget.id });
      if (infoProfileId === deleteTarget.id) setInfoProfileId(null);
      await refreshProfiles();
      setDeleteTarget(null);
      toast.success(`Moved "${deleteTarget.name}" to the trash`, {
        description: "Restore it from the trash while its browser data still exists.",
      });
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, infoProfileId, refreshProfiles]);

  const handleBulkSetGroup = useCallback(
    async (ids: string[], group: string) => {
      try {
        const result = await invoke<{
          updated: string[];
          failed: { id: string; error: string }[];
        }>("bulk_set_group", { ids, group });
        await refreshProfiles();
        if (result.failed.length > 0) {
          toast.error(`${result.failed.length} of ${ids.length} could not be filed`, {
            description: result.failed.map((f) => `${f.id}: ${f.error}`).join("\n"),
          });
        } else if (group) {
          toast.success(`Filed ${result.updated.length} under "${group}"`);
        } else {
          toast.success(`Removed ${result.updated.length} from groups`);
        }
      } catch (error) {
        toast.error(String(error));
      }
    },
    [refreshProfiles],
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
        toast.error(`${result.failed.length} of ${bulkTrashIds.length} could not be trashed`, {
          description: result.failed.map((f) => `${f.id}: ${f.error}`).join("\n"),
        });
      } else {
        toast.success(`Moved ${result.trashed.length} profiles to the trash`, {
          description: "Restore them from the trash while their browser data still exists.",
        });
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleteBusy(false);
    }
  }, [bulkTrashIds, refreshProfiles]);

  const handleLaunch = useCallback(async (id: string) => {
    setLaunchingId(id);
    try {
      const launched = await invoke<Launched>("launch_profile", { id });
      const pid = typeof launched.pid === "number" ? ` (pid ${launched.pid})` : "";
      toast.success(`Browser launched${pid}`);
      if (launched.geo_gate && launched.geo_gate.verdict === "unknown") {
        toast.warning(
          `Proxy exit country is not verified (profile claims ${launched.geo_gate.expected}) — run a proxy check before relying on it`,
        );
      } else if (launched.geo_gate && launched.geo_gate.verdict === "mismatch") {
        toast.warning(
          `Geo-gate warning: proxy exits in ${launched.geo_gate.observed}, but profile claims ${launched.geo_gate.expected}. Proceed with caution!`,
        );
      }
      if (launched.discarded.length > 0) {
        toast.info(`${launched.discarded.length} conflicting value(s) were discarded`);
      }
      // Plan warnings do not block the launch, but they name things the user
      // would otherwise only find out by testing the browser themselves — a
      // missing engine, an addon the engine will skip, a WebGL renderer whose
      // limits will come from the host and contradict it.
      for (const warning of launched.plan.warnings) {
        toast.warning(warning, { duration: 12000 });
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLaunchingId(null);
    }
  }, []);

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
          toast.success(`Verified: ${result.agreed} of ${result.checked} values agreed`);
        } else {
          toast.warning(
            `Verification found ${mismatches.length} difference${
              mismatches.length === 1 ? "" : "s"
            } — see the Verify tab`,
          );
        }
      } catch (error) {
        toast.error(String(error));
      } finally {
        setVerifying(false);
      }
    },
    [infoProfileId],
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
        toast.success(`Updated ${property}${result.coerced ? " (coerced)" : ""}`);
      } catch (error) {
        toast.error(String(error));
      }
    },
    [infoProfileId, refreshProfiles],
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
        toast.success(`Reset ${property}`);
      } catch (error) {
        toast.error(String(error));
      }
    },
    [infoProfileId, refreshProfiles],
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
      toast.success(`Imported ${result.name}`);
    } catch (error) {
      toast.error(String(error));
    }
  }, [refreshProfiles]);

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
          {fatal ? `Error: ${fatal}` : "Starting engine…"}
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

  const placeholder = PLACEHOLDERS[page as PlaceholderKey] ?? null;

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
          pageTitle={page === "profiles" ? undefined : (PAGE_TITLE[page] ?? page)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {page === "profiles" ? (
            <ProfilesPage
              profiles={filteredProfiles}
              totalCount={profiles.length}
              isLoading={profilesLoading}
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
        profileName={bulkTrashIds !== null ? `${bulkTrashIds.length} selected profiles` : (deleteTarget?.name ?? "")}
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
