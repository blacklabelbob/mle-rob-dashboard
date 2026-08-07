/**
 * Q85 inc.25 — whose gap is it. Fixtures are values READ OFF PROD + the live Notion archive in
 * the same run that shipped this module (4 stored meeting rows, 49 archive rows), not invented.
 */
import { describe, expect, it } from "vitest";

import {
  decideAttendeeProvenance,
  summarizeProvenance,
} from "@/lib/meetings/storedAttendeeProvenance";

// The live 7/22 Gulf Coast archive row — the one that turned out to be recoverable.
const GULFCOAST_0722 = { nonMleAttendees: "Alex Greenwood, Chris Acheson", mleAttendees: ["Rob Acheson", "Will DeVito"] };

describe("decideAttendeeProvenance", () => {
  it("calls it OURS when the archive names a counterparty the stored payload dropped", () => {
    const d = decideAttendeeProvenance(
      { activityId: "A-MTG-2026-07-22-GULFCOAST", context: { pageId: "3a51de57-0199-802b-b9f8-f59fa153a013" } },
      GULFCOAST_0722
    );
    expect(d.verdict).toBe("payload-dropped");
    expect(d.missingFromStored).toEqual(["Alex Greenwood", "Chris Acheson"]);
    expect(d.detail).toContain("needs nobody");
  });

  it("keeps inc.24's answer when the archive is thin too — that row really is blocked on a human", () => {
    // Live A-MTG-2026-07-30-MARTINFIERRO: our payload carries `Dani`/`Michael`, archive carries nothing.
    const d = decideAttendeeProvenance(
      {
        activityId: "A-MTG-2026-07-30-MARTINFIERRO",
        context: { pageId: "3ad1de57-0199-80dd-b213-d09c387217e7", attendeesOther: ["Dani", "Michael"] },
      },
      { mleAttendees: ["Rob Acheson", "Will DeVito"] }
    );
    expect(d.verdict).toBe("archive-thin");
    expect(d.storedNames).toEqual(["Dani", "Michael"]);
    expect(d.missingFromStored).toEqual([]);
  });

  it("does not call a single-token archive name recoverable — that would propose a human called 'Dani'", () => {
    const d = decideAttendeeProvenance(
      { activityId: "A-X", context: { pageId: "p1" } },
      { nonMleAttendees: "Dani, Michael" }
    );
    expect(d.verdict).toBe("archive-thin");
    expect(d.archiveNames).toEqual([]);
  });

  it("never counts our own people as a recoverable counterparty", () => {
    const d = decideAttendeeProvenance(
      { activityId: "A-X", context: { pageId: "p1" } },
      { mleAttendees: ["Rob Acheson", "Will DeVito"], salesRep: ["Will DeVito"] }
    );
    expect(d.verdict).toBe("archive-thin");
    expect(d.archiveNames).toEqual([]);
  });

  it("agrees when the stored payload already carries every identifying archive name", () => {
    const d = decideAttendeeProvenance(
      { activityId: "A-X", context: { pageId: "p1", attendeesOther: ["Alex Greenwood", "Chris Acheson"] } },
      GULFCOAST_0722
    );
    expect(d.verdict).toBe("agrees");
    expect(d.missingFromStored).toEqual([]);
  });

  it("matches stored against archive by normalized name, not by spelling", () => {
    const d = decideAttendeeProvenance(
      { activityId: "A-X", context: { pageId: "p1", attendeesOther: ["  alex   greenwood ", "Chris Acheson"] } },
      GULFCOAST_0722
    );
    expect(d.verdict).toBe("agrees");
  });

  it("refuses to guess a join when the stored row carries no pageId", () => {
    const d = decideAttendeeProvenance({ activityId: "A-X", context: { attendeesOther: [] } }, GULFCOAST_0722);
    expect(d.verdict).toBe("no-archive-link");
    expect(d.pageId).toBeNull();
    expect(d.archiveNames).toEqual([]);
  });

  it("says so plainly when the pageId reaches no archive row, rather than blaming the cell", () => {
    const d = decideAttendeeProvenance({ activityId: "A-X", context: { pageId: "gone" } }, null);
    expect(d.verdict).toBe("archive-row-missing");
    expect(d.detail).toContain("cannot say whose gap");
  });

  it("treats a null source_context as unjoinable, not as an empty archive", () => {
    const d = decideAttendeeProvenance({ activityId: "A-X", context: null }, GULFCOAST_0722);
    expect(d.verdict).toBe("no-archive-link");
  });
});

describe("summarizeProvenance", () => {
  it("reproduces the live prod run: 4 rows, 1 recoverable by us, 3 blocked on a human", () => {
    const decisions = [
      decideAttendeeProvenance({ activityId: "A-MTG-2026-06-16-GULFCOAST-AIALEX", context: { pageId: "p1" } }, {
        mleAttendees: ["Rob Acheson"],
      }),
      decideAttendeeProvenance({ activityId: "A-MTG-2026-07-22-GULFCOAST", context: { pageId: "p2" } }, GULFCOAST_0722),
      decideAttendeeProvenance({ activityId: "A-MTG-2026-07-28-OMEGA", context: { pageId: "p3" } }, {
        mleAttendees: ["Rob Acheson", "Will DeVito"],
      }),
      decideAttendeeProvenance(
        { activityId: "A-MTG-2026-07-30-MARTINFIERRO", context: { pageId: "p4", attendeesOther: ["Dani", "Michael"] } },
        { mleAttendees: ["Rob Acheson", "Will DeVito"] }
      ),
    ];
    expect(summarizeProvenance(decisions)).toEqual({ rows: 4, recoverable: 1, needsHuman: 3, unjoinable: 0 });
  });
});
