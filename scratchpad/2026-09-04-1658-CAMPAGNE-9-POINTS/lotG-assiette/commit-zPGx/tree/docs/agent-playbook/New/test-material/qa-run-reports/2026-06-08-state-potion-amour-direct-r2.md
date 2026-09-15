# QA Run - Potion Amour Direct R2

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `state-potion-amour-direct-20260608-r2`
- Persona: user QA temporaire `qa-amour-direct-1780918864647@example.com`, supprime apres cleanup cible
- Objectif: verifier les corrections post R1 sans passer par la selection globale `select_state_potion`
- Trajectoire: etat actif pre-injecte `active_subskill_id=select_state_potion.amour`, champ libre volontairement pauvre, creusement, handoff, repeat, apply_attempt
- Surfaces visees: `select_state_potion.amour`, dispatcher local commun, reducer sous-skills, visible agent, no-mutation
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe, aucun changement applicatif pendant le run
- Validite QA: valide

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> C'est par rapport a mon echec de vendredi : depuis, je me parle tres durement.

**Sophia**
> Je comprends, c'est souvent dans ces moments-la qu'on est le plus severe avec soi-meme. Pour que la Potion d'amour puisse t'apporter le soutien dont tu as besoin, est-ce que tu peux m'en dire un peu plus sur ce qui s'est passe vendredi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=clarifying`, `reason_code=amour_field_missing`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: no DB write

### Tour 2

**Verdict du tour:** green

**User**
> J'ai abandonne un engagement qui comptait pour moi, et depuis je me repete que je suis incapable de tenir ce qui est important.

**Sophia**
> C'est une etape difficile, et je sens combien ce jugement est lourd a porter aujourd'hui. La Potion d'amour est la pour t'aider a retrouver un regard plus humain et apaiser ce dialogue interieur.
>
> Pour l'utiliser, rends-toi dans l'onglet Etat / Potions et selectionne la Potion d'amour. Voici les elements que tu peux y indiquer :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?
> J'ai abandonne un engagement qui comptait pour moi, et depuis je me repete que je suis incapable de tenir ce qui est important.
>
> Tu te sens surtout comment ?
> Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=amour_handoff_delivered`, `platform_handoff.draft != null`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: no DB write

### Tour 3

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Pas de souci. Une fois dans l'onglet Etat / Potions, selectionne la Potion d'amour et complete les champs avec ces elements :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?
> J'ai abandonne un engagement qui comptait pour moi, et depuis je me repete que je suis incapable de tenir ce qui est important.
>
> Tu te sens surtout comment ?
> Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=amour_repeat_handoff`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: no DB write

### Tour 4

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> Je ne peux malheureusement pas lancer la potion directement depuis notre echange. Pour qu'elle puisse t'aider, il faut que tu fasses la manipulation dans l'onglet Etat / Potions en choisissant la Potion d'amour.
>
> Voici les reponses exactes a y inscrire :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?
> J'ai abandonne un engagement qui comptait pour moi, et depuis je me repete que je suis incapable de tenir ce qui est important.
>
> Tu te sens surtout comment ?
> Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=amour_apply_attempt_no_chat_execution`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: no DB write

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le flow ne passe pas par la selection globale: tous les tours restent dans `select_state_potion.amour`.
- Une information libre trop courte ne declenche pas de handoff premature; Sophia demande un creusement naturel.
- La reponse enrichie produit un handoff utile avec les champs plateforme exacts.
- `redis-moi` repete sobrement les champs sans relivrer un nouveau handoff.
- `ok active-la` reste non-mutant et renvoie vers la plateforme.

**Problemes**
- Aucun probleme bloquant observe. Wording faible: `Pour qu'elle puisse t'aider` reste acceptable mais pourrait etre encore plus neutre.

**Fix propose**
- Aucun fix requis pour ce run. Garder en surveillance le wording apply_attempt.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours: `response_owner=tool_skill`, `selected_handler=select_state_potion.amour`.

**Skills / Operations / Tools**
- T1: `clarifying`, pas de draft premature.
- T2: `handoff_delivered`, draft present.
- T3: `repeat_handoff`, correction R1 verifiee.
- T4: `apply_attempt`, correction no-execution preservee.
- Tous les tours: `executed_tools=[]`, `committed_effects=[]`.

**Effets durables**
- `user_potion_sessions=[]`.
- `user_recurring_reminders=[]`.
- `scheduled_checkins=[]`.
- Cleanup cible effectue: messages, state, tables d'effets et user Auth temporaire supprimes.

## Verdict Global

Verdict global: green. Les deux points testes sont corriges en QA reelle: pas de handoff premature sur contexte trop pauvre, et `redis-moi` apres handoff est bien trace en `repeat_handoff`.
