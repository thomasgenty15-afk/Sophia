## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `qa-potion-no-regex-ui-handoff-20260602-r1`
- Persona: user temporaire local `qa-normal-qa-potion-no-regex-ui-handoff-20260602-r1-1780411305509@example.com`
- Objectif: verifier le flow `select_state_potion` platform handoff apres retrait du routing metier local par regex, avec ambiguite emotional repair vs potion, handoff UI, tentative d'activation, repeat et sortie no_potion.
- Trajectoire: ambiguite -> clarification -> handoff potion clarte -> apply_attempt user -> repeat user -> no_potion/emotional repair.
- Surfaces visees: dispatcher, orientation_clarification, emotional_repair, active handoff `select_state_potion`, renderer handoff, absence d'effets DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, messages choisis tour par tour.
- Validite QA: valide. Incident pre-run: plusieurs anciens `init` QA etaient bloques et Supabase local time-outait. Les anciens `init` ont ete arretes, Supabase local est redevenu joignable, puis le run exploitable a ete lance proprement.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis en vrac, j'hésite entre être rassuré et une potion de clarté. Je veux la reprendre dans la plateforme, sans suivi.

**Sophia**
> Est-ce que tu veux un soutien pour te rassurer ou est-ce que tu choisis la potion de clarté ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-02 / BF-STATE-01, a confirmer

**User**
> Potion de clarté. Je veux surtout voir quoi faire en premier, et repartir avec une priorité nette, sans rappel ni suivi.

**Sophia**
> Ce que je comprends : Potion de clarté voir quoi faire en premier
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : L'utilisateur se sent 'en vrac' et a besoin d'extraire une priorité unique pour sortir de la confusion immédiate.
> Petit pas immédiat : C'est normal de se sentir noyé quand trop de choses arrivent en même temps. On va juste identifier le premier pas.
>
> À mettre dans la plateforme :
> Potion : Potion de clarte
> - Qu'est-ce qui est flou pour toi en ce moment ? Je suis en vrac
> - Tu as surtout besoin de comprendre quoi ? Quoi faire
> - Tu veux ressortir avec quoi ? Quelque chose de simple
> - Si tu veux, ajoute le point qui te brouille le plus. C'est normal de se sentir noyé quand trop de choses arrivent en même temps. On va juste identifier le premier pas.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le handoff est globalement bon et non-mutant, mais le rendu fuit du meta-langage en troisieme personne (`L'utilisateur...`) et la valeur UI affiche `Potion de clarte` sans accent. Les champs plateforme sont utiles mais encore un peu generiques.
- Source amont probable: intake/draft handoff ou mapping UI des labels/valeurs.
- Owner runtime: `select_state_potion` handoff draft + renderer.
- Meilleure correction selon les guidelines: produire des champs UI directement adressables au user et stabiliser les libelles platform inputs depuis le catalogue produit, sans regex ni patch de phrase.
- Pourquoi ce n'est pas un patch local: le bug concerne la structure de sortie handoff et son mapping produit, pas cette formulation exacte.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01

**User**
> Ok vas-y active-la.

**Sophia**
> Ce que je comprends : Je suis en vrac Potion de clarté
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : L'utilisateur se sent dépassé ('en vrac') et a besoin d'extraire une priorité nette de la confusion ambiante.
> Petit pas immédiat : Prends une grande inspiration. C'est normal de se sentir en vrac quand tout se mélange. On va poser les choses ensemble pour que tu puisses y voir plus clair.
>
> À mettre dans la plateforme :
> Potion : Potion de clarte
> - Qu'est-ce qui est flou pour toi en ce moment ? Je suis en vrac
> - Tu as surtout besoin de comprendre quoi ? Quoi faire
> - Tu veux ressortir avec quoi ? Quelque chose de simple
> - Si tu veux, ajoute le point qui te brouille le plus. Prends une grande inspiration. C'est normal de se sentir en vrac quand tout se mélange. On va poser les choses ensemble pour que tu puisses y voir plus clair.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: aucune execution n'a lieu, ce qui est correct, mais la tentative explicite d'activation n'est pas classifiee `apply_attempt`; elle tombe dans `active_handoff_turn_unclear`.
- Source amont probable: contrat de sortie structuree active handoff / arbitration, pas une detection locale par phrase.
- Owner runtime: active handoff policy de `select_state_potion` et sortie structuree dispatcher/turnFrame.
- Meilleure correction selon les guidelines: enrichir le signal structure `active_handoff_action=apply_attempt` pour les confirmations d'activation dans un handoff potion actif.
- Pourquoi ce n'est pas un patch local: il ne faut pas ajouter `includes("active")`; il faut que l'intention soit portee par le dispatcher/agenda ou par le contrat structure du handoff.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01

**User**
> Redis-moi où je la lance et quoi mettre, en très court.

**Sophia**
> Ce que je comprends : Je suis en vrac voir quoi faire en premier
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : L'utilisateur se sent submergé ('en vrac') et cherche à extraire une priorité nette du flou actuel.
> Petit pas immédiat : Respire. C'est normal d'avoir l'esprit encombré quand tout arrive en même temps. On va juste faire un peu de place pour que ta priorité apparaisse clairement.
>
> À mettre dans la plateforme :
> Potion : Potion de clarte
> - Qu'est-ce qui est flou pour toi en ce moment ? Je suis en vrac
> - Tu as surtout besoin de comprendre quoi ? Quoi faire
> - Tu veux ressortir avec quoi ? Quelque chose de simple
> - Si tu veux, ajoute le point qui te brouille le plus. Respire. C'est normal d'avoir l'esprit encombré quand tout arrive en même temps. On va juste faire un peu de place pour que ta priorité apparaisse clairement.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: `none`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le bon owner garde la main, mais `repeat_handoff` n'est pas reconnu et la demande "en tres court" est ignoree.
- Source amont probable: active handoff action/reducer, avec renderer repeat qui regenere un handoff complet au lieu de repeter la recommandation utile.
- Owner runtime: `select_state_potion` active handoff state + renderer repeat.
- Meilleure correction selon les guidelines: faire porter le statut `repeat_handoff` par le signal structure et rendre le repeat depuis le draft existant en format court quand le user le demande.
- Pourquoi ce n'est pas un patch local: le probleme est une transition d'etat et un mode de rendu, pas une phrase exacte `redis-moi`.

### Tour 5

**Verdict du tour:** green

**User**
> Non finalement, pas de potion. Donne-moi juste une phrase pour me poser maintenant.

**Sophia**
> Ok. Là, maintenant : pose tout, respire une fois, puis choisis 1 seule chose à faire pendant 10 minutes. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- route_reason: `central_arbitrator_structured_active_tool_exit`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: `no`
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ambiguite initiale soutien emotionnel vs potion est clarifiee proprement.
- Le handoff donne enfin des champs plateforme concrets et retire les sections confusantes `A preserver` / `A eviter`.
- La sortie `pas de potion` est naturelle et revient a une phrase de regulation immediate.

**Problemes**
- Tours 2 a 4: le rendu parle parfois du user a la troisieme personne (`L'utilisateur...`). Famille: BF-INTAKE-02 / renderer handoff. Impact: experience moins humaine. Severite: yellow.
- Tour 3: "Ok vas-y active-la" ne declenche pas un rendu apply_attempt dedie, meme si aucune mutation ne se produit. Famille: BF-STATE-01. Impact: systeme correct sur l'effet, mais trace et message moins auditables. Severite: yellow.
- Tour 4: "en tres court" est ignore et le handoff complet est regenere. Famille: BF-STATE-01. Impact: friction UX apres handoff. Severite: yellow.

**Fix propose**
- Source amont: contrat structure d'active handoff + draft/renderer handoff.
- Correction recommandee: ajouter un signal structure non-regex pour `apply_attempt` et `repeat_handoff`, puis rendre le repeat depuis le draft existant en version courte quand demande utilisateur structuree le permet.
- Tests d'invariant attendus: apply attempt paraphrases sans execution, repeat paraphrases sans product_help/status, anti-faux-positif "rappel demain" sort vers rappel ponctuel, no_potion sort vers soutien sans tool.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 route vers `orientation_clarification`, ce qui est correct pour l'ambiguite emotional repair vs potion.
- T2 route vers `select_state_potion` avec `platform_handoff`, correct.
- T3/T4 restent dans le bon owner, mais la transition interne reste `active_handoff_turn_unclear` au lieu de `apply_attempt` / `repeat_handoff`.
- T5 sort proprement via `central_arbitrator_structured_active_tool_exit`.

**Skills / Operations / Tools**
- `select_state_potion` se comporte comme handoff non-mutant.
- `executed_tools=[]` sur tous les tours.
- `direct_effects=[]` sur tous les tours.
- Pas de pending confirmation executable.

**Effets durables**
- Verification DB avant cleanup:
  - `user_potion_sessions=0`
  - `user_recurring_reminders=0`
  - `scheduled_checkins=0`
- Cleanup cible effectue pour le user temporaire; `user_memories` retourne 404 car table absente/non exposee dans ce contexte, les autres suppressions ciblees sont OK.

**Correction systeme recommandee**
- Ne pas introduire de regex metier locale.
- Ameliorer la sortie structuree active handoff / dispatcher pour distinguer `apply_attempt`, `repeat_handoff`, `revise_handoff`, `cancelled`.
- Garder le renderer proprietaire, mais lui fournir le statut correct pour choisir entre reponse apply_attempt, repeat court et handoff complet.

## Verdict Global

`yellow`: le flow est non-mutant et utilisable, avec bonne clarification et bonne sortie no_potion. Restent a corriger l'auditabilite des transitions active handoff (`apply_attempt`, `repeat_handoff`) et quelques fuites UX dans le rendu.
