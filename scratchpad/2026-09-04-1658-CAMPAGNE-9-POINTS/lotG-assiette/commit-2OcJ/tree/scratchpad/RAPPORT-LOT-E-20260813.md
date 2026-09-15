# Lot E — la part du réclamé

Branche `ff-001-quotidien-du-coach`. Rapport factuel : ce qui est **mesuré** est marqué comme
tel, ce qui ne l'est pas porte `⚠️ NON VÉRIFIÉ`.

---

## 1 · Le commit

| SHA | Ce qu'il referme |
|---|---|
| `c784e57b` | `MyShareCard` reprend son corps, `api/myShare.ts` + ses 9 tests |

Trois fichiers, exactement ceux de la colonne §2.2 :

```
frontend/src/keel/api/myShare.int.test.ts         | 130 +++
frontend/src/keel/api/myShare.ts                  | 101 +++
frontend/src/keel/components/plan/MyShareCard.tsx | 226 ++++-
```

Aucun `push`, aucun merge, aucune branche créée. Aucun `git stash`, aucun `git checkout --`.
Aucun `git add -A` : les deux fichiers neufs ont été mis en index **par leur chemin**, puis
`git commit --only` avec les trois chemins listés. Aucun `--no-verify` : le gate a tourné
(2 958 tests Deno, `tsc -b`, `deno check`, `eslint`) et rendu **pass**.

⚠️ **Une coquille dans le corps du message** : la dernière ligne écrit ``break-words"`` au lieu
de ``` `break-words` ```. Non amendée — réécrire l'historique d'une branche partagée par
plusieurs sessions pour un guillemet coûte plus cher que la coquille.

---

## 2 · 🔴 CE QUI BLOQUE LE LOT, ET CE N'EST PAS DANS MA COLONNE

> **Le site de montage passe `mine={null}` EN DUR. La carte se tait donc TOUJOURS aujourd'hui,
> pour tout le monde, y compris un secondaire réclamé qui a une part.**

`frontend/src/keel/pages/StudentWeekPlanPage.tsx:2143-2150`, tel que Lot D l'a posé :

```tsx
<MyShareCard
  mine={null}                                      // ← ne change jamais
  householdDishes={householdMeal?.dishes ?? []}
  meMemberId={household?.me?.memberId ?? null}
  busy={false}
  onApprove={async () => {}}                       // ← fonction vide
  onRequestChange={async () => {}}                 // ← fonction vide
/>
```

Ce fichier appartient à **Lot D** (§2.1 arbitrage n°2) et je ne l'ai pas ouvert. **La consigne
était de m'arrêter et de le signaler plutôt que d'y toucher « juste une ligne ».** Voici la
ligne exacte, avec l'import à ajouter :

```tsx
import { selectMyShare } from "../api/myShare";
// …
  mine={selectMyShare({
    portions: householdMeal?.portions ?? [],
    meMemberId: household?.me?.memberId ?? null,
    isOwner,
  })}
```

Les trois valeurs existent déjà dans l'état de la page (`householdMeal` `:1061`, `household`
`:1060`, `isOwner` `:1064`) : c'est **une ligne et un import**, rien de plus.

⚠️ **`isOwner` n'est pas une précaution, c'est la moitié de la règle.** Le maître **A** une
ligne dans `member_portions` — vérifié en base : Paul est la **première** entrée de
`ddfd02b4`. Router sans `isOwner` lui rendrait une carte « Ta part / Je valide » juste sous le
formulaire qu'il vient d'envoyer, et lui demanderait de valider son propre geste. C'est
`selectMyShare` qui porte ce refus, pas la carte : la carte ne connaît pas la place, le site de
montage si.

Tant que cette ligne n'est pas posée, **le lot est vert, testé, et invisible** — c'est
nommément le mode d'échec n°1 de ce dépôt (§6.6), et il est ici *par respect de la règle de
colonne*, pas par oubli.

---

## 3 · Ce qui est livré

### 3.1 · On ne génère RIEN, et c'est tout l'arbitrage

L'idée de l'utilisateur — « ça crée automatiquement le plan pour le compte réclamé en prenant
ses datas » — **est déjà vraie depuis toujours**. `member_portions` porte un objet par bouche,
calculé sur ses données. Mesuré en base sur « Bramble », plan `ddfd02b4` :

| Bouche | `portion_note` (extrait) |
|---|---|
| Paul (maître) | *« Serve one balanced plate: a standard share of the protein, starch and vegetables… »* |
| Lea (mineure, sans compte) | *« Serve a child-size plate: a smaller scoop of the main components… »* |
| Zoe (réclamée, `muscle_gain`) | *« Serve a larger plate: extra chicken and potatoes… »* |

Trois personnes, trois instructions différentes, **aucune ne nomme une raison** — le contrat
de `sanitizePortionNote` tient sur les données réelles. Il n'y avait donc rien à calculer : il
manquait un écran. **Zéro appel modèle passe par ce lot, sur aucun chemin.**

### 3.2 · `api/myShare.ts` — deux fonctions pures, aucune I/O

`sharePresentedTo({ mine, meMemberId })` — la **garde d'identité**. Elle compare `member_id` et
rend `null` dès qu'il diverge. C'est la seule chose qui distingue deux lignes : elles ont
exactement la même forme, et une instruction de service est plausible pour n'importe qui.
Rien à l'écran ne trahirait une substitution.

`selectMyShare({ portions, meMemberId, isOwner })` — la fonction du **site de montage**. Elle
refuse le maître, refuse une place non lue, cherche ma ligne, puis **repasse par la garde
d'identité** plutôt que de rendre sa trouvaille : la règle « jamais la part d'un autre » est
écrite à un seul endroit.

**Aucun lecteur n'a été écrit.** `loadHouseholdMeal` (`api/household.ts:1251`) existe, filtre
`plan_kind='household'`, et `/app/plan` l'appelle déjà (`StudentWeekPlanPage.tsx:1168`). Une
seconde requête aurait fait un second lecteur de la même ligne — le défaut que
`household_plan_kind_readers_test.ts` scanne, et qui a mordu **deux fois** le 2026-08-12 — plus
un aller-réseau en double.

⚠️ **`myShare.ts` n'est PAS ajouté à la liste `READERS`**, et c'est délibéré : ce test exige
d'un fichier listé qu'il porte **au moins une** requête (`offsets.length > 0`, `:63`). L'y
inscrire sans requête le ferait échouer. Le fichier passe donc devant la garde **par
construction** : il n'interroge pas la table.

**Le piège §6.1 vérifié sur les données, pas sur la doc** : le foyer « Bramble » porte
**trois lignes `personal`** avec le **même `household_id`** que ses trois lignes `household`.
`household_id is not null` n'est pas « plan du foyer ».

### 3.3 · `MyShareCard` — sa part, puis les plats, puis le geste

Dans cet ordre. Le geste vient **après** les deux, parce que « il n'y a plus qu'à valider » se
dit une fois qu'on a tout lu — même ordre que `TakeTheHandCard`, qui dit ce que le geste coûte
avant de l'offrir.

Ce qu'elle n'affiche jamais : aucun objectif, aucun poids, aucune calorie, aucun « pourquoi »
de part ; la part d'aucun autre ; ni `why` ni ingrédients des plats communs (`HouseholdDishView`
ne porte que titre / jour / moment) ; **aucune phrase qui lui reproche de ne rien faire** — être
composé dans le plan du foyer est la posture normale, et la carte ne la commente pas.

Pour un secondaire qui n'a pas pris la main, le bloc « Ce que la maison cuisine » est le **seul
endroit du produit** où il lit ce qu'on cuisine : `loadMealPlans` est scopé sur son `user_id`
(`mealGeneration.ts:817`) et ne lui rend rien. Ce scope est **juste** et n'a pas été touché.

### 3.4 · ⛔ « Je valide » n'appelle PAS `keel_validate_meal_plan`

Cette RPC veut dire « **je prends la main, retirez-moi du plan commun** » : elle est consommée
par la machinerie de fusion et **refuse** un plan `plan_kind='household'` (`not_a_personal_plan`).
La détourner ferait **sortir du foyer** quelqu'un qui voulait dire oui. Le geste de prise de
main a déjà sa surface, séparée et explicite sur ses conséquences (`TakeTheHandCard`).

Ici c'est un **accusé léger** : état local, aucun effet sur le plan du foyer, parce que la
composition n'attend jamais personne. L'accusé est posé **après** `await onApprove()` et jamais
avant : si l'appelant échoue un jour, « Validé. » serait un fait faux, et un fait faux affiché
est indémentable.

### 3.5 · ⛔ « Demander une modif » n'est PAS rendu — décision motivée

**Le geste n'a aucune destination.** Vérifié :

- `onRequestChange` est câblé sur `async () => {}` au site de montage ;
- `plan_draft_note.ts` (Lot C, sur le disque, non commité) garde la phrase d'un **brouillon**
  de composition — c'est la lane du **compositeur**, pas une demande d'un secondaire ;
- `meal_plan_feedback` (migration non commitée d'une autre session) est le retour de **fin de
  fenêtre**, questions fermées, une ligne par `meal_id`, `unique (meal_id)`. Ce n'est pas ça ;
- aucune autre table ne reçoit une demande de modification d'un secondaire, et **il n'existe
  aucun canal 1:1** dans ce produit.

Rendre le bouton afficherait `plan.mine.change_sent` — « **C'est parti au foyer.** » — alors que
rien n'aurait quitté le navigateur. Un bouton qui ne fait rien est indiscernable d'un bouton
qui a marché ; la consigne était explicite : **« préfère un geste absent à un geste muet »**.

`onRequestChange` reste donc dans les props (contrat §4.5), n'est **pas déstructuré**, et le
fichier porte le point de jonction en tête. Les trois clés `plan.mine.request_change` /
`change_label` / `change_sent` sont posées et attendent.

---

## 4 · Ce qui est mesuré

| Vérification | Avant le lot | Après |
|---|---|---|
| `cd frontend && npx tsc -b` | vert | **vert** |
| Suite front complète | 855 passed, **3 failed** | 864 passed, **3 failed** (mêmes 3) |
| `npx vitest run src/keel/api/myShare.int.test.ts` | — | **9 passed** |
| `eslint` sur mes 3 fichiers | — | **0 erreur** |
| `eslint src/keel/i18n/en.ts` | 8 | **8** — inchangé |
| `./scripts/agent-gate.sh` (hook de commit) | — | **pass** (2 958 tests Deno, 0 échec) |

### Le test mord — mesuré, pas supposé

`selectMyShare` muté en `input.portions[0] ?? null` (une implémentation qui « trouve » toujours
la première ligne) : **1 test rouge sur 9**, celui qui vérifie que Zoe — **troisième** entrée du
tableau réel — retrouve bien SA ligne. Le rouge remonte depuis la garde d'identité, ce qui
prouve qu'elle est porteuse et pas décorative. Mutation annulée, 9/9 vert à nouveau.

### 320 px — mesuré, et il y avait un vrai défaut

Serveur `frontend-a8` (5188, déjà lancé), viewport **320×720**, markup réelle des trois blocs
dans la vraie feuille Tailwind de l'app. Cas : la `portion_note` réelle de Nina (155 car.), ses
notes de préparation, cinq plats, **plus un titre de 39 caractères insécables**
(« Kartoffelgratinmitschinkenundkaesesauce », plausible en allemand).

| | `document.scrollWidth` / `clientWidth` | carte | éléments en débordement |
|---|---|---|---|
| **Sans `break-words`** | **327 / 320** ⛔ | 309 / 284 | **8** |
| **Avec `break-words`** (livré) | **320 / 320** | 284 / 284 | **0** |

**Le corps de la page défilait horizontalement.** Trois `break-words` posés sur les trois blocs
qui portent du texte venu du modèle. La mesure est écrite dans le fichier, à côté de la classe.
Hauteur du bouton `md` : 38 px.

---

## 5 · ⚠️ CE QUE JE N'AI PAS PU VÉRIFIER

1. **L'écran authentifié, avec des données réelles.** Saisir un mot de passe m'est interdit et
   aucune session n'existait sur cette origine. Je n'ai donc **jamais vu la carte rendue par
   l'application** — ni pour Nina, ni pour Zoe, ni pour Paul. Les états se déduisent des tests
   (9 cas, fixtures recopiées de la base) et de la lecture SQL. **C'est le travail de Phase 3**,
   et il ne pourra rien voir tant que le §2 n'est pas posé.
2. **Le rendu du bloc « ce que la maison cuisine » avec de vrais jetons de jour/moment.**
   `dishDayLabel` / `dishSlotLabel` replient sur le jeton brut quand la clé est inconnue ; je
   n'ai pas inventorié les jetons présents dans `dishes` en base.
3. **Le comportement de l'accusé sur plusieurs onglets / après un rechargement.** Par
   construction il ne survit pas (état local) ; je ne l'ai pas observé dans un navigateur.
4. **Aucune vérification de contraste faite à l'écran** — les valeurs citées (`ink` 16,18:1,
   `ink-soft` 6,11:1, `red-700` 6,13:1) sont celles du kit, reprises telles quelles.

---

## 6 · Les rouges consignés — aucun n'est le mien

| Rouge | À qui | Preuve |
|---|---|---|
| `coverage-guard.int.test.ts` — 2 cas (edge functions, triggers DB) | **Autre session** | Présents **avant** ma première édition ; je n'ai touché aucune migration ni fonction edge |
| `planRefusals.int.test.ts` › « ne perd aucun motif au passage de `HouseholdPage` » — 7 clés `household.error.*` orphelines | **Autre session** | Présent avant ; déjà consigné par Lot D |
| `en.ts` — 8 `no-irregular-whitespace` (l. 3319-3321) | **Autre session** (refonte i18n) | Compte **inchangé** : 8 avant, 8 après |

Le rouge `note_unusable` que Lot D avait consigné comme transitoire **est refermé** : la suite
ne le rend plus.

---

## 7 · Ce que j'ai trouvé hors contrat

1. **Le plan de foyer vivant le plus récent de « Bramble » ne porte qu'UNE part.**
   `38f60307` (fenêtre du 19 août) a `member_portions` = `[Nina]` seule, alors que le foyer
   compte quatre bouches et que le plan porte 15 plats. Zoe, réclamée elle aussi, n'y est pas.
   Conséquence directe : **Zoe verra `null`** même une fois le §2 posé, et ce sera juste — mais
   c'est un état de données qu'aucune QA ne devinera. **Pourquoi ce plan n'a qu'une part est une
   question pour Lot A / le générateur, pas pour ce lot.**

2. **`TableCard` rend la `portion_note` de TOUT LE MONDE, à tout le monde.**
   `components/plan/TableCard.tsx:39-59` boucle sur `meal.portions` sans filtre. Elle est montée
   sur `/app/plan` pour le maître **et** pour un secondaire (§1.2 et §1.4, ligne 9). Ce n'est
   pas contradictoire avec la règle « jamais la part d'un autre **dans sa carte à lui** » — « À
   table » est explicitement la lecture collective —, mais **c'est un arbitrage qui n'a jamais
   été écrit noir sur blanc pour un secondaire**, et il rend le bloc « ta part » partiellement
   redondant avec le bloc juste en dessous. Décision humaine, pas décision de lot ; je n'y ai
   pas touché.

3. **La question ouverte de l'accusé : faut-il le persister ?**
   Aujourd'hui « Validé. » ne survit pas à un rechargement. Ce qu'il faudrait pour le persister,
   si on le décide : une colonne ou une petite table portant `(meal_id, member_id, seen_at)`,
   **et un lecteur nommé**. Le précédent qui gouverne : `weekly_reviews.biofeedback`, six axes
   collectés pour un lecteur qui n'a jamais existé, supprimés. **Une colonne dont on ne peut pas
   écrire le lecteur n'entre pas.** Je n'ai posé aucune migration.

4. **La dette i18n de Lot D me concerne aussi.** `MyShareCard` rend huit clés `plan.mine.*` qui
   n'existent **que sur le disque** (`en.ts` et `fr.ts` ne sont pas commités — `fr.ts` est
   absent de `HEAD`). Mon commit **compile dans l'arbre de travail** et ne compilerait pas
   depuis un clone. C'est la même dette, elle se solde au même moment.

5. **La liste `READERS` de `household_plan_kind_readers_test.ts` a une contrainte non
   documentée** : un fichier listé **doit** porter au moins une requête sur
   `student_generated_meals`. La consigne en tête du fichier (« ajoute-toi si tu en écris un »)
   ne dit pas qu'un fichier **sans** requête le fait échouer. Un lot futur qui s'y inscrirait
   par prudence rendrait le test rouge.

---

## 8 · Ce qui est resté fermé

- `frontend/src/keel/api/household.ts` — **importé, jamais modifié** (§2.1 arbitrage n°5).
- `frontend/src/keel/pages/StudentWeekPlanPage.tsx` — non ouvert (§2).
- `en.ts`, `fr.ts`, `catalog.ts`, `planRefusals.ts` — non ouverts, non commités.
- Aucun fichier backend, aucune migration, aucune fonction edge.
- Aucune commande à risque (`db push/reset`, `functions deploy`, `secrets set`, `config push`,
  `link`) ; `supabase/signing_keys.local.json` non touché ; aucun `db reset`.
- `.claude/launch.json` non modifié — j'ai réutilisé le serveur `frontend-a8` déjà lancé plutôt
  que d'ajouter une entrée à un fichier partagé.
- Aucune donnée écrite en base : les seules requêtes passées sont des `select` et un `\d`.
