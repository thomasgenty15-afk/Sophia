// Le contrat entrant neutre — épreuve de fonctionnement + épreuve adversariale.
//
// Les tests qui portent une décision produit, et pas seulement une branche :
//   * « un corps ambigu est refusé, pas arbitré » — le refus d'un défaut
//     silencieux est la garantie centrale de ce module ;
//   * « l'identifiant d'élève ne vient jamais du corps » — un id modifiable
//     désignerait la ligne à écrire ;
//   * « un non-image est refusé en 415 » — pattern adversarial du gantelet.

import { assertEquals } from "jsr:@std/assert@1";

import {
  ACCEPTED_MEDIA_TYPES,
  type InboundParseResult,
  MAX_CLIENT_MESSAGE_ID_LENGTH,
  MAX_MEDIA_BYTES,
  MAX_TEXT_LENGTH,
  parseInboundMessage,
} from "./inbound_message.ts";

const NOW = "2026-08-04T12:00:00.000Z";
const USER = "11111111-1111-4111-8111-111111111111";

function parse(body: unknown, userId = USER): InboundParseResult {
  return parseInboundMessage({ body, userId, nowIso: NOW });
}

function assertFail(
  result: InboundParseResult,
  status: number,
  reason: string,
) {
  if (result.ok) throw new Error(`expected failure, got ok (${reason})`);
  assertEquals(result.status, status, `status for ${reason}`);
  assertEquals(result.reason, reason);
}

function ok(result: InboundParseResult) {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.status} ${result.reason}`);
  }
  return result.message;
}

// ── FORME MINIMALE ──────────────────────────────────────────────────────────

Deno.test("text: le cas nominal produit un message neutre complet", () => {
  const msg = ok(parse({
    client_message_id: "c-1",
    kind: "text",
    text: "  I had eggs this morning  ",
  }));
  assertEquals(msg.client_message_id, "c-1");
  assertEquals(msg.user_id, USER);
  assertEquals(msg.kind, "text");
  assertEquals(msg.text, "I had eggs this morning");
  assertEquals(msg.button_payload, null);
  assertEquals(msg.media_ref, null);
  assertEquals(msg.form_response, null);
  assertEquals(msg.reply_to, null);
  assertEquals(msg.received_at, NOW);
});

Deno.test("l'identifiant d'élève vient du JWT, jamais du corps", () => {
  const msg = ok(parse({
    client_message_id: "c-1",
    kind: "text",
    text: "hello",
    // Un corps qui prétend être quelqu'un d'autre : ignoré, pas honoré.
    user_id: "22222222-2222-4222-8222-222222222222",
  }));
  assertEquals(msg.user_id, USER);
});

Deno.test("sans utilisateur authentifié, rien ne passe", () => {
  assertFail(parse({ client_message_id: "c", kind: "text", text: "x" }, ""), 400, "missing_user");
});

Deno.test("corps non-objet: refusé", () => {
  assertFail(parse(null), 400, "body_not_an_object");
  assertFail(parse("a string"), 400, "body_not_an_object");
  assertFail(parse([1, 2]), 400, "body_not_an_object");
});

// ── IDEMPOTENCE ─────────────────────────────────────────────────────────────

Deno.test("client_message_id: obligatoire et borné", () => {
  assertFail(parse({ kind: "text", text: "x" }), 400, "missing_client_message_id");
  assertFail(parse({ client_message_id: "   ", kind: "text", text: "x" }), 400, "missing_client_message_id");
  assertFail(
    parse({
      client_message_id: "x".repeat(MAX_CLIENT_MESSAGE_ID_LENGTH + 1),
      kind: "text",
      text: "x",
    }),
    400,
    "client_message_id_too_long",
  );
  // La borne EXACTE passe : une borne testée un cran à côté ne borne rien.
  ok(parse({
    client_message_id: "x".repeat(MAX_CLIENT_MESSAGE_ID_LENGTH),
    kind: "text",
    text: "x",
  }));
});

Deno.test("le même corps produit deux fois le même identifiant de dedup", () => {
  const body = { client_message_id: "retry-me", kind: "text", text: "hello" };
  assertEquals(ok(parse(body)).client_message_id, ok(parse(body)).client_message_id);
});

// ── KIND: PAS DE DEVINETTE ──────────────────────────────────────────────────

Deno.test("kind: absent ou inconnu, jamais deviné", () => {
  assertFail(parse({ client_message_id: "c", text: "x" }), 400, "missing_kind");
  assertFail(parse({ client_message_id: "c", kind: "voice", text: "x" }), 400, "unknown_kind");
  // Le piège : un corps qui « ressemble » à un media n'en est pas un.
  assertFail(
    parse({ client_message_id: "c", media_ref: { path: "a.jpg", content_type: "image/jpeg", size_bytes: 10 } }),
    400,
    "missing_kind",
  );
});

Deno.test("un corps ambigu est REFUSÉ, pas arbitré", () => {
  const base = { client_message_id: "c" };
  const media = { path: "u/a.jpg", content_type: "image/jpeg", size_bytes: 10 };
  assertFail(parse({ ...base, kind: "text", text: "x", button_payload: "B" }), 400, "text_with_button_payload");
  assertFail(parse({ ...base, kind: "text", text: "x", media_ref: media }), 400, "text_with_media_ref");
  assertFail(parse({ ...base, kind: "text", text: "x", form_response: { a: 1 } }), 400, "text_with_form_response");
  assertFail(parse({ ...base, kind: "button", button_payload: "B", media_ref: media }), 400, "button_with_media_ref");
  assertFail(parse({ ...base, kind: "button", button_payload: "B", form_response: {} }), 400, "button_with_form_response");
  assertFail(parse({ ...base, kind: "media", media_ref: media, button_payload: "B" }), 400, "media_with_button_payload");
  assertFail(parse({ ...base, kind: "media", media_ref: media, form_response: {} }), 400, "media_with_form_response");
  assertFail(parse({ ...base, kind: "form", form_response: {}, button_payload: "B" }), 400, "form_with_button_payload");
  assertFail(parse({ ...base, kind: "form", form_response: {}, media_ref: media }), 400, "form_with_media_ref");
});

// ── TEXTE ───────────────────────────────────────────────────────────────────

Deno.test("texte: vide refusé, borne haute exacte", () => {
  assertFail(parse({ client_message_id: "c", kind: "text", text: "   " }), 400, "text_empty");
  assertFail(parse({ client_message_id: "c", kind: "text" }), 400, "text_empty");
  assertFail(
    parse({ client_message_id: "c", kind: "text", text: "x".repeat(MAX_TEXT_LENGTH + 1) }),
    413,
    "text_too_long",
  );
  assertEquals(
    ok(parse({ client_message_id: "c", kind: "text", text: "x".repeat(MAX_TEXT_LENGTH) })).text.length,
    MAX_TEXT_LENGTH,
  );
});

Deno.test("langue: FR et EN passent identiquement (accents, apostrophes)", () => {
  // L'accident du test FR-only: une garde testée dans une seule langue est une
  // garde à moitié testée. Les deux formes traversent le même chemin.
  assertEquals(ok(parse({ client_message_id: "fr", kind: "text", text: "J'ai mangé des œufs — ça allait" })).text, "J'ai mangé des œufs — ça allait");
  assertEquals(ok(parse({ client_message_id: "en", kind: "text", text: "I didn't eat breakfast" })).text, "I didn't eat breakfast");
});

// ── BOUTON ──────────────────────────────────────────────────────────────────

Deno.test("bouton: le payload est obligatoire et exact", () => {
  assertFail(parse({ client_message_id: "c", kind: "button", text: "Rough" }), 400, "button_missing_payload");
  const msg = ok(parse({
    client_message_id: "c",
    kind: "button",
    button_payload: "keel_pulse_level:hard",
    text: "Rough",
  }));
  assertEquals(msg.button_payload, "keel_pulse_level:hard");
  assertEquals(msg.text, "Rough");
});

Deno.test("bouton sans libellé: le payload sert de trace, pas d'entrée LLM", () => {
  const msg = ok(parse({ client_message_id: "c", kind: "button", button_payload: "keel_pulse_level:hard" }));
  assertEquals(msg.text, "keel_pulse_level:hard");
  assertEquals(msg.button_payload, "keel_pulse_level:hard");
});

// ── MEDIA ───────────────────────────────────────────────────────────────────

const GOOD_MEDIA = { path: "u/2026-08-04/a.jpg", content_type: "image/jpeg", size_bytes: 1024 };

Deno.test("media: le cas nominal, légende facultative", () => {
  const msg = ok(parse({ client_message_id: "c", kind: "media", media_ref: GOOD_MEDIA }));
  assertEquals(msg.text, "");
  assertEquals(msg.media_ref, GOOD_MEDIA);

  const withCaption = ok(parse({
    client_message_id: "c2",
    kind: "media",
    media_ref: GOOD_MEDIA,
    text: "lunch",
  }));
  assertEquals(withCaption.text, "lunch");
});

Deno.test("media: TOUS les types acceptés le sont vraiment", () => {
  for (const type of ACCEPTED_MEDIA_TYPES) {
    const msg = ok(parse({
      client_message_id: `c-${type}`,
      kind: "media",
      media_ref: { ...GOOD_MEDIA, content_type: type },
    }));
    assertEquals(msg.media_ref?.content_type, type);
  }
});

Deno.test("media: un non-image est refusé en 415 (pattern adversarial)", () => {
  for (const type of ["application/pdf", "text/html", "application/octet-stream", "video/mp4", "image/svg+xml"]) {
    assertFail(
      parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, content_type: type } }),
      415,
      "media_ref_unsupported_content_type",
    );
  }
});

Deno.test("media: le content-type est normalisé en minuscules avant l'allow-list", () => {
  // Sans ça, "IMAGE/JPEG" tombait en 415 sur une photo parfaitement valide.
  const msg = ok(parse({
    client_message_id: "c",
    kind: "media",
    media_ref: { ...GOOD_MEDIA, content_type: "IMAGE/JPEG" },
  }));
  assertEquals(msg.media_ref?.content_type, "image/jpeg");
});

Deno.test("media: chemin hostile refusé (URL, absolu, remontée)", () => {
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, path: "https://evil/x.jpg" } }), 400, "media_ref_path_is_a_url");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, path: "s3://b/x.jpg" } }), 400, "media_ref_path_is_a_url");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, path: "/etc/passwd" } }), 400, "media_ref_path_traversal");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, path: "u/../../secret.jpg" } }), 400, "media_ref_path_traversal");
});

Deno.test("media: taille invalide ou hors borne", () => {
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, size_bytes: 0 } }), 400, "media_ref_invalid_size");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, size_bytes: -1 } }), 400, "media_ref_invalid_size");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, size_bytes: 1.5 } }), 400, "media_ref_invalid_size");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, size_bytes: "1024" } }), 400, "media_ref_invalid_size");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, size_bytes: MAX_MEDIA_BYTES + 1 } }), 413, "media_ref_too_large");
  // La borne EXACTE passe.
  ok(parse({ client_message_id: "c", kind: "media", media_ref: { ...GOOD_MEDIA, size_bytes: MAX_MEDIA_BYTES } }));
});

Deno.test("media: champs manquants", () => {
  assertFail(parse({ client_message_id: "c", kind: "media" }), 400, "media_missing_ref");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: "a.jpg" }), 400, "media_ref_not_an_object");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { content_type: "image/jpeg", size_bytes: 1 } }), 400, "media_ref_missing_path");
  assertFail(parse({ client_message_id: "c", kind: "media", media_ref: { path: "a.jpg", size_bytes: 1 } }), 400, "media_ref_missing_content_type");
});

// ── FORMULAIRE ──────────────────────────────────────────────────────────────

Deno.test("form: jamais de texte visible, le jeton ne porte pas l'élève", () => {
  const msg = ok(parse({
    client_message_id: "c",
    kind: "form",
    form_response: { energy: 4, sleep: 3 },
    form_token: "2026-08-03",
    // Même si le client envoie du texte, un formulaire n'en a pas: le laisser
    // passer ferait analyser du JSON de formulaire comme une phrase d'élève.
    text: "{\"energy\":4}",
  }));
  assertEquals(msg.text, "");
  assertEquals(msg.form_response, { energy: 4, sleep: 3 });
  assertEquals(msg.form_token, "2026-08-03");
});

Deno.test("form: réponse manquante refusée, jeton facultatif", () => {
  assertFail(parse({ client_message_id: "c", kind: "form" }), 400, "form_missing_response");
  assertFail(parse({ client_message_id: "c", kind: "form", form_response: [1, 2] }), 400, "form_missing_response");
  assertEquals(ok(parse({ client_message_id: "c", kind: "form", form_response: {} })).form_token, null);
});

// ── reply_to : forme validée, existence NON garantie ────────────────────────

Deno.test("reply_to: la forme passe, l'existence n'est pas du ressort de ce module", () => {
  // Pattern (a) « prémisse fausse » : ce module ne peut PAS savoir si la cible
  // existe. Il le dit en laissant passer, et la couche suivante résout.
  const msg = ok(parse({
    client_message_id: "c",
    kind: "text",
    text: "yes",
    reply_to: "99999999-9999-4999-8999-999999999999",
  }));
  assertEquals(msg.reply_to, "99999999-9999-4999-8999-999999999999");
  assertEquals(ok(parse({ client_message_id: "c", kind: "text", text: "yes", reply_to: "  " })).reply_to, null);
});
