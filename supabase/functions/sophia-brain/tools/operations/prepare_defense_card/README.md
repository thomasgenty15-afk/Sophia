prepare_defense_card local flow

Runtime V1:

- local dispatcher is the only business decider while the flow is active;
- reducer validates structured output, updates local state, and builds
  `visible_task.conversation_context`;
- visible agent writes only from `conversation_context`;
- no deterministic renderer, old intake, slot filler, platform field filler,
  executor, or pending confirmation path exists in this folder;
- the only platform field prepared by this flow is `support_need`.
