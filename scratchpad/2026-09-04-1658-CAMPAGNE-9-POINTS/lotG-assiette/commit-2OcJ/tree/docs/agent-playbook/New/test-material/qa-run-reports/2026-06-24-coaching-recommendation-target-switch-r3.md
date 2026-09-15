# QA Run - Coaching Recommendation Target Switch R3

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `coachingrec-target-switch-20260624-r3`
- Persona: user QA temporaire `qa-normal-coachingrec-target-switch-20260624-r3-1782309120844@example.com`
- Objectif: verifier les target switches de `coaching_recommendation`.
- Trajectoire: action du plan -> action hors plan -> guidance hors plan -> action du plan -> etat emotionnel global -> guidance potion -> action du plan -> action hors plan.
- Surfaces visees: global dispatcher, local dispatcher `coaching_recommendation`, visible agents action plan/no-plan/emotion, active flow ownership, target switch, absence de direct effect/tool.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, pas de reboot Supabase.
- Validite QA: valide. Run IA reel exploitable, 8 tours, state DB et traces courtes verifies. Cleanup run-scope effectue; `user_memories` a retourne 404 au cleanup, les autres tables et `auth.users` ont ete nettoyes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; `BF-INTAKE-06` - Mauvais domaine semantique

**User**
> Dans mon plan, j'ai l'action Préparer le dossier mutuelle. Je bloque parce que je me dis que je vais forcément oublier un papier et je repousse. Dans Sophia, tu me conseillerais quoi ?

**Sophia**
> Je te conseillerais une carte d’attaque, pas une réflexion en plus.
>
> Pour ce blocage, le bon angle c’est de réduire la peur d’oubli, pas de te forcer à “te motiver”. Le plus utile, c’est souvent de lancer juste le dossier avec une liste provisoire des papiers manquants, au lieu d’attendre d’être sûr à 100 % 😌

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: active skill cleared after tour
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `skill_status=exit`, `active_skill=null`

**Analyse si yellow/red**
- Symptome: Sophia route bien vers `coaching_recommendation`, mais le flow sort immediatement apres une recommandation, sans garder l'active state. La reponse recommande aussi une carte d'attaque sans nommer la technique.
- Source amont probable: completion/visible decision du skill: la recommandation visible n'est pas stabilisee en local state, donc le reducer cloture au lieu de continuer.
- Owner runtime: `coaching_recommendation` visible output + reducer local.
- Meilleure correction selon les guidelines: quand le skill recommande un levier coaching in-domain, il doit conserver l'active state avec `last_visible_decision`/`current_recommendation`, sauf close explicite; le visible agent doit nommer la technique de carte d'attaque.
- Pourquoi ce n'est pas un patch local: le probleme concerne le contrat de sortie et le cycle de vie d'etat du flow, pas une formulation exacte.

### Tour 2

**Verdict du tour:** green

**User**
> Autre cas : j'ai un mail à Camille qui n'est pas dans mon plan. Là je bloque surtout sur la première phrase du brouillon, et je ne veux pas l'ajouter au Plan. Tu changes de conseil ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Le texte magique : une phrase courte pour débloquer la première ligne sans te prendre la tête.
>
> Par exemple, une amorce simple du type : “Je t’écris au sujet de…”

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `no_plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `dispatcher_context.reason=explicit target switch to no_plan_action: mail à Camille`

### Tour 3

**Verdict du tour:** green

**User**
> Et cette carte libre pour le mail, je la prépare où exactement ? Je veux rester hors Plan.

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Le texte magique : ici, le blocage est surtout dans la première phrase, donc une courte phrase de recadrage peut te lancer plus vite.
>
> Pour la préparer, va dans Dashboard > Ressources, puis ouvre Ressources et choisis ou crée cette carte là-bas.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `no_plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Reviens au dossier mutuelle dans mon Plan : là ce n'est pas la première phrase, c'est plutôt que j'ai peur d'oublier un document. Tu garderais le même type de carte ?

**Sophia**
> Oui, je garderais une carte d’attaque, technique préparer le terrain : ici, le blocage vient du risque d’oubli concret, donc l’idée est de poser les papiers et les étapes avant de commencer pour rendre le dossier plus simple à lancer.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `dispatcher_context.reason=explicit target switch to plan_action: Préparer le dossier mutuelle`

### Tour 5

**Verdict du tour:** green

**User**
> Autre chose, là ce n'est plus lié à une action précise : depuis ce matin je me sens juste découragé et déconnecté, comme si je laissais tout filer. Dans Sophia tu proposerais quoi ?

**Sophia**
> Je te proposerais une potion d’anti-décrochage : elle colle bien quand tu sais que tu laisses filer, sans que ce soit lié à une action précise. Elle peut t’aider à te raccrocher un peu. Si tu veux, je peux aussi te dire où la retrouver dans Ressources.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `emotional`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `dispatcher_context.reason=explicit target switch to emotional: découragé et déconnecté`

### Tour 6

**Verdict du tour:** green

**User**
> Oui, dis-moi juste où je la trouve, sans rien créer depuis le chat.

**Sophia**
> Tu la trouves dans Dashboard > Ressources, puis dans la section Potions. Pour ce que tu décris, je te proposerais plutôt une potion anti-décrochage.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `emotional`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 7

**Verdict du tour:** green

**User**
> Reviens encore au dossier mutuelle du Plan : si je veux préparer l'action liée au dossier, tu me remets sur quel type de soutien ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Le texte magique : ici, le blocage ressemble surtout à une appréhension avant de démarrer, et une phrase courte de recadrage aide à lancer l’action plus facilement.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `dispatcher_context.reason=explicit target switch to plan_action: Préparer le dossier mutuelle`

### Tour 8

**Verdict du tour:** green

**User**
> Ok, autre cas hors Plan : j'ai aussi une note pour mon propriétaire que je repousse, parce que je ne sais pas comment commencer. Là tu me conseilles quoi sans passer par le Plan ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Le texte magique : une phrase courte pour couper le flou et t’aider à écrire le tout premier jet de cette note sans te bloquer sur la forme. Si tu veux, je peux aussi te dire où la retrouver dans Ressources.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `no_plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `dispatcher_context.reason=explicit target switch to no_plan_action: Note pour mon propriétaire`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les target switches actifs sont fluides et sans clarification inutile: no-plan -> plan, plan -> emotional, emotional -> plan, plan -> no-plan.
- Le reequilibrage des techniques se voit: `Le texte magique` est choisi pour les blocages narratifs/premiere phrase; `Preparer le terrain` est choisi pour le risque concret d'oubli de document.
- Les questions de localisation restent dans `coaching_recommendation`.

**Problemes**
- Tour 1: la reponse ne nomme pas la technique de carte d'attaque et le flow sort immediatement. Familles: `BF-STATE-01`, `BF-INTAKE-06`. Impact: le tour suivant n'est pas un vrai switch depuis active state, meme si Sophia se rattrape via un nouveau signal. Severite: yellow.

**Fix propose**
- Source amont: lifecycle de l'active state apres recommandation visible et contrat de decision visible.
- Correction recommandee: garantir qu'une recommandation de levier coaching conserve l'active state avec une decision structuree, et que toute carte d'attaque visible nomme sa technique.
- Tests d'invariant attendus: premier tour plan-action recommande une carte avec technique et garde `active_skill=coaching_recommendation`; le tour suivant "autre cas hors Plan" doit etre observe comme switch actif, pas comme nouvelle entree.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 route vers `coaching_recommendation`, mais `skill_status=exit` et `active_skill=null` apres le tour.
- T2 repart via `coaching_recommendation_signal`, donc ce tour est correct fonctionnellement mais ne prouve pas un switch depuis l'active state precedent.
- T4, T5, T7 et T8 prouvent les target switches internes actifs:
  - T4: `explicit target switch to plan_action: Préparer le dossier mutuelle`
  - T5: `explicit target switch to emotional: découragé et déconnecté`
  - T7: `explicit target switch to plan_action: Préparer le dossier mutuelle`
  - T8: `explicit target switch to no_plan_action: Note pour mon propriétaire`

**Skills / Operations / Tools**
- Skill actif principal: `coaching_recommendation`.
- Aucun tool execute.
- Aucun direct effect.
- Aucune confirmation pending.

**Memory / Effets durables**
- Aucun effet durable attendu ni observe.
- L'action de plan seedee et le user QA temporaire ont ete nettoyes apres run.

**Problemes**
- Tour 1: mauvaise sortie d'etat apres recommandation. Famille: `BF-STATE-01`. Impact systeme: perte de continuite et impossibilite d'observer le target switch au tour suivant.
- Tour 1: decision visible incomplete sur la technique. Famille: `BF-INTAKE-06`. Impact systeme: la projection de recommandation n'est pas stabilisee en `last_visible_decision`.

**Fix propose**
- Source amont: `coaching_recommendation` visible output/reducer merge.
- Correction recommandee: rendre invariant le maintien d'active state apres recommandation in-domain, meme quand le visible agent repond sans JSON structure exploitable; la fallback decision doit reconstruire au moins une decision stable ou relancer un tour visible conforme.
- Tests d'invariant attendus: run unitaire ou integration sur T1-like, puis run IA reel plan-action -> no-plan-action sans redemarrage par `coaching_recommendation_signal`.

## Verdict Global

Verdict global: `yellow`.

Les target switches actifs fonctionnent bien une fois le flow actif: no-plan, plan et emotional sont correctement appliques sans sortie globale. Le point a corriger est le premier tour qui peut encore sortir du flow apres une recommandation, ce qui casse la continuite avant le premier switch.
