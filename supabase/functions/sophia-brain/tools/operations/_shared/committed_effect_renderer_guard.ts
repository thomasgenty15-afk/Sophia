export function containsDurableSuccessClaim(reply: string): boolean {
  void reply;
  return false;
}

export function renderNonCommittedReply(
  reply: string | null | undefined,
  fallback: string,
): string {
  const text = String(reply ?? "").trim();
  return text || fallback;
}
