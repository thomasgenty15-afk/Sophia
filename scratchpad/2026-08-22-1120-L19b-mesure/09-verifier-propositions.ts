/**
 * LOT 19 — LA VÉRIFICATION DES PROPOSITIONS, une par une.
 *
 * Pour chaque ligne proposée:
 *   ① la ligne CIQUAL visée existe, et on l'imprime en entier (libellé, code,
 *     groupe, énergie) — c'est ce qu'un relecteur doit pouvoir contredire;
 *   ② l'alias n'existe pas déjà;
 *   ③ ce que la chaîne atteint AUJOURD'HUI (rien / la bonne ligne / une autre);
 *   ④ que l'alias ne sera pas MORT: `bySlug` gagne sur `byAlias`, donc un alias
 *     dont la forme est aussi un slug ne se déclencherait jamais;
 *   ⑤ qu'après ajout, la chaîne atteint bien la ligne visée.
 */
import {
  buildCompositionIndex, type CompositionRef, normalizeTerm, resolveIngredient, type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";
const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const raw = read("refs.json") as Record<string, any>[];
const refs: CompositionRef[] = raw.map((r) => ({
  slug: String(r.slug), foodGroupRef: String(r.food_group_ref) as FoodGroupRef, label: String(r.label),
  energyKcal: Number(r.energy_kcal), proteinG: null, carbsG: null, fatG: null, fiberG: null,
  omega3Marine: false, ironSource: false, calciumSource: false, iodineSource: false, zincSource: false,
  b12Source: false, folateSource: false, yieldClass: String(r.yield_class) as YieldClass,
  atwaterDiscount: Number(r.atwater_discount), energyDense: !!r.energy_dense,
  unitGrams: r.unit_grams === null ? null : Number(r.unit_grams), condimentGrams: null,
}));
const rawBySlug = new Map(raw.map((r) => [String(r.slug), r]));
const aliases = read("aliases.json") as { alias: string; slug: string }[];
const existing = new Set(aliases.map((a) => normalizeTerm(a.alias)));
const slugSet = new Set(refs.map((r) => r.slug));
const before = buildCompositionIndex(refs, aliases);

const lines = Deno.readTextFileSync("propositions.tsv").split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.split("\t"));
const props = lines.map(([alias, slug, raison]) => ({ alias: alias.trim(), slug: slug.trim(), raison: (raison ?? "").trim() }));
const after = buildCompositionIndex(refs, [...aliases, ...props.map((p) => ({ alias: p.alias, slug: p.slug }))]);

let ok = 0;
const problems: string[] = [];
const out: string[] = [];
out.push("alias\tslug\tlibellé CIQUAL\tciqual_code\tgroupe\tkcal/100 g crus\taujourd'hui\traison");
for (const p of props) {
  const row = rawBySlug.get(p.slug);
  if (!row) { problems.push(`⛔ ${p.alias} → slug INEXISTANT: ${p.slug}`); continue; }
  if (existing.has(normalizeTerm(p.alias))) { problems.push(`⛔ ${p.alias} : alias DÉJÀ présent en base`); continue; }
  if (slugSet.has(normalizeTerm(p.alias).replace(/ /g, "_"))) { problems.push(`⛔ ${p.alias} : la forme est aussi un SLUG — l'alias serait MORT (bySlug gagne)`); continue; }
  const now = resolveIngredient(before, p.alias);
  const then = resolveIngredient(after, p.alias);
  if (!then || then.slug !== p.slug) { problems.push(`⛔ ${p.alias} : après ajout, atteint ${then?.slug ?? "RIEN"} et non ${p.slug}`); continue; }
  const nowTxt = !now ? "∅ rien" : now.slug === p.slug ? `déjà ${now.slug} (redondant)` : `≠ ${now.slug} (${now.label}, ${now.energyKcal} kcal)`;
  if (now && now.slug === p.slug) { problems.push(`⚠️  ${p.alias} : atteint DÉJÀ ${p.slug} — proposition redondante`); continue; }
  ok++;
  out.push([p.alias, p.slug, row.label, row.ciqual_code ?? "(absent)", row.food_group_ref, row.energy_kcal, nowTxt, p.raison].join("\t"));
}
console.log(`propositions lues        ${props.length}`);
console.log(`vérifiées et retenues    ${ok}`);
console.log(`écartées / à revoir      ${problems.length}`);
for (const p of problems) console.log("  " + p);
Deno.writeTextFileSync("propositions-verifiees.tsv", out.join("\n") + "\n");
console.log("\n→ propositions-verifiees.tsv");
