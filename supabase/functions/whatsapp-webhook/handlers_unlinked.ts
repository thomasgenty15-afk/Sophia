import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import type { ExtractedInboundMessage } from "./wa_parse.ts"
import { createLinkToken, extractLinkToken } from "./wa_linking.ts"
import { getAccountEmailForProfile, looksLikeEmail, maybeSendEmail, normalizeEmail } from "./wa_email.ts"
import { isPhoneUniqueViolation, normalizeFrom } from "./wa_phone.ts"
import { isStopKeyword, isYesConfirm } from "./wa_text.ts"
import { sendWhatsAppText } from "./wa_whatsapp_api.ts"

export async function handleUnlinkedInbound(params: {
  admin: SupabaseClient
  msg: ExtractedInboundMessage
  fromE164: string
  ambiguous: boolean
  siteUrl: string
  supportEmail: string
  defaultWhatsappNumber: string
  linkPromptCooldownMs: number
  linkBlockNoticeCooldownMs: number
  linkMaxAttempts: number
}): Promise<void> {
  const { admin, msg, fromE164 } = params

  // Unknown number: ask for email to link, or link if the user sends an email.
  const tokenCandidate = extractLinkToken(msg.text ?? "")
  const emailCandidate = looksLikeEmail(msg.text ?? "")
  const nowIso = new Date().toISOString()
  const isConfirm = isYesConfirm(msg.text ?? "") || /^(oui|yes)$/i.test((msg.interactive_title ?? "").trim())

  // If they send STOP from an unlinked number, just acknowledge silently.
  if (isStopKeyword(msg.text ?? "", msg.interactive_id ?? null)) {
    return
  }

  // Always log inbound from unknown numbers (no user_id yet), for support/debugging.
  // Idempotent on wa_message_id.
  await admin.from("whatsapp_unlinked_inbound_messages").upsert({
    phone_e164: fromE164,
    wa_message_id: msg.wa_message_id,
    wa_type: msg.type,
    text_content: msg.text ?? "",
    interactive_id: msg.interactive_id ?? null,
    interactive_title: msg.interactive_title ?? null,
    wa_profile_name: msg.profile_name ?? null,
    raw: msg as any,
  }, { onConflict: "wa_message_id", ignoreDuplicates: true })

  const { data: linkReq, error: linkReqErr } = await admin
    .from("whatsapp_link_requests")
    .select("last_prompted_at, attempts, status, last_email_attempt, linked_user_id")
    .eq("phone_e164", fromE164)
    .maybeSingle()
  if (linkReqErr) throw linkReqErr

  // If we previously asked "are you sure?" and they confirm (or they keep sending emails),
  // we stop here and route to support.
  if (linkReq?.status === "confirm_email" && (isConfirm || Boolean(emailCandidate))) {
    const lastEmail = emailCandidate ? normalizeEmail(emailCandidate) : (linkReq?.last_email_attempt ?? "")
    const msgTxt =
      "Merci 🙏\n" +
      "Je ne retrouve pas ce compte et je préfère éviter qu'on tourne en rond ici.\n\n" +
      `Écris à ${params.supportEmail} avec:\n` +
      `- ton numéro WhatsApp: ${fromE164}\n` +
      `- l'email essayé: ${lastEmail || "—"}\n\n` +
      "On te débloque rapidement."
    const lastPromptTs = linkReq?.last_prompted_at ? new Date(linkReq.last_prompted_at).getTime() : 0
    const canNotify = !lastPromptTs || (Date.now() - lastPromptTs) > params.linkBlockNoticeCooldownMs
    if (canNotify) await sendWhatsAppText(fromE164, msgTxt)
    await admin.from("whatsapp_link_requests").upsert({
      phone_e164: fromE164,
      status: "support_required",
      last_prompted_at: nowIso,
      attempts: (linkReq?.attempts ?? 0) + 1,
      last_email_attempt: lastEmail || (linkReq?.last_email_attempt ?? null),
      updated_at: nowIso,
    }, { onConflict: "phone_e164" })
    return
  }

  // Token-based linking (preferred): LINK:<token>
  if (tokenCandidate) {
    const { data: tok, error: tokErr } = await admin
      .from("whatsapp_link_tokens")
      .select("token,user_id,status,expires_at,consumed_at")
      .eq("token", tokenCandidate)
      .maybeSingle()
    if (tokErr) throw tokErr

    const expired = tok?.expires_at ? new Date(tok.expires_at).getTime() < Date.now() : true
    const usable = tok && tok.status === "active" && !tok.consumed_at && !expired

    if (!usable) {
      const msgTxt =
        "Oups — ce lien n'est plus valide.\n" +
        "Renvoie-moi l'email de ton compte Sophia et je te renverrai un email de validation."
      await sendWhatsAppText(fromE164, msgTxt)
      return
    }

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, full_name, phone_number, phone_invalid")
      .eq("id", (tok as any).user_id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!target) {
      await sendWhatsAppText(fromE164, "Je ne retrouve pas le compte associé à ce lien. Réessaie depuis le site, ou renvoie ton email ici.")
      return
    }

    // Link phone -> profile (atomic transfer if the phone was previously verified on another profile)
    const { data: xfer, error: xferErr } = await admin.rpc("transfer_verified_phone_to_user", {
      p_user_id: (target as any).id,
      p_phone: fromE164,
    } as any)
    if (xferErr) throw xferErr

    // Best-effort: notify previous owner by email (no details, just a security heads-up).
    try {
      const oldUserId = (xfer as any)?.old_user_id ?? null
      if (oldUserId && String(oldUserId) !== String((target as any).id)) {
        const { data: oldProf } = await admin
          .from("profiles")
          .select("full_name,email")
          .eq("id", oldUserId)
          .maybeSingle()
        const oldEmail = await getAccountEmailForProfile(admin, String(oldUserId), String((oldProf as any)?.email ?? ""))
        if (oldEmail) {
          const prenom = String((oldProf as any)?.full_name ?? "").split(" ")[0] || ""
          const subject = "Sécurité : ton numéro WhatsApp a été relié à un compte Sophia"
          const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
              <p style="margin:0 0 14px;">Hello${prenom ? ` ${prenom}` : ""},</p>
              <p style="margin:0 0 14px;">
                Ton numéro WhatsApp vient d’être relié à un compte Sophia. Si c’était bien toi (changement de téléphone/numéro), rien à faire.
              </p>
              <p style="margin:0 0 14px;">
                Si ce n’était pas toi, contacte-nous tout de suite à <strong>${params.supportEmail}</strong> (en indiquant ton email et ton numéro WhatsApp).
              </p>
              <p style="margin:18px 0 6px;">Merci,</p>
              <p style="margin:0;"><strong>Sophia Coach</strong></p>
            </div>
          `
          await maybeSendEmail({ to: oldEmail, subject, html })
        }
      }
    } catch {
      // non-blocking
    }

    await admin.from("whatsapp_link_tokens").update({
      status: "consumed",
      consumed_at: nowIso,
      consumed_phone_e164: fromE164,
    }).eq("token", tokenCandidate)

    await admin.from("whatsapp_link_requests").upsert({
      phone_e164: fromE164,
      status: "linked",
      last_prompted_at: nowIso,
      attempts: (linkReq?.attempts ?? 0) + 1,
      linked_user_id: (target as any).id,
      last_email_attempt: null,
      updated_at: nowIso,
    }, { onConflict: "phone_e164" })

    const { data: activePlan } = await admin
      .from("user_plans")
      .select("content")
      .eq("user_id", (target as any).id)
      .eq("status", "active")
      .maybeSingle()

    let welcomeMsg = `Parfait ${(target as any).full_name || ""} — c'est bon, ton WhatsApp est relié à ton compte.\n\n` +
      `Tu peux te désinscrire à tout moment en répondant STOP.\n\n`

    if (activePlan && (activePlan as any).content && (activePlan as any).content.grimoireTitle) {
      welcomeMsg += `J'ai vu que tu avais activé un plan pour "${(activePlan as any).content.grimoireTitle}", c'est bien ça ? :)`
    } else {
      welcomeMsg += "J'ai pas vu de plan passer, est-ce que tu l'as bien configuré sur la plateforme ?"
    }

    await sendWhatsAppText(fromE164, welcomeMsg)
    return
  }

  if (emailCandidate) {
    const emailNorm = normalizeEmail(emailCandidate)
    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, full_name, phone_number, phone_invalid, whatsapp_opted_out_at")
      .ilike("email", emailNorm)
      .maybeSingle()
    if (tErr) throw tErr

    if (!target) {
      const prevAttempts = linkReq?.attempts ?? 0
      const nextAttempts = prevAttempts + 1

      // First failure: ask "are you sure?" (confirm step). Second: route to support.
      const isSecond = nextAttempts >= params.linkMaxAttempts
      const msgTxt = isSecond
        ? (
          "Merci 🙏\n" +
          "Je ne retrouve toujours pas de compte avec cet email.\n\n" +
          `Écris à ${params.supportEmail} avec:\n` +
          `- ton numéro WhatsApp: ${fromE164}\n` +
          `- l'email essayé: ${emailNorm}\n\n` +
          "On te débloque rapidement."
        )
        : (
          "Je ne retrouve pas de compte Sophia avec cet email.\n" +
          "Tu es sûr que c'est le bon ?\n\n" +
          "- Si oui, réponds: OUI\n" +
          "- Sinon, renvoie-moi l'email exact"
        )

      const nextStatus = isSecond ? "support_required" : "confirm_email"
      await sendWhatsAppText(fromE164, msgTxt)

      await admin.from("whatsapp_link_requests").upsert({
        phone_e164: fromE164,
        status: nextStatus,
        last_prompted_at: nowIso,
        attempts: nextAttempts,
        last_email_attempt: emailNorm,
        updated_at: nowIso,
      }, { onConflict: "phone_e164" })
      return
    }

    // SECURITY: do NOT link by email alone.
    // Always send a validation email containing a LINK:<token> prefilled WhatsApp message.
    const existingPhone = ((target as any).phone_number ?? "").trim()
    const mismatch = Boolean(existingPhone) && normalizeFrom(existingPhone) !== fromE164

    const targetEmail = await getAccountEmailForProfile(admin, (target as any).id)
    if (!targetEmail) {
      await sendWhatsAppText(
        fromE164,
        "Je retrouve ton compte, mais je n'arrive pas à t'envoyer l'email de validation.\n\n" +
        `Écris à ${params.supportEmail} avec ton numéro WhatsApp (${fromE164}) et on règle ça.`,
      )
      await admin.from("whatsapp_link_requests").upsert({
        phone_e164: fromE164,
        status: "support_required",
        last_prompted_at: nowIso,
        attempts: (linkReq?.attempts ?? 0) + 1,
        linked_user_id: (target as any).id,
        last_email_attempt: emailNorm,
        updated_at: nowIso,
      }, { onConflict: "phone_e164" })
      return
    }

    const { token } = await createLinkToken(admin, (target as any).id, 7)
    const waNum = (Deno.env.get("WHATSAPP_PHONE_NUMBER") ?? params.defaultWhatsappNumber).trim()
    const waLink = `https://wa.me/${waNum}?text=${encodeURIComponent(`LINK:${token}`)}`

    const prenom = String((target as any).full_name ?? "").split(" ")[0] || ""
    const subject = mismatch
      ? "Relier ton WhatsApp à Sophia (changement de numéro)"
      : "Relier ton WhatsApp à Sophia (validation)"
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
        <p style="margin:0 0 14px;">Hello${prenom ? ` ${prenom}` : ""},</p>

        <p style="margin:0 0 14px;">
          ${mismatch
            ? "On a trouvé ton compte Sophia, mais il est actuellement associé à un autre numéro WhatsApp."
            : "On a trouvé ton compte Sophia. Pour le relier à WhatsApp, on doit vérifier que c'est bien toi."}
        </p>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:16px 0;">
          <p style="margin:0 0 8px;"><strong>✅ Étape importante</strong> : ouvre WhatsApp via le bouton ci-dessous et <strong>garde le message pré-rempli tel quel</strong>, puis envoie-le.</p>
        </div>

        <p style="margin: 18px 0;">
          <a href="${waLink}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">
            Ouvrir WhatsApp et valider
          </a>
        </p>

        <p style="margin:0 0 14px; color:#475569; font-size:13px;">
          Si le message pré-rempli est modifié ou supprimé, on ne pourra pas effectuer la modification automatiquement.
        </p>

        <p style="margin:18px 0 6px;">À tout de suite,</p>
        <p style="margin:0;"><strong>Sophia Coach</strong> <span style="color:#64748b;">— Powered by IKIZEN</span></p>
      </div>
    `
    const sendRes = await maybeSendEmail({ to: targetEmail, subject, html })
    await admin.from("communication_logs").insert({
      user_id: (target as any).id,
      channel: "email",
      type: mismatch ? "whatsapp_link_change_number_email" : "whatsapp_link_validation_email",
      status: sendRes.ok ? "sent" : "failed",
      metadata: sendRes.ok ? { wa_link_token: token } : { error: sendRes.error, wa_link_token: token },
    })

    await admin.from("whatsapp_link_requests").upsert({
      phone_e164: fromE164,
      status: "pending",
      last_prompted_at: nowIso,
      attempts: (linkReq?.attempts ?? 0) + 1,
      linked_user_id: (target as any).id,
      last_email_attempt: emailNorm,
      updated_at: nowIso,
    }, { onConflict: "phone_e164" })

    if (!sendRes.ok) {
      await sendWhatsAppText(
        fromE164,
        "Ok, je retrouve ton compte Sophia ✅\n\n" +
        "Par contre, je n’arrive pas à t’envoyer l’email de validation pour le moment.\n" +
        `Écris à ${params.supportEmail} avec:\n` +
        `- ton numéro WhatsApp: ${fromE164}\n` +
        `- ton email: ${emailNorm}\n\n` +
        "On te débloque rapidement.",
      )
      return
    }

    await sendWhatsAppText(
      fromE164,
      mismatch
        ? (
          "Ok, je retrouve ton compte Sophia ✅\n" +
          "Par contre, il est associé à un autre numéro WhatsApp.\n\n" +
          "Je t'envoie un email avec un lien qui ouvre WhatsApp avec un message pré-rempli.\n" +
          "Important: garde le texte pré-rempli tel quel et envoie-le (sinon je ne pourrai pas faire la modification)."
        )
        : (
          "Ok, je retrouve ton compte Sophia ✅\n\n" +
          "Je t'envoie un email avec un lien qui ouvre WhatsApp avec un message pré-rempli.\n" +
          "Important: garde le texte pré-rempli tel quel et envoie-le pour valider."
        ),
    )
    return
  }

  // Anti-spam: don't prompt more than once every 10 minutes per number.
  const last = linkReq?.last_prompted_at ? new Date(linkReq.last_prompted_at).getTime() : 0
  const shouldPrompt = !last || (Date.now() - last) > params.linkPromptCooldownMs
  const isTerminal = linkReq?.status === "blocked" || linkReq?.status === "support_required"
  if (shouldPrompt && !isTerminal) {
    const prompt = params.ambiguous
      ? (
        "Bonjour ! Je suis Sophia, enchantée.\n" +
        "Je vois plusieurs comptes qui utilisent ce numéro.\n\n" +
        "Peux-tu m'envoyer l'email de ton compte Sophia pour que je relie le bon ?\n" +
        `(Si tu n'as pas encore de compte: ${params.siteUrl})`
      )
      : (
        "Bonjour ! Je suis Sophia, enchantée.\n" +
        "Je ne retrouve pas ton numéro dans mon système.\n\n" +
        "Peux-tu m'envoyer l'email de ton compte Sophia ?\n" +
        `(Si tu n'as pas encore de compte: ${params.siteUrl})`
      )
    await sendWhatsAppText(fromE164, prompt)
    await admin.from("whatsapp_link_requests").upsert({
      phone_e164: fromE164,
      status: linkReq?.status ?? "pending",
      last_prompted_at: nowIso,
      attempts: (linkReq?.attempts ?? 0) + 1,
      updated_at: nowIso,
    }, { onConflict: "phone_e164" })
  }
}


