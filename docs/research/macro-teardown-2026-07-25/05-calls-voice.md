# Macro — Calls / Voice / Transcription Deep Analysis
**Analyst:** head-of-engineering · **Date:** 2026-07-25 · **Target:** macro.com clone (AGPLv3), local path `…/scratchpad/macro`
**Audience:** Rob Acheson (AI VoiceTech) — simultaneously choosing a telephony stack for `MLE ROB Dashboard`
**Method:** source read, not README. Every claim below carries a file path. Repo-wide greps for `livekit|twilio|deepgram|assemblyai|daily.co|agora|mediasoup|webrtc|sip|pstn|dtmf|whisper` were run and are reported honestly, including the negatives.

---

## 0. TL;DR — the seven answers

| # | Question | Answer |
|---|---|---|
| 1 | What do "calls" DO? | **In-app WebRTC channel calls** (audio-first, video + screenshare available). **Zero PSTN.** No phone numbers anywhere in the call path. |
| 2 | Media/transport | **LiveKit Cloud.** Rust `livekit-api 0.4.24` / `livekit-protocol 0.7.7`; browser `livekit-client ^2.18.0`. Their own websocket-service is *not* in the media path. |
| 3 | Recording | LiveKit **RoomComposite egress** → MP4 (H.264 + AAC) → S3 `calls/{room}/{time}.mp4` → CloudFront signed URLs. S3 event → Lambda → ffmpeg midpoint frame → `PREVIEW.jpg`. **No lifecycle/retention rule = infinite retention.** |
| 4 | Transcription | **Deepgram `nova-3`, streaming**, called *through* LiveKit Inference from a Python LiveKit Agent. One `AgentSession` per participant. Diarization is **two-layer**: Deepgram `diarize:true` (fallback) + **Resemblyzer 256-dim voice embeddings clustered in-process** (primary). Segments POST back to the Rust API over an internal shared secret. |
| 5 | Transcripts → AI/memory | **Yes, but lexically, not vectorially.** Per-segment docs into **OpenSearch** via SQS; AI reads them with a `ReadCallRecord` tool. `crates/embedding` (OpenAI `text-embedding-3-small`) is **not** wired to calls. The only vectors in the call path are *voice fingerprints* in pgvector. |
| 6 | Real-time in-call AI | **None.** The agent explicitly `raise StopResponse()` on every turn. No live suggestions, no live summary, no live transcript in the UI. |
| 7 | Liftable to TS/Next/Supabase? | **The architecture: absolutely — and Rob is already ~40% there.** The specific novel patterns worth stealing are enumerated in §8. |

---

## 1. What Macro's "calls" feature actually DOES

### 1.1 It is a channel-scoped WebRTC meeting, not a phone system

The unit of a call is a **channel**, not a person:

- `crates/call/src/domain/service.rs:425` — `get_or_create_call(channel_id, user_id)`. Room name **is** the channel UUID: `let room_name = channel_id.to_string();` (`service.rs:439`).
- DB: `crates/macro_db_client/migrations/20260331170640_add_call_tables.sql` — `calls.channel_id UUID NOT NULL REFERENCES comms_channels(id)`, plus `CONSTRAINT calls_one_per_channel UNIQUE (channel_id)`. **One live call per channel, ever.**
- Ringing = APNs/PushKit fan-out to every member of the channel (`service.rs:498-637`).

### 1.2 The PSTN negative result (important, and I checked hard)

Repo-wide grep for `twilio|pstn|dtmf|dialpad|sip_trunk|sip:|e164` across `*.rs *.ts *.tsx *.py *.toml *.sql *.swift` returned **exactly one hit**, and it is not telephony:

```
crates/crm/src/domain/generic_email_domains.rs:436:    "twilio.com",
```

…a string in a list of generic email domains. Grep for `phone_number|phoneNumber` returned one hit: `crates/crm/src/outbound/apollo_resolver.rs:149` — a *company* phone field from Apollo enrichment, unrelated to calls.

Corroborating evidence that CallKit here means VoIP-app, not telephony:
- `apps/web/tauri/callkit_plugin/ios/Sources/IncomingCallCoordinator.swift:133` and `:322` use `CXHandle(type: .generic, ...)` with the **channel name** as the handle — a real dialer would use `CXHandle(type: .phoneNumber, ...)`.
- LiveKit has first-class SIP support (`livekit-api` ships a `SIPClient`). Macro imports `access_token`, `services::{agent_dispatch, egress, room}`, `webhooks` — and **not** `services::sip` (`crates/call/src/outbound/livekit_rtc_client.rs:10-18`).

**Verdict: Macro calls are Zoom/Huddle-shaped, not Dialpad-shaped.** Their own FAQ agrees — `apps/docs/faq.mdx:49`: *"We sublicense LiveKit for video calls."*

### 1.3 Audio-first, video optional, screenshare supported

- `apps/web/src/features/channel/Call/LivekitJsCallController.ts:177` — *"Default to microphone on, video off as soon as the room is connected."*
- Track sources exposed: `Camera`, `Microphone`, `ScreenShare` (`apps/web/src/features/channel/Call/livekit-loader.ts`, `LK_TRACK_SOURCE`).
- Krisp noise suppression is lazy-loaded (`@livekit/krisp-noise-filter ^0.4.1`), dynamically imported so it stays out of the initial bundle (`livekit-loader.ts:44-52`).
- iOS gets PiP + video overlay (`CallPictureInPictureController.swift`, `CallVideoOverlayController.swift`).

Recording is nevertheless **composited video MP4** regardless (`livekit_rtc_client.rs:107-114`, `VideoCodec::H264Main`), which is why a preview JPEG makes sense.

---

## 2. Media / transport layer — exact dependencies

### 2.1 Server (Rust)

`Cargo.toml` (workspace root):
```
158: livekit-api = { version = "0.4.16", default-features = false, features = [...] }
164: livekit-protocol = "0.7.2"
```
Actually **resolved** in `Cargo.lock`: `livekit-api 0.4.24`, `livekit-protocol 0.7.7`.

Note they take `livekit-api` with `default-features = false` — server-side control plane only (Twirp RPC over HTTPS), no native WebRTC stack compiled into the API.

`crates/call/src/outbound/livekit_rtc_client.rs:59-70` handles the classic footgun explicitly:
```rust
// Twirp RPC requires HTTP(S), not WebSocket. Convert wss:// → https://
let http_url = server_url.replace("wss://", "https://").replace("ws://", "http://");
```
Four clients are constructed from one URL/key/secret: `RoomClient`, `EgressClient`, `AgentDispatchClient`, `TokenVerifier`+`WebhookReceiver`.

### 2.2 Browser

`apps/web/package.json`:
```
64:  "@livekit/krisp-noise-filter": "^0.4.1",
65:  "@livekit/track-processors": "^0.7.2",
114: "livekit-client": "^2.18.0",
```
It is the **only** `package.json` in the monorepo referencing LiveKit. No `mediasoup`, no `simple-peer`, no raw `RTCPeerConnection` juggling.

### 2.3 LiveKit **Cloud**, not self-hosted

`services/transcription/livekit.prod.toml`:
```toml
[project]
  subdomain = "macro-prod-ght70vsh"
[agent]
  id = "CA_N9bSwTxA8arc"
```
…and `services/transcription/justfile` deploys with `lk agent deploy` / `lk agent logs` / `lk agent status`. That is LiveKit Cloud Agents. Dev is a separate project (`macro-dev-nx63k8cs`, agent `CA_F5rP586ockUG`).

### 2.4 Their websocket-service is NOT in the media path — decisive

`crates/connection` (`src/lib.rs`) is *"connection gateway operations"*; `crates/broadcast` (`src/lib.rs:1-5`) is *"Instance-local keyed asynchronous fan-out… one Tokio broadcast channel per active key."* These carry **app-level realtime**: presence, notifications, and call *lifecycle* events only.

Proof of the boundary: the call service pushes `call_started` / `call_ended` JSON through `connection_service.send_channel_message(...)` (`service.rs:256-260`, `:485-495`, `:820-829`, `:950-959`). Media and signalling both live entirely inside LiveKit's own WSS + SFU. Macro's websocket layer never sees an RTP packet or an SDP offer.

---

## 3. Recording — end to end

### 3.1 Start

At call creation, if `egress_s3_config` is present (`service.rs:466-482`):

```rust
self.rtc_client.start_room_composite_egress(&room_name, s3_config).await
→ self.repo.set_egress_id(&call.id, &egress_id)
```

The egress request (`livekit_rtc_client.rs:90-121`):
```rust
EgressOutput::File(EncodedFileOutput {
    file_type: EncodedFileType::Mp4,
    filepath: format!("calls/{room_name}/{{time}}"),
    output: S3Upload { bucket, region, access_key, secret },
})
options.encoding = { audio_codec: AudioCodec::Aac, video_codec: VideoCodec::H264Main }
```

**Cost note for Rob:** RoomComposite egress runs a headless-Chrome compositor per room on LiveKit's side and is billed by the minute — it is the single most expensive line item in this design. LiveKit also offers `TrackEgress` / `TrackCompositeEgress` (raw per-track, no compositor) which is dramatically cheaper. Macro chose composite because they want a watchable video artifact. **For a phone dialer you do not need a compositor** — see §8.

Note also that Macro passes **static S3 access keys** into LiveKit (`EgressS3Config` in `crates/call/src/domain/models.rs:138-149`), backed by a dedicated IAM user with credentials in Secrets Manager (`infra/stacks/call-recording/index.ts`, `macro-call-recording-svc-${stack}`). They redact them in `Debug` (`models.rs:151-160`). This is a third party holding your write keys — worth knowing.

### 3.2 Stop — the runaway-billing guard (steal this)

`service.rs:930-948`, on last participant leaving:
```rust
// Stop egress explicitly before deleting the room. DeleteRoom
// is expected to cascade-stop egress, but a failed or slow
// DeleteRoom can leave egress running and billing. Doing it
// first makes the runaway-billing case impossible.
if let Some(egress_id) = egress_id { self.rtc_client.stop_egress(&egress_id).await... }
self.rtc_client.delete_room(room_name).await...
```
This is a scar-tissue comment. Believe it.

### 3.3 Webhooks reconcile storage keys

`service.rs:780-1037` handles `room_started | room_finished | participant_joined | participant_left | egress_started | egress_updated | egress_ended`. Signature validation via `WebhookReceiver` (`livekit_rtc_client.rs:288-296`), mapping failures to `CallError::Auth`.

- `egress_started` → persists `recording_started_at` from the webhook's `created_at` (`service.rs:962-993`). Migration `20260430120000_call_recording_started_at.sql` explains why: `started_at` (call creation) lags the true recording origin by the **egress bootstrap window**, so transcript↔audio sync would drift.
- `egress_ended` → `extract_recording_key(file_url)` strips everything through `calls/` (`service.rs:1653-1658`), then writes to `call_records.recording_key`, or to the still-active `calls` row if archival hasn't happened yet (`service.rs:1005-1029`). Race handled both directions.

One subtlety they later fixed with *transcript* data: `recording_started_at` from `egress_started` is still too early (it stamps egress bootstrap, not first audio frame), so the transcription agent sends `streamStartedAt` and the server takes the **earliest non-null across participants** to overwrite it (`crates/call/src/domain/models.rs:202-209`). Two-stage timeline anchoring.

### 3.4 Preview image — `call_recording_preview_handler`, traced end to end

**Trigger** (`infra/stacks/call-recording/index.ts`, `BucketNotification`):
```ts
events: ['s3:ObjectCreated:*'], filterPrefix: 'calls/', filterSuffix: '.mp4'
```
S3 → Lambda directly. No queue, no DLQ visible in this stack.

**Key decision** (`services/call_recording_preview_handler/src/key.rs`):
URL-decode (`+`→`%20` first — the classic S3-event form-encoding trap, `key.rs:47-53`), then a 4-way skip ladder: `MissingCallsPrefix`, `MissingParent`, `PreviewImage` (self-trigger guard — critical, since the JPEG lands in the same bucket), `NonMp4`. Output:
```
source_key   = calls/{room}/{stem}.mp4
recording_key= {room}/{stem}.mp4          ← note: prefix stripped
preview_key  = calls/{room}/{stem}/PREVIEW.jpg
```

**Render** (`src/ffmpeg.rs`):
1. `ffprobe -show_entries format=duration` over a **presigned URL** — the Lambda never downloads the MP4 (`event.rs:201-220`). ffmpeg streams the byte range it needs. Big cost/latency win on long recordings.
2. Seek to `duration / 2.0`, `ffmpeg -ss {mid} -i {url} -frames:v 1 -q:v 2 out.jpg`.
3. **Fallback**: if midpoint yields a zero-byte file, retry at `t=0` (`ffmpeg.rs:76-108`). Both attempts guarded by a 60s `tokio::time::timeout` with `kill_on_drop(true)` (`ffmpeg.rs:130-137`).
4. ffmpeg/ffprobe ship as a **Lambda layer** at `/opt/bin` (`scripts/package-ffmpeg.sh`, env `FFMPEG_PATH`/`FFPROBE_PATH`).

**Persist** (`src/db.rs`) — one transaction updating **both** tables, because the call may or may not have been archived yet:
```sql
UPDATE calls        SET preview_url = $2 WHERE recording_key = $1;
UPDATE call_records SET preview_url = $2 WHERE recording_key = $1;
```
Returns `rows_affected` summed; `event.rs:246-261` **bails (→ Lambda retry)** when zero rows matched. That is a deliberate retry-until-the-row-exists loop for the race where the preview beats archival. Note the column is named `preview_url` but stores an **object key**, not a URL (`migrations/20260604160449_call_record_preview_url.sql`; the Rust model correctly calls it `preview_key`, `models.rs:385`).

### 3.5 Serving — CloudFront signed URLs

`crates/call/src/outbound/s3_recording_storage.rs`:
- Prod: `cloudfront_sign::get_signed_url` with a PKCS#1 private key + key-pair id, `date_less_than = now + presigned_url_expiry_seconds` (`:83-108`).
- Local: falls back to plain S3 presign (`:110-127`, gated on `macro_aws_config::is_local_aws()`).
- Path-segment encoding hardened against traversal: `.` → `%2E`, `..` → `%2E%2E` (`:71-81`). Distribution URL validated for scheme/host and rejected if it contains `?` or `#` (`:88-97`).

Signed URLs are minted **on read**, per request, in `get_call_record` (`service.rs:1070-1088`) — never stored.

### 3.6 Bucket, access control, retention

`infra/stacks/call-recording/index.ts`:
- Bucket `macro-call-recording-{stack}`, `enableVersioning: false`, transfer acceleration on prod.
- **Tag-based deny-by-default bucket policy**: `Deny s3:*` unless `aws:PrincipalTag/call-recording-access == "true"`, with account-root and AWS-service carve-outs to prevent lockout. Nice pattern — it neuters broad dev IAM.
- CloudFront read allowed only for `${bucketArn}/calls/*` from the specific account.

**Retention: there is none.** No `aws.s3.BucketLifecycleConfiguration` in the stack; `s3:PutLifecycleConfiguration` appears only in the *modify* IAM policy as a permission, never invoked. `services/organization_retention_handler/src` contains **zero** references to `call_record`. Deletion is user-driven only, via `delete_call_record` (`service.rs:1100-1169`), which cascades: DB row → search index removal → S3 recording delete → S3 preview delete (including a legacy-key fallback, `service.rs:1678-1691`).

**Cost shape:** MP4 at H.264/AAC composite ≈ 30–60 MB per 30-min call at LiveKit defaults; S3 Standard at $0.023/GB-mo, forever. Dominant cost is not storage — it is **composite egress minutes** plus **Deepgram streaming minutes ×N participants** (§4.4).

---

## 4. Transcription — `services/transcription`

A **Python LiveKit Agent**, deployed to LiveKit Cloud, completely separate from the Rust monolith.

### 4.1 Stack

`services/transcription/requirements.txt` — the whole thing is four lines:
```
python-dotenv
livekit-agents[silero]==1.5.7
httpx
resemblyzer==0.1.4
```
`Dockerfile`: Python 3.13-slim, venv, multi-stage, non-root uid 10001, `RUN python transcriber.py download-files` at build time to bake the Silero VAD + turn-detector models in (`HF_HOME=/app/.cache/huggingface`). `CMD ["python","transcriber.py","start"]`.

### 4.2 Provider and model — Deepgram nova-3, streaming, via LiveKit Inference

`services/transcription/transcriber.py:162-179`:
```python
stt=inference.STT(
    "deepgram/nova-3",
    language="en-US",
    extra_kwargs={
        "endpointing": 400,      # ms silence before finalize; lib default 25ms
                                 # "cuts hesitant speakers mid-thought"
        "smart_format": False,
        "punctuate": True,
        "filler_words": True,    # ← keeps "um"/"uh"
        "numerals": True,
        "interim_results": True,
        "no_delay": True,
        "diarize": True,         # kept only as a fallback (see 4.3)
    },
)
```

Three things Rob should note:
- **`inference.STT("deepgram/nova-3")` means the Deepgram call is proxied by LiveKit** — no Deepgram API key in this repo, billing rides on LiveKit. Convenient; also a margin stack and a vendor lock.
- **`endpointing: 400`** is the single highest-value tuning constant in the file, and the comment tells you why.
- **`filler_words: True`** is a deliberate choice for a *meeting* transcript. For a **sales-coaching** transcript it is arguably even more valuable (filler density is a real talk-quality signal) — but it will make LLM summaries noisier unless you strip them at prompt time.

**No Whisper. No AssemblyAI. No batch pass.** Streaming only — the grep for `whisper|assemblyai` returned nothing in this service.

### 4.3 Diarization — the genuinely clever part

Macro does **not** trust Deepgram's live speaker labels. The comment at `transcriber.py:68-73`:

> *"Deepgram's live diarization labels can churn between finalized utterances."*

So they run their own **turn-level speaker clustering**:

**Layer A — Resemblyzer (primary).** `VoiceClusterResolver` (`transcriber.py:67-146`):
- Keeps a rolling **3-second** audio buffer per participant, capped by sample count (`_AUDIO_BUFFER_MAX_SECONDS = 3.0`, `:261-273`).
- On turn completion, drains the buffer, requires **≥1.0s** of speech (`VOICE_EMBEDDING_MIN_SECONDS`), runs `preprocess_wav` + `embed_utterance` on a **worker thread** (`asyncio.to_thread`) so the agent event loop stays responsive (`:296-336`).
- Normalizes to unit length, compares **cosine distance** against running centroids, matches if `distance <= 0.30` (`VOICE_CLUSTER_DISTANCE_THRESHOLD`), else creates a new cluster. Centroid updated as a running weighted mean (`:140-146`).
- Cluster ids are `uuid5(NAMESPACE_URL, "{channel}:{participant}:{nonce}:voice-cluster:{i}")` — deterministic within a session, namespaced by a per-`Transcriber` nonce so **a reconnect cannot silently merge two humans** (`:118-123`, and the same trick for provider ids at `:220-224`).

**Layer B — Deepgram speaker ints (fallback).** Word-level `speaker` labels are counted into a `Counter` across FINALs within a turn; the dominant speaker wins (`:378-383`, `:432-434`). Used only when Resemblyzer can't produce an embedding (turn too short/noisy). Once a Resemblyzer cluster *is* resolved for a turn, the provider int is **bridged** to it — `self._provider_speaker_cluster_ids[dominant_speaker] = diarized_speaker_id` (`:436-444`) — so later short turns from the same provider speaker inherit the good id.

**Layer C — model-per-participant.** `MultiUserTranscriber` (`:509-578`) starts **one `AgentSession` per `RemoteParticipant`**, each pinned to `participant_identity`, `audio_input=True, audio_output=False`. So every speaker gets an independent Deepgram stream. Diarization within a track then only matters for the shared-mic / conference-room case — which is exactly what the fallback bridge is for.

### 4.4 Cost consequence of one-stream-per-participant

N participants = N concurrent Deepgram streams for the whole call duration. A 5-person 60-min call = 300 STT-minutes. Plus one composite egress hour. Plus one prewarmed Python process holding Silero + Resemblyzer at **~3 GiB RSS** (`transcriber.py:610-614`, `num_idle_processes=1`, `job_memory_warn_mb=4096`).

For Rob's two-party sales calls this is a non-issue (2 streams) — but note the shape.

### 4.5 Timeline reconstruction (subtle, and worth stealing verbatim)

Deepgram gives you word offsets relative to *stream start*, not wall-clock. Macro reconstructs `t0` statistically (`transcriber.py:196-209`, `:354-365`):

> *"`now() - last_word.end_time` bounds true_t0 from above (because now() arrives at least final_delivery_lag after the last word ended); the MIN across FINALs is our best estimate."*

```python
implied_t0 = datetime.now(timezone.utc) - timedelta(seconds=last_offset)
if self._stream_t0_wall is None or implied_t0 < self._stream_t0_wall:
    self._stream_t0_wall = implied_t0
```
Then `started_at = t0 + first_word_offset`, `ended_at = t0 + last_word_offset` (`:414-415`). This converges to the true origin as more FINALs arrive and **strips FINAL-delivery lag out of the timestamps entirely.** If you naively stamp `now()` at FINAL time — which is what 90% of implementations do — your transcript drifts several hundred ms to seconds late against the recording, and highlight-follows-playback feels broken.

### 4.6 Delivery to the server

`transcriber.py:446-506`, on `on_user_turn_completed`:

```python
segment = {
  "segmentId": uuid5(NS_URL, f"{channel}:{participant}:{source_id}:{started_at.isoformat()}"),
  "speakerId": self.participant_identity,     # LiveKit identity == Macro user id
  "diarizedSpeakerId": diarized_speaker_id,
  "content": content,
  "startedAt": ..., "endedAt": ...,
  "streamStartedAt": self._stream_t0_wall,    # server picks earliest across participants
  "embedding": embedding,                     # 256-dim Resemblyzer vector
  "isFinal": True,
}
POST {MACRO_API_URL}/call/{channel_id}/transcript
     headers={"x-macro-internal-call": INTERNAL_CALL_SECRET}
```

Retry policy is explicit and correct: 3 attempts, 0.25s base with ×2 backoff, retrying only `TimeoutException | NetworkError | 5xx`; 4xx breaks immediately (`:465-505`). `segmentId` is a deterministic uuid5 → the DB unique constraint `call_transcripts_segment_unique (call_id, segment_id)` makes redelivery idempotent.

Then — and this is the whole story for §6 — **`raise StopResponse()`** (`:506`). The agent never generates a reply.

### 4.7 Server-side ingest

`crates/call/src/inbound/axum_router.rs:672-700` → `transcript_handler`, guarded by `InternalCallAccessExtractor` checking header `x-macro-internal-call` against the configured secret (`axum_router.rs:231-258`; `service.rs:399-403`). Not JWT, not mTLS — a shared bearer secret over HTTPS.

`service.rs:1172-1231` — `ingest_transcript_segment`:
1. Drop non-final segments outright (`if !segment.is_final { return Ok(()) }`).
2. Resolve `voice_id`: **first** try `get_transcript_voice_id_for_speaker(call_id, speaker_id, diarized_speaker_id)` to reuse an id already assigned in this call; only otherwise `voice_repo.upsert_voice(embedding)`. Comment: *"this prevents creating a fresh `voice.id` for every finalized utterance."*
3. Embedding failure is **non-fatal** — logged, transcript still written with `voice_id = NULL`.
4. `create_transcript_segment(call_id, segment, voice_id)`.

### 4.8 Where transcripts land — schema

Two-table hot/cold split, mirroring `calls` / `call_records`:

```sql
-- 20260331170640_add_call_tables.sql (live, cascade-deleted with the call)
call_transcripts(id, call_id→calls, segment_id TEXT NOT NULL, speaker_id, content,
                 started_at, ended_at, sequence_num,
                 UNIQUE(call_id, segment_id))
-- + 20260424130000: diarized_speaker_id TEXT
-- + 20260511131823: voice_id UUID REFERENCES voice(id) ON DELETE SET NULL

-- (archived, permanent)
call_record_transcripts(id, call_record_id→call_records, segment_id TEXT NULL,
                        speaker_id, content, started_at, ended_at, sequence_num)
-- + 20260424130000: diarized_speaker_id
-- + 20260429150324: custom_speaker TEXT   ← human/AI speaker override
-- + 20260511131824: voice_id
```

Archive is a transactional copy: `archive_call` (`crates/call/src/outbound/pg_call_repo.rs:700+`) `SELECT … FOR UPDATE`s the `calls` row (serializing concurrent archivers), inserts `call_records` **with the same id**, copies participants and transcripts, optionally grants the creator's team View access, and deletes the live rows.

### 4.9 Voice fingerprints — pgvector

`migrations/20260511131822_add_voice_tables.sql`:
```sql
CREATE TABLE voice (id UUID PRIMARY KEY, embedding vector(256) NOT NULL, created_at TIMESTAMPTZ);
CREATE INDEX idx_voice_embedding_cosine ON voice USING hnsw (embedding vector_cosine_ops);
CREATE TABLE macro_user_voice (macro_user_id UUID→macro_user, voice_id UUID→voice, PRIMARY KEY(...));
```
`VoiceRepository` (`crates/call/src/domain/ports.rs:707-760`) exposes `upsert_voice` (*"may reuse an existing nearby embedding"*), `link_user_voice`, `find_user_by_voice`, **`find_nearest_user(embedding, threshold)`** and `find_nearest_user_for_voice(voice_id, threshold)`.

**Enrollment is automatic and conservative.** `enroll_stable_speaker_voices_for_call_record` (`service.rs:1607-1646`) runs fire-and-forget after archival and links voice→user **only for speakers where every transcript row in the call carried the same non-NULL `diarized_speaker_id`** (`get_stable_speaker_voices_for_call_record`). Ambiguous speakers are simply skipped. Over time this builds a cross-call voiceprint directory for free, without ever asking a user to "read this sentence."

### 4.10 Linking a transcript to a contact/CRM record — the honest answer

**It doesn't.** Grep for `call_record|call_id` across `crates/crm/src` and `crates/contacts/src` returns **one hit**, in a test mock (`crates/crm/src/inbound/axum_extractors/test.rs:218`).

A Macro call is anchored to a **channel** and to **Macro users**, full stop. The closest thing to CRM enrichment is `migrations/20260709192942_add_call_record_property_entity_type.sql`:
```sql
ALTER TYPE property_entity_type ADD VALUE IF NOT EXISTS 'CALL_RECORD';
```
— i.e. calls became a generic taggable entity, so you can attach arbitrary properties/tags. That's it. There is no `call_records.contact_id`, no phone-number match, no deal association.

**This is the single biggest gap between Macro's design and what Rob needs**, and it is a gap Rob's schema has *already closed* (see §7).

---

## 5. Do transcripts feed the AI / memory layer?

Yes — via **three** distinct paths, none of them a text vector store.

### 5.1 Path A — AI summary + AI call naming + AI speaker attribution

`crates/call/src/outbound/ai_call_summarizer.rs`. Model: **`PredefinedModel::Sonnet4_6`** (line 20), for all three jobs, all metered under `ai_usage::AiFeature::CallSummary`.

Orchestration (`service.rs:1459-1532`, `spawn_summarize_call`, `tokio::spawn` fire-and-forget on archival):
1. **`generate_custom_speakers`** first, so the summary sees corrected names. Prompt (`ai_call_summarizer.rs:90-105`) feeds the LLM the archived transcript rows as JSON *plus* the list of candidate Macro user ids (participants **and their team members** — `get_call_participants_with_team_members`), and demands strict JSON `[{call_transcript_id, custom_speaker}]`. **Return an entry only when you are confident. If unsure, omit that row.**
   Output is then **validated in code, not trusted**: `parse_custom_speaker_results` (`:309-341`) drops any row whose `call_transcript_id` isn't in the input set, whose `custom_speaker` doesn't parse as a `MacroUserId`, that isn't in the candidate set, or that duplicates an earlier row. This is exactly the CR-3-style "guaranteed steps live in code" discipline.
2. **`summarize_call`** — reload the record (so it sees the new speakers), skip if transcript empty, render as `"{speaker}: {text}"` one line per segment (`:361-384`).
3. **`generate_call_name`** — only if `custom_name IS NULL`, persisted with `set_custom_name_if_null` so a user's manual title always wins.

Two prompt-engineering details worth stealing outright:
- **A `NULL` sentinel.** *"If the transcript is empty… respond with exactly the single token `NULL`… Do not produce a summary that merely states the transcript is uninformative."* `parse_summary` maps it to `None` and the caller **skips persistence entirely** (`:244-255`, `service.rs:1367-1373`). No "This appears to be a test call" garbage in the timeline. Same trick for names: `UNTITLED_CALL` (`:109`).
- **An anti-throat-clearing block.** The system prompt (`:23-52`) enumerates forbidden openers by example: `` `This was a [standup/sync/intro/team] call...` ``, `` `The transcript...` ``, `` `[Team] met to discuss...` `` — *"Skip the throat-clearing and lead with the meat."* Also bans markdown headings **including bold-as-heading** (`**Action Items**`). Someone shipped this, hated the output, and came back.

Guardrails in code, not prose: `CALL_NAME_SUMMARY_CHAR_CAP = 4_000` on input, `CALL_NAME_MAX_CHARS = 80` truncated at a word boundary on output (`:114-119`, `:261-286`).

### 5.2 Path B — OpenSearch, per-segment (this is the "searchable context" mechanism)

On archival: `search_indexer.enqueue_upsert(&call.id)` (`service.rs:816`, `:926`) → SQS (`services/document_storage_service/src/service/call_search_indexer.rs`) → `services/search_processing_service/src/process/call.rs`.

That worker (`process_call_record`) fans **one call into N OpenSearch documents — one per transcript segment**:
```rust
UpsertCallRecordSegmentArgs {
    call_id, transcript_id, channel_id,
    participant_ids,                  // ← permission filter
    channel_name, name,               // custom_name ?? channel_name
    speaker_id, sequence_num, content,
    started_at_millis, ended_at_millis,
    properties,                       // entity properties/tags, full overwrite each time
}
```
Two design notes they call out: the parent doc is a full overwrite so properties must ride **every** write or the property-update path gets clobbered (`process/call.rs:46-53`); and a property-fetch failure **propagates** (→ retry) rather than being silently treated as "empty".

Deletion mirrors it: `enqueue_remove(channel_id, call_id)` → `delete_call_record` or `delete_call_records_by_channel` (`process/call.rs:97-113`).

The frontend consumes segment-level hits directly — `apps/web/src/lib/queries/soup/transform-utils.ts:171`: `const isContentHit = !!r.transcript_id;` — so a search result can deep-link to a **moment inside a call**, not just the call.

### 5.3 Path C — an agent tool

`crates/call/src/inbound/toolset/read_call_record.rs` registers `ReadCallRecord` into `ai_toolset`. Its schema description is a lesson in itself:

> *"Retrieve the transcript for a specific call record. **Use ListEntities with includeTypes: ["call"] first to find the callId.** Only the transcript is returned — other metadata (participants, duration, etc.) is already available from ListEntities. In transcript segments, speakerId is the associated user/track, not guaranteed speaker identity; use diarizedSpeakerId to distinguish actual voices…"*

And the response field doc (`:55`): *"The AI generated summary of the call if one was generated. **Use this before you read through the transcript.**"* — token-budget discipline baked into the schema. The tool is access-controlled: it mints an `EntityAccessReceipt<ViewAccessLevel>` before reading (`:94-106`).

### 5.4 The negative result: transcripts are NOT vector-embedded

`crates/embedding` is a small trait crate over **OpenAI `text-embedding-3-small`** (`crates/embedding/src/embedding_provider/openai.rs:20`), with `crates/embedding/src/entity/task.rs` as its only entity adapter — **tasks**, not calls. `crates/ai_projections` (nightly "unified memory" regeneration) contains **zero** call references; grep for `call` there returns only the English word "caller" in doc comments.

So: **call transcripts are lexically searchable (OpenSearch BM25) and LLM-readable (tool), but not semantically embedded.** The only vectors in the call path are 256-dim *voice fingerprints* in pgvector. If Rob wants "find me every call where someone mentioned a competitor's warranty," he needs the embedding leg that Macro hasn't built.

### 5.5 The killer pattern, stated precisely

The reason Macro's calls feel like memory is a **four-property combination**, not any one trick:

1. **Recording and transcription are automatic and non-optional** — dispatched at room creation (`service.rs:456-482`), never a "start recording?" button. Nobody forgets.
2. **The transcript is indexed at segment granularity** with `participant_ids` on every doc, so permission filtering and moment-level deep-linking are free.
3. **Speaker identity is resolved twice** — voiceprint clustering during the call, then an LLM attribution pass against a *known candidate list* after it — so the searchable text says "Alice said X," not "speaker_2 said X."
4. **The agent is told to read the summary before the transcript**, so the cheap artifact absorbs most queries.

---

## 6. Real-time / in-call AI

**There is none.** Definitively:

- `transcriber.py:506` — `raise StopResponse()` terminates every turn before any LLM reply. The agent is constructed with `stt=` only: no `llm=`, no `tts=`.
- `room_options=room_io.RoomOptions(audio_input=True, text_input=False, text_output=True, audio_output=False, ...)` (`:565-571`) — **`audio_output=False`**. The agent structurally cannot speak into the room.
- `instructions="Transcribe user speech."` (`:161`).
- Summarization is triggered only from `process_webhook_event` on `room_finished` / last `participant_left` (`service.rs:813`, `:923`), i.e. strictly post-call.
- Frontend: grep for `transcript` in `apps/web/src/features/channel/Call/CallOverlay.tsx` returns only two permission-copy strings (`:357-358`). All transcript UI lives in `apps/web/src/features/block-call/` — the **playback** surface. `transcript-playback.ts` computes `getActiveTranscriptSequenceNum(sortedTranscript, playbackSeconds, timelineStartMs)` with a 250ms `ACTIVE_LEAD_MS` bias *"so short segments feel responsive"* — that's highlight-follows-the-scrubber on a recorded call, not live captions.

There is no `text_output` consumer in the room either — nothing renders the agent's text stream.

**Implication for Rob:** the live-AI-coach feature he wants is **not** in this codebase. Macro built the pipe (per-participant streaming STT with sub-second finalization at `endpointing: 400`) but deliberately left the whisper-in-the-ear off. The good news is that the pipe is the hard part, and it's the part that's most reusable.

---

## 7. Cross-reference: what Rob already has in `MLE ROB Dashboard`

I read the existing scaffolding so the verdict is grounded, not theoretical.

| Capability | MLE status | Path |
|---|---|---|
| Browser softphone | **Built, env-gated** | `components/CallButton.tsx` (`@twilio/voice-sdk ^2.18.3`, dynamic-imported), `app/api/twilio/token/route.ts` |
| Voice access token | **Built, no SDK** — hand-rolled HS256 JWT with `cty: twilio-fpa;v=1` | `lib/twilio.ts:mintVoiceToken` |
| Outbound TwiML + recording | **Built** — `<Dial record="record-from-answer-dual">` | `lib/twilio.ts:outgoingCallTwiml`, `app/api/twilio/voice/route.ts` |
| Recording webhook + signature check | **Built** (HMAC-SHA1 over url+sorted params, `timingSafeEqual`) | `app/api/webhooks/twilio-recording/route.ts`, `lib/twilio.ts:validateTwilioSignature` |
| Recording → activity **persistence** | **NOT built** — payload is `console.log`'d only | `route.ts:38` |
| Transcription | **Not built** | — |
| Transcripts table | **Not built** — `activities.transcript_url TEXT`, *"becomes FK when transcripts table lands (Task 7.4)"* | `supabase/migrations/0005_crm_core.sql:57` |
| Contact linkage | **BUILT — and better than Macro's** | `activities(person_id, org_id, deal_id)` with `num_nonnulls(person_id,org_id) <= 1` and `>= 1` anchor | `0005_crm_core.sql:42-63` |
| AI summary fields | **Schema ready** — `summary`, `action_items jsonb`, `buying_signals jsonb` | `0005_crm_core.sql:53-55` |
| AI-call ingest contract | **Delivered spec + impl** — phone matched on last 10 digits, idempotent `aidre-call-<callId>` | `docs/plans/AIDRE-CALL-PAYLOAD-SPEC.md`, `lib/aidreCall.ts` |
| Anthropic SDK | Present | `@anthropic-ai/sdk ^0.110.0` |
| Live AI coach | Not built | — |

Rob's `activities` schema is genuinely ahead of Macro here: `source in ('manual','n8n','api','aidre','dialer')`, `source_context jsonb`, `recording_url`, `transcript_url`, `buying_signals` — that is a **sales** call model. Macro's is a **meeting** model.

The gap is precisely: **`dialer` calls never get persisted, never get transcribed, and never get summarized.** The `aidre` path (AI receptionist) already does all three because AIDRE hands over a finished summary + transcript URL. The rep's own outbound calls are the hole.

---

## 8. Reusability verdict

### 8.1 Direct answer

**Yes — and the Rust is irrelevant. What's liftable is the control flow, the schema, and about six hard-won constants.** A TS/Next/Supabase shop can build browser softphone → recording → transcription → transcript-on-contact → AI summary in roughly 2–3 focused weeks, and Rob is already through the first two boxes.

### 8.2 Recommended stack mapping (Macro → Rob)

| Macro | Rob's equivalent | Rationale |
|---|---|---|
| LiveKit Cloud SFU | **Twilio Voice (already built)** | Rob needs **PSTN**, which Macro deliberately does not do. Twilio Voice JS SDK is already wired and env-gated. Do **not** swap to LiveKit for the dialer. |
| RoomComposite egress → MP4 | **Twilio `record="record-from-answer-dual"` (already built)** | Dual-channel is *better than Macro* for a 2-party sales call: rep on L, prospect on R. That is free perfect diarization. |
| S3 + CloudFront signed URLs | **Supabase Storage signed URLs** (or S3 if leaving Twilio's hosting) | Twilio hosts recordings by default and charges monthly per recording; copy to your own bucket in the webhook and delete from Twilio. |
| ffmpeg Lambda → PREVIEW.jpg | **Skip.** Audio-only — generate a waveform peaks JSON instead, or nothing. | No video to preview. |
| Deepgram nova-3 via LiveKit Inference | **Deepgram directly** — `@deepgram/sdk`, `nova-3`, **prerecorded** for v1, streaming for the coach | No LiveKit middleman = no margin stack. |
| Resemblyzer voice clustering | **Skip for v1.** Dual-channel gives you speakers for free. | Only needed for multi-party-on-one-mic. Revisit if reps do 3-way calls. |
| Python LiveKit Agent | **Next.js route handler / Supabase Edge Function** | Batch transcription needs no long-lived process. |
| OpenSearch per-segment index | **Postgres `tsvector` per segment**, + `pgvector` on segment text | Supabase has both. Do the vector leg Macro skipped. |
| `Sonnet4_6` summarizer | **`@anthropic-ai/sdk` (already a dependency)** | Same pattern. |

### 8.3 The nine patterns worth copying verbatim

1. **Automatic, non-optional capture.** Recording+transcription dispatched at call creation (`service.rs:456-482`), never a user decision. Rob's TwiML already does this via `record-from-answer-dual`. Keep it that way.
2. **Deterministic idempotency keys.** `segmentId = uuid5(NAMESPACE_URL, "{call}:{speaker}:{source}:{started_at}")` + `UNIQUE(call_id, segment_id)`. Rob already applies this at the activity level (`aidre-call-<callId>`); extend it to segments.
3. **Hot/cold table split.** `call_transcripts` (live, `ON DELETE CASCADE`) vs `call_record_transcripts` (archived, permanent) with a transactional `SELECT … FOR UPDATE` copy. For Rob: an in-progress `call_sessions` row promoted into `activities` + `call_transcripts` on completion.
4. **Two-stage timeline anchoring** (`recording_started_at` from the provider's start event, then overwritten by the earliest observed *first-audio-frame* across participants — `models.rs:202-209`). Without it, transcript highlighting drifts against playback. Twilio's `RecordingStartTime` is the analogue of stage one; stage two matters if you ever mix in a separate STT stream.
5. **Stop the meter explicitly before tearing down** (`service.rs:930-942`). Applies to any per-minute vendor. Twilio equivalent: don't rely on hangup cascade — `POST /Recordings/{sid}` stop, and reconcile daily.
6. **Two-pass speaker resolution.** Cheap mechanical pass (Macro: voiceprint clusters; Rob: dual-channel L/R) → LLM attribution pass **against a closed candidate list** → **validate the LLM's output in code** (`ai_call_summarizer.rs:309-341`: drop unknown ids, drop non-candidates, drop duplicates). For Rob the candidate list is trivially `[rep, contact]` from the CRM — which makes his attribution *strictly easier and more accurate than Macro's*.
7. **`NULL` / `UNTITLED` sentinels + skip-persistence.** An LLM asked to summarize a 4-second misdial will happily write a paragraph about how there's nothing to summarize. Make it emit a token, map to `None`, write nothing (`ai_call_summarizer.rs:58`, `:109`, `:244-255`). This single pattern is the difference between a timeline you trust and one you scroll past.
8. **Anti-throat-clearing prompt block.** Enumerate forbidden openers by example and ban bold-as-heading (`ai_call_summarizer.rs:31-45`). Rob's timeline entries are ~2 lines of visible real estate; every wasted opener is the whole entry.
9. **Segment-level search + summary-first tool schema.** Index per segment with the permission key on every doc; tell the agent *"use the summary before you read the transcript"* in the tool description itself (`read_call_record.rs:55`). Token cost of "what did we discuss with this roofer" drops by an order of magnitude.

### 8.4 The three constants to steal literally

| Constant | Value | Source | Why |
|---|---|---|---|
| Deepgram `endpointing` | **400 ms** | `transcriber.py:167-169` | *"Library default is 25ms, which cuts hesitant speakers mid-thought."* Prospects hesitate constantly. |
| Voice-cluster cosine threshold | **0.30** | `transcriber.py:52` | Only if you do voiceprints. |
| Min speech to embed | **1.0 s** (3.0 s rolling buffer) | `transcriber.py:55-57` | Short utterances produce garbage embeddings. |

### 8.5 What Macro does NOT give Rob (build these yourself)

- **PSTN / dialing / DTMF / call control.** Zero. Twilio side is entirely Rob's own (already ~built).
- **Contact linkage.** Macro anchors to channels. Rob's `activities(person_id|org_id|deal_id)` model is the right one and has no Macro analogue. His phone-match-on-last-10-digits rule (`AIDRE-CALL-PAYLOAD-SPEC.md`) is the join Macro never needed.
- **Live AI coaching.** Not present. Build it as a *second* consumer of a Deepgram **streaming** connection: Twilio Media Streams (`<Start><Stream>`) → WS → Deepgram live → sliding-window prompt → push suggestion to the rep's browser. Note the hard constraint Macro sidesteps by not doing it: `endpointing: 400` + LLM latency ≈ 1.5–2.5 s to a suggestion. Design the UI for "next question to ask," not "respond to what was just said."
- **Semantic search over transcripts.** Macro stopped at BM25. Rob should add pgvector over segment text — that's where "which prospects mentioned storm damage" lives.
- **Retention / cost governance.** Macro has none. Rob should ship an S3/Supabase lifecycle rule from day one; every-call-recorded compounds fast, and roofing sales calls carry two-party-consent exposure (cross-check `~/.claude/rules/ai-voice-legality.md` before enabling recording per state — that rule is mandatory for this build).

### 8.6 Concrete next three tasks for MLE

1. **Close the persistence hole.** `app/api/webhooks/twilio-recording/route.ts:38` currently `console.log`s. Wire `recordingToActivity()` → phone-match on last-10 (reuse `lib/aidreCall.ts`'s matcher) → upsert `activities` with `id = dialer-call-<CallSid>`, `type='call'`, `source='dialer'`. This is a small diff and it turns a scaffold into a feature.
2. **Add the transcripts table (Task 7.4) with segments, not blobs.** `call_transcripts(id, activity_id FK, segment_index, channel /* L=rep, R=contact */, speaker_role, content, started_ms, ended_ms, tsv tsvector, embedding vector(1536))`. Segment granularity is what makes moment-level search and playback-sync possible later; a single `transcript_text` column forecloses both.
3. **Deepgram prerecorded pass + Claude summary, both idempotent.** On recording-completed: pull the dual-channel WAV, `nova-3` with `multichannel=true` (channel 0 = rep, channel 1 = prospect — no diarization needed), write segments, then one Sonnet call producing `{summary, action_items, buying_signals}` straight into the columns that already exist in `0005_crm_core.sql`. Use Macro's `NULL` sentinel and anti-throat-clearing prompt block verbatim.

---

## 9. End-to-end sequence diagram

```mermaid
sequenceDiagram
    autonumber
    actor U as User (browser)<br/>livekit-client 2.18
    participant API as Rust API<br/>crates/call
    participant LK as LiveKit Cloud<br/>SFU + Egress + Agents
    participant AG as Transcriber Agent<br/>services/transcription (Python)
    participant DG as Deepgram nova-3<br/>(via LiveKit Inference)
    participant PG as Postgres<br/>+ pgvector
    participant S3 as S3 macro-call-recording
    participant L as Preview Lambda<br/>ffmpeg
    participant Q as SQS → search_processing
    participant OS as OpenSearch
    participant AI as Claude Sonnet4_6<br/>agent::complete

    Note over U,API: ── JOIN ──
    U->>API: POST /call/{channel_id}
    API->>LK: create_room(room = channel_id)<br/>empty_timeout 60s
    API->>PG: INSERT calls (ON CONFLICT → re-read)
    API->>LK: create_dispatch(agent="macro-transcriber")
    API->>LK: start_room_composite_egress<br/>MP4 H264/AAC → calls/{room}/{time}
    API->>PG: set_egress_id
    API-->>U: {token (6h JWT), roomName, serverUrl}
    API-)U: ws "call_started" (connection_gateway, NOT media)
    API-)U: APNs alert + PushKit VoIP (CXHandle .generic)
    U->>LK: connect(token) — mic on, camera off

    Note over LK,PG: ── LIVE ──
    LK->>API: webhook participant_joined (signed)
    API->>PG: add_participant (partial unique idx:<br/>one active call per user)
    LK->>API: webhook egress_started
    API->>PG: recording_started_at = created_at
    LK->>AG: dispatch job (AutoSubscribe.AUDIO_ONLY)
    AG->>AG: one AgentSession PER participant

    loop every utterance
        LK-->>AG: audio frames (tee'd into 3s ring buffer)
        AG->>DG: stream (endpointing 400ms, diarize, filler_words)
        DG-->>AG: FINAL_TRANSCRIPT + word offsets + speaker ints
        AG->>AG: refine stream_t0 = MIN(now − last_word.end)
        AG->>AG: Resemblyzer 256-d embed (≥1.0s, worker thread)<br/>cosine-cluster @ 0.30 → diarizedSpeakerId
        AG->>API: POST /call/{cid}/transcript<br/>x-macro-internal-call: secret<br/>{segmentId uuid5, content, startedAt,<br/>streamStartedAt, embedding[256]}
        API->>PG: reuse voice_id for speaker,<br/>else voice_repo.upsert_voice(embedding)
        API->>PG: INSERT call_transcripts<br/>UNIQUE(call_id, segment_id) → idempotent
        Note right of AG: raise StopResponse()<br/>❌ NO live AI, NO TTS,<br/>❌ NO live captions in UI
    end

    Note over LK,OS: ── END ──
    LK->>API: webhook participant_left (last one)
    API->>PG: archive_call — FOR UPDATE, copy calls→call_records<br/>+ transcripts, same id, grant team View
    API->>LK: stop_egress FIRST (anti runaway-billing)
    API->>LK: delete_room
    API-)U: ws "call_ended"

    par AI enrichment (tokio::spawn)
        API->>AI: generate_custom_speakers(rows JSON, candidate user ids)
        AI-->>API: [{call_transcript_id, custom_speaker}]
        API->>API: validate in code — drop unknown ids /<br/>non-candidates / duplicates
        API->>PG: overwrite_custom_speakers
        API->>AI: summarize_call (no throat-clearing, "NULL" if empty)
        AI-->>API: summary | NULL → skip persist
        API->>PG: insert_call_summary
        API->>AI: generate_call_name(summary)
        AI-->>API: title | UNTITLED_CALL → skip
        API->>PG: set_custom_name_if_null
    and Voice enrollment
        API->>PG: stable speakers (same diarized_id in ALL rows)
        API->>PG: link macro_user_voice (cross-call voiceprint directory)
    and Search indexing
        API->>Q: SQS CallRecord{call_id}
        Q->>PG: get_call_record_search_payload
        Q->>OS: bulk upsert — ONE DOC PER SEGMENT<br/>{transcript_id, speaker_id, content, participant_ids, properties}
    end

    Note over S3,L: ── PREVIEW (parallel, S3-event driven) ──
    LK->>S3: PUT calls/{room}/{time}.mp4
    LK->>API: webhook egress_ended (file_url)
    API->>PG: set_recording_key (calls OR call_records)
    S3->>L: ObjectCreated prefix=calls/ suffix=.mp4
    L->>L: skip ladder (PREVIEW.jpg self-trigger guard)
    L->>S3: presign GET (ffmpeg streams, never downloads)
    L->>L: ffprobe duration → ffmpeg -ss dur/2 -frames:v 1<br/>fallback -ss 0 if 0 bytes; 60s timeout
    L->>S3: PUT calls/{room}/{stem}/PREVIEW.jpg
    L->>PG: UPDATE calls AND call_records SET preview_url<br/>0 rows → bail → Lambda retry (beats archival race)

    Note over U,AI: ── CONSUME ──
    U->>API: GET /call/record/{call_id} (EntityAccessReceipt<View>)
    API->>S3: CloudFront-sign mp4 + jpg (per request, never stored)
    API-->>U: CallRecord {summary, customName, transcript[],<br/>recordingUrl, recordingPreviewUrl, recordingStartedAt}
    U->>U: transcript-playback.ts — highlight follows scrubber<br/>(250ms ACTIVE_LEAD_MS bias)
    AI->>API: tool ListEntities(includeTypes:["call"]) → callId
    AI->>API: tool ReadCallRecord(callId)<br/>"use summary before transcript"
    Note over AI: ⚠️ Anchored to CHANNEL + macro users.<br/>NO contact / CRM / phone-number linkage anywhere.
```

---

## 10. File index (every path cited)

**Rust — call domain**
`crates/call/Cargo.toml` · `src/domain/models.rs` · `src/domain/service.rs` · `src/domain/ports.rs` · `src/domain/entity_mutation.rs` · `src/outbound/livekit_rtc_client.rs` · `src/outbound/s3_recording_storage.rs` · `src/outbound/ai_call_summarizer.rs` · `src/outbound/pg_call_repo.rs` · `src/outbound/pg_voice_repo.rs` · `src/inbound/axum_router.rs` · `src/inbound/toolset/read_call_record.rs`

**Transcription**
`services/transcription/transcriber.py` · `requirements.txt` · `Dockerfile` · `justfile` · `livekit.dev.toml` · `livekit.prod.toml`

**Preview lambda**
`services/call_recording_preview_handler/src/{main,lib,event,key,ffmpeg,db}.rs` · `scripts/package-ffmpeg.sh`

**Search**
`services/document_storage_service/src/service/call_search_indexer.rs` · `services/search_processing_service/src/process/call.rs`

**Migrations** (`crates/macro_db_client/migrations/`)
`20260331170640_add_call_tables.sql` · `20260402170841_call_share_permissions.sql` · `20260414120000_call_recording_key.sql` · `20260421120000_call_share_with_team.sql` · `20260424120000_call_participants_one_active_per_user.sql` · `20260424120100_call_record_summary.sql` · `20260424130000_call_transcripts_diarized_speaker_id.sql` · `20260427120000_call_record_custom_name.sql` · `20260429150324_call_record_transcripts_custom_speaker.sql` · `20260430120000_call_recording_started_at.sql` · `20260511131822_add_voice_tables.sql` · `20260511131823_call_transcripts_voice_id.sql` · `20260511131824_call_record_transcripts_voice_id.sql` · `20260604160449_call_record_preview_url.sql` · `20260709192942_add_call_record_property_entity_type.sql`

**Infra**
`infra/stacks/call-recording/index.ts` · `call-recording-preview-lambda.ts` · `Pulumi.{yaml,dev.yaml,prod.yaml}`

**Frontend**
`apps/web/package.json` · `src/features/channel/Call/**` (`livekit-loader.ts`, `LivekitJsCallController.ts`, `CallSessionController.ts`, `CallOverlay.tsx`, `use-call.ts`, `use-callkit.ts`) · `src/features/block-call/component/{CallTranscript.tsx,transcript-playback.ts,CallRecording/*}` · `src/lib/queries/soup/transform-utils.ts` · `src/lib/core/component/AI/component/tool/ReadCallRecord.tsx` · `tauri/callkit_plugin/ios/Sources/{IncomingCallCoordinator,CallKitPlugin,NativeLiveKitCallSession,CallPictureInPictureController,CallVideoOverlayController}.swift`

**Root**
`Cargo.toml` · `Cargo.lock` · `README.md` · `apps/docs/faq.mdx`

**Negative-result greps (no telephony found)**
`crates/crm/src/domain/generic_email_domains.rs:436` (only `twilio` hit — a domain string) · `crates/crm/src/outbound/apollo_resolver.rs:149` (only `phone` hit — Apollo company field)

**Rob's repo (cross-reference)**
`MLE ROB Dashboard/docs/plans/AIDRE-CALL-PAYLOAD-SPEC.md` · `lib/twilio.ts` · `lib/aidreCall.ts` · `components/CallButton.tsx` · `app/api/twilio/{token,voice}/route.ts` · `app/api/webhooks/twilio-recording/route.ts` · `supabase/migrations/0005_crm_core.sql` · `package.json`
