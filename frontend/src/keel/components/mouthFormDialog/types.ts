// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les types partagés par la fenêtre et ses champs.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import type React from "react";
import type { EatingOccasion, EatingOccasionSlot } from "../../api/mealGeneration";
import type { MouthFormDraft, ShakerDraft } from "../../lib/mouthForm";
import type { EatingStructure } from "../../api/eatingStructure";

/**
 * QUI EST DEVANT LE FORMULAIRE — trois faits, et pas un de plus.
 *
 * `hasAccount` décide de DEUX blocs, et dans des sens opposés:
 *   · le shaker n'existe QUE pour un compte (`fixed_intakes` est clé sur
 *     `user_id`, et la lane foyer n'en lit aucun — voir `api/mouthProfile.ts`);
 *   · le régime n'existe QUE pour une bouche sans compte (la base refuse
 *     `has_account` sur `keel_household_set_member_diet`: le régime de
 *     quelqu'un qui a un compte vit dans SON « about you »).
 *
 * Afficher l'un ou l'autre au mauvais endroit montrerait un contrôle qui échoue
 * à tous les coups — « pire qu'un contrôle absent, parce qu'il promet ».
 */
export interface MouthSubject {
  /** `false` pour une bouche qu'on ajoute; `true` quand on complète une fiche. */
  existing: boolean;
  hasAccount: boolean;
  /**
   * EST-CE MA PROPRE FICHE ? REQUIS — jamais optionnel.
   *
   * ⚠️ C'EST CE QUI DÉCIDE DE LA VOIX, et un défaut le désarmerait en silence:
   * non passé, le titulaire relirait « Son corps » et « Comment elle mange »
   * sur SA carte, ce qui est exactement le défaut signalé le 2026-08-19. Voir
   * `lib/mouthVoice.ts` — et pourquoi la troisième personne NOMME plutôt
   * qu'elle ne genre.
   */
  isSelf: boolean;
}

/** Les blocs 1-3, EN LIGNE — c'est la fiche, pas la fenêtre. */
export interface MouthCoreFieldsProps {
  draft: MouthFormDraft;
  onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
  subject: MouthSubject;
  /**
   * `YYYY-MM-DD` LOCAL, REQUIS — jamais une horloge lue ici.
   *
   * L'âge décide du plafond du curseur et du plancher de la cible. Le lire du
   * navigateur au milieu d'un rendu rendrait ce composant intestable sur la
   * valeur, et un `new Date()` au rendu change de réponse à minuit pendant
   * qu'on remplit le formulaire.
   */
  todayLocalIso: string;
  busy: boolean;
  /** Le refus du dernier enregistrement, ou `null`. REQUIS. */
  failure: string | null;
  /**
   * LE GESTE QUI OUVRE LES PRÉFÉRENCES. REQUIS — jamais optionnel: un bouton
   * dont le geste est facultatif est un bouton qui peut ne rien faire, et
   * « un geste qui ne fait rien est indiscernable d'un geste qui a marché ».
   */
  onOpenPreferences: () => void;
  onSubmit: () => void;
}

/** Les blocs 4-6, DANS LA FENÊTRE — ils affinent, ils ne structurent pas. */
/**
 * OÙ VA LE SHAKER DE CE SUJET — trois états, et pas un booléen.
 *
 * ── ⛔ CE QUI ÉTAIT FAUX AVANT (2026-09-01) ────────────────────────────────
 * Cette prop était `onSaveShaker: fn | null`, et `null` confondait DEUX choses
 * très différentes:
 *   · « ce sujet n'a nulle part où porter un apport fixe »;
 *   · « il a un endroit, mais ce n'est pas CE bouton-ci qui l'écrira ».
 * Le bloc entier était retiré dans les deux cas — donc le shaker d'une bouche
 * qu'on AJOUTE n'était pas seulement non-enregistrable: il était INCOLLECTABLE.
 * Signalé à l'écran: « dans les préférences alimentaires des personnes
 * ajoutées, il n'y a pas le shaker ».
 *
 * ⚠️ ET LE STOCK EXISTE DEPUIS LE 2026-08-19. `household_members.fixed_intakes`
 * (migration `20260819170000`), la porte `keel_household_set_member_fixed_
 * intakes`, l'écrivain `addShakerToMemberIntakes` et le LECTEUR du moteur
 * (`household_fixed_intakes.ts`, branche `!mouth.userId`) ont tous été livrés
 * ce jour-là. Seul l'écran n'a jamais rien appelé: une boucle construite aux
 * trois quarts, dont le quart manquant est le seul visible.
 *
 * ── LES TROIS ÉTATS ───────────────────────────────────────────────────────
 * · `now` — il y a une ligne, et ce bouton-ci l'écrit tout de suite. C'est la
 *   demande d'origine (« je veux un bouton enregistrer pour le shaker »): un
 *   objet qu'on ajoute doit pouvoir se poser sans emporter le formulaire.
 * · `with_the_card` — la ligne n'existe pas encore (fiche d'ajout), ou son
 *   écrivain est le bouton de la CARTE. On collecte, la carte écrit. Le bloc
 *   se rend SANS son bouton, et il dit où part la déclaration.
 * · `none` — il n'y a aucun stock que le moteur relira pour ce sujet. Le bloc
 *   ne se rend pas: un contrôle sans écrivain est pire qu'un contrôle absent,
 *   « parce qu'il promet ».
 *
 * ⛔ TROIS ÉTATS NOMMÉS, PAS DEUX BOOLÉENS. Le compilateur oblige chaque site
 * de montage à en choisir un, et deux booléens auraient un quatrième état
 * inexprimable à l'écran mais écrivable en TypeScript.
 */
export type ShakerPort =
  | {
    kind: "now";
    save: (
      shaker: ShakerDraft,
      rhythm: readonly EatingOccasionSlot[] | null,
    ) => void;
  }
  | { kind: "with_the_card" }
  | { kind: "none" };

export interface MouthPreferencesFieldsProps {
  draft: MouthFormDraft;
  onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
  subject: MouthSubject;
  busy: boolean;
  onClose: () => void;
  /**
   * LE BLOC SAUTABLE OUVERT, ou `null` — TOUS REPLIÉS.
   *
   * ⚠️ CONTRÔLÉ ET REQUIS, PAS UN `useState` INTERNE, ET C'EST UNE MUTATION
   * QUI L'A IMPOSÉ. Tant que l'état vivait dedans, un test ne pouvait pas
   * ouvrir un bloc: les deux assertions qui portent sur le CONTENU des blocs
   * sautables (le régime réservé à une bouche sans compte, les dégoûts)
   * restaient vertes quoi qu'on fasse — « une garde a besoin d'un cas qui
   * passe », et celles-là n'en avaient pas. Le rendre contrôlé donne au test
   * le seul levier qui manquait, et il donne à l'appelant celui de rouvrir la
   * fiche sur le bloc qu'il vient de refuser.
   */
  /**
   * LES MOMENTS OÙ CETTE BOUCHE MANGE — la liste que la section « ce qu'elle
   * mange déjà » propose, dans l'ordre de la journée.
   *
   * ⚠️ REQUISE, ET C'EST LE DÉFAUT QU'ELLE FERME. Cette section rendait les
   * SIX créneaux en dur (`EATING_OCCASIONS`). Signalé capture à l'appui le
   * 2026-08-19: « par défaut on a mis les 6 plages et ça n'a pas de sens pour
   * une personne qui indique qu'elle mange que 2 fois par jour ». On demandait
   * donc à quelqu'un ce qu'il mange à quatre moments dont il vient de dire
   * qu'ils n'existent pas — et chaque champ laissé vide ressemble alors à un
   * oubli plutôt qu'à une réponse.
   *
   * L'appelant la calcule: le rythme de CETTE bouche s'il en a un, sinon celui
   * de la maison, sinon les six. C'est exactement la cascade que le moteur
   * applique (`null` sur la ligne membre = « comme la maison »), donc l'écran
   * propose ce que la composition servira — pas autre chose.
   *
   * ⛔ NE PAS LA RENDRE OPTIONNELLE avec un défaut à six: le défaut serait
   * précisément le bug, et il reviendrait au premier appelant distrait.
   */
  slots: readonly EatingOccasion[];
  /**
   * ENREGISTRER LE SHAKER, TOUT DE SUITE — ou `null` quand ce sujet n'a pas de
   * port où l'écrire.
   *
   * ── ⚠️ C'EST LA SEULE ÉCRITURE DE CETTE FENÊTRE, ET ELLE EST DEMANDÉE ────
   * Le reste de la fiche est un BROUILLON que la carte enregistre; j'ai
   * d'abord appliqué la même règle ici, et l'utilisateur l'a refusée deux fois
   * — « je veux un bouton enregistrer pour le shaker ». Il a raison sur le
   * fond: ce bloc-ci est un OBJET qu'on ajoute et qu'on retire, pas un champ de
   * la personne, et un objet qui s'ajoute doit pouvoir se poser sans emporter
   * tout le formulaire avec lui.
   *
   * ⚠️ `null` QUAND LE SUJET N'A PAS DE COMPTE. `fixed_intakes` vit dans
   * `student_goals.practical_constraints`, donc sur `user_id`: une bouche sans
   * compte n'a nulle part où le ranger, et un bouton qui écrirait « son »
   * shaker le poserait en fait sur la ligne du MAÎTRE. On ne rend alors pas le
   * bloc du tout — un contrôle qui échoue à tous les coups est pire qu'un
   * contrôle absent, « parce qu'il promet ».
   *
   * ⚠️ IL PORTE AUSSI LE RYTHME DEPUIS LE 2026-09-01, ET LE COMPILATEUR NE
   * L'AURAIT PAS RÉCLAMÉ. TypeScript accepte qu'une fonction déclarée à UN
   * argument soit passée là où DEUX sont fournis: le rythme aurait donc été
   * jeté EN SILENCE chez chaque appelant, et le seul symptôme aurait été un
   * shaker en base sur un moment que la personne ne mange pas. Le second
   * paramètre est écrit ici pour que les sites de montage soient recensés par
   * le compilateur, pas par la relecture.
   */
  shakerPort: ShakerPort;
  /**
   * CE QUE LE CORPS EXIGE — ou `null` quand on ne sait pas encore.
   *
   * Autorité: `docs/fonctionnalites/composition-des-repas/FF-060-...md`
   *
   * ── ⛔ `null` NE VERROUILLE RIEN, ET C'EST LA DIRECTION D'ÉCHEC CHOISIE ──
   * Pas encore calculée, appel en vol, serveur muet: dans les trois cas aucune
   * case n'est désactivée. Une panne qui cocherait-désactiverait un moment
   * laisserait quelqu'un avec un repas qu'il ne peut pas retirer et dont
   * personne ne sait dire d'où il vient. **On perd l'explication, jamais la
   * main.**
   *
   * ⚠️ REQUISE, JAMAIS OPTIONNELLE. Un défaut à `null` ferait qu'un appelant
   * distrait n'afficherait simplement jamais le verrou — et l'écran promettrait
   * une composition que le plan fait quand même, ce qui est le pire des deux
   * mensonges: celui qui ne se voit pas.
   */
  structure: EatingStructure | null;
  /**
   * ⟳ 2026-09-01 — `memberScoped` A ÉTÉ RETIRÉ, ET IL NE DOIT PAS REVENIR.
   *
   * Il cachait deux sections — « ce que tu n'aimes pas » et « quand tu manges,
   * et quoi » — à qui n'avait pas de ligne de foyer, c'est-à-dire au parcours
   * SOLO. Le motif était vrai: les deux vivent sur `member_id`, et un solo n'en
   * avait pas. La conséquence l'était aussi, et elle n'était pas acceptable —
   * **le produit n'était pas le même selon le chemin d'entrée.**
   *
   * La réparation est en amont: le solo a maintenant un foyer d'UNE bouche
   * (`SetupPage::chooseSize`), donc une ligne membre, donc les mêmes
   * destinations que tout le monde. Cette fenêtre n'a plus rien à conditionner.
   *
   * ⛔ SI UNE SECTION FUTURE N'A PAS DE DESTINATION POUR QUELQU'UN, la réponse
   * n'est pas de la cacher pour lui: c'est de lui donner la destination. Un
   * test compare les deux parcours et refuse toute divergence — voir
   * `mouthFormDialog.int.test.ts :: « la fiche est la MÊME pour tout le
   * monde »`.
   */
}
