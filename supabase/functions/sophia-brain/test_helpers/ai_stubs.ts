import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "../tools/operations/prepare_attack_card/test_helpers.ts";

export function createAttackCardIntakeStub(options?: {
  planItemId?: string;
  title?: string;
}) {
  return structuredAttackCardSlotFiller(
    readyAttackCardStatePatch({
      planItemId: options?.planItemId,
      title: options?.title,
    }),
  );
}

export function createAttackCardDraftStub() {
  return structuredAttackCardDraftGenerator;
}
