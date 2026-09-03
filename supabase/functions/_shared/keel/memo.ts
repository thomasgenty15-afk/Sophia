/**
 * LE MÉMO — cinq lignes, visibles, plafonnées. Lot M4 du chantier « mémoire ».
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.7 et §3.5 M4.
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
 *   · **caché**       → il se VOIT, sur la carte, avec sa cause (M2);
 *   · **sans plafond** → CINQ lignes, et la sixième est REFUSÉE;
 *   · **chaque prompt** → il y va, mais il est le SEUL bloc de texte libre que
 *     le produit injecte sans famille, et c'est pour ça qu'il est court.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE PLAFOND REFUSE. IL NE FAIT PAS TOMBER LA PLUS VIEILLE.
 * ═══════════════════════════════════════════════════════════════════════════
 * *« Un plafond force une décision. L'absence de plafond force
 * l'accumulation. »* Et faire tomber la plus ancienne serait une TROISIÈME
 * voie, pire que les deux: la ligne disparaîtrait sans que personne ne
 * l'ait décidé, et la personne découvrirait qu'une chose qu'elle avait
 * demandée a cessé d'agir, sans un mot.
 *
 * ⚠️ C'EST LA DIFFÉRENCE ASSUMÉE AVEC LE JOURNAL DE M5, qui lui JETTE le plus
 * ancien. Le journal est une trace de ce qui a eu lieu; le mémo est une
 * CONSIGNE qui agit. Perdre une trace coûte un « défaire »; perdre une
 * consigne change l'assiette.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES TROIS CONDITIONS D'ENTRÉE — et laquelle est vérifiable
 * ═══════════════════════════════════════════════════════════════════════════
 *   1. **factuelle** — pas un goût, pas une humeur;
 *   2. **actionnable** par le générateur;
 *   3. **inexprimable** dans un champ ou un indice existant.
 *
 * ⛔ 1 ET 2 SONT DES CONSIGNES DE PROMPT, ET C'EST AVOUÉ. Ce module ne sait pas
 * lire « factuel »; le producteur les porte, et un test de source vérifie
 * qu'elles y sont écrites. Les prétendre tenues ici serait la ceinture armée
 * sur un coffre vide.
 *
 * ⚠️ 3 EST STRUCTURELLE, ET C'EST LA SEULE QUI SE VÉRIFIE. Le mémo est le
 * RÉSIDU d'une classification: le producteur ne le remplit que pour ce à quoi
 * il n'a su donner AUCUNE famille. Une ligne de mémo produite dans le même
 * passage qu'un item qui dit la même chose serait un doublon dans deux formes,
 * dans un prompt qui a un budget.
 *
 * ⚠️ ── ET « 100 % SÛR » N'EST PAS UN CRITÈRE ────────────────────────────────
 * *« C'est un jugement que l'IA porte sur elle-même, et c'est précisément ce
 * qu'on ne peut pas vérifier. »* Aucune confiance n'entre donc ici — ni champ,
 * ni seuil. Une ligne est dedans ou dehors.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  parseRetainedDay,
  parseRetainedSource,
  RETAINED_QUOTE_MAX_CHARS,
  type RetainedSource,
} from "./retained_item.ts";

/** La clé, dans `student_goals.practical_constraints`. */
export const MEMO_KEY = "memo";

/**
 * CINQ. À la sixième, il faut en retirer une.
 *
 * ⚠️ CE NOMBRE EST UN ARBITRAGE, PAS UNE MESURE, et c'est écrit pour que
 * personne ne le prenne pour autre chose. Ce qui est vrai et vérifiable, c'est
 * qu'il force une décision: le monter le rendrait indolore, donc inutile;
 * le descendre à un en ferait une case, pas un mémo.
 */
export const MEMO_MAX_LINES = 5;

/**
 * ⚠️ MÊME PLAFOND DE CARACTÈRES QUE LA CITATION, et ce n'est pas un hasard: une
 * ligne de mémo est de la prose que la personne relit sur sa carte. Plus longue
 * que la note dont elle sort, elle ne serait plus une ligne — ce serait un
 * paragraphe injecté à chaque plan.
 */
export const MEMO_LINE_MAX_CHARS = RETAINED_QUOTE_MAX_CHARS;

export interface MemoLine {
  /** CE QUE LE GÉNÉRATEUR LIRA. Obligatoire, non vide, et c'est la vérité affichée. */
  readonly text: string;
  /** `YYYY-MM-DD`, le jour où ça a été dit. */
  readonly at: string;
  /** Qui l'a produite. ⛔ Jamais `written`: voir `parseMemoLine`. */
  readonly source: Exclude<RetainedSource, "written">;
  /**
   * ⛔ LES MOTS DE LA PERSONNE — lot M2, même règle et même raison.
   * Ici elle est encore plus nécessaire qu'ailleurs: une ligne de mémo n'a NI
   * famille NI valeur structurée. Sans sa cause, c'est une phrase libre qui
   * gouverne des assiettes et que personne ne peut rattacher à quoi que ce
   * soit — la définition même du magasin opaque que ce chantier supprime.
   */
  readonly quote: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

  return {
    text: text.slice(0, MEMO_LINE_MAX_CHARS),
    at,
    source,
    quote: quote.slice(0, RETAINED_QUOTE_MAX_CHARS),
  };
}

/** Une ligne difforme TOMBE SEULE et laisse ses voisines. */
export function parseMemoLines(value: unknown): MemoLine[] {
  if (!Array.isArray(value)) return [];
  const out: MemoLine[] = [];
  for (const entry of value) {
    const line = parseMemoLine(entry);
    if (line) out.push(line);
  }
  // ⛔ LE PLAFOND MORD AUSSI À LA LECTURE. Une colonne trafiquée, ou une version
  // future qui l'aurait dépassé, ne doit pas servir six lignes au modèle: la
  // garde qui ne tient qu'à l'écriture est une garde qu'un jsonb contourne.
  return out.slice(0, MEMO_MAX_LINES);
}

export function memoFrom(
  pc: Record<string, unknown> | null | undefined,
): MemoLine[] {
  return parseMemoLines((pc ?? {})[MEMO_KEY]);
}

export function memoLineToJson(line: MemoLine): Record<string, unknown> {
  return { text: line.text, at: line.at, source: line.source, quote: line.quote };
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

/**
 * AJOUTE UNE LIGNE, OU DIT POURQUOI ELLE N'EST PAS ENTRÉE.
 *
 * ⛔ AU PLAFOND, ON REFUSE — on ne fait pas tomber la plus ancienne. Voir
 * l'en-tête: une consigne qui disparaît sans décision change l'assiette sans
 * que personne ne l'ait voulu.
 *
 * ⛔ ET LE DOUBLON EST REFUSÉ AUSSI. Deux notes qui disent la même chose
 * mangeraient deux des cinq places, et le modèle lirait deux fois la même
 * consigne — ce qui, dans un prompt, la RENFORCE sans que personne ne l'ait
 * demandé. La comparaison est une ÉGALITÉ de texte normalisé, pas une
 * ressemblance: « laitue » ≠ « lait », et ce dépôt a mesuré 12 faux positifs
 * sur 12 le jour où quelqu'un a cru pouvoir rapprocher deux phrases.
 */
export function withMemoLine(
  pc: Record<string, unknown> | null | undefined,
  candidate: unknown,
): MemoWriteOutcome {
  const kept = memoFrom(pc);
  const line = parseMemoLine(candidate);
  if (!line) return { lines: kept, added: 0, refused: "unreadable" };

  const key = line.text.trim().toLowerCase();
  if (kept.some((existing) => existing.text.trim().toLowerCase() === key)) {
    return { lines: kept, added: 0, refused: "duplicate" };
  }
  if (kept.length >= MEMO_MAX_LINES) {
    return { lines: kept, added: 0, refused: "full" };
  }
  // Les neuves DEVANT: la carte lit du plus récent au plus ancien, comme le fil
  // de M2, et c'est la ligne qu'on vient d'ajouter qu'on veut voir en premier.
  return { lines: [line, ...kept], added: 1, refused: null };
}

/**
 * RETIRE LA LIGNE n° `index`. `null` est un REFUS, jamais un repli.
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

/**
 * CE QUE LE GÉNÉRATEUR REÇOIT — les textes, rien d'autre.
 *
 * ⛔ NI LA CITATION, NI LA DATE, NI LA SOURCE. Le modèle compose; il n'a pas à
 * savoir d'où vient une consigne, et lui donner la phrase source lui ferait
 * lire deux fois la même chose. La cause appartient à l'ÉCRAN, où elle sert à
 * décider si la ligne mérite de rester.
 */
export function memoLinesForPrompt(
  pc: Record<string, unknown> | null | undefined,
): string[] {
  return memoFrom(pc).map((line) => line.text);
}
