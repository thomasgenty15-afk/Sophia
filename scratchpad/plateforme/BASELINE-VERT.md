# La baseline de « vert » — mesurée AVANT toute écriture de ce chantier

> 2026-08-13, sur `ff-001-quotidien-du-coach`, avant que le premier agent
> n'écrive. Ce fichier existe pour une seule raison : **le dépôt n'était pas
> vert au départ**, et sans cette mesure, le rouge d'autrui deviendrait le mien
> au moment du rapport final.

## `npx tsc -b` — DÉJÀ ROUGE, et pas de mon fait

| fichier | erreurs | à qui |
|---|---:|---|
| `src/keel/i18n/en.ts` | 30 → **180** | le chantier de traduction, **en cours d'écriture** |
| `src/keel/i18n/fr.ts` | 30 → **124** | idem |
| `src/keel/pages/StudentWeekPlanPage.tsx` | 5 → **0** | **moi**, résolu (voir plus bas) |

Nature : `TS2783` (clé déclarée deux fois) sur `en.ts`, et `TS2740` sur `fr.ts`
(il manque 36 clés de `TranslatedMessages`, puis davantage).

⚠️ **Le compte a bougé de 60 à 304 en huit minutes, sans que je touche à ces
fichiers.** C'est la signature d'une session qui écrit en parallèle. Le nombre
n'est donc pas une baseline stable : ce qui est stable, c'est **que ces deux
fichiers sont à quelqu'un d'autre**, et que la règle du master (§0.4) est de
consigner sans réparer.

**Les 5 erreurs qui étaient miennes** : `Property 'accent' does not exist`, aux
lignes 1747/1770/1938/1957/1975 de `StudentWeekPlanPage.tsx` — la conséquence
attendue du retrait de `SetupAccent` (audit §5.1). Corrigées dans ma fenêtre
série : les cinq lignes `accent="…"` retirées, **et rien d'autre** (`diff`
vérifié à cinq suppressions de ligne).

## `npx vitest --config vitest.config.ts run` — DÉJÀ ROUGE

**5 échecs / 833 tests, dans 3 fichiers.** Aucun n'est de mon fait.

| fichier | échecs | ce qu'il vérifie | à qui |
|---|---:|---|---|
| `keel/i18n/parity.int.test.ts` | 2 | le pack `fr` porte exactement les clés publiques ; il ne recopie pas l'anglais | le chantier de traduction |
| `edge/coverage-guard.int.test.ts` | 2 | tout trigger DB et toute fonction edge sont dans la liste connue | un chantier backend |
| `keel/copy/planRefusals.int.test.ts` | 1 | la liste fermée des refus de foyer ne perd aucun motif | le chantier foyer |

⚠️ **La suite doit tourner avec l'environnement NETTOYÉ** :
```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_DB_URL \
  npx vitest --config vitest.config.ts run
```
Avec `SUPABASE_*` exporté, la suite rend une centaine de faux rouges — le dépôt
a déjà payé ce piège.

## Ce que « fini » peut donc vouloir dire

La barre du master §7 demande « tsc + vitest verts ». **Ce n'est pas atteignable
par ce chantier seul** : les 65 à 304 erreurs `tsc` et les 5 échecs de tests
appartiennent à trois autres lots qui écrivent en même temps que moi.

**Le critère que je tiens à la place, et qui est vérifiable :**
> **zéro erreur `tsc` et zéro échec de test dans un fichier que ce chantier a
> touché**, et le compte d'autrui inchangé ou expliqué.

C'est la seule formulation honnête. Elle est plus forte que « vert », parce que
« vert » aurait été obtenu en réparant le travail en vol de quelqu'un d'autre —
ce que le master interdit explicitement (§0.4).

## Le périmètre partagé, mesuré

**25 des 40 fichiers de mon périmètre portent déjà du travail non committé
d'autres sessions** — environ 2 100 lignes. Les plus chargés :

| fichier | lignes d'autrui |
|---|---|
| `keel/pages/HouseholdPage.tsx` | +248 / −2 |
| `keel/pages/CoachDoctrinePage.tsx` | +228 / −147 |
| `keel/pages/StudentWeekPlanPage.tsx` | +226 / −159 |
| `keel/pages/StudentProgressPage.tsx` | +177 / −101 |
| `keel/components/DoctrineStartDialog.tsx` | +108 / −91 |

**Conséquence pour les commits, et c'est une décision prise seule :**
la séparation par *hunk* est possible là où ma modification est isolée (le
commentaire de `StartPage`, les cinq `accent=`) et **impossible** là où les deux
sessions écrivent la même ligne — le chantier de traduction remplace une chaîne
par `t(...)` sur la ligne exacte où je change une classe. Vouloir séparer ça
corromprait le fichier.

Donc : **commits au chemin**, avec un manifeste explicite des chemins qui
portent du travail d'autrui. `git add -A` reste interdit ; `git stash` aussi
(il emporterait 200+ fichiers d'autres sessions).

L'outil de séparation par hunk, pour les cas propres :
`scratchpad/stage-hunks.mjs <fichier> <regex>` → n'indexe que les hunks dont une
ligne **ajoutée ou retirée** matche.
