# emotional_repair Runtime Contract

## Mental Model

`emotional_repair` est un conversation skill L5 non-mutant. Il répond aux tours
où l'émotion domine la demande: honte, culpabilité, auto-attaque, anxieté,
panique légère, réparation relationnelle et sortie progressive vers une action
concrète quand l'émotion baisse.

Le domaine ne fonctionne plus comme `message -> regex -> reply`. Son chemin
normal est:

```txt
SkillContext + user_message
  -> runEmotionalRepairStructuredIntake
  -> EmotionalRepairSkillDecision
  -> reduceEmotionalRepairTurn
  -> applyEmotionalRepairInvariants
  -> validateEmotionalRepairDecision
  -> renderer fallback si besoin
  -> ConversationSkillOutput
```

Le skill peut répondre, suggérer une opération avec consentement, demander un
handoff vers `safety_crisis`, et proposer des candidats mémoire non persistés
par défaut. Il ne commit jamais un effet durable.

## Dépend De L'Architecture De X

Ce domaine dépend de:

- `UserTurnSnapshot` pour lire l'état complet du tour;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair;
- `Confirmation Contract` pour garantir qu'un handoff complexe n'est pas une
  confirmation exécutable;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé;
- le contrat local de `emotional_repair` pour l'intake, le reducer, les effets
  préparés et le renderer.

Dans le code actuel, `emotional_repair` ne reçoit pas encore un objet
`UserTurnSnapshot` unique. Il consomme le snapshot dérivé que `router/run.ts`
prépare dans `buildSkillContextForRecommendation`, sous forme de `SkillContext`:
`turn_frame`, `recent_messages`, `active_skill_working_state`, `plan_items`,
`product_surfaces` et identifiants utilisateur. Le skill lit notamment
`context.turn_frame.safety.risk_band`, `source_message_id`, les signaux
conversationnels et les éléments de contexte déjà admis par le dispatcher. Il ne
relit pas la base de données pour comprendre le tour.

`TurnAgenda` reste une responsabilité du runtime global: il décide quel type de
travail est ouvert pour le tour (`reply`, `effect`, `status`, `memory`,
`repair`). `emotional_repair` ne modifie pas cette agenda. Quand il est appelé,
il possède uniquement la réponse de réparation émotionnelle et les suggestions
non-mutantes associées. Si le tour doit devenir une action concrète, le skill
propose `prepare_attack_card` ou `prepare_defense_card` avec consentement; il ne
prépare pas la carte lui-même.

Le `Confirmation Contract` n'est pas implémenté localement par ce domaine.
`emotional_repair` peut produire une `operation_suggestions` pour
`select_state_potion`, `prepare_attack_card`, `prepare_defense_card` ou
`create_recurring_reminder`, mais toujours avec `requires_user_consent: true`.
Pour les flows complexes, l'interprétation d'un
"oui", "non", "modifie" ou "explique" appartient ensuite au platform handoff
skill actif; elle ne devient pas une confirmation exécutable.

`EffectLedger` est contraignant même si le skill ne commit aucun effet. Les
fonctions `validateEmotionalRepairDecision` et `reduceEmotionalRepairTurn`
interdisent les formulations de type "c'est fait", "j'ai créé", "programmé" ou
"enregistré". Les suggestions d'opération sont seulement préparées via
`toConversationOperationSuggestion`; aucun `committed_effects`, `executedTools`
ou write DB ne doit être produit par ce skill.

Le contrat local est propriétaire des décisions métier du domaine: `contract.ts`
définit `EmotionalRepairSkillDecision`, les intents, phases, contraintes,
handoffs safety, suggestions, invariants et validations; `intake.ts` appelle l'intake
IA structuré; `reducer.ts` transforme la décision en `ConversationSkillOutput`;
`renderer.ts` fournit uniquement un fallback conservateur quand l'intake échoue
ou quand la reply modèle viole le contrat.

## Runtime Shape

```txt
router/run.ts
  runConversationSkillForRecommendation
    -> runEmotionalRepairSkill

skills/emotional_repair/skill.ts
  safetyHandoffEmotionalRepairOutput si risk_band high/critical
  runEmotionalRepairStructuredIntake
  reduceEmotionalRepairTurn

skills/emotional_repair/intake.ts
  generateWithGemini en chemin normal
  normalizeEmotionalRepairDecision
  retour { decision, errors, raw }

skills/emotional_repair/reducer.ts
  applyEmotionalRepairInvariants
  validateEmotionalRepairDecision
  renderSafeEmotionalRepairReply si reply invalide
  buildFallbackEmotionalRepairDecision si décision inutilisable
  sanitizeEmotionalRepairMemoryCandidates
  outputFromDecision
```

Le routeur peut sélectionner `emotional_repair` et bloquer temporairement un
tool skill quand `routers/routers.ts` applique la priorité `emotion_dominates`.
Cette priorité est de l'arbitrage global. Elle ne doit pas contenir de
compréhension locale de honte, no-potion, relationnel ou action bloquée.

## File Ownership

- `supabase/functions/sophia-brain/skills/emotional_repair/contract.ts` possède
  le contrat: `EmotionalRepairIntent`, `EmotionalRepairConstraint`,
  `EmotionalRepairPhase`, `EmotionalRepairSkillDecision`,
  `normalizeEmotionalRepairDecision`, `validateEmotionalRepairDecision`,
  `applyEmotionalRepairInvariants` et `toConversationOperationSuggestion`.
- `supabase/functions/sophia-brain/skills/emotional_repair/intake.ts` possède
  l'intake structuré: `runEmotionalRepairStructuredIntake`, le modèle injectable
  `EmotionalRepairIntakeModel`, le prompt d'entrée et l'appel
  `generateWithGemini`.
- `supabase/functions/sophia-brain/skills/emotional_repair/reducer.ts` possède
  la transition d'état du tour: `reduceEmotionalRepairTurn`,
  `safetyHandoffEmotionalRepairOutput`, `statusForDecision`,
  `responseIntentForDecision`, `outputFromDecision` et
  `sanitizeEmotionalRepairMemoryCandidates`.
- `supabase/functions/sophia-brain/skills/emotional_repair/renderer.ts` possède
  le fallback visible conservateur: `renderSafeEmotionalRepairReply` et
  `buildFallbackEmotionalRepairDecision`. Il ne reclassifie pas le message.
- `supabase/functions/sophia-brain/skills/emotional_repair/skill.ts` est la
  façade publique `runEmotionalRepairSkill`: safety d'abord, intake structuré,
  reducer.
- `supabase/functions/sophia-brain/skills/emotional_repair/context_loader.ts`
  charge l'état actif du skill si le runtime le demande.
- `supabase/functions/sophia-brain/skills/emotional_repair/prompt.ts` possède le
  prompt d'intake IA et ses règles de réponse; il ne force pas d'emoji.
- `supabase/functions/sophia-brain/router/run.ts` intègre le skill via
  `runConversationSkillForRecommendation` et doit rester un orchestrateur mince.
- `supabase/functions/sophia-brain/routers/routers.ts` peut arbitrer la priorité
  `emotion_dominates`, mais ne possède pas la sémantique émotionnelle du skill.

## Inputs

Le skill reçoit:

- `user_message`;
- `SkillContext.recent_messages`;
- `SkillContext.active_skill_working_state`;
- `SkillContext.turn_frame`;
- `SkillContext.plan_items`;
- `SkillContext.product_surfaces`;
- des `explicit_constraints` déjà connus, si le dispatcher en fournit;
- un `intake_model` injectable pour les tests.

L'intake structuré doit décider les champs du contrat à partir de ce contexte:
intent, phase, dominance émotionnelle, domaine, contraintes, contrat de réponse,
handoff safety, suggestions d'opération, candidats mémoire, reply et patch
d'état.

## Outputs

`reduceEmotionalRepairTurn` retourne un `ConversationSkillOutput` contenant:

- `status`: `continue`, `handoff` ou `exit`;
- `response_intent`: phase locale ou handoff explicite;
- `reply`: texte user-facing validé ou rendu par fallback safe;
- `diagnosis`: décision structurée résumée;
- `recommendation_need`: `needed=false` sauf suggestion consentie;
- `operation_suggestions`: uniquement suggestions consenties;
- `handoff_request`: `safety_crisis` si applicable;
- `memory_write_candidates`: candidats non persistés par défaut;
- `effects`: effets conversationnels dérivés des suggestions/candidats/handoff;
- `state_patch`: trace locale de la décision.

Pour `select_state_potion`, les seules potions suggérables par ce skill sont :

- `guerison` quand l'épisode émotionnel est assez posé et que le besoin durable
  est de réparer sans figer la honte ou la culpabilité;
- `amour` quand le besoin durable est chaleur, douceur ou regard moins dur
  envers soi;
- `apaisement` quand la pression ou la tension reste le thème principal après
  stabilisation.

Le bridge potion est une transition interne stricte :

- état initial : `emotional_repair` reste propriétaire du repair conversationnel
  tant que honte, culpabilité, panique ou auto-attaque dominent;
- condition de maturité : l'émotion est assez stabilisée et le besoin durable
  est nommé comme douceur, réparation ou apaisement;
- type de potion : uniquement `amour`, `guerison` ou `apaisement`;
- consentement : la reply doit proposer la potion en complément et demander
  l'accord utilisateur, jamais annoncer une activation;
- exclusions : pas de `product_help` générique, pas de plan edit, pas de carte
  d'attaque, pas de carte de défense, pas de priorisation ou prochaine action
  dans ce bridge sauf demande produit/opération explicite du user.

Chaque suggestion `select_state_potion` doit porter
`operation_input_hint.context.handoff_summary`: 1 à 3 phrases avec l'épisode ou
l'émotion stabilisée, les mots utilisateur importants et le besoin durable que
la potion doit soutenir.

## Responsibilities Owned By emotional_repair

- Séparer le vécu émotionnel de la conclusion identitaire.
- Stabiliser honte, culpabilité, auto-attaque, anxieté ou panique légère sans
  pousser un plan quand le contrat l'interdit.
- Répondre au contexte relationnel comme une question de lien et de réparation,
  pas comme un problème de productivité.
- Produire une phrase concrète de réparation relationnelle quand l'intake
  structurée le décide et que le contrat le permet.
- Respecter `no_potion`, `no_tool`, `no_plan`, `no_questions`,
  `one_question_max`, `short_reply` et `do_not_persist_identity_attack`.
- Protéger la mémoire contre l'identity freeze: `should_persist_default=false`,
  `anti_identity_freeze_checked=true`, texte contextualisé si une auto-attaque
  brute apparaît.
- Proposer `prepare_attack_card` ou `prepare_defense_card` quand l'émotion est
  basse ou moyenne et que la décision structurée indique que l'utilisateur est
  prêt à agir.
- Demander un handoff vers `safety_crisis` si `turn_frame.safety.risk_band` est
  `high` ou `critical`.
- Fournir une réponse courte non-mutante si l'intake IA échoue ou si la reply
  modèle viole seulement le contrat de rendu.

## Responsibilities Not Owned By emotional_repair

- Exécuter une potion, créer un rappel, écrire en base, modifier un plan ou
  confirmer un effet durable.
- Interpréter les réponses `approve`, `reject`, `revise`, `explain` pour un
  handoff complexe: cela appartient au platform handoff skill propriétaire.
- Construire ou exécuter une carte d'action: cela appartient aux tool skills
  `prepare_attack_card` et `prepare_defense_card`.
- Répondre à une crise safety avec contenu de crise: cela appartient à
  `safety_crisis`.
- Ajouter une priorité de route ou un patch de réponse dans `run.ts`.
- Stocker une auto-attaque comme fait durable sur l'identité de l'utilisateur.
- Utiliser des regex métier pour décider honte, action bloquée, relationnel,
  no-potion ou handoff.

## Non-Negotiable Invariants

- Safety gagne toujours: `risk_band` high/critical retourne un handoff
  `safety_crisis`, sans fallback émotionnel local.
- L'échec d'intake ne produit pas une sortie vide: `reduceEmotionalRepairTurn`
  retourne un output non-mutant, sans tool et sans mémoire persistée.
- Les replies invalides ne passent pas: `validateEmotionalRepairDecision` bloque
  les plans interdits, trop de questions, mention potion interdite, wording
  d'effet durable et handoff safety mal formé.
- `no_potion` bloque à la fois `select_state_potion` et toute mention visible de
  potion.
- `no_tool` vide les suggestions d'opération.
- Une émotion aiguë, une honte dominante, une auto-attaque, une panique ou une
  détresse occupe d'abord `emotional_repair`; `guerison`, `amour` ou
  `apaisement` ne peuvent sortir qu'en complément consenti après stabilisation.
- Les suggestions d'opération doivent toutes avoir
  `requires_user_consent: true`.
- Aucun wording "c'est fait", "j'ai créé", "programmé" ou "enregistré" ne peut
  sortir de ce skill.
- Les candidats mémoire restent non persistés par défaut.
- Une auto-attaque brute ne doit pas survivre comme `source_text` mémoire quand
  `intent=acute_self_attack` ou `do_not_persist_identity_attack` est présent.
- Le renderer fallback reçoit une décision ou un mode technique conservateur; il
  ne refait pas de classification par regex.
- `run.ts` et `routers.ts` ne doivent pas ajouter de fallback sémantique
  spécifique `emotional_repair`.

## Integration Points

- `router/run.ts`: `runConversationSkillForRecommendation` construit le
  `SkillContext` et appelle `runEmotionalRepairSkill`.
- `routers/routers.ts`: la branche `emotion_dominates` peut choisir
  `conversation_handler` et bloquer `tool_skills` pour le tour.
- `prepare_attack_card` et `prepare_defense_card`: peuvent être suggérés avec
  consentement quand l'action concrète émerge après stabilisation émotionnelle.
- `safety_crisis`: reçoit les handoffs safety avant intake IA.
- `select_state_potion`: peut être suggéré seulement si le contrat autorise les
  tools, autorise la potion et demande le consentement utilisateur. La
  suggestion doit transmettre `operation_input_hint.context.handoff_summary`
  pour que le sous-skill potion conserve le contexte déjà clarifié.
- `create_recurring_reminder`: peut être suggéré seulement quand l'intake
  structurée décide `asks_recurring_support` et demande le consentement.
- Mémoire conversationnelle: reçoit au maximum des candidats via
  `statementCandidate`, jamais un write durable committé par ce skill.

## Allowed Changes

- Ajouter un intent, une contrainte ou une phase dans `contract.ts` si le
  prompt, le normalizer, la validation, le reducer et les tests sont mis à jour
  ensemble.
- Renforcer un invariant de filtrage dans `applyEmotionalRepairInvariants` ou
  `validateEmotionalRepairDecision`.
- Améliorer `renderer.ts` pour rendre un fallback plus sobre, tant qu'il ne
  reclassifie pas le message et ne crée pas d'effet durable.
- Ajouter des tests stubbés via `intake_model` pour couvrir une nouvelle branche
  du contrat.
- Extraire davantage de reducer helpers depuis `reducer.ts` si le contrat de
  sortie reste identique.

## Forbidden Changes

- Ajouter dans `run.ts`, `routers.ts` ou L3/L4 une regex honte, no-potion,
  action bloquée, relationnelle ou handoff.
- Ajouter une reply user-facing hardcodée dans `skill.ts` ou `run.ts`.
- Exécuter `select_state_potion` ou `create_recurring_reminder` depuis
  `emotional_repair`.
- Émettre `executedTools`, `committed_effects` ou un write DB depuis ce skill.
- Dire ou laisser dire qu'un effet durable est fait sans preuve EffectLedger.
- Persister par défaut une mémoire issue d'auto-attaque.
- Réintroduire l'obligation d'emoji dans le prompt.
- Faire du fallback technique une nouvelle compréhension métier.

## Legacy Exceptions

Il ne reste pas de patch L4 spécifique `emotional_repair` dans `run.ts` pour
no-potion, reply additive ou action bloquée. Les anciennes protections ont été
remplacées par le contrat local, le reducer et les validations.

Deux limites transitionnelles restent documentées:

- le runtime passe encore un `SkillContext` dérivé plutôt qu'un
  `UserTurnSnapshot`/`TurnAgenda` unique et typé de bout en bout;
- `routers/routers.ts` conserve l'arbitrage global `emotion_dominates` pour
  protéger la réponse conversationnelle contre un tool skill concurrent.

Ces limites peuvent être supprimées seulement quand le runtime global exposera
une frame versionnée commune aux conversation skills et quand l'agenda portera
l'arbitrage `repair` vs `effect` sans branche locale.

## Required Tests

Le contrat est protégé par
`supabase/functions/sophia-brain/skills/skills_s3.test.ts` avec les groupes
`emotional_repair`:

- scénarios de honte/auto-attaque sans push de solution;
- mémoire anti-identity-freeze;
- suggestion de carte d'action quand l'émotion baisse;
- no-potion qui filtre suggestion et reply;
- réparation relationnelle;
- support récurrent seulement sur demande explicite;
- absence de done language;
- budget maximal de questions;
- safety qui gagne sur le fallback émotionnel;
- échec intake qui retourne une reply safe non-mutante;
- reply modèle invalide remplacée par le renderer safe;
- prompt qui ne force pas d'emoji.

Vérifications minimales avant modification runtime:

```bash
deno test --allow-env --allow-net --allow-read --filter "emotional_repair" supabase/functions/sophia-brain/skills/skills_s3.test.ts
deno check supabase/functions/sophia-brain/skills/emotional_repair/skill.ts supabase/functions/sophia-brain/skills/emotional_repair/intake.ts supabase/functions/sophia-brain/skills/emotional_repair/contract.ts supabase/functions/sophia-brain/skills/emotional_repair/prompt.ts supabase/functions/sophia-brain/skills/emotional_repair/renderer.ts supabase/functions/sophia-brain/skills/emotional_repair/reducer.ts
deno check supabase/functions/sophia-brain/router/run.ts
```

Vérification d'architecture:

```bash
rg -n "applyShortRepairNoProductOfferGuard|buildRouteDecisionConversationAddon|ROUTING CONVERSATIONNEL ACTIF: emotional_repair|emotionalRepairContext" supabase/functions/sophia-brain/router/run.ts
```

Cette recherche doit rester vide pour éviter la réintroduction de legacy L4.

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                                               | Statut | Référence |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| 2026-05-29 | `emotional_repair` porte no-potion, carte d'action consentie et mémoire anti-identity-freeze dans son contrat L5, pas dans `run.ts`.   | Actif  | J8/J16    |
| 2026-05-30 | L'échec d'intake ou de validation passe par un renderer fallback conservateur non-mutant; aucune sortie vide ne doit quitter le skill. | Actif  | J21       |
| 2026-05-30 | Le contrat runtime documente `reducer.ts`, le fallback L5 et l'absence de legacy L4 spécifique dans `run.ts`.                          | Actif  | J46       |
