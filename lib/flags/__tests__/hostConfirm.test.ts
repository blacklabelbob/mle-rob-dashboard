import { describe, it, expect } from "vitest";
import { hostConfirmPayload, readHostConfirm, buildHostConfirmPayload, readHostConfirmPayload, HOST_CONFIRM_KIND } from "../hostConfirm";

// Q84 inc.71 — the two live cases on Rob's ledger today (flag #133).
const CG = { host: "cgroofing.net", orgId: "C-2017" };
const GULF = { host: "gulfregroup.com", orgId: "C-2018" };

describe("hostConfirmPayload", () => {
  it("carries the host and the org for both live cases", () => {
    expect(hostConfirmPayload(CG.host, CG.orgId)).toEqual({ kind: HOST_CONFIRM_KIND, ...CG });
    expect(hostConfirmPayload(GULF.host, GULF.orgId)).toEqual({ kind: HOST_CONFIRM_KIND, ...GULF });
  });

  it("stores the host through the same extractHost as every other host comparison", () => {
    expect(hostConfirmPayload("https://www.cgroofing.net/contact", "C-2017")).toEqual({
      kind: HOST_CONFIRM_KIND,
      host: "cgroofing.net",
      orgId: "C-2017",
    });
  });

  it("writes nothing when either half is unusable", () => {
    expect(hostConfirmPayload("", "C-2017")).toBeNull();
    expect(hostConfirmPayload("   ", "C-2017")).toBeNull();
    expect(hostConfirmPayload("cgroofing.net", "")).toBeNull();
    // a person is not an org: the click fills an ORG's Domain slot
    expect(hostConfirmPayload("cgroofing.net", "P-1042")).toBeNull();
    expect(hostConfirmPayload("cgroofing.net", "cg-roofing-group")).toBeNull();
  });
});

describe("readHostConfirm", () => {
  it("round-trips what the writer minted", () => {
    const made = hostConfirmPayload(CG.host, CG.orgId);
    expect(readHostConfirm(JSON.parse(JSON.stringify(made)))).toEqual(made);
  });

  it("reads a finding with no action as no action", () => {
    expect(readHostConfirm(null)).toBeNull();
    expect(readHostConfirm(undefined)).toBeNull();
  });

  it("refuses anything it does not recognise rather than coercing it", () => {
    expect(readHostConfirm("host-confirm")).toBeNull();
    expect(readHostConfirm([{ kind: HOST_CONFIRM_KIND, ...CG }])).toBeNull();
    expect(readHostConfirm({ kind: "merge-orgs", ...CG })).toBeNull();
    expect(readHostConfirm({ kind: HOST_CONFIRM_KIND, host: CG.host })).toBeNull();
    expect(readHostConfirm({ kind: HOST_CONFIRM_KIND, host: 17, orgId: "C-2017" })).toBeNull();
  });

  it("re-grades on the way out, so a hand-written row is not trusted for having parsed", () => {
    // shape is right, the org id is not one the CRM mints
    expect(readHostConfirm({ kind: HOST_CONFIRM_KIND, host: "cgroofing.net", orgId: "C-20A7" })).toBeNull();
    // and a stored full URL is reduced, not passed through
    expect(readHostConfirm({ kind: HOST_CONFIRM_KIND, host: "http://cgroofing.net", orgId: "C-2017" })).toEqual({
      kind: HOST_CONFIRM_KIND,
      ...CG,
    });
  });
});

// Q84 inc.72 — the writer proved a finding carries MORE THAN ONE action: prod flag #133 lists
// two confirmable hosts. Nothing had ever been written, so the shape was finished, not migrated.
describe("buildHostConfirmPayload", () => {
  it("carries both live actions, sorted by host so the payload is stable across runs", () => {
    expect(buildHostConfirmPayload([GULF, CG])).toEqual({
      kind: HOST_CONFIRM_KIND,
      actions: [
        { kind: HOST_CONFIRM_KIND, ...CG },
        { kind: HOST_CONFIRM_KIND, ...GULF },
      ],
    });
  });

  it("drops one unusable pair per-action instead of losing the whole payload", () => {
    expect(buildHostConfirmPayload([CG, { host: "cgroofing.net", orgId: "P-1042" }])).toEqual({
      kind: HOST_CONFIRM_KIND,
      actions: [{ kind: HOST_CONFIRM_KIND, ...CG }],
    });
  });

  it("collapses the same host proposed for the same org twice — one host heard on two meetings", () => {
    expect(buildHostConfirmPayload([CG, { host: "https://www.cgroofing.net/x", orgId: "C-2017" }])?.actions).toHaveLength(1);
  });

  it("never breaks a tie: one host proposed for two orgs mints neither", () => {
    expect(buildHostConfirmPayload([CG, { host: "cgroofing.net", orgId: "C-2018" }])).toBeNull();
  });

  it("never offers two buttons for one free slot: two hosts on one org mints neither", () => {
    // an org carries exactly ONE free `domain` slot (inc.68), so the second click would be refused
    expect(buildHostConfirmPayload([CG, { host: "cgroofing.com", orgId: "C-2017" }])).toBeNull();
  });

  it("writes no payload at all when nothing survives", () => {
    expect(buildHostConfirmPayload([])).toBeNull();
    expect(buildHostConfirmPayload([{ host: "", orgId: "C-2017" }])).toBeNull();
  });
});

describe("readHostConfirmPayload", () => {
  it("round-trips a payload it minted", () => {
    const made = buildHostConfirmPayload([CG, GULF]);
    expect(readHostConfirmPayload(JSON.parse(JSON.stringify(made)))).toEqual(made);
  });

  it("re-grades on the way out — a hand-written member is not trusted for having parsed", () => {
    expect(readHostConfirmPayload({ kind: HOST_CONFIRM_KIND, actions: [{ kind: HOST_CONFIRM_KIND, host: "cgroofing.net", orgId: "cg-roofing-group" }] })).toBeNull();
    expect(readHostConfirmPayload({ kind: HOST_CONFIRM_KIND, actions: [{ kind: HOST_CONFIRM_KIND, ...CG }, { kind: HOST_CONFIRM_KIND, ...CG, orgId: "C-2018" }] })).toBeNull();
  });

  it("refuses anything that is not this shape, so a bad row renders no button", () => {
    expect(readHostConfirmPayload(null)).toBeNull();
    expect(readHostConfirmPayload([{ kind: HOST_CONFIRM_KIND, ...CG }])).toBeNull();
    expect(readHostConfirmPayload({ kind: "something-else", actions: [] })).toBeNull();
    expect(readHostConfirmPayload({ kind: HOST_CONFIRM_KIND })).toBeNull();
    expect(readHostConfirmPayload({ kind: HOST_CONFIRM_KIND, actions: "cgroofing.net" })).toBeNull();
    // the single-action shape inc.71 minted is NOT a payload — it never reached a row
    expect(readHostConfirmPayload({ kind: HOST_CONFIRM_KIND, ...CG })).toBeNull();
  });
});
