## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-technique-switch-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-technique-switch-20260619-r1-1781879431593@example.com`
- Objectif: verifier les correctifs recents de `coaching_recommendation`: emotion liee a une action, definition de Mot de bascule, switch direct vers action du plan, guidance Plan, puis potion pour etat global.
- Trajectoire: action hors plan avec tension -> technique Mot de bascule -> action du plan -> guidance produit -> etat emotionnel global.
- Surfaces visees: dispatcher global, active flow ownership, reducer local `coaching_recommendation`, visible agents `no_plan_coaching`, `action_plan_coaching`, `emotion_coaching`, product guidance.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Fixture plan locale creee puis supprimee; run pilote tour par tour apres lecture de chaque reponse.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai un mail à Camille qui n'est pas dans mon plan. Je bloque dès que j'ouvre le brouillon, je suis tendu avant de m'y mettre, et je ne veux pas changer mon plan. Dans Sophia, tu me conseillerais quoi ?

**Sophia**
> Je te conseillerais une carte d’attaque simple : **Préparer le terrain**. Avant d’ouvrir le brouillon, ferme le reste, laisse juste le mail ouvert, puis prends 30 secondes pour écrire seulement l’objet et la première phrase. Si tu veux un déclencheur ultra court, utilise le mot **Go**.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- recommendation: attack_card
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok, si je choisis plutôt Mot de bascule pour ce mail, ça doit ressembler à quoi concrètement ? Ne crée rien depuis le chat.

**Sophia**
> Oui : pour un Mot de bascule, choisis un seul mot qui te met en mouvement dès que tu ouvres le brouillon. Par exemple : « Départ », « Go », « Brouillon » ou « Camille ». L’idée, c’est que tu le dises une fois, puis tu écrives juste la première phrase du mail.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- recommendation: attack_card
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Autre cas : dans mon plan j'ai l'action Préparer le dossier mutuelle, et là je bloque pareil avant de m'y mettre. Est-ce que je fais aussi une carte d'attaque ?

**Sophia**
> Oui, ici une carte d’attaque est adaptée. Elle sert à te préparer avant de commencer l’action du plan et à rendre le démarrage plus simple, surtout si tu bloques dès l’ouverture.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- action_context.source: plan
- action_context.plan_item_id: f96a9c8e-2074-4c76-92f9-da74a77bcb58
- pending_type_change: null
- recommendation: attack_card
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Ok, et pour cette action du plan, je vais où exactement pour la préparer moi-même ? Ne crée rien depuis le chat.

**Sophia**
> Oui : pour cette action du plan, tu la prépares dans Dashboard > Plan, depuis l’action “Préparer le dossier mutuelle”. C’est là que tu lances une carte d’attaque pour faciliter le démarrage.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- recommendation: attack_card
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Là je change de sujet : depuis ce matin je suis tendu de manière générale, sans action précise. J'ai juste besoin de retrouver un état plus calme. Dans Sophia, tu me conseillerais quoi ?

**Sophia**
> Je te conseillerais une potion d’apaisement : ta tension est globale, sans action précise à préparer. Elle est faite pour faire redescendre la pression et retrouver plus de calme. Ouvre Ressources, puis choisis Apaisement.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: emotion_coaching
- coaching_type: emotional
- recommendation: state_potion
- exit_note_information: null
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia traite la tension liee au mail comme une friction d'action, pas comme une potion.
- Le Mot de bascule est correctement explique comme un mot unique, avec exemples courts.
- Le passage action hors plan -> action du plan est naturel: Sophia ne demande pas une confirmation inutile.
- La guidance produit du tour 4 est claire: depuis `Dashboard > Plan`, sur l'action concernee, sans condition "si disponible".
- La potion n'est proposee qu'au tour 5, quand le user precise un etat global sans action concrete.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Aucun fix requis sur ce run.
- Garder les invariants recents: Mot de bascule = un mot; emotion liee a une action = coaching d'action; action du plan structurellement claire = switch direct.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours restent sous `response_owner=coaching_recommendation`.
- Aucun `exit_to_global_dispatcher` observe.
- Tour 1-2: `coaching_type=no_plan_action`, `visible_task=no_plan_coaching`.
- Tour 3-4: switch direct vers `coaching_type=plan_action`, `visible_task=action_plan_coaching`, avec `plan_item_id` present.
- Tour 5: switch vers `coaching_type=emotional`, `visible_task=emotion_coaching`, sans exit.

**Skills / Operations / Tools**
- Skill active: `coaching_recommendation`.
- Operations/tools: aucun outil appele, conforme au cadre conversationnel.
- Direct effects: aucun, conforme aux messages user.
- Effets durables: aucun.

**Memoire / Etat**
- Etat actif maintenu pendant tout le run.
- `pending_type_change=null` au tour 3: le correctif de switch direct fonctionne.
- `exit_note_information=null` sur les tours observes: aucune sortie locale parasite.

**Nettoyage**
- Fixture plan QA supprimee via cleanup cible: `seeded_plan_cleanup=2026-06-19T14:33:24.597Z`.
- Trace locale: `tmp/qa-normal-conversation/coachingrec-technique-switch-20260619-r1/state.json`.

## Verdict Global

**green** — le run valide les correctifs vises: technique Mot de bascule correcte, pas de potion pour emotion liee a l'action, switch plan direct, guidance Plan propre, et potion seulement pour etat emotionnel global.
