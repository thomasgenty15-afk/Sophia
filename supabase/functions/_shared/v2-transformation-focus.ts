import type { UserTransformationRow } from "./v2-types.ts";

function cleanLine(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function buildTransformationFocusMaterial(args: {
  transformation: Pick<
    UserTransformationRow,
    "title" | "internal_summary" | "user_summary" | "success_definition" | "main_constraint"
  >;
}): string {
  const parts = [
    cleanLine(args.transformation.internal_summary),
    cleanLine(args.transformation.user_summary),
    cleanLine(args.transformation.success_definition)
      ? `Réussite visée pour cette transformation: ${cleanLine(args.transformation.success_definition)}`
      : null,
    cleanLine(args.transformation.main_constraint)
      ? `Contrainte à respecter sur cette transformation: ${cleanLine(args.transformation.main_constraint)}`
      : null,
  ].filter((item): item is string => Boolean(item));

  if (parts.length > 0) {
    return parts.join("\n");
  }

  return cleanLine(args.transformation.title) ?? "Transformation active en cours.";
}
