# QA Run - Flow Opportunity Verification Prompt R3

## 1. Contexte Du Test

- Date: 2026-06-12
- Run exploitable: `flow-opportunity-verification-prompt-r3c-20260612`
- Tentatives incidentes: `flow-opportunity-verification-prompt-r3-20260612` et `flow-opportunity-verification-prompt-r3b-20260612` ont retourne HTTP 502 avant toute reponse Sophia exploitable.
- Persona: `qa-skill`
- Connexion: `flow-opportunity-verification_flow-opportunity-verification-prompt-r3c-20260612` (temporaire, nettoyee en fin de run)
- Objectif: rerun reel apres verification du contrat canonique `note_information`, pour confirmer que le flow fonctionne et que la note a le bon format.
- Trajectoire: demande de verification d'etat, demande de confirmation read-only sans execution, puis observation du comportement reel.
- Surfaces visees: routing IA local, dispatcher local `flow_opportunity_verification`, confirmation pending, `note_information`, `status_recap`, state local, absence d'effet durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox, aucun fallback deterministe.
- Validite QA: valide pour la tentative `r3c`. Les tentatives `r3` et `r3b` sont documentees comme incidents techniques separes, sans flow state ni assistant message exploitable.
- Artefacts: `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-prompt-r3c-20260612.raw.json` et `.summary.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je ne sais plus ce que Sophia avait prévu pour mon dossier ce soir. Tu peux vérifier ce qui est déjà prêt ?

**Sophia**
> Bien sûr, je vais regarder où on en est avec ton dossier pour ce soir. On fait le point tout de suite ?

**Trace courte**
- http_status: 200
- force_full_ai: true
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `flow_opportunity_verification_offer_opportunity`
- safety: aucun signal safety observe
- direct_effects: aucun
- operation: aucune
- pending_confirmation: `status_recap`, `run_status_recap`
- memory_plan: micro-memoire non chargee
- executed_tools: []
- durable_effect: etat local cree, `status=waiting_confirmation`, `confirmation_anchor` present

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-02 - Pending confirmation cible perdue

**User**
> Avant, confirme-moi juste que tu vas lire l'état actuel sans créer ni modifier quoi que ce soit.

**Sophia**
> Je te confirme que je reste en mode lecture seule : je ne vais rien créer ni modifier. Voici l'état actuel de tes éléments :
>
> Fait : Aucun rappel, carte ou session n'est actif pour le moment.
> Prévu : Ton coaching est paramétré sur la discipline avec un ton bienveillant et ferme.
> Fragile : Aucun historique d'échec ou d'élément bloqué n'a été détecté.
>
> Tes préférences de coaching sont bien en place, mais tes listes d'actions et de protections sont vides. Est-ce que cet aperçu te convient ?

**Trace courte**
- http_status: 200
- force_full_ai: true
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `status_recap_local_answer_object_status`
- safety: aucun signal safety observe
- direct_effects: aucun
- operation: `status_recap` read-only
- pending_confirmation: consommee a tort ; `flow_opportunity_state=null`
- memory_plan: non pertinent
- executed_tools: []
- durable_effect: aucun write, mais le parent flow est termine
- note_information: format canonique correct avec `source_flow_id`, `handoff_reason`, `target_dispatcher`, `handoff_context_for_next_dispatcher`, `user_words`, `structured_context`, `confidence`

**Analyse si yellow/red**
- Symptome: le user demandait seulement une confirmation read-only ("confirme-moi juste"), mais le flow a lance `status_recap` et a nettoye l'etat parent.
- Source amont probable: dispatcher local `flow_opportunity_verification` interprete une contrainte de lecture seule comme acceptation suffisante de l'offre.
- Owner runtime: `flow_opportunity_verification` local dispatcher / reducer gating de handoff.
- Meilleure correction selon les guidelines: durcir la distinction entre question/contrainte pre-confirmation et acceptation explicite ; une demande "confirme-moi juste" doit rester dans le flow parent ou appeler `product_help`, pas `handoff_to_local_flow`.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a corriger ; c'est la semantique de confirmation pending et l'action `handoff_to_local_flow` qui sont trop permissives.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia repond clairement a la contrainte read-only.
- La reponse visible ne pretend pas avoir cree ou modifie quoi que ce soit.
- Le recap produit est lisible et utile.

**Problemes**
- Tour 2: Sophia fait plus que ce qui est demande. Le user demandait une confirmation avant de dire oui ; Sophia confirme puis execute le recap dans le meme tour. Famille: BF-STATE-02. Impact: perte de controle conversationnel, meme si l'action est read-only. Severite: yellow.

**Fix propose**
- Source amont: dispatcher local `flow_opportunity_verification`, classification acceptation vs contrainte/question.
- Correction recommandee: traiter les demandes de type "confirme-moi juste", "avant de dire oui", "sans faire encore" comme continuation locale ou `get_info_product`; ne handoff que sur acceptation explicite du recap.
- Tests d'invariant attendus: anti-faux-positif "read-only confirmation is not acceptance"; paraphrases avec "avant", "juste confirmer", "sans lancer".

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: correct, `flow_opportunity_verification` cree l'offre et l'ancre.
- Tour 2: mauvais niveau de continuation. Le systeme selectionne `status_recap` au lieu de rester dans `flow_opportunity_verification` pour repondre a la question/contrainte.

**Skills / Operations / Tools**
- Aucun tool durable execute.
- `status_recap` est read-only, donc l'effet durable reste correct.
- La `note_information` transmise au tour 2 a le format canonique actuel ; le probleme n'est pas le format de note.

**Memory / Effets durables**
- Aucun write metier observe.
- `flow_opportunity_state` est nettoye apres le tour 2, alors que le flow aurait du rester en attente de confirmation.
- Les connexions temporaires `r3`, `r3b`, `r3c` ont ete nettoyees apres le run ; aucun reset global DB.

**Problemes**
- Tour 2: pending confirmation consommee trop largement. Famille: BF-STATE-02. Impact systeme: handoff premature vers `status_recap`; le parent flow perd son etat avant acceptation explicite. Severite: yellow.

**Fix propose**
- Source amont: prompt dispatcher local + tests de reducer/LLM contract pour `flow_opportunity_verification`.
- Correction recommandee: ajouter une regle et un test IA/contractuel qui imposent `get_info_product` ou continuation locale quand le message exprime une contrainte pre-confirmation, et interdit `handoff_to_local_flow` sans acceptation explicite.
- Tests d'invariant attendus: `confirme-moi juste que c'est read-only` garde le parent flow actif ; `oui, fais-le` handoff ; `oui mais sans modifier` handoff read-only avec note canonique.

## Verdict Global

- Verdict: yellow
- Raison principale: le format de `note_information` est correct, mais le flow consomme trop vite la confirmation pending quand le user demande seulement une confirmation read-only.
- Follow-up prioritaire: corriger l'anti-faux-positif acceptation dans `flow_opportunity_verification`, puis rerun la trajectoire `confirmation read-only -> vraie acceptation`.
