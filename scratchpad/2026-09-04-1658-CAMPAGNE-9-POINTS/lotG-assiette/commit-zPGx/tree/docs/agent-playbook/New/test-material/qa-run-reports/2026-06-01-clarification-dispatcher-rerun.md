# QA Run Report — Clarification Dispatcher Rerun

## 1. Contexte Du Test

- Date: 2026-06-01.
- Runs:
  - incident boot: `clarification-dispatcher-real-20260601-rerun-r1`
  - variante rappel: `clarification-dispatcher-real-20260601-rerun-r1b`
  - contrôle rappel original:
    `clarification-dispatcher-real-20260601-rerun-r1-control`
  - variante product/help carte:
    `clarification-dispatcher-real-20260601-rerun-r2`
- Persona: users temporaires QA locaux, nettoyés en fin de run.
- Objectif: relancer les tests réels de clarification dispatcher.
- Trajectoire: rappel ponctuel vs récurrent; explication cartes d'attaque vs
  préparation d'une carte.
- Surfaces visees: dispatcher L1, `TurnFrame`, clarification arbitrator,
  `orientation_clarification`, temp memory, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, pas de renderer déterministe.
- Validite QA: valide pour `r1b`, `r1-control` et `r2`; `r1` est un incident
  technique non exploitable (`BOOT_ERROR`).

## 2. Tours De Conversation

### Incident — Boot Error

**Verdict du tour:** red technique, non exploitable

**User**
> Je voudrais que Sophia me fasse un rappel demain matin... ou alors peut-être chaque matin, je ne sais pas ce qui est le mieux.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 503
- erreur: `BOOT_ERROR`, worker failed to boot
- durable_effect: none; `user_chat_states=[]`, `scheduled_checkins=[]`

**Analyse si yellow/red**
- Symptôme: worker Edge non booté.
- Source amont probable: graphe Edge local temporairement incohérent autour du
  chantier `adjust_plan_item`.
- Owner runtime: environnement local.
- Meilleure correction selon les guidelines: redémarrer Edge Runtime et ne pas
  compter ce tour comme validation.
- Pourquoi ce n'est pas un patch local: aucun résultat métier Sophia n'a été
  produit.

### Tour 1 — Variante Rappel "Chaque Matin"

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-04` — Ambiguïté non reconnue.

**User**
> Je voudrais que Sophia me fasse un rappel demain matin... ou alors peut-être chaque matin, je ne sais pas ce qui est le mieux.

**Sophia**
> Je n'ai pas réussi à le faire. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects:
  `["create_one_shot_reminder","create_one_shot_reminder"]`
- direct_effects_to_run:
  `["create_one_shot_reminder","create_one_shot_reminder"]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: absent

**Analyse si yellow/red**
- Symptôme: pas de question ponctuel vs récurrent; fallback d'échec visible.
- Source amont probable: dispatcher L1 ne produit pas le candidat
  `create_recurring_reminder` pour "chaque matin".
- Owner runtime: dispatcher / TurnFrame signal production.
- Meilleure correction selon les guidelines: améliorer la production de
  signaux structurés pour les formulations récurrentes équivalentes, sans
  ajouter de décision regex dans l'arbitrator.
- Pourquoi ce n'est pas un patch local: le builder ne doit pas relire le
  message brut; il ne peut clarifier que les candidats fournis.

### Tour 1 — Contrôle Rappel Original

**Verdict du tour:** green

**User**
> Je veux que Sophia me relance demain matin, enfin peut-être tous les matins, je ne suis pas sûr de la forme.

**Sophia**
> Souhaitez-vous un rappel uniquement pour demain matin ou préférez-vous qu'il se répète tous les matins ? 🙂

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
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `timing`,
  candidats `create_one_shot_reminder`, `create_recurring_reminder`,
  `no_chat_mutation=true`

### Tour 1 — Variante Product Help Vs Carte D'attaque

**Verdict du tour:** green

**User**
> J’hésite : soit tu m’expliques les cartes d’attaque, soit on en prépare une pour mon action du matin.

**Sophia**
> Souhaitez-vous obtenir une explication sur les cartes d'attaque ou préférez-vous en préparer une dès maintenant ? 🙂

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
- tool_execution: `none`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `intent`,
  candidats `product_help`, `prepare_attack_card`, `no_chat_mutation=true`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les deux scénarios d'acceptation restent naturels et posent une seule
  question claire.
- Le scénario product/help carte reste vert sur formulation variante.

**Problemes**
- Tour variante rappel "chaque matin": réponse d'échec au lieu d'une
  clarification. Famille: `BF-INTAKE-04`. Impact: l'utilisateur ne peut pas
  choisir la forme du rappel. Sévérité: red.

**Fix propose**
- Source amont: dispatcher L1, production des signaux récurrents.
- Correction recommandee: exposer `create_recurring_reminder` comme signal
  structuré quand la formulation équivaut à une récurrence matinale.
- Tests d'invariant attendus: variante "chaque matin" clarifiée; cas ponctuel
  seul et récurrent seul restent non ambigus.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `r1-control` et `r2` routent correctement vers
  `orientation_clarification`.
- `r1b` route vers `normal_reply`, avec deux `direct_effects` ponctuels et sans
  `ClarificationState`.

**Skills / Operations / Tools**
- Aucun executor n'a été appelé sur les trois runs exploitables.
- Aucun tool skill complexe n'a été lancé sur les deux runs verts.

**Memory / Effets durables**
- Aucun scheduled checkin créé.
- Les états de clarification sont écrits sur les deux runs verts.
- Les users temporaires et données de run ont été nettoyés de façon ciblée.
  `user_memories` retourne 404 dans cet environnement local, les autres tables
  et `auth.users` ont été nettoyés avec succès.

**Problemes**
- Tour variante rappel: absence de candidat `create_recurring_reminder`.
  Famille: `BF-INTAKE-04`. Impact système: l'arbitrator ne peut pas clarifier.
  Sévérité: red.

**Fix propose**
- Source amont: dispatcher L1.
- Correction recommandee: corriger la production du `TurnFrame`, pas le
  `clarification_candidate_builder`.
- Tests d'invariant attendus: unit dispatcher + run réel `force_full_ai=true`.

## Verdict Global

- Verdict: red
- Raison principale: les deux scénarios d'acceptation restent verts, mais une
  variante récurrente naturelle avec "chaque matin" ne produit pas le candidat
  récurrent et échoue sans clarification.
- Follow-up prioritaire: corriger le signal dispatcher pour "chaque matin" vs
  ponctuel.

## Feuille De Suivi Bugs

- Bug sheet:
  `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-clarification-dispatcher-real-bugs.md`
