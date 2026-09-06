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
   * Une ligne de courses présente des deux côtés à des quantités différentes
   * (le plat importé veut 1 kg de riz, la base en a 500 g). On garde la base
   * et on COMPTE: requantifier demanderait le modèle de quantités du
   * parseur, et un compteur à zéro qui ment est pire qu'un compteur absent.
   */
  readonly shoppingConflicts: number;
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
  for (const line of retry.shopping_list) {
    const key = normalizePantryTerm(line.term);
    if (!claimed.has(key)) continue;
    const present = already.get(key);
    if (present) {
      // Même ingrédient, deux quantités: la base reste, l'écart se compte.
      if (String(present.quantity ?? "").trim() !== String(line.quantity ?? "").trim()) shoppingConflicts++;
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
  };
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
