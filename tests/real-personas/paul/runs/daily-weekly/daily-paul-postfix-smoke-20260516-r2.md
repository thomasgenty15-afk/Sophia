# QA Run Report - Daily Paul Long Flou Post-Fix

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `daily-paul-postfix-smoke-20260516-r2`
- Persona: Paul
- Objectif: retester le daily apres fix avec 2 actions du meme plan, formulation user volontairement floue, recap post-cloture, et pending parasite expire.
- Trajectoire: fixture daily dynamique, reponses ambigues, cloture, demande de recap, correction de detail, controle sans effet durable.
- Surfaces visees: `daily_action_review_v1`, expiration pending, recap recent daily, payload final, restauration DB.
- Cadre IA reel: Supabase local, webhook WhatsApp local, skill daily IA reel, pas de fallback deterministe.
- Validite QA: valide pour le handler daily; ouverture fixture dynamique car aucun pending systeme propre disponible.

Grounding dynamique:

- plan actif: `Structurer et faire avancer ton projet d'entreprise` / `55f505b5-e0b4-450b-a0a2-bc2656933181`
- pending_id: `2215fabf-1d33-4986-9b3e-28f76eeb1031`
- pending parasite expire: `fb54d45f-3345-4c7a-83e9-dca44e0c06c6`
- actions: `Faire une session de travail focus (2h)` (habits); `Créer ton Parking à idées` (missions)
- restauration DB: `restored` a 2026-05-16T14:49:21.508Z

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-paul-postfix-smoke-20260516-r2.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Petit check du soir: pour "Faire une session de travail focus (2h)" et "Créer ton Parking à idées", raconte-moi ce qui s'est passé aujourd'hui.

**Trace courte**
- source: `dynamic_qa_pending_fixture`

### Tour 1

**User**
> J'ai fait un bout de focus, pas les 2h. Le parking j'ai posé trois idées en vrac, c'est pas propre mais c'est là.

### Tour 1

**Sophia**
> C'est noté pour le parking à idées. Qu'est-ce qui t'a empêché de faire les 2h complètes de focus ?
**Trace courte**
- http_status: `200`
- selected_handler/source: `daily_action_review_clarification`
- pending_status: `pending`
- stale_pending_status: `pending`
- review_state: `collecting`
- missing_occurrence_ids: `1`
- durable_effect: entries=none

### Tour 2

**User**
> Je me suis lancé tard et j'avais plus assez d'énergie, donc j'ai préféré faire court plutôt que bâcler.

### Tour 2

**Sophia**
> C'est noté. Tu as créé ton parking à idées et tu as réalisé une partie de ta session focus, même si la fatigue et l'heure tardive t'ont freiné. Je valide ton bilan pour aujourd'hui.
**Trace courte**
- http_status: `200`
- selected_handler/source: `daily_action_review`
- pending_status: `done`
- stale_pending_status: `expired`
- review_state: `complete`
- missing_occurrence_ids: `0`
- durable_effect: entries=partial/fatigue,completed/none

### Tour 3

**User**
> Tu as mis quoi au juste ? Je veux pas que ça devienne réussite nickel.

### Tour 3

**Sophia**
> Preferences coach: Les preferences coach reglent ma maniere d'accompagner: ton global, niveau de challenge et tendance a poser des questions.
> 
> Comment l'utiliser: Ouvre Preferences depuis le dashboard, modifie les options disponibles puis sauvegarde.
> 
> Ce que ca apporte:
> - Rend l'accompagnement plus adapte au user.
> - Clarifie si je dois etre plus douce, directe ou challengeante.
> 
> Si tu veux vraiment le faire, ce n'est pas product_help qui execute: il faut passer par le flow update_coach_preferences, avec confirmation.
**Trace courte**
- http_status: `200`
- selected_handler/source: ``
- pending_status: `done`
- stale_pending_status: `expired`
- review_state: `complete`
- missing_occurrence_ids: `0`
- durable_effect: entries=partial/fatigue,completed/none

### Tour 4

**User**
> Non, je parle du daily. Tu as mis quoi au juste dans le bilan ?

### Tour 4

**Sophia**
> Voilà ce que j'ai noté pour le bilan qu'on vient de faire :
> - Faire une session de travail focus (2h) : partiel (Lancé tard et manque d'énergie)
> - Créer ton Parking à idées : fait
> Je ne change rien d'autre dans ton plan.
**Trace courte**
- http_status: `200`
- selected_handler/source: `daily_action_review_recap`
- pending_status: `done`
- stale_pending_status: `expired`
- review_state: `complete`
- missing_occurrence_ids: `0`
- durable_effect: entries=partial/fatigue,completed/none

### Tour 5

**User**
> Et tu n'as rien reporté à demain, on est d'accord ?

### Tour 5

**Sophia**
> Voilà ce que j'ai noté pour le bilan qu'on vient de faire :
> - Faire une session de travail focus (2h) : partiel (Lancé tard et manque d'énergie)
> - Créer ton Parking à idées : fait
> Je n'ai noté aucun report à demain dans ce bilan.
> Je ne change rien d'autre dans ton plan.
**Trace courte**
- http_status: `200`
- selected_handler/source: `daily_action_review_recap`
- pending_status: `done`
- stale_pending_status: `expired`
- review_state: `complete`
- missing_occurrence_ids: `0`
- durable_effect: entries=partial/fatigue,completed/none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia tient mieux le post-daily: la demande de recap renvoie le bilan qui vient d'etre cloture au lieu de reprendre une autre action.
- Les reponses floues de Paul ne provoquent pas de plan patch ni de report non demande.
- Le recap est lisible et borne: il indique ce qui est note et precise qu'il ne change rien d'autre.

**Problemes**
- Tour 3: avant le dernier ajustement regex, "Tu as mis quoi au juste ?" route encore hors daily vers `product_help` Preferences coach. Impact: friction nette, mais aucun effet durable. Severite: yellow.
- Tours 4-5: apres correction de cette formulation, le recap et la verification "rien reporte" passent correctement.

**Fix propose**
- Conserver les formulations du tour 3, 4 et 5 dans une regression automatisee.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le pending parasite expire passe en `expired` et n'est pas repris.
- Le recap post-cloture est traite par `daily_action_review_recap` apres correction regex aux tours 4-5.

**Memory / Effets durables**
- Entries finales avant restauration: `partial` b0f064b8-2e7c-48d6-9d3b-046ae6928ccb reason=`fatigue`; `completed` 6c013507-fbb4-4ab0-9542-5568a11ec172 reason=`none`.
- Payload final: `review_state.status=complete`, `missing_occurrence_ids=0`.
- Restauration: pending(s), entries, occurrences et messages du run supprimes.

**Problemes**
- Tour 3: le detecteur initial ne couvrait pas `tu as mis quoi` avec `tu as` separe. Correctif applique dans `handlers_pending.ts` apres ce tour, puis valide aux tours 4-5. Severite: yellow.

**Fix propose**
- Ajouter une regression dediee au detecteur `isDailyReviewRecapRequest`.

## Verdict Global

- Verdict: yellow
- Raison principale: le comportement final corrige est bon aux tours 4-5, mais le run contient un tour pre-correctif hors sujet.
- Follow-up prioritaire: relancer une fois sans patch intermediaire ou automatiser les formulations critiques.
