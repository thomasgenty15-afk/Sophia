import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { createLinkToken } from "./wa_linking.ts"
import { getAccountEmailForProfile, maybeSendEmail } from "./wa_email.ts"

export async function handleWrongNumber(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  fullName: string
  profileEmail: string
  defaultWhatsappNumber: string
}): Promise<void> {
  const nowIso = new Date().toISOString()
  const emailNorm = (params.profileEmail ?? "").trim()

  // Remove the phone number from the profile so the user can relink from the correct phone.
  await params.admin.from("profiles").update({
    phone_number: null,
    phone_verified_at: null,
    phone_invalid: false,
    whatsapp_opted_in: false,
    whatsapp_bilan_opted_in: false,
    whatsapp_opted_out_at: nowIso,
    whatsapp_optout_reason: "wrong_number",
    whatsapp_optout_confirmed_at: null,
  }).eq("id", params.userId)

  // Send an email to the account owner with the WhatsApp link and instructions.
  // This helps recover when the user entered the wrong number.
  const targetEmail = await getAccountEmailForProfile(params.admin, params.userId, emailNorm)

  if (targetEmail) {
    // Prefer token-based relinking via wa.me prefilled message.
    const { token } = await createLinkToken(params.admin, params.userId, 30)
    const waNum = (Deno.env.get("WHATSAPP_PHONE_NUMBER") ?? params.defaultWhatsappNumber).trim()
    const waLink = `https://wa.me/${waNum}?text=${encodeURIComponent(`LINK:${token}`)}`

    const prenom = (params.fullName ?? "").split(" ")[0] || ""
    const subject = "On relie ton WhatsApp à Sophia (1 clic)"
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
        <p style="margin:0 0 14px;">Hello${prenom ? ` ${prenom}` : ""},</p>

        <p style="margin:0 0 14px;">
          Petite vérification : sur WhatsApp, quelqu’un a indiqué <strong>“Mauvais numéro”</strong> pour ton compte Sophia.
        </p>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:16px 0;">
          <p style="margin:0 0 8px;"><strong>✅ Pas de stress.</strong> On relie le bon numéro en 10 secondes :</p>
          <ol style="margin:0; padding-left:18px;">
            <li>Ouvre WhatsApp via le bouton ci-dessous</li>
            <li>Envoie le message <strong>pré-rempli</strong></li>
          </ol>
        </div>

        <p style="margin: 18px 0;">
          <a href="${waLink}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">
            Ouvrir WhatsApp et relier mon compte
          </a>
        </p>

        <p style="margin:0 0 14px; color:#475569; font-size:13px;">
          Si le message pré-rempli disparaît, réponds simplement sur WhatsApp avec l’email de ton compte Sophia — je relierai ton numéro automatiquement.
        </p>

        <p style="margin:18px 0 6px;">À tout de suite,</p>
        <p style="margin:0;"><strong>Sophia Coach</strong> <span style="color:#64748b;">— Powered by IKIZEN</span></p>
      </div>
    `
    const sendRes = await maybeSendEmail({ to: targetEmail, subject, html })
    await params.admin.from("communication_logs").insert({
      user_id: params.userId,
      channel: "email",
      type: "whatsapp_wrong_number_email",
      status: sendRes.ok ? "sent" : "failed",
      metadata: sendRes.ok
        ? { resend_id: (sendRes.data as any)?.id ?? null, wa_link_token: token }
        : { error: (sendRes as any).error, wa_link_token: token },
    })
  }
}



