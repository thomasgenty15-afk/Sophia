# Chantier FF-061 — Le compte-rendu de la demande

> **Mission en une phrase.** Quand quelqu'un écrit ce dont il a envie avant de
> composer sa semaine — « des burgers », « des pizzas », « du poisson » — le
> plan doit **dire ce qu'il en a fait**. Pas se justifier : rendre compte.

Tu es un agent autonome. Ce document est ta seule source : il porte l'état
mesuré du dépôt, la spécification, les gardes, les lots et les preuves à
produire. **Ne redécouvre pas ce qui est écrit ici — vérifie-le et avance.**

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`, et aucune autre.** Pas de `push`,
   pas de merge.
2. **Commandes à risque : JAMAIS seul.** `supabase db push`, `db reset`,
   `functions deploy`, `secrets set/unset`, `config push`, `link`. Bloquées par
   un hook. Si tu en as besoin : arrête-toi, écris la commande exacte dans ton
   rapport, laisse l'humain l'exécuter.
3. **La base locale est PARTAGÉE.** Jamais de `db reset`. Fixtures préfixées
   `ff061_`, supprimées en fin de lot, cascade **vérifiée** et pas supposée.
4. **`git add -A` est interdit.** D'autres agents écrivent en parallèle.
   Chaque commit liste explicitement tes chemins.
5. **Tests Deno** avec l'environnement purgé, sinon 114 faux rouges :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
6. **Typecheck frontend** : `npx tsc -b` (`tsconfig.json` a `files: []` et ne
   vérifie **rien**). Tests : `npx vitest --config vitest.config.ts run`.
7. **Le hook de commit typecheck tout le frontend.** Un rouge venu d'un fichier
   qui n'est pas à toi se consigne, il ne se « répare » pas.
8. **Le runtime edge sert des `_shared` périmés** : un fichier *modifié* n'est
   pas rechargé. Redémarre la stack avant tout run réel.
9. **Une décision bloquante se prend, elle ne s'attend pas.** Tranche,
   applique, documente : décision, options rejetées, pourquoi.

---

## 1. L'état mesuré — vérifié le 2026-08-12

### 1.1 La justification PAR PLAT existe déjà, de bout en bout

- Le prompt la demande :
  `"why": "one sentence: why THIS dish for THIS student this week"`
  (`_shared/keel/meal_generation.ts:1146`).
- Elle est parsée (`const why = cleanText(d.why)`, ~`:2226`), portée dans la
  sortie (`:2350`, `:2748`), et **scannée par le matcher d'interdits** au même
  titre que les titres, la méthode, les ingrédients et la liste de courses
  (`:2429-2436`).
- Elle est **rendue à l'écran** : `frontend/src/keel/components/DishCard.tsx:135`.

➡️ **Tu ne construis pas la justification du plat. Elle existe, elle est
gardée, elle est affichée. N'y touche pas.**

### 1.2 Ce qui manque : rien ne revient sur la DEMANDE

Les envies entrent bien dans le prompt (`meal_generation.ts:1621-1622`) :

```
what they feel like eating THIS TIME: ${args.preferences}
```

Elles viennent de `student_generated_meals.preferences` (prose libre, distincte
des goûts durables de `practical_constraints.food_preferences` — voir
`frontend/src/keel/api/mealGeneration.ts:332`).

**Aucun champ de sortie ne dit ce qui en a été fait.** Le modèle reçoit
« pizza, burgers » et le plan revient sans un mot là-dessus. C'est le trou que
ce chantier referme.

Le patron existe déjà **côté foyer** : `_shared/keel/household_envies.ts` sait
dire qui a parlé et qui a été composé d'office. L'individu n'a pas son
équivalent.

### 1.3 ⚠️ Le garde anti-culpabilisation n'est PAS sur cette surface

`findGuiltTripping` (`_shared/keel/reengagement.ts:296`) et
`assertNoGuiltTripping` existent, et sont appliqués :

- au message du soir — `_shared/keel/daily_recap.ts:683` (motif de refus
  `guilt_tripping`),
- à la relance — `_shared/keel/reengagement_io.ts:667`.

**Zéro occurrence** dans `meal_generation.ts`, `generate-meal-v1/index.ts`,
`generate-household-meal-v1/index.ts`. Le champ qu'on s'apprête à multiplier
est exactement celui qui n'est pas gardé. **C'est le lot 2.**

### 1.4 Le précédent qui dit ce qui va arriver si tu fais confiance au prompt

`_shared/keel/household_restriction_lock.ts` a été écrit après un run réel où
le modèle — à qui le prompt disait **en toutes lettres** de ne pas commenter
les règles de maison — a justifié un plat par :

> *« Honore la demande de pâtes de Lea avec une sauce protéinée, SANS NUTELLA. »*

L'en-tête du module en tire la loi du dépôt :

> **une consigne de prompt régresse en réel.**

Conséquence directe et non négociable pour ce chantier : **le compte-rendu
n'est pas une sortie du modèle.** Voir §2.2.

### 1.5 L'outillage disponible — à réutiliser, jamais à réécrire

- **`_shared/keel/forbidden_matcher.ts`** — LE matcher du dépôt.
  `findForbiddenMatches` (`:368`), `ForbiddenTerm { ruleId, token, surfaceForms? }`
  (`:41`), `normalizeForMatch` (`:76`), `tokenPattern` (`:91`), option
  `allowNegatedMentions` (`:59`).
  ⚠️ **Cicatrice du dépôt : on ne bricole JAMAIS un matcher ici.** « laitue »
  contre « lait » : 12 faux positifs sur 12 mesurés. Tout rapprochement de
  termes passe par ce module, avec ses frontières de mots et sa liste fermée de
  négations.
- **`_shared/keel/restriction_runtime.ts`** — `loadRestrictionSnapshot` (`:433`),
  `evaluateRestrictionForStudent` (`:457`). C'est le plancher TCA.
- **`_shared/keel/household_restriction_lock.ts`** — le verrou des règles de
  maison, qui **efface** le `why` d'un plat quand il commente une règle
  parentale.

---

## 2. La spécification

### 2.1 Le mot juste : rendre compte, pas justifier

> **Justifier**, c'est défendre une décision — registre du jugement. La pente
> est courte jusqu'à « la pizza ne rentre pas dans ton objectif », qui est de
> la **moralisation alimentaire**.
>
> **Rendre compte**, c'est dire ce qu'on a fait de ce que la personne a
> demandé — registre factuel : « Tu as demandé des burgers : il y en a jeudi
> soir. »

Et c'est aussi ce qui est **vrai** dans ce produit : l'unité est la session de
cuisine sur N jours. Un burger n'échoue pas à un objectif, **il occupe un
créneau**. Le compte-rendu honnête est donc presque toujours « je l'ai mis
là », pas « je l'ai ignoré ».

**Le risque à tenir en permanence** : une fonctionnalité qui s'appelle
« justification » invite le modèle à *inventer un refus qu'il n'a pas fait*.

### 2.2 ⛔ LE COMPTE-RENDU EST UN DIFF DÉTERMINISTE, PAS UNE SORTIE DU MODÈLE

**C'est la décision structurante de ce chantier. Si ton code la contredit, le
chantier est raté quelles que soient ses autres qualités.**

On sait ce qui a été **demandé** (les termes de `preferences`). On sait ce que
le plan **contient** (plats, ingrédients, méthodes, jours). Le rapprochement se
**calcule**, avec le matcher du §1.5.

- ❌ Aucun champ neuf demandé au modèle dans `buildMealPrompt`.
- ❌ Aucun appel de modèle supplémentaire.
- ✅ Le texte affiché est **assemblé depuis des faits + des gabarits i18n**.

Trois raisons, et chacune suffit :

1. **§1.4** — une consigne de prompt régresse en réel. Un modèle à qui on
   demande d'expliquer ses arbitrages expliquera aussi ceux qu'il doit taire.
2. **La cicatrice `ack_guard` / le soutien groundé** — une phrase qui affirme
   un fait que le code n'a pas calculé finit par affirmer un fait faux.
3. **Le « vivant » est déjà couvert** par le `why` par plat (§1.1), qui est
   produit par le modèle *et* vérifié contre la doctrine. On n'a pas besoin
   d'une deuxième prose non gardée.

**V2 (le modèle formule le compte-rendu à partir des faits) est explicitement
FERMÉE.** Ne la construis pas, ne la prépare pas, ne laisse pas de crochet
pour elle.

### 2.3 Les quatre statuts d'un terme demandé

Le module pur rend, pour chaque terme extrait de `preferences` :

| Statut | Sens | Preuve exigée dans la sortie |
|---|---|---|
| `served` | le terme est dans le plan | le(s) `dishId` et le(s) jour(s) |
| `served_reduced` | présent, mais sur moins de créneaux que demandé, ou en accompagnement | idem + ce qui le borne |
| `absent` | le terme n'apparaît nulle part | rien à citer — et c'est le cas délicat, voir §2.5 |
| `unreadable` | on n'a pas su extraire un terme exploitable de la prose | jamais affiché, **compté** |

`unreadable` n'est pas un détail : sans lui, une prose que le module ne sait pas
lire deviendrait silencieusement `absent`, et le produit annoncerait un refus
qu'il n'a pas fait. **C'est le pire des faux positifs de ce chantier.**

### 2.4 On dit surtout les oui

**Règle produit, pas préférence de ton.** Si le compte-rendu ne parle que quand
la réponse est non, il devient le bruit du refus : la personne apprend à le
redouter, et le jour où il compte vraiment il est déjà disqualifié.

➡️ Le compte-rendu s'affiche **dès qu'il y a une demande lisible**, même quand
tout a été honoré. Un test le pin : `preferences` entièrement satisfaites ⇒ le
bloc est **présent**, et il ne contient aucun mot de refus.

### 2.5 Le terme absent — la décision, et elle est réversible

**Décidé par défaut, à implémenter tel quel** : un terme `absent` **se dit**,
mais **une seule fois** — jamais deux générations consécutives pour le même
terme.

Le dire est honnête et éducatif. Le répéter à chaque génération transforme le
compte-rendu en liste de reproches, ce que §2.4 existe pour empêcher.

L'état « déjà dit » se dérive du plan **précédent** de la même personne (la
ligne `student_generated_meals` antérieure), pas d'une colonne neuve : pas de
migration pour ce chantier. Si tu ne peux pas le dériver proprement, **dis-le
et n'invente pas une table** — le repli est « on ne dit pas les absents »,
qui est sûr.

### 2.6 La chaîne de portes — dans cet ordre, motifs nommés

Avant d'afficher quoi que ce soit :

| # | Porte | Si fermée |
|---|---|---|
| 1 | **Plancher TCA** (`restriction_flag` via `restriction_runtime.ts`) | **aucun compte-rendu, sans exception** |
| 2 | **Règles de maison** | un terme couvert par une règle de maison n'est **jamais** cité comme demande refusée |
| 3 | **Doctrine du coach** | le texte assemblé passe le verrou de sortie, comme le `why` |
| 4 | **Anti-culpabilisation** (`findGuiltTripping`) | le bloc tombe, l'incident est tracé |

**La porte 1 est celle qu'il faut prouver par l'absence de chemin.** Pour
quelqu'un sous `restriction_flag`, « j'ai mis moins de pizza » est une phrase
qui moralise la nourriture de quelqu'un qu'on soupçonne déjà de se restreindre.
Aucun réglage, aucune doctrine, aucun drapeau ne doit pouvoir la rouvrir.

**La porte 2 est le piège de §1.4.** Si un enfant a une règle de maison sur le
Nutella et que le parent écrit « du nutella » dans les envies, le compte-rendu
ne doit **pas** dire « je ne l'ai pas mis ». Ce serait Sophia portant la
décision du parent — exactement ce que `household_restriction_lock.ts` a été
écrit pour empêcher, reconstruit par une autre porte.

⚠️ **Aucun paramètre optionnel sur la fonction de portes.** Cicatrice du
dépôt : *un paramètre de garde optionnel est une garde désarmée* — `safetyBand`
n'a jamais été passé nulle part et personne ne l'a vu. Les entrées sont
requises et la fonction **jette** sur une entrée incomplète.

---

## 3. Les lots

Chaque lot est livrable et commité seul.

### Lot 1 — Le module pur : `_shared/keel/request_report.ts` + son test

```ts
export type RequestStatus = "served" | "served_reduced" | "absent" | "unreadable";

export interface RequestedTerm {
  /** Le terme tel qu'extrait de la prose, normalisé. */
  term: string;
  status: RequestStatus;
  /** Les plats qui le portent. Vide si `absent`. */
  dishIds: string[];
  /** Les jours concernés, dans l'ordre du plan. */
  days: string[];
}

export function reportOnRequest(input: {
  preferences: string;
  dishes: readonly ReportableDish[];
  /** Les termes couverts par une règle de maison — JAMAIS cités (porte 2). */
  houseRuleTerms: readonly ForbiddenTerm[];
  /** Ce qui a déjà été dit absent au plan précédent (§2.5). */
  previouslyReportedAbsent: readonly string[];
}): { terms: RequestedTerm[]; unreadableCount: number };
```

**Contraintes :**
- Module **pur** : zéro I/O, zéro horloge, zéro aléatoire.
- Le rapprochement passe **exclusivement** par `findForbiddenMatches`. Aucune
  `RegExp` maison, aucun `includes()` sur du texte libre.
- `allowNegatedMentions: true` : une méthode qui dit « sans pizza » ne sert pas
  de pizza. Le nier ferait annoncer servi ce qui ne l'est pas.
- L'extraction des termes depuis la prose est la partie fragile : quand elle
  échoue, c'est `unreadable`, **jamais** `absent`.

**Preuve d'acceptation :**
1. « des burgers et du poisson » + un plan qui contient les deux ⇒ deux
   `served`, avec les jours cités.
2. Le cas **« laitue » / « lait »** : preferences « du lait », plan avec de la
   laitue ⇒ **pas** `served`. C'est le test qui justifie l'usage du matcher.
3. Un terme couvert par une règle de maison ⇒ **absent de la sortie entière**,
   quel que soit son statut réel.
4. Une prose illisible ⇒ `unreadableCount > 0` et **aucun** `absent`.
5. Un terme déjà dit absent au plan précédent ⇒ pas re-dit.
6. **Deux langues** (FR + EN) sur chaque cas de garde — `not` ne couvre pas
   `doesn't`.
7. **Mute une constante pour prouver que le test mord** : un test paramétré par
   sa propre constante reste vert quand on change la constante.

### Lot 2 — Les portes, et le garde qui manque

- La chaîne du §2.6, dans l'ordre, motifs nommés
  (`restriction_floor` / `house_rule` / `doctrine_lock` / `guilt_tripping`).
- **Branche `findGuiltTripping` sur cette surface** — c'est le trou du §1.3.
  Décide et documente : est-ce que tu le branches **aussi** sur le `why` des
  plats (qui est produit par le modèle et aujourd'hui non gardé de ce côté) ?
  Mon avis : oui, et c'est le vrai gain de ce lot. Mais mesure d'abord le taux
  de faux positifs sur des `why` existants — une garde qui rejette des plats
  corrects se fait désarmer dans la semaine.

**Preuve d'acceptation :**
- Table de vérité complète des quatre portes.
- **Test extra-hard** : élève sous `restriction_flag` **+** demande entièrement
  honorée **+** doctrine qui autorise tout ⇒ **rien nulle part**, sur toutes les
  surfaces, dans les deux langues.
- Le cas Nutella de §1.4, rejoué : règle de maison sur un enfant + envie du
  parent nommant l'aliment ⇒ le compte-rendu n'en dit **rien**.

### Lot 3 — La surface

Le bloc s'affiche avec le plan. Les fichiers candidats :
`frontend/src/keel/components/plan/PlanResult.tsx`,
`frontend/src/keel/pages/mealPlan/StudentMealPlanPage.tsx`, et la copie de
`frontend/src/keel/pages/mealPlan/copy.ts`. **Choisis, et dis pourquoi.**

- Texte **assemblé depuis des gabarits i18n**, clés neuves, **EN et FR**.
- Le miroir du module pur côté frontend suit le patron du dépôt : on **duplique
  et on teste des deux côtés** (pas d'import cross-runtime deno→vite).
- **320 px et 1280 px.** `flex-1` ne rétrécit pas un input (`min-width: auto`).
  Screenshot à `scroll 0` — le panneau ne repeint pas ailleurs.

**Preuve d'acceptation :** captures aux deux largeurs, dans les deux langues,
sur un plan `ff061_` réel — demande entièrement honorée (le bloc est là, sans
mot de refus) **et** demande partiellement honorée.

### Lot 4 — La fiche

`docs/fonctionnalites/composition-des-repas/FF-061-le-compte-rendu-de-la-demande.md`,
au format de `docs/fonctionnalites/TEMPLATE.md`, **écrite depuis ce qui a été
construit**, indexée dans les deux README.

**Avant d'écrire :** `grep -rho 'FF-[0-9]\{3\}' docs/ | sort -u | tail -5`.
D'autres sessions numérotent en parallèle ; une collision d'identifiant a déjà
coûté un renommage complet. Si FF-061 est pris, prends le suivant libre et
dis-le.

---

## 4. Hors périmètre — exprès

- ❌ **Toucher au `why` par plat** (le champ, son prompt, son rendu). Il existe
  et il marche. Seul le lot 2 peut lui *ajouter* une garde.
- ❌ **Faire formuler le compte-rendu par le modèle** (§2.2, V2 fermée).
- ❌ **Toute migration.** L'état « déjà dit » se dérive (§2.5).
- ❌ **Les calories et la chaîne de portes de FF-059.** Le compte-rendu ne
  chiffre rien.
- ❌ **Le compte-rendu dans le chat.** Ce chantier est celui du plan. Le chat a
  ses propres portes et son propre budget de demande (une par jour, toutes
  surfaces confondues) — l'y brancher sans compter ce budget est un bug.
- ❌ **Les envies de foyer** (`household_envies.ts`, FF-050). Le patron s'y
  inspire, le code ne s'y touche pas.

---

## 5. Les décisions à prendre seul, et à documenter

1. **Où le bloc s'affiche** (lot 3), et pourquoi ce fichier plutôt qu'un autre.
2. **`findGuiltTripping` sur le `why` des plats** : branché ou pas, avec le taux
   de faux positifs mesuré à l'appui.
3. **La granularité de `served_reduced`** : si tu ne peux pas la distinguer de
   `served` de façon fiable, **fusionne-les** et dis-le. Un statut qu'on ne sait
   pas calculer est pire qu'un statut absent.
4. **Le seuil de `unreadable`** : à partir de quand on renonce à lire la prose.

Pour chacune : la décision, **les options rejetées**, et pourquoi.

---

## 6. Le rapport final

`scratchpad/FF-061-RAPPORT.md` :

1. **Lot par lot** : livré / partiel / échoué, avec la **preuve** (sortie de
   test, ligne en base, capture). Rien d'affirmé sans trace.
2. **La table de vérité des quatre portes**, et le résultat du test extra-hard.
3. **Le taux de faux positifs** de `findGuiltTripping` sur les `why` existants.
4. **Les décisions du §5**, avec les options rejetées.
5. **Ce que tu n'as pas pu vérifier**, nommé.
6. **Les commandes à risque** à faire exécuter par l'humain, prêtes à
   copier-coller.

**Un échec ne se masque pas.** Un lot rouge se consigne rouge, et tu passes au
lot indépendant suivant.
