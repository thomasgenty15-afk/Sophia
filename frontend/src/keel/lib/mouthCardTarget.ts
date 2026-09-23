import {
  ageStateOfTypedDate,
  emptyMouthDraft,
  type MouthAgeState,
  type MouthTargetPayload,
  targetPayloadOf,
} from "./mouthForm";
import { goalForAge } from "../api/household";
import type { FunnelMouth } from "../api/onboarding";

// ===========================================================================
// CE QUI PART EN BASE QUAND LA CARTE D'UNE BOUCHE S'ENREGISTRE — 2026-09-20
//
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LE DÉFAUT QUE CE MODULE EXISTE POUR FERMER: LA CIBLE S'EFFAÇAIT, TOUJOURS
// ═══════════════════════════════════════════════════════════════════════════
//
// Signalé à l'écran: « pour Fabrice j'ai bien mis le poids visé mais il ne
// remonte pas ». Sa carte repliée rendait « POIDS VISÉ (KG) — » sur une bouche
// dont la base portait 80 kg une heure plus tôt.
//
// `saveMouthCard` construisait son payload comme ceci:
//
//     targetPayloadOf({ ...emptyMouthDraft(), goal, targetWeightKg,
//                       paceKgPerWeek }, today)
//
// — c'est-à-dire SANS le corps et SANS la date, alors que les deux sont dans
// `fields`, juste au-dessus. Or `targetPayloadOf` s'abstient (il rend la paire
// `null`) dès que `paceControlFor` ne peut pas produire de curseur, et le
// curseur se borne sur l'entretien estimé, qui a besoin d'une BANDE D'ÂGE et
// d'un corps. Sur un brouillon vide, il n'y en a jamais.
//
// Le payload valait donc `{ null, null }` À TOUS LES COUPS, et
// `keel_household_set_member_target` REMPLACE la paire: chaque enregistrement
// de carte effaçait la cible, y compris celui déclenché par un champ qui n'a
// rien à voir avec elle.
//
// Mesuré, sur la même fiche (Fabrice, 173 cm, 93 kg, homme, né en 1967,
// perte de poids, visé 80 kg):
//
//     brouillon vide + les deux nombres  →  { null, null }     ⛔
//     corps seul, sans la date           →  { null, null }     ⛔
//     corps + date                       →  { 80, 0,45 }       ✅
//
// ── POURQUOI UNE FONCTION À PART, ET PAS TROIS LIGNES DE PLUS DANS LA PAGE ──
// Parce que c'est une DÉCISION, et qu'elle est invisible à l'écran: rien ne
// distingue « la cible n'a pas été écrite » de « la cible a été effacée », et
// la page ne rend aucun refus — `setMemberTarget` répond `ok` en effaçant. Un
// test sur la page n'aurait pas pu la voir; un test sur la VALEUR rendue ici
// la voit, et il a suffi de trois appels pour la nommer.
//
// ⚠️ ET LE PLAFOND MORD: 0,5 kg/semaine demandé rend 0,45. C'est
// `paceControlFor` qui le borne sur ce corps-là, pas une perte de précision —
// et c'est la raison même pour laquelle le corps doit traverser.
//
// PURE MODULE: aucune écriture, aucune horloge au-delà du `today` reçu.
// ===========================================================================

/**
 * L'ÉTAT D'ÂGE D'UNE BOUCHE INSCRITE, VU DE SA LIGNE — trois valeurs, jamais
 * deux (chantier P3, 2026-09-03).
 *
 * `kind` n'en porte que deux, et `unknown` y devient `adult` DÉLIBÉRÉMENT
 * (voir `api/onboarding.ts`: ne pas savoir n'est pas savoir que c'est un
 * enfant). `birthDate`, lui, dit si une date EXISTE (`null` = âge inconnu).
 * Les deux ensemble rendent l'état à trois valeurs que `goalsForAge` réclame
 * — et une date TAPÉE dans la carte gagne sur les deux, parce que c'est elle
 * que le prochain enregistrement va écrire.
 *
 * ⟳ 2026-09-20 — SORTIE DE `pages/SetupPage.tsx`, où elle était locale. Elle
 * suit `mouthCardTargetPayload`, qui ne peut pas la laisser derrière: c'est
 * l'âge qui décide de la direction, et la direction qui décide si une cible a
 * le droit d'exister.
 */
export function funnelMouthAgeState(
  m: FunnelMouth,
  typedDate: string,
  todayLocalIso: string,
): MouthAgeState {
  const fromRoster: MouthAgeState = m.kind === "child"
    ? "minor"
    : m.birthDate === null
    ? "unknown"
    : "adult";
  return ageStateOfTypedDate(typedDate, fromRoster, todayLocalIso);
}

/** Ce que la carte d'une bouche tient à l'écran, en vocabulaire de brouillon. */
export interface MouthCardFields {
  birthDate: string;
  heightCm: string;
  weightKg: string;
  gender: "male" | "female" | "other" | "";
  targetWeightKg: string;
  paceKgPerWeek: string;
}

/**
 * LA PAIRE QUI PART EN BASE — ou `{ null, null }` pour l'effacer VRAIMENT.
 *
 * ⚠️ LES SIX CHAMPS TRAVERSENT, PAS SEULEMENT LES DEUX NOMBRES. Le corps et la
 * date ne décorent pas ce calcul: ils EN SONT les bornes. En retirer un rend
 * la paire `null`, et `null` n'est pas « on ne touche pas » — c'est
 * « efface ».
 *
 * ⛔ LA DIRECTION EST PLIÉE À L'ÂGE, date tapée comprise: une cible ne part
 * jamais sur une direction que les tuiles viennent de replier
 * (`target_not_for_minor` sinon, loin du geste).
 */
export function mouthCardTargetPayload(
  mouth: FunnelMouth,
  fields: MouthCardFields,
  todayLocalIso: string,
): MouthTargetPayload {
  return targetPayloadOf(
    {
      ...emptyMouthDraft(),
      goal: goalForAge(
        mouth.goal ?? "",
        funnelMouthAgeState(mouth, fields.birthDate, todayLocalIso),
      ),
      birthDate: fields.birthDate,
      heightCm: fields.heightCm,
      weightKg: fields.weightKg,
      gender: fields.gender,
      targetWeightKg: fields.targetWeightKg,
      paceKgPerWeek: fields.paceKgPerWeek,
    },
    todayLocalIso,
  );
}
