/**
 * LA RELANCE PAR CELLULE — on garde ce que la relance a réussi, on jette ce qu'elle a cassé.
 *
 * ── LE DÉFAUT, MESURÉ (2026-09-04, tir DENS-2 ter) ─────────────────────────
 * Une relance « personne sans repas » réécrit le plan ENTIER. Le deuxième essai
 * avait composé la bonne chose pour Zoé (une semoule sans courgettes), et il a
 * été rejeté parce qu'il remettait Léa sur la boîte au poulet: `after.missing`
 * n'était pas strictement plus petit. Une acceptation tout-ou-rien fait payer la
 * partie juste par la partie fautive — et sur trois foyers mesurés, c'est la
 * moitié des refus `mouth_unfed`.
 *
 * ── CE QUE FAIT CE MODULE ───────────────────────────────────────────────────
 * Quand le plan relancé n'est pas meilleur EN ENTIER, on en prend les seules
 * CELLULES (jour × moment) qui sont passées de « quelqu'un manque » à « tout le
 * monde est nourri » — avec leurs plats et les casseroles qu'ils citent — et on
 * garde tout le reste du plan de base. Pur: il rend un plan neuf, ne mute rien.
 *
 * ── CE QU'IL DOIT RESPECTER, ET COMMENT ─────────────────────────────────────
 *   · UNE CASSEROLE IMPORTÉE A UNE SESSION: elle rejoint la session de base du
 *     jour où elle cuit (`cookOn`); sans session ce jour-là, la session de la
 *     relance pour ce jour est importée. Une casserole sans session serait
 *     « un jour de batch sans session », que le parseur constate sans réparer.
 *   · UN ID DE CASSEROLE DÉJÀ PRIS AVEC UN AUTRE CONTENU EST RENOMMÉ (`__r`),
 *     et les plats importés sont réécrits pour le citer. Le même id avec le même
 *     contenu (titre, méthode, ingrédients) est réutilisé, pas dupliqué.
 *   · LES COURSES SUIVENT LES CASSEROLES: la liste de courses est une sortie du
 *     modèle, et le parseur retire les lignes orphelines sans jamais en AJOUTER
 *     (« kept, not guessed »). Un plat importé sans ses courses ferait acheter
 *     moins qu'il ne faut, en silence. On importe donc les lignes de la relance
 *     dont le terme réclame un ingrédient des plats ou casseroles importés, et
 *     qui ne sont pas déjà sur la liste de base — ce sont les lignes du modèle,
 *     pas les nôtres.
 *   · LE TEXTE SOURCE RESTE CELUI DU PLAN DE BASE: ses lecteurs (portions par
 *     bouche, explication) ne sont pas par plat. L'appelant ne le remplace que
 *     sur une acceptation entière.
 *
 * ⛔ CE QUE ÇA NE FAIT PAS: ça ne rend pas le modèle meilleur, ça arrête de jeter
 * ce qu'il a réussi. Une cellule que la relance n'a pas nourrie reste celle du
 * plan de base, avec ses manques — la relance suivante ou le dernier recours la
 * traitent comme avant.
 */
import type {
  CookingSession,
  GeneratedDish,
  GeneratedMeal,
  MealPreparation,
  ShoppingItem,
} from "./meal_generation.ts";
import { normalizePantryTerm } from "./meal_generation.ts";
import { readQuantityFromProse } from "./quantity_from_prose.ts";
import type { MealsDelivered } from "./meals_delivered.ts";

export interface MergeOutcome {
  readonly meal: GeneratedMeal;
  /** Les cellules prises à la relance, `day/slot`, dans l'ordre du plan. */
  readonly cells: readonly string[];
  readonly importedPreparations: readonly string[];
  /** ancien id → nouvel id, quand l'id existait avec un autre contenu. */
  readonly renamed: Readonly<Record<string, string>>;
  readonly shoppingAdded: number;
  readonly sessionsImported: number;
  /**
   * ⟳ 2026-09-05 — CE QUE LA FUSION DÉFAIT, PAS SEULEMENT CE QU'ELLE AJOUTE.
   * Relecture R2 (sonde R2-A): le plat de samedi remplacé poulet→tofu laissait
   * `prep_chicken` dans les casseroles ET dans la session de samedi (on cuit
   * un poulet que personne ne mange), et ses deux lignes de poulet aux
   * courses (on l'achète). L'élagage des orphelines vivait dans le parseur
   * seulement, jamais rejoué sur le plan fusionné.
   */
  readonly preparationsPruned: readonly string[];
  readonly sessionsDropped: number;
  readonly shoppingPruned: number;
  /**
   * Une ligne de courses présente des deux côtés, à des quantités qu'on n'a
   * PAS su additionner (« 8 œufs » et « 1 œuf », « 500 g » et « 1 kg »). On
   * garde la base et on COMPTE: un compteur à zéro qui ment est pire qu'un
   * compteur absent.
   *
   * ⟳ 2026-09-09 — CE N'EST PLUS « toute différence ». Voir `shoppingSummed`.
   */
  readonly shoppingConflicts: number;
  /**
   * ⟳ 2026-09-09 — LES LIGNES ADDITIONNÉES, ET LE DÉFAUT QU'ELLES FERMENT.
   *
   * Rapporté sur un plan réel (poul, brouillon du 2026-09-08): la relance des
   * créneaux vides ajoutait un poulet rôti du mercredi (450 g de cuisses), la
   * base avait déjà « cuisses de poulet désossées 400 g » pour vendredi. Même
   * terme ⇒ la base restait, l'écart se comptait, et la liste disait 400 g
   * pour 850 g nécessaires. Une relance AJOUTE des plats: ses courses
   * s'ajoutent aussi.
   *
   * On n'additionne que ce qui se lit sans convention (`readQuantityFromProse`:
   * `g`, `ml`, ou un nombre nu) et dans la MÊME unité. Le reste garde la base et
   * compte en conflit, comme avant.
   */
  readonly shoppingSummed: number;
}

/**
 * LA QUANTITÉ D'UNE LIGNE PRÉSENTE DES DEUX CÔTÉS — additionnée quand elle se lit.
 *
 * ⛔ AUCUNE CONVENTION: pas de « kg → g », pas de « 1 bouquet + 1 bouquet ».
 * `readQuantityFromProse` lit `g`, `ml` et le nombre nu, et rien d'autre; deux
 * unités différentes ne s'additionnent pas. `null` = on ne sait pas, la base
 * reste, et l'appelant compte un conflit si les textes diffèrent.
 *
 * ⚠️ LE NOMBRE NU S'ÉCRIT SANS UNITÉ (« 2 » + « 3 » ⇒ « 5 »): c'est la forme
 * d'origine, et y coller un mot inventerait un article.
 */
export function summedShoppingQuantity(
  base: string | null | undefined,
  added: string | null | undefined,
): string | null {
  const a = readQuantityFromProse(base ?? null);
  const b = readQuantityFromProse(added ?? null);
  if (!a || !b || a.unit !== b.unit) return null;
  const total = Math.round((a.amount + b.amount) * 10) / 10;
  return a.unit === "unit" ? String(total) : `${total} ${a.unit}`;
}

const cellKey = (d: { day: string | null; slot: string | null }): string =>
  `${d.day ?? ""}/${d.slot ?? ""}`;

/** Par cellule, COMBIEN de bouches y manquent. */
function missingByCell(delivered: MealsDelivered): Map<string, number> {
  const out = new Map<string, number>();
  for (const mouth of delivered.mouths) {
    for (const m of mouth.missing) {
      const key = `${m.day}/${m.slot}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

function samePreparation(a: MealPreparation, b: MealPreparation): boolean {
  // ⟳ 2026-09-05 — LE JOUR DE CUISSON ET LE NOMBRE DE PARTS FONT PARTIE DE
  // L'IDENTITÉ. Sonde R2-E: la relance cuisait ses lentilles SAMEDI pour le
  // dîner de samedi; la base avait la même fiche cuite DIMANCHE. Réutilisée
  // sans regarder le jour: mangée samedi, cuite dimanche, et tirée à 1 200 g
  // sur une fiche de 500 g — sans qu'aucun compteur ne le voie, parce que
  // ces gardes vivent dans le parseur. Deux fiches au même contenu mais pas
  // au même jour sont deux casseroles.
  const norm = (p: MealPreparation) =>
    JSON.stringify({
      t: p.title,
      m: p.method,
      c: p.cookOn,
      s: p.servingsMade,
      i: p.ingredients.map((x) => [x.term, x.quantity, x.amount, x.unit, x.state]),
    });
  return norm(a) === norm(b);
}

/**
 * Prend à `retry` les cellules que `before` donnait manquantes et que `after`
 * donne nourries. Rend le plan de base quand il n'y en a aucune (`cells: []`).
 */
export function mergeRetryByCell(args: {
  base: GeneratedMeal;
  retry: GeneratedMeal;
  before: MealsDelivered;
  after: MealsDelivered;
}): MergeOutcome {
  // ⟳ 2026-09-06 — UNE CELLULE OÙ MOINS DE BOUCHES MANQUENT EST PRISE, même si
  // quelqu'un y manque encore. Mesuré (FD2): le lundi soir manquait à QUATRE
  // (aucun plat) ; la relance l'a composé avec la végane retirée d'un plat au
  // poulet — trois nourris sur quatre, et la fusion exigeait zéro manquant :
  // rien pris, lundi soir toujours vide pour tout le monde. Le reste de la
  // boucle (relogement, tour suivant, dernier recours) s'occupe du quatrième.
  const before = missingByCell(args.before);
  const after = missingByCell(args.after);
  const retryCells = new Set(args.retry.dishes.map(cellKey));
  const cells = [...before.entries()]
    .filter(([c, n]) => retryCells.has(c) && (after.get(c) ?? 0) < n)
    .map(([c]) => c)
    .sort();
  return mergeRetryCells({ base: args.base, retry: args.retry, cells });
}

/**
 * ⟳ 2026-09-06 — LA FUSION PAR CELLULES, SANS L'INVARIANT. La lane solo n'a pas
 * de `mealsDelivered`; ses trous sont `empty_slots`. Les cellules à prendre lui
 * sont données telles quelles. Même contrat: pur, casseroles importées,
 * sessions, courses, élagage de ce qui est remplacé.
 */
export function mergeRetryCells(args: {
  base: GeneratedMeal;
  retry: GeneratedMeal;
  cells: readonly string[];
}): MergeOutcome {
  const retryCells = new Set(args.retry.dishes.map(cellKey));
  const cells = [...new Set(args.cells)].filter((c) => retryCells.has(c)).sort();
  if (cells.length === 0) {
    return {
      meal: args.base,
      cells: [],
      importedPreparations: [],
      renamed: {},
      shoppingAdded: 0,
      sessionsImported: 0,
      preparationsPruned: [],
      sessionsDropped: 0,
      shoppingPruned: 0,
      shoppingConflicts: 0,
      shoppingSummed: 0,
    };
  }
  const taken = new Set(cells);
  const meal: GeneratedMeal = structuredClone(args.base);
  const retry: GeneratedMeal = structuredClone(args.retry);

  // ── LES PLATS: ceux de base sortent des cellules prises, ceux de la relance entrent ──
  const keptDishes = meal.dishes.filter((d) => !taken.has(cellKey(d)));
  const importedDishes: GeneratedDish[] = retry.dishes.filter((d) => taken.has(cellKey(d)));

  // ── LES CASSEROLES CITÉES: réutilisées, importées, ou renommées ──────────
  const baseById = new Map(meal.preparations.map((p) => [p.id, p]));
  const retryById = new Map(retry.preparations.map((p) => [p.id, p]));
  const renamed: Record<string, string> = {};
  const importedPreparations: string[] = [];
  const cited = new Set<string>();
  for (const d of importedDishes) {
    for (const u of d.uses) cited.add(u.preparationId);
    for (const b of d.boxes) for (const it of b.items) if (it.preparationId) cited.add(it.preparationId);
  }
  const nameFor = (id: string): string => {
    const src = retryById.get(id);
    if (!src) return id; // citation inconnue: le parseur l'a déjà constatée sur la relance
    const existing = baseById.get(id);
    if (existing && samePreparation(existing, src)) return id;
    if (!existing) return id;
    let candidate = `${id}__r`;
    let n = 2;
    while (baseById.has(candidate) || retryById.has(candidate)) candidate = `${id}__r${n++}`;
    return candidate;
  };
  for (const id of cited) {
    const src = retryById.get(id);
    if (!src) continue;
    const target = nameFor(id);
    if (target !== id) renamed[id] = target;
    if (baseById.has(target)) continue; // même id, même contenu: réutilisée
    const copy: MealPreparation = { ...src, id: target };
    meal.preparations.push(copy);
    baseById.set(target, copy);
    importedPreparations.push(target);
  }
  for (const d of importedDishes) {
    for (const u of d.uses) if (renamed[u.preparationId]) u.preparationId = renamed[u.preparationId];
    for (const b of d.boxes) for (const it of b.items) if (it.preparationId && renamed[it.preparationId]) it.preparationId = renamed[it.preparationId];
  }
  meal.dishes = [...keptDishes, ...importedDishes];

  // ── LES CASSEROLES QU'AUCUN PLAT NE CITE PLUS SORTENT, ET DE LEUR SESSION ──
  // (R2-A). Après l'import: les casseroles importées sont citées, celles du
  // plat remplacé ne le sont plus par personne.
  const citedAll = new Set<string>();
  for (const d of meal.dishes) {
    for (const u of d.uses) citedAll.add(u.preparationId);
    for (const b of d.boxes) for (const it of b.items) if (it.preparationId) citedAll.add(it.preparationId);
  }
  const preparationsPruned = meal.preparations
    .filter((p) => !citedAll.has(p.id))
    .map((p) => p.id);
  if (preparationsPruned.length > 0) {
    const gone = new Set(preparationsPruned);
    meal.preparations = meal.preparations.filter((p) => !gone.has(p.id));
    for (const id of preparationsPruned) baseById.delete(id);
    for (const s of meal.cooking_sessions) {
      s.preparationIds = s.preparationIds.filter((id) => !gone.has(id));
    }
  }

  // ── LES SESSIONS: chaque casserole importée cuit quelque part ─────────────
  let sessionsImported = 0;
  for (const id of importedPreparations) {
    const prep = baseById.get(id)!;
    const day = prep.cookOn;
    if (!day) continue;
    let session: CookingSession | undefined = meal.cooking_sessions.find((s) => s.day === day);
    if (!session) {
      const fromRetry = retry.cooking_sessions.find((s) => s.day === day);
      session = fromRetry ? { ...fromRetry, preparationIds: [] } : { day, preparationIds: [], runThrough: "", totalMinutes: null } as CookingSession;
      meal.cooking_sessions.push(session);
      sessionsImported++;
    }
    if (!session.preparationIds.includes(id)) session.preparationIds.push(id);
  }
  // Une session qui ne cuit plus rien n'est pas une session.
  const sessionsBefore = meal.cooking_sessions.length;
  meal.cooking_sessions = meal.cooking_sessions.filter((s) => s.preparationIds.length > 0);
  const sessionsDropped = sessionsBefore - meal.cooking_sessions.length;

  // ── LES COURSES: les lignes de la relance que les plats importés réclament ──
  const claimed = new Set<string>();
  for (const d of importedDishes) for (const ing of d.ingredients) claimed.add(normalizePantryTerm(ing.term));
  for (const id of importedPreparations) for (const ing of baseById.get(id)!.ingredients) claimed.add(normalizePantryTerm(ing.term));
  const already = new Map(meal.shopping_list.map((l) => [normalizePantryTerm(l.term), l]));
  let shoppingAdded = 0;
  let shoppingConflicts = 0;
  let shoppingSummed = 0;
  for (const line of retry.shopping_list) {
    const key = normalizePantryTerm(line.term);
    if (!claimed.has(key)) continue;
    const present = already.get(key);
    if (present) {
      // ⟳ 2026-09-09 — MÊME INGRÉDIENT DES DEUX CÔTÉS: la relance AJOUTE des
      // plats, donc ses quantités s'AJOUTENT quand elles se lisent. Mesuré:
      // 400 g gardés pour 850 g nécessaires. Sinon la base reste et l'écart
      // se compte, comme avant.
      const summed = summedShoppingQuantity(present.quantity, line.quantity);
      if (summed !== null) {
        present.quantity = summed;
        shoppingSummed++;
      } else if (String(present.quantity ?? "").trim() !== String(line.quantity ?? "").trim()) {
        shoppingConflicts++;
      }
      continue;
    }
    meal.shopping_list.push(line as ShoppingItem);
    already.set(key, line as ShoppingItem);
    shoppingAdded++;
  }
  // ── LES LIGNES QUE PLUS AUCUN PLAT NI CASSEROLE NE RÉCLAME SORTENT (R2-A) ──
  // La même règle que le parseur (« bought for a dish that is not in the
  // plan »), rejouée sur le plan FUSIONNÉ: le poulet du plat remplacé n'est
  // plus à acheter.
  const claimedAll = new Set<string>();
  for (const d of meal.dishes) for (const ing of d.ingredients) claimedAll.add(normalizePantryTerm(ing.term));
  for (const p of meal.preparations) for (const ing of p.ingredients) claimedAll.add(normalizePantryTerm(ing.term));
  const shoppingBefore = meal.shopping_list.length;
  meal.shopping_list = meal.shopping_list.filter((l) => claimedAll.has(normalizePantryTerm(l.term)));
  const shoppingPruned = shoppingBefore - meal.shopping_list.length;
  return {
    meal,
    cells,
    importedPreparations,
    renamed,
    shoppingAdded,
    sessionsImported,
    preparationsPruned,
    sessionsDropped,
    shoppingPruned,
    shoppingConflicts,
    shoppingSummed,
  };
}

/**
 * LES CASES ENCORE VIDES APRÈS UNE FUSION — 2026-09-06.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QU'ELLE EXISTE POUR EMPÊCHER, ET C'EST MESURÉ.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `mergeRetryCells` est PUR et ne connaît que des plats, des casseroles, des
 * sessions et des courses. `empty_slots` est un constat du PARSEUR sur le
 * PREMIER tour: la fusion n'a aucune raison de le recalculer, et ce n'est pas
 * à elle de le faire. C'est donc à la lane de retirer les cases qu'elle vient
 * de reprendre — et la lane foyer l'oubliait sur ses QUATRE points de fusion
 * pendant que la lane solo le faisait à la main sur le sien.
 *
 * Run réel `4d5bb72d-6d01-4ce1-83d4-3917032e1284` (foyer de trois, cinq
 * jours): la relance a repris NEUF cellules, `meals_delivered` a rendu
 * « fed: 60, missing: 0 », et l'explication du plan annonçait quand même
 * « 9 repas n'ont pas été composés, sur mardi, mercredi, jeudi et vendredi ».
 * Le compte et les jours étaient exactement ceux des cellules reprises. Un
 * plan qui déclare vide une case qu'il vient de remplir est un fait faux que
 * la personne ne peut pas démentir: elle a le plat sous les yeux.
 *
 * ⛔ ON RETIRE, ON NE RECALCULE PAS. `cells` sont exactement les cellules qui
 * ont gagné un plat. Repasser par `emptySlotsIn` demanderait de lui redonner
 * le rythme, les absences, les prises fixes et le jour de cuisine — quatre
 * entrées à recopier sur cinq sites, et le risque d'INVENTER un trou que le
 * parseur n'avait pas vu.
 *
 * ⛔ ET ON NE VIDE PAS EN BLOC. Les cases que la relance n'a PAS comblées
 * restent des trous: les effacer remplacerait un fait faux par un silence, ce
 * qui est pire — la phrase « n repas n'ont pas été composés » est la seule
 * chose qui dise à la personne d'aller regarder.
 *
 * ⚠️ PURE: rend une nouvelle liste, ne touche pas celle qu'on lui donne.
 */
export function slotsStillEmpty<T extends { day: string; slot: string }>(
  slots: readonly T[],
  filledCells: readonly string[],
): T[] {
  if (filledCells.length === 0) return [...slots];
  const filled = new Set(filledCells);
  return slots.filter((c) => !filled.has(`${c.day}/${c.slot}`));
}

/** La consigne de relance des cases vides (solo): ne rendre QUE ces repas. */
export function emptySlotsRetryInstruction(
  cases: readonly { readonly day: string; readonly slot: string }[],
): string | null {
  const cells = [...new Set(cases.map((c) => `${c.day} ${c.slot}`))];
  if (cells.length === 0) return null;
  return [
    "⛔ SOME MEALS ARE MISSING FROM THE PLAN. These day/slot cells have no dish at all:",
    ...cells.map((c) => `- ${c}`),
    "Write them now. RETURN ONLY THESE MEALS, in the same JSON shape:",
    "- \"dishes\" holds ONLY the dishes of these cells;",
    "- \"preparations\" holds ONLY what they cite, as FULL recipes (title, method,",
    "  ingredients with quantities, cook_on);",
    "- \"cooking_sessions\" and \"shopping_list\" hold only what these need.",
    "Do NOT rewrite the other meals, do NOT shorten the plan, and do NOT mention",
    "any of this in a \"why\".",
  ].join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-08 — LA CASSEROLE PARTAGÉE, DÉFOURCHÉE APRÈS UNE RÉPARATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ ET JAMAIS COMPTÉ ───────────────────────────────────
 * `plan-L6-20260907-204913.json`, une seule bouche: `prep_chicken`,
 * `prep_rice`, `prep_chicken__r`, `prep_rice__r`. Le déjeuner cite la paire
 * `__r`, le dîner garde les originales, et la session du lundi **cuit les
 * quatre**. Une personne, deux poulets rôtis, deux casseroles de riz.
 *
 * La cause est `nameFor` juste au-dessus, et son raisonnement est juste: une
 * casserole qui revient sous le MÊME id avec un AUTRE contenu ne peut pas
 * écraser l'originale, puisque des plats non réparés la citent encore. Elle est
 * donc renommée et importée à côté.
 *
 * ⛔ MAIS UNE CASSEROLE `REWORKABLE` EST PRÉCISÉMENT CELLE DONT ON A VÉRIFIÉ
 * QUE **TOUS** SES MANGEURS VONT DANS LE MÊME SENS (`repairabilityOf`). Sa
 * version réécrite vaut pour eux tous: la dupliquer fait cuire deux fois ce
 * qu'on a demandé de réécrire une fois. Une casserole `frozen`, elle, reste
 * fourchée — et c'est ce que le compteur `pot_forked` doit rendre visible,
 * parce qu'à ce moment-là le modèle a touché ce qu'on lui avait interdit.
 *
 * ⚠️ APPELÉ APRÈS `mergeRetryCells`, PAS DEDANS. La fusion ne sait pas quelles
 * unités étaient réparables — c'est une décision du dimensionnement, prise
 * avant l'appel modèle. Trois autres appelants (bouches non nourries, échange,
 * séparation de préférence) n'ont pas de notion de réparabilité et ne doivent
 * pas en recevoir une par défaut.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function unforkReworkedPots(
  outcome: MergeOutcome,
  reworkable: ReadonlySet<string>,
): { meal: GeneratedMeal; unforked: string[]; forked: string[] } {
  const meal = outcome.meal;
  const unforked: string[] = [];
  const forked: string[] = [];
  for (const [ancien, neuf] of Object.entries(outcome.renamed)) {
    if (!reworkable.has(ancien)) {
      forked.push(ancien);
      continue;
    }
    unforked.push(ancien);
    // ⛔ ON GARDE LA VERSION RÉÉCRITE (`neuf`) ET ON LUI REND SON NOM. L'inverse
    // — garder l'ancienne — jetterait la réparation qu'on vient de demander.
    const reecrite = meal.preparations.find((p) => p.id === neuf);
    if (!reecrite) continue;
    meal.preparations = meal.preparations.filter((p) => p.id !== ancien);
    reecrite.id = ancien;
    for (const d of meal.dishes) {
      for (const u of d.uses) if (u.preparationId === neuf) u.preparationId = ancien;
      for (const b of d.boxes) {
        for (const it of b.items) if (it.preparationId === neuf) it.preparationId = ancien;
      }
    }
    for (const s of meal.cooking_sessions) {
      // ⚠️ DÉDOUBLONNÉ, PAS SEULEMENT RENOMMÉ. La session porte souvent les
      // DEUX ids (l'originale y était, la réécrite y a été ajoutée à
      // l'import): les renommer tous les deux laisserait `prep_rice` deux fois
      // dans la même session, et la liste de cuisine le dirait.
      s.preparationIds = [
        ...new Set(s.preparationIds.map((id) => (id === neuf ? ancien : id))),
      ];
    }
  }
  // Une session qui ne cuit plus rien n'est pas une session — même règle que la
  // fusion, rejouée parce qu'on vient de retirer des casseroles.
  meal.cooking_sessions = meal.cooking_sessions.filter((s) => s.preparationIds.length > 0);
  return { meal, unforked, forked };
}


/**
 * N'IMPORTER QUE LES PLATS AJOUTÉS — jamais la case entière.
 *
 * ⛔ MESURÉ AU TIR CATCH3 (2026-09-08). L'entrée de dernier recours demande
 * « ajoute UN plat au nom de X, et rien d'autre ne change ». Le modèle a ajouté
 * les plats demandés, au bon nom — et a rendu la case SANS le plat dédié qui y
 * était (celui de la végane). `mergeRetryCells` importe la case entière : la
 * fusionner aurait retiré son plat à quelqu'un pour en donner un à un autre.
 *
 * ⚠️ « RIEN D'AUTRE NE CHANGE » EST GARANTI ICI, PAR CONSTRUCTION. On prend
 * dans la relance les seuls plats dont le porteur est un porteur AJOUTÉ, dans
 * une case demandée ; la table et les dédiés existants sont ceux de la base,
 * octet pour octet. Ce que le modèle a fait du reste ne compte pas.
 *
 * ⛔ AUCUNE CASSEROLE N'ENTRE. La consigne dit « small and rich, beside the
 * shared dish » ; un plat ajouté qui cite une casserole est une relance qui a
 * changé la cuisine, et il est REFUSÉ (`rejected_citing_pot`). Les autres
 * plats ajoutés de la même relance entrent quand même : ils sont indépendants.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function appendDedicatedDishes(args: {
  base: GeneratedMeal;
  retry: GeneratedMeal;
  /**
   * Les (case, porteur) DEMANDÉS — une paire par plat attendu.
   *
   * ⛔ PAS deux listes séparées. Mesuré au tir CATCH5 : 2 porteurs × 2 cases
   * = 4 paires comptées « manquantes » alors que 2 plats seulement étaient
   * demandés (`missing: 3` pour `asked: 2`). Un compteur qui compte le produit
   * cartésien ment sur ce qu'on attendait.
   */
  asks: readonly { cell: string; memberId: string }[];
}): {
  meal: GeneratedMeal;
  added: { cell: string; memberId: string }[];
  rejected_citing_pot: number;
  missing: { cell: string; memberId: string }[];
  /** Les lignes de courses de la relance reprises pour les plats ajoutés. */
  shopping_added: number;
} {
  const meal: GeneratedMeal = structuredClone(args.base);
  const wanted = new Set(args.asks.map((a) => `${a.cell} ${a.memberId}`));
  const cells = new Set(args.asks.map((a) => a.cell));
  const bearers = new Set(args.asks.map((a) => a.memberId));
  const added: { cell: string; memberId: string }[] = [];
  let rejectedCitingPot = 0;
  const seen = new Set<string>();
  const claimed = new Set<string>();
  for (const d of args.retry.dishes) {
    const cell = `${d.day ?? ""}/${d.slot ?? ""}`;
    const owner = d.memberId ?? null;
    if (owner === null || !bearers.has(owner) || !cells.has(cell)) continue;
    const key = `${cell} ${owner}`;
    // ⛔ SEULEMENT LA PAIRE DEMANDÉE : un porteur demandé au déjeuner qui
    // revient aussi au dîner n'entre pas au dîner.
    if (!wanted.has(key) || seen.has(key)) continue;
    if ((d.uses ?? []).length > 0) {
      rejectedCitingPot++;
      continue;
    }
    seen.add(key);
    // ⟳ 2026-09-09 — UN COMPLÉMENT, PAS UN REMPLACEMENT : c'est ICI, et
    // seulement ici, que le drapeau s'écrit. Le porteur garde le plat de la
    // table ; le moteur partage son assiette entre les deux.
    meal.dishes.push({ ...structuredClone(d), complementsShared: true });
    for (const ing of d.ingredients) claimed.add(normalizePantryTerm(ing.term));
    added.push({ cell, memberId: owner });
  }
  // ⟳ 2026-09-09 — L'ENTRÉE S'ACHÈTE. Même règle que `spliceReworkableUnits` :
  // une ligne de la relance dont le terme est réclamé par un plat ajouté et
  // manque à la base entre ; rien d'autre n'est lu. Sans ça, le pain-fromage
  // ajouté n'était sur aucune liste (`lines_unattributed`).
  let shoppingAdded = 0;
  const already = new Set(meal.shopping_list.map((l) => normalizePantryTerm(l.term)));
  for (const line of args.retry.shopping_list) {
    const key = normalizePantryTerm(line.term);
    if (!claimed.has(key) || already.has(key)) continue;
    meal.shopping_list.push(structuredClone(line) as ShoppingItem);
    already.add(key);
    shoppingAdded++;
  }
  const missing: { cell: string; memberId: string }[] = [];
  for (const a of args.asks) {
    if (!seen.has(`${a.cell} ${a.memberId}`)) missing.push({ cell: a.cell, memberId: a.memberId });
  }
  return { meal, added, rejected_citing_pot: rejectedCitingPot, missing, shopping_added: shoppingAdded };
}

/**
 * NE LIRE DANS LA RELANCE QUE LES UNITÉS QU'ON A AUTORISÉ À RÉÉCRIRE.
 *
 * ⟳ 2026-09-08 — DÉCISION DU PROPRIÉTAIRE : « si c'est nous qui donnons les
 * instructions, pourquoi il change les plats si on sait d'avance ce qu'il peut
 * changer ? Ça devrait être envoyé comme contexte, pas comme quelque chose sur
 * quoi influer. » Le modèle VOIT tout le plat (il en a besoin pour raisonner) ;
 * on ne LIT dans sa réponse que le frais et les casseroles marquées
 * réécrivables, par identifiant. Tout le reste vient de la base, octet pour
 * octet : casseroles gelées, autres plats, sessions.
 *
 * ⛔ CE QUE ÇA REND INUTILE. Mesuré sur quatre tirs : le modèle réécrit les
 * casseroles gelées quatre fois sur quatre. Avec une fusion de case entière, il
 * fallait le détecter et refuser (`frozen_rewritten`), défourcher
 * (`unforkReworkedPots`), vérifier que les plats dédiés revenaient
 * (`dedicated_lost`), que les casseroles citées existaient (`missing_pot`).
 * Ici, une casserole gelée réécrite n'est simplement jamais lue.
 *
 * ⚠️ LA CASSEROLE RÉÉCRITE GARDE SON `id` ET SON `servingsMade` : seuls ses
 * ingrédients changent. Les plats qui la tirent continuent de la tirer ; il
 * n'y a rien à renommer, donc rien à défourcher.
 *
 * Courses : une ligne de la relance dont le terme appartient à une unité
 * épissée et manque à la base est ajoutée ; les lignes qui ne sont plus
 * réclamées par aucun plat ni casserole sont retirées. Même règle que la
 * fusion de case, restreinte aux unités lues.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ UN TITRE NE VOYAGE JAMAIS SANS SES CASSEROLES — 2026-09-11, lot E
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, ENREGISTRÉ EN BASE ───────────────────────────────────────
 * Cette fonction appariait le plat de la relance PAR CASE (jour/moment +
 * porteur), puis copiait `ingredients`, `title` et `method` — et ne regardait
 * JAMAIS `base.uses`. Quand le modèle intervertit deux cases (mesuré sur le
 * plan GAIN `a18f522e`, premier appel : samedi midi et samedi soir échangés),
 * la case recevait le titre de l'un pendant que ses `uses` pointaient encore
 * les casseroles de l'autre. Ce qui a été écrit, et servi :
 *
 *   · samedi déjeuner — « Saumon avec couscous, légumes rôtis et amandes »,
 *     liens vers `prep_lentil_ratatouille` + `prep_couscous`. **Aucun saumon.**
 *   · samedi dîner — « Lentilles, couscous, feta, amandes et pain », liens vers
 *     `prep_salmon` + `prep_couscous` + `prep_roasted_vegetables`.
 *
 * La garde d'identité (`repairIdentityHeld`) tolérait ces changements parce
 * qu'une proportion suffisante des ingrédients FRAIS subsistait : elle ne
 * regarde pas ce que le plat PUISE.
 *
 * ── LE CORRECTIF, ET SA LIMITE EXACTE ───────────────────────────────────
 * L'identité est vérifiée AVANT de coller : si le plat rendu pour cette case
 * cite un ensemble de casseroles différent de celui de la base, le frais n'est
 * pas épissé et le motif est nommé (`uses_mismatch`).
 *
 * ⚠️ LES CASSEROLES, ELLES, RESTENT ÉPISSABLES — et ce n'est pas une demi-
 * mesure. Une casserole est appariée par son `id`, qui est stable : il n'y a
 * aucune confusion d'identité possible sur ce chemin-là, et l'enquête a mesuré
 * qu'une modification de casserole partagée AMÉLIORE des assiettes dont la
 * réécriture directe a été refusée (§3, deuxième appel GAIN). Refuser les
 * casseroles avec le frais jetterait ce gain-là sans rien réparer de plus.
 *
 * ⚠️ ON COMPARE UN ENSEMBLE D'IDENTIFIANTS, PAS LES `servings`. Un modèle qui
 * change le nombre de parts tirées d'une casserole qu'il garde n'a pas changé
 * d'assiette ; il a changé une quantité, ce que la relance demande précisément.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/** L'ensemble des casseroles qu'un plat puise, en clé comparable. */
function usesKeyOf(dish: { uses?: readonly { preparationId?: string | null }[] | null }): string {
  const ids = new Set<string>();
  for (const u of dish.uses ?? []) {
    const id = String(u?.preparationId ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids].sort().join("|");
}

export function spliceReworkableUnits(args: {
  base: GeneratedMeal;
  retry: GeneratedMeal;
  asks: readonly {
    /** Index du plat dans `base.dishes`. */
    dishIndex: number;
    freshReworkable: boolean;
    reworkablePotIds: readonly string[];
  }[];
}): {
  meal: GeneratedMeal;
  dishesSpliced: number[];
  counts: {
    fresh_spliced: number;
    pots_spliced: number;
    dish_missing: number;
    pot_missing: number;
    shopping_added: number;
    shopping_pruned: number;
    /**
     * ⛔ LES CASES REFUSÉES PARCE QUE LE PLAT RENDU PUISE AILLEURS. Non nul, il
     * dit que le modèle a déplacé un plat d'une case à l'autre — et que le
     * titre n'a pas suivi les mauvaises casseroles.
     */
    uses_mismatch: number;
    /**
     * ⟳ 2026-09-11 · LOT E — LES `density_check` INVALIDÉS PAR CETTE FUSION.
     *
     * ⛔ « Une modification de recette, préparation, quantité ou attribution
     * invalide sa mesure précédente » (chantier §2). La fusion ne le faisait
     * pas: une déclaration du PREMIER JET restait attachée à une recette
     * remaniée, et comparer ce champ final à la mesure finale n'évaluait donc
     * pas la dernière réponse du modèle (enquête §3, dernier paragraphe).
     */
    density_checks_cleared: number;
  };
} {
  const meal: GeneratedMeal = structuredClone(args.base);
  const counts = {
    fresh_spliced: 0,
    pots_spliced: 0,
    dish_missing: 0,
    pot_missing: 0,
    shopping_added: 0,
    shopping_pruned: 0,
    uses_mismatch: 0,
    density_checks_cleared: 0,
  };
  const dishesSpliced: number[] = [];
  const claimed = new Set<string>();
  const retryPotById = new Map(args.retry.preparations.map((p) => [String(p.id), p]));
  const potsDone = new Set<string>();
  for (const ask of args.asks) {
    const base = meal.dishes[ask.dishIndex];
    if (!base) continue;
    const cell = `${base.day ?? ""}/${base.slot ?? ""}`;
    const owner = base.memberId ?? null;
    // MÊME APPARIEMENT QUE LA GARDE D'IDENTITÉ : la case ET le porteur.
    const back = args.retry.dishes.find((d) =>
      `${d.day ?? ""}/${d.slot ?? ""}` === cell && (d.memberId ?? null) === owner
    ) ?? args.retry.dishes.find((d) => `${d.day ?? ""}/${d.slot ?? ""}` === cell && owner === null);
    let touched = false;
    if (ask.freshReworkable) {
      if (!back) counts.dish_missing++;
      // ⛔ L'IDENTITÉ SE VÉRIFIE AVANT DE COLLER. Voir le pavé de tête: c'est
      // ce test qui empêche « Saumon avec couscous » de se poser sur des
      // lentilles. Le plat rendu doit puiser les MÊMES casseroles que la base.
      else if (usesKeyOf(back) !== usesKeyOf(base)) counts.uses_mismatch++;
      else {
        base.ingredients = structuredClone(back.ingredients);
        if (String(back.title ?? "").trim()) base.title = back.title;
        if (String(back.method ?? "").trim()) base.method = back.method;
        for (const ing of base.ingredients) claimed.add(normalizePantryTerm(ing.term));
        counts.fresh_spliced++;
        touched = true;
      }
    }
    for (const id of ask.reworkablePotIds) {
      if (potsDone.has(id)) { touched = true; continue; }
      const fresh = retryPotById.get(id);
      const target = meal.preparations.find((p) => String(p.id) === id);
      if (!fresh || !target) { counts.pot_missing++; continue; }
      target.ingredients = structuredClone(fresh.ingredients);
      for (const ing of target.ingredients) claimed.add(normalizePantryTerm(ing.term));
      potsDone.add(id);
      counts.pots_spliced++;
      touched = true;
    }
    if (touched) dishesSpliced.push(ask.dishIndex);
  }
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT E — `density_check` MEURT AVEC LA RECETTE QU'IL DÉCRIT
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ TOUS LES PLATS TOUCHÉS, PAS SEULEMENT LES CASES ÉPISSÉES. Une casserole
  // réécrite est tirée par plusieurs assiettes: celle qu'on a demandée, et
  // toutes les autres. Ne nettoyer que la case demandée laisserait la
  // déclaration du premier jet sur les voisines — exactement le mode d'échec
  // que ce champ a produit (enquête §3).
  {
    const spliced = new Set(dishesSpliced);
    for (const [i, dish] of meal.dishes.entries()) {
      // ⚠️ `typeof … !== "number"` ET PAS `=== null`: un plat d'archive ou de
      // fixture peut ne pas porter le champ du tout, et « rien à invalider » ne
      // doit pas se compter comme une invalidation.
      if (typeof dish.densityCheck !== "number") continue;
      const own = spliced.has(i);
      const pot = (dish.uses ?? []).some((u) => potsDone.has(String(u?.preparationId ?? "")));
      if (!own && !pot) continue;
      dish.densityCheck = null;
      counts.density_checks_cleared++;
    }
  }
  const already = new Map(meal.shopping_list.map((l) => [normalizePantryTerm(l.term), l]));
  for (const line of args.retry.shopping_list) {
    const key = normalizePantryTerm(line.term);
    if (!claimed.has(key) || already.has(key)) continue;
    meal.shopping_list.push(line as ShoppingItem);
    already.set(key, line as ShoppingItem);
    counts.shopping_added++;
  }
  const claimedAll = new Set<string>();
  for (const d of meal.dishes) for (const ing of d.ingredients) claimedAll.add(normalizePantryTerm(ing.term));
  for (const p of meal.preparations) for (const ing of p.ingredients) claimedAll.add(normalizePantryTerm(ing.term));
  const before = meal.shopping_list.length;
  meal.shopping_list = meal.shopping_list.filter((l) => claimedAll.has(normalizePantryTerm(l.term)));
  counts.shopping_pruned = before - meal.shopping_list.length;
  return { meal, dishesSpliced, counts };
}
