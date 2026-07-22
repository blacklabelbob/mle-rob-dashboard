// PRD Task 3.6 — silent-failure watchdog for the n8n capture workflows
// (Gmail capture, AIDRE, future senders). n8n's own Error Trigger workflow
// POSTs every workflow failure to /api/webhooks/n8n-error within seconds of
// the error (meets the 15-min DoD; the nightly integrity cron cannot), and
// this module maps that payload to a flags-ledger row per the findings
// protocol (Rob 2026-07-22).
//
// Pure per CR-3: no network, no clock — time comes in as a parameter.
// Idempotency: deterministic title = one flag per workflow per day, so a
// credential broken at 09:00 (Gmail polls every minute → a failure storm)
// raises ONE flag, and re-posts never dupe. Next day still failing → next
// day's flag, so Rob is re-alerted until it's actually fixed.

export interface N8nErrorPayload {
  workflow?: { id?: string; name?: string };
  // normal workflow-run failure
  execution?: {
    id?: string;
    url?: string;
    lastNodeExecuted?: string;
    error?: { message?: string };
  };
  // polling-trigger failure (no execution ever starts — exactly the
  // bad-credential Gmail case): n8n sends `trigger` instead of `execution`
  trigger?: { error?: { message?: string } };
}

export interface CaptureAlertFlag {
  title: string;
  detail: string;
  severity: "high";
}

export function captureFlagTitle(workflowName: string, dayIso: string): string {
  return `Capture workflow failing: ${workflowName} (${dayIso})`;
}

export function errorToFlag(
  payload: N8nErrorPayload,
  nowIso: string
): CaptureAlertFlag | null {
  const name = payload?.workflow?.name?.trim();
  if (!name) return null;

  const message =
    payload.execution?.error?.message?.trim() ||
    payload.trigger?.error?.message?.trim() ||
    "unknown error";
  const node = payload.execution?.lastNodeExecuted;
  const execRef =
    payload.execution?.url ??
    (payload.execution?.id
      ? `execution ${payload.execution.id}`
      : "trigger failure — no execution started");

  return {
    title: captureFlagTitle(name, nowIso.slice(0, 10)),
    detail:
      `n8n workflow "${name}" errored: ${message}` +
      (node ? ` (node: ${node})` : "") +
      `. First failure seen ${nowIso}; ${execRef}. ` +
      "Capture may be silently down — check the n8n execution log.",
    severity: "high",
  };
}
