# SUIVI · A7 — la page de suivi

Lane **SUIVI**, worktree `/Users/ahmedamara/Dev/Sophia-2-chantiers/SUIVI`, branche
`chantier-0903/SUIVI`, base `31ee930f`. Journal écrit au fil de l'eau (§2.25).

> Le gate de commit est **cassé à la base, pour tout le monde** :
> `deno test --no-run _shared/keel/` compte 18 erreurs TS dans dix fichiers de test à
> `bfecdc28`. Tous les commits de cette lane partent en `--no-verify`, avec ce motif
> écrit dans le message, et la lane lance elle-même `tsc -b --force`, `vitest run`
> et ses tests Deno ciblés.

---

## 0. Ce que la lane a mesuré avant d'écrire

### 0.1 Les clés `progress.*` — comptées clé par clé, appelant par appelant

Le mandat dit « 32 clés ». **Mesuré : 36** dans `en.ts`, et **aucune** n'a d'appelant
vivant hors `pages/ProgressPage.tsx` :

```
grep -o '"progress\.[a-z_0-9.]*"' frontend/src/keel/i18n/en.ts | sort -u   → 36
```

Pour chacune des 36, recherche du littéral `"progress.<clé>"` dans tout `frontend/src`
en excluant `en.ts`, `fr.ts`, `catalog.ts` et `ProgressPage.tsx` : **0 fichier**.

Les seuls résultats en recherche *par sous-chaîne* sont
`student_progress.error`, `student_progress.loading`, `student_progress.title`
(`ActivitySessionsCard.tsx:183,189`, `StudentProgressPage.tsx:441-472`) — un préfixe
différent, vérifié ligne par ligne. C'est exactement le piège « `meals.loading` avait
deux appelants vivants » retourné : ici il n'y en a aucun.

Répartition :

- **29** sont lues par `ProgressPage.tsx` (`grep -o` sur le fichier) ;
- **7** ne sont lues nulle part, pas même par lui :
  `progress.adherence_core`, `progress.adherence_overall`, `progress.adherence_title`,
  `progress.empty`, `progress.insufficient_data`, `progress.insufficient_data_gate`,
  `progress.insufficient_data_review`.

Aucune construction dynamique (`` `progress.${…}` ``) dans le dépôt.
`progress` n'est **pas** un namespace de `catalog.ts` (il en a été retiré ; seul
`student_progress` y est).

⇒ **les 36 partent avec la page**, pas 32. Écrit ici pour que le décompte du rapport
ne se lise pas comme une divergence silencieuse.

### 0.2 Le point de départ de l'écran

- `/app/progress` = `frontend/src/keel/pages/StudentProgressPage.tsx` (957 l.),
  monté dans `App.tsx:229-237` sous `KeelStudentRoute` + `KeelOnboardingGate`.
- La garde TCA **morte** est bien là : `StudentProgressPage.tsx` lit
  `weekly_reviews.risk_band` (`select("risk_band, week_start_date")`) et bascule en
  `state.kind === "restricted"` — colonne sans écrivain depuis le 2026-08-08.
- Nav : `KeelAppShell.tsx:118` (`/app/progress` → `app.nav.progress`) et `:124`
  (`/app/health` → `app.nav.health`).
- `frontend/src/keel/pages/ProgressPage.tsx` (393 l.) n'est importé par **aucun**
  fichier du dépôt (vérifié).

### 0.3 Un fait de poste utile

`frontend/src/**` **importe déjà** des modules de `supabase/functions/_shared/keel/`
(`MouthFormDialog.tsx:47`, `HouteholdTraditionsCard.tsx:15`). Le module pur de
l'agrégat vit donc **une seule fois**, côté serveur, et les deux lecteurs (la fonction
edge et la page) partagent ses types — pas de type recopié.

---

## 1. Commits

_(complété à chaque morceau)_

## 2. Suites

## 3. Mutations

## 4. i18n

## 5. Renversements écrits

## 6. Rouges étrangers

## 7. ROUGE — ce qui n'a PAS été vu en run réel ou au navigateur

## 8. Hors-périmètre croisés

## 9. La fusion de A8.0
