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
  /^KEEL_SLOTMEAL_(photo|describe|skip|mute)\|(\d{4}-\d{2}-\d{2})\|([a-z_]+)$/;

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
  action: "photo" | "describe" | "skip" | "mute";
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

export function forcedSlotLabel(slot: string): string | null {
  const key = SLOT_NAME_KEYS[slot as keyof typeof SLOT_NAME_KEYS];
  return key ? t(key) : null;
}
