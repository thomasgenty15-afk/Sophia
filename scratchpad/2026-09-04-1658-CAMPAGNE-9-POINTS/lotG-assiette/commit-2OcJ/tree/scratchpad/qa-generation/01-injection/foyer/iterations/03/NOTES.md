# Itération 03 — après les deux correctifs, re-mesurée

**Run** `ac79471a-0ac9-4bfc-85eb-bc34ce99997b` · `generate-household-meal-v1`
· **`gpt-5.4-mini`** · 2026-08-18 21:48:52 → 21:49:34 UTC (**36 s**, HTTP **200**)
· système 15 486 / utilisateur **15 105** car. (itération 02 : 14 160),
`truncated = false`, `written == chars == compteur indépendant` des deux côtés.

⚠️ **Cette requête porte DEUX appels modèle** : `generate-household-meal-v1` puis
`generate-household-meal-v1.protein_anchor_retry` (15 486 / 15 505 car.). Le vidage
ci-joint est celui du **premier**, choisi par `--source` et vérifié comme tel dans
l'en-tête du script. Bon à savoir pour l'instrument : sur cette lane aussi, un
`request_id` ≠ un appel.

## Les deux correctifs, et ce qu'ils ont changé au prompt

### 1 · Le prénom du maître atteint enfin la ligne que le prompt lit

`frontend/src/keel/pages/SetupPage.tsx` — `saveSelf()` appelle désormais
`setMemberName(ownMemberId, firstName)` en plus de `saveOwnProfile`.

| | avant (it. 01/02) | après (it. 03) |
|---|---|---|
| liste d'ids | `- Student = 5e61b4af…` | `- Sacha = 5e61b4af…` |
| brief de portions | `- Student: generous vegetables…` | `- Sacha: generous vegetables…` |
| apport fixe | `- Student: the evening tub (32 g)` | `- Sacha: the evening tub (32 g)` |
| pesée en boîtes | `That is 3 people to weigh out …: Student, Livia, Tino.` | `… : Sacha, Livia, Tino.` |
| `grep -c Sacha` prompt utilisateur | **0** | **4** |
| `grep -c Student` prompt utilisateur | **6** | **0** |
| `grep -c Sacha` sortie | 0 | **21** |

(Le tronc garde ses tournures génériques — `== THIS STUDENT ==`,
`=== THIS STUDENT'S HARD CONSTRAINTS ===` — qui ne nomment personne et n'entrent pas dans
ce compte.)

Le défaut : le champ « FIRST NAME — *How the plan names your serving* » écrivait
`profiles.full_name`, pendant que le roster (`keel_household_roster_for`) ne rend que
`household_members.first_name`. `keel_household_create` n'y recopie le premier mot du
`full_name` **qu'une fois**, et son commentaire le dit : « s'il renomme son profil plus
tard, son prénom au foyer ne suit pas ; **il le change au foyer** ». La porte existait
(`keel_household_set_member_name`, utilisée par `/app/household`) ; c'est `/app/setup` §2
qui ne l'appelait pas. Symptôme visible à l'écran : on tape « Sacha », on enregistre, on
revient — le champ réaffiche « Student ».

### 2 · « Il/elle mange dehors le midi » redevient écrivable

`frontend/src/keel/lib/presenceMarks.ts` — `workLunchPayload` émettait
`microwave: null`. `keel_household_set_member_work_lunch` refuse `bad_work_lunch` dès que
`jsonb_typeof(p_work_lunch -> 'microwave') <> 'boolean'`, et le `jsonb_typeof` d'un `null`
JSON vaut `'null'`. **Trois des quatre branches de la carte étaient donc mortes**, avec
« We could not read that answer. » à l'écran :

| geste | avant | après |
|---|---|---|
| « oui » (mode pas encore choisi) | `bad_work_lunch` | écrit `{at_work:true}` |
| « oui » + « gamelle » (micro-ondes pas encore répondu) | `bad_work_lunch` | écrit `{at_work:true, mode:lunchbox}` |
| « oui » + **« dehors »** | `bad_work_lunch` — **jamais écrivable** | écrit `{at_work:true, mode:outside}` |
| « oui » + « gamelle » + micro-ondes répondu | ✅ | ✅ (inchangé) |

Conséquence directe sur l'injection : `mode='outside'` est le **seul** mode qui produise
un effet (le pré-remplissage `away_days.kind='eating_out'` de la migration
`20260818120000` §3). Il était inatteignable par tout écran — et la grille à trois états
qui pourrait le poser à la main est de l'UI morte (**R-10**). La ligne #19 de la checklist
n'avait donc **aucun écrivain vivant**. Après correctif, la porte SQL a posé les cinq midis
et le bloc apparaît, **attaché à sa bouche** :

```
== A MEAL EATEN OUT IS NOT AN ABSENCE ==
- Livia: Tuesday lunch, Wednesday lunch, Thursday lunch, Friday lunch, Monday lunch
```

Le test qui affirmait l'ancienne forme (`presenceMarks.int.test.ts`, « le micro-ondes
n'existe QUE pour la gamelle ») **restait vert pendant que la base refusait ce payload
exact**. Il est corrigé et doublé d'un test qui vérifie la **présence des clés**
(`Object.keys`), pas seulement leurs valeurs — `toEqual` traite `{a: undefined}` et `{}`
comme égaux et aurait laissé repasser le défaut — **et qui porte un cas passant**
(`microwave: false` doit partir : `false` est une réponse).

### 3 · Difficulté et variété, saisies au passage

`recipe_difficulty = keen` et `variety = varied` posés par `CookingCapacityCard`
(`/app/plan`, section « HOW YOU COOK »). Le prompt les porte :
`recipe level they want: keen` · `repetition they accept: varied`. Les lignes #33 et #34
n'étaient pas remplies aux itérations 01-02 — leur absence n'était donc pas une rupture.

## Contrôles

- `npx tsc -b --force tsconfig.app.json` (depuis `frontend/`) — **exit 0**.
- `npm run test:int -- src/keel/lib/presenceMarks.int.test.ts` — **17 tests verts**
  (15 avant, +2 dont le nouveau).
- Vérification en base après chaque geste d'écran, jamais par confiance.

## La sortie, revérifiée

`138` → 0 · `165` → 0 · `cm` → 0 · `weight` → 0 · `kcal` → 0 · `calorie` → 0 · `BMI` → 0 ·
`peanut` → 0 · `allerg` → 0 · `mushroom` → 0 · `coriander` → 0 · `for_member_id` → 0
(`one_dish` respecté). **Aucun chiffre de corps d'enfant, nulle part.**

## Un constat de qualité, hors périmètre d'injection

Les `member_portions` de cette sortie ne portent **aucun gramme** (« a generous serving of
fish, vegetables and a smaller share of starch »), alors que le prompt l'exige mot pour mot
et deux fois : « Every one of those instructions carries a number and a unit », « "A
standard portion", "a balanced share" … tell nobody how much to put on a plate ». L'itération
02 les portait (« 180 g of the shared fish »). C'est une désobéissance du modèle, pas un
défaut d'injection : la consigne EST dans le prompt, mesurée. Elle appartient aux étapes
④/⑤ ; je la consigne sans la traiter.
