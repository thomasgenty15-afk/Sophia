# QA Run - prepare_defense_card Local Post Legacy R2

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `prepare-defense-local-post-legacy-r2`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: rerun en conditions IA reelles apres R1, avec formulation differente, pour verifier la stabilite du nouveau flow local `prepare_defense_card`.
- Trajectoire: entree defense explicite -> confirmation -> destination courte -> revision -> tentative d'ajout -> bascule vers carte d'attaque.
- Surfaces visees: dispatcher global, active local flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, handoff plateforme, effect ledger, handoff vers `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Messages choisis tour par tour apres lecture des reponses et traces courtes. Pas de staging, pas de runner deterministe, pas de correction code pendant le run.
- Cleanup: non effectue dans ce tour. Le precedent cleanup cible avait ete rejete par la couche d'approbation automatique; les artefacts locaux de ce scope doivent etre nettoyes plus tard par suppression ciblee du scope `qa-prepare-defense-card-alex-2026-06-09-prepare-defense-local-post-legacy-r2`.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-09-prepare-defense-prepare-defense-local-post-legacy-r2.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-09-prepare-defense-prepare-defense-local-post-legacy-r2.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-06-09-prepare-defense-prepare-defense-local-post-legacy-r2.durable.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-09-prepare-defense-local-post-legacy-r2-bugs.md`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'aimerais préparer une carte de défense pour les soirs où je rentre rincé, j'ouvre les applis de livraison et je pars sur une commande automatique au lieu de dîner normalement.

**Sophia**
> Pour répondre à la question « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? », est-ce que cette formulation te convient : « les soirs où je rentre rincé, j'ouvre les applis de livraison et je pars sur une commande automatique au lieu de dîner normalement » ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=confirm_support_need_proposal`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `collecting`, reason `prepare_defense_card_local_collecting`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Oui, cette formulation me va.

**Sophia**
> Nous avons maintenant une base solide pour ta carte de défense. Pour la mettre en place, il te suffit de te rendre dans Ressources / Défense / Cartes de défense libres. Comme la carte n'est pas créée directement depuis notre échange, tu pourras l'ajouter là-bas en utilisant cette formulation pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? » : les soirs où je rentre rincé, j'ouvre les applis de livraison et je pars sur une commande automatique au lieu de dîner normalement.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=handoff_ready`, `visible_task=handoff_ready`
- visible guard: accepted, `issues=[]`
- operation trace: `status=collecting`, reason `prepare_defense_card_local_collecting`
- response_tool_execution: `blocked`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

**Analyse si yellow/red**
- Symptome: la reponse visible est bien un handoff plateforme, mais le runtime expose `status=collecting` et `tool_execution=blocked` au lieu de `handoff_delivered/platform_handoff`.
- Source amont probable: reducer/runtime result `prepare_defense_card` quand le dispatcher confirme une proposition avec une reponse courte.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon les guidelines: aligner le statut runtime sur le resultat visible et l'etat `support_need.locked`.
- Pourquoi ce n'est pas un patch local: le contenu visible est correct; l'incoherence est dans la transition d'etat/runtime.

### Tour 3

**Verdict du tour:** green

**User**
> Tu peux me redire juste où je dois la saisir ?

**Sophia**
> Tu peux maintenant placer cette carte dans Ressources / Défense / Cartes de défense libres. Pour le champ "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?", voici la formulation à recopier : les soirs où je rentre rincé, j'ouvre les applis de livraison et je pars sur une commande automatique au lieu de dîner normalement.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=platform_destination_followup`, reducer `visible_task=destination_short`
- visible guard: accepted, `issues=[]`
- operation: `handoff_delivered`, reason `destination_short`
- response_tool_execution: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Finalement écris plutôt : quand je rentre épuisé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par automatisme.

**Sophia**
> On a maintenant une base solide pour ta protection. Pour finaliser cela, dirige-toi dans Ressources / Défense / Cartes de défense libres. Comme la carte n'est pas créée directement depuis notre échange, tu pourras y ajouter une nouvelle carte en utilisant cette formulation pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : quand je rentre épuisé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par automatisme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=revise_support_need`, `visible_task=handoff_ready`
- visible guard: accepted, `issues=[]`
- operation trace: `status=collecting`, reason `prepare_defense_card_local_collecting`
- response_tool_execution: `blocked`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

**Analyse si yellow/red**
- Symptome: la revision visible remplace bien la valeur, mais le statut runtime reste `collecting/blocked`.
- Source amont probable: transition reducer/runtime apres `revise_support_need` quand le handoff est redonne.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon les guidelines: si `support_need.locked_value` existe et que le visible task est `handoff_ready`, le runtime doit exposer `handoff_delivered/platform_handoff`.
- Pourquoi ce n'est pas un patch local: le probleme est une coherence d'etat trace/runtime, pas une formulation.

### Tour 5

**Verdict du tour:** green

**User**
> Ok, ajoute-la maintenant.

**Sophia**
> C'est une base solide pour te protéger de ce réflexe. Je ne peux pas créer la carte pour toi depuis notre échange, mais tu peux l'ajouter toi-même dans Ressources / Défense / Cartes de défense libres. Pour cela, ouvre Ressources / Défense, dans Cartes de défense libres, choisis Ajouter une carte et reprends les éléments préparés. Pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux copier : quand je rentre épuisé, j'ai besoin d'aide à ne pas ouvrir les applis de livraison par automatisme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=apply_attempt`, `visible_task=apply_attempt`
- visible guard: accepted, `issues=[]`
- operation: `apply_attempt`, reason `apply_attempt_no_chat_mutation`
- blocked_effects: `create_defense_card / chat_creation_disabled_platform_handoff`
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> En fait change de piste : je veux plutôt une carte d'attaque pour me mettre sur ma déclaration d'impôts demain.

**Sophia**
> Est-ce que c'est bien sur l'objectif « faire ma déclaration d'impôts demain » que tu souhaites travailler ? Pour continuer, ça se passe dans la section Cartes d’attaque : ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `prepare_defense_card_handoff_to_prepare_attack_card`
- blocked_paths: `global_dispatcher / prepare_defense_card_handoff_to_prepare_attack_card`
- note_information: presente, `source_flow_id=prepare_defense_card`, `target_dispatcher=prepare_attack_card`
- attack local dispatcher: `flow_action=confirm_candidate`, `visible_task=confirm_target_candidate`, `target_status=proposed`, `blocker_status=missing`
- visible guard: accepted, `issues=[]`
- operation: `collecting`, reason `prepare_attack_card_local_confirm_target_candidate`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le handoff vers attaque est correct, mais la reponse visible mentionne "reprends le brouillon proposé" alors que le target est seulement `proposed` et que le blocker manque.
- Source amont probable: `prepare_attack_card` `conversation_context.handoff_data.platform_steps` injecte des etapes de handoff alors que `visible_task=confirm_target_candidate`.
- Owner runtime: `prepare_attack_card`.
- Meilleure correction selon les guidelines: les stages `confirm_target_candidate` et `ask_blocker` ne doivent pas recevoir ou utiliser de `platform_steps` de handoff.
- Pourquoi ce n'est pas un patch local: la phrase vient du contexte visible du stage cible, pas d'une decision du flow defense.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow defense reste globalement fluide: proposition, confirmation, destination courte, revision, refus de creation.
- Les messages visibles defense n'exposent pas les anciens champs legacy.
- `apply_attempt` est clair et non-mutant.
- La bascule vers attaque est comprise sans repasser par le dispatcher global normal.

**Problemes**
- T2 et T4: la conversation est correcte, mais le statut systeme dit encore `collecting/blocked`. Famille: `BF-STATE-01`. Impact UX direct faible, impact QA/observabilite moyen.
- T6: la mention de brouillon propose est prematuree. Famille: `BF-STATE-03`. Impact UX moyen: le user peut croire qu'un brouillon attaque existe deja.

**Fix propose**
- Source amont defense: reducer/runtime result `prepare_defense_card` pour les cas `handoff_ready` et `revise_support_need`.
- Correction recommandee defense: aligner `tool_execution` et `status` sur le handoff visible quand `support_need` est locked.
- Source amont attaque: visible context stage `confirm_target_candidate`.
- Correction recommandee attaque: ne pas passer `platform_steps`/destination au visible agent avant `handoff_ready`.
- Tests d'invariant attendus: confirmation courte -> `platform_handoff`; revision -> `platform_handoff`; defense -> attack confirm target sans "brouillon" ni destination.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: detection globale explicite `prepare_defense_card`.
- T2-T5: global dispatcher skipped pendant le flow actif via `active_prepare_defense_card_uses_local_dispatcher`.
- T6: handoff local vers `prepare_attack_card` avec `blocked_paths=global_dispatcher / prepare_defense_card_handoff_to_prepare_attack_card`.

**Skills / Operations / Tools**
- T1-T5: `prepare_defense_card.local_flow`, `ai_call_count=2`.
- T3 et T5 exposent des statuts runtime cohérents (`destination_short/platform_handoff`, `apply_attempt/platform_handoff`).
- T2 et T4 exposent une incoherence runtime: visible handoff mais `status=collecting`, `response_tool_execution=blocked`.
- T6: `prepare_attack_card` consomme bien la `note_information`, mais le visible context contient des `platform_steps` prematurees.

**Memory / Effets durables**
- `user_defense_cards` reste vide apres le run (`count=0`).
- `committed_effects=[]` sur tous les tours.
- `executed_tools=[]` sur tous les tours.
- `pending_confirmation=null` sur tous les tours.

**Problemes**
- T2/T4: transition runtime defense incoherente. Famille: `BF-STATE-01`. Impact systeme: observabilite et effect ledger moins fiables.
- T6: draft/handoff attack rendu trop tot dans le visible. Famille: `BF-STATE-03`. Impact systeme: le visible agent cible recoit un contexte de handoff alors que le draft n'est pas pret.

**Fix propose**
- Defense: dans le reducer/runtime, `handoff_ready` et `revise_support_need` avec `support_need.locked_value` doivent sortir en `handoff_delivered/platform_handoff`.
- Attack: filtrer `handoff_data.platform_steps` hors `conversation_context` pour `confirm_target_candidate` / `ask_blocker`, ou renforcer les prompts de ces stages pour l'ignorer.
- Tests d'invariant attendus: verifier `tool_execution`, `status`, `reason_code`, `blocked_effects`, absence de writer, et absence de "brouillon proposé" avant handoff attack.

## Verdict Global

Verdict global: **yellow**.

Le rerun confirme que les modifications principales de `prepare_defense_card` tiennent: flow local, global skipped, champ unique `support_need`, pas de renderer legacy, pas de creation, pas de pending confirmation. Deux problemes restent ouverts: incoherence de statut runtime sur certains handoffs defense et phrase prematuree cote `prepare_attack_card` lors du handoff local.
