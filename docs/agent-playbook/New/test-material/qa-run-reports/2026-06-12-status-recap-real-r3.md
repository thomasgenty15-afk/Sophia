# QA Run Report — status-recap-real-r3

## 1. Contexte Du Test

- Date: 2026-06-12 Europe/Paris
- Run: `status-recap-real-r3`
- Persona: `qa-skill`, connexion temporaire reutilisee `status_recap_status_recap_20260612_r2`, user `5aafed25-ae58-4413-bbe4-97da5b12d85d`
- Objectif: rerun IA reel apres corrections T1/T2 pour verifier que l'entree explicite va directement vers `status_recap`, que le recap global rend les preferences coach, et que les follow-ups restent dans le dispatcher local.
- Trajectoire: demande de point factuel read-only -> relance factuelle -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher global, arbitration `status_recap`, active flow local, projection DB, visible agent `status_recap`, absence de mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer/fallback deterministe.
- Validite QA: valide avec warning. Le chemin IA reel est respecte et les quatre tours ont repondu HTTP 200, mais la connexion reutilisee contenait deja un rappel recurrent de test avant le seed r3. Le run prouve le comportement du flow, mais l'isolation DB n'est pas parfaite.

Artefacts:
- Raw: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r3.raw.json`
- Durable: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r3.durable.json`
- Cleanup: `tests/real-personas/qa-skill/runs/status_recap/2026-06-12-status-recap-real-r3.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incoherent ou suite malsaine

**User**
> Peux-tu me faire un point factuel sur ce qui existe vraiment dans mon espace, sans rien modifier ?

**Sophia**
> Voici un point factuel sur ton espace :
>
> Fait : Ton coach est configuré sur un ton chaleureux et direct.
> Prévu : Rappel budget le 13/06 et point hebdo chaque lundi à 08:45.
> Fragile : Le rappel pour le devis est marqué comme annulé.
>
> Tu as un rappel pour "relire le dossier budget" prévu le 13 juin à 09:30. Tes deux rappels récurrents "faire le point hebdo" sont actifs pour les lundis matin. Aucune carte d'attaque ou de défense n'est présente.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_status`
- visible_task: `status_compact`
- reason_code: `status_recap_local_answer_status`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=2`, `coach_preference_count=1`

**Analyse si yellow/red**
- Symptome: le routage est corrige et la preference coach est bien rendue, mais la reponse mentionne deux rappels recurrents parce que la DB contenait un rappel recurrent residuel avant le seed r3.
- Source amont probable: hygiene de connexion QA / cleanup incomplet d'un run precedent sur la connexion temporaire reutilisee.
- Owner runtime: QA runner / isolation de fixture, pas le dispatcher `status_recap`.
- Meilleure correction selon les guidelines: utiliser une connexion temporaire neuve ou nettoyer explicitement les artefacts QA precedents par identifiants de run avant de relancer.
- Pourquoi ce n'est pas un patch local: la projection lit correctement ce qui est en DB; le probleme vient du perimetre de test.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, fais-le maintenant, uniquement factuel et sans rien modifier.

**Sophia**
> Voici le récapitulatif de ton espace :
>
> Fait : Ton ton est réglé sur chaleureux et direct.
> Prévu : Un rappel pour le dossier budget le 13/06 et tes points hebdo du lundi.
> Fragile : Rien à signaler, un ancien rappel de devis a été annulé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_status`
- visible_task: `status_compact`
- reason_code: `status_recap_local_answer_status`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=2`, `coach_preference_count=1`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et côté rappels annulés, tu vois quelque chose ou rien du tout ?

**Sophia**
> Oui, j'en vois un. Le rappel pour ton devis qui était prévu le 11 juin à 17:00 a bien été annulé.
>
> fait: le rappel de devis du 11 juin est annulé.
> prévu: ton rappel pour le dossier budget est maintenu.
> fragile: c'est le seul rappel annulé que j'ai trouvé.
>
> Est-ce que tu veux que je te liste tes rappels qui sont toujours actifs ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `answer_cancelled_objects`
- visible_task: `cancelled_objects`
- reason_code: `status_recap_local_answer_cancelled_objects`
- projection_summary: `one_shot_cancelled_recent_count=1`, `one_shot_pending_count=1`, `recurring_reminder_count=2`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Tu peux me dire sur quelles sources tu t’es basé pour ce point factuel ?

**Sophia**
> Je m'appuie uniquement sur tes données concrètes et l'historique de tes actions pour te répondre, sans faire de suppositions.
>
> Fait : Ton point hebdo récurrent et ta préférence pour un ton chaleureux.
> Prévu : Ton rappel pour relire le dossier budget prévu le 13 juin.
> Fragile : Ton rappel de devis annulé le 11 juin.
>
> Ces éléments proviennent directement de tes rappels enregistrés et de tes réglages de coach. Est-ce que cela répond à ta question ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_status_recap_uses_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: `status_recap`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: `explain_sources`
- visible_task: `explain_sources`
- reason_code: `status_recap_local_explain_sources`
- projection_summary: `one_shot_pending_count=1`, `one_shot_cancelled_recent_count=1`, `recurring_reminder_count=2`, `coach_preference_count=1`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le Tour 1 n'ajoute plus de friction de verification: la demande factuelle read-only entre directement dans `status_recap`.
- Les reponses couvrent les categories attendues: preference coach, rappel ponctuel prevu, rappel annule, rappel recurrent.
- Les follow-ups sont naturels: Sophia repond a la question sur les annules, puis explique ses sources sans changer de mode ni proposer une mutation.

**Problemes**
- Tour 1: la mention de deux rappels recurrents vient d'un residu DB de test. Famille: `BF-TEST-01`. Impact utilisateur faible dans ce run, mais impact QA moyen car la fixture attendue n'etait pas parfaitement isolee.

**Fix propose**
- Source amont: runner QA / hygiene de connexion temporaire.
- Correction recommandee: creer une nouvelle connexion temporaire par rerun ou ajouter un cleanup cible des artefacts QA precedents identifies, sans broad delete.
- Tests d'invariant attendus: `before_rows` doit contenir seulement les fixtures attendues du run courant ou documenter explicitement les donnees preexistantes acceptees.

## 4. Analyse Systeme

**Verdict: green avec warning QA**

**Routage**
- T1: `selected_handler=status_recap`, `route_reason=skill_entry_signal`; la friction `flow_opportunity_verification` observee en r2 est corrigee.
- T2/T3/T4: `route_reason=active_status_recap_local_dispatcher`; `blocked_paths` contient `global_dispatcher` avec raison `active_status_recap_uses_local_dispatcher`.
- Aucune sortie globale silencieuse observee pendant le flow actif.

**Skills / Operations / Tools**
- `status_recap` produit les stages attendus: `status_compact`, `cancelled_objects`, `explain_sources`.
- Aucun tool durable n'est execute: `executed_tools=[]`, `durable_effect=null` sur les quatre tours.
- Les actions locales correspondent aux demandes: `answer_status`, `answer_cancelled_objects`, `explain_sources`.

**Memory / Effets durables**
- Seed r3: 1 rappel ponctuel pending, 1 rappel ponctuel cancelled, 1 rappel recurrent actif, 1 preference coach.
- Donnee preexistante observee avant le run: 1 rappel recurrent actif supplementaire sur le meme user temporaire.
- Cleanup final r3: artefacts r3 supprimes (`chat_messages`, `scheduled_checkins`, `user_profile_facts`, rappel recurrent r3) et `user_chat_states` repatche; un rappel recurrent preexistant reste visible car il ne fait pas partie du perimetre r3.

**Problemes**
- Warning QA: isolation imparfaite de la connexion reutilisee. Ce n'est pas une faute du flow: la projection DB a correctement lu deux rappels recurrents presents en base.

**Fix propose**
- Source amont: runner/fixture QA.
- Correction recommandee: ne plus reutiliser une connexion dont le cleanup verifie encore des artefacts produit; si reutilisation forcee, nettoyer uniquement les IDs/metadata de runs QA precedents connus.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow `status_recap` fonctionne nettement mieux en IA reelle locale: entree directe, global dispatcher bloque pendant le flow actif, preference coach rendue, follow-ups annules/sources locaux, aucun effet durable. Le seul warning est QA/testability: la connexion reutilisee contenait un rappel recurrent residuel, donc le run n'est pas parfaitement isole.
