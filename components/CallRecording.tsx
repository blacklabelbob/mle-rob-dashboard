"use client";

import { useRef, useState } from "react";
import { playbackErrorNotice, playbackLabel, playbackSource } from "@/lib/calls/recordingAudio";

// BUILD-QUEUE Q68 inc.31 — THE PLAYER EXISTS. The last unbuilt hop of the playback chain.
//
// inc.28 decided what a player may be pointed at, inc.29 decided what our server sends
// upstream, inc.30 built the route — and there was still NO player: every one of them ended
// on a seam whose only consumer was the next seam. This is the element, and like
// CallTranscript it is markup over decisions made in lib (CR-3) — it invents no sentence of
// its own; `playbackSource` and `playbackErrorNotice` own every word a rep reads here.
//
// WHAT THIS REPLACES, AND WHY THAT MATTERS: the row used to render a bare
// `<a href={detail.recordingUrl}>recording</a>` — the exact raw link `recordingAudio` rule 3
// forbids. It is protected by Twilio account auth, so it 401s in the rep's face (a dead end
// dressed as an answer) — and if Twilio's protection were ever relaxed it would be WORSE,
// because then it works: verbatim customer speech on a URL that needs no login, next to a
// prod Rob left unauthenticated (Q64). The link goes; the proxy route takes its place.
//
// THREE RULES THAT ARE NOT COSMETIC:
//
//  1. `preload="none"`, ALWAYS. A person page lists a dozen calls. `metadata` or `auto` makes
//     the browser open every one of those recordings through our credentialed proxy the
//     instant the page paints — pulling verbatim customer speech for calls nobody asked to
//     hear, and paying Twilio egress for each. Playing is a deliberate act, same rule as
//     CallTranscript's "it does not fetch until asked".
//
//  2. AN ERROR IS SHOWN, NEVER SWALLOWED. `<audio>` fails SILENTLY by default — no console
//     entry a rep will see, no visual change; the play button simply does nothing forever.
//     That is indistinguishable from a broken recording, which is why inc.28 exists at all.
//
//  3. THE ERROR CLEARS WHEN A LOAD SUCCEEDS. A stale "we could not load this" printed under
//     a player that is currently playing is inc.26's staleness rule in a new costume.

export default function CallRecording({
  recordingSid,
  recordingUrl,
  direction,
  duration,
}: {
  recordingSid: string | null | undefined;
  recordingUrl: string | null | undefined;
  direction?: string | null;
  duration?: string | null;
}) {
  const source = playbackSource({ recordingSid, recordingUrl });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Rule 4 of the lib: absent renders NOTHING — no player, no sentence. A call without a
  // recording is not a call whose recording failed.
  if (source.kind === "absent") return null;

  if (source.kind === "unplayable") {
    // …and unplayable renders a sentence, because saying nothing here would claim the call
    // has no recording when it has one we are declining to serve.
    return <p className="mt-1.5 text-[11px] text-amber-300/80">{source.reason}</p>;
  }

  return (
    <div className="mt-1.5">
      <audio
        ref={audioRef}
        src={source.src}
        controls
        preload="none"
        aria-label={playbackLabel({ direction, duration })}
        className="h-8 w-full max-w-md"
        onError={() => setNotice(playbackErrorNotice(audioRef.current?.error?.code))}
        // Rule 3: a load that gets far enough to know its duration has superseded whatever
        // the last failure said.
        onLoadedMetadata={() => setNotice(null)}
      />
      {notice && <p className="mt-1 text-[11px] text-amber-300/80">{notice}</p>}
    </div>
  );
}
