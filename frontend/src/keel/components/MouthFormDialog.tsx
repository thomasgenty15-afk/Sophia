import React from "react";

import Modal from "./ui/Modal";
import { t } from "../i18n/t";
import type { MouthPreferencesFieldsProps } from "./mouthFormDialog/types.ts";
import { MouthPreferencesFields } from "./mouthFormDialog/MouthPreferencesFields.tsx";

// ── ⟳ 2026-09-24 · LES CHAMPS VIVENT DANS `mouthFormDialog/` (lot 4a) ────────
// Ce fichier ne garde que la fenêtre (`MouthFormDialog`). Les six blocs, leurs
// cadres, leurs libellés et leurs types ont été déplacés À L'IDENTIQUE dans
// `mouthFormDialog/`, et ce fichier RÉ-EXPORTE ce qu'il exportait: les imports
// de `SetupPage`, `HouseholdPage` et des tests ne changent pas.
//
// ⚠️ LES QUATRE IMPORTS SANS NOM, JUSTE EN DESSOUS, SONT VOULUS. Ces modules ne
// servent pas à la fenêtre elle-même, mais ils sont sortis de ce fichier: ils
// figurent dans sa famille (`scripts/source-families.json`), que les tests
// lisent à la place du fichier seul. Le test Deno
// `source_family_registry_test.ts` exige que chaque module de la famille soit
// importé DIRECTEMENT par le fichier d'origine. Ils sont de toute façon chargés
// par les champs qui s'en servent: ces lignes ne changent rien au rendu.
import "./mouthFormDialog/labels.ts";
import "./mouthFormDialog/blocks.tsx";
import "./mouthFormDialog/TermsEntry.tsx";
import "./mouthFormDialog/ShakerFields.tsx";

export type {
  MouthCoreFieldsProps,
  MouthPreferencesFieldsProps,
  MouthSubject,
  ShakerPort,
} from "./mouthFormDialog/types.ts";
export { MouthCoreFields } from "./mouthFormDialog/MouthCoreFields.tsx";
export { MouthPreferencesFields } from "./mouthFormDialog/MouthPreferencesFields.tsx";
export { MouthPreferencesButton } from "./mouthFormDialog/MouthPreferencesButton.tsx";
export { TargetAndPaceFields } from "./mouthFormDialog/TargetAndPaceFields.tsx";
export {
  type MouthActivityAndStructure,
  MouthActivityAxesFields,
  MouthAppetiteFields,
} from "./mouthFormDialog/ActivityAndAppetiteFields.tsx";

// ═══════════════════════════════════════════════════════════════════════════
// UNE BOUCHE — SIX BLOCS, ET DEUX SURFACES DEPUIS LE 2026-08-18.
//
// Conception: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §1.
// La DÉCISION vit dans `lib/mouthForm.ts`; ce fichier REND.
//
// ── ⚠️ LA RÈGLE DE RÉPARTITION, DANS LES MOTS DE LA DÉCISION ─────────────
// « Le poids visé et le rythme d'évolution, il faut pas que ce soit dans la
//   pop-up […]. Et le reste (allergies, etc.) dans une pop-up accessible depuis
//   "Renseigner ses préférences alimentaires". »
//
// Ce qui STRUCTURE le plan reste dans le flux, en ligne, sans clic; ce qui
// l'AFFINE passe derrière un bouton:
//
//   `MouthCoreFields`        blocs 1-3 — qui c'est · la direction (avec le
//                            poids visé ET le curseur de rythme) · le corps et
//                            le cran d'activité. C'est lui qui porte le bouton
//                            d'enregistrement, parce que c'est lui qui porte
//                            les trois blocs obligatoires.
//   `MouthPreferencesFields` blocs 4-6 — ce qu'elle mange déjà (avec le
//                            shaker) · les allergies · ses dégoûts et son
//                            régime. Rendus dans `MouthFormDialog`.
//
// ⚠️ UN SEUL BROUILLON POUR LES DEUX, ET UN SEUL ÉCRIVAIN. La fenêtre n'a pas
// de bouton qui enregistre: elle édite le même `MouthFormDraft` que la fiche en
// ligne, et c'est le Save de la fiche qui écrit. Deux boutons d'enregistrement
// sur un même brouillon, c'est la garantie qu'un jour l'un des deux cessera
// d'écrire ce que l'autre écrit — le dépôt l'a déjà mesuré sur `MeCard`.
// La contrepartie était nommée à l'écran — ce qui avait été renseigné derrière
// le bouton était RÉCAPITULÉ sous lui —, et cette ligne a été retirée le
// 2026-09-20 sur demande. Refermer la fenêtre ne laisse donc plus de trace
// visible de ce qu'on vient d'y taper: la donnée part, la PREUVE non. Voir
// `MouthPreferencesButton`.
//
// ── IL S'OUVRE POUR TOUT LE MONDE, MAÎTRE COMPRIS ────────────────────────
// « sans quoi celui qui tient la maison serait le seul dont on ne sait rien ».
// D'où `subject`: la même fenêtre sert la première bouche et la cinquième, et
// les deux seuls écarts sont nommés dans le type — un compte porte son shaker,
// une bouche sans compte porte son régime.
//
// ── ⚠️ ELLE SE FERME TOUJOURS ────────────────────────────────────────────
// « un pop-up qu'on ne peut pas fermer fait abandonner l'ajout de la deuxième
// personne, et le foyer meurt là ». Échap, la croix et le bouton de sortie
// referment sans condition; ce que les trois blocs obligatoires retiennent est
// le bouton qui INSCRIT. Ne pas transformer « obligatoire » en fenêtre captive:
// c'est la lecture littérale, et elle coûte le foyer.
//
// ── ⛔ ON NE DEMANDE JAMAIS « ADULTE OU ENFANT » ─────────────────────────
// La date de naissance le dit. Ce fichier n'a aucun champ `kind`, et le seul
// endroit où l'âge entre est `ageStateOfDraft`. Poser la question en plus
// ouvrirait deux réponses qui se contredisent.
//
// ── ⚠️ ET UN MINEUR PORTE LES SIX BLOCS — MAIS UNE SEULE DIRECTION ───────
// Les six blocs sont rendus pour lui comme pour les autres (renversement du
// 2026-08-18, toujours vrai: aucun bloc n'est masqué). Ce qui a changé le
// 2026-09-03 (chantier P3, décision D3.2) est le CONTENU du bloc 3:
// `goalsForAge("minor")` ne rend que `maintenance`, libellée « Manger
// normalement » — parce que depuis le 2026-08-22 (`20260822041500`, lot S4)
// les quatre portes d'écriture refusent `fat_loss` et `muscle_gain` sur un
// mineur, et qu'un écran qui propose ce que la base refuse rend un jeton brut.
// Une direction héritée est PLIÉE à `maintenance` par `foldMinorGoal` — au
// rendu ET à l'écriture — et la fiche le DIT (`household.goal.minor_switched`).
// Ce qui le protège en plus n'est pas à l'écran: l'énergie d'un mineur reste
// une maintenance calculée sur son âge, et son corps n'est jamais ÉNONCÉ.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA FENÊTRE DES PRÉFÉRENCES — le chrome, et ce qu'il porte.
 *
 * ⛔ PAS DE `onSubmit` ICI, ET C'EST LE POINT DE LA SÉPARATION. Elle édite le
 * brouillon de la fiche; c'est la fiche qui enregistre.
 */
export interface MouthFormDialogProps extends MouthPreferencesFieldsProps {
  open: boolean;
}

/**
 * LA FENÊTRE — le chrome, et rien d'autre.
 *
 * ⚠️ LE CORPS EST UN COMPOSANT SÉPARÉ, ET C'EST UNE CONTRAINTE DE PREUVE, PAS
 * UN GOÛT. `Modal` passe par `createPortal(…, document.body)`, et
 * `vitest.config.ts` tourne en environnement `node` — il n'y a pas de
 * `document`. Monter la fenêtre entière sous `renderToStaticMarkup` lève
 * `ReferenceError: document is not defined`, donc les six blocs ne seraient
 * prouvables que par un test de SOURCE, et ce dépôt a déjà vu des tests de
 * source rester verts sur du code mort.
 *
 * ⛔ NE PAS « RÉPARER » ÇA EN PASSANT `vitest.config.ts` EN `jsdom`: le fichier
 * est partagé par toutes les lanes, et changer l'environnement global de la
 * suite pour un composant est un effet de bord que personne n'a demandé.
 */
export default function MouthFormDialog(
  props: MouthFormDialogProps,
): React.ReactElement {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      // LE TITRE NOMME LE BOUTON QUI L'A OUVERTE, et le prénom vient après.
      // Une fenêtre qui ne porte pas le nom du geste laisse le doute sur ce
      // qu'on est en train de remplir.
      title={props.draft.firstName.trim()
        ? t("household.mouth.preferences_title_named", {
          name: props.draft.firstName.trim(),
        })
        : t("household.mouth.preferences_title")}
      size="lg"
      // ── ⛔ UNE CROIX, PLUS « PLUS TARD » (2026-08-19) ────────────────────
      // Le libellé disait « plus tard » pour rassurer: la fiche se reprend, on
      // ne perd rien. Il n'a plus lieu d'être — la fenêtre ÉCRIT à la
      // fermeture depuis ce matin, donc il n'y a pas de « plus tard », il y a
      // « c'est enregistré ». Un mot qui décrit une hésitation sur un geste qui
      // n'en est plus une.
      //
      // ⚠️ LE TEXTE SURVIT EN `aria-label`: une croix sans nom accessible est
      // un bouton muet pour un lecteur d'écran.
      closeAsIcon
      closeLabel={t("common.close")}
    >
      {/* `{...props}` porte déjà `structure`: la nommer une seconde fois la
          ferait écraser par l'étalement, en silence. */}
      <MouthPreferencesFields {...props} />
    </Modal>
  );
}
