/**
 * ── L'ÉNERGIE D'UN PLAN DE FOYER, BOUCHE PAR BOUCHE ───────────────────────
 * ⛔ LECTURE DE FICHIERS SEULE. `mouthDayEnergy`, `mouthTargetKcal` et les deux
 * enveloppes sont IMPORTÉS de la production. Les entrées de `mouthTargetKcal`
 * sont construites à partir du ROSTER relu en base — c'est la même source que
 * la lane, pas une recopie de sa logique.
 *
 *   deno run --allow-read 31-energie-foyer.ts <ref> <plan.json> <roster.json>
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  type CompositionIndex,
  COMPOSITION_UNITS,
  type CompositionState,
  type CompositionUnit,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import {
  type EnergyDish,
  type EnergyIngredient,
  type EnergyPreparation,
  planEnergy,
} from "../../supabase/functions/_shared/keel/plan_energy.ts";
import {
  type MouthEnergyDish,
  mouthDayEnergy,
} from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import {
  childEnvelopeFromBody,
  maintenanceEnvelopeFromBody,
} from "../../supabase/functions/_shared/keel/meal_envelope.ts";
import { type AnchorMouth, mouthTargetKcal } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
import { scaleDirectionOf } from "../../supabase/functions/_shared/keel/weight_pace.ts";
import { readQuantityFromProse } from "../../supabase/functions/_shared/keel/quantity_from_prose.ts";
import {
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
function readIng(raw: unknown): EnergyIngredient | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  const term = String(i.term ?? "").trim();
  if (!term) return null;
  const amount = Number(i.amount);
  const unit = String(i.unit ?? "");
  const state = String(i.state ?? "");
  return {
    term,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit) ? (unit as CompositionUnit) : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state)
      ? (state as CompositionState)
      : null,
    quantity: typeof i.quantity === "string" ? i.quantity : null,
  };
}
const readIngs = (r: unknown): EnergyIngredient[] =>
  Array.isArray(r) ? r.map(readIng).filter((x): x is EnergyIngredient => !!x) : [];

// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const roster = JSON.parse(Deno.readTextFileSync(rosterFile)) as any[];
const nameOf = new Map<string, string>(roster.map((r) => [r.member_id, r.first_name]));

const dishes: MouthEnergyDish[] = (plan.dishes ?? []).map((
  // deno-lint-ignore no-explicit-any
  d: any,
) => ({
  day: d.day ?? null,
  slot: d.slot ?? null,
  method: String(d.method ?? ""),
  ingredients: readIngs(d.ingredients),
  // deno-lint-ignore no-explicit-any
  uses: (d.uses ?? []).map((u: any) => ({
    preparationId: String(u.preparation_id ?? ""),
    servings: Number(u.servings) || 1,
  })).filter((u: { preparationId: string }) => u.preparationId !== ""),
  // deno-lint-ignore no-explicit-any
  boxes: (d.boxes ?? []).map((b: any) => ({
    memberIds: (b.member_ids ?? []).map(String),
    // deno-lint-ignore no-explicit-any
    items: (b.items ?? []).map((it: any) => ({ grams: Number(it.grams) || 0 })),
    legacyTotalGrams: b.total_grams === undefined || b.total_grams === null
      ? null
      : Number(b.total_grams),
  })),
}));
// deno-lint-ignore no-explicit-any
const preps: EnergyPreparation[] = (plan.preparations ?? []).map((p: any) => ({
  id: String(p.id ?? ""),
  servingsMade: Math.max(1, Number(p.servings_made) || 1),
  ingredients: readIngs(p.ingredients),
})).filter((p) => p.id !== "");

const index: CompositionIndex = await loadCompositionIndex(fileClient());
const rows = mouthDayEnergy({ index, dishes, preparations: preps });

const cibles = roster.map((r) => {
  const minor = r.age_years !== null && r.age_years < 18;
  const body = {
    heightCm: r.height_cm ?? null,
    weightKg: r.weight_kg ?? null,
    gender: r.gender ?? null,
    ageYears: r.age_years ?? null,
    activityLevel: r.activity_level ?? null,
    activityAxes: {
      day: r.day_activity ?? null,
      sport: r.sport_frequency ?? null,
      asked: !!(r.day_activity && r.sport_frequency),
    },
    appetite: r.appetite ?? null,
  };
  const env = minor ? childEnvelopeFromBody(body) : maintenanceEnvelopeFromBody(body);
  // LA CIBLE DU JOUR DE CETTE BOUCHE — la fonction de la lane, sur les valeurs
  // de sa fiche. `paceKgPerWeek: null` ⇒ le cran par défaut de sa direction,
  // exactement ce que la lane fait quand le curseur n'est pas réglé.
  const mouth: AnchorMouth = {
    memberId: r.member_id,
    ageState: minor ? "minor" : "adult",
    // « clear » = compte lu, plancher NON levé ; « no_account » pour une bouche
    // sans compte. Les deux rendent `restrictionFlag: false`, qui est l'état des
    // dix fixtures de cette campagne (aucune n'a de condition déclarée).
    restriction: r.member_id === roster[0].member_id ? "clear" : "no_account",
    body,
    direction: r.goal ? scaleDirectionOf(r.goal) : null,
    paceKgPerWeek: null,
    declaredSlots: [],
    slotExtraKcal: null,
    conditionRefs: [],
    portionIndex: null,
  };
  const target = mouthTargetKcal(mouth, "no_position");
  return {
    name: r.first_name,
    member_id: r.member_id,
    goal: r.goal,
    diet: r.diet,
    minor,
    age: r.age_years,
    weight: r.weight_kg,
    envelope_maintenance: env,
    target_kcal: target.kcal,
    target_reason: target.reason,
  };
});

// ── LE POT, AU NIVEAU DE LA TABLE ─────────────────────────────────────────
// ⛔ POURQUOI CETTE MESURE EXISTE: sur un foyer servi « à l'assiette »
// (`family_service`), AUCUNE bouche n'a de contenant nominatif, donc
// `mouthDayEnergy` rend `null` partout et l'on ne peut rien dire. Ce que l'on
// peut encore mesurer, c'est ce que la TABLE reçoit: l'énergie du plan pour
// la journée, contre la SOMME des cibles des bouches. Un pot qui ne tient pas
// la somme ne peut nourrir personne correctement, quelle que soit la découpe.
const table = planEnergy({
  index,
  dishes: dishes.map((d) => ({
    day: d.day,
    method: d.method,
    ingredients: d.ingredients,
    uses: d.uses,
  })) as EnergyDish[],
  preparations: preps,
  servings: 1,
  addons: [],
  mealsOutByDay: new Map(),
});
const sommeCibles = cibles.reduce((a, c) => a + (c.target_kcal ?? 0), 0);

// ── CE QUE LA MAISON REÇOIT, EN DEUX MORCEAUX QUI NE SE RECOUVRENT PAS ────
//
// ⛔ POURQUOI PAS `planEnergy`. Sur cette lane, un plat du midi ne porte que
// ses accompagnements: la matière est dans la CASSEROLE, et `uses.servings`
// vaut 1 par CELLULE DE TABLE, pas par bouche. `planEnergy` compte donc une
// portion là où quatre personnes mangent, et rend 25 % du besoin — un chiffre
// faux dans le sens qui alarme.
//
// La règle de lecture, vérifiée sur la structure rendue (plan F1, 2026-09-09):
//   · les ingrédients PROPRES d'un plat sont écrits PAR PERSONNE
//     (« 200 g Greek yoghurt » pendant que le bac de la même case en porte 732
//     pour quatre) ⇒ ils comptent × le nombre de bouches;
//   · une PRÉPARATION est un lot de maison ⇒ elle compte UNE FOIS, en entier,
//     dès que le plan la consomme.
// deno-lint-ignore no-explicit-any
const platsPropres = (plan.dishes ?? []).flatMap((d: any) => readIngs(d.ingredients));
const resPlats = resolveIngredients(index, platsPropres);
const nutPlats = nutrientsOf(resPlats.resolved, { friedMethod: false });
const potsIngr = preps.flatMap((p) => [...p.ingredients]);
const resPots = resolveIngredients(index, potsIngr);
const nutPots = nutrientsOf(resPots.resolved, { friedMethod: false });
const bouches = cibles.length || 1;

// ── ET CE QUI EST RÉELLEMENT ACHETÉ ───────────────────────────────────────
// ⛔ CE PARSEUR EST LE MIEN, ET IL EST NOMMÉ COMME TEL. `readQuantityFromProse`
// (production) est ancré sur la fin de chaîne: il lit « 960 g » et rend `null`
// sur « 960 g Greek yoghurt », qui est la forme d'une ligne de COURSES. Le
// produit n'en a pas besoin — la liste est DÉRIVÉE des ingrédients, jamais
// relue. Ici on veut le dénominateur que seule la liste porte: ce que la
// maison rapporte pour la fenêtre. On lit donc la tête de la ligne, et le
// compteur `lignes_lues` dit combien de lignes ont été comprises.
const TETE = /^\s*(\d+(?:[.,]\d+)?)\s*(g|ml|kg|l|tbsp|tsp)?\b/i;
// deno-lint-ignore no-explicit-any
const courses: any[] = plan.shopping_list ?? [];
let lignesLues = 0;
const lignesCourses = courses.map((l) => {
  const m = TETE.exec(String(l.quantity ?? ""));
  if (!m) return null;
  let amount = Number(m[1].replace(",", "."));
  let unit = (m[2] ?? "unit").toLowerCase();
  if (unit === "kg") { amount *= 1000; unit = "g"; }
  if (unit === "l") { amount *= 1000; unit = "ml"; }
  lignesLues++;
  return {
    term: String(l.term ?? ""),
    amount,
    unit: unit as CompositionUnit,
    // ⚠️ « raw » ET PAS `null`: sur un aliment dont le référentiel connaît les
    // deux états (lentilles, couscous, poulet), l'absence d'état fait ABSTENIR
    // le résolveur — huit lignes de courses sur trente-deux, dont le poulet et
    // les légumineuses, sortaient `unknown` sans être comptées inconnues.
    // Ce qu'on achète est cru: c'est la seule lecture qui a un sens ici.
    state: "raw" as CompositionState,
    quantity: null,
  };
}).filter((x): x is NonNullable<typeof x> => x !== null);
const resCourses = resolveIngredients(index, lignesCourses);
const nutCourses = nutrientsOf(resCourses.resolved, { friedMethod: false });
const jours = Number(plan.window?.duration_days ?? 0) || 1;

console.log(JSON.stringify({
  cibles,
  courses: {
    lignes: courses.length,
    lignes_lues: lignesLues,
    resolues: resCourses.resolved.length,
    inconnues: resCourses.unresolvedTerms,
    kcal_total: nutCourses === "unknown" ? null : Math.round(nutCourses.energyKcal),
    proteine_total_g: nutCourses === "unknown" ? null : Math.round(nutCourses.proteinG ?? 0),
    kcal_par_bouche_par_jour: nutCourses === "unknown"
      ? null
      : Math.round(nutCourses.energyKcal / bouches / jours),
    proteine_par_bouche_par_jour_g: nutCourses === "unknown"
      ? null
      : Math.round((nutCourses.proteinG ?? 0) / bouches / jours),
  },
  maison: (() => {
    const kPlats = nutPlats === "unknown" ? null : nutPlats.energyKcal;
    const kPots = nutPots === "unknown" ? null : nutPots.energyKcal;
    const pPlats = nutPlats === "unknown" ? null : nutPlats.proteinG;
    const pPots = nutPots === "unknown" ? null : nutPots.proteinG;
    const kcal = kPlats === null || kPots === null ? null : kPlats * bouches + kPots;
    const prot = pPlats === null || pPots === null ? null : pPlats * bouches + pPots;
    return {
      bouches,
      jours,
      plats_propres_kcal_par_personne: kPlats === null ? null : Math.round(kPlats),
      casseroles_kcal_total: kPots === null ? null : Math.round(kPots),
      total_fenetre_kcal: kcal === null ? null : Math.round(kcal),
      kcal_par_bouche_par_jour: kcal === null ? null : Math.round(kcal / bouches / jours),
      proteine_par_bouche_par_jour_g: prot === null ? null : Math.round(prot / bouches / jours),
      cible_moyenne_par_bouche: Math.round(sommeCibles / bouches),
      couverture: kcal === null
        ? null
        : Math.round(100 * (kcal / bouches / jours) / (sommeCibles / bouches)) + " %",
      inconnues: [...new Set([...resPlats.unresolvedTerms, ...resPots.unresolvedTerms])],
      non_pesees: [...new Set([...resPlats.unweighedTerms, ...resPots.unweighedTerms])],
    };
  })(),
  table: {
    somme_cibles_kcal: sommeCibles,
    jours: table.days.map((d) => ({
      day: d.day,
      kcal: d.kcal === null ? null : Math.round(d.kcal),
      complete: d.complete,
      counted: `${d.dishesCounted}/${d.dishesTotal}`,
      part_de_la_somme: d.kcal === null || sommeCibles === 0
        ? null
        : Math.round(100 * d.kcal / sommeCibles) + " %",
    })),
  },
  par_bouche: rows.map((x) => ({
    name: nameOf.get(x.memberId) ?? x.memberId,
    day: x.day,
    kcal: x.kcal === null ? null : Math.round(x.kcal),
    complete: x.complete,
    counted: `${x.dishesCounted}/${x.dishesTotal}`,
    unattributed: x.unattributedDishes,
    slots: x.slots,
    grams: Math.round(x.grams),
    maxMealGrams: Math.round(x.maxMealGrams),
    gaps: x.gaps,
  })),
}, null, 1));
