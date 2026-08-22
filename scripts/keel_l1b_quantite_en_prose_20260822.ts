/**
 * ══════════════════════════════════════════════════════════════════════════
 * L-1-b — LA QUANTITÉ ÉCRITE EN CLAIR · AVANT ET APRÈS, DANS LE MÊME RUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-1-b`.
 * Lancé par `scripts/keel_l1b_quantite_en_prose_20260822.sh`, jamais seul.
 *
 *     deno run --allow-read scripts/keel_l1b_quantite_en_prose_20260822.ts <dir>
 *
 * ── ⛔ POURQUOI DEUX COLONNES ET PAS DEUX RUNS ────────────────────────────
 * La `mesure AVANT` et la `mesure APRÈS` de ce lot sortent du MÊME passage sur
 * le MÊME corpus, à la même seconde, par le MÊME code — seule change une
 * variable: la copie en prose est passée au résolveur, ou elle ne l'est pas.
 * Deux runs séparés autour d'un `git checkout` mesureraient aussi le corpus qui
 * bouge sous les pieds (le dépôt est partagé, et `V0-D` écrit des plans).
 *
 * ── ⛔ LES DEUX DÉNOMINATEURS, TOUJOURS (§⑨ n° 50) ────────────────────────
 * Trois générations de prompt sont MORTES — `meal.en.v1_doctrine`,
 * `meal.en.v2_batch`, `meal.en.v3_preparations`. Elles écrivent 100 % de leurs
 * ingrédients sans `amount`, elles pèsent 89 % du problème, et **aucun lot ne
 * peut les changer**: le prompt qui les a produites n'existe plus. Un seuil pris
 * sur elles est un échec garanti déguisé en exigence.
 *
 * ⛔ La règle d'exclusion est OBJECTIVE et déclarée d'avance — « le millésime de
 * prompt n'est plus déployable » —, elle est écrite au registre AVANT cette
 * mesure, et ce script imprime **TOUJOURS les deux dénominateurs**, avec la
 * population exclue NOMMÉE et COMPTÉE à côté de chaque chiffre.
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN ─────────────────────────────────────────────
 * Aucun `insert`, aucun `update`, aucun appel de modèle. Il lit trois NDJSON et
 * il imprime des lignes.
 *
 * ── CE QUI EST IMPORTÉ, ET CE QUI EST RECOPIÉ ─────────────────────────────
 * IMPORTÉ (production, jamais une copie): `loadCompositionIndex`,
 * `resolveIngredients`, `foldPreparationsIntoDishes`, `planEnergy`, et surtout
 * `readQuantityFromProse` — la ventilation ci-dessous est donc comptée par LE
 * lecteur du produit, pas par une regex de script qui pourrait en diverger.
 *
 * RECOPIÉ, comme dans `keel_v0e_resolveur_20260821.ts` et pour la même raison
 * (le module de production ouvre un serveur au chargement): les lecteurs
 * d'entrée `readIngredient` / `readDishes` / `readPreparations` de
 * `supabase/functions/meal-energy-v1/index.ts`.
 */

import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionIndex,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  type EnergyDish,
  type EnergyPreparation,
  planEnergy,
} from "../supabase/functions/_shared/keel/plan_energy.ts";
import { readQuantityFromProse } from "../supabase/functions/_shared/keel/quantity_from_prose.ts";

const dir = Deno.args[0] ?? ".";

/**
 * ⛔ LES GÉNÉRATIONS MORTES — la population EXCLUE, nommée ici et nulle part
 * ailleurs. Trois millésimes de prompt qui n'existent plus dans le code.
 */
const GENERATIONS_MORTES: readonly string[] = [
  "meal.en.v1_doctrine",
  "meal.en.v2_batch",
  "meal.en.v3_preparations",
];

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

// ── RECOPIÉ de `meal-energy-v1/index.ts`, à UNE variable près ──────────────
//
// ⛔ `avecProse` EST LA SEULE DIFFÉRENCE ENTRE LES DEUX COLONNES. À `false`, ce
// lecteur est mot pour mot celui d'avant le lot `L-1-b`.

function readIngredient(raw: unknown, avecProse: boolean): CompositionInput | null {
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
    quantity: avecProse && typeof i.quantity === "string" ? i.quantity : null,
  };
}

function readIngredients(raw: unknown, avecProse: boolean): CompositionInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionInput[] = [];
  for (const entry of raw) {
    const i = readIngredient(entry, avecProse);
    if (i) out.push(i);
  }
  return out;
}

function readDishes(raw: unknown, avecProse: boolean): EnergyDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      ingredients: readIngredients(d.ingredients, avecProse),
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

function readPreparations(raw: unknown, avecProse: boolean): EnergyPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      servingsMade: Math.max(1, Number(p.servings_made) || 1),
      ingredients: readIngredients(p.ingredients, avecProse),
    };
  }).filter((p) => p.id !== "");
}

// ── LE COMPTE ──────────────────────────────────────────────────────────────

interface Tally {
  total: number;
  /**
   * ⛔ `known`, ET C'EST LE NUMÉRATEUR QUI COMPTE. « Résolues ET non pesées »
   * se prend sur les lignes que le référentiel CONNAÎT: `known - weighed`,
   * jamais `total - weighed`. Le second ajouterait les termes inconnus, qui
   * sont le problème d'un AUTRE lot (`L18b`, la curation d'alias), et le
   * chiffre cesserait d'être comparable au 21,2 % de `L-1`.
   */
  known: number;
  weighed: number;
  prose: number;
}
const emptyTally = (): Tally => ({ total: 0, known: 0, weighed: 0, prose: 0 });

function tallyInto(t: Tally, index: CompositionIndex, ings: readonly CompositionInput[]) {
  if (ings.length === 0) return;
  const r = resolveIngredients(index, ings);
  t.total += r.total;
  t.known += r.total - r.unresolvedTerms.length;
  t.weighed += r.resolved.length;
  t.prose += r.proseQuantityTerms.length;
}

/** Un passage complet sur le corpus, avec ou sans la seconde lecture. */
interface Passage {
  /** Toutes lignes pliées confondues. */
  lignes: Tally;
  /** Hors générations mortes. */
  lignesVivantes: Tally;
  /** Motifs d'abstention, plats pliés, par le chemin de production. */
  gaps: Map<string, number>;
  gapsVivants: Map<string, number>;
  platsTotal: number;
  platsVivants: number;
  /** Journées calculables, par lane. */
  jours: Map<string, { total: number; complete: number }>;
  joursVivants: Map<string, { total: number; complete: number }>;
}

const bumpGap = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const bumpJour = (m: Map<string, { total: number; complete: number }>, k: string) => {
  let d = m.get(k);
  if (!d) m.set(k, (d = { total: 0, complete: 0 }));
  return d;
};

function passage(
  index: CompositionIndex,
  plans: Record<string, unknown>[],
  avecProse: boolean,
): Passage {
  const p: Passage = {
    lignes: emptyTally(),
    lignesVivantes: emptyTally(),
    gaps: new Map(),
    gapsVivants: new Map(),
    platsTotal: 0,
    platsVivants: 0,
    jours: new Map(),
    joursVivants: new Map(),
  };
  for (const row of plans) {
    const lane = String(row.plan_kind ?? "") === "household" ? "foyer" : "solo";
    const gen = String(row.prompt_version ?? "").trim() || "(aucun prompt_version)";
    const vivant = !GENERATIONS_MORTES.includes(gen);
    const dishes = readDishes(row.dishes, avecProse);
    const preparations = readPreparations(row.preparations, avecProse);

    const folded = foldPreparationsIntoDishes({
      dishes: dishes.map((d) => ({
        slot: null,
        method: d.method,
        ingredients: d.ingredients,
        uses: d.uses,
      })),
      preparations: preparations.map((prep) => ({
        id: prep.id,
        servingsMade: prep.servingsMade,
        ingredients: prep.ingredients,
      })),
    });
    for (const f of folded) {
      tallyInto(p.lignes, index, f.ingredients);
      if (vivant) tallyInto(p.lignesVivantes, index, f.ingredients);
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
    for (const d of energy.dishes) {
      p.platsTotal++;
      if (vivant) p.platsVivants++;
      if (d.complete) continue;
      for (const g of d.gaps) {
        bumpGap(p.gaps, g);
        if (vivant) bumpGap(p.gapsVivants, g);
      }
    }
    for (const day of energy.days) {
      const j = bumpJour(p.jours, lane);
      j.total++;
      if (day.complete) j.complete++;
      if (vivant) {
        const jv = bumpJour(p.joursVivants, lane);
        jv.total++;
        if (day.complete) jv.complete++;
      }
    }
  }
  return p;
}

// ── LA VENTILATION BRUTE — comptée par LE lecteur du produit ───────────────

interface Ventilation {
  lignesJson: number;
  amountNull: number;
  proseNonVide: number;
  masse: number;
  volume: number;
  nombreNu: number;
  fraction: number;
  refuse: number;
  vide: number;
}

function ventilation(plans: Record<string, unknown>[]): Ventilation {
  const v: Ventilation = {
    lignesJson: 0,
    amountNull: 0,
    proseNonVide: 0,
    masse: 0,
    volume: 0,
    nombreNu: 0,
    fraction: 0,
    refuse: 0,
    vide: 0,
  };
  const porteurs = (raw: unknown): Record<string, unknown>[] =>
    Array.isArray(raw) ? raw.map((c) => (c ?? {}) as Record<string, unknown>) : [];
  for (const row of plans) {
    for (const carrier of [...porteurs(row.dishes), ...porteurs(row.preparations)]) {
      const rows = Array.isArray(carrier.ingredients) ? carrier.ingredients : [];
      for (const entry of rows) {
        const i = (entry ?? {}) as Record<string, unknown>;
        v.lignesJson++;
        const amount = Number(i.amount);
        if (Number.isFinite(amount) && amount > 0) continue;
        v.amountNull++;
        const q = typeof i.quantity === "string" ? i.quantity.trim() : "";
        if (q === "") {
          v.vide++;
          continue;
        }
        v.proseNonVide++;
        const lu = readQuantityFromProse(q);
        if (lu === null) {
          v.refuse++;
        } else if (lu.unit === "g") v.masse++;
        else if (lu.unit === "ml") v.volume++;
        else if (/\//.test(q)) v.fraction++;
        else v.nombreNu++;
      }
    }
  }
  return v;
}

// ── LA SORTIE ──────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => d === 0 ? "n/a" : `${(100 * n / d).toFixed(1)} %`;
const lignesSorties: string[] = [];
const dit = (s: string) => {
  lignesSorties.push(s);
  console.log(s);
};

/** Combien de SECTIONS ce script doit imprimer. Leçon de `V0-E′-bis`. */
const SECTIONS_ATTENDUES = 6;
let sections = 0;
const section = (titre: string) => {
  sections++;
  dit("");
  dit(`── ${titre} ${"─".repeat(Math.max(0, 74 - titre.length))}`);
};

async function main() {
  const index = await loadCompositionIndex(fileClient());
  const plans = readNdjson("plans.ndjson");

  const v = ventilation(plans);
  const avant = passage(index, plans, false);
  const apres = passage(index, plans, true);

  // ⛔ MÊME DÉFINITION QUE `L-1`, sinon le 21,2 % de départ n'est pas comparable.
  const nonPesees = (t: Tally) => t.known - t.weighed;
  const morts = avant.lignes.total - avant.lignesVivantes.total;

  // ①
  section("① LA VENTILATION — comptée par `readQuantityFromProse`, pas par une regex");
  dit(`     lignes d'ingrédient en base (plats + préparations, AVANT pliage)   ${v.lignesJson}`);
  dit(`     dont sans \`amount\` utilisable                                     ${v.amountNull}`);
  dit(
    `       · \`quantity\` textuel NON VIDE                                    ${v.proseNonVide}` +
      `   (${pct(v.proseNonVide, v.amountNull)})`,
  );
  dit(`       · \`quantity\` vide                                               ${v.vide}`);
  dit("     ⛔ CE QUE LE LECTEUR ACCEPTE, et rien d'autre:");
  dit(`       · masse littérale     (\`150 g\`)                                 ${v.masse}`);
  dit(`       · volume littéral     (\`200 ml\`)                                ${v.volume}`);
  dit(`       · nombre nu           (\`1\`, \`2\`)                                ${v.nombreNu}`);
  dit(`       · fraction nue        (\`1/2\`, \`1/4\`)                            ${v.fraction}`);
  dit(
    `       ⇒ LU                                                            ` +
      `${v.masse + v.volume + v.nombreNu + v.fraction}`,
  );
  dit("     ⛔ CE QUE LE LECTEUR REFUSE — aucun mot n'est lu:");
  dit(
    `       · composite / non chiffrable / unité comptée / cuillère          ${v.refuse}` +
      `   (${pct(v.refuse, v.proseNonVide)} de la prose)`,
  );

  // ②
  section("② LES DEUX POPULATIONS — ⛔ elles ne se fondent JAMAIS");
  dit("     `ecrit_structure` mesure l'OBÉISSANCE du modèle à FF-038.");
  dit("     `recupere_en_prose` mesure ce que la LECTURE a rattrapé.");
  dit("     Un seul nombre pour les deux rendrait un modèle qui cesse d'obéir");
  dit("     indiscernable d'un lecteur réparé — et ils appellent deux corrections");
  dit("     opposées.");
  dit("");
  dit(
    `     lignes pliées PESÉES · avant  ${avant.lignes.weighed}` +
      `   ·  après  ${apres.lignes.weighed}   (+${apres.lignes.weighed - avant.lignes.weighed})`,
  );
  dit(
    `       · dont écrites en STRUCTURÉ                                      ` +
      `${apres.lignes.weighed - apres.lignes.prose}`,
  );
  dit(
    `       · dont RÉCUPÉRÉES EN PROSE                                       ${apres.lignes.prose}`,
  );
  dit(`     ⚠️ contrôle: la prose lue AVANT le lot doit être 0            →   ${avant.lignes.prose}`);
  dit("");
  dit("     ⛔ DEUX GRANDEURS, ET ELLES NE SONT PAS LA MÊME:");
  dit(
    `       · lignes de BASE dont la prose se LIT   ${v.masse + v.volume + v.nombreNu + v.fraction}` +
      `   (section ①, avant pliage)`,
  );
  dit(
    `       · lignes pliées PESÉES grâce à la prose ${apres.lignes.prose}` +
      `   (lues ET converties en grammes)`,
  );
  dit("       L'écart est réel et il se nomme: une ligne lue reste non pesée si le");
  dit("       référentiel ignore le terme, s'il ignore le poids d'une unité, ou si");
  dit("       `state` manque sur une classe où il change le poids. On ne devine");
  dit("       aucun des trois.");

  // ③
  section("③ SEUIL 1 — LIGNES RÉSOLUES ET NON PESÉES · ⛔ LES DEUX DÉNOMINATEURS");
  dit(
    `     ⚠️ population EXCLUE, nommée et comptée: ${GENERATIONS_MORTES.join(", ")}`,
  );
  dit(`        ⇒ ${morts} lignes pliées (${pct(morts, avant.lignes.total)} du corpus)`);
  dit("");
  dit(
    `     [A] CORPUS ENTIER     avant  ${nonPesees(avant.lignes)} / ${avant.lignes.total} = ` +
      `${pct(nonPesees(avant.lignes), avant.lignes.total)}` +
      `   →   après  ${nonPesees(apres.lignes)} / ${apres.lignes.total} = ` +
      `${pct(nonPesees(apres.lignes), apres.lignes.total)}`,
  );
  dit(
    `     [B] HORS GÉNÉRATIONS MORTES  avant  ${nonPesees(avant.lignesVivantes)} / ` +
      `${avant.lignesVivantes.total} = ${
        pct(nonPesees(avant.lignesVivantes), avant.lignesVivantes.total)
      }` +
      `   →   après  ${nonPesees(apres.lignesVivantes)} / ${apres.lignesVivantes.total} = ` +
      `${pct(nonPesees(apres.lignesVivantes), apres.lignesVivantes.total)}`,
  );

  // ④
  section("④ SEUIL 2 — `missing_quantity` · ⛔ LES DEUX DÉNOMINATEURS");
  const mq = (p: Passage, vivants: boolean) =>
    (vivants ? p.gapsVivants : p.gaps).get("missing_quantity") ?? 0;
  dit(
    `     [A] CORPUS ENTIER     avant  ${mq(avant, false)}   →   après  ${mq(apres, false)}` +
      `   sur ${avant.platsTotal} plats pliés`,
  );
  dit(
    `     [B] HORS GÉNÉRATIONS MORTES  avant  ${mq(avant, true)}   →   après  ${
      mq(apres, true)
    }` + `   sur ${avant.platsVivants} plats pliés`,
  );
  dit("");
  dit("     ⚠️ les autres motifs, pour qu'aucun gain ne se cache dans un déplacement:");
  for (const motif of ["unknown_ingredient", "no_ingredients"]) {
    dit(
      `       ${motif.padEnd(20)} avant ${(avant.gaps.get(motif) ?? 0)
        .toString()
        .padStart(5)}   →   après ${(apres.gaps.get(motif) ?? 0).toString().padStart(5)}`,
    );
  }
  const incompletsAvant = [...avant.gaps.values()].reduce((a, b) => a + b, 0);
  const incompletsApres = [...apres.gaps.values()].reduce((a, b) => a + b, 0);
  dit(
    `       ${"TOTAL plats incomplets".padEnd(20)} avant ${
      incompletsAvant.toString().padStart(5)
    }   →   après ${incompletsApres.toString().padStart(5)}   ` +
      `⇒ ${incompletsAvant - incompletsApres} plats deviennent calculables`,
  );
  dit("");
  dit("     ⛔ `unknown_ingredient` PEUT MONTER, ET CE N'EST PAS UNE RÉGRESSION.");
  dit("       `dishEnergyAtTolerance` teste les inconnus AVANT les non-pesés: un plat");
  dit("       qui mourait à l'étape ② (`missing_quantity`) atteint maintenant l'étape");
  dit("       ③ et peut y mourir de sa borne de groupe (lot `L17`). Il a changé de");
  dit("       seau, il n'a pas régressé — c'est le TOTAL ci-dessus qui tranche.");

  // ⑤
  section("⑤ LES JOURNÉES CALCULABLES — ⛔ LES DEUX DÉNOMINATEURS");
  for (const lane of ["foyer", "solo"]) {
    const a = avant.jours.get(lane) ?? { total: 0, complete: 0 };
    const b = apres.jours.get(lane) ?? { total: 0, complete: 0 };
    const av = avant.joursVivants.get(lane) ?? { total: 0, complete: 0 };
    const bv = apres.joursVivants.get(lane) ?? { total: 0, complete: 0 };
    dit(
      `     [A] ${lane.padEnd(6)} avant ${a.complete}/${a.total} = ${pct(a.complete, a.total)}` +
        `   →   après ${b.complete}/${b.total} = ${pct(b.complete, b.total)}`,
    );
    dit(
      `     [B] ${lane.padEnd(6)} avant ${av.complete}/${av.total} = ${
        pct(av.complete, av.total)
      }` + `   →   après ${bv.complete}/${bv.total} = ${pct(bv.complete, bv.total)}`,
    );
  }

  // ⑥
  section("⑥ LES TROIS SEUILS DE LA FICHE — atteints, ou manqués et pourquoi");
  const verdict = (nom: string, valeur: number, cible: number, sens: "≤" | "≥") => {
    const ok = sens === "≤" ? valeur <= cible : valeur >= cible;
    dit(`     ${ok ? "✅ ATTEINT " : "⛔ MANQUÉ  "} ${nom}  ${valeur} ${sens} ${cible} ?`);
  };
  const tauxA = 100 * nonPesees(apres.lignes) / Math.max(1, apres.lignes.total);
  const tauxB = 100 * nonPesees(apres.lignesVivantes) /
    Math.max(1, apres.lignesVivantes.total);
  dit(`     [A] non pesées ≤ 14 %          → ${tauxA.toFixed(1)} %`);
  dit(`     [B] non pesées ≤ 14 %          → ${tauxB.toFixed(1)} %`);
  verdict("[A] missing_quantity ≤ 420", mq(apres, false), 420, "≤");
  verdict("[B] missing_quantity ≤ 420", mq(apres, true), 420, "≤");
  verdict(
    "recupere_en_prose ≥ 1400 (lignes de base LUES)   ",
    v.masse + v.volume + v.nombreNu + v.fraction,
    1400,
    "≥",
  );
  verdict("recupere_en_prose ≥ 1400 (lignes pliées PESÉES)", apres.lignes.prose, 1400, "≥");

  // ── L'ASSERTION DE CARDINALITÉ — leçon de `V0-E′-bis` ────────────────────
  dit("");
  if (sections !== SECTIONS_ATTENDUES) {
    console.error(
      `⛔ CARDINALITÉ: ${sections} sections imprimées, ${SECTIONS_ATTENDUES} attendues.`,
    );
    Deno.exit(1);
  }
  dit(`(cardinalité: ${sections}/${SECTIONS_ATTENDUES} sections ✅)`);
}

await main();
