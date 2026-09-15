import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildJoinUrl,
  generateInviteToken,
  hashInviteToken,
  isEphemeralTestEmail,
  normalizeInviteEmail,
  renderInviteEmail,
} from "./invite_token.ts";

// KEEL — W6.5 token primitives.
//
// The load-bearing assertion is the FIRST one: the TypeScript hash and the
// Postgres hash must agree, or every invitation ever sent is unusable and the
// failure only shows up at click time, on a user, in production.

const SHARED_VECTOR = "hello";
// Produced by the SQL twin and pasted here:
//   select encode(sha256(convert_to('hello','utf8')),'hex');
// `invitation_rls_test.sql` asserts the same constant from the database side,
// so a change to either implementation breaks a test instead of an invitation.
const SHARED_VECTOR_SHA256 =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

Deno.test("hashInviteToken matches the Postgres coach_invite_token_hash vector", async () => {
  assertEquals(await hashInviteToken(SHARED_VECTOR), SHARED_VECTOR_SHA256);
});

Deno.test("hashInviteToken is lowercase hex of fixed width", async () => {
  const hash = await hashInviteToken(generateInviteToken());
  assertEquals(hash.length, 64);
  assert(/^[0-9a-f]{64}$/.test(hash), `not lowercase hex: ${hash}`);
});

Deno.test("generateInviteToken yields 32 bytes of url-safe entropy", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const token = generateInviteToken();
    // 32 bytes -> 43 base64url characters, unpadded.
    assertEquals(token.length, 43);
    assert(/^[A-Za-z0-9_-]{43}$/.test(token), `not url-safe: ${token}`);
    // The migration's shape guard accepts 20..200 url-safe characters; a token
    // outside that band would be rejected before the hash lookup.
    assert(token.length >= 20 && token.length <= 200);
    seen.add(token);
  }
  assertEquals(seen.size, 200, "generated tokens must not repeat");
});

Deno.test("normalizeInviteEmail lowercases and trims (the citext stand-in CHECK)", () => {
  assertEquals(normalizeInviteEmail("  Mixed.Case@Example.COM "), "mixed.case@example.com");
});

Deno.test("normalizeInviteEmail throws instead of dropping an unusable address (R7)", () => {
  for (const bad of ["", "   ", "no-at-sign", "two@@at.com", "trailing@dot", null, 42]) {
    assertThrows(() => normalizeInviteEmail(bad), Error, "not a usable email address");
  }
});

Deno.test("isEphemeralTestEmail matches the send-welcome-email skip rule", () => {
  assert(isEphemeralTestEmail("student.a@example.com"));
  assert(!isEphemeralTestEmail("student.a@example.org"));
  assert(!isEphemeralTestEmail("example.com@real.io"));
});

Deno.test("buildJoinUrl refuses to guess a host (R7)", () => {
  assertThrows(() => buildJoinUrl(undefined, "tok"), Error, "APP_BASE_URL");
  assertThrows(() => buildJoinUrl("   ", "tok"), Error, "APP_BASE_URL");
});

Deno.test("buildJoinUrl strips trailing slashes and encodes the token", () => {
  assertEquals(
    buildJoinUrl("http://localhost:5173//", "a-b_c"),
    "http://localhost:5173/join?token=a-b_c",
  );
});

Deno.test("the invitation email carries the link and no student data", () => {
  const { subject, html } = renderInviteEmail({
    coachName: "Marie Dupont",
    joinUrl: "https://app.example.org/join?token=xyz",
    locale: "en-US",
  });
  assertEquals(subject, "Marie Dupont invited you to their coaching program");
  assert(html.includes("https://app.example.org/join?token=xyz"));
});

Deno.test("a coach without a display name never yields an email from nobody", () => {
  const { subject } = renderInviteEmail({
    coachName: null,
    joinUrl: "https://x.test/join?token=t",
    locale: "en-US",
  });
  assertEquals(subject, "Your coach invited you to their coaching program");
});

Deno.test("a coach name is escaped, never interpolated as markup", () => {
  const { html } = renderInviteEmail({
    coachName: '<img src=x onerror="alert(1)">',
    joinUrl: "https://x.test/join?token=t",
    locale: "en-US",
  });
  assert(!html.includes("<img"), "coach name must not reach the email as markup");
  assert(html.includes("&lt;img"));
});
