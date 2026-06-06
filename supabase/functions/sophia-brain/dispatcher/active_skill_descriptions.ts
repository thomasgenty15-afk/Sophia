export type ActiveSkillStableDescriptionContext = {
  skill_id: string;
  instruction: string;
  description: string;
};

const ACTIVE_SKILL_STABLE_DESCRIPTIONS: Record<string, string> = {
  emotional_repair: `Skill / Handoff:
- emotional_repair

Rôle:
- réparer l’émotion quand honte, culpabilité, auto-attaque, anxiété ou besoin de douceur dominent.

Suites naturelles possibles:
- rester en soutien émotionnel;
- proposer une potion seulement après stabilisation;
- préparer une carte si l’émotion baisse et qu’un besoin concret émerge.

Infos utiles au dispatcher:
- dans ce skill, “support”, “aide dans Sophia”, “un truc pour m’aider” peut signaler une potion, pas product_help;
- bridges potions: amour = douceur envers soi; guérison = réparer après honte/culpabilité; apaisement = pression/tension à faire redescendre;
- si le user demande un support d’action après stabilisation: carte d’attaque pour blocage ponctuel, carte de défense pour risque récurrent.`,

  demotivation_repair: `Skill / Handoff:
- demotivation_repair

Rôle:
- réparer l’élan quand fatigue motivationnelle, perte de sens, évitement, surcharge ou accumulation d’échecs dominent.

Suites naturelles possibles:
- clarifier ce qui casse l’élan;
- proposer une potion si le besoin durable est identifié;
- préparer une carte ou un ajustement seulement si le besoin opérationnel devient clair.

Infos utiles au dispatcher:
- dans ce skill, “il n’y a pas un support sur la plateforme ?”, “un outil Sophia”, “un truc pour continuer” signale souvent une potion;
- bridges potions: clarté = retrouver le sens/cap; courage = peur ou évitement identifié; rappel = anti-décrochage quand le cap est déjà connu;
- “changer le plan” ne doit monter vers adjust plan que si le user demande explicitement d’alléger/modifier; sinon la fatigue reste traitée ici.`,

  product_help: `Skill / Handoff:
- product_help

Rôle:
- expliquer Sophia comme produit: fonctionnement, localisation, limites, différences entre supports, tools, potions, cartes, rappels et préférences.

Suites naturelles possibles:
- répondre à “comment ça marche ?”;
- expliquer où retrouver/modifier un objet;
- produire un bridge vers un handoff plateforme si le user demande ensuite une action.

Infos utiles au dispatcher:
- dans ce skill, une question produit inline doit préserver l’active flow si elle ne change pas le besoin principal;
- “fais-le”, “crée-le”, “mets-le” depuis product_help devient un signal de bridge confirmé vers le handoff concerné, pas une exécution directe;
- les questions de statut réel doivent rester DB-grounded ou aller vers status_recap, pas vers une fiche catalogue.`,

  safety_crisis: `Skill / Handoff:
- safety_crisis

Rôle:
- gérer les situations de risque, danger immédiat, idéation suicidaire, auto-mutilation, perte de contrôle ou besoin d’aide humaine.

Suites naturelles possibles:
- clarifier sécurité immédiate, moyens, isolement, aide humaine;
- rester dans la désescalade;
- revenir à un autre owner seulement après stabilisation explicite.

Infos utiles au dispatcher:
- dans ce skill, “aide”, “support”, “continuer” veut dire aide de sécurité avant tout;
- les signaux potions, cartes, rappels, plan ou product_help doivent rester silencieux tant que la sécurité n’est pas clarifiée;
- “je suis en sécurité” aide seulement si ce n’est pas contredit et ne remplit pas à lui seul moyens éloignés / aide humaine disponible.`,

  status_recap: `Skill / Handoff:
- status_recap

Rôle:
- répondre sans mutation à “où on en est”, “qu’est-ce qui est fait/prévu”, “est-ce que c’est actif”, “qu’est-ce qui a été gardé”.

Suites naturelles possibles:
- produire un récap compact;
- répondre au statut d’un objet réel;
- distinguer fait, prévu, fragile ou non confirmé.

Infos utiles au dispatcher:
- dans ce skill, “garder ça”, “c’est bien en place ?”, “tu l’as fait ?” sont des demandes de statut, pas des demandes de création;
- ne pas renforcer un signal tool si le user vérifie seulement l’existence d’une carte, potion, rappel ou préférence;
- si le user donne une commande explicite nouvelle, status_recap ne doit pas masquer ce signal.`,

  daily_action_review_v1: `Skill / Handoff:
- daily_review

Rôle:
- faire le bilan d’une action/journée: fait, partiel, manqué, raison, pertinence restante, correction éventuelle.

Suites naturelles possibles:
- collecter les slots du bilan;
- enregistrer le bilan si les éléments requis sont complets;
- ouvrir une suite après le bilan si le user demande clairement un support.

Infos utiles au dispatcher:
- dans ce skill, “j’ai pas réussi”, “trop dur”, “j’ai oublié”, “ça sert encore” sont d’abord des signaux de daily review;
- “garder ça” peut être un apprentissage du bilan, pas un rappel;
- les signaux potion/carte/rappel/adjust plan doivent rester faibles tant que le bilan n’a pas clarifié le besoin durable ou opérationnel.`,

  daily_review: `Skill / Handoff:
- daily_review

Rôle:
- faire le bilan d’une action/journée: fait, partiel, manqué, raison, pertinence restante, correction éventuelle.

Suites naturelles possibles:
- collecter les slots du bilan;
- enregistrer le bilan si les éléments requis sont complets;
- ouvrir une suite après le bilan si le user demande clairement un support.

Infos utiles au dispatcher:
- dans ce skill, “j’ai pas réussi”, “trop dur”, “j’ai oublié”, “ça sert encore” sont d’abord des signaux de daily review;
- “garder ça” peut être un apprentissage du bilan, pas un rappel;
- les signaux potion/carte/rappel/adjust plan doivent rester faibles tant que le bilan n’a pas clarifié le besoin durable ou opérationnel.`,

  weekly_adaptive_review_v1: `Skill / Handoff:
- weekly_review

Rôle:
- faire le bilan de semaine: progression, énergie, blocages, pertinence des actions, décision sur la semaine suivante.

Suites naturelles possibles:
- continuer la revue weekly;
- proposer une organisation de semaine suivante;
- passer ponctuellement par adjust plan seulement pour formuler une demande à reprendre dans Plan.

Infos utiles au dispatcher:
- dans ce skill, “je veux changer mon plan” peut être géré dans le weekly comme matière de bilan/proposition, sans signal fort adjust plan;
- signal adjust plan seulement si le user demande explicitement de préparer/formuler/reprendre l’ajustement côté Plan;
- si le user demande rappel, carte ou fiche pendant le weekly, c’est souvent à mettre de côté après le bilan, pas à router immédiatement.`,

  weekly_review: `Skill / Handoff:
- weekly_review

Rôle:
- faire le bilan de semaine: progression, énergie, blocages, pertinence des actions, décision sur la semaine suivante.

Suites naturelles possibles:
- continuer la revue weekly;
- proposer une organisation de semaine suivante;
- passer ponctuellement par adjust plan seulement pour formuler une demande à reprendre dans Plan.

Infos utiles au dispatcher:
- dans ce skill, “je veux changer mon plan” peut être géré dans le weekly comme matière de bilan/proposition, sans signal fort adjust plan;
- signal adjust plan seulement si le user demande explicitement de préparer/formuler/reprendre l’ajustement côté Plan;
- si le user demande rappel, carte ou fiche pendant le weekly, c’est souvent à mettre de côté après le bilan, pas à router immédiatement.`,

  select_state_potion: `Skill / Handoff:
- select_state_potion

Rôle:
- choisir et préparer une potion d’état à partir d’un besoin durable déjà clarifié.

Suites naturelles possibles:
- résoudre l’état à soutenir;
- choisir la potion;
- préparer les champs à reprendre dans la plateforme.

Infos utiles au dispatcher:
- ce handoff prépare une recommandation et des champs, il ne lance pas la potion depuis le chat;
- bridges depuis emotional_repair: amour, guérison, apaisement;
- bridges depuis demotivation_repair: clarté, courage, rappel / anti-décrochage;
- “active-la”, “lance-la”, “vas-y” dans ce handoff signale une tentative d’application plateforme, pas une exécution implicite.`,

  prepare_attack_card: `Skill / Handoff:
- cartes d’attaque

Rôle:
- préparer une carte pour débloquer une action claire: démarrage, évitement, friction, passage à l’acte choisi.

Suites naturelles possibles:
- clarifier cible/action et piège de démarrage;
- recommander une technique;
- préparer les champs à reprendre dans la plateforme.

Infos utiles au dispatcher:
- dans ce handoff, “outil”, “support”, “truc pour agir” renvoie souvent aux champs de carte d’attaque;
- “crée-la”, “ok”, “on y va” doit rester une tentative de handoff plateforme si le chat ne peut pas créer;
- si le user décrit surtout un risque récurrent ou une rechute probable, le signal peut basculer vers carte de défense.`,

  prepare_defense_card: `Skill / Handoff:
- cartes de défense

Rôle:
- préparer une carte pour un risque récurrent: tentation, rechute, contexte déclencheur, limite ou protection.

Suites naturelles possibles:
- clarifier la situation à risque;
- formuler le besoin de protection;
- préparer le champ principal à reprendre dans la plateforme.

Infos utiles au dispatcher:
- dans ce handoff, “support”, “aide”, “fiche”, “me protéger” renvoie souvent au besoin de défense;
- “je veux agir / me lancer” peut signaler carte d’attaque si le risque récurrent disparaît;
- “crée-la” reste un signal de redirection plateforme quand le chat ne crée pas directement.`,

  create_recurring_reminder: `Skill / Handoff:
- reminders / rappels

Rôle:
- préparer ou gérer un rappel ponctuel explicite, ou préparer un rappel récurrent à configurer dans la plateforme.

Suites naturelles possibles:
- clarifier quoi rappeler et quand;
- distinguer rappel ponctuel, rappel récurrent, statut de rappel, ou simple mémoire conversationnelle;
- préparer les éléments à reprendre dans Rappels.

Infos utiles au dispatcher:
- dans demotivation_repair, “rappel” peut vouloir dire potion anti-décrochage, pas notification;
- “garde ça” est ambigu: mémoire, récap, préférence ou rappel selon le contexte;
- rappel ponctuel: signal fort seulement avec instruction + moment explicite; rappel récurrent: handoff de préparation plateforme.`,

  create_one_shot_reminder: `Skill / Handoff:
- reminders / rappels

Rôle:
- préparer ou gérer un rappel ponctuel explicite, ou préparer un rappel récurrent à configurer dans la plateforme.

Suites naturelles possibles:
- clarifier quoi rappeler et quand;
- distinguer rappel ponctuel, rappel récurrent, statut de rappel, ou simple mémoire conversationnelle;
- préparer les éléments à reprendre dans Rappels.

Infos utiles au dispatcher:
- dans demotivation_repair, “rappel” peut vouloir dire potion anti-décrochage, pas notification;
- “garde ça” est ambigu: mémoire, récap, préférence ou rappel selon le contexte;
- rappel ponctuel: signal fort seulement avec instruction + moment explicite; rappel récurrent: handoff de préparation plateforme.`,

  adjust_plan_item: `Skill / Handoff:
- adjust plan

Rôle:
- aider à formuler un ajustement de plan à reprendre dans la section Plan: alléger, remplacer, clarifier, réorganiser, prolonger.

Suites naturelles possibles:
- clarifier la cible et le changement demandé;
- produire une phrase courte à reprendre dans Plan;
- rappeler que l’ajustement se fait dans la plateforme.

Infos utiles au dispatcher:
- dans weekly_review, “changer le plan” est souvent géré localement par le weekly; ne pas sur-router;
- dans demotivation_repair, “trop lourd” peut rester réparation motivationnelle tant que la demande de modification n’est pas explicite;
- dans adjust plan, “applique”, “valide”, “fais-le” signifie tentative de reprise plateforme, pas mutation implicite depuis le chat.`,

  update_coach_preferences: `Skill / Handoff:
- coach preferences

Rôle:
- préparer un réglage de style coach: ton, niveau de challenge, tendance à poser des questions.

Suites naturelles possibles:
- distinguer consigne ponctuelle et préférence durable;
- mapper vers un réglage supporté;
- préparer la mise à jour à faire dans les Préférences coach.

Infos utiles au dispatcher:
- “parle-moi autrement maintenant” peut rester consigne ponctuelle;
- “pour la suite”, “souviens-toi”, “garde ce style” renforce le signal préférence durable;
- “applique/enregistre” dans ce handoff doit rester une redirection/préparation plateforme, pas une écriture implicite.`,
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanIdentifier(value: unknown): string | null {
  const id = String(value ?? "").trim();
  return id ? id : null;
}

function activeRuntimeContext(
  flowStateContext: unknown,
): Record<string, unknown> | null {
  const flow = objectRecord(flowStateContext);
  return objectRecord(flow?.active_runtime_context);
}

export function getActiveSkillStableDescriptionContext(input: {
  active_skill_state?: unknown;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  flow_state_context?: unknown;
}): ActiveSkillStableDescriptionContext | null {
  const runtime = activeRuntimeContext(input.flow_state_context);
  const activeSkill = objectRecord(input.active_skill_state);
  const activeTool = objectRecord(input.active_tool_skill_intake);
  const pending = objectRecord(input.pending_tool_skill_confirmation);

  const candidates = [
    cleanIdentifier(activeTool?.operation_type),
    cleanIdentifier(activeTool?.skill_id),
    cleanIdentifier(pending?.operation_type),
    cleanIdentifier(pending?.skill_id),
    cleanIdentifier(runtime?.operation_type),
    cleanIdentifier(runtime?.skill_id),
    cleanIdentifier(activeSkill?.skill_id),
  ];
  const skillId = candidates.find((candidate) =>
    candidate && ACTIVE_SKILL_STABLE_DESCRIPTIONS[candidate]
  );
  if (!skillId) return null;
  return {
    skill_id: skillId,
    instruction:
      `On est actuellement dans \`${skillId}\`. Sers-toi de cette description pour pondérer correctement les signaux du message utilisateur, surtout quand il emploie des mots ambigus comme support, outil, aide dans Sophia, continuer, garder ça. Cette description ne crée pas une intention à elle seule et ne remplace pas l’intake du skill.`,
    description: ACTIVE_SKILL_STABLE_DESCRIPTIONS[skillId],
  };
}

export function getStableDescriptionForSkillId(skillId: string): string | null {
  return ACTIVE_SKILL_STABLE_DESCRIPTIONS[skillId] ?? null;
}
