/**
 * ══════════════════════════════════════════════════════════════════════════
 * L5 — LE SEL, LES SUCRES ET LA VITAMINE K · la mesure
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L5`.
 * Lancé par `scripts/keel_l5_sel_sucres_vitamine_k_20260822.sh`, jamais seul.
 *
 *     deno run --allow-read scripts/keel_l5_sel_sucres_vitamine_k_20260822.ts <dir>
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN ─────────────────────────────────────────────
 * Aucun `insert`, aucun `update`, aucun appel de modèle. Il lit trois NDJSON
 * et il imprime des lignes. Il SORT en `rc=1` quand une garde mord.
 *
 * ── ⛔ LES DEUX DÉNOMINATEURS, TOUJOURS ───────────────────────────────────
 * Registre §⑨ n° 50 et son amendement du 2026-08-22 13:40. Le prompt VIVANT
 * est `meal.en.v18_one_box_per_group` (solo) et
 * `meal.en.v18_one_box_per_group+household.v21_one_box_per_group` (foyer);
 * l'écrasante majorité du corpus a été produite par des millésimes qui
 * n'existent plus.
 *
 *   [A] LE CORPUS ENTIER — protège contre le seuil qu'on abaisse.
 *   [B] LA POPULATION VIVANTE — protège contre le seuil qu'on ne pouvait pas
 *       rater. Sur [B], les trois seuils de `L-1-b` étaient DÉJÀ ATTEINTS
 *       avant son lot: un lot désarmé y aurait été déclaré réussi.
 *
 * Les deux sont imprimés côte à côte, et la population exclue est NOMMÉE et
 * COMPTÉE. Aucun des deux ne suffit seul.
 *
 * ── LES CINQ GARDES, ET CE QU'ELLES REFUSENT ──────────────────────────────
 *   ① la population vivante n'est pas vide — sinon [B] serait un dénominateur
 *      nul déguisé en succès;
 *   ② la couverture des trois colonnes sur les aliments ATTEINTS atteint le
 *      seuil, sur [A] ET sur [B];
 *   ③ la liste des aliments à K élevée est FERMÉE: aucun aliment au-dessus du
 *      seuil n'est absent de la liste publiée, et aucun de la liste n'est en
 *      dessous. C'est le filet de `L-C`, pas la source de la liste;
 *   ④ ⛔ rien ne peut formuler un MANQUE de sel: `SODIUM_VERDICTS` n'a que
 *      trois membres et `sodiumVerdict(0)` rend `within`;
 *   ⑤ le compteur de K par plan SAIT s'abstenir: un plan dont une ligne pesée
 *      n'a pas de valeur rend `null`, jamais une somme partielle.
 *
 * ── CE QUI EST IMPORTÉ, ET CE QUI EST RECOPIÉ ─────────────────────────────
 * IMPORTÉ (production, jamais une copie): `loadCompositionIndex`,
 * `resolveIngredients`, `foldPreparationsIntoDishes`, et le module de ce lot
 * `sodium_and_vitamin_k.ts`.
 *
 * RECOPIÉ, comme dans `keel_l1_non_pesees_20260822.ts` et pour la même raison
 * (le module de production ouvre un serveur au chargement): les lecteurs
 * d'entrée `readIngredient` / `readDishes` / `readPreparations` de
 * `supabase/functions/meal-energy-v1/index.ts:183-249`.
 *
 * ⚠️ ── LES TROIS COLONNES NE PASSENT PAS PAR `CompositionIndex` ───────────
 * `food_composition.ts` est un fichier `M` de +404 lignes appartenant au lot
 * `L19b`, et `CompositionRef` a six sessions dessus. Y ajouter trois champs
 * REQUIS ferait rougir tous les constructeurs de test du dépôt, dans des
 * fichiers que ce lot n'a pas le droit de commiter. Ce script lit donc les
 * trois colonnes DIRECTEMENT du NDJSON, par slug — et la fiche `L5-b` porte
 * le fait que les colonnes n'ont AUCUN lecteur d'exécution aujourd'hui.
 */

import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionInput,
  type CompositionState,
  type CompositionUnit,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import {
  dailyVitaminKUg,
  HIGH_VITAMIN_K_UG_PER_100G,
  isHighVitaminK,
  saltGramsOf,
  SODIUM_VERDICTS,
  sodiumVerdict,
  vitaminKStability,
} from "../supabase/functions/_shared/keel/sodium_and_vitamin_k.ts";

const dir = Deno.args[0] ?? ".";

/**
 * `--complet` déplie la section ④ au lieu de la couper à 40 lignes.
 *
 * Ce n'est pas un confort: la section ④ est la WORKLIST du lot, et une
 * worklist tronquée est une worklist qu'on refait. La coupe par défaut existe
 * seulement pour que la sortie APRÈS tienne à l'écran.
 */
const COMPLET = Deno.args.includes("--complet");

/**
 * ⛔ LES DEUX MILLÉSIMES VIVANTS, ÉCRITS EN TOUTES LETTRES.
 *
 * Ils sont assertés ailleurs dans le dépôt (`meal_boxes_test.ts:926-927`).
 * La garde ① rougit si aucun plan du corpus ne les porte — c'est-à-dire si
 * cette constante a pris du retard sur le code.
 */
const MILLESIMES_VIVANTS: readonly string[] = [
  "meal.en.v18_one_box_per_group",
  "meal.en.v18_one_box_per_group+household.v21_one_box_per_group",
];

/** Le seuil de la fiche: couverture des trois colonnes sur les atteints. */
const SEUIL_COUVERTURE = 0.9;

/** Les trois colonnes du lot, et la quatrième qui porte leur provenance. */
const COLONNES = ["sodium_mg", "sugars_g", "vitamin_k_ug"] as const;
type Colonne = (typeof COLONNES)[number];

/**
 * ⛔ LE PÉRIMÈTRE À RISQUE POUR LA VITAMINE K — DÉTERMINISTE, PAS LEXICAL.
 *
 * Ce sont les deux groupes du référentiel qui portent la K. La garde ③a exige
 * qu'AUCUNE de leurs lignes ne reste sans valeur, atteinte ou non: `L9bis` et
 * `L38` poussent le volume végétal et feront entrer les espèces que le corpus
 * d'aujourd'hui n'a jamais servies (bette 830 µg/100 g, cresson 250, chou de
 * Bruxelles 177, mâche 140).
 *
 * ⚠️ Un lexique sur les libellés a été essayé et REFUSÉ: il attrape
 * « Pork ham w parsley » et rate « Lamb's lettuce ».
 */
const GROUPES_A_RISQUE_K: readonly string[] = ["leafy_greens", "cruciferous_veg"];

/**
 * ⛔ LA LISTE FERMÉE DES ALIMENTS À K ÉLEVÉE — ÉCRITE EN TOUTES LETTRES.
 *
 * C'est le CONTRAT du lot `L5`, et la forme est celle de `L-C`: la liste est
 * la source, le seuil `HIGH_VITAMIN_K_UG_PER_100G` est le FILET. La garde ③b
 * compare les DEUX SENS — un aliment au-dessus du seuil absent d'ici, ou un
 * aliment d'ici retombé sous le seuil, font sortir en `rc=1`.
 *
 * 34 slugs, mesurés en base le 2026-08-22 après la migration
 * `20260822165500_l5_le_sel_les_sucres_et_la_vitamine_k.sql`.
 */
const LISTE_FERMEE_K_ELEVEE: readonly string[] = [
  "herbs_thyme", //                                1714,5 µg/100 g (séché)
  "herbs_parsley", //                              1640,0
  "swiss_chard", //                                 830,0
  "kale", //                                        704,8
  "dried_herbs", //                                 600,0 (convention)
  "spinach_water", //                               493,6
  "spinach", //                                     482,9
  "spinach_young_leaves", //                        482,9
  "herbs_basil", //                                 414,8
  "herbs_bay_leaf", //                              400,0 (convention)
  "swiss_chard_leaf_stalk", //                      327,3
  "herbs_coriander", //                             310,0
  "chicory", //                                     297,6 (lecture haute)
  "watercress", //                                  250,0
  "herbs_chives", //                                212,7
  "spring_onion", //                                207,0
  "herbs_mint", //                                  200,0 (convention)
  "brussels_sprouts", //                            177,0
  "black_pepper", //                                163,7
  "mayonnaise", //                                  163,0  ⛔ pas un légume
  "romanesco_cauliflower_romanesco_broccoli", //    141,1 (lecture haute)
  "broccoli_water_tender", //                       141,1
  "broccoli_water_crunchy", //                      141,1
  "brussels_sprout_water", //                       140,3
  "lamb_s_lettuce", //                              140,0
  "mixed_leaves", //                                130,0 (convention)
  "lettuce", //                                     126,3
  "lettuce_oak_leaf", //                            126,3
  "lettuce_sucrine", //                             126,3
  "lettuce_var_batavia", //                         126,3
  "green_cabbage_water", //                         108,7
  "rocket", //                                      108,6
  "broccoli", //                                    102,0
  "pesto", //                                       100,0 (convention)
];

// ── LECTURE DES NDJSON ─────────────────────────────────────────────────────

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

interface PlanDish {
  day: string | null;
  method: string;
  ingredients: CompositionInput[];
  uses: { preparationId: string; servings: number }[];
}

function readDishes(raw: unknown): PlanDish[] {
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

interface PlanPreparation {
  id: string;
  servingsMade: number;
  ingredients: CompositionInput[];
}

function readPreparations(raw: unknown): PlanPreparation[] {
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

// ── LES TROIS COLONNES, LUES DIRECTEMENT ───────────────────────────────────

interface Micro {
  sodium_mg: number | null;
  sugars_g: number | null;
  vitamin_k_ug: number | null;
  micronutrient_source: string | null;
  label: string;
  ciqual_code: string | null;
  source: string;
  food_group_ref: string;
}

function readNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const pct = (n: number, d: number) => d === 0 ? "n/a" : `${(100 * n / d).toFixed(1)} %`;

// ── LE COMPTE ──────────────────────────────────────────────────────────────

async function main() {
  const index = await loadCompositionIndex(fileClient());
  const refRows = readNdjson("food_composition_refs.ndjson");
  const plans = readNdjson("plans.ndjson");

  // La colonne EXISTE-t-elle ? `select *` d'une table sans la colonne rend une
  // clé ABSENTE. « absente » et « présente et vide » ne sont pas la même
  // chose, et les confondre ferait passer la mesure AVANT pour une mesure
  // APRÈS ratée.
  const premiere = refRows[0] ?? {};
  const colonneExiste = new Map<string, boolean>();
  for (const c of [...COLONNES, "micronutrient_source"]) {
    colonneExiste.set(c, Object.prototype.hasOwnProperty.call(premiere, c));
  }

  const micro = new Map<string, Micro>();
  for (const r of refRows) {
    micro.set(String(r.slug ?? ""), {
      sodium_mg: readNumberOrNull(r.sodium_mg),
      sugars_g: readNumberOrNull(r.sugars_g),
      vitamin_k_ug: readNumberOrNull(r.vitamin_k_ug),
      micronutrient_source: r.micronutrient_source === null ||
          r.micronutrient_source === undefined
        ? null
        : String(r.micronutrient_source),
      label: String(r.label ?? ""),
      ciqual_code: r.ciqual_code === null || r.ciqual_code === undefined
        ? null
        : String(r.ciqual_code),
      source: String(r.source ?? ""),
      food_group_ref: String(r.food_group_ref ?? ""),
    });
  }

  type Denominateur = "A" | "B";
  const laneOf = (r: Record<string, unknown>) =>
    String(r.plan_kind ?? "") === "household" ? "foyer" : "solo";
  const genOf = (r: Record<string, unknown>) =>
    String(r.prompt_version ?? "").trim() || "(aucun prompt_version)";
  const vivant = (r: Record<string, unknown>) =>
    MILLESIMES_VIVANTS.includes(genOf(r));

  /** slug → nombre de LIGNES d'ingrédient qui l'atteignent, par dénominateur. */
  const atteints: Record<Denominateur, Map<string, number>> = {
    A: new Map(),
    B: new Map(),
  };
  const plansPar: Record<Denominateur, number> = { A: 0, B: 0 };
  const exclusParMillesime = new Map<string, number>();

  /** La K servie, par plan et par journée. */
  interface PlanK {
    id: string;
    lane: string;
    vivant: boolean;
    /** journée → µg, ou `null` si une ligne pesée n'a pas de valeur */
    parJour: Map<string, number | null>;
    lignesPesees: number;
    lignesSansK: number;
  }
  const kParPlan: PlanK[] = [];

  for (const row of plans) {
    const estVivant = vivant(row);
    plansPar.A++;
    if (estVivant) plansPar.B++;
    else {
      exclusParMillesime.set(genOf(row), (exclusParMillesime.get(genOf(row)) ?? 0) + 1);
    }

    const dishes = readDishes(row.dishes);
    const preparations = readPreparations(row.preparations);

    // ⚠️ Le pliage est fait PAR JOURNÉE: `foldPreparationsIntoDishes` rend les
    // plats dans le même ordre, donc l'index rejoint le `day` de l'entrée.
    const folded = foldPreparationsIntoDishes({
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

    const parJour = new Map<string, number | null>();
    const lignesJour = new Map<string, { grams: number; per100g: number | null }[]>();
    let lignesPesees = 0;
    let lignesSansK = 0;

    folded.forEach((f, i) => {
      const jour = dishes[i]?.day ?? "(sans jour)";
      const r = resolveIngredients(index, f.ingredients);
      for (const ing of r.resolved) {
        const slug = ing.ref.slug;
        atteints.A.set(slug, (atteints.A.get(slug) ?? 0) + 1);
        if (estVivant) atteints.B.set(slug, (atteints.B.get(slug) ?? 0) + 1);
        const m = micro.get(slug);
        const k = m?.vitamin_k_ug ?? null;
        lignesPesees++;
        if (k === null) lignesSansK++;
        const acc = lignesJour.get(jour) ?? [];
        acc.push({ grams: ing.gramsRaw, per100g: k });
        lignesJour.set(jour, acc);
      }
    });

    for (const [jour, lignes] of lignesJour) {
      parJour.set(jour, dailyVitaminKUg(lignes));
    }
    kParPlan.push({
      id: String(row.id ?? ""),
      lane: laneOf(row),
      vivant: estVivant,
      parJour,
      lignesPesees,
      lignesSansK,
    });
  }

  // ── L'IMPRESSION ─────────────────────────────────────────────────────────
  const out: string[] = [];
  const rouges: string[] = [];

  out.push("── ① LES TROIS COLONNES, ET LE RÉFÉRENTIEL ENTIER ────────────────────────");
  const total = refRows.length;
  for (const c of COLONNES) {
    if (!colonneExiste.get(c)) {
      out.push(`     ${c.padEnd(14)} ⛔ LA COLONNE N'EXISTE PAS`);
      continue;
    }
    const n = refRows.filter((r) => readNumberOrNull(r[c]) !== null).length;
    out.push(
      `     ${c.padEnd(14)} ${String(n).padStart(4)} / ${total}   ${pct(n, total).padStart(7)}`,
    );
  }
  out.push("");

  out.push("── ② LES DEUX DÉNOMINATEURS — §⑨ n° 50 ET SON AMENDEMENT ─────────────────");
  out.push(
    `     [A] corpus entier          ${String(plansPar.A).padStart(4)} plans · ` +
      `${String(atteints.A.size).padStart(4)} aliments ATTEINTS`,
  );
  out.push(
    `     [B] population vivante     ${String(plansPar.B).padStart(4)} plans · ` +
      `${String(atteints.B.size).padStart(4)} aliments ATTEINTS`,
  );
  out.push(`         millésimes vivants: ${MILLESIMES_VIVANTS.join(" · ")}`);
  out.push(
    `     ⛔ POPULATION EXCLUE de [B]: ${plansPar.A - plansPar.B} plans, ` +
      `${exclusParMillesime.size} millésimes morts — les voici, comptés:`,
  );
  for (const [g, n] of [...exclusParMillesime].sort((a, b) => b[1] - a[1])) {
    out.push(`         ${String(n).padStart(3)} × ${g}`);
  }
  out.push("");

  if (plansPar.B === 0 || atteints.B.size === 0) {
    rouges.push(
      "GARDE ① — la population VIVANTE est vide: aucun plan ne porte un des " +
        "millésimes de `MILLESIMES_VIVANTS`. La constante a pris du retard sur " +
        "le code, ou le corpus a été purgé. Un dénominateur nul n'est pas un seuil.",
    );
  }

  out.push("── ③ LA COUVERTURE SUR LES ALIMENTS ATTEINTS ─────────────────────────────");
  out.push(`     seuil de la fiche: ${(SEUIL_COUVERTURE * 100).toFixed(0)} %`);
  for (const d of ["A", "B"] as Denominateur[]) {
    const slugs = [...atteints[d].keys()];
    out.push(`     [${d}] ${slugs.length} aliments atteints`);
    let completes = 0;
    for (const s of slugs) {
      const m = micro.get(s);
      if (m && m.sodium_mg !== null && m.sugars_g !== null && m.vitamin_k_ug !== null) {
        completes++;
      }
    }
    for (const c of COLONNES) {
      const n = slugs.filter((s) => (micro.get(s)?.[c] ?? null) !== null).length;
      out.push(
        `         ${c.padEnd(14)} ${String(n).padStart(4)} / ${
          String(slugs.length).padStart(4)
        }   ${pct(n, slugs.length).padStart(7)}`,
      );
    }
    const ratio = slugs.length === 0 ? 0 : completes / slugs.length;
    const verdict = ratio >= SEUIL_COUVERTURE ? "ATTEINT" : "MANQUÉ";
    out.push(
      `         LES TROIS À LA FOIS  ${String(completes).padStart(4)} / ${
        String(slugs.length).padStart(4)
      }   ${pct(completes, slugs.length).padStart(7)}   ⇒ ${verdict}`,
    );
    if (ratio < SEUIL_COUVERTURE) {
      rouges.push(
        `GARDE ② — dénominateur [${d}]: couverture ${
          pct(completes, slugs.length)
        } < ${(SEUIL_COUVERTURE * 100).toFixed(0)} %.`,
      );
    }
  }
  out.push("");

  // Les manquants, nommés — une liste de trous muette est une liste qu'on refait.
  const manquants = [...atteints.A.entries()]
    .filter(([s]) => {
      const m = micro.get(s);
      return !m || m.sodium_mg === null || m.sugars_g === null || m.vitamin_k_ug === null;
    })
    .sort((a, b) => b[1] - a[1]);
  out.push(
    `── ④ LES ALIMENTS ATTEINTS SANS LES TROIS VALEURS — ${manquants.length}, par fréquence ──`,
  );
  const montres = COMPLET ? manquants : manquants.slice(0, 40);
  for (const [s, n] of montres) {
    const m = micro.get(s);
    out.push(
      `     ${String(n).padStart(4)} × ${s.padEnd(34)} ` +
        `[${(m?.source ?? "?").padEnd(6)} ${(m?.ciqual_code ?? "—").padStart(6)}] ` +
        `${(m?.label ?? "").slice(0, 46).padEnd(46)} ` +
        `Na=${m?.sodium_mg ?? "—"} sucres=${m?.sugars_g ?? "—"} K=${m?.vitamin_k_ug ?? "—"}`,
    );
  }
  if (manquants.length > montres.length) {
    out.push(
      `     … et ${manquants.length - montres.length} autres (\`--complet\` les déplie)`,
    );
  }
  out.push("");

  // ── ⑤ LA LISTE FERMÉE DES ALIMENTS À K ÉLEVÉE ────────────────────────────
  out.push(
    `── ⑤ LA LISTE FERMÉE DES ALIMENTS À K ÉLEVÉE (≥ ${HIGH_VITAMIN_K_UG_PER_100G} µg/100 g) ──`,
  );
  const hautK = [...micro.entries()]
    .filter(([, m]) => isHighVitaminK(m.vitamin_k_ug))
    .sort((a, b) => (b[1].vitamin_k_ug ?? 0) - (a[1].vitamin_k_ug ?? 0));
  if (hautK.length === 0) {
    out.push("     (aucun — la colonne est vide ou n'existe pas)");
  }
  for (const [s, m] of hautK) {
    const n = atteints.A.get(s) ?? 0;
    out.push(
      `     ${String(m.vitamin_k_ug).padStart(6)} µg/100 g  ${s.padEnd(30)} ` +
        `atteint ${String(n).padStart(4)} ×   ${m.label}`,
    );
  }
  out.push("");

  // ── GARDE ③a — LE PÉRIMÈTRE À RISQUE EST COUVERT EN ENTIER ──────────────
  // Déterministe, PAS lexical: les deux groupes qui portent la K. Un lexique
  // sur les libellés attraperait « Pork ham w parsley » et raterait « Mâche ».
  // C'est la population que `L9bis`/`L38` vont réveiller en poussant le volume
  // végétal — une liste fermée qui ne couvre que ce qui a DÉJÀ été servi
  // s'ouvrirait le jour où ces lots livrent.
  const decouverts: string[] = [];
  for (const [s, m] of micro) {
    if (!GROUPES_A_RISQUE_K.includes(m.food_group_ref)) continue;
    if (m.vitamin_k_ug === null) decouverts.push(s);
  }
  out.push(
    `     périmètre à risque (${GROUPES_A_RISQUE_K.join(" + ")}): ` +
      `${
        [...micro.values()].filter((m) => GROUPES_A_RISQUE_K.includes(m.food_group_ref)).length
      } lignes, ${decouverts.length} sans valeur de K`,
  );
  if (decouverts.length > 0) {
    rouges.push(
      `GARDE ③a — ${decouverts.length} ligne(s) des groupes ${
        GROUPES_A_RISQUE_K.join("/")
      } n'ont AUCUNE valeur de K: ${decouverts.slice(0, 12).join(", ")}` +
        `${decouverts.length > 12 ? " …" : ""}. Le périmètre à risque n'est pas couvert.`,
    );
  }

  // ── GARDE ③b — LA LISTE PUBLIÉE EST EXACTEMENT CELLE DE LA BASE ─────────
  // Les deux sens, et c'est la forme de `L-C`: la liste est écrite en toutes
  // lettres (elle est le CONTRAT), le seuil est le FILET qui refuse qu'une
  // ligne attrapable en soit absente — ou qu'une ligne de la liste ait cessé
  // de mériter d'y être.
  const enBase = new Set(hautK.map(([s]) => s));
  const publiee = new Set(LISTE_FERMEE_K_ELEVEE);
  const absentsDeLaListe = [...enBase].filter((s) => !publiee.has(s)).sort();
  const absentsDeLaBase = [...publiee].filter((s) => !enBase.has(s)).sort();
  if (absentsDeLaListe.length > 0) {
    rouges.push(
      `GARDE ③b — ${absentsDeLaListe.length} aliment(s) au-dessus de ` +
        `${HIGH_VITAMIN_K_UG_PER_100G} µg/100 g ne sont PAS dans la liste publiée: ` +
        `${absentsDeLaListe.join(", ")}. La liste n'est pas fermée.`,
    );
  }
  if (absentsDeLaBase.length > 0) {
    rouges.push(
      `GARDE ③b — ${absentsDeLaBase.length} aliment(s) de la liste publiée ne sont ` +
        `PAS (ou plus) au-dessus de ${HIGH_VITAMIN_K_UG_PER_100G} µg/100 g en base: ` +
        `${absentsDeLaBase.join(", ")}. La liste ment.`,
    );
  }
  out.push(
    `     liste publiée ${publiee.size} · en base ${enBase.size} · ` +
      `${
        absentsDeLaListe.length === 0 && absentsDeLaBase.length === 0
          ? "IDENTIQUES ⇒ la liste est FERMÉE"
          : "DIVERGENTES"
      }`,
  );
  out.push("");

  // ── ⑥ ⛔ RIEN NE PEUT FORMULER UN MANQUE DE SEL ──────────────────────────
  out.push("── ⑥ ⛔ LA PREUVE QUE RIEN NE PEUT FORMULER UN MANQUE DE SEL ─────────────");
  out.push(`     SODIUM_VERDICTS = [${SODIUM_VERDICTS.join(", ")}]`);
  out.push(`     sodiumVerdict(0)     = ${sodiumVerdict(0)}    (jamais « below »)`);
  out.push(`     sodiumVerdict(1999)  = ${sodiumVerdict(1999)}`);
  out.push(`     sodiumVerdict(2001)  = ${sodiumVerdict(2001)}`);
  out.push(`     sodiumVerdict(null)  = ${sodiumVerdict(null)}`);
  out.push(`     saltGramsOf(2000)    = ${saltGramsOf(2000)} g de sel`);
  const interdits = SODIUM_VERDICTS.filter((v) =>
    /below|under|low|deficit|manque|insuffis/i.test(v)
  );
  if (interdits.length > 0 || sodiumVerdict(0) !== "within" || SODIUM_VERDICTS.length !== 3) {
    rouges.push(
      "GARDE ④ — le sodium peut formuler un MANQUE: " +
        `verdicts=[${SODIUM_VERDICTS.join(", ")}], sodiumVerdict(0)=${sodiumVerdict(0)}. ` +
        "`sodium_mg` est une valeur à MAXIMUM; « vous êtes en dessous de votre " +
        "besoin en sel » est un conseil activement nocif.",
    );
  }
  out.push("");

  // ── ⑦ LE COMPTEUR DE LA K SERVIE PAR PLAN ────────────────────────────────
  out.push("── ⑦ LA K SERVIE PAR PLAN — le compteur qui arme le lot ──────────────────");
  out.push("     ⚠️ Une journée dont UNE ligne pesée n'a pas de K rend `null`, jamais");
  out.push("        une somme partielle: c'est sur ce chiffre qu'une dose se règle.");
  for (const d of ["A", "B"] as Denominateur[]) {
    const pop = kParPlan.filter((p) => d === "A" || p.vivant);
    let jours = 0, joursCalculables = 0;
    const parPlanMoy: number[] = [];
    for (const p of pop) {
      const vals: number[] = [];
      for (const v of p.parJour.values()) {
        jours++;
        if (v !== null) {
          joursCalculables++;
          vals.push(v);
        }
      }
      if (vals.length > 0) parPlanMoy.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    parPlanMoy.sort((a, b) => a - b);
    const med = parPlanMoy.length === 0
      ? null
      : parPlanMoy[Math.floor(parPlanMoy.length / 2)];
    out.push(
      `     [${d}] ${String(pop.length).padStart(4)} plans · journées ${
        String(joursCalculables).padStart(4)
      }/${String(jours).padStart(4)} calculables ${pct(joursCalculables, jours).padStart(7)}` +
        ` · K médiane par journée ${med === null ? "n/a" : `${med.toFixed(0)} µg`}`,
    );
  }
  out.push("");

  // ⛔ LA STABILITÉ INTERNE — ET CE QUE CE VERDICT N'EST PAS.
  //
  // `vitaminKStability` attend l'apport HABITUEL du porteur, que le produit
  // ne possède pas (porte P1: les questions du corps ne sont pas posées). On
  // lui donne ici la MOYENNE DES JOURNÉES DU PLAN LUI-MÊME, ce qui ne rend
  // PAS un verdict clinique: ça rend le BALANCEMENT INTERNE du plan, c'est-à-
  // dire de combien la K bouge d'une journée à l'autre à l'intérieur d'une
  // même semaine composée par le produit. C'est le chiffre que le lot devait
  // faire exister, et il se lit tel quel — jamais comme un avis médical.
  const vivants = kParPlan.filter((p) => p.vivant);
  out.push("     Les plans VIVANTS, journée par journée (µg de K servis):");
  out.push(
    "     ⚠️ `référence` = la MOYENNE DU PLAN, faute d'apport habituel (porte P1).",
  );
  out.push("        Le verdict dit le BALANCEMENT INTERNE, pas un avis clinique.");
  let pires = 0;
  for (const p of vivants) {
    const vals = [...p.parJour.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const rendu = vals.map(([j, v]) => `${j}=${v === null ? "—" : v.toFixed(0)}`).join(" ");
    const connus = vals.map(([, v]) => v).filter((v): v is number => v !== null);
    const ref = connus.length === 0
      ? null
      : connus.reduce((a, b) => a + b, 0) / connus.length;
    const st = vitaminKStability({
      referenceUg: ref,
      dailyUg: vals.map(([, v]) => v),
    });
    const min = connus.length === 0 ? null : Math.min(...connus);
    const max = connus.length === 0 ? null : Math.max(...connus);
    const amplitude = min !== null && max !== null && min > 0
      ? `×${(max / min).toFixed(0)}`
      : "n/a";
    if (st.verdict !== "stable" && st.verdict !== "unknown") pires++;
    out.push(
      `       ${p.id.slice(0, 8)} ${p.lane.padEnd(6)} pesées ${
        String(p.lignesPesees).padStart(3)
      } sans K ${String(p.lignesSansK).padStart(3)} · ${st.verdict.padEnd(10)} ` +
        `amplitude ${amplitude.padStart(5)} · ${rendu}`,
    );
  }
  out.push(
    `     ⇒ ${pires} plan(s) vivant(s) sur ${vivants.length} sortent de la bande ±${
      (0.3 * 100).toFixed(0)
    } % de leur PROPRE moyenne.`,
  );
  out.push("");

  // GARDE ⑤ — le compteur SAIT s'abstenir. Si aucune journée du corpus ne rend
  // `null` alors que des lignes servies n'ont pas de K, l'abstention est morte.
  const sansK = kParPlan.reduce((a, p) => a + p.lignesSansK, 0);
  const joursNull = kParPlan.reduce(
    (a, p) => a + [...p.parJour.values()].filter((v) => v === null).length,
    0,
  );
  out.push(
    `     abstention: ${sansK} ligne(s) servie(s) sans valeur de K ⇒ ${joursNull} journée(s) à \`null\``,
  );
  if (sansK > 0 && joursNull === 0) {
    rouges.push(
      "GARDE ⑤ — des lignes servies n'ont pas de valeur de K et POURTANT aucune " +
        "journée ne rend `null`: la somme complète les trous au lieu de s'abstenir.",
    );
  }
  out.push("");

  // ── ⑧ CE QU'ON NE PEUT PAS VÉRIFIER — lot `O9` ───────────────────────────
  out.push("── ⑧ ⛔ CE QU'ON NE PEUT PAS VÉRIFIER CONTRE SA SOURCE (lot `O9`) ────────");
  const atteintsA = [...atteints.A.keys()];
  const ciqualSansCode = atteintsA.filter((s) => {
    const m = micro.get(s);
    return m?.source === "ciqual" && !m.ciqual_code;
  });
  out.push(
    `     Sur les ${atteintsA.length} aliments atteints, ${ciqualSansCode.length} se déclarent ` +
      `\`ciqual\` SANS \`ciqual_code\`.`,
  );
  out.push(
    "     ⛔ Pour eux, relire la valeur contre la table ANSES est IMPOSSIBLE depuis ce",
  );
  out.push(
    "        dépôt. Ce lot ne le contourne pas: il l'écrit, et `micronutrient_source`",
  );
  out.push("        dit pour chaque ligne d'où sa valeur vient RÉELLEMENT.");
  if (colonneExiste.get("micronutrient_source")) {
    const parFamille = new Map<string, number>();
    for (const s of atteintsA) {
      const m = micro.get(s);
      if (!m?.micronutrient_source) continue;
      const fam = m.micronutrient_source.split(":")[0];
      parFamille.set(fam, (parFamille.get(fam) ?? 0) + 1);
    }
    for (const [f, n] of [...parFamille].sort((a, b) => b[1] - a[1])) {
      out.push(`        ${String(n).padStart(4)} × famille \`${f}:\``);
    }
  }
  out.push("");

  console.log(out.join("\n"));

  if (rouges.length > 0) {
    console.log("⛔ ══ GARDES QUI ONT MORDU ══════════════════════════════════════════════");
    for (const r of rouges) console.log(`   · ${r}`);
    Deno.exit(1);
  }
  console.log("✅ les cinq gardes passent");
}

if (import.meta.main) {
  await main();
}
