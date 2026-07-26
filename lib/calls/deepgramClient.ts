// BUILD-QUEUE Q68 (c), second half: the actual request to Deepgram.
//
// inc.3 decided what a response is ALLOWED to become (lib/calls/deepgram.ts, pure).
// This file is the only place that touches the network, and it hands whatever comes
// back — success, provider error, or transport failure — to that same mapper, so a
// transcript row is shaped by ONE code path no matter how the call went.
//
// Env-gated exactly like the Vapi/Twilio seams: with DEEPGRAM_API_KEY unset,
// deepgramConfigured() is false, nothing is requested, and nothing anywhere changes.

import {
  type DeepgramMapping,
  type DeepgramResponse,
  mapDeepgramResponse,
} from "./deepgram";

export interface DeepgramEnv {
  apiKey?: string;
}

export function deepgramEnv(env: NodeJS.ProcessEnv = process.env): DeepgramEnv {
  return { apiKey: env.DEEPGRAM_API_KEY };
}

export function deepgramConfigured(env: DeepgramEnv): boolean {
  return Boolean(env.apiKey);
}

export const DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen";

/**
 * The request shape is pinned here, in code, because it is what decides which rung of
 * inc.3's granularity ladder we land on. `utterances=true` is the difference between
 * per-utterance rows and one call-spanning segment; `diarize=true` is the difference
 * between a speaker column and every row unattributed. Tuning these in a dashboard
 * would make the stored rows depend on invisible state.
 */
export const DEEPGRAM_QUERY: Readonly<Record<string, string>> = Object.freeze({
  model: "nova-2",
  smart_format: "true",
  punctuate: "true",
  diarize: "true",
  utterances: "true",
});

/** Twilio re-POSTs on a non-2xx, so a hung provider must not hold the webhook open. */
export const DEEPGRAM_TIMEOUT_MS = 20_000;

export function deepgramUrl(recordingUrl: string, endpoint = DEEPGRAM_ENDPOINT): string {
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(DEEPGRAM_QUERY)) url.searchParams.set(k, v);
  url.searchParams.set("url", recordingUrl);
  return url.toString();
}

/**
 * A recording URL we are willing to hand to a third party to fetch.
 *
 * Deepgram fetches this URL itself, so an unvalidated value is an SSRF primitive
 * pointed at someone else's egress. http/file/gopher and hostless strings are refused
 * outright rather than "cleaned up" — a typo'd recording URL should fail loudly here,
 * not silently transcribe something that is not the call.
 */
export function usableRecordingUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url.toString();
}

export type DeepgramFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export type DeepgramRequest = {
  recordingSid: string;
  recordingUrl: string;
  env?: DeepgramEnv;
  fetchImpl?: DeepgramFetch;
  endpoint?: string;
  timeoutMs?: number;
};

export type DeepgramOutcome =
  /** No key configured — not a failure, and deliberately NOT a `failed` transcript row. */
  | { kind: "disabled" }
  /** The request was never made because the inputs could not be trusted. */
  | { kind: "invalid"; reason: string }
  /** We heard back (200, provider error, or transport failure) — a row is owed either way. */
  | { kind: "mapped"; mapping: DeepgramMapping; httpStatus?: number };

function failedMapping(recordingSid: string, error: string): DeepgramMapping | null {
  // Route the failure through the SAME mapper as a success so `failed` rows are built
  // in one place; the mapper reads Deepgram's own error shape.
  return mapDeepgramResponse(recordingSid, { err_msg: error } as DeepgramResponse);
}

/**
 * Ask Deepgram to transcribe a recording, and return something the store can write.
 *
 * Every non-disabled outcome yields a transcript row. A call we tried and could not
 * transcribe must be visibly `failed` with the reason attached — a missing row is
 * indistinguishable from a call nobody ever asked about, which is exactly the pair a
 * retry has to tell apart (inc.2's two-table rule).
 *
 * The API key is never echoed into an error string: these errors end up in logs and,
 * later, on a screen.
 */
export async function requestDeepgramTranscript(
  req: DeepgramRequest
): Promise<DeepgramOutcome> {
  const env = req.env ?? deepgramEnv();
  if (!deepgramConfigured(env)) return { kind: "disabled" };

  const url = usableRecordingUrl(req.recordingUrl);
  if (!url) return { kind: "invalid", reason: "unusable recording url" };

  const probe = mapDeepgramResponse(req.recordingSid, {});
  if (!probe) return { kind: "invalid", reason: "missing recording sid" };

  const doFetch = req.fetchImpl ?? ((input, init) => fetch(input, init) as never);
  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEEPGRAM_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(deepgramUrl(url, req.endpoint), {
      method: "POST",
      headers: {
        Authorization: `Token ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      // Prefer Deepgram's own err_code/err_msg when the body carries one; the mapper
      // already knows that shape. A bare status is the last resort, not the default.
      const carried =
        body && typeof body === "object" && ("err_msg" in body || "err_code" in body)
          ? (body as DeepgramResponse)
          : ({ err_msg: `deepgram http ${res.status}` } as DeepgramResponse);
      const mapping = mapDeepgramResponse(req.recordingSid, carried);
      return mapping
        ? { kind: "mapped", mapping, httpStatus: res.status }
        : { kind: "invalid", reason: "missing recording sid" };
    }

    const mapping = mapDeepgramResponse(req.recordingSid, body as DeepgramResponse);
    return mapping
      ? { kind: "mapped", mapping, httpStatus: res.status }
      : { kind: "invalid", reason: "missing recording sid" };
  } catch (err) {
    // Transport failure / abort. Still a row: the call exists and we owe it a state.
    const aborted =
      (err as { name?: string })?.name === "AbortError" || controller.signal.aborted;
    const reason = aborted
      ? `deepgram request timed out after ${timeoutMs}ms`
      : `deepgram request failed: ${(err as Error)?.message ?? "unknown error"}`;
    const mapping = failedMapping(req.recordingSid, reason);
    return mapping
      ? { kind: "mapped", mapping }
      : { kind: "invalid", reason: "missing recording sid" };
  } finally {
    clearTimeout(timer);
  }
}
