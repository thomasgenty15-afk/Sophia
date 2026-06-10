export function applyMemoryV2ResponseGroundingGuardrail(args: {
  userMessage: string;
  responseContent: string;
  contextBlock: string;
}): string {
  void args.userMessage;
  void args.contextBlock;
  return args.responseContent;
}
