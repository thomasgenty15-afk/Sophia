// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// La pastille d'une bouche, dans la vue d'un membre.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import type { HouseholdMemberView } from "../../api/household";
import { t } from "../../i18n/t";
import { Badge } from "../../components/ui/Badge";

export function MemberBadges({ member }: { member: HouseholdMemberView }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-paper-2 p-3 text-sm">
      <span className="font-medium">{member.displayName}</span>
      {member.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
      {/* L'ÉTIQUETTE, JAMAIS L'ÂGE. Un enfant n'a pas à voir son âge affiché sur
          un écran que tout le foyer regarde.
          ⚠️ `unknown` ne porte AUCUNE étiquette: écrire « adulte » par défaut
          affirmerait un fait qu'on n'a pas. */}
      {member.ageState === "minor" ? <Badge>{t("household.members.child")}</Badge> : null}
    </li>
  );
}
