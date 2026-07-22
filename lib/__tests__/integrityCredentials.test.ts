import { describe, expect, it } from "vitest";
import {
  checkCredentials,
  credentialFlagTitle,
  decodeJwtExpMs,
} from "@/lib/integrity/credentials";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-07-22T12:00:00Z");

function jwtWithExp(expMs: number): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    role: "service_role",
    exp: Math.floor(expMs / 1000),
  })}.fakesig`;
}

describe("decodeJwtExpMs", () => {
  it("reads exp from a real-shaped JWT", () => {
    expect(decodeJwtExpMs(jwtWithExp(NOW + DAY_MS))).toBe(
      Math.floor((NOW + DAY_MS) / 1000) * 1000
    );
  });

  it("returns null for non-JWT secrets and malformed tokens", () => {
    expect(decodeJwtExpMs("sk-ant-not-a-jwt")).toBeNull();
    expect(decodeJwtExpMs("a.b.c")).toBeNull(); // unparseable payload
    const noExp = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(
      JSON.stringify({ role: "x" })
    ).toString("base64url")}.sig`;
    expect(decodeJwtExpMs(noExp)).toBeNull();
  });
});

describe("checkCredentials — Task 3.8 DoD: within 7 days of expiry → alert", () => {
  it("flags a key 3 days from expiry as expiring", () => {
    const out = checkCredentials(
      [{ name: "SUPABASE_SERVICE_ROLE_KEY", token: jwtWithExp(NOW + 3 * DAY_MS) }],
      NOW
    );
    expect(out).toEqual([
      {
        name: "SUPABASE_SERVICE_ROLE_KEY",
        status: "expiring",
        daysLeft: 3,
        expiresAt: "2026-07-25",
      },
    ]);
  });

  it("flags an already-expired key as expired", () => {
    const out = checkCredentials(
      [{ name: "N8N_API_KEY", token: jwtWithExp(NOW - DAY_MS) }],
      NOW
    );
    expect(out[0]).toMatchObject({ status: "expired", daysLeft: 0 });
  });

  it("stays silent beyond the 7-day window, for unset env, and for non-JWTs", () => {
    const out = checkCredentials(
      [
        { name: "FAR_OUT", token: jwtWithExp(NOW + 8 * DAY_MS) },
        { name: "UNSET", token: undefined },
        { name: "CRON_SECRET", token: "plain-random-secret" },
      ],
      NOW
    );
    expect(out).toEqual([]);
  });

  it("boundary: exactly 7 days out alerts; findings never carry token values", () => {
    const token = jwtWithExp(NOW + 7 * DAY_MS);
    const out = checkCredentials([{ name: "K", token }], NOW);
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain(token.slice(0, 12));
  });

  it("flag title is deterministic and re-arms on rotation (new exp → new title)", () => {
    const f1 = checkCredentials(
      [{ name: "K", token: jwtWithExp(NOW + 2 * DAY_MS) }],
      NOW
    )[0];
    const f2 = checkCredentials(
      [{ name: "K", token: jwtWithExp(NOW + 6 * DAY_MS) }],
      NOW
    )[0];
    expect(credentialFlagTitle(f1)).toBe(
      "Credential expiring: K (exp 2026-07-24)"
    );
    expect(credentialFlagTitle(f1)).not.toBe(credentialFlagTitle(f2));
  });
});
