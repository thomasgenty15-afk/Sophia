# QA Operation Suggestion - Test 1.2 - Alex - 2026-05-12 - attack-card-complex-r1

## 1. Contexte Du Test

- Date: 2026-05-12
- Run: `attack-card-complex-r1`
- Persona: Alex
- Connexion: `tests/real-personas/alex/connection.json`, JWT via `bash scripts/get-jwt.sh alex`
- Objectif: tester une demande directe de carte d'attaque plus compliquee, avec cible implicite puis correction du draft avant confirmation.
- Trajectoire: demande vague de carte d'attaque -> draft operationnel trop large -> correction cible + duree -> demande explicite de creation.
- Surfaces visees: dispatcher `operation_intent`, `operation_flow`, handler `prepare_attack_card`, correction de pending operation, confirmation, side effect DB `user_attack_cards`.
- Cadre IA reel: endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Le run a ete mene tour par tour et arrete apres side effect incorrect confirme en DB.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-complex-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-complex-r1.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-complex-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> J'ai besoin que tu me fasses une carte d'attaque pour ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.

**Sophia**
> Je te propose de creer une carte d'attaque courte pour ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.: Fais la version 4 minutes de "ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.", assez petite pour ne pas negocier. Tu veux que je la cree ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=6f3961ea-305c-41eb-a739-0f1982a374dc`
- pending_confirmation: draft present in `operation_flow_run`, no executor yet
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none yet

### Tour 2

**User**
> Je parle du sas de dechargement, pas de preparer la zone; juste le moment ou je dois ouvrir le carnet. Et plus petit: deux minutes max, poser le telephone loin et ecrire une ligne.

**Sophia**
> Ok parfait : on oublie “zone”, et on vise juste le sas au moment où tu ouvres le carnet. 😄
>
> Carte d’attaque (2 minutes max) :
> 1) Téléphone posé loin (hors de portée).
> 2) Ouvre le carnet.
> 3) Écris une seule ligne : “Là, maintenant, mon cerveau a besoin de ____.”
>
> Tu la fais tout de suite après ça, ou plutôt dans 30 minutes ? 📱➡️📝

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `cancel`
- route_reason: `confirmation_correction_to_pending`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `selected_handler=cancel`, no new `prepare_attack_card` draft
- pending_confirmation: cleared / not exposed
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**User**
> Je veux que tu la crees dans Sophia avec ces trois etapes, pour ce soir. Pas un rappel, juste la carte d'attaque.

**Sophia**
> C'est fait. J'ai créé la carte d'attaque "Carte d'attaque - ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache." : Fais la version 4 minutes de "ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.", assez petite pour ne pas negocier.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none outside operation flow
- operation: `status=executed`, `operation_id=6f3961ea-305c-41eb-a739-0f1982a374dc`, `attack_card_id=12972864-00f0-47ec-b030-98b659730ce5`
- pending_confirmation: cleared
- memory_plan: not material to the turn
- executed_tools: `["prepare_attack_card"]`
- durable_effect: active attack card written, but with stale tour-1 draft

Durable DB observe:

- `user_attack_cards.id=12972864-00f0-47ec-b030-98b659730ce5`
- `plan_item_id=null`
- `content.title=Carte d'attaque - ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.`
- `content.target_label=ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.`
- `instruction=Fais la version 4 minutes de "ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.", assez petite pour ne pas negocier.`
- `metadata.operation_id=6f3961ea-305c-41eb-a739-0f1982a374dc`
- `metadata.request_id=qa-operation-suggestion-test1-alex-2026-05-12-attack-card-complex-r1-t03`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: Sophia comprend qu'il s'agit d'une demande de carte d'attaque et demande confirmation avant execution.
- Tour 2: Sophia comprend humainement la correction visible et produit une version texte utile en 2 minutes.

**Problemes**
- Tour 1: Sophia transforme toute la phrase vague en cible de carte au lieu de clarifier le plan item. Impact: draft peu exploitable. Severite: yellow.
- Tour 2: Sophia donne une carte en texte libre puis demande un timing ("tout de suite ou dans 30 minutes") alors que le user corrigeait une carte a creer dans Sophia. Impact: le user croit avancer vers la carte, mais le flow operationnel est perdu. Severite: red.
- Tour 3: Sophia affirme avoir cree la carte corrigee, mais la reponse confirme l'ancien draft non corrige. Impact: rupture de confiance produit. Severite: red.

**Fix propose**
- Quand un message corrige un pending `prepare_attack_card`, regenerer un draft operationnel corrige et demander confirmation sur ce nouveau draft, au lieu de cancel le pending puis repondre en texte libre.
- Interdire les confirmations visibles "C'est fait" si le contenu execute ne correspond pas a la derniere correction utilisateur.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Pass partiel: Tour 1 route correctement vers `operation_flow/prepare_attack_card`.
- Fail: Tour 2 classe la correction en `pending_confirmation/cancel` et ne remplace pas le draft operationnel.
- Fail: Tour 3 execute l'ancien pending avec `confirmation_yes`, malgre la correction explicite du tour 2.

**Skills / Operations / Tools**
- Pass: aucun executor ne tourne au tour 1 ou 2.
- Fail: `prepare_attack_card` execute au tour 3 avec le draft stale du tour 1, pas avec les trois etapes corrigees du tour 2.

**Memory / Effets durables**
- Fail: la DB contient une carte active avec la mauvaise cible et la mauvaise instruction.
- Fail: `plan_item_id=null` alors que la cible corrigee correspond a l'habitude active `Faire le sas de déchargement` (`dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`).
- Warning fort: `attack_card_id=12972864-00f0-47ec-b030-98b659730ce5` est le meme id que le Test 1.1; l'operation out-of-plan a donc reutilise/overwrite la carte existante au lieu de creer une carte distincte rattachee au bon item.

**Problemes**
- Tour 2: correction de pending operation traitee comme cancel sans nouveau draft. Impact systeme: perte du flow operationnel. Severite: red.
- Tour 3: stale pending execute apres correction. Impact systeme: side effect durable faux. Severite: red.
- Tour 3: reuse/overwrite d'une carte out-of-plan existante. Impact systeme: le run peut detruire l'artefact precedent et rend les preuves DB ambigues. Severite: red.

**Fix propose**
- Dans le resolver de pending confirmation, distinguer `confirmation_correction_to_pending` de `cancel`: conserver l'operation, appliquer la correction au draft, incrementer une version de draft, puis demander confirmation.
- A l'execution, verifier que le draft execute correspond au dernier draft confirme; bloquer si une correction plus recente existe.
- Eviter le fallback `out_of_plan` unique quand une cible plan item est resoluble; rattacher la carte a `user_plan_items.id`.

## Verdict Global

- Verdict: red
- Raison principale: la correction multi-tour n'est pas integree; Sophia execute ensuite un draft obsolete et ecrit un effet durable faux.
- Follow-up prioritaire: corriger la gestion `confirmation_correction_to_pending` pour `prepare_attack_card`, puis relancer `Test 1.2`.
