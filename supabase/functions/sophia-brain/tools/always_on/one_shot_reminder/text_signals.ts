// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE ROUTEUR DES RAPPELS LIT DANS LE TEXTE DU MESSAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Aucune logique changée. `router.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `router.ts`.
//
// Ce qui est ici : les détections sur le texte (brouillon demandé, question
// de vérification, jour nommé, pronom « le/la » d'un déplacement, heure
// ambiguë, marqueur de nuit), les jetons d'une consigne de rappel et leur
// recouvrement, et la classification de l'intention.

import type { OneShotReminderIntent } from "./contract.ts";
import { buildOneShotReminderIntake } from "./intake.ts";
import {
  parseOneShotReminderRequest,
  parseScheduledForFromMessage,
} from "./time_parser.ts";

/**
 * P12-D4 (nina-p10reval R1-B03a): jour nommé ATTACHÉ à la référence d'entité
 * (« celui de vendredi », « le rappel de jeudi ») — par opposition au jour de
 * DESTINATION (« décale-le à vendredi », qui reste un replace). Retourne le
 * token de jour ancré sur l'entité, ou null.
 */
function entityAnchoredDayToken(text: string): string | null {
  const normalized = String(text ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase();
  const match = normalized.match(
    /\b(?:celui|celle|le rappel|mon rappel|ce rappel)\s+(?:de|du|d)\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres[- ]demain)\b/,
  );
  return match ? match[1] : null;
}

/** Jour civil local (fr, minuscule) d'un ISO — pour matcher un jour nommé. */
function localWeekdayName(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      weekday: "long",
    }).format(new Date(iso)).toLowerCase();
  } catch (_error) {
    return "";
  }
}

/**
 * P12-D7 (alex-untested24 R1-B06/B07, principe P5-E): tokens de CONTENU du
 * message — les verbes de commande et le vocabulaire de la mécanique rappel
 * sont exclus pour que « mets le rappel des courses à 16h » ne matche que par
 * « courses ». Sert à résoudre une cible UNIQUE par évidence nommée, jamais à
 * deviner entre plusieurs candidats positifs.
 */
const ROUTER_COMMAND_STOPWORDS = new Set([
  "rappel", "rappels", "rappelle", "rappelles", "annule", "annuler",
  "remets", "remet", "remettre", "decale", "decaler", "repousse", "avance",
  "replanifie", "reprogramme", "supprime", "mets", "mettre", "celui",
  "celle", "heure", "heures", "lieu", "demain", "matin", "soir", "midi",
  "nuit", "plutot", "maintenant", "nouvelle", "nouveau", "aujourd", "manque",
  "peux", "veux", "vais", "faut", "cette", "stp", "merci", "lundi", "mardi",
  "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "garde", "gardes",
  "conserve", "rajoute", "rajoutes", "ajoute", "ajouter",
]);

function reminderContentTokensFromMessage(text: string): string[] {
  return [...oneShotInstructionTokens(text)]
    .filter((token) => !ROUTER_COMMAND_STOPWORDS.has(token));
}

/** Score de recouvrement contenu-message ↔ instruction d'un pending
 * (tolérance morphologique, mêmes règles que instructionTokensOverlap). */
function messageContentOverlapScore(
  message: string,
  rowInstruction: string,
): number {
  const contentTokens = reminderContentTokensFromMessage(message);
  if (contentTokens.length === 0) return 0;
  const rowTokens = [...oneShotInstructionTokens(rowInstruction)];
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  return contentTokens.filter((token) =>
    rowTokens.some((rowToken) => morphMatch(token, rowToken))
  ).length;
}

/**
 * P12-D4/D8a: résolution civile d'un jour nommé + HH:MM (prochaine
 * occurrence, timezone user) via une date absolue française — la seule forme
 * sûre du parseur (le fallback naïf ancrait un jour de semaine nu sur
 * aujourd'hui, leçon P9-C).
 */
function composeNamedDayWithHHMM(args: {
  dayToken: string;
  hhmm: string;
  timezone: string;
  nowUtcIso: string;
}): string | null {
  const weekdayFmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: args.timezone,
    weekday: "long",
  });
  const civilFmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: args.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const monthNames = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const nowMs = new Date(args.nowUtcIso).getTime();
  if (!Number.isFinite(nowMs)) return null;
  for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
    const candidate = new Date(nowMs + dayOffset * 86_400_000);
    const matchesToken = args.dayToken === "demain"
      ? dayOffset === 1
      : args.dayToken.startsWith("apres")
      ? dayOffset === 2
      : weekdayFmt.format(candidate).toLowerCase() === args.dayToken;
    if (!matchesToken) continue;
    const civil = civilFmt.format(candidate);
    const [yearStr, monthStr, dayStr] = civil.split("-");
    const composed = `rappelle-moi le ${Number(dayStr)} ${
      monthNames[Number(monthStr) - 1]
    } ${yearStr} à ${args.hhmm.replace(":", "h")} de t'en occuper`;
    return parseOneShotReminderRequest({
      message: composed,
      timezone: args.timezone,
      nowIso: args.nowUtcIso,
    })?.scheduledFor ??
      parseScheduledForFromMessage({
        message: composed,
        timezone: args.timezone,
        nowIso: args.nowUtcIso,
      });
  }
  return null;
}

// P5-F (nina-global20 B01, alex-untested20 R1-B02): détection déterministe
// d'une demande de BROUILLON / validation préalable — « montre-le-moi
// d'abord », « le crée pas tout de suite », « je valide avant ». Un create
// sous ces marqueurs ne committe JAMAIS : brouillon rendu + slots persistés,
// le commit attend la confirmation explicite du tour suivant.
export function oneShotReminderDraftRequested(message: string): boolean {
  const text = ` ${
    String(message ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .toLowerCase()
      .trim()
  } `;
  const markers: RegExp[] = [
    / brouillon /,
    / montre (le |la )?(moi )?(d abord|avant)/,
    / montre moi (le |la )?(d abord|avant)/,
    / avant de (le|la) (poser|creer|poster|valider)/,
    / (le|la) cree pas (tout de suite|encore|direct)/,
    / ne (le|la) cree pas /,
    / je (veux|voudrais) valider /,
    / je valide avant /,
    / attends? ma validation /,
    / sans (le|la) creer /,
  ];
  return markers.some((marker) => marker.test(text));
}

// P5-B (rose-hard17 T14-T15): détection déterministe d'une QUESTION DE
// VERIFICATION sur un rappel (« t'es sûre que… est annulé ? », « vérifie »,
// « toujours programmé ? »). Le dispatcher classe parfois ces tours en
// intent=cancel — exécuter ce cancel a détruit le mauvais rappel (repli
// pending-unique) puis affirmé le contraire. Une vérification = LECTURE de
// projection DB, zéro write, quel que soit l'intent émis.
export function isOneShotReminderVerificationQuestion(
  message: string,
): boolean {
  const text = String(message ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase();
  const markers: RegExp[] = [
    // « t'es sûre / tu es sûr que … »
    /\b(t|tu)\s*es\s+sur[es]?\b/,
    // « vérifie / tu peux vérifier »
    /\bverifi(e|er|es|ez)\b/,
    // « est-ce que … est (bien) annulé / programmé / enregistré / prévu »
    /\best[- ]ce\s+qu\S*\b.*\b(annul|programm|enregistr|prevu|actif|encore)/,
    // « … toujours programmé / prévu / actif ? »
    /\btoujours\s+(programm|prevu|actif|en\s+place|la)\b.*\?/,
    // « c'est bien annulé / enregistré / posé ? »
    /\b(bien|vraiment)\s+(annul|enregistr|programm|pos[ee]|note)\S*\b.*\?/,
    // « … est encore actif / prévu ? »
    /\bencore\s+(actif|prevu|programm)/,
  ];
  return markers.some((marker) => marker.test(text));
}

export function classifyOneShotReminderDirectIntent(
  message: string,
  directEffectsToRun: string[] = [],
): {
  detected: boolean;
  intent: OneShotReminderIntent | "ignore" | "product_help" | "status_question";
  time_expression: string | null;
  constraints: Array<{ kind: string; evidence: string[] }>;
  reason_code: string;
} {
  const intake = buildOneShotReminderIntake({
    message,
    directEffectsToRun,
  });
  return {
    detected: intake.detected,
    intent: intake.intent,
    time_expression: intake.time_expression,
    constraints: intake.constraints,
    reason_code: intake.reason_code === "create_intent"
      ? "create_intent"
      : intake.reason_code === "cancel_intent"
      ? "cancel_intent"
      : intake.reason_code,
  };
}

function looksTemporalLabel(value: string | undefined): value is string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return /\d/.test(text) ||
    /\b(dans|demain|aujourd|apres|après|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|matin|midi|soir|minute|heure)\b/
      .test(text);
}

/** Tokens significatifs d'une instruction de rappel (match déterministe). */
function oneShotInstructionTokens(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .toLowerCase().split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );
}

function instructionTokensOverlap(a: string, b: string): boolean {
  const tokensA = [...oneShotInstructionTokens(a)];
  if (tokensA.length === 0) return false;
  const tokensB = [...oneShotInstructionTokens(b)];
  // P7-F (paul-p6reval R1-B04): tolérance MORPHOLOGIQUE française — « la
  // marche » doit matcher « marcher » (préfixe commun ≥ 5, même règle actée
  // que la couverture de titre track P5-E). Le match exact seul faisait
  // rater une cible nommée pourtant unique → reschedule bloqué à tort.
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  return tokensB.some((tokenB) =>
    tokensA.some((tokenA) => morphMatch(tokenA, tokenB))
  );
}

/**
 * P9-A (rose-p8reval T6): une instruction est ANCRÉE dans le message courant
 * quand la majorité de ses tokens significatifs y figurent (tolérance
 * morphologique). Discriminant pollution vs contenu réel: un instruction_hint
 * hérité d'un tour précédent (pollution P6-V 2e forme) n'apparaît pas dans le
 * message; le contenu que l'utilisateur redonne verbatim (« … pour checker
 * mon envie avant de sortir ») y est. Sert de condition de désarmement à la
 * coercition reschedule: clitique + contenu ancré + zéro recouvrement des
 * pendings = l'anaphore vise la SPEC du message (create additif), jamais
 * « le seul pending qui traîne ».
 */
function instructionRootedInText(instruction: string, text: string): boolean {
  const tokens = [...oneShotInstructionTokens(instruction)];
  if (tokens.length === 0) return false;
  const textTokens = [...oneShotInstructionTokens(text)];
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  const hits = tokens.filter((token) =>
    textTokens.some((textToken) => morphMatch(token, textToken))
  ).length;
  return hits >= Math.max(1, Math.ceil(tokens.length * 0.6));
}

/**
 * P10-A (nina-hard24 R1-B01): marqueur nocturne ou méridiem EXPLICITE — une
 * heure passée aujourd'hui accompagnée d'un tel marqueur désigne la
 * PROCHAINE occurrence (« cette nuit à 2h du matin » dit à 22h = demain
 * 02:00), jamais un refus past_time. Le marqueur rend le bump non ambigu —
 * l'heure NUE passée reste couverte par la décision V2-A (clarify).
 */
function hasNocturnalOrMeridiemForwardMarker(text: string): boolean {
  const normalized = String(text ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(cette nuit|la nuit (qui (vient|arrive)|prochaine)|au petit matin|du mat(in)?\b|du soir\b|dans \d+\s?h(eures?)?\b)/
    .test(normalized);
}

/**
 * Discriminant grammatical du déplacement de rappel (P6-V/P8-V), partagé par
 * la coercition create-nu→reschedule et le verrou anti-dégradation.
 * P9-C (alex-hard24 R1-B01): la forme SANS trait d'union (« decale le a
 * jeudi », frappe familière) est admise UNIQUEMENT devant une préposition ou
 * une ancre temporelle — jamais devant un nom (« mets le rappel des pâtes » =
 * article + NP, pas un clitique: la dégradation P4-C reste).
 */
function hasRescheduleCliticAnaphor(text: string): boolean {
  const normalized = String(text ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").toLowerCase();
  return (
    /\b(mets|remets|remet|decale|repousse|replanifie|reprogramme|avance)-(le|la)\b/
      .test(normalized) ||
    /\b(mets|remets|remet|decale|repousse|replanifie|reprogramme|avance)\s+(le|la)\s+(a|au|pour|plutot|sur|vers|demain|apres[- ]demain|ce|cette|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/
      .test(normalized)
  );
}

/**
 * P4-D (eva-global19 R1-B03): heure NUE 1-9 sans marqueur matin/soir dans
 * l'expression USER (« à huit heures », « à 8h ») — ambigüe entre 08:00 et
 * 20:00. Retourne l'heure détectée, null si non ambiguë.
 */
function bareAmbiguousHour(
  hint: string,
  opts?: { includeDigits?: boolean },
): number | null {
  const text = String(hint ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (!text.trim()) return null;
  if (/\b(matin|soir|apres[- ]midi|midi|nuit|am|pm)\b/.test(text)) return null;
  // CEINTURE dure: heures en TOUTES LETTRES seulement (« à huit heures »,
  // le verbatim eva T3) — la forme chiffrée « demain à 9h » est massivement
  // employée pour le matin dans les flux légitimes: son ambiguïté relève du
  // JUGEMENT contextuel du dispatcher (règle prompt: UTC_time laissé vide),
  // que le chemin missing_time (includeDigits) transforme en question de
  // créneau. Des minutes explicites (« 9h10 ») spécifient le moment.
  const words: Record<string, number> = {
    une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
    six: 6, sept: 7, huit: 8, neuf: 9,
  };
  const word = text.match(
    /(?:\ba|\bvers|\bpour)\s+(une|deux|trois|quatre|cinq|six|sept|huit|neuf)\s+heures?(?!\s+\w)/,
  );
  // P6-H (nina-untested21 R1-B03, décision actée 13/07): « 7 heures »
  // (chiffre + mot ENTIER « heures ») rejoint la forme en toutes lettres —
  // cohérence « 7 heures » ≡ « sept heures ». La forme ABRÉGÉE « 7h » reste
  // au jugement contextuel du dispatcher (arbitrage P4: la bloquer en dur
  // régressait 9 tests + nina T10).
  const digitFullWord = text.match(
    /(?:\ba|\bvers|\bpour)\s+(\d{1,2})\s+heures?(?!\s+\w)/,
  );
  // P7-F (paul-p6reval R1-B05a): « demain 8h » (heure abrégée SANS
  // préposition, ancrée par un jour) laissait le chemin missing_time poser
  // la question générique « il me manque l'heure » au lieu de la question de
  // créneau — l'ancre de jour rejoint les prépositions, includeDigits only
  // (le dispatcher a déjà jugé l'ambiguïté en laissant UTC_time vide).
  const digit = opts?.includeDigits
    ? text.match(
      /(?:\ba|\bvers|\bpour|\bdemain|\bapres[- ]?demain|\baujourd\s?hui)\s+(\d{1,2})\s*h(?:eures?)?(?![\d:h])/,
    )
    : null;
  const hour = word
    ? words[word[1]]
    : digitFullWord
    ? Number(digitFullWord[1])
    : digit
    ? Number(digit[1])
    : null;
  return hour !== null && hour >= 1 && hour <= 9 ? hour : null;
}

/**
 * P12-A (eva-hard25 R1-B02, alex-untested24 R1-B01): les jetons de date du
 * CONTENU du rappel sont INERTES pour l'ancrage temporel — « sortir les
 * poubelles avant le passage de DEMAIN » promouvait J+1 via la couche P3-B
 * alors que le créneau demandé (« ce soir à 21h ») était correct. Le scope
 * temporel = le texte MOINS le segment d'instruction (match insensible aux
 * diacritiques). Introuvable ⇒ texte inchangé (fail-open, comportement
 * historique).
 */
function temporalScopeText(
  text: string,
  instruction: string | null | undefined,
): string {
  const normalize = (value: string) =>
    String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const normalizedText = normalize(text);
  const normalizedInstruction = normalize(String(instruction ?? "")).trim();
  if (!normalizedInstruction) return normalizedText;
  const index = normalizedText.indexOf(normalizedInstruction);
  if (index < 0) return normalizedText;
  return `${normalizedText.slice(0, index)} ${
    normalizedText.slice(index + normalizedInstruction.length)
  }`.trim();
}

// Exportés pour `router.ts` seulement (ils n'étaient pas exportés quand ils
// vivaient dans `router.ts`) ; `router.ts` ne les ré-exporte pas.
export {
  bareAmbiguousHour,
  composeNamedDayWithHHMM,
  entityAnchoredDayToken,
  hasNocturnalOrMeridiemForwardMarker,
  hasRescheduleCliticAnaphor,
  instructionRootedInText,
  instructionTokensOverlap,
  localWeekdayName,
  looksTemporalLabel,
  messageContentOverlapScore,
  oneShotInstructionTokens,
  temporalScopeText,
};
