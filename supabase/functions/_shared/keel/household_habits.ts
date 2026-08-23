// ---------------------------------------------------------------------------
// CE QUE CETTE BOUCHE MANGE QUAND ELLE NE MANGE PAS LE PLAT DE LA MAISON
//
// Ouvert le 2026-08-14, après un plan réel qui a servi des ŒUFS BROUILLÉS SEPT
// MATINS D'AFFILÉE à une femme qui mange une pomme.
//
// ⚠️ LE PLAN N'A PAS IGNORÉ SON HABITUDE. Personne ne la lui a demandée, et il
// n'existait aucun champ pour la ranger. Le produit savait d'elle son prénom,
// sa naissance, son objectif, ses absences, ses moments, ses allergies et son
// corps — RIEN sur ce qu'elle mange. C'est ce trou-là que ce module ferme, et
// il ne ferme que celui-là.
//
// ── POURQUOI PAS `fixed_intakes`, QUI EXISTE DÉJÀ ──────────────────────────
// Parce que cette forme-là exige un `food_ref` résolu contre
// `food_composition_refs` ET une quantité (`amount` + `unit`). « Une pomme le
// matin » n'a ni l'un ni l'autre, et lui en inventer écrirait un fait que
// PERSONNE N'A PESÉ — la cicatrice `auto-tick-writes-undeniable-false-facts`,
// mot pour mot.
//
// Les deux répondent à deux questions différentes, et c'est la frontière:
//
//   `fixed_intakes`  dit UNE QUANTITÉ QUI REMPLACE UN REPAS (60 g d'avoine).
//   une habitude     dit UNE TENDANCE QUE LA COMPOSITION CONTOURNE.
//
// ── CE QU'UNE HABITUDE N'EST PAS ──────────────────────────────────────────
// Ce n'est pas une préférence (`food_preferences`, clé sur `user_id`, donc
// inatteignable pour une bouche sans compte — c'est très exactement le cas de
// la femme du constat). Ce n'est pas une envie de la semaine: c'est une
// propriété DURABLE de la personne, relue à chaque composition, et l'arbitrage
// B2 du 2026-08-14 le dit en toutes lettres.
//
// ── LA GARDE DE TEXTE EST EMPRUNTÉE, JAMAIS RÉÉCRITE (G3) ─────────────────
// `usual` et `note` passent par `plan_draft_note.ts::readDraftNote`, déjà livré
// et testé: pas de cible chiffrée, pas de vocabulaire de restriction sous
// plancher TCA, pas de consigne au modèle, et on refuse LA CLAUSE, pas le
// texte. Une seconde garde écrite ici divergerait de la première dans la
// semaine — ce dépôt a déjà payé « garde testée dans une seule langue ».
// ---------------------------------------------------------------------------


import {
  type DraftNoteRefusal,
  DRAFT_NOTE_MAX_CHARS,
  readDraftNote,
} from "./plan_draft_note.ts";
import { type ForbiddenTerm } from "./forbidden_matcher.ts";

// ⚠️ CE MODULE N'IMPORTE PAS `meal_generation.ts`, ET C'EST UNE CONTRAINTE
// STRUCTURELLE, PAS UNE PRÉFÉRENCE.
//
// `household_portions.ts` importe CE fichier (il a besoin du fragment de ligne
// et de la phrase de conséquence), et `meal_generation.ts` importe
// `household_portions.ts` — son en-tête l'écrit noir sur blanc: « Aucun cycle:
// `household_portions.ts` n'importe pas ce fichier ». Lire `EATING_OCCASIONS`
// d'ici referme la boucle, et le prix est déjà mesuré: le premier jet de ce
// module a fait tomber SIX fichiers de test d'un coup sur
// `ReferenceError: Cannot access 'EATING_OCCASIONS' before initialization`.
// Un cycle d'imports ne se voit ni au typecheck ni à la lecture; il se voit à
// l'exécution, et seulement si quelque chose s'évalue au chargement.
//
// LE VOCABULAIRE EST DONC RECOPIÉ ICI, ET LA RECOPIE EST PROUVÉE ÉGALE.
// `household_habits_test.ts` importe les DEUX listes — un test n'est dans
// aucun cycle — et échoue à la première divergence. C'est la seule forme
// disponible: la lire serait mieux, mais on ne peut pas, et une copie non
// vérifiée serait ce que ce dépôt appelle « une table qui raconte ce que les
// chaînes disaient le jour où on l'a écrite ».
const HABIT_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type EatingOccasion = (typeof HABIT_OCCASIONS)[number];
export const HABIT_OCCASION_TOKENS: readonly string[] = HABIT_OCCASIONS;

/**
 * LA LISTE EST FERMÉE, ET ELLE N'A QUE DEUX VALEURS.
 *
 * `household_dish` est le DÉFAUT, et il ne s'écrit PAS: une bouche qui mange ce
 * que la maison cuisine n'a aucune ligne dans cette table. Il est nommé quand
 * même parce qu'un écran doit pouvoir RETIRER une habitude déjà posée, et
 * « retirer » a besoin d'un mot — sans lui, l'écran enverrait une entrée
 * amputée et le lecteur en déduirait ce qu'il pourrait.
 *
 * ⚠️ IL N'Y A PAS DE TROISIÈME VALEUR, ET SURTOUT PAS « elle saute ce repas ».
 * Sauter un repas se dit DÉJÀ, deux fois, et mieux: par le rythme de la bouche
 * (`eating_rhythm`, qui retire le moment de la grille) et par l'absence
 * (`away_days`, qui retire la case). Une troisième façon de dire la même chose
 * divergerait des deux autres au premier ajustement.
 */
export const HABIT_KINDS = ["household_dish", "own_usual"] as const;
export type HabitKind = (typeof HABIT_KINDS)[number];

/**
 * UNE HABITUDE, POUR UN MOMENT.
 *
 * `usual` est vide pour `household_dish` — il n'y a rien à dire. Il est NON
 * VIDE pour `own_usual`, et c'est ce qui rend l'entrée utile: « elle mange
 * autre chose » sans dire quoi ferait composer le modèle à l'aveugle, ce qui
 * est très exactement le défaut d'origine.
 */
export interface MemberHabit {
  slot: EatingOccasion;
  kind: HabitKind;
  /** Ce qu'elle mange, en toutes lettres. `""` pour `household_dish`. */
  usual: string;
}

/**
 * LE PLAFOND DE LA TABLE, ET IL EST EXACTEMENT LE NOMBRE DE MOMENTS.
 *
 * Six, parce qu'il y a six `EATING_OCCASIONS` et qu'une personne n'a pas deux
 * habitudes au même petit-déjeuner. Il est LU sur la liste plutôt qu'écrit `6`:
 * un septième moment ajouté à `EATING_OCCASIONS` ferait sinon refuser une
 * écriture parfaitement valable, sans que rien ne le dise.
 */
export const HABIT_SLOTS_MAX = HABIT_OCCASIONS.length;

/**
 * LE PLAFOND DU TEXTE — EMPRUNTÉ, jamais redéclaré.
 *
 * C'est `DRAFT_NOTE_MAX_CHARS`, donc le même que la note de reprise de plan, et
 * le même que celui que la RPC applique en base (`bad_note`). Trois copies d'un
 * même nombre dont une seule reçoit l'ajustement est le défaut que ce dépôt
 * documente le plus souvent; ici il n'y en a qu'une, et la base cite la source.
 */
export const HABIT_TEXT_MAX_CHARS = DRAFT_NOTE_MAX_CHARS;

/**
 * LA LECTURE DU JSONB, TOLÉRANTE DANS UNE SEULE DIRECTION.
 *
 * Même posture que `parseAwayDays` et `parseEatingRhythm`: ce qui n'est pas
 * reconnu est ÉCARTÉ, jamais deviné, et les autres entrées survivent. Une
 * habitude perdue rend le plan moins juste; une habitude devinée le rend faux
 * tout en ayant l'air complet.
 *
 * ⚠️ UNE ENTRÉE `own_usual` SANS TEXTE EST ÉCARTÉE, et ce n'est pas une
 * sévérité gratuite. Gardée, elle produirait la ligne « has their own at
 * breakfast: » — un modèle à qui on dit « elle mange autre chose » sans dire
 * quoi INVENTE ce qu'elle mange. C'est la forme la plus chère du défaut qu'on
 * répare: un fait faux, sur la personne, que personne n'a écrit.
 *
 * ⚠️ `household_dish` NE SURVIT PAS À LA LECTURE. C'est le défaut du produit,
 * donc « rien à dire »: le rendre ferait porter au brief une ligne qui affirme
 * ce que l'absence de ligne dit déjà. La table peut en contenir (un écran qui
 * remet une bouche au plat commun réécrit sa ligne entière); le PROMPT n'en
 * voit jamais.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function parseMemberHabits(raw: unknown): MemberHabit[] {
  if (!Array.isArray(raw)) return [];
  const bySlot = new Map<EatingOccasion, MemberHabit>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!HABIT_OCCASION_TOKENS.includes(slot)) continue;
    const kind = String(e.kind ?? "").trim().toLowerCase();
    if (!(HABIT_KINDS as readonly string[]).includes(kind)) continue;
    if (kind === "household_dish") continue;
    const usual = String(e.usual ?? "").replace(/\s+/g, " ").trim();
    if (usual.length === 0) continue;
    // LE PREMIER GAGNE, et l'ordre rendu est celui de la JOURNÉE. Deux entrées
    // pour le même moment sont une erreur d'écrivain, pas un choix: en garder
    // deux ferait deux fragments contradictoires sur la même ligne de brief.
    if (bySlot.has(slot as EatingOccasion)) continue;
    bySlot.set(slot as EatingOccasion, {
      slot: slot as EatingOccasion,
      kind: "own_usual",
      usual: usual.slice(0, HABIT_TEXT_MAX_CHARS),
    });
  }
  return HABIT_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s)!);
}

/**
 * LES MOTS DU MOMENT, DANS LA LANGUE DU PROMPT.
 *
 * En anglais, comme `SERVING_DIRECTION` et pour la même raison: ces chaînes
 * instruisent le MODÈLE et ne sont JAMAIS montrées à quiconque. L'écran écrit
 * ses propres libellés, dans le catalogue de langue.
 */
const SLOT_WORDS: Record<EatingOccasion, string> = {
  breakfast: "breakfast",
  snack_am: "the morning snack",
  lunch: "lunch",
  snack_pm: "the afternoon snack",
  dinner: "dinner",
  before_bed: "the evening snack",
};

/**
 * CE QUI S'AJOUTE À LA LIGNE DE LA BOUCHE, DANS LE BRIEF DE PORTIONS.
 *
 *   ` — has their own at breakfast: une pomme`
 *
 * ⚠️ « their », PAS « her ». La spec écrit l'exemple avec « her » parce qu'il
 * porte sur une femme nommée; le CODE ne connaît le genre de personne, et
 * surtout la phrase de conséquence cite le marqueur entre guillemets
 * (`When a person "has their own" at a moment`) — exactement comme la
 * conséquence du rythme cite `"eats at ... only"`. Un marqueur cité qui ne
 * figure nulle part dans le texte est une consigne qui ne s'attache à rien.
 *
 * ⚠️ LE TEXTE DE LA PERSONNE PART TEL QU'ELLE L'A ÉCRIT, dans SA langue. « une
 * pomme » ne se traduit pas: c'est une donnée, pas de la prose à nous. Le tronc
 * fait déjà exactement ça de la note de reprise et des envies.
 *
 * Rend `""` quand il n'y a rien à dire — et c'est le cas majoritaire.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES MOMENTS OÙ CETTE BOUCHE MANGE SON PROPRE REPAS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CE PRÉDICAT SORT DE `habitFragment` (2026-08-19) ────────────
 * La phrase « — has their own at lunch: une salade froide » et la DÉCISION
 * « cette bouche porte un plat à elle » lisaient la même chose à deux endroits
 * différents — sauf que la seconde ne la lisait pas du tout: seul un écart de
 * RÉGIME rendait porteur de plat. Le modèle écrivait donc la salade (il avait
 * la phrase), et le plafond de plats la coupait (il n'avait pas la place).
 *
 * Mesuré sur le run de 19h03: SIX salades écrites, SIX coupées, zéro à
 * l'écran. « Elle est où la salade froide de thon ? »
 *
 * ⛔ UN SEUL PRÉDICAT POUR LES DEUX. La phrase du brief et le budget qui lui
 * fait de la place ne peuvent pas être en désaccord — c'est très exactement ce
 * désaccord-là qui a produit le défaut.
 */
export function ownMealSlots(
  habits: readonly MemberHabit[],
): EatingOccasion[] {
  return habits
    .filter((h) => h.kind === "own_usual" && h.usual.trim().length > 0)
    .map((h) => h.slot);
}

export function habitFragment(habits: readonly MemberHabit[]): string {
  const own = habits.filter((h) => h.kind === "own_usual" && h.usual.trim().length > 0);
  if (own.length === 0) return "";
  const parts = own.map((h) => `${SLOT_WORDS[h.slot] ?? h.slot}: ${h.usual}`);
  return ` — has their own at ${parts.join("; at ")}`;
}

/**
 * LA LIGNE LIBRE DE LA BOUCHE, SUR SA LIGNE À ELLE.
 *
 *   ` — usually: elle prend son café avant de manger`
 *
 * ── ÉCART ASSUMÉ AVEC LA SPEC, ET IL A UNE RAISON NOMMÉE ─────────────────
 * §G4 range cette ligne « dans le bloc des voix, plafonnée, sous la garde de
 * non-divulgation déjà en place ». Le bloc des voix ne peut pas la porter: D3
 * pose qu'une bouche SANS COMPTE n'a rien à dire et n'y apparaît pas
 * (`buildHouseholdVoices` est clé sur les titulaires), et une habitude existe
 * précisément pour la bouche sans compte — c'est la femme du constat. L'y
 * pousser demanderait de renverser l'arbitrage D3 depuis un autre lot, en
 * silence.
 *
 * La ligne de la bouche, elle, existe pour tout le monde et porte DÉJÀ la
 * garde qui compte: le brief se termine sur « NEVER state a reason, a goal, a
 * calorie count or anything about a person's body », et c'est la contrainte la
 * plus proche de la fin, donc la plus contraignante. Le texte, lui, est passé
 * par `readHabitText` avant d'arriver ici.
 *
 * ⚠️ CE QUI RESTE OUVERT, ET IL EST NOMMÉ: le plafond en TOKENS par membre
 * (`VOICE_MEMBER_TOKEN_CAP`) ne s'applique pas ici. Le plafond effectif est
 * celui de la base — 280 signes, une ligne, une bouche — soit au pire 8 × 280
 * pour un foyer plein. C'est borné, ce n'est pas mesuré.
 */
export function habitNoteFragment(note: string | null): string {
  const text = String(note ?? "").replace(/\s+/g, " ").trim();
  if (text.length === 0) return "";
  return ` — usually: ${text.slice(0, HABIT_TEXT_MAX_CHARS)}`;
}

/**
 * LA CONSÉQUENCE, DITE UNE FOIS ET SEULEMENT SI QUELQU'UN EST MARQUÉ.
 *
 * ⚠️ MÊME DISCIPLINE QUE `anyBodyFacts` / `anyRhythm`, ET POUR LA MÊME RAISON:
 * on n'énonce pas une contrainte que personne n'a posée. Servie à un foyer où
 * personne n'a d'habitude, elle apprend au modèle qu'il existe un marquage —
 * et l'invite à en inventer un.
 *
 * TROIS PHRASES, TROIS PORTES:
 *
 *   « do NOT serve them the table's dish then » — la porte principale, et c'est
 *      littéralement le défaut mesuré: sept petits-déjeuners servis à quelqu'un
 *      qui n'en mange pas.
 *   « Cook for the others as usual » — sans elle, un modèle retire le moment de
 *      TOUT LE MONDE. La maison ne cesse pas de déjeuner parce qu'une personne
 *      mange une pomme.
 *   « count their own thing in the shopping list » — sans elle, la pomme n'est
 *      achetée par personne. Une habitude qu'on contourne sans l'acheter fait
 *      une personne qui ne mange rien.
 */
export const HABIT_CONSEQUENCE = [
  'When a person "has their own" at a moment, do NOT serve them the table\'s',
  "dish then. Cook for the others as usual, and count their own thing in the",
  "shopping list.",
  // ── ET ÉCRIS-LE COMME UN PLAT, AVEC SON PROPRIÉTAIRE (2026-08-19) ────────
  // ⛔ CES DEUX LIGNES FERMENT UNE CONTRADICTION MESURÉE. Le bloc disait
  // « ne leur sers pas le plat de la table » et « compte leur truc dans les
  // courses » — donc: pas de plat pour elles. Le modèle en écrivait quand même
  // (six salades sur le run de 19h03), sans `for_member_id`, et le plafond les
  // coupait toutes: la personne n'avait AUCUN déjeuner à l'écran.
  //
  // Le plat est la bonne sortie: c'est la seule chose qui montre à quelqu'un ce
  // qu'il mange ce midi-là. Ce qui manquait, c'est de le DEMANDER, et de dire
  // avec quelle clé — la moitié « schéma » vit dans `dishOwnerSchemaBlock`, et
  // elle ne partait que pour un écart de régime.
  "Write that meal as a dish of its own, on that day and that moment, carrying",
  '"for_member_id" set to that person. It is their meal: without it they read a',
  "day with nothing to eat at that hour.",
] as const;

/**
 * LE VERDICT D'UN TEXTE D'HABITUDE — DÉLÉGUÉ, jamais recalculé.
 *
 * ⚠️ AUCUN PARAMÈTRE OPTIONNEL, ET C'EST LA MÊME SIGNATURE QUE `readDraftNote`
 * exprès. `doctrineForbidden: []` dit « aucun interdit », `undefined` dit « je
 * n'ai pas su lire la doctrine »; `restrictionFlag: false` AFFIRME que la
 * personne n'est pas sous plancher TCA. Sept paramètres de garde optionnels ont
 * déjà été des gardes désarmées dans ce dépôt.
 *
 * ── POURQUOI CETTE ENVELOPPE EXISTE PLUTÔT QU'UN APPEL DIRECT ─────────────
 * Pour UNE chose, et elle est nommée: `readDraftNote` rend `usable` = les
 * clauses GARDÉES recollées. Une habitude en deux phrases dont une seule est
 * refusée deviendrait donc une habitude AMPUTÉE — « une pomme » là où la
 * personne a écrit deux choses. Sur une note de reprise c'est le bon
 * arbitrage (on garde ce qu'on peut honorer); sur une habitude DURABLE, un
 * texte tronqué se relira chaque semaine sans que personne sache qu'il l'est.
 *
 * On refuse donc TOUT dès qu'une clause tombe. Le champ étant d'UNE ligne
 * (arbitrage B3), le cas « deux phrases dont une fautive » est marginal, et le
 * prix du refus est une phrase de refus que l'écran sait déjà rendre.
 */
export interface HabitTextVerdict {
  usable: string | null;
  refusal: DraftNoteRefusal | null;
}

export function readHabitText(input: {
  raw: unknown;
  doctrineForbidden: readonly ForbiddenTerm[];
  restrictionFlag: boolean;
}): HabitTextVerdict {
  const verdict = readDraftNote({
    raw: input.raw,
    doctrineForbidden: input.doctrineForbidden,
    restrictionFlag: input.restrictionFlag,
  });
  if (verdict.usable === null) {
    return { usable: null, refusal: verdict.refusal };
  }
  if (verdict.dropped.length > 0) {
    // UNE CLAUSE TOMBÉE FAIT TOMBER LE TEXTE. Voir la note ci-dessus: le motif
    // rendu est le PREMIER, il sert au journal de l'appelant, et la phrase
    // montrée à la personne est la même quel que soit le motif — c'est ce qui
    // empêche la garde de désigner qui est sous plancher TCA.
    return { usable: null, refusal: verdict.dropped[0] };
  }
  return { usable: verdict.usable, refusal: null };
}

/**
 * LES HABITUDES D'UNE BOUCHE, PASSÉES À LA GARDE, PRÊTES POUR LE BRIEF.
 *
 * Rend les entrées GARDÉES et, à part, ce qui est tombé — nommément. Une
 * troncature muette est un mensonge sur ce que le modèle a vu: sans cette
 * liste, « pourquoi le plan me sert-il encore des œufs ? » n'a aucune réponse
 * trois jours plus tard, et une garde mal calibrée ressemble trait pour trait à
 * un modèle distrait. C'est le patron de `voiceIssues` (D4).
 */
export function gateMemberHabits(input: {
  habits: readonly MemberHabit[];
  /** `null` = pas de ligne libre, et c'est le cas majoritaire. */
  note: string | null;
  doctrineForbidden: readonly ForbiddenTerm[];
  restrictionFlag: boolean;
}): { kept: MemberHabit[]; note: string | null; issues: string[] } {
  const kept: MemberHabit[] = [];
  const issues: string[] = [];
  for (const habit of input.habits) {
    const verdict = readHabitText({
      raw: habit.usual,
      doctrineForbidden: input.doctrineForbidden,
      restrictionFlag: input.restrictionFlag,
    });
    if (verdict.usable === null) {
      issues.push(`habit_withheld:${habit.slot}:${verdict.refusal ?? "empty"}`);
      continue;
    }
    kept.push({ ...habit, usual: verdict.usable });
  }
  // LA LIGNE LIBRE PASSE LA MÊME PORTE, ET SON REFUS EST TRACÉ À PART. Une
  // note retenue pendant que trois habitudes passent ne serait visible NULLE
  // PART sans cette entrée: ni dans la réponse (rien n'échoue), ni dans les
  // journaux. Un filtre muet est un filtre qu'on ne saura pas mesurer.
  let note: string | null = null;
  if (input.note !== null && String(input.note).trim().length > 0) {
    const verdict = readHabitText({
      raw: input.note,
      doctrineForbidden: input.doctrineForbidden,
      restrictionFlag: input.restrictionFlag,
    });
    if (verdict.usable === null) {
      issues.push(`habit_note_withheld:${verdict.refusal ?? "empty"}`);
    } else {
      note = verdict.usable;
    }
  }
  return { kept, note, issues };
}
