# QA Operation Suggestion - Test 1.3 - Alex - 2026-05-13 - attack-card-complex-r3

## 1. Contexte Du Test

- Date: 2026-05-13 Europe/Paris
- Run: `attack-card-complex-r3`
- Persona: Alex
- Connexion: `tests/real-personas/alex/connection.json`, JWT via `bash scripts/get-jwt.sh alex`
- Objectif: retester localement la demande directe de carte d'attaque multi-tour apres correction du rattachement cible et du pending operation.
- Trajectoire: demande vague de carte d'attaque -> clarification cible + contraintes -> draft operationnel -> confirmation explicite -> verification DB.
- Surfaces visees: dispatcher `operation_intent`, `operation_flow`, handler `prepare_attack_card`, slots de cible, confirmation, side effect DB `user_attack_cards`, rattachement `user_plan_items.attack_card_id`.
- Cadre IA reel: Supabase local, endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun run staging/remote.
- Validite QA: valide. Le run exploitable est `r3`; `r2` a ete invalide au tour 2 par incident local HTTP 502 upstream avec reponse vide, puis relance propre depuis le tour 1.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-complex-r3.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-complex-r3.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-complex-r3.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> J'ai besoin que tu me fasses une carte d'attaque pour ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.

**Sophia**
> Il me manque l'action à viser. Donne-moi l'action ou décris-la en une phrase.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=ask_question`, `slot=target`, `missing_slots=["target"]`
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**User**
> Je parle du sas de dechargement. C'est le moment ou j'ouvre le carnet. Je veux une carte tres petite: deux minutes, poser le telephone loin, ouvrir le carnet, ecrire une ligne.

**Sophia**
> Je te propose de creer une carte d'attaque courte pour Faire le sas de déchargement: Fais la version 4 minutes de "Faire le sas de déchargement", assez petite pour ne pas negocier. Tu veux que je la cree ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=3d6b1988-1342-48ec-a708-f85ce681e2ae`
- pending_confirmation: draft `Carte d'attaque - Faire le sas de déchargement`
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**User**
> Oui vas-y, cree cette carte d'attaque dans Sophia.

**Sophia**
> C'est fait. J'ai créé la carte d'attaque "Carte d'attaque - Faire le sas de déchargement" : Fais la version 4 minutes de "Faire le sas de déchargement", assez petite pour ne pas negocier.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: `prepare_attack_card=success`
- operation: `status=executed`, `operation_id=3d6b1988-1342-48ec-a708-f85ce681e2ae`, `attack_card_id=3603063e-712e-4c41-a70c-6a9367534703`
- pending_confirmation: cleared
- memory_plan: not material to the turn
- executed_tools: `["prepare_attack_card"]`
- durable_effect: active attack card written and linked to the resolved plan item

Durable DB observe:

- `user_attack_cards.id=3603063e-712e-4c41-a70c-6a9367534703`
- `user_attack_cards.plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `content.title=Carte d'attaque - Faire le sas de déchargement`
- `content.target_label=Faire le sas de déchargement`
- `metadata.target.kind=plan_item`
- `metadata.target.plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `user_plan_items.id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `user_plan_items.title=Faire le sas de déchargement`
- `user_plan_items.cards_status=ready`
- `user_plan_items.attack_card_id=3603063e-712e-4c41-a70c-6a9367534703`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia ne fabrique plus une carte a partir de toute la phrase vague; elle demande la cible manquante.
- Tour 2: Sophia comprend que "sas de dechargement" vise l'action existante `Faire le sas de déchargement`.
- Tour 3: la confirmation est courte et compréhensible, sans redemander inutilement.

**Problemes**
- Tour 1: la clarification reste tres generique et peu contextualisee; elle ne propose pas les candidats plausibles du plan sommeil. Impact: le user doit faire l'effort de nommer/decrire l'action. Severite: yellow.
- Tour 2: Sophia perd les contraintes concretes donnees par le user (`deux minutes`, `poser le telephone loin`, `ouvrir le carnet`, `ecrire une ligne`) et revient a une carte generique en 4 minutes. Impact: carte utilisable, mais moins fidele a la demande. Severite: yellow.

**Fix propose**
- Quand la cible est resolue, faire porter le draft sur les contraintes utilisateur extraites dans le meme tour, pas seulement sur le template par defaut `minimum_version`.
- En clarification de cible, si des candidats de plan sont proches, les mentionner naturellement sans exiger le nom exact de l'action.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: `operation_flow/prepare_attack_card` est choisi correctement via `operation_intent_start`.
- Tour 2: le flow actif continue via `active_tool_skill_continue`, collecte la cible et produit un pending confirmation.
- Tour 3: `pending_confirmation/execute_confirmed` execute seulement apres oui explicite.

**Skills / Operations / Tools**
- Aucun executor ne tourne avant confirmation.
- `prepare_attack_card` execute une seule fois au tour 3.
- Le stale draft du run rouge precedent n'est pas repris.

**Memory / Effets durables**
- La carte creee est une nouvelle carte active, pas un overwrite de la carte out-of-plan precedente.
- La cible est bien rattachee au plan item `dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`.
- `user_plan_items.attack_card_id` et `cards_status=ready` sont mis a jour pour `Faire le sas de déchargement`.

**Problemes**
- Aucun probleme systeme bloquant observe sur le bug cible: clarification, confirmation, execution et rattachement DB sont coherents.
- Warning produit: le contenu de carte ne conserve pas toutes les contraintes du user, mais cela releve davantage de la qualite de draft que du side effect systeme. Severite: yellow cote UX, non bloquant cote workflow.

**Fix propose**
- Enrichir le draft `prepare_attack_card` avec les slots/contraintes extraits du dernier message utilisateur avant confirmation.

## Verdict Global

- Verdict: yellow
- Raison principale: le workflow systeme corrige bien le probleme rouge precedent, mais la carte finale ignore encore des contraintes utilisateur importantes.
- Follow-up prioritaire: faire passer les contraintes de draft du tour de clarification jusqu'au contenu confirme/executé.
