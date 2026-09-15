export interface ActionFamilySource {
  id?: string | null;
  title?: string | null;
  kind?: string | null;
  dimension?: string | null;
  start_after_item_id?: string | null;
  payload?: Record<string, unknown> | null;
}

const TITLE_STOPWORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "de",
  "des",
  "du",
  "en",
  "et",
  "faire",
  "fois",
  "la",
  "le",
  "les",
  "ma",
  "mes",
  "min",
  "mins",
  "minute",
  "minutes",
  "mon",
  "par",
  "pour",
  "rep",
  "reps",
  "semaine",
  "un",
  "une",
]);

export function normalizeActionText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstPayloadString(
  payload: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!payload || typeof payload !== "object") return "";
  for (const key of keys) {
    const value = String(payload[key] ?? "").trim();
    if (value) return value;
  }
  const bridge = payload.operation_bridge &&
      typeof payload.operation_bridge === "object"
    ? payload.operation_bridge as Record<string, unknown>
    : null;
  if (bridge) {
    for (const key of keys) {
      const value = String(bridge[key] ?? "").trim();
      if (value) return value;
    }
  }
  return "";
}

export function actionTitleStem(title: unknown): string {
  const tokens = normalizeActionText(title).split(/\s+/)
    .filter((token) => token && !/^\d+$/.test(token))
    .filter((token) => !TITLE_STOPWORDS.has(token));
  return tokens.join("_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function buildActionFamilyKey(source: ActionFamilySource): string {
  const payload = source.payload ?? null;
  const explicit = firstPayloadString(payload, [
    "action_family_key",
    "habit_family_key",
    "canonical_action_key",
    "canonical_habit_key",
    "root_plan_item_id",
    "source_plan_item_id",
  ]);
  const kind = String(source.kind ?? "").trim().toLowerCase() || "action";
  if (explicit) {
    const normalizedExplicit = normalizeActionText(explicit).replace(/\s+/g, "_");
    if (/^[a-z]+_/.test(normalizedExplicit)) {
      const [prefix, ...rest] = normalizedExplicit.split("_");
      if (rest.length > 0 && ["action", "habit", "task", "exercise", "milestone"].includes(prefix)) {
        return `${prefix}:${rest.join("_")}`;
      }
    }
    if (/^[a-z]+:/.test(String(explicit).trim())) {
      return String(explicit).trim().toLowerCase().replace(/\s+/g, "_");
    }
    return `${kind}:${normalizedExplicit}`;
  }

  const bridgeSource = firstPayloadString(payload, ["source_plan_item_id"]);
  if (bridgeSource) {
    return `${kind}:source_${normalizeActionText(bridgeSource).replace(/\s+/g, "_")}`;
  }

  const stem = actionTitleStem(source.title);
  if (stem) return `${kind}:${stem}`;
  const id = String(source.start_after_item_id ?? source.id ?? "").trim();
  return `${kind}:${id || "unknown"}`;
}

export function actionFamilyAliases(source: ActionFamilySource): string[] {
  return [
    String(source.title ?? "").trim(),
    actionTitleStem(source.title).replace(/_/g, " "),
    buildActionFamilyKey(source).split(":").slice(1).join(" ").replace(/_/g, " "),
  ].filter(Boolean);
}
