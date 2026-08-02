import { describe, expect, it } from "vitest";
import { anchorSites, missingAnchorNotice, type Anchor } from "../anchorPin";

// Q84 inc.116 — the pin that keeps a guard from going green by losing its subject. Tested on
// strings here; the two doors drive it off the real tree in their own files.

const PATH_ANCHOR: Anchor = { kind: "path", name: "app/api/admin/flags/route.ts" };
const DECL_ANCHOR: Anchor = { kind: "declaration", name: "hostConfirmControls" };

describe("a path anchor", () => {
  it("is present when the walk holds the file, and absent when it does not", () => {
    const held = [{ path: "app/api/admin/flags/route.ts", text: "" }, { path: "a.ts", text: "" }];
    expect(anchorSites(PATH_ANCHOR, held)).toEqual(["app/api/admin/flags/route.ts"]);
    expect(anchorSites(PATH_ANCHOR, [{ path: "a.ts", text: "" }])).toEqual([]);
  });

  it("is not satisfied by a file that merely NAMES the path in its text", () => {
    // The guard module itself carries the path as a string constant. That is the rule, not the door.
    const naming = [{ path: "lib/flags/payloadWriters.ts", text: `= "app/api/admin/flags/route.ts";` }];
    expect(anchorSites(PATH_ANCHOR, naming)).toEqual([]);
  });
});

describe("a declaration anchor", () => {
  it("accepts the shapes that bind the name and rejects a mention", () => {
    const bound = [
      { path: "a.ts", text: "export function hostConfirmControls(payload: unknown) {}" },
      { path: "b.ts", text: "const hostConfirmControls = () => {};" },
      { path: "c.ts", text: "class hostConfirmControls {}" },
    ];
    expect(anchorSites(DECL_ANCHOR, bound)).toEqual(["a.ts", "b.ts", "c.ts"]);
    const mentions = [
      { path: "d.ts", text: `const READER = "hostConfirmControls";` },
      { path: "e.tsx", text: "const c = hostConfirmControls(f.payload, page, written, row);" },
      { path: "f.ts", text: "// see hostConfirmControls for why" },
    ];
    expect(anchorSites(DECL_ANCHOR, mentions)).toEqual([]);
  });

  it("does not accept a longer name that merely ends or starts with the anchor", () => {
    const decoys = [
      { path: "a.ts", text: "function hostConfirmControlsExtra() {}" },
      { path: "b.ts", text: "function myHostConfirmControls() {}" },
      { path: "c.ts", text: "function mod.hostConfirmControls() {}" },
    ];
    expect(anchorSites(DECL_ANCHOR, decoys)).toEqual([]);
  });

  // THE FINDING, and the reason this is a LINE-anchored rule rather than a list of trusted files.
  // Three files on this tree quote `export function hostConfirmControls(` inside backticks while
  // explaining the rule — `readerGate.ts` twice, and `anchorPin.ts` itself. A list would have had
  // to grow by one entry per doctrine file, and would have gone quietly green each time somebody
  // forgot. Prose cannot begin a line with the declaration; code always does.
  it("does not take prose that quotes a declaration as evidence the declaration exists", () => {
    const prose = [
      { path: "lib/flags/readerGate.ts", text: "// `export function hostConfirmControls(` is the reader, not a call." },
      { path: "lib/flags/anchorPin.ts", text: " * spells `export function hostConfirmControls(` twice in its own comments" },
      { path: "docs.ts", text: "/** see `const hostConfirmControls = ...` for the shape */" },
    ];
    expect(anchorSites(DECL_ANCHOR, prose)).toEqual([]);
  });

  it("does not accept a commented-out declaration that starts its line either", () => {
    const commented = [{ path: "a.ts", text: "// export function hostConfirmControls(x) {}" }];
    expect(anchorSites(DECL_ANCHOR, commented)).toEqual([]);
  });

  it("accepts the real shapes an indented or default-exported declaration takes", () => {
    const real = [
      { path: "a.ts", text: "  export async function hostConfirmControls(x) {}" },
      { path: "b.ts", text: "export default function hostConfirmControls(x) {}" },
    ];
    expect(anchorSites(DECL_ANCHOR, real)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("the notice", () => {
  it("stays silent while the anchor is there", () => {
    const held = [{ path: "app/api/admin/flags/route.ts", text: "" }];
    expect(missingAnchorNotice(PATH_ANCHOR, "the flags.payload write gate", held)).toBeNull();
  });

  it("names the door that went blind, the anchor, and what the green would have meant", () => {
    const said = missingAnchorNotice(PATH_ANCHOR, "the flags.payload write gate", [])!;
    expect(said).toContain("the flags.payload write gate");
    expect(said).toContain("app/api/admin/flags/route.ts");
    expect(said).toContain("not clean, it is empty");
    expect(said).toContain("do not delete the check");
  });

  it("says DECLARATION for an identifier, because the remedy is not the same as a moved file", () => {
    expect(missingAnchorNotice(DECL_ANCHOR, "the payload-read gate", [])!).toContain(
      "a declaration of hostConfirmControls",
    );
  });
});
