import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateEmbedding,
  generateWithGemini,
} from "../_shared/gemini.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";
import { mergeMemoryProvenanceRefs } from "./memory_provenance.ts";

export type GlobalMemorySource =
  | "chat"
  | "onboarding"
  | "bilan"
  | "module"
  | "plan";

export type TaxonomySubtheme = {
  key: string;
  label: string;
  aliases: string[];
};

export type TaxonomyTheme = {
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
  source_ref?: Record<string, unknown>;
};

type GlobalMemoryCompactionPayload = {
  canonical_summary: string;
  facts: string[];
  inferences: string[];
  active_issues: string[];
  goals: string[];
  open_questions: string[];
};

type GlobalMemoryRpcMatchRow = {
  memory_id: string;
  full_key: string;
  theme: string;
  subtheme_key: string;
  semantic_similarity: number;
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
  semantic_snapshot: string;
  embedding_updated_at?: string | null;
  needs_compaction: boolean;
  needs_embedding_refresh: boolean;
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
  lexical_score?: number;
  semantic_similarity?: number;
}

export const GLOBAL_MEMORY_EMBED_DIM = 1536;

const GLOBAL_MEMORY_SELECT_COLUMNS = [
  "id",
  "user_id",
  "theme",
  "subtheme_key",
  "full_key",
  "status",
  "canonical_summary",
  "facts",
  "inferences",
  "active_issues",
  "goals",
  "open_questions",
  "supporting_topic_slugs",
  "pending_updates",
  "mention_count",
  "enrichment_count",
  "pending_count",
  "pending_chars",
  "confidence",
  "semantic_snapshot",
  "embedding_updated_at",
  "needs_compaction",
  "needs_embedding_refresh",
  "summary_compacted_at",
  "first_observed_at",
  "last_observed_at",
  "last_retrieved_at",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const GLOBAL_MEMORY_PENDING_LIMIT = 12;
const GLOBAL_MEMORY_FACTS_LIMIT = 10;
const GLOBAL_MEMORY_INFERENCES_LIMIT = 8;
const GLOBAL_MEMORY_ISSUES_LIMIT = 8;
const GLOBAL_MEMORY_GOALS_LIMIT = 8;
const GLOBAL_MEMORY_QUESTIONS_LIMIT = 6;
const GLOBAL_MEMORY_SUPPORTING_TOPICS_LIMIT = 20;
const GLOBAL_MEMORY_SUMMARY_DELTA_MAX = 320;
const GLOBAL_MEMORY_ITEM_MAX = 180;
const GLOBAL_MEMORY_SUMMARY_MAX = 1800;
const GLOBAL_MEMORY_SNAPSHOT_MAX = 2200;
const GLOBAL_MEMORY_RETRIEVAL_SCAN_LIMIT = 80;
const GLOBAL_MEMORY_SEMANTIC_RPC_LIMIT = 8;
const GLOBAL_MEMORY_COMPACTION_PENDING_COUNT = Number(
  (Deno.env.get("SOPHIA_GLOBAL_MEMORY_PENDING_COUNT") ?? "5").trim(),
) || 5;
const GLOBAL_MEMORY_COMPACTION_PENDING_CHARS = Number(
  (Deno.env.get("SOPHIA_GLOBAL_MEMORY_PENDING_CHARS") ?? "1200").trim(),
) || 1200;
const GLOBAL_MEMORY_COMPACTION_SUMMARY_CHARS = Number(
  (Deno.env.get("SOPHIA_GLOBAL_MEMORY_SUMMARY_CHARS") ?? "1800").trim(),
) || 1800;
const GLOBAL_MEMORY_EMBED_THRESHOLD = Number(
  (Deno.env.get("SOPHIA_GLOBAL_MEMORY_MATCH_THRESHOLD") ?? "0.42").trim(),
) || 0.42;
const GLOBAL_MEMORY_COMPACTION_MODEL =
  (Deno.env.get("SOPHIA_GLOBAL_MEMORY_COMPACTION_MODEL") ??
    "gemini-3-flash-preview")
    .trim() || "gemini-3-flash-preview";

export const GLOBAL_MEMORY_TAXONOMY: TaxonomyTheme[] = [
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

export function isAllowedGlobalMemoryThemeKey(themeKey: unknown): boolean {
  const key = String(themeKey ?? "").trim().toLowerCase();
  return THEME_BY_KEY.has(key);
}

export function isAllowedGlobalMemoryFullKey(fullKey: unknown): boolean {
  const key = String(fullKey ?? "").trim().toLowerCase();
  return ALLOWED_FULL_KEYS.has(key);
}

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
      source_ref: row.source_ref && typeof row.source_ref === "object"
        ? row.source_ref as Record<string, unknown>
        : undefined,
    });
  }
  return out.slice(-GLOBAL_MEMORY_PENDING_LIMIT);
}

function descriptorFor(
  fullKey: string,
): { theme: TaxonomyTheme; subtheme: TaxonomySubtheme } | null {
  return SUBTHEME_BY_FULL_KEY.get(fullKey) ?? null;
}

function toGlobalMemoryRow(row: any): GlobalMemory {
  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? ""),
    theme: String(row?.theme ?? ""),
    subtheme_key: String(row?.subtheme_key ?? ""),
    full_key: String(row?.full_key ?? ""),
    status: String(row?.status ?? "active"),
    canonical_summary: compactText(
      row?.canonical_summary,
      GLOBAL_MEMORY_SUMMARY_MAX,
    ),
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
    semantic_snapshot: compactText(
      row?.semantic_snapshot,
      GLOBAL_MEMORY_SNAPSHOT_MAX,
    ),
    embedding_updated_at: row?.embedding_updated_at
      ? String(row.embedding_updated_at)
      : null,
    needs_compaction: Boolean(row?.needs_compaction),
    needs_embedding_refresh: row?.needs_embedding_refresh === false
      ? false
      : true,
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
  sourceMetadata?: Record<string, unknown>,
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
    source_ref: sourceMetadata ?? undefined,
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

function composeCanonicalSummary(opts: {
  currentSummary?: string;
  summaryDelta?: string;
  facts?: string[];
  activeIssues?: string[];
  goals?: string[];
  pendingUpdates?: PendingGlobalMemoryUpdate[];
}): string {
  const parts = [
    compactText(opts.currentSummary, 360),
    compactText(opts.summaryDelta, 280),
    ...(opts.pendingUpdates ?? []).slice(-3).map((row) =>
      compactText(row.summary_delta, 220)
    ),
    ...(opts.facts ?? []).slice(0, 2).map((item) => compactText(item, 160)),
    ...(opts.activeIssues ?? []).slice(0, 1).map((item) =>
      compactText(item, 160)
    ),
    ...(opts.goals ?? []).slice(0, 1).map((item) => compactText(item, 160)),
  ].filter(Boolean);
  return uniqueStrings(parts, 4, 280).join(" ");
}

function toSentenceList(items: string[]): string {
  return items.map((item) => compactText(item, 180)).join(" | ");
}

export function buildGlobalMemorySemanticSnapshot(
  memory: Pick<
    GlobalMemory,
    | "full_key"
    | "canonical_summary"
    | "facts"
    | "inferences"
    | "active_issues"
    | "goals"
    | "open_questions"
    | "supporting_topic_slugs"
    | "pending_updates"
  >,
): string {
  const descriptor = descriptorFor(memory.full_key);
  const themeLabel = descriptor?.theme.label ?? memory.full_key.split(".")[0] ??
    memory.full_key;
  const subthemeLabel = descriptor?.subtheme.label ??
    memory.full_key.split(".")[1] ?? memory.full_key;
  const sections = [
    `Sous-thème global: ${themeLabel} > ${subthemeLabel}`,
    memory.canonical_summary
      ? `Résumé consolidé: ${
        compactText(memory.canonical_summary, 600)
      }`
      : "",
    memory.facts.length > 0
      ? `Faits importants: ${toSentenceList(memory.facts.slice(0, 6))}`
      : "",
    memory.inferences.length > 0
      ? `Inférences plausibles: ${
        toSentenceList(memory.inferences.slice(0, 5))
      }`
      : "",
    memory.active_issues.length > 0
      ? `Chantiers actifs: ${
        toSentenceList(memory.active_issues.slice(0, 5))
      }`
      : "",
    memory.goals.length > 0
      ? `Buts ou désirs: ${toSentenceList(memory.goals.slice(0, 4))}`
      : "",
    memory.open_questions.length > 0
      ? `Zones d'incertitude: ${
        toSentenceList(memory.open_questions.slice(0, 4))
      }`
      : "",
    memory.pending_updates.length > 0
      ? `Éléments récents: ${
        memory.pending_updates.slice(-4).map((row) =>
          compactText(row.summary_delta, 170)
        ).join(" | ")
      }`
      : "",
    memory.supporting_topic_slugs.length > 0
      ? `Topics liés: ${
        memory.supporting_topic_slugs.slice(0, 8).map((slug) =>
          slug.replace(/_/g, " ")
        ).join(", ")
      }`
      : "",
  ].filter(Boolean);
  return compactText(sections.join("\n"), GLOBAL_MEMORY_SNAPSHOT_MAX);
}

export function shouldCompactGlobalMemory(
  memory: Pick<GlobalMemory, "pending_count" | "pending_chars" | "canonical_summary" | "needs_compaction">,
): boolean {
  return Boolean(
    memory.needs_compaction ||
      memory.pending_count >= GLOBAL_MEMORY_COMPACTION_PENDING_COUNT ||
      memory.pending_chars >= GLOBAL_MEMORY_COMPACTION_PENDING_CHARS ||
      memory.canonical_summary.length >= GLOBAL_MEMORY_COMPACTION_SUMMARY_CHARS,
  );
}

function buildSearchText(memory: GlobalMemory): string {
  return [
    memory.full_key,
    memory.semantic_snapshot,
    memory.supporting_topic_slugs.join(" "),
    memory.facts.slice(0, 4).join(" "),
    memory.goals.slice(0, 3).join(" "),
    memory.active_issues.slice(0, 3).join(" "),
  ].join(" ");
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const candidates = [
    text,
    text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim(),
  ];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function compactDeterministically(
  memory: GlobalMemory,
): GlobalMemoryCompactionPayload {
  const pendingFacts = memory.pending_updates.flatMap((row) => row.facts);
  const pendingInferences = memory.pending_updates.flatMap((row) =>
    row.inferences
  );
  const pendingIssues = memory.pending_updates.flatMap((row) =>
    row.active_issues
  );
  const pendingGoals = memory.pending_updates.flatMap((row) => row.goals);
  const pendingQuestions = memory.pending_updates.flatMap((row) =>
    row.open_questions
  );
  const facts = mergeLists(
    memory.facts,
    pendingFacts,
    GLOBAL_MEMORY_FACTS_LIMIT,
  );
  const inferences = mergeLists(
    memory.inferences,
    pendingInferences,
    GLOBAL_MEMORY_INFERENCES_LIMIT,
  );
  const activeIssues = mergeLists(
    memory.active_issues,
    pendingIssues,
    GLOBAL_MEMORY_ISSUES_LIMIT,
  );
  const goals = mergeLists(
    memory.goals,
    pendingGoals,
    GLOBAL_MEMORY_GOALS_LIMIT,
  );
  const openQuestions = mergeLists(
    memory.open_questions,
    pendingQuestions,
    GLOBAL_MEMORY_QUESTIONS_LIMIT,
  );
  const canonicalSummary = compactText(
    composeCanonicalSummary({
      currentSummary: memory.canonical_summary,
      facts,
      activeIssues,
      goals,
      pendingUpdates: memory.pending_updates,
    }),
    GLOBAL_MEMORY_SUMMARY_MAX,
  );
  return {
    canonical_summary: canonicalSummary,
    facts,
    inferences,
    active_issues: activeIssues,
    goals,
    open_questions: openQuestions,
  };
}

async function compactWithModel(params: {
  memory: GlobalMemory;
  meta?: { requestId?: string | null };
}): Promise<GlobalMemoryCompactionPayload> {
  const { memory } = params;
  const descriptor = descriptorFor(memory.full_key);
  const themeLabel = descriptor?.theme.label ?? memory.theme;
  const subthemeLabel = descriptor?.subtheme.label ?? memory.subtheme_key;
  const pendingBlock = memory.pending_updates.length > 0
    ? memory.pending_updates.map((row, index) =>
      `${index + 1}. ${row.summary_delta}\n` +
      `facts=${row.facts.join(" | ")}\n` +
      `inferences=${row.inferences.join(" | ")}\n` +
      `active_issues=${row.active_issues.join(" | ")}\n` +
      `goals=${row.goals.join(" | ")}\n` +
      `open_questions=${row.open_questions.join(" | ")}`
    ).join("\n\n")
    : "(aucune)";

  const systemPrompt = `
Tu compactes une mémoire globale utilisateur pour un sous-thème durable.

Règles :
- Tu n'inventes rien.
- Si une information est incertaine, tu la mets dans open_questions ou éventuellement inferences, jamais dans facts.
- Tu gardes uniquement ce qui est durable, réutilisable et utile dans 2+ mois.
- Tu élimines les doublons et la redondance.
- canonical_summary doit être compacte, concrète, en 2 à 5 phrases max.
- facts = faits explicites et récurrents.
- inferences = inférences fortes mais prudentes.
- active_issues = problèmes/chantiers actifs.
- goals = désirs, intentions, directions.
- open_questions = zones d'incertitude importantes.
- Réponds en JSON strict uniquement.

JSON attendu :
{
  "canonical_summary": "string",
  "facts": ["string"],
  "inferences": ["string"],
  "active_issues": ["string"],
  "goals": ["string"],
  "open_questions": ["string"]
}
`.trim();

  const userPrompt = `
Sous-thème : ${themeLabel} > ${subthemeLabel} (${memory.full_key})

Résumé canonique actuel :
${memory.canonical_summary || "(vide)"}

Facts actuels :
${memory.facts.join(" | ") || "(aucun)"}

Inferences actuelles :
${memory.inferences.join(" | ") || "(aucune)"}

Active issues actuelles :
${memory.active_issues.join(" | ") || "(aucune)"}

Goals actuels :
${memory.goals.join(" | ") || "(aucun)"}

Open questions actuelles :
${memory.open_questions.join(" | ") || "(aucune)"}

Pending updates à intégrer :
${pendingBlock}
`.trim();

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.15,
      true,
      [],
      "auto",
      {
        requestId: params.meta?.requestId ?? undefined,
        source: "sophia-brain:global_memory_compaction",
        model: GLOBAL_MEMORY_COMPACTION_MODEL,
      },
    );
    const parsed = typeof raw === "string" ? extractJsonObject(raw) : null;
    if (!parsed) {
      return compactDeterministically(memory);
    }
    const payload: GlobalMemoryCompactionPayload = {
      canonical_summary: compactText(
        parsed.canonical_summary ?? memory.canonical_summary,
        GLOBAL_MEMORY_SUMMARY_MAX,
      ),
      facts: readStringArray(parsed.facts, GLOBAL_MEMORY_FACTS_LIMIT),
      inferences: readStringArray(
        parsed.inferences,
        GLOBAL_MEMORY_INFERENCES_LIMIT,
      ),
      active_issues: readStringArray(
        parsed.active_issues,
        GLOBAL_MEMORY_ISSUES_LIMIT,
      ),
      goals: readStringArray(parsed.goals, GLOBAL_MEMORY_GOALS_LIMIT),
      open_questions: readStringArray(
        parsed.open_questions,
        GLOBAL_MEMORY_QUESTIONS_LIMIT,
      ),
    };
    if (
      !payload.canonical_summary && payload.facts.length === 0 &&
      payload.inferences.length === 0 && payload.active_issues.length === 0 &&
      payload.goals.length === 0 && payload.open_questions.length === 0
    ) {
      return compactDeterministically(memory);
    }
    payload.canonical_summary = payload.canonical_summary ||
      compactText(
        composeCanonicalSummary({
          currentSummary: memory.canonical_summary,
          facts: payload.facts,
          activeIssues: payload.active_issues,
          goals: payload.goals,
        }),
        GLOBAL_MEMORY_SUMMARY_MAX,
      );
    return payload;
  } catch (error) {
    console.warn("[GlobalMemory] compaction fallback", {
      full_key: memory.full_key,
      error: error instanceof Error ? error.message : String(error),
    });
    return compactDeterministically(memory);
  }
}

async function updateGlobalMemoryRow(params: {
  supabase: SupabaseClient;
  memoryId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await params.supabase
    .from("user_global_memories")
    .update(params.payload as any)
    .eq("id", params.memoryId);
  if (error) throw error;
}

async function loadGlobalMemory(params: {
  supabase: SupabaseClient;
  memoryId?: string;
  userId?: string;
  fullKey?: string;
}): Promise<GlobalMemory | null> {
  let query = params.supabase
    .from("user_global_memories")
    .select(GLOBAL_MEMORY_SELECT_COLUMNS)
    .eq("status", "active");
  if (params.memoryId) query = query.eq("id", params.memoryId);
  else {
    query = query.eq("user_id", params.userId ?? "").eq(
      "full_key",
      params.fullKey ?? "",
    );
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return toGlobalMemoryRow(data);
}

function shouldUseSemanticRetrieval(params: {
  lexicalTop: number;
  message: string;
}): boolean {
  const messageTokens = tokenize(params.message);
  if (messageTokens.size >= 5) return true;
  return params.lexicalTop < 0.72;
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
  sourceMetadata?: Record<string, unknown>;
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
  const sourceMetadata = opts.sourceMetadata;
  const now = new Date().toISOString();

  const { data: existingRow, error: existingErr } = await supabase
    .from("user_global_memories")
    .select(GLOBAL_MEMORY_SELECT_COLUMNS)
    .eq("user_id", userId)
    .eq("full_key", candidate.full_key)
    .eq("status", "active")
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (!existingRow) {
    const initialSummary = compactText(
      composeCanonicalSummary({
        summaryDelta: candidate.summary_delta,
        facts: candidate.facts,
        activeIssues: candidate.active_issues,
        goals: candidate.goals,
      }),
      GLOBAL_MEMORY_SUMMARY_MAX,
    );
    const draftMemory = toGlobalMemoryRow({
      id: "draft",
      user_id: userId,
      theme: candidate.theme,
      subtheme_key: candidate.subtheme_key,
      full_key: candidate.full_key,
      status: "active",
      canonical_summary: initialSummary,
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
      semantic_snapshot: "",
      needs_compaction: false,
      needs_embedding_refresh: true,
      summary_compacted_at: now,
      first_observed_at: now,
      last_observed_at: now,
      metadata: { source_type: sourceType },
      created_at: now,
      updated_at: now,
    });
    const semanticSnapshot = buildGlobalMemorySemanticSnapshot(draftMemory);
    const { error: insertErr } = await supabase
      .from("user_global_memories")
      .insert({
        user_id: userId,
        theme: candidate.theme,
        subtheme_key: candidate.subtheme_key,
        full_key: candidate.full_key,
        status: "active",
        canonical_summary: initialSummary,
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
        semantic_snapshot: semanticSnapshot,
        needs_compaction: false,
        needs_embedding_refresh: true,
        summary_compacted_at: now,
        first_observed_at: now,
        last_observed_at: now,
        metadata: {
          source_type: sourceType,
          source_refs: mergeMemoryProvenanceRefs([], sourceMetadata),
          latest_source_ref: sourceMetadata ?? null,
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
    pendingUpdates.push(
      buildPendingUpdate(candidate, sourceType, now, sourceMetadata),
    );
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
  const nextNeedsCompaction = shouldCompactGlobalMemory({
    pending_count: pendingCount,
    pending_chars: pendingChars,
    canonical_summary: existing.canonical_summary,
    needs_compaction: false,
  });
  const draftMemory: GlobalMemory = {
    ...existing,
    facts: mergedFacts,
    inferences: mergedInferences,
    active_issues: mergedIssues,
    goals: mergedGoals,
    open_questions: mergedQuestions,
    supporting_topic_slugs: mergedSupportingTopics,
    pending_updates: trimmedPending,
    pending_count: pendingCount,
    pending_chars: pendingChars,
    confidence: nextConfidence,
    needs_compaction: nextNeedsCompaction,
    needs_embedding_refresh: changed || existing.needs_embedding_refresh,
    last_observed_at: now,
  };
  const semanticSnapshot = buildGlobalMemorySemanticSnapshot(draftMemory);

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
      semantic_snapshot: semanticSnapshot,
      needs_compaction: nextNeedsCompaction,
      needs_embedding_refresh: changed || existing.needs_embedding_refresh,
      metadata: {
        ...(existing.metadata && typeof existing.metadata === "object"
          ? existing.metadata
          : {}),
        source_refs: mergeMemoryProvenanceRefs(
          (existing.metadata as any)?.source_refs,
          sourceMetadata,
        ),
        latest_source_ref: sourceMetadata ??
          (existing.metadata as any)?.latest_source_ref ?? null,
      },
      last_observed_at: now,
      updated_at: now,
    } as any)
    .eq("id", existing.id);
  if (updateErr) throw updateErr;

  return {
    created: false,
    updated: changed,
    noop: !changed,
    needsCompaction: nextNeedsCompaction,
  };
}

export async function runGlobalMemoryMaintenance(params: {
  supabase: SupabaseClient;
  memoryId?: string;
  userId?: string;
  fullKey?: string;
  meta?: { requestId?: string | null };
}): Promise<{
  updated: boolean;
  compacted: boolean;
  embedded: boolean;
  reason: string;
}> {
  const emitMaintenanceEvent = async (
    memory: GlobalMemory | null,
    outcome: { updated: boolean; compacted: boolean; embedded: boolean; reason: string },
  ): Promise<void> => {
    if (!memory) return;
    await logMemoryObservabilityEvent({
      supabase: params.supabase,
      userId: memory.user_id,
      requestId: params.meta?.requestId ?? null,
      sourceComponent: "global_memory",
      eventName: "global_memory.maintenance_completed",
      payload: {
        full_key: memory.full_key,
        theme: memory.theme,
        subtheme_key: memory.subtheme_key,
        needs_compaction: memory.needs_compaction,
        needs_embedding_refresh: memory.needs_embedding_refresh,
        pending_count: memory.pending_count,
        pending_chars: memory.pending_chars,
        outcome,
      },
    });
  };

  let memory = await loadGlobalMemory({
    supabase: params.supabase,
    memoryId: params.memoryId,
    userId: params.userId,
    fullKey: params.fullKey,
  });
  if (!memory) {
    return {
      updated: false,
      compacted: false,
      embedded: false,
      reason: "not_found",
    };
  }

  let updated = false;
  let compacted = false;
  const now = new Date().toISOString();

  if (shouldCompactGlobalMemory(memory)) {
    const compactedPayload = await compactWithModel({
      memory,
      meta: params.meta,
    });
    const compactedMemory: GlobalMemory = {
      ...memory,
      canonical_summary: compactText(
        compactedPayload.canonical_summary,
        GLOBAL_MEMORY_SUMMARY_MAX,
      ),
      facts: compactedPayload.facts,
      inferences: compactedPayload.inferences,
      active_issues: compactedPayload.active_issues,
      goals: compactedPayload.goals,
      open_questions: compactedPayload.open_questions,
      pending_updates: [],
      pending_count: 0,
      pending_chars: 0,
      needs_compaction: false,
      needs_embedding_refresh: true,
      summary_compacted_at: now,
      updated_at: now,
    };
    const semanticSnapshot = buildGlobalMemorySemanticSnapshot(compactedMemory);
    await updateGlobalMemoryRow({
      supabase: params.supabase,
      memoryId: memory.id,
      payload: {
        canonical_summary: compactedMemory.canonical_summary,
        facts: compactedMemory.facts,
        inferences: compactedMemory.inferences,
        active_issues: compactedMemory.active_issues,
        goals: compactedMemory.goals,
        open_questions: compactedMemory.open_questions,
        pending_updates: [],
        pending_count: 0,
        pending_chars: 0,
        semantic_snapshot: semanticSnapshot,
        needs_compaction: false,
        needs_embedding_refresh: true,
        summary_compacted_at: now,
        updated_at: now,
      },
    });
    memory = {
      ...compactedMemory,
      semantic_snapshot: semanticSnapshot,
    };
    updated = true;
    compacted = true;
  }

  const semanticSnapshot = buildGlobalMemorySemanticSnapshot(memory);
  if (semanticSnapshot !== memory.semantic_snapshot) {
    await updateGlobalMemoryRow({
      supabase: params.supabase,
      memoryId: memory.id,
      payload: {
        semantic_snapshot: semanticSnapshot,
        needs_embedding_refresh: true,
        updated_at: now,
      },
    });
    memory = {
      ...memory,
      semantic_snapshot: semanticSnapshot,
      needs_embedding_refresh: true,
      updated_at: now,
    };
    updated = true;
  }

  if (!memory.semantic_snapshot) {
    const outcome = {
      updated,
      compacted,
      embedded: false,
      reason: updated ? "snapshot_only" : "empty_snapshot",
    };
    await emitMaintenanceEvent(memory, outcome);
    return outcome;
  }

  if (memory.needs_embedding_refresh || !memory.embedding_updated_at) {
    try {
      const embedding = await generateEmbedding(memory.semantic_snapshot, {
        requestId: params.meta?.requestId ?? undefined,
        source: "sophia-brain:global_memory_embedding",
        operationName: "embedding.global_memory_snapshot",
        userId: memory.user_id,
        outputDimensionality: GLOBAL_MEMORY_EMBED_DIM,
      });
      await updateGlobalMemoryRow({
        supabase: params.supabase,
        memoryId: memory.id,
        payload: {
          semantic_embedding: embedding,
          embedding_updated_at: now,
          needs_embedding_refresh: false,
          updated_at: now,
        },
      });
      const outcome = {
        updated: true,
        compacted,
        embedded: true,
        reason: compacted ? "compacted_and_embedded" : "embedded",
      };
      await emitMaintenanceEvent(memory, outcome);
      return outcome;
    } catch (error) {
      console.warn("[GlobalMemory] embedding refresh failed", {
        full_key: memory.full_key,
        error: error instanceof Error ? error.message : String(error),
      });
      const outcome = {
        updated,
        compacted,
        embedded: false,
        reason: `embedding_failed:${
          error instanceof Error ? error.message : String(error)
        }`,
      };
      await emitMaintenanceEvent(memory, outcome);
      return outcome;
    }
  }

  const outcome = {
    updated,
    compacted,
    embedded: false,
    reason: updated ? "snapshot_refreshed" : "noop",
  };
  await emitMaintenanceEvent(memory, outcome);
  return outcome;
}

export async function retrieveGlobalMemories(params: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  maxResults?: number;
  requestId?: string;
}): Promise<GlobalMemorySearchResult[]> {
  const maxResults = Math.max(
    1,
    Math.min(5, Math.floor(params.maxResults ?? 3)),
  );
  const { data, error } = await params.supabase
    .from("user_global_memories")
    .select(GLOBAL_MEMORY_SELECT_COLUMNS)
    .eq("user_id", params.userId)
    .eq("status", "active")
    .order("last_observed_at", { ascending: false })
    .limit(GLOBAL_MEMORY_RETRIEVAL_SCAN_LIMIT);
  if (error || !Array.isArray(data) || data.length === 0) return [];

  const rows = (data as any[]).map((row) => toGlobalMemoryRow(row));
  const messageNorm = normalizeText(params.message);
  const messageTokens = tokenize(params.message);
  const lexicalRanked = rows
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
        lexical_score: matchScore,
        match_score: matchScore,
      };
    })
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));

  const lexicalTop = lexicalRanked[0]?.lexical_score ?? 0;
  const semanticById = new Map<string, number>();

  if (shouldUseSemanticRetrieval({ lexicalTop, message: params.message })) {
    try {
      const queryEmbedding = await generateEmbedding(params.message, {
        requestId: params.requestId,
        source: "sophia-brain:global_memory_query_embedding",
        operationName: "embedding.global_memory_query",
        userId: params.userId,
        outputDimensionality: GLOBAL_MEMORY_EMBED_DIM,
      });
      const { data: semanticRows, error: semanticErr } = await params.supabase
        .rpc("match_global_memories", {
          target_user_id: params.userId,
          query_embedding: queryEmbedding,
          match_threshold: GLOBAL_MEMORY_EMBED_THRESHOLD,
          match_count: Math.max(
            GLOBAL_MEMORY_SEMANTIC_RPC_LIMIT,
            maxResults * 3,
          ),
        } as any);
      if (!semanticErr && Array.isArray(semanticRows)) {
        for (const raw of semanticRows as GlobalMemoryRpcMatchRow[]) {
          const id = String(raw.memory_id ?? "").trim();
          if (!id) continue;
          semanticById.set(
            id,
            Math.max(
              semanticById.get(id) ?? 0,
              clampConfidence(raw.semantic_similarity, 0),
            ),
          );
        }
      }
    } catch {
      // Non-blocking: lexical retrieval remains available.
    }
  }

  const ranked = lexicalRanked
    .map((row) => {
      const semanticSimilarity = semanticById.get(row.id) ?? 0;
      const recencyScore = computeRecencyScore(row.last_observed_at);
      const confidenceScore = clampConfidence(row.confidence, 0.5);
      const lexicalScore = row.lexical_score ?? 0;
      const matchScore = semanticSimilarity > 0
        ? 0.45 * semanticSimilarity + 0.35 * lexicalScore +
          0.12 * recencyScore + 0.08 * confidenceScore
        : 0.82 * lexicalScore + 0.10 * recencyScore + 0.08 * confidenceScore;
      return {
        ...row,
        semantic_similarity: semanticSimilarity > 0
          ? semanticSimilarity
          : undefined,
        match_score: matchScore,
      };
    })
    .filter((row) =>
      (row.match_score ?? 0) >= (row.semantic_similarity ? 0.22 : 0.12)
    )
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

function sortExplicitGlobalMemories(
  memories: GlobalMemory[],
): GlobalMemorySearchResult[] {
  return [...memories]
    .map((memory) => ({
      ...memory,
      match_score: 0.9 * clampConfidence(memory.confidence, 0.5) +
        0.1 * computeRecencyScore(memory.last_observed_at),
    }))
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
}

async function touchRetrievedGlobalMemories(params: {
  supabase: SupabaseClient;
  memoryIds: string[];
}): Promise<void> {
  const ids = params.memoryIds.filter(Boolean);
  if (ids.length === 0) return;
  await params.supabase
    .from("user_global_memories")
    .update({ last_retrieved_at: new Date().toISOString() } as any)
    .in("id", ids);
}

export async function retrieveGlobalMemoriesByFullKeys(params: {
  supabase: SupabaseClient;
  userId: string;
  fullKeys: string[];
}): Promise<GlobalMemorySearchResult[]> {
  const normalized = [...new Set(
    params.fullKeys.map((key) => String(key ?? "").trim().toLowerCase())
      .filter((key) => isAllowedGlobalMemoryFullKey(key)),
  )];
  if (normalized.length === 0) return [];

  const { data, error } = await params.supabase
    .from("user_global_memories")
    .select(GLOBAL_MEMORY_SELECT_COLUMNS)
    .eq("user_id", params.userId)
    .eq("status", "active")
    .in("full_key", normalized);
  if (error || !Array.isArray(data) || data.length === 0) return [];

  const ranked = sortExplicitGlobalMemories(
    (data as any[]).map((row) => toGlobalMemoryRow(row)),
  );
  await touchRetrievedGlobalMemories({
    supabase: params.supabase,
    memoryIds: ranked.map((row) => row.id),
  });
  return ranked;
}

export async function retrieveGlobalMemoriesByThemes(params: {
  supabase: SupabaseClient;
  userId: string;
  themes: string[];
  maxResults?: number;
}): Promise<GlobalMemorySearchResult[]> {
  const normalized = [...new Set(
    params.themes.map((key) => String(key ?? "").trim().toLowerCase())
      .filter((key) => isAllowedGlobalMemoryThemeKey(key)),
  )];
  if (normalized.length === 0) return [];

  const maxResults = Math.max(
    normalized.length,
    Math.min(12, Math.floor(params.maxResults ?? Math.max(4, normalized.length * 3))),
  );

  const { data, error } = await params.supabase
    .from("user_global_memories")
    .select(GLOBAL_MEMORY_SELECT_COLUMNS)
    .eq("user_id", params.userId)
    .eq("status", "active")
    .in("theme", normalized);
  if (error || !Array.isArray(data) || data.length === 0) return [];

  const ranked = sortExplicitGlobalMemories(
    (data as any[]).map((row) => toGlobalMemoryRow(row)),
  ).slice(0, maxResults);
  await touchRetrievedGlobalMemories({
    supabase: params.supabase,
    memoryIds: ranked.map((row) => row.id),
  });
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
