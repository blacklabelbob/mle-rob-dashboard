import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAIL_READ_SCOPES,
  MAIL_SCAN_EXTENSIONS,
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
      if (entry === "__tests__" || /\.test\.(ts|tsx|mjs|js)$/.test(entry)) continue;
      if (statSync(join(REPO_ROOT, rel)).isDirectory()) walk(rel);
      else if (MAIL_SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
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

  it("reads real files under EVERY declared root, not just the first", () => {
    // The failure this exists for is silent: `scripts/` is almost all `.mjs`, so
    // widening MAIL_SCAN_ROOTS without widening the extensions would leave the
    // suite green while covering zero script files. A root that contributes
    // nothing is a coverage claim the scan does not honour.
    for (const root of MAIL_SCAN_ROOTS) {
      const underRoot = TREE.filter((f) => f.path.startsWith(`${root}/`));
      expect(underRoot.length, `${root} contributed no files to the scan`).toBeGreaterThan(5);
    }
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

    // Second real case, found while widening the scan: the e-sign sender's
    // header comment says the link goes out "(Gmail, rob@aivoicetech.io)". It
    // sends; it has never read an inbox. Two independent files now depend on
    // comment-stripping, so the behaviour is load-bearing rather than incidental.
    const esign = TREE.find((f) => f.path === "app/api/esign/send/route.ts");
    expect(esign).toBeDefined();
    expect(esign!.source).toMatch(/Gmail/);
    expect(mailReadMarkers(esign!.source)).toEqual([]);
  });

  it("the marker set survives scripts/ vocabulary — no reader declared there", () => {
    // The deliberate pass this widening required: several scripts talk about a
    // "mailbox" (privacy manifest, PII guards, synthetic seed) without ever
    // opening one. `mailbox` alone is NOT a marker — only the registry symbols
    // are — which is why adding 29 script files added zero breaches. If a future
    // script genuinely connects to a mailbox, it fails as `undeclared-reader`
    // until MAIL_READ_SCOPES names it.
    const vocabulary = TREE.filter(
      (f) => f.path.startsWith("scripts/") && /mailbox/i.test(f.source)
    );
    expect(vocabulary.length, "expected scripts using mailbox vocabulary").toBeGreaterThan(0);
    for (const file of vocabulary) {
      expect(mailReadMarkers(file.source), file.path).toEqual([]);
    }
    expect(MAIL_READ_SCOPES.flatMap((s) => s.modules).filter((m) => m.startsWith("scripts/"))).toEqual(
      []
    );
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

  it("goes red when a local script harvests a mailbox", () => {
    // The reason `scripts/` is now scanned: this is the cheapest possible way to
    // do the thing Rob asked about — no route, no deploy, no secret header — and
    // until this increment it was the one place the guard could not see.
    const smuggled: MailFile = {
      path: "scripts/pull-inbox.mjs",
      source: "const box = await imap.connect({ user: process.env.MAIL_USER });",
    };
    expect(mailScopeBreaches([...TREE, smuggled])).toEqual([
      {
        kind: "undeclared-reader",
        subject: "scripts/pull-inbox.mjs",
        detail: "reads mail (imap) but no scope in MAIL_READ_SCOPES claims it",
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
