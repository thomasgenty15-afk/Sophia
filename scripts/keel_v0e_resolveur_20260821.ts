/**
 * ══════════════════════════════════════════════════════════════════════════
 * V0-E′ — LES DEUX COMPTEURS QUI EXIGENT LE RÉSOLVEUR DE PRODUCTION (#3, #4)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `⟳ V0-E′`.
 * Lancé par `scripts/keel_v0e_tableau_de_bord_20260821.sh`, jamais seul: il lit
 * trois fichiers NDJSON que le pilote extrait de la base vivante.
 *
 *     deno run --allow-read scripts/keel_v0e_resolveur_20260821.ts <dir>
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN, NI EN BASE NI SUR LE FIL ────────────────────
 * `V0-E′` est une MESURE. Aucun `insert`, aucun `update`, aucun appel de
 * modèle. Il lit des fichiers et il imprime des lignes.
 *
 * ── ⛔ LES TROIS PIÈGES DE MESURE, DÉJÀ PAYÉS PAR CE DÉPÔT ─────────────────
 *
 * ① **JAMAIS `grams_raw` DE LA BASE.** La colonne est FIGÉE à la génération:
 *    elle dit ce que le référentiel savait ce jour-là, pas ce qu'il sait
 *    aujourd'hui. Ce script recalcule tout par `resolveIngredients`, sur
 *    l'index chargé maintenant. `grams_raw` n'est lu nulle part ici — et le
 *    lecteur d'ingrédient (`readIngredient`, recopié de la production) ne le
 *    regarde pas non plus.
 *
 * ② **TOUJOURS APRÈS PLIAGE** des préparations dans les plats. Le pliage passe
 *    par `foldPreparationsIntoDishes` — la fonction de production, pas une
 *    copie. Un plat dont les ingrédients propres se lisent tous devient
 *    ILLISIBLE dès qu'on lui verse une préparation qui, elle, ne se lit pas:
 *    le taux du PLAT descend, et un taux mesuré avant pliage est faux dans le
 *    sens flatteur. Ce script l'imprime des deux façons pour le PROUVER —
 *    mesuré ici: 43,2 % sans pliage contre 38,4 % avec.
 *
 *    ⚠️ ET SUR LES LIGNES, LE PLIAGE FAIT MONTER LE TAUX, pas descendre: les
 *    lignes de préparation sont mieux pesées que celles des plats et elles se
 *    dupliquent chez chaque plat qui y touche. Les deux directions sont
 *    justes, et elles ne portent pas sur le même objet. Le chiffre d'avant
 *    pliage est imprimé aussi, mais NOMMÉ comme tel.
 *
 * ③ **`coverage`, JAMAIS `resolved.length`, QUAND LA QUESTION EST « CONNU ».**
 *    96 % contre 69 % sur la même assiette: « la porte s'abstenait sur du
 *    sel ». Ici les deux sont imprimés SÉPARÉMENT et nommés:
 *      · RÉSOLU        = `coverage` = connus / total
 *      · RÉSOLU+PESÉ   = `resolved.length` / total  ← le compteur #3
 *    Le compteur #3 demande explicitement « résolues ET pesées »: c'est
 *    `resolved.length`, et l'utiliser ici n'est pas le piège — le piège serait
 *    de l'appeler « couverture ».
 *
 * ── CE QUI EST IMPORTÉ, ET CE QUI EST RECOPIÉ ─────────────────────────────
 * IMPORTÉ (production, jamais une copie): `loadCompositionIndex` (donc `toRef`
 * et sa pagination), `resolveIngredients`, `foldPreparationsIntoDishes`,
 * `planEnergy` / `dishEnergy` et leurs `ENERGY_GAPS`.
 *
 * RECOPIÉ, et il faut le savoir: les trois lecteurs d'entrée
 * `readIngredient` / `readDishes` / `readPreparations` sont repris MOT POUR
 * MOT de `supabase/functions/meal-energy-v1/index.ts:183-249`, où ils ne sont
 * pas exportés (le module ouvre un serveur au chargement). Ce sont des
 * ADAPTATEURS d'entrée, pas le résolveur. S'ils divergeaient de la production,
 * ce tableau de bord mesurerait autre chose que le produit — c'est le risque
 * connu de ce fichier, et il est écrit ici plutôt que découvert plus tard.
 */

import {
  loadCompositionIndex,
} from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  type CompositionIndex,
  type CompositionInput,
  COMPOSITION_UNITS,
  type CompositionState,
  type CompositionUnit,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  dishEnergy,
  type EnergyDish,
  type EnergyGap,
  ENERGY_GAPS,
  type EnergyPreparation,
  planEnergy,
} from "../supabase/functions/_shared/keel/plan_energy.ts";

// ---------------------------------------------------------------------------
// L'ENTRÉE — trois NDJSON extraits par le pilote
// ---------------------------------------------------------------------------

const dir = Deno.args[0] ?? ".";

function readNdjson(file: string): Record<string, unknown>[] {
  const raw = Deno.readTextFileSync(`${dir}/${file}`);
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    out.push(JSON.parse(t) as Record<string, unknown>);
  }
  return out;
}

/**
 * Un client qui a exactement la forme dont `loadCompositionIndex` a besoin, et
 * rien de plus. Il sert des lignes déjà lues au lieu d'appeler PostgREST — la
 * pagination, la garde de complétude et surtout `toRef` (la carte
 * colonne → champ, avec ses replis nommés) restent celles de la production.
 */
function fileClient(): {
  // deno-lint-ignore no-explicit-any
  from(table: string): { select(columns: string): any };
} {
  const cache = new Map<string, Record<string, unknown>[]>();
  const rowsOf = (table: string): Record<string, unknown>[] => {
    const hit = cache.get(table);
    if (hit) return hit;
    const rows = readNdjson(`${table}.ndjson`);
    cache.set(table, rows);
    return rows;
  };
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            range(from: number, to: number) {
              return Promise.resolve({
                data: rowsOf(table).slice(from, to + 1),
                error: null,
              });
            },
          };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// ⚠️ RECOPIÉ MOT POUR MOT de `meal-energy-v1/index.ts:183-249` — voir l'en-tête
// ---------------------------------------------------------------------------

/** Une quantité structurée telle que la ligne de plan la porte (FF-038). */
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
    unit: (COMPOSITION_UNITS as readonly string[]).includes(unit)
      ? (unit as CompositionUnit)
      : null,
    state: (COMPOSITION_STATES as readonly string[]).includes(state)
      ? (state as CompositionState)
      : null,
  };
}

function readIngredients(raw: unknown): CompositionInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionInput[] = [];
  for (const entry of raw) {
    const i = readIngredient(entry);
    if (i) out.push(i);
  }
  return out;
}

function readDishes(raw: unknown): EnergyDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      ingredients: readIngredients(d.ingredients),
      uses: Array.isArray(d.uses)
        ? d.uses.map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparationId: String(u.preparation_id ?? ""),
            servings: Number(u.servings) || 1,
          };
        }).filter((u) => u.preparationId !== "")
        : [],
    };
  });
}

function readPreparations(raw: unknown): EnergyPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredients(p.ingredients),
    };
  }).filter((p) => p.id !== "");
}

// ---------------------------------------------------------------------------
// LE COMPTE
// ---------------------------------------------------------------------------

interface LineTally {
  total: number;
  /** `total - unresolvedTerms.length` — c'est `coverage` au numérateur près. */
  known: number;
  /** `resolved.length` — RÉSOLU **ET** PESÉ. Le compteur #3. */
  weighed: number;
  /** Pesés par CONVENTION (condiments), inclus dans `weighed`. */
  conventional: number;
}

const emptyTally = (): LineTally => ({
  total: 0,
  known: 0,
  weighed: 0,
  conventional: 0,
});

function tallyInto(tally: LineTally, index: CompositionIndex, ings: readonly CompositionInput[]) {
  if (ings.length === 0) return;
  const r = resolveIngredients(index, ings);
  tally.total += r.total;
  tally.known += r.total - r.unresolvedTerms.length;
  tally.weighed += r.resolved.length;
  tally.conventional += r.conventionalTerms.length;
}

const pct = (num: number, den: number) => den === 0 ? "n/a" : `${(100 * num / den).toFixed(1)} %`;

const laneOf = (row: Record<string, unknown>) =>
  String(row.plan_kind ?? "") === "household" ? "foyer" : "solo";

async function main() {
  const index = await loadCompositionIndex(fileClient());
  const plans = readNdjson("plans.ndjson");

  const LANES = ["foyer", "solo"] as const;
  type Lane = (typeof LANES)[number];

  // #3 — APRÈS pliage (le compteur), et AVANT pliage (le raccord au plan)
  const folded: Record<Lane, LineTally> = { foyer: emptyTally(), solo: emptyTally() };
  const rawDish: Record<Lane, LineTally> = { foyer: emptyTally(), solo: emptyTally() };
  const rawPrep: Record<Lane, LineTally> = { foyer: emptyTally(), solo: emptyTally() };

  // #4 — les motifs d'abstention, par plat, sur les plats PLIÉS
  const gapCount = new Map<EnergyGap, number>();
  for (const g of ENERGY_GAPS) gapCount.set(g, 0);
  let dishesTotal = 0;
  let dishesComplete = 0;
  // ⛔ LA PREUVE QUE CE SCRIPT PLIE. Le même compteur, calculé SANS pliage: si
  // les deux nombres étaient égaux, le pliage ne ferait rien et personne ne le
  // verrait. Le taux mesuré sans pliage est plus HAUT — il est faux dans le
  // sens flatteur, et c'est très exactement le piège que la fiche nomme.
  let dishesCompleteUnfolded = 0;

  // la moitié du compteur #2 QUI EXISTE: journées calculables par lane
  const daysTotal: Record<Lane, number> = { foyer: 0, solo: 0 };
  const daysComplete: Record<Lane, number> = { foyer: 0, solo: 0 };

  // ⚠️ LE DÉNOMINATEUR DU SQL N'EST PAS CELUI DU RÉSOLVEUR. Une entrée du
  // tableau `ingredients` qui ne porte AUCUN `term` est comptée par le SQL et
  // JETÉE par `readIngredient` (« if (!term) return null »). L'écart est
  // compté ici plutôt que découvert plus tard sur un dénominateur qui ne tombe
  // pas juste.
  let jsonEntries = 0;

  for (const row of plans) {
    const lane = laneOf(row) as Lane;
    const dishes = readDishes(row.dishes);
    const preparations = readPreparations(row.preparations);

    for (const holder of [row.dishes, row.preparations]) {
      if (!Array.isArray(holder)) continue;
      for (const entry of holder) {
        const ings = (entry as Record<string, unknown> | null)?.ingredients;
        if (Array.isArray(ings)) jsonEntries += ings.length;
      }
    }

    // ── AVANT PLIAGE — le dénominateur 9 810 du plan, et rien de plus ─────
    for (const d of dishes) tallyInto(rawDish[lane], index, d.ingredients);
    for (const p of preparations) tallyInto(rawPrep[lane], index, p.ingredients);

    // ── APRÈS PLIAGE — LE COMPTEUR #3 ────────────────────────────────────
    const foldedDishes = foldPreparationsIntoDishes({
      dishes: dishes.map((d) => ({
        slot: null,
        method: d.method,
        ingredients: d.ingredients,
        uses: d.uses,
      })),
      preparations: preparations.map((p) => ({
        id: p.id,
        servingsMade: p.servingsMade,
        ingredients: p.ingredients,
      })),
    });
    for (const f of foldedDishes) tallyInto(folded[lane], index, f.ingredients);

    for (const d of dishes) {
      const e = dishEnergy(index, { method: d.method, ingredients: d.ingredients });
      if (e.complete) dishesCompleteUnfolded++;
    }

    // ── LE COMPTEUR #4 — par le chemin de production ─────────────────────
    // `planEnergy` plie lui-même, puis appelle `dishEnergy` plat par plat.
    // `servings` ne touche pas les motifs (il ne divise que des kcal); il est
    // quand même passé tel que la base le porte, borné comme en production.
    const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));
    const energy = planEnergy({
      index,
      dishes,
      preparations,
      servings,
      addons: [],
      mealsOutByDay: new Map<string | null, number>(),
    });
    for (const d of energy.dishes) {
      dishesTotal++;
      if (d.complete) {
        dishesComplete++;
        continue;
      }
      for (const g of d.gaps) gapCount.set(g, (gapCount.get(g) ?? 0) + 1);
    }
    for (const day of energy.days) {
      daysTotal[lane]++;
      if (day.complete) daysComplete[lane]++;
    }
  }

  // ── LA SORTIE — une ligne par compteur, préfixée du numéro ────────────────
  // Le pilote fusionne ces lignes avec celles du SQL et trie sur le numéro.
  const l3 = (lane: Lane) =>
    `${lane} ${pct(folded[lane].weighed, folded[lane].total)} ` +
    `(${folded[lane].weighed}/${folded[lane].total})`;
  console.log(
    `3|lignes résolues ET pesées, APRÈS pliage|${l3("foyer")} · ${l3("solo")}|deno`,
  );
  console.log(
    `4|motifs d'abstention (plats pliés)|missing_quantity ${gapCount.get("missing_quantity")} · ` +
      `unknown_ingredient ${gapCount.get("unknown_ingredient")} · ` +
      `no_ingredients ${gapCount.get("no_ingredients")} sur ${dishesTotal} plats|deno`,
  );

  // ── LE DÉTAIL, sous le tableau ────────────────────────────────────────────
  const lines: string[] = [];
  lines.push("");
  lines.push("── #3 · LE DÉTAIL — trois grandeurs distinctes, jamais confondues ──────────");
  lines.push(
    "   RÉSOLU = coverage (connus/total) · PESÉ = resolved.length/total (le compteur)",
  );
  lines.push("");
  lines.push("   APRÈS PLIAGE — le compteur #3 (foldPreparationsIntoDishes, production)");
  for (const lane of LANES) {
    const t = folded[lane];
    lines.push(
      `     ${lane.padEnd(6)} lignes ${String(t.total).padStart(6)} · ` +
        `RÉSOLU ${pct(t.known, t.total).padStart(7)} · ` +
        `RÉSOLU+PESÉ ${pct(t.weighed, t.total).padStart(7)} · ` +
        `dont pesés par convention ${t.conventional}`,
    );
  }
  const foldTotal = folded.foyer.total + folded.solo.total;
  const foldWeighed = folded.foyer.weighed + folded.solo.weighed;
  lines.push(
    `     TOTAL  lignes ${String(foldTotal).padStart(6)} · ` +
      `RÉSOLU+PESÉ ${pct(foldWeighed, foldTotal)}`,
  );
  lines.push("");
  lines.push("   AVANT PLIAGE — ⛔ NE PAS CITER COMME LE COMPTEUR. Il raccorde le");
  lines.push("   dénominateur 9 810 du plan (6 661 lignes de plat + 3 149 de préparation).");
  for (const lane of LANES) {
    const d = rawDish[lane];
    const p = rawPrep[lane];
    lines.push(
      `     ${lane.padEnd(6)} plats ${String(d.total).padStart(5)} ` +
        `(RÉSOLU ${pct(d.known, d.total)} · +PESÉ ${pct(d.weighed, d.total)})` +
        ` · préparations ${String(p.total).padStart(5)} ` +
        `(RÉSOLU ${pct(p.known, p.total)} · +PESÉ ${pct(p.weighed, p.total)})`,
    );
    lines.push(
      `            ensemble RÉSOLU ${pct(d.known + p.known, d.total + p.total)} · ` +
        `RÉSOLU+PESÉ ${pct(d.weighed + p.weighed, d.total + p.total)}`,
    );
  }
  const rawTotal = rawDish.foyer.total + rawDish.solo.total + rawPrep.foyer.total +
    rawPrep.solo.total;
  const rawDishTotal = rawDish.foyer.total + rawDish.solo.total;
  const rawPrepTotal = rawPrep.foyer.total + rawPrep.solo.total;
  lines.push(
    `     TOTAL  ${rawTotal} lignes NOMMÉES = ${rawDishTotal} (plats) + ${rawPrepTotal} (préparations)`,
  );
  lines.push(
    `     ⚠️ le SQL compte ${jsonEntries} entrées JSON : ${
      jsonEntries - rawTotal
    } ne portent aucun "term" et readIngredient les JETTE.`,
  );
  lines.push(
    "        Les deux dénominateurs ne sont pas le même — 9 810 est celui du SQL.",
  );
  lines.push("");
  lines.push("── #4 · LE DÉTAIL ──────────────────────────────────────────────────────────");
  lines.push(
    `     plats calculables ${dishesComplete} / ${dishesTotal} (${
      pct(dishesComplete, dishesTotal)
    })`,
  );
  for (const g of ENERGY_GAPS) {
    lines.push(`     ${g.padEnd(20)} ${String(gapCount.get(g) ?? 0).padStart(5)}`);
  }
  lines.push("");
  lines.push("   ⛔ LA PREUVE QUE CE SCRIPT PLIE — le même compteur sans pliage :");
  lines.push(
    `     plats calculables SANS pliage ${dishesCompleteUnfolded} / ${dishesTotal} (${
      pct(dishesCompleteUnfolded, dishesTotal)
    })  ⇐ FAUX, et faux dans le sens flatteur`,
  );
  lines.push(
    `     plats calculables APRÈS pliage ${dishesComplete} / ${dishesTotal} (${
      pct(dishesComplete, dishesTotal)
    })  ⇐ le chiffre retenu`,
  );
  lines.push(
    "     ⚠️ SUR LES LIGNES, le pliage fait MONTER le taux (les lignes de",
  );
  lines.push(
    "        préparation sont mieux pesées et se dupliquent). La baisse annoncée",
  );
  lines.push(
    "        par la fiche porte sur le PLAT, pas sur la ligne. Les deux sont ici.",
  );
  lines.push("");
  lines.push("── #2 · LA MOITIÉ QUI EXISTE (par lane), ⛔ ET QUI N'EST PAS LE COMPTEUR ────");
  lines.push("   Le compteur #2 est « par lane ET PAR LANGUE ». Voici la coupe par lane");
  lines.push("   seule, celle du lot 18 — la coupe par langue reste inexistante (L2-lang).");
  for (const lane of LANES) {
    lines.push(
      `     ${lane.padEnd(6)} journées calculables ${daysComplete[lane]} / ${
        daysTotal[lane]
      } (${pct(daysComplete[lane], daysTotal[lane])})`,
    );
  }
  // ⚠️ CHAQUE ligne porte le préfixe, pas seulement la première: le pilote
  // filtre au `grep`, et un bloc multi-ligne préfixé une seule fois perd tout
  // sauf sa première ligne — en silence. Mesuré ici même.
  for (const l of lines) console.log(`DETAIL|${l}`);
}

await main();
