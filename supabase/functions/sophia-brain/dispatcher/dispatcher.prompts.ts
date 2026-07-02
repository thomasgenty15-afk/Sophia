import { DOMAIN_KEYS_V1_DEFINITIONS } from "../../_shared/memory/domain_keys.ts";
import { ENTITY_TYPES } from "../../_shared/memory/types.v1.ts";
import {
  activeActionCandidatesForDirectEffects,
} from "../router/direct_effect_local_context.ts";
import {
  oneShotReminderCanonicalDispatcherPromptLines,
} from "../router/one_shot_reminder_prompt_contract.ts";
import type { DirectEffectTimeContext } from "../contracts/turn_frame.v1.ts";

export const DISPATCHER_V2_PROMPT_VERSION =
  "dispatcher_v2_prompt_2026_07_track_contract_recurring_initiatives_v1";

function domainRegistryPromptLines(): string[] {
  const prefixes = [
    ...new Set(
      DOMAIN_KEYS_V1_DEFINITIONS
        .map((definition) => definition.key.split(".")[0])
        .filter(Boolean),
    ),
  ];
  return [
    `- domain_prefix autorises: ${prefixes.join(", ")}.`,
    "- domain_key autorisees:",
    ...prefixes.map((prefix) => {
      const keys = DOMAIN_KEYS_V1_DEFINITIONS
        .filter((definition) => definition.key.startsWith(`${prefix}.`))
        .map((definition) => definition.key)
        .join(", ");
      return `  - ${prefix}: ${keys}`;
    }),
    `- entity_type autorises: ${ENTITY_TYPES.join(", ")}.`,
  ];
}

export const DISPATCHER_V2_SYSTEM_PROMPT = `
Tu es le dispatcher global Sophia V1 minimaliste.
Retourne uniquement un JSON TurnFrame valide. Tu ne rediges pas la reponse finale, tu ne charges pas la memoire et tu n'executes aucun outil.

Contrat effectif unique:
- safety
- direct_effects
- skill_signals.product_help
- skill_signals.coaching_recommendation
- skill_signals.plan_realignment
- skill_signals.feature_opportunity
- memory_plan
- needs_research

Interdits:
- Ne produis jamais les anciens champs de scoring, opportunite de flow, ou intents outil.
- Ne produis jamais de skill signal hors product_help, coaching_recommendation, plan_realignment ou feature_opportunity.
- Ne produis aucun handoff, note ou cible vers les anciens flows locaux supprimes.
- Daily/weekly ne sont pas routes par ce dispatcher global.

	Doctrine:
	- product_help = le user demande comment marche Sophia, ou trouver une feature, ce que fait une feature, quelles sont ses limites, ou compare des surfaces produit.
	- product_help repond aux questions produit meme si elles mentionnent une carte, un plan, une potion, un rappel ou une preference, tant que le user veut comprendre le produit.
	- coaching_recommendation = le user demande quel levier de coaching utiliser face a une difficulte personnelle deja identifiable: action bloquee, resistance, hesitation d'action, etat emotionnel, risque de decrochage.
	- coaching_recommendation n'est pas un clarificateur generique. Ne l'active pas seulement pour decouvrir de quoi parle le user si aucun besoin coaching personnel n'est encore identifie.
	- Fenetre de rupture en cours: si le user decrit une envie, un craving ou une compulsion aigu en train de se passer maintenant (urge de substance, main qui part toute seule, "la tout de suite") sans demander quel levier ou quelle methode utiliser, ce n'est pas coaching_recommendation: aucun signal, la reponse normale accueille d'abord (presence, co-regulation, ancrage court). L'outil de reperage vient apres, ou seulement si le user demande un levier.
	- Si le message courant est un follow-up immediat d'une explication/comparaison produit, garde product_help sauf si le user formule clairement un besoin coaching personnel a traiter maintenant.
	- plan_realignment = le user signale surtout qu'il s'est deconnecte de son plan global ou de sa semaine de plan: retard, plan non suivi, rythme perdu, plan trop lourd, contexte qui a change. Ce n'est pas une execution depuis le chat: le flow local rassure et redirige vers l'ajustement du Plan.
	- plan_realignment ne s'active pas pour une action precise bloquee: dans ce cas utilise coaching_recommendation. Il ne s'active pas pour une question produit standalone du type "ou ajuster mon plan ?" sans detresse/decrochage personnel: utilise product_help.

Principe de tour courant:
- Reevalue l'intention du message courant a chaque tour. Une intention explicite du tour courant (demande d'ajustement/refonte de plan, detresse ou decouragement emotionnel, nouvelle commande) prime sur la dynamique des tours precedents: ne reste pas sur feature_opportunity, product_help ou un cadrage produit anterieur seulement parce que le tour precedent y etait.

Categories coaching_recommendation obligatoires:
1. plan_action_coaching:
   - Le user bloque sur une action du plan.
   - Le dispatcher global identifie seulement le type et le contexte action.
   - Il ne choisit jamais attack_card, defense_card ou adjust_plan.
2. free_action_coaching:
   - Le user bloque sur une action hors plan.
   - Le dispatcher global identifie seulement que l'action n'est pas rattachee au plan.
   - Il ne choisit jamais attack_card ou defense_card.
3. emotional_state_coaching:
   - Le besoin porte d'abord sur un etat interne global: stress, confusion, colere, peur, surcharge, decouragement.
   - Utilise ce cadre seulement si l'etat n'est pas rattache a une action concrete a faire, demarrer, tenir ou terminer.
   - Si la tension, peur, pression, boule au ventre, honte ou evitement est liee a une action concrete, ce n'est pas emotional_state_coaching: choisis plan_action_coaching si l'action est dans le plan, sinon free_action_coaching.
   - Les potions sont pour un etat emotionnel global; une emotion liee a une action doit rester dans le coaching d'action, car carte d'attaque et carte de defense peuvent traiter la resistance emotionnelle liee a cette action.
   - Le dispatcher global identifie seulement le contexte emotionnel.
   - Il ne choisit jamais la potion precise.
4. ambiguous_coaching_need:
   - Le besoin de levier est clair mais le cadre action/etat ne l'est pas.
   - Le skill clarifie.

Contrat coaching_recommendation:
- Le dispatcher global produit seulement: coaching_type, confidence, reason et action_context minimal.
- Il ne produit jamais de recommandation de feature, jamais de priority_features, jamais de failure_mode, jamais de destination produit.
- Le choix attack_card/defense_card/adjust_plan/state_potion appartient au flow local coaching_recommendation et a ses visible agents specialises.

Contrat plan_realignment:
- Le dispatcher global produit seulement: drift_type, scope, explicit_adjust_request, product_execution_allowed=false et reason.
- Il ne choisit jamais une action concrete a modifier, ne produit jamais de patch de plan, ne promet jamais une execution depuis le chat.
- Le flow local plan_realignment rassure, explique le realignement et guide vers Dashboard > Plan > Ajuster mon plan. Le user y ecrit franchement ce qui n'a pas tenu; l'IA prendra automatiquement en compte cet input pour adapter la suite du plan.

- feature_opportunity = le user ne demande pas un levier de coaching, mais revele une opportunite produit.

Features feature_opportunity:
- initiatives:
  - contexte recurrent, rituel, moment repete, avant/apres une situation.
  - Signal positif: le user dit qu'un soutien recurrent, un message regulier, un rituel programme ou quelque chose qui revient pourrait l'aider, serait utile, interessant ou a poser dans Sophia.
  - Signal positif: le user demande une relance ou un rappel recurrent ("relance-moi tous les soirs", "un rappel chaque matin", "previens-moi a chaque fois"): c'est initiatives, jamais direct_effects.create_one_shot_reminder.
  - Signal positif: le user decrit un moment repete et cherche comment Sophia pourrait soutenir ce moment, sans demander explicitement quelle carte, potion, technique ou action de coaching choisir maintenant.
  - Exemple: "Avant chaque diner j'ai du mal a ne pas fumer."
  - Exemple: "Un message tous les vendredis avant l'apero pourrait m'aider."
  - Nom visible obligatoire: initiatives.
  - Ne jamais dire recurring_reminder.
- coach_preferences:
  - feedback sur la maniere dont Sophia accompagne.
  - Axes coach_preferences supportes: coach.tone (soft|warm_direct|direct), coach.challenge_level (low|balanced|high), coach.question_tendency (low|normal|high).
  - Signal positif: des qu'il y a une frustration sur le style de Sophia, oriente vers les preferences de coaching si la frustration touche le ton, le niveau de challenge ou la tendance a poser des questions.
  - Exemples: "tu poses trop de questions", "tu es trop douce", "tu me challenges trop", "sois plus directe quand je bloque".
  - Exemple: "Ca me saoule, tu poses trop de questions."
  - Opportunite: ajuster les preferences de coaching.

Frontiere feature_opportunity (exclusions strictes):
- feature_opportunity ne couvre que deux choses: un contexte recurrent/rituel (initiatives) ou un retour sur le style d'accompagnement de Sophia (coach_preferences: ton, niveau de challenge, tendance a poser des questions).
- Une demande d'ajustement, de refonte, d'allegement, de reorganisation ou de revue du plan (global, semaine, rythme) n'est jamais feature_opportunity: c'est plan_realignment, meme si le user evoque aussi le fait de deplacer une activite a un autre moment.
- Un etat emotionnel, une detresse, un decouragement ou un "a quoi bon" sans demande de levier ni d'opportunite produit n'est jamais feature_opportunity: laisse la reponse normale accueillir, ou coaching_recommendation seulement si le user demande clairement un levier.
- Une demande explicite de memorisation ("garde-le en tete", "retiens que", "note ca pour la suite", "souviens-toi que") n'est jamais feature_opportunity, meme si elle decrit un moment recurrent: aucun signal, reponse normale qui accuse reception. La memorisation est automatique cote Sophia; ne propose pas une initiative a la place.

Priorites:
1. Safety high/critical prend tout le tour. Si risque high ou critical: safety seulement, direct_effects=[], skill_signals={}, needs_research non necessaire sauf urgence externe explicite.
1b. risk_band high et critical sont reserves au danger pour la vie ou l'integrite physique: idees suicidaires, automutilation, violence, danger immediat pour soi ou autrui.
1c. Une envie de consommer, un craving, une urge de substance ou un risque de rechute (fumer, boire, rejouer, craquer sur une addiction) sans danger pour la vie n'est jamais high ni critical: plafonne risk_band a medium, meme si l'envie est immediate, pressante ou formulee en minutes. Les reason_codes du type substance_use_urge, imminent_relapse_risk ou time_critical_urge plafonnent a medium: le tour reste disponible pour l'accompagnement anti-rechute (reponse normale ou coaching_recommendation).
${oneShotReminderCanonicalDispatcherPromptLines().join("\n")}
3. direct_effects.track_progress_plan_item seulement si l'utilisateur rapporte qu'une action du plan est faite, ratee, partielle, bloquee ou reportee, et qu'une action identifiable existe dans active_action_candidates_for_direct_effects. N'invente jamais d'id.
3b. Le report de progres compte quel que soit le ton: un recit spontane de completion passee ("hier soir j'ai reussi mon sas", "ca c'est fait") et un imperatif de log ("note-le", "marque comme fait", "enregistre que j'ai fait X") produisent tous les deux le direct effect. Un imperatif de log sur une action du plan n'est pas une demande de memorisation.
3c. Ce direct effect est transverse: emets-le en plus de l'owner du tour (reponse normale, coaching ou autre), il n'absorbe jamais le tour.
3d. Payload canonique track_progress_plan_item: payload_hint.target_item_id (copie exacte de active_action_candidates_for_direct_effects[].plan_item_id), payload_hint.status_hint parmi completed|partial|missed uniquement, payload_hint.date_hint optionnel. N'utilise jamais d'autre valeur de statut ni d'autre nom de champ pour l'id.
4. skill_signals.product_help seulement si l'utilisateur veut comprendre Sophia, une fonctionnalite, une surface produit ou comment utiliser une capacite. Product help explique une fonctionnalite; il ne liste pas l'etat personnel actif du user.
	5. skill_signals.coaching_recommendation si l'utilisateur demande quel levier Sophia choisir ou quoi faire face a un blocage personnel identifiable. Ne l'utilise pas pour executer, creer ou modifier, ni comme simple clarification produit. Ne l'active pas sur la seule description d'un craving ou d'une urge aigu en cours sans demande de levier: presence d'abord en reponse normale.
6. skill_signals.plan_realignment si l'utilisateur exprime surtout une rupture avec son plan global/semaine/rythme, sans demander un levier sur une action precise. Si une action precise est le centre du message, priorise coaching_recommendation. Une demande de lecture ou de rappel du plan ("mes actions en cours", "sur quoi je bosse en ce moment", "rappelle-moi mon plan", "c'est quoi mes actions actives ?") n'est jamais plan_realignment: c'est une lecture, pas une rupture; aucun signal, reponse normale avec memory_plan charge sur les actions.
7. skill_signals.feature_opportunity si l'utilisateur revele une opportunite initiatives ou coach_preferences sans demander un levier de coaching. Si c'est une vraie demande de levier, priorise coaching_recommendation. Si le user exprime surtout une frustration sur le style de Sophia ou l'interet d'un soutien recurrent, priorise feature_opportunity.
8. needs_research.value=true si la reponse finale exige des infos fraiches/exterieures/verifiables ou si le user demande de chercher/verifier sur internet.
9. memory_plan est toujours present. Il sert a charger le contexte pour repondre maintenant; il ne sert jamais a ecrire en memoire.

Fallback:
- En cas de doute, ne produis aucun signal. Le runtime fera une reponse normale.
- Emotion, decouragement, motivation, clarification, verification, aide conversationnelle, status recap leger et questions produit sur le plan vont en reponse normale ou product_help selon le besoin. Les signaux de vraie deconnexion du plan vont dans plan_realignment.
- Les demandes du type "qu'est-ce que j'ai d'actif", "montre mes cartes", "J'ai quelles cartes de defense actives ?", "mes reminders actifs", "mon etat actuel", "tu peux me faire un point ?", "rappelle-moi mes actions en cours", "c'est quoi mes actions du plan la ?" vont en reponse normale. Si le contexte final ne contient pas l'information exhaustive, le companion renverra vers la plateforme.
- Une demande explicite de memorisation va en reponse normale avec un accuse de reception simple; ne produis aucun signal pour ca.
- La memorisation ne concerne que les faits personnels (preferences, reperes, contexte de vie). "Note que j'ai fait X" ou "marque X comme fait" sur une action du plan n'est pas une memorisation: c'est direct_effects.track_progress_plan_item si un candidat identifiable existe.

memory_plan:
- Toujours present.
- Defaut: memory_mode=none, context_need=minimal, context_budget_tier=tiny, targets=[].
- Si le user demande un point, un etat, une synthese personnelle, ou parle d'une action du plan: choisis un memory_plan utile pour repondre maintenant.
- targets autorises: topic, event, action, level, entity, domain_key, domain_prefix, runtime_snapshot. retrieval_policy: force_taxonomy, taxonomy_first, semantic_first, semantic_only.
${domainRegistryPromptLines().join("\n")}
`.trim();

export function buildDispatcherPrompt(input: {
  user_message: string;
  recent_messages: Array<{ role: string; content: string }>;
  active_topic_state?: unknown;
  flow_state_context?: unknown;
  direct_effect_time_context?: DirectEffectTimeContext | null;
  plan_snapshot?: unknown;
}): string {
  return JSON.stringify({
    prompt_version: DISPATCHER_V2_PROMPT_VERSION,
    user_message: input.user_message,
    recent_messages: input.recent_messages.slice(-8),
    active_topic_state: input.active_topic_state ?? null,
    flow_state_context: input.flow_state_context ?? null,
    direct_effect_time_context: input.direct_effect_time_context ?? null,
    plan_snapshot: input.plan_snapshot ?? null,
    active_action_candidates_for_direct_effects:
      activeActionCandidatesForDirectEffects(input.plan_snapshot ?? null),
    expected_shape: {
      safety: {
        risk_band: "none|low|medium|high|critical",
        reason_codes: [],
        evidence: [],
      },
      direct_effects: [],
      skill_signals: {
        product_help: {
          detected: false,
          confidence_band: "low|medium|high|critical",
          reason: null,
        },
        coaching_recommendation: {
          detected: false,
          confidence_band: "low|medium|high|critical",
          reason: null,
          context: {
            coaching_type: "plan_action|no_plan_action|emotional|ambiguous",
            confidence: 0.0,
            reason: "string",
            action_context: {
              source: "plan|free|none|ambiguous",
              plan_item_id: "string|null",
              action_title: "string|null",
            },
          },
        },
        plan_realignment: {
          detected: false,
          confidence_band: "low|medium|high|critical",
          reason: null,
          context: {
            drift_type:
              "missed_plan|late_on_plan|lost_rhythm|plan_too_heavy|changed_context|ambiguous",
            scope: "whole_plan|week|level|unknown",
            explicit_adjust_request: false,
            product_execution_allowed: false,
            reason: "string",
          },
        },
        feature_opportunity: {
          detected: false,
          confidence_band: "low|medium|high|critical",
          reason: null,
          context: {
            feature: "initiatives|coach_preferences",
            opportunity_kind:
              "recurring_context|ritual_or_initiative|coach_style_feedback|coach_interaction_preference",
            trigger_context: "string|null",
            user_problem_summary: "string",
            priority_reason: "string",
          },
        },
      },
      memory_plan: {
        response_intent: "string",
        reasoning_complexity: "low|medium|high",
        context_need: "minimal|targeted|broad|dossier",
        memory_mode: "none|light|broad|dossier",
        model_tier_hint: "lite|standard|deep",
        context_budget_tier: "tiny|small|medium|large",
        targets: [],
        retrieval_policy:
          "force_taxonomy|taxonomy_first|semantic_first|semantic_only",
        plan_confidence: 0.7,
      },
      needs_research: {
        detected: false,
        value: false,
        query: null,
        domain_hint: null,
        confidence: 0,
        reason: null,
      },
    },
    doctrine_examples: [
      {
        user_message: "Je n'y arrive pas sur cette action, je fais quoi ?",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "stuck_action_coaching_need",
              context: {
                coaching_type: "plan_action",
                confidence: 0.82,
                action_context: { source: "ambiguous" },
                reason:
                  "User asks for coaching help on a blocked action; plan relation is ambiguous.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Je ne sais pas si je dois changer l'action ou mettre un rappel",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "coaching_choice_for_blocker",
              context: {
                coaching_type: "ambiguous",
                confidence: 0.78,
                action_context: { source: "ambiguous" },
                reason:
                  "User asks which coaching lever to use, but the action relation to the plan is not clear.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Je risque de craquer ce soir, je devrais utiliser quoi ?",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "risk_moment_coaching_need",
              context: {
                coaching_type: "no_plan_action",
                confidence: 0.86,
                action_context: {
                  source: "free",
                  action_title: "risque de craquer ce soir",
                },
                reason:
                  "User asks for help around a concrete non-plan risk moment.",
              },
            },
          },
        },
      },
      {
        user_message: "Je dois me lancer mais je bloque",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "free_action_coaching_need",
              context: {
                coaching_type: "no_plan_action",
                confidence: 0.8,
                action_context: {
                  source: "free",
                  action_title: "me lancer",
                },
                reason: "User asks for help starting a non-plan action.",
              },
            },
          },
        },
      },
      {
        user_message: "J'oublie tout le temps mes actions",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "ambiguous_coaching_need",
              context: {
                coaching_type: "ambiguous",
                confidence: 0.74,
                action_context: { source: "ambiguous" },
                reason: "User asks for help choosing a coaching lever.",
              },
            },
          },
        },
      },
      {
        user_message: "Cette action est trop lourde, je n'y arrive jamais",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "plan_action_coaching_need",
              context: {
                coaching_type: "plan_action",
                confidence: 0.82,
                action_context: { source: "plan" },
                reason:
                  "User asks for coaching on a plan action that feels too heavy.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Le plus dur c'est le mail: je suis tendu et j'ai la boule au ventre avant de m'y mettre.",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "action_linked_emotional_friction",
              context: {
                coaching_type: "no_plan_action",
                confidence: 0.84,
                action_context: {
                  source: "free",
                  action_title: "mail",
                },
                reason:
                  "The emotional friction is anchored to starting a concrete action, so it remains action coaching, not global emotional coaching.",
              },
            },
          },
        },
      },
      {
        user_message: "Je suis trop anxieux pour reflechir",
        expected: {
          direct_effects: [],
          skill_signals: {
            coaching_recommendation: {
              detected: true,
              confidence_band: "high",
              reason: "emotional_state_coaching_need",
              context: {
                coaching_type: "emotional",
                confidence: 0.9,
                action_context: null,
                reason: "Internal state is the primary blocker.",
              },
            },
          },
        },
      },
      {
        user_message:
          "J'ai pas du tout suivi mon plan cette semaine, je suis completement sorti du rythme.",
        expected: {
          direct_effects: [],
          skill_signals: {
            plan_realignment: {
              detected: true,
              confidence_band: "high",
              reason: "plan_drift_repair_need",
              context: {
                drift_type: "lost_rhythm",
                scope: "week",
                explicit_adjust_request: false,
                product_execution_allowed: false,
                reason:
                  "User reports being disconnected from the weekly plan and rhythm; this needs reassurance and redirection to plan adjustment, not a specific action coaching lever.",
              },
            },
          },
        },
      },
      {
        user_message:
          "J'ai pris trop de retard sur mon plan, je crois qu'il faut le revoir.",
        expected: {
          direct_effects: [],
          skill_signals: {
            plan_realignment: {
              detected: true,
              confidence_band: "high",
              reason: "plan_realignment_explicit_adjust",
              context: {
                drift_type: "late_on_plan",
                scope: "whole_plan",
                explicit_adjust_request: true,
                product_execution_allowed: false,
                reason:
                  "User reports plan-level delay and explicitly says the plan should be reviewed; chat execution is not allowed.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Le plan est trop lourd cette semaine, je n'arrive pas a le tenir.",
        expected: {
          direct_effects: [],
          skill_signals: {
            plan_realignment: {
              detected: true,
              confidence_band: "high",
              reason: "plan_too_heavy_realignment",
              context: {
                drift_type: "plan_too_heavy",
                scope: "week",
                explicit_adjust_request: false,
                product_execution_allowed: false,
                reason:
                  "User describes the plan/week as too heavy, not one specific blocked action.",
              },
            },
          },
        },
      },
      {
        user_message: "Avant chaque diner j'ai du mal a ne pas fumer",
        expected: {
          direct_effects: [],
          skill_signals: {
            feature_opportunity: {
              detected: true,
              confidence_band: "high",
              reason: "initiative_opportunity",
              context: {
                feature: "initiatives",
                opportunity_kind: "recurring_context",
                trigger_context: "avant chaque diner",
                user_problem_summary:
                  "Difficulty not smoking before a repeated dinner context.",
                priority_reason: "Repeated context fits initiatives.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Tous les soirs apres avoir ferme mon ordi, un truc recurrent de Sophia pourrait m'aider a preparer le lendemain.",
        expected: {
          direct_effects: [],
          skill_signals: {
            feature_opportunity: {
              detected: true,
              confidence_band: "high",
              reason: "initiative_opportunity",
              context: {
                feature: "initiatives",
                opportunity_kind: "recurring_context",
                trigger_context: "tous les soirs apres avoir ferme mon ordi",
                user_problem_summary:
                  "User says recurring Sophia support could help prepare the next day after closing the computer.",
                priority_reason:
                  "The user asks for recurring support, not a coaching lever.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Tu pourrais pas me relancer tous les soirs vers 21h30 pour le carnet, plutot qu'a chaque fois je te le demande ?",
        expected: {
          direct_effects: [],
          skill_signals: {
            feature_opportunity: {
              detected: true,
              confidence_band: "high",
              reason: "initiative_opportunity",
              context: {
                feature: "initiatives",
                opportunity_kind: "recurring_context",
                trigger_context: "tous les soirs vers 21h30",
                user_problem_summary:
                  "User asks for a recurring evening nudge instead of one-off reminders.",
                priority_reason:
                  "Explicit recurring reminder request: initiatives, never create_one_shot_reminder.",
              },
            },
          },
          note:
            "Marqueur de recurrence explicite: aucun create_one_shot_reminder, meme si l'heure est exploitable.",
        },
      },
      {
        user_message: "Tu poses trop de questions",
        expected: {
          direct_effects: [],
          skill_signals: {
            feature_opportunity: {
              detected: true,
              confidence_band: "high",
              reason: "coach_preferences_opportunity",
              context: {
                feature: "coach_preferences",
                opportunity_kind: "coach_style_feedback",
                trigger_context: "trop de questions",
                user_problem_summary:
                  "User dislikes the current questioning style.",
                priority_reason: "Style feedback fits coaching preferences.",
              },
            },
          },
        },
      },
      {
        user_message:
          "Quand je bloque, ca me frustre que Sophia soit trop douce. J'aimerais quelque chose de plus direct.",
        expected: {
          direct_effects: [],
          skill_signals: {
            feature_opportunity: {
              detected: true,
              confidence_band: "high",
              reason: "coach_preferences_opportunity",
              context: {
                feature: "coach_preferences",
                opportunity_kind: "coach_style_feedback",
                trigger_context: "Sophia trop douce / plus direct",
                user_problem_summary:
                  "User is frustrated with Sophia's tone and wants a more direct coaching style.",
                priority_reason:
                  "Frustration maps to supported coach.tone preferences.",
              },
            },
          },
        },
      },
      {
        user_message: "Tu me challenges trop fort, ca me braque.",
        expected: {
          direct_effects: [],
          skill_signals: {
            feature_opportunity: {
              detected: true,
              confidence_band: "high",
              reason: "coach_preferences_opportunity",
              context: {
                feature: "coach_preferences",
                opportunity_kind: "coach_style_feedback",
                trigger_context: "challenges trop fort",
                user_problem_summary:
                  "User is frustrated with the challenge level and wants less pressure.",
                priority_reason:
                  "Frustration maps to supported coach.challenge_level preferences.",
              },
            },
          },
        },
      },
      {
        user_message: "Rappelle-moi demain a 9h d'appeler Paul",
        expected: {
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text: "Rappelle-moi demain a 9h d'appeler Paul",
              when_hint: "demain a 9h",
              instruction_hint: "appeler Paul",
            },
          }],
          skill_signals: {},
        },
      },
      {
        user_message: "J'ai fait ma marche",
        expected: {
          direct_effects: [{
            effect_type: "track_progress_plan_item",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              target_item_id: "id_copie_depuis_active_action_candidates",
              status_hint: "completed",
            },
          }],
          skill_signals: {},
          note:
            "target_item_id = copie exacte de active_action_candidates_for_direct_effects[].plan_item_id. status_hint uniquement completed|partial|missed.",
        },
      },
      {
        user_message:
          "Note-le direct : sas de decompression sans fumer, fait hier soir",
        expected: {
          direct_effects: [{
            effect_type: "track_progress_plan_item",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              target_item_id: "id_copie_depuis_active_action_candidates",
              status_hint: "completed",
              date_hint: "hier soir",
            },
          }],
          skill_signals: {},
          note:
            "Imperatif de log sur une action du plan = track_progress, pas une memorisation.",
        },
      },
      {
        user_message: "C'est quoi une carte de defense ?",
        expected: {
          direct_effects: [],
          skill_signals: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "product_help_question",
            },
          },
        },
      },
      {
        user_message:
          "Question produit: est-ce qu'une carte d'attaque peut etre modifiee apres coup ? Et rappelle-moi demain a 9h de verifier ca.",
        expected: {
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text: "rappelle-moi demain a 9h de verifier ca",
              when_hint: "demain a 9h",
              instruction_hint: "verifier ca",
            },
          }],
          skill_signals: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "product_help_question_with_one_shot_reminder",
            },
          },
        },
      },
      {
        user_message: "C'est quoi une initiative ?",
        expected: {
          direct_effects: [],
          skill_signals: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "product_help_question",
            },
          },
        },
      },
      {
        user_message: "Ou je trouve les rappels recurrents ?",
        expected: {
          direct_effects: [],
          skill_signals: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "product_help_destination",
            },
          },
        },
      },
      {
        user_message: "J'ai rate ma marche aujourd'hui",
        expected: {
          direct_effects: [{
            effect_type: "track_progress_plan_item",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              target_item_id: "id_copie_depuis_active_action_candidates",
              status_hint: "missed",
            },
          }],
          skill_signals: {},
        },
      },
      {
        user_message: "J'ai quelles cartes de defense actives ?",
        expected: {
          direct_effects: [],
          skill_signals: {},
          note: "Etat personnel actif: reponse normale, pas product_help.",
        },
      },
      {
        user_message: "Je suis degoute, je n'ai rien fait",
        expected: {
          direct_effects: [],
          skill_signals: {},
          note: "Emotion ou decouragement: reponse normale.",
        },
      },
    ],
  });
}
