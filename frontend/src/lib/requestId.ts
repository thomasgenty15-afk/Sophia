export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  const s = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
}

export function requestHeaders(requestId: string): Record<string, string> {
  return {
    "x-request-id": requestId,
    "x-sophia-client-request-id": requestId,
    "x-client-request-id": requestId,
  };
}



