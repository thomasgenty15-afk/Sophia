# QA Run Report - product-help-local-bridges-20260612-r3

## 1. Contexte Du Test

- Date: 2026-06-12.
- Run: `product-help-local-bridges-20260612-r3-attack`.
- Persona: user QA temporaire dedie, auth locale verifiee `200`.
- Objectif: verifier apres fix que `product_help` reste explicatif quand le user demande une difference produit, puis laisse la main a `prepare_attack_card` quand le user demande une carte.
- Trajectoire: explication attaque/defense sans creation -> demande de carte d'attaque -> continuation dans `prepare_attack_card` -> confirmation -> cancel.
- Surfaces visees: `/functions/v1/test-send-message`, dispatcher global, flow local `product_help`, handoff local vers `prepare_attack_card`, active flow target, EffectLedger.
- Cadre IA reel: Supabase local, endpoint local, `force_full_ai=true`, hors sandbox, pas de staging, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: valide. Les 5 tours retournent HTTP 200 via le chemin IA reel.
- Nettoyage: effectue apres run. Tables principales du scope et user Auth QA nettoyes; `user_memories` retourne 404 dans le runner, sans artefact QA restant signale.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdu dans Sophia : une carte d'attaque et une carte de defense, ce n'est pas la meme chose ? Explique-moi juste la difference, sans rien creer.

**Sophia**
> C'est assez simple : la carte d'attaque sert a lancer l'action quand tu as du mal a t'y mettre. Elle repond a la question "comment je commence ?". La carte de defense, elle, est la pour te proteger des pieges ou des imprevus qui risquent de te faire devier une fois que tu es lance. En resume : l'attaque pour entrer dans l'action, la defense pour tenir bon face aux risques.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun
- note_information: `global_dispatcher -> product_help`, confidence `high`, evidence `Explique-moi juste la difference`, `sans rien creer`

### Tour 2

**Verdict du tour:** green

**User**
> D'accord. Maintenant prepare-moi une carte d'attaque pour ranger mes papiers demain matin.

**Sophia**
> C'est note pour demain matin. Qu'est-ce qui te fait generalement derailler ou hesiter au moment de t'attaquer a tes papiers ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `product_help_exit_to_global_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun
- note_information: `product_help -> prepare_attack_card`, confidence `high`, task_context `ranger mes papiers demain matin`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - Contrainte explicite perdue

**User**
> Je bloque surtout parce que je ne sais pas par quelle pile commencer, et je repousse des que je vois trop de papiers.

**Sophia**
> Pour t'aider a ranger mes papiers demain matin malgre ton incertitude sur le point de depart et surcharge visuelle (trop de papiers), je te suggere d'utiliser la technique Preparer le terrain dans tes Cartes d'attaque. Est-ce que cette approche te convient ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le flow cible continue correctement, mais le rendu dit `ranger mes papiers` depuis la voix de Sophia au lieu de reformuler en `tes papiers` ou de citer proprement le libelle.
- Source amont probable: visible agent / conversation_context du flow `prepare_attack_card`.
- Owner runtime: `prepare_attack_card` visible/local continuation.
- Meilleure correction selon les guidelines: conserver le libelle action comme donnees de contexte, mais imposer au prompt visible de ne pas se l'approprier grammaticalement; preferer citation courte ou reformulation a la deuxieme personne.
- Pourquoi ce n'est pas un patch local product_help: le handoff est deja effectif; le probleme apparait apres reprise du dispatcher cible.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow actif

**User**
> Oui, garde une version simple, pas plus de cinq minutes.

**Sophia**
> Je garde la carte d'attaque en cours, mais je n'arrive pas a traiter ce tour dans le contrat local.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun
- effect_counts: `blocked=1`, `committed=0`

**Analyse si yellow/red**
- Symptome: confirmation simple + contrainte utilisateur conservable (`pas plus de cinq minutes`) tombe dans un fallback visible de contrat local.
- Source amont probable: reducer/dispatcher local `prepare_attack_card`, action de confirmation ou continuation apres technique proposee.
- Owner runtime: `prepare_attack_card` local flow.
- Meilleure correction selon les guidelines: ajouter/renforcer la continuation exacte pour confirmation de technique avec contrainte de duree, puis produire un `visible_task.kind` stage-specific exploitable; ne pas exposer "contrat local" au user.
- Pourquoi ce n'est pas un patch local product_help: le tour est deja dans `active_prepare_attack_card_local_dispatcher`.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow actif

**User**
> Laisse tomber pour cette carte finalement.

**Sophia**
> Ok, je laisse tomber pour cette carte finalement. On repasse en mode simple pour que tu aies juste une petite marge mentale, sans te remettre de pression 😌.

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: aucun
- local_flow_exit_handoff: `prepare_attack_card -> global`, consumed_by `global_dispatcher_second_pass`

**Analyse si yellow/red**
- Symptome: le visible est acceptable, mais la doctrine attend un `exit_to_global_dispatcher` pour un abandon simple du flow, pas une sortie vers global sur le meme tour.
- Source amont probable: policy de sortie du local flow `prepare_attack_card`.
- Owner runtime: `prepare_attack_card` local dispatcher / reducer.
- Meilleure correction selon les guidelines: distinguer abandon simple et changement de sujet; pour `laisse tomber pour cette carte`, fermer localement avec une reponse courte sans second passage global.
- Pourquoi ce n'est pas un patch local product_help: le flow actif est `prepare_attack_card`, pas `product_help`.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 repond exactement a la demande produit et respecte `sans rien creer`.
- T2 est fluide: la demande operationnelle quitte bien product_help et Sophia pose une question utile de carte d'attaque.
- Aucun effet durable n'est applique sans consentement.

**Problemes**
- T3: petite maladresse de perspective (`ranger mes papiers`). Famille: `BF-INTAKE-03`. Impact: faible, mais visible.
- T4: fallback interne expose au user (`contrat local`). Famille: `BF-STATE-01`. Impact: fort, car la conversation se bloque au moment naturel de confirmation.
- T5: stop visible acceptable, mais un peu trop relanceur et systemiquement passe par global. Famille: `BF-STATE-01`. Impact: moyen.

**Fix propose**
- Source amont: `prepare_attack_card` local flow, pas `product_help`.
- Correction recommandee: traiter confirmation de technique + contrainte courte comme continuation normale; ajouter un sortie via dispatcher global global; durcir le visible agent pour ne jamais exposer le vocabulaire runtime.
- Tests d'invariant attendus: product_help -> prepare_attack_card handoff reste vert; confirmation avec contrainte de duree ne produit pas de fallback; stop simple ne declenche pas global; aucun effet durable avant confirmation explicite d'application si le flow l'exige.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: entree correcte `product_help`, avec note_information initiale `global_dispatcher -> product_help`.
- T2: fix product_help valide: `route_reason=product_help_exit_to_global_dispatcher`, `selected_handler=prepare_attack_card`, note_information `product_help -> prepare_attack_card`.
- T3/T4: reprise active correcte par `active_prepare_attack_card_local_dispatcher`.
- T5: sortie vers global observee pour un cancel simple, a corriger cote `prepare_attack_card` selon doctrine locale.

**Skills / Operations / Tools**
- `product_help`: conforme sur le perimetre teste. Pas d'execution, pas de renderer deterministe, pas de reponse de carte construite par product_help.
- `prepare_attack_card`: handoff et continuation initiale OK, mais confirmation et stop local incomplets.
- Tools: aucun tool appele.

**Effets Durables**
- `requested=0`, `allowed=0`, `committed=0` sur T1/T2/T3/T5.
- T4 a `blocked=1`, `committed=0`: aucun effet durable incorrect, mais fallback d'etat visible.
- Cleanup cible effectue apres run.

**Fix propose**
- Source amont: `prepare_attack_card` reducer/local dispatcher/visible task mapping.
- Correction recommandee: ajouter les continuations exactes manquantes dans le contrat local cible et corriger la politique stop. Ne pas modifier le bridge product_help qui est prouve vert sur T2.
- Tests d'invariant attendus: T2 trace `product_help_exit_to_global_dispatcher`; T4 paraphrases de confirmation (`oui`, `ca me va`, `garde simple`, `5 minutes`) passent; T5 stop simple reste local; anti-FP changement de sujet clair sort global avec note_information.

## 5. Verdict Global

**Verdict: yellow.**

Le fix demande pour `product_help` est verifie en run reel: le flow explique sans creer puis handoff correctement vers `prepare_attack_card`. Le parcours complet reste non vert a cause de bugs downstream dans `prepare_attack_card`: fallback visible de contrat local sur confirmation et stop simple qui repart vers global.
