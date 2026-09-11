# Socle commun — chantier « fiabiliser la composition dès le premier jet »

Lis ce fichier EN ENTIER avant de toucher au code. Il vaut pour les cinq lots.

## 0. Autorité

- Le chantier : `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md` n'est PAS l'autorité de ce
  chantier-ci. L'autorité est le message de l'utilisateur repris dans
  `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/CHANTIER.md`.
- Les preuves : `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`. **Lis-la.** Elle contient
  les mesures qui justifient chaque lot, et elle corrige un rapport antérieur
  (`docs/keel/MESURE-DEUX-DIRECTIONS-2026-09-11.md`) dont les chiffres NE DOIVENT PAS devenir
  des attentes de test.
- La grille de mesure : `docs/keel/mesure.md`.
- Les règles projet : `CLAUDE.md` (à la racine) et `AGENTS.md`.

## 1. Style de code — ce dépôt a une convention, tiens-la

- Commentaires **en français**, denses, qui nomment **le défaut mesuré** que le code répare,
  avec son chiffre et sa date quand on l'a. Regarde `food_composition.ts`,
  `portion_sizing.ts`, `plan_repair_loop.ts` : c'est le registre attendu.
- Pas de jargon décoratif. Un mot technique ne s'emploie que s'il nomme quelque chose qui
  existe dans ce dépôt (un fichier, une fonction, une table, une colonne).
- Les modules `_shared/keel/*.ts` sont **purs** sauf ceux suffixés `_io.ts`. Pas d'I/O, pas
  d'horloge, pas d'aléatoire dans un module pur — l'horloge est un argument.
- Une valeur absente reste **inconnue** (`null`), jamais zéro. C'est la cicatrice n°1 du dépôt.
- Un repli silencieux est interdit : on s'abstient, et on **compte** l'abstention.

## 2. Comment on vérifie

```bash
# la suite Deno du dossier keel (46 s) — c'est le gate
deno test --allow-read --allow-env supabase/functions/_shared/keel/

# un seul fichier
deno test --allow-read --allow-env supabase/functions/_shared/keel/mon_test.ts

# le typecheck d'une fonction edge
deno check supabase/functions/generate-household-meal-v1/index.ts
```

⛔ **TROIS ROUGES PRÉEXISTENT au 2026-09-11 03:30.** Ils ne t'appartiennent pas, ne les
répare pas, ne les compte pas comme une régression :

- `cooking_style_brief_test.ts:70` — « le style DÉRIVE la difficulté et la variété »
- `household_freeze_test.ts:286` — « personne ne relit `free_until` hors de la facturation »
- `household_merge_quota_test.ts:190` — « AUCUNE PORTE DE SORTIE ENTRE LA RÉCLAMATION… »

Référence : `FAILED | 6409 passed | 3 failed | 2 ignored`. **Ton lot doit finir à 3 rouges,
pas 4.** Et le nombre de tests doit AUGMENTER.

## 3. Interdits absolus

- ⛔ `supabase db push`, `db reset`, `functions deploy`, `secrets set/unset`, `config push`,
  `link`. Bloqués par un hook. Si tu en as besoin : **arrête-toi et écris la commande exacte
  dans ton rapport** pour que l'humain la lance.
- ✅ `supabase migration up` en local est autorisé (mémoire `local-migrations-authorized`).
- ⛔ `git stash`, `git checkout`, `git restore`, `git reset` : **le dépôt est partagé entre
  plusieurs sessions**, 1 000 fichiers non commités appartiennent à d'autres. Tu n'as le droit
  d'écrire que dans TES fichiers. Ne commite pas.
- ⛔ N'écris **aucun** fichier sous `supabase/functions/**` pendant qu'une génération réelle
  tourne. Aucune ne tournera ce soir ; ne lance pas de génération réelle toi-même.
- ⛔ Pas d'appel modèle payant. Aucun.
- ⛔ Si une fonction edge rend 401 `Invalid JWT` : seul geste autorisé
  `./scripts/check-local-jwt-alg.sh`, puis lis `docs/keel/JWT-HS256.md`.

## 4. La base locale

Elle tourne. Lecture SQL directe autorisée :

```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -A -F'|' -c "select …"
```

⛔ Aucun `delete`, `truncate`, `drop`, `update` à la main sur des données. Les changements de
données passent par une **migration** dans `supabase/migrations/`, jamais par du SQL à chaud.
Ne modifie JAMAIS une migration historique déjà appliquée : écris-en une nouvelle.

## 5. Les deux plans qui servent de preuve

- PERTE `5fad22ce-d181-4a0c-b0b5-77caf65092b5` (Paul, 178 cm/88 kg, fat_loss, cible **2 454**
  kcal/j, bande 2 454–2 602 — **asymétrique**, son milieu 2 528 n'est PAS la cible).
- GAIN `a18f522e-41f9-469e-9c50-1d693d892ce6` (Max, 178 cm/62 kg, muscle_gain, bande
  2 846–2 978 centrée sur 2 912).

Tables utiles : `student_meal_plans` (le plan écrit), `llm_raw_response_events` (consignes et
réponses archivées), `llm_usage_events` (durées, jetons). Les six réponses modèle archivées
sont rejouables **hors ligne** — c'est le matériau de test le plus précieux du chantier.

## 6. Ce que j'attends de ton rapport final

1. Ce qui est **fait et prouvé** (avec la commande et son résultat).
2. Ce qui est **fait mais non prouvé** (et pourquoi).
3. Ce que tu **n'as pas fait**, et pourquoi.
4. **Les arbitrages que tu as pris** : chacun sous la forme « question → décision → raison ».
   C'est la partie la plus importante du rapport : l'utilisateur les lira un par un.
5. Les fichiers que tu as créés ou modifiés, un par ligne.

## 7. Propriété des fichiers — un lot, un périmètre. NE DÉBORDE PAS.

Quatre agents travaillent **en même temps** sur ce dépôt. Écrire dans le fichier d'un autre
écrase son travail sans avertissement. Si tu as besoin d'un changement chez un voisin :
**ne le fais pas**, écris-le dans ton rapport final sous « demandes au voisin ».

| Lot | Fichiers dont tu es le SEUL propriétaire |
|---|---|
| **A** | `food_composition.ts`, `food_composition_io.ts`, `food_reference_manifest.ts` (neuf), ses tests, une migration neuve `supabase/migrations/20260911*` |
| **B** | `box_densify.ts`, `portion_sizing.ts`, `plan_energy.ts`, `plan_energy_read.ts`, `mouth_energy.ts`, `preparation_mass.ts` (neuf), leurs tests |
| **C** | `household_portions.ts`, `meal_generation.ts`, `composition_contract.ts` (neuf), leurs tests |
| **D** | `proportion_adjust.ts` (neuf) et son test — **rien d'autre** |
| **E** | `generate-household-meal-v1/index.ts`, `retry_merge.ts`, `plan_repair_loop.ts`, `plan_budget.ts` (lot E passe APRÈS les autres) |

Chacun peut **lire** tout le dépôt. Chacun peut créer ses propres fichiers de test.

## 8. Les interfaces partagées — FIGÉES ICI, ne les renomme pas

Elles permettent aux quatre lots d'avancer en parallèle sans s'attendre.

### Lot A expose (`_shared/keel/food_reference_manifest.ts`)

```ts
/** L'état de validation d'une référence du référentiel. */
export type RefValidation = "verifie" | "a_verifier" | "rejete";

/** L'état d'une référence. Pur, sans base : la règle est dans le code, les
 *  exceptions dans une table lue par `food_composition_io`. */
export function validationOf(ref: CompositionRef): RefValidation;

/** Vrai seulement pour `verifie`. C'est la porte de la COMPOSITION. */
export function isComposable(ref: CompositionRef): boolean;
```

Et `CompositionRef` (dans `food_composition.ts`) gagne un champ `validation: RefValidation`.

### Lot B expose (`_shared/keel/preparation_mass.ts`)

```ts
/** Ce qu'on a décidé de l'eau d'UNE casserole, et pourquoi. */
export type WaterTreatment = "absorbed" | "kept" | "discarded" | "undetermined";

export interface PotMeasure {
  /** Les grammes PRÊTS de cette casserole entière. `null` = non mesurable. */
  readyG: number | null;
  kcal: number | null;
  proteinG: number | null;
  water: WaterTreatment;
  /** Pourquoi `null`, quand c'est `null`. Jamais vide si `readyG === null`. */
  gaps: readonly string[];
}

export function measurePreparation(
  index: CompositionIndex,
  prep: { id: string; method?: string | null; ingredients: readonly unknown[] },
): PotMeasure;
```

### Lot D n'importe RIEN du moteur

`proportion_adjust.ts` reçoit la mesure par **injection** : une fonction
`(ingredients) => { kcal: number|null; readyG: number|null }` passée en argument. Il reste
donc pur, testable sans référentiel, et il ne dépend pas du calendrier du lot B.

## 9. Arbitrages DÉJÀ PRIS — ne les rejoue pas, applique-les

**① Le manifeste ne réduit pas le catalogue à 192 lignes.** Mesuré ce soir :
881 références disent `source = 'ciqual'` mais **689 n'ont aucun `ciqual_code`**, 44 sont
`manual`, 18 viennent du sas modèle (`source = 'sas'`). Exiger un code CIQUAL pour être
« vérifié » supprimerait les trois quarts du référentiel et casserait le produit. La règle
retenue : **`verifie` par défaut**, sauf ① `source = 'sas'` (estimation modèle) ⇒ `a_verifier`,
② toute ligne inscrite dans la table d'exceptions de la migration ⇒ `a_verifier` ou `rejete`,
③ un `ciqual_code` porté par deux slugs différents ⇒ les deux sont suspects jusqu'à arbitrage
nominatif.

**② La porte est à la COMPOSITION, pas à la mesure.** `resolveIngredient` continue de résoudre
et rend l'état dans la référence — mesurer un plan historique reste possible et reste honnête.
Ce qui est **refusé sans échappatoire**, c'est ① la présence d'une référence non `verifie` dans
le catalogue montré au modèle, et ② un identifiant non `verifie` accepté par le parseur d'une
génération neuve. Un usage de référence `a_verifier` dans une mesure est **compté et nommé**,
jamais silencieux.

**③ `Dpréf` NE REVIENT PAS à `100 × E / Gpréf`.** Le chantier le demande (lot C.4) mais ce
dépôt a déjà tranché l'inverse, **avec des mesures**, sous le nom **A15** dans
`docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md:573` : `100 × E / Gpréf` rend **236 kcal/100 g**
sur un déjeuner de 1 120 kcal, alors que les plats réels de ce dépôt vivent entre **113 et
156** ; on a mesuré **389 demandés au dîner et 126,7 rendus**, consigne ignorée. Revenir à cette
formule réintroduirait un défaut mesuré.

**Ce qu'on retient de la demande, c'est le mot « silencieusement ».** `densityCorridorFor`
doit donc exposer **les deux nombres** : `preferredPer100G` (ce qu'on DEMANDE, ancré au bas du
couloir, inchangé) et un nouveau `targetAnchoredPer100G = 100 × E / Gpréf` (ce que la cible
impliquerait), plus un compteur de divergence. Rien n'est substitué en silence, et la mesure
qui a fondé A15 n'est pas jetée. **Propriété du lot B** (`portion_sizing.ts`).

## 10. Le banc de rejeu existe déjà — sers-t'en

`scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/` contient **les six réponses modèle
archivées**, les six consignes, les deux plans écrits, le référentiel figé, et un script de
rejeu **hors ligne** qui emploie le parseur, les applicateurs et les mesures de production :

```sh
deno run --cached-only --allow-read \
  --allow-write=scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS \
  scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/rejouer.ts
```

Aucun appel modèle, aucun accès réseau, aucune écriture en base. C'est le matériau de test
le plus précieux du chantier : `traces.json`, `consignes.json`, `composition.json`.

⚠️ **Ce script s'ARRÊTE volontairement** si le code actuel ne reproduit plus les 18 parts
standards des journaux. C'est voulu, et c'est un canari : après les lots A et B, il DOIT
s'arrêter, puisque la mesure change. Ne le « répare » pas en désarmant sa garde — lis l'écart,
explique-le, et si tu dois assouplir la garde, dis exactement quelle mesure a bougé et pourquoi.
`results.json`, `stages.json` et `diagnostic.json` datés du 2026-09-11 05:44 sont l'état
**AVANT** le chantier : ne les écrase pas, écris les tiens à côté.
