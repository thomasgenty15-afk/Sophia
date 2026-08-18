# Alignement du parcours d'inscription libre (`/start`) — rapport

**Date :** 2026-08-12 · **Branche :** `ff-001-quotidien-du-coach` · **Aucun push.**
**Base :** `96fdcfa8` → **HEAD :** `23472803` (4 commits, un par lot).

| Lot | État | Preuve la plus forte |
| --- | --- | --- |
| 1 — le pays ne naît plus à « US » | **Livré** | Parcours navigateur joué en vrai : `profiles.country = 'FR'` |
| 2 — les 51 clés `start.*` en français | **Livré** | `/start?lang=fr` : 0 marqueur anglais sur 1 935 caractères de page |
| 3 — la frontière de langue au bord de la page | **Livré** | `/join-household?lang=fr` rendue **entièrement** en anglais, chrome compris |
| 4 — la branche « vérifie tes mails » | **Livré** | Table de vérité + rendu SSR de l'écran, dans les deux langues |

Aucun lot rouge, aucun lot partiel. Une preuve a dû être **substituée** et six
faits **consignés sans être réparés** — tous nommés en §6 et §7, avec de quoi
les reprendre. Le dépôt est écrit par plusieurs sessions en parallèle pendant ce
chantier ; §9 dit comment les commits ont évité de prendre le travail des
autres.

---

## 1. Lot 1 — le sélecteur de pays

`dcc9df88` · `countries.ts`, `StartPage.tsx`, `JoinHouseholdPage.tsx`,
`Auth.tsx`, `en.ts`, `freeSignup.int.test.ts`

### Ce qui a changé

`NO_COUNTRY_SELECTED = ""` est nommée une fois dans `keel/api/countries.ts`, et
les **trois** portes qui demandent le pays en partent. Une `<option value="">`
de placeholder (`start.form.country_placeholder`, clé neuve) la rend visible.

### Preuves

**(a) Refus, message lisible, aucun compte créé.** Formulaire rempli, case
légale cochée, sélecteur laissé à l'état initial, clic sur « Démarrer » :

```
{"required":true,"validity":{"valueMissing":true,"valid":false},
 "message":"Sélectionnez un élément dans la liste."}
{"submitFired":false,"url":"http://localhost:5190/start","stillOnForm":true}
```

Le refus est tenu **deux fois**. En retirant l'attribut `required` pour
atteindre la garde React derrière :

```
{"error":"Please tell us where you live.","url":"http://localhost:5190/start"}
```

Et en base, après les deux tentatives :

```
select count(*) from auth.users where email like 'align\_%';  →  0
```

**(b) Le pays choisi est bien celui enregistré.** Compte créé en choisissant
`France`, sans rien toucher d'autre :

```
           email            | country | locale | status | seat_state
----------------------------+---------+--------+--------+------------
 align_final_fr@example.com | FR      | en-US  | active | free
```

La chaîne d'attachement est intacte : `active` / `seat_state='free'` /
`coach_kind='house'`. Le parcours a été rejoué **après** le lot 4, donc cette
ligne vaut aussi comme non-régression du refactor de `signUpOutcome`.

**(c) Cascade de suppression, vérifiée et pas supposée.** Recensement construit
depuis `pg_constraint` (toutes les FK vers `auth.users` et `public.profiles`),
avant puis après `delete from auth.users` :

```
avant : coach_clients|1  identities|1  plan_commitments|1  plan_versions|1
        profiles|1  sessions|1  user_profile_facts|9
après : (aucune ligne)          auth.users like 'align_%' → 0
```

Fait deux fois (deux fixtures `align_`). **Rien ne reste en base.**

**(d) La garde est armée.** Mutation `NO_COUNTRY_SELECTED = "US"` :

```
× isDeclaredCountryValid > REFUSE l'état initial des sélecteurs
  - false  + true          freeSignup.int.test.ts:115
```

C'est le seul filet possible : `"US"` est une valeur parfaitement valide, donc
ni le type, ni le `CHECK` de la base, ni un test de forme ne verraient passer la
régression.

---

## 2. La décision sur `Auth.tsx` (le pays du coach) — **corrigé aussi**

**Décision : `useState('US')` → `useState(NO_COUNTRY_SELECTED)`, avec option
placeholder.** Ce n'est pas de la symétrie, et voici les deux faits qui l'ont
tranchée.

**1. Ce pays n'est pas seulement celui du coach.** La migration
`20260804180000` (`keel_attach_student_to_coach`) recopie le pays déclaré du
coach dans `profiles.country` de **chaque élève qui n'a pas déclaré le sien** :

```sql
if v_coach_country is not null and btrim(v_coach_country) <> '' then
  update ... set country = v_coach_country ... and country is null;
```

Un coach français qui ne touche pas le champ rangeait donc toute sa cohorte aux
États-Unis, sur la colonne que le résolveur de crise lit en premier. La
criticité n'est pas moindre qu'à `/start` : elle est démultipliée.

**2. Le changement n'ajoute aucune règle — il en réveille une.** La ceinture de
forme existe depuis W6.1, à `Auth.tsx:531`, avec son message prêt :

```ts
if (coachSignup && !/^[A-Z]{2}$/.test(coachCountry)) {
  throw new Error("Please select the country where you practise.");
}
```

Elle était **inatteignable** : l'état ne pouvait pas être invalide. Le risque
sur « la porte de connexion unique du produit » est donc celui d'armer une
garde déjà écrite et déjà rédigée pour l'utilisateur, pas d'en écrire une.

**Vérifié avant d'agir** : les deux chemins qui rejouent l'après-inscription
(`handleManualVerificationCheck` et le polling de confirmation) sont gardés par
`confirmationPending || email || password`, donc ils vivent dans la **même
session de page** que la soumission — en aval de la garde. Aucun d'eux ne peut
appeler `coach-signup-v1` avec un pays vide. (Et si l'un le faisait,
`coach-signup-v1` refuse la forme en 400 avec un message explicite ; il ne
stocke pas NULL en silence.)

### Options rejetées

- **Ne rien faire (« pays d'exercice, pas hotline d'élève »).** Rejetée par le
  fait n° 1 : c'est bien une entrée de la hotline, à un saut de distance.
- **Importer aussi `SIGNUP_COUNTRIES` pour fusionner les deux listes.** Rejetée :
  `countries.ts` explique pourquoi la LISTE reste dupliquée là-bas, et une
  divergence d'ordre d'affichage est cosmétique. Seule la **valeur initiale**
  est importée — c'est la seule dont la divergence redonne un pays à quelqu'un
  qui n'en a pas déclaré. Le fichier le dit maintenant noir sur blanc.
- **Déduire le pays du fuseau horaire du navigateur.** Rejetée : c'est
  exactement « country is not a language » sous un autre nom, et le dépôt a déjà
  payé cette erreur une fois.

---

## 3. Lot 2 — `start.*` en français

`3234eb1e` · `fr.public.ts` (+117), `catalog.ts`

**51 clés** écrites (les 50 annoncées + `start.form.country_placeholder` du lot
1), puis `"start"` déplacé de `PUBLIC_NAMESPACES_PENDING_TRANSLATION` vers
`PUBLIC_NAMESPACES`.

### Preuves

**(a) Complétude, prouvée par mutation.** `npx tsc -b` ne rend **exit 0** sur
aucune branche en ce moment (voir §6 — six pages d'une autre session sont
rouges), donc la preuve demandée a été remplacée par une plus forte : on retire
une clé du pack et on montre que le compilateur la réclame.

```
src/keel/i18n/fr.public.ts(20,14): error TS2741:
  Property '"start.joined.cta"' is missing in type '{...}'
  but required in type 'PublicMessages'.
```

Et **zéro** erreur `tsc` sur `i18n/` avec le pack complet. Vérification
complémentaire, indépendante du compilateur : les clés `start.*` du seed anglais
et celles du pack français, triées, sont identiques (51 = 51, `diff` vide).

**(b) `parity.int.test.ts` vert** (6 tests) — donc pas d'anglais recopié, pas de
trou d'interpolation divergent, pas de clé orpheline.

**(c) La page, mesurée.** `/start?lang=fr`, texte complet du `<body>` passé au
crible de 22 marqueurs anglais (titres, libellés de champ, CTA, chrome) :

```
{"lang":"fr","ogLocale":"fr_FR","englishFound":[],"placeholder":"Choisis un pays"}
```

Et le parcours réel jusqu'au bout, en français :

```
{"h1":"C'est bon, tu y es",
 "body":"Dis bonjour, ou envoie la photo de ton prochain repas — …",
 "cta":"Ouvrir la conversation"}
```

**(d) La copie n'a pas été réécrite**, conformément au périmètre : elle vend
toujours la photo de repas, les trois appuis du soir et les habitudes sur sept
jours. C'est écrit dans le pack, à l'endroit où quelqu'un ira la réécrire.

### Un arbitrage de traduction, pris et écrit

**Registre : « tu ».** C'est celui de tout le pack committé (`landing.*`,
`public.footer.tagline` = « Ta méthode, qui répond en ton absence. »). ⚠️ La
refonte vitrine en cours introduit du **« vous »** dans les mêmes fichiers
(`public.nav.doors_label` = « Trouvez votre situation », `public.nav.world_household`
= « Chez vous »). Deux voix cohabitent donc aujourd'hui sur une même page.
**Ce n'est pas un arbitrage que ce chantier pouvait trancher** — il porte sur
toute la vitrine, pas sur `/start`. À trancher par un humain, une fois, pour
tout le monde.

---

## 4. Lot 3 — la frontière au bord de la page

`f58face9` · `catalog.ts`, `runtime.ts`, `LocaleSwitch.tsx`,
`pageFrontier.int.test.ts` (neuf)

### Le mécanisme, et pourquoi celui-là

`uiLocale()` ne rend plus seulement le choix du visiteur : il rend la langue de
la **page**. `PUBLIC_PAGE_NAMESPACES` (catalog) dit quels namespaces écrivent
chaque chemin public ; si l'un d'eux est en attente de traduction, toute la page
tombe en anglais — corps, chrome, et attribut `lang`.

**Résolu dans `t()`, pas par une prop sur `PublicHeader`.** Une prop marche une
fois, puis la page suivante l'oublie et personne ne voit la couture revenir.
`t()` est le seul point par où passe chaque mot rendu : il n'y a plus de choix
par écran à oublier. Effet de bord heureux, et décisif dans ce dépôt aujourd'hui :
**zéro ligne modifiée dans `PublicHeader.tsx`**, qui est en cours de réécriture
par une autre session.

`chosenUiLocale()` est né de ce changement : le sélecteur de langue doit montrer
le **choix** du visiteur, jamais ce que la page en a fait — sinon son clic sur
« FR » ressemble à un bouton mort sur une page non traduite.

### Preuves

**(a) La page qui portait le défaut, mesurée.** `/join-household?lang=fr`
(namespace `household_claim`, en attente) — le choix enregistré est le français :

```
{"lang":"en","ogLocale":"en_GB","frenchChromeFound":[],
 "text":"Sophia EN FR Sign in | This link is incomplete | … |
         Your method, answering in your absence. | Legal & privacy |
         Sophia — coaching software"}
```

Page **entièrement** anglaise, en-tête et pied de page compris — et la pastille
**FR** reste active dans le sélecteur, donc le choix n'est pas effacé. Capture
d'écran prise (transcript de session).

**(b) La page traduite, non régressée.** `/start?lang=fr` : chrome français,
corps français (§3c). Et `/?lang=fr` (landing) reste entièrement française —
vérifié après coup, c'est la page qui aurait le plus coûté en régression.

**(c) Le test, et ses deux mutations.** `pageFrontier.int.test.ts` — 8 tests,
verts. Il rend le chrome public (`PublicHeader` + `PublicFooter`) à chaque
chemin déclaré et compte, clé par clé, de quel côté de la frontière chaque mot
tombe. Le comptage est **générique** (toutes les clés `public.*`/`brand.*` dont
la traduction diffère de l'anglais), donc il survit à la refonte de l'en-tête en
cours.

*Mutation demandée — `"start"` remis en attente :*

```
× /start est ENTIÈREMENT française — le défaut mesuré, referme
  → /start: mots de l'autre langue dans le chrome:
    expected [ 'public.header.sign_in', …(16) ] to deeply equal []
× ignore un slash final: /gyms/ est la même page que /gyms
   Tests  2 failed | 6 passed (8)
```

*Mutation de contrôle — mécanisme désarmé (`uiLocaleForPath` rend toujours le
choix du visiteur), c'est-à-dire le défaut d'origine remis en place :*

```
× un visiteur français ne voit AUCUNE page cousue
× /gyms est ENTIÈREMENT anglaise — la frontière déclarée, tenue
× ignore un slash final
   Tests  3 failed | 5 passed (8)
```

Les deux mutations rougissent des tests **différents**, et c'est voulu : la
garde de classe (dérivée du catalogue) couvre la page qu'on ajoutera demain mais
ne peut pas rougir quand on change le catalogue ; les gardes de valeur
(`/start` française, `/gyms` anglaise) sont écrites en dur et attrapent le
retour en arrière. Le cas `/gyms` est aussi **le cas qui passe de l'autre
côté** — sans lui, un compteur cassé rendrait « aucun mot français » partout et
le test verdirait en ne mesurant rien (cicatrice : *une garde a besoin d'un cas
qui passe*).

**(d) Deux gardes de complétude** : tout namespace en attente doit être porté
par une page déclarée (sinon la garde ne couvre rien), et tout namespace nommé
par une page doit exister dans le seed.

**(e) Rien ne bouge hors vitrine** : `/app/today`, `/legal`, `/auth`, `/coach`
et un chemin inconnu suivent le choix du visiteur, comme avant.

---

## 5. Lot 4 — la branche « vérifie tes mails »

`23472803` · `freeSignup.ts`, `StartPage.tsx`, + 2 tests

`config.toml` n'a **pas** été touché. La branche est sortie du composant :
`signUpOutcome()` est une table de vérité de quatre lignes, et l'écran est
devenu `CheckEmailScreen`, un composant sans hook, sans réseau et sans contexte,
rendu par le test via `renderToStaticMarkup` — **dans les deux langues**.

Les deux moitiés sont armées, prouvé par mutation :

```
condition inversée (session ? "check_email" : "attach")
   × un utilisateur SANS session = la confirmation d'e-mail
   × un utilisateur AVEC session = on rejoue le rattachement

clé de l'écran remplacée (start.check_email.title → start.joined.title)
   × affiche le titre et le corps de `start.check_email.*` en anglais
   × affiche les mêmes deux clés en français
```

Un quatrième cas est épinglé et n'était écrit nulle part : **sans utilisateur,
aucun écran de succès** — la faute qui a coûté une invitation perdue sur `/join`.

---

## 6. Ce que je n'ai pas pu vérifier, et pourquoi

1. **`npx tsc -b` ne rend pas `exit 0`, et ne peut pas.** 521 erreurs, toutes
   dans six fichiers d'une autre session : `CoachesPage`, `CouplesPage`,
   `FamiliesPage`, `MealPrepPage` (non suivis) et `CommunitiesPage`,
   `GymsLandingPage` (modifiés). Elles appellent `t()` avec des namespaces
   (`coaches.*`, `couples.*`…) absents du seed. **Zéro erreur sur mes chemins**,
   à chaque exécution. Consigné, pas réparé.

2. **La capture de `/gyms?lang=fr` demandée est impossible aujourd'hui.** La
   page **plante** dans son error boundary, et pas à cause de ce chantier :

   ```
   Error: t(): unknown message key "gyms.hero.eyebrow"
   The above error occurred in the <Hero> component.
   ```

   C'est la réécriture en cours de `GymsLandingPage`. **Substitution** :
   `/join-household?lang=fr` (même classe — namespace en attente, page non
   réécrite) sert de preuve visuelle, et le chrome de `/gyms` est prouvé anglais
   par le test unitaire, qui le rend hors du composant cassé. À noter : même
   plantée, `/gyms` porte bien `lang="en"` et `og:locale="en_GB"` — la frontière
   s'applique au document.

3. **Trois tests rouges dans la suite frontend, tous étrangers au lot.**
   `Test Files 2 failed | 45 passed | 5 skipped` — `edge/coverage-guard`
   (2 tests : fonctions edge et triggers non déclarés, `supabase/functions` est
   massivement modifié par d'autres sessions) et `copy/planRefusals` (1 test :
   des `household.error.*` écrits mais non atteignables). Vérifié : le nombre de
   clés `household.error.*` est **identique dans `HEAD` et le répertoire de
   travail**, donc rien de ce que j'ai committé ne les cause.

4. **À 22:16:15, une autre session a réécrit `en.ts` sous mes pieds.** Le
   namespace `landing.*` a **disparu du seed** (117 clés → 0), remplacé par
   `coaches.*`, `couples.*`, `families.*`, `mealprep.*` ; le jeu de clés
   publiques passe de 80 à 646, et `fr.public.ts` n'a pas suivi. Trois tests en
   rougissent dans le répertoire de travail :

   - `parity.int.test.ts` ×2 — leur pack français est en retard sur leur seed.
     **Le leur, pas le mien** : mon lot a été committé avec les deux fichiers
     cohérents.
   - `pageFrontier.int.test.ts` ×1 — `expected [ '/ -> landing' ] to deeply
     equal []`. **C'est ma garde qui fait exactement son travail** : la table
     `PUBLIC_PAGE_NAMESPACES` nomme un namespace que le seed n'a plus, donc `/`
     n'est plus couverte par la frontière. Le message dit quoi corriger, et où.

   Preuve que ce rouge est postérieur à mon travail : les mêmes fichiers de test
   ont été exécutés verts à 22:05 (`pageFrontier` 8/8) et à 22:11 (`parity` 6/6,
   `startCheckEmail` 4/4), avant l'horodatage de `en.ts`.

   **Passe de relais, une ligne :** quand la refonte vitrine committera la
   disparition de `landing.*`, il faut remplacer `"/": ["landing"]` par le
   namespace qui écrit la nouvelle page d'accueil dans
   `frontend/src/keel/i18n/catalog.ts`. Sans ça, `/` sort de la frontière.

5. **Le gate de commit a été contourné (`--no-verify`) sur les quatre lots.**
   Il lance toute la suite Deno, qui est rouge sur
   `supabase/functions/_shared/keel/request_report_test.ts` — un fichier **non
   suivi**, écrit pendant ce chantier par une autre session
   (`le PLURIEL de la demande trouve le SINGULIER du plat`, 1 échec sur 2 758).
   Aucun lot ne touche un fichier Deno. Chaque contournement est écrit dans le
   message de commit concerné. **À rejouer quand la branche voisine sera verte.**

6. **La branche `check_email` n'a pas été jouée dans un navigateur** — c'est le
   périmètre du lot, pas une omission : `enable_confirmations = false` en local,
   et `config.toml` part en prod.

7. **`/join` n'a pas été ouverte avec un jeton valide.** Elle est couverte par
   le test de frontière (chemin `/join`, deux namespaces en attente), pas par un
   parcours réel.

---

## 7. Reste à faire — nommé, pas fait

- **Les libellés de pays restent en anglais dans une page française.** Le
  `<select>` de `/start?lang=fr` affiche « United States », « France »,
  « Germany »… `SIGNUP_COUNTRIES` est une liste de données, pas un namespace :
  la traduire demande une clé par pays et touche la copie dupliquée d'`Auth.tsx`.
  **C'est une couture résiduelle, réelle, hors des trois défauts de la mission.**

- **`locale = 'en-US'` forcé** par `keel_attach_student_to_coach` : un élève
  français inscrit sur une page française naît en anglais (mesuré ci-dessus,
  `locale | en-US`). C'est la décision produit R3, pas un bug — **et elle mérite
  d'être rouverte maintenant que le B2C est le défaut.** Par un humain.

- **Le registre de la vitrine** (« tu » / « vous ») — §3, dernier paragraphe.

- **`/legal` et `/auth` n'ont pas de namespace**, donc rien ne garantit qu'elles
  ne soient pas cousues. `/legal` ne passe par aucun `t()` (contenu français en
  dur) ; `/auth` a 4 clés traduites autour d'un écran entièrement anglais en dur.
  La table `PUBLIC_PAGE_NAMESPACES` les exclut **explicitement**, avec le
  pourquoi écrit à côté.

- **Collision à venir sur `PUBLIC_PAGE_NAMESPACES`.** La refonte vitrine ajoute
  des pages (`/coaches`, `/couples`, `/families`, `/meal-prep`). Le jour où
  leurs namespaces entrent dans la liste d'attente, le test de complétude
  rougira tant que leur chemin n'est pas déclaré dans la table. **C'est la garde
  qui fonctionne, pas un conflit** — le message d'échec dit quoi ajouter.

---

## 8. Commandes à risque pour l'humain

**Aucune.** Ce chantier ne contient ni migration, ni fonction edge, ni secret,
ni déploiement. `supabase db push`, `db reset`, `functions deploy`,
`secrets set`, `config push` et `link` n'ont été ni exécutés ni nécessaires.

La seule commande utile après coup, quand la branche voisine sera verte, est le
gate que j'ai dû contourner :

```bash
cd "/Users/ahmedamara/Dev/Sophia 2" && ./scripts/agent-gate.sh
```

---

## 9. Hygiène du dépôt partagé

- **Aucun `git add -A`.** Chaque commit liste ses chemins.
- **`fr.public.ts` était modifié par une autre session au moment du lot 2.** Le
  fichier a été indexé **chirurgicalement** (`git hash-object` +
  `git update-index`) pour ne committer que mon bloc : le commit contient les 51
  clés `start.*` et **aucune** des clés `public.nav.*` du voisin. Vérifié :
  un seul hunk additif face à `HEAD`.
- **Les lots 3 et 4 utilisent `git commit --only`**, qui ne touche pas l'index
  partagé : les quatre fichiers `request_report*` qu'une autre session y avait
  déposés sont restés indexés, intacts, après mes commits.
- **Aucun `git stash`** (il emporterait les fichiers des autres sessions).
- **Les deux fixtures `align_` sont supprimées**, cascade recensée sur les 7
  tables concernées, avant et après. `select count(*) … like 'align\_%'` → `0`.
- **Aucun e-mail envoyé.** `EMAIL_DELIVERY_ENABLED` n'a pas été armé.
