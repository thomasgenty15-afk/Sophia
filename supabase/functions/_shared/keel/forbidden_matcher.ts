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

/**
 * NFD-strip diacritics + lowercase, so 'proteine' matches 'protéine'.
 *
 * ── LA LIGATURE QUI A SERVI DES ŒUFS À UN ALLERGIQUE (2026-09-05, audit) ──
 * Tom porte `allergen_ref='egg'`, `severity='medical'`, et le prompt transmet
 * bien « Tom: egg / eggs / oeuf — allergy, severity=medical ». Le plan rendu
 * contenait `œufs` dans une préparation servie à Tom, avec `group = eggs`.
 *
 * La cause tient en un caractère. NFD DÉCOMPOSE les diacritiques (é → e + ´)
 * mais ne décompose PAS les ligatures: « œ » reste « œ », et le catalogue ne
 * connaît que `oeuf`. Mesuré avant le correctif:
 *
 *     tokenPattern("oeuf").test("des oeufs")   -> true
 *     tokenPattern("oeuf").test("des œufs")    -> false      ← sortie réelle
 *
 * Les trois ligatures du français et de l'allemand sont dépliées ici, APRÈS le
 * passage en minuscules (« Œufs brouillés » en début de titre est le cas
 * courant). Ce n'est pas une inférence: c'est la même lettre, écrite en un
 * signe ou en deux.
 *
 * ⚠️ La longueur du texte change quand une ligature est dépliée. C'est déjà
 * prévu: `findForbiddenMatches` compare les longueurs (`offsetsAligned`) et
 * retombe sur le texte normalisé pour `matchedText` quand elles diffèrent.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .replace(/\u00df/g, "ss");
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
  // RETIRER / SUBSTITUER — le trou symétrique de celui des contractions, et il
  // était LIVE en anglais (QA agent 4, 2026-08-03). Le français avait déjà
  // `supprime`/`remplace`; l'anglais n'avait ni `remove` ni `replace` ni
  // `swap`. Mesuré sur une contrainte `peanut` `severity='medical'`:
  //
  //   "Replace the peanuts with pumpkin seeds."  -> REJETÉ
  //   "Remove the peanut butter from breakfast." -> REJETÉ
  //   "Swap the peanuts for pumpkin seeds."      -> REJETÉ
  //
  // Ce sont les phrases les plus normales qu'un agent de nutrition produise à
  // propos d'un allergène — c'est littéralement le vocabulaire de
  // `autonomy='swap_within_policy'`. Chacune faisait remplacer le message
  // ENTIER par « pose la question à un médecin ». Le test qui couvrait cette
  // garantie n'existait qu'en FRANÇAIS, où la liste était complète: le même
  // accident de langue que les contractions, à l'envers.
  "remove",
  "removes",
  "removing",
  "replace",
  "replaces",
  "replacing",
  "swap",
  "swaps",
  "swapping",
  "drop",
  "drops",
  "dropping",
  "omit",
  "omits",
  "omitting",
  "leave\\s+out",
  "leaves\\s+out",
  "cut\\s+out",
  "cuts\\s+out",
  "take\\s+out",
  "takes\\s+out",
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
  // CUISINER. Ajouté avec la liste d'ALIMENTS déconseillés du coach, parce que
  // c'est le verbe que prend cette liste-là. Un interdit est une PRATIQUE et se
  // nie avec « doesn't DO six small meals »; un aliment est un INGRÉDIENT et se
  // nie avec « doesn't COOK WITH seed oil ». Sans ces trois formes, la phrase
  // que l'en-tête de `doctrine.ts` désigne comme devant survivre — l'agent
  // EXPLIQUE la méthode de son coach — était bloquée, et le message entier
  // remplacé. Mesuré, pas supposé.
  "cook",
  "cooks",
  "cooking",
].join("|");

/**
 * LA PRÉPOSITION qui peut suivre le verbe. Liste FERMÉE, volontairement
 * minuscule.
 *
 * Créneau séparé et non fondu dans `NEGATION_ARTICLE`: un déterminant et une
 * préposition ne se placent pas au même endroit, et les mélanger autoriserait
 * des enchaînements que personne n'écrit tout en rendant la règle illisible.
 *
 * CE QUI REND L'AJOUT SÛR reste l'ancre `$` de `NEGATION_BEFORE`: négation,
 * verbe, préposition et déterminants doivent courir SANS INTERRUPTION jusqu'au
 * token. « don't skip breakfast, cook with seed oil » mord donc toujours — la
 * virgule après « breakfast » casse la course. C'est cette propriété qui est
 * testée, pas chaque mot de la liste.
 */
const NEGATION_PREPOSITION = [
  "with\\s+",
  "avec\\s+",
  "a\\s+l'\\s*",
  "a\\s+la\\s+",
  "au\\s+",
  "aux\\s+",
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
  `(?:\\b(?:${NEGATION_WORD})\\s+(?:(?:${NEGATED_VERB})\\s+)?(?:${NEGATION_PREPOSITION})?(?:${NEGATION_ARTICLE})*)$`,
);

/**
 * ⛔ « SANS » NE NIE QUE CE QUI LE SUIT (2026-09-06).
 *
 * Cette règle blanchit un terme d'après ce qui vient APRÈS lui. Elle portait
 * `sans`, et c'est un contresens de langue: en français « sans » nie le mot
 * QUI SUIT, jamais celui qui précède. Conséquence mesurée sur le vrai
 * `parseGeneratedMeal`, contrainte `milk`, `severity='medical'`:
 *
 *     « lait de vache »                -> retiré du plat et des courses
 *     « lait sans lactose »            -> CONSERVÉ                ← le défaut
 *     « lait sans lactose de vache »   -> CONSERVÉ
 *
 * Or « sans lactose » ne veut pas dire « sans protéines de lait »: un lait
 * délactosé reste du lait, et c'est la protéine qui déclenche l'allergie.
 * L'ingrédient portait même `group = dairy_milk`.
 *
 * Rien n'est perdu par ce retrait: `sans` figure déjà dans `NEGATION_WORD`,
 * donc la direction LÉGITIME reste couverte par `NEGATION_BEFORE` — « pain
 * sans gluten » ne mord pas `gluten`, « un plat sans cacahuète » ne mord pas
 * `cacahuete` (test existant). Seule la direction fautive disparaît.
 *
 * `-free` RESTE, et pour la raison symétrique: en anglais c'est le mot qui
 * PRÉCÈDE le suffixe qui est nié — « milk-free sauce » ne parle pas de lait.
 */
const NEGATION_AFTER =
  /^(?:\s*[-\s]?free\b|\s+allerg(?:y|ies|ic|ie|ique|ies)\b|\s+intoleran(?:ce|t)\b)/;

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
  // Les portées DÉJÀ BLANCHIES par la négation, par règle. Voir le bloc
  // « MENTION IMBRIQUÉE » plus bas: sans ça, une forme de surface longue
  // blanchie laisse survivre le mot court qu'elle contient.
  const clearedSpans = new Map<string, Array<[number, number]>>();
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
        const start = match.index;
        const end = start + match[0].length;
        const before = haystack.slice(0, start);
        const after = haystack.slice(end);
        if (
          allowNegated &&
          (NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after))
        ) {
          const spans = clearedSpans.get(term.ruleId) ?? [];
          spans.push([start, end]);
          clearedSpans.set(term.ruleId, spans);
          continue;
        }
        matches.push({
          ruleId: term.ruleId,
          token: needle.toLowerCase(),
          matchedText: offsetsAligned
            ? haystackRaw.slice(start, end)
            : match[0],
          index: start,
        });
      }
    }
  }

  // MENTION IMBRIQUÉE = MÊME MENTION.
  //
  // La négation est évaluée PAR AIGUILLE, et les aiguilles d'une même règle se
  // chevauchent par construction (`peanut` a `beurre de cacahuete` ET
  // `cacahuete` comme formes de surface). Sur:
  //
  //     "Supprime le beurre de cacahuète du petit-déjeuner."
  //
  // la forme longue commence à « beurre », voit « supprime le » juste avant,
  // et est correctement blanchie. La forme courte commence à « cacahuète »,
  // voit « ...le beurre de » — où « beurre » n'est ni un déterminant ni un
  // verbe de la liste — et SURVIT. La dédup ne peut pas les fusionner: elle est
  // indexée sur l'offset, et les deux offsets diffèrent.
  //
  // Résultat: une phrase qui RETIRE l'allergène était rejetée comme si elle le
  // recommandait. La règle ci-dessous le dit une fois pour toutes: une
  // occurrence entièrement CONTENUE dans une occurrence déjà blanchie de la
  // MÊME règle n'est pas une seconde mention, c'est la même — vue par une
  // aiguille plus courte.
  //
  // Portée volontairement étroite: `ruleId` identique et containment STRICT
  // (`<=`/`>=` sur les deux bornes). Deux interdits distincts qui se
  // chevauchent restent deux constats, et une mention qui déborde de la portée
  // blanchie n'est pas couverte.
  const surviving = matches.filter((m) => {
    const spans = clearedSpans.get(m.ruleId);
    if (!spans) return true;
    const end = m.index + m.matchedText.length;
    return !spans.some(([s, e]) => m.index >= s && end <= e);
  });

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
  for (const m of surviving) {
    const key = `${m.ruleId} ${m.index}`;
    const kept = best.get(key);
    if (!kept || m.matchedText.length > kept.matchedText.length) best.set(key, m);
  }
  return [...best.values()].sort((a, b) =>
    a.index - b.index || a.ruleId.localeCompare(b.ruleId)
  );
}
