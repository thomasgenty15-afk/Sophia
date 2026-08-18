# Spec — le régime alimentaire, par bouche, et dans le plan du foyer

> Ouverte le **2026-08-14** parce qu'un utilisateur a demandé deux fois pourquoi
> la question « Comment vous mangez — Je mange de tout / Végétarien / Végane /
> Pescatarien » existe pour lui et pas pour la bouche qu'il a ajoutée.

## Le constat, mesuré — et il est plus large que la question posée

```
grep -c "diet" supabase/functions/generate-household-meal-v1/index.ts   →  0
grep -c "diet" supabase/functions/generate-meal-v1/index.ts             →  3
```

`dietary_regime.ts` — le moteur qui étend un régime en groupes exclus, écrit sa
ligne de prompt et nomme ce qu'il rend incouvrable — n'est importé **que** par
la lane individuelle.

| # | Fait | Conséquence |
|---|---|---|
| ① | **Le générateur de foyer ne connaît AUCUN régime.** Zéro occurrence. | Un maître **végane** qui compose pour son foyer reçoit de la viande. La question lui est posée, sa réponse est écrite, et **rien ne la lit** sur ce chemin-là. |
| ② | **Une bouche sans compte n'a nulle part où porter un régime.** Les trois jetons vivent sur `student_safety_constraints`, clée sur `user_id`. | Un enfant végétarien est **indéclarable**. C'est le trou que l'utilisateur voit. |

① est un défaut de sécurité alimentaire sur le chemin **majoritaire** du produit.
② est celui qu'on a demandé. **Les deux se ferment ensemble ou aucun ne sert** :
poser la question à une bouche dont personne ne lira la réponse serait pire que
ne pas la poser.

## Les arbitrages

| # | Décision | Pourquoi |
|---|---|---|
| **R1** | **Le régime d'une bouche vit sur `household_members.diet`**, comme `goal`, `birth_date` et `eating_rhythm`. | Le patron par-bouche existe et il est éprouvé. Une table à part pour une valeur scalaire d'une liste fermée serait une migration là où une colonne suffit. Retour arrière : `drop column`. |
| **R2** | **Pour une bouche AVEC compte, son « about you » fait autorité** — même règle que `goal` (D1), résolue **une seule fois**, dans `keel_household_roster_for`. | Deux vérités sur la même personne divergent. La règle existe, on la réutilise mot pour mot. |
| **R3** | **Un régime n'est PAS une préférence : c'est une ligne qu'on ne franchit pas.** Il ne passe donc **jamais** par la garde du texte libre ; il est une liste **fermée** de quatre jetons, validée en base. | La copie de l'écran le dit déjà : « Ça gouverne chaque plat qu'on compose. Une fois dit ici, c'est dit. » |
| **R4** | **Le plat commun suit le régime le plus RESTRICTIF de la table.** Un omnivore peut manger un plat végétarien ; l'inverse est faux. | C'est l'exacte symétrie de l'union des allergies, déjà en place, et du critère de D6 — *une casserole peut toujours en donner moins, jamais plus qu'elle n'en contient*. |
| **R5** | **ET c'est un cas de DIVERGENCE**, au sens du barreau ② livré la veille. Quand descendre toute la table au régime le plus strict priverait quelqu'un de sa direction, la personne au régime différent reçoit son plat à elle — si le temps de cuisine le permet. | Sans ça, un seul végane impose le végane à six personnes, en silence. Avec, le refus est nommé et le temps arbitre. |

## ⛔ Ce que ce lot NE fait PAS

- **Il n'invente aucun moteur.** `dietary_regime.ts` sait déjà étendre un régime
  en groupes exclus et écrire sa ligne. On le **branche**, on ne le réécrit pas.
- **Il ne touche pas `student_safety_constraints`** ni la lane individuelle : le
  maître garde son chemin d'écriture actuel, et R2 dit qui gagne à la lecture.
- **Il n'ajoute aucun jeton de régime.** Quatre, fermés, ceux de l'écran.

---

## Le travail, dans l'ordre

### 1 · La colonne et la RPC
`household_members.diet text` (nullable, `check` sur la liste fermée).
`keel_household_set_member_diet(p_member, p_diet)`, gatée `auth.uid()` : le
maître pour toute bouche de son foyer, un compte réclamé pour la sienne.
Refus **en littéral** (`planRefusals.int.test.ts` ne lit que les littéraux) :
`not_authenticated` · `not_a_member` · `bad_diet` · `not_your_line`.

⚠️ **Migration appliquée par `docker exec supabase_db_Sophia_2 psql -U postgres
-d postgres -f <fichier>` puis inscrite à la main dans
`supabase_migrations.schema_migrations`. JAMAIS `db reset`** — base partagée.
Idempotente, rejouable. Vérifie `ls supabase/migrations | cut -c1-14 | uniq -d`
avant de choisir un numéro.

### 2 · Le roster tranche, une seule fois
`keel_household_roster_for` rend `diet`, résolu par R2 : `student_goals` /
`student_safety_constraints` pour une bouche avec compte, la colonne sinon.
Suis **exactement** ce que la fonction fait déjà pour `goal` et `eating_rhythm`.

### 3 · Le générateur de foyer honore les régimes — c'est le défaut ①
- L'union : le plat commun suit le **plus restrictif** (R4).
- Le bloc de prompt vient de `dietaryRegimePromptLine`, **pas d'une phrase neuve**.
- La divergence (R5) entre dans le calcul livré la veille — cherche
  `servingConflicts` / `distinctServingDirections` dans `household_portions.ts`
  et branche-toi dessus, ne double pas la règle.
- `plan_rationale.ts` **le dit** : « Le plat commun est végétarien : c'est ce que
  Christèle mange. » Un fait, jamais un reproche.
- Bump `HOUSEHOLD_PROMPT_VERSION`. Test d'égalité de chaîne : un foyer **sans
  aucun régime déclaré** rend un prompt **byte-identique** à celui d'avant.

### 4 · Les deux écrans
Réutilise les boutons existants (`DIET_ANSWERS`, `setup.people.diet*`) — ne
recrée pas la liste.
- **`/app/setup` étape 3** : sous chaque bouche, à côté de ses moments et de ses
  habitudes.
- **`/app/household`** : sur la fiche de la bouche, là où vivent déjà le corps,
  l'objectif et les habitudes.

⛔ **Ne commite JAMAIS `en.ts` / `fr.ts` / `catalog.ts` / `planRefusals.ts`** —
`fr.ts` n'existe pas dans HEAD (5017 lignes non commitées d'une autre session).
Les clés se posent **sur le disque**.

---

## Vérification

```
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env supabase/functions/_shared/keel/
cd frontend && npx tsc -b && npx vitest --config vitest.config.ts run
```

**Run réel obligatoire**, `docker restart supabase_edge_runtime_Sophia_2` d'abord.
Foyer `b9a92acb-6d78-4ebc-bc23-174d1b237ac5` : Thomas (`muscle_gain`) +
Christèle (`maintenance`). Il porte déjà un plan `2026-08-13 + 7 j` — prends une
fenêtre qui ne chevauche pas. Utilise `intent: "draft"` : **rien n'est écrit**.

**Les trois preuves, et il en faut trois :**
1. Christèle **végétarienne** ⇒ aucun plat commun ne porte de viande. C'est le
   cas qui PASSE.
2. Personne de déclaré ⇒ prompt **byte-identique** à celui d'avant le lot. C'est
   le désarmement.
3. Christèle **végane** + Thomas en prise de masse, temps suffisant ⇒ la
   divergence se voit, et `plan_rationale` la dit.

⚠️ Une garde qu'on n'a vue que refuser n'est pas vérifiée.

## Règles de séance

Branche `ff-001-quotidien-du-coach`. ⛔ `git add -A`, ⛔ `git stash`,
⛔ `--no-verify`, ⛔ `db push/reset`, `functions deploy`, `secrets set`.
`git commit --only <chemins>`. Messages **français, minuscules**.
