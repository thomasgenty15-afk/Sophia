/**
 * LOT 18 — L'APPEL DE SECOURS ET LE SAS. Le côté IMPUR de `composition_fill.ts`.
 *
 * ── ⛔ LA RÈGLE 2 DU LOT, TENUE ICI OU NULLE PART ─────────────────────────
 * « Cet appel ne peut JAMAIS faire tomber le plan. »
 *
 * Les deux fonctions de ce fichier ne lèvent PAS. Jamais. Ni sur un modèle en
 * erreur, ni sur un timeout, ni sur une sortie illisible, ni sur une base qui
 * refuse l'écriture. Elles rendent une valeur vide et laissent le repli par
 * bornes prendre la main. Si cet appel devient un point de rupture, le lot a
 * échoué — on aura seulement déplacé le problème d'un cran.
 *
 * ⚠️ UN SEUL APPEL PAR PLAN. Les termes inconnus partent ENSEMBLE, et le
 * plafond de la worklist (`FILL_REQUEST_CAP`) borne la taille. Un appel par
 * ingrédient est un défaut de conception, pas une optimisation manquée.
 */

import { generateWithGemini } from "../gemini.ts";
import {
  COMPOSITION_FILL_SYSTEM_PROMPT,
  compositionFillUserMessage,
  energySourceShares,
  type EnergySourceShares,
  type FillAnswer,
  type FilledComposition,
  type FillRequest,
  fillCompositions,
  fillRequestsFor,
  groupBandsFrom,
  parseCompositionFillAnswers,
  unknownTermCount,
  withFilledRefs,
} from "./composition_fill.ts";
import {
  type CompositionIndex,
  type CompositionInput,
  resolveIngredients,
} from "./food_composition.ts";
import type { FoodGroupRef } from "./tokens.ts";

/**
 * LE TEMPS QUE CET APPEL A LE DROIT DE PRENDRE.
 *
 * ⚠️ SANS RAPPORT AVEC `PLAN_HTTP_TIMEOUT_MS` (300 s), et la différence est le
 * point: une composition de plan est LE produit, elle a le droit d'attendre.
 * Celui-ci est une RÉPARATION en marge d'un plan déjà écrit — il doit
 * abandonner vite, parce que l'abandon a un repli et que l'attente n'en a pas.
 * 12 s couvre largement une sortie JSON de quelques dizaines de lignes sur un
 * petit modèle; au-delà, le repli par bornes est une meilleure réponse que
 * l'élève qui regarde un écran.
 */
export const COMPOSITION_FILL_TIMEOUT_MS = 12_000;

/**
 * LE MODÈLE DE L'APPEL DE SECOURS — petit et rapide, pas celui qui compose.
 *
 * ⚠️ CE N'EST PAS HAIKU 4.5, ET C'EST UNE LIMITE DE LA PILE, PAS UN CHOIX.
 * Le prompt du lot demande « un petit modèle rapide (Haiku 4.5) ». Ce dépôt n'a
 * AUCUN chemin Anthropic: `_shared/gemini.ts` route sur `gpt-*` (API OpenAI) et
 * `gemini-*`, et rien d'autre — vérifié le 2026-08-21, zéro occurrence de
 * `anthropic` / `claude` dans le client. Brancher Haiku demanderait un
 * troisième fournisseur, une clé, et une facturation: un chantier à part, pas
 * une ligne de ce lot.
 *
 * Le défaut est donc le petit modèle que la pile a déjà — celui que
 * `gemini.ts` utilise lui-même comme repli léger. La variable d'environnement
 * permet d'en changer sans redéploiement, comme `KEEL_GENERATION_MODEL`.
 *
 * ⚠️ LA MESURE DU BANC NE S'APPLIQUE PAS ICI. `gpt-5.4-mini` a été écarté de la
 * COMPOSITION parce qu'il servait des aliments interdits — une faute de
 * consigne négative sur un plan. Décrire la composition d'un aliment nommé n'a
 * ni consigne négative ni allergène: la sortie ne va dans aucune assiette, elle
 * va dans un calcul, et elle est bornée par la bande de son groupe avant
 * d'être crue.
 */
export const COMPOSITION_FILL_MODEL_DEFAULT = "gpt-5.4-nano";

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function compositionFillModel(): string {
  const override = (safeEnvGet("KEEL_COMPOSITION_FILL_MODEL") ?? "").trim();
  return override || COMPOSITION_FILL_MODEL_DEFAULT;
}

/**
 * UN APPEL, TOUS LES TERMES, ET AUCUNE EXCEPTION QUI SORTE.
 *
 * Rend `[]` sur tout échec — c'est la valeur qui déclenche le repli par bornes
 * en aval. `[]` est donc une valeur PLEINE ici, pas une absence: elle veut dire
 * « personne n'a répondu », et le compteur `group_bounds` la rend visible.
 */
export async function askCompositionFill(
  requests: readonly FillRequest[],
  meta: { source: string; requestId: string; userId: string },
): Promise<FillAnswer[]> {
  if (requests.length === 0) return [];
  try {
    const raced = await Promise.race([
      generateWithGemini(
        COMPOSITION_FILL_SYSTEM_PROMPT,
        compositionFillUserMessage(requests),
        // ⛔ TEMPÉRATURE 0. On ne veut pas de créativité sur une table de
        // composition: deux plans qui rencontrent le même terme inconnu doivent
        // obtenir la même valeur, sans quoi `sightings` compterait trois
        // réponses différentes jusqu'à trois et en promouvrait une au hasard.
        0,
        true,
        [],
        "auto",
        {
          source: meta.source,
          requestId: meta.requestId,
          userId: meta.userId,
          model: compositionFillModel(),
          httpTimeoutMs: COMPOSITION_FILL_TIMEOUT_MS,
        },
      ),
      // La CEINTURE, en plus du timeout HTTP: `generateWithGemini` porte une
      // chaîne de replis et de backoffs qui peut dépasser son propre plafond
      // par tentative. Ici c'est le plafond TOTAL de la réparation.
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), COMPOSITION_FILL_TIMEOUT_MS + 3_000)
      ),
    ]);
    if (typeof raced !== "string") return [];
    return parseCompositionFillAnswers(raced, requests);
  } catch (error) {
    // ⚠️ `warn`, PAS `error`, ET PAS DE `throw`. Un référentiel incomplet est
    // le cas NOMINAL de ce lot; l'échec de sa réparation ne doit pas ressembler
    // à une panne du produit dans les logs de quelqu'un d'astreinte.
    console.warn("[keel/composition_fill] rescue call failed", error);
    return [];
  }
}

/** Le strict minimum de client dont l'écriture du sas a besoin. */
export interface PendingDbClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: unknown }>;
}

/**
 * CHAQUE LIGNE INCONNUE PART DANS LE SAS, avec son compteur d'occurrences.
 *
 * ⛔ `sightings` COMPTE DES PLANS, PAS DES OCCURRENCES, et c'est l'appelant qui
 * le garantit: les termes arrivent déjà dédoublonnés par `fillRequestsFor`.
 * Compter les occurrences ferait promouvoir à la 3e ligne d'un même plat —
 * c'est-à-dire sur le tirage d'UN modèle, un seul jour.
 *
 * ⚠️ NE LÈVE PAS. Une écriture de sas refusée ne coûte qu'un terme non curé;
 * elle ne doit pas coûter le dîner de quelqu'un.
 */
export async function recordPendingSightings(
  db: PendingDbClient,
  filled: readonly FilledComposition[],
): Promise<{ written: number; failed: boolean }> {
  if (filled.length === 0) return { written: 0, failed: false };
  const rows = filled.map((f) => ({
    term: f.term,
    food_group_ref: f.ref.foodGroupRef,
    label: f.ref.label,
    energy_kcal: f.ref.energyKcal,
    protein_g: f.ref.proteinG,
    carbs_g: f.ref.carbsG,
    fat_g: f.ref.fatG,
    fiber_g: f.ref.fiberG,
    yield_class: f.ref.yieldClass,
    fill_source: f.source,
  }));
  try {
    const { error } = await db.rpc("record_food_composition_sightings", { p_rows: rows });
    if (error) {
      console.warn("[keel/composition_fill] sas write refused", error);
      return { written: 0, failed: true };
    }
    return { written: rows.length, failed: false };
  } catch (error) {
    console.warn("[keel/composition_fill] sas write failed", error);
    return { written: 0, failed: true };
  }
}

// ---------------------------------------------------------------------------
// LE GESTE COMPLET — un seul point d'entrée pour les deux lanes
// ---------------------------------------------------------------------------

/**
 * LA RÉPARATION D'UN PLAN, DE BOUT EN BOUT.
 *
 * ⛔ UN SEUL POINT D'ENTRÉE POUR LES DEUX LANES, et c'est délibéré. Les lanes
 * `generate-meal-v1` et `generate-household-meal-v1` portent DEUX
 * implémentations de « cible ÷ livré » qui ne partagent rien (l'une passe par
 * `verdictFor`, l'autre par `mouthDayEnergy` + `householdAnchors`). Elles
 * partagent en revanche leur INDEX — c'est le seul objet commun aux deux — et
 * c'est donc là que la réparation se pose: en amont des deux chaînes, sans
 * qu'aucune d'elles n'ait à savoir qu'elle existe.
 *
 * ⚠️ AUCUN APPEL QUAND IL N'Y A RIEN À RÉPARER. Un plan dont tout résout ne
 * paie ni jeton ni latence: la worklist est vide, on rend l'index de base à
 * l'identité près.
 *
 * ⚠️ ET LE COMPTEUR ④ SE MESURE AVANT, sur l'index de BASE. Le mesurer après
 * rendrait zéro à chaque plan — un lot qui se déclare réussi par construction.
 */
export async function repairPlanComposition(args: {
  db: PendingDbClient;
  baseIndex: CompositionIndex;
  /**
   * LA WORKLIST — tous les termes du plan, PLATS **ET** PRÉPARATIONS.
   *
   * ⛔ LES PRÉPARATIONS EN FONT PARTIE, et c'est mesuré: 41 % de l'énergie et
   * 51 % de la protéine vivent dedans. Une worklist bâtie sur les seuls plats
   * manquerait les aliments du batch cooking — c'est-à-dire les pièces de
   * viande et de poisson, donc précisément ceux qui portent l'énergie.
   *
   * ⚠️ NON PLIÉE, exprès: on cherche un ENSEMBLE DE TERMES, pas une somme. Le
   * prorata d'une préparation ne change aucun nom d'aliment, et plier ici
   * ferait payer un pliage pour rien. C'est `energyInputs` qui est plié.
   *
   * ⚠️ ET ELLE PORTE `group`, quand le modèle l'a déclaré: c'est le seul
   * groupe disponible AVANT l'appel, donc le seul sur lequel le repli par
   * bornes puisse s'appuyer si l'appel échoue.
   */
  inputs: readonly (CompositionInput & { group?: FoodGroupRef | null })[];
  /**
   * LES MÊMES INGRÉDIENTS, PRÉPARATIONS PLIÉES ET AU PRORATA — pour les PARTS.
   *
   * ⛔ DEUX LISTES POUR DEUX QUESTIONS, et les confondre fausserait l'une des
   * deux. « Quels noms ne sais-je pas lire ? » se répond sur l'ensemble des
   * termes; « d'où vient l'énergie de ce plan ? » se répond sur les quantités
   * réellement servies — et une préparation faite pour quatre dîners compterait
   * quatre fois si on ne la pliait pas.
   */
  energyInputs: readonly CompositionInput[];
  meta: { source: string; requestId: string; userId: string };
}): Promise<{
  index: CompositionIndex;
  /** Compteur ④ — inconnus DISTINCTS, mesurés sur l'index de base. */
  unknowns: number;
  /** Compteurs ①②③ — d'où vient l'énergie, une fois la réparation faite. */
  shares: EnergySourceShares;
  /** L'histogramme complet, pour le log. Jamais nominatif. */
  counts: Record<string, number>;
}> {
  const unknowns = unknownTermCount(args.baseIndex, args.inputs);
  const { requests, overCap } = fillRequestsFor(args.baseIndex, args.inputs);
  if (requests.length === 0) {
    return {
      index: args.baseIndex,
      unknowns,
      shares: energySourceShares(
        resolveIngredients(args.baseIndex, args.energyInputs).resolved,
      ),
      counts: { requested: 0, answered: 0, model: 0, group_bounds: 0 },
    };
  }
  const bands = groupBandsFrom(args.baseIndex);
  const answers = await askCompositionFill(requests, args.meta);
  const result = fillCompositions({
    index: args.baseIndex,
    requests,
    answers,
    bands,
    overCap,
  });
  const { index, kept, refused } = withFilledRefs(args.baseIndex, result.filled);
  // ⚠️ SEULES LES LIGNES RETENUES PARTENT AU SAS. Une ligne refusée par la
  // ceinture (`already_resolved`, `unreachable`) ne doit pas se compter vers une
  // promotion: on promouvrait un aliment que le résolveur n'atteint jamais, ou
  // pire, un doublon d'un aliment réel.
  const written = await recordPendingSightings(args.db, kept);
  const counts = { ...result.counts };
  for (const r of refused) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  counts.kept = kept.length;
  counts.sas_written = written.written;
  counts.sas_failed = written.failed ? 1 : 0;
  return {
    index,
    unknowns,
    shares: energySourceShares(resolveIngredients(index, args.energyInputs).resolved),
    counts,
  };
}
