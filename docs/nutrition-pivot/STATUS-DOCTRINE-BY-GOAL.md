# STATUS — une doctrine écrite, N doctrines servies

Branche `dewhatsapp`. Journal: [`PROGRESS-DOCTRINE-BY-GOAL.md`](PROGRESS-DOCTRINE-BY-GOAL.md).
**Rien n'est déployé** — local uniquement, comme l'exige §8.2.

---

## Le test qui porte le lot

> *« Deux élèves du même coach, objectifs différents : même voix, conseils
> différents, et aucune croyance ciblée ne franchit la frontière. »*

Joué contre le vrai modèle et la vraie base. Même coach (Marlow), même doctrine
publiée, même question — la seule différence entre les deux élèves est leur
ligne `student_goals`.

**Amara — `fat_loss`**
> Two weeks isn't a plateau. On this coach's frame, **the scale is the slowest
> signal; waist, energy, strength, and sleep usually move first.**
>
> Keep the **anchor meal**: protein at lunch and vegetables at lunch […]

**Nina — `recomposition`**
> You've been at it for two weeks and the scale hasn't budged. […]
>
> Marlow doesn't use calorie counting. He builds the plate: **protein anchor**,
> vegetables for volume, starch on the side — and **on training days, he wants
> you to eat more than you think you need.**

Même coach nommé, même vocabulaire (`anchor`), même interdit tenu. Aucune trace
de la croyance `fat_loss` chez Nina, aucune trace de la croyance
`recomposition` chez Amara.

**Le contre-factuel**, sans lequel la démonstration ne vaut rien: la même
question, une élève `recomposition` neuve, et la **même croyance rendue
globale** —

> Ten days isn't a plateau, it's a Tuesday. **The scale is the slowest signal;
> I'd look at your waist, your energy, your strength, and your sleep** […]

La phrase arrive. C'est donc bien la **portée** qui la retenait, et pas le
modèle qui n'en voulait pas.

---

## Les trois chiffres demandés

### 1. La fragmentation du cache — mesurée, pas supposée

Lue en base après une publication réelle (`D3`, requête sur
`coach_doctrine_compilations`):

| Doctrine | Variantes compilées | Entrées de cache distinctes | Réutilisation |
|---|---|---|---|
| **Sans aucune portée** (tout l'existant) | 6 | **1** | 5/6 |
| Marlow: 2 croyances + 1 arbitrage ciblés sur 3 objectifs | 6 | **3** | 3/6 |

```
goal          | hash     | len
default       | 6aa9daa2 | 1654
fat_loss      | cfe36bfb | 1851
health        | 6aa9daa2 | 1654   ← identique à default
maintenance   | 6aa9daa2 | 1654   ← identique à default
performance   | 6aa9daa2 | 1654   ← identique à default
recomposition | 56cd7dca | 1698
```

**La fragmentation ne suit pas le nombre d'objectifs, elle suit le nombre de
portées DISTINCTES que le coach a réellement écrites.** Un objectif qu'aucune
portée ne vise retombe exactement sur la `default` — même texte, même hash,
même entrée de cache. Un coach de 200 élèves sur trois objectifs occupe donc au
pire trois blocs, chacun sollicité par des dizaines d'élèves : rentable. Et un
coach qui n'a rien ciblé ne paie **rien** de ce lot.

Le chiffre est requêtable à tout moment, et rendu par `publish`:

```sql
select count(*) as variantes, count(distinct compiled_prompt_hash) as entrees
from public.coach_doctrine_compilations where doctrine_id = $1;
```

#### Le hash n'est pas salé avec l'objectif — et c'est la raison du chiffre

§3.2.1 exige qu'une variante ne puisse jamais recevoir la clé d'une autre. Un
hash de **contenu** le tient par construction : deux textes différents donnent
deux clés différentes, sans qu'aucun appelant n'ait à y penser. Saler la clé
avec l'objectif ferait exactement l'inverse de l'intention : les six variantes
identiques du tableau ci-dessus recevraient six clés distinctes et paieraient
six fois la relecture du même bloc — on garderait la lettre de l'exigence en
cassant sa raison d'être (§3.2.3).

L'identité de la variante voyage donc ailleurs, là où elle sert vraiment :
`CompiledDoctrine.goal`, et la trace de chaque tour.

### 2. La variante par défaut — la décision

**`default` = noyau + entrées de portée vide, et rien d'autre.** Elle sert dans
les trois cas où il n'y a pas d'objectif d'élève : l'élève qui n'a pas encore
rempli `student_goals`, le coach en mode test, un chemin non conversationnel.

La raison est asymétrique et c'est voulu : un élève sans objectif déclaré n'est
pas un élève de **tous** les objectifs. Lui servir une croyance écrite pour la
perte de gras lui prêterait un but qu'il n'a jamais énoncé. Il reçoit donc le
global, et rien d'autre — vérifié en réel (D2).

`'default'` est stocké comme un **jeton nommé**, pas comme NULL : NULL ne peut
pas entrer dans une clé primaire et forcerait un index partiel plus un cas
particulier dans chaque requête.

Le **mode test** échappe à la règle sur demande : `goalOverride` côté chargeur,
`preview_goal` sur `compile`, `goal` sur `replay`. C'est précisément ce qu'un
coach veut éprouver avant d'exposer un élève. L'omission de l'option donne le
chemin normal — jamais un repli.

### 3. L'effet mesuré sur le verrou des interdits (§4)

Le défaut connu : le verrou **détruit des réponses honnêtes** (une explication
d'un interdit, puis un récap fondé, remplacés par une ligne hors sujet). N
variantes multiplient mécaniquement les occasions de le déclencher.

**Mesure sur les 14 tours joués en réel, dont les 4 tours les plus exposés
(« explique l'interdit », puis « récap ») sur les deux variantes :**

```
D1 — detruites_par_le_verrou | reponses  →  0 | 8
D2 — detruites_par_le_verrou | reponses  →  0 | 6
```

**Zéro réponse détruite.** Et ce que l'élève lit à la place est la position du
coach, pas un refus :

> **Marlow doesn't use calorie counting.** It's when people turn food into a
> score and try to manage intake by numbers; he prefers building the plate […]

La raison structurelle, et elle est plus forte que le chiffre :
`findDoctrineViolations` **ne prend pas d'objectif**. L'ensemble des règles du
verrou est donc identique pour les six variantes, et une variante ne peut pas
se retrouver avec moins de règles qu'une autre. Une portée écrite sur un
interdit est **ignorée** par le compilateur — vérifié par test sur les six
variantes. La portée ne peut pas désarmer une ceinture, quel que soit le nombre
de variantes.

---

## Ce qui a été construit (§6)

| # | Demandé | Livré |
|---|---|---|
| 1 | Migration: portée + stockage des compilés | `20260805110000_doctrine_by_goal.sql` — CHECK jsonb sur `beliefs`/`arbitrations`, table `coach_doctrine_compilations`, RPC de remplacement atomique. Appliquée en local, **validée sur les doctrines existantes**. |
| 2 | Compilateur pur et testé | `doctrine.ts` — `compileDoctrineBlock(doctrine, goal)`, `compileAllDoctrineVariants`, `doctrineCacheFootprint`. 20 tests dédiés. |
| 3 | Sélection au tour, **trois** consommateurs | Dans le **chargeur**, pas chez l'appelant. Les trois passent par lui; les deux générateurs passent en plus par `doctrineBeliefsFor` (voir le trou trouvé ci-dessous). |
| 4 | Invalidation totale à la republication | `keel_replace_doctrine_compilations` remplace le **jeu entier** en une transaction. Dépublier emporte les variantes de la version retirée. Vérifié en réel: 0 ligne survivante. |
| 5 | UI | `/coach/doctrine` refait: formulaire éditable + partie spécifique par dynamique + aperçu par objectif. |
| 6 | Rétrocompatibilité prouvée | Une doctrine sans portée compile **octet pour octet à l'identique** pour les six variantes — test dédié, plus la mesure 6→1 en base. |

### 🔴 Le second trou, fermé sur retour : le mapping n'atteignait personne

`coach_food_rules` avait son écran (`/coach/protocol`), ses gardes de schéma et
un compilateur couvert par trente tests — et **aucun lecteur au runtime**. Un
coach cochait ses trente pastilles, et `generate-meal-v1` composait ses plats
sans rien en savoir. Sa méthode alimentaire ne gouvernait que l'écran sur lequel
il l'avait écrite.

`_shared/keel/protocol_loader.ts` la charge et la compile **à la lecture** —
comme `doctrine_loader.ts` fait pour la doctrine depuis le début, parce que le
compilateur est pur. Attendre la publication vers `plan_commitments` (item 5 du
lot voisin, non livré) aurait laissé le mapping muet jusque-là.

Conséquence directe : **`foods.recommended` disparaît de la doctrine.** « Avec
quoi je construis » se disait à deux endroits — ici en texte libre, et sur
`/coach/protocol` en postures sur le vocabulaire fermé. Deux listes qui disent
la même chose divergent, et le coach ne sait plus laquelle son agent lit. C'est
le mapping qui gagne : c'est lui que la photo compare et que l'évaluateur note.

`foods.discouraged` **reste**, et ce n'est pas une symétrie ratée : il porte des
`surface_forms`, et c'est cette liste que le verrou déterministe matche dans la
prose générée. Le vocabulaire fermé ne sait pas faire ce travail —
`other_added_fat` n'est pas une phrase qu'un modèle écrit, « huile de tournesol »
si.

Mesuré en réel (D4) : le bloc arrive dans le prompt avec le **mot du coach** à
la place du slug (« green volume », pas `leafy_greens`), son « pourquoi » voyage
avec la règle, la portée par objectif mord ici aussi, et les huit plats générés
ne contiennent aucun groupe exclu tout en reposant sur les groupes encouragés.

### 🔴 Le trou que le lot a fermé en chemin

`generate-week-plan-v1` et `generate-meal-v1` **ne lisent pas le bloc** : ils
lisent la liste de convictions, pour tracer chaque ligne produite. Non filtrée,
elle bâtissait le plan d'un élève `health` sur une conviction écrite pour
`fat_loss`. La portée aurait tenu dans la conversation et fui dans le plan —
la forme exacte de la cicatrice « la doctrine ne gouvernait qu'une lane sur
trois », par la porte de derrière. `doctrineBeliefsFor(loaded)` rend exactement
ce que le bloc contient.

---

## L'écran

Refait après retour en cours de lot. **Deux parties, ni plus ni moins.**

* **La doctrine s'édite, elle ne se redemande pas.** Le contenu écrit remplit
  ses propres cases, et ces cases sont la source : ce que le coach tape est ce
  qui est stocké, sans modèle entre lui et sa base. Corriger une phrase ne
  demande plus de refaire l'interview entière. L'interview passe dessous et
  redevient le chemin du premier jour.
* **Globale** — croyances et cas durs sans portée, plus la voix, les mots, les
  interdits, les aliments et les Q/R. Une phrase le dit à l'écran : ces
  quatre-là ne sont **jamais** ciblés.
* **Spécifique par dynamique** — un sélecteur, un compteur par dynamique, et
  des champs directs pour les croyances et les cas durs de cette dynamique.
  Pas de portée multiple à cocher, pas de cinq colonnes vides.
* **L'interview est une option qu'on ouvre**, pas un formulaire qu'on croise.
  Dépliée tant qu'il n'y a rien d'écrit — c'est alors la seule porte — repliée
  derrière un lien dès qu'il y a une doctrine. Elle reste ouverte juste après
  une compilation : c'est le moment où le coach vérifie que l'IA l'a bien lu.
* **L'aperçu par objectif a été retiré**, et les fonctions qui le produisaient
  restent (avec leurs tests) dans `api/coachDoctrine.ts`. Deux raisons : le bloc
  est reçu par l'**agent**, pas par l'élève — le présenter comme « ce que reçoit
  ton élève » ferait croire à un coach que ses élèves lisent un prompt système ;
  et d'une variante à l'autre, ce qui bouge tient en deux ou trois lignes au
  milieu d'un bloc identique, donc le coach faisait un diff à l'œil. S'il
  revient, il devra dire « ton agent » et montrer ce qui **diffère**.

---

## Le gantelet (§7)

| Épreuve | Résultat |
|---|---|
| Suites Deno (`_shared/`, `sophia-brain/`) | **2940 passed, 0 failed, 38 ignored** |
| Suite front (`tsc -b` + `vitest`) | **276 passed, 20 skipped** |
| Gardes de schéma, base réelle | G0–G9, **toutes mordent** (portée valide acceptée, hors vocabulaire refusée, non-tableau refusé, variante inconnue refusée, RLS armée, `anon` sans SELECT) |
| **Épreuve de réel** (D1) | **7/7** |
| **Passe adversariale** (D2) | **12/12** |
| **Aller-retour de l'écran** (D3) | **13/13** |
| **Le mapping atteint l'assiette** (D4) | **10/10** |

Passe adversariale, cas par cas — chacun vérifié d'abord sur le **bloc servi**
(lu par le vrai `loadPublishedDoctrine` contre la vraie base), puis en
conversation :

* doctrine sans aucune portée → comportement identique à aujourd'hui ✅
* entrée portée sur un objectif **inexistant** → l'entrée n'atteint **personne**,
  et le coach le lit dans `issues` ✅
* élève **sans** `student_goals` → variante `default`, noyau seulement ✅
* élève qui **change d'objectif** entre deux tours → la variante suit dès le tour
  suivant, la mémoire de conversation survit ✅
* **coach en mode test** → il choisit la variante ✅
* deux élèves du même coach, objectifs différents, **dans le même intervalle** ✅
* **FR et EN** ✅
* doctrine **republiée** entre deux tours → le tour suivant lit la neuve ✅

---

## Les arbitrages à connaître

**La direction de l'échec sur une portée illisible.** Un jeton inconnu est
**gardé**, pas lâché. Le lâcher viderait la portée, donc la rendrait globale,
donc enverrait la croyance ciblée à toute la cohorte — silencieusement. Gardé,
il ne matche aucun objectif : l'entrée n'atteint personne, et le coach le lit.
Une croyance muette est un défaut visible ; une croyance servie au mauvais élève
ne se voit que le jour où le coach lit la conversation.

**« Vide pour cet objectif » ≠ « pas de méthode ».** Un coach qui écrit tout
sous une dynamique laisse les autres sans rien. Le repli injecté n'est alors pas
« on n'a pas pu lire la méthode de ton coach » — ce serait faux, et un prompt
qui affirme une cause fausse la fait ressortir mot pour mot. Un bloc dédié le
dit correctement (`NO_DOCTRINE_FOR_THIS_GOAL_BLOCK`), et l'aperçu prévient le
coach avant qu'un élève ne le découvre.

**Hors périmètre, corrigé et déclaré.** `rollback` perdait `foods` et `qa`
depuis toujours : un « retour en un clic » retirait deux sections entières au
coach sans rien lui dire. Deux lignes, dans une fonction que ce lot modifiait
déjà.

---

## Ce qui reste ouvert

* **L'écran n'a pas été ouvert dans un navigateur.** Cinq serveurs de dev
  occupent le plafond du dossier, tous appartenant à d'autres sessions ; se
  connecter sur l'un d'eux aurait écrasé leur état d'authentification (profil de
  navigateur partagé). Prouvé à la place : `tsc` vert, `vite build` vert, 17
  tests sur la logique pure de l'écran, aller-retour complet contre la vraie
  fonction edge. **À ouvrir avant de livrer.**
* **Une entrée à portée multiple** (seule l'IA en produit) apparaît dans la
  partie de chaque dynamique qu'elle vise, et l'éditer dans l'une l'édite pour
  toutes. C'est correct — c'est une seule entrée — mais l'écran ne le dit pas.
* **Le coach n'a plus de moyen de voir le bloc compilé** depuis son écran, l'
  aperçu ayant été retiré. C'est assumé pour l'instant ; la capacité serveur
  existe toujours (`preview_goal` sur `compile`, `goal` sur `replay`) et le
  `replay` — rejouer un échange passé sous une variante choisie — reste la
  bonne forme de vérification à câbler, parce qu'il montre une **réponse**
  plutôt qu'un prompt.
* **La langue de la réponse ignore `voice.language`** : le modèle répond en
  anglais à une question française quand la locale de l'élève est anglaise.
  Antérieur à ce lot et hors périmètre, mais il fausse toute lecture de
  transcription FR — noté ici parce que la prochaine QA tombera dessus.
* **`coach_doctrine_compilations` est hors export RGPD élève, délibérément** :
  la table ne porte aucune colonne d'élève, seulement la prose du coach, et elle
  disparaît en cascade avec la doctrine. C'est écrit ici pour que la question ne
  se repose pas (cicatrice « le lifecycle RGPD ne réclame pas les tables
  neuves »).
* **Rien n'est déployé.** `functions deploy`, `db push` et les secrets restent
  interdits (§8.2).
