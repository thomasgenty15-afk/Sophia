# QA Run - Coaching Recommendation Postfix R2

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `coachingrec-postfix-20260624-r2`
- Persona: user QA temporaire `qa-normal-coachingrec-postfix-20260624-r2-1782306551952@example.com`
- Objectif: verifier `coaching_recommendation` apres correction de l'usage de `Mot de bascule` et du target switch plan-action -> no-plan-action.
- Trajectoire: action du plan avec blocage de demarrage, explication novice, comparaison potion/action, guidance produit, switch vers action hors plan, guidance Ressources.
- Surfaces visees: global dispatcher, local dispatcher `coaching_recommendation`, visible agents `action_plan_coaching` et `no_plan_coaching`, active flow ownership, target switch, absence de direct effect/tool.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, pas de reboot Supabase.
- Validite QA: valide. Run IA reel exploitable, 6 tours, state DB et traces courtes verifies. Cleanup run-scope effectue; `user_memories` a retourne 404 au cleanup, les autres tables et `auth.users` ont ete nettoyes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon plan, j'ai l'action Préparer le dossier mutuelle. Quand je vois le dossier, je bloque avant de commencer et je repousse. Tu me conseillerais quoi dans Sophia ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Preparer le terrain : tu rends le dossier plus facile à ouvrir en avance en préparant tout ce qu’il faut autour de l’action, pour lever le blocage du démarrage.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Je connais pas trop Sophia : une carte d'attaque et Préparer le terrain, ça veut dire quoi concrètement ?

**Sophia**
> Une carte d’attaque, c’est une aide pour t’aider à démarrer une action du plan quand tu bloques avant le premier geste.
>
> « Préparer le terrain », ça veut dire rendre le démarrage plus facile en amont : sortir les papiers, ouvrir le bon dossier, prévoir un endroit calme, enlever ce qui te distrait.
>
> Ici, je partirais sur une carte d’attaque, technique Préparer le terrain, parce que ton blocage arrive avant de commencer « Préparer le dossier mutuelle ».

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

### Tour 3

**Verdict du tour:** green

**User**
> En vrai j'ai aussi la boule au ventre quand je pense au dossier. Est-ce qu'une potion Apaisement serait plus logique que cette carte ?

**Sophia**
> La potion Apaisement sert surtout quand la pression monte de façon globale. Ici, ta boule au ventre est liée à une action précise du plan et surtout au moment de démarrer, donc une carte d’attaque est plus adaptée. Je partirais sur une carte d’attaque, technique Préparer le terrain : tu enlèves au maximum ce qui freine l’entrée en action avant d’ouvrir le dossier, pour que le premier geste soit plus simple.

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

### Tour 4

**Verdict du tour:** green

**User**
> Ok, et si je veux préparer cette carte moi-même, je vais où exactement ? Ne la crée pas depuis le chat.

**Sophia**
> Je partirais sur une carte d’attaque, technique Préparer le terrain : tu l’ouvres depuis l’action "Préparer le dossier mutuelle" dans Dashboard > Plan, et elle t’aide à rendre le démarrage plus simple en aménageant le contexte avant de t’y mettre. Si tu veux juste la retrouver plus tard, ce sera dans Ressources.

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

### Tour 5

**Verdict du tour:** green

**User**
> Autre cas : j'ai un mail à Camille qui n'est pas dans mon plan. Je bloque pareil dès que j'ouvre le brouillon, mais je ne veux pas l'ajouter au Plan. Tu m'aiderais comment ?

**Sophia**
> Je partirais sur une carte libre d’attaque, technique Préparer le terrain : tu te fais un cadre simple avant d’ouvrir le brouillon, pour que le démarrage du mail à Camille demande moins d’effort.

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
- diagnostic utile: `dispatcher_context.reason=explicit target switch to no_plan_action: Écrire le mail à Camille`

### Tour 6

**Verdict du tour:** green

**User**
> Et cette carte libre, je la prépare où ? Je veux éviter de passer par le Plan pour ce mail.

**Sophia**
> Je partirais sur une carte d’attaque libre, technique Préparer le terrain : tu ouvres Ressources, puis tu choisis ou crées cette carte pour organiser ce qui t’entoure avant d’ouvrir le brouillon du mail. Ça colle bien ici parce que ton blocage arrive au démarrage.

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

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La recommandation initiale evite bien `Mot de bascule` et choisit `Préparer le terrain`, coherent pour un blocage de demarrage simple.
- Les explications novice sont comprehensibles et gardent le contexte de l'action du plan.
- La comparaison avec une potion est traitee dans le bon scope: emotion liee a l'action, donc carte d'action plutot que potion globale.
- La transition vers le mail hors plan est naturelle, sans demander une clarification inutile.
- Les chemins produit sont globalement bons: Plan pour carte liee a l'action du plan, Ressources pour carte libre.

**Problemes**
- Aucun bug yellow/red observe. Micro-friction non bloquante au tour 4: “tu l’ouvres depuis l’action” pourrait etre formule plus clairement en “tu la prepares depuis l’action”.

**Fix propose**
- Aucun fix obligatoire.
- Amelioration possible: affiner le wording visible produit pour distinguer “preparer une carte” de “ouvrir une carte”.
- Tests d'invariant attendus: conserver les cas couverts par ce run dans les tests IA/regression.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 entre via `coaching_recommendation_signal`.
- T2-T6 restent en `active_coaching_recommendation`.
- Aucun saut vers `product_help` pendant les questions de guidance produit liees a la recommandation active.
- T5 applique bien le switch interne: `local_coaching_type=no_plan_action`, contexte `free_action_coaching`, action title `Écrire le mail à Camille`.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- Aucun tool execute.
- Aucun direct effect.
- Aucune confirmation pending.

**Memory / Effets durables**
- Aucun effet durable attendu ni observe.
- L'action de plan seedee et le user QA temporaire ont ete nettoyes apres run.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Aucun fix obligatoire.
- Garder en surveillance les variantes plus ambigues de target switch, notamment si le user introduit une action hors plan sans dire explicitement “pas dans mon plan”.

## Verdict Global

Verdict global: `green`.

Les deux corrections visees sont validees en run IA reel: `Mot de bascule` n'est pas pousse pour un blocage de demarrage simple, et le passage action du plan -> action hors plan reste dans `coaching_recommendation` avec target switch interne.
