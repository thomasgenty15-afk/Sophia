import React from "react";

import { foodGroupLabel, slotLabel } from "../../api/labels";
import { loadSlotVocabulary } from "../../api/keelClient";
import { type MealIdea, loadStudentRecipes } from "../../api/mealPlanModel";
import KeelAppShell from "../../components/KeelAppShell";
import { Card, SectionLabel } from "../../components/ui/Card";
import { c } from "./copy";

// KEEL — /app/meals. L'ÉLÈVE LIT LES RECETTES DE SON COACH.
//
// CE QUE CET ÉCRAN MONTRAIT AVANT, ET POURQUOI IL NE LE PEUT PLUS.
// Il affichait une SEMAINE: chaque recette épinglée sur un jour et un créneau,
// via `meal_plan_entries`. Cette table a disparu (20260804210000) et le motif
// est le pivot lui-même — KEEL est 1:N, le coach écrit UNE méthode et c'est
// l'élève qui compose sa semaine; un coach de quarante élèves ne compose pas
// quarante semaines. Pire, la policy de lecture EXIGEAIT ce placement, donc une
// recette non épinglée n'était visible par personne: la bibliothèque était
// structurellement invisible, et l'écran disait « votre coach n'a pas encore
// proposé d'idées » à l'élève d'un coach qui en avait écrit vingt.
//
// L'écran lit donc maintenant les recettes ACTIVES du coach, sans placement —
// exactement ce que la migration décrit.
//
// CE QUI NE CHANGE PAS, ET C'EST L'ESSENTIEL DE CET ÉCRAN.
// Rien ici n'est cochable, badgé, compté ou complétable. Pas une case, pas un
// statut, pas une série. Il n'y a rien à terminer parce qu'il n'y a rien qui
// compte — le sous-titre le dit avec des mots, et l'absence totale de contrôle
// le dit d'une façon qu'on ne peut pas discuter. Le regroupement par créneau
// ci-dessous est un classement de lecture, jamais une prescription d'horaire.
//
// READ-ONLY PAR LA BASE, PAS PAR CE FICHIER. L'élève a un SELECT sur les
// recettes actives de son coach et aucune policy d'écriture nulle part; si ce
// composant tentait d'écrire, PostgREST refuserait.

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; recipes: MealIdea[]; slotOrder: string[] };

export default function StudentMealPlanPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recipes, slots] = await Promise.all([
          loadStudentRecipes(),
          loadSlotVocabulary(),
        ]);
        if (cancelled) return;
        setState({
          kind: "ready",
          recipes,
          slotOrder: (slots as unknown as { key: string }[]).map((s) => s.key),
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <KeelAppShell
      variant="student"
      width="narrow"
      title={c("meals.student.title")}
      subtitle={c("meals.student.subtitle")}
    >
      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{c("meals.student.loading")}</p>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">
            {c("meals.student.error", { message: state.message })}
          </p>
        </Card>
      )}

      {state.kind === "ready" && state.recipes.length === 0 && (
        <Card tone="dashed">
          <p className="text-sm text-gray-600">{c("meals.student.empty")}</p>
        </Card>
      )}

      {state.kind === "ready" && state.recipes.length > 0 && (
        <RecipeList recipes={state.recipes} slotOrder={state.slotOrder} />
      )}
    </KeelAppShell>
  );
}

/**
 * Groupé par créneau, dans l'ordre du vocabulaire.
 *
 * Une liste à plat de vingt recettes ne répond pas à la question que l'élève se
 * pose, qui est « qu'est-ce que je mange MAINTENANT ». Le créneau y répond sans
 * rien prescrire: c'est le coach qui a écrit « petit-déjeuner » sur sa recette,
 * pas nous qui plaçons sa semaine.
 *
 * Les recettes SANS créneau ne sont pas perdues — elles sont rassemblées à la
 * fin. Les masquer parce qu'elles ne rentrent pas dans une case reviendrait à
 * refaire, en plus discret, le défaut que la migration vient de corriger.
 */
function RecipeList(props: { recipes: MealIdea[]; slotOrder: string[] }) {
  const groups = React.useMemo(() => {
    const bySlot = new Map<string, MealIdea[]>();
    for (const recipe of props.recipes) {
      const key = recipe.slot_key ?? "";
      const list = bySlot.get(key) ?? [];
      list.push(recipe);
      bySlot.set(key, list);
    }
    const ordered: { slot: string; recipes: MealIdea[] }[] = [];
    for (const key of props.slotOrder) {
      const list = bySlot.get(key);
      if (list && list.length > 0) ordered.push({ slot: key, recipes: list });
    }
    // Un créneau que le vocabulaire ne connaît pas ne fait pas disparaître ses
    // recettes: il les envoie avec les sans-créneau plutôt que de les avaler.
    const placed = new Set(props.slotOrder);
    const leftovers = [...bySlot.entries()]
      .filter(([key]) => key === "" || !placed.has(key))
      .flatMap(([, list]) => list);
    if (leftovers.length > 0) ordered.push({ slot: "", recipes: leftovers });
    return ordered;
  }, [props.recipes, props.slotOrder]);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <Card key={group.slot || "unslotted"}>
          {group.slot !== "" && (
            <SectionLabel>{slotLabel(group.slot)}</SectionLabel>
          )}
          <ul className="divide-y divide-gray-100">
            {group.recipes.map((recipe) => (
              <li key={recipe.id} className="py-2 first:pt-0 last:pb-0">
                <p className="text-sm text-gray-900">{recipe.title}</p>
                {recipe.description && (
                  <p className="mt-0.5 text-sm text-gray-600">{recipe.description}</p>
                )}
                {recipe.food_group_refs.length > 0 && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {recipe.food_group_refs.map(foodGroupLabel).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
