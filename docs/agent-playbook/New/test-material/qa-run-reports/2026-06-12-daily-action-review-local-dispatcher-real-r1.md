# QA Run Report - Daily Action Review Local Dispatcher Real R1

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `daily-action-review-real-20260611231555-r1`
- Persona: Rose
- Objectif: verifier le flow `daily_action_review_v1` apres renforcement du prompt dispatcher local.
- Trajectoire: pending daily dynamique -> `whatsapp-webhook` local -> pending handler -> `daily_action_review.local_dispatcher` -> reducer/effects -> reponse WhatsApp.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, dispatcher local daily, reducer daily, `user_plan_item_entries`, occurrences.
- Cadre IA reel: Supabase local, webhook WhatsApp local, LLM reel. Le chemin n'utilise pas `/test-send-message` car le flow daily actif passe par pending WhatsApp; le dispatcher local a bien appele `daily_action_review.local_dispatcher` via fallback IA reel `gpt-5.4-mini` apres timeout Gemini.
- Validite QA: valide pour le chemin de reprise pending daily/local dispatcher. Non valide pour juger l'ouverture proactive, car aucun pending daily reel n'existait et une fixture dynamique DB a ete creee.

Grounding dynamique:

- Targets selectionnees depuis la DB Rose:
  - `Faire un sas de decompression (sans fumer)` / occurrence `3be65289-e810-4a73-b48a-26e0fc8b45ac`
  - `Preparer un plan anti-ennui` / occurrence `91831b6e-782b-489b-88a3-6bc44a00fa67`
- Pending QA: `18d3e70e-dee6-4be2-be72-200105e7acd5`
- Scheduled checkin QA: `0b458951-5b3c-4389-87ee-5a823ba9368b`
- Raw local artifacts: `tmp/daily-action-review-real-20260611231555-r1/`
- Cleanup: effectue et verifie.

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` - fixture dynamique, pas ouverture proactive IA

**Sophia**
> Petit point daily : pour Faire un sas de decomposition (sans fumer) et Preparer un plan anti-ennui, qu'est-ce qui s'est passe aujourd'hui ?

**Trace courte**
- source: dynamic pending fixture
- pending_status: `pending`
- chat_capability: `daily_action_review`
- review_state: present
- note_information: initial bridge note present

**Analyse si yellow/red**
- Symptome: l'ouverture n'a pas ete generee par `process-checkins`; elle vient d'une fixture dynamique.
- Source amont probable: aucun pending daily reel disponible en DB locale.
- Owner runtime: QA setup daily/weekly.
- Meilleure correction selon les guidelines: rendre le chemin local `process-checkins -> whatsapp-send -> pending daily` exploitable et isolable en QA.
- Pourquoi ce n'est pas un patch local: le dispatcher local n'est pas en cause sur l'ouverture; c'est la disponibilite du setup QA proactive.

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - fixture loopback non reconnue par le webhook

**User**
> Le sas, je l'ai fait environ 25 minutes sans fumer. Le plan anti-ennui, je l'ai seulement commence : j'ai liste deux idees, mais je n'ai pas encore choisi quoi faire quand l'envie monte.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: `200`
- request_id: `daily-action-review-real-20260611231555-r1-t01`
- webhook phase: `before_profile_lookup -> after_profile_lookup`
- candidates_count: `0`
- pending_status: `pending`
- entries_count: `0`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le webhook a ignore le pending daily car le numero loopback n'etait pas relie au profil Rose.
- Source amont probable: setup QA loopback, pas le dispatcher.
- Owner runtime: QA runner / webhook loopback fixture.
- Meilleure correction selon les guidelines: utiliser une connexion WhatsApp loopback qui associe explicitement le user ou documenter le patch temporaire `phone_number`/`phone_verified_at`.
- Pourquoi ce n'est pas un patch local: ajouter un routing par contenu ou contourner le pending serait invalide; le fix est dans l'isolation de test.

### Tour 1 Retry

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-LEDGER-02` - commit reel mal rendu

**User**
> Le sas, je l'ai fait environ 25 minutes sans fumer. Le plan anti-ennui, je l'ai seulement commence : j'ai liste deux idees, mais je n'ai pas encore choisi quoi faire quand l'envie monte.

**Sophia**
> {"name":"user","role":"assistant","content":"C’est note pour les deux elements : le sas est complete, et le plan anti-ennui est partiellement commence."}

**Trace courte**
- http_status: `200`
- request_id: `daily-action-review-real-20260611231555-r1-t02`
- response_owner: pending daily action handler
- selected_handler: `daily_action_review.local_dispatcher`
- LLM trace: Gemini timeout, fallback `gpt-5.4-mini`, `json_mode=true`
- pending_status: `done`
- direct_effects: 2 daily entries
- durable_effect:
  - sas: `outcome=completed`, occurrence `done`
  - plan anti-ennui: `outcome=partial`, continuation occurrence created for Saturday, source `daily_action_review_v1`
- safety: none

**Analyse si yellow/red**
- Symptome: le systeme a commite correctement, mais le message visible expose un objet JSON serialise avec `name`, `role`, `content`.
- Source amont probable: visible/final response serialization after daily commit, likely final response pipeline or WhatsApp reply wrapper consuming a chat-message object instead of plain content.
- Owner runtime: daily action review visible response / final response pipeline.
- Meilleure correction selon les guidelines: corriger la frontiere de rendu apres commit pour garantir que seul le texte visible final est persiste/envoye, avec test d'invariant anti-serialization.
- Pourquoi ce n'est pas un patch local: remplacer cette phrase ne suffit pas; le bug est structurel, car le contenu visible transporte des champs de message (`name`, `role`, `content`).

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le contenu semantique interne est bon : Sophia comprend que le sas est complete et que le plan anti-ennui est partiel.
- Le daily ne propose pas de carte, potion ou coaching hors scope pendant la collecte.

**Problemes**
- Tour 1: aucune reponse visible au premier essai a cause du numero loopback non relie. Famille: `BF-TEST-01`. Impact: run inutilisable sans patch de fixture. Severite: red pour l'essai, resolu dans le retry.
- Tour 1 Retry: reponse visible sous forme JSON serialisee. Famille: `BF-LEDGER-02`. Impact: experience utilisateur casse, message non humain. Severite: red.

**Fix propose**
- Source amont: final response/visible serialization apres commit daily.
- Correction recommandee: ajouter un garde contractuel apres le visible agent ou avant persistance WhatsApp qui rejette les objets serialises et extrait uniquement `content` si le LLM retourne une enveloppe `{name, role, content}`; idealement corriger le prompt visible pour demander plain text et ajouter un sanitizer specifique anti-envelope.
- Tests d'invariant attendus: run local daily commit success ne doit jamais persister un message commençant par `{` avec `role`/`content`; test positif completed+partial; test anti-faux-positif pour un vrai JSON demande par user hors daily.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le retry atteint le bon owner : pending daily -> `daily_action_review.local_dispatcher`.
- Le dispatcher global normal n'a pas repris le tour pendant le flow actif.
- La note initiale de bridge est presente dans le pending.

**Skills / Operations / Tools**
- Le dispatcher local a extrait correctement les deux targets.
- Le reducer a considere le tour complet et a applique les effets.
- Pas d'outil durable hors daily, pas de proposition de carte/potion.

**Memory / Effets durables**
- Deux `user_plan_item_entries` ont ete crees avant cleanup:
  - `completed` pour le sas, evidence: "je l'ai fait environ 25 minutes sans fumer".
  - `partial` pour le plan anti-ennui, evidence: "je l'ai seulement commence", continuation creee.
- Les deux occurrences cibles sont passees `done`.
- Cleanup cible effectue: entries, continuation occurrence/plan item, pending, scheduled checkin, messages, link request et profil Rose restaures.

**Problemes**
- Tour 1: fixture loopback non reconnue. Famille: `BF-TEST-01`. Impact systeme: le webhook passe par unlinked handler au lieu du pending.
- Tour 1 Retry: commit reel mal rendu. Famille: `BF-LEDGER-02`. Impact systeme: la DB est correcte mais la sortie visible viole le contrat de message utilisateur.

**Fix propose**
- Source amont: daily visible/final response pipeline apres commit.
- Correction recommandee: sanitizer anti-envelope `{name, role, content}` sur la sortie visible daily, plus test d'integration qui verifie `chat_messages.content` en plain text apres commit.
- Tests d'invariant attendus:
  - completed+partial daily avec deux targets -> entries correctes + message plain text.
  - LLM visible retourne une enveloppe JSON -> sanitizer garde seulement `content`.
  - stop/exit/safety daily ne passent pas par le sanitizer de commit.

## Verdict Global

- Verdict: red
- Raison principale: le flow route et commit correctement, mais la reponse visible finale est serialisee en JSON, donc l'experience utilisateur est cassee.
- Follow-up prioritaire: corriger la frontiere visible/final response apres commit daily et rerun le meme scenario.
