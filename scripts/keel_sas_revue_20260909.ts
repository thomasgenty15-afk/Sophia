/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA FILE DU SAS, LUE — la revue que personne ne faisait (2026-09-09).
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *       deno run -A scripts/keel_sas_revue_20260909.ts [jours]
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN. Aucun `insert`, aucun `update`, aucun appel de
 * modèle. Il lit deux tables et il imprime des lignes.
 *
 * ── POURQUOI IL EXISTE ────────────────────────────────────────────────────
 * `food_composition_pending` portait 257 lignes le 2026-09-09 et n'avait
 * JAMAIS été relue: `source = 'sas'` valait 0 sur les 925 lignes du
 * référentiel, et aucun cron n'appelle `promote_pending_food_compositions()`
 * — c'est une décision, pas un oubli (migration `20260824093000`). La file
 * est une LISTE DE TRAVAIL; une liste de travail qu'on n'imprime pas est une
 * liste qu'on ne fait pas.
 *
 * ⚠️ ET DEPUIS QUE LA LECTURE RELIT LE SAS (`indexForReading`, 2026-09-09),
 * cette revue a changé de nature. Avant, une ligne fausse coûtait une
 * ABSTENTION — « un ingrédient ne figure pas dans notre table ». Maintenant
 * elle entre dans le chiffre affiché. Le cas mesuré ce jour-là:
 *
 *     fromage rape | cruciferous_veg | 28 kcal/100 g | vu 4 fois
 *
 * Du fromage râpé rangé chez les crucifères. La ligne passe TOUTES les gardes
 * automatiques — la bande de son groupe (celui qu'elle s'est choisi), le
 * plafond absolu, et même la cohérence d'Atwater (2×4 + 4×4 + 0,4×9 ≈ 28).
 * Elle est cohérente; elle décrit simplement un autre aliment. **Aucune garde
 * automatique n'attrape ça.** C'est une erreur de SENS, et seule une lecture
 * humaine la voit. D'où cet imprimé.
 *
 * ── ⛔ CE QU'IL NE FAIT PAS: REGROUPER DES VARIANTES ──────────────────────
 * L'idée « compter `emmental râpé` et `emmental` ensemble pour atteindre le
 * seuil » est refusée, et c'est mesuré sur cette file:
 *
 *     haricots blancs secs (2) · haricots noirs egouttes (1)
 *     haricots verts et tomates rotis (1) · haricots blancs cuits egouttes (1)
 *
 * Regrouper par tête de terme ferait compter des haricots VERTS pour des
 * haricots BLANCS. C'est la cicatrice `never-hand-roll-a-matcher-here`, 12
 * faux positifs sur 12. Le tri se fait donc par ce que la ligne PÈSE, pas par
 * une parenté devinée.
 *
 * ── LE VERDICT VIENT DE LA PRODUCTION ─────────────────────────────────────
 * `promotionVerdict` est la spécification exécutable de la règle SQL, et c'est
 * elle qui est appelée ici — pas une troisième copie qui divergerait des deux
 * autres.
 */
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  groupBandsFrom,
  promotionVerdict,
} from "../supabase/functions/_shared/keel/composition_fill.ts";
import {
  normalizeTerm,
  resolveIngredient,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { readDishes, readPreparations } from "../supabase/functions/_shared/keel/plan_energy_read.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "../supabase/functions/_shared/keel/tokens.ts";

const URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const DAYS = Math.max(1, Number(Deno.args[0] ?? "30") || 30);

interface PendingRow {
  term: string;
  food_group_ref: string | null;
  energy_kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  yield_class: string;
  fill_source: string;
  sightings: number;
  status: string;
  review_reason: string | null;
}

const index = await loadCompositionIndex(admin);
const bands = groupBandsFrom(index);

const { data: pendingRaw, error: pendingErr } = await admin
  .from("food_composition_pending")
  .select(
    "term,food_group_ref,energy_kcal,protein_g,carbs_g,fat_g,yield_class," +
      "fill_source,sightings,status,review_reason",
  )
  .neq("status", "promoted");
if (pendingErr) throw new Error(`sas: ${pendingErr.message}`);
const pending = (pendingRaw ?? []) as unknown as PendingRow[];

const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
const { data: plansRaw, error: plansErr } = await admin
  .from("student_generated_meals")
  .select("id,dishes,preparations")
  .gte("created_at", since)
  .is("retired_at", null);
if (plansErr) throw new Error(`plans: ${plansErr.message}`);
const plans = (plansRaw ?? []) as Record<string, unknown>[];

// ── CE QUE CHAQUE TERME PÈSE VRAIMENT, DANS DES PLANS VIVANTS ─────────────
//
// ⚠️ APRÈS PLIAGE, et c'est le piège ② de `V0-E′`: 41 % de l'énergie vit dans
// les préparations, et une casserole faite pour quatre dîners compterait
// quatre fois sans le prorata. On plie avec la fonction de production.
const grams = new Map<string, number>();
const planCount = new Map<string, Set<string>>();
for (const row of plans) {
  const planId = String(row.id ?? "");
  const folded = foldPreparationsIntoDishes({
    dishes: readDishes(row.dishes).map((d) => ({
      slot: null,
      method: d.method,
      ingredients: d.ingredients,
      uses: d.uses,
    })),
    preparations: readPreparations(row.preparations).map((p) => ({
      id: p.id,
      servingsMade: p.servingsMade,
      ingredients: p.ingredients,
    })),
  });
  for (const dish of folded) {
    for (const ing of dish.ingredients) {
      const term = normalizeTerm(String(ing.term ?? ""));
      if (!term) continue;
      const g = Number(ing.amount);
      if (Number.isFinite(g) && String(ing.unit ?? "") === "g") {
        grams.set(term, (grams.get(term) ?? 0) + g);
      }
      let set = planCount.get(term);
      if (!set) planCount.set(term, set = new Set());
      set.add(planId);
    }
  }
}

const rows = pending.map((p) => {
  const group = p.food_group_ref;
  const inVocab = group !== null && (FOOD_GROUP_REFS as readonly string[]).includes(group);
  const slug = p.term.replace(/ /g, "_");
  const g = grams.get(p.term) ?? 0;
  // ⛔ LE RÉFÉRENTIEL GAGNE, ET IL FAUT LE MESURER ICI AUSSI. Voir `live`.
  const resolvesAlready = resolveIngredient(index, p.term) !== null;
  // ⛔ LE STATUT PASSE AVANT LE VERDICT, ET C'EST UN DÉFAUT CORRIGÉ LE JOUR
  // MÊME. `promotionVerdict` ne lit PAS `status` — c'est la spécification de la
  // règle SQL, qui filtre `status = 'pending'` dans sa boucle. Appelée telle
  // quelle ici, elle annonçait « prête à promouvoir » 12 lignes dont les 7 que
  // la curation venait de REJETER: une liste de travail qui redésigne le
  // travail qu'on vient d'écarter.
  if (p.status === "rejected" || p.status === "needs_review") {
    return {
      term: p.term,
      group: group ?? "—",
      kcal100: Number(p.energy_kcal),
      carries: Math.round((g * Number(p.energy_kcal)) / 100),
      grams: Math.round(g),
      plans: planCount.get(p.term)?.size ?? 0,
      sightings: p.sightings,
      source: p.fill_source,
      status: p.status,
      // ⛔ UNE MAIN HUMAINE A TRANCHÉ. Aucune règle automatique ne revient
      // dessus: `rejected` sort des deux chemins, `needs_review` attend une
      // seconde lecture.
      verdict: p.status === "rejected" ? "rejected" : "review",
      reason: p.review_reason ?? "",
      resolvesAlready,
      live: p.fill_source === "model" && p.status !== "rejected" && !resolvesAlready,
    };
  }
  const verdict = promotionVerdict({
    sightings: p.sightings,
    fillSource: p.fill_source === "model" ? "model" : "group_bounds",
    group: inVocab ? group as FoodGroupRef : null,
    energyKcal: Number(p.energy_kcal),
    proteinG: p.protein_g === null ? null : Number(p.protein_g),
    carbsG: p.carbs_g === null ? null : Number(p.carbs_g),
    fatG: p.fat_g === null ? null : Number(p.fat_g),
    band: inVocab ? bands.get(group as FoodGroupRef) ?? null : null,
    slugTaken: index.bySlug.has(slug),
    aliasExists: index.byAlias.has(p.term),
  });
  return {
    term: p.term,
    group: group ?? "—",
    kcal100: Number(p.energy_kcal),
    // ⚠️ CE QUE LA LIGNE PORTE, en kcal, dans les plans vivants. C'est le seul
    // ordre honnête: `sightings` compte des rencontres, pas de l'influence.
    carries: Math.round((g * Number(p.energy_kcal)) / 100),
    grams: Math.round(g),
    plans: planCount.get(p.term)?.size ?? 0,
    sightings: p.sightings,
    source: p.fill_source,
    status: p.status,
    verdict: verdict.outcome,
    reason: verdict.reason ?? p.review_reason ?? "",
    // ⛔ EST-ELLE DÉJÀ DANS UN CHIFFRE AFFICHÉ ?
    //
    // TROIS CONDITIONS, ET LA TROISIÈME A CORRIGÉ CE COMPTEUR LE JOUR MÊME.
    // `indexForReading` ne relit que les lignes `model`; et `withFilledRefs`
    // REFUSE (`already_resolved`) tout terme que l'index de base sait déjà
    // lire. **30 lignes de cette file sont dans ce cas** — `poulet`,
    // `yaourt de soja nature`, `galette complete`… — parce que les migrations
    // d'alias curés (`20260824093000` et les suivantes) leur ont donné une
    // route depuis. Les compter ici gonflait le chiffre de 138 à sa moitié, et
    // faisait remonter en tête de la revue des termes que le RÉFÉRENTIEL sert
    // déjà: une file de travail qui désigne du travail déjà fait.
    resolvesAlready,
    live: p.fill_source === "model" && p.status !== "promoted" && !resolvesAlready,
  };
}).sort((a, b) =>
  Number(b.live) - Number(a.live) || b.carries - a.carries || b.sightings - a.sightings
);

const live = rows.filter((r) => r.live);
const liveKcal = live.reduce((s, r) => s + r.carries, 0);

console.log(`\n════ LA FILE DU SAS — ${rows.length} lignes, plans des ${DAYS} derniers jours\n`);
console.log(
  `  lignes qui entrent DÉJÀ dans un chiffre affiché (model, non promues) : ${live.length}`,
);
console.log(`  énergie qu'elles portent dans ces plans                            : ${liveKcal} kcal`);
console.log(`  prêtes à promouvoir (toutes gardes passées)                        : ${
  rows.filter((r) => r.verdict === "promote").length
}`);
console.log(`  en attente du seuil de 3                                           : ${
  rows.filter((r) => r.verdict === "wait").length
}`);
console.log(`  à revoir (une garde a mordu)                                       : ${
  rows.filter((r) => r.verdict === "review").length
}`);
console.log(`  ecartees a la main (rejected)                                      : ${
  rows.filter((r) => r.verdict === "rejected").length
}`);
console.log(`  jamais promouvables (milieu de bande)                              : ${
  rows.filter((r) => r.verdict === "skip").length
}\n`);

const pad = (s: string | number, n: number) => String(s).padEnd(n).slice(0, n);
const num = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  `${pad("terme", 42)} ${pad("groupe", 18)} ${num("kcal/100", 8)} ${num("porte", 7)} ${
    num("plans", 5)
  } ${num("vus", 3)} ${pad("verdict", 8)} raison`,
);
console.log("─".repeat(120));
for (const r of rows) {
  if (r.carries === 0 && r.verdict !== "promote") continue;
  console.log(
    `${pad(r.term, 42)} ${pad(r.group, 18)} ${num(r.kcal100, 8)} ${
      num(r.live ? r.carries : "—", 7)
    } ${num(r.plans, 5)} ${num(r.sightings, 3)} ${pad(r.verdict, 8)} ${
      r.resolvesAlready ? "(le référentiel le lit déjà) " : ""
    }${r.reason}`,
  );
}
console.log(
  "\n⚠️  Les lignes du haut sont celles qui pèsent le plus dans les chiffres affichés.",
);
console.log(
  "    Une ligne dont le GROUPE ne correspond pas au nom est fausse même si toutes",
);
console.log("    les gardes passent — aucune garde automatique n'attrape ça.\n");

// La contre-épreuve d'un terme du sas qui résoudrait déjà: elle ne devrait
// jamais arriver (`record_food_composition_sightings` la refuse), et si elle
// arrive, on veut le savoir plutôt que de la voir promue.
const shadowing = pending.filter((p) => resolveIngredient(index, p.term) !== null);
if (shadowing.length > 0) {
  console.log(`⛔ ${shadowing.length} ligne(s) du sas résolvent DÉJÀ sur le référentiel:`);
  for (const p of shadowing) console.log(`   ${p.term}`);
  console.log("");
}
