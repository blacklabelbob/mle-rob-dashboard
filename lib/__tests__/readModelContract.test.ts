import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  READ_MODELS,
  SOURCE_COLUMNS,
  NEVER_EXPOSED,
  DASHBOARD_RO_ROLE,
  getReadModel,
  isCreatable,
  renderDataContractMarkdown,
} from "../readModel/contract";

const repo = join(__dirname, "../..");

describe("MC.8 read-model contract", () => {
  it("covers exactly the six read models the PRD names", () => {
    expect(READ_MODELS.map((m) => m.id).sort()).toEqual([
      "rm_action_items",
      "rm_delivery_phases",
      "rm_esign_status",
      "rm_invoices_ar",
      "rm_nudge_activity",
      "rm_pipeline",
    ]);
  });

  // The truth gate: a column nobody can point at a real table is a fabricated
  // contract, and MC.12 would build a panel on it before anyone noticed.
  it("every column resolves to a real table.column", () => {
    for (const model of READ_MODELS) {
      for (const col of model.columns) {
        const [table, column] = col.source.split(".");
        expect(
          SOURCE_COLUMNS[table],
          `${model.id}.${col.name} → unknown table "${table}"`,
        ).toBeDefined();
        expect(
          SOURCE_COLUMNS[table],
          `${model.id}.${col.name} → "${column}" not a column on ${table}`,
        ).toContain(column);
      }
    }
  });

  it("every column's table is declared in the model's sourceTables", () => {
    for (const model of READ_MODELS) {
      for (const col of model.columns) {
        const [table] = col.source.split(".");
        expect(model.sourceTables, `${model.id} reads ${table} undeclared`).toContain(table);
      }
    }
  });

  it("no read model exposes token material, signer forensics or file digests", () => {
    const exposed = READ_MODELS.flatMap((m) => m.columns.map((c) => c.source));
    for (const forbidden of NEVER_EXPOSED) {
      expect(exposed, `${forbidden} must never reach a read model`).not.toContain(forbidden);
    }
  });

  // Honesty pin — the same posture MC.2/MC.3 hold: a blocked model must be
  // empty AND name its unblocker, and a model claiming to be buildable must
  // actually have source tables. Neither direction can be fudged.
  it("blocked models are structurally empty and name their unblocker", () => {
    for (const model of READ_MODELS) {
      if (model.coverage === "blocked_no_source") {
        expect(model.columns, `${model.id} claims blocked but ships columns`).toHaveLength(0);
        expect(model.sourceTables).toHaveLength(0);
        expect(model.unblockedBy, `${model.id} blocked with no unblocker named`).toBeTruthy();
        expect(isCreatable(model)).toBe(false);
      } else {
        expect(model.columns.length, `${model.id} claims buildable with no columns`).toBeGreaterThan(0);
        expect(model.sourceTables.length).toBeGreaterThan(0);
        expect(isCreatable(model)).toBe(true);
      }
    }
  });

  it("the two known-blocked models are the AR and delivery-phase ones", () => {
    const blocked = READ_MODELS.filter((m) => m.coverage === "blocked_no_source").map((m) => m.id);
    expect(blocked.sort()).toEqual(["rm_delivery_phases", "rm_invoices_ar"]);
  });

  it("dashboard_ro grants no write of any kind", () => {
    for (const verb of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      expect(DASHBOARD_RO_ROLE.denies).toContain(verb);
    }
    expect(DASHBOARD_RO_ROLE.grants.join(" ")).not.toMatch(/insert|update|delete/i);
  });

  it("getReadModel throws on an unknown id rather than returning undefined", () => {
    expect(() => getReadModel("rm_nope" as never)).toThrow(/unknown read model/);
  });

  // Prose cannot drift from the registry: the committed doc IS this output.
  it("docs/data-contract.md matches the generator exactly", () => {
    const path = join(repo, "docs/data-contract.md");
    expect(existsSync(path), "docs/data-contract.md missing — run node scripts/gen-data-contract.mjs").toBe(true);
    expect(readFileSync(path, "utf8")).toBe(renderDataContractMarkdown());
  });
});
