## 1. Contexte Du Test

- Date: 2026-06-29
- Run: `coaching_min_signal_20260629_r2`
- Persona: `qa-skill`, user temporaire `qa-normal-coaching_min_signal_20260629_r2-1782746837707@example.com`
- Objectif: verifier en conditions reelles que le dispatcher global transmet le signal minimal coaching sans `needs_type_confirmation`, et que le dispatcher local deduit correctement les confirmations/switches.
- Trajectoire: action du plan -> explication novice -> revision attack/defense -> guidance produit dans le flow -> switch hors plan -> switch emotion globale.
- Surfaces visees: global dispatcher, `coaching_recommendation`, active flow ownership, visible agents `action_plan_coaching`, `no_plan_coaching`, `emotion_coaching`, state DB `__active_conversation_skill_v1`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. 6 tours HTTP 200, messages choisis tour par tour apres lecture des reponses/traces.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je bloque sur l'action de mon plan Préparer le dossier mutuelle. Dès que j'ouvre les justificatifs je pars faire autre chose. Tu me conseillerais quoi dans Sophia ?

**Sophia**
> Je partirais sur une carte d’attaque, technique préparer le terrain : là, le blocage vient surtout du contexte au moment d’ouvrir les justificatifs, donc l’idée est de rendre le démarrage plus simple et de limiter la dispersion dès le premier geste.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun effet durable attendu

**Observation systeme**
- Signal global observe: `coaching_type=plan_action`, `confidence=0.88`, `action_context.source=plan`, `plan_item_id=132e2ad3-05a9-41ed-9e0b-f9cc198e415e`, `action_title=Préparer le dossier mutuelle`.
- `needs_type_confirmation` absent du contexte global.
- Etat actif apres tour: `skill_id=coaching_recommendation`, `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=attack_card`, `variant=preparer_terrain`.

### Tour 2

**Verdict du tour:** green

**User**
> Attends, je ne connais pas trop ces mots. Une carte d'attaque et préparer le terrain, ça veut dire quoi concrètement ?

**Sophia**
> Une carte d’attaque, c’est un petit appui pour t’aider à démarrer une action du plan quand le premier geste te bloque. 
> “Préparer le terrain”, c’est la technique qui consiste à rendre le contexte plus simple avant de commencer : enlever ce qui te disperse, avoir les bons éléments sous la main, et réduire la friction.
>
> Ici, je partirais sur une carte d’attaque, technique préparer le terrain : tu décroches dès l’ouverture des justificatifs, donc le problème vient surtout du contexte et de l’organisation avant l’action.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun effet durable attendu

**Observation systeme**
- Ownership conserve par le flow actif.
- La demande novice est comprise comme une explication, sans saut vers `product_help` et sans reclarification de type.

### Tour 3

**Verdict du tour:** green

**User**
> En fait, quand je m'y mets vraiment, je commence plutôt bien. Le souci c'est qu'après deux minutes je vois un papier manquant, je panique et je ferme tout. Là ce serait toujours une carte d'attaque ?

**Sophia**
> Non, là je partirais plutôt sur une carte de défense. Une carte d’attaque sert surtout à t’aider à démarrer ; ici, tu démarres déjà, puis tu décroches quand tu tombes sur un papier manquant. La carte de défense est plus adaptée pour prévoir ce moment critique, repérer le piège, et avoir un retour très court pour ne pas tout fermer.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun effet durable attendu

**Observation systeme**
- Etat actif: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`.
- Recommandation revisee correctement: `current_recommendation=defense_card`, `last_visible_decision.lever=defense_card`.
- Pas de projection dans les champs de carte, seulement une explication informelle du principe.

### Tour 4

**Verdict du tour:** green

**User**
> Ok, et si je veux préparer cette carte de défense moi-même dans Sophia, je vais où exactement ? Ne crée rien depuis le chat.

**Sophia**
> Sur le Plan, ouvre l’action « Préparer le dossier mutuelle », puis prépare la carte de défense depuis là. Si tu veux juste retrouver une carte déjà existante, c’est dans Ressources. Je ne la crée pas depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun effet durable attendu

**Observation systeme**
- La question produit liee au levier reste dans le flow coaching.
- Pas de saut vers `product_help`.
- Pas d'execution depuis le chat, conforme a la demande user.

### Tour 5

**Verdict du tour:** green

**User**
> Autre cas : j'ai aussi un mail à Camille qui n'est pas dans mon plan. Je bloque pareil au moment d'ouvrir le brouillon. Là tu m'aiderais comment sans l'ajouter au plan ?

**Sophia**
> Je partirais sur une carte d’attaque libre, technique texte magique : une phrase courte pour te faire ouvrir le brouillon sans tourner autour, parce que ton blocage est surtout au tout premier geste.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun effet durable attendu

**Observation systeme**
- Target switch clair hors plan sans question globale.
- Etat actif: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`.
- Evidence stockee: `explicit target switch to no_plan_action: Ouvrir le brouillon du mail à Camille`.
- Recommandation: `free_attack_card`, variant `texte_magique`, destination `Dashboard > Ressources`.

### Tour 6

**Verdict du tour:** green

**User**
> Là je change un peu : ce n'est plus lié au dossier ou au mail, je me sens juste agité et saturé depuis ce matin. Dans Sophia, tu conseillerais quoi ?

**Sophia**
> Je te conseillerais une potion d’apaisement : quand la pression monte et que tout devient trop saturant, c’est le meilleur appui. Si tu veux la retrouver, va dans Ressources puis dans Potions.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun effet durable attendu

**Observation systeme**
- Target switch emotionnel global correctement traite.
- Etat actif: `coaching_type=emotional`, `last_visible_task_kind=emotion_coaching`.
- Recommandation: `state_potion`, `potion_type=apaisement`.
- Le flow distingue bien emotion globale vs emotion rattachee a une action.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia repond au besoin courant sans demander au user de choisir entre les categories internes.
- Les explications novice au tour 2 sont utiles et contextualisees.
- La correction attack -> defense au tour 3 est naturelle et explique la difference.
- Les transitions plan action -> hors plan -> emotion globale sont fluides.
- Le tour 4 respecte "ne cree rien depuis le chat" et donne une guidance courte.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Aucun fix requis sur ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: global dispatcher route vers `coaching_recommendation` avec le nouveau contrat minimal.
- Tours 2 a 6: ownership conserve via `active_coaching_recommendation`.
- Aucun saut non demande vers `product_help`, `safety`, normal reply ou outil.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- Aucun tool execute, conforme au scope recommendation-only.
- Aucun direct effect.

**Contrat Global -> Local**
- Le contexte transmis au tour 1 contient seulement `coaching_type`, `confidence`, `reason`, `action_context`.
- `needs_type_confirmation` est absent.
- Le local flow ne demande pas de confirmation quand `plan_action` est resolu avec `source=plan` et `plan_item_id`.

**Etat Local**
- Tour 1: `plan_action`, `action_plan_coaching`, `attack_card`, variant `preparer_terrain`.
- Tour 3: meme cible plan, revision interne vers `defense_card`.
- Tour 5: target switch vers `no_plan_action`, `no_plan_coaching`, `free_attack_card`.
- Tour 6: target switch vers `emotional`, `emotion_coaching`, `state_potion/apaisement`.

**Effets durables**
- Aucun effet durable attendu ni observe.
- La fixture action du plan a ete creee uniquement pour le run et nettoyee ensuite.

**Fix propose**
- Aucun fix requis.

## Verdict Global

- Verdict: green
- Le correctif `needs_type_confirmation` est valide en run reel: le champ ne sort plus du dispatcher global et le dispatcher local deduit correctement la clarté du signal depuis la structure.
- Cleanup: effectue. Fixture plan supprimee via `qa_seed_coaching_plan cleanup`; user temporaire et donnees conversationnelles supprimes via `qa_normal_conversation_turn cleanup`. Note: `user_memories` retourne 404 en local car la table n'existe pas.
- Artefacts bruts: `tmp/qa-normal-conversation/coaching_min_signal_20260629_r2/state.json`.
