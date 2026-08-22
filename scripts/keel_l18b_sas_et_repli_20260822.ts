/**
 * ══════════════════════════════════════════════════════════════════════════
 * L18b — LE SAS, ET LE REPLI PAR BORNES QUI CESSE D'ÊTRE STRUCTURELLEMENT
 *        MORT. ⛔ SUR LES **DEUX** DÉNOMINATEURS, TOUJOURS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L18b`.
 *
 *     bash scripts/keel_l18b_sas_et_repli_20260822.sh
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN ET N'APPELLE AUCUN MODÈLE ────────────────────
 * Le modèle est MUET dans les deux passes, et ce n'est pas une simplification:
 * **le repli par bornes n'existe que pour le jour où le modèle se tait.** Le
 * mesurer avec un modèle qui répond mesurerait autre chose.
 *
 * ── ⛔ CE QUE LES DEUX PASSES COMPARENT, ET POURQUOI DANS LE MÊME PROCESSUS ─
 *   AVANT — le groupe du repli vient UNIQUEMENT de `DishIngredient.group`
 *           (0 ligne sur 10 038 en porte un ⇒ `no_group`, abstention).
 *   APRÈS — `L18b`: le sas comble le `null`, sur ÉGALITÉ de terme normalisé.
 * Le référentiel, les plans et l'index sont lus UNE fois et partagés. Registre
 * §⑨ n° 55: deux extractions ne comparent pas deux règles, elles comparent deux
 * référentiels.
 *
 * ── ⛔ LES TROIS CHOSES QUE CE FICHIER REFUSE DE FAIRE ─────────────────────
 * ① **IL NE REND JAMAIS UN SEUL DÉNOMINATEUR** (registre §⑨ n° 50, amendé):
 *    [A] le corpus entier protège du seuil qu'on abaisse, [B] le millésime
 *    vivant protège du seuil qu'on ne pouvait pas rater. Ni l'un ni l'autre ne
 *    suffit seul, et la population exclue est NOMMÉE et COMPTÉE.
 * ② **IL NE DÉCLARE PAS UN SEUIL QU'IL N'A PAS MESURÉ.** Le seuil du sas
 *    demande un RUN, et le budget de ce lot est nul: il est imprimé « EN
 *    ATTENTE », avec la requête littérale qui le lira.
 * ③ **IL NE LIT AUCUNE VALEUR DU SAS.** Comme le code de production, il ne
 *    prend que `food_group_ref`. Une valeur à portée de main finit par être lue.
 *
 * ── LA GARDE DE CARDINALITÉ ───────────────────────────────────────────────
 * `V0-E′-bis`: un compteur qui DISPARAÎT de la sortie ne se voit pas — 9 lignes
 * au lieu de 10, `rc=0`, sans un mot. Chaque verdict est compté; un manque sort
 * en `rc=1`.
 */

import {
  fileClient,
  readIngredient,
} from "./keel_v0e_resolveur_20260821.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  type EnergyDish,
  type EnergyIngredient,
  type EnergyPreparation,
  planEnergyAtTolerance,
  UNRESOLVED_ENERGY_TOLERANCE,
} from "../supabase/functions/_shared/keel/plan_energy.ts";
import { persistedGroupOf } from "../supabase/functions/_shared/keel/food_group_write.ts";
import {
  fillCompositions,
  fillRequestsFor,
  groupBandsFrom,
  withFilledRefs,
} from "../supabase/functions/_shared/keel/composition_fill.ts";
import { requestsWithPendingGroups } from "../supabase/functions/_shared/keel/composition_fill_io.ts";
import type { CompositionIndex } from "../supabase/functions/_shared/keel/food_composition.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "../supabase/functions/_shared/keel/tokens.ts";

// ---------------------------------------------------------------------------
// ① LE MILLÉSIME VIVANT — la règle d'exclusion, épinglée avant toute mesure
// ---------------------------------------------------------------------------

export const LIVE_MEAL_PROMPT = "meal.en.v18_one_box_per_group";
export const LIVE_HOUSEHOLD_PROMPT = "household.v21_one_box_per_group";

const LANES = ["foyer", "solo"] as const;
type Lane = (typeof LANES)[number];

export function laneOf(planKind: unknown): Lane {
  return String(planKind ?? "") === "household" ? "foyer" : "solo";
}

export function isLivePrompt(lane: Lane, promptVersion: unknown): boolean {
  const pv = String(promptVersion ?? "");
  return lane === "foyer"
    ? pv === `${LIVE_MEAL_PROMPT}+${LIVE_HOUSEHOLD_PROMPT}`
    : pv === LIVE_MEAL_PROMPT;
}

// ---------------------------------------------------------------------------
// ② LES ADAPTATEURS — ceux de `V0-E′`, PLUS la clé `group` (comme `L17`)
// ---------------------------------------------------------------------------

function readIngredientsWithGroup(raw: unknown): EnergyIngredient[] {
  if (!Array.isArray(raw)) return [];
  const out: EnergyIngredient[] = [];
  for (const entry of raw) {
    const base = readIngredient(entry);
    if (!base) continue;
    out.push({ ...base, group: persistedGroupOf(entry) });
  }
  return out;
}

function readDishesWithGroup(raw: unknown): EnergyDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      ingredients: readIngredientsWithGroup(d.ingredients),
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

function readPreparationsWithGroup(raw: unknown): EnergyPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredientsWithGroup(p.ingredients),
    };
  }).filter((p) => p.id !== "");
}

// ---------------------------------------------------------------------------
// ③ LE COMPTE
// ---------------------------------------------------------------------------

interface Tally {
  plans: number;
  days: number;
  daysComplete: number;
  dishes: number;
  dishesComplete: number;
  /** Termes inconnus DISTINCTS rencontrés (compteur ④ du lot 18, cumulé). */
  unknownTerms: number;
  /** Ceux que le repli a pu BORNER — le chiffre que ce lot déplace. */
  bounded: number;
  /** Ceux qui s'abstiennent faute de groupe. */
  noGroup: number;
  /** Ceux dont le groupe existe mais n'a pas de bande (< 3 lignes). */
  noBand: number;
}

const emptyTally = (): Tally => ({
  plans: 0,
  days: 0,
  daysComplete: 0,
  dishes: 0,
  dishesComplete: 0,
  unknownTerms: 0,
  bounded: 0,
  noGroup: 0,
  noBand: 0,
});

const pct = (n: number, d: number, digits = 1) =>
  d === 0 ? "  n/a" : `${(100 * n / d).toFixed(digits)} %`;

function readNdjson(dir: string, name: string): Record<string, unknown>[] {
  const path = `${dir}/${name}`;
  let raw = "";
  try {
    raw = Deno.readTextFileSync(path);
  } catch {
    return [];
  }
  return raw.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
}

/** Une passe = une politique de groupe pour le repli, modèle MUET. */
interface Pass {
  nom: string;
  /** La table du sas telle que cette passe la voit. Vide = la règle d'AVANT. */
  sas: Map<string, FoodGroupRef>;
  all: Record<Lane, Tally>;
  live: Record<Lane, Tally>;
}

/**
 * LE REPLI, JOUÉ SUR UN PLAN, MODÈLE MUET.
 *
 * ⛔ LE CODE DE PRODUCTION, JAMAIS UNE COPIE: `fillRequestsFor`,
 * `requestsWithPendingGroups`, `fillCompositions` et `withFilledRefs` sont
 * importés. Ce script ne réécrit aucune règle.
 */
function repairSilently(
  base: CompositionIndex,
  dishes: readonly EnergyDish[],
  preparations: readonly EnergyPreparation[],
  sas: ReadonlyMap<string, FoodGroupRef>,
): { index: CompositionIndex; counts: Record<string, number>; unknowns: number } {
  const inputs = [...dishes, ...preparations].flatMap((d) => d.ingredients);
  const { requests, overCap } = fillRequestsFor(base, inputs);
  if (requests.length === 0) {
    return { index: base, counts: {}, unknowns: 0 };
  }
  const armed = requestsWithPendingGroups(requests, sas);
  const result = fillCompositions({
    index: base,
    requests: armed.requests,
    // ⛔ LE MODÈLE EST MUET. C'est le seul état où le repli par bornes existe.
    answers: [],
    bands: groupBandsFrom(base),
    overCap,
  });
  const { index, counts: _ignored } = {
    ...withFilledRefs(base, result.filled),
    counts: result.counts,
  };
  return { index, counts: result.counts, unknowns: requests.length };
}

async function main() {
  const dir = Deno.args[0];
  if (!dir) {
    console.error("usage: keel_l18b_sas_et_repli_20260822.ts <dir>");
    Deno.exit(2);
  }

  const plans = readNdjson(dir, "plans.ndjson");
  const refs = readNdjson(dir, "food_composition_refs.ndjson");
  const pending = readNdjson(dir, "food_composition_pending.ndjson");
  const weekly = readNdjson(dir, "composition_fill_weekly.ndjson");
  const index = await loadCompositionIndex(fileClient(dir));

  const cronRaw = (() => {
    try {
      return Deno.readTextFileSync(`${dir}/cron_counts.txt`).trim().split("|");
    } catch {
      return ["?", "?", "?"];
    }
  })();
  const measuredRaw = (() => {
    try {
      return Deno.readTextFileSync(`${dir}/plan_measured_counts.txt`).trim().split("|");
    } catch {
      return ["?", "?"];
    }
  })();

  // ── LE SAS, tel qu'il est AUJOURD'HUI ────────────────────────────────────
  const sasGroups = new Map<string, FoodGroupRef>();
  for (const row of pending) {
    const term = String(row.term ?? "");
    const group = String(row.food_group_ref ?? "");
    if (!term) continue;
    if (!(FOOD_GROUP_REFS as readonly string[]).includes(group)) continue;
    sasGroups.set(term, group as FoodGroupRef);
  }

  const passes: Pass[] = [
    { nom: "AVANT", sas: new Map(), all: { foyer: emptyTally(), solo: emptyTally() }, live: { foyer: emptyTally(), solo: emptyTally() } },
    { nom: "APRÈS", sas: sasGroups, all: { foyer: emptyTally(), solo: emptyTally() }, live: { foyer: emptyTally(), solo: emptyTally() } },
  ];

  const excluded = new Map<string, number>();

  for (const row of plans) {
    const lane = laneOf(row.plan_kind);
    // ⛔ LES DEUX PASSES LISENT LE MÊME OBJET.
    const dishes = readDishesWithGroup(row.dishes);
    const preparations = readPreparationsWithGroup(row.preparations);
    const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));
    const isLive = isLivePrompt(lane, row.prompt_version);
    if (!isLive) {
      const key = `${lane} · ${String(row.prompt_version ?? "«aucun prompt_version»")}`;
      excluded.set(key, (excluded.get(key) ?? 0) + 1);
    }

    for (const pass of passes) {
      const repaired = repairSilently(index, dishes, preparations, pass.sas);
      const energy = planEnergyAtTolerance({
        index: repaired.index,
        dishes,
        preparations,
        servings,
        addons: [],
        mealsOutByDay: new Map<string | null, number>(),
      }, UNRESOLVED_ENERGY_TOLERANCE);
      for (const t of isLive ? [pass.all[lane], pass.live[lane]] : [pass.all[lane]]) {
        t.plans++;
        t.unknownTerms += repaired.unknowns;
        t.bounded += repaired.counts.group_bounds ?? 0;
        t.noGroup += repaired.counts.no_group ?? 0;
        t.noBand += repaired.counts.no_band ?? 0;
        for (const day of energy.days) {
          t.days++;
          if (day.complete) t.daysComplete++;
        }
        for (const d of energy.dishes) {
          t.dishes++;
          if (d.complete) t.dishesComplete++;
        }
      }
    }
  }

  const [before, after] = passes;

  // ── LA SORTIE ────────────────────────────────────────────────────────────
  const REQUIRED = [
    "① le sas · niveau",
    "② composition_fill_weekly",
    "③ le cron de promotion",
    "④ le repli · CORPUS ENTIER",
    "④ le repli · PROMPT VIVANT",
    "⑤ plats résolus · CORPUS ENTIER",
    "⑤ plats résolus · PROMPT VIVANT",
    "⑥ la langue du sas",
    "⑦ le seuil du sas · EN ATTENTE",
  ];
  const rendered = new Set<string>();
  const out: string[] = [];
  const emit = (key: string, lines: string[]) => {
    rendered.add(key);
    out.push(...lines);
  };

  out.push("");
  out.push("═══════════════════════════════════════════════════════════════════════════");
  out.push("L18b — LE SAS, ET LE REPLI QUI CESSE D'ÊTRE MORT");
  out.push(
    `         ${new Date().toISOString()} · ${plans.length} plans · ${refs.length} lignes de référentiel`,
  );
  out.push("         ⛔ MODÈLE MUET dans les deux passes · MÊME instantané, MÊME processus");
  out.push("═══════════════════════════════════════════════════════════════════════════");

  // ① LE SAS
  {
    const l: string[] = ["", "① LE SAS — `food_composition_pending`"];
    l.push(`   niveau: ${pending.length} ligne(s)`);
    const parStatut = new Map<string, number>();
    const parSource = new Map<string, number>();
    for (const r of pending) {
      const s = String(r.status ?? "?");
      const f = String(r.fill_source ?? "?");
      parStatut.set(s, (parStatut.get(s) ?? 0) + 1);
      parSource.set(f, (parSource.get(f) ?? 0) + 1);
    }
    l.push(
      `   par statut: ${[...parStatut].map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}`,
    );
    l.push(
      `   par source: ${[...parSource].map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}`,
    );
    const promouvables = pending.filter((r) =>
      String(r.status) === "pending" && Number(r.sightings) >= 3 &&
      String(r.fill_source) === "model"
    );
    l.push(
      `   promouvables MAINTENANT (pending · model · sightings ≥ 3): ${promouvables.length}`,
    );
    l.push("   la liste littérale, avec `first_seen_at` — c'est elle qui porte le DELTA:");
    for (const r of pending) {
      l.push(
        `     · ${String(r.term).padEnd(20)} ${String(r.food_group_ref ?? "—").padEnd(14)} ` +
          `${String(r.fill_source).padEnd(13)} vu ${String(r.sightings).padStart(2)}× ` +
          `${String(r.status).padEnd(13)} depuis ${r.first_seen_at}`,
      );
    }
    l.push(
      `   plans en base: ${measuredRaw[0]} · MESURÉS (composition_unknowns non nul): ${measuredRaw[1]}`,
    );
    emit("① le sas · niveau", l);
  }

  // ② LA VUE
  {
    const l: string[] = ["", "② `composition_fill_weekly` — le seul chiffre qui dise si le lot 18 réussit"];
    if (weekly.length === 0) {
      l.push("   ⛔ AUCUNE SEMAINE. La vue ne compte que les plans MESURÉS.");
    }
    for (const w of weekly) {
      l.push(
        `   ${w.week} · ${String(w.plan_kind).padEnd(10)} plans ${String(w.plans).padStart(3)} · ` +
          `unknowns_median ${String(w.unknowns_median).padStart(6)} · max ${String(w.unknowns_max).padStart(3)} · ` +
          `table ${w.share_table} · promoted ${w.share_promoted} · model ${w.share_model} · group_bounds ${w.share_group_bounds}`,
      );
    }
    l.push(
      `   ⚠️ La DIRECTION du lot — « unknowns_median BAISSE semaine après semaine » — demande DEUX semaines.`,
    );
    l.push(
      `   Semaines disponibles: ${weekly.length}. ${
        weekly.length >= 2 ? "" : "⇒ NON MESURABLE aujourd'hui, EN ATTENTE du run groupé."
      }`,
    );
    emit("② composition_fill_weekly", l);
  }

  // ③ LE CRON
  {
    const l: string[] = ["", "③ LE CRON DE PROMOTION — vérifié, jamais cru sur parole"];
    l.push(`   crons en base: ${cronRaw[0]}`);
    l.push(`   crons citant \`promote_pending_food_compositions\`: ${cronRaw[1]}`);
    l.push(`   crons citant \`composition\` (au sens large): ${cronRaw[2]}`);
    l.push(
      `   ⇒ ${
        cronRaw[1] === "0"
          ? "⛔ AUCUN APPELANT. La promotion ne se lance qu'à la main."
          : "un appelant existe"
      }`,
    );
    emit("③ le cron de promotion", l);
  }

  // ④ LE REPLI, DEUX DÉNOMINATEURS
  for (const [key, scope, titre] of [
    ["④ le repli · CORPUS ENTIER", "all", "[A] CORPUS ENTIER"],
    ["④ le repli · PROMPT VIVANT", "live", "[B] PROMPT VIVANT"],
  ] as const) {
    const l: string[] = ["", `④ LE REPLI PAR BORNES, MODÈLE MUET — ${titre}`];
    for (const lane of LANES) {
      const b = before[scope][lane];
      const a = after[scope][lane];
      l.push(
        `   ${lane.padEnd(6)} plans ${String(a.plans).padStart(3)} · termes inconnus ${
          String(a.unknownTerms).padStart(4)
        }`,
      );
      l.push(
        `          bornés   AVANT ${String(b.bounded).padStart(4)}  →  APRÈS ${
          String(a.bounded).padStart(4)
        }   (delta ${a.bounded - b.bounded >= 0 ? "+" : ""}${a.bounded - b.bounded})`,
      );
      l.push(
        `          no_group AVANT ${String(b.noGroup).padStart(4)}  →  APRÈS ${
          String(a.noGroup).padStart(4)
        }   (delta ${a.noGroup - b.noGroup >= 0 ? "+" : ""}${a.noGroup - b.noGroup})`,
      );
    }
    emit(key, l);
  }

  // ⑤ LES PLATS ET LES JOURNÉES
  for (const [key, scope, titre] of [
    ["⑤ plats résolus · CORPUS ENTIER", "all", "[A] CORPUS ENTIER"],
    ["⑤ plats résolus · PROMPT VIVANT", "live", "[B] PROMPT VIVANT"],
  ] as const) {
    const l: string[] = ["", `⑤ PLATS ENTIÈREMENT RÉSOLUS ET JOURNÉES CALCULABLES — ${titre}`];
    for (const lane of LANES) {
      const b = before[scope][lane];
      const a = after[scope][lane];
      l.push(
        `   ${lane.padEnd(6)} plats    AVANT ${String(b.dishesComplete).padStart(4)}/${
          String(b.dishes).padStart(4)
        } ${pct(b.dishesComplete, b.dishes)}  →  APRÈS ${String(a.dishesComplete).padStart(4)}/${
          String(a.dishes).padStart(4)
        } ${pct(a.dishesComplete, a.dishes)}   (delta ${
          a.dishesComplete - b.dishesComplete >= 0 ? "+" : ""
        }${a.dishesComplete - b.dishesComplete})`,
      );
      l.push(
        `          journées AVANT ${String(b.daysComplete).padStart(4)}/${
          String(b.days).padStart(4)
        } ${pct(b.daysComplete, b.days)}  →  APRÈS ${String(a.daysComplete).padStart(4)}/${
          String(a.days).padStart(4)
        } ${pct(a.daysComplete, a.days)}   (delta ${
          a.daysComplete - b.daysComplete >= 0 ? "+" : ""
        }${a.daysComplete - b.daysComplete})`,
      );
    }
    if (scope === "live") {
      l.push("   population EXCLUE, nommée et comptée:");
      for (const [k, v] of [...excluded].sort((x, y) => y[1] - x[1])) {
        l.push(`     · ${String(v).padStart(3)} plan(s) — ${k}`);
      }
    }
    emit(key, l);
  }

  // ⑥ LA LANGUE DU SAS
  {
    const l: string[] = ["", "⑥ LA LANGUE DU SAS — à quoi sert le lot 18, mesuré"];
    // ⛔ AUCUN MATCHER DE LANGUE: on lit la locale DÉCLARÉE des plans qui
    // portent le terme, jamais le mot lui-même.
    const locales = new Map<string, number>();
    for (const row of plans) {
      const terms = new Set<string>();
      for (const d of [...readDishesWithGroup(row.dishes), ...readPreparationsWithGroup(row.preparations)]) {
        for (const ing of d.ingredients) terms.add(String(ing.term ?? "").trim().toLowerCase());
      }
      for (const t of sasGroups.keys()) {
        if (!terms.has(t)) continue;
        const loc = String(row.content_locale ?? "«absente»");
        locales.set(loc, (locales.get(loc) ?? 0) + 1);
      }
    }
    l.push(
      `   les ${sasGroups.size} termes du sas, par locale DÉCLARÉE des plans qui les portent: ${
        [...locales].map(([k, v]) => `${k} ${v}`).join(" · ") || "aucun plan porteur"
      }`,
    );
    emit("⑥ la langue du sas", l);
  }

  // ⑦ LE SEUIL QUI DEMANDE UN RUN
  {
    const l: string[] = ["", "⑦ ⛔ LE SEUIL DU SAS — EN ATTENTE DU RUN GROUPÉ, ni atteint ni manqué"];
    l.push("   Il se lit en DELTA, pas en niveau: le sas porte DÉJÀ des lignes, et un lot");
    l.push("   entièrement désarmé serait déclaré réussi par un seuil de niveau (§⑨ n° 50).");
    l.push("   Seuil: le sas gagne AU MOINS 3 TERMES NEUFS pendant le run groupé.");
    l.push("");
    l.push("   ── LA REQUÊTE, LITTÉRALE, À COLLER APRÈS LE RUN ──────────────────────");
    l.push("   -- ⚠️ REMPLACER `<T0>` par l'horodatage UTC de LANCEMENT du run groupé.");
    l.push("   select");
    l.push("     (select count(*) from public.food_composition_pending) as niveau_apres,");
    l.push("     (select count(*) from public.food_composition_pending");
    l.push("       where first_seen_at < timestamptz '<T0>') as niveau_avant,");
    l.push("     (select count(*) from public.food_composition_pending");
    l.push("       where first_seen_at >= timestamptz '<T0>') as delta_termes_neufs;");
    l.push("");
    l.push("   -- LA LISTE LITTÉRALE DES TERMES NEUFS — un compte ne suffit pas.");
    l.push("   select term, food_group_ref, fill_source, sightings, status, first_seen_at");
    l.push("   from public.food_composition_pending");
    l.push("   where first_seen_at >= timestamptz '<T0>'");
    l.push("   order by first_seen_at, term;");
    l.push("");
    l.push("   -- LA DIRECTION (`unknowns_median` en BAISSE sur deux semaines).");
    l.push("   select week, plan_kind, plans, unknowns_median, unknowns_max,");
    l.push("          share_table, share_promoted, share_model, share_group_bounds");
    l.push("   from public.composition_fill_weekly order by week desc, plan_kind;");
    l.push("");
    l.push(`   niveau AVANT ce lot, mesuré ici: ${pending.length}`);
    emit("⑦ le seuil du sas · EN ATTENTE", l);
  }

  out.push("");
  out.push("═══════════════════════════════════════════════════════════════════════════");

  const missing = REQUIRED.filter((k) => !rendered.has(k));
  if (missing.length > 0) {
    console.error(
      `⛔ CARDINALITÉ: ${rendered.size}/${REQUIRED.length} — MANQUANT(S): ${missing.join(", ")}`,
    );
    Deno.exit(1);
  }
  out.push(`FIN — ${REQUIRED.length} sections rendues`);
  console.log(out.join("\n"));
}

if (import.meta.main) await main();
