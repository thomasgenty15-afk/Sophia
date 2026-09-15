# Campagne des dix tirs — 2026-09-14, 18 h

Instrument : `scripts/2026-09-11-mesure-grille.ts` via `analyse-lot-F.ts`, après `figer-demande.ts`. Grille : [mesure.md](../../docs/keel/mesure.md). Compte de fixture `lotf.camp<N>.b10@keeltest.dev`. Aucune suppression. Aucune relance silencieuse.

⛔ **Cette campagne n'est pas une campagne de dix livraisons.** Deux tirs ont payé le modèle. Les tirs 3 à 10 n'ont pas été lancés : le tir 1 a prouvé que `keel_household_publish_generation` appelle `write_student_meal_plan` avec `p_duration_days integer` alors que l'écrivain n'existe qu'en `smallint`. Les huit suivants auraient répété le 409 après 90–300 s payées.

Migration écrite, **non appliquée** (commande à l'humain) : `supabase/migrations/20260914170000_le_bail_caste_la_duree.sql`.

```bash
supabase migration up --local
```

Puis relancer avec un suffixe neuf (`--compte=b10c`), sans toucher `supabase/functions/` pendant les tirs : un hot-reload a coupé le tir 2 en 502.

| tir | profil | HTTP | durée | ligne écrite | instrument |
|---|---|---|---|---|---|
| 1 | N=1 perte, appétit moyen | **409** `plan_not_written` | 127 962 ms | non | cases attendues 6 ; contrôles 1–9 non mesurables |
| 2 | N=1 gain, appétit moyen | **502** Kong | 171 858 ms | non | cases attendues 6 ; contrôles 1–9 non mesurables |
| 3 | N=1 perte, grand appétit | non lancé | — | — | — |
| 4 | N=1 gain, petit appétit | non lancé | — | — | — |
| 5 | N=1 perte, déjeuner déclaré petit + yaourt au petit-déjeuner | non lancé | — | — | — |
| 6 | N=2, allergie arachide sur la 2ᵉ bouche | non lancé | — | — | — |
| 7 | N=1 maintien, dîner léger par habitudes | non lancé | — | — | — |
| 8 | N=2 végane + omnivore | non lancé | — | — | — |
| 9 | N=4, absences et mineure sans objectif | non lancé | — | — | — |
| 10 | N=2 perte + prise, préparations communes | non lancé | — | — | — |

Fenêtre réelle des deux tirs (horloge 18 h, Europe/Paris) : 3 jours demandés → **lundi retiré** (`shopping_cutoff`) → mar+mer, **6 cases** × N bouches. Ce n'est pas un défaut du moteur ; c'est la dérivation de `plan_hours.ts` + `meal_plan_window.ts` avant l'appel.

Rapports : [tir 1](rapports/tir-01.md) · [tir 2](rapports/tir-02.md).
