/**
 * LA MÉMOIRE STRUCTURÉE — le socle : ce que Sophia retient, et sous quelle
 * forme. **Rien d'autre.**
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md`. Ce fichier en est la
 * transcription exécutable, §2 (les trois axes), §3 (la forme écrite),
 * §4 (le champ `value`) et §5 (la matrice des droits). Il ne tranche rien que
 * la nomenclature n'ait tranché; là où il va plus loin, c'est écrit en toutes
 * lettres au-dessus de la règle concernée.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME ─────────────────────────────────────────
 * Le durable est aujourd'hui une LISTE PLATE DE PHRASES
 * (`practical_constraints.food_preferences`). Trois conséquences mesurées:
 * le générateur ne peut rien filtrer, l'écran ne peut rien ranger, et la
 * réconciliation est grossière — c'est elle qui a produit, en run réel,
 * `["Aime le brocoli s'il est rôti.", "N'aime pas le brocoli."]` dans le même
 * prompt.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER, HÉRITÉE DE `plan_feedback.ts` ────
 * *Une catégorie dont aucun générateur ne sait quoi faire ne se crée pas.*
 * Les huit `kind` ci-dessous ont chacun un lecteur nommé dans la nomenclature.
 * Un neuvième qui n'en aurait pas refabriquerait le point du dimanche: on
 * collecte pour personne, et la donnée finit par être pilotée.
 *
 * ⛔ ── IL N'EXISTE AUCUN `kind` DE SÉCURITÉ, ET C'EST STRUCTUREL ────────────
 * Une allergie, une intolérance, un régime, une condition médicale ne peuvent
 * JAMAIS naître d'un retour ou d'une conversation classée. Elles ont leur
 * table — `student_safety_constraints` — chargée SYNCHRONEMENT à chaque tour,
 * sans ranking, sans statut `candidate`, avec consentement (voir l'en-tête de
 * `safety_constraints.ts`: « une allergie rappelée 80 % du temps est une
 * allergie qui tue au 5e tour »). Ce module-ci est probabiliste par
 * construction: il reçoit des propositions d'un modèle, il les range, la
 * personne confirme. Y verser une allergie serait déplacer une garantie
 * médicale dans un magasin qui n'en offre aucune.
 *
 * Quelqu'un qui coche « plus jamais » sur un plat aux arachides n'a pas déclaré
 * une allergie. `retained_item_test.ts` PROUVE cette absence en épinglant la
 * liste exacte des huit et en refusant tout jeton qui ressemble à de la
 * sécurité — ajouter `allergy` ici fait rougir le test, exprès.
 *
 * ── CE QUE CE MODULE N'A PAS LE DROIT DE FAIRE ─────────────────────────────
 * PURE MODULE: no I/O, no clock, no randomness. Aucune fonction ne lit
 * « aujourd'hui »: le jour arrive TOUJOURS en paramètre, et l'expiration d'un
 * `next_plan` se calcule chez son lecteur (lot 1B), jamais ici et jamais comme
 * un second état stocké — *« un second état à invalider est un état dont
 * l'écrivain finit par disparaître »* (`accident.ts`).
 *
 * ── SES DEUX SEULS IMPORTS, ET POURQUOI PAS UN TROISIÈME ───────────────────
 * `tokens.ts` n'importe RIEN (vérifié): le lire ne peut pas fermer de cycle.
 * `household.ts` n'entre qu'en `import type`, effacé à l'exécution.
 * `EATING_OCCASIONS` vit dans `meal_generation.ts`, qui importe
 * `household_portions.ts` — un socle que les six lots suivants importeront ne
 * doit pas traîner ce graphe derrière lui. Le vocabulaire est donc RECOPIÉ
 * ci-dessous, et la recopie est PROUVÉE ÉGALE par le test (un test n'est dans
 * aucun cycle). C'est exactement le patron déjà écrit dans
 * `household_habits.ts`, dont le premier jet a fait tomber six fichiers de test
 * d'un coup sur `Cannot access 'EATING_OCCASIONS' before initialization`.
 */

import { DAY_TOKENS } from "./tokens.ts";
import type { MemberAgeState } from "./household.ts";

// ===========================================================================
// AXE 1 · `kind` — de quoi on parle
// ===========================================================================

/**
 * Les huit familles. Liste FERMÉE, écrite à la main, JAMAIS inférée — même
 * doctrine que `DIETARY_REGIMES` et `SAFETY_CONSTRAINT_KINDS`.
 *
 * En face de chacune, son lecteur (§2 axe 1 de la nomenclature). Une famille
 * dont on ne saurait pas écrire le lecteur ne s'ajoute pas ici:
 *
 *   `food.exclude`    un aliment ou un plat dont on ne veut plus
 *                     → la consigne de composition
 *   `food.prefer`     un aliment ou un plat qu'on veut revoir
 *                     → la consigne de composition
 *   `method.avoid`    une préparation qui ne passe pas (frit, cru, épicé)
 *                     → la consigne de composition
 *   `method.prefer`   une préparation qui plaît
 *                     → la consigne de composition
 *   `portion.adjust`  UNE MESURE, pas un goût: trop / pas assez, ET POUR QUI
 *                     → l'enveloppe (`envelopeFor`)
 *   `rhythm.set`      un moment qui existe ou n'existe pas, pour quelqu'un
 *                     → le rythme alimentaire (les six moments)
 *   `logistics.set`   jours de cuisine, temps, difficulté, variété, budget
 *                     → `practical_constraints`
 *   `craving`         une envie ponctuelle — « des fajitas la semaine prochaine »
 *                     → le bloc d'envies
 */
export const RETAINED_KINDS = [
  "food.exclude",
  "food.prefer",
  "method.avoid",
  "method.prefer",
  "portion.adjust",
  "rhythm.set",
  "logistics.set",
  "craving",
] as const;
export type RetainedKind = (typeof RETAINED_KINDS)[number];

// ===========================================================================
// AXE 2 · `scope` — combien de temps ça vit
// ===========================================================================

/**
 * Deux durées, pas trois.
 *
 *   `durable`    jusqu'à ce que la personne l'enlève, ou que la mémoire la
 *                démente. Vit dans `practical_constraints`, se voit dans
 *                « Ce que Sophia sait de toi », section par `kind`.
 *   `next_plan`  une génération, puis expire. Vit sur le canal d'envies, se
 *                voit sous « Pour la semaine prochaine », AVEC sa date.
 *
 * C'est la frontière que le dépôt a DÉJÀ tranchée une fois dans le prompt —
 * `situation` (stable) séparé de `context` (daté) — avec ce motif écrit:
 * *« une contrainte d'une semaine s'y lisait comme une propriété
 * permanente »*. On réutilise la frontière, on n'en invente pas une seconde.
 */
export const RETAINED_SCOPES = ["durable", "next_plan"] as const;
export type RetainedScope = (typeof RETAINED_SCOPES)[number];

// ===========================================================================
// AXE 3 · `subject` — de qui on parle
// ===========================================================================

/**
 * `household` (tout le monde à table, LE DÉFAUT) ou une bouche précise.
 *
 * ⛔ JAMAIS UN PRÉNOM, JAMAIS UN TEXTE. `member_id`, comme partout ailleurs.
 * La cicatrice du dépôt est écrite et chiffrée — « laitue » ≠ « lait »,
 * 12 faux positifs sur 12 mesurés — et « Poulet pour Zoé et Marc » ne se
 * résout pas par un prénom dans un titre.
 *
 * Le type porte la FORME (`member:` suivi de quelque chose); le parseur porte
 * la VALIDITÉ (un uuid). Les deux sont nécessaires: le type empêche d'écrire
 * `"marc"` à la compilation, le parseur empêche `"member:marc"` à la lecture.
 */
export const HOUSEHOLD_SUBJECT = "household" as const;
export type RetainedSubject = typeof HOUSEHOLD_SUBJECT | `member:${string}`;

const MEMBER_SUBJECT_PREFIX = "member:";

/**
 * Copié de `daily_recommendation.ts` / `weight_divergence_buttons.ts` — la
 * même forme, pour la même raison: une charge forgée ou tronquée qui passerait
 * la forme désignerait la bouche de quelqu'un d'autre.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ===========================================================================
// §3 · `source` — QUI a produit la ligne
// ===========================================================================

/**
 * Les quatre origines possibles d'une ligne retenue.
 *
 *   `written`       la personne l'a tapée elle-même depuis la carte
 *   `questionnaire` le bilan de fin de plan (`meal_plan_feedback`)
 *   `conversation`  ⛔ RETIRÉ (lot M1) — plus aucun écrivain. Voir
 *                   `RETIRED_RETAINED_SOURCES` : la valeur reste dans cette
 *                   liste parce que des lignes la portent EN BASE.
 *   `draft_note`    le retour libre sur le brouillon de plan
 *
 * ⛔ ── POURQUOI `conversation` RESTE DANS LA LISTE ALORS QU'IL N'ÉCRIT PLUS ─
 * Parce que la liste est celle des `source` LISIBLES, pas celle des
 * producteurs. Le retirer d'ici ferait rendre `null` à `parseRetainedSource`
 * sur des lignes qui existent en base, donc `parseRetainedItem` les refuserait,
 * donc elles disparaîtraient de la carte et du prompt **sans un mot** — la
 * personne verrait s'évaporer une ligne qu'elle voyait la veille et qu'elle
 * pouvait retirer elle-même. Une suppression silencieuse n'est pas un retrait
 * de producteur, c'est une perte de données.
 *
 * ⚠️ `source` NE SE DÉDUIT JAMAIS D'UN VIDE. Le dépôt le dit déjà sur
 * `FoodPreferenceOrigin`: l'absence d'origine est ambiguë — elle dit « tapée à
 * la main » AUTANT que « lien au souvenir perdu ». S'en servir comme signature
 * rendrait les deux indiscernables pour toujours, et on ne saurait plus dire
 * « ça, c'est toi qui l'as écrit » plutôt que « ça, je l'ai déduit de ce que tu
 * m'as dit mardi ». Un item sans `source` lisible est donc REFUSÉ, pas replié.
 *
 * ⚠️ DEUX DE CES QUATRE SONT ENCORE DES PROMPTS (`questionnaire`, `draft_note`);
 * `written` EST LA PERSONNE; `conversation` NE PRODUIT PLUS RIEN. Voir
 * `canProduce` pour ce que ça change.
 */
export const RETAINED_SOURCES = [
  "written",
  "questionnaire",
  "conversation",
  "draft_note",
] as const;
export type RetainedSource = (typeof RETAINED_SOURCES)[number];

// ===========================================================================
// §4 · Le champ `value`, par famille
// ===========================================================================

/** `down` = on en veut moins, `up` = on en veut plus. Rien entre les deux. */
export const PORTION_DIRECTIONS = ["down", "up"] as const;
export type PortionDirection = (typeof PORTION_DIRECTIONS)[number];

/**
 * L'ampleur, en DEUX crans et en ADVERBES.
 *
 * `slight` = « un peu trop », `clear` = « vraiment trop ». Deux et pas cinq:
 * la question fermée du questionnaire ne rend pas cinq nuances, et une échelle
 * plus fine que la question qui l'alimente est une précision fabriquée.
 */
export const PORTION_MAGNITUDES = ["slight", "clear"] as const;
export type PortionMagnitude = (typeof PORTION_MAGNITUDES)[number];

/**
 * ⛔ AUCUN GRAMME, AUCUNE CALORIE. JAMAIS. C'est un interdit de conception, pas
 * une commodité de schéma.
 *
 * Une personne dit « trop gros », pas « −80 g ». Traduire son adverbe en nombre
 * à la classification serait fabriquer une précision qu'elle n'a pas donnée —
 * et le produit refuse d'afficher des nombres à qui n'en a pas demandé. C'est
 * l'ENVELOPPE qui traduit, en aval, là où le plancher TCA s'applique.
 *
 * ── COMMENT L'INTERDIT EST TENU, DES DEUX CÔTÉS ────────────────────────────
 * 1. À LA COMPILATION. Les champs `?: never` ci-dessous nomment les
 *    échappatoires vraisemblables: `{ direction, magnitude, grams: 80 }` ne
 *    compile pas. Et le contrôle des propriétés en trop de TypeScript refuse
 *    DÉJÀ tout littéral qui porte une clé inconnue — les `never` couvrent le
 *    chemin où l'objet passe par une variable typée large.
 * 2. À LA LECTURE. `parseRetainedItem` refuse un `value` qui porte la moindre
 *    clé au-delà de `direction` et `magnitude`. Un nombre écrit en base par un
 *    producteur d'une autre version ne remonte pas: l'item entier est refusé,
 *    il n'est pas « nettoyé ». Nettoyer serait garder la ligne en effaçant la
 *    preuve qu'un producteur est en train de fabriquer des grammes.
 */
export type PortionAdjustValue = {
  readonly direction: PortionDirection;
  readonly magnitude: PortionMagnitude;
  /** ⛔ Interdits nommés — voir le bloc ci-dessus. Ne pas retirer. */
  readonly grams?: never;
  readonly kcal?: never;
  readonly calories?: never;
  readonly delta?: never;
  readonly amount?: never;
  readonly quantity?: never;
  readonly percent?: never;
};

/**
 * LES SIX MOMENTS, RECOPIÉS de `EATING_OCCASIONS` (`meal_generation.ts`).
 *
 * La recopie n'est pas de la paresse, c'est le patron de `household_habits.ts`:
 * lire la source d'origine referme un cycle d'imports, un cycle ne se voit ni
 * au typecheck ni à la lecture, et le prix est déjà mesuré (six fichiers de
 * test tombés d'un coup). `retained_item_test.ts` importe LES DEUX listes et
 * échoue à la première divergence — une copie non vérifiée serait ce que ce
 * dépôt appelle « une table qui raconte ce que les chaînes disaient le jour où
 * on l'a écrite ».
 */
export const RHYTHM_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type RhythmOccasion = (typeof RHYTHM_OCCASIONS)[number];

/** « ce moment existe » / « ce moment n'existe pas », pour quelqu'un. */
export type RhythmSetValue = {
  readonly occasion: RhythmOccasion;
  readonly present: boolean;
};

/**
 * Les cinq champs de `practical_constraints` qu'un retour peut bouger.
 *
 * ⚠️ LA CLÉ EST `cook_days`, PAS `cooking_days` — mesuré, et déjà écrit dans
 * `frontend/src/keel/api/onboarding.ts`.
 */
export const LOGISTICS_FIELDS = [
  "cook_days",
  "cooking_time_min",
  "recipe_difficulty",
  "variety",
  "budget_amount",
] as const;
export type LogisticsField = (typeof LOGISTICS_FIELDS)[number];

/** Le vocabulaire de `recipe_difficulty`, tel que les deux générateurs le lisent. */
export const RECIPE_DIFFICULTIES = ["simple", "normal", "keen"] as const;
export type RecipeDifficulty = (typeof RECIPE_DIFFICULTIES)[number];

/** Le vocabulaire de `variety`, tel que les deux générateurs le lisent. */
export const VARIETY_LEVELS = ["repeat", "some", "varied"] as const;
export type VarietyLevel = (typeof VARIETY_LEVELS)[number];

/**
 * Une union discriminée sur `field`, et pas un `value: unknown`.
 *
 * `practical_constraints` est un jsonb: rien en base ne dit qu'un
 * `cooking_time_min` est un nombre. Si ce module rendait `unknown`, chacun des
 * trois producteurs et chacun des trois lecteurs referait sa propre coercition,
 * et la première qui divergerait écrirait une chaîne dans un champ que le
 * générateur multiplie (`cookDays.length × cooking_time_min`).
 *
 * ⚠️ `cook_days` PORTE DES JETONS DE `DAY_TOKENS`, pas des prénoms de jours.
 * `budget_amount` n'a pas de devise ici: elle vit ailleurs dans
 * `practical_constraints` et ce module ne la déplace pas.
 */
export type LogisticsSetValue =
  | { readonly field: "cook_days"; readonly value: readonly string[] }
  | { readonly field: "cooking_time_min"; readonly value: number }
  | { readonly field: "recipe_difficulty"; readonly value: RecipeDifficulty }
  | { readonly field: "variety"; readonly value: VarietyLevel }
  | { readonly field: "budget_amount"; readonly value: number };

// ===========================================================================
// §3 · La forme écrite — `RetainedItem`
// ===========================================================================

/**
 * Ce que TOUTES les familles portent, quelle que soit la famille.
 *
 * Exporté pour être LISIBLE, pas pour être construit à part: la seule porte
 * d'entrée d'un `RetainedItem` reste `parseRetainedItem`. Un producteur assemble
 * un objet nu et le fait passer par le parseur — jamais un `as RetainedItem`
 * (cicatrice « `as` sur un type étranger désarme le typecheck »).
 */
export type RetainedItemBase = {
  /**
   * CE QUE LA PERSONNE VOIT ET PEUT ÉDITER. Obligatoire, et il est la vérité
   * affichée: une entrée dont on ne saurait pas écrire la phrase que la
   * personne lira ne s'écrit pas. C'est ce qui rend la promesse « rien
   * d'opaque » vérifiable ligne à ligne, et pas seulement affirmée.
   */
  readonly text: string;
  /** `household` ou `member:<uuid>`. Voir l'axe 3. */
  readonly subject: RetainedSubject;
  /** Qui a produit la ligne. Ne se déduit jamais d'un vide. */
  readonly source: RetainedSource;
  /**
   * Le jour où ça a été dit, `YYYY-MM-DD`. **Requis, et jamais `null`.**
   *
   * `FoodPreferenceOrigin.at` accepte `null` parce qu'une forme ANCIENNE de la
   * clé ne portait que l'id nu. Ici il n'y a pas de forme ancienne: tout
   * `RetainedItem` est une écriture neuve, et son producteur connaît le jour.
   * Les phrases plates déjà en base ne deviennent PAS des `RetainedItem` — §7
   * de la nomenclature: elles restent lisibles telles quelles, et on ne devine
   * pas rétroactivement.
   */
  readonly at: string;
  /**
   * L'id du `memory_items` d'origine, ou `""`.
   *
   * ⚠️ `item` VIDE PROTÈGE L'ENTRÉE, et c'est déjà la règle en place: une ligne
   * sans `item` est réputée écrite par la personne, et `reconcileFoodPreferences`
   * ne peut pas la retirer. Elle lui appartient.
   */
  readonly item: string;
  /**
   * La confiance du memorizer, **et seulement la sienne** (§3).
   *
   * `null` partout ailleurs: une confiance accrochée à un fait DÉCLARÉ est une
   * erreur de catégorie. Une réponse cochée au questionnaire n'est pas vraie à
   * 82 % — elle est vraie, ou la personne s'est trompée de case.
   *
   * ⚠️ LE SEUIL DE PROMOTION N'EST PAS ICI. Il vaut 0,70, il vit dans
   * `food_preference_promotion.ts` (`MIN_CONFIDENCE`), et il y reste: un second
   * seuil dans un second fichier est un seuil qui divergera. Ce module vérifie
   * seulement qu'une ligne de conversation PORTE une confiance lisible.
   */
  readonly confidence: number | null;
  /**
   * ⛔ LA PHRASE DE LA PERSONNE QUI A CAUSÉ CETTE LIGNE — lot M2.
   *
   * ── SANS ELLE, « DÉFAIRE » EST UN PARI ────────────────────────────────
   * C'est la raison d'être du champ, et le design l'écrit en toutes lettres.
   * Une ligne qui dit *« Poulet — aliments évités »* sans dire d'où elle vient
   * pose à la personne une question à laquelle elle ne peut pas répondre:
   * enlever, c'est peut-être défaire une erreur, ou peut-être perdre une chose
   * qu'elle a vraiment demandée trois semaines plus tôt. Devant ce doute, on
   * ne touche à rien — et le magasin ne décroît jamais.
   *
   * Avec la citation, la ligne devient *« parce que tu as écrit “trop de poulet
   * cette semaine”, le 12 mars »*, et le geste est évident dans les deux sens.
   * **C'est aussi ce qui donne la traçabilité gratuitement**: « pourquoi il n'y
   * a pas de poulet ? » se répond en montrant un écran.
   *
   * ── CE QU'ON Y MET, ET CE QU'ON N'Y MET PAS ──────────────────────────────
   * Les MOTS DE LA PERSONNE, verbatim. Jamais une reformulation, jamais un
   * résumé: une citation reformulée est une citation fausse, et elle serait
   * pire que pas de citation — elle donnerait à la personne l'impression
   * d'avoir dit une chose qu'elle n'a pas dite.
   *
   *   · retour sur brouillon → la note, telle qu'elle l'a tapée;
   *   · bilan de fin de plan → le LIBELLÉ de la réponse qu'elle a cliquée, dans
   *     sa langue. Le questionnaire répond par des jetons (`too_much`,
   *     `partly`), pas par du texte: citer le jeton ne citerait personne, et
   *     citer la question sans la réponse ne dirait pas ce qu'elle a choisi.
   *
   * ── ⚠️ `null` EST LÉGITIME, ET IL A DEUX CAUSES DIFFÉRENTES ─────────────
   *   1. `source: "written"` — la personne a tapé la ligne elle-même. Le `text`
   *      EST sa phrase; une citation séparée la répéterait mot pour mot.
   *   2. Une ligne écrite AVANT le lot M2. Elle reste lisible, et la carte dit
   *      honnêtement qu'elle ne sait pas d'où elle vient plutôt que d'inventer.
   *
   * ⛔ ET C'EST POURQUOI L'OBLIGATION N'EST PAS ICI, MAIS À LA PORTE
   * D'ÉCRITURE. `parseRetainedItem` accepte `null` — sans quoi le lot M2
   * effacerait toutes les lignes d'avant lui, exactement comme un retrait de
   * producteur mal fait efface son passé. C'est `persistRetainedItemsFor` qui
   * REFUSE une écriture serveur non citée (`unquoted`): rien de neuf n'entre
   * sans sa cause, rien d'ancien ne disparaît.
   */
  readonly quote: string | null;
};

/**
 * Le plafond de la citation.
 *
 * ⚠️ UNE CITATION SE TRONQUE, ELLE NE SE RÉSUME PAS. Une note de brouillon peut
 * faire plusieurs lignes; la couper à la fin garde des mots exacts, alors que
 * la résumer fabriquerait une phrase que la personne n'a jamais écrite. Le
 * plafond est celui de la note elle-même (`DRAFT_NOTE_MAX_CHARS`, 280), pour
 * que la plus longue source légitime entre entière et qu'aucune troncature
 * n'ait lieu dans le cas nominal.
 */
export const RETAINED_QUOTE_MAX_CHARS = 280;

/**
 * Un élément retenu, tel que la nomenclature §3 le décrit — **union
 * discriminée sur `kind`**.
 *
 * ── POURQUOI UNE UNION, ET PAS UN OBJET PLAT AVEC `value: unknown` ─────────
 * Trois raisons, dans cet ordre:
 *
 *   1. LE LOT 1C EN A BESOIN. « Les générateurs reçoivent les items groupés par
 *      `kind`, et chaque famille va où son lecteur l'attend. » Sur une union,
 *      `items.filter((i) => i.kind === "portion.adjust")` rend directement des
 *      items dont `value` EST un `PortionAdjustValue`. Sur un objet plat, il
 *      faudrait un `as` — et ce dépôt porte une cicatrice nommée: « `as` sur un
 *      type étranger désarme le typecheck », mesurée en `200` au log et `null`
 *      en silence.
 *   2. LES DEUX INVARIANTS DE `scope` DEVIENNENT DES ERREURS DE COMPILATION.
 *      `craving` porte `scope: "next_plan"` LITTÉRAL, `portion.adjust` porte
 *      `scope: "durable"` littéral. Un producteur qui écrirait l'autre ne
 *      compile pas — la garde mord avant le test, chez les six agents qui
 *      écriront contre ce fichier.
 *   3. `value: null` DEVIENT VÉRIFIABLE au lieu d'être une convention. Cinq des
 *      huit familles n'ont pas de `value`; sur un objet plat, leur `value` est
 *      un champ que rien n'empêche de remplir.
 *
 * Le coût assumé: construire un item demande de savoir quelle famille on écrit.
 * C'est exactement ce qu'on veut d'un producteur.
 */
export type RetainedItem =
  | (RetainedItemBase & {
    readonly kind: "food.exclude" | "food.prefer" | "method.avoid" | "method.prefer";
    readonly scope: RetainedScope;
    readonly value: null;
  })
  | (RetainedItemBase & {
    /** ⚠️ TOUJOURS `next_plan`. Une envie qui devient durable cesse d'être une
     * envie et devient une habitude qu'on n'a pas demandée. */
    readonly kind: "craving";
    readonly scope: "next_plan";
    readonly value: null;
  })
  | (RetainedItemBase & {
    /** ⚠️ TOUJOURS `durable`. Un corps ne change pas d'une semaine sur l'autre;
     * un ajustement qui expire ferait re-servir la mauvaise part au plan
     * suivant, et la personne devrait le redire chaque semaine. */
    readonly kind: "portion.adjust";
    readonly scope: "durable";
    readonly value: PortionAdjustValue;
  })
  | (RetainedItemBase & {
    readonly kind: "rhythm.set";
    readonly scope: RetainedScope;
    readonly value: RhythmSetValue;
  })
  | (RetainedItemBase & {
    readonly kind: "logistics.set";
    readonly scope: RetainedScope;
    readonly value: LogisticsSetValue;
  });

/** Le seul `kind` dont le sujet se calcule. Alias pour que la signature de
 * `subjectsForPortionAdjust` refuse les sept autres À LA COMPILATION. */
export type PortionAdjustItem = Extract<
  RetainedItem,
  { kind: "portion.adjust" }
>;

// ===========================================================================
// §5 · La matrice des droits — EN CODE
// ===========================================================================

/**
 * Ce producteur a-t-il le droit d'écrire cette famille ?
 *
 * ⚠️ C'EST UNE FONCTION, PAS UNE CONSIGNE DE PROMPT. Une règle qui ne vit que
 * dans un prompt régresse en réel: le modèle l'oublie, personne ne le voit, et
 * on découvre six semaines plus tard que le memorizer écrit des portions. Les
 * trois prompts RECOPIENT cette matrice; c'est cette fonction qui la TIENT.
 *
 * ── LA MATRICE (§5), LIGNE À LIGNE ─────────────────────────────────────────
 *                        food.* / method.*  portion.adjust  rhythm  logistics  craving
 *   ① `draft_note`              ✅                 ⛔          ⛔       ⛔        ✅
 *   ② `questionnaire`           ✅                 ✅ SEUL      ⛔       ⛔        ⛔
 *   ③ `conversation`            ⛔                 ⛔          ⛔       ⛔        ⛔
 *   ④ `written`                 ✅                 ✅          ✅       ✅        ✅
 *
 * ⛔ ── `rhythm.set` ET `logistics.set` SORTENT DES PROMPTS — LOT M5 ────────
 * Ils ne sont plus RETENUS: ils changent **le champ que la personne voit**
 * (`field_change.ts`). `written` les garde, parce que `written` EST la
 * personne et que sa carte doit pouvoir tout écrire.
 *
 * ── LE DÉFAUT QUE ÇA FERME, ET IL ÉTAIT MUET ─────────────────────────────
 * Un `logistics.set` retenu n'écrivait rien: les deux générateurs le posaient
 * EN MÉMOIRE au moment de composer (`logisticsOverlayFor`). La personne lisait
 * **45 min** dans ses réglages et son plan était fait sur **35** — une décision
 * du produit qu'aucun écran ne montrait, et que rien ne pouvait défaire.
 *
 * ⚠️ ET LES LIGNES DÉJÀ EN BASE RESTENT LUES (`canHold` ne bouge pas pour les
 * producteurs vivants: c'est `canProduce` qui se ferme). Elles gardent donc
 * leur effet jusqu'à ce que la personne les édite ou les retire — le lot ferme
 * l'avenir, il n'efface pas le passé, et le magasin se vide de lui-même.
 *
 * ⛔ ── LA LIGNE ③ EST VIDE, ET C'EST LE LOT M1 ─────────────────────────────
 * *« Le chat parle. Les préférences retiennent. »* La conversation ne classe
 * plus rien: elle RENVOIE vers le champ où la chose se pose
 * (`conversation_redirect.ts`). Le motif tient en une phrase du design: une
 * phrase de chat n'a pas de **dénominateur** — « c'était trop » ne dit ni de
 * quoi, ni pour qui, et le magasin qu'elle alimentait ne pouvait que grandir.
 *
 * ⚠️ ET C'EST UNE LIGNE VIDE, PAS UNE SOURCE SUPPRIMÉE. Des lignes portent
 * `source: "conversation"` en base; elles restent LUES, visibles sur la carte
 * avec leur origine, et retirables par la personne. Le droit d'écrire et le
 * droit d'être lu ne sont plus la même fonction: `canProduce` (ici) tient
 * l'écriture, `canHold` (plus bas) tient la lecture. Les confondre ferait
 * disparaître ces lignes sans un mot au premier chargement.
 *
 * ── POURQUOI CES TROIS INTERDITS ───────────────────────────────────────────
 * ① LE BROUILLON NE PRODUIT PAS DE `portion.adjust` NI DE `rhythm.set`. Un
 *   retour sur un brouillon parle de CE plan (« pas de poisson cette
 *   semaine »). Or ces deux familles-là sont `durable` ou structurelles par
 *   nature: les laisser naître d'un brouillon transformerait une humeur de
 *   mardi en règle de vie.
 * ② LE QUESTIONNAIRE EST LE SEUL PRODUCTEUR DE `portion.adjust`, et c'est le
 *   point central du chantier. Une mesure a besoin d'un sujet, et LA
 *   CONVERSATION NE SAIT PAS L'ATTRIBUER: « les portions étaient trop
 *   grosses », dans un foyer de quatre, ne désigne personne. Le questionnaire
 *   pose la question avec la liste du foyer sous les yeux — c'est une question
 *   fermée, pas une inférence. Il ne produit pas de `craving`: on ne demande
 *   pas une envie de la semaine prochaine dans un bilan de la semaine passée.
 * ③ LE MEMORIZER NE CLASSE PLUS RIEN DU TOUT: IL RENVOIE, POUR TOUT. Ce qui
 *   n'était vrai que du sizing — « note-le au bilan de fin de plan, j'ai besoin
 *   de savoir pour qui » — l'est devenu de chaque famille, et pour la même
 *   raison étendue: une phrase de chat ne porte pas le dénominateur qui rend un
 *   classement vérifiable. Le produit préfère un geste de plus à un magasin que
 *   personne ne voit grandir.
 *
 * ── ET `written`, QUI N'EST PAS DANS LE TABLEAU DU §5 ───────────────────────
 * Le §5 nomme les TROIS PROMPTS — les trois producteurs automatiques. `written`
 * n'en est pas un: c'est LA PERSONNE qui tape dans sa propre carte. Elle a le
 * droit d'écrire ce qu'elle veut, SAUF ce qui n'existe pas comme `kind` (la
 * liste fermée, qui la protège des familles sans lecteur — et de toute famille
 * de sécurité, qui a sa table à elle).
 *
 * Ce n'est pas une exception de complaisance, c'est la contrepartie exacte des
 * trois interdits: la nomenclature dit « la personne peut toujours le rendre
 * durable depuis la carte, EXPLICITEMENT ». Si `written` était bridé comme un
 * prompt, cette phrase serait fausse et la carte deviendrait un écran en
 * lecture seule.
 */
export function canProduce(
  source: RetainedSource,
  kind: RetainedKind,
): boolean {
  switch (source) {
    case "written":
      // Tout, sauf ce qui n'est pas un `kind` — et ça, l'appelant l'a déjà
      // filtré en passant par `parseRetainedKind`.
      return true;
    case "questionnaire":
      // ⛔ LOT M5 — `rhythm.set` et `logistics.set` vont dans le CHAMP.
      return kind !== "craving" && kind !== "rhythm.set" &&
        kind !== "logistics.set";
    case "conversation":
      // ⛔ LOT M1 — LA LIGNE ③ EST VIDE. Le chat n'écrit plus: il renvoie.
      // ⚠️ NE PAS « RÉPARER » CE `false` EN RÉOUVRANT UNE FAMILLE. C'est
      // précisément le mode de reconstruction que le design nomme: « un bouton
      // à la fois », chacun opt-in, et six mois plus tard le chat écrit tout à
      // nouveau sans que personne ne voie qu'on a rebâti ce qu'on venait de
      // supprimer. Une règle avec une exception n'est pas une règle.
      return false;
    case "draft_note":
      // ⛔ LOT M5 — `logistics.set` rejoint `rhythm.set` du côté des champs.
      return kind !== "portion.adjust" && kind !== "rhythm.set" &&
        kind !== "logistics.set";
  }
}

// ===========================================================================
// LE DROIT D'ÊTRE LU — et pourquoi ce n'est PAS le droit d'écrire
// ===========================================================================

/**
 * Les producteurs RETIRÉS: plus aucun droit d'écriture, tous leurs droits de
 * lecture.
 *
 * ⚠️ CETTE LISTE N'EST PAS UNE COMMODITÉ DE TRANSITION. Elle existe tant que
 * des lignes portent la `source` en base — c'est-à-dire potentiellement pour
 * toujours, puisque rien ne les périme et que seule la personne les retire.
 * La vider « pour nettoyer » ferait tomber ces lignes au parseur.
 */
export const RETIRED_RETAINED_SOURCES = ["conversation"] as const;
export type RetiredRetainedSource = (typeof RETIRED_RETAINED_SOURCES)[number];

export function isRetiredRetainedSource(
  source: RetainedSource,
): source is RetiredRetainedSource {
  return (RETIRED_RETAINED_SOURCES as readonly string[]).includes(source);
}

/**
 * LA MATRICE **GELÉE** D'UN PRODUCTEUR RETIRÉ — ce qu'il avait le droit
 * d'écrire le jour où on lui a retiré la plume.
 *
 * ⛔ POURQUOI PAS « TOUT ACCEPTER À LA LECTURE ». Parce qu'une ligne
 * `source: "conversation", kind: "portion.adjust"` n'a JAMAIS pu être écrite:
 * elle ne peut donc venir que d'une charge forgée ou d'un jsonb trafiqué. La
 * laisser passer offrirait, par un seul mot, le contournement exact que la
 * matrice existe pour fermer — et sur la seule famille qui déplace des
 * grammes. Le gel garde la porte fermée sans rien perdre de ce qui est réel.
 *
 * ⚠️ CETTE FONCTION NE BOUGE PLUS JAMAIS. Elle décrit un PASSÉ. Si elle se
 * mettait à suivre `canProduce`, elle rendrait `false` partout et effacerait
 * les lignes qu'elle est là pour protéger.
 */
export function couldProduce(
  source: RetiredRetainedSource,
  kind: RetainedKind,
): boolean {
  switch (source) {
    case "conversation":
      // La ligne ③ telle qu'elle était avant le lot M1.
      return kind !== "portion.adjust";
  }
}

/**
 * LES CELLULES RETIRÉES — lot M5.
 *
 * ⛔ UN PRODUCTEUR VIVANT PEUT PERDRE UNE FAMILLE, et c'est différent d'une
 * source retirée. `questionnaire` produit toujours des `food.*`; il ne produit
 * plus de `logistics.set` ni de `rhythm.set`, parce que ceux-là changent
 * désormais **le champ** que la personne voit.
 *
 * ⚠️ ET CE TABLEAU EST LA MOITIÉ QUI EMPÊCHE LE LOT D'EFFACER SON PASSÉ. Sans
 * lui, fermer la cellule ferait tomber au parseur les lignes DÉJÀ écrites sous
 * elle — mesuré: une ligne `questionnaire × logistics.set` en base au moment du
 * lot. Elle disparaîtrait de la carte entre deux chargements, sans un mot, et
 * le symptôme serait un magasin qui rétrécit tout seul.
 *
 * ⛔ IL DÉCRIT UN PASSÉ, IL NE BOUGE PLUS. S'il se mettait à suivre
 * `canProduce`, il deviendrait vide et n'aurait plus d'objet.
 */
const RETIRED_CELLS: readonly (readonly [RetainedSource, RetainedKind])[] = [
  ["questionnaire", "logistics.set"],
  ["questionnaire", "rhythm.set"],
  ["draft_note", "logistics.set"],
] as const;

/**
 * CETTE LIGNE A-T-ELLE LE DROIT D'EXISTER ? — le gate de LECTURE, celui que
 * `parseRetainedItem` applique.
 *
 * ── LA DISTINCTION, ET ELLE EST LA CHARNIÈRE DU LOT M1 ────────────────────
 *   `canProduce` :  « ce producteur peut-il écrire ça MAINTENANT ? »  → écriture
 *   `canHold`    :  « cette ligne a-t-elle pu être écrite un jour ? » → lecture
 *
 * Tant qu'aucun producteur n'était retiré, les deux étaient le MÊME ensemble et
 * une seule fonction suffisait. Retirer `conversation` les sépare: la ligne ③
 * est vide à l'écriture et pleine à la lecture. Un appelant qui se tromperait
 * de fonction ne casserait rien de visible tout de suite — il ouvrirait
 * l'écriture (en lisant `canHold`) ou effacerait des lignes réelles (en lisant
 * `canProduce`), et les deux fautes sont silencieuses. D'où deux noms.
 */
export function canHold(
  source: RetainedSource,
  kind: RetainedKind,
): boolean {
  if (isRetiredRetainedSource(source)) return couldProduce(source, kind);
  if (canProduce(source, kind)) return true;
  // ⛔ LA CELLULE A ÉTÉ FERMÉE APRÈS COUP: les lignes écrites AVANT la fermeture
  // restent lisibles, visibles sur la carte, et retirables par la personne.
  return RETIRED_CELLS.some(([s, k]) => s === source && k === kind);
}

/**
 * À quel `scope` ce producteur écrit cette famille, PAR DÉFAUT.
 *
 * Rend `null` quand le producteur n'a pas le droit — et `null` est un REFUS,
 * pas une invitation à `?? "durable"`. Un appelant qui replie ce `null` sur une
 * valeur réarme précisément l'interdit que `canProduce` vient de poser.
 *
 * ── POURQUOI CETTE FONCTION EST ICI ET PAS CHEZ LES TROIS PRODUCTEURS ──────
 * Les cellules du §5 portent le scope: « ✅ `next_plan` par défaut » pour le
 * brouillon, « ✅ `durable` » pour le questionnaire. Laisser chacun des trois
 * lots choisir garantirait trois défauts différents pour la même cellule, et
 * la divergence ne se verrait qu'en run réel, sur un item classé durable chez
 * l'un et éphémère chez l'autre.
 *
 * Les deux invariants ne sont pas des « défauts » ici: ils sont FORCÉS.
 * `craving` rend toujours `next_plan`, `portion.adjust` toujours `durable`,
 * quel que soit le producteur.
 */
export function defaultScopeFor(
  source: RetainedSource,
  kind: RetainedKind,
): RetainedScope | null {
  if (!canProduce(source, kind)) return null;
  if (kind === "craving") return "next_plan";
  if (kind === "portion.adjust") return "durable";
  switch (source) {
    case "draft_note":
      // Un retour sur un brouillon parle de CE plan. Le promouvoir en
      // permanent transformerait une humeur de mardi en règle de vie.
      return "next_plan";
    case "questionnaire":
      // Le bilan de fin de plan regarde la semaine ÉCOULÉE pour orienter les
      // suivantes: ce qu'il produit est du durable.
      return "durable";
    case "conversation":
      // ⚠️ AVEU: BRANCHE MORTE DEPUIS LE LOT M1, ET ELLE RESTE.
      // `canProduce("conversation", …)` est faux pour les huit familles, donc
      // la garde du haut a déjà rendu `null` avant d'arriver ici. La case reste
      // parce que `RetainedSource` porte encore la valeur (des lignes en base
      // la portent) et que l'exhaustivité du `switch` est ce qui fera rougir la
      // compilation le jour où une source s'ajoute. La retirer échangerait une
      // branche morte nommée contre un `default` muet.
      return "durable";
    case "written":
      // Ce que la personne tape dans sa carte, elle le tape pour que ça reste.
      return "durable";
  }
}

// ===========================================================================
// Les parseurs — défensifs, et jamais silencieux
// ===========================================================================
//
// DOCTRINE COMMUNE AUX CINQ: une entrée illisible rend `null`. Jamais une
// exception (un item difforme au milieu d'une liste ne doit pas emporter les
// autres), et JAMAIS un repli sur une valeur par défaut. Un `subject` qui n'est
// ni `household` ni `member:<uuid>` bien formé est un REFUS — le replier sur
// `household` appliquerait à toute la table une mesure destinée à une bouche.

/** Un `kind` hors liste rend `null`. Il ne se devine pas, il ne se corrige pas. */
export function parseRetainedKind(value: unknown): RetainedKind | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (RETAINED_KINDS as readonly string[]).includes(slug)
    ? slug as RetainedKind
    : null;
}

/** Un `scope` hors liste rend `null`. Absent aussi: voir `defaultScopeFor`. */
export function parseRetainedScope(value: unknown): RetainedScope | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (RETAINED_SCOPES as readonly string[]).includes(slug)
    ? slug as RetainedScope
    : null;
}

/** Une `source` hors liste rend `null` — elle ne se déduit jamais d'un vide. */
export function parseRetainedSource(value: unknown): RetainedSource | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (RETAINED_SOURCES as readonly string[]).includes(slug)
    ? slug as RetainedSource
    : null;
}

/**
 * `household`, ou `member:` suivi d'un uuid. Tout le reste rend `null`.
 *
 * ⚠️ `member:marc`, `member:`, `Marc`, `member:<uuid tronqué>` sont des REFUS,
 * pas des replis sur `household`. Replier ici serait exactement le geste que le
 * §2 axe 3 interdit: appliquer à tout le monde ce qui visait une bouche.
 */
export function parseRetainedSubject(value: unknown): RetainedSubject | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === HOUSEHOLD_SUBJECT) return HOUSEHOLD_SUBJECT;
  if (!raw.toLowerCase().startsWith(MEMBER_SUBJECT_PREFIX)) return null;
  const id = raw.slice(MEMBER_SUBJECT_PREFIX.length).trim().toLowerCase();
  if (!UUID_RE.test(id)) return null;
  return `${MEMBER_SUBJECT_PREFIX}${id}` as RetainedSubject;
}

/** Le sujet d'une bouche précise, ou `null` si l'id n'est pas un uuid. */
export function memberSubject(memberId: unknown): RetainedSubject | null {
  const id = String(memberId ?? "").trim().toLowerCase();
  return UUID_RE.test(id)
    ? `${MEMBER_SUBJECT_PREFIX}${id}` as RetainedSubject
    : null;
}

/** L'id de la bouche visée, ou `null` quand le sujet est `household`. */
export function subjectMemberId(subject: RetainedSubject): string | null {
  if (subject === HOUSEHOLD_SUBJECT) return null;
  const id = subject.slice(MEMBER_SUBJECT_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

/**
 * Un jour, et STRICTEMENT `YYYY-MM-DD`.
 *
 * ⚠️ PAS `Date.parse`, et c'est délibéré. `dayOf` (`food_preference_promotion
 * .ts`) fait `new Date(Date.parse(x)).toISOString().slice(0,10)`: il accepte
 * `2026-8-1`, il accepte un horodatage complet, et il le REPROJETTE EN UTC —
 * un « mardi soir » à Paris ressort mercredi, ou lundi. `at` est le jour où la
 * personne l'a DIT, dans SA journée; un décalage d'un jour se lit ensuite comme
 * « je l'ai retenu de lundi » sur l'écran de transparence, ce qui est faux.
 * Une date qui n'est pas déjà un jour propre est donc refusée, pas normalisée.
 *
 * Pur: aucune horloge, aucun `new Date()` sans argument. Le calendrier est
 * calculé à la main (années bissextiles comprises).
 */
export function parseRetainedDay(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return raw;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// ---------------------------------------------------------------------------
// Les `value`, famille par famille
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * ⛔ LA GARDE DES GRAMMES, CÔTÉ LECTURE.
 *
 * Toute clé au-delà de `direction` et `magnitude` fait tomber l'item ENTIER.
 * Pas de nettoyage: un `value` qui porte `grams` prouve qu'un producteur
 * fabrique de la précision, et effacer la clé en gardant la ligne effacerait
 * la seule trace de ce défaut.
 */
function parsePortionAdjustValue(value: unknown): PortionAdjustValue | null {
  const row = asRecord(value);
  if (!row) return null;
  for (const key of Object.keys(row)) {
    if (key !== "direction" && key !== "magnitude") return null;
  }
  const direction = String(row.direction ?? "").trim().toLowerCase();
  const magnitude = String(row.magnitude ?? "").trim().toLowerCase();
  if (!(PORTION_DIRECTIONS as readonly string[]).includes(direction)) return null;
  if (!(PORTION_MAGNITUDES as readonly string[]).includes(magnitude)) return null;
  return {
    direction: direction as PortionDirection,
    magnitude: magnitude as PortionMagnitude,
  };
}

function parseRhythmSetValue(value: unknown): RhythmSetValue | null {
  const row = asRecord(value);
  if (!row) return null;
  const occasion = String(row.occasion ?? "").trim().toLowerCase();
  if (!(RHYTHM_OCCASIONS as readonly string[]).includes(occasion)) return null;
  // `present` est un booléen STRICT: `"true"`, `1` et `"oui"` sont refusés.
  // Un moment de la journée qu'on fait exister sur une coercition est un repas
  // ajouté à l'assiette de quelqu'un par une chaîne de caractères.
  if (typeof row.present !== "boolean") return null;
  return { occasion: occasion as RhythmOccasion, present: row.present };
}

function parseLogisticsSetValue(value: unknown): LogisticsSetValue | null {
  const row = asRecord(value);
  if (!row) return null;
  const field = String(row.field ?? "").trim().toLowerCase();
  if (!(LOGISTICS_FIELDS as readonly string[]).includes(field)) return null;
  const raw = row.value;
  switch (field as LogisticsField) {
    case "cook_days": {
      if (!Array.isArray(raw)) return null;
      const days: string[] = [];
      for (const entry of raw) {
        const token = String(entry ?? "").trim().toLowerCase();
        // ⛔ Un jeton hors `DAY_TOKENS` fait tomber TOUT le champ. Ce n'est pas
        // `parseAwayDays`, où un jour inconnu tombe seul: ici la valeur EST la
        // liste des jours de cuisine, et en garder une version amputée
        // dimensionnerait le plan sur moins de sessions que la personne n'en a
        // déclarées.
        if (!(DAY_TOKENS as readonly string[]).includes(token)) return null;
        if (!days.includes(token)) days.push(token);
      }
      if (days.length === 0) return null;
      return { field: "cook_days", value: days };
    }
    case "cooking_time_min": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      if (!Number.isInteger(raw) || raw <= 0) return null;
      return { field: "cooking_time_min", value: raw };
    }
    case "budget_amount": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      if (raw <= 0) return null;
      return { field: "budget_amount", value: raw };
    }
    case "recipe_difficulty": {
      const slug = String(raw ?? "").trim().toLowerCase();
      if (!(RECIPE_DIFFICULTIES as readonly string[]).includes(slug)) return null;
      return { field: "recipe_difficulty", value: slug as RecipeDifficulty };
    }
    case "variety": {
      const slug = String(raw ?? "").trim().toLowerCase();
      if (!(VARIETY_LEVELS as readonly string[]).includes(slug)) return null;
      return { field: "variety", value: slug as VarietyLevel };
    }
  }
}

// ---------------------------------------------------------------------------
// L'item entier
// ---------------------------------------------------------------------------

/**
 * Lit un élément retenu. Rend `null` à la première chose illisible.
 *
 * ── CE QU'IL VÉRIFIE, DANS L'ORDRE ─────────────────────────────────────────
 *  1. `kind` dans la liste fermée;
 *  2. `source` dans la liste fermée;
 *  3. **la matrice** — `canHold(source, kind)`. Une ligne que son producteur
 *     n'a JAMAIS eu le droit d'écrire ne remonte pas, même si elle est en base.
 *     C'est ce qui fait que la règle ne régresse pas: elle mord à CHAQUE
 *     lecture, pas seulement le jour où le prompt s'en souvient. ⚠️ « jamais eu
 *     le droit », et pas « n'a plus le droit »: un producteur RETIRÉ garde ses
 *     droits de lecture (`couldProduce`), sans quoi le retrait effacerait son
 *     passé au lieu de fermer son avenir;
 *  4. `subject` bien formé;
 *  5. `text` non vide après `trim` — la ligne qu'on ne saurait pas afficher
 *     n'existe pas;
 *  6. `at`, jour propre;
 *  7. `item` cohérent avec `source`;
 *  8. `confidence` présente si et seulement si `source === "conversation"`;
 *  9. `scope`, et les deux invariants (`craving` ⇒ `next_plan`,
 *     `portion.adjust` ⇒ `durable`) — un `scope` contraire est un refus, PAS
 *     une correction. Corriger masquerait un producteur cassé;
 * 10. `value`, selon la famille.
 */
export function parseRetainedItem(value: unknown): RetainedItem | null {
  const row = asRecord(value);
  if (!row) return null;

  const kind = parseRetainedKind(row.kind);
  if (!kind) return null;

  const source = parseRetainedSource(row.source);
  if (!source) return null;

  // ⚠️ `canHold`, PAS `canProduce` — et l'écart n'est pas cosmétique. Depuis le
  // lot M1, `canProduce("conversation", …)` est faux pour les huit familles;
  // relire la base avec cette fonction ferait tomber, en silence, toutes les
  // lignes que le memorizer avait écrites AVANT son retrait. Le gate de lecture
  // applique la matrice GELÉE du producteur retiré: rien de neuf n'entre, rien
  // de réel ne disparaît.
  if (!canHold(source, kind)) return null;

  const subject = parseRetainedSubject(row.subject);
  if (!subject) return null;

  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!text) return null;

  const at = parseRetainedDay(row.at);
  if (!at) return null;

  const item = parseOriginItem(row.item, source);
  if (item === null) return null;

  const confidence = parseConfidence(row.confidence, source);
  if (confidence === REFUSED) return null;

  // LOT M2 — la citation. `null` est légitime (voir `parseQuote`); une forme
  // illisible est un refus, jamais un repli sur « pas de citation »: replier
  // ferait passer un producteur cassé pour un producteur d'avant M2.
  const quote = parseQuote(row.quote, source);
  if (quote === REFUSED) return null;

  const scope = parseRetainedScope(row.scope);
  if (!scope) return null;

  const base: RetainedItemBase = {
    text,
    subject,
    source,
    at,
    item,
    confidence,
    quote,
  };

  switch (kind) {
    case "food.exclude":
    case "food.prefer":
    case "method.avoid":
    case "method.prefer":
      // `value` doit être absent ou `null`. Un objet ici veut dire qu'un
      // producteur a inventé une structure pour une famille qui n'en a pas.
      if (row.value !== undefined && row.value !== null) return null;
      return { ...base, kind, scope, value: null };

    case "craving":
      if (scope !== "next_plan") return null;
      if (row.value !== undefined && row.value !== null) return null;
      return { ...base, kind, scope: "next_plan", value: null };

    case "portion.adjust": {
      if (scope !== "durable") return null;
      const portion = parsePortionAdjustValue(row.value);
      if (!portion) return null;
      return { ...base, kind, scope: "durable", value: portion };
    }

    case "rhythm.set": {
      const rhythm = parseRhythmSetValue(row.value);
      if (!rhythm) return null;
      return { ...base, kind, scope, value: rhythm };
    }

    case "logistics.set": {
      const logistics = parseLogisticsSetValue(row.value);
      if (!logistics) return null;
      return { ...base, kind, scope, value: logistics };
    }
  }
}

/**
 * Lit une liste. Un item difforme TOMBE SEUL et laisse ses voisins.
 *
 * Patron `parseAwayDays` / `day_properties.ts`: une faute de frappe d'un
 * producteur ne doit pas effacer une déclaration lisible du même jour. Le prix
 * assumé est le silence sur l'item perdu — c'est à l'appelant de compter, et
 * `parseRetainedItems` lui rend de quoi le faire en comparant les longueurs.
 */
export function parseRetainedItems(value: unknown): RetainedItem[] {
  if (!Array.isArray(value)) return [];
  const out: RetainedItem[] = [];
  for (const entry of value) {
    const item = parseRetainedItem(entry);
    if (item) out.push(item);
  }
  return out;
}

/**
 * L'`item` d'origine, contraint par la `source`. Rend `null` pour un REFUS —
 * `""` est une valeur valide, pas un refus, d'où le type de retour explicite.
 *
 *   `written`       ⇒ `""` OBLIGATOIRE. Une ligne tapée à la main n'a pas de
 *                     souvenir d'origine, et c'est ce vide qui la PROTÈGE:
 *                     `reconcileFoodPreferences` garde toute ligne sans id, donc
 *                     le memorizer ne peut pas retirer ce que la personne a tapé.
 *   `conversation`  ⇒ un uuid de `memory_items` OBLIGATOIRE. Sans lui, la ligne
 *                     ne peut être ni tracée (« je l'ai retenu de mardi ») ni
 *                     rétractée quand le souvenir est démenti.
 *   les deux autres ⇒ `""` (le cas normal) ou un uuid, si le producteur a une
 *                     ligne source à citer.
 */
function parseOriginItem(value: unknown, source: RetainedSource): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (source === "written") return raw === "" ? "" : null;
  if (source === "conversation") return UUID_RE.test(raw) ? raw : null;
  if (raw === "") return "";
  return UUID_RE.test(raw) ? raw : null;
}

/**
 * LA CITATION, LUE — lot M2.
 *
 * ⚠️ TROIS RÉSULTATS, ET LE REFUS EN FAIT PARTIE:
 *   · absente / `null`  → `null`. Légitime: `written`, ou une ligne d'avant M2.
 *   · une chaîne utile  → elle, `trim`ée, tronquée au plafond.
 *   · autre chose       → REFUS. Un nombre ou un objet dans ce champ veut dire
 *     qu'un producteur a inventé une structure; l'accepter en le stringifiant
 *     mettrait `"[object Object]"` sous les yeux de la personne — ce fichier a
 *     déjà payé exactement cette chaîne une fois.
 *
 * ⛔ `written` NE PORTE JAMAIS DE CITATION. Son `text` EST ce qu'elle a tapé;
 * une citation à côté serait la même phrase deux fois, et la carte afficherait
 * *« tu l'as écrit, parce que tu as écrit … »*. Une citation sur une ligne
 * `written` est donc un REFUS, pas un doublon toléré: elle signale un
 * producteur serveur qui s'est déguisé, et c'est le contournement que la
 * matrice entière existe pour fermer.
 */
function parseQuote(
  value: unknown,
  source: RetainedSource,
): string | null | typeof REFUSED {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return REFUSED;
  const raw = value.trim();
  if (raw === "") return null;
  if (source === "written") return REFUSED;
  return raw.slice(0, RETAINED_QUOTE_MAX_CHARS);
}

/** Sentinelle de refus: `null` est une valeur légitime de `confidence`. */
const REFUSED = Symbol("retained_item.refused");

/**
 * `confidence` si et seulement si `source === "conversation"`, dans `[0, 1]`.
 *
 * Les deux sens sont des refus, et pas des corrections:
 *   - une conversation SANS confiance ne peut pas être passée au seuil de
 *     promotion (0,70, chez `food_preference_promotion.ts`); l'accepter à `null`
 *     la ferait entrer par une porte qui ne mesure rien;
 *   - une confiance sur un fait déclaré (`written`, `questionnaire`,
 *     `draft_note`) est une erreur de catégorie. L'effacer en silence garderait
 *     la ligne et perdrait la preuve qu'un producteur mélange les deux
 *     magasins.
 */
function parseConfidence(
  value: unknown,
  source: RetainedSource,
): number | null | typeof REFUSED {
  if (source !== "conversation") {
    return value === undefined || value === null ? null : REFUSED;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return REFUSED;
  if (value < 0 || value > 1) return REFUSED;
  return value;
}

/**
 * La forme de STOCKAGE, exactement celle du §3 — pour que les six lots écrivent
 * tous le même jsonb, et qu'un aller-retour soit une identité (prouvé au test).
 */
export function retainedItemToJson(item: RetainedItem): Record<string, unknown> {
  return {
    kind: item.kind,
    scope: item.scope,
    subject: item.subject,
    text: item.text,
    value: item.value,
    source: item.source,
    at: item.at,
    item: item.item,
    confidence: item.confidence,
    // LOT M2 — écrit MÊME à `null`, et c'est délibéré: une clé absente et une
    // clé nulle se relisent pareil ici, mais elles ne se DÉBOGUENT pas pareil.
    // « cette ligne n'a pas de citation » est une information; « cette ligne
    // vient d'une version qui ne connaissait pas le champ » en est une autre,
    // et seule la seconde se lit sur une clé absente.
    quote: item.quote,
  };
}

// ===========================================================================
// L'EXCEPTION DU SUJET NON PRÉCISÉ — et elle n'est pas négociable
// ===========================================================================

/**
 * Une bouche, réduite à ce dont cette règle a besoin.
 *
 * ⚠️ `ageState` ET PAS `isMinor`, et ce n'est pas un détail de nommage: c'est
 * le champ que le dépôt porte déjà (`MemberAgeState`, `household.ts`), et son
 * en-tête explique pourquoi le booléen a été retiré — « je ne sais pas » et
 * « majeur » doivent produire des résultats OPPOSÉS, et l'ancien
 * `coalesce(…, false)` les confondait DU MAUVAIS CÔTÉ: un enfant sans date
 * renseignée recevait une direction d'adulte, en silence.
 *
 * Les bouches arrivent en PARAMÈTRE. Ce module ne va rien chercher en base.
 */
export type PortionAdjustMember = {
  readonly memberId: string;
  readonly ageState: MemberAgeState;
};

/** Pourquoi une bouche a été retirée d'un ajustement. Liste fermée. */
export const PORTION_ADJUST_EXCLUSIONS = [
  "minor",
  "age_unknown",
  "not_in_household",
] as const;
export type PortionAdjustExclusion =
  (typeof PORTION_ADJUST_EXCLUSIONS)[number];

/**
 * Qui reçoit l'ajustement, et qui en est retiré — AVEC LE MOTIF.
 *
 * Les deux listes sortent ensemble parce que la nomenclature l'exige: « le
 * mineur est simplement exclu de l'ajustement; rien n'échoue, ET LE CONSTAT LE
 * DIT ». Un appelant qui ne recevrait que `included` ne pourrait pas écrire ce
 * constat, et l'exclusion redeviendrait le geste silencieux qu'elle existe pour
 * empêcher.
 */
export type PortionAdjustAudience = {
  readonly included: readonly string[];
  readonly excluded: readonly {
    readonly memberId: string;
    readonly reason: PortionAdjustExclusion;
  }[];
};

/**
 * À QUELLES BOUCHES S'APPLIQUE UN `portion.adjust` ?
 *
 * ── LA RÈGLE, ET SON EXCEPTION (§2 axe 3) ──────────────────────────────────
 * Si le sujet n'est pas précisé, ça concerne tout le monde. C'est le cas le
 * plus fréquent et le moins surprenant.
 *
 * UNE exception: un `portion.adjust` **À LA BAISSE** ne s'applique pas à un
 * mineur sans sujet explicite. Réduire l'assiette d'un enfant en croissance à
 * partir d'une remarque non attribuée d'un adulte est exactement le geste
 * silencieux que le reste du produit interdit (plancher TCA, consentement de
 * restriction).
 *
 * ── ⚠️ CE MODULE VA PLUS LOIN QUE LA NOMENCLATURE SUR UN POINT, ASSUMÉ ─────
 * `unknown` EST EXCLU COMME UN MINEUR. La nomenclature ne nomme que le mineur;
 * elle a été écrite avant d'avoir sous les yeux l'état RÉEL des données.
 *
 * Deux faits le commandent:
 *   1. L'ÂGE EST FACULTATIF À LA SAISIE (le flux de 90 secondes ne se bloque
 *      pas). Une fiche d'enfant saisie à la main sans date vaut `unknown`, pas
 *      `minor`. Une garde qui n'exclut que `minor` ne mordrait donc PAS dans le
 *      cas le plus courant — c'est la cicatrice « ceinture armée sur coffre
 *      vide »: elle aurait l'air de marcher.
 *   2. `household.ts` a DÉJÀ tranché ce sens: `goalApplies` rend `false` sur
 *      `unknown`, avec ce motif — « décider à la place de quelqu'un dont on
 *      ignore s'il a huit ou quarante ans ». Retirer de la nourriture est
 *      strictement plus lourd que ne pas donner une direction.
 *
 * L'asymétrie des dégâts finit de trancher: exclure à tort un adulte lui laisse
 * une part standard, VISIBLE dans le constat, qu'il corrige en se nommant.
 * Inclure à tort un enfant lui retire de la nourriture, en silence.
 *
 * ── ET UN SUJET EXPLICITE N'EST JAMAIS FILTRÉ ──────────────────────────────
 * `member:<uuid>` veut dire que la personne a nommé la bouche, avec la liste du
 * foyer sous les yeux — c'est une réponse à une question fermée, pas une
 * inférence. Filtrer là-dessus reviendrait à ignorer ce qu'elle vient de dire.
 * C'est précisément ce que « SANS sujet explicite » veut dire dans la règle.
 *
 * ⚠️ AUCUN PARAMÈTRE DE GARDE OPTIONNEL. La règle n'est pas configurable, et
 * `members` est requis: ce dépôt a une cicatrice nommée « paramètre de garde
 * optionnel = garde désarmée » (le `safetyBand` qui n'était jamais passé).
 */
export function subjectsForPortionAdjust(
  item: PortionAdjustItem,
  members: readonly PortionAdjustMember[],
): PortionAdjustAudience {
  const roster = members ?? [];

  const named = subjectMemberId(item.subject);
  if (named !== null) {
    const known = roster.some((m) => String(m.memberId).trim().toLowerCase() === named);
    return known
      ? { included: [named], excluded: [] }
      // Une bouche partie du foyer: l'item est périmé, pas malformé. On ne
      // l'applique à personne, et surtout pas à tout le monde par repli.
      : { included: [], excluded: [{ memberId: named, reason: "not_in_household" }] };
  }

  const included: string[] = [];
  const excluded: { memberId: string; reason: PortionAdjustExclusion }[] = [];
  for (const member of roster) {
    const id = String(member.memberId ?? "").trim();
    if (!id) continue;
    // À LA HAUSSE, personne n'est retiré. La règle protège d'un RETRAIT de
    // nourriture; servir davantage à un enfant en croissance n'est pas le
    // geste qu'elle vise.
    if (item.value.direction === "up") {
      included.push(id);
      continue;
    }
    if (member.ageState === "minor") {
      excluded.push({ memberId: id, reason: "minor" });
      continue;
    }
    if (member.ageState === "unknown") {
      excluded.push({ memberId: id, reason: "age_unknown" });
      continue;
    }
    included.push(id);
  }
  return { included, excluded };
}
