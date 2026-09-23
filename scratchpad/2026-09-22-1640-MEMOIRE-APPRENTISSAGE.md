# La mémoire apprend au lieu d'accumuler — lot du 2026-09-22

> Rien n'est commité.
> `deno test … _shared/keel/` : **7 691 passés · 0 échec · 2 ignorés** (avant le lot : 7 644)
> `vitest src/keel/api/retainedItems.int.test.ts` : **99 passés** (avant : 92)
> `tsc -p frontend/tsconfig.app.json` : vert · `token-lint` 73 et `ci:wiring` 26, **inchangés**

---

## ① « Moins » n'est plus « jamais »

**Mesuré en base, sur le seul compte réel.** « Pas **autant** de petit suisse le matin »
était rangée en `food.exclude` sans nuance : la ceinture retirait l'aliment de toutes les
boîtes, **pour toujours**, sur une phrase qui demandait *moins*. Le produit n'avait que deux
pôles, et une phrase de quantité tombait sur le pôle fort — celui dont on ne s'aperçoit
qu'en remarquant une absence. C'est le défaut qui **fabrique** de faux souvenirs.

`food.exclude` et `method.avoid` portent désormais **`force`** :

| | ceinture | carte |
|---|---|---|
| `never` | retire la bouche du contenant | « keep it out of the shared dish » |
| `less` | **ne retire rien** | « LESS OFTEN, not banned » + « sers-lui une plus petite part » |

Quatre décisions, chacune tenue par un test :

- **Le repli va vers la règle FORTE.** Clé absente ⇒ `never`. Toute la base d'avant ce lot
  n'a pas la clé ; la relire en `less` aurait désarmé chaque exclusion existante, en
  silence, le jour du déploiement. L'imprécision coûte un plat évité de trop ; l'inverse
  servirait à quelqu'un ce qu'il vient de refuser.
- **Un jeton hors liste fait tomber l'item.** Ni `never` (on bannirait sur une valeur
  illisible), ni `less` (on désarmerait).
- **`food.prefer` n'en a pas** (`force?: never`, l'interdit est nommé) : aucun lecteur ne
  distingue « j'aimerais plus de légumes » de « il me faut des légumes ».
- **Un `less` ne se juge pas sur un plan** ⇒ `unverifiable / no_baseline`. « Moins » est une
  comparaison avec un *avant* qu'un plan seul n'a pas. Le rendre `honoured` parce que
  l'aliment est absent serait faux ; `violated` parce qu'il est présent aussi.

**Défaut trouvé en assemblant la ligne réelle**, et fermé : la voix d'une bouche portait
« continue d'en servir » **et** « garde-le hors du plat » sur la MÊME ligne, à un caractère
d'intervalle. C'est la cicatrice « la phrase de table contredit le couvercle », vue sur une
voix. La marque de portée suit maintenant la force.

## ② La faute de frappe se corrige dans le texte, pas dans la citation

`lesoeufs` est en base depuis le 2026-09-20. Ce texte est **cherché dans le plan** : une
faute ne trouve rien, et la règle ne mord jamais. La consigne demande désormais d'écrire
l'aliment correctement — et dit que les mots exacts survivent dans la citation, ce qui rend
la correction honnête.

## ③ Une phrase neuve retire ce qu'elle dément

**Mesuré : le magasin ne faisait que grossir.** `next_plan` expire, `durable` **jamais**.
« Plus de poisson » puis « finalement du poisson le matin ça me va » laissait les **deux**
lignes en base, servies ensemble au modèle.

`supersedes(next, prior)` — même `subject`, même `occasion`, même `text`, et l'une renverse
l'autre (polarité opposée, ou même famille de force différente).

⛔ **C'est la seule règle de ce dépôt qui RETIRE.** Un faux positif efface un souvenir que la
personne a donné, et elle ne saura pas ce qui a disparu. D'où :

- **l'égalité de texte est une jointure, pas une ressemblance** : `trim` + minuscules, rien
  d'autre. `lait` ≠ `laitue`, `poisson` ≠ `poissons`, `pain` ≠ `pain complet` — quatre cas
  en dur ;
- **un autre moment ne dément rien** : « pas de poisson le matin » et « du poisson le soir
  ça me va » **coexistent** ;
- **jamais à rebours** : une ligne plus récente survit à une phrase antérieure ;
- **une ligne illisible en base survit** : un port d'écriture n'est pas un ramasse-miettes ;
- **le retrait est compté** (`superseded`, à côté de `durable_written`) : « 1 écrit, 1
  démenti » est un remplacement, « 1 écrit, 0 démenti » un ajout.

Le fichier de test compte **plus de cas « ça ne retire PAS » que de cas qui retirent**, et
c'est délibéré.

## ④ Le constat se lit enfin

`generated_from.retained_honoured` était sur **0 des 635 plans** — non parce qu'il ne
tournait pas, mais parce que `generated_from` n'est persisté que sur une ligne **adoptée**, et
que tout le travail se fait en `intent: "draft"`. Le **même objet** (jamais un second calcul)
sort désormais aussi dans le corps du brouillon, donc en base (`student_meal_drafts.response`).

## ⑤ Le front ne peut plus perdre la nuance

Le front a sa propre copie du socle. Sans `force`, une ligne « moins » **réécrite depuis la
carte** repartait en base sans la clé, et le socle relit une force absente comme `never` :
la règle douce devenait une interdiction **parce que la personne avait corrigé une faute
d'orthographe**. Copie mirroir + 7 cas de parité, dont le chemin exact de la perte.

⚠️ Asymétrie assumée à l'écriture : `occasion` absent n'est pas écrit (il se relit `null` des
deux côtés) ; `force` s'écrit **même à `never`**, parce que son absence se relit `never` —
taire un `less` le changerait.

---

## La chaîne, sur la note réelle du 2026-09-22

```
── force: never ──
  ceinture : RETIRE la bouche (« petit »)
  carte    : petit suisse -- ONLY AT breakfast -- THIS PERSON ONLY: keep it out of the shared dish…
  constat  : violated

── force: less ──
  ceinture : ne retire RIEN
  carte    : petit suisse -- ONLY AT breakfast -- LESS OFTEN, not banned: keep serving it,
             just less than before -- THIS PERSON ONLY: serve them a smaller share of it…
  constat  : unverifiable / no_baseline

── supersession ──
  « plus jamais » puis « pas autant »  → l'ancienne PART
  une autre bouche                      → les deux restent
  un autre moment                       → les deux restent
```

---

## ⛔ Ce qui reste ouvert

1. **Le magasin est par COMPTE, pas par FOYER.** Un souvenir `subject: household` est rangé
   dans `student_goals.practical_constraints` de **la personne qui compose**. Deux comptes
   du même foyer ont deux mémoires de maison séparées. Le code le nomme déjà
   (`index.ts` ~4318) et le classe **décision produit** : qui parle pour la maison quand
   deux titulaires demandent des choses opposées ? Aujourd'hui ça ne mord pas — le seul
   foyer réel n'a **qu'un compte** (Fabrice et Christèle sont des bouches sans compte).
2. **Rien ne vieillit encore par le temps.** La supersession retire sur **contradiction**,
   pas sur **âge**. Un `food.exclude` de mars reste vrai en septembre tant que personne ne
   le dément.
3. **Le questionnaire n'a toujours aucun répondant réel** (37 lignes, 0 hors fixtures).
4. **Le banc n'a pas tourné** (clé de modèle hors de ce shell), et **aucun run réel** depuis
   ce lot — le runtime edge sert des `_shared` périmés tant qu'il n'est pas relancé.

## Fichiers

**Neuf** — `retained_supersede_test.ts`.
**Modifiés** — `retained_item.ts` (force + `supersedes`), `retained_items_io.ts`,
`food_exclusion_belt.ts`, `retained_items_routing.ts`, `retained_honoured.ts`,
`draft_note_classify.ts`, `draft_note_corpus.ts` (50 notes), `generate-household-meal-v1/index.ts`,
`frontend/src/keel/api/retainedItems.ts`, `NOMENCLATURE-MEMOIRE.md`, et les tests qui
épinglaient ce qui a bougé.
