# QA Run — WhatsApp Onboarding Full From Plan Wait

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `qa-wa-onb-full-from-wait-invalid-r1`
- Persona: connexion temporaire locale prevue, non creee a cause d'une erreur Auth locale.
- Objectif: tester le flow WhatsApp onboarding depuis `awaiting_plan_finalization` sans plan actif, puis validation externe du plan, puis deroule complet jusqu'a fin onboarding.
- Trajectoire prevue: tour 1 sans plan actif, creation du plan actif apres tour 1, preferences tone/challenge/questions, feedback plan, topic choice final.
- Surfaces visees: `whatsapp-webhook`, `whatsapp_onboarding.local_dispatcher`, reducer local, visible agent, persistence preferences, absence de `track_progress_plan_item`.
- Cadre IA reel: Supabase local, webhook WhatsApp local en transport `loopback`.
- Validite QA: invalide / red. Le run n'a jamais atteint Sophia: Auth local echoue avant creation de la fixture.

Tentatives:
- `qa-wa-onb-full-1781096131278`: `POST /auth/v1/admin/users -> 504 request_timeout`.
- `qa-wa-onb-full-1781096154612`: `POST /auth/v1/admin/users -> 500 unexpected_failure`, `Database error checking email`.
- `qa-wa-onb-full-1781096269442`: meme erreur `500 Database error checking email`.

Nettoyage:
- Aucune fixture conversationnelle creee; `fixture=null` sur les trois tentatives.
- Aucun profil, plan, message, outbound ou progress entry QA cree par ces tentatives.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 — Trace/test incoherent ou suite malsaine

**User**
> Aucun message envoye a Sophia. Le run a echoue avant la conversation.

**Sophia**
> Aucune reponse Sophia.

**Trace courte**
- http_status: non applicable au webhook
- response_owner: aucun
- selected_handler: aucun
- route_reason: aucun
- safety: non evalue
- direct_effects: aucun
- operation: creation Auth locale echouee
- pending_confirmation: aucune
- memory_plan: non evalue
- executed_tools: aucun
- durable_effect: aucun
- auth_error: `POST /auth/v1/admin/users -> 500 Database error checking email`

**Analyse si yellow/red**
- Symptome: impossible de creer la connexion temporaire locale.
- Source amont probable: service Auth local ou DB Auth locale instable.
- Owner runtime: environnement local Supabase Auth.
- Meilleure correction selon les guidelines: reparer/stabiliser Auth local ou fournir une connexion locale dediee existante avant relance.
- Pourquoi ce n'est pas un patch local: le flow WhatsApp onboarding n'est jamais atteint; modifier le dispatcher ou le prompt ne peut pas valider ce run.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien de conversationnel n'a pu etre evalue.

**Problemes**
- Tour 1: aucune conversation possible. Famille: BF-TEST-01. Impact: QA inutilisable. Severite: red.

**Fix propose**
- Source amont: Auth local / connexion temporaire QA.
- Correction recommandee: stabiliser la creation Auth locale ou preparer une connexion QA locale reutilisable et isolee.
- Tests d'invariant attendus: creation Auth temporaire `200`, verification profile, puis webhook loopback.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routing: le webhook n'a pas ete appele.

**Skills / Operations / Tools**
- Aucun dispatcher, reducer, visible agent ou tool execute.

**Memory / Effets durables**
- Aucun effet durable observe.
- Aucune fixture complete creee.

**Problemes**
- Tentatives 1-3: creation Auth locale echoue. Famille: BF-TEST-01. Impact systeme: impossible d'executer un QA reel isole. Severite: red.

**Fix propose**
- Source amont: environnement Supabase Auth local.
- Correction recommandee: diagnostiquer Auth local sans reset destructif; a defaut, utiliser une persona locale dediee deja existante pour ce type de run, avec reset cible de son etat.
- Tests d'invariant attendus: script de setup QA peut creer ou recuperer une connexion locale sans timeout/erreur DB.

## Verdict Global

- Verdict: red
- Raison principale: Auth local echoue avant creation de la persona QA; aucun tour Sophia n'a eu lieu.
- Follow-up prioritaire: stabiliser Auth local ou fournir une connexion QA locale existante, puis relancer le test complet depuis `awaiting_plan_finalization`.
