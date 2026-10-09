import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuLoaderCircle, LuPencil, LuPlus, LuTrash2, LuUsers } from "react-icons/lu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { GroupInfo } from "@/lib/groups";

interface GroupsPageProps {
  /** Every group with its member count, by name. */
  groups: GroupInfo[];
  /** Whether the first load is still running, so an empty list is not yet "no groups". */
  isLoading: boolean;
  /** Creates a group; resolves `false` when the backend refused the name. */
  onCreate: (name: string) => Promise<boolean>;
  /** Renames a group and its members; `false` means nothing changed. */
  onRename: (from: string, to: string) => Promise<boolean>;
  /** Deletes a group, keeping its profiles; `false` means it still exists. */
  onDelete: (name: string) => Promise<boolean>;
}

export function GroupsPage({ groups, isLoading, onCreate, onRename, onDelete }: GroupsPageProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  // The row being renamed, by the name it has now: a rename that is refused
  // stays in edit mode with the typed name, so the refusal is not also a
  // silently discarded edit.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleting, setDeleting] = useState<GroupInfo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // The draft survives a refusal: the backend's reason is toasted, and
      // the typed name is what the user will fix rather than retype.
      if (await onCreate(name)) setDraft("");
    } finally {
      setCreating(false);
    }
  };

  const startRename = (group: GroupInfo) => {
    setRenaming(group.name);
    setRenameDraft(group.name);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const to = renameDraft.trim();
    if (!to) return;
    // Saving an unchanged field is a save of nothing; leave edit mode.
    if (to === renaming) {
      setRenaming(null);
      return;
    }
    if (await onRename(renaming, to)) setRenaming(null);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameDraft("");
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      // A refusal keeps the dialog open — the group is still there, and the
      // toast carries the reason.
      if (await onDelete(deleting.name)) setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const showList = groups.length > 0;
  const showEmpty = !isLoading && !showList;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <p className="px-3 pt-3 text-xs text-muted-foreground">{t("common.groupDescription")}</p>

      <form onSubmit={create} className="mt-3 flex flex-wrap items-center gap-2 px-3">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder={t("common.groupNewPlaceholder")}
          aria-label={t("common.groupNewPlaceholder")}
          className="h-8 w-64"
        />
        <Button type="submit" size="sm" className="h-8" disabled={!draft.trim() || creating}>
          {creating ? (
            <LuLoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <LuPlus className="size-3.5" />
          )}
          {t("common.createGroup")}
        </Button>
      </form>

      {showList && (
        <ul className="mt-3 flex flex-col gap-1.5 px-3 pb-3">
          {groups.map((group) => (
            <li
              key={group.name}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              {renaming === group.name ? (
                <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => {
                    setRenameDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitRename();
                    } else if (event.key === "Escape") {
                      // Stop the input from acting on anything after it.
                      event.preventDefault();
                      event.stopPropagation();
                      cancelRename();
                    }
                  }}
                  aria-label={t("common.renameGroup")}
                  className="h-7 w-64"
                />
              ) : (
                <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
              )}
              <span
                className="text-[11px] text-muted-foreground tabular-nums"
                title={t("common.groupMemberCount", { count: group.count })}
              >
                {t("common.groupMemberCount", { count: group.count })}
              </span>
              <span className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => startRename(group)}
              >
                <LuPencil className="size-3.5" />
                {t("common.renameGroup")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setDeleting(group)}
              >
                <LuTrash2 className="size-3.5" />
                {t("common.deleteGroup")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
          <LuUsers className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("common.noGroups")}</p>
          <p className="text-xs text-muted-foreground/80">{t("common.noGroupsHint")}</p>
        </div>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("common.deleteGroupTitle")}</DialogTitle>
            <DialogDescription>
              {t("common.deleteGroupDescription", { name: deleting?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>

          {deleting && deleting.count > 0 && (
            <Alert>
              <LuUsers className="size-4" />
              <AlertTitle>{t("common.deleteGroupAlertTitle")}</AlertTitle>
              <AlertDescription>
                {t("common.deleteGroupAlertDescription", { count: deleting.count })}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? (
                <LuLoaderCircle className="size-3.5 animate-spin" />
              ) : (
                t("common.deleteGroup")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
