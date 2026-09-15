# QA Run Report - daily-two-plans-action-help-real-r1

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `daily-two-plans-action-help-real-202606121911-r1`
- Persona: Rose locale, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: verifier le daily action review avec deux plans, une action par plan, et deux demandes utilisateur separees d'explication d'action avant cloture.
- Trajectoire: fixture dynamique DB ciblee -> `process-checkins` -> `whatsapp_pending_actions` -> `whatsapp-webhook` local loopback -> `daily_action_review_v1` -> reducer/effects -> tour post-cloture.
- Surfaces visees: ouverture proactive daily, pending daily, dispatcher local daily, inline product help, reducer daily, entries `user_plan_item_entries`, occurrences.
- Cadre IA reel: Supabase local, `process-checkins` reel pour l'ouverture, `whatsapp-webhook` reel pour les tours user, LLM reel, aucun renderer/fallback direct. Le endpoint `/test-send-message force_full_ai=true` n'a pas ete utilise car ce flow daily actif est consomme par `whatsapp_pending_actions` dans le webhook.
- Validite QA: valide. Cleanup cible effectue et verifie.

Verdict global: **yellow**.

## 2. Tours De Conversation

### Tour 0 - ouverture proactive

**Verdict du tour:** green

**User**
> Ouverture systeme via `process-checkins`.

**Sophia**
> Faire cinq minutes de respiration calme et Ranger deux papiers administratifs etaient au programme aujourd'hui : qu'est-ce qui s'est passe pour toi avec ces deux actions ?

**Trace courte**
- http_status: `process-checkins` HTTP 200
- selected_handler: `process-checkins.action_evening_review_v2`
- pending_status: `pending`
- chat_capability: `daily_action_review`
- note_information: initial bridge note present, target `daily_action_review_v1`
- durable_effect: scheduled checkin `awaiting_user`, pending created

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - daily evidence/reducer

**User**
> J'ai oublie l'action respiration. C'est quoi exactement ? Ca consiste en quoi, concretement ?

**Sophia**
> Dans tes rappels, cela correspond au « moment du sas ». Concretement, il s'agit de prendre quelques minutes pour toi, sans rien allumer, pour traverser la vague du moment. L'idee est de ne pas fuir l'ennui ce soir pour construire la clarte dont tu as besoin pour tes projets.

**Trace courte**
- http_status: `whatsapp-webhook` HTTP 200
- response_owner: `companion`, purpose `whatsapp_default_brain_reply`
- selected_handler: pending daily consumed, `local_flow_transfer=inline_product_help`
- pending_status: `pending`
- review_state: respiration set to `outcome=missed`, `reason_category=forgot`, `missing_slots=["still_relevant"]`
- direct_effects: none
- durable_effect: no entry, no occurrence update

**Analyse si yellow/red**
- Symptome: le user demandait l'explication de l'action, mais le state daily a transforme "j'ai oublie l'action" en resultat `missed`.
- Source amont probable: dispatcher/reducer daily, distinction insuffisante entre "j'ai oublie ce que c'etait" et "je ne l'ai pas faite".
- Owner runtime: `daily_action_review_v1`.
- Meilleure correction selon les guidelines: renforcer l'intake daily pour classer une demande d'aide sur l'action comme aide produit/description sans stabiliser `outcome` tant qu'aucune preuve de realisation ou non-realisation n'est donnee.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a corriger; c'est une regle de preuve daily et de remplissage des slots.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - daily evidence/reducer

**User**
> Ok merci. Et l'action des deux papiers administratifs, j'ai oublie aussi : c'est quoi exactement, je dois faire quoi ?

**Sophia**
> Je comprends que tu n'as pas pu realiser ta seance de respiration ni le rangement de tes papiers. L'action "Ranger deux papiers administratifs" consiste a prendre deux documents administratifs et a les classer ou les mettre a leur place. Est-ce que ces actions sont toujours pertinentes pour toi ?

**Trace courte**
- http_status: `whatsapp-webhook` HTTP 200
- selected_handler: daily clarification
- pending_status: `pending`
- review_state: both actions set to `outcome=missed`, `reason_category=forgot`, `missing_slots=["still_relevant"]`
- direct_effects: none
- durable_effect: no entry, no occurrence update

**Analyse si yellow/red**
- Symptome: Sophia affirme que les deux actions n'ont pas ete realisees, alors que l'utilisateur a seulement demande ce qu'elles signifiaient.
- Source amont probable: meme confusion evidence/help que tour 1, amplifiee par le second message.
- Owner runtime: `daily_action_review_v1`.
- Meilleure correction selon les guidelines: ne pas remplir `outcome=missed` depuis une demande "c'est quoi / je dois faire quoi" sans preuve temporelle explicite.
- Pourquoi ce n'est pas un patch local: le visible agent repete un etat faux produit en amont; le fix doit etre dans le contrat dispatcher/reducer.

### Tour 3

**Verdict du tour:** green

**User**
> Oui, elles sont toujours pertinentes. Et en fait je viens de faire les deux : cinq minutes de respiration calme sans fumer, puis j'ai trie et range deux papiers.

**Sophia**
> Bravo pour ces cinq minutes de respiration et le tri de tes deux papiers, c'est bien pris en compte. Comment te sens-tu ?

**Trace courte**
- http_status: `whatsapp-webhook` HTTP 200
- selected_handler: `daily_action_review_v1`
- pending_status: `done`
- structured_extraction_status: `complete`
- entries: 2 entries inserted, source `daily_action_review_v1`, outcome `completed`
- occurrence_statuses: both `done`
- durable_effect: correct final commit

### Tour 4 - post-cloture

**Verdict du tour:** green

**User**
> Ca va, je suis plutot soulage. Merci, on peut s'arreter la pour aujourd'hui.

**Sophia**
> Parfait, je suis content que tu sois soulage. On s'arrete la pour aujourd'hui. Repos bien, et demain on reprend tranquillement.

**Trace courte**
- http_status: `whatsapp-webhook` HTTP 200
- pending_status: already `done`
- response_owner: `companion`, default reply after daily closure
- durable_effect: no extra daily mutation

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ouverture est claire et couvre les deux actions.
- Les explications d'action sont globalement utiles.
- Le flow accepte ensuite une correction naturelle et cloture correctement.

**Problemes**
- Tours 1-2: Sophia traite "j'ai oublie l'action / c'est quoi" comme "je n'ai pas fait l'action". Famille: `BF-PROACTIVE-01`. Impact: le user peut se sentir mal compris et doit corriger le systeme. Severite: yellow.

**Fix propose**
- Source amont: dispatcher/reducer `daily_action_review_v1`.
- Correction recommandee: ajouter une regle de preuve: les demandes de definition, rappel de consigne ou "je ne sais plus ce que c'est" doivent produire un stage d'aide/clarification sans stabiliser `outcome`.
- Tests d'invariant attendus: deux paraphrases "j'ai oublie ce que c'etait" ne doivent pas changer `review_state.items[*].outcome`; une phrase "j'ai oublie de le faire" doit encore pouvoir produire `missed`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `process-checkins` a bien genere l'ouverture reelle et le pending daily.
- Le pending contient `initial_note_information` vers `daily_action_review_v1`.
- Pendant le pending actif, les tours passent par le webhook daily. Le tour 1 utilise `local_flow_transfer=inline_product_help`, avec reponse visible `whatsapp_default_brain_reply`; pas d'effet durable applique.

**Skills / Operations / Tools**
- Aucun executor direct ni renderer deterministe n'a ete utilise.
- L'effect plan est reste bloque tant que les slots etaient incomplets.
- Au tour 3, l'effect plan commit deux entries `completed`, puis marque les deux occurrences `done` et le pending `done`.

**Memory / Retrieval**
- Pas de micro-memory brute observee dans le visible. Le contexte utile vient du pending daily et des targets.

**Cleanup**
- Supprimes: pending QA, scheduled checkin QA, 2 plans, 2 actions, 2 occurrences, 2 entries, 9 messages QA, 4 dedup inbound.
- Restaures: profil Rose et checkins preexistants `8363fc9a-540b-4756-945b-eafdd7fc0f0f`, `666976c4-762d-4014-8eb0-c00a6b75f951`.
- Verification cleanup: `qaCheckin=[]`, `qaPending=[]`, `qaEntries=[]`, `qaPlans=[]`, `qaMessages=[]`, `qaDedup=[]`.

**Verdict global tres court**

Le flow daily fonctionne en conditions reelles et commit correctement a la fin, mais le run reste `yellow`: la comprehension des demandes d'explication d'action pollue trop tot l'etat daily en `missed`.
