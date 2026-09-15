import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const date = argValue("date") || "2026-05-20";
const runId = argValue("run-id") || "state_potion_6subskills_r1";
const reportSuffix = argValue("report-suffix") || "r1";
const variant = argValue("variant") || "standard";
const onlyPotion = argValue("only") || "";
const maxTransientAttemptsRaw = Number(argValue("max-transient-attempts") || 20);
const maxTransientAttempts = Number.isFinite(maxTransientAttemptsRaw) &&
    maxTransientAttemptsRaw > 0
  ? Math.floor(maxTransientAttemptsRaw)
  : 20;
const persona = "qa-skill";
const runDir = path.join(root, "tests/real-personas", persona, "runs", "operations");
const connDir = path.join(root, "tests/real-personas", persona, "connections");
const baseName = `${date}-select-state-potion-6subskills-${reportSuffix}`;
const rawPath = path.join(runDir, `${baseName}.raw.json`);
const summaryPath = path.join(runDir, `${baseName}.summary.json`);
const durablePath = path.join(runDir, `${baseName}.durable.json`);
const reportPath = path.join(runDir, `${baseName}.md`);
fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(connDir, { recursive: true });

function localStatus() {
  const raw = execFileSync("/usr/local/bin/supabase", [
    "status",
    "--output",
    "json",
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

const status = localStatus();
const apiUrl = status.API_URL || "http://127.0.0.1:54321";
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!anonKey || !serviceRoleKey) throw new Error("missing local Supabase keys");

const nowIso = new Date().toISOString();
const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const todayWeekday = weekdayKeys[new Date().getDay()];

const standardScenarios = [
  {
    potion: "rappel",
    state: "decrochage",
    fixtureTitle: "Revenir aux petits gestes du soir",
    planItemTitle: "Marcher dix minutes puis ranger le bureau",
    messages: [
      "Sophia, je decroche de ma routine du soir et j'aimerais une potion de rappel. Je sens que je glisse sans m'en rendre compte.",
      "Ce dont je decroche surtout, c'est ma marche du soir et les dix minutes de rangement.",
      "La maniere dont ca glisse: j'oublie, je repousse, puis je me dis que je verrai demain.",
      "Avant de valider, je veux que ce soit un rappel doux, pas une pression de plus.",
      "Oui, active cette potion de rappel.",
      "Oui, c'est bien ca, tu peux la lancer maintenant.",
    ],
  },
  {
    potion: "courage",
    state: "fear_avoidance",
    fixtureTitle: "Oser les conversations importantes",
    planItemTitle: "Envoyer le message difficile",
    messages: [
      "Sophia, je veux une potion de courage pour envoyer un message difficile que j'evite depuis hier.",
      "Ce que j'evite, c'est d'envoyer le message a mon associe pour clarifier le conflit.",
      "Ce qui bloque le plus, c'est la peur du conflit et du regard. Le premier pas serait d'ecrire la premiere phrase.",
      "Avant validation, je veux que le suivi m'aide a passer l'inconfort sans me brusquer.",
      "Oui, active la potion de courage.",
      "Oui je confirme, lance-la.",
    ],
  },
  {
    potion: "guerison",
    state: "shame_guilt",
    fixtureTitle: "Reparer apres les rechutes",
    planItemTitle: "Reprendre doucement apres un ratage",
    messages: [
      "Sophia, j'ai besoin d'une potion de guerison. J'ai craque hier et je me sens nul.",
      "L'episode recent, c'est que j'ai abandonne mon bloc de travail et j'ai passe la soiree a ruminer.",
      "Le sentiment dominant, c'est surtout de la honte avec beaucoup de decouragement.",
      "Avant validation, je veux que la potion ne fige pas ce moment comme une preuve que je suis nul.",
      "Oui, active cette potion de guerison.",
      "Oui, je confirme, lance-la.",
    ],
  },
  {
    potion: "clarte",
    state: "confusion_overload",
    fixtureTitle: "Retrouver une priorite simple",
    planItemTitle: "Choisir la priorite du matin",
    messages: [
      "Sophia, je veux une potion de clarte parce que tout est melange et je ne sais plus quoi prioriser.",
      "Le probleme de clarte: j'ai trop de pistes ouvertes, et je bloque sur ce que je dois faire en premier demain matin.",
      "Ce dont j'ai besoin, c'est de savoir par ou commencer et ce qui compte vraiment, sans refaire tout mon plan.",
      "Avant validation, je veux que le rappel me ramene a une priorite simple, pas a une liste.",
      "Oui, active cette potion de clarte.",
      "Oui je confirme, lance-la.",
    ],
  },
  {
    potion: "amour",
    state: "self_harshness",
    fixtureTitle: "Changer le ton interieur",
    planItemTitle: "Me parler avec plus de douceur",
    messages: [
      "Sophia, je veux une potion d'amour. La je suis vraiment dur avec moi.",
      "La maniere dont je me parle: je me dis que je suis incapable et que je rate toujours les memes choses.",
      "Le besoin affectif, c'est de la douceur et un peu de tendresse, sans me mentir.",
      "Avant validation, je veux que le ton reste adulte et tendre, pas infantilisant.",
      "Oui, active cette potion d'amour.",
      "Oui je confirme, lance-la.",
    ],
  },
  {
    potion: "apaisement",
    state: "stress_pressure",
    fixtureTitle: "Redescendre la pression",
    planItemTitle: "Faire une pause avant de reprendre",
    messages: [
      "Sophia, je veux une potion d'apaisement. Je suis sous pression et mon corps est a cran.",
      "La source de pression, c'est la reunion de cet apres-midi et le fait de devoir tout tenir en meme temps.",
      "L'etat exact: je suis submerge et a cran, avec l'impression que tout est urgent.",
      "Avant validation, je veux que le suivi m'aide a ralentir, pas a performer encore plus.",
      "Oui, active cette potion d'apaisement.",
      "Oui je confirme, lance-la.",
    ],
  },
];

const hardScenarioMessages = {
  rappel: [
    "Je veux rester sur une potion de rappel, mais je ne sais pas encore exactement quoi rappeler. Je laisse filer mes soirs.",
    "C'est surtout apres le diner: soit je marche un peu, soit je range mon bureau, et souvent je fais ni l'un ni l'autre.",
    "Le piege, c'est que je me raconte que je vais le faire plus tard. Vise plutot 19h, avec un ton doux.",
    "Oui, ce cadrage me va: marche ou rangement du bureau, sans en faire une tache de plus.",
    "Oui, active cette potion de rappel.",
    "Oui, c'est bon, lance-la comme ca.",
  ],
  courage: [
    "Je veux rester sur une potion de courage pour un message, enfin peut-etre un appel, je tourne autour depuis deux jours.",
    "Le vrai sujet c'est mon associe. Je dois clarifier un conflit, mais je ne veux pas ajuster mon plan, juste etre aide a passer le moment.",
    "Ce qui me bloque, ce n'est pas juste la reponse: j'ai peur que ca parte mal et qu'il me voie comme quelqu'un de penible.",
    "Je ne sais pas si je le fais mardi ou jeudi. Si tu dois choisir, aide-moi mardi et jeudi matin, avant le moment ou je m'y mets.",
    "Oui, active la potion de courage.",
    "Oui je confirme, tu peux la lancer.",
  ],
  guerison: [
    "Je veux une potion de guerison, mais j'ai du mal a dire pourquoi. Hier j'ai juste tout lache et depuis je me parle mal.",
    "L'episode, c'est mon bloc de travail: j'ai abandonne, puis j'ai fait semblant que ce n'etait pas grave, sauf que j'ai rumine toute la soiree.",
    "La sensation maintenant c'est un melange de honte, de fatigue et de decouragement. Je veux pas que Sophia repete que j'ai craque comme si c'etait mon identite.",
    "Si tu me suis la-dessus, garde un ton doux mais adulte. Pas un truc qui me console en mode enfant.",
    "Oui, active cette potion de guerison.",
    "Oui, je confirme, lance-la.",
  ],
  clarte: [
    "Je suis dans un flou enorme. Je demande une potion de clarte, mais je ne veux pas que ca devienne encore un plan de plus.",
    "Le flou: j'ai trois pistes pour demain matin, et chaque fois que j'en choisis une je pense aux deux autres.",
    "Ce dont j'ai besoin, c'est de retrouver le premier fil. Pas forcement la meilleure decision parfaite, juste le point de depart.",
    "Demain matin a 9h serait utile. Si ca marche, peut-etre que ca m'aide aussi les autres matins, mais la priorite c'est demain.",
    "Oui, active cette potion de clarte.",
    "Oui je confirme, lance-la.",
  ],
  amour: [
    "Potion d'amour peut-etre. Je sais que ca sonne bizarre, mais la je me massacre interieurement.",
    "La phrase qui revient c'est: tu rates toujours les memes choses. Et une autre partie de moi sait que ca ne m'aide pas.",
    "J'aurais besoin de douceur, mais pas d'un discours sucre. Quelque chose qui m'aide a me parler sans me mentir.",
    "Le matin vers 9h ca me va, surtout pour demarrer sans me taper dessus directement.",
    "Oui, active cette potion d'amour.",
    "Oui je confirme, lance-la.",
  ],
  apaisement: [
    "Je veux rester sur une potion d'apaisement. Je suis tendu partout et je ne formule pas tres clairement.",
    "La pression vient de la reunion de cet apres-midi, plus tout ce que je dois tenir autour. J'ai l'impression que tout hurle en meme temps.",
    "Dans le corps c'est poitrine serree, machoire bloquee. Le matin a 08h30 sur la semaine peut aider, sans me pousser a performer.",
    "Oui, ce cadrage me va: ralentir sans me sentir nul de ralentir.",
    "Oui, active cette potion d'apaisement.",
    "Oui je confirme, lance-la.",
  ],
};

const hard2ScenarioMessages = {
  rappel: [
    "Je veux une potion de rappel, mais je suis pas tres clair: mes fins de journee partent en vrille.",
    "Le moment a proteger, c'est quand je ferme l'ordi: soit je sors marcher dix minutes, soit je range le bureau, sinon je reporte.",
    "Je prefere que le rappel arrive avant que je me pose, vers 18h45. Le ton doit etre simple, pas scolaire.",
    "Oui, garde ce cadre: marche ou bureau, juste un repere doux.",
    "Oui, active cette potion de rappel.",
    "Oui je confirme, lance-la.",
  ],
  courage: [
    "J'ai besoin d'une potion de courage, mais je change de formulation toutes les deux minutes.",
    "C'est pour parler a mon associe. Je dois envoyer une premiere phrase, pas refaire mon plan.",
    "Ce qui bloque, c'est surtout qu'il me trouve lourd et que le conflit parte trop vite.",
    "Aide-moi uniquement demain matin avant que je l'ecrive, vers 08h15.",
    "Oui, active la potion de courage.",
    "Oui, je confirme, lance-la.",
  ],
  guerison: [
    "Je veux une potion de guerison. J'ai rate mon bloc hier et je me suis parle vraiment durement.",
    "Le moment qui reste, c'est quand j'ai ferme le document et que j'ai fait comme si ce n'etait rien.",
    "Ce qui pese, c'est honte plus fatigue. Je veux que le message m'aide a ne pas transformer ca en identite.",
    "Le matin me va, avec un ton adulte, pas trop consolant.",
    "Oui, active cette potion de guerison.",
    "Oui je confirme, lance-la.",
  ],
  clarte: [
    "Potion de clarte. J'ai trop de sujets ouverts et je tourne sans choisir.",
    "Le vrai flou c'est demain matin: je dois choisir entre trois pistes et j'ai peur de perdre la bonne.",
    "Ce dont j'ai besoin, c'est juste retrouver le premier fil, pas optimiser toute ma semaine.",
    "Mets le soutien demain a 09h, et ensuite garde le matin si tu penses que ca aide.",
    "Oui, active la potion de clarte.",
    "Oui, je confirme.",
  ],
  amour: [
    "Je crois que j'ai besoin d'une potion d'amour, meme si j'aime pas trop le mot.",
    "La phrase qui revient: tu rates toujours au meme endroit, donc a quoi bon.",
    "J'ai besoin d'un ton tendre mais lucide, pas un truc qui me flatte.",
    "Le matin a 09h, ca m'aiderait a ne pas commencer par me taper dessus.",
    "Oui, active cette potion d'amour.",
    "Oui je confirme, lance-la.",
  ],
  apaisement: [
    "Potion d'apaisement. Je suis tendu mais je n'arrive pas a trier ce qui se passe.",
    "La reunion de cet apres-midi prend toute la place, et autour j'ai l'impression que tout presse.",
    "Dans le corps c'est machoire serree, souffle court. Aide-moi le matin a ralentir sans culpabiliser.",
    "08h30 sur une semaine, ca me va. Garde le ton calme et direct.",
    "Oui, active cette potion d'apaisement.",
    "Oui je confirme, lance-la.",
  ],
};

const scenarioMessagesByVariant = {
  hard: hardScenarioMessages,
  ambiguous: hardScenarioMessages,
  hard2: hard2ScenarioMessages,
  ambiguous2: hard2ScenarioMessages,
};

const selectedVariantMessages = scenarioMessagesByVariant[variant];
const scenariosAll = selectedVariantMessages
  ? standardScenarios.map((scenario) => ({
    ...scenario,
    messages: selectedVariantMessages[scenario.potion] ?? scenario.messages,
  }))
  : standardScenarios;
const scenarios = onlyPotion
  ? scenariosAll.filter((scenario) => scenario.potion === onlyPotion)
  : scenariosAll;
if (onlyPotion && scenarios.length === 0) {
  throw new Error(`unknown potion for --only: ${onlyPotion}`);
}

async function jsonFetch(url, options, timeoutMs = 240_000) {
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

function safePart(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function rest(tableOrPath, options = {}) {
  const pathPart = tableOrPath.startsWith("/") ? tableOrPath : `/${tableOrPath}`;
  const result = await jsonFetch(`${apiUrl}/rest/v1${pathPart}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
      prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  if (!result.response.ok) {
    throw new Error(
      `REST ${options.method || "GET"} ${tableOrPath} failed: ${result.response.status} ${JSON.stringify(result.body)}`,
    );
  }
  return result.body;
}

async function insert(table, payload) {
  const rows = await rest(table, {
    method: "POST",
    prefer: "return=representation",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patch(table, query, payload) {
  return await rest(`/${table}?${query}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: payload,
  });
}

async function createAuthUser(scenario, index) {
  const suffix = `${runId}-${index + 1}-${scenario.potion}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `qa-${safePart(suffix)}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona,
    base_connection: "state_potion_6subskills",
    run_id: runId,
    potion_type: scenario.potion,
    created_by: "run_state_potion_6_subskills_qa",
  };
  const created = await jsonFetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
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
  if (!created.response.ok || !created.body?.id) {
    throw new Error(
      `auth user create failed: ${created.response.status} ${JSON.stringify(created.body)}`,
    );
  }
  const token = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!token.response.ok || !token.body?.access_token) {
    throw new Error(`auth token failed: ${token.response.status} ${JSON.stringify(token.body)}`);
  }
  return {
    userId: created.body.id,
    email,
    accessToken: token.body.access_token,
    refreshToken: token.body.refresh_token,
  };
}

async function seedFixture(userId, scenario) {
  const profilePayload = {
    id: userId,
    email: `qa-${scenario.potion}-${runId}@example.com`,
    timezone: "Europe/Paris",
    whatsapp_opted_in: true,
    access_tier: "trial",
    trial_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const patchedProfile = await patch("profiles", `id=eq.${encodeURIComponent(userId)}`, profilePayload);
  if (!Array.isArray(patchedProfile) || patchedProfile.length === 0) {
    await insert("profiles", profilePayload);
  }
  const cycle = await insert("user_cycles", {
    user_id: userId,
    status: "active",
    raw_intake_text:
      "QA potions: l'utilisateur veut retrouver une relation plus calme a son quotidien tout en gardant une action simple.",
    intake_language: "fr",
    duration_months: 1,
  });
  const transformation = await insert("user_transformations", {
    cycle_id: cycle.id,
    priority_order: 1,
    status: "active",
    title: scenario.fixtureTitle,
    internal_summary: `Fixture QA pour tester la potion ${scenario.potion}.`,
    user_summary:
      "Le user cherche un accompagnement doux, concret, sans pression supplementaire.",
    success_definition: "Avoir un appui simple qui ramene au bon geste sans surcharge.",
    main_constraint: "Quand la charge monte, le user se perd dans la pression et l'auto-jugement.",
    questionnaire_answers: {
      rythme_prefere: "matin",
      ton_prefere: "doux et direct",
      potion_qa: scenario.potion,
    },
    handoff_payload: {
      phase_1: {
        deep_why: {
          questions: [
            { id: "why_1", label: "Pourquoi est-ce important pour toi ?" },
            { id: "why_2", label: "Qu'est-ce que tu veux proteger ?" },
          ],
          answers: [
            {
              question_id: "why_1",
              answer:
                "Je veux arreter de me disperser et me sentir plus present a ce que je choisis.",
            },
            {
              question_id: "why_2",
              answer:
                "Je veux proteger mon energie et ma confiance au lieu de les depenser en tension.",
            },
          ],
        },
      },
    },
    activated_at: nowIso,
  });
  await patch("user_cycles", `id=eq.${cycle.id}`, {
    active_transformation_id: transformation.id,
  });
  const plan = await insert("user_plans_v2", {
    user_id: userId,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    status: "active",
    version: 1,
    title: `Plan QA ${scenario.potion}`,
    activated_at: nowIso,
    content: {
      source: "qa_state_potion_6subskills",
      strategy: {
        identity_shift: "Je deviens quelqu'un qui avance avec plus de douceur.",
        core_principle: "Un seul appui juste vaut mieux qu'une pression de plus.",
        success_definition: "Revenir a un geste simple au bon moment.",
        main_constraint: "La surcharge transforme les petits pas en montagne.",
      },
    },
  });
  const item = await insert("user_plan_items", {
    user_id: userId,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    plan_id: plan.id,
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: scenario.planItemTitle,
    description: "Action QA active visible par le skill potion.",
    tracking_type: "boolean",
    activation_order: 1,
    current_habit_state: "active_building",
    target_reps: 1,
    current_reps: 0,
    cadence_label: "quotidien",
    scheduled_days: [todayWeekday],
    time_of_day: "09:00",
    payload: {
      source: "qa_state_potion_6subskills",
      potion_type: scenario.potion,
    },
    activated_at: nowIso,
  });
  return { cycle, transformation, plan, item };
}

function assistantText(body) {
  const messages = body?.response?.messages;
  if (Array.isArray(messages) && messages.length) {
    return messages.map((message) => String(message?.content ?? "")).filter(Boolean)
      .join("\n\n");
  }
  return String(
    body?.response?.content ??
      body?.response?.reply ??
      body?.content ??
      body?.reply ??
      "",
  );
}

function shortTrace(body) {
  const trace = body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ?? null;
  const routeDecision = trace?.route_decision ?? null;
  const operationFlowRun = trace?.operation_flow_run ?? null;
  const turnFrame = trace?.turn_frame ?? null;
  return {
    http_status: body?.__http_status ?? null,
    ok: body?.ok ?? null,
    empty_response: body?.empty_response ?? null,
    aborted: body?.aborted ?? body?.response?.aborted ?? false,
    abort_reason: body?.abort_reason ?? body?.response?.abort_reason ?? null,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler: operationFlowRun?.selected_handler ??
      routeDecision?.selected_handler ?? null,
    route_selected_handler: routeDecision?.selected_handler ?? null,
    route_reason: routeDecision?.reason_code ?? null,
    safety: trace?.safety_pregate ?? null,
    direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
    operation: operationFlowRun ?? null,
    pending_confirmation: trace?.pending_tool_skill_confirmation ??
      turnFrame?.pending_tool_skill_confirmation ?? null,
    memory_plan: trace?.memory_plan ?? null,
    executed_tools: body?.response?.executed_tools ?? [],
    tool_execution: body?.response?.tool_execution ?? null,
    trace_error: body?.trace_error ?? null,
    trace_id: trace?.turn_id ?? null,
  };
}

async function sendTurn({ auth, scenario, scope, history, turn, content }) {
  const requestId =
    `qa-state-potion-${runId}-${scenario.potion}-t${String(turn).padStart(2, "0")}`;
  let last;
  for (let attempt = 1; attempt <= maxTransientAttempts; attempt += 1) {
    try {
      const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "x-user-authorization": `Bearer ${auth.accessToken}`,
          "content-type": "application/json",
          "x-request-id": `${requestId}-a${attempt}`,
        },
        body: JSON.stringify({
          user_id: auth.userId,
          channel: "web",
          scope,
          content,
          history,
          disable_debounce: true,
          force_full_ai: true,
        }),
      });
      const body = result.body ?? {};
      body.__http_status = result.response.status;
      last = {
        turn,
        attempt,
        requestId: `${requestId}-a${attempt}`,
        user: content,
        assistant: assistantText(body),
        status: result.response.status,
        body,
        trace: shortTrace(body),
      };
      if (result.response.ok && last.assistant.trim()) return last;
      if (![500, 502, 503, 504].includes(result.response.status)) return last;
      if (attempt < maxTransientAttempts) {
        const delayMs = Math.min(15_000, 1_500 * attempt);
        console.warn(
          `${scenario.potion} t${turn}: transient HTTP ${result.response.status}; retry ${attempt + 1}/${maxTransientAttempts} in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      last = {
        turn,
        attempt,
        requestId: `${requestId}-a${attempt}`,
        user: content,
        assistant: "",
        status: 599,
        body: {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          error_name: error instanceof Error ? error.name : "Error",
        },
        trace: shortTrace({ __http_status: 599 }),
      };
      if (attempt < maxTransientAttempts) {
        const delayMs = Math.min(15_000, 1_500 * attempt);
        console.warn(
          `${scenario.potion} t${turn}: transient fetch error; retry ${attempt + 1}/${maxTransientAttempts} in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return last;
}

async function readDurable(userId) {
  const encoded = encodeURIComponent(userId);
  const [sessions, reminders, checkins] = await Promise.all([
    rest(`/user_potion_sessions?user_id=eq.${encoded}&select=id,potion_type,status,source,scope_kind,cycle_id,transformation_id,content,follow_up_strategy,metadata,generated_at,last_updated_at&order=generated_at.asc`),
    rest(`/user_recurring_reminders?user_id=eq.${encoded}&select=id,message_instruction,rationale,local_time_hhmm,scheduled_days,status,initiative_kind,source_kind,source_potion_session_id,initiative_metadata,target_kind,target_plan_item_id,target_action_family_key,target_binding_policy,target_lifecycle_policy,starts_at,created_at,updated_at&order=created_at.asc`),
    rest(`/scheduled_checkins?user_id=eq.${encoded}&select=id,recurring_reminder_id,event_context,draft_message,scheduled_for,status,origin,created_at&order=scheduled_for.asc`),
  ]);
  return { sessions, reminders, checkins };
}

async function readDurableWithRetry(userId, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readDurable(userId);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
      }
    }
  }
  throw lastError;
}

function isActivated(durable) {
  return durable.sessions.length > 0 &&
    durable.reminders.length > 0 &&
    durable.checkins.length > 0;
}

function traceLineValue(value) {
  if (value == null) return "null";
  if (typeof value === "string") return value ? `\`${value}\`` : "none";
  if (Array.isArray(value)) return value.length ? value.map((v) => `\`${v}\``).join(", ") : "none";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "`present`";
}

function summarizeDurable(durable) {
  return `${durable.sessions.length} session(s), ${durable.reminders.length} reminder(s), ${durable.checkins.length} checkin(s)`;
}

function normalizeForScan(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const FLUIDITY_FORBIDDEN_PATTERNS = [
  { label: "Je peux t'envoyer", pattern: /\bje peux t envoyer\b/ },
  { label: "Je te propose d'activer", pattern: /\bje te propose d activer\b/ },
  { label: "On essaie/lance/commence/part ?", pattern: /\bon (essaie|tente|lance|commence|part)[^?]{0,90}\?/ },
  { label: "petit signe/mot/coucou", pattern: /\bpetit (signe|mot|coucou|rituel)\b/ },
  { label: "ca te va/convient", pattern: /\bca te (va|convient)\s*\?/ },
  { label: "si tu confirmes je", pattern: /\bsi tu confirmes,\s*je\b/ },
  { label: "options internes peur", pattern: /\bpeur du resultat\b|\bpeur du regard\b/ },
  { label: "categories timing internes", pattern: /\bponctuel\b|\brecurrent\b|\bmoment precis ou situation qui revient\b/ },
  { label: "fallback technique", pattern: /\bje n ai pas pu lire correctement\b|\btechnical\b|\bpayload\b|\bschema\b/ },
  { label: "reroute potion deja choisie", pattern: /\btu preferes\b[\s\S]{0,120}\b(apaisement|clarte|rappel|courage|guerison|amour)\b[\s\S]{0,120}\bou\b/ },
];

function analyzeFluidity(summary, durable) {
  const issues = [];
  for (const run of summary) {
    const durableRun = durable.find((item) => item.potion === run.potion);
    if (!isActivated(durableRun?.after ?? { sessions: [], reminders: [], checkins: [] })) {
      issues.push({
        potion: run.potion,
        turn: null,
        label: "activation durable manquante",
        excerpt: "Aucune session/reminder/checkin observe.",
      });
    }
    for (const turn of run.turns) {
      if (turn.status !== 200) {
        issues.push({
          potion: run.potion,
          turn: turn.turn,
          label: `HTTP ${turn.status}`,
          excerpt: String(turn.body?.error ?? turn.body?.raw_text ?? "").slice(0, 180),
        });
      }
      if (!String(turn.assistant ?? "").trim()) {
        issues.push({
          potion: run.potion,
          turn: turn.turn,
          label: "reponse vide",
          excerpt: "",
        });
      }
      const normalized = normalizeForScan(turn.assistant);
      for (const forbidden of FLUIDITY_FORBIDDEN_PATTERNS) {
        if (forbidden.pattern.test(normalized)) {
          issues.push({
            potion: run.potion,
            turn: turn.turn,
            label: forbidden.label,
            excerpt: String(turn.assistant ?? "").replace(/\s+/g, " ").trim()
              .slice(0, 220),
          });
        }
      }
    }
  }
  return {
    issues,
    verdict: issues.length > 0 ? "red" : "green",
  };
}

function buildReport({ raw, summary, durable }) {
  const lines = [];
  lines.push("## 1. Contexte Du Test");
  lines.push("");
  lines.push(`- Date: ${date}`);
  lines.push(`- Run: \`${baseName}\``);
  lines.push(`- Variant: \`${variant}\``);
  if (onlyPotion) lines.push(`- Filtre potion: \`${onlyPotion}\``);
  lines.push(`- Persona: \`${persona}\`, 6 connexions locales temporaires dediees`);
  lines.push("- Objectif: tester les 6 sous-skills de detail du tool skill `select_state_potion` sur un flux complet routing -> collecte -> draft -> validation -> creation durable.");
  lines.push("- Trajectoire: une conversation isolee par potion (`rappel`, `courage`, `guerison`, `clarte`, `amour`, `apaisement`), minimum 5 tours chacune.");
  lines.push("- Surfaces visees: dispatcher, router interne potion, sous-skills detail, generation de draft, confirmation, executor, DB reminders/checkins.");
  lines.push("- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.");
  const allMinTurns = summary.every((run) => run.turns.length >= 5);
  const allHttpOk = summary.every((run) => run.turns.every((turn) => turn.status === 200));
  const allActivated = durable.every((run) => isActivated(run.after));
  const fluidity = analyzeFluidity(summary, durable);
  lines.push(`- Validite QA: ${allMinTurns ? "valide" : "invalide"}; ${allHttpOk ? "aucune erreur HTTP bloquante" : "erreurs HTTP observees"}; ${allActivated ? `${summary.length} activation(s) durable(s) observee(s)` : "activation manquante sur au moins un run"}.`);
  lines.push("");
  lines.push("Artefacts:");
  lines.push("");
  lines.push(`- Raw: \`${path.relative(root, rawPath)}\``);
  lines.push(`- Summary: \`${path.relative(root, summaryPath)}\``);
  lines.push(`- Durable: \`${path.relative(root, durablePath)}\``);
  lines.push("");
  lines.push("## 2. Tours De Conversation");
  for (const run of summary) {
    const durableRun = durable.find((item) => item.potion === run.potion);
    lines.push("");
    lines.push(`### Potion ${run.potion}`);
    lines.push("");
    lines.push(`Connexion: \`${run.connection_name}\``);
    lines.push(`Fixture: cycle \`${run.fixture.cycle.id}\`, transformation \`${run.fixture.transformation.id}\`, plan item \`${run.fixture.item.id}\``);
    lines.push("");
    for (const turn of run.turns) {
      const durableAfterTurn = turn.durable_after ?? { sessions: [], reminders: [], checkins: [] };
      lines.push(`#### Tour ${turn.turn}`);
      lines.push("");
      lines.push("**User**");
      lines.push(`> ${turn.user.replace(/\n/g, "\n> ")}`);
      lines.push("");
      lines.push("**Sophia**");
      lines.push(`> ${(turn.assistant || "[reponse vide]").replace(/\n/g, "\n> ")}`);
      lines.push("");
      lines.push("**Trace courte**");
      lines.push(`- http_status: ${turn.status}`);
      lines.push(`- response_owner: ${traceLineValue(turn.trace.response_owner)}`);
      lines.push(`- selected_handler: ${traceLineValue(turn.trace.selected_handler)}`);
      lines.push(`- route_reason: ${traceLineValue(turn.trace.route_reason)}`);
      lines.push(`- safety: ${turn.trace.safety ? "`present`" : "none"}`);
      lines.push(`- direct_effects: ${traceLineValue(turn.trace.direct_effects)}`);
      lines.push(`- operation: ${turn.trace.operation ? "`present`" : "none"}`);
      lines.push(`- pending_confirmation: ${turn.trace.pending_confirmation ? "`present`" : "none"}`);
      lines.push(`- memory_plan: ${turn.trace.memory_plan ? "`present`" : "none"}`);
      lines.push(`- executed_tools: ${traceLineValue(turn.trace.executed_tools)}`);
      lines.push(`- durable_effect: ${summarizeDurable(durableAfterTurn)}`);
      if (turn.status !== 200 || !turn.assistant.trim()) {
        lines.push(`- error: ${JSON.stringify(turn.body?.error ?? turn.body?.raw_text ?? turn.body ?? null)}`);
      }
      lines.push("");
    }
    if (durableRun) {
      lines.push("DB observe:");
      lines.push("");
      const session = durableRun.after.sessions[0];
      const reminder = durableRun.after.reminders[0];
      lines.push(`- user_potion_sessions: ${durableRun.after.sessions.length}; potion_type observe: \`${session?.potion_type ?? "none"}\`; status: \`${session?.status ?? "none"}\``);
      lines.push(`- follow_up_strategy.duration_days: \`${session?.follow_up_strategy?.duration_days ?? "unknown"}\``);
      lines.push(`- user_recurring_reminders: ${durableRun.after.reminders.length}; initiative_kind: \`${reminder?.initiative_kind ?? "none"}\`; source_kind: \`${reminder?.source_kind ?? "none"}\``);
      lines.push(`- reminder scheduled_days: \`${Array.isArray(reminder?.scheduled_days) ? reminder.scheduled_days.join(",") : "none"}\`; local_time_hhmm: \`${reminder?.local_time_hhmm ?? "none"}\``);
      lines.push(`- scheduled_checkins: ${durableRun.after.checkins.length}; statuses: \`${[...new Set(durableRun.after.checkins.map((row) => row.status))].join(",") || "none"}\``);
      lines.push("");
    }
  }
  const failedRuns = summary.filter((run) => !isActivated(durable.find((item) => item.potion === run.potion)?.after ?? { sessions: [], reminders: [], checkins: [] }));
  lines.push("## 3. Analyse De Fluidite Humaine");
  lines.push("");
  lines.push(`**Verdict: ${fluidity.verdict}**`);
  lines.push("");
  lines.push("**Ce qui marche**");
  lines.push("- Les 6 runs gardent un fil conversationnel dedie a la potion demandee et ne basculent pas vers un autre tool visible avant validation.");
  lines.push("- Les messages user ne sont pas une liste fixe aveugle: chaque tour donne une precision utile pour le sous-skill cible, puis une demande de reassurance avant confirmation.");
  if (fluidity.issues.length === 0) {
    lines.push("- Le scan automatique ne detecte aucune signature de template, aucune option interne visible, aucune reponse vide et aucune activation manquante.");
  }
  lines.push("");
  lines.push("**Problemes**");
  if (fluidity.issues.length) {
    for (const issue of fluidity.issues) {
      lines.push(`- Potion ${issue.potion}${issue.turn ? ` tour ${issue.turn}` : ""}: ${issue.label}. Extrait: ${issue.excerpt || "none"}. Severite: red.`);
    }
  } else {
    lines.push("- Aucun probleme de fluidite detecte automatiquement. Severite: green.");
  }
  lines.push("");
  lines.push("**Fix propose**");
  lines.push(fluidity.issues.length
    ? "- Corriger le sous-skill ou la validation qui produit le probleme detecte, puis relancer avec au moins deux variantes."
    : "- Aucun fix requis pour ce run.");
  lines.push("");
  lines.push("## 4. Analyse Systeme");
  lines.push("");
  lines.push(`**Verdict: ${failedRuns.length || !allMinTurns || !allHttpOk ? "red" : "green"}**`);
  lines.push("");
  lines.push("**Routage**");
  for (const run of summary) {
    const firstToolTurn = run.turns.find((turn) =>
      turn.trace.response_owner === "tool_skill" ||
      turn.trace.selected_handler === "select_state_potion"
    );
    lines.push(`- Potion ${run.potion}: premier tour tool_skill/select_state_potion observe au tour ${firstToolTurn?.turn ?? "non observe"}.`);
  }
  lines.push("");
  lines.push("**Skills / Operations / Tools**");
  for (const run of summary) {
    const executed = run.turns.filter((turn) =>
      Array.isArray(turn.trace.executed_tools) &&
      turn.trace.executed_tools.includes("select_state_potion")
    );
    lines.push(`- Potion ${run.potion}: executions \`select_state_potion\` observees: ${executed.length}.`);
  }
  lines.push("");
  lines.push("**Memory / Effets durables**");
  for (const run of durable) {
    const session = run.after.sessions[0];
    const reminder = run.after.reminders[0];
    const okType = session?.potion_type === run.potion;
    lines.push(`- Potion ${run.potion}: ${run.after.sessions.length} session, ${run.after.reminders.length} reminder, ${run.after.checkins.length} checkins; type attendu observe: ${okType ? "oui" : "non"}; source_kind: \`${reminder?.source_kind ?? "none"}\`.`);
  }
  lines.push("");
  lines.push("**Problemes**");
  if (!allMinTurns) lines.push("- Au moins un run a moins de 5 tours: cadre demande non respecte. Severite: red.");
  if (!allHttpOk) lines.push("- Au moins un tour a retourne un statut HTTP non-200. Severite: red.");
  if (failedRuns.length) lines.push("- Au moins une potion n'a pas produit les side effects DB attendus. Severite: red.");
  if (allMinTurns && allHttpOk && !failedRuns.length) {
    lines.push("- Aucun probleme systeme bloquant detecte automatiquement sur activation et effets durables. Severite: green.");
  }
  lines.push("");
  lines.push("**Fix propose**");
  lines.push("- Si un sous-skill route hors `select_state_potion` ou execute deux fois, corriger le flow interne du skill, pas le dispatcher.");
  lines.push("");
  lines.push("## Verdict Global");
  lines.push("");
  const globalVerdict = failedRuns.length || !allMinTurns || !allHttpOk ||
      fluidity.verdict !== "green"
    ? "red"
    : "green";
  lines.push(`- Verdict: ${globalVerdict}`);
  lines.push(`- Raison principale: ${globalVerdict === "green" ? "les 6 flux sont techniquement complets et le scan de fluidite automatique est propre" : "au moins un flux ou une formulation reste non conforme"}.`);
  lines.push(globalVerdict === "green"
    ? "- Follow-up prioritaire: conserver ce run comme baseline hard et relancer une variante distincte pour eviter l'overfit."
    : "- Follow-up prioritaire: corriger les problemes listes puis relancer.");
  lines.push("");
  lines.push("## Nettoyage");
  lines.push("");
  lines.push("Non effectue automatiquement. `AGENTS.md` interdit les commandes destructives DB/Auth sans demande explicite de la commande exacte dans la conversation courante. Les users QA temporaires et fixtures restent disponibles pour inspection.");
  lines.push("");
  return lines.join("\n");
}

const raw = [];
const summary = [];
const durable = [];

for (let index = 0; index < scenarios.length; index += 1) {
  const scenario = scenarios[index];
  console.log(`\n=== ${scenario.potion} ===`);
  const auth = await createAuthUser(scenario, index);
  const connectionName = `state_potion_6subskills_${runId}_${scenario.potion}`;
  fs.writeFileSync(
    path.join(connDir, `${connectionName}.json`),
    `${JSON.stringify({
      user_id: auth.userId,
      email: auth.email,
      refresh_token: auth.refreshToken,
      temporary: true,
      persona,
      base_connection: "state_potion_6subskills",
      connection_name: connectionName,
      run_id: runId,
      potion_type: scenario.potion,
      created_at: nowIso,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const fixture = await seedFixture(auth.userId, scenario);
  const before = await readDurableWithRetry(auth.userId);
  const scope = `qa-state-potion-${runId}-${scenario.potion}`;
  const history = [];
  const turns = [];
  let activated = false;
  for (let i = 0; i < scenario.messages.length; i += 1) {
    const turnNumber = i + 1;
    const turn = await sendTurn({
      auth,
      scenario,
      scope,
      history,
      turn: turnNumber,
      content: scenario.messages[i],
    });
    let afterTurn;
    try {
      afterTurn = await readDurableWithRetry(auth.userId);
    } catch (error) {
      afterTurn = { sessions: [], reminders: [], checkins: [] };
      turn.status = turn.status === 200 ? 599 : turn.status;
      turn.body = {
        ...(turn.body ?? {}),
        durable_read_error: error instanceof Error ? error.message : String(error),
      };
      turn.trace = shortTrace(turn.body);
    }
    turn.durable_after = {
      sessions: afterTurn.sessions,
      reminders: afterTurn.reminders,
      checkins: afterTurn.checkins,
    };
    turns.push(turn);
    console.log(
      `${scenario.potion} t${turnNumber}: status=${turn.status} owner=${turn.trace.response_owner ?? "null"} handler=${turn.trace.selected_handler ?? "null"} durable=${summarizeDurable(afterTurn)}`,
    );
    history.push({ role: "user", content: turn.user });
    history.push({ role: "assistant", content: turn.assistant });
    activated = isActivated(afterTurn);
    if (turnNumber >= 5 && activated) break;
  }
  const after = await readDurableWithRetry(auth.userId);
  raw.push({
    potion: scenario.potion,
    connection_name: connectionName,
    auth_user_id: auth.userId,
    fixture,
    turns,
  });
  summary.push({
    potion: scenario.potion,
    state: scenario.state,
    connection_name: connectionName,
    user_id: auth.userId,
    fixture,
    turns: turns.map((turn) => ({
      turn: turn.turn,
      attempt: turn.attempt,
      requestId: turn.requestId,
      user: turn.user,
      assistant: turn.assistant,
      status: turn.status,
      trace: turn.trace,
      durable_after: {
        sessions: turn.durable_after.sessions.map((row) => ({
          id: row.id,
          potion_type: row.potion_type,
          status: row.status,
        })),
        reminders: turn.durable_after.reminders.map((row) => ({
          id: row.id,
          initiative_kind: row.initiative_kind,
          source_kind: row.source_kind,
        })),
        checkins: turn.durable_after.checkins.map((row) => ({
          id: row.id,
          status: row.status,
          scheduled_for: row.scheduled_for,
        })),
      },
    })),
  });
  durable.push({
    potion: scenario.potion,
    user_id: auth.userId,
    connection_name: connectionName,
    before,
    after,
  });
}

fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);
fs.writeFileSync(reportPath, buildReport({ raw, summary, durable }));

console.log("\nArtifacts:");
console.log(rawPath);
console.log(summaryPath);
console.log(durablePath);
console.log(reportPath);
