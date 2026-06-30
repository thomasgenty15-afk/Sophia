# QA Run Report - feature_opportunity local real R2

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `feature-opportunity-20260624-r2`
- Persona: `qa-skill`
- Connexion dediee: `feature_opportunity_feature-opportunity-20260624-r2`
- User temporaire: `qa-qa-skill-feature-opportunity-feature-opportunity-20260624-r2@example.com`
- Objectif: verifier le fonctionnement normal de `feature_opportunity` apres realignement du contrat `exit_to_global_dispatcher`, sans flow `create_one_shot_reminder`.
- Trajectoire: opportunite `initiatives` -> follow-up reglages initiative -> sortie de scope vers `product_help` -> opportunite `coach_preferences`.
- Surfaces visees: global dispatcher, active flow ownership, `feature_opportunity`, `product_help`, note information d'exit local, absence de tools/side effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Un premier essai de runner ad hoc a echoue avant tout appel Sophia (`require` + top-level await Node); aucun tour endpoint n'a ete produit. Le run exploitable commence au Tour 1 ci-dessous.
- Artefacts locaux: `tmp/qa-feature-opportunity-20260624-r2/t01.json` a `t04.json`, `db-check-before-cleanup.json`, `cleanup.json`.
- Nettoyage: effectue en fin de run sur le seul user temporaire; 8 `chat_messages` et 1 `user_chat_states` supprimes, compte Auth temporaire supprime.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Le lundi matin, avant de regarder mes mails, je repars souvent à zéro et je perds le contexte. Un petit soutien récurrent de Sophia pourrait m'aider à reprendre mes priorités, sans que ce soit un rappel ponctuel.

**Sophia**
> Ça ressemble bien à une initiative : un soutien récurrent le lundi matin, avant tes mails, pour te remettre tes priorités en tête. Si tu veux, je peux t’aider à formuler quoi dire et à quel moment le faire.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `memory_mode=none`, `context_need=minimal`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, justement : dans une initiative, on peut régler quoi exactement ? Je veux comprendre les paramètres avant de décider.

**Sophia**
> Dans une initiative, tu peux cadrer surtout : quoi dire, pourquoi ou avant quel moment le dire, à quelle heure, quels jours elle est active, quelle destination elle vise entre Plan actuel ou Base de vie, et si elle est active ou inactive.
>
> Dans ton cas, ça pourrait être un petit message le lundi matin, avant tes mails, pour te remettre tes priorités en tête. Si tu veux, je peux aussi te dire quel réglage choisir pour que ce soit plus doux ou plus direct.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `memory_mode=none`, `context_need=minimal`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Merci. Autre sujet : tu peux m'expliquer en deux phrases la différence entre une carte d'attaque et une carte de défense ?

**Sophia**
> Une carte d’attaque t’aide à démarrer une action : elle réduit la friction et clarifie le premier geste. Une carte de défense te sert à tenir quand ça déraille : elle anticipe le risque et prévoit une réponse simple ou un plan B.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `response_intent=product_help_question`, `memory_mode=none`
- executed_tools: `[]`
- durable_effect: aucun
- note_information: presente; `source_flow_id=feature_opportunity`, `target_dispatcher=global`, `handoff_reason=topic_change`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Au passage, ça me frustre un peu quand Sophia me pose plein de questions alors que je veux surtout une réponse directe. Est-ce que ce genre de préférence peut se changer ?

**Sophia**
> Oui, ce genre de préférence se change. Pour aller dans ton sens, tu peux viser un style plus direct, avec moins de questions et des réponses plus brèves dans les Preferences coach.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `response_intent=answer_feature_preference_change`, `memory_mode=none`
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Tour 1: Sophia reconnait naturellement le signal "soutien recurrent" comme une `initiative`, sans parler de rappel ponctuel ni promettre une creation.
- Tour 2: elle donne les reglages utiles d'une initiative: contenu, contexte/moment, heure, jours actifs, destination, statut actif/inactif.
- Tour 3: la transition "Autre sujet" est fluide; Sophia repond a la question produit sans rester coincee dans l'opportunite precedente.
- Tour 4: la frustration sur le style de coaching est traitee comme une preference modifiable, avec trois axes explicites: directivite, moins de questions, longueur plus breve.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: n/a.
- Tests d'invariant attendus: conserver un test runtime sur `exit_to_global_dispatcher` depuis `feature_opportunity` vers une question produit autonome, plus un test visible sur les reglages `initiatives`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1 route vers `feature_opportunity` avec `feature_opportunity_signal`, conforme au signal recurrent non ponctuel.
- Tour 2 conserve l'active flow via `active_feature_opportunity`, conforme au follow-up directement lie a l'initiative.
- Tour 3 valide le realignement: le flow actif `feature_opportunity` produit une note d'exit vers `global`, puis le second arbitrage selectionne `product_help` au lieu de forcer `normal_reply`.
- Tour 4 route vers `feature_opportunity` pour `coach_preferences`, conforme au signal frustration + preference de style.

**Skills / Operations / Tools**
- `feature_opportunity` repond comme skill conversationnel et ne declenche aucun executor.
- `product_help` repond au Tour 3 uniquement apres sortie globale; aucun handoff local direct n'est observe.
- `create_one_shot_reminder` n'est jamais route ni execute.

**Memory / Effets durables**
- Verification DB avant nettoyage:
  - `chat_messages`: 8 lignes, attendu pour 4 tours user + assistant.
  - `user_chat_states`: 1 ligne, attendu pour l'active flow temporaire.
  - `scheduled_checkins`: 0.
  - `user_plan_item_entries`: 0.
  - `system_runtime_snapshots`: 0.
  - `memory_items`: 0.
- Nettoyage cible effectue:
  - `chat_messages`: 8 supprimes.
  - `user_chat_states`: 1 supprime.
  - `scheduled_checkins`, `user_plan_item_entries`, `system_runtime_snapshots`, `memory_items`: 0 supprimes.
  - Auth user temporaire supprime avec succes.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: n/a.
- Tests d'invariant attendus:
  - entree recurrente "soutien recurrent de Sophia" -> `feature_opportunity`;
  - follow-up reglages initiative -> `active_feature_opportunity`;
  - changement de sujet produit depuis active `feature_opportunity` -> `product_help` apres note d'exit globale;
  - frustration sur trop de questions -> `feature_opportunity` / `coach_preferences`;
  - aucun effet durable sans demande explicite.

## Verdict Global

Green. Le flow `feature_opportunity` fonctionne normalement sur les deux familles testees (`initiatives`, `coach_preferences`) et la sortie vers global redispatche correctement vers `product_help` au lieu de tomber en `normal_reply`.
