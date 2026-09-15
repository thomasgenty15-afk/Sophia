/**
 * FF-061 — LES QUATRE PORTES DU COMPTE-RENDU, et le texte qu'elles laissent
 * passer. Module PUR.
 *
 * `request_report.ts` calcule des FAITS: ce qui a été demandé, ce qui a été
 * servi. Ce module-ci décide de ce qu'on a le DROIT d'en dire, et l'assemble.
 * Les deux sont séparés parce qu'un fait vrai n'est pas toujours une phrase
 * qu'on prononce.
 *
 * ── L'ORDRE DES PORTES EST L'ALGORITHME ───────────────────────────────────
 *
 *   1. PLANCHER TCA ......... aucun compte-rendu, sans exception
 *   2. RÈGLES DE MAISON ..... un terme couvert n'est jamais cité
 *   3. DOCTRINE DU COACH .... la ligne qui la heurte tombe
 *   4. ANTI-CULPABILISATION . le bloc entier tombe, l'incident est tracé
 *
 * La porte 2 vit dans `request_report.ts`, au moment où les termes naissent:
 * un terme couvert par une règle de maison n'entre jamais dans les faits, donc
 * aucun chemin de ce module ne peut le faire réapparaître. Une porte qui filtre
 * en sortie laisse toujours un second lecteur la contourner.
 *
 * ⚠️ ── LA PORTE 1 SE PROUVE PAR L'ABSENCE DE CHEMIN ───────────────────────
 * Pour quelqu'un sous `restriction_flag`, « j'ai mis moins de pizza » est une
 * phrase qui moralise la nourriture de quelqu'un qu'on soupçonne déjà de se
 * restreindre. Aucun réglage, aucune doctrine, aucun drapeau ne doit pouvoir la
 * rouvrir — d'où le retour ANTICIPÉ, avant tout assemblage: il n'y a pas de
 * texte à filtrer, il n'y en a jamais eu.
 *
 * ── POURQUOI L'ASSEMBLAGE EST ICI ET PAS SUR L'ÉCRAN ──────────────────────
 * Les portes 3 et 4 s'appliquent au TEXTE. Assembler côté écran obligerait à y
 * dupliquer les deux gardes, et une garde en double diverge — c'est la
 * cicatrice la plus chère du dépôt. Le backend connaît la langue de l'élève
 * (`content_locale`), assemble, garde, et rend des phrases finies. L'écran les
 * affiche, il ne les décide pas.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { findGuiltTripping } from "./reengagement.ts";
import type { RequestedTerm, RequestReport } from "./request_report.ts";

/**
 * Le motif de ce qu'on ne dit pas. NOMMÉ, et jamais un booléen.
 *
 * Un bloc absent et un bloc refusé se ressemblent à l'écran; ils n'appellent
 * pas la même action. `guilt_tripping` est un BUG de nos propres gabarits et
 * doit réveiller quelqu'un; `restriction_floor` est le produit qui fonctionne.
 */
export type ReportRefusal =
  | "restriction_floor"
  | "doctrine_lock"
  | "guilt_tripping";

export interface GatedRequestReport {
  /** Les phrases finies, dans la langue de l'élève. Vide = rien à afficher. */
  lines: string[];
  /** Pourquoi rien ne sort. `null` quand il y a des lignes, ou rien à dire. */
  refusal: ReportRefusal | null;
}

// ---------------------------------------------------------------------------
// LES GABARITS — factuels, jamais évaluatifs
// ---------------------------------------------------------------------------

/**
 * ⚠️ AUCUN DE CES GABARITS NE PORTE UN JUGEMENT.
 *
 * « il y en a jeudi » est un fait. « bon choix », « c'est raisonnable », « ça
 * rentre dans ton objectif » sont des verdicts sur ce que quelqu'un mange, et
 * ils n'ont rien à faire ici — le compte-rendu RÉPOND, il n'approuve pas.
 *
 * Et surtout: aucun gabarit d'absence ne dit POURQUOI. « il n'y en a pas cette
 * fois » est honnête; « il n'y en a pas parce que… » invite à une raison qu'on
 * n'a pas calculée, et une raison inventée sur la nourriture de quelqu'un est
 * exactement ce que ce chantier existe pour ne pas produire.
 */
const COPY = {
  fr: {
    served: (term: string, days: string) =>
      days ? `Tu as demandé ${term} : il y en a ${days}.` : `Tu as demandé ${term} : c'est au plan.`,
    servedReduced: (term: string, days: string) =>
      days
        ? `Tu as demandé ${term} : il y en a ${days}, dans un plat.`
        : `Tu as demandé ${term} : il y en a, dans un plat.`,
    absent: (term: string) => `Tu as demandé ${term} : il n'y en a pas cette fois.`,
    and: " et ",
    days: {
      mon: "lundi",
      tue: "mardi",
      wed: "mercredi",
      thu: "jeudi",
      fri: "vendredi",
      sat: "samedi",
      sun: "dimanche",
    } as Record<string, string>,
  },
  en: {
    served: (term: string, days: string) =>
      days ? `You asked for ${term}: it's on ${days}.` : `You asked for ${term}: it's in the plan.`,
    servedReduced: (term: string, days: string) =>
      days
        ? `You asked for ${term}: it's there ${days}, inside a dish.`
        : `You asked for ${term}: it's there, inside a dish.`,
    absent: (term: string) => `You asked for ${term}: there isn't any this time.`,
    and: " and ",
    days: {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
      sun: "Sunday",
    } as Record<string, string>,
  },
} as const;

export type ReportLocale = keyof typeof COPY;

/**
 * Les jours, en toutes lettres.
 *
 * Un jeton inconnu est RENDU TEL QUEL plutôt que jeté: perdre le jour d'un plat
 * ferait dire « c'est au plan » à la place de « c'est jeudi », ce qui est moins
 * précis mais pas faux. Le jeter en silence serait une perte d'information dans
 * une phrase qui a l'air complète.
 */
function renderDays(days: readonly string[], locale: ReportLocale): string {
  const copy = COPY[locale];
  const named = days.map((d) => copy.days[d] ?? d).filter(Boolean);
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")}${copy.and}${named[named.length - 1]}`;
}

function lineFor(term: RequestedTerm, locale: ReportLocale): string | null {
  const copy = COPY[locale];
  const days = renderDays(term.days, locale);
  switch (term.status) {
    case "served":
      return copy.served(term.term, days);
    case "served_reduced":
      return copy.servedReduced(term.term, days);
    case "absent":
      return copy.absent(term.term);
    // `unreadable` ne s'affiche JAMAIS. Il se compte, et c'est tout: une prose
    // qu'on n'a pas su lire ne donne aucune phrase honnête.
    case "unreadable":
      return null;
  }
}

// ---------------------------------------------------------------------------
// LA CHAÎNE
// ---------------------------------------------------------------------------

/**
 * Ce qu'on affiche, ou pourquoi on n'affiche rien.
 *
 * ⚠️ ── AUCUN PARAMÈTRE OPTIONNEL, ET LA FONCTION JETTE ────────────────────
 * Cicatrice du dépôt: *un paramètre de garde optionnel est une garde
 * désarmée*. `safetyBand` a existé des mois sans être passé nulle part, et
 * personne ne l'a vu parce qu'un `?` rend l'oubli invisible à la compilation.
 * Ici, un appelant qui n'a pas su lire le plancher TCA doit ÉCHOUER BRUYAMMENT
 * plutôt que passer `false` par défaut — `false` veut dire « cette personne
 * n'est pas protégée », et c'est une affirmation qu'on ne devine pas.
 */
export function gateRequestReport(input: {
  report: RequestReport;
  locale: ReportLocale;
  /** Le plancher TCA. REQUIS: `false` est une affirmation, pas un défaut. */
  restrictionFlag: boolean;
  /** Les interdits de la doctrine du coach. REQUIS, `[]` si aucun. */
  doctrineForbidden: readonly ForbiddenTerm[];
}): GatedRequestReport {
  if (typeof input?.restrictionFlag !== "boolean") {
    throw new Error(
      "[keel/request_report] restrictionFlag est REQUIS et booléen — " +
        "un appelant qui ne sait pas si l'élève est protégé ne doit rien afficher",
    );
  }
  if (!Array.isArray(input.doctrineForbidden)) {
    throw new Error(
      "[keel/request_report] doctrineForbidden est REQUIS — " +
        "`[]` dit « aucun interdit », `undefined` dit « je n'ai pas su lire »",
    );
  }
  if (input.locale !== "fr" && input.locale !== "en") {
    throw new Error(`[keel/request_report] locale inconnue: ${String(input.locale)}`);
  }

  // ── PORTE 1 — AVANT TOUT ASSEMBLAGE ─────────────────────────────────────
  // Il n'y a pas de texte à filtrer: il n'y en a jamais eu. C'est ce qui rend
  // la garde prouvable par l'absence de chemin plutôt que par un filtre qu'on
  // pourrait contourner.
  if (input.restrictionFlag) {
    return { lines: [], refusal: "restriction_floor" };
  }

  const lines: string[] = [];
  for (const term of input.report.terms) {
    const line = lineFor(term, input.locale);
    if (line === null) continue;
    // ── PORTE 3 — LIGNE PAR LIGNE ─────────────────────────────────────────
    // Une ligne qui heurte la doctrine tombe seule. Faire tomber le bloc
    // entier pour un terme sur cinq retirerait quatre réponses justes à
    // quelqu'un qui a posé cinq questions.
    if (
      input.doctrineForbidden.length > 0 &&
      findForbiddenMatches(line, input.doctrineForbidden, {
        allowNegatedMentions: true,
      }).length > 0
    ) {
      continue;
    }
    lines.push(line);
  }

  if (lines.length === 0) {
    // Rien à dire n'est pas un refus. On distingue « la doctrine a tout mangé »
    // de « il n'y avait aucune demande lisible » par le nombre de faits en
    // entrée: sans ça, un compteur d'incidents monterait sur du silence normal.
    const hadSomethingToSay = input.report.terms.some(
      (t) => t.status !== "unreadable",
    );
    return {
      lines: [],
      refusal: hadSomethingToSay ? "doctrine_lock" : null,
    };
  }

  // ── PORTE 4 — LE BLOC ENTIER, ET C'EST DÉLIBÉRÉ ────────────────────────
  // Contrairement à la doctrine, une détection de culpabilisation ici est un
  // DÉFAUT DE NOS PROPRES GABARITS: ils sont fixes, testés, et ne devraient
  // jamais mordre. Quand ça arrive, ce n'est pas une ligne à retirer, c'est un
  // signal qu'on ne sait plus ce qu'on écrit. On coupe tout et on trace.
  const assembled = lines.join(" ");
  const guilt = findGuiltTripping(assembled);
  if (guilt.length > 0) {
    console.error("keel.request_report.guilt_tripping", {
      finding_count: guilt.length,
      matched: guilt.map((f) => f.matchedText).join(" | "),
      locale: input.locale,
    });
    return { lines: [], refusal: "guilt_tripping" };
  }

  return { lines, refusal: null };
}
