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
doctrine du coach** à cette vie-là pour composer sa semaine : `generate-week-plan-v1` →
`student_week_plans`, en `draft`, que l'élève lit et **adopte** ou non.

Chaque ligne alimentaire porte la conviction du coach dont elle dérive
(`source_belief_key`). Ce n'est pas décoratif : **la base REFUSE** une ligne nutrition sans
cette clé (CHECK, migration C1), et le prompt serveur le dit à la première ligne —

> *« Your coach teaches a method. They did NOT write a per-student meal plan, and you must not
> pretend they did. »*
> — `_shared/keel/week_plan_generation.ts`, `WEEK_PLAN_SYSTEM_PROMPT`

L'autorité du coach n'est pas affaiblie, elle **change de canal** : elle passe par la doctrine
(interdits inclus, avec leur double verrou) et par le contenu du programme.

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

- `student_generated_meals` — les **plats** (`MealBuilder`), fenêtrés sur la semaine en cours.
  La table ne porte pas de `week_start` et un plat ne nomme qu'un jour de semaine (`tue`), jamais
  une date : sans la fenêtre, le dîner du mardi d'une composition vieille de trois semaines
  s'afficherait comme le plat du jour ;
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
