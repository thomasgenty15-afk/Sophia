import type { CorrectionRepository } from "./operations.ts";
import type { CorrectionChangeLogRow } from "./types.ts";

export class InMemoryCorrectionRepository implements CorrectionRepository {
  items = new Map<string, Record<string, unknown>>();
  topicIdsByItem = new Map<string, string[]>();
  topicPending = new Map<string, number>();
  topicSensitivityRecalculations: string[] = [];
  payloadPurges: Array<{ user_id: string; item_id: string }> = [];
  changeLogs: CorrectionChangeLogRow[] = [];
  sourceRedactions: string[] = [];

  async updateMemoryItem(
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    this.items.set(itemId, { ...(this.items.get(itemId) ?? {}), ...patch });
  }

  async insertChangeLog(row: CorrectionChangeLogRow): Promise<void> {
    this.changeLogs.push(row);
  }

  async getTopicIdsForItem(itemId: string): Promise<string[]> {
    return this.topicIdsByItem.get(itemId) ?? [];
  }

  async incrementTopicPendingChanges(topicIds: string[]): Promise<void> {
    for (const id of topicIds) {
      this.topicPending.set(id, (this.topicPending.get(id) ?? 0) + 1);
    }
  }

  async recalculateTopicSensitivityMax(topicIds: string[]): Promise<void> {
    this.topicSensitivityRecalculations.push(...topicIds);
  }

  async purgePayloadItemForUser(userId: string, itemId: string): Promise<void> {
    this.payloadPurges.push({ user_id: userId, item_id: itemId });
  }

  async redactSourcesForItem(itemId: string): Promise<void> {
    this.sourceRedactions.push(itemId);
  }
}
