# Rapport — LOT I, le régime alimentaire par bouche, et lu par le foyer

> Branche `ff-001-quotidien-du-coach`. Commits **`6b782093`** (moteur + base) et
> **`8ef6cf09`** (les deux écrans).
>
> Les deux trous de la spec sont fermés ensemble, comme elle l'exigeait.

---

## 0 · Le défaut ①, MESURÉ en run réel avant/après

Ce n'était pas une hypothèse. Même foyer, même fenêtre, même modèle, deux runs :

| | plats portant de la viande |
|---|---|
| **avant** (rien de déclaré) | **6 violations** — 4 plats + 2 préparations : `Salade de poulet rôti et riz`, `Poulet rôti, riz et légumes`, `Poulet rôti, légumes et salade`, `Poulet rôti et légumes avec pommes de terre`, `Poulet rôti aux herbes`, `cuisses de poulet` |
| **après** (Christèle végétarienne) | **0 violation** sur 15 plats + 4 préparations |

Le scan n'est pas fait à l'œil : il applique `excludedSurfaceFormsFor()` +
`isPlantAnalogue()` + `normalizeForMatch` — **les formes de surface du moteur
lui-même**, jamais une seconde liste.

---

## 1 · Livré

### I1 · La colonne et la porte — `supabase/migrations/20260814110000_dietary_regime_per_mouth.sql`

`public.household_members.diet text`, `check` sur la liste **fermée** de quatre
jetons (`omnivore` compris — c'est une **réponse**, pas une absence).

- **Appliquée** par `docker exec … psql -f`, **inscrite à la main** dans
  `supabase_migrations.schema_migrations`.
- **Idempotente : rejouée TROIS fois**, verte les trois.
- **Privilèges mesurés** après application :
  `keel_household_set_member_diet` → anon **f**, authenticated **t** ·
  `keel_household_roster_for` → anon **f**, authenticated **f**, service_role **t** ·
  `keel_household_roster` → anon **f**, authenticated **t**.
- Le bloc de contrôle final **rejoue les gestes sous une identité**
  (`set_config('request.jwt.claims')`) puis **rollback** : sans identité,
  `auth.uid()` est nul et le contrôle serait **vert en ne prouvant rien**.
  Il prouve `bad_diet`, `not_a_member`, **le cas qui PASSE** (écriture +
  relecture par le roster), et `has_account`. **Zéro résidu vérifié** après les
  trois rejeux.

### I2 · La RPC — cinq motifs, tous en LITTÉRAL

`not_authenticated` · `bad_diet` · `not_a_member` · `not_your_line` ·
**`has_account`**.

⚠️ **`has_account` n'est PAS dans la liste de la spec, et il est obligatoire** —
écart assumé et documenté dans la migration. R2 fait que le roster **ne lit pas**
la colonne d'une bouche qui a un compte : une porte qui accepterait cette
écriture rangerait la réponse dans une colonne que personne ne relit, soit le
**no-op silencieux** que ce dépôt documente le plus souvent. C'est le patron
exact de `keel_household_set_member_goal` depuis D1, et l'écran s'en sert pour
**masquer** le contrôle plutôt qu'afficher une promesse qui échoue.

**Pas de `no_household`** : un appelant sans foyer ne trouve pas la bouche
(`= null` n'est jamais vrai) et s'entend dire `not_a_member`. Patron de Lot G.

### I3 · Le roster tranche, une seule fois (R2)

`keel_household_roster_for` rend `diet`, résolu par la **même** règle que `goal`
et `eating_rhythm`. Une seule différence, et elle est dans la **source** : le
régime d'un compte vit sur **deux** supports et il faut les deux —

- `student_safety_constraints` (`kind='diet'`, **`status='active'`**, filtre de
  `loadSafetyConstraints`) porte les trois régimes ;
- `practical_constraints.diet_asked` porte l'omnivore, parce qu'« aucune
  restriction » n'a **aucune ligne** à poser. Sans lui, un omnivore déclaré
  serait rendu `null`, c'est-à-dire « on n'a jamais demandé ».

**Mesuré** : `Thomas|owner|muscle_gain|omnivore` — sa réponse arrive du compte,
pas de sa colonne.

### I4 · Le moteur — `supabase/functions/_shared/keel/household_diet.ts`

**N'invente aucun moteur.** Il ne connaît ni les groupes exclus, ni les formes de
surface, ni la consigne : tout vient de `dietary_regime.ts`. Il ajoute seulement
ce que ce module ne pouvait pas savoir — qu'il y a **plusieurs bouches autour
d'une seule casserole**.

- **R4** `strictestRegimeAt()` — classe par **nombre de groupes exclus**, lu sur
  `excludedGroupsFor()`. Ce classement n'est légitime que si les exclusions
  s'emboîtent ; un test le **PROUVE paire par paire** sur la liste fermée. Le
  jour où un régime non comparable entre, ce test rougit **avant** qu'un
  « plus strict » n'ait été choisi sans exclure tout ce que la table exclut.
- **R5** `dietDiverges()` — **deux prémisses armées** : ① le plus strict de la
  table est plus strict que le sien (sinon le plat commun **est** son plat), et
  ② `dietServingConflicts()`.
- Le plafond : **seul l'axe protéine**, et **seulement** pour un régime qui
  retire **toute ancre protéique animale** — `ANIMAL_PROTEIN_ANCHORS` est
  **dérivé** de `PROTEIN_SOURCES` (`tokens.ts`) en nommant les trois exceptions
  végétales, pas les sept animales : un groupe animal ajouté demain est compté
  **sans qu'on y touche**.
- **Le temps n'est PAS ici** : `timeAllowsASecondDish` plafonne déjà, une fois,
  chez l'appelant (G5). Le relire ferait deux endroits qui décident du même plat.

**C'est exactement ce qui sépare les deux cas de la spec** : `vegan` → plafonne
(œufs et laitages partis) ; `vegetarian` → ne plafonne pas.

### I5 · Le générateur du foyer honore les régimes

- `RosterRow.diet` + `LoadedMember.diet`. ⚠️ **PAS sur `PortionMember`**, et
  c'est voulu : un régime gouverne ce qu'il y a **dans** la casserole, jamais la
  taille d'une part. Le mettre sur le brief de portions inviterait « ta part
  végétarienne » dans une consigne lue à voix haute — ce que
  `FORBIDDEN_PORTION_TERMS` n'attrape pas.
- La divergence entre par un **`||`** dans le calcul livré la veille, jamais par
  une seconde liste : deux listes donneraient **deux** plats dédiés à qui diverge
  des deux façons, pour un seul repas.
- Le bloc de prompt **cite `dietaryRegimePromptLine` mot pour mot** (un test le
  tient pour les trois régimes) et le place **avant** `restrictionBlock` : les
  règles de maison **restent les dernières** — un test le tient aussi. Démoter
  cet invariant depuis ce lot aurait été le casser en silence.
- `plan_rationale.ts` le dit, FR + EN, singulier **et** pluriel, avec trois
  prémisses armées.
- `HOUSEHOLD_PROMPT_VERSION` : v10 → **`v11_dietary_regime_at_the_table`**.
  `MEAL_PROMPT_VERSION` **ne bouge pas**.

### I6 · Les deux écrans

`/app/setup` étape 3 (sous chaque bouche) et `/app/household` (fiche de la
bouche, entre le corps et les habitudes : **ceci dit ce qu'elle ne mange JAMAIS,
la carte du dessous ce qu'elle mange À LA PLACE**).

**Rien n'est pré-allumé**, et **re-cliquer efface** — le seul moyen de revenir à
« on n'a pas demandé ». Une bouche **avec compte** ne montre pas les boutons :
elle lit « elle a un compte, ça se règle dans son "à propos de toi" ».

---

## 2 · MESURÉ — les trois preuves

Foyer `b9a92acb-6d78-4ebc-bc23-174d1b237ac5`. `docker restart
supabase_edge_runtime_Sophia_2` avant le premier run. **Les trois runs sont des
`intent: "draft"` : aucun plan écrit.**

⚠️ **Le plan de l'utilisateur n'a PAS été déplacé.** Lot G avait dû le décaler
trois fois. `window_beyond_this_week` et `plan_overlaps_existing` se ferment
mutuellement — mais le second **nomme sa propre sortie** (« Cover it to its last
day »). Une fenêtre `2026-08-15 + 5 j`, qui couvre le plan existant jusqu'à son
dernier jour, passe en 200. **Aucun `UPDATE` sur `student_generated_meals`.**

### Preuve ② — le désarmement

```
strictest_regime: null, regimes: 0
```
Aucun bloc de régime dans le prompt. ⚠️ **Un run ne peut PAS prouver la
byte-identité avec l'avant-lot** : le code est déjà changé, il n'y a plus de
« avant » à interroger. La preuve est **unitaire** — `dietBlock: ""` tombe du
`filter`, et `dietBlock: "   "` rend une chaîne **de longueur identique**, donc
le bloc vide coûte **exactement 0 caractère**.

### Preuve ① — le cas qui PASSE

```
strictest_regime: "vegetarian", regimes: 1
```
**0 violation** sur 15 plats + 4 préparations (contre **6** au run précédent).
Rationale rendue par le run :
> « **Le plat commun est végétarien : c'est ce que Christèle mange.** »

### Preuve ③ — végane

```
strictest_regime: "vegan", regimes: 1
```
**0 violation** (formes véganes : ni viande, ni poisson, ni œuf, ni laitage, ni
miel) sur 15 plats + 3 préparations. Boisson soja, yaourt de soja, tofu,
lentilles, pois chiches. Rationale :
> « **Le plat commun est végane : c'est ce que Christèle mange.** »

### La RPC depuis un vrai appelant authentifié — ce que Lot G n'avait pas pu faire

En HTTP, à travers PostgREST, avec le jeton du maître :

```
p_diet="chocolatarian"            → {"ok": false, "reason": "bad_diet"}
p_member=<ligne du maître>        → {"ok": false, "reason": "has_account"}
p_member=<Christèle>, "vegetarian"→ {"ok": true}
```

### État final des données de l'utilisateur — vérifié

`Christèle.diet = NULL` (remis). Plan `54123905` :
`starts_on/ends_on/duration_days = 2026-08-13 / 2026-08-19 / 7` **et
`updated_at = 2026-08-14 14:25:49.609569+00`** — **identiques à l'octet près**,
`updated_at` compris (c'est la trace résiduelle que Lot G avait laissée).
Session forgée **supprimée** (`0` restante). Fixture Bramble remise à `NULL`.

---

## 3 · Ce que le NAVIGATEUR a montré

Port **5194** (`frontend-a24`, entrée neuve dans `.claude/launch.json` —
**non commitée**). Session ouverte par l'API pour la fixture, puis **jeton HS256
forgé** pour le compte du foyer visé, la ligne `auth.sessions` étant **créée puis
supprimée**. Aucun mot de passe tapé.

- **`/app/household`, Lea (sans compte)** — « HOW THEY EAT / Eats everything /
  Vegetarian / Vegan / Pescatarian ». Clic sur *Vegetarian* → la base porte
  `Lea|vegetarian`, **écrit par la vraie RPC depuis le navigateur**, et le bouton
  revient en `bg-fig-700` (sélectionné) après le rechargement de la page.
- **`/app/household`, Nina (compte réclamé)** — **aucun bouton**, et la phrase
  « They have an account: how they eat is set in their own « about you » ».
- **`/app/setup` étape 3, sous Christèle** — le contrôle est là. **C'est
  littéralement ce que l'utilisateur a demandé deux fois.**
- **320 px** — mesuré dans une **iframe de largeur fixe** (`resize_window` ment) :
  `scrollWidth == clientWidth` (**aucun débordement horizontal**), les quatre
  boutons passent sur deux lignes, bord droit max 250 px.

**Un défaut d'écran trouvé et corrigé au passage** : l'étiquette réutilisée
disait « **How YOU eat** » sous le prénom de quelqu'un d'autre — la deuxième
personne y désigne le lecteur, pas la ligne qu'il remplit. Remplacée par
`setup.table.diet_label` (« How they eat »).

---

## 4 · Trouvé hors spec

1. **Le modèle n'a PAS produit de plat dédié au run ③**, alors que
   `shape: one_session` et que le bloc nomme Thomas comme divergent. 15 plats =
   5 jours × 3 créneaux, **aucun plat en plus** : il a résolu la divergence **par
   la PORTION** (« Une portion plus grande de tofu, de riz ou de pâtes »). C'est
   le même comportement que Lot G a mesuré à sa preuve ②. La consigne est servie,
   le modèle choisit.
2. **La divergence par le RÉGIME n'a pas été observable seule** sur ce foyer :
   Thomas **divergeait déjà** par sa direction de service (`muscle_gain` contre
   une table `maintenance`) — la liste `diverging` est **identique aux trois
   runs**. Le chemin propre au régime est tenu par **test unitaire uniquement**
   (voir §5).
3. **`has_account` n'était traduit nulle part.** `keel_household_set_member_goal`
   le rend depuis D1, mais l'écran masquait le contrôle : personne ne l'avait
   jamais vu. Ajouté à `HOUSEHOLD_REFUSAL_KEYS` (sur le disque).
4. **La couture de namespace mord sur les libellés partagés.** Réutiliser
   `setup.people.diet_*` depuis `/app/household` a fait rougir
   `pageSeams.int.test.ts` — une page ne doit pas atteindre le namespace d'une
   autre (la couverture de locale se mesure **par namespace**). Les **libellés**
   sont donc dupliqués dans `household.member.diet_*` ; la **liste**
   (`DIET_ANSWERS`) reste importée et unique — c'est elle qui est load-bearing.
5. **La fixture Bramble ne peut pas quitter l'étape 2 de l'entonnoir** : ses
   bouches n'ont ni taille, ni poids, ni sexe, donc `missesForStep(…, "people")`
   retient. Rien à voir avec ce lot — mais c'est ce qui a obligé à vérifier
   l'étape 3 sur le foyer réel plutôt que sur la fixture.
6. **`omnivore` reste écrit « I eat everything » sous le prénom d'un tiers** sur
   `/app/setup`. Non corrigé **exprès** : la même réponse figure en tête de la
   même carte pour le titulaire, et n'en changer qu'une des deux ferait lire la
   MÊME réponse de deux façons sur un seul écran — pire que l'incohérence
   actuelle.

---

## 5 · Ce que je n'ai PAS pu vérifier

- **La byte-identité par run réel** — impossible par construction. Tenue au
  niveau unitaire (deux assertions de longueur **et** de chaîne).
- **La divergence déclenchée par le SEUL régime, en run réel** — voir §4-2.
  `dietDiverges` est tenue par un test qui **arme et désarme les deux
  prémisses** une par une, jamais par un run.
- **Le refus `not_your_line` depuis un vrai secondaire** — vérifié en base sous
  `set_config('request.jwt.claims')`, pas depuis un navigateur authentifié en
  secondaire : le foyer visé n'a pas de second compte réclamé.
- **Le cas « ≥ 2 bouches portent le régime le plus strict »** (pluriel de la
  phrase de rationale) — tenu par le test anti-culpabilisation, **jamais vu en
  run réel** : aucun foyer local ne porte deux régimes déclarés.
- **`pescatarian` en run réel** — seuls `vegetarian` et `vegan` ont été
  composés. Le jeton est couvert unitairement (classement, plafond, consigne).
- **L'écran `/app/setup` en français** — les deux écrans ont été lus en
  **anglais** (locale du navigateur de test). Les clés FR sont posées et
  typées, pas vues à l'écran.

---

## 6 · Rouges consignés, PAS réparés

- `src/edge/coverage-guard.int.test.ts` — **2 échecs**, annoncés par le prompt.
- `src/keel/copy/planRefusals.int.test.ts` — **1 échec**, les **7 orphelins**
  `household.error.*` annoncés par le prompt. ⚠️ Vérifié : ce sont **exactement
  les 7 mêmes** (`body_incomplete`, `bad_height`, `bad_weight`, `bad_gender`,
  `minor_cannot_be_reference`, `age_unknown_cannot_be_reference`,
  `not_your_household`) — mes deux clés neuves sont atteignables.
- `src/keel/i18n/pageSeams.int.test.ts` — **1 échec, NON annoncé par le prompt**,
  et **pas le mien** : trois coutures `allergen.*` depuis `/join-household`,
  `/app/household` et `/app/plan` (`keel/copy/allergens.ts`, fichier **modifié
  par une autre session**). La couture que j'avais introduite est **partie**,
  vérifié.
- Deno : **3026 passed | 0 failed**. Frontend : **919 passed | 4 failed**, les 4
  ci-dessus.

## 7 · Ce qui n'est PAS commité, exprès

`en.ts` · `fr.ts` · `planRefusals.ts` · `.claude/launch.json` — règle de séance.
**Conséquence à connaître :** l'arbre commité ne porte pas
`setup.table.diet_label`, `setup.table.diet_hint`, `household.member.diet*`,
`household.error.bad_diet`, `household.error.has_account` ni l'entrée
`bad_diet`/`has_account` de `HOUSEHOLD_REFUSAL_KEYS`. Les deux écrans
**typechecke­nt et tournent sur le disque**; sur un arbre fraîchement cloné,
`t()` lèverait sur ces clés.
