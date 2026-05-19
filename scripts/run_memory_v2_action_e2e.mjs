#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = `memory-action-e2e-${Date.now().toString(36)}`;
const scopeA = `${runId}-conversation-a`;
const scopeB = `${runId}-conversation-b`;
const now = new Date();
const isoNow = now.toISOString();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

const ACTION_FAMILIES = {
  pushups: "habit:pompes_matin",
  stretch: "habit:etirements_soir",
  clara: "task:message_clara",
};

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
  const { timeoutMs = 120000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${opts.method ?? "GET"} ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
  const password = `MemoryAction-${Date.now()}!`;
  const { body: created } = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { fixture: runId, full_name: "Memory Action E2E" },
    },
  });
  const userId = created?.id;
  if (!userId) throw new Error("Could not create auth user.");
  await rest("profiles?on_conflict=id", {
    method: "POST",
    body: {
      id: userId,
      full_name: "Memory Action E2E",
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

async function seedPlan(userId) {
  const cycleId = randomUUID();
  const transformationId = randomUUID();
  const planId = randomUUID();
  const ids = {
    cycleId,
    transformationId,
    planId,
    pushups12: randomUUID(),
    stretch8: randomUUID(),
    clara: randomUUID(),
    pushups16: randomUUID(),
  };

  await rest("user_cycles", {
    method: "POST",
    body: {
      id: cycleId,
      user_id: userId,
      status: "active",
      raw_intake_text: "Fixture E2E memoire action.",
      intake_language: "fr",
      duration_months: 1,
      version: 1,
    },
    prefer: "return=minimal",
  });
  await rest("user_transformations", {
    method: "POST",
    body: {
      id: transformationId,
      cycle_id: cycleId,
      priority_order: 1,
      status: "active",
      title: "Routine d'energie",
      internal_summary: "Fixture E2E pour tester les memoires liees aux actions.",
      user_summary: "Routine d'energie progressive.",
      success_definition: "Les actions actives gardent leurs apprentissages utiles.",
      activated_at: isoNow,
    },
    prefer: "return=minimal",
  });
  await rest(`user_cycles?id=eq.${cycleId}`, {
    method: "PATCH",
    body: { active_transformation_id: transformationId },
    prefer: "return=minimal",
  });
  await rest("user_plans_v2", {
    method: "POST",
    body: {
      id: planId,
      user_id: userId,
      cycle_id: cycleId,
      transformation_id: transformationId,
      status: "active",
      version: 1,
      title: "Plan E2E action memory",
      content: { fixture: runId },
      activated_at: isoNow,
    },
    prefer: "return=minimal",
  });
  await rest("user_plan_items", {
    method: "POST",
    body: [
      {
        id: ids.pushups12,
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        dimension: "habits",
        kind: "habit",
        status: "active",
        title: "Faire 12 pompes",
        description: "Habitude progressive de pompes le matin.",
        tracking_type: "count",
        activation_order: 1,
        current_habit_state: "active_building",
        target_reps: 12,
        current_reps: 12,
        cadence_label: "12 repetitions, trois fois cette semaine",
        scheduled_days: ["mon", "wed", "fri"],
        time_of_day: "morning",
        payload: {
          fixture: runId,
          action_family_key: ACTION_FAMILIES.pushups,
          aliases: ["pompes", "pompes matin", "pushups"],
          variant: "week_1_12_reps",
        },
        activated_at: isoNow,
      },
      {
        id: ids.stretch8,
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        dimension: "habits",
        kind: "habit",
        status: "active",
        title: "Etirements 8 minutes",
        description: "Routine d'etirements le soir.",
        tracking_type: "boolean",
        activation_order: 2,
        current_habit_state: "active_building",
        target_reps: 1,
        current_reps: 0,
        cadence_label: "8 minutes le soir",
        scheduled_days: ["tue", "thu", "sun"],
        time_of_day: "evening",
        payload: {
          fixture: runId,
          action_family_key: ACTION_FAMILIES.stretch,
          aliases: ["etirements", "stretching", "mobilite soir"],
          variant: "evening_8_min",
        },
        activated_at: isoNow,
      },
      {
        id: ids.clara,
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        dimension: "missions",
        kind: "task",
        status: "active",
        title: "Envoyer un message a Clara",
        description: "Relancer Clara avec une premiere phrase simple.",
        tracking_type: "boolean",
        activation_order: 3,
        current_habit_state: null,
        target_reps: null,
        current_reps: null,
        cadence_label: null,
        scheduled_days: null,
        time_of_day: null,
        payload: {
          fixture: runId,
          action_family_key: ACTION_FAMILIES.clara,
          aliases: ["message clara", "relance clara"],
          variant: "single_task",
        },
        activated_at: isoNow,
      },
    ],
    prefer: "return=minimal",
  });
  await rest("user_plan_item_entries", {
    method: "POST",
    body: [
      {
        id: randomUUID(),
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        plan_item_id: ids.pushups12,
        entry_kind: "progress",
        outcome: "done",
        value_numeric: 12,
        value_text: null,
        difficulty_level: "medium",
        blocker_hint: "derniere serie dure",
        effective_at: isoNow,
        metadata: { fixture: runId },
      },
      {
        id: randomUUID(),
        user_id: userId,
        cycle_id: cycleId,
        transformation_id: transformationId,
        plan_id: planId,
        plan_item_id: ids.stretch8,
        entry_kind: "skip",
        outcome: "skipped",
        value_numeric: null,
        value_text: null,
        difficulty_level: "high",
        blocker_hint: "mauvais moment avant diner",
        effective_at: isoNow,
        metadata: { fixture: runId },
      },
    ],
    prefer: "return=minimal",
  });

  return ids;
}

async function advancePushupsPlan(userId, ids) {
  await rest(`user_plan_items?id=eq.${ids.pushups12}`, {
    method: "PATCH",
    body: {
      status: "completed",
      completed_at: new Date().toISOString(),
      current_habit_state: "active_building",
    },
    prefer: "return=minimal",
  });
  await rest("user_plan_items", {
    method: "POST",
    body: {
      id: ids.pushups16,
      user_id: userId,
      cycle_id: ids.cycleId,
      transformation_id: ids.transformationId,
      plan_id: ids.planId,
      dimension: "habits",
      kind: "habit",
      status: "active",
      title: "Faire 16 pompes",
      description: "Meme habitude de pompes, niveau suivant.",
      tracking_type: "count",
      activation_order: 4,
      current_habit_state: "active_building",
      target_reps: 16,
      current_reps: 0,
      cadence_label: "16 repetitions, trois fois cette semaine",
      scheduled_days: ["mon", "wed", "fri"],
      time_of_day: "morning",
      start_after_item_id: ids.pushups12,
      payload: {
        fixture: runId,
        action_family_key: ACTION_FAMILIES.pushups,
        aliases: ["pompes", "pompes matin", "pushups"],
        variant: "week_2_16_reps",
      },
      activated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
}

const firstConversation = [
  "Contexte test: je veux que mes actions gardent leurs apprentissages utiles d'une semaine a l'autre.",
  "Action active Faire 12 pompes: aujourd'hui j'ai fait les 12 reps, mais la derniere serie etait trop dure.",
  "Observation d'action pour Faire 12 pompes: je reussis mieux quand je les fais juste apres le petit-dejeuner.",
  "Pattern d'action pour Faire 12 pompes: garder la premiere serie facile m'evite d'abandonner sur la derniere.",
  "Action active Etirements 8 minutes: avant le diner ca ne marche pas, je les saute presque toujours.",
  "Observation d'action pour Etirements 8 minutes: apres la douche du soir, ca passe beaucoup mieux.",
  "Ne confonds pas les etirements avec les pompes: les pompes sont le matin apres petit-dejeuner, les etirements le soir apres la douche.",
  "Action active Envoyer un message a Clara: mon blocage est la premiere phrase, pas le contenu du message.",
  "Pour Clara, si tu dois m'aider plus tard, propose une phrase tres simple et non parfaite.",
  "Je prefere qu'on me rappelle les apprentissages d'action sous forme concrete, pas comme une motivation generale.",
  "Aujourd'hui j'ai note que les pompes marchent mieux si mon telephone reste dans la cuisine.",
  "Pour les etirements, le tapis visible dans la salle de bain aide, mais le vrai declencheur reste la douche.",
  "Pour l'action Clara, je n'ai pas besoin d'un long plan, juste une premiere ligne envoyable.",
  "Quand une habitude augmente en repetitions, je veux garder les memes astuces si la substance de l'action reste la meme.",
  "Si je parle de Faire 16 pompes la semaine prochaine, tu dois comprendre que c'est la meme famille que Faire 12 pompes.",
  "La phrase cle pour Clara pourrait etre: Coucou Clara, je te propose qu'on se cale dix minutes cette semaine.",
  "J'ai aussi une idee de lecture sur le design, mais ce n'est pas une action active du plan.",
  "Mon energie est meilleure le matin, donc les pompes ne doivent pas glisser le soir.",
  "Si je dis juste etirements, pense au moment apres douche plutot qu'a une seance sportive lourde.",
  "La difficulte des pompes n'est pas le demarrage, c'est d'aller trop vite sur les premieres reps.",
  "L'action Clara est ponctuelle, mais le blocage premiere phrase est reutilisable pour ce genre de relance.",
  "Fin du point action: je veux que ces infos soient rangees dans la memoire d'action, pas seulement dans l'historique brut.",
];

const secondConversation = [
  {
    id: "trivial_no_memory",
    message: "Reponds seulement: OK recu.",
    expected_memory: "none_or_empty",
    expected_terms: ["ok"],
    forbidden_terms: ["pompes", "etirements", "clara", "douche", "petit-dejeuner"],
  },
  {
    id: "pushups_exact",
    message: "Pour mon action Faire 12 pompes, d'apres mes souvenirs memorises uniquement, dis-moi ce qui m'aide concretement sans inventer de conseil.",
    expected_memory: "action_targeted",
    min_matches: 3,
    expected_terms: ["pompes", "petit-dejeuner", "premiere serie", "facile"],
    forbidden_terms: ["douche", "clara"],
  },
  {
    id: "pushups_family_crescendo",
    message: "Maintenant l'action active est Faire 16 pompes. D'apres mes souvenirs memorises uniquement, qu'est-ce qui m'aide pour cette meme habitude ?",
    expected_memory: "action_family",
    min_matches: 3,
    expected_terms: ["pompes", "petit-dejeuner", "premiere serie", "facile"],
    forbidden_terms: ["etirements", "clara"],
  },
  {
    id: "stretch_exact",
    message: "Pour Etirements 8 minutes, d'apres mes souvenirs memorises uniquement, dis-moi le bon moment et ce qui aide.",
    expected_memory: "action_targeted",
    min_matches: 3,
    expected_terms: ["etirements", "douche", "soir", "tapis"],
    forbidden_terms: ["pompes", "clara"],
  },
  {
    id: "clara_task",
    message: "Pour Envoyer un message a Clara, d'apres mes souvenirs memorises uniquement, c'est quoi mon blocage et la meilleure aide ?",
    expected_memory: "action_targeted",
    min_matches: 3,
    expected_terms: ["clara", "premiere phrase", "simple"],
    forbidden_terms: ["pompes", "etirements", "douche"],
  },
  {
    id: "generic_action_words",
    message: "J'ai une action active mais je ne dis pas laquelle: donne une reponse courte sans inventer de souvenir precis.",
    expected_memory: "light_or_ambiguous",
    expected_terms: [],
    forbidden_terms: ["petit-dejeuner", "douche", "clara", "premiere phrase"],
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callBrain(user, scope, turn, index, phase) {
  const requestId = `${runId}-${phase}-${turn.id ?? index}`;
  console.error(`[${runId}] ${phase} turn ${index + 1}: ${turn.id ?? `seed_${index}`}`);
  let body = null;
  let usedRequestId = requestId;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      usedRequestId = `${requestId}-attempt-${attempt}`;
      const result = await requestJson(`${functionsUrl}/sophia-brain`, {
        method: "POST",
        timeoutMs: 300000,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${user.accessToken}`,
          "content-type": "application/json",
          "x-request-id": usedRequestId,
        },
        body: JSON.stringify({
          message: typeof turn === "string" ? turn : turn.message,
          scope,
          channel: "web",
          logMessages: true,
          messageMetadata: {
            action_e2e_run_id: runId,
            phase,
            turn_id: typeof turn === "string" ? `seed_${index}` : turn.id,
            turn_index: index,
            attempt,
            force_full_ai: true,
          },
        }),
      });
      body = result.body;
      break;
    } catch (error) {
      const retryable = error?.status === 502 ||
        String(error?.message ?? "").includes("timed out");
      if (!retryable || attempt === 3) throw error;
      console.error(`[${runId}] retry turn ${index + 1} after ${error.message}`);
      await sleep(2000 * attempt);
    }
  }
  return {
    request_id: usedRequestId,
    id: typeof turn === "string" ? `seed_${index}` : turn.id,
    message: typeof turn === "string" ? turn : turn.message,
    response_text: responseText(body),
    response_body: body,
  };
}

async function triggerMemorizer(userId) {
  console.error(`[${runId}] trigger memorizer`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { body } = await requestJson(`${functionsUrl}/trigger-memorizer-daily`, {
        method: "POST",
        timeoutMs: 300000,
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "content-type": "application/json",
          "x-internal-secret": internalSecret,
          "x-request-id": `${runId}-memorizer-attempt-${attempt}`,
        },
        body: JSON.stringify({
          user_id: userId,
          hours: 24,
          since_iso: oneHourAgo,
        }),
      });
      return body;
    } catch (error) {
      const retryable = error?.status === 502 ||
        String(error?.message ?? "").includes("timed out");
      if (!retryable || attempt === 3) throw error;
      console.error(`[${runId}] retry memorizer after ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

async function getTrace(userId, scope, hours = 6) {
  console.error(`[${runId}] fetch trace ${scope}`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { body } = await requestJson(`${functionsUrl}/get-memory-trace`, {
        method: "POST",
        timeoutMs: 60000,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
          "x-internal-secret": internalSecret,
          "x-request-id": `${runId}-trace-${scope}-attempt-${attempt}`,
        },
        body: JSON.stringify({ user_id: userId, hours, scope }),
      });
      return body?.trace ?? null;
    } catch (error) {
      const retryable = error?.status === 502 ||
        String(error?.message ?? "").includes("timed out");
      if (!retryable || attempt === 3) throw error;
      console.error(`[${runId}] retry trace after ${error.message}`);
      await sleep(1000 * attempt);
    }
  }
}

async function fetchActionMemoryState(userId) {
  const encodedUser = encodeURIComponent(userId);
  const [items, actionLinks, occurrences, runs] = await Promise.all([
    rest(`memory_items?user_id=eq.${encodedUser}&select=id,kind,status,content_text,domain_keys,sensitivity_level,metadata,created_at&order=created_at.asc`),
    rest(`memory_item_actions?user_id=eq.${encodedUser}&select=id,memory_item_id,plan_item_id,aggregation_kind,confidence,metadata,created_at,memory_items(id,kind,status,content_text,metadata)&order=created_at.asc`),
    rest(`memory_item_action_occurrences?user_id=eq.${encodedUser}&select=id,memory_item_action_id,action_occurrence_id,metadata,created_at&order=created_at.asc`),
    rest(`memory_extraction_runs?user_id=eq.${encodedUser}&select=id,status,trigger_type,proposed_item_count,accepted_item_count,rejected_item_count,metadata,started_at,finished_at&order=started_at.desc&limit=3`),
  ]);
  return {
    items: Array.isArray(items) ? items : [],
    actionLinks: Array.isArray(actionLinks) ? actionLinks : [],
    occurrences: Array.isArray(occurrences) ? occurrences : [],
    runs: Array.isArray(runs) ? runs : [],
  };
}

function extractTurnTrace(trace, requestId) {
  const turn = (trace?.turns ?? []).find((row) => row.request_id === requestId);
  if (!turn) return null;
  const active = (turn.events ?? [])
    .filter((event) => event.event_name === "memory.runtime.active.loaded")
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
        action_targets: active.loader_plan_action_targets ?? [],
        payload_item_count: active.payload_item_count ?? null,
        payload_item_ids: active.payload_item_ids ?? [],
        sensitive_excluded_count: active.sensitive_excluded_count ?? null,
        fallback_used: active.fallback_used ?? null,
      }
      : null,
  };
}

function evaluateActionPersistence(state, ids) {
  const activeLinks = state.actionLinks.filter((link) =>
    link?.memory_items?.status === "active" || !link?.memory_items
  );
  const linkText = (link) => normalize(link?.memory_items?.content_text ?? "");
  const byPlan = (planId) => activeLinks.filter((link) => link.plan_item_id === planId);
  const familyLinks = (family) => activeLinks.filter((link) =>
    link?.metadata?.action_family_key === family ||
    link?.memory_items?.metadata?.action_family_key === family
  );
  const wrongPushupsOnStretch = byPlan(ids.stretch8).filter((link) =>
    linkText(link).includes("pompe") || linkText(link).includes("petit-dejeuner")
  );
  const wrongStretchOnPushups = byPlan(ids.pushups12).filter((link) =>
    linkText(link).includes("etirement") || linkText(link).includes("douche")
  );
  return {
    action_links_total: activeLinks.length,
    pushups_links: byPlan(ids.pushups12).length,
    stretch_links: byPlan(ids.stretch8).length,
    clara_links: byPlan(ids.clara).length,
    pushups_family_links: familyLinks(ACTION_FAMILIES.pushups).length,
    stretch_family_links: familyLinks(ACTION_FAMILIES.stretch).length,
    clara_family_links: familyLinks(ACTION_FAMILIES.clara).length,
    occurrence_links: state.occurrences.length,
    wrong_pushups_on_stretch: wrongPushupsOnStretch.map((link) => link.memory_item_id),
    wrong_stretch_on_pushups: wrongStretchOnPushups.map((link) => link.memory_item_id),
    ok: activeLinks.length >= 3 &&
      byPlan(ids.pushups12).length >= 1 &&
      byPlan(ids.stretch8).length >= 1 &&
      byPlan(ids.clara).length >= 1 &&
      familyLinks(ACTION_FAMILIES.pushups).length >= 1 &&
      familyLinks(ACTION_FAMILIES.stretch).length >= 1 &&
      familyLinks(ACTION_FAMILIES.clara).length >= 1 &&
      wrongPushupsOnStretch.length === 0 &&
      wrongStretchOnPushups.length === 0,
  };
}

function evaluateSecondTurn(turn, trace) {
  const response = normalize(turn.response_text);
  const matched = (turn.expected_terms ?? []).filter((term) =>
    response.includes(normalize(term))
  );
  const forbiddenHits = (turn.forbidden_terms ?? []).filter((term) =>
    response.includes(normalize(term))
  );
  const memoryMode = String(trace?.dispatcher_memory_plan?.memory_mode ?? "");
  const contextNeed = String(trace?.dispatcher_memory_plan?.context_need ?? "");
  const payloadCount = Number(trace?.active_loader?.payload_item_count ?? 0);
  const requestedScopes = trace?.active_loader?.requested_scopes ?? [];
  const hasActionScope = requestedScopes.includes("action");
  let dispatcherOk = true;
  if (turn.expected_memory === "none_or_empty") {
    dispatcherOk = memoryMode === "none" || payloadCount === 0;
  } else if (turn.expected_memory === "action_targeted" || turn.expected_memory === "action_family") {
    dispatcherOk = payloadCount > 0 && hasActionScope;
  } else if (turn.expected_memory === "light_or_ambiguous") {
    dispatcherOk = payloadCount <= 1 || !hasActionScope;
  }
  const semanticOk = matched.length >= Math.min(turn.min_matches ?? 0, (turn.expected_terms ?? []).length);
  return {
    id: turn.id,
    expected_memory: turn.expected_memory,
    matched_terms: matched,
    forbidden_hits: forbiddenHits,
    semantic_ok: semanticOk,
    privacy_ok: forbiddenHits.length === 0,
    dispatcher_ok: dispatcherOk,
    memory_mode: memoryMode || null,
    context_need: contextNeed || null,
    active_loader: trace?.active_loader ?? null,
    response_preview: turn.response_text.slice(0, 700),
  };
}

async function main() {
  console.error(`[${runId}] create user`);
  const user = await createUser();
  console.error(`[${runId}] seed plan`);
  const ids = await seedPlan(user.id);
  const firstTurns = [];
  for (let i = 0; i < firstConversation.length; i++) {
    firstTurns.push(await callBrain(user, scopeA, firstConversation[i], i, "conversation_a"));
  }
  const traceA = await getTrace(user.id, scopeA, 6);
  const memorizer = await triggerMemorizer(user.id);
  console.error(`[${runId}] fetch persisted action memories`);
  const memoryState = await fetchActionMemoryState(user.id);
  const persistenceEvaluation = evaluateActionPersistence(memoryState, ids);

  console.error(`[${runId}] advance pushups plan to 16 reps`);
  await advancePushupsPlan(user.id, ids);

  const secondTurns = [];
  for (let i = 0; i < secondConversation.length; i++) {
    const result = await callBrain(user, scopeB, secondConversation[i], i, "conversation_b");
    secondTurns.push({ ...secondConversation[i], ...result });
  }
  const traceB = await getTrace(user.id, scopeB, 6);
  const secondTraceByRequest = new Map(
    secondTurns.map((turn) => [turn.request_id, extractTurnTrace(traceB, turn.request_id)]),
  );
  const retrievalEvaluations = secondTurns.map((turn) =>
    evaluateSecondTurn(turn, secondTraceByRequest.get(turn.request_id))
  );

  const checks = {
    first_conversation_20_plus_turns: firstTurns.length >= 20,
    memorizer_completed: memorizer?.processed?.some((row) =>
      row.user_id === user.id && row.memorizer?.status === "completed"
    ) ?? false,
    action_memory_persisted_and_linked: persistenceEvaluation.ok,
    retrieval_dispatcher_all_ok: retrievalEvaluations.every((row) => row.dispatcher_ok),
    retrieval_semantic_all_ok: retrievalEvaluations.every((row) => row.semantic_ok),
    retrieval_no_cross_action_leaks: retrievalEvaluations.every((row) => row.privacy_ok),
  };

  const report = {
    ok: Object.values(checks).every(Boolean),
    run_id: runId,
    user: { id: user.id, email: user.email },
    scopes: { first: scopeA, second: scopeB },
    plan_ids: ids,
    first_conversation: {
      turn_count: firstTurns.length,
      turns: firstTurns,
      trace_summary: traceA?.summary ?? null,
    },
    memorizer,
    memory_state: memoryState,
    persistence_evaluation: persistenceEvaluation,
    second_conversation: {
      turn_count: secondTurns.length,
      turns: secondTurns,
      trace_summary: traceB?.summary ?? null,
      evaluations: retrievalEvaluations,
      traces: Object.fromEntries(
        secondTurns.map((turn) => [turn.id, secondTraceByRequest.get(turn.request_id)]),
      ),
    },
    checks,
  };

  mkdirSync(path.join(cwd, "tmp"), { recursive: true });
  const outPath = path.join(cwd, "tmp", `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report_path: outPath,
    ok: report.ok,
    run_id: runId,
    user: report.user,
    checks,
    memory_counts: {
      items: memoryState.items.length,
      active_items: memoryState.items.filter((item) => item.status === "active").length,
      action_links: memoryState.actionLinks.length,
      occurrences: memoryState.occurrences.length,
    },
    persistence_evaluation: persistenceEvaluation,
    memorizer_summary: memorizer?.processed?.find((row) => row.user_id === user.id)?.memorizer ?? null,
    retrieval_evaluations: retrievalEvaluations.map((row) => ({
      id: row.id,
      expected_memory: row.expected_memory,
      semantic_ok: row.semantic_ok,
      dispatcher_ok: row.dispatcher_ok,
      privacy_ok: row.privacy_ok,
      matched_terms: row.matched_terms,
      forbidden_hits: row.forbidden_hits,
      memory_mode: row.memory_mode,
      context_need: row.context_need,
      requested_scopes: row.active_loader?.requested_scopes ?? [],
      action_targets: row.active_loader?.action_targets ?? [],
      payload_item_count: row.active_loader?.payload_item_count ?? null,
      response_preview: row.response_preview,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  if (error?.body) console.error(JSON.stringify(error.body, null, 2));
  process.exitCode = 1;
});
