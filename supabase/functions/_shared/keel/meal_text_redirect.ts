/**
 * LE REPAS TAPÉ DANS LE FIL — ON NE L'ÉCRIT PLUS EN DOUCE, ON REND LA MAIN.
 *
 * Décision produit du 2026-09-13.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUI SE PASSAIT AVANT, ET POURQUOI C'ÉTAIT LE PIRE DES TROIS CHEMINS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ce produit a trois façons de dire ce qu'on a mangé, et deux d'entre elles
 * marchent:
 *
 *   · la PHOTO      → `energy_estimate` avec sa base, créneau déduit de
 *                     l'heure et ANNONCÉ (`photo_slot_inference.ts`);
 *   · « Te dire »   → `analyzeJournalText` en tire un chiffre de base
 *                     `text_estimate`, au créneau que le bouton NOMME;
 *   · le TEXTE LIBRE tapé dans la conversation → `meal_declaration_floor.ts`
 *                     écrivait une ligne avec l'aliment, et RIEN D'AUTRE.
 *
 * Cette troisième ligne n'avait ni énergie (aucun appelant du chemin modèle
 * depuis le dispatcher) ni créneau (`slotKeyNamedIn` seul, et R5 de FF-017
 * interdit de lire l'horloge). Elle comptait donc pour zéro partout où le
 * produit compte quelque chose, tout en ayant l'air d'un repas enregistré.
 *
 * ⛔ ET C'EST LE GESTE LE PLUS NATUREL DU PRODUIT. Personne n'ouvre un menu
 * pour dire « j'ai mangé une pizza »: on le tape. Le chemin le plus emprunté
 * était le seul des trois à ne rien produire d'utilisable.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'ON FAIT À LA PLACE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * On rend la main avec les deux boutons qui, eux, aboutissent. Le tour
 * n'écrit rien du tout — ni ici, ni par le plancher, qui ne tourne plus sur
 * ce message (l'étape vit AVANT le modèle, dans `chat-inbound-v1`).
 *
 * ⛔ ZÉRO ÉCRITURE, ET C'EST LA MOITIÉ DE LA DÉCISION. Garder le fait « au cas
 * où » donnerait DEUX lignes pour un repas dès que la personne clique — celle
 * du plancher, muette, et celle du bouton, complète. C'est exactement la faute
 * que `deterministic_buttons.ts` évite déjà en refusant d'écrire sur un tap
 * « Photo » (« écrire ici en plus ferait DEUX lignes pour un seul repas »).
 *
 * ⛔ AUCUN NOUVEAU VOCABULAIRE DE BOUTON. Les deux jetons sont ceux de FF-062
 * C1 (`KEEL_SLOTMEAL_photo`, `KEEL_SLOTMEAL_describe`), fabriqués par
 * `slotMealButtonId` et lus par le gestionnaire qui existe déjà: « Te dire »
 * ouvre le champ de description au créneau du jeton, « Photo » force ce
 * créneau sur la photo suivante. Un neuvième préfixe aurait ajouté une
 * famille à `DETERMINISTIC_BUTTON_PREFIXES`, un lecteur, et une ligne à la
 * matrice de disjonction — pour deux boutons qui font déjà exactement ça.
 *
 * ⚠️ LES LIBELLÉS DISENT LE GESTE, ILS NE RÉPONDENT PAS À UNE QUESTION.
 * La question du soir dit « Photo » / « Te dire » parce qu'elle VIENT de
 * demander. Ici la personne a déjà écrit le repas: le bouton doit nommer
 * l'action (« Prendre une photo », « Écrire ton plat »). Les jetons, eux,
 * restent ceux de FF-062 C1.
 *
 * ── LE CRÉNEAU EST ANNONCÉ QUAND IL EST DÉDUIT, ET SEULEMENT ALORS ────────
 * Deux phrases, parce que ce ne sont pas deux fois la même situation. Quand
 * la personne a NOMMÉ son repas (« ce midi »), le créneau vient de ses mots:
 * le lui répéter avec une porte de correction laisserait croire qu'on a
 * deviné. Quand il vient de l'heure, la porte est OBLIGATOIRE — c'est §3.3bis
 * (« hypothèse annoncée + porte de correction »), et c'est la seule chose qui
 * autorise ce dépôt à lire une horloge.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire.
 */

import { type LocalePackKey, localePackKey } from "./locale.ts";
import type { EatingOccasion } from "./meal_generation.ts";
import { slotMealButtonId, SLOT_MEAL_COPY_PACKS } from "./slot_meal_ask.ts";
import {
  detectDeclaredMeal,
  type MealDeclarationGate,
  mealDeclarationGateOf,
} from "./meal_declaration_floor.ts";

/** Pourquoi on ne rend PAS la main. Vocabulaire fermé, journalisable. */
export const MEAL_REDIRECT_SKIPS = [
  /** Le message pose une question: elle se répond. */
  "question",
  /** Le plancher n'a vu aucune déclaration de repas (désarmes comprises). */
  "gate_closed",
  /** Porte faible — groupe nominal + créneau, sans aucun aliment reconnu. */
  "no_food_named",
] as const;
export type MealRedirectSkip = (typeof MEAL_REDIRECT_SKIPS)[number];

export type MealRedirectVerdict =
  | { redirect: true; gate: MealDeclarationGate }
  | { redirect: false; reason: MealRedirectSkip };

/**
 * « Quelqu'un vient-il de dire qu'il a mangé, et faut-il lui rendre la main ? »
 *
 * ── ⛔ UNE QUESTION SE RÉPOND. ELLE NE SE REDIRIGE PAS. ───────────────────
 * Cette lane REMPLACE la réponse. Rendre deux boutons à « j'ai mangé une
 * pizza, c'est grave ? » laisserait la question sans réponse, et c'est le seul
 * dégât que ce lot peut faire à une conversation.
 *
 * ⚠️ LE TEST PORTE SUR LE TEXTE BRUT, ET IL LE FAUT — LE PLANCHER, LUI, NE
 * PEUT PAS. `DISARM` porte bien un `/\?/`, mais il s'exécute APRÈS
 * `normalize()`, qui écrase tout ce qui n'est pas `[a-z0-9\s]`. Le point
 * d'interrogation a donc déjà disparu quand ce motif est évalué: il ne peut
 * pas mordre. Vérifié le 2026-09-13 —
 * `detectDeclaredMeal("j'ai mangé du poulet, c'est grave ?")` rend un fait
 * `poultry`. Ce défaut-là appartient au plancher et n'est PAS corrigé ici:
 * le réparer changerait ce qui s'ÉCRIT, et c'est un autre sujet. Les autres
 * désarmes de question (`what`, `should i`, `est ce que`…) sont lexicaux et
 * fonctionnent, eux; ce filet ne couvre que la ponctuation.
 *
 * ── LA PORTE DU PLANCHER, MAIS PAS SON LEXIQUE ───────────────────────────
 * Voir `mealDeclarationGateOf`: le lexique fermé existe pour ÉCRIRE sans
 * inventer d'aliment, et rendre la main n'écrit rien. Mesuré le 2026-09-13,
 * « j'ai mangé une pizza » — l'exemple même du geste à rattraper — rend `null`
 * chez `detectDeclaredMeal` parce que « pizza » n'est dans aucune entrée.
 *
 * ⛔ SAUF SUR LA PLUS FAIBLE DES TROIS PORTES. `noun_phrase_with_slot`
 * s'ouvre sur un groupe nominal accompagné d'un créneau, SANS le moindre verbe
 * de repas: « j'ai eu une réunion à midi » la franchit. Sur celle-là, et sur
 * elle seule, on redemande au plancher complet — un aliment reconnu est alors
 * la preuve qu'on parle bien de manger. Les deux autres portent leur propre
 * verbe au passé (« j'ai mangé », « j'ai commandé »): elles se suffisent.
 */
export function typedMealNeedsRedirect(
  text: unknown,
  slotNamed: string | null = null,
): MealRedirectVerdict {
  const raw = String(text ?? "");
  if (/[?？]/.test(raw)) return { redirect: false, reason: "question" };

  const opened = mealDeclarationGateOf(raw, slotNamed);
  if (!opened) return { redirect: false, reason: "gate_closed" };

  if (
    opened.gate === "noun_phrase_with_slot" &&
    !detectDeclaredMeal(raw, slotNamed)
  ) {
    return { redirect: false, reason: "no_food_named" };
  }
  return { redirect: true, gate: opened.gate };
}

/**
 * L'étiquette de la bulle. Elle sert au diagnostic et au ledger.
 *
 * ⚠️ DISTINCTE DE `SLOT_MEAL_PURPOSE`, ET ELLE DOIT LE RESTER.
 * `slotsAskedToday` compte les créneaux déjà interrogés AUJOURD'HUI en
 * relisant les bulles portant ce purpose-là, pour ne pas reposer la question
 * du soir deux fois. Partager l'étiquette ferait qu'une personne qui tape
 * « j'ai mangé une pizza » à midi ne recevrait plus la question proactive de
 * son déjeuner — alors qu'elle n'y a précisément jamais répondu.
 */
export const MEAL_TEXT_REDIRECT_PURPOSE = "keel_meal_text_redirect";

const COPY: Record<LocalePackKey, {
  /** Le créneau vient de l'HEURE: on l'annonce et on ouvre la porte. */
  inferred: (slot: string) => string;
  /** Le créneau vient des MOTS de la personne: rien à annoncer. */
  named: (slot: string) => string;
  /**
   * ⚠️ PAS CEUX DE LA QUESTION DU SOIR. Là-bas, « Photo » / « Te dire »
   * RÉPONDENT à une question déjà posée. Ici la personne vient d'écrire un
   * repas dans le fil: le bouton doit DIRE LE GESTE, pas le raccourcir.
   * Les jetons, eux, restent `KEEL_SLOTMEAL_photo` / `_describe`.
   */
  photo: string;
  describe: string;
}> = {
  en: {
    inferred: (slot) =>
      `I can count that toward ${slot} — but without the detail I have ` +
      `neither the amounts nor the calories. Take a photo, or write out ` +
      `the dish. Tell me if it was another meal.`,
    named: (slot) =>
      `I can count that toward ${slot} — but without the detail I have ` +
      `neither the amounts nor the calories. Take a photo, or write out ` +
      `the dish.`,
    photo: "Take a photo",
    describe: "Write your dish",
  },
  fr: {
    inferred: (slot) =>
      `Je peux le compter pour ${slot} — mais sans le détail, je n'ai ni les ` +
      `quantités ni les calories. Prends une photo, ou écris ton plat. ` +
      `Si c'était un autre repas, dis-le-moi.`,
    named: (slot) =>
      `Je peux le compter pour ${slot} — mais sans le détail, je n'ai ni les ` +
      `quantités ni les calories. Prends une photo, ou écris ton plat.`,
    photo: "Prendre une photo",
    describe: "Écrire ton plat",
  },
};

export interface MealTextRedirect {
  body: string;
  buttons: Array<{ payload: string; label: string }>;
}

/**
 * La bulle qui remplace la réponse, et ses deux boutons.
 *
 * @param slotInferred `true` quand le créneau vient de l'heure plutôt que des
 *   mots de la personne. REQUIS: un défaut ferait taire la porte de
 *   correction sur une déduction, c'est-à-dire produirait la déduction
 *   silencieuse que ce dépôt refuse depuis le début.
 */
export function renderMealTextRedirect(args: {
  locale: string;
  localDate: string;
  slot: EatingOccasion;
  slotInferred: boolean;
}): MealTextRedirect {
  if (typeof args.slotInferred !== "boolean") {
    throw new Error(
      "[keel/meal_text_redirect] `slotInferred` est REQUIS: sans lui, un " +
        "créneau déduit de l'horloge partirait sans sa porte de correction.",
    );
  }
  const pack = localePackKey(String(args.locale ?? ""));
  const copy = COPY[pack];
  const slotName = SLOT_MEAL_COPY_PACKS[pack].slotName[args.slot];
  const mk = (action: "photo" | "describe") =>
    slotMealButtonId({
      action,
      localDate: args.localDate,
      slot: args.slot,
    });

  return {
    body: args.slotInferred ? copy.inferred(slotName) : copy.named(slotName),
    // ⛔ DEUX BOUTONS, ET PAS DE « PASSER ». La question du soir en a un parce
    // qu'elle est PARTIE TOUTE SEULE: ne pas y répondre doit être un geste
    // possible. Ici c'est la personne qui a ouvert le sujet — lui offrir de
    // le refermer serait lui proposer d'annuler ce qu'elle vient d'écrire.
    // Elle peut toujours ne rien taper: la bulle n'attend rien.
    buttons: [
      { payload: mk("photo"), label: copy.photo },
      { payload: mk("describe"), label: copy.describe },
    ],
  };
}
