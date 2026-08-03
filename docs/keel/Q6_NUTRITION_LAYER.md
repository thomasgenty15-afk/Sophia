# Q6 — LA COUCHE NUTRITION DE KEEL

*Tous les chiffres ci-dessous viennent d'exécutions réelles contre `supabase/functions/_shared/keel/evaluator.ts` et de lectures du code, pas de raisonnements.*

---

## 1. RÉPONSES COURTES

> Q1 et Q2 me sont arrivées intactes. **Q3-Q5 étaient tronquées dans mon brief** — je ne les invente pas. Je les remplace par les trois verdicts du même chemin que j'ai vérifiés moi-même, et ce sont eux qui commandent Q6.

| Question | Verdict | La phrase qui compte | Fichier |
|---|---|---|---|
| **Q1.** Un système relie-t-il une photo au plan ? | **OUI** | La sélection vient du modèle, la **décision de lier** est du TypeScript pur : 4 sorties (`explicit`/`unique`/`ambiguous`/`none`), et `ambiguous` ne lie **rien**. La parole de l'élève écrase toujours l'IA. | `_shared/keel/meal_analysis.ts:743-761` |
| **Q2.** Faut-il un 2e appel IA par photo ? | **NON** | Un seul appel vision par photo (`generateWithVision`, `temperature:0.1`), ~0,011 $. Les deux autres fichiers du chemin ne contiennent aucun client modèle. | `analyze-meal-photo-v1/index.ts:331-343` |
| **Q3'.** L'accusé de réception photo dit-il la vérité ? | **NON — bug bloquant** | `renderMealPhotoAck` émet « That looks consistent with X » pour **chaque** verdict, et sa signature `MealPhotoAckArgs` **ne contient pas le binding** : elle ne peut structurellement pas savoir que rien n'a été crédité. Assiette complète ⇒ 3 lignes évidenciées ⇒ `ambiguous` ⇒ **zéro crédit, message qui annonce trois lignes conformes.** | `meal_analysis.ts:840-845` + `:862-892` |
| **Q4'.** Une photo crédite-t-elle une ligne par son contenu ? | **NON** | La vision produit `food_groups_present` (vocabulaire fermé, dédupliqué) et l'insertion écrit `food_group_ref: null` en dur. Une photo de baies ne peut pas créditer « baies 1 portion/jour ». | `meal-photo-upload-v1/index.ts:399-402` |
| **Q5'.** `evidence_required` (« photo obligatoire sur cette ligne ») marche-t-il ? | **NON — levier mort** | Lu dans le snapshot, typé dans `EvaluatorCommitment`, **aucune branche de l'évaluateur ne le consomme**. Un coach qui l'active n'obtient rien. | `evaluator.ts:153`, `evaluate-adherence-v1/snapshot.ts:170` |

Trois autres défauts confirmés en passant, tous non-nutritionnels et tous plus graves que Q6 :
- **Aliasing de slot** : `matchEvent` (`evaluator.ts:413-478`) ne compare **jamais** `event.slotKey` à `commitment.slotKey` — le slot n'entre que dans `timingFor` (`:576-585`). Un œuf au petit-déjeuner rend « protéine au dîner » **`met` + `off_window`**. C'est un faux `met` sur la recommandation nutritionnelle la plus courante du monde.
- **Reset d'adhérence à la republication** : `plan-publish-v1/ports.ts:140-148` réinsère des `plan_commitments` neufs (ids neufs), et `evaluate-adherence-v1/index.ts:349` fait `if (!meta) continue`. Mesuré : un coach qui ajuste son plan jeudi voit son élève passer de **43 % à 0 % ou 100 %** — pendant que la couverture reste à 7/7, parce qu'elle compte des `protocol_events`, qui eux survivent.
- **`distinct_days` est calculé et jamais lu** (`evaluator.ts:832`) : « légumineuses 3×/semaine » est satisfait par 3 portions le même jour, parce que `observedValue` est une **somme** (`:823-825`).

---

## 2. Q6 — LA RÉPONSE

### 2.1 L'unité d'observation : la portion d'un groupe alimentaire, **déclarée**

Jamais un gramme, jamais une calorie. Deux instruments, pas trois :

- `measure='presence'` ou `'composition'` → binaire. C'est la **méthode de l'assiette**. Un fait sans nombre y renvoie `met` (`evaluator.ts:518-524`).
- `measure='serving'`, `unit='serving'`, cible entière petite (1, 2, 3) → comptage. Un fait sans nombre y renvoie **`partial`, jamais `met`, jamais `missed`** (`:525`). C'est exactement l'honnêteté qu'on veut : *quelque chose a été rapporté, le niveau n'est pas connu.*

Pourquoi celle-là, preuve terrain : la méthode de l'assiette bat le comptage en grammes sur le seul RCT clinique disponible (HbA1c **−0,83 %** vs **−0,63 %**, 150 adultes DT2, 6 mois) et reste efficace chez les patients à faible numératie — le comptage, non. La checklist simplifiée obtient **97 % d'adhérence médiane, 2-5 min/jour contre ~34 min**, pour une perte de poids non différente (−5,7 % vs −4,0 %, ns). On n'achète pas un meilleur résultat, **on achète un coût d'adhérence effondré**. C'est le seul levier sur lequel la littérature est franche.

Et une contrainte dure vérifiée dans **votre** code : `measure IN ('energy','protein','carb','fat','fiber','sodium')` est **inatteignable par le matcher**. Probe réel — ligne « fibres ≥ 30 g/jour », élève qui logue lentilles + avoine : **`missed`, `matched=0`**. `matchEvent` n'a que 4 branches (liage explicite, `substance_ref`, `avoid+substance_ref`, `food_group_ref`) ; `gradeAgainstTarget` n'est même pas appelé. Une ligne « fibres » n'est atteignable que si l'élève **tape un nombre de grammes** — ce que le produit refuse et que NON-INPUT #4 interdit de dériver d'une photo. Laissée ouverte, cette ligne revient `missed` **tous les jours, à vie**, pour un élève qui mange parfaitement.

### 2.2 Comment une recommandation globale devient suivable

L'écran d'import force un **choix ternaire**, une fois, par un humain :

1. **Chiffrable en portions ⇒ commitment.** « 2 portions de légumes/jour » : `polarity='do'`, `activity_class='nutrition'`, `grain='day'`, `anchor_kind='slot'`+`slot_key='any_meal'`, **`slot_kind='opportunistic'`**, `measure='serving'`, `food_group_ref='non_starchy_veg'`, `'>='` 2, `autonomy='swap_within_policy'`. Le `opportunistic` est le token central : probe réel, rien logué, jour fermé ⇒ **`coverage_deficit`, pas `missed`**. C'est ce seul token qui sépare « je n'ai pas d'info » de « tu as échoué ».
2. **Non chiffrable ⇒ `plan_guidance`**, la prose verbatim du coach, citable, avec son `source_span`, **jamais notée, hors dénominateur, hors couverture**.
3. **Ambigu ⇒ le coach tranche** dans la file qui existe déjà (`PlanImportPage.tsx:615-621` sépare `toVerify`/`toComplete`).

**Plafond dur : une recommandation ne produit jamais plus de 2 lignes notées.** Raison mesurée : décomposer « plus de fibres » en 3 lignes `food_group` donne, pour un élève qui mange *littéralement* plus de fibres (lentilles + avoine), **`partial`/`partial`/`met` = 66 % d'adhérence**. La décomposition transforme une intention facile en trois dénominateurs plus durs que l'intention. Le reste part en guidance.

### 2.3 D'où viennent les plats — et pourquoi l'IA ne rédige toujours rien

Table `meal_ideas` avec **`author_kind text not null check (author_kind in ('coach','keel_library'))`**. Il n'y a pas de troisième valeur : **l'IA ne peut pas être auteur**, ce n'est pas une règle de discipline, c'est une contrainte.

Les degrés de liberté de l'IA sont exactement trois : *quel `meal_idea_id`, quel jour, quel slot*. Le filtre est déterministe et vient du coach : `plan_guidance.emphasize_food_groups` ∩ `meal_ideas.food_group_refs`, moins `student_safety_constraints`, moins les allergènes. La justification est écrite (`guidance_ids uuid[]`) : on peut demander « pourquoi ce plat ? » et obtenir **la phrase du coach**, pas une rationalisation. Si l'IA hallucine un plat, elle hallucine un uuid, et l'allowlist le rejette exactement comme `parseMealAnalysis` rejette aujourd'hui un `commitment_id` hors plan (`meal_analysis.ts:611-644`, `rejected_commitment_ids`).

Ce mécanisme existe déjà un cran plus bas et il est accepté : `autonomy='swap_within_policy'` laisse déjà un non-coach substituer un aliment par un autre, borné par une politique écrite par le coach (`matchFoodGroup`, `evaluator.ts:379-402`). **Composer dans un ensemble approuvé n'est pas rédiger.** Ce qu'on refuse, c'est le « plan augmenté » de votre formulation : l'IA qui génère des plats **et** les place **et** en fait des lignes notées. Ici le plan n'est pas augmenté ; c'est le **vocabulaire d'aide** qui l'est.

### 2.4 Ce qui est noté, ce qui ne l'est pas, et le mur

**Noté :** uniquement les `plan_commitments` avec `counts_toward_adherence=true`, pondérés par `priority`. Point.

**Le mur n'est pas une convention, il est référentiel :**
```sql
commitment_id uuid not null references public.plan_commitments(id) on delete cascade
```
`supabase/migrations/20260727090000_keel_p0_commitments.sql:468`. Un `meal_ideas.id` **ne peut pas satisfaire cette FK**. `adherence.ts` ne lit que des `AdherenceEvaluation`, qui ne peuvent naître que d'une ligne `commitment_evaluations`. On ne se demande pas si l'échafaudage contamine l'adhérence : **la ligne est physiquement impossible à écrire.**

Deux ceintures par-dessus, toutes deux sur un patron déjà en production dans le dépôt :
- **CI** : `scripts/ci/token-lint.mjs` assertion 4 (l.296-310) interdit déjà à tout fichier `*evaluat*` d'importer ou même de **mentionner** `commitment_relations`. On ajoute les trois nouveaux noms de tables à la même regex, plus le test de falsifiabilité : *supprimer toute la couche 2 laisse les résultats de l'évaluateur byte-identiques.*
- **Couverture** : l'échafaudage n'écrit **aucun** `protocol_event`. Sinon il lève tout seul la porte d'affichage — `LOGGED_DAY_MIN_EVENTS = 2` (`adherence.ts:55`, lu l.247) : 2 lignes/jour sur 4 jours suffisent à faire passer le coach de « données insuffisantes » à un pourcentage. C'est irréversible une fois relâché : c'est la décision doctrinale la plus importante du lot.

### 2.5 La photo : corroboration, jamais l'unité — et **non**, pas à chaque repas

La réponse est tranchée par la donnée :

- **2SMART** (RCT, n=41, 6 mois) : la fréquence de tracking corrèle à la perte de poids dans le bras calories (**r=0,70 ; p=0,004**) et **pas** dans le bras photo (r=0,51 ; p=0,06). **Attrition 39 % (photo) vs 20 % (app).** Une autre étude : **18 % d'adhérence** à la documentation photo.
- **Défaut structurel imparable** : on ne peut pas photographier un repas déjà mangé. Une photo oubliée devient un trou ; les trous deviennent `unknown` ; sous 4/7 le coach ne voit plus **rien** (`insufficient_data`). Photo obligatoire = cassage de la lecture du coach, c'est-à-dire du produit.
- **Le modèle sait identifier, pas quantifier** : 89,8 % de justesse d'identification, mais **42-110 % d'erreur sur les macros**. Donc : présence et groupe alimentaire = recevables ; grammes et kcal = non.
- **Risque TCA** : le consensus international (n=87 cliniciens, chercheurs et personnes concernées) classe le monitoring type comptage et la prescription rigide parmi les stratégies qui **augmentent** le risque, la flexibilité parmi celles qui le diminuent. Photo à chaque repas = monitoring maximal.
- **Coût** : 3 photos/jour = 0,033 $/jour = **1 $/mois = 8 % du prix par élève actif**. Pour la friction la plus élevée du produit.

**Son rôle exact :** la photo **élève la qualité de la preuve** (`EVIDENCE_RANK` photo=5 vs quick_tap=2, `evidence_weight` 1,0 vs 0,4) et elle ne peut jamais produire un `met` sur une cible chiffrée — seulement un `partial`, parce qu'elle ne porte pas de nombre. **Elle confirme un engagement déclaré, elle ne le remplace pas.** Le geste primaire reste le tap : 2 secondes, `recognized.commitment_id` posé côté client (`keelClient.ts:250-278`), idempotent.

Et il faut le dire net : **aujourd'hui la photo est le pire des deux mondes** — geste coûteux, crédit nul (Q4'), message qui prétend le contraire (Q3'). Tant que ces deux-là ne sont pas corrigés, toute demande de photo est une dette.

### 2.6 Déroulé complet

**Le coach écrit 4 lignes** (import du PDF, 6 min, chaque ligne avec sa citation) :
1. `légumes ≥ 2 portions/jour` — `serving`, `non_starchy_veg`, `opportunistic`, `flexible`, `priority='core'`
2. `protéine à chaque repas` — **1 ligne** `grain='day'`, `slot_key='any_meal'`, `lean_protein`, `'>='` 3, `expected_occasions_per_day=3`
3. `pas de sucre ajouté le soir` — `polarity='avoid'`, `sugar_sweets`, `slot='dinner'`
4. `petit-déjeuner : composition complète` — `measure='composition'`, `evidence_kind='photo'`, seule ligne à preuve photo

+ une `plan_guidance` : « privilégie les fibres, surtout le matin » — visible, citée, **jamais notée**.

**Lundi matin, l'élève voit** : 4 lignes en langage de comportement, un pictogramme de poing/paume, **zéro calorie** (`calorie_readout` est déjà dans `SUPPRESSED_STUDENT_SURFACES`, `restriction_guard.ts:92`). En tête : la phrase de son coach, sans badge, sans case. Aucune surface « repas » tant qu'il ne l'a pas allumée.

**Ce qu'il fait** : 08h10 photo du petit-déj (une seule de la journée, celle que le coach a demandée) ⇒ binding `unique` ⇒ `composition` = `met`. 12h40 deux taps (légumes, protéine). 19h30 un tap protéine. Rien d'autre. **Coût total : 4 gestes, ~15 secondes.**

**Ce qui est noté lundi soir** : légumes `partial` (1/2), protéine `met` (3 occasions résolues), sucre du soir `met` (défaut inverse : silence ⇒ `met` sur `avoid`, `evaluator.ts:900-906`), petit-déj `met`+`on_time`. **Adhérence 3,5/4. La guidance et les plats n'apparaissent nulle part.**

**Lundi suivant, le coach voit** : couverture 6/7 (au-dessus du gate ⇒ un pourcentage s'affiche), la ligne la plus en échec = légumes, les déviations déclarées à l'avance sorties du dénominateur, et — dans un bloc **séparé, sans pourcentage** — « 4 idées de plats prises, 3 suivies d'un fait le même jour ». C'est de la curiosité opérationnelle : ça lui dit si sa guidance produit du comportement. Sa réponse n'est plus « je réécris le plan », c'est « j'ajoute un plat déjeuner riche en légumes » — 90 secondes, tous ses élèves.

---

## 3. LE DELTA

### A. Blockers — à faire **avant** toute nutrition (≈ 3 jours)

| # | Quoi | Où | Jours |
|---|---|---|---|
| B1 | Passer `binding` dans `MealPhotoAckArgs` ; l'accusé se tait sur les lignes non liées | `meal_analysis.ts:840-892` | 0,5 |
| B2 | Filtrer par slot dans `matchEvent` quand `grain='occasion'` **et** `slot_kind='nominal'` (ne pas filtrer autrement : ça casserait le `met`+`off_window` de R6) | `evaluator.ts:413-478` | 0,5 |
| B3 | Survie des évaluations à une republication : mapper ancien→nouvel id par **`template_commitment_key`** (la colonne existe déjà, migration `:200`) au lieu de `if (!meta) continue` | `evaluate-adherence-v1/index.ts:349` | 1,5 |
| B4 | Plafonds forcés en `polarity='avoid'` à l'import (sinon `do`+`<=` sans fait ⇒ `missed` : un élève qui n'a mangé aucun sucre est noté en échec) | `plan-import-v1` | 0,5 |

### B. Irréversible — à décider maintenant (≈ 1 jour de code)

1. **L'unité d'observation est la portion/présence.** Interdire `measure IN ('energy','protein','carb','fat','fiber','sodium')` quand `activity_class='nutrition'` : à l'import **et** par un CHECK. Irréversible parce qu'un plan publié avec une ligne « 30 g de fibres » produit un `missed` par jour et par élève, et qu'on ne réécrit pas un historique.
2. **L'échafaudage n'écrit jamais dans `protocol_events`.** Une assertion CI, zéro ligne de runtime. Irréversible : une fois qu'un « j'ai cuisiné le plat suggéré » compte dans la couverture, le chiffre du coach ne veut plus rien dire.
3. **Le mur est la FK, pas un booléen.** Ne jamais encoder la guidance en `plan_commitments` avec `counts_toward_adherence=false` : ça produirait quand même une ligne `commitment_evaluations`, un badge, une place dans la journée, et exigerait une branche nommée d'évaluateur.

### C. Additif — peut attendre le pilote

| Quoi | Jours | Note |
|---|---|---|
| **Write-through photo→`food_group_ref`** quand **exactement un** groupe détecté figure dans le plan du jour ; sinon `null` | 1 | Zéro nouvelle table, déterministe. Rend la photo enfin utile. Une photo seule ne peut donner que `partial` sur une cible chiffrée. |
| `protocol_event_components` (N groupes par repas) | 2 | Seulement si le pilote montre que le cas mono-groupe ne suffit pas. Ce n'est **pas** « une ligne dans `matchEvent` » : ça touche `Match`, `quantityIn`, `observedValue`, `swapApplied`. |
| `plan_guidance` + `meal_ideas` + `meal_plan_suggestions` + `profiles.meal_scaffolding_opt_in boolean default false` | 3-4 | Le code est le petit poste. Le vrai coût est **éditorial** et non chiffré. |
| `'meal_suggestion'` dans `SUPPRESSED_STUDENT_SURFACES` (9 entrées aujourd'hui, aucune sur la photo ni le repas — `restriction_guard.ts:84-94`) | 0,25 | Interlock TCA déterministe. |
| Câbler `evidence_required` (aujourd'hui no-op) ou **le retirer du type** | 0,5 | Ne pas le laisser décoratif : c'est un mensonge d'interface pour le coach. |

**Total pour un pilote crédible : ~4 jours de correctifs + 1 jour de contrat nutrition.** L'échafaudage vient après, ou jamais.

---

## 4. CE QU'ON REFUSE DE CONSTRUIRE

- **Une base nutritionnelle et toute conversion portion→grammes.** Technique : `convertQuantity('g','serving')` lève (R7) et `evaluator.ts:332-343` n'a pas de try/catch par commitment — un seul plat mal converti **abat toute la semaine ISO de l'élève** (`MEGA_REVIEW.md:160`). Doctrinal : la main est un bon **langage de comptage** et un mauvais convertisseur (>50 % d'erreur sur les filets de viande). On compte des portions, on ne les convertit jamais.
- **Le comptage calorique et les macros.** NON-INPUT #4 ; 42-110 % d'erreur du modèle ; et c'est la stratégie la plus souvent jugée augmentant le risque TCA par le consensus international.
- **La génération libre de plats par l'IA.** `author_kind` a deux valeurs. L'IA sélectionne et pose ; elle n'écrit pas la prose que l'élève lira.
- **La photo à chaque repas.** 39 % d'attrition, corrélation nulle avec le résultat, 8 % du prix, et un repas déjà mangé n'est pas photographiable.
- **« 30 plantes/semaine ».** `observedValue` somme (`:823-825`), `distinct_days` est calculé et jamais lu (`:832`), et le vocabulaire réel compte **4** slugs `vegetable` + 1 `legume` + 3 `fruit` (migration `:63-93`). Un objectif de 30 espèces contre 8 slugs est innommable ; le combler demande une ontologie d'espèces, explicitement refusée. **On dit NON à l'import, bruyamment, avec le motif** — et on propose au coach une reformulation comptable qu'**il** valide. L'IA refuse plutôt qu'elle n'approxime.
- **Toute ligne notée écrite par l'IA.** C'est la thèse ; tout le reste en découle.

---

## 5. LES 5 QUESTIONS AU COACH

1. **« Plus de fibres » : tu acceptes de le convertir en 1 ou 2 lignes chiffrées en portions, ou tu veux que ça reste ta phrase — visible, citée, jamais notée ?** *(décide si `plan_guidance` existe ; décide aussi si on accepte de te dire non sur les objectifs non comptables.)*
2. **« Protéine à chaque repas » : un dénominateur par repas (3 lignes, un déjeuner raté = 1/3) ou une ligne journalière à 3 occasions (couverture partielle, pas d'échec) ?** *(décide le `slot_kind` par défaut de toute la nutrition — donc si un élève irrégulier voit des échecs ou des trous.)*
3. **Sur quelles lignes veux-tu une preuve photo, sachant qu'on plafonne à une ou deux par jour et qu'on arrête de demander après N refus ?** *(décide si on câble `evidence_required`, aujourd'hui mort, ou si on le supprime.)*
4. **Tes plats : tu les écris toi — bibliothèque à toi, signée une fois, réutilisée sur tous tes élèves — ou tu veux un catalogue KEEL que tu filtres ?** *(décide le seul poste de coût que personne n'a chiffré : le contenu éditorial. Si la réponse est « le catalogue », la couche 2 est un problème de contenu déguisé en problème de schéma.)*
5. **Quand tu ajustes le plan un jeudi : la semaine en cours doit être recalculée sur le nouveau plan, ou lundi-mercredi restent notés sur l'ancien ?** *(irréversible pour l'historique — et aujourd'hui la réponse du code est « ni l'un ni l'autre » : ton élève passe de 43 % à 0 % ou 100 %.)*

---

**En une phrase :** le coach écrit **ce qui compte** en portions, l'échafaudage aide à y arriver, et rien de l'échafaudage n'atteint le compteur — non par politesse, mais parce que `commitment_evaluations.commitment_id` ne peut référencer que `plan_commitments`.