export const PROMPT_VERSIONS = {
  extraction: "memory.memorizer.extraction.v1",
  topic_router: "memory.runtime.topic_router.v1",
  compaction: "memory.compaction.topic.v1",
} as const;

export type MemoryPromptName = keyof typeof PROMPT_VERSIONS;
export type MemoryPromptVersion = typeof PROMPT_VERSIONS[MemoryPromptName];
