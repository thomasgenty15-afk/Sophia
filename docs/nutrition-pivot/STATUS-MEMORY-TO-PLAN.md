# Boucle mémoire → génération de plan — statut au 2026-08-06

Branche `dewhatsapp`. **Codé, testé, éprouvé en run réel sur la base locale. NON DÉPLOYÉ.**

Suite directe de [STATUS-WEEK-REVIEW.md](./STATUS-WEEK-REVIEW.md), point 4 des restes ouverts.

---

## Le trou, mesuré

Le bilan hebdomadaire demande *« qu'est-ce qui a rendu ça difficile ? »*. L'élève répond
*« je travaille de nuit trois fois par semaine »*. Le memorizer l'extrait proprement. Le
recall le ressort en conversation. Et le plan composé le lendemain **ne le sait pas**.

La cause n'était pas le memorizer. C'était la largeur de la porte : le pont
mémoire → `practical_constraints` ne regardait qu'une seule clé de domaine,
`sante.alimentation`. Sur le corpus local, ça laissait dehors exactement les blocages qui
décident du plan :

| Souvenir | Clés | Visible avant ? |
|---|---|---|
| « Travaille de nuit trois fois par semaine. » | `travail.charge`, `sante.sommeil` | **non** |
| « Shares kitchen with 4 flatmates; batch cooks on Sundays. » | `habitudes.environnement`, `habitudes.planification` | **non** |
| « Prend son repas principal vers 16h avant de partir travailler de nuit. » | `sante.alimentation` | oui |

Les deux premières décident de tout ce qu'on peut raisonnablement proposer à manger. Elles
n'atteignaient jamais le prompt.

---

## Ce qui a été fait — et ce qui a été refusé

**Fait : la porte s'élargit, le mécanisme ne bouge pas.**
`PROMOTABLE_DOMAIN_KEYS` = `sante.alimentation` + `travail.charge` + `habitudes.environnement`
+ `habitudes.planification` + `sante.activite_physique`.

Le critère n'est pas « ça parle de nourriture » mais **« ça décide QUAND, OÙ ou COMBIEN cet
élève peut cuisiner et manger »** :

- `travail.charge` — postes de nuit, semaine de rush : les fenêtres de repas ;
- `habitudes.environnement` — cuisine partagée, pas de four, télétravail : le lieu ;
- `habitudes.planification` — batch cooking le dimanche, jour de courses : le rythme ;
- `sante.activite_physique` — jours d'entraînement : le placement des repas.

**Refusé, et le test le verrouille des deux côtés** : `sante.medical` (le dur a sa table,
`student_safety_constraints`, synchrone et sans ranking), `psychologie.*` et `relations.*` (la
carte deviendrait un journal intime, et « ma sœur est allergique » un piège à confondre les
deux couches), `sante.sommeil` / `sante.energie` (ce sont des **résultats** — ceux que le bilan
hebdomadaire mesure — pas des contraintes), `addictions.*`, `objectifs.*`, `habitudes.execution`
et ses voisines.

**Refusé aussi : une seconde liste parallèle.** C'était le premier réflexe (`life_constraints`
à côté de `food_preferences`). Deux listes auraient dupliqué l'origine, le `dismissed`, la
réconciliation et la vue datée — quatre mécanismes qui divergent. Ce qui a tranché est une
mesure, pas une opinion : ces quatre clés font passer **3 souvenirs de plus sur le corpus
réel, et les trois sont des blocages réels. Zéro faux positif.** L'argument d'origine du module
(« pas une liste élargie au cas où — `habitudes.execution` remonterait des souvenirs vrais mais
hors sujet ») reste vrai pour les clés qu'il visait, et ne l'était pas pour celles-ci.

**Refusé enfin : brancher `memory_items` directement sur les générateurs.** Le « Keep » de
l'élève reste obligatoire. `memory_items` est un magasin probabiliste (confiance, ranking,
statut `candidate`), et ce dépôt a la cicatrice : la seule trace qu'une allergie laissait était
un item `candidate`. Confirmer transforme une inférence en fait déclaré — et rend la chose
éditable et évitable.

---

## Le piège PostgREST, trouvé avant qu'il ne morde

La requête de l'écran passait de « porte cette clé » à « porte au moins une de ces cinq ».
En PostgREST ce n'est pas le même opérateur :

```
.contains("domain_keys", KEYS)   // cs — les porte TOUTES
.overlaps("domain_keys", KEYS)   // ov — en porte AU MOINS UNE
```

`contains` sur une liste de cinq exigerait qu'un souvenir soit à la fois alimentaire,
professionnel, environnemental, planifié et sportif — c'est-à-dire **aucun**. Le filtre aurait
**vidé** la carte au lieu de l'élargir, et rien du côté TypeScript ne l'aurait dit : le
typecheck passe, les tests des deux côtés passent, l'écran est simplement vide.

---

## La preuve, bout en bout

`docs/nutrition-pivot/qa-web/W2_memory_to_plan_real_run.ts` (rejouable, n'écrit rien en base).
Élève réel, souvenirs réels :

```
1.   requête de l'écran (ov)          → 2 souvenirs   (avant l'élargissement : 1)
1bis même requête sous RLS, JWT élève → 2 souvenirs, aucune fuite cross-élève
2.   ce que la carte propose          → les 2, datées
3.   l'élève garde                    → practical_constraints.food_preferences
4.   ce que le modèle voit            → vue datée, origin/dismissed retenus côté serveur
5.   le prompt RÉEL de generate-meal-v1 :

     what they have told you about their eating, in their own words:
     - 2026-08-05 — Prend son repas principal vers 16h avant de partir travailler de nuit.
     - 2026-08-05 — Travaille de nuit trois fois par semaine.
```

Le pas **1bis** n'est pas décoratif : `service_role` **contourne** la RLS, donc le pas 1 prouve
que l'opérateur marche, pas que l'écran de l'élève y a droit. La policy est
`auth.uid() = user_id`, qu'un appel service_role n'exécute même pas — c'est la cicatrice
`auth-uid-null-under-service-role`, dans l'autre sens.

**Tests** : 1227 verts côté `_shared/keel/` (dont 4 neufs sur la promotion), 322 côté frontend
(dont 7 neufs). `foodPreferences.int.test.ts` est le garde-frontière entre les deux runtimes :
il lit le module Deno sur le disque et compare les clés, le plancher de confiance, les statuts
et le plafond. Il vérifie aussi que **chaque clé existe dans la taxonomie** — une faute de
frappe (`travail.charges`) ne casse rien, elle ne matche simplement aucun souvenir, pour
toujours, en silence.

> Un défaut trouvé en écrivant ce garde : l'extracteur cherchait le premier `[` après le nom de
> la constante et tombait sur l'annotation de type `: readonly string[]`. Il rendait une liste
> **vide**, et deux listes vides sont toujours égales — un garde-frontière vert quoi qu'il
> arrive. Corrigé, et il refuse maintenant une extraction vide.

---

## Ce qui reste ouvert

1. **Rien n'est déployé.** Aucune migration dans ce lot (le pont existait, seule sa largeur
   change). Fonctions concernées au déploiement : `generate-meal-v1`, `generate-week-plan-v1`
   (elles importent le module modifié), plus le frontend.

2. **Le « Keep » reste un clic.** C'est architectural et assumé. La carte est directement
   au-dessus de `MealBuilder` sur `/app/plan` — donc sur le chemin de la génération — et elle
   annonce le nombre en attente quand elle est repliée (« 3 things you have told me · 2 waiting
   for you »). Un élève qui compose un repas passe devant. **Non éprouvé au navigateur** : les
   cinq serveurs de dev de ce dossier appartiennent à d'autres sessions, et prendre la main sur
   l'un d'eux aurait déconnecté leur élève. Le chemin authentifié a été prouvé sans le
   navigateur (pas 1bis).

3. **Le délai est d'un cron.** Le memorizer tourne quotidiennement : une raison donnée le
   dimanche soir devient proposable le lendemain. C'est cohérent avec le reste, mais ça veut
   dire que la boucle n'est pas immédiate — et qu'un élève qui compose sa semaine dans la foulée
   du bilan ne verra pas encore sa propre phrase.

4. **`eating_rhythm` et la prose peuvent se contredire.** Vu dans le prompt réel : le bloc
   structuré dit *« They have not told us their rhythm, so this is the default assumption »*
   (petit-déjeuner / déjeuner / dîner) pendant que la ligne gardée dit *« repas principal vers
   16 h avant de partir travailler de nuit »*. Le modèle reçoit les deux. En pratique la prose
   datée gagne, mais la vraie réponse serait que garder une ligne de rythme propose de remplir
   `EatingRhythmCard` — non fait, et c'est une décision produit.
