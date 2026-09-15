import type { NoteInformation } from "./note_information.v1.ts";

export type ConfidenceBand = "low" | "medium" | "high" | "critical";
export type Explicitness = "explicit" | "implied" | "weak";
export type Ambiguity =
  | "none"
  | "target_ambiguous"
  | "intent_ambiguous"
  | "both";
export type RiskBand = "none" | "low" | "medium" | "high" | "critical";
export type Intensity = "none" | "low" | "medium" | "high";

export type ConversationChannel = "web" | "whatsapp";

/**
 * Durable effects a turn may request.
 *
 * W4.3 opened this union to the two KEEL fact-writers. They are NOT a new
 * genre: `log_protocol_event` and `declare_deviation` write FACTS
 * (`protocol_events`, `planned_deviations`) exactly as
 * `track_progress_plan_item` does, so they inherit the whole doctrinal chain
 * unchanged — contract -> gate (default-deny, safety blocks at band >= medium)
 * -> executor (write-through) -> ledger -> renderer (never acknowledges
 * without a committed effect).
 *
 * The gate rule was written in W3.3, BEFORE these two values existed
 * (`routers/direct_effect_gate.ts`, exemption list closed). Adding a value
 * here therefore blocks it in crisis by construction; it never has to be
 * remembered. `routers/direct_effect_gate_keel_test.ts` pins that property.
 */
export type DirectEffectType =
  | "create_one_shot_reminder"
  | "track_progress_plan_item"
  | "log_protocol_event"
  | "declare_deviation"
  // QA agent 4 — l'écrivain manquant de `student_safety_constraints` (6
  // lecteurs armés, 0 écrivain avant ce lot).
  | "declare_safety_constraint";

export type DirectEffectTimeContext = {
  now_utc: string;
  user_timezone: string;
  user_locale: string;
  user_local_datetime: string;
  user_local_human: string;
  /**
   * LES 8 PROCHAINS JOURS CIVILS DE L'ÉLÈVE, déjà résolus — aujourd'hui inclus.
   *
   * Chaque entrée porte sa date ISO et son nom dans la locale de l'élève ET en
   * anglais, parce qu'un élève `fr-FR` écrit parfois « Thursday ».
   *
   * Existe pour que « jeudi » soit une LECTURE et non un calcul. Sans elle, le
   * modèle n'avait le jour courant que dans la prose de `user_local_human` :
   * mesuré un JEUDI, « jeudi soir » ressortait en 2026-08-07 (vendredi) une
   * passe sur deux. Un décalage de +1 jour écrit l'effet sur le mauvais jour.
   *
   * Optionnel: un contexte temporel construit avant ce champ reste valide, et
   * une timezone illisible rend un tableau vide plutôt que de faire tomber le
   * tour. Absent ⇒ le modèle retombe sur `user_local_human`, comme avant.
   */
  named_day_calendar?: Array<{
    iso: string;
    offset: number;
    names: string[];
  }>;
};

export type SkillSignal = {
  detected: boolean;
  confidence_band: ConfidenceBand;
  score?: number;
  reason?: string;
};

// Demolition B2C (2026-08-06): les types du signal `coaching_recommendation`
// partent avec la lane.

export type FeatureOpportunityKind =
  | "initiatives"
  | "coach_preferences";

export type FeatureOpportunitySignalContext = {
  feature: FeatureOpportunityKind;
  opportunity_kind:
    | "recurring_context"
    | "ritual_or_initiative"
    | "coach_style_feedback"
    | "coach_interaction_preference";
  trigger_context?: string | null;
  user_problem_summary: string;
  priority_reason: string;
};

// KEEL W4.4 — flow léger `plan_question`: le student pose une question
// D'EXÉCUTION à l'intérieur du plan (« je peux remplacer le riz par des
// pâtes ? », « je suis au resto », « j'ai décalé le déjeuner »). Distinct de
// `plan_realignment`, qui est une lane de DÉCROCHAGE (le plan ne tient plus et
// doit changer). Le contexte porte les deux slugs `food_groups` bruts: le
// resolver Tier 0 les parse fail-loud et n'en devine JAMAIS un.
export type PlanQuestionKind =
  | "food_swap"
  | "eating_out"
  | "meal_shifted"
  | "other";

export type PlanQuestionSignalContext = {
  kind: PlanQuestionKind;
  /** Slug `food_groups` que l'élève veut MANGER À LA PLACE. Brut, non validé. */
  requested_food_group?: string | null;
  /** Slug `food_groups` prescrit, tel que l'élève le nomme. Brut, non validé. */
  prescribed_food_group?: string | null;
  /** Créneau visé (`slot_vocabulary`), quand l'élève le nomme. Brut. */
  slot_hint?: string | null;
  reason: string;
};

/**
 * LE RETOUR SUR UNE LIGNE DU PLAN — lot 4A du chantier « mémoire structurée ».
 *
 * ⚠️ CE TYPE N'EST PAS NEUF: il porte, champ pour champ, celui que
 * `router/dispatcher.ts` déclarait déjà pour `DispatcherSignals.plan_feedback`
 * — et ce dernier l'IMPORTE désormais d'ici au lieu de le recopier. Il n'existe
 * donc qu'UNE définition. Motif, et c'est la cicatrice §7.4 du contrat de
 * phase 0: « une clé déclarée deux fois que rien ne relie » laissait 86 tests
 * verts pendant que l'écriture partait dans une clé que plus personne ne lisait.
 *
 * ⛔ CE SIGNAL NE ROUTE RIEN. `routers/routers.ts` ne lit que `plan_question`
 * pour choisir un `response_owner`; celui-ci est PASSIF — il informe le tour,
 * il ne le possède jamais. C'est voulu: le retour de sizing doit pouvoir sortir
 * PAR-DESSUS la lane qui a parlé, pas à sa place.
 *
 * ⚠️ `kind` EST UNE CHAÎNE LIBRE ET RESTE BRUTE ICI. La liste fermée qui décide
 * si le tour parle d'une PART vit dans `_shared/keel/conversation_redirect.ts`
 * (`SIZING_FEEDBACK_KINDS`), avec la phrase de renvoi qu'elle arme. La valider
 * ici ferait un second juge, et le jour où la liste bougerait un seul des deux
 * suivrait.
 */
export type DispatcherPlanFeedbackSignal = {
  detected: boolean;
  /** Brut. La liste fermée qui MORD est `SIZING_FEEDBACK_KINDS`. */
  kind?: string | null;
  confidence?: number;
  target_item_id?: string | null;
  target_title?: string | null;
  detail?: string | null;
  sentiment?: string | null;
};

/**
 * LA PERSONNE DIT, DANS LE CHAT, UNE CHOSE QUI APPARTIENT À UN CHAMP — lot M1
 * du chantier « mémoire ».
 *
 * ⛔ CE SIGNAL N'ÉCRIT RIEN, ET C'EST TOUT SON POINT. Depuis M1, la ligne ③ de
 * la matrice (`retained_item.ts`) est VIDE: la conversation ne produit plus
 * aucun `RetainedItem`. Ce signal ne remplace pas le producteur retiré — il
 * arme une **phrase de renvoi** vers l'écran où la chose se pose
 * (`_shared/keel/conversation_redirect.ts`). Le jour où quelqu'un voudra lui
 * faire écrire quelque chose, c'est la matrice qu'il faudra rouvrir, en
 * connaissance de cause, pas ce champ.
 *
 * ⛔ IL NE ROUTE RIEN NON PLUS. Comme `plan_feedback`, il est PASSIF: il informe
 * le tour, il ne le possède jamais. Le renvoi sort PAR-DESSUS la lane qui a
 * parlé, pas à sa place.
 *
 * ⚠️ `kind` EST UNE CHAÎNE LIBRE ET RESTE BRUTE ICI. La liste fermée qui décide
 * de la destination vit dans `conversation_redirect.ts`
 * (`PROFILE_REDIRECT_KINDS`), avec les phrases qu'elle arme. La valider ici
 * ferait un second juge, et le jour où la liste bougerait un seul des deux
 * suivrait.
 */
export type DispatcherProfileStatementSignal = {
  detected: boolean;
  /** Brut. La liste fermée qui MORD est `PROFILE_REDIRECT_KINDS`. */
  kind?: string | null;
  confidence?: number;
  detail?: string | null;
};

/**
 * LA PERSONNE DEMANDE POURQUOI QUELQUE CHOSE N'APPARAÎT JAMAIS — lot M6.
 *
 * ⛔ LA QUESTION EST LE SIGNAL. *« Une exclusion qu'on interroge est une
 * exclusion morte »*: personne ne demande pourquoi il n'y a jamais de ce qu'il
 * ne veut pas.
 *
 * ⛔ ET IL N'ÉCRIT RIEN NON PLUS. Le runtime RETROUVE la règle, la CITE, et dit
 * OÙ elle se lève. Le §2.8 tranche « le chat n'écrit jamais, pas même en un
 * tap », avec la raison qui décide: *« s'il peut écrire une allergie en un tap,
 * pourquoi pas un aliment évité ? »*.
 *
 * ⚠️ `food` EST LE MOT DE LA PERSONNE, BRUT. Jamais un slug: la recherche se
 * fait par `findForbiddenMatches` contre les lignes STOCKÉES, et c'est ce
 * moteur qui fait que « lait » ne matche pas dans « laitue ».
 */
export type DispatcherRuleQuestionSignal = {
  detected: boolean;
  /** Brut, dans ses mots. Le juge est `rulesMentioning` (`rule_question.ts`). */
  food?: string | null;
};

export type DispatcherSkillSignals = {
  // W2.A: `feature_opportunity` (initiatives / coach_preferences) est retiré
  // du contrat de signaux — la lane n'est plus routable. Le type de contexte
  // `FeatureOpportunitySignalContext` reste défini ci-dessus tant que le skill
  // existe en code (supprimé en W2.B).
  // W4.4 — KEEL only. La lane ne s'ouvre que pour un `keel_role='student'`
  // (routers.ts gate sur `keel_student`): sans commitments il n'y a rien à
  // résoudre, et le legacy n'a ni swap_policy ni food_groups.
  plan_question?: SkillSignal & {
    context?: PlanQuestionSignalContext;
  };
  // LOT 4A — l'écrivain qui manquait. Le renvoi du sizing est câblé, testé et
  // bilingue depuis le lot 2C, et il ne pouvait JAMAIS partir: rien ne mettait
  // `plan_feedback.detected` à `true`. Ce champ est la porte d'entrée du
  // modèle vers ce signal.
  plan_feedback?: DispatcherPlanFeedbackSignal;
  // LOT M1 — la porte d'entrée du modèle vers le renvoi vers un champ. Elle
  // suit `keel_student`, comme `plan_feedback`: hors élève KEEL, les quatre
  // destinations n'existent pas.
  profile_statement?: DispatcherProfileStatementSignal;
  // LOT M6 — la porte d'entrée du modèle vers la révocation par la question.
  rule_question?: DispatcherRuleQuestionSignal;
};

export type DispatcherMemoryTargetType =
  | "topic"
  | "event"
  | "action"
  | "level"
  | "entity"
  | "runtime_snapshot"
  | "domain_key"
  | "domain_prefix";

export type DispatcherMemoryRetrievalPolicy =
  | "force_taxonomy"
  | "taxonomy_first"
  | "semantic_first"
  | "semantic_only";

export type DispatcherMemoryPlan = {
  // Dispatcher output only. The dispatcher plans what memory/context is needed;
  // context/loader.ts is responsible for materializing it.
  response_intent?: string;
  reasoning_complexity?: "low" | "medium" | "high";
  context_need: "minimal" | "targeted" | "broad" | "dossier";
  memory_mode: "none" | "light" | "broad" | "dossier";
  model_tier_hint?: "lite" | "standard" | "deep";
  context_budget_tier: "tiny" | "small" | "medium" | "large";
  targets: Array<{
    type: DispatcherMemoryTargetType;
    key: string;
    query_hint?: string | null;
    expansion_policy?: string | null;
    retrieval_policy?: DispatcherMemoryRetrievalPolicy | null;
    priority?: "low" | "medium" | "high" | null;
    entity_type?: string | null;
  }>;
  retrieval_policy: DispatcherMemoryRetrievalPolicy;
  plan_confidence?: number;
};

export type DispatcherActionReference = {
  detected: boolean;
  status: "none" | "identified" | "ambiguous" | "family_only";
  plan_item_id?: string | null;
  action_title?: string | null;
  action_family_key?: string | null;
  action_type?: "habit" | "mission" | "clarification" | "other" | null;
  expansion_policy?:
    | "exact_action_only"
    | "exact_then_action_family_recent"
    | "none"
    | null;
  reason?: string | null;
};

export type DispatcherLevelReference = {
  detected: boolean;
  status: "none" | "current_level" | "previous_level" | "transition" | "global";
  level_id?: string | null;
  transformation_id?: string | null;
  expansion_policy?: "include_level_execution_handoff" | "none" | null;
  reason?: string | null;
};

export type DispatcherResearchSignal = {
  detected: boolean;
  value?: boolean;
  query?: string | null;
  domain_hint?: string | null;
  confidence?: number;
  reason?: string | null;
};

export type ConversationRiskMatrixRow = {
  signal:
    | "system_misunderstanding"
    | "explicit_stop_or_abandon"
    | "anger_or_profanity"
    | "repetition_or_correction"
    | "typographic_intensity"
    | "active_flow_pressure"
    | "previous_risk";
  detected: boolean;
  weight: number;
  contribution: number;
  evidence?: string | null;
};

export type ConversationRisk = {
  score: number;
  threshold: number;
  should_exit_flows: boolean;
  reason_codes: string[];
  previous_scores: number[];
  matrix: ConversationRiskMatrixRow[];
  context_summary: string | null;
};

export type TurnFrame = {
  turn_id: string;
  source_message_id: string;
  user_id: string;
  channel: ConversationChannel;

  safety: {
    risk_band: RiskBand;
    reason_codes: string[];
    evidence: string[];
  };

  conversation_risk?: ConversationRisk;

  confirmation_response?: {
    kind: "yes" | "no" | "correction_to_pending" | "topic_change" | "unknown";
    confidence_band: ConfidenceBand;
  };

  direct_effects: Array<{
    effect_type: DirectEffectType;
    explicitness: Explicitness;
    target_status: "identified" | "ambiguous" | "missing";
    confidence_band: ConfidenceBand;
    payload_hint: Record<string, unknown>;
  }>;

  direct_effect_time_context?: DirectEffectTimeContext;

  note_information?: NoteInformation | null;

  skill_signals: DispatcherSkillSignals;

  // P1-2 (ALEX-CPR-B04 / EVA-CPR-B03): contrainte de STYLE session formulée
  // court, ancrée sur les mots du user (« réponses plus courtes le soir »,
  // « pas de technique »). Champ RACINE (pas dans skill_signals: un signal
  // non-detected est droppé par la normalisation, or la contrainte de style
  // arrive souvent sans vraie opportunité produit). Le runtime l'installe en
  // `__session_style_commitments` (temp_memory, session only, jamais une
  // préférence durable — BF-PREF-01). Null sinon.
  session_style_commitment_hint?: string | null;

  needs_research?: DispatcherResearchSignal;

  action_reference?: DispatcherActionReference;
  level_reference?: DispatcherLevelReference;

  // Memory boundary: dispatcher produces this plan, but never loads or writes
  // durable memory. Skills consume the LoadedContext produced from this plan.
  memory_plan: DispatcherMemoryPlan;
};
