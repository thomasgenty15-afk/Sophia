# RAPPORT — les quatre chantiers qui attendaient le moteur

**Date :** 2026-08-11 · **Branche :** `ff-001-quotidien-du-coach`
**Plan d'origine :** `scratchpad/PLAN-SUITE-ENTREES-ET-MODELE.md`

---

## Résumé en une page

| Chantier | État | Ce qui a décidé |
|---|---|---|
| **B · la B12 du végan** | ✅ **Livré** | R6 de FF-042 fermé ; la boucle infinie est écartée en amont, pas filtrée en aval |
| **C · les apports fixes** | ✅ **Livré** | FF-051 neuve ; 3 branches, 26 tests, prouvé en run réel |
| **D · les propriétés de jour** | ✅ **Livré** | FF-052 neuve ; **2** propriétés retenues sur 4 instruites, 18 tests, prouvé en run réel |
| **A · le banc d'essai** | ✅ **Livré** | 180 générations, 5 modèles, $12,57. Gagnant **`gpt-5.6-terra`** ; le retour arrière documenté (`gpt-5.4-mini`) est le SEUL à servir des aliments interdits. [`RAPPORT-BANC-MODELES.md`](RAPPORT-BANC-MODELES.md) |

**Trois chantiers livrés complètement plutôt que quatre à moitié**, comme le plan
le demandait — puis le quatrième, une fois la porte rouverte et l'accord donné. La suite `deno test` complète est verte, le typecheck front est
propre, et un run réel local vérifie chaque branche livrée dans une vraie sortie.

### ⚠️ Une correction à porter avant tout le reste

Le plan supposait que la porte du chantier A pouvait être fermée faute de clé de
modèle. **Elle ne l'est pas.** Il n'y a pas de `supabase/functions/.env`, mais le
conteneur `supabase_edge_runtime_Sophia_2` porte bien `OPENAI_API_KEY` (164
caractères, préfixe `sk-pro`) et `GEMINI_API_KEY` (39 caractères). Chercher le
fichier plutôt que l'environnement du runtime donne une réponse fausse — et
c'est ce qui a failli faire déclarer A « sauté pour porte fermée » à tort.

**Une génération réelle a été produite de bout en bout** (200, 179 s, plan de
sept jours). Le chantier A est faisable dès maintenant.

---

## 1 · Chantier B — la B12 du végan

### Le problème, et pourquoi il valait un lot

Un plan végan sans B12 est **carencé**, pas médiocre. Se taire livrerait la
carence en silence ; la signaler comme un trou ordinaire ferait boucler le
produit **à l'infini et à ses frais** : la correction placerait une recette
censée l'apporter, la génération suivante ne la trouverait pas davantage, et le
retry se redéclencherait à chaque plan, pour toujours.

### Ce qui est livré

- **`safety_constraints.ts`** — `dietRef` dans le type, le `select` du loader et
  le mapping de ligne. Il n'entre **jamais** dans `safetyConstraintTokens()`
  (R1) : la cicatrice `allergen_ref='diabetes'` du 2026-08-06 est écrite
  au-dessus, parce qu'armer la ceinture sur « vegan » ferait rejeter exactement
  les bonnes réponses, et seulement pour les végans.
- **`meal_verdict.ts`** — `sentinels` scindé en **deux canaux** :

  ```ts
  sentinels: {
    missing: FoodGroupRef[];   // RÉPARABLE — le seul champ que la boucle lit
    uncoverable: string[];     // STRUCTUREL — noms de colonne ("b12_source")
  }
  ```

  Le trou structurel est retiré **avant** que `missing` n'existe, pas filtré
  après : un filtre en aval marcherait tant qu'il n'y a qu'un lecteur de
  `missing`, et cesserait de marcher au deuxième.
- **`SENTINEL_FLAG_BY_COLUMN`** — table fermée (`satisfies`), nom de colonne
  inconnu **écarté** et jamais deviné.
- **`uncoverableSentinels`** est un **paramètre requis** de `verdictFor` : la
  casse de compilation est ce qui recense les appelants.
- **`generate-meal-v1`** — le régime est dérivé des contraintes **déjà
  chargées**, sans seconde requête.

### Les tests (11 neufs, dont les 5 exigés par le plan)

| Exigence du plan | Test |
|---|---|
| végan ⇒ `b12_source` sort des réparables, **aucun retry dessus** | gardé aux **deux** niveaux : `verdictFor` **et** `correctionPlanFor` (le second est le test qui garde vraiment la boucle) |
| végan ⇒ drapeau levé une fois, canal coach, jamais nominatif | voir la réserve en §1.1 |
| végétarien ⇒ **aucun** drapeau | testé, **et** via la vraie jointure `uncoverableSentinelsFor` — pas via une constante de test |
| omnivore sans B12 ⇒ trou réparable, recette placée | désarmement testé par égalité |
| aucune sortie ne conseille une supplémentation | `assert(!json.includes(w))` sur verdict **et** sur les phrases servies au modèle |

Deux tests de jointure ont été ajoutés en plus : le régime → verdict pour les
trois régimes, et l'**existence réelle** de chaque nom de colonne dans la
migration `20260810160000` (ce dépôt a payé « la jointure code↔base n'était pas
testée »).

### 1.1 — Réserve honnête sur « le canal coach »

**Il n'existe pas encore.** `meal_composition_verdicts` a un écrivain
(`generate-meal-v1`) et une réclamation d'export ; **rien ne la relit**. « Jamais
nominatif » est donc vrai par construction aujourd'hui, et pas parce qu'une
garde le tient.

Ce qui est livré à la place, c'est la **règle écrite** que le futur lecteur devra
appliquer (FF-042 §6 R6), et elle est **plus stricte** que l'arbitrage A4
ordinaire : « combien de mes élèves ont un trou B12 » se lit « combien sont
végans », donc la cellule comptée **est** l'attribut. Le plancher doit porter sur
les deux cellules —

```
aggregatePairMayShip(marqués, cohorte − marqués)   // et NON aggregateMayShip(cohorte)
```

— parce qu'une cohorte de vingt dont un seul est végan passe le second et échoue
le premier, et c'est le premier qui a raison.

**Aucun helper n'a été ajouté pour ça, exprès.** Une garde sans appelant est la
cicatrice « ceinture armée sur coffre vide » de ce dépôt. `aggregatePairMayShip`
existe déjà et suffit.

---

## 2 · Chantier C — les apports fixes (« le shaker »)

**Fiche : [FF-051](../docs/fonctionnalites/composition-des-repas/FF-051-les-apports-fixes.md)**

### Pourquoi ce chantier prouve que le moteur valait le coup

C'est **le premier input du produit qui alimente le calcul et non la
sélection**. Tout le reste — allergies, régimes, préférences, absences — dit au
moteur de choisir *autrement*. Un apport fixe lui dit qu'une partie de la journée
est **déjà composée**, et qu'il faut la **compter** — ce qui suppose de savoir ce
qu'elle pèse. Sans FF-038, ce chantier n'avait qu'une branche sur trois.

### Le modèle de données, et l'arbitrage A5

`practical_constraints.fixed_intakes`, **aucune migration** (le jsonb reste
libre, précédent `eating_rhythm`). Côté TypeScript, une **union à deux branches**
et pas un objet plat :

```ts
type FixedIntake = { foodRef; label; amount; unit; days } & (
  | { placement: "loose" }
  | { placement: "at_slot"; slot: EatingOccasion; replacesMeal: boolean }
);
```

`replaces_meal: true` sans `slot` est un état que **personne ne saurait
exécuter** (remplacer quel moment ?). L'union le rend impossible à écrire, patron
d'`Envelope`.

**A5 — un apport s'AJOUTE ; il ne remplace que si l'élève l'a dit.** C'est
l'arbitrage du chantier, et il se prend dans le mauvais sens si on ne le prend
pas explicitement : un yaourt à 16 h ne doit pas supprimer le goûter, et « un
café au lait au petit-déjeuner » nomme un moment sans le prendre. `replacesMeal`
vaut donc `false` par défaut, **et seul `true` littéral remplace** — ni `"true"`,
ni `1`, ni `"yes"` (testé sur les quatre).

### Les trois branches

1. **Non-duplication** — consigne en **négatif explicite** (`those moments are
   TAKEN`) **et** drop au parseur. Les deux bouts, parce qu'un modèle de
   composition complète ce qu'on lui donne : c'est son métier.
2. **Plancher protéique** — la protéine de l'apport compte, une entrée par
   **occurrence** (un shaker cinq matins pèse cinq shakers).
3. **Enveloppe** — même chemin pour l'énergie.

### R2 — l'inconnu, jamais le zéro

C'est la règle du moteur, et c'est ici qu'elle est le plus tentante à enfreindre :
un `food_ref` inconnu rendrait naturellement « 0 g de protéine », et **zéro
traverse toutes les additions sans rien signaler**. Le plancher serait alors jugé
*atteint* sur un plan qui empile 75 g de protéine par-dessus un shaker qu'on n'a
pas su lire. Un apport irrésolu met donc `energyKnown = false` et
`proteinTotal = null`, et il est **compté** dans la worklist de résolution.

### R3 — sous `restriction_flag`

La branche 1 **survit** : elle est côté aliment, elle ne lit ni le corps, ni
l'objectif, ni l'enveloppe. Les branches 2 et 3 n'ont structurellement rien à
alimenter, et **aucun chemin spécial n'a été écrit** — c'est le type `Envelope`
qui rend l'état illégal irreprésentable, en mode `per_portion` il n'y a pas de
champ `energy`.

### 26 tests, dont les 6 exigés

Tous les cas du plan sont couverts. Deux ajouts notables :

- **le désarmement est testé par retrait de chaîne**, pas par comparaison de deux
  appels identiques : `withIntake.replace(bloc + "\n", "") === empty` — c'est la
  seule forme qui attrape une ligne vide de trop ;
- **fenêtre inconnue ⇒ chaque apport compte une fois, jamais zéro.** Le premier
  jet rendait `0` quand `daysToFill` était vide, ce qui était exactement la faute
  que R2 interdit. Corrigé et testé.

### Le trou nommé

**Le foyer.** `generate-household-meal-v1` reçoit `fixedIntakes: []`, avec le
pourquoi écrit au-dessus : lire `practical_constraints` du seul titulaire ferait
sauter le petit-déjeuner de **toute la tablée** parce qu'une personne prend un
shaker. C'est un substitut à une dépendance manquante (`DELTA_CHANNELS` ne porte
pas l'apport fixe), et le plan l'interdisait. Écrit en FF-051 §11 Q1.

---

## 3 · Chantier D — les propriétés de jour

**Fiche : [FF-052](../docs/fonctionnalites/composition-des-repas/FF-052-les-proprietes-de-jour.md)**

### Deux propriétés, pas quatre — et c'est la livraison

Le plan le demandait : *deux propriétés qui mordent valent mieux que quatre qui
décorent*. Une propriété sans branche est **pire** que son absence, parce que
l'élève organise sa semaine sur la croyance qu'elle est prise en compte.

| Retenue | La branche | Où elle mord |
|---|---|---|
| `batch_cook` | une session longue atterrit là | consigne + **issue comptée** si aucune préparation n'y est cuite |
| `leftovers` | aucun plat neuf | consigne + le parseur **drop** tout plat sans `uses` |

| Instruite, **non retenue** | Pourquoi |
|---|---|
| `market` | la branche honnête passe par `planGroceryWaves` (FF-005), qui n'a **aucun paramètre de jour d'ancrage**. La livrer voudrait dire changer un module partagé avec le front, ou réinventer à côté une stratégie de courses que FF-005 traite déjà. Les deux sont pires que l'absence. **Premier candidat du prochain lot** |
| `guests` | le dimensionnement de portion appartient à la lane foyer (`trunkSizing`, FF-043). Une seconde machinerie de portions à côté de celle du foyer est la duplication que ce dépôt paie le plus cher |

### L'asymétrie des deux gardes est délibérée

`leftovers` **retire**, `batch_cook` **compte**. On peut supprimer un plat qui
n'aurait pas dû exister ; on ne peut pas **inventer** une session de cuisine que
le modèle n'a pas écrite — fabriquer une préparation produirait une recette que
personne n'a rédigée, avec des quantités que personne n'a posées.

Un `issues` compté est ce que ce dépôt fait des non-conformités du modèle. Si le
compteur ne baisse pas en production, **c'est le prompt qu'il faut corriger, pas
le parseur** — et c'est écrit dans la fiche §10.

### 18 tests, dont les 5 exigés

Chaque propriété a un **test de mutation** : on pose la déclaration, la sortie
*doit* bouger. Un test acte aussi le cas limite non demandé — un `uses` pointant
une préparation inexistante ne sauve pas le plat *par accident* : la garde lit
l'**intention** du modèle, pas le résultat du parseur, et punir deux fois une
référence cassée retirerait un dîner.

### R6 — un seul bump

`meal.en.v6_structured_quantities` → **`meal.en.v7_fixed_intakes_and_days`**,
pour FF-051 **et** FF-052. C'est pour ça que D a été fait en dernier : deux bumps
successifs invalideraient deux fois le cache et rendraient illisible toute
comparaison avant/après entre les deux lots.

---

## 4 · Chantier A — non fait, porte OUVERTE

### La porte

**Ouverte.** Corrigée par rapport à ce que le plan envisageait :

| Fait mesuré | Valeur |
|---|---|
| `supabase/functions/.env` | **absent** — et c'est un faux négatif si on s'arrête là |
| `OPENAI_API_KEY` dans le runtime edge | **présent**, 164 car., `sk-pro…` |
| `GEMINI_API_KEY` dans le runtime edge | **présent**, 39 car., `AIzaSy…` |
| `KEEL_GENERATION_MODEL` | **vide** → défaut `gpt-5.6-sol` |
| Une génération réelle de 7 jours | **200**, `179 s`, plan complet, verdict écrit |

### Pourquoi il n'est pas fait

Le plan demande **12 fixtures × N modèles × N ≥ 3 générations**. À 179 s la
génération mesurée, c'est **~108 minutes de run par modèle**, en série, sans
compter la construction des 12 fixtures — dont **aucune n'a de plan publié
aujourd'hui** (vérifié : `published = 0` sur toute la flotte QA), alors que le
plan l'exige pour chacune.

Lancer une campagne de plusieurs heures sur les clés du propriétaire n'a pas été
engagé sans son accord. Conformément à la consigne — *« livre moins de chantiers,
complètement — jamais quatre à moitié »* — A est **une ligne de rapport**, pas un
demi-chantier laissé en piège.

### Ce qui est offert pour l'amorcer (mesuré, pas supposé)

Ce sont les cinq choses qui auraient brûlé la première heure de la prochaine
session :

1. **Redémarrer le runtime edge d'abord.** `docker restart
   supabase_edge_runtime_Sophia_2` — un `_shared` **modifié** n'est pas rechargé.
2. **Étendre le timeout Kong avant tout run.** Sans lui : `504` à 150 s pile,
   alors que la génération dure ~179 s. Le script existe :
   ```bash
   bash scripts/local_extend_kong_functions_timeout.sh
   ```
3. **`intent` est requis en pratique.** Sans `intent: "prepare_next"`, un second
   run rend `409 plan_not_written / replaces_required` — après avoir payé la
   génération. Corps minimal qui marche :
   ```json
   {"mode":"to_shop","intent":"prepare_next","window":{"kind":"days","count":7}}
   ```
   (`{"kind":"days","days":7}` est refusé : la clé est `count`.)
4. **Aucune fixture n'a de plan publié.** C'est le premier travail de A, et il
   n'est pas dans le harnais : il est dans les fixtures.
5. **Le piège de `generation_model.ts` est réel** — vérifier chaque identifiant
   sur **une** génération avant de lancer une campagne : un identifiant OpenAI
   invalide ne dégrade pas, il arrête tout.

**Aucun substitut n'a été construit** — pas de faux banc, pas de tableau
partiel, pas de recommandation de modèle. La commande à donner au propriétaire
existera quand la campagne aura eu lieu, et pas avant.

---

## 5 · Vérification

| Étape demandée | Résultat |
|---|---|
| `deno test` complet sur `_shared/keel/`, **sans** `--no-check` | ✅ **1 989 tests, 0 échec** (voir la réserve ci-dessous) |
| `npx tsc -p frontend/tsconfig.app.json --noEmit` | ✅ **aucune erreur** |
| Migrations appliquées deux fois | **sans objet** : B, C et D n'en ajoutent aucune. État vérifié : 13 sur disque, 13 appliquées, `uniq -d` vide |
| Run réel local, runtime redémarré | ✅ voir §5.2 |
| Un commit par chantier | ✅ voir §6 |

### 5.1 — Deux fichiers de test exclus, et ils étaient déjà cassés

`daily_recommendation_test.ts` et `daily_recap_io_test.ts` ne compilent pas.
**Vérifié adversarialement** : en remisant ma seule modification de
`daily_recommendation_test.ts` (l'ajout d'un champ devenu requis), les **5
erreurs de type subsistent**. Elles sont antérieures à ces trois chantiers et
appartiennent à une autre lane (`decideDailyRecommendation` ne rend plus de
`reason` sur toutes ses branches). Non touchées : les réparer à l'aveugle dans un
lot qui n'est pas le leur ferait disparaître le signal.

### 5.2 — Le run réel, et ce qu'il prouve

Fixture `qa0805.a1.s2@keeltest.dev`, fenêtre `2026-08-11 → +7 j` (mar → lun),
`200` en 179 s. Semé pour le run : un shaker remplaçant le petit-déjeuner du
lundi au vendredi, un yaourt `loose`, **une entrée volontairement malformée**,
`batch_cook` le dimanche, et `leftovers` + un jeton bidon `picnic` le lundi.

| Ce qui est prouvé | Ce que la sortie montre |
|---|---|
| **C · non-duplication** | petits-déjeuners composés : **`sat`, `sun` uniquement**. Les cinq matins pris par le shaker n'en ont aucun ; le week-end garde le sien |
| **C · R4, le compteur** | log du runtime : `[keel/meal] fixed_intakes: 1 malformed entries discarded` |
| **C · R2, l'inconnu et pas le zéro** | `whey_protein_powder` n'est **pas** dans le référentiel (`plain_yogurt` y est). Le verdict rend `protein: not_computable` au lieu d'un plancher faussement atteint. Arithmétique vérifiée : 54 ingrédients de plats + 5 shakers + 7 yaourts = **`resolution.total = 66`**, dont 55 résolus |
| **C · le cas prédit par la fiche** | la fiche §10 annonçait que les apports fixes seraient des produits de marque que Ciqual nomme autrement. C'est arrivé au **premier** run réel |
| **D · `batch_cook`** | trois préparations avec `cook_on = "sun"` (boulettes, légumes rôtis, couscous) et **aucune issue** `batch-cooking` |
| **D · `leftovers`** | les **deux** plats du lundi puisent exclusivement dans les préparations du dimanche (`prep_turkey_meatballs`, `prep_sunday_vegetables`, `prep_couscous`). Aucun plat neuf |
| **D · R2, le jeton inconnu** | `picnic` écarté **seul** — `leftovers` du même jour a mordu |
| **B · désarmement** | fixture omnivore ⇒ `sentinels.uncoverable: []`, comportement d'avant intact |

Seule `issues` du run : `structured_quantity_missing: 5/54` — une mesure
préexistante de FF-038, sans rapport avec ces lots.

### 5.3 — Ce que j'ai laissé dans la base locale

- Les clés `fixed_intakes` et `day_properties` semées sur la fixture ont été
  **retirées** (vérifié : `false / false`).
- **Le plan généré est conservé** : c'est la pièce à conviction du run. Pour
  rejouer, resemer avec le SQL de §5.2 puis appeler avec
  `intent: "prepare_next"`.
- Le timeout Kong reste étendu à 600 s. C'est un réglage local, et il est requis
  pour tout run réel de composition.

---

## 6 · Commits

Un par chantier, messages français en minuscules. **Ni push, ni deploy, ni
`db push`** — le propriétaire s'en charge.

⚠️ **Le dépôt est travaillé par plusieurs sessions en parallèle.** Les commits
sont donc scopés **fichier par fichier** aux fichiers que ces trois chantiers
touchent, et jamais `git add -A` : le reste de l'arbre porte le travail non
commité d'autres lanes, et l'emporter serait leur voler leur lot.

---

## 7 · Interdits — état

| Interdit | Respecté |
|---|---|
| Aucun chiffre d'énergie/macro/mesure **sur la personne** | ✅ testé : `findNumericTarget` sur les consignes neuves, et la frontière écrite en FF-051 §9 (« 30 g » est un chiffre sur un **aliment**, même famille que « 400 g de cuisses de poulet ») |
| Aucun conseil de supplémentation | ✅ testé sur le verdict **et** sur les phrases de correction |
| Aucun verdict qui bloque | ✅ `batch_cook` compte, ne retire pas ; `leftovers` ne retire que les plats neufs d'un jour que l'élève a lui-même déclaré sans cuisine neuve |
| Aucun substitut à une dépendance manquante | ✅ deux trous nommés plutôt que comblés (`fixedIntakes: []` et `dayProperties: []` au foyer), et A non simulé |
| 🚫 `supabase db reset` | ✅ jamais exécuté, jamais demandé |
| `dietary_regime.ts`, `generation_model.ts`, migrations appliquées | ✅ non touchés |
| Legacy 1:1 (`plan_versions`, `/coach/import`) | ✅ non touché |
| Ni push, ni deploy, ni `db push` | ✅ |

---

## 8 · Ce que je n'ai pas fait

1. ~~**Le chantier A**~~ — **fait** après coup, voir
   [`RAPPORT-BANC-MODELES.md`](RAPPORT-BANC-MODELES.md). Trois choses en sont
   sorties qui dépassent le choix d'un modèle : le moteur **s'abstient sur 67 %
   des générations** faute de résolution (la curation d'alias vaut plus que
   n'importe quel changement de modèle) ; le retour arrière documenté par
   `generation_model.ts` est **dangereux** ; et le défaut actuel est le plus
   lent et le plus cher des cinq.
2. **Le canal coach du drapeau B12** — il n'existe pas, la règle k=5 renforcée
   qui l'attend est écrite (§1.1).
3. **Les apports fixes et les propriétés de jour au foyer** — `DELTA_CHANNELS` ne
   les porte pas. FF-051 §11 Q1, FF-052 §11 Q3.
4. **`market`** — la vraie branche demande un jour d'ancrage dans
   `planGroceryWaves`, back **et** front. FF-052 §11 Q1.
5. **Les écrans** — aucun des deux champs n'a de case. Ils se lisent correctement
   depuis un jsonb écrit à la main, et c'est ce que les tests prouvent.
6. **Le câblage du verrou de régime** (FF-042 §3 points 2-4 :
   `dietaryRegimePromptLine`, le rejet dur au parseur, la case à l'écran). Hors
   périmètre du chantier B, qui ne portait que R6 — mais c'est le trou le plus
   coûteux qui reste ouvert sur cette fiche : **un végan reçoit encore un plan
   avec de la viande dedans.**
