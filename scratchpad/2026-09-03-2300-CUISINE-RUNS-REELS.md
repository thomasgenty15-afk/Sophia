# CUISINE — la fenêtre de run réel (2026-09-03, 21:08 → 23:00)

Instrument : `scripts/2026-09-03-1530-banc-retour-trois-portes.sh <anon> G4` — une
génération NUE de foyer sur 7 jours, pilotée par l'état SQL posé avant chaque run.
Compte : `qa-3portes@keeltest.dev` (foyer `43f791b3…`, Claire adulte + Tom + Léa mineurs).

⚠️ **Ce compte n'est pas sous mon tag `qa0903c`.** C'est la fixture du lot C, et je l'ai
réutilisée faute de banc solo : je l'ai mutée (style, courses, équipement, gamelle de Claire).
Nommé ici pour que personne ne relise ses mesures d'avant sans le savoir.

## Les huit ROUGE — attendu écrit AVANT / mesuré / écart

| # | attendu | mesuré | verdict |
|---|---|---|---|
| **R1** minimal + 1 course + congélateur | 1 session, 1 vague, 60 min | **1 / 1 / 60** | ✅ VERT |
| **R2** balanced + 2 courses | 2 sessions, 2 vagues, 60 min | **2 / 2** | ✅ VERT |
| **R3** keen + 3 courses sur 7 j | 3 sessions, 3 vagues | **3 / 3** | ✅ VERT |
| **R4** 1 course SANS congélateur | 2 sessions, **2 vagues**, refus nommé, 1 seule ligne congélateur | 2 sessions, **1 vague**, refus nommé, 1 ligne | ⚠️ VERT sauf les vagues — **mon attendu était faux**, voir §2 |
| **R5** solo « je déjeune dehors » (D6.1) | 5 midis absents | — | 🔴 aucun banc n'appelle `generate-meal-v1` |
| **R6** gamelle au prompt (D6.2) | `work_lunch {1,1}` | **{mouths:1, cold:1}**, `work_lunch_unreadable` DISPARU | ✅ VERT après correctif `90851b5c` |
| **R7** 320/1280 px, deux langues | — | — | 🔴 demande une session navigateur |
| **R8** `migration up` réel | contrôles 6/6 et 4/4 | tête `20260903190000`, colonnes + CHECK + port vérifiés | ✅ VERT |

## §1 — Ce que le run a TROUVÉ : D6.2 était mort en production

`.select("id, work_lunch")` sur `household_members`, **qui n'a pas de colonne `id`**.
PostgREST refusait, le `catch` fail-open avalait, le bloc ne partait jamais. Ligne écrite :
`issues:["work_lunch_unreadable"]`, compteur `{0,0}` alors que Claire déclare une gamelle.
Second identifiant fautif : `String(row.id)` ne correspond à rien dans `input.members`, keyés
par `member_id` — le bloc serait resté vide même avec la bonne projection. Corrigé `90851b5c`,
**prouvé** par R1/R2/R4 (`{mouths:1, cold:1}`, incident disparu).

⛔ **Et le test de câblage épinglait le mauvais littéral, en étant vert** : il recopiait la
faute de frappe. Des deux compensations du champ optionnel, **celle qui a tenu est celle qui
observe une SORTIE** (le compteur), pas celle qui relit une ENTRÉE (le test de source).

## §2 — Ce que le run a DÉMENTI : « nombre de vagues = sessions » est FAUX

L'invariant **C3** du prompt maître dit « nombre de vagues = sessions ». **Mesuré faux.**

| run | jours de session | dates d'achat | vagues |
|---|---|---|---|
| R2 (balanced) | `thu`, `sun` | 2026-09-03, 2026-09-04 | 2 |
| R4 (minimal) | `thu`, `sun` | 2026-09-03 | **1** |

**Jours de session IDENTIQUES, nombre de vagues différent.** Les vagues ne se déduisent pas des
sessions : elles se déduisent de la **conservation** de ce que le modèle a composé.
`buyOn = max(startsOn, cuisson − fenêtreCrue(groupe))` — un aliment à 3 jours cuit le dimanche
s'achète le jeudi (09-06 − 3 = 09-03) et rejoint la première vague ; un aliment à 2 jours
s'achète le vendredi et en ouvre une seconde.

**La règle vraie est `vagues ≤ sessions`.** Et ce n'est pas un défaut : quelqu'un qui demande
UNE course et dont tout se conserve obtient UNE course, même si le plan a besoin de deux
sessions — c'est plus fidèle à sa demande que l'inverse. Le plan le DIT :
« Une seule course, jeudi : tout ce que le plan demande tient jusqu'à sa cuisson. »

⚠️ **Mon attendu R4 « 2 vagues » venait de l'ANALYSE** (« 1 session = 1 vague, déduit »), pas
d'une lecture du module. J'ai recopié une phrase de document au lieu de lire `grocery_waves.ts`.
C3 est à corriger dans le prompt maître.

## §3 — Ce que le run a CONFIRMÉ, au-delà des compteurs

- **Le découpage des jours mangés est celui de mon algorithme.** Aujourd'hui est un **jeudi** ;
  les deux sessions tombent **jeudi + dimanche** = rang 0, puis `lead + floor(1×7/2) = index 3`.
- **Le défaut ③ est mort sur une ligne réelle.** L'explication dit « **Le plan pose** 2 sessions
  de cuisine : jeudi et dimanche » et **aucune** ligne ne dit « Tu cuisines… et c'est ce qui a
  été gardé ». La phrase sort **au cas nominal**, ce qu'elle ne faisait pas avant le correctif.
- **La phrase de timing d'A1 se rend** : « Courses et cuisson dès le matin, pour être prêt à midi. »
- **A1 cas (c)** : `timing {same_morning, starts_today}`, `lead_days = 0`.
- **Les deux bumps sur la ligne** : `meal.en.v26…` + `household.v23_the_lunchbox_travels`.
- **Le refus nommé de R4** : `issues: ["one_cooking_session_refused: no freezer declared"]`,
  et **une seule** ligne parle du congélateur — le doublon que je craignais n'existe pas.

## §4 — Ce qui reste ROUGE, avec sa cause

- **R5 (D6.1)** — `grep -c 'functions/v1/generate-meal-v1' scripts/*.sh` = **0**. Aucun banc du
  dépôt ne compose sur la lane solo, et écrire l'appel demanderait un mot de passe. Le CÂBLAGE
  est prouvé statiquement et sa mutation rougit ; l'EFFET n'est pas vu.
- **R7** — demande une session navigateur. Scénario complet consigné (`/tmp/cuisine-r7.md`),
  5 minutes pour un humain connecté.

## §5 — Le piège de poste, et il était de nous

Quatre premiers runs : quatre 502. Diagnostic exact sur le mécanisme (recréation, ni OOM ni
disque ni redémarrage) et **faux sur la cause** : j'ai conclu « le poste ». En réalité
`supabase functions serve` **surveille `supabase/functions/`** et recrée le conteneur à chaque
écriture — nos propres commits, et **mon propre `deno test` lancé depuis l'arbre principal**,
tuaient mes générations en vol. Sous gel : 4 runs, 4 × HTTP 200 (234 s, 206 s, 167 s).

**La leçon** : un diagnostic exact sur le MÉCANISME peut rester inutilisable s'il s'arrête avant
le DÉCLENCHEUR. Chercher qui écrit, pas seulement ce qui casse.
