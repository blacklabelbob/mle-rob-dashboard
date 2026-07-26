# Macro — Realtime, Sync, Offline & Collaboration Deep Analysis
**Scope:** realtime / sync / local-first / collaboration
**Target:** clone of Macro (macro.com), AGPLv3, at `/private/tmp/claude-501/-Users-robertacheson-Projects-MyLocalEverything/1eb0b710-ce17-40e9-ac89-e0bbf3de6054/scratchpad/macro`
**Commit at analysis time:** `512906d` (`git log --oneline -3`)
**Date:** 2026-07-25
**Analyst:** head-of-engineering
**Comparison target:** `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard` (Next.js 16 App Router + Supabase + Vercel)

---

## 0. TL;DR — the headline finding

**Macro is NOT a local-first CRDT application.** It is a conventional client/server app with an
exceptionally well-engineered normalized client cache, disciplined optimistic updates, and a
websocket echo channel — *plus* a genuinely local-first CRDT layer that is scoped **only to the
collaborative document editor**.

Evidence for the split:

- Loro CRDT appears in exactly **10 files** in the entire web app
  (`grep -rln "loro-crdt\|LoroDoc" apps/web/src --include="*.ts" --include="*.tsx" | wc -l` → `10`),
  and every one of them is under `apps/web/src/features/block-md/` (the markdown block editor),
  `apps/web/src/lib/core/component/LexicalMarkdown/collaboration/`, or the sync-service client.
- CRM, email, channels, properties, projects, search — none of it touches Loro. It all flows
  through TanStack Query + a normalized entity cache
  (`apps/web/src/lib/queries/soup/normalized-cache/`).
- The AGPLv3 licence (`LICENSE.txt`, `README.md:97`) covers the repo; but
  `apps/web/LICENSE` reads `Copyright 2023 CoParse, Inc. All rights reserved.` — a stale
  pre-open-sourcing file that contradicts the root licence. Treat the root AGPLv3 as governing.

So the "fastest interface" claim is roughly **20% CRDT/local-first, 80% very good frontend
engineering**. Section 7 gives the honest breakdown, and that is *good news* for Rob: almost all of
it is reproducible on Supabase + Next.js without a Rust service.

---

## 1. Loro CRDT and `packages/loro-mirror`

### 1.1 What it is

`packages/loro-mirror` is a **vendored fork of an upstream third-party library**, not Macro IP.

- `packages/loro-mirror/package.json:1-3` — package name `@loro-mirror/core`, version `0.1.0`,
  description "Core functionality for Loro Mirror - a state management library with Loro CRDT
  synchronization".
- `packages/loro-mirror/package.json` — `"license": "MIT"`. **This is the only package in
  `packages/` that declares a licence at all** (`collaboration` and `lexical-core` declare none and
  inherit the root AGPLv3).
- `packages/loro-mirror/THIRD_PARTY_LICENSES.md`:
  > loro-mirror / Copyright (c) 2024 Loro / Licensed under the MIT License /
  > https://github.com/loro-dev/loro-mirror
  > **"This package is derived from an earlier version of loro-mirror, with modifications.
  > We are planning on removing this and updating to using the latest version directly."**

So: MIT, upstream-owned, and Macro explicitly intends to delete their fork and consume upstream.

### 1.2 Is it generic?

Yes — essentially 100% generic. It is a "mirror your plain-JS app state into a Loro CRDT doc"
library in the mould of Zustand/Immer.

- `packages/loro-mirror/src/index.ts` re-exports only `./schema` and `./core`. No Macro concepts.
- A grep for Macro-specific identifiers across the whole source tree
  (`grep -rniE "macro|coparse|lexical|soup|document" packages/loro-mirror/src/`) returns **6 hits,
  all of which are the word "document" inside comments referring to the *Loro* document**
  (`src/core/mirror.ts:67`, `:464`, `:516`, `:532`, `:1026`; `src/core/state.ts:14`). There is
  literally zero Macro coupling.
- Source is 3,466 lines: `src/core/mirror.ts` (1,434), `src/core/diff.ts` (812),
  `src/schema/validators.ts` (333), `src/core/utils.ts` (384), `src/schema/types.ts` (158),
  `src/schema/index.ts` (154), `src/core/state.ts` (150).
- Public API per `packages/loro-mirror/README.md`: `schema({...})` with
  `schema.LoroList / LoroMap / LoroText / LoroMovableList / String / Boolean`, then
  `createStore({ doc, schema, initialState })` with `store.setState(fn)` and `store.subscribe(fn)`.
- Only runtime dependency is `immer ^10`; `loro-crdt ^1.4.4` is a peer dependency.

### 1.3 Where does Macro-specific logic live?

In `packages/lexical-core`, and it is tiny. `packages/lexical-core/markdown-loro-schema.ts` is
**34 lines total** and defines one recursive markdown node schema:

```ts
const markdownNodeSchema = schema.LoroMap({
  $:        schema.LoroMap({} as any, { required: false }),
  text:     schema.LoroText({ required: false }),
  ids:      schema.LoroList(schema.String(), (idStr) => idStr, { required: false }),
  children: schema.LoroMovableList({} as SchemaType, (item) => item?.$?.id, { required: false }),
});
markdownNodeSchema.definition.children.itemSchema = markdownNodeSchema;
export const MARKDOWN_LORO_SCHEMA = schema({ root: markdownNodeSchema });
```

`LoroMovableList` keyed by `$.id` is what gives block moves/reorders proper CRDT semantics rather
than delete+insert.

### 1.4 Independently reusable?

**Yes, trivially** — but there is no reason to use Macro's fork. It is MIT, generic, and upstream
(`github.com/loro-dev/loro-mirror`) is the maintained source that Macro themselves say they want to
migrate back to. If you ever want CRDT-mirrored state, take upstream.

**Relevance to Rob: near zero.** A CRM record is not a collaboratively-typed document. CRDTs solve
concurrent character-level text editing. Two reps editing different fields on the same contact is
solved by last-write-wins per column, which Postgres already gives you.

---

## 2. Client-side store: is there a local database? Does it work offline?

There are **three separate persistence layers**, with very different maturity. This is the most
important section for Rob.

### Layer A — Loro document WAL + snapshots (IndexedDB) — SHIPPED, editor-only

`packages/collaboration/src/collab/wal.ts` (385 lines) implements a real write-ahead log:

- `LORO_WAL_DB_NAME = 'macro-document-wal'` (`wal.ts:43`), one IndexedDB object store `updates`
  keyed by autoincrement id, indexed by `scopeId` (`wal.ts:47-59`, `:79-88`).
- `WALEntry<T> = { id, update, delivered, createdAt }` (`wal.ts:6-13`) — `delivered` is set once the
  transport acks; entries are pruned at the next snapshot (`markDelivered` / `pruneDelivered`,
  `wal.ts:28-32`).
- `WAL_TTL_MS = 7 * 24 * 60 * 60 * 1000` (`wal.ts:39`) — undelivered entries older than one week are
  dropped without replay.
- Snapshots every 5s: `SNAPSHOT_INTERVAL_MS = 5_000`
  (`packages/collaboration/src/collab/engine.ts:31`), driven by
  `setInterval(() => void this.persistSnapshot(), SNAPSHOT_INTERVAL_MS)` (`engine.ts:153-158`), with
  `packages/collaboration/src/collab/snapshot-store.ts` (130 lines) holding the blobs.

This is a genuine offline story — but **only for documents you have open in the markdown editor**.

### Layer B — WASM normalized GraphQL cache over IndexedDB — BUILT, BEHIND A FLAG, INCOMPLETE

This is the most ambitious piece in the repo and the closest thing to Linear's model. Design doc:
`apps/web/docs/graphql-normalized-cache-plan.md` (406 lines). Rust implementation:
`crates/client/` (10,614 lines of Rust).

Architecture (`graphql-normalized-cache-plan.md:145-175`, `:235-252`):

| Crate | Purpose |
|---|---|
| `crates/client/cache-core/` | Pure Rust engine — normalize/denormalize, dependency index, LRU hot tier, `Storage` trait. Native `cargo test`, no wasm. |
| `crates/client/cache-idb/` | `Storage` impl over IndexedDB via the `idb` Rust crate (browser) |
| `crates/client/cache-sqlite/` | `Storage` impl over SQLite, WAL mode (Tauri desktop) |
| `crates/client/cache-wasm/` | `wasm-bindgen` shell, ~460 KiB pre-gzip (`plan.md:293`) |
| `apps/web/src/lib/graphql-cache/` | JS glue: `CacheHost` interface, urql exchange, SharedWorker entry |

Key design decisions, all quotable:

- **Bounded memory** was the driver, not offline: *"graphcache hydrates and keeps the entire cache
  in browser memory. With 10s of thousands of cached objects … that is not acceptable."*
  (`plan.md:8-11`). Hot tier LRU in memory, everything else on disk (`plan.md:22-27`).
- **One engine in a SharedWorker**, so all tabs share one cache with no leader election
  (`plan.md:177-190`). Loaded at
  `apps/web/src/lib/graphql-cache/host/worker-host.ts:110` (`new SharedWorker(`).
- **No SharedWorker → no cache at all.** *"return a no-op `CacheHost` that always misses, ignores
  writes, and does not initialize wasm or persistent storage. Mutations pass through the exchange
  without durable optimism."* (`plan.md:185-188`, and `host/noop-host.ts`).
- **OPFS was evaluated and rejected.** Chromium probe results (`plan.md:369-401`): SharedWorker
  cannot create OPFS sync access handles and cannot spawn nested Workers; and IDB point reads
  measured *faster* anyway — **IDB individual get avg 0.35 ms vs OPFS sync 4 KiB read avg 2.0 ms**.
  IDB batched put ×1000 in one txn = 119 ms. postMessage RTT window↔shared for 64 KiB = 0.22 ms.
- **Records are `postcard`-serialized**, entity-keyed `__typename:id`, with operation roots
  (`hash(query, variables) → root links + lastFetched + ttl`) persisted so previously-seen queries
  replay offline (`plan.md:206-213`).
- **Cache identity is an anonymous client-generated uuid in localStorage, not user identity**
  (`plan.md:74-91`, `apps/web/src/lib/graphql-cache/scope.ts`) — so construction is synchronous and
  offline-capable, and no PII lands in enumerable IDB database names. User↔cache consistency is
  enforced by "identity witnessing": writes carry an opaque session tag compared against
  `__meta:identity` in the same DB; mismatch ⇒ atomic wipe-and-rebind.
- **Key policy is "presence-of-id"** — an output type with `id: ID!` is keyed, no `id` ⇒ embedded.
  Schema is the policy; `build.rs` fails the build on malformed shapes (`plan.md:83-91`, `:268-270`).

**Status:** Phases 0–4 done, **Phase 5 (write path from websocket handlers) and Phase 6 (eviction
budgets, disk GC, telemetry, multi-tab soak) are not done** (`plan.md:335-342`). Phase 4 is marked
*"done — needs manual smoke test"* and *"Manual smoke test pending"* (`plan.md:314`, `:331-333`). It
is gated behind the `ENABLE_GRAPHQL_SOUP` feature flag
(`apps/web/src/lib/queries/properties/entity.ts:3` imports it from `@core/constant/featureFlags`;
`plan.md:321`). Open questions still list *encryption at rest* and *disk budget*
(`plan.md:107-111`).

**Verdict: this is not what makes Macro feel fast today.** It is a bet on the future.

### Layer C — selective per-query TanStack persistence to IndexedDB — SHIPPED, and this is the real one

`apps/web/src/lib/queries/persistence.ts` (172 lines) + `persistence/per-query-idb.ts` (146 lines).

- Each query is persisted **individually** by `queryHash`, not as one giant blob:
  *"individual queries are persisted to and restored from IDB independently, rather than serializing
  the entire query cache as one blob"* (`persistence.ts:117-120`).
- Entries carry `{ queryHash, queryKey, data, dataUpdatedAt, persistedAt, buster }`
  (`persistence.ts:100-107`).
- Validation on restore is two-factor: **buster mismatch** or **age > maxAge** ⇒ discard
  (`validatePersistedEntry`, `persistence.ts:52-58`). The buster is the app version:
  `const buster = import.meta.env.__APP_VERSION__ ?? 'dev'` (`apps/web/src/lib/queries/client.ts:31`).
- Race guard: if a fresh network fetch resolves before the IDB read completes, the restore is
  abandoned (`persistence.ts:70-72` and again at `:91-92` — it re-checks state *after* the await).

**Crucially, what gets persisted is a short allowlist** (`apps/web/src/lib/queries/persistence-scopes.ts`):

| Scope | maxAge | Platform |
|---|---|---|
| channels (`mentions`, `activity`, `listChannels`) | 7 d | all |
| email thread messages | 7 d | all |
| soup list queries (`soupKeys.astItems`) | 7 d | **`isNativeMobilePlatform()` only** |
| user-info | 7 d | **mobile only** |

So on the **web**, the main entity lists are *not* persisted across reloads. Offline browsing of your
CRM/soup lists is a **mobile-only** capability today.

### Answer to "does it work offline?"

- **Documents you have open in the markdown editor: yes, genuinely.** WAL + 5s snapshots + version
  vector reconciliation on reconnect.
- **Everything else on web: no.** Selective 7-day IDB restore of channels/email gives a warm start,
  not offline operation. There is no global mutation queue on the shipped path — the durable
  mutation queue exists only inside the flagged WASM cache.
- **Mobile (Tauri/native): partially**, because soup lists and user-info are added to the persisted
  scopes.

### Initial hydration + delta sync

- **Hydration:** normal paginated network queries via TanStack Query. Cached queries are restored
  from IDB opportunistically on the allowlisted scopes above. There is no "download the whole
  workspace" bootstrap.
- **Delta sync:** two independent channels.
  1. **Documents** — Loro version-vector diff over a Bebop binary websocket (section 3.1).
  2. **Everything else** — JSON events over the connection-gateway websocket that *patch the
     TanStack cache in place*, then soft-invalidate (section 4.2).
- **On reconnect, the app invalidates everything**:
  ```ts
  // apps/web/src/lib/queries/invalidate-on-reconnect.ts (whole file, 10 lines)
  createReconnectEffect(ws, () => { void queryClient.invalidateQueries(); });
  ```
  That is the safety net: no clever backfill for app data, just "mark all stale, refetch what's
  active."

---

## 3. Sync protocol — the actual wire format

There are **two entirely separate websockets**. This distinction matters and is easy to miss.

### 3.1 Document sync — Bebop binary, version-vector based

Schema: `packages/collaboration/src/sync-service/generated/schema.bop`. Complete, verbatim:

```
union FromPeer {
  1 -> struct PeerUpdate          { byte[][] updates; string id; }
  2 -> struct PeerAwareness       { byte[] awareness; }
  3 -> struct PeerRequestSince    { byte[] vv; }
  4 -> struct PeerRequestSnapshot {}
  5 -> struct PeerRegisterId      { uint64 peerid; }
}

union FromRemote {
  1 -> struct RemoteInitialSync { byte[] snapshot; byte[] awareness; }
  2 -> struct RemoteUpdate      { byte[] update; }
  3 -> struct RemoteAwareness   { byte[] awareness; }
  4 -> struct RemoteSnapshot    { byte[] snapshot; }
  5 -> struct RemoteUpdateAck   { string id; }
  6 -> struct RemoteUpdateSince { byte[] update; byte[] vv; }
}
```

Design notes worth stealing, quoted from the schema comment on `PeerRequestSince`:

> "We send a version vector instead of frontiers because the client may have local ops the server
> hasn't received yet (offline edits or unflushed WAL on reconnect). Frontiers would reference those
> ops directly and `frontiersToVV` would panic on the server. A VV is just per-peer counters —
> unknown peers are harmless."

**Backfill semantics:** on reconnect the client sends `PeerRequestSince { vv }` (its own version
vector, which *includes* unsent local ops), the server replies `RemoteUpdateSince { update, vv }`
with only the delta. Cold start is `RemoteInitialSync { snapshot, awareness }` — snapshot and
presence in one frame. `PeerRequestSnapshot` forces a full resync.

**Ack semantics:** `PeerUpdate` carries a client-generated `id`; `RemoteUpdateAck { id }` closes the
loop, which is what flips `WALEntry.delivered = true` so the entry can be pruned at the next
snapshot (`packages/collaboration/src/collab/wal.ts:28-32`).

**Transport config** — `packages/collaboration/src/sync-service/socket.ts:44-70`, and the comments
are unusually candid:

- `BebopSerializer(FromPeer, FromRemote)` — binary, not JSON.
- `ExponentialBackoff(250, 5)` + `withMaxRetries(20)`: *"delays are 250*2^1 = 500ms doubling to a
  250*2^5 = 8s cap; 20 retries ≈ 2 minutes of automatic attempts, after which something is very
  wrong and we stop hammering."*
- `withBuffer(new ArrayQueue())` — **unbounded on purpose**: *"dropping the oldest updates would
  leave dependency gaps the server can never fill, and CRDT updates are tiny relative to a session's
  lifetime."*
- Heartbeat `{ interval: 10_000, timeout: 5_000, ping: 'ping', pong: 'pong', maxMissedHeartbeats: 2,
  autoStart: false }` — **started manually only after initial sync completes**.
- A given-up socket is revived by `'online'` / `'visibilitychange'` or by the user typing:
  *"unlike before, exhausting the budget no longer strands the socket permanently."*

### 3.2 App-wide realtime — plain JSON over the connection gateway

`apps/web/src/lib/service-clients/service-connection/websocket.ts` (92 lines) — this is the one that
carries CRM/email/channel/presence events.

- Host: `SERVER_HOSTS['connection-gateway']`.
- Serializer: `new JsonSerializer<ToWebsocketMessage, FromWebsocketMessage>()` — **plain JSON**, not
  Bebop.
- Message shape is deliberately loose: `type FromWebsocketMessage = { type: string; data: any }`
  (`websocket.ts:25-28`) with a `// TODO: add type mapping on the websocket event` at `:75`.
- Auth: query-param token on the URL —
  `` `${wsHost}/?macro-api-token=${apiToken}` `` behind the `ENABLE_BEARER_TOKEN_AUTH` flag, else a
  cookie primed by `fetchToken()` (`websocket.ts:31-39`).
- Backoff here is **linear**, not exponential: `LinearBackoff(500, 500)`, `maxRetries(20)`.
- Heartbeat is far more aggressive than the document socket:
  `{ interval: 1_000, timeout: 1_000, maxMissedHeartbeats: 3 }` — **1-second ping**. That is a
  deliberate latency-detection choice: a dead socket is noticed within ~3s.
- Same wake-up triggers: `window.addEventListener('online', …)` and
  `document.addEventListener('visibilitychange', …)` (`websocket.ts:66-72`), with the comment
  *"kick the connection immediately instead of waiting for heartbeat/backoff timers, which may have
  been throttled while the tab was stale."*

**Subscribe semantics** are explicit client→server messages, not implicit. Example from
`apps/web/src/lib/service-clients/service-connection/stream-events.ts:30-40`:

```ts
export function subscribeToStreamState(entity_id: string, entity_type: EntityData['type']) {
  if (!isStreamEntity(entity_type) || subscribed.has(entity_id)) return;
  subscribed.add(entity_id);
  ws.send({ type: 'stream_events', entity_id, entity_type });
}
```

A module-level `Set` dedupes subscriptions; incoming `stream_event` frames are `JSON.parse`d into a
Solid store keyed by `entity_id` (`stream-events.ts:13-22`).

---

## 4. Optimistic mutations — the single most transferable part of this codebase

Macro's inline-edit UX is the same standard Rob has mandated. Here is exactly how they make it not
feel broken.

### 4.1 Nonce-based echo suppression — steal this verbatim

`apps/web/src/lib/queries/nonce.ts` (178 lines). The problem statement in its own header comment:

> 1. Apply the change optimistically to the UI
> 2. Send the request to the server
> 3. Receive a WebSocket event when the server broadcasts the change
> Without deduplication, step 3 would re-apply the change, causing duplicates.

The solution:

1. `onMutate` → `nonce.prepare(vars)` generates `crypto.randomUUID()`, registers it, applies the
   optimistic patch (`nonce.ts:146-153`).
2. `mutationFn` → `nonce.use(vars)` sends the nonce with the request; **throws loudly if `prepare`
   was never called** (`nonce.ts:159-169`) — a bug-catcher, not a silent fallback.
3. Server echoes the nonce in the websocket broadcast.
4. WS handler → `consumeNonce(key, payload.nonce)` returns `true` ⇒ this is my own echo ⇒ **skip the
   cache write** (`nonce.ts:108-127`).
5. `onSettled` → `nonce.cleanup(vars)`.

Safety valve: `NONCE_TTL_MS = 60_000` (`nonce.ts:35`) with a per-entry `setTimeout` so a lost
websocket event cannot leak the nonce forever. `isNonceValid` also lazily expires on read
(`nonce.ts:45-58`).

Consumers: `lib/queries/channel/reaction.ts:214,219`, `lib/queries/channel/message.ts:517,593`,
handlers in `lib/queries/channel/sync.ts:58,153`.

### 4.2 The websocket handler pattern — patch, then soft-invalidate

`apps/web/src/lib/queries/channel/sync.ts:56-137`. The shape is:

```ts
const isExternalUpdate = !consumeNonce(ChannelNonceKeys.MESSAGE, payload.nonce);
if (isExternalUpdate) {
  try { /* surgically patch the TanStack caches */ }
  catch (error) { console.error('Failed to update message cache from websocket:', error); }
}
softInvalidateTargetCaches(...);   // ALWAYS, even for your own echo
```

The `softInvalidateTargetCaches` call is unconditional and the reasoning is documented at
`sync.ts:50-54`:

> "We always call softInvalidateTargetCaches to ensure eventual consistency:
> - Marks query as stale for background refetch when component remounts
> - Handles cross-tab sync where optimistic state may differ
> - Catches edge cases like server-side message modifications"

**This is the key insight:** optimistic patch for instant feel, plus a cheap always-on staleness
marker so you converge to truth without a refetch storm. The patch is wrapped in try/catch so a
malformed event degrades to "stale" rather than crashing the handler.

### 4.3 Normalized entity cache — one write updates every view

`apps/web/src/lib/queries/soup/normalized-cache/` (2,662 lines). Built on `@normy/query-core`
(`apps/web/package.json`), initialised once at startup:
`initSoupNormalizer(queryClient)` (`apps/web/src/lib/queries/client.ts:37`).

- Normalization key extraction: `getNormalizationObjectKey`
  (`normalized-cache/normalizer.ts:20-36`) — only objects shaped
  `{ tag, data, frecency_score }` are normalized, keyed `soup:{id}` with per-tag special cases
  (`channel` → `data.channel.id`, `call` → `data.callId`, else `data.id`).
- **Everything is transactional with an explicit rollback.**
  `normalized-cache/types.ts:3-5`:
  ```ts
  export interface SoupTransaction { rollback(): void; }
  ```
  `optimisticUpdateSoupEntity` (`normalized-cache/operations.ts:75-124`) snapshots every dependent
  query, applies the patch, and returns `{ rollback }`. `onError` calls it. Producers of
  `SoupTransaction`: `insertSoupEntity:196`, `removeSoupEntities:268`, `removeSearchEntities:461`.
- **Precision cancellation.** Before an optimistic write it cancels only the in-flight queries the
  patch touches, via `normalizer.getDependentQueriesByIds([normKey])` — and the comment explains
  why a blanket cancel is wrong (`operations.ts:81-86`):
  > "A blanket cancel strands unrelated in-flight refetches (e.g. an invalidated destination
  > folder's list refetching on mount): the fetch dies and nothing retries it."
- **Cold-fetch guard, learned the hard way** (`operations.ts:48-57`):
  > "Only cancels queries that already have data. Cancelling an in-flight initial fetch
  > (data === undefined) reverts it to a stuck pending/idle state, which leaves the soup view blank
  > on refresh."
- After the field merge it reconciles group membership (`syncGroupedParents`, `syncGroupQueries`,
  `operations.ts:106-112`); date and non-categorical groupings fall back to invalidation.

Test weight tells you how load-bearing this is: `operations.test.ts` is 1,024 lines and
`operations.cancellation.test.ts` is 297 lines.

### 4.4 Callback composition

`apps/web/src/lib/queries/utils.ts` — `withCallbacks(defaults, overrides)` merges default and
caller-supplied `onMutate/onSuccess/onError/onSettled` so a shared mutation hook can own the
optimistic patch + rollback while call sites still add behaviour. Ordering is fixed: defaults first,
then overrides.

### 4.5 Durable optimistic mutations (flagged path only)

Inside the WASM cache there is a real durable queue — `crates/client/cache-core/src/queue.rs` (193
lines):

- `StoredMutation { request, attempt_count, next_attempt_at_ms, lease_owner, lease_generation,
  lease_expires_at_ms, last_error, created_at_ms }` (`queue.rs:31-49`).
- **Lease-based single-flight**: `claimNextMutation(owner, nowMs, leaseExpiresAtMs)`,
  `deferOptimisticWrite(txId, leaseOwner, leaseGeneration, nextAttemptAtMs, error)`,
  `commitOptimisticWrite`, `rollbackOptimisticWrite`
  (`apps/web/src/lib/graphql-cache/worker/wasm-module.ts:59-84`). `lease_generation` rejects stale
  attempt results.
- Applied **strictly in enqueue order**, restored across restarts; retryability decided by an
  exchange callback; *"Each queued network attempt has a one-minute timeout, comfortably inside its
  five-minute lease"* (`plan.md:98-103`).
- Auth credentials are deliberately **excluded** from the persisted request —
  *"replay reconstructs an operation using the current client configuration"* (`queue.rs:1-6`).
- Caller-facing outcome is a three-way disposition, not a boolean
  (`apps/web/src/lib/graphql-cache/exchange/optimistic.ts:99-103`):
  ```ts
  type OptimisticMutationDisposition<TData> =
    | { kind: 'committed'; data: TData }
    | { kind: 'queued'; transactionId: string }
    | { kind: 'permanently-failed'; error: CombinedError };
  ```

That `queued` state is the honest UX primitive most apps skip. **Note again: this is flag-gated and
Phase 5/6 incomplete.**

### 4.6 Conflict handling — the honest answer

For non-document data there is **no CRDT, no vector clock, no version column, no CAS** on the client
path. It is last-write-wins at the server, and the client converges by soft-invalidate + refetch. The
only conflict machinery in the product is inside Loro, for document text.

---

## 5. Presence, broadcast, multiplayer

Two distinct mechanisms, again split along the document/app-data line.

### 5.1 Document awareness — Loro `EphemeralStore`, 10s TTL

`packages/collaboration/src/collab/awareness.ts` (279 lines).

- `DEFAULT_AWARENESS_TIMEOUT = 10_000` (`awareness.ts:12`) — *"The default timeout for a user's
  awareness is 10 seconds."* Backed by `new EphemeralStore<...>(timeout)` from `loro-crdt`
  (`awareness.ts:95-97`). **Expiry is automatic; a dead tab's cursor vanishes on its own** — no
  explicit disconnect message required. This is the right shape for presence and worth copying
  conceptually.
- Per-peer payload: `{ user: { userId, color, peerId }, selection }` (`awareness.ts:14-17`).
  Colour is assigned client-side at random from a palette:
  `getRandomPaletteColor()` (`awareness.ts:100`, `packages/collaboration/src/internal/palette.ts`).
- **Selections need a codec** because a `LoroCursor` is a wasm pointer and is not structured-clonable
  (`awareness.ts:24-50`) — `SelectionCodec.encode/decode` handles it.
- Remote peers are filtered to those with a non-undefined selection (`awareness.ts:130-134`), so
  idle viewers don't render ghost cursors.
- There is a documented upstream workaround: `store.subscribe` is wrapped in `queueMicrotask`
  because *"loro-crdt has a bug with `EphemeralStore.subscribe` which breaks recursive aliasing"*
  (`awareness.ts:208-214`).
- Transport: `PeerAwareness { byte[] awareness }` / `RemoteAwareness { byte[] awareness }` on the
  Bebop socket, plus a same-origin `BroadcastChannelChatter` for cross-tab
  (`packages/collaboration/src/collab/chatter.ts`, wired at `engine.ts:134-142`).

### 5.2 "Who's viewing this record" — app-level, and this is the CRM-relevant one

`apps/web/src/lib/core/state/liveIndicators.ts` (36 lines, whole file matters):

```ts
type IndicatorStore = Record<string, string[]>;          // entity_id -> user_ids
const [indicatorStore, setIndicatorStore] = createStore<IndicatorStore>({});

const trackingUpdate = z.object({
  entity_id:   z.string(),
  user_ids:    z.array(z.string()),
  entity_type: z.string(),
});

createWebsocketEventEffect(ws, 'user_tracking_change', (data) => {
  if (!ENABLE_LIVE_INDICATORS) return;
  const update = trackingUpdate.parse(JSON.parse(data.data));
  setIndicatorStore(update.entity_id, update.user_ids);
});
```

Notes: it is **server-computed** (the server sends the full `user_ids` array for an entity, the
client does not do set arithmetic), it is **zod-validated at the boundary**, and it is
**feature-flagged** (`ENABLE_LIVE_INDICATORS`). This is 36 lines for "who else is on this record" —
exactly what Rob needs for multi-rep, and it is trivially reproducible.

Typing indicators live separately in `apps/web/src/lib/queries/channel/typing.ts` (234 lines).

### 5.3 Cross-tab coordination

- `tab-election` for singleton work: `apps/web/src/features/notifications/notification-election.ts:8`
  — `tab.waitForLeadership(...)` so only one tab owns notification handling.
- `BroadcastChannel` for auth (`apps/web/src/lib/core/auth/channel.ts:18`,
  `apps/web/src/routes/Root.tsx:374`), licence updates
  (`apps/web/src/lib/core/util/licenseUpdateBroadcastChannel.ts:1`), and favicon badge
  (`apps/web/src/components/app/ReactiveFavicon.tsx:20`).
- The WASM cache sidesteps all of this by using a SharedWorker singleton (`plan.md:177-182`).

---

## 6. Why it actually feels fast — evidence-based

Ranked by my estimate of contribution to perceived speed.

1. **SolidJS fine-grained reactivity, no VDOM.** `solid-js ^1.9.7`, `@solidjs/router ^0.15.3`
   (`apps/web/package.json`). An optimistic field patch re-renders one text node, not a subtree.
   This is a structural advantage React has to work to match.
2. **Normalized entity cache** (§4.3). One patch to entity X instantly updates every list, board,
   sidebar and detail pane referencing X, with zero refetch. This is the biggest *architectural*
   contributor.
3. **Aggressive but bounded staleness.** `apps/web/src/lib/queries/client.ts:9-13`:
   `staleTime: 5 min`, `gcTime: 10 min`, **`refetchOnWindowFocus: false`**, and
   `retry: (n, e) => (isAuthError(e) ? false : n < 1)`. Alt-tabbing back does not trigger a refetch
   storm; auth failures are terminal rather than retried into the ground.
4. **Optimistic-everything with real rollback** (§4). 60 `onMutate` call sites, 144 `setQueryData`
   call sites across `apps/web/src`.
5. **Instant local search + debounced server search, running in parallel.**
   `apps/web/src/features/next-soup/soup-view/create-search-state.ts:243-330`: two independent
   debounces (`LOCAL_FUZZY_SEARCH_DEBOUNCE_MS` vs `SEARCH_SERVICE_DEBOUNCE_MS`), local fuzzy over
   an in-memory `entityPool()` via `@leeoniya/ufuzzy`, server search via
   `useSearchSoupQuery({ page_size: 100 })` gated on `isSearchServiceDebounceSettled()`. You get
   characters-per-keystroke feedback locally while the authoritative result lands behind it.
6. **Preload intent on block types.** `apps/web/src/lib/core/block.ts:280` —
   `type Intent = 'initial' | 'native' | 'navigate' | 'preload'`. Every block definition
   short-circuits on `intent === 'preload'` to warm its code/chunk without doing the full load:
   `features/block-md/definition.ts:34`, `block-pdf:34`, `block-image:31`, `block-video:64`,
   `block-chat:32`, `block-canvas:29`, `block-automation:14`, `block-unknown:21`. Handled at
   `apps/web/src/lib/core/internal/BlockLoader.tsx:84`.
7. **Explicit query prefetching** at navigation seams:
   `apps/web/src/features/channel/Channel/Channel.tsx:280` and
   `create-channel-find-bar.ts:131-146`, with the note *"`prefetchQuery` is a no-op when the cached
   entry is fresh (staleTime is …)"*.
8. **Virtualization** via `virtua 0.48.8` and `@tanstack/solid-virtual` across ~20 files, notably
   `features/next-soup/soup-view/soup-view.tsx`.
9. **Off-main-thread work.** SharedWorker for the cache (`graphql-cache/host/worker-host.ts:110`),
   plus dedicated workers for PDF.js (`features/block-pdf/definition.ts:13`), HEIC decoding
   (`lib/core/heic/service.ts:7`, pooled in `heic/workerPool.ts`), and zip/folder upload
   (`lib/core/client/zipWorkerClient.ts:3`).
10. **Scroll and navigation debouncing.** `debounce` from `@solid-primitives/scheduled` at
    `soup-view.tsx:945` (`debouncedFetchMore`, wired to `onScrollBottom` at `:1327`) and
    `use-soup-navigation-hotkeys.ts:64` (`openInViewerDebounced` — hold arrow-down through a list
    without opening every row).
11. **Fast failure detection.** 1s heartbeat on the app socket (§3.2) plus `online`/
    `visibilitychange` wake-ups mean the "you're offline" state is correct within seconds, which
    *reads* as responsiveness.
12. **Warm start on selected data** — 7-day IDB restore for channels/email/mobile-soup (§2 Layer C).

Note what is **not** on this list: the WASM cache (flagged off), and CRDTs (editor only).

---

## 7. Honest verdict: CRDT/local-first vs good frontend engineering

**~20% local-first, ~80% frontend craft — and the 80% is portable to any stack.**

| Contributor | Category | Weight |
|---|---|---|
| SolidJS fine-grained reactivity | Frontend engineering | High |
| Normalized entity cache + transactional rollback | Frontend engineering | High |
| Optimistic mutations + nonce echo suppression | Frontend engineering | High |
| staleTime/gcTime discipline, no focus-refetch | Frontend engineering | Medium-High |
| Dual local+server search | Frontend engineering | Medium |
| Preload intents, prefetch, virtualization, workers | Frontend engineering | Medium |
| Loro CRDT + WAL + snapshots | Local-first | **Editor only** |
| WASM/IDB normalized cache | Local-first | **Flagged off, incomplete** |

Three things make me confident in this read:

1. Loro appears in 10 of thousands of files, all editor-adjacent.
2. The most ambitious local-first component (`crates/client`, 10.6k lines of Rust) is explicitly
   *"needs manual smoke test"*, Phase 5–6 unfinished, and behind `ENABLE_GRAPHQL_SOUP`. Macro ships
   fast *today* without it.
3. The design doc's own stated motivation for that cache is **bounded memory**, not speed:
   *"graphcache hydrates and keeps the entire cache in browser memory … that is not acceptable"*
   (`plan.md:8-11`). It is a scaling fix, not a latency fix.

The Rust services buy Macro *scale and cost*, not per-interaction latency. A rep clicking a field
does not care whether the write lands in Rust or in a Vercel function — they care that the pixel
changed in <16ms and never lied to them.

---

# PART II — Getting 80% of Macro's perceived speed on Supabase + Next.js

## 8. Where the MLE ROB Dashboard is today

Read from `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard`.

**Stack** (`package.json`): Next.js `16.2.10`, React `19.2.4`, `@supabase/supabase-js ^2.110.0`,
Tailwind 4. **No TanStack Query. No realtime. No client cache.**

**The inline-edit UX is already right in spirit.** `components/inline/fields.tsx:1-6`:

> "Inline click-to-edit field kit — the Attio/Linear standard (Rob 2026-07-17: 'I should just be able
> to go over to what I want to edit and edit it without even hitting save'). Every field: click →
> edit in place → autosave on blur or Enter, Esc cancels, optimistic UI, amber pulse on save.
> No modes. No Save buttons."

And `useSyncedState` (`fields.tsx:50-60`) is a correct implementation of the
"adjust state when a prop changes" pattern — render-phase reset, not an effect. That is good code.

**But there are three architectural problems that will make it feel slow, and they compound.**

### Problem 1 — `router.refresh()` after every keystroke-save

`components/inline/fields.tsx:30`, inside `useRecordSave`:

```ts
const r = await fetch("/api/admin/people", { method: "PATCH", ... });
if (!r.ok) throw new Error(String(r.status));
setState("saved");
router.refresh();          // ← re-runs the ENTIRE server component tree
```

Also at `components/PeopleTable.tsx:88,108` and `components/CsvButtons.tsx:77`.

`router.refresh()` re-executes the whole route's RSC tree on the server and streams a fresh payload.
Editing one cell in a table of 500 people re-renders and re-serializes all 500 rows. Every
single field edit. This is the number one perceived-speed defect.

### Problem 2 — `force-dynamic` + unbounded full-table `select("*")`

`app/people/page.tsx:9`:
```ts
export const dynamic = "force-dynamic";
```
and `lib/storage/supabaseStore.ts:192-201`:
```ts
async getNetwork(): Promise<NetworkData> {
  const [people, edges, verticals, projects, orgs] = await Promise.all([
    s.from("people").select("*"),
    s.from("edges").select("*"),
    s.from("verticals").select("*"),
    s.from("projects").select("*"),
    split ? s.from("orgs").select("*") : Promise.resolve({ data: [], error: null }),
  ]);
```

Five unbounded, unprojected, uncached full-table scans on **every page load and every
`router.refresh()`**. There is no `.limit()`, no column projection, no `.range()`. At 500 records
it's survivable; at 5,000 with edges it is not, and the cost is paid on *every keystroke-save*
because of Problem 1.

### Problem 3 — the optimistic state and the refresh fight each other

`useSyncedState` resets local state whenever the server prop changes. `router.refresh()` guarantees
the prop changes ~300–1500 ms after every edit. So the user sees: type → instant local value →
(pause) → value re-set from server. If two reps edit the same row, or if the server round-trip is
slow, the field visibly flickers or reverts. With Phase 4 multi-rep, this gets worse.

---

## 9. The plan — ranked by impact ÷ effort

Each item names the Macro pattern it ports, the library, and the file to touch.

### TIER 1 — do these first (highest impact, lowest effort)

---

#### 1.1 Kill `router.refresh()`. Introduce TanStack Query as the client cache.
**Impact: massive. Effort: 1–2 days. This single change is most of your 80%.**

Install `@tanstack/react-query ^5`. Convert the list pages from "RSC fetches everything +
`force-dynamic`" to "RSC renders shell + hydrated client query".

Macro's config, which you should copy nearly verbatim
(`apps/web/src/lib/queries/client.ts:7-26`):

```ts
// lib/query/client.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,     // 5 min — Macro's number
      gcTime:    1000 * 60 * 10,    // 10 min
      refetchOnWindowFocus: false,  // ← the one that stops alt-tab refetch storms
      retry: (failureCount, error) =>
        isAuthError(error) ? false : failureCount < 1,
    },
  },
});
```

Then `useRecordSave` becomes a `useMutation` with `onMutate` / `onError` rollback / `onSettled`
invalidate, and **`router.refresh()` disappears entirely**. Use Next's
`HydrationBoundary` + `dehydrate` so the first paint is still server-rendered.

> Why not React 19 `useOptimistic` + Server Actions? Because `useOptimistic` state is scoped to one
> component and evaporates when the action settles — it cannot express "this contact's name changed,
> update it in the table, the detail pane, the deals board, and the network graph." That needs a
> shared normalized cache. Use `useOptimistic` for isolated single-field widgets only.

---

#### 1.2 Normalize entities so one edit updates every view
**Impact: very high. Effort: 1 day.**

This is Macro's §4.3 and it is what makes their inline edits feel magical. They use
`@normy/query-core` (`apps/web/package.json`), initialised in one line
(`apps/web/src/lib/queries/client.ts:37`).

For Rob: `@normy/react-query` — swap `QueryClientProvider` for `QueryNormalizerProvider`, ensure
every entity object carries a stable `id`, and mutation responses automatically patch every query
holding that entity. No manual `setQueryData` fan-out across People / Companies / Deals / Network.

A person's `status` flipping from `warm` to `lit` should repaint the row, the badge, the KPI tile
and the graph node — from one write.

If you'd rather not add a dependency, hand-roll the narrower version: a
`updatePersonEverywhere(id, patch)` helper that walks `queryClient.getQueriesData(['people'])`. But
`@normy` is ~5 KB and does it correctly.

---

#### 1.3 Column projection + pagination + a materialized read model
**Impact: high. Effort: half a day.**

Replace `select("*")` in `lib/storage/supabaseStore.ts:196-200` with explicit column lists, and
paginate:

```ts
s.from("people")
 .select("id,name,status,vertical_id,quoted,signed,met,contribution")  // list needs ~8 cols
 .order("contribution", { ascending: false })
 .range(0, 99);
```

Fetch the full row only on the detail route (`app/people/[id]`). Add the indexes to match.

You already have `lib/readModel/` — lean on it. A Postgres view or materialized view that
pre-joins people↔edges↔verticals and pre-computes `contribution` removes the client-side
`reconcileLedger`/`splitLedger` work in `app/people/page.tsx:16-17` from the hot path.

Drop `export const dynamic = "force-dynamic"` where you can; with TanStack owning freshness you no
longer need to defeat every layer of caching.

---

#### 1.4 Optimistic mutation with real rollback + the "always soft-invalidate" rule
**Impact: high. Effort: half a day.**

Port Macro's exact shape (`normalized-cache/operations.ts:75-124` + `channel/sync.ts:50-54`):

```ts
const useSaveField = (personId: string) => useMutation({
  mutationFn: (changes) => patchPerson(personId, changes),

  onMutate: async (changes) => {
    // Macro's precision-cancel: only the queries this patch touches,
    // and ONLY ones that already have data (operations.ts:48-57 — cancelling
    // a cold initial fetch leaves the query stuck pending and the view blank).
    await queryClient.cancelQueries({
      queryKey: ['person', personId],
      predicate: q => q.state.data !== undefined,
    });
    const previous = queryClient.getQueryData(['person', personId]);
    queryClient.setQueryData(['person', personId], old => ({ ...old, ...changes }));
    return { previous };                       // ← the SoupTransaction equivalent
  },

  onError: (_e, _v, ctx) => {
    queryClient.setQueryData(['person', personId], ctx.previous);   // rollback
    toast.error('Save failed — change reverted');                   // TELL THE USER
  },

  // Always mark stale, even on success. Cheap, and it converges cross-tab drift.
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['person', personId] }),
});
```

Two Macro lessons baked in:
- **Rollback must be visible.** A silent revert is worse than an error — the rep thinks it saved.
  Macro's `permanently-failed` disposition (`exchange/optimistic.ts:99-103`) exists precisely so the
  UI can say so.
- **The cold-fetch cancel guard** (`operations.ts:48-57`) is a real bug they hit. Take the free fix.

---

### TIER 2 — do these when Phase 4 (logins/multi-rep) lands

---

#### 2.1 Supabase Realtime + nonce echo suppression
**Impact: high once >1 rep. Effort: 1 day.**

Supabase Realtime `postgres_changes` is your `connection_gateway`. The moment two reps are live, you
need Macro's §4.1 nonce pattern or every rep's own edit will bounce back and clobber their in-flight
typing.

**Reimplement `apps/web/src/lib/queries/nonce.ts`** — 178 lines, dependency-free, ~40 lines of real
logic (a `Map<key, Map<nonce, {expiresAt, timerId}>>` plus register/consume/cleanup). Write it from
the behaviour described here rather than copying the AGPL file (§15). Then:

1. Add a `last_mutation_nonce text` column to `people` / `companies` / `deals`.
2. `onMutate` → `const nonce = crypto.randomUUID(); registerNonce('person', nonce)`.
3. PATCH writes `last_mutation_nonce = nonce` in the same `UPDATE`.
4. Realtime handler:

```ts
supabase.channel('crm')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people' }, (payload) => {
    const isExternal = !consumeNonce('person', payload.new.last_mutation_nonce);
    if (isExternal) {
      try {
        queryClient.setQueryData(['person', payload.new.id], mapRow(payload.new));
      } catch (e) { console.error('realtime patch failed', e); }   // degrade, don't crash
    }
    // Macro's rule (channel/sync.ts:50-54): ALWAYS soft-invalidate, even for your own echo.
    queryClient.invalidateQueries({ queryKey: ['person', payload.new.id], refetchType: 'none' });
  })
  .subscribe();
```

Keep the 60-second TTL (`nonce.ts:35`) so a dropped Realtime event can't leak a nonce forever.

**Enable RLS before you enable Realtime.** Supabase Realtime respects RLS on `postgres_changes`,
which is your equivalent of Macro's `entity_access` ACL filtering — but only if the policies exist.

---

#### 2.2 Invalidate-everything on reconnect
**Impact: medium-high. Effort: 15 minutes.**

Macro's entire strategy for "we may have missed events while disconnected" is 10 lines
(`apps/web/src/lib/queries/invalidate-on-reconnect.ts`, whole file):

```ts
createReconnectEffect(ws, () => { void queryClient.invalidateQueries(); });
```

Do the same on Supabase channel `SUBSCRIBED` (after a prior `CLOSED`/`CHANNEL_ERROR`), plus
`window.addEventListener('online', ...)` and `visibilitychange`. Macro added those wake-up listeners
explicitly because *"heartbeat/backoff timers … may have been throttled while the tab was stale"*
(`service-connection/websocket.ts:66-72`). Background-tab timer throttling is real and will bite you.

Do **not** build version-vector backfill. That is document-CRDT machinery. "Refetch what's on
screen" is correct for a CRM.

---

#### 2.3 Presence — "who's viewing this record"
**Impact: medium (high delight-per-line). Effort: 2 hours.**

Macro's `liveIndicators.ts` is **36 lines**. Supabase Realtime Presence gives you the same thing with
less code — it is built on CRDT state with automatic expiry, which is the property that matters
(Macro's Loro `EphemeralStore` uses a 10s TTL, `awareness.ts:12`; you never send an explicit "I left"
message, you just stop heartbeating).

```ts
const ch = supabase.channel(`person:${personId}`, { config: { presence: { key: userId } } });
ch.on('presence', { event: 'sync' }, () => setViewers(Object.keys(ch.presenceState())))
  .subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ name, avatar }); });
```

Copy two details from Macro:
- **Validate at the boundary.** They zod-parse the payload (`liveIndicators.ts:22-26`). Presence
  payloads are attacker-influencable once you have real logins.
- **Feature-flag it** (`ENABLE_LIVE_INDICATORS`, `liveIndicators.ts:29`) so you can kill it without a
  deploy if it misbehaves.

Also gate typing/field-focus presence behind the same flag if you add it — Macro keeps that in a
separate 234-line module (`channel/typing.ts`) for a reason.

---

### TIER 3 — polish, once the above is stable

---

#### 3.1 Hover-prefetch on table rows
**Effort: 1 hour.** Macro prefetches at navigation seams
(`features/channel/Channel/Channel.tsx:280`) and preloads block chunks on `intent === 'preload'`
(`lib/core/block.ts:280`).

For Rob: on `onMouseEnter` of a `PeopleTable` row, `queryClient.prefetchQuery(['person', id])` and
`router.prefetch('/people/' + id)`. `prefetchQuery` is a no-op when the entry is fresh — Macro notes
exactly this at `create-channel-find-bar.ts:131`. Users hover ~200–400 ms before clicking; that's
your entire round trip, hidden.

#### 3.2 Instant local search + debounced server search
**Effort: half a day.** Macro's dual-track pattern
(`create-search-state.ts:243-330`): two debounces, local fuzzy over the in-memory pool renders
immediately, the server query lands behind it.

You already ship `lib/search.ts` and `components/SearchBar.tsx`. Add `@leeoniya/ufuzzy` (~5 KB,
what Macro uses) over the already-loaded page of people, render those instantly, and fire the
Supabase full-text query on a longer debounce. Never make the user watch a spinner for a query that
could be answered from memory.

#### 3.3 Virtualize the tables
**Effort: 2 hours, only when a list exceeds ~200 rows.** `@tanstack/react-virtual`
(Macro uses `virtua` + `@tanstack/solid-virtual` across ~20 files). Below 200 rows this is premature.

#### 3.4 Selective IndexedDB persistence for warm starts
**Effort: 2 hours.** `@tanstack/query-persist-client-core` + an IDB persister.

Copy Macro's discipline, not their ambition (`persistence-scopes.ts`, `persistence.ts:52-58`):
- **Allowlist, don't blanket-persist.** Macro persists exactly four scopes and only two on web.
  Rob's allowlist: the people list, companies list, verticals. Nothing else.
- **maxAge 7 days** and a **buster keyed to app version** — `import.meta.env.__APP_VERSION__`
  becomes `process.env.NEXT_PUBLIC_BUILD_ID`. A deploy invalidates everything, which is what you
  want when types change.
- **Per-query entries, not one blob** (`persistence.ts:117-120`) — a blob write on every mutation is
  a main-thread jank source.
- **Guard the restore race** (`persistence.ts:70-72, 91-92`): re-check for fresh data *after* the
  await, or a slow IDB read will overwrite a fast network response with stale data.

#### 3.5 Cross-tab singleton for Realtime
**Effort: 1 hour, only if a rep runs many tabs.** Macro uses `tab-election`
(`notification-election.ts:8`) so one tab owns notifications. If reps keep 6 tabs open, 6 Realtime
subscriptions is wasteful; elect a leader and fan out via `BroadcastChannel`. Defer until observed.

---

## 10. Explicitly SKIP these Macro ideas

For a <50-user internal CRM, every one of these is negative ROI.

| Macro thing | Where | Why skip |
|---|---|---|
| **Loro / any CRDT for record data** | `packages/loro-mirror`, `packages/collaboration` | Solves concurrent *character-level text* editing. Two reps editing different fields is solved by per-column last-write-wins in Postgres. Macro themselves don't use it for CRM data — only 10 files in the whole app touch Loro. Adds a wasm bundle and a merge model you'd have to debug. **Exception:** if you ever build a shared long-form notes/proposal editor, revisit — and then use upstream `loro-mirror`, not Macro's fork. |
| **WASM normalized cache (`crates/client`)** | 10,614 lines of Rust across 4 crates | Motivated by *"10s of thousands of cached objects"* (`plan.md:8-11`). You have hundreds. `@normy/react-query` gives you the normalization benefit in ~5 KB. Also: still flagged off and Phase 5–6 incomplete *at Macro*. |
| **SharedWorker cache topology** | `graphql-cache/host/worker-host.ts:110`, `plan.md:177-190` | Only needed for an engine too heavy to instantiate per tab. A JS cache per tab is fine. Note their own fallback for no-SharedWorker browsers is *no cache at all*. |
| **Bebop binary wire protocol** | `sync-service/generated/schema.bop` | Justified for high-frequency binary CRDT deltas. Your payloads are JSON rows at human-click frequency. Supabase Realtime's JSON is correct. Note Macro's *own* app-data socket uses `JsonSerializer` (`service-connection/websocket.ts:41-43`). |
| **Version-vector reconnect backfill** | `PeerRequestSince{vv}` / `RemoteUpdateSince{update,vv}` | Document-CRDT machinery. `invalidateQueries()` on reconnect is the correct CRM answer — it is literally what Macro does for app data (`invalidate-on-reconnect.ts`). |
| **Write-ahead log + 5s snapshots** | `collab/wal.ts`, `engine.ts:31` | Offline editing durability for documents. Your reps are online; a failed save with a visible error + retry is honest and 200× cheaper. |
| **Durable lease-based mutation queue** | `cache-core/src/queue.rs` | Leases, generations, attempt timeouts, replay ordering — that's distributed-systems weight for offline-first mobile. Retry-with-backoff + a visible error toast covers your case. **Do borrow the vocabulary**: `queued` as a distinct UI state from `saved`/`failed`. |
| **Any Rust service** | `services/*`, `crates/*` (166 crates) | Stated non-goal. Supabase + Vercel Functions handle <50 users with enormous headroom. |
| **Tauri/SQLite desktop host** | `apps/web/tauri/graphql_cache_plugin` | No desktop app. |
| **Custom websocket runtime** | `packages/collaboration/src/websocket/` (~20 files: backoff, heartbeat, buffer, serializer, builder) | Supabase Realtime already implements reconnect + heartbeat + backoff. Do **steal one idea**: manual `online` / `visibilitychange` reconnect kicks (`service-connection/websocket.ts:66-72`), because throttled background-tab timers are a genuine cross-library problem. |
| **Anonymous-uuid cache scoping + identity witnessing** | `plan.md:74-91`, `graphql-cache/scope.ts` | Elegant, but it exists to avoid PII in enumerable IDB names across a multi-tenant consumer product. Internal CRM with real logins: just clear the cache on logout. |

---

## 11. Expected outcome

Doing Tier 1 alone (≈3 days):

| Interaction | Today | After Tier 1 |
|---|---|---|
| Edit a field | Optimistic paint, then full RSC tree re-render + 5 full-table scans (~300–1500 ms), possible visible revert | Optimistic paint, single-row PATCH, no re-render of anything else. Rollback + toast on failure. |
| Navigate People → person detail | Full `force-dynamic` server round trip | Cache hit (5 min staleTime) → instant; background revalidate |
| Return to a visited page | Full round trip | Instant from cache; no focus-refetch storm |
| Page load | 5 unbounded `select("*")` | Projected + paginated first page |
| Same person edited in two places on screen | Only the edited widget updates | Every view updates from one write (normalization) |

Tier 2 (+2 days) adds multi-rep live updates without echo bugs, and presence.

That is comfortably 80% of Macro's perceived speed, on Supabase + Next.js, with no Rust and no CRDT.

The remaining 20% is SolidJS's structural advantage over React's reconciler and the WASM disk cache
— and neither is worth chasing for an internal CRM.

---

## 12. File reference index

**Macro — steal from these**
- `apps/web/src/lib/queries/nonce.ts` (178 L) — nonce echo suppression. **Reimplement from the described behaviour (AGPL — see §15), don't copy the file.**
- `apps/web/src/lib/queries/channel/sync.ts` (esp. `:50-54`, `:56-137`) — patch-then-soft-invalidate.
- `apps/web/src/lib/queries/soup/normalized-cache/operations.ts` (`:48-57`, `:75-124`) — transactional optimistic update + cancel guards.
- `apps/web/src/lib/queries/soup/normalized-cache/types.ts` — `SoupTransaction { rollback() }`.
- `apps/web/src/lib/queries/client.ts` (`:7-26`) — QueryClient defaults.
- `apps/web/src/lib/queries/persistence.ts` + `persistence-scopes.ts` — selective IDB persistence.
- `apps/web/src/lib/queries/invalidate-on-reconnect.ts` (10 L) — reconnect strategy.
- `apps/web/src/lib/core/state/liveIndicators.ts` (36 L) — who's-viewing presence.
- `apps/web/src/lib/service-clients/service-connection/websocket.ts` (`:66-72`) — wake-up reconnect.
- `apps/web/src/features/next-soup/soup-view/create-search-state.ts` (`:243-330`) — dual search.
- `apps/web/src/lib/queries/utils.ts` — `withCallbacks` composition.

**Macro — read for understanding, do not port**
- `apps/web/docs/graphql-normalized-cache-plan.md` (406 L) — outstanding design doc; Appendix A's IDB-vs-OPFS benchmarks are worth reading regardless.
- `crates/client/cache-core/src/queue.rs` — durable mutation queue model.
- `apps/web/src/lib/graphql-cache/exchange/optimistic.ts` (`:99-103`) — three-way mutation disposition.
- `packages/collaboration/src/sync-service/generated/schema.bop` — Bebop CRDT protocol.
- `packages/collaboration/src/sync-service/socket.ts` (`:44-70`) — reconnect/backoff/buffer rationale.
- `packages/collaboration/src/collab/wal.ts`, `collab/engine.ts`, `collab/awareness.ts`.
- `packages/loro-mirror/**` — MIT, generic, upstream at `github.com/loro-dev/loro-mirror`.

**MLE ROB Dashboard — change these**
- `components/inline/fields.tsx:30` — remove `router.refresh()`; convert `useRecordSave` to `useMutation`.
- `components/PeopleTable.tsx:88,108` and `components/CsvButtons.tsx:77` — same.
- `lib/storage/supabaseStore.ts:192-213` — column projection + pagination.
- `app/people/page.tsx:9` — reconsider `force-dynamic`.
- `lib/readModel/` — push `reconcileLedger`/`splitLedger` work into a Postgres view.

---

## 13. Server-side appendix — what actually runs

This section materially changes the picture of "Macro's Rust sync service" and reinforces the
recommendation to skip it.

### 13.1 There are three realtime systems, and one of them is dead code

| System | Runtime | Wire format | Purpose |
|---|---|---|---|
| **sync-service** | **Cloudflare Worker + Durable Object (Rust→WASM)** | Bebop binary | Loro CRDT documents |
| **connection_gateway** | Axum (Rust), multi-replica | JSON text | Per-user notifications, invalidation, entity presence |
| **services/websocket-service** | Bun | — | **Stub.** 23 lines: `Bun.serve` on port 6969 that logs "Client connected" and replies `"ping"` to everything (`services/websocket-service/src/index.ts:13-16`). No protocol, no auth, no persistence. |

The document sync service is **not a server you run** — it is a Cloudflare Durable Object. That is
worth internalising: Macro didn't build a Rust sync fleet, they leaned on CF's DO primitive, where
"one object instance per document" gives you sharding, single-writer serialization, and in-process
fan-out for free.

### 13.2 sync-service — Durable Objects as the sharding strategy

- Sharding is literally CF's `id_from_name` on the document id
  (`services/sync-service/src/cf_worker.rs:155-158`). Every socket for a document lands on one DO
  instance, so fan-out is a synchronous in-process loop.
- Subscribe = open `/document/{document_id}/connect?token=…`
  (`services/sync-service/src/durable_object.rs:641-720`). There is **no subscribe message** in the
  Bebop union — the URL is the subscription.
- Sockets are **hibernatable**: `state.accept_websocket_with_tags(&pair.server, &[&ws_id])`
  (`durable_object.rs:662-663`), with per-socket metadata persisted under the tag.
- Fan-out (`services/sync-service/src/websocket.rs:154-169`) loops `get_websockets()` excluding the
  sender; a failed send is logged and skipped so one dead socket can't abort delivery to the rest.
- The Bebop schema is served at runtime (`GET /schema`, `cf_worker.rs:33`) and the TS client
  regenerates from it (`packages/collaboration/scripts/generate-schema.ts`). Rust codegen is
  **checked in, not generated** — the `bebop::build_schema_dir(...)` call is commented out in
  `services/sync-service/build.rs:2-4`.

**Persistence is all Cloudflare primitives — no Postgres, no S3, no Kafka for CRDT data:**

- **Snapshots:** DO SQLite (default feature `do-sqlite-snapshot-storage`,
  `services/sync-service/Cargo.toml:10`) — table
  `kv_store (id TEXT, chunk INTEGER, data BLOB, PRIMARY KEY(id, chunk))`
  (`src/storage/backends/durable_sql.rs:19-25`), chunked at 1.5 MB (`CHUNK_SIZE = 1_572_864`,
  line 14), with read-through fallback to Worker KV for migration
  (`storage/backends/combined_sql_kv.rs:21-36`). R2 backend exists but is feature-gated off.
- **Op log:** DO KV with two prefixes (`storage/backends/durable_kv.rs:31-35`) — `"o/"` = pending
  ops, `"a/"` = **all ops, kept forever**, with the verbatim comment *"We keep all ops because we
  have been losing data."* Keys are time-ordered `format!("{ts:016x}.{i:08x}")`.
- **Compaction is alarm-driven** (`durable_object.rs:984-1050`): dirty-check → export full snapshot
  → `clear_applied_ops()` (deletes `"o/"`) → `mark_exported()` → re-arm. Cadence 5s
  (`bump_alarm`, `durable_object.rs:300-313`).
- There is an explicit anti-regression note at `durable_object.rs:1036-1040`: pushing a full
  snapshot to every client on every alarm tick was **removed** because it "only burned bandwidth and
  stalled clients on large documents." Good lesson — don't broadcast snapshots on a timer.

**Auth:** HS256 JWT minted by document_storage_service
(`crates/documents/src/domain/permission_token.rs:28-37`), TTL 3600s
(`crates/macro_sync_service_jwt/src/lib.rs:15`), verified in `services/sync-service/src/auth.rs:74-131`.
Token arrives in the **query string** for `/connect`, `Authorization: Bearer` for REST. The browser
fetches a **fresh token on every reconnect** via the `UrlResolver` thunk
(`apps/web/src/lib/service-clients/service-sync/source/helpers.ts:35-55`), refreshing 60s before
expiry (`apps/web/src/lib/core/signal/token.ts:8`).

**Server-side awareness TTL is 5s, not 10s** — `EphemeralStore::new(5_000)`
(`durable_object.rs:909`); the client uses 10s (`awareness.ts:12`). On socket close the server
explicitly deletes each bound peer's awareness and broadcasts the tombstone
(`durable_object.rs:1052-1072`), so presence clears immediately rather than waiting out the TTL.
The server **re-broadcasts the whole store**, not a delta (`websocket.rs:173-183`).

**No compression anywhere.** Grepping `compress|deflate|gzip|zstd|permessage` across
`packages/collaboration/src`, `services/sync-service/src` and `services/connection_gateway/src`
returns zero hits. Loro's binary encoding is the only size reduction.

**Backpressure is largely absent on the document path.** The client buffer is unbounded on purpose
(`sync-service/socket.ts:56-61`); `bufferedAmount` is exposed but never read; the server has no
queue at all and `MAX_MESSAGE_SIZE = 1_000_000` (`websocket.rs:70`) only *warns* and continues.
Meanwhile `crates/broadcast/src/lib.rs` is a properly-engineered fan-out primitive — per-key
`tokio::broadcast` + bounded per-subscriber mpsc with `ExitReason::{SlowConsumer, Lagging{skipped}}`
(lines 61-67) and `try_send`→disconnect-on-full (lines 121-128) — **and sync-service does not use
it.** A reminder that even excellent teams ship uneven internals.

### 13.3 connection_gateway — the pattern closest to Rob's Supabase Realtime

This is the app-data bus, and its design is instructive because it solves the problem Supabase
Realtime solves for you.

- **Envelope:** `struct Message { #[serde(rename="type")] message_type: String, data: String }`
  (`services/connection_gateway/src/model/message.rs:5-10`) — `data` is a *double-encoded* JSON
  string, which is why the client does `JSON.parse(data.data)`
  (`apps/web/src/lib/core/state/liveIndicators.ts:31`).
- **Client→server:** `"track_entity"` (with `action ∈ {open, ping, close}`) and `"stream_events"`
  (`model/websocket.rs:22-29`, `model/tracking.rs:55-62`).
- **Server→client `type` values:** `"stream_event"`, `"stream"`, `"user_tracking_change"`
  (`service/tracker.rs:154`), `"invalidation"`
  (`crates/connection/src/domain/models.rs:8`).
- **Multi-replica fanout = broadcast-to-all + filter, not sharded routing**
  (`service/sender.rs:35-128`): look up subscribers in DynamoDB, split into local (a `DashMap` of
  live `mpsc::Sender`s) vs remote, publish remote ones to the single Redis channel
  `"connection_gateway.messages"` (`service/redis.rs:7`), and every replica drops payloads whose
  `connection_id` it doesn't own (`service/redis.rs:67-76`).
- **Real backpressure here**, unlike sync-service: bounded `mpsc::channel(100)` per connection
  (`api/connection/mod.rs:69`), and a full channel **evicts the connection**
  (`service/connection.rs:208-211`).
- **Presence is heartbeat + sweeper:** DynamoDB rows carry `last_ping`, liveness is
  `is_active_in_threshold` with `DEFAULT_TIMEOUT_THRESHOLD = 60_000` ms
  (`services/connection_gateway/src/constants.rs:30`, `model/connection.rs:37-51`), plus an
  out-of-band `stale_connections` binary for sweeping orphans
  (`services/connection_gateway/README.md:15-31`).

**The lesson for Rob:** Macro needed DynamoDB + Redis pub/sub + a stale-connection sweeper to build
what Supabase Realtime Presence gives you in ~10 lines. This is the strongest argument in the whole
report for *not* rebuilding any of it.

### 13.4 Security/quality issues found in Macro's server code

Listed because they are cautionary patterns, not because Rob needs to fix them:

1. **`can_edit()` returns true for `Comment` level** — `services/sync-service/src/auth.rs:26-28`
   (`self >= &AccessLevel::Comment`), while the doc comment on `Comment` at lines 14-15 says it is
   "the same thing as `View`". A comment-only user can submit arbitrary CRDT updates. Enforced per
   message at `websocket.rs:111-114`.
2. **Internal secret logged in plaintext on mismatch** — `auth.rs:90-95` prints both the supplied
   header and the expected `internal_api_secret` into the error log.
3. **`DOCUMENT_PERMISSIONS_SECRET` read via `env.var()`, not `env.secret()`**
   (`src/secrets.rs:25`), hardcoded to `"local"` in the playground config
   (`wrangler.toml:56`).
4. **The `"a/"` all-ops keyspace grows unboundedly** — never pruned anywhere in `durable_kv.rs`.
5. **Known correctness hole in compaction** — `durable_kv.rs:169-180` logs *"We have mystery key
   which we can't delete... TODO"* when the delete count doesn't match.
6. **Panic on corrupt data** — `durable_kv.rs:208`:
   `.expect("TODO we wrote a bad vv???")`.
7. **Client and server `schema.bop` have textually diverged** (comments only, today) with no CI
   check binding them, and Rust codegen is commented out — a schema change needs two manual
   regenerations.

Takeaway for Rob's own build: **put the invariant in code, not in a comment.** Item 1 is exactly the
class of bug that RLS policies prevent by construction — which is another reason to lean on Supabase
RLS rather than hand-rolled permission checks at the fan-out layer.

---

## 14. Server-side mutation, broadcast & access control

### 14.1 `crates/entity_mutation` is a contract crate, not an engine

19 lines in `crates/entity_mutation/src/lib.rs`; three files total (`lib.rs`, `models.rs` 105 L,
`capability.rs` 140 L). It defines **one trait per capability**, each parameterised by the permission
it requires (`capability.rs:25-140`): `RenameEntity`, `MoveEntity`, `UpdateEntitySharePolicy`,
`TrashEntity`, `RestoreEntity`, `DeleteEntityPermanently`, `DuplicateEntity`.

```rust
// crates/entity_mutation/src/capability.rs:25-36
pub trait RenameEntity {
    type Receipt: RequiredPermission;
    fn rename_entity(
        &self, entity: Entity<'static>,
        receipt: EntityAccessReceipt<Self::Receipt>,   // ← proof-of-authorization, not a bool
        display_name: String,
    ) -> impl Future<Output = Result<Vec<Entity<'static>>, EntityMutationErrorCode>> + Send;
}
```

Two patterns worth borrowing conceptually:

- **Type-level authorization.** You cannot call `rename_entity` without an
  `EntityAccessReceipt<T>`, whose fields are private and whose constructor validates
  (`crates/entity_access/src/domain/models.rs:297-338`):
  `if !entity_permission.satisfies::<T>() { return Err(AccessError::Unauthorized); }`.
  The permission check is unforgettable because the type system requires it.
- **Sentinel-wrapped errors.** `EntityMutationErrorCode` variants each wrap a
  `Sentinel(())` with a private constructor (`models.rs:53-70`), so a variant can only be built via
  the logging constructors `internal/not_found/forbidden/invalid/conflict` (`models.rs:77-104`).
  You cannot return an error without it being logged.

Implementors: `crates/documents/`, `crates/chat/`, `crates/projects/`, `crates/call/`,
`crates/email/`, `crates/channels/` (each at `src/domain/.../entity_mutation.rs`). The "DSS entity
mutation router" described in the crate's own doc comment (`capability.rs:1-15`) **does not exist in
this tree** — the docs are ahead of the code.

### 14.2 There is no optimistic concurrency control anywhere. At all.

This is the single most decision-relevant server finding.

- `grep` for `etag | if-match | if_match | optimistic.lock | compare.and.swap` across `crates/` and
  `services/` → **zero hits** (only false positives on `EnsureTagSetRequest`).
- `grep` for `version_conflict | StaleVersion | expected_version | row_version | lock_version` →
  hits only in `crates/opensearch_client/src/upsert/*` (Elasticsearch's internal counters), nothing
  on the mutation path.
- The `Conflict` error variant is a **state** conflict, not a version conflict. Its only producer is
  a `deleted_at` precondition (`crates/documents/src/domain/entity_mutation.rs:59-73`):
  ```rust
  if document.deleted_at.is_some() {
      return Err(EntityMutationErrorCode::conflict(...format!("cannot {action} a deleted document")));
  }
  ```

**Macro — a company whose entire pitch is speed and collaboration — runs plain last-write-wins on
all non-document data.** If they don't need version columns or CAS for a multi-tenant product with
concurrent editors, Rob does not need them for <50 reps. Do not build conflict resolution. Build
*visibility*: show who else is on the record (§2.3 of the plan), and last-write-wins is fine.

### 14.3 The nonce echo is real, end-to-end, and confirms Tier 2.1

Server-side wrapper — `crates/channels/src/outbound/connection_gateway_realtime.rs:152-158`:

```rust
#[derive(Serialize)]
struct WithNonce<T: Serialize> {
    #[serde(flatten)] data: T,
    #[serde(skip_serializing_if = "Option::is_none")] nonce: Option<String>,
}
```

Applied to all four comms effects (`connection_gateway_realtime.rs:70-147`). The nonce is carried on
6 domain event variants (`crates/channels/src/domain/events.rs:64,85,98,113,128,143`, each commented
*"Client mutation nonce echoed to realtime listeners"*), accepted as a query param
(`crates/channels/src/inbound/axum_router.rs:642`), **and echoed in the HTTP response too**
(`crates/channels/src/domain/service.rs:678-682`):

```rust
Ok(PostMessageResponse { id: message.id.to_string(), nonce: req.nonce })
```

There is E2E coverage asserting it: `crates/integration_tests/local_e2e/tests/channel_websocket.rs:39-67`
(`"post response did not echo nonce"`).

On the client, **the nonce *is* the optimistic id** —
`apps/web/src/lib/queries/channel/message.ts:435`:
`// Use optimisticId as nonce - allows server to echo it back for correlation`. That is a nice
simplification for Rob: don't generate two ids, reuse the optimistic row id as the nonce.

**Two caveats to carry into Rob's implementation:**

1. **The nonce is broadcast to every recipient**, not just the originator — the wrapper is applied
   once to the whole fan-out (`connection_gateway_realtime.rs:31-51`). Dedup still works because
   only the originator has it registered, but the token is visible to all channel members. For Rob
   this is harmless (internal CRM, `last_mutation_nonce` is a random uuid), but don't put anything
   meaningful in it.
2. **Nonces only exist on the channels path.** The *invalidation* path has no nonce and instead
   suppresses the echo by **filtering on user id** — `crates/connection/src/domain/service.rs:42-70`:
   ```rust
   EntityAccessAuth::Authenticated(uid) =>
       users.into_iter().filter_map(|p| (p.as_ref() != uid.as_ref()).then(|| p.0)).collect(),
   ```
   That is coarser: it suppresses the echo for **all of that user's tabs and devices**, so a rep
   with the CRM open on a laptop and an iPad will not see their own change propagate to the second
   screen. **Rob should prefer the per-mutation nonce over user-id filtering** for exactly this
   reason — his reps will have multiple tabs open.

### 14.4 `crates/broadcast` is in-process only, and barely used

`crates/broadcast/src/lib.rs:1-5` — *"Instance-local keyed asynchronous fan-out."* It is a
`DashMap<K, tokio::sync::broadcast::Sender<V>>` (`lib.rs:55-59`) with bounded per-subscriber mpsc
bridging (`lib.rs:98-157`). **No Kafka, no Redis, no SNS/SQS inside it.**

It has exactly **one consumer in the entire repo** —
`crates/soup_realtime/src/domain/service.rs:8,44,55`, keyed by `MacroUserIdStr`, with
`BROADCAST_BUFFER_CAPACITY = 64` / `SUBSCRIBER_BUFFER_CAPACITY = 16` (`service.rs:25-27`).

The **actual** network transports are:

| Transport | Where | Detail |
|---|---|---|
| **Kafka** | `crates/macro_event_topics/src/lib.rs:47-68` | 10 topics in one `topics!` macro: `macro.{example,bots,documents,soup,projects,teams,channels,email,webhooks,mentions}`. Envelope `Event<E> { event_id: Uuid::now_v7(), schema_version, #[serde(flatten)] event }` (`crates/macro_event_broker/src/domain/models.rs:29-38`). Key = recipient user id for soup. Fire-and-forget in a spawned task with a 6s timeout (`macro_event_broker/src/domain/service.rs:83-120`). |
| **Redis pub/sub** | `services/connection_gateway/src/service/redis.rs:7` | One global channel `"connection_gateway.messages"`; payload `MessageWithConnection { message, connection_id }`; every replica filters by locally-held connection. |
| **DynamoDB** | `services/connection_gateway/src/model/connection.rs:17-34` | Connection registry, `PK="#{entity_type}#{entity_id}"`, `SK=connection_id`. |
| **Postgres LISTEN/NOTIFY** | one place only — see 14.6 | |

### 14.5 Fan-out IS ACL-filtered server-side (important for multi-rep)

Macro resolves the recipient list **before** publishing, so the gateway is a dumb router and clients
never receive data they can't see.

- **Soup/Kafka:** `crates/soup_realtime/src/domain/service.rs:146-200` — `expand_user_access` →
  dedupe → hydrate once through one accessor's visibility scope → one Kafka message per user.
  Per-user transient fields are stripped because one hydration serves all recipients
  (`document.viewed_at = None;`, `service.rs:195`).
- **Invalidation:** `crates/connection/src/domain/service.rs:42-70` (quoted above).
- **Channels:** recipients are the resolved participant list computed before publish
  (`crates/channels/src/domain/side_effects.rs:657-673`).

The ACL query itself (`crates/entity_access/src/outbound/pg_access_repo/queries/mod.rs:134-210`) is a
three-way `UNION ALL` over direct user grants, channel participants, and team members.

**Two warnings that map directly onto Rob's design:**

1. **The accessor list is memoized for 30 seconds** — `queries/mod.rs:125-133`:
   ```rust
   #[cfg_attr(not(test), cached(time = 30, result = true, key = "String", ...))]
   ```
   So a user whose access was revoked keeps receiving realtime fan-out for up to 30s. This is the
   hazard of hand-rolling ACL filtering at the fan-out layer. **Supabase Realtime evaluates RLS per
   event with no such cache** — another point for using it rather than rebuilding it.
2. **The final delivery hop trusts its caller.** `connection_gateway`'s `/message/batch_send` is
   `InternalOnly` API-key-gated (`services/connection_gateway/src/api/message/mod.rs:55,98`) and
   blindly delivers to whatever entity list it is handed. The security boundary is entirely in the
   caller. Fine for them; a footgun to replicate.

### 14.6 Change propagation is app-level publish-after-write, not CDC

- `grep` for `debezium | wal2json | logical replication` → **zero hits**.
- The pattern is: write to Postgres, then dispatch side effects. `crates/channels/src/domain/side_effects.rs:613-630`
  is explicit about ordering, and about being best-effort:
  > *"Published after the other side effects so broker latency never delays realtime updates or
  > notifications; failures are logged and dropped."*

  Note what that means: **there is no transactional outbox.** A crash between commit and publish
  silently loses the event (`tracing::error!`-and-drop at `side_effects.rs:620-626`, `:705-709`).
  Their safety net is the client's invalidate-on-reconnect (§2), not delivery guarantees.
- **Exactly one `LISTEN/NOTIFY` in the whole repo**, for notification deletes:
  `crates/macro_db_client/migrations/20260520152848_notify_user_notif_deletes.sql:8-41` defines a
  `BEFORE DELETE` trigger (before, specifically so the `ON DELETE CASCADE` hasn't yet removed the
  rows it needs to read) calling `pg_notify('notification_events', …)`, wrapped in
  `EXCEPTION WHEN OTHERS THEN RAISE WARNING` so a notify failure can never fail the delete.
  Listener: `crates/notification/src/outbound/notification_events.rs:25-40` using `sqlx::PgListener`
  with reconnect-on-error.

**Direct implication for Rob:** Supabase Realtime `postgres_changes` *is* logical-replication CDC —
which is **strictly more reliable than what Macro built**. Rob gets, for free, the delivery
guarantee Macro explicitly chose not to build. He should not feel he is settling for a lesser tool.

Also worth copying: that trigger's `EXCEPTION WHEN OTHERS THEN RAISE WARNING` wrapper. If Rob ever
adds a Postgres trigger, never let the notification path fail the write.

### 14.7 Presence internals (server side)

`user_tracking_change` appears in exactly **4 places repo-wide**: `tracker.rs:143,154` and
`liveIndicators.ts:13,25`. The whole feature is small.

- **Storage: DynamoDB**, `StoredConnectionEntity { PK, SK, entity_type, entity_id, connection_id,
  created_at, user_id, last_ping }` (`services/connection_gateway/src/model/connection.rs:17-34`).
- **Lifecycle** driven by client `TrackAction::{Open, Ping, Close}`
  (`services/connection_gateway/src/service/tracker.rs:32-109`).
- **Broadcast is full-state, not a delta** (`tracker.rs:149-166`): the server sends the complete
  `user_ids: Vec<String>` for the entity to everyone tracking it, and the client just replaces
  (`liveIndicators.ts:28-29`). **Copy this** — full-state presence sync is far less bug-prone than
  join/leave deltas, and Supabase Presence works the same way.
- **Expiry is soft and read-time, 60s** — `DEFAULT_TIMEOUT_THRESHOLD = 60_000`
  (`services/connection_gateway/src/constants.rs:29-30`), filtered via `is_active_in_threshold`
  (`model/connection.rs:37-51`).
- **There is no DynamoDB TTL attribute set.** Rows are hard-deleted only on explicit `Close` or by
  an offline sweeper script (`services/connection_gateway/scripts/stale_connections.rs`). A
  hard-crashed tab leaves an invisible-but-present row indefinitely. This is precisely the class of
  bug Supabase Presence avoids by building on a CRDT with heartbeat-based expiry — **another reason
  not to hand-roll presence.**

Separately, `crates/last_online_tracker` is coarse global "last seen", not per-entity: Redis key
`last_online:<user>`, RFC3339 value, 30-day TTL
(`crates/last_online_tracker/src/outbound/redis.rs:11,24-26,38`), written off the hot path via an
mpsc(100) background worker with a `RecordOnDrop` RAII guard (`src/inbound.rs:15-60`). Its
`domain/models.rs` is an empty file. It broadcasts nothing.

### 14.8 What §13–14 change about the recommendations

Nothing is retracted; three things are reinforced:

1. **Skip conflict resolution entirely** (§14.2). Macro has zero CAS/version/ETag on record data.
   Last-write-wins + presence is the professional answer, not a compromise.
2. **Use the per-mutation nonce, not user-id filtering** (§14.3, caveat 2). Macro's coarser path
   breaks multi-tab for the same user — a scenario Rob will hit immediately.
3. **Supabase Realtime is genuinely better than what Macro built for app data** (§14.5, §14.6):
   RLS evaluated per event with no 30s staleness window, logical-replication delivery instead of
   best-effort publish-after-commit with no outbox, and CRDT-backed presence with automatic expiry
   instead of DynamoDB rows that leak on crash. Rob is not settling.

---

## 15. Report metadata

- **Files read directly:** ~45 across `apps/web/src/lib/queries/**`,
  `apps/web/src/lib/graphql-cache/**`, `packages/{loro-mirror,collaboration,lexical-core}/**`,
  `crates/client/**`, `apps/web/docs/graphql-normalized-cache-plan.md`, plus the MLE ROB Dashboard.
- **Two parallel read-only sub-analyses** covered the Rust server surface: the sync/websocket wire
  protocol (`services/sync-service`, `services/connection_gateway`, `services/websocket-service`,
  `crates/{sync_service,connection,broadcast,stream,soup_realtime}`) and the mutation/broadcast/ACL
  plumbing (`crates/{entity_mutation,entity_access*,broadcast,macro_event_broker,macro_event_topics,
  last_online_tracker}`).
- **Nothing outside the report path was modified.** This was a read-only analysis.
- **Licence note:** repo root is AGPLv3 (`LICENSE.txt`, `README.md:97`). `packages/loro-mirror` is
  MIT and upstream-owned (`THIRD_PARTY_LICENSES.md`). `apps/web/LICENSE` still says
  *"Copyright 2023 CoParse, Inc. All rights reserved."* — a stale pre-open-sourcing artifact.
  **Nothing in this report proposes copying Macro source into Rob's codebase.** The recommendations
  are patterns (nonce dedup, transactional optimistic update, allowlisted persistence,
  full-state presence) reimplemented against Supabase/TanStack primitives — which is not a
  derivative work. If Rob ever wants to lift a file verbatim, `nonce.ts` is AGPL and would need to
  be rewritten from the described behaviour rather than copied.
