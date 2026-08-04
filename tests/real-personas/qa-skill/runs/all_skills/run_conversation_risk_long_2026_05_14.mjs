import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const envPath = path.join(root, "supabase/.env");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);

const apiUrl = process.env.SUPABASE_URL || env.SUPABASE_URL ||
  "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
const runStamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/all_skills");

const scenarios = [
  {
    key: "defense",
    connectionName: `all_skills_conv_risk_long_defense_${runStamp}`,
    scope: `qa-conv-risk-long-defense-${runStamp}`,
    expected: /carte|defense|défense|retour|travail|biscuit|stress|fatigue/i,
    recoveryMustMention: [/carte|defense|défense/i, /retour|travail/i, /biscuit|grignot/i],
    messages: [
      "Je suis Nina. Je veux que tu me crées une carte de défense, mais fais simple.",
      "C'est pour quand je rentre, enfin ce moment-là. Je ne veux pas un conseil, juste rester dans la carte de défense.",
      "Je l'ai déjà dit: quand je rentre chez moi. Je commence à me perdre dans les questions.",
      "Stop, là ça part dans tous les sens !!! Tu comprends rien et je dois répéter trois fois, c'est n'importe quoi. Repars à zéro: carte de défense pour retour du travail + stress/fatigue + biscuits.",
      "Oui c'est ça: carte de défense pour retour du travail, stress, fatigue, biscuits. Rien d'autre. On reprend simplement.",
      "Ne la crée pas encore, garde juste ce cadrage et confirme qu'on est repartis proprement.",
      "Ok, merci. Dis-moi juste ce qui a été retenu sans relancer de questions.",
    ],
  },
  {
    key: "reminder",
    connectionName: `all_skills_conv_risk_long_reminder_${runStamp}`,
    scope: `qa-conv-risk-long-reminder-${runStamp}`,
    expected: /rappel|recurrent|récurrent|soir|19|sac|demain/i,
    recoveryMustMention: [/rappel|recurrent|récurrent/i, /soir|19h|19:00/i, /sac|demain/i],
    messages: [
      "Je veux créer un rappel récurrent, pas juste en parler.",
      "C'est pour mon sac du lendemain, tous les soirs. Je veux rester sur le rappel récurrent.",
      "Je l'ai déjà dit: rappel récurrent pour préparer mon sac du lendemain. Je commence à être perdu dans les questions.",
      "Stop, là je suis perdu et franchement agacé !!! Tu comprends rien, c'est n'importe quoi: je veux repartir à zéro avec un rappel récurrent tous les soirs à 19h pour préparer mon sac du lendemain.",
      "Oui c'est ça: rappel récurrent tous les soirs à 19h, préparer mon sac pour demain. On reprend simplement.",
      "Ne le crée pas encore, garde juste ce cadrage et confirme qu'on est repartis proprement.",
      "Ok merci, ne relance pas le slot filling, confirme juste ce qui est en place.",
    ],
  },
];

function safeEmailPart(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 56);
}

async function jsonFetch(url, opts, timeoutMs = 180000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, text, json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTurnWithRetry({ user, scenario, turn, content, history }) {
  let lastResult = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const requestId = `qa-conv-risk-long-${scenario.key}-${runStamp}-t${
      String(turn).padStart(2, "0")
    }-a${attempt}`;
    const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${user.jwt}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        user_id: user.userId,
        channel: "web",
        scope: scenario.scope,
        content,
        history,
        disable_debounce: true,
        force_full_ai: true,
      }),
    });
    lastResult = { ...result, requestId, attempt };
    if (![502, 503].includes(result.res.status)) return lastResult;
    await sleep(1500 * attempt);
  }
  return lastResult;
}

async function createUser(connectionName) {
  const email = `qa-qa-skill-${safeEmailPart(connectionName)}@example.com`;
  const password = `Qa1!${randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona: "qa-skill",
    base_connection: "all_skills",
    connection_name: connectionName,
    run_id: runStamp,
    created_by: "run_conversation_risk_long_2026_05_14",
  };
  const created = await jsonFetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    }),
  });
  if (!created.res.ok || !created.json?.id) {
    throw new Error(`auth user create failed ${created.res.status}: ${created.text}`);
  }
  const token = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!token.res.ok || !token.json?.access_token) {
    throw new Error(`token failed ${token.res.status}: ${token.text}`);
  }
  return {
    userId: created.json.id,
    email,
    jwt: token.json.access_token,
  };
}

function assistantText(body) {
  const response = body?.response ?? body ?? {};
  return String(
    response.content ?? response.reply ?? response.text ?? body?.content ?? "",
  );
}

function traceOf(body) {
  return body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ??
    null;
}

function hasBannedSelfMisunderstanding(text) {
  return /je\s+n['’ ]?ai\s+pas\s+compris|je\s+ne\s+comprends\s+pas|je\s+te\s+suis\s+pas|je\s+t['’ ]?ai\s+perdu|je\s+t['’ ]?ai\s+fait\s+r[ée]p[ée]ter|je\s+r[ée]ponds?\s+[aà]\s+c[oô]t[ée]|mal\s+compris|r[ée]pondu\s+[aà]\s+c[oô]t[ée]/i
    .test(text);
}

function asksSlotAgain(text) {
  return /il me manque|quel moment|quelle heure|quoi exactement|d[ée]clencheur|cible|donne-moi la cible|d[ée]cris ce qui risque/i
    .test(text);
}

async function runScenario(scenario) {
  const user = await createUser(scenario.connectionName);
  const raw = [];
  const summary = [];
  const history = [];
  console.log(`scenario ${scenario.key}: user_id=${user.userId}`);

  for (let index = 0; index < scenario.messages.length; index += 1) {
    const turn = index + 1;
    const content = scenario.messages[index];
    console.log(`${scenario.key} turn ${turn}/${scenario.messages.length}`);
    const result = await sendTurnWithRetry({
      user,
      scenario,
      turn,
      content,
      history,
    });
    const body = result.json ?? {};
    const trace = traceOf(body);
    const turnFrame = trace?.turn_frame ?? null;
    const routeDecision = trace?.route_decision ?? null;
    const text = assistantText(body);
    const risk = turnFrame?.conversation_risk ?? null;
    const row = {
      turn,
      requestId: result.requestId,
      attempts: result.attempt,
      status: result.res.status,
      user: content,
      assistant: text,
      ok: body.ok ?? null,
      selected_handler: routeDecision?.selected_handler ?? null,
      response_owner: routeDecision?.response_owner ?? trace?.response_owner ??
        null,
      tool_execution: body.response?.tool_execution ?? null,
      executed_tools: body.response?.executed_tools ?? [],
      conversation_risk: risk,
      active_tool_skill_intake: turnFrame?.active_tool_skill_intake ?? null,
      pending_tool_skill_confirmation:
        turnFrame?.pending_tool_skill_confirmation ?? null,
    };
    raw.push({ ...row, body });
    summary.push(row);
    history.push({ role: "user", content });
    if (text) history.push({ role: "assistant", content: text });
  }

  const exitTurns = summary.filter((row) =>
    row.conversation_risk?.should_exit_flows === true &&
    Number(row.conversation_risk?.score ?? 0) >= 8
  );
  const exitTurn = exitTurns[0] ?? null;
  const exitAssistant = exitTurn?.assistant ?? "";
  const afterExit = exitTurn
    ? summary.find((row) => row.turn === exitTurn.turn + 1)
    : null;
  const checks = {
    min_turns: summary.length >= 6,
    all_status_ok: summary.every((row) => row.status === 200),
    exit_triggered: Boolean(exitTurn),
    recovery_mentions_restart: /reprend|repart|d[ée]but|z[ée]ro|proprement/i
      .test(exitAssistant),
    recovery_mentions_expected_context: scenario.recoveryMustMention.every((
      pattern,
    ) => pattern.test(exitAssistant)),
    recovery_asks_confirmation: /confirme|confirmer|ajuster|corriger/i.test(
      exitAssistant,
    ),
    recovery_no_self_misunderstanding:
      !hasBannedSelfMisunderstanding(exitAssistant),
    next_turn_no_slot_loop: afterExit ? !asksSlotAgain(afterExit.assistant) : true,
  };
  const green = Object.values(checks).every(Boolean);
  return { scenario, user, raw, summary, exitTurn, checks, green };
}

const results = [];
for (const scenario of scenarios) {
  results.push(await runScenario(scenario));
}

const rawPath = path.join(
  runDir,
  `2026-05-14-conversation-risk-long.raw.json`,
);
const summaryPath = path.join(
  runDir,
  `2026-05-14-conversation-risk-long.summary.json`,
);
const reportPath = path.join(
  runDir,
  `2026-05-14-conversation-risk-long.md`,
);

fs.writeFileSync(rawPath, `${JSON.stringify(results.map((r) => ({
  scenario: r.scenario.key,
  user: r.user,
  raw: r.raw,
})), null, 2)}\n`);
fs.writeFileSync(summaryPath, `${JSON.stringify(results.map((r) => ({
  scenario: r.scenario.key,
  user: r.user,
  summary: r.summary,
  checks: r.checks,
  green: r.green,
})), null, 2)}\n`);

const lines = [];
lines.push("# Conversation Risk Long QA - 2026-05-14");
lines.push("");
lines.push(`- Endpoint: \`${apiUrl}/functions/v1/test-send-message\``);
lines.push("- Mode: local full AI, `force_full_ai=true`, `disable_debounce=true`");
lines.push("- Minimum: 6 user turns per scenario");
lines.push("");
for (const result of results) {
  lines.push(`## ${result.scenario.key}`);
  lines.push("");
  lines.push(`- User: \`${result.user.userId}\``);
  lines.push(`- Scope: \`${result.scenario.scope}\``);
  lines.push(`- Verdict: ${result.green ? "GREEN" : "RED"}`);
  lines.push(`- Checks: \`${JSON.stringify(result.checks)}\``);
  if (result.exitTurn) {
    lines.push(
      `- Exit turn: T${result.exitTurn.turn}, score ${result.exitTurn.conversation_risk?.score}`,
    );
  } else {
    lines.push("- Exit turn: none");
  }
  lines.push("");
  lines.push("### Transcript");
  lines.push("");
  for (const row of result.summary) {
    const risk = row.conversation_risk;
    lines.push(`**T${row.turn} User**: ${row.user}`);
    lines.push("");
    lines.push(`**T${row.turn} Sophia**: ${row.assistant}`);
    lines.push("");
    lines.push(
      `Trace: selected_handler=\`${row.selected_handler}\`, risk_score=\`${risk?.score ?? null}\`, exit=\`${risk?.should_exit_flows ?? false}\`, reasons=\`${(risk?.reason_codes ?? []).join(",")}\``,
    );
    lines.push("");
  }
}
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log(`raw=${rawPath}`);
console.log(`summary=${summaryPath}`);
console.log(`report=${reportPath}`);
console.log(`green=${results.every((result) => result.green)}`);
if (!results.every((result) => result.green)) {
  process.exitCode = 1;
}
