# QA Run Report - Adjust Plan Whole Plan r75

## 1. Contexte Du Test

- Date: 2026-05-20
- Run: `adjust-plan-postfix-rerun4 / r75-whole-plan-clean`
- Persona: Rose, connexion locale password login verifiee
- Objectif: verifier un ajustement `whole_plan` sur une trajectoire globale devenue trop rapide, puis validation user et execution.
- Trajectoire: demande structurelle concrete -> brouillon de trajectoire -> validation explicite -> regeneration/activation du plan.
- Surfaces visees: dispatcher v2, `adjust_plan_item`, sous-skill `whole_plan`, coach guidance, pending draft review, execution `adjust_plan_item`, regeneration `generate-plan-v2`, separation ancien/nouveau plan.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai`, IA reelle. Aucun renderer deterministe ni executor appele directement.
- Validite QA: valide. Incidents precedents r69-r74 documentes comme tentatives techniques; le verdict principal repose sur r75.

## 2. Tours De Conversation

### Tour 1

**User**
> La direction de la prochaine etape ne me convient plus: les conversations sensibles arrivent trop vite. Je veux intercaler une vraie etape tampon avant ca: une mission ponctuelle pour definir un protocole de retour au calme, puis une petite habitude de reparation simple. Garde le meme objectif global et fais en sorte que la suite reste progressive.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond.
>
> Ce qui changerait: j'insère une étape intermédiaire avant les conversations plus sensibles, centrée sur le signal de pause et une réparation simple après conflit.
>
> Ce qui reste stable: l'objectif global du plan, le rôle du signal de pause, et les actions de soutien qui restent utiles.
>
> Ce que ça implique: si tu valides, je régénère le plan pour réordonner la suite autour de cette étape de consolidation. Rien n'est appliqué tant que tu ne valides pas. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: no block
- operation: brouillon `whole_plan`, execution bloquee avant validation
- pending_confirmation: draft review present en temp memory
- executed_tools: []
- durable_effect: messages seulement, aucun patch applique

### Tour 2

**User**
> Oui, valide cet ajustement global et applique cette trajectoire plus progressive.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan.
>
> Le plan garde le même objectif, mais la suite est régénérée pour ralentir la transition et consolider le signal de pause avec une réparation simple avant les conversations plus sensibles. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null apres execution
- route_reason: `normal_reply_default`
- safety: no block
- operation: pending draft approuve via fast-path de validation
- executed_tools: [`adjust_plan_item`]
- durable_effect: ancien plan archive, nouveau plan actif version 2 cree via `generate-plan-v2`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia comprend que la demande concerne la trajectoire globale, pas juste une action ou un niveau.
- Le brouillon est lisible: changement, elements conserves, implication produit, et absence d'application sans validation.
- Le message de validation est court, clair, tutoie correctement, et ne fuit pas d'IDs ou de termes techniques.

**Problemes**
- Tour 1: Sophia dit "je peux te proposer" alors que la proposition est deja formulee. Impact faible: le user peut quand meme valider naturellement. Severite: yellow low.

**Fix propose**
- Micro-amelioration future: rendre le wording du brouillon plus direct, par exemple "Je te propose..." au lieu de "Je peux te proposer..." quand le brouillon est deja concret.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Le dispatcher route correctement la demande structurelle vers `tool_skill / adjust_plan_item`.
- Le scope est traite comme `whole_plan`, coherent avec "direction de la prochaine etape", "conversations sensibles arrivent trop vite", et "suite progressive".

**Skills / Operations / Tools**
- `adjust_plan_item` produit un brouillon de trajectoire sans side effect au tour 1.
- La validation explicite au tour 2 execute directement le brouillon en attente, sans repasser inutilement par une revision IA.
- `generate-plan-v2` est appele uniquement apres validation.

**Memory / Effets durables**
- Avant cleanup: plan initial `fe37...` passe `active -> archived`; nouveau plan `e79...` cree `active`, version 2.
- Nouveaux items crees sous le nouveau plan, dont une reparation simple explicite (`Definir la reparation simple`).
- Cleanup final OK: 4 items originaux restaures, plan initial restaure `active`, nouveau plan et nouveaux items supprimes.

**Problemes**
- Tentatives r69/r70/r71: incidents de serveur local/socket pendant les runs, resolus par serveur ephemere par tour.
- Tentative r74: `--env-file` Deno n'a pas charge proprement la cle OpenAI apres warning de parsing `.env`; run non retenu comme verdict principal.

**Fix propose**
- Deja fait pendant ce run: fallback OpenAI `gpt-5.4-mini` ne pointe plus vers le modele indisponible `gemini-3.0-flash-preview`.
- Deja fait pendant ce run: fast-path de validation pour `__pending_adjust_plan_draft_review` quand le user dit explicitement "valide/applique".

## Verdict Global

**green**

Le flow whole-plan est maintenant coherent sur ce scenario: bon routing, brouillon sans side effect, validation explicite, regeneration effective, separation ancien/nouveau plan observee, et cleanup Rose confirme.

Verification:
- `deno check` sur les fichiers touches: OK
- `dispatcher.v2.test.ts`: 40/40
- `adjust_plan_item/tests.ts`: 27/27
