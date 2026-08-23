import React from "react";

import { t } from "../i18n/t";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { loadWorkLunch, setMemberWorkLunch } from "../api/workLunch";
import type { WorkLunch } from "../lib/presenceMarks";
import { commitWorkLunch, readWorkLunchAnswers } from "../lib/workLunchCommit";
import type { WorkLunchPerson } from "../lib/workLunchForm";
import KitchenEquipmentCard from "./KitchenEquipmentCard";
import HouseholdTraditionsCard from "./HouseholdTraditionsCard";
import WorkLunchCard from "./WorkLunchCard";
import { Card, SectionLabel } from "./ui/Card";

// L6 — LA TÊTE DE L'ÉTAPE `table`: AVEC QUOI ON CUISINE, PUIS QUI EST LÀ LE MIDI.
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.
//
// ── L'ORDRE EST IMPOSÉ, ET IL A UNE RAISON ────────────────────────────────
// « Les moyens de cuisson AVANT les disponibilités » (§2). On demande AVEC QUOI
// on cuisine avant de demander QUAND — sinon on planifie des cuissons
// impossibles, puis on demande à quelqu'un de trouver le temps de les faire. Cet
// ordre est celui du code ci-dessous, et `tableStepPlanning.int.test.ts` le
// mesure sur le HTML rendu: un ordre qui ne tient que par la lecture d'un
// fichier se défait au premier déplacement de bloc.
//
// ── POURQUOI CE COMPOSANT EXISTE PLUTÔT QU'UN BLOC DANS `SetupPage` ───────
// Deux cartes étaient écrites (L2-A, L3-A) et MONTÉES NULLE PART. Les brancher
// demandait un état de lecture, un état d'écriture et un rafraîchissement — dans
// un fichier de 3 800 lignes que trois lanes se partagent aujourd'hui. Tout ce
// qui pouvait sortir de `SetupPage` en est sorti: ce qui y reste est une balise.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LE RAFRAÎCHISSEMENT APRÈS ÉCRITURE N'EST PAS UN CONFORT D'AFFICHAGE.
// C'EST LA GARDE QUI EMPÊCHE LE FORMULAIRE D'EFFACER LA GRILLE.
// ═══════════════════════════════════════════════════════════════════════════
//
// La porte SQL `keel_household_set_member_work_lunch` RÉ-APPLIQUE son
// pré-remplissage à CHAQUE écriture, même identique (mesuré par L3-B): elle
// retire puis réécrit les cinq midis « dehors ». Une écriture identique n'est
// donc PAS un no-op — elle RESSUSCITE le midi que la personne venait de décocher
// à la main dans la grille du plan. Or « pré-remplir n'est pas décider »: la
// grille gagne toujours (§2.2 bis).
//
// `WorkLunchCard` s'en garde par `workLunchWriteIsNeeded(saved, next)`, et
// `saved` est ce que CE composant lui passe. Si on ne relit pas après
// l'écriture, `saved` reste la valeur d'avant: repasser par « dehors » après un
// détour par « gamelle » se relit alors comme un changement, on réécrit, et les
// cinq midis reviennent. La relecture est ce qui rend la garde vraie.
//
// ⛔ ET IL N'Y A AUCUNE ÉCRITURE AU MONTAGE. Le seul `useEffect` de ce fichier
// LIT. Un formulaire qui ré-émet sa réponse « pour être sûr » effacerait la
// correction qu'on vient de faire, sans qu'un seul pixel ne bouge — cicatrice
// `mount-snapshot-forms-need-a-loading-gate`, qui coûte ici une DONNÉE et pas un
// affichage.

export interface TableStepPlanningProps {
  /**
   * `student_goals.practical_constraints`, tel que la page l'a lu.
   *
   * ⚠️ `null` = PAS ENCORE LU, et c'est la porte de `KitchenEquipmentCard`: sans
   * elle, sept cases décochées s'afficheraient pendant la lecture, puis
   * partiraient telles quelles au premier Enregistrer. C'est aussi une PHOTO,
   * jamais de quoi écrire — l'écrivain relit la colonne lui-même.
   */
  practicalConstraints: PracticalConstraints | null;
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /**
   * LES BOUCHES DE LA TABLE, TITULAIRE COMPRIS — voir `lib/workLunchRoster.ts`.
   * La carte filtre elle-même les majeurs; on ne refiltre pas ici.
   */
  people: readonly WorkLunchPerson[];
  busy: boolean;
  /**
   * LA PAGE RELIT SES FAITS.
   *
   * ⚠️ APPELÉ APRÈS LE DÉJEUNER AUSSI, ET PAS SEULEMENT APRÈS L'ÉQUIPEMENT. La
   * porte SQL écrit `away_days` en même temps que `work_lunch`: sans relecture,
   * l'étape 4 monterait sa grille sur les absences d'avant le pré-remplissage,
   * et les cinq midis n'y seraient pas — alors qu'ils sont en base.
   */
  onSaved: () => void | Promise<void>;
}

export default function TableStepPlanning(props: TableStepPlanningProps) {
  /**
   * CE QUI EST ENREGISTRÉ, PAR BOUCHE. `null` = LA LECTURE N'A PAS EU LIEU.
   *
   * ⚠️ UNE `Map` VIDE VEUT DIRE « lu, personne n'a répondu » — une information
   * tout à fait différente, et celle qui ferait écrire par-dessus une réponse
   * existante. Les deux ne se confondent pas ici, et la carte s'en sert comme
   * porte de rendu.
   */
  const [answers, setAnswers] = React.useState<
    Map<string, WorkLunch | null> | null
  >(null);
  const [readError, setReadError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    // ⛔ LE REPLI D'UNE LECTURE RATÉE EST DANS `readWorkLunchAnswers`, ET PAS
    // ICI, PARCE QU'UN `catch` POSÉ DANS CE FICHIER N'EST MESURABLE PAR AUCUN
    // TEST DE CE DÉPÔT. `renderToStaticMarkup` ne joue aucun effet: y remplacer
    // `null` par `new Map()` — c'est-à-dire dire « personne n'a répondu » à un
    // foyer qui a répondu, et laisser le premier clic l'écraser — passait les
    // neuf tests sans en faire tomber un. Mutation jouée, 0 rouge, extraction
    // faite. Même geste que `commitWorkLunch`, pour la même raison.
    const read = await readWorkLunchAnswers(loadWorkLunch);
    // On ne remet PAS `answers` à `null` sur un échec: ce qui a déjà été lu
    // reste vrai, et l'erreur se dit à côté. C'est `read.answers === null` qui
    // porte le refus de fabriquer du vide, pas cette ligne.
    if (read.answers !== null) setAnswers(read.answers);
    setReadError(read.error);
  }, []);

  // LE SEUL EFFET DU FICHIER, ET IL LIT. Voir le pavé de l'en-tête.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      {/* ① AVEC QUOI ON CUISINE — EN PREMIER (§2). La carte écrit elle-même,
          par son propre bouton, et relit la colonne avant de fusionner: on ne
          lui passe donc que de quoi PRÉ-COCHER. */}
      <KitchenEquipmentCard
        practicalConstraints={props.practicalConstraints}
        hasGoal={props.hasGoal}
        onSaved={props.onSaved}
      />

      {/* ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS — JUSTE APRÈS L'ÉQUIPEMENT.
          Les deux répondent à la MÊME question — ce que cette cuisine peut et
          ce qu'elle fait DÉJÀ — avant que l'étape ne demande ce qu'on veut
          cette semaine. Les séparer par le midi au travail ferait lire une
          habitude permanente comme une envie du moment.

          Elle écrit elle-même et relit après, comme sa voisine du dessus: on ne
          lui passe donc rien d'autre que de quoi prévenir l'étape. */}
      <HouseholdTraditionsCard onSaved={props.onSaved} />

      {/* ② QUI EST LÀ LE MIDI — ENSUITE, ET JAMAIS AVANT. */}
      {readError !== null
        ? (
          // LE REFUS PRÈS DU GESTE — ici, près de la carte qui manque. Un écran
          // qui afficherait « chargement… » pour toujours sur une lecture tombée
          // ne dit pas qu'il faut réessayer.
          <Card>
            <SectionLabel>{t("setup.work_lunch.title")}</SectionLabel>
            <p className="mt-2 text-sm text-red-700">{readError}</p>
          </Card>
        )
        : (
          <WorkLunchCard
            people={props.people}
            answers={answers}
            busy={props.busy}
            onSave={(memberId, answer) =>
              commitWorkLunch({
                memberId,
                answer,
                save: setMemberWorkLunch,
                reread: refresh,
                onSaved: props.onSaved,
              })}
          />
        )}
    </>
  );
}
