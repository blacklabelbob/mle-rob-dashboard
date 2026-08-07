import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import {
  buildRecoveryWorklist,
  FIND_MEETING,
  MEASURED_DEPTH_CAP,
  parseArchivedReadPageIds,
  parseExhaustedDeepReadPageIds,
  normalizePageId,
  parseReadLogPageIds,
  type MeasuredRow,
} from "../recoveryWorklist";

function row(over: Partial<MeasuredRow> & Pick<MeasuredRow, "verdict">): MeasuredRow {
  return {
    id: "page-1",
    title: "A meeting",
    day: "2026-07-28",
    url: "https://notion.so/page-1",
    body: { blocks: 1, chars: 0 },
    ...over,
  };
}

describe("buildRecoveryWorklist", () => {
  it("sends a page with readable text to a plain --page read", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-present", body: { blocks: 531, chars: 101_000 } }),
    ]);
    expect(steps[0].action).toBe("read-page");
    expect(steps[0].command).toBe(`${FIND_MEETING} --page https://notion.so/page-1`);
    expect(steps[0].why).toContain("101000 chars");
    expect(steps[0].why).toContain("unread, not unexplainable");
  });

  it("re-reads a container-only row with --deep instead of calling it empty", () => {
    const { steps, atMostUnrecoverable } = buildRecoveryWorklist([
      row({ verdict: "container-only", body: { blocks: 3, chars: 0 } }),
    ]);
    expect(steps[0].action).toBe("deep-read-page");
    expect(steps[0].command).toBe(`${FIND_MEETING} --page https://notion.so/page-1 --deep`);
    expect(steps[0].why).toContain(String(MEASURED_DEPTH_CAP));
    // The whole point: blocks-with-no-text may never be counted as a possible absence.
    expect(atMostUnrecoverable).toBe(0);
  });

  it("sweeps by date only when the page has no blocks at all", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "2026-06-16" }),
    ]);
    expect(steps[0].action).toBe("sweep-by-date");
    expect(steps[0].command).toBe(`${FIND_MEETING} --date 2026-06-16`);
  });

  it("says a derived date is derived so a miss is not trusted blindly", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-empty", body: { blocks: 0, chars: 0 }, dayIsDerived: true }),
    ]);
    expect(steps[0].why).toContain("read off the row's own title");
  });

  it("asks for identification, not a read, when there is no day to sweep with", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "" }),
    ]);
    expect(steps[0].action).toBe("identify-first");
    expect(steps[0].command).toBe("");
  });

  it("never inherits 'empty' from a measurement error", () => {
    const { steps, atMostUnrecoverable } = buildRecoveryWorklist([
      row({ verdict: "unmeasured", body: undefined, error: "Notion GET -> 429" }),
    ]);
    expect(steps[0].action).toBe("re-measure");
    expect(steps[0].why).toContain("429");
    expect(atMostUnrecoverable).toBe(0);
  });

  it("addresses a page by uuid when the row carries no url", () => {
    const { steps } = buildRecoveryWorklist([
      row({ verdict: "body-present", url: "", id: "abc-123", body: { blocks: 2, chars: 40 } }),
    ]);
    expect(steps[0].command).toBe(`${FIND_MEETING} --page abc-123`);
  });

  it("orders certain reads before sweeps, and is stable on the same input", () => {
    const input: MeasuredRow[] = [
      row({ id: "e", verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "2026-07-01" }),
      row({ id: "c", verdict: "container-only", day: "2026-07-02" }),
      row({ id: "p1", verdict: "body-present", day: "2026-07-03", body: { blocks: 9, chars: 90 } }),
      row({ id: "p2", verdict: "body-present", day: "2026-07-20", body: { blocks: 9, chars: 90 } }),
      row({ id: "u", verdict: "unmeasured", body: undefined, error: "boom" }),
    ];
    const first = buildRecoveryWorklist(input);
    expect(first.steps.map((s) => s.row.id)).toEqual(["p2", "p1", "c", "e", "u"]);
    expect(buildRecoveryWorklist(input).steps.map((s) => s.row.id)).toEqual(
      first.steps.map((s) => s.row.id),
    );
  });

  it("reads the biggest bodies first, even when a smaller page is newer", () => {
    // The older page holds 100x the text. Date order would open the near-empty one first and
    // leave the 100k-char transcript unread; size order retires the most unread text per read.
    const { steps } = buildRecoveryWorklist([
      row({ id: "small-new", verdict: "body-present", day: "2026-08-04", body: { blocks: 3, chars: 900 } }),
      row({ id: "big-old", verdict: "body-present", day: "2025-12-20", body: { blocks: 784, chars: 101488 } }),
      row({ id: "mid", verdict: "body-present", day: "2026-07-28", body: { blocks: 531, chars: 95769 } }),
    ]);
    expect(steps.map((s) => s.row.id)).toEqual(["big-old", "mid", "small-new"]);
  });

  it("orders container-only re-reads by blocks, the only size their capped walk measured", () => {
    const { steps } = buildRecoveryWorklist([
      row({ id: "few", verdict: "container-only", day: "2026-08-04", body: { blocks: 5, chars: 0 } }),
      row({ id: "many", verdict: "container-only", day: "2026-01-01", body: { blocks: 60, chars: 0 } }),
    ]);
    expect(steps.map((s) => s.row.id)).toEqual(["many", "few"]);
  });

  it("counts the ceiling of unrecoverable rows, not the pile", () => {
    const { counts, atMostUnrecoverable } = buildRecoveryWorklist([
      row({ id: "a", verdict: "body-present", body: { blocks: 1, chars: 10 } }),
      row({ id: "b", verdict: "container-only" }),
      row({ id: "c", verdict: "container-only" }),
      row({ id: "d", verdict: "body-empty", body: { blocks: 0, chars: 0 } }),
      row({ id: "e", verdict: "body-empty", body: { blocks: 0, chars: 0 }, day: "" }),
    ]);
    expect(counts.rows).toBe(5);
    expect(counts["read-page"]).toBe(1);
    expect(counts["deep-read-page"]).toBe(2);
    expect(atMostUnrecoverable).toBe(2);
  });

  it("returns an empty list, not a crash, when nothing was measured", () => {
    const { steps, counts, atMostUnrecoverable } = buildRecoveryWorklist([]);
    expect(steps).toEqual([]);
    expect(counts.rows).toBe(0);
    expect(atMostUnrecoverable).toBe(0);
  });
});

describe("parseReadLogPageIds — which pages the read log says are actually READ", () => {
  it("takes an id from a section whose heading carries the READ token", () => {
    expect(
      parseReadLogPageIds(
        "## READ 2026-08-05 — `Meeting 2026-07-28`\n\n**Page:** `3ab1de57-0199-80ef-bf9c-c2b98d7578ed`\n",
      ),
    ).toEqual(["3ab1de57019980efbf9cc2b98d7578ed"]);
  });

  it("refuses an id that is only MENTIONED — a mention is not a read", () => {
    expect(
      parseReadLogPageIds(
        "## Still owed (12 reads + 18 uncapped re-reads)\n\n" +
          "- `3ad1de57-0199-80dd-b213-d09c387217e7` has not been opened\n",
      ),
    ).toEqual([]);
  });

  it("matches the dashless form Notion also prints, and normalises both to one key", () => {
    const dashless = parseReadLogPageIds("## READ\n\n3a51de570199802bb9f8f59fa153a013\n");
    const dashed = parseReadLogPageIds("## READ\n\n`3a51de57-0199-802b-b9f8-f59fa153a013`\n");
    expect(dashless).toEqual(["3a51de570199802bb9f8f59fa153a013"]);
    expect(dashed).toEqual(dashless);
  });

  it("takes the id from a heading that NAMES the page and never types READ", () => {
    // The shape inc.45 actually wrote. Skipping it made the pass report a write-up as owed
    // when it was on disk — the checker lying about its own evidence.
    expect(
      parseReadLogPageIds(
        "## `3761de57-0199-8054-86a9-cdc63def71a5` — `2026-06-05T13:56:00.000-04:00`\n\n" +
          "Read 2026-08-07 (inc.45), `--deep`, rc=0.\n",
      ),
    ).toEqual(["3761de570199805486a9cdc63def71a5"]);
  });

  it("still refuses a prose id inside an id-headed section — only the HEADING addresses a page", () => {
    // Recognising the id-headed shape must not smuggle mentions back in through its body.
    expect(
      parseReadLogPageIds(
        "## `3761de57-0199-8054-86a9-cdc63def71a5` — the row read on 2026-08-07\n\n" +
          "Compare with `3ad1de57-0199-80dd-b213-d09c387217e7`, which is still unread.\n",
      ),
    ).toEqual(["3761de570199805486a9cdc63def71a5"]);
  });

  it("reads the REAL committed log and finds the six pages filed there", () => {
    const log = readFileSync(
      new URL("../../../docs/research/Q84-READ-LOG-2026-08-05.md", import.meta.url),
      "utf8",
    );
    const ids = parseReadLogPageIds(log);
    // Guard the guard: if the log ever stops naming page ids this test must fail loudly
    // rather than go green on an empty set, which would silently re-schedule every read.
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids).toContain("3ab1de57019980efbf9cc2b98d7578ed"); // the Omega 7/28 row
    expect(ids).toContain("3a51de570199802bb9f8f59fa153a013"); // Gulf Coast 7/22 kickoff
    // inc.45's id-headed entry: proof the real log's second heading shape is picked up.
    expect(ids).toContain("3761de570199805486a9cdc63def71a5");
  });
});

describe("buildRecoveryWorklist — rows the read log has already closed", () => {
  it("schedules every row when no read log is supplied (byte-identical to before)", () => {
    const measured = [row({ id: "p1", verdict: "body-present", body: { blocks: 9, chars: 900 } })];
    expect(buildRecoveryWorklist(measured)).toEqual(buildRecoveryWorklist(measured, {}));
    expect(buildRecoveryWorklist(measured).counts["read-page"]).toBe(1);
  });

  it("stops asking for a read that has already happened, and says so instead of hiding it", () => {
    const { steps, counts } = buildRecoveryWorklist(
      [
        row({ id: "3ab1de57-0199-80ef-bf9c-c2b98d7578ed", verdict: "body-present", body: { blocks: 531, chars: 95_769 } }),
        row({ id: "unread-page", title: "Not yet opened", verdict: "body-present", body: { blocks: 9, chars: 900 } }),
      ],
      { alreadyRead: ["3ab1de57019980efbf9cc2b98d7578ed"] },
    );
    expect(counts["read-page"]).toBe(1);
    expect(counts["already-read"]).toBe(1);
    expect(counts.rows).toBe(2); // carried, never dropped
    expect(steps.at(-1)?.action).toBe("already-read");
    expect(steps.at(-1)?.command).toBe(""); // nothing left to run on it
    expect(steps[0]?.row.title).toBe("Not yet opened"); // the real work is first
  });

  it("matches a read id whichever way the dashes fall", () => {
    const { counts } = buildRecoveryWorklist(
      [row({ id: "3a51de570199802bb9f8f59fa153a013", verdict: "body-present" })],
      { alreadyRead: ["3a51de57-0199-802b-b9f8-f59fa153a013"] },
    );
    expect(counts["already-read"]).toBe(1);
  });

  it("never lets an already-read row into the unrecoverable ceiling", () => {
    const { atMostUnrecoverable, counts } = buildRecoveryWorklist(
      [row({ id: "gone", verdict: "body-empty", body: { blocks: 0, chars: 0 } })],
      { alreadyRead: ["gone"] },
    );
    expect(counts["sweep-by-date"]).toBe(0);
    expect(atMostUnrecoverable).toBe(0);
  });
});

describe("parseArchivedReadPageIds — the dump on disk as proof of a read", () => {
  // The real header `find_meeting.py` writes, trimmed to the lines that matter.
  const dump = (id: string, body = "") =>
    [
      "==============================================================================",
      "TITLE (do not trust): 2026-08-03T19:34:00.000-04:00",
      "URL: https://app.notion.com/p/3b11de57019980209fb9c3171150b472",
      `id : ${id}`,
      "------------------------------------------------------------------------------",
      body,
    ].join("\n");

  it("recovers the page id from an archived dump", () => {
    expect(parseArchivedReadPageIds([dump("3b11de57-0199-8020-9fb9-c3171150b472")])).toEqual([
      "3b11de57019980209fb9c3171150b472",
    ]);
  });

  it("normalizes to the dashless form so it compares against a logged id", () => {
    const [archived] = parseArchivedReadPageIds([dump("3B11DE57019980209FB9C3171150B472")]);
    expect(archived).toBe(normalizePageId("3b11de57-0199-8020-9fb9-c3171150b472"));
  });

  it("does NOT count a page id merely quoted inside a transcript body", () => {
    // A pasted link in someone's meeting notes is not evidence that page was opened.
    const body = "[paragraph] see also id : 3a51de57-0199-802b-b9f8-f59fa153a013 in that thread";
    const ids = parseArchivedReadPageIds([dump("3b11de57-0199-8020-9fb9-c3171150b472", body)]);
    expect(ids).toEqual([normalizePageId("3b11de57-0199-8020-9fb9-c3171150b472")]);
  });

  it("ignores a dump with no id header rather than inventing one", () => {
    expect(parseArchivedReadPageIds(["no header here at all"])).toEqual([]);
  });

  it("THE DEFECT: an archived read with no log entry still retires the row", () => {
    // Exactly what happened — read, archived outside the repo, never logged, and the
    // work-list printed it at the TOP of "to read".
    const id = "3b11de57-0199-8020-9fb9-c3171150b472";
    const measured = [row({ id, verdict: "body-present", body: { blocks: 285, chars: 24112 } })];

    const logOnly = buildRecoveryWorklist(measured, { alreadyRead: parseReadLogPageIds("") });
    expect(logOnly.counts["read-page"]).toBe(1); // the bug, reproduced

    const withArchive = buildRecoveryWorklist(measured, {
      alreadyRead: parseArchivedReadPageIds([dump(id)]),
    });
    expect(withArchive.counts["read-page"]).toBe(0);
    expect(withArchive.counts["already-read"]).toBe(1);
  });
});

describe("parseExhaustedDeepReadPageIds — the uncapped read that came back empty", () => {
  // The real shape, copied from the four 2026-08-04/03 container rows. `find_meeting.py`
  // writes this line itself; the module keys on the READER's verdict, never its own.
  const WARNING =
    "  \u203c A [transcription] wrapper is present but recovered almost no text. " +
    "Do NOT report 'no transcript' \u2014 open the page in Notion and say so.";

  const dump = (id: string, body = "") =>
    [
      "==============================================================================",
      "TITLE (do not trust): Meeting 2026-08-04",
      "URL: https://app.notion.com/p/3b21de57019980e895b6ca602d7129c6",
      `id : ${id}`,
      "------------------------------------------------------------------------------",
      body,
    ].join("\n");

  const ID = "3b21de57-0199-80e8-95b6-ca602d7129c6";

  it("recognises an exhausted deep read by the reader's own warning line", () => {
    expect(parseExhaustedDeepReadPageIds([dump(ID, WARNING)])).toEqual([normalizePageId(ID)]);
  });

  it("does NOT claim exhaustion for a dump that recovered real text", () => {
    const rich = dump(ID, "BODY: 784 blocks, 114354 chars\n[paragraph] Alex opened by saying");
    expect(parseExhaustedDeepReadPageIds([rich])).toEqual([]);
  });

  it("needs the id header too — a warning with no id names no page", () => {
    expect(parseExhaustedDeepReadPageIds(["no header here\n" + WARNING])).toEqual([]);
  });

  it("THE DEFECT: an exhausted row is neither re-scheduled nor filed as read", () => {
    // Before: `container-only` \u2192 `deep-read-page` every run, forever, running a command
    // already proven to return the same bytes.
    const measured = [row({ id: ID, verdict: "container-only", body: { blocks: 5, chars: 76 } })];
    expect(buildRecoveryWorklist(measured).counts["deep-read-page"]).toBe(1);

    const after = buildRecoveryWorklist(measured, {
      deepReadExhausted: parseExhaustedDeepReadPageIds([dump(ID, WARNING)]),
    });
    expect(after.counts["deep-read-page"]).toBe(0);
    expect(after.counts["open-in-notion"]).toBe(1);
    // And it is NOT "already read" \u2014 something is still owed, by a human, in a browser.
    expect(after.counts["already-read"]).toBe(0);
  });

  it("open-in-notion BEATS already-read, because the same dump satisfies both witnesses", () => {
    // An exhausted dump is also an archived dump, so `parseArchivedReadPageIds` matches it.
    // If that won, the row would read "nothing further is owed on the page itself" \u2014 a
    // tool limit laundered into a claim about the meeting.
    const text = dump(ID, WARNING);
    const measured = [row({ id: ID, verdict: "container-only", body: { blocks: 5, chars: 76 } })];
    const out = buildRecoveryWorklist(measured, {
      alreadyRead: parseArchivedReadPageIds([text]),
      deepReadExhausted: parseExhaustedDeepReadPageIds([text]),
    });
    expect(out.counts["open-in-notion"]).toBe(1);
    expect(out.counts["already-read"]).toBe(0);
    expect(out.steps[0].why).toContain("open it in Notion");
  });

  it("never counts an exhausted row toward the unrecoverable ceiling", () => {
    const measured = [row({ id: ID, verdict: "container-only", body: { blocks: 5, chars: 76 } })];
    const out = buildRecoveryWorklist(measured, { deepReadExhausted: [ID] });
    expect(out.atMostUnrecoverable).toBe(0);
  });

  it("is inert when the caller passes nothing \u2014 the list is byte-identical", () => {
    const measured = [
      row({ id: ID, verdict: "container-only", body: { blocks: 5, chars: 76 } }),
      row({ id: "page-9", verdict: "body-present", body: { blocks: 20, chars: 900 } }),
    ];
    expect(buildRecoveryWorklist(measured, {})).toEqual(buildRecoveryWorklist(measured));
  });

  it("PROVEN ON THE REAL ARCHIVE: the four container dumps on disk are recognised", () => {
    // A fixture would go green on a shape nobody has seen. These are the actual files this
    // increment archived, read through the same 12,000-char window the script uses.
    const names = [
      "2026-08-04-meeting-container-a",
      "2026-08-04-meeting-container-b",
      "2026-08-04-meeting-container-c",
      "2026-08-03-meeting-container-d",
    ];
    const texts = names.map((n) =>
      readFileSync(`MLE Internal Meetings/archive-reads/${n}.deepread.txt`, "utf8").slice(0, 12000),
    );
    expect(parseExhaustedDeepReadPageIds(texts)).toHaveLength(4);
  });
});
