# Chantier C — brancher les entrées de composition de repas

Repo : `/Users/ahmedamara/Dev/Sophia 2`. Docs d'autorité : `docs/keel/MODEL.md`,
`docs/keel/CONTRACT.md`, et la fiche `docs/fonctionnalites/composition-des-repas/FF-030-le-contexte-de-composition.md`
(volet coach écrit, **volet élève à écrire — c'est ta première tâche**).

Tout ce qui suit est **vérifié dans le code le 2026-08-08**. Ce qui est
hypothèse est marqué comme tel.

---

## 1. Le constat

Le générateur de repas écrit de vrais plats, avec de vrais ingrédients et une
liste de courses. **Cinq entrées que le produit collecte ne l'atteignent
jamais.** Mesuré : zéro occurrence dans `supabase/functions/generate-meal-v1/index.ts`.

| entrée | où elle est collectée | état |
|---|---|---|
| contraintes dures (allergies) | `student_safety_constraints` | chargées, mais passées **seulement** au verrou de sortie |
| `height_cm` | `/app/plan` → Basic info | colonne + écran + commentaire « sert aux portions ». **Zéro lecteur.** |
| `birth_date`, `gender` | `/app/plan` → Basic info | ajoutés le 2026-08-08. Zéro lecteur. |
| poids, tour de taille | `weekly_reviews.biofeedback` | le générateur ne lit jamais cette table |
| `focus_axis` | `/app/plan` → Your goal | zéro occurrence |

Conséquence : **pour dimensionner une portion, le moteur a le nombre de
personnes et la taille du repas. Rien sur le corps.**

### Le cas le plus grave : les allergies

`generate-meal-v1` appelle bien `loadStudentSafetyConstraints`, mais ne passe le
résultat qu'à `parseGeneratedMeal` — c'est-à-dire au **verrou de sortie**. Le
modèle compose sans savoir.

Et le verrou est binaire. Dans `meal_generation.ts` :

```ts
dishes:           clean ? dishes : [],
preparations:     clean ? preparations : [],
cooking_sessions: clean ? cookingSessions : [],
shopping_list:    clean ? finalShopping : [],
```

**Un seul plat qui touche l'allergène et toute la semaine est vidée.** Pour un
plat.

Les deux autres lanes injectent déjà les contraintes dans leur prompt :
`week_plan_generation.ts:467` et `sophia-brain/router/run.ts:2239`, toutes deux
via `safetyConstraintsPromptBlock` (`_shared/keel/safety_constraints.ts:222`).
Le générateur de repas est le seul à ne pas l'avoir.

---

## 2. Les arbitrages — TRANCHÉS par le propriétaire le 2026-08-08

Ne les rouvre pas, applique-les.

1. **Les contraintes dures entrent dans la consigne, en tête.** Le verrou reste
   la ceinture ; il cesse d'être le seul informé.
2. **Le corps entre** : taille, poids **actuel**, âge, sexe. C'est ce qui
   dimensionne une portion.
3. **La cible chiffrée reste dehors** — `target_weight_kg`, `target_waist_cm`.
   Le nombre ne change pas ce qu'on met dans l'assiette, et un modèle qui lit
   « vise 72, en pèse 98 » raisonne en écart, en déficit et en délai : le
   terrain d'énergie que `CONTRACT.md` clôture. **La direction passe déjà** via
   le jeton `goal` (`fat_loss` = ça descend, etc.), et **`focus_axis` doit
   passer** — sans lui, `performance` et `health` n'ont aucun indicateur.
4. **Sous `restriction_flag`, ni taille ni poids ne partent dans la consigne.**
   Le plancher TCA vaut aussi pour ce que le modèle lit, pas seulement pour ce
   que l'écran affiche. Âge et sexe restent : ils ne se visent pas.

---

## 3. Ce qu'il faut faire, dans l'ordre

### 3.1 Écrire le volet élève de FF-030 — AVANT le code

La fiche existe, son volet coach est écrit. Ajoute le volet élève : l'inventaire
ci-dessus, les cinq trous, les quatre arbitrages, et la structure d'injection
ci-dessous. Onze sections obligatoires (`docs/fonctionnalites/TEMPLATE.md`).

C'est la règle du dépôt, et elle paie : c'est en écrivant l'inventaire coach
qu'on a trouvé que 36 % du bloc doctrine était de la matière conversationnelle.

### 3.2 La structure d'injection

```
== HARD CONSTRAINTS — THESE WIN OVER EVERYTHING ==   ← NOUVEAU, en tête
== <COACH>'S METHOD ==                                inchangé
== <COACH>'S FOOD MAPPING ==                          inchangé
== THE CONVICTION KEYS YOU MAY NAME ==                inchangé

== THIS STUDENT ==
-- WHO THEY ARE --            taille, âge, sexe            ← NOUVEAU
-- WHAT THEY ARE AFTER --     goal + focus_axis + situation ← axe NOUVEAU
-- WHERE THEY ARE NOW --      dernier poids, tour de taille ← NOUVEAU
-- HOW THEIR DAY RUNS --      rythme + tailles              existant
-- WHEN THEY ARE NOT HERE --  away_days                     existant
-- WHAT THEY CAN COOK --      capacité (5 champs)           existant
-- WHAT THEY HAVE TOLD ME --  food_preferences (≤20)        existant
-- THIS TIME --               context + envie + pantry + servings

== WHAT IS IN SEASON WHERE THEY ARE ==                inchangé
```

**Durable et daté séparés**, et c'est le point de la restructuration :
aujourd'hui tout est mélangé sous `== THIS STUDENT ==`, et une contrainte d'une
semaine se lit comme une propriété permanente.

### 3.3 Les paramètres sont REQUIS, jamais optionnels

`meal_generation.ts` documente cette règle **trois fois**, et elle a été payée
trois fois. Extrait, sur `eatingRhythm` :

> Optionnel, il serait ré-oublié par le prochain appelant, en silence, et la
> seule preuve serait une journée trouée.

`safetyConstraints`, le corps et l'axe se passent donc en `T` ou `T | null`
explicite — jamais `T?`. C'est ce qui a rattrapé `awayDays` la semaine dernière :
le compilateur a listé les appelants.

### 3.4 Les tests — un par garantie

Sans test nommé, une garantie se désarme au passage suivant. Le dépôt l'a payé
sur `no_cook_days`, `cooks` et `height_cm`.

- une allergie déclarée **apparaît** dans la consigne ;
- taille et poids **absents** de la consigne sous `restriction_flag`, âge et
  sexe présents ;
- le **nombre** cible n'apparaît nulle part, l'axe oui ;
- l'âge est **dérivé** de `birth_date`, jamais un champ stocké.

⚠️ **Le jumeau côté écran suit.** `frontend/src/keel/api/mealGeneration.ts`
duplique le parseur, et le dépôt exige les mêmes cas des deux côtés — c'est la
règle de `grocery_waves.ts` / `groceryWaves.ts`. Un jumeau sans test est
exactement ce qui a laissé passer le bug du rythme.

---

## 4. Ce que ce chantier NE fait pas

- ❌ **La projection « en combien de temps ».** Décidée, mais c'est une
  fonctionnalité à part, avec son plancher de sécurité : la copie affichée sous
  le champ de cible dit déjà « **Nothing counts down, and nobody is scored
  against it** », et une date de rendez-vous la contredirait. Elle se calcule
  côté produit (arithmétique, aucun appel modèle), s'affiche en **allure** et
  non en date, jamais sous `restriction_flag`, et sur `/app/progress` — pas dans
  le plan. À écrire comme fiche, pas à glisser ici.
- ❌ **La variante « composition » du bloc doctrine.** C'est le volet coach de
  FF-030, déjà spécifié, et c'est un autre lot.
- ❌ **Toucher au stockage du poids.** Un chantier A séparé le fait
  (`scratchpad/PROMPT-A-mesures-par-mesure.md`). Ici on LIT ce qui existe, où
  que ce soit.
- ❌ **Aucun appel modèle supplémentaire.** Tout ce chantier est du câblage.

---

## 5. Contraintes du dépôt — non négociables

1. **Commandes interdites sans validation humaine** : `supabase db push`,
   `db reset`, `functions deploy`, `secrets`, `link`. Hook bloquant. Donne la
   commande exacte à l'utilisateur.
2. **Base locale partagée** — jamais de `db reset`. Migration par
   `docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres < f.sql`,
   puis enregistrer la version dans `supabase_migrations.schema_migrations`.
   **Vérifier les collisions avant de nommer un fichier** :
   `ls supabase/migrations/*.sql | sed 's|.*/||; s/_.*//' | sort | uniq -d`.
   Une autre session en a déjà causé une.
   *(A priori ce chantier n'a besoin d'aucune migration : tout existe déjà.)*
3. **Tests Deno** :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
   ⚠️ `--no-check` **masque les erreurs de type** : lancer aussi
   `deno check` sur les fichiers touchés. C'est comme ça que 8 tests sont passés
   au rouge sans prévenir la semaine dernière.
4. **Typecheck frontend** : `cd frontend && npx tsc -b`
   (`tsconfig.json` est un fichier de solution qui ne vérifie rien).
5. **Une autre session commite dans ce dépôt** avec `git add -A` et a déjà
   balayé du travail étranger dans ses commits, deux fois. Commiter tôt, par
   chemins explicites.
6. **Deux tests rouges préexistants** : `src/edge/coverage-guard.int.test.ts`
   réclame `keel-daily-recommendation-v1` et le trigger
   `student_daily_recommendations_set_updated_at`. **Pas ton travail.**
7. **Travail non commité en attente** au moment d'écrire ce brief : ~19 fichiers
   modifiés et 8 nouveaux (fenêtre de réglages, grille des repas, `KitchenToday`,
   deux migrations). Vérifier `git status` avant de commencer.

---

## 6. Par où commencer

1. Lire FF-030 en entier — le volet coach donne le gabarit du volet élève.
2. Lire `safety_constraints.ts` (`safetyConstraintsPromptBlock`) et voir comment
   `week_plan_generation.ts:467` l'utilise. Copier ce placement, pas en inventer
   un autre.
3. Écrire le volet élève de la fiche.
4. Puis câbler, en commençant par les contraintes dures — c'est le seul des cinq
   trous qui coûte une semaine entière à l'élève quand il se déclenche.
