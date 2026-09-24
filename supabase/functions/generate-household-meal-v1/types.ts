// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LES TYPES DU FOYER CHARGÉ
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `index.ts` (découpage des gros fichiers,
// lot 3a). Aucune logique changée. Seul `index.ts` l'importe; ce module
// n'importe jamais `index.ts`, et il n'a aucun effet au chargement.
//
// Ce qui est ici : `LoadedMember` (une bouche chargée), `RosterRow` (une
// ligne de `keel_household_roster_for`) et `HabitRow` (une ligne de
// `keel_household_habits_for`). Les types de la fusion sont dans
// `merge_request.ts`, avec les fonctions qui les rendent.

import type { PortionMember } from "../_shared/keel/household_portions.ts";
import type { MemberAway } from "../_shared/keel/household_presence.ts";
import type { MemberOwnPlan } from "../_shared/keel/household_hand.ts";
import type { DietaryRegime } from "../_shared/keel/dietary_regime.ts";

interface LoadedMember extends PortionMember {
  /**
   * `null` pour une bouche sans compte. Sert UNIQUEMENT à savoir où chercher
   * ses contraintes de sécurité et son corps, qui restent clés sur
   * `auth.users`. Ce n'est PAS son identité: `memberId` l'est.
   */
  userId: string | null;
  /** Pour l'union des contraintes de sécurité du foyer. */
  isOwner: boolean;
  /**
   * D14 — QUAND CETTE BOUCHE N'EST PAS LÀ, les deux sources résolues.
   *
   * `effective` est ce qui compte; `self` et `household` ne servent qu'à la
   * trace du plan — sans elles, « pourquoi manque-t-il une assiette ? » n'a
   * pas de réponse trois jours plus tard.
   */
  away: MemberAway;
  /**
   * D2/D7 — LES PLANS QUI POURRAIENT RETIRER CETTE BOUCHE DE LA TABLE.
   *
   * « Pourraient »: la base a filtré (personnel · vivant · validé · ce foyer),
   * la fenêtre n'est pas encore comparée. `resolveHandOff` s'en charge, et lui
   * seul.
   */
  ownPlans: MemberOwnPlan[];
  /**
   * R1/R2 — LE RÉGIME DE CETTE BOUCHE, déjà tranché en base entre son « about
   * you » (si elle a un compte) et sa ligne (sinon), exactement comme `goal` et
   * `eating_rhythm`. `null` = personne n'a rien déclaré, OU « je mange de
   * tout »: ce module ne raisonne que sur des RESTRICTIONS, et les deux n'en
   * posent aucune (voir `memberRegime`).
   *
   * ⚠️ IL N'EST PAS SUR `PortionMember`, ET C'EST VOULU. Un régime gouverne ce
   * qu'il y a DANS la casserole, jamais la taille d'une part: le mettre sur le
   * brief de portions inviterait le modèle à écrire « ta part végétarienne »
   * dans une consigne lue à voix haute à table, ce que `FORBIDDEN_PORTION_TERMS`
   * n'attrape pas.
   */
  diet: DietaryRegime | null;
  /**
   * ⟳ 2026-09-07 — LES MOMENTS QU'ELLE A MARQUÉS « LÉGER ».
   *
   * ⛔ REQUIS, jamais `?`. Un défaut silencieux ferait peser un dîner léger
   * comme un dîner ordinaire chez tout appelant qui l'oublie — c'est-à-dire
   * annulerait la déclaration sans que rien ne le dise. `{}` = « la question
   * n'a été posée à aucun moment », et c'est le cas de toute la base d'avant
   * ce lot.
   *
   * ⚠️ TROIS ÉTATS: clé absente / `false` / `true`. Voir `parseMemberLight`.
   */
  mealLight: Record<string, boolean>;
}
// ⛔ `lightSlots` (hérité de `PortionMember`) et `mealLight` DISENT LA MÊME
// CHOSE SOUS DEUX FORMES, et les deux sont nécessaires:
//   · `mealLight` garde les TROIS états (absent / false / true) — c'est ce que
//     l'écran doit relire pour ne pas reposer une question déjà répondue;
//   · `lightSlots` est la liste des moments marqués — c'est ce que le prompt et
//     `slotPlanTargets` consomment.
// ⚠️ LA DÉRIVATION EST FAITE UNE SEULE FOIS, à la construction du membre. La
// refaire au point d'usage a été écrit puis retiré: deux dérivations d'un même
// fait finissent par diverger, et c'est celle qu'on regarde le moins qui garde
// l'ancienne règle.

/** Une ligne de `keel_household_roster_for`, telle que la base la rend. */
interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  age_state: string;
  role: string;
  goal: string | null;
  // D14 — L'UNION DES DEUX SOURCES, DÉJÀ FAITE EN BASE. Chaque entrée porte
  // sa `source` (`self` | `household`); `parseMemberAway` la relit sans
  // jamais refaire la fusion (voir `household_presence.ts`).
  away_days: unknown;
  // D2/D7 — LES PLANS PERSONNELS VIVANTS ET VALIDÉS de cette bouche, DANS
  // CE FOYER. Déjà filtrés par la base sur tout ce qu'elle peut voir seule;
  // ce qui reste à décider est le RECOUVREMENT de la fenêtre, et il est
  // décidé dans `household_hand.ts`, jamais ici.
  own_plans: unknown;
  // LES MOMENTS OÙ CETTE BOUCHE MANGE, déjà tranchés en base entre son
  // « about you » (si elle a un compte) et sa ligne (sinon) — exactement comme
  // `goal` au-dessus. `null` = personne ne l'a dit.
  eating_rhythm: unknown;
  // R2 — SON RÉGIME, tranché en base par la MÊME règle: une bouche avec compte
  // le porte dans son « about you » (`student_safety_constraints.diet_ref`, ou
  // `practical_constraints.diet_asked` pour l'omnivore), une bouche sans compte
  // sur sa ligne. `null` = personne n'a demandé.
  diet: unknown;
}

/** Une ligne de `keel_household_habits_for`, telle que la base la rend (G1). */
interface HabitRow {
  member_id: string;
  slots: unknown;
  note: string | null;
}

export type { HabitRow, LoadedMember, RosterRow };
