import type { PracticalConstraints } from "../api/practicalConstraints";
import KitchenEquipmentCard from "./KitchenEquipmentCard";
import HouseholdTraditionsCard from "./HouseholdTraditionsCard";

// L6 — LA TÊTE DE L'ÉTAPE `request`: AVEC QUOI ON CUISINE, ET CE QU'ON NE
// DÉPLACE PAS.
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.
//
// ── L'ORDRE EST IMPOSÉ, ET IL A UNE RAISON ────────────────────────────────
// « Les moyens de cuisson AVANT les disponibilités » (§2). On demande AVEC QUOI
// on cuisine avant tout le reste — sinon on planifie des cuissons impossibles,
// puis on demande à quelqu'un de trouver le temps de les faire. Cet ordre est
// celui du code ci-dessous, et `tableStepPlanning.int.test.ts` le mesure sur
// le HTML rendu: un ordre qui ne tient que par la lecture d'un fichier se
// défait au premier déplacement de bloc.
//
// ── CE QUI EN EST PARTI (A6, 2026-09-03) ──────────────────────────────────
// La troisième carte, « Le déjeuner en semaine » (`WorkLunchCard`), posait la
// question à toutes les bouches d'un coup, deux écrans avant la grille que sa
// réponse pré-remplit. Elle vit maintenant dans la fiche de chaque personne sur
// `/app/household` (`MemberWorkLunchCard`), juste au-dessus de cette grille.
// Avec elle sont partis l'état de lecture, la relecture après écriture et la
// prop `people`: ce composant ne lit plus rien et n'a plus d'effet. Les deux
// cartes qui restent écrivent elles-mêmes et relisent après.
//
// ── POURQUOI CE COMPOSANT EXISTE PLUTÔT QU'UN BLOC DANS `SetupPage` ───────
// Deux cartes étaient écrites (L2-A, L3-A) et MONTÉES NULLE PART. Tout ce qui
// pouvait sortir de `SetupPage` en est sorti: ce qui y reste est une balise.
// Le lot A5 déplace les traditions vers `/app/household`; l'équipement reste
// dans l'entonnoir (le congélateur gate le nombre de courses, lane CUISINE).

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
  /** LA PAGE RELIT SES FAITS, après chaque écriture des deux cartes. */
  onSaved: () => void | Promise<void>;
}

export default function TableStepPlanning(props: TableStepPlanningProps) {
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

      {/* ② LES JOURS QUE LE FOYER NE DÉPLACE PAS — JUSTE APRÈS L'ÉQUIPEMENT.
          Les deux répondent à la MÊME question — ce que cette cuisine peut et
          ce qu'elle fait DÉJÀ — avant que l'étape ne demande ce qu'on veut
          cette semaine.

          Elle écrit elle-même et relit après, comme sa voisine du dessus: on ne
          lui passe donc rien d'autre que de quoi prévenir l'étape. */}
      <HouseholdTraditionsCard onSaved={props.onSaved} />
    </>
  );
}
