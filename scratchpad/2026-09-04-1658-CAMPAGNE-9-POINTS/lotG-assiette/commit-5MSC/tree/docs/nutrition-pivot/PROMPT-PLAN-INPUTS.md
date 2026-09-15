# MISSION — la direction du plan, et le corps auquel il s'adresse

> Prompt d'exécution autonome. Repo `Sophia 2`, branche `dewhatsapp`. Une bonne
> partie de ce que tu vas croire à construire **existe déjà** : le §2 le dit
> précisément, avec les chemins. Le lire avant d'écrire une ligne.

---

## 1. LE PROBLÈME

KEEL génère à l'élève un plan de repas par semaine. Aujourd'hui ce plan est
construit à partir d'**un seul** signal : l'objectif de l'élève. Trois manques,
et le troisième est le plus grave.

**A. L'objectif existe mais il n'est pas une direction — c'est un champ dans un
formulaire.** Il vit dans une section de la page `/app/plan`, sous le plan,
qu'on remplit une fois et qu'on ne revoit jamais. Il devrait être **l'en-tête
permanent** de tout ce que l'élève voit du plan : visible en haut, toujours,
modifiable en un geste. Un élève qui ne voit plus sa direction ne sait plus
pourquoi la semaine ressemble à ça.

**B. L'âge n'est nulle part.** Aucune colonne, aucun formulaire, aucun usage.
Or il change réellement ce qu'on met en avant dans une semaine.

**C. Le générateur ne lit AUCUNE mesure du corps.** `generate-week-plan-v1` lit
`student_goals` et rien d'autre — pas le poids, pas le tour de taille, pas l'âge.
Le produit **collecte** pourtant poids et tour de taille chaque dimanche, et ils
dorment dans une colonne que la génération n'ouvre jamais. On construit une
semaine à l'aveugle pour un corps dont on sait des choses.

Et l'élève, lui, **ne voit pas ses dernières mesures au moment où il fixe sa
direction**. Il choisit « perdre du gras » sans avoir sous les yeux d'où il part.

**Ce que tu construis** : un socle d'entrée clair — direction, âge, dernières
mesures — collecté une première fois, affiché en permanence, modifiable à tout
moment, et **réellement lu par la génération**.

---

## 2. CE QUI EXISTE DÉJÀ — À NE PAS RECONSTRUIRE

### 2.1 L'objectif, sa table et son vocabulaire

`supabase/migrations/20260803160000_pivot_student_week_plan.sql:32` —
table `student_goals`, **une ligne par élève** (`unique (user_id)`) :

- `goal text not null check (goal in ('fat_loss','recomposition','performance','health','maintenance'))`
- `situation text` — la situation en prose, dans les mots de l'élève. Son
  commentaire dit pourquoi elle existe : sans elle on propose une semaine
  parfaite et inapplicable, « première cause d'abandon ».
- `practical_constraints jsonb` — `{ cooking_time_min, budget_band,
  eats_out_per_week, no_cook_days[] }`. Le générateur BRANCHE dessus.
- `content_locale`, `created_at`, `updated_at`.

**Le vocabulaire des 5 objectifs est fixé et suffisant.** « Perdre du poids » =
`fat_loss`, « devenir musclé » = `recomposition`, « être en bonne santé » =
`health`. **N'invente pas de sixième token** : chaque valeur est lue par une
branche nommée du générateur, un token neuf sans branche est un objectif qui ne
change rien.

### 2.2 L'UI de l'objectif existe, mal placée

`frontend/src/keel/pages/StudentWeekPlanPage.tsx` : lecture `:139`, upsert
`:185`, section « Your goal » `:281`, liste `GOALS` `:78`, et déjà une garde
`goal_required` (« Set your goal above first — the week is built around it »).

**Elle écrit `goal` et `situation`, et RIEN d'autre.** `practical_constraints`
n'est jamais renseigné : la colonne existe, le générateur la lit, personne ne la
remplit. C'est une entrée morte à réveiller.

### 2.3 Les mesures sont collectées — chaque dimanche

`supabase/functions/_shared/keel/weekly_flow.ts` : le point du dimanche demande
`weight_kg` (`:369` et suivantes) **et `waist_cm`** (`:215`, `:230`), plus les
axes de biofeedback (`energy`, `hunger`, `digestion`, …). Tout atterrit dans
`weekly_reviews.biofeedback`.

`frontend/src/keel/pages/studentProgressWeight.ts` sait déjà les relire
(`displayWeights`), avec un repli documenté sur `outcomes.weight_7d_avg` pour le
chemin 1:1. **Réutilise ce lecteur**, ne le réécris pas — son en-tête raconte
précisément le bug écrivain/lecteur qui a laissé la carte poids vide.

### 2.4 Le générateur

`supabase/functions/generate-week-plan-v1/index.ts:90` lit `student_goals`.
C'est sa **seule** entrée côté élève. `generate-meal-v1` la lit aussi.

### 2.5 Ce qui n'existe nulle part

- **L'âge** ou la date de naissance : aucune colonne, vérifié sur toutes les
  migrations.
- **Le tour de taille affiché** : il est collecté, jamais montré.
- **Un premier passage** : rien ne demande à un élève neuf les quelques
  informations nécessaires avant sa première semaine.

---

## 3. LES CONTRAINTES QUI GOUVERNENT

### 3.1 🔴 Un mineur n'est pas un cas limite, c'est une décision

Collecter l'âge te dira, tôt ou tard, qu'un élève a moins de 18 ans. **Tu dois
trancher ce que le produit fait dans ce cas, et l'écrire** — pas le découvrir en
production. Les options honnêtes : refuser l'inscription, alerter le coach,
restreindre l'objectif (interdire `fat_loss` à un mineur), ou l'accepter
explicitement avec une mention légale. **Recommandation : bloquer la génération
de plan et prévenir le coach**, parce qu'un accompagnement nutritionnel de
mineur relève de son cadre professionnel, pas du nôtre.

Ne stocke pas un âge en nombre : stocke une **date de naissance** et dérive
l'âge. Un entier `age` est faux dès le lendemain de l'anniversaire, et c'est le
genre de dette qu'on ne rattrape jamais.

### 3.2 🔴 Le poids affiché est un terrain à risque

Ce dépôt porte une garde restrictive (TCA) — `_shared/keel/restriction_runtime.ts`,
`student_safety_constraints`, `restriction_flag`. Un élève signalé à risque ne
doit **pas** recevoir une interface qui met le poids au centre.

Donc : la carte des mesures se **retire** quand la garde restrictive est armée
pour cet élève, et l'objectif `fat_loss` ne lui est pas proposé par défaut. Ce
n'est pas une politesse, c'est la même doctrine qui interdit déjà les calories
à l'élève. Prouve-le par un test avec la prémisse fausse (élève signalé) et le
contre-factuel (élève non signalé, la carte s'affiche).

### 3.3 Le contrat d'affichage

Le poids et le tour de taille sont des mesures que **l'élève a saisies
lui-même** : les lui réafficher est légitime, et ce n'est pas la même chose que
les calories d'un repas (interdites par le contrat, non-input #4). La frontière
reste nette : **on montre ce que l'élève a déclaré de son corps, on ne calcule
rien à partir de sa nourriture.** Aucun besoin énergétique estimé, aucun « objectif
calorique », aucun IMC catégorisé en jugement.

### 3.4 L'élève décide, le coach reste l'auteur

Amendement 2 de `PLAN-NUIT.md` : en 1:N, le coach écrit UN programme et une
doctrine ; c'est l'élève qui compose sa semaine. La direction est donc **à
l'élève**, modifiable par lui à tout moment, sans validation du coach. Le coach
la **voit** (utile pour sa cohorte), il ne l'approuve pas.

---

## 4. CE QUE TU CONSTRUIS

### P1 — La date de naissance

Nouvelle migration (jamais la réécriture d'une ancienne) : `profiles.birth_date date`
ou une colonne sur `student_goals` — tranche et justifie. *Recommandation :
`profiles`, parce que c'est une propriété de la personne et pas de son objectif,
et parce que la purge RGPD et l'export la traitent déjà avec le reste du profil.*

À faire dans la foulée, sinon la colonne est une fuite : **ajoute-la à
`account-export-v1`** (allowlist de colonnes) et vérifie qu'elle disparaît à la
purge. Le lifecycle RGPD a déjà oublié des tables neuves une fois.

### P2 — La direction, en en-tête permanent

Un composant réutilisable, affiché **en haut** de `/app/plan` et de `/app/meals`,
toujours visible, portant : l'objectif en clair, la direction en une phrase, et
un bouton de modification qui ouvre l'édition sans quitter la page.

Il remplace la section « Your goal » actuelle de `StudentWeekPlanPage` — ne
laisse pas les deux coexister, deux écrivains du même champ divergent.

L'édition doit couvrir **les quatre entrées**, pas deux : `goal`, `situation`,
`practical_constraints` (aujourd'hui jamais rempli), et la date de naissance.

### P3 — Les dernières mesures, montrées ET lues

**Côté élève** : une carte compacte dans l'en-tête de P2 — dernier poids,
dernier tour de taille, avec leur **date** (une mesure sans date ne dit rien) et
la tendance sur les dernières semaines si elle existe. État vide explicite et
non honteux : « pas encore de mesure — tu les saisiras au point du dimanche ».
Réutilise `displayWeights` ; ajoute son équivalent pour le tour de taille.

**Côté générateur, et c'est le vrai enjeu du lot** : `generate-week-plan-v1`
(et `generate-meal-v1`) reçoivent l'âge et les dernières mesures en entrée.
Documente **ce que chacune change** dans la semaine générée — une entrée qui
n'altère aucune branche est une entrée décorative, et il vaut mieux ne pas la
passer que de faire croire qu'elle sert.

⚠️ **Interdit** : dériver un besoin calorique, un objectif de poids, ou une
catégorie d'IMC. Les mesures informent le **choix et la mise en avant** des
repas, jamais une cible chiffrée rendue à l'élève.

### P4 — Le premier passage

Un élève neuf qui arrive sur `/app/plan` sans `student_goals` ne doit pas voir
un formulaire vide au milieu d'une page vide. Il doit traverser un **premier
passage court** : direction → date de naissance → situation en une phrase →
contraintes pratiques → (les mesures viendront au premier point du dimanche).

Trois règles :
- **court**. Quatre écrans maximum, une question par écran. Chaque question
  ajoutée coûte des élèves qui n'arrivent jamais au bout.
- **interruptible et repris**. L'état est persisté à chaque étape, pas à la fin.
- **jamais bloquant deux fois**. Une fois passé, il ne revient pas ; l'édition
  se fait par l'en-tête de P2.

Le conversationnel est une option légitime ici (Sophia pose les questions dans
la bulle) — mais **si tu la choisis, réutilise le mécanisme de question armée
existant** (`_shared/chat/armed_question.ts`) et n'invente pas un second.

### P5 — Le coach voit la direction

Sur `/coach/clients/:id` : l'objectif, l'âge et les dernières mesures de l'élève,
en lecture seule, derrière le `log_coach_student_access` existant. Le coach ne
modifie pas la direction de son élève.

---

## 5. LA MÉTHODE — le gantelet

Cinq épreuves par livrable, toutes obligatoires :

1. **Tests exécutés** (`deno test`, `vitest`), sortie collée. Un test écrit et
   non lancé n'existe pas.
2. **Passe adversariale**, au minimum : prémisse fausse (élève sans mesure, sans
   objectif, sans plan) ; date de naissance absurde (1900, demain, mineur de
   12 ans) ; concurrence (deux onglets modifiant l'objectif) ; rejeu ; **FR et
   EN** ; fuseau et changement de semaine ; élève signalé par la garde
   restrictive ; `practical_constraints` vide vs rempli.
3. **Épreuve de réel** : parcours joué au navigateur contre la stack locale —
   élève neuf, premier passage, génération d'une semaine, modification de la
   direction, régénération. Vérifie **en SQL** ce que chaque étape a écrit.
4. **Contre-factuel** : montre que la génération **change réellement** quand
   l'objectif change. Génère deux semaines pour le même élève avec `fat_loss`
   puis `recomposition`, et **compare les sorties**. Si elles sont identiques,
   l'entrée est décorative et c'est un P0 — c'est tout le lot qui ne sert à rien.
5. **Deux relectures à froid** en fin de mission.

**Le test qui porte la doctrine :** *« la direction et les mesures changent la
semaine générée »*, prouvé par diff, pas par lecture de code.

**Les suites qui doivent rester vertes :**

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

---

## 6. RÈGLES D'ENGAGEMENT

1. Branche `dewhatsapp`. Commit snapshot d'abord, un commit par phase verte.
2. **INTERDIT** : `functions deploy`, `db push`, secrets, tout écrit distant.
   Le local est autorisé, `db reset` compris. Toute transformation de schéma est
   une **nouvelle** migration.
3. Tu ne refonds ni le billing, ni le contrat photo, ni l'ordre des gardes du
   tour, ni le point du dimanche (tu le LIS, tu ne le réécris pas).
4. Journal : `docs/nutrition-pivot/PROGRESS-PLAN-INPUTS.md`, append-only.
   Livrable : `docs/nutrition-pivot/STATUS-PLAN-INPUTS.md`, avec la décision
   « mineur » écrite en clair et son alternative.
5. Règle des 30 minutes : documente, contourne une fois, passe, reviens.
6. **Honnêteté** : aucun « fait » sans le test qui le prouve.
7. Pièges de la stack locale : Kong rend des 502 sans corps sur les tours longs ;
   `EMAIL_DELIVERY_ENABLED=1` traîne en local ; `functions.invoke` n'envoie pas
   `x-internal-secret` ; `auth.admin.createUser` échoue par intermittence (repli
   `signUp` anon + `update profiles`) ; les crons acceptent une horloge simulée
   dans le corps.

## 7. LA QUESTION À CHAQUE ARBITRAGE

> *Est-ce que cette information change ce que l'élève trouvera dans son assiette
> cette semaine ?*

Si non, ne la demande pas. Chaque champ ajouté à un premier passage coûte des
élèves qui n'arrivent jamais à leur première semaine — et un élève sans première
semaine est un élève perdu, quelle que soit la qualité des données qu'on aurait
pu collecter.
