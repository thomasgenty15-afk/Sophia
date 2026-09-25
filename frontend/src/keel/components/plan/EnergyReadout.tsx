import type {
  DayEnergyView,
  DishEnergyView,
  EnergyTargetView,
} from "../../api/mealEnergy";
import { mealCopy } from "../../api/mealLabels";
// ⟳ LOT 5 — LE MÊME `Button` QUE PARTOUT. La rangée d'interrupteurs vient
// d'être extraite de `MealBuilder`, où elle utilisait déjà celui-ci: l'importer
// est ce qui garantit que les deux adresses de la rangée rendent le même
// bouton, et pas deux qui se ressemblent.
import { Button } from "../ui/Button";

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
      <span className="text-sm tabular-nums text-ink-soft">
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
  return <span className="text-xs text-ink-soft">{label}</span>;
}

/**
 * Le total d'un JOUR, et l'aveu de ce qu'il ne compte pas.
 *
 * ⚠️ LE CAS PARTIEL PORTE SES DEUX NOMBRES, jamais le seul mot « incomplet ».
 * « 1 200 kcal (incomplet) » se lit « 1 200 kcal »; « 1 200 kcal — 2 des 3
 * plats comptés » se lit correctement. C'est très exactement le rabbit hole
 * n°3 de la fiche, et il ne se commet pas dans le calcul: il se commet ici.
 *
 * ⟳ 2026-09-24 — le conseil du midi (« vise autour de 700 ») et l'incise « sur
 * les N repas que j'ai composés » sont partis avec l'état « dehors ».
 */
export function DayEnergyLine({ energy }: { energy: DayEnergyView | null }) {
  if (!energy) return null;
  if (energy.kcal === null) {
    // Aucun plat lisible. On ne rend PAS « 0 kcal », qui se lirait « cette
    // journée ne nourrit pas » — le sens exactement inverse.
    return (
      <span className="text-xs font-normal text-ink-soft">
        {mealCopy("meals.energy.day_unreadable")}
      </span>
    );
  }
  const text = !energy.complete
    ? mealCopy("meals.energy.day_partial")
      .replace("{n}", String(energy.kcal))
      .replace("{counted}", String(energy.dishesCounted))
      .replace("{total}", String(energy.dishesTotal))
    // ⛔ LOT A1 (2026-09-22) — LA BRANCHE « dont {addon} ajoutées » EST PARTIE.
    // Elle nommait les `member_deltas` de FF-043, un aliment qui n'existait sur
    // aucune autre surface: ni boîte, ni ligne de courses, ni carte. Le total du
    // jour ne compte plus que ce que le plan a composé.
    : mealCopy("meals.energy.day").replace("{n}", String(energy.kcal));
  return (
    <span
      className={`text-xs font-normal tabular-nums ${
        energy.complete ? "text-ink-soft" : "text-amber-700"
      }`}
    >
      {text}
    </span>
  );
}

// ⛔ 2026-09-23 — `EnergyBasisNote` (« Calculé à partir des quantités de ton
// plan… »), `EnergyTargetNote` (« Autour de {low}–{high} par jour… — d'après
// ta pesée du … ») et `energyTargetRangeKey` SONT PARTIS, sur demande: « ça
// sert à rien, ça pollue l'UI ». Ils n'étaient rendus que sous le plan
// (`PlanResult`, `MealBuilder`) et dans la fenêtre des sessions.

// ---------------------------------------------------------------------------
// ⟳ LOT 5 (2026-09-01) — LES DEUX INTERRUPTEURS, ET ILS N'EXISTENT QU'ICI
//
// ── LE DÉFAUT QUE CE COMPOSANT FERME ──────────────────────────────────────
// Cette rangée vivait EN LIGNE dans `MealBuilder`, sous les plats, et c'était
// sa seule adresse dans tout le produit. Conséquence mesurée le 2026-09-01:
// quelqu'un qui avait éteint le chiffre devait revenir sur un écran de PLAN,
// dérouler jusqu'en bas des repas, et retrouver un bouton dont rien n'annonce
// qu'il est là. Le geste d'extinction était à un clic; le geste inverse était
// une fouille.
//
// Elle est donc rendue à DEUX endroits — sous les plats (là où le chiffre se
// lit) et dans la fenêtre « À propos de toi » (là où on va pour régler quelque
// chose). ⛔ MAIS UNE SEULE ÉCRITURE: deux copies d'une rangée de boutons
// divergent, et c'est celle qu'on regarde le moins qui garderait l'ancienne
// copie, l'ancienne condition d'affichage, ou l'ancien libellé.
//
// ── ⚠️ CE COMPOSANT NE DÉCIDE TOUJOURS RIEN ──────────────────────────────
// `switchOfferable` vient du SERVEUR et vaut vrai seulement quand le seul refus
// est l'interrupteur lui-même. Proposer « voir les calories » à quelqu'un que
// le plancher TCA, son âge ou son coach protègent, ce serait encore lui parler
// de calories — et cette règle-là ne se réécrit pas ici, elle se lit.
// ---------------------------------------------------------------------------

/**
 * LA RANGÉE DES DEUX BASCULES, ou rien.
 *
 * ⚠️ ELLE PREND L'OBJET ENTIER, pas six props éclatées. Les conditions
 * d'affichage (`ready`, `switchOfferable`, `targetOfferable`) et les actions
 * (`toggle`, `toggleTarget`) sont UNE décision: un appelant qui pourrait passer
 * `switchOfferable` sans `toggle` fabriquerait un bouton mort, et un appelant
 * qui pourrait forcer `switchOfferable: true` court-circuiterait la chaîne de
 * gardes depuis le client.
 */
export function EnergySwitches(
  { energy }: {
    energy: {
      ready: boolean;
      showing: boolean;
      switchOfferable: boolean;
      targetOfferable: boolean;
      target: EnergyTargetView | null;
      error: boolean;
      toggle: (next: boolean) => Promise<void>;
      toggleTarget: (next: boolean) => Promise<void>;
    };
  },
) {
  if (!energy.ready || !energy.switchOfferable) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => energy.toggle(!energy.showing)}>
        {energy.showing
          ? mealCopy("meals.energy.switch_off")
          : mealCopy("meals.energy.switch_on")}
      </Button>
      {/* LA SECONDE BASCULE, SÉPARÉE. Accepter de voir ce que pèse son dîner
          n'est pas accepter qu'on estime ce que son corps devrait manger. Elle
          ne s'affiche que si le SEUL refus de la cible est elle-même. */}
      {energy.targetOfferable && (
        <Button
          variant="secondary"
          onClick={() => energy.toggleTarget(energy.target === null)}
        >
          {energy.target === null
            ? mealCopy("meals.energy.target_switch_on")
            : mealCopy("meals.energy.target_switch_off")}
        </Button>
      )}
      <span className="text-xs text-ink-soft">
        {mealCopy("meals.energy.switch_hint")}
      </span>
      {/* UNE BASCULE QUI N'A PAS PRIS SE DIT. Le silence se lirait « c'est
          enregistré », sur un réglage dont toute la valeur est qu'il obéit. */}
      {energy.error && (
        <span className="text-xs text-red-700">
          {mealCopy("meals.energy.switch_failed")}
        </span>
      )}
    </div>
  );
}
