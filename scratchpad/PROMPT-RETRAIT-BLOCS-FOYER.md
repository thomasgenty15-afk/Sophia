# Chantier — Trois blocs qui ne servent personne, et un geste qui manque

> **Mission.** Trois surfaces montrent au foyer quelque chose d'illisible, de
> vide, ou de moins bon que son voisin: tu les retires (A, B, C). Une
> quatrième chose est produite par le moteur et n'atteint aucun écran: tu la
> montres (D). Le propriétaire du produit a tout regardé en vrai le 2026-08-14.

Ce document est autoportant. Il porte l'état mesuré, ce qui est décidé, et
**le seul endroit où tu dois t'arrêter et demander**.

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`.** Pas de `push`, pas de merge.
2. **`git add -A` est INTERDIT.** D'autres agents écrivent en parallèle dans ce
   dépôt, en ce moment. Chaque commit liste **explicitement** ses chemins.
3. ⚠️ **`frontend/src/keel/i18n/en.ts` EST TENU PAR UNE AUTRE SESSION** —
   3126 insertions / 998 suppressions non commitées au 2026-08-14. Le type
   `MessageKey` en dérive, donc toute suppression de clé y passe.
   **Tu ne le commites pas.** Tu retires les **appelants**; les clés
   deviennent orphelines et se balaieront dans un lot i18n séparé. Vérifie son
   état (`git status --porcelain -- frontend/src/keel/i18n/en.ts`) avant de
   décider: s'il est redevenu propre, tu peux retirer les clés et le dire.
4. **Typecheck** : `cd frontend && npx tsc -b` (`tsconfig.json` a `files: []`
   et ne vérifie **rien**). Tests : `npx vitest --config vitest.config.ts run`.
   Deno : `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
5. **Commandes à risque : jamais seul** (`db push`, `db reset`,
   `functions deploy`, `secrets`, `link`). Tu les écris dans ton rapport.
6. **Un retrait se prouve par l'absence d'appelant, pas par l'intention.**
   `grep` en retirant les commentaires — un grep naïf compte des morts comme
   des vivants (cicatrice `caller-audit-must-strip-comments`).

---

## 1. Retrait A — « Quelqu'un cuisine de son côté »

### Ce que ça donne à l'écran, en vrai

Sur un foyer de **deux bouches, aucune réclamée** :

> **Quelqu'un cuisine de son côté**
> Personne dans le foyer ne cuisine de son côté en ce moment. Tout le monde
> mange le plan du foyer.
> Il reste 4 fusions sur 4 cette semaine.
> **Non proposés** — Christèle · Cette personne n'a validé aucun plan à elle.

Trois phrases pour dire qu'il ne se passe rien, un quota que personne n'a
entamé, et le nom de quelqu'un suivi d'un reproche pour une chose qu'elle ne
**peut pas** faire.

### La règle produit, arrêtée le 2026-08-14

> **La fusion n'existe qu'entre profils réclamés.** Une bouche sans compte ne
> compose rien, donc n'a rien à fusionner. Et le geste appartient au
> **titulaire** : c'est lui qui, voulant changer SA part, demande une fusion —
> laquelle n'affecte que sa part.

Conséquences, dans cet ordre :

1. **Zéro profil réclamé ⇒ le bloc n'existe pas.** Pas d'état vide, pas de
   quota, pas de liste « non proposés ». La condition d'affichage est
   « au moins un membre avec `user_id` non nul, en plus du maître ».
2. **Un membre sans plan à lui ne se nomme pas.** La ligne « Christèle — cette
   personne n'a validé aucun plan à elle » explique une absence à quelqu'un qui
   ne peut rien en faire: seul le titulaire peut valider un plan à lui, et il
   ne lit pas cet écran-là.
3. **Le quota ne s'affiche que s'il a commencé à être consommé.** « 4 sur 4 »
   est un chiffre qui ne dit rien; « il reste 1 sur 4 » est un fait qui compte.

### Où c'est

- `frontend/src/keel/components/HouseholdMergeCard.tsx`
- `frontend/src/keel/pages/HouseholdPage.tsx` (le montage)
- Clés `household.merge.*` (i18n — voir §0.3)
- Côté lecture : `claimableMembers` et les vues de fusion dans
  `frontend/src/keel/api/household.ts`

**NE TOUCHE PAS** au moteur de fusion côté serveur (`household_merge.ts`,
`household_merge_quota`, les RPC `keel_household_*_merge_*`). Ce chantier
retire une SURFACE, pas une mécanique: le jour où un profil est réclamé, la
fusion doit marcher exactement comme aujourd'hui. Un test doit le prouver.

---

## 2. Retrait B — « Ce que tu cuisines »

### Le verdict

> « La partie *ce que tu cuisines* ne sert à rien, le plan dans *tes sessions
> de cuisine* est 15× mieux. »

Les deux blocs disent la même chose, et le second le dit mieux :
`meals.kitchen.*` (« What you cook ») liste les préparations et les jours
qu'elles nourrissent ; `meals.sessions.*` (« Your cooking sessions ») porte la
même information **plus** le temps de session, les portions faites et le
travail actif.

### Où c'est

- `frontend/src/keel/components/plan/KitchenBlock.tsx` — le composant.
- `frontend/src/keel/components/plan/PlanResult.tsx:19` (import) et `:145`
  (montage). **Ce sont les deux seuls appelants** — vérifié le 2026-08-14.
- Clés `meals.kitchen.*` (i18n — voir §0.3).

### Ce qu'il faut vérifier AVANT de supprimer

L'en-tête de `KitchenBlock.tsx` affirme qu'il porte quelque chose que la grille
ne porte pas :

> *« Un plat en lot est DÉJÀ placé sur chacun des jours qu'il couvre […]
> Ce bloc est donc ce qui rend le repli des jours acceptable: le lien "une
> casserole → trois jours" ne dépend plus de voir les trois jours ensemble. »*

**Épreuve exigée** : sur un plan réel avec une préparation qui couvre trois
jours, ouvre « Tes sessions de cuisine » et montre que le lien
casserole → jours **y est visible**. S'il n'y est pas, ne supprime pas: dis-le,
et propose de le porter dans les sessions d'abord. Le retrait ne doit pas
emporter le seul endroit qui montre qu'une cuisson nourrit plusieurs jours.

---

## 3. Retrait C — « À table » ⚠️ LE SEUL OÙ TU DOIS T'ARRÊTER

### Le verdict

> « On comprend rien, c'est flou, ça sert à rien, faut dégager cette partie,
> **dans la génération aussi**. »

### Où c'est

- `frontend/src/keel/components/plan/TableCard.tsx` — la carte.
- `frontend/src/keel/pages/StudentWeekPlanPage.tsx:14` (import) et `:2375`
  (montage). Seuls appelants.
- Clés `plan.table.*` (et `household.portions.*`, dont l'en-tête d'`en.ts` dit
  qu'elles ont migré sous `plan.table.*`).
- **Côté génération** : `supabase/functions/_shared/keel/household_portions.ts`
  — c'est lui qui produit les `portion_note` que la carte affiche.

### ⛔ POURQUOI TU NE SUPPRIMES PAS `household_portions.ts` SANS DEMANDER

La carte est un AFFICHAGE. Le module, lui, est **la bifurcation des portions** :
le même plat servi différemment selon l'objectif de chaque personne.

C'est nommé dans `docs/keel/PIVOT-FOYER.md` §7.1 comme **l'intersection vide —
cuisson × divergence nutritionnelle**, c'est-à-dire l'argument de
différenciation n°1 du produit, et c'est la démonstration entière de la cible
« couple à objectifs divergents ». Le supprimer parce que sa CARTE est illisible
reviendrait à jeter le moteur parce que le tableau de bord est mal dessiné.

**Ce que tu fais, dans cet ordre :**

1. **Mesure d'abord.** Génère un plan de foyer réel (ou lis les dernières
   lignes `student_generated_meals` où `plan_kind = 'household'`) et **cite
   textuellement** les `portion_note` produits, pour 2 membres et pour 3.
2. **Rapporte le constat**, en une ligne par cas :
   - Si les notes portent une **vraie divergence** (« Marc : 1,5 part +
     féculent en plus ; Léa : 1 part »), le moteur fait son travail et c'est
     l'affichage qui échoue.
   - Si les notes sont **génériques ou vides** (« une part normale » pour tout
     le monde), **c'est un défaut du moteur, et l'entrée n'est pas l'excuse.**

   ⚠️ **L'objectif de chaque bouche EST collecté et EST fiable.** Vérifié le
   2026-08-14: l'entonnoir d'inscription demande, par bouche, prénom /
   adulte-ou-enfant / date de naissance / objectif / allergies, et il **refuse
   de se terminer** sur le motif nommé `adult_without_birth_date`
   (`frontend/src/keel/api/onboarding.ts`, `personMisses`) — précisément pour
   qu'un objectif ne puisse pas être avalé par une date manquante. Et
   `/app/household` le redit: *« Saved, and not applied yet: a direction needs
   an age. »*

   Donc si deux bouches ont des objectifs différents et que les notes se
   ressemblent, **ce n'est pas faute de données**. Cite les objectifs lus dans
   `household_members.goal` à côté des notes produites: c'est cette
   juxtaposition qui tranche.
3. **Retire la carte dans les deux cas** — c'est décidé, elle ne revient pas.
4. **N'AVANCE PAS sur `household_portions.ts`.** Rends le constat et demande.
   La décision « on garde la bifurcation et on la montre autrement » et la
   décision « on abandonne la bifurcation » n'ont pas le même prix, et elle
   appartient à l'humain.

### ⚠️ ET LE VRAI SUJET EST À CÔTÉ — mesure-le dans le même passage

Arbitrage du propriétaire, 2026-08-14 :

> **Ne pas respecter les habitudes alimentaires de quelqu'un est ce qui coûte
> le plus cher.**

Il a raison, et ça range les deux choses: une part mal calibrée s'ajuste à
table en trois secondes; un plan qui ignore ce qu'on lui a dit est une promesse
rompue, et celle-là se voit au premier jour.

**Or ce canal n'existe pas pour une bouche sans compte.** Mesuré le
2026-08-14: `household_voices_io.ts` charge les préférences par
`.in("user_id", …)` sur `student_goals`. Une bouche sans compte n'a pas de
ligne `student_goals`, donc **aucune habitude nulle part** — le foyer lui donne
des allergies (`household_member_allergies`) et rien d'autre.

Conséquence: dans une famille de quatre sans profil réclamé, **seules les
habitudes du maître atteignent le plan.** L'enfant qui ne mange jamais le matin
ou qui déteste le poisson n'a aucun endroit où le dire.

**À ajouter à ton constat du §3.2**, en une ligne chacun :

- Sur un plan de foyer réel, les habitudes écrites du MAÎTRE sont-elles
  honorées ? Le journal `keel.meal.written_instructions` en donne le compte
  (`declared` / `silent`), et `issues` porte les consignes avalées.
- Combien de bouches du foyer ont un `user_id` non nul, donc un canal
  d'habitudes ? (Attendu: le maître seul, dans le cas courant.)

Ces deux chiffres décident du chantier suivant, et ils valent plus que
l'arbitrage sur les portions.

---

## 3bis. Ajout D — le geste du soir, devant chaque plat

**Le seul lot qui CONSTRUIT au lieu de retirer.** Demande du propriétaire,
2026-08-14 :

> Dans le planning de cuisson, il faut aussi la cuisson minimale / la
> préparation à faire **avant chaque plat**. Il y a les grosses sessions de
> cuisine, mais il y a aussi le geste de début de plat — réchauffer, couper.

### La donnée EXISTE DÉJÀ. Elle est cachée à l'endroit exact où elle sert.

Trois faits mesurés le 2026-08-14 :

1. **Le prompt la demande, en toutes lettres** (`meal_generation.ts`, section
   « préparations et plats ») :

   > *« a dish that draws on a preparation does NOT repeat its recipe. Its
   > method is what you do at that meal: "reheat a portion, add the salad and
   > the lemon". »*

   Le `method` d'un plat qui puise dans un lot **est** le geste du soir.

2. **`DishCard.tsx:189` le masque exactement sur ces plats-là :**

   ```tsx
   const leftover = servedFrom !== null || sources.length > 0;   // :102
   …
   {!leftover && dish.method && ( … )}                           // :189
   ```

   Un plat qui puise dans une préparation est `leftover`, donc son `method`
   n'est **jamais** affiché. Le plat cuisiné de zéro montre sa recette; le plat
   qui a besoin qu'on dise « réchauffe 10 min, tranche le poulet » ne montre
   rien.

3. **`CookingSessions.tsx:204`** affiche `prep.method` — la grosse cuisson.
   Le geste du soir n'apparaît donc **nulle part** dans le produit.

### Le travail

- **Afficher `dish.method` sur les plats `leftover`**, sous un libellé qui dit
  ce que c'est: le geste du soir, pas une recette. Clé i18n distincte de
  `meals.result.method` (voir §0.3 pour `en.ts`).
- **Le faire apparaître dans le planning**, pas seulement sur la carte du
  plat: c'est la demande. « Tes sessions de cuisine » porte les grosses
  cuissons; chaque plat doit porter son geste, là où on lit le jour.
- **Ne pas inventer un champ tant que celui-ci n'a pas été regardé.** Si le
  modèle écrit bien l'assemblage dans `method`, c'est un lot d'AFFICHAGE et le
  prompt ne bouge pas.

### Ce qu'il faut vérifier avant d'écrire une ligne

Sur un plan réel, **cite trois `method` de plats `leftover`**. Puis tranche :

- Ils décrivent un **geste court** (« réchauffe, ajoute la salade ») ⇒ pur
  affichage. C'est l'attendu.
- Ils **répètent la recette du lot** ⇒ le modèle ne suit pas la consigne qui
  existe déjà, et c'est un défaut de prompt AVANT d'être un défaut d'écran.
  Ne l'affiche pas tel quel: un pavé de recette recopié sous chaque plat est
  pire que le vide d'aujourd'hui.
- Ils sont **vides** ⇒ dis-le, et n'affiche pas un libellé au-dessus de rien.

### Deux gardes

- **Aucune durée inventée.** Si le modèle ne dit pas combien de temps, l'écran
  ne l'estime pas. `active_minutes` existe sur les PRÉPARATIONS, pas sur les
  plats: le reprendre pour un plat serait donner à un assemblage le temps
  d'une cuisson.
- **Un plat sans `uses` ne change pas.** Il montre sa recette comme
  aujourd'hui; ce lot n'ouvre que le cas `leftover`.

---

## 4. Les preuves à produire

1. **Foyer à 2 bouches, 0 réclamé** : capture d'écran de `/app/household` —
   aucun bloc de fusion, aucun nom, aucun quota.
2. **Foyer avec 1 profil réclamé** : capture — le bloc revient, et une fusion
   fonctionne de bout en bout (le moteur n'a pas été touché).
3. **Le plan** : capture montrant que « Tes sessions de cuisine » porte le lien
   casserole → jours (§2).
4. **Les `portion_note` cités**, tels quels, sur un plan réel (§3.1).
5. `npx tsc -b` exit 0 · `npx vitest run` vert · suite Deno verte.
6. **320 px et 1280 px** (`flex-1` ne rétrécit pas un input : `min-width: auto`).
   Screenshot à `scroll 0` — le panneau du navigateur ne repeint pas ailleurs.
7. **L'audit d'appelants**, commentaires retirés, pour chaque symbole supprimé.

---

## 5. Hors périmètre — exprès

- ❌ Le moteur de fusion côté serveur (§1).
- ❌ `household_portions.ts` (§3.4) — constat seulement.
- ❌ La suppression des clés dans `en.ts` / `fr.ts` tant que le fichier est
  tenu (§0.3).
- ❌ Toute migration, toute fonction edge, tout déploiement.
- ❌ Le reste de `/app/household` (les bouches, les allergies, les envies).

---

## 6. Le rapport

`scratchpad/RETRAIT-BLOCS-FOYER-RAPPORT.md` : ce qui est retiré avec la preuve
d'absence d'appelant, les captures, **les `portion_note` cités**, la question
ouverte du §3, et les clés i18n laissées orphelines avec la raison.

**Un échec ne se masque pas.** Un lot rouge se consigne rouge, et tu passes au
suivant.
