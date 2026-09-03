/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉNOMINATEUR DU VERDICT, MESURÉ SUR LE CORPUS ENTIER — 2026-09-04
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CE SCRIPT EXISTE ─────────────────────────────────────────────
 * Le pavé de `generate-meal-v1/index.ts` a nommé le biais du dénominateur le
 * 2026-08-23 plutôt que de le corriger, et il a posé sa condition mot pour mot:
 * « c'est un lot à part qui doit se mesurer sur le corpus entier avant d'être
 * posé ». Ce fichier EST cette mesure.
 *
 * ⛔ IL NE LIT QUE DES FICHIERS. Aucune écriture, aucun appel de modèle, aucune
 * base. Le référentiel, l'enveloppe, le pliage, le verdict et la couverture
 * sont ceux de la PRODUCTION, importés — jamais recopiés. Un script qui
 * réécrirait la règle mesurerait sa propre copie.
 *
 *   deno run --allow-read scripts/keel_denominateur_verdict_20260904.ts
 *
 * ── CE QU'IL REND, ET CE QU'IL NE PEUT PAS RENDRE ─────────────────────────
 * Par plan: l'ancien dénominateur (la fenêtre), le nouveau (les journées
 * nourries), le kcal/jour de chacun, et le verdict d'énergie de chacun.
 *
 * ⚠️ LES PLANS `F*` SONT DE LA LANE FOYER, ET ELLE N'APPELLE PAS `verdictFor`
 * (« La lane foyer ne calcule PAS `verdictFor` », `generate-household-meal-v1`).
 * On mesure quand même leurs deux dénominateurs — le fait de la dilution ne
 * dépend pas de la lane — et on laisse leur colonne verdict vide plutôt que
 * d'inventer un corps de référence.
 */

import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  type CompositionIndex,
  type CompositionInput,
  COMPOSITION_UNITS,
  type CompositionState,
  type CompositionUnit,
  isFriedMethod,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import {
  foldPreparationsIntoDishes,
  verdictFor,
} from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { assessCoverage } from "../supabase/functions/_shared/keel/meal_coverage.ts";
import { windowCoverageOf } from "../supabase/functions/_shared/keel/window_coverage.ts";
import { windowDayOrder } from "../supabase/functions/_shared/keel/meal_plan_window.ts";
import {
  ENERGY_DIRECTION_MARGIN,
  envelopeFor,
} from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { uncoverableSentinelsFor } from "../supabase/functions/_shared/keel/dietary_regime.ts";

const EVAL_DIR = new URL("../scratchpad/2026-08-23-EVAL-QUALITE/", import.meta.url);
const dirPath = decodeURIComponent(EVAL_DIR.pathname);

/**
 * LES MOMENTS DÉCLARÉS DU CORPUS, LUS DANS LA FIXTURE QUI LES A ÉCRITS.
 * `01-setup-solo.sh` et `03-setup-foyer.sh` posent tous deux
 * `eating_rhythm: [breakfast, lunch, dinner]`. On ne devine pas: on recopie ce
 * que le décor a écrit, et on le dit ici pour que la mesure soit rejouable.
 */
const DECLARED_SLOTS = ["breakfast", "lunch", "dinner"];

function readIngredient(raw: unknown): CompositionInput | null {
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
    state: (COMPOSITION_STATES as readonly string[]).includes(state) ? (state as CompositionState) : null,
    quantity: typeof i.quantity === "string" ? i.quantity : null,
  };
}
const readIngredients = (raw: unknown): CompositionInput[] =>
  Array.isArray(raw) ? raw.map(readIngredient).filter((x): x is CompositionInput => !!x) : [];

function readNdjson(file: string): Record<string, unknown>[] {
  return Deno.readTextFileSync(file).split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
function fileClient(refDir: string) {
  const cache = new Map<string, Record<string, unknown>[]>();
  const rowsOf = (t: string) => {
    const hit = cache.get(t);
    if (hit) return hit;
    const rows = readNdjson(`${refDir}/${t}.ndjson`);
    cache.set(t, rows);
    return rows;
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

/**
 * LE CORPS D'UN CAS — par PRÉFIXE, et le plus long gagne.
 *
 * `S1allergy` et `S1egg` sont le décor `S1` avec une contrainte en plus: même
 * corps, même objectif. `S1apres` et `S7bis` ont le leur. Un `startsWith` naïf
 * ferait lire `body-S1.json` pour `S1apres`, c'est-à-dire le mauvais corps sur
 * le seul cas où il diffère.
 */
function bodyFileFor(caseName: string): string | null {
  const candidates: string[] = [];
  for (const entry of Deno.readDirSync(dirPath)) {
    const m = /^body-(.+)\.json$/.exec(entry.name);
    if (m && caseName.startsWith(m[1])) candidates.push(m[1]);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return `${dirPath}body-${candidates[0]}.json`;
}

const index: CompositionIndex = await loadCompositionIndex(fileClient(`${dirPath}ref`));

interface Row {
  plan: string;
  cas: string;
  fenetre: number;
  nourries: number | null;
  detail: string;
  kcalTotal: number | null;
  avantKcalJ: number | null;
  apresKcalJ: number | null;
  bande: string;
  avant: string;
  apres: string;
  note: string;
}

const rows: Row[] = [];
const files: string[] = [];
for (const entry of Deno.readDirSync(dirPath)) {
  if (/^plan-.+\.json$/.test(entry.name)) files.push(entry.name);
}
files.sort();

for (const file of files) {
  const caseName = /^plan-([^-]+)-/.exec(file)?.[1] ?? "?";
  // deno-lint-ignore no-explicit-any
  const plan = JSON.parse(Deno.readTextFileSync(`${dirPath}${file}`)) as any;
  const win = plan.window;
  const row: Row = {
    plan: file.replace(/^plan-/, "").replace(/\.json$/, ""),
    cas: caseName,
    fenetre: 0,
    nourries: null,
    detail: "",
    kcalTotal: null,
    avantKcalJ: null,
    apresKcalJ: null,
    bande: "—",
    avant: "—",
    apres: "—",
    note: "",
  };
  if (!win || !win.starts_on || !Number(win.duration_days)) {
    row.note = "aucune fenêtre (capture d'erreur) — non mesurable";
    rows.push(row);
    continue;
  }
  const durationDays = Number(win.duration_days);
  row.fenetre = durationDays;
  const windowDays = windowDayOrder(String(win.starts_on), durationDays);

  // deno-lint-ignore no-explicit-any
  const rawDishes: any[] = plan.dishes ?? [];
  // deno-lint-ignore no-explicit-any
  const rawPreps: any[] = plan.preparations ?? [];

  const coverage = windowCoverageOf({
    windowDays,
    declaredSlots: DECLARED_SLOTS,
    composed: rawDishes.map((d) => ({ day: d.day ?? null, slot: d.slot ?? null })),
  });
  row.nourries = coverage.days;
  row.detail = coverage.byDay
    .map((d) => `${d.day}=${d.share.toFixed(2)}${d.reason === "fed" ? "" : `(${d.reason})`}`)
    .join(" ");
  if (coverage.fallback) row.note = "repli: la fenêtre entière";

  const folded = foldPreparationsIntoDishes({
    dishes: rawDishes.map((d) => ({
      slot: d.slot ?? null,
      method: String(d.method ?? ""),
      ingredients: readIngredients(d.ingredients),
      // deno-lint-ignore no-explicit-any
      uses: (d.uses ?? []).map((u: any) => ({
        preparationId: String(u.preparation_id ?? ""),
        servings: Number(u.servings) || 1,
      })).filter((u: { preparationId: string }) => u.preparationId !== ""),
    })),
    preparations: rawPreps.map((p) => ({
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredients(p.ingredients),
    })).filter((p) => p.id !== ""),
  });

  // ⛔ L'ÉNERGIE VIENT DE `assessCoverage`, PAS D'UNE SOMME ÉCRITE ICI.
  //
  // Une première version de ce script sommait avec `scalingInputsFor`, qui
  // n'impute PAS l'huile de friture: ses kcal/jour étaient plus BAS que ceux du
  // verdict, et la colonne « après » de `S5` affichait 1 495 à côté d'un verdict
  // `within` sur une bande qui commence à 2 041 — un tableau qui se contredit
  // lui-même, et sur le plan précisément qu'il fallait examiner. `assessCoverage`
  // fait la même boucle par plat que `verdictFor`, avec le même `friedMethod`.
  const kcalPerDay = (days: number) =>
    assessCoverage({ dishes: folded, index, daysCovered: days, verdictComputable: true })
      .energyPerDay;
  row.avantKcalJ = kcalPerDay(durationDays);
  row.apresKcalJ = kcalPerDay(coverage.days);
  row.kcalTotal = row.avantKcalJ === null
    ? null
    : Math.round(row.avantKcalJ * Math.max(1, durationDays));

  const bodyFile = bodyFileFor(caseName);
  if (bodyFile === null) {
    row.note = row.note ||
      "lane FOYER: `verdictFor` n'y a aucun appelant — dénominateurs seuls";
    rows.push(row);
    continue;
  }
  // deno-lint-ignore no-explicit-any
  const body = JSON.parse(Deno.readTextFileSync(bodyFile)) as any;
  const env = envelopeFor(
    body.goal,
    {
      heightCm: body.heightCm ?? null,
      ageBand: body.ageBand ?? null,
      gender: body.gender ?? null,
      latestWeight: body.weightKg
        ? { value: body.weightKg, weekStart: body.weekStart ?? null }
        : null,
      declaredWeightKg: null,
      latestWaist: null,
      restrictionFlag: false,
      activityLevel: body.activityLevel ?? null,
      // deno-lint-ignore no-explicit-any
    } as any,
    body.ageBand ?? null,
    false,
    null,
    body.activityLevel ?? null,
    { day: null, sport: null, asked: false },
    null,
    null,
  );
  // ⚠️ LA BANDE AFFICHÉE EST CELLE DE LA **DIRECTION**, pas la bande nue.
  // `verdictFor` ne dit `below`/`above` qu'au-delà du bord × 1,10
  // (`ENERGY_DIRECTION_MARGIN`). Afficher la bande nue faisait lire « 2 012
  // kcal/j → within » sur une bande « 2 041–2 160 » — un tableau qui se
  // contredit à l'œil, sur la seule ligne du corpus qui demande un examen.
  row.bande = env.mode === "per_kg" && env.energy
    ? `${Math.round(env.energy.low / ENERGY_DIRECTION_MARGIN)}–${
      Math.round(env.energy.high * ENERGY_DIRECTION_MARGIN)
    }`
    : env.mode;

  const uncoverable = body.regime ? uncoverableSentinelsFor(body.regime) : [];
  const commun = {
    dishes: folded,
    envelope: env,
    index,
    windowDays: durationDays,
    friedMethod: isFriedMethod,
    uncoverableSentinels: uncoverable,
    fixedIntakeInputs: [],
  };
  row.avant = verdictFor({ ...commun, daysCovered: durationDays }).energy;
  row.apres = verdictFor({ ...commun, daysCovered: coverage.days }).energy;
  rows.push(row);
}

// ---------------------------------------------------------------------------
// LE TABLEAU
// ---------------------------------------------------------------------------
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
const padL = (s: string, n: number) => (" ".repeat(n) + s).slice(-n);

console.log("");
console.log("═".repeat(118));
console.log("LE DÉNOMINATEUR DU VERDICT — AVANT / APRÈS, SUR LES 18 PLANS RÉELS DU CORPUS");
console.log("═".repeat(118));
console.log(
  pad("plan", 26) + padL("fen.", 5) + padL("nourr.", 8) + padL("kcal tot", 10) +
    padL("kcal/j av", 11) + padL("kcal/j ap", 11) + padL("bande dir.", 12) +
    "  " + pad("avant", 15) + pad("après", 15),
);
console.log("─".repeat(118));
for (const r of rows) {
  console.log(
    pad(r.plan, 26) +
      padL(r.fenetre ? String(r.fenetre) : "—", 5) +
      padL(r.nourries === null ? "—" : r.nourries.toFixed(2), 8) +
      padL(r.kcalTotal === null ? "—" : String(r.kcalTotal), 10) +
      padL(r.avantKcalJ === null ? "—" : String(r.avantKcalJ), 11) +
      padL(r.apresKcalJ === null ? "—" : String(r.apresKcalJ), 11) +
      padL(r.bande, 12) + "  " +
      pad(r.avant, 15) + pad(r.apres + (r.avant !== r.apres && r.apres !== "—" ? "  ⟵" : ""), 15),
  );
  if (r.note) console.log(" ".repeat(26) + "· " + r.note);
  if (r.detail) console.log(" ".repeat(26) + "· jours: " + r.detail);
}
console.log("─".repeat(118));

const jugés = rows.filter((r) => r.avant !== "—");
const changés = jugés.filter((r) => r.avant !== r.apres);
console.log(`plans du corpus ................. ${rows.length}`);
console.log(`  dont non mesurables ........... ${rows.filter((r) => r.nourries === null).length}`);
console.log(`  dont lane foyer (sans verdict)  ${rows.filter((r) => r.nourries !== null && r.avant === "—").length}`);
console.log(`  dont jugés par verdictFor ..... ${jugés.length}`);
console.log(`dénominateur qui BAISSE ......... ${
  rows.filter((r) => r.nourries !== null && r.nourries < r.fenetre).length
}`);
console.log(`VERDICTS QUI CHANGENT ........... ${changés.length}`);
for (const r of changés) {
  console.log(`  ${pad(r.plan, 26)} ${r.avant} → ${r.apres}`);
}
const sens = new Map<string, number>();
for (const r of changés) {
  const k = `${r.avant} → ${r.apres}`;
  sens.set(k, (sens.get(k) ?? 0) + 1);
}
for (const [k, n] of [...sens].sort()) console.log(`  ${padL(String(n), 3)} × ${k}`);
console.log("");
