/**
 * M1 — COMBIEN PÈSE CE QU'ON INJECTE, ET À PARTIR DE QUAND ÇA DEVIENT UN SUJET.
 *
 * La question à laquelle ce script répond, et une seule: le bloc de méthode du
 * coach est injecté INTÉGRALEMENT à chaque tour, sans plafond nulle part (ni
 * CHECK en base, ni cap au parseur, ni cap à l'extraction documentaire). Est-ce
 * qu'on est à 3k tokens — auquel cas la récupération sémantique est un projet
 * théorique — ou à 30k, auquel cas c'est un chantier.
 *
 * ── CE QU'IL MESURE, ET POURQUOI CHAQUE MESURE COMPTE ────────────────────
 *   1. LE RÉEL. Chaque `coach_doctrines` de la base locale, compilée par le
 *      VRAI `compileDoctrineBlock`, pour les 7 variantes. C'est la seule
 *      mesure qui ne soit pas un modèle — et c'est aussi la moins
 *      représentative, parce que la base locale ne contient que des fixtures
 *      de QA. Elle est là pour le plancher, pas pour la projection.
 *   2. LE COÛT DE STRUCTURE. Ce que le compilateur ajoute par lui-même:
 *      l'en-tête fixe, et le préfixe de chaque entrée. Mesuré en compilant des
 *      doctrines dont le texte est connu au caractère près. C'est ce qui rend
 *      la projection honnête: le bloc n'est pas une fonction du nombre de
 *      coachs ni du temps, c'est `fixe + ce que le coach a écrit + n × préfixe`.
 *   3. LA PROJECTION. À quel nombre d'entrées on franchit 2k / 5k / 10k / 30k
 *      tokens, pour trois profils d'écriture calibrés sur des longueurs
 *      réelles.
 *   4. LES PLAFONDS CONNUS. Le bloc du mapping alimentaire a, LUI, un plafond
 *      calculable aujourd'hui: 30 groupes dans le vocabulaire fermé. La note
 *      1:1 en a un aussi: 1500 caractères. Les mesurer dit quelle part du
 *      budget est bornée et quelle part ne l'est pas.
 *
 * ── LES TOKENS SONT UNE ESTIMATION, LES CARACTÈRES SONT LA MESURE ────────
 * On ne tokenise pas ici: le tokenizer de Gemini n'est pas embarqué, et en
 * importer un d'un autre fournisseur donnerait un chiffre faux avec trois
 * décimales. Le ratio 4 car./token est l'approximation usuelle sur de la prose
 * anglaise; il est affiché comme approximation partout. Les décisions se
 * prennent sur des ordres de grandeur, pas sur le troisième chiffre.
 *
 * USAGE
 *   deno run -A docs/nutrition-pivot/qa-web/M1_block_budget.ts
 *   (les variables d'env ne sont nécessaires que pour la partie 1)
 */
import { compileDoctrineBlock, parseCoachDoctrine } from "../../../supabase/functions/_shared/keel/doctrine.ts";
import {
  type CoachFoodRule,
  compileProtocol,
  protocolFoodBlock,
} from "../../../supabase/functions/_shared/keel/protocol_compiler.ts";
import {
  COACH_NOTE_MAX_CHARS,
  coachNotePromptBlock,
} from "../../../supabase/functions/_shared/keel/coach_note.ts";
import { GOAL_TOKENS, type GoalToken } from "../../../supabase/functions/_shared/keel/tokens.ts";
import { admin } from "./harness.ts";

const CHARS_PER_TOKEN = 4;
const tok = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);
const fmt = (chars: number) => `${chars.toLocaleString("en-US")} car. ≈ ${tok(chars).toLocaleString("en-US")} tok.`;

function banner(title: string): void {
  console.log("\n" + "═".repeat(78));
  console.log(`▌ ${title}`);
  console.log("═".repeat(78));
}

// ---------------------------------------------------------------------------
// 1. LE RÉEL — les doctrines de la base locale
// ---------------------------------------------------------------------------
async function measureRealDoctrines(): Promise<void> {
  banner("1. LE RÉEL — doctrines présentes en base locale");

  const db = admin();
  const { data, error } = await db
    .from("coach_doctrines")
    .select(
      "coach_id, version, beliefs, forbidden, vocabulary, arbitrations, foods, qa, voice, " +
        "content_locale, published_at",
    );
  if (error) {
    console.log(`  ⚠️  lecture impossible (${error.message}) — partie 1 sautée.`);
    return;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    console.log("  (aucune doctrine en base)");
    return;
  }

  console.log(`  ${rows.length} doctrine(s).\n`);
  console.log("  publiée │ entrées │ default │  max variante │ écart variantes");
  console.log("  ────────┼─────────┼─────────┼───────────────┼────────────────");

  const sizes: number[] = [];
  for (const row of rows) {
    const { doctrine } = parseCoachDoctrine({ ...row, coach_display_name: "Marlow" });
    const entries = doctrine.beliefs.length + doctrine.forbidden.length +
      doctrine.vocabulary.length + doctrine.arbitrations.length +
      doctrine.foods.discouraged.length + doctrine.qa.length;

    const variants = [null, ...GOAL_TOKENS].map((g) =>
      compileDoctrineBlock(doctrine, g as GoalToken | null).text.length
    );
    const def = variants[0];
    const max = Math.max(...variants);
    const spread = max - Math.min(...variants);
    sizes.push(max);
    console.log(
      `  ${row.published_at ? "   oui  " : "   non  "}│${String(entries).padStart(8)} │` +
        `${String(def).padStart(8)} │${String(max).padStart(14)} │${String(spread).padStart(15)}`,
    );
  }

  const biggest = Math.max(...sizes);
  console.log(`\n  → la plus grosse doctrine réelle en local: ${fmt(biggest)}`);
  console.log(
    "  ⚠️  ce sont des FIXTURES de QA (1 à 4 entrées par section). Ce chiffre est\n" +
      "     un plancher, pas une projection. La suite modélise le vrai coach.",
  );
}

// ---------------------------------------------------------------------------
// 2. LE COÛT DE STRUCTURE — ce que le compilateur ajoute de lui-même
// ---------------------------------------------------------------------------
interface Profile {
  readonly claim: number;
  readonly rationale: number;
  readonly forbiddenReason: number;
  readonly instead: number;
  readonly meaning: number;
  readonly situation: number;
  readonly answer: number;
  readonly qaQuestion: number;
  readonly qaAnswer: number;
}

const text = (n: number) => "x".repeat(n);

function syntheticDoctrine(counts: Record<string, number>, p: Profile) {
  return parseCoachDoctrine({
    coach_id: "00000000-0000-0000-0000-000000000000",
    version: 1,
    coach_display_name: "Marlow",
    content_locale: "en",
    beliefs: Array.from({ length: counts.beliefs ?? 0 }, (_, i) => ({
      key: `b${i}`,
      claim: text(p.claim),
      rationale: p.rationale > 0 ? text(p.rationale) : null,
    })),
    forbidden: Array.from({ length: counts.forbidden ?? 0 }, () => ({
      token: text(20),
      surface_forms: [text(18), text(22)],
      reason: text(p.forbiddenReason),
      instead: text(p.instead),
    })),
    vocabulary: Array.from({ length: counts.vocabulary ?? 0 }, (_, i) => ({
      term: `t${i}`.padEnd(14, "x"),
      meaning: text(p.meaning),
    })),
    arbitrations: Array.from({ length: counts.arbitrations ?? 0 }, () => ({
      situation: text(p.situation),
      coach_answer: text(p.answer),
    })),
    foods: {
      discouraged: Array.from({ length: counts.foods ?? 0 }, (_, i) => ({
        term: `f${i}`.padEnd(16, "x"),
        surface_forms: [text(14)],
        reason: text(60),
      })),
    },
    qa: Array.from({ length: counts.qa ?? 0 }, () => ({
      question: text(p.qaQuestion),
      answer: text(p.qaAnswer),
    })),
    voice: { address: "tu", length: "medium", emojis: "light", language: "en" },
  }).doctrine;
}

/** Le nombre de caractères que le COACH a écrits, hors scaffolding. */
function writtenChars(counts: Record<string, number>, p: Profile): number {
  return (counts.beliefs ?? 0) * (p.claim + p.rationale) +
    (counts.forbidden ?? 0) * (20 + 18 + 22 + p.forbiddenReason + p.instead) +
    (counts.vocabulary ?? 0) * (14 + p.meaning) +
    (counts.arbitrations ?? 0) * (p.situation + p.answer) +
    (counts.foods ?? 0) * (16 + 14 + 60) +
    (counts.qa ?? 0) * (p.qaQuestion + p.qaAnswer);
}

const ZERO: Profile = {
  claim: 0,
  rationale: 0,
  forbiddenReason: 0,
  instead: 0,
  meaning: 0,
  situation: 0,
  answer: 0,
  qaQuestion: 0,
  qaAnswer: 0,
};

function measureStructure(): { fixed: number; perEntry: Record<string, number> } {
  banner("2. LE COÛT DE STRUCTURE — ce que le compilateur ajoute par lui-même");

  const empty = compileDoctrineBlock(syntheticDoctrine({}, ZERO), null).text.length;

  // ⚠️ `claim: 1` et pas 0: le parseur JETTE une croyance sans `claim` (et un
  // interdit sans `token`, une Q/R sans réponse…). Une doctrine « à texte nul »
  // ne compilerait donc pas 10 entrées vides, elle en compilerait zéro, et le
  // coût par entrée mesuré serait 0. Un caractère est le plus petit texte qui
  // survit au parseur; on le retranche ensuite.
  const ONE: Profile = {
    claim: 1,
    rationale: 1,
    forbiddenReason: 1,
    instead: 1,
    meaning: 1,
    situation: 1,
    answer: 1,
    qaQuestion: 1,
    qaAnswer: 1,
  };

  const sections = ["beliefs", "forbidden", "vocabulary", "arbitrations", "foods", "qa"];
  const perEntry: Record<string, number> = {};
  const N = 10;
  for (const s of sections) {
    const one = compileDoctrineBlock(syntheticDoctrine({ [s]: 1 }, ONE), null).text.length;
    const ten = compileDoctrineBlock(syntheticDoctrine({ [s]: N }, ONE), null).text.length;
    // La pente entre 1 et 10 isole le coût MARGINAL d'une entrée: l'en-tête de
    // section n'est payé qu'une fois et disparaît de la soustraction.
    const marginal = (ten - one) / (N - 1);
    const written = writtenChars({ [s]: 1 }, ONE) as number;
    perEntry[s] = marginal - written;
  }

  console.log(`  En-tête fixe (doctrine sans aucune entrée) : ${fmt(empty)}`);
  console.log("\n  Scaffolding par entrée, hors texte du coach :");
  for (const s of sections) {
    console.log(`    ${s.padEnd(14)} ${perEntry[s].toFixed(1).padStart(6)} car.`);
  }
  console.log(
    "\n  → Lecture: le bloc ≈ en-tête fixe + TOUT ce que le coach a écrit +\n" +
      "    ~une poignée de caractères par entrée. Le compilateur ne compresse\n" +
      "    RIEN. Ce n'est pas un défaut — c'est le contrat « lock 1: INJECTED ».\n" +
      "    Mais ça veut dire que le budget de prompt suit l'écriture du coach,\n" +
      "    linéairement, et qu'aucune borne n'existe entre les deux.",
  );
  return { fixed: empty, perEntry };
}

// ---------------------------------------------------------------------------
// 3. LA PROJECTION — trois profils d'écriture
// ---------------------------------------------------------------------------
interface Scenario {
  readonly name: string;
  readonly why: string;
  readonly counts: Record<string, number>;
  readonly profile: Profile;
}

/** Longueurs calibrées sur de la prose de coach réelle (phrases courtes). */
const TERSE: Profile = {
  claim: 90,
  rationale: 0,
  forbiddenReason: 60,
  instead: 90,
  meaning: 70,
  situation: 80,
  answer: 140,
  qaQuestion: 60,
  qaAnswer: 160,
};

/** Le coach qui explique. C'est le profil que produit une extraction d'ebook. */
const VERBOSE: Profile = {
  claim: 140,
  rationale: 120,
  forbiddenReason: 110,
  instead: 160,
  meaning: 110,
  situation: 130,
  answer: 300,
  qaQuestion: 90,
  qaAnswer: 340,
};

const SCENARIOS: readonly Scenario[] = [
  {
    name: "Interview seule",
    why: "les 11 réponses de /coach/doctrine, remplies sérieusement",
    counts: { beliefs: 5, forbidden: 4, vocabulary: 4, arbitrations: 4, foods: 5, qa: 3 },
    profile: TERSE,
  },
  {
    name: "Interview + 1 ebook",
    why: "un PDF de ~120 p. extrait par-dessus l'interview (fusion, pas remplacement)",
    counts: { beliefs: 20, forbidden: 12, vocabulary: 15, arbitrations: 25, foods: 20, qa: 30 },
    profile: VERBOSE,
  },
  {
    name: "Coach installé, 3 documents",
    why: "ebook + FAQ + transcription de conférence, fusionnés; rien n'est jamais retiré",
    counts: { beliefs: 50, forbidden: 25, vocabulary: 40, arbitrations: 70, foods: 45, qa: 120 },
    profile: VERBOSE,
  },
];

function measureScenarios(): void {
  banner("3. LA PROJECTION — ce que pèse le bloc selon ce que le coach a écrit");
  console.log("  scénario                       │ entrées │ bloc compilé");
  console.log("  ───────────────────────────────┼─────────┼──────────────────────────");
  for (const s of SCENARIOS) {
    const d = syntheticDoctrine(s.counts, s.profile);
    const chars = compileDoctrineBlock(d, null).text.length;
    const entries = Object.values(s.counts).reduce((a, b) => a + b, 0);
    console.log(
      `  ${s.name.padEnd(30)} │${String(entries).padStart(8)} │ ${fmt(chars)}`,
    );
    console.log(`    ${s.why}`);
  }

  // À PARTIR DE COMBIEN D'ENTRÉES ON FRANCHIT LES SEUILS.
  // On fait croître le scénario « ebook » proportionnellement — c'est la forme
  // que prend la croissance réelle: un coach ne triple pas ses seules Q/R, il
  // dépose un document de plus, qui abonde toutes les sections.
  console.log("\n  Seuils, en faisant croître le profil « ebook » à l'identique :");
  const base = SCENARIOS[1].counts;
  const targets = [2_000, 5_000, 10_000, 30_000];
  let ti = 0;
  // Pas de 2% et pas « un document de plus »: un pas d'un document entier
  // sauterait par-dessus trois seuils d'un coup et rendrait le tableau muet
  // exactement là où il doit parler.
  for (let k = 0.02; k <= 5 && ti < targets.length; k += 0.02) {
    const counts = Object.fromEntries(
      Object.entries(base).map(([s, n]) => [s, Math.max(0, Math.round(n * k))]),
    );
    const chars = compileDoctrineBlock(syntheticDoctrine(counts, VERBOSE), null).text.length;
    while (ti < targets.length && tok(chars) >= targets[ti]) {
      const entries = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(
        `    ${String(targets[ti]).padStart(6)} tok. franchis à ~${entries} entrées ` +
          `(${(k * 100).toFixed(0)} % d'un ebook de ce format)`,
      );
      ti++;
    }
  }

  // CE QUE ÇA COÛTE, et pourquoi le chiffre n'est pas « ×1 ».
  const ebook = compileDoctrineBlock(syntheticDoctrine(base, VERBOSE), null).text.length;
  console.log(
    `\n  Rappel de multiplication: ce bloc est injecté sur TROIS chemins\n` +
      `  (conversation, generate-week-plan-v1, generate-meal-v1), à CHAQUE\n` +
      `  appel, pour CHAQUE élève du coach. À ${tok(ebook).toLocaleString("en-US")} tokens, ` +
      `un coach de 30 élèves\n  qui parlent 5 fois par jour paie ` +
      `${((tok(ebook) * 30 * 5) / 1_000_000).toFixed(1)} M tokens d'entrée par jour ` +
      `sur la seule\n  conversation — avant tout ce que l'élève a écrit.`,
  );
}

// ---------------------------------------------------------------------------
// 4. LES PLAFONDS CONNUS — ce qui est borné, et ce qui ne l'est pas
// ---------------------------------------------------------------------------
async function measureBounded(): Promise<void> {
  banner("4. LES PLAFONDS — ce qui est borné aujourd'hui");

  // Le mapping alimentaire: le vocabulaire est FERMÉ. Une règle par groupe, un
  // groupe ne portant qu'une posture, le plafond est le nombre de groupes.
  const db = admin();
  const { data, error } = await db.from("food_groups").select("slug");
  const slugs = error ? [] : ((data ?? []) as { slug: string }[]).map((r) => r.slug);
  if (slugs.length === 0) {
    console.log("  ⚠️  `food_groups` illisible — plafond du mapping non mesuré.");
  } else {
    const rules: CoachFoodRule[] = slugs.map((slug, i) => ({
      food_group_ref: slug as CoachFoodRule["food_group_ref"],
      stance: (["encouraged", "discouraged", "excluded"] as const)[i % 3],
      goal_scope: [],
      rationale: text(90),
    }));
    const compiled = compileProtocol(
      { coachId: "c", contentLocale: "en", foodRules: rules, timingRules: [], terms: [] },
      null,
    );
    const block = protocolFoodBlock(compiled, "Marlow");
    console.log(
      `  Mapping alimentaire, TOUS les groupes couverts (${slugs.length}) : ${fmt(block.length)}`,
    );
    console.log(
      "    → BORNÉ par construction: le vocabulaire est fermé, un coach ne peut\n" +
        "      pas inventer un 31e groupe. Et ce bloc n'atteint que generate-meal-v1.",
    );
  }

  const note = coachNotePromptBlock({ note: text(COACH_NOTE_MAX_CHARS), reason: "loaded" }) ?? "";
  console.log(`\n  Note 1:1 du coach, au plafond (${COACH_NOTE_MAX_CHARS} car.) : ${fmt(note.length)}`);
  console.log("    → BORNÉ par un CHECK en base.");

  console.log(
    "\n  Doctrine : AUCUN plafond.\n" +
      "    · pas de CHECK en base (`coach_doctrines` porte du jsonb nu)\n" +
      "    · pas de cap dans `parseCoachDoctrine`\n" +
      "    · pas de cap dans `parseDocumentExtraction` — un PDF de 120 pages\n" +
      "      peut rendre autant d'entrées que le modèle en trouve\n" +
      "    · la fusion documentaire AJOUTE et ne retire jamais",
  );
}

banner("M1 — BUDGET DES BLOCS INJECTÉS  (tokens estimés à 4 car./token)");
await measureRealDoctrines();
measureStructure();
measureScenarios();
await measureBounded();
console.log("");
