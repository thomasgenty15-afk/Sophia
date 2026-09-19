/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-19 — LE DÉROULÉ D'UNE SESSION NE CITE PLUS UNE CASSEROLE RETIRÉE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, LU SUR LE PLAN ADOPTÉ DU 2026-09-19 (foyer `fagenty`) ─────
 * La session du lundi disait : « Mettre l'orge et le poulet à cuire en premier.
 * Pendant les mijotages, cuire le brocoli… Poêler le cabillaud, terminer les
 * trois préparations… ». Il n'y avait NI orge, NI brocoli, NI cabillaud dans
 * le plan ni dans les courses : la préparation cabillaud-orge avait été
 * retirée (« aucune boîte ne s'en sert — ni cuisinée, ni achetée »), et le
 * moteur avait retiré son id de la session… sans toucher au texte. Quelqu'un
 * qui suit ce déroulé cherche un poisson qu'il n'a pas acheté.
 *
 * ── CE QUE FAIT CE MODULE ──────────────────────────────────────────────────
 * Pur, déterministe, sans modèle et sans langue : il retire du déroulé les
 * PHRASES qui nomment la casserole retirée — par son titre (mots de cinq
 * lettres et plus) et par ses ingrédients — et, s'il ne reste rien de lisible,
 * pose la liste des casseroles restantes. Les titres sont déjà dans la langue
 * du plan ; on ne traduit rien.
 *
 * ⚠️ CE QU'IL NE SAIT PAS FAIRE, ET C'EST DIT : réécrire une phrase qui mêle
 * une casserole retirée et une casserole gardée (« terminer les trois
 * préparations »). Cette phrase-là tombe entière. Un déroulé plus court et
 * vrai vaut mieux qu'un déroulé complet et faux.
 */

export interface RemovedPreparationWords {
  readonly id: string;
  readonly title: string;
  readonly ingredientTerms: readonly string[];
}

export interface RunThroughRewrite {
  readonly text: string;
  readonly droppedSentences: number;
  readonly keptSentences: number;
  /** `true` quand plus aucune phrase ne tenait : le texte est la liste des casseroles. */
  readonly fellBackToTitles: boolean;
}

/**
 * ⚠️ DEUX PLANCHERS, ET LA DIFFÉRENCE EST MESURÉE. Un titre porte des mots de
 * liaison (« à », « et », « aux ») et des génériques (« plat », « lot ») :
 * cinq lettres les écartent. Un ingrédient, lui, est un nom d'aliment, et
 * « orge », « lait », « thon » en ont quatre — c'est « l'orge » qui restait
 * dans le déroulé du lundi. La comparaison se fait au MOT ENTIER (« orge » ne
 * touche pas « gorgé »), ce qui rend le plancher bas sûr.
 */
const MIN_TITLE_WORD = 5;
const MIN_INGREDIENT_WORD = 4;

/** Minuscules, sans accents, pour comparer des mots qu'un modèle a fléchis. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Les mots-clés d'une casserole : son titre et ses ingrédients, pliés. */
export function needlesOf(removed: RemovedPreparationWords): string[] {
  const out = new Set<string>();
  for (const w of fold(removed.title).split(/[^a-z0-9]+/)) {
    if (w.length >= MIN_TITLE_WORD) out.add(w);
  }
  for (const term of removed.ingredientTerms) {
    for (const w of fold(term).split(/[^a-z0-9]+/)) {
      if (w.length >= MIN_INGREDIENT_WORD) out.add(w);
    }
  }
  return [...out];
}

/** Découpe en phrases sur `. ! ?` suivis d'un blanc — le plus simple qui tienne. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function runThroughWithoutPreparations(args: {
  readonly runThrough: string;
  readonly removed: readonly RemovedPreparationWords[];
  readonly remainingTitles: readonly string[];
}): RunThroughRewrite {
  const needles = args.removed.flatMap(needlesOf);
  const sentences = splitSentences(args.runThrough);
  if (needles.length === 0 || sentences.length === 0) {
    return {
      text: args.runThrough,
      droppedSentences: 0,
      keptSentences: sentences.length,
      fellBackToTitles: false,
    };
  }
  // ⚠️ MOT ENTIER, pas sous-chaîne : « orge » ne doit pas faire tomber
  // « gorgé », et « poulet » ne tombe que pour LA casserole retirée qui le
  // porte.
  const hit = (sentence: string): boolean => {
    const words = new Set(fold(sentence).split(/[^a-z0-9]+/));
    return needles.some((n) => words.has(n));
  };
  const kept = sentences.filter((s) => !hit(s));
  const dropped = sentences.length - kept.length;
  if (kept.length > 0) {
    return {
      text: kept.join(" "),
      droppedSentences: dropped,
      keptSentences: kept.length,
      fellBackToTitles: false,
    };
  }
  return {
    text: args.remainingTitles.filter((t) => t.trim() !== "").join(" · "),
    droppedSentences: dropped,
    keptSentences: 0,
    fellBackToTitles: true,
  };
}
