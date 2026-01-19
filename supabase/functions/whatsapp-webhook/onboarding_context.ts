export function buildWhatsAppOnboardingContext(params: {
  state: string
  siteUrl: string
  supportEmail: string
  // For quick, explicit policy toggles.
  planPolicy: "no_plan" | "plan_active" | "unknown"
  phase: "onboarding" | "support_fallback"
}): string {
  const state = String(params.state ?? "").trim() || "unknown"
  const siteUrl = String(params.siteUrl ?? "").trim()
  const supportEmail = String(params.supportEmail ?? "").trim() || "sophia@sophia-coach.ai"

  const planLine =
    params.planPolicy === "no_plan"
      ? "PLAN: aucun plan actif détecté. Ne prétends pas voir un plan. Ne propose pas de créer/modifier un plan complet sur WhatsApp."
      : params.planPolicy === "plan_active"
        ? "PLAN: un plan actif est détecté. Tu peux aider à exécuter la prochaine action (petit pas), pas à refondre le plan complet."
        : "PLAN: statut incertain."

  const phaseLine =
    params.phase === "support_fallback"
      ? "OBJECTIF: l'utilisateur est bloqué (synchro/bug). Escalade support rapidement, puis continue l'accompagnement hors-app."
      : "OBJECTIF: onboarding WhatsApp (court, fluide)."

  // Critical constraints for hallucinations + WhatsApp style.
  const policy = [
    "RÈGLES CRITIQUES:",
    "- WhatsApp: messages courts, pas de markdown, pas de **gras**, 1 question max.",
    "- Anti-hallucination UI: tu ne vois pas l'écran. Interdiction d'inventer des boutons/menus/positions. Utilise des formulations génériques + lien.",
    "- Anti-boucle: si ça tourne en rond (plan non visible / latence), propose support et avance hors-app.",
    "- Support: email + capture. Ne demande pas d'envoyer une capture ici.",
  ].join("\n")

  const sync = [
    "SYNC/LATENCE:",
    "- Possible délai 1–3 min.",
    "- Proposer 1 seul essai simple: recharger / fermer-réouvrir, puis réessayer.",
    `- Lien: ${siteUrl || "(site_url_manquant)"}`,
    `- Support: ${supportEmail}`,
  ].join("\n")

  return [
    "=== WHATSAPP ONBOARDING MODE (CONTEXT) ===",
    `STATE: ${state}`,
    phaseLine,
    planLine,
    policy,
    sync,
  ].join("\n")
}




