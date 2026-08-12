// KEEL — L8 · CE QUI N'A PAS FUSIONNÉ, ET POURQUOI (D9, seconde moitié).
//
// Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
//
// ── L'ARBITRAGE QUE CE MODULE SERT ───────────────────────────────────────────
// « Ce qui n'a pas fusionné doit être visible et attribué à la DIVERGENCE, pas
// à une personne. » Mot pour mot: *« ça a la vertu de montrer que ce n'est pas
// le système qui est nul, mais que c'est la recherche de compromis qui rend les
// choses compliquées »*.
//
// Conséquence directe sur la forme: ce module rend des LIGNES NOMMÉES, pas des
// phrases. Chaque ligne porte une clé de message et l'identité d'une bouche;
// c'est l'écran qui la traduit, et le catalogue (`i18n/en.ts`) qui garde la
// règle d'écriture — un FAIT (« son plan couvre les mêmes jours »), jamais une
// défaillance (« son plan n'a pas pu être fusionné »), qui serait faux ET
// blessant.
//
// ── D'OÙ VIENNENT CES FAITS ──────────────────────────────────────────────────
// De `generated_from.household`, écrit par `generate-household-meal-v1` à
// chaque composition. Le registre insiste, lot après lot, sur le fait que ces
// clés sont écrites MÊME VIDES: une clé absente ne se distingue pas d'un lot
// débranché. On lit donc l'absence comme « rien à dire », jamais comme un
// défaut de lecture.
//
// ── CE QU'ON NE LIT PAS, EXPRÈS ──────────────────────────────────────────────
// `voices` (qui a été entendu, ce qui a été coupé) et `presence` (qui manque)
// sont dans la même trace et n'ont AUCUNE ligne ici:
//
//   · `voices` porte de quoi remonter à ce qu'une personne a confié de son
//     alimentation. Le plan du foyer est lu à voix haute par tout le foyer, et
//     la garde de non-divulgation de L6 existe précisément pour que rien de
//     cela n'atteigne la table. L'afficher l'annulerait par l'écran.
//   · `presence` est déjà à l'écran, en grille, sur la page du foyer — et c'est
//     le maître lui-même qui l'a marquée. La redire ici ferait un second avis
//     sur une absence.

import type { MessageKey } from "../i18n/t";

/** Une bouche retirée (ou reprise) par un plan à elle. Jumeau de `HandTraceEntry`. */
export interface PlanTraceEntryView {
  memberId: string;
  planId: string;
  startsOn: string;
  durationDays: number;
  validatedAt: string | null;
  reason: string;
}

/**
 * Une bouche que le maître a SORTIE de la table (D8, défusion).
 *
 * ⚠️ `coversWindow` EST LA MOITIÉ QUI COMPTE. Une défusion peut retirer
 * quelqu'un dont le plan personnel ne couvre pas tous les jours: il n'aura rien
 * à manger ces jours-là. C'est le droit du maître, et L5 l'a laissé
 * explicitement à L8 avec ces mots — « le dire à l'écran est L8 ». Sans ce
 * booléen, le plan a l'air normal.
 */
export interface PlanUnmergedView {
  memberId: string;
  coversWindow: boolean;
}

export interface HouseholdPlanTrace {
  /** Le bloc `household` existait dans `generated_from`. */
  present: boolean;
  taken: PlanTraceEntryView[];
  partial: PlanTraceEntryView[];
  reclaimed: PlanTraceEntryView[];
  unmerged: PlanUnmergedView[];
  /**
   * O5 — LE BARREAU DEMANDÉ A-T-IL ÉTÉ TENU ?
   *
   * `null` quand ce plan ne porte aucune fusion, ou quand le constat n'a pas
   * été écrit. `false` est le cas mesuré deux fois sur deux au premier run réel:
   * le barreau ② demandait un plat à part, le modèle a servi tout le monde
   * depuis la casserole commune. Le serveur CONSTATE et ne corrige pas — le
   * taire ici laisserait un plan qui se contredit lui-même, et personne pour le
   * lire.
   */
  mergeShapeHonoured: boolean | null;
}

const EMPTY: HouseholdPlanTrace = {
  present: false,
  taken: [],
  partial: [],
  reclaimed: [],
  unmerged: [],
  mergeShapeHonoured: null,
};

function readEntries(raw: unknown): PlanTraceEntryView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return {
      memberId: String(e.member_id ?? ""),
      planId: String(e.plan_id ?? ""),
      startsOn: String(e.starts_on ?? ""),
      durationDays: Number(e.duration_days) || 0,
      validatedAt: typeof e.validated_at === "string" ? e.validated_at : null,
      reason: String(e.reason ?? ""),
    };
  }).filter((e) => e.memberId !== "");
}

/**
 * La trace d'un plan du foyer, lue sur sa colonne `generated_from`.
 *
 * Défensif dans une seule direction, comme tous les lecteurs de ce dossier: ce
 * qu'on ne sait pas lire tombe seul, et un plan écrit avant ce lot rend une
 * trace vide plutôt qu'une erreur — c'était exactement vrai pour ce plan-là.
 */
export function readHouseholdPlanTrace(generatedFrom: unknown): HouseholdPlanTrace {
  if (!generatedFrom || typeof generatedFrom !== "object") return EMPTY;
  const household =
    (generatedFrom as Record<string, unknown>).household as Record<string, unknown> | undefined;
  if (!household || typeof household !== "object") return EMPTY;
  const hand = (household.hand ?? {}) as Record<string, unknown>;
  const merge = (household.merge ?? {}) as Record<string, unknown>;
  const honoured = (merge.honoured ?? null) as Record<string, unknown> | null;
  return {
    present: true,
    taken: readEntries(hand.taken),
    partial: readEntries(hand.partial),
    reclaimed: readEntries(hand.reclaimed),
    unmerged: (Array.isArray(hand.unmerged) ? hand.unmerged : []).map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      return {
        memberId: String(e.member_id ?? ""),
        // ⚠️ `=== true` ET PAS `!== false`. Une trace ancienne sans ce champ ne
        // doit pas passer pour « tout est couvert »: on préfère annoncer un
        // trou qui n'existe pas plutôt que taire un jour sans repas.
        coversWindow: e.covers_window === true,
      };
    }).filter((e) => e.memberId !== ""),
    mergeShapeHonoured: honoured && typeof honoured.ok === "boolean"
      ? honoured.ok
      : null,
  };
}

/**
 * UNE LIGNE À LIRE, attribuée à une bouche mais JAMAIS à sa faute.
 *
 * `hint` porte le second fait quand il y en a un — aujourd'hui uniquement « son
 * plan à elle ne couvre pas tous ces jours-là », qui n'est pas déductible du
 * premier.
 */
export interface DivergenceLine {
  memberId: string;
  key: MessageKey;
  hint: MessageKey | null;
}

/**
 * CE QUE LE PLAN DIT DE LUI-MÊME, DANS L'ORDRE OÙ ON LE LIT.
 *
 * L'ordre n'est pas cosmétique: ce qui est ARRIVÉ à la table (une reprise)
 * précède ce qui en est SORTI (une prise de main, une défusion). Un écran qui
 * commencerait par les absences se lirait comme une liste de manques, alors que
 * le fait majoritaire d'un foyer est que tout le monde mange le même plan.
 *
 * `partial` est rendu, et c'est délibéré: c'est la seule ligne qui explique
 * pourquoi quelqu'un qui A un plan à lui reste quand même à cette table. Sans
 * elle, « plan partiel » et « pas de plan » se lisent pareil — le défaut que
 * `hand.partial` existe pour rendre visible côté serveur.
 */
export function divergenceLines(trace: HouseholdPlanTrace): DivergenceLine[] {
  const lines: DivergenceLine[] = [];
  for (const entry of trace.reclaimed) {
    lines.push({
      memberId: entry.memberId,
      key: "household.plan.reclaimed",
      hint: null,
    });
  }
  for (const entry of trace.taken) {
    lines.push({ memberId: entry.memberId, key: "household.plan.taken", hint: null });
  }
  for (const entry of trace.partial) {
    lines.push({ memberId: entry.memberId, key: "household.plan.partial", hint: null });
  }
  for (const entry of trace.unmerged) {
    lines.push({
      memberId: entry.memberId,
      key: "household.plan.unmerged",
      hint: entry.coversWindow ? null : "household.plan.unmerged_uncovered",
    });
  }
  return lines;
}

/**
 * Y a-t-il quelque chose à dire sur ce plan ?
 *
 * Rendue à part pour que l'écran puisse se TAIRE proprement: le cas majoritaire
 * — un foyer où tout le monde mange le plan commun — ne doit porter ni carte,
 * ni titre, ni phrase d'explication. La pédagogie de la divergence n'a de sens
 * que quand il y a une divergence.
 */
export function hasDivergence(trace: HouseholdPlanTrace): boolean {
  return divergenceLines(trace).length > 0 || trace.mergeShapeHonoured === false;
}
