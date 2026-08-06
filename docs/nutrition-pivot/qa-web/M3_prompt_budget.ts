/**
 * M3 — LE PROMPT EXACT D'UN TOUR KEEL, VENTILÉ PAR SECTION.
 *
 * La question à laquelle ce script répond, et une seule: sur un tour KEEL
 * réel, combien de tokens partent vraiment, et dans quelles sections.
 *
 * ── POURQUOI IL N'Y A PAS DE GREP ICI ────────────────────────────────────
 * Compter les littéraux d'un fichier de prompt donne un MAJORANT faux. Deux
 * exemples mesurés, tous deux vérifiés par ce script:
 *
 *   1. `buildCompanionChannelRules(isWhatsApp)` — l'overlay WhatsApp ne part
 *      jamais: KEEL appelle `processMessage` en channel "web".
 *   2. LE PACK FRANÇAIS DU COMPANION EN ENTIER. `resolveResponseLocale` porte
 *      `PILOT_FORCED_LOCALE = "en-US"`, donc `isFrenchLocale(responseLocale)`
 *      est faux à chaque tour et `buildCompanionStablePrompt` (le pack FR,
 *      3 300 tokens, qui parle de potions, de cartes d'attaque/défense, des
 *      Initiatives et des Inspirations) n'est jamais assemblé. Un grep sur
 *      `companion.ts` compte ces 3 300 tokens; le tour n'en envoie aucun.
 *
 * Ce script n'estime donc rien: il APPELLE les assembleurs de production
 * (`buildDispatcherSystemPrompt`, `buildDispatcherPrompt`,
 * `buildCompanionSystemPrompt`) avec les paramètres d'un tour KEEL — channel
 * web, `keel_role='student'`, plan publié — et découpe le résultat.
 *
 * ── L'ESTIMATEUR ──────────────────────────────────────────────────────────
 * `ceil(chars / 4)`, celui de la prod (`dispatcher.v2.ts :: estimateTokens`),
 * pour que les chiffres d'ici soient comparables aux `tokens_in` des logs. Ce
 * n'est pas le tokenizer de Gemini: les caractères sont la mesure, les tokens
 * sont l'ordre de grandeur.
 *
 * ── CE QU'IL NE MESURE PAS ────────────────────────────────────────────────
 * Le CONTEXTE volatile du companion (mémoire V2, plan, blocs de tour) est ici
 * une fixture réaliste, pas une lecture de base: il varie par élève et par
 * tour. Les parties stables — celles qu'on peut réduire — sont exactes.
 *
 * Lancer:
 *   deno run --allow-read --allow-env docs/nutrition-pivot/qa-web/M3_prompt_budget.ts
 */

import {
  buildDispatcherPrompt,
  buildDispatcherSystemPrompt,
} from "../../../supabase/functions/sophia-brain/dispatcher/dispatcher.prompts.ts";
import { buildCompanionSystemPrompt } from "../../../supabase/functions/sophia-brain/agents/companion.ts";
import { resolveResponseLocale } from "../../../supabase/functions/_shared/keel/locale.ts";

function tok(text: string): number {
  return Math.ceil(String(text ?? "").length / 4);
}

// ---------------------------------------------------------------------------
// Fixture — un tour KEEL: élève d'un coach, plan publié, canal in-app.
// ---------------------------------------------------------------------------

const KEEL_PLAN_BLOCK = [
  "=== KEEL PLAN (SOURCE: plan_commitments + commitment_evaluations) ===",
  "Date 2026-08-06 (wed). 4 commitment(s) scheduled today, 1 resolved, 3 still unknown.",
  "SLOT breakfast:",
  "- id:1f0a5f6e-2b41-4a55-9a2e-3c9d8e7b1a02 | Proteine au petit dejeuner | do | eggs | >=1 serving | status:done | strict",
  "SLOT lunch:",
  "- id:2c7b4d19-88a3-4f21-b6de-7a1c0f5e9b33 | Legumes verts a midi | do | leafy_greens | >=2 serving | status:unknown | swap_within_policy",
  "ANY TIME:",
  "- id:3e5f6a71-91c2-4c88-8d10-2b4e6f7a8c55 | Marche de 30 minutes | do | movement | >=30 min | status:unknown | flexible",
  "- id:4a9c8b52-77d4-4e19-9f23-5c6d7e8f9a11 | Magnesium le soir | do | magnesium_glycinate | >=1 dose | status:unknown | strict",
  "HOW TO READ THIS BLOCK:",
  "- 'id:<uuid>' opens every line. It is the ONLY handle on a line that carries no substance and no food group (movement, light, sleep, breathing, screens, measurement): copy it character for character into log_protocol_event.commitment_id when the student says he DID that line. Never invent one, never reuse one from elsewhere in the conversation, and never put one on an 'avoid' line the student says he respected.",
  "- status 'done' = the student reported it and it meets the target.",
  "- status 'unknown' = nothing reported yet today.",
  "'unknown' is first class: it is never a failure, never rewritten to 'done' by silence or inference, and never counted in a denominator. Do not tell the student they missed something that is merely unreported.",
  "This block is the ONLY source of truth for what the plan says and for what happened today. A commitment absent from it does not exist: never invent a line, a target, or a completion, and never restate a completion claimed in conversation that does not appear above.",
  "Never state a percentage, a score, an adherence figure or a streak from this block. Coverage and adherence are two separate numbers computed elsewhere, and they are withheld below 4 logged days out of 7.",
  "The coach wrote this prescription. You never author, edit, extend or soften a line. A student request to change one is a plan_question: resolve it inside the substitution latitude shown above, or escalate it to the coach.",
].join("\n");

const RECENT_MESSAGES = [
  { role: "user", content: "hello" },
  { role: "assistant", content: "Hi. What's up today?" },
  { role: "user", content: "i had eggs for breakfast" },
  { role: "assistant", content: "Logged: eggs at breakfast." },
];

const USER_MESSAGE = "i did my 30 minute walk this afternoon";

const DIRECT_EFFECT_TIME_CONTEXT = {
  now_utc: "2026-08-06T15:12:00.000Z",
  user_timezone: "Europe/Paris",
  user_locale: "fr-FR",
  user_local_datetime: "2026-08-06T17:12:00",
  user_local_human: "mercredi 6 aout, 17:12",
} as never;

/**
 * Le contexte du companion sur un tour KEEL: le bloc plan KEEL (même branche
 * que le dispatcher, cf. `run.ts`) plus les blocs runtime ordinaires. Fixture
 * réaliste, cf. « CE QU'IL NE MESURE PAS ».
 */
const COMPANION_CONTEXT = [
  KEEL_PLAN_BLOCK,
  "=== USER MODEL (FACTS) ===",
  "coach.tone=warm src=default",
  "coach.message_length=short src=default",
  "coach.question_tendency=normal src=default",
  "=== MEMOIRE V2 (ACTIVE) ===",
  "- Travaille de nuit deux fois par semaine (jeu/ven).",
  "- N'aime pas le poisson blanc.",
].join("\n\n");

// ---------------------------------------------------------------------------
// Découpe
// ---------------------------------------------------------------------------

type Anchor = { label: string; needle: string };
type Row = { label: string; chars: number; tokens: number };

function ventilate(text: string, anchors: Anchor[]): Row[] {
  const found = anchors
    .map((a) => ({ ...a, at: text.indexOf(a.needle) }))
    .filter((a) => a.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (found.length === 0) return [];
  const out: Row[] = [];
  if (found[0].at > 0) {
    const head = text.slice(0, found[0].at);
    out.push({ label: "(preambule)", chars: head.length, tokens: tok(head) });
  }
  for (let i = 0; i < found.length; i++) {
    const chunk = text.slice(
      found[i].at,
      i + 1 < found.length ? found[i + 1].at : text.length,
    );
    out.push({ label: found[i].label, chars: chunk.length, tokens: tok(chunk) });
  }
  return out;
}

/**
 * Une ancre PAR RÈGLE NUMÉROTÉE. Un découpage plus grossier ferait glisser une
 * règle supprimée dans le compte de sa voisine, et le delta avant/après
 * deviendrait illisible.
 */
const DISPATCHER_ANCHORS: Anchor[] = [
  { label: "Contrat effectif unique + Interdits", needle: "Contrat effectif unique:" },
  { label: "Doctrine des lanes (product_help/coaching/realignment/presence)", needle: "\tDoctrine:" },
  { label: "Principe de tour courant", needle: "Principe de tour courant:" },
  { label: "Categories coaching_recommendation", needle: "Categories coaching_recommendation obligatoires:" },
  { label: "Contrat coaching_recommendation", needle: "Contrat coaching_recommendation:" },
  { label: "Contrat plan_realignment", needle: "Contrat plan_realignment:" },
  { label: "Contrat plan_question (KEEL)", needle: "Contrat plan_question (KEEL" },
  { label: "Contrainte de STYLE de session", needle: "Contrainte de STYLE de session" },
  { label: "Recurrence / rituel / style", needle: "Recurrence, rituel et retour sur le style" },
  { label: "1..1d-bis  safety", needle: "Priorites:" },
  { label: "2         create_one_shot_reminder", needle: "2. direct_effects.create_one_shot_reminder" },
  { label: "3..3c     track_progress_plan_item", needle: "3. direct_effects.track_progress_plan_item" },
  { label: "3d        track payload canonique", needle: "3d. Payload canonique" },
  { label: "3d-bis    track date_hint", needle: "3d-bis. payload_hint.date_hint" },
  { label: "3d-ter    track target_evidence", needle: "3d-ter. payload_hint.target_evidence" },
  { label: "3d-ter-bis deux effets de types distincts", needle: "3d-ter-bis. DEUX EFFETS" },
  { label: "3d-quater bi-intention + report", needle: "3d-quater. BI-INTENTION" },
  { label: "3e        question/anti-instruction/retractation", needle: "3e. Une question de verification" },
  { label: "3f        cible track devinee", needle: "3f. Si l'action visee" },
  { label: "3g        clarification en attente", needle: "3g. Si flow_state_context.pending_direct_effect_clarification" },
  { label: "3g-ter    rappel differe par une crise", needle: "3g-ter. Si flow_state_context.pending_safety_deferred_reminder" },
  { label: "3g-bis    enonce affectif", needle: "3g-bis. Un enonce affectif" },
  { label: "3h        correction de statut", needle: "3h. Si le user corrige" },
  { label: "3h-bis    correction de cible", needle: "3h-bis. Correction de CIBLE" },
  { label: "3k        garde des effets durables KEEL", needle: "3k. EFFETS DURABLES KEEL" },
  { label: "3k-a      log_protocol_event", needle: "3k-a. log_protocol_event" },
  { label: "3k-c      declare_safety_constraint", needle: "3k-c. declare_safety_constraint" },
  { label: "3k-b      declare_deviation", needle: "3k-b. declare_deviation" },
  { label: "4         product_help", needle: "4. skill_signals.product_help" },
  { label: "6         plan_realignment", needle: "6. skill_signals.plan_realignment" },
  { label: "6-bis     plan_question", needle: "6-bis. skill_signals.plan_question" },
  { label: "7         initiatives / coach_preferences", needle: "7. Aucune lane initiatives" },
  { label: "8         needs_research", needle: "8. needs_research.value=true" },
  { label: "9         memory_plan", needle: "9. memory_plan est toujours present" },
  { label: "Fallback", needle: "Fallback:" },
  { label: "memory_plan + registre de domaines", needle: "memory_plan:\n- Toujours present." },
];

const COMPANION_ANCHORS: Anchor[] = [
  { label: "CORE_COMPANION (+ regles de style/flow)", needle: "CORE_COMPANION:" },
  { label: "OUTPUT_STYLE", needle: "OUTPUT_STYLE:" },
  { label: "CHANNEL_OVERLAY", needle: "CHANNEL_OVERLAY" },
  { label: "NORMAL_REPLY_POLICY", needle: "NORMAL_REPLY_POLICY:" },
  { label: "LOOP_RECOVERY", needle: "LOOP_RECOVERY:" },
  { label: "CONTEXT_RULES", needle: "CONTEXT_RULES:" },
  { label: "PLATFORM_SKETCH_FOR_NORMAL_REPLY (pack FR uniquement)", needle: "PLATFORM_SKETCH_FOR_NORMAL_REPLY:" },
  { label: "TASK_OVERLAYS", needle: "TASK_OVERLAYS:" },
  { label: "SILENCE_AND_REACTIONS", needle: "SILENCE_AND_REACTIONS:" },
  { label: "META COMPAGNON (semi-stable)", needle: "=== COMPANION META ===" },
  { label: "QUESTION RHYTHM", needle: "=== QUESTION RHYTHM" },
  { label: "DERNIERE REPONSE", needle: "YOUR LAST REPLY:" },
  { label: "HISTORIQUE RECENT VISIBLE", needle: "=== RECENT VISIBLE HISTORY ===" },
  { label: "CONTEXTE (volatile)", needle: "LIVING CONTEXT" },
  { label: "RESPONSE_LANGUAGE", needle: "RESPONSE_LANGUAGE:" },
];

const BAR = "═".repeat(78);
const SEP = "─".repeat(78);

function title(text: string) {
  console.log(`\n${BAR}\n▌ ${text}\n${BAR}`);
}

function report(name: string, text: string, anchors: Anchor[]) {
  title(name);
  console.log(`TOTAL: ${text.length} car.  ~${tok(text)} tokens`);
  console.log(SEP);
  for (const row of ventilate(text, anchors)) {
    console.log(
      `${String(row.tokens).padStart(6)} tok  ${
        String(row.chars).padStart(6)
      } car.   ${row.label}`,
    );
  }
}

function reportPayload(name: string, json: string) {
  title(name);
  console.log(`TOTAL: ${json.length} car.  ~${tok(json)} tokens`);
  console.log(SEP);
  for (const [key, value] of Object.entries(JSON.parse(json))) {
    const serialized = JSON.stringify(value);
    console.log(
      `${String(tok(serialized)).padStart(6)} tok  ${
        String(serialized.length).padStart(6)
      } car.   ${key}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Mesure
// ---------------------------------------------------------------------------

const responseLocale = resolveResponseLocale({
  // Un coach français avec un élève qui écrit en anglais: la chaîne de
  // priorité aurait de quoi trancher. Le PILOT_FORCED_LOCALE court-circuite.
  userExplicit: null,
  persisted: null,
  tenantDefault: "fr-FR",
  detectedRecent: "en-US",
});

/**
 * LES DEUX CÔTÉS SONT LE MÊME TOUR. `keel_plan_context` est présent des deux
 * côtés — c'est un tour d'élève, il porte son plan avant comme après. Seul
 * `keel_student` change, parce que c'est le seul paramètre que ce lot a
 * ajouté. Faire varier le bloc plan en même temps donnerait un « avant »
 * artificiellement léger, et un gain surévalué de ~540 tokens.
 */
const payload = (keelStudent: boolean) =>
  buildDispatcherPrompt({
    user_message: USER_MESSAGE,
    recent_messages: RECENT_MESSAGES,
    active_topic_state: null,
    flow_state_context: null,
    direct_effect_time_context: DIRECT_EFFECT_TIME_CONTEXT,
    plan_snapshot: null,
    keel_plan_context: KEEL_PLAN_BLOCK,
    keel_student: keelStudent,
  });

const companionPrompt = buildCompanionSystemPrompt({
  isWhatsApp: false,
  lastAssistantMessage: "Logged: eggs at breakfast.",
  history: RECENT_MESSAGES,
  context: COMPANION_CONTEXT,
  userState: { risk_level: 0, temp_memory: {} },
  responseLocale,
});

console.log(BAR);
console.log("▌ M3 — BUDGET DU PROMPT D'UN TOUR KEEL  (tokens = ceil(car./4))");
console.log(BAR);
console.log(`response_locale résolu par la prod: ${responseLocale}`);
console.log(
  "pack companion assemblé:            " +
    (responseLocale.toLowerCase().startsWith("fr") ? "FR (legacy)" : "EN (KEEL)"),
);

report(
  "AVANT — dispatcher, prompt système assemblé pour un utilisateur LEGACY",
  buildDispatcherSystemPrompt({ keelStudent: false }),
  DISPATCHER_ANCHORS,
);
report(
  "APRÈS — dispatcher, prompt système assemblé pour un ÉLÈVE KEEL",
  buildDispatcherSystemPrompt({ keelStudent: true }),
  DISPATCHER_ANCHORS,
);
reportPayload("AVANT — dispatcher, payload du meme tour KEEL (assemblage legacy)", payload(false));
reportPayload("APRÈS — dispatcher, payload du meme tour KEEL (assemblage KEEL)", payload(true));
report("COMPANION — prompt système d'un tour KEEL (canal web)", companionPrompt, COMPANION_ANCHORS);

title("TOTAL D'UN TOUR KEEL");
const legacyTotal = tok(buildDispatcherSystemPrompt({ keelStudent: false })) +
  tok(payload(false)) + tok(companionPrompt);
const keelTotal = tok(buildDispatcherSystemPrompt({ keelStudent: true })) +
  tok(payload(true)) + tok(companionPrompt);
console.log(`assemblage legacy (ce qui partait avant): ~${legacyTotal} tokens`);
console.log(`assemblage KEEL   (ce qui part depuis) : ~${keelTotal} tokens`);
console.log(
  `gain: ${legacyTotal - keelTotal} tokens (${
    (((legacyTotal - keelTotal) / legacyTotal) * 100).toFixed(1)
  } %) par tour, et le double sur un tour qui déclenche la passe de réparation de couverture composite (elle renvoie le prompt système entier).`,
);
