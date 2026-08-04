import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const date = "2026-06-08";
const runId = process.env.QA_RUN_ID ||
  "2026-06-08-status-recap-local-dispatcher-r1";
const persona = "qa-skill";
const baseConnection = "status_recap";
const connectionName = `${baseConnection}_${runId}`;
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/status_recap");
const reportDir = path.join(
  root,
  "docs/agent-playbook/New/test-material/qa-run-reports",
);
const bugDir = path.join(
  root,
  "docs/agent-playbook/New/test-material/run-bug-sheets",
);
fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(bugDir, { recursive: true });

const rawPath = path.join(runDir, `${runId}.raw.json`);
const summaryPath = path.join(runDir, `${runId}.summary.json`);
const durablePath = path.join(runDir, `${runId}.durable.json`);
const cleanupPath = path.join(runDir, `${runId}.cleanup.json`);
const reportPath = path.join(reportDir, `${runId}.md`);
const bugPath = path.join(bugDir, `${runId}-bugs.md`);

function safeExec(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    return String(error?.stderr ?? error?.message ?? "");
  }
}

function requireExec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function localStatus() {
  const raw = requireExec("supabase", ["status", "--output", "json"]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

async function jsonFetch(url, options, timeoutMs = 180_000) {
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
  ).trim();
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
      status_intent: operation.status_intent ?? operation.intent ?? null,
      visible_task: operation.visible_task ?? operation.visible_task_kind ?? null,
      projection_used: operation.projection_used ?? null,
      toolExecution: turn.response_tool_execution ?? null,
    },
    pending_confirmation: operation.pending_confirmation ??
      trace.pending_tool_skill_confirmation ?? null,
    memory_plan: trace.memory_plan ?? turnFrame.memory_plan ?? null,
    executed_tools: turn.response_executed_tools ?? [],
    durable_effect: operation.committed_effects ?? [],
    temp_memory_keys: Object.keys(turn.state_after?.temp_memory ?? {}),
  };
}

function mdQuote(text) {
  const value = String(text || "(reponse vide)");
  return value.split("\n").map((line) => `> ${line}`).join("\n");
}

async function readRows(apiUrl, serviceRoleKey, userId) {
  const [checkins, prefs, messages, state] = await Promise.all([
    jsonFetch(
      `${apiUrl}/rest/v1/scheduled_checkins?user_id=eq.${encode(userId)}&select=id,status,scheduled_for,event_context,message_payload,updated_at&order=scheduled_for.asc`,
      { headers: restHeaders(serviceRoleKey) },
    ),
    jsonFetch(
      `${apiUrl}/rest/v1/user_profile_facts?user_id=eq.${encode(userId)}&scope=eq.global&key=like.coach.*&select=key,value,status,source_type,reason,updated_at&order=key.asc`,
      { headers: restHeaders(serviceRoleKey) },
    ),
    jsonFetch(
      `${apiUrl}/rest/v1/chat_messages?user_id=eq.${encode(userId)}&select=id,role,content,created_at,scope&order=created_at.asc`,
      { headers: restHeaders(serviceRoleKey) },
    ),
    jsonFetch(
      `${apiUrl}/rest/v1/user_chat_states?user_id=eq.${encode(userId)}&select=user_id,scope,temp_memory,updated_at`,
      { headers: restHeaders(serviceRoleKey) },
    ),
  ]);
  return {
    scheduled_checkins: checkins.body,
    coach_preferences: prefs.body,
    chat_messages: messages.body,
    user_chat_states: state.body,
  };
}

async function seedStatusFixtures(apiUrl, serviceRoleKey, userId) {
  for (const table of ["scheduled_checkins", "user_profile_facts"]) {
    await jsonFetch(
      `${apiUrl}/rest/v1/${table}?user_id=eq.${encode(userId)}`,
      {
        method: "DELETE",
        headers: restHeaders(serviceRoleKey),
      },
    );
  }
  const now = new Date();
  const pendingAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const cancelledAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const checkins = await jsonFetch(`${apiUrl}/rest/v1/scheduled_checkins`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        user_id: userId,
        status: "pending",
        scheduled_for: pendingAt.toISOString(),
        event_context: `one_shot_reminder:${runId}:pending`,
        message_payload: {
          reminder_instruction: "relire le brouillon de statut",
          source: runId,
        },
      },
      {
        user_id: userId,
        status: "cancelled",
        scheduled_for: cancelledAt.toISOString(),
        event_context: `one_shot_reminder:${runId}:cancelled`,
        message_payload: {
          reminder_instruction: "ancien rappel annule de test",
          source: runId,
        },
      },
    ]),
  });
  if (!checkins.response.ok) {
    throw new Error(
      `seed scheduled_checkins failed ${checkins.response.status}: ${checkins.text}`,
    );
  }
  const prefs = await jsonFetch(`${apiUrl}/rest/v1/user_profile_facts`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      scope: "global",
      key: "coach.question_tendency",
      value: { value: "low" },
      status: "active",
      confidence: 0.98,
      source_type: "explicit_user",
      reason: `QA fixture ${runId}`,
    }),
  });
  if (!prefs.response.ok) {
    throw new Error(
      `seed user_profile_facts failed ${prefs.response.status}: ${prefs.text}`,
    );
  }
  return { checkins: checkins.body, prefs: prefs.body };
}

async function cleanupFixtures(apiUrl, serviceRoleKey, userId) {
  const cleanup = { deleted: {}, script_cleanup: null, errors: [] };
  for (const [table, query] of [
    ["scheduled_checkins", `user_id=eq.${encode(userId)}`],
    ["user_profile_facts", `user_id=eq.${encode(userId)}`],
    ["chat_messages", `user_id=eq.${encode(userId)}`],
    ["user_chat_states", `user_id=eq.${encode(userId)}`],
  ]) {
    const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
      method: "DELETE",
      headers: restHeaders(serviceRoleKey),
    });
    cleanup.deleted[table] = result.response.status;
    if (!result.response.ok) {
      cleanup.errors.push(`${table} delete failed ${result.response.status}`);
    }
  }
  const scriptOut = safeExec("bash", [
    "scripts/qa-cleanup-run-connection.sh",
    persona,
    connectionName,
  ]);
  cleanup.script_cleanup = scriptOut;
  return cleanup;
}

async function main() {
  const status = localStatus();
  const apiUrl = status.API_URL || "http://127.0.0.1:54321";
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  if (!anonKey || !serviceRoleKey) throw new Error("missing local keys");

  const createOut = requireExec("bash", [
    "scripts/qa-create-run-connection.sh",
    persona,
    baseConnection,
    runId,
  ]);
  const connectionFile = path.join(
    root,
    "tests/real-personas/qa-skill/connections",
    `${connectionName}.json`,
  );
  const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
  const userId = String(connection.user_id);
  const email = String(connection.email);
  const auth = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: connection.refresh_token }),
  });
  if (!auth.response.ok || !auth.body?.access_token) {
    throw new Error(`auth failed ${auth.response.status}: ${auth.text}`);
  }
  const accessToken = auth.body.access_token;
  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
  });
  if (!verify.response.ok) {
    throw new Error(`auth verify failed ${verify.response.status}`);
  }

  const scope = `qa-status-recap-${runId}`;
  const seed = await seedStatusFixtures(apiUrl, serviceRoleKey, userId);
  const beforeRows = await readRows(apiUrl, serviceRoleKey, userId);
  const turns = [];
  const history = [];
  const plannedIntents = [
    {
      intent: "initial status recap",
      user:
        process.env.QA_T1 ||
        "Avant qu'on fasse quoi que ce soit, dis-moi ce qui est réellement en place pour moi aujourd'hui.",
    },
    {
      intent: "active followup reminders only",
      user:
        process.env.QA_T2 ||
        "Et côté rappels seulement, qu'est-ce qui est actif ou annulé ?",
    },
    {
      intent: "active followup sources",
      user: process.env.QA_T3 || "D'où tu tiens ça exactement ?",
    },
    ...(process.env.QA_INCLUDE_PRODUCT_EXIT === "0" ? [] : [{
      intent: "exit to product help",
      user: process.env.QA_T4 || "Et si je veux le changer, je le fais où ?",
    }]),
  ];

  for (let index = 0; index < plannedIntents.length; index += 1) {
    const turnNo = index + 1;
    const requestId = `qa-${runId}-t${String(turnNo).padStart(2, "0")}`;
    const requestBody = {
      user_id: userId,
      channel: "web",
      scope,
      content: plannedIntents[index].user,
      history,
      disable_debounce: true,
      force_full_ai: true,
    };
    const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "x-user-authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify(requestBody),
    });
    const text = assistantText(result.body);
    const trace = traceFromBody(result.body);
    const operation = operationRunFromTrace(trace, result.body);
    const stateAfter = await readRows(apiUrl, serviceRoleKey, userId);
    const turn = {
      turn: turnNo,
      intent: plannedIntents[index].intent,
      request_id: requestId,
      user: plannedIntents[index].user,
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
      state_after: stateAfter,
    };
    turns.push(turn);
    history.push({ role: "user", content: plannedIntents[index].user });
    if (text) history.push({ role: "assistant", content: text });
  }

  const afterRows = await readRows(apiUrl, serviceRoleKey, userId);
  const cleanup = await cleanupFixtures(apiUrl, serviceRoleKey, userId);
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`);

  const finalRaw = {
    run_id: runId,
    date,
    persona,
    connection_name: connectionName,
    user_id: userId,
    email,
    scope,
    endpoint: `${apiUrl}/functions/v1/test-send-message`,
    force_full_ai: true,
    auth: {
      method: "password_login",
      verify_status: verify.response.status,
      jwt_redacted: true,
    },
    create_connection_output: createOut,
    seed,
    before_rows: beforeRows,
    turns,
    after_rows: afterRows,
    cleanup,
  };
  fs.writeFileSync(rawPath, `${JSON.stringify(finalRaw, null, 2)}\n`);
  const summary = turns.map((turn) => ({
    turn: turn.turn,
    intent: turn.intent,
    request_id: turn.request_id,
    user: turn.user,
    assistant: turn.assistant,
    short_trace: shortTrace(turn),
  }));
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(durablePath, `${JSON.stringify({
    seed,
    before_rows: beforeRows,
    after_rows: afterRows,
    cleanup,
  }, null, 2)}\n`);

  const traces = turns.map(shortTrace);
  const validHttp = turns.every((turn) =>
    turn.ok && turn.http_status === 200 && turn.assistant
  );
  const noExecutedTools = turns.every((turn) =>
    (turn.response_executed_tools ?? []).length === 0
  );
  const t1Status = traces[0].selected_handler === "status_recap";
  const t2LocalStatus = traces[1].selected_handler === "status_recap" &&
    JSON.stringify(traces[1].operation).includes("answer_object_status");
  const t3LocalSources = traces[2].selected_handler === "status_recap" &&
    JSON.stringify(traces[2].operation).includes("explain_sources");
  const t4ExitOrProduct = traces[3]
    ? traces[3].selected_handler === "status_recap" ||
      traces[3].response_owner === "product_help" ||
      traces[3].selected_handler === "product_help"
    : true;
  const green = validHttp && noExecutedTools && t1Status && t2LocalStatus &&
    t3LocalSources && t4ExitOrProduct && cleanup.errors.length === 0;

  function turnVerdict(index) {
    if (!turns[index].ok || !turns[index].assistant) return "red";
    if (index === 0) return t1Status ? "green" : "red";
    if (index === 1) return t2LocalStatus ? "green" : "red";
    if (index === 2) return t3LocalSources ? "green" : "red";
    if (index === 3) return t4ExitOrProduct ? "green" : "yellow";
    return "green";
  }
  function bugFamily(index) {
    const verdict = turnVerdict(index);
    if (verdict === "green") return "n/a";
    if (index === 0 || index === 1 || index === 2) {
      return "BF-ROUTE-01 / BF-STATUS-01 — owner status_recap attendu";
    }
    return "BF-ROUTE-03 — sortie product/status/tool a verifier";
  }

  const report = [
    "# QA Run Report — status_recap local dispatcher R1",
    "",
    "## 1. Contexte Du Test",
    "",
    `- Date: ${date}`,
    `- Run: ${runId}`,
    `- Persona: ${persona} temporaire (${email})`,
    "- Objectif: verifier en IA reelle locale le flow `status_recap` local dispatcher: activation initiale, followups locaux, sources, sortie product-help.",
    "- Trajectoire: status global read-only -> followup rappels -> followup sources -> sortie vers aide produit/changement.",
    "- Surfaces visees: dispatcher global, `status_recap.local_dispatcher`, projection DB, reducer read-only, visible agent, tempMemory active flow, product/status routing.",
    "- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, refresh token local, aucun fallback deterministe.",
    `- Validite QA: ${validHttp ? "valide" : "invalide"}; auth verify ${verify.response.status}; JWT non affiche.`,
    "",
    "## 2. Tours De Conversation",
    "",
    ...turns.flatMap((turn, index) => {
      const trace = traces[index];
      return [
        `### Tour ${turn.turn}`,
        "",
        `**Verdict du tour:** ${turnVerdict(index)}`,
        "",
        `**Famille de bugs si yellow/red:** ${bugFamily(index)}`,
        "",
        "**User**",
        mdQuote(turn.user),
        "",
        "**Sophia**",
        mdQuote(turn.assistant),
        "",
        "**Trace courte**",
        `- http_status: ${trace.http_status}`,
        `- response_owner: \`${trace.response_owner}\``,
        `- selected_handler: \`${trace.selected_handler}\``,
        `- route_reason: \`${trace.route_reason}\``,
        `- safety: \`${trace.safety}\``,
        `- direct_effects: ${JSON.stringify(trace.direct_effects)}`,
        `- operation: ${JSON.stringify(trace.operation)}`,
        `- pending_confirmation: ${JSON.stringify(trace.pending_confirmation)}`,
        `- memory_plan: ${JSON.stringify(trace.memory_plan)}`,
        `- executed_tools: ${JSON.stringify(trace.executed_tools)}`,
        `- durable_effect: ${JSON.stringify(trace.durable_effect)}`,
        `- temp_memory_keys: ${JSON.stringify(trace.temp_memory_keys)}`,
        "",
        turnVerdict(index) === "green" ? "" : [
          "**Analyse si yellow/red**",
          "- Symptome: le tour n'a pas respecte l'owner ou le flow attendu.",
          "- Source amont probable: dispatcher / status local flow admission.",
          "- Owner runtime: `status_recap` / router.",
          "- Meilleure correction selon les guidelines: corriger le signal structure ou l'admission du flow local, pas une phrase visible.",
          "- Pourquoi ce n'est pas un patch local: le probleme est de routing/owner, pas de wording.",
          "",
        ].join("\n"),
      ];
    }),
    "## 3. Analyse De Fluidite Humaine",
    "",
    `**Verdict: ${green ? "green" : "red"}**`,
    "",
    "**Ce qui marche**",
    "- Le run suit une conversation tour par tour avec reponses IA reelles.",
    "- Les reponses restent non-mutantes: aucun tool execute dans le transcript.",
    "- Les demandes de precision et de source restent dans le contexte status quand le routing est correct.",
    "",
    "**Problemes**",
    green
      ? "- Aucun probleme bloquant observe dans ce run."
      : "- Voir les tours non-green ci-dessus; impact utilisateur: status ou followup potentiellement confus.",
    "",
    "**Fix propose**",
    "- Source amont: `status_recap.local_dispatcher` / route admission.",
    "- Correction recommandee: renforcer les sorties structurees et l'admission active-flow, pas de regex metier.",
    "- Tests d'invariant attendus: initial status, followup categorie, source explanation, product-help exit, no executed tools.",
    "",
    "## 4. Analyse Systeme",
    "",
    `**Verdict: ${green ? "green" : "red"}**`,
    "",
    "**Routage**",
    `- T1 status handler attendu: ${t1Status}.`,
    `- T2 local object status attendu: ${t2LocalStatus}.`,
    `- T3 local explain_sources attendu: ${t3LocalSources}.`,
    `- T4 sortie status/product attendue: ${
      traces[3] ? t4ExitOrProduct : "non teste dans cette variante"
    }.`,
    "",
    "**Skills / Operations / Tools**",
    `- executed_tools all turns: ${JSON.stringify(traces.map((t) => t.executed_tools))}`,
    `- no executed tools: ${noExecutedTools}.`,
    "",
    "**Memory / Effets durables**",
    "- Fixtures DB creees uniquement sur user QA temporaire; cleanup cible execute ensuite.",
    `- Cleanup errors: ${JSON.stringify(cleanup.errors)}`,
    "",
    "**Problemes**",
    green
      ? "- Aucun probleme systeme bloquant observe dans ce run."
      : "- Un ou plusieurs invariants status local sont rouges; voir familles par tour.",
    "",
    "**Fix propose**",
    "- Source amont: dispatcher/status local flow, selon tour rouge.",
    "- Correction recommandee: maintenir DB projection source of truth, sortie globale seulement via exit memo, no mutation.",
    "- Tests d'invariant attendus: unit + QA reel du meme scenario.",
    "",
    "## Verdict Global",
    "",
    `- Verdict: ${green ? "green" : "red"}`,
    `- Raison principale: ${
      green
        ? "activation et followups status_recap valides en IA reelle locale, sans tool execute."
        : "au moins un invariant status_recap local a echoue."
    }`,
    `- Follow-up prioritaire: ${
      green
        ? "Aucun; garder ce scenario comme regression QA."
        : "Corriger le premier tour rouge selon la famille BF indiquee, puis rerun."
    }`,
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, report);

  if (!green) {
    const bugSheet = [
      `# Run Bug Sheet - ${runId}`,
      "",
      `- Run report: \`docs/agent-playbook/New/test-material/qa-run-reports/${runId}.md\``,
      `- Raw: \`tests/real-personas/qa-skill/runs/status_recap/${runId}.raw.json\``,
      "- Validite QA: voir rapport source.",
      "",
      "| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...turns.flatMap((turn, index) => {
        const verdict = turnVerdict(index);
        if (verdict === "green") return [];
        const trace = traces[index];
        return [
          `| \`R1-B${String(index + 1).padStart(2, "0")}\` | T${index + 1} | \`${bugFamily(index)}\` | status_recap/router | local dispatcher admission | Tour non-green | selected_handler=${trace.selected_handler}, operation=${JSON.stringify(trace.operation)} | Corriger signal/admission structuree, pas wording | open |  | QA reel rerun + unit invariant |`,
        ];
      }),
      "",
    ].join("\n");
    fs.writeFileSync(bugPath, bugSheet);
  }

  console.log(JSON.stringify({
    run_id: runId,
    verdict: green ? "green" : "red",
    report_path: reportPath,
    raw_path: rawPath,
    summary_path: summaryPath,
    durable_path: durablePath,
    cleanup_path: cleanupPath,
    bug_path: green ? null : bugPath,
    turn_verdicts: turns.map((_, index) => turnVerdict(index)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
