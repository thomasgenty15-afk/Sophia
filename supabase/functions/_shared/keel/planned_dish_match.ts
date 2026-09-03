/**
 * RAPPROCHER UNE ASSIETTE D'UN PLAT PRÉVU.
 *
 * ---------------------------------------------------------------------------
 * CE QUE ÇA SERT, ET POURQUOI ÇA VAUT LE COUP
 * ---------------------------------------------------------------------------
 * L'élève compose sa semaine sur `/app/plan` (`student_generated_meals`), puis
 * il photographie ce qu'il mange. Les deux ne se parlaient pas: la photo
 * produisait des groupes alimentaires, le plat prévu portait des ingrédients en
 * prose, et personne ne faisait le lien. Conséquences mesurées:
 *
 *   * la COCHE restait un geste manuel, sur un écran que l'élève n'ouvre pas
 *     forcément le jour même;
 *   * une assiette à plusieurs groupes repartait avec `food_group_ref: null`
 *     (`several_groups_none_in_plan`) — un bol d'avoine au yaourt, le
 *     petit-déjeuner le plus courant du monde, ne créditait donc RIEN de la
 *     couverture que le coach lit le lundi. Le plat prévu, lui, sait très bien
 *     que c'est de l'avoine ET du yaourt.
 *
 * ---------------------------------------------------------------------------
 * CE QUI REND LE RAPPROCHEMENT LÉGITIME AUJOURD'HUI, ET NE L'ÉTAIT PAS AVANT
 * ---------------------------------------------------------------------------
 * `meal_tick.ts` refuse explicitement de mapper les ingrédients d'un plat vers
 * le vocabulaire fermé: « un plat généré porte des ingrédients en prose, pas
 * des jetons du vocabulaire fermé, et les mapper serait une déduction ». Ce
 * refus était juste.
 *
 * Il ne l'est plus depuis la migration `20260805140000_coach_food_items`, qui
 * pose `food_items`: 127 aliments, chacun avec son `food_group_ref`, écrits à
 * la main. « Greek yogurt » → `dairy_yogurt` n'est plus une déduction du
 * modèle, c'est une LECTURE DE TABLE. Le catalogue est injecté ici (module
 * pur); ce qui n'y est pas ne devient jamais un groupe.
 *
 * ---------------------------------------------------------------------------
 * L'ARBITRAGE QUI GOUVERNE TOUT: ON N'ÉCRIT PAS UN FAIT SUR UNE RESSEMBLANCE
 * ---------------------------------------------------------------------------
 * Une coche est une ligne de `protocol_events`, dans la table qui nourrit la
 * couverture. Cocher sur un « ça y ressemble » écrirait ce que ce dépôt appelle
 * mot pour mot « une preuve fabriquée ». Ce module ne décide donc jamais
 * d'écrire: il rend un VERDICT et laisse l'appelant choisir le geste.
 *
 *   `confident` — un seul candidat, le créneau concorde, et TOUS les groupes du
 *                 plat sont sur l'assiette. L'appelant peut cocher en le
 *                 DISANT, avec la porte de correction ouverte (doctrine
 *                 §3.3bis: hypothèse annoncée + porte de correction).
 *   `probable`  — ça se ressemble, il manque quelque chose ou il y a plusieurs
 *                 candidats. L'appelant DEMANDE, et ne coche que sur un oui.
 *   `none`      — rien à proposer. Le silence est la bonne réponse.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire. Le catalogue, les
 * plats candidats et l'assiette arrivent tous en argument.
 */

import { type FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// Les entrées
// ---------------------------------------------------------------------------

/** Une ligne de `food_items`, réduite à ce que le rapprochement utilise. */
export interface FoodCatalogueItem {
  slug: string;
  label: string;
  food_group_ref: string;
}

/** Un plat de `student_generated_meals.dishes[]`, réduit de même. */
export interface PlannedDish {
  /**
   * ⟳ A8.3 (2026-09-03) — LA BOUCHE À QUI CE PLAT EST DÉDIÉ. `null`/absent = le
   * plat de la table, celui de tout le monde.
   *
   * ⛔ IL MANQUAIT, ET C'EST CE QUI A LAISSÉ FUIR LE PLAT D'UN AUTRE. Le champ
   * existe dans le `dishes[]` stocké depuis le LOT C, la vue du navigateur le
   * lit (`HouseholdDishView.memberId`) et le filtre (`dishIsFor`) — mais le
   * type SERVEUR ne le portait pas, donc aucun lecteur serveur ne pouvait
   * filtrer, et aucun typecheck ne pouvait le signaler. Mesuré en run réel le
   * 2026-09-03: la bande du soir d'un profil réclamé nommait « Compote pour
   * Cy », le plat composé pour l'enfant, avec sa case.
   */
  member_id?: string | null;
  title: string;
  /** `breakfast` … `dinner`, ou null quand le plat ne vise aucun créneau. */
  slot: string | null;
  ingredients: ReadonlyArray<{ term?: string | null }>;
  /**
   * CE QUE LE PLAT PRÉLÈVE SUR UNE PRÉPARATION DÉJÀ FAITE.
   *
   * ── LE DÉFAUT QUE LA CAMPAGNE DU 2026-08-05 A MESURÉ ─────────────────────
   * `ingredients` ne porte QUE ce qu'on ajoute au moment de manger. Le plat
   * « Chicken, brown rice and broccoli bowl » a pour `ingredients` : Broccoli,
   * olive oil, Lemon — le poulet et le riz vivent dans la PRÉPARATION que
   * `uses` cite. Le matcher ne lisait que `ingredients` : sur la composition
   * réellement livrée, le seul vrai plat photographié est ressorti `probable`
   * à 0,5 de couverture, rétrogradé par un citron que la photo ne peut pas
   * montrer. Le mécanisme ne se déclenchait donc JAMAIS sur la vraie donnée.
   */
  /**
   * ⚠️ LES DEUX CASSES SONT RÉELLES, et n'en lire qu'une a coûté un run.
   *
   * `mealDishesPayload` sérialise `preparation_id` (snake_case), mais des
   * lignes plus anciennes de `student_generated_meals` portent `preparationId`.
   * Les deux formes coexistent en base — vérifié par
   * `select distinct k from … jsonb_object_keys(u) k`. La première version de
   * ce champ ne lisait que le camelCase: 90 tests unitaires verts, et le
   * rapprochement muet sur toute donnée écrite par le générateur.
   *
   * Le `as PlannedDish[]` du chargeur désarme le typecheck sur ce payload
   * (motif `as-cast-on-foreign-type-disarms-typecheck`), donc rien n'aurait
   * signalé l'écart. On lit les deux, et `preparationTermsOf` est le SEUL
   * endroit qui connaît cette dualité.
   */
  uses?: ReadonlyArray<
    { preparationId?: string | null; preparation_id?: string | null }
  >;
}

/** Une préparation, réduite à ce que le rapprochement en lit. */
export interface PlannedPreparation {
  id: string;
  ingredients: ReadonlyArray<{ term?: string | null }>;
}

/** Ce qu'une photo ou une déclaration a produit. */
export interface ObservedPlate {
  /** `recognized.food_groups_present` — les jetons du vocabulaire fermé. */
  groups: readonly string[];
  /** `recognized.detected_foods[].label` — les mots du modèle. */
  labels: readonly string[];
  /** Le créneau déclaré, quand l'élève l'a dit. Null le plus souvent. */
  slot: string | null;
}

// ---------------------------------------------------------------------------
// La normalisation — la seule heuristique de ce module, et elle est étroite
// ---------------------------------------------------------------------------

/**
 * Le singulier d'un mot anglais, avec les TROIS règles qui couvrent la cuisine.
 *
 * ── POURQUOI PAS SEULEMENT « retirer le -s » ────────────────────────────
 * C'était la première version, et le banc sur les 1 417 ingrédients réellement
 * générés l'a démentie: « potatoes » devenait « potatoe » et ne trouvait jamais
 * « Potato », « tomatoes » devenait « tomatoe ». Deux des dix termes les plus
 * fréquents du corpus, perdus sur une règle d'orthographe.
 *
 * Les trois règles, et rien de plus:
 *   -ies → -y      berries → berry
 *   -oes/-ches/-shes/-xes/-sses → couper « es »   potatoes → potato
 *   -s (pas -ss)   oats → oat
 *
 * On s'arrête là. Pas de racinisation, pas de distance d'édition, pas de
 * synonymes: chaque règle en plus est une occasion de rapprocher deux aliments
 * qui n'ont rien à voir, et une fausse coche coûte plus cher qu'une coche
 * manquée — la première écrit un fait faux, la seconde laisse un geste à faire.
 */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (
    word.length > 4 &&
    (/(?:o|ch|sh|x|ss)es$/.test(word))
  ) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Réduit un terme à sa forme comparable: minuscules, accents et ponctuation
 * retirés, chaque mot au singulier (voir `singular`).
 */
export function normalizeTerm(value: string): string {
  const base = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.split(" ").map(singular).join(" ");
}

/**
 * L'un est-il une suite de MOTS ENTIERS de l'autre.
 *
 * ── POURQUOI PAS UN `includes` DE CHAÎNE ─────────────────────────────────
 * Première version: contenance brute, avec un garde-fou « libellés de 4
 * caractères minimum » pour éviter que « ice » ne se retrouve dans « rice ».
 * Le banc l'a cassée immédiatement, et pas là où je l'attendais: « Oats » se
 * normalise en « oat » (3 lettres), donc le garde-fou éliminait le libellé
 * lui-même et « rolled oats » ne trouvait plus rien. Un seuil de longueur est
 * un proxy; la frontière de mot est la vraie règle.
 *
 * « oat » ⊂ « rolled oat » → oui, c'est un mot entier.
 * « ice » ⊂ « brown rice » → non, « ice » n'y est pas un mot.
 */
function wordsContain(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let all = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Le groupe d'un terme, LU dans le catalogue.
 *
 * Trois passes, de la plus stricte à la plus permissive, et on s'arrête à la
 * première qui mord:
 *   1. égalité exacte du libellé normalisé — « Greek yogurt » = « greek yogurt »;
 *   2. égalité du slug normalisé — « peanut_butter » = « peanut butter »;
 *   3. INCLUSION PAR MOTS ENTIERS, dans un sens ou dans l'autre. C'est ce qui
 *      rattrape « rolled oats » contre « Oats » et « grilled chicken breast »
 *      contre « Chicken breast », sans rapprocher « rice » de « Ice ».
 */
export function groupForTerm(
  term: string,
  catalogue: readonly FoodCatalogueItem[],
): FoodGroupRef | null {
  const needle = normalizeTerm(term);
  if (!needle) return null;
  const needleWords = needle.split(" ").filter(Boolean);

  for (const item of catalogue) {
    if (normalizeTerm(item.label) === needle) return item.food_group_ref as FoodGroupRef;
  }
  for (const item of catalogue) {
    if (normalizeTerm(item.slug) === needle) return item.food_group_ref as FoodGroupRef;
  }
  for (const item of catalogue) {
    const labelWords = normalizeTerm(item.label).split(" ").filter(Boolean);
    if (
      wordsContain(needleWords, labelWords) ||
      wordsContain(labelWords, needleWords)
    ) {
      return item.food_group_ref as FoodGroupRef;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Le verdict
// ---------------------------------------------------------------------------

export const MATCH_VERDICTS = ["confident", "probable", "none"] as const;
export type PlannedMatchVerdict = (typeof MATCH_VERDICTS)[number];

export interface PlannedDishCandidate {
  dishIndex: number;
  title: string;
  /** Les groupes que le plat DEMANDE, résolus par le catalogue. */
  dishGroups: FoodGroupRef[];
  /** Ceux d'entre eux qu'une photo peut honnêtement montrer — le dénominateur. */
  anchorGroups: FoodGroupRef[];
  /** Ceux d'entre eux qui sont sur l'assiette. */
  matchedGroups: FoodGroupRef[];
  /** Ceux qui manquent. C'est ce qui rend une question INTELLIGIBLE. */
  missingGroups: FoodGroupRef[];
  /** Les termes du plat retrouvés mot pour mot dans ce que le modèle a nommé. */
  matchedTerms: string[];
  /**
   * Les groupes d'ancre dont AU MOINS UN terme a été retrouvé mot pour mot.
   *
   * ── POURQUOI CE CHAMP EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR ──────
   * `confident` se décidait sur la seule couverture des GROUPES. Deux aliments
   * du même `food_group_ref` sont alors interchangeables, et la campagne du
   * 2026-08-05 l'a mesuré 3/3 sur des photos réelles : une assiette de poulet,
   * riz et brocolis a coché « Duck breast with quinoa and cauliflower », et une
   * assiette de saumon a coché « Sardines with white rice and green beans ».
   * Zéro recouvrement de termes dans les deux cas — le canard et le poulet sont
   * tous deux `poultry`, le saumon et la sardine tous deux du poisson gras.
   *
   * `matchedTerms` existait déjà et n'était utilisé QUE comme départage de
   * tri : le seul signal capable de distinguer le saumon de la sardine servait
   * à ordonner, jamais à interdire. C'est maintenant une GARDE (voir le verdict
   * `confident`), et le tri n'a pas changé.
   */
  corroboratedGroups: FoodGroupRef[];
  /** `matchedGroups / dishGroups`, dans [0,1]. 0 quand le plat n'a aucun groupe. */
  coverage: number;
  /** Le créneau du plat contredit-il celui déclaré par l'élève. */
  slotConflict: boolean;
}

export interface PlannedDishMatch {
  verdict: PlannedMatchVerdict;
  /** Le meilleur candidat, ou null sur `none`. */
  best: PlannedDishCandidate | null;
  /** Tous les candidats retenus, du meilleur au moins bon. */
  candidates: PlannedDishCandidate[];
  /** Pourquoi ce verdict — tracé, jamais deviné à la lecture. */
  reason:
    | "no_dishes"
    | "no_groups_on_plate"
    | "single_full_cover"
    | "several_plausible"
    | "partial_cover"
    // Tous les groupes du plat sont sur l'assiette, mais aucun aliment n'a été
    // nommé pareil: le canard contre le poulet. On propose, on ne coche pas.
    | "groups_match_terms_do_not"
    | "nothing_reaches";
}

/** Sous ce seuil, un candidat n'est même pas proposé. */
const MIN_COVERAGE = 0.5;

/**
 * LES GROUPES QU'UNE PHOTO NE PEUT PAS VOIR — exclus du dénominateur.
 *
 * ── LE DÉFAUT QUE LE BANC A TROUVÉ, ET IL AURAIT TOUT CASSÉ ──────────────
 * Le plat réel « Greek yogurt oats with banana and peanut butter » porte cinq
 * ingrédients, dont du MIEL. L'assiette photographiée montrait avoine et
 * yaourt: 2 groupes sur 5, soit 0,4 — sous le seuil, donc AUCUNE proposition.
 * Le petit-déjeuner le plus courant du produit ne se rapprochait jamais.
 *
 * La correction n'est pas de baisser le seuil (un seuil qu'on baisse jusqu'à
 * ce que ça marche ne mesure plus rien). C'est que la question était mal posée:
 * on demandait à une photo de prouver la présence de choses que le système sait
 * déjà être INVISIBLES. `MEAL_ANALYSIS_SYSTEM_PROMPT` y consacre une section
 * entière — « WHAT A PHOTO DOES NOT SHOW: THE INVISIBLE »: graisse de cuisson,
 * sauces, et « sugar, syrup, honey or cream dissolved in a drink, a yoghurt or
 * a dessert ».
 *
 * Ces groupes restent RAPPORTÉS (ils sortent dans `missingGroups` et peuvent
 * nourrir une question), ils ne comptent simplement pas contre l'élève dans la
 * couverture. Exiger d'une photo qu'elle montre l'invisible, c'est garantir que
 * rien ne matche jamais.
 */
const ACCESSORY_GROUPS: readonly string[] = [
  "olive_oil",
  "other_added_fat",
  "sauce_dressing",
  "sugar_sweets",
  // ── `water`, ET CE QU'IL A COÛTÉ D'Y PENSER TROP TARD ────────────────────
  // Ajouté le 2026-08-05, en même temps que la lecture des préparations. Une
  // préparation de riz réelle porte `basmati rice` (aucun groupe au catalogue),
  // `water` et `salt`: en lisant les préparations, on a donc gagné l'ancre
  // `poultry` du poulet ET acheté une ancre `water` qu'aucune photo ne peut
  // montrer. Couverture mesurée: 1 → 0,667, garantie, sur le plat le plus
  // courant du produit. Le correctif dégradait plus qu'il n'apportait.
  //
  // L'eau relève exactement de la même règle que l'huile de cuisson: le
  // système SAIT qu'elle est invisible, et exiger d'une photo qu'elle la
  // prouve, c'est garantir que rien ne matche jamais.
  "water",
];

/**
 * Rapproche une assiette des plats prévus pour ce moment-là.
 *
 * @param dishes les plats CANDIDATS — l'appelant a déjà fait le filtrage par
 *   date (voir `mealStretch`: un plat ne nomme qu'un jour de semaine, jamais
 *   une date, et seul l'appelant sait quel jour on est). Ce module ne connaît
 *   pas le calendrier, exprès: il resterait juste si on changeait la règle de
 *   fenêtrage, et il est testable sans horloge.
 */
export function matchPlannedDish(args: {
  plate: ObservedPlate;
  dishes: readonly PlannedDish[];
  catalogue: readonly FoodCatalogueItem[];
  /**
   * Les préparations de la composition, citées par `dish.uses`. Absentes, le
   * rapprochement ne voit que ce que le plat AJOUTE — voir `PlannedDish.uses`.
   */
  preparations?: readonly PlannedPreparation[];
}): PlannedDishMatch {
  const empty = (reason: PlannedDishMatch["reason"]): PlannedDishMatch => ({
    verdict: "none",
    best: null,
    candidates: [],
    reason,
  });

  if (args.dishes.length === 0) return empty("no_dishes");

  const plateGroups = new Set(
    args.plate.groups.map((g) => String(g ?? "").trim()).filter(Boolean),
  );
  // Une assiette sans aucun groupe lu ne peut rien confirmer. On ne se rabat
  // PAS sur les libellés seuls: « quelque chose de brun » ressemble à tout.
  if (plateGroups.size === 0) return empty("no_groups_on_plate");

  const plateLabels = args.plate.labels
    .map((l) => normalizeTerm(l))
    .filter(Boolean);
  const plateSlot = String(args.plate.slot ?? "").trim();

  // Les préparations par id, pour résoudre `dish.uses` sans re-parcourir.
  const prepById = new Map<string, PlannedPreparation>();
  for (const prep of args.preparations ?? []) {
    const id = String(prep?.id ?? "").trim();
    if (id) prepById.set(id, prep);
  }

  const candidates: PlannedDishCandidate[] = [];
  args.dishes.forEach((dish, dishIndex) => {
    const dishGroups: FoodGroupRef[] = [];
    const matchedTerms: string[] = [];
    // Un groupe n'est CORROBORÉ que si l'un de ses termes a été nommé mot pour
    // mot par le modèle. C'est la garde qui sépare le poulet du canard.
    const corroborated = new Set<FoodGroupRef>();

    // LES INGRÉDIENTS EFFECTIFS: ce que le plat ajoute, PLUS ce qu'il prélève
    // sur les préparations qu'il cite. Voir `PlannedDish.uses`.
    const effectiveIngredients: Array<{ term?: string | null }> = [
      ...(dish.ingredients ?? []),
    ];
    for (const use of dish.uses ?? []) {
      // Les DEUX casses — voir `PlannedDish.uses`.
      const id = String(use?.preparationId ?? use?.preparation_id ?? "").trim();
      const prep = id ? prepById.get(id) : undefined;
      if (prep) effectiveIngredients.push(...(prep.ingredients ?? []));
    }

    for (const ing of effectiveIngredients) {
      const term = String(ing?.term ?? "").trim();
      if (!term) continue;
      const group = groupForTerm(term, args.catalogue);
      if (group && !dishGroups.includes(group)) dishGroups.push(group);
      const norm = normalizeTerm(term);
      if (
        norm &&
        plateLabels.some((l) => l === norm || l.includes(norm) || norm.includes(l))
      ) {
        matchedTerms.push(term);
        if (group) corroborated.add(group);
      }
    }
    // Un plat dont AUCUN ingrédient n'est au catalogue ne peut pas être
    // rapproché: on n'a rien de comparable. Il n'est pas candidat, et ce n'est
    // pas un échec — c'est l'absence d'information.
    if (dishGroups.length === 0) return;

    // LES ANCRES: ce que la photo peut honnêtement montrer. Un plat qui ne
    // serait fait QUE d'accessoires (un filet d'huile, une sauce) n'a pas
    // d'ancre et ne se rapproche de rien.
    const anchorGroups = dishGroups.filter((g) => !ACCESSORY_GROUPS.includes(g));
    if (anchorGroups.length === 0) return;

    const matchedGroups = dishGroups.filter((g) => plateGroups.has(g));
    const missingGroups = dishGroups.filter((g) => !plateGroups.has(g));
    const dishSlot = String(dish.slot ?? "").trim();

    candidates.push({
      dishIndex,
      title: dish.title,
      dishGroups,
      anchorGroups,
      matchedGroups,
      missingGroups,
      matchedTerms,
      corroboratedGroups: anchorGroups.filter((g) => corroborated.has(g)),
      // Le dénominateur est l'ANCRE, pas la liste d'ingrédients: voir
      // `ACCESSORY_GROUPS`. Le numérateur ne compte que des ancres lui aussi,
      // sinon un yaourt sucré dépasserait 1.
      coverage: anchorGroups.filter((g) => plateGroups.has(g)).length /
        anchorGroups.length,
      // Un conflit n'existe que si les DEUX créneaux sont connus. Un créneau
      // absent côté assiette est le cas normal (`slot_key` est NULL sur 71 %
      // des lignes) et ne doit rien disqualifier.
      slotConflict: Boolean(plateSlot) && Boolean(dishSlot) && plateSlot !== dishSlot,
    });
  });

  // Un créneau qui se contredit élimine, il ne pénalise pas: « c'est ton dîner »
  // sur une photo que l'élève a rangée au petit-déjeuner est une proposition
  // qu'il n'a aucune raison d'accepter.
  const reachable = candidates
    .filter((c) => !c.slotConflict && c.coverage >= MIN_COVERAGE)
    .sort((a, b) =>
      b.coverage - a.coverage ||
      b.matchedTerms.length - a.matchedTerms.length ||
      a.dishIndex - b.dishIndex
    );

  if (reachable.length === 0) return empty("nothing_reaches");

  const best = reachable[0];
  const full = reachable.filter((c) => c.coverage === 1);

  // UN SEUL candidat couvert intégralement: c'est le seul cas où l'on s'autorise
  // à agir sans demander. Deux plats pleinement couverts se ressemblent trop
  // pour qu'une machine tranche — et l'élève, lui, sait lequel il a mangé.
  if (full.length === 1 && reachable.length >= 1) {
    const others = reachable.filter((c) => c !== full[0]);
    if (others.every((c) => c.coverage < 1)) {
      // LA GARDE SUR LES TERMES. Couvrir tous les groupes ne suffit pas: deux
      // aliments du même groupe sont interchangeables, et c'est exactement
      // comme ça qu'une assiette de poulet a coché un plat au canard (voir
      // `corroboratedGroups`). Pour agir sans demander, il faut que le modèle
      // ait NOMMÉ, mot pour mot, un aliment de CHAQUE groupe d'ancre.
      //
      // CONDITION DE DÉSARMEMENT — cette garde ne doit pas mordre partout, ou
      // on la débranchera dans la semaine: un plat dont le modèle nomme
      // « grilled chicken breast » contre « Chicken breast » au catalogue est
      // corroboré (l'inclusion par mots entiers de `groupForTerm` le rattrape),
      // et le cas nominal coche donc toujours.
      const fullyCorroborated =
        full[0].corroboratedGroups.length === full[0].anchorGroups.length;
      if (fullyCorroborated) {
        return {
          verdict: "confident",
          best: full[0],
          candidates: reachable,
          reason: "single_full_cover",
        };
      }
      // Tous les groupes y sont mais les aliments ne sont pas les mêmes: c'est
      // précisément le faux positif. On rétrograde, on ne coche pas.
      return {
        verdict: "probable",
        best: full[0],
        candidates: reachable,
        reason: "groups_match_terms_do_not",
      };
    }
  }

  return {
    verdict: "probable",
    best,
    candidates: reachable,
    reason: full.length > 1 || reachable.length > 1
      ? "several_plausible"
      : "partial_cover",
  };
}


// ---------------------------------------------------------------------------
// A8.3 — À QUI CE PLAT EST-IL DESTINÉ ?
// ---------------------------------------------------------------------------

/**
 * La bouche à qui ce plat est DÉDIÉ, ou `null` quand c'est le plat de la table.
 *
 * Une chaîne vide vaut `null`: le générateur écrit parfois `""` plutôt que
 * d'omettre la clé, et lire `""` comme un identifiant de bouche rendrait le
 * plat commun dédié à personne — donc invisible pour tout le monde.
 */
export function dishDedicatedTo(dish: Pick<PlannedDish, "member_id">): string | null {
  const raw = String(dish?.member_id ?? "").trim();
  return raw || null;
}

/**
 * CE PLAT EST-IL DANS L'ASSIETTE DE CETTE BOUCHE ?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE JUMEAU SERVEUR DE `dishIsFor` (`frontend/src/keel/lib/planByPersonModel.ts`),
 *    ET LA MÊME RÈGLE MOT POUR MOT: le plat commun est à tout le monde, le
 *    plat dédié n'est qu'à sa bouche.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE SON ABSENCE COÛTAIT, MESURÉ ────────────────────────────────────
 * La règle était fermée côté ÉCRAN (`HouseholdPlanCard`, `MyShareCard`) et
 * ouverte côté SERVEUR. Un profil réclamé recevait donc dans sa bande du soir
 * le plat composé pour l'enfant, AVEC SA CASE: en le cochant il écrivait, sous
 * son propre compte, « j'ai mangé la compote de Cy » — un fait daté,
 * append-only, dans la table que tout le produit relit. Ce n'est pas R11 (il
 * écrit bien sous son id), c'est pire à sa façon: le fait est faux, et rien
 * dans la ligne ne dit qu'il porte sur le plat de quelqu'un d'autre.
 *
 * ⚠️ `memberId` À `null` FERME LE PLAT DÉDIÉ, ET C'EST LA BONNE DIRECTION.
 * `null` veut dire « on n'a pas su lire quelle bouche est la sienne », pas
 * « il n'en a pas ». Le pire cas de ce sens-là est une case qui manque un
 * soir; le pire cas de l'autre est un fait de consommation fabriqué sur le
 * plat d'un tiers — et un fait faux écrit est indélébile.
 */
export function dishIsForMouth(
  dish: Pick<PlannedDish, "member_id">,
  memberId: string | null,
): boolean {
  const owner = dishDedicatedTo(dish);
  if (owner === null) return true;
  return memberId !== null && owner === memberId;
}
