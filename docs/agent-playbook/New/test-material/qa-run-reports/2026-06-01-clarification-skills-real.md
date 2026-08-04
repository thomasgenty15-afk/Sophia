# QA Run Report — Clarification Skills Real

## 1. Contexte Du Test

- Date: 2026-06-01.
- Runs:
  - `clarification-skills-real-20260601-r1-product-help`
  - `clarification-skills-real-20260601-r2-active-product-help`
  - `clarification-skills-real-20260601-r3-active-emotional`
  - retry `clarification-skills-real-20260601-r3b-active-emotional`
- Persona: users temporaires QA locaux, nettoyés en fin de run.
- Objectif: vérifier en conditions réelles que les conversation skills peuvent
  demander une clarification via le `clarification_tool` quand l'ambiguïté est
  interne au domaine.
- Trajectoire: ambiguïtés explication produit vs préparation de carte, puis
  tentative sur un skill émotionnel.
- Surfaces visees: dispatcher L1, `orientation_clarification`, `product_help`,
  `emotional_repair`, temp memory, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, pas de renderer déterministe.
- Validite QA: partiellement valide. Les runs produit sont valides et
  exploitables; les runs émotionnels sont invalides techniquement à cause d'un
  502 persistant.

## 2. Tours De Conversation

### Run R1 — Ambiguïté Produit Hors Skill Actif

**Verdict du tour:** green pour le comportement utilisateur, yellow pour la
preuve skill-level.

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — owner de clarification pas
assez fin.

**User**
> Je ne sais pas si je veux juste comprendre les cartes d'attaque, ou en préparer une pour mon action de demain matin.

**Sophia**
> Souhaitez-vous obtenir des explications sur le fonctionnement des cartes d'attaque ou préférez-vous en préparer une dès maintenant ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- direct_effects_to_run: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `intent`,
  candidats `product_help`, `prepare_attack_card`, `no_chat_mutation=true`

**Analyse si yellow/red**
- Symptome: la clarification visible est correcte, mais elle est portée par le
  dispatcher, pas par un skill conversationnel.
- Source amont probable: point d'intégration global de
  `maybeStartDispatcherClarification`, avant runtime de skill.
- Owner runtime: router clarification arbitration + conversation skill
  clarification adapter.
- Meilleure correction selon les guidelines: laisser le dispatcher clarifier
  les ambiguïtés hors flow, mais ajouter un chemin runtime où un skill actif
  peut construire ses candidats et appeler `runSkillClarification` lui-même.
- Pourquoi ce n'est pas un patch local: le problème est l'owner architectural de
  la clarification, pas la phrase affichée.

### Run R2 — `product_help` Puis Ambiguïté Dans Le Même Contexte

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — entrée skill correcte, mais
réponse product help pauvre.

**User**
> Explique-moi à quoi sert une carte d'attaque dans Sophia, sans rien créer.

**Sophia**
> Je ne l'ai pas modifié. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- selected_skill_id: `product_help`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: `product_help` est bien sélectionné, mais ne répond pas vraiment à
  la question produit.
- Source amont probable: intake/renderer `product_help`.
- Owner runtime: `product_help`.
- Correction attendue: conserver l'entrée skill, mais rendre une explication
  produit substantielle quand `sans rien créer` est explicite.

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — clarification reprise par le
dispatcher au lieu du skill actif.

**User**
> D'accord. Maintenant j'hésite : je veux peut-être juste comprendre comment choisir une carte, ou alors en préparer une pour mon action de demain.

**Sophia**
> Souhaitez-vous obtenir des explications sur le choix d'une carte ou préférez-vous commencer à en préparer une ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- selected_skill_id: none
- direct_effects: `[]`
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `intent`,
  candidats `product_help`, `prepare_attack_card`, `no_chat_mutation=true`

**Analyse si yellow/red**
- Symptome: la bonne question est posée et aucun tool skill n'est lancé, mais le
  run ne prouve pas que `product_help` appelle le `clarification_tool`.
- Source amont probable: l'arbitrator dispatcher préempte l'ambiguïté avant le
  runtime de skill; l'adapter skill existe mais n'est pas appelé en runtime réel.
- Owner runtime: router + `product_help`.
- Correction attendue: quand un active skill garde l'ownership et détecte une
  ambiguïté interne, il doit appeler `runSkillClarification` avec
  `owner=product_help`; le dispatcher doit rester responsable seulement des
  ambiguïtés hors flow.

### Run R3 / R3b — Tentative Skill Émotionnel

**Verdict du tour:** red technique

**Famille de bugs si yellow/red:** `BF-TEST-01` — run réel invalide par erreur
runtime/edge.

**User**
> Je me sens honteux d'avoir encore évité mon action, pas de danger, j'ai surtout besoin d'être entendu deux minutes.

**Sophia**
> Réponse vide.

**Trace courte**
- http_status: 502
- raw_error: `An invalid response was received from the upstream server`
- response_owner: none
- selected_handler: none
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: none observé

**Analyse si yellow/red**
- Symptome: deux tentatives séparées échouent avant conversation exploitable.
- Source amont probable: runtime Edge ou appel IA amont; les logs Edge locaux
  courts n'ont pas exposé de stack utile.
- Owner runtime: testability / Edge runtime / route émotionnelle.
- Correction attendue: rendre le 502 observable avec une trace exploitable ou
  corriger l'erreur upstream; relancer ensuite un scénario `emotional_repair`
  actif avec ambiguïté soutien vs potion/action concrète.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Pour les ambiguïtés produit/carte, Sophia pose une seule question claire.
- Sophia ne prétend pas avoir créé ou modifié quelque chose.
- Aucun emoji ou wording ne cache un effet durable absent.

**Problemes**
- Run R2 Tour 1: la réponse `product_help` est trop pauvre pour une demande
  d'explication. Famille: `BF-ROUTE-01`. Impact: l'utilisateur n'obtient pas
  l'aide produit demandée.
- Run R2 Tour 2: bonne question visible, mais pas de preuve skill-level.
  Famille: `BF-ROUTE-01`. Impact: le contrat "skill actif peut appeler le tool"
  n'est pas validé en réel.
- Run R3/R3b: scénario émotionnel impossible à valider. Famille:
  `BF-TEST-01`. Impact: couverture réelle incomplète.

**Fix propose**
- Source amont: router + conversation skill runtime.
- Correction recommandee: ajouter un chemin de clarification interne aux skills
  concernés, avec candidats fournis par le skill actif et appel à
  `runSkillClarification`.
- Tests d'invariant attendus: run réel où `__clarification_state_v1.owner` vaut
  `product_help` ou `emotional_repair` selon le skill actif, aucun executor,
  aucun effet durable.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `orientation_clarification` fonctionne en réel.
- Le state `__clarification_state_v1` est écrit avec `no_chat_mutation=true`.
- Le state observé garde `owner=dispatcher`, même après entrée précédente dans
  `product_help`.

**Skills / Operations / Tools**
- Aucun tool skill complexe n'est lancé.
- Aucun executor n'est appelé.
- Le test réel ne démontre pas encore un appel runtime du skill vers
  `runSkillClarification`.

**Memory / Effets durables**
- Aucun scheduled checkin créé.
- Les users temporaires et données de run ont été nettoyés de façon ciblée.
  `user_memories` retourne 404 dans cet environnement local, les autres tables
  et `auth.users` ont été nettoyés avec succès.

**Problemes**
- Le contrat "conversation skill clarification" est couvert par test unitaire,
  mais pas par le chemin réel.
- Les runs émotionnels retournent 502 et doivent être revalidés après correction
  de l'observabilité/runtime.

**Fix propose**
- Brancher l'adapter dans les runtimes de skills prioritaires, au moins
  `product_help` et `emotional_repair`, sans mutation et sans tool skill.
- Ajouter un champ trace explicite pour distinguer clarification dispatcher vs
  clarification interne skill.

## Verdict Global

- Verdict: yellow.
- Raison principale: les runs réels prouvent la clarification visible et
  non-mutante, mais pas encore que les skills appellent eux-mêmes le
  `clarification_tool` en runtime réel.
- Follow-up prioritaire: brancher et tracer un chemin skill-level réel, puis
  relancer au moins `product_help` actif et `emotional_repair` actif.

## Feuille De Suivi Bugs

- Bug sheet:
  `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-clarification-skills-real-bugs.md`
