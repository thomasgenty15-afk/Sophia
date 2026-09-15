/**
 * « CE QUE SOPHIA SAIT » — la destination ③, par personne, au jour nommé.
 * Lot M4 du chantier « mémoire » (2026-09-01), réécrit au lot A du chantier
 * « trois destinations » (2026-09-03).
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2.2 ③, §2.3, §3
 * (« la forme d'une note »), §4-ter.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE MODULE EST LE PLUS DANGEREUX DU CHANTIER, ET IL FAUT LE DIRE ICI
 * ═══════════════════════════════════════════════════════════════════════════
 * *« Un champ texte CACHÉ, SANS PLAFOND, INJECTÉ DANS CHAQUE PROMPT, c'est
 * exactement le magasin qu'on supprime, avec un autre chapeau. Et c'est la
 * chose la plus difficile à déboguer du produit: le jour où un plan part de
 * travers, personne ne peut dire pourquoi. »*
 *
 * Les trois mots de cette phrase sont les trois gardes de ce fichier, et
 * chacune est vérifiée plutôt que promise:
 *   · **caché**       → il se VOIT, sur la carte, avec sa cause (M2) et sa
 *                       PERSONNE (lot A);
 *   · **sans plafond** → CINQ lignes PAR PERSONNE, et la sixième est REFUSÉE;
 *   · **chaque prompt** → il y va, mais il est le SEUL bloc de texte libre que
 *     le produit injecte sans famille, et c'est pour ça qu'il est court.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ UNE NOTE PORTE SA PERSONNE — lot A, 2026-09-03
 * ═══════════════════════════════════════════════════════════════════════════
 * « Léa a danse le mardi soir » servie à toute la table donne une grosse part
 * à Tom. Une ligne neuve porte donc un `subject` (`member:<uuid>` ou
 * `household`), et le générateur ne lit que les lignes DE LA BOUCHE dont il
 * écrit le brief. Le plafond suit: cinq par personne, pas cinq au total — la
 * danse de Léa ne se compte pas sur le budget de son frère.
 *
 * ⚠️ UNE LIGNE D'AVANT LE LOT N'A PAS DE SUJET, ET SE LIT `household`. Elle
 * était servie dans le tronc, à toute la table: c'est ce qu'elle était, et
 * c'est ce qu'elle reste. Lui inventer une bouche serait une attribution que
 * personne n'a déclarée; la refuser ferait disparaître une consigne de la
 * carte entre deux chargements, sans un mot. Un sujet PRÉSENT mais difforme,
 * lui, est un refus: le socle ne replie jamais un sujet sur la table.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE JOUR NOMMÉ EST NOMMÉ AU MODÈLE — pas seulement stocké
 * ═══════════════════════════════════════════════════════════════════════════
 * Cicatrice du dépôt (`named-day-calendar-vs-model-prior`): donner la donnée
 * ne suffit pas, le modèle lisse les jours. Une note qui porte un `when`
 * (`{weekday, slot}`, vocabulaire FERMÉ) est rendue « Tuesday dinner — Léa:
 * … », et l'en-tête du bloc dit que ce jour-là est l'EXCEPTION.
 *
 * ⚠️ UN `when` HORS VOCABULAIRE FAIT TOMBER LA LIGNE. « mardi » n'est pas
 * `tue`: replier sur `null` servirait « gros repas » TOUS les jours au lieu du
 * mardi — l'inverse exact de ce que la note dit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE PLAFOND REFUSE. IL NE FAIT PAS TOMBER LA PLUS VIEILLE.
 * ═══════════════════════════════════════════════════════════════════════════
 * *« Un plafond force une décision. L'absence de plafond force
 * l'accumulation. »* Faire tomber la plus ancienne serait une TROISIÈME voie,
 * pire que les deux: la ligne disparaîtrait sans que personne ne l'ait décidé.
 * C'EST LA DIFFÉRENCE ASSUMÉE AVEC LE JOURNAL DE M5, qui lui JETTE le plus
 * ancien: une trace perdue coûte un « défaire »; une consigne perdue change
 * l'assiette.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES TROIS CONDITIONS D'ENTRÉE — et laquelle est vérifiable
 * ═══════════════════════════════════════════════════════════════════════════
 *   1. **factuelle** — pas un goût, pas une humeur;
 *   2. **actionnable** par le générateur;
 *   3. **inexprimable** en préférence (①) ni en indice (②).
 *
 * ⛔ 1 ET 2 SONT DES CONSIGNES DE PROMPT, ET C'EST AVOUÉ. Ce module ne sait pas
 * lire « factuel »; le producteur (`draft_note_classify.ts`) les porte.
 * ⚠️ 3 EST STRUCTURELLE: le classifieur essaie ① puis ② AVANT ③, et la règle
 * anti-doublon (§2.3) dit qu'un fait qui passe le test de ① ne va jamais ici.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  HOUSEHOLD_SUBJECT,
  parseRetainedDay,
  parseRetainedSource,
  parseRetainedSubject,
  RETAINED_QUOTE_MAX_CHARS,
  type RetainedSource,
  type RetainedSubject,
  RHYTHM_OCCASIONS,
  type RhythmOccasion,
} from "./retained_item.ts";
import { DAY_TOKENS, type DayToken } from "./tokens.ts";

/** La clé, dans `student_goals.practical_constraints`. */
export const MEMO_KEY = "memo";

/**
 * CINQ, PAR PERSONNE. À la sixième pour la même bouche, il faut en retirer une.
 *
 * ⚠️ CE NOMBRE EST UN ARBITRAGE, PAS UNE MESURE, et c'est écrit pour que
 * personne ne le prenne pour autre chose. Ce qui est vrai et vérifiable, c'est
 * qu'il force une décision: le monter le rendrait indolore, donc inutile;
 * le descendre à un en ferait une case, pas un mémo.
 */
export const MEMO_MAX_LINES_PER_SUBJECT = 5;

/**
 * ⚠️ MÊME PLAFOND DE CARACTÈRES QUE LA CITATION, et ce n'est pas un hasard: une
 * ligne de mémo est de la prose que la personne relit sur sa carte. Plus longue
 * que la note dont elle sort, elle ne serait plus une ligne — ce serait un
 * paragraphe injecté à chaque plan.
 */
export const MEMO_LINE_MAX_CHARS = RETAINED_QUOTE_MAX_CHARS;

/**
 * QUAND ça compte — un jour de semaine, un moment du jour, ou les deux.
 *
 * ⚠️ VOCABULAIRES FERMÉS, et ce sont ceux du produit: `DAY_TOKENS` (les jours
 * que `cook_days` et les plans portent) et `RHYTHM_OCCASIONS` (les six moments
 * du rythme alimentaire). Un troisième vocabulaire de jours ou de moments dans
 * ce dépôt serait la « dimanche bug class » de `tokens.ts`, une fois de plus.
 */
export type MemoWhen = {
  readonly weekday: DayToken | null;
  readonly slot: RhythmOccasion | null;
};

export interface MemoLine {
  /** CE QUE LE GÉNÉRATEUR LIRA. Obligatoire, non vide, et c'est la vérité affichée. */
  readonly text: string;
  /** `YYYY-MM-DD`, le jour où ça a été dit. */
  readonly at: string;
  /** Qui l'a produite. ⛔ Jamais `written`: voir `parseMemoLine`. */
  readonly source: Exclude<RetainedSource, "written">;
  /**
   * ⛔ LES MOTS DE LA PERSONNE — lot M2, même règle et même raison.
   * Une ligne de mémo n'a NI famille NI valeur structurée. Sans sa cause, c'est
   * une phrase libre qui gouverne des assiettes et que personne ne peut
   * rattacher à quoi que ce soit — la définition même du magasin opaque.
   */
  readonly quote: string;
  /** DE QUI on parle — lot A. `household` pour une ligne d'avant le lot. */
  readonly subject: RetainedSubject;
  /** QUAND ça compte — lot A. `null` = tous les jours, tous les repas. */
  readonly when: MemoWhen | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Lit un `when`. `null` quand il n'y en a pas; `"unreadable"` quand il y en a
 * un et qu'il ne dit rien de lisible.
 *
 * ⛔ `"unreadable"` ET PAS `null`, et c'est la garde. Un `when` illisible
 * replié sur « tous les jours » servirait la note à l'envers de ce qu'elle dit
 * (voir l'en-tête). L'appelant fait tomber la ligne entière.
 */
export function parseMemoWhen(value: unknown): MemoWhen | null | "unreadable" {
  if (value === null || value === undefined) return null;
  const row = asRecord(value);
  if (!row) return "unreadable";
  let weekday: DayToken | null = null;
  if (row.weekday !== null && row.weekday !== undefined) {
    const slug = String(row.weekday).trim().toLowerCase();
    if (!(DAY_TOKENS as readonly string[]).includes(slug)) return "unreadable";
    weekday = slug as DayToken;
  }
  let slot: RhythmOccasion | null = null;
  if (row.slot !== null && row.slot !== undefined) {
    const slug = String(row.slot).trim().toLowerCase();
    if (!(RHYTHM_OCCASIONS as readonly string[]).includes(slug)) return "unreadable";
    slot = slug as RhythmOccasion;
  }
  if (weekday === null && slot === null) return "unreadable";
  return { weekday, slot };
}

/**
 * Lit une ligne. `null` à la première chose illisible — jamais un repli.
 *
 * ⛔ `written` EST REFUSÉ. La personne qui écrit elle-même une consigne a un
 * endroit pour ça (`written` dans le magasin structuré, avec une famille). Le
 * mémo est ce que **le produit** a retenu sans savoir où le ranger; y laisser
 * entrer `written` en ferait un champ texte libre de plus, sans famille et sans
 * lecteur nommé — et c'est le refus qui garde aussi la porte du contournement:
 * `canProduce("written", …)` autorise tout.
 */
export function parseMemoLine(value: unknown): MemoLine | null {
  const row = asRecord(value);
  if (!row) return null;

  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!text) return null;

  const at = parseRetainedDay(row.at);
  if (!at) return null;

  const source = parseRetainedSource(row.source);
  if (!source || source === "written") return null;

  const quote = typeof row.quote === "string" ? row.quote.trim() : "";
  if (!quote) return null;

  // ── LE SUJET — absent = la table (ligne d'avant le lot), difforme = REFUS ──
  let subject: RetainedSubject = HOUSEHOLD_SUBJECT;
  if (row.subject !== undefined && row.subject !== null) {
    const parsed = parseRetainedSubject(row.subject);
    if (!parsed) return null;
    subject = parsed;
  }

  const when = parseMemoWhen(row.when);
  if (when === "unreadable") return null;

  return {
    text: text.slice(0, MEMO_LINE_MAX_CHARS),
    at,
    source,
    quote: quote.slice(0, RETAINED_QUOTE_MAX_CHARS),
    subject,
    when,
  };
}

/**
 * Une ligne difforme TOMBE SEULE et laisse ses voisines.
 *
 * ⛔ LE PLAFOND MORD AUSSI À LA LECTURE, PAR PERSONNE. Une colonne trafiquée,
 * ou une version future qui l'aurait dépassé, ne doit pas servir six lignes
 * d'une même bouche au modèle: la garde qui ne tient qu'à l'écriture est une
 * garde qu'un jsonb contourne.
 */
export function parseMemoLines(value: unknown): MemoLine[] {
  if (!Array.isArray(value)) return [];
  const out: MemoLine[] = [];
  const perSubject = new Map<string, number>();
  for (const entry of value) {
    const line = parseMemoLine(entry);
    if (!line) continue;
    const seen = perSubject.get(line.subject) ?? 0;
    if (seen >= MEMO_MAX_LINES_PER_SUBJECT) continue;
    perSubject.set(line.subject, seen + 1);
    out.push(line);
  }
  return out;
}

export function memoFrom(
  pc: Record<string, unknown> | null | undefined,
): MemoLine[] {
  return parseMemoLines((pc ?? {})[MEMO_KEY]);
}

/** Les lignes DE CETTE PERSONNE (ou de la table), dans l'ordre de la carte. */
export function memoLinesFor(
  pc: Record<string, unknown> | null | undefined,
  subject: RetainedSubject,
): MemoLine[] {
  return memoFrom(pc).filter((line) => line.subject === subject);
}

export function memoLineToJson(line: MemoLine): Record<string, unknown> {
  return {
    text: line.text,
    at: line.at,
    source: line.source,
    quote: line.quote,
    subject: line.subject,
    when: line.when ? { weekday: line.when.weekday, slot: line.when.slot } : null,
  };
}

/** Pourquoi une ligne n'est pas entrée. Jamais un silence. */
export type MemoRefusal = "full" | "duplicate" | "unreadable";

export interface MemoWriteOutcome {
  /** Le mémo APRÈS, ou celui d'avant quand rien n'est entré. */
  readonly lines: readonly MemoLine[];
  /** Ce qui est entré. `0` ou `1` — on n'écrit qu'une ligne à la fois. */
  readonly added: number;
  readonly refused: MemoRefusal | null;
}

function contentKeyOf(line: MemoLine): string {
  return `${line.subject} ${line.text.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * AJOUTE UNE LIGNE, OU DIT POURQUOI ELLE N'EST PAS ENTRÉE.
 *
 * ⛔ AU PLAFOND DE CETTE PERSONNE, ON REFUSE — on ne fait pas tomber la plus
 * ancienne. Voir l'en-tête.
 *
 * ⛔ ET LE DOUBLON EST REFUSÉ AUSSI, POUR LA MÊME PERSONNE. Deux notes qui
 * disent la même chose mangeraient deux des cinq places, et le modèle lirait
 * deux fois la même consigne — ce qui, dans un prompt, la RENFORCE sans que
 * personne ne l'ait demandé. La comparaison est une ÉGALITÉ de texte
 * normalisé + sujet, pas une ressemblance: « laitue » ≠ « lait », et la même
 * phrase pour Tom n'est pas la ligne de Léa.
 */
export function withMemoLine(
  pc: Record<string, unknown> | null | undefined,
  candidate: unknown,
): MemoWriteOutcome {
  const kept = memoFrom(pc);
  const line = parseMemoLine(candidate);
  if (!line) return { lines: kept, added: 0, refused: "unreadable" };

  const key = contentKeyOf(line);
  if (kept.some((existing) => contentKeyOf(existing) === key)) {
    return { lines: kept, added: 0, refused: "duplicate" };
  }
  const mine = kept.filter((existing) => existing.subject === line.subject);
  if (mine.length >= MEMO_MAX_LINES_PER_SUBJECT) {
    return { lines: kept, added: 0, refused: "full" };
  }
  // Les neuves DEVANT: la carte lit du plus récent au plus ancien, comme le fil
  // de M2, et c'est la ligne qu'on vient d'ajouter qu'on veut voir en premier.
  return { lines: [line, ...kept], added: 1, refused: null };
}

/**
 * RETIRE LA LIGNE n° `index` DE LA LISTE ENTIÈRE. `null` est un REFUS, jamais
 * un repli.
 *
 * ⛔ PAR POSITION, JAMAIS PAR TEXTE. Deux lignes proches se distinguent par
 * leur place, et retirer la mauvaise ferait disparaître une consigne que la
 * personne voulait garder — sur un magasin dont chaque ligne agit.
 */
export function withoutMemoLine(
  pc: Record<string, unknown> | null | undefined,
  index: number,
): MemoLine[] | null {
  const kept = memoFrom(pc);
  if (!Number.isInteger(index) || index < 0 || index >= kept.length) return null;
  return kept.filter((_, i) => i !== index);
}

// ===========================================================================
// LE RENDU — le jour est NOMMÉ, en anglais, la langue du prompt
// ===========================================================================

const WEEKDAY_LABEL: Readonly<Record<DayToken, string>> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const SLOT_LABEL: Readonly<Record<RhythmOccasion, string>> = {
  breakfast: "breakfast",
  snack_am: "morning snack",
  lunch: "lunch",
  snack_pm: "afternoon snack",
  dinner: "dinner",
  before_bed: "before bed",
};

/**
 * UNE LIGNE, TELLE QUE LE MODÈLE LA LIT: `Tuesday dinner — Léa: <texte>`.
 *
 * @param who le prénom de la bouche, ou `null` pour la table / le solo.
 *   ⚠️ Le prénom est celui que l'appelant a sous la main (`displayName`); ce
 *   module ne résout aucun `member_id` en prénom.
 */
export function renderMemoLine(line: MemoLine, who: string | null): string {
  const when = line.when
    ? [
      line.when.weekday ? WEEKDAY_LABEL[line.when.weekday] : null,
      line.when.slot ? SLOT_LABEL[line.when.slot] : null,
    ].filter((p): p is string => p !== null).join(" ")
    : "";
  const name = String(who ?? "").trim();
  const head = name ? `${name}: ` : "";
  return when ? `${when} — ${head}${line.text}` : `${head}${line.text}`;
}

/**
 * CE QUE LE GÉNÉRATEUR REÇOIT — les lignes DE CE SUJET, rendues.
 *
 * ⛔ NI LA CITATION, NI LA DATE, NI LA SOURCE. Le modèle compose; il n'a pas à
 * savoir d'où vient une consigne, et lui donner la phrase source lui ferait
 * lire deux fois la même chose. La cause appartient à l'ÉCRAN.
 *
 * ⛔ `subject` EST REQUIS. L'ancienne signature (tout le mémo, sans sujet) a
 * disparu exprès: un appelant qui la garderait servirait la danse de Léa à
 * toute la table, et le compilateur est ce qui l'en empêche.
 */
export function memoLinesForPrompt(
  pc: Record<string, unknown> | null | undefined,
  args: { subject: RetainedSubject; who: string | null },
): string[] {
  return memoLinesFor(pc, args.subject).map((line) => renderMemoLine(line, args.who));
}
