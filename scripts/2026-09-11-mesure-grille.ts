#!/usr/bin/env -S deno run --allow-read
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA GRILLE DE `docs/keel/mesure.md`, APPLIQUÉE À DES FIXTURES FIGÉES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LOT 0 du chantier « Fiabiliser les portions et préserver les recettes »
 * (`docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`).
 * But écrit dans le plan : **pouvoir distinguer un moteur amélioré d'un rapport
 * simplement devenu plus optimiste.**
 *
 * ── ⛔ CE QUE CE FICHIER A REMPLACÉ, ET POURQUOI ──────────────────────────
 * La version du 2026-09-11 05 h se connectait à la pile, demandait la cible à
 * `meal-energy-v1` et mesurait les kcal avec `planEnergy`. Elle a rendu **deux
 * dimanches à 2 370 et 3 075 kcal** là où les portions écrites en valent
 * **2 455,69** et **2 916,14** — parce qu'elle mélangeait DEUX BASES DE MESURE :
 * le contrôle 1 lisait les items des boîtes, le contrôle 5 des parts
 * conventionnelles (`uses.servings / servingsMade`). Les deux décrivent des
 * portions différentes ; leur rapport n'est pas une erreur d'arrondi.
 *
 * Quatre autres défauts de cette version, tous corrigés ici :
 *   ① elle extrayait les couloirs de densité par REGEX sur le texte du prompt
 *     et n'en voyait qu'un sur trois — d'où la conclusion fausse « aucun
 *     couloir envoyé » alors que le moteur en envoyait bien trois ;
 *   ② elle appelait `indexForReading` de travers (`inputs is not iterable`) et
 *     inventait des trous que le run n'avait pas ;
 *   ③ elle publiait UN dénominateur (« 7 plats ») pour cinq questions
 *     différentes — « le plat existe » et « la portion est calculée » sont
 *     deux contrôles distincts, et les confondre est le défaut du lot E ;
 *   ④ elle appelait « 100 % vérifié » le simple taux de présence du champ
 *     `ref`. Un `ref` présent dans le payload ne prouve RIEN : le lecteur
 *     `plan_energy_read.ts::readIngredient` ne le transmet pas.
 *
 * ── ⛔ CE QUE CET INSTRUMENT NE PEUT PAS FAIRE, PAR CONSTRUCTION ──────────
 * `--allow-read` et RIEN D'AUTRE. Pas de réseau, pas d'écriture, pas d'horloge
 * de décision. Un instrument qui ne peut ni appeler un modèle ni écrire en base
 * ne peut pas fabriquer un chiffre en cours de route ; et tout ce qu'il lit est
 * figé sur disque avec son empreinte.
 *
 * ── ⛔ L'INSTRUMENT EST CELUI DU PRODUIT ─────────────────────────────────
 * `boxNutrition`, `resolveIngredients`, `validationOf`, `requiredDensityFor`,
 * `slotPlanTargets`, `plateBoundsFor`, `densityFragment`, `finalPlanGate` sont
 * IMPORTÉS de `_shared/keel/`. Aucune équation n'est recodée ici — le plan
 * l'interdit nommément (§ lot F.1). Ce fichier ORDONNE des appels et COMPTE
 * leurs sorties ; il n'en calcule aucune.
 *
 *     deno run --allow-read scripts/2026-09-11-mesure-grille.ts \
 *       scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures
 *
 *     deno run --allow-read scripts/2026-09-11-mesure-grille.ts \
 *       scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures --json
 */
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import { indexForReading } from "../supabase/functions/_shared/keel/composition_fill_io.ts";
import {
  isComposable,
  validationOf,
} from "../supabase/functions/_shared/keel/food_reference_manifest.ts";
import {
  readEnergyBoxDishes,
  readIngredients,
  readPreparations,
} from "../supabase/functions/_shared/keel/plan_energy_read.ts";
import { boxNutrition } from "../supabase/functions/_shared/keel/mouth_energy.ts";
import {
  dayTargetFor,
  plateBoundsFor,
  type SlotDensity,
} from "../supabase/functions/_shared/keel/portion_sizing.ts";
import { slotPlanTargets } from "../supabase/functions/_shared/keel/mouth_anchor.ts";
// ⟳ 2026-09-11 · LOT B — LE CONTRAT FAIT AUTORITÉ, ET C'EST LUI QU'ON LIT.
// L'instrument ne reconstruit plus la cible d'une case : il appelle le
// constructeur de production et lit ce qu'il rend.
import {
  mergeSlotContractSets,
  requiredDensityFromContracts,
  slotContractsFor,
} from "../supabase/functions/_shared/keel/slot_nutrition_contract.ts";
import { densityFragment } from "../supabase/functions/_shared/keel/household_portions.ts";
import {
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
} from "../supabase/functions/_shared/keel/household_meal_generation.ts";
import { envelopeFor } from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { envelopeDirectionFor } from "../supabase/functions/_shared/keel/weight_pace.ts";
import { ageBandOf } from "../supabase/functions/_shared/keel/student_age.ts";
import { readQuantityFromProse } from "../supabase/functions/_shared/keel/quantity_from_prose.ts";
// ⟳ LOT C (2026-09-11) — LA FONCTION DE PRODUCTION, JAMAIS UN REJEU MAISON.
// Le lot 0 l'exige: « ne pas recoder les équations dans le script du banc ».
// L'instrument applique donc `finalizeQuantityProse` à une COPIE du plan et
// rejoue son propre contrôle ⑨ dessus — les fixtures ne bougent pas.
import {
  finalizeQuantityProse,
  planQuantityLines,
} from "../supabase/functions/_shared/keel/quantity_render.ts";
import {
  asGatePlan,
  FINAL_GATE_POLICY_LOT_1,
  finalGateDelivery,
  finalPlanGate,
} from "../supabase/functions/_shared/keel/final_plan_gate.ts";
// ⟳ LOT E (2026-09-11) — LA FONCTION DE PRODUCTION, JAMAIS UN REJEU MAISON.
// L'audit des courses par IDENTITÉ vit dans le moteur; l'instrument l'APPELLE.
import { shoppingIdentityAudit } from "../supabase/functions/_shared/keel/final_plan_audit.ts";
import { normalizePantryTerm } from "../supabase/functions/_shared/keel/meal_generation.ts";
import { CLEAN_HOUSEHOLD_CONTEXT } from "../supabase/functions/_shared/keel/final_plan_gate_fixtures.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LES TOLÉRANCES, ET LEUR SOURCE — jamais un nombre choisi ici
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ ÉCRITES DANS LE PLAN, PAS DANS LE MOTEUR, ET LA DIFFÉRENCE SE DIT. Le plan
// (§ lot E, « Portions et nutrition ») écrit « ±10 % par repas, ±5 % par
// journée couverte ». Aucune garde du dépôt ne les applique aujourd'hui :
// `final_plan_gate` reçoit `energy: null`. Un verdict rendu ici est donc une
// mesure CONTRE LE CRITÈRE ANNONCÉ, et pas la reproduction d'une garde vivante.
// Ne pas les élargir pour faire passer un banc (§ lot E, dernière ligne).
export const TOLERANCE_REPAS = 0.10;
export const TOLERANCE_JOUR_COUVERT = 0.05;
export const TOLERANCES_SOURCE =
  "docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md § lot E — " +
  "CRITÈRE ANNONCÉ, non branché dans le moteur (final_plan_gate reçoit energy: null)";

const FLOORS = {
  normal: NORMAL_DISH_MIN_KCAL_PER_100G,
  light: LIGHT_DISH_MIN_KCAL_PER_100G,
};

/**
 * L'IDENTIFIANT DU CONTREFACTUEL — nommé ici, jamais deviné dans une boucle.
 * C'est celui que le modèle a écrit sur le petit-déjeuner GAIN du samedi et que
 * les lecteurs de mesure n'utilisent pas. Le plan en fait une preuve de départ.
 */
export const CONTREFACTUEL_REF = "petit_suisse_cream_cheese";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES FIXTURES — figées, et vérifiées avant usage
// ═══════════════════════════════════════════════════════════════════════════

export interface Fixtures {
  racine: string;
  plans: Record<string, unknown>[];
  contextes: Record<string, unknown>[];
  echanges: Record<string, unknown>[];
  journaux: Record<string, unknown>[];
  referentiel: Record<string, Record<string, unknown>[]>;
  empreintes: Record<string, unknown>;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * ⛔ LE RÉFÉRENTIEL N'EST PAS RECOPIÉ, IL EST VÉRIFIÉ. Il vit dans
 * `scratchpad/2026-09-11-REVUE-CAMPAGNE/referentiel.json`, qui est une preuve
 * EXISTANTE que le lot a ordre de préserver. Le dupliquer ferait deux
 * référentiels qui peuvent diverger ; on garde donc l'unique, et on refuse de
 * mesurer si son empreinte a bougé. Une mesure sur un référentiel changé est
 * une mesure d'autre chose.
 */
export async function chargerFixtures(racine: string): Promise<Fixtures> {
  const lire = async (nom: string) =>
    JSON.parse(await Deno.readTextFile(`${racine}/${nom}`));
  const empreintes = await lire("empreintes.json");
  const refChemin = `${racine}/${String((empreintes.referentiel as Record<string, unknown>).chemin)}`;
  const refBytes = await Deno.readFile(refChemin);
  const vu = await sha256(refBytes);
  const attendu = String((empreintes.referentiel as Record<string, unknown>).sha256);
  if (vu !== attendu) {
    throw new Error(
      `⛔ le référentiel figé a changé — attendu ${attendu}, lu ${vu}. ` +
        `Toute mesure produite sur ce fichier décrirait un AUTRE référentiel. ` +
        `Chemin : ${refChemin}`,
    );
  }
  const plans = (await lire("plans.json")).plans as Record<string, unknown>[];
  const contextes = (await lire("contextes.json")).contextes as Record<string, unknown>[];
  const echanges = (await lire("echanges.json")).evenements as Record<string, unknown>[];
  const journaux = (await lire("journaux.json")).journaux as Record<string, unknown>[];
  return {
    racine,
    plans,
    contextes,
    echanges,
    journaux,
    referentiel: JSON.parse(new TextDecoder().decode(refBytes)),
    empreintes,
  };
}

/** Un client PostgREST de papier : il ne sert que les tables figées. */
function dbDePapier(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        range: (a: number, b: number) =>
          Promise.resolve({ data: (tables[table] ?? []).slice(a, b + 1), error: null }),
        in: (champ: string, voulus: string[]) =>
          Promise.resolve({
            data: (tables[table] ?? []).filter((r) => voulus.includes(String(r[champ]))),
            error: null,
          }),
      }),
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES TROIS INDEX — nommés séparément parce que leurs RÈGLES diffèrent
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LES CONFONDRE EST UN DÉFAUT MESURABLE, PAS UNE FINESSE. Le catalogue montré
// au modèle applique la porte de validation (`isComposable`) ; l'index de
// RELECTURE ne l'applique pas, exprès (« mesurer un plan déjà servi reste
// possible » — `food_reference_manifest.ts`). Un instrument qui relirait avec
// l'index de génération rendrait illisibles les lignes dont le défaut est
// précisément qu'elles ne sont pas vérifiées : il effacerait la trace du défaut
// au lieu de la lire.

export interface TroisIndex {
  /** Le référentiel seul, langue du plan. C'est ce qu'un plan ANCIEN sans `ref` lit. */
  historique: CompositionIndex;
  /** Ce que le catalogue du prompt retient : `isComposable` uniquement. */
  generation: { composables: number; refusees: string[]; total: number };
  /** Le référentiel PLUS ce que le sas sait des termes de CE plan. */
  relecture: { index: CompositionIndex; asked: number; kept: number };
}

/**
 * ⛔ `inputs` EST UNE LISTE DE `CompositionInput`, ET C'EST LE DÉFAUT ②.
 * Le rejeu du 2026-09-11 passait autre chose et recevait `inputs is not
 * iterable` ; la mesure repartait alors sur l'index de base et déclarait des
 * termes inconnus que le run avait su lire. Les entrées sont les ingrédients
 * des PLATS **et** des PRÉPARATIONS, lus par le lecteur du produit.
 *
 * ⚠️ TÉMOIN DISPONIBLE : `meal-energy-v1` journalise `asked`/`kept` sous
 * `keel.meal_energy.reading_index`. Sur les deux fixtures, ce rejeu rend
 * exactement les mêmes nombres (1/1 et 2/1) — c'est la preuve que l'index de
 * relecture est bien CELUI DU CHEMIN TESTÉ, et pas un index voisin.
 */
export function entreesDeRelecture(plan: Record<string, unknown>): CompositionInput[] {
  const unites = [
    ...((plan.dishes ?? []) as Record<string, unknown>[]),
    ...((plan.preparations ?? []) as Record<string, unknown>[]),
  ];
  return unites.flatMap((u) => readIngredients(u.ingredients));
}

export async function troisIndex(
  fx: Fixtures,
  plan: Record<string, unknown>,
): Promise<TroisIndex> {
  const db = dbDePapier(fx.referentiel);
  const langue = String(plan.content_locale ?? "fr-FR").slice(0, 2) === "en" ? "en" : "fr";
  const historique = await loadCompositionIndex(db as never, { lang: langue });
  const refs = [...historique.bySlug.values()];
  const refusees = refs.filter((r) => !isComposable(r)).map((r) => r.slug).sort();
  const relecture = await indexForReading({
    db: db as never,
    baseIndex: historique,
    inputs: entreesDeRelecture(plan),
  });
  return {
    historique,
    generation: {
      total: refs.length,
      composables: refs.length - refusees.length,
      refusees,
    },
    relecture,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES QUATRE ÉTATS D'UNE RÉFÉRENCE — jamais « taux de présence de `ref` »
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CECI FERME, ÉCRIT LE 2026-09-11 : « 100 % des ingrédients
// vérifiés » avait été publié à partir du taux de présence du champ `ref` dans
// le payload. Ces deux choses n'ont AUCUN rapport :
//   · `ref` est ce que le MODÈLE a écrit ; le lecteur qui mesure ne le lit même
//     pas (`plan_energy_read.ts::readIngredient` ne transmet pas `ref`) ;
//   · « vérifiée » est un état du RÉFÉRENTIEL (`validationOf`), qui dépend de
//     la provenance de la ligne et des exceptions nommées en base.
// Les deux sont donc rendus, l'un à côté de l'autre, sans jamais se remplacer.

export const ETATS_DE_REFERENCE = Object.freeze(
  [
    /** `validationOf(ref) === 'verifie'` — ANSES ou entrée curée à la main. */
    "reference_verifiee",
    /** La ligne vient du MILIEU d'une bande de groupe (`source: group_bounds`). */
    "estimation_de_groupe",
    /** Résolue, mais `a_verifier` : sas, modèle, ou exception nommée en base. */
    "en_attente_de_validation",
    /** Terme non résolu, OU résolu sans grammes calculables. Jamais zéro kcal. */
    "ingredient_non_mesurable",
  ] as const,
);
export type EtatDeReference = (typeof ETATS_DE_REFERENCE)[number];

export interface CensusReferences {
  lignes: number;
  parEtat: Record<EtatDeReference, number>;
  /** Le détail nommé : personne ne peut relire un compteur sans les noms. */
  noms: Record<EtatDeReference, string[]>;
  /** Le CHAMP `ref` du payload — une donnée du modèle, pas un état. */
  refEcritParLeModele: { lignes: number; avecRef: number; sansRef: string[] };
  /** Comptés à part : ils SONT dans les sommes, ils disent d'où vient la masse. */
  pesesParConvention: string[];
  pesesParLaProse: string[];
  fauxAmisMordus: string[];
}

function etatDe(ref: CompositionRef): EtatDeReference {
  if (ref.source === "group_bounds") return "estimation_de_groupe";
  return validationOf(ref) === "verifie"
    ? "reference_verifiee"
    : "en_attente_de_validation";
}

export function censusDesReferences(
  index: CompositionIndex,
  plan: Record<string, unknown>,
): CensusReferences {
  const unites = [
    ...((plan.dishes ?? []) as Record<string, unknown>[]),
    ...((plan.preparations ?? []) as Record<string, unknown>[]),
  ];
  const parEtat: Record<EtatDeReference, number> = {
    reference_verifiee: 0,
    estimation_de_groupe: 0,
    en_attente_de_validation: 0,
    ingredient_non_mesurable: 0,
  };
  const noms: Record<EtatDeReference, string[]> = {
    reference_verifiee: [],
    estimation_de_groupe: [],
    en_attente_de_validation: [],
    ingredient_non_mesurable: [],
  };
  const conv: string[] = [], prose: string[] = [], faux: string[] = [];
  let lignes = 0, avecRef = 0;
  const sansRef: string[] = [];
  for (const u of unites) {
    const brutes = (u.ingredients ?? []) as Record<string, unknown>[];
    for (const b of brutes) {
      lignes++;
      if (typeof b.ref === "string" && b.ref.trim() !== "") avecRef++;
      else sansRef.push(String(b.term ?? "?"));
    }
    const res = resolveIngredients(index, readIngredients(u.ingredients));
    // ⛔ « NON MESURABLE » COUVRE LES DEUX MOITIÉS : le terme que le référentiel
    // ne connaît pas, ET le terme connu dont on ne sait pas tirer de grammes.
    // Ne compter que la première ferait passer une huile « à volonté » pour un
    // ingrédient mesuré — 82 lignes d'huile sans quantité, mesurées ailleurs.
    // ⟳ LOT A (2026-09-11) — `refusedTerms` EST LA TROISIÈME MOITIÉ. Depuis que
    // l'identifiant traverse les lecteurs, une ligne peut être refusée PAR SON
    // IDENTIFIANT (inventé, ou déjà refusé par le parseur) sans que son terme
    // soit inconnu. Sans cette liste, ces lignes sortaient des quatre états et
    // la somme ne faisait plus `lignes` — un trou silencieux dans un census qui
    // existe précisément pour n'en avoir aucun.
    for (const t of [...res.unresolvedTerms, ...res.unweighedTerms, ...res.refusedTerms]) {
      parEtat.ingredient_non_mesurable++;
      noms.ingredient_non_mesurable.push(t);
    }
    for (const r of res.resolved) {
      const e = etatDe(r.ref);
      parEtat[e]++;
      noms[e].push(r.ref.slug);
    }
    conv.push(...res.conventionalTerms);
    prose.push(...res.proseQuantityTerms);
    faux.push(...res.falseFriendTerms);
  }
  const tri = (a: string[]) => [...a].sort();
  return {
    lignes,
    parEtat,
    noms: {
      reference_verifiee: tri(noms.reference_verifiee),
      estimation_de_groupe: tri(noms.estimation_de_groupe),
      en_attente_de_validation: tri(noms.en_attente_de_validation),
      ingredient_non_mesurable: tri(noms.ingredient_non_mesurable),
    },
    refEcritParLeModele: { lignes, avecRef, sansRef: tri(sansRef) },
    pesesParConvention: tri(conv),
    pesesParLaProse: tri(prose),
    fauxAmisMordus: tri(faux),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE CONTRAT PAR PERSONNE / DATE / CRÉNEAU — reconstruit, jamais deviné
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LA VOIE CHOISIE, ET POURQUOI ─────────────────────────────────────────
// Le plan laisse deux routes : (a) reconstruire le contrat hors ligne en
// appelant les MÊMES fonctions de production sur les MÊMES entrées figées ;
// (b) décrire la trace que le lot B devra émettre. On fait (a) — et (b) tombe
// avec, parce que la reconstruction MONTRE ce qui manque.
//
// ⛔ LA RECONSTRUCTION SE PROUVE, ELLE NE SE CROIT PAS. `densityFragment()`
// rend la phrase exacte que le prompt porte. On la compare CARACTÈRE POUR
// CARACTÈRE à la ligne archivée dans `llm_raw_response_events.user_message`.
// Si un seul champ d'entrée était faux — le poids, l'âge, les axes d'activité,
// la position du coach, la grille — les nombres de la phrase changeraient.
// C'est ce qui remplace la regex : on ne LIT plus le prompt, on le REFAIT et on
// vérifie qu'il tombe dessus.
//
// ⛔ ET RIEN N'EST RECODÉ. `slotContractsFor` est appelée entière, deux fois :
//   · avec le RYTHME ALIMENTAIRE de la bouche   → le contrat RÉPARÉ (lot B) ;
//   · avec la GRILLE prise pour rythme, jour par jour → ce que le moteur a
//     réellement envoyé le 2026-09-11, qui reste comparable CARACTÈRE POUR
//     CARACTÈRE au prompt archivé.
//
// ⟳ 2026-09-11 · LOT B — POURQUOI LA SECONDE RECONSTRUCTION RESTE. C'est la
// seule épreuve qui prouve que les entrées figées sont les bonnes : si un seul
// champ était faux (poids, âge, axes d'activité, position du coach, grille),
// les nombres de la phrase changeraient et l'égalité tomberait. La jeter parce
// que le moteur a été réparé reviendrait à jeter l'instrument avec le défaut.

export interface ContratCase {
  memberId: string;
  /** La date LOCALE, pas le jeton de jour : une clé de contrat doit être datée. */
  date: string;
  jour: string;
  slot: string;
  /** La cible de la JOURNÉE de cette bouche (`dayTargetFor`). */
  cibleJourKcal: number | null;
  /**
   * L'énergie À COMPOSER dans cette case — `SlotNutritionContract.composeKcal`.
   * ⟳ 2026-09-11 · LOT B : UN SEUL nombre par case désormais.
   */
  cibleCaseKcal: number | null;
  /**
   * La même case vue par le DIMENSIONNEMENT. ⟳ Depuis le lot B, les deux
   * lisent le MÊME contrat : ce champ vaut `cibleCaseKcal`, et le garder est ce
   * qui rend l'égalité VISIBLE au lieu d'être supposée.
   */
  cibleCaseDimensionnementKcal: number | null;
  /**
   * ⟳ 2026-09-11 · LOT B — CE QUE LE TIR DU 2026-09-11 A RÉELLEMENT ENVOYÉ,
   * grille prise pour rythme. Sur `PERTE / 2026-09-11 / dinner` : **2 454,00**
   * contre **858,90** à composer. Facteur **2,86**, et c'est le défaut du lot.
   */
  cibleCaseArchiveKcal: number | null;
  gMin: number | null;
  gPref: number | null;
  gMax: number | null;
  bornesSource: string | null;
  /** Le couloir propre à CETTE date, tel que le contrat le porte. */
  couloirDuJour:
    | { min: number; pref: number; max: number; needed: number; incompatible: string | null }
    | null;
  /**
   * Le couloir transmis au prompt pour CETTE date — la grappe de jours
   * compatibles qui la contient. ⟳ Depuis le lot B, une grappe ne peut plus
   * contenir un jour dont la bande est disjointe.
   */
  couloirTransmis:
    | { min: number; pref: number; max: number; needed: number; incompatible: string | null; occurrences: number; jours: string[] }
    | null;
  /**
   * ⟳ 2026-09-11 · LOT B — LE COULOIR QUE LE TIR DU 2026-09-11 A ENVOYÉ pour
   * cette case. Sur les dîners du samedi et du dimanche : **[250–250]
   * `above_askable_cap`**, alors que leur propre date valait [123–250] visée 135.
   */
  couloirArchive:
    | { min: number; pref: number; max: number; needed: number; incompatible: string | null; occurrences: number }
    | null;
  statut: "calcule" | "abstenu";
  raison: string | null;
}

export interface BoucheFigee {
  memberId: string;
  prenom: string;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  ageBand: string | null;
  gender: "male" | "female" | "other";
  goal: string;
  direction: "up" | "down" | null;
  paceKgPerWeek: number | null;
  appetite: "small" | "average" | "large" | null;
  activityLevel: string | null;
  activityAxes: { day: string | null; sport: string | null; asked: boolean };
  declaredSlots: string[];
  lightSlots: string[];
  restriction: "clear" | "raised" | "no_account" | "unreadable";
  ageState: "adult" | "minor" | "unknown";
  conditionRefs: string[];
  coachCounting: "no_position" | "no_counting";
  grille: Record<string, string[]>;
  jourVersDate: Record<string, string>;
}

function bouchePour(b: BoucheFigee) {
  return {
    memberId: b.memberId,
    ageState: b.ageState,
    restriction: b.restriction,
    body: {
      heightCm: b.heightCm,
      weightKg: b.weightKg,
      gender: b.gender,
      ageYears: b.ageYears,
      activityLevel: b.activityLevel,
      activityAxes: b.activityAxes,
      appetite: b.appetite,
    },
    direction: b.direction,
    paceKgPerWeek: b.paceKgPerWeek,
    declaredSlots: b.declaredSlots,
    conditionRefs: b.conditionRefs,
    portionIndex: null,
  };
}

/** Les journées de la grille, avec leur date locale. */
function joursDe(b: BoucheFigee) {
  return Object.entries(b.grille).map(([jourToken, slots]) => ({
    dayToken: jourToken,
    date: b.jourVersDate[jourToken] ?? jourToken,
    coveredSlots: slots,
    lockedSlots: [] as readonly string[],
    // ⚠️ AUCUN APPORT FIXE SUR CES DEUX FIXTURES (`fixed_intakes: []`). Ce n'est
    // pas un raccourci : c'est une ligne de table, et le contexte figé la porte.
    fixedKcalBySlot: null,
  }));
}

/**
 * LE CONTRAT RÉPARÉ — celui du lot B : le RYTHME ALIMENTAIRE au dénominateur.
 */
export function contratRepare(b: BoucheFigee) {
  const set = slotContractsFor({
    mouth: bouchePour(b) as never,
    coachCounting: b.coachCounting,
    rhythmSlots: b.declaredSlots,
    days: joursDe(b),
    lightSlots: b.lightSlots,
    ageYears: b.ageYears,
  });
  const d = requiredDensityFromContracts(set, FLOORS);
  return { set, densite: d, fragment: densityFragment(d.named) };
}

/**
 * CE QUE LE TIR DU 2026-09-11 A RÉELLEMENT ENVOYÉ — la grille prise pour rythme.
 *
 * ⛔ ELLE RESTE, ET C'EST DÉLIBÉRÉ. `densityFragment` de cette reconstruction
 * est comparée CARACTÈRE POUR CARACTÈRE à la ligne du prompt archivé : c'est ce
 * qui prouve que les entrées figées (poids, âge, axes d'activité, position du
 * coach, grille) sont les bonnes. Un poids modifié de 20 kg change la phrase et
 * l'égalité tombe.
 *
 * ⚠️ UN JEU DE CONTRATS PAR JOUR, PUIS RECOLLÉS : c'est exactement ce que
 * `requiredDensityFor` faisait avant le lot B — le rythme lu dans la grille de
 * CHAQUE jour, puis tout replié par nom de moment.
 */
export function contratTransmis(b: BoucheFigee) {
  const set = mergeSlotContractSets(
    joursDe(b).map((d) =>
      slotContractsFor({
        mouth: bouchePour(b) as never,
        coachCounting: b.coachCounting,
        rhythmSlots: d.coveredSlots,
        days: [d],
        lightSlots: b.lightSlots,
        ageYears: b.ageYears,
      })
    ),
  );
  const d = requiredDensityFromContracts(set, FLOORS);
  return { set, densite: d, fragment: densityFragment(d.named) };
}

export function contratsParCase(b: BoucheFigee): ContratCase[] {
  const jour = dayTargetFor(bouchePour(b) as never, b.coachCounting);
  const repare = contratRepare(b);
  const archive = contratTransmis(b);
  // ⛔ LA GRAPPE QUI CONTIENT CETTE DATE, pas « la première ligne du moment ».
  // C'est la moitié du lot B que le lecteur doit refléter : deux dîners de
  // dates différentes peuvent porter deux bandes.
  const ligneDe = (
    lignes: readonly SlotDensity[],
    slot: string,
    jourToken: string,
  ): SlotDensity | null =>
    lignes.find((d) => d.slot === slot && d.days.includes(jourToken)) ?? null;

  const out: ContratCase[] = [];
  for (const [jourToken, slots] of Object.entries(b.grille)) {
    for (const slot of slots) {
      const base: Omit<ContratCase, "statut" | "raison"> = {
        memberId: b.memberId,
        date: b.jourVersDate[jourToken] ?? jourToken,
        jour: jourToken,
        slot,
        cibleJourKcal: jour.kcal,
        cibleCaseKcal: null,
        cibleCaseDimensionnementKcal: null,
        cibleCaseArchiveKcal: null,
        gMin: null,
        gPref: null,
        gMax: null,
        bornesSource: null,
        couloirDuJour: null,
        couloirTransmis: null,
        couloirArchive: null,
      };
      if (jour.kcal === null) {
        out.push({ ...base, statut: "abstenu", raison: jour.reason });
        continue;
      }
      const c = repare.set.contracts.find((x) =>
        x.dayToken === jourToken && x.slot === slot
      ) ?? null;
      const a = archive.set.contracts.find((x) =>
        x.dayToken === jourToken && x.slot === slot
      ) ?? null;
      const dt = ligneDe(repare.densite.named, slot, jourToken);
      const da = ligneDe(archive.densite.named, slot, jourToken);
      out.push({
        ...base,
        // ⛔ UN SEUL NOMBRE, LU SUR LE CONTRAT. Le prompt et le dimensionnement
        // lisent tous deux `composeKcal` ; les deux colonnes du rapport sont
        // désormais égales PAR CONSTRUCTION, et c'est ce qu'il fallait prouver.
        cibleCaseKcal: c?.composeKcal ?? null,
        cibleCaseDimensionnementKcal: c?.composeKcal ?? null,
        cibleCaseArchiveKcal: a?.composeKcal ?? null,
        gMin: c?.bounds?.min ?? null,
        gPref: c?.bounds?.preferred ?? null,
        gMax: c?.bounds?.max ?? null,
        bornesSource: c?.bounds === null || c?.bounds === undefined
          ? null
          : `${c.bounds.band}/${c.bounds.slotClass}/${c.bounds.boundSource}/${c.bounds.source}`,
        couloirDuJour: c?.corridor == null ? null : {
          min: c.corridor.minPer100G,
          pref: c.corridor.preferredPer100G,
          max: c.corridor.maxPer100G,
          needed: c.corridor.neededMinPer100G,
          incompatible: c.corridor.incompatible,
        },
        couloirTransmis: dt === null ? null : {
          min: dt.minPer100G,
          pref: dt.preferredPer100G,
          max: dt.maxPer100G,
          needed: dt.neededMinPer100G,
          incompatible: dt.incompatible,
          occurrences: dt.occurrences,
          jours: [...dt.days],
        },
        couloirArchive: da === null ? null : {
          min: da.minPer100G,
          pref: da.preferredPer100G,
          max: da.maxPer100G,
          needed: da.neededMinPer100G,
          incompatible: da.incompatible,
          occurrences: da.occurrences,
        },
        statut: "calcule",
        raison: null,
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PORTION FINALE — par les items écrits, et par eux seuls
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ `planEnergy` N'EST PAS UN SUBSTITUT, ET C'EST L'ERREUR DU 2026-09-11.
// `readDishes` ne connaît que `uses.servings / servingsMade` : une part
// CONVENTIONNELLE. `boxNutrition` lit les GRAMMES ÉCRITS de chaque item et, pour
// chaque item qui cite sa casserole, le PRÉLÈVEMENT RÉEL à la densité de cette
// casserole (`boxNutritionByItems` → `potDensities`). C'est la seule des deux
// qui décrive le contenant que la personne ouvre.
//
// ⛔ LA JOURNÉE EST LA SOMME DE CES MÊMES PORTIONS. Pas une seconde lecture, pas
// `planEnergy` « pour le total ». Deux bases de mesure dans le même rapport ont
// rendu 2 370 là où les portions valent 2 455,69.

export interface PortionMesuree {
  boxId: string;
  memberIds: readonly string[];
  jour: string | null;
  slot: string | null;
  titre: string;
  grammes: number;
  kcal: number | null;
  proteineG: number | null;
  gap: string | null;
}

export function mesurerPortions(args: {
  index: CompositionIndex;
  plan: Record<string, unknown>;
}): PortionMesuree[] {
  const plats = (args.plan.dishes ?? []) as Record<string, unknown>[];
  const titreParBox = new Map<string, string>();
  for (const d of plats) {
    for (const b of (d.boxes ?? []) as Record<string, unknown>[]) {
      titreParBox.set(String(b.id ?? ""), String(d.title ?? d.name ?? "?"));
    }
  }
  return boxNutrition({
    index: args.index,
    dishes: readEnergyBoxDishes(args.plan.dishes),
    preparations: readPreparations(args.plan.preparations),
  }).map((b) => ({
    boxId: b.boxId,
    memberIds: b.memberIds,
    jour: b.day,
    slot: b.slot,
    titre: titreParBox.get(b.boxId) ?? "?",
    grammes: b.grams,
    kcal: b.kcal,
    proteineG: b.proteinG,
    gap: b.gap,
  }));
}

/**
 * LE CONTREFACTUEL D'IDENTITÉ — mêmes quantités, une seule référence reliée.
 *
 * ⛔ CE N'EST PAS UNE NOUVELLE GÉNÉRATION, ET CE N'EST PAS UNE CIBLE. Le modèle
 * a écrit `ref: petit_suisse_cream_cheese` ; les lecteurs de mesure, eux,
 * repartent du terme français et ne trouvent rien. On rebranche donc cette
 * SEULE identité, sans toucher à un gramme, et on remesure avec la même
 * fonction. L'écart entre les deux lectures est le coût de l'identifiant perdu
 * — pas une mesure de ce que quelqu'un a mangé.
 *
 * ⚠️ LA LIGNE DE L'AUTRE PLAN EST LE TÉMOIN : elle ne porte pas cette référence,
 * donc elle ne doit PAS bouger. Un contrefactuel dont le témoin bouge mesure
 * autre chose que ce qu'il annonce.
 */
export function contrefactuelIdentite(args: {
  index: CompositionIndex;
  plan: Record<string, unknown>;
  ref: string;
}): PortionMesuree[] {
  const copie = structuredClone(args.plan) as Record<string, unknown>;
  for (const d of (copie.dishes ?? []) as Record<string, unknown>[]) {
    for (const i of (d.ingredients ?? []) as Record<string, unknown>[]) {
      if (i.ref !== args.ref) continue;
      const terme = String(i.term ?? "");
      i.term = args.ref;
      for (const b of (d.boxes ?? []) as Record<string, unknown>[]) {
        for (const it of (b.items ?? []) as Record<string, unknown>[]) {
          if (!it.preparation_id && it.term === terme) it.term = args.ref;
        }
      }
    }
  }
  return mesurerPortions({ index: args.index, plan: copie });
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES CINQ DÉNOMINATEURS — publiés séparément, jamais fondus
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ « LE PLAT EXISTE » ET « LA PORTION EST CALCULÉE » SONT DEUX CONTRÔLES.
// Mesuré sur ces deux fixtures : 14 cases attendues, 14 plats présents, **12**
// portions calculées, **11** mesurables. Un rapport qui publie « 14/14 » a dit
// une chose vraie et laissé croire une chose fausse.
//
// ⛔ UNE PORTION ABSENTE NE SORT PAS DU DÉNOMINATEUR ATTENDU. Elle reste une
// case attendue sans portion, et c'est ce qui la rend visible.

export interface Denominateurs {
  casesAttendues: number;
  platsPresents: number;
  portionsCalculees: number;
  portionsMesurables: number;
  portionsConformes: number;
  /** Le détail nommé de chaque marche descendue. */
  casesSansPlat: string[];
  casesSansPortion: string[];
  portionsNonMesurables: { case_: string; motif: string }[];
  portionsNonConformes: { case_: string; ecartPct: number }[];
}

export interface CaseMesuree {
  cle: string;
  jour: string;
  date: string;
  slot: string;
  contrat: ContratCase | null;
  plat: Record<string, unknown> | null;
  portion: PortionMesuree | null;
  ecartKcalPct: number | null;
  masseDansLesBornes: boolean | null;
  densiteMesuree: number | null;
  densiteDansLeCouloir: boolean | null;
}

export function croiser(args: {
  bouche: BoucheFigee;
  contrats: ContratCase[];
  plan: Record<string, unknown>;
  portions: PortionMesuree[];
}): { cases: CaseMesuree[]; denominateurs: Denominateurs } {
  const plats = (args.plan.dishes ?? []) as Record<string, unknown>[];
  const platPar = new Map<string, Record<string, unknown>>();
  for (const d of plats) platPar.set(`${d.day}/${d.slot}`, d);
  const portionPar = new Map<string, PortionMesuree>();
  for (const p of args.portions) portionPar.set(`${p.jour}/${p.slot}`, p);

  const cases: CaseMesuree[] = [];
  const casesSansPlat: string[] = [];
  const casesSansPortion: string[] = [];
  const portionsNonMesurables: { case_: string; motif: string }[] = [];
  const portionsNonConformes: { case_: string; ecartPct: number }[] = [];
  let platsPresents = 0, portionsCalculees = 0, portionsMesurables = 0, portionsConformes = 0;

  for (const [jour, slots] of Object.entries(args.bouche.grille)) {
    for (const slot of slots) {
      const cle = `${jour}/${slot}`;
      const contrat = args.contrats.find((c) => c.jour === jour && c.slot === slot) ?? null;
      const plat = platPar.get(cle) ?? null;
      const portion = portionPar.get(cle) ?? null;
      if (plat !== null) platsPresents++;
      else casesSansPlat.push(cle);
      if (portion !== null) portionsCalculees++;
      else casesSansPortion.push(cle);

      let ecart: number | null = null;
      let densite: number | null = null;
      let dansCouloir: boolean | null = null;
      let masseOk: boolean | null = null;
      if (portion !== null && portion.kcal !== null) {
        portionsMesurables++;
        const cible = contrat?.cibleCaseDimensionnementKcal ?? null;
        if (cible !== null && cible > 0) {
          ecart = (portion.kcal - cible) / cible;
          if (Math.abs(ecart) <= TOLERANCE_REPAS) portionsConformes++;
          else portionsNonConformes.push({ case_: cle, ecartPct: ecart * 100 });
        }
        if (portion.grammes > 0) {
          densite = portion.kcal / portion.grammes * 100;
          const c = contrat?.couloirTransmis ?? null;
          dansCouloir = c === null || c.incompatible !== null
            ? null
            : densite >= c.min && densite <= c.max;
        }
      } else if (portion !== null) {
        portionsNonMesurables.push({ case_: cle, motif: portion.gap ?? "inconnu" });
      }
      if (portion !== null && contrat?.gMin !== null && contrat?.gMax !== undefined) {
        masseOk = portion.grammes >= (contrat.gMin ?? 0) && portion.grammes <= (contrat.gMax ?? 0);
      }
      cases.push({
        cle,
        jour,
        date: contrat?.date ?? jour,
        slot,
        contrat,
        plat,
        portion,
        ecartKcalPct: ecart,
        masseDansLesBornes: masseOk,
        densiteMesuree: densite,
        densiteDansLeCouloir: dansCouloir,
      });
    }
  }
  const casesAttendues = Object.values(args.bouche.grille).reduce((n, s) => n + s.length, 0);
  return {
    cases,
    denominateurs: {
      casesAttendues,
      platsPresents,
      portionsCalculees,
      portionsMesurables,
      portionsConformes,
      casesSansPlat,
      casesSansPortion,
      portionsNonMesurables,
      portionsNonConformes,
    },
  };
}

// ── LA JOURNÉE : la somme des MÊMES portions, et son état ────────────────────
export interface JourMesure {
  jour: string;
  date: string;
  casesAttendues: number;
  portionsMesurables: number;
  kcalSomme: number | null;
  budgetCouvertKcal: number | null;
  cibleJourKcal: number | null;
  ecartPct: number | null;
  etat: "conforme" | "non_conforme" | "non_mesurable";
  raison: string | null;
}

export function journeesParPortions(cases: readonly CaseMesuree[]): JourMesure[] {
  const jours = [...new Set(cases.map((c) => c.jour))];
  return jours.map((jour) => {
    const dedans = cases.filter((c) => c.jour === jour);
    const mesurables = dedans.filter((c) => c.portion?.kcal != null);
    const somme = mesurables.reduce((n, c) => n + (c.portion!.kcal ?? 0), 0);
    // ⛔ LE BUDGET COUVERT EST LA SOMME DES CIBLES DES CASES DEMANDÉES, pas la
    // cible du jour. `mesure.md` : « Pour une génération partielle, distinguer
    // la cible quotidienne du budget des créneaux couverts. » Un vendredi qui
    // ne porte que son dîner ne doit pas la journée entière.
    const budget = dedans.every((c) => c.contrat?.cibleCaseDimensionnementKcal != null)
      ? dedans.reduce((n, c) => n + (c.contrat!.cibleCaseDimensionnementKcal ?? 0), 0)
      : null;
    const cibleJour = dedans[0]?.contrat?.cibleJourKcal ?? null;
    // ⛔ UNE JOURNÉE À TROU N'EST PAS « EN ÉCART », ELLE EST NON MESURABLE. Sa
    // somme manque une portion ENTIÈRE : publier « −40 % » ferait passer une
    // mesure absente pour de la nourriture absente. Les deux appellent des
    // corrections opposées.
    if (mesurables.length !== dedans.length) {
      return {
        jour,
        date: dedans[0]?.date ?? jour,
        casesAttendues: dedans.length,
        portionsMesurables: mesurables.length,
        kcalSomme: mesurables.length > 0 ? somme : null,
        budgetCouvertKcal: budget,
        cibleJourKcal: cibleJour,
        ecartPct: null,
        etat: "non_mesurable",
        raison: `${dedans.length - mesurables.length} portion(s) non mesurée(s) sur ${dedans.length}`,
      };
    }
    if (budget === null || budget <= 0) {
      return {
        jour,
        date: dedans[0]?.date ?? jour,
        casesAttendues: dedans.length,
        portionsMesurables: mesurables.length,
        kcalSomme: somme,
        budgetCouvertKcal: budget,
        cibleJourKcal: cibleJour,
        ecartPct: null,
        etat: "non_mesurable",
        raison: "aucun budget couvert calculable",
      };
    }
    const ecart = (somme - budget) / budget;
    return {
      jour,
      date: dedans[0]?.date ?? jour,
      casesAttendues: dedans.length,
      portionsMesurables: mesurables.length,
      kcalSomme: somme,
      budgetCouvertKcal: budget,
      cibleJourKcal: cibleJour,
      ecartPct: ecart * 100,
      etat: Math.abs(ecart) <= TOLERANCE_JOUR_COUVERT ? "conforme" : "non_conforme",
      raison: null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ RECETTE ↔ STOCKAGE : la prose affichée contre le nombre qui a bougé
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ AUCUN MATCHER, ET AUCUNE LECTURE DE LA PROSE. « laitue » ≠ « lait », douze
// faux positifs sur douze mesurés : ce dépôt refuse les matchers maison, et
// `readQuantityFromProse` refuse EXPRÈS toute chaîne composite
// (« 360 g de cuisses de poulet désossées » rend `null`). Lire ce texte ici
// serait rouvrir la porte que le produit tient fermée.
//
// ⛔ LA COMPARAISON SE FAIT DONC PAR ÉGALITÉ DE CHAÎNES, contre la RÉPONSE
// BRUTE archivée. Le raisonnement n'a aucune part devinée :
//   · le modèle a écrit un couple (`amount`, `quantity`) cohérent ;
//   · le payload persisté porte un `amount` DIFFÉRENT ;
//   · et la même `quantity`, **caractère pour caractère**.
// ⇒ la prose n'a pas suivi le nombre. C'est un fait, pas une lecture.
//
// ⚠️ CE QUE ÇA NE VOIT PAS, ET IL FAUT LE DIRE : le texte de MÉTHODE. Une
// quantité répétée dans une phrase de recette échappe entièrement à ce
// contrôle, et c'est un trou nommé du lot C.

export interface EcartDeQuantite {
  unite: string;
  ligne: string;
  amountModele: number | null;
  amountPersiste: number | null;
  unite_: string;
  prose: string;
  proseReecrite: boolean;
  facteur: number | null;
}

export interface CensusQuantites {
  lignesRapprochees: number;
  lignesNonRapprochees: string[];
  amountInchange: number;
  amountChangeProseSuivie: number;
  amountChangeProsePerimee: EcartDeQuantite[];
  /** Ce que le lecteur du produit sait relire dans ces proses — le reste est aveugle. */
  proseLisibleParLeProduit: number;
}

function lignesDe(payload: Record<string, unknown>): Map<string, Record<string, unknown>[]> {
  const out = new Map<string, Record<string, unknown>[]>();
  for (const d of (payload.dishes ?? []) as Record<string, unknown>[]) {
    out.set(`plat ${d.day}/${d.slot}`, (d.ingredients ?? []) as Record<string, unknown>[]);
  }
  for (const p of (payload.preparations ?? []) as Record<string, unknown>[]) {
    out.set(`préparation ${p.id}`, (p.ingredients ?? []) as Record<string, unknown>[]);
  }
  return out;
}

export function censusDesQuantites(
  plan: Record<string, unknown>,
  reponseBrute: Record<string, unknown> | null,
): CensusQuantites {
  const out: CensusQuantites = {
    lignesRapprochees: 0,
    lignesNonRapprochees: [],
    amountInchange: 0,
    amountChangeProseSuivie: 0,
    amountChangeProsePerimee: [],
    proseLisibleParLeProduit: 0,
  };
  if (reponseBrute === null) return out;
  const modele = lignesDe(reponseBrute);
  for (const [cle, persistees] of lignesDe(plan)) {
    const brutes = modele.get(cle);
    if (brutes === undefined) {
      out.lignesNonRapprochees.push(`${cle} (absente de la réponse brute)`);
      continue;
    }
    for (const [i, p] of persistees.entries()) {
      const b = brutes[i];
      // ⛔ LE RAPPROCHEMENT EXIGE LE MÊME TERME AU MÊME RANG. Un rang qui a
      // bougé rendrait une comparaison entre deux ingrédients différents ;
      // mieux vaut une abstention COMPTÉE qu'un écart inventé.
      if (b === undefined || String(b.term ?? "") !== String(p.term ?? "")) {
        out.lignesNonRapprochees.push(`${cle} · rang ${i} · « ${String(p.term ?? "?")} »`);
        continue;
      }
      out.lignesRapprochees++;
      if (readQuantityFromProse(p.quantity) !== null) out.proseLisibleParLeProduit++;
      const a0 = Number(b.amount), a1 = Number(p.amount);
      const bouge = Number.isFinite(a0) && Number.isFinite(a1) &&
        a0 > 0 && Math.abs(a1 - a0) / a0 > 0.001;
      if (!bouge) {
        out.amountInchange++;
        continue;
      }
      const q0 = String(b.quantity ?? ""), q1 = String(p.quantity ?? "");
      if (q0 !== q1) {
        out.amountChangeProseSuivie++;
        continue;
      }
      out.amountChangeProsePerimee.push({
        unite: cle,
        ligne: String(p.term ?? "?"),
        amountModele: a0,
        amountPersiste: a1,
        unite_: String(p.unit ?? ""),
        prose: q1,
        proseReecrite: false,
        facteur: a1 / a0,
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ bis ⟳ LOT E — L'ANCIENNE RÈGLE DES ACHATS, GARDÉE COMME TÉMOIN
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ C'EST LE CORPS EXACT retiré de `final_plan_gate.ts` le 2026-09-11 :
// `normalizePantryTerm` des deux côtés, puis une inclusion de chaîne
// ASYMÉTRIQUE (la ligne de courses devait être une SOUS-CHAÎNE de
// l'ingrédient). « tomates » couvrait « tomates cerises » ; « citrons » ne
// couvrait PAS « citron », et c'est le sens que le modèle écrit.
//
// ⛔ IL VIT ICI ET NULLE PART AILLEURS. Le garder dans l'instrument est ce qui
// rend la phrase « les 8 alertes ont disparu » VÉRIFIABLE : sans lui, elle
// porterait sur du code qui n'existe plus.
function ancienCovers(have: string, needle: string): boolean {
  if (!have || !needle) return false;
  if (have === needle) return true;
  return have.length >= 3 && needle.includes(have);
}

export function alertesParLibelle(
  plan: Record<string, unknown>,
): { cause: string; term: string }[] {
  const lignes = (plan.shopping_list ?? []) as Record<string, unknown>[];
  const achats = lignes
    .map((l) => normalizePantryTerm(String(l?.term ?? "")))
    .filter(Boolean);
  const utilises = new Map<string, string>();
  for (const bloc of ["dishes", "preparations"]) {
    for (const d of (plan[bloc] ?? []) as Record<string, unknown>[]) {
      for (const i of (d?.ingredients ?? []) as Record<string, unknown>[]) {
        const cle = normalizePantryTerm(String(i?.term ?? ""));
        if (cle && !utilises.has(cle)) utilises.set(cle, String(i?.term ?? ""));
      }
    }
  }
  const out: { cause: string; term: string }[] = [];
  for (const [cle, ecrit] of [...utilises].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (achats.some((t) => ancienCovers(t, cle))) continue;
    out.push({ cause: "ingredient_not_bought", term: ecrit });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LES PROTÉINES : la quantité mesurée, ET le plancher applicable
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE PLANCHER EXISTE, ET LE RAPPORT DU 2026-09-11 L'AVAIT DÉCLARÉ « NON
// APPLICABLE ». C'est faux : `envelopeFor` rend `proteinFloorG` pour
// `fat_loss` comme pour `muscle_gain`. Ce qui est vrai, c'est que RIEN NE LE
// CONTRÔLE sur ce chemin — une exigence non satisfaite, pas un sujet sans objet.
// On rend donc le plancher ET la mesure, et on nomme l'absence de garde.

export function plancherProteine(b: BoucheFigee, dateMesure: string): {
  proteinFloorG: number;
  proteinPerMealG: number | null;
  source: string;
} | null {
  const bande = ageBandOf(b.ageYears);
  const flag = b.restriction === "raised" || b.restriction === "unreadable";
  const corps = {
    heightCm: b.heightCm,
    weightKg: b.weightKg,
    gender: b.gender,
    ageYears: b.ageYears,
    activityLevel: b.activityLevel,
    activityAxes: b.activityAxes,
    appetite: b.appetite,
  };
  // ⛔ `directed` PASSE PAR SA PROPRE FONCTION DE PRODUCTION, jamais par un
  // objet fabriqué ici : `envelopeDirectionFor` porte le cran, l'écart exécuté
  // et le plancher d'énergie du corps. En écrire un à la main ferait de ce banc
  // le second endroit qui décide d'un déficit.
  const directed = envelopeDirectionFor({
    goal: b.goal as never,
    subject: { body: corps as never, isMinor: b.ageState === "minor" },
    paceKgPerWeek: b.paceKgPerWeek,
    deficitCancelled: false,
  });
  const env = envelopeFor(
    b.goal as never,
    {
      heightCm: b.heightCm,
      ageBand: bande,
      gender: b.gender,
      latestWeight: { weekStart: dateMesure, value: b.weightKg },
      declaredWeightKg: b.weightKg,
      latestWaist: null,
      restrictionFlag: flag,
    } as never,
    bande,
    flag,
    null,
    b.activityLevel as never,
    b.activityAxes as never,
    b.appetite,
    null,
    directed,
  );
  if (env.mode !== "per_kg") return null;
  return {
    proteinFloorG: env.proteinFloorG,
    proteinPerMealG: env.proteinPerMealG,
    source: "meal_envelope.ts::envelopeFor + weight_pace.ts::envelopeDirectionFor " +
      "(fonctions de production, entrées figées)",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LA BOUCHE FIGÉE, LUE DU CONTEXTE — aucune préférence déduite d'un prénom
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ TOUT CE QUI SORT D'ICI VIENT D'UNE COLONNE NOMMÉE. Le plan l'écrit : « Ne
// pas déduire les préférences d'un prénom ou d'un titre de recette. » Le prénom
// n'est rendu que pour l'affichage ; il n'entre dans aucun calcul.

export function boucheDuContexte(ctx: Record<string, unknown>): BoucheFigee {
  const profile = ctx.profile as Record<string, unknown>;
  const goal = ctx.goal as Record<string, unknown>;
  const membre = (ctx.members as Record<string, unknown>[])[0];
  const corps = (ctx.member_bodies as Record<string, unknown>[])[0];
  const grille = (ctx.grille as Record<string, unknown>);
  const contrat = (ctx.contrat_de_calcul as Record<string, unknown>);
  const instant = (ctx.instant as Record<string, unknown>);
  const jourLocal = String(instant.jour_local);
  const jours = (grille.jours as string[]);
  const jourVersDate: Record<string, string> = {};
  const d0 = new Date(`${jourLocal}T00:00:00Z`);
  jours.forEach((j, i) => {
    const d = new Date(d0.getTime() + i * 86_400_000);
    jourVersDate[j] = d.toISOString().slice(0, 10);
  });
  const naissance = new Date(`${String(membre.birth_date)}T00:00:00Z`);
  const ref = new Date(`${jourLocal}T00:00:00Z`);
  let age = ref.getUTCFullYear() - naissance.getUTCFullYear();
  const m = ref.getUTCMonth() - naissance.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < naissance.getUTCDate())) age--;
  const objectif = String(goal.goal);
  return {
    memberId: String(membre.member_id),
    prenom: String(membre.first_name ?? ""),
    weightKg: Number(corps.weight_kg),
    heightCm: Number(corps.height_cm),
    ageYears: age,
    ageBand: ageBandOf(age),
    gender: String(corps.gender) as "male" | "female" | "other",
    goal: objectif,
    direction: objectif === "fat_loss" ? "down" : objectif === "muscle_gain" ? "up" : null,
    paceKgPerWeek: Number(goal.target_pace_kg_per_week),
    appetite: (corps.appetite ?? null) as "small" | "average" | "large" | null,
    activityLevel: (corps.activity_level ?? null) as string | null,
    activityAxes: {
      day: (corps.day_activity ?? null) as string | null,
      sport: (corps.sport_frequency ?? null) as string | null,
      asked: corps.activity_axes_asked_at !== null,
    },
    declaredSlots: ((membre.eating_rhythm ?? []) as { slot: string }[]).map((o) => String(o.slot)),
    lightSlots: (grille.light_slots ?? []) as string[],
    restriction: String(contrat.restriction) as BoucheFigee["restriction"],
    ageState: String(contrat.ageState) as BoucheFigee["ageState"],
    conditionRefs: (contrat.conditionRefs ?? []) as string[],
    coachCounting: String(contrat.coachCounting) as "no_position" | "no_counting",
    grille: grille.cases_par_jour as Record<string, string[]>,
    jourVersDate,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE RAPPORT
// ═══════════════════════════════════════════════════════════════════════════

const n2 = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(2);
const n0 = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : Math.round(v).toString();
const pct = (v: number | null) => v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)} %`;

export interface MesureDUnPlan {
  planId: string;
  requestId: string;
  bouche: BoucheFigee;
  index: TroisIndex;
  contrats: ContratCase[];
  fragmentRefait: string;
  /** ⟳ 2026-09-11 · LOT B — la consigne que le moteur RÉPARÉ enverrait. */
  fragmentRepare: string;
  fragmentArchive: string | null;
  fragmentIdentique: boolean | null;
  portions: PortionMesuree[];
  cases: CaseMesuree[];
  denominateurs: Denominateurs;
  jours: JourMesure[];
  references: CensusReferences;
  quantites: CensusQuantites;
  /**
   * ⟳ LOT C — LE MÊME CONTRÔLE ⑨, REJOUÉ SUR UNE COPIE FINALISÉE.
   *
   * ⛔ LA FIXTURE N'EST PAS TOUCHÉE, ET C'EST LE POINT. `quantites` reste la
   * mesure de CE QUI EST EN BASE le 2026-09-11 — une preuve à préserver.
   * `quantitesApresLotC` dit ce que le moteur d'AUJOURD'HUI écrirait à
   * quantités structurées constantes. Les confondre ferait disparaître le
   * défaut au lieu de montrer sa réparation.
   */
  quantitesApresLotC: CensusQuantites;
  proteine: {
    plancher: ReturnType<typeof plancherProteine>;
    parJour: Record<string, { mesureG: number | null; plancherCouvertG: number | null; part: number | null }>;
  };
  contrefactuel: { ref: string; avant: PortionMesuree[]; apres: PortionMesuree[] };
  courses: { cause: string; term: string; detail: string }[];
  /** ⟳ LOT E — ce que l'ANCIENNE règle de libellés produisait. Le témoin. */
  coursesArchive: { cause: string; term: string }[];
  /** ⟳ LOT E — l'audit par identité, ligne par ligne. */
  coursesAudit: {
    identity: string;
    term: string;
    state: string;
    neededRawG: number | null;
    boughtRawG: number | null;
  }[];
  livraisonEtat: string;
  livraison: Record<string, unknown>;
  temoins: Record<string, unknown>;
}

export async function mesurerUnPlan(
  fx: Fixtures,
  plan: Record<string, unknown>,
): Promise<MesureDUnPlan> {
  const planId = String(plan.id);
  const ctx = fx.contextes.find((c) => String(c.plan_id) === planId);
  if (!ctx) throw new Error(`aucun contexte figé pour le plan ${planId}`);
  const requestId = String(ctx.request_id);
  const bouche = boucheDuContexte(ctx);
  const index = await troisIndex(fx, plan);
  const contrats = contratsParCase(bouche);
  // ⟳ 2026-09-11 · LOT B — DEUX PHRASES, ET ELLES NE DISENT PAS LA MÊME CHOSE.
  // `refait` reproduit CE QUI EST PARTI le 2026-09-11 (grille prise pour
  // rythme) : c'est la seule qui puisse être comparée au prompt archivé.
  // `repare` est ce que le moteur enverrait aujourd'hui.
  const refait = contratTransmis(bouche).fragment;
  const repare = contratRepare(bouche).fragment;

  // ⛔ LA PREUVE DE LA RECONSTRUCTION : la phrase refaite contre la phrase
  // ARCHIVÉE. On cherche la ligne dans le prompt tel qu'il est parti, on ne
  // l'extrait pas par motif — la ligne entière est comparée.
  const prompt = fx.echanges.find(
    (e) => String(e.request_id) === requestId &&
      String(e.source) === "generate-household-meal-v1" &&
      typeof e.user_message === "string" && String(e.user_message).length > 0,
  );
  const texte = String(prompt?.user_message ?? "");
  const archive = texte.includes(refait) ? refait : null;

  const portions = mesurerPortions({ index: index.relecture.index, plan });
  const { cases, denominateurs } = croiser({ bouche, contrats, plan, portions });
  const jours = journeesParPortions(cases);
  const references = censusDesReferences(index.relecture.index, plan);

  const plancher = plancherProteine(bouche, String(plan.starts_on));
  const proteineParJour: Record<
    string,
    { mesureG: number | null; plancherCouvertG: number | null; part: number | null }
  > = {};
  for (const j of jours) {
    const dedans = cases.filter((c) => c.jour === j.jour);
    // ⛔ UNE CASE SANS PORTION N'APPORTE PAS ZÉRO GRAMME DE PROTÉINE, ELLE REND
    // LA JOURNÉE ILLISIBLE. Sommer par-dessus rendrait « 0,0 g » pour un
    // vendredi dont la seule assiette n'est pas mesurée — un faux indémentable.
    const lisible = dedans.every((c) => c.portion !== null && c.portion.proteineG !== null);
    // ⛔ SUR UNE FENÊTRE PARTIELLE, LE PLANCHER SE RÉPARTIT — le plan l'écrit :
    // « allouer le besoin couvert explicitement sans mettre toute la journée
    // protéique sur le dîner ». La part couverte est celle des CIBLES, pas une
    // fraction choisie ici.
    const part = j.budgetCouvertKcal !== null && j.cibleJourKcal !== null && j.cibleJourKcal > 0
      ? Math.min(1, j.budgetCouvertKcal / j.cibleJourKcal)
      : null;
    proteineParJour[j.jour] = {
      mesureG: lisible ? dedans.reduce((n, c) => n + (c.portion?.proteineG ?? 0), 0) : null,
      plancherCouvertG: plancher === null || part === null
        ? null
        : Math.round(plancher.proteinFloorG * part),
      part,
    };
  }

  const brute = fx.echanges.find(
    (e) => String(e.request_id) === requestId &&
      String(e.source) === "generate-household-meal-v1" &&
      String(e.outcome) === "text" && typeof e.output_text === "string",
  );
  let reponseBrute: Record<string, unknown> | null = null;
  try {
    reponseBrute = brute ? JSON.parse(String(brute.output_text)) : null;
  } catch {
    reponseBrute = null;
  }

  // Les alertes de courses, avec le contexte RÉDUIT du rejeu : ce n'est pas une
  // certification de couverture, de sécurité ou de protéines (mêmes limites que
  // `scratchpad/2026-09-11-REVUE-CAMPAGNE/revue.ts`, et c'est dit).
  // ⟳ LOT E (2026-09-11) — L'AUDIT PAR IDENTITÉ, ET L'ARCHIVE DE L'ANCIEN.
  //
  // ⛔ LES DEUX SORTENT ENSEMBLE, comme la colonne « archive » du lot B. Sans
  // l'archive, « les 8 alertes ont disparu » serait une affirmation sur du code
  // retiré, donc invérifiable; sans l'audit, on ne saurait pas si c'est le
  // contrôle qui a été réparé ou débranché.
  const auditCourses = shoppingIdentityAudit({
    index: index.relecture.index,
    plan,
    pantryTerms: [],
  });
  const gate = finalPlanGate(asGatePlan(plan), {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    startsOn: String(plan.starts_on),
    windowDays: Object.keys(bouche.grille),
    mouths: [],
    pantryTerms: [],
    energy: null,
    boxContract: null,
    shopping: auditCourses.rows,
    // ⛔ `null` ET PAS LES CASES MESURÉES: ce rejeu n'a pas les contrats du run
    // (ils ne sont pas persistés), donc aucune cible par case. Les inventer
    // ferait juger le plan contre une cible que le moteur n'a jamais demandée.
    // Le contrôle 1 du rapport, lui, les compare — avec les contrats RECONSTRUITS
    // et en le disant.
    nutrition: null,
    policy: FINAL_GATE_POLICY_LOT_1,
  });

  const gf = (plan.generated_from ?? {}) as Record<string, unknown>;
  const journalSizing = fx.journaux.find(
    (j) => j.tag === "keel.household_meal.portion_sizing" &&
      String(j.user_id) === String(plan.user_id),
  ) ?? {};
  const journalCells = fx.journaux.find(
    (j) => j.tag === "keel.household_meal.cells" && String(j.request_id) === requestId,
  ) ?? {};
  const journalGate = fx.journaux.find(
    (j) => j.tag === "keel.household_meal.final_gate" && String(j.request_id) === requestId,
  ) ?? {};

  return {
    planId,
    requestId,
    bouche,
    index,
    contrats,
    fragmentRefait: refait,
    fragmentRepare: repare,
    fragmentArchive: archive,
    fragmentIdentique: texte === "" ? null : archive !== null,
    portions,
    cases,
    denominateurs,
    jours,
    references,
    quantites: censusDesQuantites(plan, reponseBrute),
    quantitesApresLotC: (() => {
      const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
      finalizeQuantityProse(
        planQuantityLines(
          (copie.dishes ?? []) as { ingredients?: never[] }[],
          (copie.preparations ?? []) as { ingredients?: never[] }[],
        ),
        String(plan.content_locale ?? "").slice(0, 2).toLowerCase() === "fr" ? "fr" : "en",
      );
      return censusDesQuantites(copie, reponseBrute);
    })(),
    proteine: { plancher, parJour: proteineParJour },
    contrefactuel: {
      ref: CONTREFACTUEL_REF,
      avant: portions,
      apres: contrefactuelIdentite({
        index: index.relecture.index,
        plan,
        ref: CONTREFACTUEL_REF,
      }),
    },
    courses: gate.refusals
      .filter((r) =>
        ["ingredient_not_bought", "ingredient_short_bought", "unclassified_perishable"]
          .includes(r.cause)
      )
      .map((r) => ({ cause: r.cause, term: String(r.term ?? ""), detail: String(r.detail ?? "") })),
    coursesArchive: alertesParLibelle(plan),
    coursesAudit: auditCourses.rows.map((r) => ({
      identity: r.identity,
      term: r.displayTerm,
      state: r.state,
      neededRawG: r.neededRawG,
      boughtRawG: r.boughtRawG,
    })),
    livraisonEtat: finalGateDelivery(gate).state,
    livraison: {
      plan_budget: gf.plan_budget ?? null,
      issues: gf.issues ?? null,
      prompt_version: gf.prompt_version ?? null,
      final_gate: journalGate,
    },
    temoins: {
      // Les compteurs du MOTEUR, pour confronter le rejeu à ce que le run a dit.
      portion_sizing: journalSizing,
      cells: journalCells,
      // ⛔ LE TÉMOIN DE L'INDEX DE RELECTURE. `meal-energy-v1` journalise
      // `asked`/`kept` : si le rejeu ne rend pas les mêmes nombres, il ne lit pas
      // le même référentiel que le chemin testé, et rien d'autre ne le dirait.
      reading_index: fx.journaux.find(
        (j) => j.tag === "keel.meal_energy.reading_index" &&
          String(j.user_id) === String(plan.user_id),
      ),
    },
  };
}

/**
 * ⟳ 2026-09-11 · LOT B — EXPORTÉE POUR ÊTRE ÉPROUVÉE. Les avertissements de ce
 * rendu (« loin de la visée », « couloir d'un autre jour ») sont la moitié de
 * l'instrument : un rapport devenu plus optimiste sans explication est
 * exactement ce que le lot 0 existe pour empêcher.
 */
export function rendre(m: MesureDUnPlan): string {
  const L: string[] = [];
  const bar = "═".repeat(78);
  L.push("", bar, `PLAN ${m.planId}  ·  requête ${m.requestId}`, bar);
  L.push(
    `bouche      ${m.bouche.prenom} · ${m.bouche.memberId}`,
    `corps       ${m.bouche.heightCm} cm · ${m.bouche.weightKg} kg · ${m.bouche.gender} · ${m.bouche.ageYears} ans (${m.bouche.ageBand})`,
    `objectif    ${m.bouche.goal} · cran ${m.bouche.paceKgPerWeek} kg/sem · appétit ${m.bouche.appetite}`,
    `grille      ${JSON.stringify(m.bouche.grille)}`,
    `dates       ${JSON.stringify(m.bouche.jourVersDate)}`,
  );

  L.push("", "── BILAN DE LIVRAISON ─────────────────────────────────────");
  const pb = (m.livraison.plan_budget ?? {}) as Record<string, unknown>;
  L.push(
    `livré       oui (ligne écrite)`,
    `durée       ${pb.elapsed_ms} ms · appels modèle ${pb.provider_attempts} · réparations ${pb.repairs_used}/${pb.repairs_allowed}`,
    `prompt      ${m.livraison.prompt_version}`,
    `final_gate  ok=${(m.livraison.final_gate as Record<string, unknown>).ok} · refus ${(m.livraison.final_gate as Record<string, unknown>).refusals} · bloquants ${(m.livraison.final_gate as Record<string, unknown>).blocking}`,
    `⚠️ le gate a reçu energy: null et boxContract: null — son ok=true ne certifie`,
    `   ni les calories, ni les protéines, ni la présence d'une portion par case.`,
  );

  L.push("", "── LES CINQ DÉNOMINATEURS ─────────────────────────────────");
  const d = m.denominateurs;
  L.push(
    `cases attendues      ${d.casesAttendues}   (déduites de la DEMANDE, pas des plats)`,
    `plats présents       ${d.platsPresents}${d.casesSansPlat.length ? `   sans plat : ${d.casesSansPlat.join(", ")}` : ""}`,
    `portions calculées   ${d.portionsCalculees}${d.casesSansPortion.length ? `   sans portion : ${d.casesSansPortion.join(", ")}` : ""}`,
    `portions mesurables  ${d.portionsMesurables}${
      d.portionsNonMesurables.length
        ? `   non mesurables : ${d.portionsNonMesurables.map((x) => `${x.case_} (${x.motif})`).join(", ")}`
        : ""
    }`,
    `portions conformes   ${d.portionsConformes} / ${d.portionsMesurables} mesurables` +
      `   (±${(TOLERANCE_REPAS * 100).toFixed(0)} % par repas)`,
  );
  for (const x of d.portionsNonConformes) L.push(`   ❌ ${x.case_} ${x.ecartPct.toFixed(2)} %`);

  L.push("", "══ 1. CALORIES DU CRÉNEAU ═════════════════════════════════");
  L.push(`tolérance ±${(TOLERANCE_REPAS * 100).toFixed(0)} % — source : ${TOLERANCES_SOURCE}`);
  L.push(
    "date        créneau     cible(dim.)  cible(prompt)   archive  mesuré     écart       état",
  );
  for (const c of m.cases) {
    const cible = c.contrat?.cibleCaseDimensionnementKcal ?? null;
    const prompt = c.contrat?.cibleCaseKcal ?? null;
    const arch = c.contrat?.cibleCaseArchiveKcal ?? null;
    const mes = c.portion?.kcal ?? null;
    const etat = mes === null
      ? (c.portion === null ? "⚪ aucune portion calculée" : `⚪ non mesurable (${c.portion.gap})`)
      : c.ecartKcalPct === null
      ? "⚪ aucune cible"
      : Math.abs(c.ecartKcalPct) <= TOLERANCE_REPAS
      ? "✅ conforme"
      : "❌ NON CONFORME";
    L.push(
      `${c.date}  ${c.slot.padEnd(10)} ${n2(cible).padStart(10)}  ${n2(prompt).padStart(12)}  ` +
        `${n2(arch).padStart(8)}  ${n2(mes).padStart(9)}  ${
          pct(c.ecartKcalPct === null ? null : c.ecartKcalPct * 100).padStart(10)
        }  ${etat}`,
    );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · LOT B — LES DEUX CIBLES SONT DEVENUES UNE, ET ON LE PROUVE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ L'INSTRUMENT NE L'AFFIRME PAS, IL LE COMPARE. « cible(dim.) » et
  // « cible(prompt) » sortent maintenant du MÊME `SlotNutritionContract` ; si
  // une seule case les faisait diverger, la ligne ci-dessous le dirait.
  // « archive » est ce que le tir du 2026-09-11 a réellement envoyé.
  const divergentes = m.cases.filter((c) => {
    const a = c.contrat?.cibleCaseDimensionnementKcal ?? null;
    const b = c.contrat?.cibleCaseKcal ?? null;
    return a !== null && b !== null && Math.abs(a - b) > 0.01;
  });
  const archiveEcarts = m.cases.filter((c) => {
    const a = c.contrat?.cibleCaseDimensionnementKcal ?? null;
    const b = c.contrat?.cibleCaseArchiveKcal ?? null;
    return a !== null && b !== null && Math.abs(a - b) > 0.01;
  });
  L.push(
    divergentes.length === 0
      ? `✅ UNE SEULE CIBLE PAR CASE. Le prompt et le dimensionnement lisent le même`
      : `⛔ ${divergentes.length} CASE(S) À DEUX CIBLES — le défaut du lot B est de retour :`,
  );
  if (divergentes.length === 0) {
    L.push(
      `   \`SlotNutritionContract\` (slot_nutrition_contract.ts), clé personne+date+créneau.`,
    );
  } else {
    for (const c of divergentes) {
      L.push(
        `   ${c.date} ${c.slot} : ${n2(c.contrat?.cibleCaseDimensionnementKcal ?? null)} contre ${
          n2(c.contrat?.cibleCaseKcal ?? null)
        }`,
      );
    }
  }
  if (archiveEcarts.length > 0) {
    L.push(
      `⚠️ ${archiveEcarts.length} CASE(S) ONT ÉTÉ ENVOYÉES AVEC UNE AUTRE CIBLE le 2026-09-11 :`,
    );
    for (const c of archiveEcarts) {
      const a = c.contrat!.cibleCaseDimensionnementKcal!;
      const b = c.contrat!.cibleCaseArchiveKcal!;
      L.push(
        `   ${c.date} ${c.slot} : ${n2(b)} envoyés pour ${n2(a)} à composer — facteur ${
          (b / a).toFixed(2)
        }`,
      );
    }
    L.push(
      `   La grille de ce jour-là servait de rythme. Le rythme déclaré vaut`,
      `   ${JSON.stringify(m.bouche.declaredSlots)} (vide ⇒ les trois repas de la maison).`,
    );
  }

  L.push("", "══ 2. GRAMMAGE DE L'ASSIETTE (par personne) ═══════════════");
  L.push("date        créneau     Gmin   Gpréf   Gmax   servis   état");
  for (const c of m.cases) {
    const k = c.contrat;
    L.push(
      `${c.date}  ${c.slot.padEnd(10)} ${n0(k?.gMin).padStart(5)}  ${n0(k?.gPref).padStart(5)}  ` +
        `${n0(k?.gMax).padStart(5)}  ${n0(c.portion?.grammes ?? null).padStart(6)}   ` +
        (c.masseDansLesBornes === null
          ? "⚪ non mesurable"
          : c.masseDansLesBornes
          ? "✅ dans les bornes"
          : "❌ HORS BORNES"),
    );
  }

  L.push("", "══ 3. INGRÉDIENTS COMPTABILISÉS — LES QUATRE ÉTATS ════════");
  const r = m.references;
  L.push(
    `lignes d'ingrédient                 ${r.lignes}`,
    `① référence vérifiée                ${r.parEtat.reference_verifiee}`,
    `② estimation de groupe              ${r.parEtat.estimation_de_groupe}${
      r.noms.estimation_de_groupe.length ? `  ${[...new Set(r.noms.estimation_de_groupe)].join(", ")}` : ""
    }`,
    `③ en attente de validation          ${r.parEtat.en_attente_de_validation}${
      r.noms.en_attente_de_validation.length ? `  ${[...new Set(r.noms.en_attente_de_validation)].join(", ")}` : ""
    }`,
    `④ ingrédient non mesurable          ${r.parEtat.ingredient_non_mesurable}${
      r.noms.ingredient_non_mesurable.length ? `  ${[...new Set(r.noms.ingredient_non_mesurable)].join(", ")}` : ""
    }`,
    ``,
    `champ « ref » écrit par le modèle   ${r.refEcritParLeModele.avecRef} / ${r.refEcritParLeModele.lignes}`,
    `⛔ CE TAUX N'EST PAS UN TAUX DE VÉRIFICATION : un « ref » écrit peut viser`,
    `   une ligne de modèle. Les quatre états ci-dessus sont les seuls faits.`,
    `⟳ LOT A (2026-09-11) : \`plan_energy_read.ts::readIngredient\` TRANSMET`,
    `   désormais « ref » et « ref_refused ». Avant ce lot il ne les transmettait`,
    `   pas, la mesure repartait du terme français, et ce même plan comptait`,
    `   jusqu'à 2 ingrédients non mesurables avec 49 « ref » sur 49 lignes.`,
    ``,
    `pesés par convention (condiments)   ${[...new Set(r.pesesParConvention)].join(", ") || "—"}`,
    `pesés par la prose                  ${[...new Set(r.pesesParLaProse)].join(", ") || "—"}`,
    `faux amis mordus                    ${[...new Set(r.fauxAmisMordus)].join(", ") || "—"}`,
  );

  L.push("", "── LES TROIS INDEX ────────────────────────────────────────");
  const temoinIndex = m.temoins.reading_index as Record<string, unknown> | undefined;
  L.push(
    `index historique   ${m.index.historique.bySlug.size} lignes · ${m.index.historique.byAlias.size} alias · ` +
      `${m.index.historique.falseFriends?.size ?? 0} faux amis (langue du plan)`,
    `index génération   ${m.index.generation.composables} / ${m.index.generation.total} composables ` +
      `(isComposable) — ${m.index.generation.refusees.length} refusées`,
    `index relecture    +sas : asked ${m.index.relecture.asked} · kept ${m.index.relecture.kept}`,
    temoinIndex === undefined
      ? `⚪ aucun témoin keel.meal_energy.reading_index pour ce compte`
      : `témoin meal-energy-v1 : asked ${temoinIndex.asked} · kept ${temoinIndex.kept}   ` +
        (Number(temoinIndex.asked) === m.index.relecture.asked &&
            Number(temoinIndex.kept) === m.index.relecture.kept
          ? "✅ MÊME INDEX QUE LE CHEMIN TESTÉ"
          : "⚠️ L'INDEX DE RELECTURE NE DEMANDE PLUS AUTANT QUE LE TÉMOIN"),
    ...(temoinIndex !== undefined &&
        (Number(temoinIndex.asked) !== m.index.relecture.asked ||
          Number(temoinIndex.kept) !== m.index.relecture.kept)
      ? [
        `⟳ LOT A (2026-09-11) — LE TÉMOIN EST UN JOURNAL DU RUN, PAS UNE CIBLE.`,
        `   Il dit ce que le moteur a demandé au sas CE JOUR-LÀ, avec le code de ce`,
        `   jour-là. Depuis que « ref » traverse les lecteurs, un terme sans alias`,
        `   français (« pita complète » → pita_wholemeal) se résout sans passer par`,
        `   le sas : le nombre de demandes BAISSE, et l'écart est daté, pas cassé.`,
        `   Ce qui resterait un défaut, c'est l'inverse — demander PLUS que le run.`,
      ]
      : []),
    `⚠️ les règles DIFFÈRENT : la porte de validation vaut à la COMPOSITION, pas`,
    `   à la relecture. Relire avec l'index de génération effacerait la trace du`,
    `   défaut au lieu de la lire.`,
    `⛔ ET LE SAS D'AUJOURD'HUI N'EST PAS CELUI DU RUN. \`grams_raw\` est figé à la`,
    `   génération ; le référentiel et le sas, non. Sur ces deux tirs, le second`,
    `   run a écrit 2 lignes de sas (sas_written: 2) dont le PREMIER n'a pas pu`,
    `   profiter : une relecture d'aujourd'hui peut donc lire un terme que le run`,
    `   a compté inconnu. La portion manquante, elle, reste manquante.`,
  );

  L.push("", "══ 4. COUVERTURE DU PLAN ══════════════════════════════════");
  L.push(
    `attendues ${d.casesAttendues} · plats ${d.platsPresents} · manquantes ${d.casesSansPlat.length}`,
    `témoin moteur (keel.household_meal.cells) : ${JSON.stringify(m.temoins.cells)}`,
  );

  L.push("", "══ 5. COHÉRENCE DE LA JOURNÉE ═════════════════════════════");
  L.push(`tolérance ±${(TOLERANCE_JOUR_COUVERT * 100).toFixed(0)} % sur le PÉRIMÈTRE COUVERT`);
  L.push("date        cases  mesurables  budget couvert  cible du jour  servi      écart       état");
  for (const j of m.jours) {
    L.push(
      `${j.date}  ${String(j.casesAttendues).padStart(5)}  ${String(j.portionsMesurables).padStart(10)}  ` +
        `${n2(j.budgetCouvertKcal).padStart(14)}  ${n2(j.cibleJourKcal).padStart(13)}  ` +
        `${n2(j.kcalSomme).padStart(9)}  ${pct(j.ecartPct).padStart(10)}  ` +
        (j.etat === "conforme" ? "✅ conforme" : j.etat === "non_conforme" ? "❌ NON CONFORME" : `⚪ non mesurable — ${j.raison}`),
    );
  }
  L.push(
    `⛔ LA SOMME EST CELLE DES MÊMES PORTIONS QUE LE CONTRÔLE 1 — boxNutrition, les`,
    `   items écrits. Aucune part conventionnelle n'entre ici.`,
  );

  L.push("", "══ 6. DENSITÉ CALORIQUE ═══════════════════════════════════");
  L.push(
    `consigne refaite : ${m.fragmentRefait.trim() || "—"}`,
    m.fragmentIdentique === null
      ? "⚪ aucun prompt archivé pour cette requête — la reconstruction n'est pas prouvée"
      : m.fragmentIdentique
      ? "✅ PREUVE : cette phrase est présente CARACTÈRE POUR CARACTÈRE dans le prompt archivé."
      : "❌ la phrase refaite ne se retrouve PAS dans le prompt archivé — ne pas interpréter les couloirs ci-dessous.",
  );
  L.push(
    `consigne réparée : ${m.fragmentRepare.trim() || "—"}`,
    m.fragmentRepare === m.fragmentRefait
      ? "⚪ identique à celle du tir : le lot B ne déplace rien sur cette grille."
      : "⟳ LOT B : la consigne a changé — chaque nombre qui bouge est expliqué au rapport.",
  );
  L.push(
    "",
    "date        créneau     couloir du JOUR          couloir TRANSMIS        couloir ARCHIVE         mesuré    état",
  );
  for (const c of m.cases) {
    const dj = c.contrat?.couloirDuJour ?? null;
    const dt = c.contrat?.couloirTransmis ?? null;
    const da = c.contrat?.couloirArchive ?? null;
    const f = (x: typeof dj) =>
      x === null
        ? "—".padEnd(22)
        : `[${n0(x.min)}–${n0(x.max)}] aim ${n0(x.pref)}${x.incompatible ? " ⛔" : ""}`.padEnd(22);
    L.push(
      `${c.date}  ${c.slot.padEnd(10)} ${f(dj)}  ${f(dt === null ? null : { ...dt })}  ` +
        `${f(da === null ? null : { ...da })}  ` +
        `${n0(c.densiteMesuree).padStart(6)}    ` +
        (c.densiteDansLeCouloir === null
          ? (dt?.incompatible ? `⚪ couloir IMPOSSIBLE (${dt.incompatible})` : "⚪ non mesurable")
          : c.densiteDansLeCouloir
          ? "✅ dans le couloir"
          : "❌ HORS COULOIR"),
    );
  }
  // ⟳ 2026-09-11 · LOT B — LA TROISIÈME COLONNE EST LA MÉMOIRE DU DÉFAUT.
  const contamines = m.cases.filter((c) => {
    const dj = c.contrat?.couloirDuJour ?? null;
    const da = c.contrat?.couloirArchive ?? null;
    return dj !== null && da !== null &&
      (dj.min !== da.min || dj.max !== da.max || dj.pref !== da.pref);
  });
  L.push(
    `⛔ « couloir du JOUR » et « couloir TRANSMIS » sortent du MÊME contrat, par`,
    `   sa clé personne+date+créneau. Deux dates ne partagent une ligne que si`,
    `   leurs bandes se croisent ; sinon elles sortent séparées, avec leurs jours.`,
    `« couloir ARCHIVE » est ce que le tir du 2026-09-11 a envoyé, grille prise`,
    `   pour rythme et couloirs repliés par NOM de moment, sans clé de date.`,
  );
  L.push(
    contamines.length === 0
      ? `✅ AUCUNE case ne reçoit un couloir autre que celui de sa date.`
      : `⚠️ ${contamines.length} CASE(S) ont reçu le couloir d'un autre jour le 2026-09-11 :`,
  );
  for (const c of contamines) {
    const dj = c.contrat!.couloirDuJour!;
    const da = c.contrat!.couloirArchive!;
    L.push(
      `   ${c.date} ${c.slot} : [${n0(dj.min)}–${n0(dj.max)}] aim ${n0(dj.pref)} mérité,` +
        ` [${n0(da.min)}–${n0(da.max)}] aim ${n0(da.pref)}${
          da.incompatible ? ` ${da.incompatible}` : ""
        } reçu`,
    );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ « DANS LE COULOIR » N'EST PAS « À LA VISÉE », ET IL FAUT LE DIRE ICI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Les plats de ces deux plans ont été composés sous la consigne du
  // 2026-09-11 — celle qui disait 250. Élargir le couloir APRÈS coup les fait
  // « rentrer » sans qu'un seul gramme ait bougé. Le seul nombre qui décrive
  // encore quelque chose est l'écart à la VISÉE, et il est énorme.
  const loinDeLaVisee = m.cases.filter((c) => {
    const dj = c.contrat?.couloirDuJour ?? null;
    return dj !== null && c.densiteMesuree !== null &&
      c.densiteMesuree > dj.pref * 1.5;
  });
  if (loinDeLaVisee.length > 0) {
    L.push(
      `⛔ ${loinDeLaVisee.length} PORTION(S) « dans le couloir » MAIS À PLUS DE 50 % DE LA VISÉE.`,
      `   Ces plats ont été composés sous la consigne du 2026-09-11 (250 au dîner).`,
      `   Un couloir élargi après coup ne prouve RIEN sur l'obéissance future :`,
    );
    for (const c of loinDeLaVisee) {
      const dj = c.contrat!.couloirDuJour!;
      L.push(
        `   ${c.date} ${c.slot} : ${n0(c.densiteMesuree)} servis pour une visée de ${
          n0(dj.pref)
        } (×${(c.densiteMesuree! / dj.pref).toFixed(2)})`,
      );
    }
  }

  L.push("", "══ 7. CONTRAINTES ALIMENTAIRES ET SÉCURITÉ ════════════════");
  const ctx = m.bouche;
  L.push(
    `allergies déclarées      0 · exclusions 0 · régimes 0 (fixtures de campagne)`,
    `⛔ CE CONTRÔLE NE PROUVE RIEN ICI. Aucune contrainte n'est déclarée sur ces`,
    `   deux fixtures : « aucune violation » ne veut donc pas dire « la ceinture`,
    `   tient », ça veut dire « on ne l'a pas essayée ». Tir n° 6 du lot F.`,
    `   (bouche ${ctx.memberId})`,
  );

  L.push("", "══ 8. PROTÉINES ═══════════════════════════════════════════");
  const pl = m.proteine.plancher;
  L.push(
    pl === null
      ? "⚪ plancher non calculable pour ce corps"
      : `plancher applicable   ${pl.proteinFloorG} g/jour${
        pl.proteinPerMealG === null ? "" : ` · ${pl.proteinPerMealG} g/repas`
      }`,
    pl === null ? "" : `source                ${pl.source}`,
  );
  L.push("date        part couverte  plancher couvert  mesuré     état");
  for (const [j, p] of Object.entries(m.proteine.parJour)) {
    const jour = m.jours.find((x) => x.jour === j);
    L.push(
      `${jour?.date ?? j}  ${(p.part === null ? "—" : `${(p.part * 100).toFixed(0)} %`).padStart(12)}  ` +
        `${n0(p.plancherCouvertG).padStart(16)}  ${(p.mesureG === null ? "—" : `${p.mesureG.toFixed(1)} g`).padStart(9)}  ` +
        (p.mesureG === null
          ? "⚪ non mesurable — une portion de la journée manque"
          : p.plancherCouvertG === null
          ? "⚪ pas de plancher calculable"
          : p.mesureG >= p.plancherCouvertG
          ? "✅ au-dessus du plancher couvert"
          : `❌ SOUS LE PLANCHER COUVERT (−${(100 * (1 - p.mesureG / p.plancherCouvertG)).toFixed(0)} %)`),
    );
  }
  L.push(
    `⛔ CE VERDICT N'EST PAS CELUI DU PRODUIT : aucune garde du dépôt ne compare`,
    `   ces grammes à ce plancher sur ce chemin. C'est une exigence NON`,
    `   SATISFAITE (lot E), pas un sujet non applicable.`,
  );

  L.push("", "══ 9. COHÉRENCE RECETTE ↔ STOCKAGE ════════════════════════");
  const q = m.quantites;
  L.push(
    `lignes rapprochées à la réponse brute   ${q.lignesRapprochees}` +
      (q.lignesNonRapprochees.length ? `   (${q.lignesNonRapprochees.length} non rapprochées)` : ""),
    `  · nombre inchangé                     ${q.amountInchange}`,
    `  · nombre changé, prose réécrite       ${q.amountChangeProseSuivie}`,
    `  · nombre changé, PROSE PÉRIMÉE        ${q.amountChangeProsePerimee.length}`,
  );
  for (const e of q.amountChangeProsePerimee) {
    L.push(
      `    ❌ ${e.unite} · ${e.ligne} : le calcul emploie ${n2(e.amountPersiste)} ${e.unite_}, ` +
        `la personne lit « ${e.prose} »   ×${e.facteur?.toFixed(3)}`,
    );
  }
  const qC = m.quantitesApresLotC;
  L.push(
    `── ce que la FINALISATION du lot C ferme, sur ce même plan ─────────`,
    `  · PROSE PÉRIMÉE après finalisation    ${qC.amountChangeProsePerimee.length}   (avant : ${q.amountChangeProsePerimee.length})`,
    `⚠️ LA FIXTURE N'EST PAS MODIFIÉE : finalizeQuantityProse — la fonction`,
    `   de production — tourne sur une COPIE. Ce nombre dit ce que le moteur`,
    `   d'aujourd'hui écrirait à quantités structurées constantes ; il ne dit`,
    `   rien d'un plan neuf, ni du goût.`,
  );
  for (const e of qC.amountChangeProsePerimee) {
    L.push(`    ❌ RESTE PÉRIMÉ ${e.unite} · ${e.ligne} : « ${e.prose} »`);
  }
  L.push(
    `prose lisible par le lecteur du produit ${q.proseLisibleParLeProduit} / ${q.lignesRapprochees}`,
    `⚠️ AUCUNE PROSE N'EST INTERPRÉTÉE ICI : la comparaison est une ÉGALITÉ DE`,
    `   CHAÎNES contre la réponse brute. Le texte de MÉTHODE, lui, n'est pas`,
    `   contrôlé du tout — trou nommé du lot C.`,
  );

  L.push("", "── CONTREFACTUEL D'IDENTITÉ ───────────────────────────────");
  L.push(`référence rebranchée : ${m.contrefactuel.ref} (quantités inchangées)`);
  let bouge = 0;
  for (const [i, a] of m.contrefactuel.avant.entries()) {
    const b = m.contrefactuel.apres[i];
    if (a.kcal === b.kcal && a.proteineG === b.proteineG && a.gap === b.gap) continue;
    bouge++;
    L.push(
      `  ${a.jour} ${a.slot} · ${a.boxId} : ${n2(a.kcal)} kcal (${a.gap ?? "ok"}) → ` +
        `${n2(b.kcal)} kcal (${b.gap ?? "ok"}) · protéine ${n2(a.proteineG)} → ${n2(b.proteineG)}`,
    );
  }
  if (bouge === 0) {
    L.push(
      `  aucune portion ne bouge — TÉMOIN : ce plan ne porte pas cette référence,`,
      `  et un contrefactuel dont le témoin bougerait mesurerait autre chose.`,
    );
  }

  L.push("", "══ 10. RÉPARATIONS, ACHATS ET LIVRAISON ═══════════════════");
  L.push(`issues : ${JSON.stringify(m.livraison.issues)}`);
  L.push(`état de livraison : ${m.livraisonEtat}`);
  L.push(`alertes de courses rejouées : ${m.courses.length}`);
  for (const c of m.courses) L.push(`   · ${c.cause} « ${c.term} » — ${c.detail}`);
  L.push(
    `── ARCHIVE : ce que l'ANCIENNE règle de libellés produisait (${m.coursesArchive.length}) ──`,
  );
  for (const c of m.coursesArchive) L.push(`   · ${c.cause} « ${c.term} »`);
  L.push(
    `⛔ L'ANCIENNE RÈGLE COMPARAIT DES MOTS (normalizePantryTerm + covers), et`,
    `   son inclusion était ASYMÉTRIQUE : « citrons » ne couvrait pas « citron ».`,
    `   8 de ses 9 alertes du 2026-09-11 étaient fausses. Elle est RETIRÉE ; la`,
    `   colonne ci-dessus la rejoue pour que sa disparition se VOIE.`,
    `── AUDIT PAR IDENTITÉ (${m.coursesAudit.length} identités demandées) ──`,
  );
  const parEtat = new Map<string, number>();
  for (const r of m.coursesAudit) parEtat.set(r.state, (parEtat.get(r.state) ?? 0) + 1);
  for (const [etat, n] of [...parEtat].sort()) L.push(`   ${etat} : ${n}`);
  for (const r of m.coursesAudit.filter((x) => x.state === "short" || x.state === "not_bought")) {
    L.push(`   ⛔ ${r.state} « ${r.term} » (${r.identity}) : ${n2(r.boughtRawG)} g achetés pour ${n2(r.neededRawG)} g requis`);
  }

  return L.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// PROUVÉ / ÉCHOUE / NON MESURABLE — la séparation que `mesure.md` exige
// ═══════════════════════════════════════════════════════════════════════════

export function verdicts(mesures: readonly MesureDUnPlan[]): {
  prouve: string[];
  echoue: string[];
  nonMesurable: string[];
} {
  const prouve: string[] = [], echoue: string[] = [], nonMesurable: string[] = [];
  for (const m of mesures) {
    const n = `${m.bouche.prenom} (${m.planId.slice(0, 8)})`;
    const d = m.denominateurs;
    prouve.push(
      `${n} — ${d.casesAttendues} cases attendues, ${d.platsPresents} plats, ` +
        `${d.portionsCalculees} portions calculées, ${d.portionsMesurables} mesurables, ` +
        `${d.portionsConformes} conformes à ±${(TOLERANCE_REPAS * 100).toFixed(0)} %`,
    );
    if (m.fragmentIdentique === true) {
      prouve.push(`${n} — la consigne de densité refaite est IDENTIQUE au prompt archivé`);
    } else {
      nonMesurable.push(`${n} — consigne de densité non confrontée au prompt archivé`);
    }
    for (const c of d.casesSansPortion) {
      echoue.push(`${n} — case ${c} : plat présent, AUCUNE portion calculée`);
    }
    for (const x of d.portionsNonMesurables) {
      echoue.push(`${n} — case ${x.case_} : portion calculée mais NON mesurable (${x.motif})`);
    }
    for (const x of d.portionsNonConformes) {
      echoue.push(`${n} — case ${x.case_} : ${x.ecartPct.toFixed(2)} % hors tolérance de repas`);
    }
    for (const j of m.jours) {
      if (j.etat === "conforme") {
        prouve.push(`${n} — ${j.date} : ${n2(j.kcalSomme)} kcal contre ${n2(j.budgetCouvertKcal)} couverts (${pct(j.ecartPct)})`);
      } else if (j.etat === "non_conforme") {
        echoue.push(`${n} — ${j.date} : ${pct(j.ecartPct)} hors tolérance de journée`);
      } else {
        nonMesurable.push(`${n} — ${j.date} : ${j.raison}`);
      }
    }
    for (const c of m.cases) {
      if (c.contrat?.couloirTransmis?.incompatible) {
        nonMesurable.push(
          `${n} — ${c.date} ${c.slot} : couloir transmis IMPOSSIBLE (${c.contrat.couloirTransmis.incompatible}) ` +
            `alors que le couloir de CE JOUR est ` +
            (c.contrat.couloirDuJour
              ? `[${n0(c.contrat.couloirDuJour.min)}–${n0(c.contrat.couloirDuJour.max)}]`
              : "—"),
        );
      }
    }
    for (const e of m.quantites.amountChangeProsePerimee) {
      echoue.push(
        `${n} — ${e.unite} · ${e.ligne} : calcul ${n2(e.amountPersiste)} ${e.unite_}, ` +
          `affiché « ${e.prose} » (×${e.facteur?.toFixed(3)})`,
      );
    }
    for (const [j, p] of Object.entries(m.proteine.parJour)) {
      const jour = m.jours.find((x) => x.jour === j);
      const date = jour?.date ?? j;
      if (p.mesureG === null || p.plancherCouvertG === null) {
        nonMesurable.push(`${n} — ${date} : protéine non mesurable sur la journée`);
      } else if (p.mesureG < p.plancherCouvertG) {
        echoue.push(
          `${n} — ${date} : ${p.mesureG.toFixed(1)} g de protéine contre ` +
            `${p.plancherCouvertG} g de plancher couvert`,
        );
      } else {
        prouve.push(
          `${n} — ${date} : ${p.mesureG.toFixed(1)} g de protéine, plancher couvert ${p.plancherCouvertG} g`,
        );
      }
    }
    const cf = m.contrefactuel.avant
      .map((a, i) => [a, m.contrefactuel.apres[i]] as const)
      .filter(([a, b]) => a.kcal !== b.kcal);
    for (const [a, b] of cf) {
      prouve.push(
        `${n} — contrefactuel ${m.contrefactuel.ref} · ${a.jour} ${a.slot} : ` +
          `${n2(a.kcal)} (${a.gap ?? "ok"}) → ${n2(b.kcal)} kcal à quantités constantes`,
      );
    }
    nonMesurable.push(`${n} — contraintes alimentaires : aucune déclarée sur cette fixture`);
    nonMesurable.push(`${n} — goût, texture, faisabilité : aucune dégustation, aucun test de cuisine`);
  }
  return { prouve, echoue, nonMesurable };
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ENTRÉE
// ═══════════════════════════════════════════════════════════════════════════

if (import.meta.main) {
  const args = Deno.args.filter((a) => !a.startsWith("--"));
  const json = Deno.args.includes("--json");
  const racine = args[0] ?? "scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures";
  const fx = await chargerFixtures(racine);
  const mesures: MesureDUnPlan[] = [];
  for (const plan of fx.plans) mesures.push(await mesurerUnPlan(fx, plan));
  if (json) {
    console.log(JSON.stringify(
      mesures.map((m) => ({
        ...m,
        index: {
          historique: { lignes: m.index.historique.bySlug.size },
          generation: m.index.generation,
          relecture: { asked: m.index.relecture.asked, kept: m.index.relecture.kept },
        },
      })),
      (_k, v) => v instanceof Map ? [...v] : v,
      2,
    ));
  } else {
    for (const m of mesures) console.log(rendre(m));
    const v = verdicts(mesures);
    console.log("\n" + "═".repeat(78));
    console.log("PROUVÉ / ÉCHOUE / NON MESURABLE");
    console.log("═".repeat(78));
    console.log(`\n── PROUVÉ (${v.prouve.length}) ──`);
    for (const x of v.prouve) console.log(`  ✅ ${x}`);
    console.log(`\n── ÉCHOUE (${v.echoue.length}) ──`);
    for (const x of v.echoue) console.log(`  ❌ ${x}`);
    console.log(`\n── NON MESURABLE (${v.nonMesurable.length}) ──`);
    for (const x of v.nonMesurable) console.log(`  ⚪ ${x}`);
  }
}
