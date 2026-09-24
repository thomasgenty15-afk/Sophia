// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LA FUSION ET LA DÉFUSION, RÉSOLUES AVANT TOUTE DÉPENSE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `index.ts` (découpage des gros fichiers,
// lot 3a). Aucune logique changée. Seul `index.ts` l'importe; ce module
// n'importe jamais `index.ts`, et il n'a aucun effet au chargement.
//
// Ce qui est ici : `resolveMergeRequest`, `resolveUnmergeRequest` et leurs
// types (`StoredPlan`, `ResolvedMerge`, `MergeRefusal`, `ResolvedUnmerge`).
// Leurs APPELS restent dans `handle`, avant le premier appel modèle.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  bestMergePair,
  MERGE_WINDOW_ALL_PAST,
  MERGE_WINDOW_UNREADABLE,
  type MergeWindow,
  type PlanSpan,
} from "../_shared/keel/household_merge.ts";
import { parseOwnPlans, plansOverlap } from "../_shared/keel/household_hand.ts";
import { mergeCarriers } from "../_shared/keel/household_merge_notice.ts";
import {
  type LiveHouseholdPlan,
  storedCookingDays,
  storedDishes,
} from "../_shared/keel/household_merge_notice_io.ts";
import type { RosterRow } from "./types.ts";

// ===========================================================================
// L4 · D6 · D15 · D16 — LA FUSION, RÉSOLUE AVANT TOUTE DÉPENSE
//
// Tout ce bloc s'exécute AVANT le premier appel modèle, et c'est sa raison
// d'être autant que sa position: chacun de ses refus se tranche sur deux
// fenêtres, un roster et une date. L1 a mesuré 28,6 s et 225 s de génération
// brûlées sur des refus de cette nature; le test de POSITION est dans
// `_shared/keel/household_merge_test.ts` (« AUCUN REFUS DE FUSION NE SE PAIE AU
// PRIX D'UNE GÉNÉRATION »), et il garde la position PAR LA SOURCE parce qu'en
// HTTP un refus tardif est indiscernable d'un refus précoce.
//
// ⚠️ JUSQU'AU 2026-08-12, CE COMMENTAIRE NOMMAIT UN FICHIER DE TEST QUI N'A
// JAMAIS EXISTÉ. Un commentaire qui ment sur l'existence de sa propre garde est
// pire qu'une absence de commentaire: il fait croire la garde posée à qui vient
// vérifier, et c'est le seul lecteur qui compte. Le nom fautif n'est pas répété
// ici — un test (« AUCUN COMMENTAIRE DU GÉNÉRATEUR NE NOMME UN TEST QUI
// N'EXISTE PAS ») refuse désormais TOUT nom de fichier de test introuvable dans
// ce fichier, y compris cité en exemple.
// ===========================================================================

/**
 * Un plan déjà écrit, relu pour la fusion. Jamais le `why` d'un plat.
 *
 * ⚠️ LA LECTURE VIT DÉSORMAIS DANS `household_merge_notice_io.ts` (L5), et pas
 * ici. Le lecteur de propositions a besoin EXACTEMENT du même plan du foyer,
 * avec le même prédicat: deux `select` écrits séparément auraient divergé, et
 * ce dépôt a mesuré deux fois le 2026-08-12 ce que coûte un lecteur du plan du
 * foyer qui ne filtre pas comme les autres.
 */
type StoredPlan = LiveHouseholdPlan;

interface ResolvedMerge {
  member: RosterRow;
  /** Le plan personnel repris. UN seul par appel — voir plus bas. */
  personalPlan: StoredPlan;
  /** Le plan du foyer dans lequel on le reprend. */
  householdPlan: StoredPlan;
  window: MergeWindow;
  /**
   * O1 — LES AUTRES PLANS PERSONNELS QUI MORDENT SUR LA FENÊTRE FUSIONNÉE.
   *
   * Une fusion reprend UN plan. Deux plans personnels adjacents qui couvrent
   * ensemble la fenêtre demanderaient deux gestes du maître, et c'est l'option
   * la plus réversible: fusionner les deux d'un coup déciderait à la place de
   * D10 (« la fusion est manuelle, sur proposition »), et rien ne dit que la
   * proposition doit les grouper. Ce qui n'est PAS acceptable, c'est le
   * silence: les autres plans sont tracés en `issues`, donc visibles.
   */
  otherOverlappingPlanIds: string[];
}

interface MergeRefusal {
  refusal: string;
  detail: string;
}

async function resolveMergeRequest(args: {
  admin: SupabaseClient;
  roster: readonly RosterRow[];
  memberId: string;
  todayDate: string;
  /**
   * Les plans du foyer vivants, déjà lus une fois pour tout ce fichier.
   *
   * ⚠️ PASSÉS PLUTÔT QUE RELUS (L5). Cette fonction faisait son propre `select`;
   * le lecteur de propositions en aurait fait un second, avec son propre
   * prédicat, et ce dépôt a mesuré deux fois le 2026-08-12 ce que coûte un
   * lecteur du plan du foyer qui ne filtre pas comme les autres. Le propriétaire
   * et le foyer ne sont donc plus des arguments d'ici: ils appartiennent à la
   * lecture, qui vit dans `household_merge_notice_io.ts`.
   */
  householdPlans: readonly StoredPlan[];
}): Promise<ResolvedMerge | MergeRefusal> {
  const member = args.roster.find((r) => r.member_id === args.memberId);
  if (!member) {
    return {
      refusal: "merge_member_not_in_household",
      detail: "That person is not in this household.",
    };
  }
  // D2 — LE MAÎTRE N'EST JAMAIS EXCLU, donc il n'y a jamais rien à reprendre
  // pour lui. Son plan du foyer EST son plan. Sans ce refus, une fusion sur
  // lui-même irait jusqu'à `merge_member_has_no_plan`, qui serait un
  // diagnostic faux.
  if (member.role === "owner") {
    return {
      refusal: "merge_member_is_owner",
      detail: "The household plan is already yours: there is nothing to bring back.",
    };
  }

  const ownPlans = parseOwnPlans(member.own_plans);
  if (ownPlans.length === 0) {
    return {
      refusal: "merge_member_has_no_plan",
      detail: "That person has no validated plan of their own, so they are " +
        "already being cooked for.",
    };
  }

  // LE PLAN DU FOYER, VIVANT. Lu UNE fois par requête, par le lecteur partagé
  // (`household_merge_notice_io.ts`), et passé ici: `plan_kind = 'household'`
  // y est obligatoire et ce n'est pas une précaution — un plan PERSONNEL porte
  // aussi `household_id`, et deux lecteurs indépendants sont déjà tombés dedans
  // le 2026-08-12.
  const householdPlans = args.householdPlans;
  if (householdPlans.length === 0) {
    return {
      refusal: "merge_no_household_plan",
      detail: "There is no live household plan to merge into. Compose one first.",
    };
  }

  // ── LA MEILLEURE PAIRE (plan du foyer, plan personnel) ──────────────────
  // Au plus deux plans du foyer sont vivants à la fois (la contrainte
  // d'exclusion le garantit: le courant et le suivant), et un membre peut
  // porter plusieurs plans personnels adjacents. On garde la paire dont la
  // fenêtre FUSIONNABLE — intersection coupée au pivot — est la plus longue:
  // c'est la seule mesure qui parle de jours réellement repris.
  //
  // ⚠️ LE CHOIX EST FAIT PAR `bestMergePair`, ET PAS ICI (L5). La PROPOSITION
  // de D10 doit annoncer exactement ce que cette fusion-ci fera; une seconde
  // arithmétique dans le lecteur aurait promis des jours que la fusion ne prend
  // pas, et les deux nombres auraient été plausibles.
  const best = bestMergePair({
    householdPlans,
    personalPlans: ownPlans,
    today: args.todayDate,
  });
  if (!best.ok) {
    return {
      refusal: best.refusal,
      detail: best.refusal === MERGE_WINDOW_ALL_PAST
        ? "Everything those two plans share is already behind us. A merge only " +
          "touches days nobody has eaten yet."
        : best.refusal === MERGE_WINDOW_UNREADABLE
        ? "One of those two plans does not carry a readable window."
        : "That person's plan and the household plan do not share a single day.",
    };
  }

  // LE PLAN PERSONNEL, EN ENTIER. Le roster n'en rend que la FENÊTRE (id,
  // dates, validation): il n'a jamais eu à porter des plats, et l'élargir pour
  // ce lot ferait grossir la lecture que le chat fait à chaque tour.
  const personalRes = await args.admin
    .from("student_generated_meals")
    .select("id, starts_on, duration_days, lead_days, validated_at, cooking_sessions, dishes")
    .eq("id", best.personal.id)
    .maybeSingle();
  if (personalRes.error) throw personalRes.error;
  const personalRow = (personalRes.data ?? null) as Record<string, unknown> | null;
  if (!personalRow) {
    // La ligne était là quand le roster l'a vue, et elle ne l'est plus. On
    // refuse plutôt que de fusionner un plan qu'on n'a pas relu.
    return {
      refusal: "merge_plan_vanished",
      detail: "That plan is no longer readable. Try again.",
    };
  }

  // ⚠️ `recomposed`, ET SURTOUT PAS `window` — C5 ②, LE JUMEAU DU P0 DE L10 ①.
  //
  // MESURÉ EN HTTP RÉEL LE 2026-08-12. Plan du foyer `[2026-08-12 +3]`, il
  // cuisine VENDREDI 14 pour Iris; le plan personnel VALIDÉ ET VIVANT d'Iris
  // `[2026-08-14 +1]` couvre exactement ce jour-là. `other_overlapping_plan_ids`
  // est rendu `[]`, aucune `issue`: le maître cuisinait une assiette pour
  // quelqu'un qui avait son plan ce jour-là, et RIEN ne le disait.
  //
  // La cause est la même confusion que le P0 de L10 ①, à un site de plus: ce
  // contrôle interrogeait `window` — les jours de SON plan qui reviennent —
  // alors que ce qu'on ÉCRIT est `recomposed`, la queue du plan du foyer. Quand
  // `recomposed` est plus LONGUE (le plan personnel finit avant la fin de la
  // semaine du foyer), les jours en trop ne sont contrôlés par personne.
  //
  // ⚠️ C3 ⑤ REND CE CAS ATTEIGNABLE: c'est lui qui autorise deux plans
  // personnels adjacents. Avant lui, un second plan mordant était rare.
  //
  // RETOUR ARRIÈRE: cette ligne. Son prix est le silence ci-dessus.
  const mergedSpan: PlanSpan = best.window.recomposed;
  return {
    member,
    householdPlan: best.household,
    personalPlan: {
      id: String(personalRow.id),
      startsOn: String(personalRow.starts_on ?? best.personal.startsOn),
      durationDays: Number(personalRow.duration_days ?? best.personal.durationDays),
      // ⟳ A1 (2026-09-03) — la veille de la ligne PERSONNELLE reprise. Elle
      // sort du même `select` que le reste (`personalRow`); `?? 0` couvre une
      // base non migrée, où « pas de veille » est ce que la ligne porte.
      leadDays: Number(personalRow.lead_days ?? 0),
      validatedAt: personalRow.validated_at == null
        ? null
        : String(personalRow.validated_at),
      cookingDays: storedCookingDays(personalRow.cooking_sessions),
      dishes: storedDishes(personalRow.dishes),
      generatedFrom: null,
    },
    window: best.window,
    otherOverlappingPlanIds: ownPlans
      .filter((p) => p.id !== best.personal.id && plansOverlap(p, mergedSpan))
      .map((p) => p.id),
  };
}

// ===========================================================================
// L5 · D8 — LA DÉFUSION, RÉSOLUE AVANT TOUTE DÉPENSE ELLE AUSSI
//
// « Refaire le plan du foyer SANS user X » est la première des trois sorties de
// D8, et c'est celle qui préserve les courses déjà faites. Elle recompose la
// QUEUE du plan du foyer vivant — ce qu'il lui reste à partir d'aujourd'hui
// (D16) — sans la personne, et avec la consigne écrite mot pour mot dans le
// registre (`buildUnmergeBlock`).
//
// ⚠️ ON NE DÉFUSIONNE QUE CE QUI A ÉTÉ FUSIONNÉ. Le refus
// `unmerge_member_not_merged` n'est pas une formalité: sans lui, cette
// opération deviendrait « retire n'importe qui de la table », c'est-à-dire une
// exclusion permanente que rien dans ce chantier n'autorise — D8 parle d'une
// personne QUE LE MAÎTRE A REPRISE et qui vient de valider autre chose.
//
// ⚠️ ELLE N'ÉCRIT RIEN SUR LE COMPTE DU SECONDAIRE, exactement comme la fusion:
// « dans tous les cas, X garde son plan » est l'invariant du modèle, et il est
// STRUCTUREL — `write_student_meal_plan` ne touche que les lignes de
// `p_user_id` (le maître) et de la même nature.
// ===========================================================================

interface ResolvedUnmerge {
  member: RosterRow;
  /** Le plan du foyer qu'on recompose. C'est LUI, « le plan de base » (D8). */
  basePlan: StoredPlan;
  /** Ce qu'il reste de ce plan à partir d'aujourd'hui. */
  window: MergeWindow;
}

function resolveUnmergeRequest(args: {
  roster: readonly RosterRow[];
  memberId: string;
  todayDate: string;
  householdPlans: readonly StoredPlan[];
}): ResolvedUnmerge | MergeRefusal {
  const member = args.roster.find((r) => r.member_id === args.memberId);
  if (!member) {
    return {
      refusal: "unmerge_member_not_in_household",
      detail: "That person is not in this household.",
    };
  }
  if (member.role === "owner") {
    return {
      refusal: "unmerge_member_is_owner",
      detail: "The household plan is theirs: there is nobody to take out of it.",
    };
  }

  // LE PLAN DE BASE EST LE PLAN VIVANT QUI PORTE LA REPRISE. Pas le plan
  // d'avant la fusion: les courses se font sur le plan que l'écran montre, et
  // c'est celui-là. Voir le long commentaire de `buildUnmergeBlock`.
  //
  // ⚠️ ET « LE PLAN VIVANT » N'EST PAS « LE PREMIER DE LA LISTE ». Jusqu'au
  // 2026-08-12 cette ligne était un `.find(...)` sur une liste triée par
  // `starts_on` CROISSANT: elle prenait donc le plan du foyer le PLUS ANCIEN,
  // alors que deux sont vivants en même temps par contrat (le courant et le
  // suivant, ce que `prepare_next` produit). Mesuré en HTTP: un plan 08-05/4 j
  // périmé portant la reprise à côté du plan courant 08-12/5 j qui la portait
  // aussi, et `operation: "unmerge"` rendait 409 `unmerge_window_all_past`
  // pendant que le lecteur offrait le bouton — le maître n'avait alors AUCUN
  // moyen de défaire la reprise sur le plan qu'il est en train de manger.
  //
  // `mergeCarriers` est la même fonction que celle du lecteur de propositions,
  // exactement comme `bestMergePair` l'est pour la fusion: la proposition et le
  // geste choisissent la même ligne, ou ils divergent.
  const carrier = mergeCarriers({
    householdPlans: args.householdPlans,
    today: args.todayDate,
  }).get(args.memberId) ?? null;
  if (!carrier) {
    return {
      refusal: "unmerge_member_not_merged",
      detail: "No live household plan has brought that person back to this " +
        "table, so there is nothing to undo.",
    };
  }
  if (carrier.tail === null) {
    return {
      refusal: carrier.tailRefusal === MERGE_WINDOW_UNREADABLE
        ? "unmerge_window_unreadable"
        : "unmerge_window_all_past",
      detail: "That household plan has no day left ahead of it. There is " +
        "nothing left to cook differently.",
    };
  }

  return { member, basePlan: carrier.plan, window: carrier.tail };
}

export { resolveMergeRequest, resolveUnmergeRequest };
export type { MergeRefusal, ResolvedMerge, ResolvedUnmerge, StoredPlan };
