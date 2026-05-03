import type {
  MemoryExtractionRunRow,
  MessageProcessingRow,
  PersistedMemoryWrite,
  WriteDecision,
} from "./types.ts";
import type { MemorizerPersistRepository } from "./persist.ts";

export class InMemoryMemorizerRepository implements MemorizerPersistRepository {
  runs: MemoryExtractionRunRow[] = [];
  processing: MessageProcessingRow[] = [];
  memoryWrites: PersistedMemoryWrite[] = [];
  updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  nextRun = 1;

  async findExtractionRun(args: {
    user_id: string;
    batch_hash: string;
    prompt_version: string;
  }): Promise<MemoryExtractionRunRow | null> {
    return this.runs.find((run) =>
      run.user_id === args.user_id &&
      run.batch_hash === args.batch_hash &&
      run.prompt_version === args.prompt_version
    ) ?? null;
  }

  async createExtractionRun(args: {
    user_id: string;
    batch_hash: string;
    prompt_version: string;
    model_name: string;
    trigger_type: string;
    input_message_ids: string[];
    metadata?: Record<string, unknown>;
  }): Promise<MemoryExtractionRunRow> {
    const run: MemoryExtractionRunRow = {
      id: `run-${this.nextRun++}`,
      user_id: args.user_id,
      batch_hash: args.batch_hash,
      prompt_version: args.prompt_version,
      model_name: args.model_name,
      status: "running",
      input_message_ids: args.input_message_ids,
      metadata: args.metadata,
    };
    this.runs.push(run);
    return run;
  }

  async updateExtractionRun(
    runId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    this.updates.push({ id: runId, patch });
    const run = this.runs.find((r) => r.id === runId);
    if (run) Object.assign(run, patch);
  }

  async insertMessageProcessing(rows: MessageProcessingRow[]): Promise<void> {
    for (const row of rows) {
      const exists = this.processing.some((existing) =>
        existing.user_id === row.user_id &&
        existing.message_id === row.message_id &&
        existing.processing_role === row.processing_role
      );
      if (!exists) this.processing.push(row);
    }
  }

  async persistMemoryWrites(args: {
    user_id: string;
    extraction_run_id: string;
    decisions: WriteDecision[];
  }): Promise<PersistedMemoryWrite[]> {
    const persisted: PersistedMemoryWrite[] = [];
    for (const decision of args.decisions) {
      if (decision.status === "reject") continue;
      if (!decision.candidate.item.source_message_ids.length) {
        throw new Error("memory_v2_write_missing_source");
      }
      persisted.push({
        memory_item_id: `mem-${
          this.memoryWrites.length + persisted.length + 1
        }`,
        status: decision.status,
        candidate: decision.candidate,
      });
    }
    this.memoryWrites.push(...persisted);
    return persisted;
  }
}
