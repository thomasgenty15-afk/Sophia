/**
 * « À TABLE » — COMMENT ON SERT CE QUE LE PLAN DIT QU'ON CUISINE.
 *
 * ── POURQUOI ELLE A CHANGÉ D'ÉCRAN ────────────────────────────────────────
 * Elle vivait sur `/app/household`, c'est-à-dire sur la page qui décrit LES
 * GENS — qui mange ici, leurs corps, leurs interdits. Or elle ne décrit pas des
 * gens: elle décrit une SEMAINE, et elle n'a de sens qu'à côté du plan qu'elle
 * sert. Sur la page du foyer, elle listait des parts d'un plat que l'écran ne
 * montrait pas.
 *
 * ⚠️ ELLE SE MONTE SOUS LE PLAN, JAMAIS AU-DESSUS. « À table » dit comment on
 * SERT ce que le plan dit qu'on CUISINE: l'inverse ferait lire des parts avant
 * de savoir de quel plat.
 *
 * ⚠️ CE QU'ELLE N'AFFICHE JAMAIS: aucun objectif, aucun poids, aucune calorie,
 * aucun POURQUOI de part. `portion_note` est une INSTRUCTION DE SERVICE,
 * garantie sans raison ni vocabulaire de corps par `sanitizePortionNote` côté
 * serveur — c'est exactement ce qui permet de l'afficher devant toute la table.
 * L'instruction est publique, le motif qui la produit ne l'est pas.
 */

import type { HouseholdMealView } from "../../api/household";
import { Card, SectionLabel } from "../ui/Card";
import { t } from "../../i18n/t";

export interface TableCardProps {
  /** Le plan du foyer. `null` = rien à servir, la carte se tait. */
  meal: HouseholdMealView | null;
}

export default function TableCard({ meal }: TableCardProps) {
  // SANS PART, PAS DE CARTE — et pas de phrase qui explique l'absence. Une
  // carte « il n'y a pas encore de parts » apprendrait à lire une liste vide.
  if (!meal || meal.portions.length === 0) return null;
  return (
    <Card>
      <SectionLabel>{t("plan.table.title")}</SectionLabel>
      <ul className="flex flex-col gap-3">
        {meal.portions.map((p) => (
          <li key={p.memberId}>
            <p className="text-sm">
              <span className="font-medium">{p.displayName}</span>
              {" — "}
              {/* L'INSTRUCTION DE SERVICE EST LE CONTENU DE CETTE CARTE, donc
                  elle passe à `ink` et la liste des préparations reste en
                  `ink-soft`. Les deux étaient `neutral-600` et `neutral-500`:
                  deux gris à un cran d'écart, une hiérarchie qu'on ne voyait
                  pas. C'est la phrase qu'on lit à voix haute à table. */}
              <span className="text-ink">
                {p.portionNote ?? t("plan.table.standard")}
              </span>
            </p>
            {p.shares.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-sm text-ink-soft">
                {p.shares.map((s) => <li key={s.preparationId}>{s.note}</li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
