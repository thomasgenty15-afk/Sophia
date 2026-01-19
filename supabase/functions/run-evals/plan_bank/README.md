# Plan bank (evals)

This folder stores **pre-generated transformation plans** used by `run-evals` to avoid calling `generate-plan` (Gemini) during eval runs.

- Files are committed to the repo (stored “in the IDE”), not in the database.
- `run-evals` can pick a random plan from this bank when `limits.use_pre_generated_plans=true`.

## Layout

Recommended:

- `plan_bank/<THEME_KEY>/<plan_id>.json`

Where `<THEME_KEY>` is one of:

- `ENERGY`
- `SLEEP`
- `DISCIPLINE`
- `PROFESSIONAL`
- `RELATIONS`
- `SENSE`
- `TRANSVERSE`
- `CONFIDENCE`

## File format

Each JSON file should look like:

```json
{
  "meta": {
    "theme_key": "SLEEP",
    "theme_id": "SLP",
    "theme_title": "Sommeil & Récupération",
    "axis_id": "SLP_1",
    "axis_title": "…",
    "selected_problem_ids": ["SLP_1_P2", "SLP_1_P4"],
    "selected_problem_labels": ["…", "…"],
    "model": "gemini-2.5-flash",
    "created_at": "2026-01-15T14:30:00.000Z"
  },
  "fake": {
    "inputs": { "why": "...", "blockers": "...", "context": "...", "pacing": "balanced" },
    "currentAxis": { "id": "...", "title": "...", "theme": "...", "problems": ["...", "..."] },
    "answers": { "meta": { "source": "eval-plan-bank" }, "axis": { "...": "..." } },
    "userProfile": { "birth_date": "1992-03-11", "gender": "male" }
  },
  "plan_json": { "grimoireTitle": "...", "phases": [ ... ] }
}
```

## Generate plans (real Gemini)

Use `supabase/scripts/generate_eval_plan_bank.ts` (Deno) to generate and write plan files into this folder.

Example:

```bash
deno run -A supabase/scripts/generate_eval_plan_bank.ts --per-theme 3
```


