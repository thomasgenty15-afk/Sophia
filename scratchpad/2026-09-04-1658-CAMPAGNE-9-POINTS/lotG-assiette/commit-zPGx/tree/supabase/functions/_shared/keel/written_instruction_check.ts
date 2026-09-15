/**
 * LE SECOND TOUR DU DOUBLE VERROU, pointé sur ce que l'élève a ÉCRIT. PUR.
 *
 * ── LE DÉFAUT QUE ÇA FERME ────────────────────────────────────────────────
 * `buildMealPrompt` demande au modèle, en toutes lettres, de NOMMER ce qu'il
 * n'a pas pu honorer d'une consigne écrite. C'est une consigne de prompt — et
 * ce dépôt a déjà mesuré ce que vaut une consigne de prompt: le verrou des
 * règles de maison (`household_restriction_lock.ts`) existe parce que le
 * modèle, à qui le prompt disait de ne pas commenter une règle parentale, a
 * écrit « honore la demande de pâtes de Lea avec une sauce protéinée, SANS
 * NUTELLA » au premier run réel.
 *
 * Une consigne de prompt régresse. Le verrou, lui, se vérifie.
 *
 * ── CE QUE CE MODULE DIT, ET CE QU'IL NE DIT PAS ──────────────────────────
 * Il répond à UNE question par consigne écrite: est-ce que le plan en parle,
 * d'une façon ou d'une autre ? Trois issues, et la troisième est le sujet:
 *
 *   `served`     — les mots de la consigne sont dans le plan. Rien à dire.
 *   `explained`  — ils n'y sont pas, mais un `why` les nomme. Le modèle a
 *                  rendu des comptes; c'est exactement ce qu'on demandait.
 *   `silent`     — ils n'y sont pas, et aucun `why` n'en parle. LA CONSIGNE A
 *                  ÉTÉ AVALÉE. C'est le seul cas qui intéresse l'appelant.
 *
 * Il ne juge PAS si la raison donnée est bonne. « Je n'ai pas mis de pruneaux
 * parce que je n'en avais pas envie » compte comme `explained`: décider qu'une
 * justification est valable demanderait de comprendre la phrase, et un module
 * pur qui prétend faire ça se trompe en silence. Ce qu'on garantit, c'est
 * qu'une consigne ne DISPARAÎT pas — pas qu'elle est bien arbitrée.
 *
 * ── POURQUOI LE MATCHER DU DÉPÔT, ET RIEN D'AUTRE ─────────────────────────
 * `findForbiddenMatches` porte les frontières de mots et la liste FERMÉE des
 * négations. Un `includes()` maison ferait matcher « lait » dans « laitue »:
 * 12 faux positifs sur 12 mesurés, la dernière fois qu'on a essayé. Et la
 * tolérance à la négation est ACTIVE ici pour la même raison qu'ailleurs: une
 * méthode qui dit « sans pruneaux » ne sert pas de pruneaux, et la compter
 * comme servie annoncerait honorée une consigne qui ne l'est pas.
 */

import { findForbiddenMatches, type ForbiddenTerm } from "./forbidden_matcher.ts";

/** Un plat, réduit à ce que ce module regarde. */
export interface CheckableDish {
  title?: unknown;
  why?: unknown;
  method?: unknown;
  ingredients?: unknown;
}

export type WrittenInstructionStatus = "served" | "explained" | "silent";

export interface WrittenInstructionVerdict {
  /** La consigne, telle que l'élève l'a écrite. */
  instruction: string;
  status: WrittenInstructionStatus;
  /**
   * Les mots de la consigne qu'on a cherchés. Vide ⇒ on n'a rien su en tirer,
   * et le verdict est `served` par ABSTENTION (voir `MIN_TERM_LENGTH`).
   */
  terms: string[];
}

/**
 * LES MOTS QU'ON NE CHERCHE PAS — liste FERMÉE, EN + FR.
 *
 * Une consigne est une phrase, pas un mot-clé: « je ne mange jamais le matin »
 * porte huit mots dont un seul est un aliment, et « matin » n'apparaît dans
 * aucun plat. Chercher tous les mots ferait rendre `silent` à peu près tout,
 * et un signal qui crie toujours ne se lit plus.
 *
 * ⚠️ LA DIRECTION DE L'ERREUR EST CHOISIE. Cette liste sous-détecte
 * volontairement: mieux vaut manquer une consigne avalée que d'en signaler dix
 * qui ne l'étaient pas. Le coût d'un faux positif est un appelant qui apprend à
 * ignorer ce module; celui d'un faux négatif est un silence de plus dans un
 * produit qui en avait déjà un.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  // FR — outils
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "ne", "pas", "plus", "jamais", "rien", "aucun", "aucune",
  "le", "la", "les", "un", "une", "des", "du", "de", "au", "aux",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "et", "ou", "mais", "donc", "car", "que", "qui", "quoi", "dont",
  "dans", "sur", "sous", "avec", "sans", "pour", "par", "chez", "vers",
  "mange", "manger", "mangue", "prends", "prendre", "bois", "boire",
  "veux", "vouloir", "peux", "pouvoir", "aime", "aimer", "deteste",
  "toujours", "souvent", "parfois", "tous", "toutes", "tout", "toute",
  "matin", "midi", "soir", "matins", "soirs", "jour", "jours",
  "semaine", "semaines", "fois", "peu", "beaucoup", "tres", "trop",
  "est", "sont", "suis", "etre", "ai", "as", "avoir", "fait", "faire",
  // EN — outils
  "i", "you", "he", "she", "we", "they", "it",
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "with",
  "and", "or", "but", "so", "if", "not", "no", "never", "always",
  "my", "your", "his", "her", "our", "their",
  "eat", "eats", "eating", "have", "has", "had", "take", "takes",
  "want", "wants", "like", "likes", "hate", "hates", "do", "does",
  "am", "is", "are", "be", "been", "morning", "noon", "evening",
  "night", "day", "days", "week", "weeks", "time", "times",
  "some", "any", "all", "every", "much", "many", "very", "too",
  // LES JOURS, EN + FR. Ce ne sont pas des aliments, et ils n'apparaissent
  // dans aucun titre de plat: sans eux, « je mange des pruneaux le MARDI
  // matin » cherchait « mardi » dans le plan et ne le trouvait jamais.
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/**
 * LA LONGUEUR MINIMALE D'UN MOT CHERCHÉ.
 *
 * Sous quatre lettres, un mot est soit un outil que `STOP_WORDS` n'a pas
 * listé, soit trop court pour que sa présence dans un plat veuille dire quoi
 * que ce soit. « riz » est le contre-exemple qui coûte — il est accepté parce
 * que trois lettres est la borne, pas quatre.
 */
const MIN_TERM_LENGTH = 3;

/** Les mots d'une consigne qui valent la peine d'être cherchés. */
export function termsOfInstruction(instruction: string): string[] {
  const words = String(instruction ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const raw of words) {
    // ── LE PLURIEL SE PERD DANS LE MAUVAIS SENS, ET ÇA A ÉTÉ MESURÉ ───────
    // `tokenPattern` tolère un `s` AJOUTÉ au jeton (`prune` trouve « prunes »),
    // jamais un `s` RETIRÉ. La consigne « I eat prunes » cherchait donc
    // littéralement « prunes » et ne trouvait pas le plat « Prune porridge » —
    // rendu `silent` alors qu'il honorait la consigne à la lettre.
    //
    // On dépose donc le `s` ici, et la tolérance du matcher couvre les deux
    // formes. Le dépôt du `s` se fait AVANT la liste d'outils, ce qui la rend
    // plus efficace au passage (« mornings » retombe sur « morning »).
    const w = raw.endsWith("s") && raw.length - 1 >= MIN_TERM_LENGTH
      ? raw.slice(0, -1)
      : raw;
    if (w.length < MIN_TERM_LENGTH) continue;
    // LES DEUX FORMES SONT TESTÉES, et c'est le `s` déposé juste au-dessus qui
    // l'exige: « jamais » devient « jamai », qui n'est dans aucune liste et
    // partait donc chercher un aliment inexistant dans le plan. Un mot-outil
    // le reste, amputé ou non.
    if (STOP_WORDS.has(w) || STOP_WORDS.has(raw)) continue;
    if (out.includes(w)) continue;
    out.push(w);
  }
  return out;
}

function textOfDish(dish: CheckableDish): string {
  const ingredients = Array.isArray(dish.ingredients)
    ? (dish.ingredients as unknown[])
      .map((i) =>
        i && typeof i === "object"
          ? String((i as Record<string, unknown>).term ?? "")
          : String(i ?? "")
      )
      .join(" ")
    : "";
  return [
    String(dish.title ?? ""),
    String(dish.method ?? ""),
    ingredients,
  ].join(" ");
}

/**
 * Le verdict, consigne par consigne.
 *
 * `dishes` est le plan tel que le parseur l'a rendu. L'appelant décide quoi
 * faire des `silent` — ce module ne jette rien et ne réécrit rien.
 */
export function checkWrittenInstructions(args: {
  instructions: readonly string[];
  dishes: readonly CheckableDish[];
}): WrittenInstructionVerdict[] {
  const out: WrittenInstructionVerdict[] = [];
  // LE CORPS DU PLAN et LES JUSTIFICATIONS sont lus SÉPARÉMENT, et c'est tout
  // le mécanisme: un mot qui n'est que dans un `why` dit « j'en parle », un mot
  // qui est dans un titre ou des ingrédients dit « je l'ai servi ». Les fondre
  // ferait passer « je n'ai pas mis de pruneaux » pour un plat aux pruneaux.
  const bodyText = args.dishes.map(textOfDish).join(" \n ");
  const whyText = args.dishes.map((d) => String(d.why ?? "")).join(" \n ");

  for (const instruction of args.instructions) {
    const terms = termsOfInstruction(instruction);
    if (terms.length === 0) {
      // ABSTENTION. Une consigne dont on ne tire aucun mot cherchable ne peut
      // pas être déclarée avalée: on ne saurait pas la reconnaître même si le
      // plan la respectait parfaitement. `served` est la direction sûre — elle
      // ne fait accuser personne.
      out.push({ instruction, status: "served", terms });
      continue;
    }
    const needles: ForbiddenTerm[] = terms.map((t) => ({
      ruleId: instruction,
      token: t,
    }));
    const inBody = findForbiddenMatches(bodyText, needles).length > 0;
    if (inBody) {
      out.push({ instruction, status: "served", terms });
      continue;
    }
    // ⚠️ LA NÉGATION EST DÉSACTIVÉE POUR LE `why`, et c'est le point. Ici on ne
    // demande pas « est-ce servi ? » mais « en parle-t-on ? » — et la phrase
    // qui nous intéresse est justement la phrase NIÉE (« pas de pruneaux cette
    // semaine, parce que… »). La tolérance active la rendrait invisible, donc
    // muette, donc signalée à tort.
    const inWhy =
      findForbiddenMatches(whyText, needles, { allowNegatedMentions: false })
        .length > 0;
    out.push({
      instruction,
      status: inWhy ? "explained" : "silent",
      terms,
    });
  }
  return out;
}

/** Les consignes que le plan a AVALÉES. Vide = rien à signaler. */
export function silentInstructions(
  verdicts: readonly WrittenInstructionVerdict[],
): string[] {
  return verdicts.filter((v) => v.status === "silent").map((v) => v.instruction);
}
