/**
 * ══════════════════════════════════════════════════════════════════════════
 * L2-lang — LE COMPTEUR #2 : JOURNÉES CALCULABLES, PAR LANE **ET PAR LANGUE**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `⟳ L2-lang`.
 * C'est le SEUL des dix compteurs du tableau de bord `V0-E′` qui n'existait pas
 * du tout — `#2` y est écrit « ⛔ N'EXISTE PAS (ce n'est pas 0) ».
 *
 *     bash scripts/keel_l2lang_langue_20260822.sh            # l'état de départ
 *     bash scripts/keel_l2lang_langue_20260822.sh --since=…  # avec un banc
 *
 * ── ⛔ CE SCRIPT N'ÉCRIT RIEN, ET N'APPELLE AUCUN MODÈLE ───────────────────
 * Il lit trois NDJSON extraits par son pilote et imprime des lignes. Les dix
 * générations que la `mesure APRÈS` exige sont tenues par l'orchestrateur; ce
 * fichier est l'INSTRUMENT, pas la dépense.
 *
 * ── ⛔ LE RÉSOLVEUR EST CELUI DE LA PRODUCTION, JAMAIS UNE COPIE ───────────
 * `plan_energy.ts`, `food_composition.ts`, `food_composition_io.ts` et
 * `meal_verdict.ts` sont importés depuis `supabase/functions/_shared/keel/`.
 * Une copie diverge, et c'est celle qu'on regarde le moins qui garde
 * l'ancienne valeur. `assertProductionResolver()` (garde ③) le VÉRIFIE au
 * lancement, sur le texte de ce fichier ET sur celui du résolveur `V0-E′`.
 *
 * Les adaptateurs d'entrée (`fileClient`, `readDishes`, `readPreparations`)
 * sont RÉUTILISÉS depuis `keel_v0e_resolveur_20260821.ts` — pas recopiés.
 *
 * ── ⛔ LES TROIS PIÈGES QUE CE FICHIER GARDE, chacun par un cas qui MORD ───
 *
 * ① **`content_locale` N'EST PAS UN AXE DE LANGUE.** La base porte `en`,
 *    `en-GB`, `en-US`, `fr-FR` **et `fr-US`**. Regrouper sur la locale entière
 *    ferait compter l'anglais pour TROIS langues et ferait tomber `fr-US` du
 *    mauvais côté. Le regroupement se fait sur le **sous-tag de langue**, et
 *    `assertLanguageGrouping()` rougit si ce n'est plus le cas.
 *
 * ② **UN CHIFFRE SUR UNE POPULATION MINCE EST PIRE QU'UN COMPTEUR ABSENT.**
 *    Le corpus porte 178 plans EN contre 4 FR: un « écart FR/EN » calculé
 *    là-dessus mesure un MILLÉSIME DE PROMPT, pas une langue (registre §⑨
 *    n° 40). Ce script rend donc TOUJOURS le chiffre AVEC sa population, et il
 *    REFUSE de conclure quand un bras est trop mince ou quand les deux bras ne
 *    partagent pas exactement le même `prompt_version`.
 *
 * ③ **LE CORPUS EXISTANT EST UNE TROISIÈME COLONNE, ÉTIQUETÉE.** Jamais le
 *    bras EN. Il est imprimé — c'est l'état de départ — mais il ne peut pas
 *    entrer dans un verdict: `--since` sépare le banc du corpus, et le verdict
 *    ne porte QUE sur le banc.
 *
 * ── ⚠️ LA DÉPENDANCE CONNUE ET NON RÉSOLUE : `L19c` ───────────────────────
 * Le référentiel porte des DOUBLONS (`whole_eggs`/`egg`, `plain_yogurt`/
 * `yoghurt`…). Sur l'épreuve du NOM NU ils comptent comme des échecs
 * français. Sur CE compteur-ci, la question est différente et plus étroite:
 * une journée est calculable quand chaque terme est RÉSOLU **et PESÉ**.
 * L'énergie d'une jumelle ne change donc RIEN à la complétude — seuls
 * `unit_grams` et `condiment_grams` peuvent la faire basculer. La section ④
 * MESURE cette exposition au lieu de la supposer.
 */

import {
  fileClient,
  readDishes,
  readPreparations,
} from "./keel_v0e_resolveur_20260821.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  resolveIngredient,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { planEnergy } from "../supabase/functions/_shared/keel/plan_energy.ts";

// ---------------------------------------------------------------------------
// LES CONSTANTES DU SEUIL — épinglées, jamais recalculées depuis la sortie
// ---------------------------------------------------------------------------

/** Le seuil de la fiche: l'écart FR/EN sur le taux de journées calculables. */
export const ECART_MAX_POINTS = 5;

/**
 * LA POPULATION MINIMALE D'UN BRAS, EN PLANS — pas en journées.
 *
 * ⚠️ L'unité est le PLAN, et c'est un choix de mesure. Un plan de 7 jours rend
 * 7 journées, mais elles viennent d'UN SEUL appel de modèle: les compter comme
 * 7 observations indépendantes ferait passer n=1 pour n=7. Le §⑩ alloue
 * exactement 5 générations par bras; c'est donc la valeur ici.
 */
export const MIN_PLANS_PAR_BRAS = 5;

/** L19c: deux lignes « jumelles » = même groupe et énergie à ce % près. */
export const JUMELLE_ECART_ENERGIE = 0.05;

// ---------------------------------------------------------------------------
// ① LE REGROUPEMENT PAR LANGUE — le sous-tag, jamais la locale entière
// ---------------------------------------------------------------------------

/**
 * Le SOUS-TAG DE LANGUE d'une locale BCP-47, ou `null` s'il n'y en a pas.
 *
 * ⛔ `fr-US` rend `fr`. `en-GB` et `en-US` rendent tous les deux `en`. C'est
 * tout l'objet de cette fonction: la base porte CINQ locales pour DEUX
 * langues, et le compteur est demandé « par langue ».
 */
export function languageOf(locale: unknown): string | null {
  const raw = String(locale ?? "").trim().toLowerCase();
  if (!raw) return null;
  const sub = raw.split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(sub) ? sub : null;
}

// ---------------------------------------------------------------------------
// ② LE VERDICT — il REFUSE, et il dit pourquoi
// ---------------------------------------------------------------------------

export interface Bras {
  /** Nombre de PLANS — la population qui compte. */
  plans: number;
  journees: number;
  calculables: number;
  /** Les `prompt_version` distincts vus dans ce bras. `""` = aucun. */
  millesimes: Set<string>;
}

export interface Verdict {
  conclusif: boolean;
  raison: string;
  ecartPoints: number | null;
}

/**
 * ⛔ LA GARDE QUE LA FICHE EXIGE: « il rend le chiffre ET sa population, et il
 * DIT quand il ne peut pas conclure ».
 *
 * Trois refus, dans cet ordre — le premier qui mord est celui qu'on imprime:
 *   ① un bras sans aucune journée: il n'y a pas de taux, pas même un mauvais;
 *   ② un bras sous `MIN_PLANS_PAR_BRAS`: le chiffre existe et ne veut rien
 *      dire. C'est le refus qui compte, et c'est celui qu'une mutation
 *      désarme le plus facilement;
 *   ③ deux bras qui ne partagent pas EXACTEMENT un millésime de prompt: on
 *      mesurerait une génération de consigne, pas une langue (§⑨ n° 40).
 */
export function verdictSur(
  fr: Bras,
  en: Bras,
  minPlans: number = MIN_PLANS_PAR_BRAS,
): Verdict {
  const taux = (b: Bras) => b.journees === 0 ? null : 100 * b.calculables / b.journees;
  const tFr = taux(fr);
  const tEn = taux(en);
  const ecart = tFr === null || tEn === null ? null : Math.abs(tFr - tEn);

  if (fr.journees === 0 || en.journees === 0) {
    return {
      conclusif: false,
      raison: `un bras n'a AUCUNE journée (fr ${fr.journees} · en ${en.journees})`,
      ecartPoints: null,
    };
  }
  if (fr.plans < minPlans || en.plans < minPlans) {
    return {
      conclusif: false,
      raison: `population trop mince — fr ${fr.plans} plan(s) · en ${en.plans} plan(s), ` +
        `il en faut ${minPlans} par bras`,
      ecartPoints: ecart,
    };
  }
  const mFr = [...fr.millesimes].sort();
  const mEn = [...en.millesimes].sort();
  const memeMillesime = mFr.length === 1 && mEn.length === 1 && mFr[0] === mEn[0] &&
    mFr[0] !== "";
  if (!memeMillesime) {
    return {
      conclusif: false,
      raison: `les deux bras ne partagent pas UN millésime de prompt — ` +
        `fr {${mFr.map((m) => m || "∅").join(", ")}} · ` +
        `en {${mEn.map((m) => m || "∅").join(", ")}} ; ` +
        `on mesurerait une génération de consigne, pas une langue`,
      ecartPoints: ecart,
    };
  }
  return {
    conclusif: true,
    raison: `${fr.plans} plans fr contre ${en.plans} plans en, millésime ${mFr[0]}`,
    ecartPoints: ecart,
  };
}

// ---------------------------------------------------------------------------
// ③ LA PROVENANCE DU RÉSOLVEUR — textuelle, et elle le DIT
// ---------------------------------------------------------------------------

const MODULES_DE_PRODUCTION = [
  "plan_energy.ts",
  "food_composition.ts",
  "food_composition_io.ts",
  "meal_verdict.ts",
] as const;

const RACINE_DE_PRODUCTION = "supabase/functions/_shared/keel/";

/**
 * ⛔ LA GARDE ③ : aucun des quatre modules de calcul n'est importé d'ailleurs
 * que de `supabase/functions/_shared/keel/`.
 *
 * ⚠️ ELLE EST TEXTUELLE, ET IL FAUT LE SAVOIR: elle lit les spécificateurs
 * d'import de CE fichier et de `keel_v0e_resolveur_20260821.ts` (dont on
 * réutilise les adaptateurs), pas le graphe de modules réellement chargé. Elle
 * attrape le geste qu'on craint — « je fige une copie dans `scripts/` pour que
 * la mesure ne bouge plus » — et elle n'attrape pas une copie qu'on
 * substituerait par un `import map`. Écrit ici plutôt que découvert plus tard.
 */
export function assertProductionResolver(): string[] {
  const moi = new URL(import.meta.url);
  const v0e = new URL("./keel_v0e_resolveur_20260821.ts", import.meta.url);
  const sources: [string, string][] = [
    [moi.pathname, Deno.readTextFileSync(moi)],
    [v0e.pathname, Deno.readTextFileSync(v0e)],
  ];
  const notes: string[] = [];
  const vus = new Set<string>();
  for (const [chemin, texte] of sources) {
    for (const m of texte.matchAll(/\bfrom\s+"([^"]+)"/g)) {
      const spec = m[1];
      const base = spec.split("/").pop() ?? "";
      if (!(MODULES_DE_PRODUCTION as readonly string[]).includes(base)) continue;
      if (!spec.includes(RACINE_DE_PRODUCTION)) {
        throw new Error(
          `⛔ GARDE ③ — RÉSOLVEUR NON DE PRODUCTION: ${chemin} importe "${base}" ` +
            `depuis "${spec}", hors de ${RACINE_DE_PRODUCTION}. ` +
            `Une copie figée mesure ce que le produit faisait, pas ce qu'il fait.`,
        );
      }
      const cible = new URL(spec, `file://${chemin}`);
      try {
        Deno.statSync(cible);
      } catch {
        throw new Error(`⛔ GARDE ③ — import introuvable sur le disque: ${spec}`);
      }
      vus.add(base);
      notes.push(`${base} ← ${spec}`);
    }
  }
  const manquants = MODULES_DE_PRODUCTION.filter((m) => !vus.has(m));
  if (manquants.length > 0) {
    throw new Error(
      `⛔ GARDE ③ — aucun import de production trouvé pour: ${manquants.join(", ")}. ` +
        `Le compteur ne passerait plus par le moteur du produit.`,
    );
  }
  return [...new Set(notes)].sort();
}

/**
 * ⛔ LA GARDE ① — le regroupement retombe-t-il sur la locale entière ?
 *
 * Les cinq locales sont celles que la base porte RÉELLEMENT (mesuré le
 * 2026-08-22): `en`, `en-GB`, `en-US`, `fr-FR`, `fr-US`.
 */
export function assertLanguageGrouping(): void {
  const cas: [unknown, string | null][] = [
    ["en", "en"],
    ["en-GB", "en"],
    ["en-US", "en"],
    ["fr-FR", "fr"],
    ["fr-US", "fr"], // ⛔ le piège: une locale US qui parle FRANÇAIS
    ["FR_ca", "fr"],
    ["  fr-FR  ", "fr"],
    ["", null],
    [null, null],
    ["x", null],
  ];
  for (const [entree, attendu] of cas) {
    const rendu = languageOf(entree);
    if (rendu !== attendu) {
      throw new Error(
        `⛔ GARDE ① — le regroupement par langue est faux: ` +
          `languageOf(${JSON.stringify(entree)}) = ${JSON.stringify(rendu)}, ` +
          `attendu ${JSON.stringify(attendu)}. ` +
          `Regrouper sur la locale ENTIÈRE compte l'anglais pour trois langues ` +
          `et fait tomber fr-US du mauvais côté.`,
      );
    }
  }
}

/**
 * ⛔ LA GARDE ② — un cas qui MORD et un cas qui PASSE.
 *
 * ⚠️ « Une garde a besoin d'un cas qui passe »: cassée, une garde qui refuse
 * TOUT ressemble parfaitement à une garde qui marche.
 */
export function assertPopulationGuard(): void {
  const bras = (plans: number, journees: number, calc: number, ms: string[]): Bras => ({
    plans,
    journees,
    calculables: calc,
    millesimes: new Set(ms),
  });
  const M = "meal.fr.vX+household.vX";

  // ① LE CAS QUI MORD — 1 plan français contre 178 anglais. C'est exactement
  //    l'état du corpus, et c'est le chiffre qu'il ne faut PAS rendre.
  const mince = verdictSur(bras(1, 7, 2, [M]), bras(178, 900, 700, [M]));
  if (mince.conclusif) {
    throw new Error(
      "⛔ GARDE ② DÉSARMÉE — le script a conclu sur 1 plan contre 178. " +
        "Un compteur qui rend un nombre sur n=1 est pire qu'un compteur absent.",
    );
  }

  // ② LE CAS QUI PASSE — cinq contre cinq, même millésime.
  const plein = verdictSur(bras(5, 35, 30, [M]), bras(5, 35, 28, [M]));
  if (!plein.conclusif) {
    throw new Error(
      `⛔ GARDE ② CASSÉE — elle refuse un banc RÉGULIER (5 vs 5, même millésime): ` +
        `« ${plein.raison} ». Une garde qui refuse tout ne garde rien.`,
    );
  }
  const attendu = 100 * 30 / 35 - 100 * 28 / 35;
  if (plein.ecartPoints === null || Math.abs(plein.ecartPoints - attendu) > 1e-9) {
    throw new Error(
      `⛔ GARDE ② — l'écart rendu (${plein.ecartPoints}) n'est pas celui des taux (${attendu}).`,
    );
  }

  // ③ LE CAS DU MILLÉSIME — même population, deux générations de prompt.
  const melange = verdictSur(bras(5, 35, 30, [M]), bras(5, 35, 28, ["meal.en.v15+household.v17"]));
  if (melange.conclusif) {
    throw new Error(
      "⛔ GARDE ② DÉSARMÉE — le script a conclu sur deux millésimes de prompt " +
        "différents. Il mesurerait une consigne, pas une langue (§⑨ n° 40).",
    );
  }
}

// ---------------------------------------------------------------------------
// LE COMPTE
// ---------------------------------------------------------------------------

const LANES = ["foyer", "solo"] as const;
type Lane = (typeof LANES)[number];

interface Cellule {
  plans: number;
  journees: number;
  calculables: number;
  plats: number;
  platsCalculables: number;
  lignes: number;
  lignesPesees: number;
  millesimes: Map<string, number>;
  /** Les motifs d'abstention, par plat, tels que `dishEnergy` les nomme. */
  motifs: Map<string, number>;
  /** Les termes qui ÉTEIGNENT un plat — `unreadableTerms`, la worklist. */
  termesBloquants: Map<string, number>;
}

const celluleVide = (): Cellule => ({
  plans: 0,
  journees: 0,
  calculables: 0,
  plats: 0,
  platsCalculables: 0,
  lignes: 0,
  lignesPesees: 0,
  millesimes: new Map(),
  motifs: new Map(),
  termesBloquants: new Map(),
});

const pct = (num: number, den: number) => den === 0 ? "  n/a" : `${(100 * num / den).toFixed(1)} %`;

const laneOf = (row: Record<string, unknown>): Lane =>
  String(row.plan_kind ?? "") === "household" ? "foyer" : "solo";

/** Une clé `langue|lane`. La langue vaut `∅` quand la locale est illisible. */
const cleDe = (langue: string | null, lane: Lane) => `${langue ?? "∅"}|${lane}`;

function ajouterPlan(
  cell: Cellule,
  index: CompositionIndex,
  row: Record<string, unknown>,
) {
  const dishes = readDishes(row.dishes);
  const preparations = readPreparations(row.preparations);
  const servings = Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1)));

  cell.plans++;
  const pv = String(row.prompt_version ?? "");
  cell.millesimes.set(pv, (cell.millesimes.get(pv) ?? 0) + 1);

  // ── LES LIGNES, APRÈS PLIAGE — la fonction de production, pas une copie ──
  const plies = foldPreparationsIntoDishes({
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
  for (const f of plies) {
    const ings = f.ingredients as readonly CompositionInput[];
    if (ings.length === 0) continue;
    const r = resolveIngredients(index, ings);
    cell.lignes += r.total;
    cell.lignesPesees += r.resolved.length;
  }

  // ── LE COMPTEUR — journées calculables, par le chemin de production ─────
  const energy = planEnergy({
    index,
    dishes,
    preparations,
    servings,
    addons: [],
    mealsOutByDay: new Map<string | null, number>(),
  });
  for (const d of energy.dishes) {
    cell.plats++;
    if (d.complete) {
      cell.platsCalculables++;
      continue;
    }
    // ⚠️ LE MOTIF ET LE TERME, PAS SEULEMENT LE COMPTE. « 20 journées sur 20
    // ne sont pas calculables » ne dit à personne quoi réparer; « `huile
    // d'olive` ×42, motif missing_quantity » le dit. C'est la moitié utile
    // d'un compteur par LANGUE: les termes qui bloquent ne sont pas les mêmes
    // des deux côtés, et c'est précisément ce que la fiche cherche.
    for (const g of d.gaps) cell.motifs.set(g, (cell.motifs.get(g) ?? 0) + 1);
    for (const t of d.unreadableTerms) {
      cell.termesBloquants.set(t, (cell.termesBloquants.get(t) ?? 0) + 1);
    }
  }
  for (const j of energy.days) {
    cell.journees++;
    if (j.complete) cell.calculables++;
  }
}

function brasDe(cells: Cellule[]): Bras {
  const millesimes = new Set<string>();
  let plans = 0, journees = 0, calculables = 0;
  for (const c of cells) {
    plans += c.plans;
    journees += c.journees;
    calculables += c.calculables;
    for (const m of c.millesimes.keys()) millesimes.add(m);
  }
  return { plans, journees, calculables, millesimes };
}

// ---------------------------------------------------------------------------
// ④ L19c — CE QUE LES DOUBLONS DU RÉFÉRENTIEL PEUVENT FAIRE À CE COMPTEUR-CI
// ---------------------------------------------------------------------------

interface Jumelle {
  a: CompositionRef;
  b: CompositionRef;
  /** Diffèrent-elles sur un champ qui peut faire BASCULER une journée ? */
  mordSurCeCompteur: boolean;
  motif: string;
}

/**
 * ⚠️ LA QUESTION DE CE COMPTEUR N'EST PAS CELLE DE L'ÉPREUVE DU NOM NU.
 *
 * `dishEnergy` s'abstient sur `unresolvedTerms` (le terme est inconnu) ou sur
 * `unweighedTerms` (on ne sait pas en tirer des grammes) — JAMAIS sur la
 * valeur de l'énergie. Deux jumelles à 4 % d'énergie près rendent donc la
 * MÊME complétude, sauf si elles divergent sur les deux seuls champs qui
 * décident de la PESÉE:
 *   · `unitGrams`      — « 3 œufs » se pèse chez l'une et pas chez l'autre;
 *   · `condimentGrams` — la masse conventionnelle d'un condiment sans quantité.
 * (`yieldClass` change les grammes, donc les kcal, mais jamais la complétude:
 *  `gramsRawOf` rend un nombre dans les deux cas.)
 */
function recenserJumelles(index: CompositionIndex, atteints: Set<string>): Jumelle[] {
  const refs = [...index.bySlug.values()];
  const parGroupe = new Map<string, CompositionRef[]>();
  for (const r of refs) {
    const g = String(r.foodGroupRef ?? "");
    if (!g) continue;
    const l = parGroupe.get(g) ?? [];
    l.push(r);
    parGroupe.set(g, l);
  }
  const out: Jumelle[] = [];
  for (const groupe of parGroupe.values()) {
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const a = groupe[i], b = groupe[j];
        const ea = Number(a.energyKcal), eb = Number(b.energyKcal);
        if (!Number.isFinite(ea) || !Number.isFinite(eb)) continue;
        const plafond = Math.max(Math.abs(ea), Math.abs(eb));
        if (plafond === 0) continue;
        if (Math.abs(ea - eb) / plafond > JUMELLE_ECART_ENERGIE) continue;
        // Seuls les couples dont AU MOINS UNE ligne est atteinte par le corpus
        // peuvent bouger un chiffre. Les autres sont du bruit de référentiel.
        if (!atteints.has(a.slug) && !atteints.has(b.slug)) continue;
        const motifs: string[] = [];
        if ((a.unitGrams ?? null) !== (b.unitGrams ?? null)) {
          motifs.push(`unit_grams ${a.unitGrams ?? "∅"}≠${b.unitGrams ?? "∅"}`);
        }
        if ((a.condimentGrams ?? null) !== (b.condimentGrams ?? null)) {
          motifs.push(`condiment_grams ${a.condimentGrams ?? "∅"}≠${b.condimentGrams ?? "∅"}`);
        }
        out.push({
          a,
          b,
          mordSurCeCompteur: motifs.length > 0,
          motif: motifs.length > 0 ? motifs.join(" · ") : "aucun champ de PESÉE ne diffère",
        });
      }
    }
  }
  return out.sort((x, y) =>
    Number(y.mordSurCeCompteur) - Number(x.mordSurCeCompteur) ||
    x.a.slug.localeCompare(y.a.slug)
  );
}

// ---------------------------------------------------------------------------
// LA SORTIE
// ---------------------------------------------------------------------------

function argOf(nom: string): string | null {
  const p = `--${nom}=`;
  for (const a of Deno.args) if (a.startsWith(p)) return a.slice(p.length);
  return null;
}

async function main() {
  const dir = Deno.args.find((a) => !a.startsWith("--")) ?? ".";
  const since = argOf("since");
  const pvBanc = argOf("prompt-version");
  const minPlans = Number(argOf("min-plans") ?? MIN_PLANS_PAR_BRAS);

  // ⚠️ COMPARAISON D'INSTANTS, PAS DE CHAÎNES. `"2026-08-22T09:00:00Z"` est
  // lexicographiquement APRÈS `"2026-08-22T11:00:00+02:00"` alors qu'il le
  // précède. Un banc découpé au `>=` textuel prendrait les mauvais plans, en
  // silence — et un banc faux est indiscernable d'un banc juste dans la sortie.
  const sinceMs = since === null ? null : Date.parse(since);
  if (sinceMs !== null && !Number.isFinite(sinceMs)) {
    throw new Error(
      `⛔ --since=${since} n'est pas un instant lisible. Attendu ISO 8601, ` +
        `par exemple 2026-08-22T12:00:00Z ou 2026-08-22T14:00:00+02:00.`,
    );
  }

  // ── LES TROIS GARDES, AVANT TOUTE MESURE ────────────────────────────────
  // Une garde qui tourne APRÈS le chiffre ne garde rien: le chiffre est déjà lu.
  const provenance = assertProductionResolver();
  assertLanguageGrouping();
  assertPopulationGuard();

  const index = await loadCompositionIndex(fileClient(dir));
  const plans = JSON.parse(
    `[${
      Deno.readTextFileSync(`${dir}/plans.ndjson`).split("\n").filter((l) => l.trim()).join(",")
    }]`,
  ) as Record<string, unknown>[];

  const banc = new Map<string, Cellule>();
  const corpus = new Map<string, Cellule>();
  const languesVues = new Set<string>();
  const atteints = new Set<string>();
  let sansLocaleLisible = 0;

  for (const row of plans) {
    const langue = languageOf(row.content_locale);
    if (langue === null) sansLocaleLisible++;
    else languesVues.add(langue);
    const lane = laneOf(row);
    const cle = cleDe(langue, lane);

    const creeMs = Date.parse(String(row.created_at ?? ""));
    const pv = String(row.prompt_version ?? "");
    const dansLeBanc = sinceMs !== null && Number.isFinite(creeMs) && creeMs >= sinceMs &&
      (pvBanc === null || pv === pvBanc);
    const cible = dansLeBanc ? banc : corpus;
    const cell = cible.get(cle) ?? celluleVide();
    ajouterPlan(cell, index, row);
    cible.set(cle, cell);

    // ── LES SLUGS QUE LE CORPUS ATTEINT — l'entrée de la section ④ ────────
    // ⛔ `resolveIngredient` (le SINGULIER) et surtout PAS `resolveIngredients`
    // + `.resolved`: le pluriel ne garde que les lignes RÉSOLUES **ET PESÉES**,
    // donc un terme sans quantité — la moitié du corpus — n'y apparaît pas.
    // « Atteint » veut dire « le référentiel a su nommer cette ligne », pas
    // « on a su la peser ». Confondre les deux avait rendu 6 couples au lieu
    // de 45, en silence, et c'est exactement le piège ③ de `V0-E′`.
    for (const holder of [row.dishes, row.preparations]) {
      if (!Array.isArray(holder)) continue;
      for (const entry of holder) {
        const ings = (entry as Record<string, unknown> | null)?.ingredients;
        if (!Array.isArray(ings)) continue;
        for (const raw of ings) {
          const terme = String(((raw ?? {}) as Record<string, unknown>).term ?? "").trim();
          if (!terme) continue;
          const ref = resolveIngredient(index, terme);
          if (ref) atteints.add(ref.slug);
        }
      }
    }
  }

  // ⛔ LA GARDE ①-bis — les clés RÉELLEMENT produites, pas seulement la table
  // de la garde ①. Un regroupement muté qui rendrait `en-GB` sortirait ici.
  for (const l of languesVues) {
    if (!/^[a-z]{2,3}$/.test(l)) {
      throw new Error(
        `⛔ GARDE ① — une clé de langue produite sur le corpus n'est pas un ` +
          `sous-tag: "${l}". Le regroupement est retombé sur la locale entière.`,
      );
    }
  }

  const langues = [...languesVues].sort();
  const ligne = (langue: string, lane: Lane, c: Cellule | undefined) => {
    const v = c ?? celluleVide();
    return `     ${langue.padEnd(4)} ${lane.padEnd(6)} ` +
      `plans ${String(v.plans).padStart(4)} · ` +
      `journées ${String(v.calculables).padStart(4)}/${String(v.journees).padStart(4)} ` +
      `= ${pct(v.calculables, v.journees).padStart(7)} · ` +
      `plats ${String(v.platsCalculables).padStart(5)}/${String(v.plats).padStart(5)} ` +
      `= ${pct(v.platsCalculables, v.plats).padStart(7)} · ` +
      `lignes pesées ${pct(v.lignesPesees, v.lignes).padStart(7)}`;
  };

  const dit = (s: string) => console.log(s);

  dit("═══════════════════════════════════════════════════════════════════════════");
  dit("L2-lang — COMPTEUR #2 : JOURNÉES CALCULABLES, PAR LANE ET PAR LANGUE");
  dit(`exécuté le ${new Date().toISOString()} · données ${dir}`);
  dit(
    `mode: ${
      since === null
        ? "ÉTAT DE DÉPART (aucun banc — `--since` absent)"
        : `BANC depuis ${since}${pvBanc ? ` · prompt_version = ${pvBanc}` : ""}`
    }`,
  );
  dit("═══════════════════════════════════════════════════════════════════════════");
  dit("");
  dit("── LES GARDES ──────────────────────────────────────────────────────────────");
  dit("   ① regroupement sur le SOUS-TAG de langue (en/en-GB/en-US → en · fr-US → fr) ✅");
  dit(`   ② refus de conclure sous ${minPlans} plans par bras, ou sur deux millésimes ✅`);
  // ⛔ UN SEUIL ABAISSÉ EN LIGNE DE COMMANDE DOIT SE VOIR DANS LA SORTIE.
  // Sans cette ligne, `--min-plans=1` rendrait un verdict « conclusif » que
  // rien ne distinguerait d'un vrai — et la sortie archivée mentirait pour
  // toujours. C'est le mode d'échec n° 1 de ce dépôt: un seuil qu'on déclare
  // atteint sans sa mesure.
  if (minPlans < MIN_PLANS_PAR_BRAS) {
    dit(
      `      ⛔⛔ GARDE ② ABAISSÉE À LA MAIN: --min-plans=${minPlans} au lieu de ` +
        `${MIN_PLANS_PAR_BRAS}. TOUT verdict rendu ci-dessous est INVALIDE comme ` +
        `mesure de fin de vague — c'est une sonde de plomberie, pas le compteur.`,
    );
  }
  dit("   ③ résolveur DE PRODUCTION, jamais une copie ✅");
  for (const p of provenance) dit(`        ${p}`);
  dit("");

  // ── ① LE BANC ────────────────────────────────────────────────────────────
  dit("── ① LE BANC — les deux bras GÉNÉRÉS CÔTE À CÔTE ───────────────────────────");
  if (banc.size === 0) {
    dit("     (vide)");
    dit("     ⛔ AUCUN BANC. Les dix générations (5 fr-FR + 5 en, même prompt_version)");
    dit("        n'ont pas encore été produites — ou `--since` n'a pas été passé.");
  } else {
    for (const langue of langues) {
      for (const lane of LANES) dit(ligne(langue, lane, banc.get(cleDe(langue, lane))));
    }
  }
  dit("");

  // ── ② LE CORPUS ──────────────────────────────────────────────────────────
  dit("── ② LE CORPUS EXISTANT — ⛔ TROISIÈME COLONNE, JAMAIS LE BRAS EN ──────────");
  for (const langue of langues) {
    for (const lane of LANES) dit(ligne(langue, lane, corpus.get(cleDe(langue, lane))));
  }
  if (sansLocaleLisible > 0) {
    dit(`     ⚠️ ${sansLocaleLisible} plan(s) sans locale lisible, comptés sous ∅`);
  }
  dit("");
  dit("     ⚠️ POURQUOI CE CORPUS NE PEUT PAS SERVIR DE BRAS EN — les millésimes:");
  for (const langue of langues) {
    const tous = new Map<string, number>();
    for (const lane of LANES) {
      for (const [m, n] of (corpus.get(cleDe(langue, lane))?.millesimes ?? new Map())) {
        tous.set(m, (tous.get(m) ?? 0) + n);
      }
    }
    const sansPv = tous.get("") ?? 0;
    const distincts = [...tous.keys()].filter((m) => m !== "").length;
    const total = [...tous.values()].reduce((a, b) => a + b, 0);
    dit(
      `        ${langue.padEnd(4)} ${String(total).padStart(4)} plans · ` +
        `${distincts} millésime(s) de prompt distinct(s) · ${sansPv} sans aucun prompt_version`,
    );
  }
  dit("");

  // ── ③ LE VERDICT ─────────────────────────────────────────────────────────
  dit("── ③ LE VERDICT — l'écart FR/EN sur le taux de JOURNÉES CALCULABLES ────────");
  const source = banc.size === 0 ? corpus : banc;
  const etiquette = banc.size === 0 ? "corpus existant" : "banc";
  const cellsDe = (langue: string, lanes: readonly Lane[]) =>
    lanes.map((l) => source.get(cleDe(langue, l))).filter((c): c is Cellule => !!c);

  for (const portee of [["foyer", "solo"] as const, ["foyer"] as const, ["solo"] as const]) {
    const nom = portee.length === 2 ? "les deux lanes" : portee[0];
    const fr = brasDe(cellsDe("fr", portee));
    const en = brasDe(cellsDe("en", portee));
    const v = verdictSur(fr, en, minPlans);
    const chiffre = v.ecartPoints === null ? "n/a" : `${v.ecartPoints.toFixed(1)} points`;
    dit(
      `     ${nom.padEnd(14)} fr ${fr.calculables}/${fr.journees} (${
        pct(fr.calculables, fr.journees)
      }, ${fr.plans} plans) · ` +
        `en ${en.calculables}/${en.journees} (${pct(en.calculables, en.journees)}, ${en.plans} plans)`,
    );
    if (v.conclusif) {
      const atteint = (v.ecartPoints ?? Infinity) <= ECART_MAX_POINTS;
      dit(
        `     ${" ".repeat(14)} ⇒ écart ${chiffre} · seuil ≤ ${ECART_MAX_POINTS} · ${
          atteint ? "✅ ATTEINT" : "⛔ MANQUÉ"
        }  (${v.raison})${
          minPlans < MIN_PLANS_PAR_BRAS ? "  ⛔ SOUS SEUIL DE POPULATION ABAISSÉ — INVALIDE" : ""
        }`,
      );
    } else {
      dit(`     ${" ".repeat(14)} ⇒ ⛔ REFUS DE CONCLURE — ${v.raison}`);
      dit(
        `     ${" ".repeat(14)}   (l'écart brut vaudrait ${chiffre} sur le ${etiquette} ; ` +
          `il ne mesure PAS une langue)`,
      );
    }
  }
  dit("");

  // ── ④ L19c ───────────────────────────────────────────────────────────────
  dit("── ④ L19c — LES DOUBLONS DU RÉFÉRENTIEL, MESURÉS SUR CE COMPTEUR-CI ───────");
  dit("     LE MÉCANISME D'ABORD, parce qu'il est plus étroit qu'on ne le croit:");
  dit("     `dishEnergy` s'abstient sur un terme INCONNU ou NON PESÉ — jamais sur la");
  dit("     VALEUR de l'énergie. Deux jumelles à 4 % d'énergie près rendent donc la");
  dit("     MÊME complétude, sauf si elles divergent sur `unit_grams` ou");
  dit("     `condiment_grams`. `yield_class` et `energy_kcal` déplacent des kcal, pas");
  dit("     une journée. ⇒ L19c mord BEAUCOUP moins ici que sur l'épreuve du nom nu.");
  dit("");
  const jumelles = recenserJumelles(index, atteints);
  const mordantes = jumelles.filter((j) => j.mordSurCeCompteur);
  dit("     LES DEUX COUPLES QUE `L19c` NOMME — leur sort sur CE compteur:");
  for (const [x, y] of [["whole_eggs", "egg"], ["plain_yogurt", "yoghurt"]]) {
    const j = jumelles.find((k) =>
      (k.a.slug === x && k.b.slug === y) || (k.a.slug === y && k.b.slug === x)
    );
    const a = index.bySlug.get(x), b = index.bySlug.get(y);
    if (!a || !b) {
      dit(`        ${x} / ${y} — ⚠️ absent du référentiel`);
      continue;
    }
    dit(
      `        ${x} / ${y}  unit_grams ${a.unitGrams ?? "∅"}/${b.unitGrams ?? "∅"} · ` +
        `condiment_grams ${a.condimentGrams ?? "∅"}/${b.condimentGrams ?? "∅"} · ` +
        `${a.energyKcal}/${b.energyKcal} kcal ⇒ ${
          j === undefined
            ? "hors recensement (groupe ou énergie hors critère, ou aucune ligne atteinte)"
            : j.mordSurCeCompteur
            ? "⛔ PEUT faire basculer une journée"
            : "✅ NE PEUT PAS faire basculer une journée"
        }`,
    );
  }
  dit("");
  // ⛔ CE NOMBRE EST UNE BORNE HAUTE, PAS UN RECENSEMENT DE JUMELLES.
  // Le critère de la fiche `L19c` — même groupe, énergie à 5 % près — capture
  // `apple`/`peach` aussi bien que `whole_eggs`/`egg`. Le publier comme « 254
  // doublons mordent » serait une fausse alarme, et ce dépôt paie déjà les
  // compteurs qui rendent un nombre pour autre chose que ce qu'ils nomment.
  // ⚠️ ET ON NE LE RESSERRE PAS PAR UN MATCHER MAISON: « laitue » ≠ « lait »,
  // 12 faux positifs sur 12 mesurés la dernière fois. Le vrai resserrement est
  // le RECENSEMENT de `L19c`, décidé couple par couple — un autre lot.
  dit("     LA BORNE HAUTE — ⛔ ET CE N'EST PAS UN RECENSEMENT DE JUMELLES:");
  dit(
    `        ${jumelles.length} couple(s) « même groupe · énergie à ${
      (100 * JUMELLE_ECART_ENERGIE).toFixed(0)
    } % près » dont une ligne au moins est ATTEINTE par le corpus,`,
  );
  dit(
    `        dont ${mordantes.length} divergent sur unit_grams ou condiment_grams.`,
  );
  dit("        Le critère de la fiche capture aussi des aliments DIFFÉRENTS — vu ici:");
  for (const j of mordantes.slice(0, 3)) {
    dit(
      `           ${j.a.slug} / ${j.b.slug} [${j.a.foodGroupRef}] ` +
        `${j.a.energyKcal}/${j.b.energyKcal} kcal — ${j.motif}`,
    );
  }
  dit("        ⇒ la borne haute se lit « au plus », jamais « on en a trouvé tant ».");
  dit("");

  // ── ⑤ POURQUOI LES JOURNÉES MEURENT, PAR LANGUE ─────────────────────────
  dit("── ⑤ POURQUOI UNE JOURNÉE N'EST PAS CALCULABLE — PAR LANGUE ───────────────");
  for (const langue of langues) {
    const motifs = new Map<string, number>();
    const termes = new Map<string, number>();
    for (const lane of LANES) {
      const c = (banc.size === 0 ? corpus : banc).get(cleDe(langue, lane));
      if (!c) continue;
      for (const [g, n] of c.motifs) motifs.set(g, (motifs.get(g) ?? 0) + n);
      for (const [t, n] of c.termesBloquants) termes.set(t, (termes.get(t) ?? 0) + n);
    }
    const top = [...termes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    dit(
      `     ${langue.padEnd(4)} ${
        [...motifs.entries()].sort().map(([g, n]) => `${g} ${n}`).join(" · ") || "aucun"
      }`,
    );
    dit(
      `          termes qui BLOQUENT le plus: ${
        top.map(([t, n]) => `${t} ×${n}`).join(" · ") || "aucun"
      }`,
    );
  }
  dit("");

  // ── LA LIGNE DE TABLEAU DE BORD ──────────────────────────────────────────
  const parLangue = langues.map((l) => {
    const b = brasDe(cellsDe(l, LANES));
    return `${l} ${pct(b.calculables, b.journees)} (${b.calculables}/${b.journees}, ${b.plans}p)`;
  }).join(" · ");
  dit(`2|journées calculables PAR LANE ET PAR LANGUE|${parLangue}|deno`);
  dit("═══════════════════════════════════════════════════════════════════════════");
}

if (import.meta.main) await main();
