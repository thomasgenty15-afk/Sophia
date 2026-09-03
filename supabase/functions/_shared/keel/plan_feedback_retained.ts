/**
 * LE QUESTIONNAIRE DE FIN DE PLAN → LA MÉMOIRE STRUCTURÉE.
 * Lot 2A du chantier « mémoire structurée ». **Le seul producteur de
 * `portion.adjust`.**
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §5 (la matrice) —
 * ligne ②. Socle: `retained_item.ts`. Port d'écriture: `retained_items_io.ts`
 * (`persistRetainedItemsFor`, `producer: "questionnaire"`). Ce fichier
 * n'écrit RIEN: il traduit des réponses en `RetainedItem`, et c'est la fonction
 * edge `keel-plan-feedback-v1` qui les porte au magasin.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE FICHIER FERME — ZÉRO LECTEUR, DEPUIS LE 2026-08-11
 * ═══════════════════════════════════════════════════════════════════════════
 * La table `meal_plan_feedback` existe, chaque colonne y nomme SON lecteur en
 * commentaire, l'écran existe, la RPC existe. Et **rien ne lisait la table**:
 * `meal_plan_feedback` n'apparaissait dans `supabase/functions/` que dans un
 * commentaire (`plan_feedback.ts:316`). Les lecteurs nommés étaient des
 * INTENTIONS.
 *
 * Pire, et c'est ce qui a décidé la forme de ce fichier: **`effectOf` n'avait
 * aucun appelant** (`grep`: seulement son propre test). Le module traduisait
 * déjà les réponses en intentions fermées — personne ne les appliquait.
 *
 * ── D'OÙ LA RÈGLE DE CE FICHIER: IL NE DÉCIDE RIEN, IL TRADUIT ─────────────
 * `effectOf` reste la seule table de décision (« non » coûte plus cher que
 * « en partie », `none` n'est pas un plat, `right` ne bouge rien). Ce module
 * transforme ses intentions en `RetainedItem`. Recopier ses règles ici en
 * ferait une seconde table qui divergerait au premier ajout — et c'est « la
 * cicatrice la plus chère de ce dépôt ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CE FICHIER N'A PAS LE DROIT DE PRODUIRE
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. **AUCUN `kind` DE SÉCURITÉ**, et il n'en existe aucun: quelqu'un qui coche
 *    « plus jamais » sur un plat aux arachides n'a PAS déclaré une allergie.
 *    Allergie, intolérance, régime, condition médicale ont
 *    `student_safety_constraints` — synchrone, sans ranking, avec consentement.
 * 2. **AUCUN `craving`.** La matrice l'interdit à ce producteur: on ne demande
 *    pas une envie de la semaine prochaine dans un bilan de la semaine passée.
 *    Les envies ont leur canal (`household_envy_submissions`), et l'écran l'y
 *    écrit déjà. `canProduce("questionnaire", "craving")` est `false`, donc un
 *    `craving` construit ici serait refusé DEUX fois (au parseur, puis au port).
 * 3. **AUCUN NOMBRE DANS `portion.adjust`.** La personne dit « trop », pas
 *    « −80 g ». Le socle l'impose par le type (`grams?: never`); ce fichier n'a
 *    donc rien à garder, il a seulement à ne pas essayer.
 * 4. **AUCUN MATCHER MAISON.** Un titre de plat ne se rapproche d'un aliment
 *    par aucune ressemblance — « laitue » ≠ « lait », 12 faux positifs sur 12
 *    mesurés dans ce dépôt. Les titres restent des titres: `food.exclude` et
 *    `food.prefer` acceptent « un aliment OU UN PLAT » (§2 axe 1), et c'est
 *    exactement pour ça.
 *
 * PURE MODULE: no I/O, no clock, no randomness. Le jour arrive en paramètre.
 */

import {
  defaultScopeFor,
  HOUSEHOLD_SUBJECT,
  parseRetainedItem,
  parseRetainedSubject,
  type PortionDirection,
  type PortionMagnitude,
  RECIPE_DIFFICULTIES,
  type RetainedItem,
  type RetainedKind,
  type RetainedSubject,
  VARIETY_LEVELS,
} from "./retained_item.ts";
import {
  effectOf,
  type FeedbackDishOrFood,
  type FeedbackQuestion,
  OPTION_LABELS,
  QUESTION_LABELS,
} from "./plan_feedback.ts";
import { isFrenchLocale } from "./locale.ts";
import type { FieldChange, WritableField } from "./field_change.ts";
// ⟳ D2.5 (2026-09-03) — LE VOCABULAIRE DU STYLE ET SON ÉCHELLE, LUS DU
// MODULE QUI LES PORTE. Recopier « minimal | balanced | keen » ici ferait une
// seconde idée de l'ordre des crans, et c'est l'ordre qui décide de quel
// côté on descend.
import { COOKING_STYLES, readCookingStyle } from "./cooking_plan.ts";

// ===========================================================================
// LE JETON DE LA MATRICE — épinglé à son littéral par le test
// ===========================================================================

/**
 * ⚠️ `producer`, ET JAMAIS `written`. C'est le jeton de liste fermée que
 * `canProduce` reçoit, pas le nom de la fonction appelante (`source`, la trace
 * libre). Les confondre ferait dépendre une règle de la matrice du nom d'un
 * répertoire.
 *
 * Un producteur serveur qui se déclarerait `written` contournerait la matrice
 * ENTIÈRE par un seul mot — `canProduce("written", …)` rend `true` pour les
 * huit familles — et la ligne s'afficherait ensuite « tu l'as écrit », ce qui
 * serait faux.
 */
export const QUESTIONNAIRE_PRODUCER = "questionnaire" as const;

/**
 * LE PLANCHER DES SESSIONS DE CUISINE, EN MINUTES.
 *
 * ⚠️ CE N'EST PAS UN NOMBRE INVENTÉ ICI: c'est le plus petit choix que le
 * produit offre (`COOKING_SESSION_MINUTES = [30, 45, 60, 90, 120, 180]`,
 * `frontend/src/keel/api/planBudget.ts`), et le test l'épingle à ce littéral
 * en lisant le fichier. Le contrat de phase 0 dit qu'aucune borne n'existe sur
 * `cooking_time_min` et qu'en inventer une serait une contrainte fabriquée —
 * alors on n'en invente pas, on EMPRUNTE celle que l'écran applique déjà.
 *
 * Sans plancher, trois « je n'ai pas pu cuisiner » d'affilée ramèneraient les
 * sessions à zéro minute, et le générateur composerait pour une cuisine qui
 * n'existe plus. `parseLogisticsSetValue` refuse `<= 0` À LA LECTURE: la ligne
 * serait écrite, puis invisible — le pire des deux.
 */
export const COOKING_TIME_FLOOR_MIN = 30;

/**
 * L'ÉCHELLE DES SESSIONS DE CUISINE — les SIX durées que l'écran propose.
 *
 * ⚠️ RECOPIÉE, ET LA RECOPIE EST ASSUMÉE. L'originale vit dans le front
 * (`frontend/src/keel/api/planBudget.ts#COOKING_SESSION_MINUTES`), que ce
 * runtime ne peut pas importer — deux runtimes, et le front tient exprès sa
 * propre copie de ce module. Ce qui empêche la copie de dériver n'est pas une
 * intention: le test LIT ce fichier-là et compare les deux listes, exactement
 * comme `COOKING_TIME_FLOOR_MIN` (dont le plancher est le PREMIER barreau de
 * cette échelle — et le test le vérifie aussi).
 *
 * ⛔ UN CRAN EST UN BARREAU, PAS UN DELTA DE MINUTES, et c'est le lot B. La
 * déduction qu'on remplace retirait « 10 minutes » d'une valeur courante: sur
 * 45 elle écrivait 35, un nombre que l'écran ne propose pas — c'est-à-dire un
 * réglage que la personne ne retrouve plus dans son propre formulaire.
 *
 * ⚠️ ORDONNÉE, DU PLUS COURT AU PLUS LONG. `applyStep` en dépend, et un
 * réordonnancement inverserait le sens des deux réponses.
 */
export const COOKING_SESSION_LADDER: readonly number[] = [
  30,
  45,
  60,
  90,
  120,
  180,
];

// ===========================================================================
// CE QUI ENTRE
// ===========================================================================

/**
 * UNE LIGNE DE `meal_plan_feedback`, telle qu'elle vient d'être écrite.
 *
 * Les sept réponses, et le refus. Aucune n'est optionnelle au type: `null` est
 * une valeur (« la question n'a pas été posée, ou pas répondue »), et un champ
 * absent serait indiscernable d'un producteur qui a oublié de le passer.
 */
export interface PlanFeedbackRow {
  /** `yes` | `partly` | `no`. */
  readonly cooked: string | null;
  /** `too_much` | `right` | `not_enough`. */
  readonly portions: string | null;
  /**
   * ⚠️ LA QUESTION QUI MANQUAIT: **POUR QUI ?**
   *
   * `household` (tout le monde à table) ou `member:<uuid>`. `null` quand la
   * question n'a pas été posée — elle ne l'est QUE si `portions` n'est pas
   * neutre, et QUE s'il y a plus d'une bouche.
   *
   * ⛔ JAMAIS UN PRÉNOM. C'est ce qui rend `portion.adjust` attribuable, et
   * c'est la raison pour laquelle le questionnaire en est le seul producteur:
   * « une mesure a besoin d'un sujet, et la conversation ne sait pas
   * l'attribuer ».
   */
  readonly portionsSubject: string | null;
  /**
   * ── LOT B · DES ALIMENTS, ET LES TITRES D'AVANT ────────────────────────
   * Une chaîne est un TITRE DE PLAT (la forme d'avant le lot B: des lignes en
   * base en portent), un objet est un `{food, subject}`. Les deux se lisent;
   * seule la seconde s'écrit. Le jeton `none` n'est ni l'un ni l'autre.
   */
  readonly neverAgain: readonly FeedbackDishOrFood[];
  /** L'inverse, même forme. */
  readonly makeAgain: readonly FeedbackDishOrFood[];
  /** `too_hard` | `fine` | `could_do_more` — lot B. `null` = pas posée. */
  readonly difficulty: string | null;
  /** `too_long` | `fine` | `had_more_time` — lot B. `null` = pas posée. */
  readonly speed: string | null;
  /** `yes` | `sometimes` | `no` — lot B, posée à tout le monde. */
  readonly variety: string | null;
  /**
   * ⚠️ HÉRITÉS, LUS ET JAMAIS ÉCRITS. Le jeton et la réponse de la quatrième
   * question d'avant le lot B. `enough_variety` y arrivait pour les comptes
   * `maintenance`; `effectOf` la relit par `legacyVarietyAnswer`. Les deux
   * autres axes n'avaient aucun lecteur et ne sont plus posés.
   */
  readonly axisQuestion: string | null;
  readonly axisAnswer: string | null;
  /** Non nul = la personne a fermé le questionnaire. **Un refus est une réponse.** */
  readonly dismissedAt: string | null;
}

/**
 * CE QUE LA LIGNE NE PORTE PAS, et qu'il faut pour la traduire.
 *
 * ⚠️ AUCUN CHAMP OPTIONNEL, et c'est une cicatrice nommée de ce dépôt
 * (« paramètre de garde optionnel = garde désarmée »): un `planDishTitles?`
 * aurait désarmé la garde des titres partout, sans qu'un seul appelant ne
 * remonte au compilateur.
 */
export interface PlanFeedbackContext {
  /**
   * LE JOUR OÙ LA PERSONNE A RÉPONDU, dans SA journée, `YYYY-MM-DD`.
   *
   * ⚠️ Pas un horodatage, pas `Date.parse`: `at` s'affiche (« je l'ai retenu de
   * mardi ») et une reprojection UTC ferait sortir un mardi soir parisien un
   * mercredi. Le socle refuse tout ce qui n'est pas déjà un jour propre.
   */
  readonly at: string;
  /** La langue DU PLAN (`meal_plan_feedback.content_locale`): `text` s'affiche. */
  readonly locale: string;
  /**
   * LES TITRES QUE CE PLAN PORTAIT — la liste fermée des réponses possibles.
   *
   * ⚠️ CE N'EST PAS UN MATCHER: c'est une appartenance EXACTE à la liste que
   * l'écran a proposée, après `trim`. Aucune normalisation, aucune
   * ressemblance, aucune casse ignorée. Un titre qui n'y est pas n'a pas été
   * proposé à la personne — il a été forgé, et il n'entre pas dans un magasin
   * que les générateurs servent au modèle.
   */
  readonly planDishTitles: readonly string[];
  /**
   * ── LOT B · LES ALIMENTS QUE CE PLAN PORTAIT ───────────────────────────
   *
   * La liste fermée des réponses possibles aux deux questions de plat, depuis
   * que ce sont des ALIMENTS et plus des titres. Même doctrine que sa voisine:
   * appartenance EXACTE après `trim`, aucune normalisation, aucune
   * ressemblance. Un aliment qui n'y est pas n'a pas été proposé à la personne.
   *
   * ⚠️ REQUISE, JAMAIS `?`. Optionnelle, elle aurait désarmé la garde
   * `notInPlan` sur tout ce que le lot B écrit, sans qu'un appelant ne remonte
   * au compilateur — la cicatrice « paramètre de garde optionnel = garde
   * désarmée », pour la deuxième fois dans ce fichier.
   *
   * `[]` est une réponse: un plan dont on n'a pas su lire les ingrédients ne
   * propose aucun aliment, et alors aucune réponse d'aliment n'entre.
   */
  readonly planFoodTerms: readonly string[];
  /** `practical_constraints.cooking_time_min` AUJOURD'HUI, ou `null`. */
  readonly cookingTimeMin: number | null;
  /**
   * ⟳ D2.5 (2026-09-03, A2) — `practical_constraints.cooking_style` AUJOURD'HUI.
   *
   * ⚠️ REQUIS, JAMAIS `?`, comme ses voisins et pour la même raison: un champ
   * optionnel ici n'aurait fait remonter aucun appelant au compilateur, et
   * l'effet se serait construit sans être branché.
   *
   * `null` = la question de P2 n'a pas été posée à ce compte. Les deux crans
   * s'appliquent alors aux DEUX champs sous-jacents, exactement comme avant ce
   * lot — c'est le chemin de toute la population d'aujourd'hui.
   */
  readonly cookingStyle: string | null;
  /** `practical_constraints.recipe_difficulty` AUJOURD'HUI, ou `null`. */
  readonly recipeDifficulty: string | null;
  /**
   * `practical_constraints.variety` AUJOURD'HUI, ou `null`.
   *
   * ⚠️ REQUIS, JAMAIS `?`. Un champ optionnel ici aurait désarmé la fermeture
   * de la 4ᵉ question sans qu'aucun appelant ne remonte au compilateur: la
   * réponse d'axe serait repartie en `noBaseline` pour tout le monde, et un
   * lot débranché est indiscernable d'un lot qui marche. Cicatrice nommée du
   * dépôt (« paramètre de garde optionnel = garde désarmée »).
   *
   * `null` est fréquent et c'est ATTENDU: `variety` n'est collectée par AUCUNE
   * étape de l'entonnoir (`onboarding.ts`, entrée `variety`, `step: null`) —
   * seule `CookingCapacityCard` l'écrit.
   *
   * ⚠️ ET DEPUIS LE 2026-08-19, `null` NE VAUT PLUS « rien ne bouge ». Une
   * PLAINTE sans base déclare le haut de l'échelle; une réponse satisfaite
   * n'écrit toujours rien. Le motif complet — et l'asymétrie des dégâts qui
   * l'autorise ici et nulle part ailleurs — est écrit au bloc de la réponse
   * d'axe. ⛔ Ça ne rend PAS ce champ optionnel: avec une base, on ne monte
   * que d'UN cran, et un `?` ferait sauter tout le monde au plafond.
   */
  readonly varietyLevel: string | null;
}

// ===========================================================================
// CE QUI SORT
// ===========================================================================

/**
 * CE QUI N'A PAS PRODUIT D'ITEM, MOTIF PAR MOTIF.
 *
 * ⚠️ « Champ déclaré par le modèle = compteur obligatoire »: sans ces nombres,
 * un lot DÉSARMÉ ressemble trait pour trait à un lot qui marche — un
 * questionnaire entier peut être rempli et ne rien produire pour une raison
 * parfaitement légitime (« oui », « ce qu'il fallait », « aucun »), et rien ne
 * distinguerait ça d'une extraction débranchée.
 */
export interface PlanFeedbackRetainedRefusals {
  readonly total: number;
  /** Le questionnaire a été refusé. Zéro item, et c'est la bonne réponse. */
  readonly dismissed: number;
  /** « oui », « ce qu'il fallait »: la réponse neutre ne retient rien. */
  readonly neutral: number;
  /** Retiré par `effectOf`: le jeton `none` et les titres vides. */
  readonly filteredByEffect: number;
  /** Un titre que ce plan ne portait pas. */
  readonly notInPlan: number;
  /** Le même plat marqué dans les deux sens: les DEUX tombent. */
  readonly bothPolarities: number;
  /**
   * Rien à faire bouger: la valeur courante est inconnue.
   *
   * ⚠️ IL NE COMPTE PLUS LA VARIÉTÉ DEPUIS LE 2026-08-19 — seulement
   * `cooking_time_min` et `recipe_difficulty`. Ces deux-là portent un DELTA
   * (« allège de 15 minutes », « un cran plus simple »): sans valeur courante,
   * il n'y a littéralement aucun résultat à écrire, et en supposer un
   * écrirait un réglage que personne n'a choisi. La variété, elle, a reçu une
   * décision produit — voir le bloc de la réponse d'axe.
   */
  readonly noBaseline: number;
  /** Déjà au plus bas: on ne descend pas sous le plancher. */
  readonly atFloor: number;
  /**
   * Déjà au plus haut: on ne monte pas au-dessus du dernier cran.
   *
   * ⚠️ UN COMPTEUR À PART, ET PAS `atFloor`. Les deux disent « le vocabulaire
   * est épuisé », mais dans des sens opposés, et les fondre rendrait
   * indistinguables « on a voulu simplifier une recette déjà simple » et « on a
   * voulu varier un plan déjà au maximum ». Le second est le seul des deux qui
   * ait besoin d'une décision produit (faut-il alors autre chose que la
   * variété ?), et un chiffre qu'on ne peut pas isoler ne demande jamais rien.
   */
  readonly atCeiling: number;
  /** « Pour qui » illisible — un REFUS, jamais un repli sur `household`. */
  readonly badSubject: number;
  /**
   * La réponse d'axe n'a pas de famille — **les DEUX axes non fermés, et eux
   * seuls**.
   *
   * ⚠️ IL DOIT RESTER NON NUL. `enough_variety` est fermée (elle produit un
   * `logistics.set{variety}`), `hunger_between_meals` et `could_finish` ne le
   * sont pas, et le motif est écrit dans le bloc de la réponse d'axe. Un
   * compteur tombé à zéro partout dirait « tout est fermé » — y compris les
   * deux axes dont le rabattement retirerait de la nourriture.
   */
  readonly axisNotRetained: number;
  /** Le socle a refusé l'item construit (jour, sujet, portée, `value`). */
  readonly malformed: number;
}

export interface PlanFeedbackRetained {
  /** À passer TEL QUEL à `persistRetainedItemsFor({durable})`. */
  readonly items: readonly RetainedItem[];
  /**
   * ── LOT M5 · CE QUI VA DANS LE CHAMP, ET PLUS DANS UN MAGASIN À PART ─────
   *
   * `logistics.set` et `rhythm.set` ne sont plus des items retenus: ils
   * changent le champ que la personne voit dans ses réglages.
   *
   * ⛔ LE DÉFAUT QUE ÇA FERME, ET IL ÉTAIT MUET. Un `logistics.set` retenu
   * n'écrivait rien: les deux générateurs le posaient EN MÉMOIRE juste avant de
   * composer (`logisticsOverlayFor`). La personne lisait **45 min** dans ses
   * réglages et son plan était composé sur **35** — une décision du produit
   * qu'aucun écran ne montrait, et que rien ne pouvait défaire.
   *
   * ⚠️ CHAQUE ENTRÉE PORTE `previous`, ET C'EST CE QUI REND LE GESTE INVERSE
   * POSSIBLE. Un scalaire ne se « retire » pas: sans la valeur d'avant, défaire
   * voudrait dire « retape ce que tu avais », c'est-à-dire demander à la
   * personne un nombre que le produit lui a effacé.
   */
  readonly fieldChanges: readonly FieldChange[];
  readonly refused: PlanFeedbackRetainedRefusals;
}

// ===========================================================================
// LES PHRASES QUE LA PERSONNE LIRA
// ===========================================================================

/**
 * `text` EST LA VÉRITÉ AFFICHÉE, donc il est écrit dans les DEUX langues.
 *
 * `profiles.locale` vaut `fr-FR` par défaut sur ce produit: une phrase anglaise
 * en dur ferait une carte « Ce que Sophia sait de toi » à moitié étrangère à la
 * majorité des élèves. Le patron est celui de `QUESTION_LABELS` — deux packs
 * entiers, jamais un repli mot à mot.
 *
 * ⛔ AUCUN PRÉNOM DANS CES PHRASES. Le sujet voyage dans `subject`
 * (`member:<uuid>`); la carte résout le prénom à l'affichage, et il suit un
 * renommage. Une phrase qui porterait « Zoé » resterait fausse pour toujours.
 */
const TEXTS = {
  // ── QUATRE PHRASES POUR QUATRE RÉPONSES, ET PAS DEUX ────────────────────
  // ⚠️ LE CRAN SE LIT DANS `text`, PAS SEULEMENT DANS `value`. `text` est la
  // vérité affichée sur la carte « Ce que Sophia sait de toi », et la règle du
  // bloc ci-dessus est « la phrase dit ce que la PERSONNE a répondu ». Rendre
  // la même phrase pour « un peu trop » et « vraiment trop » ferait deux
  // réponses différentes indistinguables à l'écran: la personne y lirait sa
  // ligne, la trouverait juste, et ne saurait jamais que le cran fort qu'elle
  // a coché est bien celui qui a été retenu.
  portion_down: {
    en: "The portions in the plan were a bit too much",
    fr: "Les portions du plan étaient un peu trop grosses",
  },
  portion_down_clear: {
    en: "The portions in the plan were really too much",
    fr: "Les portions du plan étaient vraiment trop grosses",
  },
  portion_up: {
    en: "The portions in the plan were a bit short",
    fr: "Les portions du plan étaient un peu justes",
  },
  portion_up_clear: {
    en: "The portions in the plan were really not enough",
    fr: "Les portions du plan n'étaient vraiment pas assez copieuses",
  },
  recipe_simpler: {
    en: "Simpler recipes",
    fr: "Des recettes plus simples",
  },
  cooking_time: {
    en: "Shorter cooking sessions",
    fr: "Des sessions de cuisine plus courtes",
  },
  // ⚠️ LA PHRASE DIT CE QUE LA PERSONNE A RÉPONDU, PAS LE RÉGLAGE QU'ON EN
  // DÉDUIT. Elle a coché « pas assez de variété »; écrire « Varie autant que
  // possible » (le libellé du cran `varied`) lui attribuerait une demande plus
  // forte que la sienne, et `text` est la vérité affichée sur sa carte.
  variety_more: {
    en: "More variety across the plan",
    fr: "Plus de variété dans le plan",
  },
} as const;

function say(key: keyof typeof TEXTS, locale: string): string {
  return isFrenchLocale(locale) ? TEXTS[key].fr : TEXTS[key].en;
}

// ===========================================================================
// LOT M2 · LA CITATION — ce que la personne a LU, et ce qu'elle a CLIQUÉ
// ===========================================================================

/**
 * LA PHRASE SOURCE D'UNE LIGNE ISSUE DU BILAN.
 *
 * ── POURQUOI ELLE PORTE LA QUESTION **ET** LA RÉPONSE ─────────────────────
 * Le bilan répond par des JETONS (`too_much`, `partly`), pas par du texte
 * libre. Citer le jeton ne citerait personne. Citer la seule réponse
 * (« Un peu trop ») ne dirait pas trop de QUOI. C'est le couple qui reconstitue
 * le moment: *« Les portions du plan étaient : » → « Un peu trop »*, et devant
 * ça la personne sait immédiatement si la ligne dit ce qu'elle voulait dire.
 *
 * ⛔ LES LIBELLÉS SONT CEUX DE `plan_feedback.ts`, IMPORTÉS ET JAMAIS RECOPIÉS.
 * Ce sont **les mots qu'elle a lus sur l'écran**. En écrire une seconde version
 * ici produirait une citation qui ressemble à ce qu'elle a vu sans en être —
 * c'est-à-dire une citation fausse, et une citation fausse est pire que pas de
 * citation: elle lui fait croire qu'elle a dit une chose qu'elle n'a pas dite.
 * Le dépôt a déjà écrit la règle voisine, mot pour mot: le libellé décrit la
 * position sur l'échelle affichée, le jeton porte le sens archivé.
 *
 * ⚠️ UNE RÉPONSE HORS TABLE SE CITE TELLE QUELLE, et c'est voulu: un titre de
 * plat (`never_again`, `make_again`) n'est pas une option fermée. On rend donc
 * ses mots à elle, sans les traduire ni les rapprocher de quoi que ce soit.
 *
 * PURE: la langue arrive en paramètre, comme partout dans ce fichier.
 */
function quoteOf(
  question: FeedbackQuestion,
  answer: string,
  locale: string,
): string {
  const fr = isFrenchLocale(locale);
  const asked = fr
    ? QUESTION_LABELS[question].fr
    : QUESTION_LABELS[question].en;
  const option = OPTION_LABELS[answer];
  const said = option
    ? (fr ? option.fr : option.en)
    : String(answer ?? "").trim();
  // ⚠️ LES GUILLEMETS SUIVENT LA LANGUE, EUX AUSSI. `« »` dans une phrase
  // anglaise se lit comme une citation importée d'ailleurs — le détail est
  // petit, mais il porte sur la SEULE chose que la personne doit reconnaître
  // comme sienne. Deux packs entiers, jamais un repli mot à mot: c'est la règle
  // du dépôt pour tout ce qui sort en deux langues.
  const [open, close] = fr ? ["« ", " »"] : ["“", "”"];
  return `${open}${asked}${close} → ${open}${said}${close}`;
}

// ===========================================================================
// L'EXTRACTION
// ===========================================================================

/**
 * LES SEPT RÉPONSES → DES `RetainedItem`.
 *
 * ── LE MAPPING, RÉPONSE PAR RÉPONSE ────────────────────────────────────────
 *   `cooked`          → `logistics.set` (`cooking_time_min`, `recipe_difficulty`)
 *                       C'est le lecteur que la colonne se nomme à elle-même.
 *   `portions`        → `portion.adjust` — **la seule famille dont ce
 *                       producteur est le seul producteur**, et la seule qui
 *                       porte un `subject` demandé.
 *   `never_again`     → `food.exclude`
 *   `make_again`      → `food.prefer`
 *   `axis_question` + `axis_answer` → `logistics.set` (`variety`) POUR LE SEUL
 *                       axe `enough_variety`; ⛔ RIEN pour les deux autres.
 *                       Voir le bloc de la réponse d'axe, plus bas.
 *   `dismissed_at`    → ⛔ RIEN, et c'est la bonne réponse: refuser de répondre
 *                       ne déclare aucun goût. Compté quand même, sinon un
 *                       refus est indiscernable d'une extraction débranchée.
 *
 * ── ⛔ CE QUI N'EST PAS PRODUIT, ET POURQUOI C'EST ÉCRIT ────────────────────
 * `rhythm.set` est AUTORISÉ à ce producteur par la matrice, et il n'en produit
 * aucun: **aucune question du questionnaire ne porte sur un moment de la
 * journée**. Autorisé n'est pas produit; inventer la question ici serait poser
 * une question que personne n'a validée pour combler une case d'un tableau.
 */
export function retainedItemsFromPlanFeedback(
  row: PlanFeedbackRow,
  ctx: PlanFeedbackContext,
): PlanFeedbackRetained {
  const counts: Record<
    keyof Omit<PlanFeedbackRetainedRefusals, "total">,
    number
  > = {
    dismissed: 0,
    neutral: 0,
    filteredByEffect: 0,
    notInPlan: 0,
    bothPolarities: 0,
    noBaseline: 0,
    atFloor: 0,
    atCeiling: 0,
    badSubject: 0,
    axisNotRetained: 0,
    malformed: 0,
  };
  const items: RetainedItem[] = [];
  // LOT M5 — ce qui va dans le CHAMP, à côté de ce qui reste un item retenu.
  const fieldChanges: FieldChange[] = [];

  // ── UN REFUS EST UNE RÉPONSE, ET SA TRADUCTION EST « RIEN » ──────────────
  // Fermer le questionnaire n'est pas « je n'aime rien »: c'est « pas
  // maintenant ». En tirer le moindre item ferait naître une règle de vie d'un
  // geste de sortie.
  if (String(row.dismissedAt ?? "").trim() !== "") {
    counts.dismissed = 1;
    return { items, fieldChanges, refused: withTotal(counts) };
  }

  // ⚠️ LA SEULE TABLE DE DÉCISION, ET ELLE EXISTAIT DÉJÀ. On ne relit ni
  // `cooked`, ni `portions`, ni le jeton `none`: `effectOf` les tranche, et ce
  // module traduit ce qu'elle rend. Une seconde lecture ici serait la première
  // chose à diverger.
  const effect = effectOf({
    cooked: row.cooked,
    portions: row.portions,
    difficulty: row.difficulty,
    speed: row.speed,
    variety: row.variety,
    neverAgain: row.neverAgain,
    makeAgain: row.makeAgain,
    // ⚠️ LES DEUX CHAMPS HÉRITÉS PARTENT AVEC LE RESTE, et c'est ce qui fait
    // qu'une ligne écrite AVANT le lot B agit encore: sa réponse de variété
    // vivait dans `axis_answer`, sous le jeton `axis_question`. `effectOf` lit
    // le champ neuf d'abord, l'hérité ensuite, et jamais les deux.
    axisQuestion: row.axisQuestion,
    axisAnswer: row.axisAnswer,
  });

  // Ce que `effectOf` a retiré — COMPTÉ, jamais refiltré: le jeton `none` (qui
  // créerait un aliment fantôme que le générateur chercherait à vie) et les
  // entrées vides ou illisibles.
  counts.filteredByEffect = (row.neverAgain?.length ?? 0) -
    effect.refusedFoods.length +
    ((row.makeAgain?.length ?? 0) - effect.keptFoods.length);

  // ── LES DEUX POLARITÉS SUR LE MÊME ALIMENT: LES DEUX TOMBENT ─────────────
  // L'écran l'interdit (une marque en remplace l'autre), donc ce cas ne vient
  // que d'un client forgé ou d'un futur écran. Le garder produirait, dans le
  // MÊME magasin, « n'aime pas X » et « veut revoir X » — c'est-à-dire, mot
  // pour mot, le défaut mesuré en run réel que la nomenclature cite en tête:
  // `["Aime le brocoli s'il est rôti.", "N'aime pas le brocoli."]`.
  //
  // ⚠️ LA CONTRADICTION SE JUGE SUR (ALIMENT, SUJET), PAS SUR L'ALIMENT SEUL —
  // lot B. « Plus de saumon pour Tom » et « du saumon pour Léa » ne se
  // contredisent pas: ce sont deux assiettes. Les fondre sur le seul aliment
  // ferait tomber les DEUX lignes d'un foyer où deux bouches ne veulent pas la
  // même chose, c'est-à-dire le cas normal d'une table.
  const keyOf = (a: { food: string; subject: string | null }): string =>
    `${a.food.trim()}\u0000${String(a.subject ?? "").trim()}`;
  const refusedSet = new Set(effect.refusedFoods.map(keyOf));
  const keptSet = new Set(effect.keptFoods.map(keyOf));
  const contradictory = new Set<string>();
  for (const key of refusedSet) if (keptSet.has(key)) contradictory.add(key);

  // ⛔ LES DEUX LISTES D'APPARTENANCE, ET LA FORME DÉCIDE LAQUELLE. Un aliment
  // se cherche dans les aliments du plan, un titre hérité dans ses titres. Les
  // réunir en un seul ensemble laisserait un titre passer pour un aliment (et
  // l'inverse), c'est-à-dire écrirait « Poulet rôti au citron » comme un
  // aliment que la ceinture par bouche chercherait ensuite dans des
  // ingrédients.
  const planTitles = new Set(
    (ctx.planDishTitles ?? []).map((t) => String(t ?? "").trim()).filter((t) =>
      t
    ),
  );
  const planFoods = new Set(
    (ctx.planFoodTerms ?? []).map((t) => String(t ?? "").trim()).filter((t) =>
      t
    ),
  );

  for (
    const [answers, kind, question] of [
      [effect.refusedFoods, "food.exclude", "never_again"],
      [effect.keptFoods, "food.prefer", "make_again"],
    ] as const
  ) {
    for (const answer of answers) {
      const food = String(answer.food ?? "").trim();
      if (contradictory.has(keyOf(answer))) {
        counts.bothPolarities += 1;
        continue;
      }
      // ⛔ APPARTENANCE EXACTE À LA LISTE PROPOSÉE — pas un rapprochement.
      //    Un aliment OU un titre hérité: l'un des deux ensembles doit le
      //    porter, et il suffit qu'aucun ne le porte pour que ça tombe.
      if (!planFoods.has(food) && !planTitles.has(food)) {
        counts.notInPlan += 1;
        continue;
      }
      // ── LE SUJET — lot B ────────────────────────────────────────────────
      // ⛔ `null` VEUT DIRE « la question n'a pas été posée » (un solo, ou une
      //    ligne héritée), et se range sur `household` — ce qui est la vérité:
      //    un solo EST toute sa table. Un sujet PRÉSENT mais illisible est un
      //    REFUS, jamais un repli: replier appliquerait à toute la table ce qui
      //    visait une bouche.
      let subject: RetainedSubject = HOUSEHOLD_SUBJECT;
      if (String(answer.subject ?? "").trim() !== "") {
        const parsed = subjectOf(answer.subject);
        if (parsed === null) {
          counts.badSubject += 1;
          continue;
        }
        subject = parsed;
      }
      push(items, counts, {
        kind,
        subject,
        text: food,
        value: null,
        at: ctx.at,
        // ⚠️ LA QUESTION SUIT LA POLARITÉ. « un plat que tu ne referais pas ? »
        // et « un plat que tu aimerais revoir ? » sont deux questions
        // différentes, et citer la mauvaise inverserait le sens de la ligne
        // sous les yeux de la personne.
        quote: quoteOf(question, food, ctx.locale),
      });
    }
  }

  // ── `portion.adjust` — LA FAMILLE QUE CE PRODUCTEUR EST SEUL À ÉCRIRE ────
  const adjust = effect.portionAdjust;
  if (adjust === null) {
    // « Ce qu'il fallait », ou la question retirée par le plancher TCA. Rien à
    // retenir, et c'est une réponse: on la compte.
    counts.neutral += 1;
  } else {
    const subject = subjectOf(row.portionsSubject);
    if (subject === null) {
      // ⛔ UN SUJET ILLISIBLE EST UN REFUS, PAS UN REPLI SUR `household`.
      // Replier appliquerait à TOUTE la table une mesure destinée à une bouche
      // — exactement ce que l'axe 3 de la nomenclature interdit.
      counts.badSubject += 1;
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // LES DEUX CRANS ARRIVENT D'`effectOf`, ET RIEN N'EST DÉCIDÉ ICI.
      // ═══════════════════════════════════════════════════════════════════
      //
      // ⚠️ CE BLOC CODAIT `magnitude: "slight"` EN DUR JUSQU'AU 2026-08-19, et
      // ça bloquait le produit ENTIER: le questionnaire est le seul producteur
      // de `portion.adjust` (matrice §5, ②), un nouvel ajustement REMPLACE le
      // précédent (`winningPortionAdjust`: jamais de somme), donc quelqu'un
      // dont les parts sont énormément trop grosses recevait −5 %, recochait,
      // recevait ENCORE −5 %, et restait là pour toujours. Le cran `clear` du
      // moteur (−10 %) n'était atteignable par AUCUN chemin du produit.
      //
      // ⛔ LA TRADUCTION VIT DANS `effectOf`, PAS ICI — c'est la règle du
      // fichier (« il ne décide rien, il traduit »). La relire ici ferait une
      // seconde table de jetons, et c'est celle qu'on regarde le moins qui
      // garderait trois entrées le jour d'un sixième cran.
      //
      // ⚠️ LES DEUX VARIABLES TYPÉES SONT LE LIEN AVEC LE SOCLE, et elles ne
      // sont pas décoratives: `plan_feedback.ts` est monté par le FRONT et ne
      // peut pas importer `retained_item.ts` (deux runtimes — le front tient
      // exprès sa propre copie). Son vocabulaire est donc une RECOPIE, et
      // c'est cette assignation qui l'empêche de dériver: un cran renommé, ou
      // un troisième cran ajouté d'un seul côté, ne compile plus.
      const direction: PortionDirection = adjust.direction;
      const magnitude: PortionMagnitude = adjust.magnitude;
      push(items, counts, {
        kind: "portion.adjust",
        subject,
        text: say(
          direction === "down"
            ? (magnitude === "clear" ? "portion_down_clear" : "portion_down")
            : (magnitude === "clear" ? "portion_up_clear" : "portion_up"),
          ctx.locale,
        ),
        value: { direction, magnitude },
        at: ctx.at,
        // ⚠️ LE JETON BRUT (`row.portions`), pas le cran traduit. `OPTION_LABELS`
        // rend le libellé que la personne a LU sur l'échelle affichée; passer
        // `magnitude` citerait « slight », un mot qu'elle n'a jamais vu.
        quote: quoteOf("portions", String(row.portions ?? ""), ctx.locale),
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LES TROIS INDICES DE CUISINE — LOT B: ON DEMANDE, ON NE DEVINE PLUS
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ── CE QUI A CHANGÉ, ET CE QUE ÇA FERME ──────────────────────────────────
  // Jusqu'au lot B, `cooked` déplaçait DEUX champs tout seul: « non » ou « en
  // partie » retirait 15 ou 10 minutes de session ET simplifiait les recettes
  // d'un cran. C'était une DÉDUCTION double sur une réponse unique — le produit
  // décidait lequel des deux problèmes la personne avait eu, et déplaçait les
  // deux réglages pour être sûr. Deux questions le demandent maintenant
  // (`difficulty`, `speed`), et `cooked` est redevenu la garde qui décide si on
  // les pose (`cookingQuestionsAreAsked`).
  //
  // ── ⛔ UN CRAN D'ÉCHELLE, JAMAIS UN DELTA DE MINUTES ─────────────────────
  // L'ancien effet retirait « 10 minutes » d'une valeur courante. Sur 45 min il
  // écrivait 35 — un nombre que l'écran ne propose PAS
  // (`COOKING_SESSION_MINUTES = [30, 45, 60, 90, 120, 180]`), donc un réglage
  // que la personne ne peut plus retrouver dans son propre formulaire. Un cran
  // est un BARREAU de cette échelle, et la personne le reconnaît.
  //
  // ── ⛔ LES DEUX SENS, ET C'EST LA CONDITION DU LOT ────────────────────────
  // La déduction ne savait que descendre. Un champ qui ne fait que cliqueter
  // vers le bas finit au plancher et n'en remonte jamais — c'est ce que le
  // §4-bis de la nomenclature nomme, et ce qui rendait le débat « champ ou
  // indice » indécidable. `could_do_more` et `had_more_time` existent pour ça.
  //
  // ── LES TROIS SUIVENT LA MÊME MÉCANIQUE ──────────────────────────────────
  // Un pas sur une échelle ORDONNÉE, depuis la valeur COURANTE, borné aux deux
  // bouts, journalisé avec la question citée. `applyStep` la porte une fois
  // pour les trois — trois copies auraient divergé au premier bord.
  // ── ⟳ D2.5 (2026-09-03, A2) · QUAND UN STYLE EST DÉCLARÉ, C'EST LUI QUI BOUGE
  //
  // ⛔ LE DÉFAUT QUE ÇA FERME, ET IL EST LE MÊME QUE CELUI DU LOT B, UN CRAN
  // PLUS LOIN. Le lot B a cessé d'écrire « 35 minutes », un nombre que l'écran
  // ne propose pas. P2 va plus loin: l'écran ne propose plus AUCUN nombre de
  // minutes, et `recipe_difficulty` n'a **aucun lecteur** dans les deux
  // générateurs. Pire, `cooking_time_min` est ÉCRASÉ à la composition par la
  // dérivation du style (`resolveCookingCapacity`). Déplacer ces deux champs-là
  // sur un compte qui a répondu à P2, c'est écrire deux réglages que personne
  // ne lit et que personne ne voit — une correction que la personne ne peut ni
  // comprendre ni défaire.
  //
  // ⚠️ ET SANS STYLE DÉCLARÉ, RIEN NE CHANGE: les deux `applyStep` d'origine
  // tournent à l'identique. C'est le chemin de toute la population
  // d'aujourd'hui, et un test le tient ligne à ligne.
  const declaredStyle = readCookingStyle({ cooking_style: ctx.cookingStyle });
  if (declaredStyle !== null) {
    const styleStep = cookingStyleStepFrom(
      effect.difficultyStep,
      effect.speedStep,
    );
    if (styleStep === "conflict") {
      // ⚠️ `bothPolarities` ET PAS UN COMPTEUR NEUF: son sens est exactement
      // celui-ci — « la même chose demandée dans les deux sens, les DEUX
      // tombent ». Il le disait des plats; il le dit maintenant aussi des deux
      // axes de cuisine ramenés sur un cadran unique.
      counts.bothPolarities += 1;
    } else if (styleStep !== null) {
      applyStep(fieldChanges, counts, {
        step: styleStep,
        field: "cooking_style",
        // Ordonnée du moins ambitieux au plus ambitieux — la MÊME que celle du
        // module qui la porte, jamais recopiée: c'est l'ordre qui décide de
        // quel côté on descend.
        ladder: COOKING_STYLES as readonly string[],
        current: declaredStyle,
        at: ctx.at,
        // ⚠️ LA QUESTION CITÉE EST CELLE QUI A PRODUIT LE CRAN, et quand les
        // deux l'ont produit ensemble c'est `difficulty` — la première des deux
        // que le questionnaire pose. Citer l'autre serait tout aussi vrai;
        // avoir une RÈGLE est ce qui empêche la citation de bouger au hasard
        // d'un refactor.
        quote: effect.difficultyStep !== null
          ? quoteOf("difficulty", String(row.difficulty ?? ""), ctx.locale)
          : quoteOf("speed", String(row.speed ?? ""), ctx.locale),
      });
    }
  } else {
    applyStep(fieldChanges, counts, {
      step: effect.difficultyStep,
      field: "recipe_difficulty",
      // Ordonnée du plus simple au plus ambitieux.
      ladder: RECIPE_DIFFICULTIES as readonly string[],
      current: String(ctx.recipeDifficulty ?? "").trim().toLowerCase(),
      at: ctx.at,
      quote: quoteOf("difficulty", String(row.difficulty ?? ""), ctx.locale),
    });
    applyStep(fieldChanges, counts, {
      step: effect.speedStep,
      field: "cooking_time_min",
      // ⚠️ LES SIX DURÉES QUE L'ÉCRAN PROPOSE, ET C'EST UNE RECOPIE ASSUMÉE:
      // `COOKING_SESSION_MINUTES` vit dans le front (`api/planBudget.ts`), que ce
      // runtime ne peut pas importer. Le test l'épingle en LISANT ce fichier-là —
      // même patron que `COOKING_TIME_FLOOR_MIN`, dont le plancher est le premier
      // barreau de cette même échelle.
      ladder: COOKING_SESSION_LADDER.map((m) => String(m)),
      current: Number.isFinite(Number(ctx.cookingTimeMin))
        ? String(Number(ctx.cookingTimeMin))
        : "",
      at: ctx.at,
      quote: quoteOf("speed", String(row.speed ?? ""), ctx.locale),
      // Le champ porte un NOMBRE, pas le jeton d'échelle.
      asNumber: true,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LA VARIÉTÉ — LE TROISIÈME INDICE, ET IL EST POSÉ À TOUT LE MONDE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ── CE QUI A CHANGÉ LE 2026-09-03 (lot B) ────────────────────────────────
  // C'était la « quatrième question », réservée à `maintenance`, et les deux
  // autres dynamiques recevaient à sa place une question sans aucun lecteur
  // (`hunger_between_meals`, `could_finish` — `emphasisHint` n'a jamais eu
  // d'appelant). Les deux sont RETIRÉES, celle-ci devient commune: son champ
  // (`variety`) est lu par les deux lanes pour tout le monde, et ne la demander
  // qu'à une dynamique sur trois rendait le cran inatteignable aux deux autres.
  //
  // ⚠️ `axisNotRetained` NE PEUT PLUS MONTER QUE SUR LE PASSÉ, et il reste.
  // Une ligne écrite AVANT le lot B peut porter `axis_question =
  // "hunger_between_meals"`: elle n'a toujours aucune famille, et le compteur
  // est ce qui empêche de croire que « tout est fermé » — y compris les deux
  // axes dont le rabattement retirerait de la nourriture. Les trois refus
  // examinés en 2026-08-19 (vers `portion.adjust`, vers `rhythm.set`, vers
  // `food.prefer`) restent écrits dans `plan_feedback.ts`, au bloc du
  // vocabulaire, parce que c'est là qu'on décide de reposer une question.
  const legacyAxis = String(row.axisQuestion ?? "").trim();
  if (
    legacyAxis !== "" && legacyAxis !== "enough_variety" &&
    String(row.axisAnswer ?? "").trim() !== ""
  ) {
    counts.axisNotRetained += 1;
  }
  if (effect.varietyPressure === null) {
    // « Oui, assez de variété », une question non posée, ou un jeton forgé.
    // Rien à retenir, et c'est une réponse: on la compte.
    counts.neutral += 1;
  } else {
    // ── UN CRAN PLUS HAUT, DEPUIS UNE VALEUR CONNUE ───────────────────────
    //
    // ═══════════════════════════════════════════════════════════════════════
    // ⚠️ SANS BASE, UNE **PLAINTE** DÉCLARE — ET ELLE DÉCLARE LE HAUT.
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Décision produit du 2026-08-19, INCHANGÉE par le lot B. Le défaut mesuré:
    // `practical_constraints.variety` n'est écrit que par
    // `CookingCapacityCard`, et AUCUNE étape de l'entonnoir ne le collecte
    // (`onboarding.ts`, entrée `variety`, `step: null`). Un élève qui n'a
    // jamais ouvert cette carte répondait « pas assez de variété » et obtenait
    // ZÉRO item — une question posée, une réponse donnée, et rien.
    //
    // ── POURQUOI LE HAUT DE L'ÉCHELLE, ET PAS LE CRAN DU MILIEU ────────────
    //  · Sans base, la personne ne CORRIGE pas, elle DÉCLARE pour la première
    //    fois — et une déclaration n'a pas besoin d'une référence.
    //  · « Pas assez » n'a qu'une lecture non ambiguë: PLUS QUE CE QU'ELLE A
    //    EU. Écrire `some` affirmerait une position moyenne qu'elle n'a pas
    //    exprimée — une invention, dans l'autre sens.
    //  · L'ASYMÉTRIE DES DÉGÂTS AUTORISE CE RACCOURCI, ET ELLE SEULE: la
    //    variété NE RETIRE PAS DE NOURRITURE. Se tromper vers le haut coûte un
    //    peu de diversité en cuisine. C'est ce qui rend acceptable ici un saut
    //    que `portion.adjust` n'autoriserait JAMAIS.
    //
    // ⛔ ET CE QUI RESTE REFUSÉ: semer la base depuis le défaut d'AFFICHAGE de
    // `CookingCapacityCard` (`some`). Ce serait écrire un réglage que personne
    // n'a choisi, sur la clé même que le prompt sert.
    //
    // ⚠️ LA CITATION SUIT LA SOURCE DE LA RÉPONSE. Une ligne neuve porte
    // `variety`; une ligne héritée porte `axis_answer` sous son jeton. Citer
    // la mauvaise mettrait sous les yeux de la personne une question qu'elle
    // n'a pas lue.
    const varietyAnswer = String(row.variety ?? "").trim() ||
      String(row.axisAnswer ?? "").trim();
    const at = (VARIETY_LEVELS as readonly string[]).indexOf(
      String(ctx.varietyLevel ?? "").trim().toLowerCase(),
    );
    if (at >= 0 && at >= VARIETY_LEVELS.length - 1) counts.atCeiling += 1;
    else {
      const next = at < 0
        ? VARIETY_LEVELS[VARIETY_LEVELS.length - 1]
        : VARIETY_LEVELS[at + 1];
      pushField(fieldChanges, {
        field: "variety",
        previous: ctx.varietyLevel,
        next,
        at: ctx.at,
        quote: quoteOf("enough_variety", varietyAnswer, ctx.locale),
      });
    }
  }

  return { items, fieldChanges, refused: withTotal(counts) };
}

// ---------------------------------------------------------------------------
// LES PIÈCES
// ---------------------------------------------------------------------------

/**
 * LE SUJET DE L'AJUSTEMENT: `household`, `member:<uuid>`, ou REFUS.
 *
 * `null` en entrée = la question n'a pas été posée (une seule bouche, ou
 * réponse neutre): le sujet est alors `household`, « tout le monde à table »,
 * qui est LE DÉFAUT de l'axe 3 — et pour un compte solo c'est la seule valeur
 * possible, puisqu'il n'a aucune ligne `household_members`.
 *
 * ⚠️ UNE CHAÎNE ILLISIBLE N'EST PAS UN VIDE. `member:marc`, un uuid tronqué,
 * une valeur forgée: ce sont des REFUS. Le socle refuse déjà de les replier sur
 * `household`, et ce module ne le fait pas non plus.
 */
function subjectOf(raw: string | null): RetainedSubject | null {
  const value = String(raw ?? "").trim();
  if (value === "") return HOUSEHOLD_SUBJECT;
  return parseRetainedSubject(value);
}

/**
 * CONSTRUIT L'ITEM PAR LE PARSEUR DU SOCLE — jamais par un `as`.
 *
 * ⚠️ C'est la doctrine écrite sur `RetainedItemBase`: « un producteur assemble
 * un objet nu et le fait passer par le parseur ». Un `as RetainedItem`
 * désarmerait le typecheck (cicatrice mesurée: `200` au log, `null` en
 * silence) et sauterait les huit vérifications — dont `canProduce`, le jour où
 * quelqu'un ajoutera ici une famille que la matrice refuse à ce producteur.
 *
 * `scope` vient de `defaultScopeFor`, et **un `null` est un REFUS**: jamais
 * `?? "durable"`. Replier réarmerait précisément l'interdit que la matrice
 * vient de poser.
 *
 * `source` est fixé au jeton, `item` est `""` et `confidence` est `null`:
 *   · `item: ""` — le questionnaire n'a pas de `memory_items` d'origine à
 *     citer. ⚠️ Y mettre l'id de la ligne de retour serait pire que vide:
 *     l'identifiant du magasin est `(kind, item)`, donc DEUX plats refusés du
 *     même questionnaire se dédoubleraient en un seul (`retained_items_io.ts`,
 *     `identityOf`).
 *   · `confidence: null` — une case cochée n'est pas vraie à 82 %. Le socle
 *     REFUSE une confiance sur autre chose qu'une conversation.
 */
/**
 * UN PAS SUR UNE ÉCHELLE ORDONNÉE, DEPUIS LA VALEUR COURANTE — lot B.
 *
 * Les trois indices de cuisine (difficulté, rapidité, variété) suivent la même
 * mécanique, et elle vit ICI une seule fois: trois copies auraient divergé au
 * premier bord.
 *
 * ── LES QUATRE ISSUES, TOUTES NOMMÉES ET COMPTÉES ─────────────────────────
 *  · pas de pas demandé (`null`) ⇒ rien, et on ne compte rien: la question
 *    n'a pas été posée, ou sa réponse est le cran du milieu (déjà compté
 *    `neutral` par l'appelant pour la variété);
 *  · **aucune base lisible** ⇒ `noBaseline`. `logistics.set` porte une valeur
 *    ABSOLUE, pas un delta: sans la valeur courante, « un cran plus court »
 *    n'a pas de résultat, et supposer 30, 45 ou 60 écrirait un réglage que
 *    personne n'a choisi. ⚠️ La variété fait exception, et son motif est écrit
 *    chez elle (une PLAINTE sans base déclare le haut de l'échelle) — c'est
 *    pour ça qu'elle n'passe pas par cette fonction;
 *  · **au bord dans le sens demandé** ⇒ `atFloor` ou `atCeiling`, ET LA LIGNE
 *    DE JOURNAL N'EST PAS ÉCRITE. Le vocabulaire est épuisé: écrire
 *    `previous === next` mettrait dans le fil « ce qui vient de changer » une
 *    ligne qui n'a rien changé, avec un bouton « défaire » qui ne défait rien.
 *    ⚠️ Les deux compteurs sont DISJOINTS, et pas par élégance: `atFloor` qui
 *    monte dit « les recettes sont déjà au plus simple et ça ne suffit pas »,
 *    `atCeiling` dit « on est au maximum de ce que le vocabulaire permet ».
 *    Le second est le seul des deux qui demande une décision produit;
 *  · sinon ⇒ une ligne, avec `previous` (ce qui rend le geste inverse
 *    possible) et la question CITÉE.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * D2.5 — LES DEUX CRANS DE CUISINE, RAMENÉS SUR **UN SEUL** CADRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `cooking_style` (P2) est UN cadran qui porte les deux axes à la fois: la
 * table `COOKING_STYLE_PROFILE` lui fait tenir les minutes (la vitesse) ET la
 * difficulté des recettes. Quand il est déclaré, les deux questions du
 * questionnaire pointent donc le même réglage.
 *
 *   · les deux d'accord, ou un seul répondu ⇒ un cran, dans ce sens;
 *   · les deux en sens OPPOSÉS            ⇒ `"conflict"`.
 *
 * ⛔ « LES DEUX D'ACCORD » NE FONT QU'UN CRAN, PAS DEUX. Marcher l'échelle
 * deux fois ferait sauter `keen` → `minimal` sur un seul questionnaire: une
 * personne qui dit « c'était trop long ET trop dur » demande un cran plus
 * accessible, pas le plancher.
 *
 * ⛔ ET LE CONFLIT NE SE TRANCHE PAS EN SILENCE. « Des recettes plus simples,
 * mais j'avais plus de temps » est une réponse parfaitement cohérente que le
 * cadran unique NE SAIT PAS écrire — c'est le prix, mesurable, d'avoir fondu
 * deux axes en une question. En choisir un des deux inventerait une préférence;
 * on ne bouge rien, et le compteur le dit. La sortie du jour où ça se mesure
 * est écrite au journal d'A2 (§ déviations).
 *
 * PURE: no I/O, no clock.
 */
export function cookingStyleStepFrom(
  difficultyStep: "down" | "up" | null,
  speedStep: "down" | "up" | null,
): "down" | "up" | null | "conflict" {
  if (difficultyStep === null) return speedStep;
  if (speedStep === null) return difficultyStep;
  return difficultyStep === speedStep ? difficultyStep : "conflict";
}

function applyStep(
  fieldChanges: FieldChange[],
  counts: Record<keyof Omit<PlanFeedbackRetainedRefusals, "total">, number>,
  args: {
    step: "down" | "up" | null;
    field: WritableField;
    ladder: readonly string[];
    current: string;
    at: string;
    quote: string;
    asNumber?: boolean;
  },
): void {
  if (args.step === null) return;
  const at = args.ladder.indexOf(args.current);
  if (at < 0) {
    counts.noBaseline += 1;
    return;
  }
  if (args.step === "down" && at === 0) {
    counts.atFloor += 1;
    return;
  }
  if (args.step === "up" && at === args.ladder.length - 1) {
    counts.atCeiling += 1;
    return;
  }
  const nextRaw = args.ladder[args.step === "down" ? at - 1 : at + 1];
  // ⚠️ LA VALEUR RELUE, PAS L'INDEX. `at` est la POSITION dans l'échelle; ce
  // qu'il faut pouvoir remettre est le cran tel qu'il était écrit. Et le champ
  // des minutes porte un NOMBRE: y écrire la chaîne « 45 » ferait un réglage
  // que `parseLogisticsSetValue` refuse à la lecture — écrit, puis invisible.
  const next: unknown = args.asNumber ? Number(nextRaw) : nextRaw;
  const previous: unknown = args.asNumber ? Number(args.current) : args.current;
  pushField(fieldChanges, {
    field: args.field,
    previous,
    next,
    at: args.at,
    quote: args.quote,
  });
}

/**
 * LOT M5 — POUSSER UN CHANGEMENT DE CHAMP, et non plus un item retenu.
 *
 * ⛔ `previous` VIENT DU CONTEXTE, c'est-à-dire de la valeur RELUE en base par
 * l'appelant juste avant. Le recalculer ici, ou le déduire de `next`, ferait la
 * cicatrice nommée du dépôt: *« `current` périmé efface l'écriture d'avant »*.
 *
 * ⚠️ ET IL EST ÉCRIT MÊME QUAND IL VAUT `null`. « Le champ n'était pas
 * renseigné » et « je ne sais pas ce qu'il valait » sont deux états différents,
 * et seul le premier permet de défaire (en RETIRANT la clé).
 */
function pushField(
  out: FieldChange[],
  draft: {
    field: WritableField;
    previous: unknown;
    next: unknown;
    at: string;
    quote: string;
  },
): void {
  out.push({
    field: draft.field,
    previous: draft.previous ?? null,
    next: draft.next,
    at: draft.at,
    source: QUESTIONNAIRE_PRODUCER,
    quote: draft.quote,
  });
}

function push(
  out: RetainedItem[],
  counts: Record<string, number>,
  draft: {
    kind: RetainedKind;
    subject: RetainedSubject;
    text: string;
    value: unknown;
    at: string;
    /** LOT M2 — ce que la personne a lu et cliqué. Voir `quoteOf`. */
    quote: string;
  },
): void {
  const scope = defaultScopeFor(QUESTIONNAIRE_PRODUCER, draft.kind);
  if (scope === null) {
    counts.malformed += 1;
    return;
  }
  const item = parseRetainedItem({
    kind: draft.kind,
    scope,
    subject: draft.subject,
    text: draft.text,
    value: draft.value,
    source: QUESTIONNAIRE_PRODUCER,
    at: draft.at,
    item: "",
    confidence: null,
    // ── LOT M2 · SANS ELLE, « DÉFAIRE » EST UN PARI ─────────────────────
    // ⚠️ OBLIGATOIRE À LA PORTE D'ÉCRITURE (`unquoted`), donc obligatoire ici:
    // un item non cité serait construit, compté « produit », puis refusé plus
    // loin — et le refus accuserait le port au lieu du producteur.
    quote: draft.quote,
  });
  if (!item) {
    counts.malformed += 1;
    return;
  }
  out.push(item);
}

function withTotal(
  counts: Record<keyof Omit<PlanFeedbackRetainedRefusals, "total">, number>,
): PlanFeedbackRetainedRefusals {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { total, ...counts };
}
