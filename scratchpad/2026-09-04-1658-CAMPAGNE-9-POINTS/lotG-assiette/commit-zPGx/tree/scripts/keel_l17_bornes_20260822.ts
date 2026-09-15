/**
 * ══════════════════════════════════════════════════════════════════════════
 * L17 — LES JOURNÉES CALCULABLES ET LA PART VENANT D'UNE BORNE,
 *       ⛔ SUR LES **DEUX** DÉNOMINATEURS ET AUX **DEUX** SEUILS, TOUJOURS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L17`.
 *
 *     bash scripts/keel_l17_bornes_20260822.sh
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN, ET N'APPELLE AUCUN MODÈLE ───────────────────
 *
 * ── ⛔ POURQUOI LES DEUX SEUILS SORTENT D'UNE **SEULE** EXTRACTION ─────────
 * C'est la découverte la plus dure de ce lot, et elle a failli lui faire
 * publier un faux gain. Le 2026-08-22 à 13:17, la même commande lancée cinq
 * minutes après la précédente rendait **+1 journée et +2 plats** — pas à cause
 * de la borne, mais parce que la migration `20260822133000` (lot `L-C`) venait
 * de réécrire **114 lignes** de `food_composition_refs` sous la mesure. Un
 * `AVANT` extrait à 13:12 et un `APRÈS` extrait à 13:17 ne comparent pas deux
 * règles: ils comparent deux référentiels.
 *
 * ⇒ Le seuil MUTÉ (0 %) et le seuil de PRODUCTION sont donc calculés dans la
 *   MÊME passe, sur le MÊME instantané, et rendus côte à côte. La mutation
 *   devient inconfondable avec la dérive du corpus — et la dérive, elle, est
 *   imprimée en clair (nombre de lignes de référentiel lues).
 *
 * ── ⛔ LE RÉSOLVEUR EST CELUI DE LA PRODUCTION, JAMAIS UNE COPIE ───────────
 * `plan_energy.ts`, `food_composition.ts`, `food_composition_io.ts` et
 * `food_group_write.ts` sont importés depuis `supabase/functions/_shared/keel/`.
 * Les adaptateurs d'entrée sont réutilisés depuis le résolveur de `V0-E′`.
 *
 * ── ⛔ LES TROIS CHOSES QUE CE FICHIER REFUSE DE FAIRE ─────────────────────
 *
 * ① **IL NE REND JAMAIS UN SEUL DÉNOMINATEUR.** Registre §⑨ n° 50: un seuil
 *    de la vague 2 se prend sur la population que le produit PEUT ENCORE
 *    PRODUIRE — les plans écrits sous le millésime de prompt vivant —, et la
 *    population exclue est NOMMÉE ET COMPTÉE à côté de chaque chiffre. Une
 *    règle d'exclusion qu'on ne peut pas relire est une justification.
 *
 * ② **IL NE DÉCLARE PAS UN SEUIL QU'IL N'A PAS MESURÉ.** Quand une lane n'a
 *    aucun plan sous le millésime vivant, son verdict est « EN ATTENTE » — ni
 *    atteint, ni manqué — et il imprime **la commande littérale** qui le
 *    produira. Un seuil déclaré sans sa mesure est le mode d'échec n° 1 de ce
 *    dépôt.
 *
 * ③ **IL NE LIT PAS `ing ? 'group'`.** Depuis `L17-0` la clé est écrite même à
 *    `null`: ce prédicat est vrai partout et ne mesure plus rien. Le pilote
 *    imprime les DEUX comptes SQL côte à côte pour qu'on ne le reprenne jamais
 *    par erreur, et le compteur vivant est `persistedGroupOf(...) !== null`.
 *
 * ── LA GARDE DE CARDINALITÉ ───────────────────────────────────────────────
 * `V0-E′-bis` a mesuré qu'un compteur qui DISPARAÎT de la sortie ne se voit
 * pas: le script rendait 9 lignes au lieu de 10, `rc=0`, sans un mot. Ici,
 * chaque ligne de verdict est comptée, et un manque fait sortir en `rc=1`.
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

// ---------------------------------------------------------------------------
// ① LE MILLÉSIME VIVANT — épinglé, et la règle d'exclusion avec lui
// ---------------------------------------------------------------------------

/**
 * LE PROMPT QUE LE PRODUIT EXÉCUTE AUJOURD'HUI (`meal_generation.ts`).
 *
 * ⛔ LA RÈGLE D'EXCLUSION EST ÉCRITE ICI, ET ELLE EST OBJECTIVE: « le millésime
 * de prompt n'est plus déployable ». Jamais « les plans où mon lot a marché ».
 * Elle a été posée au registre §⑨ n° 50 **avant** que ce lot mesure quoi que
 * ce soit.
 */
export const LIVE_MEAL_PROMPT = "meal.en.v18_one_box_per_group";
export const LIVE_HOUSEHOLD_PROMPT = "household.v21_one_box_per_group";

/** Les seuils de la fiche, épinglés — jamais recalculés depuis la sortie. */
export const SEUIL_FOYER = 0.45;
export const SEUIL_SOLO = 0.30;

/**
 * ⛔ LE SEUIL MUTÉ. `0` est « aucune borne n'est admise », c'est-à-dire la
 * règle d'AVANT `L17` — et une épreuve unitaire le prouve plat par plat
 * (`plan_energy_group_bounds_test.ts`).
 */
export const TOLERANCE_MUTEE = 0;

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
// ② LES ADAPTATEURS — celui de `V0-E′`, PLUS la clé `group`
// ---------------------------------------------------------------------------

/**
 * ⛔ `readIngredient` DE LA PRODUCTION, ET `group` PAR-DESSUS.
 *
 * L'adaptateur de `meal-energy-v1` ne lit pas encore `group` — il recopie une
 * liste de clés en dur, exactement comme `ingredientPayload()` le faisait avant
 * `L17-0`. Ce script lit donc le champ lui-même, par la fonction qui porte déjà
 * son nom et son vocabulaire fermé. **Ce n'est pas une correction du produit**:
 * l'écart entre ce que ce compteur voit et ce que la lane de LECTURE voit est
 * un fait, et il est nommé dans la fiche `L17-a`.
 */
export function readIngredientsWithGroup(raw: unknown): EnergyIngredient[] {
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

export interface Tally {
  plans: number;
  days: number;
  daysComplete: number;
  dishes: number;
  dishesComplete: number;
  /** Somme des `kcal` des journées calculables. Le dénominateur de la part. */
  kcal: number;
  /** Somme des `boundedKcal`. Le cinquième seau `group_bounds` du lot 18. */
  boundedKcal: number;
  lines: number;
  linesWithGroup: number;
}

const emptyTally = (): Tally => ({
  plans: 0,
  days: 0,
  daysComplete: 0,
  dishes: 0,
  dishesComplete: 0,
  kcal: 0,
  boundedKcal: 0,
  lines: 0,
  linesWithGroup: 0,
});

const pct = (n: number, d: number, digits = 1) =>
  d === 0 ? "   n/a" : `${(100 * n / d).toFixed(digits)} %`;

function readNdjson(dir: string, name: string): Record<string, unknown>[] {
  return Deno.readTextFileSync(`${dir}/${name}`)
    .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
}

/**
 * LA COMMANDE LITTÉRALE QUI PRODUIRA LA POPULATION MANQUANTE.
 *
 * ⛔ ELLE EST IMPRIMÉE, JAMAIS LANCÉE. Le budget modèle de ce lot est nul, et
 * les dix générations sont tenues par l'orchestrateur.
 */
const RECETTE_SOLO = [
  "   # ⛔ AUCUN PLAN SOLO SOUS LE PROMPT VIVANT — le seuil solo est EN ATTENTE.",
  "   # La recette est celle de `V0-D`, la lane changée. Elle exige un compte",
  "   # élève avec un MOT DE PASSE (jamais un JWT forgé) et une ligne",
  "   # `student_goals` — sans elle la lane rend `goal_required` (409).",
  "   API_URL=\"$(grep -m1 '^SUPABASE_URL=' supabase/.env | cut -d= -f2- | tr -d '\"')\"",
  "   ANON=\"$(grep -m1 '^SUPABASE_ANON_KEY=' supabase/.env | cut -d= -f2- | tr -d '\"')\"",
  "   TOKEN=\"$(curl -s -X POST \"$API_URL/auth/v1/token?grant_type=password\" \\",
  "       -H \"apikey: $ANON\" -H 'content-type: application/json' \\",
  "       -d '{\"email\":\"<ELEVE_SOLO>\",\"password\":\"<MDP>\"}' \\",
  "       | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"access_token\"])')\"",
  "   curl -s --max-time 900 -X POST \"$API_URL/functions/v1/generate-meal-v1\" \\",
  "       -H \"apikey: $ANON\" -H \"authorization: Bearer $TOKEN\" \\",
  "       -H 'content-type: application/json' \\",
  "       -d '{\"operation\":\"compose\",\"window\":{\"kind\":\"days\",\"count\":7},\"intent\":\"prepare_next\",\"replaces\":null,\"context\":null,\"cooking_shape\":null,\"preferences\":null}'",
  "   # puis, une fois les plans en base:",
  "   bash scripts/keel_l17_bornes_20260822.sh",
];

interface Pass {
  tolerance: number;
  all: Record<Lane, Tally>;
  live: Record<Lane, Tally>;
}

async function main() {
  const dir = Deno.args[0];
  if (!dir) {
    console.error("usage: keel_l17_bornes_20260822.ts <dir>");
    Deno.exit(2);
  }

  const plans = readNdjson(dir, "plans.ndjson");
  const refs = readNdjson(dir, "food_composition_refs.ndjson");
  const index = await loadCompositionIndex(fileClient(dir));

  /** Les millésimes EXCLUS, nommés et comptés. Identiques d'une passe à l'autre. */
  const excluded = new Map<string, number>();
  const passes: Pass[] = [TOLERANCE_MUTEE, UNRESOLVED_ENERGY_TOLERANCE].map((tolerance) => ({
    tolerance,
    all: { foyer: emptyTally(), solo: emptyTally() },
    live: { foyer: emptyTally(), solo: emptyTally() },
  }));

  for (const row of plans) {
    const lane = laneOf(row.plan_kind);
    // ⛔ LES DEUX PASSES LISENT LE MÊME OBJET. Relire le NDJSON entre les deux
    // rouvrirait la porte que ce fichier existe pour fermer.
    const dishes = readDishesWithGroup(row.dishes);
    const preparations = readPreparationsWithGroup(row.preparations);
    const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));

    let lines = 0;
    let linesWithGroup = 0;
    for (const d of [...dishes, ...preparations]) {
      for (const ing of d.ingredients) {
        lines++;
        if (ing.group != null) linesWithGroup++;
      }
    }

    const isLive = isLivePrompt(lane, row.prompt_version);
    if (!isLive) {
      const key = `${lane} · ${String(row.prompt_version ?? "«aucun prompt_version»")}`;
      excluded.set(key, (excluded.get(key) ?? 0) + 1);
    }

    for (const pass of passes) {
      const energy = planEnergyAtTolerance({
        index,
        dishes,
        preparations,
        servings,
        addons: [],
        mealsOutByDay: new Map<string | null, number>(),
      }, pass.tolerance);
      for (const t of isLive ? [pass.all[lane], pass.live[lane]] : [pass.all[lane]]) {
        t.plans++;
        t.lines += lines;
        t.linesWithGroup += linesWithGroup;
        for (const day of energy.days) {
          t.days++;
          if (!day.complete) continue;
          t.daysComplete++;
          t.kcal += day.kcal ?? 0;
          t.boundedKcal += day.boundedKcal;
        }
        for (const d of energy.dishes) {
          t.dishes++;
          if (d.complete) t.dishesComplete++;
        }
      }
    }
  }

  const before = passes[0];
  const after = passes[1];

  // ── LA SORTIE ────────────────────────────────────────────────────────────
  const out: string[] = [];
  const REQUIRED = [
    "journées · CORPUS ENTIER · foyer",
    "journées · CORPUS ENTIER · solo",
    "journées · PROMPT VIVANT · foyer",
    "journées · PROMPT VIVANT · solo",
    "share_group_bounds · CORPUS ENTIER",
    "share_group_bounds · PROMPT VIVANT",
    "lignes portant un groupe déclaré",
    "verdict · seuil foyer",
    "verdict · seuil solo",
  ];
  const rendered = new Set<string>();
  const emit = (key: string, text: string) => {
    rendered.add(key);
    out.push(text);
  };

  out.push("");
  out.push("═══════════════════════════════════════════════════════════════════════════");
  out.push("L17 — L'ABSTENTION SE PÈSE");
  out.push(
    `         ${new Date().toISOString()} · ${plans.length} plans · ${refs.length} lignes de référentiel`,
  );
  out.push(
    `         ⛔ SEUIL MUTÉ ${(100 * before.tolerance).toFixed(1)} %  →  SEUIL DE PRODUCTION ${
      (100 * after.tolerance).toFixed(1)
    } %  ·  MÊME instantané, MÊME passe`,
  );
  out.push("═══════════════════════════════════════════════════════════════════════════");
  out.push("");
  out.push("── ① LES DEUX DÉNOMINATEURS — jamais l'un sans l'autre (§⑨ n° 50) ─────────");
  out.push(`     prompt VIVANT · solo  « ${LIVE_MEAL_PROMPT} »`);
  out.push(`     prompt VIVANT · foyer « ${LIVE_MEAL_PROMPT}+${LIVE_HOUSEHOLD_PROMPT} »`);
  out.push("");
  out.push("     population                          journées: MUTÉ 0 %  →  PROD 5 %          plats: MUTÉ → PROD");

  const tallyLine = (label: string, b: Tally, a: Tally) =>
    `     ${label.padEnd(28)} plans ${String(a.plans).padStart(4)} · ` +
    `${String(b.daysComplete).padStart(4)}/${String(b.days).padStart(4)} = ${
      pct(b.daysComplete, b.days)
    } → ${String(a.daysComplete).padStart(4)}/${String(a.days).padStart(4)} = ${
      pct(a.daysComplete, a.days)
    } · ${String(b.dishesComplete).padStart(4)} → ${String(a.dishesComplete).padStart(4)} / ${
      String(a.dishes).padStart(4)
    }`;

  for (const lane of LANES) {
    emit(
      `journées · CORPUS ENTIER · ${lane}`,
      tallyLine(`CORPUS ENTIER · ${lane}`, before.all[lane], after.all[lane]),
    );
  }
  for (const lane of LANES) {
    emit(
      `journées · PROMPT VIVANT · ${lane}`,
      tallyLine(`PROMPT VIVANT · ${lane}`, before.live[lane], after.live[lane]),
    );
  }

  out.push("");
  out.push("   LA POPULATION EXCLUE, nommée et comptée — millésimes non déployables:");
  const sorted = [...excluded.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const excludedTotal = sorted.reduce((s, [, n]) => s + n, 0);
  out.push(`     ${excludedTotal} plans sur ${plans.length} · ${sorted.length} millésime(s)`);
  for (const [k, n] of sorted) out.push(`       ${String(n).padStart(3)} × ${k}`);

  out.push("");
  out.push("── ② LA PART D'ÉNERGIE VENANT D'UNE BORNE DE GROUPE ───────────────────────");
  out.push("   ⚠️ DIRECTION NÉGATIVE, ÉCRITE D'AVANCE: elle monte de 0 à quelque chose.");
  out.push("      Comptée À PART, jamais fondue dans `model` — un point de rupture");
  out.push("      ressemblerait à un fonctionnement.");
  const shareLine = (label: string, key: "all" | "live") => {
    const b = before[key].foyer.boundedKcal + before[key].solo.boundedKcal;
    const t = after[key];
    const k = t.foyer.kcal + t.solo.kcal;
    const a = t.foyer.boundedKcal + t.solo.boundedKcal;
    return `     ${label.padEnd(28)} MUTÉ ${Math.round(b)} kcal → PROD ${
      Math.round(a)
    } kcal bornés sur ${Math.round(k)} kcal calculables = ${pct(a, k, 4)}`;
  };
  emit("share_group_bounds · CORPUS ENTIER", shareLine("CORPUS ENTIER", "all"));
  emit("share_group_bounds · PROMPT VIVANT", shareLine("PROMPT VIVANT", "live"));

  out.push("");
  out.push("── ③ L'ENTRÉE DE LA BORNE — le groupe déclaré par le modèle ───────────────");
  const totalLines = after.all.foyer.lines + after.all.solo.lines;
  const totalWithGroup = after.all.foyer.linesWithGroup + after.all.solo.linesWithGroup;
  emit(
    "lignes portant un groupe déclaré",
    `     lignes d'ingrédient ${totalLines} · portant un \`group\` NON NUL ${totalWithGroup} = ${
      pct(totalWithGroup, totalLines)
    }`,
  );
  try {
    const raw = Deno.readTextFileSync(`${dir}/sql_group_counts.txt`).trim();
    const [n, withKey, withValue] = raw.split("|").map((x) => Number(x));
    out.push(
      `     contre-lecture SQL: ${n} lignes · \`ing ? 'group'\` ${withKey} ` +
        `⛔ (NE MESURE RIEN: la clé est écrite même à null) · ` +
        `\`ing->>'group' is not null\` ${withValue} ⇐ le seul prédicat vivant`,
    );
    if (withValue !== totalWithGroup) {
      out.push(
        `     ⚠️ ÉCART résolveur/SQL: ${totalWithGroup} contre ${withValue}. Le résolveur` +
          ` JETTE les entrées sans \`term\` (readIngredient), le SQL les compte.`,
      );
    }
  } catch {
    out.push("     ⚠️ contre-lecture SQL absente (pilote non utilisé ?)");
  }

  out.push("");
  out.push("── ④ LES SEUILS ──────────────────────────────────────────────────────────");
  const verdict = (lane: Lane, seuil: number): string[] => {
    const b = before.live[lane];
    const a = after.live[lane];
    const label = `     ${lane.padEnd(6)} seuil ≥ ${(100 * seuil).toFixed(0)} % sur le PROMPT VIVANT`;
    if (a.plans === 0 || a.days === 0) {
      return [
        `${label} ⇒ ⛔ EN ATTENTE DU RUN GROUPÉ`,
        `            aucun plan ${lane} sous le millésime vivant (${a.plans} plan(s), ${a.days} journée(s)).`,
        `            ⛔ NI ATTEINT NI MANQUÉ — un seuil déclaré sans sa mesure est le`,
        `            mode d'échec n° 1 de ce dépôt.`,
        `            pour mémoire, CORPUS ENTIER: ${before.all[lane].daysComplete}/${
          before.all[lane].days
        } = ${pct(before.all[lane].daysComplete, before.all[lane].days)} → ${
          after.all[lane].daysComplete
        }/${after.all[lane].days} = ${pct(after.all[lane].daysComplete, after.all[lane].days)}`,
      ];
    }
    const rate = a.daysComplete / a.days;
    return [
      `${label} ⇒ ${rate >= seuil ? "✅ ATTEINT" : "⛔ MANQUÉ"} — ${b.daysComplete}/${b.days} = ${
        pct(b.daysComplete, b.days)
      } → ${a.daysComplete}/${a.days} = ${pct(a.daysComplete, a.days)}`,
      `            (CORPUS ENTIER, pour mémoire: ${before.all[lane].daysComplete}/${
        before.all[lane].days
      } = ${pct(before.all[lane].daysComplete, before.all[lane].days)} → ${
        after.all[lane].daysComplete
      }/${after.all[lane].days} = ${pct(after.all[lane].daysComplete, after.all[lane].days)})`,
    ];
  };
  for (const l of verdict("foyer", SEUIL_FOYER)) out.push(l);
  rendered.add("verdict · seuil foyer");
  for (const l of verdict("solo", SEUIL_SOLO)) out.push(l);
  rendered.add("verdict · seuil solo");
  if (after.live.solo.plans === 0) {
    out.push("");
    for (const l of RECETTE_SOLO) out.push(l);
  }

  out.push("");
  const missing = REQUIRED.filter((k) => !rendered.has(k));
  if (missing.length > 0) {
    console.error(
      `⛔ CARDINALITÉ: ${REQUIRED.length - missing.length}/${REQUIRED.length} — MANQUANT(S): ${
        missing.join(", ")
      }`,
    );
    Deno.exit(1);
  }
  out.push(
    `✅ CARDINALITÉ ${REQUIRED.length}/${REQUIRED.length} — toutes les lignes attendues sont rendues.`,
  );
  out.push("═══════════════════════════════════════════════════════════════════════════");
  console.log(out.join("\n"));
}

if (import.meta.main) await main();
