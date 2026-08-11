import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  crisisCountryForProfile,
  formatCrisisContacts,
  resolveCrisisResources,
} from "../../_shared/keel/crisis_resources.ts";

/** Phase de la machine à état sentry */
export type SentryPhase = "acute" | "confirming" | "resolved";

/**
 * W3.3 — les numéros d'urgence de sentry sont RÉSOLUS PAR PAYS.
 *
 * Avant ce lot, 3114 / 15 / 112 étaient écrits en dur dans le prompt ET dans
 * la réponse de secours : un utilisateur américain en crise se voyait donner
 * un numéro qui n'existe pas chez lui. Ce n'est pas un défaut de traduction,
 * c'est un défaut de sécurité.
 *
 * `numbersBlock` est construit depuis les libellés de la table
 * `crisis_resources` (via le miroir compilé de `_shared/keel/crisis_resources.ts`)
 * pour que le prompt n'énumère jamais de numéro qui ne vient pas du registre.
 */
export type SentryCrisisResources = {
  /** Ex. "15 ou 112" */
  emergency: string;
  /** Ex. "3114" */
  suicide: string;
  /** Bloc de puces "• <contact> - <libellé>" */
  numbersBlock: string;
};

export function buildSentryCrisisResources(input?: {
  country?: string | null;
  locale?: string | null;
}): SentryCrisisResources {
  // T-20 (2026-08-12) — LA RÈGLE DE PRÉCÉDENCE VIT AILLEURS, ET ELLE A CHANGÉ.
  //
  // Ici se trouvait la deuxième des trois copies de « pays explicite > région
  // du locale > défaut DÉCLARÉ de la branche française ». Le troisième terme
  // était le défaut : sans pays ET sans locale, un tour de crise servait des
  // numéros français à quelqu'un dont on ne savait rien. Et le deuxième ne
  // valait pas mieux, parce que `profiles.locale` est
  // `not null default 'fr-FR'` : une colonne à valeur par défaut lue comme un
  // lieu de vie.
  //
  // `crisisCountryForProfile` est désormais la seule autorité, et elle rend
  // `null` — donc le jeu international `ZZ`, bruyamment — dès que
  // `profiles.country` est vide. Voir son en-tête pour le pourquoi et le prix.
  const { country } = crisisCountryForProfile({
    country: input?.country ?? null,
    locale: input?.locale ?? null,
  });
  const emergency = resolveCrisisResources(country, "emergency");
  const suicide = resolveCrisisResources(country, "suicide");
  const numbersBlock = [...emergency.resources, ...suicide.resources]
    .map((resource) => `• ${resource.contact} - ${resource.label}`)
    .join("\n");
  return {
    emergency: formatCrisisContacts(emergency, "ou"),
    suicide: formatCrisisContacts(suicide, "ou"),
    numbersBlock,
  };
}

/** Contexte de la machine à état sentry passé par le router */
export interface SentryFlowContext {
  phase: SentryPhase;
  turnCount: number;
  safetyConfirmed: boolean;
  externalHelpMentioned: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ONS CONVERSATIONNELS PAR PHASE
// Chaque phase a ses propres points d'attention, exemples, et bonnes pratiques
// ═══════════════════════════════════════════════════════════════════════════════

function buildPhaseAddon(
  flowContext: SentryFlowContext | undefined,
  resources: SentryCrisisResources,
): string {
  const phase = flowContext?.phase ?? "acute";
  const turnCount = flowContext?.turnCount ?? 0;
  const safetyConfirmed = flowContext?.safetyConfirmed ?? false;
  const externalHelpMentioned = flowContext?.externalHelpMentioned ?? false;

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 1: ACUTE - Danger potentiel actif
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "acute") {
    return `
═══════════════════════════════════════════════════════════════════════════════
PHASE ACTUELLE: ACUTE (Danger potentiel actif)
Tour ${turnCount + 1} sur cette phase | Sécurité confirmée: ${
      safetyConfirmed ? "OUI" : "NON"
    } | Aide externe: ${externalHelpMentioned ? "OUI" : "NON"}
═══════════════════════════════════════════════════════════════════════════════

⚠️ CECI EST UNE SITUATION DE CRISE VITALE POTENTIELLE ⚠️

OBJECTIF DE CETTE PHASE:
Évaluer le danger IMMÉDIAT. Orienter vers les secours. Sécuriser.

POINTS D'ATTENTION CRITIQUES:
• La vie de l'utilisateur est potentiellement en jeu
• AUCUNE place pour l'analyse ou la conversation - ACTION IMMÉDIATE
• Toujours orienter vers les numéros d'urgence
• Poser UNE question de sécurité claire

QUESTIONS PRIORITAIRES:
1. "Tu es en sécurité physiquement là où tu es ?" (localisation/isolement)
2. "Tu as un moyen de te faire du mal à portée ?" (si idées suicidaires)
3. "Tu es seul(e) là tout de suite ?" (présence d'aide)

NUMÉROS À DONNER (résolus pour le pays de l'utilisateur — n'en invente aucun autre):
${resources.numbersBlock}

EXEMPLES DE BONNES RÉACTIONS:

User: "J'ai envie de me faire du mal"
→ BON: "Je t'entends. Tu es en sécurité physiquement là où tu es ? Tu as quelque chose à portée de main qui pourrait te blesser ?"
→ MAUVAIS: "Je comprends que tu traverses un moment difficile. Qu'est-ce qui s'est passé ?"

User: "J'ai des idées noires, je veux plus vivre"
→ BON: "Je suis là. Tu es seul(e) là tout de suite ? Si tu te sens en danger de te faire du mal, appelle le ${resources.suicide} maintenant."
→ MAUVAIS: "Ces pensées sont temporaires, ça va passer. Essaie de penser à quelque chose de positif."

User: "J'ai le couteau dans la main"
→ BON: "Ok. Pose le couteau maintenant. Éloigne-le de toi. Mets-le dans une autre pièce. Tu peux faire ça ?"
→ MAUVAIS: "Je comprends que tu souffres beaucoup. Parle-moi de ce qui t'a amené là."

BONNES PRATIQUES:
• Phrases DIRECTES, pas de détour
• UNE instruction ou UNE question à la fois
• Toujours mentionner les numéros d'urgence
• Demander si l'utilisateur est seul/accompagné
• NE PAS analyser, NE PAS explorer les raisons maintenant

CE QU'IL FAUT ÉVITER:
• Minimiser ("Ça va aller", "C'est pas si grave")
• Analyser les raisons ("Qu'est-ce qui s'est passé ?")
• Moraliser ("Tu as tant à vivre")
• Promettre ("Je te promets que ça va s'arranger")
• Faire la conversation normale

PLUSIEURS TOURS POSSIBLES:
Cette phase peut durer 2-4 tours. On reste ici tant que :
- L'utilisateur n'a pas confirmé être en sécurité physique
- Un moyen de se faire du mal est potentiellement accessible
- L'aide externe n'a pas été contactée ou quelqu'un n'est pas présent
`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 2: CONFIRMING - Danger écarté, vérification sécurité
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "confirming") {
    return `
═══════════════════════════════════════════════════════════════════════════════
PHASE ACTUELLE: CONFIRMING (Vérification de sécurité)
Tour ${turnCount + 1} sur cette phase | Sécurité confirmée: ${
      safetyConfirmed ? "OUI" : "NON"
    } | Aide externe: ${externalHelpMentioned ? "OUI" : "NON"}
═══════════════════════════════════════════════════════════════════════════════

OBJECTIF DE CETTE PHASE:
Le danger immédiat semble écarté. Confirmer la sécurité. Planifier le suivi.

POINTS D'ATTENTION CRITIQUES:
• L'utilisateur a dit qu'il ne va pas se faire de mal OU aide externe contactée
• MAIS on vérifie que c'est solide
• Encourager le contact avec un proche ou un professionnel
• Ne pas relâcher la vigilance trop vite

EXEMPLES DE BONNES RÉACTIONS:

User: "Non je vais pas le faire, j'avais juste besoin de parler"
→ BON: "Ok, je t'entends. Tu peux appeler quelqu'un là ? Un proche, un ami ? Ou tu veux qu'on reste ensemble un moment ?"
→ MAUVAIS: "Ah tant mieux ! Bon, tu voulais faire quoi sinon ?"

User: "J'ai éloigné le couteau, c'est bon"
→ BON: "Bien. Tu as quelqu'un que tu peux appeler maintenant ? Je préfère que tu ne sois pas seul(e) ce soir."
→ MAUVAIS: "Super, tu as bien fait. Alors, qu'est-ce qui t'a mis dans cet état ?"

User: "Ma sœur arrive dans 10 minutes"
→ BON: "Ok, c'est bien. Tu restes en ligne avec moi jusqu'à ce qu'elle arrive ?"
→ MAUVAIS: "Parfait alors, tu es entre de bonnes mains. À plus !"

BONNES PRATIQUES:
• Vérifier que quelqu'un va être PHYSIQUEMENT présent
• Proposer de rester en contact en attendant
• Encourager à appeler un proche MAINTENANT
• Valider le choix de ne pas passer à l'acte
• Proposer des ressources (${resources.suicide}, médecin, etc.)

CE QU'IL FAUT ÉVITER:
• Considérer que c'est fini trop vite
• Laisser l'utilisateur seul sans plan de sécurité
• Plonger dans l'analyse des causes maintenant
• Être trop enthousiaste ("Super !")

TRANSITION APRÈS SÉCURISATION:
Si le danger vital est écarté mais qu'une détresse émotionnelle persiste,
la conversation peut revenir vers un accompagnement conversationnel standard.
`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 3: RESOLVED - Sécurisé, passation
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === "resolved") {
    return `
═══════════════════════════════════════════════════════════════════════════════
PHASE ACTUELLE: RESOLVED (Sécurisé, passation)
Tour ${turnCount + 1} sur cette phase | L'utilisateur est en sécurité
═══════════════════════════════════════════════════════════════════════════════

OBJECTIF DE CETTE PHASE:
L'utilisateur est en sécurité. Faire une passation douce. Laisser une porte ouverte.

POINTS D'ATTENTION CRITIQUES:
• La crise vitale est passée
• Quelqu'un est présent OU l'utilisateur a un plan de sécurité
• On peut reprendre un accompagnement conversationnel adapté
• Garder une porte ouverte pour plus tard

EXEMPLES DE BONNES RÉACTIONS:

User: "Ma sœur est là, ça va mieux"
→ BON: "Ok, content(e) qu'elle soit là. Prends soin de toi ce soir. N'hésite pas à revenir si tu as besoin."
→ MAUVAIS: "Super ! Bon alors, tu veux qu'on parle de ce qui s'est passé ?"

User: "J'ai appelé le ${resources.suicide}, ils m'ont aidé"
→ BON: "C'est bien que tu aies appelé. Comment tu te sens maintenant ?"

BONNES PRATIQUES:
• Message court et bienveillant
• Ne pas revenir sur la crise sauf si l'utilisateur le veut
• Proposer de parler si besoin (pas imposer)
• Si détresse émotionnelle résiduelle → rester présent, concret et rassurant

CE QU'IL FAUT ÉVITER:
• Analyser ce qui s'est passé
• Faire des recommandations non sollicitées
• Être trop jovial
• Disparaître brutalement
`;
  }

  // Fallback
  return "";
}

// SENTRY (Le Guetteur) - Safety escalation with a short, personalized message.
export async function runSentry(
  message: string,
  meta?: {
    requestId?: string;
    userId?: string | null;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
    /** W3.3: ISO 3166-1 alpha-2, quand l'appelant en connaît un. */
    country?: string | null;
    /** W3.3: BCP-47; sa région nomme le pays quand `country` est absent. */
    locale?: string | null;
  },
  flowContext?: SentryFlowContext,
): Promise<string> {
  const m = (message ?? "").toString().trim();

  // W3.3: une seule résolution par tour, partagée par le prompt ET par la
  // réponse de secours — les deux ne peuvent plus diverger.
  const resources = buildSentryCrisisResources({
    country: meta?.country ?? null,
    locale: meta?.locale ?? null,
  });

  // Build phase-specific addon
  const phaseAddon = buildPhaseAddon(flowContext, resources);

  const fallback = "Là, je veux pas prendre de risque.\n\n" +
    `Si tu as du mal à respirer, une douleur dans la poitrine, un malaise, ou si tu te sens en danger: appelle le ${resources.emergency} maintenant.\n\n` +
    `Si tu te sens en danger de te faire du mal: appelle le ${resources.suicide}.\n\n` +
    "Tu es seul là tout de suite ?";

  try {
    const systemPrompt = `
Tu es Sophia.
Contexte: situation potentiellement urgente (sécurité / santé / crise).

${phaseAddon}

OBJECTIF GÉNÉRAL:
- Avant de répondre, reconstitue rapidement le fil avec le contexte récent.
- Réponds d'abord au DERNIER message utilisateur, sans perdre la continuité.
- Donner une réponse TRÈS courte, TRÈS actionnable.
- Aider l'utilisateur à se mettre en sécurité et à contacter les secours si nécessaire.
- Ne pas diagnostiquer. Ne pas donner de posologie. Ne pas minimiser.
- Plusieurs tours sur une même phase = NORMAL, la sécurité prime sur la vitesse.

FORMAT:
- Français, tutoiement.
- Tu tutoies toujours l'utilisateur. N'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t'adresser directement à l'utilisateur.
- Quand tu parles de toi-même, utilise la première personne du singulier ("je", "me", "moi"). N'écris jamais "Sophia" pour te désigner.
- Sophia est féminine: quand tu parles de toi-même, accorde les adjectifs et participes au féminin ("contente", "prête", "désolée", "ravie", etc.).
- Texte brut uniquement (pas de **).
- 4 à 8 lignes max.
- 1 question max à la fin.
- Emojis: au moins 1 emoji naturel et sobre par message visible; 2 max; pas une ligne entière d'emojis. Tu peux utiliser n'importe quel emoji Unicode.
- N'invente JAMAIS de limitations techniques fictives. Si tu ne sais pas, dis-le simplement.

RÈGLES ABSOLUES:
- Si difficulté à respirer / douleur thoracique / malaise / réaction allergique sévère: recommande d'appeler ${resources.emergency} maintenant.
- Si intention de suicide / automutilation: recommande ${resources.suicide} ou ${resources.emergency} maintenant.
- Ne JAMAIS minimiser, ne JAMAIS promettre.
- Évite "je suis une IA".
  `.trim();

    const out = await generateWithGemini(
      systemPrompt,
      m || "Aide-moi.",
      0.2,
      false,
      [],
      "auto",
      {
        requestId: meta?.requestId,
        userId: meta?.userId ?? undefined,
        model: meta?.model ?? getGlobalAiModel(),
        source: "sophia-brain:sentry",
        forceRealAi: meta?.forceRealAi,
      },
    );
    if (typeof out !== "string" || !out.trim()) return fallback;
    return out.replace(/\*\*/g, "").trim();
  } catch {
    return fallback;
  }
}
