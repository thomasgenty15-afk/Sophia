# Prepare Attack Card Handoff Verify Rerun

## 1. Contexte Du Test

- Date: 2026-06-01
- Run: `prepare-attack-card-handoff-verify-rerun`
- Persona: `qa-skill`
- Connexions dediees: `attack_card_handoff_verify_fresh_r1_20260601`, `attack_card_handoff_verify_fresh_r2_20260601`, `attack_card_handoff_verify_fresh_r3_20260601`
- Objectif: verifier en QA reelle les corrections `prepare_attack_card` post-clarification, handoff direct, repeat/cancel/revise/apply_attempt.
- Trajectoire: ambiguite comprendre/preparer, continuation no-create, handoff direct avec technique explicite, handoff direct avec technique choisie par Sophia.
- Surfaces visees: dispatcher, orientation clarification, `prepare_attack_card`, active handoff state, renderer, effect ledger.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Incident technique: un premier lot de connexions a montre des resultats coherents avec un runtime local stale. Le serveur local `supabase functions serve` a ete redemarre, puis les runs exploitables ont ete repris sur connexions fraiches. Toutes les connexions QA temporaires ont ete nettoyees.

## 2. Tours De Conversation

### Run R1 - Ambiguite Puis Preparation

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 - Preference non appliquee runtime

**User**
> Je ne sais pas si je veux juste comprendre les cartes d’attaque ou en préparer une pour mon action du matin.

**Sophia**
> Souhaitez-vous obtenir des explications sur le fonctionnement des cartes d'attaque ou préférez-vous commencer à en préparer une ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: none
- operation: none
- pending_confirmation: null
- memory_plan: targeted product/action context
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: la clarification est correcte, mais elle vouvoie l'utilisateur, alors que le contrat de ton du skill demande le tutoiement.
- Source amont probable: renderer/prompt d'orientation clarification.
- Owner runtime: orientation clarification / final response wording.
- Meilleure correction selon les guidelines: appliquer la preference de tutoiement dans les clarifications de routing, pas seulement dans le renderer du tool.
- Pourquoi ce n'est pas un patch local: la reponse vient du layer de clarification amont, pas de `prepare_attack_card` renderer.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Je veux en préparer une pour mon action du matin : ouvrir mon carnet avant le café. Le piège, c’est que je me dis que je regarderai après. Ne la crée pas depuis le chat.

**Sophia**
> Je ne confirme aucun changement durable sans effet confirmé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: null
- safety: null
- direct_effects: none
- operation: `status=ask_question`, pas de `platform_handoff`
- pending_confirmation: null
- memory_plan: route agenda owner `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: le user fournit cible, piege et contrainte no-create apres clarification, mais le skill ne produit pas le handoff.
- Source amont probable: reprise post-orientation clarification; l'etat actif attendu par `prepare_attack_card` n'est pas materialise en `__active_tool_skill_intake`, donc le router retombe sur une reponse guard.
- Owner runtime: orientation clarification resolution -> operation runtime pipeline -> `prepare_attack_card` intake.
- Meilleure correction selon les guidelines: transmettre explicitement la resolution de clarification au skill avec l'operation_input accumule, puis autoriser `continue_collecting -> handoff_delivered`.
- Pourquoi ce n'est pas un patch local: les tests unitaires du router passent avec un active intake explicite; le run reel montre une rupture entre clarification amont et router du skill.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok crée-la.

**Sophia**
> Entendu, je m'en occupe. Laquelle de ces trois approches préfères-tu pour ton carnet : Le texte magique, Ancre visuelle ou Preparer le terrain ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: null
- safety: null
- direct_effects: none
- operation: `status=ask_question`, pas de `apply_attempt`
- pending_confirmation: null
- memory_plan: agenda platform_handoff proposed for `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: Sophia utilise un wording d'action ("je m'en occupe") et repart en choix de technique au lieu de refuser la creation chat.
- Source amont probable: comme le handoff actif n'a jamais ete cree au tour 2, `ok crée-la` n'est pas interprete comme `apply_attempt`.
- Owner runtime: active flow state / `prepare_attack_card` reducer.
- Meilleure correction selon les guidelines: creer un etat handoff ou au minimum un etat de preparation actif des que l'utilisateur choisit "preparer" apres clarification.
- Pourquoi ce n'est pas un patch local: la commande active n'arrive pas dans la branche handoff active corrigee.

### Run R2 - Demarrage Direct Avec Technique Explicite

#### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande / bloque

**User**
> Prépare-moi une carte d’attaque en Ancre visuelle pour poser ma tenue de sport sur la chaise ce soir. Le piège, c’est que je repousse en disant que je verrai demain. Ne la crée pas depuis le chat.

**Sophia**
> Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: null
- safety: null
- direct_effects: none
- operation: `status=technical_blocked`, pas de `platform_handoff`
- pending_confirmation: null
- memory_plan: agenda `platform_handoff` proposed for `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: cible, technique, piege et no-create sont tous fournis; le skill bloque techniquement au lieu de rendre le handoff.
- Source amont probable: slot filler/operation_input reel ne preserve pas les aliases ou ne produit pas la question/draft attendu malgre les slots fournis.
- Owner runtime: `prepare_attack_card` AI intake + runtime adapter.
- Meilleure correction selon les guidelines: convertir les hints dispatcher et texte direct en slots structurés avant validation, puis interdire `technical_blocked` quand cible/technique/piege/no-create sont presents.
- Pourquoi ce n'est pas un patch local: le renderer n'est pas atteint; c'est une rupture intake/readiness.

### Run R3 - Demarrage Direct Avec Technique A Choisir

#### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Prépare-moi une carte d’attaque pour envoyer mon dossier administratif avant 16h. Je bloque parce que je veux que ce soit parfait avant d’appuyer sur envoyer. Ne la crée pas, je veux seulement le brouillon.

**Sophia**
> Je ne confirme aucun changement durable sans effet confirmé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: null
- safety: null
- direct_effects: none
- operation: `status=ask_question`, pas de `platform_handoff`
- pending_confirmation: null
- memory_plan: agenda `platform_handoff` proposed for `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: demande directe avec cible, piege et draft-only/no-create; le skill renvoie le guard durable-effect au lieu du brouillon plateforme.
- Source amont probable: contrainte `draft_only/no_create` non transformee en production de draft dans le chemin runtime reel.
- Owner runtime: `prepare_attack_card` intake + operation runtime pipeline.
- Meilleure correction selon les guidelines: faire de `draft_only/no_create` une instruction de handoff plateforme, jamais une confirmation durable ou un blocage.
- Pourquoi ce n'est pas un patch local: le contenu vient d'un guard systeme parce que la transition operationnelle n'a pas produit de handoff.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- L'ambiguite initiale est bien reconnue et clarifiee.
- Aucun tour ne cree de carte, aucun outil n'est execute, et aucun effet durable n'est observe.

**Problemes**
- R1 Tour 1: clarification au vouvoiement. Famille: BF-PREF-01. Impact: ton incoherent avec Sophia. Severite: yellow.
- R1 Tour 2: le user repond exactement a la clarification, mais Sophia ne produit pas de carte. Famille: BF-INTAKE-03. Impact: conversation bloquee. Severite: red.
- R1 Tour 3: "Ok crée-la" ne donne pas `apply_attempt` no-mutation et repart en question technique. Famille: BF-STATE-01. Impact: le contrat actif n'est pas tenu. Severite: red.
- R2 Tour 1: demande directe complete finit en erreur technique. Famille: BF-INTAKE-01. Impact: le cas nominal ne fonctionne pas. Severite: red.
- R3 Tour 1: draft-only/no-create direct finit en guard generique. Famille: BF-INTAKE-03. Impact: l'utilisateur ne reçoit pas le brouillon attendu. Severite: red.

**Fix propose**
- Source amont: liaison orientation clarification -> operation runtime, `prepare_attack_card` AI intake reel, propagation des constraints `draft_only/no_create`.
- Correction recommandee: instrumenter le run reel pour exposer `readiness.reason` dans la trace courte, puis corriger le mapper de slots reel afin que les sorties IA `ask_question` sans question ou `technical_blocked` ne masquent pas des slots deja fournis.
- Tests d'invariant attendus: run reel post-clarification, direct explicit technique, direct draft_only, puis repeat/revise/cancel/apply_attempt seulement apres un handoff effectivement livre.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- R1 Tour 1: dispatcher choisit correctement `orientation_clarification`.
- R1 Tour 2/3, R2, R3: `response_owner=tool_skill` et `selected_handler=prepare_attack_card`, donc le owner global est bon.
- Le probleme est intra-skill/runtime: la route arrive au bon handler mais ne produit pas `platform_handoff`.

**Skills / Operations / Tools**
- Aucun `executed_tools` observe.
- Aucun `pending_confirmation` executable observe.
- Aucun `platform_handoff` livre sur les runs frais.
- Les tests de branches actives `repeat/revise/cancel/apply_attempt` n'ont pas pu etre rejoues en QA reelle, car aucun handoff actif n'a ete cree.

**Effets Durables**
- Aucun effet durable observe, ce qui respecte le no-mutation au sens strict.
- Le ledger/handoff attendu n'est pas produit, donc le flow cible n'est pas atteint.

**Fix propose**
- Source amont: `prepare_attack_card` runtime reel, surtout le passage `slot_filler -> readiness -> pending_confirmation/handoff`.
- Correction recommandee: ajouter une trace minimale `debug.reason_code` dans `tool_skill_run` pour les statuses `ask_question` et `technical_blocked`; corriger ensuite la condition qui transforme des demandes no-create completes en guard durable-effect.
- Tests d'invariant attendus: unitaires existants + un test integration local du endpoint avec `force_full_ai=true`, pas seulement router fake.

## Verdict Global

`red` - Les corrections unitaires ne sont pas verifiees en runtime reel. Le routage vers `prepare_attack_card` est correct, mais le skill ne livre pas le handoff plateforme sur les trajectoires testees.
