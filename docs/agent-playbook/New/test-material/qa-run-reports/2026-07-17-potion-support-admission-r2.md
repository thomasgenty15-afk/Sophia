# QA Run Report — Potion Support Admission R2 (rerun A/C post-fix PSA-B01/B02)

## 1. Contexte Du Test

- Date: 2026-07-17 (soir, après R1)
- Run: `potion_support_admission_20260717_r2` — rejoue uniquement les deux parcours rouges de R1 après correctif.
- Persona: deux comptes temporaires `qa-skill` neufs (`all_skills_potadm20260717a2`, `…c2`), mêmes fixtures que R1 (WhatsApp simulé, inbound −3 h, cycle actif minimal), supprimés en fin de run.
- Objectif: valider le correctif PSA-B01 (contrat de sortie du dispatcher local : valeurs légales énumérées dans le prompt + coercition déterministe des sorties structurellement fiables, default-deny conservé) et PSA-B02 (`render_constraints` d'interdiction de claim quand `campaign_status=active`).
- Trajectoire: A2 = J1 → deux tours Présence → boundary d'arrêt en Présence → tour de vérification ; C2 = J1 → annulation dès la première réponse (contexte devenu obsolète, prêt accordé).
- Surfaces visees: identiques à R1, focalisées sur la branche `cancel_campaign` des deux phases (`presence_continuation`, `first_reply`) et l'honnêteté du tour de sortie.
- Cadre IA reel: identique à R1 (test-send-message `force_full_ai=true`, `process-checkins` réel, préflight fleet-wide propre, aucun fallback). Correctif appliqué AVANT le run (autorisé : demande explicite « corrige les erreurs et relance ») ; tests unitaires 93/93 verts avant rejeu, dont la fixture rejouant la sortie modèle réelle capturée en R1.
- Validite QA: valide. Aucun incident.
- Nettoyage: comptes, données (0 ligne résiduelle) et connexions supprimés.

## 2. Tours De Conversation

### A2 — Ouverture J1 + deux tours Présence

**Verdict du tour:** green

**Sophia (J1)**
> La présentation du bilan annuel devant le comité de direction lundi semble encore très présente pour vous. On peut rester au plus près de cela, sans brusquer les choses.

**User (T1)**
> Oui… j'ai refait mes slides trois fois et je bloque toujours sur la partie budget, c'est là que je crains les objections du directeur financier.

**Trace courte**
- J1 `sent` depuis la baseline ; T1 `continue_support` → Présence (`admission_promoted_to_presence=true`) ; T2 `continue_support` en `presence_continuation`.
- Warning mineur (non bloquant) : le J1 de ce compte vouvoie (« pour vous ») alors que tous les autres tours tutoient — incohérence de registre à surveiller côté visible agent d'ouverture.

### A2 — Tour 3 : boundary d'arrêt en Présence (était red en R1)

**Verdict du tour:** green

**User**
> Merci pour ce soir. Par contre pour la suite je préfère avancer sans ce suivi : stoppe les prochains messages de cette potion s'il te plaît.

**Sophia**
> Bien reçu. J'arrête de te pousser les prochains messages de cette session d'apaisement.

**Trace courte**
- potion_support_local_dispatch: `action=cancel_campaign`, `confidence=high`, `relation=campaign_boundary`, `terminal_reason=cancelled_user_boundary`, `campaign_status=terminal_committed`
- durable_effect: reminder `archived` + `terminal_reason=cancelled_user_boundary`, 6 check-ins `cancelled`. Le claim visible est cette fois adossé à un commit réel.

### A2 — Tour 4 : vérification (était red en R1)

**Verdict du tour:** green

**User**
> Juste pour être sûre : c'est bien coupé, je ne recevrai plus rien demain matin ?

**Sophia**
> Oui, c'est bien coupé : tu ne recevras rien demain matin de cette session d'apaisement.

**Trace courte**
- response_owner: `normal_reply` ; 0 créneau `pending` en DB — la confirmation est groundée, plus de refus confabulé.

### C2 — Annulation dès la première réponse (était red en R1)

**Verdict du tour:** green

**Sophia (J1)**
> Je vois que ce rendez-vous bancaire de jeudi reste très présent, avec la pression du prêt et l'idée des refus possibles. Je reste avec ce point-là, sans aller ailleurs.

**User**
> En fait bonne nouvelle : la banque a accordé le prêt ce matin, le rendez-vous de jeudi est annulé. Ce suivi n'a plus de raison d'être, tu peux l'arrêter.

**Sophia**
> Bonne nouvelle pour le prêt, et le rendez-vous de jeudi tombe donc. Je n'ai plus de suivi à garder sur ce point.

**Trace courte**
- potion_support_local_dispatch: `action=cancel_campaign`, `confidence=high`, `relation=campaign_boundary`, `terminal_reason=completed_resolved`, `campaign_status=terminal_committed`
- durable_effect: reminder `completed` + `completed_resolved`, 6 check-ins `cancelled`.
- Nuance acceptée: le modèle a classé `completed_resolved` (sujet réglé positivement, preuve user explicite « la banque a accordé le prêt ») plutôt que `cancelled_context_obsolete`. Les deux sont terminaux sans reprise possible ; la classification est défendable et conforme au contrat Vague 4.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

- Les deux annulations reçoivent un accusé sobre et VRAI ; le tour de vérification confirme depuis la DB.
- Warning mineur : vouvoiement isolé sur le J1 de A2 (registre incohérent avec le reste de la conversation) — à surveiller, non bloquant.

## 4. Analyse Systeme

**Verdict: green**

- La branche `cancel_campaign` committe désormais sur les deux phases et deux `terminal_reason` distincts ; le default-deny reste vérifié par tests unitaires (confidence numérique basse et écho `session_boundary` toujours dégradés).
- Parité claim/ledger rétablie : chaque affirmation d'arrêt est adossée à `terminal_committed` relu.
- Tests: 93/93 verts sur les suites potion (dont 6 nouvelles fixtures PSA-B01/B02, y compris la capture réelle de R1).

## Verdict Global

- Verdict: green
- Raison principale: les trois bugs de R1 (PSA-B01/B02/B03) sont corrigés et validés en réel ; toutes les branches du dispatcher local sont maintenant vertes en conditions réelles (R1 : B, D, E ; R2 : A, C).
- Follow-up prioritaire: lancer la QA bout-en-bout 7 jours (J1→J7 avec messages intersession, préemptions Daily/Weekly, template hors 24 h), puis deploy.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-17-potion-support-admission-r1-bugs.md` (statuts mis à jour : PSA-B01 fixed, PSA-B02 fixed, PSA-B03 closed via B01)
