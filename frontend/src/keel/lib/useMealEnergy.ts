import React from "react";

import {
  type DayEnergyView,
  type DishEnergyView,
  type EnergyReading,
  type EnergyTargetView,
  loadMealEnergy,
  setEnergyDisplay,
  setEnergyTarget,
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
  /**
   * FF-059 LOT 3 — LA FOURCHETTE DE MAINTENANCE. `null` = porte ⑤ fermée.
   *
   * ⚠️ Aucun reste n'est calculé, ni ici ni ailleurs. Le total du jour et la
   * fourchette se posent côte à côte; les soustraire ferait un tracker.
   */
  target: EnergyTargetView | null;
  /** VRAI quand le seul refus de la cible est l'interrupteur de l'élève. */
  targetOfferable: boolean;
  /** Bascule la porte ⑤. SÉPARÉE de la ④: ce ne sont pas les mêmes objets. */
  toggleTarget: (next: boolean) => Promise<void>;
}

const NO_DISHES: readonly GeneratedDish[] = [];

// ---------------------------------------------------------------------------
// ⟳ LOT 5 (2026-09-01) — LES INSTANCES SE RECHARGENT TOUTES, OU ELLES MENTENT
//
// ── LE DÉFAUT, VU À L'ÉCRAN AVANT D'ÊTRE ÉCRIT ─────────────────────────────
// Depuis que la rangée d'interrupteurs a une SECONDE adresse (la fenêtre « À
// propos de toi »), deux instances de ce hook sont montées en même temps sur
// `/app/plan`. Elles lisent la même colonne et écrivent la même colonne — mais
// `flip` ne rechargeait que CELLE QU'ON AVAIT TOUCHÉE.
//
// Mesuré dans la vraie UI le 2026-09-01, après un clic sur « Masquer les
// calories » sous les plats:
//
//     bouton sous les plats  → « Afficher les calories »   (à jour)
//     bouton dans la fenêtre → « Masquer les calories »    (périmé)
//
// Deux boutons contraires, sur le même écran, pour le même réglage. Et le
// périmé n'est pas seulement laid: appuyer dessus ÉCRIT `false` sur une colonne
// qui vaut déjà `false`, donc il ne se répare pas tout seul — il faut deviner
// qu'il faut recharger la page.
//
// ── POURQUOI UN SIGNAL, ET PAS UN ÉTAT REMONTÉ ─────────────────────────────
// Remonter le hook obligerait à remonter aussi les PLATS (`MealBuilder` les
// possède, et c'est lui qui rend le chiffre par plat). On déplacerait une
// grosse pièce pour synchroniser un booléen.
//
// ⛔ ET CE SIGNAL NE PORTE AUCUNE VALEUR. Il ne dit pas « c'est allumé »: il
// dit « quelque chose a bougé, redemande ». Chaque instance refait sa requête
// et c'est le SERVEUR qui retranche — la règle « on recharge, on ne devine
// pas » vaut entre deux instances exactement comme elle vaut après un clic.
// ---------------------------------------------------------------------------
const switchListeners = new Set<() => void>();

/** Prévenir toutes les instances montées qu'un interrupteur vient d'être écrit. */
function announceSwitchWrite(): void {
  // La copie est délibérée: un abonné qui se démonte pendant la boucle
  // modifierait le `Set` qu'on parcourt.
  for (const notify of [...switchListeners]) notify();
}

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

  // ON RECHARGE, ON NE DEVINE PAS. Un interrupteur n'est qu'UNE porte: les
  // autres peuvent très bien refermer derrière lui, et un écran qui afficherait
  // des chiffres parce que l'élève vient de cliquer aurait court-circuité la
  // chaîne de gardes depuis le client.
  // ⟳ LOT 5 — L'ABONNEMENT AU SIGNAL. Chaque instance montée se recharge quand
  // n'importe laquelle écrit la colonne, y compris elle-même: `announceSwitchWrite`
  // parcourt TOUS les abonnés, et celle qui a écrit en fait partie.
  React.useEffect(() => {
    const bump = () => setReloads((n) => n + 1);
    switchListeners.add(bump);
    return () => {
      switchListeners.delete(bump);
    };
  }, []);

  const flip = React.useCallback(
    (write: (v: boolean) => Promise<void>) => async (next: boolean) => {
      setError(false);
      try {
        await write(next);
        // ⚠️ PAS `setReloads` EN DIRECT. Ce geste-ci ne rechargeait QUE
        // l'instance touchée, et l'autre rendait un bouton contraire sur le
        // même écran — mesuré, voir le bloc en tête de fichier.
        announceSwitchWrite();
      } catch {
        setError(true);
      }
    },
    [],
  );
  const toggle = React.useMemo(() => flip(setEnergyDisplay), [flip]);
  const toggleTarget = React.useMemo(() => flip(setEnergyTarget), [flip]);

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
    target: reading?.show === true ? reading.target : null,
    targetOfferable: reading?.show === true && reading.targetOfferable,
    toggleTarget,
  };
}
