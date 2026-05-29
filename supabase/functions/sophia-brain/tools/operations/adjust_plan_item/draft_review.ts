import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import {
  isPendingAdjustPlanDraftReview,
  isPendingAdjustPlanItemOperation,
} from "./state.ts";

function normalizeRecommendationText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘\x60´]/g, "'")
    .toLowerCase();
}

function normalizeRouteText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function asksForFreeTiming(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return [
    "sans creneau",
    "sans creneau fixe",
    "sans creneau impose",
    "sans contrainte de creneau",
    "pas de creneau",
    "moment libre",
    "horaire libre",
    "sans horaire",
    "sans horaire fixe",
    "sans contrainte d'horaire",
    "sans contrainte horaire",
    "quand ca se presente",
    "naturellement",
  ].some((marker) => normalized.includes(marker));
}

export function adjustmentExecutionAck(args: {
  draft?: PlanAdjustmentDraftV1 | null;
  operationInput?: Record<string, unknown> | null;
  fallbackAck?: string | null;
}): string {
  const resultMessage = (args.draft as any)?.execution_message ||
    (args.draft as any)?.draft?.adjust_plan_result
      ?.user_message_detailed;
  if (typeof resultMessage === "string" && resultMessage.trim()) {
    const normalized = normalizeRouteText(resultMessage);
    if (
      /\b(si tu confirmes|si tu valides|si ca te va|rien n est applique|rien n est encore applique|pour l instant rien)\b/
        .test(normalized)
    ) {
      return renderAdjustPlanDraftDetails({ draft: args.draft }, {
        alreadyApplied: true,
        preferExamples: true,
      }) ?? args.fallbackAck?.trim() ?? resultMessage.trim();
    }
    return resultMessage.trim();
  }
  return args.fallbackAck?.trim() || "";
}

export function renderAdjustPlanDraftDetails(raw: any, options?: {
  alreadyApplied?: boolean;
  preferExamples?: boolean;
}): string | null {
  const result = raw?.draft?.draft?.adjust_plan_result;
  const generatedMessage = String(
    options?.alreadyApplied
      ? raw?.draft?.execution_message ?? result?.user_message_detailed ?? ""
      : result?.user_message_detailed ?? raw?.draft?.confirmation_message ?? "",
  ).trim();
  const changedItems = Array.isArray(result?.applied_change?.changed_items)
    ? result.applied_change.changed_items
    : [];
  const wholePlanTrajectoryDetails = renderWholePlanTrajectoryDetails(
    result,
    changedItems,
    options,
  );
  if (wholePlanTrajectoryDetails) {
    return wholePlanTrajectoryDetails;
  }
  if (
    generatedMessage && (!options?.preferExamples || changedItems.length === 0)
  ) {
    return generatedMessage;
  }
  const missingInfo = Array.isArray(result?.rationale?.missing_info)
    ? result.rationale.missing_info.map((item: unknown) =>
      String(item ?? "").trim()
    ).filter(Boolean)
    : [];
  if (changedItems.length === 0) {
    if (missingInfo.length === 0) return null;
    return `Je ne peux pas encore te dire exactement ce qui changera: il me manque ${
      missingInfo.slice(0, 2).join(" et ")
    }.`;
  }
  const examples = changedItems.slice(0, 4).map((item: any, index: number) => {
    const title = String(item?.title ?? "Element ajuste").trim();
    const before = String(item?.before ?? "").trim();
    const after = String(item?.after ?? "").trim();
    const reason = String(item?.reason ?? "").trim();
    return `${index + 1}. ${title}: ${
      before ? `avant, ${before}; ` : ""
    }maintenant, ${after || "c'est allege"}.${
      reason ? ` Pourquoi: ${reason}` : ""
    }`;
  });
  const preserved = Array.isArray(result?.applied_change?.preserved_items)
    ? result.applied_change.preserved_items.slice(0, 3)
    : [];
  const preservedLines = preserved.map((item: any) => {
    const title = String(item?.title ?? "").trim();
    const reason = String(item?.reason ?? "").trim();
    return title ? `- ${title}${reason ? `: ${reason}` : ""}` : "";
  }).filter(Boolean);
  const preservedBlock = preservedLines.length
    ? `\n\nCe qui reste inchangé:\n${preservedLines.join("\n")}`
    : "";
  const intro = options?.alreadyApplied
    ? "Oui. Les changements concrets appliqués sont:"
    : "Je n'ai encore rien appliqué. Le brouillon actuel prévoit:";
  const validation = options?.alreadyApplied
    ? ""
    : "\n\nSi ça te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.";
  return `${intro}\n\n${examples.join("\n")}${preservedBlock}${validation}`;
}

function renderWholePlanTrajectoryDetails(
  result: any,
  changedItems: any[],
  options?: { alreadyApplied?: boolean; preferExamples?: boolean },
): string | null {
  if (result?.scope !== "whole_plan") return null;
  const trajectory = result?.applied_change?.trajectory_change;
  if (!trajectory || typeof trajectory !== "object") return null;

  const before = String(trajectory.before ?? "").trim();
  const after = String(trajectory.after ?? "").trim();
  const insertedStep = String(trajectory.inserted_step ?? "").trim();
  const preservedDirection = String(trajectory.preserved_direction ?? "")
    .trim();
  const coachingReason = String(trajectory.coaching_reason ?? "").trim();
  const reorderedSteps = Array.isArray(trajectory.reordered_steps)
    ? trajectory.reordered_steps.map((step: unknown) =>
      String(step ?? "").trim()
    ).filter(Boolean)
    : [];
  if (
    !before && !after && !insertedStep && !preservedDirection &&
    !coachingReason && reorderedSteps.length === 0
  ) {
    return null;
  }

  const anchors = changedItems
    .map((item: any) => String(item?.title ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const lines = [
    options?.alreadyApplied
      ? "Oui. L'ajustement applique porte sur la trajectoire du plan, pas seulement sur deux actions."
      : "Je n'ai encore rien applique. Le brouillon porte sur la trajectoire du plan, pas seulement sur deux actions.",
    before ? `Avant: ${before}` : "",
    after ? `Apres: ${after}` : "",
    insertedStep ? `Etape ajoutee: ${insertedStep}` : "",
    !insertedStep && reorderedSteps.length
      ? `Ordre prevu: ${reorderedSteps.join(" -> ")}`
      : "",
    preservedDirection ? `Ce qui reste stable: ${preservedDirection}` : "",
    coachingReason ? `Pourquoi ca aide: ${coachingReason}` : "",
    anchors.length
      ? `Reperes du plan utilises pour ancrer ce changement: ${
        anchors.join(", ")
      }.`
      : "",
    options?.alreadyApplied
      ? ""
      : "Si ca te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.",
  ].filter(Boolean);
  return lines.join("\n\n");
}

export function renderLastAdjustPlanDetails(tempMemory: any): string | null {
  const raw = (tempMemory as any)?.__last_adjust_plan_execution;
  return renderAdjustPlanDraftDetails(raw, {
    alreadyApplied: true,
    preferExamples: true,
  });
}

export function renderPendingAdjustPlanDraftDetails(
  tempMemory: any,
): string | null {
  const raw = (tempMemory as any)?.__pending_adjust_plan_draft_review ??
    (tempMemory as any)?.__pending_tool_skill_confirmation ??
    (tempMemory as any)?.pending_tool_skill_confirmation;
  if (
    !isPendingAdjustPlanDraftReview(raw) &&
    !isPendingAdjustPlanItemOperation(raw)
  ) {
    return null;
  }
  return renderAdjustPlanDraftDetails(raw, {
    alreadyApplied: false,
    preferExamples: true,
  });
}

export function renderPendingAdjustPlanDraftQuestionAnswer(
  raw: any,
  userMessage: string,
): string | null {
  if (
    !isPendingAdjustPlanDraftReview(raw) &&
    !isPendingAdjustPlanItemOperation(raw)
  ) {
    return null;
  }
  const normalized = normalizeRecommendationText(userMessage);
  const asksShortConfirmation =
    /\b(confirme|confirme moi|confirme-moi|avant validation|avant de valider|avant que je valide|avant que je dise oui|tu peux me dire|peux tu me dire|peux-tu me dire|concretement|concrètement|est ce que|est-ce que|et si|garde quand meme|garde quand même|garder quand meme|garder quand même)\b/
      .test(normalized);
  if (!asksShortConfirmation) return null;

  const result = raw?.draft?.draft?.adjust_plan_result;
  if (
    result?.scope !== "whole_plan" &&
    /\b(concretement|concrètement|changements?|details?|détails?)\b/.test(
      normalized,
    )
  ) {
    return renderAdjustPlanDraftDetails(raw, { preferExamples: true });
  }
  const trajectory = result?.scope === "whole_plan"
    ? result?.applied_change?.trajectory_change
    : null;
  const after = String(trajectory?.after ?? "").trim();
  const insertedStep = String(trajectory?.inserted_step ?? "").trim();
  const basis = after || insertedStep ||
    String(raw?.draft?.confirmation_message ?? "").trim();

  if (
    /\b(ne supprime pas|supprime pas|garde|decale|décale|apres|après)\b/.test(
      normalized,
    ) &&
    /\b(discussion de fond|parler du fond|reproches|fond)\b/.test(normalized)
  ) {
    return [
      "Oui. Le brouillon ne supprime pas la discussion de fond: il la place après le retour au calme / la réparation légère.",
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }

  if (
    /\b(compte autant|reparation rapide|réparation rapide)\b/.test(normalized)
  ) {
    return [
      "Oui. Dans ce brouillon, la réparation rapide après tension fait partie du critère de réussite, au même niveau que la discussion réussie.",
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }

  if (
    /\b(ne rajoute pas|n'ajoute pas|n ajoute pas|pas plus d'actions|pas plus d actions|sans ajouter|sans action supplementaire|sans actions supplementaires)\b/
      .test(normalized) ||
    /\b(pas|sans|aucune?)\b[\s\S]{0,80}\b(trois|3|plusieurs|nouvelles?|actions?)\b/
      .test(normalized)
  ) {
    const concreteChange = insertedStep || after;
    return [
      concreteChange
        ? `Oui: le brouillon ne rajoute pas plusieurs nouvelles actions. Il ajuste la trajectoire autour de ça: ${concreteChange}`
        : "Oui: le brouillon ne rajoute pas plusieurs nouvelles actions. Il ajuste la trajectoire du plan sans transformer ça en nouvelle liste de tâches.",
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }

  if (
    /\b(trop mou|au feeling|idee de progression|idée de progression|garde quand meme.*progression|garder.*progression|perds l idee de progression|perds l'idée de progression|perdre l idee de progression|perdre l'idée de progression|progression du plan)\b/
      .test(normalized)
  ) {
    const warmthOrRepairCriterion =
      /\b(chaleur|fiabilite|fiabilité|case|cases|performance|reparer vite|réparer vite|maladresse)\b/
        .test(normalized) ||
      /\b(chaleur|fiabilite|fiabilité|case|cases|performance|maladresse)\b/
        .test(`${after} ${insertedStep}`);
    if (warmthOrRepairCriterion) {
      return [
        "Non: l'idée n'est pas de rendre le plan flou ou de fonctionner au feeling.",
        "Le brouillon garde une progression, mais il change le critère de lecture: on cherche des signes concrets de chaleur, de fiabilité et de réparation rapide, pas une exécution parfaite des actions.",
        "Si tu valides, ce feedback servira à régénérer le plan dans ce sens. Rien n'est encore appliqué.",
      ].join("\n\n");
    }
    const progressionAnchor = insertedStep || after;
    return [
      "Non: l'idée n'est pas de rendre le plan flou ou de fonctionner au feeling.",
      progressionAnchor
        ? `Le brouillon garde une progression. La marche prévue est claire: ${progressionAnchor}`
        : "Le brouillon garde une progression: il clarifie la marche suivante au lieu de laisser le plan avancer au feeling.",
      "Si tu valides, ce feedback servira à régénérer le plan dans ce sens. Rien n'est encore appliqué.",
    ].join("\n\n");
  }

  if (basis) {
    return [
      `Oui. Le brouillon prévoit bien: ${basis}`,
      "Je n'applique rien tant que tu ne me le confirmes pas clairement.",
    ].join("\n\n");
  }
  return null;
}

export function isAdjustPlanDraftRewriteRequest(message: string): boolean {
  const normalized = normalizeRecommendationText(message);
  const asksOnlyForConfirmation =
    /\b(confirme(?:\s+moi)?|est ce que|tu peux me dire|peux tu me dire|avant validation|avant de valider)\b/
      .test(normalized);
  const strongRewrite =
    /\b(ajoute|ajouter|integre|integrer|corrige|corriger|modifie|modifier|remplace|remplacer|retire|retirer)\b/
      .test(normalized) ||
    /\b(au brouillon|dans le brouillon|dans la proposition|dans cette version|garde .*brouillon|mets .*brouillon)\b/
      .test(normalized);
  if (asksOnlyForConfirmation && !strongRewrite) return false;
  return strongRewrite ||
    /\b(change|changer)\b/.test(normalized);
}

function isSimpleAdjustPlanDraftRevisionMessage(message: string): boolean {
  const normalized = normalizeRecommendationText(message);
  return /\b(brouillon|proposition|version|ajustement)\b/.test(normalized) &&
    /\b(modifie|corrige|change|prefere|plutot|au lieu)\b/.test(normalized) &&
    /\b(n'applique pas|n'applique rien|pas encore|sans appliquer|avant validation)\b/
      .test(normalized);
}

function replaceAdjustPlanDraftText(
  value: unknown,
  instruction: string,
): string {
  const text = String(value ?? "");
  if (!text) return text;
  return text
    .replace(/instruction:une phrase simple même imparfaite/gi, instruction)
    .replace(/une phrase simple, même imparfaite/gi, instruction)
    .replace(/une phrase simple même imparfaite/gi, instruction)
    .replace(/phrase simple, même imparfaite/gi, instruction)
    .replace(/phrase simple même imparfaite/gi, instruction)
    .replace(/une phrase simple/gi, instruction)
    .replace(/phrase simple/gi, instruction);
}

export function wholePlanDraftNuanceLine(userMessage: string): string | null {
  const normalized = normalizeRecommendationText(userMessage);
  if (
    /\b(critere de sortie|critère de sortie|passer a la suite|passer à la suite|deux demandes simples|2 demandes simples|tension forte)\b/
      .test(normalized)
  ) {
    return "Nuance intégrée: le passage à la suite dépend d'un critère simple, par exemple deux demandes simples réussies sans tension forte.";
  }
  if (
    /\b(discussion de fond|parler du fond|reproches|fond)\b/.test(
      normalized,
    ) &&
    /\b(retour au calme|revenir au calme|apres|après|decale|décale)\b/.test(
      normalized,
    )
  ) {
    return "Nuance intégrée: la discussion de fond est conservée, mais seulement après un retour au calme.";
  }
  if (
    /\b(reparation rapide|réparation rapide|petit geste|apres une tension|après une tension|compte autant)\b/
      .test(normalized)
  ) {
    return "Nuance intégrée: la réparation rapide après tension compte autant que la discussion réussie dans le critère de progrès.";
  }
  if (
    /\b(reparer vite|réparer vite|maladresse|pas reussir a tout faire parfaitement|pas réussir à tout faire parfaitement)\b/
      .test(normalized)
  ) {
    return "Nuance intégrée: le signe de progrès principal est de réparer vite après une maladresse, pas de réussir à tout faire parfaitement.";
  }
  if (
    /\b(nuance|ajoute|ajouter|integre|intègre|garde)\b/.test(normalized) &&
    /\b(brouillon|version|critere|critère|discussion|progres|progrès|trajectoire)\b/
      .test(normalized)
  ) {
    const cleaned = userMessage.trim().replace(/\s+/g, " ")
      .replace(/^(ok|oui|d accord|d'accord)[,.\s]+/i, "")
      .replace(
        /^(ajoute|ajouter|integre|intègre|integrer)\s+(juste\s+)?((cette\s+)?nuance\s+)?(au|dans le)\s+brouillon\s+(que|:)?\s*/i,
        "",
      )
      .replace(
        /^(garde|mets)\s+(juste\s+)?(au|dans le)\s+brouillon\s+(que|:)?\s*/i,
        "",
      )
      .replace(
        /\b(ne valide\s+pas(?:\s+encore|\s+toujours)?|ne valide(?:\s+encore|\s+toujours)?\s+pas|n'applique\s+rien|ne l'applique\s+pas|sans appliquer|pas encore)\b\.?/gi,
        "",
      )
      .trim();
    return cleaned ? `Nuance intégrée: ${cleaned.replace(/\.$/, "")}.` : null;
  }
  return null;
}

function appendAdjustPlanDraftNuance(
  draft: PlanAdjustmentDraftV1,
  nuanceLine: string,
) {
  const append = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (!text || text.includes(nuanceLine)) return text;
    return `${text}\n\n${nuanceLine}`;
  };
  draft.confirmation_message = append(draft.confirmation_message);
  draft.execution_message = append(draft.execution_message);
  const draftAny = draft.draft as any;
  draftAny.proposed_change = append(draftAny.proposed_change);
  const trajectory = draftAny.adjust_plan_result?.applied_change
    ?.trajectory_change;
  if (trajectory && typeof trajectory === "object") {
    trajectory.after = append(trajectory.after);
    trajectory.coaching_reason = append(trajectory.coaching_reason);
  }
  const rationale = draftAny.adjust_plan_result?.rationale;
  if (rationale && typeof rationale === "object") {
    rationale.expected_effect = append(rationale.expected_effect);
  }
}

export function revisePendingAdjustPlanDraftDeterministically(args: {
  pending: {
    draft: PlanAdjustmentDraftV1;
  };
  userMessage: string;
}): PlanAdjustmentDraftV1 | null {
  const normalized = normalizeRecommendationText(args.userMessage);
  const reviewOnly =
    /\b(ne valide pas|ne valide encore pas|ne valide toujours pas|n'applique pas|ne l'applique pas|n'applique rien|pas encore|sans appliquer|sans l'appliquer|avant validation|tant que je n'ai pas revalide)\b/
      .test(normalized);
  const maxTwoActions =
    /\b(2|deux)\s+actions?\s+(maximum|max|au plus)|\bmaximum\s+(2|deux)\s+actions?\b/
      .test(normalized);
  const draftScope = String(
    (args.pending.draft.draft as any)?.adjust_plan_result?.scope ??
      (args.pending.draft.draft as any)?.execution_strategy ??
      "",
  ).trim();
  if (
    reviewOnly && maxTwoActions &&
    /\b(whole_plan|whole_plan_adjustment|plan global)\b/.test(
      normalizeRecommendationText(draftScope),
    )
  ) {
    const next = JSON.parse(
      JSON.stringify(args.pending.draft),
    ) as PlanAdjustmentDraftV1;
    const draftAny = next.draft as any;
    const constraints = Array.isArray(draftAny.patch?.constraints)
      ? draftAny.patch.constraints
      : [];
    draftAny.patch = {
      ...(draftAny.patch ?? {}),
      constraints: [
        ...constraints.filter((value: unknown) =>
          String(value ?? "").trim() !== "max_two_actions_next_step"
        ),
        "max_two_actions_next_step",
      ],
    };
    const line =
      "Contrainte ajoutée: la prochaine étape reste limitée à deux actions maximum.";
    const appendConstraint = (value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text || text.includes(line)) return text;
      return `${text}\n\n${line}`;
    };
    next.confirmation_message = appendConstraint(next.confirmation_message);
    next.execution_message = appendConstraint(next.execution_message);
    draftAny.proposed_change = appendConstraint(draftAny.proposed_change);
    return next;
  }
  const wholePlanScope = /\b(whole_plan|whole_plan_adjustment|plan global)\b/
    .test(
      normalizeRecommendationText(draftScope),
    );
  const nuanceLine = wholePlanScope
    ? wholePlanDraftNuanceLine(args.userMessage)
    : null;
  if (reviewOnly && nuanceLine) {
    const next = JSON.parse(
      JSON.stringify(args.pending.draft),
    ) as PlanAdjustmentDraftV1;
    appendAdjustPlanDraftNuance(next, nuanceLine);
    return next;
  }
  if (!isSimpleAdjustPlanDraftRevisionMessage(args.userMessage)) return null;
  if (!/\bphrase neutre\b/.test(normalized)) return null;
  const instruction = /\bimparfaite\b/.test(normalized)
    ? "une phrase neutre, même imparfaite"
    : "une phrase neutre";
  const wantsFreeTiming = asksForFreeTiming(args.userMessage);
  const next = JSON.parse(
    JSON.stringify(args.pending.draft),
  ) as PlanAdjustmentDraftV1;
  const draftAny = next.draft as any;
  draftAny.patch = {
    ...(draftAny.patch ?? {}),
    instruction,
  };
  for (
    const key of [
      "proposed_change",
      "why_it_helps",
      "confirmation_message",
      "execution_message",
    ]
  ) {
    if (typeof (next as any)[key] === "string") {
      (next as any)[key] = replaceAdjustPlanDraftText(
        (next as any)[key],
        instruction,
      );
    }
    if (typeof draftAny[key] === "string") {
      draftAny[key] = replaceAdjustPlanDraftText(draftAny[key], instruction);
    }
  }
  const result = draftAny.adjust_plan_result as any;
  if (result) {
    for (const key of ["user_message_brief", "user_message_detailed"]) {
      if (typeof result[key] === "string") {
        result[key] = replaceAdjustPlanDraftText(result[key], instruction);
      }
    }
    const changedItems = Array.isArray(result.applied_change?.changed_items)
      ? result.applied_change.changed_items
      : [];
    for (const item of changedItems) {
      if (typeof item.after === "string") {
        item.after = replaceAdjustPlanDraftText(item.after, instruction);
        if (wantsFreeTiming && !asksForFreeTiming(item.after)) {
          item.after = `${item.after}, sans créneau fixe`;
        }
      }
      if (typeof item.reason === "string") {
        item.reason = replaceAdjustPlanDraftText(item.reason, instruction);
      }
    }
  }
  if (typeof next.confirmation_message === "string") {
    next.confirmation_message = replaceAdjustPlanDraftText(
      next.confirmation_message,
      instruction,
    );
  }
  if (typeof next.execution_message === "string") {
    next.execution_message = replaceAdjustPlanDraftText(
      next.execution_message,
      instruction,
    );
  }
  return next;
}
