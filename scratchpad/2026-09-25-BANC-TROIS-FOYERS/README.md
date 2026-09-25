# Banc des trois foyers — 2026-09-25

Trois foyers de fixture très différents, créés par les portes de l'app, pour
juger un plan de bout en bout. Comptes `banc0925.{a.camille,b.karim,c.thomas}@keeltest.dev`,
mot de passe `1234567` (voir `cas.py`).

| Script | Rôle |
|---|---|
| `cas.py` | Les trois foyers (corps, objectifs, régimes, allergies, habitudes, cuisine, fenêtre). |
| `fixtures.py A B C` | Crée ou remet les foyers. ⚠️ Recrée les bouches : nouveaux identifiants. |
| `run.py A B C` | Vraie génération, UNE à la fois (budget CPU partagé du runtime local). |
| `rejouer.ts --brouillon=<id>` | Rejoue un tir réel dans le vrai handler, réponses du modèle en conserve, zéro dépense. |
| `render.py <draft>` | Le plan mis à plat, jour par jour. |
| `checks.py <draft>` | Qui mange quoi, fenêtres de frigo, matériel, courses. |
| `nutri.py <draft>` | Recompte indépendant kcal / protéines / coût au référentiel. |

## Rejouer

```
deno run -A --config supabase/functions/deno.json \
  scratchpad/2026-09-25-BANC-TROIS-FOYERS/rejouer.ts --brouillon=<draft_id>
```

- Porte de fidélité : sur le code d'origine, le rejeu redonne la consigne à l'octet et le même plan
  (vérifié le 2026-09-25 : A `deed7ddf` → `2713b0cc`, 0 ligne de différence ; C `8c7dc643` → `16040d07`,
  mêmes chiffres servis que le journal).
- Un appel absent de la conserve est un échec du banc (le handler reçoit un 400, le rapport le nomme).
- Ne pas relancer `fixtures.py` avant un rejeu.
- Un tir d'un autre jour exige `--horloge=<ISO> --suspendre-relance` (le cron de relance local est
  coupé le temps du rejeu, puis rétabli).
- Le rejeu ne reproduit pas la limite CPU du runtime edge.
