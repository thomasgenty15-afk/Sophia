import React from "react";

import { isMealCopyKey, mealCopy } from "../../api/mealLabels";
import { type MealIdea, loadStudentRecipes } from "../../api/mealPlanModel";
import KeelAppShell from "../../components/KeelAppShell";
import { Badge } from "../../components/ui/Badge";
import { Card, SectionLabel } from "../../components/ui/Card";
import { t } from "../../i18n/t";

// KEEL — /app/meals. LES IDÉES DU COACH, et rien d'autre.
//
// CE QUE CET ÉCRAN EST, ET CE QU'IL N'EST PLUS
// --------------------------------------------
// Il montrait une SEMAINE composée par le coach pour CET élève, via
// `meal_plan_entries`. Cette table a disparu (20260804210000): KEEL est 1:N, le
// coach écrit UNE méthode et UNE bibliothèque pour toute sa cohorte — un coach
// de quarante élèves ne compose pas quarante semaines. Pire, la policy de
// lecture EXIGEAIT ce placement, donc une recette non épinglée n'était visible
// par personne: la bibliothèque était structurellement invisible.
//
// Il a ensuite porté, brièvement, le CONSTRUCTEUR DE REPAS. C'était le mauvais
// écran: la génération produit la semaine de l'élève, donc elle vit sur
// `/app/plan`. Ici on montre ce que le COACH a déposé.
//
// LA FRONTIÈRE, EN UNE PHRASE:
//   /app/plan  — ce que l'IA compose POUR TOI, en plats et en ingrédients;
//   /app/meals — ce que TON COACH a mis à disposition, tel qu'il l'a écrit.
//
// CE QUI NE CHANGE PAS. Rien ici n'est cochable, badgé, compté ou complétable.
// Pas une case, pas un statut, pas une série. Le sous-titre le dit avec des
// mots, et l'absence totale de contrôle le dit d'une façon qu'on ne peut pas
// discuter.
//
// ── I18N (lot 4) ──────────────────────────────────────────────────────────
// Le `COPY` local a rejoint le seed (`i18n/en.ts`, namespace `meals`). Il
// portait treize phrases dont SIX doublaient celles d'`api/mealLabels.ts` sous
// les mêmes clés `meals.slot.*` — avec deux mots différents pour `snack_am` et
// `snack_pm` (« Morning snack » ici, « Mid-morning » là-bas). Deux écrans
// nommaient donc le même créneau de deux façons. Le seed n'en garde qu'un.

/**
 * Le libellé d'un créneau, ou le token tel quel.
 *
 * On ne JETTE PAS sur un token inconnu, contrairement à `labels.ts`: le coach
 * choisit le créneau de sa recette dans un vocabulaire qui peut grandir, et une
 * recette qu'on refuse d'afficher est une recette que l'élève croit absente.
 */
function slotLabel(slot: string | null): string | null {
  if (!slot) return null;
  const key = `meals.slot.${slot}`;
  return isMealCopyKey(key) ? mealCopy(key) : slot.replace(/_/g, " ");
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; recipes: MealIdea[] };

export default function StudentMealPlanPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recipes = await loadStudentRecipes();
        if (!cancelled) setState({ kind: "ready", recipes });
      } catch {
        // R7 à la frontière: une lecture en panne est DITE, jamais rendue comme
        // une liste vide. « Ton coach n'a rien mis » et « je n'ai pas pu lire »
        // ne doivent pas se ressembler à l'écran.
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <KeelAppShell title={t("meals.title")} subtitle={t("meals.subtitle")}>
      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{t("meals.loading")}</p>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("meals.error")}</p>
        </Card>
      )}

      {state.kind === "ready" && (
        <section>
          <SectionLabel>{t("meals.list.title")}</SectionLabel>
          {state.recipes.length === 0
            ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-500">{t("meals.list.empty")}</p>
              </Card>
            )
            : (
              <div className="space-y-3">
                {state.recipes.map((recipe) => (
                  <Card key={recipe.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{recipe.title}</span>
                      {recipe.slot_key && (
                        <Badge tone="neutral">{slotLabel(recipe.slot_key)}</Badge>
                      )}
                    </div>
                    {recipe.description && (
                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        {recipe.description}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
        </section>
      )}
    </KeelAppShell>
  );
}
