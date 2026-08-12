/**
 * FF-061 — LE COMPTE-RENDU DE LA DEMANDE. Module PUR.
 *
 * Quand quelqu'un écrit ce dont il a envie avant de composer sa semaine — « des
 * burgers », « des pizzas », « du poisson » — le plan doit **dire ce qu'il en a
 * fait**. Pas se justifier: rendre compte.
 *
 * ── RENDRE COMPTE, PAS JUSTIFIER ──────────────────────────────────────────
 * JUSTIFIER, c'est défendre une décision — registre du jugement, et la pente est
 * courte jusqu'à « la pizza ne rentre pas dans ton objectif », qui est de la
 * moralisation alimentaire.
 *
 * RENDRE COMPTE, c'est dire ce qu'on a fait de ce qui a été demandé — registre
 * factuel: « tu as demandé des burgers, il y en a jeudi soir ».
 *
 * Et c'est ce qui est VRAI dans ce produit: l'unité est la session de cuisine
 * sur N jours. Un burger n'échoue pas à un objectif, **il occupe un créneau**.
 * Le compte-rendu honnête est donc presque toujours « je l'ai mis là », pas
 * « je l'ai écarté ». Une fonctionnalité qui s'appellerait « justification »
 * inviterait le modèle à inventer un refus qu'il n'a pas fait.
 *
 * ⛔ ── CE COMPTE-RENDU EST UN DIFF DÉTERMINISTE, JAMAIS UNE SORTIE DU MODÈLE
 *
 * On sait ce qui a été DEMANDÉ (les termes de `preferences`). On sait ce que le
 * plan CONTIENT (titres, méthodes, ingrédients, jours). Le rapprochement se
 * CALCULE ici, et le texte affiché s'assemble depuis ces faits et des gabarits
 * i18n. Aucun champ neuf n'est demandé au modèle, aucun appel supplémentaire
 * n'est fait.
 *
 * Trois raisons, et chacune suffirait:
 *
 *   1. UNE CONSIGNE DE PROMPT RÉGRESSE EN RÉEL. C'est la loi que
 *      `household_restriction_lock.ts` a tirée d'un run réel: le prompt disait
 *      en toutes lettres de ne pas commenter les règles de maison, et le modèle
 *      a rendu « honore la demande de pâtes de Lea […] SANS NUTELLA ». Un
 *      modèle à qui on demande d'expliquer ses arbitrages expliquera aussi ceux
 *      qu'il doit taire.
 *   2. LA CICATRICE DU SOUTIEN GROUNDÉ. Une phrase qui affirme un fait que le
 *      code n'a pas calculé finit par affirmer un fait faux.
 *   3. LE « VIVANT » EST DÉJÀ COUVERT par le `why` de chaque plat, qui est
 *      produit par le modèle ET vérifié contre la doctrine. On n'a pas besoin
 *      d'une seconde prose non gardée.
 *
 * La V2 — « le modèle formule le compte-rendu à partir des faits » — est
 * FERMÉE. Il n'y a pas de crochet pour elle dans ce module, et ce n'est pas un
 * oubli.
 *
 * ── ON DIT SURTOUT LES OUI ────────────────────────────────────────────────
 * Règle produit, pas préférence de ton. Un compte-rendu qui ne parle que pour
 * dire non devient le bruit du refus: on apprend à le redouter, et le jour où
 * il compte vraiment il est déjà disqualifié. Ce module rend donc ses termes
 * DÈS QU'IL Y EN A UN DE LISIBLE, y compris quand tout a été honoré.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  findForbiddenMatches,
  type ForbiddenTerm,
  normalizeForMatch,
} from "./forbidden_matcher.ts";

// ---------------------------------------------------------------------------
// LES QUATRE STATUTS
// ---------------------------------------------------------------------------

/**
 * ⚠️ `unreadable` N'EST PAS UN DÉTAIL D'IMPLÉMENTATION.
 *
 * Sans lui, une prose que le module ne sait pas lire deviendrait silencieusement
 * `absent`, et le produit annoncerait un refus qu'il n'a jamais fait. C'est le
 * pire faux positif possible ici: dire à quelqu'un « je n'ai pas mis ce que tu
 * as demandé » alors qu'on n'a simplement pas su lire sa phrase.
 *
 * Il est COMPTÉ et jamais AFFICHÉ.
 */
export type RequestStatus = "served" | "served_reduced" | "absent" | "unreadable";

export interface RequestedTerm {
  /** Le terme tel qu'extrait de la prose, normalisé. */
  term: string;
  status: RequestStatus;
  /** Les plats qui le portent, dans l'ordre du plan. Vide si `absent`. */
  dishIds: string[];
  /** Les jours concernés, dans l'ordre du plan, dédupliqués. */
  days: string[];
}

/** Un plat, réduit à ce que le rapprochement a besoin de lire. */
export interface ReportableDish {
  id: string;
  title: string;
  method: string;
  day: string | null;
  ingredients: readonly { term: string }[];
}

export interface RequestReport {
  terms: RequestedTerm[];
  /** Combien de fragments de prose n'ont pas produit de terme exploitable. */
  unreadableCount: number;
}

// ---------------------------------------------------------------------------
// L'EXTRACTION — la partie fragile, et elle le sait
// ---------------------------------------------------------------------------

/**
 * CE QUI SÉPARE DEUX ENVIES. Liste FERMÉE, EN + FR.
 *
 * On ne cherche pas à comprendre une phrase: on découpe une énumération. « des
 * burgers, des pizzas et du poisson » est le cas nominal, et il couvre
 * l'immense majorité de ce qui s'écrit dans ce champ.
 */
const REQUEST_SEPARATORS =
  /[,;/+\n\r]|\bet\b|\band\b|\bou\b|\bor\b|\bavec\b|\bwith\b|&/gi;

/**
 * LES DÉTERMINANTS ET QUANTIFIEURS qu'on retire en tête d'un fragment.
 *
 * « des burgers » doit rendre « burgers », pas « des burgers » — sinon le
 * matcher cherche littéralement « des burgers » dans un titre de plat et ne le
 * trouve jamais. Liste FERMÉE, ordonnée du plus long au plus court:
 * « de la » doit être essayé avant « de », sinon « de la viande » rendrait
 * « la viande ».
 */
const LEADING_NOISE: readonly string[] = [
  // FR — les plus longs d'abord
  "un peu de",
  "beaucoup de",
  "plus de",
  "moins de",
  "de la",
  "de l'",
  "des",
  "du",
  "de",
  "d'",
  "les",
  "le",
  "la",
  "un",
  "une",
  // EN
  "a bit of",
  "a lot of",
  "lots of",
  "plenty of",
  "some",
  "more",
  "the",
  "an",
  "a",
];

/**
 * LES MOTS QUI NE SONT PAS UN ALIMENT. Liste FERMÉE, EN + FR.
 *
 * Un fragment qui se réduit à ces mots est `unreadable`, jamais `absent`. « j'ai
 * envie de manger » n'est pas une demande d'un aliment nommé « manger ».
 */
const REQUEST_STOPWORDS: ReadonlySet<string> = new Set([
  // FR
  "envie",
  "envies",
  "manger",
  "cuisiner",
  "avoir",
  "voudrais",
  "aimerais",
  "cette",
  "semaine",
  "midi",
  "soir",
  "matin",
  "truc",
  "trucs",
  "chose",
  "choses",
  "quelque",
  "quelques",
  "svp",
  "stp",
  "merci",
  "bon",
  "bonne",
  "facile",
  "rapide",
  "simple",
  // EN
  "want",
  "wants",
  "eat",
  "eating",
  "cook",
  "cooking",
  "feel",
  "like",
  "this",
  "week",
  "please",
  "thanks",
  "something",
  "stuff",
  "easy",
  "quick",
  "simple",
  "good",
]);

/**
 * LES BORNES DE LISIBILITÉ.
 *
 * En dessous de `MIN_TERM_CHARS`, un fragment est du bruit de ponctuation. Au
 * delà de `MAX_TERM_WORDS`, ce n'est plus un aliment: c'est une phrase, et la
 * chercher dans un titre de plat ne rendrait jamais rien — donc `absent`, donc
 * un refus annoncé qui n'a pas eu lieu. On préfère `unreadable`.
 *
 * `MAX_REQUEST_TERMS` borne le compte-rendu lui-même: une liste de quinze
 * lignes n'est plus un compte-rendu, c'est un tableau de bord. Le débordement
 * est COMPTÉ en illisible plutôt que jeté en silence.
 */
export const MIN_TERM_CHARS = 3;
export const MAX_TERM_WORDS = 4;
export const MAX_REQUEST_TERMS = 8;

/** Retire les déterminants de tête, une seule fois, du plus long au plus court. */
function stripLeadingNoise(fragment: string): string {
  let out = fragment;
  for (const noise of LEADING_NOISE) {
    const prefix = noise.endsWith("'") ? noise : `${noise} `;
    if (out.startsWith(prefix)) {
      out = out.slice(prefix.length).trim();
      break;
    }
  }
  return out;
}

/**
 * La prose devient une liste de termes, ou du compte d'illisible.
 *
 * ⚠️ EXPORTÉE POUR ÊTRE TESTÉE SEULE. C'est le maillon fragile de ce module, et
 * un maillon fragile qu'on ne peut tester qu'à travers trois autres est un
 * maillon qu'on ne teste pas.
 */
export function extractRequestedTerms(
  preferences: string,
): { terms: string[]; unreadableCount: number } {
  const raw = String(preferences ?? "");
  if (!raw.trim()) return { terms: [], unreadableCount: 0 };

  const fragments = normalizeForMatch(raw)
    .split(REQUEST_SEPARATORS)
    .map((f) => f.replace(/[.!?:"'«»()]/g, " ").replace(/\s+/g, " ").trim());

  const terms: string[] = [];
  const seen = new Set<string>();
  let unreadableCount = 0;

  for (const fragment of fragments) {
    if (!fragment) continue;
    const candidate = stripLeadingNoise(fragment);
    const words = candidate.split(" ").filter(Boolean);
    const usable = candidate.length >= MIN_TERM_CHARS &&
      words.length > 0 &&
      words.length <= MAX_TERM_WORDS &&
      // Un fragment entièrement fait de mots vides ne nomme aucun aliment.
      words.some((w) => !REQUEST_STOPWORDS.has(w));
    if (!usable) {
      unreadableCount++;
      continue;
    }
    if (seen.has(candidate)) continue;
    // ── LE DÉBORDEMENT EST COMPTÉ, PAS JETÉ ────────────────────────────────
    // Silencieusement tronquer donnerait un compte-rendu qui a l'air complet.
    if (terms.length >= MAX_REQUEST_TERMS) {
      unreadableCount++;
      continue;
    }
    seen.add(candidate);
    terms.push(candidate);
  }

  return { terms, unreadableCount };
}

// ---------------------------------------------------------------------------
// LE RAPPROCHEMENT — par LE matcher du dépôt, jamais par un autre
// ---------------------------------------------------------------------------

/**
 * ⚠️ AUCUNE `RegExp` MAISON, AUCUN `includes()` SUR DU TEXTE LIBRE.
 *
 * Cicatrice mesurée: « laitue » contient « lait », et un rapprochement naïf
 * rendait 12 faux positifs sur 12. `findForbiddenMatches` porte les frontières
 * de mots, la tolérance aux accents et au pluriel, et la liste FERMÉE des
 * constructions négatives.
 *
 * `allowNegatedMentions: true` est délibéré: une méthode qui dit « sans
 * fromage » ne sert pas de fromage, et compter cette mention annoncerait servi
 * ce qui ne l'est pas — l'erreur la plus chère de ce module, puisqu'elle est
 * indémentable pour qui lit son plan.
 */
/**
 * LE SINGULIER DU TERME DEMANDÉ — et pourquoi il faut le fabriquer ici.
 *
 * ⚠️ DÉFAUT MESURÉ AU PREMIER PASSAGE DES TESTS: « des pizzas » ne trouvait pas
 * « Pizza night ». `tokenPattern` tolère un pluriel dans le TEXTE ANALYSÉ (il
 * ajoute un `(?:e?s)?` en fin de motif), mais pas dans le TERME CHERCHÉ. Or les
 * gens écrivent leurs envies au pluriel — « des burgers », « des pâtes » — et
 * les plats se titrent au singulier. La dissymétrie tombait exactement sur le
 * cas nominal.
 *
 * On ne touche pas au matcher: c'est le module partagé de tout le dépôt, et son
 * motif est juste pour ses autres appelants. On fournit ici une FORME DE
 * SURFACE de plus, ce que son interface prévoit déjà.
 *
 * ── MOT À MOT, ET PAS SEULEMENT LE DERNIER ────────────────────────────────
 * « pommes de terre » porte son pluriel sur le PREMIER mot. Ne singulariser que
 * la fin rendrait « pommes de terr ».
 *
 * ── LE TERME AFFICHÉ NE CHANGE PAS ────────────────────────────────────────
 * On cherche le singulier, on montre ce que la personne a écrit. « Tu as demandé
 * des pizzas » se lit; « tu as demandé pizza » se lit comme une machine.
 */
/**
 * Le `-es` anglais des sifflantes. Liste FERMÉE, et elle passe AVANT le `-s`.
 *
 * ⚠️ MESURÉ AU DEUXIÈME PASSAGE: retirer « es » de tout mot qui finit par « es »
 * rendait « pat » pour « pates ». Le pluriel français est un simple `-s`; le
 * `-es` n'est un pluriel qu'après une sifflante, et c'est de l'anglais
 * (« dishes », « boxes »). Une règle prise pour l'autre coupe une lettre de
 * trop, et un radical trop court matche des mots qui n'ont rien à voir.
 */
const SIBILANT_PLURALS: readonly string[] = ["ches", "shes", "sses", "xes", "zes"];

function singularOf(term: string): string | null {
  const singular = term
    .split(" ")
    .map((word) => {
      if (word.length < 4) return word;
      // FR: « gâteaux », « choux ». Le `x` du pluriel se retire comme le `s`.
      if (word.endsWith("x")) return word.slice(0, -1);
      if (word.length >= 5 && SIBILANT_PLURALS.some((p) => word.endsWith(p))) {
        return word.slice(0, -2);
      }
      if (word.endsWith("s")) return word.slice(0, -1);
      return word;
    })
    .join(" ");
  return singular === term ? null : singular;
}

function needleFor(term: string): ForbiddenTerm {
  const singular = singularOf(term);
  return {
    ruleId: "request",
    token: term,
    ...(singular ? { surfaceForms: [singular] } : {}),
  };
}

function hits(haystack: string, term: string): boolean {
  if (!haystack.trim()) return false;
  return findForbiddenMatches(
    haystack,
    [needleFor(term)],
    { allowNegatedMentions: true },
  ).length > 0;
}

/**
 * Ce terme est-il couvert par une règle de maison ?
 *
 * ⚠️ `allowNegatedMentions: false` ICI, et c'est le seul endroit du module.
 * On n'analyse pas de la prose mais un TERME NU (« nutella »): aucune
 * construction négative ne peut légitimement s'y trouver, et la lecture absolue
 * est la plus sûre pour une porte qui protège une décision parentale.
 */
function coveredByHouseRule(
  term: string,
  houseRuleTerms: readonly ForbiddenTerm[],
): boolean {
  if (houseRuleTerms.length === 0) return false;
  return findForbiddenMatches(term, houseRuleTerms, {
    allowNegatedMentions: false,
  }).length > 0;
}

/**
 * LE COMPTE-RENDU, calculé.
 *
 * ── POURQUOI `served_reduced` SE LIT SUR LE TITRE ──────────────────────────
 * « du poisson » dans le TITRE d'un plat (« Cabillaud rôti ») veut dire que le
 * plat EST du poisson. Le même terme trouvé seulement dans les ingrédients d'une
 * salade veut dire qu'il y en a, mais que ce n'était pas le plat. Les deux sont
 * vrais et ils ne se disent pas pareil.
 *
 * ⚠️ CE QUI N'EST PAS IMPLÉMENTÉ, ET C'EST ÉCRIT EXPRÈS: la seconde moitié de
 * `served_reduced` — « sur moins de créneaux que demandé » — demanderait de lire
 * un nombre dans la prose (« des burgers deux fois »). On ne sait pas le faire
 * de façon fiable, et un statut qu'on ne sait pas calculer est pire qu'un statut
 * absent. La moitié qui reste est calculable et se prouve.
 */
export function reportOnRequest(input: {
  preferences: string;
  dishes: readonly ReportableDish[];
  /** Les termes couverts par une règle de maison — JAMAIS cités. Requis. */
  houseRuleTerms: readonly ForbiddenTerm[];
  /** Ce qui a déjà été dit absent au plan précédent. Requis, `[]` si aucun. */
  previouslyReportedAbsent: readonly string[];
}): RequestReport {
  const { terms: extracted, unreadableCount } = extractRequestedTerms(
    input.preferences,
  );

  const alreadySaid = new Set(
    input.previouslyReportedAbsent.map((t) => normalizeForMatch(String(t ?? "")).trim()),
  );

  const terms: RequestedTerm[] = [];
  for (const term of extracted) {
    // ── PORTE 2, ICI ET PAS AILLEURS ────────────────────────────────────────
    // Un terme couvert par une règle de maison disparaît de la sortie ENTIÈRE,
    // quel que soit son statut réel. Dire « je ne l'ai pas mis » ferait porter à
    // Sophia une décision parentale — exactement ce que
    // `household_restriction_lock.ts` a été écrit pour empêcher, reconstruit par
    // une autre porte.
    if (coveredByHouseRule(term, input.houseRuleTerms)) continue;

    const dishIds: string[] = [];
    const days: string[] = [];
    let inTitle = false;

    for (const dish of input.dishes) {
      const titleHit = hits(String(dish.title ?? ""), term);
      const bodyHit = titleHit || hits(
        [
          String(dish.method ?? ""),
          ...(dish.ingredients ?? []).map((i) => String(i?.term ?? "")),
        ].join(" . "),
        term,
      );
      if (!bodyHit) continue;
      if (titleHit) inTitle = true;
      dishIds.push(String(dish.id));
      const day = dish.day === null || dish.day === undefined ? "" : String(dish.day);
      if (day && !days.includes(day)) days.push(day);
    }

    if (dishIds.length === 0) {
      // ── §2.5 — UN ABSENT SE DIT UNE FOIS, JAMAIS DEUX ────────────────────
      // Le dire est honnête. Le répéter à chaque génération transforme le
      // compte-rendu en liste de reproches, ce que « on dit surtout les oui »
      // existe pour empêcher.
      if (alreadySaid.has(term)) continue;
      terms.push({ term, status: "absent", dishIds: [], days: [] });
      continue;
    }

    terms.push({
      term,
      status: inTitle ? "served" : "served_reduced",
      dishIds,
      days,
    });
  }

  return { terms, unreadableCount };
}

/**
 * Les termes à repasser en entrée de la PROCHAINE génération.
 *
 * Le rappel de §2.5 se dérive du plan précédent; ce module ne stocke rien et ne
 * lit aucune base. L'appelant persiste ce que cette fonction rend, ou le
 * recalcule sur la ligne antérieure — les deux marchent, et aucun des deux ne
 * demande de migration.
 */
export function absentTermsOf(report: RequestReport): string[] {
  return report.terms.filter((t) => t.status === "absent").map((t) => t.term);
}
