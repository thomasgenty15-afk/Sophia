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
import { slotContractSentence } from "../supabase/functions/_shared/keel/slot_contract_brief.ts";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  resolveCompositionLine,
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
// ⟳ 2026-09-11 · C0 — LES APPORTS FIXES PASSENT PAR LEUR CHAÎNE DE PRODUCTION.
// ⛔ `parseFixedIntakes` PUIS `fixedIntakeSlotKcal`, exactement comme le
// handler (`generate-household-meal-v1/index.ts:6417`). Un banc qui poserait
// `fixedKcalBySlot: null` en dur mesurerait un tir qui n'a pas eu lieu : le
// tir n° 5 déclarait 200 g de yaourt grec au petit-déjeuner et l'instrument
// comparait sa portion à la cible d'un tir SANS apport fixe.
import { parseFixedIntakes } from "../supabase/functions/_shared/keel/fixed_intakes.ts";
import { fixedIntakeSlotKcal } from "../supabase/functions/_shared/keel/slot_fixed_kcal.ts";
import {
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
} from "../supabase/functions/_shared/keel/household_meal_generation.ts";
import {
  type Envelope,
  envelopeFor,
  type MouthBody,
} from "../supabase/functions/_shared/keel/meal_envelope.ts";
// ⟳ 2026-09-13 · § 2.3 — LA PORTE DE PRODUCTION DE L'ENVELOPPE D'UNE BOUCHE.
// ⛔ Elle décide de l'ORDRE entre le compte et la fiche, et c'est elle qui fait
// qu'une fiche n'achète qu'un entretien. L'instrument qui la contournait
// servait à Lea le barème protéique de `fat_loss` que le produit ne lui a
// jamais appliqué.
import { mouthEnvelope } from "../supabase/functions/_shared/keel/household_composition.ts";
import { envelopeDirectionFor } from "../supabase/functions/_shared/keel/weight_pace.ts";
import { ageBandOf } from "../supabase/functions/_shared/keel/student_age.ts";
import { readQuantityFromProse } from "../supabase/functions/_shared/keel/quantity_from_prose.ts";
// ⟳ LOT C (2026-09-11) — LA FONCTION DE PRODUCTION, JAMAIS UN REJEU MAISON.
// Le lot 0 l'exige: « ne pas recoder les équations dans le script du banc ».
// L'instrument applique donc `finalizeQuantityProse` à une COPIE du plan et
// rejoue son propre contrôle ⑨ dessus — les fixtures ne bougent pas.
import {
  finalizePlanQuantities,
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
  /**
   * ⟳ 2026-09-13 · § 2.3 — CETTE BOUCHE A-T-ELLE UN COMPTE.
   *
   * ⛔ C'EST UNE ENTRÉE DU CALCUL, PLUS SEULEMENT UNE LECTURE D'OBJECTIF.
   * `boucheDuContexte` la connaissait déjà (elle choisit la colonne d'objectif
   * avec) et la jetait. Sans elle, l'instrument ne pouvait pas reproduire la
   * condition de l'appelant de production, qui refuse une enveloppe de COMPTE
   * à une bouche qui n'en a pas — et c'est cette condition qui fait qu'une
   * fiche n'achète qu'un entretien.
   *
   * ⚠️ `restriction === "no_account"` NE LA REMPLACE PAS : ce jeton-là décrit
   * la lisibilité du plancher TCA, et le confondre avec « pas de compte »
   * ferait dépendre un barème protéique d'un champ de sécurité.
   */
  aUnCompte: boolean;
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
  /**
   * ⟳ 2026-09-11 · C0 — LES APPORTS FIXES DE **CETTE** BOUCHE, BRUTS.
   *
   * ⛔ LA LIGNE DE TABLE TELLE QU'ELLE EST, jamais une somme déjà faite ici.
   * `parseFixedIntakes` la lit, `fixedIntakeSlotKcal` la pèse contre le
   * référentiel — les deux fonctions du produit. `[]` veut dire « rien de
   * déclaré » ; ce n'est pas la même chose que `null`, qui voudrait dire
   * « personne n'a regardé », et l'instrument ne doit jamais les confondre.
   */
  fixedIntakesRaw: unknown;
  /**
   * ⟳ 2026-09-11 · C0 — LES ALLERGIES DÉCLARÉES DE CETTE BOUCHE.
   *
   * ⛔ LE RENDU DISAIT « allergies déclarées 0 » EN DUR, et c'était vrai des
   * deux fixtures du lot 0 et FAUX du tir n° 6, qui en portait une, écrite en
   * base par la RPC du produit. Un contrôle qui imprime toujours le même zéro
   * ne distingue pas « rien de déclaré » de « on n'a pas regardé » — la faute
   * exacte que la ligne d'à côté dénonce.
   *
   * ⚠️ CE CHAMP NE PROUVE TOUJOURS RIEN DE LA CEINTURE. Il dit ce qui était
   * déclaré ; « la ceinture tient » demande un compteur d'armement du run, que
   * le tir n° 6 n'a pas émis (`exclusion_belt` absent, `regime_belt.mouths 0`).
   */
  allergies: string[];
}

/** `jeton de jour` → (`moment` → kcal déjà avalées). */
export type FixedKcalParJour = ReadonlyMap<string, ReadonlyMap<string, number>>;

/**
 * LES APPORTS FIXES D'UNE BOUCHE, PESÉS JOUR PAR JOUR — chaîne du produit.
 *
 * ⛔ LE MÊME ORDRE QUE LE HANDLER, ET C'EST VÉRIFIABLE :
 * `generate-household-meal-v1/index.ts:6417` fait `fixedIntakeSlotKcal({index,
 * intakes, dayToken})` par jour de la grille, puis le passe à `ContractDay`.
 * Un second calcul ici rendrait une deuxième cible pour la même case.
 *
 * ⚠️ CE QU'ON COMPTE EN PLUS : les apports ILLISIBLES et les apports SANS
 * moment. Les premiers retranchent zéro, les seconds ne se retranchent jamais.
 * Un banc qui les tairait rendrait « aucun apport » et « un apport perdu »
 * identiques.
 */
export function apportsFixesParJour(args: {
  index: CompositionIndex;
  bouche: BoucheFigee;
}): {
  parJour: Map<string, ReadonlyMap<string, number>>;
  declares: number;
  illisibles: number;
  sansMoment: number;
  kcalSansMoment: number;
} {
  const parse = parseFixedIntakes(args.bouche.fixedIntakesRaw);
  const parJour = new Map<string, ReadonlyMap<string, number>>();
  let illisibles = 0, sansMoment = 0, kcalSansMoment = 0;
  for (const jourToken of Object.keys(args.bouche.grille)) {
    const out = fixedIntakeSlotKcal({
      index: args.index,
      intakes: parse.intakes,
      dayToken: jourToken,
    });
    parJour.set(jourToken, out.bySlot);
    illisibles += out.counts.unresolved;
    sansMoment += out.counts.loose;
    kcalSansMoment += out.looseKcal;
  }
  return {
    parJour,
    declares: parse.intakes.length,
    illisibles,
    sansMoment,
    kcalSansMoment,
  };
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

/**
 * Les journées de la grille, avec leur date locale.
 *
 * ⟳ 2026-09-11 · C0 — `fixedKcalBySlot` N'EST PLUS `null` EN DUR.
 * ⛔ `null` était vrai des deux fixtures du lot 0 (`fixed_intakes: []`) et FAUX
 * du tir n° 5 de la campagne, qui déclarait 200 g de yaourt grec au
 * petit-déjeuner. L'instrument comparait donc cette case à 613,50 kcal, la
 * cible d'un tir sans apport fixe. `null` reste la réponse quand rien n'est
 * déclaré — mais c'est l'appelant qui le dit, pas cette fonction.
 * ⚠️ `lockedSlots: []` EST LA MÊME DÉCISION QUE LE HANDLER : les cases qu'un
 * apport fixe couvre entièrement sont verrouillées par `slotContractsFor`
 * lui-même, jamais d'office par l'appelant.
 */
function joursDe(b: BoucheFigee, fixe: FixedKcalParJour | null) {
  return Object.entries(b.grille).map(([jourToken, slots]) => ({
    dayToken: jourToken,
    date: b.jourVersDate[jourToken] ?? jourToken,
    coveredSlots: slots,
    lockedSlots: [] as readonly string[],
    fixedKcalBySlot: fixe?.get(jourToken) ?? null,
    // ⟳ 2026-09-23 — `ContractDay.sides` est REQUIS. `null` rend le contrat
    // d'avant les à-côtés, identique à l'octet (flux B): l'instrument refait
    // le comportement du 2026-09-11, où aucun à-côté n'existait.
    sides: null,
  }));
}

/**
 * LE CONTRAT RÉPARÉ — celui du lot B : le RYTHME ALIMENTAIRE au dénominateur.
 */
export function contratRepare(b: BoucheFigee, fixe: FixedKcalParJour | null = null) {
  const set = slotContractsFor({
    mouth: bouchePour(b) as never,
    coachCounting: b.coachCounting,
    rhythmSlots: b.declaredSlots,
    days: joursDe(b, fixe),
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
export function contratTransmis(b: BoucheFigee, fixe: FixedKcalParJour | null = null) {
  const set = mergeSlotContractSets(
    joursDe(b, fixe).map((d) =>
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

export function contratsParCase(
  b: BoucheFigee,
  fixe: FixedKcalParJour | null = null,
): ContratCase[] {
  const jour = dayTargetFor(bouchePour(b) as never, b.coachCounting);
  const repare = contratRepare(b, fixe);
  const archive = contratTransmis(b, fixe);
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
  /**
   * ⟳ 2026-09-13 · LOT 2 §1 — COMBIEN DE NOMS SONT SUR LE COUVERCLE.
   *
   * `1` = une pesée nominative. `>1` = un bac de groupe : ses grammes et ses
   * kcal décrivent le RÉCIPIENT, pas une assiette. Ce nombre doit voyager avec
   * la mesure, sinon les deux se confondent — et c'est exactement ce qui est
   * arrivé (voir `partDeLaBouche` juste en dessous).
   */
  partageAvec: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 §1 — LE BAC DE GROUPE N'EST PAS UNE ASSIETTE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉSACCORD, ET SA MESURE ────────────────────────────────────────────
// Sur `perte-l3d04` (`fri/dinner`), l'instrument publiait pour Lea
// « cible 639,10 · mesuré 2840,75 · +344,49 % », et le même écart, au même
// facteur, sur 21 cases et trois bouches. Le moteur, dans sa consigne archivée
// pour la MÊME case, écrit : « the dinner dish carries **947 kcal in one
// serving** and it must carry 639 kcal ».
//
// Les deux sont exacts, sur deux bases différentes :
//   · `boxNutrition` rend CE QUE LE RÉCIPIENT CONTIENT. Son propre commentaire
//     le dit : « un nombre par contenant, quel que soit le nombre de noms sur
//     son couvercle […] il ne se divise pas par le nombre de mangeurs ».
//     2 840,75 kcal pour 1 123 g, c'est le bac de Lea + Nils + Iris.
//   · 2 840,75 / 3 = **946,92** — le 947 du moteur, au dixième près.
//
// ── QUI A RAISON ──────────────────────────────────────────────────────────
// Le moteur. La convention de production est écrite et elle a un seul lieu :
// `final_plan_audit.ts::cellNutritionTable` (l. 851-860) fait
// `share = box.kcal / eaters`, `grams / eaters`, `proteinG / eaters`, et garde
// `sharedWith` à côté — « une case à `sharedWith > 1` porte une estimation, pas
// une pesée nominative ». `cellStateOf` juge ensuite cette PART contre la cible
// de la bouche, exactement comme une portion nominative.
//
// L'instrument, lui, indexait la sortie brute de `boxNutrition` sans diviser :
// il comparait un bac de trois à la cible d'une. Ce n'est pas un moteur qui se
// trompe de 344 %, c'est une division qui n'avait pas lieu DANS L'INSTRUMENT.
//
// ⛔ CE QUI N'EST **PAS** CORRIGÉ ICI, ET POURQUOI. `boxNutrition` reste ce
// qu'elle est ; `mesurerPortions` continue de rendre le CONTENANT. La division
// se fait à l'endroit — et au seul endroit — où l'on passe du récipient à la
// personne : `croiser`, qui compare à une cible individuelle.
//
// ⚠️ LA DENSITÉ NE BOUGE PAS, ET C'EST LA CONTRE-ÉPREUVE. kcal/g est invariant
// par division : si ce correctif déplaçait un couloir de densité, il ferait
// autre chose que ce qu'il annonce.

/**
 * LA PART D'UNE BOUCHE SUR UN CONTENANT — la convention de production, et elle
 * seule (`final_plan_audit.ts::cellNutritionTable`).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function partDeLaBouche(p: PortionMesuree): PortionMesuree {
  const mangeurs = Math.max(1, p.memberIds.length);
  if (mangeurs === 1) return p;
  return {
    ...p,
    grammes: p.grammes / mangeurs,
    kcal: p.kcal === null ? null : p.kcal / mangeurs,
    proteineG: p.proteineG === null ? null : p.proteineG / mangeurs,
    partageAvec: mangeurs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 — UNE PERSONNE PEUT AVOIR DEUX CONTENANTS SUR LA MÊME CASE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT, MESURÉ. L'index était une `Map` par `jour/slot` : le DERNIER
// contenant écrasait le précédent. Sur une case COMPLÉTÉE — une part du plat
// commun PLUS un petit plat à son nom — l'instrument ne lisait que le
// complément (9 g, 2 kcal) et déclarait la case non conforme, alors que le plan
// écrit portait bien les deux boîtes et 563,6 kcal.
//
// ⚠️ MÊME DOCTRINE QUE `plan_energy.ts` SUR L'ABSTENTION : un seul contenant
// non mesurable éteint la case. Additionner les mesurables et ignorer l'autre
// rendrait une somme amputée qui a l'air d'un résultat.
//
// ⚠️ `partageAvec` GARDE LE MAXIMUM : si l'une des parts est un bac de groupe,
// la case porte une ESTIMATION, et ça ne se dilue pas en additionnant une part
// nominative à côté.
export function fusionnerParts(
  parts: readonly PortionMesuree[],
): PortionMesuree | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const nonMesurable = parts.find((p) => p.kcal === null) ?? null;
  return {
    boxId: parts.map((p) => p.boxId).join("+"),
    memberIds: parts[0].memberIds,
    jour: parts[0].jour,
    slot: parts[0].slot,
    titre: parts.map((p) => p.titre).join(" + "),
    grammes: parts.reduce((n, p) => n + p.grammes, 0),
    kcal: nonMesurable !== null
      ? null
      : parts.reduce((n, p) => n + (p.kcal ?? 0), 0),
    proteineG: parts.some((p) => p.proteineG === null)
      ? null
      : parts.reduce((n, p) => n + (p.proteineG ?? 0), 0),
    gap: nonMesurable?.gap ?? null,
    partageAvec: Math.max(...parts.map((p) => p.partageAvec)),
  };
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
    // ⛔ `1` ICI, TOUJOURS : c'est le CONTENANT qui sort de cette fonction, pas
    // une part. La division vit dans `partDeLaBouche`, appelée par `croiser`.
    partageAvec: 1,
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
  /**
   * ⟳ 2026-09-11 · C0 — LES CONTENANTS DU PLAN QUI NE SONT PAS DE CETTE BOUCHE.
   *
   * ⛔ LE DÉFAUT QUE CE COMPTEUR FERME, MESURÉ AU TIR N° 6. Le plan portait
   * **12 contenants pour 2 bouches** ; l'instrument indexait les portions par
   * `jour/moment` seul, donc le second contenant écrasait le premier et
   * « 12 parts présentes » se lisait « 6 conformes sur 6 ». Six parts n'étaient
   * ni mesurées ni comptées. Ici chaque bouche ne voit QUE ses contenants, et
   * ce nombre dit combien appartiennent à quelqu'un d'autre.
   */
  portionsAutresBouches: number;
  /**
   * ⟳ 2026-09-13 · LOT 2 §1 — LES CASES JUGÉES SUR UNE **PART**, PAS SUR UNE
   * PESÉE. Un bac à plusieurs noms est divisé par le nombre de mangeurs
   * (convention de `final_plan_audit.ts::cellNutritionTable`) ; ce compteur dit
   * combien de cases de cette bouche sont dans ce cas. À 0, tout ce qui suit
   * est nominatif.
   */
  portionsPartagees: number;
  /**
   * Les contenants que ce plan n'attribue à PERSONNE (`member_ids` vide).
   *
   * ⚠️ CE N'EST PAS « zéro autre bouche ». Les deux plans figés du lot 0 sont
   * dans ce cas : une seule bouche, aucun contenant nominatif. L'instrument les
   * rattache alors à la bouche mesurée — et le COMPTE, pour qu'un plan de foyer
   * qui perdrait ses attributions ne ressemble jamais à un plan solo.
   */
  portionsSansBouche: number;
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
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · C0 — UNE PORTION APPARTIENT À UNE BOUCHE, ET ON LA FILTRE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ AVANT : `portionPar.set(jour/slot, p)` sur TOUS les contenants. Au tir
  // n° 6 (deux bouches, 12 contenants) le second écrasait le premier : la
  // mesure décrivait une bouche et se publiait comme « 6 / 6 conformes » pour
  // un plan qui en servait douze. Le plan de clôture l'écrit : « ne pas
  // assimiler douze portions présentes à douze portions conformes lorsque
  // seules six ont été mesurées ».
  //
  // ⚠️ LE REPLI EST COMPTÉ, JAMAIS SILENCIEUX. Un contenant sans `member_ids`
  // (les deux plans figés du lot 0 sont dans ce cas) est rattaché à la bouche
  // mesurée — sinon un plan solo ancien deviendrait subitement vide — et
  // `portionsSansBouche` dit combien de fois ce repli a servi.
  const partsPar = new Map<string, PortionMesuree[]>();
  const pousser = (cle: string, p: PortionMesuree): void => {
    const deja = partsPar.get(cle) ?? [];
    deja.push(p);
    partsPar.set(cle, deja);
  };
  let portionsAutresBouches = 0, portionsSansBouche = 0;
  for (const p of args.portions) {
    if (p.memberIds.length === 0) {
      portionsSansBouche++;
      pousser(`${p.jour}/${p.slot}`, p);
      continue;
    }
    if (!p.memberIds.includes(args.bouche.memberId)) {
      portionsAutresBouches++;
      continue;
    }
    // ⛔ ICI, ET SEULEMENT ICI, ON PASSE DU RÉCIPIENT À LA PERSONNE — voir le
    // bloc §1 au-dessus de `partDeLaBouche`. Sans cette ligne, un bac de trois
    // était comparé à la cible d'une : +344 % sur 21 cases, mesuré.
    //
    // ⟳ 2026-09-13 — ET ON ACCUMULE : `.set()` écrasait, donc une case
    // complétée (part commune + petit plat) ne rendait que le petit plat.
    pousser(`${p.jour}/${p.slot}`, partDeLaBouche(p));
  }

  const cases: CaseMesuree[] = [];
  const casesSansPlat: string[] = [];
  const casesSansPortion: string[] = [];
  const portionsNonMesurables: { case_: string; motif: string }[] = [];
  const portionsNonConformes: { case_: string; ecartPct: number }[] = [];
  let platsPresents = 0, portionsCalculees = 0, portionsMesurables = 0, portionsConformes = 0;
  let portionsPartagees = 0;

  for (const [jour, slots] of Object.entries(args.bouche.grille)) {
    for (const slot of slots) {
      const cle = `${jour}/${slot}`;
      const contrat = args.contrats.find((c) => c.jour === jour && c.slot === slot) ?? null;
      const plat = platPar.get(cle) ?? null;
      // ⟳ 2026-09-13 — TOUS les contenants de cette bouche sur cette case.
      const portion = fusionnerParts(partsPar.get(cle) ?? []);
      if (plat !== null) platsPresents++;
      else casesSansPlat.push(cle);
      if (portion !== null) portionsCalculees++;
      else casesSansPortion.push(cle);
      if (portion !== null && portion.partageAvec > 1) portionsPartagees++;

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
      portionsAutresBouches,
      portionsPartagees,
      portionsSansBouche,
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

/**
 * PAR OÙ LA CIBLE EST VENUE — ou pourquoi il n'y en a pas. ⛔ VOCABULAIRE
 * FERMÉ : une absence NOMMÉE se répare, une absence muette se confond avec un
 * zéro. C'est la même doctrine que `PROTEIN_BRIEF_SILENCES` du produit.
 */
export type BrancheEnveloppe =
  /** `envelopeFor` sur la série de pesées d'un COMPTE : l'objectif s'applique. */
  | "compte"
  /** `maintenanceEnvelopeFromBody` : la FICHE, qui n'achète qu'un entretien. */
  | "fiche_entretien"
  /** `childEnvelopeFromBody` : la fiche d'un mineur, maintenance pédiatrique. */
  | "fiche_pediatrique"
  /** Enveloppe `per_portion` : plancher TCA, ou corps illisible. Aucun chiffre. */
  | "protegee"
  /** `mouthEnvelope` rend `null` sur un âge inconnu : ni adulte ni enfant. */
  | "age_inconnu"
  /** Ni poids, ni bande d'âge : `maintenanceEnvelopeFromBody` rend `null`. */
  | "corps_insuffisant";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ENVELOPPE DE CETTE BOUCHE — PAR LA PORTE DU PRODUIT, ET PAR ELLE SEULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⟳ 2026-09-13 · § 2.3 — CE QUE CETTE FONCTION RÉPARE, AVEC SON CHIFFRE.
 *
 * L'instrument fabriquait `latestWeight: {value: poidsDeLaFiche}` et appelait
 * `envelopeFor` avec l'objectif écrit sur la ligne. Le produit ne fait ça NULLE
 * PART pour une bouche sans compte : `household_bodies.ts` (l. 350) pose
 * délibérément `latestWeight: null` — « une fiche n'est pas une série » — et
 * l'appelant de `generate-household-meal-v1` (l. 3999) ne construit AUCUNE
 * enveloppe de compte quand `!m.userId`. La bouche retombe donc sur
 * `mouthEnvelope` → `maintenanceEnvelopeFromBody`, qui écrit `maintenance`
 * DANS SON CORPS et n'accepte pas de jeton d'objectif : la fiche n'achète
 * aucun objectif.
 *
 * Mesuré sur Lea (58 kg, sans compte, `fat_loss` écrit sur sa fiche) :
 * l'instrument annonçait **116 g/jour** (2,0 g/kg, le barème de `fat_loss`) ;
 * le produit en dit **93** (1,6 g/kg, le barème de `maintenance`) — et le
 * prompt archivé de `lot3b-reference` porte « 23 g … 37 g … 33 g », soit 93.
 *
 * ⛔ AUCUN BARÈME N'EST TOUCHÉ ICI, ET AUCUN SEUIL N'EST CHOISI. Ce sont les
 * deux MÊMES fonctions que le moteur qui rendent le nombre ; ce qui change est
 * la PORTE par laquelle on entre.
 */
export function enveloppeDeLaBouche(b: BoucheFigee, dateMesure: string): {
  env: Envelope | null;
  branche: BrancheEnveloppe;
} {
  const bande = ageBandOf(b.ageYears);
  const flag = b.restriction === "raised" || b.restriction === "unreadable";
  // Le corps de la FICHE, à la forme que `mouthEnvelope` attend. C'est le même
  // objet que celui donné à `envelopeDirectionFor` : une seule lecture.
  const corps: MouthBody = {
    heightCm: b.heightCm,
    weightKg: b.weightKg,
    gender: b.gender,
    ageYears: b.ageYears,
    activityLevel: b.activityLevel as MouthBody["activityLevel"],
    activityAxes: b.activityAxes as MouthBody["activityAxes"],
    appetite: b.appetite,
  };
  // ══════════════════════════════════════════════════════════════════════
  // ① L'ENVELOPPE DE COMPTE — LA MÊME CONDITION QUE L'APPELANT, RECOPIÉE
  // ══════════════════════════════════════════════════════════════════════
  //
  // `generate-household-meal-v1/index.ts` l. 3999 :
  //     gatedGoal === null || m.body === null ||
  //         (!m.userId && m.body.restrictionFlag !== true)
  //       ? null : envelopeFor(...)
  //
  // ⛔ LES TROIS CAUSES SONT GARDÉES, ET LA TROISIÈME EST CELLE DU LOT :
  // une bouche SANS compte ne produit pas d'enveloppe de compte — sauf si sa
  // fiche portait un plancher levé, qui repasserait par la branche dégradée.
  //
  // ⚠️ `b.goal === ""` EST LA PREMIÈRE CAUSE, ET ELLE NE S'ABSTIENT PLUS :
  // sans objectif, on n'entre pas dans `envelopeFor` (c'est ce qui rendait
  // `proteinFloorG: NaN` sur le tir n° 6), mais la bouche descend quand même
  // vers la fiche — exactement comme le produit, qui sert alors un entretien.
  const objectif = b.goal.trim();
  const enveloppeDeCompte = objectif === "" || (!b.aUnCompte && flag !== true)
    ? null
    : envelopeFor(
      objectif as never,
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
      // ⛔ `directed` PASSE PAR SA PROPRE FONCTION DE PRODUCTION, jamais par un
      // objet fabriqué ici : `envelopeDirectionFor` porte le cran, l'écart
      // exécuté et le plancher d'énergie du corps. En écrire un à la main ferait
      // de ce banc le second endroit qui décide d'un déficit.
      envelopeDirectionFor({
        goal: objectif as never,
        subject: { body: corps as never, isMinor: b.ageState === "minor" },
        paceKgPerWeek: b.paceKgPerWeek,
        deficitCancelled: false,
      }),
      // ⟳ 2026-09-23 — l'âge exact (11ᵉ argument, REQUIS). `null` = le milieu
      // de la tranche, la règle du 2026-09-11 que ce banc rejoue.
      null,
    );
  // ══════════════════════════════════════════════════════════════════════
  // ② LA PORTE UNIQUE — `mouthEnvelope`, jamais une seconde règle d'ordre
  // ══════════════════════════════════════════════════════════════════════
  const env = mouthEnvelope({
    ageState: b.ageState,
    accountEnvelope: enveloppeDeCompte,
    lineBody: corps,
    // ⟳ 2026-09-23 — REQUIS. `null` = le plancher de protéines de la
    // maintenance pour une bouche sans compte: l'enveloppe du 2026-09-11.
    lineProteinGoal: null,
  });
  const branche: BrancheEnveloppe = enveloppeDeCompte !== null
    ? (enveloppeDeCompte.mode === "per_portion" ? "protegee" : "compte")
    : env === null
    ? (b.ageState === "unknown" ? "age_inconnu" : "corps_insuffisant")
    : env.mode === "per_portion"
    ? "protegee"
    : b.ageState === "minor"
    ? "fiche_pediatrique"
    : "fiche_entretien";
  return { env, branche };
}

export function plancherProteine(b: BoucheFigee, dateMesure: string): {
  proteinFloorG: number;
  proteinPerMealG: number | null;
  /** Par où la cible est venue. Le rendu l'imprime : un nombre sans sa porte
   * ne se relit pas. */
  branche: BrancheEnveloppe;
  source: string;
} | null {
  // ⛔ UNE SEULE CHAÎNE, APPELÉE — jamais recalculée. `enveloppeDeLaBouche` est
  // pure et déterministe : l'appeler deux fois sur la même bouche ne peut pas
  // diverger, et c'est la seule raison pour laquelle le rendu peut demander la
  // branche de son côté.
  const { env, branche } = enveloppeDeLaBouche(b, dateMesure);
  if (env === null) return null;
  if (env.mode !== "per_kg") return null;
  // ⚠️ LA CEINTURE DU NaN RESTE SOUS TOUT LE RESTE : une enveloppe dont les
  // nombres ne sont pas finis s'abstient. Un plancher qu'on ne sait pas
  // calculer reste INCONNU, jamais zéro — un « ❌ SOUS LE PLANCHER (−NaN %) »
  // est un verdict d'échec fabriqué, c'est-à-dire une accusation.
  if (!Number.isFinite(env.proteinFloorG)) return null;
  return {
    proteinFloorG: env.proteinFloorG,
    proteinPerMealG: env.proteinPerMealG,
    branche,
    source: "household_composition.ts::mouthEnvelope → meal_envelope.ts::" +
      "envelopeFor | maintenanceEnvelopeFromBody (fonctions de production, " +
      "entrées figées)",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LA BOUCHE FIGÉE, LUE DU CONTEXTE — aucune préférence déduite d'un prénom
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ TOUT CE QUI SORT D'ICI VIENT D'UNE COLONNE NOMMÉE. Le plan l'écrit : « Ne
// pas déduire les préférences d'un prénom ou d'un titre de recette. » Le prénom
// n'est rendu que pour l'affichage ; il n'entre dans aucun calcul.

export function boucheDuContexte(
  ctx: Record<string, unknown>,
  rang = 0,
): BoucheFigee {
  const goal = ctx.goal as Record<string, unknown>;
  const membre = (ctx.members as Record<string, unknown>[])[rang];
  if (membre === undefined) {
    throw new Error(
      `⛔ aucune bouche au rang ${rang} : le contexte en porte ${
        (ctx.members as unknown[]).length
      }. Mesurer une bouche absente inventerait un corps.`,
    );
  }
  // ⟳ 2026-09-11 · C0 — LE CORPS SE RETROUVE PAR SON IDENTIFIANT, PAS PAR SON
  // RANG. ⛔ Sur un foyer, `members` et `member_bodies` peuvent ne pas être
  // dans le même ordre ; croiser les deux par l'indice donnerait à Lea le corps
  // de Paul, et l'erreur serait INVISIBLE — les deux mesures « marcheraient ».
  const corpsTous = ctx.member_bodies as Record<string, unknown>[];
  const corps = corpsTous.find((c) =>
    String(c.member_id ?? "") === String(membre.member_id ?? "")
  ) ?? corpsTous[rang];
  if (corps === undefined) {
    throw new Error(
      `⛔ aucun corps pour la bouche ${String(membre.member_id)} : ` +
        `une mesure sans corps s'abstient, elle ne devine pas.`,
    );
  }
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
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-11 · C0 — CHAQUE BOUCHE PORTE SON OBJECTIF, OU N'EN PORTE AUCUN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ « le foyer a un objectif » EST FAUX, et le tir n° 6 le montre : Paul
  // perd du gras, Lea n'a déclaré aucun objectif. Le handler fait
  // `m.goal === null ? null : scaleDirectionOf(m.goal)` ; copier l'objectif du
  // titulaire sur la seconde bouche lui appliquerait un déficit que personne
  // n'a demandé.
  //
  // ⛔ ET LA RÈGLE N'EST PAS INVENTÉE ICI : c'est celle de
  // `keel_household_roster_for`, recopiée de son `prosrc` —
  // « when hm.user_id is null then hm.goal else sg.goal », la même pour
  // `target_pace_kg_per_week`. Une bouche AVEC compte lit l'objectif de son
  // compte (la colonne `household_members.goal` y est nulle) ; une bouche SANS
  // compte lit sa propre colonne, et `null` y veut dire « aucun objectif ».
  const aUnCompte = membre.user_id !== null && membre.user_id !== undefined &&
    String(membre.user_id) !== "";
  const objectifBrut = aUnCompte ? goal.goal : membre.goal;
  const objectif = objectifBrut === null || objectifBrut === undefined
    ? ""
    : String(objectifBrut);
  const cranBrut = aUnCompte
    ? goal.target_pace_kg_per_week
    : membre.target_pace_kg_per_week;
  return {
    memberId: String(membre.member_id),
    prenom: String(membre.first_name ?? ""),
    // ⟳ 2026-09-13 · § 2.3 — LA MÊME LECTURE QUI CHOISIT LA COLONNE D'OBJECTIF
    // JUSTE AU-DESSUS, rendue au lieu d'être jetée. Une seconde règle « a-t-elle
    // un compte ? » ailleurs dans ce fichier en ferait deux.
    aUnCompte,
    weightKg: Number(corps.weight_kg),
    heightCm: Number(corps.height_cm),
    ageYears: age,
    ageBand: ageBandOf(age),
    gender: String(corps.gender) as "male" | "female" | "other",
    goal: objectif,
    direction: objectif === "fat_loss" ? "down" : objectif === "muscle_gain" ? "up" : null,
    // ⛔ `null` ET PAS ZÉRO. `Number(null)` vaut 0, et 0 kg/semaine est un CRAN
    // DÉCLARÉ ; l'absence de cran est autre chose. Ce dépôt a déjà payé
    // `Number(null) === 0` une fois cette campagne, sur `readIngredients`.
    paceKgPerWeek: typeof cranBrut === "number" ? cranBrut : null,
    appetite: (corps.appetite ?? null) as "small" | "average" | "large" | null,
    activityLevel: (corps.activity_level ?? null) as string | null,
    activityAxes: {
      day: (corps.day_activity ?? null) as string | null,
      sport: (corps.sport_frequency ?? null) as string | null,
      asked: corps.activity_axes_asked_at !== null,
    },
    declaredSlots: ((membre.eating_rhythm ?? []) as { slot: string }[]).map((o) => String(o.slot)),
    // ⚠️ LE MOMENT LÉGER EST UNE PROPRIÉTÉ DE LA BOUCHE, pas de la maison : deux
    // personnes à la même table n'ont pas le même déjeuner léger.
    lightSlots: (membre.light_slots ?? grille.light_slots ?? []) as string[],
    restriction: String(
      membre.restriction ?? contrat.restriction,
    ) as BoucheFigee["restriction"],
    ageState: String(membre.age_state ?? contrat.ageState) as BoucheFigee["ageState"],
    conditionRefs: (membre.condition_refs ?? contrat.conditionRefs ?? []) as string[],
    coachCounting: String(contrat.coachCounting) as "no_position" | "no_counting",
    grille: (membre.cases_par_jour ?? grille.cases_par_jour) as Record<string, string[]>,
    jourVersDate,
    fixedIntakesRaw: membre.fixed_intakes ?? [],
    allergies: ((membre.allergies ?? []) as unknown[]).map((a) => String(a)),
  };
}

/**
 * TOUTES LES BOUCHES DU CONTEXTE — celle qui gouverne le menu et les autres.
 *
 * ⛔ LA RAISON D'ÊTRE DE C0, EN UNE FONCTION. Le banc du lot F reconstruisait
 * **une** bouche quel que soit le foyer : le tir n° 6 servait 12 parts et le
 * rapport en publiait 6, conformes. Mesurer « toutes les bouches, leurs propres
 * bornes et objectifs » commence par savoir qu'il y en a plusieurs.
 */
export function bouchesDuContexte(ctx: Record<string, unknown>): BoucheFigee[] {
  const n = (ctx.members as unknown[] ?? []).length;
  const out: BoucheFigee[] = [];
  for (let i = 0; i < n; i++) out.push(boucheDuContexte(ctx, i));
  return out;
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
  /**
   * ⟳ 2026-09-12 · LOT 3 — LES LIGNES DE CONTRAT RETROUVÉES AU CARACTÈRE dans
   * le prompt archivé, rendues par `slotContractSentence` (fonction de
   * PRODUCTION, jamais un motif). `attendu` est le nombre de cases dont le
   * couloir est calculé : « 0 trouvées » et « 0 attendues » ne disent pas la
   * même chose, et les deux voyagent ensemble.
   */
  contratTrouve: number | null;
  contratAttendu: number;
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
    /**
     * ⟳ 2026-09-13 · § 2.3 — LA BRANCHE, RENSEIGNÉE MÊME QUAND IL N'Y A PAS DE
     * CIBLE. C'est elle qui porte le motif de l'abstention : sans elle, le
     * rendu redevinait « pourquoi » depuis l'objectif, et se trompait.
     */
    branche: BrancheEnveloppe;
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
  /**
   * ⟳ 2026-09-11 · C0 — CE QUI A ÉTÉ RETRANCHÉ, ET CE QUI NE L'A PAS ÉTÉ.
   * `declares` à zéro veut dire « rien de déclaré », pas « on n'a pas lu ».
   */
  apportsFixes: {
    declares: number;
    illisibles: number;
    sansMoment: number;
    kcalSansMoment: number;
    parJour: Record<string, Record<string, number>>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · C0 — TROIS FAMILLES, ET ELLES NE SE FONDENT JAMAIS
// ═══════════════════════════════════════════════════════════════════════════
//
// Le plan de clôture l'exige en toutes lettres : « Le rapport rectifié
// distingue conformité calorique, conformité complète et contrôles
// incomplets. »
//
// ⛔ CE QUE LEUR CONFUSION A COÛTÉ. Le rapport des six tirs publie
// « 6 / 6 conformes » sur le tir n° 6 : c'est vrai de la conformité CALORIQUE
// d'UNE bouche, et ça se lit comme la conformité complète d'un foyer de deux.
// Trois nombres qui ne mesurent pas la même chose ne peuvent pas partager une
// colonne.
export interface TroisFamilles {
  /** La case a une cible et sa portion tombe dedans à ±10 %. */
  conformiteCalorique: { conformes: number; sur: number; horsTolerance: string[] };
  /**
   * La case a un plat, une portion mesurable, une masse dans ses bornes, une
   * densité dans son couloir ET une conformité calorique. Un seul ⚪ suffit à
   * la faire sortir : « complète » n'admet aucune abstention.
   */
  conformiteComplete: { conformes: number; sur: number; manquants: string[] };
  /** Ce que l'instrument N'A PAS pu juger, nommé contrôle par contrôle. */
  controlesIncomplets: string[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-13 — LA QUATRIÈME FAMILLE : CE QUI NE S'APPLIQUE PAS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT QU'ELLE FERME, MESURÉ. Une bouche dont le moteur s'abstient
   * de calculer une cible — âge inconnu, corps absent, plancher de protection
   * — reçoit désormais une PART DE RECETTE : elle a son contenant, ses
   * ingrédients et ses grammes, et le foyer est nourri. L'instrument la
   * comptait pourtant `complète 0/6` avec `22 contrôles incomplets`, à côté de
   * `calorique 0/0` qui, lui, disait juste.
   *
   * Une case sans cible n'est ni un échec ni un succès numérique : le contrat
   * ne s'applique pas. Les compter en échec fabrique un rouge, les compter en
   * succès fabrique un vert — les deux mentent.
   *
   * ⚠️ CE QUI RESTE JUGÉ SUR CES CASES : la PRÉSENCE. Un plat manquant ou une
   * portion absente reste un défaut, cible ou pas. On ne suspend que ce qui
   * DÉRIVE de la cible : calories, bornes de masse, couloir de densité.
   */
  nonApplicables: { cases: number; raisons: string[] };
}

export function troisFamilles(m: MesureDUnPlan): TroisFamilles {
  const horsTolerance: string[] = [];
  const manquants: string[] = [];
  const incomplets: string[] = [];
  const nonApplicables: string[] = [];
  let calorique = 0, caloriqueSur = 0, complet = 0, completSur = 0;
  for (const c of m.cases) {
    const cle = `${c.date} ${c.slot}`;
    // ── ⟳ 2026-09-13 — LA CASE DONT LE CONTRAT NUMÉRIQUE NE S'APPLIQUE PAS ──
    //
    // ⛔ LA CONDITION EST LA CIBLE, PAS LA MESURE. « Je n'ai pas su mesurer »
    // est un contrôle incomplet; « il n'y a rien à mesurer contre » est autre
    // chose. Le moteur s'abstient de calculer une cible pour une raison NOMMÉE
    // (`age_unknown`, `no_body`, `restriction_floor`…), et la personne reçoit
    // alors une part de recette.
    const cibleAbsente =
      (c.contrat?.cibleCaseDimensionnementKcal ?? null) === null;
    if (cibleAbsente) {
      // ⚠️ LA PRÉSENCE RESTE JUGÉE. Sans cible, on ne suspend que ce qui en
      // dérive — un plat manquant reste un plat manquant.
      const absences: string[] = [];
      if (c.plat === null) absences.push("aucun plat");
      if (c.portion === null) absences.push("aucune portion");
      if (absences.length > 0) {
        completSur++;
        manquants.push(`${cle} — ${absences.join(" · ")}`);
      } else {
        nonApplicables.push(
          `${cle} : aucune cible pour cette bouche — part de recette servie`,
        );
      }
      continue;
    }
    completSur++;
    if (c.ecartKcalPct !== null) {
      caloriqueSur++;
      if (Math.abs(c.ecartKcalPct) <= TOLERANCE_REPAS) calorique++;
      else horsTolerance.push(`${cle} (${(c.ecartKcalPct * 100).toFixed(2)} %)`);
    }
    const raisons: string[] = [];
    if (c.plat === null) raisons.push("aucun plat");
    if (c.portion === null) raisons.push("aucune portion");
    else if (c.portion.kcal === null) raisons.push(`non mesurable (${c.portion.gap})`);
    if (c.ecartKcalPct === null) {
      raisons.push("aucune cible de case");
      incomplets.push(`${cle} : énergie de la case non jugeable`);
    } else if (Math.abs(c.ecartKcalPct) > TOLERANCE_REPAS) {
      raisons.push("calories hors tolérance");
    }
    if (c.masseDansLesBornes === null) {
      incomplets.push(`${cle} : masse non jugeable`);
      raisons.push("masse non jugeable");
    } else if (!c.masseDansLesBornes) raisons.push("masse hors bornes");
    if (c.densiteDansLeCouloir === null) {
      incomplets.push(
        `${cle} : densité non jugeable` +
          (c.contrat?.couloirTransmis?.incompatible
            ? ` (couloir ${c.contrat.couloirTransmis.incompatible})`
            : ""),
      );
      raisons.push("densité non jugeable");
    } else if (!c.densiteDansLeCouloir) raisons.push("densité hors couloir");
    if (raisons.length === 0) complet++;
    else manquants.push(`${cle} — ${raisons.join(" · ")}`);
  }
  // ⟳ 2026-09-13 — AUCUNE CIBLE NULLE PART ⇒ LA JOURNÉE ET LA PROTÉINE NE
  // S'APPLIQUENT PAS NON PLUS.
  //
  // ⛔ ET LA CONDITION EST « AUCUNE », PAS « CETTE CASE-CI ». Une bouche qui a
  // des cibles caloriques et PAS de plancher protéique est un contrôle
  // INCOMPLET, pas un cas sans objet — c'est exactement le défaut mesuré le
  // 2026-09-13 sur une bouche sans compte, dont l'enveloppe était dégradée
  // alors que son poids était lisible. Le ranger en « sans objet » l'aurait
  // rendu invisible.
  const aucuneCible = m.cases.length > 0 &&
    m.cases.every((c) => (c.contrat?.cibleCaseDimensionnementKcal ?? null) === null);
  for (const j of m.jours) {
    if (j.etat !== "non_mesurable") continue;
    if (aucuneCible) {
      nonApplicables.push(`${j.date} : journée — aucune cible pour cette bouche`);
    } else {
      incomplets.push(`${j.date} : journée — ${j.raison}`);
    }
  }
  for (const [j, p] of Object.entries(m.proteine.parJour)) {
    if (p.mesureG === null || p.plancherCouvertG === null) {
      const date = m.jours.find((x) => x.jour === j)?.date ?? j;
      if (aucuneCible) {
        nonApplicables.push(`${date} : protéines — aucune cible pour cette bouche`);
      } else {
        incomplets.push(`${date} : protéines non jugeables`);
      }
    }
  }
  if (m.references.parEtat.ingredient_non_mesurable > 0) {
    incomplets.push(
      `${m.references.parEtat.ingredient_non_mesurable} ligne(s) d'ingrédient non mesurable(s)`,
    );
  }
  if (m.denominateurs.portionsSansBouche > 0) {
    incomplets.push(
      `${m.denominateurs.portionsSansBouche} contenant(s) sans bouche nommée — ` +
        `rattaché(s) par repli à ${m.bouche.prenom || m.bouche.memberId}`,
    );
  }
  return {
    conformiteCalorique: { conformes: calorique, sur: caloriqueSur, horsTolerance },
    // ⛔ LE DÉNOMINATEUR EXCLUT LES CASES SANS OBJET. Les y laisser rendrait
    // « 0/6 » pour une bouche parfaitement servie.
    conformiteComplete: { conformes: complet, sur: completSur, manquants },
    controlesIncomplets: incomplets,
    nonApplicables: { cases: nonApplicables.length, raisons: nonApplicables },
  };
}

export async function mesurerUnPlan(
  fx: Fixtures,
  plan: Record<string, unknown>,
  /**
   * ⟳ 2026-09-11 · C0 — LE RANG DE LA BOUCHE MESURÉE. Défaut `0` : le
   * comportement d'avant ce lot, mot pour mot, sur les contextes à une bouche.
   */
  opts: { rang?: number } = {},
): Promise<MesureDUnPlan> {
  const planId = String(plan.id);
  const ctx = fx.contextes.find((c) => String(c.plan_id) === planId);
  if (!ctx) throw new Error(`aucun contexte figé pour le plan ${planId}`);
  const requestId = String(ctx.request_id);
  const bouche = boucheDuContexte(ctx, opts.rang ?? 0);
  const index = await troisIndex(fx, plan);
  // ⟳ 2026-09-11 · C0 — LES APPORTS FIXES, PESÉS AVANT LE CONTRAT. `null` quand
  // la bouche n'en déclare AUCUN : `slotContractsFor` distingue « pas d'apport »
  // de « une carte vide », et lui rendre une carte vide reviendrait à dire
  // qu'on a regardé et trouvé zéro — ce qui est vrai ici, mais pas partout.
  const apports = apportsFixesParJour({ index: index.relecture.index, bouche });
  const fixe: FixedKcalParJour | null = apports.declares === 0 ? null : apports.parJour;
  const contrats = contratsParCase(bouche, fixe);
  // ⟳ 2026-09-11 · LOT B — DEUX PHRASES, ET ELLES NE DISENT PAS LA MÊME CHOSE.
  // `refait` reproduit CE QUI EST PARTI le 2026-09-11 (grille prise pour
  // rythme) : c'est la seule qui puisse être comparée au prompt archivé.
  // `repare` est ce que le moteur enverrait aujourd'hui.
  const refait = contratTransmis(bouche, fixe).fragment;
  const repare = contratRepare(bouche, fixe).fragment;

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

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 3 — LA SECONDE SONDE, PAR LA FONCTION DE PRODUCTION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ POURQUOI IL EN FALLAIT UNE DEUXIÈME. `refait` reproduit la phrase de
  // densité telle qu'elle partait le 2026-09-11. Depuis le lot 2, le couloir ne
  // voyage plus dans cette phrase-là : il est écrit, case par case, par
  // `slotContractSentence` dans le bloc « WHAT EACH PLATE HAS TO COME OUT AT ».
  // L'ancienne sonde rend donc `null` sur TOUT prompt d'aujourd'hui — et un
  // `null` qui veut dire « le prompt a changé » se lit « le couloir n'est pas
  // transmis », c'est-à-dire l'inverse de la vérité.
  //
  // ⛔ ET ELLE APPELLE LA FONCTION DU MOTEUR, PAS UN MOTIF. Le lot 0 a classé
  // « les couloirs extraits par regex sur le prompt » parmi les cinq fautes de
  // mesure à ne pas refaire. Ici on REND la phrase attendue avec le rendu de
  // production, et on la cherche au caractère : si elle y est, le couloir que
  // le moteur a calculé est littéralement celui que le modèle a lu.
  const contratsLus = contrats.filter((c) => c.couloirDuJour !== null);
  const attendues = contratsLus.map((c) =>
    slotContractSentence({
      // ⟳ 2026-09-23 — `memberId` est REQUIS et jamais imprimé (regroupement);
      // `gramsAim` est retiré: la masse est une bande sans visée (flux G).
      memberId: bouche.memberId,
      who: bouche.prenom,
      day: c.jour,
      slot: c.slot,
      targetKcal: c.cibleCaseKcal,
      gramsMin: c.gMin,
      gramsMax: c.gMax,
      densityMin: c.couloirDuJour?.min ?? null,
      densityMax: c.couloirDuJour?.max ?? null,
      densityAim: c.couloirDuJour?.pref ?? null,
      // ⚠️ `null`: le plancher protéique par REPAS n'est pas reconstruit ici, et
      // `slotContractSentence` omet alors le morceau. La phrase cherchée est
      // donc un PRÉFIXE de celle du prompt quand un plancher s'y ajoute — c'est
      // pour ça que la comparaison ci-dessous est un `includes` de préfixe et
      // non une égalité de ligne.
      proteinMinG: null,
    })
  ).filter((x): x is string => x !== null);
  const contratTrouve = attendues.length === 0
    ? null
    : attendues.filter((ligne) => texte.includes(ligne)).length;
  const contratAttendu = attendues.length;

  const portions = mesurerPortions({ index: index.relecture.index, plan });
  const { cases, denominateurs } = croiser({ bouche, contrats, plan, portions });
  const jours = journeesParPortions(cases);
  const references = censusDesReferences(index.relecture.index, plan);

  const plancher = plancherProteine(bouche, String(plan.starts_on));
  // ⛔ LA MÊME CHAÎNE, APPELÉE UNE SECONDE FOIS SUR LA MÊME BOUCHE — jamais une
  // seconde règle. `enveloppeDeLaBouche` est pure : les deux appels ne peuvent
  // pas se contredire, et c'est ce qui permet de nommer l'abstention quand
  // `plancherProteine` rend `null`.
  const brancheEnveloppe = enveloppeDeLaBouche(bouche, String(plan.starts_on)).branche;
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
    // ⟳ 2026-09-12 · FERMETURE LOT 2 — RIEN DE DÉDUIT DANS UNE RELECTURE. Le
    // garde-manger n'est pas dans le plan persisté : l'instrument compare donc
    // le besoin ENTIER, ce qui est la seule lecture honnête ici.
    pantryCoveredG: new Map<string, number>(),
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
  // ⟳ 2026-09-13 · LOT 2 — LA DERNIÈRE PORTE, PAS LA PREMIÈRE.
  //
  // ⛔ `find` rendait le PREMIER passage. Un tir qui répare passe la porte
  // plusieurs fois : l'en-tête de chaque bouche affichait donc `ok=false ·
  // refus=4` — l'état d'AVANT la réparation — pendant que la section « PORTE
  // FINALE » affichait le dernier, `ok=true`. Deux lectures du même tir qui se
  // contredisaient dans le même rapport.
  const passagesGate = fx.journaux.filter(
    (j) => j.tag === "keel.household_meal.final_gate" && String(j.request_id) === requestId,
  );
  const journalGate = passagesGate[passagesGate.length - 1] ?? {};

  return {
    planId,
    requestId,
    bouche,
    index,
    contrats,
    fragmentRefait: refait,
    fragmentRepare: repare,
    fragmentArchive: archive,
    contratTrouve,
    contratAttendu,
    fragmentIdentique: texte === "" ? null : archive !== null,
    portions,
    cases,
    denominateurs,
    jours,
    references,
    quantites: censusDesQuantites(plan, reponseBrute),
    quantitesApresLotC: (() => {
      const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
      // ⟳ C2 (2026-09-12) — LA FINALISATION ENTIÈRE, PAS SA MOITIÉ. Elle vaut
      // désormais ARRONDI **puis** prose (`finalizePlanQuantities`); rejouer la
      // seule prose mesurerait un moteur qui n'existe plus, et le rapport
      // publierait des fractions que la lane n'écrit plus.
      //
      // ⛔ LE POIDS D'UNE PIÈCE VIENT DU RÉSOLVEUR DE PRODUCTION, comme dans le
      // handler: `resolveCompositionLine` sur l'index de RELECTURE. Pas de
      // second résolveur, pas de liste d'aliments.
      finalizePlanQuantities(
        planQuantityLines(
          (copie.dishes ?? []) as { ingredients?: never[] }[],
          (copie.preparations ?? []) as { ingredients?: never[] }[],
        ),
        String(plan.content_locale ?? "").slice(0, 2).toLowerCase() === "fr" ? "fr" : "en",
        (ligne) =>
          resolveCompositionLine(index.relecture.index, {
            term: String(ligne.term ?? ""),
            ref: ligne.ref ?? null,
            refRefused: ligne.refRefused === true,
          }).ref?.unitGrams ?? null,
      );
      return censusDesQuantites(copie, reponseBrute);
    })(),
    proteine: { plancher, branche: brancheEnveloppe, parJour: proteineParJour },
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
    // ⟳ 2026-09-14 · BÊTA 1B ⑧ — `[]` ICI, ET C'EST EXACT. L'instrument mesure
    // la garde sur un plan RELU, sans grille du foyer ni audit des courses:
    // exiger des contrôles qu'il ne fait pas tourner ferait rendre
    // `not_deliverable` à tous ses tirs, et l'instrument mesurerait sa propre
    // absence de contexte. Ce que la lane exige est épinglé ailleurs
    // (`beta_wiring_test.ts`).
    livraisonEtat: finalGateDelivery(gate, []).state,
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
    apportsFixes: {
      declares: apports.declares,
      illisibles: apports.illisibles,
      sansMoment: apports.sansMoment,
      kcalSansMoment: apports.kcalSansMoment,
      parJour: Object.fromEntries(
        [...apports.parJour].map(([j, m]) => [j, Object.fromEntries(m)]),
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
  );
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 2 — CE QUE LA PORTE N'A PAS REGARDÉ, LU DANS LE TIR
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QUI ÉTAIT ÉCRIT ICI ÉTAIT FAUX, ET ÉCRIT EN DUR. La ligne disait :
  // « le gate a reçu energy: null et boxContract: null — son ok=true ne
  // certifie ni les calories, ni les protéines, ni la présence d'une portion
  // par case. » Elle partait sur TOUS les tirs, sans rien lire.
  //
  // Vérifié sur `final_plan_gate.ts` : le paramètre `energy` ne pilote QU'UNE
  // cause, `mouth_energy_short` (l'enveloppe d'une bouche entière). Les
  // calories par case et par journée, la protéine et la portion absente
  // viennent de `nutrition`, que la lane passe bel et bien
  // (`index.ts` ≈ 17160) — c'est ce qui produit `cell_energy_off`,
  // `day_energy_off`, `protein_floor_short` et `cell_without_portion` dans les
  // tirs archivés.
  //
  // ⚠️ ET LE PLAN L'INTERDIT EN TOUTES LETTRES : « ne pas recopier des
  // avertissements historiques de l'instrument comme preuves d'une garde
  // absente ; journal indisponible = information indisponible. » On lit donc
  // ce que la porte a DIT de ce tir-ci, et rien d'autre.
  const porte = m.livraison.final_gate as Record<string, unknown>;
  const nonEvalues = Array.isArray(porte.unevaluated) ? porte.unevaluated : null;
  const incomplets = Array.isArray(porte.incomplete) ? porte.incomplete : null;
  if (nonEvalues === null && incomplets === null) {
    L.push(
      `⚠️ ce tir n'a pas journalisé ce que la porte n'a pas évalué —`,
      `   information INDISPONIBLE, ce qui n'est pas « tout a été regardé ».`,
    );
  } else {
    L.push(
      `non évalués ${
        nonEvalues === null || nonEvalues.length === 0
          ? "aucun"
          : nonEvalues.join(", ")
      }`,
      `incomplets  ${
        incomplets === null || incomplets.length === 0
          ? "aucun"
          : incomplets.map((c) => {
            const r = (c ?? {}) as Record<string, unknown>;
            return `${r.control}:${r.count}`;
          }).join(", ")
      }`,
    );
  }

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
  // ⟳ 2026-09-11 · C0 — LES CONTENANTS QUI NE SONT PAS À CETTE BOUCHE.
  L.push(
    `contenants d'autres bouches  ${d.portionsAutresBouches}` +
      (d.portionsAutresBouches > 0
        ? `   (mesurés dans LEUR propre bloc, jamais fondus dans celui-ci)`
        : ""),
    // ⟳ 2026-09-13 · LOT 2 §1 — LA PART CONTRE LA PESÉE, DITE EN CLAIR.
    `cases jugées sur une PART   ${d.portionsPartagees}` +
      (d.portionsPartagees > 0
        ? `   ⚠️ bac de groupe ÷ nombre de mangeurs (convention de ` +
          `final_plan_audit::cellNutritionTable) — une ESTIMATION, pas une pesée nominative`
        : `   (toutes les cases mesurées portent une pesée nominative)`),
    `contenants sans bouche nommée ${d.portionsSansBouche}` +
      (d.portionsSansBouche > 0
        ? `   ⚠️ rattachés par REPLI à ${m.bouche.prenom || m.bouche.memberId}`
        : ""),
  );
  // ── LES TROIS FAMILLES, SÉPARÉES ────────────────────────────────────────
  const f = troisFamilles(m);
  L.push(
    "",
    "── CONFORMITÉ CALORIQUE · CONFORMITÉ COMPLÈTE · CONTRÔLES INCOMPLETS ──",
    `conformité CALORIQUE  ${f.conformiteCalorique.conformes} / ${f.conformiteCalorique.sur} cases jugeables`,
    `conformité COMPLÈTE   ${f.conformiteComplete.conformes} / ${f.conformiteComplete.sur} cases demandées` +
      `   (plat + portion + calories + masse + densité, aucune abstention)`,
    `contrôles INCOMPLETS  ${f.controlesIncomplets.length}`,
    // ⟳ 2026-09-13 — LA QUATRIÈME LIGNE, ET ELLE NE SE FOND DANS AUCUNE AUTRE.
    `SANS OBJET            ${f.nonApplicables.cases} case(s) — le contrat ` +
      `numérique ne s'applique pas à cette bouche`,
  );
  for (const x of f.conformiteComplete.manquants) L.push(`   ❌ ${x}`);
  for (const x of f.controlesIncomplets) L.push(`   ⚪ ${x}`);
  for (const x of f.nonApplicables.raisons) L.push(`   ⊘ ${x}`);
  L.push(
    `⛔ CES TROIS NOMBRES NE SE FONDENT PAS. « 6/6 conformes » publié sur le tir`,
    `   n° 6 était la conformité CALORIQUE d'UNE bouche d'un foyer de deux.`,
  );
  // ── LES APPORTS FIXES, LUS ──────────────────────────────────────────────
  const af = m.apportsFixes;
  L.push(
    "",
    `apports fixes déclarés ${af.declares}` +
      (af.declares === 0
        ? `   (rien de déclaré — ce n'est pas « non lu »)`
        : `   retranchés : ${JSON.stringify(af.parJour)}`),
  );
  if (af.illisibles > 0) {
    L.push(`   ⛔ ${af.illisibles} apport(s) ILLISIBLE(S) : zéro retranché, et compté.`);
  }
  if (af.sansMoment > 0) {
    L.push(
      `   ⚠️ ${af.sansMoment} apport(s) SANS MOMENT : ${af.kcalSansMoment.toFixed(0)} kcal ` +
        `jamais retranchées d'aucune case.`,
    );
  }

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
    // ⟳ 2026-09-12 · LOT 3 — CE QUE LE MODÈLE A LITTÉRALEMENT LU.
    m.contratTrouve === null
      ? "⚪ aucune case au couloir calculé : rien à chercher dans le prompt."
      : m.contratTrouve === m.contratAttendu
      ? `✅ les ${m.contratAttendu} ligne(s) de contrat de cette bouche sont dans le prompt archivé, AU CARACTÈRE, rendues par la fonction de production — le couloir calculé EST celui qui est parti.`
      : `❌ ${m.contratTrouve}/${m.contratAttendu} ligne(s) de contrat retrouvée(s) dans le prompt archivé.`,
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
  // ⟳ 2026-09-11 · C0 — LE NOMBRE EST LU, PLUS ÉCRIT EN DUR. « allergies
  // déclarées 0 » s'imprimait même sur le tir n° 6, qui en portait une.
  L.push(
    `allergies déclarées      ${ctx.allergies.length}` +
      (ctx.allergies.length > 0 ? ` : ${ctx.allergies.join(", ")}` : "") +
      `   (bouche ${ctx.prenom || ctx.memberId})`,
  );
  L.push(
    ctx.allergies.length === 0
      ? `⛔ CE CONTRÔLE NE PROUVE RIEN ICI : aucune contrainte n'est déclarée sur`
      : `⛔ ET CE CONTRÔLE NE PROUVE TOUJOURS PAS QUE LA CEINTURE TIENT. Sur`,
    ctx.allergies.length === 0
      ? `   cette bouche. « Aucune violation » veut dire « on ne l'a pas essayée ».`
      : `   cette bouche, la contrainte est bien DÉCLARÉE ; « pas violée » et`,
    ctx.allergies.length === 0
      ? `   ⚠️ L'INSTRUMENT NE JUGE AUCUNE VIOLATION : il dit ce qui est déclaré.`
      : `   « la ceinture est ARMÉE » restent deux affirmations, et la seconde`,
    ctx.allergies.length === 0
      ? `   La ceinture s'éprouve au moteur, pas ici.`
      : `   demande un compteur d'armement du run que ce tir n'a pas émis.`,
  );

  L.push("", "══ 8. PROTÉINES ═══════════════════════════════════════════");
  const pl = m.proteine.plancher;
  // ⟳ 2026-09-13 · § 2.3 — LA BRANCHE EST IMPRIMÉE, DANS LES DEUX CAS.
  //
  // ⛔ ET L'ABSTENTION N'EST PLUS DEVINÉE DE L'OBJECTIF. « pas d'objectif
  // déclaré » n'est PLUS une raison de n'avoir aucun plancher : une bouche
  // adulte sans compte reçoit l'entretien de sa fiche, avec ou sans objectif
  // écrit dessus — c'est ce que `mouthEnvelope` fait, et le prompt archivé du
  // 2026-09-13 le montre (Lea, objectif nul, « 23 g … 37 g … 33 g »). Rejouer
  // la devinette ici ferait dire à l'instrument le contraire du produit.
  const MOTIF: Record<BrancheEnveloppe, string> = {
    compte: "compte — série de pesées + objectif (envelopeFor)",
    fiche_entretien: "fiche — ENTRETIEN (maintenanceEnvelopeFromBody) : une fiche " +
      "n'achète aucun objectif, celui écrit dessus reste inerte",
    fiche_pediatrique: "fiche — maintenance PÉDIATRIQUE (childEnvelopeFromBody)",
    protegee: "⚪ BOUCHE PROTÉGÉE (enveloppe per_portion) ⇒ aucun chiffre en face " +
      "de ce nom. Ce n'est pas « zéro gramme exigé », c'est « rien à exiger ici ».",
    age_inconnu: "⚪ ÂGE INCONNU ⇒ ni adulte ni enfant, aucune équation ne " +
      "s'applique. `mouthEnvelope` rend `null` : NON APPLICABLE, jamais zéro.",
    corps_insuffisant: "⚪ CORPS INSUFFISANT (poids ou bande d'âge manquants) ⇒ " +
      "plancher NON CALCULABLE. Inconnu, jamais zéro.",
  };
  L.push(
    pl === null
      ? MOTIF[m.proteine.branche]
      : `plancher applicable   ${pl.proteinFloorG} g/jour${
        pl.proteinPerMealG === null ? "" : ` · ${pl.proteinPerMealG} g/repas`
      }`,
    pl === null ? "" : `branche               ${MOTIF[pl.branche]}`,
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
    `── ce que la FINALISATION (lot C + arrondi C2) ferme, sur ce plan ──`,
    `  · PROSE PÉRIMÉE après finalisation    ${qC.amountChangeProsePerimee.length}   (avant : ${q.amountChangeProsePerimee.length})`,
    `⚠️ LA FIXTURE N'EST PAS MODIFIÉE : finalizePlanQuantities — la fonction`,
    `   de production, ARRONDI PUIS PROSE (C2, 2026-09-12) — tourne sur une`,
    `   COPIE. ⛔ Les quantités structurées ne sont donc PLUS constantes entre`,
    `   les deux colonnes : l'arrondi les déplace d'au plus une demi-unité, et`,
    `   c'est voulu. Ce nombre dit ce que le moteur d'aujourd'hui écrirait ; il`,
    `   ne dit rien d'un plan neuf, ni du goût.`,
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
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · C6 — CE N'EST PAS L'ÉTAT QUE LE RUN A RENDU
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ DÉFAUT DE MESURE TROUVÉ LE 2026-09-12, ET IL PENCHAIT DU CÔTÉ
  // RASSURANT. Cette ligne s'appelait « état de livraison ». Elle vient de
  // `finalGateDelivery(gate)` où `gate` est la porte que CET INSTRUMENT
  // rejoue hors ligne — avec `energy: null` et `boxContract: null`, comme la
  // ligne d'avertissement du § « BILAN DE LIVRAISON » le dit déjà. Deux
  // familles de causes lui sont donc STRUCTURELLEMENT invisibles :
  // `cell_energy_off` et `protein_floor_short`.
  //
  // Mesuré sur le run témoin du 2026-09-12 (plan `0a8c5445`) : l'instrument
  // imprimait **conforme** pendant que le MOTEUR avait rendu
  // `deliverable_with_gaps` (3 refus : 2 × `cell_energy_off`, 1 ×
  // `protein_floor_short`) et que la base portait
  // `generated_from.validation.state = "livrable_avec_ecarts"`.
  //
  // L'état que le run a rendu est publié DEUX fois plus bas, et il fait foi :
  // le bloc « PORTE FINALE (journal du tir) » et la colonne persistée.
  L.push(
    `état de livraison REJOUÉ PAR L'INSTRUMENT : ${m.livraisonEtat}` +
      `   ⚠️ sur les seuls contrôles que l'instrument rejoue (energy: null, ` +
      `boxContract: null) — l'état du RUN est celui de la « PORTE FINALE » ci-dessous`,
  );
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
    nonMesurable.push(
      m.bouche.allergies.length === 0
        ? `${n} — contraintes alimentaires : aucune déclarée sur cette fixture`
        : `${n} — contraintes alimentaires : ${m.bouche.allergies.length} déclarée(s) ` +
          `(${m.bouche.allergies.join(", ")}), ARMEMENT de la ceinture non mesuré ici`,
    );
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · LOT 3 — LES APPELS FOURNISSEUR, CLASSÉS ET CHRONOMÉTRÉS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CE BLOC FERME EST UN DÉFAUT DE RAPPORT, PAS DE MOTEUR. Le
// rapport C6 § 5.7 a publié `c4CallsMade` comme un total de réparations.
// `c4CallsMade` ne compte QUE la passe finale : sur le tir 4, il valait 1 alors
// que le tir avait payé quatre appels (génération, `density_repair`,
// `density_repair_fill`, `final_repair`). La revue du 2026-09-12 § 6 : « Six
// tirs = six demandes de plan, pas six appels fournisseur. »
//
// ⛔ ON NE COMPTE PAS CE QUE LE MOTEUR DIT AVOIR FAIT. On compte les lignes
// `llm_raw_response_events`, c'est-à-dire ce que le fournisseur a réellement
// servi. Un compteur interne qui se trompe reste invisible à lui-même.

/** Les trois populations d'appels, et elles ne se confondent pas. */
export type NatureDAppel =
  /** La composition du plan, premier jet. */
  | "generation_initiale"
  /** Un appel qui redemande un PLAN au modèle — il consomme le budget. */
  | "reparation_du_plan"
  /** Un appel qui ne redemande pas de plan (remplissage, résolution). */
  | "auxiliaire";

/**
 * ⛔ LES SUFFIXES QUI REDEMANDENT UN PLAN, NOMMÉS UN PAR UN.
 *
 * Une liste NOMMÉE, pas une règle de forme : `density_repair` et
 * `density_repair_fill` ne diffèrent que par un suffixe, et le second ne
 * redemande AUCUN plan — il remplit des valeurs manquantes en deux secondes.
 * Les ranger par « contient repair » les compterait pareil.
 */
export const SUFFIXES_DE_REPARATION_DE_PLAN: readonly string[] = Object.freeze([
  "final_repair",
  "density_repair",
  "dedicated_repair",
  "protein_anchor_retry",
  "exclusion_retry",
  "swap_retry",
  "preference_split_retry",
  "unfed_retry",
]);

export interface AppelMesure {
  readonly source: string;
  readonly nature: NatureDAppel;
  readonly model: string | null;
  /** `null` quand l'appel n'a pas de couple `attempt_start` → issue. */
  readonly duree_ms: number | null;
  /** `success`, `error`, ou ce que la ligne d'issue portait. */
  readonly issue: string | null;
  readonly user_message_len: number | null;
  readonly output_text_len: number | null;
}

export interface CensusDesAppels {
  readonly appels: readonly AppelMesure[];
  readonly generation_initiale: number;
  readonly reparations_du_plan: number;
  readonly auxiliaires: number;
  readonly total_fournisseur: number;
  /** ⛔ La somme des durées MESURÉES. Les `null` en sont exclus et se comptent. */
  readonly duree_totale_ms: number;
  readonly sans_duree: number;
}

/** La nature d'une source, par son suffixe. ⛔ Liste nommée, jamais une forme. */
export function natureDeLaSource(source: string, racine: string): NatureDAppel {
  const s = String(source ?? "").trim();
  if (s === racine) return "generation_initiale";
  const suffixe = s.startsWith(`${racine}.`) ? s.slice(racine.length + 1) : s;
  return SUFFIXES_DE_REPARATION_DE_PLAN.includes(suffixe)
    ? "reparation_du_plan"
    : "auxiliaire";
}

/**
 * CLASSE ET CHRONOMÈTRE LES APPELS D'UNE REQUÊTE.
 *
 * Entrée : les lignes `llm_raw_response_events` d'un `request_id`, dans
 * l'ordre chronologique, avec au moins `source`, `status`, `created_at`.
 *
 * ⚠️ UN `attempt_start` SANS ISSUE RESTE UN APPEL. Il est compté, sa durée est
 * `null`, et `sans_duree` le dit. Le jeter ferait disparaître exactement les
 * appels qui ont expiré — c'est-à-dire ceux qu'on cherche.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function classerAppels(
  lignes: readonly Record<string, unknown>[],
  racine = "generate-household-meal-v1",
): CensusDesAppels {
  const appels: AppelMesure[] = [];
  /** Les `attempt_start` encore ouverts, par source, dans l'ordre. */
  const ouverts = new Map<string, Record<string, unknown>[]>();
  const msDe = (v: unknown): number | null => {
    const t = Date.parse(String(v ?? ""));
    return Number.isFinite(t) ? t : null;
  };
  const fermer = (source: string, issue: Record<string, unknown> | null) => {
    const file = ouverts.get(source) ?? [];
    const debut = file.shift() ?? null;
    ouverts.set(source, file);
    if (debut === null) return false;
    const t0 = msDe(debut.created_at);
    const t1 = issue === null ? null : msDe(issue.created_at);
    appels.push({
      source,
      nature: natureDeLaSource(source, racine),
      model: issue?.model === undefined ? (debut.model ?? null) as string | null : (issue.model ?? null) as string | null,
      duree_ms: t0 !== null && t1 !== null ? t1 - t0 : null,
      issue: issue === null ? null : String(issue.status ?? ""),
      user_message_len: typeof debut.user_message_len === "number"
        ? debut.user_message_len
        : (typeof debut.user_message === "string" ? debut.user_message.length : null),
      output_text_len: issue === null
        ? null
        : (typeof issue.output_text_len === "number"
          ? issue.output_text_len
          : (typeof issue.output_text === "string" ? issue.output_text.length : null)),
    });
    return true;
  };
  for (const l of lignes) {
    const source = String(l.source ?? "");
    const status = String(l.status ?? "");
    if (status === "attempt_start") {
      const file = ouverts.get(source) ?? [];
      file.push(l);
      ouverts.set(source, file);
      continue;
    }
    fermer(source, l);
  }
  // ⛔ CE QUI EST RESTÉ OUVERT EST UN APPEL PARTI SANS RETOUR. Il entre.
  for (const [source, file] of ouverts) {
    for (let i = 0; i < file.length; i++) {
      appels.push({
        source,
        nature: natureDeLaSource(source, racine),
        model: (file[i].model ?? null) as string | null,
        duree_ms: null,
        issue: null,
        user_message_len: typeof file[i].user_message_len === "number"
          ? file[i].user_message_len as number
          : (typeof file[i].user_message === "string"
            ? (file[i].user_message as string).length
            : null),
        output_text_len: null,
      });
    }
  }
  const compte = (n: NatureDAppel) => appels.filter((a) => a.nature === n).length;
  return {
    appels,
    generation_initiale: compte("generation_initiale"),
    reparations_du_plan: compte("reparation_du_plan"),
    auxiliaires: compte("auxiliaire"),
    total_fournisseur: appels.length,
    duree_totale_ms: appels.reduce((n, a) => n + (a.duree_ms ?? 0), 0),
    sans_duree: appels.filter((a) => a.duree_ms === null).length,
  };
}
