import type {
  DayEnergyView,
  DishEnergyView,
  EnergyTargetView,
} from "../../api/mealEnergy";
import { mealCopy } from "../../api/mealLabels";

// FF-059 — LE CHIFFRE, RENDU UNE SEULE FOIS.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
//
// ── POURQUOI UN COMPOSANT, POUR UN NOMBRE ET UNE UNITÉ ─────────────────────
// Parce que ce nombre doit s'afficher à trois endroits — la carte d'un plat sur
// `/app/plan`, la même carte sur `/app/today`, l'en-tête d'un jour — et parce
// que la règle qui l'accompagne n'est pas « affiche-le »: c'est « ne l'affiche
// que s'il est complet, et dis avec lui ce qu'il ne compte pas ». Trois copies
// de cette règle, c'est trois occasions d'en garder une qui affiche un total
// partiel comme s'il était le total.
//
// ── CE COMPOSANT NE DÉCIDE JAMAIS DU DROIT DE VOIR ─────────────────────────
// Il rend ce qu'on lui donne. Quand une porte est fermée, l'appelant n'a
// AUCUNE donnée à lui passer — la réponse du serveur n'en contient pas. C'est
// ce qui rend la garde tenable côté client sans une seule condition ici: on ne
// peut pas afficher par erreur ce qui n'a pas voyagé.
//
// ── AUCUNE PROSE, AUCUNE PHRASE COMPOSÉE AUTOUR DU NOMBRE ──────────────────
// Le chiffre sort d'un champ typé et entre dans un `<span>`. Il ne traverse
// jamais un texte libre, jamais un `rationale`, jamais une réponse d'agent. R4
// tient parce que ce chemin-ci est le seul, et qu'il est court.

/**
 * Le chiffre d'UN plat. `null` quand il n'y en a pas — et alors on DIT
 * pourquoi.
 *
 * ⚠️ Un plat muet à côté de plats chiffrés se lit « celui-ci ne compte pas ».
 * Le motif nommé est ce qui empêche cette lecture, et c'est aussi ce qui rend
 * l'abstention utile: « un ingrédient n'est pas dans notre table » est une
 * information sur le PRODUIT, pas un reproche à l'assiette.
 */
export function DishEnergyLine({ energy }: { energy: DishEnergyView | null }) {
  if (!energy) return null;
  if (energy.kcal !== null && energy.complete) {
    return (
      <span className="text-sm tabular-nums text-gray-500">
        {mealCopy("meals.energy.dish").replace("{n}", String(energy.kcal))}
      </span>
    );
  }
  const gap = energy.gaps[0];
  const label = gap === "unknown_ingredient"
    ? mealCopy("meals.energy.dish_unknown_ingredient")
    : gap === "missing_quantity"
    ? mealCopy("meals.energy.dish_missing_quantity")
    // `no_ingredients` ne se dit pas: un plat sans ingrédient lisible n'a rien
    // à expliquer à l'élève, et le nommer commenterait un défaut de génération
    // sur sa carte.
    : null;
  if (!label) return null;
  return <span className="text-xs text-gray-400">{label}</span>;
}

/**
 * Le total d'un JOUR, et l'aveu de ce qu'il ne compte pas.
 *
 * ⚠️ LE CAS PARTIEL PORTE SES DEUX NOMBRES, jamais le seul mot « incomplet ».
 * « 1 200 kcal (incomplet) » se lit « 1 200 kcal »; « 1 200 kcal — 2 des 3
 * plats comptés » se lit correctement. C'est très exactement le rabbit hole
 * n°3 de la fiche, et il ne se commet pas dans le calcul: il se commet ici.
 */
export function DayEnergyLine({ energy }: { energy: DayEnergyView | null }) {
  if (!energy) return null;
  if (energy.kcal === null) {
    // Aucun plat lisible. On ne rend PAS « 0 kcal », qui se lirait « cette
    // journée ne nourrit pas » — le sens exactement inverse.
    return (
      <span className="text-xs font-normal text-gray-400">
        {mealCopy("meals.energy.day_unreadable")}
      </span>
    );
  }
  const text = !energy.complete
    ? mealCopy("meals.energy.day_partial")
      .replace("{n}", String(energy.kcal))
      .replace("{counted}", String(energy.dishesCounted))
      .replace("{total}", String(energy.dishesTotal))
    // L'ADD-ON SE DIT, il ne se fond pas dans le total. Le taire ferait lire à
    // deux personnes de la même table deux chiffres pour le même plat, sans
    // rien pour expliquer l'écart — après quoi la plus servie croit que le plat
    // est plus gros, et l'autre que le sien est rogné.
    : energy.addonKcal > 0
    ? mealCopy("meals.energy.day_with_addon")
      .replace("{n}", String(energy.kcal))
      .replace("{addon}", String(energy.addonKcal))
    : mealCopy("meals.energy.day").replace("{n}", String(energy.kcal));
  return (
    <span
      className={`text-xs font-normal tabular-nums ${
        energy.complete ? "text-gray-500" : "text-amber-700"
      }`}
    >
      {text}
    </span>
  );
}

/**
 * D'OÙ VIENT LE CHIFFRE — une fois par écran, jamais par plat.
 *
 * `CALORIE_REVERSAL` en une phrase: un chiffre vit dans un champ qui porte sa
 * base, ou il n'existe pas. Cette ligne est l'endroit où la base devient
 * LISIBLE — sans elle, la garantie n'est vraie que dans le code, et l'élève
 * n'a aucun moyen de distinguer ce calcul d'une estimation par photo, qui est
 * précisément ce que le produit refuse de lui montrer (−26,6 % de biais).
 */
export function EnergyBasisNote() {
  return (
    <p className="text-xs leading-5 text-gray-400">
      {mealCopy("meals.energy.basis")}
    </p>
  );
}

/**
 * FF-059 LOT 3 — LA FOURCHETTE DE MAINTENANCE. Le niveau C, et le seul endroit
 * du produit où un chiffre parle de la PERSONNE et pas de la nourriture.
 *
 * ── CE QUE CE COMPOSANT NE FERA JAMAIS ─────────────────────────────────────
 * Il ne soustrait rien. Il n'affiche ni « il te reste », ni barre de
 * progression, ni couleur qui dit bien/mal, ni pourcentage. Le total de la
 * journée est ailleurs sur l'écran, cette fourchette est ici, et c'est l'élève
 * qui lit. Toute arithmétique entre les deux ferait de ce produit le tracker
 * que `coachStartingNumbers` refuse depuis le premier jour.
 *
 * ── ET IL N'EST PAS À CÔTÉ DU TOTAL, MAIS EN BAS ───────────────────────────
 * Deux nombres alignés se soustraient tout seuls dans la tête de qui les lit.
 * La fourchette vit donc avec la note de base, sous les plats — au rang d'un
 * repère, pas d'un score.
 */
export function EnergyTargetNote({ target }: { target: EnergyTargetView | null }) {
  if (!target) return null;
  if (target.low === null || target.high === null) {
    // L'ABSENCE SE DIT, avec son motif: « ajoute une pesée » et « ta dernière
    // pesée n'a pas l'air juste » ne se réparent pas au même endroit, et un
    // silence commun ferait ressaisir un poids à qui vient de taper 500.
    const label = target.gap === "no_weight"
      ? mealCopy("meals.energy.target_no_weight")
      : target.gap === "implausible_weight"
      ? mealCopy("meals.energy.target_implausible_weight")
      : null;
    return label ? <p className="text-xs leading-5 text-gray-400">{label}</p> : null;
  }
  return (
    <div className="text-xs leading-5 text-gray-400">
      <p className="tabular-nums text-gray-500">
        {mealCopy("meals.energy.target_range")
          .replace("{low}", String(target.low))
          .replace("{high}", String(target.high))}
        {target.weightWeekStart && (
          <span className="text-gray-400">
            {" — "}
            {mealCopy("meals.energy.target_measured").replace(
              "{date}",
              target.weightWeekStart,
            )}
          </span>
        )}
      </p>
      {/* CE QUE LA FOURCHETTE N'EST PAS. Trois phrases, et elles ne sont pas
          décoratives: sans elles, un intervalle affiché sous un total se lit
          comme une cible à atteindre — ce qu'il n'est pas, et ce que le
          générateur ne vise pas (R6). */}
      <p className="mt-1">{mealCopy("meals.energy.target_note")}</p>
    </div>
  );
}
