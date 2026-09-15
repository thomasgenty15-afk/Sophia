import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  clampDashboardLimit,
  parseMemoryDashboardRoute,
} from "./dashboard_routes.ts";

Deno.test("memory dashboard routes parse API and functions paths", () => {
  assertEquals(
    parseMemoryDashboardRoute("GET", "/api/memory/me/items"),
    { kind: "list_items" },
  );
  assertEquals(
    parseMemoryDashboardRoute("GET", "/functions/v1/memory-me/entities"),
    { kind: "list_entities" },
  );
  assertEquals(
    parseMemoryDashboardRoute(
      "POST",
      "/functions/v1/memory-me/items/item-1/hide",
    ),
    { kind: "hide_item", item_id: "item-1" },
  );
  assertEquals(
    parseMemoryDashboardRoute("POST", "/api/memory/me/items/item-1/delete"),
    { kind: "delete_item", item_id: "item-1" },
  );
});

Deno.test("memory dashboard limit is clamped", () => {
  assertEquals(clampDashboardLimit("500"), 200);
  assertEquals(clampDashboardLimit("0"), 1);
  assertEquals(clampDashboardLimit("abc", 25), 25);
});
