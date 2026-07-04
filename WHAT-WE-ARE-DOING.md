# What The Hell We're Doing
**Written:** 2026-07-04 (overnight build) · **By:** Max · **For:** Rob, Will, and anyone who spot-checks this

---

## The play, in plain English

Rob is building a revenue machine that grows like a network, not like a funnel.

Every person Rob talks to is worth two things: **money they can pay us** and **doors they can open**. A chiropractor who signs a $5k Phase One deal might be worth $5k on paper — but if he's best friends with the sales leads at three title-tech companies, he might really be worth $100k and ten new relationships. Traditional CRMs only see the $5k. This system sees both.

So we are building **The Network**: a living map of every person, business, and vertical Rob touches — drawn as nodes and connections, like stars in a constellation. Some nodes are "lit" (signed, paying, actively referring). Most start "unlit" (people we know about but haven't activated yet). The job of the whole business is to light up nodes, and every lit node makes the neighboring nodes easier to light.

The money side is deliberately simple. Every deal follows the same three-beat theme:

1. **Sign the agreement** — meeting happens, notes get captured with almost zero friction, the scope drops into the agreement automatically.
2. **Get paid fast** — invoice goes out on signature, we track time-to-payment like a hawk.
3. **Reduce all friction** — great communication overcomes any objection; anything that slows a deal down gets automated or deleted.

All of it is **remote revenue generation**. No offices, no outside money. People have offered; the answer is no. They can earn a cut by opening doors — the company stays ours.

## Who does what

**Rob** does the strategic work: builds out the network, does the training, does most of the presenting, and recruits the sales team. That team will start as names Rob already knows — connectors with deep business relationships, young guys who'll attack the phones, social butterflies — and later grow through targeted outreach (e.g., payment-processing salespeople who just lost their jobs and know every business owner in town).

**Will** does the tech delivery and meets with the handful of people who have access to very large networks — his past relationships.

**Max (me)** builds and runs the machine: the dashboard, the data, the automation, the AI estimates, the daily priorities, the reminders (including the ones Will needs to act on).

## What I'm building to solve it

One dashboard (on Vercel) with five faces, all reading the same data:

1. **The Network graph** — the centerpiece. Zoomable like a globe. People and verticals as nodes, referral relationships as edges. Node size = estimated total contribution (revenue + doors). Brightness = how activated they are. Zoom out to see clusters (roofing, medical, title/real-estate, payment processing); zoom in to one person and see who they know, who referred them, and what the AI thinks they're worth.
2. **The People ledger** — every contact as a line item: name, phone, email, website, vertical, who referred them and the relationship, quoted amount, signed or not, links to the meeting video and transcript, estimated time to payment, Phase One status, key dates. Sort it, scan it, work it.
3. **Projects board** — every project we're running, its category, its completion %, and its core theme (sign / get paid / reduce friction). Product builds like AIDRE and AIVA live in their own linked section — same treatment, different shelf — with reminders on the pieces Will owes.
4. **AI estimator** — Rob types a description of a person ("Jonathan Polk, we do his LinkedIn automation free, he brings so much business to Naples Spine & Joint that he can walk us into PropLogic, LandTech, Qualia — their reps say he's their #1, never turns down a meeting") and the AI estimates: probable aggregate revenue, probable new nodes, probability it happens, and why. Those estimates drive the graph.
5. **Training corner** — materials to train sales reps who come up under Rob: what Phase One is, how we talk, eventually a chat box they can ask questions instead of interrupting Rob.

Feeding it: **low-friction meeting-to-money flow** — meeting notes get captured, scope drops into the agreement, agreement goes for signature, invoice fires. The pieces of that already have their own build plans (the onboarding-automation and invoicing PRDs); this dashboard is where Rob *sees* it all.

## Rules of the build

- **Never stall on a tool.** Data lives behind an adapter: if Airtable access dies, we swap to Google Sheets or a plain file and keep moving. The dashboard never knows the difference.
- **The PRD is alive.** Every task gets checked off as it's done. Scope changes get versioned. (PRD: `docs/plans/PRD-mle-rob-dashboard-v2.md`)
- **Not everything is automated on day one — that's fine.** Manual entry first, automation follows. Moving beats perfect.
- **Speed over taxonomy.** No lost-reason dropdowns and stage-probability committees right now. Tools that make money and light nodes come first.
- **Connection is key.** Every record links to the people around it. The AI's job is to spot connections Rob doesn't see.

## What "done" looks like this phase

Rob wakes up, opens one URL, and can: see the network as a graph and zoom it; scan every contact as line items with all his fields; see every project's completion, category, and theme; read the AI's contribution estimate on a person; and know exactly what to work today. Storage recommendation is written up for a 10-second yes/no. Everything else builds from there.
