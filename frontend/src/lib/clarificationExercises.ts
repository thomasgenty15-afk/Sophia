import type {
  ClarificationExerciseDetails,
  ClarificationExerciseSection,
  ClarificationSectionInputType,
  PlanContentItem,
} from "../types/v2";

const VALID_INPUT_TYPES: Set<ClarificationSectionInputType> = new Set([
  "text",
  "textarea",
  "scale",
  "list",
  "categorized_list",
]);

export function getClarificationExerciseDetails(
  payload: PlanContentItem["payload"] | Record<string, unknown> | null | undefined,
): ClarificationExerciseDetails | null {
  if (!isRecord(payload) || !isRecord(payload.clarification_details)) return null;

  const details = payload.clarification_details;
  const type = details.type;
  const intro = typeof details.intro === "string" ? details.intro.trim() : "";
  const sections = Array.isArray(details.sections)
    ? details.sections.map(parseSection).filter((value): value is ClarificationExerciseSection => Boolean(value))
    : [];

  if ((type !== "one_shot" && type !== "recurring") || !intro || sections.length === 0) {
    return null;
  }

  return {
    type,
    intro,
    save_label: typeof details.save_label === "string" && details.save_label.trim()
      ? details.save_label.trim()
      : null,
    sections,
  };
}

function parseSection(value: unknown): ClarificationExerciseSection | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const inputType = normalizeInputType(value.input_type);
  if (!id || !label || !inputType) return null;

  return {
    id,
    label,
    input_type: inputType,
    placeholder: typeof value.placeholder === "string" && value.placeholder.trim()
      ? value.placeholder.trim()
      : null,
    helper_text: typeof value.helper_text === "string" && value.helper_text.trim()
      ? value.helper_text.trim()
      : null,
  };
}

function normalizeInputType(value: unknown): ClarificationSectionInputType | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_INPUT_TYPES.has(candidate as ClarificationSectionInputType)
    ? candidate as ClarificationSectionInputType
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
