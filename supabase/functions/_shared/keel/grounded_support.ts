/**
 * FF-011 — LE SOUTIEN GROUNDÉ, ÉTENDU À LA CONVERSATION.
 *
 * ── LE DÉFAUT ───────────────────────────────────────────────────────────────
 * « Cette semaine a été horrible, j'ai rien tenu. » L'agent répondait quelque
 * chose de chaleureux et de vide: courage, demain est un autre jour, tu vas y
 * arriver.
 *
 * Ce produit avait déjà tranché que c'est INTERDIT, et il l'avait écrit deux
 * fois. Le message du soir porte la règle en toutes lettres — « le fait est le
 * compliment » — avec `findQualifyingVerdict` qui refuse « bien joué »,
 * « continue comme ça », « tu gères », et `allowedNumbers` qui refuse un nombre
 * absent des faits. Le bilan hebdomadaire partage la MÊME liste, exprès.
 *
 * Le chat n'avait rien de tout ça. La même phrase interdite à 20 h était
 * autorisée dans la conversation à 20 h 05, par le même agent, au même
 * utilisateur — et c'est là qu'elle fait le plus de dégâts, parce que c'est là
 * que la personne vient quand ça va mal.
 *
 * ── LE COÛT, ET IL N'EST PAS RÉPARABLE ──────────────────────────────────────
 * Écrit dans `daily_recap.ts`: « le soir où Sophia félicite pour une journée
 * que l'élève sait mauvaise, tout le canal devient non-crédible, et il n'y a
 * pas de retour en arrière ». Un encouragement creux ne rate pas sa cible: il
 * DÉTRUIT la valeur de tous les messages suivants, y compris les vrais.
 *
 * ── AUCUNE SECONDE LISTE DE MOTIFS ──────────────────────────────────────────
 * `VERDICT_PATTERNS`, `findQualifyingVerdict`, `allowedNumbers`,
 * `allowedWeekNumbers`, `numberValue` sont IMPORTÉS, jamais recopiés. Le soir,
 * l'hebdo et le chat partagent une seule règle produit; deux vocabulaires pour
 * une même règle divergent, toujours. C'est le défaut que l'en-tête de
 * `findQualifyingVerdict` nomme, et l'élargir ici casserait le message du soir.
 *
 * ── CE QUE CE MODULE NE TOUCHE PAS ──────────────────────────────────────────
 * La crise et le plancher TCA ont leurs propres chemins, leurs ressources par
 * pays et leurs gardes. Cette ceinture s'applique APRÈS qu'ils ont dit non, et
 * elle ne décide JAMAIS qu'un tour n'est pas une crise.
 */

import {
  allowedNumbers,
  type DayFacts,
  findQualifyingVerdict,
  numberValue,
  NUMBER_WORDS,
} from "./daily_recap.ts";
import { allowedWeekNumbers, type WeekReviewReading } from "./week_review.ts";

// ---------------------------------------------------------------------------
// LE TOUR DE DÉCOURAGEMENT — déterministe, jamais confié au modèle
// ---------------------------------------------------------------------------

/** Normalisation, identique en esprit aux planchers voisins. */
function fold(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * CE QUI FAIT D'UN TOUR UN TOUR DE DÉCOURAGEMENT. Liste FERMÉE, FR + EN.
 *
 * ── POURQUOI DÉTERMINISTE, ET POURQUOI ÉTROIT ──────────────────────────────
 * La ceinture ne s'arme QUE sur ces tours. Trop large, elle mordrait des
 * réponses correctes partout et le repli deviendrait le cas nominal en silence
 * — le défaut que `sanitizeComposedNudge` documente. Trop étroite, elle laisse
 * passer un encouragement creux. On penche vers l'étroit: la liste ne contient
 * que des formules où la personne DIT que ça va mal, jamais une humeur devinée.
 *
 * ⚠️ CHAQUE FORME EST ÉCRITE DANS LES DEUX LANGUES. La cicatrice du dépôt est
 * précise: `/\bbien\s+jou[ée]\b/` ne mordait pas sur « Bien joué, » parce qu'en
 * JS `\b` se calcule sur l'ASCII et que « é » n'en est pas. Une garde testée
 * dans une seule langue est une garde à moitié désarmée.
 */
const DISCOURAGEMENT_PATTERNS: readonly RegExp[] = [
  // FR — la semaine, la journée, le moment
  /\b(?:cette semaine|ma semaine|la semaine) (?:a ete|etait|est) (?:horrible|catastrophique|nulle|pourrie|difficile|dure|compliquee|un desastre)\b/,
  /\b(?:ma |cette |la )?journee (?:a ete|etait|est) (?:horrible|nulle|pourrie|difficile|dure|catastrophique)\b/,
  /\b(?:c est|ca a ete|ca a été|ca ete) (?:dur|difficile|horrible|nul|la galere|complique)\b/,
  // FR — la personne
  /\bj ai (?:rien|pas) tenu\b/,
  /\bje (?:craque|craquе|lache|abandonne|n y arrive pas|y arrive pas)\b/,
  /\bje suis (?:decourage|decouragee|nul|nulle|perdu|perdue|a bout|epuise|epuisee)\b/,
  /\bj en ai marre\b/,
  /\bje me sens (?:mal|nul|nulle|coupable|decourage|decouragee)\b/,
  /\bca (?:sert a rien|marche pas|va pas)\b/,
  /\bje (?:tiens plus|n en peux plus|en peux plus)\b/,
  // EN — the week, the day, the stretch
  /\b(?:this|the|my) (?:week|day|month) (?:has been|was|is) (?:horrible|terrible|awful|rough|hard|a disaster|a write off|a mess)\b/,
  /\bit (?:has been|s been|was) (?:a )?(?:rough|hard|terrible|awful|horrible|tough)\b/,
  // EN — the person
  /\bi (?:didn t|did not|haven t|have not) (?:stuck to|kept to|managed|held)\b/,
  /\bi (?:m|am) (?:struggling|discouraged|exhausted|useless|hopeless|done|giving up|falling apart)\b/,
  /\bi (?:gave up|blew it|messed up|screwed up|fell off)\b/,
  /\bi feel (?:awful|terrible|useless|guilty|like a failure|rubbish)\b/,
  /\bi can t (?:do this|keep|manage)\b/,
  /\bwhat s the point\b/,
  /\bnothing (?:is )?work(?:s|ing)\b/,
];

export type DiscouragementHit = { matched: string };

/**
 * Le tour est-il un tour de découragement ?
 *
 * ⚠️ CE N'EST PAS UN DÉTECTEUR DE DÉTRESSE. La frontière découragement/détresse
 * est réelle et floue; cette fonction ne la déplace pas. Elle s'exécute APRÈS
 * que les gardes de crise et le plancher TCA ont statué, et un `null` ici ne
 * dit rien de la sécurité du tour.
 */
export function detectDiscouragementTurn(
  userMessage: unknown,
): DiscouragementHit | null {
  const text = ` ${fold(userMessage)} `;
  if (!text.trim()) return null;
  for (const pattern of DISCOURAGEMENT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { matched: match[0].trim() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// LA MATIÈRE — `recapGround` décide AVANT la rédaction
// ---------------------------------------------------------------------------

export type SupportGround = "day" | "week" | "none";

/**
 * Y a-t-il de quoi être groundé ?
 *
 * Le jour d'abord: un fait d'aujourd'hui répond mieux à « ça a été dur » qu'un
 * compte de la semaine dernière. Puis la semaine. Puis rien — et « rien » n'est
 * pas un échec du chargeur, c'est un état qui a sa propre règle (R5: court et
 * sobre, jamais chaleureux pour compenser).
 */
export function supportGround(
  facts: DayFacts | null,
  week: WeekReviewReading | null,
): SupportGround {
  if (facts && (facts.tickedCount > 0 || facts.photoCount > 0 || facts.offPlanCount > 0)) {
    return "day";
  }
  if (week && week.coverage.totalFacts > 0) return "week";
  return "none";
}

/**
 * LE BLOC DE CONTEXTE. Il donne la matière, ou il raccourcit la laisse.
 *
 * `recapGround` décide AVANT la rédaction: on ne demande pas au modèle d'être
 * groundé, on lui donne de quoi l'être ou on lui interdit la chaleur
 * compensatoire.
 *
 * ── IL NE RÉPÈTE PAS LE BILAN HEBDO ────────────────────────────────────────
 * Les chiffres de la semaine sont déjà dans le bloc `weekReviewPromptBlock`, et
 * le budget de prompt tronque par la queue. Ce bloc-ci ne porte donc que les
 * faits du JOUR — que rien d'autre ne porte — plus la règle de conduite.
 *
 * @param facts les faits du jour, ou `null` (non chargés / plancher levé).
 * @param ground le verdict de `supportGround`. REQUIS: un paramètre optionnel
 *   est une garde désarmée, et celui-ci décide de la moitié du bloc.
 */
export function groundedSupportBlock(
  facts: DayFacts | null,
  ground: SupportGround,
): string {
  const lines: string[] = [];
  lines.push("== SUPPORT IS GROUNDED OR IT IS SHORT ==");
  lines.push("");

  if (facts && ground === "day") {
    lines.push("TODAY, AS THEY REPORTED IT:");
    lines.push(`- Dishes ticked off the plan today: ${facts.tickedCount}`);
    if (facts.plannedCount > 0) {
      lines.push(`- Dishes the plan held for today: ${facts.plannedCount}`);
    }
    lines.push(`- Meal photos sent today: ${facts.photoCount}`);
    lines.push(`- Meals reported off the plan today: ${facts.offPlanCount}`);
    lines.push(
      "- These are separate counts. Never add them up, never turn them into a " +
        "rate, and never state a number that is not written here or in the " +
        "reviewed-week block above.",
    );
  } else if (ground === "week") {
    lines.push(
      "You have nothing from TODAY. The reviewed-week block above is the only " +
        "material you have; use it, with its dates, or say nothing about it.",
    );
  } else {
    lines.push(
      "YOU HAVE NO MATERIAL. Not today, not from the reviewed week.",
    );
  }

  lines.push("");
  lines.push("WHEN THEY SAY IT IS GOING BADLY:");
  lines.push(
    "- Answer with something they did not already know: a fact they reported. " +
      "The fact IS the support. An adjective on top of it is not.",
  );
  lines.push(
    "- NO hollow encouragement. Not 'well done', not 'keep it up', not 'you've " +
      "got this', not 'tomorrow is a new day', not 'bien joué', not 'continue " +
      "comme ça'. This is the single rule this product will not bend.",
  );
  lines.push(
    "- No verdict on the day or the week, even a positive one, even a true one. " +
      "A count does not suggest an answer; a judgement does.",
  );
  if (ground === "none") {
    lines.push(
      "- WITH NO MATERIAL: keep it SHORT AND PLAIN. You may say you do not know. " +
        "Do not compensate with warmth — warmth instead of a fact is exactly " +
        "what makes this channel stop being believed.",
    );
  }
  lines.push(
    "- Asking them to tell you about their day is NOT support, it is collection. " +
      "Do not do it.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LA CEINTURE, SUR LE TEXTE VISIBLE
// ---------------------------------------------------------------------------

export type SupportBeltReason = "qualifies_the_day" | "invented_number";

export interface SupportBeltResult {
  text: string;
  /** Les motifs, pour l'observabilité de §10. Vide = la ceinture n'a pas mordu. */
  reasons: SupportBeltReason[];
  /** Le passage exact qui a mordu, pour que le log soit lisible. */
  matched: string[];
}

/** Les noms de choses qu'on compte, réunion des deux surfaces existantes. */
const COUNTABLE = "meals?|dish|dishes|plates?|days?|times?|portions?|servings?|" +
  "photos?|logs?|entr(?:y|ies)|weeks?";
const NUM = `\\d+|${Object.keys(NUMBER_WORDS).join("|")}`;
const COUNT_BEFORE_NOUN = new RegExp(
  `\\b(${NUM})\\b(?:\\s+\\w+){0,2}\\s+(?:${COUNTABLE})\\b`,
  "gi",
);
const COUNT_RATIO = new RegExp(
  `\\b(${NUM})\\s*(?:/|out\\s+of|of\\s+the|of)\\s*(${NUM})\\b`,
  "gi",
);

/**
 * LE REPLI DÉTERMINISTE, quand la ceinture a tout retiré.
 *
 * R8: on RÉÉCRIT, on ne bloque pas — un tour muet est pire qu'un tour sobre.
 * Il est sec par construction: pas de consolation, pas de question, pas de
 * chiffre. Il dit exactement ce qui s'est passé, sans le nommer.
 */
function soberFallback(contentLocale: string): string {
  return String(contentLocale ?? "").toLowerCase().startsWith("fr")
    ? "Je préfère ne rien affirmer que je ne puisse pas appuyer sur un fait."
    : "I'd rather not claim anything I can't back with a fact.";
}

/** Découpe en phrases EN GARDANT leur ponctuation: on réécrit, on ne reformate pas. */
function splitSentences(text: string): string[] {
  const out = text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g);
  return out ? out.filter((s) => s.trim().length > 0) : [];
}

/** Un nombre non autorisé dans cette phrase, ou `null`. */
function disallowedNumberIn(sentence: string, allowed: Set<number>): string | null {
  for (const pattern of [COUNT_BEFORE_NOUN, COUNT_RATIO]) {
    // `lastIndex` survit à un appel sur un regex global: sans remise à zéro, la
    // phrase suivante repartirait du milieu de la précédente.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence)) !== null) {
      for (const token of match.slice(1)) {
        if (token === undefined) continue;
        const value = numberValue(token);
        if (value !== null && !allowed.has(value)) return match[0].trim();
      }
    }
  }
  return null;
}

/**
 * La ceinture, appliquée au TEXTE VISIBLE du chat.
 *
 * ── ELLE RÉÉCRIT PHRASE PAR PHRASE ─────────────────────────────────────────
 * Refuser le tour entier sur une formule de trop remplacerait une réponse utile
 * par un repli — et le repli qui devient le cas nominal est « un composeur mort
 * déguisé en composeur prudent ». On retire LA phrase fautive et on garde le
 * reste, qui est la partie groundée.
 *
 * ── ELLE NE S'ARME QUE SUR UN TOUR DE DÉCOURAGEMENT ────────────────────────
 * L'appelant en décide (`detectDiscouragementTurn`). Sur les autres tours, un
 * « bien joué » adressé à autre chose que la journée n'est pas ce que la fiche
 * traite, et mordre partout ferait exactement le dégât que §10 dit de mesurer.
 *
 * @param facts les faits du jour, ou `null` — `null` n'autorise AUCUN nombre
 *   de journée, ce qui est la posture juste: on ne justifie pas un chiffre avec
 *   des faits qu'on n'a pas lus.
 * @param week la lecture de la semaine gelée, ou `null`. Ses nombres sont
 *   autorisés parce qu'ils sont DANS le prompt: les refuser ferait replier une
 *   réponse parfaitement exacte, et la voix du coach disparaîtrait sans qu'une
 *   seule erreur n'apparaisse nulle part.
 * @param contentLocale la langue persistée de l'élève, pour le repli. REQUIS.
 */
export function applyGroundedSupportBelt(args: {
  text: string;
  facts: DayFacts | null;
  week: WeekReviewReading | null;
  contentLocale: string;
}): SupportBeltResult {
  const original = String(args.text ?? "");
  if (!original.trim()) return { text: original, reasons: [], matched: [] };

  const allowed = new Set<number>([
    ...(args.facts ? allowedNumbers(args.facts, null) : []),
    ...(args.week ? allowedWeekNumbers(args.week) : []),
  ]);

  const reasons: SupportBeltReason[] = [];
  const matched: string[] = [];
  const kept: string[] = [];

  for (const sentence of splitSentences(original)) {
    const verdict = findQualifyingVerdict(sentence);
    if (verdict) {
      if (!reasons.includes("qualifies_the_day")) reasons.push("qualifies_the_day");
      matched.push(verdict);
      continue;
    }
    const invented = disallowedNumberIn(sentence, allowed);
    if (invented) {
      if (!reasons.includes("invented_number")) reasons.push("invented_number");
      matched.push(invented);
      continue;
    }
    kept.push(sentence);
  }

  if (reasons.length === 0) return { text: original, reasons: [], matched: [] };

  const rewritten = kept.join("").trim();
  return {
    text: rewritten || soberFallback(args.contentLocale),
    reasons,
    matched,
  };
}
