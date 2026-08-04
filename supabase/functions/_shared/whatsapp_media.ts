/**
 * UPLOAD MÉDIA vers l'API Graph — la moitié binaire de l'envoi de document.
 *
 * WhatsApp n'accepte pas des octets dans un message. Il faut d'abord les
 * déposer sur `POST /{phone_number_id}/media`, récupérer un `media_id`, puis
 * envoyer un message qui le référence. Ce fichier fait la première moitié;
 * `whatsapp-send` fait la seconde et ne voit jamais de binaire (voir le
 * commentaire de `SendDocument` pour pourquoi la séparation est délibérée).
 *
 * ── DURÉE DE VIE ─────────────────────────────────────────────────────────
 * Un `media_id` expire (Meta annonce 30 jours). Il n'est donc PAS stocké comme
 * une adresse durable du fichier: la source de vérité reste l'objet dans le
 * bucket `meal-documents`, et un renvoi ré-uploade. Mettre le media_id en
 * cache économiserait un appel et produirait, quelques semaines plus tard, des
 * envois qui échouent sans que rien n'ait changé côté produit.
 */

const GRAPH_VERSION = "v21.0";

export class WhatsAppMediaUploadError extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(status: number, detail: string) {
    super(`[whatsapp_media] upload failed (${status}): ${detail}`);
    this.name = "WhatsAppMediaUploadError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Dépose un fichier et rend son `media_id`.
 *
 * FAIL LOUD (R7): un upload raté lève. Rendre `null` obligerait chaque appelant
 * à distinguer « pas de média » de « média raté », et ce dépôt a déjà payé le
 * prix des deux cas confondus dans une même valeur.
 */
export async function uploadWhatsAppMedia(args: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}): Promise<string> {
  const token = (Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "").trim();
  const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token || !phoneId) {
    throw new WhatsAppMediaUploadError(0, "missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", args.mimeType);
  form.append(
    "file",
    new Blob([args.bytes as unknown as BlobPart], { type: args.mimeType }),
    args.filename,
  );

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new WhatsAppMediaUploadError(res.status, text.slice(0, 500));

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WhatsAppMediaUploadError(res.status, `unparseable body: ${text.slice(0, 200)}`);
  }
  const id = String(parsed.id ?? "").trim();
  if (!id) throw new WhatsAppMediaUploadError(res.status, `no media id in ${text.slice(0, 200)}`);
  return id;
}
