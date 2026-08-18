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
  RECIPE_DIFFICULTIES,
  type RetainedItem,
  type RetainedKind,
  type RetainedSubject,
} from "./retained_item.ts";
import { effectOf } from "./plan_feedback.ts";
import { isFrenchLocale } from "./locale.ts";

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
  /** Des TITRES de plats. Le jeton `none` n'est pas un plat. */
  readonly neverAgain: readonly string[];
  /** L'inverse, même forme. */
  readonly makeAgain: readonly string[];
  /** Le jeton de la 4e question, stocké AVEC sa réponse. */
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
  /** `practical_constraints.cooking_time_min` AUJOURD'HUI, ou `null`. */
  readonly cookingTimeMin: number | null;
  /** `practical_constraints.recipe_difficulty` AUJOURD'HUI, ou `null`. */
  readonly recipeDifficulty: string | null;
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
  /** Rien à faire bouger: la valeur courante est inconnue. */
  readonly noBaseline: number;
  /** Déjà au plus bas: on ne descend pas sous le plancher. */
  readonly atFloor: number;
  /** « Pour qui » illisible — un REFUS, jamais un repli sur `household`. */
  readonly badSubject: number;
  /** La réponse d'axe n'a pas de famille. Voir le bloc `axisNotRetained`. */
  readonly axisNotRetained: number;
  /** Le socle a refusé l'item construit (jour, sujet, portée, `value`). */
  readonly malformed: number;
}

export interface PlanFeedbackRetained {
  /** À passer TEL QUEL à `persistRetainedItemsFor({durable})`. */
  readonly items: readonly RetainedItem[];
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
  portion_down: {
    en: "The portions in the plan were too much",
    fr: "Les portions du plan étaient trop grosses",
  },
  portion_up: {
    en: "The portions in the plan were not enough",
    fr: "Les portions du plan n'étaient pas assez copieuses",
  },
  recipe_simpler: {
    en: "Simpler recipes",
    fr: "Des recettes plus simples",
  },
  cooking_time: {
    en: "Shorter cooking sessions",
    fr: "Des sessions de cuisine plus courtes",
  },
} as const;

function say(key: keyof typeof TEXTS, locale: string): string {
  return isFrenchLocale(locale) ? TEXTS[key].fr : TEXTS[key].en;
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
 *   `axis_question` + `axis_answer` → ⛔ RIEN. Voir `axisNotRetained`.
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
  const counts: Record<keyof Omit<PlanFeedbackRetainedRefusals, "total">, number> = {
    dismissed: 0,
    neutral: 0,
    filteredByEffect: 0,
    notInPlan: 0,
    bothPolarities: 0,
    noBaseline: 0,
    atFloor: 0,
    badSubject: 0,
    axisNotRetained: 0,
    malformed: 0,
  };
  const items: RetainedItem[] = [];

  // ── UN REFUS EST UNE RÉPONSE, ET SA TRADUCTION EST « RIEN » ──────────────
  // Fermer le questionnaire n'est pas « je n'aime rien »: c'est « pas
  // maintenant ». En tirer le moindre item ferait naître une règle de vie d'un
  // geste de sortie.
  if (String(row.dismissedAt ?? "").trim() !== "") {
    counts.dismissed = 1;
    return { items, refused: withTotal(counts) };
  }

  // ⚠️ LA SEULE TABLE DE DÉCISION, ET ELLE EXISTAIT DÉJÀ. On ne relit ni
  // `cooked`, ni `portions`, ni le jeton `none`: `effectOf` les tranche, et ce
  // module traduit ce qu'elle rend. Une seconde lecture ici serait la première
  // chose à diverger.
  const effect = effectOf({
    cooked: row.cooked,
    portions: row.portions,
    neverAgain: row.neverAgain,
    makeAgain: row.makeAgain,
    axisAnswer: row.axisAnswer,
  });

  // Ce que `effectOf` a retiré — COMPTÉ, jamais refiltré: le jeton `none` (qui
  // créerait un aliment fantôme que le générateur chercherait à vie) et les
  // titres vides.
  counts.filteredByEffect = (row.neverAgain?.length ?? 0) - effect.refusedDishes.length +
    ((row.makeAgain?.length ?? 0) - effect.keptDishes.length);

  // ── LES DEUX POLARITÉS SUR LE MÊME PLAT: LES DEUX TOMBENT ────────────────
  // L'écran l'interdit (une marque en remplace l'autre), donc ce cas ne vient
  // que d'un client forgé ou d'un futur écran. Le garder produirait, dans le
  // MÊME magasin, « n'aime pas X » et « veut revoir X » — c'est-à-dire, mot
  // pour mot, le défaut mesuré en run réel que la nomenclature cite en tête:
  // `["Aime le brocoli s'il est rôti.", "N'aime pas le brocoli."]`.
  const refusedSet = new Set(effect.refusedDishes.map((d) => d.trim()));
  const keptSet = new Set(effect.keptDishes.map((d) => d.trim()));
  const contradictory = new Set<string>();
  for (const title of refusedSet) if (keptSet.has(title)) contradictory.add(title);

  const planTitles = new Set(
    (ctx.planDishTitles ?? []).map((t) => String(t ?? "").trim()).filter((t) => t),
  );

  for (
    const [titles, kind] of [
      [effect.refusedDishes, "food.exclude"],
      [effect.keptDishes, "food.prefer"],
    ] as const
  ) {
    for (const raw of titles) {
      const title = String(raw ?? "").trim();
      if (contradictory.has(title)) {
        counts.bothPolarities += 1;
        continue;
      }
      // ⛔ APPARTENANCE EXACTE À LA LISTE PROPOSÉE — pas un rapprochement.
      if (!planTitles.has(title)) {
        counts.notInPlan += 1;
        continue;
      }
      push(items, counts, {
        kind,
        subject: HOUSEHOLD_SUBJECT,
        text: title,
        value: null,
        at: ctx.at,
      });
    }
  }

  // ── `portion.adjust` — LA FAMILLE QUE CE PRODUCTEUR EST SEUL À ÉCRIRE ────
  if (effect.portionDirection === null) {
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
      push(items, counts, {
        kind: "portion.adjust",
        subject,
        text: say(
          effect.portionDirection === "down" ? "portion_down" : "portion_up",
          ctx.locale,
        ),
        // ⚠️ `slight`, TOUJOURS — et c'est un arbitrage, pas un défaut.
        // La question fermée n'a QU'UN cran par sens (« trop » / « pas
        // assez »): rendre `clear` demanderait une intensité que la personne
        // n'a pas donnée. OPTION ÉCARTÉE: dériver `clear` de l'accord de deux
        // questions (« trop » + « assiettes difficiles à finir »). Refusée
        // parce que la satiété et la quantité ne sont pas le même axe, et
        // qu'un accent plus fort se paie en nourriture retirée. `clear` reste
        // donc produit par la carte (`written`), là où quelqu'un peut dire
        // « vraiment trop » de sa main.
        value: { direction: effect.portionDirection, magnitude: "slight" },
        at: ctx.at,
      });
    }
  }

  // ── `cooked` → LES DEUX CHAMPS QUE LA COLONNE SE NOMME EN LECTEUR ────────
  if (effect.easeCookingBy > 0) {
    const current = Number(ctx.cookingTimeMin);
    if (!Number.isFinite(current) || !Number.isInteger(current) || current <= 0) {
      // ⚠️ `logistics.set` PORTE UNE VALEUR ABSOLUE, PAS UN DELTA. Sans la
      // valeur courante, « alléger de 10 minutes » n'a pas de résultat — et
      // supposer 30, 45 ou 60 écrirait un réglage que personne n'a choisi.
      counts.noBaseline += 1;
    } else {
      const next = Math.max(COOKING_TIME_FLOOR_MIN, current - effect.easeCookingBy);
      if (next >= current) counts.atFloor += 1;
      else {
        push(items, counts, {
          kind: "logistics.set",
          subject: HOUSEHOLD_SUBJECT,
          text: say("cooking_time", ctx.locale),
          value: { field: "cooking_time_min", value: next },
          at: ctx.at,
        });
      }
    }
  }

  if (effect.simplifyRecipes) {
    const at = (RECIPE_DIFFICULTIES as readonly string[]).indexOf(
      String(ctx.recipeDifficulty ?? "").trim().toLowerCase(),
    );
    // Même règle que les minutes: un cran EN DESSOUS d'une valeur connue.
    // `RECIPE_DIFFICULTIES` est ordonnée du plus simple au plus ambitieux, et
    // l'index 0 (`simple`) est le plancher — on n'invente pas un cran de plus.
    if (at < 0) counts.noBaseline += 1;
    else if (at === 0) counts.atFloor += 1;
    else {
      push(items, counts, {
        kind: "logistics.set",
        subject: HOUSEHOLD_SUBJECT,
        text: say("recipe_simpler", ctx.locale),
        value: { field: "recipe_difficulty", value: RECIPE_DIFFICULTIES[at - 1] },
        at: ctx.at,
      });
    }
  }

  // ── ⛔ LA RÉPONSE D'AXE NE PRODUIT RIEN, ET C'EST UN TROU NOMMÉ ──────────
  // `effectOf` en tire un `emphasisHint` — une ligne d'accent pour la consigne
  // suivante. Ce n'est PAS une famille de la liste fermée, et il n'y en a pas
  // de neuvième: « une catégorie dont aucun générateur ne sait quoi faire ne se
  // crée pas ».
  //
  // Les deux reroutages plausibles sont refusés, et il faut que ce soit écrit:
  //   · « resté sur ta faim » → `portion.adjust` up: la satiété n'est pas la
  //     quantité (volume, ancrage protéique), et `portions` pose DÉJÀ la
  //     question directement — l'ajouter compterait deux fois la même réponse;
  //   · « assiettes difficiles à finir » → `portion.adjust` down: même défaut,
  //     dans l'autre sens, et celui-là RETIRE de la nourriture.
  //
  // ⚠️ CONSÉQUENCE, ET ELLE EST DICIBLE: la 4e question reste, à ce jour, une
  // question dont le lecteur (`emphasisHint`) n'a AUCUN appelant. C'est
  // exactement ce que `plan_feedback.ts` interdit en tête de fichier. Ce lot ne
  // la referme pas — il la compte, pour qu'elle se voie.
  if (String(row.axisAnswer ?? "").trim() !== "") counts.axisNotRetained += 1;

  return { items, refused: withTotal(counts) };
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
function push(
  out: RetainedItem[],
  counts: Record<string, number>,
  draft: {
    kind: RetainedKind;
    subject: RetainedSubject;
    text: string;
    value: unknown;
    at: string;
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
