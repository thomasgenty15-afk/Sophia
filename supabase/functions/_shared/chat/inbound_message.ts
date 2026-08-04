/**
 * LE CONTRAT ENTRANT NEUTRE — ce que le moteur de tour reçoit, quel que soit le canal.
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────────
 * Jusqu'ici il n'y avait pas d'entrant : il y avait un *webhook Meta*. Le moteur
 * de tour recevait un `wamid`, un `from_e164`, un `interactive_id`, un
 * `flow_token` — quatre noms qui ne veulent rien dire hors de WhatsApp, et qui
 * ont fait remonter Meta jusque dans `sophia-brain` (`scope: "whatsapp"`,
 * `channel: "whatsapp"`, `wa_message_id` dans les metadata).
 *
 * `InboundMessage` est la coupure. Il ne nomme AUCUN transport :
 *   - `client_message_id` remplace `wamid`   → clé de déduplication
 *   - `button_payload`    remplace `interactive_id` → identifiant EXACT
 *   - `media_ref`         remplace `media.id` Graph → chemin dans Storage
 *   - `form_response`     remplace `flow_response_json`
 *   - `reply_to`          remplace `context.id` / le wamid de réponse
 *
 * ── CE QUE CE MODULE GARANTIT, ET CE QU'IL NE GARANTIT PAS ───────────────────
 * Il garantit la FORME : un entrant mal formé est rejeté ici, avec un statut
 * HTTP et un motif, avant d'atteindre la moindre écriture. Il ne garantit RIEN
 * sur l'existence des choses désignées (`reply_to` peut pointer vers un message
 * effacé, `media_ref.path` vers un objet absent) : c'est le rôle des couches
 * suivantes, qui ont la base sous la main. Confondre les deux, c'est le pattern
 * (a) « prémisse fausse » du gantelet — valider une forme et croire avoir
 * validé un état.
 *
 * ── PAS DE DÉFAUT SILENCIEUX (pattern (g) du gantelet) ───────────────────────
 * `kind` n'est jamais deviné à partir de la présence d'un champ. Un corps qui
 * porte à la fois `text` et `media_ref` sans dire lequel compte est REFUSÉ, pas
 * arbitré. C'est la leçon de `getFallbackTemplate` : un repli silencieux sur une
 * valeur « raisonnable » a envoyé des mois de `global_reach_template` en
 * français à des élèves anglophones parce que personne ne voyait le défaut.
 */

/** Les quatre natures d'entrant. Fermée : un `kind` inconnu est un rejet. */
export const INBOUND_KINDS = ["text", "button", "media", "form"] as const;
export type InboundKind = typeof INBOUND_KINDS[number];

/** Types d'image acceptés à l'upload. Liste CLOSE (pattern adversarial « non-image »). */
export const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** 10 Mio. Au-delà, l'analyse photo coûte plus que ce qu'elle rapporte. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/** Un texte d'élève plus long que ça est un copier-coller, pas un message. */
export const MAX_TEXT_LENGTH = 4000;

/** Un identifiant client trop long est une tentative de gonfler l'index de dedup. */
export const MAX_CLIENT_MESSAGE_ID_LENGTH = 128;

export type MediaRef = {
  /** Chemin dans le bucket privé, RELATIF au bucket. Jamais une URL. */
  path: string;
  content_type: string;
  size_bytes: number;
};

export type InboundMessage = {
  /** Idempotence. Généré par le client, stable à travers les retries réseau. */
  client_message_id: string;
  user_id: string;
  kind: InboundKind;
  /**
   * Le texte VISIBLE du tour — ce qui s'affiche dans la bulle et ce que le
   * moteur lit. Pour un bouton, c'est son libellé ; pour un media, la légende
   * (possiblement vide) ; pour un formulaire, une chaîne vide.
   */
  text: string;
  /** Identifiant EXACT du bouton. Déterministe : jamais interprété par un LLM. */
  button_payload: string | null;
  media_ref: MediaRef | null;
  form_response: Record<string, unknown> | null;
  /** Le jeton du formulaire ne désigne JAMAIS l'élève, seulement la période. */
  form_token: string | null;
  /** Id du message sortant auquel l'élève répond (`chat_messages.id`). */
  reply_to: string | null;
  received_at: string;
};

export type InboundParseFailure = {
  ok: false;
  /** Statut HTTP à rendre. 400 = forme, 413 = trop gros, 415 = type refusé. */
  status: 400 | 413 | 415;
  /** Motif machine, stable, journalisable. Jamais une phrase pour l'élève. */
  reason: string;
};

export type InboundParseResult =
  | { ok: true; message: InboundMessage }
  | InboundParseFailure;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function fail(
  status: InboundParseFailure["status"],
  reason: string,
): InboundParseFailure {
  return { ok: false, status, reason };
}

function parseMediaRef(raw: unknown): MediaRef | InboundParseFailure {
  const obj = record(raw);
  if (!obj) return fail(400, "media_ref_not_an_object");

  const path = str(obj.path);
  if (!path) return fail(400, "media_ref_missing_path");
  // Un chemin est RELATIF au bucket. Refuser les URL et la remontée de
  // répertoire ici plutôt qu'au moment de la lecture : le lecteur, lui, a déjà
  // les droits service-role.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    return fail(400, "media_ref_path_is_a_url");
  }
  if (path.startsWith("/") || path.includes("..")) {
    return fail(400, "media_ref_path_traversal");
  }

  const contentType = str(obj.content_type).toLowerCase();
  if (!contentType) return fail(400, "media_ref_missing_content_type");
  if (!(ACCEPTED_MEDIA_TYPES as readonly string[]).includes(contentType)) {
    return fail(415, "media_ref_unsupported_content_type");
  }

  const sizeRaw = obj.size_bytes;
  const size = typeof sizeRaw === "number" ? sizeRaw : Number.NaN;
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(size)) {
    return fail(400, "media_ref_invalid_size");
  }
  if (size > MAX_MEDIA_BYTES) return fail(413, "media_ref_too_large");

  return { path, content_type: contentType, size_bytes: size };
}

/**
 * Construit un `InboundMessage` à partir du corps HTTP brut.
 *
 * `userId` vient du JWT vérifié, JAMAIS du corps : un identifiant d'élève qui
 * ferait l'aller-retour par le client serait un identifiant modifiable
 * désignant la ligne à écrire. (Même raison que le jeton de flow hebdo, qui ne
 * porte que la semaine.)
 */
export function parseInboundMessage(args: {
  body: unknown;
  userId: string;
  nowIso: string;
}): InboundParseResult {
  const body = record(args.body);
  if (!body) return fail(400, "body_not_an_object");

  const userId = str(args.userId);
  if (!userId) return fail(400, "missing_user");

  const clientMessageId = str(body.client_message_id);
  if (!clientMessageId) return fail(400, "missing_client_message_id");
  if (clientMessageId.length > MAX_CLIENT_MESSAGE_ID_LENGTH) {
    return fail(400, "client_message_id_too_long");
  }

  const kindRaw = str(body.kind);
  if (!kindRaw) return fail(400, "missing_kind");
  if (!(INBOUND_KINDS as readonly string[]).includes(kindRaw)) {
    return fail(400, "unknown_kind");
  }
  const kind = kindRaw as InboundKind;

  const rawText = typeof body.text === "string" ? body.text : "";
  if (rawText.length > MAX_TEXT_LENGTH) return fail(413, "text_too_long");
  const text = rawText.trim();

  const buttonPayload = str(body.button_payload) || null;
  const formResponse = record(body.form_response);
  const formToken = str(body.form_token) || null;
  const hasMedia = body.media_ref !== undefined && body.media_ref !== null;
  const replyTo = str(body.reply_to) || null;

  // ── LE REFUS D'ARBITRER ───────────────────────────────────────────────────
  // Chaque `kind` déclare exactement ce qu'il porte. Un corps qui porte les
  // champs d'un AUTRE kind est refusé, jamais silencieusement ignoré : c'est
  // ainsi qu'un bouton envoyé en `kind: "text"` se ferait interpréter par un
  // LLM au lieu d'être exécuté à l'identique.
  switch (kind) {
    case "text": {
      if (!text) return fail(400, "text_empty");
      if (buttonPayload) return fail(400, "text_with_button_payload");
      if (hasMedia) return fail(400, "text_with_media_ref");
      if (formResponse) return fail(400, "text_with_form_response");
      return {
        ok: true,
        message: {
          client_message_id: clientMessageId,
          user_id: userId,
          kind,
          text,
          button_payload: null,
          media_ref: null,
          form_response: null,
          form_token: null,
          reply_to: replyTo,
          received_at: args.nowIso,
        },
      };
    }
    case "button": {
      if (!buttonPayload) return fail(400, "button_missing_payload");
      if (hasMedia) return fail(400, "button_with_media_ref");
      if (formResponse) return fail(400, "button_with_form_response");
      return {
        ok: true,
        message: {
          client_message_id: clientMessageId,
          user_id: userId,
          kind,
          // Le libellé est de l'affichage ; à défaut, le payload sert de trace
          // lisible dans le journal, jamais d'entrée pour le classifieur.
          text: text || buttonPayload,
          button_payload: buttonPayload,
          media_ref: null,
          form_response: null,
          form_token: null,
          reply_to: replyTo,
          received_at: args.nowIso,
        },
      };
    }
    case "media": {
      if (!hasMedia) return fail(400, "media_missing_ref");
      if (buttonPayload) return fail(400, "media_with_button_payload");
      if (formResponse) return fail(400, "media_with_form_response");
      const media = parseMediaRef(body.media_ref);
      if ("ok" in media) return media;
      return {
        ok: true,
        message: {
          client_message_id: clientMessageId,
          user_id: userId,
          kind,
          // La légende est facultative : une photo sans mot est le cas normal.
          text,
          button_payload: null,
          media_ref: media,
          form_response: null,
          form_token: null,
          reply_to: replyTo,
          received_at: args.nowIso,
        },
      };
    }
    case "form": {
      if (!formResponse) return fail(400, "form_missing_response");
      if (buttonPayload) return fail(400, "form_with_button_payload");
      if (hasMedia) return fail(400, "form_with_media_ref");
      return {
        ok: true,
        message: {
          client_message_id: clientMessageId,
          user_id: userId,
          kind,
          // Un formulaire n'a PAS de texte visible : le laisser porter une
          // phrase reviendrait à faire descendre du JSON chez le classifieur,
          // ce que le bloc C4 du webhook existait pour empêcher.
          text: "",
          button_payload: null,
          media_ref: null,
          form_response: formResponse,
          form_token: formToken,
          reply_to: replyTo,
          received_at: args.nowIso,
        },
      };
    }
  }
}
