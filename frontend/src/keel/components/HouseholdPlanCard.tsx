import React from "react";

import type { HouseholdMealView, HouseholdMemberView } from "../api/household";
import { divergenceLines, hasDivergence } from "../api/householdPlanTrace";
import { windowDayOrder } from "../api/mealWindow";
import { groupDishListByDay } from "../lib/dishListByDay";
import { dishIsFor } from "../lib/planByPersonModel";
import { t } from "../i18n/t";
import { Card, SectionLabel } from "./ui/Card";
import DishListByDay from "./plan/DishListByDay";

// KEEL — L8 · LE PLAN DU FOYER, ET CE QUI N'A PAS FUSIONNÉ (D9).
//
// Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
//
// ── DEUX MOITIÉS, DEUX LECTEURS ───────────────────────────────────────────
//   · CE QUE LA MAISON CUISINE — pour un SECONDAIRE, qui n'avait nulle part où
//     le voir: le plan du foyer est écrit sur le compte du maître, donc
//     `loadMealPlans` (scopé `user_id`) ne le lui rendra jamais. D9 dit
//     pourtant « un secondaire voit le plan du foyer et le sien ».
//     Le maître, lui, le cuisine: il l'a déjà en entier sur `/app/plan`, et le
//     redire ici ferait deux surfaces pour le même plan.
//   · CE QUI N'A PAS FUSIONNÉ — pour TOUT LE MONDE, parce que c'est ce qui
//     explique la table qu'on a sous les yeux.
//
// ── LA PHRASE QUI PORTE LE LOT ────────────────────────────────────────────
// « Ça a la vertu de montrer que ce n'est pas le système qui est nul, mais que
// c'est la recherche de compromis qui rend les choses compliquées. » D'où
// l'ordre: la phrase de divergence AVANT la liste des noms, jamais après. Lue
// après, la liste se serait déjà lue comme une liste de fautes.
//
// ── CE QU'IL N'AFFICHE JAMAIS ─────────────────────────────────────────────
// Aucun objectif, aucun poids, aucune calorie, aucun « pourquoi » de plat. Ce
// plan est lu à voix haute par tout le foyer — c'est la raison d'être des
// gardes de non-divulgation de L4 et L6, et un écran peut les annuler à lui
// seul.

export default function HouseholdPlanCard(
  { meal, members, meMemberId, isOwner }: {
    meal: HouseholdMealView;
    /** Le roster, pour NOMMER une bouche. La trace ne porte que des ids. */
    members: readonly HouseholdMemberView[];
    /** Ma bouche à moi, pour savoir si ce plan cuisine encore pour moi. */
    meMemberId: string | null;
    isOwner: boolean;
  },
): React.ReactElement | null {
  const nameOf = React.useCallback(
    (memberId: string) =>
      members.find((m) => m.memberId === memberId)?.displayName ?? "—",
    [members],
  );

  const lines = divergenceLines(meal.trace);
  const excluded = meMemberId !== null &&
    meal.trace.taken.some((e) => e.memberId === meMemberId);
  const showDishes = !isOwner;
  /**
   * ⛔ LE PLAT DÉDIÉ D'UN AUTRE N'ENTRE PAS DANS CETTE LISTE (D3, 2026-08-18).
   *
   * Mesuré: cette carte recevait `meal.dishes` NUES et `groupDishListByDay` ne
   * filtre rien par contrat, donc le petit-déjeuner composé pour Zoé se lisait
   * dans la liste de Kid — le défaut exact que le LOT C avait fermé dans
   * `buildPersonWeek`, resté ouvert sur ce chemin-ci. La règle n'est pas
   * réécrite: c'est `dishIsFor`, celle de `buildPersonWeek`, appelée.
   *
   * ⚠️ LE FILTRE EST AVANT LE TEST DE VIDE, ET C'EST LA MOITIÉ QUI COMPTE. Un
   * plan qui ne porterait QUE des plats dédiés à d'autres doit dire « rien à
   * cuisiner pour toi », pas rendre une liste vide sous un titre.
   */
  const myDishes = meal.dishes.filter((d) => dishIsFor(d, meMemberId));
  // RIEN À DIRE ⇒ RIEN À L'ÉCRAN. Le cas majoritaire est un foyer où tout le
  // monde mange le même plan: lui servir un titre, une phrase pédagogique et
  // une liste vide ferait du bruit là où il n'y a pas de sujet.
  if (!showDishes && !hasDivergence(meal.trace)) return null;

  return (
    <Card>
      <SectionLabel>
        {showDishes ? t("household.plan.member_title") : t("household.plan.title")}
      </SectionLabel>

      {showDishes
        ? (
          <>
            {excluded
              ? (
                <p className="mb-2 text-sm text-ink">
                  {t("household.plan.member_excluded")}
                </p>
              )
              : null}
            {myDishes.length === 0
              ? <p className="text-sm text-ink-soft">{t("household.plan.no_dishes")}</p>
              : (
                // LOT 1 — la liste plate devient PAR JOUR, sans rien gagner
                // d'autre: toujours ni `why` ni ingrédients (le type ne les
                // porte pas), toujours pas de sessions. L'ordre des jours est
                // celui du PLAN (`windowDayOrder` sur la fenêtre que la ligne
                // porte), jamais le calendrier.
                <DishListByDay
                  groups={groupDishListByDay({
                    order: windowDayOrder(meal.startsOn, meal.durationDays),
                    dishes: myDishes,
                  })}
                />
              )}
          </>
        )
        : null}

      {hasDivergence(meal.trace)
        ? (
          <div className={showDishes ? "mt-3 border-t border-line pt-3" : ""}>
            {/* LA DIVERGENCE EST DITE AVANT D'ÊTRE ILLUSTRÉE — et depuis le
                passage à la charte, elle est aussi ÉCRITE plus fort que sa
                liste. Les deux étaient `gray-600` et `gray-500`, deux valeurs
                qui se ressemblent trop pour porter cet ordre; le couple
                `ink` / `ink-soft` (16,18:1 contre 6,11:1) le porte. */}
            <p className="text-sm text-ink">{t("household.plan.divergence")}</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
              {lines.map((line, i) => (
                <li key={`${line.memberId}:${line.key}:${i}`}>
                  {t(line.key, { name: nameOf(line.memberId) })}
                  {line.hint ? ` ${t(line.hint)}` : ""}
                </li>
              ))}
              {/* O5 — le barreau demandé n'a pas été tenu. Le serveur le
                  CONSTATE et ne corrige pas: le taire à l'écran laisserait un
                  plan qui se contredit lui-même, et personne pour le lire. */}
              {meal.trace.mergeShapeHonoured === false
                ? <li>{t("household.plan.merge_shape_unmet")}</li>
                : null}
            </ul>
          </div>
        )
        : null}
    </Card>
  );
}
