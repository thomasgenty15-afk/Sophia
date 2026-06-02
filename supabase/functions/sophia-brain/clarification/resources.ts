import type { ClarificationRequest } from "./contract.ts";

export type ClarificationPromptResource = {
  id: string;
  title: string;
  content: string;
};

function hasCandidate(request: ClarificationRequest, id: string): boolean {
  return request.candidates.some((candidate) => candidate.id === id);
}

function hasOperation(
  request: ClarificationRequest,
  operationType: string,
): boolean {
  return request.candidates.some((candidate) =>
    candidate.operation_type === operationType || candidate.id === operationType
  );
}

function hasTemporalHint(text: string): boolean {
  return /\b(demain|ce soir|ce matin|cet apres[-\s]?midi|cette nuit|matin|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i
    .test(text.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
}

function hasActionAnchorHint(text: string): boolean {
  return /\b(action|demarrage|demarrer|lancer|commencer|premier geste|truc|tache|mission|habitude)\b/i
    .test(text.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
}

function addResource(
  resources: ClarificationPromptResource[],
  resource: ClarificationPromptResource,
): void {
  if (resources.some((item) => item.id === resource.id)) return;
  resources.push(resource);
}

export function buildClarificationPromptResources(
  request: ClarificationRequest,
): ClarificationPromptResource[] {
  const resources: ClarificationPromptResource[] = [
    {
      id: "style.tutoiement",
      title: "Style obligatoire",
      content:
        "Tutoie toujours l'utilisateur. N'utilise jamais le vouvoiement dans la question visible: pas de 'souhaitez-vous', 'préférez-vous', 'votre' ou 'vos'.",
    },
  ];

  const hasProductHelp = hasCandidate(request, "product_help");
  const hasAttackCard = hasOperation(request, "prepare_attack_card");
  if (hasProductHelp) {
    addResource(resources, {
      id: "product_help.intent_slice",
      title: "Product help",
      content:
        "product_help veut dire expliquer un morceau de Sophia ou une mécanique produit. En clarification, formule cette option comme une explication courte, pas comme une action exécutée.",
    });
  }

  if (hasAttackCard) {
    addResource(resources, {
      id: "product_help.attack_card_explanation_slice",
      title: "Carte d'attaque - explication",
      content:
        "Expliquer une carte d'attaque signifie expliquer à quoi elle sert ou comment elle fonctionne: aider le user à démarrer une action difficile.",
    });
    addResource(resources, {
      id: "attack_card.prepare_action_slice",
      title: "Carte d'attaque - préparation",
      content:
        "Préparer une carte d'attaque se fait toujours pour une action concrète ou un démarrage concret. La question doit parler de 'ton action' ou 'ton démarrage', pas présenter la date comme l'objet principal.",
    });
  }

  const userText = request.user_message;
  if (hasAttackCard && hasTemporalHint(userText)) {
    addResource(resources, {
      id: "attack_card.temporal_hint_policy",
      title: "Carte d'attaque - temporalité",
      content:
        "Si le message contient un repère comme demain, matin ou soir, traite-le comme contexte de l'action. Ne demande pas 'préparer une carte pour demain'; demande plutôt si le user veut préparer une carte pour son action ou son démarrage.",
    });
  }

  if (hasAttackCard && hasActionAnchorHint(userText)) {
    addResource(resources, {
      id: "attack_card.action_anchor_hint",
      title: "Carte d'attaque - ancrage action",
      content:
        "Si le message contient action, démarrage, lancer, tâche ou truc, conserve cet ancrage dans la question: 'pour ton action' ou 'pour ton démarrage'.",
    });
  }

  return resources;
}
