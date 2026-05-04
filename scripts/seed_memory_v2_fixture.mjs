#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = process.env.MEMORY_V2_FIXTURE_EMAIL ??
  "memory-v2-fixture@example.com";
const password = process.env.MEMORY_V2_FIXTURE_PASSWORD ??
  "Memory-v2-fixture-123456!";

function readLocalEnv() {
  const envPath = path.join(cwd, "supabase", ".env");
  const out = {};
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Fallback to `supabase status` below.
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

const localEnv = readLocalEnv();
const status = readStatus();
const apiUrl = status.API_URL ?? localEnv.SUPABASE_URL ??
  "http://127.0.0.1:54321";
const serviceRoleKey = status.SERVICE_ROLE_KEY ??
  localEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error(
    "Missing local Supabase SERVICE_ROLE_KEY from `supabase status` or `supabase/.env`.",
  );
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
    error.body = body;
    throw error;
  }
  return body;
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
  return await adminRequest(`/rest/v1/${pathname}`, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: {
      ...(opts.prefer ? { prefer: opts.prefer } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

async function insertRows(table, rows) {
  return await rest(`${table}?select=*`, {
    method: "POST",
    body: rows,
    prefer: "return=representation",
  });
}

async function upsertRows(table, rows, onConflict) {
  return await rest(`${table}?on_conflict=${onConflict}&select=*`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

async function ensureUser() {
  const created = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { fixture: "memory_v2_only" },
    },
  }).catch(async (error) => {
    if (!String(error?.body?.msg ?? error?.body?.message ?? "").includes("already")) {
      throw error;
    }
    const users = await adminRequest(
      `/auth/v1/admin/users?page=1&per_page=1000`,
    );
    return (users.users ?? []).find((user) => user.email === email);
  });
  const userId = created.id;
  await upsertRows("profiles", [{
    id: userId,
    full_name: "Memory V2 Fixture",
    onboarding_completed: true,
    timezone: "Europe/Paris",
  }], "id");
  return userId;
}

function iso(daysOffset, hour = 9) {
  const date = new Date(Date.UTC(2026, 4, 4 + daysOffset, hour, 0, 0));
  return date.toISOString();
}

function chatMessages(userId) {
  const base = [
    "Je me sens souvent bloque quand je dois lancer un gros projet.",
    "Au travail je procrastine surtout quand la tache n'est pas claire.",
    "Ma mere me critique souvent et ca me fait douter.",
    "Mon frere Samir m'aide a relativiser.",
    "Je veux garder trois marches par semaine.",
    "Hier j'ai marche 25 minutes apres le diner.",
    "Je dors mal quand je scrolle apres minuit.",
    "J'aimerais mieux comprendre mon rapport a la discipline.",
    "Tania est mon ex, pas ma soeur.",
    "Mon objectif principal est de construire une routine stable.",
  ];
  return Array.from({ length: 60 }, (_, index) => ({
    user_id: userId,
    role: index % 5 === 4 ? "assistant" : "user",
    content: base[index % base.length],
    created_at: iso(-20 + Math.floor(index / 3), 8 + (index % 10)),
    metadata: { fixture: "memory_v2_only", fixture_index: index },
  }));
}

const topicSeeds = [
  ["routine", "Routine et discipline", "routine discipline marche sommeil procrastination"],
  ["travail", "Rapport au travail", "travail projet flou clarte pression execution"],
  ["famille", "Relations familiales", "mere critique frere Samir soutien limites"],
  ["psychologie", "Psychologie et estime", "doute estime de soi emotion blocage confiance"],
];

const entitySeeds = [
  ["person", "Mere", ["maman", "ma mere"], "mere", "relation familiale critique"],
  ["person", "Samir", ["mon frere", "frere Samir"], "frere", "soutien familial"],
  ["person", "Tania", ["mon ex", "Tania"], "ex", "ancienne relation"],
  ["organization", "Travail", ["job", "boulot"], null, "contexte professionnel"],
  ["project", "Routine marche", ["marche du soir"], null, "habitude de marche"],
  ["project", "Projet Sophia", ["Sophia"], null, "projet long terme"],
];

const activeItems = [
  ["statement", "Le user dit se sentir bloque devant les gros projets flous.", ["psychologie.peur_echec", "travail.performance"], "psychologie"],
  ["fact", "Le user identifie la clarte de la tache comme levier d'execution au travail.", ["travail.performance", "habitudes.execution"], "travail"],
  ["statement", "Le user dit que les critiques de sa mere activent du doute.", ["relations.famille", "psychologie.estime_de_soi"], "famille"],
  ["fact", "Samir est le frere du user et l'aide a relativiser.", ["relations.famille"], "famille"],
  ["action_observation", "Le user veut maintenir trois marches par semaine.", ["sante.activite_physique", "objectifs.court_terme"], "routine"],
  ["event", "Le user a marche 25 minutes apres le diner.", ["sante.activite_physique"], "routine", iso(-1, 19)],
  ["statement", "Le user associe le scrolling tardif a un sommeil degrade.", ["sante.sommeil", "addictions.ecrans"], "routine"],
  ["statement", "Le user veut comprendre son rapport a la discipline.", ["psychologie.discipline", "habitudes.execution"], "psychologie"],
  ["fact", "Tania est l'ex du user, pas sa soeur.", ["relations.couple"], "famille"],
  ["statement", "Le user veut construire une routine stable comme objectif principal.", ["objectifs.long_terme", "habitudes.execution"], "routine"],
  ["statement", "Le user remarque qu'il evite les taches quand il craint de mal faire.", ["psychologie.estime_de_soi", "travail.performance"], "psychologie"],
  ["fact", "Le user prefere les reponses courtes et directes quand il est fatigue.", ["psychologie.identite"], "psychologie"],
  ["statement", "Le user cherche a poser des limites plus calmes avec sa mere.", ["relations.famille", "relations.limites"], "famille"],
  ["action_observation", "Le user a teste une decomposition en prochaine action de 10 minutes.", ["habitudes.execution", "travail.performance"], "travail"],
  ["statement", "Le user dit que la pression sociale peut le faire surperformer puis s'epuiser.", ["psychologie.emotions", "travail.charge"], "travail"],
  ["fact", "Le user utilise WhatsApp comme canal principal avec Sophia.", ["psychologie.identite"], "psychologie"],
  ["event", "Le user a eu une discussion tendue avec sa mere dimanche soir.", ["relations.famille"], "famille", iso(-3, 20)],
  ["statement", "Le user veut moins dramatiser ses rechutes de routine.", ["psychologie.estime_de_soi", "habitudes.execution"], "routine"],
  ["fact", "Le user travaille mieux avec un plan visible en trois etapes.", ["travail.performance", "habitudes.planification"], "travail"],
  ["statement", "Le user a peur que demander de l'aide soit vu comme une faiblesse.", ["psychologie.estime_de_soi", "relations.social"], "psychologie"],
  ["action_observation", "Quand le user prepare ses affaires la veille, la marche du matin devient plus probable.", ["sante.activite_physique", "habitudes.execution"], "routine"],
  ["statement", "Le user veut que Sophia challenge les excuses sans etre dure.", ["psychologie.motivation"], "psychologie"],
  ["fact", "Le user a un projet long terme autour de Sophia.", ["objectifs.long_terme", "travail.carriere"], "travail"],
  ["statement", "Le user se sent apaise apres avoir clarifie une prochaine action minuscule.", ["psychologie.emotions", "habitudes.execution"], "psychologie"],
  ["statement", "Le user prefere mesurer ses progres sur une semaine plutot que sur une journee isolee.", ["objectifs.court_terme", "habitudes.execution"], "routine"],
];

const inactiveItems = [
  ["invalidated", "Ancienne erreur: Tania serait la soeur du user.", ["relations.famille"]],
  ["invalidated", "Ancienne hypothese: le user deteste marcher.", ["sante.activite_physique"]],
  ["invalidated", "Ancienne interpretation: le user ne veut pas de structure.", ["psychologie.discipline"]],
  ["archived", "Ancien sujet archive sur une routine de lecture.", ["habitudes.apprentissage"]],
  ["archived", "Ancien sujet archive sur un outil de notes abandonne.", ["travail.outils"]],
];

async function main() {
  const userId = await ensureUser();
  await rest(`memory_item_entities?user_id=eq.${userId}`, { method: "DELETE" });
  await rest(`memory_item_topics?user_id=eq.${userId}`, { method: "DELETE" });
  await rest(`memory_items?user_id=eq.${userId}`, { method: "DELETE" });
  await rest(`user_entities?user_id=eq.${userId}`, { method: "DELETE" });
  await rest(`user_topic_memories?user_id=eq.${userId}`, { method: "DELETE" });
  await rest(`chat_messages?user_id=eq.${userId}`, { method: "DELETE" });

  await insertRows("chat_messages", chatMessages(userId));
  const topics = await insertRows("user_topic_memories", topicSeeds.map((
    [slug, title, search_doc],
  ) => ({
    user_id: userId,
    slug,
    title,
    status: "active",
    lifecycle_stage: "durable",
    search_doc,
    search_doc_version: 1,
    pending_changes_count: 0,
    metadata: { fixture: "memory_v2_only" },
  })));
  const topicBySlug = Object.fromEntries(topics.map((topic) => [topic.slug, topic]));

  const entities = await insertRows("user_entities", entitySeeds.map((
    [entity_type, display_name, aliases, relation_to_user, description],
  ) => ({
    user_id: userId,
    entity_type,
    display_name,
    aliases,
    relation_to_user,
    description,
    status: "active",
    metadata: { fixture: "memory_v2_only" },
  })));

  const itemRows = [
    ...activeItems.map(([kind, content_text, domain_keys, topic, eventStart], index) => ({
      user_id: userId,
      kind,
      status: "active",
      content_text,
      normalized_summary: content_text,
      domain_keys,
      sensitivity_level: index === 17 ? "sensitive" : "normal",
      importance_score: 0.65 + (index % 5) * 0.05,
      confidence: 0.82,
      observed_at: iso(-14 + index),
      event_start_at: kind === "event" ? eventStart : null,
      time_precision: kind === "event" ? "day" : null,
      canonical_key: `fixture:${index}`,
      metadata: { fixture: "memory_v2_only", topic },
    })),
    ...inactiveItems.map(([status, content_text, domain_keys], index) => ({
      user_id: userId,
      kind: "statement",
      status,
      content_text,
      normalized_summary: content_text,
      domain_keys,
      sensitivity_level: "normal",
      importance_score: 0.2,
      confidence: 0.55,
      observed_at: iso(-40 - index),
      event_start_at: null,
      time_precision: null,
      canonical_key: `fixture:inactive:${index}`,
      metadata: { fixture: "memory_v2_only", inactive_fixture: true },
    })),
  ];
  const items = await insertRows("memory_items", itemRows);

  await insertRows("memory_item_topics", items.slice(0, activeItems.length).map((
    item,
  ) => ({
    user_id: userId,
    memory_item_id: item.id,
    topic_id: topicBySlug[item.metadata.topic].id,
    relation_type: "about",
    status: "active",
    confidence: 0.85,
    metadata: { fixture: "memory_v2_only" },
  })));

  await insertRows("memory_item_entities", items.slice(0, 12).map((item, index) => ({
    user_id: userId,
    memory_item_id: item.id,
    entity_id: entities[index % entities.length].id,
    relation_type: "mentions",
    confidence: 0.8,
    metadata: { fixture: "memory_v2_only" },
  })));

  console.log(JSON.stringify({
    ok: true,
    user_id: userId,
    email,
    password,
    counts: {
      messages: 60,
      topics: topics.length,
      entities: entities.length,
      memory_items: items.length,
      active_memory_items: activeItems.length,
      invalidated: 3,
      archived: 2,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.body ?? error);
  process.exit(1);
});
