# Orchestration — le chantier « objectifs, calories, formulaire »

**Date** 2026-08-18 · Conception :
[2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md](2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md)

**La règle, posée par l'utilisateur** : chaque lot a **un agent
d'implémentation** et **un agent de vérification** (backend **et** frontend au
navigateur). Ce qui ne se chevauche pas part **en parallèle**.

---

## 0. Ce qui décide du parallélisme : les fichiers partagés

Trois fichiers sont traversés par presque tout le chantier. **Ce sont eux, et
eux seuls, qui imposent la séquence :**

| Fichier | Qui veut y toucher |
|---|---|
| `_shared/keel/meal_envelope.ts` | les objectifs (`goal`, `ENERGY_BANDS`) **et** l'activité (`ACTIVITY_FACTOR`) |
| `_shared/keel/household_portions.ts` | les objectifs, le mineur, les grammages/boîtes |
| `_shared/keel/meal_generation.ts` | équipement, déjeuner dehors, noms de plats, cible — **tout le prompt** |

D'où deux regroupements **forcés** :
- **objectifs + activité = UN lot** (ils se croisent dans `meal_envelope.ts`) ;
- **tout ce qui parle au modèle = UN lot** (un seul bump de version, et la lane
  foyer **expire déjà à 4 min** : chaque bloc ajouté coûte).

---

## 1. Les trois vagues

```
VAGUE 1 — le socle et les collectes            ┐
  L1  socle: 3 objectifs + activité   ⛔ bloqué │  4 paires
  L2  moyens de cuisson (collecte)    ✅        │  en PARALLÈLE
  L3  déjeuner dehors (collecte)      ✅        │
  L4  garde TCA                       ⛔ bloqué ┘
                    │
                    ▼
VAGUE 2 — les surfaces                         ┐  2 paires
  L5  le pop-up « une bouche »                 │  en PARALLÈLE
  L6  l'étape planning réorganisée             ┘
                    │
                    ▼
VAGUE 3 — ce qui parle au modèle               ┐  2 paires
  L7  prompt unifié (un seul bump)             │  SÉQUENTIELLES
  L8  la cible → les grammages                 ┘
```

**8 lots · 16 agents · 3 vagues** au lieu de 8 étapes en file.

### Le détail, avec les périmètres exclusifs

| Lot | Ce qu'il fait | Fichiers qu'il POSSÈDE | Migration |
|---|---|---|---|
| **L1** | 3 objectifs, poids visé, slider borné, alignement du mineur, niveau d'activité | `tokens.ts` · `household_portions.ts` · `meal_envelope.ts` · `energy_target.ts` · `student_body*` | `20260818100000` |
| **L2** | Moyens de cuisson du foyer — **collecte seule** | `practical_constraints` (clé neuve) · `api/kitchenEquipment.ts` · sa carte | `20260818110000` |
| **L3** | Déjeuner dehors — **3 états de présence**, collecte seule | `household_presence.ts` · `MealPickerGrid.tsx` · `planGridModel.ts` | `20260818120000` |
| **L4** | Garde TCA — l'étape 0 de `CALORIE_REVERSAL.md` | `energy_gate.ts` · `disordered_eating_guard` | `20260818130000` |
| **L5** | Le pop-up « une bouche », 6 blocs | `components/MouthFormDialog.tsx` (neuf) · `SetupPage` §people · `HouseholdPage` | — |
| **L6** | Étape `table` : cuisson avant dispos, dépliage du bureau, pré-remplissage de l'étape 4 | `SetupPage` §table · `onboarding.ts` | — |
| **L7** | **Prompt unifié** : équipement + dehors + noms de plats | `meal_generation.ts` · `household_meal_generation.ts` | — |
| **L8** | La cible calorique → les grammages des boîtes | `household_portions.ts` (boîtes) · `plan_energy.ts` | — |

⚠️ **L1 et L8 partagent `household_portions.ts`** — d'où leur position aux deux
bouts du chantier, jamais en parallèle.

---

## 2. Les règles anti-collision — 5 agents écrivent dans le même dépôt

Le chantier précédent a déjà payé ça : un lot a trouvé **9 fichiers de tests
portant des hunks d'autres lanes**, jusqu'à 191 insertions étrangères.

1. **Numéros de migration RÉSERVÉS** dans le tableau ci-dessus. Un lot qui en
   invente un ouvre la porte au doublon de version — et une migration hors ordre
   est **sautée en silence**.
2. **Chaque lot ne modifie QUE les fichiers qu'il possède.** S'il lui en faut un
   autre, il s'arrête et le signale au lieu de le prendre.
3. **Packs i18n** : chacun **ajoute** ses clés, personne ne réordonne ni ne
   reformate. Non commités (convention des lanes).
4. **Jamais `git add -A`, jamais `git stash`** — le stash emporte le travail des
   autres lanes. Commits par chemins explicites, relus par `git diff`.
5. **Runtime edge** : un seul agent à la fois le redémarre, et seulement
   `docker restart supabase_edge_runtime_Sophia_2`, après avoir sondé qu'aucune
   génération d'une autre lane ne tourne. ⛔ Jamais `supabase stop/start`.

---

## 2 bis. ⚠️ LA BARRIÈRE — mesurée au premier lot rendu, le 2026-08-18

> ### Les bâtisseurs d'une vague partent ensemble. Les vérificateurs attendent que TOUTE la vague soit posée.

**Le fait qui l'impose.** L4-A a rendu pendant que L1, L2 et L3 volaient encore.
Mesuré à cet instant : suite Deno **3130 verts / 57 rouges**, dont **zéro dans
son périmètre** ; côté front, **4 erreurs `tsc`** et 8 fichiers vitest rouges,
tous étrangers. Cause : L1 est à mi-chemin de la migration des six objectifs
vers trois — `tokens.ts` a déjà changé, ses lecteurs pas encore.

**Pourquoi ça interdit de lancer le vérificateur tout de suite :**

1. **Le typecheck est GLOBAL.** Un front qui ne compile pas ⇒ pas de serveur de
   dev ⇒ **pas de navigateur**. Or la moitié du travail d'un vérificateur est là
   (règle de l'utilisateur : backend **et** frontend en webview).
2. **Un rouge étranger coûte plus cher qu'une attente.** Le chantier précédent a
   montré le prix : un vérificateur a passé du temps à prouver l'antériorité de
   3 rouges, et a dû **refaire** la preuve du bâtisseur, fausse parce qu'elle
   comparait à un worktree où la lane i18n n'existait pas.
3. **`agent-gate` ne peut pas passer** : le hook lance la suite entière, donc il
   échoue sur le travail des voisins. Un bâtisseur pris dans une vague commite
   alors en `--no-verify` — ce qui est acceptable **pour lui**, mais rend le
   passage du vérificateur **obligatoire** sur base stable.

**La forme retenue :**

```
vague N :  [ A₁  A₂  A₃  A₄ ]  ──── barrière ────►  [ B₁  B₂  B₃  B₄ ]
           4 bâtisseurs                              4 vérificateurs
           en parallèle          suite verte,        en parallèle
                                 tsc exit 0
```

⚠️ **Ce qu'un bâtisseur doit faire en vague, et qui change de la normale** :
prouver son lot **dans son périmètre** (ses tests, ses mutations, `deno check`
sur ses modules), consigner les rouges étrangers **sans les réparer**, et
**nommer** le lot voisin qui les cause. Le vert global n'est pas son livrable —
c'est celui de la barrière.

---

## 3. Ce que fait CHAQUE vérificateur (la règle de l'utilisateur)

Non négociable, pour les huit :

- **Backend** : suite Deno, vitest, `tsc -b` exit 0, et **rejeu** d'au moins 5
  mutations du bâtisseur (il ne croit pas le rapport, il remesure).
- **Frontend au navigateur** : port dédié, persona local (mdp `1234567`),
  captures à **scroll 0**, mesures `document.scrollWidth`, **320 px ET
  1280 px**, **les deux langues**.
- **Cohérence** : la grille C1–C8 du chantier précédent, plus les invariants
  neufs de son lot.
- **Un run réel** dès que le lot touche au modèle (L7, L8) — avec le compteur
  qui distingue **déclaré / valide / refusé**, jamais deux nombres.

---

## 4. ⛔ Les deux lots BLOQUÉS, et par quoi

### L1 — une question produit, née d'un conflit entre deux de tes décisions

- **13/08** (migration `20260813180000`) : un mineur **peut** porter une
  direction — mais `fat_loss` et `recomposition` restent **refusés à
  l'écriture**, sur les deux portes RPC. Raison écrite : ce sont les deux
  registres qui **retirent**, ceux qui parlent de poids et de silhouette.
- **18/08** (aujourd'hui) : trois objectifs — perdre / maintenir / prendre.

**Le conflit** : « perdre du poids » **est** `fat_loss`. Un mineur ne peut donc
pas le porter. Trois sorties, à trancher avant que L1 démarre (§5).

**Défaut réel trouvé en chemin, et il est dans L1 quoi qu'il arrive** :
`servingDirectionFor` (`household_portions.ts:392`) écrase **toujours** la
direction d'un mineur par `CHILD_DIRECTION`. Depuis le 13/08 on peut donc poser
« prendre du muscle » sur un ado, et le moteur l'ignore. **La migration est à
moitié livrée** — décision en base, comportement inchangé.

### L4 — trois réponses que le dépôt exige avant la première ligne

`CALORIE_REVERSAL.md` §0 déclare l'étape bloquante, et la raison n'est pas
technique (Levinson 2017, cité dans le test de propriété) :

1. La garde **supprime**-t-elle le chiffre, ou **empêche**-t-elle de le produire ?
2. **Où s'écrit l'état** qui porte cette décision ? (un paramètre de garde
   optionnel est une garde désarmée — cicatrice mesurée)
3. La personne peut-elle **l'éteindre** ? (un chiffre qu'on ne peut pas faire
   taire est un tracker)

---

## 5. Les sorties possibles pour L1

| Sortie | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **A — « perdre » reste refusé aux mineurs** | l'enfant choisit entre maintenir et prendre ; la garde du 13/08 est intacte | l'ado en surpoids n'a pas d'objectif de perte, même accompagné |
| **B — « perdre » ouvert à tous** | trois objectifs identiques pour tout le monde, comme demandé le 18/08 | renverse la garde du 13/08 ; il faut alors décider ce qui protège à sa place (plancher par âge ? accord du maître ?) |
| **C — ouvert, mais jamais énoncé** | l'objectif s'applique au **calcul** ; l'enfant ne voit ni cible, ni chiffre, ni mot de perte — le registre reste éducatif | demande que le plancher d'énergie soit **calculé sur l'âge**, ce qui est du travail en plus dans L1 |
