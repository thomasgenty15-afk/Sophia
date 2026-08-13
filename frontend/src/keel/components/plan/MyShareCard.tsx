/**
 * LA PART DU RÉCLAMÉ — POINT DE MONTAGE, POSÉ PAR LOT D, ÉCRIT PAR LOT E.
 *
 * ── LE TROU QUE CETTE CARTE FERME ─────────────────────────────────────────
 * Aujourd'hui un secondaire arrive sur `/app/plan` et lit « c'est le foyer qui
 * cuisine pour toi », sans bouton, puis « rien à montrer ». Il ne voit NI ce
 * que la maison cuisine NI sa propre part — alors que les deux existent en base
 * et sont lisibles par RLS. `loadMealPlans` est scopé `.eq("user_id", …)`, et
 * ce scope est JUSTE: ce dépôt a déjà rendu la ligne d'un élève à son coach
 * faute de ce filtre. La part se lit par une SECONDE requête.
 *
 * ⚠️ CE QUE CETTE CARTE N'AFFICHE JAMAIS: aucun objectif, aucun poids, aucune
 * calorie, aucun « pourquoi » de part. `portion_note` est une INSTRUCTION DE
 * SERVICE, garantie sans raison ni vocabulaire de corps par
 * `sanitizePortionNote` côté serveur. C'est ce qui permet de l'afficher:
 * l'instruction est publique, le pourquoi ne l'est pas.
 *
 * ⛔ AUCUN PARAMÈTRE DE GARDE OPTIONNEL — voir `PlanDraftDialog`.
 */

import type { HouseholdDishView, MemberPortionView } from "../../api/household";

export interface MyShareCardProps {
  /** MA ligne de `member_portions`. `null` = rien à montrer, la carte se tait. */
  mine: MemberPortionView | null;
  /** Les plats du foyer, pour le contexte. `[]` = la carte n'en montre aucun. */
  householdDishes: readonly HouseholdDishView[];
  /** Ma bouche. REQUIS: sans elle, `mine` ne peut pas être vérifiée. */
  meMemberId: string | null;
  onApprove: () => Promise<void>;
  onRequestChange: (text: string) => Promise<void>;
  busy: boolean;
}

/**
 * PLACEHOLDER. Il rend `null`, ce qui est aussi le comportement DÉFINITIF quand
 * `mine === null`: une carte de part sans part se tait, elle ne s'explique pas.
 */
export default function MyShareCard(props: MyShareCardProps) {
  // `void props` plutôt qu'un paramètre nommé `_` — voir `PlanDraftDialog`.
  void props;
  return null;
}
