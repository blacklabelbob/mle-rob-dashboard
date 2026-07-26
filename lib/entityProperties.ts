/**
 * Q65 — custom fields as data, not migrations.
 *
 * The typed accessor over `entity_properties` / `property_definitions` /
 * `property_options` (supabase/migrations/0015_entity_properties.sql). Design ported —
 * not code-copied — from the 2026-07-25 Macro teardown, 02-crm.md §9.1 A2/A3/A5.
 *
 * Pure and stateless per CR-3: no network, no Date.now(). Every guarantee below is also
 * enforced by the migration's `check_values_structure`; this module exists so a caller
 * finds out at the type/validate layer instead of at a 400 from PostgREST, and so
 * reading a value is one typed call rather than an ad-hoc JSONB cast at each call site.
 */

/** The closed set of field types. Mirrors the data_type CHECK in 0015. */
export const PROPERTY_DATA_TYPES = [
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
  "SELECT_STRING",
  "TAG",
  "ENTITY",
] as const;
export type PropertyDataType = (typeof PROPERTY_DATA_TYPES)[number];

/**
 * The closed set of things a property can attach to. Mirrors the entity_type CHECK in
 * 0015. Closed on purpose (teardown §9.2 B4): the moment Q67's filter AST compiles a
 * property filter, this string reaches dynamic SQL, and a closed enum is the defense
 * that has to exist *before* that, not after.
 */
export const PROPERTY_ENTITY_TYPES = [
  "person",
  "org",
  "deal",
  "activity",
  "task",
  "document",
  "invoice",
] as const;
export type PropertyEntityType = (typeof PROPERTY_ENTITY_TYPES)[number];

export type EntityRef = { entity_type: PropertyEntityType; entity_id: string };

/** The tagged union stored in entity_properties.values. Always an array of items. */
export type PropertyValue =
  | { kind: "TEXT"; items: string[] }
  | { kind: "SELECT_STRING"; items: string[] }
  | { kind: "TAG"; items: string[] }
  | { kind: "DATE"; items: string[] }
  | { kind: "NUMBER"; items: number[] }
  | { kind: "BOOLEAN"; items: boolean[] }
  | { kind: "ENTITY"; items: EntityRef[] };

export type PropertyDefinition = {
  id: string;
  display_name: string;
  data_type: PropertyDataType;
  specific_entity_type: PropertyEntityType | null;
  is_multi_select: boolean;
  is_system: boolean;
};

/**
 * §9.1 A3 — deterministic system-property UUIDs.
 *
 * Seed SQL and TS agree on an id without a lookup table, so a system field can be
 * referenced by a constant at both ends. Base 00000001-0000-0000-0000-0000000000xx with
 * a hex suffix, exactly the scheme the teardown documents.
 *
 * Suffixes are APPEND-ONLY and must never be reused: a recycled suffix silently
 * re-points every stored value row at a different field.
 */
export const SYSTEM_PROPERTY_UUID_BASE = "00000001-0000-0000-0000-0000000000";

export function systemPropertyId(suffix: number): string {
  if (!Number.isInteger(suffix) || suffix < 1 || suffix > 0xff) {
    throw new Error(`system property suffix out of range (1..255): ${suffix}`);
  }
  return SYSTEM_PROPERTY_UUID_BASE + suffix.toString(16).padStart(2, "0");
}

/**
 * Option ids get their own deterministic base so a definition suffix and an option
 * suffix can never collide. Same append-only rule: a recycled suffix re-labels a stored
 * choice.
 */
export const SYSTEM_OPTION_UUID_BASE = "00000002-0000-0000-0000-0000000000";

export function systemOptionId(suffix: number): string {
  if (!Number.isInteger(suffix) || suffix < 1 || suffix > 0xff) {
    throw new Error(`system option suffix out of range (1..255): ${suffix}`);
  }
  return SYSTEM_OPTION_UUID_BASE + suffix.toString(16).padStart(2, "0");
}

/**
 * The first real field on the spine (0016) — `status` on people AND orgs.
 *
 * The COLUMN remains the source of truth; the spine row is a trigger-maintained
 * projection. Nothing renders from here yet, so no UI can accidentally read a stale
 * copy — and once something does, the trigger is what makes it safe.
 */
export const NETWORK_STATUS_PROPERTY_ID = systemPropertyId(1);
export const NETWORK_STATUS_OPTIONS = ["lit", "warm", "unlit"] as const;

/** ISO date, date-only. Custom fields store a day, not an instant. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isEntityRef(v: unknown): v is EntityRef {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.entity_id === "string" &&
    r.entity_id.trim().length > 0 &&
    typeof r.entity_type === "string" &&
    (PROPERTY_ENTITY_TYPES as readonly string[]).includes(r.entity_type)
  );
}

export function isPropertyEntityType(v: unknown): v is PropertyEntityType {
  return typeof v === "string" && (PROPERTY_ENTITY_TYPES as readonly string[]).includes(v);
}

export function isPropertyDataType(v: unknown): v is PropertyDataType {
  return typeof v === "string" && (PROPERTY_DATA_TYPES as readonly string[]).includes(v);
}

/**
 * Parse a raw `values` JSONB into a typed PropertyValue.
 *
 * Returns null rather than throwing on anything malformed — a single bad row must not
 * blank a whole record page. Callers render "unavailable" for null; they never guess a
 * value, which is the same rule the invoice ledger follows for unreadable amounts.
 */
export function parsePropertyValue(raw: unknown): PropertyValue | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  const items = obj.items;
  if (!isPropertyDataType(kind) || !Array.isArray(items)) return null;

  switch (kind) {
    case "TEXT":
    case "SELECT_STRING":
    case "TAG":
      return items.every((i) => typeof i === "string")
        ? { kind, items: items as string[] }
        : null;
    case "DATE":
      return items.every((i) => typeof i === "string" && ISO_DATE.test(i))
        ? { kind, items: items as string[] }
        : null;
    case "NUMBER":
      return items.every((i) => typeof i === "number" && Number.isFinite(i))
        ? { kind, items: items as number[] }
        : null;
    case "BOOLEAN":
      return items.every((i) => typeof i === "boolean")
        ? { kind, items: items as boolean[] }
        : null;
    case "ENTITY":
      return items.every(isEntityRef) ? { kind, items: items as EntityRef[] } : null;
  }
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a value against its definition BEFORE it is written.
 *
 * The database CHECK guarantees shape (is this really a NUMBER array?). Only this layer
 * knows the definition, so only this layer can catch the three failures that matter to
 * an operator: wrong type for the field, more than one item on a single-select, and a
 * choice that is not in the option list.
 */
export function validatePropertyValue(
  def: PropertyDefinition,
  value: PropertyValue,
  allowedOptions?: readonly string[],
): ValidationResult {
  if (value.kind !== def.data_type) {
    return { ok: false, error: `expected ${def.data_type} value, got ${value.kind}` };
  }
  if (!def.is_multi_select && value.items.length > 1) {
    return {
      ok: false,
      error: `"${def.display_name}" is single-select but received ${value.items.length} values`,
    };
  }
  if ((value.kind === "SELECT_STRING" || value.kind === "TAG") && allowedOptions) {
    const stray = value.items.find((i) => !allowedOptions.includes(i));
    if (stray !== undefined) {
      return { ok: false, error: `"${stray}" is not an option on "${def.display_name}"` };
    }
  }
  if (value.kind === "ENTITY" && def.specific_entity_type) {
    const wrong = value.items.find((i) => i.entity_type !== def.specific_entity_type);
    if (wrong) {
      return {
        ok: false,
        error: `"${def.display_name}" links to ${def.specific_entity_type}, got ${wrong.entity_type}`,
      };
    }
  }
  return { ok: true };
}

/**
 * Can this definition attach to this entity kind?
 * A null specific_entity_type means "any" — except for ENTITY, which the migration
 * refuses to store without a target kind.
 */
export function definitionAppliesTo(
  def: PropertyDefinition,
  entityType: PropertyEntityType,
): boolean {
  if (def.data_type === "ENTITY") return true; // target kind constrains the VALUE, not the host
  return def.specific_entity_type === null || def.specific_entity_type === entityType;
}

/** Human-readable rendering of a value. Empty items render as "" — never "null". */
export function formatPropertyValue(value: PropertyValue): string {
  switch (value.kind) {
    case "BOOLEAN":
      return value.items.map((b) => (b ? "Yes" : "No")).join(", ");
    case "NUMBER":
      return value.items.map((n) => String(n)).join(", ");
    case "ENTITY":
      return value.items.map((e) => `${e.entity_type}:${e.entity_id}`).join(", ");
    default:
      return value.items.join(", ");
  }
}

/**
 * The containment predicate a Q67 property filter compiles to, expressed as the JSONB
 * literal PostgREST/SQL would match with `values @> ...`. Kept here so the GIN index's
 * one supported query shape has exactly one producer.
 */
export function containmentFilter(value: PropertyValue): { kind: string; items: unknown[] } {
  return { kind: value.kind, items: value.items };
}
