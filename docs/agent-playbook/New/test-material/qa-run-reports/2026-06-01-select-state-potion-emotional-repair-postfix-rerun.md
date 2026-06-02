# QA Run Report - select_state_potion x emotional_repair postfix rerun

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `qa-potion-emorepair-postfix-r1`
  - `qa-potion-emorepair-postfix-r2`
  - `qa-potion-emorepair-postfix-r3`
- Persona: users Auth QA temporaires locaux, dedies par run, nettoyes apres verification.
- Objectif: relancer 3 runs complexes apres correction des points identifies sur l'ambiguite `select_state_potion` x `emotional_repair`.
- Trajectoire: mention potion + besoin de douceur; refus no-potion + phrase seule; emotional repair avec no-question; clarification orientation potion vs soutien.
- Surfaces visees: dispatcher, orientation clarification, `emotional_repair`, `select_state_potion`, active flow handoff, no-mutation, DB potion/reminder/checkin.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, Auth locale verifiee, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture des reponses et traces courtes. Un premier tour HTTP 502 a ete retente et documente.

## 2. Tours De Conversation

### Run 1 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` - incident runtime / upstream pendant le run.

**User**
> Je me sens vraiment nulle et j'ai la boule au ventre. J'ai pense a une potion, mais je ne sais pas si j'ai surtout besoin qu'on me parle doucement. Pas de suivi.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun observe; retry effectue sur le meme message

**Analyse si yellow/red**
- Symptome: le endpoint retourne `An invalid response was received from the upstream server`.
- Source amont probable: incident local Edge/upstream, pas une decision conversationnelle.
- Owner runtime: runtime local / test endpoint.
- Meilleure correction selon les guidelines: ne pas remplacer par fallback; retenter et documenter.
- Pourquoi ce n'est pas un patch local: ce tour n'a pas produit de sortie Sophia exploitable.

### Run 1 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - mauvais owner selectionne.

**User**
> Je me sens vraiment nulle et j'ai la boule au ventre. J'ai pense a une potion, mais je ne sais pas si j'ai surtout besoin qu'on me parle doucement. Pas de suivi.

**Sophia**
> Est-ce que tu preferes une potion d'amour envers soi pour t'apporter de la douceur, ou une potion de reparation pour t'aider a te relever ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le signal `emotional_repair` est present, mais le tour est possede par `select_state_potion` et propose un choix entre deux potions.
- Source amont probable: arbitrage emotion dominante vs mention potion; la demande "besoin qu'on me parle doucement" n'est pas traitee comme ambiguite mode soutien vs potion.
- Owner runtime: dispatcher / active arbitration / `select_state_potion` handoff readiness.
- Meilleure correction selon les guidelines: produire une clarification mode "soutien maintenant" vs "recommandation potion plateforme", ou laisser `emotional_repair` porter la reponse si le besoin de douceur est dominant.
- Pourquoi ce n'est pas un patch local: l'ecart vient du choix d'owner et de l'intake de mode avant le renderer.

### Run 1 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - interruption explicite mal restauree.

**User**
> Non, pas de potion pour l'instant. Parle-moi doucement, juste une phrase qui m'aide a ne pas me juger, sans protocole.

**Sophia**
> Phrase de reparation : "Je reviens au prochain geste, pas a toute la montagne."
> Micro-action : ferme ce qui attire ton attention, rouvre seulement la tache utile, et fais 90 secondes dessus. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- direct_effects: `[]`
- operation: `blocked`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: no-potion est bloque systemiquement, mais "juste une phrase" et "sans protocole" ne sont pas respectes; Sophia ajoute une micro-action orientee tache.
- Source amont probable: sortie no-potion du handoff potion garde l'owner `select_state_potion` et ne restaure pas correctement le besoin emotionnel.
- Owner runtime: active flow interruption / `select_state_potion` cancellation policy.
- Meilleure correction selon les guidelines: une annulation potion avec besoin de phrase douce doit rendre une phrase emotionnelle seule ou repasser par l'owner `emotional_repair`.
- Pourquoi ce n'est pas un patch local: c'est une restauration d'agenda et de contraintes, pas seulement une phrase a remplacer.

**Verification DB run 1**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`

### Run 2 - Tour 1

**Verdict du tour:** green

**User**
> Je panique un peu et je me sens ridicule. Pas de question s'il te plait, juste une phrase courte pour me poser.

**Sophia**
> Je te comprends pas vraiment, je le ressens avec toi : la, t'as juste besoin d'etre en securite, pas d'etre parfaite. Respire une fois, et c'est deja assez. 😮‍💨

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Note**
- Le tour respecte l'intention systeme: bon owner, aucune question, pas de plan, pas de tool. Le wording "Je te comprends pas vraiment" est maladroit mais le comportement attendu est present.

**Verification DB run 2**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`

### Run 3 - Tour 1

**Verdict du tour:** green

**User**
> Je veux peut-etre une potion de reset, mais je ne sais pas si c'est apaisement ou clarte. Je suis un peu en vrac.

**Sophia**
> Souhaitez-vous choisir une potion pour changer d'etat ou preferez-vous un moment de soutien pour faire le point ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

### Run 3 - Tour 2

**Verdict du tour:** green

**User**
> Moment de soutien, pas de question s'il te plait, juste une phrase pour me poser.

**Sophia**
> Ok. Respire, tu n'es pas oblige d'etre "au clair" tout de suite : la, tu as juste le droit d'atterrir. 🌿

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `orientation_clarification_resolved`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Note**
- La clarification a bien jugule l'ambiguite potion vs soutien. Le deuxieme tour ne route pas explicitement vers `emotional_repair`, mais il respecte la resolution, la contrainte no-question et l'absence d'effet durable.

**Verification DB run 3**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Run 2: Sophia respecte "pas de question" et "juste une phrase courte", sans tool.
- Run 3: Sophia clarifie proprement entre potion et soutien, puis donne une phrase de soutien concise.
- Aucun tour ne claim une activation, un suivi programme ou une mutation chat.

**Problemes**
- Run 1 T2: Sophia force un choix entre potions alors que le user formule une hesitation explicite entre potion et besoin qu'on lui parle doucement. Famille: `BF-ROUTE-01`. Impact: le user fragile doit corriger Sophia au lieu d'etre entendu.
- Run 1 T3: apres "pas de potion / juste une phrase / sans protocole", Sophia ajoute une micro-action. Famille: `BF-AGENDA-02`. Impact: la contrainte humaine principale est respectee techniquement mais pas conversationnellement.
- Run 2 T1: wording maladroit "Je te comprends pas vraiment"; impact faible, a surveiller comme qualite de generation.

**Fix propose**
- Source amont: arbitration emotion/tool + no-potion cancellation policy.
- Correction recommandee: durcir l'ambiguite `immediate_support` vs `state_potion_handoff` dans le vrai chemin IA local; sur no-potion + phrase/sans protocole, restaurer `emotional_repair` ou rendre une phrase unique sans micro-action.
- Tests d'invariant attendus: run reel "potion mais parle-moi doucement"; run reel "non pas de potion, juste une phrase, sans protocole"; test anti-regression absence DB effects.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Run 1 T2 route vers `tool_skill/select_state_potion` malgre `skill_entry_ids=["emotional_repair"]`.
- Run 1 T3 reste dans `select_state_potion` avec `tool_execution=blocked`, ce qui bloque correctement l'effet mais conserve un renderer/fallback inadapte.
- Run 3 T1 utilise `orientation_clarification`, avec candidats potion vs soutien, ce qui correspond au comportement attendu.

**Skills / Operations / Tools**
- `select_state_potion` reste non-mutant dans tous les tours observes.
- `emotional_repair` fonctionne correctement sur Run 2 pour les contraintes no-question/no-plan.
- Aucun confirmation token executable n'a ete observe dans les traces courtes.

**Memory / Effets durables**
- Verifications REST locales apres les runs:
  - `qa-potion-emorepair-postfix-r1`: `user_potion_sessions=*/0`, `user_recurring_reminders=*/0`, `scheduled_checkins=*/0`
  - `qa-potion-emorepair-postfix-r2`: `user_potion_sessions=*/0`, `user_recurring_reminders=*/0`, `scheduled_checkins=*/0`
  - `qa-potion-emorepair-postfix-r3`: `user_potion_sessions=*/0`, `user_recurring_reminders=*/0`, `scheduled_checkins=*/0`
- Cleanup cible execute pour les trois users QA. Le runner local retourne `404` sur `user_memories`, table absente dans cet environnement; les tables creees par les runs et `auth.users` ont ete nettoyees.

**Problemes**
- Run 1 T1: incident HTTP 502. Famille: `BF-TEST-01`. Impact systeme: retry necessaire, mais run exploitable apres reprise.
- Run 1 T2: mauvais owner. Famille: `BF-ROUTE-01`. Impact systeme: `select_state_potion` capture une demande emotionnelle ambigue.
- Run 1 T3: cancellation no-potion mal restauree. Famille: `BF-AGENDA-02`. Impact systeme: `tool_execution=blocked` correct, mais reponse visible ne respecte pas le format demande.

**Fix propose**
- Source amont: dispatcher/clarification handoff + policy no-potion du skill potion.
- Correction recommandee: assurer que le code de clarification/cancellation corrige est bien pris par le runtime Edge local et ajouter un test integration full AI ou harness qui valide le vrai endpoint, pas seulement les tests contractuels.
- Tests d'invariant attendus: `force_full_ai=true` local, traces `executed_tools=[]`, DB effects a 0, et contenu sans micro-action quand `sans protocole`.

## Verdict Global

**yellow**

Les effets durables sont verts: aucune session potion, aucun recurring reminder, aucun scheduled checkin, aucun executed tool. La fluidite reste jaune sur Run 1: l'ambiguite potion vs soutien et l'interruption no-potion ne sont pas encore correctement jugulees dans le vrai chemin IA local.
