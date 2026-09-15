# 2026-08-12 17:00 — Le foyer : chaque bouche a un corps, et le référent a un écran

Lane **foyer**. Deux décisions produit prises par l'humain, livrées ici.

> Une mère vit avec ses deux enfants. **Elle** veut perdre du poids. **Eux non.**
> Une seule casserole.

---

## 0. En une page

**Le défaut réparé, mesuré dans le code avant d'écrire une ligne.**
`trunkSizing` prenait le MIN sur les enveloppes des seuls **adultes**, et la
boucle des deltas s'ouvrait sur `if (m.ageState !== "adult") continue;`. Dans le
foyer « une mère en `fat_loss` + deux enfants », elle est la seule adulte : la
casserole **était** une casserole de déficit, et les enfants la mangeaient
**sans aucun add-on**.

**Ce que le run réel montre**, sur ce foyer exact (4 bouches, 2 mineurs) :

| | tronc | bouches comptées dans le MIN | deltas |
|---|---|---|---|
| **avant** | 1369–1551 | 1 | **0** |
| **après** | 1369–1551 | 3 | **2** — Lea (8 ans) `+60 g` riz, Tom (11 ans) `+180 g` riz, tous deux au `plating` |

⚠️ **La bande du tronc ne bouge pas, et c'est le résultat juste.** Dans ce foyer
la mère a le plus petit besoin : elle **est** le MIN, avant comme après. Ce qui
change n'est pas la casserole, c'est que les enfants reçoivent enfin ce qui leur
manque. Dire que « le tronc est passé du déficit au MIN » aurait été faux ici.
Le tronc se déplace quand une bouche a un besoin **inférieur** à celui de
l'adulte le plus contraint — un tout-petit, typiquement (§6, question ouverte).

**Livré** : 1 migration, 3 modules moteur, 1 client d'API, 1 écran, 8 tests neufs.
**Rien n'est commité.**

---

## 1. Décision 1 — le compte maître déclare le référent

`households.reference_member_id` existait depuis le 2026-08-11, le moteur la
lisait, **rien dans l'app ne l'écrivait**. Elle valait `NULL` partout.

**Tranché : le compte maître seul, dans l'écran du foyer.** Les deux
alternatives sont écartées et le restent — le coach (aucun canal 1:1,
`MODEL.md`) et un référent **dérivé** d'une métrique ou d'un ordre d'objectifs
(déjà hors périmètre FF-043 §3 : combiné à la citation de la doctrine du
référent, il rendrait l'objectif d'un membre inférable par tout le foyer).

### `keel_household_set_reference_member(p_household, p_member)`

Refus nommés, dans l'ordre — même forme que `keel_household_detach_member` :
`not_authenticated` · `no_household` · `not_your_household` · `not_owner` ·
`not_a_member` · `minor_cannot_be_reference` · `age_unknown_cannot_be_reference`.
`p_member = null` = retour au défaut (le compositeur).

**Décidé, et c'est un choix : `unknown` est REFUSÉ à l'écriture.**
`referenceMemberId` filtre `!== "minor"`, donc `unknown` passait. Je le refuse
côté **écriture** parce que `goalApplies` le refuse déjà pour l'objectif, et que
deux gardes qui divergent sur le même état finissent par se contredire — celle
qui reste ouverte devient le chemin.

⚠️ **Mais `referenceMemberId` (la lecture) n'a PAS été durcie**, et l'asymétrie
est délibérée. La cascade `déclaré → composeur → null` est le **défaut** de
génération : refuser `unknown` là-bas laisserait sans référent tout foyer où
personne n'a de date, et le défaut « le compositeur » ne servirait plus à rien.
C'est exactement la forme que `student_age.ts` a déjà : `birthDateWritable`
refuse ce que `weekPlanAgeGate` laisse passer — *« on refuse d'enregistrer ce
qui est illisible pour que la garde de lecture n'ait jamais à arbitrer »*.

⚠️ **Le référent ne change PAS la taille de la casserole.** Il décide quelle
doctrine gouverne le tronc (`trunkSafety`) ; le dimensionnement reste le MIN de
`trunkSizing`. La copie de l'écran le dit en toutes lettres.

**L'écran** — `ReferenceMemberCard` (`HouseholdPage.tsx`), maître seul,
sélecteur limité aux **adultes**, libellé qui dit **qui** et jamais **pourquoi**,
aucun objectif nommé nulle part.

⚠️ **La carte ne s'affiche qu'à partir de DEUX adultes à table.** En dessous, la
cascade donne déjà la bonne réponse et l'écran n'apprendrait rien — ce serait un
réglage à une seule valeur, c'est-à-dire une inquiétude offerte sans
contrepartie. **Le foyer nominal du produit — un parent et ses enfants — ne voit
donc jamais cette carte.**

---

## 2. Décision 2 — chaque bouche a un corps, et une bouche sans objectif mange normal

### 2A. Où vit le corps — et pourquoi PAS sur `household_members`

Le lot devait poser `height_cm`, `weight_kg`, `gender` sur `household_members`.
**Sondé sur la base réelle avant d'écrire :**

```
grant : `authenticated` a SELECT sur public.household_members
policy: household_members_member_read — using (household_id = keel_household_of(auth.uid()))
sonde : un membre NON-MAÎTRE, sous son propre rôle, lit 3 lignes de son foyer
```

Une colonne `weight_kg` là-dedans aurait été **lisible par PostgREST, en clair,
par tout co-membre ayant un compte** : l'adolescent qui a réclamé son profil lit
le poids de sa mère. C'est le dégât exact que FF-047 existe pour empêcher, livré
par la porte de derrière.

**Retenu : une table à part, `household_member_bodies`, sans AUCUN grant à
`authenticated`.** L'alternative — `revoke select (weight_kg, …)` colonne par
colonne — marche et se défait toute seule : le premier
`grant select on public.household_members to authenticated` d'une migration
future rouvre tout, sans que rien ne le dise.

C'est aussi la forme que le domaine a déjà choisie pour un fait par bouche
(`household_member_allergies`) — **avec une différence qui est le tout** : une
allergie DOIT être lisible par le foyer (on sert à table), un poids ne doit
l'être par personne. D'où le grant que celle-ci n'a pas.

### Où mord « obligatoire »

`NOT NULL` sur `household_members` était impossible : **39 lignes existent, 29
sans compte, 0 avec un corps** (compté). Ça aurait exigé un **défaut
numérique** — un poids inventé sur une personne réelle, qui serait ensuite entré
dans une équation et ressorti en grammes dans une assiette.

L'obligation mord donc en trois endroits, et le premier est celui qui compte :

1. **la ligne est TOUT-OU-RIEN** — les trois colonnes sont `not null` *dans cette
   table*. Il n'existe pas de demi-corps : soit une bouche a taille + poids +
   sexe, soit elle n'a pas de ligne. Aucun lecteur n'a à s'en défendre ;
2. l'écriture refuse le partiel (`body_incomplete`) ;
3. l'écran exige les trois champs.

**Et il n'y a pas de backfill, parce qu'il ne peut pas y en avoir.** On ne sait
pas combien pèsent ces 29 bouches. Une bouche sans corps n'a pas d'enveloppe,
compte pour une part **standard** (jamais réduite) et ne pèse pas dans le MIN.
Le compte est **affiché en fin de migration** plutôt que tu.

**Bornes de plausibilité en base** (pas seulement à l'écran) : `30 ≤ height ≤ 260`,
`2 ≤ weight ≤ 400`. Larges exprès : elles refusent une faute de saisie (20 cm,
700 kg), pas un gabarit rare.

**`gender = 'other'`** → **moyenne des deux jeux de coefficients**, jamais un
repli sur `male`. Choisir serait assigner, et la décision porterait ici sur le
corps d'un enfant. Même arbitrage que `estimatedMaintenanceKcal` pour Mifflin.
Un sexe absent fait la même chose ; un test épingle l'égalité des deux.

### 2B. L'enveloppe pédiatrique

**⚠️ J'ai écarté l'extension d'`AgeBand` demandée par le brief, et voici
pourquoi.** Le brief demandait d'ajouter des tranches pédiatriques à `AgeBand`,
tout en avertissant de chercher d'abord tous les lecteurs. Je les ai cherchés, et
**deux chemins de production dépendent de `ageBandOf(x < 18) === null`** :

1. `meal_body.ts :: mealBodyBlocks` pousse `age band: …` **dans le prompt** dès
   que `ageBand` n'est pas `null`. Une valeur pédiatrique y ferait entrer un fait
   corporel de mineur — exactement l'interdit que ce lot maintient ;
2. `estimatedMaintenanceKcal` indexe `midAge: Record<AgeBand, number>` : une
   entrée pédiatrique de plus y ferait passer un enfant par **Mifflin-St Jeor**.

Un **type distinct** (`PediatricBand = "0_3" | "3_10" | "10_18"`) rend les deux
impossibles **au compilateur** plutôt qu'à la relecture. `ageBandOf` n'a pas été
touchée, donc **aucun lecteur existant ne change de comportement**.

**L'équation** — Schofield 1985, retenue comme référence de l'enfant par le
rapport conjoint **FAO/WHO/UNU « Human energy requirements » (2004)**, formes
**poids seul**, par tranche et par sexe. Citée en commentaire dans
`meal_envelope.ts`, et **avouée opérationnelle**, comme les plafonds de densité
de FF-039 R8.

- `CHILD_ACTIVITY_FACTOR = 1.6` — FAO range l'enfant scolaire modérément actif
  entre PAL 1,55 et 1,75 ; 1,60 est le bas de « modéré ». **Plus élevé que celui
  de l'adulte (1,5), et ce n'est pas un hasard.**
- `CHILD_GROWTH_ALLOWANCE = 0.01` — la croissance **nommée** plutôt que fondue
  dans le facteur : FAO la chiffre à ~1 % du besoin total après la première
  année. Un lecteur doit pouvoir voir qu'elle a été prise en compte, et de
  combien.
- **La taille est collectée et n'entre PAS dans l'équation pédiatrique.**
  Schofield publie aussi des formes poids+taille, réputées moins stables. La
  taille sert le chemin adulte (Mifflin la demande) et la plausibilité. Le dire
  évite qu'un lecteur croie à un oubli.
- Plancher protéique de l'enfant : **1,0 g/kg/j** (WHO/FAO/UNU 2007, « niveau
  sûr »). Ce n'est **pas** le 1,6–2,0 des dynamiques d'adulte, qui sert la
  rétention de masse maigre sous contrainte. Un enfant n'est sous aucune
  contrainte ici.

**⛔ Un mineur n'a JAMAIS d'objectif, et ce n'est pas un `if`.**
`childEnvelopeFromBody` **n'accepte aucun paramètre d'objectif**. Un `fat_loss`
écrit par le maître sur la fiche d'un enfant est **inerte**, pas ignoré par une
condition qu'on pourrait retirer. `densityCeiling: null`, `proteinPerMealG: null`
— aucune pression de minimisation sur l'assiette d'un enfant.

### La contre-épreuve pédiatrique — le cœur du lot

| | Schofield / FAO | Mifflin **forcée** (bande `18_29`) | écart |
|---|---|---|---|
| enfant 8 ans, 26 kg, 128 cm | **1769 kcal/j** | 1418 | **−351 kcal/j, −20 %** |
| enfant 12 ans, 40 kg, 150 cm | **1984 kcal/j** | 1585 | **−399 kcal/j, −20 %** |

Mifflin **rend `null`** pour un enfant (`ageBandOf(8)` est `null`) : le chemin
adulte est **fermé**, pas seulement découragé. La colonne « forcée » est ce
qu'un lecteur pressé aurait livré. Servir ça à un enfant de huit ans, c'est lui
prescrire une restriction en croyant lui servir un besoin normal — le préjudice
exact que ce lot ferme, retourné.

⚠️ Le test assertant cet écart porte sur un **seuil** (`> 15 %`), pas sur la
valeur mesurée : un test écrit contre sa propre constante reste vert quand on
change la constante.

### 2C. La résolution

- **`trunkSizing` prend le MIN sur TOUTES les bouches** ; `mouthsCounted` /
  `mouthsStandard` remplacent `adultsCounted` / `adultsStandard`, et l'issue
  `household_adults_without_envelope:` devient `household_mouths_without_envelope:`
  — elle comptait des adultes, elle compterait des gens en croyant compter des
  adultes.
- **La ligne `if (m.ageState !== "adult") continue;` a disparu** de la boucle des
  deltas.
- **`householdLaneMode`** : `dimensionable` ne teste plus `ageState === "adult"`.
- **Le paramètre est REQUIS, jamais optionnel.** `toHouseholdMember(member,
  accountEnvelope, lineBody)` prend le corps de la fiche en **3ᵉ argument
  positionnel obligatoire** : une fonction edge qui ne le passe pas **ne compile
  pas**. C'est le seul mécanisme qui recense les appelants — ce fichier a déjà
  payé « paramètre de garde optionnel = garde désarmée ».
- **Aucune enveloppe recalculée à la main.** `envelopeFor` a été **refactorisée**
  (extraction de `envelopeCore` sur primitives) : `envelopeFor` et
  `maintenanceEnvelopeFromBody` posent leurs gardes puis appellent **le même
  corps de fonction**. Une bande qui bouge bouge pour les deux.
- **`familyService` et `moment: "plating"` n'ont pas bougé** — les deux add-ons
  du run sortent bien en `plating`, un mineur étant à table.
- **Le verrou de lane est intact.** Un membre `per_portion` ⇒ toute la lane
  dégrade, aucune enveloppe, aucun delta, résultat indiscernable. Le test
  d'égalité de chaînes passe toujours, et la mutation M3 le prouve.

### La règle des deux sources — la garde la plus chère du lot

| Source | Ce qu'elle porte | Ce qu'elle achète |
|---|---|---|
| **le COMPTE** (`envelopeFor`) | série de pesées, plancher TCA, objectif | tout — **et elle gagne TOUJOURS, y compris dégradée** |
| **la FICHE** | taille, poids, sexe saisis une fois | une **MAINTENANCE**, jamais un objectif |

Une enveloppe `per_portion` du compte est **la décision du plancher TCA**, pas
une absence : retomber sur la fiche derrière elle **contournerait le plancher par
la porte de service**. La fiche n'achète qu'une maintenance parce que, sans série
de pesées, il n'y a **pas de plancher derrière** — et une maintenance ne peut ni
creuser un déficit ni poser un plafond de densité.

**Le delta d'un adulte sans objectif : maintenance** — c'est la décision
humaine, et elle tombe du même mécanisme. Un adulte **sans compte** et **avec**
un objectif reçoit lui aussi la maintenance : son objectif ne peut pas être
exécuté sans plancher. Un âge **inconnu** n'a **aucune** enveloppe : deviner
entre les deux équations serait choisir.

---

## 3. Ce qui a été mesuré

### La suite complète

```
deno test --allow-all --no-check supabase/functions/
→ 4789 passed | 0 failed | 66 ignored (43 s)
```

**Rejouée à 18 h 10 après la fermeture RGPD :** `4799 passed | 1 failed`, puis
`4791 | 10 failed` sur le run suivant — **et les deux comptes de tests
diffèrent**. Toutes les rouges sont dans `plan_energy_test.ts` (FF-059), un
fichier que je n'ai pas touché : `plan_energy.ts` a été écrit **une minute avant
le run** par une autre session (18:09:52, ma dernière écriture : 17:17). Ce n'est
pas une régression de ce lot, c'est une lane en cours d'édition à côté.

```
deno test --allow-all --no-check --ignore=…/plan_energy_test.ts supabase/functions/
→ 4779 passed | 0 failed | 66 ignored (48 s)
```

Lancée avec `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY`
(les exports QA empoisonnent la suite).

**Le typecheck de la suite échoue sur 27 erreurs QUI NE SONT PAS DE MOI**, et ce
sont exactement les deux zones annoncées : `stripe-reconcile-seats/reconcile*.ts`
(13+13 occurrences — `decideSeatQuantity` / `decideFromLedger` appelées sans
`interval`) et `log_protocol_event/contract.ts` (12+9). **Aucun fichier que j'ai
touché n'y figure.** Non réparées, non cachées.

Mes fichiers passent le typecheck séparément :
```
deno check generate-household-meal-v1/index.ts household_composition.ts meal_envelope.ts  → OK
npx tsc -p frontend/tsconfig.app.json --noEmit                                            → OK
npx vitest run src/keel/i18n src/keel/api/household                                       → 55 passed
```

### Les mutations — six mutations, six rouges, restauration verte

Un test vert ne prouve rien s'il ne mord pas.

| # | Mutation | Résultat |
|---|---|---|
| M1 | `trunkSizing` revient aux adultes seulement | 🔴 1 failed |
| M2 | `if (m.ageState !== "adult") continue;` remis dans les deltas | 🔴 1 failed |
| M3 | l'enveloppe du compte cesse de gagner quand elle est **dégradée** (contournement du plancher TCA) | 🔴 1 failed |
| M4 | l'enfant passe par **Mifflin** au lieu de Schofield | 🔴 1 failed |
| M5 | `other` retombe sur `male` | 🔴 1 failed |
| M6 | « pas de corps » rend l'enveloppe **dégradée** au lieu de `null` | 🔴 1 failed |

M6 mérite un mot : la différence coûte **tout le foyer**. Rendre `per_portion`
armerait le verrou de lane, et **une case de formulaire vide ferait dégrader la
composition de tout le monde**.

### Les migrations, appliquées DEUX fois

```
=== PASSE 1 ===
NOTICE:  privilèges: assertés (authenticated ne lit ni n'écrit la table des corps)
NOTICE:  household_member_body_and_reference: cas passants + 11 refus vérifiés sur un vrai foyer
NOTICE:  corps du foyer: 39 bouches, 0 avec un corps. …
COMMIT
=== PASSE 2 ===
NOTICE:  privilèges: assertés (authenticated ne lit ni n'écrit la table des corps)
NOTICE:  household_member_body_and_reference: cas passants + 11 refus vérifiés sur un vrai foyer
NOTICE:  corps du foyer: 39 bouches, 0 avec un corps. …
COMMIT
```

Version enregistrée dans `supabase_migrations.schema_migrations` (`20260812220000`).

**Chaque refus a son cas passant** — « une garde a besoin d'un cas qui passe »,
sinon on ne sait pas si l'on a gardé quelque chose ou tout bloqué. Le bloc de
contrôle joue les deux, sur un vrai foyer, puis annule tout.

**Une de mes propres assertions était fausse et l'a dit :** j'avais écrit
`select count(*) from keel_household_member_age(<uuid inexistant>)` pour prouver
qu'aucune ligne ne sort. Une fonction SQL **scalaire** en position `from` rend
**toujours** une ligne : le `count(*)` valait 1 des deux côtés et n'aurait rien
distingué. Corrigé en `is null`, qui lit la **valeur**.

**Les privilèges sont ASSERTÉS, pas relus** (section 8 de la migration) :
`authenticated` ne lit ni n'écrit `household_member_bodies`, `anon` non plus,
`service_role` lit, et ni `keel_household_bodies_for` ni
`keel_household_member_birth_date` ne sont exécutables par `authenticated` —
**l'âge exact ne sort jamais vers un navigateur**, le roster continue de ne
rendre que `minor | adult | unknown`.

### Le run réel — `generate-household-meal-v1`, appel Gemini compris

`docker restart supabase_edge_runtime_Sophia_2` avant le run (un fichier
`_shared` modifié n'est pas rechargé), puis le script Kong.

**Fixture** — foyer QA `4123e479` : Paul (maître, compte, `fat_loss`, 55 kg /
162 cm / femme / 38 ans, 3 pesées), Lea (8 ans, **sans compte**, 26 kg / 128 cm),
Tom (11 ans, **sans compte**, 36 kg / 145 cm), Nina (adulte, compte, `health`).
**`fat_loss` a été écrit sur la fiche de Lea, 8 ans, exprès** — pour prouver
qu'il est inerte.

```
HTTP 200 en 14,0 s
{"tag":"keel.household_meal.composition","mode":"per_kg","deltas":2,
 "family_service":true,"residual_gaps":[0,0,0]}

member_deltas:
  Lea (8 ans) → 60 g  white_rice, moment=plating, channel=more_of_the_same
  Tom (11 ans)→ 180 g white_rice, moment=plating, channel=more_of_the_same
```

**Ce qui est lu à voix haute à table** — aucun objectif, aucun corps, aucune
raison :

```
Paul : Take a generous pile of vegetables, a full portion of chicken, and a smaller scoop of potatoes.
Lea  : Take a child-size plate with a small scoop of chicken, potatoes and vegetables.
Tom  : Take a child-size plate with a small scoop of chicken, potatoes and vegetables.
Nina : Take a generous pile of vegetables, a balanced portion of chicken, and an even share of potatoes.
```

### La garde de 2D, prouvée en LISANT la chaîne

**① Le brief intégral envoyé au modèle** (le seul endroit où un corps entre dans
un prompt) :

```
HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.
Cook ONE set of preparations for everyone. Do NOT propose separate dishes.
For each person below, give a short serving instruction: how much of which
component goes on their plate, and which side is added or dropped.

- Paul: generous vegetables, full protein share, smaller starch share [height 162 cm; age band 30 to 44; gender female; weight 55 kg, measured week of 2026-08-10]
- Lea: child-size share of the same dish
- Tom: child-size share of the same dish
- Nina: generous vegetables, balanced protein and starch share [height 168 cm; gender female; weight 62 kg, measured week of 2026-08-10]

The bracketed facts are there for ONE thing: the SIZE of a portion. …
NEVER state a reason, a goal, a calorie count or anything about a person's
body in these instructions. They are read aloud at the table by the whole
household. Write what to serve, never why.
```

Les lignes de Lea et de Tom sont **exactement** celles d'avant le lot.

**② Les six chiffres corporels des deux enfants, cherchés un par un dans le
brief :**

```
✅ absent  Lea poids = 26      ✅ absent  Tom poids = 36
✅ absent  Lea taille = 128    ✅ absent  Tom taille = 145
✅ absent  Lea âge = 8         ✅ absent  Tom âge = 11
```

**③ La chaîne, lue et pas supposée** — `grep` exhaustif sur la fonction edge :

```
lineBodies        : 4 occurrences — la boucle de chargement, et l'UNIQUE appel à
                    toHouseholdMember. Aucune n'atteint un constructeur de prompt.
resolution.*      : 3 occurrences — issues (tableau serveur), un console.log
                    (compteurs + gaps SANS identifiant), memberDeltasPayload
                    (aliment + grammes, stockés).
```

⚠️ **La seule réserve, nommée** : `residual_gaps` part au log sous forme de
tableau de kcal **dans l'ordre des membres, sans identifiant**. Ce n'est pas un
log nominatif, et la forme n'a pas changé — mais depuis ce lot les mineurs y
figurent. Un lecteur qui aurait le roster à côté pourrait les aligner. Laissé
tel quel (c'est l'instrumentation d'A3, FF-043 §10) et signalé ici.

### Le test qui prouve qu'un objectif posé sur un enfant est IGNORÉ

Il ne compare pas des champs — il compare **deux empreintes d'enveloppe**
(`envelopeFingerprint`), parce qu'un test qui vérifie « la bande n'est pas celle
de `fat_loss` » laisse passer un plafond de densité ajouté six mois plus tard.
`fat_loss` sur la fiche d'un enfant et `null` produisent la **même chaîne**.
Rejoué en run réel : Lea porte `fat_loss` en base et reçoit `+60 g` de riz sur
une bande de **maintenance**.

---

## 4. Deux défauts trouvés PAR le run réel, et qui ne sont pas de ce lot

Le premier run a rendu `mode: per_portion`, `deltas: 0` — le lot avait l'air
inerte. Il ne l'était pas.

### Trou n°12 — un titulaire avec un objectif et SANS pesée dégrade TOUTE la lane

`envelopeFor` rend `per_portion` pour trois causes **indiscernables** (plancher
TCA, corps absent, poids inconnu) et `householdLaneMode` traite n'importe quel
`per_portion` comme le verrou de lane. **Nina** — compte, objectif `health`,
zéro pesée — faisait perdre tout dimensionnement au foyer entier, en silence.

L'indiscernabilité est **voulue** (FF-043 R2 : sinon le verrou devient un signal
qui désigne quelqu'un). Sa **conséquence sur le foyer** n'a jamais été décidée.
Non réparé : le réparer demanderait de distinguer les deux causes, c'est-à-dire
de rendre le plancher TCA observable. C'est une décision produit.

### Trou n°13 — la résolution de date D18 s'arrête au roster

`keel_household_member_age` résout `profiles.birth_date` puis la fiche du
maître (D18) ; `student_body_io.ts:162` ne lit que `profiles.birth_date`. Nina
est datée **par son maître** : elle est `adult` au roster (son objectif
s'applique, sa direction de service est écrite) et porte `ageBand: null` dans son
corps → **aucune bande d'énergie** → elle ne pèse jamais dans le MIN et ne reçoit
jamais d'add-on. Visible à l'œil nu dans le brief ci-dessus : sa ligne n'a pas
d'`age band`, celle de Paul si.

Les deux sont écrits dans le tableau des trous du README, **avec des numéros
neufs** — les numéros ne se réattribuent jamais.

---

## 5. RGPD — **la dette est réglée** (mise à jour 17 h 40)

> Ce qui suit était écrit comme « dette assumée » parce que
> `account-export-v1/index.ts` appartenait à une autre session. Elle a commité
> (`392e4a87`), le fichier est propre, **et la dette est fermée.**

**L'export.** `household_member_bodies` sort dans `mon_foyer.json`, sous
`mon_corps_pour_les_parts`, avec son allowlist de colonnes
(`SCOPE.householdMemberBody`).

⚠️ **La table n'a pas de `user_id`** — elle pend à `household_members.member_id`.
Elle est donc lue par `fetchRowsByIdChunks`, le chemin que le fichier avait déjà
pour `commitment_relations`, **et nourrie des `member_id` de
`householdMembership`** — c'est-à-dire d'une lecture déjà filtrée sur
`user_id = <lui>`, qui porte au plus une ligne
(`household_members_one_per_user`). Passer les `member_id` du **roster** aurait
mis le poids de ses enfants dans son archive : **une divulgation médicale sur des
tiers, servie par le droit d'accès de quelqu'un d'autre.** C'est le seul geste
qui aurait rendu ce lot pire que le trou qu'il ferme, et un test le garde.

**L'archive dit aussi ce qu'elle EFFACE.** Il y avait
`ce_qui_survit_a_la_suppression` et rien en face. Un export qui n'énumère que ce
qu'il garde laisse croire qu'il garde tout — et la taille et le poids sont le
seul endroit du foyer où la réponse est « non ». `ce_qui_est_efface` a été
ajouté.

**Un défaut pris au passage, dans le test de l'autre session.**
`household_export_test.ts` pinnait la purge en lisant
`20260811040000_household_detachment.sql` **en dur**. Ma migration
`20260812220000` **remplace** `keel_household_purge_user` : le test assertait
donc sur une définition que la base n'exécute plus — vert, et aveugle. Réécrit :
il balaie les migrations dans l'ordre et garde la **dernière** définition, en
journalisant laquelle. Sortie du run : `purge lue dans
20260812220000_household_member_body_and_reference.sql`.

### Prouvé

**Cinq mutations, cinq rouges, restauration verte :**

| # | Mutation | Résultat |
|---|---|---|
| M7 | la lecture est nourrie par le **roster** au lieu de sa propre ligne | 🔴 |
| M8 | le tri revient sur `created_at` (colonne inexistante ⇒ export **silencieusement vide**) | 🔴 |
| M9 | la purge n'efface le corps que dans **une** de ses deux branches | 🔴 |
| M10 | `weight_kg` sort de l'allowlist de colonnes | 🔴 |
| M11 | le corps disparaît de `mon_foyer.json` | 🔴 |

**Run réel de bout en bout** — `account-export-v1`, HTTP 200, ZIP téléchargé et
dézippé. Foyer où **trois** bouches ont un corps en base (Paul 55 kg, Lea 26 kg,
Tom 36 kg) :

```
mon_foyer.json → mon_corps_pour_les_parts : 1 ligne, poids [55]
                 ✅ un seul corps, le sien
member_id des deux ENFANTS dans toute l'archive :
                 mes_repas_generes.json uniquement (aliment + grammes, aucun corps)
fichiers.json  → tables_indisponibles = []   (rien n'est tombé dans le filet)
```

Et le contrôle sur `mes_repas_generes.json` : aucune des clés `height`,
`weight`, `poids`, `taille`, `gender`, `birth`, `age_years`, `body`.

**8 tests** dans `household_export_test.ts` (4 de l'autre session, 4 neufs), tous
verts.

### Ce qui reste du trou n°10 — et ce n'est plus de la dette de ce lot

Cinq tables de foyer restent hors de l'archive : `households`,
`household_invitations`, `household_food_restrictions`,
`household_member_allergies`, `household_envy_submissions`,
`household_billing_periods`. **La plus discutable est
`household_member_allergies`** — c'est une donnée de **santé**, elle n'a pas de
`user_id` (elle pend à `member_id`), et **le chemin que je viens d'écrire pour le
corps la ferait entrer telle quelle**. Nommé au README, pas fait : ce n'est pas
la lane de ce lot, et l'ouvrir sans décider ce qu'on dit d'une allergie
*d'autrui* serait recommencer la faute qu'on vient de fermer.

---

## 5 bis. RGPD — le texte d'origine (avant la fermeture)

**Fait, dès cette migration :** `keel_household_purge_user` **efface le corps**
d'un compte supprimé, dans ses **deux** branches (départ et détachement).

**Et c'est un arbitrage différent de celui de `birth_date`**, écrit dans la
migration : D3 a tranché que prénom et date **survivent** au détachement (ils
répondent à « pour qui je cuisine » et les effacer dégraderait la composition
d'un foyer que la personne quitte). Une taille et un poids, non — ce sont des
métriques d'une personne qui a **quitté le produit**. Le **détachement** (retrait
d'accès) garde le corps ; la **purge** (suppression du compte) l'efface.

~~**Dette assumée, avec son nom : l'EXPORT.**~~ **Réglée — voir §5 ci-dessus.**
Au moment d'écrire ces lignes, `account-export-v1/index.ts` était modifié par une
autre session (+102 lignes non commitées, qui ajoutaient justement
`household_members` à l'export) et y écrire aurait écrasé son travail. Elle a
commité depuis (`392e4a87`), et la fermeture a été faite dans la foulée.

---

## 6. Ce qui reste ouvert

1. **Les deltas n'ont toujours aucune surface.** Le run les produit (60 g, 180 g
   de riz) ; aucun écran ne les rend. C'est le bon ordre — le rendu d'une
   divergence à table est la partie qui demande le plus de soin.
2. **Un tout-petit tire le tronc vers le bas, et personne n'a mesuré ce que ça
   coûte.** Le MIN sur toutes les bouches garantit que le tronc ne dépasse le
   besoin de personne ; en contrepartie, plus la plus petite bouche est petite,
   plus la casserole commune rétrécit et plus les adultes mangent en add-on. À la
   limite, « une cuisson » devient « une petite cuisson et beaucoup de riz à
   côté ». `residualGaps` l'instrumente. **Aucun plancher n'a été posé** : un
   plancher inventé serait pire qu'un chiffre mesuré.
3. **Les 39 bouches existantes n'ont pas de corps**, et aucun backfill n'est
   possible. Elles reçoivent une part standard jusqu'à ce que leur maître
   saisisse. Compté et affiché par la migration.
4. **Aucune vérification navigateur.** L'écran (`ReferenceMemberCard`,
   `BodyFields`) compile et passe `tsc` + les tests d'API ; il n'a **pas** été
   ouvert dans un navigateur. C'est cohérent avec les quinze lots précédents du
   domaine (README, « ce qu'aucun lot n'a eu »), et c'est un état, pas une
   vérification.
5. **Le corps d'une bouche sans compte n'a aucun plancher TCA derrière lui.**
   Prix nommé du renversement. Rien ne lit une série de poids décroissants
   saisie par un maître pour un enfant — rien ne le voit, rien ne l'alerte.

---

## 7. Fichiers

| Fichier | Ce qui change |
|---|---|
| `supabase/migrations/20260812220000_household_member_body_and_reference.sql` | **neuf** — table des corps, 4 RPC, purge, privilèges assertés, contrôle rollbacké |
| `_shared/keel/meal_envelope.ts` | `envelopeCore` extrait · `MouthBody` · `maintenanceEnvelopeFromBody` · `PediatricBand` · `CHILD_BMR` (Schofield/FAO) · `childEnvelopeFromBody` |
| `_shared/keel/household_composition.ts` | `mouthEnvelope` · MIN sur toutes les bouches · deltas ouverts aux mineurs · `toHouseholdMember` à 3 arguments requis |
| `_shared/keel/household_composition_test.ts` | 8 tests neufs, 1 test **inversé** et nommé comme tel |
| `generate-household-meal-v1/index.ts` | lecture `keel_household_bodies_for` · `num()` (⚠️ `numeric` arrive en **chaîne** par PostgREST) · 3ᵉ argument |
| `frontend/src/keel/api/household.ts` | `setReferenceMember` · `loadMemberBodies` · `setMemberBody` · `HouseholdView.referenceMemberId` |
| `frontend/src/keel/pages/HouseholdPage.tsx` | `ReferenceMemberCard` · `BodyFields` |
| `frontend/src/keel/i18n/en.ts` | copie des deux blocs + 7 refus nommés |
| `docs/…/FF-043`, `FF-047`, `README` | renversements datés, §3/§4/§6/§11, trous 12 et 13 |

**Rien n'est commité.** `git status` était sale au départ (une autre session
travaille dans `account-export-v1/index.ts` et
`generate-household-meal-v1/index.ts`) ; mes changements sur le second sont
additifs et n'ont touché aucune ligne de la sienne.
