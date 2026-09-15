#!/usr/bin/env bash
set -euo pipefail
# usage: JWT=... ANON=... turn.sh <nn> <message>
NN="$1"; MSG="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
BODY="$(node -e '
const [msg, now] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  message: msg,
  channel: "web",
  scope: "qa-rose-lifecycle-2026-07-12-r1",
  force_full_ai: true,
  client_now_iso: now,
  client_timezone: "Europe/Paris",
}));' "$MSG" "$NOW")"
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/test-send-message" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -H "x-user-authorization: Bearer $JWT" \
  -H "content-type: application/json" \
  --data "$BODY" \
  --max-time 300 > "$DIR/t$NN.raw.json"
node -e '
const fs = require("fs");
const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const r = j.response || {};
const t = j.conversation_turn_trace || {};
const pick = (o, ...keys) => { for (const k of keys) { if (o && o[k] !== undefined && o[k] !== null) return o[k]; } return null; };
const out = {
  ok: j.ok, status_hint: j.empty_response ? "empty" : (j.aborted ? "aborted" : "ok"),
  response_owner: t.response_owner ?? null,
  route: pick(t.route_decision || {}, "selected_handler", "handler", "owner"),
  route_reason: pick(t.route_decision || {}, "route_reason", "reason"),
  safety: t.safety_pregate ? pick(t.safety_pregate, "level", "verdict", "status") : null,
  direct_effects: t.direct_effects ?? null,
  skill_run: t.skill_run ? { skill: pick(t.skill_run, "skill", "skill_id", "name"), status: pick(t.skill_run, "status"), kind: pick(t.skill_run, "kind") } : null,
  tool_skill_run: t.tool_skill_run ? { tool: pick(t.tool_skill_run, "tool", "tool_id", "name"), status: pick(t.tool_skill_run, "status") } : null,
  memory_candidates: t.memory_write_candidates_emitted ?? null,
  latency_ms: t.total_latency_ms ?? null,
};
console.log("=== SOPHIA ===");
console.log(String(r.content ?? "").trim());
console.log("=== TRACE ===");
console.log(JSON.stringify(out, null, 1));
' "$DIR/t$NN.raw.json"
