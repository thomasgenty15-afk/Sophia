# RAPPORT — FF-059 · Le chiffre affiché

**Date** : 2026-08-12 · **Lots livrés** : 1, 2 **et 3**
**Commits** : `ba903138` · `19f28a92` · le lot 3 et le foyer (voir §11)
**Fiche** : [FF-059](../docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md)

> ### ⚠️ AMENDEMENT DU 2026-08-12 — le lot 3 a été DÉBLOQUÉ par décision humaine
>
> Ce rapport a d'abord livré les lots 1 et 2 et laissé deux choses ouvertes :
> le chiffre par bouche dans un foyer, et la cible quotidienne. L'humain a
> tranché — « résous ces problèmes et passe au lot 3 » — et les deux sont
> désormais construits. Ce qui suit est le rapport complet ; les §§ 8.1, 8.2 et
> 7 portent la marque de ce qui a changé, et **le raisonnement d'origine y est
> conservé** : il explique pourquoi ces deux points étaient bloqués, et ce qu'il
> a fallu construire pour les débloquer plutôt que les contourner.

---

## 0. En une page

La décision du 2026-08-12 est appliquée, et elle est appliquée **derrière cinq
portes**. Un élève voit l'énergie de ses plats seulement si le plancher TCA est
baissé, s'il est majeur, si son coach n'a pas dit qu'on ne compte pas, et s'il a
lui-même allumé l'affichage — dans cet ordre, et la première porte n'est ouvrable
par personne. La **cinquième** porte, propre à la cible (niveau C), s'ouvre avec
son propre interrupteur et **prend en entrée le résultat des quatre premières** :
il n'existe aucun chemin vers une cible qui ne les traverse pas.

L'écart entre le chiffre affiché et un calcul de référence fait à la main est
**nul sur 5 plats sur 5** (§5). C'est attendu : c'est une table, pas un modèle.

**Les trois niveaux de la fiche sont livrés** :

| Niveau | Ce qui s'affiche | Porte |
|---|---|---|
| **A** — par plat | « ce plat : 537 kcal » | ①②③④ |
| **B** — par jour | « 813 kcal — 2 of 3 dishes counted », add-on du foyer compris | ①②③④ |
| **C** — la cible | « Around 2100–2500 a day for your weight » | ①②③④**⑤** |

**Ce qui a débloqué le foyer** : `member_portions` ne portera jamais la part —
c'est une **phrase**, et « kcal » y est banni. La divergence numérique vit
ailleurs, dans les `member_deltas` de FF-043, qui ne survivaient qu'à la réponse
HTTP de la composition. Ils sont désormais **gelés dans la trace du plan**, et le
lecteur reçoit **sa** part, add-on compris — jamais celle des autres. Détail :
§8.2.

Un défaut **trouvé en run navigateur** a été corrigé : le sous-titre de
`/app/plan` promettait « never calorie counts » **trois centimètres au-dessus de
trois chiffres** (§6.2).

---

## 1. État initial constaté — ce qui existait déjà, preuves à l'appui

| Élément | État réel | Preuve |
|---|---|---|
| Axe `counting` de la doctrine | ✅ existe, 3 positions | `doctrine_starter.ts:281-313`, jeton `count_calories` + 6 formes de surface + son `instead` |
| Attributs corporels | ✅ existent depuis le 2026-08-08 | `student_body_io.ts` — `heightCm`, `gender`, verdict d'âge, séries, **une seule requête** |
| `calorie_readout` suspendu | ✅ déjà dans la liste | `restriction_guard.ts:92` |
| Garde mineur | ✅ existe | `student_age.ts:199` `weekPlanAgeGate` — mord sur `status === "minor"` et rien d'autre |
| `stripMeasurementFacts` / prose | ✅ armé | `meal_analysis.ts`, union EN+FR de `nutrition_lexicon` |
| **Le moteur de calcul** | ✅ **existait déjà, entier** | FF-038/FF-039 : `food_composition.ts` (`resolveIngredients`, `nutrientsOf`), `food_composition_refs` (**911 lignes en base locale**), `foldPreparationsIntoDishes` |
| Le chiffre affiché | 🔴 nulle part | aucun appelant, aucun champ, aucun écran |

**Conséquence sur la construction** : ce chantier n'a eu à inventer ni le
référentiel, ni la résolution, ni le pliage des préparations. Il a écrit **la
porte** et **le chemin de sortie**.

### Le commentaire faux, corrigé

`frontend/src/keel/lib/weekInFood.ts:278` affirmait *« sans taille, âge, sexe ni
niveau d'activité (on ne les collecte pas) »*. Faux depuis le 2026-08-08 sur
trois des quatre. Corrigé, avec ce qui reste vrai (**seul le niveau d'activité
manque**, et c'est lui qui bloque le lot 3) et avec la raison pour laquelle la
phrase voisine — « l'élève ne voit JAMAIS ces nombres » — **reste vraie** : ces
nombres-là sont une cible sur le corps (niveau C), pas un fait sur la nourriture.

---

## 2. Ce qui a été construit

### Lot 1 — la chaîne de gardes

**`supabase/functions/_shared/keel/energy_gate.ts`** — module pur.

```ts
canShowEnergy(input: EnergyGateInput): { show: boolean; reason: EnergyGateReason }
```

Quatre portes, **dans l'ordre** :

| # | Porte | Entrée | Ferme si | Qui peut rouvrir |
|---|---|---|---|---|
| ① | plancher TCA | `restrictionFlag` | levé | **personne** |
| ② | mineur | `ageVerdict` | `status === "minor"` | personne |
| ③ | doctrine `counting` | `coachCounting` | `no_counting` | le coach |
| ④ | interrupteur élève | `studentSwitch` | éteint | l'élève |

Motifs : `open` · `restriction_floor` · `minor` · `doctrine_no_counting` ·
`student_off`. **Aucun booléen nu.**

Trois décisions qui portent la garde :

- **La porte ① n'est conjuguée à rien.** Son `if` ne prend aucun autre argument,
  et un test lit la source pour refuser un `&&` ou un `||` sur cette ligne.
- **Les quatre champs sont requis**, et la validation est **à l'exécution** en
  plus du type : un objet venu d'un JSON ou d'un `as` compilerait, et
  `undefined` se lirait « pas de plancher ». Une entrée incomplète **lève**.
- **La porte ③ lit le JETON `count_calories`, pas le choix de préréglage.**
  ⚠️ C'est le piège qu'on a évité de justesse : `readStarterChoices` ne reconnaît
  une position qu'aux entrées encore marquées `source: "starter"`, et
  `claimOnEdit` retire cette marque **dès que le coach réécrit un mot de son
  `instead`**. Un coach qui personnalise son « on ne compte pas ici » aurait donc
  perdu la porte ③ **en la rendant davantage sienne**. Vérifié en run réel (§4,
  ligne « doctrine RÉÉCRITE »).

**L'interrupteur** : `profiles.energy_display_enabled boolean not null default false`
(migration `20260812230000`, appliquée en local et enregistrée). Décision du
défaut au §3.

### Lot 2 — le calcul et l'affichage

**`_shared/keel/plan_energy.ts`** — module pur.

```ts
{ kcal: number | null; basis: "plan_quantities"; complete: boolean; gaps: EnergyGap[] }
```

- `basis` est une **constante du chemin**. Jamais une déclaration du modèle.
- **`complete: false` ⇒ `kcal: null`.** Jamais une somme partielle sur un plat :
  une somme amputée de l'huile a l'air d'un résultat.
- **Le seuil est 100 %, plus strict que les 80 % du verdict FF-039** — et c'est
  délibéré : le verdict rend une DIRECTION, qui survit à une marge ; ici on rend
  un NOMBRE que quelqu'un lit comme sa journée.
- **Les préparations sont pliées au prorata** avant tout calcul. Sans ça, 41 % de
  l'énergie et 51 % de la protéine (mesuré, 80 générations) restent hors du plat.
- **Le total du jour porte `dishesCounted` / `dishesTotal`.** Pas seulement le
  mot « incomplet » : « 813 kcal (incomplet) » se lit « 813 kcal ».
- **`servings` est requis et un `servings` absurde lève.** Un défaut à 1 aurait
  rendu le mauvais nombre au premier foyer sans casser aucun appelant.
- **Rien n'est stocké** (R5), et un test lit la source pour refuser `Date.now`,
  `Math.random`, `new Date`, `fetch(` et `await`.

**`supabase/functions/meal-energy-v1/`** — la fonction, et l'architecture est la
garde :

1. `food_composition_refs` est **révoquée pour `authenticated`** : un client ne
   peut pas calculer une énergie.
2. **La chaîne vit là où un `curl` ne va pas.** Quand une porte est fermée, la
   réponse ne contient **aucun chiffre** — pas un tableau vide, pas un zéro, rien
   dans l'onglet réseau.
3. **Aucune écriture.** Le chiffre naît à la requête et meurt avec la réponse.
4. **Fail-closed partout** : profil, plancher, doctrine, référentiel, 500 nu.
5. **Un seul appel à `canShowEnergy`.** Une première version fermait sur ① et ②
   avant de lire la doctrine — c'est-à-dire qu'elle appelait la garde deux fois,
   la première avec des valeurs de remplissage. Deux points de décision finissent
   par diverger, et celui-ci porte la garde la plus sensible du produit.

**L'affichage** : `EnergyReadout.tsx` (rendu unique), branché sur `DishCard`
(surface A), `PlanResult` (surface B, titre de jour) et `TodayPage` (A + B).
La ligne de base — *« Worked out from the quantities in your plan and a food
composition table — not guessed from a photo »* — s'affiche une fois par écran :
sans elle, rien à l'écran ne distingue ce calcul d'une estimation par photo.

---

## 3. La décision qui bloquait le lot 1

### L'interrupteur est-il allumé ou éteint par défaut ?

> **Décision — ÉTEINT (`default false`).**
>
> **Pourquoi.** Trois raisons, et la première suffit.
>
> 1. **Le plancher TCA est un détecteur EN RETARD.** `evaluateRestrictionGuard`
>    décide à partir d'échantillons — bilans hebdomadaires, journées d'énergie,
>    textes de l'élève. Un élève qui commence à se restreindre **aujourd'hui** a
>    un historique vide et un `restriction_flag` à `false`. Allumé par défaut =
>    un chiffre sous ses yeux **avant que la porte ① puisse savoir quoi que ce
>    soit**. Levinson 2017 (73 %) rend cette asymétrie décisive : les deux sens
>    de l'erreur ne coûtent pas la même chose.
> 2. Ce produit n'a **jamais** montré de chiffre à personne. Allumer par défaut
>    applique un renversement, rétroactivement, à une cohorte entière qui ne l'a
>    pas demandé.
> 3. §10 de la fiche veut **mesurer** l'usage de l'interrupteur. Éteint, la
>    métrique mesure la **demande** ; allumé, elle mesure la **gêne**. La demande
>    est le signal utile pour une première version, et celui dont il est le moins
>    coûteux de se tromper.
>
> **Options rejetées.**
> - *Allumé par défaut* — suit la décision du 2026-08-12 à la lettre, mais
>   l'applique à des gens que le détecteur n'a pas encore pu voir.
> - *Tri-état `null` = « jamais répondu »*, avec une question à l'ouverture — la
>   question « veux-tu voir tes calories ? » **est elle-même une invitation à
>   compter**, posée à tout le monde, y compris à ceux que la porte ① aurait fini
>   par protéger. Et elle obligerait à écrire le défaut effectif à deux endroits.
>
> **Réversibilité.** Une ligne, dans les deux sens :
> ```sql
> alter table public.profiles alter column energy_display_enabled set default true;
> update public.profiles set energy_display_enabled = true where keel_role = 'student';
> ```
> Le raisonnement complet est dans l'en-tête de la migration, pas seulement ici.

### La décision annexe qu'il faut connaître

**La porte ② ne se ferme que sur un mineur AVÉRÉ.** Elle reprend
`weekPlanAgeGate`, dont la seule condition de morsure est `status === "minor"` —
une date de naissance **absente** laisse donc passer. C'est un arbitrage, pas un
oubli : la durcir éteindrait le chiffre pour la quasi-totalité de la base
existante (aucun élève d'avant le chantier des dates n'a de `birth_date`), ce qui
serait indiscernable d'une panne. Le test qui l'affirme le dit en toutes lettres.
**Renversable en une ligne**, et c'est une décision produit.

---

## 4. Tableau des tests

### Tests unitaires — 36 + 13 (tous verts)

| Fichier | Cas | Ce qu'ils tiennent |
|---|---|---|
| `energy_gate_test.ts` | **14** | table de vérité **exhaustive 2×6×2×2 = 48 lignes** ; les 5 motifs atteignables ; **un seul chemin ouvre** (5 des 48) ; chaque clé manquante lève ; chaque type faux lève ; l'interface n'a aucun `?` (lu sur la source) ; le `if` du plancher n'a ni `&&` ni `||` ; le jeton de la porte ③ **est** celui de `doctrine_starter` |
| `plan_energy_test.ts` | **22** | l'arithmétique à la main ; `cooked` repasse par le rendement ; friture ; `unit` pesable ; hors table / quantité absente / `state` absent ⇒ abstention **avec motifs distincts** ; prorata des préparations ; préparation illisible **contamine** son plat ; total partiel avec ses deux nombres ; jour illisible ≠ 0 ; `servings` divise ; `complete:false` ne porte **jamais** de chiffre ; toute sortie porte sa base ; pureté lue sur la source |
| `no_calorie_..._property_test.ts` | **13** (9 + **4 nouveaux**) | couche 4 : toute forme portant un kcal porte sa base ; le prompt du générateur **n'a pas bougé** ; une porte fermée n'envoie **aucun** nombre (lu sur le corps du helper de refus) ; les 4 portes sont dans l'ordre **et `canShowEnergy` n'a qu'UN appelant dans tout le dépôt** |

**Mutations exécutées pour prouver que les gardes mordent** (elles ne restent pas
vertes quand on casse ce qu'elles gardent) :

| Mutation | Résultat |
|---|---|
| `restrictionFlag?: boolean` (optionnel) | 🔴 1 test rouge — « ne porte AUCUN champ optionnel » |
| `if (input.restrictionFlag && input.studentSwitch)` | 🔴 **3 tests rouges** — table de vérité, « le plancher gagne », « non conjuguée » |

**Suite complète `_shared/keel/`** : `2679 passed | 0 failed`.

### Run réel — `scratchpad/ff059_real_run_20260812.ts`, **37/37, rejoué 3 fois**

Vraie base locale, vraies fonctions edge, vrais JWT, comptes provisionnés par le
harnais. Aucun mock.

| Niveau | Scénario | Verdict | Preuve (réponse HTTP / ligne en base) |
|---|---|---|---|
| easy | défaut éteint | ✅ | `{show:false, reason:"student_off", "plans" absent, switch_offerable:true}` |
| easy | porte ouverte, 5 plats | ✅ | `[537, 276, 712, 225, null]` — identique au calcul à la main |
| easy | la base sur **chaque** ligne | ✅ | l'ensemble des `basis` du corps = `["plan_quantities"]` |
| easy | somme par jour | ✅ | `mon 813 (2/2)`, `tue 937 (2/2)`, `wed null (0/1, incomplet)` |
| medium | coach `no_counting` | ✅ | `{show:false, reason:"doctrine_no_counting"}`, aucun `plans` |
| medium | **doctrine réécrite** par le coach (`source: null`) | ✅ | mord encore — la porte lit le jeton |
| medium | coach sans position | ✅ | `{show:true, first:537}` |
| medium | pas de coach (méthode maison) | ✅ | `{show:true, first:537}` |
| medium | `servings = 3` | ✅ | `[179, 92, 237, 75, null]` — par assiette |
| medium | l'élève éteint | ✅ | `{show:false, reason:"student_off"}` sur **tous** ses plans |
| hard | élève mineur | ✅ | `{reason:"minor", switch_offerable:false}` — la bascule n'est **pas** proposée |
| hard | huile sans quantité + ingrédient hors table | ✅ | `[[null,["missing_quantity"]], [null,["unknown_ingredient"]], [276,[]]]` |
| hard | le total dit ce qu'il compte | ✅ | `{kcal:276, complete:false, dishes_counted:1, dishes_total:3}` |
| hard | identifiant de plan **d'autrui** | ✅ | `{reason:"no_plan"}` — le `.eq(user_id)` mord sous client admin |
| hard | foyer **sans** trace de deltas | ✅ | `{computable:false, abstention:"household_portions_not_numeric"}`, aucun `dishes` |
| hard | foyer **avec** trace, 4 bouches | ✅ | plats `[134, 69, 178, 56, null]` · jours `mon 625 (+422)`, `tue 656 (+422)` — la part du lecteur, add-on compris |
| hard | l'add-on d'une **autre** bouche | ✅ | ni ses 524 kcal, ni son `member_id`, ni `wholemeal_bread` dans le corps |
| hard | foyer à **1** bouche | ✅ | `{computable:true, first:537}` — le chiffre revient sans dépendre d'une trace |
| **lot 3** | porte ⑤ éteinte par défaut | ✅ | `{target:null, target_offerable:true}` — **le poids n'est même pas lu** |
| **lot 3** | porte ⑤ allumée + une pesée à 75 kg | ✅ | `{low:2100, high:2500, basis:"weight_range", gap:null}` — 28×75 et 33×75, arrondis aux 50 |
| **lot 3** | aucun reste, aucun %, aucun verdict | ✅ | 8 mots cherchés dans le corps réel, 0 trouvé |
| **lot 3** | sans pesée | ✅ | `{low:null, gap:"no_weight"}` — et le plan **garde ses chiffres** (537) |
| **lot 3** | plancher TCA + **les deux** interrupteurs allumés | ✅ | `restriction_floor`, aucune clé `target`, et ni `2250`, ni `2650`, ni `80`, ni `537` dans le corps |
| extra-hard | **prémisse fausse** : avant le plancher | ✅ | `{show:true, first:537}` — la garde a un cas qui passe |
| extra-hard | **plancher + coach qui compte + interrupteur allumé** | ✅ | `{show:false, reason:"restriction_floor"}`, et `"537"` **absent du corps entier** · `protocol_events{local_date:"2026-08-12", student_note:"I have been skipping meals…"}` |
| extra-hard | le plancher se lève **pendant** la session | ✅ | même élève, même plan, même session : 537 avant l'écriture, `restriction_floor` après |
| extra-hard | plan **modifié** après affichage | ✅ | 150 g → 300 g ⇒ 702 au tour suivant, rien à invalider |

Le plancher est levé **par le vrai chemin** — `protocol_events.student_note`,
scanné par `loadStudentTextSamples` — pas par l'écriture d'un drapeau. Écrire un
booléen quelque part aurait testé une garde qui n'existe pas.

### Run navigateur — `/app/plan` et `/app/today`, mesuré

| Vérification | Résultat |
|---|---|
| surface A, écran du plan | `Chicken, rice and greens · Lunch · **537 kcal**` · `Scrambled eggs · Breakfast · **276 kcal**` |
| plat non calculable | `Kokum curry · Dinner · **One ingredient isn't in our food table**` — pas de nombre, motif nommé |
| surface B, titre de jour | `Wednesday TODAY … **813 kcal — 2 of 3 dishes counted**` |
| ligne de base | affichée une fois, en bas |
| **l'interrupteur éteint** | `kcal` : **0 occurrence** dans tout le texte de la page, ligne de base absente, motif du plat absent, bouton devenu `Show calories` |
| surface A + B sur `/app/today` | `["813 kcal — 2 of 3 dishes counted", "537 kcal", "276 kcal"]` — **les mêmes nombres**, même liaison |
| mobile 320 px | débordement horizontal **0 px**, en-tête de jour à 304/320 |
| console | **aucune erreur** |
| réseau | `POST meal-energy-v1 → 200` |
| **lot 3 — la fourchette** | `Around 2100–2500 a day for your weight — based on your weigh-in of 2026-08-10`, suivie de *« It is not a goal, nothing is counted against it, and your plan is not built to hit it. »* |
| **lot 3 — deux bascules** | `Hide calories` **et** `Hide the daily range`, séparées |
| **lot 3 — la ⑤ seule** | éteindre la fourchette : `kcal` reste à **3 occurrences**, la fourchette disparaît, le bouton devient `Show a daily range` |
| **lot 3 — la ④ ferme la ⑤** | éteindre les calories : `kcal` **0**, fourchette absente, et la bascule de la fourchette **n'est même plus proposée** |

---

## 5. L'écart mesuré contre une référence externe (§10)

Calcul à la main depuis `food_composition_refs` (relu en base) contre ce que le
produit rend, **5 plats** :

| Plat | À la main | Produit | Écart |
|---|---|---|---|
| 150 g poulet + 80 g riz + 10 g huile | 537 | 537 | **0** |
| 3 œufs (165 g) + 5 g huile | 276 | 276 | **0** |
| 200 g saumon + 300 g patate douce + 200 g brocoli | 712 | 712 | **0** |
| 100 g riz **cuit** (÷2,6) + 10 g huile | 225 | 225 | **0** |
| 300 g poulet + 80 g riz + 10 g huile | 702 | 702 | **0** |

**Écart nul sur 5/5**, comme la fiche l'exige — c'est une table, pas un modèle.
Le détail du calcul (kcal/100 g, rendements) est en tête du script de run.

⚠️ **Ce que ce zéro ne dit pas.** Il mesure l'accord entre le produit et *la même
table*. Il ne mesure **pas** l'exactitude de la table elle-même, ni celle des
conventions assumées par FF-038 : densité 1 g/ml (faux de ~8 % sur les huiles),
imputation de friture à 12 % du poids cuit, rendements cuit/cru en ordres de
grandeur. Le MAPE de 2,3 % du banc porte sur l'ensemble ; le zéro ci-dessus
porte sur l'arithmétique.

---

## 6. Hypothèses adversariales et leur sort

Chaque hypothèse a été **écrite avant** d'être testée.

### 6.1 « La porte ① est contournable » — **angle prioritaire**

| Chemin cherché | Sort |
|---|---|
| un réglage qui la rouvre | ❌ impossible : son `if` ne prend aucun autre argument, **testé sur la source** |
| l'élève rallume son interrupteur | ❌ testé en réel : `restriction_floor` avant et après |
| demander plusieurs plans à la fois | ❌ 4 variantes (un seul id, doublon, mêlé au plan d'autrui, mêlé à un id inconnu) — toutes `restriction_floor`, **aucun chiffre à 2+ chiffres dans le corps** |
| une prop React qui fuit | ❌ la prop existe, la **donnée** non : le serveur n'envoie rien |
| un second appelant qui assemble mal les portes | ❌ test de propriété : `canShowEnergy` a **exactement un appelant** dans tout le dépôt |
| une valeur par défaut | ❌ les 4 champs sont requis, une entrée incomplète **lève** |
| une panne de lecture | ❌ fail-closed : plancher illisible ⇒ `unavailable`, jamais un chiffre |

**Le seul reste, et il est borné.** Si le plancher se lève pendant qu'un écran
est **déjà ouvert et jamais rechargé**, le composant React garde les nombres
qu'il a reçus **avant**. Le serveur, lui, se ferme dès la requête suivante
(mesuré). C'est la borne inhérente à toute valeur rendue côté client, et elle
correspond exactement à ce que la fiche demande — *« les chiffres disparaissent
au tour suivant »*. Aucune donnée périmée ne survit à une navigation ou à un
remontage. **Ce n'est pas un cache : il n'y a aucun stockage.**

### 6.2 « Le total qui fait semblant »

Fabriqué : `kokum rind`, absent des 911 lignes du référentiel. Résultat mesuré,
côté API **et** à l'écran : le plat ne porte pas de chiffre et **dit pourquoi**,
et le jour affiche `813 kcal — 2 of 3 dishes counted`. Un ingrédient dense
**résolu mais non pesé** (« a drizzle of olive oil ») produit la même abstention,
sous un motif **distinct** — les deux ne se réparent pas au même endroit.

**Trouvé par cet angle, et corrigé** : le sous-titre de `/app/plan` promettait
*« Lines and rhythms, **never calorie counts** »* — affiché **au-dessus de trois
chiffres**. Une promesse contredite par ce qu'on voit en même temps qu'elle
n'abîme pas que sa propre crédibilité : elle apprend à ne pas lire les autres.
Remplacé par *« Dishes and rhythms — nothing here scores you »*, qui garde la
promesse qui **tient** (rien ne note personne) et ne promet pas non plus le
chiffre, absent pour la plupart des gens.

### 6.3 « Le chiffre qui fuit par la prose »

- Le calcul est un **champ typé** ; le nombre entre dans un `<span>` et ne
  traverse aucun texte libre. Vérifié sur la réponse réelle : la seule chaîne
  contenant un chiffre est un **UUID** (écarté par sa forme, pas par une liste de
  champs qui laisserait passer le suivant), avec une prémisse fausse qui prouve
  que le détecteur mord sur « environ 600 kcal ».
- `MEASUREMENT_PROSE_PATTERNS` **inchangé**.
- ⚠️ **Trou trouvé dans le test de propriété lui-même** : son commentaire disait
  déléguer à l'union EN+FR, mais son **corpus était 100 % anglais** — rien ne
  prouvait que la moitié française mordait. Cinq cas FR ajoutés, dont
  « Ça fait environ 600 kcal » — la phrase du §8 de la fiche, mot pour mot.
  Vert du premier coup : la garde FR mordait bien, mais **personne ne le savait**.
  C'est la cicatrice `guard-tested-in-one-language-only`, refermée d'un cran.

### 6.4 « La contamination du générateur »

- `git show --stat ba903138` : **aucun fichier de génération touché**.
- Un test de propriété **exige** que `meal_generation.ts` contienne encore
  « No calories. » / « No macro grams. » / « No percentages of anything
  nutritional. » — il rougira le jour où quelqu'un ouvre le prompt.
- Un `kcal` inventé par le modèle ne survit pas : le parseur **recalcule** les
  grammes (`gramsRaw`) au lieu de croire son arithmétique, et le calcul ne lit
  que des grammes.
- Vérifié en base : la ligne de plan ne contient **aucun** `kcal`/`calorie`/
  `energy` après affichage (R5).

### 6.5 « Le score déguisé »

- La réponse ne contient aucune clé `percent`, `pct`, `adherence`, `score`,
  `target`, `goal`, `budget`, `remaining` — **vérifié sur le corps réel**.
- `planEnergy` a **un seul appelant** (`meal-energy-v1`) ; côté client, les types
  n'atteignent que trois composants d'affichage. Aucun agrégat, aucun évaluateur,
  aucune surface coach.
- `adherence_score` reste une surface supprimée. L'énergie n'entre dans aucun
  dénominateur.

### 6.6 « Le cache »

Il n'y en a pas, et c'est structurel : aucune écriture, aucun `localStorage`,
aucun store de module, et un test lit la source de `plan_energy.ts` pour refuser
`Date.now` / `Math.random` / `new Date` / `fetch(` / `await`. **Mesuré** : deux
appels encadrant une modification du plan rendent `702` puis `276`.

### 6.7 Angles ajoutés

| Hypothèse | Sort |
|---|---|
| Un identifiant de plan volé rend l'assiette d'autrui (le client admin ne passe pas par RLS) | ❌ `.eq("user_id", userId)` en plus de l'`in(id)` — testé, `no_plan` |
| Un coach qui **personnalise** son « on ne compte pas » perd la garde | ❌ **c'était vrai avec `readStarterChoices`** — évité en lisant le jeton. Testé en réel |
| Un coach dont la doctrine est **illisible** ouvre la porte ③ | ❌ fail-closed ⇒ `no_counting` |
| `empty_for_goal` fait disparaître les interdits | ❌ vérifié dans `doctrine_loader.ts` : seuls `no_coach` / `no_published_doctrine` / `load_failed` rendent `doctrine: null` |
| Proposer la bascule à quelqu'un que le plancher protège (= lui parler de calories) | ❌ `switch_offerable` n'est vrai que si le **seul** refus est `student_off`. Testé : `minor` ⇒ `false` |
| Un `servings` manquant vaut 1 et ment sur un foyer | ❌ lève |
| Débordement horizontal du total de jour sur mobile | ❌ 0 px à 320 px |

---

## 7. Lot 3 — **construit**, et les deux questions tranchées

### Question 1 — le niveau d'activité → **une fourchette PAR KG, pas Mifflin**

> **Décision — la fourchette de maintenance, 28 à 33 kcal/kg, arrondie aux 50.**
>
> **Pourquoi.** Rien ne collecte le niveau d'activité. `estimatedMaintenanceKcal`
> existe déjà dans `meal_envelope.ts` et rendrait un **point** — en multipliant
> un métabolisme de base par `ACTIVITY_FACTOR = 1.5`, une constante qu'aucune
> donnée de cet élève ne justifie. C'est le rabbit hole nommé par la fiche :
> « une cible fausse avec l'aplomb d'un tableau ».
>
> La fourchette **est** l'honnêteté sur l'activité : elle couvre du sédentaire à
> l'actif au lieu de choisir pour lui. Et — le point qui décide — **une
> fourchette ne devient pas un objectif comme un point**. Personne ne « rate »
> un intervalle de 400 kcal. Un test le tient sur toute la plage de poids
> plausible : il n'existe aucun poids où les deux bornes se rejoignent.
>
> **Options rejetées.** *Une question à l'inscription* — une friction de plus sur
> un parcours déjà long, pour une réponse auto-déclarée notoirement optimiste ;
> à reconsidérer si la demande apparaît. *Un défaut sédentaire ajustable* — il
> **sous-estime** pour les actifs, c'est-à-dire qu'il prescrit un déficit à
> quelqu'un qui n'en a pas demandé : la seule direction d'erreur que ce produit
> refuse.
>
> **Réversibilité.** Deux constantes nommées dans `energy_target.ts`.
>
> ⚠️ **AUCUN OBJECTIF N'ENTRE DEDANS.** C'est une **maintenance** — ce que ce
> corps dépense — jamais un déficit. En dériver une cible d'amaigrissement
> reviendrait à prescrire un régime chiffré à quelqu'un que personne n'a examiné,
> et le plafond de 500 kcal/j de `meal_envelope` existe précisément parce que ce
> calcul-là est dangereux. Deux tests le tiennent sur la source.

### Question 2 — `count_briefly` → **un interrupteur propre à C, pas une branche**

> **Décision — `count_briefly` ouvre la porte ③ comme l'absence de position, et
> ce qui garde C est son PROPRE opt-in, éteint par défaut.**
>
> **Pourquoi.** La position dit « deux semaines, c'est une leçon, pas un mode de
> vie ». Le mot qui compte est **deux semaines** : un **temps**, pas un booléen.
> L'honorer demande un état neuf (quand le compteur a commencé) et une extinction
> que l'écran doit expliquer. L'inventer sans que personne n'ait tranché le jour
> 15 produirait soit un tracker permanent sous un coach qui l'a explicitement
> borné, soit une extinction silencieuse qui se lit comme une panne.
>
> Ce qui protège l'élève est donc **l'opt-in**, pas une asymétrie entre deux
> positions de coach. Un `count_briefly` plus strict que « pas de position »
> serait incompréhensible à table : un coach qui autorise à compter obtiendrait
> moins qu'un coach qui n'a rien dit.
>
> **Options rejetées.** *`count_briefly` ⇒ A + B seulement* — ne respecte pas ce
> que le coach a écrit, et crée l'asymétrie ci-dessus. *A + B + C sans limite,
> par la seule porte ④* — ferait de la cible le prix de l'affichage des plats,
> sur exactement la distinction (fait sur la nourriture / jugement sur la
> personne) que tout ce chantier tient.
>
> **Réversibilité.** `CountingStance` n'a toujours **que deux valeurs**
> (`no_counting` / `no_position`) — un troisième jeton que personne ne lit serait
> une donnée sans consommateur. Il gagnera son jeton **et son lecteur le même
> jour**, quand l'extinction à 14 jours sera conçue. C'est le suivi le plus utile
> de ce lot.

### Question 3 — le défaut de l'interrupteur

**Tranchée** (§3) : éteint. Elle bloquait aussi le lot 1. Le **second**
interrupteur (porte ⑤) est éteint lui aussi, pour une raison de plus qui lui est
propre : **Levinson 2017 ne parle pas d'étiquettes sur des plats, elle parle de
TRACKERS** — c'est-à-dire très exactement d'un chiffre du jour comparé à un
objectif. C'est le niveau C, et c'est celui-ci.

### Ce que le lot 3 tient, et comment on le prouve

| Interdit | Comment il est tenu |
|---|---|
| La cible n'entre **pas** dans le générateur (R6) | test de propriété sur **les trois** générateurs : aucun ne mentionne `energy_target`, `maintenanceRange` ni `canShowTarget` |
| Le plancher ferme **les trois** niveaux | `canShowTarget` prend le RÉSULTAT de `canShowEnergy` — pas ses entrées. Il n'y a pas d'autre porte d'entrée, et 4 cas le vérifient |
| **Aucun reste** n'existe | un test lit la source et refuse `remaining`, `deficit`, `surplus`, `consumed` et toute soustraction dans `energy_target.ts` ; un run réel le vérifie sur le corps de la réponse |
| Toujours une fourchette | testé sur **chaque poids entier** de 25 à 400 kg |
| Aucun objectif dedans | test de source : ni `fat_loss`, ni `muscle_gain`, ni `goal` |
| Les constantes ne divergent pas de celles du coach | un test **lit `frontend/src/keel/lib/weekInFood.ts`** et refuse le désaccord sur 28, 33 et les bornes |

**Et à l'écran** : la fourchette vit **en bas, avec la note de base — jamais à
côté du total du jour**. Deux nombres alignés se soustraient tout seuls dans la
tête de qui les lit, et cette soustraction est précisément ce qu'on ne construit
pas. Trois phrases l'accompagnent : *« It is not a goal, nothing is counted
against it, and your plan is not built to hit it. »*

---

## 8. Ce qui reste ouvert — pour l'humain

### 8.1 ✅ La copie de la page de consentement — **corrigée**

`frontend/src/keel/i18n/en.ts` — `join.seen.never_4`, sur `/join`, dans la liste
« ce qui reste chez toi ». Elle disait :

> « A calorie count or a macro figure — there is no such number anywhere in here,
> **for anyone**. »

En contexte (ce que le **coach** voit), la phrase restait vraie : FF-059 n'a rien
ouvert côté coach — c'est la question §11 n°5, toujours sans réponse. C'est la
clause **« for anyone »** qui était devenue fausse.

**Corrigée** en :

> « A calorie count or a macro figure. Your coach never sees one, and a photo
>   never produces one. »

Les deux moitiés sont vraies pour des raisons **différentes**, et le commentaire
qui les accompagne le dit : le coach ne voit rien parce qu'aucune surface ne le
lui montre ; une photo ne produit rien parce que le chemin photo n'a pas bougé
(−26,6 % de biais). Une page de consentement est le dernier endroit où l'on garde
une clause trop large parce qu'elle sonne mieux.

**Restent vraies et intactes** : `join.grade.two_title` (« A photo never becomes
a number »), `photo.button_hint`, `coach.meals.field_groups_hint`, et toute la
copie publique `landing.` / `gyms.` / `communities.` — elles portent **sur la
photo**.

### 8.2 ✅ Le chiffre par personne dans un foyer — **livré**

**Le diagnostic d'origine tenait, et il tient encore** :
`member_portions[].portion_note` est une **phrase** (« generous vegetables, full
protein share »), sanitisée par `sanitizePortionNote`, dont
`FORBIDDEN_PORTION_TERMS` bannit explicitement « kcal ». Elle ne portera **jamais**
la part. Diviser par le nombre de convives rendrait l'assiette moyenne — fausse
pour chacun, et elle **effacerait** la bifurcation au lieu de la montrer.

**Ce qui l'a débloqué** : la divergence numérique du foyer existe bien, ailleurs.
C'est `member_deltas` (FF-043) — un **aliment et des grammes**, par bouche, qui
comblent l'écart entre le tronc (dimensionné sur le MIN de toutes les bouches, de
sorte que *personne* ne reçoive moins que ce qui lui convient) et le besoin de
chacun. Ils ne vivaient que dans la **réponse HTTP** de la composition : un
rechargement de page les perdait.

Trois pièces :

1. **Le gel.** `generate-household-meal-v1` écrit désormais `member_deltas` dans
   `generated_from.household` — le blob de trace qu'il écrit déjà. Aucune
   colonne, aucun changement de prompt, aucun changement de comportement.
   ⚠️ **Ce n'est pas la persistance que FF-043 se doit**, et le commentaire le
   dit en toutes lettres : FF-043 décidera d'une colonne, avec sa forme et ses
   lecteurs ; ceci est une trace avec **un seul lecteur nommé**.
   Même arbitrage que `grams_raw` : on gèle ce qui a été calculé le jour de la
   composition, parce que recalculer à la lecture ferait bouger l'histoire d'un
   plan à chaque pesée.
2. **Le calcul.** `memberAddonEnergy` repasse par le **référentiel**, pas par les
   densités de `DELTA_CATALOGUE` — dont le commentaire déclare lui-même qu'elles
   servent « à DIMENSIONNER un ajout, jamais à afficher un chiffre ».
3. **La maille.** L'add-on est une grandeur de **JOUR**, pas de plat — le delta
   comble un écart quotidien et n'est attaché à aucun plat. Conséquence voulue :
   **deux personnes autour de la même casserole lisent le même chiffre pour le
   même plat**, et la journée porte l'écart, dit comme un ajout.

**Ce qui reste une abstention**, et c'est la bonne :

| Cas | Comportement |
|---|---|
| plan composé **avant** le gel | abstention nommée — le tronc seul serait un **plancher**, vrai et faux vers le bas, sur exactement la question qui a motivé ce chantier |
| `member_id` du lecteur introuvable | idem |
| foyer d'**une** bouche | chiffre, sans dépendre d'aucune trace |
| aucun add-on pour cette bouche | chiffre **exact**, `addonKcal: 0` — un résultat, pas une ignorance |

⚠️ **La distinction `[] ` contre `null` porte tout ce comportement**, et
`planEnergy` **lève** si `addons` est absent : un `?? []` chez un appelant ferait
passer un plan d'avant le gel pour un plan sans add-ons, c'est-à-dire afficherait
le tronc seul comme l'assiette entière — sur la population où l'écart est le plus
grand. Un test le tient.

**Et les autres bouches ne franchissent jamais le fil.** Vérifié en run réel : ni
le kcal de l'add-on d'un autre membre, ni son identifiant, ni son aliment
n'apparaissent dans le corps de la réponse. C'est la règle « ce qui touche le
corps est à soi », et elle répond à la question §11 n°4 de la fiche dans la
direction prudente.

### 8.3 🟡 Deux points à surveiller

- **La porte ② laisse passer un âge inconnu** (§3). Décision produit,
  renversable en une ligne.
- **La copie de l'app est en anglais uniquement.** `mealCopy` n'a pas de locale —
  c'est l'état existant de tout l'écran du plan, pas une régression de ce lot.
  Les gardes, elles, sont testées **FR et EN** (§6.3).

### 8.4 Rouges préexistants — prouvés antérieurs

| Test | Cause | Prouvé antérieur par |
|---|---|---|
| `coverage-guard` — fonctions edge | `household-merge-notices-v1` et `keel-daily-recommendation-v1` absents de la liste connue | `git show HEAD~1:…coverage-guard.int.test.ts` : **0 occurrence** des deux |
| `coverage-guard` — triggers | `household_member_bodies_touch`, `student_daily_recommendations_set_updated_at` | idem, **0 occurrence** |
| `planRefusals.int.test.ts` | 7 clés `household.error.*` écrites et non atteignables | autre lane |

`meal-energy-v1` **a été ajouté** à la liste connue, avec la raison d'être de la
fonction et ses fichiers de couverture — c'est le geste que ce garde-fou attend.

⚠️ **Note de méthode, et elle a failli coûter cher.** J'ai utilisé `git stash -u`
pour prouver l'antériorité des rouges. **Le dépôt est partagé** : le stash a
emporté les 227 fichiers modifiés par d'autres sessions, et le `pop` les a bien
tous rendus (vérifié : `git stash list` ne contient plus que le WIP d'une autre
branche, `stash@{0}` sur `clean-v2-redesign`, qui n'est pas de moi). **À ne pas
refaire** : `git show HEAD~1:<fichier>` suffisait, et c'est ce qui a finalement
tranché.

### 8.5 ⚠️ Une session parallèle a emporté un de mes fichiers dans son commit

`supabase/functions/generate-household-meal-v1/index.ts` — la trace des add-ons —
a été committée par **`cff0ec43` (« la ligne de quelqu'un ne bouge plus parce
qu'un tiers a genere »), qui n'est pas de moi.** Une autre lane a fait un `git
add` large pendant que ma modification était non commitée dans l'arbre de
travail.

**Conséquence pratique : aucune.** Le changement est dans `HEAD`, vérifié
(`git show HEAD:… | grep -c "FF-059 · LES ADD-ONS"` → 1), et il partira au
déploiement. Mais il faut le savoir en relisant l'historique : **le message de
`cff0ec43` ne dit rien de FF-059**, donc `git log` sur ce fichier ne mènera pas à
ce rapport. C'est la même cause que la note ci-dessus — un dépôt partagé — vue de
l'autre côté.

---

## 9. Commandes pour l'humain

**Rien n'est à déployer par moi.** Ce qui suit demande une exécution humaine.

Appliquer les **deux** migrations en distant (le hook bloque `db push`) —
`20260812230000_profile_energy_display` (porte ④) et
`20260812240000_profile_energy_target` (porte ⑤) :

```bash
supabase db push
```

Déployer la nouvelle fonction et les modules `_shared` modifiés :

```bash
supabase functions deploy meal-energy-v1
```

⚠️ **Et le générateur de foyer**, qui écrit désormais la trace des add-ons. Sans
ce déploiement, tous les plans de foyer composés après la mise en ligne
continueraient de s'abstenir — silencieusement, et pour la bonne raison :

```bash
supabase functions deploy generate-household-meal-v1
```

⚠️ **`verify_jwt` reste à `true`** — la fonction n'a **aucune** entrée dans
`supabase/config.toml`, et c'est voulu : elle lit le profil, le plancher et la
doctrine d'un élève, et l'identité vient du JWT, jamais d'un `user_id` du client.

Rejouer le run réel en local :

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=$(supabase status -o env | sed -n 's/^ANON_KEY=//p') SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p') deno run -A scratchpad/ff059_real_run_20260812.ts
```

Regarder l'écran soi-même (crée un élève, imprime ses identifiants ; `--drop`
nettoie) :

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=$(supabase status -o env | sed -n 's/^ANON_KEY=//p') SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p') deno run -A scratchpad/ff059_fixture_20260812.ts
```

Les tests, environnement purgé :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check supabase/functions/_shared/keel/energy_gate_test.ts supabase/functions/_shared/keel/plan_energy_test.ts supabase/functions/_shared/keel/energy_target_test.ts supabase/functions/sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts
```

---

## 10. Les interdits — état

| Interdit | État |
|---|---|
| La porte ① n'est ouvrable par personne | ✅ testé sur la source, en table de vérité, et en réel par 6 chemins |
| Aucun chiffre chez un mineur | ✅ testé, et la bascule ne lui est même pas proposée |
| Aucun chiffre en prose libre | ✅ `MEASUREMENT_PROSE_PATTERNS` inchangé, corpus FR **ajouté**, réponse scannée |
| Aucune macro | ✅ le calcul les produit en interne, **aucune ne sort** de `meal-energy-v1` |
| Aucun pourcentage d'adhérence dérivé | ✅ un seul appelant, aucun agrégat, corps vérifié |
| Aucun chiffre stocké | ✅ aucune écriture d'énergie ; ce qui est gelé est un **aliment et des grammes** (`member_deltas`), du même rang que `grams_raw` |
| Le prompt du générateur ne bouge pas | ✅ test de propriété sur les trois lignes ; le seul changement au générateur de foyer est une clé de **trace** |
| Le chemin photo n'est pas touché | ✅ `energy_estimate` n'existe toujours pas ; `MealAnalysis` non plus |
| La cible n'entre dans aucun générateur (R6) | ✅ test de propriété sur **les trois** générateurs |
| Aucun reste, aucune soustraction | ✅ testé sur la source de `energy_target.ts` et sur le corps réel |

---

## 11. Ce qui a été livré après le déblocage

| Chantier | Fichiers |
|---|---|
| La part du foyer | `plan_energy.ts` (`memberAddonEnergy`, `addons` requis), `meal-energy-v1` (`readViewerAddons`), `generate-household-meal-v1` (la trace), copy `day_with_addon` |
| Le lot 3 | `energy_target.ts` + son test (13 cas), `canShowTarget` dans `energy_gate.ts`, migration `20260812240000`, `EnergyTargetNote`, `setEnergyTarget`, copy |
| La copie de consentement | `i18n/en.ts` — `join.seen.never_4` |
| Les propriétés | une 5e propriété : « the daily target never reaches a meal generator (R6) » |

**Suites** : `_shared/keel/` **2707 / 0** · propriétés **14 / 14** · run réel
**37 / 37 ×3** · frontend `tsc -b` propre, 3 rouges **préexistants** (§8.4).
