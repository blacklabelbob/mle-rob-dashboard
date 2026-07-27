"use client";

import { useEffect, useRef, useState } from "react";
import { playbackErrorNotice, playbackLabel, playbackSource } from "@/lib/calls/recordingAudio";
import { seekBlockedNotice } from "@/lib/calls/playbackSeek";

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
  registerSeek,
}: {
  recordingSid: string | null | undefined;
  recordingUrl: string | null | undefined;
  direction?: string | null;
  duration?: string | null;
  /**
   * inc.32: publishes this player's seek handle to the row above, so the transcript's jump
   * list can reach it. Called with `null` whenever there is nothing seekable — which is what
   * makes `seekPlan`'s `no-player` branch true rather than assumed.
   */
  registerSeek?: (seek: ((seconds: number) => void) | null) => void;
}) {
  const source = playbackSource({ recordingSid, recordingUrl });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const src = source.kind === "proxied" ? source.src : null;

  // inc.32. Publishing is an effect, not a render-time call: the handle must reach the parent
  // only for an element that is actually mounted, and it must be RETRACTED on unmount —
  // a stale handle held across a re-render seeks a detached `<audio>`, i.e. nothing at all,
  // and the rep's click looks like a broken moment rather than a closed transcript.
  useEffect(() => {
    if (!registerSeek) return;
    if (!src) {
      // Rule 2: an absent or unplayable recording publishes NOTHING. The jump then plans
      // `no-player` and says nothing about audio, instead of reporting a failed seek beside
      // a player the rep can see is not there.
      registerSeek(null);
      return;
    }
    registerSeek((seconds) => {
      const el = audioRef.current;
      if (!el) return;
      try {
        el.currentTime = seconds;
        // Rule 3: with `preload="none"` nothing has loaded, so a bare `currentTime` assignment
        // is invisible — the control still reads 0:00. The seek IS the play.
        void Promise.resolve(el.play()).catch(() => setNotice(seekBlockedNotice()));
      } catch {
        // Rule 4, synchronous half: a refusal from the element itself is still a refusal the
        // rep asked for by name.
        setNotice(seekBlockedNotice());
      }
    });
    return () => registerSeek(null);
  }, [registerSeek, src]);

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
