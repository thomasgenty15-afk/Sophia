# Bug Sheet — Conversation Pulse V2 Real R2

## R2-B01 — Snapshot V2 refuse par contrainte DB

- Bug id: R2-B01
- Tours: Background Watcher / Daily
- Famille: BF-EFFECT-02 — Effet attendu absent
- Domaine owner: system runtime snapshots / DB schema
- Source amont: contrainte SQL `system_runtime_snapshots_snapshot_type_check`
- Statut: open
- Fix reference: a faire

## Symptome visible

Le run conversationnel fonctionne et le watcher appelle bien Gemini pour produire le pulse V2, mais aucun `watcher_conversation_pulse_v2` n'est persiste. Le daily pulse ne peut donc pas s'agreger.

## Preuve systeme

Trace du run:

```txt
gemini_result source=watcher_conversation_pulse_v2 outcome=text
conversation_pulse_v2_error
code=23514
message=new row for relation "system_runtime_snapshots" violates check constraint "system_runtime_snapshots_snapshot_type_check"
failing snapshot_type=watcher_conversation_pulse_v2
```

Migration actuelle:

```txt
supabase/migrations/20260522143735_squashed_schema.sql
system_runtime_snapshots_snapshot_type_check
```

La contrainte autorise `conversation_pulse` et `conversation_pulse_generated_v2`, mais pas:

- `watcher_conversation_pulse_v2`
- `daily_conversation_pulse_v2`
- `weekly_conversation_pulse_v2`

## Correction attendue

Ajouter une migration qui remplace la contrainte `system_runtime_snapshots_snapshot_type_check` et autorise les trois nouveaux snapshot types V2.

La correction doit rester au niveau schema/runtime snapshot. Ne pas remettre un fallback vers `snapshot_type="conversation_pulse"`.

## Tests requis

- Test SQL ou integration locale: insertion `watcher_conversation_pulse_v2` acceptee.
- Test SQL ou integration locale: insertion `daily_conversation_pulse_v2` acceptee.
- Test anti-regression: aucun writer runtime ne reintegre `snapshot_type="conversation_pulse"`.
- Rerun QA reel:
  - conversation reelle via `test-send-message`;
  - watcher genere et persiste `watcher_conversation_pulse_v2`;
  - daily genere et persiste `daily_conversation_pulse_v2`;
  - morning nudge lit le snapshot V2.
