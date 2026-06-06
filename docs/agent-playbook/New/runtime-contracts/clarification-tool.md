# clarification_tool Runtime Contract

## Mental Model

`clarification_tool` est une primitive LLM transverse, non-mutante et
indépendante des flows métier. Elle reçoit des candidats déjà préparés par le
dispatcher ou par un skill conversationnel actif, puis elle choisit parmi ces
candidats ou pose une seule question discriminante.

Le dispatcher ne résout pas lui-même l'ambiguïté. Il conserve les signaux
concurrents structurés dans le `TurnFrame`, délègue à l'arbitrator de
clarification, puis bloque toute exécution tant que la clarification n'est pas
résolue.

## Runtime Shape

Chemin dispatcher canonique :

1. Dispatcher L1 produit un `TurnFrame`.
2. `router/clarification_candidate_builder.ts` construit des candidats depuis
   les signaux structurés du `TurnFrame`.
3. `router/clarification_arbitrator.ts` appelle `runClarificationTool`.
4. Si le statut est `ask` ou `still_ambiguous`, le runtime route vers
   `orientation_clarification`.
5. `renderClarificationQuestion` fournit le seul message visible.
6. `writeClarificationState` stocke un état temporaire conversationnel.

Chemin skill conversationnel :

1. Le skill actif identifie une ambiguïté interne à son domaine.
2. Il fournit les candidats fermés et le contexte connu à
   `skills/_shared/clarification_adapter.ts`.
3. L'adapter appelle le même `clarification_tool`.
4. Le skill reste propriétaire de la suite métier après résolution.

## File Ownership

- `supabase/functions/sophia-brain/clarification/contract.ts` possède les types
  publics et `buildClarificationRequest`.
- `supabase/functions/sophia-brain/clarification/tool.ts` possède le prompt LLM,
  l'appel runner et la validation de sortie.
- `supabase/functions/sophia-brain/clarification/renderer.ts` rend uniquement
  la question utilisateur.
- `supabase/functions/sophia-brain/clarification/state.ts` possède l'état
  temporaire `__clarification_state_v1`.
- `supabase/functions/sophia-brain/router/clarification_candidate_builder.ts`
  convertit uniquement des signaux `TurnFrame` structurés en candidats.
- `supabase/functions/sophia-brain/router/clarification_arbitrator.ts` décide si
  une clarification dispatcher doit démarrer ou reprendre.
- `supabase/functions/sophia-brain/skills/_shared/clarification_adapter.ts`
  expose l'appel commun pour les conversation skills.

## Inputs

- `clarification_id`.
- `owner` : `dispatcher`, `orientation_clarification`, skill ou flow appelant.
- `ambiguity_kind` : `intent`, `target`, `scope`, `surface`, `timing`,
  `confirmation` ou `handoff_readiness`.
- Message utilisateur courant et 8 messages récents maximum.
- `active_flow_state` et `known_context`, optionnels et non-mutants.
- Liste fermée de `ClarificationCandidate`.
- Contraintes forcées : `no_chat_mutation: true`, `max_questions: 1`,
  `avoid_internal_terms: true`.

## Outputs

`ClarificationToolOutput` contient :

- `status`: `ask`, `resolved`, `still_ambiguous`, `cancelled` ou
  `topic_change`.
- `selected_candidate_id`: `null` ou un id exact fourni dans les candidats.
- `confidence`: `low`, `medium` ou `high`.
- `question`: obligatoire pour `ask` et `still_ambiguous`.
- `handoff_notes` optionnel pour la suite du owner.

`reasoning_summary`, `candidate_id`, `surface_id` et `operation_type` ne sont
jamais rendus côté utilisateur.

## Invariants

- Aucune mutation DB.
- Aucune mutation de chat.
- Aucun pending confirmation exécutable.
- Aucun tool skill complexe lancé si une clarification est requise.
- Aucun effet durable direct pendant `orientation_clarification`.
- Le tool ne choisit jamais un candidat absent.
- `resolved` exige un `selected_candidate_id` valide.
- `confidence=low` ne peut pas rester `resolved`.
- `ask` et `still_ambiguous` doivent contenir une seule question courte.
- Safety `high` ou `critical` préempte la clarification produit.
- La question visible tutoie toujours l'utilisateur.

## Prompt Resources

`clarification/resources.ts` fournit de petites ressources injectées dans le
prompt LLM quand les candidats le nécessitent. Ces ressources n'ont pas le
droit de choisir l'intention ou de créer un candidat. Elles servent seulement à
améliorer la formulation et à donner le bon morceau de connaissance produit.

Ressources actives aujourd'hui :

- `style.tutoiement` : interdit le vouvoiement dans la question visible.
- `product_help.intent_slice` : rappelle que `product_help` est une explication
  produit courte.
- `product_help.attack_card_explanation_slice` : explique le rôle d'une carte
  d'attaque.
- `attack_card.prepare_action_slice` : rappelle qu'une carte d'attaque se
  prépare pour une action ou un démarrage concret.
- `attack_card.temporal_hint_policy` : si le message contient un repère comme
  demain ou matin, ce repère reste un contexte de l'action; la question ne doit
  pas dire "préparer une carte pour demain".
- `attack_card.action_anchor_hint` : conserve l'ancrage "ton action" ou "ton
  démarrage" quand il existe dans le message.

## Dispatcher Integration

Le point d'intégration est après production du `TurnFrame` et avant le choix
final des handlers exécutables :

`dispatcher L1 -> TurnFrame -> clarification arbitration -> routers/arbitrators -> owner runtime`

Le dispatcher a le droit d'exposer plusieurs signaux concurrents, mais pas de
trancher l'intention par règles locales. L'arbitrator construit les candidats
depuis :

- `direct_effects`;
- `tool_skill_intents`;
- `tool_skill_opportunity`;
- `skill_signals.entry`.

Il ne relit pas le message brut pour inventer une intention et ne remplit pas
les slots métier.

Quand le tool retourne `ask` ou `still_ambiguous`, le runtime produit :

- `response_owner: orientation_clarification`;
- `selected_handler: orientation_clarification`;
- `reason_code: clarification_required`;
- `direct_effects_to_run: []`.

Ces chemins doivent être bloqués :

- `tool_skill_router`;
- `product_help`;
- `operation_runtime_pipeline`;
- `direct_effects`.

Le message visible vient uniquement de `renderClarificationQuestion(output)`.

Quand le tool retourne `resolved`, le runtime ne doit pas exécuter
immédiatement. Il transmet une intention clarifiée à la suite normale du routing
ou au skill propriétaire selon le domaine, sans mutation dans le tour de
clarification.

### Composite Direct-Effect Follow-Up

Si le dispatcher produit un effet direct atomique exécutable mais que le
`payload_hint.raw_text` de cet effet ne couvre manifestement qu'une partie du
message utilisateur, le rendu post-opération peut ajouter une reprise
conversationnelle non-mutante du segment non couvert.

Ce fallback :

- ne choisit aucun skill ou tool par regex ;
- ne crée aucun `tool_skill_intent` ;
- ne lance aucun tool skill complexe ;
- ne remplace pas `clarification_tool` quand des candidats structurés existent ;
- sert seulement à ne pas perdre une deuxième demande explicite dans le
  transcript.

Si le second intent est structuré dans le `TurnFrame`, l'agenda/handoff dédié
reste prioritaire sur cette reprise générique.

## Conversation Skills Integration

Les conversation skills peuvent appeler le même outil via
`runSkillClarification` pour leurs ambiguïtés internes. Le skill fournit les
candidats et reste propriétaire de ses règles métier.

Priorités de branchement :

- `product_help` : explication produit vs demande d'action ou préparation
  d'objet.
- `emotional_repair` : besoin émotionnel immédiat vs potion vs carte d'action
  consentie vs problème de plan.
- `demotivation_repair` : perte de sens vs fatigue vs action trop grosse vs
  plan mal calibré vs carte d'action consentie.
- `weekly_adaptive_review_v1` : récapitulatif vs recommandation vs handoff
  adjust plan vs micro-action.

Les tool skills complexes gardent leurs flows actuels pour cette étape.

## Allowed Changes

- Ajouter des owners de clarification.
- Ajouter des labels de candidats pour des ids structurés existants.
- Ajouter du contexte non-mutant à `known_context`.
- Ajouter des tests de builder, arbitrator, adapter et QA réelle.
- Ajuster la validation JSON et la normalisation de question.

## Forbidden Changes

- Résoudre une intention avec des regex ou mots-clés métier.
- Lire le message brut dans le builder pour choisir une famille.
- Faire du routing produit définitif dans `clarification_tool`.
- Exécuter un tool skill depuis la clarification.
- Créer, modifier ou supprimer des données métier.
- Afficher des ids techniques, `operation_type`, `surface_id` ou reasoning.

## Legacy Exceptions

Aucune. Toute logique legacy qui court-circuite
`orientation_clarification` sur une ambiguïté structurée doit être documentée
comme bug ou retirée.

## Required Tests

- Builder : one-shot + recurring présents => clarification.
- Builder : product_help + prepare_attack_card présents => clarification.
- Builder : un seul signal clair => pas de clarification.
- Builder : safety high/critical => pas de clarification produit.
- Arbitrator : `ask` => owner `orientation_clarification`.
- Arbitrator : `resolved` => aucun effet immédiat.
- Arbitrator : sortie modèle invalide => question fallback neutre.
- Adapter skill : appel partagé au tool.
- QA réelle via `/functions/v1/test-send-message` avec `force_full_ai=true`.

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                                   | Statut | Référence                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| 2026-06-01 | Intégration dispatcher via arbitrator dédié après `TurnFrame`, avant handlers exécutables, sans décision métier locale.    | Active | `router/clarification_arbitrator.ts`                             |
| 2026-06-01 | Exposition d'un adapter commun pour les conversation skills, le skill restant propriétaire de ses candidats et de la suite. | Active | `skills/_shared/clarification_adapter.ts`                        |
| 2026-06-01 | `orientation_clarification` devient owner runtime non-mutant quand une clarification transverse est nécessaire.             | Active | `contracts/route_decision.v1.ts`, `clarification/state.ts`       |
