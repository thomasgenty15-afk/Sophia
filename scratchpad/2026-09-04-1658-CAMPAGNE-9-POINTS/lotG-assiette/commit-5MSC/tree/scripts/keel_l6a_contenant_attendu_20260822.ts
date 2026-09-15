// ══════════════════════════════════════════════════════════════════════════
// `L6′-a` + `L6′-b` — LE DÉNOMINATEUR DES CONTENANTS, ET LE NOM DU ZÉRO.
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LECTURE SEULE, ZÉRO GÉNÉRATION. Les plans sont DÉJÀ en base; ce pilote les
// rejoue à travers le module `box_expected.ts` dans un SEUL processus — §⑨
// n° 55: un niveau absolu de ce corpus n'est pas reproductible à la minute, un
// AVANT et un APRÈS calculés sur les mêmes lignes dans la même passe le sont.
//
// ⛔ ET IL RECOMPTE D'ABORD LA FORMULE D'AVANT. Si le recompte ne reproduit pas
// l'`expected` PERSISTÉ, le delta n'a aucune valeur — c'est la discipline
// `recompte ≠ base : 0 ✓` de `L26-0`, et elle est ce qui sépare une mesure
// d'une affirmation.
//
// ⛔ CE PILOTE NE TYPE-CHECKE PAS DEPUIS UN CLONE `HEAD`, ET C'EST DÉCLARÉ
// (§⑨ n° 96). Il importe `scanDietaryRegime`, qui n'existe que dans l'ARBRE DE
// TRAVAIL (`dietary_regime.ts` est `M`, +419/−2). Le rendre autonome voudrait
// dire y écrire une lecture de régime À LA MAIN — un matcher maison, la règle
// que ce dépôt a payée douze faux positifs sur douze pour ne plus enfreindre.
// ⚠️ CE QUI REMPLACE LE CLONE, ET C'EST PLUS FORT: le pilote RECOMPTE la
// formule d'AVANT et la compare à la valeur PERSISTÉE. `recompte ≠ base : 0 ✓`
// est la preuve qu'il n'a pas divergé du produit. Le MODULE, lui, est clonable:
// `box_expected.ts` n'importe rien, et ses 19 épreuves passent depuis `HEAD`.
//
// ⚠️ LA PARTITION EN LIGNES EST RECOPIÉE ICI, ET C'EST ASSUMÉ: `scanMealForRegime`
// n'est pas exporté par `meal_generation.ts`, et l'exporter élargirait un
// fichier qu'aucun lot ne peut commiter (§⑨ n° 15). La copie n'est PAS un
// matcher maison — elle appelle `scanDietaryRegime`, la même liste fermée — et
// le recompte contre la base est ce qui prouve qu'elle n'a pas divergé.

import {
  boxDeliveryState,
  type ExpectedDish,
  mouthsFedByDish,
} from "../supabase/functions/_shared/keel/box_expected.ts";
import {
  type DietaryRegime,
  scanDietaryRegime,
} from "../supabase/functions/_shared/keel/dietary_regime.ts";
// ⛔ JAMAIS UN `as` SUR UN TYPE ÉTRANGER — il désarmerait le typecheck et
// rendrait un `group` inconnu indiscernable d'un `group` valide. Le vocabulaire
// fermé a son parseur, et c'est celui que le produit utilise.
import {
  type FoodGroupRef,
  parseFoodGroupRef,
} from "../supabase/functions/_shared/keel/tokens.ts";

interface RawIngredient {
  term?: string | null;
  group?: string | null;
}
interface RawPrep {
  id?: string | null;
  title?: string | null;
  method?: string | null;
  ingredients?: RawIngredient[] | null;
}
interface RawDish {
  day?: string | null;
  slot?: string | null;
  member_id?: string | null;
  title?: string | null;
  method?: string | null;
  ingredients?: RawIngredient[] | null;
  uses?: { preparation_id?: string | null }[] | null;
  boxes?: unknown[] | null;
}
interface RawPlan {
  plan: string;
  locale: string;
  base: Record<string, number | string> | null;
  dishes: RawDish[] | null;
  preparations: RawPrep[] | null;
}

const dir = Deno.args[0];
if (!dir) {
  console.error("usage: keel_l6a_contenant_attendu_20260822.ts <dir>");
  Deno.exit(2);
}

const roster = new Set(
  Deno.readTextFileSync(`${dir}/roster.txt`).split("\n").map((s) => s.trim())
    .filter(Boolean),
);
/** `id<TAB>goal<TAB>diet`, tel que la table le porte. */
const weighed = new Set<string>();
const regimes = new Map<string, DietaryRegime>();
for (const line of Deno.readTextFileSync(`${dir}/mouths.tsv`).split("\n")) {
  const [id, goal, diet] = line.split("\t");
  if (!id) continue;
  if (goal === "fat_loss" || goal === "muscle_gain") weighed.add(id);
  const d = (diet ?? "").trim();
  if (d) regimes.set(id, d as DietaryRegime);
}

const plans: RawPlan[] = Deno.readTextFileSync(`${dir}/plans.ndjson`)
  .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));

/**
 * ⚠️ `parseFoodGroupRef` JETTE sur un jeton inconnu (R7), y compris sur `null`.
 * Une ligne sans groupe est le cas NORMAL en base; l'absence se rend `null`,
 * et seul un jeton VRAIMENT inconnu doit encore casser bruyamment.
 */
function groupRefOf(raw: string | null | undefined): FoodGroupRef | null {
  const token = (raw ?? "").trim();
  if (token === "") return null;
  return parseFoodGroupRef(token);
}

/** La lecture de ligne du parseur, à l'identique — prose puis termes. */
function breaches(
  regime: DietaryRegime,
  dish: RawDish,
  prepById: Map<string, RawPrep>,
): boolean {
  const sources: { prose: string[]; items: RawIngredient[] }[] = [
    {
      prose: [dish.title ?? "", dish.method ?? ""],
      items: [...(dish.ingredients ?? [])],
    },
  ];
  const seen = new Set<string>();
  for (const use of dish.uses ?? []) {
    const prep = prepById.get(String(use?.preparation_id ?? ""));
    if (!prep?.id || seen.has(prep.id)) continue;
    seen.add(prep.id);
    sources.push({
      prose: [prep.title ?? "", prep.method ?? ""],
      items: [...(prep.ingredients ?? [])],
    });
  }
  for (const source of sources) {
    const scan = scanDietaryRegime(regime, {
      prose: source.prose.filter((t) => t.trim() !== ""),
      items: source.items
        .filter((i) => (i?.term ?? "") !== "")
        .map((i) => ({ term: String(i.term), group: groupRefOf(i.group) })),
    });
    if (scan.breaches.length > 0) return true;
  }
  return false;
}

type Row = {
  plan: string;
  locale: string;
  meals: number;
  withBox: number;
  boxes: number;
  baseExpected: number;
  oldExpected: number;
  newExpected: number;
  delivery: string;
  dedicated: number;
  excluded: number;
};

const rows: Row[] = [];
let mismatch = 0;
for (const p of plans) {
  const dishes = p.dishes ?? [];
  const prepById = new Map<string, RawPrep>();
  for (const prep of p.preparations ?? []) {
    if (prep?.id) prepById.set(String(prep.id), prep);
  }
  const boxable = dishes.map((d) => (d.uses ?? []).length > 0);
  const shaped: ExpectedDish[] = dishes.map((d, i) => ({
    day: d.day ?? null,
    slot: d.slot ?? null,
    memberId: d.member_id ?? null,
    boxable: boxable[i],
  }));
  const fed = mouthsFedByDish(shaped, roster);

  /** La partition en lignes d'un ensemble de mangeurs, pour CE plat. */
  const linesFor = (dish: RawDish, eaters: Iterable<string>): number => {
    const lines = new Set<string>();
    for (const memberId of eaters) {
      if (weighed.has(memberId)) continue;
      const regime = regimes.get(memberId);
      if (!regime) {
        lines.add("");
        continue;
      }
      lines.add(breaches(regime, dish, prepById) ? regime : "");
    }
    return lines.size;
  };

  let oldExpected = 0;
  let newExpected = 0;
  if (roster.size > 0) {
    for (const [i, dish] of dishes.entries()) {
      if (!boxable[i]) continue;
      // AVANT: le foyer ENTIER sur chaque plat, `member_id` jamais lu.
      oldExpected += weighed.size + linesFor(dish, roster);
      // APRÈS: les bouches que CE plat-là nourrit.
      const eaters = fed.fedByDish[i];
      if (eaters === null) continue;
      let weighedHere = 0;
      for (const id of weighed) if (eaters.has(id)) weighedHere++;
      newExpected += weighedHere + linesFor(dish, eaters);
    }
  }

  const meals = boxable.filter(Boolean).length;
  const withBox = dishes.filter((d, i) => boxable[i] && (d.boxes ?? []).length > 0).length;
  const baseExpected = Number(p.base?.expected ?? -1);
  if (baseExpected !== oldExpected) mismatch++;
  rows.push({
    plan: p.plan,
    locale: p.locale,
    meals,
    withBox,
    boxes: dishes.reduce((n, d) => n + (d.boxes ?? []).length, 0),
    baseExpected,
    oldExpected,
    newExpected,
    delivery: boxDeliveryState({ clean: true, roster: roster.size, meals, withBox }),
    dedicated: shaped.filter((d) => d.boxable && d.memberId !== null).length,
    excluded: fed.excluded,
  });
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  `plan     loc    meals with_box boxes  base  avant  après  dédiés  exclus  delivery`,
);
for (const r of rows) {
  console.log(
    `${r.plan} ${r.locale.padEnd(6)}${pad(r.meals, 5)}${pad(r.withBox, 9)}${
      pad(r.boxes, 6)
    }${pad(r.baseExpected, 6)}${pad(r.oldExpected, 7)}${pad(r.newExpected, 7)}${
      pad(r.dedicated, 8)
    }${pad(r.excluded, 8)}  ${r.delivery}`,
  );
}
const sum = (f: (r: Row) => number) => rows.reduce((n, r) => n + f(r), 0);
console.log("");
console.log(`recompte ≠ base : ${mismatch}${mismatch === 0 ? " ✓" : " ⛔"}`);
console.log(
  `Σ boxes ${sum((r) => r.boxes)} · Σ expected AVANT ${
    sum((r) => r.oldExpected)
  } · Σ expected APRÈS ${sum((r) => r.newExpected)}`,
);
const before = sum((r) => r.oldExpected);
const after = sum((r) => r.newExpected);
const boxes = sum((r) => r.boxes);
const pct = (n: number, d: number) => d === 0 ? "n/a" : `${(100 * n / d).toFixed(1)} %`;
console.log(
  `taux boxes/expected : ${pct(boxes, before)} → ${pct(boxes, after)}`,
);
const byState = new Map<string, number>();
for (const r of rows) byState.set(r.delivery, (byState.get(r.delivery) ?? 0) + 1);
console.log(
  `delivery : ${[...byState].map(([k, v]) => `${k} ${v}`).join(" · ")}`,
);
if (mismatch > 0) Deno.exit(1);
