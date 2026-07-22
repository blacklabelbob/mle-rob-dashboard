"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";

// Rep-cockpit Call button (PRD Task 7.2). Env-gated end to end: the server
// token route 503s while TWILIO_* is unset, the one-per-page probe below sees
// that, and every button renders the exact tel: link the cockpit shipped with —
// zero breakage without creds. Only a 200 probe upgrades it to a browser call,
// and only then is @twilio/voice-sdk downloaded (dynamic import).
let availabilityProbe: Promise<boolean> | null = null;
function dialerAvailable(): Promise<boolean> {
  availabilityProbe ??= fetch("/api/twilio/token")
    .then((r) => r.ok)
    .catch(() => false);
  return availabilityProbe;
}

type Phase = "tel" | "ready" | "connecting" | "live" | "failed";

const CALL_CLS =
  "rounded-lg bg-emerald-500/90 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-400";
const HANGUP_CLS =
  "rounded-lg bg-rose-500/90 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-400";

export default function CallButton({ phone }: { phone: string }) {
  const digits = phone.replace(/[^+\d]/g, "");
  const [phase, setPhase] = useState<Phase>("tel");
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);

  useEffect(() => {
    let alive = true;
    dialerAvailable().then((ok) => {
      if (alive && ok) setPhase("ready");
    });
    return () => {
      alive = false;
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  }, []);

  async function dial() {
    setPhase("connecting");
    try {
      const res = await fetch("/api/twilio/token");
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token);
      deviceRef.current = device;
      const call = await device.connect({ params: { To: digits } });
      callRef.current = call;
      call.on("accept", () => setPhase("live"));
      call.on("disconnect", () => {
        callRef.current = null;
        device.destroy();
        deviceRef.current = null;
        setPhase("ready");
      });
      call.on("error", () => setPhase("failed"));
    } catch {
      // Mic denied, token expired mid-flight, SDK load failed — degrade to tel:.
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setPhase("failed");
    }
  }

  function hangUp() {
    callRef.current?.disconnect();
    callRef.current = null;
    deviceRef.current?.destroy();
    deviceRef.current = null;
    setPhase("ready");
  }

  if (phase === "tel" || phase === "failed") {
    return (
      <a href={`tel:${digits}`} className={CALL_CLS}>
        Call
      </a>
    );
  }
  if (phase === "connecting" || phase === "live") {
    return (
      <button type="button" onClick={hangUp} className={HANGUP_CLS}>
        {phase === "live" ? "Hang up" : "Calling…"}
      </button>
    );
  }
  return (
    <button type="button" onClick={dial} className={CALL_CLS}>
      Call
    </button>
  );
}
