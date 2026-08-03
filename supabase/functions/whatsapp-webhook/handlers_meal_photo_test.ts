/**
 * KEEL W5.1 — `handleInboundMealPhoto`.
 *
 * What these tests are actually defending:
 *  - the PAYWALL, which lives ~120 lines after the call site in `index.ts` and
 *    is therefore unreachable from the media branch: without the recopied gate,
 *    every non-paying number that knows the phone number gets a free,
 *    cost-bearing model call per photo;
 *  - EXECUTION TRUTH: no acknowledgement without a re-read storage object AND a
 *    re-read `protocol_events` row. Each failure step has a test asserting that
 *    the student was told NOTHING;
 *  - CONTRACT non-input #4: a photo produces no quantity and no guessed slot;
 *  - the RGPD path prefix, which the account export and the purge key off.
 *
 * No network: the one end-to-end case mocks `globalThis.fetch` and runs through
 * the real `fetchWhatsAppMedia`.
 */

import { assertEquals } from "jsr:@std/assert@1";

import {
  gateAllowsPhoto,
  handleInboundMealPhoto,
  localDateInZone,
  MEAL_PHOTO_BUCKET,
  MEAL_PHOTO_EVIDENCE_WEIGHT,
  MEAL_PHOTO_PURPOSE,
  MEAL_PHOTO_RATE_LIMIT_PURPOSE,
  mealPhotoObjectPath,
  type MealPhotoPorts,
} from "./handlers_meal_photo.ts";
import type { WhatsAppInboundMedia } from "./wa_parse.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WAMID = "wamid.HBgLMzM2MDAwMDAwMDAVAgASGCA=";
const NOW = new Date("2026-07-27T18:30:00.000Z");

const PHOTO: WhatsAppInboundMedia = {
  media_type: "image",
  id: "MEDIA_1",
  mime_type: "image/jpeg",
  sha256: "deadbeef",
  caption: "lunch",
  filename: null,
};

type Recorder = {
  rate_keys: string[];
  fetched: string[];
  uploads: Array<{ bucket: string; path: string; content_type: string; size: number }>;
  events: Array<Record<string, unknown>>;
  replies: Array<{ body: string; purpose: string; metadata?: Record<string, unknown> }>;
  analyses: number;
};

function makePorts(
  rec: Recorder,
  overrides: Partial<MealPhotoPorts> = {},
): Partial<MealPhotoPorts> {
  const base: MealPhotoPorts = {
    async check_rate_limit(input) {
      rec.rate_keys.push(input.key);
      return { allowed: true, retry_after_seconds: 0 };
    },
    resolve_tier: () => Promise.resolve("alliance"),
    resolve_timezone: () => Promise.resolve("Europe/Paris"),
    fetch_media(mediaId) {
      rec.fetched.push(mediaId);
      return Promise.resolve({
        ok: true as const,
        media_id: mediaId,
        bytes: new Uint8Array([9, 8, 7]),
        mime_type: "image/jpeg",
        sha256: "deadbeef",
        declared_size: 3,
        byte_length: 3,
        transport: "graph" as const,
      });
    },
    storage: {
      upload(input) {
        rec.uploads.push({
          bucket: input.bucket,
          path: input.path,
          content_type: input.content_type,
          size: input.bytes.byteLength,
        });
        return Promise.resolve({ ok: true as const, path: input.path });
      },
      exists: () => Promise.resolve(true),
    },
    write_protocol_event(input) {
      rec.events.push({ ...input });
      return Promise.resolve({
        outcome: "inserted" as const,
        row: {
          id: "event-1",
          user_id: input.user_id,
          local_date: input.local_date,
          occurred_at: input.occurred_at,
          slot_key: input.slot_key,
          source: input.source,
          source_message_id: input.source_message_id,
          bound_commitment_id: null,
          // READ-BACK identity of the fact (contract.ts). The WhatsApp path
          // inserts both NULL: the image has not been read yet, and
          // `analyze-meal-photo-v1` writes the credit afterwards.
          food_group_ref: null,
          substance_ref: null,
        },
      });
    },
    send_reply(input) {
      rec.replies.push(input);
      return Promise.resolve();
    },
    // Default in tests: W5.2 returns no verdict. The real default port calls
    // `analyze-meal-photo-v1` over HTTP; the tests that care drive it explicitly.
    analyze_meal_photo: () => Promise.resolve(null),
    now: () => NOW,
  };
  return { ...base, ...overrides };
}

function recorder(): Recorder {
  return {
    rate_keys: [],
    fetched: [],
    uploads: [],
    events: [],
    replies: [],
    analyses: 0,
  };
}

/** `admin` is never touched when every port is injected; a Proxy proves it. */
const NEVER_ADMIN: any = new Proxy({}, {
  get(_t, prop) {
    if (prop === "storage" || prop === "from" || prop === "rpc") {
      return () => {
        throw new Error(`admin.${String(prop)} must not be reached in this test`);
      };
    }
    return undefined;
  },
});

function run(
  ports: Partial<MealPhotoPorts>,
  overrides: Partial<Parameters<typeof handleInboundMealPhoto>[0]> = {},
) {
  return handleInboundMealPhoto({
    admin: NEVER_ADMIN,
    user_id: USER_ID,
    from_e164: "+33600000000",
    request_id: "req_1",
    wa_message_id: WAMID,
    media: PHOTO,
    trial_end: null,
    ports,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

Deno.test("gateAllowsPhoto is the index.ts predicate: active trial OR a WhatsApp tier", () => {
  const now = NOW;
  // Paid tiers pass with no trial at all.
  assertEquals(gateAllowsPhoto({ trial_end: null, tier: "alliance", now }), true);
  assertEquals(gateAllowsPhoto({ trial_end: null, tier: "architecte", now }), true);
  // Système is a paid plan that does NOT include WhatsApp coaching.
  assertEquals(gateAllowsPhoto({ trial_end: null, tier: "system", now }), false);
  assertEquals(gateAllowsPhoto({ trial_end: null, tier: "none", now }), false);
  // An active trial passes whatever the tier.
  assertEquals(
    gateAllowsPhoto({ trial_end: "2026-08-01T00:00:00Z", tier: "none", now }),
    true,
  );
  // An expired or unparseable trial does not.
  assertEquals(
    gateAllowsPhoto({ trial_end: "2026-07-01T00:00:00Z", tier: "none", now }),
    false,
  );
  assertEquals(gateAllowsPhoto({ trial_end: "not-a-date", tier: "none", now }), false);
});

Deno.test("mealPhotoObjectPath starts with the owner id (RGPD) and is deterministic", () => {
  const path = mealPhotoObjectPath({
    user_id: USER_ID,
    local_date: "2026-07-27",
    wa_message_id: WAMID,
    mime_type: "image/jpeg",
  });
  // The export bundles `<user_id>/` and the purge deletes `<user_id>/`
  // (20260727130000). A key not under that prefix survives account deletion.
  assertEquals(path.startsWith(`${USER_ID}/`), true);
  assertEquals(path.includes("/2026-07-27/"), true);
  assertEquals(path.endsWith(".jpg"), true);
  // Storage-safe charset only, and no raw wamid punctuation leaking in.
  const key = path.split("/").slice(2).join("/");
  assertEquals(/^[A-Za-z0-9_-]+\.[a-z]+$/.test(key), true);
  // Stable across calls: a re-delivered webhook overwrites, never litters.
  assertEquals(
    mealPhotoObjectPath({
      user_id: USER_ID,
      local_date: "2026-07-27",
      wa_message_id: WAMID,
      mime_type: "image/jpeg",
    }),
    path,
  );
  // Injective: two wamids differing only in base64 punctuation must not collide.
  const a = mealPhotoObjectPath({
    user_id: USER_ID, local_date: "2026-07-27",
    wa_message_id: "wamid.A+B/C=", mime_type: "image/png",
  });
  const b = mealPhotoObjectPath({
    user_id: USER_ID, local_date: "2026-07-27",
    wa_message_id: "wamid.A_B-C_", mime_type: "image/png",
  });
  assertEquals(a === b, false);
});

Deno.test("localDateInZone cuts the day in the plan timezone and throws on garbage (R7)", () => {
  // 23:30 UTC on the 27th is already the 28th in Paris — filing the fact on the
  // wrong day is exactly the class of bug the KEEL day boundary exists for.
  assertEquals(
    localDateInZone("Europe/Paris", new Date("2026-07-27T23:30:00Z")),
    "2026-07-28",
  );
  assertEquals(
    localDateInZone("America/New_York", new Date("2026-07-27T23:30:00Z")),
    "2026-07-27",
  );
  for (const bad of ["", "   ", "Mars/Olympus_Mons"]) {
    let threw = false;
    try {
      localDateInZone(bad, NOW);
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  }
});

// ---------------------------------------------------------------------------
// The sequence
// ---------------------------------------------------------------------------

Deno.test("happy path: download -> upload -> read-back -> event row -> one acknowledgement", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec));

  assertEquals(handled, true);
  assertEquals(rec.fetched, ["MEDIA_1"]);

  // Upload went to the right private bucket, with the real bytes.
  assertEquals(rec.uploads.length, 1);
  assertEquals(rec.uploads[0].bucket, MEAL_PHOTO_BUCKET);
  assertEquals(rec.uploads[0].size, 3);
  assertEquals(rec.uploads[0].path.startsWith(`${USER_ID}/`), true);

  // Exactly one fact.
  assertEquals(rec.events.length, 1);
  const event = rec.events[0];
  assertEquals(event.source, "photo");
  assertEquals(event.user_id, USER_ID);
  assertEquals(event.media_path, rec.uploads[0].path);
  assertEquals(event.local_date, "2026-07-27");
  assertEquals(event.student_note, "lunch");
  assertEquals(event.evidence_weight, MEAL_PHOTO_EVIDENCE_WEIGHT);
  // Idempotence key of the schema, not of the code.
  assertEquals(event.source_message_id, WAMID);
  // R2: the row states its own language.
  assertEquals(typeof event.content_locale, "string");
  assertEquals(String(event.content_locale).length > 0, true);

  // CONTRACT non-input #4 + "unknown is first-class": a photo is evidence, not
  // a measurement, and the slot is never guessed from the wall clock.
  assertEquals(event.quantity, null);
  assertEquals(event.unit, null);
  assertEquals(event.substance_ref, null);
  // NULL at insert, and for two DIFFERENT reasons that must not be conflated:
  //  - `food_group_ref` is null because nothing has been read from the image
  //    yet. `analyze-meal-photo-v1` fills it (exactly one detected group that
  //    the day's plan asks for). It used to be null forever, which is why a
  //    photo of berries could not credit a berries line.
  //  - `slot_key` is null because an inbound photo message carries no slot, and
  //    "19:10 therefore dinner" is an inference, not a fact. The web path does
  //    fill it, from the slot the student tapped.
  assertEquals(event.food_group_ref, null);
  assertEquals(event.slot_key, null);
  // No explicit binding on this surface: nothing was tapped.
  assertEquals(event.commitment_id, null);

  // Exactly one acknowledgement, quoting the read-back row.
  assertEquals(rec.replies.length, 1);
  assertEquals(rec.replies[0].purpose, MEAL_PHOTO_PURPOSE);
  assertEquals(rec.replies[0].metadata?.protocol_event_id, "event-1");
  assertEquals(rec.replies[0].metadata?.analyzed, false);
});

Deno.test("the tier gate is enforced HERE, before a single byte is downloaded", async () => {
  for (const tier of ["none", "system"]) {
    const rec = recorder();
    const handled = await run(makePorts(rec, { resolve_tier: () => Promise.resolve(tier) }));

    // Declines the turn: index.ts's existing fallback answers, and the paywall
    // copy stays in exactly one place.
    assertEquals(handled, false);
    // The expensive half never ran — this is the free-model-access leak.
    assertEquals(rec.fetched.length, 0);
    assertEquals(rec.uploads.length, 0);
    assertEquals(rec.events.length, 0);
    assertEquals(rec.replies.length, 0);
  }
});

Deno.test("an active trial passes the gate even on tier none", async () => {
  const rec = recorder();
  const handled = await run(
    makePorts(rec, { resolve_tier: () => Promise.resolve("none") }),
    { trial_end: "2026-08-15T00:00:00Z" },
  );
  assertEquals(handled, true);
  assertEquals(rec.events.length, 1);
});

Deno.test("an unresolvable tier fails CLOSED", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    resolve_tier: () => Promise.reject(new Error("billing down")),
  }));
  assertEquals(handled, false);
  assertEquals(rec.fetched.length, 0);
  assertEquals(rec.events.length, 0);
});

Deno.test("rate limit: both windows are checked, and a block consumes the turn without cost", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    check_rate_limit(input) {
      rec.rate_keys.push(input.key);
      return Promise.resolve({
        allowed: input.window_seconds !== 600,
        retry_after_seconds: 42,
      });
    },
  }));

  assertEquals(handled, true);
  // Blocked on the burst window: nothing downloaded, nothing written.
  assertEquals(rec.fetched.length, 0);
  assertEquals(rec.uploads.length, 0);
  assertEquals(rec.events.length, 0);
  // One message, and it does not claim the photo was saved.
  assertEquals(rec.replies.length, 1);
  assertEquals(rec.replies[0].purpose, MEAL_PHOTO_RATE_LIMIT_PURPOSE);

  // Unblocked: both windows are consulted, keyed per user.
  const rec2 = recorder();
  await run(makePorts(rec2));
  assertEquals(rec2.rate_keys.length, 2);
  assertEquals(rec2.rate_keys.every((k) => k.includes(USER_ID)), true);
});

Deno.test("a failed download says nothing and writes nothing", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    fetch_media: (mediaId) =>
      Promise.resolve({
        ok: false as const,
        media_id: mediaId,
        stage: "binary" as const,
        http_status: 404,
        error: { message: "expired" },
        retryable: false,
        transport: "graph" as const,
      }),
  }));
  assertEquals(handled, false);
  assertEquals(rec.uploads.length, 0);
  assertEquals(rec.events.length, 0);
  assertEquals(rec.replies.length, 0);
});

Deno.test("an upload that is not readable back never becomes a media_path", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    storage: {
      upload(input) {
        rec.uploads.push({
          bucket: input.bucket,
          path: input.path,
          content_type: input.content_type,
          size: input.bytes.byteLength,
        });
        // The API said "fine"...
        return Promise.resolve({ ok: true as const, path: input.path });
      },
      // ...and the bucket does not have it. A media_path pointing at nothing is
      // worse than no row: the coach's evidence link would 404.
      exists: () => Promise.resolve(false),
    },
  }));
  assertEquals(handled, false);
  assertEquals(rec.uploads.length, 1);
  assertEquals(rec.events.length, 0);
  assertEquals(rec.replies.length, 0);
});

Deno.test("a failed insert produces no acknowledgement (no phantom commit)", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    write_protocol_event: () => Promise.reject(new Error("insert exploded")),
  }));
  assertEquals(handled, false);
  assertEquals(rec.replies.length, 0);
});

Deno.test("a read-back row for another user is refused", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    write_protocol_event: (input) =>
      Promise.resolve({
        outcome: "inserted" as const,
        row: {
          id: "event-1",
          user_id: "99999999-9999-4999-8999-999999999999",
          local_date: input.local_date,
          occurred_at: input.occurred_at,
          slot_key: null,
          source: "photo",
          source_message_id: input.source_message_id,
          bound_commitment_id: null,
          // READ-BACK identity of the fact (contract.ts). The WhatsApp path
          // inserts both NULL: the image has not been read yet, and
          // `analyze-meal-photo-v1` writes the credit afterwards.
          food_group_ref: null,
          substance_ref: null,
        },
      }),
  }));
  assertEquals(handled, false);
  assertEquals(rec.replies.length, 0);
});

Deno.test("a re-delivered webhook acknowledges the existing fact exactly once", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    write_protocol_event: (input) =>
      Promise.resolve({
        // The partial unique index (user_id, source_message_id) already holds it.
        outcome: "already_logged" as const,
        row: {
          id: "event-1",
          user_id: input.user_id,
          local_date: input.local_date,
          occurred_at: input.occurred_at,
          slot_key: null,
          source: "photo",
          source_message_id: input.source_message_id,
          bound_commitment_id: null,
          // READ-BACK identity of the fact (contract.ts). The WhatsApp path
          // inserts both NULL: the image has not been read yet, and
          // `analyze-meal-photo-v1` writes the credit afterwards.
          food_group_ref: null,
          substance_ref: null,
        },
      }),
  }));
  assertEquals(handled, true);
  assertEquals(rec.replies.length, 1);
  assertEquals(rec.replies[0].metadata?.outcome, "already_logged");
});

Deno.test("the acknowledgement quotes the DATABASE local_date, not the request", async () => {
  const rec = recorder();
  await run(makePorts(rec, {
    write_protocol_event: (input) =>
      Promise.resolve({
        outcome: "inserted" as const,
        row: {
          id: "event-1",
          user_id: input.user_id,
          // The database normalized the day to something else.
          local_date: "2026-07-28",
          occurred_at: input.occurred_at,
          slot_key: null,
          source: "photo",
          source_message_id: input.source_message_id,
          bound_commitment_id: null,
          // READ-BACK identity of the fact (contract.ts). The WhatsApp path
          // inserts both NULL: the image has not been read yet, and
          // `analyze-meal-photo-v1` writes the credit afterwards.
          food_group_ref: null,
          substance_ref: null,
        },
      }),
  }));
  assertEquals(rec.replies[0].metadata?.local_date, "2026-07-28");
});

// ---------------------------------------------------------------------------
// W5.2 seam
// ---------------------------------------------------------------------------

Deno.test("with no verdict, the reply claims nothing about the photo's content", async () => {
  const rec = recorder();
  await run(makePorts(rec));
  const body = rec.replies[0].body.toLowerCase();
  // No calories, ever (CONTRACT non-input #4), and no compliance verdict from a
  // pass that does not exist yet.
  for (const forbidden of ["kcal", "calorie", "protein", "compliant", "conforme"]) {
    assertEquals(body.includes(forbidden), false);
  }
  assertEquals(rec.replies[0].metadata?.analyzed, false);
});

Deno.test("the W5.2 verdict is appended when the port is present", async () => {
  const rec = recorder();
  await run(makePorts(rec, {
    analyze_meal_photo: (input) => {
      rec.analyses += 1;
      // The analysis sees the committed row, not a hopeful request.
      assertEquals(input.protocol_event_id, "event-1");
      assertEquals(input.media_path.startsWith(`${USER_ID}/`), true);
      assertEquals(input.caption, "lunch");
      return Promise.resolve("Vegetables and a protein source are both there.");
    },
  }));
  assertEquals(rec.analyses, 1);
  assertEquals(
    rec.replies[0].body.includes("Vegetables and a protein source are both there."),
    true,
  );
  assertEquals(rec.replies[0].metadata?.analyzed, true);
});

Deno.test("a failing analysis never un-commits the fact nor blocks the acknowledgement", async () => {
  const rec = recorder();
  const handled = await run(makePorts(rec, {
    analyze_meal_photo: () => Promise.reject(new Error("vision model down")),
  }));
  assertEquals(handled, true);
  assertEquals(rec.events.length, 1);
  assertEquals(rec.replies.length, 1);
  assertEquals(rec.replies[0].metadata?.analyzed, false);
});

Deno.test("the default analysis port calls analyze-meal-photo-v1 and degrades to 'saved'", async () => {
  const envPermission = await Deno.permissions.query({ name: "env" });
  if (envPermission.state !== "granted") return;

  const envKeys = ["INTERNAL_FUNCTION_SECRET", "SECRET_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const snapshot = Object.fromEntries(envKeys.map((k) => [k, Deno.env.get(k)]));
  const originalFetch = globalThis.fetch;
  Deno.env.set("INTERNAL_FUNCTION_SECRET", "internal-secret");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.delete("SUPABASE_ANON_KEY");

  const seen: Array<{ url: string; body: any; secret: string | undefined }> = [];
  const respond = (status: number, payload: unknown) =>
    ((input: string | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")),
        secret: headers["X-Internal-Secret"],
      });
      return Promise.resolve(new Response(JSON.stringify(payload), { status }));
    }) as typeof fetch;

  try {
    // --- verdict returned -------------------------------------------------
    globalThis.fetch = respond(200, {
      ok: true,
      status: "analyzed",
      student_message: "I see salmon, broccoli.",
    });
    const rec = recorder();
    const ports = makePorts(rec);
    delete (ports as Record<string, unknown>).analyze_meal_photo;
    assertEquals(await run(ports), true);

    assertEquals(seen.length, 1);
    assertEquals(
      seen[0].url,
      "https://example.supabase.co/functions/v1/analyze-meal-photo-v1",
    );
    assertEquals(seen[0].secret, "internal-secret");
    assertEquals(seen[0].body.protocol_event_id, "event-1");
    assertEquals(seen[0].body.mime_type, "image/jpeg");
    // Bytes travel inline: no bucket round-trip for a photo already in memory.
    assertEquals(typeof seen[0].body.base64, "string");
    assertEquals(seen[0].body.base64.length > 0, true);
    assertEquals(rec.replies[0].body.includes("I see salmon, broccoli."), true);
    assertEquals(rec.replies[0].metadata?.analyzed, true);

    // --- analysis 500: the fact stands, the reading does not --------------
    seen.length = 0;
    globalThis.fetch = respond(500, { ok: false, error: "vision down" });
    const rec2 = recorder();
    const ports2 = makePorts(rec2);
    delete (ports2 as Record<string, unknown>).analyze_meal_photo;
    assertEquals(await run(ports2), true);
    assertEquals(rec2.events.length, 1);
    assertEquals(rec2.replies.length, 1);
    assertEquals(rec2.replies[0].metadata?.analyzed, false);

    // --- `already_analyzed` replay carries no student_message -------------
    globalThis.fetch = respond(200, { ok: true, status: "already_analyzed" });
    const rec3 = recorder();
    const ports3 = makePorts(rec3);
    delete (ports3 as Record<string, unknown>).analyze_meal_photo;
    assertEquals(await run(ports3), true);
    assertEquals(rec3.replies[0].metadata?.analyzed, false);

    // --- no internal secret: skipped, never attempted ---------------------
    Deno.env.delete("INTERNAL_FUNCTION_SECRET");
    Deno.env.delete("SECRET_KEY");
    seen.length = 0;
    const rec4 = recorder();
    const ports4 = makePorts(rec4);
    delete (ports4 as Record<string, unknown>).analyze_meal_photo;
    assertEquals(await run(ports4), true);
    assertEquals(seen.length, 0);
    assertEquals(rec4.replies[0].metadata?.analyzed, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

Deno.test("non-image media and id-less media are declined, untouched", async () => {
  for (
    const media of [
      { ...PHOTO, media_type: "audio" as const },
      { ...PHOTO, media_type: "document" as const },
      { ...PHOTO, id: "  " },
    ]
  ) {
    const rec = recorder();
    const handled = await run(makePorts(rec), { media });
    assertEquals(handled, false);
    assertEquals(rec.rate_keys.length, 0);
    assertEquals(rec.replies.length, 0);
  }
});

// ---------------------------------------------------------------------------
// End-to-end through the REAL fetchWhatsAppMedia, with fetch mocked
// ---------------------------------------------------------------------------

Deno.test("end-to-end with a mocked fetch: Graph bytes reach the bucket and the row", async () => {
  const envPermission = await Deno.permissions.query({ name: "env" });
  if (envPermission.state !== "granted") return;

  const envKeys = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_DELIVERY_ENABLED",
    "MEGA_TEST_MODE",
    "SUPABASE_URL",
    "SUPABASE_INTERNAL_HOST_PORT",
  ];
  const snapshot = Object.fromEntries(envKeys.map((k) => [k, Deno.env.get(k)]));
  const originalFetch = globalThis.fetch;
  Deno.env.set("MEGA_TEST_MODE", "0");
  Deno.env.set("WHATSAPP_DELIVERY_ENABLED", "1");
  Deno.env.set("WHATSAPP_ACCESS_TOKEN", "test-token");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_INTERNAL_HOST_PORT");

  const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16]);
  globalThis.fetch = ((input: string | URL) => {
    const url = String(input);
    if (url.startsWith("https://graph.facebook.com/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            url: "https://lookaside.fbsbx.com/x?mid=SIGNED",
            mime_type: "image/jpeg",
            sha256: "deadbeef",
            file_size: jpeg.byteLength,
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(
      new Response(
        jpeg.buffer.slice(0, jpeg.byteLength) as ArrayBuffer,
        { status: 200, headers: { "content-type": "image/jpeg" } },
      ),
    );
  }) as typeof fetch;

  try {
    const rec = recorder();
    // `fetch_media` deliberately NOT injected: the default port runs.
    const ports = makePorts(rec);
    delete (ports as Record<string, unknown>).fetch_media;
    const handled = await run(ports);

    assertEquals(handled, true);
    assertEquals(rec.uploads.length, 1);
    assertEquals(rec.uploads[0].size, jpeg.byteLength);
    assertEquals(rec.uploads[0].content_type, "image/jpeg");
    assertEquals(rec.uploads[0].path.endsWith(".jpg"), true);
    assertEquals(rec.events[0].media_path, rec.uploads[0].path);
    assertEquals(rec.replies.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});

Deno.test("an unexpected exception degrades to 'declined', never to silence", async () => {
  // The webhook's per-message catch logs and moves on, which would skip the
  // fallback reply entirely. Anything that escapes must come back as false.
  for (
    const ports of [
      makePorts(recorder(), {
        check_rate_limit: () => {
          throw new Error("rpc socket died");
        },
      }),
      makePorts(recorder(), {
        storage: {
          upload: () => {
            throw new Error("storage exploded");
          },
          exists: () => Promise.resolve(true),
        },
      }),
      makePorts(recorder(), {
        send_reply: () => {
          throw new Error("graph exploded");
        },
      }),
    ]
  ) {
    assertEquals(await run(ports), false);
  }
});
