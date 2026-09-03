# KEEL — LE MODÈLE

> **Lis ce fichier avant d'écrire une ligne de copie, de prompt ou de schéma côté élève.**
> Il n'y a qu'une règle ici, et tout le reste en découle. Elle a été re-expliquée à la main
> assez de fois pour mériter d'être écrite : c'est ce fichier, pas la conversation, qui doit
> répondre à la question la prochaine fois.

---

## LA RÈGLE

> ### Le coach ne produit **RIEN** de personnel pour un élève.
>
> Pas de plan. Pas de menu. Pas de message. Pas de correction. Rien qui porte le nom d'un
> élève et qui soit sorti des mains du coach.

Ce n'est pas une limitation temporaire qu'on lèvera plus tard. C'est le produit. Un coach a
50 à 500 élèves ; s'il devait écrire quelque chose par élève, il n'y aurait pas de produit.

---

## CE QUE LE COACH ÉCRIT (collectif, jamais nominatif)

| Artefact | Où | Fonction |
|---|---|---|
| **Sa doctrine** — ses convictions sur la façon dont on doit manger, interdits compris | `coach_beliefs` | `coach-doctrine-v1` |
| **Son programme** — un modèle de plan, écrit une fois | `plan_templates` | `plan-template-v1` |
| **Ses recettes** | bibliothèque recettes | `coach-recipe-image-v1` |

Ces trois choses s'adressent à **la cohorte**. Aucune ne mentionne un élève.

Le coach **lit** en retour : la synthèse du lundi (`coach-synthesis-v1`), agrégée. Il lit, il
n'écrit pas en réponse. **Il n'existe aucun canal 1:1 coach → élève** — ni table, ni fonction,
ni écran. Vérifié : aucune fonction edge de message coach→élève n'existe.

## CE QUE L'ÉLÈVE COMPOSE (personnel, jamais écrit par le coach)

L'élève dit ce qu'il vise (`student_goals` : objectif + situation), et Sophia **applique la
doctrine du coach** à cette vie-là pour composer ses repas : `generate-meal-v1` →
`student_generated_meals`, sur une fenêtre de 1 à 7 jours (`MAX_WINDOW_DAYS`). L'écran est
`/app/plan`, qui héberge le constructeur de repas.

L'autorité du coach n'est pas affaiblie, elle **change de canal** : elle passe par la doctrine
(interdits inclus, avec leur double verrou) et par le contenu du programme.

### La mémoire du plan a DEUX sources et TROIS destinations (2026-09-03)

Ce que Sophia retient d'une personne pour composer vient de **deux sources** — le retour écrit
sur le **brouillon** d'un plan, et le **bilan** de fin de plan — et va dans **trois
destinations** sans recouvrement : les **préférences alimentaires** (par personne : un aliment
ou une préparation qu'on ne sert plus ou qu'on veut revoir), les **indices** (portion,
capacité, rapidité, variété — des positions sur des échelles fermées, internes, bougées par une
question posée et jamais par une phrase), et **« ce que Sophia sait »** (le reste, par
personne, daté, cité, effaçable). Un encart « pour le prochain plan » vit jusqu'à la
**validation** du plan suivant. **Le chat ordinaire n'y écrit rien.** La sécurité (allergies,
régimes, médical) est hors de tout ça, dans ses tables. Autorité :
**[docs/keel/NOMENCLATURE-MEMOIRE.md](NOMENCLATURE-MEMOIRE.md)** §2 ; les exemples de routage
que les bancs testent sont au §8.

### ⚠️ CE QUE LE RETRAIT DE LA LANE DE SEMAINE A COÛTÉ (2026-08-19)

Jusqu'au 2026-08-19, ce paragraphe décrivait une autre chaîne :
`generate-week-plan-v1` → `student_week_plans`, en `draft`, que l'élève **adoptait**. Elle
produisait des **lignes de conduite**, pas des plats, et **chaque ligne nutrition portait la
conviction du coach dont elle dérivait** (`source_belief_key`) — pas décorativement : **la base
REFUSAIT** la ligne qui ne la nommait pas (CHECK `student_week_plans_doctrine_traceable_check`,
migration C1).

Cette lane a été retirée parce qu'elle était **inatteignable** : ni `generateWeekPlan` ni
`adoptWeekPlan` n'avaient d'appelant, donc aucun élève ne pouvait produire une ligne ni
l'adopter. Les 246 lignes en base étaient des comptes de test, à l'unité près.

**Le trou que ça laisse, et il est réel :** le produit n'a plus d'objet où une consigne nomme
la conviction qu'elle applique et où la base refuse celle qui ne la nomme pas.
`student_generated_meals.generated_from.belief_keys` porte la provenance du **plan entier**,
jamais celle d'une **ligne**, et aucun CHECK ne l'exige — c'est écrit dans le dépôt lui-même
(`_shared/keel/meal_generation.ts` : *« Informatif… Jamais exigé, jamais vérifié par un
CHECK »*). **La traçabilité par ligne n'existe plus.**

Ce qui reste en place, exprès : la **table** `student_week_plans`, ses quatre CHECK, sa policy,
et ses **cinq lecteurs** — `coach_synthesis_io.ts` (la synthèse du lundi),
`hunger_signal_io.ts` (`countSatietyAdaptations`), `following_io.ts`
(`resolveStudentFollowing`, 3ᵉ branche), `account-export-v1` (export RGPD), et
`api/weekPlan.ts` → `TodayPage`. Aucun ne régresse : le rôle de *signal* — « cet élève suit
quelque chose » — avait déjà été repris par `student_generated_meals` au commit `99697610`.
C'est le rôle de *producteur* qui n'a pas de repreneur.

Il y en avait un **sixième**, retiré dans le même lot : `StudentWeekPlanPage.tsx` lisait la
table sans jamais utiliser le résultat — mais son `.error` pouvait faire tomber la page.

---

## CE QUE ÇA INTERDIT, CONCRÈTEMENT

Ce sont les fautes réelles, celles qui ont déjà été commises dans ce repo.

**1. Toute copie qui fait attendre l'élève.**
`/app/today` a affiché pendant des semaines *« Your coach is putting it together — you don't
have anything to do until then »*. C'est faux et c'est le pire message possible : ça dit
« attends » à quelqu'un dont c'est le tour. Un écran vide côté élève doit toujours porter la
sortie — vers `/app/plan`, où il compose sa semaine.

**2. Tout badge « écrit par ton coach » sur une ligne d'élève.**
La ligne a été écrite par Sophia à partir d'une conviction du coach. Ce qu'on montre, c'est la
**dérivation** : la ligne, puis la conviction dessous, citée. Pas une signature qui mentirait.

**3. Toute notion d'adhérence à une prescription individuelle.**
Sans prescription individuelle, « l'élève a-t-il suivi ce qu'on lui a prescrit » n'a pas
d'objet. L'évaluateur KEEL est **débranché, pas supprimé**. Ce que le coach lit le lundi :
**couverture · vivabilité · portions · intentions**.

**4. Tout écran coach qui demande un geste par élève.**
Si une fonctionnalité coach ne passe pas à 200 élèves, elle est hors modèle.

---

## LE CHEMIN 1:1 EXISTE ENCORE DANS LE CODE — NE LE SUPPRIME PAS, NE LE CONFONDS PAS

Il reste dans le repo une chaîne complète de **prescription individuelle**, héritée du modèle
d'avant :

```
plan_templates → plan-publish-v1 → plan_versions → plan_commitments
                                        ↓
                                   /app/today     (seul lecteur restant)
      /coach/import · /coach/templates            (écrivains, routes sans lien)
```

Elle **fonctionne**, elle est **gardée exprès**, et elle n'est **pas le modèle**. Deux erreurs
symétriques à ne pas commettre :

- **La supprimer** parce qu'« elle contredit le modèle ». Elle est le mode 1:1, qu'on retrouve
  en replanifiant trois jobs. Voir la mémoire *verify-before-delete*.
- **La prendre pour le modèle** parce que c'est la seule chaîne qui a des écrans. C'est
  exactement le piège dans lequel `docs/keel/CONTRACT.md` faisait tomber tout le monde en
  s'ouvrant sur « the coach authors the plan » — corrigé, mais le code, lui, garde la forme
  de l'ancien modèle.

**Trou refermé le 2026-08-05.** `/app/today` ne lisait que `plan_versions` — que, par la règle
du haut, aucun coach ne publie. Un élève pouvait composer toute sa semaine et lire « tu n'as pas
encore de plan » tous les jours. L'écran lit maintenant, **quand il n'y a pas de plan publié**,
les deux choses que `/app/plan` écrit réellement :

- `student_generated_meals` — les **plats** (`MealBuilder`), bornés par la fenêtre que la
  ligne PORTE (`starts_on`, `duration_days`, `ends_on`, depuis
  `20260807090000_meal_plan_window`). Avant cette migration la table n'avait aucune date et un
  plat ne nommait qu'un jour de semaine (`tue`) : la fenêtre était alors DÉDUITE de `created_at`,
  à trois endroits différents, et la déduction devenait fausse dès qu'un plan pouvait commencer
  plus tard.

  **Un élève peut avoir DEUX plans vivants** : celui d'aujourd'hui et celui qu'il a préparé pour
  plus tard. « Le suivant devient le courant » n'est pas un événement — ce sont les mêmes lignes
  avec `today` avancé d'un jour, donc aucun cron, aucun statut, rien qui puisse cesser d'être
  écrit. Une contrainte d'exclusion garantit que deux plans vivants ne partagent jamais un jour ;
- `student_week_plans` — la semaine de **méthode**, `status='adopted'` uniquement (générer n'est
  pas adopter).

Ce que ça n'autorise toujours pas : coller un score, une case ou un compteur sur ces lignes.
Personne n'a rien prescrit. Et un **plat** ne cite jamais la doctrine (un dîner n'est pas une
leçon), là où une **ligne de méthode** la cite exprès — c'est une lecture de la conviction du
coach, et elle doit rester jugeable.

`/app/meals` **est déjà sorti** de ce piège (2026-08-05) et sert de modèle : il affichait une
semaine de repas placés jour par jour via `meal_plan_entries` — donc une composition par élève,
hors modèle — et la table a été supprimée (`20260804210000`). L'écran lit maintenant la
**bibliothèque de recettes actives du coach**, sans placement : un artefact collectif, lu par
l'élève, que le coach écrit une fois. C'est la bonne forme.

---

## D'OÙ ÇA VIENT

Décision du **2026-08-03**, encadré d'amendement en tête de
`docs/nutrition-pivot/PLAN-NUIT.md` (points 1 à 3). Ce fichier-ci en est la forme lisible :
l'amendement était enterré dans un plan de nuit de 2000 lignes que personne n'ouvre, ce qui
est précisément pourquoi la règle a dû être répétée à la main.
