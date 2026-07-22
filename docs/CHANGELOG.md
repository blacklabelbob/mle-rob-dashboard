# Changelog — docs

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Auto-initialized by changelog-guard hook.

## [Unreleased]

### Added
- 2026-07-21 — Task 7.2 dialer server scaffold (env-gated, zero breakage while TWILIO_* unset): `lib/twilio.ts` (voice-token mint, webhook signature validation, recording→activity mapper, outgoing-call TwiML), routes `/api/twilio/token`, `/api/twilio/voice`, `/api/webhooks/twilio-recording`; 12 unit tests (27/27 total). PRD-mle-crm v3.0.2 synced same commit (Task 7.2 progress note, dialer-decision dependency closed, Twilio-creds gate row added).
- Project changelog initialized on 2026-07-21.

