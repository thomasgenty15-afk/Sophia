# QA Run Report - coaching_min_signal_20260629_r1

## 1. Contexte Du Test

- Date: 2026-06-29
- Run: `coaching_min_signal_20260629_r1`
- Persona: connexion temporaire locale `qa-qa-skill-coaching-min-signal-coaching-min-signal-20260629-r1@example.com`
- Objectif: verifier que la sortie reduite du dispatcher global passe correctement vers `coaching_recommendation`.
- Trajectoire: plan action coaching -> comparaison attack/defense -> destination produit dans le scope coaching -> action hors plan -> tentative emotion globale.
- Surfaces visees: dispatcher global, `turn_frame.skill_signals.coaching_recommendation.context`, router, active flow ownership, `coaching_recommendation`, absence de direct effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct, messages choisis tour par tour.
- Validite QA: partiellement valide. Les tours 1-4 sont exploitables. Le tour 5 est un incident HTTP 502 upstream vide, documente comme tour rate. Nettoyage DB cible execute sans erreur.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` - Ambiguite non reconnue / confidence gate incoherent

**User**
> Je bloque sur l'action de mon plan Envoyer le mail de cadrage. Quand j'ouvre le brouillon je fige, et je ne sais pas si je dois preparer une carte ou juste me forcer. Tu me conseillerais quoi ?

**Sophia**
> Je partirais sur une carte d’attaque, technique méditation de 5 minutes : comme tu figes dès l’ouverture du brouillon, l’idée est de te remettre mentalement dans le démarrage avant le premier geste, sans te forcer à froid.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- coaching_signal_context_keys: `action_context`, `coaching_type`, `confidence`, `needs_type_confirmation`, `reason`
- coaching_signal_context: `coaching_type=plan_action`, `confidence=0.92`, `action_context.source=plan`, `plan_item_id=dd3eb2e3-88c2-44c4-8e5f-7d1e8a918153`, `action_title=Envoyer le mail de cadrage`, `needs_type_confirmation=true`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `coach on a blocked plan action and clarify lever choice`
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le nouveau contrat minimal est bien respecte, mais `needs_type_confirmation=true` alors que l'action du plan est identifiee avec `plan_item_id`.
- Source amont probable: dispatcher global, confidence/confirmation gate du signal `coaching_recommendation`.
- Owner runtime: global dispatcher.
- Meilleure correction selon les guidelines: clarifier le contrat `needs_type_confirmation`: `false` si `coaching_type=plan_action` et `action_context.source=plan` avec `plan_item_id` resolu, sauf ambiguite explicite sur la cible.
- Pourquoi ce n'est pas un patch local: le probleme est une coherence de sortie structuree du dispatcher, pas une phrase visible.

### Tour 2

**Verdict du tour:** green

**User**
> Ok, et pourquoi ce n'est pas plutot une carte de defense dans ce cas ?

**Sophia**
> Parce qu’ici le blocage arrive avant l’action, au moment d’ouvrir le brouillon : tu n’es pas encore dans le mail, tu n’es pas en train de dérailler pendant l’exécution. Une carte de défense sert plutôt si tu commences puis tu risques de décrocher, fuir ou te faire embarquer en plein milieu. Là, je partirais sur une carte d’attaque, technique méditation de 5 minutes : elle aide à rendre le démarrage plus clair et moins lourd quand le premier geste bloque.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `reflection`
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Si je veux la preparer moi-meme dans Sophia, je vais ou exactement ? Ne cree rien depuis le chat.

**Sophia**
> Oui : dans **Dashboard > Plan**, ouvre l’action **« Envoyer le mail de cadrage »**, puis lance la **carte d’attaque** depuis cette action. Là, tu la prépares directement sur l’action concernée, pas dans Ressources.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `reflection`
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Autre cas proche : j'ai un mail perso a Camille qui n'est pas dans mon plan, et je bloque pareil au moment d'ouvrir le brouillon. La tu m'aiderais comment ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique texte magique : une phrase courte pour couper le blocage mental au moment d’ouvrir le brouillon et lancer le premier geste sans te forcer à froid.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `reflection`
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Dernier cas : ce n'est pas lie a une action precise, je suis juste anxieux et brouille depuis ce matin. Dans Sophia tu me recommanderais quoi ?

**Sophia**
> Reponse vide. Endpoint retourne `502`.

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: null
- executed_tools: []
- durable_effect: none
- raw_error: `An invalid response was received from the upstream server`

**Analyse si yellow/red**
- Symptome: erreur HTTP 502 vide sur un tour qui devait tester `emotional`.
- Source amont probable: upstream Edge/LLM ou gateway local, pas de trace exploitable.
- Owner runtime: test-send-message / infrastructure locale QA.
- Meilleure correction selon les guidelines: retenter dans un run separe ou instrumenter la capture d'erreur upstream pour exposer la cause provider/runtime.
- Pourquoi ce n'est pas un patch local: aucun contenu Sophia ni route decision n'a ete produit; il n'y a pas de comportement conversationnel a corriger.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia repond directement au besoin de coaching sans basculer vers product_help.
- La distinction attack/defense au tour 2 est claire et utile.
- La question produit "ou la preparer" reste dans `coaching_recommendation` et donne la bonne surface Plan.
- Le changement vers action hors plan au tour 4 reste dans le bon owner et propose une carte libre.

**Problemes**
- Tour 5: reponse vide pour raison technique. Famille: `BF-TEST-01`. Impact: impossible de juger le cas emotion globale. Severite: red technique, hors qualite conversationnelle observable.

**Fix propose**
- Source amont: infrastructure QA / Edge upstream.
- Correction recommandee: relancer le cas emotion globale dans un run dedie et conserver la trace d'erreur upstream si 502 recidive.
- Tests d'invariant attendus: tour emotion globale avec `response_owner=coaching_recommendation`, `coaching_type=emotional`, puis visible `emotion_coaching`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1 valide le passage attendu: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `route_reason=coaching_recommendation_signal`.
- Le contexte transmis par le dispatcher global contient uniquement les 5 champs attendus: `coaching_type`, `confidence`, `reason`, `action_context`, `needs_type_confirmation`.
- Aucun champ legacy observe dans ce contexte: pas de `activation_checks`, pas de `emotional_state_context`, pas de `failure_mode`, pas de `priority_features`.
- Tours 2-4: ownership preserve par `active_coaching_recommendation`.

**Skills / Operations / Tools**
- Skill active: `coaching_recommendation`.
- Aucun direct effect ni operation executee.
- La demande "Ne cree rien depuis le chat" est respectee: aucun effet durable.
- Tour 3 reste dans le skill responsable du scope au lieu de partir en product_help.

**Warnings**
- Tour 1: `needs_type_confirmation=true` mal aligne avec un `plan_item_id` resolu et une action clairement nommee. Le local flow compense, mais la metadata du signal global devrait etre plus stricte.
- Tour 5: 502 upstream, pas de route exploitable.

**Fix propose**
- Source amont: global dispatcher contract prompt / sanitizer tests.
- Correction recommandee: ajouter un invariant contractuel sur `needs_type_confirmation=false` quand `action_context.source=plan` et `plan_item_id` existe, sauf conflit explicite dans le message utilisateur.
- Tests d'invariant attendus: dispatcher unit + run QA paraphrase sur action du plan identifiee.

## Verdict Global

**Yellow.** Le passage global dispatcher -> `coaching_recommendation` avec sortie minimale est bien effectif sur le tour d'entree, et l'ownership reste correct ensuite. Il reste un warning metadata sur `needs_type_confirmation`, et le cas emotion globale n'a pas pu etre valide a cause d'un 502 upstream.
