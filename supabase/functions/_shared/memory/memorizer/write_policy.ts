import type {
  DryRunCandidate,
  MemorizerWriteStatus,
  WriteDecision,
} from "./types.ts";

function hasSource(candidate: DryRunCandidate): boolean {
  return Array.isArray(candidate.item.source_message_ids) &&
    candidate.item.source_message_ids.some((id) => String(id ?? "").trim());
}

function bestLinkConfidence(candidate: DryRunCandidate): number {
  return Math.max(
    candidate.topic_link?.confidence ?? 0,
    ...(candidate.entity_links ?? []).map((link) => link.confidence),
    candidate.action_link?.confidence ?? 0,
  );
}

function isHighConfidenceDurable(candidate: DryRunCandidate): boolean {
  return candidate.item.kind !== "action_observation" &&
    candidate.item.confidence >= 0.75 &&
    Number(candidate.item.importance_score ?? 0) >= 0.6;
}

// P2-5b (eva-global17 R1-B05, paul-untested R1-B06): la règle prompt « états
// produit exclus » recidive — des objets rappel persistaient (« un rappel
// était demandé pour préparer le sac à 8h », « prévoit de poser son téléphone
// à 19h15 » avec une heure JAMAIS commise, contredite par la DB). Filtre de
// PERSISTANCE déterministe : la DB des rappels est la seule vérité de ces
// états ; un recall futur d'un tel item désinformerait. Deux détecteurs :
// (a) vocabulaire de la mécanique rappel + horaire ; (b) contenu qui recouvre
// l'instruction d'un rappel réel (fourni par l'appelant) + horaire. Le fait
// de vie sous-jacent sans mécanique (« travaille à domicile le 13/07 ») passe.
const REMINDER_CONTENT_STOPWORDS = new Set([
  "pour",
  "dans",
  "avec",
  "vers",
  "demain",
  "matin",
  "soir",
  "midi",
]);

function normalizeReminderContent(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function contentTokens(text: string): Set<string> {
  return new Set(
    normalizeReminderContent(text)
      .split(/[^a-z0-9]+/)
      .filter((token) =>
        token.length >= 4 && !REMINDER_CONTENT_STOPWORDS.has(token)
      ),
  );
}

function hasClockTime(text: string): boolean {
  return /\b\d{1,2}\s*h\s*\d{0,2}\b|\b\d{1,2}:\d{2}\b/.test(
    normalizeReminderContent(text),
  );
}

// P4-D (rose-hard16 R1-B04, eva-global19 R1-B05): l'horloge en TOUTES
// LETTRES (« huit heures », « vingt heures ») et les moments sans chiffre
// (« demain soir ») passaient sous le detecteur — des objets-rappel
// persistaient en candidate (« Elle veut un rappel demain soir pour... »,
// « Un rappel a ete demande pour demain a huit heures... »).
function hasWordClockTime(normalized: string): boolean {
  return /\b(une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix[- ]sept|dix[- ]huit|dix[- ]neuf|vingt([- ]et[- ]une)?|vingt[- ]deux|vingt[- ]trois)\s+heures?\b/
    .test(normalized);
}

function hasTemporalMomentToken(normalized: string): boolean {
  return /\b(demain|apres[- ]demain|ce soir|ce matin|cet apres[- ]midi|ce midi|cette nuit|chaque (matin|soir|jour)|tous les (matins|soirs|jours))\b/
    .test(normalized);
}

export function isReminderObjectItem(args: {
  content_text: string;
  normalized_summary?: string | null;
  reminder_instructions?: string[];
}): boolean {
  const text = `${args.content_text ?? ""} ${args.normalized_summary ?? ""}`;
  const normalized = normalizeReminderContent(text);
  const clock = hasClockTime(text) || hasWordClockTime(normalized);
  // Le NOM « rappel(s) » (jamais le verbe « rappelé/rappeler ») + un moment
  // (horloge chiffrée, en lettres, ou token temporel) = objet-rappel.
  if (/\brappels?\b/.test(normalized) && (clock || hasTemporalMomentToken(normalized))) {
    return true;
  }
  if (!clock) return false;
  if (/\brappel/.test(normalized)) return true;
  const itemTokens = contentTokens(text);
  for (const instruction of args.reminder_instructions ?? []) {
    const instructionTokens = contentTokens(instruction);
    if (instructionTokens.size === 0) continue;
    let overlap = 0;
    for (const token of instructionTokens) {
      if (itemTokens.has(token)) overlap += 1;
    }
    if (
      overlap >= 2 ||
      (overlap >= 1 && overlap === instructionTokens.size)
    ) return true;
  }
  return false;
}

/**
 * P4-D (eva-global19 R1-B05): une DEMANDE d'objet-outil Sophia (« une carte
 * d'attaque avec un mot de bascule a été demandée ») n'est pas un fait de
 * vie — la DB produit est la seule vérité de ces objets. Détection étroite:
 * nom d'outil + verbe de demande/création, pour ne pas toucher les faits
 * d'usage légitimes (« sa carte de défense l'aide le soir »).
 */
export function isToolRequestObjectItem(args: {
  content_text: string;
  normalized_summary?: string | null;
}): boolean {
  const normalized = normalizeReminderContent(
    `${args.content_text ?? ""} ${args.normalized_summary ?? ""}`,
  );
  const namesTool =
    /\b(carte d attaque|carte de defense|carte d'attaque|carte de défense|potion|mot de bascule|texte magique|mantra de force)\b/
      .test(normalized.replace(/'/g, " "));
  if (!namesTool) return false;
  return /\b(a ete demandee?|a ete propose|a demande (une|la|sa)|demande la creation|veut (une|creer|qu on lui cree))\b/
    .test(normalized.replace(/'/g, " "));
}

export function decideInitialWriteStatus(
  candidate: DryRunCandidate,
  opts?: { reminder_instructions?: string[] },
): WriteDecision {
  if (candidate.dedupe.decision === "reject_duplicate") {
    return { candidate, status: "reject", reason: "duplicate" };
  }
  if (
    isReminderObjectItem({
      content_text: candidate.item.content_text,
      normalized_summary: candidate.item.normalized_summary,
      reminder_instructions: opts?.reminder_instructions,
    })
  ) {
    return { candidate, status: "reject", reason: "reminder_object_state" };
  }
  if (
    isToolRequestObjectItem({
      content_text: candidate.item.content_text,
      normalized_summary: candidate.item.normalized_summary,
    })
  ) {
    return { candidate, status: "reject", reason: "tool_request_object_state" };
  }
  if (!hasSource(candidate)) {
    return { candidate, status: "reject", reason: "missing_source" };
  }
  if (candidate.item.confidence < 0.55) {
    return { candidate, status: "reject", reason: "low_confidence" };
  }
  // P4-C (paul-p3verify R1-W01): un item marque safety, ou dont les
  // categories pointent la sante mentale / l'automutilation / le trauma,
  // ne devient JAMAIS actif automatiquement — au mieux candidate. La regle
  // prompt « contenu de crise jamais persiste actif » fuyait selon le
  // phrasé (« Le soir, quand la personne est seule... se sent vraiment
  // vide » persiste actif depuis des tours d'ideation) et alimentait la
  // confabulation de recall post-crise. Cible ETROITE: les faits famille/
  // travail/addiction (coeur du coaching, auto-promus "sensitive" par le
  // validate) restent actifs.
  const crisisCategories = new Set(["mental_health", "self_harm", "trauma"]);
  if (
    candidate.item.sensitivity_level === "safety" ||
    (candidate.item.sensitivity_categories ?? []).some((category) =>
      crisisCategories.has(String(category))
    )
  ) {
    return {
      candidate,
      status: "candidate",
      reason: "crisis_adjacent_never_auto_active",
    };
  }
  const linkConfidence = bestLinkConfidence(candidate);
  if (candidate.item.requires_user_initiated) {
    if (isHighConfidenceDurable(candidate)) {
      return {
        candidate,
        status: "active",
        reason: "high_confidence_user_initiated_guarded",
      };
    }
    return {
      candidate,
      status: "candidate",
      reason: "requires_user_initiated",
    };
  }
  if (candidate.item.kind === "action_observation" && !candidate.action_link) {
    return {
      candidate,
      status: "candidate",
      reason: "action_without_confirmed_plan_item",
    };
  }
  if (candidate.item.confidence >= 0.75 && linkConfidence >= 0.70) {
    return { candidate, status: "active", reason: "high_confidence_linked" };
  }
  if (linkConfidence < 0.70 && isHighConfidenceDurable(candidate)) {
    return {
      candidate,
      status: "active",
      reason: "high_confidence_unlinked",
    };
  }
  return {
    candidate,
    status: "candidate",
    reason: linkConfidence < 0.70 ? "ambiguous_link" : "grey_confidence",
  };
}

export function decideInitialWriteStatuses(
  candidates: DryRunCandidate[],
  opts?: { reminder_instructions?: string[] },
): WriteDecision[] {
  return candidates.map((candidate) =>
    decideInitialWriteStatus(candidate, opts)
  );
}

export function countWriteStatuses(
  decisions: WriteDecision[],
): Record<MemorizerWriteStatus, number> {
  return decisions.reduce((acc, decision) => {
    acc[decision.status]++;
    return acc;
  }, { active: 0, candidate: 0, reject: 0 });
}
