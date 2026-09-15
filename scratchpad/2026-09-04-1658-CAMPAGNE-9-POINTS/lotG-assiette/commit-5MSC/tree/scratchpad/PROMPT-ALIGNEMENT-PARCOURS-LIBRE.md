# Chantier — Aligner le parcours d'inscription libre (`/start`)

> **Mission.** Trois défauts mesurés le 2026-08-12 sur le parcours
> d'inscription sans coach, en jouant le parcours complet dans un navigateur
> sur la pile locale. La plomberie est saine ; c'est la **surface** qui est
> désalignée. Tu refermes les trois, tu ne touches à rien d'autre.

Ce document est autoportant : il porte les preuves, les chemins exacts, les
lots et ce qui est **explicitement hors périmètre**. Ne re-mène pas
l'investigation — vérifie et avance.

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`, et aucune autre.** Pas de `push`,
   pas de merge.
2. **Commandes à risque : JAMAIS seul.** `supabase db push`, `db reset`,
   `functions deploy`, `secrets set/unset`, `config push`, `link`. Elles sont
   bloquées par un hook. Si tu en as besoin : arrête-toi, écris la commande
   exacte dans ton rapport, laisse l'humain l'exécuter.
3. **La base locale est PARTAGÉE** avec d'autres sessions. Jamais de
   `db reset`. Toute fixture est préfixée `align_` et **supprimée** en fin de
   lot (vérifie la cascade, ne la suppose pas).
4. **`git add -A` est interdit.** D'autres agents écrivent en parallèle.
   Chaque commit liste explicitement tes chemins.
5. **Typecheck** : `npx tsc -b` (c'est `tsconfig.app.json` qui vérifie ;
   `tsconfig.json` a `files: []` et ne vérifie **rien**).
   **Tests** : `npx vitest --config vitest.config.ts run`.
6. **Le hook de commit typecheck tout le frontend.** Si le rouge vient d'un
   fichier qui n'est pas à toi, **ne le « répare » pas** : consigne-le,
   commite tes chemins, continue.
7. **`EMAIL_DELIVERY_ENABLED=1` en local est un pistolet chargé.** Ne l'arme
   pas. Ce chantier n'envoie aucun e-mail.
8. **Une décision bloquante se prend, elle ne s'attend pas.** Tranche,
   applique, et documente : décision, options rejetées, pourquoi.

---

## 1. Ce qui marche déjà — ne le retouche pas

Parcours joué en vrai le 2026-08-12 (compte créé puis supprimé, cascade
vérifiée). La chaîne d'attachement est **saine** :

`signUp` → `handle_new_user()` (rattachement **dans** la transaction du signup)
→ `keel_attach_student_to_coach()`.

Résultat en base, vérifié : `coach_clients` = `active` / `seat_state='free'` /
`coach_kind='house'` · un `plan_versions` **publié** (donc la photo n'est pas
refusée en 409) · `profiles.keel_role='student'`. Le rejeu idempotent
(`keel_join_house_coach`) et l'écran de réparation fonctionnent.

**Interdits de ce chantier** : `handle_new_user`, `keel_attach_student_to_coach`,
`keel_join_house_coach`, `keel_free_signup_available`, le trigger de signup,
et toute migration. Il n'y a **rien à corriger** là-dedans.

---

## 2. Défaut 1 — le sélecteur de pays naît à « United States » 🔴

**C'est le plus grave, et c'est une ligne.**

`frontend/src/keel/pages/StartPage.tsx:94`
```ts
const [country, setCountry] = React.useState("US");
```

**Mesuré** : parcours joué sans toucher au champ → le compte est né avec
`profiles.country = 'US'`. Et l'aide affichée sous le champ dit :

> *« Used to give you the right emergency number if a conversation ever needs
> one. »*

Donc la colonne dont dépend le **routage de la hotline de crise** est
pré-remplie au mauvais pays pour tout non-Américain qui ne la remarque pas.
Ce n'est pas une hypothèse : `profiles.country` est la seule source du pays de
crise, et un pays absent ou faux a déjà servi un numéro américain à quelqu'un
en France.

**Le dépôt a déjà refusé ce défaut ailleurs**, explicitement, dans
`docs/fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md` §3 :

> ❌ **Un sélecteur de pays qui naît à « US ».** Les deux autres portes le
> font ; celle-ci naît **vide**, et `''` est refusé.

**Le patron à copier existe** —
`frontend/src/keel/pages/JoinHouseholdPage.tsx:134` + `:641` :

```ts
const [country, setCountry] = React.useState("");
// …
<option value="">{t("household_claim.signup.country_placeholder")}</option>
```

Et le refus est déjà armé des deux côtés : `isDeclaredCountryValid` (`countries.ts`)
teste `/^[A-Z]{2}$/`, donc `''` échoue ; et côté base `keel_join_house_coach`
rend `country_required`.

### Le travail

- `StartPage` : `useState("")`, une `<option value="">` de placeholder, clé
  i18n neuve.
- **La deuxième porte** : `frontend/src/pages/Auth.tsx:132` porte le même
  `useState('US')` pour le pays du **coach**. Ce n'est pas la même criticité
  (pays d'exercice, pas hotline d'élève) — **tranche**, applique, et documente
  ton choix. Ne le laisse pas sans décision écrite.

### Preuve d'acceptation

1. Test : soumettre `/start` sans toucher au sélecteur → **refus**, message
   lisible, **aucun compte créé**.
2. **Parcours navigateur réel** : compte `align_` créé en choisissant `FR` →
   `select country from profiles` rend `'FR'`. Puis supprime le compte et
   vérifie la cascade.
3. Le placeholder n'est **jamais** une valeur soumissible.

---

## 3. Défaut 2 — `/start` s'affiche moitié français, moitié anglais 🔴

**C'est la page de conversion, et la couture passe au milieu.**

Mesuré : `document.documentElement.lang === "fr"`, en-tête et pied de page en
français (« Langue », « Mentions légales », « Ta méthode, qui répond en ton
absence. »), et **tout le corps en anglais** (« Try it without a coach first »,
« Where you live », « Start the program »).

**Cause** : `start` est dans `PUBLIC_NAMESPACES_PENDING_TRANSLATION`
(`frontend/src/keel/i18n/catalog.ts:54`), donc `t()` retombe en anglais pour
les 50 clés `start.*`, **tandis que le chrome** (`public.*`, `brand.*`) est
traduit, lui, parce qu'il est dans `PUBLIC_NAMESPACES`.

**Et personne n'a besoin de cliquer pour y arriver** : `initUiLocale`
(`i18n/runtime.ts`) résout depuis `navigator.languages`. Tout visiteur au
navigateur français atterrit là-dessus par défaut.

⚠️ **Le dépôt croit que ce cas est fermé.** `catalog.ts` le décrit comme la
chose à éviter — *« un écran français avec une phrase anglaise au milieu,
découvert par un client et pas par un test »* — et affirme :

> *« `/gyms` et `/communities` restent en anglais quand la vitrine est en
> français. C'est une frontière **VISIBLE et déclarée**, pas un repli
> silencieux au milieu d'une page. »*

**C'est faux, et pas seulement pour `/start`.** Le chrome étant traduit autour
d'un corps anglais, les **cinq** namespaces en attente (`gyms`, `communities`,
`start`, `join`, `invite`, `household_claim`) rendent tous une page cousue.
La frontière n'est pas au bord de la page : elle est à l'intérieur.

### Le travail — deux lots distincts, ne les confonds pas

**3a — Traduire `start.*` (50 clés).**
Ajoute le pack dans `frontend/src/keel/i18n/fr.public.ts`, puis **déplace
`"start"`** de `PUBLIC_NAMESPACES_PENDING_TRANSLATION` vers `PUBLIC_NAMESPACES`.
L'ordre importe : le type `PublicMessages` est dérivé du seed anglais, donc le
fichier **cesse de compiler** tant qu'une clé manque. C'est la garantie, ne la
contourne pas avec un `Partial` ou un `as`.

Lis l'en-tête de `fr.public.ts` avant d'écrire une ligne :

> *« CE N'EST PAS UNE TRADUCTION LITTÉRALE. C'est une page de vente : elle est
> réécrite pour sonner juste en français, pas transposée mot à mot. »*

Ne traduis pas : le nom de marque, l'adresse e-mail, les prix.

**3b — Rendre la frontière vraie pour les namespaces qui restent en attente.**
`gyms`, `communities`, `join`, `invite`, `household_claim` gardent la couture.
Ferme-la **structurellement** : quand le namespace principal de la page est en
attente de traduction, le **chrome de cette page** rend en anglais lui aussi —
la page est alors entièrement anglaise, ce qui est la frontière que le dépôt
dit déjà appliquer.

Et arme-la : un test qui **échoue** si une page dont le namespace est en attente
peut rendre un chrome traduit. Sans ce test, le prochain namespace ajouté à la
liste rouvre le défaut en silence. Cicatrice du dépôt : *une garde a besoin
d'un cas qui passe* — assure-toi que ton test verdit sur un cas légitime, sinon
il bloque tout en ressemblant à une garde qui marche.

### Preuve d'acceptation

1. `npx tsc -b` exit 0 **après** le déplacement de `"start"` (c'est lui qui
   prouve la complétude des 50 clés).
2. `frontend/src/keel/i18n/parity.int.test.ts` vert.
3. **Capture d'écran** de `/start?lang=fr` : aucune phrase anglaise.
4. **Capture d'écran** de `/gyms?lang=fr` : page **entièrement** anglaise,
   chrome compris.
5. Le test de 3b **muté** : remets `"start"` en attente → le test doit rougir.

---

## 4. Défaut 3 — la branche « vérifie tes mails » n'a jamais été jouée 🟠

`supabase/config.toml` porte `enable_confirmations = false` en local, donc
`signUp` ouvre une session immédiatement et la phase `check_email` de
`StartPage` **ne se joue jamais ici**. Elle n'a été vérifiée que par lecture.

**Ne touche pas à `config.toml`** — c'est un fichier partagé qui part en prod.

Ce que tu fais à la place : prouve la branche **par un test de rendu** —
`data.user && !data.session` → phase `check_email`, et l'écran affiche
`start.check_email.*`. Un test de composant suffit ; l'objectif est qu'un
changement dans cette branche ne puisse plus passer inaperçu.

---

## 5. Ce qui est HORS PÉRIMÈTRE — et pourquoi

Ces points sont **réels et connus**. Les corriger ici serait payer deux fois.

- ❌ **La copie de `/start`.** Elle vend l'ancien produit (photo de repas,
  trois taps du soir, habitudes sur sept jours) — zéro mot sur composer sa
  semaine, les sessions de cuisine, les courses, le foyer. C'est le
  **chantier ② du pipeline vitrine** (le couloir d'entrée, après la charte
  graphique). **Traduis la copie telle qu'elle est** ; ne la réécris pas.
- ❌ **L'atterrissage sur un chat vide** (« Nothing here yet… », sous-titré
  *« with your coach's method behind it »* à quelqu'un qui vient de choisir de
  ne pas avoir de coach). C'est ce que **FF-060** comble
  (`scratchpad/PROMPT-FF-060-PARCOURS-ONBOARDING.md`).
- ❌ **`/app/today` au jour 0** qui ouvre sur `0 of 7`, *« Insufficient data »*,
  *« Adherence stays hidden until 4 days of the week are logged »*. Même
  chantier que ci-dessus.
- ❌ **`locale = 'en-US'` forcé** par `keel_attach_student_to_coach`. C'est une
  décision produit écrite (R3 : « les surfaces KEEL naissent en anglais »), pas
  un bug. Elle mérite d'être rouverte maintenant que le B2C est le défaut —
  **mais par un humain, pas par toi.** Nomme-la dans ton rapport.
- ❌ **Traduire `gyms` et `communities`** (278 clés). Ces deux pages sont
  **réécrites** par la refonte de la vitrine. 3b les rend cohérentes sans les
  traduire ; c'est exactement pour ça que 3b existe.
- ❌ Toute migration, toute fonction edge, tout déploiement.

---

## 6. Les pièges du dépôt qui mordent ici

1. **`profiles.locale` vaut `fr-FR` par défaut** en base. Une fixture qui ne
   l'écrit pas ment sur la langue.
2. **PostgREST rend 204 sans erreur** sur un `update` qui ne matche aucune
   ligne. Si tu écris dans `student_goals.practical_constraints`, passe par
   `mergePracticalConstraints` — la parade est déjà écrite.
3. **`as` sur un type étranger désarme le typecheck.** Interdit ici : c'est le
   type dérivé qui garantit la complétude du pack français.
4. **Toute garde se teste dans les deux langues.** `not` ne couvre pas
   `doesn't`.
5. **Le screenshot du panneau navigateur ne repeint qu'à `scroll 0`** : décale
   le body plutôt que de scroller, ou mesure au lieu de regarder.
6. **`flex-1` ne rétrécit pas un input** (`min-width: auto`) : teste à 320 px.
7. **`git stash` emporte les fichiers des autres sessions** : utilise
   `git show HEAD~1:<chemin>` pour comparer.

---

## 7. L'ordre, et les commits

1. **Lot 1 — le pays.** Indépendant, c'est le plus grave, il part en premier.
2. **Lot 2 — `start.*` en français** (3a).
3. **Lot 3 — la frontière vraie** (3b) + son test muté.
4. **Lot 4 — le test de la branche `check_email`** (§4).

Un commit par lot, message en français descriptif (style du dépôt : la phrase
dit le **défaut refermé**, pas le fichier touché), avec la ligne
`Co-Authored-By`. Aucun push.

---

## 8. Le rapport final

`scratchpad/ALIGNEMENT-PARCOURS-RAPPORT.md` :

1. **Lot par lot** : livré / partiel / échoué, avec la **preuve** — sortie de
   test, ligne en base, capture d'écran. Rien d'affirmé sans trace.
2. **La décision sur `Auth.tsx:132`** (pays du coach), avec les options
   rejetées.
3. **Ce que tu n'as pas pu vérifier**, nommé.
4. **Les commandes à risque** à faire exécuter par l'humain, prêtes à
   copier-coller.

**Un échec ne se masque pas.** Un lot rouge se consigne rouge, et tu passes au
lot indépendant suivant.
