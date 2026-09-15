import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const date = "2026-05-07";
const baseRunId = process.env.QA_RUN_ID || "dashhelp1";
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const interTurnDelayMs = Number(process.env.QA_INTER_TURN_DELAY_MS || 850);
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 90_000);
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/product_help_dashboard");
fs.mkdirSync(runDir, { recursive: true });

function safeExec(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function loadLocalSupabaseKeys() {
  const status = JSON.parse(safeExec("supabase", ["status", "--output", "json"]));
  return {
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY || status.SECRET_KEY,
  };
}

const { anonKey, serviceRoleKey } = loadLocalSupabaseKeys();

const conversations = [
  {
    id: "plan-overview",
    title: "Plan, actions et ajustement",
    targetFeatures: ["dashboard.plan", "plan.missions", "plan.habits", "plan.adjustment"],
    messages: [
      "dans mon espace Sophia, le plan sert a quoi exactement quand j'ai deja une transformation ?",
      "ok, et dans le tableau de bord action, je peux rentrer mes propres bilans ou actions ?",
      "si une mission du plan ne colle plus, je dois la supprimer ou passer par autre chose ?",
      "imagine que l'action est trop grosse cette semaine, tu m'orientes vers quelle partie precise ?",
      "et une habitude, je la valide comment sans inventer un bilan libre ?",
      "donne-moi la difference simple entre valider une mission et ajuster le plan.",
      "si je suis perdu dans les semaines et niveaux, tu me dis de regarder quoi en premier ?",
      "recap en trois points sur ce que je dois faire dans le Plan.",
    ],
  },
  {
    id: "resources-cards",
    title: "Ressources, cartes libres et cartes liees au plan",
    targetFeatures: ["resources.overview", "resources.attack_card", "resources.defense_card", "resources.plan_cards"],
    messages: [
      "dans l'espace Ressources, c'est quoi la difference entre carte d'attaque et carte de defense ?",
      "une carte de defense je peux la creer librement ou seulement depuis une action du plan ?",
      "et si elle est liee a une mission, je la retrouve ou apres generation ?",
      "pour une carte d'attaque, je la vois aussi dans le Plan ou seulement dans Ressources ?",
      "si je veux preparer une action avant de la faire, quelle carte tu m'expliques ?",
      "si mon probleme c'est plutot un piege au moment ou je deraille, tu m'orientes vers quoi ?",
      "est-ce que ces cartes modifient mon plan ou c'est juste un appui ?",
      "recap clair: ou creer, ou retrouver, et quoi utiliser selon le cas.",
    ],
  },
  {
    id: "potions-initiatives",
    title: "Potions et initiative automatique",
    targetFeatures: ["resources.potions", "initiatives"],
    messages: [
      "a quoi sert une potion dans Sophia ?",
      "quand je l'active, est-ce qu'elle fait juste une reponse maintenant ou autre chose apres ?",
      "tu peux me dire clairement cette histoire de suivi 7 jours ?",
      "ce suivi c'est une modification du plan ou une initiative ?",
      "je la retrouve ou ensuite si je veux comprendre ce qui est programme ?",
      "si mon etat est vraiment lourd, est-ce que potion remplace la securite ou pas ?",
      "et si je veux une initiative recurrente sans potion, je vais ou ?",
      "recap sobre: potion maintenant, suivi apres, et limites.",
    ],
  },
  {
    id: "initiatives-preferences-base",
    title: "Initiatives, preferences et Base de vie",
    targetFeatures: ["initiatives", "coach_preferences", "base_de_vie"],
    messages: [
      "les initiatives dans le dashboard, c'est quoi exactement ?",
      "je peux les mettre dans le plan actuel ou dans la base de vie ?",
      "quelles infos je dois remplir pour une initiative ?",
      "et les preferences coach, ca change quoi concretement ?",
      "si je veux que Sophia pose moins de questions, c'est dans quelle partie ?",
      "la Base de vie sert a quoi quand une transformation est finie ?",
      "est-ce que la Base de vie est un deuxieme plan actif ?",
      "recap: initiatives, preferences, base de vie, sans mélanger.",
    ],
  },
  {
    id: "inspirations-completion-transition",
    title: "Inspirations, fin de niveau, cloture et transition",
    targetFeatures: ["inspirations", "plan.level_completion", "transformation.closure", "transformation.transition"],
    messages: [
      "l'onglet Inspirations sert a quoi dans le dashboard action ?",
      "ce n'est pas la partie pour modifier le plan, on est d'accord ?",
      "quand je finis un niveau, Sophia attend quoi de moi ?",
      "quelle difference entre finir un niveau et cloturer toute la transformation ?",
      "la cloture avec ligne rouge et declics, ca va ou apres ?",
      "et la transition vers une prochaine transformation, je la vois ou ?",
      "si la suite est verrouillee, qu'est-ce que Sophia doit m'expliquer ?",
      "recap en separant Inspirations, fin de niveau, cloture, transition.",
    ],
  },
];

async function jsonFetch(url, opts, timeoutMs = fetchTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { res, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function responseText(response) {
  if (!response || typeof response !== "object") return "";
  return String(response.content || response.reply || response.text || "");
}

function detectedSkillIds(record) {
  if (!record || typeof record !== "object") return [];
  return Object.entries(record)
    .filter(([, value]) => value && typeof value === "object" && value.detected)
    .map(([key]) => key);
}

async function fetchTraceByTurnId(turnId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await delay(250);
    const result = await jsonFetch(
      `${apiUrl}/rest/v1/conversation_turn_traces?turn_id=eq.${encodeURIComponent(turnId)}&select=*&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          accept: "application/json",
        },
      },
    );
    if (result.res.ok && Array.isArray(result.json) && result.json[0]) {
      return result.json[0];
    }
  }
  return null;
}

function createConnection(runId) {
  const output = safeExec("bash", [
    "scripts/qa-create-run-connection.sh",
    "qa-skill",
    "product_help_dashboard",
    runId,
  ], { cwd: root });
  const name = output.split("\n")
    .map((line) => line.match(/^connection_name=(.+)$/)?.[1])
    .find(Boolean);
  if (!name) throw new Error(`connection creation failed for ${runId}`);
  safeExec("bash", ["scripts/qa-reset-persona.sh", "qa-skill", name], { cwd: root });
  const jwt = safeExec("bash", ["scripts/get-jwt.sh", "qa-skill", name], { cwd: root });
  const connectionPath = path.join(root, `tests/real-personas/qa-skill/connections/${name}.json`);
  const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
  return { name, jwt, connection };
}

async function sendTurn({ conversation, connectionName, connection, jwt, turnIndex, content, history }) {
  const requestId =
    `qa-product-help-dashboard-${date}-${baseRunId}-${conversation.id}-t${String(turnIndex + 1).padStart(2, "0")}`;
  const body = {
    user_id: connection.user_id,
    channel: "web",
    scope: `qa-product-help-dashboard-${date}-${baseRunId}-${conversation.id}`,
    content,
    history,
    disable_debounce: true,
    force_full_ai: true,
  };

  const attempts = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(700 + attempt * 250);
    let result;
    try {
      result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
          "x-request-id": `${requestId}-a${attempt + 1}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      attempts.push({
        attempt: attempt + 1,
        status: null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        empty_response: true,
      });
      continue;
    }

    const response = result.json?.response || {};
    const assistant = responseText(response);
    const trace = result.json?.conversation_turn_trace ||
      await fetchTraceByTurnId(`${requestId}-a${attempt + 1}`);
    const routeDecision = trace?.route_decision || null;
    const turnFrame = trace?.turn_frame || null;
    const skillRunEnvelope = trace?.skill_run || null;
    const skillRun = skillRunEnvelope?.output || skillRunEnvelope;
    const record = {
      attempt: attempt + 1,
      requestId: `${requestId}-a${attempt + 1}`,
      status: result.res.status,
      ok: Boolean(result.res.ok && result.json?.ok !== false),
      user: content,
      assistant,
      aborted: result.json?.aborted ?? response.aborted ?? false,
      abort_reason: result.json?.abort_reason ?? response.abort_reason ?? null,
      empty_response: assistant.trim().length === 0 || result.json?.empty_response === true,
      response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
      selected_handler: routeDecision?.selected_handler ?? null,
      route_reason_code: routeDecision?.reason_code ?? null,
      skill_entry_ids: detectedSkillIds(turnFrame?.skill_signals?.entry),
      skill_lifecycle_ids: detectedSkillIds(turnFrame?.skill_signals?.lifecycle),
      skill_run_id: skillRun?.skill_id ?? skillRunEnvelope?.selected_skill_id ?? null,
      skill_run_status: skillRun?.status ?? null,
      skill_run_response_intent: skillRun?.response_intent ?? null,
      skill_run_diagnosis: skillRun?.diagnosis ?? null,
      safety_pregate: trace?.safety_pregate ?? null,
      direct_effects: turnFrame?.direct_effects ?? [],
      response_tool_execution: response.tool_execution ?? null,
      response_executed_tools: response.executed_tools ?? [],
      tool_skill_run: trace?.tool_skill_run ?? null,
      trace_error: result.json?.trace_error ?? null,
    };
    attempts.push(record);
    if (record.ok && !record.empty_response && !record.aborted) {
      return { ...record, attempts, connectionName };
    }
  }
  return { ...attempts.at(-1), attempts, connectionName };
}

function short(text, max = 180) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function evaluateConversation(conversation, turns) {
  const observedFeatureIds = new Set(
    turns.map((turn) => turn.skill_run_diagnosis?.feature_id).filter(Boolean),
  );
  const missing = conversation.targetFeatures.filter((id) => !observedFeatureIds.has(id));
  const productTurns = turns.filter((turn) =>
    turn.response_owner === "product_help" || turn.selected_handler === "product_help" ||
    turn.skill_run_id === "product_help"
  );
  const bad = turns.filter((turn) =>
    turn.status !== 200 || turn.empty_response || turn.aborted || turn.trace_error
  );
  const forbidden = turns.filter((turn) =>
    /north star|etoile polaire|étoile polaire|boussole/i.test(turn.assistant || "")
  );
  return {
    productTurns: productTurns.length,
    observedFeatureIds: [...observedFeatureIds],
    missing,
    bad,
    forbidden,
    verdict: bad.length === 0 && forbidden.length === 0 && missing.length <= 1 &&
        productTurns.length >= Math.ceil(turns.length * 0.75)
      ? "VERT"
      : bad.length === 0 && forbidden.length === 0 && productTurns > 0
      ? "JAUNE"
      : "ROUGE",
  };
}

function buildReport(allRuns) {
  const lines = [];
  const allTurns = allRuns.flatMap((run) => run.turns);
  const allEvaluations = allRuns.map((run) => run.evaluation);
  const red = allEvaluations.filter((evaluation) => evaluation.verdict === "ROUGE").length;
  const yellow = allEvaluations.filter((evaluation) => evaluation.verdict === "JAUNE").length;
  const finalColor = red > 0 ? "ROUGE" : yellow > 0 ? "JAUNE" : "VERT";

  lines.push(`# QA Product Help Dashboard - ${date} - ${baseRunId}`);
  lines.push("");
  lines.push("## Setup");
  lines.push("");
  lines.push(`- Mode: product_help dashboard action probe`);
  lines.push(`- Conversations: ${allRuns.length}`);
  lines.push(`- Endpoint: ${apiUrl}`);
  lines.push("- Chemin: `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`");
  lines.push("- Secrets/JWT: non affiches");
  lines.push("- User QA: connexions temporaires isolees via `qa-create-run-connection.sh`");
  lines.push("");

  lines.push("## Synthese");
  lines.push("");
  lines.push(`- Verdict final: **${finalColor}**`);
  lines.push(`- Tours totaux: ${allTurns.length}`);
  lines.push(`- HTTP non-200 / empty / abort / trace_error: ${
    allTurns.filter((turn) => turn.status !== 200 || turn.empty_response || turn.aborted || turn.trace_error).length
  }`);
  lines.push(`- Reponses avec ancien vocabulaire interdit (North Star / Etoile / Boussole): ${
    allTurns.filter((turn) => /north star|etoile polaire|étoile polaire|boussole/i.test(turn.assistant || "")).length
  }`);
  lines.push("");

  lines.push("## Matrice Conversations");
  lines.push("");
  lines.push("| Conversation | Verdict | Product turns | Features observees | Manques | Notes |");
  lines.push("|---|---:|---:|---|---|---|");
  for (const run of allRuns) {
    lines.push(
      `| ${run.title} | ${run.evaluation.verdict} | ${run.evaluation.productTurns}/${run.turns.length} | ${
        run.evaluation.observedFeatureIds.join(", ") || "-"
      } | ${run.evaluation.missing.join(", ") || "-"} | ${
        run.evaluation.bad.length > 0 ? `${run.evaluation.bad.length} tours systeme en erreur` : "OK systeme"
      } |`,
    );
  }
  lines.push("");

  lines.push("## Conversations Completes");
  for (const run of allRuns) {
    lines.push("");
    lines.push(`### ${run.title} (${run.id}) - ${run.evaluation.verdict}`);
    lines.push("");
    for (const turn of run.turns) {
      lines.push(
        `#### T${String(turn.turn).padStart(2, "0")} - ${turn.status} - owner ${turn.response_owner ?? "-"} / handler ${turn.selected_handler ?? "-"} - feature ${turn.skill_run_diagnosis?.feature_id ?? "-"}`,
      );
      lines.push("");
      lines.push(`User: ${turn.user}`);
      lines.push("");
      lines.push(`Sophia: ${turn.assistant || "<empty>"}`);
      lines.push("");
      lines.push(
        `Trace: empty=${turn.empty_response}; aborted=${turn.aborted}; reason=${turn.route_reason_code ?? "-"}; skill=${turn.skill_run_id ?? "-"}; intent=${turn.skill_run_response_intent ?? "-"}; tools=${JSON.stringify(turn.response_executed_tools ?? [])}; direct_effects=${JSON.stringify(turn.direct_effects ?? [])}`,
      );
      if (turn.attempts?.length > 1) {
        lines.push(`Retries: ${turn.attempts.length - 1}`);
      }
      lines.push("");
    }
  }

  lines.push("## Assertions");
  lines.push("");
  const assertionRows = [
    ["all_turns_http_200_or_expected_status", allTurns.every((turn) => turn.status === 200)],
    ["no_empty_response", allTurns.every((turn) => !turn.empty_response)],
    ["no_unexpected_abort", allTurns.every((turn) => !turn.aborted)],
    ["no_forbidden_old_product_terms", allTurns.every((turn) => !/north star|etoile polaire|étoile polaire|boussole/i.test(turn.assistant || ""))],
    ["product_help_observed", allTurns.some((turn) => turn.skill_run_id === "product_help" || turn.response_owner === "product_help")],
    ["no_unrequested_tool_execution", allTurns.every((turn) => (turn.response_executed_tools ?? []).length === 0 && !turn.tool_skill_run)],
    ["operation_bridge_not_executed_by_product_help", allTurns.every((turn) => !turn.tool_skill_run)],
  ];
  lines.push("| Assertion | Resultat |");
  lines.push("|---|---:|");
  for (const [name, pass] of assertionRows) {
    lines.push(`| ${name} | ${pass ? "pass" : "fail"} |`);
  }
  lines.push("");

  lines.push("## Rapport Fluidite Humaine");
  lines.push("");
  lines.push(`- Couleur: **${finalColor === "ROUGE" ? "ROUGE" : yellow > 0 ? "JAUNE" : "VERT"}**`);
  lines.push("- Evaluation: les conversations testent des questions produit plausibles sur Plan, Ressources, Potions, Initiatives, Preferences, Base de vie, Inspirations et transitions.");
  lines.push("- A verifier manuellement: precision des formulations et absence de promesses d'action quand Sophia explique un bridge operationnel.");
  lines.push("");

  lines.push("## Rapport Systeme");
  lines.push("");
  lines.push(`- Couleur: **${allTurns.every((turn) => turn.status === 200 && !turn.empty_response && !turn.aborted) ? "VERT" : "ROUGE"}**`);
  lines.push("- Le run utilise le chemin endpoint local, avec traces de routing quand disponibles.");
  lines.push("- Aucun secret ni JWT n'est stocke dans ce rapport.");
  lines.push("");

  lines.push("## Verdict");
  lines.push("");
  lines.push(`**${finalColor}**`);
  lines.push("");
  lines.push("## Follow-ups");
  lines.push("");
  lines.push("- Relire les reponses JAUNE pour decider si les aliases/retrieval doivent etre renforces.");
  lines.push("- Si une feature attendue manque dans une conversation, ajouter un alias ou une formulation plus specifique dans `knowledge.ts`.");
  lines.push("");

  return lines.join("\n");
}

const allRuns = [];
for (let index = 0; index < conversations.length; index += 1) {
  const conversation = conversations[index];
  const runId = `${baseRunId}_c${index + 1}_${conversation.id.replace(/[^a-z0-9_-]/gi, "-")}`;
  console.log(`\n=== Conversation ${index + 1}/${conversations.length}: ${conversation.title} ===`);
  const { name: connectionName, jwt, connection } = createConnection(runId);
  const history = [];
  const turns = [];
  for (let turnIndex = 0; turnIndex < conversation.messages.length; turnIndex += 1) {
    const content = conversation.messages[turnIndex];
    console.log(`T${turnIndex + 1}: ${content}`);
    const turn = await sendTurn({
      conversation,
      connectionName,
      connection,
      jwt,
      turnIndex,
      content,
      history,
    });
    turn.turn = turnIndex + 1;
    turns.push(turn);
    console.log(`  -> ${turn.status} ${turn.response_owner ?? turn.selected_handler ?? "-"} ${turn.skill_run_diagnosis?.feature_id ?? "-"} ${short(turn.assistant, 110)}`);
    history.push({ role: "user", content, created_at: new Date().toISOString() });
    history.push({ role: "assistant", content: turn.assistant || "", created_at: new Date().toISOString() });
    while (history.length > 16) history.shift();
    await delay(interTurnDelayMs);
  }
  const evaluation = evaluateConversation(conversation, turns);
  allRuns.push({
    id: conversation.id,
    title: conversation.title,
    targetFeatures: conversation.targetFeatures,
    connectionName,
    turns,
    evaluation,
  });
}

const rawPath = path.join(runDir, `${date}-product-help-dashboard-${baseRunId}.raw.json`);
const summaryPath = path.join(runDir, `${date}-product-help-dashboard-${baseRunId}.summary.json`);
const reportPath = path.join(runDir, `${date}-product-help-dashboard-${baseRunId}.md`);
fs.writeFileSync(rawPath, `${JSON.stringify(allRuns, null, 2)}\n`);
fs.writeFileSync(
  summaryPath,
  `${JSON.stringify(allRuns.map((run) => ({
    id: run.id,
    title: run.title,
    targetFeatures: run.targetFeatures,
    connectionName: run.connectionName,
    evaluation: run.evaluation,
    turns: run.turns.map((turn) => ({
      turn: turn.turn,
      status: turn.status,
      user: turn.user,
      assistant: turn.assistant,
      response_owner: turn.response_owner,
      selected_handler: turn.selected_handler,
      feature_id: turn.skill_run_diagnosis?.feature_id ?? null,
      intent: turn.skill_run_response_intent,
      empty_response: turn.empty_response,
      aborted: turn.aborted,
      direct_effects: turn.direct_effects,
      tools: turn.response_executed_tools,
    })),
  })), null, 2)}\n`,
);
fs.writeFileSync(reportPath, `${buildReport(allRuns)}\n`);

console.log(JSON.stringify({
  ok: true,
  conversations: allRuns.length,
  rawPath,
  summaryPath,
  reportPath,
}, null, 2));
