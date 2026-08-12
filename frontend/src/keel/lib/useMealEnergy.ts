import React from "react";

import {
  type DayEnergyView,
  type DishEnergyView,
  type EnergyReading,
  loadMealEnergy,
  setEnergyDisplay,
} from "../api/mealEnergy";
import { type GeneratedDish } from "../api/mealGeneration";

// FF-059 — LA LIAISON DU CHIFFRE, ÉCRITE UNE SEULE FOIS.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
//
// ── MÊME RAISON D'EXISTER QUE `useMealTicks` ───────────────────────────────
// Deux écrans montrent le même plat: `/app/plan` et `/app/today`. Le chiffre
// doit être LE MÊME chiffre. Deux liaisons parallèles divergeraient sur la
// seule chose qui compte, et la divergence se verrait comme deux nombres
// différents pour un dîner — sans qu'aucun des deux ne soit identifiable comme
// le menteur.
//
// ── L'INDEX EST LE LIEN, ET IL FAUT LE DIRE ────────────────────────────────
// Le serveur rend un tableau `dishes` indexé sur `student_generated_meals.dishes`,
// et l'écran affiche des objets issus du MÊME tableau, lus par `readDishes`.
// Le lien est donc la POSITION, pas le titre — deux plats peuvent porter le même
// titre sur deux jours, et un titre n'est pas une identité.
//
// ⚠️ La carte reçoit un OBJET, pas un index. La table ci-dessous est donc clée
// sur la RÉFÉRENCE de l'objet: `groupByDay` replace les mêmes objets dans ses
// groupes, sans les recopier. Une clé par titre aurait attribué le chiffre du
// lundi au dîner du jeudi.
//
// ── RIEN N'EST MIS EN CACHE AU-DELÀ DU MONTAGE (R5) ────────────────────────
// La table meurt avec le composant, et elle se refait à chaque changement de
// `planId` ou de liste de plats. Un plan modifié rend donc un autre chiffre au
// chargement suivant, et il n'y a aucun état à invalider parce qu'il n'y en a
// aucun qui survive.

export interface MealEnergy {
  /** Faux tant que la réponse n'est pas revenue. Rien ne s'affiche avant. */
  ready: boolean;
  /**
   * VRAI quand les quatre portes sont ouvertes ET que ce plan est calculable.
   *
   * ⚠️ Quand c'est faux, il n'y a AUCUN chiffre dans cet objet — pas un
   * tableau vide, pas un zéro. Le serveur n'en a pas envoyé.
   */
  showing: boolean;
  /**
   * VRAI seulement quand le SEUL refus est l'interrupteur de l'élève.
   *
   * C'est ce qui permet d'afficher la bascule « voir les calories » à qui l'a
   * éteinte, sans jamais en parler à qui le plancher TCA, l'âge ou son coach
   * protègent — leur montrer une bascule serait déjà leur parler du sujet.
   */
  switchOfferable: boolean;
  /** Le motif nommé du silence, pour un log ou une copie. Jamais un booléen. */
  reason: EnergyReading["reason"];
  /**
   * POURQUOI CE PLAN N'A PAS DE CHIFFRE alors que les portes sont ouvertes.
   * `household_portions_not_numeric` aujourd'hui, et c'est le seul.
   */
  abstention: string | null;
  /** Le chiffre de ce plat, ou `null`. */
  forDish: (dish: GeneratedDish) => DishEnergyView | null;
  /** Le total de ce jour, ou `null`. */
  forDay: (day: string | null) => DayEnergyView | null;
  /** Bascule la porte ④. Recharge derrière: c'est le serveur qui décide. */
  toggle: (next: boolean) => Promise<void>;
  /** Une bascule qui n'a pas pris se dit, elle ne se tait pas. */
  error: boolean;
}

const NO_DISHES: readonly GeneratedDish[] = [];

export function useMealEnergy(args: {
  planId: string | null;
  dishes: readonly GeneratedDish[];
}): MealEnergy {
  const { planId } = args;
  const dishes = args.dishes.length > 0 ? args.dishes : NO_DISHES;

  const [reading, setReading] = React.useState<EnergyReading | null>(null);
  const [error, setError] = React.useState(false);
  const [reloads, setReloads] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!planId) {
        // PAS de `setReading(null)` déguisé en refus: sans plan il n'y a rien à
        // demander, et l'état « pas prêt » est exact.
        if (!cancelled) setReading({ show: false, reason: "no_plan", switchOfferable: false });
        return;
      }
      const next = await loadMealEnergy([planId]);
      if (!cancelled) setReading(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, reloads]);

  const plan = reading?.show === true
    ? reading.plans.find((p) => p.planId === planId) ?? null
    : null;

  // LA TABLE PLAT → CHIFFRE, clée sur la RÉFÉRENCE de l'objet plat.
  const byDish = React.useMemo(() => {
    const map = new Map<GeneratedDish, DishEnergyView>();
    if (!plan?.computable) return map;
    for (const [i, dish] of dishes.entries()) {
      const e = plan.dishes[i];
      // ⚠️ AUCUN REPLI SUR UN VOISIN. Si les deux tableaux n'ont pas la même
      // longueur, la ligne manquante reste absente: attribuer le chiffre du
      // plat suivant serait un nombre faux sur une assiette réelle, et il
      // aurait l'air juste.
      if (e) map.set(dish, e);
    }
    return map;
  }, [plan, dishes]);

  const byDay = React.useMemo(() => {
    const map = new Map<string | null, DayEnergyView>();
    if (!plan?.computable) return map;
    for (const d of plan.days) map.set(d.day, d);
    return map;
  }, [plan]);

  const toggle = React.useCallback(async (next: boolean) => {
    setError(false);
    try {
      await setEnergyDisplay(next);
      // ON RECHARGE, ON NE DEVINE PAS. L'interrupteur n'est que la porte ④: les
      // trois autres peuvent très bien refermer derrière lui, et un écran qui
      // afficherait des chiffres parce que l'élève vient de cliquer aurait
      // court-circuité la chaîne de gardes depuis le client.
      setReloads((n) => n + 1);
    } catch {
      setError(true);
    }
  }, []);

  return {
    ready: reading !== null,
    showing: plan?.computable === true,
    switchOfferable: reading?.show === true ? true : reading?.switchOfferable === true,
    reason: reading?.reason ?? "no_plan",
    abstention: plan?.abstention ?? null,
    forDish: (dish) => byDish.get(dish) ?? null,
    forDay: (day) => byDay.get(day) ?? null,
    toggle,
    error,
  };
}
