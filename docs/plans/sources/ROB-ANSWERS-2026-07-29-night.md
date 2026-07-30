# Rob's answers — 2026-07-29 ~22:50, verbatim, captured before the session could die

> Captured by hand because the thread-catcher agent that should do this automatically does not exist yet.
> That is itself the bug Rob named tonight: *things "keep falling thru the cracks"*. These five answers
> resolve five items that had been sitting open. **Verbatim first, interpretation clearly separated.**

Rob went to bed immediately after sending these, with: *"do as much as humanly possible tonight you have
permission and I'll ttyl"* — so every item below is authorized to be built without further confirmation.

---

## 1. Q73 role grants — I BUILT THIS WRONG. Bookers SHOULD see money.

**Verbatim:** *"I WANT the bookers to see quoted amount. I just dont want to show any equity to anyone but
Will and I. I want people to see how money can be made. Now I dont exactly know what you mean by pull it off"*

**The correction:** `0032_role_read_grants.sql` withholds `quoted_amount` from `mle_booker_read`. That is
**wrong and must be reversed.** The line Rob draws is not money-vs-no-money, it is **equity**:

| Column | Booker | Sales rep | Rob + Will |
|---|---|---|---|
| `quoted_amount`, `value` | **SEE IT** | **SEE IT** | see it |
| `equity` (+ splits, spinoff terms) | **NEVER** | **NEVER** | owners only |

**The reasoning matters more than the rule** — *"I want people to see how money can be made."* Deal size is a
**motivator** for the people selling. Withholding it doesn't protect anything, it de-motivates the floor.
Equity is the only genuinely private number because it is ownership, not compensation.

**My jargon failed him:** *"I dont exactly know what you mean by pull it off"* — I wrote "a booker can't pull
`quoted_amount` off a row," meaning read the raw column via the API even if the UI hides it. Rob should never
have had to parse that. Per `plain-english-no-internal-codes`: describe it in business terms or don't ask.

---

## 2. Q77 UNBLOCKED — the example repo, and the real requirement

**Verbatim:** *"no you definitely saw this https://github.com/zubair-trabzada/ai-realestate-claude It was a
simple codebase example but see how we dontnt show any agents or any skills. Its really hard to see if any of
them are giving the wrong insttructions when I dont even know they exist"*

**The requirement is NOT cosmetic organisation. It is auditability.** Re-read the sentence: *"it's really hard
to see if any of them are giving the wrong instructions when I don't even know they exist."*

Rob is not asking for a tidy folder. He is asking to be able to **catch an agent that is lying to him** — and he
has a live example: a marketing agent still telling people he works at STG, which he **left**. Today there are
40 agent files in a flat `~/.claude/agents/` pile and ~65 skills, none surfaced anywhere he can look.

So Q77 has two halves and the second is the point:
1. **Visible inventory** — agents + skills discoverable in the codebase at a glance.
2. **Auditable content** — a way to see *what each one instructs*, so a wrong instruction is findable
   **without Rob reading 40 markdown files.** A CODE-ENFORCED check (CR-3), not a doc that rots.

Non-negotiable while doing this: **no upstream attribution** (`~/.claude/rules/strategy.md`) — the cited repo is
an example to learn structure from, not something to link back to from Rob's own code.

---

## 3. The master-view / rep-cockpit research: HE NEVER SAW IT

**Verbatim:** *"I never saw them"*

Not "didn't approve" — **never saw.** Two research docs were written and "await Rob's morning read"; they gated
7 build items (Q40–Q46) and he was never actually able to read them.

**Root cause is preference #9, which I broke:** *"Rob does NOT read markdown deliverables. Ship Excel, PPTX,
PDF, Vercel dashboards."* Both were `.md` in `docs/research/`. **An approval gate on a deliverable Rob cannot
consume is a self-inflicted deadlock** — and it held 7 items for a week.

**Fix: stop asking. Re-ship both as something he can look at, and never gate a build on an unread .md again.**

---

## 4. CG Roofing — unpaid, and STOP THE DAILY REMINDER

**Verbatim:** *"Not yet qnd you can stop bringing it up every day. We just show it at the rep level so they see
ift when when open up and seee the alerts and then also within the deal itself."*

- **Payment: not received.** Leave `received_date` empty. Do NOT chase Caleb (Rob's friend; *relationship first*).
- **Kill the daily ping.** Repeating a known-open receivable at Rob every morning is noise. **Delete the
  PING-INBOX line and don't re-add it.**
- **Replace the nag with a surface** — this is the actual instruction, and it generalises past CG Roofing:
  an overdue receivable belongs **(a)** in the **rep-level alerts** shown when a rep opens the dashboard, and
  **(b)** **inside the deal itself.** Data Rob already knows doesn't need a reminder; the *rep* needs the signal.

---

## 5. Booker visibility — all accounts, with the state made obvious

**Verbatim:** *"The can see all accounts, there just neds to be sonething where you can easily tell if They can
see all accounts excep thos that are already in Phase 1 or Beyond or acounts that dont have an upcoming
appointment set up or the sales rep hasnt called in 2 weeks"*

**Settled: bookers see ALL accounts.** No row-level restriction. (Combined with #1: they see the money too.)

**What he wants is a way to tell accounts apart at a glance.** Three states are named:

| State | Signal | Why a booker cares |
|---|---|---|
| **Phase 1 or beyond** | already a customer | hands off — don't book, don't pitch |
| **No upcoming appointment set** | nothing on the calendar | ← the booker's actual job |
| **Rep hasn't called in 2 weeks** | going cold | needs rescuing |

**⚠️ ONE AMBIGUITY, flagged not guessed.** The sentence reads "all accounts **except** those that are Phase 1+
**or** don't have an upcoming appointment **or** rep hasn't called in 2 weeks" — but taken literally that would
**hide exactly the accounts a booker exists to work.** An account with no upcoming appointment is the booker's
*target*, not a thing to hide from them.

**Built on this reading:** *Phase 1+* = hands-off (visually de-emphasised, still visible). *No upcoming
appointment* and *no rep call in 14 days* = **highlighted as needing action**, and filterable. Nothing is hidden.
**If Rob meant literal exclusion, this is a filter default flip, not a rebuild** — cheap to reverse either way.

---

## Rob-authorised work queue from these answers

| # | Work | Source |
|---|---|---|
| 1 | Reverse the booker `quoted_amount` withholding; restrict `equity` to Rob + Will only | A1 |
| 2 | Q77: visible agent/skill inventory **+ code-enforced wrong-instruction audit** | A2 |
| 3 | Hunt and kill every stale "Rob works at STG" claim in agent/skill files | A2 |
| 4 | Re-ship master-view + rep-cockpit research as something Rob can actually look at | A3 |
| 5 | Delete the CG Roofing daily ping; surface overdue receivables in rep alerts + in the deal | A4 |
| 6 | Booker account-state signals (Phase 1+ / no appointment / cold 14d), filterable | A5 |
