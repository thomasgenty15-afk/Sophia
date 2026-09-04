// KEEL — LE GÉNÉRATEUR DE REPAS, enfin relié à un écran.
//
// `generate-meal-v1` existait, complet et déployable, avec ZÉRO appelant: le
// seul endroit du dépôt qui le nommait était la liste du coverage-guard. Le
// moteur qui compose des plats pour un élève n'était atteignable par personne.
//
// CE QU'IL FAIT, ET QUI EST EXACTEMENT LE PRODUIT
// -----------------------------------------------
// Il lit la DOCTRINE PUBLIÉE du coach et les CONTRAINTES DE SÉCURITÉ de
// l'élève, puis compose des PLATS: un titre, un jour, un créneau, des
// ingrédients avec leur quantité, la méthode en prose, et pourquoi ce plat pour
// cet élève. Plus une liste de courses par rayon quand on lui demande.
//
// LA DOCTRINE NE S'AFFICHE JAMAIS.
// `GeneratedDish.honours_belief_keys` existe et son propre en-tête le dit:
// « Informatif — jamais exigé, jamais vérifié par un CHECK ». Les convictions du
// coach SERVENT à construire le repas; elles ne sont pas montrées à l'élève.
// C'est la différence avec le plan hebdo de méthode, qui cite la conviction
// exprès (`WeekPlanItem.source_belief_claim`). Ce module n'expose donc pas
// `honours_belief_keys`, pour qu'aucun écran ne puisse l'afficher par accident.

import { supabase } from "../../lib/supabase";
import { readEdgeRefusal } from "./edgeErrors";
import { type MealWindowRequest, selectMealPlans } from "./mealWindow";
import { type DayToken } from "./types";

/** `MEAL_MODES` du moteur. Liste fermée: une valeur hors liste est refusée. */
export const MEAL_MODES = ["from_pantry", "to_shop"] as const;
export type MealMode = (typeof MEAL_MODES)[number];

/** `MEAL_SCOPES`. `day` plafonne à 3 plats, `several_days` à 8. */
export const MEAL_SCOPES = ["day", "several_days"] as const;
export type MealScope = (typeof MEAL_SCOPES)[number];

/**
 * LES MOMENTS OÙ ON MANGE. Miroir de `EATING_OCCASIONS` côté moteur.
 *
 * Il y en a six et plus quatre parce qu'un seul jeton `snack` ne pouvait pas
 * distinguer la faim de 10h de celle de 17h — donc un élève qui s'effondre à
 * 17h n'avait aucun moyen de le dire, et le moteur choisissait pour lui.
 *
 * `snack` n'est PAS ici: il n'est plus proposé. Il reste rendu par
 * `mealLabels` parce que des plats déjà composés le portent.
 */
export const EATING_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type EatingOccasion = (typeof EATING_OCCASIONS)[number];

/** Le créneau qu'on peut DEMANDER. Même liste: on ne propose pas le legacy. */
export const MEAL_SLOTS = EATING_OCCASIONS;
export type MealSlot = EatingOccasion;

/**
 * La taille d'un moment — liste FERMÉE, et facultative.
 *
 * Remplace l'heure, qui ne servait qu'à une parenthèse de prose dans la
 * consigne. Voir `MEAL_SIZES` du moteur pour l'arbitrage complet, et pour
 * pourquoi ce n'est pas une quantité au sens de CONTRACT.md.
 */
export const MEAL_SIZES = ["small", "medium", "large"] as const;
export type MealSize = (typeof MEAL_SIZES)[number];

/**
 * Un moment de la journée de l'élève, avec sa taille SI il l'a donnée.
 *
 * La taille est facultative et le reste: « je grignote l'après-midi » est utile
 * sans savoir si c'est gros ou petit, et une taille exigée serait une taille
 * inventée — que le moteur, lui, traiterait comme une contrainte.
 */
export interface EatingOccasionSlot {
  slot: EatingOccasion;
  /** « large », ou `null`. */
  size: MealSize | null;
}

/**
 * Un moment où l'élève NE MANGE PAS ICI — cantine, restaurant, absent.
 *
 * MIROIR de `AwayDay` du moteur. `slots` vide vaut la journée entière, et la
 * clé est `practical_constraints.away_days` — celle que FF-002 a posée pour
 * l'absence récurrente, pas une seconde pour la même chose.
 */
export interface AwayDay {
  day: string;
  slots: EatingOccasion[];
}

/**
 * Les absences lues depuis `practical_constraints.away_days`.
 *
 * MÊMES RÈGLES QUE `parseAwayDays` DU MOTEUR, et pour la même raison que les
 * deux `parseEatingRhythm`: les deux lisent la même colonne, et deux lectures
 * qui divergent produiraient une grille qui montre autre chose que ce avec
 * quoi on a composé.
 *
 * En particulier: « aucun créneau demandé » (journée entière) et « aucun
 * créneau lisible » (faute de frappe) ne sont pas la même chose. Confondre les
 * deux transformerait un mot mal tapé en journée entière supprimée.
 */
export function parseAwayDays(raw: unknown): AwayDay[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<string, Set<EatingOccasion>>();
  const wholeDay = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim().toLowerCase();
    if (!(DAY_TOKENS as readonly string[]).includes(day)) continue;
    const askedSlots = Array.isArray(e.slots) && e.slots.length > 0;
    const slots = askedSlots
      ? (e.slots as unknown[])
        .map((s) => String(s ?? "").trim().toLowerCase())
        .filter((s): s is EatingOccasion =>
          (EATING_OCCASIONS as readonly string[]).includes(s)
        )
      : [];
    if (askedSlots && slots.length === 0) continue;
    if (!askedSlots) {
      wholeDay.add(day);
      byDay.delete(day);
      continue;
    }
    if (wholeDay.has(day)) continue;
    const set = byDay.get(day) ?? new Set<EatingOccasion>();
    slots.forEach((s) => set.add(s));
    byDay.set(day, set);
  }
  const out: AwayDay[] = [];
  for (const day of DAY_TOKENS) {
    if (wholeDay.has(day)) out.push({ day, slots: [] });
    else if (byDay.has(day)) {
      out.push({
        day,
        slots: EATING_OCCASIONS.filter((s) => byDay.get(day)!.has(s)),
      });
    }
  }
  return out;
}

/**
 * Le rythme lu depuis `student_goals.practical_constraints.eating_rhythm`.
 *
 * MÊMES RÈGLES QUE `parseEatingRhythm` DU MOTEUR, et c'est délibéré: les deux
 * lisent la même colonne, et deux lectures qui divergent produiraient un écran
 * qui affiche autre chose que ce avec quoi on a composé. Écarter plutôt que
 * deviner, ordre de la journée plutôt qu'ordre de saisie, taille facultative,
 * la chaîne nue (`"lunch"`) lue comme le moment sans taille, et l'ancienne clé
 * `at` ignorée sans être migrée — voir l'en-tête du moteur pour chacune.
 */
export function parseEatingRhythm(raw: unknown): EatingOccasionSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, MealSize | null>();
  for (const entry of raw) {
    if (typeof entry === "string") {
      const slot = entry.trim().toLowerCase();
      if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
      if (!bySlot.has(slot as EatingOccasion)) {
        bySlot.set(slot as EatingOccasion, null);
      }
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    const size = String(e.size ?? "").trim().toLowerCase();
    bySlot.set(
      slot as EatingOccasion,
      (MEAL_SIZES as readonly string[]).includes(size) ? (size as MealSize) : null,
    );
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    size: bySlot.get(s) ?? null,
  }));
}

/**
 * LE RYTHME QUE LE MOTEUR IMPOSE QUAND RIEN N'EST DÉCLARÉ.
 *
 * MIROIR EXACT de `DEFAULT_EATING_RHYTHM` côté moteur, et pour la raison qui
 * vaut pour les deux parseurs de ce fichier: un écran qui propose de marquer
 * une absence doit proposer les moments avec lesquels on va COMPOSER. Une
 * troisième liste par défaut ferait cocher des cases sur des repas qui
 * n'existent pas, et laisserait invisibles ceux qui existent.
 */
export const DEFAULT_EATING_RHYTHM: readonly EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

export const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Une durée en minutes, ou `null`. Miroir de `readMinutes` du moteur.
 *
 * PAS DE ZÉRO PAR DÉFAUT: « 0 min » se lit « c'est instantané », ce qui est une
 * promesse; `null` se lit « on ne sait pas », et l'écran sait taire ce qu'il ne
 * sait pas. Plafonné à quatre heures, au-delà c'est une erreur d'unité qui
 * ferait renoncer devant une session qui prend en fait une heure.
 */
function readMinutes(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(240, Math.round(n));
}

export interface DishIngredient {
  term: string;
  quantity: string | null;
  /** Vrai quand l'élève l'a déjà. Calculé par le moteur, jamais par le modèle. */
  in_pantry: boolean;
}

export interface DishBatch {
  servings_made: number;
  covers_days: string[];
  cook_on: string | null;
}

/** Ce qui se CUISINE. Plusieurs plats y puisent — une cuisson, plusieurs repas. */
export interface MealPreparation {
  id: string;
  title: string;
  servings_made: number;
  ingredients: DishIngredient[];
  method: string;
  /**
   * LE TEMPS, EN DEUX NOMBRES QUI NE DISENT PAS LA MÊME CHOSE.
   *
   * `active_minutes` = les mains dessus. `total_minutes` = du début à la fin,
   * attente comprise. Un rôti fait 10 actives et 50 totales, et cet écart EST la
   * raison pour laquelle cuisiner en lot marche: le temps de four est libre.
   * `null` = le modèle n'a rien rendu d'exploitable, et l'écran se tait.
   */
  active_minutes: number | null;
  total_minutes: number | null;
  cook_on: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN CONTENANT: UN REPAS, UN GROUPE DE MANGEURS, ET CE QU'ON MET DEDANS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * v4, 2026-08-20 (`docs/keel/BOITES-PAR-REPAS.md`). Un repas produit N
 * contenants — un par GROUPE: chaque bouche à objectif SEULE, puis tout le
 * reste présent ENSEMBLE. Un foyer de quatre dont une bouche a un objectif
 * sort donc deux contenants par repas, pas un.
 *
 * ⛔ ELLE PEND AU PLAT, PLUS À LA PRÉPARATION — DEPUIS LE 2026-08-19. Trois
 * défauts mesurés tenaient à l'ancienne jointure (`uses[].box_id`): la moitié
 * des boîtes n'atteignait aucun repas, une même boîte servait trois repas, et
 * « Boîte iku » ne disait pas quand l'ouvrir. Le repas porte donc sa boîte, et
 * l'étiquette nomme son jour et son moment — ceux du plat qui la porte.
 *
 * ⛔ CE SONT DES GRAMMES D'ALIMENT, ET LA FRONTIÈRE EST STRUCTURELLE ICI AUSSI.
 * « iku — jeudi midi, 300 g » est une instruction de cuisine, du même côté que
 * « 400 g de cuisses de poulet » sur une liste de courses. Ce type n'a AUCUN
 * champ où mettre un pourquoi, un objectif ou un chiffre de corps — et c'est ce
 * qui rend impossible de les afficher par accident.
 *
 * ⚠️ `member_id` ET PAS UN PRÉNOM. Le prénom vient de la ligne membre (F5),
 * recopiée dans `member_portions[].display_name`; la jointure se fait par ID, et
 * jamais par titre ni par texte — « jamais de matcher maison ».
 */
export interface MealBox {
  id: string;
  /**
   * LE GROUPE QUI OUVRE CE CONTENANT. Jamais vide — un bac pour personne n'est
   * pas une instruction, et le lecteur le jette.
   *
   * ⛔ C'EST LE SEUL MARQUEUR, ET IL DÉCIDE DE LA LECTURE DES GRAMMES:
   *   · UN SEUL id → une PRESCRIPTION. Le contenant EST sa portion: on
   *     l'ouvre, on mange, personne ne pèse.
   *   · PLUSIEURS → une QUANTITÉ DE BAC. C'est ce qu'on met dedans pour n
   *     personnes, et ça ne vise personne. ⛔ Jamais une part par personne
   *     là-dedans: c'est exactement ce qui a tué v2 — la balance de retour au
   *     service.
   *
   * ⚠️ AUCUN BOOLÉEN `is_common`, ET C'EST VOULU. Un second marqueur finirait
   * par contredire la liste des noms, et c'est la liste qu'on croirait. La
   * liste EST déjà la réponse.
   */
  member_ids: string[];
  /**
   * CE QU'ON MET DEDANS, COMPOSANT PAR COMPOSANT. Vide sur un plan v2 relu
   * (voir `legacy_total_grams`).
   *
   * ⚠️ DES `items`, PAS UN NOMBRE. « 300 g » ne se sert pas: c'est
   * `100 + 100 + 100` de trois choses différentes, et un total seul ne dit pas
   * lesquelles. Le total est DÉRIVÉ, jamais déclaré — deux nombres qui doivent
   * s'accorder finissent par diverger.
   */
  items: BoxItem[];
  /**
   * LE TOTAL D'UN PLAN v2 RELU, ET RIEN D'AUTRE.
   *
   * ⚠️ `null` SUR TOUT PLAN v4 — le total s'y dérive des `items`. Ce champ
   * n'existe que pour qu'un plan déjà en base NE PERDE PAS SES GRAMMES quand
   * la forme change sous lui: v2 portait une part par personne et aucune
   * ventilation par composant, donc la seule chose vraie qu'on puisse en tirer
   * est la somme — qui est bien, elle, une quantité de bac.
   */
  legacy_total_grams: number | null;
}

/** UN COMPOSANT DANS UN CONTENANT. Recopié du moteur. */
export interface BoxItem {
  /**
   * LA JOINTURE VERS LA CASSEROLE. `null` = ajouté frais le jour même (le
   * pain), donc hors du contrôle de fournée.
   */
  preparation_id: string | null;
  /**
   * L'ÉTIQUETTE, ET RIEN D'AUTRE. Elle ne sert JAMAIS à retrouver quoi que ce
   * soit — « jamais de matcher maison ».
   */
  term: string;
  /** Grammes d'aliment PRÊT. Entier > 0 — le moteur ne rend jamais zéro. */
  grams: number;
}

/** Quand on cuisine, et dans quel ORDRE. Le déroulé est le champ qui compte. */
export interface CookingSession {
  day: string;
  preparation_ids: string[];
  run_through: string;
  /** La durée AU MUR de la session, pas la somme de ses préparations. */
  total_minutes: number | null;
}

/**
 * LOT 2 — LES QUATRE GESTES DU JOUR J, recopiés du moteur.
 *
 * ⚠️ RECOPIÉE ET PAS IMPORTÉE, comme tout ce fichier: le front ne partage aucun
 * module avec `supabase/functions/_shared/keel/`. La divergence est tenue par un
 * test qui lit la source du moteur — sans lui, un jeton ajouté côté serveur
 * arriverait ici sous forme de bandeau muet.
 */
export const SAME_DAY_KINDS = [
  "none",
  "reheat_only",
  "assemble",
  "cook_fresh",
] as const;

export type SameDayKind = typeof SAME_DAY_KINDS[number];

/**
 * CE QU'IL Y A À FAIRE LE JOUR MÊME POUR AVOIR CE PLAT DANS L'ASSIETTE.
 *
 * ⚠️ `minutes` EST UN TEMPS DE PLAT. Il ne se confond avec AUCUN des deux temps
 * qui existaient déjà, et la carte d'un plat n'a le droit d'afficher que
 * celui-ci: `MealPreparation.active_minutes` / `.total_minutes` sont des temps
 * de CUISSON et `CookingSession.total_minutes` un temps de SESSION — ils ont
 * leur surface (« tes sessions de cuisine »), et les remonter sur un plat
 * annoncerait « réchauffe une portion » à cinquante minutes. La ceinture est
 * dans `lib/dishSession.int.test.ts`, et elle reste mordante.
 *
 * `null` = le modèle a nommé le geste sans donner de durée. L'écran rend alors
 * le libellé seul: pas de « 0 min », qui se lirait « c'est instantané ».
 */
export interface DishSameDay {
  kind: SameDayKind;
  minutes: number | null;
}

export interface GeneratedDish {
  title: string;
  slot: MealSlot | null;
  day: string | null;
  ingredients: DishIngredient[];
  method: string;
  why: string;
  /**
   * Ce que ce plat PRÉLÈVE sur des préparations déjà faites. Vide = il se fait
   * de zéro, et ses `ingredients` sont pour une assiette.
   */
  uses: Array<{
    preparation_id: string;
    servings: number;
    /**
     * COMMENT CETTE PART-LÀ A ATTENDU ENTRE SA CUISSON ET SON REPAS.
     *
     * ⚠️ `"fridge"` SUR TOUT PLAN ÉCRIT AVANT LE 2026-09-01: la clé n'existait
     * pas, et le lecteur ne l'invente pas — il applique le même défaut que le
     * serveur, qui est le STRICT. Un plan d'hier ne se met donc pas à annoncer
     * des décongélations que personne n'a écrites.
     *
     * ⛔ CE N'EST PAS DÉCORATIF: c'est ce qui autorise le plat à être mangé au
     * delà des trois jours du frigo. L'écran doit dire le geste que ça
     * implique — sortir la part la veille — sans quoi le plan est exécutable
     * sur le papier et pas dans la cuisine.
     */
    kept: "fridge" | "freezer";
  }>;
  /**
   * LES CONTENANTS DE CE REPAS — un par groupe de mangeurs (v4, 2026-08-20).
   *
   * `[]` sur tout plan écrit AVANT le 2026-08-19 (la clé n'existait pas: les
   * boîtes vivaient sous `preparations[].boxes`, et ce lecteur ne va PAS les y
   * chercher — une boîte de casserole rendue sous un repas serait un gramme
   * affiché au mauvais endroit), sur toute lane individuelle, et sur tout plat
   * qui se cuisine de zéro. L'écran se tait alors: il n'invente pas de
   * contenant, exactement comme il n'invente pas de bandeau du jour J.
   *
   * ⚠️ TABLEAU, JAMAIS `MealBox | null`. Un `null` obligeait chaque lecteur à
   * choisir entre « pas de contenant » et « un contenant » — et le pluriel est
   * précisément ce que v4 ajoute. `[]` dit les deux d'un coup, et aucun
   * appelant n'a de branche à écrire pour le cas vide.
   */
  boxes: MealBox[];
  /**
   * LOT 2 — CE QU'ON FAIT LE JOUR MÊME, tel que le moteur l'a validé.
   *
   * `null` sur tout plan écrit AVANT le 2026-08-17 (la clé n'existait pas), et
   * sur tout plat où le modèle ne l'a pas déclaré. Ce n'est PAS « rien à
   * faire »: `none` dit ça, et il le dit exprès. L'écran se tait plutôt que
   * d'inventer — écrire « rien à préparer » sur un plat qui n'a rien déclaré
   * serait affirmer un fait que personne n'a écrit.
   */
  same_day: DishSameDay | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT 3 — LA BOUCHE À QUI CE PLAT EST DÉDIÉ. `null` = le plat de la table.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LA CLÉ EXISTAIT EN BASE ET N'ARRIVAIT PAS ICI. Le moteur pose
   * `member_id` sur chaque plat depuis le lot C du 2026-08-15 — et il l'écrit
   * MÊME À `null` (`mealDishesPayload`, `meal_generation.ts:3812`, posture
   * « une clé absente ne se distingue pas d'un lot débranché »). Ce lecteur
   * la jetait: le rendu du plan ne pouvait donc structurellement pas savoir
   * que deux plats d'un même moment ne sont pas pour les mêmes bouches. C'est
   * la même famille de défaut que le `shoppingList: []` du LOT 1 — un champ
   * rendu par le serveur, perdu par le lecteur, sous un câblage vert.
   *
   * ⛔ C'EST UN `member_id`, ET IL N'Y A AUCUNE LECTURE DE TITRE NULLE PART
   * SUR CE CHEMIN. Le seul marqueur d'un plat dédié était « for Zoe » écrit
   * dans son titre par le modèle; un matcher se serait trompé dès « Chicken
   * for Zoe and Marc » et n'aurait rien trouvé dès que le plan sort en
   * français (« jamais de matcher maison »: 12 faux positifs sur 12 mesurés).
   *
   * ⚠️ LECTURE DÉFENSIVE: absent ⇒ `null`, c'est-à-dire « le plat de la
   * table » — ce que ces plans-là étaient déjà pour tout le monde.
   */
  member_id: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PART D'UNE BOUCHE, TELLE QUE LE MOTEUR L'A ÉCRITE (`member_portions`).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CE TYPE VIVAIT DANS `api/household.ts`, ET IL A DÉMÉNAGÉ ICI (LOT 3).
 * `member_portions` est une COLONNE DE `student_generated_meals`, comme
 * `dishes` et `shopping_list`: son lecteur appartient au module de cette
 * table. Il était chez le foyer par accident d'histoire — la seule surface qui
 * la lisait était `/app/household`. Depuis le LOT 3, la vue jour du plan en a
 * besoin aussi, et deux lecteurs du même JSON divergent au premier champ
 * ajouté. `api/household.ts` RÉEXPORTE le type: aucun de ses importateurs ne
 * change.
 *
 * ⚠️ LE PRÉNOM VIENT DE LA LIGNE MEMBRE (F5), PAS DU PLAN. Le moteur le
 * recopie de `member.displayName` au moment de composer
 * (`household_portions.ts:1376`), donc `display_name` EST le prénom de la
 * ligne — et c'est la seule source de prénom autorisée sur ce chemin.
 *
 * ⛔ AUCUN OBJECTIF, AUCUN POIDS, AUCUNE CALORIE: la ceinture est
 * STRUCTURELLE — ce type n'a aucun champ où en mettre un. `portion_note` et
 * les notes de part sont des INSTRUCTIONS DE SERVICE, garanties sans motif ni
 * vocabulaire de corps par `sanitizePortionNote` côté serveur. L'instruction
 * est publique, le motif qui la produit ne l'est pas.
 */
export interface MemberPortionView {
  memberId: string;
  displayName: string;
  /** `null` = part standard. L'écran rend son propre libellé. */
  portionNote: string | null;
  shares: Array<{ preparationId: string; note: string }>;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LES MOMENTS OÙ CETTE BOUCHE MANGE, À LA COMPOSITION.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT QUE ÇA FERME (2026-08-19) ──────────────────────────────
   * L'écran nommait TOUTES les bouches sous chaque plat, sans demander si
   * elles mangent à ce moment-là. Christèle, qui a déclaré déjeuner et dîner,
   * se lisait au petit-déjeuner à côté d'iku.
   *
   * ⛔ IL VIENT DU PLAN, ET SURTOUT PAS D'UNE RELECTURE DU FOYER. « Il faut
   * que le plan respecte les créneaux renseignés AU MOMENT DE FAIRE LE PLAN. »
   * Relire le roster à l'affichage montrerait les créneaux d'aujourd'hui sous
   * un plan composé la semaine dernière.
   *
   * ⚠️ `null` = elle n'a rien déclaré, donc elle suit la maison — et ce n'est
   * PAS `[]`, qui voudrait dire « elle ne mange à aucun moment ». Les
   * confondre ferait disparaître une bouche muette de tous ses repas, ou
   * l'inverse.
   *
   * ⚠️ DES JETONS DE MOMENT, ET RIEN D'AUTRE. Pas de taille: `member_portions`
   * est lisible par tout le foyer, et une taille de part est un fait de corps.
   * Ce type n'a structurellement aucun champ où en mettre une.
   */
  eatingSlots: string[] | null;
}

/**
 * `member_portions` D'UNE LIGNE DE PLAN — L'UNIQUE LECTEUR.
 *
 * Défensif dans une seule direction, comme tous les lecteurs de ce fichier: une
 * bouche sans `member_id` tombe (elle n'est jointe à rien), une part sans
 * `preparation_id` ou sans texte tombe (elle ne dirait rien à côté d'un plat).
 */
export function readMemberPortions(raw: unknown): MemberPortionView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    const shares = Array.isArray(p.preparation_shares) ? p.preparation_shares : [];
    return {
      memberId: String(p.member_id ?? ""),
      displayName: String(p.display_name ?? ""),
      portionNote: typeof p.portion_note === "string" && p.portion_note.trim()
        ? p.portion_note
        : null,
      // ⚠️ DÉFENSIF DANS UNE SEULE DIRECTION, comme tout ce fichier. Ce qui
      // n'est pas un tableau de chaînes redevient `null` — « suit la maison »,
      // c'est-à-dire le comportement d'avant ce champ. Un plan écrit avant le
      // 2026-08-19 n'en porte pas, et il doit se lire exactement comme avant.
      eatingSlots: Array.isArray(p.eating_slots)
        ? p.eating_slots.filter((s): s is string => typeof s === "string")
        : null,
      shares: shares.map((s) => {
        const share = (s ?? {}) as Record<string, unknown>;
        return {
          preparationId: String(share.preparation_id ?? ""),
          note: String(share.note ?? ""),
        };
      }).filter((s) => s.preparationId && s.note),
    };
  }).filter((p) => p.memberId);
}

export interface ShoppingItem {
  term: string;
  quantity: string | null;
  aisle: string;
  /**
   * ⟳ LOT `L0-a`, BRANCHÉ LE 2026-08-23 — LE GROUPE, QUI PORTE LA DATE D'ACHAT.
   *
   * ⛔ REQUIS, `string | null`, jamais `T?`. Ce champ existait en base et dans
   * la charge rendue depuis `L0-a`; il n'était simplement **pas recopié** par
   * `readShopping`. Comme `WaveItem.food_group` était facultatif côté serveur,
   * la structure était satisfaite et rien ne rougissait: `grocery_waves.ts`
   * retombait sur `MAX_FRIDGE_DAYS` pour CHAQUE article, ne produisait qu'une
   * seule vague, et `wavesAreMeaningful` la masquait. Mesuré sur 10 plans réels
   * le 2026-08-23: aucune date d'achat n'atteignait l'écran.
   *
   * `null` = la ligne n'a pas de groupe (un plan écrit avant `L0-a`). C'est une
   * valeur pleine, pas une absence: elle rend le repli d'avant, et
   * `rawWindowCounts` la compte.
   */
  food_group: string | null;
  /**
   * ⟳ 2026-09-01 — LE JOUR OÙ CET ARTICLE S'ACHÈTE, `YYYY-MM-DD`.
   *
   * ⛔ REQUIS, `string | null`, jamais `T?` — la leçon de `food_group` juste
   * au-dessus, appliquée le jour même où on l'ajoute plutôt qu'un an après.
   *
   * Posé par la lane à partir de `grocery_waves.ts`. `null` = la fenêtre du
   * plan n'était pas lisible, ou la ligne n'a pas pu être routée; l'écran
   * retombe alors sur la liste plate d'avant.
   */
  buy_on: string | null;
}

/**
 * FF-053 — UN APPORT FIXE, TEL QUE LA FONCTION L'A LU.
 *
 * Aplati pour le transport: côté moteur c'est une union à deux branches
 * (FF-051), ici `slot: null` dit « hors moment nommé ». La grille n'a besoin que
 * de savoir QUEL créneau est pris, et par quel libellé le nommer.
 */
export interface PlanFixedIntake {
  foodRef: string;
  label: string;
  slot: EatingOccasion | null;
  replacesMeal: boolean;
  /** Vide = tous les jours (même convention que `AwayDay.slots`). */
  days: string[];
}

/** FF-053 — Ce qu'un jour EST, tel que la fonction l'a lu (FF-052). */
export interface PlanDayProperty {
  day: string;
  properties: string[];
}

export interface GeneratedMealResult {
  mealId: string | null;
  dishes: GeneratedDish[];
  /** Ce qui se CUISINE. Plusieurs plats y puisent. */
  preparations: MealPreparation[];
  /** Quand on cuisine, et dans quel ordre. */
  cookingSessions: CookingSession[];
  shoppingList: ShoppingItem[];
  /**
   * LOT 3 — LES PARTS PAR BOUCHE DE **CE** PLAN. `[]` = plan individuel (la
   * lane `generate-meal-v1` n'en écrit AUCUNE), ou plan écrit avant qu'elles
   * n'existent.
   *
   * ⚠️ ELLES VOYAGENT AVEC LEUR PLAN, ET C'EST TOUT L'ARBITRAGE. La vue
   * « qui mange quoi » les lit par `loadHouseholdMeal`, qui rend le plan
   * COURANT du foyer; le rendu du plan, lui, montre l'onglet qu'on regarde —
   * courant OU suivant. Les brancher l'une sur l'autre aurait posé les parts
   * d'un plan à côté des plats d'un autre, sans que rien à l'écran ne le dise.
   * Lues sur la MÊME LIGNE que `dishes`, elles ne peuvent pas se décaler.
   */
  memberPortions: MemberPortionView[];
  /**
   * FF-053 — CE QUI EXPLIQUE UNE CASE VIDE.
   *
   * Renvoyés par la FONCTION, jamais relus depuis `practical_constraints` par
   * l'écran: elle seule sait ce qu'elle a réellement lu, entrées malformées
   * écartées. Un marqueur pour une déclaration que la composition a ignorée est
   * pire que pas de marqueur.
   */
  fixedIntakes: PlanFixedIntake[];
  dayProperties: PlanDayProperty[];
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A1 (2026-09-03) — QUAND LA CUISINE A LIEU, TRANCHÉ PAR LE SERVEUR.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * `null` = la ligne est plus vieille que ce lot, ou la réponse ne le porte
   * pas. L'écran se tait alors, exactement comme avant.
   *
   * ⛔ IL NE SE RECALCULE PAS ICI, ET C'EST LA MOITIÉ DU LOT. Le verdict a
   * besoin de l'HEURE dans le fuseau de la personne; le navigateur ne l'a pas
   * (`local_date.ts` refuse tout repli UTC, un `new Date().getHours()` est
   * interdit dans ce dépôt), et un écran qui le devinerait annoncerait une
   * soirée de cuisine à quelqu'un dont les magasins sont fermés.
   */
  timing: PlanTimingView | null;
  /**
   * LE CONTEXTE QUI A PRODUIT CETTE COMPOSITION, tel qu'il a été demandé.
   *
   * Il est renvoyé pour être REPROPOSÉ: « cantine le midi », « je m'entraîne
   * mardi et jeudi », « le week-end je suis chez mes parents » ne changent pas
   * d'une semaine sur l'autre, et les retaper à chaque génération est le genre
   * de friction qui fait qu'on ne les redit plus du tout — après quoi le moteur
   * compose pour une vie que l'élève n'a pas.
   */
  context: string | null;
  /**
   * CE DONT L'ÉLÈVE AVAIT ENVIE POUR CETTE COMPOSITION — « mezze d'été, plein
   * de carottes ». Renvoyé pour être REPROPOSÉ au formulaire, comme `context`.
   *
   * DISTINCT des goûts durables (`practical_constraints.food_preferences`), qui
   * viennent de la conversation et valent pour toutes ses semaines. Celui-ci est
   * daté: il a été tapé au moment de générer, et il se réécrit à chaque fois.
   */
  preferences: string | null;
  /**
   * QUAND CETTE COMPOSITION A ÉTÉ FAITE — l'ancre de sa semaine.
   *
   * Un plat ne nomme qu'un jour (« tue »), jamais une date. Le moteur remplit
   * sept jours À PARTIR DU JOUR OÙ ON GÉNÈRE, donc c'est cet instant, et lui
   * seul, qui dit à quelle date « mardi » correspond. Sans lui, l'écran ne peut
   * ni ranger les jours dans l'ordre du plan, ni savoir si un plat est déjà
   * passé (`api/mealStretch.ts`).
   *
   * `null` sur une composition qu'on vient de recevoir: elle commence
   * aujourd'hui, ce qui est vrai par construction.
   */
  createdAt: string | null;
  /**
   * LA FENÊTRE DE CE PLAN — le premier jour couvert et leur nombre.
   *
   * C'est ce qui donne une DATE à un jeton (« tue »), et ce qui permet à deux
   * plans de coexister sans qu'aucun écran n'ait à deviner lequel regarder.
   * Avant `20260807090000_meal_plan_window`, la table n'en portait aucune et
   * l'écran la déduisait de `created_at`.
   */
  startsOn: string;
  durationDays: number;
  /**
   * L3 — LA NATURE DE CE PLAN, et elle n'est PAS déductible de `household_id`.
   *
   * `personal` est ce qu'un secondaire compose pour lui; `household` est ce que
   * le maître cuisine pour toute la table. Un plan PERSONNEL porte aussi le
   * `household_id` (`generate-meal-v1` l'estampe exprès, pour que la fusion le
   * retrouve): deux lecteurs indépendants s'y sont trompés le 2026-08-12, et
   * c'est pour ça que la colonne voyage désormais jusqu'ici.
   */
  planKind: "personal" | "household";
  /**
   * D7 — QUAND SON PORTEUR A DÉCLARÉ LE CUISINER LUI-MÊME. `null` = jamais.
   *
   * C'est ce que le foyer lit pour savoir qui a pris la main, et ce que D8
   * compare pour détecter « validé APRÈS la fusion ». Écrit par la seule
   * `keel_validate_meal_plan`, sous le jeton du titulaire.
   */
  validatedAt: string | null;
}

export interface PantryItem {
  term: string;
  quantity?: string | null;
}

export interface GenerateMealInput {
  mode: MealMode;
  /**
   * CE QU'ON DEMANDE, résolu par le SERVEUR avec le fuseau de l'élève.
   *
   * `scope` était une entrée et ne l'est plus: il se dérive de la durée, ce qui
   * rend inexprimable une ligne « un jour » portant une fenêtre de sept jours.
   */
  window: MealWindowRequest;
  /**
   * `replace_current` refait le plan de l'onglet qu'on REGARDE — d'où
   * `replaces`. `prepare_next` en crée un second qui démarre plus tard.
   *
   * ── `draft` — LE TROISIÈME, ET IL N'ÉCRIT RIEN ──────────────────────────
   * Toutes les gardes AMONT s'appliquent à l'identique (gel, objectif requis,
   * méthode publiée, fenêtre, chevauchement, TCA, doctrine, règles de maison):
   * le SEUL saut est l'écriture. Ni plan, ni parts, ni quota de fusion
   * consommé. La réponse porte le même contenu, plus `draft: true` et un
   * `meal.id` nul.
   *
   * ⚠️ `replaces` EST REFUSÉ AVEC `draft` (`unknown_intent`), et c'est
   * cohérent: un aperçu ne remplace rien, puisqu'il n'écrit rien. Passer les
   * deux serait demander au serveur de retirer un plan au profit d'un plan qui
   * n'existera pas.
   */
  intent: "replace_current" | "prepare_next" | "draft";
  replaces: string | null;
  slot: MealSlot | null;
  servings: number;
  /** Le contexte du MOMENT, en prose libre. C'est la demande produit. */
  context: string | null;
  /** L'envie du moment: « mezze d'été, plein de carottes ». */
  preferences: string | null;
  pantry: PantryItem[];
  /**
   * « TOUT DANS UNE SESSION DE CUISINE » — 2026-09-01.
   *
   * ⚠️ REQUIS, jamais `?`. Un champ facultatif ici n'aurait fait remonter AUCUN
   * appelant au compilateur, et l'option se serait construite sans être
   * branchée — c'est la forme exacte de « paramètre de garde optionnel = garde
   * désarmée », payée sept fois par ce dépôt.
   *
   * ⛔ LE SERVEUR LE REFUSE SANS CONGÉLATEUR DÉCLARÉ, et il le DIT
   * (`plan_rationale`). L'écran pose la même porte pour ne pas PROPOSER un
   * geste qui sera refusé; ce n'est pas une garde en double — le corps de la
   * requête est écrit par le réseau, pas par l'écran.
   */
  oneCookingSession: boolean;
  // ⟳ A1 (2026-09-03) — `cookTheDayBefore` A ÉTÉ RETIRÉ D'ICI, ET DU CORPS.
  // La veille n'est plus une case: `generate-meal-v1` et
  // `generate-household-meal-v1` la DÉRIVENT (`leadDayFor`) de la date de
  // départ et de l'heure locale, coupure à 18 h. Le navigateur ne connaît pas
  // l'heure (`local_date.ts` refuse tout repli UTC) — il ne peut donc pas
  // reproduire ce verdict, et il ne doit pas essayer. Ce que le serveur rend en
  // échange est `timing` (`{kind, reason, lead_day}`), que l'écran RÉPÈTE.
}

/**
 * Demande une composition. Le JWT de l'élève décide de qui il s'agit: aucun
 * `user_id` n'est envoyé, et le moteur n'en accepterait pas.
 *
 * Les erreurs métier du moteur (`mode_required`, `pantry_required`,
 * `empty_meal`) remontent telles quelles: elles sont NOMMÉES, et les traduire
 * en « une erreur est survenue » ferait perdre la seule information utile.
 */
export async function generateMeal(
  input: GenerateMealInput,
): Promise<GeneratedMealResult> {
  const { data, error } = await supabase.functions.invoke("generate-meal-v1", {
    body: {
      mode: input.mode,
      window: input.window.kind === "exact"
        ? {
          kind: "exact",
          starts_on: input.window.startsOn,
          duration_days: input.window.durationDays,
        }
        : input.window,
      intent: input.intent,
      replaces: input.replaces,
      meal_slot: input.slot,
      servings: input.servings,
      context: input.context,
      preferences: input.preferences,
      pantry: input.pantry,
      // ⚠️ LE NOM DU SERVEUR, pas celui de l'écran. `generate-meal-v1` lit
      // `body.one_cooking_session === true`; toute autre orthographe ici serait
      // une option cochée qui ne part nulle part, et rien ne le dirait.
      one_cooking_session: input.oneCookingSession,
    },
  });
  if (error) {
    // `FunctionsHttpError` porte le corps: on va y chercher le motif nommé
    // plutôt que de rendre « non-2xx status code », qui n'apprend rien.
    const detail = await readInvokeError(error);
    throw new Error(detail || `[keel/mealGeneration] ${error.message}`);
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const dishes = Array.isArray(payload.dishes) ? payload.dishes : [];
  const shopping = Array.isArray(payload.shopping_list) ? payload.shopping_list : [];
  const meal = payload.meal as { id?: string } | null | undefined;
  return {
    mealId: meal?.id ?? null,
    preparations: readPreparations(payload.preparations),
    cookingSessions: readSessions(payload.cooking_sessions),
    // LOT 3 — `generate-meal-v1` n'écrit AUCUNE `member_portions` (la
    // bifurcation des parts est l'objet de l'enveloppe foyer, et cette lane
    // compose pour une seule bouche). Le lecteur est là quand même, et il rend
    // `[]`: une clé absente et un lot débranché ne se distingueraient pas si
    // on l'omettait.
    memberPortions: readMemberPortions(payload.member_portions),
    // Ce qu'on a DEMANDÉ, pas ce que la réponse raconte: c'est la même valeur
    // que la ligne vient d'enregistrer, et elle est connue à coup sûr ici.
    context: input.context,
    preferences: input.preferences,
    // Elle vient d'être composée: sa semaine commence aujourd'hui, et
    // `stretchStartDate(null)` le dit sans avoir à lire une horloge ici.
    createdAt: null,
    // La fenêtre RÉSOLUE PAR LE SERVEUR, renvoyée telle quelle: c'est elle qui
    // fait foi, pas celle que le navigateur avait prévisualisée.
    startsOn: String(
      ((payload.window ?? {}) as Record<string, unknown>).starts_on ?? "",
    ),
    durationDays: Number(
      ((payload.window ?? {}) as Record<string, unknown>).duration_days ?? 7,
    ),
    // On ne recopie QUE les champs de l'écran. `honours_belief_keys` est
    // volontairement laissé de côté: la doctrine du coach ne s'affiche pas.
    dishes: readDishes(dishes),
    shoppingList: readShopping(shopping),
    fixedIntakes: readFixedIntakes(payload.fixed_intakes),
    dayProperties: readDayProperties(payload.day_properties),
    // A1 — la réponse le porte à la RACINE (`timing`), la ligne dans
    // `generated_from`: c'est la MÊME expression serveur, écrite aux deux
    // endroits par le même `const`.
    timing: readPlanTiming(payload.timing),
    // `generate-meal-v1` ne compose QUE des plans personnels (D2: le plan du
    // maître EST le plan du foyer, et il se compose depuis l'écran du foyer).
    // Écrit en dur plutôt que lu dans la réponse: la fonction ne rend pas la
    // nature, et la deviner d'un champ absent la rendrait `undefined` — donc
    // « pas personnel » pour tout lecteur naïf.
    planKind: "personal",
    // Une composition neuve n'est JAMAIS validée: prendre la main est un geste
    // séparé, et l'écran le demande explicitement (O2).
    validatedAt: null,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O2 — LA GÂCHETTE. PRENDRE LA MAIN SUR SA PROPRE SEMAINE (D2, D7).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ C'EST LE SEUL APPELANT DE `keel_validate_meal_plan` DU PRODUIT, et jusqu'à
 * ce lot il n'y en avait AUCUN. Le registre l'a écrit trois lots de suite:
 * « aucune surface produit n'appelle `keel_validate_meal_plan` — la prise de
 * main est inatteignable par un vrai utilisateur ». Sans cette ligne, personne
 * ne prend la main, donc rien n'est jamais proposé au maître, donc ni fusion,
 * ni défusion, ni avertissement n'existent: sept lots de serveur reposent sur
 * ce geste.
 *
 * ── POURQUOI PAR POSTGREST, ET PAS PAR UNE FONCTION EDGE ─────────────────
 * La RPC est gatée sur `auth.uid()` et son `EXECUTE` est RÉVOQUÉ à
 * `service_role` (migration 20260811140000, exprès: `auth.uid()` y est NULL, et
 * l'appel rendait un 200 qui n'écrivait rien). AUCUNE fonction edge ne peut
 * donc la porter. La gâchette est structurellement un appel PostgREST sous le
 * jeton du titulaire — c'est-à-dire cette ligne-ci.
 *
 * ── `already` N'EST PAS UN ÉCHEC ─────────────────────────────────────────
 * La RPC est idempotente SOUS CONCURRENCE: la garde est dans le prédicat de
 * l'`update`, et quatre appels simultanés ne redatent pas la ligne (mesuré le
 * 2026-08-11 sur six plans, zéro collision). `already: true` veut dire
 * « c'était déjà validé », ce qui est le résultat souhaité — le traiter comme
 * une erreur ferait d'un double-clic un écran rouge, et pousserait à recliquer.
 */
export interface ValidateMealPlanResult {
  ok: boolean;
  /** Vrai quand ce plan était DÉJÀ validé. Un succès, pas un refus. */
  already: boolean;
  /** Le motif NOMMÉ du refus, ou `""`. Traduit par `copy/planRefusals.ts`. */
  reason: string;
}

export async function validateMealPlan(
  planId: string,
): Promise<ValidateMealPlanResult> {
  const { data, error } = await supabase.rpc("keel_validate_meal_plan", {
    p_plan: planId,
  });
  if (error) throw new Error(`[keel/mealGeneration] validate failed: ${error.message}`);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    already: row.already === true,
    reason: String(row.reason ?? ""),
  };
}

/**
 * Les apports fixes de la réponse. Défensif dans une seule direction, comme
 * tous les lecteurs de ce fichier: ce qu'on ne sait pas lire tombe SEUL.
 *
 * ⚠️ `export` AJOUTÉ POUR `api/planDraft.ts`, ET C'EST LE SEUL GESTE POSSIBLE.
 * Le brouillon (`intent: "draft"`) reçoit EXACTEMENT le même payload qu'un plan
 * écrit, et il doit le monter dans le MÊME `PlanResult`. Sans cet export, le
 * module du brouillon devrait recopier ce lecteur — c'est-à-dire un second
 * normaliseur du même JSON, qui divergerait au premier champ ajouté, et c'est
 * toujours celui qu'on regarde le moins qui garde l'ancien comportement.
 * Aucune ligne de LOGIQUE n'a changé ici: seulement la visibilité.
 */
export function readFixedIntakes(raw: unknown): PlanFixedIntake[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanFixedIntake[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const foodRef = String(e.food_ref ?? "").trim();
    if (!foodRef) continue;
    const slot = String(e.slot ?? "").trim();
    out.push({
      foodRef,
      // Le libellé retombe sur l'identifiant: la grille doit pouvoir nommer la
      // case, et un identifiant est un plus mauvais nom que rien n'est pire.
      label: String(e.label ?? "").trim() || foodRef,
      slot: EATING_OCCASIONS.includes(slot as EatingOccasion)
        ? (slot as EatingOccasion)
        : null,
      replacesMeal: e.replaces_meal === true,
      days: Array.isArray(e.days) ? e.days.map((d) => String(d)) : [],
    });
  }
  return out;
}

/** `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`. */
export function readDayProperties(raw: unknown): PlanDayProperty[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanDayProperty[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim();
    const properties = Array.isArray(e.properties)
      ? e.properties.map((p) => String(p)).filter(Boolean)
      : [];
    if (!day || properties.length === 0) continue;
    out.push({ day, properties });
  }
  return out;
}

/** Les ingrédients d'un plat ou d'une préparation — même forme des deux côtés. */
function readIngredients(raw: unknown): DishIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const i = (entry ?? {}) as Record<string, unknown>;
    return {
      term: String(i.term ?? ""),
      quantity: i.quantity === null || i.quantity === undefined
        ? null
        : String(i.quantity),
      in_pantry: i.in_pantry === true,
    };
  });
}

/**
 * LES PLATS, NORMALISÉS — et c'est le SEUL chemin vers `GeneratedDish[]`.
 *
 * Deux appelants montent la même liste: la réponse du moteur, et une ligne
 * `student_generated_meals` relue plus tard. La ligne relue a été écrite par une
 * version antérieure du moteur, donc ses plats n'ont pas forcément les champs
 * d'aujourd'hui — `uses` est arrivé après des compositions déjà en base. Un
 * `as GeneratedDish[]` sur ce JSONB compile et jure que `dish.uses` existe;
 * l'écran fait `dish.uses.map(...)` et casse à l'ouverture, sans qu'aucun test
 * de type n'ait pu le voir. D'où: un lecteur qui DONNE les champs manquants,
 * partagé, plutôt qu'un cast qui les suppose.
 */
export function readDishes(raw: unknown): GeneratedDish[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      title: String(d.title ?? ""),
      slot: (d.slot ?? null) as MealSlot | null,
      day: d.day === null || d.day === undefined ? null : String(d.day),
      method: String(d.method ?? ""),
      why: String(d.why ?? ""),
      uses: Array.isArray(d.uses)
        ? d.uses.map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparation_id: String(u.preparation_id ?? ""),
            servings: Number(u.servings) || 1,
            // ⚠️ LA MÊME DIRECTION QUE LE SERVEUR: tout ce qui n'est pas
            // exactement `"freezer"` vaut `"fridge"`. Une clé absente (plan
            // d'avant le lot) ou un jeton inconnu retombent donc sur le
            // strict, et l'écran n'annonce pas une décongélation inventée.
            kept: u.kept === "freezer" ? "freezer" as const : "fridge" as const,
          };
        }).filter((u) => u.preparation_id !== "")
        : [],
      ingredients: readIngredients(d.ingredients),
      boxes: readBoxes(d),
      same_day: readSameDay(d.same_day),
      // LOT 3 — L'ATTRIBUTION, RELUE TELLE QUELLE. Une chaîne vide vaut
      // `null`: « attribué à personne » et « attribué à la chaîne vide » se
      // liraient pareil à l'écran, et la seconde ferait chercher une bouche
      // qui n'existe pas.
      member_id: typeof d.member_id === "string" && d.member_id.trim() !== ""
        ? d.member_id.trim()
        : null,
    };
  });
}

/**
 * LOT 2 — LE GESTE DU JOUR J, RELU D'UNE LIGNE ET REVALIDÉ ICI.
 *
 * ⚠️ LA LISTE FERMÉE EST VÉRIFIÉE UNE SECONDE FOIS, et ce n'est pas de la
 * paranoïa: ce lecteur monte aussi des lignes `student_generated_meals` écrites
 * par une AUTRE version du moteur. Un `as SameDayKind` compilerait et jurerait
 * que le jeton est bon; l'écran ferait alors `mealCopy("meals.same_day." + kind)`
 * sur une clé qui n'existe pas — et en DEV, une clé absente LÈVE. Le plan entier
 * disparaîtrait pour un champ décoratif.
 *
 * Même arbitrage que `uses` juste au-dessus: un lecteur qui DONNE les champs
 * manquants, jamais un cast qui les suppose.
 */
function readSameDay(raw: unknown): DishSameDay | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const sd = raw as Record<string, unknown>;
  const kind = String(sd.kind ?? "");
  if (!(SAME_DAY_KINDS as readonly string[]).includes(kind)) return null;
  const minutes = Number(sd.minutes);
  return {
    kind: kind as SameDayKind,
    // `null` et JAMAIS zéro par défaut: « 0 min » se lit « c'est instantané »,
    // ce qui est une affirmation que le moteur n'a pas faite.
    minutes: Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null,
  };
}

/**
 * La liste de courses, même arbitrage: relue d'une ligne, elle est normalisée.
 *
 * `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`: depuis
 * le LOT 1, le brouillon rend ses courses jour par jour, et il les relit donc
 * de la MÊME façon que le plan adopté. Deux lectures de la même ligne
 * divergeraient.
 */
export function readShopping(raw: unknown): ShoppingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const s = (entry ?? {}) as Record<string, unknown>;
    return {
      term: String(s.term ?? ""),
      quantity: s.quantity === null || s.quantity === undefined
        ? null
        : String(s.quantity),
      aisle: String(s.aisle ?? "other"),
      // ⟳ 2026-08-23 — LE CHAMP QUI MANQUAIT, et il manquait en silence.
      // ⛔ NE PAS LE REMETTRE SOUS LE TAPIS: c'est lui, et lui seul, qui donne
      // sa date d'achat à un article (`grocery_waves.ts :: waveAssignments`,
      // `rawWindowDaysFor(item.food_group)`). Sans lui, toute la liste part
      // dans une vague unique que l'écran masque.
      food_group: s.food_group === null || s.food_group === undefined
        ? null
        : String(s.food_group),
      // ⟳ 2026-09-01 — LA DATE D'ACHAT, POSÉE PAR LE SERVEUR SUR LA LIGNE.
      //
      // ⛔ MÊME CICATRICE QUE `food_group` JUSTE AU-DESSUS, ET C'EST POUR ÇA
      // QU'ELLE EST RECOPIÉE ICI: un lecteur qui laisse tomber un champ le fait
      // en SILENCE, et le calcul d'aval retombe sur son repli sans qu'un seul
      // rouge ne le dise. Le panneau de courses recalcule aujourd'hui ses
      // vagues lui-même (il a tout ce qu'il faut); ce champ est ce qui permettra
      // aux surfaces qui n'ont PAS les préparations — la bande du soir, le PDF
      // du frigo, une liste partagée sans compte — de dire le jour sans
      // refaire le calcul.
      buy_on: s.buy_on === null || s.buy_on === undefined
        ? null
        : String(s.buy_on),
    };
  });
}

/** `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`. */
export function readPreparations(raw: unknown): MealPreparation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry ?? {}) as Record<string, unknown>;
    return {
      id: String(p.id ?? ""),
      title: String(p.title ?? ""),
      servings_made: Number(p.servings_made) || 0,
      method: String(p.method ?? ""),
      active_minutes: readMinutes(p.active_minutes),
      total_minutes: readMinutes(p.total_minutes),
      cook_on: p.cook_on === null || p.cook_on === undefined ? null : String(p.cook_on),
      ingredients: readIngredients(p.ingredients),
    };
  }).filter((p) => p.id !== "" && p.title !== "");
}

/**
 * LA BOÎTE D'UN REPAS, RELUE ET REVALIDÉE ICI.
 *
 * ⚠️ LA REVALIDATION N'EST PAS DE LA PARANOÏA, c'est le même arbitrage que
 * `readSameDay` et `uses` juste au-dessus: ce lecteur monte aussi des lignes
 * `student_generated_meals` écrites par une AUTRE version du moteur, où la clé
 * n'existait pas du tout. Un `as MealBox` sur ce JSONB compilerait et jurerait
 * que `box.shares` est un tableau; l'écran ferait `box.shares.map(...)` et
 * casserait à l'ouverture du plan, sans qu'aucun test de type n'ait pu le voir.
 * C'est le défaut que ce fichier documente déjà deux fois.
 *
 * ⛔ ET LES GRAMMES SONT REFUSÉS PLUTÔT QUE DÉFAUT-ÉS À ZÉRO. « 0 g » se lit
 * « ne mange rien », ce qui est une affirmation; une part sans poids lisible
 * n'est pas une instruction de pesée, et l'écran ne la rend pas. Précédent
 * `readMinutes`, mot pour mot.
 *
 * ⛔ ET IL NE VA PAS CHERCHER LES BOÎTES D'AVANT. Un plan écrit avant le
 * 2026-08-19 porte ses boîtes sous `preparations[].boxes`, en grammes de
 * casserole: les remonter ici afficherait la part d'un bac sous un repas, ce qui
 * est un gramme JUSTE au mauvais endroit — le seul repli vraiment dangereux. Ces
 * plans-là n'ont pas de table de pesée, et l'écran se tait.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES CONTENANTS D'UN PLAT — v4 AU PLURIEL, ET LE REPLI SUR LES PLANS v2.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IL LIT LE PLAT ENTIER, PAS UN CHAMP. C'est ce qui lui permet de servir
 * les deux formes sans qu'aucun appelant ait à savoir laquelle il regarde:
 * `boxes[]` (v4) si elle est là, sinon `box` (v2) replié.
 *
 * ⛔ LE REPLI v2 N'INVENTE AUCUNE VENTILATION. v2 portait une part PAR
 * PERSONNE (`shares[]`) et aucun découpage par composant. La seule chose vraie
 * qu'on puisse en tirer est la SOMME — et une somme sur un bac partagé est
 * exactement ce que v4 appelle une quantité de bac. Elle sort donc en
 * `legacy_total_grams`, jamais en `items` fabriqués: un `item` inventé
 * porterait un `term` que personne n'a écrit.
 *
 * ⚠️ ET LES NOMS SURVIVENT AU REPLI. Les `member_id` des parts deviennent le
 * groupe du contenant: un plan déjà en base garde son couvercle nommé.
 */
function readBoxes(dish: Record<string, unknown>): MealBox[] {
  // ── LE CHEMIN v4 ────────────────────────────────────────────────────────
  if (Array.isArray(dish.boxes)) {
    return dish.boxes
      .map((entry) => readBoxV4(entry))
      .filter((b): b is MealBox => b !== null);
  }
  // ── LE REPLI v2 ─────────────────────────────────────────────────────────
  const folded = readBoxV2(dish.box);
  return folded === null ? [] : [folded];
}

function readBoxV4(raw: unknown): MealBox | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id = String(b.id ?? "");
  if (id === "") return null;
  const memberIds = (Array.isArray(b.member_ids) ? b.member_ids : [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v !== "");
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-01 — LE COUVERCLE ANONYME EST DEVENU LÉGITIME.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CETTE LIGNE JETAIT LE CONTENANT, et son motif était: « un contenant sans
  // personne n'est pas une instruction; "sers-toi" se dit par l'ABSENCE de
  // contenant, pas par un contenant vide ». C'était vrai tant que les boîtes
  // n'existaient QUE sur la lane foyer, où un couvercle sans nom est un bac
  // qu'on ne sait à qui ouvrir.
  //
  // Ce n'est plus vrai. La lane individuelle a ses contenants depuis ce jour, et
  // ils n'ont PAS de nom par construction: il n'y a personne à départager, et
  // c'est le jour + le repas qui disent lequel ouvrir (`boxLidLabel` rend
  // « jeudi midi — Chili de lentilles »).
  //
  // ⚠️ MESURÉ, PAS SUPPOSÉ: sans ce changement, un plan solo réel portant ONZE
  // contenants en base (`box_counts.with_box: 11`, `delivery: "served"`)
  // affichait un dépliant de session VIDE. Le moteur avait raison, l'écran se
  // taisait, et rien ne disait lequel des deux avait bougé — la forme de défaut
  // que ce fichier documente déjà trois fois.
  //
  // ⛔ ET LA GARDE N'EST PAS PERDUE, ELLE EST REMONTÉE OÙ ELLE SAIT DÉCIDER.
  // `parseGeneratedMeal` refuse toujours un couvercle sans nom sur la lane
  // FOYER (`memberIds.length === 0 && !args.soloBoxes`), là où la lane est
  // connue. Cet écran-ci, lui, reçoit une ligne de base sans savoir de quelle
  // lane elle vient: y refaire la décision, c'était la prendre à l'aveugle.
  const items = (Array.isArray(b.items) ? b.items : []).map((entry) => {
    const it = (entry ?? {}) as Record<string, unknown>;
    const grams = Number(it.grams);
    const prep = String(it.preparation_id ?? "").trim();
    return {
      // `null` = ajouté frais le jour même, et c'est une information: ce
      // composant n'est pas sorti d'une casserole de la session.
      preparation_id: prep === "" ? null : prep,
      term: String(it.term ?? "").trim(),
      grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : 0,
    };
  }).filter((it) => it.term !== "" && it.grams > 0);
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LE TOTAL v2 SURVIT AU PLIAGE FAIT PAR LE MOTEUR (2026-08-20)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le moteur plie lui-même un `box` singulier v2 en UN contenant v4: il écrit
  // alors `items: []` et `legacy_total_grams: <la somme des parts>`. Sans cette
  // lecture, ce lecteur-ci jetterait le contenant pour `items.length === 0`, et
  // tout plan écrit tant que le prompt n'est pas passé en v4 perdrait ses
  // grammes À L'ÉCRAN — le moteur ayant raison, l'écran muet, et rien pour dire
  // lequel des deux a bougé.
  //
  // ⚠️ IL N'INVENTE TOUJOURS AUCUN `item`: un `term` que personne n'a écrit
  // serait un mensonge. Le total est rendu tel quel, et `boxLidLabel` /
  // `boxLinesForDish` le rendent comme une quantité de bac — ce qu'il est.
  const legacyRaw = Number((raw as Record<string, unknown>).legacy_total_grams);
  const legacyTotal = Number.isFinite(legacyRaw) && legacyRaw > 0
    ? Math.round(legacyRaw)
    : null;
  if (items.length === 0 && legacyTotal === null) return null;
  return { id, member_ids: memberIds, items, legacy_total_grams: items.length > 0 ? null : legacyTotal };
}

/** Un `box` singulier de plan v2 — un bac, une part par nom. */
function readBoxV2(raw: unknown): MealBox | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const id = String(b.id ?? "");
  if (id === "") return null;
  const shares = (Array.isArray(b.shares) ? b.shares : []).map((entry) => {
    const sh = (entry ?? {}) as Record<string, unknown>;
    const grams = Number(sh.grams);
    return {
      member_id: String(sh.member_id ?? ""),
      grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : 0,
    };
  }).filter((sh) => sh.member_id !== "" && sh.grams > 0);
  if (shares.length === 0) return null;
  return {
    id,
    member_ids: shares.map((sh) => sh.member_id),
    items: [],
    legacy_total_grams: shares.reduce((sum, sh) => sum + sh.grams, 0),
  };
}

/** `export` pour `api/planDraft.ts` — même raison que `readFixedIntakes`. */
export function readSessions(raw: unknown): CookingSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const sess = (entry ?? {}) as Record<string, unknown>;
    return {
      day: String(sess.day ?? ""),
      preparation_ids: Array.isArray(sess.preparation_ids)
        ? sess.preparation_ids.map((v) => String(v))
        : [],
      run_through: String(sess.run_through ?? ""),
      total_minutes: readMinutes(sess.total_minutes),
    };
  }).filter((s) => s.day !== "" && s.preparation_ids.length > 0);
}

/**
 * « JETON: DÉTAIL » — la forme que `MealBuilder` découpe sur le premier `:`.
 *
 * ⚠️ LA LECTURE DU CORPS N'EST PLUS ICI. Ce fichier avait son propre lecteur,
 * jumeau de `namedEdgeRefusal`, et les deux avaient le MÊME trou: un 401 dont
 * le corps ne porte pas de clé `error` — c'est-à-dire la session périmée, le
 * cas le plus banal qui soit — rendait `null`, et l'élève lisait la phrase de
 * supabase-js (« Edge Function returned a non-2xx status code ») au lieu d'une
 * phrase sur sa session. Voir `api/edgeErrors.ts`.
 */
async function readInvokeError(error: unknown): Promise<string | null> {
  const refusal = await readEdgeRefusal(error);
  if (!refusal) return null;
  return refusal.detail ? `${refusal.token}: ${refusal.detail}` : refusal.token;
}

/** Les colonnes qu'un plan doit rendre pour être affichable ET situable. */
export const MEAL_COLUMNS =
  // ⚠️ EXPORTÉE POUR ÊTRE TESTÉE AVEC SON LECTEUR, ET C'EST UNE LEÇON DU LOT 1.
  // Une colonne absente d'ici rend `undefined` à `readMealRow`, qui rend alors
  // du vide — sans un seul rouge, parce que le lecteur, lui, est correct. Le
  // défaut `shoppingList: []` du 2026-08-17 est exactement de cette famille:
  // câblage vert, valeur morte. Les deux se testent donc ensemble.
  // L8 — `plan_kind` sert à ne montrer QUE le plan qu'on cuisine (D9), et
  // `validated_at` à dire si on a pris la main dessus (D7). Voir `cookedPlans`.
  "plan_kind, validated_at, " +
  // LOT 3 — `member_portions` vient d'ICI et de nulle part ailleurs pour le
  // rendu du plan: c'est la SEULE façon que les parts affichées soient celles
  // du plan affiché (l'onglet « suivant » n'est pas le plan que
  // `loadHouseholdMeal` rend).
  "id, dishes, member_portions, preparations, cooking_sessions, shopping_list, context, " +
  // `generated_from` porte, depuis FF-053, ce SOUS QUOI le plan a été composé —
  // apports fixes et propriétés de jour. Sans cette colonne, la grille
  // expliquerait ses cases vides juste après la génération et se tairait au
  // premier rafraîchissement.
  "preferences, starts_on, duration_days, retired_at, created_at, generated_from";

/**
 * Une ligne de plan, telle que l'écran la lit.
 *
 * Défensif dans une seule direction: ce qui manque devient vide, jamais deviné.
 * `duration_days` retombe sur sept parce que c'est la fenêtre qu'une ligne
 * ancienne portait implicitement — et le backfill de la migration a écrit ce
 * même sept sur toutes les lignes historiques, donc les deux s'accordent.
 */
/**
 * A1 — CE QUE LE SERVEUR DIT DU TIMING D'UN PLAN.
 *
 *   · `day_before`   — la fenêtre a reculé d'un jour; `leadDay` porte la date
 *                      de ce jour de cuisine, où rien ne se mange;
 *   · `same_morning` — pas de veille. L'écran rend l'avertissement.
 *   · `starts_tomorrow` — la journée d'aujourd'hui était déjà dépensée (tous
 *                      ses moments passés) et elle a été RETIRÉE de la fenêtre.
 *                      ⚠️ Le plan est donc plus COURT que ce qui a été demandé:
 *                      aucun jour n'est ajouté au bout pour compenser. L'écran
 *                      doit dire les deux choses — il commence demain, et il
 *                      couvre un jour de moins.
 *
 * `reason` est le motif du serveur (`day_before`, `before_cutoff_today`,
 * `after_cutoff`, `starts_today`, `clock_unreadable`, `no_room`,
 * `in_the_past`). Il est GARDÉ mais l'écran n'en rend AUCUNE variante: la
 * phrase complète vit dans `plan_rationale`, côté serveur, et un second jeu de
 * gabarits ici divergerait au premier ajustement.
 */
export interface PlanTimingView {
  kind: "day_before" | "same_morning" | "starts_tomorrow";
  reason: string;
  leadDay: string | null;
}

/**
 * LE TIMING, LU D'UN OBJET BRUT. PURE.
 *
 * ⚠️ `kind` EST VÉRIFIÉ CONTRE UNE LISTE FERMÉE. Une valeur hors vocabulaire
 * rend `null` — donc « on ne dit rien » — et surtout pas `same_morning` par
 * défaut: l'avertissement « dès le matin » sur un plan qui a bien reculé d'un
 * jour est un fait FAUX, et il est indémentable pour qui le lit.
 */
export function readPlanTiming(raw: unknown): PlanTimingView | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const kind = String(t.kind ?? "");
  if (
    kind !== "day_before" && kind !== "same_morning" && kind !== "starts_tomorrow"
  ) return null;
  const leadDay = String(t.lead_day ?? "").trim();
  return {
    kind,
    reason: String(t.reason ?? ""),
    leadDay: /^\d{4}-\d{2}-\d{2}$/.test(leadDay) ? leadDay : null,
  };
}

export function readMealRow(raw: unknown): GeneratedMealResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    mealId: String(row.id ?? "") || null,
    dishes: readDishes(row.dishes),
    preparations: readPreparations(row.preparations),
    cookingSessions: readSessions(row.cooking_sessions),
    shoppingList: readShopping(row.shopping_list),
    memberPortions: readMemberPortions(row.member_portions),
    // Les DEUX lectures figées à la composition. Une ligne écrite avant FF-053
    // n'en a pas: la grille montre alors des cases vides sans explication, ce
    // qui est exactement ce qui était vrai pour ce plan-là.
    fixedIntakes: readFixedIntakes(
      ((row.generated_from ?? {}) as Record<string, unknown>).fixed_intakes,
    ),
    // A1 — écrit par la RPC sur la ligne, pour la même raison que les deux
    // lectures figées au-dessus: un plan relu demain doit encore savoir
    // pourquoi il commence un jour plus tôt.
    timing: readPlanTiming(
      ((row.generated_from ?? {}) as Record<string, unknown>).timing,
    ),
    dayProperties: readDayProperties(
      ((row.generated_from ?? {}) as Record<string, unknown>).day_properties,
    ),
    context: typeof row.context === "string" && row.context.trim() !== ""
      ? row.context
      : null,
    preferences: typeof row.preferences === "string" && row.preferences.trim() !== ""
      ? row.preferences
      : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    startsOn: String(row.starts_on ?? ""),
    durationDays: Number(row.duration_days) || 7,
    // Hors vocabulaire ⇒ `personal`, qui est le DÉFAUT de la colonne en base
    // (`not null default 'personal'`) et la direction sûre: se tromper vers
    // « personnel » montre à quelqu'un un plan qui est le sien, se tromper vers
    // « foyer » lui cacherait le seul plan qu'il a.
    planKind: row.plan_kind === "household" ? "household" : "personal",
    validatedAt: typeof row.validated_at === "string" ? row.validated_at : null,
  };
}

/**
 * D9 — LE PLAN QU'ON CUISINE, ET LUI SEUL.
 *
 * > « Le maître ACCÈDE à tous les plans, mais sa surface de cuisine n'affiche
 * > QUE le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas: le
 * > but est de simplifier sa cuisine, pas de lui faire suivre N plans. »
 *
 * ── POURQUOI LA RÈGLE SE LIT SUR LES LIGNES, ET PAS SUR LE RÔLE ──────────
 * Seul un compte MAÎTRE porte des lignes `plan_kind = 'household'`: c'est la
 * fonction du foyer qui les écrit, sur son user_id. « J'ai un plan de foyer
 * vivant » est donc exactement « je suis le maître d'un foyer qui a composé »,
 * sans lire ni `household_members`, ni un rôle, ni une seconde requête. Une
 * lecture de plus aurait été une seconde définition de la même chose — et le
 * jour où les deux divergent, personne ne sait laquelle ment.
 *
 * ⚠️ CE N'EST PAS DÉFENSIF, C'EST NÉCESSAIRE. Les deux natures peuvent couvrir
 * LES MÊMES JOURS: la contrainte d'exclusion est scopée `(user_id, plan_kind)`,
 * exprès (« sans ça le maître ne peut pas tenir les deux »). Sans ce filtre,
 * `selectMealPlans` choisirait entre deux plans vivants du même jour selon leur
 * seule date de début — le maître verrait tantôt sa semaine de foyer, tantôt un
 * plan personnel oublié, sans rien pour distinguer les deux à l'écran.
 *
 * ── LE REPLI EST LE PLAN PERSONNEL ───────────────────────────────────────
 * Aucun plan de foyer vivant ⇒ on rend tout le reste. C'est le cas du compte
 * individuel (l'entrée du produit est à 1), celui du secondaire qui a pris la
 * main, et celui du maître qui n'a pas encore composé — à qui on ne montre pas
 * un écran vide alors qu'il a un plan.
 */
export function cookedPlans(
  rows: readonly GeneratedMealResult[],
): GeneratedMealResult[] {
  const household = rows.filter((r) => r.planKind === "household");
  return household.length > 0 ? household : rows.filter((r) => r.planKind !== "household");
}

/**
 * LES DEUX PLANS DE L'ÉLÈVE: celui d'aujourd'hui, et celui qu'il a préparé.
 *
 * ── CE QUI REMPLACE `loadLatestGeneratedMeal` ────────────────────────────
 * L'ancien chargeur prenait `order by created_at desc limit 1`: « le dernier
 * écrit gagne ». C'était le seul choix possible tant que la ligne ne portait pas
 * sa fenêtre — et ça devenait faux à la seconde où un élève préparait la semaine
 * suivante: le plan à venir aurait pris la place de celui qu'il suit ce soir.
 *
 * IL EST SUPPRIMÉ, PAS ALIASÉ. Une fonction encore appelée
 * `loadLatestGeneratedMeal` promettrait que la règle supprimée tient encore.
 *
 * ── LE TRI EST FAIT PAR `mealWindow`, PAS ICI ────────────────────────────
 * On rapatrie les lignes vivantes et `selectMealPlans` tranche. C'est le même
 * module, avec la même table de cas, que celui du moteur: deux définitions de
 * « courant » divergent au premier ajustement, et personne ne sait alors
 * laquelle ment.
 *
 * ÉCHOUE FORT. « Tu n'as pas de plan » et « on n'a pas pu le lire » sont deux
 * phrases différentes, et montrer la première pour la seconde inviterait
 * l'élève à en régénérer un par-dessus celui qui existe.
 */
export async function loadMealPlans(
  userId: string,
  today: string,
): Promise<{
  current: GeneratedMealResult | null;
  next: GeneratedMealResult | null;
  elapsed: GeneratedMealResult[];
}> {
  const result = await supabase
    .from("student_generated_meals")
    .select(MEAL_COLUMNS)
    .eq("user_id", userId)
    .is("retired_at", null)
    // Borne de coût, pas de sémantique: la contrainte d'exclusion garantit déjà
    // qu'au plus une fenêtre vivante contient un jour donné. Douze lignes
    // couvrent largement le courant, le suivant et les écoulés récents.
    .order("starts_on", { ascending: false })
    .limit(12);
  if (result.error) {
    throw new Error(`[keel/mealGeneration] load failed: ${result.error.message}`);
  }

  // D9 — ON NE TRIE QUE CE QU'ON CUISINE. Le filtre est AVANT `selectMealPlans`
  // et pas après: deux plans de natures différentes peuvent couvrir le même
  // jour, et « le courant » n'a de sens qu'une fois la nature tranchée.
  const rows = cookedPlans(((result.data ?? []) as unknown[]).map(readMealRow));
  const picked = selectMealPlans(rows, today);
  return {
    current: picked.current,
    next: picked.next,
    elapsed: picked.elapsed,
  };
}

/**
 * LES PLATS DU JOUR, séparés de ceux qui ne nomment aucun jour.
 *
 * `day: null` n'est pas une anomalie: la portée « un jour » produit des plats
 * sans jour nommé, et le modèle en produit aussi en portée « plusieurs jours »
 * quand il ne place pas. Les glisser dans la liste du jour ferait lire « c'est
 * pour aujourd'hui » à quelqu'un à qui personne ne l'a dit; les jeter ferait
 * disparaître un plat qu'on a composé pour lui. Ils sont donc mis à part —
 * même règle que `weekPlanDaySplit` sur l'autre source.
 *
 * Les plats des AUTRES jours ne sortent pas d'ici: c'est l'écran d'aujourd'hui,
 * et la semaine entière se lit sur `/app/plan`.
 */
export function dishDaySplit(
  dishes: readonly GeneratedDish[],
  day: DayToken,
): { today: GeneratedDish[]; anyDay: GeneratedDish[] } {
  const today: GeneratedDish[] = [];
  const anyDay: GeneratedDish[] = [];
  for (const dish of dishes) {
    if (!dish.day) anyDay.push(dish);
    else if (dish.day === day) today.push(dish);
  }
  return { today, anyDay };
}
