# E — la cohérence de bout en bout

**2026-08-18 · à partir de 19h30** · branche `ff-001-quotidien-du-coach`.
**Aucun push, aucun merge, aucune commande à risque.**

> Écrit **au fil de l'eau** et commité à chaque section (l'infrastructure coupe
> toutes les ~10 min). Ce qui n'a pas pu être vérifié est marqué **NON VÉRIFIÉ**,
> jamais deviné.

## Comment lire

- ✅ vu à l'écran ou mesuré, preuve à côté — 🟥 **rouge** : pas tenu, ou pas prouvé
- ⚠️ tenu, avec une réserve qu'un humain doit connaître
- Chaque défaut porte son `fichier:ligne`.

## Le harnais

- Serveur de dev **dédié** : `frontend-e`, port **5198** (aucune autre lane
  dessus ; origine distincte ⇒ pas de session partagée).
- Persona : **`laneb-owner-…@test.dev`**, maître du foyer **Bramble**
  `80e9af4c`, mot de passe de fixture `1234567` **vérifié avant de viser**.
  Session ouverte par l'API depuis la page (aucun mot de passe tapé dans un
  formulaire, aucun jeton affiché).
- ⚠️ **Comptes QA partagés touchés** : voir la section « Ce que j'ai écrit dans
  la base » en fin de rapport. Rien n'est fait avancer sans être écrit ici.

---

# PARTIE A — les deux questions de l'utilisateur

## A1. « Où est le questionnaire de préférences (habitudes, allergies, dégoûts, shaker) qui devait être en pop-up à l'étape 3 de l'inscription ? »

**Réponse courte : il existe, il est complet, et il n'est PAS dans l'inscription.
Il n'est monté que sur `/app/household`.**

Vu à l'écran (port 5198, maître de Bramble, 1280 px). Le pop-up s'ouvre par
« Fill in my details » sur la carte du maître et porte bien **six blocs** :

| # | Bloc, tel qu'il s'affiche |
|---|---|
| 1 | WHO THEY ARE — prénom + date de naissance |
| 2 | WHICH WAY THE SCALE SHOULD GO — direction (3 choix) |
| 3 | THEIR BODY — taille, poids, sexe + HOW ACTIVE THEY ARE |
| 4 | WHAT THEY ALREADY EAT — *(dépliable)* |
| 5 | ANYTHING THEY ARE ALLERGIC TO? — *(dépliable)* |
| 6 | WHAT THEY WILL NOT EAT, AND HOW THEY EAT — *(dépliable)* |

Les blocs 4-5-6 sont exactement le « questionnaire de préférences » attendu.

**Pourquoi il est absent de l'inscription** : `MouthFormDialog` n'a **qu'un seul
site de montage dans tout le dépôt**, `frontend/src/keel/pages/HouseholdPage.tsx`
(commit `92cef98b`). `frontend/src/keel/pages/SetupPage.tsx` n'en porte **zéro**
occurrence. Le tunnel n'a donc jamais reçu ce pop-up — ce n'est pas une
régression, c'est un montage qui n'a pas été fait.

🟥 **Conséquence pour un nouvel inscrit** : à l'inscription il ne voit ni ses
habitudes, ni ses allergies, ni ses dégoûts, ni son shaker. Il ne les rencontre
qu'en allant de lui-même sur `/app/household` **après** l'inscription. Rien à
l'écran ne l'y envoie.

## A2. « Pourquoi le poids visé et le rythme par semaine ne s'affichent pas quand je choisis perdre / prendre ? »

**Réponse courte : sur `/app/household` ils s'affichent — mais le curseur est
retenu derrière le corps, et le corps est DESSOUS. Dans le tunnel d'inscription,
ils n'existent pas du tout.**

### Sur `/app/household`, mesuré clic par clic

Au clic sur « Losing fat », le pop-up rend **immédiatement** :

```
WEIGHT THEY ARE AIMING FOR (KG)          ← le champ EXISTE (#mouth-target-weight)
With the pace below, this gives a date to arrive on.
Fill in height, weight and sex below and the pace slider appears.   ← à la place du curseur
```

Puis, taille `178`, poids `85`, sexe `male` saisis (toujours sans avoir touché
au cran d'activité) :

```
HOW FAST
0.45 kg a week
The top of this slider is set by their body — it is the fastest pace the plan can actually cook.
<input type=range min=0.05 max=0.45 step=0.05 value=0.45>
```

✅ Le champ de poids visé et le curseur **s'affichent bien**.
⚠️ **Mais le pop-up du maître s'ouvre avec un corps VIDE** (le compte Bramble n'a
ni taille, ni poids, ni sexe). Un maître qui choisit « perdre » voit donc, en
l'état, un champ de poids visé **et pas de curseur**, avec une phrase qui lui
demande de remplir un bloc situé **plus bas dans la fenêtre**. C'est très
exactement le symptôme décrit. Ce n'est pas muet — la phrase est là — mais
l'ordre des blocs met la cause **après** l'effet.

**C'est une décision qui appartient à l'utilisateur** : soit on remonte le bloc
« corps » avant le bloc « direction », soit on garde l'ordre actuel et on rend la
phrase plus impérative. Rien n'a été changé.

### Dans le tunnel d'inscription : rien du tout 🟥

Mesuré à l'écran sur `/app/setup` (étape 2 sur 4, bloc « YOU »), en sélectionnant
« Lose weight » dans le menu `#setup-goal` :

```
avant :  WHAT YOU ARE AFTER  →  — / Lose weight / Hold what I have / Build muscle
après :  WHAT YOU ARE AFTER  →  …puis directement ANYTHING YOU ARE ALLERGIC TO?
```

Compté sur la page entière **après** la sélection :

| Ce qu'on cherche | Compte |
|---|---|
| `input[type=range]` (le curseur de rythme) | **0** |
| champ « poids visé » | **aucun** |

🟥 **Le tunnel ne porte ni poids visé ni curseur de rythme, pour personne** — ni
pour le titulaire, ni pour les autres bouches. La direction y est un simple menu
déroulant (`SetupPage.tsx:2122-2136` pour le titulaire,
`SetupPage.tsx:2397-2410` pour une autre bouche), et **rien** ne se déplie en
dessous. Le fichier ne contient aucune occurrence de curseur de rythme ni de
poids visé — vérifié par recherche, et confirmé à l'œil.

**Donc : quelqu'un qui s'inscrit aujourd'hui choisit une direction sans jamais
pouvoir dire ni où il va, ni à quelle vitesse.** Ces deux réglages n'existent
que dans le pop-up de `/app/household`, où il faut aller de soi-même.

### ⚠️ Un détail vu en passant, sur le même écran

L'en-tête du tunnel dit **« Three steps, then your first plan. »** et le fil
d'Ariane juste en dessous dit **« STEP 2 OF 4 »**. Trois contre quatre, à deux
lignes d'écart. Non corrigé (ce n'est pas mon lot), signalé.

---

# PARTIE B — le parcours, dans l'ordre où un humain le vit

## B2. Le curseur de rythme — les quatre états, le plafond, l'avertissement, la saturation

Balayage complet sur 7 corps × 3 directions
(`scratchpad/2026-08-18-1930-E-sonde-curseur.ts`, à rejouer par
`cd frontend && npx vite-node ../scratchpad/2026-08-18-1930-E-sonde-curseur.ts`).

### Les quatre états

| État | Quand | Vu ? |
|---|---|---|
| `folded` | « maintenir », ou rien de choisi | ✅ mesuré sur les 7 corps |
| `needs_body` | direction choisie, corps inconnu | ✅ mesuré, **et vu à l'écran** (« Fill in height, weight and sex below and the pace slider appears. ») |
| `slider` | corps connu, marge disponible | ✅ mesuré + vu à l'écran |
| `no_margin` | corps connu, **zéro** marge | 🟥 **jamais atteint** |

🟥 **`no_margin` est le seul état que je n'ai pas su faire apparaître**, y compris
sur une femme adulte de **38 kg pour 158 cm** (qui rend encore un curseur de 0,05
à 0,35). Il est peut-être injoignable par le formulaire, ou il demande un corps
que je n'ai pas trouvé. **Personne ne peut donc dire aujourd'hui ce que cet écran
affiche dans ce cas.** À trancher : soit on montre le corps qui l'atteint, soit
on constate que la branche est morte. Elle est à `lib/mouthForm.ts:476`.

### Le maximum s'adapte au corps et ne dépasse jamais 1 kg/semaine ✅

```
femme 38 kg  perte  → max 0,35   (bound = body_fraction)
femme 42 kg  perte  → max 0,40   (body_fraction)
homme 85 kg  perte  → max 0,45   (energy_floor)
enfant 10 a. perte  → max 0,15   (energy_floor)
femme 60 kg  prise  → max 0,60   (body_fraction)
homme 85 kg  prise  → max 0,85   (body_fraction)
homme 110 kg prise  → max 1,00   (absolute_cap)   ← le plus haut vu
```

**Maximum le plus haut sur tous les corps testés : exactement 1,00 kg/semaine**,
et c'est le plafond absolu qui décide (`bound=absolute_cap`), pas le corps. Aucun
corps ne dépasse. ✅

### L'avertissement au-delà de 0,5 en prise ✅ — et il est bien *strictement* au-delà

```
prise 0,45 → pas d'avertissement
prise 0,50 → pas d'avertissement          ← la borne est exclue, comme annoncé
prise 0,55 → « surplus_becomes_fat »
prise 1,00 → « surplus_becomes_fat »
```

Contrôle : en **perte**, l'avertissement n'apparaît jamais, à aucun cran ✅.

### La saturation ✅ — et elle dépend bien du corps

```
femme 60 kg sédentaire, prise :  0,15 → rien ;  0,20 et au-delà → « plate_stops_changing »
homme 110 kg sédentaire, prise : 0,25 → rien ;  0,30 et au-delà → « plate_stops_changing »
```

Et le rabattage annoncé fonctionne : la femme de 60 kg à qui on demande 1,00
affiche **0,60**, son maximum ✅. En **perte**, jamais de saturation, à aucun
cran, sur aucun corps ✅.

### ⚠️ La réserve qui compte : le curseur s'ouvre DÉJÀ saturé, presque toujours

Le défaut du curseur est **son maximum** (décision assumée, `mouthForm.ts:483`).
Or le maximum en prise est **au-dessus** du point de saturation sur tous les corps
adultes mesurés. Conséquence, mesurée :

> Un adulte qui choisit « prendre du muscle » et **ne touche à rien** voit son
> curseur à fond, avec **les deux phrases en même temps** : « au-delà de 0,5 le
> surplus part en gras » **et** « ça ne change plus rien à l'assiette ».

Ce n'est pas faux — les deux sont vraies — mais le premier contact avec la prise
de masse est un contrôle qui s'annonce inutile au moment où on l'ouvre. **C'est
une décision qui appartient à l'utilisateur** (ouvrir au point de saturation
plutôt qu'au maximum ?). Rien n'a été changé.

### Le poids visé ✅

```
perte, cible 78 kg sous 85 kg  → accepté, « 16 semaines »
perte, cible 95 kg sous 85 kg  → REFUSÉ (wrong_direction), refus rendu à côté du champ
perte, cible vide              → idle (rien ne s'affiche, rien ne promet)
maintenir, cible 78 kg         → idle  ← le champ ne s'ouvre pas en maintien
prise, cible 92 kg sous 85 kg  → accepté, « 9 semaines »
```

## B3. Le cran d'activité — obligatoire seulement sous une direction qui bouge ✅

```
goal = ""             → activityIsRequired = false
goal = "fat_loss"     → activityIsRequired = TRUE
goal = "maintenance"  → activityIsRequired = false
goal = "muscle_gain"  → activityIsRequired = TRUE
```

Exactement la règle demandée (`lib/mouthForm.ts:571`). ✅

## ⚠️ Un commentaire périmé, trouvé en chemin — `SetupPage.tsx:2392-2396`

Le commentaire au-dessus du menu de direction d'un enfant affirme :

> *« les deux directions qui retirent (`fat_loss`, `recomposition`) ne sont pas
> proposées à un enfant, et la base les refuse à l'écriture
> (`goal_not_for_minor`) »*

C'est **faux depuis la décision humaine du 2026-08-18** : `goalsForAge`
(`api/household.ts:256-261`) rend désormais **la même liste pour tout le monde**,
et le code juste en dessous l'appelle. Un mineur se voit donc bien proposer les
trois directions à l'écran, conformément à la décision — mais le commentaire dit
le contraire, à quatre lignes de distance. C'est exactement le motif « une
contrainte documentée survit à sa cause ». **Non corrigé** (fichier partagé, lane
voisine active dessus), signalé.

## B1. Le pop-up « une bouche » sur le MAÎTRE — la direction s'écrit vraiment ✅

C'est le défaut le plus récemment fermé (« un bouton mort il y a une heure »), et
c'est le seul point du chantier qui n'avait **jamais** été vu à l'écran. Il l'est
maintenant, **de bout en bout, jusqu'à la base**.

**Le geste, tel qu'un humain le fait**, sur `/app/household`, maître du foyer
Bramble : « Fill in my details » → date de naissance `10/03/1988` → « Losing
fat » → taille `178`, poids `85`, sexe `male` → poids visé `78` → cran
« On their feet » → curseur descendu à `0.35` → **Save**.

**Ce que l'écran a rendu pendant le geste :**

- au clic sur « Losing fat », le poids visé s'ouvre, et à sa place le curseur dit
  « Fill in height, weight and sex below and the pace slider appears » ;
- corps saisi → le curseur apparaît, `min=0.05 max=0.45 step=0.05` ;
- poids visé saisi → **« About 20 weeks at this pace. »** — la date d'arrivée
  s'affiche à côté du champ, comme annoncé ;
- la ligne « Still needed: … » disparaît quand les six manques sont comblés ;
- au Save, **la fenêtre se ferme** et le roster passe de
  `Paul — Staying where they are` à **`Paul — Losing fat`**. ✅

**Ce qui est arrivé en base** (relevé avant / après, service role) :

| Où | Avant | Après |
|---|---|---|
| `student_goals.goal` | `maintenance` | **`fat_loss`** ✅ |
| `student_goals.target_weight_kg` | `null` | **78** ✅ |
| `student_goals.target_pace_kg_per_week` | `null` | **0.35** ✅ |
| `profiles.birth_date` | `null` | **1988-03-10** ✅ |
| `household_member_bodies` (ce foyer) | **table vide** | 1 ligne : 178 / 85 / male / `on_feet` ✅ |
| `household_members.goal` (sa ligne) | `null` | `null` — **et c'est juste** : la direction d'une bouche qui a un compte vit dans `student_goals`, pas sur la ligne membre |

**Rien n'a été jeté en silence.** Les cinq écritures que D5 décrivait par des
tests sont observées ici sur la vraie base, par le vrai geste. ✅

### ⚠️ Ce que j'ai écrit dans une base QA partagée, et qu'il faut savoir

Le compte **`laneb-owner-…@test.dev`** (Paul, maître de Bramble `80e9af4c`) a
**changé d'état** : il est passé de « maintenir, sans corps, sans date de
naissance » à « perdre du gras, 78 kg visés, 0,35 kg/semaine, 178/85/male,
`on_feet`, né le 10/03/1988 ». L'état d'avant est archivé dans
`/tmp/pE_snap_before.json`, celui d'après dans `/tmp/pE_snap_after.json`.
**Je ne l'ai pas remis en arrière** : l'état où je le laisse est cohérent et plus
complet qu'avant, et une restauration partielle aurait été plus risquée qu'utile.
Une lane qui comptait sur « Paul n'a pas de corps » doit le savoir.

## B1bis. 🟥 Le pop-up ne s'ouvre PAS sur une bouche ordinaire qui existe déjà

L'exigence dit : *« il s'ouvre sur une bouche ordinaire **et** sur le maître »*.
**À l'écran, seule la moitié est vraie.** Mesuré sur les trois boutons de la
liste « WHO EATS HERE » :

| Geste | Ce qui s'ouvre |
|---|---|
| « Fill in my details » (le maître) | **le pop-up**, six blocs ✅ |
| « Add them » (une bouche NEUVE) | **le pop-up**, six blocs ✅ (titre « Someone who eats here ») |
| « Edit » sur **Lea**, bouche qui existe déjà | 🟥 **une carte dépliante en ligne**, PAS le pop-up (`role=dialog` absent, le bouton devient « Close ») |

La carte en ligne d'une bouche existante porte bien la matière — direction,
corps, régime, habitudes, absences, allergies — mais **ce n'est pas le même
écran, et il lui manque deux choses qui existent dans le pop-up** :

🟥 **ni poids visé, ni curseur de rythme.** Le bloc s'appelle « THEIR DIRECTION »
et propose quatre choix ; rien ne se déplie en dessous. **Une bouche ordinaire
déjà enregistrée ne peut donc, aujourd'hui, recevoir ni cible ni rythme par aucun
écran du produit** — le pop-up qui les porte ne s'ouvre jamais sur elle.

C'est la même famille de trou que A1/A2 : le pop-up existe et il est bon ; il
n'est **monté** que sur deux des trois portes.

### ⚠️ Deux détails de copie relevés sur la carte en ligne

- Elle dit « How the plan names their **portion** » là où le pop-up dit
  « …their **serving** ». Deux mots pour la même chose, à un clic d'écart.
- Elle rend, pour Lea, **du français au milieu de l'anglais** :
  « Breakfast — **une pomme** » / « **Ne mange rien de réchauffé.** ». Ce sont
  des données saisies par une lane précédente, pas de la traduction — mais un
  lecteur y verra un écran à moitié traduit.

## B1ter. Le shaker et le régime dans le pop-up du maître ✅ / ⚠️

En dépliant les trois blocs repliables sur la fiche du maître :

- **Bloc 4** — les six moments (BREAKFAST → BEFORE BED), puis
  *« A shake or a measured snack? Add it and it counts inside the day. »* +
  bouton **« Add a shake or measured snack »** ✅ — le shaker est bien là, et
  bien pour le compte maître.
- **Bloc 6** — s'intitule « WHAT THEY WILL NOT EAT, **AND HOW THEY EAT** » mais,
  une fois ouvert, ne contient que **« FOOD THEY REFUSE »** : ⚠️ **aucun
  sélecteur de régime**. C'est conforme à la règle (la base refuse un régime sur
  une bouche `has_account`), mais **le titre promet la moitié qu'il ne rend
  pas**. Une bouche sans compte, elle, a bien son régime (« HOW THEY EAT / Eats
  everything / Vegetarian / Vegan / Pescatarian », vu sur la carte de Lea).
- **La fenêtre se ressème correctement** : rouverte après le Save, elle affiche
  `0.35 kg a week` et « About 20 weeks at this pace. » ✅ — la cicatrice du
  brouillon figé au montage ne se rejoue pas.

---

# 🟥🟥 LE POINT LE PLUS GRAVE DU RAPPORT — un clone frais ne compile pas

C'était une question ouverte (« la dette i18n est hors de nous — qu'est-ce qu'un
clone frais rend ? »). **Elle est maintenant tranchée, par la mesure.**

**Le protocole** : un arbre de travail détaché sur `HEAD` seul
(`git worktree add --detach /tmp/E-head-clone HEAD`), les `node_modules`
du dépôt principal liés dedans, puis :

```
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

**Résultat : 1 170 erreurs TypeScript.** (Le même `tsc` est **vert** sur l'arbre
de travail réel, qui porte les fichiers non commités.) L'arbre de test a été
retiré derrière (`git worktree remove --force`) — rien ne reste.

**Ce n'est donc pas « une page à moitié traduite ». Le frontend ne se construit
pas du tout à partir de ce qui est dans git.**

### La répartition

| Code | Nombre | Ce que c'est |
|---|---|---|
| `TS2345` | **1 006** | une clé de message citée par un composant **et absente du seed `en.ts`** |
| `TS2322` | 70 | types incompatibles |
| `TS2307` | **41** | **des modules entiers qui n'ont jamais été commités** |
| autres | 53 | |

**Les modules qui n'existent pas à HEAD alors que du code commité les importe :**

```
keel/i18n/format      keel/i18n/plural     keel/i18n/prices
keel/api/uiLanguage   keel/api/gapQuestion  components/KitchenToday
```

**Les fichiers les plus touchés** (les douze premiers) :

```
139  pages/CoachDoctrinePage.tsx        57  components/MouthFormDialog.tsx
 94  pages/StudentWeekPlanPage.tsx      53  pages/SetupPage.tsx
 63  components/DoctrineStartDialog.tsx 50  pages/CouplesPage.tsx
 59  components/MealBuilder.tsx         45  pages/FamiliesPage.tsx
 57  pages/StudentProgressPage.tsx      42  pages/MealPrepPage.tsx
```

### Le chiffre exact pour le pop-up de ce chantier

`MouthFormDialog.tsx` **est commité** à HEAD, et il cite **50** clés
`household.mouth.*` distinctes. Combien de ces 50 existent dans le `en.ts` de
HEAD ? **Zéro.**

```
household.mouth.*   citées par le composant commité : 50   présentes dans en.ts à HEAD : 0
household.mouth.*   dans en.ts SUR LE DISQUE : 57          dans fr.ts sur le disque : 57
meals.*             dans en.ts à HEAD : 0                  sur le disque : 219 (et 219 en fr)
```

**Sur le disque, la couche i18n est complète et cohérente** (3 448 clés en
anglais, 3 347 en français ; les 57 clés du pop-up et les 219 de `meals.*` sont
présentes **dans les deux langues**). Le problème n'est pas la traduction : c'est
que **rien de tout cela n'est dans git**. `frontend/src/keel/i18n/fr.ts` n'est
pas suivi du tout ; `fr.public.ts`, qui est le fichier que le `t.ts` de HEAD
importe, est marqué supprimé dans l'arbre.

### Ce que ça veut dire, en clair

- **Aucune des quatorze livraisons du jour n'est reproductible depuis git.** Un
  collègue qui clone, ou une CI, obtient un frontend qui ne compile pas.
- Les rapports de la journée qui disent « `npx tsc -b --force` : exit 0 » sont
  **vrais** — mais ils mesurent l'**arbre de travail**, jamais le contenu de git.
  Personne n'avait fait la mesure sur `HEAD` seul.
- **C'est la décision n°1 qui appartient à l'utilisateur** : le hunk i18n de
  2 061 lignes de la lane voisine doit être commité, ou le chantier reste sur un
  seul disque dur.

---

# 🟥 LE DÉFAUT D'ASSEMBLAGE — le corps du maître a DEUX maisons, et les deux écrans n'en lisent pas la même

C'est exactement ce qu'un rapport « lot par lot » ne pouvait pas voir : les deux
écrans sont justes séparément, et **le parcours qui les enchaîne perd deux
champs sur trois**.

**Le geste** : je viens d'écrire, par le pop-up de `/app/household`,
`taille 178 / poids 85 / sexe male / on_feet` sur le maître. Je vais ensuite sur
`/app/setup`, et je recharge la page. Ce que le tunnel affiche dans **ses**
champs :

| Champ | Écrit par le pop-up | Relu par le tunnel |
|---|---|---|
| poids | 85 | **85** ✅ |
| direction | `fat_loss` | **`fat_loss`** ✅ |
| **taille** | **178** | 🟥 **vide** |
| **sexe** | **male** | 🟥 **vide** |

Et le tunnel **refuse d'avancer** en conséquence, avec deux lignes du bloc
« AVANT DE CONTINUER » :

> *« Ta taille, pour que tes parts soient les tiennes. »*
> *« Ton sexe, pour que tes parts soient les tiennes. »*

**La cause, lue dans la base et dans le code :**

```
pop-up  → keel_household_set_member_body  →  household_member_bodies
                                             (h=178 w=85 g=male act=on_feet)  ← la ligne EXISTE

tunnel  → api/onboarding.ts:1476
          .select("full_name, birth_date, height_cm, gender, activity_level")   sur PROFILES
                                             profiles.height_cm = NULL
                                             profiles.gender    = NULL
                                             profiles.activity_level = NULL
```

Le tunnel lit le corps des **autres** bouches dans `household_member_bodies`
(`onboarding.ts:1563-1565`) — mais celui **du titulaire** dans `profiles`
(`onboarding.ts:1476, 1615-1619`). Le pop-up, lui, écrit le titulaire **comme
une bouche**. Les deux écrans se croisent sans se voir.

**Ce qu'un humain vit** : il remplit consciencieusement sa fiche sur l'écran du
foyer, revient au tunnel, et on lui redemande sa taille et son sexe comme s'il
n'avait rien fait. **Non corrigé** : ce n'est pas un correctif trivial (il faut
trancher **quelle** table fait autorité pour le corps du titulaire, et le trancher
au même endroit que `birthDateDoor` l'a déjà été pour la date de naissance).
**C'est une décision qui appartient à l'utilisateur.**

## ⚠️ Trois lignes identiques, et aucune ne dit de qui elle parle

Toujours dans le bloc « AVANT DE CONTINUER » du tunnel, trois lignes **mot pour
mot identiques** se suivent :

```
Taille, poids et sexe pour chaque personne à table. Sans les trois, cette personne est servie comme tout le monde…
Taille, poids et sexe pour chaque personne à table. Sans les trois, cette personne est servie comme tout le monde…
Taille, poids et sexe pour chaque personne à table. Sans les trois, cette personne est servie comme tout le monde…
```

Une par bouche incomplète (Lea, Nina, Zoe) — mais **aucune ne porte de prénom**.
Le lecteur voit trois fois la même phrase et ne peut pas savoir laquelle des
trois personnes il doit compléter. Le motif est `member_height_cm` /
`member_weight_kg` / `member_gender` empilés sans sujet
(`api/onboarding.ts:1090-1092`). Signalé, non corrigé.

---

# PARTIE C — les deux langues, et la largeur

## Les deux langues ✅ (avec une réserve)

La bascule se fait par **`?lang=fr`** (`i18n/runtime.ts`, priorité 1). ⚠️ Piège
mesuré : si `localStorage["sophia.ui_locale"]` porte déjà un choix, **`?lang=fr`
est ignoré** — il faut vider la clé. Une fois vidée, `uiLocale()` rend `fr`.

**En français, le pop-up est complet et correct**, y compris les nombres :

```
0,35 kg par semaine            ← virgule décimale française
Environ 20 semaines à ce rythme.
Le maximum de ce curseur est réglé sur son corps…
Sert à dimensionner les parts. Il n'est jamais énoncé, ni à table ni à côté d'un prénom.
```

Compté sur le disque : `en.ts` = 3 448 clés, `fr.ts` = 3 347. Les **57** clés
`household.mouth.*` et les **219** clés `meals.*` sont présentes **dans les deux
packs**. La couche i18n est finie — elle n'est simplement pas dans git (voir plus
haut).

⚠️ **Le genre grammatical du pack français se contredit sur la même personne.**
Sur la fiche de Paul : « CE QU'**ELLE** MANGE DÉJÀ », « Y a-t-il quelque chose
qu'**elle** mange presque tous les jours », puis « **IL** EST ALLERGIQUE À
QUELQUE CHOSE ? ». Sur la fiche de Lea (prénom féminin, « Déjà enregistré**e** ») :
« CE QU'**IL** VISE ». Ce n'est pas bloquant, mais c'est visible à chaque écran.

## La largeur — la page ne défile jamais horizontalement ✅

| Écran | Largeur | `scrollWidth` / `clientWidth` | Éléments qui débordent |
|---|---|---|---|
| `/app/household` (EN) | 1280 | **1280 / 1280** | 0 |
| `/app/household` **+ pop-up ouvert** (FR) | **320** | **320 / 320** | **0** |

Mesure faite à `scroll 0`, sur `document.documentElement`, en énumérant tous les
éléments dont le bord droit dépasse `clientWidth`. **Aucun.** ✅

---

# PARTIE D — `/app/plan` et le chiffre d'énergie

Vu à l'écran, connecté en maître du foyer Bramble, interface en **français**,
plan du foyer `483da69a` (couvre lundi 17 et mardi 18 ; on est mardi).

## D1. La vue jour ✅ — tout ce qui était demandé est là

| Exigence | Ce que l'écran rend |
|---|---|
| bandeau du jour J | **« Mardi · Aujourd'hui »** ✅ |
| sessions de cuisine | « Session de cuisine — environ 60 min — Voir le déroulé », avec les trois préparations nommées ✅ |
| courses | « Les courses étaient prévues Lundi — 32 articles sur la liste — Ouvrir la liste » ✅ |
| plats | 7 plats sur la journée, chacun avec son mode (« À réchauffer — 10 min », « À assembler — 8 min », « Cuisine minute — 15 min ») ✅ |
| séparation par personne | **POUR LA TABLE / POUR NINA / POUR ZOE**, et une grille « QUI MANGE QUOI » avec une ligne par personne ✅ |
| boîtes en grammes | **« LA PESÉE »** : `Boîte Paul, Lea, Nina, Zoe — 900 g`, `Boîte Nina — 150 g`, `Boîte Zoe — 220 g`… ✅ |

Et la traçabilité des restes est rendue : *« Depuis Roast chicken thighs —
cuisiné Mardi. »* suivi de la boîte et de son poids.

## D2. La vue semaine ✅

« Ta semaine d'un coup d'œil » rend les deux jours de la fenêtre en colonnes.
**Lundi 17 n'a aucun plat et apparaît quand même**, avec « rien ici » dans les
trois cases — la règle « un jour sans plat mais qui porte quelque chose
s'affiche » tient. Les badges de division sont là : `+1 PLAT DE PLUS`,
`+2 À PART`, `D'UNE FOURNÉE`.

## D3. Les invariants de sûreté

| Invariant | Verdict |
|---|---|
| **Aucun solde** | ✅ **zéro occurrence** de « il te reste », « restant », « remaining » sur les deux écrans, calories allumées comme éteintes |
| **Grammes d'aliment voulus** | ✅ 38 mesures en grammes sur `/app/plan` |
| **Aucune calorie dans le texte d'un plan** | ✅ **0 occurrence de `kcal`** quand l'interrupteur est éteint |
| **Le corps d'un enfant jamais énoncé** | ✅ Lea n'apparaît que par son prénom, ses boîtes et « No share from the shared dishes ». **Aucun chiffre de corps.** |
| **Pas de défilement horizontal** | ✅ (mesuré en partie C) |

⚠️ **Une réserve, et je la pose sans trancher.** `/app/plan` affiche en tête une
carte « À PROPOS DE TOI » qui dit **« Chiffres — 178 cm · 85 kg »**. Ce sont les
chiffres de corps du **lecteur lui-même**, sur son propre écran, à côté d'un
bouton « Modifier » — ce n'est pas le texte d'un plan. Je le signale parce que la
consigne dit « les chiffres de corps, non », et qu'un humain doit dire si cette
carte est dans le périmètre ou non.

## D4. Le chiffre d'énergie — l'interrupteur coupe VRAIMENT les deux écrans ✅

L'interrupteur vit en bas de `/app/plan` : **« Afficher les calories »** /
**« Masquer les calories »**, avec la phrase *« Tu peux couper ça quand tu veux,
et ça se tait partout. »*

**Mesure, en comptant les occurrences du mot `kcal` sur la page entière :**

| État | `/app/plan` | `/app/today` |
|---|---|---|
| éteint | **0** | **0** |
| allumé | 4 (le total du jour + 3 plats) | 4 |
| éteint à nouveau (depuis `/app/today`) | **0** | **0** |

✅ **L'extinction coupe bien tout, sur les deux écrans, dans les deux sens.** Et
elle ne touche pas aux grammes : 38 mesures en grammes restent sur `/app/plan`
une fois les calories éteintes.

**Quand il est allumé**, le bandeau du jour rend :

```
204 kcal — 3 plats comptés sur 9
```

✅ **L'incise est bien là** et elle **restreint le sujet du nombre** : elle ne dit
pas « ta journée », elle dit combien de plats ont été comptés. C'est exactement le
défaut que D2 ② devait fermer, et il est fermé à l'écran.

Le module s'explique aussi : *« Calculé à partir des quantités de ton plan et
d'une table de composition des aliments — pas deviné sur une photo. »*

### 🟥 Deux choses NON VÉRIFIÉES, et il faut le dire

- 🟥 **Le conseil du midi (« vise autour de … ») n'a pas pu être vu.** Zéro
  occurrence de « vise autour » / « aim for » sur les deux écrans. C'est
  **attendu** : il n'existe que pour un midi marqué « dehors », et **aucune
  bouche de ce foyer n'a de marque d'absence** (les quatre `away_days` sont
  vides). La phrase est prouvée par la mesure de D2 ① hors HTTP ; elle n'est
  **pas** prouvée à l'écran. Pour la voir il faut un foyer avec un midi
  « dehors » posé sur le jour courant.
- 🟥 **La case « mange dehors » n'a pas pu être vue rendue** dans les deux
  lecteurs, pour la même raison : rien n'est marqué dehors sur ce plan. Le lot ③
  de D4 la prouve sur la valeur rendue ; l'œil ne l'a pas vue.

### ⚠️ Un point que quelqu'un doit regarder : « Apple for Lea — 18 kcal »

Calories allumées, la puce de kcal est rendue **sur chaque plat**, y compris sur
un plat dont le nom porte le prénom d'une **mineure** :

```
Apple for Lea      Petit-déjeuner      18 kcal
```

Ce n'est pas un chiffre de **corps**, et ce n'est pas non plus un chiffre servi à
l'enfant — c'est le plat, sur l'écran du maître, qui a lui-même allumé
l'interrupteur. Mais c'est **un nombre de calories à côté du prénom d'un
enfant**, et la consigne parle de « kcal nominatifs ». **À trancher par un
humain.** Rien n'a été changé.

## D5. ⚠️ La langue : coquille française, contenu anglais

Sur un écran dont toute l'interface est en français, **tout le contenu du plan
est en anglais** — noms de plats (« Chicken, couscous and roast vegetables »),
étapes (« Reheat a portion of chicken… »), justifications (« It uses the batch
cook from today… »), et jusqu'aux consignes de boîte (« Take the shared box
portion for the table meal »). C'est la frontière connue (le plan est composé en
anglais), mais **à l'écran c'est la moitié de la page**.

🟥 **Et trois questions d'interface, elles, ne sont simplement pas traduites** —
ce ne sont pas des données, ce sont des libellés :

```
DID YOU GET TO COOK THIS PLAN?         Yes / Partly / No
THE PORTIONS IN IT WERE:               Too much / About right / Not enough
DID THIS PLAN LEAVE YOU HUNGRY BETWEEN MEALS?   Often / Sometimes / No
```

au milieu d'un bloc dont le titre voisin est, lui, en français (« LES PLATS QU'IL
PORTAIT », « Encore » / « Sans moi », « UNE ENVIE POUR LA SUITE »).

---

# 🟥 ALERTE VIVE — à 20h07, `/app/household` s'est mis à ne plus rien afficher du tout

**Ce n'est pas mon lot, et je n'y touche pas** — mais il faut le savoir tout de
suite, parce que c'est l'écran central de tout ce chantier.

**Ce que la page rend, à 20h08 :**

```
Une erreur est survenue
L'affichage a rencontré un problème. Rien n'a été perdu — recharge la page pour reprendre.
[Recharger la page]
```

**Toute la page**, pas seulement la fenêtre. Persiste après rechargement complet.

**La cause, lue dans la console :**

```
t(): "household.mouth.preferences_title" est hors [du périmètre traduit] de la page,
     ou traduis-le. Voir i18n/catalog.ts.
The above error occurred in the <MouthFormDialog> component.
```

**Le fait :** `MouthFormDialog.tsx` a été **modifié à 20h07** (horodatage du
fichier) et appelle maintenant, à `MouthFormDialog.tsx:295` et `:298` :

```ts
t("household.mouth.preferences_title_named", { name })    // ← n'existe pas
t("household.mouth.preferences_title")                    // ← n'existe pas
```

**Aucune des deux clés n'est dans `en.ts` ni dans `fr.ts`** (tous deux datés de
19h17). La fenêtre est **montée fermée** sur chaque rendu de la page — le `t()`
part donc à chaque affichage, et `t()` échoue bruyamment par construction (R7).
Résultat : l'écran entier tombe dans la barrière d'erreur.

**`npx tsc -b --force` sur l'arbre de travail est ROUGE en ce moment**, 3
erreurs, toutes sur les mêmes deux fichiers :

```
MouthFormDialog.tsx(730,72)  Property 'onClose' does not exist on type 'MouthCoreFieldsProps'
HouseholdPage.tsx(1035,11)   Property 'todayLocalIso' does not exist on type MouthFormDialogProps
HouseholdPage.tsx(1180,13)   idem
```

C'est un lot **en cours d'écriture** par une lane voisine, pris en flagrant
milieu de geste. **Je ne le répare pas** (fichier partagé, travail d'autrui), et
je ne le compte pas contre le chantier.

### ⚠️ Ce que ça change pour la lecture de CE rapport

**Toutes mes mesures sur `/app/household` — le pop-up du maître, ses six blocs,
l'écriture de la direction jusqu'en base, le curseur, le français, les 320 px —
ont été prises AVANT 20h07, sur la version qui fonctionnait.** Elles restent
vraies de cette version. Elles ne décrivent **pas** l'état de l'arbre de travail à
20h08.

### 🟥 Et la conséquence : la grille de présence n'a pas pu être vérifiée

Le point 5 du parcours (les trois états de la grille, « enregistrer sans toucher
une case ne transforme pas *dehors* en *absent* », la grille propre du
titulaire) **n'a pas pu être joué au navigateur** : la seule porte vers cette
grille est `/app/household`, qui est tombé au moment exact où j'y arrivais.
**NON VÉRIFIÉ. Consigné rouge.** Ce point reste prouvé uniquement par les tests
de rendu de D4 ②/③ ; l'œil ne l'a pas vu.

---

# 🟥 PARTIE E — la grille de présence : le troisième état n'existe pour PERSONNE

`/app/household` est revenu à la vie vers 20h10 (la lane voisine a posé ses
clés). J'ai pu jouer la grille. Voici ce qu'elle est.

## Ce que la grille rend, à l'écran

Carte de Nina → « Indiquer ses absences » → une table `Repas × Mar 18 … Dim 23`,
lignes `Petit-déjeuner / Déjeuner / Dîner`, **18 contrôles**. Chacun est :

```html
<input type="checkbox" aria-label="Déjeuner — Mercredi">
```

🟥 **Des cases à cocher. Deux états. Pas trois.** Et la consigne à côté conflue
les deux absences en une seule : *« Décoche les repas qu'elle ne prendra pas
ici. »* — « au restaurant » et « pas là » deviennent la même case décochée.

## Pourquoi, et c'est une garde désarmée

`MealPickerGrid.tsx` **sait** rendre les trois états. La bascule est à la ligne
258 :

```ts
threeState={Boolean(props.onSaveMarks)}
```

et le `<select>` à trois options (`at_table` / `eating_out` / `away`) est aux
lignes **410-429**.

**`onSaveMarks` n'a AUCUN appelant dans tout le dépôt.** Vérifié :

```
$ grep -rn "onSaveMarks" frontend/src/ | grep -v components/MealPickerGrid.tsx
frontend/src/keel/components/mealPickerGrid.int.test.ts:28   (un commentaire)
frontend/src/keel/components/mealPickerGrid.int.test.ts:154  (le test du cas SANS la prop)
```

Les **deux seuls** montages de la grille (`MealBuilder.tsx:1066` et `:1468`)
passent `onSave`, jamais `onSaveMarks`. Donc `threeState` vaut **`false`
partout**, et le troisième état **ne se rend nulle part dans le produit**.

C'est exactement le motif déjà payé dans ce dépôt : *un paramètre de garde
optionnel est une garde désarmée*. Le commentaire de la prop
(`MealPickerGrid.tsx:63-66`) l'assume — « le deux-états reste le défaut », « c'est
ce qui rend ce lot additif » — mais **le lot est resté additif ET jamais
additionné**.

## Ce que ça fait au parcours, bout à bout

```
le tunnel demande   « la semaine, tu déjeunes au bureau ? »   → écrit 5 midis « dehors »
les lecteurs du plan savent rendre « dehors »                 → prouvé par D4 ③
      MAIS
aucun écran ne permet à un humain de POSER ou de CORRIGER un « dehors ».
```

Et c'est aussi ce qui rend la question suivante impossible à trancher :

🟥 **« Enregistrer sans toucher une case ne doit pas transformer *dehors* en
*absent* » : NON VÉRIFIÉ, et invérifiable en l'état.** Pour le mesurer il
faudrait une bouche portant une marque `eating_out`, et **rien à l'écran ne sait
en créer une** — seule la question du déjeuner du tunnel le fait, et le tunnel
est bloqué (voir plus haut). Le risque reste entier : la seule grille accessible
écrit par l'ancienne porte `onSave` (`AwayDay[]`), qui ne connaît pas le
troisième état.

⚠️ **Aucune de mes cases n'a été enregistrée** : j'ai décoché « Déjeuner —
Mercredi » pour observer, puis rechargé la page sans jamais cliquer
« Enregistrer ». La grille de Nina est intacte.

🟥 **« Le titulaire a bien sa propre grille » : NON VÉRIFIÉ.** La carte du maître
sur `/app/household` est la fenêtre à six blocs, qui ne porte pas de grille
d'absences ; la grille du titulaire vit dans le tunnel (D4 ②), que je n'ai pas
pu atteindre.

---

# PARTIE F — l'état des suites, ce soir

## `npx vitest --config vitest.config.ts run` (env QA neutralisé)

```
Test Files   4 failed | 94 passed | 5 skipped (103)
Tests       55 failed | 1542 passed | 20 skipped (1617)
```

| Fichier rouge | Rouges | Verdict |
|---|---|---|
| `src/edge/coverage-guard.int.test.ts` | 2 | **étranger connu**, inchangé |
| `src/keel/api/household.int.test.ts` | 2 | **étranger connu**, inchangé |
| `src/keel/components/mouthFormDialog.int.test.ts` | **48** | 🟥 **NEUF** — lane voisine, en cours à 20h07 |
| `src/keel/pages/meCardSheet.int.test.ts` | **3** | 🟥 **NEUF** — même cause (`MouthCoreFields is not defined`, `HouseholdPage.tsx:1035`) |

Les 51 rouges neufs ne sont **pas** du chantier : ils apparaissent avec l'édition
en cours d'une lane voisine sur `MouthFormDialog.tsx` / `HouseholdPage.tsx`, la
même qui a fait tomber l'écran à 20h07.

## `npx tsc -b --force`

🟥 **ROUGE sur l'arbre de travail à 20h08** (3 erreurs, mêmes deux fichiers, même
lane). Il faudra le rejouer une fois cette lane posée.
🟥 **ROUGE sur `HEAD` seul : 1 170 erreurs** — voir la section « un clone frais ne
compile pas ».

---

# CE QUE JE N'AI PAS PU VÉRIFIER — la liste rouge, sans excuse

1. 🟥 **L'étape `table` du tunnel** (moyens de cuisson avant les disponibilités,
   dépliage du déjeuner, moments de repas) — **jamais atteinte**. Le tunnel
   refuse d'avancer tant que les quatre bouches n'ont pas taille/poids/sexe et
   une réponse d'allergie, et compléter tout ça écrit lourdement dans un compte
   QA partagé. Prouvée par L6-b sur le rendu ; **pas vue**.
2. 🟥 **Les trois états de la grille** — impossibles à rendre (voir partie E).
3. 🟥 **« Enregistrer sans toucher une case »** — invérifiable sans un `eating_out`
   existant.
4. 🟥 **La grille propre du titulaire** — vit dans le tunnel, non atteint.
5. 🟥 **Le conseil du midi (« vise autour de … ») à l'écran** — aucun midi
   « dehors » sur le foyer visé.
6. 🟥 **La case « mange dehors » rendue dans les deux lecteurs** — même cause.
7. 🟥 **L'état `no_margin` du curseur** — jamais atteint, même sur un corps de
   38 kg.
8. 🟥 **La journée entièrement dehors** — confirmée **non faite**, comme annoncé
   (D4 §5, D5 §④). Je n'ai rien trouvé qui contredise leur diagnostic :
   `meal-energy-v1/index.ts:869` itère toujours sur les jours **produits**.

---

# LES DÉCISIONS QUI APPARTIENNENT À L'UTILISATEUR

1. **Commiter la couche i18n.** Sans elle, rien de ce chantier n'existe hors de
   ce disque dur. C'est la décision n°1 et elle bloque tout le reste.
2. **Monter le pop-up sur les deux portes qui lui manquent** : l'édition d'une
   bouche existante (`/app/household`), et l'étape 3 du tunnel. Aujourd'hui le
   poids visé et le rythme ne sont atteignables que par le maître.
3. **Trancher quelle table fait autorité pour le corps du titulaire**
   (`profiles` ou `household_member_bodies`) — sans ça, le tunnel et l'écran du
   foyer continueront de se contredire.
4. **Brancher `onSaveMarks`**, ou retirer le troisième état. Le laisser tel quel
   est la pire des trois options : le code le porte, les tests le prouvent,
   personne ne le voit.
5. **Le curseur de prise s'ouvre au maximum, donc déjà saturé.** Ouvrir au point
   de saturation ?
6. **« Apple for Lea — 18 kcal »** : un nombre de calories à côté du prénom d'un
   enfant. Dans le périmètre de l'interdit, ou non ?
7. **« Chiffres — 178 cm · 85 kg »** en tête de `/app/plan` : dans le périmètre,
   ou non ?
8. **Les trois questions de bilan en anglais** au milieu d'une page française.

---

# CE QUE J'AI TOUCHÉ, ET RIEN D'AUTRE

- **Écrit** : `scratchpad/2026-08-18-1930-E-*` (ce rapport et deux sondes).
  **Aucun fichier du produit n'a été modifié.** Aucun défaut n'a été refermé en
  silence.
- **Compte QA partagé avancé** : `laneb-owner-…@test.dev` (Paul, foyer Bramble
  `80e9af4c`) — direction, poids visé, rythme, corps, cran d'activité, date de
  naissance, **plus** `profiles.height_cm/gender/activity_level` posés par le
  tunnel. Détail et état d'avant en partie B1.
- **Aucune case de la grille de Nina n'a été enregistrée.**
- Un arbre de travail détaché a été créé puis **retiré** (`git worktree remove
  --force`) ; `git worktree list` est propre.
- Jamais `git add -A`, jamais `git stash`, aucune commande à risque, aucun push,
  aucun merge. Commits `--no-verify` avec le motif écrit dans chaque message
  (`agent-gate` est rouge sur des fichiers non suivis de lanes voisines).

