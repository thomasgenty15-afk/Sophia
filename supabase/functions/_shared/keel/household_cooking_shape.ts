// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — LA FORME DE CUISSON ET LE SECOND PLAT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
//
// Ce module n'importe rien.

/**
 * D6 — CE QUE LA CUISINE A LE DROIT DE FAIRE.
 *
 * `one_dish` est le contrat historique du foyer, et il reste le défaut de
 * TOUTE composition: une cuisson, des parts qui divergent. Les deux autres
 * n'existent que pour une FUSION, et seulement quand le moteur a établi —
 * par un critère vérifiable, pas par goût — qu'un plat commun forcerait
 * quelqu'un hors de sa direction de service.
 */
export const COOKING_SHAPES = [
  "one_dish",
  "one_session",
  "separate_sessions",
] as const;
export type CookingShape = (typeof COOKING_SHAPES)[number];

// ---------------------------------------------------------------------------
// LE MODE DE CUISSON DÉCLARÉ À LA COMPOSITION — UN PLAFOND, JAMAIS UN ORDRE
//
// ── LE DÉFAUT QUE CE BLOC FERME ────────────────────────────────────────────
// L'échelle ci-dessus est CALCULÉE (`mergeLadder`, et depuis le 2026-08-14 la
// divergence en composition ordinaire), elle change la CONSIGNE du modèle, et
// personne ne la choisit ni ne la voit. Le même foyer bascule d'un barreau à
// l'autre d'une semaine à l'autre sans un mot.
//
// ── ET POURQUOI C'EST UN PLAFOND ───────────────────────────────────────────
// Le calcul reste le calcul: il sait, LUI, qu'une casserole déjà dimensionnée
// ne peut pas donner plus qu'elle ne contient. Un choix qui REMPLACERAIT le
// calcul ferait promettre un plat dédié là où rien ne diverge (une cuisson de
// plus pour rien) ou, dans l'autre sens, servirait une assiette qui ment.
//
// Le choix BORNE donc, dans un seul sens: il peut refuser un second plat, il ne
// peut pas en fabriquer un. « Chacun le sien » n'ouvre qu'une possibilité —
// c'est la divergence qui la lève, comme avant ce lot.
//
// ⛔ ET QUAND LE PLAFOND MORD, LE PLAN LE DIT. La phrase va dans
// `plan_rationale.ts`, qui existe exactement pour ça. Un choix silencieusement
// ignoré est pire que pas de choix: il apprend que les réglages ne servent à
// rien.
//
// ⚠️ AUCUNE MÉMOIRE. Ce module ne lit ni n'écrit: le choix voyage avec LA
// DEMANDE, comme le budget depuis le 2026-08-13, et pour le motif écrit dans
// `CookingCapacityCard` — « un réglage de profil s'écrit une fois et s'applique
// en silence à toutes les semaines suivantes, y compris celle où on reçoit du
// monde ».
// ---------------------------------------------------------------------------

/**
 * L'ORDRE DE L'ÉCHELLE, EN RANGS. C'est `COOKING_SHAPES` lu, jamais une seconde
 * liste: un quatrième barreau ajouté là-haut et oublié ici rendrait `undefined`,
 * et une comparaison contre `undefined` est `false` — c'est-à-dire un plafond
 * désarmé en silence, le motif que ce dépôt paie en boucle. D'où le calcul par
 * `indexOf` plutôt qu'une table écrite à la main.
 */
export function cookingShapeRank(shape: CookingShape): number {
  return COOKING_SHAPES.indexOf(shape);
}

/**
 * LE JETON DEMANDÉ, LU D'UNE ENTRÉE BRUTE. `null` = rien n'a été demandé.
 *
 * ⚠️ UNE VALEUR HORS LISTE REND `null`, JAMAIS UN DÉFAUT. « Je n'ai pas su lire
 * ce que tu as demandé » et « tu n'as rien demandé » produisent le même
 * comportement — le calcul gouverne seul — et c'est la direction sûre: retomber
 * sur `one_dish` clouerait au barreau ① un foyer qui a demandé l'inverse, et
 * retomber sur `separate_sessions` ouvrirait un plafond que personne n'a levé.
 */
export function readCookingShape(raw: unknown): CookingShape | null {
  const token = typeof raw === "string" ? raw.trim() : "";
  return (COOKING_SHAPES as readonly string[]).includes(token)
    ? token as CookingShape
    : null;
}

export interface CookingShapeCap {
  /** LA FORME SERVIE — celle qui part dans la consigne, et la seule. */
  shape: CookingShape;
  /**
   * LE PLAFOND A-T-IL MORDU ? `true` = le calcul voulait aller plus loin sur
   * l'échelle et le choix l'a retenu. C'est la prémisse de la phrase du plan.
   */
  capped: boolean;
  /**
   * LE CHOIX A-T-IL OUVERT PLUS QUE LE CALCUL N'EN DEMANDE ? `true` = quelqu'un
   * a demandé « chacun le sien » et personne ne sort de la casserole commune.
   *
   * ⚠️ C'EST UN FAIT DISTINCT DE `capped`, PAS SON INVERSE: les deux sont faux
   * quand la demande et le calcul tombent d'accord, et ils ne peuvent pas être
   * vrais ensemble. Les confondre en un booléen ferait dire « on n'a pas pu
   * tenir ton choix » à quelqu'un dont le choix a été tenu à la lettre.
   */
  unused: boolean;
}

/**
 * CE QU'ON SERT, DU CALCUL ET DU CHOIX.
 *
 * `asked === null` ⇒ le calcul gouverne seul, et la sortie est byte-identique à
 * celle d'avant ce lot. C'est le chemin de TOUTE requête qui ne porte pas le
 * champ — y compris toutes celles écrites avant lui.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function capCookingShape(
  computed: CookingShape,
  asked: CookingShape | null,
): CookingShapeCap {
  if (asked === null) return { shape: computed, capped: false, unused: false };
  const wanted = cookingShapeRank(asked);
  const found = cookingShapeRank(computed);
  if (wanted < found) {
    // LE PLAFOND MORD: on sert le choix, et le plan dit ce qu'il coûte.
    return { shape: asked, capped: true, unused: false };
  }
  // LE CALCUL RESTE LE CALCUL. Demander « chacun le sien » ne fabrique pas une
  // divergence: on sert ce qui a été trouvé, et on note que le choix n'a rien
  // eu à retenir — sinon il aurait été ignoré en silence.
  return { shape: computed, capped: false, unused: wanted > found };
}

/**
 * LA LIGNE QUI DIT COMBIEN DE PLATS. C'est le CONTRAT de composition, et c'est
 * la raison du bump de `MEAL_PROMPT_VERSION` en v9: jusqu'au 2026-08-12 le
 * brief interdisait purement et simplement de proposer deux plats.
 */
const COOKING_SHAPE_LINES: Record<CookingShape, readonly string[]> = {
  one_dish: [
    "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
  ],
  // ── C6 · « UN SECOND PLAT » SE LISAIT « UN POUR LA SEMAINE » ────────────
  //
  // MESURÉ LE 2026-08-12, créneau par créneau: barreau ② demandé sur un conflit
  // à DEUX axes (`protein:larger_above_table` + `starch:larger_above_table`),
  // NEUF repas pour la personne reprise, et le modèle a rendu UN seul plat
  // dédié. Elle a mangé la casserole commune 8 fois sur 9 — c'est-à-dire
  // très exactement ce que le barreau existe pour interdire, huit fois.
  //
  // « give them a SECOND dish […] Never more than two » est une lecture
  // parfaitement raisonnable de ce qu'on avait écrit: UN plat, deux au total,
  // pour toute la fenêtre. Le compte est désormais PAR REPAS, et « never more
  // than two » devient ce qu'il voulait dire — deux plats à un même repas, pas
  // deux plats dans la semaine.
  //
  // ⚠️ LE NOMBRE EXACT N'EST PAS ICI: il vit dans `buildMergeBlock`, qui est le
  // seul endroit à connaître la personne et ses repas. Deux copies d'un même
  // nombre dont une seule reçoit la modification est le défaut que ce dépôt
  // documente le plus souvent.
  one_session: [
    "Cook ONE set of preparations for the table. ONE person below cannot be",
    "served from it (their line says so): at EVERY meal they eat here they get",
    "a dish of their OWN, cooked in the SAME cooking session as the rest — one",
    "session at the stove, the table's dish and theirs out of it. Two dishes at",
    "any one meal, never three.",
  ],
  separate_sessions: [
    "Cook ONE set of preparations for the table. ONE person below cannot be",
    "served from it (their line says so) and cannot share the session either:",
    "at EVERY meal they eat here they get a dish of their OWN, cooked in their",
    "OWN session, on their own day.",
  ],
};

/**
 * G5 — « ONE person below » ÉTAIT VRAI D'UNE FUSION, ET FAUX D'UNE COMPOSITION.
 *
 * Une fusion reprend UNE personne: le singulier y est exact, et c'est pour ça
 * qu'il a été écrit. Depuis le 2026-08-14 le barreau ② est atteignable en
 * COMPOSITION ORDINAIRE — là, plusieurs bouches peuvent diverger à la fois, et
 * « ONE person » ferait servir un seul plat de plus à trois personnes dont les
 * directions s'opposent.
 *
 * ⚠️ LE CHEMIN DE FUSION NE BOUGE PAS D'UN OCTET, ET C'EST TESTÉ. Une fusion
 * passe TOUJOURS `1` (elle reprend une personne, jamais deux), donc elle rend
 * exactement le tableau ci-dessus. Le pluriel n'existe que pour une population
 * qui, avant le 2026-08-14, n'atteignait jamais ce barreau: il ne peut donc
 * re-stamper aucun plan existant.
 *
 * ⚠️ IL N'Y A PAS DE PLURIEL POUR ③. Le barreau ③ (session propre, jour propre)
 * reste RÉSERVÉ À LA FUSION, où il a été mesuré: un budget de temps permet un
 * second plat DANS LA MÊME SESSION, il ne permet pas une seconde session.
 */
const ONE_SESSION_LINES_MANY: readonly string[] = [
  "Cook ONE set of preparations for the table. SOME of the people below cannot",
  "be served from it (their lines say so): at EVERY meal they eat here, each of",
  "them gets a dish of their OWN, cooked in the SAME cooking session as the",
  "rest — one session at the stove, the table's dish and theirs out of it.",
  "Never more dishes at one meal than the table's dish plus one per person",
  "marked that way.",
];

/**
 * LA LIGNE DE FORME, POUR CE BARREAU ET CE NOMBRE DE BOUCHES QUI DIVERGENT.
 *
 * ⚠️ `divergingCount` EST REQUIS, jamais optionnel et jamais défaut-é. « Un
 * paramètre de garde optionnel = une garde désarmée » est la cicatrice
 * fondatrice de ce fichier (`buildPortionBrief` porte déjà la même note sur
 * `cooking`): un `?` ici n'aurait fait remonter AUCUN appelant au compilateur,
 * et une composition à trois divergents aurait servi la phrase du singulier.
 *
 * `0` et `1` rendent la MÊME chose, et ce n'est pas un oubli: à `one_dish` le
 * nombre ne gouverne rien, et un barreau ② à zéro divergent est une
 * contradiction d'appelant que ce module ne peut pas réparer — il rend la
 * consigne la moins bavarde des deux plutôt que d'inventer un pluriel vide.
 */
export function cookingShapeLines(
  cooking: CookingShape,
  divergingCount: number,
): readonly string[] {
  const many = Number.isFinite(divergingCount) && divergingCount >= 2;
  if (cooking === "one_session" && many) return ONE_SESSION_LINES_MANY;
  return COOKING_SHAPE_LINES[cooking];
}

// ---------------------------------------------------------------------------
// G5 — LE TEMPS PLAFONNE, LA DIVERGENCE DÉCLENCHE (arbitrage B1, 2026-08-14)
//
// LES DEUX MOITIÉS NE SE REMPLACENT PAS:
//
//   · LE TEMPS PLAFONNE. Sous le seuil, `one_dish` est FORCÉ, quoi que les
//     directions demandent. Un second plat qu'on n'a pas le temps de cuire est
//     une promesse que la semaine ne tient pas, et le plan préfère le dire
//     (`plan_rationale.ts`) que le promettre.
//   · LA DIVERGENCE DÉCLENCHE. Au-dessus du seuil, le barreau ② devient
//     ATTEIGNABLE et rien de plus: il ne se lève que là où une direction de
//     service ne peut pas sortir de la casserole commune. Le temps ne fabrique
//     pas de plats inutiles.
//
// ⚠️ `cookingTimeMin` EST PAR SESSION, VÉRIFIÉ LE 2026-08-14 AVANT DE MULTIPLIER,
// trois fois plutôt qu'une:
//   · le prompt l'écrit littéralement — « time per cooking session: about N
//     minutes » (`meal_generation.ts`);
//   · la garde d'intégrité compare N au total d'UNE session, jour par jour
//     (`meal_generation.ts`: « cooking session on ${day} runs ${n} min »);
//   · l'écran ne propose que six durées de SESSION, de 30 min à 3 h
//     (`frontend/src/keel/api/planBudget.ts#COOKING_SESSION_MINUTES`).
// Si ce champ devenait un total HEBDOMADAIRE, la multiplication ci-dessous
// serait fausse d'un facteur `cookDays.length` et le seuil ne voudrait plus
// rien — c'est la première chose à re-vérifier avant de toucher à ce bloc.
// ---------------------------------------------------------------------------

/**
 * 1 h 30 PAR SEMAINE, DÉCIDÉ PAR L'UTILISATEUR LE 2026-08-14.
 *
 * Ce n'est pas une mesure, c'est un ARBITRAGE, et il est écrit ici en un seul
 * endroit pour que le déplacer soit un geste et pas une chasse. Le foyer du
 * constat en déclare 180 (2 jours × 90 min) et passe donc largement — le seuil
 * n'existe pas pour lui, il existe pour le foyer qui déclare une heure et à qui
 * on promettrait deux plats.
 */
export const SEPARATE_DISH_MIN_WEEKLY_MINUTES = 90;

/**
 * LE TEMPS DE CUISINE D'UNE SEMAINE, ou `null` si on ne le sait pas.
 *
 * ⚠️ `null` N'EST PAS ZÉRO, et les traiter pareil serait le défaut. « Aucun jour
 * coché » et « pas de durée déclarée » veulent dire QU'ON NE SAIT PAS, et un
 * foyer qui n'a rien dit ne doit pas se voir refuser un second plat au nom d'un
 * budget qu'il n'a jamais posé — ni s'en voir promettre un. `null` remonte tel
 * quel jusqu'à `plan_rationale`, qui se tait alors: on n'explique pas une
 * décision qu'on n'a pas prise.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function weeklyCookingMinutes(args: {
  cookDays: readonly string[];
  cookingTimeMin: number | null;
}): number | null {
  const days = Array.isArray(args.cookDays) ? args.cookDays.length : 0;
  const per = Number(args.cookingTimeMin);
  if (days === 0) return null;
  if (!Number.isFinite(per) || per <= 0) return null;
  return days * Math.floor(per);
}

/**
 * LE TEMPS PERMET-IL UN SECOND PLAT ?
 *
 * ⚠️ `null` (on ne sait pas) rend `true`, et c'est un arbitrage explicite. Le
 * seuil existe pour REFUSER une promesse qu'un budget déclaré ne tient pas; il
 * n'existe pas pour punir un foyer qui n'a pas rempli la carte de cuisine.
 * Traiter l'ignorance comme un refus ferait retomber sur `one_dish` toute la
 * population qui n'a jamais vu la question — c'est-à-dire changer le
 * comportement de gens à qui on n'a rien demandé, ce que ce lot ne fait pas.
 */
export function timeAllowsASecondDish(minutes: number | null): boolean {
  if (minutes === null || !Number.isFinite(minutes)) return true;
  return minutes >= SEPARATE_DISH_MIN_WEEKLY_MINUTES;
}

/**
 * LES DEUX BARREAUX QUI DEMANDENT UN PLAT DE PLUS — lu sur les lignes
 * ci-dessus, jamais recopié.
 *
 * ⚠️ IL EXISTE PARCE QUE DEUX ENDROITS DOIVENT RÉPONDRE À LA MÊME QUESTION, ET
 * QU'ILS L'ONT DÉJÀ MAL RÉPONDUE. Le plafond de plats et la garde de
 * préparation (`meal_generation.ts`) doivent tous deux savoir si la consigne
 * servie réclame un second plat. Le jour où un quatrième barreau apparaît, une
 * comparaison écrite à la main quelque part continuerait de rendre `false` sans
 * rien casser — c'est exactement le motif « garde désarmée en silence » que ce
 * dépôt paie en boucle.
 */
export function asksForASecondDish(cooking: CookingShape): boolean {
  return cooking !== "one_dish";
}

/**
 * COMBIEN DE PLATS LA FUSION AJOUTE AU PLAFOND — et d'où le nombre vient.
 *
 * ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-12, ET C'EST LE DÉFAUT QUE CETTE FONCTION
 * RÉPARE. Le plafond valait `créneaux × jours` et ne savait rien de la fusion:
 * le MÊME prompt annonçait « au plus 15 plats » ET « donne-lui un SECOND
 * plat ». Le modèle a rendu 16 plats, le parseur a jeté le seizième — et le
 * plat perdu n'était PAS celui de la personne reprise, c'était le DÎNER DU
 * DIMANCHE DU FOYER. Reprendre quelqu'un à table coûtait un repas à tout le
 * monde, en silence.
 *
 * LE NOMBRE N'EST PAS UNE CONSTANTE INVENTÉE: il se lit sur les deux seules
 * consignes qui réclament ces plats.
 *
 *   ① `one_dish` — « Do NOT propose separate dishes. » ZÉRO, et c'est le point
 *      le plus important de cette fonction. Ouvrir un budget que la consigne
 *      interdit d'utiliser ferait « déborder poliment pour le remplir »: c'est
 *      écrit noir sur blanc dans `dishCapFor`, et c'est déjà arrivé une fois
 *      (un plan du jeudi qui proposait à manger jusqu'au mercredi d'après).
 *
 *   ②/③ — la ligne de forme réclame « a SECOND dish » (donc AU MOINS un), et
 *      `buildMergeBlock` pose sous les yeux du modèle les plats propres de la
 *      personne, en lui disant « Keep the dishes below as THEIR dishes ». Le
 *      budget est donc EXACTEMENT ce qu'on lui montre — `ownDishesShown`,
 *      c'est-à-dire la liste APRÈS le filtre de fenêtre et APRÈS
 *      `MERGE_MATERIAL_CAP` (`mergeMaterialShown`, `household_merge.ts`).
 *
 * ── LE PLAFOND DU BONUS EST LE PLAFOND DE BASE, ET IL SE DÉDUIT ───────────
 * Une bouche de plus mange au plus ce qu'une bouche mange: `créneaux × jours`,
 * c'est-à-dire le plafond de base lui-même. Un `ownDishesShown` aberrant (un
 * plan personnel bavard, un appelant qui compte autre chose que ce qui est
 * montré) ne peut donc pas doubler deux fois le budget de la table.
 *
 * ⚠️ CE N'EST PAS `MERGE_MATERIAL_CAP` QUI BORNE ICI, ET C'EST VOULU: importer
 * `household_merge.ts` depuis ce fichier ferait un cycle (il importe déjà
 * celui-ci). Le plafond de base est la borne JUSTE de toute façon — 42 lignes
 * de matière sur une fenêtre de trois jours resteraient trois jours de repas.
 */
export function mergeDishBonus(args: {
  cooking: CookingShape;
  /** La matière du plan personnel, telle que le modèle la VOIT. */
  ownDishesShown: number;
  /**
   * C6 — COMBIEN DE PLATS DÉDIÉS LA CONSIGNE RÉCLAME VRAIMENT.
   *
   * ⚠️ REQUIS, jamais optionnel, et c'est la moitié du lot. Le budget valait
   * « ce qu'on montre »; depuis C6 la consigne réclame UN plat PAR REPAS de la
   * personne reprise, et ce nombre-là n'a aucune raison d'être celui de sa
   * matière — une fusion dont la fenêtre recomposée déborde son plan personnel
   * (L10 ①) montre MOINS de plats qu'elle n'a de repas. Sans ce champ, le
   * modèle recevrait « neuf plats pour elle » et un plafond ouvert pour six:
   * le parseur jetterait les DERNIERS plats de la liste, et on a déjà mesuré ce
   * que ça coûte — le dîner du dimanche du foyer, perdu en silence.
   */
  dedicatedDishesAsked: number;
  baseCap: number;
}): number {
  if (!asksForASecondDish(args.cooking)) return 0;
  const shown = Number.isFinite(args.ownDishesShown)
    ? Math.floor(args.ownDishesShown)
    : 0;
  const asked = Number.isFinite(args.dedicatedDishesAsked)
    ? Math.floor(args.dedicatedDishesAsked)
    : 0;
  const ceiling = Number.isFinite(args.baseCap)
    ? Math.max(1, Math.floor(args.baseCap))
    : 1;
  // LE PLUS GRAND DES DEUX, ET JAMAIS LE PLUS PETIT. Le budget doit couvrir ce
  // que la consigne DEMANDE (`asked`) sans jamais retirer la place qu'elle
  // MONTRE (`shown`): prendre `asked` seul rétrécirait le budget de toute
  // fusion dont le plan personnel est plus bavard que son rythme, et un budget
  // qui rétrécit est exactement le défaut mesuré, par l'autre bout.
  return Math.max(1, Math.min(Math.max(shown, asked), ceiling));
}

/**
 * C6 — COMBIEN DE PLATS DÉDIÉS ON DEMANDE, ET D'OÙ LE NOMBRE VIENT.
 *
 * ⚠️ MESURÉ LE 2026-08-12: barreau ② demandé, conflit sur DEUX axes
 * (`protein:larger_above_table` + `starch:larger_above_table`), NEUF repas pour
 * la personne reprise — et UN seul plat dédié rendu. Elle a mangé la casserole
 * commune 8 fois sur 9.
 *
 * ── LE NOMBRE N'EST PAS UNE CONSTANTE, ET CE N'EST PAS UN SEUIL INVENTÉ ────
 * C'est le DÉNOMINATEUR du constat de forme (`observeMergeShape`, C3 ⑥): ses
 * repas à elle sur la fenêtre écrite, résolus par `memberMealCells`. La mesure
 * qui juge le plan est donc la mesure que la consigne réclame — toute autre
 * valeur rendrait `honoured: false` par construction, et un constat qui ne peut
 * pas être satisfait ne constate rien.
 *
 * ── POURQUOI *TOUS* SES REPAS, ET PAS « CEUX OÙ LE CONFLIT MORD » ─────────
 * Parce que le conflit ne mord pas par créneau: c'est une DIRECTION DE SERVICE
 * (D6), et L4 a tranché que le barreau se décide « pour la table entière, pas
 * par créneau ». Une direction qui dépasse la casserole la dépasse à chaque
 * fois qu'on sert. Les axes en conflit disent ce qui doit CHANGER dans son
 * plat; ils ne disent pas combien de fois on la sert.
 *
 * ── LE PLANCHER EST UN, ET IL RESTE ──────────────────────────────────────
 * `eaterMeals = 0` est déjà refusé bien avant le modèle
 * (`merge_member_away_all_window`). S'il arrivait quand même, rendre 0 ferait
 * un prompt qui réclame un plat dédié (la ligne de forme) avec un budget qui
 * n'en ouvre aucun — la contradiction exacte que L4 a payée.
 */
export function dedicatedDishesFor(
  cooking: CookingShape,
  eaterMeals: number,
): number {
  if (!asksForASecondDish(cooking)) return 0;
  const meals = Number.isFinite(eaterMeals) ? Math.floor(eaterMeals) : 0;
  return Math.max(1, meals);
}
