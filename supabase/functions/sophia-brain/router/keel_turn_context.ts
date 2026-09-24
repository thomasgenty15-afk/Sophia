// ═══════════════════════════════════════════════════════════════════════════
// LE CONTEXTE DE TOUR D'UN ÉLÈVE KEEL, ET LE PLANCHER TCA DE LA CONVERSATION
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `run.ts` (découpage des gros fichiers,
// lot 5a). Aucune logique changée. `run.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `run.ts`.
//
// Ce qui est ici : le type `KeelTurnContext` et son chargeur
// `loadKeelTurnContext` (MAILLON 1), puis l'épisode du plancher TCA porté
// d'un tour à l'autre dans `temp_memory` (MAILLON 5 :
// `conversationalRestrictionGuardForRouters`, `applyDisorderedEatingEpisodeState`,
// `disorderedEatingWorkingStateForTurn`). `processMessage` les appelle.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildKeelPlanContext,
  type KeelPlanContext,
  type KeelRole,
  loadKeelPlanContextSnapshot,
  selectDispatcherPlanContext,
} from "../context/keel_plan_context.ts";
import { dayTokenForLocalDate } from "../../_shared/keel/slot_reminders.ts";
import { evaluateRestrictionForStudent } from "../../_shared/keel/restriction_runtime.ts";
import type { RestrictionGuardResult } from "../../_shared/keel/restriction_guard.ts";
import { classifyStudentTurn } from "../skills/disordered_eating_guard/reducer.ts";
import {
  type DisorderedEatingWorkingState,
} from "../skills/disordered_eating_guard/contract.ts";
import {
  loadStudentSafetyConstraints,
  type StudentSafetyConstraint,
} from "../../_shared/keel/safety_constraints.ts";
import {
  type LoadedCoachNote,
  loadCoachNote,
} from "../../_shared/keel/coach_note.ts";
import {
  type LoadedDoctrine,
  loadPublishedDoctrine,
} from "../../_shared/keel/doctrine_loader.ts";
import {
  type LoadedProtocol,
  loadPublishedProtocol,
} from "../../_shared/keel/protocol_loader.ts";
import {
  loadLatestWeekReview,
  type StoredWeekReview,
} from "../../_shared/keel/week_review_io.ts";
import type { DisplayUnitSystem } from "../../_shared/keel/body_measure_floor.ts";
import {
  assessBirthDate,
  type BirthDateVerdict,
} from "../../_shared/keel/student_age.ts";
import type { CitablePulse } from "../../_shared/keel/daily_pulse.ts";
import { loadLatestPulse } from "../../_shared/keel/daily_pulse_io.ts";
import {
  type SupportGround,
  supportGround,
} from "../../_shared/keel/grounded_support.ts";
import type { DayFacts } from "../../_shared/keel/daily_recap.ts";
import { loadDayFacts } from "../../_shared/keel/daily_recap_io.ts";
import {
  type HouseholdTurnContext,
  loadHouseholdTurnContext,
  resolveHouseholdIdFor,
} from "../../_shared/keel/household_turn_context.ts";
import {
  type HouseholdTurnSafety,
  loadHouseholdTurnSafety,
  NO_HOUSEHOLD_SAFETY,
} from "../../_shared/keel/household_safety.ts";
import {
  EMPTY_TURN_LEDGER,
  type TurnLedger,
} from "../../_shared/keel/turn_ledger.ts";

// ===========================================================================
// W4.7 — MAILLON 1: le CONTEXTE de tour d'un élève KEEL
// ===========================================================================

export type KeelTurnContext = {
  role: KeelRole;
  is_student: boolean;
  /** ISO-3166 alpha-2, résolveur de ressources cliniques (W3.3 + W4.6). */
  country: string | null;
  /**
   * R2/R3 — BCP-47 PERSISTÉ du profil. Les deux écritures durables refusent
   * de committer sans lui plutôt que de deviner la langue d'une prose stockée
   * (`missing_content_locale`). On ne fabrique donc jamais de valeur ici.
   */
  content_locale: string | null;
  /** YYYY-MM-DD résolu dans le fuseau de l'élève par le runtime, pas ici. */
  local_date: string | null;
  /**
   * FF-008 — `profiles.display_unit_system`, tel quel.
   *
   * OBLIGATOIRE et jamais optionnel: `detectDeclaredBodyMeasure` s'en sert pour
   * lire « je suis à 172 » chez quelqu'un qui pense en livres, et ce dépôt a
   * déjà mesuré qu'« un paramètre de garde optionnel est une garde désarmée ».
   * `'metric'` est le DÉFAUT DE LA COLONNE (not null default 'metric'), pas une
   * valeur inventée ici.
   */
  display_unit_system: "metric" | "imperial";
  /**
   * FF-008 — le verdict d'âge, pour la garde « aucune mesure enregistrée depuis
   * le chat chez un mineur ».
   *
   * C'est `assessBirthDate` qui décide, jamais un booléen recalculé: le dépôt a
   * UNE définition du mineur, elle porte déjà la ceinture qui refuse un plan
   * nutritionnel à un enfant, et une seconde divergerait au premier ajustement.
   * `null` hors élève KEEL ou sans date locale.
   */
  age_verdict: BirthDateVerdict | null;
  plan_context: KeelPlanContext | null;
  plan_version_id: string | null;
  /** Le bloc à injecter (dispatcher ET composeur). Null = rien à dire. */
  plan_block: string | null;
  plan_context_reason_code: string;
  /**
   * Plancher TCA du tour. `null` ⇒ NON ARMÉ — et c'est un état distinct de
   * `restriction_flag:false` (voir `restriction_unavailable_reason`).
   */
  restriction: RestrictionGuardResult | null;
  restriction_unavailable_reason: string | null;
  /**
   * PIVOT §3.3 — les contraintes dures de l'élève, pour la CEINTURE DE SORTIE.
   *
   * `null` ⇒ la lecture a échoué, et c'est un état DISTINCT de `[]` (aucune
   * contrainte). `loadStudentSafetyConstraints` throw exprès pour rendre ces
   * deux cas indiscernables impossibles; on rattrape ici et on nomme.
   */
  safety_constraints: StudentSafetyConstraint[] | null;
  safety_constraints_unavailable_reason: string | null;
  /**
   * LES CONTRAINTES DURES DU FOYER — l'autre moitié de l'union, et la seule qui
   * puisse porter l'allergie d'une bouche SANS COMPTE.
   *
   * OBLIGATOIRE, jamais optionnel, et `NO_HOUSEHOLD_SAFETY` hors foyer: un
   * champ de garde optionnel est une garde désarmée, cicatrice `safetyBand`.
   *
   * ⚠️ IL N'EST PAS FONDU DANS `safety_constraints`, ET C'EST UNE DÉCISION.
   * Le bloc de prompt d'en face titre « THIS STUDENT'S HARD CONSTRAINTS
   * (source: student_safety_constraints) »; y verser l'allergie d'un enfant
   * ferait dire au modèle qu'un parent est allergique aux arachides, ce qui est
   * un fait faux sur une personne. Les deux listes se rejoignent là où
   * l'attribution ne compte pas — la CEINTURE DE SORTIE, qui ne fait que
   * refuser de nommer un jeton médical — et restent séparées là où elle compte,
   * le prompt. Le détail est écrit sur `householdAllergyPromptBlock`.
   */
  household_safety: HouseholdTurnSafety;
  /** PIVOT §3.3 — la doctrine publiée du coach de cet élève. */
  doctrine: LoadedDoctrine | null;
  /**
   * FF-016 — LE MAPPING ALIMENTAIRE PUBLIÉ du coach, ou `null` hors élève KEEL.
   *
   * ── CE QU'IL RÉPARE ────────────────────────────────────────────────────
   * La doctrine porte ce que le coach INTERDIT, et un verrou déterministe mord
   * dessus. Ce que le coach RECOMMANDE vivait dans `coach_food_rules`, compilé,
   * rendu — et lu par les deux générateurs de repas seulement. « Je mange quoi
   * au petit-déj ? » repartait donc avec une réponse plausible, polie, et qui
   * contredisait le plan que la même app avait composé la veille.
   *
   * IL VOYAGE SUR LE TOUR, à côté de la doctrine, et pour la même raison
   * qu'elle: il est injecté par le MÊME composeur, et un second chargement
   * ailleurs serait une deuxième source de vérité pour le même mapping.
   *
   * ⚠️ CE N'EST PAS UNE COUCHE DE SÉCURITÉ. Un `excluded` de coach est une
   * sévérité de MÉTHODE; les allergies sont dans `safety_constraints`, un cran
   * plus haut dans l'ordre des blocs, et rien ici ne les touche.
   */
  protocol: LoadedProtocol | null;
  /**
   * LA NOTE 1:1 DU COACH SUR CET ÉLÈVE (2026-08-05), ou `null` hors élève KEEL.
   *
   * Elle voyage sur le contexte de tour, à côté de la doctrine, parce qu'elle
   * est injectée par le MÊME composeur (`withKeelPromptBlocks`) et qu'un
   * second chargement ailleurs serait une deuxième source de vérité pour le
   * même texte. Absente (`reason !== "loaded"`), elle ne pousse aucun bloc.
   */
  coach_note: LoadedCoachNote | null;
  /**
   * LE DERNIER BILAN HEBDOMADAIRE CALCULÉ de cet élève, ou `null`.
   *
   * ── POURQUOI IL VOYAGE SUR LE TOUR ET NE SE RECALCULE PAS ────────────────
   * Le bilan est GELÉ au moment où le point du dimanche part
   * (`week_review_io.ts`, « l'ordre des trois temps »). La conversation de
   * toute la semaine suivante cite donc exactement les nombres que l'élève a
   * lus dans son bilan. Recalculer à chaque tour donnerait un chiffre qui
   * bouge entre deux messages — et un chiffre qui bouge est indéfendable,
   * même quand chacune de ses valeurs était juste.
   *
   * `null` en régime nominal la première semaine, et pour tout élève dont le
   * cron n'a pas encore tourné. Absent, il ne pousse RIEN — pas d'en-tête,
   * pas de « je n'ai pas encore de bilan »: c'est la leçon de
   * `NO_COACH_METHOD_BLOCK`, dont le titre décrivait un état interne et
   * ressortait mot pour mot dans la bouche de l'agent.
   */
  week_review: StoredWeekReview | null;
  /**
   * FF-013 — LE DERNIER TAP DU SOIR CITABLE, ou `null`.
   *
   * ── POURQUOI IL VOYAGE SUR LE TOUR ─────────────────────────────────────
   * L'énergie, la faim et le sommeil sont déjà pris DEUX fois. Le chat les
   * redemandait parce qu'il ne les connaissait pas: `sophia-brain` ne lisait
   * NI `student_daily_checkins` NI le biofeedback de la semaine. Un agent qui
   * ignore une donnée finit toujours par la demander, quelle que soit la
   * consigne — d'où le chargement AVANT l'interdiction, et pas l'inverse.
   *
   * `null` couvre trois cas qui se comportent pareil et se journalisent
   * différemment: aucun tap dans la fenêtre, lecture en panne, plancher de
   * restriction levé. Dans les trois, l'agent ne sait rien — et « ne rien
   * savoir » n'est JAMAIS « la journée s'est bien passée ».
   */
  daily_pulse: CitablePulse | null;
  /**
   * FF-011 — LES FAITS DE LA JOURNÉE, ou `null`.
   *
   * La matière du soutien groundé. `null` couvre trois cas: pas d'élève KEEL,
   * plancher de restriction levé (filtré AU CHARGEMENT), lecture en panne.
   *
   * ⚠️ `null` ET UNE JOURNÉE VIDE NE SONT PAS LA MÊME CHOSE, et la distinction
   * porte la ceinture: `null` n'autorise AUCUN nombre de journée, parce qu'on
   * ne justifie pas un chiffre avec des faits qu'on n'a pas lus. Une journée
   * vide autorise ses zéros, qui sont des faits.
   */
  day_facts: DayFacts | null;
  /**
   * FF-011 — le verdict de `supportGround`, calculé UNE fois par tour.
   *
   * Il décide AVANT la rédaction: on ne demande pas au modèle d'être groundé,
   * on lui donne de la matière ou on raccourcit sa laisse.
   */
  support_ground: SupportGround;
  /**
   * FF-010 — LE FOYER DE CET ÉLÈVE, filtré, ou `null`.
   *
   * `null` couvre quatre cas qui se comportent pareil: pas de foyer, plan
   * périmé, lecture en panne, roster illisible. Aucun ne produit « ton foyer
   * n'a rien prévu » à quelqu'un qui vit seul (R8) — le bloc n'est simplement
   * pas injecté.
   *
   * ⚠️ LA VISIBILITÉ EST DÉJÀ APPLIQUÉE ICI. Ce que le chargeur a refusé
   * n'entre pas dans le contexte, donc il n'y a rien à ne pas dire: un prompt
   * qui porte la donnée et une consigne de la taire est un prompt qui la dira.
   */
  household: HouseholdTurnContext | null;
  /**
   * LA QUESTION DE PRÉCISION armée par CE tour, ou `null`.
   *
   * Elle voyage ici et pas sur le `turn_frame` pour une raison mesurée: un
   * redispatch de sortie de flow RECONSTRUIT le frame et perd ce qu'on y avait
   * posé (`p5-execution-truth`, `oneShotReminderCommittedThisTurn` existe pour
   * exactement ça). `keelTurn`, lui, est un local de tour passé
   * OBLIGATOIREMENT à `finalVisibleText` — donc aux six chemins de sortie, et
   * le compilateur refuse d'en oublier un.
   *
   * Le TEXTE est un gabarit fermé (`MEAL_PRECISION_QUESTIONS`), jamais une
   * génération: c'est la seule garantie structurelle qu'aucune question de
   * quantité ne sort, quelle que soit l'humeur du composeur.
   */
  meal_precision_question?: string | null;
  /**
   * FF-025 — L'INVITATION À LA PHOTO armée par CE tour, ou `null`.
   *
   * Même véhicule et même raison que `meal_precision_question` ci-dessus: un
   * redispatch de sortie de flow reconstruit le `turn_frame` et perdrait ce
   * qu'on y aurait posé, alors que `keelTurn` est passé OBLIGATOIREMENT à
   * `finalVisibleText` sur les six chemins de sortie.
   *
   * Le TEXTE est un gabarit fermé (`photo_invitation.ts`), jamais une
   * génération: c'est la seule garantie structurelle que le registre reste
   * l'utilité et jamais le contrôle (R6), quelle que soit l'humeur du composeur.
   */
  meal_photo_invitation?: string | null;
  /**
   * FF-066 — `true` quand une fiche d'aide de CE tour explique un geste photo.
   *
   * Lu par la ceinture de sortie (`enforceTurnLedger`), qui retire toute demande
   * de photo non armée par le budget. Expliquer où est le bouton photo à
   * quelqu'un qui demande comment noter un repas n'est pas une demande: c'est
   * la même distinction que « l'élève a parlé de photo lui-même ». Absent ⇒
   * `false` ⇒ la ceinture reste armée, qui est la direction sûre.
   */
  app_help_photo?: boolean;
  /**
   * LOT 2C — LE RENVOI DU SIZING armé par CE tour, ou `null`.
   *
   * ⚠️ CE N'EST PAS UN CLASSEMENT, C'EST UN RENVOI. `canProduce("conversation",
   * "portion.adjust")` rend `false` (§5 ligne ③ de la nomenclature): une mesure
   * a besoin d'un sujet, et la conversation ne sait pas l'attribuer — « les
   * portions étaient trop grosses », dans un foyer de quatre, ne désigne
   * personne. Le questionnaire de fin de plan, lui, pose la question avec la
   * liste du foyer sous les yeux. **Le produit préfère une question de plus à
   * une part fausse.** Ce champ porte la phrase qui le dit à la personne, au
   * lieu de jeter son retour en silence.
   *
   * Même véhicule et même raison que `meal_photo_invitation` ci-dessus: un
   * redispatch de sortie de flow reconstruit le `turn_frame` et perdrait ce
   * qu'on y aurait posé, alors que `keelTurn` est passé OBLIGATOIREMENT à
   * `finalVisibleText` sur les six chemins de sortie.
   *
   * Le TEXTE est un gabarit fermé et BILINGUE (`SIZING_REDIRECT_SENTENCES`,
   * `conversation_redirect.ts`), jamais une génération — *« une règle de prompt
   * n'est pas une ceinture »*, et une garde testée dans une seule langue ne
   * mord pas dans l'autre.
   */
  sizing_redirect?: string | null;
  /**
   * LOT M1 — LE RENVOI VERS UN CHAMP armé par CE tour, ou `null`.
   *
   * ⚠️ MÊME NATURE QUE `sizing_redirect`, ÉTENDUE À TOUT LE RESTE. Depuis M1,
   * `canProduce("conversation", …)` rend `false` pour les HUIT familles: le
   * chat ne classe plus rien du tout. Ce qui n'était vrai que de la part
   * (« une mesure a besoin d'un sujet ») l'est devenu de chaque famille — une
   * phrase de chat n'a pas de dénominateur, et le magasin qu'elle alimentait ne
   * pouvait que grandir sans que personne ne le voie.
   *
   * Ce champ porte la phrase qui dit à la personne **qu'on n'a rien rangé** et
   * **où ça se pose**, au lieu de laisser son retour tomber en silence.
   *
   * Le TEXTE est un gabarit fermé et BILINGUE (`PROFILE_REDIRECT_SENTENCES`,
   * `conversation_redirect.ts`), et il est tenu par une garde de formulation:
   * aucune de ces phrases ne prétend avoir enregistré quoi que ce soit.
   */
  profile_redirect?: string | null;
  /**
   * LOT M6 — LA RÉVOCATION PAR LA QUESTION, armée par CE tour, ou `null`.
   *
   * *« Une exclusion qu'on interroge est une exclusion morte. »* Quand quelqu'un
   * demande « pourquoi il n'y a jamais de poulet ? », il vient de révoquer sa
   * règle; le renvoyer vers un écran sans rien lui dire, c'est lui faire payer
   * deux fois une préférence qu'il n'a plus.
   *
   * ⛔ ET ÇA NE LÈVE RIEN. Le §2.8 tranche « le chat n'écrit jamais, pas même en
   * un tap ». Ce champ porte une phrase qui NOMME la ligne, RAPPELLE sa cause
   * (la citation de M2), et dit OÙ elle se lève.
   */
  rule_question_redirect?: string | null;
  /**
   * LE JETON DE MALADIE DÉCLARÉE CE TOUR-CI, ou null.
   *
   * OBLIGATOIRE, pas optionnel, et c'est délibéré: ce dépôt a déjà mesuré
   * qu'« un paramètre de garde optionnel est une garde désarmée ». Le
   * compilateur est le seul relecteur qui ne se fatigue pas — même raisonnement
   * que le `keel` obligatoire de `finalVisibleText`.
   *
   * Il vient du plancher déterministe `detectDeclaredMedicalCondition`, JAMAIS
   * du dispatcher: la campagne du 2026-08-05 a mesuré le renvoi clinicien à
   * FR 0/3 et EN 1/3 quand il dépendait du LLM.
   */
  declared_medical_condition: string | null;
  /**
   * ── LE CANAL DÉTERMINISTE → PAROLE ────────────────────────────────────────
   *
   * Ce que les planchers de CE tour ont écrit, refusé, ou écrit en silence —
   * avec leur motif. Voir `_shared/keel/turn_ledger.ts` pour le pourquoi ; en
   * une phrase : « le déterministe décide, la couche qui parle ne le sait pas
   * et n'est pas contrainte » est le motif structurel de cinq REDs, et ce champ
   * est la moitié « le sait ».
   *
   * OBLIGATOIRE, jamais optionnel, et il voyage ICI plutôt que sur le
   * `turn_frame` pour la raison déjà mesurée par `meal_precision_question`: un
   * redispatch de sortie de flow RECONSTRUIT le frame et perd ce qu'on y avait
   * posé. `keelTurn` est passé OBLIGATOIREMENT à `finalVisibleText` sur les six
   * chemins de sortie, et le compilateur refuse d'en oublier un.
   *
   * ⚠️ MUTABLE, ET C'EST VOULU. Les planchers décident à des endroits différents
   * de `run`, entre le chargement et le rendu ; `keelTurn` est réassigné par
   * spread plusieurs fois entre-temps, et un tableau survit au spread par
   * référence. Écrire passe TOUJOURS par `recordTurnLedger`, qui refuse hors
   * élève KEEL et sur le ledger gelé du contexte legacy.
   */
  turn_ledger: TurnLedger;
};

export const LEGACY_KEEL_TURN_CONTEXT: KeelTurnContext = {
  role: null,
  is_student: false,
  country: null,
  content_locale: null,
  local_date: null,
  display_unit_system: "metric",
  age_verdict: null,
  plan_context: null,
  plan_version_id: null,
  plan_block: null,
  plan_context_reason_code: "legacy_plan_snapshot",
  restriction: null,
  restriction_unavailable_reason: null,
  declared_medical_condition: null,
  safety_constraints: null,
  safety_constraints_unavailable_reason: null,
  household_safety: NO_HOUSEHOLD_SAFETY,
  doctrine: null,
  protocol: null,
  coach_note: null,
  week_review: null,
  daily_pulse: null,
  day_facts: null,
  support_ground: "none",
  household: null,
  // GELÉ, et partagé par tous les tours non-KEEL: c'est un const de module, et
  // un tableau mutable ici fuirait d'un tour à l'autre. `recordTurnLedger`
  // refuse d'écrire hors élève KEEL; le gel est le filet sous cette règle.
  turn_ledger: EMPTY_TURN_LEDGER,
};

const ISO_LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function keelLocalDateFrom(userLocalDatetime: unknown): string | null {
  const head = String(userLocalDatetime ?? "").trim().slice(0, 10);
  return ISO_LOCAL_DATE.test(head) ? head : null;
}

function normalizeKeelRole(value: unknown): KeelRole {
  const raw = String(value ?? "").trim();
  return raw === "student" || raw === "coach" ? raw : null;
}

/**
 * Charge tout ce dont le tour a besoin côté KEEL, en une passe.
 *
 * FAIL-OPEN NOMMÉ, et l'arbitrage est explicite: une panne de lecture ne doit
 * PAS ouvrir le flow clinique. Un faux négatif ici = un tour normal pour un
 * élève en restriction (le plancher reste armé côté proactif depuis W4.6, où
 * il est fail-CLOSED); un faux positif = tous les élèves enfermés dans un flow
 * TCA pendant une panne de base. L'asymétrie tranche, et l'incident est
 * bruyant (`restriction_unavailable_reason` + log).
 *
 * Le contexte plan, lui, ne retombe JAMAIS sur `user_plan_items`
 * (`selectDispatcherPlanContext` porte cette règle): un élève KEEL dont le
 * plan n'a pas pu être lu n'a pas de bloc plan du tout.
 */
export async function loadKeelTurnContext(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userLocalDatetime: string | null;
  legacyPlanSnapshot: unknown;
}): Promise<KeelTurnContext> {
  let profileRow: Record<string, unknown> | null = null;
  try {
    const { data, error } = await args.supabase
      .from("profiles")
      // FF-008 ajoute DEUX colonnes à une requête qui existait déjà, plutôt
      // qu'un second aller-retour: `display_unit_system` lève l'ambiguïté
      // d'unité d'une mesure annoncée, `birth_date` porte la garde « pas de
      // suivi de poids chez un mineur ».
      .select("keel_role, country, locale, display_unit_system, birth_date")
      .eq("id", args.userId)
      .maybeSingle();
    if (error) throw error;
    profileRow = (data ?? null) as Record<string, unknown> | null;
  } catch (error) {
    // Sans rôle lisible, le tour reste LEGACY: on n'ouvre pas une surface
    // KEEL sur une lecture ratée.
    console.warn("[keel] profile role load failed", error);
    return LEGACY_KEEL_TURN_CONTEXT;
  }

  const role = normalizeKeelRole(profileRow?.keel_role);
  if (role !== "student") {
    return { ...LEGACY_KEEL_TURN_CONTEXT, role };
  }

  const country = String(profileRow?.country ?? "").trim() || null;
  const contentLocale = String(profileRow?.locale ?? "").trim() || null;
  const localDate = keelLocalDateFrom(args.userLocalDatetime);
  // La colonne est `not null default 'metric'` et son CHECK n'accepte que ces
  // deux valeurs. On ne « corrige » donc rien: on refuse simplement d'inventer
  // une troisième lecture si la colonne portait un jour autre chose.
  const displayUnitSystem: DisplayUnitSystem =
    String(profileRow?.display_unit_system ?? "").trim() === "imperial"
      ? "imperial"
      : "metric";
  // Le verdict d'âge a besoin de la date LOCALE de l'élève pour être rejouable
  // (deux appels le même jour doivent rendre le même verdict, y compris à
  // cheval sur minuit UTC). Sans elle, pas de verdict — et le plancher de
  // mesure ne s'arme pas, ce qui est la direction sûre.
  const ageVerdict = localDate
    ? assessBirthDate(profileRow?.birth_date, localDate)
    : null;

  let planContext: KeelPlanContext | null = null;
  if (localDate) {
    try {
      planContext = buildKeelPlanContext(
        await loadKeelPlanContextSnapshot(args.supabase as never, {
          user_id: args.userId,
          local_date: localDate,
          day: dayTokenForLocalDate(localDate),
        }),
      );
    } catch (error) {
      console.warn("[keel] plan context load failed", error);
      planContext = null;
    }
  }

  const selection = selectDispatcherPlanContext({
    keel_role: role,
    keel_context: planContext,
    legacy_plan_snapshot: args.legacyPlanSnapshot,
    legacy_block: null,
  });

  let restriction: RestrictionGuardResult | null = null;
  let restrictionUnavailableReason: string | null = null;
  if (localDate) {
    try {
      restriction = await evaluateRestrictionForStudent(
        args.supabase as never,
        {
          userId: args.userId,
          asOfLocalDate: localDate,
          turnMessage: args.userMessage,
          turnLocale: contentLocale,
        },
      );
    } catch (error) {
      restrictionUnavailableReason = error instanceof Error
        ? error.message
        : String(error);
      console.warn(
        "[keel] restriction guard unavailable for this turn (conversational floor NOT armed)",
        restrictionUnavailableReason,
      );
    }
  } else {
    restrictionUnavailableReason = "missing_local_date";
  }

  // PIVOT §3.3 — CEINTURE DE SORTIE, moitié « contraintes dures ».
  //
  // FAIL-OPEN NOMMÉ, même arbitrage que le plancher TCA juste au-dessus:
  // bloquer la livraison de TOUS les messages de TOUS les élèves pendant un
  // hoquet Postgres est une panne produit complète, alors qu'un tour non
  // vérifié est un risque borné.
  //
  // ⚠️ CE COMMENTAIRE A ÉTÉ FAUX, et c'est le genre de faux qui coûte cher.
  // Il disait: « le prompt porte déjà les contraintes, seule la vérification
  // déterministe manque ». Vérifié le 2026-08-03 (QA agent 4): AUCUN prompt ne
  // portait les contraintes. Le fail-open — le seul arbitrage
  // disponibilité-contre-vérification du fichier — était donc adossé à une
  // moitié de verrou qui n'existait pas: en panne de lecture, il ne restait
  // RIEN, pas « une moitié sur deux ».
  //
  // La phrase est maintenant vraie: `withKeelDoctrineBlock` injecte
  // `safetyConstraintsPromptBlock` en TÊTE du contexte. Le fail-open dégrade
  // donc bien de deux moitiés à une seule, ce qui est ce qu'il prétendait
  // faire. Si l'injection de prompt disparaît un jour, CE FAIL-OPEN DOIT ÊTRE
  // INVERSÉ en même temps — les deux se tiennent, et c'est la raison d'être de
  // ce paragraphe.
  //
  // L'incident est BRUYANT (`safety_constraints_unavailable_reason` + log), et
  // la distinction `null` (pas lu) / `[]` (rien à lire) est préservée: c'est
  // exactement ce que `loadStudentSafetyConstraints` protège en throwant.
  let safetyConstraints: StudentSafetyConstraint[] | null = null;
  let safetyConstraintsUnavailableReason: string | null = null;
  try {
    safetyConstraints = await loadStudentSafetyConstraints(
      args.supabase as never,
      args.userId,
    );
  } catch (error) {
    safetyConstraintsUnavailableReason = error instanceof Error
      ? error.message
      : String(error);
    console.warn(
      "[keel] safety constraints unavailable for this turn (OUTPUT LOCK NOT ARMED)",
      safetyConstraintsUnavailableReason,
    );
  }

  // PIVOT §3.3 — moitié « interdits du coach ». Ne throw jamais: le loader
  // porte son propre arbitrage de panne (bloc de prudence).
  const doctrine = await loadPublishedDoctrine(args.supabase, args.userId);

  // FF-016 — la moitié « aliments encouragés » de la méthode. Ne throw jamais:
  // le chargeur porte son propre arbitrage de panne, et une lecture ratée rend
  // simplement `reason: "load_failed"` — donc aucun bloc, donc l'agent répond
  // sans l'orientation par groupe, exactement comme avant ce lot.
  //
  // Il lit `student_goals.goal` LUI-MÊME (cf. son en-tête): la variante servie
  // est la même que celle de la doctrine par construction, et pas parce qu'un
  // appelant a pensé à passer le bon argument.
  const protocol = await loadPublishedProtocol(args.supabase, args.userId);

  // La moitié « 1:1 assumé » — mode optionnel, absent chez la quasi-totalité
  // des élèves. Ne throw jamais et porte son propre arbitrage de panne.
  const coachNote = await loadCoachNote(args.supabase, args.userId);

  // LE BILAN DE LA DERNIÈRE SEMAINE EXAMINÉE. Ne throw jamais: une lecture en
  // panne ou une forme illisible rend `null`, et le tour perd un sujet de
  // conversation — pas la conversation. Le pire cas de l'alternative serait un
  // chiffre faux cité dans la bulle, que ni l'élève ni le coach ne peuvent
  // distinguer d'un vrai.
  const weekReview = await loadLatestWeekReview(args.supabase, args.userId);

  // FF-013 — LE TAP DU SOIR, FILTRÉ AU CHARGEMENT.
  //
  // ⚠️ LE FILTRE DE RESTRICTION EST ICI, PAS À LA RÉDACTION. C'est la règle que
  // FF-010 formule et que celle-ci applique: « un prompt qui porte la donnée et
  // une consigne de ne pas la dire est un prompt qui la dira ». Sous plancher
  // levé, la matière n'entre pas — il n'y a donc rien à ne pas dire.
  //
  // `restriction === null` (lecture en panne) NE ferme PAS la porte, et c'est
  // le même arbitrage fail-open nommé que le plancher lui-même vingt lignes
  // plus haut: un tour non filtré est un risque borné, tous les élèves privés
  // de contexte pendant un hoquet Postgres est une panne produit.
  const restrictionRaised = restriction?.restriction_flag === true;
  const dailyPulse = restrictionRaised || !localDate
    ? null
    : await loadLatestPulse(args.supabase, {
      userId: args.userId,
      localDate,
    });

  // FF-011 — LA MATIÈRE DU SOUTIEN GROUNDÉ, filtrée au CHARGEMENT elle aussi.
  //
  // `loadDayFacts` ne jette jamais: une lecture en panne rend `EMPTY_DAY_FACTS`
  // et journalise. On garde ici la distinction que le chargeur perd — `null`
  // (« je n'ai pas lu ») contre une journée vide (« j'ai lu, il n'y a rien ») —
  // parce que c'est elle qui décide si un zéro est un fait citable ou un
  // chiffre inventé.
  const dayFacts = restrictionRaised || !localDate
    ? null
    : await loadDayFacts(args.supabase, { userId: args.userId, localDate });
  const groundOfSupport = supportGround(
    dayFacts,
    restrictionRaised ? null : (weekReview?.reading ?? null),
  );

  // ── LE FOYER, RÉSOLU UNE FOIS POUR SES DEUX LANES ────────────────────────
  //
  // `run.ts` est le chemin de TOUTES les conversations, et la plupart des gens
  // n'ont pas de foyer. Cette requête-ci EXISTAIT DÉJÀ (elle était le premier
  // pas de `loadHouseholdTurnContext`); elle est simplement remontée d'un cran
  // pour servir aussi la lane de sécurité. Quelqu'un sans foyer paie donc
  // exactement ce qu'il payait avant ce lot: une lecture d'appartenance, qui
  // rend `null`, et plus rien ensuite — pas de lecture d'allergies, pas de
  // bloc, pas de changement de comportement.
  //
  // ⚠️ ELLE N'EST PAS GATÉE SUR `localDate`. Le CONTEXTE du foyer l'est (un
  // plat sans date est un plat d'hier servi ce soir), la SÉCURITÉ non: une
  // allergie ne se lit pas derrière une garde de calendrier.
  //
  // Une panne ICI n'arme PAS la dégradation « ne propose rien à manger »: on
  // ignore alors s'il y a seulement un foyer, la panne frapperait aussi ceux
  // qui vivent seuls, et la lane individuelle laisse déjà passer ce même tour
  // (fail-open nommé, plus haut). L'arbitrage complet est écrit sur
  // `loadHouseholdTurnSafety`.
  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdFor(args.supabase, args.userId);
  } catch (error) {
    console.warn(
      "[keel/household] membership unreadable for this turn (no household lane)",
      error,
    );
  }

  // LES ALLERGIES DU FOYER, dont celles des bouches sans compte. Ne lève
  // jamais: le chargeur porte son propre arbitrage de panne, nommé et bruyant.
  const householdSafety = await loadHouseholdTurnSafety(
    args.supabase as never,
    { householdId, contentLocale: contentLocale ?? "" },
  );

  // FF-010 — LE FOYER. Il n'est PAS filtré par le plancher de restriction, et
  // c'est délibéré: « on mange quoi ce soir ? » est une question de cuisine,
  // pas une surface d'adhérence. Le bloc ne porte ni score, ni poids, ni
  // progression — rien de ce que `SUPPRESSED_STUDENT_SURFACES` suspend. Le
  // taire sous plancher levé priverait quelqu'un en difficulté de la seule
  // information pratique dont il a besoin pour dîner.
  //
  // ⟳ LA CONDITION A PERDU `householdId` LE 2026-09-08, ET C'EST LE POINT DU
  // LOT. Un solo n'a AUCUNE ligne `household_members` — « le solo ne crée pas
  // de foyer » — donc `resolveHouseholdIdFor` rend `null`, donc ce chargeur
  // n'était pas appelé, donc AUCUN bloc de plan ne partait dans le prompt.
  // L'agent bottait en touche ou INVENTAIT un plat, très exactement le défaut
  // que `household_turn_context.ts` existe pour fermer, laissé ouvert pour
  // toute une population.
  //
  // `householdId` ne décide donc plus S'IL Y A un bloc: il décide LEQUEL —
  // le plan du foyer, ou le plan personnel de la personne. C'est `ctx.scope`
  // qui le porte jusqu'au rendu.
  //
  // ⚠️ `localDate` RESTE UNE CONDITION. Sans jour local on ne sait ni quelle
  // fenêtre couvre aujourd'hui, ni si elle est close — et un bloc de plan sans
  // fenêtre est précisément le plat d'hier servi ce soir.
  const household = localDate
    ? await loadHouseholdTurnContext(args.supabase, {
      householdId,
      userId: args.userId,
      localDate,
    })
    : null;

  return {
    role,
    is_student: true,
    country,
    content_locale: contentLocale,
    local_date: localDate,
    display_unit_system: displayUnitSystem,
    age_verdict: ageVerdict,
    plan_context: planContext,
    plan_version_id: planContext?.plan_version_id ?? null,
    plan_block: selection.block,
    plan_context_reason_code: selection.reason_code,
    restriction,
    restriction_unavailable_reason: restrictionUnavailableReason,
    // Le chargeur ne voit pas le message du tour: c'est le plancher, plus bas
    // dans `run`, qui le renseigne. Null ici veut dire « pas encore lu », pas
    // « rien déclaré ».
    declared_medical_condition: null,
    safety_constraints: safetyConstraints,
    safety_constraints_unavailable_reason: safetyConstraintsUnavailableReason,
    household_safety: householdSafety,
    doctrine,
    protocol,
    coach_note: coachNote,
    week_review: weekReview,
    daily_pulse: dailyPulse,
    day_facts: dayFacts,
    support_ground: groundOfSupport,
    household,
    // NEUF À CHAQUE TOUR. Le chargeur n'y met rien: il n'a pris aucune décision
    // de plancher — les planchers tournent plus bas, dans `run`, après lui.
    turn_ledger: [],
  };
}

// ===========================================================================
// W4.7 — MAILLON 5: le plancher TCA, côté CONVERSATION
//
// `active_flow_state.ts` (hors périmètre de ce lot) ne reconnaît PAS
// `disordered_eating_guard` comme flow local: `readActiveFlowState` renverrait
// donc null et la branche de continuation de `routers.ts` est inatteignable.
// La continuité de l'épisode est donc portée ici, par une clé de temp_memory
// dédiée: le reducer reçoit son état précédent et avance normalement
// (entry → supported/holding → closed), et l'entrée du routeur se réarme à
// chaque tour tant que le plancher est levé.
//
// CONDITION DE DÉSARMEMENT (doctrine P9, et elle est obligatoire ici): un flow
// qu'on ne peut pas quitter est un piège — c'est la cicatrice
// `safety-crisis-flow-no-exit-on-denial`. Une fois l'épisode CLOS (le reducer
// a dit exit: demande de passer à autre chose, deuxième refus, plafond de
// 6 tours), le flow ne se rouvre plus pour LE MÊME jeu de déclencheurs. Il se
// rouvre si les déclencheurs changent, ou si le tour courant rapporte un
// symptôme médical aigu — ces deux-là sont nommés, pas implicites.
// ===========================================================================

export const KEEL_DISORDERED_EATING_STATE_KEY =
  "__keel_disordered_eating_guard_state";

export type KeelDisorderedEatingEpisodeState = {
  episode_key: string;
  closed: boolean;
  working_state: DisorderedEatingWorkingState;
  updated_at: string;
};

function restrictionEpisodeKey(result: RestrictionGuardResult): string {
  return [...result.triggers.map((trigger) => trigger.code)].sort().join("+");
}

function readDisorderedEatingEpisode(
  tempMemory: unknown,
): KeelDisorderedEatingEpisodeState | null {
  const raw = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[KEEL_DISORDERED_EATING_STATE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    episode_key: String(record.episode_key ?? ""),
    closed: record.closed === true,
    working_state:
      record.working_state && typeof record.working_state === "object" &&
        !Array.isArray(record.working_state)
        ? record.working_state as DisorderedEatingWorkingState
        : {},
    updated_at: String(record.updated_at ?? ""),
  };
}

/**
 * Le plancher, tel qu'il est présenté à `runConversationRouters`.
 * `null` ⇒ lane non armée. Aucune valeur inventée: ce qui sort d'ici est soit
 * le verdict du guard, soit rien.
 */
export function conversationalRestrictionGuardForRouters(args: {
  restriction: RestrictionGuardResult | null;
  tempMemory: unknown;
  userMessage: string;
}): { restriction_flag: boolean; trigger_codes?: string[] } | null {
  const result = args.restriction;
  if (!result || result.restriction_flag !== true) return null;
  const episode = readDisorderedEatingEpisode(args.tempMemory);
  const sameEpisode = episode !== null &&
    episode.episode_key === restrictionEpisodeKey(result);
  const acuteMedicalThisTurn =
    classifyStudentTurn(args.userMessage) === "reports_acute_medical";
  if (episode?.closed === true && sameEpisode && !acuteMedicalThisTurn) {
    return null;
  }
  return {
    restriction_flag: true,
    trigger_codes: result.triggers.map((trigger) => trigger.code),
  };
}

export function applyDisorderedEatingEpisodeState(args: {
  tempMemory: Record<string, unknown>;
  restriction: RestrictionGuardResult;
  statePatch: DisorderedEatingWorkingState;
  closed: boolean;
}): Record<string, unknown> {
  return {
    ...args.tempMemory,
    [KEEL_DISORDERED_EATING_STATE_KEY]: {
      episode_key: restrictionEpisodeKey(args.restriction),
      closed: args.closed,
      working_state: args.statePatch,
      updated_at: new Date().toISOString(),
    } satisfies KeelDisorderedEatingEpisodeState,
  };
}

export function disorderedEatingWorkingStateForTurn(
  tempMemory: unknown,
  restriction: RestrictionGuardResult,
): DisorderedEatingWorkingState {
  const episode = readDisorderedEatingEpisode(tempMemory);
  if (!episode) return {};
  // Un épisode qui change de déclencheurs repart à zéro: reprendre le compteur
  // de tours d'un épisode précédent ferait expirer le nouveau au premier tour.
  return episode.episode_key === restrictionEpisodeKey(restriction)
    ? episode.working_state
    : {};
}
