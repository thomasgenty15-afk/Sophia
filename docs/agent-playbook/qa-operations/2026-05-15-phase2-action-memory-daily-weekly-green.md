# QA Run Report - Action Memory / Daily / Weekly

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `phase2-real-20260515-green-7`
- Persona: persona QA locale generee par `tmp/phase2_real_qa_driver.mjs`
- Objectif: verifier que la memoire action/niveau est injectee humainement, que daily/weekly gardent leur contexte propre, et qu'une sortie explicite de daily reactive la memoire action.
- Trajectoire: 5 scenarios locaux, avec reruns correctifs sur le scenario de sortie daily.
- Surfaces visees: dispatcher, router, skill router, memory V2 active loader, garde-fous de reponse, daily/weekly review skills.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback.
- Validite QA: valide. Le run final exploitable est `green-7`; S5 a ete rerun jusqu'a `s5d`, apres corrections.

## 2. Tours De Conversation

### Scenario 1 - Memoire Action

**User**
> Pour Session focus courte, souvenirs mémorisés uniquement : qu'est-ce qui aide au démarrage ?

**Sophia**
> Oui. Pour Session focus courte, ce qui ressort est simple :
> - Tu démarres mieux quand tu ouvres directement un fichier déjà prêt et que tu lances un minuteur de 12 minutes.
> - Quand la cible augmente, garder un démarrage sous 15 minutes évite que l'habitude devienne intimidante.
> Donc je garderais surtout ça : préparer le démarrage, puis lancer le minuteur directement.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- action_reference: `identified`, habit, `exact_then_action_family_recent`
- memory_plan: `light`, targets action + family
- tool_skill_opportunity: attack_card detecte mais `should_offer=false`
- durable_effect: none

### Scenario 2 - Handoff Niveau

**User**
> Je commence un nouveau niveau. D'après le handoff du niveau précédent, qu'est-ce que tu dois garder en tête ?

**Sophia**
> Top pour le nouveau niveau ! 🚀
>
> Pour la suite, je dois surtout me rappeler que tu avances beaucoup mieux quand on se concentre sur une seule action concrète à la fois, d'après ce qu'on a vu dans l'étape Sortir de l'inertie. Mon but c'est d'éviter les gros blocs abstraits pour qu'on reste toujours dans l'efficace.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- level_reference: `transition`, `include_level_execution_handoff`
- memory_plan: `light`, targets level/current_level + transition
- operation: none
- durable_effect: none

### Scenario 3 - Daily Actif

**User**
> Session focus courte, c'est fait. Bloquer les créneaux de la semaine, pas fait, j'étais trop crevée pour m'y mettre.

**Sophia**
> Super pour la session focus, c'est top de l'avoir validée ! 👏
>
> Pour les créneaux, c'est normal d'être complètement crevée un vendredi soir. Ne force pas. Repose-toi bien ce soir, tu pourras bloquer ça tranquillement ce week-end à tête reposée.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `daily_action_review_v1`
- action_reference: suppressed, `review_skill_owns_action_context`
- memory_plan: `none`
- tool_skill_opportunity: `none`
- direct_effects: none
- durable_effect: none

### Scenario 4 - Weekly Actif

**User**
> Cette semaine les habitudes sont à moitié passées : j'ai fait deux sessions focus mais j'ai raté la marche. Je me sens mieux quand même, juste fatiguée.

**Sophia**
> Deux sessions focus validées, c'est déjà une très belle base ! C'est normal d'être fatiguée un vendredi soir, l'essentiel c'est que tu te sentes mieux globalement.
>
> Repose-toi bien ce soir, la marche de décompression pourra se faire tranquillement ce week-end sans te mettre la pression. 🛋️

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `weekly_adaptive_review_v1`
- action_reference: suppressed, `review_skill_owns_action_context`
- level_reference: suppressed, `review_skill_owns_level_context`
- memory_plan: `none`
- operation: none
- durable_effect: none

### Scenario 5d - Sortie Daily Puis Memoire Action

**User**
> Attends, oublie le bilan. Je veux parler de Session focus courte maintenant : pourquoi le démarrage bloque souvent ?

**Sophia**
> Oui. Ce que je garde pour cette action, c'est très concret :
> - Tu démarres mieux quand tu ouvres directement un fichier déjà prêt et que tu lances un minuteur de 12 minutes.
> - Quand la cible augmente, garder un démarrage sous 15 minutes évite que l'habitude devienne intimidante.
> Donc demain, le plus important n'est pas de changer de technique : c'est de préparer le fichier, puis de lancer le minuteur directement.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- route_reason: `active_skill_exit_requested`
- active_flow_arbitration: `abandon_active`
- action_reference: `identified`, habit, `exact_then_action_family_recent`
- memory_plan: `light`, targets action + family
- tool_skill_opportunity: attack_card detecte mais `should_offer=false`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La memoire action ne sort plus comme une ligne brute interne du type `Pattern famille` ou `le user`.
- Le handoff niveau ressort sous forme coachable et exploitable.
- Daily et weekly restent dans leur flow sans retrieval action/level parasite.
- La sortie explicite de daily est respectee, puis la memoire action redevient disponible.

**Problemes corriges pendant le run**
- S1 initial: memoire brute exposee. Fix: rendu humain dans `companion.ts` et `router/run.ts`.
- S2 initial: `handoff niveau` route en `product_help`. Fix: suppression du faux positif product_help sur level handoff.
- S2 initial: handoff non charge. Fix: exclusion correcte de `current_level` apres normalisation dans le loader niveau.
- S5 initial: sortie daily detectee mais skill continue. Fix: support des formes `exit` globales et imbriquees.
- S5 initial: fallback generique "sept minutes". Fix: priorite a la memoire action quand le user parle d'un blocage de demarrage sur une action identifiee.

**Fix propose**
- Aucun blocker restant sur ce scope. A surveiller plus tard: rendre les phrases de fermeture daily/weekly un peu moins "fin de conversation" quand le user n'a pas explicitement termine.

## 4. Analyse Systeme

**Verdict: green**

- Dispatcher: action_reference et level_reference sont poses correctement hors daily/weekly.
- Dispatcher: daily/weekly actifs suppriment bien action/level memory, sauf sortie explicite du flow.
- Skill router: sortie active prioritaire sur continuation, y compris signal `exit` imbrique sans `detected=true`.
- Memory loader: action exact + family charge; level handoff charge avec target generique `current_level`/`transition`.
- Operations: aucune operation executee; opportunities detectees restent non visibles/non executantes quand le signal n'est pas une demande explicite.
- Safety: low sur tous les tours.

## Verdict Global

`green` sur le scope teste.

Commandes de verification:

- `/usr/local/bin/deno check supabase/functions/sophia-brain/routers/skill_router.ts supabase/functions/sophia-brain/router/run.ts`
- `/usr/local/bin/deno test --allow-env supabase/functions/sophia-brain/routers/routers.test.ts supabase/functions/sophia-brain/dispatcher/dispatcher.v2.test.ts supabase/functions/_shared/memory/runtime/loader_test.ts supabase/functions/_shared/memory/runtime/active_loader_test.ts`
- Run local: `phase2-real-20260515-green-7`
