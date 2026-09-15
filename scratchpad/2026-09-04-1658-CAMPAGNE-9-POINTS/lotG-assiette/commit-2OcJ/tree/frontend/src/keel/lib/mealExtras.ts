/**
 * CE QU'UNE BOUCHE PREND À CÔTÉ DU PLAT — LE MIROIR D'ÉCRAN. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE FICHIER EST UN MIROIR, ET C'EST SA SEULE RAISON D'EXISTER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'autorité est `supabase/functions/_shared/keel/meal_extras.ts`: c'est elle
 * qui décide combien vaut un pain et quel moment porte des extras. Ici on ne
 * décide RIEN — on nomme les mêmes jetons pour pouvoir les afficher.
 *
 * ⚠️ LE PRIX EST PAYÉ PAR UN TEST, ET IL NE DOIT PAS ÊTRE SUPPRIMÉ:
 * `mealExtrasMirror.int.test.ts` relit le module Deno sur le disque et compare
 * les deux listes. Une constante recopiée sans épreuve d'égalité diverge au
 * premier ajout — le dépôt l'a déjà mesuré sur `hasFreezerDeclared`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LES TROIS ÉTATS D'UN MOMENT, ET DEUX APPARENCES SEULEMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une bulle éteinte n'est PAS « non ». C'est la cicatrice « coche auto = faits
 * faux indémentables », et elle mord ici dans le sens qui SUR-NOURRIT:
 *
 *   · la clé du moment est ABSENTE  → personne n'a demandé. Le moteur retire
 *     `UNANSWERED_EXTRAS_SHARE` (58 %) du repas, comme avant ce lot.
 *   · la clé vaut `[]`             → on a demandé, et il n'y a rien à côté.
 *     Le plat porte alors 100 % du repas — deux fois et demie la part d'une
 *     fiche muette.
 *   · la clé porte des jetons      → ce qui est pris à côté, nommé.
 *
 * Les deux derniers ont la MÊME apparence: cinq bulles éteintes. Ce qui les
 * sépare est la présence de la clé, écrite au premier clic sur une bulle de ce
 * moment — voir `toggleExtra`.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * LES CINQ, DANS L'ORDRE OÙ ILS S'AFFICHENT.
 *
 * ⚠️ L'ORDRE EST CELUI DE L'ÉCRAN, PAS CELUI DU MOTEUR. `MEAL_EXTRAS` côté
 * Deno est une liste de jetons dont l'ordre ne veut rien dire; ici il décide
 * la rangée de bulles, et il va du plus fréquent au moins fréquent. Le miroir
 * compare donc les ENSEMBLES, jamais les tableaux.
 */
export const MEAL_EXTRAS = [
  "bread",
  "cheese",
  "yoghurt",
  "fruit",
  "dessert",
] as const;
export type MealExtra = (typeof MEAL_EXTRAS)[number];

/**
 * LES MOMENTS QUI PORTENT DES BULLES — DEUX, ET PAS SIX.
 *
 * Ailleurs (petit-déjeuner, collations), le plan compose TOUT ce qui a été
 * déclaré: « chocolat chaud + tartines l'après-midi » devient le contenu du
 * moment. Y afficher des bulles demanderait de retrancher une seconde fois ce
 * qui est déjà dans l'assiette.
 */
export const EXTRA_BEARING_SLOTS = ["lunch", "dinner"] as const;
export type ExtraBearingSlot = (typeof EXTRA_BEARING_SLOTS)[number];

export function slotBearsExtras(slot: string): boolean {
  return (EXTRA_BEARING_SLOTS as readonly string[]).includes(slot);
}

/** Ce que le brouillon porte: une clé par moment RÉPONDU. */
export type ExtrasDraft = Readonly<Record<string, readonly MealExtra[]>>;

/** Ce moment a-t-il été répondu ? (la clé, pas son contenu) */
export function slotAnswered(draft: ExtrasDraft, slot: string): boolean {
  return Object.prototype.hasOwnProperty.call(draft, slot);
}

/**
 * ALLUMER OU ÉTEINDRE UNE BULLE.
 *
 * ⛔ LE PREMIER CLIC ÉCRIT LA CLÉ, ET C'EST LUI QUI REND « RIEN » EXPRIMABLE.
 * Sans ça, allumer puis éteindre reviendrait à l'état d'avant et personne ne
 * pourrait jamais dire « j'ai regardé, je ne prends rien à côté ». La clé,
 * une fois posée, ne repart pas — même vide.
 */
export function toggleExtra(
  draft: ExtrasDraft,
  slot: string,
  extra: MealExtra,
): ExtrasDraft {
  const current = draft[slot] ?? [];
  const next = current.includes(extra)
    ? current.filter((e) => e !== extra)
    // L'ORDRE D'AFFICHAGE, PAS L'ORDRE DE CLIC. Deux fiches identiques doivent
    // produire le même tableau, sinon le comparateur de brouillon les croit
    // différentes et le bouton « enregistrer » s'allume pour rien.
    : MEAL_EXTRAS.filter((e) => current.includes(e) || e === extra);
  return { ...draft, [slot]: next };
}

/**
 * CE QUI PART EN BASE, FUSIONNÉ AVEC LA PROSE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI `household_dish` APPARAÎT ICI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `keel_household_set_member_habits` REFUSE une entrée `own_usual` dont le
 * `usual` est vide, et elle a raison: « elle mange autre chose » sans dire
 * quoi fait INVENTER le modèle. Une entrée qui ne porte QUE des extras est
 * exactement ce cas-là — il n'y a pas de prose à donner.
 *
 * Elle part donc en `household_dish`, et c'est la vérité littérale: « à ce
 * moment-là, elle mange le plat de la maison, plus du pain à côté ». Aucun
 * fragment de prompt n'en sort (`parseMemberHabits` écarte `household_dish`),
 * et `parseMemberExtras` la lit quand même — les deux parseurs sont séparés
 * pour cette raison précise.
 *
 * ⚠️ LA PROSE GAGNE SUR LE `kind`. Un moment qui a les deux part en
 * `own_usual` AVEC ses extras: rétrograder en `household_dish` perdrait la
 * phrase que quelqu'un a écrite.
 */
export function habitEntriesToWrite(input: {
  /** Une ligne libre par moment. Le vide n'est pas une habitude. */
  habits: Readonly<Record<string, string>>;
  extras: ExtrasDraft;
  /** L'ordre des moments, pour que deux fiches identiques s'écrivent pareil. */
  occasions: readonly string[];
}): Array<
  { slot: string; kind: "own_usual" | "household_dish"; usual: string } & {
    extras?: MealExtra[];
  }
> {
  const out: Array<
    { slot: string; kind: "own_usual" | "household_dish"; usual: string } & {
      extras?: MealExtra[];
    }
  > = [];
  for (const slot of input.occasions) {
    const usual = (input.habits[slot] ?? "").trim();
    const answered = slotAnswered(input.extras, slot) && slotBearsExtras(slot);
    if (usual === "" && !answered) continue;
    const entry: {
      slot: string;
      kind: "own_usual" | "household_dish";
      usual: string;
      extras?: MealExtra[];
    } = usual === ""
      ? { slot, kind: "household_dish", usual: "" }
      : { slot, kind: "own_usual", usual };
    // ⛔ LA CLÉ N'EST POSÉE QUE SI ELLE A ÉTÉ RÉPONDUE. La poser partout ferait
    // dire « rien à côté » à cinq moments que personne n'a regardés.
    if (answered) entry.extras = [...(input.extras[slot] ?? [])];
    out.push(entry);
  }
  return out;
}

/**
 * CE QUE LA BASE REND, RELU EN BROUILLON.
 *
 * ⚠️ SÉPARÉ DE `parseHabitSlots`, et c'est le même partage qu'au serveur:
 * celui-là jette les entrées `household_dish` (elles ne disent rien au modèle),
 * or ce sont précisément celles qui portent des extras sans prose. Les fondre
 * perdrait la réponse la plus fréquente.
 *
 * ⚠️ UNE ENTRÉE SANS LA CLÉ `extras` N'EST PAS UNE RÉPONSE. Toute la base
 * d'avant ce lot est dans ce cas, et elle doit rester « pas demandé ».
 */
export function parseHabitExtras(raw: unknown): Record<string, MealExtra[]> {
  if (!Array.isArray(raw)) return {};
  const out: Record<string, MealExtra[]> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!slotBearsExtras(slot)) continue;
    // Le PREMIER gagne, comme partout ailleurs dans ce dépôt.
    if (Object.prototype.hasOwnProperty.call(out, slot)) continue;
    if (!Object.prototype.hasOwnProperty.call(e, "extras")) continue;
    if (!Array.isArray(e.extras)) continue;
    const kept: MealExtra[] = [];
    for (const item of e.extras) {
      const token = String(item ?? "").trim().toLowerCase();
      if (!(MEAL_EXTRAS as readonly string[]).includes(token)) continue;
      if (kept.includes(token as MealExtra)) continue;
      kept.push(token as MealExtra);
    }
    out[slot] = MEAL_EXTRAS.filter((e2) => kept.includes(e2));
  }
  return out;
}
