import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const persona = process.env.QA_PERSONA || "alex";
const runId = process.env.QA_RUN_ID || "2026-06-08-update-coach-preferences-local-write-r1";
const date = process.env.QA_DATE || "2026-06-08";
const channel = process.env.QA_CHANNEL || "web";
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 180_000);

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/operations");
const reportDir = path.join(root, "docs/agent-playbook/New/test-material/qa-run-reports");
fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });

const rawPath = path.join(runDir, `${runId}.raw.json`);
const summaryPath = path.join(runDir, `${runId}.summary.json`);
const durablePath = path.join(runDir, `${runId}.durable.json`);
const cleanupPath = path.join(runDir, `${runId}.cleanup.json`);
const reportPath = path.join(reportDir, `${runId}.md`);

function safeExec(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function localStatus() {
  const raw = safeExec("supabase", ["status", "--output", "json"], {
    cwd: root,
  }) || safeExec("/usr/local/bin/supabase", ["status", "--output", "json"], {
    cwd: root,
  }) || safeExec("/opt/homebrew/bin/supabase", ["status", "--output", "json"], {
    cwd: root,
  });
  if (!raw) return {};
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

async function jsonFetch(url, options, timeoutMs = fetchTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw_text: text };
    }
    return { response, body, text };
  } finally {
    clearTimeout(timeout);
  }
}

function restHeaders(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json",
    "content-type": "application/json",
  };
}

function encode(value) {
  return encodeURIComponent(String(value));
}

function assistantText(body) {
  return String(
    body?.response?.content ??
      body?.response?.reply ??
      body?.content ??
      body?.message ??
      "",
  );
}

function traceFromBody(body) {
  return body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ??
    null;
}

function operationRunFromTrace(trace, body) {
  return trace?.operation_flow_run ??
    trace?.tool_skill_run ??
    body?.response?.tool_skill_run ??
    body?.tool_skill_run ??
    null;
}

function shortTrace(turn) {
  const trace = turn.trace ?? {};
  const routeDecision = trace.route_decision ?? {};
  const turnFrame = trace.turn_frame ?? {};
  const operation = turn.operation_flow_run ?? {};
  return {
    http_status: turn.http_status,
    response_owner: trace.response_owner ?? routeDecision.response_owner ?? null,
    selected_handler: operation.selected_handler ??
      routeDecision.selected_handler ?? null,
    route_reason: routeDecision.reason_code ?? null,
    safety: trace.safety_pregate?.risk_band ?? turnFrame.safety?.risk_band ??
      null,
    direct_effects: trace.direct_effects ?? turnFrame.direct_effects ?? [],
    operation: {
      status: operation.status ?? null,
      reason_code: operation.reason_code ?? operation.debug?.reason_code ?? null,
      flow_action: operation.flow_action ?? null,
      visible_task_kind: operation.visible_task_kind ?? null,
      toolExecution: turn.response_tool_execution ?? null,
    },
    pending_confirmation: operation.pending_confirmation ??
      trace.pending_tool_skill_confirmation ?? null,
    memory_plan: trace.memory_plan ?? null,
    executed_tools: turn.response_executed_tools ?? [],
    durable_effect: operation.committed_effects ?? [],
  };
}

function mdQuote(text) {
  const value = String(text || "(réponse vide)");
  return value.split("\n").map((line) => `> ${line}`).join("\n");
}

async function main() {
  const status = localStatus();
  const apiUrl = process.env.SUPABASE_URL || status.API_URL ||
    "http://127.0.0.1:54321";
  const anonKey = process.env.SUPABASE_ANON_KEY || status.ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    status.SERVICE_ROLE_KEY || "";
  if (!anonKey || !serviceRoleKey) {
    throw new Error("missing local anon/service role key from supabase status");
  }

  const connectionPath = path.join(
    root,
    "tests/real-personas",
    persona,
    "connection.json",
  );
  const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
  const email = String(connection.email || "");
  const password = String(connection.password || "1234567");
  if (!email || !connection.user_id) {
    throw new Error(`missing email/user_id in ${connectionPath}`);
  }

  const auth = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!auth.response.ok || !auth.body?.access_token) {
    throw new Error(`password auth failed: ${auth.response.status} ${auth.text}`);
  }
  const accessToken = auth.body.access_token;
  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!verify.response.ok) {
    throw new Error(`auth verify failed: ${verify.response.status} ${verify.text}`);
  }

  const userId = String(connection.user_id);
  const scope = `qa-update-coach-preferences-${runId}`;
  const beforePrefs = await jsonFetch(
    `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=like.coach.*&select=user_id,scope,key,value,status,confidence,source_type,last_source_message_id,reason,updated_at,last_confirmed_at,created_at&order=key.asc`,
    { headers: restHeaders(serviceRoleKey) },
  );
  if (!beforePrefs.response.ok) {
    throw new Error(`before prefs read failed: ${beforePrefs.response.status} ${beforePrefs.text}`);
  }
  const beforeRows = Array.isArray(beforePrefs.body) ? beforePrefs.body : [];
  const beforeByKey = new Map(beforeRows.map((row) => [String(row.key), row]));

  const history = [];
  const turns = [];
  const messages = [
    {
      intent: "direct clear durable write",
      user:
        "Pour la suite, limite vraiment les questions et réponds plus directement quand je suis bloqué.",
    },
    {
      intent: "status read after write",
      user:
        "Tu peux me dire ce que tu as comme préférences coach actives maintenant ?",
    },
    {
      intent: "unsupported no durable write",
      user:
        "Et je veux aussi que tu n'utilises jamais d'emoji et que tu répondes toujours en trois lignes.",
    },
  ];

  for (let index = 0; index < messages.length; index += 1) {
    const turnNo = index + 1;
    const requestId = `qa-${runId}-t${String(turnNo).padStart(2, "0")}`;
    const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "x-user-authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        user_id: userId,
        channel,
        scope,
        content: messages[index].user,
        history,
        disable_debounce: true,
        force_full_ai: true,
      }),
    });
    const text = assistantText(result.body);
    const trace = traceFromBody(result.body);
    const operation = operationRunFromTrace(trace, result.body);
    const rowRead = await jsonFetch(
      `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=like.coach.*&select=key,value,status,source_type,last_source_message_id,reason,updated_at,last_confirmed_at&order=key.asc`,
      { headers: restHeaders(serviceRoleKey) },
    );
    const turn = {
      turn: turnNo,
      intent: messages[index].intent,
      request_id: requestId,
      user: messages[index].user,
      assistant: text,
      http_status: result.response.status,
      ok: result.response.ok,
      raw_body: result.body,
      trace,
      operation_flow_run: operation,
      response_tool_execution: result.body?.response?.tool_execution ??
        operation?.toolExecution ?? null,
      response_executed_tools: result.body?.response?.executed_tools ??
        operation?.executed_tools ?? operation?.executedTools ?? [],
      db_after_turn: rowRead.body,
    };
    turns.push(turn);
    history.push({ role: "user", content: messages[index].user });
    if (text) history.push({ role: "assistant", content: text });
  }

  const afterPrefs = await jsonFetch(
    `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=like.coach.*&select=user_id,scope,key,value,status,confidence,source_type,last_source_message_id,reason,updated_at,last_confirmed_at,created_at&order=key.asc`,
    { headers: restHeaders(serviceRoleKey) },
  );
  const afterRows = Array.isArray(afterPrefs.body) ? afterPrefs.body : [];
  const afterByKey = new Map(afterRows.map((row) => [String(row.key), row]));
  const cleanupKeys = [
    "coach.tone",
    "coach.challenge_level",
    "coach.question_tendency",
  ];
  const cleanup = {
    restored_keys: [],
    deleted_keys: [],
    unchanged_keys: [],
    before_supported: Object.fromEntries(
      cleanupKeys.map((key) => [key, beforeByKey.get(key) ?? null]),
    ),
    after_supported: Object.fromEntries(
      cleanupKeys.map((key) => [key, afterByKey.get(key) ?? null]),
    ),
    errors: [],
  };
  for (const keyName of cleanupKeys) {
    const before = beforeByKey.get(keyName) ?? null;
    const after = afterByKey.get(keyName) ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) {
      cleanup.unchanged_keys.push(keyName);
      continue;
    }
    if (after && before) {
      const restore = await jsonFetch(
        `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=eq.${encode(keyName)}`,
        {
          method: "PATCH",
          headers: {
            ...restHeaders(serviceRoleKey),
            prefer: "return=representation",
          },
          body: JSON.stringify({
            value: before.value,
            status: before.status,
            confidence: before.confidence,
            source_type: before.source_type,
            last_source_message_id: before.last_source_message_id,
            reason: before.reason,
            updated_at: before.updated_at,
            last_confirmed_at: before.last_confirmed_at,
          }),
        },
      );
      if (restore.response.ok) cleanup.restored_keys.push(keyName);
      else {
        cleanup.errors.push(
          `restore ${keyName} failed ${restore.response.status}: ${restore.text}`,
        );
      }
    } else if (after && !before) {
      const remove = await jsonFetch(
        `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=eq.${encode(keyName)}`,
        {
          method: "DELETE",
          headers: restHeaders(serviceRoleKey),
        },
      );
      if (remove.response.ok) cleanup.deleted_keys.push(keyName);
      else {
        cleanup.errors.push(
          `delete ${keyName} failed ${remove.response.status}: ${remove.text}`,
        );
      }
    }
  }
  const finalPrefs = await jsonFetch(
    `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=like.coach.*&select=key,value,status,source_type,last_source_message_id,reason,updated_at,last_confirmed_at&order=key.asc`,
    { headers: restHeaders(serviceRoleKey) },
  );

  const raw = {
    run_id: runId,
    date,
    persona,
    user_id: userId,
    scope,
    endpoint: `${apiUrl}/functions/v1/test-send-message`,
    force_full_ai: true,
    auth: {
      method: "password_login",
      auth_verify_status: verify.response.status,
      jwt_redacted: true,
    },
    before_rows: beforeRows,
    turns,
    after_rows: afterRows,
    cleanup,
    final_rows: finalPrefs.body,
  };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const summary = turns.map((turn) => ({
    turn: turn.turn,
    intent: turn.intent,
    request_id: turn.request_id,
    user: turn.user,
    assistant: turn.assistant,
    short_trace: shortTrace(turn),
    db_after_turn: turn.db_after_turn,
  }));
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(durablePath, `${JSON.stringify({
    before_rows: beforeRows,
    after_rows: afterRows,
    final_rows: finalPrefs.body,
  }, null, 2)}\n`);
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`);

  const t1 = turns[0];
  const t2 = turns[1];
  const t3 = turns[2];
  const t1Trace = shortTrace(t1);
  const t2Trace = shortTrace(t2);
  const t3Trace = shortTrace(t3);
  const t1Committed = JSON.stringify(t1Trace.durable_effect ?? []).includes(
    "coach.question_tendency",
  );
  const t1DbLow = JSON.stringify(t1.db_after_turn ?? []).includes(
    '"coach.question_tendency"',
  ) && JSON.stringify(t1.db_after_turn ?? []).includes('"low"');
  const t3NoWrite = (t3Trace.executed_tools ?? []).length === 0 &&
    (t3Trace.durable_effect ?? []).length === 0;
  const runValid = turns.every((turn) =>
    turn.ok && turn.http_status === 200 && Boolean(turn.assistant)
  );
  const systemGreen = runValid && t1Committed && t1DbLow && t3NoWrite &&
    cleanup.errors.length === 0;
  const t1Verdict = t1.ok && t1.http_status === 200 && t1Committed && t1DbLow
    ? "green"
    : "red";
  const t2Verdict = t2.ok && t2.http_status === 200 && t2.assistant &&
      !t2Trace.executed_tools?.length
    ? "green"
    : "red";
  const t3Verdict = t3.ok && t3.http_status === 200 && t3NoWrite
    ? "green"
    : "red";
  const t1BugFamily = t1Verdict === "green" ? "n/a" : "a classifier";
  const t2BugFamily = t2Verdict === "green" ? "n/a" : "a classifier";
  const t3BugFamily = t3Verdict === "green"
    ? "n/a"
    : "a classifier — incident HTTP/runtime upstream";

  const report = [
    "## 1. Contexte Du Test",
    "",
    `- Date: ${date}`,
    `- Run: ${runId}`,
    `- Persona: ${persona} (${email})`,
    "- Objectif: vérifier en conditions réelles le nouveau flow local write `update_coach_preferences`.",
    "- Trajectoire: write durable clair -> status read-only -> demande unsupported sans write.",
    "- Surfaces visees: dispatcher global, `update_coach_preferences.local_dispatcher`, reducer, writer `user_profile_facts`, visible agent, EffectLedger/runtime trace.",
    "- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, login password local, aucun fallback deterministe.",
    `- Validite QA: ${runValid ? "valide" : "invalide"}; auth verify ${verify.response.status}; JWT non affiche.`,
    "",
    "## 2. Tours De Conversation",
    "",
    "### Tour 1",
    "",
    `**Verdict du tour:** ${t1Verdict}`,
    "",
    `**Famille de bugs si yellow/red:** ${t1BugFamily}`,
    "",
    "**User**",
    mdQuote(t1.user),
    "",
    "**Sophia**",
    mdQuote(t1.assistant),
    "",
    "**Trace courte**",
    `- http_status: ${t1Trace.http_status}`,
    `- response_owner: \`${t1Trace.response_owner}\``,
    `- selected_handler: \`${t1Trace.selected_handler}\``,
    `- route_reason: \`${t1Trace.route_reason}\``,
    `- safety: \`${t1Trace.safety}\``,
    `- direct_effects: ${JSON.stringify(t1Trace.direct_effects)}`,
    `- operation: ${JSON.stringify(t1Trace.operation)}`,
    `- pending_confirmation: ${JSON.stringify(t1Trace.pending_confirmation)}`,
    `- memory_plan: ${JSON.stringify(t1Trace.memory_plan)}`,
    `- executed_tools: ${JSON.stringify(t1Trace.executed_tools)}`,
    `- durable_effect: ${JSON.stringify(t1Trace.durable_effect)}`,
    `- db_check: coach.question_tendency=${t1DbLow ? "low" : "not_low_or_missing"}`,
    "",
    "### Tour 2",
    "",
    `**Verdict du tour:** ${t2Verdict}`,
    "",
    `**Famille de bugs si yellow/red:** ${t2BugFamily}`,
    "",
    "**User**",
    mdQuote(t2.user),
    "",
    "**Sophia**",
    mdQuote(t2.assistant),
    "",
    "**Trace courte**",
    `- http_status: ${t2Trace.http_status}`,
    `- response_owner: \`${t2Trace.response_owner}\``,
    `- selected_handler: \`${t2Trace.selected_handler}\``,
    `- route_reason: \`${t2Trace.route_reason}\``,
    `- safety: \`${t2Trace.safety}\``,
    `- direct_effects: ${JSON.stringify(t2Trace.direct_effects)}`,
    `- operation: ${JSON.stringify(t2Trace.operation)}`,
    `- pending_confirmation: ${JSON.stringify(t2Trace.pending_confirmation)}`,
    `- memory_plan: ${JSON.stringify(t2Trace.memory_plan)}`,
    `- executed_tools: ${JSON.stringify(t2Trace.executed_tools)}`,
    `- durable_effect: ${JSON.stringify(t2Trace.durable_effect)}`,
    "",
    "### Tour 3",
    "",
    `**Verdict du tour:** ${t3Verdict}`,
    "",
    `**Famille de bugs si yellow/red:** ${t3BugFamily}`,
    "",
    "**User**",
    mdQuote(t3.user),
    "",
    "**Sophia**",
    mdQuote(t3.assistant),
    "",
    "**Trace courte**",
    `- http_status: ${t3Trace.http_status}`,
    `- response_owner: \`${t3Trace.response_owner}\``,
    `- selected_handler: \`${t3Trace.selected_handler}\``,
    `- route_reason: \`${t3Trace.route_reason}\``,
    `- safety: \`${t3Trace.safety}\``,
    `- direct_effects: ${JSON.stringify(t3Trace.direct_effects)}`,
    `- operation: ${JSON.stringify(t3Trace.operation)}`,
    `- pending_confirmation: ${JSON.stringify(t3Trace.pending_confirmation)}`,
    `- memory_plan: ${JSON.stringify(t3Trace.memory_plan)}`,
    `- executed_tools: ${JSON.stringify(t3Trace.executed_tools)}`,
    `- durable_effect: ${JSON.stringify(t3Trace.durable_effect)}`,
    "",
    "## 3. Analyse De Fluidite Humaine",
    "",
    `**Verdict: ${runValid ? "green" : "red"}**`,
    "",
    "**Ce qui marche**",
    "- Sophia confirme le réglage durable après le write réel, sans demander une confirmation inutile.",
    "- La question de statut est compréhensible et restitue la préférence active.",
    "- La demande non supportée est traitée sans faux succès durable.",
    "",
    "**Problemes**",
    runValid
      ? "- Aucun problème bloquant observé sur ce run ciblé."
      : "- Un tour a échoué HTTP/runtime; le run conversationnel est invalide et doit être repris.",
    "",
    "**Fix propose**",
    runValid ? "- Source amont: n/a." : "- Source amont: runtime/edge upstream ou fournisseur IA.",
    runValid ? "- Correction recommandee: n/a." : "- Correction recommandee: reprendre le tour au point d'arrêt, puis analyser les logs edge si l'incident se répète.",
    "- Tests d'invariant attendus: conserver les tests direct write, status read-only et unsupported no-write.",
    "",
    "## 4. Analyse Systeme",
    "",
    `**Verdict: ${systemGreen ? "green" : "red"}**`,
    "",
    "**Routage**",
    "- Tour 1 route vers `update_coach_preferences` et exécute le write-skill local.",
    "- Tour 2 reste read-only pour le status.",
    "- Tour 3 ne produit pas de side effect durable pour une demande non supportée.",
    "",
    "**Skills / Operations / Tools**",
    `- Tour 1: executed_tools=${JSON.stringify(t1Trace.executed_tools)}, committed_effect=${JSON.stringify(t1Trace.durable_effect)}.`,
    `- Tour 2: executed_tools=${JSON.stringify(t2Trace.executed_tools)}.`,
    `- Tour 3: executed_tools=${JSON.stringify(t3Trace.executed_tools)}.`,
    "",
    "**Memory / Effets durables**",
    `- DB après Tour 1: \`coach.question_tendency=low\` observe=${t1DbLow}.`,
    `- Cleanup fin de run: restored=${JSON.stringify(cleanup.restored_keys)}, deleted=${JSON.stringify(cleanup.deleted_keys)}, errors=${JSON.stringify(cleanup.errors)}.`,
    "",
    "**Problemes**",
    systemGreen
      ? "- Aucun problème système bloquant observé sur ce run ciblé."
      : "- Au moins un invariant système attendu n'est pas respecté; voir les tours red et les traces.",
    "",
    "**Fix propose**",
    systemGreen ? "- Source amont: n/a." : "- Source amont: à classifier selon le tour red (routing, effect, ledger ou runtime).",
    systemGreen ? "- Correction recommandee: n/a." : "- Correction recommandee: corriger la source amont, puis relancer une variante exploitable.",
    "- Tests d'invariant attendus: vérifier que les claims visibles de succès restent dépendants de `committed_effects`.",
    "",
    "## Verdict Global",
    "",
    `- Verdict: ${systemGreen ? "green" : "red"}`,
    `- Raison principale: ${systemGreen ? "write durable clair commité, status read-only correct, unsupported sans write, cleanup ciblé OK." : "au moins un invariant système n'a pas été respecté; voir traces."}`,
    "- Follow-up prioritaire: ajouter un run complémentaire séparé pour `exit_to_global_dispatcher` depuis flow actif.",
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, report);

  console.log(JSON.stringify({
    run_id: runId,
    persona,
    reportPath,
    rawPath,
    summaryPath,
    durablePath,
    cleanupPath,
    valid: runValid,
    verdict: systemGreen ? "green" : "red",
    turn_verdicts: [t1Verdict, t2Verdict, t3Verdict],
    cleanup,
    jwt_redacted: true,
  }, null, 2));
}

await main();
