/**
 * PIVOT NUTRITION §3.3 + §3.7 — the coach's method, compiled into a prompt
 * layer, and the deterministic lock that stands behind it.
 *
 * THE PRODUCT CLAIM THIS FILE IS RESPONSIBLE FOR: "tes élèves sont relancés au
 * jour 9 — dans TA méthode et TA voix". Everything here exists to make that
 * true message after message, and — more importantly — to make its FAILURE
 * impossible to ship silently.
 *
 * ── THE DOUBLE LOCK (§3.3), and why one lock is not enough ────────────────
 * A prompt is advisory. It is a very good instruction and a very bad guarantee:
 * a model that has been told "never recommend six small meals" will comply
 * almost always, and "almost always" is the wrong number when a single public
 * contradiction of the coach destroys the reason he is paying. So the interdits
 * are enforced twice, by two mechanisms that fail differently:
 *
 *   lock 1 — INJECTED: `compileDoctrineBlock` puts them in the prompt.
 *   lock 2 — VERIFIED: `findDoctrineViolations` scans the generated text before
 *            it is sent, deterministically, with no model in the loop.
 *
 * Lock 2 shares its engine with the STUDENT's medical lock
 * (`forbidden_matcher.ts`) — read that file's header for why that sharing is
 * not a convenience but a correctness requirement.
 *
 * ── THE ONE PLACE THE TWO LOCKS DELIBERATELY DIVERGE ──────────────────────
 * They mean different things by "naming the forbidden thing":
 *
 *   allergy  — the danger is the SUGGESTION. "Add peanut butter" is the harm.
 *   interdit — the danger is the ADVOCACY, not the word. The agent must remain
 *              able to say "your coach doesn't do six small meals" — that
 *              sentence is the doctrine WORKING, and rejecting it would make
 *              the agent unable to explain its own coach's method.
 *
 * Both therefore run with negation exceptions ON by default, and this is the
 * case that makes the exception list load-bearing rather than cosmetic
 * (`doctrine_test.ts` pins it).
 *
 * ── CACHING (§3.3) ────────────────────────────────────────────────────────
 * The doctrine block is the same tokens on every turn for a given coach, so it
 * is the natural cache unit. `compileDoctrineBlock` returns a content hash:
 * cache key in, cache invalidation out. §3.7 brique 6 requires an edit to be
 * visible on the NEXT message, so the key is derived from the content itself
 * rather than from a version number a caller could forget to bump.
 *
 * PURE MODULE: no I/O, no clock, no randomness. Everything decidable is
 * decidable here, in tests.
 */

import {
  findForbiddenMatches,
  type ForbiddenMatch,
  type ForbiddenMatchOptions,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import { GOAL_TOKENS, type GoalToken, goalScopeApplies } from "./tokens.ts";

export type { GoalToken };

// ---------------------------------------------------------------------------
// LA PORTÉE PAR OBJECTIF — une doctrine écrite, N doctrines servies
// ---------------------------------------------------------------------------
//
// LE PARTAGE N'EST PAS UNIFORME, ET C'EST LE CŒUR DU MODÈLE.
//
//   voice, vocabulary, forbidden  →  le COACH. Ils ne prennent pas de portée.
//   beliefs, arbitrations         →  ce qu'il dit à QUI. Ils en prennent une.
//
// Un coach ne change pas de voix ni de vocabulaire parce que son élève veut
// prendre du muscle plutôt que perdre du gras. En revanche « ne t'affole pas
// d'un plateau sur la balance » ne s'adresse qu'à quelqu'un en perte de gras,
// et l'arbitrage « qu'est-ce que je réponds quand on ne perd plus » n'existe
// que dans ce cas-là.
//
// ⚠️ `forbidden` RESTE GLOBAL, et ce n'est pas un raccourci d'implémentation.
// Un interdit borné à un objectif veut dire que l'agent peut dire à un élève ce
// qu'il a interdiction de dire à un autre — c'est-à-dire une préférence, pas un
// interdit. Le jour où « jeûne intermittent » serait interdit pour `fat_loss`
// seulement, la même phrase sortirait pour un élève `health`, le coach
// constaterait que son interdit ne tient pas, et il aurait raison.
// COROLLAIRE VÉRIFIÉ PAR TEST: `findDoctrineViolations` ne prend pas
// d'objectif, et l'ensemble des règles du verrou est identique pour les six
// variantes. La portée ne peut donc pas désarmer une ceinture.
//
// ── CE QUI N'ENTRE PAS DANS LE BLOC, ET POURQUOI C'EST DÉLIBÉRÉ ───────────
// Le bloc compilé ne NOMME jamais l'objectif de l'élève, et n'étiquette jamais
// une croyance « (pour les élèves en perte de gras) ». Deux raisons, dont une
// économique:
//
//   1. L'élève reçoit ce qui le concerne. Lui dire qu'il existe d'autres
//      variantes de la méthode de son coach ne lui apprend rien d'utile.
//   2. UNE DOCTRINE SANS AUCUNE PORTÉE COMPILE OCTET POUR OCTET À L'IDENTIQUE
//      POUR LES SIX VARIANTES. C'est à la fois la preuve de non-régression
//      (§6.6: l'existant continue de fonctionner à l'identique) et la propriété
//      qui rend le cache viable: six variantes identiques ont le même hash de
//      contenu, donc UNE seule entrée de cache. Injecter « objectif: perte de
//      gras » dans l'en-tête fragmenterait le cache par six pour tous les
//      coachs, y compris ceux qui n'ont rien ciblé.

// ---------------------------------------------------------------------------
// The doctrine, as stored in `coach_doctrines`
// ---------------------------------------------------------------------------

/**
 * ONE conviction of the coach's method.
 *
 * `key` is ASCII snake_case (R1) and it carries far more weight than it looks:
 * it is THE anchor a student's week plan is traced to. A nutrition line in
 * `student_week_plans` names the belief it applies, and the database refuses
 * the line if the key is absent (CHECK `..._doctrine_traceable_check`).
 *
 * WHY A KEY AND NOT THE CLAIM TEXT: the claim is prose the coach re-words
 * between versions. A plan generated in March must still be able to say which
 * conviction it came from in June, and matching on prose would break the first
 * time a comma moved.
 *
 * STABILITY: a doctrine version is an immutable snapshot, so deriving the key
 * from that version's claim is deterministic and stable. `parseCoachDoctrine`
 * therefore honours a stored `key` when present and derives one when it is not
 * -- an older row with no key resolves to the same key it would be given today.
 */
export interface DoctrineBelief {
  key: string;
  claim: string;
  rationale?: string | null;
  /** Vide = pour tout le monde. Voir `goalScopeApplies`. */
  goalScope: readonly string[];
}

/**
 * ONE interdit.
 *
 * `token` is ASCII snake_case (R1) because code branches on it: the violation
 * report, the incident log, and the coach-facing "why was this regenerated"
 * screen all key on it. `surfaceForms` carries the phrasings a model would
 * actually emit -- an interdit whose token is `six_small_meals` will never
 * appear as those two words in French prose, so without surface forms lock 2
 * would be decorative.
 */
export interface DoctrineForbidden {
  token: string;
  surfaceForms?: readonly string[];
  reason?: string | null;
  /**
   * WHAT THE COACH DOES INSTEAD, in the coach's own words.
   *
   * This is the difference between a gag and an answer. A student in a
   * masterclass has NO one-to-one channel back to the coach: telling them "ask
   * your coach" points at a door that does not exist, and it is the opposite of
   * what a coach buys us for -- they want their position stated in their
   * absence, not a referral back to them.
   *
   * So when lock 2 catches a reply endorsing this interdit, the replacement is
   * THIS text. Answering in the coach's place is legitimate precisely because
   * the coach wrote the replacement. When it is missing the lock degrades to a
   * neutral refusal that still never invents a channel.
   */
  instead?: string | null;
}

export interface DoctrineVocabularyEntry {
  term: string;
  meaning?: string | null;
}

/** A hard case the coach answered in his own words: the few-shot that makes it his. */
export interface DoctrineArbitration {
  situation: string;
  coachAnswer: string;
  source?: "interview" | "weekly_suggestion" | "test_mode" | null;
  /** Vide = pour tout le monde. C'est le champ le plus souvent rempli des deux. */
  goalScope: readonly string[];
}

export interface DoctrineVoice {
  /** 'tu' | 'vous' — French address form, when it applies. */
  address?: string | null;
  length?: "short" | "medium" | null;
  emojis?: "none" | "light" | null;
  /** R3: the language the AI WRITES in. Distinct from ui_locale. */
  language?: string | null;
}

/**
 * UN ALIMENT que le coach conseille, ou qu'il déconseille.
 *
 * ── POURQUOI CE N'EST PAS UN `DoctrineForbidden` ────────────────────────
 * Les deux interdisent, et pourtant les confondre casse la saisie du coach.
 * Un `forbidden` est une PRATIQUE ("six petits repas") dont le remède est un
 * `instead` que le coach écrit MOT POUR MOT, parce que c'est littéralement ce
 * que l'élève lira. Un aliment déconseillé est un INGRÉDIENT, et son remède
 * est un autre ingrédient que le générateur choisit tout seul. Exiger un
 * `instead` verbatim pour chaque aliment, c'est garantir une section vide.
 *
 * `surfaceForms` porte le même poids qu'ailleurs: un terme seul ne matche rien
 * dans de la prose réelle ("huiles de graines" ne s'écrit jamais comme ça).
 */
export interface DoctrineFood {
  term: string;
  surfaceForms?: readonly string[];
  reason?: string | null;
}

/**
 * ── IL N'Y A PLUS DE LISTE `recommended` ICI, ET C'EST DÉLIBÉRÉ ──────────
 *
 * « Les aliments que ce coach met dans une assiette » se disait à DEUX
 * endroits: ici, en texte libre, et sur `/coach/protocol` sous forme de
 * posture `encouraged` sur un des trente groupes fermés. La même affirmation,
 * deux fois, dans deux vocabulaires — donc deux listes qui divergent, et un
 * coach qui ne sait plus laquelle Sophia lit.
 *
 * C'est le mapping qui gagne, parce qu'il est ce contre quoi une photo se
 * compare et ce sur quoi l'évaluateur note; il atteint le générateur de repas
 * par `protocol_loader.ts`. Un aliment qu'on RECOMMANDE n'a pas besoin de
 * formulations de surface: c'est une invitation, et le générateur choisit tout
 * seul comment la nommer.
 *
 * `discouraged` RESTE, et n'est pas symétrique: il porte des `surfaceForms`,
 * et c'est cette liste que le verrou déterministe matche dans la PROSE
 * générée. Le vocabulaire fermé ne sait pas faire ce travail — `other_added_fat`
 * n'est pas une phrase qu'un modèle écrit, « huile de tournesol » si.
 */
export interface DoctrineFoods {
  discouraged: readonly DoctrineFood[];
}

/**
 * UNE question/réponse de la méthode.
 *
 * ── POURQUOI CE N'EST PAS UNE `DoctrineArbitration` ─────────────────────
 * Une arbitration est SITUATIONNELLE et émotionnelle: un élève a craqué, le
 * coach répond, et ce qui compte est le TON. Un Q/R est FACTUEL: « est-ce que
 * je peux boire du café le matin », et ce qui compte est le CONTENU.
 *
 * Les fondre a un coût réel dans les deux sens. Une arbitration servie comme
 * réponse factuelle donne du réconfort à qui posait une question technique;
 * un Q/R servi comme few-shot de ton apprend à l'agent à répondre à un élève
 * en détresse par une fiche.
 */
export interface DoctrineQA {
  question: string;
  answer: string;
  source?: "interview" | "coach_edit" | null;
}

export interface CoachDoctrine {
  coachId: string;
  version: number;
  coachDisplayName?: string | null;
  beliefs: readonly DoctrineBelief[];
  forbidden: readonly DoctrineForbidden[];
  vocabulary: readonly DoctrineVocabularyEntry[];
  arbitrations: readonly DoctrineArbitration[];
  foods: DoctrineFoods;
  qa: readonly DoctrineQA[];
  voice: DoctrineVoice;
  contentLocale: string;
}

// ---------------------------------------------------------------------------
// Parsing the jsonb columns — tolerant on shape, strict on emptiness
// ---------------------------------------------------------------------------

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Derive an ASCII snake_case key from a claim (R1).
 *
 * Diacritics are folded rather than dropped: "équilibre" must not become
 * "quilibre". Capped at six words because the key is read by humans on the
 * coach's screen and in violation reports, and a forty-character key is a key
 * nobody checks.
 */
/**
 * Un jeton qui n'est aucun objectif, donc qui n'atteint personne.
 *
 * C'est la valeur de repli d'une portée MALFORMÉE, et le choix du repli est la
 * seule décision de sécurité de ce parseur (voir `parseGoalScope`).
 */
const MALFORMED_SCOPE: readonly string[] = ["!malformed"];

/**
 * Lire la portée d'une entrée. Absente = globale; illisible = personne.
 *
 * ── LA DIRECTION DE L'ÉCHEC EST TOUT ────────────────────────────────────
 * Il y a deux façons de rater la lecture d'une portée, et elles ne coûtent pas
 * la même chose:
 *
 *   lâcher le jeton inconnu  → la portée devient vide, donc GLOBALE, donc la
 *                              croyance ciblée part chez tout le monde. C'est
 *                              exactement la fuite que ce lot existe pour
 *                              fermer, et elle serait silencieuse.
 *   garder le jeton inconnu  → la portée reste non vide et ne matche aucun
 *                              objectif: l'entrée n'atteint personne. Le coach
 *                              perd une croyance, et il le lit dans `issues`.
 *
 * On garde. Une croyance muette est un défaut visible; une croyance servie au
 * mauvais élève ne se voit que le jour où le coach lit la conversation.
 *
 * ABSENT ≠ VIDE-ET-ILLISIBLE: une entrée SANS champ `goal_scope` (toute
 * doctrine écrite avant ce lot) est globale, et c'est la rétrocompatibilité.
 * Une entrée AVEC un `goal_scope` qu'on n'arrive pas à lire (un objet, un
 * nombre, un tableau de chaînes vides) n'est pas la même chose: le coach a
 * voulu restreindre, on ne sait pas à quoi, et le repli est « personne ».
 */
function parseGoalScope(
  raw: unknown,
  where: string,
  issues: string[],
): readonly string[] {
  if (raw === undefined || raw === null) return [];

  let candidates: unknown[];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (typeof raw === "string") {
    // Une chaîne seule est une intention lisible ("fat_loss"), pas une erreur.
    candidates = raw.trim() ? [raw] : [];
  } else {
    issues.push(
      `${where}: goal_scope is not a list, kept as unreachable — this entry reaches nobody`,
    );
    return MALFORMED_SCOPE;
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    const token = str(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    if (!(GOAL_TOKENS as readonly string[]).includes(token)) {
      issues.push(
        `${where}: unknown goal ${JSON.stringify(token)} in goal_scope, ` +
          `kept — this entry reaches nobody until you fix it`,
      );
    }
    out.push(token);
  }

  // Le coach a écrit une portée, et il n'en reste rien de lisible. Retomber sur
  // « globale » ici publierait la croyance à toute la cohorte au motif qu'on
  // n'a pas su lire la restriction.
  if (out.length === 0 && candidates.length > 0) {
    issues.push(
      `${where}: goal_scope has no readable goal, kept as unreachable — this entry reaches nobody`,
    );
    return MALFORMED_SCOPE;
  }
  return out;
}

export function deriveBeliefKey(claim: string): string {
  const words = claim
    .normalize("NFD")
    // Escaped, never literal: a combining-mark range typed into the source is
    // invisible in a diff and one careless editor pass silently empties it.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // A claim of pure punctuation or non-Latin script leaves nothing to derive
  // from. `belief` is a deliberate, visible placeholder: the caller's dedup
  // turns a second one into `belief_2`, so it degrades without ever colliding.
  return words.slice(0, 6).join("_") || "belief";
}

/**
 * Build a `CoachDoctrine` from a `coach_doctrines` row.
 *
 * Malformed entries are DROPPED and counted, never guessed at: a belief with no
 * claim is not a belief, and an interdit with no token is an interdit that
 * cannot be enforced -- keeping it would put a rule in the prompt that lock 2
 * is structurally unable to check, which is the worst of both worlds.
 */
export function parseCoachDoctrine(
  row: Record<string, unknown>,
): { doctrine: CoachDoctrine; issues: string[] } {
  const issues: string[] = [];

  const beliefs: DoctrineBelief[] = [];
  const beliefKeys = new Set<string>();
  for (const [i, raw] of asArray(row.beliefs).entries()) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const claim = str(b.claim);
    if (!claim) {
      issues.push(`beliefs[${i}]: empty claim, dropped`);
      continue;
    }
    // Honour a stored key; derive one when the row predates keys. Either way
    // the result must be UNIQUE within the doctrine, because a week plan
    // resolves its lines by this key -- two beliefs sharing one key would make
    // a plan line point at an ambiguous origin, which is worse than no origin.
    let key = str(b.key) || deriveBeliefKey(claim);
    if (beliefKeys.has(key)) {
      let n = 2;
      while (beliefKeys.has(`${key}_${n}`)) n++;
      issues.push(`beliefs[${i}]: key ${JSON.stringify(key)} already used, stored as ${key}_${n}`);
      key = `${key}_${n}`;
    }
    beliefKeys.add(key);
    beliefs.push({
      key,
      claim,
      rationale: str(b.rationale) || null,
      goalScope: parseGoalScope(b.goal_scope ?? b.goalScope, `beliefs[${i}]`, issues),
    });
  }

  const forbidden: DoctrineForbidden[] = [];
  for (const [i, raw] of asArray(row.forbidden).entries()) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const token = str(f.token);
    if (!token) {
      issues.push(`forbidden[${i}]: empty token, dropped (unenforceable)`);
      continue;
    }
    const surfaceForms = asArray(f.surface_forms ?? f.surfaceForms)
      .map(str)
      .filter(Boolean);
    forbidden.push({
      token,
      surfaceForms,
      reason: str(f.reason) || null,
      instead: str(f.instead) || null,
    });
  }

  const vocabulary: DoctrineVocabularyEntry[] = [];
  for (const [i, raw] of asArray(row.vocabulary).entries()) {
    const v = (raw ?? {}) as Record<string, unknown>;
    const term = str(v.term);
    if (!term) {
      issues.push(`vocabulary[${i}]: empty term, dropped`);
      continue;
    }
    vocabulary.push({ term, meaning: str(v.meaning) || null });
  }

  const arbitrations: DoctrineArbitration[] = [];
  for (const [i, raw] of asArray(row.arbitrations).entries()) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const situation = str(a.situation);
    const coachAnswer = str(a.coach_answer ?? a.coachAnswer);
    if (!situation || !coachAnswer) {
      // Half an arbitration is not a weaker example, it is a misleading one:
      // a situation with no answer teaches the model the situation matters and
      // leaves it to invent the response -- the opposite of the intent.
      issues.push(`arbitrations[${i}]: needs both situation and answer, dropped`);
      continue;
    }
    const source = str(a.source);
    arbitrations.push({
      situation,
      coachAnswer,
      source: (["interview", "weekly_suggestion", "test_mode"].includes(source)
        ? source
        : null) as DoctrineArbitration["source"],
      goalScope: parseGoalScope(a.goal_scope ?? a.goalScope, `arbitrations[${i}]`, issues),
    });
  }

  // ── LES ALIMENTS ────────────────────────────────────────────────────────
  // Même arbitrage que partout ici: une entrée sans `term` est LÂCHÉE et
  // COMPTÉE. Un aliment déconseillé sans terme est un aliment que le verrou
  // est structurellement incapable de reconnaître — le garder mettrait dans le
  // prompt une règle que la vérification ne peut pas tenir, c'est-à-dire le
  // pire des deux mondes (même raisonnement que l'interdit sans token).
  const parseFoodList = (raw: unknown, where: string): DoctrineFood[] => {
    const out: DoctrineFood[] = [];
    const seen = new Set<string>();
    for (const [i, entry] of asArray(raw).entries()) {
      const f = (entry ?? {}) as Record<string, unknown>;
      const term = str(f.term);
      if (!term) {
        issues.push(`${where}[${i}]: empty term, dropped (unenforceable)`);
        continue;
      }
      const dedupKey = term.toLowerCase();
      if (seen.has(dedupKey)) {
        issues.push(`${where}[${i}]: duplicate term ${JSON.stringify(term)}, kept the first`);
        continue;
      }
      seen.add(dedupKey);
      out.push({
        term,
        surfaceForms: asArray(f.surface_forms ?? f.surfaceForms).map(str).filter(Boolean),
        reason: str(f.reason) || null,
      });
    }
    return out;
  };

  const foodsRaw = (row.foods ?? {}) as Record<string, unknown>;
  const foods: DoctrineFoods = {
    // `foods.recommended` d'une ligne ancienne est IGNORÉ, sans bruit: la
    // liste a migré vers le mapping du protocole, et signaler comme un défaut
    // une donnée que le coach a légitimement écrite avant le déplacement lui
    // ferait chercher une erreur qui n'existe pas.
    discouraged: parseFoodList(foodsRaw.discouraged, "foods.discouraged"),
  };

  // ── LES QUESTIONS/RÉPONSES ──────────────────────────────────────────────
  // Une moitié de Q/R est, comme une demi-arbitration, TROMPEUSE et pas
  // seulement pauvre: une question sans réponse apprend au modèle que le sujet
  // compte et lui laisse inventer la position du coach dessus.
  const qa: DoctrineQA[] = [];
  for (const [i, raw] of asArray(row.qa).entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const question = str(entry.question);
    const answer = str(entry.answer);
    if (!question || !answer) {
      issues.push(`qa[${i}]: needs both question and answer, dropped`);
      continue;
    }
    const source = str(entry.source);
    qa.push({
      question,
      answer,
      source: (["interview", "coach_edit"].includes(source)
        ? source
        : null) as DoctrineQA["source"],
    });
  }

  const voiceRaw = (row.voice ?? {}) as Record<string, unknown>;
  const length = str(voiceRaw.length);
  const emojis = str(voiceRaw.emojis);

  return {
    doctrine: {
      coachId: str(row.coach_id ?? row.coachId),
      version: Number(row.version ?? 0),
      coachDisplayName: str(row.coach_display_name ?? row.coachDisplayName) || null,
      beliefs,
      forbidden,
      vocabulary,
      arbitrations,
      foods,
      qa,
      voice: {
        address: str(voiceRaw.address) || null,
        length: (length === "short" || length === "medium" ? length : null),
        emojis: (emojis === "none" || emojis === "light" ? emojis : null),
        language: str(voiceRaw.language) || null,
      },
      contentLocale: str(row.content_locale ?? row.contentLocale) || "en",
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Lock 1 — the compiled prompt layer
// ---------------------------------------------------------------------------

export interface CompiledDoctrine {
  /** The block injected as the [DOCTRINE COACH] layer. */
  text: string;
  /**
   * Content hash. THE cache key, and THE invalidation signal: it moves when and
   * only when the compiled text moves, so a coach who edits at 14:02 is served
   * by a different key at 14:03 without anybody remembering to bump a version.
   *
   * ── POURQUOI LE HASH N'EST PAS SALÉ AVEC L'OBJECTIF ─────────────────────
   * L'exigence est qu'une variante ne puisse jamais recevoir la clé d'une
   * AUTRE variante. Un hash de CONTENU la tient par construction: deux textes
   * différents donnent deux clés différentes, sans qu'aucun appelant n'ait à y
   * penser. Saler avec l'objectif ferait strictement pire: six variantes
   * IDENTIQUES (le cas de tout coach qui n'a rien ciblé, c'est-à-dire la
   * majorité) recevraient six clés distinctes et paieraient six fois la
   * relecture du même bloc. On garderait la lettre de l'exigence en cassant sa
   * raison d'être. L'identité de la variante voyage dans `goal`, qui est tracé
   * à chaque tour — c'est là qu'on répond à « quelle doctrine a servi ».
   */
  hash: string;
  /** True when the coach has published nothing usable yet. */
  isEmpty: boolean;
  /**
   * L'IDENTITÉ DE LA VARIANTE. `null` = la variante `default` (noyau + entrées
   * sans portée), celle que reçoit un élève sans objectif déclaré.
   *
   * Elle est portée par la valeur de retour et pas seulement connue de
   * l'appelant, parce que c'est elle qu'on trace: le jour où un coach dit
   * « Sophia ne dit pas ça à mes élèves », la question est « laquelle a servi »,
   * et une sélection implicite est indébogable.
   */
  goal: GoalToken | null;
  /**
   * Le bloc est vide POUR CET OBJECTIF alors que le coach a écrit des
   * croyances ou des arbitrages — ils ont tous été filtrés par la portée.
   *
   * C'est une situation différente de « ce coach n'a rien publié », et la
   * confondre ferait dire à l'agent qu'il n'a pas pu lire la méthode de son
   * coach, ce qui est faux. Voir `doctrine_loader.ts`.
   */
  emptyForGoal: boolean;
}

/**
 * FNV-1a, 64-bit, hex. Synchronous on purpose: `crypto.subtle` is async, and an
 * async cache key turns every call site into an await for no benefit. This is a
 * cache key and an equality check, never a security primitive.
 */
function contentHash(text: string): string {
  let hi = 0x811c9dc5;
  let lo = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    lo = (lo ^ c) >>> 0;
    lo = Math.imul(lo, 0x01000193) >>> 0;
    hi = (hi ^ ((c << 5) | (c >>> 3))) >>> 0;
    hi = Math.imul(hi, 0x01000193) >>> 0;
  }
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

/**
 * Compile the doctrine into the prompt block, deterministically, FOR ONE GOAL.
 *
 * DETERMINISM IS A REQUIREMENT, not a nicety: the hash is the cache key, so a
 * compilation that reordered anything between two calls would miss the cache on
 * every turn and quietly multiply the bill. Nothing here iterates an object's
 * key order or depends on anything outside its arguments.
 *
 * ── `goal` EST OBLIGATOIRE, ET C'EST VOULU ──────────────────────────────
 * Un paramètre de portée facultatif serait une portée désarmée: l'appelant qui
 * l'oublie recevrait silencieusement la variante `default` et servirait à un
 * élève `fat_loss` une doctrine amputée de tout ce que son coach a écrit pour
 * lui. Ce dépôt a déjà expédié une garde neutralisée par un paramètre optionnel
 * que personne ne passait. Ici, ne pas savoir se dit `null`, explicitement.
 */
export function compileDoctrineBlock(
  doctrine: CoachDoctrine,
  goal: GoalToken | null,
): CompiledDoctrine {
  const who = doctrine.coachDisplayName || "the coach";
  const lines: string[] = [];

  // LA SÉLECTION, en un endroit et pas deux. `beliefs` et `arbitrations` sont
  // les seules listes filtrées; toutes les autres traversent intactes, ce qui
  // est la définition du noyau partagé.
  const beliefs = doctrine.beliefs.filter((b) => goalScopeApplies(b.goalScope, goal));
  const arbitrations = doctrine.arbitrations.filter((a) => goalScopeApplies(a.goalScope, goal));

  lines.push(`== ${who.toUpperCase()}'S METHOD — YOU SPEAK AS THIS COACH'S AGENT ==`);
  lines.push("");
  lines.push(
    "You are not a general nutrition assistant. You carry ONE coach's method. " +
      "Where this block and your own knowledge disagree, this block wins. " +
      "You never modify, soften or extend the coach's protocol.",
  );

  if (beliefs.length > 0) {
    lines.push("");
    lines.push("-- WHAT THIS COACH BELIEVES --");
    for (const b of beliefs) {
      lines.push(b.rationale ? `- ${b.claim} (${b.rationale})` : `- ${b.claim}`);
    }
  }

  if (doctrine.forbidden.length > 0) {
    lines.push("");
    lines.push("-- FORBIDDEN: NEVER RECOMMEND, NEVER ENDORSE --");
    lines.push(
      "These are this coach's red lines. You may EXPLAIN that the coach does " +
        "not do these things; you may never advise the student to do them.",
    );
    // HOW to explain, not just permission to. Lock 2 reads the SENTENCE, not
    // the intent: its negation exceptions only fire when the refusal comes
    // immediately BEFORE the term (`forbidden_matcher.ts`). "Intermittent
    // fasting is when you compress your eating into a window. Marc doesn't use
    // it." therefore trips the lock and the whole reply is replaced -- the
    // permission granted on the line above is unusable in the most natural
    // English word order. Measured on 2026-08-03: 6 of 6 interdit turns were
    // delivered by the lock rather than by the model. Telling the model to
    // lead with the coach's position costs one sentence here and is the only
    // half of the fix that belongs in a prompt.
    // L'EXEMPLE PORTE LE NOM DU VRAI COACH, ET CE N'EST PAS COSMÉTIQUE.
    //
    // Il disait « Marc doesn't use X ». Mesuré en run réel (QA WEB L3, coach
    // `display_name = 'Marlow'`), sur les deux tours d'interdit joués, en
    // anglais et en français:
    //   « **Marc** doesn't count calories. He builds the plate instead… »
    //   « **Marc** doesn't use calorie counting. »
    // Le modèle recopie le nom de l'exemple. L'élève apprend donc que son
    // coach s'appelle Marc — sur un produit dont la promesse entière est de
    // parler AU NOM de son coach à lui.
    //
    // `who` est déjà résolu au-dessus (`coachDisplayName || "the coach"`), et
    // il ouvre déjà le bloc. L'interpoler ici ne coûte rien et supprime la
    // seule occurrence d'un nom propre inventé dans tout le prompt.
    lines.push(
      "When you explain one, LEAD with this coach's position and only then " +
        `describe the practice — "${who} doesn't use X. It's when people ..." ` +
        "— never the reverse order.",
    );
    for (const f of doctrine.forbidden) {
      const forms = (f.surfaceForms ?? []).filter(Boolean);
      const alias = forms.length > 0 ? ` (also phrased: ${forms.join("; ")})` : "";
      lines.push(f.reason ? `- ${f.token}${alias} — ${f.reason}` : `- ${f.token}${alias}`);
      // WHAT HE DOES INSTEAD, and why it has to be HERE.
      //
      // `instead` was parsed, stored, and read by lock 2 alone. So the coach's
      // own answer could only ever reach a student as a SUBSTITUTION: the model
      // wrote something that broke the rule, the belt threw the whole message
      // away and posted the coach's sentence in its place. The belt was doing
      // the product's job, and the bite rate was measuring the prompt's silence
      // rather than the model's misbehaviour.
      //
      // Injected here, the model can answer WITH the coach's alternative and
      // the belt goes back to being what it is meant to be: the net under the
      // trapeze, not the trapeze.
      const instead = String(f.instead ?? "").trim();
      if (instead) lines.push(`  INSTEAD, this coach says: ${instead}`);
    }
  }

  if (doctrine.vocabulary.length > 0) {
    lines.push("");
    lines.push("-- THIS COACH'S WORDS — use them, do not translate them away --");
    for (const v of doctrine.vocabulary) {
      lines.push(v.meaning ? `- "${v.term}": ${v.meaning}` : `- "${v.term}"`);
    }
  }

  if (arbitrations.length > 0) {
    lines.push("");
    lines.push("-- HOW THIS COACH ANSWERS (follow these, they are his own words) --");
    for (const a of arbitrations) {
      lines.push(`- Situation: ${a.situation}`);
      lines.push(`  He answers: ${a.coachAnswer}`);
    }
  }

  // ── LES ALIMENTS DÉCONSEILLÉS ───────────────────────────────────────────
  // Une BORNE, et rien d'autre. L'INVITATION — « voilà avec quoi je construis »
  // — a quitté la doctrine pour le mapping du protocole, qui la dit dans le
  // vocabulaire fermé contre lequel une photo se compare. Ce qui reste ici est
  // ce que le mapping ne sait pas porter: des formulations de surface que le
  // verrou déterministe matche dans la prose générée.
  if (doctrine.foods.discouraged.length > 0) {
    lines.push("");
    lines.push("-- FOODS THIS COACH DOES NOT PUT ON A PLATE --");
    lines.push(
      "Never suggest these to the student. You may say the coach does not use " +
        "them if asked; you may never build a meal around one.",
    );
    for (const f of doctrine.foods.discouraged) {
      const forms = (f.surfaceForms ?? []).filter(Boolean);
      const alias = forms.length > 0 ? ` (also: ${forms.join("; ")})` : "";
      lines.push(f.reason ? `- ${f.term}${alias} — ${f.reason}` : `- ${f.term}${alias}`);
    }
  }

  if (doctrine.qa.length > 0) {
    lines.push("");
    lines.push("-- WHAT THIS COACH HAS ALREADY ANSWERED --");
    lines.push(
      "These are settled. When a student asks one of these, answer as the " +
        "coach did rather than reasoning it out again.",
    );
    for (const entry of doctrine.qa) {
      lines.push(`- Q: ${entry.question}`);
      lines.push(`  A: ${entry.answer}`);
    }
  }

  const v = doctrine.voice;
  const voiceBits: string[] = [];
  if (v.address) voiceBits.push(`address the student with "${v.address}"`);
  if (v.length === "short") voiceBits.push("keep replies short — two or three sentences");
  if (v.length === "medium") voiceBits.push("replies of a short paragraph");
  if (v.emojis === "none") voiceBits.push("no emojis");
  if (v.emojis === "light") voiceBits.push("at most one emoji");
  if (v.language) voiceBits.push(`write in ${v.language}`);
  if (voiceBits.length > 0) {
    lines.push("");
    lines.push("-- VOICE --");
    for (const bit of voiceBits) lines.push(`- ${bit}`);
  }

  const text = lines.join("\n");
  // `isEmpty` décide de l'injection du bloc de PRUDENCE à la place de la
  // doctrine. Les deux nouvelles sections y entrent: un coach qui n'a rempli
  // QUE ses aliments a bel et bien publié une méthode, et servir le repli
  // « aucune méthode disponible » à ses élèves serait faux.
  //
  // Il porte sur la VARIANTE (les listes filtrées), pas sur la doctrine brute:
  // un bloc qui ne contient plus que son en-tête n'instruit le modèle sur rien.
  // ⚠️ LA VOIX N'EN FAIT PAS PARTIE, et c'est la correction du 2026-08-05.
  //
  // `voiceBits.length === 0` était dans cette conjonction. Conséquence: TOUTE
  // doctrine portant une voix — c'est-à-dire toutes celles que le formulaire
  // produit, `voice.language` étant rempli par défaut — ne pouvait jamais être
  // vide. `isEmpty` restait faux, `emptyForGoal` avec lui (il en dépend), et
  // les DEUX blocs de repli devenaient injoignables par construction.
  //
  // Ce que l'élève recevait à la place, mesuré 2/3 en run réel: l'en-tête
  // « YOU SPEAK AS THIS COACH'S AGENT … this block wins » avec RIEN dessous
  // sauf la voix. Le modèle comblait le vide et inventait une position au nom
  // d'un coach nommé — « Dita Aaronson doesn't do free-form lunch advice » —
  // que sa doctrine ne dit nulle part. Le lot voulait tuer le bâillon; il
  // l'avait remplacé par une fabrication attribuée.
  //
  // Une voix dit COMMENT parler, jamais QUOI prescrire. Un bloc qui ne porte
  // qu'elle n'instruit le modèle sur aucune méthode, et c'est exactement ce que
  // `isEmpty` doit mesurer. Contrepartie assumée: la voix d'un coach qui n'a
  // rempli QUE sa voix n'est pas servie, puisqu'on injecte un bloc de repli à
  // la place. Perdre un ton vaut mieux que fabriquer une méthode.
  const isEmpty = beliefs.length === 0 &&
    doctrine.forbidden.length === 0 &&
    doctrine.vocabulary.length === 0 &&
    arbitrations.length === 0 &&
    doctrine.foods.discouraged.length === 0 &&
    doctrine.qa.length === 0;

  // Vide POUR CET OBJECTIF: la variante ne dit rien alors que le coach, lui, a
  // écrit quelque chose — tout est parti à la portée. Local et exact, sans
  // recompiler la variante globale pour comparer.
  const emptyForGoal = isEmpty &&
    (doctrine.beliefs.length > 0 || doctrine.arbitrations.length > 0);

  return { text, hash: contentHash(text), isEmpty, goal, emptyForGoal };
}

// ---------------------------------------------------------------------------
// LES N COMPILATIONS D'UNE ÉCRITURE
// ---------------------------------------------------------------------------

/**
 * Les variantes à stocker pour une doctrine: la `default` plus une par
 * objectif. `null` en tête parce que c'est le repli de tous les chemins qui
 * n'ont pas d'élève (mode test, cron, élève sans `student_goals`).
 */
export const DOCTRINE_VARIANT_GOALS: readonly (GoalToken | null)[] = [
  null,
  ...GOAL_TOKENS,
];

/** Le nom de stockage d'une variante. `null` n'est pas une clé primaire. */
export function variantKey(goal: GoalToken | null): string {
  return goal ?? "default";
}

/** L'inverse de `variantKey`, pour relire une ligne stockée. */
export function variantGoal(key: string): GoalToken | null {
  const k = String(key ?? "").trim();
  if (!k || k === "default") return null;
  if (!(GOAL_TOKENS as readonly string[]).includes(k)) {
    throw new Error(
      `[keel/doctrine] Unknown doctrine variant key: ${JSON.stringify(key)}. ` +
        `Expected "default" or one of: ${GOAL_TOKENS.join(", ")}`,
    );
  }
  return k as GoalToken;
}

/**
 * Compile TOUTES les variantes d'une doctrine, en une passe.
 *
 * C'EST CE QUI REND UNE VARIANTE PÉRIMÉE IMPOSSIBLE. La publication ne
 * recompile pas « les variantes qui ont changé »: elle recompile la liste
 * entière et remplace tout le jeu. Il n'y a donc pas de variante qu'on pourrait
 * oublier de recalculer, et pas de calcul de ce qui a changé à se tromper.
 */
export function compileAllDoctrineVariants(
  doctrine: CoachDoctrine,
): ReadonlyArray<{ goal: GoalToken | null; key: string; compiled: CompiledDoctrine }> {
  return DOCTRINE_VARIANT_GOALS.map((goal) => ({
    goal,
    key: variantKey(goal),
    compiled: compileDoctrineBlock(doctrine, goal),
  }));
}

/**
 * LA FRAGMENTATION DU CACHE, MESURÉE ET PAS SUPPOSÉE (§3.2.3).
 *
 * `variants` est le nombre de blocs compilés, `distinctHashes` le nombre
 * d'entrées de cache qu'ils occupent RÉELLEMENT — deux variantes au texte
 * identique partagent la leur. `reuseRatio` est la part des variantes qui
 * retombent sur un bloc déjà vu: 0 quand les six diffèrent, 5/6 quand le coach
 * n'a rien ciblé.
 */
export function doctrineCacheFootprint(
  doctrine: CoachDoctrine,
): { variants: number; distinctHashes: number; reuseRatio: number } {
  const all = compileAllDoctrineVariants(doctrine);
  const hashes = new Set(all.map((v) => v.compiled.hash));
  return {
    variants: all.length,
    distinctHashes: hashes.size,
    reuseRatio: all.length === 0 ? 0 : (all.length - hashes.size) / all.length,
  };
}

// ---------------------------------------------------------------------------
// The layered assembly (§3.3)
// ---------------------------------------------------------------------------

export interface PromptLayers {
  /** Product rules, safety, coach authority. Invariant across coaches. */
  systemCore: string;
  /** `compileDoctrineBlock().text`. Empty string when the coach has none. */
  doctrineBlock: string;
  /** THIS student's current week, from the tables. Never prose from a model. */
  protocolBlock: string;
  /** Digest: recurring meals, preferences, hard constraints, momentum. */
  studentMemoryBlock: string;
  /** The last turns. */
  conversationBlock: string;
}

/**
 * Assemble the five layers, in the order §3.3 fixes.
 *
 * THE ORDER IS THE CONTRACT, not a formatting choice. Two properties depend on
 * it and are pinned by tests:
 *
 *   1. SYSTEM CORE comes first and is never overridable by anything below it —
 *      safety and coach authority are not negotiable by a doctrine edit. A
 *      coach cannot write "ignore the safety rules" into his beliefs and have
 *      it land above them.
 *   2. DOCTRINE comes second, as ONE contiguous block, because that is the unit
 *      that gets cached. Interleaving it with per-student material would make
 *      the cacheable prefix student-specific, i.e. not cacheable at all.
 *
 * Empty layers are omitted rather than emitted as empty headers: a header with
 * nothing under it reads to a model as "this exists and is empty", which is a
 * different claim from "this does not apply".
 */
export function assembleTurnPrompt(layers: PromptLayers): string {
  const blocks: string[] = [];
  const push = (header: string, body: string) => {
    const trimmed = String(body ?? "").trim();
    if (!trimmed) return;
    blocks.push(`${header}\n${trimmed}`);
  };

  push("### SYSTEM CORE", layers.systemCore);
  push("### COACH DOCTRINE", layers.doctrineBlock);
  push("### PROTOCOL — THIS STUDENT, THIS WEEK", layers.protocolBlock);
  push("### STUDENT MEMORY", layers.studentMemoryBlock);
  push("### CONVERSATION", layers.conversationBlock);
  return blocks.join("\n\n");
}

/**
 * The cacheable PREFIX of the assembled prompt: everything that is identical
 * for every student of this coach. Callers that use provider-side prompt
 * caching key on this; callers that do not can ignore it.
 */
export function doctrineCachePrefix(
  systemCore: string,
  compiled: CompiledDoctrine,
): { text: string; key: string } {
  const text = assembleTurnPrompt({
    systemCore,
    doctrineBlock: compiled.text,
    protocolBlock: "",
    studentMemoryBlock: "",
    conversationBlock: "",
  });
  return { text, key: `${contentHash(systemCore)}.${compiled.hash}` };
}

// ---------------------------------------------------------------------------
// Lock 2 — the deterministic post-generation check
// ---------------------------------------------------------------------------

export interface DoctrineViolation {
  /** The interdit's ASCII token. */
  token: string;
  /** The phrasing that actually matched (token or surface form). */
  matchedForm: string;
  matchedText: string;
  index: number;
  reason: string | null;
}

export class DoctrineViolationError extends Error {
  readonly violations: DoctrineViolation[];
  constructor(violations: DoctrineViolation[]) {
    super(
      `[keel/doctrine] Generated text endorses ${violations.length} coach ` +
        `interdit(s): ` +
        violations.map((v) => `${v.token} ("${v.matchedText}")`).join(", ") +
        ". Output rejected; regenerate.",
    );
    this.name = "DoctrineViolationError";
    this.violations = violations;
  }
}

/**
 * Scan generated text for endorsements of a coach interdit.
 *
 * `allowNegatedMentions` defaults to TRUE, and that default is the whole design
 * (see the header). "Marc ne fait pas de 6 petits repas" must pass: it is the
 * doctrine doing its job. "Essaie 6 petits repas dans la journée" must fail.
 */
export function findDoctrineViolations(
  text: string,
  // `foods` est OBLIGATOIRE et pas optionnel, et ce n'est pas une coquetterie
  // de typage: ce dépôt a déjà expédié une garde désarmée par un paramètre
  // facultatif qu'aucun appelant ne passait (`safetyBand: null`, documenté).
  // Un verrou dont la moitié des règles dépend de la mémoire de l'appelant est
  // un verrou qui ment sur sa couverture. Le compilateur oblige donc chaque
  // appelant à dire, explicitement, quelles listes il fait vérifier.
  doctrine: Pick<CoachDoctrine, "forbidden" | "foods">,
  options: ForbiddenMatchOptions = {},
): DoctrineViolation[] {
  const byToken = new Map<string, { reason?: string | null }>();
  const terms: ForbiddenTerm[] = [];
  for (const f of doctrine.forbidden) {
    const token = String(f.token ?? "").trim();
    if (!token) continue;
    byToken.set(token, f);
    terms.push({
      ruleId: token,
      token,
      surfaceForms: f.surfaceForms,
    });
  }

  // Les aliments déconseillés entrent dans le MÊME moteur, avec les mêmes
  // exceptions de négation. C'est ce qui permet à l'agent de dire « ton coach
  // ne cuisine pas avec ça » — une phrase qui est la doctrine EN TRAIN DE
  // FONCTIONNER — tout en bloquant « ajoute une cuillère de ça ».
  //
  // Le `ruleId` est préfixé `food:` pour que l'incident nomme la règle qui a
  // mordu (R7) sans jamais collider avec un token d'interdit qui porterait le
  // même mot.
  for (const f of doctrine.foods?.discouraged ?? []) {
    const term = String(f.term ?? "").trim();
    if (!term) continue;
    const ruleId = `food:${term}`;
    byToken.set(ruleId, f);
    terms.push({
      ruleId,
      token: term,
      surfaceForms: f.surfaceForms,
    });
  }

  return findForbiddenMatches(text, terms, options).map((
    m: ForbiddenMatch,
  ): DoctrineViolation => ({
    token: m.ruleId,
    matchedForm: m.token,
    matchedText: m.matchedText,
    index: m.index,
    reason: byToken.get(m.ruleId)?.reason ?? null,
  }));
}

/**
 * Fail-loud gate. Callers that regenerate should use `findDoctrineViolations`
 * and feed the violated rule back into the retry as an explicit instruction —
 * a blind retry of the same prompt reproduces the same output surprisingly
 * often.
 */
export function assertNoDoctrineViolation(
  text: string,
  doctrine: Pick<CoachDoctrine, "forbidden" | "foods">,
  options: ForbiddenMatchOptions = {},
): void {
  const violations = findDoctrineViolations(text, doctrine, options);
  if (violations.length === 0) return;
  console.error("keel.doctrine.violation", {
    violation_count: violations.length,
    tokens: [...new Set(violations.map((v) => v.token))].join(","),
    detail: "Generated output rejected before delivery; regenerate.",
  });
  throw new DoctrineViolationError(violations);
}

/**
 * The instruction to append on a regeneration attempt.
 *
 * Named and exported because the retry prompt is part of the lock, not an
 * implementation detail of one call site: a retry that does not NAME what was
 * violated is a retry that rolls the dice again.
 */
export function doctrineRetryInstruction(
  violations: readonly DoctrineViolation[],
): string {
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const v of violations) {
    if (seen.has(v.token)) continue;
    seen.add(v.token);
    bullets.push(
      v.reason
        ? `- You endorsed "${v.matchedText}", which this coach forbids (${v.reason}). Do not recommend it.`
        : `- You endorsed "${v.matchedText}", which this coach forbids. Do not recommend it.`,
    );
  }
  return [
    "Your previous answer broke this coach's method and was rejected:",
    ...bullets,
    "Answer again, keeping everything else, without endorsing those.",
  ].join("\n");
}
