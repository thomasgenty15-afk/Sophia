/**
 * LOT A · A1 — L'AUDIT DU RÉFÉRENTIEL DE COMPOSITION.
 *
 *   deno run --allow-read --allow-write=scratchpad/2026-09-11-CHANTIER-PREMIER-JET \
 *     scratchpad/2026-09-11-CHANTIER-PREMIER-JET/lotA-02-audit.ts
 *
 * Entrées: `lotA-refs.json`, `lotA-aliases.json`, `lotA-plans.json` (produits
 * par `lotA-01-export.sh`). Sortie: `lotA-audit.json` + un résumé sur stdout.
 *
 * ⛔ HORS LIGNE, LECTURE SEULE. Aucune base, aucun appel modèle, aucune
 * écriture ailleurs que dans ce dossier. Le résolveur employé est CELUI DE LA
 * PRODUCTION (`resolveIngredient`), jamais une copie: un audit qui apparie
 * autrement que le produit mesure un autre produit.
 *
 * ⚠️ CE QUE CET AUDIT NE FAIT PAS. Il ne décide pas « ce nom est faux » sur
 * 943 lignes — personne ne peut le faire à la machine. Il remonte des FAITS
 * vérifiables un par un: un code porté deux fois, un nom français qui désigne
 * une autre ligne DE CE MÊME référentiel, une ligne qui porte les valeurs
 * d'une autre à la décimale près, une ligne qui se dit CIQUAL sans code.
 */
import {
  buildCompositionIndex,
  type CompositionRef,
  normalizeTerm,
  resolveIngredient,
  type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";

const DIR = new URL("./", import.meta.url);
const read = async (n: string) => JSON.parse(await Deno.readTextFile(new URL(n, DIR)));

type Row = Record<string, unknown>;
const rows: Row[] = await read("lotA-refs.json");
const aliasRows: { alias: string; slug: string; note: string | null }[] = await read(
  "lotA-aliases.json",
);
const plans: {
  id: string;
  content_locale: string;
  dishes: Row[];
  preparations: Row[];
}[] = await read("lotA-plans.json");

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => String(v ?? "").trim();

const refOf = (r: Row): CompositionRef => ({
  slug: str(r.slug),
  foodGroupRef: str(r.food_group_ref) as FoodGroupRef,
  label: str(r.label),
  source: str(r.source) as CompositionRef["source"],
  energyKcal: num(r.energy_kcal) ?? 0,
  proteinG: num(r.protein_g),
  carbsG: num(r.carbs_g),
  fatG: num(r.fat_g),
  fiberG: num(r.fiber_g),
  omega3Marine: r.omega3_marine === true,
  ironSource: r.iron_source === true,
  calciumSource: r.calcium_source === true,
  iodineSource: r.iodine_source === true,
  zincSource: r.zinc_source === true,
  b12Source: r.b12_source === true,
  folateSource: r.folate_source === true,
  yieldClass: str(r.yield_class) as YieldClass,
  yieldFactor: num(r.yield_factor),
  atwaterDiscount: num(r.atwater_discount) ?? 1,
  energyDense: r.energy_dense === true,
  unitGrams: num(r.unit_grams),
  condimentGrams: num(r.condiment_grams),
});

const friendRows: { term: string; lang: string; slug: string }[] = await read(
  "lotA-false-friends.json",
);

const refs = rows.map(refOf);
const byRow = new Map(rows.map((r) => [str(r.slug), r]));
const aliases = aliasRows.map((a) => ({ alias: a.alias, slug: a.slug }));

/**
 * DEUX INDEX, ET LA DIFFÉRENCE EST TOUT LE LOT.
 *
 * `index` est l'index ANGLAIS: aucun faux ami, donc le comportement exact
 * d'avant le lot A. Il sert à tous les contrôles de DONNÉES (A à I), qui
 * portent sur la table et pas sur la langue.
 *
 * `indexFr` est celui que `loadCompositionIndex` construit par défaut. Il sert
 * à la section G, qui montre ce que le produit fait vraiment d'un terme.
 */
const index = buildCompositionIndex(refs, aliases);
const indexFr = buildCompositionIndex(
  refs,
  aliases,
  friendRows.filter((f) => f.lang === "fr").map((f) => ({ alias: f.term, slug: f.slug })),
);

// ---------------------------------------------------------------------------
// A · UN CODE CIQUAL PORTÉ PAR PLUSIEURS SLUGS
//
// Un `alim_code` ANSES désigne UN aliment. Deux slugs qui le portent disent
// donc la même chose de deux aliments différents: au moins l'un des deux ment,
// et rien dans le produit ne peut dire lequel. Arbitrage ① du socle: les deux
// sont suspects jusqu'à arbitrage nominatif.
// ---------------------------------------------------------------------------
const byCode = new Map<string, string[]>();
for (const r of rows) {
  const code = str(r.ciqual_code);
  if (!code) continue;
  byCode.set(code, [...(byCode.get(code) ?? []), str(r.slug)]);
}
const duplicateCodes = [...byCode.entries()]
  .filter(([, s]) => s.length > 1)
  .map(([code, slugs]) => ({
    code,
    slugs,
    lignes: slugs.map((s) => {
      const r = byRow.get(s)!;
      return {
        slug: s,
        label: str(r.label),
        ciqual_name: str(r.ciqual_name),
        energy_kcal: num(r.energy_kcal),
        food_group_ref: str(r.food_group_ref),
        yield_class: str(r.yield_class),
      };
    }),
  }));

// ---------------------------------------------------------------------------
// B · LE NOM FRANÇAIS DE LA LIGNE DÉSIGNE UNE AUTRE LIGNE DU MÊME RÉFÉRENTIEL
//
// `ciqual_name` est le nom ANSES, en français. On en prend la TÊTE (avant la
// première virgule — « Poireau, cru » → « poireau ») et on la passe au
// résolveur de production. S'il rend un AUTRE slug, la ligne porte le nom d'un
// autre aliment de sa propre table. Ce n'est pas une opinion: c'est la table
// d'alias du dépôt qui le dit.
//
// ⚠️ CE SIGNAL SUR-DÉTECTE, ET C'EST VOULU. « Poulet, blanc, cru » sur
// `chicken_breast` peut désigner `chicken`: même aliment, granularité
// différente. La colonne `valeurs_identiques` sépare les deux populations —
// des valeurs identiques à la décimale près sont une COPIE, pas une nuance.
// ---------------------------------------------------------------------------
const sameNumbers = (a: Row, b: Row) =>
  (["energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const)
    .every((k) => num(a[k]) === num(b[k]));

const nameDesignatesAnother = [];
for (const r of rows) {
  const name = str(r.ciqual_name);
  if (!name) continue;
  const head = name.split(",")[0];
  const hit = resolveIngredient(index, head);
  const slug = str(r.slug);
  if (!hit || hit.slug === slug) continue;
  const other = byRow.get(hit.slug)!;
  nameDesignatesAnother.push({
    slug,
    label: str(r.label),
    ciqual_code: str(r.ciqual_code) || null,
    ciqual_name: name,
    tete: normalizeTerm(head),
    designe: hit.slug,
    energie_ligne: num(r.energy_kcal),
    energie_designee: num(other.energy_kcal),
    valeurs_identiques: sameNumbers(r, other),
    meme_groupe: str(r.food_group_ref) === str(other.food_group_ref),
  });
}

// ---------------------------------------------------------------------------
// C · LES LIGNES QUI SE DISENT CIQUAL ET NE PORTENT AUCUN CODE
//
// Elles ne sont PAS fausses: elles sont NON TRAÇABLES. Aucune confrontation à
// la source ANSES n'est possible sur ces lignes — il n'y a rien à joindre.
// C'est très exactement pourquoi l'arbitrage ① du socle refuse d'exiger un
// code pour être `verifie`: l'exiger supprimerait les trois quarts du
// référentiel et casserait le produit.
// ---------------------------------------------------------------------------
const parSource = new Map<string, number>();
for (const r of rows) parSource.set(str(r.source), (parSource.get(str(r.source)) ?? 0) + 1);
const ciqualSansCode = rows.filter((r) => str(r.source) === "ciqual" && !str(r.ciqual_code));
const ciqualAvecCode = rows.filter((r) => str(r.source) === "ciqual" && str(r.ciqual_code));

// ---------------------------------------------------------------------------
// D · LA CLASSE NE MENT PAS, LE NOM SI — fruits frais à énergie de fruit SEC
//
// Un fruit frais vit entre 30 et 90 kcal/100 g. Au-delà de 200, c'est un fruit
// SEC, un sirop ou un sucre ajouté. La ligne qui porte 321 kcal et s'appelle
// « Raisin » (sans « sec ») annonce donc un aliment et en porte un autre.
//
// ⚠️ SIGNAL D'AUDIT, PAS VERDICT. La liste de marqueurs ci-dessous est FERMÉE
// et sert à écarter les lignes qui DISENT déjà qu'elles sont sèches. Une ligne
// qui reste dans la sortie demande une lecture humaine, elle n'est pas
// condamnée.
// ---------------------------------------------------------------------------
const MARQUEURS_SEC = [
  "sec",
  "secs",
  "seche",
  "sechee",
  "seches",
  "sechees",
  "dried",
  "dry",
  "raisin",
  "sirop",
  "syrup",
  "confit",
  "candied",
  "sucre",
  "sugar",
  "sweetened",
  "juice",
  "jus",
  "puree",
  "compote",
  "jam",
  "confiture",
  "paste",
  "pate",
  "chips",
  "powder",
  "poudre",
];
const GROUPES_FRUIT = new Set(["other_fruit", "berries", "citrus"]);
const fruitsDenses = rows
  .filter((r) => GROUPES_FRUIT.has(str(r.food_group_ref)))
  .filter((r) => (num(r.energy_kcal) ?? 0) >= 200)
  .map((r) => {
    const mots = new Set(
      [normalizeTerm(str(r.label)), normalizeTerm(str(r.ciqual_name))].join(" ").split(" "),
    );
    return {
      slug: str(r.slug),
      label: str(r.label),
      ciqual_name: str(r.ciqual_name) || null,
      energy_kcal: num(r.energy_kcal),
      yield_class: str(r.yield_class),
      // Le nom AVOUE-T-IL que l'aliment est sec/sucré ?
      nom_avoue: MARQUEURS_SEC.some((m) => mots.has(m)),
    };
  })
  .filter((r) => !r.nom_avoue);

// ---------------------------------------------------------------------------
// E · LES FAUX AMIS AU NIVEAU DU SLUG — un alias que `bySlug` capture
//
// `resolveIngredient` essaie `bySlug` AVANT `byAlias`. Un alias dont la forme
// normalisée est ELLE-MÊME un slug ne se déclenche donc jamais. La migration
// `20260822113000` en a retiré 19 qui désignaient AUTRE CHOSE; on remesure,
// parce que 1 000 alias ont été écrits depuis.
// ---------------------------------------------------------------------------
const aliasMorts = aliasRows
  .map((a) => ({ ...a, forme: normalizeTerm(a.alias) }))
  .filter((a) => index.bySlug.has(a.forme.replace(/ /g, "_")))
  .map((a) => ({
    alias: a.alias,
    forme: a.forme,
    dit: a.slug,
    capture: a.forme.replace(/ /g, "_"),
    contradictoire: a.forme.replace(/ /g, "_") !== a.slug,
    energie_dite: num(byRow.get(a.slug)?.energy_kcal ?? null),
    energie_capturee: num(byRow.get(a.forme.replace(/ /g, "_"))?.energy_kcal ?? null),
  }));
const aliasMortsContradictoires = aliasMorts.filter((a) => a.contradictoire);

// ---------------------------------------------------------------------------
// F · LES RÉFÉRENCES RÉELLEMENT EMPLOYÉES PAR LES DEUX PLANS
//
// C'est la cible prioritaire de l'audit: on ne peut pas lire 943 lignes à la
// main, on peut lire celles que les deux plans de preuve ont effectivement
// touchées. Termes des plats, des préparations ET des items de boîte.
// ---------------------------------------------------------------------------
const termesDesPlans = new Map<string, { plans: Set<string>; occurrences: number }>();
for (const p of plans) {
  const unites = [...(p.dishes ?? []), ...(p.preparations ?? [])] as Row[];
  const termes: string[] = [];
  for (const u of unites) {
    for (const ing of (u.ingredients ?? []) as Row[]) termes.push(str(ing.term));
    for (const box of (u.boxes ?? []) as Row[]) {
      for (const it of (box.items ?? []) as Row[]) {
        // ⛔ UN ITEM QUI PORTE UN `preparation_id` N'EST PAS UN ALIMENT: son
        // `term` est le TITRE de la casserole (« poulet rôti, quinoa et
        // légumes »). Le compter en « non résolu » ferait passer sept titres de
        // plat pour sept trous du référentiel.
        if (str(it.preparation_id)) continue;
        termes.push(str(it.term));
      }
    }
  }
  for (const t of termes) {
    if (!t) continue;
    const key = normalizeTerm(t);
    const e = termesDesPlans.get(key) ?? { plans: new Set<string>(), occurrences: 0 };
    e.plans.add(p.id);
    e.occurrences += 1;
    termesDesPlans.set(key, e);
  }
}
const usageDesPlans = [...termesDesPlans.entries()]
  .map(([terme, e]) => {
    const hit = resolveIngredient(index, terme);
    const r = hit ? byRow.get(hit.slug) : null;
    return {
      terme,
      occurrences: e.occurrences,
      plans: [...e.plans],
      slug: hit?.slug ?? null,
      label: hit?.label ?? null,
      source: hit?.source ?? null,
      ciqual_code: r ? str(r.ciqual_code) || null : null,
      ciqual_name: r ? str(r.ciqual_name) || null : null,
      energy_kcal: hit?.energyKcal ?? null,
      food_group_ref: hit?.foodGroupRef ?? null,
    };
  })
  .sort((a, b) => b.occurrences - a.occurrences);

const nonResolus = usageDesPlans.filter((u) => !u.slug);
const sansTracabilite = usageDesPlans.filter((u) => u.slug && u.source === "ciqual" && !u.ciqual_code);

// ---------------------------------------------------------------------------
// G · LES QUATRE CAS NOMMÉS PAR L'ENQUÊTE, LIGNE PAR LIGNE
// ---------------------------------------------------------------------------
const casNommes = [
  "raisin",
  "raisins",
  "raisin sec",
  "raisins secs",
  "raisins frais",
  "prune",
  "prunes",
  "prunes sechees",
  "pruneau",
  "pruneaux",
  "poire",
  "poires",
  "poireau",
]
  .map((t) => {
    const en = resolveIngredient(index, t);
    const fr = resolveIngredient(indexFr, t);
    const r = fr ? byRow.get(fr.slug) : null;
    return {
      terme: t,
      // Ce que le produit rend AUJOURD'HUI sur un plan français.
      slug: fr?.slug ?? null,
      label: fr?.label ?? null,
      ciqual_code: r ? str(r.ciqual_code) || null : null,
      ciqual_name: r ? str(r.ciqual_name) || null : null,
      energy_kcal: fr?.energyKcal ?? null,
      // Et ce qu'un index ANGLAIS rendrait du même terme.
      slug_en: en?.slug ?? null,
      energy_kcal_en: en?.energyKcal ?? null,
      // Par quelle porte, en français.
      porte: fr
        ? (indexFr.falseFriends?.has(normalizeTerm(t))
          ? "falseFriends"
          : indexFr.bySlug.has(normalizeTerm(t).replace(/ /g, "_"))
          ? "bySlug"
          : "byAlias")
        : null,
    };
  });

// ---------------------------------------------------------------------------
// H · DEUX LIGNES, LES MÊMES CINQ NOMBRES — un doublon de fait
//
// Cinq macronutriments identiques à la décimale près sur deux slugs: ou bien
// c'est le même aliment écrit deux fois, ou bien l'un a été RECOPIÉ de l'autre.
// Dans les deux cas la ligne sans `ciqual_code` est celle qu'un humain doit
// lire: elle affirme la même mesure sans pouvoir la rattacher à sa source.
//
// ⚠️ Un doublon de fait N'EST PAS toujours un défaut: `avocado` et
// `avocado_pulp` sont le même aliment, correctement mesuré des deux côtés. Ce
// que la sortie donne, c'est la liste à lire — pas une liste à corriger.
// ---------------------------------------------------------------------------
const parNombres = new Map<string, string[]>();
for (const r of rows) {
  const k = ["energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]
    .map((c) => String(num(r[c]))).join("/");
  if (k.includes("null")) continue;
  parNombres.set(k, [...(parNombres.get(k) ?? []), str(r.slug)]);
}
const doublonsDeFait = [...parNombres.entries()]
  .filter(([, s]) => s.length > 1)
  .map(([nombres, slugs]) => ({
    nombres,
    slugs,
    lignes: slugs.map((s) => {
      const r = byRow.get(s)!;
      return {
        slug: s,
        label: str(r.label),
        ciqual_code: str(r.ciqual_code) || null,
        ciqual_name: str(r.ciqual_name) || null,
        food_group_ref: str(r.food_group_ref),
      };
    }),
    // Le cas qui compte: l'un porte un code, l'autre non.
    un_seul_code: slugs.filter((s) => str(byRow.get(s)!.ciqual_code)).length === 1,
    groupes_differents: new Set(slugs.map((s) => str(byRow.get(s)!.food_group_ref))).size > 1,
  }));

// ---------------------------------------------------------------------------
// I · UNE CLASSE ABSORBANTE SUR UNE ÉNERGIE D'ALIMENT DÉJÀ CUIT
//
// `grain_absorbs` (×2,6) et `legume_absorbs` (×2,4) déclarent des valeurs
// CRUES. Un féculent ou une légumineuse CRUS et SECS vivent entre 330 et 370
// kcal/100 g (riz 352, pâtes 336, quinoa ~370, lentilles 331, pois chiches
// 351). Sous **200**, la valeur est forcément celle de l'aliment CUIT — et le
// commentaire de `YIELD_FACTORS` le dit déjà pour les conserves: « une conserve
// est déjà hydratée: elle est `neutral` ».
//
// La ligne se fait alors diviser par son propre facteur: « 150 g de lentilles
// mijotées » devient 62,5 g × 116 = 72 kcal au lieu de 174. Toujours dans le
// même sens: trop léger.
// ---------------------------------------------------------------------------
const ABSORBANTES = new Set(["grain_absorbs", "legume_absorbs"]);
const absorbantesTropLegeres = rows
  .filter((r) => ABSORBANTES.has(str(r.yield_class)))
  .filter((r) => (num(r.energy_kcal) ?? 0) < 200)
  .map((r) => ({
    slug: str(r.slug),
    label: str(r.label),
    ciqual_name: str(r.ciqual_name) || null,
    energy_kcal: num(r.energy_kcal),
    yield_class: str(r.yield_class),
    source: str(r.source),
    facteur: str(r.yield_class) === "grain_absorbs" ? 2.6 : 2.4,
  }));

const audit = {
  genere_le: "2026-09-11",
  lignes: rows.length,
  par_source: Object.fromEntries(parSource),
  a_codes_ciqual_en_double: duplicateCodes,
  b_nom_francais_designe_une_autre_ligne: {
    total: nameDesignatesAnother.length,
    dont_valeurs_identiques: nameDesignatesAnother.filter((x) => x.valeurs_identiques).length,
    lignes: nameDesignatesAnother,
  },
  c_non_tracables: {
    ciqual_sans_code: ciqualSansCode.length,
    ciqual_avec_code: ciqualAvecCode.length,
    note:
      "Non traçables, pas fausses: aucune confrontation à la source ANSES n'est possible. " +
      "Arbitrage ① du socle: le seul champ source='ciqual' ne donne pas `verifie`, mais " +
      "l'absence de code ne le retire pas non plus — l'exiger supprimerait 689 lignes sur 881.",
  },
  d_fruits_a_energie_de_fruit_sec: fruitsDenses,
  e_alias_captures_par_un_slug: {
    total: aliasMorts.length,
    contradictoires: aliasMortsContradictoires.length,
    lignes: aliasMortsContradictoires,
  },
  f_usage_des_deux_plans: {
    termes: usageDesPlans.length,
    non_resolus: nonResolus.length,
    ciqual_sans_code: sansTracabilite.length,
    lignes: usageDesPlans,
  },
  g_cas_nommes_par_l_enquete: casNommes,
  h_doublons_de_fait: {
    total: doublonsDeFait.length,
    un_seul_code: doublonsDeFait.filter((d) => d.un_seul_code).length,
    groupes_differents: doublonsDeFait.filter((d) => d.groupes_differents).length,
    lignes: doublonsDeFait,
  },
  i_classe_absorbante_sur_energie_cuite: absorbantesTropLegeres,
};

await Deno.writeTextFile(
  new URL("lotA-audit.json", DIR),
  JSON.stringify(audit, null, 2),
);

console.log(`lignes: ${rows.length} — par source: ${JSON.stringify(audit.par_source)}`);
console.log(`A · codes CIQUAL en double: ${duplicateCodes.length}`);
for (const d of duplicateCodes) {
  console.log(`    ${d.code}: ${d.lignes.map((l) => `${l.slug}(${l.ciqual_name})`).join(" + ")}`);
}
console.log(
  `B · nom français désignant une autre ligne: ${nameDesignatesAnother.length} ` +
    `(dont ${audit.b_nom_francais_designe_une_autre_ligne.dont_valeurs_identiques} aux valeurs IDENTIQUES)`,
);
for (const x of nameDesignatesAnother.filter((y) => y.valeurs_identiques)) {
  console.log(`    ${x.slug} « ${x.ciqual_name} » → ${x.designe} (${x.energie_ligne} kcal)`);
}
console.log(
  `C · ciqual sans code: ${ciqualSansCode.length} / avec code: ${ciqualAvecCode.length}`,
);
console.log(`D · fruits ≥200 kcal dont le nom n'avoue pas: ${fruitsDenses.length}`);
for (const x of fruitsDenses) console.log(`    ${x.slug} « ${x.label} » ${x.energy_kcal} kcal`);
console.log(
  `E · alias capturés par un slug: ${aliasMorts.length} dont ${aliasMortsContradictoires.length} contradictoires`,
);
for (const x of aliasMortsContradictoires) {
  console.log(`    « ${x.alias} » dit ${x.dit} (${x.energie_dite}) → capturé par ${x.capture} (${x.energie_capturee})`);
}
console.log(
  `F · termes des deux plans: ${usageDesPlans.length}, non résolus: ${nonResolus.length}, ` +
    `résolus sans code CIQUAL: ${sansTracabilite.length}`,
);
console.log(
  `H · doublons de fait (5 macros identiques): ${doublonsDeFait.length} paires, ` +
    `dont ${audit.h_doublons_de_fait.un_seul_code} où UN SEUL côté porte un code CIQUAL et ` +
    `${audit.h_doublons_de_fait.groupes_differents} à groupes différents`,
);
for (const d of doublonsDeFait.filter((x) => x.groupes_differents || x.un_seul_code)) {
  console.log(`    ${d.lignes.map((l) => `${l.slug}[${l.ciqual_code ?? "—"}]`).join(" = ")} (${d.nombres})`);
}
console.log(
  `I · classe absorbante sur une énergie d'aliment cuit: ${absorbantesTropLegeres.length}`,
);
for (const x of absorbantesTropLegeres) {
  console.log(`    ${x.slug} « ${x.label} » ${x.energy_kcal} kcal en ${x.yield_class} (÷${x.facteur}), source=${x.source}`);
}
console.log("G · les cas nommés par l'enquête (index FR | index EN):");
for (const x of casNommes) {
  console.log(
    `    « ${x.terme} » → ${x.slug ?? "—"} (${x.energy_kcal ?? "—"} kcal) par ${x.porte ?? "—"}` +
      `   |   EN: ${x.slug_en ?? "—"} (${x.energy_kcal_en ?? "—"})`,
  );
}
