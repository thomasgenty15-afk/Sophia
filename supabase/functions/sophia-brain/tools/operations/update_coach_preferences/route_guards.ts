function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectsCoachPreferenceDirectionContradiction(
  message: string,
  patch: Record<string, unknown>,
): boolean {
  const text = normalizeText(message);
  const qtValue = String((patch ?? {})["coach.question_tendency"] ?? "").trim();
  if (!qtValue) return false;
  const wantsFewer = /\bmoins de questions?\b/.test(text) ||
    /\bpas (?:trop|plusieurs|de|tant) (?:de )?questions?\b/.test(text) ||
    /\bavant de (?:me )?(?:poser|demander)[\s\S]{0,24}questions?\b/.test(
      text,
    ) ||
    /\b(?:d abord|dabord) (?:un |le )?(?:geste|petit pas|petit geste|action)\b/
      .test(text) ||
    /\bgeste concret\b[\s\S]{0,40}\b(avant|puis|ensuite|seulement)\b/.test(
      text,
    ) ||
    /\bune seule question\b/.test(text) ||
    /\bune question maximum\b/.test(text) ||
    /\bquestion maximum\b/.test(text) ||
    (
      /\bgeste concret\b/.test(text) &&
      /\b(10 minutes|moins de 10)\b/.test(text)
    );
  const wantsMore = /\bplus de questions?\b/.test(text) ||
    /\b(questionne|questionner|interroge|interroger)[\s\S]{0,24}\b(plus|davantage)\b/
      .test(text) ||
    /\bprends?(?: plus)? le temps de (?:me )?questionner\b/.test(text) ||
    /\bpose(?:-| )?moi plus de questions?\b/.test(text);
  if (wantsFewer && !wantsMore && qtValue === "high") return true;
  if (wantsMore && !wantsFewer && qtValue === "low") return true;
  return false;
}

export function detectsCoachPreferenceDirectionContradictionForSkill(input: {
  message: string;
  patch: Record<string, unknown>;
}): boolean {
  return detectsCoachPreferenceDirectionContradiction(
    input.message,
    input.patch,
  );
}

export function clearConversationFlowForCoachPreference(
  tempMemory: any,
): Record<string, unknown> {
  const next = { ...(tempMemory ?? {}) };
  delete (next as any).__active_skill_state;
  delete (next as any).active_skill_state;
  delete (next as any).__suspended_flow_v1;
  return next;
}
