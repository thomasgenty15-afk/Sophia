/**
 * LE BUDGET D'UNE GÉNÉRATION — un compteur de rattrapages, une échéance.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — MESURÉ LE 2026-09-10
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Les deux lanes de plan portaient SEPT compteurs de relance indépendants
 * (exclusions 1, régime 1, échange 1, séparation 1, non-nourris **3**, densité
 * 1, plat dédié 1), plus la composition initiale. Aucun ne connaissait les
 * autres. Pire cas de la lane du foyer: **dix appels modèle** dans une seule
 * requête HTTP, chacun avec son propre plafond de 300 à 380 secondes, et
 * jusqu'à trente appels fournisseur derrière eux (`gemini.ts` défaut
 * `MAX_RETRIES = 10` × la chaîne de replis).
 *
 * ⛔ ET AUCUN N'AVAIT D'ÉCHÉANCE. `wallMs()` existait dans les deux lanes —
 * il OBSERVAIT. Il n'a jamais interrompu quoi que ce soit. Le worker edge, lui,
 * coupe à 400 s : la requête mourait au milieu, et le travail déjà fait —
 * mesuré, réparé, prêt à écrire — partait avec elle.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE GARANTIT, ET CE QU'IL NE GARANTIT PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * IL GARANTIT :
 *  · qu'on ne demande jamais un rattrapage de plus que le budget;
 *  · qu'on n'en demande pas un dont on sait qu'il ne rentrera pas dans le temps
 *    restant — un appel lancé à trente secondes de la coupure est un appel
 *    facturé, jamais lu, et la nuit du 2026-08-19 en a compté 137;
 *  · qu'il reste TOUJOURS une queue (`reserveMs`) pour ce qui vient après le
 *    dernier appel modèle: la mesure finale, les ceintures, le verrou de
 *    maison, l'écriture. Un plan réparé et non écrit ne vaut rien.
 *
 * ⛔ IL NE GARANTIT PAS QUE LE PLAN EST CONFORME. Un budget épuisé rend la
 * dernière version UTILISABLE, ce qui n'est pas la même chose qu'une version
 * juste. Le motif (`repair_budget_exhausted` / `time_budget_exhausted`) est
 * écrit pour que « livré » ne se lise jamais « conforme ».
 *
 * ⛔ ET IL NE DÉCIDE JAMAIS DE LA SÉCURITÉ. Les contrôles déterministes
 * tournent que le budget soit plein ou vide: le verrou de règles de maison rend
 * 422, la ceinture d'exclusion refuse, les bornes rabotent. Une version portant
 * un allergène interdit n'est pas un repli — c'est une erreur.
 *
 * ── LE TEMPS EST INJECTÉ ───────────────────────────────────────────────────
 * `now()` est un paramètre. Un budget qui lit l'horloge du système ne se teste
 * qu'en dormant, et un test qui dort est un test qu'on finit par sauter.
 */

import {
  PLAN_MODEL_REPAIR_BUDGET,
  PLAN_REQUEST_BUDGET_MS,
  PLAN_TAIL_RESERVE_MS,
} from "./generation_model.ts";
// ⟳ 2026-09-11 · LOT 6 — l'AXE DE PRIORITÉ du chantier, et la traduction
// étiquette → nature. La table de réserve ci-dessous reste le repli des lanes
// dont la pesée n'a pas encore été remontée au-dessus des rattrapages.
import { REPAIR_DEFECT_KINDS, repairKindOf } from "./plan_repair_loop.ts";

/** Le vocabulaire FERMÉ des refus. Un motif absent d'ici est un bug. */
export const PLAN_BUDGET_REFUSALS = [
  "repair_budget_exhausted",
  "time_budget_exhausted",
  "repair_reserved",
] as const;
export type PlanBudgetRefusal = typeof PLAN_BUDGET_REFUSALS[number];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ DEUX SLOTS, SEPT DEMANDEURS, ET L'ORDRE DU CODE N'EST PAS L'ORDRE DES
 *    PRIORITÉS. C'EST LE PIÈGE DE CE LOT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le pipeline de la lane du foyer appelle, DANS CET ORDRE:
 *
 *     protéine → exclusion → échange → séparation → non-nourris → densité → plat dédié
 *
 * Un simple compteur partagé à deux donnerait donc les deux slots à la
 * PROTÉINE et à l'EXCLUSION, et la réparation de DENSITÉ — celle qui a fait
 * passer le foyer `cinq` de six assiettes dans les bornes à douze sur quinze —
 * ne partirait plus jamais. On aurait « réparé » le budget en supprimant le
 * rattrapage qui marche.
 *
 * ── CE QUE CETTE TABLE DIT ─────────────────────────────────────────────────
 * Pour chaque rattrapage: **combien de slots réservés lui succèdent encore**
 * dans SA lane. Un rattrapage n'est accordé que s'il en reste assez APRÈS lui:
 *
 *     accordé  ⇔  used + reservedAfter(label) < allowed
 *
 * L'ordre de priorité qu'elle encode, du plus fort au plus faible:
 *   1. **sécurité** — `exclusion_retry` (un aliment interdit servi);
 *   2. **densité** — `density_repair`, `dedicated_repair` (la mesure les donne
 *      gagnants), et côté solo `composition_retry` (le verdict d'énergie: trois
 *      plans de perte de poids sur trois sortaient hors bande);
 *   3. **livraison** — `unfed_retry`, `empty_slots_retry`: ils prennent le
 *      premier slot quand la sécurité n'en a pas eu besoin;
 *   4. **qualité** — `protein_anchor_retry`, `swap_retry`,
 *      `preference_split_retry`: à budget 2, ils ne partent jamais.
 *
 * ⛔ TROIS CLASSES RÉSERVÉES NE TIENNENT PAS DANS DEUX SLOTS, et c'est le vrai
 * arbitrage de ce lot. Réserver aussi la livraison ferait refuser la sécurité
 * (`0 + 2 < 2` est faux), c'est-à-dire l'inverse exact de ce qu'on veut. Les
 * deux réservés sont donc **sécurité** et **densité**; la livraison passe en
 * débordement, sur le slot que la sécurité n'a pas pris.
 *
 * ⚠️ CONSÉQUENCE ASSUMÉE: à budget 2, `protein_anchor_retry` ne part JAMAIS —
 * deux slots réservés le suivent toujours. Ce n'est pas un oubli. Le plancher
 * protéique reste mesuré, dit dans le constat, et corrigé déterministement
 * quand c'est possible; ce qui disparaît est l'appel modèle qui le redemandait.
 *
 * ⛔ ET AUCUNE DE CES PRIORITÉS N'EST UNE GARDE DE SÉCURITÉ. Les contrôles
 * déterministes tournent budget plein ou vide: le verrou de règles de maison
 * rend 422, la ceinture refuse, les bornes rabotent. Un budget épuisé rend la
 * dernière version UTILISABLE — ce qui n'est pas « conforme ».
 */
export const PLAN_REPAIR_RESERVED_AFTER: Readonly<Record<string, number>> =
  Object
    .freeze({
      // lane du foyer, dans l'ordre d'exécution
      protein_anchor_retry: 2, // exclusion + densité le suivent
      exclusion_retry: 1, // la densité le suit
      swap_retry: 2, // qualité : il cède à la densité comme à la sécurité
      preference_split_retry: 2, // idem
      unfed_retry: 1, // livraison : une bouche sans repas passe devant la qualité
      density_repair: 0,
      dedicated_repair: 0,
      // lane solo, dans l'ordre d'exécution
      empty_slots_retry: 1, // le verdict d'énergie le suit
      composition_retry: 0,
    });

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT 6 — CETTE TABLE A ÉTÉ RETIRÉE, PUIS REMISE. VOICI POURQUOI
// ══════════════════════════════════════════════════════════════════════════
//
// La tentative: remplacer ces nombres — accordés à la main, sur l'ORDRE
// D'EXÉCUTION du générateur — par une règle qui décide sur la NATURE du
// défaut (l'axe du chantier: sécurité, présence des repas, grammage,
// protéines, préférences), avec la DERNIÈRE tentative réservée à la sécurité
// et à la livraison.
//
// ⛔ MESURÉ, ET C'ÉTAIT UNE RÉGRESSION. Sur l'ordre réel de la lane du foyer
// (`protein`, `exclusion`, `swap`, `preference`, `unfed`, `density`,
// `dedicated`), cette règle accordait `protein_anchor_retry` puis
// `exclusion_retry` — et **`density_repair` ne partait plus**. C'est la
// réparation qui a fait passer le foyer `cinq` de 6 assiettes dans les bornes
// à 12 sur 15.
//
// LA RAISON EST STRUCTURELLE, PAS UN RÉGLAGE À CORRIGER. `protein` s'exécute
// EN PREMIER et `density` en AVANT-DERNIER, alors que le chantier place
// `sizing` AU-DESSUS de `protein`. Une décision prise au site de `protein` ne
// peut pas savoir si `density` aura besoin d'un slot: la mesure de densité
// n'existe pas encore à cet endroit du fichier. C'est exactement ce que ces
// nombres encodent — « combien de classes plus prioritaires me suivent ».
//
// ⛔ CE QUI LÈVE LA CONTRADICTION EST LA BOUCLE ELLE-MÊME, pas un meilleur
// barème: collecter TOUS les défauts d'abord, puis en faire UNE instruction.
// Sans réservation, parce que sans concurrence. Cela demande de hisser la
// mesure au-dessus du premier rattrapage — une refonte du corps du
// générateur, pas un rebranchement. `plan_repair_loop.ts` porte la décision,
// prête et éprouvée; il lui manque cet ordre-là.
//
// ⚠️ EN ATTENDANT, CES NOMBRES RESTENT LA MEILLEURE APPROXIMATION CONNUE, et
// ils ont un défaut nommé: ils décrivent une position dans un fichier. Déplacer
// un bloc dans le générateur les rend faux EN SILENCE.

export function planRepairReservedAfter(
  label: string,
  /**
   * ⟳ 2026-09-11 · LOT 6 — LES NATURES DE DÉFAUT RÉELLEMENT CONSTATÉES.
   *
   * ⛔ ABSENT = L'ANCIEN COMPORTEMENT, à l'aveugle, par la table. C'est le cas
   * de la lane individuelle, dont la pesée n'a pas été remontée: elle garde
   * des slots pour des défauts qu'elle n'a pas encore regardés.
   *
   * PRÉSENT = on a MESURÉ. La réserve devient le nombre de natures STRICTEMENT
   * plus prioritaires qui sont vraiment en défaut — zéro quand il n'y en a
   * aucune. C'est ce qui rend vrai « un défaut protéique seul peut déclencher
   * une tentative »: plus rien à lui garder.
   */
  pending?: ReadonlySet<string>,
): number {
  if (pending) {
    const mine = REPAIR_DEFECT_KINDS.indexOf(repairKindOf(label));
    let n = 0;
    for (const k of pending) {
      const i = REPAIR_DEFECT_KINDS.indexOf(
        k as (typeof REPAIR_DEFECT_KINDS)[number],
      );
      if (i >= 0 && i < mine) n++;
    }
    return n;
  }
  const v = PLAN_REPAIR_RESERVED_AFTER[String(label ?? "").trim()];
  // ⚠️ UN LABEL INCONNU EST TRAITÉ COMME LE PLUS FAIBLE, pas comme le plus
  // fort. Un rattrapage neuf qu'on oublie d'inscrire ici ne doit pas prendre le
  // slot de la densité en silence — il doit se faire refuser et se voir.
  return Number.isFinite(v) ? (v as number) : 2;
}

export type PlanBudgetAsk = {
  /** Le rattrapage peut partir. */
  readonly granted: boolean;
  /** Renseigné si et seulement si `granted === false`. */
  readonly refusal: PlanBudgetRefusal | null;
  /** Le timeout à passer à cet appel, déjà borné par le temps restant. */
  readonly timeoutMs: number;
};

export type PlanBudgetSnapshot = {
  readonly repairs_allowed: number;
  readonly repairs_used: number;
  readonly repairs_asked: number;
  readonly repairs_refused: Readonly<Record<string, number>>;
  readonly charged: readonly string[];
  readonly provider_attempts: number;
  readonly elapsed_ms: number;
  readonly remaining_ms: number;
  readonly usable_ms: number;
  readonly reserve_ms: number;
  readonly total_ms: number;
};

export type PlanBudget = {
  /** Temps écoulé depuis l'ouverture. */
  elapsedMs(): number;
  /** Ce qui reste avant la coupure, réserve COMPRISE. */
  remainingMs(): number;
  /** Ce qui reste avant la coupure, réserve DÉDUITE. Jamais négatif. */
  usableMs(): number;
  /** Le timeout d'un appel: son plafond, raboté par le temps utilisable. */
  timeoutFor(capMs: number): number;
  /** Reste-t-il un rattrapage ET assez de temps pour lui ? Ne consomme rien. */
  wouldGrant(label: string, minMs: number): PlanBudgetAsk;
  /**
   * Demande un rattrapage. CONSOMME le budget si et seulement s'il est accordé.
   * `label` sert au journal — on veut savoir QUI a mangé les deux.
   */
  askRepair(
    label: string,
    minMs: number,
    capMs: number,
    pending?: ReadonlySet<string>,
  ): PlanBudgetAsk;
  /** Les tentatives fournisseur réellement faites, pour le journal. */
  noteProviderAttempts(n: number): void;
  /** Le motif dominant, ou `null` si rien n'a été refusé. */
  refusal(): PlanBudgetRefusal | null;
  snapshot(): PlanBudgetSnapshot;
};

export function createPlanBudget(args: {
  now: () => number;
  startedAtMs: number;
  totalMs?: number;
  reserveMs?: number;
  repairs?: number;
}): PlanBudget {
  const now = args.now;
  const startedAtMs = args.startedAtMs;
  const totalMs = Number.isFinite(args.totalMs) && (args.totalMs as number) > 0
    ? Math.floor(args.totalMs as number)
    : PLAN_REQUEST_BUDGET_MS;
  const reserveMs =
    Number.isFinite(args.reserveMs) && (args.reserveMs as number) >= 0
      ? Math.floor(args.reserveMs as number)
      : PLAN_TAIL_RESERVE_MS;
  const allowed = Number.isFinite(args.repairs) && (args.repairs as number) >= 0
    ? Math.floor(args.repairs as number)
    : PLAN_MODEL_REPAIR_BUDGET;

  let used = 0;
  let asked = 0;
  let providerAttempts = 0;
  const charged: string[] = [];
  const refused: Record<string, number> = {};
  let lastRefusal: PlanBudgetRefusal | null = null;

  const elapsedMs = () => Math.max(0, Math.floor(now() - startedAtMs));
  const remainingMs = () => totalMs - elapsedMs();
  const usableMs = () => Math.max(0, remainingMs() - reserveMs);

  const timeoutFor = (capMs: number): number => {
    const cap = Number.isFinite(capMs) && capMs > 0 ? Math.floor(capMs) : 0;
    return Math.max(0, Math.min(cap, usableMs()));
  };

  const verdict = (
    label: string,
    minMs: number,
    capMs: number,
    pending?: ReadonlySet<string>,
  ): PlanBudgetAsk => {
    // ⛔ L'ORDRE COMPTE. On regarde le compteur AVANT l'horloge: un budget vide
    // est un fait stable, un temps court est une course. Les intervertir ferait
    // dire « time_budget_exhausted » à une requête rapide qui a simplement
    // dépensé ses deux rattrapages — et on chercherait un problème de latence
    // qui n'existe pas.
    if (used >= allowed) {
      return {
        granted: false,
        refusal: "repair_budget_exhausted",
        timeoutMs: 0,
      };
    }
    // ⛔ LA RÉSERVE PASSE AVANT L'HORLOGE ELLE AUSSI. Un rattrapage écarté au
    // profit d'un plus prioritaire n'est pas « le budget est épuisé »: il en
    // reste, il est promis. Confondre les deux ferait chercher un budget trop
    // petit là où c'est l'ordre du pipeline qui décide.
    // ⛔ LA RÉSERVE PASSE AVANT L'HORLOGE ELLE AUSSI. Un rattrapage écarté au
    // profit d'un plus prioritaire n'est pas « le budget est épuisé »: il en
    // reste, il est promis. Confondre les deux ferait chercher un budget trop
    // petit là où c'est l'ordre du pipeline qui décide.
    if (used + planRepairReservedAfter(label, pending) >= allowed) {
      return { granted: false, refusal: "repair_reserved", timeoutMs: 0 };
    }
    const floor = Number.isFinite(minMs) && minMs > 0 ? Math.floor(minMs) : 0;
    const timeoutMs = timeoutFor(capMs);
    if (timeoutMs < floor) {
      return { granted: false, refusal: "time_budget_exhausted", timeoutMs: 0 };
    }
    return { granted: true, refusal: null, timeoutMs };
  };

  return {
    elapsedMs,
    remainingMs,
    usableMs,
    timeoutFor,
    wouldGrant(label: string, minMs: number) {
      return verdict(label, minMs, totalMs);
    },
    askRepair(
      label: string,
      minMs: number,
      capMs: number,
      pending?: ReadonlySet<string>,
    ) {
      asked += 1;
      const v = verdict(label, minMs, capMs, pending);
      if (v.granted) {
        used += 1;
        charged.push(String(label ?? "").trim() || "unnamed");
        return v;
      }
      const key = v.refusal as string;
      refused[key] = (refused[key] ?? 0) + 1;
      lastRefusal = v.refusal;
      return v;
    },
    noteProviderAttempts(n: number) {
      const k = Number(n);
      if (Number.isFinite(k) && k > 0) providerAttempts += Math.floor(k);
    },
    refusal() {
      return lastRefusal;
    },
    snapshot(): PlanBudgetSnapshot {
      return {
        repairs_allowed: allowed,
        repairs_used: used,
        repairs_asked: asked,
        repairs_refused: { ...refused },
        charged: [...charged],
        provider_attempts: providerAttempts,
        elapsed_ms: elapsedMs(),
        remaining_ms: remainingMs(),
        usable_ms: usableMs(),
        reserve_ms: reserveMs,
        total_ms: totalMs,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LA MÉTA D'UN APPEL DE PLAN — écrite UNE fois, pour TREIZE sites
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI UNE FONCTION ET PAS TREIZE LITTÉRAUX. Les deux lanes portaient
// treize appels `generateWithGemini`, chacun recopiant `model`, `httpTimeoutMs`
// et `reasoningEffort` à la main. Le résultat mesuré: AUCUN ne passait
// `maxRetries` (défaut 10), AUCUN ne bornait la chaîne de replis (qui finissait
// sur `gpt-5.4-mini`, le modèle mesuré comme servant des aliments interdits),
// et aucun ne connaissait le temps déjà dépensé par les douze autres.
//
// Une clé oubliée sur un site est invisible: le site marche, il marche
// simplement AUTREMENT. Avec un seul constructeur, un test de câblage compte
// les appels et compte les constructeurs — s'ils divergent, quelqu'un a
// rebranché un littéral.

import type { GenerateWithGeminiMeta } from "../gemini.ts";
import {
  keelGenerationFallbackModel,
  keelGenerationModel,
  PLAN_COMPOSITION_REASONING_EFFORT,
  PLAN_MODEL_MAX_RETRIES,
  PLAN_REASONING_EFFORT,
  PLAN_REPAIR_REASONING_EFFORT,
  PLAN_SERVICE_TIER,
} from "./generation_model.ts";

/**
 * Les trois natures d'appel d'une génération, et rien d'autre.
 * `composition` = la lane solo · `composition_household` = la lane du foyer
 * (le seul appel à `high` mesuré) · `repair` = tout rattrapage.
 */
export const PLAN_CALL_KINDS = [
  "composition",
  "composition_household",
  "repair",
] as const;
export type PlanCallKind = typeof PLAN_CALL_KINDS[number];

export function planCallEffort(kind: PlanCallKind) {
  if (kind === "composition_household") {
    return PLAN_COMPOSITION_REASONING_EFFORT;
  }
  if (kind === "repair") return PLAN_REPAIR_REASONING_EFFORT;
  return PLAN_REASONING_EFFORT;
}

/**
 * La méta d'un appel de plan : modèle, effort, palier, replis bornés, timeout
 * raboté par l'échéance commune.
 *
 * ⚠️ `capMs` reste à l'appelant — l'adoption d'un brouillon a son propre
 * plafond (`DRAFT_ADOPTION_MODEL_TIMEOUT_MS`), et la composition du foyer le
 * sien. Ce qu'on centralise, c'est le RABOTAGE par le temps restant, pas le
 * plafond lui-même.
 *
 * ⛔ SANS BUDGET, LE COMPORTEMENT EST CELUI D'AVANT (le plafond entier). C'est
 * voulu: un appelant non encore câblé ne doit pas voir ses timeouts tomber à
 * zéro parce qu'il a oublié un argument.
 */
export function planCallMeta(args: {
  source: string;
  requestId: string;
  userId?: string | null;
  kind: PlanCallKind;
  capMs: number;
  budget?: PlanBudget | null;
}): GenerateWithGeminiMeta {
  const cap = Number.isFinite(args.capMs) && args.capMs > 0
    ? Math.floor(args.capMs)
    : 0;
  const timeoutMs = args.budget ? args.budget.timeoutFor(cap) : cap;
  const meta: GenerateWithGeminiMeta = {
    source: args.source,
    requestId: args.requestId,
    model: keelGenerationModel(),
    httpTimeoutMs: timeoutMs,
    reasoningEffort: planCallEffort(args.kind),
    serviceTier: PLAN_SERVICE_TIER,
    maxRetries: PLAN_MODEL_MAX_RETRIES,
    // Les deux emplacements que `pickFallbackChainForAttempt` remplirait sinon
    // avec `gpt-5.4-mini` puis `gpt-5.4-nano`. `push` déduplique: la chaîne
    // devient ["gpt-5.6-luna", "gpt-5.6-sol"].
    secondFallbackModel: keelGenerationFallbackModel(),
    thirdFallbackModel: keelGenerationFallbackModel(),
  };
  if (args.userId !== undefined && args.userId !== null) {
    meta.userId = args.userId;
  }
  // ⟳ 2026-09-11 · LOT 6 — LE BUDGET COMPTE LES TRANSMISSIONS, PAS LES APPELS.
  //
  // ⛔ `provider_attempts` ÉTAIT UN CHAMP QUE PERSONNE NE NOURRISSAIT. Il
  // existait dans le `snapshot()`, il partait sur la ligne écrite, et il valait
  // TOUJOURS ZÉRO: `noteProviderAttempts` n'avait aucun appelant vivant
  // (mesuré le 2026-09-11). Un compteur à zéro se lit « aucune relance », ce qui
  // est exactement l'inverse de ce qu'il faut savoir quand un plan a été long.
  //
  // ⛔ ET UN APPEL LOGIQUE N'EST PAS UNE TRANSMISSION. `maxRetries` autorise une
  // passe, mais CHAQUE passe parcourt une chaîne de replis: un seul
  // `askRepair` peut partir trois fois au fournisseur. Le chantier l'exige —
  // « échecs et replis inclus, pas seulement les appels logiques ».
  //
  // ⚠️ POSÉ ICI PARCE QUE C'EST LE SEUL CONSTRUCTEUR DE MÉTA DES LANES DE PLAN,
  // et qu'un test épingle qu'aucun appel de plan ne le contourne
  // (`plan_call_wiring_test.ts`). Le brancher au site d'appel aurait laissé
  // chaque site libre de l'oublier.
  if (args.budget) {
    const budget = args.budget;
    meta.onProviderAttempt = () => budget.noteProviderAttempts(1);
  }
  return meta;
}
