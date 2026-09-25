import { boxLidLabel, eatersLabelFor } from "../../lib/mealBoxes";
import { dishDayLabel, dishSlotLabel } from "../../api/mealLabels";
import type { MessageKey } from "../../i18n/t";
import { t } from "../../i18n/t";

// LA DÉMONSTRATION DU PLAN, SUR `/` — LES DONNÉES, SANS REACT.
//
// ── CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS ────────────────────────────────
// Un plan FICTIF, MINIMAL: une personne, deux jours, une session de cuisine.
// Écrit à la main pour être rendu par une copie fidèle des composants du
// produit (`PlanGrid`, `PlanDayBlock`, `BoxTable`). Le brief du 2026-09-08 est
// explicite: « le planning montré doit être fidèle à la plateforme »; on peut
// SIMPLIFIER pour la landing, on ne peut pas INVENTER une autre interface.
//
// ⚠️ RÉDUIT LE 2026-09-08 (même jour): la première version faisait trois
// personnes sur quatre jours, quatorze articles et douze contenants — jugée
// « vraiment énorme ». Une landing montre le MÉCANISME, pas une semaine
// entière. Deux jours suffisent à lire courses → cuisine → repas.
//
// Ce n'est pas une `GeneratedDish[]` du moteur — on n'a pas de plan réel
// anonymisé à montrer, et une génération vivante sur une page publique
// coûterait un appel de modèle par visiteur. C'est un modèle PARALLÈLE, qui
// garde les mêmes objets: une vague de courses, une session avec ses
// préparations, des plats qui PRÉLÈVENT sur ces préparations (`uses`), et des
// contenants dont le couvercle est construit par LA fonction du produit
// (`boxLidLabel`). Le test d'à côté vérifie que ces liens tiennent.
//
// ── LE SEUL LEVIER DU VISITEUR: SON OBJECTIF ───────────────────────────────
// Le sélecteur de la section 01 change les grammes (perte de poids ou prise de
// muscle). Ça ne calcule rien pour le visiteur — la page le dit.

export type DemoGoal = "fat_loss" | "muscle_gain";
export type DemoDay = "sun" | "mon";
export type DemoSlot = "lunch" | "dinner";
export type DemoMemberId = "you" | "alex" | "lou";
export type DemoAisle = "produce" | "protein" | "dairy" | "grains" | "pantry";

export const DEMO_DAYS: readonly DemoDay[] = ["sun", "mon"];
export const DEMO_SLOTS: readonly DemoSlot[] = ["lunch", "dinner"];
/** Les dates des colonnes de la grille (un dimanche, comme le produit sait en ouvrir). */
export const DEMO_DATES: Readonly<Record<DemoDay, string>> = {
  sun: "2026-09-13",
  mon: "2026-09-14",
};

export interface DemoMember {
  id: DemoMemberId;
  noteKey: MessageKey;
}

/**
 * Les trois bouches de la SECTION 04 (le foyer). Le plan de démonstration,
 * lui, n'en nourrit qu'une: « Toi ». Les prénoms ne se traduisent pas.
 */
export const DEMO_MEMBERS: readonly DemoMember[] = [
  { id: "you", noteKey: "home.demo.member.you_note" },
  { id: "alex", noteKey: "home.demo.member.alex_note" },
  { id: "lou", noteKey: "home.demo.member.lou_note" },
];

export function memberName(id: DemoMemberId): string {
  if (id === "you") return t("home.demo.you");
  return id === "alex" ? "Alex" : "Lou";
}

/**
 * Une quantité par objectif. ⚠️ LES COURSES SUIVENT L'OBJECTIF depuis le
 * 2026-09-23: le sélecteur du héros pilote toute la démonstration, et deux
 * boîtes de 190 g de poulet cuit ne sortent pas de 400 g de cru.
 */
export type DemoQuantity = Readonly<Record<DemoGoal, string>>;

function same(quantity: string): DemoQuantity {
  return { fat_loss: quantity, muscle_gain: quantity };
}

export interface DemoGrocery {
  id: string;
  aisle: DemoAisle;
  termKey: MessageKey;
  quantity: DemoQuantity;
  /** Les préparations que cet article sert. `[]` = un article d'assemblage. */
  prepIds: readonly string[];
  /** Les plats qu'il sert directement, sans passer par une casserole. */
  dishIds: readonly string[];
}

export interface DemoWave {
  buyOn: DemoDay;
  servesCookOn: DemoDay;
  itemIds: readonly string[];
}

/**
 * Le rôle de la casserole dans la boîte — le vocabulaire du produit
 * (`CULINARY_ROLES`, `culinary_structure.ts`). `main` = la préparation
 * principale, dont la composition est la même dans chaque boîte;
 * `separable_side` = le féculent cuit à part, qui se dose à part.
 */
export type DemoPrepRole = "main" | "separable_side";

export interface DemoPrep {
  id: string;
  titleKey: MessageKey;
  role: DemoPrepRole;
  servings: number;
  activeMinutes: number;
  totalMinutes: number;
  cookOn: DemoDay;
  ingredients: ReadonlyArray<{ termKey: MessageKey; quantity: DemoQuantity }>;
  methodKey: MessageKey;
}

export interface DemoSession {
  day: DemoDay;
  totalMinutes: number;
  runThroughKey: MessageKey;
  prepIds: readonly string[];
}

export interface DemoBoxItem {
  termKey: MessageKey;
  /** La casserole d'où vient la ligne: une boîte = la principale + le féculent à côté. */
  prepId: string;
  grams: Readonly<Record<DemoGoal, number>>;
}

export interface DemoDish {
  id: string;
  day: DemoDay;
  slot: DemoSlot;
  titleKey: MessageKey;
  /** Les préparations sur lesquelles le plat prélève (`dish.uses` du produit). */
  prepIds: readonly string[];
  sameDay: { kind: "reheat_only" | "assemble" | "cook_fresh"; minutes: number } | null;
  /** Ce que le contenant tient, par objectif. `[]` = pas de boîte (cuisiné minute). */
  boxItems: readonly DemoBoxItem[];
  /** Le kcal du contenant, par objectif — la base est dite sous le Boxing. */
  kcal: Readonly<Record<DemoGoal, number>> | null;
}

// ── LES COURSES ──────────────────────────────────────────────────────────────
export const DEMO_GROCERIES: readonly DemoGrocery[] = [
  { id: "chicken_thighs", aisle: "protein", termKey: "home.demo.ing.chicken_thighs", quantity: { fat_loss: "400 g", muscle_gain: "500 g" }, prepIds: ["chicken"], dishIds: [] },
  { id: "peppers", aisle: "produce", termKey: "home.demo.ing.peppers", quantity: same("3"), prepIds: ["chicken"], dishIds: ["omelette"] },
  { id: "carrots", aisle: "produce", termKey: "home.demo.ing.carrots", quantity: { fat_loss: "300 g", muscle_gain: "450 g" }, prepIds: ["chicken"], dishIds: [] },
  { id: "lemons", aisle: "produce", termKey: "home.demo.ing.lemons", quantity: same("1"), prepIds: ["bulgur"], dishIds: [] },
  { id: "green_salad", aisle: "produce", termKey: "home.demo.ing.green_salad", quantity: same("1"), prepIds: [], dishIds: ["omelette"] },
  { id: "bulgur", aisle: "grains", termKey: "home.demo.ing.bulgur", quantity: { fat_loss: "120 g", muscle_gain: "190 g" }, prepIds: ["bulgur"], dishIds: [] },
  { id: "eggs", aisle: "dairy", termKey: "home.demo.ing.eggs", quantity: same("6"), prepIds: [], dishIds: ["omelette"] },
  { id: "smoked_paprika", aisle: "pantry", termKey: "home.demo.ing.smoked_paprika", quantity: same("1"), prepIds: ["chicken"], dishIds: [] },
];

/** Une seule vague: tout s'achète le dimanche, avant la session. */
export const DEMO_WAVES: readonly DemoWave[] = [
  {
    buyOn: "sun",
    servesCookOn: "sun",
    itemIds: ["chicken_thighs", "peppers", "carrots", "lemons", "green_salad", "bulgur", "eggs", "smoked_paprika"],
  },
];

// ── LES PRÉPARATIONS ET LA SESSION ───────────────────────────────────────────
export const DEMO_PREPS: readonly DemoPrep[] = [
  {
    id: "chicken",
    titleKey: "home.demo.prep.chicken",
    role: "main",
    servings: 2,
    activeMinutes: 15,
    totalMinutes: 50,
    cookOn: "sun",
    ingredients: [
      { termKey: "home.demo.ing.chicken_thighs", quantity: { fat_loss: "400 g", muscle_gain: "500 g" } },
      { termKey: "home.demo.ing.peppers", quantity: same("2") },
      { termKey: "home.demo.ing.carrots", quantity: { fat_loss: "300 g", muscle_gain: "450 g" } },
      { termKey: "home.demo.ing.smoked_paprika", quantity: same("10 g") },
    ],
    methodKey: "home.demo.prep.chicken_method",
  },
  {
    id: "bulgur",
    titleKey: "home.demo.prep.bulgur",
    role: "separable_side",
    servings: 2,
    activeMinutes: 5,
    totalMinutes: 20,
    cookOn: "sun",
    ingredients: [
      { termKey: "home.demo.ing.bulgur", quantity: { fat_loss: "120 g", muscle_gain: "190 g" } },
      { termKey: "home.demo.ing.lemons", quantity: same("1") },
    ],
    methodKey: "home.demo.prep.bulgur_method",
  },
];

export const DEMO_SESSIONS: readonly DemoSession[] = [
  { day: "sun", totalMinutes: 50, runThroughKey: "home.demo.run.sun", prepIds: ["chicken", "bulgur"] },
];

// ── LES PLATS ────────────────────────────────────────────────────────────────
// ── LA BOÎTE: LA CASSEROLE PRINCIPALE + LE FÉCULENT À CÔTÉ (2026-09-23) ──────
// Le modèle du chantier « féculent à côté » (lot C): le poulet et les légumes
// rôtissent ENSEMBLE, donc chaque boîte en reçoit la MÊME composition —
// 40 % de poulet, 60 % de légumes, quel que soit l'objectif. Seule la quantité
// de cette casserole bouge (elle suit le besoin en protéines), et le boulgour,
// cuit à part, porte le reste: c'est lui qui bouge le plus.
//
// ⚠️ D'OÙ « PLUS DE LÉGUMES » EN PRISE DE MUSCLE: 285 g contre 225. La version
// d'avant (220 → 200 g) changeait la recette de la plaque d'une boîte à l'autre,
// ce qu'une plaque cuite une fois ne sait pas faire. Le test d'à côté épingle
// la proportion.
//
// Les kcal viennent des grammes: poulet rôti ≈ 1,9 kcal/g, légumes rôtis à
// l'huile ≈ 0,6, boulgour au citron ≈ 1,0 → 560 et 750 (arrondis à 10).
const CHICKEN_BOWL_ITEMS: readonly DemoBoxItem[] = [
  { termKey: "home.demo.box.chicken", prepId: "chicken", grams: { fat_loss: 150, muscle_gain: 190 } },
  { termKey: "home.demo.box.vegetables", prepId: "chicken", grams: { fat_loss: 225, muscle_gain: 285 } },
  { termKey: "home.demo.box.bulgur", prepId: "bulgur", grams: { fat_loss: 140, muscle_gain: 220 } },
];

export const DEMO_DISHES: readonly DemoDish[] = [
  {
    id: "sun_dinner",
    day: "sun",
    slot: "dinner",
    titleKey: "home.demo.dish.chicken_bowl",
    prepIds: ["chicken", "bulgur"],
    sameDay: null,
    boxItems: CHICKEN_BOWL_ITEMS,
    kcal: { fat_loss: 560, muscle_gain: 750 },
  },
  {
    // ⚠️ LE MÊME TITRE QUE LE DÎNER DE LA VEILLE, ET C'EST LE POINT: ici
    // l'assiette est IDENTIQUE — mêmes casseroles, mêmes composants, mêmes
    // grammes, mêmes kcal. Lui donner un second nom laissait croire que la
    // préparation devient un autre plat le lendemain, ce que le brief du
    // 2026-09-08 interdit. Ce qui change d'un jour à l'autre est porté par le
    // produit: `sameDay` (« À réchauffer ») et la provenance (« Depuis … —
    // cuisiné Dimanche »).
    //
    // ⛔ N'EN DÉDUIS PAS « MÊME FOURNÉE ⇒ MÊME NOM ». Une casserole de riz
    // nourrit très bien « riz au tofu » et « riz au poulet », et deux plats
    // issus des mêmes casseroles peuvent porter deux noms justes quand les
    // proportions diffèrent. C'est l'assiette identique qui force le nom
    // commun, pas la casserole partagée — voir la garde du test.
    id: "mon_lunch",
    day: "mon",
    slot: "lunch",
    titleKey: "home.demo.dish.chicken_bowl",
    prepIds: ["chicken", "bulgur"],
    sameDay: { kind: "reheat_only", minutes: 5 },
    boxItems: CHICKEN_BOWL_ITEMS,
    kcal: { fat_loss: 560, muscle_gain: 750 },
  },
  {
    id: "omelette",
    day: "mon",
    slot: "dinner",
    titleKey: "home.demo.dish.omelette",
    prepIds: [],
    sameDay: { kind: "cook_fresh", minutes: 15 },
    boxItems: [],
    kcal: null,
  },
];

// ── LES LECTURES ─────────────────────────────────────────────────────────────

export function prepById(id: string): DemoPrep | undefined {
  return DEMO_PREPS.find((p) => p.id === id);
}

export function dishById(id: string): DemoDish | undefined {
  return DEMO_DISHES.find((d) => d.id === id);
}

export function sessionOn(day: DemoDay): DemoSession | null {
  return DEMO_SESSIONS.find((s) => s.day === day) ?? null;
}

export function waveOn(day: DemoDay): DemoWave | null {
  return DEMO_WAVES.find((w) => w.buyOn === day) ?? null;
}

export function groceriesOf(wave: DemoWave): DemoGrocery[] {
  const wanted = new Set(wave.itemIds);
  return DEMO_GROCERIES.filter((g) => wanted.has(g.id));
}

/** Les jours que cette préparation nourrit, dans l'ordre de la fenêtre (`daysFedBy`). */
export function daysFedByPrep(prepId: string): DemoDay[] {
  const days = new Set(
    DEMO_DISHES.filter((d) => d.prepIds.includes(prepId)).map((d) => d.day),
  );
  return DEMO_DAYS.filter((d) => days.has(d));
}

/** Le libellé « Dimanche Dîner » d'un repas, comme `mealLabelFor` du produit. */
export function mealLabel(day: DemoDay, slot: DemoSlot): string {
  return [dishDayLabel(day), dishSlotLabel(slot)]
    .filter((part): part is string => part !== null && part !== "")
    .join(" ");
}

/** Une ligne de boîte = ce qu'on prélève dans UNE casserole. */
export interface DemoBoxPart {
  prepId: string;
  role: DemoPrepRole;
  title: string;
  grams: number;
  /** Ce que la ligne contient, aliment par aliment: la répartition exacte. */
  items: ReadonlyArray<{ term: string; grams: number }>;
}

export interface DemoBoxLine {
  id: string;
  dishId: string;
  lid: string;
  items: ReadonlyArray<{ term: string; grams: number }>;
  /** Les mêmes grammes, rangés par casserole: la principale, puis le féculent à côté. */
  parts: readonly DemoBoxPart[];
  total: number;
  kcal: number | null;
}

/**
 * La boîte d'un plat, casserole par casserole — la principale d'abord, le
 * féculent à côté ensuite (lot C: « BoxTable rend une boîte à deux lignes »).
 */
export function boxPartsFor(dish: DemoDish, goal: DemoGoal): DemoBoxPart[] {
  const order: Record<DemoPrepRole, number> = { main: 0, separable_side: 1 };
  return dish.prepIds
    .map(prepById)
    .filter((prep): prep is DemoPrep => prep !== undefined)
    .sort((a, b) => order[a.role] - order[b.role])
    .map((prep) => {
      const items = dish.boxItems
        .filter((it) => it.prepId === prep.id)
        .map((it) => ({ term: t(it.termKey), grams: it.grams[goal] }));
      return {
        prepId: prep.id,
        role: prep.role,
        title: t(prep.titleKey),
        grams: items.reduce((sum, it) => sum + it.grams, 0),
        items,
      };
    })
    .filter((part) => part.items.length > 0);
}

/**
 * Un contenant par plat — le produit en fait un par GROUPE de bouches, et un
 * plan pour une personne n'a qu'un groupe. Le couvercle sort de `boxLidLabel`,
 * la fonction du produit.
 */
export function boxLinesForDish(dish: DemoDish, goal: DemoGoal): DemoBoxLine[] {
  if (dish.boxItems.length === 0) return [];
  const items = dish.boxItems.map((it) => ({ term: t(it.termKey), grams: it.grams[goal] }));
  return [{
    id: `${dish.id}:you`,
    dishId: dish.id,
    lid: boxLidLabel(eatersLabelFor([memberName("you")], 1), mealLabel(dish.day, dish.slot), t(dish.titleKey)),
    items,
    parts: boxPartsFor(dish, goal),
    total: items.reduce((sum, it) => sum + it.grams, 0),
    kcal: dish.kcal ? dish.kcal[goal] : null,
  }];
}

/** Les contenants qu'une session remplit: ceux des plats qui prélèvent sur ses casseroles. */
export function boxLinesForSession(session: DemoSession, goal: DemoGoal): DemoBoxLine[] {
  const wanted = new Set(session.prepIds);
  return DEMO_DISHES
    .filter((dish) => dish.prepIds.some((id) => wanted.has(id)))
    .flatMap((dish) => boxLinesForDish(dish, goal));
}

// ── LA GRILLE ────────────────────────────────────────────────────────────────

export type DemoGridCell =
  | { kind: "dish"; title: string; fromBatch: boolean }
  | { kind: "empty" };

export interface DemoGridRow {
  slot: DemoSlot;
  cells: DemoGridCell[];
}

/** La même lecture que `buildPlanGrid`: un titre par case, « d'une fournée » quand le plat prélève. */
export function demoGrid(): DemoGridRow[] {
  return DEMO_SLOTS.map((slot) => ({
    slot,
    cells: DEMO_DAYS.map((day): DemoGridCell => {
      const dish = DEMO_DISHES.find((d) => d.day === day && d.slot === slot);
      if (!dish) return { kind: "empty" };
      return { kind: "dish", title: t(dish.titleKey), fromBatch: dish.prepIds.length > 0 };
    }),
  }));
}

// ── LA CHAÎNE COURSES → CUISINE → REPAS ──────────────────────────────────────

export type DemoNode =
  | { kind: "grocery"; id: string }
  | { kind: "prep"; id: string }
  | { kind: "dish"; id: string };

export function nodeKey(node: DemoNode): string {
  return `${node.kind}:${node.id}`;
}

/**
 * Tout ce qui est relié à un nœud, lui compris — c'est ce qui s'allume au
 * survol. Un article sert des casseroles, une casserole nourrit des plats; on
 * remonte et on descend la même arête.
 */
export function relatedTo(node: DemoNode): Set<string> {
  const out = new Set<string>([nodeKey(node)]);
  const addPrep = (prepId: string) => {
    out.add(`prep:${prepId}`);
    for (const g of DEMO_GROCERIES) if (g.prepIds.includes(prepId)) out.add(`grocery:${g.id}`);
    for (const d of DEMO_DISHES) if (d.prepIds.includes(prepId)) out.add(`dish:${d.id}`);
  };
  if (node.kind === "prep") {
    addPrep(node.id);
  } else if (node.kind === "grocery") {
    const g = DEMO_GROCERIES.find((x) => x.id === node.id);
    for (const prepId of g?.prepIds ?? []) {
      out.add(`prep:${prepId}`);
      for (const d of DEMO_DISHES) if (d.prepIds.includes(prepId)) out.add(`dish:${d.id}`);
    }
    for (const dishId of g?.dishIds ?? []) out.add(`dish:${dishId}`);
  } else {
    const d = dishById(node.id);
    for (const prepId of d?.prepIds ?? []) {
      out.add(`prep:${prepId}`);
      for (const g of DEMO_GROCERIES) if (g.prepIds.includes(prepId)) out.add(`grocery:${g.id}`);
    }
    for (const g of DEMO_GROCERIES) if (g.dishIds.includes(node.id)) out.add(`grocery:${g.id}`);
  }
  return out;
}
