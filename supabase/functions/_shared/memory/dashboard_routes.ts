export type MemoryDashboardRoute =
  | { kind: "list_items" }
  | { kind: "list_entities" }
  | { kind: "hide_item"; item_id: string }
  | { kind: "delete_item"; item_id: string }
  | { kind: "not_found" };

function cleanSegment(value: unknown): string {
  return decodeURIComponent(String(value ?? "").trim());
}

function routeSegments(pathname: string): string[] {
  const segments = pathname.split("/").map(cleanSegment).filter(Boolean);
  const memoryMe = segments.findIndex((segment, index) =>
    segment === "memory-me" ||
    (segment === "memory" && segments[index + 1] === "me")
  );
  if (memoryMe < 0) return segments;
  return segments[memoryMe] === "memory-me"
    ? segments.slice(memoryMe + 1)
    : segments.slice(memoryMe + 2);
}

export function parseMemoryDashboardRoute(
  method: string,
  pathname: string,
): MemoryDashboardRoute {
  const segments = routeSegments(pathname);
  const upperMethod = String(method ?? "").toUpperCase();
  if (
    upperMethod === "GET" && segments.length === 1 && segments[0] === "items"
  ) {
    return { kind: "list_items" };
  }
  if (
    upperMethod === "GET" && segments.length === 1 && segments[0] === "entities"
  ) {
    return { kind: "list_entities" };
  }
  if (
    upperMethod === "POST" &&
    segments.length === 3 &&
    segments[0] === "items" &&
    segments[2] === "hide"
  ) {
    return { kind: "hide_item", item_id: segments[1] };
  }
  if (
    upperMethod === "POST" &&
    segments.length === 3 &&
    segments[0] === "items" &&
    segments[2] === "delete"
  ) {
    return { kind: "delete_item", item_id: segments[1] };
  }
  return { kind: "not_found" };
}

export function clampDashboardLimit(raw: unknown, fallback = 50): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
}
