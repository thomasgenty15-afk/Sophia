/**
 * UNE EXCLUSION ÉCRITE DOIT MORDRE — la ceinture des `food.exclude`. PUR.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES DEUX DÉFAUTS MESURÉS, ET ILS SONT DIFFÉRENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * Banc des 4 cycles, 2026-09-01, foyer de 3 bouches :
 *
 *   ⑧ « Mon fils n'aime pas le poisson » → `subject: member:Tom`, rangé,
 *      attribué, compté — **et le plan suivant sert du saumon**. La lane foyer
 *      ne parle que pour `[household, titulaire]` : les autres bouches sont
 *      « comptées, jamais appliquées ». L'exclusion d'un enfant n'avait
 *      AUCUN chemin pour agir.
 *
 *   ⑨ « Je n'aime pas le poulet » → `subject: household`, au prompt
 *      (`composition=2`) — **et le plan sert du poulet dans deux plats sur
 *      trois**. Aucune vérification en sortie : `dietary_regime` ne garde que
 *      les RÉGIMES déclarés, et `checkWrittenInstructions` n'est câblé que sur
 *      la lane solo.
 *
 * ⇒ Un `food.exclude` était une consigne de prompt, et rien d'autre. Le dépôt
 * a déjà écrit ce que ça vaut : *« une consigne de prompt régresse. Le verrou,
 * lui, se vérifie. »*
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ DEUX RÉPONSES, PARCE QUE LES DEUX CAS N'ONT PAS LE MÊME REMÈDE
 * ═══════════════════════════════════════════════════════════════════════════
 * · **Une bouche nommée** → on RETIRE CETTE BOUCHE DU CONTENANT. Le plat
 *   reste, les autres sont servis, la personne concernée ne l'est plus. C'est
 *   exactement le geste de la ceinture des régimes, et son motif s'applique
 *   mot pour mot : *« refuser le plan aurait rendu 422 empty_meal à 100 % des
 *   foyers où un végane mange — faire payer son régime en semaines vides à la
 *   seule population que cette ceinture existe pour protéger. »*
 *
 * · **Le foyer entier** → il n'y a PERSONNE à retirer, le bac deviendrait vide.
 *   Le remède est ailleurs : une relance ciblée (`generate-household-meal-v1`),
 *   sur le modèle de `proteinAnchorRetry`. Ce module ne fait que DÉTECTER;
 *   c'est l'appelant qui relance.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUN MATCHER MAISON, ET AUCUN EXTRACTEUR MAISON NON PLUS
 * ═══════════════════════════════════════════════════════════════════════════
 * Deux problèmes, deux modules qui les ont déjà résolus :
 *   · trouver un TOKEN dans de la PROSE → `findForbiddenMatches`, qui échappe
 *     la regex et pose des frontières de mot. C'est lui qui fait que « lait »
 *     ne matche pas dans « laitue » — 12 faux positifs sur 12 mesurés.
 *   · tirer les mots CHERCHABLES d'une phrase libre → `termsOfInstruction`,
 *     avec sa liste de mots-outils, son dépôt du pluriel et sa longueur
 *     minimale (« riz » est le contre-exemple qui coûte, d'où trois lettres).
 *
 * ⚠️ MODE CEINTURE, PAS MODE AUDIT — et c'est l'inverse de `rule_question.ts`.
 * Là-bas on cherchait le mot DANS LA RÈGLE, qui est écrite au négatif (« plus
 * jamais de poulet ») : il fallait désarmer la négation pour trouver quoi que
 * ce soit. Ici on cherche dans LE PLAT, où une négation veut dire ce qu'elle
 * dit : une méthode « poêlée SANS poisson » ne doit pas mordre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LES DEUX LIMITES, MESURÉES LE 2026-09-01 ET NOMMÉES PLUTÔT QUE CACHÉES
 * ═══════════════════════════════════════════════════════════════════════════
 * ① **UNE CATÉGORIE TROUVE SON ESPÈCE — FERMÉ LE 2026-09-01, À SENS UNIQUE.**
 *    « Mon fils n'aime pas le POISSON » ne mordait pas sur « SAUMON ». Réparé
 *    par `categoryFormsOf`, qui RÉUTILISE les tables fermées et écrites à la
 *    main de `dietary_regime.ts` — jamais une seconde liste, jamais un groupe
 *    déduit.
 *
 *    ⛔ ET JAMAIS DANS L'AUTRE SENS. « Je n'aime pas le saumon » ne déplie
 *    RIEN: en tirer « pas de poisson » écrirait une règle PLUS LARGE que sa
 *    phrase, sur des aliments qu'elle n'a jamais nommés. `saumon` n'est pas
 *    une clé de la table, et ne doit jamais le devenir.
 *
 * ② **UNE BOUCHE QUI N'EST SUR AUCUNE BOÎTE NE PEUT PAS ÊTRE RETIRÉE.** Le
 *    retrait agit sur une APPARTENANCE (bouche × contenant). Un plat que le
 *    modèle n'a pas ventilé par bouche est servi implicitement à tout le
 *    monde, et la ceinture n'a rien à quoi mordre. C'est exactement la
 *    dépendance de la ceinture des régimes, dont le compteur porte déjà le
 *    cas: `mouths > 0 && checked === 0` ⇒ *« le modèle n'a écrit aucune boîte
 *    pour ces bouches-là »*. `checked` est ici pour la même raison.
 *
 * PURE MODULE : aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { termsOfInstruction } from "./written_instruction_check.ts";
import { HOUSEHOLD_SUBJECT, type RetainedItem } from "./retained_item.ts";
// ⛔ CATÉGORIE → ESPÈCES, À SENS UNIQUE. « poisson » déplie les espèces,
// « saumon » ne déplie RIEN — déduire la catégorie d'une espèce écrirait une
// règle plus large que la phrase de la personne.
import { categoryFormsOf } from "./dietary_regime.ts";

/** Ce qu'un plat expose à la ceinture — la même surface que les régimes. */
export interface ExclusionDish {
  readonly title: string;
  readonly method: string;
  readonly ingredients: readonly { term: string }[];
}

/** Une préparation pliée dans le plat, même surface. */
export interface ExclusionPreparation {
  readonly id: string;
  readonly title: string;
  readonly method: string;
  readonly ingredients: readonly { term: string }[];
}

export interface ExclusionBite {
  /** Le mot qui a mordu, tel qu'il apparaît dans le plat. `null` = rien. */
  readonly matched: string | null;
  /** Le texte de l'exclusion qui a mordu — pour le DIRE, jamais pour décider. */
  readonly because: string | null;
  /** Les préparations où ça a mordu, s'il y en a. */
  readonly preparationIds: readonly string[];
}

const NO_BITE: ExclusionBite = {
  matched: null,
  because: null,
  preparationIds: [],
};

/**
 * LES MOTS À INTERDIRE, POUR UN SUJET DONNÉ.
 *
 * ⛔ `subject` EST REQUIS, jamais optionnel. Un appelant qui l'oublierait
 * mélangerait l'exclusion d'un enfant et celle de la table — c'est-à-dire le
 * défaut d'AVANT le lot d'attribution, réintroduit par une signature laxiste.
 *
 * ⚠️ UNE EXCLUSION SANS MOT CHERCHABLE NE REND RIEN, et ce n'est pas un échec.
 * « Je veux moins de trucs compliqués » n'a aucun aliment à interdire : mieux
 * vaut ne rien chercher que de chercher « truc ».
 */
/**
 * ⟳ 2026-09-06 — UN TERME DE CEINTURE SAIT DE QUEL MOT DE LA PHRASE IL VIENT.
 *
 * Mesuré (banc « un retour et les calories ») : « j'aime pas trop le rougaille
 * saucisse » rendait DEUX règles indépendantes, « rougaille » et « saucisse »
 * — « lentilles aux saucisses » mordait, « rougaille de tomates » aussi. La
 * phrase nomme UN plat ; elle ne mord que si TOUS ses mots sont là (voir
 * `dishBitesExclusion`). `word` est le mot d'origine ; les espèces d'une
 * catégorie (« poisson » → saumon, thon…) sont des ALTERNATIVES du même mot.
 */
export interface ExclusionTerm extends ForbiddenTerm {
  readonly word: string;
  /**
   * `true` quand le texte retenu est une PHRASE NUE d'aliment (« rougaille
   * saucisse », « yaourt de soja ») : tous ses mots doivent être là pour
   * mordre. `false` quand c'est une phrase de personne (« Mon fils n'aime pas
   * le poisson ») : l'extracteur y laisse du bruit (« fil »), et exiger tous
   * les mots rendrait la règle inerte — chaque mot mord seul, comme avant.
   */
  readonly phrase: boolean;
}

/**
 * LES MARQUEURS D'UNE PHRASE DE PERSONNE — liste FERMÉE, FR + EN. Un pronom,
 * un possessif, une négation, un verbe de goût : dès qu'un seul est là, le
 * texte n'est pas le nom d'un plat. Les prépositions (« de », « au ») n'y
 * sont pas : « yaourt de soja » reste une phrase nue.
 */
const SENTENCE_MARKERS: ReadonlySet<string> = new Set([
  "je", "j", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "notre", "nos",
  "ne", "n", "pas", "plus", "jamais", "aucun", "aucune",
  "aime", "aimer", "aimons", "adore", "deteste", "veux", "veut", "voulons",
  "mange", "manger", "mangeons", "prend", "prends", "supporte",
  "i", "we", "he", "she", "they", "my", "our", "his", "her",
  "not", "no", "never", "don", "doesn", "t", "like", "likes", "hate", "hates",
  "eat", "eats", "want", "wants", "avoid",
]);

function isBarePhrase(text: string): boolean {
  const words = String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.length > 0 && !words.some((w) => SENTENCE_MARKERS.has(w));
}

export function exclusionTermsFor(args: {
  items: readonly RetainedItem[];
  subject: string;
}): ExclusionTerm[] {
  const subject = String(args.subject ?? "").trim();
  if (!subject) return [];
  const out: ExclusionTerm[] = [];
  const seen = new Set<string>();
  for (const item of args.items ?? []) {
    if (!item || item.kind !== "food.exclude") continue;
    if (String(item.subject ?? "") !== subject) continue;
    const text = String(item.text ?? "").trim();
    if (!text) continue;
    const phrase = isBarePhrase(text);
    for (const token of termsOfInstruction(text)) {
      // ⛔ UN MOT DE CATÉGORIE SE DÉPLIE, UN ALIMENT PRÉCIS NON — sens unique.
      //
      // Mesuré: « Mon fils n'aime pas le POISSON » ne mordait pas sur un plat
      // de « saumon ». La personne avait pourtant nommé le général, et savoir
      // qu'un saumon est un poisson n'est pas une inférence sur ELLE.
      //
      // ⛔ ET JAMAIS L'INVERSE. « Je n'aime pas le saumon » ne déplie rien: en
      // tirer « pas de poisson » écrirait une règle plus large que sa phrase,
      // sur des aliments qu'elle n'a jamais nommés.
      const forms = categoryFormsOf(token);
      for (const t of forms.length > 0 ? forms : [token]) {
        const key = `${t} | ${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // ⚠️ `ruleId` PORTE LE TEXTE DE LA PERSONNE. Il ne décide de rien; il
        // sert à ce que l'`issue` puisse DIRE ce qui a mordu, dans ses mots.
        out.push({ ruleId: text, token: t, word: token, phrase });
      }
    }
  }
  return out;
}

/**
 * CE PLAT MORD-IL UNE EXCLUSION ?
 *
 * ⚠️ LES PRÉPARATIONS SONT PLIÉES, comme pour les régimes. En cuisine par lots,
 * les ingrédients ne sont PAS dans le plat : le plat dit « une portion du
 * poulet rôti de mercredi », et le kilo de cuisses vit dans la préparation.
 * Ne scanner que le plat manquerait très exactement la protéine — la cicatrice
 * `preparations-must-be-folded-into-dishes`.
 */
export function dishBitesExclusion(args: {
  dish: ExclusionDish;
  uses: readonly { preparationId: string }[];
  preparationById: ReadonlyMap<string, ExclusionPreparation>;
  terms: readonly ForbiddenTerm[];
  /**
   * ⛔ REQUIS, JAMAIS OPTIONNEL — et c'est la garde la plus importante du
   * module, parce que les deux appelants n'ont pas la même direction sûre.
   *
   * `termsOfInstruction` rend PLUSIEURS jetons par phrase, dont du bruit :
   * mesuré, « Mon fils n'aime pas le poisson » rend `["fil", "poisson"]` — le
   * `fil` vient de « fils », dont le pluriel est déposé. Une morsure sur
   * n'importe lequel suffit.
   *
   *   · `"ingredients"` — on ne lit que les `term` DÉCLARÉS, jamais la prose.
   *     C'est la surface des appelants qui RETIRENT une bouche d'un contenant :
   *     un faux positif y coûte le repas de quelqu'un, donc on n'accepte que ce
   *     que le modèle a nommé comme aliment. Le dépôt fait déjà cette
   *     distinction : *« un mot dans un titre ou des ingrédients dit "je l'ai
   *     servi" »*.
   *   · `"all"` — titre et méthode compris. Pour l'appelant qui RELANCE : un
   *     faux positif y coûte un appel modèle, pas une assiette, et rater une
   *     morsure coûte plus cher que d'en inventer une.
   */
  surface: "ingredients" | "all";
}): ExclusionBite {
  if (!args.terms || args.terms.length === 0) return NO_BITE;

  const all = args.surface === "all";
  const sources: { prepId: string | null; prose: string[] }[] = [
    {
      prepId: null,
      prose: [
        ...(all ? [args.dish.title, args.dish.method] : []),
        ...(args.dish.ingredients ?? []).map((i) => String(i?.term ?? "")),
      ],
    },
  ];
  for (const use of args.uses ?? []) {
    const prep = args.preparationById.get(use.preparationId);
    if (!prep) continue;
    if (sources.some((s) => s.prepId === prep.id)) continue;
    sources.push({
      prepId: prep.id,
      prose: [
        ...(all ? [prep.title, prep.method] : []),
        ...(prep.ingredients ?? []).map((i) => String(i?.term ?? "")),
      ],
    });
  }

  // ── ⟳ 2026-09-06 — UNE PHRASE = UNE RÈGLE, ET TOUS SES MOTS DOIVENT Y ÊTRE ──
  //
  // Les mots attendus par règle viennent de `word` (les termes d'une catégorie
  // dépliée partagent le même `word` : n'importe quelle espèce le trouve). Un
  // terme sans `word` (appelant ancien) vaut son `token`, donc une règle à un
  // mot se comporte exactement comme avant.
  const wordOf = (t: ForbiddenTerm): string =>
    String((t as Partial<ExclusionTerm>).word ?? t.token);
  // Une règle n'exige TOUS ses mots que si elle est une phrase nue; sinon
  // (phrase de personne, appelant ancien sans `phrase`) un seul mot suffit.
  const expected = new Map<string, Set<string>>();
  for (const t of args.terms) {
    const set = expected.get(t.ruleId) ?? new Set<string>();
    if ((t as Partial<ExclusionTerm>).phrase === true) set.add(wordOf(t));
    expected.set(t.ruleId, set);
  }
  const wordOfToken = new Map(args.terms.map((t) => [`${t.ruleId} | ${t.token.toLowerCase()}`, wordOf(t)]));

  const foundWords = new Map<string, Set<string>>();
  const firstHit = new Map<string, { matched: string; prepIds: Set<string> }>();
  for (const source of sources) {
    const prose = source.prose.filter((t) => String(t ?? "").trim() !== "")
      .join(" • ");
    if (!prose) continue;
    // ⚠️ MODE CEINTURE (défaut): dans un PLAT, « sans poisson » veut dire ce
    // qu'il dit. C'est l'inverse de `rule_question.ts`, qui lit des RÈGLES
    // écrites au négatif et doit donc désarmer la négation.
    const hits = findForbiddenMatches(prose, args.terms);
    for (const hit of hits) {
      const word = wordOfToken.get(`${hit.ruleId} | ${hit.token.toLowerCase()}`) ?? hit.token;
      const set = foundWords.get(hit.ruleId) ?? new Set<string>();
      set.add(word);
      foundWords.set(hit.ruleId, set);
      const first = firstHit.get(hit.ruleId) ?? { matched: hit.matchedText, prepIds: new Set<string>() };
      if (source.prepId) first.prepIds.add(source.prepId);
      firstHit.set(hit.ruleId, first);
    }
  }

  // La première règle ENTIÈREMENT trouvée mord — dans l'ordre des termes,
  // pour que le verdict reste déterministe.
  for (const t of args.terms) {
    const need = expected.get(t.ruleId);
    const got = foundWords.get(t.ruleId);
    if (!need || !got) continue;
    if (need.size === 0 || [...need].every((w) => got.has(w))) {
      const first = firstHit.get(t.ruleId)!;
      return {
        matched: first.matched,
        because: String(t.ruleId ?? "") || null,
        preparationIds: [...first.prepIds],
      };
    }
  }
  return NO_BITE;
}

/**
 * LA PHRASE DE RELANCE, quand c'est LE FOYER qui est concerné.
 *
 * ⛔ ELLE NOMME LE PLAT ET LA RAISON. Une relance qui dirait seulement « refais
 * sans poulet » ferait recomposer tout le plan, y compris les plats qui allaient
 * bien — et la relance suivante porterait sur un plan qu'on n'a pas jugé.
 *
 * ⚠️ ET ELLE NE DIT PAS « c'est une allergie ». Ce n'en est pas une : une
 * exclusion est un goût, et le prompt qui la reçoit ne doit pas la traiter comme
 * une contrainte médicale — sinon la personne reçoit un plan qui s'excuse.
 */
export function exclusionRetryInstruction(
  bites: readonly { dish: string; matched: string; because: string | null }[],
): string | null {
  const rows = (bites ?? []).filter((b) => b && b.dish && b.matched);
  if (rows.length === 0) return null;
  const lines = rows.map((b) =>
    `- "${b.dish}" contains ${b.matched}${
      b.because ? ` — they wrote: "${b.because}"` : ""
    }`
  );
  return [
    "⛔ SOME DISHES BREAK A LINE THIS TABLE ASKED FOR. Rewrite ONLY these dishes; leave every other dish exactly as it is, same titles, same days, same slots:",
    ...lines,
    "Replace the offending ingredient with something else that fits the same slot and the same effort. Do NOT drop the dish, do NOT shorten the plan, and do NOT mention the change in any \"why\" — this is a taste, not a medical rule.",
  ].join("\n");
}
