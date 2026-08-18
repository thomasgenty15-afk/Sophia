import type { WorkLunchAgeState, WorkLunchPerson } from "./workLunchForm";
import { ageStateFromBirthDate } from "./workLunchForm";

// L6 — À QUI L'ÉTAPE `table` POSE LA QUESTION DU DÉJEUNER, ET AVEC QUEL ÂGE.
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2.
//
// ── LE PROBLÈME QUE CE MODULE RÉSOUT, ET IL N'EST PAS COSMÉTIQUE ──────────
// `workLunchIsAskable` demande un `ageState` à TROIS valeurs, parce que la base
// en a trois: elle refuse `not_adult` sur un mineur ET sur un âge INCONNU. Or
// l'entonnoir n'expose pas ces trois valeurs. `readFunnelFacts` les APLATIT sur
// deux champs, et il le fait exprès (`api/onboarding.ts`):
//
//     kind:      m.ageState === "minor" ? "child" : "adult"
//     birthDate: m.ageState === "unknown" ? null  : BIRTH_DATE_ON_FILE
//
// « Ne pas savoir » y devient donc `adult`, DÉLIBÉRÉMENT — pour que les deux
// questions manquantes (la date, l'objectif) continuent d'être posées sur la
// ligne où elles manquent. C'est juste pour ces questions-là, et FAUX pour
// celle-ci: poser « déjeune-t-il au bureau ? » à quelqu'un dont on ignore l'âge
// rend un bouton que la base refuse, et un refus loin du geste se lit comme un
// bouton mort — cicatrice mesurée trois fois dans `SetupPage`.
//
// ── LA RECONSTRUCTION EST EXACTE, PAS UNE HEURISTIQUE ─────────────────────
// Les deux champs, LUS ENSEMBLE, portent encore les trois états: le `null` de
// `birthDate` est réservé à `unknown`, et un mineur porte toujours la sentinelle.
// C'est cette paire-là qu'on relit, jamais `kind` seul.
//
// ⛔ ET SURTOUT PAS `assessBirthDate` SUR CE CHAMP-LÀ. Pour une BOUCHE,
// `birthDate` vaut `BIRTH_DATE_ON_FILE` — la chaîne `"on-file"`, une marque de
// présence, pas une date. La donner à un lecteur de date rendrait `unknown` sur
// tout le monde, y compris sur les adultes dont la date est en base, et la
// question disparaîtrait de l'écran sans qu'aucun test d'écran ne bouge.
// `ageStateFromBirthDate` ne sert qu'au TITULAIRE, dont `readFunnelFacts` lit la
// vraie colonne `profiles.birth_date`.
//
// ⚠️ CE MODULE NE FAIT AUCUN RÉSEAU. C'est ce qui le rend mesurable sans base,
// et c'est aussi pourquoi il ne dépend pas de `api/onboarding.ts`: le pin de la
// sentinelle vit dans `workLunchRoster.int.test.ts`, qui l'importe, lui.

/** Une bouche telle que l'entonnoir la porte — le sous-ensemble qu'on relit. */
export interface FunnelMouthAge {
  memberId: string | null;
  firstName: string;
  kind: "adult" | "child";
  /**
   * ⚠️ POUR UNE BOUCHE, CE N'EST PAS UNE DATE — c'est `BIRTH_DATE_ON_FILE` ou
   * `null`. Seule sa NULLITÉ est lue ici. Voir l'en-tête.
   */
  birthDate: string | null;
}

/**
 * L'ÂGE D'UNE BOUCHE DE L'ENTONNOIR, RENDU À TROIS ÉTATS.
 *
 * L'ordre des tests EST la règle: un enfant est un enfant quoi qu'il arrive;
 * sinon, l'absence de date de naissance au dossier est le seul marqueur qui
 * reste de l'inconnu.
 */
export function funnelMouthAgeState(mouth: FunnelMouthAge): WorkLunchAgeState {
  if (mouth.kind === "child") return "minor";
  return mouth.birthDate === null ? "unknown" : "adult";
}

/**
 * LES BOUCHES DE L'ÉTAPE `table`, DANS L'ORDRE DE L'ÉCRAN — titulaire compris.
 *
 * ⚠️ LE TITULAIRE EST DEDANS, ET C'EST TOUT LE POINT. Il est la première bouche
 * de sa table (« le titulaire, premier et pareil », `TableStep`), et il déjeune
 * dehors comme tout le monde. `readFunnelFacts` le RETIRE de `mouths` — il vit
 * dans `state.self` —, donc quelqu'un qui se contenterait de la liste des autres
 * ne se poserait jamais la question à lui-même.
 *
 * ⚠️ SA DATE À LUI EST UNE VRAIE DATE. `readFunnelFacts` lit
 * `profiles.birth_date` pour le titulaire et la recopie telle quelle. C'est
 * exactement la colonne que la base regarde en premier pour lui, donc les deux
 * lectures répondent à la même question sur la même donnée.
 *
 * ⛔ `claimed` NE FILTRE RIEN, ET C'EST ÉCRIT EN BASE. La porte SQL n'a PAS de
 * refus `has_account` — « où quelqu'un déjeune est un FAIT », dit son
 * commentaire —, contrairement au régime et aux moments, que le maître ne peut
 * pas éditer pour une bouche qui a un compte. Filtrer ici retirerait la question
 * à des gens à qui la base accepte de répondre.
 *
 * ⚠️ ON NE FILTRE PAS NON PLUS SUR L'ÂGE ICI. `askableWorkLunchPeople` est le
 * seul endroit qui décide qui est interrogé; ce module RENSEIGNE l'âge, il ne
 * s'en sert pas. Deux filtres pour une règle, et c'est celui qu'on regarde le
 * moins qui garde l'ancien comportement.
 */
export function workLunchRoster(args: {
  self: { memberId: string | null; firstName: string; birthDate: string | null };
  mouths: readonly FunnelMouthAge[];
  /** `YYYY-MM-DD` local. L'âge du titulaire se calcule dessus. */
  todayLocalIso: string;
}): WorkLunchPerson[] {
  const roster: WorkLunchPerson[] = [
    {
      memberId: args.self.memberId,
      firstName: args.self.firstName,
      ageState: ageStateFromBirthDate(args.self.birthDate, args.todayLocalIso),
    },
  ];
  for (const mouth of args.mouths) {
    roster.push({
      memberId: mouth.memberId,
      firstName: mouth.firstName,
      ageState: funnelMouthAgeState(mouth),
    });
  }
  return roster;
}
