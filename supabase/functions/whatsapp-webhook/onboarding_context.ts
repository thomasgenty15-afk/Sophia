import type { ProfileFacts, OnboardingMemory } from "./onboarding_helpers.ts"

export function buildWhatsAppOnboardingContext(params: {
  state: string
  siteUrl: string
  supportEmail: string
  // For quick, explicit policy toggles.
  planPolicy: "no_plan" | "plan_active" | "unknown"
  phase: "onboarding" | "support_fallback"
  // NEW: Personalization data
  profileFacts?: ProfileFacts
  memories?: OnboardingMemory[]
  isReturningUser?: boolean
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
    "- Liens/URLs: quand tu mentionnes le site, copie-colle EXACTEMENT le lien fourni sur la ligne `Lien:` ci-dessous. Ne le reformule pas, ne raccourcis pas le domaine, n'invente pas d'autre URL.",
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

  // Build personalization section
  const personalization = buildPersonalizationSection(params.profileFacts, params.memories, params.isReturningUser)

  const sections = [
    "=== WHATSAPP ONBOARDING MODE (CONTEXT) ===",
    `STATE: ${state}`,
    phaseLine,
    planLine,
    policy,
    sync,
  ]

  if (personalization) {
    sections.push(personalization)
  }

  return sections.join("\n")
}

function buildPersonalizationSection(
  profileFacts?: ProfileFacts,
  memories?: OnboardingMemory[],
  isReturningUser?: boolean,
): string {
  const lines: string[] = []

  // Style preferences
  const hasStylePrefs = profileFacts && (profileFacts.tone || profileFacts.verbosity || profileFacts.useEmojis)
  if (hasStylePrefs) {
    lines.push("")
    lines.push("=== STYLE PERSONNALISÉ (confirmé par user) ===")
    if (profileFacts!.tone) lines.push(`- Ton: ${profileFacts!.tone}`)
    if (profileFacts!.verbosity) lines.push(`- Longueur: ${profileFacts!.verbosity}`)
    if (profileFacts!.useEmojis) lines.push(`- Emojis: ${profileFacts!.useEmojis}`)
    lines.push("(Adapte ton style en conséquence, sans le mentionner explicitement.)")
  }

  // Schedule/energy context (useful for timing suggestions)
  const hasSchedule = profileFacts && (profileFacts.wakeTime || profileFacts.sleepTime || profileFacts.energyPeaks || profileFacts.workHours)
  if (hasSchedule) {
    lines.push("")
    lines.push("=== CONTEXTE RYTHME (pour timing) ===")
    if (profileFacts!.wakeTime) lines.push(`- Réveil: ${profileFacts!.wakeTime}`)
    if (profileFacts!.sleepTime) lines.push(`- Coucher: ${profileFacts!.sleepTime}`)
    if (profileFacts!.energyPeaks) lines.push(`- Énergie max: ${profileFacts!.energyPeaks}`)
    if (profileFacts!.workHours) lines.push(`- Horaires travail: ${profileFacts!.workHours}`)
  }

  // Personal context
  const hasPersonal = profileFacts && (profileFacts.job || profileFacts.hobbies || profileFacts.family)
  if (hasPersonal) {
    lines.push("")
    lines.push("=== CONTEXTE PERSO (pour références subtiles) ===")
    if (profileFacts!.job) lines.push(`- Métier: ${profileFacts!.job}`)
    if (profileFacts!.hobbies) lines.push(`- Loisirs: ${profileFacts!.hobbies}`)
    if (profileFacts!.family) lines.push(`- Famille: ${profileFacts!.family}`)
  }

  // Memories (for reference to past discussions)
  if (memories && memories.length > 0) {
    lines.push("")
    lines.push("=== SOUVENIRS RÉCENTS (pour continuité) ===")
    for (const m of memories.slice(0, 3)) {
      lines.push(`- [${m.date}] ${m.content}`)
    }
    lines.push("(Tu peux faire référence à ces souvenirs naturellement si pertinent.)")
  }

  // Returning user flag
  if (isReturningUser) {
    lines.push("")
    lines.push("=== USER REVENANT ===")
    lines.push("- L'utilisateur a déjà interagi avec Sophia (web ou WhatsApp).")
    lines.push("- Adapte le welcome: pas besoin de tout réexpliquer, sois plus direct.")
    lines.push("- Exemple: \"Content de te retrouver ici !\" au lieu de longue intro.")
  }

  return lines.length > 0 ? lines.join("\n") : ""
}

// ═══════════════════════════════════════════════════════════════════════════════
// URGENCY/CONTEXT DETECTION CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

export type OnboardingFlow = "normal" | "urgent" | "serious_topic" | "deferred"

export function buildAdaptiveOnboardingContext(params: {
  flow: OnboardingFlow
  state: string
  siteUrl: string
  supportEmail: string
  planPolicy: "no_plan" | "plan_active" | "unknown"
  profileFacts?: ProfileFacts
  memories?: OnboardingMemory[]
  isReturningUser?: boolean
  detectedTopic?: string
}): string {
  const baseContext = buildWhatsAppOnboardingContext({
    state: params.state,
    siteUrl: params.siteUrl,
    supportEmail: params.supportEmail,
    planPolicy: params.planPolicy,
    phase: "onboarding",
    profileFacts: params.profileFacts,
    memories: params.memories,
    isReturningUser: params.isReturningUser,
  })

  // Add flow-specific instructions
  const flowInstructions = buildFlowInstructions(params.flow, params.detectedTopic)

  return flowInstructions ? `${baseContext}\n\n${flowInstructions}` : baseContext
}

function buildFlowInstructions(flow: OnboardingFlow, detectedTopic?: string): string {
  switch (flow) {
    case "urgent":
      return [
        "=== FLOW ADAPTATIF: URGENCE DÉTECTÉE ===",
        "- L'utilisateur arrive avec une urgence ou un besoin de soutien.",
        "- SKIP la question motivation/score, va direct au soutien.",
        "- Réponds d'abord à son besoin immédiat.",
        "- Les questions d'onboarding (motivation, fait perso) seront posées plus tard.",
        "- Ton: empathique, présent, pas de formalités.",
      ].join("\n")

    case "serious_topic":
      return [
        "=== FLOW ADAPTATIF: SUJET SÉRIEUX DÉTECTÉ ===",
        detectedTopic ? `- Sujet détecté: "${detectedTopic}"` : "",
        "- L'utilisateur a un sujet important à discuter.",
        "- SKIP la question motivation, on la posera plus tard.",
        "- Accueille, puis ouvre sur son sujet avec 1 question.",
        "- Ne force pas le format \"onboarding standard\".",
      ].filter(Boolean).join("\n")

    case "deferred":
      return [
        "=== FLOW ADAPTATIF: ÉTAPES DIFFÉRÉES ===",
        "- Des étapes d'onboarding ont été différées.",
        "- C'est un bon moment pour les poser maintenant.",
        "- Intègre la question naturellement dans la conversation.",
      ].join("\n")

    default:
      return ""
  }
}
