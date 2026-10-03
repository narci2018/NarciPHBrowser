import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Inspection, PropertySchema as WireSchema } from "@narc/sdk";
import { LuRefreshCw, LuSearch } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// The schema is vendored into the engine binary, so it cannot change while the
// app is running; one fetch per process is enough.
let cachedSchema: WireSchema | null = null;

const loadSchema = async (): Promise<WireSchema> => {
  if (!cachedSchema) {
    cachedSchema = await invoke<WireSchema>("property_schema");
  }
  return cachedSchema;
};

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

/** The text an editor starts from for one property, shaped for its type. */
const textOf = (kind: string, value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (kind === "array") {
    return Array.isArray(value) ? value.map(String).join("\n") : JSON.stringify(value);
  }
  if (kind === "dict") {
    return JSON.stringify(value, null, 2);
  }
  if (kind === "bool") {
    return value ? "true" : "false";
  }
  return String(value);
};

type Parsed = { ok: true; value: unknown } | { ok: false; need: string };

/**
 * Parses a draft the way the sidecar will, so a value the engine would drop
 * never leaves this tab. `bool` and `dict` aside, an empty draft stays valid:
 * it means "no change", and the Save button only arms on a difference.
 */
const parseDraft = (kind: string, raw: string): Parsed => {
  switch (kind) {
    case "bool": {
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return { ok: false, need: "true or false" };
    }
    case "uint": {
      if (raw.trim() === "") return { ok: true, value: undefined };
      const n = Number(raw.trim());
      if (!Number.isInteger(n) || n < 0) return { ok: false, need: "a whole number ≥ 0" };
      return { ok: true, value: n };
    }
    case "int": {
      if (raw.trim() === "") return { ok: true, value: undefined };
      const n = Number(raw.trim());
      if (!Number.isInteger(n)) return { ok: false, need: "a whole number" };
      return { ok: true, value: n };
    }
    case "double": {
      if (raw.trim() === "") return { ok: true, value: undefined };
      const n = Number(raw.trim());
      if (!Number.isFinite(n)) return { ok: false, need: "a number" };
      return { ok: true, value: n };
    }
    case "array": {
      if (raw.trim() === "") return { ok: true, value: undefined };
      return {
        ok: true,
        value: raw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      };
    }
    case "dict": {
      if (raw.trim() === "") return { ok: true, value: undefined };
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { ok: true, value: parsed };
        }
      } catch {
        // falls through
      }
      return { ok: false, need: "a JSON object" };
    }
    default:
      return { ok: true, value: raw };
  }
};

/**
 * Notes for the properties the generator deliberately never draws, matched by
 * a separator-free lowercase form so the wording of a schema key cannot stop
 * its note from rendering. Every one of them is a behaviour switch or a
 * caller-supplied path, not part of the machine's identity.
 */
const NEVER_DRAWN_NOTES: Record<string, string> = {
  addons:
    "Extension paths come from the profile's own addon list — manage them on the Extensions page, not here.",
  certificates: "Root certificate bundles this profile will trust. Caller-supplied files, not identity.",
  certificatepaths: "Root certificate directories this profile will trust. Caller-supplied files, not identity.",
  debug: "Engine debug logging, for development.",
  disabletheming: "Drops the engine's OS-matching browser chrome, so the window stops looking native.",
  instantanimations: "Completes CSS animations at once, which upstream documents as observable.",
  allowmainworld: "Lets an extension reach the page's own execution context, widening what an addon can do.",
  allowaddonnewtab: "Lets extensions observe new-tab pages, widening what an addon can do.",
  disableworldisolation:
    "Reaches past the page's own execution context — a capability a site can detect, and not one ordinary browsing hands out.",
  forcescopeaccess:
    "Reaches past the page's own execution context — a capability a site can detect, and not one ordinary browsing hands out.",
  humanizemintime: "A floor on how long one humanized cursor move may take; the engine default is zero.",
};

const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, "");

/** Group order the editor shows before alphabetical, with the rest after. */
const GROUP_ORDER = [
  "navigator",
  "screen",
  "window",
  "webgl",
  "webgl2",
  "mediadevices",
  "voices",
  "fonts",
  "locale",
  "headers",
  "webrtc",
];

const groupOf = (property: string): string => {
  const cut = property.search(/[.:]/);
  return cut === -1 ? "other" : property.slice(0, cut);
};

const groupLabel = (group: string): string =>
  group === "other" ? "Engine options" : group.charAt(0).toUpperCase() + group.slice(1);

const groupRank = (group: string): number => {
  const index = GROUP_ORDER.indexOf(normalize(group));
  return index === -1 ? GROUP_ORDER.length : index;
};

interface IdentityFieldsTabProps {
  inspection: Inspection;
  onOverrideChange: (property: string, value: unknown) => void;
  onOverrideRemove: (property: string) => void;
}

/** One property row: claimed value, drawn value, and a typed editor. */
function FieldRow({
  property,
  kind,
  neverDrawn,
  inspection,
  draft,
  onDraft,
  onSave,
  onRemove,
}: {
  property: string;
  kind: string;
  neverDrawn: boolean;
  inspection: Inspection;
  draft: string | undefined;
  onDraft: (property: string, raw: string) => void;
  onSave: (property: string, value: unknown) => void;
  onRemove: (property: string) => void;
}) {
  const effective = inspection.effective[property];
  const drawn = inspection.drawn[property];
  const overridden = inspection.override_diff.some(
    (diff) => diff.property === property && diff.overridden,
  );

  const baseline = textOf(kind, effective);
  const raw = draft ?? baseline;
  const dirty = raw !== baseline;
  const parsed = dirty ? parseDraft(kind, raw) : null;
  const changed =
    parsed?.ok === true &&
    JSON.stringify(parsed.value) !== JSON.stringify(effective) &&
    parsed.value !== undefined;

  const note = neverDrawn ? NEVER_DRAWN_NOTES[normalize(property)] : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2",
        overridden && "border-primary/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs font-medium break-all text-foreground">{property}</code>
        <Badge variant="outline" className="text-[10px]">
          {kind}
        </Badge>
        {neverDrawn && (
          <Badge variant="secondary" className="text-[10px]">
            engine opt-in
          </Badge>
        )}
        {overridden && (
          <Badge variant="secondary" className="text-[10px]">
            Edited
          </Badge>
        )}
      </div>

      {(overridden || (drawn !== undefined && drawn !== effective)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Drawn</span>
          <code className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {formatValue(drawn)}
          </code>
        </div>
      )}

      <div className="flex items-start gap-2">
        {kind === "bool" ? (
          <Select value={raw === "" ? undefined : raw} onValueChange={(next) => onDraft(property, next)}>
            <SelectTrigger size="sm" className="h-7 w-32 font-mono text-xs">
              <SelectValue placeholder={baseline === "" ? "not set" : baseline} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        ) : kind === "array" || kind === "dict" ? (
          <Textarea
            value={raw}
            aria-label={`Value for ${property}`}
            spellCheck={false}
            className={cn(
              "min-h-16 flex-1 resize-y font-mono text-xs",
              kind === "array" && "min-h-20",
            )}
            placeholder={baseline === "" ? "not set" : undefined}
            onChange={(event) => onDraft(property, event.target.value)}
          />
        ) : (
          <Input
            value={raw}
            aria-label={`Value for ${property}`}
            spellCheck={false}
            inputMode={kind === "uint" || kind === "int" || kind === "double" ? "numeric" : undefined}
            className="h-7 flex-1 font-mono text-xs"
            placeholder={baseline === "" ? "not set" : undefined}
            onChange={(event) => onDraft(property, event.target.value)}
          />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {overridden && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                onDraft(property, "");
                onRemove(property);
              }}
            >
              <LuRefreshCw className="size-3" />
              Reset
            </Button>
          )}
          {dirty && parsed?.ok === true && changed && (
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onSave(property, parsed.value)}>
              Save
            </Button>
          )}
        </div>
      </div>

      {parsed && !parsed.ok && (
        <p className="text-[11px] text-destructive-text">
          This property wants {parsed.need}.
        </p>
      )}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

/**
 * Every property the engine understands, with a typed editor per field.
 *
 * The Overrides tab shows only what is already pinned; this one is the full
 * schema, so a field can be pinned in the first place. Values are parsed the
 * way the sidecar will parse them before anything is sent, and the sidecar
 * re-validates on arrival — this UI narrows what it can send, it does not
 * become the authority.
 */
export function IdentityFieldsTab({
  inspection,
  onOverrideChange,
  onOverrideRemove,
}: IdentityFieldsTabProps) {
  const [schema, setSchema] = useState<WireSchema | null>(cachedSchema);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cachedSchema) {
      loadSchema()
        .then(setSchema)
        .catch((error) => {
          console.error("property_schema failed", error);
        });
    }
  }, []);

  const groups = useMemo(() => {
    if (!schema) return [];
    const search = query.trim().toLowerCase();
    const collected = new Map<string, string[]>();
    for (const property of Object.keys(schema.properties)) {
      if (search) {
        const effective = formatValue(inspection.effective[property]).toLowerCase();
        if (!property.toLowerCase().includes(search) && !effective.includes(search)) {
          continue;
        }
      }
      const group = groupOf(property);
      const list = collected.get(group);
      if (list) {
        list.push(property);
      } else {
        collected.set(group, [property]);
      }
    }
    return [...collected.entries()]
      .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
      .map(([group, properties]) => ({
        group,
        properties: properties.sort((a, b) => {
          const neverA = schema.never_drawn.includes(a) ? 1 : 0;
          const neverB = schema.never_drawn.includes(b) ? 1 : 0;
          return neverA - neverB || a.localeCompare(b);
        }),
      }));
  }, [schema, query, inspection]);

  if (!schema) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Loading the engine schema…
      </div>
    );
  }

  const onDraft = (property: string, raw: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (raw === "") {
        // "" is "no draft": the row falls back to its effective value. A user
        // who wants an empty string pins one through the field being a Str.
        delete next[property];
        return next;
      }
      next[property] = raw;
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-md text-xs text-muted-foreground">
          {Object.keys(schema.properties).length} properties the engine understands. A saved
          value becomes an override on the profile; Reset returns the field to what the seed
          draws.
        </p>
        <div className="relative w-56">
          <LuSearch className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name or value"
            className="h-8 pl-7 text-xs"
            aria-label="Filter properties"
          />
        </div>
      </div>

      {groups.map(({ group, properties }) => (
        <section key={group} className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {groupLabel(group)}
            <span className="ml-1.5 font-normal">{properties.length}</span>
          </h3>
          {properties.map((property) => (
            <FieldRow
              key={property}
              property={property}
              kind={schema.properties[property]}
              neverDrawn={schema.never_drawn.includes(property)}
              inspection={inspection}
              draft={drafts[property]}
              onDraft={onDraft}
              onSave={(prop, value) => {
                setDrafts((prev) => {
                  const next = { ...prev };
                  delete next[prop];
                  return next;
                });
                onOverrideChange(prop, value);
              }}
              onRemove={onOverrideRemove}
            />
          ))}
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No property matches “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
