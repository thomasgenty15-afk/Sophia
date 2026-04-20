import type { UserTransformationRow } from "../types/v2";

export function isVisibleTransformationStatus(status: UserTransformationRow["status"]) {
  return status !== "abandoned" && status !== "cancelled" && status !== "archived";
}

export function isNavigableDashboardScopeStatus(status: UserTransformationRow["status"]) {
  return status === "active";
}

function extractOnboardingV2Payload(
  handoffPayload: UserTransformationRow["handoff_payload"],
): Record<string, unknown> {
  const onboardingV2 = (
    handoffPayload as { onboarding_v2?: unknown } | null | undefined
  )?.onboarding_v2;
  return onboardingV2 && typeof onboardingV2 === "object" && !Array.isArray(onboardingV2)
    ? onboardingV2 as Record<string, unknown>
    : {};
}

function extractMultiPartJourneyPayload(
  transformation: UserTransformationRow | null,
): Record<string, unknown> | null {
  if (!transformation) return null;
  const raw = extractOnboardingV2Payload(transformation.handoff_payload).multi_part_journey;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function extractJourneyMode(transformation: UserTransformationRow | null): string | null {
  if (!transformation) return null;
  const classification = extractOnboardingV2Payload(transformation.handoff_payload)
    .plan_type_classification;
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
    return null;
  }

  const journeyStrategy = (classification as { journey_strategy?: unknown }).journey_strategy;
  if (!journeyStrategy || typeof journeyStrategy !== "object" || Array.isArray(journeyStrategy)) {
    return null;
  }

  return typeof (journeyStrategy as { mode?: unknown }).mode === "string"
    ? String((journeyStrategy as { mode?: unknown }).mode)
    : null;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function isSequencedNextStatus(status: UserTransformationRow["status"]) {
  return status === "draft" || status === "ready" || status === "pending";
}

function resolveSequencedNextTransformation(
  transformation: UserTransformationRow | null,
  visibleTransformations: UserTransformationRow[],
): UserTransformationRow | null {
  if (!transformation) return null;

  const journey = extractMultiPartJourneyPayload(transformation);
  const journeyMode = extractJourneyMode(transformation);
  const isMultiPart =
    journey?.is_multi_part === true ||
    journey?.is_multi_part === "true" ||
    journeyMode === "two_transformations";
  const partNumber = parsePositiveInteger(journey?.part_number) ?? (isMultiPart ? 1 : null);
  if (!isMultiPart || partNumber !== 1) return null;

  const explicitNextId =
    typeof journey?.next_transformation_id === "string"
      ? journey.next_transformation_id.trim()
      : "";
  if (explicitNextId) {
    const explicitNext = visibleTransformations.find((row) =>
      row.id === explicitNextId && row.id !== transformation.id && isSequencedNextStatus(row.status)
    );
    if (explicitNext) return explicitNext;
  }

  return visibleTransformations.find((row) =>
    row.id !== transformation.id &&
    row.priority_order === transformation.priority_order + 1 &&
    isSequencedNextStatus(row.status)
  ) ?? null;
}

type ResolveDashboardTransformationsParams = {
  transformations: UserTransformationRow[];
  cycleActiveTransformationId: string | null;
  selectedTransformationId: string | null;
};

export function resolveDashboardTransformations({
  transformations,
  cycleActiveTransformationId,
  selectedTransformationId,
}: ResolveDashboardTransformationsParams) {
  const visibleTransformations = transformations.filter((row) =>
    isVisibleTransformationStatus(row.status),
  );
  const navigableScopeTransformations = visibleTransformations.filter((row) =>
    isNavigableDashboardScopeStatus(row.status),
  );

  const activeTransformation =
    (cycleActiveTransformationId
      ? navigableScopeTransformations.find((row) => row.id === cycleActiveTransformationId)
      : null) ??
    navigableScopeTransformations[0] ??
    null;

  const transformation =
    (selectedTransformationId
      ? navigableScopeTransformations.find((row) => row.id === selectedTransformationId)
      : null) ??
    activeTransformation;

  const nextTransformation =
    resolveSequencedNextTransformation(transformation, visibleTransformations) ??
    visibleTransformations.find((row) =>
      (row.status === "ready" || row.status === "pending") &&
      row.id !== transformation?.id
    ) ?? null;

  return {
    visibleTransformations,
    navigableScopeTransformations,
    activeTransformation,
    transformation,
    nextTransformation,
  };
}
