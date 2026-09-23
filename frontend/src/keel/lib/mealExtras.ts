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
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — LES À-CÔTÉS REVIENNENT, DANS L'AUTRE SENS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le moteur sert désormais un petit à-côté au déjeuner et au dîner (entrée,
 * fromage, dessert, pain), choisi selon l'objectif de la personne — plan
 * « assiettes normales », décision 2 du propriétaire. Le réglage de ce fichier
 * dit ce que la personne veut À LA PLACE du défaut, type par type
 * (`side_courses`, voir `SIDE_COURSE_KINDS` plus bas).
 *
 * ⛔ CE N'EST PAS LE RETOUR DES EXTRAS. Les extras disaient « ce que je prends
 * déjà à côté, hors plan » et RETRANCHAIENT de l'énergie; les à-côtés sont
 * SERVIS PAR LE PLAN et comptés dedans. Même moments, sens inverse — d'où une
 * clé neuve, et ni `extras` ni `takes_*` relus.
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 — LES À-CÔTÉS: ENTRÉE, FROMAGE, DESSERT, PAIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES QUATRE TYPES D'À-CÔTÉ, ET LES DEUX MOMENTS QUI EN PORTENT.
 *
 * ⛔ UN MIROIR, COMME `LIGHT_BEARING_SLOTS`. L'autorité est
 * `supabase/functions/_shared/keel/side_courses_types.ts` (`SIDE_COURSE_KINDS`,
 * `SIDE_COURSE_SLOTS`); la contrainte SQL `household_member_habits_side_courses_check`
 * en tient une troisième copie. `mealExtrasMirror.int.test.ts` relit le module
 * Deno et compare: un type ajouté au moteur sans son bouton à l'écran serait
 * un réglage que personne ne peut poser, un bouton sans type un réglage que la
 * base refuse.
 *
 * ⚠️ DEUX MOMENTS, PAS TROIS: le petit-déjeuner et les collations ne reçoivent
 * jamais d'à-côté. Ce n'est pas la liste du « léger » (qui inclut le
 * petit-déjeuner).
 */
export const SIDE_COURSE_KINDS = ["starter", "cheese", "dessert", "bread"] as const;
export type SideCourseKind = (typeof SIDE_COURSE_KINDS)[number];

export const SIDE_COURSE_SLOTS = ["lunch", "dinner"] as const;
export type SideCourseSlot = (typeof SIDE_COURSE_SLOTS)[number];

export function slotBearsSideCourses(slot: string): slot is SideCourseSlot {
  return (SIDE_COURSE_SLOTS as readonly string[]).includes(slot);
}

/**
 * LE RÉGLAGE D'UN MOMENT — trois états par type, et la clé absente est le
 * premier:
 *   · type ABSENT ⇒ « Selon l'objectif » (le moteur décide);
 *   · `false`     ⇒ jamais ce type à ce moment;
 *   · `true`      ⇒ toujours ce type à ce moment.
 *
 * ⛔ `Partial<Record>` ET PAS UNE LISTE, pour la raison écrite sur `LightDraft`:
 * une liste perdrait le `false`, donc « Non », et le moteur reservirait le
 * défaut à quelqu'un qui l'a refusé.
 */
export type SideCoursePrefs = Readonly<Partial<Record<SideCourseKind, boolean>>>;

/**
 * LE BROUILLON DES À-CÔTÉS D'UNE PERSONNE — PAR MOMENT, pas un réglage unique.
 *
 * ⚠️ L'ÉCRAN ÉCRIT LA MÊME VALEUR AU DÉJEUNER ET AU DÎNER, mais la BASE peut les
 * porter différentes: la mémoire écrit « pas d'entrée le soir » sur le seul
 * dîner (`keel_household_set_slot_side_courses_for`). Aplatir en un réglage
 * unique effacerait ce dîner au premier enregistrement d'une habitude.
 */
export type SideCoursesDraft = Readonly<Partial<Record<SideCourseSlot, SideCoursePrefs>>>;

/**
 * LES TROIS RÉPONSES D'UNE LIGNE DU CHAMP — dans l'ordre de l'écran
 * (Oui / Non / Selon l'objectif). `auto` est la clé ABSENTE, jamais une valeur
 * écrite.
 */
export const SIDE_COURSE_CHOICES = ["yes", "no", "auto"] as const;
export type SideCourseChoice = (typeof SIDE_COURSE_CHOICES)[number];

function choiceOfValue(value: boolean | undefined): SideCourseChoice {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "auto";
}

/**
 * CE QUE LA LIGNE D'UN TYPE AFFICHE.
 *
 * ⚠️ `null` QUAND LE DÉJEUNER ET LE DÎNER NE DISENT PAS LA MÊME CHOSE — le cas
 * d'une note « pas d'entrée le soir ». La ligne n'allume alors aucun des trois
 * boutons: en allumer un affirmerait une réponse unique que la base ne porte
 * pas. Un clic la rend unique, sur les deux moments.
 */
export function sideCourseChoiceOf(
  draft: SideCoursesDraft,
  kind: SideCourseKind,
): SideCourseChoice | null {
  const [first, ...rest] = SIDE_COURSE_SLOTS.map((slot) =>
    choiceOfValue(draft[slot]?.[kind])
  );
  return rest.every((c) => c === first) ? first : null;
}

/**
 * UN CLIC SUR UNE LIGNE: la même réponse au déjeuner ET au dîner, pour CE type.
 *
 * ⛔ LES AUTRES TYPES NE BOUGENT PAS, moment par moment. Un « pas d'entrée le
 * soir » posé par la mémoire survit à un clic sur « Dessert ».
 *
 * ⚠️ `auto` RETIRE LA CLÉ, il n'écrit pas `null`: la contrainte SQL refuse tout
 * ce qui n'est pas un booléen strict. Un moment qui n'a plus aucun type réglé
 * sort du brouillon — il n'a plus rien à dire.
 */
export function setSideCourseChoice(
  draft: SideCoursesDraft,
  kind: SideCourseKind,
  choice: SideCourseChoice,
): SideCoursesDraft {
  const out: Partial<Record<SideCourseSlot, SideCoursePrefs>> = {};
  for (const slot of SIDE_COURSE_SLOTS) {
    const prefs: Partial<Record<SideCourseKind, boolean>> = { ...(draft[slot] ?? {}) };
    if (choice === "auto") delete prefs[kind];
    else prefs[kind] = choice === "yes";
    if (Object.keys(prefs).length > 0) out[slot] = prefs;
  }
  return out;
}

/**
 * LE RÉGLAGE D'UN MOMENT TEL QU'IL PART EN BASE, ou `null` s'il n'y a rien.
 *
 * ⛔ SEULS LES QUATRE TYPES ET LES VRAIS BOOLÉENS PARTENT, dans l'ordre de
 * `SIDE_COURSE_KINDS`: la contrainte SQL refuse le reste, et une écriture
 * refusée ferait échouer TOUT l'enregistrement de la fiche. Un objet vide ne
 * part pas non plus — la base l'accepterait, mais il ne dirait rien.
 */
function sidePrefsToWrite(
  prefs: SideCoursePrefs | undefined,
): Partial<Record<SideCourseKind, boolean>> | null {
  if (!prefs) return null;
  const out: Partial<Record<SideCourseKind, boolean>> = {};
  for (const kind of SIDE_COURSE_KINDS) {
    const value = prefs[kind];
    if (typeof value === "boolean") out[kind] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
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
 *
 * ⟳ 2026-09-23 — ET LES À-CÔTÉS SUIVENT LE MÊME CHEMIN QUE LE LÉGER: une entrée
 * qui ne porte QUE `side_courses` part en `household_dish` (la RPC d'écran
 * exige un `kind`), et la prose gagne toujours sur le `kind`.
 */
export interface HabitEntry {
  slot: string;
  kind: "own_usual" | "household_dish";
  usual: string;
  light?: boolean;
  /** ⟳ 2026-09-23 — lunch/dinner seulement, jamais vide. Voir `SideCoursePrefs`. */
  side_courses?: Partial<Record<SideCourseKind, boolean>>;
}

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
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS, REQUIS ET JAMAIS `?`, POUR LA MÊME RAISON.
   *
   * ⛔ `keel_household_set_member_habits` REMPLACE la liste entière: un appelant
   * qui n'apporte pas le réglage lu l'EFFACE, en silence, à chaque
   * enregistrement d'une habitude. C'est très exactement ce qui est arrivé à
   * l'ancienne clé `extras`. `{}` veut dire « rien de réglé » et se lit;
   * l'oubli, lui, ne compile pas.
   */
  sideCourses: SideCoursesDraft;
  /** L'ordre des moments, pour que deux fiches identiques s'écrivent pareil. */
  occasions: readonly string[];
}): HabitEntry[] {
  const out: HabitEntry[] = [];
  for (const slot of input.occasions) {
    const usual = (input.habits[slot] ?? "").trim();
    const lightSaid = lightAnswered(input.light, slot) && slotBearsLight(slot);
    // ⛔ LES À-CÔTÉS NE PARTENT QUE SUR LE DÉJEUNER ET LE DÎNER: la contrainte
    // SQL refuse la clé ailleurs, et une clé refusée ferait échouer TOUTE
    // l'écriture de la fiche — prose et léger compris.
    const side = slotBearsSideCourses(slot)
      ? sidePrefsToWrite(input.sideCourses[slot])
      : null;
    // ⚠️ TROIS RAISONS DE SORTIR: une entrée existe dès qu'UNE des trois
    // questions a une réponse. Un moment dont SEUL le léger (ou SEULS les
    // à-côtés) est répondu doit s'écrire, sinon la réponse se perd entre
    // l'écran et la base.
    if (usual === "" && !lightSaid && side === null) continue;
    const entry: HabitEntry = usual === ""
      ? { slot, kind: "household_dish", usual: "" }
      : { slot, kind: "own_usual", usual };
    // ⛔ LA CLÉ N'EST POSÉE QUE SI ELLE A ÉTÉ RÉPONDUE, et la contrainte SQL
    // refuse la clé sur un moment qui ne la porte pas: la lecture, l'écriture
    // et la base doivent refuser la même chose, sinon la plus permissive des
    // trois décide.
    if (lightSaid) entry.light = input.light[slot] === true;
    if (side !== null) entry.side_courses = side;
    out.push(entry);
  }
  return out;
}

/**
 * CE QUE LA BASE REND POUR LES À-CÔTÉS, RELU EN BROUILLON.
 *
 * ⛔ LE MIROIR MOT POUR MOT DE `parseMemberSideCourses`
 * (`_shared/keel/household_habits.ts`), et un test les passe sur les mêmes
 * entrées: si l'écran relisait plus large que le moteur, il afficherait un
 * « Non » que le plan ne verrait pas.
 *
 *   · seuls `lunch` / `dinner` sont lus;
 *   · la PREMIÈRE entrée d'un moment qui porte la clé gagne;
 *   · un `side_courses` qui n'est pas un objet est écarté entier;
 *   · un type inconnu ou une valeur qui n'est pas un VRAI booléen est écarté,
 *     les autres types du même moment survivent;
 *   · un moment sans aucun type valable est absent (= rien de réglé).
 */
export function parseHabitSideCourses(raw: unknown): SideCoursesDraft {
  if (!Array.isArray(raw)) return {};
  const out: Partial<Record<SideCourseSlot, SideCoursePrefs>> = {};
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const slot = String(e.slot ?? "").trim().toLowerCase();
    if (!slotBearsSideCourses(slot)) continue;
    if (seen.has(slot)) continue;
    if (!Object.prototype.hasOwnProperty.call(e, "side_courses")) continue;
    seen.add(slot);
    const side = e.side_courses;
    if (!side || typeof side !== "object" || Array.isArray(side)) continue;
    const prefs: Partial<Record<SideCourseKind, boolean>> = {};
    for (const kind of SIDE_COURSE_KINDS) {
      if (!Object.prototype.hasOwnProperty.call(side, kind)) continue;
      const value = (side as Record<string, unknown>)[kind];
      if (typeof value !== "boolean") continue;
      prefs[kind] = value;
    }
    if (Object.keys(prefs).length === 0) continue;
    out[slot] = prefs;
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
