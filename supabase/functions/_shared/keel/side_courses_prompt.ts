/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES À-CÔTÉS DANS LA CONSIGNE — ce que le modèle lit, et la clé qu'il rend.
 * ⟳ 2026-09-23 — flux C du chantier « assiettes normales ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md`. Vocabulaire et formes:
 * `side_courses_types.ts` (vague 0).
 *
 * ── QUI FAIT QUOI ─────────────────────────────────────────────────────────
 * Le moteur a déjà décidé, avant la consigne, QUI reçoit QUEL type d'à-côté à
 * QUEL moment (`SideCourseAsk`, flux A). Le modèle ne choisit que l'ALIMENT,
 * une fois, sans grammes. Ce module écrit ces deux moitiés en anglais pour le
 * modèle:
 *   · la répartition — sur la ligne de chaque case du calendrier (v34,
 *     `sideCoursesCellText`) ou une ligne par jour (v33, `perDay: true`);
 *   · la promesse, les consignes par type, les identifiants et la clé de
 *     schéma `side_courses` — `sideCoursesBlock`.
 *
 * ── ⛔ LA PROMESSE ET LA CLÉ DANS LE MÊME BLOC, À MOINS DE SIX LIGNES ─────
 * Cicatrice `promise-and-schema-key-must-be-adjacent`: ce dépôt a mesuré 0 %
 * de conformité quand une promesse vivait dans un message et sa clé dans
 * l'autre, et un « ci-dessus » ne traverse pas la frontière système ↔
 * utilisateur. La clé est donc écrite ICI, dans le message utilisateur, quatre
 * lignes sous la promesse — et pas dans le suffixe système.
 * ⟳ 2026-09-23 — six lignes au plus: les règles de la table et des deux jours
 * s'intercalent entre la promesse et la clé, l'exception suit l'échappatoire.
 *
 * ── ⟳ 2026-09-23 · LES À-CÔTÉS EN FAMILLES ────────────────────────────────
 * Mesuré sur la campagne du 2026-09-23: le modèle répétait le même aliment
 * toute la semaine (Thomas: « emmental + pomme » à 10 repas sur 10). Trois
 * phrases, chacune GARDÉE PAR SON FAIT:
 *   · la TABLE — un aliment par type pour tous ceux qui en ont un à ce repas:
 *     seulement si deux personnes au moins partagent un type à un même repas;
 *   · l'EXCEPTION — la personne qui ne peut pas manger l'aliment de la table
 *     en reçoit un autre du même type: même fait;
 *   · les DEUX JOURS — un aliment deux jours de suite au plus, et peu
 *     d'aliments sur le plan: seulement si la fenêtre compte trois jours ou
 *     plus (sur deux jours, la règle ne peut pas être violée).
 *     ⟳ 2026-09-23 (v40) — le pain en est exclu: « bread may stay the same
 *     all week ».
 * Le moteur ne répare rien: il compte (`SideCourseEngineLedger.variety`).
 *
 * ── ⟳ 2026-09-23 (v40) · LA TABLE PARTAGE SES À-CÔTÉS ─────────────────────
 * Le dessert dense de la prise est retiré (`dessertLines`): la prise suit la
 * table, et son surplus passe par le moteur (pain, puis fromage). Une phrase
 * fait nommer l'aliment exact, jamais une catégorie. Deux gestes du moteur
 * répondent en face (`side_courses.ts`): le terme prend la main sur un
 * identifiant générique, et le manque d'un repas grossit le pain et le fromage
 * déjà servis.
 *
 * ── ⛔ L'ÉCHAPPATOIRE EST NOMMÉE ──────────────────────────────────────────
 * « Nomme un aliment » se satisfait en écrivant une recette de dessert avec
 * ses grammes, ou un second plat. Le bloc dit en toutes lettres ce qu'on
 * refuse: « a food named once, never grams, never a second dish ».
 *
 * ── ⛔ AUCUN KCAL ─────────────────────────────────────────────────────────
 * Les calories d'un à-côté (`SideCourseAlloc.kcal`) restent au moteur. La
 * garde de fuite des prompts refuse tout « kcal » qui ne soit pas suivi de
 * « per 100 g »; ce module n'en écrit aucun.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import {
  SIDE_COURSE_KINDS,
  SIDE_COURSE_SLOTS,
  type SideCourseAsk,
  type SideCourseGoal,
  type SideCourseKind,
} from "./side_courses_types.ts";

/**
 * L'EN-TÊTE DU BLOC. ⚠️ CITÉ EN TOUTES LETTRES par la recette de référence
 * (`standardRecipeBlock`, « (SIDE COURSES) »): le renommer casse le renvoi.
 */
export const SIDE_COURSES_HEADER = "== SIDE COURSES (household): ONE FOOD BESIDE THE DISH ==";

/**
 * CE QUE LA CONSIGNE A RÉELLEMENT ÉCRIT DES À-CÔTÉS — tous présents, même à 0.
 *
 * ⛔ COMPTÉ SUR LES LIGNES ÉCRITES, pas sur l'entrée. Une demande qui ne trouve
 * aucune case où s'écrire (personne hors du calendrier, case vide) n'atteint
 * pas le modèle: si on la comptait quand même, « le modèle a ignoré la
 * demande » et « la consigne ne la portait pas » se reliraient pareil — le
 * zéro ambigu que le lot 3C a payé.
 *
 * Contrôle d'intégration: `given = prompt_asked + unplaced`. `given = 0` sur un
 * plan qui aurait dû porter des à-côtés = l'appelant n'a pas passé le champ.
 */
export interface SideCoursesPromptCounts {
  /** Les à-côtés reçus en entrée (un par type, par personne, par moment). */
  given: number;
  /** Les à-côtés nommés dans la consigne. C'est le dénominateur du modèle. */
  prompt_asked: number;
  /** Les cases (jour × moment) dont la consigne nomme au moins un à-côté. */
  cells: number;
  /** Les à-côtés reçus que la consigne n'a pu écrire nulle part. */
  unplaced: number;
}

/** Les compteurs d'une consigne qui ne porte aucun à-côté. */
export function emptySideCoursesCounts(): SideCoursesPromptCounts {
  return { given: 0, prompt_asked: 0, cells: 0, unplaced: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LA LECTURE D'UNE DEMANDE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES TYPES D'UNE DEMANDE, sans doublon, dans l'ordre du planificateur.
 *
 * ⚠️ UN TYPE HORS VOCABULAIRE EST IGNORÉ, pas recopié: la consigne ne peut
 * nommer que ce que la clé de schéma accepte.
 */
function kindsOf(ask: SideCourseAsk): SideCourseKind[] {
  const out: SideCourseKind[] = [];
  for (const c of ask.courses ?? []) {
    const k = c?.kind as SideCourseKind;
    if ((SIDE_COURSE_KINDS as readonly string[]).includes(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Combien d'à-côtés une liste de demandes porte (un par type et par demande). */
export function sideCoursesGiven(asks: readonly SideCourseAsk[] | null | undefined): number {
  let n = 0;
  for (const a of asks ?? []) n += kindsOf(a).length;
  return n;
}

/**
 * LES FRAGMENTS « Thomas cheese + dessert », UN PAR PERSONNE, dans l'ordre de
 * première apparition. Deux demandes de la même personne au même moment sont
 * FUSIONNÉES (un type n'est nommé qu'une fois).
 *
 * ⛔ UNE PERSONNE ABSENTE DE `nameOf` N'EST PAS ÉCRITE. Écrire son id à la place
 * d'un prénom ferait nommer au modèle quelqu'un que rien d'autre dans le message
 * ne présente; elle compte dans `unplaced` chez l'appelant.
 */
function personFragments(
  asks: readonly SideCourseAsk[],
  nameOf: ReadonlyMap<string, string>,
): { parts: string[]; named: number } {
  const order: string[] = [];
  const kinds = new Map<string, SideCourseKind[]>();
  for (const a of asks) {
    if (!nameOf.has(a.memberId)) continue;
    const ks = kindsOf(a);
    if (ks.length === 0) continue;
    const have = kinds.get(a.memberId);
    if (have === undefined) {
      order.push(a.memberId);
      kinds.set(a.memberId, [...ks]);
    } else {
      for (const k of ks) if (!have.includes(k)) have.push(k);
    }
  }
  let named = 0;
  const parts = order.map((id) => {
    const ks = kinds.get(id)!;
    named += ks.length;
    return `${nameOf.get(id)} ${ks.join(" + ")}`;
  });
  return { parts, named };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA LIGNE D'UNE CASE — v34
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA FIN DE LIGNE D'UNE CASE DU CALENDRIER, ET CE QU'ELLE A NOMMÉ.
 *
 * ` Side courses: Thomas cheese + dessert; Christèle dessert.` — ou `""`.
 *
 * ⚠️ L'APPELANT PASSE LES DEMANDES DE CETTE CASE, DANS L'ORDRE DES MANGEURS.
 * Ce module ne connaît pas la grille: filtrer par jour et moment ici ferait une
 * seconde lecture de la case, et c'est celle qu'on relit le moins qui
 * divergerait.
 */
export function sideCoursesCell(
  asks: readonly SideCourseAsk[],
  nameOf: ReadonlyMap<string, string>,
): { text: string; named: number } {
  const { parts, named } = personFragments(asks, nameOf);
  if (parts.length === 0) return { text: "", named: 0 };
  return { text: ` Side courses: ${parts.join("; ")}.`, named };
}

/** Le texte seul de `sideCoursesCell`. */
export function sideCoursesCellText(
  asks: readonly SideCourseAsk[],
  nameOf: ReadonlyMap<string, string>,
): string {
  return sideCoursesCell(asks, nameOf).text;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE BLOC — la promesse, la clé, les consignes par type
// ═══════════════════════════════════════════════════════════════════════════

/** Les jours d'une liste de demandes, dans l'ordre de la fenêtre. */
function dayOrder(asks: readonly SideCourseAsk[]): string[] {
  const first = new Map<string, number>();
  for (const a of asks) {
    const at = Number.isFinite(a.dayIndex) ? a.dayIndex : Number.MAX_SAFE_INTEGER;
    const prev = first.get(a.dayToken);
    if (prev === undefined || at < prev) first.set(a.dayToken, at);
  }
  return [...first.keys()].sort((x, y) =>
    (first.get(x)! - first.get(y)!) || (x < y ? -1 : x > y ? 1 : 0)
  );
}

/**
 * ⟳ 2026-09-23 — LE FAIT DE LA RÈGLE DE LA TABLE: deux personnes au moins ont
 * le même type d'à-côté au même repas (jour, moment). Sans lui, « un aliment
 * pour toute la table » ne dit rien, et c'est du bruit.
 */
function sharesAKindAtOneMeal(asks: readonly SideCourseAsk[]): boolean {
  const who = new Map<string, Set<string>>();
  for (const a of asks) {
    for (const k of kindsOf(a)) {
      const key = `${a.dayToken}|${a.slot}|${k}`;
      const set = who.get(key) ?? new Set<string>();
      set.add(a.memberId);
      if (set.size >= 2) return true;
      who.set(key, set);
    }
  }
  return false;
}

/**
 * v33 — UNE LIGNE PAR JOUR: `- mon: lunch — Alex starter + dessert; dinner — Alex dessert.`
 *
 * ⚠️ LE MOMENT SUIT `SIDE_COURSE_SLOTS` (déjeuner, puis dîner), jamais l'ordre
 * d'arrivée: deux appels avec les mêmes demandes rendent la même consigne.
 */
function dayLines(
  asks: readonly SideCourseAsk[],
  nameOf: ReadonlyMap<string, string>,
): { lines: string[]; named: number; cells: number } {
  const lines: string[] = [];
  let named = 0;
  let cells = 0;
  for (const day of dayOrder(asks)) {
    const slots: string[] = [];
    for (const slot of SIDE_COURSE_SLOTS) {
      const here = asks.filter((a) => a.dayToken === day && a.slot === slot);
      const f = personFragments(here, nameOf);
      if (f.parts.length === 0) continue;
      named += f.named;
      cells++;
      slots.push(`${slot} — ${f.parts.join(", ")}`);
    }
    if (slots.length > 0) lines.push(`- ${day}: ${slots.join("; ")}.`);
  }
  return { lines, named, cells };
}

/**
 * LE DESSERT, DIT PAR OBJECTIF — et seulement pour les objectifs présents.
 *
 * ⛔ GARDÉ PAR SON FAIT, comme les conséquences des cartes: « une consigne
 * servie sans le fait qui l'appelle est du bruit ». Une personne en perte, ou
 * un mineur, reste au fruit ou au laitage nature — et la personne en perte est
 * NOMMÉE, parce que c'est la règle la plus souvent violée par l'a priori « un
 * dessert est sucré ».
 *
 * ⟳ 2026-09-23 — UN SEUL ALIMENT. Tout dessert est UN aliment, jamais un
 * mélange. La ligne « Nuts are fine too » du maintien est retirée.
 * ⛔ AUCUN KCAL: la taille se dit en mots (`first_draft_contract_test.ts`).
 *
 * ⟳ 2026-09-23 (v40) — LA PRISE DE MUSCLE SUIT LA TABLE. La ligne v39 « a
 * DENSE dessert of ONE food: dried figs or dates, nuts… » pour la personne en
 * prise est RETIRÉE. Mesuré sur cinq générations v39: elle contredisait la
 * règle de la table (famille E: Hugo en prise recevait figues sèches ou noix,
 * les autres une pêche — 9 % de repas partagés), et « dried figs » était
 * servi comme la figue FRAÎCHE (`fig`, 69 kcal/100 g): le référentiel n'a pas
 * de figue sèche. Le surplus de la prise passe désormais par le moteur, au
 * pain puis au fromage (`SIDE_COURSE_REGROW_ORDER`, `side_courses.ts`).
 * La personne en prise qui partage un repas à dessert est NOMMÉE, parce que
 * l'a priori « prise = dessert plus riche » est exactement ce que v39 lui
 * avait appris.
 */
function dessertLines(
  asks: readonly SideCourseAsk[],
  nameOf: ReadonlyMap<string, string>,
): string[] {
  const withDessert = asks.filter((a) =>
    nameOf.has(a.memberId) && kindsOf(a).includes("dessert")
  );
  if (withDessert.length === 0) return [];
  const namesFor = (goal: SideCourseGoal): string[] => {
    const out: string[] = [];
    for (const a of withDessert) {
      const n = nameOf.get(a.memberId)!;
      if (a.goal === goal && !out.includes(n)) out.push(n);
    }
    return out;
  };
  // ⟳ 2026-09-23 (v40) — LE FAIT: une personne en prise a un dessert à un
  // repas où quelqu'un d'autre en a un aussi.
  const tableOf = (a: SideCourseAsk) => `${a.dayToken}|${a.slot}`;
  const sharing = new Map<string, Set<string>>();
  for (const a of withDessert) {
    const set = sharing.get(tableOf(a)) ?? new Set<string>();
    set.add(a.memberId);
    sharing.set(tableOf(a), set);
  }
  const gainAtTable: string[] = [];
  for (const a of withDessert) {
    const n = nameOf.get(a.memberId)!;
    if (
      a.goal === "muscle_gain" && (sharing.get(tableOf(a))?.size ?? 0) >= 2 &&
      !gainAtTable.includes(n)
    ) {
      gainAtTable.push(n);
    }
  }
  const only = namesFor("fat_loss");
  const out = [
    "  · dessert: one fruit or one plain dairy (plain yogurt, fromage blanc, skyr),",
    "    never a mix.",
  ];
  if (gainAtTable.length > 0) {
    out.push(
      `    For ${gainAtTable.join(", ")} too: the same dessert as the rest of the table, nothing denser.`,
    );
  }
  if (only.length > 0) {
    out.push(`    For ${only.join(", ")}: ONLY a fruit or a plain dairy, nothing sweeter.`);
  }
  return out;
}

/**
 * LE BLOC DES À-CÔTÉS, ET CE QU'IL A NOMMÉ LUI-MÊME.
 *
 * `perDay: true` (v33, personne seule): le bloc porte la répartition, une ligne
 * par jour. `perDay: false` (v34): la répartition est sur les lignes du
 * calendrier; le bloc renvoie à « the calendar marks "Side courses:" », et
 * `named`/`cells` valent 0 — c'est le calendrier qui les compte.
 *
 * ⚠️ PERSONNE À NOMMER ⇒ `""`, et la consigne est celle d'avant ce lot au
 * caractère près. C'est la contre-épreuve de chaque appelant.
 *
 * ⚠️ `nameOf` VA DE L'ID AU PRÉNOM (et pas l'inverse): deux personnes peuvent
 * porter le même prénom, jamais le même id. Les identifiants sont listés UNE
 * fois, dans ce bloc, pour la personne qui a au moins un à-côté.
 */
export function sideCoursesBlock(args: {
  asks: readonly SideCourseAsk[];
  nameOf: ReadonlyMap<string, string>;
  perDay: boolean;
}): { block: string; named: number; cells: number } {
  const asks = (args.asks ?? []).filter((a) =>
    args.nameOf.has(a.memberId) &&
    (SIDE_COURSE_SLOTS as readonly string[]).includes(a.slot) &&
    kindsOf(a).length > 0
  );
  if (asks.length === 0) return { block: "", named: 0, cells: 0 };

  const days = args.perDay ? dayLines(asks, args.nameOf) : { lines: [], named: 0, cells: 0 };
  const ids: string[] = [];
  for (const a of asks) if (!ids.includes(a.memberId)) ids.push(a.memberId);
  const where = args.perDay
    ? "At each lunch and dinner listed below, every person named gets the side"
    : 'At each lunch and dinner the calendar marks "Side courses:", every person';
  // ⟳ 2026-09-23 — LES FAITS QUI APPELLENT LES RÈGLES DES FAMILLES.
  const table = sharesAKindAtOneMeal(asks);
  const longWindow = dayOrder(asks).length >= 3;

  const lines = [
    SIDE_COURSES_HEADER,
    // ── LA PROMESSE, PUIS LA CLÉ, SIX LIGNES PLUS BAS AU PLUS ──────────────
    "The dish is not the whole meal: the app serves a side course beside it.",
    where,
    args.perDay
      ? "course(s) named there. You choose each food."
      : "named there gets the side course(s) named. You choose each food.",
    // ⟳ 2026-09-23 — LA TABLE ET LES DEUX JOURS, collées à la clé.
    ...(table
      ? [
        "Think of the TABLE, not of each plate: at one meal, ONE cheese, ONE dessert, ONE bread, ONE starter for everyone who has one; each person gets their own amount.",
      ]
      : []),
    // ⟳ 2026-09-23 (v40) — le pain hors de la règle: le même pain toute la
    // semaine est normal (compteur `streak_over_2`, qui ne le compte plus).
    ...(longWindow
      ? [
        "Serve a food 2 days in a row at most, then change it; bread may stay the same all week; over the plan, 2 to 3 cheeses, 3 to 4 fruits, 1 to 2 breads, so the shopping list stays short.",
      ]
      : []),
    "Return the foods in ONE more top-level key of the JSON:",
    '  "side_courses": [ { "day": "<day token>", "slot": "lunch"|"dinner",',
    '      "member_id": "<exact id>", "kind": "starter"|"cheese"|"dessert"|"bread",',
    '      "term": "<the food>", "ref": "<its id from THE FOOD IDS list, or null>",',
    '      "preparation_id": "<id of its preparation, or null>" } ]',
    // ⛔ L'ÉCHAPPATOIRE, COLLÉE À LA CLÉ — et SUR UNE LIGNE: c'est la phrase
    // que le test cherche telle quelle, et celle que le modèle doit lire d'un
    // trait.
    "One entry per person, per meal, per side course asked. Each one is",
    "a food named once, never grams, never a second dish.",
    // ⟳ 2026-09-23 — L'EXCEPTION À LA TABLE, nommée, sous l'échappatoire.
    ...(table
      ? [
        "Only someone who cannot eat the table's food (allergy, exclusion, diet) gets another food of the same kind.",
      ]
      : []),
    // ⟳ 2026-09-23 (v40) — LE NOM EXACT, JAMAIS LA CATÉGORIE. Mesuré sur cinq
    // générations v39: « banane » écrit avec `ref: "fruit"`, pesé 300 g. Le
    // moteur sert désormais l'aliment du terme quand il en désigne un
    // (`refNamedByTerm`); cette phrase fait écrire le bon identifiant d'abord.
    // ⚠️ Les exemples existent au référentiel (lu en base le 2026-09-23:
    // `apple`, `emmental`; `fruit` est « Fruit (average) », il n'y a pas de
    // `cheese`). Aucune figue: le référentiel n'a pas de figue sèche.
    'Name the exact food ("apple", "emmental"), never a category ("fruit", "cheese").',
    ...days.lines,
    `Exact member ids: ${ids.map((id) => `${args.nameOf.get(id)} = ${id}`).join("; ")}.`,
    "What each side course is:",
    "  · starter: raw vegetables (grated carrot, tomato, cucumber, a green salad)",
    "    or a vegetable soup. A soup or a grated salad made ahead is a PREPARATION:",
    '    write it in "preparations", cook it in a cooking session at most 3 days',
    '    before it is eaten, and give its id in "preparation_id".',
    "  · cheese: one cheese, as bought.",
    ...dessertLines(asks, args.nameOf),
    "  · bread: plain bread, as bought.",
    "Write no amount: the app weighs every side course for each person. Never put",
    "these foods inside the dish. A dairy dessert counts in the 250 g of fresh",
    "dairy per person per day.",
  ];
  return { block: lines.join("\n"), named: days.named, cells: days.cells };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA LANGUE DE LA CLÉ — ⟳ 2026-09-23 (vague 2, contrôle)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE CHAMP DE PROSE DE LA CLÉ `side_courses`: l'aliment nommé, lu à l'écran
 * (« 1 × pomme ») et par le juge des exclusions.
 *
 * ⛔ LE BLOC DE LANGUE PARLE EN DERNIER ET GAGNE PAR RÉCENCE
 * (`buildContentLanguageBlock`): « This applies to these fields and to nothing
 * else ». Sans cette ligne, un plan français recevait l'ordre de ne traduire
 * QUE les champs des plats — et `term` restait libre de sortir en anglais
 * (« apple » dans une boîte française, face à une note « pas de pomme »).
 */
export const SIDE_COURSES_TRANSLATABLE_FIELDS: readonly string[] = Object.freeze([
  "side_courses[].term",
]);

/**
 * LES JETONS DE LA CLÉ `side_courses`: comparés en code, jamais traduits.
 *
 * ⛔ `kind` EST LE PIÈGE DE `same_day.kind`, sur une cinquième clé: un
 * « fromage » dans un plan français est refusé `wrong_kind` par le registre, et
 * l'aliment choisi par le modèle est remplacé par la liste de secours. Le
 * vocabulaire est LU dans `SIDE_COURSE_KINDS`, pas recopié.
 * `day` et `slot` sont déjà des jetons de la liste du tronc (`MEAL_TOKEN_FIELDS`).
 */
export const SIDE_COURSES_TOKEN_FIELDS: readonly string[] = Object.freeze([
  `side_courses[].kind (one of: ${SIDE_COURSE_KINDS.join(", ")})`,
  "side_courses[].member_id (the exact id, never a name)",
  "side_courses[].ref (an id from the food list, never translated)",
  "side_courses[].preparation_id (must match preparations[].id exactly)",
]);

/**
 * CE QUE LE BLOC DE LANGUE DE LA COMPOSITION AJOUTE POUR LES À-CÔTÉS.
 *
 * ⛔ RIEN QUAND LE BLOC DES À-CÔTÉS N'EST PAS ÉCRIT (`prompt_asked = 0`).
 * Nommer un champ que le schéma ne déclare pas ferait rendre la clé « pour
 * obéir » — la cicatrice `promise-and-schema-key-must-be-adjacent` prise à
 * l'envers, déjà écrite sous `MEAL_TRANSLATABLE_FIELDS` pour la liste de
 * courses. Le compteur est celui que le constructeur de la consigne rend
 * (`HouseholdPromptBlocks.sideCourses`): la même source que la trace.
 *
 * ⚠️ PAS SUR LA RÉPARATION: elle écrit un patch des plats, jamais la clé
 * `side_courses` (le texte fusionné garde celle du premier jet).
 */
export function sideCoursesLanguageFields(counts: SideCoursesPromptCounts): {
  translatable: readonly string[];
  tokens: readonly string[];
} {
  if (!(counts.prompt_asked > 0)) return { translatable: [], tokens: [] };
  return { translatable: SIDE_COURSES_TRANSLATABLE_FIELDS, tokens: SIDE_COURSES_TOKEN_FIELDS };
}
