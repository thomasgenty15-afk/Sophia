import { assert, assertEquals } from "jsr:@std/assert@1";
import { computeInboundTemplateContext } from "./handlers_optin_bilan.ts";
import { buildDefaultWhatsAppConversationContext } from "./normal_context.ts";

type MessageRow = {
  user_id: string;
  role: "assistant" | "user";
  created_at: string;
  metadata?: Record<string, unknown> | null;
  content?: string | null;
};

function createAdmin(messages: MessageRow[]) {
  return {
    from(table: string) {
      if (table !== "chat_messages") {
        const emptyBuilder = {
          select(_cols: string) {
            return emptyBuilder;
          },
          eq(_key: string, _value: unknown) {
            return emptyBuilder;
          },
          in(_key: string, _values: unknown[]) {
            return emptyBuilder;
          },
          gte(_key: string, _value: unknown) {
            return emptyBuilder;
          },
          filter(_key: string, _op: string, _value: unknown) {
            return emptyBuilder;
          },
          order(_key: string, _opts: { ascending?: boolean }) {
            return emptyBuilder;
          },
          limit(_n: number) {
            return emptyBuilder;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
        };
        return emptyBuilder;
      }
      const state = {
        rows: [...messages],
        filters: [] as Array<(row: MessageRow) => boolean>,
        ascending: false,
        limit: null as number | null,
      };
      const builder = {
        select(_cols: string) {
          return builder;
        },
        eq(key: string, value: unknown) {
          state.filters.push((row) => (row as any)[key] === value);
          return builder;
        },
        gte(key: string, value: unknown) {
          state.filters.push((row) =>
            String((row as any)[key] ?? "") >= String(value ?? "")
          );
          return builder;
        },
        filter(key: string, op: string, value: unknown) {
          if (key === "metadata->>channel" && op === "eq") {
            state.filters.push((row) =>
              String(row.metadata?.channel ?? "") === String(value)
            );
          }
          if (key === "metadata->>purpose" && op === "eq") {
            state.filters.push((row) =>
              String(row.metadata?.purpose ?? "") === String(value)
            );
          }
          return builder;
        },
        order(key: string, opts: { ascending?: boolean }) {
          state.ascending = opts.ascending === true;
          state.rows.sort((a, b) =>
            state.ascending
              ? String((a as any)[key]).localeCompare(String((b as any)[key]))
              : String((b as any)[key]).localeCompare(String((a as any)[key]))
          );
          return builder;
        },
        limit(n: number) {
          state.limit = n;
          return builder;
        },
        maybeSingle() {
          let rows = state.rows.filter((row) =>
            state.filters.every((filter) => filter(row))
          );
          if (typeof state.limit === "number") {
            rows = rows.slice(0, state.limit);
          }
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };
      return builder;
    },
  };
}

Deno.test("computeInboundTemplateContext accepts text opt-in only after latest opt-in prompt", async () => {
  const admin = createAdmin([
    {
      user_id: "u1",
      role: "assistant",
      created_at: new Date().toISOString(),
      metadata: { channel: "whatsapp", purpose: "optin" },
    },
  ]);

  const result = await computeInboundTemplateContext({
    admin,
    userId: "u1",
    actionId: "",
    isOptInYesText: true,
    whatsappOptedIn: false,
    whatsappState: null,
  });

  assertEquals(result.isOptInYes, true);
});

Deno.test("computeInboundTemplateContext accepts text opt-in after winback prompt", async () => {
  const admin = createAdmin([
    {
      user_id: "u1",
      role: "assistant",
      created_at: new Date().toISOString(),
      metadata: { channel: "whatsapp", purpose: "optin_winback" },
    },
  ]);

  const result = await computeInboundTemplateContext({
    admin,
    userId: "u1",
    actionId: "",
    isOptInYesText: true,
    whatsappOptedIn: false,
    whatsappState: null,
  });

  assertEquals(result.isOptInYes, true);
});

Deno.test("computeInboundTemplateContext rejects conversational yes after onboarding conversation started", async () => {
  const admin = createAdmin([
    {
      user_id: "u1",
      role: "assistant",
      created_at: "2026-06-14T12:32:00.000Z",
      metadata: { channel: "whatsapp", purpose: "optin" },
    },
    {
      user_id: "u1",
      role: "assistant",
      created_at: "2026-06-14T13:07:46.000Z",
      metadata: {
        channel: "whatsapp",
        purpose: "whatsapp_default_brain_reply",
      },
    },
  ]);

  const result = await computeInboundTemplateContext({
    admin,
    userId: "u1",
    actionId: "",
    isOptInYesText: true,
    whatsappOptedIn: true,
    whatsappState: null,
  });

  assertEquals(result.isOptInYes, false);
});

Deno.test("computeInboundTemplateContext keeps explicit OPTIN_YES button as strong opt-in", async () => {
  const admin = createAdmin([]);

  const result = await computeInboundTemplateContext({
    admin,
    userId: "u1",
    actionId: "OPTIN_YES",
    isOptInYesText: false,
    whatsappOptedIn: true,
    whatsappState: "onboarding_plan_creation_feedback",
  });

  assertEquals(result.isOptInYes, true);
});

Deno.test("default WhatsApp normal context forbids mini coaching and A/B menus", async () => {
  const source = buildDefaultWhatsAppConversationContext();

  assert(source.includes("normal_reply sert a repondre naturellement"));
  assert(source.includes("Ce n'est pas un flow de coaching"));
  assert(source.includes("N'utilise pas de menu A/B"));
  assert(source.includes("questionnaire ou mini-coaching"));
});
