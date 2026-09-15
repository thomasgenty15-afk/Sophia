#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = `memory-long-e2e-${Date.now().toString(36)}`;
const scopeA = `${runId}-conversation-a`;
const scopeB = `${runId}-conversation-b`;

function readLocalEnv() {
  const envPath = path.join(cwd, "supabase", ".env");
  const out = {};
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function readStatus() {
  try {
    const raw = execFileSync("supabase", ["status", "--output", "json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const env = readLocalEnv();
const status = readStatus();
const apiUrl = status.API_URL ?? env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const functionsUrl = status.FUNCTIONS_URL ?? `${apiUrl}/functions/v1`;
const anonKey = status.ANON_KEY ?? env.SUPABASE_ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = env.INTERNAL_FUNCTION_SECRET ?? env.SECRET_KEY;

if (!anonKey || !serviceRoleKey || !internalSecret) {
  throw new Error("Missing Supabase keys/internal secret in supabase/.env or supabase status.");
}

async function requestJson(url, opts = {}) {
  const response = await fetch(url, opts);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`${opts.method ?? "GET"} ${url} -> ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { status: response.status, body };
}

async function adminRequest(pathname, opts = {}) {
  return await requestJson(`${apiUrl}${pathname}`, {
    ...opts,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function rest(pathname, opts = {}) {
  const { body } = await adminRequest(`/rest/v1/${pathname}`, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: {
      ...(opts.prefer ? { prefer: opts.prefer } : {}),
      ...(opts.headers ?? {}),
    },
  });
  return body;
}

async function createUser() {
  const email = `${runId}@example.com`;
  const password = `MemoryLong-${Date.now()}!`;
  const { body: created } = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { fixture: runId, full_name: "Memory Long E2E" },
    },
  });
  const userId = created?.id;
  if (!userId) throw new Error("Could not create auth user.");
  await rest("profiles?on_conflict=id", {
    method: "POST",
    body: {
      id: userId,
      full_name: "Memory Long E2E",
      onboarding_completed: true,
      timezone: "Europe/Paris",
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  const { body: session } = await requestJson(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!session?.access_token) throw new Error("Could not sign in created user.");
  return { id: userId, email, password, accessToken: session.access_token };
}

const firstConversation = [
  "Contexte durable: je travaille sur un projet perso appele Nebula, un mini CRM pour profs independants.",
  "Nebula est prioritaire jusqu'a la fin juillet, plus que mes autres idees SaaS.",
  "Mon objectif pour Nebula est d'obtenir cinq profs pilotes et deux retours payants avant fin juillet.",
  "Quand je travaille sur l'interface apres 22h45, je m'eparpille et je casse souvent des details deja stables.",
  "Je bloque surtout quand une tache demande trop de decisions; propose-moi une action de sept minutes, observable et concrete.",
  "Ma routine de debut de journee ideale: ouvrir les volets, boire de l'eau, ranger le bureau trois minutes, puis seulement ouvrir Linear.",
  "Ines est mon assistante administrative et elle m'aide a suivre les contrats signes.",
  "Correction importante: Ines est mon assistante administrative, pas ma cliente.",
  "Samir est mon coach de natation; il m'aide a nager sans chercher la performance.",
  "Je veux nager deux fois par semaine, mais garder ca comme recuperation, pas comme objectif de performance.",
  "Hier midi, j'ai nage 28 minutes et ca m'a vraiment calme avant de reprendre Nebula.",
  "Je surveille une allergie au sesame; evite de me proposer des plats avec sesame, tahini ou gomasio.",
  "Je ne veux pas que mon allergie au sesame ressorte dans une conversation neutre sur Nebula ou la natation.",
  "Je bois parfois du whisky le soir quand je veux anesthesier la pression; ce sujet doit rester sensible.",
  "Ne ressors pas l'alcool sauf si je parle directement de whisky, d'apero, de pression le soir ou d'envie d'anesthesier.",
  "Le client Rivage me stresse parce qu'il valide puis revient sur les decisions deux jours apres.",
  "Rivage est un client de consulting, pas un module de Nebula.",
  "Quand je dis 'je suis nul en vente', c'est de la honte du moment, pas une verite stable.",
  "Je prefere des reponses sobres, en trois points maximum, quand je suis fatigue.",
  "Si je suis en surcharge, propose-moi d'abord de fermer une boucle ouverte plutot que d'ajouter une nouvelle ambition.",
  "Vendredi dernier, j'ai oublie de relancer Rivage sur un contrat et Ines m'a aide a retrouver le document.",
  "Je veux evaluer mes progres avec un bilan du vendredi, pas avec une note tous les soirs.",
  "Aujourd'hui j'ai annule une session Nebula parce que j'etais vide, mais j'ai quand meme choisi la prochaine micro-livraison.",
];

const secondConversation = [
  {
    id: "trivial",
    message: "Salut, tu vas bien ?",
    expected_memory: "none_or_light",
    expected_terms: [],
  },
  {
    id: "nebula_project",
    message: "Tu peux me rappeler ce que tu as retenu sur Nebula et mon objectif concret ?",
    expected_memory: "targeted",
    min_matches: 3,
    expected_terms: ["nebula", "cinq", "profs", "juillet"],
  },
  {
    id: "micro_action",
    message: "Je suis fatigue et je bloque: propose-moi une prochaine action adaptee a moi.",
    expected_memory: "targeted",
    min_matches: 2,
    expected_terms: ["sept", "concrete", "fatigue", "boucle"],
  },
  {
    id: "allergy",
    message: "On choisit un plat rapide: qu'est-ce que tu dois eviter pour moi ?",
    expected_memory: "sensitive_targeted",
    min_matches: 3,
    expected_terms: ["allerg", "sesame", "tahini"],
  },
  {
    id: "neutral_swimming",
    message: "Pour ma prochaine session de natation, redonne-moi le bon cadre sans sortir les sujets sensibles inutiles.",
    expected_memory: "topic_light",
    min_matches: 2,
    expected_terms: ["nager", "deux fois", "recuperation"],
    forbidden_terms: ["whisky", "alcool", "sesame", "allerg"],
  },
  {
    id: "ines_rivage",
    message: "Qui est Ines, et quel est le lien avec Rivage ?",
    expected_memory: "cross_topic",
    min_matches: 3,
    expected_terms: ["ines", "assistante", "rivage", "contrat"],
  },
  {
    id: "math_no_memory",
    message: "Message sans besoin de contexte: reponds simplement 'OK recu'.",
    expected_memory: "none",
    min_matches: 1,
    expected_terms: ["ok"],
    forbidden_terms: ["nebula", "ines", "rivage", "whisky", "sesame"],
  },
  {
    id: "sensitive_alcohol",
    message: "Quand je parle de pression le soir et d'envie d'anesthesier, qu'est-ce que tu dois garder en tete ?",
    expected_memory: "sensitive_targeted",
    min_matches: 3,
    expected_terms: ["whisky", "pression", "sensible"],
  },
];

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function responseText(body) {
  return String(body?.content ?? body?.message ?? body?.raw ?? "").trim();
}

async function callBrain(user, scope, turn, index, phase) {
  const requestId = `${runId}-${phase}-${turn.id ?? index}`;
  const { body } = await requestJson(`${functionsUrl}/sophia-brain`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${user.accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      message: typeof turn === "string" ? turn : turn.message,
      scope,
      channel: "web",
      logMessages: true,
      messageMetadata: {
        long_e2e_run_id: runId,
        phase,
        turn_id: typeof turn === "string" ? `seed_${index}` : turn.id,
        turn_index: index,
        force_full_ai: true,
      },
    }),
  });
  return {
    request_id: requestId,
    id: typeof turn === "string" ? `seed_${index}` : turn.id,
    message: typeof turn === "string" ? turn : turn.message,
    response_text: responseText(body),
    response_body: body,
  };
}

async function triggerMemorizer(userId) {
  const { body } = await requestJson(`${functionsUrl}/trigger-memorizer-daily`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-request-id": `${runId}-memorizer`,
    },
    body: JSON.stringify({
      user_id: userId,
      hours: 24,
      since_iso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  return body;
}

async function getTrace(userId, scope, hours = 6) {
  const { body } = await requestJson(`${functionsUrl}/get-memory-trace`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-request-id": `${runId}-trace-${scope}`,
    },
    body: JSON.stringify({ user_id: userId, hours, scope }),
  });
  return body?.trace ?? null;
}

async function fetchMemoryState(userId) {
  const [items, topics, links, runs] = await Promise.all([
    rest(`memory_items?user_id=eq.${encodeURIComponent(userId)}&select=id,kind,status,content_text,domain_keys,sensitivity_level,requires_user_initiated,created_at&order=created_at.asc`),
    rest(`user_topic_memories?user_id=eq.${encodeURIComponent(userId)}&select=id,slug,title,status,lifecycle_stage,metadata&order=updated_at.desc`),
    rest(`memory_item_topics?user_id=eq.${encodeURIComponent(userId)}&select=memory_item_id,topic_id,relation_type,confidence,user_topic_memories(slug,title)&order=confidence.desc`),
    rest(`memory_extraction_runs?user_id=eq.${encodeURIComponent(userId)}&select=id,status,trigger_type,proposed_item_count,accepted_item_count,rejected_item_count,metadata,started_at,finished_at&order=started_at.desc&limit=3`),
  ]);
  return {
    items: Array.isArray(items) ? items : [],
    topics: Array.isArray(topics) ? topics : [],
    links: Array.isArray(links) ? links : [],
    runs: Array.isArray(runs) ? runs : [],
  };
}

function extractTurnTrace(trace, requestId) {
  const turn = (trace?.turns ?? []).find((row) => row.request_id === requestId);
  if (!turn) return null;
  const active = (turn.events ?? [])
    .filter((event) => event.event_name === "memory.runtime.active.loaded")
    .at(-1)?.payload ?? null;
  const model = (turn.events ?? [])
    .filter((event) => event.event_name === "router.model_selected")
    .at(-1)?.payload ?? null;
  return {
    request_id: requestId,
    dispatcher_memory_plan: turn.dispatcher?.memory_plan ?? null,
    injected: Boolean(turn.injection),
    injection_tokens: turn.injection?.estimated_tokens ?? null,
    active_loader: active
      ? {
        retrieval_mode: active.retrieval_mode ?? null,
        requested_scopes: active.loader_plan_requested_scopes ?? [],
        domain_keys: active.loader_plan_domain_keys ?? [],
        topic_decision: active.topic_decision ?? null,
        active_topic_id: active.active_topic_id ?? null,
        payload_item_count: active.payload_item_count ?? null,
        payload_item_ids: active.payload_item_ids ?? [],
        sensitive_excluded_count: active.sensitive_excluded_count ?? null,
        fallback_used: active.fallback_used ?? null,
      }
      : null,
    model_selection: model,
  };
}

function evaluateSecondTurn(turn, trace) {
  const response = normalize(turn.response_text);
  const matched = (turn.expected_terms ?? []).filter((term) =>
    response.includes(normalize(term))
  );
  const forbidden_hits = (turn.forbidden_terms ?? []).filter((term) =>
    response.includes(normalize(term))
  );
  const memoryMode = String(trace?.dispatcher_memory_plan?.memory_mode ?? "");
  const contextNeed = String(trace?.dispatcher_memory_plan?.context_need ?? "");
  const payloadCount = Number(trace?.active_loader?.payload_item_count ?? 0);
  let dispatcher_ok = true;
  if (turn.expected_memory === "none") {
    dispatcher_ok = memoryMode === "none" || payloadCount === 0;
  } else if (turn.expected_memory === "none_or_light") {
    dispatcher_ok = memoryMode === "none" || memoryMode === "light" || payloadCount <= 1;
  } else if (turn.expected_memory === "sensitive_targeted") {
    dispatcher_ok = payloadCount > 0 &&
      Number(trace?.active_loader?.sensitive_excluded_count ?? 0) === 0;
  } else if (turn.expected_memory === "cross_topic") {
    dispatcher_ok = trace?.active_loader?.retrieval_mode === "cross_topic_lookup" ||
      memoryMode === "broad";
  } else {
    dispatcher_ok = payloadCount > 0 || contextNeed === "targeted" || memoryMode !== "none";
  }
  return {
    id: turn.id,
    expected_memory: turn.expected_memory,
    matched_terms: matched,
    forbidden_hits,
    semantic_ok: matched.length >=
      Math.min(turn.min_matches ?? 2, (turn.expected_terms ?? []).length),
    privacy_ok: forbidden_hits.length === 0,
    dispatcher_ok,
    memory_mode: memoryMode || null,
    context_need: contextNeed || null,
    active_loader: trace?.active_loader ?? null,
    response_preview: turn.response_text.slice(0, 700),
  };
}

async function main() {
  const user = await createUser();
  const firstTurns = [];
  for (let i = 0; i < firstConversation.length; i++) {
    firstTurns.push(await callBrain(user, scopeA, firstConversation[i], i, "conversation_a"));
  }
  const traceA = await getTrace(user.id, scopeA, 6);
  const memorizer = await triggerMemorizer(user.id);
  const memoryState = await fetchMemoryState(user.id);

  const secondTurns = [];
  for (let i = 0; i < secondConversation.length; i++) {
    const result = await callBrain(user, scopeB, secondConversation[i], i, "conversation_b");
    secondTurns.push({ ...secondConversation[i], ...result });
  }
  const traceB = await getTrace(user.id, scopeB, 6);
  const secondTraceByRequest = new Map(
    secondTurns.map((turn) => [turn.request_id, extractTurnTrace(traceB, turn.request_id)]),
  );
  const evaluations = secondTurns.map((turn) =>
    evaluateSecondTurn(turn, secondTraceByRequest.get(turn.request_id))
  );

  const report = {
    ok: evaluations.every((row) => row.semantic_ok && row.privacy_ok && row.dispatcher_ok),
    run_id: runId,
    user: { id: user.id, email: user.email },
    scopes: { first: scopeA, second: scopeB },
    first_conversation: {
      turn_count: firstTurns.length,
      turns: firstTurns,
      trace_summary: traceA?.summary ?? null,
    },
    memorizer,
    memory_state: memoryState,
    second_conversation: {
      turn_count: secondTurns.length,
      turns: secondTurns,
      trace_summary: traceB?.summary ?? null,
      evaluations,
      traces: Object.fromEntries(
        secondTurns.map((turn) => [turn.id, secondTraceByRequest.get(turn.request_id)]),
      ),
    },
    checks: {
      first_conversation_20_plus_turns: firstTurns.length >= 20,
      memorizer_completed: memorizer?.processed?.some((row) =>
        row.user_id === user.id && row.memorizer?.status === "completed"
      ) ?? false,
      memories_persisted: memoryState.items.some((item) => item.status === "active"),
      second_dispatcher_all_ok: evaluations.every((row) => row.dispatcher_ok),
      second_semantic_all_ok: evaluations.every((row) => row.semantic_ok),
      privacy_no_forbidden_leaks: evaluations.every((row) => row.privacy_ok),
    },
  };

  mkdirSync(path.join(cwd, "tmp"), { recursive: true });
  const outPath = path.join(cwd, "tmp", `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report_path: outPath,
    run_id: runId,
    user: report.user,
    scopes: report.scopes,
    checks: report.checks,
    memory_counts: {
      items: memoryState.items.length,
      active_items: memoryState.items.filter((item) => item.status === "active").length,
      topics: memoryState.topics.length,
      links: memoryState.links.length,
    },
    memorizer_summary: memorizer?.processed?.find((row) => row.user_id === user.id)?.memorizer ?? null,
    evaluations: evaluations.map((row) => ({
      id: row.id,
      expected_memory: row.expected_memory,
      semantic_ok: row.semantic_ok,
      dispatcher_ok: row.dispatcher_ok,
      privacy_ok: row.privacy_ok,
      matched_terms: row.matched_terms,
      forbidden_hits: row.forbidden_hits,
      memory_mode: row.memory_mode,
      context_need: row.context_need,
      retrieval_mode: row.active_loader?.retrieval_mode ?? null,
      payload_item_count: row.active_loader?.payload_item_count ?? null,
      sensitive_excluded_count: row.active_loader?.sensitive_excluded_count ?? null,
      response_preview: row.response_preview,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  if (error?.body) console.error(JSON.stringify(error.body, null, 2));
  process.exitCode = 1;
});
