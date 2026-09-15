# QA Run Report - adjust-plan-local-real-r2

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `adjust-plan-local-real-r2`
- Persona: `qa-skill`
- Connexion: `tests/real-personas/qa-skill/connections/connection_adjust-plan-action-20260601-r1.json`
- Objectif: verifier en conditions reelles le nouveau dispatcher local `adjust_plan_item` sur une demande d'allegement d'action de Plan.
- Trajectoire: demande implicite de modification, clarification, demande explicite de modification, retry, tentative d'application.
- Surfaces visees: global dispatcher, active local flow, `adjust_plan_item`, visible agent, handoff Plan, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct `processMessage`, messages choisis tour par tour.
- Validite QA: valide. Le premier essai etait bloque par sandbox localhost; le rerun `r2` a ete execute via acces localhost escalade. Fixture local cible cree puis nettoye apres le run.
- Cleanup DB: execute. Les deux items fixture, cycle, transformation, plan, messages, traces prefixees par le scope et state de chat du run ont ete supprimes; verification finale `user_plan_items=[]`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Le sas de déchargement du soir est trop ambitieux quand je suis crevé. Je veux garder l’idée, mais le rendre plus léger dans le Plan.

**Sophia**
> Oui, je vois le souci : quand t’es crevé, “sas de déchargement” ça peut vite devenir un truc de plus à subir 😅. On garde l’idée, mais on le rend faisable même en mode KO.
>
> Concrètement, on peut alléger le sas en version “minimum viable” :
> 1) Durée divisée par 2 (ou même 5 minutes)
> 2) Réduire à 1 seule brique au lieu de plusieurs (ex: juste vider le mental / noter 3 lignes)
> 3) Garder le même esprit (décharger), mais avec moins d’étapes
>
> Dis-moi juste : tu veux l’alléger plutôt sur le temps (A) ou sur le nombre d’étapes (B) ? 😊

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: `none`

**Analyse si yellow/red**
- Symptome: la reponse est humainement correcte, mais la demande mentionne explicitement le Plan et aurait du entrer dans le flux d'ajustement ou au moins ouvrir un etat local de clarification.
- Source amont probable: global dispatcher / arbitration tool-skill.
- Owner runtime: `adjust_plan_item` routing admission.
- Meilleure correction selon les guidelines: renforcer l'intention "modifier/allegir une action dans le Plan" dans les exemples et invariants de routing, sans matcher une phrase exacte.
- Pourquoi ce n'est pas un patch local: le probleme est le owner selectionne, pas le wording final.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Plutôt sur le nombre d’étapes. Pour l’action du Plan ‘Faire le sas de déchargement’, je veux juste garder: noter 3 lignes dans le carnet, sans couper tous les écrans avant.

**Sophia**
> OK, on garde ça simple : pour “Faire le sas de déchargement”, tu notes juste 3 lignes dans le carnet, et tu zappes le “couper tous les écrans” 😄
> C’est bien 3 lignes “brut” style :
> 1) ce que je ressens là maintenant

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: `none`

**Analyse si yellow/red**
- Symptome: Sophia traite la demande comme une conversation normale alors que l'item du Plan est nomme et la modification ciblee.
- Source amont probable: global dispatcher / tool-skill intent start.
- Owner runtime: routing `adjust_plan_item`.
- Meilleure correction selon les guidelines: detecter qu'un slot d'item + une transformation d'action suffisent a entrer dans le flux local, meme si une clarification visible reste necessaire.
- Pourquoi ce n'est pas un patch local: le flux outil n'est pas appele, donc le visible agent local n'a aucune chance de produire le bon handoff.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Oui c’est ça. Modifie mon Plan: remplace l’action ‘Faire le sas de déchargement’ par une version plus légère, juste noter 3 lignes dans le carnet.

**Sophia**
> Je garde l'ajustement du plan en cours, mais je n'arrive pas a formuler correctement la prochaine reponse. Reessaie dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: []
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: []
- durable_effect: `platform_handoff`
- mode: `platform_handoff`
- status: `blocked`
- reason_code: `adjust_plan_item_visible_agent_failed`
- runtime_trace: `adjust_plan_item.visible_agent`, stage `plan_handoff_ready`, issue `missing_suggested_platform_input`
- no_chat_mutation: true
- executable_from_chat: false

**Analyse si yellow/red**
- Symptome: le bon handler est selectionne et la mutation chat est bloquee, mais la reponse visible est un fallback d'erreur au lieu d'un handoff Plan exploitable.
- Source amont probable: contrat reducer -> visible agent, payload `suggested_platform_input` non compile ou non transmis.
- Owner runtime: `adjust_plan_item` local flow / visible agent.
- Meilleure correction selon les guidelines: faire produire un payload handoff structurel par le reducer local, puis valider par test contractuel que chaque state `plan_handoff_ready` contient l'input propose pour Plan.
- Pourquoi ce n'est pas un patch local: remplacer la phrase d'erreur ne corrigerait pas le handoff manquant.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> D’accord, réessaie: dans Plan, propose comme nouvelle version de l’action ‘Faire le sas de déchargement’: ‘Noter 3 lignes dans le carnet le soir’.

**Sophia**
> Ok, je prends : nouvelle version proposée de “Faire le sas de déchargement” = “Noter 3 lignes dans le carnet le soir”. ✅🙂
> Tu veux que ça remplace à la fois la cadence (6 soirs/semaine) et la cible globale (6), ou tu veux juste changer le libellé/la consigne en gardant le reste identique ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: `none`

**Analyse si yellow/red**
- Symptome: apres un tour `adjust_plan_item` bloque mais annonce "ajustement du plan en cours", le tour suivant ne reprend pas le local flow actif et retombe en `normal_reply`.
- Source amont probable: active flow state / exit memo / persistence d'etat local apres visible-agent failure.
- Owner runtime: `router/run.ts` active flow branch et `active_flow_state`.
- Meilleure correction selon les guidelines: definir l'etat attendu apres `visible_agent_failed`; soit sortie explicite sans promesse de continuation, soit reprise locale deterministic au tour suivant.
- Pourquoi ce n'est pas un patch local: le probleme est la transition d'etat entre tours, pas la formulation du message utilisateur.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Juste changer le libellé/la consigne, garde la cadence. Applique-le dans le Plan s’il te plaît.

**Sophia**
> Je garde l'ajustement du plan en cours, mais je n'arrive pas a formuler correctement la prochaine reponse. Reessaie dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: []
- operation: `adjust_plan_item`
- pending_confirmation: null
- executed_tools: []
- durable_effect: `platform_handoff`
- mode: `platform_handoff`
- status: `blocked`
- reason_code: `adjust_plan_item_visible_agent_failed`
- runtime_trace: `adjust_plan_item.visible_agent`, stage `apply_attempt`, issue `missing_suggested_platform_input`
- no_chat_mutation: true
- executable_from_chat: false

**Analyse si yellow/red**
- Symptome: l'apply attempt est correctement non-mutant, mais il echoue sur le meme payload de handoff manquant.
- Source amont probable: local flow compile une intention mais ne fournit pas le draft/handoff exploitable au visible agent.
- Owner runtime: `adjust_plan_item` local flow / visible agent.
- Meilleure correction selon les guidelines: couvrir `apply_attempt` et `plan_handoff_ready` par tests d'invariant sur `platform_handoff` et `suggested_platform_input`.
- Pourquoi ce n'est pas un patch local: le chat ne doit pas appliquer la modification; la bonne correction est de produire un handoff Plan complet.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia comprend humainement l'intention d'allegement.
- Les tours 1 et 2 restent naturels et proposent une clarification pertinente.
- Les tours 3 et 5 ne mentent pas sur une mutation: aucune phrase ne dit que le Plan est modifie.

**Problemes**
- Tours 1-2: l'utilisateur doit devenir tres explicite pour declencher le bon owner. Famille: `BF-ROUTE-01`. Impact: friction et risque que la demande reste hors outil. Severite: yellow.
- Tours 3 et 5: le handoff visible est inutilisable et demande de reessayer. Famille: `BF-STATE-03`. Impact: experience bloquante sur le coeur du scenario. Severite: red.
- Tour 4: l'annonce "ajustement en cours" n'est pas suivie d'une reprise locale. Famille: `BF-STATE-01`. Impact: incoherence conversationnelle. Severite: red.

**Fix propose**
- Source amont: routing admission `adjust_plan_item`, reducer local, visible agent, active flow state.
- Correction recommandee: declarer le contrat de handoff comme sortie obligatoire du local flow pour toute intention de modification/action apply, et stabiliser la reprise apres echec visible.
- Tests d'invariant attendus: paraphrases de modification de Plan, item nomme + changement de consigne, apply attempt, visible-agent failure policy, absence de mutation DB.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1 et 2 restent `normal_reply` malgre une intention de modification du Plan.
- Tours 3 et 5 routent correctement vers `adjust_plan_item`.
- Tour 4 ne reprend pas un flow actif apres un echec qui dit pourtant "ajustement du plan en cours".

**Skills / Operations / Tools**
- `adjust_plan_item` est bien selectionne sur demande explicite.
- Le mode observe est `platform_handoff`, pas execution directe.
- Le visible agent refuse la sortie avec `missing_suggested_platform_input` aux stages `plan_handoff_ready` et `apply_attempt`.

**Memory / Effets durables**
- `executed_tools: []` sur tous les tours.
- `no_chat_mutation: true` et `executable_from_chat: false` sur les tours outil.
- Verification DB apres run: les items fixture restent inchanges avant cleanup.
- Cleanup final cible execute; verification finale: aucun item fixture restant pour la connexion.

**Problemes**
- Tours 1-2: mauvais owner initial. Famille: `BF-ROUTE-01`. Impact systeme: le local dispatcher n'est pas exerce quand l'intention est deja assez claire. Severite: yellow.
- Tours 3 et 5: handoff Plan livre en meta mais payload visible absent. Famille: `BF-STATE-03`. Impact systeme: `platform_handoff` non exploitable. Severite: red.
- Tour 4: active local flow non restaure. Famille: `BF-STATE-01`. Impact systeme: perte de continuity state. Severite: red.

**Fix propose**
- Source amont: `adjust_plan_item` local reducer/visible agent contract + active flow persistence.
- Correction recommandee: compiler `suggested_platform_input` depuis les slots item cible, changement demande, cadence conservee/modifiee; rendre ce champ obligatoire avant `platform_handoff.status=delivered`; clarifier l'etat persistant apres visible-agent failure.
- Tests d'invariant attendus: unit local flow pour `plan_handoff_ready` et `apply_attempt`; integration router active flow sur un tour suivant; QA reel apres fix.

## Verdict Global

**red** - Run QA valide mais scenario non valide fonctionnellement. Les garde-fous anti-mutation tiennent, mais le routing initial est trop tardif, le visible agent bloque le handoff Plan par payload manquant, et la reprise locale active ne tient pas apres l'echec.
