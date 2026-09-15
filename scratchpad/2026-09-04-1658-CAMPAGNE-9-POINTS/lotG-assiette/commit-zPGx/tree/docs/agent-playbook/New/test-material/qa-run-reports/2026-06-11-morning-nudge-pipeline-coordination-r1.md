# QA Run Report — Morning Nudge Pipeline Coordination R1

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `morning-nudge-pipeline-1781205818021`
- Persona: Alex, connexion locale existante
- Objectif: verifier la coordination pipeline entre un `morning_nudge_v2` et les check-ins/rappels deja prevus dans la fenetre locale 07:00-12:00.
- Surface testee: branche pipeline `scheduled_checkins` -> `resolveMorningNudgePlanV2` -> `buildMorningNudgePayloadV2` -> update `scheduled_checkins.message_payload`.
- Important: l'endpoint global `process-checkins` n'a pas ete appele car la DB locale contenait deja 8 check-ins dus hors QA. L'appeler aurait traite des donnees hors perimetre.
- Mode QA: runner local cible par IDs exacts, vraie DB locale Supabase, pas de chat, pas de generation IA externe, cleanup dans `finally`.

## 2. Setup Pipeline

**Artefacts crees**

- Morning nudge QA:
  - id: `936e3c80-3ded-49bf-b342-7e9576c9e1eb`
  - event_context: `morning_nudge_v2`
  - scheduled_for: 08:00 local Europe/Paris
  - origin: `unknown`
- Check-in voisin QA:
  - id: `a6c0e34c-7187-4221-8f4f-ee41a5399cf6`
  - event_context: `qa_support_checkin:morning-nudge-pipeline-1781205818021`
  - scheduled_for: 08:30 local Europe/Paris
  - instruction: message de soutien matinal, sans citer les details

**Garde-fou**

- Le current morning nudge id a ete passe a `resolveMorningNudgePlanV2` via `scheduledCheckinId`.
- La requete des commitments exclut les event_contexts morning nudge pour eviter l'auto-redondance.

## 3. Resultat

**Verdict:** green

**Trace courte**

```json
{
  "status": "green",
  "decision": "send",
  "posture": "support_softly",
  "nudge_kind": "emotional_presence_nudge",
  "commitments_count": 1,
  "commitment_ids": ["a6c0e34c-7187-4221-8f4f-ee41a5399cf6"],
  "includes_self": false,
  "coordination_notes_count": 1,
  "instruction_has_anti_redundancy": true,
  "grounding_has_commitments": true,
  "payload_source": "qa_process_checkins_pipeline"
}
```

**Assertions validees**

- Le check-in voisin dans la fenetre locale 07:00-12:00 est charge.
- Le morning nudge ne s'inclut pas lui-meme dans `morning_scheduled_commitments`.
- `message_payload.morning_nudge_v2.morning_scheduled_commitments` contient exactement le check-in voisin.
- `message_payload.morning_nudge_v2.coordination_notes` est present.
- `message_payload.instruction` contient la consigne anti-redondance.
- `message_payload.event_grounding` contient `morning_scheduled_commitments=`.
- Le payload final reste un `emotional_presence_nudge` avec posture `support_softly`.

## 4. Cleanup

**Cleanup cible effectue**

- `scheduled_checkins`: 2 lignes supprimees par IDs exacts:
  - `936e3c80-3ded-49bf-b342-7e9576c9e1eb`
  - `a6c0e34c-7187-4221-8f4f-ee41a5399cf6`

**Verification post-cleanup**

- Requete residuelle par `qa_run_id like 'morning-nudge-pipeline-%'`: `0`

## 5. Limites

- Ce run ne valide pas l'envoi WhatsApp ni la generation visible finale.
- Ce run valide la partie pipeline utile a la modification: construction et persistance du contexte anti-redondance dans le payload morning nudge.
- L'endpoint global `process-checkins` devra etre teste dans une DB sans check-ins dus hors QA, ou avec un filtre de run dedie, pour valider la livraison end-to-end sans effet collateraux.

## Verdict Global

`green`: la pipeline morning nudge integre bien les check-ins/rappels prevus le matin entre 07:00 et 12:00, expose un contexte compact au payload, et ajoute une consigne anti-redondance sans auto-inclusion du morning nudge.
