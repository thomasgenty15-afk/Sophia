# QA Run - prepare_defense_card Local Dispatcher RQA1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `prepare-defense-local-dispatcher-rqa1`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: verifier en conditions reelles la nouvelle architecture `prepare_defense_card` avec dispatcher local, reducer local, prompt visible, handoff plateforme non-mutant, follow-up destination, revision, apply attempt et sortie vers attaque.
- Trajectoire: entree defense non experte -> confirmation `support_need` -> handoff -> destination -> revision -> demande de creation -> sortie vers `prepare_attack_card`.
- Surfaces visees: dispatcher global, active local flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent, platform handoff, effect ledger, DB snapshot.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe ni fallback `processMessage`.
- Validite QA: valide. Incident T6 corrige pendant la session, puis rerun conversationnel T7 pour verifier la sortie active defense -> attaque.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-dispatcher-rqa1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-dispatcher-rqa1.summary.json`
- Durable snapshot: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-dispatcher-rqa1.durable.json`
- Nettoyage fin de run: scope QA cible supprime de `chat_messages` (14 lignes) et `user_chat_states` (1 ligne). Aucun reset Supabase, aucun reset DB global.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Il me faudrait un filet de sécurité pour le moment où je rentre rincé et que je commande n’importe quoi au lieu de manger correctement.

**Sophia**
> Je comprends tout à fait, c'est un moment de vulnérabilité très classique quand on est à bout d'énergie. Est-ce que la formulation 'quand je rentre rincé et que je commande n’importe quoi au lieu de manger correctement' te convient pour répondre à la question : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`, no reason codes
- direct_effects: `[]`
- operation: status `collecting`, reason `prepare_defense_card_local_collecting`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=confirm_support_need_proposal`
- ai_call_count: 2
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui, c’est exactement ça.

**Sophia**
> C'est noté. Pour mettre cela en place, tu peux maintenant te rendre dans Ressources / Défense / Cartes de défense libres pour finaliser ta carte de défense. Comme je ne peux pas la créer directement depuis notre discussion, il te suffira de remplir le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? avec : quand je rentre rincé et que je commande n’importe quoi au lieu de manger correctement. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: status `handoff_delivered`, reason `platform_handoff_delivered`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=handoff_ready`
- ai_call_count: 2
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Je la mets où exactement ?

**Sophia**
> Tu peux te rendre dans Ressources / Défense / Cartes de défense libres. Une fois là-bas, il te suffira de copier « quand je rentre rincé et que je commande n’importe quoi au lieu de manger correctement » dans le champ : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: status `handoff_delivered`, reason `destination_short`
- local dispatcher: `flow_action=platform_destination_followup`, reducer visible `destination_short`
- ai_call_count: 2
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-01` — claim ambigu sans commit

**User**
> Reformule plutôt : quand je rentre vidé après le travail, j’ai besoin d’aide à ne pas commander compulsivement.

**Sophia**
> C'est entendu, j'ai bien pris en compte cette nouvelle formulation. Pour finaliser ta carte de défense, tu peux te rendre dans Ressources / Défense / Cartes de défense libres. Comme je ne peux pas créer la carte directement ici, il te suffira de copier « quand je rentre vidé après le travail, j’ai besoin d’aide à ne pas commander compulsivement. » dans le champ : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: status `handoff_delivered`, reason `revised_platform_handoff`
- local dispatcher: `flow_action=revise_support_need`, reducer visible `handoff_ready`
- ai_call_count: 2
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: "j'ai bien pris en compte" peut sonner comme une prise en charge persistante, meme si le message precise ensuite qu'aucune carte n'est creee.
- Source amont probable: visible agent contract wording pour `revision_done` / `handoff_ready` apres revision.
- Owner runtime: `prepare_defense_card.visible_agent`.
- Meilleure correction selon les guidelines: renforcer le prompt visible de revision pour dire "nouvelle formulation a recopier" plutot que "pris en compte".
- Pourquoi ce n'est pas un patch local: le probleme est un style contractuel de prompt visible, pas une phrase unique.

### Tour 5

**Verdict du tour:** green

**User**
> Ok vas-y crée-la.

**Sophia**
> J'aimerais beaucoup pouvoir le faire pour toi, mais je n'ai pas la main pour créer la carte directement ici. Pour la mettre en place, il faut que tu te rendes dans Ressources / Défense / Cartes de défense libres. Une fois là-bas, tu pourras copier « quand je rentre vidé après le travail, j’ai besoin d’aide à ne pas commander compulsivement. » dans le champ : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: status `apply_attempt`, reason `apply_attempt_no_chat_mutation`
- local dispatcher: `flow_action=apply_attempt`, `visible_task=apply_attempt`
- blocked_effects: `create_defense_card / chat_creation_disabled_platform_handoff`
- ai_call_count: 2
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` — ancien flow capture une nouvelle intention

**User**
> Finalement je veux plutôt une carte d’attaque pour démarrer mon dossier demain matin.

**Sophia**
> Je garde la carte de défense en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- safety: `none`, reason codes `immediacy_tomorrow`, `bounded_context_lowers_risk`
- direct_effects: `[]`
- operation: status `blocked`, reason `active_prepare_defense_card_local_runtime_null`
- runtime_trace: `local_runtime_null`, `global_dispatcher_skipped=true`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user demande explicitement de quitter defense pour attaque, mais le flow actif renvoie une erreur technique visible au lieu de sortir via `exit_to_global_dispatcher`.
- Source amont probable: admission/routing du runtime local defense. Une route locale explicite `selected_handler=prepare_defense_card` pouvait etre bloquee par un etat/pending parasite avant appel du dispatcher local.
- Owner runtime: `prepare_defense_card.router` + active local flow admission.
- Meilleure correction selon les guidelines: une route locale explicite defense doit toujours appeler le dispatcher local; le dispatcher local decide ensuite `exit_to_global_dispatcher`.
- Pourquoi ce n'est pas un patch local: le bug est dans la politique d'entree runtime, pas dans le wording ou une regex.

Correction appliquee pendant la session:
- `prepare_defense_card.router`: `operationRouteIsSelected` donne maintenant priorite a `routeDecision.response_owner=tool_skill` + `selected_handler=prepare_defense_card` avant les checks de pending/active memory.
- Test ajoute: `prepare_defense_card explicit local route is not blocked by unrelated pending memory`.

### Tour 7

**Verdict du tour:** green

**User**
> Je confirme, je veux quitter la défense et préparer une carte d’attaque pour démarrer mon dossier demain matin.

**Sophia**
> C'est entendu, on se concentre sur le démarrage de ton dossier demain matin. Pour bien préparer cette carte, quel est le principal obstacle ou le piège qui risque de te freiner au moment de t'y mettre ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `none`
- direct_effects: `[]`
- operation: attack flow collecting, no durable effect
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

Verification du bug T6:
- La reprise conversationnelle apres fix route bien vers `prepare_attack_card`.
- Aucun writer defense n'a ete appele.
- Aucun pending confirmation n'a ete cree.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 pose une confirmation naturelle sur le seul champ plateforme `support_need`.
- T2 donne un handoff clair: destination, label exact et valeur exacte, sans pretendre creer la carte.
- T3 repond court a la destination sans refaire tout le handoff.
- T5 gere correctement la demande "cree-la" avec un refus doux et utile.
- T7, apres fix, bascule naturellement vers attaque.

**Problemes**
- Tour 4: "j'ai bien pris en compte" est legerement ambigu comme claim de prise en charge. Famille: `BF-LEDGER-01`. Impact: faible, car le message precise ensuite que Sophia ne cree rien. Severite: yellow.
- Tour 6: erreur technique visible au lieu d'une sortie vers attaque. Famille: `BF-ROUTE-02`. Impact: fort sur la confiance utilisateur. Severite: red sur le tour, corrige/verifie par T7.

**Fix propose**
- Source amont: `prepare_defense_card.visible_agent` pour la nuance de revision.
- Correction recommandee: renforcer le prompt visible `revision_done` / `handoff_ready` pour preferer "voici la nouvelle formulation a recopier" a "j'ai pris en compte".
- Tests d'invariant attendus: guard visible qui refuse les claims de persistance ambigus sur revision sans creation; QA paraphrase de revision.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 route correctement vers `prepare_defense_card` depuis une formulation non experte "filet de securite".
- T2-T5 montrent que le dispatcher global est bien bloque pendant le flow actif: `route_reason=active_prepare_defense_card_local_dispatcher`.
- T5 confirme `apply_attempt_no_chat_mutation`.
- T6 a expose un bug d'admission: le local runtime n'a pas appele le dispatcher local et a renvoye `active_prepare_defense_card_local_runtime_null`.
- T7 verifie le correctif: la demande de sortie vers attaque aboutit a `selected_handler=prepare_attack_card`.

**Skills / Operations / Tools**
- Tour actif normal: `ai_call_count=2` sur T1-T5.
- Aucun `executed_tools`.
- Aucun `pending_confirmation`.
- Aucun `defense_card_id`.
- `support_need` est le seul champ visible rendu dans les handoffs.

**Memory / Effets durables**
- Aucun effet durable de carte observe.
- Le run a ete nettoye en fin de session sur le scope QA: `chat_messages` et `user_chat_states` uniquement.
- Les artefacts JSON locaux restent disponibles pour audit.

**Problemes**
- Tour 6: active local route defense pouvait retourner `null` avant dispatcher local. Famille: `BF-ROUTE-02`. Impact systeme: le dispatcher global est correctement saute, mais l'exception `exit_to_global_dispatcher` ne peut pas fonctionner si le runtime local n'entre pas. Severite: red avant fix, verified apres T7.

**Fix propose**
- Source amont: `prepare_defense_card.router.operationRouteIsSelected`.
- Correction recommandee: prioriser la route explicite locale avant les checks pending/active memory.
- Tests d'invariant attendus: test d'integration local avec pending parasite + route active defense + dispatcher qui retourne `exit_to_global_dispatcher`; rerun conversationnel defense -> attack.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow defense local est valide sur collecte, handoff, destination, revision et apply attempt, mais le run a revele un bug reel de sortie active vers attaque. Le bug a ete corrige et verifie dans le meme run par reprise T7.
- Follow-up prioritaire: durcir le prompt visible de revision pour eviter les formulations de prise en charge persistante ambigue, puis relancer une variante courte defense -> revision -> sortie attaque.
