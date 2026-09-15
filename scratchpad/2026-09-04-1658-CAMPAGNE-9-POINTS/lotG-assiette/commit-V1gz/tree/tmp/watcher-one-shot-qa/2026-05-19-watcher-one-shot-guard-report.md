# Watcher One-Shot Guard QA - 2026-05-19

## 1. Contexte Du Test

- Run valide: `watcher-oneshot-guard-20260519185445`
- User temporaire: `qa-watcher-oneshot-guard-20260519185445@example.com`
- Objectif: vérifier que le watcher ne crée pas de check-in quand le besoin est déjà couvert par un one-shot reminder programmé au lendemain.
- Cadre: Supabase local, `/functions/v1/test-send-message` avec `force_full_ai=true`, Auth locale vérifiée, puis `/functions/v1/trigger-watcher-batch` avec `force_full_ai=true`.
- Note technique: `trigger-watcher-batch` supporte maintenant `force_full_ai=true` pour ignorer `SOPHIA_WATCHER_DISABLED=1` en QA locale et passer `forceRealAi` au watcher.

## 2. Tours De Conversation

### Tour 1

**User**
> Rappelle-moi demain à 9h10 de préparer le dossier client.

**Sophia**
> C’est programmé pour mercredi 20 mai à 09:10 : préparer le dossier client. 🙂

**Trace courte**
- HTTP: 200
- `tool_execution`: `success`
- `executed_tools`: `["create_one_shot_reminder"]`
- Effet durable: `scheduled_checkins[0].event_context=one_shot_reminder:preparer_le_dossier_client`
- `scheduled_for`: `2026-05-20T07:10:00Z`
- `reminder_instruction`: `préparer le dossier client`

### Tour 2

**User**
> Demain matin, ce dossier client me stresse un peu ; il faut vraiment que je le prépare avant l'appel.

**Sophia**
> C'est normal que la pression monte un peu si l'appel est important. On va s'assurer que tu arrives devant ton écran avec les idées claires demain matin.
>
> Pour te libérer l'esprit, je peux te préparer une Carte d'attaque : ça te donnera une marche à suivre ultra simple pour démarrer sans réfléchir. Tu veux qu'on fasse ça ? 📝

**Trace courte**
- HTTP: 200
- `tool_execution`: `none`
- `executed_tools`: `[]`
- Aucun nouveau direct effect.

## 3. Analyse Systeme

Avant watcher:
- `scheduled_checkins` total user: 1
- `origin=watcher`: 0
- one-shot reminders: 1

Trigger watcher:
- Endpoint: `/functions/v1/trigger-watcher-batch`
- HTTP: 200
- Response: `{ "success": true, "processed": 9, "skipped": 0 }`

Après watcher:
- `scheduled_checkins` total user: 1
- `origin=watcher`: 0
- one-shot reminders: 1
- Aucun check-in watcher ajouté pour `préparer le dossier client`.

## 4. Verdict Global

`green`: le watcher ne pick up pas le sujet déjà couvert par le one-shot reminder programmé au lendemain. Le rappel existant garde sa consigne et son horaire, et aucun doublon `origin=watcher` n'est créé.

## 5. Artefacts

- Run dir: `tmp/watcher-one-shot-qa/watcher-oneshot-guard-20260519185445`
- Summary: `tmp/watcher-one-shot-qa/watcher-oneshot-guard-20260519185445/summary.json`
- Transcript: `tmp/watcher-one-shot-qa/watcher-oneshot-guard-20260519185445/transcript.json`
