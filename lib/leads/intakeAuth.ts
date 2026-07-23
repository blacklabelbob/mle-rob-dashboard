// Task 5.1 per-product bearer tokens (pure, CR-3). Env holds one key per
// product (LEADS_KEY_AIDRE / LEADS_KEY_AIVA); the presented token decides
// which product(s) the caller may claim to be — an AIDRE key can never
// submit an AIVA lead. No key set at all → the endpoint is unconfigured
// (503, inert), same env-gating posture as Vapi/Twilio/AIDRE webhooks.

import type { IntakeProduct } from "./intakePayload";

export interface LeadKeys {
  aidre?: string;
  aiva?: string;
}

export function leadKeysFromEnv(env: NodeJS.ProcessEnv): LeadKeys {
  const keys: LeadKeys = {};
  if (env.LEADS_KEY_AIDRE?.trim()) keys.aidre = env.LEADS_KEY_AIDRE.trim();
  if (env.LEADS_KEY_AIVA?.trim()) keys.aiva = env.LEADS_KEY_AIVA.trim();
  return keys;
}

export function leadsConfigured(keys: LeadKeys): boolean {
  return Boolean(keys.aidre || keys.aiva);
}

/** "Bearer <token>" → token, else null (missing/malformed header). */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/**
 * Which products this token is allowed to submit as. Normally one entry;
 * if Rob sets both env vars to the same value the token simply grants both
 * (harmless — still his key). Unknown token → empty array → 401.
 */
export function productsForToken(keys: LeadKeys, token: string): IntakeProduct[] {
  const products: IntakeProduct[] = [];
  if (keys.aidre && token === keys.aidre) products.push("aidre");
  if (keys.aiva && token === keys.aiva) products.push("aiva");
  return products;
}
