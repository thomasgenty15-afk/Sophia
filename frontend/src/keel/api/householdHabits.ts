// KEEL — CE QUE CHAQUE BOUCHE MANGE D'HABITUDE, côté écran.
//
// Autorité: `scratchpad/SPEC-HABITUDES-ET-FORME-DE-CUISSON-20260814.md`, §B2,
// §B3, §G1, §G2 et §H. Le moteur est LOT G; ce fichier ne fait que porter le
// contrat jusqu'à l'écran.
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
//
// Une bouche SANS COMPTE n'avait aucun endroit où dire ce qu'elle mange:
// `food_preferences` est clé sur `user_id`, et une bouche sans compte n'en a
// pas. Le produit savait d'elle prénom, naissance, objectif, absences, moments,
// allergies et corps — RIEN sur ce qu'elle mange. Un plan réel a servi des œufs
// brouillés sept matins d'affilée à une femme qui mange une pomme. Le plan n'a
// pas ignoré son habitude: personne ne la lui avait demandée.
//
// ── CE QUE CE N'EST PAS, ET IL FAUT QUE ÇA LE RESTE ────────────────────────
//
// Ce n'est PAS `fixed_intakes`. Cette forme-là exige un `food_ref` résolu
// contre `food_composition_refs` ET une quantité (`amount` + `unit`). « Une
// pomme le matin » n'a ni l'un ni l'autre, et lui en inventer écrirait un fait
// que personne n'a pesé. Les deux répondent à deux questions: `fixed_intakes`
// dit UNE QUANTITÉ QUI REMPLACE UN REPAS, une habitude dit UNE TENDANCE QUE LA
// COMPOSITION CONTOURNE.

import { supabase } from "../../lib/supabase";
import { EATING_OCCASIONS, type EatingOccasion } from "./mealGeneration";
import { habitEntriesToWrite, parseHabitLight } from "../lib/mealExtras";
// ⚠️ LE PLAFOND DE TEXTE EST CELUI DU SERVEUR, IMPORTÉ TEL QUEL — même geste
// que `household.ts` avec `student_age.ts`, et `groceryWaves.ts` avec son
// module partagé. `usual` et `note` passent tous deux par
// `_shared/keel/plan_draft_note.ts` (spec §G3): une seconde constante ici
// divergerait au premier ajustement, et c'est l'écran qui aurait raison contre
// la base — donc un refus que l'utilisateur ne peut pas anticiper.
import { DRAFT_NOTE_MAX_CHARS } from "../../../../supabase/functions/_shared/keel/plan_draft_note.ts";

export { DRAFT_NOTE_MAX_CHARS };

/**
 * CE QU'UNE BOUCHE PEUT DIRE D'UN MOMENT — liste FERMÉE (spec §G1).
 *
 * `household_dish` est le DÉFAUT et ne s'écrit PAS: la table ne porte qu'une
 * entrée par moment où la personne ne mange PAS le plat de la maison. Le jeton
 * existe quand même parce que l'écran doit pouvoir représenter le choix
 * explicite « elle mange ce que la maison cuisine » — mais il se traduit par
 * une ABSENCE dans `slots`, jamais par une ligne.
 */
export const HABIT_KINDS = ["household_dish", "own_usual"] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

/** Un moment où la personne mange autre chose, dit en toutes lettres. */
export interface HabitSlot {
  slot: EatingOccasion;
  /** Toujours `own_usual` en base. Voir `HABIT_KINDS`. */
  kind: "own_usual";
  /** « une pomme ». Non vide — la base refuse le vide (`bad_slots`). */
  usual: string;
}

/**
 * CE QUI PART EN BASE, ET CE N'EST PAS `HabitSlot`.
 *
 * ⛔ DEUX TYPES POUR UNE MÊME COLONNE, ET C'EST VOULU. `HabitSlot` décrit ce
 * que l'ÉCRAN AFFICHE — une phrase, donc `own_usual` obligatoire. Une entrée
 * qui ne porte qu'un « repas léger » (« le plat de la maison, en plus petit »)
 * n'a aucune phrase, part en `household_dish`, et `parseHabitSlots` la jette
 * exprès. Elle existe pourtant en base, et `parseHabitLight` la lit.
 *
 * Fondre les deux ferait porter à `HabitSlot` un `usual` vide, que la moitié
 * des lecteurs d'écran rendrait comme une ligne blanche.
 */
export interface HabitSlotWrite {
  slot: string;
  kind: HabitKind;
  usual: string;
  /**
   * ⟳ 2026-09-07 — « + repas léger ». FACULTATIF au sens du protocole: la clé
   * ABSENTE veut dire « la question n'a pas été posée à ce moment-là », et
   * c'est un état distinct de `false`. La contrainte SQL le refuse hors des
   * trois repas.
   */
  light?: boolean;
}

/**
 * LA LIGNE D'UNE BOUCHE. Son EXISTENCE est le fait qui compte.
 *
 * ⚠️ PAS DE LIGNE ≠ « ELLE MANGE COMME TOUT LE MONDE ». Pas de ligne veut dire
 * PERSONNE N'A RIEN DIT, et l'écran doit le rendre comme tel: rien de coché.
 * C'est la cicatrice `auto-tick-writes-undeniable-false-facts` — une coche
 * automatique écrit un fait faux que l'utilisateur ne peut pas démentir, et
 * c'est le motif pour lequel une fonctionnalité entière a été refusée ici.
 */
export interface MemberHabitsView {
  memberId: string;
  /** Les moments où elle a SON habitude. Vide = elle mange le plat commun. */
  slots: HabitSlot[];
  /**
   * ⟳ 2026-09-07 — « + repas léger », LU SUR LA MÊME COLONNE que la prose.
   *
   * ⛔ À CÔTÉ DE `slots`, PAS DEDANS, et c'est le même partage qu'au serveur
   * (`parseMemberHabits` / `parseMemberLight`): `parseHabitSlots` JETTE les
   * entrées `household_dish`, or ce sont précisément celles qui portent un
   * « léger » sans prose.
   *
   * ⚠️ Trois états, et ils ne se confondent pas: clé absente = la question
   * n'a pas été posée à ce moment-là; `false` = posée, réponse non; `true` =
   * ce moment pèse moins. L'écran doit les distinguer, sinon il repose la
   * question à quelqu'un qui a déjà répondu.
   */
  light: Record<string, boolean>;
  /** La ligne libre durable, ou `null`. */
  note: string | null;
}

/**
 * LES ENTRÉES DE `slots`, RELUES AVEC LE VOCABULAIRE FERMÉ DU MOTEUR.
 *
 * ÉCARTER PLUTÔT QUE DEVINER, et pour la raison des deux `parseEatingRhythm`:
 * une entrée illisible qu'on « répare » ferait dire à l'écran autre chose que
 * ce avec quoi la composition a tourné. Un moment inconnu, un `kind` hors
 * liste, un `usual` vide — on jette. Un moment vu deux fois: la PREMIÈRE
 * gagne, comme partout ailleurs dans ce dépôt.
 *
 * L'ordre de sortie est celui de LA JOURNÉE, jamais celui de la saisie.
 */
export function parseHabitSlots(raw: unknown): HabitSlot[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    // `household_dish` n'est pas une ligne: si jamais il en arrive une, elle ne
    // dit rien de plus que son absence. On la jette plutôt que d'inventer un
    // troisième état que l'écran devrait ensuite afficher.
    if (String(e.kind ?? "").trim().toLowerCase() !== "own_usual") continue;
    const usual = String(e.usual ?? "").trim();
    if (usual.length === 0) continue;
    if (bySlot.has(slot as EatingOccasion)) continue;
    bySlot.set(slot as EatingOccasion, usual);
  }
  return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => ({
    slot: s,
    kind: "own_usual" as const,
    usual: bySlot.get(s)!,
  }));
}

/**
 * LA NOTE, relue. `null` quand il n'y a rien — jamais la chaîne vide.
 *
 * La base refuse le vide (`bad_note`, 1..280), donc une chaîne vide en lecture
 * ne peut venir que d'une ligne écrite avant la contrainte ou d'un `trim` qui
 * la vide. Les deux se lisent « rien de dit », et c'est `null` qui le dit.
 */
export function parseHabitNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text.length > 0 ? text : null;
}

/**
 * LES HABITUDES DU FOYER — par `member_id`.
 *
 * ⚠️ CE N'EST PAS UNE LECTURE DE TABLE, ET C'EST VOULU. Discipline de table
 * neuve (spec §G1): `revoke all on public.household_member_habits from anon,
 * authenticated`. La table est donc INVISIBLE à PostgREST, exactement comme
 * `household_member_bodies` — un `.from("household_member_habits")` rendrait
 * une erreur de permission, pas des lignes.
 *
 * ⚠️ LE NOM EST CELUI DE LOT G, VÉRIFIÉ CONTRE LA BASE, PAS DEVINÉ. La spec
 * ne nomme que la RPC d'ÉCRITURE (§G2); la lecture s'appelle
 * `keel_household_habits()` et rend `(member_id, slots, note)`. Un premier jet
 * avait supposé `keel_household_member_habits`, par miroir de
 * `keel_household_member_bodies` — c'était faux, et la carte serait restée
 * muette sans qu'aucun test ne le dise.
 *
 * Une bouche sans habitude n'a PAS d'entrée dans la carte. `get()` rend
 * `undefined`, et l'écran doit le lire « personne n'a rien dit » — pas « elle
 * mange comme tout le monde ». Voir `MemberHabitsView`.
 */
export async function loadMemberHabits(): Promise<Map<string, MemberHabitsView>> {
  const { data, error } = await supabase.rpc("keel_household_habits");
  if (error) throw new Error(error.message);
  const out = new Map<string, MemberHabitsView>();
  for (const raw of (data ?? []) as unknown[]) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const memberId = String(r.member_id ?? "").trim();
    if (!memberId) continue;
    out.set(memberId, {
      memberId,
      slots: parseHabitSlots(r.slots),
      // LA MÊME COLONNE, LUE DEUX FOIS — deux parseurs séparés parce que les
      // deux questions n'ont ni les mêmes moments ni les mêmes états. Les
      // fondre perdrait la plus fréquente des deux.
      light: parseHabitLight(r.slots),
      note: parseHabitNote(r.note),
    });
  }
  return out;
}

interface RpcResult {
  ok: boolean;
  reason: string;
  [key: string]: unknown;
}

/**
 * JUMEAU DE `asResult` DE `household.ts`, et pas un import: ce module ne doit
 * PAS élargir la surface publique de `household.ts` (il ne lui appartient pas).
 * Trois lignes recopiées valent mieux qu'un export ajouté à un fichier voisin.
 */
function asResult(data: unknown): RpcResult {
  const row = (data ?? {}) as Record<string, unknown>;
  return { ...row, ok: row.ok === true, reason: String(row.reason ?? "") };
}

/**
 * CE QUE L'ÉCRAN A DANS LES MAINS AVANT D'ENVOYER — un état par moment.
 *
 * `null` EST UNE VALEUR, et c'est la plus importante du lot: elle veut dire
 * « personne n'a rien dit de ce moment ». Elle n'est pas un `household_dish`
 * qui s'ignore, et le formulaire ne doit jamais la remplacer tout seul.
 */
export interface HabitDraftSlot {
  slot: EatingOccasion;
  choice: HabitKind | null;
  /** Ce qui est tapé dans le champ court. Ignoré si `choice !== "own_usual"`. */
  usual: string;
}

/**
 * LE BROUILLON D'UNE BOUCHE, DÉRIVÉ DE CE QUI A ÉTÉ LU — jamais du vide.
 *
 * ⚠️ CETTE FONCTION EST LE PIÈGE №1 DE LA SPEC (§H2), ÉCRIT EN CODE.
 *
 * `habits === null` (aucune ligne) ⇒ TOUS les moments à `choice: null`. Rien
 * n'est coché, parce que personne n'a rien dit. Pré-cocher « elle mange ce que
 * la maison cuisine » écrirait, au premier Save, un fait que l'utilisateur n'a
 * jamais énoncé et ne peut pas démentir.
 *
 * `habits !== null` (une ligne existe) ⇒ un humain a répondu POUR CETTE BOUCHE,
 * et la réponse couvrait ses moments. Les moments listés portent leur habitude;
 * les autres portent `household_dish`, qui est ce que cette réponse-là voulait
 * dire. Ce n'est pas l'écran qui coche: c'est l'utilisateur, relu.
 *
 * @param slots les moments de CETTE PERSONNE (son `eating_rhythm`), pas une
 *        liste de six. Quelqu'un qui ne prend pas de collation ne doit pas lire
 *        une ligne vide toutes les semaines (spec §H1).
 *
 * ⚠️ UNE HABITUDE POSÉE SUR UN MOMENT QUE LA PERSONNE NE PREND PLUS SORT DU
 * BROUILLON, DONC DE LA BASE AU PROCHAIN ENREGISTREMENT. C'est un arbitrage,
 * pas un oubli. La réinjecter pour la « préserver » créerait une habitude que
 * l'écran ne montre pas, que personne ne peut retirer, et qui continuerait de
 * gouverner la composition — exactement le fait indémentable que ce lot existe
 * pour éviter. CE QUI EST À L'ÉCRAN EST CE QUI SERA ÉCRIT.
 */
export function habitDraft(
  slots: readonly EatingOccasion[],
  habits: MemberHabitsView | null,
): HabitDraftSlot[] {
  const own = new Map((habits?.slots ?? []).map((s) => [s.slot, s.usual]));
  return slots.map((slot) => {
    const usual = own.get(slot);
    if (usual !== undefined) return { slot, choice: "own_usual" as const, usual };
    return {
      slot,
      choice: habits === null ? null : ("household_dish" as const),
      usual: "",
    };
  });
}

/**
 * CE QU'ON ENVOIE — les seules entrées que la table porte.
 *
 * Un `choice` resté `null` ne produit RIEN: on n'écrit pas « elle mange le plat
 * de la maison » au nom de quelqu'un qui n'a pas répondu. Un `own_usual` au
 * texte vide ne produit rien non plus — la base le refuserait (`bad_slots`), et
 * le bouton est inerte avant d'en arriver là (voir `habitDraftBlocked`).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ `carried` EST REQUIS, ET SON OUBLI EFFACERAIT DES DONNÉES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `keel_household_set_member_habits` REMPLACE la liste entière. Cette carte-ci
 * n'édite QUE la prose — elle n'a pas de bulles —, donc ce qu'elle n'envoie
 * pas disparaît. Sans `carried`, enregistrer une habitude depuis
 * `/app/household` effacerait en silence le « + repas léger » coché dans la
 * fiche.
 *
 * ⚠️ REQUIS ET PAS `?`: un appelant qui omet la clé passerait `undefined`,
 * qui se traverse sans un mot. `{}` est une valeur qu'on peut lire — et c'est
 * la bonne quand la lecture n'a rien rendu. Cicatrice
 * `optional-gate-params-are-disarmed-gates`.
 */
export function habitPayload(
  draft: readonly HabitDraftSlot[],
  /**
   * CE QUE LA FICHE PORTE DÉJÀ ET QUE CE FORMULAIRE NE MONTRE PAS.
   *
   * ⟳ 2026-09-07 — UN OBJET, ET PAS UN ARGUMENT POSITIONNEL. Le « + repas
   * léger » vit sur la même colonne que la prose; un argument facultatif aurait
   * laissé chaque appelant l'oublier en silence, et la PROSE aurait effacé le
   * léger à chaque enregistrement.
   */
  carried: {
    light: Readonly<Record<string, boolean>>;
  },
): HabitSlotWrite[] {
  // ⛔ LE MÊME SÉRIALISEUR QUE LES TROIS AUTRES ÉCRIVAINS. Il sait produire
  // l'entrée `household_dish` qu'un moment sans prose mais avec un « léger »
  // exige, ce qu'une boucle locale referait de travers.
  return habitEntriesToWrite({
    habits: Object.fromEntries(
      draft
        .filter((d) => d.choice === "own_usual")
        .map((d) => [d.slot, d.usual]),
    ),
    light: carried.light,
    occasions: EATING_OCCASIONS,
  });
}

/**
 * LES MOMENTS QUI EMPÊCHENT D'ENREGISTRER — « son habitude » sans la dire.
 *
 * Rend la liste, pas un booléen: l'écran marque LE champ fautif. Un bouton
 * grisé sans rien à côté est une impasse — on a déjà payé ce patron ici.
 *
 * ⚠️ CE N'EST PAS LA GARDE. Elle est en base (`bad_slots`, `bad_note`, et la
 * relecture par `plan_draft_note.ts`). Ceci ne décide que de ce qu'on tente.
 */
export function habitDraftBlocked(
  draft: readonly HabitDraftSlot[],
): EatingOccasion[] {
  return draft
    .filter((d) => d.choice === "own_usual" && d.usual.trim().length === 0)
    .map((d) => d.slot);
}

/**
 * ENREGISTRER LES HABITUDES D'UNE BOUCHE.
 *
 * QUI ÉCRIT (spec §G2, et c'est la règle de `keel_household_set_member_away`):
 * le maître pour TOUTE bouche de son foyer; un compte réclamé pour LA SIENNE
 * seulement. La garde est en base — cet appel ne fait que la solliciter.
 *
 * Refus nommés: `not_authenticated` · `not_a_member` · `bad_slots` ·
 * `bad_note` (1..280) · `not_your_line`. Ils se rendent COMME UNE PHRASE, par
 * `householdErrorText` — jamais en jeton brut. Lot C a mesuré ce défaut exact
 * au navigateur: `note_unusable` s'affichait tel quel.
 *
 * @param note `null` efface. La chaîne vide n'est pas exprimable: la base la
 *        refuse (`bad_note` est 1..280), et « une note vide » n'est pas une
 *        réponse qu'un écran doit pouvoir produire par inadvertance. Même
 *        forme que `setMemberRhythm` avec son `empty_rhythm`.
 */
export async function setMemberHabits(
  memberId: string,
  slots: readonly HabitSlotWrite[],
  note: string | null,
) {
  const trimmed = note === null ? null : note.trim();
  const { data, error } = await supabase.rpc("keel_household_set_member_habits", {
    p_member: memberId,
    p_slots: slots,
    p_note: trimmed !== null && trimmed.length > 0 ? trimmed : null,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}
