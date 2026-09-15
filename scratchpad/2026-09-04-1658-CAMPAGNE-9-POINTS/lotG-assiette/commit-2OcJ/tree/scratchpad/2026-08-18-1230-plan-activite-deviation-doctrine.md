# Plan — l'activité, la déviation, et la doctrine

**Décisions humaines du 2026-08-18** (session de discussion, cf. mémoire
`tracking-is-the-product-not-the-enemy`) :

- le produit **tracke et compte**, assumé ; la copy « on ne compte pas les calories » part ;
- on **logue la séance d'exercice**, on n'**ajuste pas** le plan depuis elle (« l'exercice n'est pas fixe ») ;
- l'eau : **rien à faire**, c'est déjà semé sur le coach maison (`20260808190000_house_daily_practices.sql`).

Quatre lots. Chacun est livrable seul.

---

## L0 — Les quatre crans d'activité à l'inscription (~0,5 j)

**Pourquoi** : la colonne, les facteurs et la fourchette ont été posés ce matin
(`20260818100000`, commit `e253fc19`). **Rien ne l'écrit.** Lecteur sans écrivain,
avec en prime un commentaire qui affirme le contraire (`energy_target.ts:49` :
« quatre crans lisibles sont posés à l'inscription »).

L'écart en jeu : `sedentary` 1,45 → `trains_hard` 2,00, soit **38 % d'enveloppe**.
Tout le monde est aujourd'hui à `ACTIVITY_FACTOR = 1.5`.

### ⚠️ 1. Trancher le vocabulaire AVANT d'écrire une ligne

Deux listes `ACTIVITY_LEVELS` coexistent :

| Fichier | Valeurs | État |
|---|---|---|
| `_shared/keel/tokens.ts:702` | `sedentary` `on_feet` `trains_some` `trains_hard` | **commité**, et c'est la contrainte en base |
| `_shared/keel/activity_floor.ts:55` | `sedentary` `lightly_active` `active` `very_active` | **non commité**, autre session |

`parseActivityLevel` d'`activity_floor.ts` rendrait `null` sur **3 valeurs de base
sur 4**, en silence → repli sur 1,5 en croyant avoir demandé. `tokens.ts` gagne
(il a la base et la migration avec lui) ; `activity_floor.ts` s'aligne.

**Coordination requise** : une autre session travaille aujourd'hui sur
`activity_floor.ts`, `activity_stance.ts`, FF-055 et la migration
`20260811100000` (tous non commités). Ne pas écrire dans ces fichiers sans le dire.

### 2. Deux entrées au catalogue de l'entonnoir (`frontend/src/keel/api/onboarding.ts`)

```
{ id: "own_activity_level",
  consumer: "supabase/functions/_shared/keel/meal_envelope.ts#ACTIVITY_FACTORS",
  weight: "wrong", branches: ALL_BRANCHES, step: "people", scope: "self" }

{ id: "member_activity_level",
  consumer: "supabase/functions/generate-household-meal-v1/index.ts#keel_household_bodies_for",
  weight: "wrong", branches: WITH_OTHERS, step: "people", scope: "each_member" }
```

**Pourquoi `wrong` et pas `better`** — la règle littérale dirait `better` (sans
réponse, le plan n'est pas faux, il retombe sur 1,5). Mais le dépôt a déjà écrit
l'argument exact, sur `own_height_cm` :

> « Une taille ne change AUCUN plat en particulier ; elle change toutes les
> quantités, invisiblement. Il n'existe donc aucun moment postérieur pour la
> demander — et "après" signifierait jamais. »

Le niveau d'activité est le même objet : il ne se rattache à aucun plat, donc
aucune question `better` ne peut le porter. Il va dans l'entonnoir, à côté de
taille/genre, qui sont les autres entrées de la même équation.

### 3. Écran

Quatre tuiles dans `SelfStep` (`SetupPage.tsx:1784`), quatre dans `MouthsStep`
(`:1952`). **Jamais un nombre demandé.** Libellés depuis les commentaires de
`tokens.ts` : « assis toute la journée » / « debout une bonne partie du jour » /
« sport 2-3×/semaine » / « sport 4×+ ou métier physique ».

Pas de cinquième tuile « je ne sais pas » : `null` est déjà la non-réponse, et un
jeton d'ignorance deviendrait une réponse qui pèse dans un calcul (cf. `tokens.ts:695`).

### 4. Écriture

- `saveOwnProfile` (`onboarding.ts:1588`) → ajouter `activity_level` au patch ;
- le chemin foyer passe par `keel_household_set_member_body`, **tout-ou-rien** :
  vérifier que la RPC accepte le nouveau champ, sinon la taille et le poids ne
  s'écrivent plus non plus.

### 5. i18n

8 littéraux (4 crans × label/hint), dans `en.ts` **et** `fr.ts`.
⚠️ `fr.ts` **n'est pas dans HEAD** — travail d'une autre session sur le disque.
Livrer dessus, ne pas le commiter.

### 6. Réparer le commentaire menteur

`energy_target.ts:49` affirme le lot déjà fait. Le rendre vrai (ou le corriger si
L0 ne part pas).

**Preuve attendue** : un test qui pose chaque cran et assert le facteur rendu ;
plus le test existant qui **résout `consumer` sur le disque** — il rougit si le
chemin nommé n'existe pas.

---

## L1 — Le formulaire accident, partie A seulement (~1 j)

**C'est le lot qui achète « pas de trous ».**

FF-057 est estimée 4 jours parce qu'elle contient B (le réalignement du plan) et
C (les courses et le décalage temporel). **On ne prend que A.** Le reste est
explicitement séparable — la fiche le dit elle-même.

### Les trois boutons sont déjà spécifiés — ne pas les réinventer

FF-057 §3.A :

| Bouton | Ce que ça écrit |
|---|---|
| J'ai commandé / mangé dehors | décoche + fait `off_plan` (FF-009) |
| Pas eu le temps | décoche seule |
| J'ai mangé autre chose | décoche + `off_plan` **sans aliment inventé** |

### 1. Migration : le verrou est un TRIGGER, pas une contrainte

Les coches vivent dans `protocol_events` (`source='quick_tap'`, append-only), et
la décoche pose `disqualified_reason`. Le périmètre est tenu par
`protocol_events_quick_tap_untick_only`
(`20260805090500_meal_tick_untick.sql:60`), qui lève une exception sur **tout ce
qui n'est pas `food_not_eaten`** :

```sql
if new.disqualified_reason is distinct from old.disqualified_reason
   and coalesce(new.disqualified_reason, 'food_not_eaten') <> 'food_not_eaten'
then raise exception ...
```

Étendre à 3 valeurs. Cette migration finit par un **contrôle qui rejoue les
gestes** (pas une inspection de texte) : le rejouer avec les trois motifs, et
prouver qu'un quatrième est refusé.

### 2. `_shared/keel/meal_tick.ts:94`

`MEAL_UNTICK_REASON` : const unique → union de 3 + parseur. Le front et la
migration lisent la même liste.

### 3. Écran

La décoche existante ouvre les trois tuiles. Une seule liaison
(`frontend/src/keel/lib/useMealTicks.ts`) donc `/app/plan` et `/app/today`
l'héritent ensemble — c'est la raison d'être de ce fichier.

### ⚠️ 4. La dépendance FF-009, et l'arbitrage

Les boutons 1 et 3 écrivent un fait `off_plan` de **FF-009, qui est spécifiée et
non construite** (`meal_declaration_floor.ts`). Deux options :

- **(a) recommandée** — L1 n'écrit que la **décoche motivée**. Le motif seul ferme
  déjà le trou du suivi : on sait *pourquoi* le repas prévu n'a pas eu lieu.
- (b) prendre FF-009 dans le même lot : +1,5 j.

### 5. Ce qu'on NE fait pas, écrit dans la fiche

B (réalignement), C (courses), et la question « la session de cuisine a-t-elle eu
lieu ? ». Sinon le prochain croira FF-057 livrée — c'est le motif exact de la
cicatrice « une garde à moitié livrée ressemble à une garde qui marche ».

---

## L2 — Le log de séance (~1,5 j)

### Table neuve = les trois pièges de ce dépôt

1. **Privilèges** : `authenticated` reçoit TOUT par défaut sur toute table neuve.
   Revoke explicite, puis vérifier `anon` — un `revoke from public` le laisse debout
   (`has_table_privilege('anon', …)`).
2. **RLS ≠ `.eq(user_id)`** : la lecture côté front doit porter le filtre, RLS ne
   le remplace pas.
3. **Le cycle de vie RGPD ne réclame pas les tables neuves** : l'ajouter à
   `account-export-v1` **et** à `purge-deleted-accounts`, sinon la table est hors
   export et hors purge le jour où quelqu'un le demande.

### Forme

```
student_activity_sessions(
  user_id, local_date, kind, duration_min, intensity, source, created_at
)
```

- `kind` fermé et court ; `intensity` en crans, jamais un nombre libre ;
- **aucune colonne kcal** (voir la fourche ci-dessous).

### Le consommateur, et c'est la condition d'existence

La règle mère est écrite à côté des questions (`onboarding.ts:36`) : *on ne
collecte une donnée que si quelque chose en aval la consomme.* Ici l'aval est le
**bilan hebdo** (`week_review_io.ts`) : « 3 séances cette semaine » comme fait,
au même titre que les autres lignes du bilan.

À terme, le vrai consommateur est le **ré-ancrage sur l'observé** — l'« étape 8 »
déjà nommée dans `meal_envelope.ts` : le facteur d'activité réel se déduit de la
trajectoire de poids croisée avec les ingesta sur 3-4 semaines. C'est là qu'une
mesure grossière est rentable. Hors périmètre de ce lot, mais c'est la raison
pour laquelle la table existe.

### ⚠️ Fourche non tranchée : affiche-t-on des kcal brûlées ?

Ce plan est écrit sur **non** — on stocke et on affiche le **fait**, pas le
**dérivé**. Raison chiffrée : le déficit visé est de 400-500 kcal/j, l'erreur
d'une dépense déclarée est de ±30-50 % (soit 150-250 kcal sur une séance annoncée
à 500). La soustraire **augmente** l'incertitude du jour au lieu de la réduire.

Si la décision est **oui** : ce n'est pas une colonne de plus. Il faut passer par
`_shared/keel/energy_gate.ts` (les 5 portes, toutes clés sur `auth.users`) et
décider ce que la journée affiche à côté. Compter **+1 j** et une décision de plus.

---

## L3 — La doctrine (~1 j, surtout de la relecture)

### ⚠️ `grep "no calories"` rend deux règles opposées

| Bucket | Où | Verdict |
|---|---|---|
| **Position produit** | `i18n/en.ts` ~110, 1918, 6025 · `fr.ts` · `LEGAL.md` §6.4 · `CONTRACT.md` amendement non-input #4 · `VALEUR-COACH.md` | **part** |
| **Garde anti-chiffre NU** | `meal_analysis.ts:632` (« YOU ARE NOT A CALORIE COUNTER ») · `week_plan_generation.ts:346` · `meal_generation.ts:1692` · `coach-protocol-v1:233` | **reste** |

La seconde n'est pas de la pudeur : quantités fournies → **2,3 % de MAPE** ;
quantités devinées sur photo → **−26,6 % de biais**, toujours flatteur. La retirer
ne donne pas un vrai chiffre, elle donne un faux chiffre assuré.

### Le test de propriété se RETOURNE, il ne se supprime pas

`CALORIE_REVERSAL.md` l'écrit : `no_calorie_to_student_property_test.ts` passe de
« aucune énergie » à « **aucune énergie sans base** », plus une 4ᵉ couche — tout
rendu qui affiche des kcal affiche sa base (`declared_quantities` / `photo_estimate`).

### Le cas ambigu, à trancher ici

`doctrine_from_forks.ts:258` — « NO NUMBERS ANYWHERE. […] no "eight hours", no
"2 litres" ». C'est le seul littéral qui est à cheval entre les deux colonnes :
il vise la doctrine d'un coach, pas une sortie de modèle. À décider explicitement.

### Et clôturer

Mettre `CALORIE_REVERSAL.md` à jour (il dit encore « rien de ce qui suit n'est
fait », alors que l'étape 0 est close depuis ce matin).

---

## Ordre, et pourquoi

```
L0 ──┐
     ├──► L2 ──► L3
L1 ──┘
```

- **L0 et L1 sont indépendants** — rien en commun, parallélisables.
- **L2 après L1** : même écran d'entrée, et L1 valide le geste « je dis ce qui
  s'est vraiment passé » avant qu'on l'étende à l'exercice.
- **L3 en dernier** : c'est le seul lot dont une erreur se voit **en public**. Il
  est plus sûr de réécrire la copy quand le produit fait déjà ce qu'elle annonce.

## Ce qui n'est PAS dans ce plan

- L'eau — déjà semée et livrée (`hydration`, `cadence: constant`, coach maison).
  Le seul cran ouvert est `askable: true` → `remind_only` si on veut un rappel et
  jamais une question. Une valeur, pas un lot.
- Le réalignement du plan après un accident (FF-057 B et C).
- Le ré-ancrage de l'activité sur l'observé (« étape 8 »).
- L'ajustement des repas depuis une séance — **écarté** le 2026-08-18.
