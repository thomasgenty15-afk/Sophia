// FF-062 C1 — LE REPAS D'UN CRÉNEAU DÉCLARÉ, côté client.
//
// ── CE QUE LE FRONT A À CONNAÎTRE DE CE CANAL, ET C'EST TOUT ──────────────
// Une seule chose: qu'un tap sur « Photo » NOMME un créneau, et que la photo
// qui suit doit le porter. Les deux autres options (« Décrire », « Passer »)
// partent au serveur comme n'importe quel bouton déterministe — le front n'a
// rien à en savoir.
//
// ⚠️ LE MIROIR DU JETON SERVEUR, ET LA COPIE EST ASSUMÉE. Le front est en
// Vite/TS et le back en Deno: aucun import n'est possible entre les deux
// runtimes. `slot_meal_ask.ts` porte l'original; `slotMeal.int.test.ts` lit ce
// fichier-là sur le disque et vérifie que les deux formes coïncident.

import { t } from "../i18n/t";

/** Le préfixe du jeton. Huitième vocabulaire, disjoint des sept autres. */
export const SLOT_MEAL_BUTTON_PREFIX = "KEEL_SLOTMEAL_";

/**
 * `KEEL_SLOTMEAL_<action>|<date>|<slot>`, ancré aux deux bouts.
 *
 * Le miroir exact de `parseSlotMealButton`. Un `startsWith` suffirait ici — les
 * huit préfixes sont disjoints — et c'est précisément pourquoi on ne l'écrit
 * pas: une charge tronquée par un client ancien passerait, et le créneau
 * qu'elle porte deviendrait `undefined` en aval.
 */
const SLOT_MEAL_PAYLOAD =
  /^KEEL_SLOTMEAL_(photo|describe|skip|mute|ate|notplanned)\|(\d{4}-\d{2}-\d{2})\|([a-z_]+)(?:\|[0-9a-f-]{36}@\d+(?:,\d+)*)?$/;

export interface SlotMealTap {
  /**
   * ⟳ `mute` REJOINT LES TROIS LE 2026-09-08 — le bouton qui éteint la question
   * par repas, présent sous CHAQUE bulle.
   *
   * ⛔ IL EST LU ICI MAIS L'ÉCRAN N'EN FAIT RIEN: le tap part au serveur comme
   * les trois autres, et c'est LUI qui écrit `profiles.slot_meal_ask_enabled`.
   * L'intercepter côté front ferait un réglage qui a l'air pris sans l'être —
   * et la question reviendrait au créneau suivant.
   *
   * Il est dans le miroir parce que ce miroir est la FORME du jeton, pas la
   * liste de ce que l'écran traite: un `mute` que la regex refuserait tomberait
   * en charge inconnue et n'atteindrait jamais le serveur.
   */
  action: "photo" | "describe" | "skip" | "mute" | "ate" | "notplanned";
  localDate: string;
  slot: string;
}

export function parseSlotMealButton(payload: string): SlotMealTap | null {
  const m = SLOT_MEAL_PAYLOAD.exec(String(payload ?? "").trim());
  if (!m) return null;
  return {
    action: m[1] as SlotMealTap["action"],
    localDate: m[2],
    slot: m[3],
  };
}

/**
 * Le créneau à FORCER sur la prochaine photo, ou `null`.
 *
 * ⚠️ SEULE L'ACTION « photo » ARME QUOI QUE CE SOIT. « Décrire » et « Passer »
 * rendent `null`: armer sur elles ferait porter le créneau du midi à une photo
 * envoyée trois heures plus tard pour une tout autre raison.
 */
export function forcedSlotFromPhotoTap(payload: string): string | null {
  const tap = parseSlotMealButton(payload);
  if (!tap || tap.action !== "photo") return null;
  // ⛔ SI ON NE SAIT PAS LE NOMMER, ON NE LE FORCE PAS. Le créneau forcé doit
  // s'AFFICHER (voir `forcedSlotLabel`); un jeton sans libellé produirait soit
  // un slug brut sous les yeux de l'élève, soit — pire — une contrainte
  // invisible qui range sa photo sans qu'il l'ait vue. Le repli est
  // l'inférence, qui annonce elle-même son verdict dans l'accusé.
  return forcedSlotLabel(tap.slot) === null ? null : tap.slot;
}

/**
 * LE NOM DU CRÉNEAU, DANS LE NAMESPACE `chat`.
 *
 * ⚠️ PAS `slotLabel` DE `api/labels.ts`, ET C'EST UNE CONTRAINTE D'ÉCRAN.
 * `/app/chat` ne déclare que `chat`, `app` et `shell` (`catalog.ts`), et
 * importer `labels.ts` y ferait entrer six namespaces d'un coup — `common`,
 * `when`, `amount`, `sentence`, `question`, `unit`. La couture des pages
 * (`pageSeams.int.test.ts`) le refuse, à raison: une page qui atteint le
 * vocabulaire des lignes d'engagement finit par en afficher.
 *
 * Les six noms sont donc écrits dans `chat.*`. C'est une duplication assumée
 * avec `slot.*`, et elle est bornée: le vocabulaire est FERMÉ (six moments), et
 * un septième rendrait `null` — donc pas de forçage du tout.
 */
const SLOT_NAME_KEYS = {
  breakfast: "chat.slotmeal.slot.breakfast",
  snack_am: "chat.slotmeal.slot.snack_am",
  lunch: "chat.slotmeal.slot.lunch",
  snack_pm: "chat.slotmeal.slot.snack_pm",
  dinner: "chat.slotmeal.slot.dinner",
  before_bed: "chat.slotmeal.slot.before_bed",
} as const;

/**
 * LES SIX MOMENTS, DANS L'ORDRE DE LA JOURNÉE.
 *
 * ⚠️ EXPORTÉS POUR LE GESTE « + », QUI DOIT LES OFFRIR TOUS. Le composeur ne
 * peut pas deviner de quel repas la personne parle: « décrire un repas non
 * prévu » sans choix de moment rangerait la déclaration au dernier créneau
 * écoulé, ce qui tombe juste par accident et faux dès qu'on répond le soir.
 * C'est la même raison qui met le créneau DANS le jeton de la question (R6).
 */
export const SLOT_ORDER = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;

export function forcedSlotLabel(slot: string): string | null {
  const key = SLOT_NAME_KEYS[slot as keyof typeof SLOT_NAME_KEYS];
  return key ? t(key) : null;
}

// ---------------------------------------------------------------------------
// L'INTERRUPTEUR — LE MIROIR DE `slotMealAskSwitchFrom`
// ---------------------------------------------------------------------------

/**
 * Les objectifs que la boucle par repas couvre. Jumeau de `SLOT_MEAL_GOALS`
 * (`_shared/keel/slot_meal_ask.ts`).
 *
 * ⚠️ LA DUPLICATION EST INÉVITABLE ET GARDÉE. Deno et le navigateur ne
 * partagent pas de module; recopier deux jetons l'est, les laisser diverger ne
 * l'est pas. `slotMealSwitch.int.test.ts` relit le module Deno sur le disque et
 * fait échouer la suite si les deux copies bougent séparément.
 */
export const SLOT_MEAL_GOALS = ["fat_loss", "muscle_gain"] as const;

export type SlotMealAskSwitchSource =
  | "explicit_on"
  | "explicit_off"
  | "goal"
  | "no_goal";

/**
 * ⛔ LA MÊME RÉDUCTION QUE LE SERVEUR, ET C'EST OBLIGATOIRE.
 *
 * L'écran lit `profiles` en direct: sans cette fonction, il faudrait soit
 * afficher la COLONNE (donc « éteint » à tous ceux qui n'ont jamais choisi —
 * la cicatrice `energySwitchFrom` mot pour mot), soit faire un aller-retour
 * serveur pour un booléen.
 *
 * `null` n'est PAS une extinction: l'objectif décide. `false` gagne pour
 * toujours — une extinction est un choix, un objectif une circonstance.
 */
export function slotMealAskSwitchFrom(args: {
  stored: boolean | null;
  goal: string | null;
}): { on: boolean; source: SlotMealAskSwitchSource } {
  if (args.stored === true) return { on: true, source: "explicit_on" };
  if (args.stored === false) return { on: false, source: "explicit_off" };
  const goal = String(args.goal ?? "").trim();
  if (!goal) return { on: false, source: "no_goal" };
  return {
    on: (SLOT_MEAL_GOALS as readonly string[]).includes(goal),
    source: "goal",
  };
}

/**
 * L'interrupteur A-T-IL LIEU D'ÊTRE OFFERT ?
 *
 * ⛔ IL NE DÉPEND PAS DE L'ÉTAT, IL DÉPEND DE L'OBJECTIF. Un réglage affiché
 * au-dessus d'une chose qui ne s'applique pas annonce à la personne une
 * fonctionnalité qu'on lui refuse — c'est la raison écrite de
 * `energySwitchesPlacement.int.test.ts`, et elle vaut ici.
 *
 * ⚠️ ET IL RESTE OFFERT À QUELQU'UN QUI A ÉTEINT: sinon l'interrupteur
 * disparaîtrait au moment exact où il sert à rallumer.
 */
export function slotMealSwitchOfferable(goal: string | null): boolean {
  const g = String(goal ?? "").trim();
  return (SLOT_MEAL_GOALS as readonly string[]).includes(g);
}
