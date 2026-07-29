import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAIL_READ_SCOPES,
  MAIL_SCAN_ROOTS,
  mailReadMarkers,
  mailScopeBreaches,
  type MailFile,
} from "@/lib/comms/mailReadScope";

const REPO_ROOT = join(__dirname, "..", "..");

function collect(root: string): MailFile[] {
  const out: MailFile[] = [];
  const walk = (relDir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, relDir))) {
      const rel = `${relDir}/${entry}`;
      if (entry === "__tests__" || entry.endsWith(".test.ts")) continue;
      if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry)) {
        out.push({ path: rel, source: readFileSync(join(REPO_ROOT, rel), "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

const TREE = MAIL_SCAN_ROOTS.flatMap(collect);

describe("mail read scope (Q76)", () => {
  it("scans a real tree — a guard over zero files proves nothing", () => {
    expect(TREE.length).toBeGreaterThan(50);
  });

  it("every mail-reading automation under the scanned roots is declared", () => {
    expect(mailScopeBreaches(TREE)).toEqual([]);
  });

  it("the declared reader is actually a reader on disk", () => {
    // Guards against the opposite rot: a scope kept alive after the module it
    // claims stopped touching mail, quietly widening what looks permitted.
    for (const scope of MAIL_READ_SCOPES) {
      for (const mod of scope.modules) {
        const file = TREE.find((f) => f.path === mod);
        expect(file, `${mod} not found under scanned roots`).toBeDefined();
        expect(mailReadMarkers(file!.source).length).toBeGreaterThan(0);
      }
    }
  });

  it("does not implicate a module whose only mail mention is a comment", () => {
    // Real case: the n8n ERROR webhook explains it reuses "the Gmail-capture
    // contract" in a comment. It handles workflow failures, never messages.
    const errorRoute = TREE.find((f) => f.path === "app/api/webhooks/n8n-error/route.ts");
    expect(errorRoute).toBeDefined();
    expect(mailReadMarkers(errorRoute!.source)).toEqual([]);
  });

  // --- the failure paths, driven rather than argued -------------------------

  const declared = MAIL_READ_SCOPES[0];

  it("goes red when an undeclared automation reads a mailbox", () => {
    const smuggled: MailFile = {
      path: "app/api/cron/harvest/route.ts",
      source: "const msgs = await gmail.users.messages.list({ userId: 'me' });",
    };
    const breaches = mailScopeBreaches([...TREE, smuggled]);
    expect(breaches).toEqual([
      {
        kind: "undeclared-reader",
        subject: "app/api/cron/harvest/route.ts",
        detail: "reads mail (gmail) but no scope in MAIL_READ_SCOPES claims it",
      },
    ]);
  });

  it("goes red when a claimed module has been renamed away", () => {
    const scopes = [{ ...declared, modules: ["app/api/webhooks/gone/route.ts"] }];
    const kinds = mailScopeBreaches(TREE, scopes).map((b) => b.kind);
    expect(kinds).toContain("phantom-module");
    // ...and the now-unclaimed real reader is caught too, not masked by it.
    expect(kinds).toContain("undeclared-reader");
  });

  it("goes red when a scope names a mailbox nobody connected", () => {
    const scopes = [{ ...declared, mailbox: "mbx-someone-elses-inbox" }];
    expect(mailScopeBreaches(TREE, scopes)).toContainEqual({
      kind: "unregistered-mailbox",
      subject: declared.sourceId,
      detail: 'reads mailbox "mbx-someone-elses-inbox", which is not a connected mailbox',
    });
  });

  it("goes red when a source cannot be revoked or cannot be audited", () => {
    const kinds = mailScopeBreaches(TREE, [
      { ...declared, credentialEnv: "", auditActivitySource: "  " },
    ]).map((b) => b.kind);
    expect(kinds).toContain("no-credential");
    expect(kinds).toContain("no-audit-trail");
  });

  it("goes red when two sources claim the same module", () => {
    const scopes = [declared, { ...declared, sourceId: "second-source" }];
    expect(mailScopeBreaches(TREE, scopes).map((b) => b.kind)).toContain("duplicate-claim");
  });
});
