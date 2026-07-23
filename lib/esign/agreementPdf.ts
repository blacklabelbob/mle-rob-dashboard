import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "@cantoo/pdf-lib";

// ============================================================================
// Phase I Services Agreement engine — faithful TypeScript port of
// contracts/.claude/skills/phase1-agreement/scripts/phase1_engine.py
// (Rob directive 2026-07-23: "replicate it as something that CAN run on
// Vercel"). Same clauses (§1–§13 verbatim), same intake gate (structural
// scope enforcement — refuses to generate until the confirmed intake block
// matches entities[]), same per-entity scope grammar, same fee/highlight
// behavior, same header/footer.
//
// SKILL-WRAPPABLE BY DESIGN: pure module — JSON config in → PDF bytes out.
// No Next.js imports, no I/O, no clock reads beyond nothing (dates are not
// stamped by this engine — the AGREEMENT is undated until signed; the e-sign
// layer stamps dates server-side). Ledger/organize.py filing stays in the
// contracts repo (local concern); the CRM documents table is the system of
// record here.
//
// Template data contract (mirrors clients/*.json in the contracts repo):
//   {
//     "fee": "$10,000" | null,          // null → highlighted [placeholder]
//     "provider": {...},                 // optional; defaults to MLE
//     "client": { "legal_name", "descriptor", "address" },
//     "entities": [ { "name", "website_pages",
//         "agents": null | { "count", "website_pages", "second_brain",
//                            "social_media": bool | {count, note}, "label" } } ],
//     "additional_scope": [ { "title", "description" } ],
//     "intake": { "confirmed_by", "date", "entities_count",
//                 "second_brains_total", "other_adjustments" }   // REQUIRED
//   }
//
// Known deliberate deviations from the Python original (parity log in
// docs/plans/ESIGN-BUILD-LOG-2026-07-23.md):
// * ReportLab's ¶-justification algorithm is reimplemented (word-spacing
//   distribution); line-break positions may differ by a word here and there.
// * The §5 heading's ★ (&#9733;) is drawn via ZapfDingbats (WinAnsi Helvetica
//   cannot encode it — ReportLab silently dropped it too: the reference PDF's
//   extracted text shows no star).
// * List indent metrics are visually matched, not metric-identical.
// ============================================================================

// ------------------------------- data contract ------------------------------

export interface AgentsBundle {
  count: number;
  website_pages: number;
  second_brain?: boolean;
  social_media?: boolean | { count: number; note?: string };
  label?: string;
}

export interface EntityConfig {
  name: string;
  website_pages: number;
  agents?: AgentsBundle | null;
}

export interface ProviderConfig {
  name: string;
  descriptor: string;
  address: string;
  signers: { name: string; title: string }[];
}

export interface IntakeBlock {
  confirmed_by: string;
  date: string;
  entities_count: number;
  second_brains_total: number;
  other_adjustments: string;
}

export interface AgreementConfig {
  fee?: string | null;
  provider?: Partial<ProviderConfig>;
  client: { legal_name: string; descriptor: string; address: string };
  entities: EntityConfig[];
  additional_scope?: { title: string; description: string }[];
  intake?: IntakeBlock;
}

export const DEFAULT_PROVIDER: ProviderConfig = {
  name: "My Local Everything, LLC",
  descriptor: "a Florida limited liability company",
  address: "400 5th Avenue S, Suite 101, Naples, Florida 34102",
  signers: [
    { name: "William DeVito", title: "Chief Executive Officer" },
    { name: "Robert Acheson", title: "Managing Director" },
  ],
};

// ------------------------------- numbers -----------------------------------

const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

export function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`;
  }
  if (n < 1000) {
    const h = `${ONES[Math.floor(n / 100)]} hundred`;
    return n % 100 === 0 ? h : `${h} ${words(n % 100)}`;
  }
  return n.toLocaleString("en-US");
}

export function wn(n: number): string {
  return `${words(n)} (${n})`;
}

// ------------------------------- intake gate --------------------------------

export const INTAKE_QUESTIONS = `Before generating ANY customer-facing document, ask the person running this
(Rob, Will, ...) the three intake questions and record the answers in an
"intake" block in the client JSON:

  1. Is there more than ONE legal entity to reference?
       -> "entities_count": <n>          (standard = 1)
  2. Are we doing more than ONE Second Brain + social media package
     (e.g. per agent / sales rep / individual)? How many TOTAL?
       -> "second_brains_total": <n>     (standard = 1; count company + individuals)
  3. Any other adjustments to the standard wording?
       -> "other_adjustments": "<text>"  (or "none")

  Plus: "confirmed_by": "<who answered>", "date": "YYYY-MM-DD"`;

export function expectedSecondBrains(entities: EntityConfig[]): number {
  let total = 0;
  for (const e of entities) {
    total += 1;
    if (e.agents?.second_brain) total += e.agents.count ?? 0;
  }
  return total;
}

export function checkIntake(config: AgreementConfig, path = "<config>"): void {
  const intake = config.intake;
  if (!intake) {
    throw new Error(
      `INTAKE GATE: ${path} has no "intake" block — refusing to generate.\n\n${INTAKE_QUESTIONS}`
    );
  }
  const required = ["confirmed_by","date","entities_count","second_brains_total","other_adjustments"] as const;
  const missing = required.filter((k) => intake[k] === null || intake[k] === undefined || intake[k] === "");
  if (missing.length) {
    throw new Error(
      `INTAKE GATE: ${path} intake block is missing [${missing.join(", ")}].\n\n${INTAKE_QUESTIONS}`
    );
  }
  const nEntities = (config.entities ?? []).length;
  if (intake.entities_count !== nEntities) {
    throw new Error(
      `INTAKE GATE: ${path} — intake says ${intake.entities_count} entit(y/ies) but entities[] has ${nEntities}. Reconcile with Rob/Will before generating.`
    );
  }
  const exp = expectedSecondBrains(config.entities ?? []);
  if (intake.second_brains_total !== exp) {
    throw new Error(
      `INTAKE GATE: ${path} — intake says ${intake.second_brains_total} Second Brain(s) but entities[] implies ${exp} (one per entity + one per agent with second_brain). Reconcile with Rob/Will before generating.`
    );
  }
}

// ------------------------------- markup -------------------------------------

export function namesPhrase(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

const ENTITIES: Record<string, string> = {
  "&mdash;": "—",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&nbsp;": " ",
  "&bull;": "•",
  "&#9733;": "★", // ★ — drawn via ZapfDingbats
  "&amp;": "&",
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-z#0-9]+;/g, (m) => ENTITIES[m] ?? m);
}

export interface Seg {
  text: string;
  bold: boolean;
  highlight: boolean;
}

// Parses the engine's inline markup: <b>…</b> + entities; [bracketed
// placeholders] become highlighted segments (hl() in the Python).
export function parseMarkup(raw: string, highlightPlaceholders = true): Seg[] {
  const decoded = decodeEntities(raw);
  const segs: Seg[] = [];
  // Split into bold/non-bold spans first.
  const boldSplit = decoded.split(/(<b>|<\/b>)/);
  let bold = false;
  for (const part of boldSplit) {
    if (part === "<b>") { bold = true; continue; }
    if (part === "</b>") { bold = false; continue; }
    if (!part) continue;
    if (highlightPlaceholders) {
      const pieces = part.split(/(\[[^\]]+\])/);
      for (const piece of pieces) {
        if (!piece) continue;
        segs.push({ text: piece, bold, highlight: /^\[[^\]]+\]$/.test(piece) });
      }
    } else {
      segs.push({ text: part, bold, highlight: false });
    }
  }
  return segs;
}

// Bold the "N. Heading." lead-in of a numbered clause (lead() in the Python).
export function lead(text: string): string {
  const m = text.match(/^(\d+\.\s+[\s\S]*?\.)(\s\s)([\s\S]*)$/);
  return m ? `<b>${m[1]}</b>${m[2]}${m[3]}` : text;
}

// ------------------------------- scope builder ------------------------------

const SUB_OPT = [
  "AI-search boosted, SEO boosted, GEO (generative-engine) boosted, and conversion boosted;",
  "designed to grow Client’s traffic from organic visitors; and",
  "automatically updated on an ongoing basis.",
];
const BRAIN_DESC =
  "a retrieval-augmented knowledge base that stays continuously current " +
  "with everything about the company &mdash; its knowledge, market, " +
  "competitors, personas, visuals, and more &mdash; automatically kept up to date";

interface ScopeFlow {
  head: string; // parent bullet markup
  subOpts: string[]; // "–" sub-bullets under the websites bullet
  items: string[]; // remaining • bullets
}

export function buildScopeContent(
  entities: EntityConfig[],
  clientLegal: string,
  additionalScope?: { title: string; description: string }[]
): ScopeFlow {
  const names = entities.map((e) => e.name);
  const sole = entities.length === 1 && names[0].trim().toLowerCase() === clientLegal.trim().toLowerCase();

  const pages = new Set(entities.map((e) => e.website_pages));
  let head: string;
  if (entities.length === 1) {
    head = `<b>Main Website</b> &mdash; up to ${entities[0].website_pages.toLocaleString("en-US")} pages, built and continuously optimized to be:`;
  } else if (pages.size === 1) {
    const p = entities[0].website_pages;
    head = `<b>Main Websites for ${namesPhrase(names)}</b> &mdash; up to ${p.toLocaleString("en-US")} pages each, built and continuously optimized to be:`;
  } else {
    const per = entities
      .map((e) => `${e.name} up to ${e.website_pages.toLocaleString("en-US")} pages`)
      .join("; ");
    head = `<b>Main Websites (${per})</b> &mdash; built and continuously optimized to be:`;
  }

  const items: string[] = [];
  for (const e of entities) {
    const label = sole ? "for the Company" : `for ${e.name}`;
    items.push(`&ldquo;Living&rdquo; Second Brain Knowledge System (RAG) ${label} &mdash; ${BRAIN_DESC}.`);
  }
  for (const e of entities) {
    const a = e.agents;
    if (!a) continue;
    const poss = sole ? "the Client’s" : `${e.name}’s`;
    const cnt = wn(a.count);
    if (a.label) {
      items.push(
        `<b>${cnt[0].toUpperCase()}${cnt.slice(1)} ${a.label}</b> &mdash; up to ${wn(a.website_pages)} pages each, built, optimized, and maintained on the same terms as the Main Website above.`
      );
      if (a.second_brain) {
        items.push(
          `A &ldquo;Living&rdquo; Second Brain Knowledge System (RAG) for <b>each</b> of the ${cnt} dedicated websites above, maintained and automatically updated in the same way.`
        );
      }
    } else {
      items.push(
        `<b>A dedicated website for each of ${poss} ${cnt} agents</b> &mdash; up to ${wn(a.website_pages)} pages each, built, optimized, and maintained on the same terms as the Main Website above.`
      );
      if (a.second_brain) {
        items.push(
          `A &ldquo;Living&rdquo; Second Brain Knowledge System (RAG) for each of ${poss} ${cnt} agents, maintained and automatically updated in the same way.`
        );
      }
    }
    const sm = a.social_media;
    if (sm && typeof sm === "object") {
      const note = sm.note ? ` ${sm.note}` : "";
      items.push(
        `<b>Automated Social Media Posting</b> on dedicated individual social media profiles &mdash; ${wn(sm.count)} accounts${note}.`
      );
    } else if (sm) {
      items.push(
        `Automated Social Media Posting on a dedicated social media profile for each of ${poss} ${cnt} agents.`
      );
    }
  }
  for (const x of additionalScope ?? []) {
    items.push(`<b>${x.title}</b> &mdash; ${x.description}`);
  }
  return { head, subOpts: SUB_OPT, items };
}

// ------------------------------- layout engine ------------------------------

const LETTER: [number, number] = [612, 792];
const M_LEFT = 72, M_RIGHT = 72, M_TOP = 68.4, M_BOTTOM = 68.4; // 0.95in top/bottom
const FRAME_W = LETTER[0] - M_LEFT - M_RIGHT;
const INK = rgb(0.102, 0.102, 0.102);
const GRAY = rgb(0.42, 0.42, 0.42);
const ACCENT = rgb(0.043, 0.325, 0.58);
const HILITE = rgb(1, 0.925, 0.545); // #FFEC8B
const RULE = rgb(0.878, 0.878, 0.878);

type Align = "left" | "center" | "justify";
interface Style {
  size: number;
  leading: number;
  color?: ReturnType<typeof rgb>;
  align: Align;
  spaceBefore?: number;
  spaceAfter: number;
  leftIndent?: number;
  bulletChar?: string; // drawn in the indent gutter of the first line
  bulletIndent?: number;
  bold?: boolean; // base font is bold (headings)
}

const S = {
  title: { size: 21, leading: 25, align: "center", spaceBefore: 6, spaceAfter: 10, bold: true } as Style,
  sub: { size: 11, leading: 15, color: ACCENT, align: "center", spaceAfter: 22 } as Style,
  body: { size: 10.5, leading: 15.5, align: "justify", spaceAfter: 11 } as Style,
  bull: { size: 10.5, leading: 15.5, align: "justify", spaceAfter: 6, leftIndent: 30, bulletChar: "•", bulletIndent: 16 } as Style,
  subBull: { size: 10, leading: 14.5, align: "justify", spaceAfter: 3, leftIndent: 52, bulletChar: "–", bulletIndent: 34 } as Style,
  guar: { size: 12.5, leading: 17, color: ACCENT, align: "left", spaceBefore: 2, spaceAfter: 8, bold: true } as Style,
  sig: { size: 10.5, leading: 18, align: "left", spaceAfter: 2 } as Style,
};

interface Word {
  text: string;
  bold: boolean;
  highlight: boolean;
  star?: boolean; // drawn with ZapfDingbats
  width: number;
}

interface Line {
  words: Word[];
  natural: number; // width without justification
  spaceW: number;
}

interface Para {
  kind: "para";
  segs: Seg[];
  style: Style;
}
interface SpacerF { kind: "spacer"; h: number }
interface KeepF { kind: "keep"; children: Flowable[] }
type Flowable = Para | SpacerF | KeepF;

function P(markup: string, style: Style): Para {
  return { kind: "para", segs: parseMarkup(markup), style };
}

export interface RenderResult {
  bytes: Uint8Array;
  pageCount: number;
}

class Renderer {
  private doc!: PDFDocument;
  private fonts!: { reg: PDFFont; bold: PDFFont; ding: PDFFont };
  private page!: PDFPage;
  private y = 0;
  private pageNo = 0;

  async render(story: Flowable[]): Promise<RenderResult> {
    this.doc = await PDFDocument.create();
    this.doc.setTitle("Phase I Services Agreement");
    this.doc.setAuthor(DEFAULT_PROVIDER.name);
    this.fonts = {
      reg: await this.doc.embedFont(StandardFonts.Helvetica),
      bold: await this.doc.embedFont(StandardFonts.HelveticaBold),
      ding: await this.doc.embedFont(StandardFonts.ZapfDingbats),
    };
    this.newPage();
    for (const f of story) this.draw(f);
    const bytes = await this.doc.save();
    return { bytes, pageCount: this.pageNo };
  }

  // deco() port: header right, footer center, hairline above footer.
  private newPage(): void {
    this.page = this.doc.addPage(LETTER);
    this.pageNo += 1;
    const [w, h] = LETTER;
    const f = this.fonts.reg;
    const header = "Phase I Services Agreement  —  Confidential";
    this.page.drawText(header, {
      x: w - 72 - f.widthOfTextAtSize(header, 8),
      y: h - 0.6 * 72,
      size: 8, font: f, color: GRAY,
    });
    const footer = `${DEFAULT_PROVIDER.name}      |      Page ${this.pageNo}`;
    this.page.drawText(footer, {
      x: (w - f.widthOfTextAtSize(footer, 8)) / 2,
      y: 0.55 * 72,
      size: 8, font: f, color: GRAY,
    });
    this.page.drawLine({
      start: { x: 72, y: 0.75 * 72 },
      end: { x: w - 72, y: 0.75 * 72 },
      thickness: 0.5, color: RULE,
    });
    this.y = h - M_TOP;
  }

  private remaining(): number {
    return this.y - M_BOTTOM;
  }

  private fontFor(w: { bold: boolean; star?: boolean }, style: Style): PDFFont {
    if (w.star) return this.fonts.ding;
    return w.bold || style.bold ? this.fonts.bold : this.fonts.reg;
  }

  private tokenize(segs: Seg[], style: Style): Word[] {
    const out: Word[] = [];
    for (const seg of segs) {
      const baseBold = seg.bold;
      // NBSP binds words together (ReportLab behavior).
      for (const rawWord of seg.text.split(/ +/)) {
        if (rawWord === "") continue;
        // Pull ★ out as its own dingbat-font token.
        const parts = rawWord.split(/(★)/).filter(Boolean);
        for (const p of parts) {
          const star = p === "★";
          const font = this.fontFor({ bold: baseBold, star }, style);
          const text = star ? "★" : p.replace(/ /g, " ");
          out.push({
            text, bold: baseBold, highlight: seg.highlight, star,
            width: font.widthOfTextAtSize(text, style.size),
          });
        }
      }
    }
    return out;
  }

  private wrap(segs: Seg[], style: Style): Line[] {
    const maxW = FRAME_W - (style.leftIndent ?? 0);
    const spaceW = this.fonts.reg.widthOfTextAtSize(" ", style.size);
    const tokens = this.tokenize(segs, style);
    const lines: Line[] = [];
    let cur: Word[] = [];
    let width = 0;
    for (const t of tokens) {
      const probe = cur.length === 0 ? t.width : width + spaceW + t.width;
      if (probe <= maxW || cur.length === 0) {
        cur.push(t);
        width = probe;
      } else {
        lines.push({ words: cur, natural: width, spaceW });
        cur = [t];
        width = t.width;
      }
    }
    if (cur.length) lines.push({ words: cur, natural: width, spaceW });
    return lines;
  }

  private paraHeight(p: Para): number {
    const lines = this.wrap(p.segs, p.style);
    return (p.style.spaceBefore ?? 0) + lines.length * p.style.leading + p.style.spaceAfter;
  }

  private heightOf(f: Flowable): number {
    if (f.kind === "spacer") return f.h;
    if (f.kind === "para") return this.paraHeight(f);
    return f.children.reduce((a, c) => a + this.heightOf(c), 0);
  }

  private draw(f: Flowable): void {
    if (f.kind === "spacer") {
      if (f.h > this.remaining()) this.newPage();
      else this.y -= f.h;
      return;
    }
    if (f.kind === "keep") {
      const h = this.heightOf(f);
      if (h > this.remaining() && h <= LETTER[1] - M_TOP - M_BOTTOM) this.newPage();
      for (const c of f.children) this.draw(c);
      return;
    }
    this.drawPara(f);
  }

  private drawPara(p: Para): void {
    const st = p.style;
    const lines = this.wrap(p.segs, st);
    if (st.spaceBefore) this.y -= st.spaceBefore;
    // Widow control: need at least one line to fit.
    if (this.remaining() < st.leading) this.newPage();
    let first = true;
    for (let i = 0; i < lines.length; i++) {
      if (this.remaining() < st.leading) this.newPage();
      const line = lines[i];
      const isLast = i === lines.length - 1;
      const x0 = M_LEFT + (st.leftIndent ?? 0);
      const maxW = FRAME_W - (st.leftIndent ?? 0);
      let x: number;
      let gap = line.spaceW;
      if (st.align === "center") {
        x = M_LEFT + (FRAME_W - line.natural) / 2;
      } else if (st.align === "justify" && !isLast && line.words.length > 1) {
        x = x0;
        gap = line.spaceW + (maxW - line.natural) / (line.words.length - 1);
      } else {
        x = x0;
      }
      const baseline = this.y - st.size; // approx ascent
      if (first && st.bulletChar) {
        this.page.drawText(st.bulletChar, {
          x: M_LEFT + (st.bulletIndent ?? 0),
          y: baseline,
          size: 9,
          font: this.fonts.reg,
          color: st.color ?? INK,
        });
      }
      for (const w of line.words) {
        const font = this.fontFor(w, st);
        if (w.highlight) {
          this.page.drawRectangle({
            x: x - 1, y: baseline - 2,
            width: w.width + 2, height: st.size + 4,
            color: HILITE,
          });
        }
        this.page.drawText(w.text, {
          x, y: baseline, size: st.size, font,
          color: st.color ?? INK,
        });
        x += w.width + gap;
      }
      this.y -= st.leading;
      first = false;
    }
    this.y -= st.spaceAfter;
  }
}

// ------------------------------- document -----------------------------------

export async function buildAgreementPdf(
  config: AgreementConfig,
  path = "<config>"
): Promise<RenderResult> {
  checkIntake(config, path);
  const prov: ProviderConfig = { ...DEFAULT_PROVIDER, ...(config.provider ?? {}) };
  const cli = config.client;
  const fee = config.fee || "[Phase I Fee amount]";

  const story: Flowable[] = [
    { kind: "spacer", h: 18 },
    P("PHASE I SERVICES AGREEMENT", S.title),
    P("100% Investment Security &nbsp;&bull;&nbsp; 30-Day Performance Guarantee", S.sub),
    P('This Phase I Services Agreement (the &ldquo;Agreement&rdquo;) is made and entered into as of the date Provider receives payment of the Phase I Fee (the &ldquo;Effective Date&rdquo;), by and between:', S.body),
    P(`<b>${prov.name}</b>, ${prov.descriptor}, with its principal place of business at ${prov.address} (the &ldquo;Provider&rdquo;); and`, S.body),
    P(`<b>${cli.legal_name}</b>, ${cli.descriptor}, with its principal place of business at ${cli.address} (the &ldquo;Client&rdquo;).`, S.body),
    P('Provider and Client are each referred to as a &ldquo;Party&rdquo; and together as the &ldquo;Parties.&rdquo;', S.body),
    P(lead('1. Purpose and Spirit of This Agreement.  We are handshake-type partners, and this Agreement is written to match that spirit: short, plain, and fair. This is a Phase I engagement &mdash; the starting point of our partnership. Phase I is intentionally simple because, at the outset, neither Party yet knows which of Provider’s tools will move the needle most for Client. As the engagement progresses, the Parties will enter into more specific agreements for later phases. Until then, this Agreement governs Phase I and is backed by the guarantee in Section 5.'), S.body),
    P(lead('2. Scope of Phase I Services.  Provider maintains a suite of more than 44,000 automations. During Phase I, Provider will deploy and configure the following for Client (collectively, the &ldquo;Services&rdquo;), and may add other high-impact automations from its library as it identifies them in the course of the work:'), S.body),
  ];

  // Scope block (build_scope port).
  const scope = buildScopeContent(config.entities, cli.legal_name, config.additional_scope);
  story.push(P(scope.head, S.bull));
  for (const s of scope.subOpts) story.push(P(s, S.subBull));
  story.push({ kind: "spacer", h: 4 });
  for (const item of scope.items) story.push(P(item, S.bull));

  story.push(
    P(lead(`3. Fees and Payment.  In consideration of the Services, Client will pay Provider a Phase I fee of ${fee} (the &ldquo;Phase I Fee&rdquo;). An invoice will be sent separately. All amounts are in U.S. dollars and, except as provided in Section 5, are non-refundable once the corresponding Services have been delivered.`), S.body),
    P(lead('4. Go-Live and Phase I Period.  Provider will begin work immediately after payment is received. The &ldquo;Go-Live Date&rdquo; is the date on which Provider notifies Client that the core Services in Section 2 are live and operating. The &ldquo;Phase I Period&rdquo; runs for thirty (30) days following the Go-Live Date, unless extended or superseded by a later-phase agreement between the Parties.'), S.body),
    {
      kind: "keep",
      children: [
        P('5.  100% Investment Security &mdash; 30-Day Performance Guarantee  &#9733;', S.guar),
        P('This is the heart of our promise. If the Services have not started producing results for Client within thirty (30) days after the Go-Live Date, Client may request a full refund of every dollar Client has paid under this Agreement, and Provider will refund 100% of those amounts within thirty (30) days of the request. <b>And Client keeps everything.</b>  All work and technology Provider has built, produced, and set up for Client &mdash; the websites, the Living Second Brain knowledge systems, and the content created during Phase I &mdash; remains Client’s to keep and use, at no further charge, with the license described in Section 6. What Client keeps is the technology <b>as delivered as of the date of Client’s refund notice</b>; improvements, updates, and further iterations Provider develops after that date are not included. To exercise this guarantee, Client need only notify Provider in writing (email is fine) before the end of the Phase I Period.', S.body),
      ],
    },
    P(lead('6. Ownership and License of Deliverables.  Upon the earlier of (a) Client’s payment of the Phase I Fee in full or (b) a refund under Section 5, Client owns the specific deliverables Provider creates for Client during Phase I &mdash; including the website content and the configured Living Second Brain knowledge bases (the &ldquo;Deliverables&rdquo;). In the case of a refund under Section 5, the Deliverables are owned in the form delivered as of the date of Client’s refund notice, and improvements, updates, and further iterations Provider develops after that date are not part of the Deliverables unless the Parties agree otherwise in a later-phase agreement. Provider retains all right, title, and interest in its pre-existing and underlying technology, automation library, models, templates, and methodologies (the &ldquo;Provider Tools&rdquo;), and grants Client a perpetual, non-exclusive, royalty-free license to continue using any Provider Tools that remain embedded in the Deliverables as delivered. Provider will not disable or claw back the Deliverables after a refund.'), S.body),
    P(lead('7. Client Responsibilities.  So Provider can move fast, Client agrees to:'), S.body),
    P('provide timely access to accounts, domains, brand assets, and information Provider reasonably needs;', S.bull),
    P('respond to Provider’s questions, approvals, and requests within a reasonable time (generally within two (2) business days); and', S.bull),
    P('ensure Client has the rights to any materials Client provides to Provider. Delays caused by Client may extend the Go-Live Date and related timelines accordingly.', S.bull),
    { kind: "spacer", h: 8 },
    P(lead('8. Confidentiality.  Each Party may receive non-public information from the other. Each Party will use the other’s confidential information only to perform this Agreement and will protect it with at least reasonable care. This obligation does not apply to information that is or becomes public through no fault of the receiving Party, or that a Party is legally required to disclose.'), S.body),
    P(lead('9. Independent Contractor.  Provider is an independent contractor. Nothing in this Agreement creates a partnership, joint venture, employment, or agency relationship between the Parties.'), S.body),
    P(lead('10. Performance Commitment; Disclaimer.  Provider will perform the Services in a professional and workmanlike manner. The guarantee in Section 5 is Provider’s core performance commitment for Phase I. Except for that guarantee and the prior sentence, the Services and Deliverables are provided &ldquo;as is,&rdquo; and Provider makes no other warranties, express or implied, including any implied warranty of merchantability or fitness for a particular purpose. Provider does not guarantee specific revenue, rankings, or third-party platform results beyond what Section 5 provides.'), S.body),
    P(lead('11. Limitation of Liability.  To the fullest extent permitted by law, neither Party will be liable to the other for any indirect, incidental, special, or consequential damages. Provider’s total liability under this Agreement will not exceed the amount Client actually paid to Provider under this Agreement. The refund in Section 5 is Client’s primary remedy if the Services do not produce results during Phase I.'), S.body),
    P(lead('12. Term and Termination.  This Agreement begins on the Effective Date and continues through the end of the Phase I Period unless the Parties move into a later phase. Either Party may terminate for the other’s material breach that remains uncured ten (10) days after written notice. Sections 5, 6, 8, 10, 11, and 13 survive termination.'), S.body),
    P(lead('13. Miscellaneous.  This Agreement is the entire agreement between the Parties on its subject matter and supersedes prior discussions. It may be amended only in a writing signed by both Parties. If any provision is held unenforceable, the rest remains in effect. This Agreement may be signed in counterparts and by electronic signature (including DocuSign), each of which is an original and all of which together form one agreement.'), S.body)
  );

  // Signature blocks (KeepTogether, as in the Python).
  const sig: Flowable[] = [
    P('Agreed and accepted by the Parties as of the Effective Date:', S.body),
    { kind: "spacer", h: 8 },
    P(`<b>PROVIDER &mdash; ${prov.name}</b>`, S.sig),
    { kind: "spacer", h: 14 },
  ];
  for (const s of prov.signers) {
    sig.push(
      P('Signature: ______________________________&nbsp;&nbsp;&nbsp;&nbsp;Date: ____________', S.sig),
      P(`Name: ${s.name}`, S.sig),
      P(`Title: ${s.title}`, S.sig),
      { kind: "spacer", h: 14 }
    );
  }
  sig.push(
    { kind: "spacer", h: 2 },
    P('<b>CLIENT</b>', S.sig),
    { kind: "spacer", h: 14 },
    P('Signature: ______________________________&nbsp;&nbsp;&nbsp;&nbsp;Date: ____________', S.sig),
    P('Name:', S.sig),
    P('Title:', S.sig)
  );
  story.push({ kind: "spacer", h: 10 });
  story.push({ kind: "keep", children: sig });

  return new Renderer().render(story);
}
