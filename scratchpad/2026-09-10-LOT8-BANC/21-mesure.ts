/**
 * ── LA MESURE D'UN PLAN ARCHIVÉ, SUR L'INDEX QUE CE RUN-LÀ AVAIT ───────────
 *
 *   deno run --allow-read 21-mesure.ts <fixture.json>
 *
 * ⛔ TOUT NOMBRE VIENT D'UNE FONCTION DE PRODUCTION. `planEnergy`,
 * `mouthDayEnergy`, `dishEnergy`, `mouthTargetKcal`, `slotPlanTargets`,
 * `plateBoundsFor`, `indexForReading` sont importés de
 * `supabase/functions/_shared/keel/`. Ce fichier ne réécrit aucune arithmétique
 * du produit : un banc qui recalcule à sa façon mesure son propre code.
 *
 * ── ① L'INDEX DU RUN, RESTAURÉ — PAS LE SAS D'AUJOURD'HUI ─────────────────
 * `21-mesure-avec-sas.py` ajoutait les 291 lignes du sas ACTUEL à tous les
 * runs, en les recopiant à la main à la forme d'une fiche. Deux défauts dans
 * un seul geste : le run du 12 h 00 ne pouvait pas voir une ligne écrite à
 * 13 h 13, et la recopie contournait les deux ceintures de `withFilledRefs`.
 *
 * Ici : les lignes du sas sont filtrées sur `first_seen_at <= horodatage du
 * run`, et elles entrent par `indexForReading`, c'est-à-dire par la porte de
 * production. Ce qui n'est pas restaurable est NOMMÉ, pas comblé :
 *
 *   · `fill_source = 'model'`  → restaurable. `filledFromPendingRow` la relit,
 *     et `record_food_composition_sightings` ne réécrit jamais une ligne
 *     `model` : la valeur d'aujourd'hui EST celle du run.
 *   · `fill_source = 'group_bounds'` → NON restaurable. La relecture du sas la
 *     refuse ; sa valeur venait des bornes du groupe calculées en vol. La part
 *     d'énergie concernée est rendue par `composition_energy_sources`, et les
 *     journées touchées sortent `unknown`.
 */
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  type CompositionIndex,
  COMPOSITION_UNITS,
  type CompositionState,
  type CompositionUnit,
  resolveIngredients,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import { indexForReading } from "../../supabase/functions/_shared/keel/composition_fill_io.ts";
import {
  dishEnergy,
  type EnergyDish,
  type EnergyIngredient,
  type EnergyPreparation,
  planEnergy,
} from "../../supabase/functions/_shared/keel/plan_energy.ts";
import {
  boxKcalByItems,
  type MouthEnergyDish,
  mouthDayEnergy,
  potAttributionGap,
  potDensities,
} from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import {
  type AnchorMouth,
  mouthTargetKcal,
  slotPlanTargets,
} from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
import { plateBoundsFor } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { scaleDirectionOf } from "../../supabase/functions/_shared/keel/weight_pace.ts";
import {
  dayTokenOf,
  windowDates,
  windowDayOrder,
} from "../../supabase/functions/_shared/keel/meal_plan_window.ts";
import { slotsPassedToday } from "../../supabase/functions/_shared/keel/plan_hours.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

const fixture = JSON.parse(Deno.readTextFileSync(Deno.args[0])) as Any;
const readNd = (f: string) =>
  Deno.readTextFileSync(f).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

// ── LE CLIENT DE FICHIERS ─────────────────────────────────────────────────
// Il sert les DEUX formes que la production utilise: `.range()` pour charger
// le référentiel, `.in()` pour interroger le sas. Une seule implémentation:
// deux clients divergeraient au premier changement de colonne.
function fileClient(refDir: string, sasRows: Any[]) {
  const cache = new Map<string, Any[]>();
  const rowsOf = (t: string) => {
    if (t === "food_composition_pending_by_form") return sasRows;
    if (!cache.has(t)) cache.set(t, readNd(`${refDir}/${t}.ndjson`));
    return cache.get(t)!;
  };
  return {
    rpc: (_fn: string, _args: Record<string, unknown>) => Promise.resolve({ error: null }),
    from(table: string) {
      return {
        select(_c: string) {
          return {
            range(a: number, b: number) {
              return Promise.resolve({ data: rowsOf(table).slice(a, b + 1), error: null });
            },
            in(column: string, values: readonly string[]) {
              const wanted = new Set(values);
              return Promise.resolve({
                data: rowsOf(table).filter((r) => wanted.has(String(r[column]))),
                error: null,
              });
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

const plan = JSON.parse(Deno.readTextFileSync(fixture.plan)) as Any;

// ── ① L'INDEX ─────────────────────────────────────────────────────────────
const sasAll: Any[] = readNd(fixture.sasFile);
// ⛔ LA COUPURE EST L'HEURE DU RUN, PAS AUJOURD'HUI. `first_seen_at` postérieur
// = ligne que ce run ne pouvait pas voir.
const coupure = Date.parse(fixture.sasCutoff);
const sasRows = sasAll.filter((r) => {
  const t = Date.parse(String(r.first_seen_at ?? ""));
  return Number.isFinite(t) && t <= coupure;
});

const base: CompositionIndex = await loadCompositionIndex(fileClient(fixture.refDir, []));

const dishesRaw: Any[] = plan.dishes ?? [];
const prepsRaw: Any[] = plan.preparations ?? [];
const preps: EnergyPreparation[] = prepsRaw.map((p) => ({
  id: String(p.id ?? ""),
  servingsMade: Math.max(1, Number(p.servings_made) || 1),
  ingredients: readIngs(p.ingredients),
})).filter((p) => p.id !== "");

// Tous les termes du plan — c'est la worklist que `indexForReading` réduit
// lui-même à ce que l'index de base ne sait pas lire.
const tousLesTermes = [
  ...dishesRaw.flatMap((d) => readIngs(d.ingredients)),
  ...preps.flatMap((p) => [...p.ingredients]),
];
const lecture = await indexForReading({
  db: fileClient(fixture.refDir, sasRows) as Any,
  baseIndex: base,
  inputs: tousLesTermes,
});
const index = lecture.index;

const dishes: MouthEnergyDish[] = dishesRaw.map((d) => ({
  day: d.day ?? null,
  slot: d.slot ?? null,
  method: String(d.method ?? ""),
  ingredients: readIngs(d.ingredients),
  uses: (d.uses ?? []).map((u: Any) => ({
    preparationId: String(u.preparation_id ?? ""),
    servings: Number(u.servings) || 1,
  })).filter((u: { preparationId: string }) => u.preparationId !== ""),
  boxes: (d.boxes ?? []).map((b: Any) => ({
    memberIds: (b.member_ids ?? []).map(String),
    items: (b.items ?? []).map((it: Any) => ({
      grams: Number(it.grams) || 0,
      preparationId: it.preparation_id ?? null,
    })),
    legacyTotalGrams: b.total_grams === undefined || b.total_grams === null
      ? null
      : Number(b.total_grams),
  })),
}));

// ── ② LES CIBLES PAR BOUCHE ───────────────────────────────────────────────
// `mouthTargetKcal` est la fonction de la lane. Elle est appelée pour la lane
// SOLO aussi: le lot 1 du chantier a fait d'un compte seul un foyer d'une
// personne, et la mesure doit lire la même équation des deux côtés.
const mouths: Any[] = fixture.mouths ?? [];
const cibles = mouths.map((m) => {
  const minor = m.ageYears !== null && m.ageYears < 18;
  const body = {
    heightCm: m.heightCm ?? null,
    weightKg: m.weightKg ?? null,
    gender: m.gender ?? null,
    ageYears: m.ageYears ?? null,
    activityLevel: m.activityLevel ?? null,
    activityAxes: {
      day: m.dayActivity ?? null,
      sport: m.sportFrequency ?? null,
      asked: !!(m.dayActivity && m.sportFrequency),
    },
    appetite: m.appetite ?? null,
  };
  const mouth: AnchorMouth = {
    memberId: m.memberId,
    ageState: minor ? "minor" : "adult",
    restriction: m.restriction ?? "no_account",
    body,
    direction: m.goal ? scaleDirectionOf(m.goal) : null,
    paceKgPerWeek: m.paceKgPerWeek ?? null,
    declaredSlots: fixture.declaredSlots ?? [],
    // ⚠️ PAS DE `slotExtraKcal` ICI. `21-energie-foyer.ts` en posait un;
    // `AnchorMouth` ne l'a pas, et `deno check` le refusait — une propriété en
    // trop traverse en JS et ne dit rien, mais elle laisse croire qu'un apport
    // fixe a été transmis alors que rien ne le lit.
    conditionRefs: [],
    portionIndex: null,
  };
  const t = mouthTargetKcal(mouth, "no_position");
  // ⛔ LA CIBLE DU PRODUIT GAGNE QUAND LE JOURNAL LA PORTE. La lane solo
  // journalise `keel.meal.day_target.kcal` — c'est le nombre que le moteur a
  // POURSUIVI ce jour-là. `20-mesure.py` prenait `(energy_low + energy_high)/2`,
  // le milieu de l'enveloppe, qui n'est pas la cible: sur S2, 1 978 au lieu de
  // 1 918, soit 3,1 % d'écart injecté par l'instrument avant toute mesure.
  const impose = m.targetKcalOverride ?? null;
  return {
    memberId: m.memberId,
    name: m.name,
    ageYears: m.ageYears ?? null,
    minor,
    goal: m.goal ?? null,
    targetKcal: impose ?? t.kcal,
    targetReason: impose === null ? t.reason : "journal_du_produit",
    /** La contre-épreuve: ce que `mouthTargetKcal` aurait dit sans le journal. */
    targetKcalRecalcule: t.kcal,
  };
});
const cibleDe = new Map(cibles.map((c) => [c.memberId, c]));
const nomDe = new Map(mouths.map((m) => [m.memberId, m.name]));
const appetitDe = new Map(mouths.map((m) => [m.memberId, m.appetite ?? null]));

// ── ③ CE QUE CHAQUE PLAT PÈSE, ET CE QUE CHAQUE CONTENANT PORTE ───────────
// ⛔ CHAQUE OCCURRENCE EST RENDUE, PAS UN TAUX. « Une médiane de taux ne
// démontre pas que toutes les portions passent » (§ lot 8). Le rapport compte
// les lignes de cette liste; il ne les moyenne pas.
const declared: string[] = fixture.declaredSlots ?? [];
const light: string[] = fixture.lightSlots ?? [];

/** Les moments réellement composés pour cette bouche, par jour. */
const slotsParBoucheJour = new Map<string, Set<string>>();
/**
 * QUI MANGE CE PLAT. La règle de `meals_delivered.ts`, mot pour mot: un plat
 * SANS couvercle nominatif est le plat de la table — tout le monde y mange.
 *
 * ⚠️ LA LANE SOLO ÉCRIT `member_ids: []` SUR SES BOÎTES. Une boîte présente
 * mais anonyme n'est donc pas « une boîte de personne »: c'est la boîte de la
 * seule bouche du foyer. Sans cette ligne, la couverture solo rendait deux
 * repas livrés sur sept — le banc s'accusait lui-même.
 */
function mangeursDe(d: MouthEnergyDish): string[] {
  const nommes = [...new Set(d.boxes.flatMap((b) => b.memberIds))];
  return nommes.length > 0 ? nommes : mouths.map((m) => m.memberId);
}
for (const d of dishes) {
  if (!d.day || !d.slot) continue;
  const qui = mangeursDe(d);
  for (const mid of qui) {
    const k = `${mid}|${d.day}`;
    if (!slotsParBoucheJour.has(k)) slotsParBoucheJour.set(k, new Set());
    slotsParBoucheJour.get(k)!.add(d.slot);
  }
}

const plats = dishesRaw.map((d, i) => {
  const md = dishes[i];
  const e = dishEnergy(index, { method: md.method, ingredients: md.ingredients });
  const res = resolveIngredients(index, md.ingredients);
  const boites = md.boxes.map((b, j) => ({
    id: String((d.boxes ?? [])[j]?.id ?? ""),
    memberIds: b.memberIds,
    grams: b.items.reduce((n, it) => n + it.grams, 0),
    /** UN nom = une prescription. Plusieurs = une quantité de bac (v4). */
    kind: b.memberIds.length === 1 ? "own" : "tub",
  }));
  return {
    day: md.day,
    slot: md.slot,
    title: String(d.title ?? d.name ?? ""),
    kcal: e.kcal,
    complete: e.complete,
    gaps: e.gaps,
    unreadableTerms: e.unreadableTerms,
    boundedKcal: e.boundedKcal,
    boundedTerms: e.boundedTerms,
    /** ⛔ CE QUI N'A PAS DE QUANTITÉ, NOMMÉ. Un ingrédient non pesé sort du
     * verdict sans faire de bruit — c'est la cicatrice « dense non pesé =
     * énergie perdue en silence ». */
    unweighedTerms: res.unweighedTerms,
    boxes: boites,
  };
});

/**
 * LES VIOLATIONS DE GRAMMES, UNE PAR OCCURRENCE.
 *
 * ⛔ LE BAC N'EST PAS DIVISÉ. `mouth_energy.ts` refuse de tirer une portion
 * d'un contenant à plusieurs noms, et il a raison. Ce qu'on contrôle ici est
 * ce que le produit a ÉCRIT: un couvercle à un nom se compare aux bornes de
 * cette personne; un bac se compare à la SOMME des bornes de ses mangeurs,
 * qui est la façon dont `lidPlanFor` l'a construit (`factorSum`).
 *
 * ⚠️ ET LA PART INTERNE EXISTE QUAND MÊME (§ lot 8: « toute personne
 * dimensionnable possède une mesure interne, même en service collectif »).
 * Elle est le prorata des cibles du moment — la même proportion que la somme
 * des facteurs du bac. Elle est NOMMÉE `part_interne`, jamais présentée comme
 * une lecture d'assiette.
 */
const bornesDe = new Map<string, Any>();
function bornes(memberId: string, day: string, slot: string) {
  const k = `${memberId}|${day}|${slot}`;
  if (bornesDe.has(k)) return bornesDe.get(k);
  const c = cibleDe.get(memberId);
  const couverts = [...(slotsParBoucheJour.get(`${memberId}|${day}`) ?? [])];
  let part: number | null = null;
  if (c?.targetKcal != null && couverts.length > 0) {
    const t = slotPlanTargets({
      targetKcal: c.targetKcal,
      coveredSlots: couverts,
      wholeSlots: declared.length > 0 ? declared : couverts,
      lightSlots: light,
      slotFixedKcal: null,
    });
    part = t.bySlot.get(slot) ?? null;
  }
  // ⚠️ `appetite` EST PASSÉ, comme les deux appelants de production le font
  // (`generate-meal-v1:3609`, `generate-household-meal-v1:9277`). L'omettre
  // rendrait ×1,00 partout et ferait passer une borne élargie pour une borne
  // franchie — le banc accuserait le produit d'un défaut qu'il n'a pas.
  const b = plateBoundsFor({
    ageYears: c?.ageYears ?? null,
    slot,
    slotTargetKcal: part,
    light: light.includes(slot),
    appetite: (appetitDe.get(memberId) ?? null) as Any,
  });
  const out = { slotTargetKcal: part, ...b };
  bornesDe.set(k, out);
  return out;
}

/**
 * ⛔ LA BORNE EST CELLE D'UN REPAS, PAS D'UN CONTENANT. Premier jet de ce banc:
 * chaque boîte était comparée aux bornes du moment, et F5·1 sortait quatre
 * `under_min` sur des tartines de 38 à 111 g. Ces boîtes sont le SECOND plat
 * d'un même petit-déjeuner: Theo prend 651 g de frittata PLUS 49 g de tartine,
 * soit 700 g exactement dans [275, 700]. Le produit disait 28/28 dans les
 * bornes, et c'est le banc qui avait tort — c'est le genre d'erreur qui se
 * publie comme un défaut du produit.
 *
 * La règle appliquée ici:
 *   · un couvercle à UN nom  ⇒ ses grammes s'additionnent à ce que cette
 *     personne prend à ce repas, et le TOTAL se compare à SES bornes;
 *   · un BAC (plusieurs noms, ou une boîte anonyme dans un foyer à plusieurs)
 *     ⇒ ses grammes décrivent un récipient. Il se compare à la SOMME des
 *     bornes de ses mangeurs — la façon même dont `lidPlanFor` l'a construit
 *     (`tub.factorSum`). Il n'est JAMAIS divisé par le nombre de mangeurs.
 *   · une boîte anonyme dans un foyer d'UNE personne est la portion de cette
 *     personne (c'est ce que la lane solo écrit).
 */
const potDens = potDensities(index, preps);
type Cellule = {
  own: Map<string, number>;
  tubs: { memberIds: readonly string[]; grams: number; kcal: number | null; titles: string[] }[];
  titles: Set<string>;
};
const cellules = new Map<string, Cellule>();
const cellule = (day: string, slot: string): Cellule => {
  const k = `${day}|${slot}`;
  if (!cellules.has(k)) cellules.set(k, { own: new Map(), tubs: [], titles: new Set() });
  return cellules.get(k)!;
};
for (let i = 0; i < plats.length; i++) {
  const p = plats[i];
  if (!p.day || !p.slot) continue;
  const md = dishes[i];
  const parBoite = boxKcalByItems(index, md, potDens);
  const c = cellule(p.day, p.slot);
  c.titles.add(p.title);
  md.boxes.forEach((b, j) => {
    const grams = b.items.reduce((n, it) => n + it.grams, 0);
    const kcal = parBoite === null ? null : parBoite[j].kcal;
    const nommes = b.memberIds;
    if (nommes.length === 1) {
      c.own.set(nommes[0], (c.own.get(nommes[0]) ?? 0) + grams);
      return;
    }
    const qui = nommes.length > 0 ? nommes : mouths.map((m: Any) => m.memberId);
    if (qui.length === 1) {
      c.own.set(qui[0], (c.own.get(qui[0]) ?? 0) + grams);
      return;
    }
    c.tubs.push({ memberIds: qui, grams, kcal, titles: [p.title] });
  });
}

const violations: Any[] = [];
const controles: Any[] = [];
for (const [k, c] of cellules.entries()) {
  const [day, slot] = k.split("|");
  const juge = (
    qui: readonly string[], grams: number, kind: string, titres: string[],
  ) => {
    const bs = qui.map((m) => bornes(m, day, slot));
    if (bs.some((x) => x.slotTargetKcal === null)) {
      const l = {
        day, slot, kind, mouths: qui.map((m) => nomDe.get(m) ?? m), titles: titres,
        grams, verdict: "unmeasurable", raison: "aucune_cible_de_moment",
      };
      controles.push(l);
      return;
    }
    const min = bs.reduce((n, x) => n + x.min, 0);
    const max = bs.reduce((n, x) => n + x.max, 0);
    const verdict = grams > max ? "over_max" : grams < min ? "under_min" : "in_bounds";
    const l = {
      day, slot, kind, mouths: qui.map((m) => nomDe.get(m) ?? m), titles: titres,
      grams, min: Math.round(min), max: Math.round(max), verdict,
      ecart_pct: verdict === "in_bounds"
        ? 0
        : Math.round(1000 * (grams > max ? grams / max - 1 : grams / min - 1)) / 10,
    };
    controles.push(l);
    if (verdict !== "in_bounds") violations.push(l);
  };
  for (const [m, g] of c.own.entries()) juge([m], g, "own", [...c.titles]);
  for (const t of c.tubs) juge(t.memberIds, t.grams, "tub", t.titles);
}

/**
 * ⛔ UN REPAS SANS AUCUN CONTENANT N'EST PAS « DANS LES BORNES », IL EST
 * INCONTRÔLABLE — et le taire ferait passer un plan non pesé pour un plan
 * conforme. Mesuré sur S5·1: neuf repas-bouches contrôlés sur dix-huit, les
 * neuf autres sans boîte. Un dénominateur qui ne compterait que les neuf
 * premiers rendrait « 100 % dans les bornes » d'un plan à moitié pesé.
 */
for (const [k, slots] of slotsParBoucheJour.entries()) {
  const [memberId, day] = k.split("|");
  for (const slot of slots) {
    const c = cellules.get(`${day}|${slot}`);
    const vu = c !== undefined &&
      (c.own.has(memberId) || c.tubs.some((t) => t.memberIds.includes(memberId)));
    if (vu) continue;
    controles.push({
      day, slot, kind: "aucun", mouths: [nomDe.get(memberId) ?? memberId],
      titles: [], grams: null, verdict: "unmeasurable", raison: "aucun_contenant",
    });
  }
}

/**
 * ── LA MESURE INTERNE D'UNE PERSONNE SERVIE AU BAC ───────────────────────
 *
 * § lot 8: « toute personne dimensionnable possède une mesure interne, même en
 * service collectif sans boîte nominative ». `mouth_energy.ts` refuse, EXPRÈS,
 * de tirer une assiette d'un bac — et il a raison: ses grammes décrivent un
 * récipient. Ce que le banc peut dire sans inventer, c'est ce que le bac PORTE
 * contre ce que ses mangeurs ATTENDENT à ce moment-là. C'est une mesure du
 * service collectif, pas une lecture d'assiette, et elle est nommée comme telle.
 *
 * La part individuelle est le prorata des cibles du moment — la même
 * proportion que la somme des facteurs qui a écrit le bac (`tub.factorSum`).
 * Elle est marquée `derivee_prorata_cible`: jamais présentée comme un chiffre
 * lu sur un couvercle.
 */
const bacs: Any[] = [];
for (const [k, c] of cellules.entries()) {
  const [day, slot] = k.split("|");
  for (const t of c.tubs) {
    const parts = t.memberIds.map((m) => ({
      memberId: m, name: nomDe.get(m) ?? m,
      cible_moment: bornes(m, day, slot).slotTargetKcal as number | null,
    }));
    const sommeCibles = parts.every((x) => x.cible_moment !== null)
      ? parts.reduce((n, x) => n + (x.cible_moment ?? 0), 0)
      : null;
    bacs.push({
      day, slot, titles: t.titles, grams: t.grams, kcal: t.kcal === null ? null : Math.round(t.kcal),
      mouths: parts.map((x) => x.name),
      somme_cibles_du_moment: sommeCibles === null ? null : Math.round(sommeCibles),
      ecart_pct: t.kcal === null || sommeCibles === null || sommeCibles <= 0
        ? null
        : Math.round(1000 * (t.kcal / sommeCibles - 1)) / 10,
      parts_internes: sommeCibles === null || t.kcal === null ? null : parts.map((x) => ({
        name: x.name,
        kcal: Math.round(t.kcal! * (x.cible_moment ?? 0) / sommeCibles),
        provenance: "derivee_prorata_cible",
      })),
    });
  }
}

/**
 * ── LA JOURNÉE INTERNE D'UNE BOUCHE, MOMENT PAR MOMENT ────────────────────
 *
 * ⛔ POURQUOI ELLE EXISTE, ET CE QU'ELLE N'EST PAS. `mouthDayEnergy` rend
 * `null` dès qu'un seul plat de la journée est servi au bac: la personne a
 * mangé, et le produit refuse — à raison — de lire une assiette dans un
 * récipient. Sur F1, cela rendait les HUIT jours-bouches `unmeasurable`, et un
 * foyer parfaitement dimensionné devenait indistinguable d'un foyer qu'on ne
 * sait pas peser.
 *
 * La journée interne remplit exactement ce trou-là: pour chaque moment, soit
 * le couvercle nominatif (chiffre LU), soit la part du bac au prorata des
 * cibles (chiffre DÉRIVÉ). Elle porte sa base (`assiette_nominative`,
 * `service_collectif`, `mixte`) et ne se confond jamais avec la lecture
 * d'assiette de `mouth_energy.ts`.
 */
type PartJour = { lu: number; derive: number; slots: number; complets: number };
const interne = new Map<string, PartJour>();
const noteInterne = (m: string, day: string, kcal: number | null, lu: boolean) => {
  const k = `${m}|${day}`;
  if (!interne.has(k)) interne.set(k, { lu: 0, derive: 0, slots: 0, complets: 0 });
  const x = interne.get(k)!;
  x.slots += 1;
  if (kcal === null) return;
  x.complets += 1;
  if (lu) x.lu += kcal;
  else x.derive += kcal;
};
for (const [k, c] of cellules.entries()) {
  const [day, slot] = k.split("|");
  // Le couvercle nominatif: on relit `boxKcalByItems` par plat, agrégé plus
  // haut dans `own` en GRAMMES; l'énergie, elle, se relit ici plat par plat.
  const ownKcal = new Map<string, number | null>();
  for (let i = 0; i < plats.length; i++) {
    const p = plats[i];
    if (p.day !== day || p.slot !== slot) continue;
    const parBoite = boxKcalByItems(index, dishes[i], potDens);
    dishes[i].boxes.forEach((b, j) => {
      const qui = b.memberIds.length > 0
        ? b.memberIds
        : (mouths.length === 1 ? [mouths[0].memberId] : []);
      if (qui.length !== 1) return;
      const v = parBoite === null ? null : parBoite[j].kcal;
      const prev = ownKcal.get(qui[0]);
      ownKcal.set(qui[0], prev === null || v === null ? null : (prev ?? 0) + v);
    });
  }
  for (const [m, v] of ownKcal.entries()) noteInterne(m, day, v, true);
  for (const t of c.tubs) {
    const parts = t.memberIds.map((m) => bornes(m, day, slot).slotTargetKcal as number | null);
    const somme = parts.every((x) => x !== null)
      ? parts.reduce((n, x) => n + (x ?? 0), 0)
      : null;
    t.memberIds.forEach((m, i) => {
      const v = t.kcal === null || somme === null || somme <= 0
        ? null
        : t.kcal * ((parts[i] ?? 0) / somme);
      noteInterne(m, day, v, false);
    });
  }
}
const journeesInternes = [...interne.entries()].map(([k, x]) => {
  const [memberId, day] = k.split("|");
  return {
    memberId, name: nomDe.get(memberId) ?? memberId, day,
    kcal: x.complets === x.slots ? Math.round(x.lu + x.derive) : null,
    complete: x.complets === x.slots,
    slots: x.slots, slots_chiffres: x.complets,
    base: x.derive === 0 ? "assiette_nominative" : x.lu === 0 ? "service_collectif" : "mixte",
    kcal_lu: Math.round(x.lu), kcal_derive: Math.round(x.derive),
  };
});

// ── ④ L'ÉNERGIE SERVIE ────────────────────────────────────────────────────
// Solo: `planEnergy` sur la journée. Foyer: `mouthDayEnergy` par bouche.
const parBouche = mouthDayEnergy({ index, dishes, preparations: preps }).map((x) => ({
  memberId: x.memberId,
  name: nomDe.get(x.memberId) ?? x.memberId,
  day: x.day,
  kcal: x.kcal,
  complete: x.complete,
  subject: x.subject,
  dishesCounted: x.dishesCounted,
  dishesTotal: x.dishesTotal,
  unattributed: x.unattributedDishes,
  slots: x.slots,
  ownSlots: x.ownSlots,
  grams: Math.round(x.grams),
  maxMealGrams: Math.round(x.maxMealGrams),
  gaps: x.gaps,
}));

const jourPlan = planEnergy({
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

// ── ⑤ LA COUVERTURE ATTENDUE — DE LA DEMANDE, JAMAIS DES PLATS RENDUS ─────
//
// ⛔ LE DÉFAUT QUE CE BLOC FERME. `20-mesure.py` décidait qu'une journée était
// complète en comparant ses plats au nombre de moments déclarés (solo) ou au
// MEILLEUR JOUR DE CETTE BOUCHE dans ce plan (foyer). La seconde règle est
// circulaire: un plan qui compose deux repas partout rend « complet » partout.
// Une journée jugée incomplète devenait `not_applicable`, c'est-à-dire qu'un
// repas manquant DISPARAISSAIT de la mesure au lieu d'être un défaut.
//
// Ici la demande décide, et les deux seules soustractions légitimes sont
// calculées par les fonctions de production qui les décident en vol:
//   · le jour de cuisine seule (`leadDays > 0` ⇒ le premier jour ne nourrit
//     personne, il précuit);
//   · les moments d'aujourd'hui déjà passés (`slotsPassedToday`).
// Tout le reste qui manque est un DÉFAUT DE LIVRAISON, et il est listé.
// `windowDates` rend `{jeton: date}`; l'ordre du PLAN est `windowDayOrder`.
const ordre = windowDayOrder(fixture.windowStartsOn, fixture.windowDurationDays);
const parJeton = windowDates(fixture.windowStartsOn, fixture.windowDurationDays);
const dates = ordre.map((j) => parJeton[j]);
const jourDeCuisson = Number(fixture.leadDays ?? 0) > 0 ? dates[0] : null;
const passesAujourdHui = slotsPassedToday({
  hourNow: fixture.hourNow ?? null,
  rhythm: declared.map((s) => ({ slot: s })) as Any,
  declaredHours: [],
});
const attendues: Any[] = [];
for (const date of dates) {
  if (date === jourDeCuisson) continue;
  const jour = dayTokenOf(date);
  for (const slot of declared) {
    if (date === fixture.todayLocalDate && passesAujourdHui.includes(slot as Any)) continue;
    for (const m of mouths) attendues.push({ memberId: m.memberId, date, day: jour, slot });
  }
}
const livrees = new Set<string>();
for (const [k, s] of slotsParBoucheJour.entries()) {
  const [mid, day] = k.split("|");
  for (const slot of s) livrees.add(`${mid}|${day}|${slot}`);
}
const manquants = attendues.filter((a) => !livrees.has(`${a.memberId}|${a.day}|${a.slot}`))
  .map((a) => ({ ...a, name: nomDe.get(a.memberId) ?? a.memberId }));

// ── ⑥ LA CIBLE COUVERTE D'UNE JOURNÉE ─────────────────────────────────────
// ⛔ « Plans partiels évalués contre leur budget couvert » (§ lot 8). Une
// journée qui ne porte qu'un dîner ne se juge PAS contre la cible du jour
// entier — et elle ne se saute pas non plus. `slotPlanTargets` rend le budget
// des moments réellement couverts, avec les poids de production.
const ciblesCouvertes = [...slotsParBoucheJour.entries()].map(([k, s]) => {
  const [memberId, day] = k.split("|");
  const c = cibleDe.get(memberId);
  const couverts = [...s].sort();
  const attenduCeJour = attendues
    .filter((a) => a.memberId === memberId && a.day === day).map((a) => a.slot);
  if (c?.targetKcal == null) {
    return {
      memberId, name: nomDe.get(memberId) ?? memberId, day,
      slots_couverts: couverts, slots_attendus: attenduCeJour,
      cible_couverte: null, cible_jour: null, raison: c?.targetReason ?? "sans_cible",
    };
  }
  const t = slotPlanTargets({
    targetKcal: c.targetKcal,
    coveredSlots: couverts,
    wholeSlots: declared.length > 0 ? declared : couverts,
    lightSlots: light,
    slotFixedKcal: null,
  });
  return {
    memberId, name: nomDe.get(memberId) ?? memberId, day,
    slots_couverts: couverts, slots_attendus: attenduCeJour,
    cible_couverte: Math.round(t.total),
    cible_jour: c.targetKcal,
    raison: c.targetReason,
  };
});

console.log(JSON.stringify({
  couverture: {
    fenetre: { starts_on: fixture.windowStartsOn, days: fixture.windowDurationDays },
    jour_de_cuisson: jourDeCuisson,
    moments_passes_aujourdhui: passesAujourdHui,
    attendues: attendues.length,
    livrees: attendues.length - manquants.length,
    manquants,
  },
  cibles_couvertes: ciblesCouvertes,
  index: {
    base_slugs: base.bySlug.size,
    sas_lignes_admises: sasRows.length,
    sas_lignes_totales: sasAll.length,
    coupure: fixture.sasCutoff,
    termes_demandes_au_sas: lecture.asked,
    lignes_retenues: lecture.kept,
    slugs_apres: index.bySlug.size,
  },
  cibles,
  plats,
  controles_grammes: controles,
  violations_grammes: violations,
  bacs_communs: bacs,
  journees_internes: journeesInternes,
  par_bouche: parBouche,
  /**
   * ⛔ DE COMBIEN LE PLIAGE PAR `uses.servings` SE TROMPE, SUR CE PLAN-LÀ.
   *
   * `planEnergy` — la mesure de la journée SOLO — attribue une casserole à un
   * plat par `servings / servingsMade`. Le modèle écrit `servings: 1` sur des
   * casseroles de dix parts, et l'en-tête « LOT 0 » de `mouth_energy.ts` a
   * mesuré ×5,9 sur une campagne. Ce compteur (fonction de production) dit le
   * rapport pour CE plan.
   *
   * ⚠️ IL NE SE LIT QUE SUR LA LANE FOYER. Sur la lane solo, la plupart des
   * plats n'ont aucune boîte: le numérateur est amputé par construction et le
   * rapport tombe sous 1 sans que rien ne sur-compte. On le publie parce qu'on
   * le mesure, pas parce qu'il conclut.
   */
  attribution_casseroles: potAttributionGap({ index, dishes, preparations: preps }),
  jours_plan: jourPlan.days.map((d) => ({
    day: d.day,
    kcal: d.kcal,
    complete: d.complete,
    dishesCounted: d.dishesCounted,
    dishesTotal: d.dishesTotal,
  })),
  slots_composes: [...slotsParBoucheJour.entries()].map(([k, v]) => {
    const [memberId, day] = k.split("|");
    return { memberId, name: nomDe.get(memberId) ?? memberId, day, slots: [...v].sort() };
  }),
}, null, 1));
