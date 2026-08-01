import { describe, it, expect } from "vitest";
import { hostConfirmPayload, readHostConfirm, HOST_CONFIRM_KIND } from "../hostConfirm";

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
