import React from "react";

import {
  type DishIngredient,
  type DishSameDay,
  type DishSideCourseKind,
  type GeneratedDish,
} from "../api/mealGeneration";
import { type BoxEnergyView, type DishEnergyView } from "../api/mealEnergy";
import { dishDayLabel, dishSlotLabel, mealCopy } from "../api/mealLabels";
import { MEAL_UNTICK_FORM_REASONS } from "../api/mealTicks";
import { type DishSessionView } from "../lib/dishSession";
import { type BoxLine, dishSideSummary, looseSideLinesForDish } from "../lib/mealBoxes";
// ⟳ LOT C (2026-09-11) — la quantité vient de la donnée structurée finale.
// Ici le périmètre est le PLAT: ce sont les lignes fraîches de l'assiette,
// pas le lot d'une casserole. Voir `lib/ingredientQuantity.ts`.
import { foodIconOf } from "../lib/foodIcon";
import { ingredientQuantityText } from "../lib/ingredientQuantity";
import { type DishTick, type UntickPrompt } from "../lib/useMealTicks";
import { BoxTable } from "./plan/BoxTable";
import { DishEnergyLine } from "./plan/EnergyReadout";
import AnchoredPanel from "./ui/AnchoredPanel";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

// UN PLAT, RENDU UNE SEULE FOIS.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Le plat était rendu dans `MealBuilder` (« ce que je viens de composer ») et
// devait l'être une seconde fois dans `/app/today` (« ce que je mange
// aujourd'hui »). Deux rendus du même objet finissent par diverger, et ici la
// divergence se paierait sur la seule chose qui compte: l'élève lirait des
// ingrédients sur un écran et pas sur l'autre, sans aucun moyen de savoir
// lequel des deux ment.
//
// LE PLAT ENTIER, PAS SON TITRE. Le titre seul (« Chicken thighs, rice,
// spinach ») oblige à rouvrir un autre écran pour cuisiner. Un plat se lit là
// où on le mange: les ingrédients avec leurs quantités, et la méthode.
//
// ── LA DOCTRINE NE S'AFFICHE JAMAIS ────────────────────────────────────────
// Même règle que le moteur: les convictions du coach ENTRENT dans la
// composition et n'en RESSORTENT pas. `GeneratedDish` ne porte même pas
// `honours_belief_keys` (le client `api/mealGeneration.ts` refuse de le
// recopier), donc ce composant n'a rien à afficher par accident.
//
// C'est l'inverse d'une ligne de semaine (`WeekPlanItem.source_belief_claim`),
// qui cite la conviction exprès — et ce n'est pas une incohérence: une ligne de
// méthode est une LECTURE de la conviction, qu'il faut pouvoir juger; un plat
// est un dîner que la méthode a servi à composer, et l'annoter de la méthode
// transformerait un repas en leçon.
//
// ── UNE SEULE CASE, ET ELLE NE MESURE PAS L'OBÉISSANCE ─────────────────────
// `tick` est OPTIONNEL, et son absence est le défaut: un `DishCard` sans lui
// est strictement en lecture. C'est ce qui garde la règle d'origine vraie là où
// elle l'était — aucun statut, aucune série, aucun « l'a-t-il suivi », parce
// que personne n'a rien prescrit.
//
// Ce que la case dit, quand elle est là: « j'ai mangé ça ». Un fait rapporté
// par l'élève, pas une consigne validée. Elle n'ouvre aucun score et ne crédite
// aucune ligne de plan (`_shared/keel/meal_tick.ts`: sans référence
// structurée, l'évaluateur ne crédite rien); elle compte pour la COUVERTURE —
// « cet élève rapporte ce qu'il mange » — et strictement rien d'autre.
//
// QUI DÉCIDE DE L'AFFICHER: l'appelant, et seulement sur les plats
// d'aujourd'hui. Le pourquoi de cette borne est dans `lib/useMealTicks.ts`
// (une coche est datée du jour où on tape, donc elle n'a de sens que sur ce
// qu'on mange ce jour-là).

/**
 * CE JOUR-CI EST-IL LE JOUR DE CUISSON, OU UN JOUR DE RESTES ?
 *
 * Défaut mesuré, et il est grossier: un plat en lot est placé sur chaque jour
 * qu'il couvre, et il y répétait ses quantités ENTIÈRES. « chicken thighs
 * 1,200 g » apparaissait lundi, mardi, mercredi et jeudi — quatre fois. Un
 * élève qui lit ça comprend qu'il doit acheter et cuire 4,8 kg de poulet.
 * (La liste de courses, elle, était juste: 2 kg au total.)
 *
 * `null` = ce plat se cuisine ici, ou ne se cuisine qu'une fois: quantités et
 * méthode complètes. Un jeton de jour = on mange le lot cuit CE jour-là, et la
 * carte se replie sur ce qu'il faut vraiment faire — sortir la boîte.
 */
export type ServedFrom = string | null;

/** La préparation dans laquelle ce plat puise, résolue par l'appelant. */
export interface DishSource {
  title: string;
  cookOn: string | null;
}

/**
 * ⟳ 2026-09-24 — « REMPLACER » CE PLAT, SUR L'APERÇU SEULEMENT.
 *
 * Résolu par l'appelant (`PlanDraftDialog`), comme `tick`: la carte ne sait
 * ni ce qui est barré ailleurs dans le plan ni combien de reprises il reste.
 * Elle rend le bouton, ou le plat barré avec sa raison et la sortie « Garder
 * ce plat ».
 *
 * `struck` = la raison écrite, pour CE titre — toutes les occurrences du même
 * titre sont barrées ensemble, et c'est l'appelant qui le décide.
 */
export interface DishReplaceControl {
  struck: { reason: string } | null;
  /** Faux = plus de reprise, un travail en cours, ou le plafond de plats atteint. */
  canReplace: boolean;
  onReplace: () => void;
  onKeep: () => void;
  /**
   * ⟳ 2026-09-24 — LA BULLE DE CE PLAT (raison, puis « ça vaut aussi
   * pour… »), rendue sous son bouton. `null`/absent = fermée. Une seule carte
   * la porte à la fois: celle dont on a cliqué le bouton.
   */
  panel?: React.ReactNode;
}

/** Le kcal d'un contenant à UN nom, lu comme celui du plat quand cette personne est seule à table. */
function energyOfBox(box: BoxEnergyView | null): DishEnergyView | null {
  return box === null ? null : { kcal: box.kcal, basis: box.basis, complete: true, gaps: [] };
}

export default function DishCard(
  {
    dish,
    tick,
    servedFrom = null,
    sources = [],
    energy = null,
    boxEnergy,
    sessions = [],
    slotBadge,
    boxes = [],
    eaters = [],
    shares = [],
    compact = false,
    replace = null,
  }: {
    dish: GeneratedDish;
    tick?: DishTick | null;
    servedFrom?: ServedFrom;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LE CRÉNEAU SUR LA CARTE — ou déjà dit par la SECTION au-dessus.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ── LE DÉFAUT (2026-08-19) ───────────────────────────────────────────
     * « Au lieu d'avoir des tags "petit déjeuner", il faudrait que ce soit des
     * sections claires. » Sur `/app/plan`, les plats d'un jour se suivaient et
     * chacun portait sa pastille de créneau: pour savoir ce qu'on mange à midi
     * il fallait BALAYER les cartes et lire chaque pastille, au lieu de sauter
     * à un titre. Le regroupement par moment existait déjà dans le modèle
     * (`groupDayBySlot`) — il n'était simplement pas montré.
     *
     * ⚠️ REQUISE, ET C'EST LE POINT. Un défaut à `true` aurait laissé la
     * pastille doubler le titre de section chez l'appelant qui l'oublie; un
     * défaut à `false` aurait fait DISPARAÎTRE le créneau de `/app/today`, où
     * les plats se rendent à plat et où la pastille est la seule chose qui dise
     * quand on les mange. Aucun des deux défauts n'est sûr, donc il n'y en a
     * pas: l'appelant déclare si quelque chose au-dessus a déjà nommé le
     * moment.
     */
    slotBadge: boolean;
    /** Les préparations que ce plat consomme. Vide = il se fait de zéro. */
    sources?: readonly DishSource[];
    /**
     * LES CONTENANTS DE CE REPAS — un par GROUPE de mangeurs, résolus par
     * l'appelant (v4, 2026-08-20).
     *
     * ⛔ RÉSOLUS DEHORS, ET C'EST LA MÊME RAISON QUE `sources` ET `session`: la
     * jointure contenant → PRÉNOMS passe par `member_portions`, que cette carte
     * ne reçoit pas. Aller les chercher ici en ferait un SECOND lecteur du même
     * plan, et deux lecteurs finissent par se contredire.
     *
     * ⚠️ PLURIEL, ET C'EST TOUT L'OBJET DU LOT. Le jeudi soir d'un foyer où une
     * bouche a un objectif sort DEUX bacs: le sien, et celui des autres. Un
     * `BoxLine | null` ne pouvait pas les dire.
     *
     * `[]` = rien n'a été mis en boîte pour ce repas — le cas de tout plan
     * écrit avant le 2026-08-19, de toute lane individuelle, et de tout plat
     * cuisiné de zéro. La carte se tait alors: elle n'invente pas de couvercle.
     */
    boxes?: readonly BoxLine[];
    /**
     * ══════════════════════════════════════════════════════════════════════
     * QUI EST À TABLE, ET CE QUE CHACUN EN FAIT — DANS LA CARTE (2026-08-21).
     * ══════════════════════════════════════════════════════════════════════
     *
     * ── LE DÉFAUT, VU À L'ÉCRAN ──────────────────────────────────────────
     * Ces deux listes se rendaient SOUS la carte, dans `DayPersonSplit`,
     * rattachées à elle par la seule PROXIMITÉ — 4 px contre 12 px jusqu'à la
     * carte suivante. « C'est entre les deux, on comprend pas. »
     *
     * ⛔ ET AUCUN ÉCART NE POUVAIT MARCHER. La carte porte une BORDURE et un
     * fond: ce qui est dehors se lit comme n'appartenant à personne, quel que
     * soit le nombre de pixels. Un pied encadré collé dessous a été essayé
     * avant, et rejeté — un second bloc chromé À CÔTÉ d'une carte fait DEUX
     * objets là où il n'y en a qu'un. La seule position qui rattache est
     * DEDANS, et la carte range déjà trois blocs de cette famille.
     *
     * ⛔ RÉSOLUS DEHORS, comme `boxes` et `sources`, et pour la même raison: la
     * jointure passe par `member_portions`, que cette carte ne reçoit pas. Elle
     * reçoit une liste PRÊTE — jamais la règle qui l'a produite (voir
     * `DishAnnotation`: le prénom d'une part vaut `null` quand l'en-tête de la
     * voie l'a déjà écrit, et seul `DayPersonSplit` peut le savoir).
     *
     * ⛔ ET AUCUN POURQUOI, NI ICI NI AILLEURS SUR CETTE CARTE. Une part porte
     * un prénom et une instruction de SERVICE; ces types n'ont structurellement
     * aucun champ où un objectif, un corps ou une calorie pourrait entrer.
     *
     * `[]` est le défaut ET le cas majoritaire: `/app/today` ne les passe pas,
     * et un plan d'une seule bouche n'a rien à marquer.
     */
    eaters?: readonly { memberId: string; name: string }[];
    shares?: readonly { memberId: string; name: string | null; note: string }[];
    /**
     * LES SESSIONS DE CUISINE DONT CE PLAT TIRE SES LOTS — résolues par
     * l'appelant (`sessionsForDish`).
     *
     * `[]` est le défaut ET le cas le plus fréquent: un plat cuisiné de zéro
     * n'a pas de lot, donc pas de session, donc pas de bouton « Quelles
     * cuissons ? ». C'est aussi ce que reçoit tout appelant qui ne tient pas
     * les sessions (`/app/today`, qui rend la journée et non le planning) — la
     * carte ne va PAS les chercher elle-même: elle serait alors un second
     * lecteur du même plan, et deux lecteurs finissent par se contredire.
     */
    sessions?: readonly DishSessionView[];
    /**
     * FF-059 — L'ÉNERGIE DE CE PLAT, quand les quatre portes sont ouvertes.
     *
     * `null` est le défaut ET le cas le plus fréquent: un élève sous plancher
     * TCA, un mineur, un élève dont le coach ne compte pas, un élève qui a
     * éteint — pour tous ceux-là, la réponse du serveur ne contient AUCUN
     * chiffre, donc l'appelant n'a rien à passer. La carte ne teste aucun droit:
     * elle ne peut pas afficher ce qui n'existe pas dans son arbre de props.
     *
     * C'est ce qui répond à l'angle adversarial « une prop React qui fuit »:
     * la prop existe, la donnée non.
     */
    energy?: DishEnergyView | null;
    /** ⟳ 2026-09-04 — le kcal d'un contenant à UN nom, rendu par `BoxTable`. */
    boxEnergy?: (boxId: string) => BoxEnergyView | null;
    // ⛔ 2026-09-25 — `collapsible` (« Voir le détail » / « Masquer le
    // détail ») EST RETIRÉ, sur demande: « l'étape "Voir détail" sur les
    // cartes de repas n'est pas nécessaire ». La carte rend tout son détail;
    // sur l'aperçu, c'est la ligne compacte qui s'ouvre (`compact`).
    /**
     * ══════════════════════════════════════════════════════════════════════
     * ⟳ 2026-09-24 — UNE LIGNE PAR PLAT, SUR L'APERÇU.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Demandé: « que les titres des repas, avec les ingrédients, sans
     * grammages — le but est une lecture rapide du plan, parfois à huit
     * personnes ». Fermée, la carte ne rend que son titre (qui porte déjà les
     * ingrédients), son chiffre et « Remplacer ». Ouverte, elle redevient la
     * carte entière — geste du jour, contenants, ingrédients.
     *
     * ⚠️ FAUX PAR DÉFAUT: `/app/plan` et `/app/today` ne changent pas.
     * ⚠️ LE PLI CACHE, IL NE DÉMONTE PAS: le corps reste dans le DOM sous
     * `hidden`, qui le retire aussi de l'arbre d'accessibilité.
     */
    compact?: boolean;
    /** Voir `DishReplaceControl`. `null` = pas de remplacement ici (le défaut). */
    replace?: DishReplaceControl | null;
  },
) {
  // CE PLAT PUISE-T-IL DANS UNE PRÉPARATION ?
  //
  // La recette et les quantités du LOT vivent dans la session de cuisine, et
  // les répéter ici ferait racheter et recuire ce qui est déjà au frigo (défaut
  // mesuré: « 1,200 g de cuisses » sur quatre jours). Le modèle s'en charge —
  // un plat en lot ne porte plus que ce qu'on AJOUTE à l'assiette.
  //
  // ⚠️ CE DRAPEAU NE MASQUE PLUS RIEN DEPUIS LE 2026-08-14. Il choisit un
  // LIBELLÉ: « comment » pour une recette, « au moment de servir » pour le
  // geste du repas. Masquer `method` sur ces plats-là supprimait la seule
  // phrase qui leur restait à dire.
  const leftover = servedFrom !== null || sources.length > 0;
  // Une case a besoin d'un libellé qui lui appartient: le même plat est rendu
  // sur `/app/plan` et `/app/today`, et un `id` en dur ferait pointer deux
  // libellés vers la même case.
  const tickId = React.useId();
  /**
   * ⟳ 2026-09-21 — LE CHIFFRE SOUS LE TITRE N'EST QUE CELUI D'UNE SEULE
   * PERSONNE. `energy` (le serveur) divise la recette par le nombre de
   * membres du foyer, quel que soit le nombre de mangeurs : 109 kcal sous une
   * collation que seul Thomas mange (sa dose : 328), 893 sous un déjeuner à
   * trois où personne ne mange 893. Règle demandée sur l'écran réel : une
   * seule personne à table ⇒ son chiffre sous le titre ; plusieurs ⇒ aucun
   * chiffre global, chacun sa ligne (les doses ou les boîtes, gardées par
   * l'objectif côté serveur). Sans contenant, on garde `energy` — c'est le
   * cas du plan solo, où la division vaut 1 — sauf si les mangeurs nommés
   * sont plusieurs.
   */
  const soloLine = boxes.length === 1 && !boxes[0].shared ? boxes[0] : null;
  const titleEnergy: DishEnergyView | null = boxes.length === 0
    ? (eaters.length > 1 ? null : energy)
    : soloLine !== null && boxEnergy
    ? energyOfBox(boxEnergy(soloLine.id))
    : null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-22 — LA LISTE DU BAS EST LE TOTAL DE LA TABLE, PAS UNE PART.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT, LU À L'ÉCRAN ──────────────────────────────────────────
   * Sur un repas sans cuisson mangé par UNE personne, « Les doses par
   * personne » et la liste d'ingrédients du bas portaient les MÊMES nombres,
   * l'un sous l'autre: « yaourt grec 99 g » deux fois à trois centimètres
   * d'écart. Deux fois le même fait, c'est le lecteur qui cherche la
   * différence — et il n'y en a pas.
   *
   * ── CE QUI DÉCIDE ────────────────────────────────────────────────────
   * Le NOMBRE DE CONTENANTS, c'est-à-dire de doses affichées au-dessus:
   *   · UN → la dose EST le plat, et la liste du bas la répète. On la retire.
   *   · PLUSIEURS → les doses se partagent le plat (192 + 169 + 191 g de
   *     thon), et le total du bas est un AUTRE fait: ce qu'il faut préparer
   *     en tout. Il reste, et il se NOMME — sans titre, il se lirait comme
   *     une quatrième part.
   *
   * ⛔ RIEN NE CHANGE SUR UN PLAT EN BOÎTES (`uses` non vide). Là, la liste
   * du bas porte déjà son titre « en plus du lot » et dit autre chose que les
   * couvercles: ce qu'on AJOUTE le jour même. Elle n'a jamais été un doublon.
   * (⟳ 2026-09-25 — sur une boîte à un nom, elle monte dans le geste du jour:
   * voir `takeOut` juste en dessous.)
   */
  const doses = dish.uses.length === 0 && boxes.length > 0;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-25 — UN REPAS SORTI D'UNE BOÎTE: SORTIR LA BOÎTE, PUIS AJOUTER.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT, LU SUR LE PLAN DE mathilde (brouillon `8ad9dec6`) ──────
   * Samedi, le Boxing remplit la boîte « Lundi Déjeuner » avec le porc ET les
   * pâtes. Lundi, la carte disait « À assembler — Assembler froids le filet
   * de porc aux légumes et les pâtes. Ajouter l'huile d'olive et le parmesan
   * râpé », puis « Les boîtes à sortir » avec le couvercle, puis « À ajouter
   * au moment de servir » avec l'huile et le parmesan. Le plat et le féculent
   * étaient réunis deux fois, l'huile et le parmesan dits deux fois, et la
   * seule consigne utile — sortir CETTE boîte — était à part, en bas.
   *
   * ── CE QUI CHANGE ────────────────────────────────────────────────────
   * `boxedMeal`: le repas tire sur des casseroles ET porte une boîte. Le
   * libellé `assemble` y devient « À compléter » (des ajouts frais) ou « À
   * servir » (aucun): la boîte est déjà assemblée. Vrai pour une boîte comme
   * pour plusieurs.
   * `takeOut`: UNE boîte à UN nom, et un geste déclaré. Le geste du jour dit
   * alors, dans l'ordre, la boîte à sortir, la phrase du modèle, puis les
   * ajouts avec leurs quantités — et le bloc « Les boîtes à sortir » et la
   * liste du bas ne se rendent plus: ils diraient la même chose une seconde
   * fois. Le kcal de cette boîte est déjà sous le titre (`titleEnergy`).
   *
   * ⚠️ PLUSIEURS BOÎTES, OU UN BAC À PLUSIEURS NOMS: rien ne monte. Les
   * couvercles y portent les prénoms et « pour n », que le geste du jour ne
   * dirait pas.
   * ⚠️ `same_day: null` (plan d'avant le 2026-08-17): rien ne monte non plus,
   * faute de geste où monter.
   * ⚠️ `meal` vide (plat sans jour ni moment): pas de nom à citer, le
   * couvercle reste à sa place.
   */
  const boxedMeal = dish.uses.length > 0 && boxes.length > 0;
  // ⚠️ LA MÊME GARDE QUE LE RENDU DU GESTE (`{dish.same_day && …}`), par
  // vérité et pas `!== null`: un plat relu sans la clé rendrait sinon le
  // couvercle muet sans rien monter à sa place.
  const takeOut = dish.same_day && boxedMeal && soloLine !== null && soloLine.meal !== ""
    ? soloLine
    : null;
  // Ce que `SameDayLine` reçoit en plus du jeton et de la phrase. Un objet
  // étalé garde la ligne de rendu que `dishSession.int.test.ts` et
  // `dishSameDay.int.test.ts` lisent dans ce fichier. `sides` est posé plus
  // bas, une fois les lignes d'à-côtés calculées.
  const boxedHead = {
    boxed: boxedMeal,
    hasAdds: dish.ingredients.length > 0,
    takeOutMeal: takeOut?.meal ?? null,
    adds: takeOut !== null ? dish.ingredients : [],
  };
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS QU'AUCUN COUVERCLE DE CETTE CARTE NE PORTE.
   *
   * Ceux qu'une boîte porte se lisent sous elle (`BoxTable`). Restent ceux
   * que le moteur a rattachés au plat sans boîte qui nomme la personne — un
   * plat de la table sans contenant, un plat qui lui est attribué. Le prénom
   * vient des mangeurs que la carte reçoit déjà (`eaters`), jamais d'une
   * seconde lecture du plan.
   */
  const looseSides = looseSideLinesForDish(dish, eaters);
  /**
   * ⟳ 2026-09-25 — LES À-CÔTÉS MONTENT SOUS LE TITRE (retour du propriétaire:
   * « le à côté devrait presque être dans le titre, en deuxième ligne »).
   * Ceux des couvercles et ceux sans boîte, en une seule liste.
   *
   * LE PRÉNOM SE DIT DÈS QUE PLUS D'UNE BOUCHE MANGE CE REPAS: sous le titre,
   * aucun couvercle n'est plus là pour dire à qui est le fromage.
   */
  const sideRows = dishSideSummary(boxes, looseSides);
  const mouths = boxes.length > 0
    ? boxes.reduce((n, box) => n + box.eaterCount, 0)
    : eaters.length;
  const namedSides = mouths > 1 || sideRows.length > 1;
  /**
   * ⟳ 2026-09-25 — LES À-CÔTÉS PAR TYPE, AVEC LEUR QUANTITÉ, DANS LE GESTE DU
   * JOUR — sur l'aperçu seulement (retour du propriétaire: « l'à côté, on ne
   * l'a pas en termes de quantité »). Sur l'aperçu, la ligne du titre ne porte
   * que les noms (« clémentine, pain complet »); ouverte, la carte dit « Pour
   * accompagner : pain complet ~30 g », « En dessert : 2 × clémentine ».
   * Ailleurs, la ligne du titre porte déjà les quantités: les redire ici
   * ferait deux fois la même liste.
   */
  const headSides = compact
    ? sideRows.map((row) => ({
      memberId: row.memberId,
      name: namedSides ? row.name : null,
      kinds: row.kinds,
    }))
    : [];
  // ⟳ 2026-09-24 — LA LIGNE DE L'APERÇU (`compact`): fermée, le titre seul.
  const [rowOpen, setRowOpen] = React.useState(false);
  const rowId = React.useId();
  /**
   * ⟳ 2026-09-25 — TOUTE LA CARTE OUVRE LA LIGNE, « partout sauf Changer »
   * (retour du propriétaire: seul le titre répondait, et l'anneau de focus le
   * montrait). Le bouton du titre reste LE contrôle — clavier, lecteur d'écran,
   * `aria-expanded`; ce clic-ci n'est qu'un confort de souris, sur la surface.
   *
   * ⚠️ UN CONTRÔLE GARDE SON GESTE: un clic sur un bouton (celui du titre
   * compris, qui bascule déjà), un lien, un champ ou la bulle de « Changer »
   * ne passe pas par ici.
   * ⚠️ OUVERTE, SEULE LA TÊTE REFERME (titre et « À côté »): on lit le corps
   * et on y clique sans que la carte se replie sous la souris.
   * ⚠️ UN TEXTE SÉLECTIONNÉ N'EST PAS UN CLIC.
   */
  const onCardClick = compact
    ? (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "button, a, input, select, textarea, label, [role=dialog], [data-no-row-toggle]",
        )
      ) return;
      if (rowOpen && !target.closest("[data-row-head]")) return;
      if (window.getSelection()?.toString()) return;
      setRowOpen((v) => !v);
    }
    : undefined;
  const struck = replace?.struck ?? null;
  // ⟳ 2026-09-25 — L'ICÔNE DU PLAT, tirée de son aliment principal
  // (`main_food`). `null` sur un plan d'avant: la ligne reste celle d'avant.
  const foodIcon = foodIconOf(dish.main_food);
  const foodIconBadge = foodIcon === null ? null : (
    <span
      aria-hidden="true"
      data-dish-icon
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-2 text-base leading-none"
    >
      {foodIcon}
    </span>
  );

  return (
    <Card
      onClick={onCardClick}
      // ⟳ 2026-09-25 — SUR L'APERÇU, LA CARTE ENTIÈRE EST LA CIBLE: le survol,
      // le curseur et l'anneau de focus du bouton du titre sont portés par la
      // carte (fermée), pas par la seule ligne du titre.
      className={compact
        ? `group/row has-[[data-row-toggle]:focus-visible]:outline-2 has-[[data-row-toggle]:focus-visible]:outline-offset-2 has-[[data-row-toggle]:focus-visible]:outline-fig-600 ${
          rowOpen ? "" : "cursor-pointer transition-colors hover:bg-paper-2"
        }`
        : ""}
    >
      <div
        data-row-head={compact || undefined}
        className={`flex flex-wrap items-center gap-2 ${compact ? "cursor-pointer" : ""}`}
      >
        {compact
          ? (
            // LA LIGNE ENTIÈRE EST LE BOUTON — titre ET chiffre: c'est elle
            // qu'on vise pour ouvrir un plat.
            //
            // ⟳ 2026-09-24 (retour du propriétaire) — ON NE VOYAIT PAS QU'UNE
            // LIGNE S'OUVRE. Le « ▸ » de 12 px en encre secondaire ne se
            // lisait pas comme un geste. Il devient une pastille ronde bordée
            // — la forme d'un contrôle —, dont le chevron tourne quand la
            // ligne est ouverte; la ligne réagit au survol. Le titre passe en
            // `text-sm`: « les titres sont beaucoup trop gros » sur l'aperçu.
            <button
              type="button"
              aria-expanded={rowOpen}
              aria-controls={rowId}
              onClick={() => setRowOpen((v) => !v)}
              data-row-toggle
              className="-m-1 flex min-h-6 min-w-0 flex-1 items-center gap-2.5 rounded-part p-1 text-left"
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  rowOpen
                    ? "border-fig-700 bg-fig-50 text-fig-700"
                    : "border-line-strong text-ink-soft group-hover/row:border-ink group-hover/row:text-ink"
                }`}
              >
                <svg
                  viewBox="0 0 16 16"
                  className={`h-3.5 w-3.5 transition-transform ${rowOpen ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 3.5 10.5 8 6 12.5" />
                </svg>
              </span>
              {foodIconBadge}
              {/* LE CHIFFRE SUIT LE DERNIER MOT DU TITRE, dans le même fil:
                  en colonne à part, il prenait sa largeur au titre — quatre
                  lignes pour un plat à 375 px. */}
              <span
                className={`min-w-0 break-words text-sm font-medium ${
                  struck === null ? "text-ink" : "text-ink-soft line-through"
                }`}
              >
                {dish.title}
                {titleEnergy !== null && (
                  <span className="ml-2 whitespace-nowrap font-normal">
                    <DishEnergyLine energy={titleEnergy} />
                  </span>
                )}
              </span>
            </button>
          )
          : (
            <>
              {foodIconBadge}
              <span className="font-medium text-ink">{dish.title}</span>
            </>
          )}
        {slotBadge && dish.slot && (
          <Badge tone="neutral">{dishSlotLabel(dish.slot)}</Badge>
        )}
        {/* FF-059 — LE CHIFFRE, à côté du plat et pas au-dessus. C'est un fait
            SUR CE PLAT, du même rang que son créneau: le mettre en tête de
            carte en ferait le sujet, et le sujet reste le dîner. Sur la ligne
            compacte, il est DANS le bouton, juste au-dessus. */}
        {!compact && <DishEnergyLine energy={titleEnergy} />}
        {tick && (
          <span className="ml-auto flex items-center gap-2">
            {/* Une case est un CONTRÔLE: sa bordure doit tenir le seuil 3:1 de
                WCAG 1.4.11, donc `line-strong` (3,84:1) et jamais `line`
                (1,30:1). L'anneau de focus est celui de la charte, `fig-600`
                (7,36:1) — la marque marque bien l'action, et le focus en est une.
                `rounded-part` = 4px, la petite pièce du vocabulaire de rayon. */}
            <input
              id={tickId}
              type="checkbox"
              className="h-4 w-4 rounded-part border-line-strong text-ink focus:ring-fig-600 disabled:opacity-50"
              checked={tick.missed}
              disabled={tick.busy}
              onChange={tick.onToggle}
            />
            <label
              htmlFor={tickId}
              className={`text-sm ${tick.missed ? "text-ink" : "text-ink-soft"}`}
            >
              {mealCopy("meals.tick.label")}
            </label>
          </span>
        )}
        {/* ⟳ 2026-09-24 — CHANGER, OU GARDER CE QU'ON A BARRÉ. `min-h-6` =
            24 px de cible.
            ⟳ même jour, retour du propriétaire — PAS DE ROUGE: « un gris de la
            palette ira très bien ». Les gris du bouton secondaire (`Button`):
            bord `line-strong` (3,84:1, seuil d'un contrôle), texte `ink-soft`
            (6,11:1), survol `fig-50`. */}
        {/* ⟳ même jour — LA BULLE SORT DU BOUTON: le bouton et sa bulle
            (`replace.panel`) partagent un conteneur `relative`, qui est aussi
            la frontière du « clic ailleurs » (`AnchoredPanel`). Le conteneur
            prend TOUTE la hauteur de la ligne (`self-stretch`), bouton centré:
            la bulle s'ouvre sous la ligne, jamais sur un titre de trois lignes. */}
        {replace && (
          // `data-no-row-toggle`: la marge autour de « Changer » n'ouvre pas la
          // carte non plus — « partout sauf Changer ».
          <span
            data-no-row-toggle
            className="relative ml-auto flex shrink-0 cursor-auto items-center self-stretch"
          >
            {struck === null
              ? (
                <button
                  type="button"
                  onClick={replace.onReplace}
                  disabled={!replace.canReplace}
                  aria-haspopup="dialog"
                  aria-expanded={replace.panel != null}
                  className={`min-h-6 rounded-part border px-2 py-0.5 text-xs font-medium hover:bg-fig-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${
                    replace.panel != null ? "border-ink bg-fig-50 text-ink" : "border-line-strong text-ink-soft"
                  }`}
                >
                  {mealCopy("meals.dish.replace")}
                </button>
              )
              : (
                <button
                  type="button"
                  onClick={replace.onKeep}
                  className="min-h-6 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
                >
                  {mealCopy("meals.dish.keep")}
                </button>
              )}
            {replace.panel}
          </span>
        )}
      </div>
      {/* ══════════════════════════════════════════════════════════════════
          ⟳ 2026-09-25 · « À CÔTÉ », LA DEUXIÈME LIGNE DU TITRE.
          ══════════════════════════════════════════════════════════════════
          Hors du pli ET hors de la ligne compacte de l'aperçu: ce qu'on mange
          avec le plat se lit en balayant la semaine, pas en ouvrant chaque
          carte (« il faudrait que l'à côté ressorte »). Le libellé est en
          encre pleine, les aliments en gris: c'est lui qu'on repère.

          ⚠️ SUR L'APERÇU (`compact`), LES ALIMENTS SEULS, SANS GRAMMES — la
          règle de la ligne compacte (« les titres, sans grammages »). Ailleurs
          les grammes restent (« comté ~30 g »): le tilde dit que c'est un
          repère, pas une pesée. Décalé sous le titre, après la pastille.
          ⛔ AUCUNE PROVENANCE: rien ne dit si l'aliment vient du modèle ou de
          la liste de secours. */}
      {sideRows.length > 0 && (
        <div
          data-dish-sides
          data-row-head={compact || undefined}
          // Décalé sous le titre: pastille (24 px) + écart (10 px), et l'icône
          // (28 px + 10 px) quand le plat en a une.
          className={`mt-1 flex flex-col gap-0.5 ${
            compact ? `cursor-pointer ${foodIconBadge === null ? "pl-[34px]" : "pl-[72px]"}` : ""
          }`}
        >
          {sideRows.map((row) => (
            <p
              key={row.memberId}
              data-side-member-id={row.memberId}
              className="break-words text-sm text-ink-soft"
            >
              <span className="font-medium text-ink">
                {namedSides && row.name !== null
                  ? mealCopy("meals.dish.sides_for", { name: row.name })
                  : mealCopy("meals.dish.sides")}
              </span>{" "}
              {compact ? row.terms : row.items}
            </p>
          ))}
        </div>
      )}
      {/* LA RAISON, SOUS LE TITRE BARRÉ — les mots de la personne, tels quels:
          c'est ce qui partira avec le plat quand elle cliquera « Ajuster le
          plan ». `break-words`: une phrase libre n'a aucune longueur garantie. */}
      {struck !== null && (
        <p className="mt-1 break-words text-sm text-ink-soft">
          {mealCopy("meals.dish.replace_reason", { reason: struck.reason })}
        </p>
      )}
      {/* ⚠️ L'ENVELOPPE DE LA LIGNE EST TOUJOURS LÀ, même hors aperçu: un `div`
          nu, `hidden` seulement quand la ligne compacte est fermée. Deux
          branches JSX dédoubleraient le corps de la carte. */}
      <div id={rowId} hidden={compact && !rowOpen}>
      {/* ── FF-057 §3.A · LE FORMULAIRE ACCIDENT, SOUS LA CASE QU'ON VIENT DE
          DÉCOCHER ────────────────────────────────────────────────────────────
          Il est INLINE et pas en fenêtre: la question porte sur CE plat-là, et
          une modale l'aurait détaché de la carte qui la motive. Il n'apparaît
          que sur le plat dont la décoche vient d'être écrite — jamais sur les
          vingt-cinq autres cartes de `/app/plan`. */}
      {tick?.untickPrompt && <UntickForm prompt={tick.untickPrompt} />}
      {/* ── LOT 2 · CE QU'IL Y A À FAIRE AUJOURD'HUI, EN TÊTE DE CARTE ──────
          C'est la première chose qu'on lit sous le titre, et c'est délibéré:
          devant une assiette, la question n'est pas « pourquoi ce plat » ni
          « quels ingrédients », c'est « qu'est-ce que je fais, là, maintenant ».
          Le geste était dispersé — de la prose dans `method`, une provenance
          dans `sources`, et AUCUNE durée nulle part au niveau du plat.

          ⚠️ LE LIBELLÉ VIENT DU JETON, JAMAIS DU TEXTE. `same_day.kind` est
          validé contre une liste fermée par le moteur ET par le lecteur; lire
          `method` pour deviner « réchauffage » se tromperait sur « do not
          reheat » et sur tout plan rendu en français.

          ⚠️ RIEN QUAND LE MOTEUR N'A RIEN DÉCLARÉ. `same_day: null` n'est pas
          « rien à préparer » — `none` dit ça. Afficher un bandeau par défaut
          écrirait un fait que personne n'a écrit, et ce dépôt a déjà tranché ce
          cas exact contre la coche automatique. Le compteur `same_day` de
          `generated_from` est ce qui mesure ce silence, pas l'écran.

          ⛔ LA SEULE DURÉE AUTORISÉE SUR CETTE CARTE. `same_day.minutes` est le
          temps du GESTE DU JOUR. `active_minutes`/`total_minutes` restent
          interdits ici — ce sont des temps de CUISSON et de SESSION, ils ont
          leur surface, et les remonter donnerait à un assemblage le temps d'un
          rôti. La ceinture est dans `lib/dishSession.int.test.ts`.

          ⟳ 2026-09-25 — SUR UN REPAS SORTI D'UNE BOÎTE, le libellé et le
          contenu suivent `boxedMeal` / `takeOut` (voir leur définition). */}
      {dish.same_day && <SameDayLine sameDay={dish.same_day} method={dish.method} {...boxedHead} sides={headSides} />}
      {/* ══════════════════════════════════════════════════════════════════
          LA PART CONGELÉE SE SORT LA VEILLE — 2026-09-01.
          ══════════════════════════════════════════════════════════════════

          ⛔ SANS CETTE LIGNE, LE LOT `uses[].kept` SERAIT PIRE QUE LE DÉFAUT
          QU'IL RÉPARE. La fenêtre du cuit s'ouvre désormais à sept jours pour
          une part déclarée congelée: le plat n'est plus JETÉ, il est SERVI. Un
          plan qui sert un plat du samedi sans jamais dire qu'il faut le sortir
          du congélateur le vendredi soir est exécutable sur le papier et pas
          dans la cuisine — et un plat qu'on découvre en bloc à 19 h est un
          repas manqué, c'est-à-dire exactement le trou qu'on venait de fermer.

          ⛔ DÉTERMINISTE, JAMAIS UNE PROSE DE MODÈLE. La consigne demande bien
          au modèle de le dire dans `method`, mais c'est précisément ce que ce
          lot vient de constater comme non fiable: la prose ne se vérifie pas.
          Le jeton, lui, est la CAUSE de l'ouverture de fenêtre — l'afficher,
          c'est afficher la décision elle-même.

          ⛔ ET PAS DERRIÈRE LE DÉPLIANT DE SESSION. C'est un geste de LA
          VEILLE: le mettre sous un bouton « voir la session » le rendrait
          lisible le jour où il est déjà trop tard.

          ⚠️ LA GARDE `session.day !== dish.day`: une part cuisinée ET mangée le
          même jour n'a rien à décongeler, même si le modèle a écrit le jeton.
          On se tait plutôt que d'écrire une consigne fausse — la discipline de
          `same_day: null` juste au-dessus.

          ⚠️ MUET SUR TOUT PLAN D'AVANT LE LOT: le lecteur y met `"fridge"`,
          jamais `undefined`, donc rien ne s'affiche et rien ne change.

          ⟳ 2026-09-25 — `sessions` est une liste: la garde lit la session du
          lot CONGELÉ, plus celle du premier lot cité. */}
      {sessions.some((s) =>
        s.day !== dish.day &&
        s.dishPreparations.some((p) =>
          dish.uses.some((u) => u.kept === "freezer" && u.preparation_id === p.id)
        )
      ) && (
        <p className="mt-2 text-sm leading-6 text-ink">
          {mealCopy("meals.result.thaw_the_night_before")}
        </p>
      )}
      {/* ── LE GESTE À FAIRE DEVANT CE PLAT-LÀ (2026-08-14) ─────────────────
          `method` était masqué sur EXACTEMENT les plats qui en ont le plus
          besoin. Un plat cuisiné de zéro montrait sa recette; celui qui a
          besoin qu'on dise « réchauffe 10 min, tranche le poulet, ajoute la
          salade » ne montrait rien — ni ici, ni dans les sessions de cuisine
          (qui portent les GROSSES cuissons, pas le geste du repas). Le geste du
          soir n'apparaissait donc nulle part dans le produit.

          Le masquage avait sa raison, et elle tient toujours: ce qu'on ne veut
          pas revoir, c'est la RECETTE DU LOT recopiée sous chaque jour, avec
          ses quantités entières (« 1 200 g de cuisses » sur quatre jours). Le
          prompt de composition demande déjà autre chose au modèle — « a dish
          that draws on a preparation does NOT repeat its recipe. Its method is
          what you do at that meal » — et c'est ce qu'il écrit vraiment: 476
          plats en lot mesurés en base le 2026-08-14, 0 méthode vide, 111
          caractères de moyenne, 247 au pire. Un geste, pas un pavé.

          ⚠️ DEUX MOTS, PAS UN. Le libellé change avec le cas
          (`meals.result.assemble` vs `meals.result.method`): sous « Comment »,
          un assemblage se lirait comme la recette qu'on vient justement de ne
          pas répéter.
          ⚠️ AUCUNE DURÉE N'EST AJOUTÉE. Si le modèle ne dit pas combien de
          temps, l'écran ne l'estime pas: `active_minutes` vit sur les
          PRÉPARATIONS, et le reprendre ici donnerait à un assemblage le temps
          d'une cuisson.
          ⚠️ RIEN NE S'AFFICHE SANS TEXTE. Pas de libellé au-dessus du vide.

          ── LOT 2 (2026-08-17) · CE BLOC EST LE CHEMIN DE REPLI, PLUS LE CHEMIN
          NORMAL ────────────────────────────────────────────────────────────
          Quand le plat porte son `same_day`, sa méthode est REMONTÉE dans le
          bandeau du jour J, en tête de carte — c'est là qu'on la cherche, et
          P2 demande le TEXTE (« reprends le poulet de vendredi »), pas
          seulement l'étiquette. Elle ne s'affiche donc PAS ici en plus: relire
          la même phrase deux fois sur une même carte est exactement le bruit
          que le paragraphe du 14/08 ci-dessus refuse.

          ⚠️ MAIS CE BLOC RESTE, ET IL N'EST PAS MORT. `same_day` est `null` sur
          TOUT plan écrit avant le 2026-08-17 — mesuré: 157 plans en base, dont
          5 encore vivants. Les faire basculer sur un bandeau qui n'existe pas
          leur retirerait la seule phrase qui leur dit quoi faire. Le silence du
          bandeau ne doit pas se payer en lisibilité sur les plans anciens.

          ⟳ 2026-09-22 — IL EST REMONTÉ ICI, à la place exacte qu'occupe le
          bandeau du jour J dans l'autre cas. Les deux disent LA MÊME CHOSE —
          ce qu'on fait devant ce plat-là —, et le pli doit les traiter pareil:
          laissé tout en bas, il serait passé SOUS le pli, et un plan d'avant le
          LOT 2 se serait replié sur un titre nu. */}
      {!dish.same_day && dish.method && (
        <p className="mt-3 text-sm text-ink break-words">
          <span className="font-medium text-ink">
            {mealCopy(leftover ? "meals.result.assemble" : "meals.result.method")}:
          </span>{" "}
          {dish.method}
        </p>
      )}
      {/* ══════════════════════════════════════════════════════════════════
          ⛔ `dish.why` N'EST PLUS AFFICHÉ — ET IL EST TOUJOURS DEMANDÉ.
          ══════════════════════════════════════════════════════════════════

          ── CE QU'ON LISAIT ─────────────────────────────────────────────
          Une phrase sous CHAQUE plat, et toujours la même matière: « Le même
          batch devient un wrap, ce qui évite de répéter exactement le plat »,
          « La collation garde la même heure avec une autre combinaison de
          produits simples », « Un dîner déjà portionné rend le soir de cuisine
          immédiatement praticable ». Jugé le 2026-08-19: « à chaque plat il y
          a un truc comme ça qui sert à rien ».

          ⚠️ ET LE CHAMP RESTE DANS LE SCHÉMA, PAR DÉCISION EXPLICITE. « Le why
          aide peut-être le modèle donc garde-le mais l'affiche pas. » Demander
          une justification par plat force le modèle à tenir la contrainte
          pendant qu'il compose; la retirer du prompt changerait ce qu'il
          écrit, pas seulement ce qu'on lit. Le retrait est donc à L'ÉCRAN, et
          nulle part ailleurs.

          ⚠️ CE CHAMP N'A PLUS AUCUN LECTEUR. C'était le seul. S'il en
          réapparaît un, c'est cette décision-là qu'il renverse. */}

      {/* ⛔ 2026-09-25 — « DEPUIS … — CUISINÉ VENDREDI. » N'EST PLUS RENDU
          (« ça on s'en fout »). Le jour de cuisson et les lots de ce plat se
          lisent dans la bulle « Quelles cuissons ? ». `sources` reste une
          prop: il décide encore `leftover` et la phrase de repli `from_batch`. */}
      {/* ══════════════════════════════════════════════════════════════════
          LES CONTENANTS À SORTIR — LEURS NOMS, ET AUCUN CHIFFRE.
          ══════════════════════════════════════════════════════════════════
          Ils se posent SOUS la provenance, parce qu'ils la précisent: on dit
          d'abord d'où vient le lot, puis ce qu'on sort du frigo.

          ⚠️ N CONTENANTS, UN PAR GROUPE (v4, 2026-08-20). « Casimir + Odalric
          + Wilfrid — jeudi soir — … » et « Peregrine — jeudi soir — … » sont
          deux bacs différents, et c'est la carte qui dit lequel est à qui.

          ⛔ ET PLUS AUCUN GRAMME ICI — arbitrage du 2026-08-20. Le contenant
          EST la portion: on l'ouvre et on mange. Réafficher un chiffre au
          moment du repas ferait ressortir la balance à table, c'est-à-dire
          exactement ce que le protocole des boîtes existe pour supprimer. Le
          détail des grammes vit dans le Boxing de la session de cuisine, là où
          le geste se fait. C'est aussi ce qui a fait disparaître
          `meals.boxes.covers_dish`: elle désambiguïsait un nombre qui n'est
          plus là.

          ⛔ AUCUN POURQUOI NON PLUS. `BoxLine` ne porte qu'un couvercle et des
          prénoms — la carte n'a structurellement aucun champ où un objectif
          pourrait entrer. `member_portions` est lisible par tout le foyer, et
          une raison y divulguerait l'objectif d'un membre à ses colocataires. */}
      {/* ⟳ 2026-09-21 — PAS DE BOÎTE À SORTIR POUR UN PLAT SANS CUISSON. Un
          plat qui ne tire sur aucune préparation (`uses` vide) n'est dans
          aucune session de cuisine : ses contenants sont des DOSES par
          personne, et c'est ce que la carte montre — grammes par ingrédient,
          kcal pour qui a un objectif. Un plat qui tire sur une casserole
          garde ses boîtes.
          ⟳ 2026-09-25 — SAUF quand le geste du jour a déjà dit laquelle
          sortir (`takeOut`): le bloc ne ferait que la redire. */}
      {takeOut === null && (
        <BoxTable
          lines={boxes}
          context={dish.uses.length === 0 ? "doses" : "dish"}
          // Une seule personne : son chiffre est déjà sous le titre, la ligne
          // ne le répète pas.
          boxEnergy={soloLine === null ? boxEnergy : undefined}
        />
      )}
      {/* ══════════════════════════════════════════════════════════════════
          QUI MANGE ÇA — quand aucun couvercle ne l'a déjà dit.
          ══════════════════════════════════════════════════════════════════
          C'est le point ④ du contrat de la carte (`docs/keel/BOITES-PAR-REPAS.md`,
          « qui mange quoi »), et il a DEUX rédactions selon ce que le plan a
          produit: la ligne des contenants juste au-dessus quand le repas est
          mis en boîte, ces lignes-ci quand il ne l'est pas.

          ⛔ JAMAIS LES DEUX, ET C'EST LA GARDE. Un couvercle NOMME déjà ses
          mangeurs (« iku — vendredi déjeuner — … »); répéter les mêmes prénoms
          trois lignes plus bas serait la répétition qu'on vient de retirer, et
          une phrase qui les décrirait autrement CONTREDIRAIT le couvercle —
          c'est ce qui a été mesuré le 2026-08-20 (« la boîte partagée avec
          iku » sous un couvercle à un seul nom). Le nombre de noms sur le
          couvercle est le seul marqueur de v4, et rien d'autre n'a le droit de
          répondre à la même question.

          ⚠️ LA MOITIÉ AMONT EXISTE DÉJÀ (`planDaySlots`, qui vide `shares` dès
          que le plat porte des contenants) et celle-ci ne la double pas: elle
          couvre les MARQUEURS, que l'amont laisse passer. Deux moitiés d'une
          même règle à deux étages finiraient par diverger — celle-ci est la
          dernière, celle qui rend, et c'est elle qui décide.

          ⛔ PAS DE SECONDE FRONTIÈRE: le même bloc encastré que ses trois
          voisins (charte §2 — la frontière est portée par le filet et l'espace).
          La carte porte la seule bordure de ce jour. */}
      {boxes.length === 0 && (eaters.length > 0 || shares.length > 0) && (
        <div className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2">
          <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
            {mealCopy("meals.dish.who_eats")}
          </p>
          {eaters.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {eaters.map((eater) => (
                <li
                  key={eater.memberId}
                  // MÊME JOINTURE AUDITABLE DANS LE DOM que les contenants: par
                  // identifiant, jamais par prénom rendu.
                  data-eater-member-id={eater.memberId}
                  // Une pastille NEUTRE, sans couleur d'état: qui mange n'est ni
                  // un verdict ni une alerte. `break-words` — un prénom n'a
                  // aucune longueur garantie, et la contrainte est 320 px.
                  className="break-words rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-ink-soft"
                >
                  {eater.name}
                </li>
              ))}
            </ul>
          )}
          {shares.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {shares.map((share) => (
                <li
                  key={share.memberId}
                  data-share-member-id={share.memberId}
                  className="break-words text-xs leading-5 text-ink-soft"
                >
                  {/* Le prénom, puis l'instruction. Deux fragments et pas un
                      gabarit: il n'y a aucune grammaire ici.
                      ⚠️ `null` = l'en-tête de la voie l'a déjà écrit. La ligne
                      garde son `data-share-member-id`: la jointure reste
                      auditable même quand le prénom ne se lit plus. */}
                  {share.name !== null && (
                    <>
                      <span className="font-medium text-ink">{share.name}</span>
                      {" — "}
                    </>
                  )}
                  {share.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {sources.length === 0 && servedFrom !== null && (
        <p className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2 text-sm text-ink">
          {mealCopy("meals.result.from_batch").replace(
            "{day}",
            dishDayLabel(servedFrom) ?? servedFrom,
          )}
        </p>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ⟳ 2026-09-22 · LA LISTE EST UN BLOC, COMME SES VOISINES.
          ══════════════════════════════════════════════════════════════════
          Elle sortait NUE, à plat sur la carte, avec sa quantité collée au
          terme (« flocons d'avoine 44 g »). Juste au-dessus, les doses sont un
          encart à filet dont les nombres s'alignent à droite: les deux listes
          disent la même matière et ne se ressemblaient pas, et c'est la nue qui
          se lisait comme une note en marge.

          ⚠️ MÊME BLOC QUE `sources`, `qui mange ça` ET LE DÉPLIANT DE SESSION:
          `paper-2` + `line`, l'idiome de la charte pour « information rattachée
          à ce plat ». Une quatrième forme sur la même carte serait une quatrième
          grammaire à apprendre.

          ⚠️ LE NOMBRE EN BOUT DE LIGNE, `tabular-nums`, poussé par
          `justify-between` — la règle de `BoxTable`, mot pour mot: des nombres
          qui s'alignent se comparent d'un coup d'œil. `min-w-0` sur le terme est
          OBLIGATOIRE (enfant de flex, largeur minimale `auto` par défaut): sans
          lui, un nom composé long pousse la quantité hors de la carte à 320 px.

          ⟳ 2026-09-25 — ABSENTE quand elle est montée dans le geste du jour
          (`takeOut`): la même liste deux fois sur une carte. */}
      {dish.ingredients.length > 0 && !(doses && boxes.length === 1) && takeOut === null && (
        <div className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2">
          {/* ══════════════════════════════════════════════════════════════
              CES INGRÉDIENTS S'AJOUTENT AU LOT — ILS NE LE REDISENT PAS.
              ══════════════════════════════════════════════════════════════

              ── LE DÉFAUT (2026-08-20) ─────────────────────────────────────
              La liste sortait nue, juste sous le titre du plat. Un plat qui
              prélève sur une casserole n'y met QUE ses ajouts du jour — la
              feta, le citron, le pain — et cette liste-là, sans un mot,
              se lit comme la recette entière: on croit qu'il manque le poulet.

              ⛔ LE TITRE NE S'AFFICHE QUE SI LE PLAT PUISE DANS UN LOT
              (`uses.length > 0`). Un plat cuisiné de zéro le jour même n'a
              aucun lot, ses ingrédients SONT la recette complète, et écrire
              « en plus du lot » au-dessus affirmerait un lot qui n'existe pas.
              C'est la même discipline que `same_day: null` — on se tait plutôt
              que d'écrire un fait que personne n'a écrit. */}
          {dish.uses.length > 0 && (
            <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
              {mealCopy("meals.result.extra_ingredients")}
            </p>
          )}
          {/* ⟳ 2026-09-22 — ET LE TITRE DE L'AUTRE CAS: plusieurs doses
              au-dessus, donc ces nombres-ci sont leur SOMME. Sans ce titre, la
              liste se lit comme une part de plus, et « thon 552 g » sous trois
              parts de 192, 169 et 191 g devient incompréhensible. */}
          {doses && boxes.length > 1 && (
            <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
              {mealCopy("meals.result.total_quantities")}
            </p>
          )}
          <IngredientRows ingredients={dish.ingredients} />
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════════════
          ⟳ 2026-09-25 — « QUELLES CUISSONS ? », EN BAS À DROITE DE LA CARTE.
          ══════════════════════════════════════════════════════════════════
          Il remplace le dépliant « La session de cuisine » qui fermait la
          carte, et il a gardé sa place quand « Voir le détail » est parti (sur
          demande: l'étape n'était pas nécessaire). Il ouvre une bulle alignée
          sur le bord droit — posée à gauche, ses 20 rem déborderaient de
          l'écran à 375 px. */}
      {sessions.length > 0 && (
        <div className="mt-3 flex justify-end">
          <CookingsButton sessions={sessions} />
        </div>
      )}
      </div>
    </Card>
  );
}

/**
 * FF-057 §3.A — LE FORMULAIRE ACCIDENT: TROIS BOUTONS, ET PAS UN QUATRIÈME.
 *
 * ── CE QU'IL EST, ET CE QU'IL N'EST PAS ────────────────────────────────────
 * Il ne DEMANDE rien: la décoche est déjà écrite quand il s'affiche, il ne fait
 * que proposer de la préciser. C'est pour ça qu'il n'a ni titre interrogatif ni
 * bouton « Valider » — trois tuiles, une sortie, et le geste est fini.
 *
 * ⛔ AUCUN CHAMP LIBRE (fiche §9): « une fois ouvert, il devient obligatoire
 * dans la tête des gens, et le coût du geste remonte ». Un quatrième cas se
 * traite par « j'ai mangé autre chose », jamais par une branche neuve.
 *
 * ⛔ AUCUN JUGEMENT. Les trois libellés disent ce qui s'est passé, jamais ce
 * qu'il aurait fallu faire. Le verrou de doctrine interdit déjà « cheat meal »
 * et ses voisins, et rien ici ne s'en approche.
 *
 * ⚠️ LE COMPOSANT EST À CÔTÉ DE `DishCard`, PAS DANS LES DEUX PAGES. La carte
 * est le seul rendu partagé de `/app/plan` et `/app/today`; y poser le
 * formulaire les sert tous les deux d'un coup, avec la liaison unique de
 * `lib/useMealTicks.ts` derrière. Deux câblages parallèles auraient donné la
 * divergence que ce fichier-là existe pour empêcher.
 */
/**
 * A8.1 — EXPORTÉ, parce qu'une SECONDE surface porte désormais des cases: la
 * part d'un profil réclamé (`plan/DishListByDay`, monté par `MyShareCard`).
 *
 * ⚠️ EXPORTÉ PLUTÔT QUE RECOPIÉ, ET C'EST LA MÊME RÈGLE QUE `useMealTicks`.
 * Le formulaire de FF-057 est une liste FERMÉE de motifs, alignée sur le
 * serveur et sur la CHECK de la table (`mealTicks.int.test.ts`). Une seconde
 * copie divergerait au premier motif ajouté, et la divergence s'écrirait en
 * base avant que quiconque la voie.
 */
export function UntickForm({ prompt }: { prompt: UntickPrompt }) {
  return (
    <div
      // Même bloc que `sources` et le dépliant de session: c'est la famille
      // « information rattachée à ce plat ». `line` garantit l'arête même là où
      // le remplissage `paper-2` (1,08:1) ne se voit pas.
      className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2"
    >
      <p className="text-sm text-ink break-words">{mealCopy("meals.untick.lead")}</p>
      {/* `flex-wrap` et pas une grille à trois colonnes: à 320 px, trois
          libellés de cette longueur côte à côte se cassent en escalier. Ils
          s'empilent, ce qui est la bonne réponse sur un téléphone. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {MEAL_UNTICK_FORM_REASONS.map((reason) => (
          <Button
            key={reason}
            variant="secondary"
            size="sm"
            disabled={prompt.busy}
            onClick={() => prompt.onPick(reason)}
          >
            {mealCopy(`meals.untick.${reason}`)}
          </Button>
        ))}
        {/* IGNORER EST UNE FIN NORMALE, et elle est offerte au même endroit que
            les trois autres. `ghost` parce que c'est le geste qu'on peut
            ignorer: si les quatre portaient la même force, aucun ne guiderait.
            Il n'écrit RIEN — la décoche nue reste. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={prompt.busy}
          onClick={prompt.onDismiss}
        >
          {mealCopy("meals.untick.dismiss")}
        </Button>
      </div>
    </div>
  );
}

/**
 * LOT 2 — LE COMMENTAIRE DE PRÉPARATION DU JOUR J, EN TÊTE DE CARTE.
 *
 * Un bloc à filet vertical, pas une carte: il se lit d'un coup d'œil au-dessus
 * de tout le reste, et un encadré de plus sur une carte déjà dense ferait
 * ressembler le planning à un formulaire. Le trait marque l'appartenance au
 * plat sans emprunter de couleur d'état — « aujourd'hui » se dit par la forme,
 * la règle vaut pour tout ce qui est temporel ici.
 *
 * ⚠️ DEUX CLÉS ET PAS UNE PHRASE ASSEMBLÉE. Le libellé du geste et la durée
 * sont deux textes séparés, joints par le pack: en français « À réchauffer —
 * 8 min », en anglais « Just reheat — 8 min ». Bâtir la phrase en code
 * imposerait l'ordre anglais à toutes les langues.
 *
 * ── LE TEXTE, ET PAS SEULEMENT L'ÉTIQUETTE (2026-08-17) ───────────────────
 * P2 demande « avant chaque plat, un commentaire de préparation » — et le
 * commentaire est ce qui DIT QUOI FAIRE: « reprends le poulet de vendredi »,
 * « réchauffe une portion et presse un citron ». Le jeton seul n'en est que la
 * moitié: « À assembler — 10 min » en tête pendant que le comment reste sous
 * les ingrédients oblige le lecteur à redescendre chercher son geste, devant
 * une casserole. Les deux moitiés se lisent donc ensemble, ici.
 *
 * ⛔ ET UNE SEULE FOIS. `method` ne se rend plus sous les ingrédients quand il
 * est monté ici (`{!dish.same_day && dish.method && …}`): la même phrase deux
 * fois sur une carte est du bruit, pas de l'insistance.
 *
 * ⚠️ LE LIBELLÉ DU JETON REMPLACE LE COUPLE « Comment » / « Au moment de
 * servir », il ne s'y ajoute pas. Ce couple était un SUBSTITUT: faute de savoir
 * ce que le plat demandait, la carte devinait d'après `leftover` (le plat
 * puise-t-il dans un lot ?) pour ne pas titrer « Comment » au-dessus d'un
 * simple assemblage. `same_day.kind` est cette réponse, DÉCLARÉE au lieu d'être
 * déduite, et plus fine — elle distingue le réchauffage de l'assemblage, ce que
 * `leftover` ne pouvait pas faire. Empiler les deux donnerait « À réchauffer —
 * 8 min » puis « Au moment de servir : », deux en-têtes pour une phrase. Le
 * couple reste vivant sur le chemin de repli, pour les plans sans `same_day`.
 *
 * ⟳ 2026-09-25 — SUR UN REPAS SORTI D'UNE BOÎTE (`boxed`), `assemble` se lit
 * « À compléter » ou « À servir »: la session a déjà réuni le plat et le
 * féculent. Quand la carte le décide (`takeOutMeal` non nul), le bloc dit
 * aussi quelle boîte sortir et, après la phrase du modèle, ce qu'on y ajoute.
 * Le jeton reste la seule source du libellé; la boîte et les ajouts sont des
 * faits du plan, pas une lecture de `method`.
 */
function SameDayLine(
  {
    sameDay,
    method,
    boxed,
    hasAdds,
    takeOutMeal,
    adds,
    sides,
  }: {
    sameDay: DishSameDay;
    // `method` est `string` et jamais `null` (`readDishes` rend `String(… ?? "")`);
    // la chaîne VIDE est le cas à traiter, et c'est `{method && …}` qui le fait.
    method: string;
    /** Le repas tire sur des casseroles ET porte au moins une boîte. */
    boxed: boolean;
    /** Le plat porte des ajouts frais (`ingredients` non vide). */
    hasAdds: boolean;
    /** « Lundi Déjeuner » — les mots du couvercle. `null` = ne rien dire de la boîte. */
    takeOutMeal: string | null;
    /** Les ajouts à rendre ici. `[]` = ils restent dans la liste du bas. */
    adds: readonly DishIngredient[];
    /**
     * ⟳ 2026-09-25 — les à-côtés par type, avec leur quantité (`headSides`).
     * `[]` = rien à dire ici: hors aperçu, la ligne du titre les chiffre déjà.
     */
    sides: readonly {
      memberId: string;
      name: string | null;
      kinds: readonly { kind: DishSideCourseKind; items: string }[];
    }[];
  },
) {
  const kind = boxed && sameDay.kind === "assemble"
    ? (hasAdds ? "complete" : "serve")
    : sameDay.kind;
  const label = mealCopy(`meals.same_day.${kind}`);
  return (
    <div className="mt-2 border-l-2 border-line-strong pl-3">
      <p className="text-sm font-medium text-ink break-words">
        {label}
        {sameDay.minutes !== null && (
          <span className="font-normal text-ink-soft">
            {" — "}
            {mealCopy("meals.same_day.minutes").replace("{n}", String(sameDay.minutes))}
          </span>
        )}
      </p>
      {takeOutMeal !== null && (
        <p data-take-out-box className="mt-1 text-sm text-ink break-words">
          {mealCopy("meals.same_day.take_box", { box: takeOutMeal })}
        </p>
      )}
      {/* ⚠️ RIEN AU-DESSUS DU VIDE, la règle du 14/08 tient toujours: une
          méthode absente ne laisse pas un paragraphe vide sous le libellé.
          `break-words` est OBLIGATOIRE — c'est un paragraphe entier venu du
          modèle, et la contrainte qui gouverne est 320 px. */}
      {method && <p className="mt-1 text-sm text-ink break-words">{method}</p>}
      {adds.length > 0 && (
        <div data-same-day-adds className="mt-2">
          <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
            {mealCopy("meals.result.extra_ingredients")}
          </p>
          <IngredientRows ingredients={adds} />
        </div>
      )}
      {/* L'ORDRE DU REPAS: entrée, pain, fromage, dessert (`sideKindsOf`). Le
          prénom d'abord quand plusieurs bouches mangent ce repas. */}
      {sides.length > 0 && (
        <div data-same-day-sides className="mt-2 flex flex-col gap-1">
          {sides.map((row) => (
            <div key={row.memberId} data-side-kinds-member-id={row.memberId}>
              {row.name !== null && (
                <p className="text-sm font-medium text-ink break-words">
                  {mealCopy("meals.dish.sides_for", { name: row.name })}
                </p>
              )}
              {row.kinds.map((group) => (
                <p key={group.kind} className="text-sm text-ink break-words">
                  <span className="font-medium">
                    {mealCopy(`meals.dish.side_kind.${group.kind}`)}
                  </span>{" "}
                  <span className="text-ink-soft">{group.items}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * LES AJOUTS DU PLAT, UNE LIGNE PAR ALIMENT — rendus au même format dans la
 * liste du bas et, sur un repas sorti d'une boîte, dans le geste du jour.
 *
 * ⚠️ LE NOMBRE EN BOUT DE LIGNE, `tabular-nums`, et `min-w-0` sur le terme:
 * voir la note de la liste du bas.
 */
function IngredientRows({ ingredients }: { ingredients: readonly DishIngredient[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {ingredients.map((ing, i) => {
        const quantity = ingredientQuantityText(ing);
        return (
          <li
            key={`${ing.term}-${i}`}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="min-w-0 break-words text-ink-soft">{ing.term}</span>
            {/* La marque « déjà au placard » voyage AVEC le nombre, à
                droite: elle qualifie la quantité (« celle-là, tu l'as »),
                pas le nom de l'aliment. */}
            <span className="flex shrink-0 items-baseline gap-2">
              {ing.in_pantry && (
                <Badge tone="positive">{mealCopy("meals.result.in_pantry")}</Badge>
              )}
              {quantity && (
                <span className="tabular-nums text-ink-soft">{quantity}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * ⟳ 2026-09-25 — « QUELLES CUISSONS ? » ET SA BULLE.
 *
 * Remplace le dépliant « La session de cuisine » (retour du propriétaire:
 * « quand on clique on doit avoir une petite fenêtre qui s'ouvre avec la ou les
 * cuissons concernées pour le plat »). Une session par bloc: son jour, les lots
 * de CE plat qui y ont été cuits, puis ce qui a été fait avec eux.
 *
 * ⚠️ COMPOSANT À PART: l'état ouvert/fermé n'existe que sur les cartes qui ont
 * une session — la minorité des vingt-six cartes d'une semaine.
 *
 * ⛔ AUCUNE DURÉE. `active_minutes` et `total_minutes` vivent sur les
 * préparations et sur la session; les recopier ici donnerait à un assemblage
 * le temps d'une cuisson. Elles ont déjà leur surface.
 * ⛔ PAS DE DÉROULÉ: il décrit toute la session, pas ce plat, et il se lit dans
 * la carte de session du jour de cuisson.
 */
function CookingsButton({ sessions }: { sessions: readonly DishSessionView[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    // LE CONTENEUR `relative` porte le bouton ET sa bulle: c'est la frontière
    // du « clic ailleurs » (`AnchoredPanel`). `ml-auto`: au bord droit de la
    // carte, où la bulle s'aligne.
    <span className="relative ml-auto flex shrink-0 items-center">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // L'IDIOME DU KIT POUR UN CONTRÔLE DE TEXTE, le même que le pli: le
        // soulignement porte l'affordance, la figue reste à l'action
        // principale de l'écran. `min-h-6` = 24 px (WCAG 2.5.8).
        className={`min-h-6 text-xs font-medium underline underline-offset-2 hover:text-ink ${
          open ? "text-ink" : "text-ink-soft"
        }`}
      >
        {mealCopy("meals.dish.cookings_open")}
      </button>
      {open && (
        <AnchoredPanel
          title={mealCopy("meals.dish.cookings_title")}
          onDismiss={() => setOpen(false)}
          footer={
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-6 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
            >
              {mealCopy("meals.dish.cookings_close")}
            </button>
          }
        >
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={`${session.day}-${session.dishPreparations[0]?.id ?? ""}`}
                className="border-t border-line pt-2 first:border-t-0 first:pt-0"
              >
                <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
                  {mealCopy("meals.dish.cookings_day", {
                    day: dishDayLabel(session.day) ?? session.day,
                  })}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {session.dishPreparations.map((prep) => (
                    <li
                      key={prep.id}
                      // ⚠️ PAS UN ORNEMENT DE TEST: l'identifiant qui relie ce
                      // plat à cette session. Jamais affiché — un slug ne veut
                      // rien dire à table —, mais la jointure reste auditable
                      // dans le DOM.
                      data-preparation-id={prep.id}
                      className="break-words text-sm text-ink"
                    >
                      {prep.title}
                    </li>
                  ))}
                </ul>
                {/* CE QUI EST SORTI DE LA MÊME SESSION. Muet quand il n'y a
                    rien d'autre — pas de libellé au-dessus du vide. */}
                {session.alsoMade.length > 0 && (
                  <p className="mt-1 break-words text-xs leading-5 text-ink-soft">
                    {mealCopy("meals.result.session_also", {
                      titles: session.alsoMade.join(", "),
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </AnchoredPanel>
      )}
    </span>
  );
}
