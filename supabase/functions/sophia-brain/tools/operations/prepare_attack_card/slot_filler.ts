import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { ATTACK_TECHNIQUES, type AttackTechniqueKey } from "./generator.ts";
import {
  normalizePrepareAttackCardConstraints,
  normalizePrepareAttackCardUserIntent,
  type PrepareAttackCardConstraint,
  type PrepareAttackCardUserIntent,
} from "./contract.ts";
import type {
  AttackCardConfidence,
  AttackCardIntakeState,
  AttackCardStep,
} from "./workflow.ts";

export type AttackCardSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  plan_snapshot?: unknown;
  current_state?: AttackCardIntakeState | null;
  operation_input?: Record<string, unknown> | null;
};

export type AttackCardSlotFillerOutput = {
  current_step: AttackCardStep;
  user_intent?: PrepareAttackCardUserIntent;
  constraints?: PrepareAttackCardConstraint[];
  state_patch: Partial<AttackCardIntakeState>;
  draft_review_decision?: {
    decision:
      | "approve"
      | "reject"
      | "revise"
      | "explain"
      | "topic_change"
      | "unclear";
    confidence: AttackCardConfidence;
    evidence: string[];
  };
  missing_slots: string[];
  confidence: AttackCardConfidence;
  generated_user_message?: string | null;
  evidence?: string[];
};

export type AttackCardSlotFiller = (
  input: AttackCardSlotFillerInput,
) => Promise<AttackCardSlotFillerOutput | null>;

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
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("attack_card_slots_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("attack_card_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): AttackCardConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function step(value: unknown): AttackCardStep {
  const raw = String(value ?? "").trim();
  return [
      "target_intake",
      "technique_selection",
      "keyword_intake",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as AttackCardStep
    : "target_intake";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeTechnique(value: unknown): AttackTechniqueKey | null {
  const raw = String(value ?? "").trim();
  if (raw in ATTACK_TECHNIQUES) return raw as AttackTechniqueKey;
  const normalized = normalizeFitText(raw).replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return null;
  for (const [key, definition] of Object.entries(ATTACK_TECHNIQUES)) {
    const title = normalizeFitText(definition.title).replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (title === normalized) return key as AttackTechniqueKey;
  }
  return null;
}

function normalizeTechniqueOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: any) => {
    const technique = normalizeTechnique(entry?.technique_key);
    if (!technique) return [];
    return [{
      technique_key: technique,
      title: String(entry?.title ?? ATTACK_TECHNIQUES[technique].title),
      description: String(
        entry?.description ?? ATTACK_TECHNIQUES[technique].pour_quoi,
      ),
      reason: String(entry?.reason ?? "").trim(),
      example: String(entry?.example ?? ATTACK_TECHNIQUES[technique].example),
      recommended: Boolean(entry?.recommended),
    }];
  }).slice(0, 3);
}

function normalizeFitText(value: string): string {
  return value.toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ");
}

function isPreEngagementFitText(text: string): boolean {
  return /\b(mot de bascule|mot-cle|mot cle|keyword|bascule)\b/.test(text) ||
    /\b(craquer|je vais craquer|impulsion|impulsif|compulsion|rechute|me controler|me contrôler|perdre le controle|perdre le contrôle|envie irresistible|envie irrépressible|reaction automatique|réaction automatique)\b/
      .test(text) ||
    /\b(abandonner|esquiver|fuir)\b/.test(text) &&
      /\b(moment fragile|sur le moment|a chaud|à chaud|quand ca monte|quand ça monte)\b/
        .test(text);
}

function isExecutionStartBlockerText(text: string): boolean {
  const actionSignal =
    /\b(action|mission|dossier|compte rendu|relire|ecrire|écrire|ouvrir|commencer|demarrer|démarrer|me lancer|premier pas|trois puces|3 puces)\b/
      .test(text);
  const blockerSignal =
    /\b(perfection|parfait|comprendre parfaitement|tout comprendre|attendre d avoir tout compris|avant d ecrire|avant d écrire|tourner autour|procrastin|blocage|bloquer|flou|pas clair|trop gros|friction)\b/
      .test(text);
  return actionSignal && blockerSignal;
}

function techniqueOption(
  technique: AttackTechniqueKey,
  reason: string,
  recommended: boolean,
) {
  const definition = ATTACK_TECHNIQUES[technique];
  return {
    technique_key: technique,
    title: definition.title,
    description: definition.pour_quoi,
    reason,
    example: definition.example,
    recommended,
  };
}

export function refineAttackCardTechniqueFit(
  output: AttackCardSlotFillerOutput,
  input: Pick<AttackCardSlotFillerInput, "message" | "recent_messages">,
): AttackCardSlotFillerOutput {
  const patch = output.state_patch;
  const technique = patch.technique;
  if (!technique) return output;
  const evidenceText = [
    input.message,
    ...(input.recent_messages ?? []).map((turn) => turn.content),
    ...(technique.evidence ?? []),
    ...(patch.target?.status === "identified" ? [patch.target.title] : []),
    ...((patch.blocker as any)?.evidence ?? []),
  ].join("\n");
  const normalized = normalizeFitText(evidenceText);
  const isPreEngagementFit = isPreEngagementFitText(normalized);
  const isExecutionStartBlocker = isExecutionStartBlockerText(normalized) ||
    [
      "avoidance",
      "procrastination",
      "action_too_heavy",
      "unclear_first_step",
      "friction",
    ]
      .includes(String((patch.blocker as any)?.type ?? ""));
  if (!isExecutionStartBlocker || isPreEngagementFit) return output;

  let changed = false;
  const existing = (technique.options ?? []).filter((option) => {
    if (option.technique_key !== "pre_engagement") return true;
    changed = true;
    return false;
  });
  const optionKeys = new Set(existing.map((option) => option.technique_key));
  if (!optionKeys.has("texte_recadrage")) {
    existing.unshift(techniqueOption(
      "texte_recadrage",
      "Pour recadrer le besoin de tout comprendre avant de produire.",
      true,
    ));
    changed = true;
  }
  if (!optionKeys.has("ancre_visuelle")) {
    existing.push(techniqueOption(
      "ancre_visuelle",
      "Pour transformer l'environnement en signal concret de depart.",
      false,
    ));
    changed = true;
  }
  const nextTechnique = { ...technique, options: existing.slice(0, 3) };
  if (technique.value === "pre_engagement" && !technique.explicitly_requested) {
    nextTechnique.status = "ambiguous";
    nextTechnique.value = null;
    nextTechnique.confidence = "medium";
    nextTechnique.fit_warning =
      "Mot de bascule est reserve aux moments d'impulsion ou de risque de craquer; ici le besoin ressemble plutot a un demarrage d'action.";
    changed = true;
  }
  const generatedMentionsMot = /mot de bascule/i.test(
    output.generated_user_message ?? "",
  ) || /mot de bascule/i.test(patch.generated_user_message ?? "");
  const nextMessage = changed || generatedMentionsMot
    ? "Pour ce blocage de demarrage, je te propose deux options: 'Le texte magique' pour recadrer le perfectionnisme, ou 'Ancre visuelle' pour avoir un signal concret de depart. Laquelle te semble la plus utile ?"
    : output.generated_user_message;
  return {
    ...output,
    state_patch: {
      ...patch,
      technique: nextTechnique,
      generated_user_message: nextMessage ?? patch.generated_user_message,
    },
    generated_user_message: nextMessage ?? output.generated_user_message,
  };
}

// CHANTIER C8 (2026-05-28) — Mapping lexical d'un titre de technique EXPLICITE
// vers sa clé enum. Ce ne sont PAS des heuristiques d'intention (anti-pattern
// L3) : ce sont les noms de produit exacts des techniques. Quand l'utilisateur
// nomme lui-même la technique ("ancre visuelle", "mot de bascule", …), le code
// doit la verrouiller, pas laisser le LLM en déduire une autre. Voir A2-codex-r7
// T5/T7 où "Technique: ancre visuelle" finissait en "Mot de bascule" (le LLM
// avait interprété le post-it 'payé fermé' comme un mot de bascule).
const EXPLICIT_TECHNIQUE_TITLE_PATTERNS: Array<
  { key: AttackTechniqueKey; pattern: RegExp }
> = [
  { key: "ancre_visuelle", pattern: /\bancre\s+visuelle\b/ },
  { key: "pre_engagement", pattern: /\bmot\s+de\s+bascule\b/ },
  { key: "texte_recadrage", pattern: /\b(le\s+)?texte\s+magique\b/ },
  { key: "mantra_force", pattern: /\bmantra\s+de\s+force\b/ },
  { key: "preparer_terrain", pattern: /\bpreparer\s+le\s+terrain\b/ },
  {
    key: "visualisation_matinale",
    pattern: /\b(meditation\s+de\s+5\s+minutes|visualisation\s+matinale)\b/,
  },
];

export function detectExplicitlyNamedTechnique(
  message: string,
): AttackTechniqueKey | null {
  const text = normalizeFitText(message ?? "");
  for (const { key, pattern } of EXPLICIT_TECHNIQUE_TITLE_PATTERNS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

export function enforceExplicitTechniqueRequest(
  output: AttackCardSlotFillerOutput,
  input: Pick<AttackCardSlotFillerInput, "message">,
): AttackCardSlotFillerOutput {
  const requested = detectExplicitlyNamedTechnique(input.message ?? "");
  if (!requested) return output;
  const patch = output.state_patch;
  const current = patch.technique;
  if (current?.value === requested && current?.explicitly_requested === true) {
    return output;
  }
  const nextTechnique = {
    status: "identified" as const,
    value: requested,
    explicitly_requested: true,
    fit_warning: null,
    options: [],
    confidence: "high" as const,
    evidence: [
      ...(current?.evidence ?? []),
      `user_explicit_technique:${requested}`,
    ],
  };
  const nextMissing = (patch.missing_slots ?? output.missing_slots ?? [])
    .filter((slot) => slot !== "technique");
  return {
    ...output,
    state_patch: {
      ...patch,
      technique: nextTechnique,
      missing_slots: nextMissing,
    },
    missing_slots: nextMissing,
  };
}

function normalizeStatePatch(value: unknown): Partial<AttackCardIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<AttackCardIntakeState> = {};
  const target = objectValue(root.target);
  if (target) {
    const status = target.status === "identified" ||
        target.status === "missing" || target.status === "ambiguous"
      ? target.status
      : "missing";
    patch.target = status === "identified"
      ? {
        status,
        kind: target.kind === "personal_action"
          ? "personal_action"
          : "plan_item",
        plan_item_id: target.plan_item_id == null
          ? null
          : String(target.plan_item_id),
        title: String(target.title ?? "").trim(),
        confidence: confidence(target.confidence),
        evidence: stringArray(target.evidence),
      }
      : {
        status,
        kind: "unknown",
        candidates: Array.isArray(target.candidates)
          ? target.candidates.flatMap((candidate: any) => {
            const id = String(candidate?.plan_item_id ?? "").trim();
            const title = String(candidate?.title ?? "").trim();
            if (!id || !title) return [];
            return [{
              kind: "plan_item" as const,
              plan_item_id: id,
              title,
              confidence: Number(candidate?.confidence ?? 0),
              evidence: stringArray(candidate?.evidence),
            }];
          }).slice(0, 4)
          : undefined,
        confidence: confidence(target.confidence),
        evidence: stringArray(target.evidence),
      };
  }
  const technique = objectValue(root.technique);
  if (technique) {
    const status = technique.status === "identified" ||
        technique.status === "missing" || technique.status === "ambiguous"
      ? technique.status
      : "missing";
    patch.technique = {
      status,
      value: normalizeTechnique(technique.value),
      explicitly_requested: Boolean(technique.explicitly_requested),
      fit_warning: technique.fit_warning == null
        ? null
        : String(technique.fit_warning).trim() || null,
      options: normalizeTechniqueOptions(technique.options),
      confidence: confidence(technique.confidence),
      evidence: stringArray(technique.evidence),
    };
  }
  const activationKeyword = objectValue(root.activation_keyword);
  if (activationKeyword) {
    const status = [
        "not_applicable",
        "missing",
        "ambiguous",
        "identified",
      ].includes(String(activationKeyword.status ?? ""))
      ? String(activationKeyword.status) as
        | "not_applicable"
        | "missing"
        | "ambiguous"
        | "identified"
      : "missing";
    patch.activation_keyword = {
      status,
      value: activationKeyword.value == null
        ? null
        : String(activationKeyword.value).trim() || null,
      options: stringArray(activationKeyword.options).slice(0, 3),
      rejected_value: activationKeyword.rejected_value == null
        ? null
        : String(activationKeyword.rejected_value).trim() || null,
      confidence: confidence(activationKeyword.confidence),
      evidence: stringArray(activationKeyword.evidence),
    };
  }
  const blocker = objectValue(root.blocker);
  if (blocker) {
    const blockerType = String(blocker.type ?? "");
    patch.blocker = {
      type: [
          "avoidance",
          "procrastination",
          "action_too_heavy",
          "unclear_first_step",
          "low_energy",
          "friction",
          "mixed",
        ].includes(blockerType)
        ? blockerType as any
        : "mixed",
      confidence: Math.max(0, Math.min(1, Number(blocker.confidence ?? 0.5))),
      evidence: stringArray(blocker.evidence),
    };
  }
  if (Array.isArray(root.constraints)) {
    patch.constraints = normalizePrepareAttackCardConstraints(
      root.constraints,
    );
  }
  patch.user_intent = normalizePrepareAttackCardUserIntent(root.user_intent);
  if (Array.isArray(root.missing_slots)) {
    patch.missing_slots = stringArray(root.missing_slots);
  }
  patch.generated_user_message = root.generated_user_message == null
    ? undefined
    : String(root.generated_user_message).trim() || null;
  patch.confidence = confidence(root.confidence);
  patch.current_step = step(root.current_step);
  return patch;
}

function normalizeDraftReviewDecision(
  value: unknown,
): AttackCardSlotFillerOutput[
  "draft_review_decision"
] {
  const root = objectValue(value);
  if (!root) return undefined;
  const rawDecision = String(root.decision ?? "").trim();
  const decision = [
      "approve",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "unclear",
    ].includes(rawDecision)
    ? rawDecision as NonNullable<
      AttackCardSlotFillerOutput["draft_review_decision"]
    >["decision"]
    : "unclear";
  return {
    decision,
    confidence: confidence(root.confidence),
    evidence: stringArray(root.evidence),
  };
}

export function normalizeAttackCardSlotFillerOutput(
  raw: unknown,
): AttackCardSlotFillerOutput {
  const root = parseJsonObject(raw);
  return {
    current_step: step(root.current_step),
    user_intent: normalizePrepareAttackCardUserIntent(root.user_intent),
    constraints: normalizePrepareAttackCardConstraints(
      root.constraints ?? objectValue(root.state_patch)?.constraints,
    ),
    state_patch: normalizeStatePatch(root.state_patch),
    draft_review_decision: normalizeDraftReviewDecision(
      objectValue(root.state_patch)?.draft_validation,
    ),
    missing_slots: stringArray(root.missing_slots),
    confidence: confidence(root.confidence),
    generated_user_message: root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillAttackCardSlotsWithAi(
  input: AttackCardSlotFillerInput,
): Promise<AttackCardSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill prepare_attack_card de Sophia.",
    "Tu ne réponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: la compréhension du message user est ici, dans ce JSON. Le code ne fera pas de regex ni de fallback métier.",
    "Tu dois identifier ou mettre a jour: user_intent global, contraintes, cible, technique, mot de bascule si applicable, blocker, slots manquants, message court a envoyer au user.",
    "user_intent vaut draft_only si le user demande un brouillon, une proposition ou un affichage sans création; create seulement s'il demande clairement de créer/appliquer maintenant, mais ce flow reste non-mutant côté chat; cancel/reject s'il refuse; revise s'il corrige; explain s'il demande pourquoi/comment ou veut qu'on répète quoi mettre; status_question pour une question produit/statut; topic_change pour une sortie vers un autre sujet; clarify si une précision est demandée; unknown sinon.",
    "Les contraintes no_create/draft_only doivent être explicites dès que le user dit sans créer, pas encore, montre/affiche le brouillon, draft only, ou demande seulement une proposition.",
    "Si operation_input.previous_draft existe, tu es dans le sous-skill draft_validation: dans le meme JSON, remplis state_patch.draft_validation.decision avec approve|reject|revise|explain|topic_change|unclear.",
    "Dans draft_validation, approve veut dire que le user tente clairement d'appliquer/creer la carte maintenant; le router le transformera en apply_attempt non-mutant, jamais en execution. reject refuse; revise corrige ou demande de reproposer; explain demande des details ou une répétition du brouillon/destination; topic_change sort du brouillon; unclear ne suffit pas.",
    "Dans draft_validation, si le user dit oui a une demande de preparer/montrer/reformuler le brouillon, ce n'est pas approve: c'est revise tant qu'il ne demande pas explicitement la creation.",
    "Dans draft_validation, si le user donne une correction exacte puis dit d'appliquer, classe revise si le brouillon doit d'abord intégrer cette correction.",
    "Les techniques autorisées viennent de la source de vérité fournie. Ne crée jamais une technique hors enum.",
    "Quand tu proposes des techniques au user, affiche uniquement les titres exacts de attack_techniques_source_of_truth[technique_key].title. Ne raccourcis pas et ne renomme pas les techniques.",
    "Chaque option proposée doit garder son technique_key exact avec le title exact correspondant.",
    "Ne choisis pas une technique d'office si le user ne l'a pas demandée explicitement et si plusieurs options sont plausibles: propose 2-3 options pertinentes.",
    "Mot de bascule convient surtout si le user risque de craquer, d'agir sous impulsion, de rechuter, d'abandonner/esquiver dans un moment chaud, ou a explicitement besoin d'un mot court a envoyer a Sophia.",
    "Mot de bascule n'est pas un bon candidat pour un simple demarrage d'action, un blocage de perfectionnisme, une action trop floue ou une difficulte a ecrire/ouvrir/commencer. Dans ces cas, prefere Le texte magique, Ancre visuelle ou Preparer le terrain selon le besoin.",
    "Ancre visuelle convient bien quand le user n'arrive pas a commencer une action concrete et a besoin d'un signal visible de depart dans son environnement.",
    "Si le user corrige un champ, conserve les autres champs déjà valides dans l'état.",
    "Si operation_input.target_candidate existe, tu es dans la validation de cible: si le user accepte ce candidat, copie-le dans state_patch.target avec status identified; s'il le refuse, mets target.status missing et pose une nouvelle question; s'il corrige, identifie la nouvelle cible depuis son message.",
    "Si des slots manquent, generated_user_message doit contenir une question WhatsApp courte.",
    'Tu tutoies toujours l\'utilisateur dans generated_user_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand generated_user_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Retourne uniquement du JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_prepare_attack_card_tool_skill_slots",
    required_json_shape: {
      current_step:
        "target_intake|technique_selection|keyword_intake|draft_generation|draft_validation|confirmation",
      user_intent:
        "draft_only|create|update|cancel|reject|revise|explain|topic_change|status_question|clarify|unknown",
      constraints: [{
        kind:
          "draft_only|no_create|max_proposals|single_proposal|no_extra_options|style",
        value: "unknown optional",
        evidence: ["string"],
      }],
      state_patch: {
        user_intent:
          "draft_only|create|update|cancel|reject|revise|explain|topic_change|status_question|clarify|unknown",
        target: {
          status: "missing|ambiguous|identified",
          kind: "plan_item|personal_action|unknown",
          plan_item_id: "string|null",
          title: "string",
          confidence: "low|medium|high",
          evidence: ["string"],
          candidates: [{
            plan_item_id: "string",
            title: "string",
            confidence: 0.7,
            evidence: ["string"],
          }],
        },
        technique: {
          status: "missing|ambiguous|identified",
          value: Object.keys(ATTACK_TECHNIQUES),
          explicitly_requested: "boolean",
          fit_warning: "string|null",
          options: [{
            technique_key: Object.keys(ATTACK_TECHNIQUES),
            title: "string",
            description: "string",
            reason: "string",
            example: "string",
            recommended: "boolean",
          }],
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        activation_keyword: {
          status: "not_applicable|missing|ambiguous|identified",
          value: "string|null",
          options: ["string"],
          rejected_value: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        blocker: {
          type:
            "avoidance|procrastination|action_too_heavy|unclear_first_step|low_energy|friction|mixed",
          confidence: 0.7,
          evidence: ["string"],
        },
        constraints: [{
          kind:
            "draft_only|no_create|max_proposals|single_proposal|no_extra_options|style",
          value: "unknown optional",
          evidence: ["string"],
        }],
        draft_validation: {
          decision: "approve|reject|revise|explain|topic_change|unclear",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        missing_slots: ["target|technique|activation_keyword"],
        confidence: "low|medium|high",
        generated_user_message: "string|null",
      },
      missing_slots: ["target|technique|activation_keyword"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    message: input.message,
    recent_messages: input.recent_messages ?? [],
    plan_snapshot: input.plan_snapshot ?? null,
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    attack_techniques_source_of_truth: ATTACK_TECHNIQUES,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.12,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "prepare_attack_card.slot_filler",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  // CHANTIER C8 — l'enforce passe APRÈS le refine: une technique nommée
  // explicitement par l'utilisateur prime toujours sur le steering de fit.
  return enforceExplicitTechniqueRequest(
    refineAttackCardTechniqueFit(
      normalizeAttackCardSlotFillerOutput(raw),
      input,
    ),
    input,
  );
}
