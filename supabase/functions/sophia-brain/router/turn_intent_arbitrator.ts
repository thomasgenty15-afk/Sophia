import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

// =============================================================================
// COUCHE L3 — Arbitre de routage
// =============================================================================
//
// RÈGLE ARCHITECTURALE (voir docs/agent-playbook/13-architecture-skills,
// section "Couche L3 — Garanties dures, jamais de détection sémantique"):
//
//   Cette couche NE DOIT PAS contenir de détection sémantique d'intention par
//   regex sur le message utilisateur brut. La compréhension de l'intention
//   appartient au dispatcher LLM (L1). Cette couche ne contient que :
//     (a) des garanties dures non-sémantiques (contrats de safety/refus),
//     (b) des patchs transitionnels explicitement marqués pour suppression
//         dès que le dispatcher couvre le cas.
//
//   Si tu (humain ou agent IA) penses devoir ajouter une nouvelle regex
//   sémantique ici : NE LE FAIS PAS. Mets-la dans le prompt du dispatcher
//   sous forme de few-shot, ou dans le slot filler du skill concerné.
//   Ajouter une regex sémantique ici recrée les bugs des runs A2/A4/A6 de
//   mai 2026 (false positives sur "piège", "honte", payload manquant).
// =============================================================================

type ClearFlowTarget = "active_tool" | "pending_tool" | "recommendation";

export type TurnIntentArbitrationResult = {
  routeDecision: RouteDecision;
  turnFrame: TurnFrame;
  tempMemory: any;
  changed: boolean;
  reasonCode?: string;
  clearTargets: ClearFlowTarget[];
};

export type TurnIntentArbitrationInput = {
  userMessage: string;
  routeDecision: RouteDecision;
  turnFrame: TurnFrame;
  tempMemory: any;
  activeOperationIntake?: unknown;
  pendingOperationConfirmation?: unknown;
  safetyBlocksTools?: boolean;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    // Chantier 15 (2026-05-28) — Normaliser les tirets ("fais-moi", "rappelle-moi",
    // "donne-moi") en espace pour que les regex d'intention couvrent les
    // formes hyphénées comme les formes espacées.
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function activeOperationType(input: TurnIntentArbitrationInput): string {
  const active = input.activeOperationIntake ??
    input.tempMemory?.__active_tool_skill_intake ??
    input.tempMemory?.active_tool_skill_intake ??
    null;
  return String((active as any)?.operation_type ?? "").trim();
}

function pendingOperationType(value: unknown): string {
  return String((value as any)?.operation_type ?? "").trim();
}

function blockedPath(path: string, reasonCode: string) {
  return { path, reason_code: reasonCode };
}

function noneOpportunity(): TurnFrame["tool_skill_opportunity"] {
  return {
    type: "none",
    operation_type: null,
    surface_id: null,
    confidence_band: "low",
    should_offer: false,
    prop_reason: null,
    source_span: null,
    target_hint: null,
    target_status: "none",
    suggested_question_intent: null,
    offer_timing: "never",
    must_not_execute: true,
  };
}

function clearToolFlowMemory(tempMemory: any, targets: ClearFlowTarget[]): any {
  const next = { ...(tempMemory ?? {}) };
  if (targets.includes("active_tool")) {
    delete next.__active_tool_skill_intake;
    delete next.active_tool_skill_intake;
  }
  if (targets.includes("pending_tool")) {
    delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  }
  if (targets.includes("recommendation")) {
    delete next.__pending_recommendation_operation;
  }
  return next;
}

function hasTimeHint(text: string): boolean {
  return /\b(aujourd hui|demain|apres demain|ce soir|matin|midi|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/
    .test(text);
}

// ---------------------------------------------------------------------------
// PATCHS TRANSITIONNELS — À RETIRER QUAND LE DISPATCHER COUVRE LES CAS
// ---------------------------------------------------------------------------
//
// Les détecteurs ci-dessous sont des patchs en attendant que le prompt du
// dispatcher couvre proprement ces cas. Ils violent la règle architecturale
// (détection sémantique en code) mais sont conservés temporairement parce
// que leur retrait sans contrepartie côté dispatcher ferait régresser des
// tours qui passent aujourd'hui (A2-r4 T6, A6-r2 T7, etc.).
//
// NE PAS ÉTENDRE LA LISTE. NE PAS AJOUTER DE NOUVEAUX MOTS-CLÉS.
// Quand le dispatcher gère le cas, supprimer le détecteur correspondant.
//
// Migration L3 → L1 (2026-05-28, chantier 3): le prompt dispatcher
// `dispatcher.prompts.ts` (version `dispatcher_v2_prompt_2026_05_s17_l3_migration`)
// embarque maintenant 5 few-shots dans `critical_routing_examples` qui
// couvrent les 5 cas ci-dessous. Les détecteurs sont conservés en filet
// de sécurité (defense in depth). Critère de suppression: un run QA dédié
// confirme que le dispatcher produit nativement les signaux attendus
// (direct_effect.create_one_shot_reminder avec raw_text, skill_signals.exit
// sur prepare_attack_card, tool_skill_intents.update_coach_preferences,
// skill_signals.entry.product_help, normal_reply sans intents).
//
// Historique de suppression:
//   - detectsHumanRecap        — SUPPRIMÉ 2026-05-28 (faux positif sur
//                                "piège"/"honte" cassait A6-r2 T2).
//   - detectsHybridDurableRecap — SUPPRIMÉ 2026-05-28 (même famille de
//                                faux positifs, redondance avec
//                                detectsExactDurableStatus).
// ---------------------------------------------------------------------------

/** TRANSITIONNEL — déplacer vers dispatcher (intent prepare_one_shot_reminder). */
export function detectsExplicitOneShotReminderCreate(message: string): boolean {
  const text = normalizeText(message);
  if (
    !/\brappel|rappelle|programme|programmer|planifie|planifier|dis moi|previens moi\b/
      .test(text)
  ) {
    return false;
  }
  if (
    /\b(comment|ou|dans l app|dans l application|retrouver|verifier|annuler|supprimer)\b/
      .test(text) &&
    !/\b(nouveau rappel|cree|creer|programme|programmer|rappel ponctuel)\b/
      .test(
        text,
      )
  ) return false;
  // Chantier 15 (2026-05-28): élargir la couverture pour capter les
  // demandes "crée le deuxième/second rappel à HH" / "ajoute un rappel"
  // / "fais-moi un rappel" / "mets un rappel" qui ne matchaient pas la
  // liste fermée précédente, et finissaient hijackées par prepare_attack_card
  // (cf. A4-r6 T5 où "Oui, crée le deuxième rappel à 11h37 ..." routait
  // vers carte alors qu'une carte avait été créée juste avant).
  const createSignal =
    /\b(nouveau rappel|rappel ponctuel|rappelle moi|programme moi|programme un rappel|cree un nouveau rappel|creer un nouveau rappel|mets moi un rappel|dis moi|previens moi|(?:cree|creer|cree moi|cree nous|ajoute|ajoute moi|fais|fais moi|mets|met|met moi|programme|planifie)\s+(?:le|la|un|une|moi un|moi le|moi la|un nouveau|une nouvelle|un autre|une autre|un second|une seconde|le second|la seconde|un deuxieme|le deuxieme|une deuxieme|la deuxieme|un troisieme|le troisieme)\s+rappel)\b/
      .test(text);
  return createSignal && hasTimeHint(text);
}

/** TRANSITIONNEL — déplacer vers dispatcher (skill_signals.exit / refus tool actif). */
export function detectsActiveToolCancellation(message: string): boolean {
  const text = normalizeText(message);
  return /\b(aucune carte|pas une carte|pas de carte|stop carte|stop ce flow|stop ce flux|annule la carte|arrete la carte|je parle seulement du rappel|je parle uniquement du rappel|seulement du rappel)\b/
    .test(text);
}

/** TRANSITIONNEL — déplacer vers dispatcher (tool_skill_intents update_coach_preferences). */
export function detectsDurableCoachPreference(message: string): boolean {
  const text = normalizeText(message);
  return /\b(preference durable|preference coach|preference de coaching|enregistre une preference|garde comme preference|garde cette preference|pour la suite)\b/
    .test(text) &&
    /\b(preference|coaching|coach|reponds|pose|question|action|emoji|lignes?|court|courte|ton style|ta facon)\b/
      .test(text);
}

/** TRANSITIONNEL — déplacer vers dispatcher (product_help routing). */
export function detectsExplicitProductHelp(message: string): boolean {
  const text = normalizeText(message);
  return /\b(cote produit|dans l app|dans l application|dans l interface|ou est ce que|ou je|je vais ou|retrouver|annuler|supprimer|modifier)\b/
    .test(text) &&
    /\b(rappel|carte|ressources|initiatives|app|application|interface|produit)\b/
      .test(text);
}

/** TRANSITIONNEL — déplacer vers dispatcher (status_only routing).
 *
 *  Note: ce détecteur a vu des faux positifs en pratique (ex: "sans rien
 *  modifier" matche aussi dans des recaps humains). Il est moins dangereux
 *  que detectsHumanRecap parce que sa destination (status_only) est moins
 *  destructive, mais il doit quand même partir vers le dispatcher.
 */
export function detectsExactDurableStatus(message: string): boolean {
  const text = normalizeText(message);
  return /\b(vraiment enregistre|vraiment programme|confirme|confirmee|non confirme|non confirmee|heures? exactes?|quelle heure|les deux|aucun|statut fiable|sans rien modifier|ce qui a vraiment ete cree|ce qui est vraiment cree)\b/
    .test(text);
}

/** TRANSITIONNEL — chantier 10 (2026-05-28). Voir A7-r2 T15.
 *
 *  Une demande de "récap final" / "fais le point" / "résume" sur la session
 *  doit aller vers `normal_reply` (le LLM companion compose un résumé à
 *  partir du contexte + durableEffectsSummary), JAMAIS vers
 *  `update_coach_preferences` (qui interpréterait le contenu du récap
 *  comme une nouvelle préférence à enregistrer en DB).
 *
 *  Architectural note: c'est une garantie de non-écriture sur un signal
 *  de lecture pure. Cohérent avec L3 = garanties dures sur contrats.
 */
export function detectsRecapRequest(message: string): boolean {
  const text = normalizeText(message);
  if (
    /\b(recap|recapitule|recapitulons|recapitulatif|resume nous|fais le point|fais un point|fais un bilan|bilan de (?:ce|nos|notre|cette))\b/
      .test(text)
  ) return true;
  if (/\brecap\s+(?:final|de\s+session|de\s+la\s+session)\b/.test(text)) {
    return true;
  }
  if (/\b(resume|resume moi)\b.*\b(session|conversation|tour|ce qu on a)\b/.test(text)) {
    return true;
  }
  // Chantier 16 (2026-05-28) — Mémoire conversationnelle humaine. Voir
  // A2-r6 T9 où "Résume ce que tu dois retenir de mon piège" tombait sur
  // le status resolver. Ces formulations sont des récaps de mémoire
  // humaine, pas des status DB.
  if (
    /\b(resume|raconte|donne moi|dis moi|rappelle moi)\b.*\b(ce que tu (?:dois|as)? ?(?:retenir|retiens|retenu)|ce que tu retiens|ce qu il faut retenir)\b/
      .test(text)
  ) return true;
  if (/\b(qu est ce que tu as retenu|qu as tu retenu|que retiens tu)\b/.test(text)) {
    return true;
  }
  return false;
}

/** Chantier 16 (2026-05-28) — Anti-status. Voir A2-r6 T9.
 *
 *  Quand l'utilisateur dit explicitement "pas les statuts système /
 *  sans les statuts / pas le statut", il REJETTE la vue système. Cette
 *  formulation est une garantie dure : on doit forcer normal_reply
 *  même si d'autres détecteurs (status_only, multi_entity_status) auraient
 *  déclenché.
 */
export function detectsExplicitNoStatusRequest(message: string): boolean {
  const text = normalizeText(message);
  return /\b(pas (?:les|le) statut(?:s)?(?: systeme)?|sans (?:les|le) statut(?:s)?|pas en mode statut|pas une liste de statut)\b/
    .test(text);
}

/** TRANSITIONNEL — chantier 9 (2026-05-28). Voir A7-r2 T3.
 *
 *  Quand un draft de carte d'attaque attend confirmation (pending intake)
 *  et que l'utilisateur écrit une correction de slot ("non, change la phrase
 *  en ...", "plutôt action: ...", "remplace le piège par ..."), le dispatcher
 *  L1 a tendance à router vers `product_help` parce que la mention du slot
 *  ("phrase", "action", "piège") déclenche le détecteur produit. On doit
 *  forcer le retour vers `tool_skill.prepare_attack_card` pour que le slot
 *  filler reprenne la main et applique la correction au draft.
 *
 *  Architectural note: c'est PAS une détection sémantique d'intention de
 *  haut niveau, c'est une garantie de continuité d'un flow déjà ouvert.
 *  Cohérent avec la doctrine L3 "garanties dures sur des contrats" :
 *  une opération active est un contrat ouvert qu'un détecteur produit
 *  générique ne doit pas pouvoir casser.
 *
 *  Anti-faux-positif: si le message contient un marqueur produit explicite
 *  ("dans l'app", "où dans", "retrouver", "annuler"), on laisse passer.
 */
const ATTACK_CARD_SLOT_KEYWORDS =
  /\b(action|piege|signal(?:\s+visuel)?|phrase|technique|ancre|declencheur|trigger|cible|setup|texte)\b/;
const CORRECTION_KEYWORDS =
  /\b(non(?:\s+plut[oô]t)?|plut[oô]t|change|remplace|modifie|corrige|remets?|met(?:s|tre)|reformule)\b/;
const PRODUCT_HELP_MARKERS =
  /\b(dans l app|dans l application|dans l interface|ou dans|ou je|retrouver|annuler|supprimer)\b/;

export function looksLikeAttackCardSlotCorrection(message: string): boolean {
  const text = normalizeText(message);
  if (PRODUCT_HELP_MARKERS.test(text)) return false;
  if (!CORRECTION_KEYWORDS.test(text)) return false;
  if (!ATTACK_CARD_SLOT_KEYWORDS.test(text)) return false;
  return true;
}

/** TRANSITIONNEL — chantier 8 (2026-05-28). Voir A4-r5 T10, A7-r2 T11.
 *
 *  Une question "factuelle" sur l'état durable multi-entité ("quelle carte /
 *  quels rappels / quelle préf active ?") doit aller à status_only et NON
 *  à product_help. detectsExplicitProductHelp() match parfois "carte" +
 *  "ressources" et hijacke ces questions, qui finissent par un descriptif
 *  produit générique au lieu d'un état DB factuel.
 *
 *  Patterns conservateurs (pour éviter de hijacker product_help légitime) :
 *    - "point durable" / "état durable" / "récap durable" : framing explicite
 *    - "quel(le|s|les) X" listant ≥2 entités parmi {carte, rappel, préf}
 *    - "réponds factuel(lement)" combiné à "quel(le|s|les)" : question typée
 *
 *  À retirer quand le dispatcher route nativement ces questions vers
 *  status_only (couverture few-shot dispatcher.prompts.ts à ajouter au
 *  prochain bump de version).
 */
export function detectsMultiEntityDurableStatus(message: string): boolean {
  const text = normalizeText(message);
  if (/\b(point|etat|recap|resume)\s+(?:de\s+l\s*)?etat\s+durable\b/.test(text)) {
    return true;
  }
  if (/\b(point\s+durable|etat\s+durable|recap\s+durable)\b/.test(text)) {
    return true;
  }
  if (
    /\b(reponds?|reponse)\s+factuel/.test(text) &&
    /\bquel(?:le|s|les)?\b/.test(text)
  ) {
    return true;
  }
  const hasMultiEntityQuestion =
    /\bquel(?:le|s|les)?\s+(?:carte|rappel|pref|preference)/.test(text);
  if (hasMultiEntityQuestion) {
    const entityMentions = [
      /\bcartes?\b/.test(text),
      /\brappels?\b/.test(text),
      /\bpref(?:erence)?s?\b/.test(text),
    ].filter(Boolean).length;
    if (entityMentions >= 2) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SIGNAL ANTI-FAUX-POSITIF — détecter une demande explicite de carte
// d'attaque pour empêcher les détecteurs ci-dessus de la hijacker.
// ---------------------------------------------------------------------------

function looksLikeExplicitAttackCardRequest(message: string): boolean {
  const text = normalizeText(message);
  const hasCardVerb =
    /\b(prepare|cree|creer|fais une|fais moi une|fais moi un|ajoute|valide)\b[\s\S]{0,30}\b(carte d attaque|carte attaque|attack card)\b/
      .test(text) ||
    /\b(carte d attaque|carte attaque|attack card)\b[\s\S]{0,30}\b(prepare|cree|creer|valide|ajoute)\b/
      .test(text);
  if (!hasCardVerb) return false;
  const hasStructureMarker =
    /\b(action\s*:|piege\s*:|signal\s*(visuel)?\s*:|phrase\s*:|technique\s*:|cible\s*:|setup\s*:|texte\s*:)/
      .test(text);
  return hasStructureMarker;
}

// ---------------------------------------------------------------------------
// REWRITES
// ---------------------------------------------------------------------------

function rewriteForNormalReply(args: {
  input: TurnIntentArbitrationInput;
  reasonCode: string;
  blockedPaths: string[];
  clearTargets?: ClearFlowTarget[];
  removeToolIntents?: string[];
  removeDirectEffects?: string[];
}): TurnIntentArbitrationResult {
  const clearTargets = args.clearTargets ?? [];
  const nextTempMemory = clearToolFlowMemory(
    args.input.tempMemory,
    clearTargets,
  );
  const removeToolIntents = new Set(args.removeToolIntents ?? []);
  const removeDirectEffects = new Set(args.removeDirectEffects ?? []);
  const nextTurnFrame: TurnFrame = {
    ...args.input.turnFrame,
    direct_effects: args.input.turnFrame.direct_effects.filter((effect) =>
      !removeDirectEffects.has(effect.effect_type)
    ),
    tool_skill_intents: args.input.turnFrame.tool_skill_intents.filter((
      intent,
    ) => !removeToolIntents.has(intent.operation_type)),
    tool_skill_opportunity: removeToolIntents.size > 0
      ? noneOpportunity()
      : args.input.turnFrame.tool_skill_opportunity,
  };
  return {
    changed: true,
    reasonCode: args.reasonCode,
    clearTargets,
    tempMemory: nextTempMemory,
    turnFrame: nextTurnFrame,
    routeDecision: {
      ...args.input.routeDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      direct_effects_to_run: args.input.routeDecision.direct_effects_to_run
        .filter((effect) => !removeDirectEffects.has(effect)),
      reason_code: args.reasonCode,
      blocked_paths: [
        ...args.input.routeDecision.blocked_paths,
        ...args.blockedPaths.map((path) => blockedPath(path, args.reasonCode)),
      ],
    },
  };
}

function rewriteForOneShotReminder(
  input: TurnIntentArbitrationInput,
  reasonCode: string,
): TurnIntentArbitrationResult {
  const nextTempMemory = clearToolFlowMemory(input.tempMemory, [
    "active_tool",
    "recommendation",
  ]);
  const existingEffects = input.turnFrame.direct_effects.filter((effect) =>
    effect.effect_type !== "create_one_shot_reminder"
  );
  // FIX 2026-05-28: payload_hint était {} vide, ce qui faisait que le runtime
  // aval (maybeCreateOneShotReminder) recevait une intent sans texte source.
  // On propage raw_text = userMessage pour que l'extracteur de payload aval
  // puisse fonctionner. C'est cohérent avec la convention documentée dans
  // dispatcher.prompts.ts ("payload_hint doit contenir raw_text et les
  // indices temporels disponibles").
  const nextTurnFrame: TurnFrame = {
    ...input.turnFrame,
    direct_effects: [
      ...existingEffects,
      {
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: input.userMessage },
      },
    ],
    tool_skill_intents: input.turnFrame.tool_skill_intents.filter((intent) =>
      intent.operation_type !== "prepare_attack_card" &&
      intent.operation_type !== "prepare_defense_card" &&
      intent.operation_type !== "adjust_plan_item"
    ),
    tool_skill_opportunity: noneOpportunity(),
  };
  return {
    changed: true,
    reasonCode,
    clearTargets: ["active_tool", "recommendation"],
    tempMemory: nextTempMemory,
    turnFrame: nextTurnFrame,
    routeDecision: {
      ...input.routeDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      direct_effects_to_run: ["create_one_shot_reminder"],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("tool_skill.prepare_attack_card", reasonCode),
        blockedPath("tool_skill_flow", reasonCode),
      ],
    },
  };
}

function rewriteForCoachPreference(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  const reasonCode = "central_arbitrator_coach_preference_priority";
  const nextTempMemory = clearToolFlowMemory(input.tempMemory, [
    "active_tool",
    "recommendation",
  ]);
  const nextTurnFrame: TurnFrame = {
    ...input.turnFrame,
    direct_effects: [],
    tool_skill_intents: [
      ...input.turnFrame.tool_skill_intents.filter((intent) =>
        intent.operation_type !== "update_coach_preferences" &&
        intent.operation_type !== "prepare_attack_card"
      ),
      {
        operation_type: "update_coach_preferences",
        explicitness: "explicit",
        target_hint: input.userMessage,
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "update",
      },
    ],
    tool_skill_opportunity: noneOpportunity(),
  };
  return {
    changed: true,
    reasonCode,
    clearTargets: ["active_tool", "recommendation"],
    tempMemory: nextTempMemory,
    turnFrame: nextTurnFrame,
    routeDecision: {
      ...input.routeDecision,
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("product_help", reasonCode),
        blockedPath("tool_skill.prepare_attack_card", reasonCode),
      ],
    },
  };
}

function rewriteForProductHelp(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  const reasonCode = "central_arbitrator_product_help_priority";
  const nextTurnFrame: TurnFrame = {
    ...input.turnFrame,
    direct_effects: [],
    tool_skill_intents: input.turnFrame.tool_skill_intents.filter((intent) =>
      intent.operation_type !== "prepare_attack_card" &&
      intent.operation_type !== "update_coach_preferences"
    ),
    tool_skill_opportunity: noneOpportunity(),
  };
  // Chantier 19 (2026-05-28) — Anti-contamination. Quand on bascule
  // vers product_help on doit aussi nettoyer la tempMemory de tout
  // brouillon de tool_skill (notamment update_coach_preferences) qui
  // pourrait subsister d'un tour précédent et polluer la réponse
  // produit. Voir A4-r6 T13 où la réponse "produit" reprenait mot pour
  // mot le draft de confirmation coach_preference.
  const nextTempMemory = clearToolSkillFlowEntries(input.tempMemory);
  return {
    changed: true,
    reasonCode,
    clearTargets: [],
    tempMemory: nextTempMemory,
    turnFrame: nextTurnFrame,
    routeDecision: {
      ...input.routeDecision,
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("status_only", reasonCode),
        blockedPath("tool_skill.prepare_attack_card", reasonCode),
        blockedPath("tool_skill.update_coach_preferences", reasonCode),
        blockedPath("tool_skill_flow", reasonCode),
      ],
    },
  };
}

/**
 * Chantier 19 (2026-05-28) — Helper qui supprime les marqueurs de flow
 * tool_skill dans la tempMemory (pending confirmation, intake, etc.).
 * Utilisé quand on bascule sur un chemin non-tool (product_help, recap)
 * pour éviter que les couches en aval relisent un brouillon obsolète.
 */
function clearToolSkillFlowEntries(tempMemory: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(tempMemory as any ?? {}) };
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  delete next.__pending_recommendation_operation;
  return next;
}

function rewriteForPendingAttackCardContinuation(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  const reasonCode = "central_arbitrator_pending_attack_card_continuation";
  const hasIntent = input.turnFrame.tool_skill_intents.some((intent) =>
    intent.operation_type === "prepare_attack_card"
  );
  const nextTurnFrame: TurnFrame = {
    ...input.turnFrame,
    direct_effects: [],
    tool_skill_intents: hasIntent
      ? input.turnFrame.tool_skill_intents
      : [
        ...input.turnFrame.tool_skill_intents,
        {
          operation_type: "prepare_attack_card",
          explicitness: "explicit",
          target_hint: input.userMessage,
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "update",
        },
      ],
    tool_skill_opportunity: noneOpportunity(),
  };
  return {
    changed: true,
    reasonCode,
    clearTargets: [],
    tempMemory: input.tempMemory,
    turnFrame: nextTurnFrame,
    routeDecision: {
      ...input.routeDecision,
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("product_help", reasonCode),
        blockedPath("status_only", reasonCode),
      ],
    },
  };
}

function rewriteForStatusOnly(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  const reasonCode = "central_arbitrator_status_exact_priority";
  const nextTempMemory = clearToolFlowMemory(input.tempMemory, [
    "active_tool",
    "recommendation",
  ]);
  const nextTurnFrame: TurnFrame = {
    ...input.turnFrame,
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: noneOpportunity(),
  };
  return {
    changed: true,
    reasonCode,
    clearTargets: ["active_tool", "recommendation"],
    tempMemory: nextTempMemory,
    turnFrame: nextTurnFrame,
    routeDecision: {
      ...input.routeDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("product_help", reasonCode),
        blockedPath("tool_skill_flow", reasonCode),
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// ARBITRAGE
// ---------------------------------------------------------------------------

export function arbitrateTurnIntent(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  if (input.routeDecision.response_owner === "safety") {
    return {
      routeDecision: input.routeDecision,
      turnFrame: input.turnFrame,
      tempMemory: input.tempMemory,
      changed: false,
      clearTargets: [],
    };
  }

  // GARDE ANTI-FAUX-POSITIF: si le message est une demande de carte
  // d'attaque structurée (verbe + "carte d'attaque" + marqueurs Action:/
  // Piège:/Signal:/Phrase:), aucun détecteur transitionnel ne doit la
  // hijacker. C'est le cas A6-r2 T2 qui a fait sauter detectsHumanRecap.
  // Tant qu'un détecteur transitionnel existe, ce garde-fou reste actif.
  if (looksLikeExplicitAttackCardRequest(input.userMessage)) {
    return {
      routeDecision: input.routeDecision,
      turnFrame: input.turnFrame,
      tempMemory: input.tempMemory,
      changed: false,
      clearTargets: [],
    };
  }

  const activeType = activeOperationType(input);
  const pendingType = pendingOperationType(input.pendingOperationConfirmation);
  const cancelsActive = detectsActiveToolCancellation(input.userMessage);
  const explicitReminder = detectsExplicitOneShotReminderCreate(
    input.userMessage,
  );

  if (explicitReminder && !input.safetyBlocksTools) {
    return rewriteForOneShotReminder(
      input,
      "central_arbitrator_one_shot_reminder_priority",
    );
  }

  if (cancelsActive && activeType && activeType !== pendingType) {
    return rewriteForNormalReply({
      input,
      reasonCode: "central_arbitrator_cancel_active_tool_flow",
      blockedPaths: [`tool_skill.${activeType}`, "tool_skill_flow"],
      clearTargets: ["active_tool", "recommendation"],
      removeToolIntents: [activeType, "prepare_attack_card"],
      removeDirectEffects: [],
    });
  }

  // Chantier 16 (2026-05-28): "pas les statuts système / sans les statuts"
  // est un opt-out explicite du status resolver. On force normal_reply
  // et on bloque les chemins status/preference/tool. Voir A2-r6 T9.
  if (detectsExplicitNoStatusRequest(input.userMessage)) {
    return rewriteForNormalReply({
      input,
      reasonCode: "central_arbitrator_explicit_no_status_request",
      blockedPaths: [
        "status_only",
        "tool_skill.update_coach_preferences",
        "tool_skill_flow",
      ],
      clearTargets: [],
      removeToolIntents: ["update_coach_preferences"],
      removeDirectEffects: [],
    });
  }

  // Chantier 10 (2026-05-28): un recap final ne doit JAMAIS être routé
  // vers update_coach_preferences (qui interpréterait le contenu du
  // récap comme une nouvelle préférence à écrire en DB). Le récap est
  // une lecture, pas une mutation. Voir A7-r2 T15.
  if (detectsRecapRequest(input.userMessage)) {
    return rewriteForNormalReply({
      input,
      reasonCode: "central_arbitrator_recap_request_priority",
      blockedPaths: [
        "tool_skill.update_coach_preferences",
        "tool_skill_flow",
      ],
      clearTargets: [],
      removeToolIntents: ["update_coach_preferences"],
      removeDirectEffects: [],
    });
  }

  // Chantier 11 (2026-05-28): l'ordre des détecteurs est critique. Une
  // question de statut multi-entité ("quelle carte / quels rappels /
  // quelle préf coach ?") matche aussi `detectsDurableCoachPreference`
  // (mots "préférence coach"), donc on doit évaluer le status multi-entité
  // AVANT coach_preference. Voir A4-r6 T10 où "Statut fiable sans rien
  // modifier : quelle carte / quels rappels / quelle préférence coach"
  // tombait à tort sur update_coach_preferences.
  if (detectsMultiEntityDurableStatus(input.userMessage)) {
    return rewriteForStatusOnly(input);
  }

  if (
    detectsDurableCoachPreference(input.userMessage) && !input.safetyBlocksTools
  ) {
    return rewriteForCoachPreference(input);
  }

  // Chantier 9 (2026-05-28): si un draft attack_card attend confirmation
  // et que le message est une correction de slot ("change la phrase en...",
  // "plutôt action: ..."), bloquer product_help / status et forcer le
  // retour vers tool_skill.prepare_attack_card. Voir A7-r2 T3.
  if (
    pendingType === "prepare_attack_card" &&
    looksLikeAttackCardSlotCorrection(input.userMessage)
  ) {
    return rewriteForPendingAttackCardContinuation(input);
  }
  if (
    activeType === "prepare_attack_card" &&
    looksLikeAttackCardSlotCorrection(input.userMessage) &&
    !cancelsActive
  ) {
    return rewriteForPendingAttackCardContinuation(input);
  }

  if (detectsExplicitProductHelp(input.userMessage)) {
    return rewriteForProductHelp(input);
  }

  if (detectsExactDurableStatus(input.userMessage)) {
    return rewriteForStatusOnly(input);
  }

  return {
    routeDecision: input.routeDecision,
    turnFrame: input.turnFrame,
    tempMemory: input.tempMemory,
    changed: false,
    clearTargets: [],
  };
}
