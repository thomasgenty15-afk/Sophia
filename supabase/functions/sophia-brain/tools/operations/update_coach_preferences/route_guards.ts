import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import { blocksToolSkills } from "../../../safety/safety_thresholds.ts";

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isCoachPreferencePreviewOnlyRequest(
  message: string,
): boolean {
  const text = normalizeText(message);
  return (
    /\b(ne l enregistre pas|ne l enregistrer pas|pas encore|ne l applique pas|sans l enregistrer|propose seulement|juste la proposition|juste une proposition|brouillon seulement)\b/
      .test(text) &&
    /\b(preference|mode tunnel|signal|regle)\b/.test(text)
  );
}

export function buildCoachPreferencePreviewReply(
  message: string,
): string {
  const text = normalizeText(message);
  if (/\bmode tunnel\b/.test(text)) {
    return [
      "Proposition (non enregistrée) — mode tunnel :",
      "- préférence durable possible : ton direct + moins de questions.",
      "- hors réglages durables actuels : sans emoji, sans question finale, action impérative.",
      "",
      "Si tu veux l'enregistrer, je peux seulement garder les réglages visibles côté préférences coach.",
    ].join("\n");
  }
  if (
    /\b(challenger doucement|challenge doucement)\b/.test(text) &&
    /\b(technique|colle|adapte|inadapte)\b/.test(text)
  ) {
    return [
      "Proposition (non enregistrée) :",
      "- préférence durable possible : challenge équilibré ou léger.",
      "- la condition précise ne devient pas une règle runtime cachée.",
    ].join("\n");
  }
  return "Proposition non enregistrée. Je peux garder seulement le ton, le niveau de challenge ou la tendance à poser des questions.";
}

export function isApplyExistingCoachPreferenceRequest(
  message: string,
): boolean {
  const text = normalizeText(message);
  const asksApplyExisting =
    /\b(applique|utilise|respecte|respectant|selon|comme|sers toi de|sers-toi de)\b[\s\S]{0,100}\b(ma|mes|la|cette|ces)\s+preferences?\b/
      .test(text) ||
    /\b(en respectant|selon|comme)\b[\s\S]{0,80}\b(ma|mes)\s+preferences?\b/
      .test(text);
  if (!asksApplyExisting) return false;
  const asksMutation =
    /\b(garde|enregistre|enregistrer|mets a jour|mettre a jour|change|changer|modifie|modifier|nouvelle preference|vraie preference|pour la suite|a partir de maintenant|desormais)\b/
      .test(text);
  return !asksMutation;
}

function isConversationScopedRepereRequest(normalizedText: string): boolean {
  return /\b(pour cette conversation|dans cette conversation|comme repere|repere dans cette conversation|garde comme repere|garde ca comme repere)\b/
    .test(normalizedText) &&
    /\b(retiens|garde|repere|quand je dis|ca veut dire|cela veut dire)\b/.test(
      normalizedText,
    );
}

export function isRuntimeCoachPreferenceRequest(
  message: string,
): boolean {
  const text = normalizeText(message);
  if (isApplyExistingCoachPreferenceRequest(message)) return false;
  const explicitPreferenceMention =
    /\b(preference|preferences|preference coach|preference de coaching|coaching|ton style|ta facon|ta maniere)\b/
      .test(text);
  if (isConversationScopedRepereRequest(text) && !explicitPreferenceMention) {
    return false;
  }
  const productNavigationQuestion = (
    /\b(comment|dans quelle partie|a quel endroit|quel endroit)\b/.test(
      text,
    ) ||
    /\bou\s+(changer|modifier|parametrer|regler|configurer)\b[\s\S]{0,80}\b(app|application|interface|menu|reglages|parametres|dashboard|initiatives)\b/
      .test(text)
  ) &&
    /\b(change|changer|parametre|parametrer|regle|style|preference|preferences|ton style|ta facon|ta maniere)\b/
      .test(text);
  if (productNavigationQuestion) return false;
  const preferenceSignal =
    /\b(prefere|preference|preferences|preference coach|preference de coaching|pour la suite|a partir de maintenant|desormais|mets a jour|mettre a jour|retiens|garde|enregistr\w*|applique|change|adapte|reponds|parle|sois)\b/
      .test(text);
  const supportedStyleSignal =
    /\b(moins de questions|plus de questions|questions? courtes?|plus direct|plus directement|directement|plus doux|plus cash|plus frontal|challenge[- ]?moi|challengeant|ton style|ta facon|ta maniere)\b/
      .test(text);
  const explicitPreferenceCommand =
    /\b(mets a jour|mettre a jour|retiens|garde|enregistr\w*|applique)\b[\s\S]{0,100}\b(preference|preferences|preference coach|preference de coaching|coaching)\b/
      .test(text) ||
    /\b(preference|preferences|preference coach|preference de coaching)\b[\s\S]{0,80}\b(a retenir|pour la suite)\b/
      .test(text);
  const outOfScopeStyleSignal =
    /\b(une seule question|pas de question finale|sans question finale|consignes? (tres )?courtes?|reponses? (tres )?courtes?|3 lignes max|trois lignes max|listes? longues?|tres concret|tres concrete|une action|une seule action|action concrete|pas plusieurs options|pas trois options|pas 3 options|moins d options|moins de choix|sans emoji|pas d emoji|pas d emojis|source\/cible|source cible)\b/
      .test(text);
  const localDraftContext =
    /\b(version|phrase|ligne|message|mail|collegue|excuser|excuse|brouillon|copie-colle)\b/
      .test(text);
  return preferenceSignal && (supportedStyleSignal || outOfScopeStyleSignal) &&
    (!localDraftContext || explicitPreferenceCommand);
}

function isLocalTextRevisionRequest(message: string): boolean {
  const text = normalizeText(message);
  const asksLocalText =
    /\b(formule|formuler|reformule|reformuler|version|rends|rendre|phrase|mantra|texte|ligne)\b/
      .test(text) &&
    /\b(court|courte|ultra|plus court|plus courte|resume|resumer|reutiliser|copier|coller)\b/
      .test(text);
  if (!asksLocalText) return false;
  const actualCoachPreference =
    /\b(pour la suite|a partir de maintenant|desormais|preference|preferences|ton style|ta facon|ta maniere|pose moi|moins de questions|plus de questions|plus direct|plus doux|challenge)\b/
      .test(text);
  return !actualCoachPreference;
}

export function isImmediateModeRequestNotCoachPreference(
  message: string,
): boolean {
  const text = normalizeText(message);
  const immediateMode =
    /\b(mode calme|mode apaisement|apaisement|respiration|souffler|calme maintenant|pour ce soir|ce soir|maintenant|pas un plan militaire|pas de plan militaire)\b/
      .test(text);
  if (!immediateMode) return false;
  const durablePreference =
    /\b(pour la suite|a partir de maintenant|desormais|preference|preferences|garde cette preference|parle moi|reponds moi|ton style|ta facon|ta maniere)\b/
      .test(text);
  return !durablePreference;
}

export function isCoachPreferenceVerificationRequest(
  message: string,
): boolean {
  const text = normalizeText(message);
  const asksVerification =
    /\b(tu as bien|t as bien|est ce que tu as|est-ce que tu as|c est bien garde|cest bien garde|tu gardes bien|tu l as bien garde)\b/
      .test(text) ||
    /\b(bien garde|bien enregistre|bien applique|deja garde|deja enregistre)\b/
      .test(text) ||
    /\b(verifie|vérifie|quelles preferences|preferences actives|preference coach active|deja actives|sont actives)\b/
      .test(text);
  if (!asksVerification) return false;
  const mentionsPreference =
    /\b(preference|preferences|question courte|une seule question|moins de questions|quand je bloque|ton style|ta facon|ta maniere)\b/
      .test(text);
  if (!mentionsPreference) return false;
  const asksChange =
    /\b(change|changer|modifie|modifier|applique|appliquer|mets|mettre|regle|règle|preference nouvelle|nouvelle preference)\b/
      .test(text);
  return !asksChange;
}

export function isCoachPreferenceExplicitApproval(
  message: string,
): boolean {
  const text = normalizeText(message);
  const startsWithApproval =
    /^(oui|ok|okay|go|vas y|vas-y|valide|applique|garde|c est ca|cest ca|exactement)\b/
      .test(text);
  if (!startsWithApproval) return false;
  const confirmsPreference =
    /\b(preference|pour la suite|exactement|c est ca|cest ca|garde|applique|une action|concrete|concret|moins de questions|question courte)\b/
      .test(text);
  if (!confirmsPreference) return false;
  const rejects =
    /\b(ne garde pas|n applique pas|annule|stop|pas maintenant|finalement non|ne cree rien)\b/
      .test(text);
  if (rejects) return false;
  const asksRevision =
    /\b(change|changer|modifie|modifier|corrige|corriger|plutot|au lieu|pas comme ca|refais|refaire)\b/
      .test(text);
  return !asksRevision;
}

export function detectsCoachPreferenceDirectionContradiction(
  message: string,
  patch: Record<string, unknown>,
): boolean {
  const text = normalizeText(message);
  const qtValue = String((patch ?? {})["coach.question_tendency"] ?? "").trim();
  if (!qtValue) return false;
  const wantsFewer = /\bmoins de questions?\b/.test(text) ||
    /\bpas (?:trop|plusieurs|de|tant) (?:de )?questions?\b/.test(text) ||
    /\bavant de (?:me )?(?:poser|demander)[\s\S]{0,24}questions?\b/.test(
      text,
    ) ||
    /\b(?:d abord|dabord) (?:un |le )?(?:geste|petit pas|petit geste|action)\b/
      .test(text) ||
    /\bgeste concret\b[\s\S]{0,40}\b(avant|puis|ensuite|seulement)\b/.test(
      text,
    ) ||
    /\bune seule question\b/.test(text) ||
    /\bune question maximum\b/.test(text) ||
    /\bquestion maximum\b/.test(text) ||
    (
      /\bgeste concret\b/.test(text) &&
      /\b(10 minutes|moins de 10)\b/.test(text)
    );
  const wantsMore = /\bplus de questions?\b/.test(text) ||
    /\b(questionne|questionner|interroge|interroger)[\s\S]{0,24}\b(plus|davantage)\b/
      .test(text) ||
    /\bprends?(?: plus)? le temps de (?:me )?questionner\b/.test(text) ||
    /\bpose(?:-| )?moi plus de questions?\b/.test(text);
  if (wantsFewer && !wantsMore && qtValue === "high") return true;
  if (wantsMore && !wantsFewer && qtValue === "low") return true;
  return false;
}

export function detectsCoachPreferenceDirectionContradictionForSkill(input: {
  message: string;
  patch: Record<string, unknown>;
}): boolean {
  return detectsCoachPreferenceDirectionContradiction(
    input.message,
    input.patch,
  );
}

export function shouldRuntimeCoachPreferenceOverrideRoute(args: {
  message: string;
  routeDecision?:
    | Pick<RouteDecision, "response_owner" | "selected_handler">
    | null;
  safetyRiskBand?: RiskBand | null;
  hasPendingOperationConfirmation?: boolean;
}): boolean {
  if (args.routeDecision?.response_owner === "safety") return false;
  if (blocksToolSkills(args.safetyRiskBand ?? "none")) return false;
  if (args.hasPendingOperationConfirmation) return false;
  if (isCoachPreferenceVerificationRequest(args.message)) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "update_coach_preferences"
  ) return false;
  if (!isRuntimeCoachPreferenceRequest(args.message)) return false;
  if (
    isLocalTextRevisionRequest(args.message) ||
    isImmediateModeRequestNotCoachPreference(args.message)
  ) return false;
  return true;
}

export function clearConversationFlowForCoachPreference(
  tempMemory: any,
): Record<string, unknown> {
  const next = { ...(tempMemory ?? {}) };
  delete (next as any).__active_skill_state;
  delete (next as any).active_skill_state;
  delete (next as any).__suspended_flow_v1;
  return next;
}
