// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// Les deux formes de l'écran: l'état de lecture (`Load`) et le brouillon de
// ma fiche (`SelfDraft`).
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import type {
  AppetiteLevel,
  DayActivityLevel,
  SportFrequency,
  ActivityLevel,
} from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import type { MemberGender, MemberGoal } from "../../api/household";
import type { DietAnswer } from "../../api/onboarding";
import type { LightDraft, SideCoursesDraft } from "../../lib/mealExtras";
import type { ShakerDraft } from "../../lib/mouthForm";
import type { EatingOccasionSlot } from "../../api/mealGeneration";

export type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

/** Le brouillon de MA fiche. Séparé des faits: on ne réécrit qu'au Save. */
export interface SelfDraft {
  firstName: string;
  /** Vide = pas encore saisie. Le champ est une `date`, donc `YYYY-MM-DD`. */
  birthDate: string;
  heightCm: string;
  weightKg: string;
  gender: MemberGender | "";
  /**
   * `null` = aucune tuile cochée, ET C'EST UNE RÉPONSE VALIDE — pas un champ
   * vide à remplir. Il n'y a donc pas de `""` ici comme sur les autres: le
   * vocabulaire n'a pas de jeton d'ignorance, exprès (`tokens.ts`).
   */
  activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
  /**
   * ① CE QU'IL Y A D'AUTRE DANS L'ASSIETTE · ⑤ L'APPÉTIT (2026-08-20).
   *
   * ⛔ ILS SE SAISISSENT DANS LA FENÊTRE DES PRÉFÉRENCES, ET ILS SONT DANS CE
   * BROUILLON-CI — pas dans un second. C'est la règle qui gouverne toute la
   * fenêtre: un seul brouillon, un seul écrivain. Deux états pour une même
   * personne, c'est la garantie qu'un jour l'un des deux cessera d'écrire ce
   * que l'autre écrit.
   *
   */
  appetite: AppetiteLevel | "";
  goal: MemberGoal | "";
  /** Vide = pas encore répondu. `omnivore` EST une réponse. */
  diet: DietAnswer | "";
  allergies: string[];
  /** « Rien à déclarer » — une RÉPONSE, pas une absence de réponse. */
  allergiesNone: boolean;
  // ── CE QUI SE SAISIT DERRIÈRE « RENSEIGNER SES PRÉFÉRENCES » (2026-08-18) ──
  // Ces trois-là ne sont PAS des champs de la carte: ils vivent dans la
  // fenêtre. Ils sont quand même dans CE brouillon, et pas dans un second, pour
  // la raison qui gouverne toute la fenêtre — un seul brouillon, un seul
  // écrivain. Deux états pour une même personne, c'est la garantie qu'un jour
  // l'un des deux cessera d'écrire ce que l'autre écrit.
  /** Une ligne libre par moment nommé. Clé = le moment. SEMÉE par `load`. */
  habits: Record<string, string>;
  /**
   * ⟳ 2026-09-07 — « + repas léger », par moment RÉPONDU. SEMÉE par `load`.
   *
   * ⛔ MÊME CICATRICE QUE `habits` JUSTE AU-DESSUS, et elle coûte plus cher
   * ici: une clé ABSENTE veut dire « pas demandé » et `false` veut dire
   * « demandé, ce moment est ordinaire ». Un brouillon non semé écrirait la
   * seconde à la place de la première — une réponse que personne n'a donnée.
   * Trois états, cf. `LightDraft`.
   */
  light: LightDraft;
  /**
   * ⟳ 2026-09-23 — SES À-CÔTÉS (entrée, fromage, dessert, pain), par moment.
   * SEMÉS par `load`, pour la raison de `light` juste au-dessus: la porte
   * REMPLACE la liste, et un brouillon non semé effacerait « jamais de
   * dessert » au premier « Continuer ». Trois états par type.
   */
  sideCourses: SideCoursesDraft;
  /** Ses dégoûts. JAMAIS une allergie — deux tables, deux natures (FF-046). */
  dislikes: string[];
  /** Son apport fixe déclaré, ou `null`. Clé sur `user_id` (`fixed_intakes`). */
  shaker: ShakerDraft | null;
  /**
   * SES MOMENTS — et, depuis le 2026-08-19, CEUX DE LA MAISON.
   *
   * La question a quitté l'étape 3 pour la fiche. Le titulaire étant la
   * première bouche, sa réponse écrit les DEUX: `practical_constraints`
   * (le repli de toute bouche muette) et sa ligne membre. Voir `saveSelf`.
   */
  rhythm: readonly EatingOccasionSlot[] | null;
}
