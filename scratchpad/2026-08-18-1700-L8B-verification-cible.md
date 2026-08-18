# L8-B — Vérification du LOT CIBLE (`269797e7` + `95786e85`)

**2026-08-18 · branche `ff-001-quotidien-du-coach` · aucun push, aucun merge**
Lot vérifié : [`2026-08-18-1545-L8A-cible-et-grammages.md`](2026-08-18-1545-L8A-cible-et-grammages.md)
Grille : [`2026-08-18-1215-L4B-verification-garde-tca.md`](2026-08-18-1215-L4B-verification-garde-tca.md) §7 (C1→C9)

> ⚠️ Ce rapport est écrit **au fil de l'eau et commité par paliers**. Trois agents
> ont calé sur cette vérification ; un résultat partiel posé vaut mieux qu'une
> vérification complète perdue. Les sections marquées 🕓 sont en cours.

---

## 0. État de l'environnement, avant toute mesure

| Fait | Mesure |
|---|---|
| Runtime edge | redémarré à **14:54:33 UTC** (16:54 local) — soit **après** la dernière modification de disque des six fichiers du lot (la plus récente : `generate-household-meal-v1/index.ts`, 16:51:17 local) |
| Sonde `docker logs` avant | **aucune génération d'une autre lane** en vol — uniquement les crons `process-llm-retry-jobs`, `trigger-topic-compaction`, `process-checkins` |
| Les six fichiers de production du lot | **byte-identiques à HEAD** (`git diff --numstat HEAD` vide sur chacun) — je ne mesure donc pas du code étranger non commité sur ce chemin |

⛔ **Correction d'un chiffre du rapport L8-A** : son §9 ① annonce
`with_pace = 0 | 65` sur `household_members`. À 16:57 la base dit
**`with_pace = 4 | 66`** : une population a été posée entre-temps (sans doute par
l'un des trois agents qui ont calé). Sur `student_goals`, en revanche, le chiffre
tient : **zéro sur soixante-treize**.

Les quatre bouches déjà porteuses d'un cran :

| Prénom | Foyer | Naissance | Objectif | Cran (kg/sem) | Compte | Corps |
|---|---|---|---|---|---|---|
| Paul | `4123e479` « Vidal » | 1988-03-10 | `fat_loss` | 0,5 | oui | 162 cm / 55 kg |
| Nina | `4123e479` « Vidal » | 1992-02-20 | `muscle_gain` | 0,4 | oui | 170 cm / 85 kg |
| **Tom** | `4123e479` « Vidal » | **2014-09-15 (onze ans)** | `fat_loss` | 0,3 | non | 145 cm / 36 kg |
| ZoeL5B | `58abb20a` | 1990-05-04 | `fat_loss` | 0,3 | non | oui |

⚠️ **Ceci est une FIXTURE, et je le dis comme tel.** Elle n'a pas été produite par
un usage : aucun écran n'écrit encore le curseur (le port a été livré le matin
même). Tout chiffre de dimensionnement mesuré ci-dessous est un chiffre **de
fixture**, pas un chiffre de population.

🕓 *Sections 1 à 5 en cours d'écriture.*
