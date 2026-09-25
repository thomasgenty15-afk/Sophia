/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — ADOPTER, C'EST ÉCRIRE LE BROUILLON RELU. Pas en recomposer un autre.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Magasin: `draft_store.ts` (table `student_meal_drafts`, migration
 * 20260906230000). Garde: `final_plan_gate.ts`. Péremption des protections:
 * `safety_fingerprint.ts`.
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, ET IL A ÉTÉ MESURÉ ────────────────────
 * `writeFromDraft` re-postait la MÊME requête avec `adopting_draft: true`.
 * Ce n'était pas « écrire l'aperçu »: c'était une SECONDE composition
 * complète, avec les cinq relances de qualité DÉSARMÉES (le chemin d'adoption
 * ne doit pas faire attendre). Deux plans, donc, dont la personne n'a relu que
 * le premier.
 *
 *   · run réel: aperçu = **6 boîtes**, ligne écrite en base = **0 boîte**,
 *     HTTP **200**. Personne n'a menti; ce sont deux plans;
 *   · et DEUX appels modèle dans une seule requête passent le plafond de la
 *     passerelle hébergée: **504 mesuré à 150 008 ms**, exactement la limite
 *     de 150 s. Le geste ne rendait donc parfois RIEN.
 *
 * ── POURQUOI ON REJOUE LE PAYLOAD, ET PAS UNE RECOMPOSITION ──────────────
 * Recomposer « à l'identique » est impossible: le modèle n'est pas une
 * fonction, la même requête ne rend pas le même plan, et les relances de
 * qualité changent le résultat qu'on désarme ou non. Le seul plan dont on
 * puisse dire « c'est celui qui a été relu » est CELUI QUI A ÉTÉ STOCKÉ.
 * `write_payload` part donc en `p_payload` MOT POUR MOT — c'est la propriété
 * que ce lot existe pour tenir, et le test nominal l'épingle par une égalité
 * profonde sur l'objet entier.
 *
 * ⛔ AUCUN APPEL AU MODÈLE DE GÉNÉRATION N'EST FAIT DANS CE FICHIER, ni
 * directement ni par un module qu'il importe. C'est la raison d'être du lot, et
 * `draft_adopt_test.ts` l'épingle en RELISANT ce fichier: la présence d'un des
 * trois symboles d'appel modèle du dépôt le fait rougir. Un second appel
 * réintroduit ici ramènerait les deux défauts d'un coup.
 *
 * ── LE VOCABULAIRE FERMÉ DES REFUS ───────────────────────────────────────
 * Huit motifs, et pas un de plus (`ADOPT_REFUSALS`). Cinq viennent de la LIGNE
 * (`adoptability`, magasin), trois se décident ici:
 *
 *   · 404 `draft_not_found`        — pas de ligne, ou pas la sienne;
 *   · 410 `draft_expired`          — l'aperçu décrit une semaine qu'elle n'a
 *                                    plus; recomposer est le seul geste;
 *   · 409 `draft_not_ready`        — la composition n'a pas fini;
 *   · 409 `draft_failed`           — elle a échoué;
 *   · 409 `draft_already_adopted`  — adopté, mais SANS identifiant à ouvrir;
 *     (adopté AVEC identifiant: 200 `already_written: true`, rien n'est écrit)
 *   · 409 `draft_stale`            — les protections ou le code ont bougé;
 *   · 409 `plan_gate_refused`      — la garde finale refuse le payload;
 *   · 409 `plan_not_written`       — la base a refusé l'écriture.
 *
 * Un motif inventé au point d'appel est un motif que personne ne cherchera dans
 * les journaux, et dont aucun écran n'aurait rien à dire.
 *
 * ── CE QUE CE MODULE NE FAIT PAS, ET IL FAUT LE LIRE ─────────────────────
 * ① IL NE RANGE PAS LA NOTE DU BROUILLON. `classifyAndPersistDraftNote` a
 *    besoin de `planVocabularyOf(dishes, preparations)` et du contexte propre à
 *    chaque lane; l'importer ici ferait de ce module un troisième générateur.
 *    LA COUTURE EST EXPLICITE: la sortie 200 porte `postWrite`, qui rend à
 *    l'appelant ce que `adoption_context` gardait pour lui (le verdict de note,
 *    le roster, la langue de contenu, le fuseau, et le `measured` de la lane
 *    solo). ⛔ L'APPELANT DOIT FAIRE CETTE ÉTAPE. Un effet de bord perdu est
 *    invisible: `postWrite.available` dit s'il y avait quelque chose à faire,
 *    précisément pour qu'un `postWrite` vide ne ressemble pas à « rien à
 *    ranger ».
 * ② IL NE REJOUE PAS LE PRÉ-CONTRÔLE DE CHEVAUCHEMENT. `write_student_meal_plan`
 *    EST l'autorité sur les fenêtres vivantes et refuse par son propre nom;
 *    un second contrôle ici divergerait du sien au premier ajustement.
 * ③ IL NE CRÉE JAMAIS DE CLIENT. Il en reçoit un, comme tout le dossier: un
 *    module qui fabrique son `service_role` est un module qu'aucun test ne peut
 *    faire échouer.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  adoptability,
  type DraftLane,
  loadDraftForAdoption,
  contractVersionOf,
  DRAFT_CONTRACT_VERSION,
} from "./draft_store.ts";
import {
  type SafetyFingerprintInput,
  safetyFingerprintOf,
} from "./safety_fingerprint.ts";
import {
  FINAL_GATE_POLICY_LOT_4,
  HOUSEHOLD_BETA_ESSENTIALS,
  finalGateDelivery,
  finalPlanGate,
  asGatePlan,
  type GateContext,
  type GatePlan,
  type GateRefusal,
} from "./final_plan_gate.ts";
import { type DietaryRegime, parseDietaryRegime } from "./dietary_regime.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";

// ===========================================================================
// 1. LE VOCABULAIRE — fermé, et il porte son statut HTTP avec lui
// ===========================================================================

export const ADOPT_REFUSALS = [
  "draft_not_found",
  "draft_expired",
  "draft_not_ready",
  "draft_failed",
  "draft_already_adopted",
  "draft_stale",
  "plan_gate_refused",
  "plan_not_written",
] as const;
export type AdoptRefusal = (typeof ADOPT_REFUSALS)[number];

export type AdoptStatus = 200 | 404 | 409 | 410;

/**
 * LE STATUT VIT À CÔTÉ DU MOTIF, dans une seule table.
 *
 * ⚠️ `410` ET PAS `409` POUR LA PÉREMPTION, et c'est une distinction produit:
 * « il a expiré » se répare en recomposant (l'écran relance), « il n'est pas
 * prêt » se répare en attendant. Les confondre enverrait l'écran attendre une
 * ligne qui ne reviendra jamais.
 */
const STATUS_OF: Readonly<Record<AdoptRefusal, AdoptStatus>> = Object.freeze({
  draft_not_found: 404,
  draft_expired: 410,
  draft_not_ready: 409,
  draft_failed: 409,
  draft_already_adopted: 409,
  draft_stale: 409,
  plan_gate_refused: 409,
  plan_not_written: 409,
});

/** Pourquoi un brouillon est périmé. Deux raisons, deux réparations. */
export type AdoptStaleReason = "safety" | "source";

/**
 * CE QUE LA GARDE FINALE A FAIT.
 *
 * ⛔ TROIS VALEURS ET PAS DEUX. `context_unavailable` dit que la garde n'a pas
 * tourné faute de contexte gelé — c'est-à-dire une garde SAUTÉE, et le dépôt
 * porte la cicatrice d'une garde sautée qui ressemblait à une garde passée.
 */
export type AdoptGateVerdict =
  | "ok"
  | "refused"
  | "context_unavailable"
  /**
   * ⟳ 2026-09-15 · BÊTA 2C — LA GARDE N'A PAS TOURNÉ DANS CET APPEL, ET C'EST
   * LÉGITIME: le plan était DÉJÀ écrit par une adoption précédente, qui l'a
   * jugé. Une quatrième valeur plutôt qu'un `ok` réutilisé, parce que le
   * défaut que ce vocabulaire existe pour empêcher est exactement « une garde
   * sautée qui ressemble à une garde passée ».
   */
  | "already_written";

// ===========================================================================
// 2. LES FORMES RENDUES
// ===========================================================================

/**
 * LA COUTURE VERS L'APPELANT — voir ① en tête de fichier.
 *
 * Les champs sont `unknown` parce que leur forme appartient aux lanes
 * (`classifyAndPersistDraftNote` type sa note, la lane solo type son
 * `measured`); les re-typer ici obligerait ce module à importer les deux
 * générateurs, c'est-à-dire à devenir un troisième.
 */
export interface AdoptPostWrite {
  /**
   * ⛔ LE COMPTEUR DE LA COUTURE. `false` = `adoption_context` ne portait
   * AUCUN bloc `postWrite`. Sans ce booléen, un `postWrite` entièrement nul se
   * lirait « il n'y avait rien à ranger » alors qu'il veut dire « on ne sait
   * pas ce qu'il y avait à ranger ».
   */
  readonly available: boolean;
  /** Le verdict de note du brouillon (`draftNoteVerdict`), ou `null`. */
  readonly draftNote: unknown;
  /** Le roster tel que la lane le passe à `classifyAndPersistDraftNote`. */
  readonly members: unknown;
  readonly contentLocale: string | null;
  readonly timezone: string | null;
  /** Lane solo: le verdict de composition mesuré. `null` en lane foyer. */
  readonly measured: unknown;
  /** L'ancre de la note: la SEMAINE VISÉE, jamais le jour de la frappe. */
  readonly targetWeek: string | null;
}

export interface AdoptOkBody {
  readonly ok: true;
  readonly meal: { readonly id: string };
  readonly window: {
    readonly starts_on: string | null;
    readonly duration_days: number | null;
  };
  readonly draft_id: string;
  readonly request_id: string;
  /**
   * ⟳ 2026-09-15 · BÊTA 2C — `true` quand CET appel n'a rien écrit parce que
   * le plan existait déjà. Le corps est identique par ailleurs: l'écran ouvre
   * `meal.id` sans savoir lequel des deux taps a écrit.
   */
  readonly already_written: boolean;
  /**
   * ⚠️ LA GARDE SE DIT DANS LA RÉPONSE, PAS SEULEMENT DANS LES JOURNAUX. Une
   * adoption qui a écrit SANS que la garde ait pu tourner doit pouvoir se
   * compter depuis le dehors.
   */
  readonly diagnostics: {
    readonly gate: AdoptGateVerdict;
    readonly gate_refusals: number;
  };
}

/** La MÊME forme que les 409/422 des deux lanes. Copiée, pas réinventée. */
export interface AdoptRefusalBody {
  readonly error: AdoptRefusal;
  readonly detail: string | Record<string, unknown>;
  readonly request_id: string;
}

export type AdoptOutcome =
  | {
    readonly ok: true;
    readonly status: 200;
    readonly body: AdoptOkBody;
    readonly gate: AdoptGateVerdict;
    readonly gateRefusals: number;
    readonly mealId: string;
    readonly postWrite: AdoptPostWrite;
  }
  | {
    readonly ok: false;
    readonly status: 404 | 409 | 410;
    readonly body: AdoptRefusalBody;
    /** `null` quand le refus est tombé AVANT la garde. */
    readonly gate: AdoptGateVerdict | null;
    readonly gateRefusals: number;
  };

export interface AdoptDraftArgs {
  /** Client `service_role`, PASSÉ, jamais construit ici. */
  readonly admin: SupabaseClient;
  readonly userId: string;
  readonly lane: DraftLane;
  readonly draftId: string;
  readonly intent: "replace_current" | "prepare_next";
  readonly replaces: string | null;
  readonly requestId: string;
  /** Injecté. ⛔ Aucune horloge n'est lue dans la décision. */
  readonly nowIso: string;
  /**
   * CE QUE L'APPELANT VIENT DE RELIRE EN BASE, à l'instant, pour que la
   * comparaison porte sur AUJOURD'HUI et pas sur le contexte gelé.
   */
  readonly liveSafety: SafetyFingerprintInput;
  /** La version de prompt VIVANTE. `sourceVersionOf` y colle le millésime. */
  readonly promptVersion: string;
  /**
   * L'horloge du TEMPS MUR, injectable. Elle ne touche JAMAIS la décision —
   * `wall_ms` ne va que dans la ligne de journal — mais l'injecter permet de
   * l'épingler sous test au lieu de la regarder varier.
   */
  readonly clockMs?: () => number;
}

// ===========================================================================
// 3. LA LECTURE DÉFENSIVE DU CONTEXTE GELÉ
// ===========================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function asStrings(value: unknown): string[] {
  return asArray(value).map((v) => String(v ?? "")).filter((v) => v.trim() !== "");
}

function asForbiddenTerms(value: unknown): ForbiddenTerm[] {
  const out: ForbiddenTerm[] = [];
  for (const raw of asArray(value)) {
    if (!isRecord(raw)) continue;
    const token = String(raw.token ?? "").trim();
    if (!token) continue;
    out.push({
      ruleId: String(raw.ruleId ?? raw.rule_id ?? ""),
      token,
      surfaceForms: asStrings(raw.surfaceForms ?? raw.surface_forms),
    });
  }
  return out;
}

/**
 * LE `GateContext` GELÉ, RELU DÉFENSIVEMENT.
 *
 * ⛔ TOUT OU RIEN, ET C'EST LA RÈGLE « UN PARAMÈTRE DE GARDE OPTIONNEL EST UNE
 * GARDE DÉSARMÉE » APPLIQUÉE À LA LECTURE. On ne complète PAS une clé absente
 * par un défaut aimable: `hasFreezer: false` inventé, ou `boxContract: null`
 * inventé, ferait tourner la garde sur un foyer qui n'existe pas, et son
 * verdict serait pire qu'un verdict absent. Une clé manquante ⇒ `null` ⇒
 * `context_unavailable`, qui se COMPTE.
 *
 * ⚠️ DEUX EMPLACEMENTS ACCEPTÉS, ET UN SEUL EST CANONIQUE. La forme écrite par
 * le lot de câblage est `{ gate: {…}, postWrite: {…} }`. La sonde de la
 * migration 20260906230000 écrit le contexte À LA RACINE
 * (`{"lane":"household","windowDays":[…]}`), et une ligne composée avant le
 * câblage peut l'avoir fait aussi. On lit donc `gate` d'abord, la racine
 * ensuite — un seul lecteur, deux emplacements, jamais deux lectures
 * divergentes.
 */
function parseGateContext(value: unknown): GateContext | null {
  if (!isRecord(value)) return null;
  const src = isRecord(value.gate) ? value.gate : value;

  const lane = asStringOrNull(src.lane);
  if (lane !== "household" && lane !== "solo") return null;

  const startsOn = asStringOrNull(src.startsOn ?? src.starts_on);
  if (!startsOn) return null;

  const windowDays = asStrings(src.windowDays ?? src.window_days);
  if (windowDays.length === 0) return null;

  const hasFreezer = src.hasFreezer ?? src.has_freezer;
  if (typeof hasFreezer !== "boolean") return null;

  const maxFridgeDays = Number(src.maxFridgeDays ?? src.max_fridge_days);
  if (!Number.isFinite(maxFridgeDays)) return null;
  // ⟳ 2026-09-25 — LES IDENTIFIANTS DU RIZ. Même tolérance que `energy`, et
  // pour la même raison: un brouillon gelé avant ce champ ne l'a pas, et le
  // refuser le rendrait inadoptable pour une cause qui ne fait que compter.
  // `null` est un état à part entière: la garde compte `rice_unevaluated`.
  const rawRice = src.riceRefs ?? src.rice_refs;
  const riceRefs = Array.isArray(rawRice) ? asStrings(rawRice) : null;

  if (!Array.isArray(src.mouths)) return null;
  const mouths = src.mouths.filter(isRecord).map((m) => ({
    memberId: String(m.memberId ?? m.member_id ?? ""),
    regime: parseDietaryRegime(m.regime) as DietaryRegime | null,
    cells: asArray(m.cells).filter(isRecord).map((c) => ({
      day: String(c.day ?? ""),
      slot: String(c.slot ?? ""),
    })),
  }));

  // ⚠️ `null` EST UNE VALEUR ICI (« les boîtes ne sont pas le contrat »), donc
  // la CLÉ doit être présente. Son absence est une lecture incomplète, pas un
  // foyer qui mange à la même table.
  const hasContractKey = "boxContract" in src || "box_contract" in src;
  if (!hasContractKey) return null;
  const rawContract = src.boxContract ?? src.box_contract;
  let boxContract: GateContext["boxContract"] = null;
  if (isRecord(rawContract)) {
    const expected = Number(rawContract.expected);
    if (!Number.isFinite(expected)) return null;
    boxContract = { expected, roster: asStrings(rawContract.roster) };
  } else if (rawContract !== null && rawContract !== undefined) {
    return null;
  }

  const rawExclusions = src.exclusions;
  if (!isRecord(rawExclusions)) return null;
  if (!Array.isArray(rawExclusions.table)) return null;
  const rawByMember = rawExclusions.byMember ?? rawExclusions.by_member;
  if (!Array.isArray(rawByMember)) return null;
  const exclusions = {
    table: asForbiddenTerms(rawExclusions.table),
    byMember: rawByMember.filter(isRecord).map((m) => ({
      memberId: String(m.memberId ?? m.member_id ?? ""),
      terms: asForbiddenTerms(m.terms),
    })),
  };

  if (!("strictestRegime" in src) && !("strictest_regime" in src)) return null;
  const strictestRegime = parseDietaryRegime(
    src.strictestRegime ?? src.strictest_regime,
  );

  const rawHouseRules = src.houseRuleLabels ?? src.house_rule_labels;
  if (!Array.isArray(rawHouseRules)) return null;
  const rawPantry = src.pantryTerms ?? src.pantry_terms;
  if (!Array.isArray(rawPantry)) return null;

  // ── L'ÉNERGIE SERVIE, ET POURQUOI SON ABSENCE N'EST PAS UN REFUS ──────────
  //
  // `energy` est arrivée dans `GateContext` avec le lot qui a retiré le
  // redimensionnement des portions: le moteur mesure, il ne rattrape plus, et
  // la porte compte l'écart à l'enveloppe (`mouth_energy_short`, en COMPTAGE).
  //
  // Un brouillon composé AVANT ce lot n'a pas la clé. Refuser dessus
  // rendrait tous ces brouillons inadoptables pour un compteur qui ne refuse
  // rien — le remède serait pire que le mal. On rend donc `null`, qui est un
  // état à part entière de ce champ: la porte le compte en
  // `energy_unmeasured` et le dit, au lieu d'un zéro qui se lirait « toutes
  // les bouches sont bien nourries ».
  //
  // ⚠️ C'est la SEULE clé de ce parseur dont l'absence est tolérée, et c'est
  // parce qu'elle porte son propre état d'ignorance. Les autres n'en ont pas:
  // un `hasFreezer: false` inventé ferait tourner la garde contre un foyer qui
  // n'existe pas.
  const rawEnergy = src.energy;
  const energy = Array.isArray(rawEnergy)
    ? rawEnergy.filter(isRecord).map((row) => ({
      memberId: String(row.memberId ?? row.member_id ?? ""),
      envelopeKcal: Number(row.envelopeKcal ?? row.envelope_kcal),
      deliveredKcal: Number(row.deliveredKcal ?? row.delivered_kcal),
    }))
    : null;

  if (!Array.isArray(src.shopping)) return null;
  if (!isRecord(src.nutrition) || !Array.isArray(src.nutrition.cells) ||
    !Array.isArray(src.nutrition.days)) return null;
  if (!Array.isArray(src.dedicated)) return null;

  return {
    lane,
    startsOn,
    windowDays,
    hasFreezer,
    maxFridgeDays,
    riceRefs,
    mouths,
    boxContract,
    exclusions,
    strictestRegime,
    houseRuleLabels: asStrings(rawHouseRules),
    pantryTerms: asStrings(rawPantry),
    // ⛔ LA POLITIQUE N'EST PAS GELÉE AVEC LE CONTEXTE, ET C'EST DÉLIBÉRÉ: elle
    // décrit ce que le PRODUIT accepte aujourd'hui, pas ce que la composition
    // croyait hier. La geler ferait adopter un plan sous la sévérité d'avant.
    energy,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-11 · LOT E — `null` ET `null`, ET C'EST LA SEULE RÉPONSE VRAIE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ L'ADOPTION N'A PAS DE RÉFÉRENTIEL. `shoppingIdentityAudit` et
    // `cellNutritionTable` exigent `CompositionIndex`, qui se charge en base et
    // n'existe pas sur ce chemin: il relit une ligne, il n'a jamais eu d'objet
    // mémoire ni d'index. C'est d'ailleurs la raison pour laquelle ces deux
    // mesures vivent dans `final_plan_audit.ts` et pas dans la garde.
    //
    // ⚠️ `null` NE SE LIT PAS « RIEN À SIGNALER »: les dénominateurs
    // `shopping_identities`, `portion_cells`, `measured_days` et `protein_days`
    // restent à zéro, et `finalGateDelivery().unevaluated` NOMME les causes qui
    // n'ont pas tourné. Un `[]` vide aurait dit l'inverse.
    shopping: src.shopping as unknown as GateContext["shopping"],
    nutrition: src.nutrition as unknown as GateContext["nutrition"],
    // ⟳ 2026-09-14 · BÊTA 1A — LE CHEMIN D'ADOPTION N'A PAS DE GRILLE. Il
    // adopte un brouillon déjà composé, sans roster reconstruit ni décision de
    // case: `null` dit « la question n'a pas été posée », et
    // `checked.dedicated_obligations` reste à zéro pour que `unevaluated` le
    // nomme. Un `[]` aurait dit « la grille a tourné et ne doit rien ».
    dedicated: src.dedicated as unknown as GateContext["dedicated"],
    policy: FINAL_GATE_POLICY_LOT_4,
  };
}

/**
 * LE PLAN, VU PAR LA GARDE.
 *
 * ⛔ CETTE VUE NE PART JAMAIS EN BASE. `p_payload` reçoit `row.write_payload`
 * TEL QUEL, l'objet d'origine: si cette coercition partait à sa place, le plan
 * écrit serait celui que ce fichier a reconstruit, c'est-à-dire — sous une
 * autre forme — le défaut de tête de fichier.
 */
// ⟳ 2026-09-10 · LOT 6 — `asGatePlan` A DÉMÉNAGÉ dans `final_plan_gate.ts`,
// à côté du type qu'il produit. Il était privé ICI, donc la seule façon
// d'atteindre la garde finale était de passer par l'adoption — et l'adoption
// n'a aucun appelant vivant. La garde n'avait donc jamais tourné sur un plan
// réel. Le générateur l'appelle maintenant directement.

function parsePostWrite(value: unknown): AdoptPostWrite {
  const root = isRecord(value) ? value : {};
  const raw = isRecord(root.postWrite)
    ? root.postWrite
    : isRecord(root.post_write)
    ? root.post_write
    : null;
  if (!raw) {
    return {
      available: false,
      draftNote: null,
      members: null,
      contentLocale: null,
      timezone: null,
      measured: null,
      targetWeek: null,
    };
  }
  return {
    available: true,
    draftNote: raw.draftNote ?? raw.draft_note ?? null,
    members: raw.members ?? null,
    contentLocale: asStringOrNull(raw.contentLocale ?? raw.content_locale),
    timezone: asStringOrNull(raw.timezone),
    measured: raw.measured ?? null,
    targetWeek: asStringOrNull(raw.targetWeek ?? raw.target_week),
  };
}

// ===========================================================================
// 4. L'ADOPTION
// ===========================================================================

function refusalOutcome(
  refusal: AdoptRefusal,
  detail: string | Record<string, unknown>,
  requestId: string,
  gate: AdoptGateVerdict | null,
  gateRefusals: number,
): AdoptOutcome {
  return {
    ok: false,
    status: STATUS_OF[refusal] as 404 | 409 | 410,
    body: { error: refusal, detail, request_id: requestId },
    gate,
    gateRefusals,
  };
}

/** Les douze premiers caractères d'un hachage: assez pour comparer deux lignes de journal. */
function shortHash(value: unknown): string | null {
  const text = asStringOrNull(value);
  return text === null ? null : text.slice(0, 12);
}

/**
 * ADOPTER UN BROUILLON: LE RELIRE, LE JUGER, L'ÉCRIRE. Sans modèle.
 *
 * Une seule sortie, pour que les deux lanes tiennent en une ligne:
 *   `return jsonResponse(req, out.body, { status: out.status });`
 * et, sur `out.ok`, l'étape de couture (`out.postWrite`, voir ① en tête).
 */
export async function adoptDraft(args: AdoptDraftArgs): Promise<AdoptOutcome> {
  const clockMs = args.clockMs ?? (() => performance.now());
  const t0 = clockMs();
  const requestId = args.requestId;

  // ⛔ UNE DATE ILLISIBLE EST UNE ERREUR DE PROGRAMMATION, PAS UN REFUS
  // MÉTIER. Retomber sur `new Date()` ici remettrait une horloge dans un module
  // dont toute la valeur est d'être rejouable; et l'inventer en silence ferait
  // qu'un `expires_at` ne serait plus jamais comparé à rien.
  const nowMs = Date.parse(String(args.nowIso ?? ""));
  if (!Number.isFinite(nowMs)) {
    throw new Error(`draft_adopt: nowIso illisible (${String(args.nowIso)})`);
  }
  const logLine = (
    extra: Record<string, unknown>,
  ): void => {
    console.log(JSON.stringify({
      tag: `keel.${args.lane}.adopt`,
      user_id: args.userId,
      draft_id: args.draftId,
      request_id: requestId,
      wall_ms: Math.round(clockMs() - t0),
      ...extra,
    }));
  };

  // ── ① LA LIGNE, PAR PROPRIÉTAIRE ────────────────────────────────────────
  const row = await loadDraftForAdoption(args.admin, {
    draftId: args.draftId,
    userId: args.userId,
  });

  const verdict = adoptability(row ?? null, args.nowIso);
  // ── ①bis LE PLAN EXISTE DÉJÀ: ON L'OUVRE, ON NE REFUSE PAS ──────────────
  //
  // ⛔ MESURÉ LE 2026-09-14 (audit R2). `keel_adopt_meal_draft` rend le même
  // `meal_id` sur un brouillon déjà adopté — la transaction EST idempotente —
  // mais `adoptability` refusait 409 AVANT de l'atteindre. Le second tap, les
  // deux onglets et surtout la RÉPONSE PERDUE après une adoption réussie
  // voyaient donc un échec pendant que leur plan était écrit.
  //
  // ⚠️ AUCUNE ÉCRITURE, AUCUNE RPC: la ligne relue porte déjà `adopted_meal_id`,
  // et la garde a tourné au premier tap. Rejuger ici relirait les protections
  // d'AUJOURD'HUI contre un plan écrit HIER — c'est-à-dire refuser un plan
  // actif à cause d'une allergie déclarée après coup, sans rien pouvoir y faire.
  if (verdict.ok && verdict.alreadyWritten !== null) {
    logLine({
      meal_id: verdict.alreadyWritten,
      gate: "already_written",
      gate_refusals: 0,
      atomic: false,
      replayed: true,
    });
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        meal: { id: verdict.alreadyWritten },
        window: {
          starts_on: asStringOrNull((row as Record<string, unknown>).starts_on),
          duration_days:
            Number.isFinite(Number((row as Record<string, unknown>).duration_days))
              ? Number((row as Record<string, unknown>).duration_days)
              : null,
        },
        draft_id: args.draftId,
        request_id: requestId,
        already_written: true,
        diagnostics: { gate: "already_written", gate_refusals: 0 },
      },
      gate: "already_written",
      gateRefusals: 0,
      mealId: verdict.alreadyWritten,
      postWrite: parsePostWrite((row as Record<string, unknown>).adoption_context),
    };
  }
  if (!verdict.ok) {
    logLine({ meal_id: null, gate: null, gate_refusals: 0, refused: verdict.refusal });
    return refusalOutcome(
      verdict.refusal,
      `le brouillon « ${args.draftId} » ne peut pas s'écrire (${verdict.refusal})`,
      requestId,
      null,
      0,
    );
  }
  // `adoptability` a déjà refusé sur une ligne absente: à partir d'ici elle est là.
  const draft = row as Record<string, unknown>;

  // ── ② LA PÉREMPTION, DEUX MESURES ───────────────────────────────────────
  //
  // (a) LES PROTECTIONS. Entre la relecture et le tap il peut s'écouler 24 h,
  //     et quelqu'un peut y avoir déclaré l'allergie d'un enfant, durci une
  //     sévérité, changé un régime ou retiré une bouche. Écrire alors le
  //     payload composé CONTRE L'AUTRE FOYER servirait un plat qu'aucune garde
  //     n'a jamais jugé avec cette allergie — c'est très exactement l'accident
  //     que tout ce lot existe pour empêcher.
  const liveFingerprint = await safetyFingerprintOf(args.liveSafety);
  const storedFingerprint = asStringOrNull(draft.safety_fingerprint);
  if (storedFingerprint !== liveFingerprint) {
    logLine({
      meal_id: null,
      gate: null,
      gate_refusals: 0,
      refused: "draft_stale",
      reason: "safety",
      stored_fp: shortHash(storedFingerprint),
      live_fp: shortHash(liveFingerprint),
    });
    return refusalOutcome("draft_stale", {
      reason: "safety",
      says: "les protections du foyer ont changé depuis la relecture",
      stored_prefix: shortHash(storedFingerprint),
      live_prefix: shortHash(liveFingerprint),
    }, requestId, null, 0);
  }

  // (b) LE CONTRAT DU PAYLOAD — et SEULEMENT lui.
  //
  // ⛔ PAS LA VERSION DE PROMPT. Un plan composé est un objet FINI: changer le
  // prompt change ce qu'on composerait demain, pas la validité de ce qui est
  // déjà écrit. Mesuré le 2026-09-07, `HOUSEHOLD_PROMPT_VERSION` est passée de
  // v31 à v32 en une soirée — avec une péremption calée sur la provenance,
  // tout aperçu composé avant le déploiement devenait `draft_stale`, et la
  // personne se voyait refuser son plan pour une raison qui ne parle pas de
  // son plan. Pendant une itération de prompt, ce serait le cas NOMINAL.
  //
  // Ce qui périme un brouillon: la FORME du payload rangé et ce que ses
  // lecteurs savent en faire (`DRAFT_CONTRACT_VERSION`), et le foyer qui a
  // changé (l'empreinte de sécurité, testée juste au-dessus). La version de
  // prompt reste écrite sur la ligne — c'est de la provenance, elle sert à
  // lire un incident, pas à décider.
  const liveSource = DRAFT_CONTRACT_VERSION;
  const storedSource = contractVersionOf(asStringOrNull(draft.source_version) ?? "");
  if (storedSource !== liveSource) {
    logLine({
      meal_id: null,
      gate: null,
      gate_refusals: 0,
      refused: "draft_stale",
      reason: "source",
      stored_source: storedSource,
      live_source: liveSource,
    });
    return refusalOutcome("draft_stale", {
      reason: "source",
      says: "ce brouillon a été rangé sous une forme que ce code ne relit plus",
      stored: storedSource,
      live: liveSource,
    }, requestId, null, 0);
  }

  // ── ③ LA GARDE FINALE, SUR LE CONTEXTE GELÉ ─────────────────────────────
  //
  // Le contexte vient de `adoption_context` et PAS des tables: la composition
  // l'a rangé là précisément pour que l'adoption ne juge pas le plan relu avec
  // le foyer d'aujourd'hui. (Que le foyer ait bougé est déjà dit par ②(a); ce
  // n'est pas à la garde de le redire, et elle le dirait mal.)
  //
  // ⟳ 2026-09-14 · BÊTA — L'ADOPTION PORTE LA MÊME POLITIQUE LOT 4 QUE LA
  // génération. Le contexte complet est gelé avec le brouillon; absent ou
  // incomplet, il refuse fermé. Ainsi une ancienne ligne ou une régression de
  // sérialisation ne peut jamais transformer « contrôle non exécuté » en 200.
  const gateContext = parseGateContext(draft.adoption_context);
  let gateVerdict: AdoptGateVerdict;
  let gateRefusalCount = 0;
  let gateRefused: readonly GateRefusal[] = [];

  if (gateContext === null) {
    // Une mesure indispensable absente n'est jamais un succès. Les brouillons
    // d'avant le câblage doivent être recomposés sous le contrat courant.
    gateVerdict = "context_unavailable";
    logLine({
      meal_id: null,
      gate: gateVerdict,
      gate_refusals: 0,
      refused: "plan_gate_refused",
      reason: "context_unavailable",
    });
    return refusalOutcome("plan_gate_refused", {
      reason: "context_unavailable",
      says: "le contexte de validation complet du brouillon est indisponible",
    }, requestId, gateVerdict, 0);
  } else {
    const gate = finalPlanGate(asGatePlan(draft.write_payload), gateContext);
    const delivery = finalGateDelivery(gate, HOUSEHOLD_BETA_ESSENTIALS);
    gateRefusalCount = gate.refusals.length;
    gateRefused = gate.refusals.filter((r) => r.severity === "refuse");
    gateVerdict = gate.ok && delivery.state !== "not_deliverable" ? "ok" : "refused";
    if (!gate.ok || delivery.state === "not_deliverable") {
      logLine({
        meal_id: null,
        gate: gateVerdict,
        gate_refusals: gateRefusalCount,
        refused: "plan_gate_refused",
      });
      return refusalOutcome("plan_gate_refused", {
        reason: "final_plan_gate",
        causes: [...new Set([
          ...gateRefused.map((r) => r.cause),
          ...delivery.unevaluated,
        ])],
        refusals: gateRefused.map((r) => ({
          cause: r.cause,
          day: r.day,
          slot: r.slot,
          dish: r.dish,
          member_id: r.member_id,
          term: r.term,
          detail: r.detail,
        })),
      }, requestId, gateVerdict, gateRefusalCount);
    }
  }

  // ── ④ L'ÉCRITURE — UNE TRANSACTION ATOMIQUE, PAYLOAD GELÉ MOT POUR MOT ──
  //
  // ⛔ `p_payload: draft.write_payload` — L'OBJET STOCKÉ, PAS UNE COPIE, PAS
  // LA VUE DE LA GARDE. C'est la propriété que ce lot existe pour tenir.
  // La RPC verrouille le brouillon, appelle `write_student_meal_plan` avec son
  // `write_payload`, puis le marque adopté dans la MÊME transaction. Un échec
  // ne peut donc plus laisser un plan écrit avec un brouillon encore `done`.
  const startsOn = asStringOrNull(draft.starts_on);
  const durationDays = Number.isFinite(Number(draft.duration_days))
    ? Number(draft.duration_days)
    : null;

  const { data: adoptionResult, error: writeErr } = await args.admin.rpc(
    "keel_adopt_meal_draft",
    {
      p_draft: args.draftId,
      p_user: args.userId,
      p_intent: args.intent,
      p_replaces: args.replaces,
      p_live_fingerprint: liveFingerprint,
      p_contract_version: DRAFT_CONTRACT_VERSION,
    },
  );

  if (writeErr) {
    logLine({
      meal_id: null,
      gate: gateVerdict,
      gate_refusals: gateRefusalCount,
      refused: "plan_not_written",
    });
    return refusalOutcome(
      "plan_not_written",
      String((writeErr as { message?: unknown })?.message ?? writeErr),
      requestId,
      gateVerdict,
      gateRefusalCount,
    );
  }

  const writtenRow = (Array.isArray(adoptionResult) ? adoptionResult[0] : adoptionResult) as
    | { ok?: unknown; reason?: unknown; detail?: unknown; meal_id?: unknown }
    | null
    | undefined;
  if (writtenRow?.ok !== true) {
    const reason = String(writtenRow?.reason ?? "plan_not_written");
    const known = (ADOPT_REFUSALS as readonly string[]).includes(reason)
      ? reason as AdoptRefusal
      : "plan_not_written";
    logLine({
      meal_id: null,
      gate: gateVerdict,
      gate_refusals: gateRefusalCount,
      refused: known,
      atomic: true,
    });
    return refusalOutcome(
      known,
      typeof writtenRow?.detail === "string" || isRecord(writtenRow?.detail)
        ? writtenRow.detail
        : reason,
      requestId,
      gateVerdict,
      gateRefusalCount,
    );
  }
  const mealId = String(writtenRow?.meal_id ?? "").trim();

  if (!mealId) {
    // ⚠️ CE CAS EST AMBIGU, ET ON L'ÉCRIT PLUTÔT QUE DE CHOISIR EN SILENCE: la
    // RPC n'a pas rendu d'erreur, donc la ligne est peut-être écrite — mais
    // sans identifiant on ne peut ni la montrer ni marquer le brouillon adopté.
    // Rendre 200 avec `meal.id` vide laisserait le brouillon adoptable ET
    // l'écran sans plan à ouvrir. On refuse par le seul motif du vocabulaire
    // qui dit « aucune ligne à montrer », en le NOMMANT dans le détail; un
    // second tap sera arbitré par l'exclusion de fenêtres de la RPC elle-même.
    logLine({
      meal_id: null,
      gate: gateVerdict,
      gate_refusals: gateRefusalCount,
      refused: "plan_not_written",
      reason: "rpc_named_no_meal",
    });
    return refusalOutcome(
      "plan_not_written",
      "la RPC n'a rendu aucun meal_id — l'écriture a peut-être eu lieu, mais rien ne la nomme",
      requestId,
      gateVerdict,
      gateRefusalCount,
    );
  }

  logLine({
    meal_id: mealId,
    gate: gateVerdict,
    gate_refusals: gateRefusalCount,
    atomic: true,
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      meal: { id: mealId },
      window: { starts_on: startsOn, duration_days: durationDays },
      draft_id: args.draftId,
      request_id: requestId,
      already_written: false,
      diagnostics: { gate: gateVerdict, gate_refusals: gateRefusalCount },
    },
    gate: gateVerdict,
    gateRefusals: gateRefusalCount,
    mealId,
    postWrite: parsePostWrite(draft.adoption_context),
  };
}
