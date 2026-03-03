export async function handleStopOptOut(params) {
  if (!params.enabled || params.alreadyConfirmed) return true;
  // AI everywhere: generate the STOP confirmation with the brain.
  // Keep stable wording so mechanical assertions remain meaningful.
  await params.replyWithBrain({
    admin: params.admin,
    userId: params.userId,
    fromE164: params.fromE164,
    inboundText: "STOP",
    requestId: params.requestId,
    replyToWaMessageId: params.replyToWaMessageId ?? null,
    purpose: "optout_confirmation_ai",
    whatsappMode: "normal",
    forceMode: "companion",
    contextOverride: `=== CONTEXTE WHATSAPP ===\n` + `L'utilisateur vient d'envoyer STOP.\n\n` + `CONSIGNE DE TOUR:\n` + `- Confirme clairement: "Sophia ne te contactera plus sur WhatsApp".\n` + `- Explique en 1 phrase que l'utilisateur peut reprendre depuis le site.\n` + `- Message court, sans poser de question.\n`
  });
  await params.admin.from("profiles").update({
    whatsapp_optout_confirmed_at: params.nowIso
  }).eq("id", params.userId);
  return true;
}
