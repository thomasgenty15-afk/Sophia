/**
 * LE FAIT DU SOIR — ce que Sophia DONNE avant de demander quoi que ce soit.
 *
 * ── LE DÉFAUT PRODUIT QUE CE MODULE CORRIGE ─────────────────────────────────
 * Le message du soir ne donnait rien, il prenait. Tous les jours, à la même
 * heure, pour toujours: `"How was today?"` et trois boutons. C'est un
 * formulaire quotidien, et un formulaire quotidien se fait ignorer — puis
 * couper. La mesure elle-même finissait par se détruire.
 *
 * L'inversion tient en une phrase: **le message s'ouvre sur un fait de la
 * journée de l'élève, et la question ne vient qu'après, quand elle est due.**
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE RESTE: LE FAIT EST LE COMPLIMENT ──────────
 * Pas « bravo », pas « belle journée », pas « continue comme ça ». Ce dépôt a
 * déjà écrit pourquoi (`renderPulseAck`: « aucune des trois formulations ne
 * juge, ne console ni ne rebondit »), et ça vaut ici au carré, parce qu'un
 * compliment quotidien est exactement la même taxe que la question quotidienne,
 * déguisée en gentillesse. Il devient du papier peint en quatre soirs.
 *
 * Ce qui n'est PAS du papier peint: un décompte que l'élève n'avait pas fait.
 * « Poulet-riz et yaourt grec cochés, 2 des 4 du plan » porte une information;
 * « super journée ! » n'en porte aucune. La ceinture `qualifies_the_day` est là
 * pour que le modèle ne puisse pas retomber dans la seconde.
 *
 * Corollaire dur: **jamais d'enthousiasme sur une journée moyenne.** Le soir où
 * Sophia félicite pour une journée que l'élève sait mauvaise, tout le canal
 * devient non-crédible, et il n'y a pas de retour en arrière.
 *
 * ── LE PIÈGE DE MESURE, ET POURQUOI LE TEXTE RESTE FACTUEL ──────────────────
 * Le tap du soir ne mesure PAS ce que mesurent les photos et les coches:
 * celles-ci disent ce qui a été mangé, le tap dit si le protocole est VIVABLE
 * (`daily_pulse.ts`, « l'activité ne supprime jamais la question »). Or féliciter
 * sur l'observance juste avant de demander « et ta journée ? » biaise la
 * réponse vers `good`: quelqu'un à qui on vient de dire « 3 sur 3 » tape moins
 * facilement `Rough`.
 *
 * D'où l'arbitrage, et il est structurel plutôt qu'écrit dans le prompt:
 * l'ouverture énonce des FAITS et n'a pas le droit de rendre un VERDICT. Un
 * décompte ne suggère pas de réponse; un jugement, si.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ────────────────────────────────────────────
 * Ni base, ni modèle. Il construit un prompt et il JUGE un texte — même
 * frontière que `reengage_composer.ts`, et pour la même raison: ce qui doit
 * être éprouvé est précisément ce qui ne doit JAMAIS partir, et on ne peut pas
 * demander à un modèle de produire à la demande le texte fautif qu'on refuse.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  countSentences,
  PROMPT_ARTEFACT_PATTERNS,
  sanitizeComposedNudge,
} from "./reengage_composer.ts";
import { findGuiltTripping } from "./reengagement.ts";

// ---------------------------------------------------------------------------
// LES FAITS — et rien d'autre n'entrera jamais dans ce message
// ---------------------------------------------------------------------------

/**
 * Ce que la journée d'un élève contient de VÉRIFIABLE à 20 h.
 *
 * Chaque champ est une lecture directe d'une table de faits, jamais une
 * déduction. C'est la garantie que ce dépôt a appris à exiger: un récapitulatif
 * dont les entrées sont des projections confabule (`tracking-projection-not-
 * grounded-db`), et un fait écrit que l'élève n'a pas déclaré est indémentable
 * (`auto-tick-writes-undeniable-false-facts`). Ici on ne fait ni l'un ni
 * l'autre: on RELIT ce qu'il a lui-même déclaré.
 */
export interface DayFacts {
  /**
   * Coches actives du jour. DISTINCT de `tickedTitles.length`, et c'est voulu:
   * une coche dont le titre est vide en base reste un fait déclaré. Compter les
   * titres LISIBLES ferait descendre « 2 des 4 » à « 1 des 4 » sur une donnée
   * simplement manquante — un chiffre faux issu d'une absence, la pire espèce.
   */
  tickedCount: number;
  /** Ceux de ces plats qui portent un titre citable, tels que cochés. */
  tickedTitles: readonly string[];
  /**
   * Celles de ces coches qui visent LE PLAN dont vient `plannedCount`.
   *
   * ── POURQUOI CE CHAMP EXISTE À CÔTÉ DE `tickedCount` ──────────────────
   * Depuis qu'un plan COURANT et un plan SUIVANT coexistent, les coches des
   * deux portent le même préfixe. `tickedCount` les compte toutes — et c'est
   * juste: une coche est un fait rapporté. Mais le RATIO doit comparer des
   * choses comparables, sinon on écrit « 5 des 3 » dans le message du soir,
   * sans qu'aucune erreur ne soit levée.
   */
  tickedForPlanCount: number;
  /** Plats que le plan prévoyait pour aujourd'hui. 0 = pas de plan ce jour. */
  plannedCount: number;
  /** Photos de repas envoyées aujourd'hui. */
  photoCount: number;
}

export const EMPTY_DAY_FACTS: DayFacts = {
  tickedCount: 0,
  tickedForPlanCount: 0,
  tickedTitles: [],
  plannedCount: 0,
  photoCount: 0,
};

/**
 * SUR QUOI le message a le droit de s'ouvrir. C'est une décision, pas un
 * affichage — elle décide aussi s'il y a un message du tout.
 *
 * ── POURQUOI « CE QUI ÉTAIT PRÉVU » N'EST PAS UN SOL ────────────────────────
 * La tentation était forte: sur une journée vide, ouvrir sur le plan (« au
 * programme aujourd'hui: X et Y »). C'est vrai, c'est groundé, et c'est
 * REFUSÉ — à 20 h la journée est finie. Énumérer à quelqu'un qui n'a rien
 * déclaré ce qu'il aurait dû manger n'est pas un cadeau, c'est un reproche
 * passif, et un reproche passif quotidien est pire que la question sèche qu'on
 * cherche à remplacer.
 *
 * Une journée sans fait n'a donc pas d'ouverture. Elle a la question si la
 * question est due, et sinon elle n'a rien du tout — c'est là que se trouve la
 * vraie réduction de bruit du lot.
 */
export type RecapGround = "ticked" | "logged" | "none";

export function recapGround(facts: DayFacts): RecapGround {
  // Sur `tickedCount`, pas sur les titres: une coche sans titre est un fait, et
  // elle mérite son message même si la phrase devra la compter au lieu de la
  // nommer.
  if (facts.tickedCount > 0) return "ticked";
  if (facts.photoCount > 0) return "logged";
  return "none";
}

/** Y a-t-il de quoi ouvrir ? Le raccourci que le décideur consomme. */
export function hasRecapGround(facts: DayFacts): boolean {
  return recapGround(facts) !== "none";
}

// ---------------------------------------------------------------------------
// LE REPLI DÉTERMINISTE
// ---------------------------------------------------------------------------

/** Au-delà, on ne cite plus: on compte. Trois titres tiennent dans une phrase. */
const MAX_TITLES_LISTED = 3;

/** Un titre de plat, ramené à ce qui se lit dans une bulle. */
function cleanTitle(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/** « A », « A and B », « A, B and C ». */
function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/**
 * Le texte qui part quand la composition ne peut pas — pas de doctrine, modèle
 * en panne, ceinture qui refuse.
 *
 * Il est volontairement sec: c'est un décompte, pas une voix. Un message
 * générique qui PART vaut mieux qu'un message personnalisé qui ne part jamais
 * (l'arbitrage de `composeReengageBody`, repris tel quel), et ici le décompte
 * garde l'essentiel de la valeur — l'information que l'élève n'avait pas.
 *
 * Rend `null` quand il n'y a pas de sol: l'appelant enverra la question seule,
 * ou rien. Aucune phrase de remplissage n'est fabriquée pour une journée vide.
 */
export function renderDeterministicRecap(facts: DayFacts): string | null {
  const ground = recapGround(facts);

  if (ground === "ticked") {
    // « 2 des 4 du plan » n'a de sens que si le plan couvrait ce jour, et que
    // le compte coché ne le DÉPASSE pas: une coche de rattrapage sur un plat
    // d'hier peut porter le total au-dessus du plan d'aujourd'hui, et « 5 sur
    // 3 » serait un chiffre faux sorti d'une arithmétique juste.
    // LE RATIO COMPARE DES CHOSES COMPARABLES: le numérateur est scopé au plan
    // qui a fourni le dénominateur. `tickedCount` reste le total honnête des
    // faits du jour, mais il n'a rien à faire dans une fraction.
    const ratio = facts.plannedCount > 0 &&
        facts.tickedForPlanCount <= facts.plannedCount
      ? ` — ${facts.tickedForPlanCount} of the ${facts.plannedCount} on the plan`
      : "";

    const titles = facts.tickedTitles.map(cleanTitle).filter(Boolean);
    if (titles.length === 0) {
      // Des coches sans titre citable: on COMPTE au lieu de nommer. La phrase
      // est plus pauvre et reste exacte, ce qui est le bon ordre de priorité.
      const n = facts.tickedCount;
      return n === 1
        ? `One dish ticked off today${ratio}.`
        : `${n} dishes ticked off today${ratio}.`;
    }

    const shown = titles.slice(0, MAX_TITLES_LISTED);
    // Le reste compte TOUTES les coches non citées, y compris celles sans
    // titre: « and 2 more » doit fermer le total, sinon l'énumération et le
    // ratio de la même phrase se contrediraient.
    const hidden = Math.max(0, facts.tickedCount - shown.length);
    const list = hidden > 0
      ? `${joinTitles(shown)} and ${hidden} more`
      : joinTitles(shown);

    return `Ticked off today: ${list}${ratio}.`;
  }

  if (ground === "logged") {
    const n = facts.photoCount;
    return n === 1 ? "One meal logged today." : `${n} meals logged today.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

/**
 * Court, et la raison est la même que pour la relance: ce message n'est pas
 * demandé. Deux phrases se lisent dans la notification; un paragraphe se remet
 * à plus tard, et « plus tard » ne revient pas.
 */
export const RECAP_MAX_CHARS = 220;
export const RECAP_MAX_SENTENCES = 2;

/**
 * Les faits, mis en mots pour le modèle. Le SEUL contexte qu'il reçoit.
 *
 * Ce qui n'y est PAS, délibérément: le contenu du plan du jour, l'adhérence, la
 * semaine, le poids, l'historique. Chaque donnée supplémentaire est une surface
 * de confabulation de plus, et aucune de celles-là n'a de raison d'apparaître
 * dans une phrase qui dit ce qui s'est passé aujourd'hui.
 */
export function describeDayFacts(facts: DayFacts): string {
  const lines: string[] = [];
  const titles = facts.tickedTitles.map(cleanTitle).filter(Boolean);

  if (facts.tickedCount > 0) {
    lines.push(`- Dishes from the plan the student ticked off today: ${facts.tickedCount}`);
    // Les titres arrivent SOUS le compte et ne le remplacent pas: si les deux
    // divergent (coche sans titre), le modèle doit lire le compte comme la
    // vérité et les titres comme un échantillon — sinon il énumère trois plats
    // et écrit « three », alors que la journée en portait quatre.
    if (titles.length > 0) {
      lines.push(`- Their titles, exactly as ticked: ${titles.map((t) => `"${t}"`).join(", ")}`);
    }
  } else {
    lines.push("- The student ticked nothing off the plan today.");
  }

  if (facts.plannedCount > 0) {
    lines.push(`- Dishes the plan held for today: ${facts.plannedCount}`);
  } else {
    lines.push("- The plan held no dish for today.");
  }

  lines.push(`- Meal photos the student sent today: ${facts.photoCount}`);
  return lines.join("\n");
}

/**
 * Le prompt système. Le bloc de doctrine entre TEL QUEL — c'est lui qui porte la
 * voix, l'adresse et les convictions du coach.
 *
 * Les interdits sont formulés comme des refus de PUBLICATION, pas comme des
 * préférences: chacun d'eux est adossé à une ceinture de `acceptComposedRecap`
 * qui le vérifie sur le texte exact. Une règle de prompt sans vérificateur est
 * une intention, et ce dépôt a assez de gardes vertes et désarmées comme ça.
 */
export function buildRecapSystemPrompt(args: {
  doctrineBlock: string;
  facts: DayFacts;
}): string {
  return [
    "You are Sophia, the day-to-day voice of this student's coach.",
    "",
    "It is the evening. You are writing an unprompted note about the day that is ending. The student did not ask for it, and this is not a reply to anything.",
    "",
    "WHAT YOU KNOW — these facts, and nothing else exists:",
    describeDayFacts(args.facts),
    "",
    "HARD RULES — a message that breaks any of these is discarded, not fixed:",
    `- One to two sentences. Never more than ${RECAP_MAX_CHARS} characters.`,
    "- Say what happened, using only the facts above. Never state a number, a meal, a day or a streak that is not in them.",
    "- Do NOT praise, congratulate or judge. No 'great day', no 'well done', no 'nice work', no 'keep it up', no 'proud of you'. Naming what the student did IS the message; an adjective on top of it is not.",
    "- Never mention adherence, tracking, targets, streaks or weight.",
    "- Ask NOTHING. No question of any kind, not even a rhetorical one.",
    "- Do not tell them what to do tomorrow, and do not comment on what is missing.",
    "- Plain text only. No markdown, no quotation marks around the message, no 'Sophia:' prefix.",
    "",
    "Reply with the message itself and nothing else.",
    "",
    "── THE COACH'S METHOD (their voice is the one you write in) ──",
    args.doctrineBlock,
  ].join("\n");
}

/** Le tour « utilisateur »: le déclencheur, pas le contexte. */
export function buildRecapUserPrompt(firstName: string): string {
  const name = String(firstName ?? "").trim();
  return name
    ? `Write the note. The student's first name is ${name}.`
    : "Write the note. You do not know the student's first name — do not invent one, and do not use a placeholder.";
}

// ---------------------------------------------------------------------------
// LA CEINTURE
// ---------------------------------------------------------------------------

/**
 * LE VERDICT SUR LA JOURNÉE — la ceinture qui porte la décision produit.
 *
 * ── CONDITION DE DÉSARMEMENT (doctrine P9) ──────────────────────────────────
 * Elle mord sur ce qui qualifie **la journée, le travail ou l'élève**. Elle ne
 * mord PAS sur ce qui qualifie un PLAT ou un ALIMENT: « a good source of
 * protein » doit passer — c'est de la nutrition, pas un bulletin. Les motifs
 * exigent donc le nom qualifié (`day`, `job`, `work`, `week`, `going`) ou une
 * adresse directe à l'élève, jamais un adjectif seul.
 */
export const VERDICT_PATTERNS: readonly RegExp[] = [
  /\b(?:great|good|solid|strong|excellent|amazing|awesome|fantastic|perfect|impressive|beautiful)\s+(?:day|job|work|week|going|effort|going)\b/i,
  /\bwell\s+done\b/i,
  /\bnice\s+(?:work|going|job|one)\b/i,
  /\bgood\s+(?:on\s+you|stuff)\b/i,
  /\b(?:proud\s+of\s+you|you\s+should\s+be\s+proud)\b/i,
  /\bkeep\s+(?:it\s+up|going|that\s+up|at\s+it)\b/i,
  /\byou'?re\s+(?:doing\s+(?:great|well|amazing)|crushing|killing|smashing|nailing)\b/i,
  /\b(?:crushing|smashing|nailing|killing)\s+it\b/i,
  /\bthat'?s\s+(?:the\s+way|how\s+it'?s\s+done)\b/i,
  /\bbravo\b/i,
  // FR — la conversation peut sortir en français le jour où le verrou du
  // pilote saute. La cicatrice `guard-tested-in-one-language-only` du dépôt
  // vient d'une garde écrite dans une seule langue; on ne la refait pas.
  // ⚠️ PAS de `\b` FINAL: en JS il se calcule sur l'alphabet ASCII, et « é »
  // n'en est pas. `/\bbien\s+jou[ée]\b/` ne mord donc PAS sur « Bien joué, » —
  // aucune frontière entre un « é » et une virgule, les deux étant non-mots.
  // Mesuré: le motif était écrit, testé nulle part, et laissait passer la
  // formule la plus courante. C'est la cicatrice `guard-tested-in-one-language-
  // only` sous une autre forme — la garde existe, la langue la contourne.
  /\bbien\s+jou[ée]e?(?![\p{L}])/iu,
  /\bf[ée]licitations?\b/i,
  /\bcontinue\s+comme\s+[çc]a\b/i,
  /\btu\s+g[èe]res\b/i,
  /\b(?:super|belle|bonne)\s+(?:journ[ée]e|boulot|travail)\b/i,
];

/**
 * Le premier verdict trouvé, ou `null`. Le point d'entrée PARTAGÉ de la
 * ceinture: le bilan hebdomadaire (`week_review.ts`) porte exactement la même
 * interdiction, et une seconde liste de motifs finirait par diverger de
 * celle-ci — deux vocabulaires pour une même règle produit est le défaut que
 * `tokens.ts` documente en tête de fichier.
 *
 * Ces motifs ne sont PAS globaux (`/g`): `exec` repart donc du début à chaque
 * appel, et deux consommateurs ne se volent pas leur `lastIndex`.
 */
export function findQualifyingVerdict(text: string): string | null {
  for (const pattern of VERDICT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * LES NOMS DE CHOSES QU'ON COMPTE. Un nombre n'est vérifié que devant l'un
 * d'eux — c'est ce qui distingue « one meal » (un compte, donc vérifiable)
 * de « one thing I noticed » (un pronom, donc pas un chiffre).
 *
 * Sans cette restriction, la ceinture refuserait des textes corrects et le
 * repli deviendrait le cas nominal en silence: exactement le défaut que
 * `sanitizeComposedNudge` documente pour la relance, « un composeur mort
 * déguisé en composeur prudent ».
 */
const COUNTABLE = "meals?|dish|dishes|plates?|days?|photos?|logs?|entr(?:y|ies)";

export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const NUM = `\\d+|${Object.keys(NUMBER_WORDS).join("|")}`;

/** « 3 meals », « two of the dishes », « 3 more plates ». */
const COUNT_BEFORE_NOUN = new RegExp(
  `\\b(${NUM})\\b(?:\\s+\\w+){0,2}\\s+(?:${COUNTABLE})\\b`,
  "gi",
);
/** « 2/4 », « 2 out of 4 », « two of four » — les deux nombres comptent. */
const COUNT_RATIO = new RegExp(
  `\\b(${NUM})\\s*(?:/|out\\s+of|of\\s+the|of)\\s*(${NUM})\\b`,
  "gi",
);

/**
 * La valeur d'un jeton numérique, chiffre ou mot. Exporté pour la même raison
 * que `findQualifyingVerdict`: le bilan hebdomadaire compte d'autres noms
 * (`portions`, `times`) mais avec le MÊME vocabulaire de nombres, et deux
 * tables `one..twelve` divergeraient au premier ajout.
 */
export function numberValue(token: string): number | null {
  const raw = String(token ?? "").trim().toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw in NUMBER_WORDS ? NUMBER_WORDS[raw] : null;
}

/**
 * Les nombres que le texte a le droit de porter: ceux qu'on a DONNÉS, et eux
 * seuls.
 *
 * C'est la garde la plus structurelle du module, et c'est la leçon de
 * `tracking-projection-not-grounded-db`: un récapitulatif qui a le droit
 * d'énoncer des chiffres finit par en énoncer un qu'aucune ligne ne porte, et
 * ce chiffre-là est indiscernable des vrais pour l'élève comme pour le coach.
 */
export function allowedNumbers(facts: DayFacts): Set<number> {
  return new Set([
    facts.tickedCount,
    // ⚠️ LE PIÈGE LE PLUS TRANCHANT DE CE FICHIER. `tickedForPlanCount` apparaît
    // dans le ratio; s'il manquait ici, un corps composé PARFAITEMENT exact
    // serait rejeté en `invented_number` et le message replierait sur le texte
    // déterministe — la voix du coach disparaîtrait sans une seule erreur nulle
    // part, et sans que personne ne sache pourquoi.
    facts.tickedForPlanCount,
    facts.plannedCount,
    facts.photoCount,
    // Le nombre de titres CITÉS. Il ne vaut pas toujours `tickedCount` (coche
    // sans titre), et un texte qui énumère les plats qu'on lui a donnés puis
    // les compte a raison — le refuser ferait replier une composition exacte.
    facts.tickedTitles.filter((t) => cleanTitle(t)).length,
  ]);
}

export type RecapVerdictReason =
  | "empty"
  | "too_long"
  | "too_many_sentences"
  | "guilt_tripping"
  | "prompt_artefact"
  | "qualifies_the_day"
  | "asks_a_question"
  | "invented_number";

export type RecapVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: RecapVerdictReason; detail: string };

/**
 * La ceinture complète, sur le texte EXACT que l'élève lirait.
 *
 * Rend un verdict plutôt que de lever, pour la même raison que la relance:
 * l'appelant a un repli déterministe et doit pouvoir le prendre EN COMPTANT le
 * motif. Une exception l'obligerait à l'attraper pour ne rien en faire, ce qui
 * finit toujours en `catch {}`.
 */
export function acceptComposedRecap(raw: string, facts: DayFacts): RecapVerdict {
  // Le même nettoyage que la relance: un modèle enveloppe de guillemets et
  // préfixe son rôle par réflexe, et refuser pour ça ferait replier tout le
  // monde. Nettoyer PUIS juger, jamais l'inverse.
  const text = sanitizeComposedNudge(raw);
  if (!text) return { ok: false, reason: "empty", detail: "" };

  if (text.length > RECAP_MAX_CHARS) {
    return { ok: false, reason: "too_long", detail: `${text.length} > ${RECAP_MAX_CHARS}` };
  }

  const sentences = countSentences(text);
  if (sentences > RECAP_MAX_SENTENCES) {
    return {
      ok: false,
      reason: "too_many_sentences",
      detail: `${sentences} > ${RECAP_MAX_SENTENCES}`,
    };
  }

  for (const pattern of PROMPT_ARTEFACT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { ok: false, reason: "prompt_artefact", detail: match[0] };
  }

  // Une question ici n'aurait aucun bouton pour y répondre les jours où le tap
  // n'est pas dû, et doublerait la question du soir les jours où il l'est. Le
  // récapitulatif DONNE; il ne demande rien.
  if (text.includes("?") || text.includes("？")) {
    return { ok: false, reason: "asks_a_question", detail: "?" };
  }

  const guilt = findGuiltTripping(text);
  if (guilt.length > 0) {
    return {
      ok: false,
      reason: "guilt_tripping",
      detail: guilt.map((f) => f.matchedText).join(" | "),
    };
  }

  const verdict = findQualifyingVerdict(text);
  if (verdict) {
    return { ok: false, reason: "qualifies_the_day", detail: verdict };
  }

  const allowed = allowedNumbers(facts);
  for (const pattern of [COUNT_BEFORE_NOUN, COUNT_RATIO]) {
    // `lastIndex` survit à un appel sur un regex global: sans remise à zéro,
    // le second texte jugé repartirait du milieu du premier.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      for (const token of match.slice(1)) {
        if (token === undefined) continue;
        const value = numberValue(token);
        if (value !== null && !allowed.has(value)) {
          return {
            ok: false,
            reason: "invented_number",
            detail: `${match[0].trim()} (allowed: ${[...allowed].join(",")})`,
          };
        }
      }
    }
  }

  return { ok: true, text };
}
