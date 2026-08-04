export const ACTIVE_CONVERSATION_SKILL_KEY = "__active_conversation_skill_v1";

export type ActiveConversationSkillState = {
  version: 1;
  skill_id: string;
  status: "active" | "handoff" | "exiting";
  turn_count: number;
  started_at: string;
  updated_at: string;
  previous_skill_id?: string | null;
  summary?: string | null;
  working_state?: Record<string, unknown>;
};

export type ActiveConversationSkillWorkingState =
  & ActiveConversationSkillState
  & {
    user_id: string;
    scope: string;
  };

export interface ActiveSkillStateRepository {
  readTempMemory(
    userId: string,
    scope: string,
  ): Promise<Record<string, unknown>>;
  writeTempMemory(
    userId: string,
    scope: string,
    tempMemory: Record<string, unknown>,
  ): Promise<void>;
}

export class InMemoryActiveSkillStateRepository
  implements ActiveSkillStateRepository {
  rows = new Map<string, Record<string, unknown>>();

  key(userId: string, scope: string): string {
    return `${userId}:${scope}`;
  }

  async readTempMemory(
    userId: string,
    scope: string,
  ): Promise<Record<string, unknown>> {
    return { ...(this.rows.get(this.key(userId, scope)) ?? {}) };
  }

  async writeTempMemory(
    userId: string,
    scope: string,
    tempMemory: Record<string, unknown>,
  ): Promise<void> {
    this.rows.set(this.key(userId, scope), { ...tempMemory });
  }
}

let activeSkillRepository: ActiveSkillStateRepository =
  new InMemoryActiveSkillStateRepository();

export function setActiveSkillStateRepositoryForTest(
  repository: ActiveSkillStateRepository,
): void {
  activeSkillRepository = repository;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeState(
  raw: unknown,
  userId: string,
  scope: string,
): ActiveConversationSkillWorkingState | null {
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.skill_id !== "string") {
    return null;
  }
  return {
    version: 1,
    skill_id: raw.skill_id,
    status: raw.status === "handoff" || raw.status === "exiting"
      ? raw.status
      : "active",
    turn_count: Math.max(0, Number(raw.turn_count ?? 0)),
    started_at: typeof raw.started_at === "string"
      ? raw.started_at
      : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string"
      ? raw.updated_at
      : new Date().toISOString(),
    previous_skill_id: typeof raw.previous_skill_id === "string"
      ? raw.previous_skill_id
      : null,
    summary: typeof raw.summary === "string" ? raw.summary : null,
    working_state: isRecord(raw.working_state) ? raw.working_state : {},
    user_id: userId,
    scope,
  };
}

export async function loadActiveSkill(
  userId: string,
  scope = "web",
): Promise<ActiveConversationSkillWorkingState | null> {
  const tempMemory = await activeSkillRepository.readTempMemory(userId, scope);
  return normalizeState(
    tempMemory[ACTIVE_CONVERSATION_SKILL_KEY],
    userId,
    scope,
  );
}

export async function patchActiveSkill(
  userId: string,
  statePatch: Partial<ActiveConversationSkillState> & { skill_id?: string },
  scope = "web",
): Promise<void> {
  const tempMemory = await activeSkillRepository.readTempMemory(userId, scope);
  const existing = normalizeState(
    tempMemory[ACTIVE_CONVERSATION_SKILL_KEY],
    userId,
    scope,
  );
  const now = new Date().toISOString();
  const previousSkillId = statePatch.previous_skill_id ??
    (statePatch.skill_id && existing?.skill_id &&
        statePatch.skill_id !== existing.skill_id
      ? existing.skill_id
      : existing?.previous_skill_id ?? null);
  const next: ActiveConversationSkillState = {
    version: 1,
    skill_id: statePatch.skill_id ?? existing?.skill_id ?? "unknown",
    status: statePatch.status ?? existing?.status ?? "active",
    turn_count: statePatch.turn_count ?? (existing?.turn_count ?? 0) + 1,
    started_at: statePatch.started_at ?? existing?.started_at ?? now,
    updated_at: now,
    previous_skill_id: previousSkillId,
    summary: statePatch.summary ?? existing?.summary ?? null,
    working_state: {
      ...(existing?.working_state ?? {}),
      ...(statePatch.working_state ?? {}),
    },
  };
  await activeSkillRepository.writeTempMemory(userId, scope, {
    ...tempMemory,
    [ACTIVE_CONVERSATION_SKILL_KEY]: next,
  });
}

export async function clearActiveSkill(
  userId: string,
  scope = "web",
): Promise<void> {
  const tempMemory = await activeSkillRepository.readTempMemory(userId, scope);
  delete tempMemory[ACTIVE_CONVERSATION_SKILL_KEY];
  delete tempMemory.__active_skill_state;
  delete tempMemory.active_skill_state;
  await activeSkillRepository.writeTempMemory(userId, scope, tempMemory);
}
