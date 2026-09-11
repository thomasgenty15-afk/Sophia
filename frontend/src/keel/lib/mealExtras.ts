/**
 * CE QU'UN MOMENT PORTE, CÔTÉ ÉCRAN — LE MIROIR. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — LES EXTRAS SONT SUPPRIMÉS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ DÉCISION PRODUIT: **le plan dimensionne les aliments qu'il prévoit.** Il ne
 * réserve plus d'énergie pour des accompagnements personnels hors plan. Les
 * cinq bulles (`bread / cheese / yoghurt / fruit / dessert`) posées sous le
 * déjeuner et le dîner, `MEAL_EXTRAS`, `EXTRA_BEARING_SLOTS`, `toggleExtra`,
 * `slotAnswered` et `parseHabitExtras` partent avec elles.
 *
 * ⚠️ LES RÉPONSES DÉJÀ ÉCRITES RESTENT EN BASE et ne sont effacées par
 * personne: plus rien ne les lit, ni l'écran, ni le moteur, ni le prompt.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE FICHIER EST UN MIROIR, ET C'EST SA SEULE RAISON D'EXISTER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'autorité est `supabase/functions/_shared/keel/meal_extras.ts`: c'est elle
 * qui décide quel moment peut être marqué « léger ». Ici on ne décide RIEN —
 * on nomme les mêmes jetons pour pouvoir les afficher.
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
 * faux indémentables », et elle vaut encore pour « + repas léger »:
 *
 *   · la clé du moment est ABSENTE  → personne n'a demandé;
 *   · la clé vaut `false`           → on a demandé, ce moment est ordinaire;
 *   · la clé vaut `true`            → il pèse moins que d'habitude.
 *
 * Les deux premiers ont la MÊME apparence: une bulle éteinte. Ce qui les
 * sépare est la présence de la clé, écrite au premier clic — voir `toggleLight`.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * LES MOMENTS QUI PEUVENT ÊTRE MARQUÉS « LÉGER » — 2026-09-07.
 *
 * ⛔ TROIS, ET CE N'EST PAS LA MÊME LISTE QUE LES EXTRAS. Les deux se
 * ressemblent et répondent à deux questions opposées:
 *   · les EXTRAS demandent « qu'est-ce qui arrive À CÔTÉ du plat » — seuls le
 *     déjeuner et le dîner en portent;
 *   · le LÉGER demande « ce moment pèse-t-il moins que d'habitude » — il a un
 *     sens partout où le plan compose un vrai repas, petit-déjeuner compris.
 *
 * ⚠️ LES COLLATIONS EN SONT EXCLUES POUR UNE RAISON ARITHMÉTIQUE: une collation
 * pèse déjà 0,10 de la journée; la marquer légère demanderait au plan de
 * composer ~40 kcal — c'est-à-dire rien, servi comme une décision. « Je ne
 * prends pas de goûter » se dit en ne DÉCLARANT pas le goûter.
 *
 * ⛔ CETTE LISTE DOIT ÊTRE IDENTIQUE à `LIGHT_BEARING_SLOTS` du moteur
 * (`_shared/keel/meal_extras.ts`) et aux clés de `LIGHT_SLOT_WEIGHT`
 * (`mouth_anchor.ts`). Un test de miroir les compare: un moment marquable sans
 * poids serait une case qui ne fait rien, un poids sans case un poids que rien
 * n'atteint.
 */
export const LIGHT_BEARING_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type LightBearingSlot = (typeof LIGHT_BEARING_SLOTS)[number];

export function slotBearsLight(slot: string): boolean {
  return (LIGHT_BEARING_SLOTS as readonly string[]).includes(slot);
}

/**
 * LE BROUILLON DU LÉGER — une clé par moment RÉPONDU, et sa réponse.
 *
 * ⛔ `Record<string, boolean>` ET PAS UNE LISTE. Une liste de moments légers
 * perdrait le `false`, donc perdrait « répondu non » — et l'écran reposerait la
 * question à quelqu'un qui a déjà répondu. Trois états: clé absente (pas posé),
 * `false` (posé, non), `true` (posé, oui).
 */
export type LightDraft = Readonly<Record<string, boolean>>;

/** Ce moment a-t-il été répondu ? (la clé, pas sa valeur) */
export function lightAnswered(draft: LightDraft, slot: string): boolean {
  return Object.prototype.hasOwnProperty.call(draft, slot);
}

/**
 * ALLUMER OU ÉTEINDRE « + REPAS LÉGER ».
 *
 * ⛔ LA CLÉ, UNE FOIS POSÉE, NE REPART JAMAIS — exactement comme `toggleExtra`.
 * Premier clic ⇒ `true`, second ⇒ `false`. Sans ça, allumer puis éteindre
 * reviendrait à l'état d'avant, et personne ne pourrait dire « j'ai regardé, ce
 * moment est comme d'habitude ».
 */
export function toggleLight(draft: LightDraft, slot: string): LightDraft {
  return { ...draft, [slot]: !(draft[slot] === true) };
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
 * quoi fait INVENTER le modèle. Une entrée qui ne porte QUE un « repas léger »
 * est exactement ce cas-là — il n'y a pas de prose à donner.
 *
 * Elle part donc en `household_dish`, et c'est la vérité littérale: « à ce
 * moment-là, elle mange le plat de la maison, en plus petit ». Aucun fragment
 * de prompt n'en sort (`parseMemberHabits` écarte `household_dish`), et
 * `parseMemberLight` la lit quand même — les deux parseurs sont séparés pour
 * cette raison précise.
 *
 * ⚠️ LA PROSE GAGNE SUR LE `kind`. Un moment qui a les deux part en
 * `own_usual` AVEC son `light`: rétrograder en `household_dish` perdrait la
 * phrase que quelqu'un a écrite.
 */
export function habitEntriesToWrite(input: {
  /** Une ligne libre par moment. Le vide n'est pas une habitude. */
  habits: Readonly<Record<string, string>>;
  /**
   * ⟳ 2026-09-07 — LE LÉGER, REQUIS ET JAMAIS `?`.
   *
   * ⛔ Cette fonction est le SEUL sérialiseur des habitudes: tout ce qui n'y
   * entre pas n'atteint jamais la base. Un champ facultatif aurait fait perdre
   * la réponse à chaque appelant qui l'oublie — et l'écran aurait montré une
   * bulle allumée que personne n'aurait enregistrée.
   */
  light: LightDraft;
  /** L'ordre des moments, pour que deux fiches identiques s'écrivent pareil. */
  occasions: readonly string[];
}): Array<
  { slot: string; kind: "own_usual" | "household_dish"; usual: string } & {
    light?: boolean;
  }
> {
  const out: Array<
    { slot: string; kind: "own_usual" | "household_dish"; usual: string } & {
      light?: boolean;
    }
  > = [];
  for (const slot of input.occasions) {
    const usual = (input.habits[slot] ?? "").trim();
    const lightSaid = lightAnswered(input.light, slot) && slotBearsLight(slot);
    // ⚠️ DEUX RAISONS DE SORTIR: une entrée existe dès qu'UNE des deux
    // questions a une réponse. Un moment dont SEUL le léger est répondu doit
    // s'écrire, sinon la réponse se perd entre l'écran et la base.
    if (usual === "" && !lightSaid) continue;
    const entry: {
      slot: string;
      kind: "own_usual" | "household_dish";
      usual: string;
      light?: boolean;
    } = usual === ""
      ? { slot, kind: "household_dish", usual: "" }
      : { slot, kind: "own_usual", usual };
    // ⛔ LA CLÉ N'EST POSÉE QUE SI ELLE A ÉTÉ RÉPONDUE, et la contrainte SQL
    // refuse la clé sur un moment qui ne la porte pas: la lecture, l'écriture
    // et la base doivent refuser la même chose, sinon la plus permissive des
    // trois décide.
    if (lightSaid) entry.light = input.light[slot] === true;
    out.push(entry);
  }
  return out;
}

/**
 * CE QUE LA BASE REND POUR LE LÉGER, RELU EN BROUILLON.
 *
 * ⚠️ UNE ENTRÉE SANS LA CLÉ `light` n'est pas une réponse, et toute la base d'avant ce lot est dans ce cas — elle
 * doit rester « pas demandé ». Seul un vrai booléen compte: `"yes"`, `1` et
 * `"true"` sont écartés ici comme la contrainte SQL les refuse.
 */
export function parseHabitLight(raw: unknown): Record<string, boolean> {
  if (!Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!slotBearsLight(slot)) continue;
    // Le PREMIER gagne, comme partout ailleurs dans ce dépôt.
    if (Object.prototype.hasOwnProperty.call(out, slot)) continue;
    if (!Object.prototype.hasOwnProperty.call(e, "light")) continue;
    if (typeof e.light !== "boolean") continue;
    out[slot] = e.light;
  }
  return out;
}
