# QA Operation Suggestion - Test 1 - Alex - 2026-05-12 - attack-card-direct-r3

## 1. Contexte Du Test

- Date: 2026-05-12
- Run: `attack-card-direct-r3`
- Persona: Alex
- Connexion: `tests/real-personas/alex/connection.json`, JWT via `bash scripts/get-jwt.sh alex`
- Objectif: tester la demande directe de carte d'attaque pour une action claire du plan sommeil.
- Trajectoire: demande explicite de carte d'attaque -> draft operationnel -> confirmation utilisateur -> execution.
- Surfaces visees: dispatcher `operation_intent`, `operation_flow`, handler `prepare_attack_card`, confirmation pending, side effect DB `user_attack_cards`.
- Cadre IA reel: endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide sur `r3`. Deux tentatives precedentes (`r1`, `r2`) invalides avant conversation a cause d'un setup Auth local incomplet/refuse; la connexion locale Alex a ete restauree puis le run a ete repris depuis le tour 1.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-direct-r3.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-direct-r3.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-direct-r3.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Fais-moi une carte d attaque pour lancer mon sas de dechargement ce soir.

**Sophia**
> Je te propose de creer une carte d'attaque courte pour lancer mon sas de dechargement ce soir.: Fais la version 4 minutes de "lancer mon sas de dechargement ce soir.", assez petite pour ne pas negocier. Tu veux que je la cree ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=2be94e24-3929-4795-b32a-09f6f03f3a74`
- pending_confirmation: draft present in `operation_flow_run`, no executor yet
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: no attack card created before confirmation

### Tour 2

**User**
> oui vas-y

**Sophia**
> C'est fait. J'ai créé la carte d'attaque "Carte d'attaque - lancer mon sas de dechargement ce soir." : Fais la version 4 minutes de "lancer mon sas de dechargement ce soir.", assez petite pour ne pas negocier.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none outside operation flow
- operation: `status=executed`, `selected_handler=prepare_attack_card`, `operation_id=2be94e24-3929-4795-b32a-09f6f03f3a74`, `attack_card_id=12972864-00f0-47ec-b030-98b659730ce5`
- pending_confirmation: cleared
- memory_plan: not material to the turn
- executed_tools: `["prepare_attack_card"]`
- durable_effect: one active row in `user_attack_cards`

Durable DB observe:

- `user_attack_cards.id=12972864-00f0-47ec-b030-98b659730ce5`
- `status=active`
- `content.title=Carte d'attaque - lancer mon sas de dechargement ce soir.`
- `metadata.operation_id=2be94e24-3929-4795-b32a-09f6f03f3a74`
- `metadata.request_id=qa-operation-suggestion-test1-alex-2026-05-12-attack-card-direct-r3-t02`
- `plan_item_id=null`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia comprend immediatement que la demande est actionnable et propose une carte courte sans demander au user de parler en termes techniques.
- Tour 1: la confirmation est explicite avant creation.
- Tour 2: la reponse confirme l'effet cree et nomme la carte.

**Problemes**
- Tour 1: formulation visible maladroite, avec `ce soir.:` et une repetition lourde de "lancer mon sas de dechargement ce soir". Impact: experience utilisable mais peu polie. Severite: yellow.
- Tour 1-2: le wording reprend "mon sas" dans la bouche de Sophia, ce qui sonne moins naturel que "ton sas". Impact: petit frottement relationnel. Severite: yellow.

**Fix propose**
- Polir le template de confirmation `prepare_attack_card`: separer titre et instruction, supprimer la ponctuation double, convertir les libelles issus du user en formulation adressee a l'utilisateur quand ils sont affiches.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Pass: Tour 1 route bien vers `response_owner=operation_flow`, `selected_handler=prepare_attack_card`, `reason_code=operation_intent_start`.
- Pass: Tour 2 priorise correctement la confirmation pending avec `response_owner=pending_confirmation`, `selected_handler=execute_confirmed`, `reason_code=confirmation_yes`.

**Skills / Operations / Tools**
- Pass: aucun skill conversationnel ne prend la main sur la demande operationnelle directe.
- Pass: `prepare_attack_card` ne s'execute pas au tour 1; `tool_execution=blocked`, `executed_tools=[]`.
- Pass: `prepare_attack_card` s'execute seulement apres "oui vas-y"; `tool_execution=success`, `executed_tools=["prepare_attack_card"]`.

**Memory / Effets durables**
- Pass: une carte active est creee en DB apres confirmation seulement.
- Warning: la carte creee a `plan_item_id=null`, alors que la cible "sas de dechargement" correspond clairement a l'habitude active `Faire le sas de déchargement` (`dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`). L'effet durable existe, mais il n'est pas rattache a l'item de plan attendu.

**Problemes**
- Tour 2: `user_attack_cards.plan_item_id=null` pour une action presente dans le plan actif. Impact systeme: la carte risque d'apparaitre comme hors plan ou d'etre moins retrouvable depuis l'item du dashboard. Severite: yellow.

**Fix propose**
- Renforcer la resolution de cible dans l'intake `prepare_attack_card`: matcher "sas de dechargement" avec l'item actif `Faire le sas de déchargement`, puis passer `operation_input.target.plan_item_id` jusqu'a `insertAttackCardFromDraft`.

## Verdict Global

- Verdict: yellow
- Raison principale: le chemin operationnel attendu fonctionne et respecte la confirmation, mais l'effet durable n'est pas rattache a l'item de plan clair, et la formulation visible du draft est rugueuse.
- Follow-up prioritaire: corriger la resolution plan item pour `prepare_attack_card`, puis relancer Test 1 pour verifier `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`.
