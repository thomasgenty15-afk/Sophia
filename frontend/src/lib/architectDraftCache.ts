const REFLECTION_DRAFT_KEY_PREFIX = "architect_reflection_draft:";
const STORY_DRAFT_KEY_PREFIX = "architect_story_draft:";

export const ARCHITECT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type BaseDraftCache = {
  version: 1;
  scope: string;
  updatedAt: string;
};

export type ReflectionDraftCache = BaseDraftCache & {
  title: string;
  content: string;
  tags: string;
  filRouge: string | null;
};

export type StoryDraftCache = BaseDraftCache & {
  title: string;
  duration: string;
  bulletPoints: string[];
  speechMap: string;
  topicTags: string[];
  filRouge: string | null;
};

function loadDraftCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function persistDraftCache<T extends BaseDraftCache>(
  key: string,
  draft: Omit<T, "version" | "updatedAt">,
): T {
  const normalized = {
    ...draft,
    version: 1 as const,
    updatedAt: new Date().toISOString(),
  } as T;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(normalized));
    } catch {
      // Ignore quota/private mode failures.
    }
  }
  return normalized;
}

function clearDraftCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isDraftCacheShape(value: unknown): value is BaseDraftCache {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BaseDraftCache>;
  return candidate.version === 1 &&
    typeof candidate.scope === "string" &&
    typeof candidate.updatedAt === "string";
}

export function isArchitectDraftExpired(
  updatedAt: string,
  nowMs = Date.now(),
): boolean {
  const updatedAtMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return true;
  return nowMs - updatedAtMs > ARCHITECT_DRAFT_TTL_MS;
}

export function loadReflectionDraftCache(
  userId: string,
): ReflectionDraftCache | null {
  const draft = loadDraftCache<ReflectionDraftCache>(
    `${REFLECTION_DRAFT_KEY_PREFIX}${userId}`,
  );
  return isDraftCacheShape(draft) ? draft : null;
}

export function persistReflectionDraftCache(
  userId: string,
  draft: Omit<ReflectionDraftCache, "version" | "updatedAt">,
): ReflectionDraftCache {
  return persistDraftCache<ReflectionDraftCache>(
    `${REFLECTION_DRAFT_KEY_PREFIX}${userId}`,
    draft,
  );
}

export function clearReflectionDraftCache(userId: string): void {
  clearDraftCache(`${REFLECTION_DRAFT_KEY_PREFIX}${userId}`);
}

export function loadStoryDraftCache(userId: string): StoryDraftCache | null {
  const draft = loadDraftCache<StoryDraftCache>(
    `${STORY_DRAFT_KEY_PREFIX}${userId}`,
  );
  return isDraftCacheShape(draft) ? draft : null;
}

export function persistStoryDraftCache(
  userId: string,
  draft: Omit<StoryDraftCache, "version" | "updatedAt">,
): StoryDraftCache {
  return persistDraftCache<StoryDraftCache>(
    `${STORY_DRAFT_KEY_PREFIX}${userId}`,
    draft,
  );
}

export function clearStoryDraftCache(userId: string): void {
  clearDraftCache(`${STORY_DRAFT_KEY_PREFIX}${userId}`);
}
