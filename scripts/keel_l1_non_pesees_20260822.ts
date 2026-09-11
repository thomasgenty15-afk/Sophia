/**
 * ══════════════════════════════════════════════════════════════════════════
 * L-1 — LE COMPTEUR #3, COUPÉ PAR LANE **ET PAR GÉNÉRATION DE PROMPT**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-1`.
 * Lancé par `scripts/keel_l1_non_pesees_20260822.sh`, jamais seul.
 *
 *     deno run --allow-read scripts/keel_l1_non_pesees_20260822.ts <dir>
 *
 * ── POURQUOI IL EXISTE, ALORS QUE `V0-E′` COMPTE DÉJÀ #3 ──────────────────
 * Le tableau de bord coupe #3 **par lane**. La fiche `L-1` exige la coupe
 * **par lane ET par génération de prompt**: le corpus EN porte 178 plans sur
 * 15 générations, dont 43 SANS aucun `prompt_version`, et trois générations
 * mortes écrivent **100 %** de leurs ingrédients sans `amount`. Sans cette
 * coupe, le renouvellement du corpus se confondrait avec le gain du lot.
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN ─────────────────────────────────────────────
 * Aucun `insert`, aucun `update`, aucun appel de modèle. Il lit trois NDJSON
 * et il imprime des lignes.
 *
 * ── LES MÊMES TROIS PIÈGES QUE `V0-E′`, ET UN QUATRIÈME ───────────────────
 * ① `grams_raw` de la base n'est **jamais** lu (figé à la génération).
 * ② tout se mesure **après pliage** (`foldPreparationsIntoDishes`), et l'avant
 *    est imprimé à côté, nommé comme tel.
 * ③ `coverage` (RÉSOLU) et `resolved.length` (RÉSOLU+PESÉ) sortent séparés.
 * ④ ⛔ **NOUVEAU, et c'est le cœur de `L-1`**: le numérateur « pesé » contient
 *    les pesées **par convention** (`condimentMassFor`). La réserve de `V0-E′`
 *    est explicite: près de la moitié du « pesé » du solo est une masse
 *    conventionnelle de condiment. Ce script imprime donc **RÉSOLU+PESÉ hors
 *    convention** à côté du compteur, pour qu'aucun seuil ne se cale sur le
 *    mauvais nombre.
 *
 * ── CE QUI EST IMPORTÉ, ET CE QUI EST RECOPIÉ ─────────────────────────────
 * IMPORTÉ (production, jamais une copie): `loadCompositionIndex`,
 * `resolveIngredients`, `resolveIngredient`, `gramsRawOf`, `condimentMassFor`,
 * `foldPreparationsIntoDishes`, `planEnergy`.
 *
 * RECOPIÉ, comme dans `keel_v0e_resolveur_20260821.ts` et pour la même raison
 * (le module de production ouvre un serveur au chargement): les trois lecteurs
 * d'entrée `readIngredient` / `readDishes` / `readPreparations` de
 * `supabase/functions/meal-energy-v1/index.ts:183-249`.
 *
 * ── LA VENTILATION DES CAUSES — ⛔ CE QU'ELLE SERT À PROUVER ──────────────
 * Une ligne « résolue et non pesée » a exactement quatre causes possibles, et
 * `unit_grams` n'en répare **qu'une**. Les compter séparément est la seule
 * façon de savoir si ce lot peut tenir son seuil:
 *   · `sans_amount`        aucune quantité écrite      → seul `condiment_grams` répare
 *   · `sans_unit`          un nombre sans unité        → rien ne répare ici
 *   · `unit_sans_poids`    « 2 unités » et `unit_grams` absent → ⇐ **LE LEVIER DE `L-1`**
 *   · `state_manquant`     quantité lisible, `state` absent sur une classe où
 *                          il change le poids → hors de portée de ce lot
 */

import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionIndex,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
  condimentMassFor,
  gramsRawOf,
  resolveIngredient,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  type EnergyDish,
  type EnergyPreparation,
  planEnergy,
} from "../supabase/functions/_shared/keel/plan_energy.ts";

const dir = Deno.args[0] ?? ".";

/** Les plans « récents » de la fiche: 2026-08-12 ou après. */
const RECENT_FROM = "2026-08-12";

/**
 * Le séparateur des clés composées (lane + génération de prompt).
 *
 * ⛔ PAS UN ESPACE, ET C'EST MESURÉ: la génération « (aucun prompt_version) »
 * en contient un. Une clé « foyer (aucun prompt_version) » recoupée sur
 * l'espace rendrait « (aucun » — silencieusement, et seulement pour la
 * population qu'on cherche justement à isoler.
 */
const SEP = String.fromCharCode(31);

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
              return Promise.resolve({ data: rowsOf(table).slice(from, to + 1), error: null });
            },
          };
        },
      };
    },
  };
}

// ── RECOPIÉ MOT POUR MOT de `meal-energy-v1/index.ts:183-249` ──────────────

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

// ── LE COMPTE ──────────────────────────────────────────────────────────────

interface Tally {
  total: number;
  known: number;
  weighed: number;
  conventional: number;
}
const emptyTally = (): Tally => ({ total: 0, known: 0, weighed: 0, conventional: 0 });

function tallyInto(t: Tally, index: CompositionIndex, ings: readonly CompositionInput[]) {
  if (ings.length === 0) return;
  const r = resolveIngredients(index, ings);
  t.total += r.total;
  t.known += r.total - r.unresolvedTerms.length;
  t.weighed += r.resolved.length;
  t.conventional += r.conventionalTerms.length;
}

type Cause = "sans_amount" | "sans_unit" | "unit_sans_poids" | "state_manquant";

/**
 * POURQUOI cette ligne, résolue, n'est-elle pas pesée ?
 *
 * ⛔ Le prédicat ne devine rien: il rejoue `gramsRawOf` avec exactement les
 * mêmes arguments que `resolveIngredients`, puis il regarde LEQUEL de ses
 * refus a mordu. Le seul cas qui compte pour `L-1` est `unit_sans_poids`:
 * changer `unit_grams` sur la ligne du référentiel le retourne, et lui seul.
 */
function causeOf(index: CompositionIndex, input: CompositionInput): Cause | null {
  const ref = resolveIngredient(index, input.term);
  if (!ref) return null;
  const grams = gramsRawOf({
    amount: input.amount ?? null,
    unit: input.unit ?? null,
    state: input.state ?? null,
    yieldClass: ref.yieldClass,
    yieldFactor: ref.yieldFactor,
    unitGrams: input.unitGrams ?? ref.unitGrams,
  });
  if (grams !== null) return null;
  if (condimentMassFor(ref) !== null) return null; // pesé par convention
  const amount = input.amount ?? null;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return "sans_amount";
  if (input.unit === null || input.unit === undefined) return "sans_unit";
  if (input.unit === "unit" && !(ref.unitGrams && ref.unitGrams > 0)) return "unit_sans_poids";
  return "state_manquant";
}

const pct = (n: number, d: number) => d === 0 ? "n/a" : `${(100 * n / d).toFixed(1)} %`;

async function main() {
  const index = await loadCompositionIndex(fileClient());
  const plans = readNdjson("plans.ndjson");

  type Lane = "foyer" | "solo";
  const laneOf = (r: Record<string, unknown>): Lane =>
    String(r.plan_kind ?? "") === "household" ? "foyer" : "solo";
  const genOf = (r: Record<string, unknown>): string =>
    String(r.prompt_version ?? "").trim() || "(aucun prompt_version)";
  const dayOf = (r: Record<string, unknown>): string => String(r.created_at ?? "").slice(0, 10);

  // ① le compteur #3, coupé par lane
  const byLane = new Map<string, Tally>();
  // ② le compteur #3, coupé par lane ET par génération
  const byGen = new Map<string, Tally>();
  // ③ les journées calculables, par lane et par fenêtre
  const days = new Map<string, { total: number; complete: number }>();
  // ④ les causes de non-pesée, par lane
  const causes = new Map<string, Map<Cause, number>>();
  // ⑤ les termes non pesés, avec leur cause dominante
  const termCause = new Map<string, Map<Cause, number>>();

  const bump = (m: Map<string, Tally>, k: string): Tally => {
    let t = m.get(k);
    if (!t) m.set(k, (t = emptyTally()));
    return t;
  };
  const bumpDay = (k: string) => {
    let d = days.get(k);
    if (!d) days.set(k, (d = { total: 0, complete: 0 }));
    return d;
  };
  const bumpCause = (m: Map<string, Map<Cause, number>>, k: string, c: Cause) => {
    let inner = m.get(k);
    if (!inner) m.set(k, (inner = new Map()));
    inner.set(c, (inner.get(c) ?? 0) + 1);
  };

  for (const row of plans) {
    const lane = laneOf(row);
    const gen = genOf(row);
    const recent = dayOf(row) >= RECENT_FROM;
    const dishes = readDishes(row.dishes);
    const preparations = readPreparations(row.preparations);

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

    for (const f of foldedDishes) {
      tallyInto(bump(byLane, lane), index, f.ingredients);
      tallyInto(bump(byGen, `${lane}${SEP}${gen}`), index, f.ingredients);
      for (const ing of f.ingredients) {
        const c = causeOf(index, ing);
        if (!c) continue;
        bumpCause(causes, lane, c);
        bumpCause(termCause, String(ing.term ?? "").trim().toLowerCase(), c);
      }
    }

    const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));
    const energy = planEnergy({
      index,
      dishes,
      preparations,
      servings,
      addons: [],
      mealsOutByDay: new Map<string | null, number>(),
    });
    for (const day of energy.days) {
      const all = bumpDay(`${lane}${SEP}tout`);
      all.total++;
      if (day.complete) all.complete++;
      if (recent) {
        const rec = bumpDay(`${lane}${SEP}récents`);
        rec.total++;
        if (day.complete) rec.complete++;
      }
      // ⛔ LA COUPE QUI ARME LE SECOND SEUIL. « journées calculables solo »
      // fondu sur tout le corpus mélange trois générations de prompt MORTES
      // (v1, v2, v3 — 100 % de leurs ingrédients sans `amount`) avec celles
      // qui tournent aujourd'hui. Les deux populations ne se comparent pas.
      const per = bumpDay(`${lane}${SEP}${gen}`);
      per.total++;
      if (day.complete) per.complete++;
    }
  }

  const out: string[] = [];
  out.push("── L-1 · #3 PAR LANE — RÉSOLU+PESÉ, après pliage ──────────────────────────");
  out.push(
    "   ⚠️ « hors convention » retire les condiments pesés par `condimentMassFor`:",
  );
  out.push("      c'est le nombre auquel un seuil « le modèle écrit ses quantités » se cale.");
  let gTotal = 0, gKnown = 0, gWeighed = 0, gConv = 0;
  for (const lane of ["foyer", "solo"]) {
    const t = byLane.get(lane) ?? emptyTally();
    gTotal += t.total;
    gKnown += t.known;
    gWeighed += t.weighed;
    gConv += t.conventional;
    out.push(
      `     ${lane.padEnd(6)} lignes ${String(t.total).padStart(6)} · RÉSOLU ${
        pct(t.known, t.total).padStart(7)
      } · RÉSOLU+PESÉ ${pct(t.weighed, t.total).padStart(7)} · hors convention ${
        pct(t.weighed - t.conventional, t.total).padStart(7)
      }`,
    );
    out.push(
      `            RÉSOLUES ET NON PESÉES ${String(t.known - t.weighed).padStart(5)} / ${
        String(t.total).padStart(5)
      } = ${pct(t.known - t.weighed, t.total)}`,
    );
  }
  out.push(
    `     TOTAL  lignes ${String(gTotal).padStart(6)} · RÉSOLU+PESÉ ${
      pct(gWeighed, gTotal)
    } · hors convention ${pct(gWeighed - gConv, gTotal)}`,
  );
  out.push(
    `     ⛔ LE SEUIL DE L-1 — RÉSOLUES ET NON PESÉES : ${gKnown - gWeighed} / ${gTotal} = ${
      pct(gKnown - gWeighed, gTotal)
    }`,
  );

  out.push("");
  out.push("── L-1 · #3 PAR LANE **ET PAR GÉNÉRATION DE PROMPT** ──────────────────────");
  out.push("   ⛔ Sans cette coupe, le renouvellement du corpus se confond avec le lot.");
  const gens = [...byGen.entries()].sort((a, b) => {
    const [la, ga] = a[0].split(SEP);
    const [lb, gb] = b[0].split(SEP);
    return la === lb ? ga.localeCompare(gb) : la.localeCompare(lb);
  });
  for (const [key, t] of gens) {
    const [lane, gen] = key.split(SEP);
    out.push(
      `     ${lane.padEnd(6)} ${gen.padEnd(76)} lignes ${String(t.total).padStart(5)} · ` +
        `+PESÉ ${pct(t.weighed, t.total).padStart(7)} · hors conv ${
          pct(t.weighed - t.conventional, t.total).padStart(7)
        } · NON PESÉES ${String(t.known - t.weighed).padStart(4)}`,
    );
  }

  out.push("");
  out.push("── L-1 · LES CAUSES DE NON-PESÉE — ⛔ `unit_grams` N'EN RÉPARE QU'UNE ─────");
  for (const lane of ["foyer", "solo"]) {
    const inner = causes.get(lane) ?? new Map<Cause, number>();
    const tot = [...inner.values()].reduce((a, b) => a + b, 0);
    const cell = (c: Cause) => `${c} ${String(inner.get(c) ?? 0).padStart(5)}`;
    out.push(
      `     ${lane.padEnd(6)} ${String(tot).padStart(5)} lignes · ${cell("sans_amount")} · ${
        cell("sans_unit")
      } · ${cell("unit_sans_poids")} · ${cell("state_manquant")}`,
    );
  }
  const gAll = new Map<Cause, number>();
  for (const inner of causes.values()) {
    for (const [c, n] of inner) gAll.set(c, (gAll.get(c) ?? 0) + n);
  }
  out.push(
    `     TOTAL  sans_amount ${gAll.get("sans_amount") ?? 0} · sans_unit ${
      gAll.get("sans_unit") ?? 0
    } · unit_sans_poids ${gAll.get("unit_sans_poids") ?? 0} · state_manquant ${
      gAll.get("state_manquant") ?? 0
    }`,
  );

  out.push("");
  out.push("── L-1 · LES 40 TERMES QUI COÛTENT LE PLUS, ET LEUR CAUSE ────────────────");
  out.push("   ⛔ La colonne `unit_sans_poids` est la SEULE que ce lot peut retourner.");
  const ranked = [...termCause.entries()].map(([term, m]) => {
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    return { term, m, tot };
  }).sort((a, b) => b.tot - a.tot).slice(0, 40);
  for (const r of ranked) {
    out.push(
      `     ${r.term.padEnd(34)} ${String(r.tot).padStart(5)} · sans_amount ${
        String(r.m.get("sans_amount") ?? 0).padStart(4)
      } · sans_unit ${String(r.m.get("sans_unit") ?? 0).padStart(3)} · unit_sans_poids ${
        String(r.m.get("unit_sans_poids") ?? 0).padStart(4)
      } · state_manquant ${String(r.m.get("state_manquant") ?? 0).padStart(4)}`,
    );
  }

  out.push("");
  out.push("── L-1 · JOURNÉES CALCULABLES — tout le corpus, puis les plans RÉCENTS ────");
  out.push(`   « récents » = created_at >= ${RECENT_FROM} (la fenêtre de la fiche)`);
  for (const lane of ["foyer", "solo"]) {
    for (const win of ["tout", "récents"]) {
      const d = days.get(`${lane}${SEP}${win}`) ?? { total: 0, complete: 0 };
      out.push(
        `     ${lane.padEnd(6)} ${win.padEnd(8)} ${String(d.complete).padStart(4)} / ${
          String(d.total).padStart(4)
        } = ${pct(d.complete, d.total)}`,
      );
    }
  }

  out.push("");
  out.push("── L-1 · JOURNÉES CALCULABLES **PAR GÉNÉRATION DE PROMPT** ───────────────");
  out.push("   ⛔ C'est cette coupe, et elle seule, qui sépare le gain d'un lot du");
  out.push("      renouvellement du corpus.");
  const dayGens = [...days.entries()]
    .filter(([k]) => !k.endsWith(`${SEP}tout`) && !k.endsWith(`${SEP}récents`))
    .sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, d] of dayGens) {
    const [lane, gen] = key.split(SEP);
    out.push(
      `     ${lane.padEnd(6)} ${gen.padEnd(76)} ${String(d.complete).padStart(4)} / ${
        String(d.total).padStart(4)
      } = ${pct(d.complete, d.total)}`,
    );
  }

  // ⛔ CARDINALITÉ — la leçon de `V0-E′-bis`: un bloc qui s'évapore ne laisse
  // aucune trace. Chaque section porte son titre; on compte les titres.
  const sections = out.filter((l) => l.startsWith("── L-1 ·")).length;
  if (sections !== 6) {
    console.error(`⛔ CARDINALITÉ: ${sections}/6 sections rendues — la sortie est FAUSSE.`);
    Deno.exit(1);
  }
  for (const l of out) console.log(l);
}

await main();
