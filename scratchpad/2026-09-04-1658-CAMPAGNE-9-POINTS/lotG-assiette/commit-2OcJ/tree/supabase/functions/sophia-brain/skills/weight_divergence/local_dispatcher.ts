/**
 * FF-056 — LE DISPATCHER LOCAL. Il classe, il ne décide pas.
 *
 * ── SA SEULE SORTIE EST UN MEMBRE D'UN ENSEMBLE FERMÉ ──────────────────────
 * `classifyDivergenceReply` rend toujours une des neuf catégories de §3. Un
 * token inventé, un JSON cassé, un timeout, une clé absente: tout devient
 * `other`, qui a une branche PRÉVUE (reformuler une fois). C'est R4 rendue
 * vérifiable — « le LLM choisit DANS l'ensemble » n'est pas une consigne de
 * prompt, c'est le type de retour.
 *
 * ── LE REFUS NE TRANSITE PAS PAR LE MODÈLE, ET C'EST LA RÈGLE DU DÉPÔT ────
 * « Ce qui OUVRE un effet durable ne transite jamais par le LLM du dispatcher:
 * plancher déterministe avant le modèle, toujours. » Un refus double le
 * cooldown (R9) et doit sortir IMMÉDIATEMENT (R10) — c'est un effet durable.
 * Le lexique ci-dessous mord AVANT l'appel, dans les deux langues, et il gagne.
 *
 * Le mode de défaillance qu'on évite est précis et il a déjà été mesuré
 * ailleurs dans ce dépôt: sur une phrase identique, le dispatcher a rendu
 * `[0,3,3,0]` — c'est-à-dire qu'un « je n'ai pas envie d'en parler » aurait été
 * respecté une fois sur deux. Une fois sur deux, c'est pire que jamais: ça
 * apprend que dire non ne sert à rien.
 */

import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  isWeightDivergenceCategory,
  isWeightDivergenceSlot,
  WEIGHT_DIVERGENCE_CATEGORIES,
  WEIGHT_DIVERGENCE_SLOTS,
  type WeightDivergenceCategory,
  type WeightDivergenceSlot,
} from "./contract.ts";

// ---------------------------------------------------------------------------
// LE PLANCHER DÉTERMINISTE DU REFUS
// ---------------------------------------------------------------------------

/**
 * Même pliage que les planchers du dépôt: accents et ponctuation ne peuvent pas
 * cacher une intention. `\b` ne mord pas après « é » — la cicatrice
 * `guard-tested-in-one-language-only` a été payée exactement là.
 */
function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * LES FORMES DU REFUS, FR ET EN. Liste fermée, testée dans les deux langues.
 *
 * ⚠️ « ça va » / « i'm fine » N'EST PAS ICI, et c'est délibéré. Sous ce flow,
 * « ça va » est une RÉPONSE à la question (une contestation implicite du
 * constat), pas un refus d'en parler. Le lire comme un refus doublerait le
 * cooldown de quelqu'un qui venait de répondre — et le refus, lui, est
 * volontairement explicite dans toutes les langues.
 */
const DECLINE_PATTERNS: readonly RegExp[] = Object.freeze([
  // --- FR ---
  /\bj ai pas envie d en parler\b/,
  /\bje n ai pas envie d en parler\b/,
  /\bpas envie d en parler\b/,
  /\bje (ne )?veux pas en parler\b/,
  /\bje prefere pas en parler\b/,
  /\bje prefere ne pas en parler\b/,
  /\bon (en )?parle pas\b/,
  /\bon (ne )?parle pas de (ca|mon poids)\b/,
  // ⚠️ TROUVÉ PAR LA SONDE DE CE LOT, pas en production: « on parle d'autre
  // chose » — la forme la plus courante du refus poli en français — passait à
  // travers, parce que la liste ne portait que « parlons d'autre chose ».
  /\b(on |)parl(e|ons|er|ez) d autre chose\b/,
  /\blaisse tomber\b/,
  /\blaissez tomber\b/,
  /\bca (ne )?te regarde pas\b/,
  /\bpasse a autre chose\b/,
  /\bchangeons de sujet\b/,
  /\bparlons d autre chose\b/,
  /\bstop\b/,
  // --- EN ---
  /\bi (do not|don t|dont) want to talk about (it|this|that|my weight)\b/,
  /\bi (would )?(d )?rather not talk about\b/,
  /\bi (would )?(d )?rather not (get into|discuss)\b/,
  /\bnot something i want to (talk about|discuss)\b/,
  /\bi m not discussing\b/,
  /\bnone of your business\b/,
  /\bdrop it\b/,
  /\bleave it\b/,
  /\blet s (not|drop|move on|change the subject)\b/,
  /\bchange the subject\b/,
  /\bmove on\b/,
  /\bcan we not\b/,
]);

/** Le refus, reconnu déterministiquement. Rien d'autre ne passe par ici. */
export function detectDeclineFloor(message: string): boolean {
  const folded = fold(message);
  if (!folded) return false;
  return DECLINE_PATTERNS.some((pattern) => pattern.test(folded));
}

// ---------------------------------------------------------------------------
// LE CLASSIFIEUR
// ---------------------------------------------------------------------------

export interface DivergenceClassificationInput {
  user_id: string;
  request_id?: string | null;
  /** La réponse de la personne. */
  userMessage: string;
}

export interface DivergenceClassification {
  category: WeightDivergenceCategory;
  /**
   * LE MOMENT NOMMÉ, dans un ensemble fermé. `unspecified` par défaut, et sur
   * toute catégorie autre que `named_spot`.
   *
   * ⚠️ C'est ce qui empêche d'agir AILLEURS que là où la personne a nommé — le
   * défaut mesuré en run réel (« le matin je grignote » → une collation
   * l'après-midi). Voir `WEIGHT_DIVERGENCE_SLOTS`.
   */
  namedSlot: WeightDivergenceSlot;
  /**
   * Comment on y est arrivé. `decline_floor` = le plancher déterministe;
   * `model` = le modèle a choisi dans l'ensemble; `out_of_set` = il a répondu
   * autre chose et on a replié sur `other`; `unavailable` = pas de réponse.
   *
   * ⚠️ Le motif n'est pas décoratif: `out_of_set` mesuré haut voudrait dire que
   * l'ensemble fermé ne couvre pas ce que les gens répondent, ce qui est le
   * signal de §9 (« une personne mal lue ne répond plus »).
   */
  source: "decline_floor" | "model" | "out_of_set" | "unavailable";
}

/**
 * ⚠️ AUCUN CHIFFRE, AUCUNE SÉRIE, AUCUNE COCHE N'ENTRE DANS CE PROMPT.
 *
 * Le classifieur ne reçoit QUE la phrase de la personne. Deux raisons, et la
 * seconde est la vraie: il n'en a pas besoin pour classer; et le rabbit hole
 * §9 dit que « le framing "il ment" ne doit exister nulle part, y compris dans
 * les prompts internes — ce qui entre dans un prompt finit par sortir ». Donner
 * au classifieur la série de poids ET les coches, c'est écrire le recoupement
 * qu'on s'interdit de montrer.
 */
const SYSTEM_PROMPT = [
  "You classify ONE reply from a person who was asked an open question about why",
  "their plan's result is not following. You are NOT judging them, NOT verifying",
  "anything, and NOT deciding what happens next. You only pick a label.",
  "",
  "Pick EXACTLY ONE label from this closed list:",
  '- "named_spot": they name a moment, a food or a habit where extra eating happens',
  '    ("I snack in the morning", "I go back for seconds", "bread at night").',
  '- "plan_mismatch": they are not eating the plan at all — they cook something',
  '    else, they eat out, the plan does not fit their days.',
  '- "activity_drop": their physical activity fell (stopped sport, injury, less walking).',
  '- "medical": a treatment, a medication, a condition, a hormonal cause.',
  '- "life_factor": sleep, stress, work, life circumstances.',
  '- "not_a_divergence": they contest the reading itself — muscle, water, a bad',
  '    scale, a wrong weigh-in, "it is normal".',
  '- "unknown": they genuinely do not know.',
  '- "declined": they do not want to talk about it.',
  '- "other": anything that does not clearly fit one of the above.',
  "",
  'ALSO return "slot": WHEN in the day the extra eating happens, ONLY if the',
  'person named it. Closed list: "morning", "midday", "afternoon", "evening",',
  '"night", "unspecified".',
  '- Use "unspecified" whenever they named a food or a habit but no time of day,',
  '  and for every category other than "named_spot".',
  "- NEVER guess the slot. If they did not say when, it is \"unspecified\". A",
  "  wrong slot makes the plan change the wrong meal, which is worse than no",
  "  change at all.",
  "",
  "RULES:",
  "- If it could be two labels, pick the one the person's OWN WORDS support most",
  "  literally. Never infer a cause they did not state.",
  '- If you are not confident, answer "other". "other" is a correct answer and it',
  "  has its own handling. A wrong confident label produces an action that misses,",
  "  and that is worse than admitting the reply was unclear.",
  '- Never invent a label outside the list.',
  "",
  'Return strictly one JSON object: {"category":"...","slot":"..."}.',
].join("\n");

function parseAnswer(raw: unknown): { category: string | null; slot: string | null } {
  try {
    // deno-lint-ignore no-explicit-any
    const root: any = typeof raw === "string" ? JSON.parse(extractJson(raw)) : raw;
    const category = root?.category;
    const slot = root?.slot;
    return {
      category: typeof category === "string" ? category.trim() : null,
      slot: typeof slot === "string" ? slot.trim() : null,
    };
  } catch {
    return { category: null, slot: null };
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return "{}";
  return text.slice(start, end + 1);
}

export type DivergenceClassifier = (
  input: DivergenceClassificationInput,
) => Promise<string | null>;

let classifierForTest: DivergenceClassifier | null = null;

export function setDivergenceClassifierForTest(
  classifier: DivergenceClassifier | null,
) {
  classifierForTest = classifier;
}

export async function classifyDivergenceReply(
  input: DivergenceClassificationInput,
): Promise<DivergenceClassification> {
  // LE PLANCHER D'ABORD, TOUJOURS. Il gagne contre le modèle, y compris quand
  // le modèle dirait autre chose — c'est le sens de « plancher ».
  if (detectDeclineFloor(input.userMessage)) {
    return { category: "declined", namedSlot: "unspecified", source: "decline_floor" };
  }

  let raw: unknown = null;
  try {
    raw = classifierForTest
      ? await classifierForTest(input)
      : await generateWithGemini(
        SYSTEM_PROMPT,
        JSON.stringify({ reply: String(input.userMessage ?? "").slice(0, 1200) }),
        0,
        true,
        [],
        "auto",
        {
          requestId: input.request_id ?? undefined,
          userId: input.user_id,
          model: getGlobalAiModel(),
          source: "weight_divergence.classify",
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 30_000,
          maxRetries: 1,
        },
      );
  } catch (error) {
    console.warn("[WeightDivergence] classifier failed", error);
    return { category: "other", namedSlot: "unspecified", source: "unavailable" };
  }

  const parsed = parseAnswer(raw);
  const value = parsed.category;
  // Le moment suit la MÊME discipline que la catégorie: hors ensemble ⇒
  // `unspecified`, c'est-à-dire « aucune action », jamais une action ailleurs.
  const namedSlot: WeightDivergenceSlot = isWeightDivergenceSlot(parsed.slot)
    ? parsed.slot
    : "unspecified";
  if (value === null) {
    return { category: "other", namedSlot: "unspecified", source: "unavailable" };
  }
  if (isWeightDivergenceCategory(value)) {
    // ⚠️ LE MODÈLE NE PEUT PAS PRONONCER `declined`. Le refus est un effet
    // durable: seul le plancher déterministe l'ouvre. Un modèle qui le rend ici
    // est un modèle qui aurait pu le rendre au hasard, et un refus tiré au sort
    // est pire qu'un refus ignoré — il apprend que dire non marche parfois.
    if (value === "declined") {
      return { category: "other", namedSlot: "unspecified", source: "out_of_set" };
    }
    return {
      category: value,
      // Un moment n'a de sens que sur `named_spot`. Le porter ailleurs ferait
      // entrer une valeur que rien ne lit — et qu'un jour quelqu'un lira.
      namedSlot: value === "named_spot" ? namedSlot : "unspecified",
      source: "model",
    };
  }
  console.warn("weight_divergence.classification_out_of_set", { value });
  return { category: "other", namedSlot: "unspecified", source: "out_of_set" };
}

/** Exporté pour le test de contrat: l'ensemble du prompt EST l'ensemble du type. */
export function promptMentionsEveryCategory(): boolean {
  return WEIGHT_DIVERGENCE_CATEGORIES.every((category) =>
    SYSTEM_PROMPT.includes(`"${category}"`)
  );
}

/** Idem pour les moments: un moment du type absent du prompt est inatteignable. */
export function promptMentionsEverySlot(): boolean {
  return WEIGHT_DIVERGENCE_SLOTS.every((slot) => SYSTEM_PROMPT.includes(`"${slot}"`));
}
