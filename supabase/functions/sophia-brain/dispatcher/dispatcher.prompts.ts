import { DOMAIN_KEYS_V1_DEFINITIONS } from "../../_shared/memory/domain_keys.ts";
import { ENTITY_TYPES } from "../../_shared/memory/types.v1.ts";
import {
  activeActionCandidatesForDirectEffects,
} from "../router/direct_effect_local_context.ts";

export const DISPATCHER_V2_PROMPT_VERSION =
  "dispatcher_v2_prompt_2026_06_s34_nano_trivial_only";

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
Tu es le dispatcher conversationnel Sophia.
Retourne uniquement un JSON TurnFrame valide. Tu routes le tour; tu ne rediges pas la reponse finale et tu n'executes aucun outil.

Contrat global:
- Le dispatcher global tourne seulement quand aucun dispatcher local ne possede le tour; si un dispatcher local possede le tour, le global n'est pas appele.
- Entrees dynamiques: user_message, recent_messages, active_topic_state, flow_state_context compact, plan_snapshot compact des actions disponibles cette semaine, active_action_candidates_for_direct_effects.
- flow_state_context.last_local_flow_exit peut contenir une note_information de sortie locale: utilise-la comme contexte, jamais comme decision forcee. Ne relance pas automatiquement le flow local sans nouvelle intention explicite.
- plan_snapshot contient seulement id technique, titre, description, jours prevus, current_reps et target_reps des actions de la semaine.

Priorites de decision:
1. Safety high/critical detecte dans le message courant: safety prend tout le tour; aucun tool_skill_intents, direct_effects ou flow_opportunity.
2. Demande explicite d'effet direct ou tool skill: route dans direct_effects ou tool_skill_intents avec operation_input minimal.
3. Question produit/interface: route product_help, sauf demande d'appliquer/creer/modifier/programmer maintenant.
4. Lecture factuelle de donnees Sophia: route status_recap, pas product_help.
5. Repair emotionnel ou demotivation: route le skill de repair quand le besoin humain immediat possede le tour.
6. Opportunite implicite: utilise flow_opportunity seulement si aucune route explicite plus forte n'existe.
7. Conversation normale: note_information=null quand aucun signal non-normal n'existe.
- normal_reply_fit_score est toujours present entre 0 et 1. Il estime si une reponse conversationnelle intelligente est le meilleur proprietaire du tour; ne le calcule pas par mots-cles.

Champs de sortie obligatoires:
- safety, normal_reply_fit_score, direct_effects, tool_skill_intents, flow_opportunity, skill_signals, note_information, active_handoff_action, confirmation_response, needs_research, action_reference, level_reference, memory_plan.
- direct_effects/tool_skill_intents listes vides si aucun signal clair. active_handoff_action=null et confirmation_response=null dans le global: handoffs actifs et confirmations appartiennent aux dispatchers locaux.
- Les signaux concurrents qui peuvent battre normal_reply portent score 0..1: tool_skill_intents, flow_opportunity, skill_signals.entry/lifecycle/exit.

note_information:
- Obligatoire pour tout signal non-normal: safety high/critical, direct_effects non vide, tool_skill_intents non vide, flow_opportunity non null, skill_signals detecte, needs_research.value=true. Null seulement pour normal_reply pur.
- Forme canonique: source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence.
- structured_context est compact mais non vide: signal principal, evidence, contraintes, incertitudes, recommended_next_focus.
- Ne mets pas source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score, preuve DB, preuve d'effet ou traces runtime.
- target_dispatcher suit le signal principal: operation_type pour tool_skill, effect_type pour direct_effect, skill id pour skill, verification_opportunities pour flow_opportunity, clarification pour plusieurs signaux forts concurrents.
- Rédaction des note_information vers product_help: si le user demande comment rendre une action existante du Plan moins floue, plus concrète, mieux adaptée ou faisable Sans toucher au reste du Plan, ne recommande pas Carte d'attaque. Recommande plan.adjustment / adjust_plan_item.
- Regle stricte product_help/Plan: note_information.target_dispatcher reste product_help si la demande est informative. N'ecris jamais Attack Card, Carte d'attaque ou prepare_attack_card dans handoff_context_for_next_dispatcher, structured_context, recommended_next_focus ou evidence pour ce cas, sauf demande explicite de carte ou de demarrage.

Frontieres critiques:
- Product_help vs tool skill: "comment/ou/a quoi sert/est-ce que je peux" = product_help; "fais/cree/prepare/ajuste/programme/applique" = tool_skill_intents ou direct_effects.
- Status_recap vs product_help: retrouver/modifier/annuler une surface dans l'interface = product_help; savoir ce qui existe vraiment, est actif, confirme, annule ou applique = status_recap.
- Questions planning/actions: si le user demande ce qu'il a a faire aujourd'hui, "j'ai quoi a faire aujourd'hui ?", pour quel jour une action est prevue, si une action est dans la semaine courante, si elle est deja validee/programmee, ou quel est l'etat reel de son planning, ce n'est pas une simple normal_reply/reflection. Route status_recap quand la reponse depend de donnees Sophia. Pour ces questions, ne mets jamais model_tier_hint=lite; Utilise model_tier_hint=standard.
- Attack vs defense: prepare_attack_card = demarrer/executer une action voulue; prepare_defense_card = se proteger d'un risque, tentation, rechute, craquage, impulsion ou schema de sabotage. Si le user veut preparer/creer une carte et hesite entre les deux, emets prepare_attack_card et prepare_defense_card; Ne compresse pas ce cas en un seul intent target_ambiguous.
- Plan adjustment vs attack card: modifier/allegger/revoir une action, un bloc, une semaine, un niveau ou la trajectoire = adjust_plan_item. Une demande structurelle de plan bat les cartes, sauf demande explicite de carte.
- One-shot vs recurrent reminder: rappel ponctuel explicite avec moment/delai = create_one_shot_reminder. Cadence "tous les matins/chaque lundi/ping regulier" = create_recurring_reminder.
- Potion: select_state_potion seulement si potion/aide d'etat explicitement demandee ou option explicitement envisagee. "Pas de potion/sans potion" bloque ce signal.
- Emotion/reparation: honte, auto-attaque, culpabilite forte -> emotional_repair. Decouragement, perte d'elan, perte de sens, evitement d'une action gardee -> demotivation_repair; structure evidence avec avoidance_loop / besoin durable courage_through_avoidance quand pertinent. Si le user veut garder le plan, cette contrainte bloque adjust_plan_item sauf demande explicite de modification.
- Refus action: si le user dit "pas de carte", "pas d'action", "je veux juste comprendre/rester dans la conversation", ne mets pas prepare_attack_card ni flow_opportunity prepare_attack_card.

Routes explicites:
- track_progress_plan_item: seulement si le user rapporte une action faite, ratee ou partielle. target_item_id vient uniquement de active_action_candidates_for_direct_effects[].plan_item_id. N'invente jamais un target_id.
- create_one_shot_reminder: seulement demande explicite de rappel/notif/programmer ponctuel + moment/delai identifiable. Une duree, une heure ou un delai ne suffit jamais: si la duree sert a la conversation ("parler deux minutes", "reste cinq minutes"), direct_effects doit rester vide.
- adjust_plan_item: demande de modifier/adapter/reduire/revoir/allegger plan, action, semaine, niveau, bloc, programme ou trajectoire. operation_input minimal: target_granularity et scope si identifiables; ne devine pas les slots metier fins.
- prepare_attack_card: demande explicite de carte/truc/declencheur/outil/texte d'attaque pour lancer une action voulue, meme si le user dit "machin", "pas d'idee de technique" ou "pas un pave".
- prepare_defense_card: demande explicite de carte/filet/protection/anti-craquage pour un moment de risque, stress, fatigue, tentation ou rechute. Si le user dit "carte de defense", route defense meme si la phrase contient "demarrer".
- create_recurring_reminder: rappel/ping/check/petit message recurrent.
- update_coach_preferences: changement durable du style Sophia seulement si le user demande d'appliquer pour la suite/desormais.
- select_state_potion: potion ou aide d'etat explicitement demandee.
- Multi-intent: si le message demande clairement A et B, conserve toutes les intentions. Exemple: "rappelle-moi dans 10 minutes de prendre mes medicaments, et la tout de suite j'aimerais qu'on cree une carte d'attaque" => direct_effects create_one_shot_reminder pour le rappel + tool_skill_intents prepare_attack_card pour la carte; le rappel ne doit pas absorber la carte.

flow_opportunity:
- flow_opportunity signale une occasion implicite a verifier; le user ne demande pas explicitement le flow et ne connait pas forcement la surface. Ce champ ne lance rien: le runtime aval demandera confirmation avant toute suite.
- Conditions: aucun tool_skill_intent explicite, aucun skill_signals.entry explicite plus fort, pas safety high/critical, pas simple discussion humaine ordinaire, signal concret/actionnable/non intrusif, pas de refus utilisateur du support concerne.
- Remplis target_kind, target_flow, opportunity_id, confidence, score, priority, reason, evidence, seed_context.target_hint si disponible. Si tool_skill_intents ou skill_signals.entry explicite existe deja, flow_opportunity=null.
- Matrice:
  - create_recurring_reminder: oubli ou besoin de soutien regulier sans demande explicite de rappel. Exemple: "J'oublie tous les matins de boire de l'eau."
  - prepare_attack_card: friction de demarrage/procrastination sur une action voulue. Exemple: "Je tourne autour du dossier depuis trois jours."
  - prepare_defense_card: risque/craquage/tentation/schema repetitif. Exemple: "Le soir stresse, je repars scroller sans reflechir."
  - adjust_plan_item: plan/action trop lourd, flou, impossible a integrer, pas tenable, sans demande de modification. Exemple: "Cette semaine est trop compacte, je sens que je decroche."
  - update_coach_preferences: preference ou friction sur le style Sophia sans demande d'application. Exemple: "Quand tu poses trop de questions, je me ferme."
  - product_help: confusion implicite sur une surface Sophia. Exemple: "Je ne sais jamais ou retrouver ce genre de truc dans Sophia."
  - select_state_potion: pas d'opportunite implicite par defaut; seulement si potion mentionnee comme option ou aide d'etat demandee.

Skills conversationnels:
- product_help: fonctionnement/interface/surfaces Sophia; inclut "comment rendre une action du Plan plus concrete sans appliquer maintenant" => expliquer Ajustement du plan / plan.adjustment.
- status_recap: lecture factuelle read-only de l'etat reel Sophia.
- emotional_repair: honte, auto-attaque, culpabilite forte, detresse emotionnelle non safety.
- demotivation_repair: decouragement, fatigue motivationnelle, perte de sens, evitement/intimidation sans crise safety.
- safety_crisis: ne le mets pas dans skill_signals; eleve safety.risk_band high/critical.
- Un besoin d'appui, soutien, support, présence ou coup de pouce sans demande explicite d'être rappelé/notifié/programmé et sans moment/delai n'est jamais create_one_shot_reminder.

needs_research:
- value=true si reponse finale exige infos fraiches/exterieures/verifiables ou si le user demande "cherche/verifie/regarde sur internet/source": actualites, prix, disponibilites, horaires, lois/regles, dirigeants, versions logiciels/API, restaurants/voyages/produits.
- query court et autonome; domain_hint court si utile. Pas de research pour memoire Sophia, plan personnel ou produit interne sauf demande web explicite.

memory_plan:
- Toujours present. Il decide le retrieval pour repondre maintenant, pas la memoire durable.
- Defaut: memory_mode=none, context_need=minimal, context_budget_tier=tiny, targets=[].
- model_tier_hint=lite est reserve aux interactions vraiment triviales: salutations, "ca va ?", "quoi de beau ?", remerciement ou reaction courte sans demande, produit, emotion, preference, correction, plan ni verification Sophia.
- Par defaut, utilise model_tier_hint=standard pour tout le reste. N'utilise pas lite simplement parce que reasoning_complexity semble low.
- Utilise deep pour synthese complexe, arbitrage delicat, forte charge emotionnelle non safety ou contraintes multiples.
- Si action du plan clairement mentionnee: action_reference + target memory_plan type action. Habitude => expansion_policy=exact_then_action_family_recent; mission/clarification => exact_action_only.
- Si niveau/transition/objectif principal mentionne: level_reference + target type level, expansion_policy=include_level_execution_handoff.
- Pour "hier", "cette semaine", "ces derniers jours", "ca va mieux/pire qu'avant": target runtime_snapshot key="daily_conversation_pulse:current_week".
- targets autorises: topic, event, action, level, entity, domain_key, domain_prefix, runtime_snapshot. retrieval_policy: force_taxonomy, taxonomy_first, semantic_first, semantic_only.
${domainRegistryPromptLines().join("\n")}

WhatsApp et onboarding:
- Sans flow local actif dans l'input global, "ok", "ouais", "vas-y", "go", "yep", "fais", "fais-le", "👍" et "✅" restent conversationnels ou ambigus, sauf demande autonome explicite.
- Messages courts/emoji seuls restent routables. En onboarding actif, ne route pas vers le plan/action du jour par defaut; privilegie l'etape onboarding, les preferences explicites et les sorties utilisateur.
`.trim();

export function buildDispatcherPrompt(input: {
  user_message: string;
  recent_messages: Array<{ role: string; content: string }>;
  active_topic_state?: unknown;
  flow_state_context?: unknown;
  plan_snapshot?: unknown;
}): string {
  return JSON.stringify({
    prompt_version: DISPATCHER_V2_PROMPT_VERSION,
    user_message: input.user_message,
    recent_messages: input.recent_messages.slice(-8),
    active_topic_state: input.active_topic_state ?? null,
    flow_state_context: input.flow_state_context ?? null,
    plan_snapshot: input.plan_snapshot ?? null,
    active_action_candidates_for_direct_effects:
      activeActionCandidatesForDirectEffects(input.plan_snapshot ?? null),
    critical_routing_examples: [
      {
        user_message:
          "Tu peux me programmer un rappel récurrent tous les lundis à 9h pour préparer mon point hebdo ?",
        expected: {
          tool_skill_intents: [{
            operation_type: "create_recurring_reminder",
            explicitness: "explicit",
            target_hint:
              "rappel récurrent tous les lundis à 9h pour préparer mon point hebdo",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "create",
          }],
          skill_signals_entry: {},
          note:
            "C'est une demande d'action explicite, pas une question product_help sur le dashboard.",
        },
      },
      {
        user_message:
          "fais moi un truc d'attaque pour le machin du soir avec le carnet, j'ai pas d'idée de technique et j'ai pas envie d'un pavé",
        expected: {
          tool_skill_intents: [{
            operation_type: "prepare_attack_card",
            explicitness: "explicit",
            target_hint: "machin du soir avec le carnet",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "create",
            operation_input: {
              target_action_hint: "machin du soir avec le carnet",
              evidence: [
                "fais moi un truc d'attaque",
                "pour le machin du soir avec le carnet",
              ],
            },
          }],
          skill_signals_entry: {},
          note:
            "La technique manquante sera collectée par le Tool Skill; ne réponds pas en conseil conversationnel.",
        },
      },
      {
        user_message:
          "J'aimerais créer une carte de défense et une carte d'attaque.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [{
            operation_type: "prepare_defense_card",
            explicitness: "explicit",
            target_hint: "moment de risque à clarifier",
            confidence_band: "high",
            ambiguity: "target_ambiguous",
            user_intent: "create",
            operation_input: {
              target_hint: "moment de risque à clarifier",
              evidence: ["créer une carte de défense"],
            },
          }, {
            operation_type: "prepare_attack_card",
            explicitness: "explicit",
            target_hint: "action à clarifier",
            confidence_band: "high",
            ambiguity: "target_ambiguous",
            user_intent: "create",
            operation_input: {
              target_hint: "action à clarifier",
              evidence: ["créer une carte d'attaque"],
            },
          }],
          skill_signals_entry: {},
          note:
            "Deux tool skills platform explicites et compatibles: conserve les deux signaux. N'exécute rien depuis le chat; la clarification transverse doit demander par quoi commencer ou distinguer les cibles.",
        },
      },
      {
        user_message:
          "Demain matin je veux préparer une carte, mais j'hésite entre m'aider à sortir du lit et me protéger du téléphone au réveil.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [{
            operation_type: "prepare_attack_card",
            explicitness: "explicit",
            target_hint: "sortir du lit demain matin",
            confidence_band: "high",
            ambiguity: "target_ambiguous",
            user_intent: "create",
            operation_input: {
              target_action_hint: "sortir du lit demain matin",
              evidence: [
                "préparer une carte",
                "m'aider à sortir du lit",
              ],
            },
          }, {
            operation_type: "prepare_defense_card",
            explicitness: "explicit",
            target_hint: "réflexe téléphone au réveil",
            confidence_band: "high",
            ambiguity: "target_ambiguous",
            user_intent: "create",
            operation_input: {
              target_obstacle_hint: "téléphone au réveil",
              evidence: [
                "préparer une carte",
                "me protéger du téléphone au réveil",
              ],
            },
          }],
          skill_signals_entry: {},
          note:
            "Intention tool claire + deux cibles produit concurrentes. Ne réponds pas en normal_reply et ne choisis pas une carte à la place du user: laisse orientation_clarification arbitrer entre prepare_attack_card et prepare_defense_card.",
        },
      },
      {
        user_message:
          "J'aimerais que tu me rappelles dans 10 minutes de prendre mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque.",
        expected: {
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text:
                "J'aimerais que tu me rappelles dans 10 minutes de prendre mes médicaments",
              when_hint: "dans 10 minutes",
              instruction_hint: "prendre mes médicaments",
            },
          }],
          tool_skill_intents: [{
            operation_type: "prepare_attack_card",
            explicitness: "explicit",
            target_hint: "action à clarifier",
            confidence_band: "high",
            ambiguity: "target_ambiguous",
            user_intent: "create",
            operation_input: {
              target_action_hint: "action à clarifier",
              evidence: [
                "là tout de suite",
                "crée une carte d'attaque",
              ],
            },
          }],
          skill_signals_entry: {},
          note:
            "Deux demandes explicites compatibles dans le même tour: exécute seulement le rappel ponctuel via direct_effect, mais conserve aussi prepare_attack_card comme tool_skill_intent non-mutant pour que l'agenda puisse reprendre après le succès du rappel. Le rappel ne doit pas absorber la clause carte.",
        },
      },
      {
        user_message:
          "Je ne sais pas si je veux juste comprendre les cartes d'attaque ou en préparer une pour mon action du matin.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          flow_opportunity: {
            opportunity_id: "prepare_attack_card.understand_or_prepare",
            target_kind: "tool_skill",
            target_flow: "prepare_attack_card",
            confidence: "medium",
            priority: 60,
            reason: "user_hesitates_between_product_help_and_preparation",
            evidence: [
              "comprendre les cartes d'attaque",
              "en préparer une pour mon action du matin",
            ],
            seed_context: {
              target_hint: "action du matin",
              surface: "attack_card",
            },
          },
          skill_signals_entry: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "user_also_asks_to_understand_attack_cards",
            },
          },
          note:
            "Hésitation explicite entre comprendre la surface produit et préparer l'objet: conserve les deux candidats structurés pour la clarification transverse; ne choisis pas product_help seul.",
        },
      },
      {
        user_message:
          "Comment je peux rendre l'action 'ranger mes papiers' plus concrète demain matin sans toucher au reste du Plan ?",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          flow_opportunity: null,
          skill_signals: {
            entry: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "user_asks_product_surface_for_plan_action_refinement",
              },
            },
            lifecycle: {},
            exit: {},
          },
          note_information: {
            source_flow_id: "global_dispatcher",
            target_dispatcher: "product_help",
            handoff_reason: "explicit_user_request",
            handoff_context_for_next_dispatcher:
              "Question de fonctionnement Sophia: expliquer quelle surface utiliser pour rendre une action existante du Plan plus concrète sans appliquer de changement depuis le chat.",
            user_words: [
              "rendre l'action 'ranger mes papiers' plus concrète",
              "sans toucher au reste du Plan",
            ],
            structured_context: {
              primary_signal_path: "skill_signals.entry.product_help",
              target_kind: "skill",
              target_flow: "product_help",
              product_feature_id: "plan.adjustment",
              related_tool_flow: "adjust_plan_item",
              user_goal:
                "rendre une action existante du Plan plus concrète demain matin",
              constraints: ["sans toucher au reste du Plan"],
              evidence: [
                "Comment je peux rendre l'action",
                "sans toucher au reste du Plan",
              ],
              recommended_next_focus:
                "Expliquer Ajustement du plan / plan.adjustment comme ajustement ciblé d'une action existante, sans mutation immédiate.",
            },
            confidence: "high",
          },
          note:
            "Question produit sur la bonne surface Sophia pour affiner une action existante du Plan: product_help avec focus plan.adjustment / adjust_plan_item. Aucun tool_skill_intent tant que le user ne demande pas d'appliquer.",
        },
      },
      {
        // L3 migration: detectsExplicitOneShotReminderCreate.
        // Bug historique A4-r4 T8/T9: payload_hint vide → aucun rappel créé.
        user_message:
          "Programme-moi un rappel ponctuel demain à 11h35 pour payer la facture.",
        expected: {
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text:
                "Programme-moi un rappel ponctuel demain à 11h35 pour payer la facture.",
              when_hint: "demain 11h35",
              instruction_hint: "payer la facture",
            },
          }],
          tool_skill_intents: [],
          skill_signals_entry: {},
          note:
            "Demande de rappel ponctuel avec moment identifiable: direct_effect create_one_shot_reminder. payload_hint DOIT contenir raw_text complet pour que le runtime aval puisse extraire scheduled_for et instruction. Ne déduis PAS prepare_attack_card d'une simple instruction de rappel qui décrit une action concrète. En revanche, si le même message contient aussi une demande explicite distincte de créer/préparer une carte d'attaque, conserve les deux signaux structurés.",
        },
      },
      {
        // L3 migration: detectsActiveToolCancellation.
        // Bug historique: prepare_attack_card actif continuait à demander
        // des slots alors que le user disait "pas de carte".
        user_message:
          "Non, pas de carte. Annule ce flow et donne-moi seulement l'action: ouvrir les deux PDF.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_exit: {
            prepare_attack_card: {
              detected: true,
              reason: "user_explicit_no_card_cancels_active_flow",
            },
          },
          note:
            "Si un tool_skill_intake actif (prepare_attack_card/prepare_defense_card) attend des slots et le user dit 'pas de carte' / 'annule ce flow' / 'sans carte': c'est un exit explicite du tool skill. Ne mets PAS tool_skill_intents (même prepare_attack_card) et ne reprends pas la collecte de slots. La conversation continue en normal_reply.",
        },
      },
      {
        // L3 migration: detectsDurableCoachPreference.
        // Différencier "garde comme préférence" (intent explicite) vs
        // "tu poses trop de questions" (opportunité, pas intent).
        user_message:
          "Pour la suite, enregistre une préférence durable: quand je dis 'court', zéro emoji, trois lignes max, et pas de question finale si elle n'est pas nécessaire.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [{
            operation_type: "update_coach_preferences",
            explicitness: "explicit",
            target_hint:
              "quand je dis 'court', zéro emoji, trois lignes max, pas de question finale",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "update",
          }],
          skill_signals_entry: {},
          note:
            "Marqueurs combinés ('pour la suite' / 'enregistre' / 'garde comme préférence' / 'préférence durable') + contenu de préférence concret = update_coach_preferences explicite. C'est un tool_skill_intent, PAS une opportunité coach_preferences. Différent du cas 'tu poses trop de questions' qui reste une opportunité sans intent.",
        },
      },
      {
        // QA 2026-06-08 r2 Tour 1:
        // "pour la suite" + demande de style concret = update_coach_preferences.
        user_message:
          "Pour la suite, limite vraiment les questions et réponds plus directement quand je suis bloqué.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [{
            operation_type: "update_coach_preferences",
            explicitness: "explicit",
            target_hint:
              "moins de questions et ton plus direct quand le user est bloqué",
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "update",
            operation_input: {
              preference_type: "coach_style",
              requested_settings: [
                "coach.question_tendency",
                "coach.tone",
              ],
              evidence: [
                "Pour la suite",
                "limite vraiment les questions",
                "réponds plus directement",
              ],
            },
          }],
          skill_signals_entry: {},
          note:
            "Demande explicite de changement durable du style de Sophia: route update_coach_preferences. Ne réponds pas en normal_reply comme si c'était déjà appliqué.",
        },
      },
      {
        // L3 migration: detectsExplicitProductHelp.
        // Question sur l'emplacement/modification d'une surface dans l'app.
        // Bug historique A2-r4 T8: route vers prepare_attack_card au lieu
        // de product_help quand le user demande "où je retrouve cette carte".
        user_message:
          "Où est-ce que je retrouve cette carte d'attaque dans l'app ? Juste l'emplacement, pas d'action.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_entry: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "user_asks_app_location_for_durable_surface",
            },
          },
          note:
            "Question sur l'emplacement / modification / annulation d'une surface durable dans l'interface (carte d'attaque, carte de défense, rappel, préférence) = product_help. Ne mets PAS tool_skill_intents prepare_attack_card juste parce que le mot 'carte' apparaît. Marqueurs: 'où', 'dans l'app', 'dans l'application', 'retrouver', 'modifier', 'annuler', 'supprimer' + nom de surface.",
        },
      },
      {
        // L3 migration: detectsExactDurableStatus.
        // Demande de vérification d'état durable sans modification.
        user_message:
          "Sans rien modifier, vérifie ce qui est vraiment en place côté carte, rappel et préférence coach.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_entry: {
            status_recap: {
              detected: true,
              confidence_band: "high",
              reason: "user_requests_durable_status_without_mutation",
            },
          },
          note:
            "Demande de vérification d'état durable sans modification ('sans rien modifier', 'vraiment enregistré', 'ce qui est vraiment cree', 'confirme/non confirmé', 'statut fiable') = skill_signals.entry.status_recap. Aucun tool_skill_intent, aucun direct_effect, aucune opportunité. Le user veut lire, pas écrire.",
        },
      },
      {
        // QA 2026-06-08 status_recap R2 T1: "point factuel" doit entrer
        // dans status_recap, pas normal_reply/product_help.
        user_message:
          "Fais-moi un point factuel sur ce qui existe vraiment dans mon espace, sans rien changer.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_entry: {
            status_recap: {
              detected: true,
              confidence_band: "high",
              reason: "user_requests_factual_status_of_real_user_space",
            },
          },
          note:
            "Une demande de point factuel sur l'état réel de l'espace utilisateur = status_recap. Ne route pas normal_reply: le user veut une lecture DB-grounded. Ne route pas product_help: il ne demande pas comment utiliser l'espace.",
        },
      },
      {
        // QA 2026-06-08 status_recap R2 T3: source/follow-up d'un status.
        user_message: "Tu peux m'expliquer les sources de ce point factuel ?",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_entry: {
            status_recap: {
              detected: true,
              confidence_band: "high",
              reason: "user_requests_sources_for_status_recap",
            },
          },
          note:
            "Quand le user demande les sources d'un point factuel/status, status_recap explique les sources filtrées. Ne route pas product_help sauf question d'interface générale.",
        },
      },
      {
        // CHANTIER C7 (2026-05-28) — A4-r6 T5. "crée le 2e rappel ... même
        // texte" était émis en prepare_attack_card. Un rappel ponctuel
        // (ordinal + heure + texte) n'est JAMAIS une carte d'attaque, même
        // quand l'instruction décrit une action concrète.
        user_message:
          "Oui, crée le deuxième rappel à 11h37 avec exactement le même texte : envoyer à Noa la page corrigée avec les trois fichiers classés. Garde celui de 11h21 actif.",
        expected: {
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text:
                "Oui, crée le deuxième rappel à 11h37 avec exactement le même texte : envoyer à Noa la page corrigée avec les trois fichiers classés. Garde celui de 11h21 actif.",
              when_hint: "aujourd'hui 11h37",
              instruction_hint:
                "envoyer à Noa la page corrigée avec les trois fichiers classés",
            },
          }],
          tool_skill_intents: [],
          skill_signals_entry: {},
          note:
            "Création d'un rappel ponctuel supplémentaire ('crée le deuxième/2e rappel à HH avec le même texte') = direct_effect create_one_shot_reminder. NE PAS émettre prepare_attack_card: un ordinal de rappel + une heure + un texte de message n'est pas une carte d'attaque, même si l'instruction décrit une action concrète.",
        },
      },
      {
        // CHANTIER C7 (2026-05-28) — A4-r6 T10. Question d'état multi-entités
        // incluant "quelle préférence coach est appliquée" était émise en
        // update_coach_preferences. Une QUESTION sur la préférence appliquée
        // est une LECTURE (status), pas une demande de modification.
        user_message:
          "Statut fiable sans rien modifier : quelle carte est active, quels rappels sont confirmés avec heure exacte, et quelle préférence coach est appliquée ?",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_entry: {
            status_recap: {
              detected: true,
              confidence_band: "high",
              reason: "user_requests_durable_status_without_mutation",
            },
          },
          note:
            "Question d'état durable, MÊME quand elle contient 'quelle préférence coach est appliquée'. Marqueurs de lecture: 'sans rien modifier' + interrogatifs 'quelle/quels'. NE PAS émettre update_coach_preferences: demander QUELLE préférence est active n'est pas demander de la CHANGER. Route via skill_signals.entry.status_recap.",
        },
      },
      {
        // CHANTIER C7 (2026-05-28) — A9-r1 T12. "ajoute le repère
        // conversationnel: carnet bleu fermé = deux phrases à Léa" était émis
        // en update_coach_preferences. Un repère est une note mémoire
        // PERSONNELLE (comportement du user), pas une préférence sur le STYLE
        // de Sophia.
        user_message:
          "Ajoute juste le repère conversationnel: carnet bleu fermé = deux phrases à Léa avant tout tri.",
        expected: {
          direct_effects: [],
          tool_skill_intents: [],
          skill_signals_entry: {},
          note:
            "'Ajoute / note / retiens un repère conversationnel' (un aide-mémoire sur le comportement du USER, ex: 'carnet bleu fermé = deux phrases à Léa') = mémoire durable personnelle, captée par l'extraction durable en aval. NE PAS émettre update_coach_preferences: cet outil ne concerne QUE le style/ton/exigence de SOPHIA, pas les repères personnels du user. Route normal_reply.",
        },
      },
    ],
  });
}
