// PRD Task 3.8: credential-expiry check, pure per CR-3. Instead of a
// hand-maintained (and inevitably stale) expiry registry, we decode the real
// `exp` claim from JWT-shaped credentials the app actually holds (Supabase
// legacy keys are JWTs; n8n API keys too, when one lands in env). Non-JWT
// secrets (CRON_SECRET, webhook secrets, Anthropic key) have no built-in
// expiry — their failure mode is revocation, documented with detection
// methods in docs/plans/CRM-FAILURE-MODES.md.
// Caller supplies tokens + now; this only judges. Alerts ride the flags
// ledger. Token VALUES never leave this module — findings carry names only.

const WARN_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export type CredentialInput = {
  /** Env-var name — the only identifier that ever reaches the flags ledger. */
  name: string;
  token: string | undefined;
};

export type CredentialFinding = {
  name: string;
  status: "expired" | "expiring";
  /** Whole days until exp (negative never emitted; expired clamps context to detail). */
  daysLeft: number;
  expiresAt: string; // ISO date (day precision — no secrets, no jitter)
};

/** Decode the `exp` claim (ms epoch) from a JWT, or null if not a JWT / no exp. */
export function decodeJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Deterministic flag title — idempotency key against the flags ledger. The
// expiry date is part of the key on purpose: rotating a key changes its exp,
// which mints a fresh title and re-arms the alert cycle for the new key.
export function credentialFlagTitle(f: CredentialFinding): string {
  return `Credential ${f.status}: ${f.name} (exp ${f.expiresAt})`;
}

export function checkCredentials(
  creds: CredentialInput[],
  nowMs: number
): CredentialFinding[] {
  const findings: CredentialFinding[] = [];
  for (const c of creds) {
    if (!c.token) continue; // unset env = feature off, not a finding
    const expMs = decodeJwtExpMs(c.token);
    if (expMs === null) continue; // non-JWT → no decodable expiry (see failure-modes doc)
    const msLeft = expMs - nowMs;
    if (msLeft > WARN_WINDOW_DAYS * DAY_MS) continue;
    findings.push({
      name: c.name,
      status: msLeft <= 0 ? "expired" : "expiring",
      daysLeft: Math.max(0, Math.floor(msLeft / DAY_MS)),
      expiresAt: new Date(expMs).toISOString().slice(0, 10),
    });
  }
  return findings;
}
