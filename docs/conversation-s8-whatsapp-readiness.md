# S8 WhatsApp Readiness

S8 is implemented as local readiness guardrails plus a pilot checklist. The
pilot-number checks still need to be run against Meta/WhatsApp, because local CI
uses loopback or disabled delivery.

## Local Coverage

Run:

```bash
deno test --allow-read supabase/functions/sophia-brain/whatsapp_readiness/readiness.test.ts supabase/functions/sophia-brain/test_harness/conversation_route_replay/runner_test.ts supabase/functions/sophia-brain/test_harness/latency/runner_test.ts
```

Covered locally:

- typing/waiting fallback payload for WhatsApp replies;
- timeout fallback after 8 seconds;
- burst coalescing for messages received within 3 seconds;
- 10 WhatsApp realism fixtures: `ok`, `ouais`, `vas-y`, `non merci`, `bof`,
  `fais`, emoji-only confirmation, no punctuation, correction after
  confirmation, late cancellation;
- 30-conversation latency harness with average < 4s and p95 < 6s budgets.

## Pilot Checklist

- Verify Meta webhook handshake on the pilot number.
- Send one inbound text and confirm Sophia logs `chat_messages` with
  `metadata.channel = whatsapp`.
- Confirm outbound text delivery from Sophia to the pilot number.
- During a slow response, confirm the waiting indicator/fallback message is
  visible before the final answer.
- Send three messages within 3 seconds and confirm the combined text is the unit
  passed to the conversation runtime.
- Export 8+ real conversations and run the S7 judge harness on them.
- Collect qualitative feedback on coherence, warmth, and product alignment.

## Go / No-Go

Beta can be marked ready only when:

- all local S0-S8 tests pass;
- pilot inbound and outbound WhatsApp messages work on a real number;
- no critical safety or identity-freeze flags appear in real-conversation judge
  reports;
- average E2E latency stays below 4s and p95 below 6s on at least 30
  conversations;
- human feedback does not report recurring confusion, intrusive product pushes,
  or stale-memory usage.
