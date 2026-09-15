# QA Run Report - select_state_potion x emotional_repair ambiguous runs

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `qa-potion-emorepair-amb-r1`
  - `qa-potion-emorepair-amb-r2`
  - `qa-potion-emorepair-amb-r3`
- Persona: users Auth QA temporaires locaux, marques `is_test_persona`, supprimes apres chaque run.
- Objectif: tester des demandes ambigues entre soutien emotionnel immediat et handoff potion, notamment auto-jugement, honte, panique legere, no-potion, no-plan et no-question.
- Trajectoire: emotion dominante + mention potion; emotional_repair puis demande potion ou phrase; handoff potion actif puis interruption emotionnelle.
- Surfaces visees: dispatcher, active flow arbitration, `emotional_repair`, `select_state_potion`, clarification interne, no-mutation, DB potion/reminder/checkin.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, Auth locale verifiee, aucun renderer deterministe comme resultat QA, aucun fallback `processMessage`.
- Validite QA: valide. Les messages utilisateur ont ete choisis tour par tour apres lecture des reponses Sophia et traces courtes.

## 2. Tours De Conversation

### Run 1 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - mauvais owner selectionne.

**User**
> Je me sens vraiment nulle et j'ai la boule au ventre. J'ai pense a une potion, mais je ne sais pas si j'ai surtout besoin qu'on me parle doucement. Pas de suivi.

**Sophia**
> Pour t'aider avec ce sentiment, prefererais-tu une potion axee sur la douceur envers toi-meme ou une potion pour t'aider a te relever ? 🙂

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
- Symptome: le signal `emotional_repair` est detecte, mais le tour est possede par `select_state_potion` et pousse vers un choix entre deux potions.
- Source amont probable: arbitrage global emotion dominante vs tool skill quand le message contient une mention potion.
- Owner runtime: dispatcher / active arbitration entre `emotional_repair` et `select_state_potion`.
- Meilleure correction selon les guidelines: quand l'utilisateur formule explicitement "je ne sais pas si j'ai surtout besoin qu'on me parle doucement", l'arbitrage doit laisser `emotional_repair` repondre ou produire une clarification emotion vs potion, pas convertir directement en shortlist potion.
- Pourquoi ce n'est pas un patch local: le probleme vient de l'owner selectionne avant le rendu.

### Run 1 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - interruption explicite mal restauree.

**User**
> Non, pas de potion pour l'instant. Parle-moi doucement, juste une phrase qui m'aide a ne pas me juger.

**Sophia**
> Phrase de reparation : "Je reviens au prochain geste, pas a toute la montagne."
> Micro-action : ferme ce qui attire ton attention, rouvre seulement la tache utile, et fais 90 secondes dessus. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved`
- safety: `low`
- direct_effects: `[]`
- operation: `blocked`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: no-potion est respecte systemiquement, mais la reponse visible est generique et orientee tache, pas une phrase douce contre l'auto-jugement.
- Source amont probable: sortie no-potion du tool skill au lieu d'un handoff conversationnel vers `emotional_repair`.
- Owner runtime: active flow interruption / `select_state_potion` no-potion policy.
- Meilleure correction selon les guidelines: apres refus explicite de potion avec besoin emotionnel, rendre la main a `emotional_repair` ou utiliser un fallback emotionnel contextualise.
- Pourquoi ce n'est pas un patch local: le mauvais owner continue de porter la reponse apres l'interruption.

**Verification DB run 1**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`
- Cleanup cible: `auth.users` supprime, `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` nettoyes. `user_memories` retourne 404 dans cet environnement local.

### Run 2 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue.

**User**
> J'ai honte de moi, je me parle tres mal dans ma tete. Je ne veux pas de plan ni de solution, juste m'apaiser un peu.

**Sophia**
> Oh... c'est vraiment lourd a porter, la honte + cette voix qui t'attaque. [...]
> 1) Stop mental [...]
> 2) Detente corps [...]
> 3) Phrase de securite [...]
> Si tu arrives a me donner juste une info : c'est plutot "honte d'avoir fait X", ou plutot une honte "je suis nulle / je vaux rien" ? (A ou B)

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

**Analyse si yellow/red**
- Symptome: le bon owner est choisi, mais la reponse donne un protocole en 3 etapes et pose une question alors que le user dit "pas de plan ni de solution".
- Source amont probable: intake/reducer `emotional_repair` ne durcit pas assez la contrainte `no_plan`.
- Owner runtime: `emotional_repair` intake/reducer/renderer.
- Meilleure correction selon les guidelines: representer `no_plan` comme contrainte stricte de rendu et limiter a une phrase d'apaisement ou un micro-ancrage non structure comme solution.
- Pourquoi ce n'est pas un patch local: l'invariant doit valoir pour toutes les formulations "pas de plan / pas de solution".

### Run 2 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` - ambiguite non reconnue.

**User**
> C'est plutot la voix 'je suis nulle'. Est-ce qu'une potion d'amour envers moi serait mieux, ou tu me donnes juste une phrase ?

**Sophia**
> Ce que je comprends : C'est plutot la voix 'je suis nulle' je me parle tres mal dans ma tete
>
> Je te conseille de choisir une potion d'amour envers soi. [...]
> Dans la plateforme, dans la section Etat / Potions, puis choisis la potion recommandee, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le user demande explicitement "potion ou juste phrase"; Sophia choisit directement la potion au lieu de clarifier le mode souhaite.
- Source amont probable: handoff readiness / clarification tool pas declenche sur ambiguite emotion immediate vs potion.
- Owner runtime: arbitration `emotional_repair` -> `select_state_potion` et clarification interne potion.
- Meilleure correction selon les guidelines: produire une clarification structurée "phrase maintenant" vs "recommandation potion plateforme" quand les deux options sont presentes.
- Pourquoi ce n'est pas un patch local: c'est une ambiguite de mode, pas une formulation a regexer.

### Run 2 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - interruption explicite mal restauree.

**User**
> Non, finalement pas de potion. Garde juste la phrase douce, sans protocole.

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
- Symptome: "sans protocole" n'est pas respecte: Sophia ajoute une micro-action.
- Source amont probable: no-potion/no-tool fallback du handoff potion ne preserve pas les contraintes emotionnelles.
- Owner runtime: active flow interruption + `select_state_potion` cancellation reply.
- Meilleure correction selon les guidelines: une annulation potion avec "juste phrase / sans protocole" doit rendre une phrase seule ou passer a `emotional_repair`.
- Pourquoi ce n'est pas un patch local: l'interruption porte une contrainte de format qui doit survivre au changement d'owner.

**Verification DB run 2**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`
- Cleanup cible effectue comme run 1.

### Run 3 - Tour 1

**Verdict du tour:** green

**User**
> Je veux peut-etre une potion de reset, mais je ne sais pas si c'est apaisement ou clarte. Je suis un peu en vrac.

**Sophia**
> Est-ce que tu as plutot besoin de faire redescendre la pression ou de remettre de l'ordre dans tes idees ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

### Run 3 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue.

**User**
> En fait stop, je panique un peu et je me sens ridicule. Pas de question maintenant, juste aide-moi a me poser.

**Sophia**
> Ah merde... viens, on te pose la tout de suite. Respire avec moi: inspire 4 secondes, bloque 1 seconde, expire 6 secondes. [...]
> Maintenant, fais un mini-check "reel / pas reel" :
> 1) Qu'est-ce qui se passe dans ton corps la, maintenant (0 a 10) ?
> 2) Qu'est-ce que tu sens dans tes mains / tes pieds [...] ?
> 3) Tu es ou exactement, et tu es en securite a cet endroit-la (oui/non) ?
> [...] Tu peux me dire juste "1/10" ou "2/10" [...]

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

**Analyse si yellow/red**
- Symptome: l'interruption emotionnelle est bien routee vers `emotional_repair`, mais la contrainte explicite "pas de question" est violee par plusieurs questions.
- Source amont probable: `emotional_repair` intake/reducer ne transforme pas `no_questions` en invariant strict.
- Owner runtime: `emotional_repair` intake/reducer/renderer.
- Meilleure correction selon les guidelines: si `no_questions`, rendre une phrase ou un ancrage declaratif sans question ni demande de score.
- Pourquoi ce n'est pas un patch local: le contrat `emotional_repair` liste `no_questions` comme responsabilite propre du skill.

### Run 3 - Tour 3

**Verdict du tour:** green

**User**
> Pas de question s'il te plait. Juste une phrase courte.

**Sophia**
> La, tout de suite, t'as le droit d'etre en panique sans te juger. On remet juste ton corps en securite. 🫶

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_flow_defers_tool_skill_opportunity`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: aucun

**Verification DB run 3**
- `user_potion_sessions`: `*/0`
- `user_recurring_reminders`: `*/0`
- `scheduled_checkins`: `*/0`
- Cleanup cible effectue comme run 1.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Quand la demande emotionnelle est pure, `emotional_repair` peut etre le bon owner.
- Quand un handoff potion est actif, une interruption emotionnelle forte peut reprendre la main via `emotional_repair`.
- Les refus de potion n'executent rien et ne creent aucun follow-up.
- Les reponses restent non-mutantes et contiennent souvent une stabilisation immediate.

**Problemes**
- Run 1 Tour 1: Sophia pousse vers les potions alors que le user signale surtout un besoin d'etre parle doucement. Famille: `BF-ROUTE-01`. Impact: l'utilisateur doit refuser le tool pour recevoir du soutien.
- Run 1 Tour 2 et Run 2 Tour 3: apres no-potion, la reponse est generique et ajoute une micro-action alors que le user demande une phrase douce. Famille: `BF-AGENDA-02`. Impact: sortie de handoff peu empathique.
- Run 2 Tour 1 et Run 3 Tour 2: `emotional_repair` respecte le domaine mais pas les contraintes `no_plan` / `no_questions`. Famille: `BF-INTAKE-03`. Impact: friction forte en contexte emotionnel.
- Run 2 Tour 2: ambiguite "potion ou phrase" tranchee trop vite vers potion. Famille: `BF-INTAKE-04`. Impact: handoff produit alors qu'une clarification de mode etait attendue.

**Fix propose**
- Source amont: arbitrage emotion/tool, interruption active flow, `emotional_repair` constraint handling, clarification mode emotion vs potion.
- Correction recommandee: emotion dominante + mention explicite "parle-moi doucement / juste une phrase" doit prioriser `emotional_repair` ou demander une clarification mode. Les contraintes `no_plan`, `no_questions`, `juste phrase`, `sans protocole` doivent etre des invariants de rendu.
- Tests d'invariant attendus: emotion + potion ambiguous -> emotional clarification, pas shortlist potion immediate; no-potion + phrase douce -> no micro-action; no_questions -> zero question marks and no score request; potion-or-phrase -> clarification instead of direct handoff.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Bon: `emotional_repair` gagne sur Run 2 Tour 1 et Run 3 Tour 2.
- Warning: Run 1 Tour 1 detecte `emotional_repair` mais selectionne `select_state_potion`.
- Warning: Run 2 Tour 2 route vers `select_state_potion` malgre une ambiguite explicite entre potion et phrase.

**Skills / Operations / Tools**
- `select_state_potion` reste non-mutant: `tool_execution=platform_handoff` ou `blocked`, `executed_tools=[]`.
- `emotional_repair` ne cree aucun effet durable.
- Aucune confirmation executable n'est creee.

**Effets durables**
- Run 1: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Run 2: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Run 3: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.

**Memory / Retrieval**
- Pas de besoin memoire observe.
- Pas de write memoire visible.
- Cleanup cible effectue sur les users QA temporaires. `user_memories` repond 404 dans cet environnement local, sans impact sur le verdict.

**Fix propose**
- Ajuster l'arbitrage pour que `emotion_dominates` survive a une mention potion quand le user signale "juste parler / phrase / pas de protocole".
- Brancher ou renforcer la clarification interne sur "potion ou phrase".
- Renforcer les invariants `emotional_repair` pour `no_plan`, `no_questions`, `short_reply`.

## Verdict Global

**yellow.**

Le systeme est sur: aucun effet durable, aucune activation potion, aucun reminder/checkin. Mais l'experience emotionnelle est encore fragile dans les ambiguites: le routing pousse parfois trop vite vers potion et `emotional_repair` ne respecte pas toujours les contraintes de forme que le user donne en contexte sensible.
