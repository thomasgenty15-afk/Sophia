/**
 * KEEL — THE token matcher. One implementation, two callers.
 *
 * WHY THIS FILE EXISTS AT ALL. Two independent post-generation locks exist in
 * this product, and they are the same mechanic pointed at two different lists:
 *
 *   1. `safety_constraints.ts` — the STUDENT's hard constraints. A generated
 *      sentence naming a `severity='medical'` allergen is rejected.
 *      (CONTRACT: "A deterministic post-generation validator rejects any output
 *      containing a severity='medical' token.")
 *   2. `doctrine.ts` — the COACH's INTERDITS. A generated sentence contradicting
 *      the coach's doctrine is rejected. (PLAN-NUIT §3.3 "double verrou":
 *      injected in the prompt AND checked deterministically on the output.)
 *
 * The first was written first, in full, with its own normalization, its own
 * word-boundary rules and its own negation exceptions. Writing the second by
 * copying it would have produced the exact defect the pivot plan lists as
 * adversarial pattern §7.3-(6): two sources of truth that can diverge. And they
 * WOULD diverge — the negation list is the part that gets edited (every new
 * "gluten-free" style false positive adds a construction), and an edit landing
 * in one copy and not the other is invisible until a coach is publicly
 * contradicted or an allergen slips through.
 *
 * So the matching engine lives here, once, and both locks are thin policy
 * layers on top of it. The two callers differ ONLY in what they consider a
 * violation and what they do about it -- which is exactly where they SHOULD
 * differ.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * A thing that must not be named, reduced to what the matcher needs.
 *
 * `surfaceForms` is what makes this usable for a coach doctrine. An allergen is
 * a slug (`tree_nut`) that expands into its own tolerant pattern; a coach
 * interdit is a CLAIM ("6 petits repas") whose canonical token
 * (`six_small_meals`) may never appear in prose at all. Both are supported:
 * the token is always matched, and every surface form is matched too.
 */
export interface ForbiddenTerm {
  /** Stable identity of the rule that owns this term (a constraint id, a doctrine token). */
  ruleId: string;
  /** ASCII snake_case identity (R1). Matched as a tolerant word sequence. */
  token: string;
  /** Extra literal phrasings, in any language. Optional. */
  surfaceForms?: readonly string[];
}

export interface ForbiddenMatch {
  ruleId: string;
  /** The token or surface form that matched, canonical (lowercased) form. */
  token: string;
  /** The literal substring of the analyzed text that matched. */
  matchedText: string;
  index: number;
}

export interface ForbiddenMatchOptions {
  /**
   * Default true. When true, a mention wrapped in one of the CLOSED negation
   * constructions below does not count.
   *
   * Why this exists, and why it is not "leniency": the contract, read
   * absolutely, rejects "gluten-free bread" for the coeliac student whose plan
   * is literally made of gluten-free items (SCHEMA.md acceptance fixture 3).
   * A validator that rejects every legitimate turn gets switched off within a
   * week, and a switched-off validator protects nobody. A narrow, documented,
   * tested exception list is the safer engineering choice than an absolute rule
   * nobody can live with. Pass `false` for the absolute reading (audit mode).
   */
  allowNegatedMentions?: boolean;
}

/** NFD-strip diacritics + lowercase, so 'proteine' matches 'protéine'. */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A slug or phrase becomes a tolerant word pattern: 'tree_nut' matches "tree
 * nut", "tree-nut", "tree nuts"; 'vitamin_d3' matches "vitamin d3"; "6 petits
 * repas" matches "6 petits repas" and "6-petits-repas". Word boundaries are
 * lookarounds on letters/digits so "peanut" does not match inside an unrelated
 * word.
 */
export function tokenPattern(token: string): RegExp {
  const parts = normalizeForMatch(token)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(escapeRegex);
  const body = parts.join("[\\s\\-_]*");
  return new RegExp(`(?<![a-z0-9])${body}(?:e?s)?(?![a-z0-9])`, "gi");
}

/**
 * CLOSED list of constructions that make a mention SAFE.
 *
 * EN + FR because the legacy branch still generates French, and a coach may
 * write his doctrine in either.
 */
/**
 * LES MOTS QUI NIENT.
 *
 * NOTE SUR LES CONTRACTIONS, et c'est le trou le plus cher qu'ait eu ce module.
 * `not` ne couvre PAS « doesn't »: il n'y a pas de « not » dans « doesn't », il
 * y a « n't ». Tant que la liste s'arrêtait aux formes pleines, la phrase que
 * `doctrine.ts` désigne nommément comme celle qui DOIT survivre —
 *
 *     "your coach doesn't do six small meals"
 *
 * — était rejetée, et le message entier de l'agent remplacé par le `instead` du
 * coach. L'élève qui demande « pourquoi pas 6 petits repas ? » recevait donc un
 * non-sequitur. Le test qui épinglait cette garantie n'existait qu'en FRANÇAIS
 * (« Marc ne fait pas de 6 petits repas ») — où la négation est PRÉ-nominale et
 * tombait juste par accident. Le produit, lui, a basculé en anglais.
 *
 * Côté médical le même trou donnait « you can't have peanuts » remplacé par
 * « pose la question à un médecin ».
 */
const NEGATION_WORD = [
  // EN — formes pleines
  "no",
  "not",
  "cannot",
  "without",
  "avoid",
  "avoids",
  "avoiding",
  "skip",
  "skips",
  "exclude",
  "excludes",
  "excluding",
  "never",
  "stop",
  "stops",
  "stopped",
  "stopping",
  "reject",
  "rejects",
  "rejected",
  "instead\\s+of",
  "rather\\s+than",
  "moved\\s+away\\s+from",
  "free\\s+(?:from|of)",
  "allergic\\s+to",
  "allergy\\s+to",
  "intolerant\\s+to",
  // EN — CONTRACTIONS. L'apostrophe typographique (U+2019) est acceptée au même
  // titre que l'ASCII: `normalizeForMatch` ne fait que retirer les diacritiques
  // et minusculiser, elle ne normalise pas les apostrophes, et un générateur en
  // produit constamment.
  "do(?:es)?\\s*n['’]t",
  "did\\s*n['’]t",
  "wo\\s*n['’]t",
  "ca\\s*n['’]t",
  "is\\s*n['’]t",
  "are\\s*n['’]t",
  "was\\s*n['’]t",
  "were\\s*n['’]t",
  "has\\s*n['’]t",
  "have\\s*n['’]t",
  "had\\s*n['’]t",
  "would\\s*n['’]t",
  "should\\s*n['’]t",
  "could\\s*n['’]t",
  // FR
  "sans",
  "pas",
  "aucun",
  "aucune",
  "eviter",
  "evite",
  "evitez",
  "evitons",
  "supprime",
  "supprimer",
  "supprimez",
  "jamais",
  "remplace",
  "remplacer",
  "remplacez",
  "a\\s+la\\s+place",
].join("|");

/**
 * LE VERBE qui peut s'intercaler entre la négation et la chose niée. Liste
 * FERMÉE, et UN SEUL verbe.
 *
 * Pourquoi ce créneau existe: en anglais la négation est PRÉ-verbale, donc elle
 * n'est presque jamais collée à l'objet. « doesn't DO six small meals »,
 * « can't HAVE peanuts », « won't PUT YOU ON six small meals ». Sans le créneau,
 * reconnaître « doesn't » ne sert à rien — le mot nié reste hors de portée. Le
 * français n'en a pas besoin (« ne fait PAS DE 6 petits repas » place déjà la
 * négation contre l'objet), et la liste reste donc anglaise à dessein.
 *
 * CE QUI REND L'ÉLARGISSEMENT SÛR n'est pas la liste, c'est l'ancre `$` du motif
 * complet: négation + verbe + déterminants doivent courir JUSQU'AU token. Une
 * négation qui porte sur autre chose ne blanchit rien —
 * « don't skip breakfast, have six small meals » mord toujours, parce que
 * « breakfast, » sépare la négation du token. C'est cette propriété qui est
 * testée, pas chaque mot de la liste.
 */
const NEGATED_VERB = [
  "do",
  "does",
  "doing",
  "use",
  "uses",
  "using",
  "have",
  "has",
  "had",
  "eat",
  "eats",
  "eating",
  "touch",
  "touches",
  "take",
  "takes",
  "taking",
  "recommend",
  "recommends",
  "recommending",
  "advise",
  "advises",
  "advising",
  "teach",
  "teaches",
  "teaching",
  "build",
  "builds",
  "building",
  "run",
  "runs",
  "running",
  "like",
  "likes",
  "want",
  "wants",
  "put\\s+you\\s+on",
  "go\\s+for",
  "goes\\s+for",
].join("|");

// NOTE ON THE ARTICLE LIST. It used to stop at `de`/`du`/`des`/`de la`/`d'`,
// which silently excluded the most common French determiners: "évite LES 6
// petits repas", "supprime LE pain", "on ne fait pas LA collation". Every one
// of those was a FALSE POSITIVE -- a legitimate sentence rejected -- on both
// locks, since the same list guards the medical validator. Found by
// `doctrine_test.ts` ("the agent may EXPLAIN an interdit"), and fixed here
// rather than in one caller, which is the entire reason this module exists.
const NEGATION_ARTICLE = [
  "any\\s+",
  "all\\s+",
  "the\\s+",
  "some\\s+",
  "du\\s+",
  "de\\s+la\\s+",
  "de\\s+l'\\s*",
  "des\\s+",
  "de\\s+",
  "d'\\s*",
  "le\\s+",
  "la\\s+",
  "les\\s+",
  "l'\\s*",
  "un\\s+",
  "une\\s+",
  "au\\s+",
  "aux\\s+",
  "ce\\s+",
  "cette\\s+",
  "ces\\s+",
  "ton\\s+",
  "ta\\s+",
  "tes\\s+",
  "your\\s+",
].join("|");

const NEGATION_BEFORE = new RegExp(
  `(?:\\b(?:${NEGATION_WORD})\\s+(?:(?:${NEGATED_VERB})\\s+)?(?:${NEGATION_ARTICLE})*)$`,
);

const NEGATION_AFTER =
  /^(?:\s*[-\s]?free\b|\s*[-\s]?sans\b|\s+allerg(?:y|ies|ic|ie|ique|ies)\b|\s+intoleran(?:ce|t)\b)/;

/**
 * Scan `text` for every forbidden term, returning each surviving occurrence.
 *
 * Pure, deterministic, zero-I/O. Callers decide what a match MEANS: the safety
 * lock throws, the doctrine lock regenerates.
 */
export function findForbiddenMatches(
  text: string,
  terms: readonly ForbiddenTerm[],
  options: ForbiddenMatchOptions = {},
): ForbiddenMatch[] {
  const allowNegated = options.allowNegatedMentions !== false;
  const haystackRaw = String(text ?? "");
  if (!haystackRaw.trim()) return [];
  const haystack = normalizeForMatch(haystackRaw);
  // Diacritic stripping preserves length for precomposed input, but not for
  // already-decomposed input. When the two disagree, report the normalized
  // match rather than slicing the raw text at a shifted offset.
  const offsetsAligned = haystack.length === haystackRaw.length;

  const matches: ForbiddenMatch[] = [];
  for (const term of terms) {
    const needles = [term.token, ...(term.surfaceForms ?? [])]
      .map((n) => String(n ?? "").trim())
      .filter(Boolean);
    for (const needle of needles) {
      const pattern = tokenPattern(needle);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(haystack)) !== null) {
        if (match[0].length === 0) {
          pattern.lastIndex += 1;
          continue;
        }
        const before = haystack.slice(0, match.index);
        const after = haystack.slice(match.index + match[0].length);
        if (
          allowNegated &&
          (NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after))
        ) {
          continue;
        }
        matches.push({
          ruleId: term.ruleId,
          token: needle.toLowerCase(),
          matchedText: offsetsAligned
            ? haystackRaw.slice(match.index, match.index + match[0].length)
            : match[0],
          index: match.index,
        });
      }
    }
  }

  // ONE OCCURRENCE IS ONE VIOLATION.
  //
  // A term is matched once per needle (its token, then each surface form), and
  // those needles overlap by design: the token `six_small_meals` expands to a
  // pattern that already matches the literal surface form "six small meals". A
  // single sentence therefore produced TWO identical violations at the same
  // offset, which inflates every count downstream -- the incident log, the
  // "how often did the agent contradict me" number a coach reads, and the retry
  // instruction, which would repeat itself.
  //
  // Deduplication is per (rule, offset), NOT per offset: two DIFFERENT interdits
  // legitimately colliding at the same position are two real findings. Where
  // needles overlap, the longest match wins -- it is the most specific phrasing,
  // and the one a human reading the report needs to see.
  const best = new Map<string, ForbiddenMatch>();
  for (const m of matches) {
    const key = `${m.ruleId} ${m.index}`;
    const kept = best.get(key);
    if (!kept || m.matchedText.length > kept.matchedText.length) best.set(key, m);
  }
  return [...best.values()].sort((a, b) =>
    a.index - b.index || a.ruleId.localeCompare(b.ruleId)
  );
}
