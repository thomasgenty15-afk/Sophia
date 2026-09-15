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
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

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
  // ⚠️ L18b · LE MINUTEUR EST ARRÊTÉ, ET CE N'EST PAS DE L'HYGIÈNE DÉCORATIVE.
  // `Promise.race` abandonne le perdant, elle ne l'annule pas: un `setTimeout`
  // de 15 s laissé courir garde l'isolat en vie 15 s APRÈS que le plan est
  // rendu, une fois par plan portant un inconnu. Le détecteur de fuites de
  // `deno test` le voyait; personne ne le lisait.
  let timer: number | undefined;
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
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), COMPOSITION_FILL_TIMEOUT_MS + 3_000);
      }),
    ]);
    if (typeof raced !== "string") return [];
    return parseCompositionFillAnswers(raced, requests);
  } catch (error) {
    // ⚠️ `warn`, PAS `error`, ET PAS DE `throw`. Un référentiel incomplet est
    // le cas NOMINAL de ce lot; l'échec de sa réparation ne doit pas ressembler
    // à une panne du produit dans les logs de quelqu'un d'astreinte.
    console.warn("[keel/composition_fill] rescue call failed", error);
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Le strict minimum de client dont le sas a besoin — une ÉCRITURE, et depuis
 * `L18b` une LECTURE facultative.
 *
 * ⚠️ `from` EST OPTIONNEL, ET C'EST CE QUI REND `L18b` ADDITIF. Un appelant qui
 * ne l'offre pas — les faux clients des tests, un troisième appelant à venir —
 * retrouve EXACTEMENT le comportement d'avant: aucune lecture, aucun groupe
 * récupéré, le repli s'abstient comme il le faisait. La lecture n'arme pas une
 * garde, elle ouvre un chemin.
 */
export interface PendingDbClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: unknown }>;
  from?: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: readonly string[],
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

// ---------------------------------------------------------------------------
// L18b · LE REPLI PAR BORNES CESSE D'ÊTRE STRUCTURELLEMENT MORT
// ---------------------------------------------------------------------------
//
// ── LE DÉFAUT, MESURÉ ────────────────────────────────────────────────────
// `fillCompositions` prend son groupe à `answer?.foodGroupRef ?? declaredGroup`.
// Quand l'appel de secours se TAIT — panne, timeout, sortie illisible —
// `answer` est `null`, et `declaredGroup` vient de `DishIngredient.group`:
// **0 ligne sur 10 038 en porte un** (mesuré le 2026-08-22, lots `L17`/`L17-0`).
// Le groupe est donc `null`, le terme part en `no_group`, et le repli par
// bornes — le seul chemin du lot 18 « qui ne peut pas échouer » — n'est jamais
// atteint. Écrit autrement: **le jour où le modèle tombe, le lot 18 ne répare
// rien**, exactement comme avant lui. Son propre rapport le dit (§7 point 3) et
// désignait la porte G2 comme le geste n° 1.
//
// ── CE QUE `L18b` FAIT À LA PLACE, ET POURQUOI ÇA NE DÉPEND PAS DE G2 ────
// Le sas connaît déjà le groupe de tout terme qu'il a rencontré une fois. Ce
// groupe a été écrit par une réponse de modèle passée, sur le MÊME terme
// normalisé — la clé primaire de `food_composition_pending` EST ce terme. On le
// relit, et on le donne au repli quand la ligne du plan n'en déclare aucun.
//
// ── ⛔ LES QUATRE CHOSES QUE CE CHEMIN NE FAIT PAS ───────────────────────
// ① ⛔ **AUCUN MATCHER, JAMAIS.** La jointure est une ÉGALITÉ de clé primaire
//    (`in ('term', …)`), sur des termes déjà normalisés par `normalizeTerm`.
//    Rien n'est comparé par préfixe, par distance ou par inclusion: `laitue` ne
//    peut pas atteindre `lait`, parce qu'aucune comparaison autre que `=`
//    n'existe ici. C'est la cicatrice `never-hand-roll-a-matcher-here`, 12 faux
//    positifs sur 12 mesurés.
// ② ⛔ **AUCUN ALIAS.** Rien n'est écrit dans `byAlias`; `withFilledRefs` reste
//    le seul chemin d'index et il ne fait qu'un `bySlug.set`. La règle 3 du lot
//    18 est toujours tenue STRUCTURELLEMENT.
// ③ ⛔ **AUCUNE VALEUR N'EST REPRISE DU SAS.** On lit `food_group_ref`, et
//    RIEN d'autre — pas l'énergie, pas les macros, pas la classe de rendement.
//    Reprendre la valeur d'une ligne vue une fois, ce serait promouvoir sans
//    les trois observations, c'est-à-dire renverser la règle centrale du lot 18
//    depuis son propre chemin chaud. La ligne remplie garde donc le MILIEU DE
//    BANDE et son `residualKcal`, comme tout `group_bounds`.
// ④ ⛔ **UN GROUPE HORS VOCABULAIRE EST JETÉ.** `FOOD_GROUP_REFS` est fermé;
//    une valeur qui n'y est pas ne devient pas un groupe « à peu près ».
//
// ── ⛔ ET IL NE PEUT PAS FAIRE TOMBER LE PLAN ────────────────────────────
// Règle 2 du lot 18. Une lecture en erreur, un client sans `from`, une réponse
// illisible: tous rendent une table VIDE, et une table vide est exactement le
// comportement d'aujourd'hui.

/** La table du sas. Écrite une fois, lue une fois, jamais recopiée ailleurs. */
export const PENDING_TABLE = "food_composition_pending";

/**
 * LES GROUPES QUE LE SAS CONNAÎT DÉJÀ, pour les termes qu'on lui nomme.
 *
 * ⚠️ NE LÈVE JAMAIS, et rend `Map` VIDE sur tout échec — client sans `from`,
 * erreur PostgREST, charge illisible. Le vide est la valeur PLEINE ici: il veut
 * dire « le sas n'apprend rien à ce plan », et le repli s'abstient comme avant.
 */
export async function loadPendingGroups(
  db: PendingDbClient,
  terms: readonly string[],
): Promise<Map<string, FoodGroupRef>> {
  const out = new Map<string, FoodGroupRef>();
  const wanted = [...new Set(terms.filter((t) => typeof t === "string" && t.length > 0))];
  if (wanted.length === 0) return out;
  if (typeof db.from !== "function") return out;
  try {
    // ⛔ DEUX COLONNES, ET LA SECONDE EST LA SEULE QU'ON UTILISE. Sélectionner
    // `*` mettrait l'énergie du sas à portée de main du chemin chaud — et une
    // valeur à portée de main finit par être lue.
    const { data, error } = await db.from(PENDING_TABLE)
      .select("term,food_group_ref")
      .in("term", wanted);
    if (error) {
      console.warn("[keel/composition_fill] sas group read refused", error);
      return out;
    }
    if (!Array.isArray(data)) return out;
    const asked = new Set(wanted);
    for (const row of data) {
      const r = row as Record<string, unknown>;
      const term = String(r?.term ?? "");
      const group = String(r?.food_group_ref ?? "");
      // ⛔ `asked.has` EN PLUS DU `in`: on ne retient que ce qu'on a demandé.
      // Une réponse qui porte une ligne de plus est une réponse qu'on n'a pas
      // comprise, pas une bonne surprise.
      if (!asked.has(term) || out.has(term)) continue;
      if (!(FOOD_GROUP_REFS as readonly string[]).includes(group)) continue;
      out.set(term, group as FoodGroupRef);
    }
    return out;
  } catch (error) {
    console.warn("[keel/composition_fill] sas group read failed", error);
    return out;
  }
}

/**
 * LES DEMANDES, AVEC LE GROUPE QUE LE SAS CONNAÎT DÉJÀ.
 *
 * ⛔ LE GROUPE DÉCLARÉ SUR LA LIGNE DU PLAN GAGNE TOUJOURS. Le sas ne comble
 * qu'un `null`; il ne corrige jamais une déclaration. Un plan qui dit
 * « red_meat » et un sas qui dit « poultry » désignent deux choses, et c'est la
 * ligne du plan qu'on est en train de calculer.
 *
 * PURE: aucune I/O, elle prend la table déjà lue.
 */
export function requestsWithPendingGroups(
  requests: readonly FillRequest[],
  known: ReadonlyMap<string, FoodGroupRef>,
): { requests: FillRequest[]; armedTerms: Set<string> } {
  const armedTerms = new Set<string>();
  const out = requests.map((r) => {
    if (r.declaredGroup !== null) return r;
    const group = known.get(r.term);
    if (group === undefined) return r;
    armedTerms.add(r.term);
    return { ...r, declaredGroup: group };
  });
  return { requests: out, armedTerms };
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
  /**
   * L'APPEL DE SECOURS, INJECTABLE — défaut: `askCompositionFill`.
   *
   * ⚠️ C'EST UNE COUTURE DE BANC, PAS UNE GARDE OPTIONNELLE, et la différence
   * est la cicatrice `optional-gate-params-are-disarmed-gates`: un paramètre
   * facultatif qui ARME une garde laisse la garde désarmée par défaut. Ici le
   * DÉFAUT EST LE CHEMIN DE PRODUCTION, et les deux lanes ne passent rien —
   * l'omettre ne peut donc rien désarmer. Le précédent est dans ce fichier
   * même: `fillPlanComposition` reçoit son `attempt` de l'appelant.
   *
   * ⛔ ET IL EXISTE POUR UNE RAISON MESURÉE: sans réseau, l'appel réel prend
   * **15 s** par plan (le plafond de la course), et un fichier de bancs à onze
   * cas coûterait trois minutes à chaque commit. Un banc trop lent finit
   * désactivé, et une garde désactivée ressemble à une garde qui marche.
   */
  ask?: (
    requests: readonly FillRequest[],
    meta: { source: string; requestId: string; userId: string },
  ) => Promise<FillAnswer[]>;
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
      counts: {
        requested: 0,
        answered: 0,
        model: 0,
        group_bounds: 0,
        sas_group_armed: 0,
        sas_write_skipped_reused_group: 0,
      },
    };
  }
  const bands = groupBandsFrom(args.baseIndex);
  // ⛔ L18b · LES DEUX EN PARALLÈLE, ET LA LECTURE DU SAS N'AJOUTE AUCUNE
  // LATENCE. Elle doit être là AVANT que `fillCompositions` tranche: le repli
  // par bornes s'exécute dans la même passe que la réponse du modèle, et un
  // groupe qui arriverait après n'armerait rien. Elle ne coûte qu'une requête
  // par plan AYANT des inconnus — un plan dont tout résout est sorti quinze
  // lignes plus haut sans rien payer, ni jeton ni requête.
  const [answers, known] = await Promise.all([
    (args.ask ?? askCompositionFill)(requests, args.meta),
    loadPendingGroups(args.db, requests.map((r) => r.term)),
  ]);
  const armed = requestsWithPendingGroups(requests, known);
  const result = fillCompositions({
    index: args.baseIndex,
    requests: armed.requests,
    answers,
    bands,
    overCap,
  });
  const { index, kept, refused } = withFilledRefs(args.baseIndex, result.filled);
  // ⚠️ SEULES LES LIGNES RETENUES PARTENT AU SAS. Une ligne refusée par la
  // ceinture (`already_resolved`, `unreachable`) ne doit pas se compter vers une
  // promotion: on promouvrait un aliment que le résolveur n'atteint jamais, ou
  // pire, un doublon d'un aliment réel.
  //
  // ⛔ L18b · ET UNE LIGNE ARMÉE PAR LE SAS N'Y RETOURNE PAS COMPTER UN TOUR.
  // C'est l'arbitrage central de ce lot, et il va CONTRE le confort. Le
  // compteur `sightings` de `food_composition_pending` est ce qui décide d'une
  // promotion à trois; la RPC le fait monter à chaque écriture, quel que soit
  // l'état de la ligne. Or une ligne armée par le sas est un plan où le modèle
  // n'a RIEN dit sur ce terme: la compter ferait certifier une valeur que ce
  // plan n'a jamais vue, très exactement ce que la règle des trois existe pour
  // interdire (« on promeut la valeur qui a été COMPTÉE trois fois, pas la
  // dernière arrivée », migration 20260821031000). L'armement gagne des
  // JOURNÉES CALCULABLES; il n'achète pas de promotions.
  //
  // ⚠️ Le refus est ÉTROIT, exprès: seules les lignes dont le groupe vient du
  // sas ET dont le modèle ne s'est pas prononcé (`group_bounds`) sont retirées.
  // Une ligne que le modèle a remplie hors bande a bien été VUE par lui: elle
  // compte, comme avant ce lot.
  const toRecord = kept.filter((f) =>
    !(f.source === "group_bounds" && armed.armedTerms.has(f.term))
  );
  const written = await recordPendingSightings(args.db, toRecord);
  const counts = { ...result.counts };
  for (const r of refused) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  counts.kept = kept.length;
  counts.sas_group_armed = armed.armedTerms.size;
  counts.sas_write_skipped_reused_group = kept.length - toRecord.length;
  counts.sas_written = written.written;
  counts.sas_failed = written.failed ? 1 : 0;
  return {
    index,
    unknowns,
    shares: energySourceShares(resolveIngredients(index, args.energyInputs).resolved),
    counts,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// V0-B-bis · « PAS MESURÉ » ET « MESURÉ À ZÉRO » CESSENT D'ÊTRE LE MÊME OCTET
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT, TEL QU'IL ÉTAIT ÉCRIT DANS LES DEUX LANES ──────────────────
//
//   let compositionFill = { unknowns: 0, shares: {}, counts: {} };
//   if (composition) {
//     try { … compositionFill = { unknowns: repair.unknowns, … }; }
//     catch (error) { console.warn(`[${FN_NAME}] composition fill failed`, error); }
//   }
//
// DEUX chemins écrivaient `0` et `{}` — c'est-à-dire « mesuré, aucun inconnu »
// — sur un plan que le sas n'a JAMAIS regardé: `composition` absent, et
// `repairPlanComposition` qui lève. Ces deux valeurs sont exactement celles que
// `V0-B` vient d'effacer de 180 lignes, et `composition_fill_weekly` les
// compterait comme un sans-faute parfait.
//
// ⛔ ET LE `catch` ÉTAIT MUET. Un `console.warn` n'est pas un compteur: il ne se
// groupe pas, il ne se compte pas, et un remplissage qui lève en boucle
// ressemblerait à un remplissage qui marche. « Un lot désarmé ressemble à un lot
// qui marche » — c'est le mode d'échec principal de ce dépôt.
//
// ── POURQUOI ICI, ET PAS DANS CHAQUE LANE ─────────────────────────────────
// Le défaut était le MÊME, à la virgule près, dans les deux lanes. Le réparer
// deux fois, c'est accepter que la troisième lane le réintroduise. Le seul
// endroit qui décide si un plan a été mesuré vit désormais dans le module qui
// porte déjà la promesse « cet appel ne peut pas faire tomber le plan ».
//
// ⚠️ LE CHEMIN NOMINAL EST INCHANGÉ, ET C'EST UNE CONTRAINTE, PAS UN HASARD:
// quand le remplissage tourne, la valeur écrite est le MÊME nombre et le MÊME
// objet qu'avant. Ce lot n'ajoute pas un état au succès, il en retire un au
// silence.

/** Pourquoi la composition de ce plan n'a PAS été mesurée. */
export type CompositionFillMiss =
  /** Aucun référentiel: `loadCompositionIndex` a échoué ou rendu `null`. */
  | "no_index"
  /**
   * `repairPlanComposition` a levé. Le module promet de ne jamais lever — si
   * cette valeur apparaît, c'est cette promesse qui a été cassée en amont, et
   * elle doit se voir.
   */
  | "threw";

export type CompositionFillOutcome =
  | {
    measured: true;
    unknowns: number;
    shares: Record<string, number>;
    counts: Record<string, number>;
  }
  | { measured: false; reason: CompositionFillMiss };

/**
 * LES DEUX COLONNES DU PLAN, DEPUIS L'ISSUE DU REMPLISSAGE.
 *
 * ⛔ `null` VEUT DIRE « PERSONNE N'A MESURÉ », et ce n'est PAS zéro. La colonne
 * accepte l'absence depuis `V0-B` (`drop default`, `drop not null`) et la RPC
 * `write_student_meal_plan` la laisse passer depuis `V0-B-bis`. Les trois
 * porteurs doivent tenir ensemble: si un seul refabrique un zéro, la vue
 * `composition_fill_weekly` remonte un sans-faute imaginaire.
 */
export function compositionFillColumns(outcome: CompositionFillOutcome): {
  composition_unknowns: number | null;
  composition_energy_sources: Record<string, number> | null;
} {
  return outcome.measured
    ? {
      composition_unknowns: outcome.unknowns,
      composition_energy_sources: outcome.shares,
    }
    : { composition_unknowns: null, composition_energy_sources: null };
}

/**
 * LE REMPLISSAGE, AVEC SON ISSUE NOMMÉE — les trois chemins, au même endroit.
 *
 * ⚠️ L'INDEX RENDU EST TOUJOURS UTILISABLE: l'index réparé si l'appel a abouti,
 * l'index de base s'il a levé, `null` s'il n'y en avait pas. Aucun appelant n'a
 * à savoir lequel des trois il tient — c'est la même promesse que
 * `repairPlanComposition`, un cran plus haut.
 */
export async function fillPlanComposition(args: {
  baseIndex: CompositionIndex | null;
  attempt: (baseIndex: CompositionIndex) => Promise<{
    index: CompositionIndex;
    unknowns: number;
    shares: EnergySourceShares;
    counts: Record<string, number>;
  }>;
  /**
   * LE COMPTEUR DE L'ÉCHEC. Appelé une fois par plan NON mesuré, avec son
   * motif. C'est ce qui remplace le `console.warn` muet: un appelant qui
   * l'ignore choisit explicitement de ne pas compter, au lieu de ne pas compter
   * par défaut.
   */
  onMiss?: (reason: CompositionFillMiss, error: unknown) => void;
}): Promise<
  { index: CompositionIndex | null; outcome: CompositionFillOutcome }
> {
  if (!args.baseIndex) {
    args.onMiss?.("no_index", null);
    return { index: null, outcome: { measured: false, reason: "no_index" } };
  }
  try {
    const repair = await args.attempt(args.baseIndex);
    return {
      index: repair.index,
      outcome: {
        measured: true,
        unknowns: repair.unknowns,
        shares: repair.shares as unknown as Record<string, number>,
        counts: repair.counts,
      },
    };
  } catch (error) {
    args.onMiss?.("threw", error);
    // ⛔ L'INDEX DE BASE EST RENDU INTACT, exactement comme avant: le `catch`
    // des deux lanes laissait `composition` à sa valeur d'avant l'appel.
    return {
      index: args.baseIndex,
      outcome: { measured: false, reason: "threw" },
    };
  }
}
