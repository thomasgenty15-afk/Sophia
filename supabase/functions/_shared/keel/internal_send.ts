/**
 * KEEL — appeler `whatsapp-send` depuis un cron, avec la BONNE porte.
 *
 * ── LE DÉFAUT QUE CE FICHIER EXISTE POUR RENDRE IMPOSSIBLE ────────────────
 * `whatsapp-send` est gardé par `ensureInternalRequest`, qui n'accepte QU'UNE
 * chose: l'en-tête `x-internal-secret`. Un JWT service-role ne suffit pas, et
 * il n'y a pas de repli.
 *
 * Or `supabase.functions.invoke()` envoie l'`Authorization` du client et RIEN
 * d'autre. Les deux crons KEEL (`keel-daily-pulse-v1`, `keel-weekly-flow-v1`)
 * l'appelaient ainsi: chaque envoi recevait 403, était compté en `failures`,
 * et aucun message n'est jamais parti. Constaté en local le 2026-08-03 —
 * `system_error_logs` porte trois `http_status_403` avec
 * `auth_stage: secret_guard, has_header: false`, un par tick.
 *
 * La leçon est celle de ce dépôt: un chemin d'envoi qui échoue en silence est
 * indiscernable d'un chemin qui n'a rien à envoyer. `sendKeelWhatsApp` REMONTE
 * l'erreur au lieu de la lisser, pour que le compte-rendu du job puisse la dire.
 */

function internalFunctionSecret(): string {
  const secret = (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim();
  if (secret) return secret;
  // Repli local, identique à `_shared/internal-auth.ts`.
  return (Deno.env.get("SECRET_KEY") ?? "").trim();
}

export interface KeelSendResult {
  ok: boolean;
  status: number;
  /** Le message d'erreur du serveur, tel quel. Vide quand ok. */
  error: string;
}

export async function sendKeelWhatsApp(
  payload: Record<string, unknown>,
): Promise<KeelSendResult> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const secret = internalFunctionSecret();
  // Une configuration absente est une PANNE, pas un envoi réussi: la dire ici
  // évite qu'un job rapporte « 0 échec » parce qu'il n'a jamais essayé.
  if (!supabaseUrl || !anonKey || !secret) {
    return {
      ok: false,
      status: 0,
      error: "whatsapp-send not callable: missing SUPABASE_URL, SUPABASE_ANON_KEY or INTERNAL_FUNCTION_SECRET",
    };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-internal-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) return { ok: true, status: res.status, error: "" };

  const text = await res.text().catch(() => "");
  let detail = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text);
    detail = String(parsed?.error ?? parsed?.message ?? detail);
  } catch {
    // Pas du JSON: on garde le texte brut, tronqué.
  }
  return { ok: false, status: res.status, error: `whatsapp-send ${res.status}: ${detail}` };
}
