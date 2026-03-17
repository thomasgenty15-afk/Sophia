import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type GlobalMemorySource =
  | "chat"
  | "onboarding"
  | "bilan"
  | "module"
  | "plan";

type TaxonomySubtheme = {
  key: string;
  label: string;
  aliases: string[];
};

type TaxonomyTheme = {
  key: string;
  label: string;
  aliases: string[];
  subthemes: TaxonomySubtheme[];
};

type PendingGlobalMemoryUpdate = {
  at: string;
  source_type: GlobalMemorySource;
  summary_delta: string;
  facts: string[];
  inferences: string[];
  active_issues: string[];
  goals: string[];
  open_questions: string[];
  supporting_topic_slugs: string[];
  confidence: number;
};

export interface GlobalMemoryCandidate {
  theme: string;
  subtheme_key: string;
  full_key: string;
  summary_delta: string;
  facts: string[];
  inferences: string[];
  active_issues: string[];
  goals: string[];
  open_questions: string[];
  supporting_topic_slugs: string[];
  confidence: number;
}

export interface GlobalMemory {
  id: string;
  user_id: string;
  theme: string;
  subtheme_key: string;
  full_key: string;
  status: string;
  canonical_summary: string;
  facts: string[];
  inferences: string[];
  active_issues: string[];
  goals: string[];
  open_questions: string[];
  supporting_topic_slugs: string[];
  pending_updates: PendingGlobalMemoryUpdate[];
  mention_count: number;
  enrichment_count: number;
  pending_count: number;
  pending_chars: number;
  confidence: number;
  summary_compacted_at?: string | null;
  first_observed_at: string;
  last_observed_at: string | null;
  last_retrieved_at?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface GlobalMemorySearchResult extends GlobalMemory {
  match_score?: number;
}

const GLOBAL_MEMORY_PENDING_LIMIT = 12;
const GLOBAL_MEMORY_FACTS_LIMIT = 10;
const GLOBAL_MEMORY_INFERENCES_LIMIT = 8;
const GLOBAL_MEMORY_ISSUES_LIMIT = 8;
const GLOBAL_MEMORY_GOALS_LIMIT = 8;
const GLOBAL_MEMORY_QUESTIONS_LIMIT = 6;
const GLOBAL_MEMORY_SUPPORTING_TOPICS_LIMIT = 20;
const GLOBAL_MEMORY_SUMMARY_DELTA_MAX = 320;
const GLOBAL_MEMORY_ITEM_MAX = 180;

const GLOBAL_MEMORY_TAXONOMY: TaxonomyTheme[] = [
  {
    key: "psychologie",
    label: "Psychologie",
    aliases: ["psychologie", "psychologique", "mental", "etat mental"],
    subthemes: [
      {
        key: "identite",
        label: "Identité",
        aliases: ["identite", "identité", "qui je suis", "moi profond"],
      },
      {
        key: "discipline",
        label: "Discipline",
        aliases: ["discipline", "rigueur", "self control", "volonte"],
      },
      {
        key: "motivation",
        label: "Motivation",
        aliases: ["motivation", "elan", "envie", "drive"],
      },
      {
        key: "attention_focus",
        label: "Attention / Focus",
        aliases: ["focus", "concentration", "dispersion", "attention"],
      },
      {
        key: "stress_anxiete",
        label: "Stress / Anxiété",
        aliases: ["stress", "anxiete", "anxiété", "pression"],
      },
      {
        key: "validation_externe",
        label: "Validation externe",
        aliases: [
          "validation externe",
          "regard des autres",
          "plaire",
          "approbation",
        ],
      },
    ],
  },
  {
    key: "travail",
    label: "Travail",
    aliases: ["travail", "job", "boulot", "carriere", "carrière", "pro"],
    subthemes: [
      {
        key: "situation_professionnelle",
        label: "Situation professionnelle",
        aliases: ["situation professionnelle", "poste actuel", "job actuel"],
      },
      {
        key: "relations_professionnelles",
        label: "Relations professionnelles",
        aliases: [
          "relations professionnelles",
          "collegues",
          "collègues",
          "manager",
        ],
      },
      {
        key: "conflits_professionnels",
        label: "Conflits professionnels",
        aliases: [
          "conflit pro",
          "conflits professionnels",
          "tension au travail",
          "litige",
        ],
      },
      {
        key: "remuneration",
        label: "Rémunération",
        aliases: [
          "remuneration",
          "rémunération",
          "salaire",
          "variable",
          "commission",
        ],
      },
      {
        key: "competences_expertise",
        label: "Compétences / Expertise",
        aliases: ["competences", "compétences", "expertise", "savoir faire"],
      },
      {
        key: "ambitions_professionnelles",
        label: "Ambitions professionnelles",
        aliases: [
          "ambition",
          "ambitions professionnelles",
          "evolution de carriere",
          "carrière",
        ],
      },
    ],
  },
  {
    key: "projets",
    label: "Projets",
    aliases: ["projets", "project", "side project", "startup", "produit"],
    subthemes: [
      {
        key: "projets_personnels",
        label: "Projets personnels",
        aliases: ["projets personnels", "projet perso", "side project"],
      },
      {
        key: "projets_entrepreneuriaux",
        label: "Projets entrepreneuriaux",
        aliases: [
          "startup",
          "business",
          "projet entrepreneurial",
          "entreprise",
        ],
      },
      {
        key: "avancement_projets",
        label: "Avancement des projets",
        aliases: ["avancement", "progression projet", "etat du projet"],
      },
      {
        key: "blocages_projets",
        label: "Blocages projets",
        aliases: ["blocage projet", "frein projet", "difficultes projet"],
      },
      {
        key: "vision_long_terme",
        label: "Vision long terme",
        aliases: ["vision long terme", "vision", "long terme", "trajectoire"],
      },
    ],
  },
  {
    key: "relations",
    label: "Relations",
    aliases: ["relations", "social", "relationnel", "amour"],
    subthemes: [
      {
        key: "dating",
        label: "Dating",
        aliases: ["dating", "rencontres", "drague", "date"],
      },
      {
        key: "relations_amoureuses",
        label: "Relations amoureuses",
        aliases: [
          "relation amoureuse",
          "couple",
          "amour",
          "relation sentimentale",
        ],
      },
      {
        key: "communication_interpersonnelle",
        label: "Communication interpersonnelle",
        aliases: ["communication", "interactions", "conversation"],
      },
      {
        key: "confiance_sociale",
        label: "Confiance sociale",
        aliases: ["confiance sociale", "aisance sociale", "assurance sociale"],
      },
      {
        key: "charisme_presence",
        label: "Charisme / Présence",
        aliases: [
          "charisme",
          "presence",
          "présence",
          "magnetisme",
          "magnétisme",
        ],
      },
    ],
  },
  {
    key: "famille",
    label: "Famille",
    aliases: ["famille", "parents", "frere", "frère", "soeur", "sœur"],
    subthemes: [
      {
        key: "parents",
        label: "Parents",
        aliases: ["parents", "pere", "père", "mere", "mère"],
      },
      {
        key: "fratrie",
        label: "Fratrie",
        aliases: ["fratrie", "frere", "frère", "soeur", "sœur"],
      },
      {
        key: "dynamique_familiale",
        label: "Dynamique familiale",
        aliases: [
          "dynamique familiale",
          "ambiance familiale",
          "relation familiale",
        ],
      },
    ],
  },
  {
    key: "amis",
    label: "Amis",
    aliases: ["amis", "amitiés", "amitie", "potes", "cercle social"],
    subthemes: [
      {
        key: "cercle_social",
        label: "Cercle social",
        aliases: ["cercle social", "groupe d amis", "groupe social"],
      },
      {
        key: "amis_proches",
        label: "Amis proches",
        aliases: ["amis proches", "meilleur ami", "proches"],
      },
    ],
  },
  {
    key: "sante",
    label: "Santé",
    aliases: ["sante", "santé", "forme", "corps", "physique"],
    subthemes: [
      {
        key: "sommeil",
        label: "Sommeil",
        aliases: ["sommeil", "dormir", "insomnie", "endormissement"],
      },
      {
        key: "energie",
        label: "Énergie",
        aliases: ["energie", "énergie", "fatigue", "vitalite", "vitalité"],
      },
      {
        key: "addictions",
        label: "Addictions",
        aliases: [
          "addiction",
          "addictions",
          "dependance",
          "dépendance",
          "consommation",
        ],
      },
      {
        key: "sexualite",
        label: "Sexualité",
        aliases: ["sexualite", "sexualité", "desir", "désir", "libido"],
      },
      {
        key: "activite_physique",
        label: "Activité physique",
        aliases: [
          "sport",
          "activite physique",
          "activité physique",
          "entrainement",
          "entraînement",
        ],
      },
    ],
  },
  {
    key: "habitudes",
    label: "Habitudes",
    aliases: ["habitudes", "routine", "rituel", "automatismes"],
    subthemes: [
      {
        key: "routines_quotidiennes",
        label: "Routines quotidiennes",
        aliases: ["routine", "routines", "rituels", "quotidien"],
      },
      {
        key: "procrastination",
        label: "Procrastination",
        aliases: ["procrastination", "remettre a plus tard", "éviter"],
      },
      {
        key: "consommation_nocive",
        label: "Consommation nocive",
        aliases: ["porno", "cannabis", "consommation nocive", "dopamine"],
      },
      {
        key: "gestion_des_impulsions",
        label: "Gestion des impulsions",
        aliases: ["impulsions", "pulsions", "self control", "compulsion"],
      },
    ],
  },
  {
    key: "sens",
    label: "Sens",
    aliases: ["sens", "valeurs", "mission", "spiritualite", "spiritualité"],
    subthemes: [
      {
        key: "spiritualite",
        label: "Spiritualité",
        aliases: [
          "spiritualite",
          "spiritualité",
          "conscience",
          "energie",
          "énergie",
        ],
      },
      {
        key: "mission_de_vie",
        label: "Mission de vie",
        aliases: [
          "mission",
          "impact",
          "mission de vie",
          "destinee",
          "destinée",
        ],
      },
      {
        key: "valeurs",
        label: "Valeurs",
        aliases: ["valeurs", "principes", "ce qui compte"],
      },
    ],
  },
  {
    key: "passions",
    label: "Passions",
    aliases: [
      "passions",
      "interets",
      "intérêts",
      "loisirs",
      "creatif",
      "créatif",
    ],
    subthemes: [
      {
        key: "creation_artistique",
        label: "Création artistique",
        aliases: ["creation", "création", "artistique", "ecriture", "écriture"],
      },
      {
        key: "musique",
        label: "Musique",
        aliases: ["musique", "rap", "lyrics", "sons"],
      },
      {
        key: "fiction_divertissement",
        label: "Fiction / Divertissement",
        aliases: ["films", "series", "séries", "jeux", "fiction"],
      },
      {
        key: "apprentissages_interets",
        label: "Apprentissages / Intérêts",
        aliases: [
          "apprentissage",
          "interets",
          "intérêts",
          "curiosites",
          "curiosités",
        ],
      },
    ],
  },
];

const THEME_BY_KEY = new Map<string, TaxonomyTheme>(
  GLOBAL_MEMORY_TAXONOMY.map((theme) => [theme.key, theme]),
);
const SUBTHEME_BY_FULL_KEY = new Map<
  string,
  { theme: TaxonomyTheme; subtheme: TaxonomySubtheme }
>(
  GLOBAL_MEMORY_TAXONOMY.flatMap((theme) =>
    theme.subthemes.map((subtheme) =>
      [`${theme.key}.${subtheme.key}`, { theme, subtheme }] as const
    )
  ),
);
const ALLOWED_FULL_KEYS = new Set<string>(SUBTHEME_BY_FULL_KEY.keys());

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ");
}

function slugifyKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function compactText(value: unknown, maxLen = GLOBAL_MEMORY_ITEM_MAX): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function uniqueStrings(
  values: unknown,
  maxItems: number,
  maxLen = GLOBAL_MEMORY_ITEM_MAX,
): string[] {
  const input = Array.isArray(values) ? values : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const compact = compactText(raw, maxLen);
    if (!compact) continue;
    const key = normalizeText(compact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(compact);
    if (out.length >= maxItems) break;
  }
  return out;
}

function readStringArray(
  value: unknown,
  maxItems: number,
  maxLen = GLOBAL_MEMORY_ITEM_MAX,
): string[] {
  return uniqueStrings(Array.isArray(value) ? value : [], maxItems, maxLen);
}

function readPendingUpdates(value: unknown): PendingGlobalMemoryUpdate[] {
  if (!Array.isArray(value)) return [];
  const out: PendingGlobalMemoryUpdate[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const at = String(row.at ?? "").trim();
    const sourceType = String(row.source_type ?? "")
      .trim() as GlobalMemorySource;
    const summaryDelta = compactText(
      row.summary_delta,
      GLOBAL_MEMORY_SUMMARY_DELTA_MAX,
    );
    if (!at || !summaryDelta) continue;
    out.push({
      at,
      source_type: sourceType || "chat",
      summary_delta: summaryDelta,
      facts: readStringArray(row.facts, 4),
      inferences: readStringArray(row.inferences, 3),
      active_issues: readStringArray(row.active_issues, 3),
      goals: readStringArray(row.goals, 3),
      open_questions: readStringArray(row.open_questions, 2),
      supporting_topic_slugs: readStringArray(row.supporting_topic_slugs, 8, 80)
        .map(slugifyKey).filter(Boolean),
      confidence: clampConfidence(row.confidence, 0.5),
    });
  }
  return out.slice(-GLOBAL_MEMORY_PENDING_LIMIT);
}

function toGlobalMemoryRow(row: any): GlobalMemory {
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? ""),
    theme: String(row?.theme ?? ""),
    subtheme_key: String(row?.subtheme_key ?? ""),
    full_key: String(row?.full_key ?? ""),
    status: String(row?.status ?? "active"),
    canonical_summary: compactText(row?.canonical_summary, 1200),
    facts: readStringArray(row?.facts, GLOBAL_MEMORY_FACTS_LIMIT),
    inferences: readStringArray(
      row?.inferences,
      GLOBAL_MEMORY_INFERENCES_LIMIT,
    ),
    active_issues: readStringArray(
      row?.active_issues,
      GLOBAL_MEMORY_ISSUES_LIMIT,
    ),
    goals: readStringArray(row?.goals, GLOBAL_MEMORY_GOALS_LIMIT),
    open_questions: readStringArray(
      row?.open_questions,
      GLOBAL_MEMORY_QUESTIONS_LIMIT,
    ),
    supporting_topic_slugs: readStringArray(
      row?.supporting_topic_slugs,
      GLOBAL_MEMORY_SUPPORTING_TOPICS_LIMIT,
      80,
    ).map(slugifyKey).filter(Boolean),
    pending_updates: readPendingUpdates(row?.pending_updates),
    mention_count: Math.max(0, Number(row?.mention_count ?? 0) || 0),
    enrichment_count: Math.max(0, Number(row?.enrichment_count ?? 0) || 0),
    pending_count: Math.max(0, Number(row?.pending_count ?? 0) || 0),
    pending_chars: Math.max(0, Number(row?.pending_chars ?? 0) || 0),
    confidence: clampConfidence(row?.confidence, 0.5),
    summary_compacted_at: row?.summary_compacted_at
      ? String(row.summary_compacted_at)
      : null,
    first_observed_at: String(row?.first_observed_at ?? row?.created_at ?? ""),
    last_observed_at: row?.last_observed_at
      ? String(row.last_observed_at)
      : null,
    last_retrieved_at: row?.last_retrieved_at
      ? String(row.last_retrieved_at)
      : null,
    metadata: row?.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : {},
    created_at: row?.created_at ? String(row.created_at) : undefined,
    updated_at: row?.updated_at ? String(row.updated_at) : undefined,
  };
}

function sumPendingChars(updates: PendingGlobalMemoryUpdate[]): number {
  return updates.reduce(
    (acc, row) => acc + String(row.summary_delta ?? "").length,
    0,
  );
}

function computeRecencyScore(iso: string | null | undefined): number {
  if (!iso) return 0.2;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 0.2;
  const diffDays = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (diffDays <= 2) return 1;
  if (diffDays <= 7) return 0.8;
  if (diffDays <= 30) return 0.45;
  return 0.15;
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .replace(/[._-]/g, " ")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function aliasPhraseScore(messageNorm: string, aliases: string[]): number {
  let best = 0;
  for (const alias of aliases) {
    const normalized = normalizeText(alias);
    if (!normalized) continue;
    if (messageNorm.includes(normalized)) {
      best = Math.max(best, normalized.includes(" ") ? 1 : 0.85);
    }
  }
  return best;
}

function descriptorFor(
  fullKey: string,
): { theme: TaxonomyTheme; subtheme: TaxonomySubtheme } | null {
  return SUBTHEME_BY_FULL_KEY.get(fullKey) ?? null;
}

function buildSearchText(memory: GlobalMemory): string {
  return [
    memory.full_key,
    memory.supporting_topic_slugs.join(" "),
    memory.facts.slice(0, 4).join(" "),
    memory.goals.slice(0, 3).join(" "),
    memory.active_issues.slice(0, 3).join(" "),
  ].join(" ");
}

function mergeLists(
  existing: string[],
  incoming: string[],
  maxItems: number,
): string[] {
  return uniqueStrings([...existing, ...incoming], maxItems);
}

function buildPendingUpdate(
  candidate: GlobalMemoryCandidate,
  sourceType: GlobalMemorySource,
  now: string,
): PendingGlobalMemoryUpdate {
  return {
    at: now,
    source_type: sourceType,
    summary_delta: candidate.summary_delta,
    facts: candidate.facts,
    inferences: candidate.inferences,
    active_issues: candidate.active_issues,
    goals: candidate.goals,
    open_questions: candidate.open_questions,
    supporting_topic_slugs: candidate.supporting_topic_slugs,
    confidence: candidate.confidence,
  };
}

function pendingUpdateExists(
  existing: PendingGlobalMemoryUpdate[],
  candidate: GlobalMemoryCandidate,
): boolean {
  const summaryKey = normalizeText(candidate.summary_delta);
  if (!summaryKey) return false;
  return existing.some((row) =>
    normalizeText(row.summary_delta) === summaryKey
  );
}

function hasNovelSignal(
  existing: GlobalMemory,
  candidate: GlobalMemoryCandidate,
): boolean {
  const baseline = [
    ...existing.facts,
    ...existing.inferences,
    ...existing.active_issues,
    ...existing.goals,
    ...existing.open_questions,
    existing.canonical_summary,
  ].map((item) => normalizeText(item));
  const incoming = [
    ...candidate.facts,
    ...candidate.inferences,
    ...candidate.active_issues,
    ...candidate.goals,
    ...candidate.open_questions,
    candidate.summary_delta,
  ].map((item) => normalizeText(item)).filter(Boolean);
  return incoming.some((item) => !baseline.includes(item));
}

export function getGlobalMemoryTaxonomyPromptBlock(): string {
  const lines: string[] = ["SOUS-THÈMES GLOBAUX AUTORISÉS :"];
  for (const theme of GLOBAL_MEMORY_TAXONOMY) {
    lines.push(
      `- ${theme.key}: ${
        theme.subthemes.map((subtheme) => `${theme.key}.${subtheme.key}`).join(
          ", ",
        )
      }`,
    );
  }
  return lines.join("\n");
}

export const GLOBAL_MEMORY_TAXONOMY_PROMPT_BLOCK =
  getGlobalMemoryTaxonomyPromptBlock();

export function sanitizeGlobalMemoryCandidate(
  raw: unknown,
): GlobalMemoryCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const theme = slugifyKey(row.theme);
  const subthemeKey = slugifyKey(row.subtheme_key);
  const fullKeyRaw = String(row.full_key ?? "").trim();
  const fullKey = fullKeyRaw
    ? `${slugifyKey(fullKeyRaw.split(".")[0])}.${
      slugifyKey(fullKeyRaw.split(".").slice(1).join("_"))
    }`
    : (theme && subthemeKey ? `${theme}.${subthemeKey}` : "");
  if (!ALLOWED_FULL_KEYS.has(fullKey)) return null;
  const descriptor = descriptorFor(fullKey);
  if (!descriptor) return null;

  const summaryDelta = compactText(
    row.summary_delta,
    GLOBAL_MEMORY_SUMMARY_DELTA_MAX,
  );
  const facts = readStringArray(row.facts, 3);
  const inferences = readStringArray(row.inferences, 2);
  const activeIssues = readStringArray(row.active_issues, 2);
  const goals = readStringArray(row.goals, 2);
  const openQuestions = readStringArray(row.open_questions, 2);
  const supportingTopicSlugs = readStringArray(
    row.supporting_topic_slugs,
    8,
    80,
  ).map(slugifyKey).filter(Boolean);
  const confidence = clampConfidence(row.confidence, 0.68);

  if (
    !summaryDelta && facts.length === 0 && inferences.length === 0 &&
    activeIssues.length === 0 && goals.length === 0 &&
    openQuestions.length === 0
  ) {
    return null;
  }

  return {
    theme: descriptor.theme.key,
    subtheme_key: descriptor.subtheme.key,
    full_key: fullKey,
    summary_delta: summaryDelta,
    facts,
    inferences,
    active_issues: activeIssues,
    goals,
    open_questions: openQuestions,
    supporting_topic_slugs: supportingTopicSlugs,
    confidence,
  };
}

export async function upsertGlobalMemoryCandidate(opts: {
  supabase: SupabaseClient;
  userId: string;
  candidate: GlobalMemoryCandidate;
  sourceType?: GlobalMemorySource;
}): Promise<
  {
    created: boolean;
    updated: boolean;
    noop: boolean;
    needsCompaction: boolean;
  }
> {
  const { supabase, userId } = opts;
  const candidate = sanitizeGlobalMemoryCandidate(opts.candidate);
  if (!candidate) {
    return {
      created: false,
      updated: false,
      noop: true,
      needsCompaction: false,
    };
  }
  const sourceType = opts.sourceType ?? "chat";
  const now = new Date().toISOString();

  const { data: existingRow, error: existingErr } = await supabase
    .from("user_global_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("full_key", candidate.full_key)
    .eq("status", "active")
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (!existingRow) {
    const { error: insertErr } = await supabase
      .from("user_global_memories")
      .insert({
        user_id: userId,
        theme: candidate.theme,
        subtheme_key: candidate.subtheme_key,
        full_key: candidate.full_key,
        status: "active",
        canonical_summary: candidate.summary_delta,
        facts: candidate.facts,
        inferences: candidate.inferences,
        active_issues: candidate.active_issues,
        goals: candidate.goals,
        open_questions: candidate.open_questions,
        supporting_topic_slugs: candidate.supporting_topic_slugs,
        pending_updates: [],
        mention_count: 1,
        enrichment_count: 0,
        pending_count: 0,
        pending_chars: 0,
        confidence: candidate.confidence,
        summary_compacted_at: now,
        first_observed_at: now,
        last_observed_at: now,
        metadata: {
          source_type: sourceType,
        },
        updated_at: now,
      } as any);
    if (insertErr) throw insertErr;
    return {
      created: true,
      updated: false,
      noop: false,
      needsCompaction: false,
    };
  }

  const existing = toGlobalMemoryRow(existingRow);
  const mergedFacts = mergeLists(
    existing.facts,
    candidate.facts,
    GLOBAL_MEMORY_FACTS_LIMIT,
  );
  const mergedInferences = mergeLists(
    existing.inferences,
    candidate.inferences,
    GLOBAL_MEMORY_INFERENCES_LIMIT,
  );
  const mergedIssues = mergeLists(
    existing.active_issues,
    candidate.active_issues,
    GLOBAL_MEMORY_ISSUES_LIMIT,
  );
  const mergedGoals = mergeLists(
    existing.goals,
    candidate.goals,
    GLOBAL_MEMORY_GOALS_LIMIT,
  );
  const mergedQuestions = mergeLists(
    existing.open_questions,
    candidate.open_questions,
    GLOBAL_MEMORY_QUESTIONS_LIMIT,
  );
  const mergedSupportingTopics = mergeLists(
    existing.supporting_topic_slugs,
    candidate.supporting_topic_slugs,
    GLOBAL_MEMORY_SUPPORTING_TOPICS_LIMIT,
  );
  const pendingUpdates = existing.pending_updates.slice();
  const shouldAppendPending = hasNovelSignal(existing, candidate) &&
    !pendingUpdateExists(pendingUpdates, candidate);

  if (shouldAppendPending) {
    pendingUpdates.push(buildPendingUpdate(candidate, sourceType, now));
  }
  const trimmedPending = pendingUpdates.slice(-GLOBAL_MEMORY_PENDING_LIMIT);
  const pendingCount = trimmedPending.length;
  const pendingChars = sumPendingChars(trimmedPending);
  const nextConfidence = Math.max(existing.confidence, candidate.confidence);
  const changed = shouldAppendPending ||
    mergedFacts.length !== existing.facts.length ||
    mergedInferences.length !== existing.inferences.length ||
    mergedIssues.length !== existing.active_issues.length ||
    mergedGoals.length !== existing.goals.length ||
    mergedQuestions.length !== existing.open_questions.length ||
    mergedSupportingTopics.length !== existing.supporting_topic_slugs.length;

  const { error: updateErr } = await supabase
    .from("user_global_memories")
    .update({
      facts: mergedFacts,
      inferences: mergedInferences,
      active_issues: mergedIssues,
      goals: mergedGoals,
      open_questions: mergedQuestions,
      supporting_topic_slugs: mergedSupportingTopics,
      pending_updates: trimmedPending,
      pending_count: pendingCount,
      pending_chars: pendingChars,
      mention_count: Math.max(1, existing.mention_count) + 1,
      enrichment_count: changed
        ? Math.max(0, existing.enrichment_count) + 1
        : existing.enrichment_count,
      confidence: nextConfidence,
      last_observed_at: now,
      updated_at: now,
    } as any)
    .eq("id", existing.id);
  if (updateErr) throw updateErr;

  const needsCompaction = pendingCount >= 5 || pendingChars >= 1200 ||
    existing.canonical_summary.length >= 1800;
  return {
    created: false,
    updated: changed,
    noop: !changed,
    needsCompaction,
  };
}

export async function retrieveGlobalMemories(params: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  maxResults?: number;
}): Promise<GlobalMemorySearchResult[]> {
  const maxResults = Math.max(
    1,
    Math.min(5, Math.floor(params.maxResults ?? 3)),
  );
  const { data, error } = await params.supabase
    .from("user_global_memories")
    .select("*")
    .eq("user_id", params.userId)
    .eq("status", "active")
    .order("last_observed_at", { ascending: false })
    .limit(80);
  if (error || !Array.isArray(data) || data.length === 0) return [];

  const messageNorm = normalizeText(params.message);
  const messageTokens = tokenize(params.message);

  const ranked = (data as any[])
    .map((row) => toGlobalMemoryRow(row))
    .map((row) => {
      const descriptor = descriptorFor(row.full_key);
      const themeAliases = descriptor
        ? [
          descriptor.theme.label,
          descriptor.theme.key,
          ...descriptor.theme.aliases,
        ]
        : [row.theme];
      const subthemeAliases = descriptor
        ? [
          descriptor.subtheme.label,
          descriptor.subtheme.key,
          ...descriptor.subtheme.aliases,
        ]
        : [row.subtheme_key];
      const themeScore = aliasPhraseScore(messageNorm, themeAliases);
      const subthemeScore = aliasPhraseScore(messageNorm, subthemeAliases);
      const supportScore = aliasPhraseScore(
        messageNorm,
        row.supporting_topic_slugs.map((slug) => slug.replace(/_/g, " ")),
      );
      const lexicalScore = jaccard(
        messageTokens,
        tokenize(buildSearchText(row)),
      );
      const recencyScore = computeRecencyScore(row.last_observed_at);
      const confidenceScore = clampConfidence(row.confidence, 0.5);
      const matchScore = 0.34 * themeScore + 0.31 * subthemeScore +
        0.17 * supportScore + 0.10 * lexicalScore + 0.05 * recencyScore +
        0.03 * confidenceScore;
      return {
        ...row,
        match_score: matchScore,
      };
    })
    .filter((row) => (row.match_score ?? 0) >= 0.12)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    .slice(0, maxResults);

  if (ranked.length > 0) {
    const now = new Date().toISOString();
    await params.supabase
      .from("user_global_memories")
      .update({ last_retrieved_at: now } as any)
      .in("id", ranked.map((row) => row.id));
  }

  return ranked;
}

export function formatGlobalMemoriesForPrompt(
  memories: GlobalMemorySearchResult[],
): string {
  if (!Array.isArray(memories) || memories.length === 0) return "";

  let block = "=== MÉMOIRE GLOBALE THÉMATIQUE ===\n";
  for (const memory of memories) {
    const descriptor = descriptorFor(memory.full_key);
    const themeLabel = descriptor?.theme.label ?? memory.theme;
    const subthemeLabel = descriptor?.subtheme.label ?? memory.subtheme_key;
    block += `\n- ${themeLabel} > ${subthemeLabel} (${memory.full_key})\n`;
    if (memory.canonical_summary) {
      block += `Résumé: ${compactText(memory.canonical_summary, 320)}\n`;
    }
    if (memory.facts.length > 0) {
      block += `Faits saillants: ${memory.facts.slice(0, 3).join(" ; ")}\n`;
    }
    if (memory.inferences.length > 0) {
      block += `Inférences fortes: ${
        memory.inferences.slice(0, 2).join(" ; ")
      }\n`;
    }
    if (memory.active_issues.length > 0) {
      block += `Chantiers actifs: ${
        memory.active_issues.slice(0, 2).join(" ; ")
      }\n`;
    }
    if (memory.goals.length > 0) {
      block += `Buts / désirs: ${memory.goals.slice(0, 2).join(" ; ")}\n`;
    }
    if (memory.open_questions.length > 0) {
      block += `Incertitudes: ${
        memory.open_questions.slice(0, 2).join(" ; ")
      }\n`;
    }
    if (memory.pending_updates.length > 0) {
      const latest = memory.pending_updates.slice(-2);
      block += `Mises à jour récentes: ${
        latest.map((row) => compactText(row.summary_delta, 140)).join(" ; ")
      }\n`;
    }
  }
  block +=
    "\n- Utilise ces sous-thèmes pour répondre aux demandes larges sur la personne.\n";
  block +=
    "- Distingue mentalement faits, inférences plausibles et zones d'incertitude.\n";
  block += "- N'expose jamais la mémoire comme un stockage interne.\n\n";
  return block;
}
