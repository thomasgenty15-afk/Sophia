/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 1 — LE LOT PRÉLEVÉ CONTRE LES PARTS RÉELLEMENT SERVIES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read --allow-env --allow-net \
 *     scratchpad/2026-09-13-LOT1-NOURRIR-CHACUN/mesurer-lots.ts <fixture-figée>
 *
 * La question, et il n'y en a qu'une: **après avoir donné sa part à la bouche
 * sans cible, est-ce qu'on cuisine plus qu'avant ?**
 *
 * Deux égalités, mesurées avec les fonctions de production:
 *
 *   ① CASSEROLE   `measurePreparation(...).readyG` d'une casserole ÉCRITE
 *                 = Σ des grammes des items de contenant qui la citent.
 *                 Un item de contenant qui cite une casserole porte
 *                 `perDraw × facteur`; la casserole a été multipliée par
 *                 `Σ_plats (Σ_mangeurs f) ÷ tirages`. Les deux doivent se
 *                 rejoindre à l'arrondi près (`Math.round` par item).
 *
 *   ② FRAIS       `weighedReadyGrams` des ingrédients ÉCRITS d'un plat
 *                 = Σ des grammes des items de contenant SANS casserole.
 *
 * ⛔ CE QUE ÇA PROUVE, ET CE QUE ÇA NE PROUVE PAS. Une égalité dit qu'aucun
 * gramme n'est prélevé deux fois ET qu'aucun gramme ne reste au fond de la
 * casserole. Un ÉCART POSITIF (prélevé < cuisiné) est le défaut d'avant ce
 * lot: la nourriture d'une bouche est achetée, cuisinée, et rendue à personne.
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const CHEMIN = Deno.args.find((a) => !a.startsWith("--"));
if (!CHEMIN) {
  console.error("usage: mesurer-lots.ts <fixture-figée.json>");
  Deno.exit(2);
}
// deno-lint-ignore no-explicit-any
const fx = JSON.parse(await Deno.readTextFile(`${ROOT}${CHEMIN}`)) as any;
const plan = fx.ligne_ecrite;
if (!plan) {
  console.error("⛔ la fixture ne porte aucune ligne écrite (tir refusé ?)");
  Deno.exit(2);
}
// ⚠️ LE RÉFÉRENTIEL FIGÉ, celui de l'instrument — pas la base vivante. Les deux
// mesures (cuisiné, prélevé) passent par LE MÊME index, donc leur ÉGALITÉ ne
// dépend pas de ce choix; un index plus pauvre rendrait des `null` des deux
// côtés, jamais un faux écart.
const index = await indexDuReferentiel();

// deno-lint-ignore no-explicit-any
const dishes: any[] = plan.dishes ?? [];
// deno-lint-ignore no-explicit-any
const preps: any[] = plan.preparations ?? [];

console.log(`\n══ ① LES CASSEROLES : cuisiné contre prélevé ═════════════════`);
let potEcart = 0;
for (const p of preps) {
  const id = String(p.id ?? "");
  const cuisine = measurePreparation(index, {
    id,
    method: p.method ?? null,
    ingredients: (p.ingredients ?? []) as readonly unknown[],
    waterTreatment: p.water_treatment ?? p.waterTreatment ?? null,
  }).readyG;
  let preleve = 0;
  const noms = new Set<string>();
  for (const d of dishes) {
    for (const b of d.boxes ?? []) {
      for (const it of b.items ?? []) {
        const pid = String(it.preparation_id ?? it.preparationId ?? "");
        if (pid !== id) continue;
        preleve += Number(it.grams ?? 0);
        for (const m of b.member_ids ?? b.memberIds ?? []) noms.add(String(m));
      }
    }
  }
  const ecart = cuisine === null ? null : preleve - cuisine;
  if (ecart !== null) potEcart += Math.abs(ecart);
  console.log(
    `  ${id.padEnd(22)} cuisiné ${
      cuisine === null ? "illisible" : `${Math.round(cuisine)} g`
    } · prélevé ${Math.round(preleve)} g · écart ${
      ecart === null ? "?" : `${ecart > 0 ? "+" : ""}${Math.round(ecart)} g`
    } · ${noms.size} bouche(s) servie(s)`,
  );
}

console.log(`\n══ ② LE FRAIS DES PLATS : cuisiné contre prélevé ═════════════`);
let freshEcart = 0;
for (const [i, d] of dishes.entries()) {
  const ings = (d.ingredients ?? []) as readonly unknown[];
  if (ings.length === 0) continue;
  const cuisine = weighedReadyGrams(ings as never, index);
  let preleve = 0;
  for (const b of d.boxes ?? []) {
    for (const it of b.items ?? []) {
      const pid = String(it.preparation_id ?? it.preparationId ?? "");
      if (pid) continue;
      preleve += Number(it.grams ?? 0);
    }
  }
  const ecart = cuisine === null ? null : preleve - cuisine;
  if (ecart !== null) freshEcart += Math.abs(ecart);
  console.log(
    `  #${String(i).padStart(2)} ${String(d.day)}/${String(d.slot)} ${
      String(d.title ?? "").slice(0, 34).padEnd(34)
    } cuisiné ${cuisine === null ? "illisible" : `${Math.round(cuisine)} g`} · prélevé ${
      Math.round(preleve)
    } g · écart ${ecart === null ? "?" : `${ecart > 0 ? "+" : ""}${Math.round(ecart)} g`}`,
  );
}

console.log(`\n══ ③ QUI REÇOIT UN CONTENANT, PAR CASE ══════════════════════`);
const parCase = new Map<string, Set<string>>();
for (const d of dishes) {
  const cle = `${String(d.day)}/${String(d.slot)}`;
  for (const b of d.boxes ?? []) {
    const s = parCase.get(cle) ?? new Set<string>();
    for (const m of b.member_ids ?? b.memberIds ?? []) s.add(String(m));
    parCase.set(cle, s);
  }
}
for (const [cle, s] of [...parCase].sort()) {
  console.log(`  ${cle.padEnd(16)} ${s.size} bouche(s) : ${[...s].sort().join(" ")}`);
}

console.log(
  `\n── VERDICT ───────────────────────────────────────────────────\n` +
    `  casseroles : |écart| cumulé ${Math.round(potEcart)} g\n` +
    `  frais      : |écart| cumulé ${Math.round(freshEcart)} g\n` +
    `  ⚠️ l'arrondi est de ±0,5 g PAR ITEM de contenant — un écart de quelques\n` +
    `     grammes sur douze plats est l'arrondi, pas un double comptage.`,
);
