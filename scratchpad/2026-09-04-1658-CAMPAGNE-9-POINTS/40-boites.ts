#!/usr/bin/env -S deno run --allow-read
/**
 * ── CE QU'IL Y A DANS UN CONTENANT, EN NUTRIMENTS — 2026-09-04 ────────────
 *
 * ⛔ LA MESURE QUE LE DÉPÔT DIT MANQUANTE. `mouthDayEnergy` s'abstient sur une
 * JOURNÉE dès qu'un plat n'a pas de boîte ou qu'un bac est commun — et c'est
 * juste, une journée trouée ne se juge pas. Mais la question du point 7 n'est
 * pas « cette journée est-elle complète », c'est « la boîte de la végane
 * vaut-elle celle des autres ». Elle se pose au niveau du BAC, et là il n'y a
 * ni trou ni division: les grammes sont écrits, par composant.
 *
 * ⚠️ LE RÉSOLVEUR EST CELUI DE LA PRODUCTION, importé. Un instrument recopié
 * mesure l'instrument.
 *
 * ⛔ ON PRORATE DEPUIS LE PLAT, ON NE RÉSOUT PAS LES TERMES DE LA BOÎTE — et
 * c'est ce que fait le produit (`mouth_energy.dishSlices`: « le dénominateur
 * est le plat entier, pas un couvercle »). Ma première version résolvait
 * `items[].term` directement: « poulet rôti » et « légumes rôtis » n'existent
 * pas dans le référentiel (42 alias contiennent « poulet », aucun n'est
 * « poulet rôti »), donc les boîtes carnées sortaient SANS leur viande — 4 g
 * de protéine pour Paul contre 20 pour la végane. **La conclusion inverse de
 * la vérité, produite par un instrument qui ne mesure pas ce que le produit
 * mesure.** Le plat, lui, écrit « cuisses de poulet », qui résout.
 *
 * ⚠️ La part d'un bac à PLUSIEURS noms est divisée ici, et seulement ici. Le
 * produit s'y refuse (`common_pot`) parce qu'un chiffre divisé aurait l'air
 * personnel; un banc a le droit de le faire pour répondre à « la végane
 * est-elle servie comme les autres », à condition de le DIRE.
 *
 *   deno run --allow-read 40-boites.ts <ref> <plan.json> <roster.json>
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  type CompositionIndex,
  isFriedMethod,
  nutrientsOf,
  resolveIngredients,
} from "../../supabase/functions/_shared/keel/food_composition.ts";

const [refDir, planFile, rosterFile] = Deno.args;
const readNd = (f: string) =>
  Deno.readTextFileSync(f).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
function fileClient() {
  const cache = new Map<string, unknown[]>();
  const rowsOf = (t: string) => {
    if (!cache.has(t)) cache.set(t, readNd(`${refDir}/${t}.ndjson`));
    return cache.get(t)!;
  };
  return {
    from(table: string) {
      return {
        select(_c: string) {
          return {
            range(a: number, b: number) {
              return Promise.resolve({ data: rowsOf(table).slice(a, b + 1), error: null });
            },
          };
        },
      };
    },
  };
}

// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const roster: any[] = rosterFile ? JSON.parse(Deno.readTextFileSync(rosterFile)) : [];
const nameOf = new Map<string, string>(roster.map((r) => [r.member_id, r.first_name]));
const index: CompositionIndex = await loadCompositionIndex(fileClient());

interface Row {
  day: string;
  slot: string;
  dish: string;
  who: string;
  mouths: number;
  grams: number;
  share: number;
  kcal: number | null;
  protein: number | null;
  unresolved: string[];
}

/** Les ingrédients d'un plat ET de ses casseroles, au prorata des portions. */
// deno-lint-ignore no-explicit-any
function dishIngredients(d: any, preps: Map<string, any>) {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [...(d.ingredients ?? [])];
  // deno-lint-ignore no-explicit-any
  for (const u of (d.uses ?? []) as any[]) {
    const p = preps.get(String(u.preparation_id ?? ""));
    if (!p) continue;
    const made = Math.max(1, Number(p.servings_made) || 1);
    const take = Math.max(0, Number(u.servings) || 0);
    if (take <= 0) continue;
    // ⚠️ LE PRORATA DE FOURNÉE, comme `foldPreparationsIntoDishes`: une
    // casserole de 4 parts dont le plat prend 1 n'apporte qu'un quart.
    // deno-lint-ignore no-explicit-any
    for (const i of (p.ingredients ?? []) as any[]) {
      const amount = Number(i.amount);
      out.push({
        ...i,
        amount: Number.isFinite(amount) ? (amount * take) / made : i.amount,
      });
    }
  }
  return out;
}

// ⟳ LOT 0 (2026-09-06) — L'INSTRUMENT SUIT LA RÈGLE DU MOTEUR : l'énergie d'une boîte
// vient de ses grammes tirés × la densité de la casserole (mouth_energy.ts), plus du
// pliage `uses.servings/servings_made` qui copiait la convention du modèle (×5,9 sur M07).
import { boxKcalByItems, potDensities } from "../../supabase/functions/_shared/keel/mouth_energy.ts";
const rows: Row[] = [];
let massTotal = 0;
let massUnresolved = 0;
// deno-lint-ignore no-explicit-any
const preps = new Map<string, any>(
  // deno-lint-ignore no-explicit-any
  ((plan.preparations ?? []) as any[]).map((p) => [String(p.id ?? ""), p]),
);
// deno-lint-ignore no-explicit-any
const toInput = (i: any) => ({
  term: String(i.term ?? ""),
  amount: Number(i.amount) > 0 ? Number(i.amount) : null,
  unit: typeof i.unit === "string" ? i.unit : null,
  state: typeof i.state === "string" ? i.state : null,
  quantity: typeof i.quantity === "string" ? i.quantity : null,
});
const densities = potDensities(
  index,
  // deno-lint-ignore no-explicit-any
  ((plan.preparations ?? []) as any[]).map((p) => ({
    id: String(p.id ?? ""),
    servingsMade: Math.max(1, Number(p.servings_made) || 1),
    method: String(p.method ?? ""),
    // deno-lint-ignore no-explicit-any
    ingredients: ((p.ingredients ?? []) as any[]).map(toInput) as any,
  })),
);
let byItemsBoxes = 0;
// deno-lint-ignore no-explicit-any
for (const d of (plan.dishes ?? []) as any[]) {
  // deno-lint-ignore no-explicit-any
  const boxes = (d.boxes ?? []) as any[];
  if (boxes.length === 0) continue;
  const byItems = boxKcalByItems(index, {
    day: d.day ?? null,
    slot: d.slot ?? null,
    method: String(d.method ?? ""),
    // deno-lint-ignore no-explicit-any
    ingredients: ((d.ingredients ?? []) as any[]).map(toInput) as any,
    // deno-lint-ignore no-explicit-any
    uses: ((d.uses ?? []) as any[]).map((u) => ({ preparationId: String(u.preparation_id ?? ""), servings: Number(u.servings) || 1 })),
    // deno-lint-ignore no-explicit-any
    boxes: boxes.map((b: any) => ({
      memberIds: (b.member_ids ?? []).map(String),
      // deno-lint-ignore no-explicit-any
      items: ((b.items ?? []) as any[]).map((it) => ({
        grams: Number(it.grams) || 0,
        ...(it.preparation_id === undefined ? {} : { preparationId: typeof it.preparation_id === "string" && it.preparation_id !== "" ? it.preparation_id : null }),
      })),
      legacyTotalGrams: Number(b.legacy_total_grams) > 0 ? Number(b.legacy_total_grams) : null,
    })),
  }, densities);
  if (byItems !== null) byItemsBoxes += boxes.length;
  const res = resolveIngredients(
    index,
    // deno-lint-ignore no-explicit-any
    dishIngredients(d, preps).map((i: any) => ({
      term: String(i.term ?? ""),
      amount: Number(i.amount) > 0 ? Number(i.amount) : null,
      unit: typeof i.unit === "string" ? i.unit : null,
      state: typeof i.state === "string" ? i.state : null,
      quantity: typeof i.quantity === "string" ? i.quantity : null,
      // deno-lint-ignore no-explicit-any
    })) as any,
  );
  const n = nutrientsOf(res.resolved, { friedMethod: isFriedMethod(String(d.method ?? "")) });
  // ⚠️ LA MASSE NON RÉSOLUE, PAS SEULEMENT LES NOMS : un « orzo » de 400 g qui ne résout pas
  // efface l'énergie du plat entier, et le déficit qui suit est un artefact de mesure.
  {
    const unresSet = new Set(res.unresolvedTerms.map((t: string) => t.toLowerCase()));
    // deno-lint-ignore no-explicit-any
    for (const i of dishIngredients(d, preps) as any[]) {
      const g = i.unit === "g" && Number(i.amount) > 0 ? Number(i.amount) : 0;
      massTotal += g;
      if (unresSet.has(String(i.term ?? "").toLowerCase())) massUnresolved += g;
    }
  }
  // deno-lint-ignore no-explicit-any
  const gramsOf = (b: any) =>
    // deno-lint-ignore no-explicit-any
    ((b.items ?? []) as any[]).reduce((s, i) => s + (Number(i.grams) || 0), 0) ||
    (Number(b.legacy_total_grams) || 0);
  const total = boxes.reduce((s, b) => s + gramsOf(b), 0);
  for (const [j, b] of boxes.entries()) {
    const g = gramsOf(b);
    const share = total > 0 ? g / total : 0;
    const ids: string[] = (b.member_ids ?? []).map(String);
    rows.push({
      day: String(d.day ?? "?"),
      slot: String(d.slot ?? "?"),
      dish: String(d.title ?? ""),
      who: ids.map((m) => nameOf.get(m) ?? m.slice(0, 6)).join("+") || "(sans nom)",
      mouths: Math.max(1, ids.length),
      grams: g,
      share,
      // ⟳ LOT 0 : par items quand la boîte cite ses casseroles, pliage sinon.
      kcal: byItems !== null ? byItems[j].kcal : (n === "unknown" || n.energyKcal === null ? null : n.energyKcal * share),
      protein: n === "unknown" || n.proteinG === null ? null : n.proteinG * share,
      unresolved: res.unresolvedTerms,
    });
  }
}

const perMouth = new Map<
  string,
  { kcal: number; protein: number; grams: number; boxes: number; blindGrams: number }
>();
for (const r of rows) {
  for (const who of r.who.split("+")) {
    const cur = perMouth.get(who) ?? { kcal: 0, protein: 0, grams: 0, boxes: 0, blindGrams: 0 };
    cur.kcal += (r.kcal ?? 0) / r.mouths;
    cur.protein += (r.protein ?? 0) / r.mouths;
    cur.grams += r.grams / r.mouths;
    // ⚠️ UNE BOÎTE DONT L'ÉNERGIE N'EST PAS LISIBLE (terme dense non résolu) compte ses
    // grammes et ZÉRO kcal : le kcal/jour est un PLANCHER, et cette colonne dit de combien.
    if (r.kcal === null) cur.blindGrams += r.grams / r.mouths;
    cur.boxes += 1;
    perMouth.set(who, cur);
  }
}

const days = new Set(rows.map((r) => r.day)).size || 1;
console.log(`=== ${rows.length} contenants · ${days} jours · ${byItemsBoxes} valorisés par grammes tirés (lot 0), ${rows.length - byItemsBoxes} par pliage ===`);
console.log(
  "bouche       bacs   g/jour   kcal/jour   protéine/jour   g/jour SANS énergie lisible   (bac divisé par ses mangeurs)",
);
for (const [who, v] of [...perMouth].sort()) {
  console.log(
    `${who.padEnd(12)} ${String(v.boxes).padStart(4)}  ${
      String(Math.round(v.grams / days)).padStart(6)
    }  ${String(Math.round(v.kcal / days)).padStart(10)}  ${
      String(Math.round(v.protein / days)).padStart(13)
    }  ${String(Math.round(v.blindGrams / days)).padStart(12)}`,
  );
}
const unres = [...new Set(rows.flatMap((r) => r.unresolved))];
if (unres.length) console.log(`\n⚠️ termes non résolus (${unres.length}):`, unres.slice(0, 12).join(", "));
console.log(
  `MASSE NON RÉSOLUE (plats en boîtes, ingrédients en g) : ${Math.round(massUnresolved)} / ${
    Math.round(massTotal)
  } g = ${massTotal > 0 ? Math.round((100 * massUnresolved) / massTotal) : 0} %`,
);

// ── LE MÊME REPAS, BOÎTE PAR BOÎTE — l'équivalence entre groupes ──────────
console.log("\n=== LE MÊME REPAS, GROUPE PAR GROUPE ===");
const seen = new Set<string>();
for (const r of rows) {
  const key = `${r.day}/${r.slot}`;
  if (seen.has(key)) continue;
  const same = rows.filter((x) => `${x.day}/${x.slot}` === key);
  if (same.length < 2) continue;
  seen.add(key);
  if (seen.size > 3) break;
  console.log(`\n▸ ${key} « ${r.dish.slice(0, 52)} »`);
  for (const s of same) {
    const perHead = (v: number | null) => v === null ? "?" : Math.round(v / s.mouths);
    console.log(
      `   ${s.who.padEnd(14)} ${String(Math.round(s.grams / s.mouths)).padStart(4)} g/bouche · ${
        String(perHead(s.kcal)).padStart(4)
      } kcal · ${String(perHead(s.protein)).padStart(3)} g protéine`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LE PLAN ENTIER, PAR JOUR — la seule mesure qui n'a pas de trou
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI ELLE EXISTE À CÔTÉ DE LA PRÉCÉDENTE. Les contenants ne couvrent
// que les repas qui puisent dans un lot: sur ce plan, 18 repas sur 42. Juger la
// nourriture d'une bouche sur ses seules boîtes la déclarerait sous-nourrie
// alors qu'elle mange aussi tout ce qui est cuisiné le jour même. La question
// « la table est-elle nourrie » se pose donc sur le PLAT, pas sur le couvercle.
//
// ⚠️ ET ELLE NE SE DIVISE PAS PAR BOUCHE. Le plan compose pour la table; qui
// mange quoi dans un plat sans boîte n'est écrit nulle part. On compare donc un
// TOTAL à la SOMME des cibles — c'est moins fin, et c'est vrai.
{
  const byDay = new Map<string, { kcal: number; protein: number; unresolved: Set<string> }>();
  // deno-lint-ignore no-explicit-any
  for (const d of (plan.dishes ?? []) as any[]) {
    const res = resolveIngredients(
      index,
      // deno-lint-ignore no-explicit-any
      dishIngredients(d, preps).map((i: any) => ({
        term: String(i.term ?? ""),
        amount: Number(i.amount) > 0 ? Number(i.amount) : null,
        unit: typeof i.unit === "string" ? i.unit : null,
        state: typeof i.state === "string" ? i.state : null,
        quantity: typeof i.quantity === "string" ? i.quantity : null,
        // deno-lint-ignore no-explicit-any
      })) as any,
    );
    const n = nutrientsOf(res.resolved, { friedMethod: isFriedMethod(String(d.method ?? "")) });
    const day = String(d.day ?? "?");
    const cur = byDay.get(day) ?? { kcal: 0, protein: 0, unresolved: new Set<string>() };
    if (n !== "unknown") {
      cur.kcal += n.energyKcal ?? 0;
      cur.protein += n.proteinG ?? 0;
    }
    for (const t of res.unresolvedTerms) cur.unresolved.add(t);
    byDay.set(day, cur);
  }
  console.log("\n=== LE PLAN ENTIER, PAR JOUR (tous plats, prorata de fournée) ===");
  console.log("jour    kcal   protéine   termes non résolus");
  let tot = 0, totP = 0;
  for (const [day, v] of byDay) {
    console.log(
      `${day.padEnd(6)} ${String(Math.round(v.kcal)).padStart(6)}  ${
        String(Math.round(v.protein)).padStart(7)
      } g   ${[...v.unresolved].join(", ") || "—"}`,
    );
    tot += v.kcal;
    totP += v.protein;
  }
  const n = byDay.size || 1;
  console.log(`MOYENNE ${String(Math.round(tot / n)).padStart(5)}  ${String(Math.round(totP / n)).padStart(7)} g`);
}
