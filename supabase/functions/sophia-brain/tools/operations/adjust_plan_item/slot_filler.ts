import {
  generateWithGemini,
  getGeminiFallbackModel,
} from "../../../../_shared/gemini.ts";

declare const Deno: any;

/**
 * Projection of the AllowedAdjustmentSet that the slot filler prompt is
 * allowed to see. The AI uses this to constrain its proposals; it never
 * sees the raw plan snapshot for permission decisions.
 */
export type AdjustPlanSlotFillerAllowedCandidates = {
  scope_kind: "specific_plan_item" | "current_level" | "whole_plan";
  scope_plan_item_id: string | null;
  editable_items: Array<{
    plan_item_id: string;
    title: string;
    item_nature: string | null;
  }>;
  conditional_items: Array<
    { plan_item_id: string; title: string; requires: string }
  >;
  excluded_items: Array<{ plan_item_id: string; title: string; why: string }>;
  allowed_adjustment_types: string[];
  conditional_adjustment_types: Array<{ value: string; requires: string }>;
  forbidden_adjustment_types: string[];
};

export type AdjustPlanSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: unknown;
  operation_input?: Record<string, unknown> | null;
  allowed_candidates?: AdjustPlanSlotFillerAllowedCandidates | null;
};

export type AdjustPlanSlotFillerOutput = {
  current_sub_skill:
    | "scope_router"
    | "action_intake"
    | "level_intake"
    | "whole_plan_intake"
    | "draft_validation";
  fill_order: string[];
  state_patch: {
    target_granularity?: unknown;
    scope?: unknown;
    payload?: unknown;
    draft_validation?: unknown;
  };
  missing_slots: string[];
  confidence: "low" | "medium" | "high";
  next_question?: string | null;
  evidence?: string[];
};

export type AdjustPlanSlotFiller = (
  input: AdjustPlanSlotFillerInput,
) => Promise<AdjustPlanSlotFillerOutput | null>;

export type AdjustPlanQuestionWriterInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: unknown;
  operation_input?: Record<string, unknown> | null;
  missing_slots: string[];
  reason_code?: string | null;
  draft?: unknown;
};

export type AdjustPlanQuestionWriter = (
  input: AdjustPlanQuestionWriterInput,
) => Promise<string | null>;

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function shouldUseAdjustPlanAiSlotFiller(): boolean {
  return String(safeEnvGet("SOPHIA_ADJUST_PLAN_AI_SLOT_FILLING") ?? "")
    .trim() === "1";
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("adjust_plan_slots_not_json");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      end = index;
      break;
    }
  }
  if (end <= start) throw new Error("adjust_plan_slots_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adjust_plan_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeSlotFillerOutput(raw: unknown): AdjustPlanSlotFillerOutput {
  const root = parseJsonObject(raw);
  const subSkill = String(root.current_sub_skill ?? "").trim();
  const currentSubSkill = [
      "scope_router",
      "action_intake",
      "level_intake",
      "whole_plan_intake",
      "draft_validation",
    ].includes(subSkill)
    ? subSkill as AdjustPlanSlotFillerOutput["current_sub_skill"]
    : "scope_router";
  const confidenceRaw = String(root.confidence ?? "").trim();
  const confidence = confidenceRaw === "high" || confidenceRaw === "medium" ||
      confidenceRaw === "low"
    ? confidenceRaw
    : "low";
  const statePatch = root.state_patch && typeof root.state_patch === "object" &&
      !Array.isArray(root.state_patch)
    ? root.state_patch as AdjustPlanSlotFillerOutput["state_patch"]
    : {};
  if (
    !statePatch.draft_validation &&
    statePatch.payload &&
    typeof statePatch.payload === "object" &&
    !Array.isArray(statePatch.payload) &&
    (statePatch.payload as Record<string, unknown>).draft_validation &&
    typeof (statePatch.payload as Record<string, unknown>).draft_validation ===
      "object" &&
    !Array.isArray(
      (statePatch.payload as Record<string, unknown>).draft_validation,
    )
  ) {
    statePatch.draft_validation =
      (statePatch.payload as Record<string, unknown>).draft_validation;
  }
  if (
    !statePatch.draft_validation &&
    root.draft_validation &&
    typeof root.draft_validation === "object" &&
    !Array.isArray(root.draft_validation)
  ) {
    statePatch.draft_validation = root.draft_validation;
  }
  if (
    !statePatch.draft_validation &&
    root.draft_review_decision &&
    typeof root.draft_review_decision === "object" &&
    !Array.isArray(root.draft_review_decision)
  ) {
    statePatch.draft_validation = root.draft_review_decision;
  }
  if (
    !statePatch.draft_validation &&
    currentSubSkill === "draft_validation" &&
    typeof root.decision === "string"
  ) {
    statePatch.draft_validation = {
      decision: root.decision,
      confidence: root.confidence,
      evidence: root.evidence,
      apply_after_revision: root.apply_after_revision,
    };
  }
  return {
    current_sub_skill: currentSubSkill,
    fill_order: stringArray(root.fill_order),
    state_patch: statePatch,
    missing_slots: stringArray(root.missing_slots),
    confidence,
    next_question: root.next_question == null
      ? null
      : String(root.next_question).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillAdjustPlanSlotsWithAi(
  input: AdjustPlanSlotFillerInput,
): Promise<AdjustPlanSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill adjust_plan de Sophia.",
    "Tu ne réponds jamais au user directement. Tu remplis uniquement un JSON de progression.",
    "Le Tool Skill global suit cet ordre idéal:",
    "1 scope_router: identifier action précise vs niveau actuel vs plan global.",
    "2 action_intake, level_intake ou whole_plan_intake selon le scope.",
    "3 draft_generation: seulement quand les slots minimaux sont prêts.",
    "4 draft_validation: vérifier le brouillon avant confirmation utilisateur.",
    "Si operation_input.previous_draft existe, tu es deja dans le sous-skill draft_validation: dans le meme JSON, remplis state_patch.draft_validation.decision avec approve|reject|revise|explain|topic_change|unclear.",
    "Quand operation_input.previous_draft existe, current_sub_skill doit être exactement draft_validation, missing_slots doit être [], et state_patch.draft_validation doit toujours exister. Ne retourne jamais scope_router/action_intake/level_intake/whole_plan_intake dans ce cas.",
    "Dans draft_validation, approve veut dire que le user demande clairement d'appliquer/executer maintenant; reject refuse; revise corrige ou demande de reproposer; explain demande des details; topic_change sort du brouillon; unclear ne suffit pas.",
    "Dans draft_validation, si le user dit oui a une demande de preparer/montrer/reformuler le brouillon, ce n'est pas approve: c'est revise tant que l'application n'est pas explicitement demandee.",
    "Dans draft_validation, si le user ajoute une contrainte, corrige une action, corrige une formulation, précise ce qui ne doit pas changer, ou demande un brouillon final après ces précisions, classe revise.",
    "Dans draft_validation, explain est réservé aux demandes de détail sans nouvelle contrainte ni correction. Si le message contient à la fois demande de détails et nouvelle contrainte/correction, classe revise.",
    "Dans draft_validation, ne demande pas au user de répéter les deux changements si previous_draft contient déjà changed_items et que le user demande le brouillon final.",
    "Dans draft_validation, si le user donne une correction exacte puis dit d'appliquer, classe revise, mets state_patch.draft_validation.apply_after_revision=true, et ne demande pas de précision si la correction est complète.",
    "Dans draft_validation, si le user donne une formulation exacte, une question exacte, une phrase exacte ou une valeur à copier telle quelle, copie-la verbatim dans payload.constraints.values au format exact_text:<texte exact>, sans reformulation ni synonymes.",
    "Une contrainte exact_text est sacrée: elle doit survivre aux révisions de brouillon et remplacer toute ancienne formulation par défaut.",
    "Un seul message utilisateur peut remplir plusieurs slots. Ne repose jamais une question pour un slot déjà rempli.",
    "Quand current_state contient deja des slots identifies, conserve-les sauf correction explicite du user et remplis seulement ce qui manque.",
    "Quand operation_input.previous_draft existe, tu es en revision de brouillon: conserve le scope, la raison, le perimetre et les contraintes deja etablis sauf correction explicite. Ne repose jamais une question de contexte general deja couverte par le brouillon precedent.",
    "En revision de brouillon, si le user donne une correction exacte sur un changement concret (ex: formulation, horaire, frequence, action cible) et ne change pas le perimetre, ajoute cette correction aux constraints/affected_items et considere les slots minimaux comme remplis.",
    "En revision de brouillon, ne demande jamais pourquoi une formulation exacte aide si le user a déjà donné le texte exact et que le périmètre est clair.",
    'Scope rule forte: une demande de calme, d\'allegement, de rythme, de charge, de frequence ou de plusieurs actions sur cette semaine / deux prochaines semaines / quelques jours / temporairement relève du niveau actuel, pas du plan global, même si le user dit "tout le plan" ou "plan entier".',
    "Scope whole_plan est reserve aux changements structurels de trajectoire: objectif global, coherence du plan, prochaine etape, troisieme partie/phase future, ordre des phases, progression globale, duree globale, ou plan qui ne fait plus sens.",
    "Pour whole_plan_intake, classe toujours la demande dans payload.whole_plan_change_family.value avec une de ces familles: sequence_order_issue, missing_bridge_or_level, direction_change, success_criteria_change, future_phase_mismatch, style_or_method_mismatch, maintenance_or_consolidation_gap, global_capacity_change, value_preference_conflict, plan_no_longer_relevant, split_merge_restructure, diagnostic_unclear, cancel_or_reject.",
    "Pour whole_plan_intake, renseigne payload.candidate_operation: diagnostic_only, reorder, insert_phase, replace_phase, change_emphasis, change_success_criteria, pace_change, maintenance_layer, split_or_merge_phase, cancel_or_revise.",
    "Pour whole_plan_intake, renseigne payload.readiness: diagnose si la demande est vague et nécessite du coaching; draft_ready si le user donne une solution concrete; needs_confirmation si un brouillon précis existe; execute_after_confirmation uniquement après approbation explicite du brouillon courant.",
    "Si le user parle d'un niveau futur qui ne fait pas sens, classe future_phase_mismatch et readiness=diagnose sauf s'il donne déjà la correction concrète.",
    "Si le user demande d'ajouter un niveau ou une étape dans le plan global, classe missing_bridge_or_level et candidate_operation=insert_phase.",
    "Si le user dit que le plan ne va plus dans la bonne direction ou veut un autre axe, classe direction_change ou value_preference_conflict selon le cas.",
    "Si le user dit stop, annule, n'applique rien, ce n'est pas ça, hors sujet, classe cancel_or_reject et candidate_operation=cancel_or_revise.",
    "Si une demande de niveau deborde possiblement la fin du niveau courant, garde current_level et ajoute dans payload.constraints.values: level_boundary_note:appliquer l'allegement au niveau actuel; si la demande depasse la fin du niveau, garder ce repere pour le prochain niveau plutot que modifier la trajectoire globale.",
    "Si current_state.scope.kind vaut current_level ou whole_plan, ne retrograde jamais vers specific_plan_item seulement parce que le user cite une action: traite cette action comme affected_items/change_target dans le scope deja actif, sauf si le user dit explicitement qu'il ne parle plus que de cette action.",
    'Si le user dit seulement "signal de pause" ou demande que le signal soit plus court/simple/5 minutes, vise l\'action de mise en place du signal, par exemple "Convenir d\'un signal de pause". Ne vise "Faire le point sur le signal de pause" que si le user parle explicitement de bilan, faire le point, review, retour d\'experience ou evaluation.',
    "Pour action_intake, classe toujours la demande dans payload.action_request_category.value: feasibility_load=trop dur/long/cher en energie/intimidant; challenge_intensity=pas assez ambitieux ou besoin de plus d'impact; timing_duration=moment/duree/echeance/frequence/report; method_format=changer la maniere de faire sans changer le but; scope_focus=recentrer/reduire/elargir une partie; replacement_alternative=remplacer par autre chose; support_guardrail=ajouter aide, preparation, rappel, plan B ou securite emotionnelle.",
    "Pour level_intake, classe toujours la demande dans payload.level_request_category.value: pacing_workload=rythme/charge/densite/etalement; difficulty_progression=difficulte ou progression trop brutale/lente; sequence_priority=ordre/priorite/quoi faire d'abord; level_focus=changer le centre du niveau; action_mix=ajouter/retirer/remplacer/varier plusieurs actions; context_constraints=adapter a une contrainte temps/sante/voyage/travail/energie/budget/sociale; recovery_reset=reprendre apres retard/abandon/confusion/surcharge/perte de motivation.",
    "Les request_category action/level disent quel genre de demande user est exprimé. Elles ne remplacent jamais adjustment_type, reason_change, change_target, constraints ou affected_items.",
    "Pour action_intake, minimum: plan_item_id, adjustment_type, reason, desired effect/constraints si disponibles.",
    "Pour level_intake, minimum: reason_change, change_target, constraints, affected_items; le niveau ne doit pas toucher le plan global.",
    "Pour whole_plan_intake, minimum: reason_change, global change target, preserved intent, affected_items/impact examples si disponibles.",
    "Le plan_snapshot est la source de vérité pour interpréter les actions: status est l'état runtime en base, available_this_week/availability_status indiquent la disponibilité dans la semaine du niveau courant.",
    "Ne traite jamais status=active comme synonyme de 'action de cette semaine'. Pour parler de ce qui est accessible maintenant, utilise available_this_week=true ou availability_status=available_this_week.",
    "Pour déterminer si une action est ponctuelle ou récurrente, utilise item_nature, item_type, cadence_label, target_reps et week_scope. N'infère jamais 'quotidien', 'ponctuel' ou une fréquence si ces champs ne le disent pas.",
    "Si un item a item_nature=one_shot_mission ou dimension=missions, ne propose jamais de le transformer en action ponctuelle: il l'est déjà. Tu peux proposer de le déplacer, simplifier son exécution, l'associer à une habitude, ou changer son timing si le user le demande.",
    "Si un item a dimension=habits, kind=habit ou item_nature=recurring_habit, raisonne comme une habitude: la cadence, target_reps, scheduled_days et time_of_day décrivent le rythme réel. Ne transforme pas une préparation ponctuelle en remplacement de la cadence de l'habitude.",
    "Quand allowed_candidates est fourni, restreins-toi à ce qui y figure. editable_items est la liste autorisée pour affected_items. conditional_items demande une mention explicite du user. excluded_items doit rester en lecture seule (n'apparaît jamais dans affected_items). allowed_adjustment_types est la liste autorisée pour payload.adjustment_type.value. Si le user demande explicitement un adjustment_type conditionnel (pause, pause_level, change_goal, restart_plan), ajoute la contrainte signal correspondante dans payload.constraints.values: user_explicit_pause_request, user_explicit_replace_request, user_explicit_restart_request ou user_explicit_frequency_change.",
    "Quand le user parle seulement de surcharge, fatigue, trop lourd, trop de décisions ou trop de préparation, privilégie reduce_load/simplification/rebalance et demande quel levier concret alléger: préparation, décision, fréquence, nombre d'actions, timing, ou action à préserver.",
    "Quand le user parle seulement de surcharge, fatigue, trop lourd, trop de décisions ou trop de préparation, privilégie reduce_load/simplification/rebalance et demande quel levier concret alléger: préparation, décision, fréquence, nombre d'actions, timing, ou action à préserver.",
    "Si le user parle de fatigue décisionnelle, volonté le soir, choix trop tardif ou besoin d'automatiser, ne remplis pas change_target comme fréquence/cadence sauf demande explicite de changer le nombre de jours, le rythme ou les répétitions.",
    "Tous les slots de contenu doivent être dans state_patch.payload, jamais au niveau racine de state_patch. Utilise les valeurs enum du schema quand elles existent; si une nuance ne rentre pas dans l'enum, mets-la dans evidence/constraints mais garde status=identified.",
    "Toute contrainte exacte donnée par le user (durée, fréquence, action à protéger, action à toucher, horizon temporel) doit être copiée dans payload.constraints.values sous forme structurée.",
    "Si le scope est vague mais contient des indices qui dépassent une action isolée, privilégie current_level ou whole_plan selon les preuves.",
    "Si le user corrige une mauvaise proposition comme une carte, ajoute cette preuve dans negative_evidence/rejected_operations et continue adjust_plan au lieu de proposer une carte.",
    "Si des slots manquent, next_question doit être une question humaine ciblée uniquement sur le premier vrai trou restant, en s'appuyant sur les known slots. Ne génère jamais une question générique déjà répondue.",
    "Si les slots minimaux sont tous remplis et missing_slots=[], next_question doit être une courte validation de trajectoire générée par IA: elle résume les changements envisagés, dit que rien n'est encore appliqué, et demande si tu peux préparer la proposition concrète.",
    'Tu tutoies toujours l\'utilisateur dans next_question. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand next_question parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Retourne uniquement du JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_adjust_plan_tool_skill_slots",
    required_json_shape: {
      current_sub_skill:
        "scope_router|action_intake|level_intake|whole_plan_intake|draft_validation",
      fill_order: [
        "scope",
        "reason_change",
        "change_target",
        "constraints",
        "affected_items",
        "draft_generation",
        "draft_validation",
      ],
      state_patch: {
        target_granularity: {
          status: "missing|ambiguous|identified",
          value: "single_action|action_cluster|current_level|whole_plan",
          confidence: "low|medium|high",
          evidence: ["string"],
          negative_evidence: ["string"],
        },
        scope: {
          status: "missing|ambiguous|identified",
          kind: "specific_plan_item|current_level|whole_plan",
          plan_item_id: "string|null",
          label: "string|null",
          evidence: ["string"],
        },
        payload: {
          scope_kind: "specific_plan_item|current_level|whole_plan",
          action_request_category: {
            status: "missing|identified",
            value:
              "feasibility_load|challenge_intensity|timing_duration|method_format|scope_focus|replacement_alternative|support_guardrail",
            evidence: ["string"],
          },
          level_request_category: {
            status: "missing|identified",
            value:
              "pacing_workload|difficulty_progression|sequence_priority|level_focus|action_mix|context_constraints|recovery_reset",
            evidence: ["string"],
          },
          adjustment_type: "slot object",
          whole_plan_change_family: {
            status: "missing|identified",
            value:
              "sequence_order_issue|missing_bridge_or_level|direction_change|success_criteria_change|future_phase_mismatch|style_or_method_mismatch|maintenance_or_consolidation_gap|global_capacity_change|value_preference_conflict|plan_no_longer_relevant|split_merge_restructure|diagnostic_unclear|cancel_or_reject",
            evidence: ["string"],
          },
          candidate_operation:
            "diagnostic_only|reorder|insert_phase|replace_phase|change_emphasis|change_success_criteria|pace_change|maintenance_layer|split_or_merge_phase|cancel_or_revise|null",
          readiness:
            "diagnose|draft_ready|needs_confirmation|execute_after_confirmation|null",
          reason: "slot object",
          reason_change: "slot object for level/whole_plan",
          change_target: "slot object for level/whole_plan",
          constraints: {
            status: "missing|identified",
            values: ["string"],
            evidence: ["string"],
          },
          affected_items: {
            status: "missing|identified",
            values: ["plan item title or user label"],
            evidence: ["string"],
          },
        },
        rejected_operations: ["string"],
        draft_validation: {
          decision: "approve|reject|revise|explain|topic_change|unclear",
          confidence: "low|medium|high",
          evidence: ["string"],
          apply_after_revision: "boolean",
        },
        affected_items: [{
          label_from_user: "string",
          plan_item_id: "string|null",
          title: "string|null",
          requested_change: "string|null",
          confidence: "low|medium|high",
        }],
      },
      missing_slots: ["string"],
      confidence: "low|medium|high",
      next_question: "string|null",
      evidence: ["string"],
    },
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? null,
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    allowed_candidates: input.allowed_candidates ?? null,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.15,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGeminiFallbackModel("gemini-2.5-flash"),
      source: "adjust_plan.slot_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeSlotFillerOutput(raw);
}

export async function writeAdjustPlanNextQuestionWithAi(
  input: AdjustPlanQuestionWriterInput,
): Promise<string | null> {
  const systemPrompt = [
    "Tu es le writer interne du Tool Skill adjust_plan de Sophia.",
    "Tu écris uniquement le prochain message user-facing de Sophia, en français naturel.",
    "Tu ne remplis pas les slots et tu ne modifies pas le plan.",
    'Quand le message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Le message doit être court, humain, concret, et directement basé sur current_state, missing_slots, draft et plan_snapshot.",
    "Ne demande jamais une information déjà présente dans current_state, operation_input ou le dernier message utilisateur.",
    "Si le user a déjà donné la raison et la cible, demande seulement la précision réellement manquante.",
    "Ne propose pas de pause, mise de côté, suppression temporaire ou retrait comme option de clarification sauf si le user demande explicitement d'arrêter, suspendre, mettre de côté, faire une pause, ou retirer temporairement une action.",
    "Si le user n'a pas demandé de pause, n'utilise pas les expressions 'mettre de côté', 'enlever', 'retirer', 'suspendre', 'mettre en pause' ni leurs variantes dans la question.",
    "Si le user parle de fatigue/surcharge sans demander de pause, formule la question autour de l'allègement concret: quoi simplifier, quoi réduire, quoi garder intact, quel moment rendre plus facile.",
    "Si le user parle de fatigue décisionnelle ou de volonté le soir sans demander de changer le rythme, ne propose jamais de réduire la fréquence/cadence/nombre de jours de l'habitude dans la question.",
    "Ne propose jamais de raccourcir, réécrire ou modifier une clarification/exercice de décodage dans une question adjust_plan. Une clarification peut seulement être préservée ou servir de contexte.",
    "Pour le niveau grignotage ou un niveau équivalent, quand le problème est le choix du soir, les leviers de question autorisés sont: rendre l'habitude plus automatique sans changer sa cadence, simplifier l'environnement immédiat, changer le timing de décision, ou préserver certains items. N'ajoute pas une mission future/pending comme option sauf si le user l'a nommée.",
    "Si le problème est un brouillon trop abstrait, demande quelles actions concrètes toucher et comment, en citant les candidates du plan si elles sont disponibles.",
    "Si draft est null/absent et que missing_slots n'est pas vide, ne prétends jamais montrer un brouillon, un avant/après ou des changements précis. Pose seulement la question nécessaire pour générer le vrai brouillon ensuite.",
    "Si le user demande 'montre le brouillon' mais que draft est absent, réponds que tu dois d'abord verrouiller la dernière précision manquante, puis pose cette précision. Ne fabrique pas d'exemples de changements.",
    "Si le blocage vient d'une clarification ciblée comme modification, ne propose pas de la réécrire. Demande quelle habitude, mission ou action concrète doit être ajustée en utilisant cette clarification comme contexte.",
    "Si reason_code contient clarification_read_only, explique en langage naturel que la clarification sert de repère mais que l'ajustement doit porter sur une habitude, une mission ou une action concrète.",
    "Quand tu cites une habitude, respecte sa nature récurrente et ne parle pas comme si elle devenait une action ponctuelle sauf si le user demande explicitement de changer sa fréquence.",
    "Si reason_code indique une erreur de contrat du writer ou missing_slots contient draft_generation_retry_needed, ne propose pas de nouveaux changements et ne parle pas de version mini/pont. Explique en langage naturel que le brouillon doit être repris proprement, puis demande uniquement la précision concrète nécessaire pour le régénérer.",
    "Si le statut attendu est ask_question ou needs_clarification, ne pose jamais une question de validation oui/non. Demande la précision manquante. La validation utilisateur est gérée par un état pending_confirmation séparé.",
    "N'annonce jamais que le plan est modifié avant confirmation.",
    'Tu tutoies toujours l\'utilisateur. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    "Retourne uniquement du JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "write_adjust_plan_next_user_question",
    required_json_shape: {
      user_message: "string",
      rationale_for_internal_trace: "string",
    },
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? null,
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    missing_slots: input.missing_slots,
    reason_code: input.reason_code ?? null,
    draft: input.draft ?? null,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.35,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGeminiFallbackModel("gemini-2.5-flash"),
      source: "adjust_plan.question_writer",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  const parsed = parseJsonObject(raw);
  const message = String(parsed.user_message ?? "").trim();
  return message || null;
}
