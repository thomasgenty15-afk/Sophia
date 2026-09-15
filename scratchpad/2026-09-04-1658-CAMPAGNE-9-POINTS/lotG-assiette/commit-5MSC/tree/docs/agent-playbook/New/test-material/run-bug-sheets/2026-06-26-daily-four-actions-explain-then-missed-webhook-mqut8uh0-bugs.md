# Bug Sheet - daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0

## Run

- Report: `tests/real-personas/rose/runs/daily-weekly/daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0.md`
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0.raw.json`
- Persona: Rose
- Date: 2026-06-26
- Verdict global: red

## Bugs

### R1-B01 - Daily commit premature sur target restante non prouvee

- Tours: 6, 7, 8
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `daily_action_review_v1`
- Source amont: reducer/effect admission, coverage gate des targets daily
- Symptome visible: Sophia cloture les 4 actions apres la reponse a `Ranger deux papiers administratifs`, alors que `Préparer la pochette documents` n'a pas encore ete expliquee ni evaluee.
- Preuve systeme: au tour 6, `pending_status=done`, `review_status=complete`, `entries_count=4`; la 4e entry reprend la raison fatigue de l'action 3 au lieu de la preuve externe donnee ensuite.
- Correction attendue: interdire `should_apply_effects=true` tant que chaque target du pending n'a pas une evidence propre liee a son occurrence, ou une phrase globale explicite qui couvre toutes les targets restantes.
- Statut: verified
- Fix reference: `supabase/functions/_shared/daily_action_review/reducer.ts`; tests `daily action review blocks spillover update for unmentioned remaining target` et `daily action review allows explicit global update for remaining targets`; rerun QA `daily-four-actions-explain-then-missed-webhook-20260626-mquyvm3x`.
- Tests requis: couverts par test reducer negatif, test reducer positif global, et run webhook daily 4 targets avec demandes d'explication intercalees.

### R1-B02 - Post-close 502 apres fermeture prematuree du daily

- Tours: 7, 8
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: daily flow close lifecycle / webhook robustness
- Source amont: consequence du commit premature; le user continue naturellement sur une target que le daily a deja fermee.
- Symptome visible: les messages user suivants recoivent `502` et aucune reponse assistant.
- Preuve systeme: tours 7 et 8, `http_status=502`, `pending_status=done`, `entries_count=4`, assistant vide.
- Correction attendue: fixer d'abord le commit premature; ajouter ensuite un garde post-close si un message arrive juste apres fermeture avec une target daily non reellement traitee.
- Statut: verified
- Fix reference: rerun QA `daily-four-actions-explain-then-missed-webhook-20260626-mquyvm3x`.
- Tests requis: couvert par le rerun QA; le tour d'explication de la 4e action reste dans daily, puis le commit final arrive apres preuve de la 4e action.
