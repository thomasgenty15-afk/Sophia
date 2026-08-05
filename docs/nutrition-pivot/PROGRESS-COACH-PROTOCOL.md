# Journal — le protocole du coach

Branche `dewhatsapp`. Prompt: `PROMPT-COACH-PROTOCOL.md`.

---

## 2026-08-05 01:32Z — Arrivée: la condition d'entrée n'était pas remplie

Le prompt pose sa propre porte: *« si un autre agent travaille, ne commence
pas »*. Elle était fermée.

Mesuré, pas supposé: une session Claude (PID 37077, `--permission-mode auto`)
avait committé `8b368368` à 01:33:49 et `9bfa8a55` à 01:34:45 — **après** le
début de ce lot — et écrivait encore à 01:40:37. Le chantier en cours touchait
`App.tsx`, `KeelAppShell.tsx` et `i18n/en.ts`, c'est-à-dire exactement les trois
fichiers où `/coach/protocol` doit déclarer sa route, son entrée de navigation
et ses libellés.

Attente jusqu'au silence (aucune écriture ni commit pendant 10 min), puis reprise
sur autorisation explicite. Reconnaissance en lecture seule pendant l'attente.

### Deux hasards de cohabitation, consignés parce qu'ils coûtent cher

1. **Version de migration en double, non résolue à ce jour.**
   `20260804190000_retract_safety_constraint_for_user.sql` (committé, `1f2a6365`)
   et `20260804190000_student_safety_constraint_retraction.sql` (écrit par
   l'autre session) portent le **même horodatage**. Tant que les deux
   coexistent, `supabase db reset` est inapplicable — pour tout le monde. Ce
   lot n'y touche pas (fichier d'autrui, en cours d'écriture) et **place ses
   propres migrations bien au-delà**, à `20260805100000`.

2. **15 fichiers laissés *staged* par l'autre session.**
   Conséquence directe sur la méthode de ce lot: **aucun `git add -A`, aucun
   `git commit -a`**. Chaque commit nomme ses chemins un par un. C'est aussi
   pourquoi le « commit snapshot » demandé par le prompt a été **sauté**: il
   aurait balayé le travail d'autrui dans un commit signé de ce lot.

---

## 2026-08-05 02:2xZ — Phase 1 & 2: le modèle de données et le compilateur

### Ce qui est écrit

`supabase/migrations/20260805100000_coach_protocol_mapping.sql` — cinq tables:

| table | rôle |
|---|---|
| `coach_protocols` | le conteneur versionné, brouillon → publié (motif `coach_doctrines`) |
| `coach_food_rules` | le mapping: une posture par groupe |
| `coach_timing_rules` | les quatre gabarits fermés |
| `coach_terms` | les mots du coach, rattachés à un groupe existant |
| `vocabulary_extension_requests` | le signal, jamais la création d'un slug |

`supabase/functions/_shared/keel/protocol_compiler.ts` — pur, sans I/O, sans
horloge, sans hasard, sans locale.

### Les décisions qui n'étaient pas évidentes

**Neutre = absence de ligne.** Encoder « neutre » comme une ligne obligerait à
écrire 30 lignes par coach pour n'en vouloir dire que quatre, et rendrait
indistinguables « je n'ai pas d'avis » et « je n'ai pas fini ». L'écran, lui,
affiche bien neutre comme une valeur — c'est un choix de **rendu**, pas de
stockage, et les deux ne sont pas obligés de coïncider.

**`target_op: 'any'` sur les lignes d'évitement, et pas `'<= 0'`.** Vérifié dans
`evaluator.ts` (branche `polarity='avoid'`): l'évaluateur ne lit **pas** le
target d'une ligne d'évitement — aucun fait contraire ⇒ `met`, un fait contraire
⇒ `missed`. Écrire `'<= 0'` donnerait au coach l'illusion d'un seuil numérique
que rien ne lit.

**Ce qui sépare `discouraged` de `excluded` tient en trois champs**, et un test
le verrouille nommément: `autonomy`, `priority`, `flex_eligible`. Aucun n'est un
champ de sécurité. Le jour où quelqu'un ajoute un quatrième champ de différence,
le test casse.

**`encouraged` est `flexible`, pas `strict`.** « Je pousse les légumes » est une
direction, pas une prescription au gramme; `strict` ferait rater sa journée à un
élève qui a mangé des épinards au lieu du brocoli attendu.

**Le titre porte le mot du coach, la jointure garde le slug.** C'est tout
l'intérêt de `coach_terms`: « Huiles de graines » à l'écran, `other_added_fat`
dans la FK, le prompt de vision et l'analyse photo. Aucun slug privé n'existe
jamais. Départage déterministe quand deux termes visent le même groupe (tri
lexicographique replié) — sans quoi le titre bougerait entre deux compilations
identiques selon un `ORDER BY` absent, et le diff de publication montrerait des
mouvements fantômes.

**Deux pièges du contrat, trouvés en le lisant et non en le devinant:**

- `group_every_meal` vise `any_meal`, et `plan_commitments_nominal_slot_check`
  **interdit** `nominal` sur `any_meal` — d'où `opportunistic`. `group_at_slot`,
  qui nomme un vrai repas, reste `nominal`.
- `no_group_after` est un évitement, donc `plan_commitments_avoid_grain_check`
  impose le grain `day` — jamais `occasion`.

**La fenêtre de `no_group_after` s'arrête à 23:59**, elle ne franchit pas minuit.
Le schéma l'autoriserait, mais étendre au-delà reviendrait à inventer une
frontière de journée que le coach n'a pas écrite.

### Les tests, et pourquoi ceux-là

**Le test qui porte le lot** n'est pas une paraphrase des règles: chaque ligne
compilée est passée au **vrai validateur**, `validateDraftCommitment` de
`plan-template-v1`. Si le contrat bouge, ces tests deviennent rouges — c'est le
but. Un garde-fou vérifie en plus que l'échantillon couvre bien les 3 postures
et les 4 gabarits, sans quoi le test principal ne prouverait rien.

**Le test de séparation méthode ↔ allergie, dans les deux sens** (§4 du prompt):

- *sens 1* — un `excluded` de coach ne produit aucune sévérité médicale, n'entre
  pas dans le verrou déterministe, et ne rend ni la preuve obligatoire ni la
  ligne bloquante;
- *sens 2* — l'allergie garde son verrou **même quand le coach encourage
  l'aliment**; le protocole ne peut ni ajouter ni retirer un token du verrou; un
  terme de coach posé sur le groupe allergène ne masque pas l'allergène;
- *les deux à la fois* — les deux modèles n'ont **aucun champ en commun**, ce qui
  casserait le jour où quelqu'un les fusionnerait « pour simplifier ».

### Un faux positif de mon propre test, gardé comme leçon

La preuve structurelle « le compilateur n'importe pas la couche sécurité »
échouait au premier essai — sur son propre **en-tête**, qui cite
`student_safety_constraints` pour documenter ce à quoi il ne touche pas. C'est
le piège déjà payé dans ce dépôt: les commentaires de ce projet nomment les
modules voisins, donc un grep naïf lit la prose comme un appel.

Corrigé en auditant le **code** et non la prose (retrait des commentaires et des
littéraux avant l'audit) — et le nettoyeur a lui-même son test, sinon la garde
pourrait devenir verte en n'auditant plus rien du tout.

### Sortie

```
deno test --allow-all supabase/functions/_shared/keel/protocol_compiler_test.ts
ok | 30 passed | 0 failed (29ms)

deno test --allow-all supabase/functions/_shared/keel/protocol_compiler_separation_test.ts
ok | 12 passed | 0 failed (44ms)

deno test --allow-all supabase/functions/_shared/
ok | 1463 passed | 0 failed | 17 ignored (19s)
```

### Ce qui n'est PAS prouvé à ce stade, et doit l'être

- La migration n'a **pas** été appliquée: `db reset` est bloqué par le doublon
  d'horodatage ci-dessus. Les CHECK, les index partiels, le trigger d'accord
  `coach_id`↔`protocol_id` et les policies RLS sont **écrits, non exécutés**.
- Rien ne relie encore le compilateur à `plan-publish-v1`: aucun élève ne reçoit
  quoi que ce soit de ce protocole. Le contre-factuel du §6.4 — deux protocoles
  différents ⇒ deux semaines différentes — reste entier.

---

## 2026-08-05 02:3xZ — Phase 3: l'écran, et la migration appliquée pour de vrai

### L'aperçu N'EST PAS une copie du compilateur — c'est le compilateur

Le §2.4 rend l'aperçu non négociable. Un aperçu qui *ressemble* à la
compilation serait pire que pas d'aperçu: deux implémentations divergent au
premier changement, et le coach lirait une promesse que Sophia ne tiendrait pas.

`frontend/src/keel/api/coachProtocol.ts` importe donc
`supabase/functions/_shared/keel/protocol_compiler.ts` — le module Deno
lui-même. C'est possible parce que le compilateur est pur (ses seuls imports
sont des `import type`, effacés à la compilation) et que le front est en
`allowImportingTsExtensions` + résolution `bundler`. Vérifié par une sonde
avant d'écrire quoi que ce soit dessus. Si quelqu'un y ajoute un import Deno
runtime, le typecheck du front casse — c'est le bon endroit pour l'apprendre.

### Trois défauts trouvés en exécutant, pas en relisant

1. **Collision de nom de contrainte.** `constraint
   coach_timing_rules_template_check` porte exactement le nom que Postgres
   génère tout seul pour le `check` de la colonne `template`
   (`<table>_<colonne>_check`). Le `CREATE TABLE` entier échouait. Renommée
   `coach_timing_rules_slots_match_template`. **Aucune relecture ne l'aurait
   trouvé** — seule l'application réelle l'a dit.

2. **La lignée de migrations était inapplicable.** Le doublon
   `20260804190000` (deux fichiers, même version) faisait échouer
   `migration up` à l'enregistrement, sans jamais atteindre la mienne — alors
   que le SQL du second s'exécutait quand même (son trigger était posé en base,
   non enregistré). Débloqué sur décision explicite: le fichier non committé de
   l'autre session est renommé `20260804195000`, son contenu intact.

3. **Le registre de triggers refusait les miens.** `coverage-guard.int.test.ts`
   impose que tout trigger neuf soit déclaré. Rouge, à juste titre.

### Les gardes de schéma, éprouvées sur la base réelle

```
G1 gabarit group_every_meal traînant un cutoff  → REFUSÉ (coach_timing_rules_slots_match_template)
G2 le même sans le trou en trop                 → accepté
G3 portions_per_period sans direction           → REFUSÉ (même contrainte)
G4 slug hors vocabulaire ('kefir_maison')       → REFUSÉ (FK food_groups)
G5 deux postures sur le même groupe             → REFUSÉ (unique protocol_id+food_group_ref)
G6 règle portant un AUTRE coach que le protocole→ REFUSÉ (trigger coach_rule_matches_protocol)
```

`rowsecurity = t` sur les cinq tables; `has_table_privilege('anon', …, 'SELECT')
= false` sur les cinq — vérifié sur **`anon`**, jamais sur `public`, parce que
`revoke from public` ne retire rien aux rôles nommés.

### Ce que je n'ai PAS fait, et pourquoi

**`App.tsx` et `KeelAppShell.tsx` sont modifiés sur disque mais NON COMMITTÉS.**
Ils portent encore le travail *staged* de l'autre session. La route
`/coach/protocol` et l'entrée de nav « Method » sont donc **vivantes dans le
serveur de dev** (Vite sert depuis le disque) sans qu'un commit de ce lot
emporte le travail d'autrui.

**`coverage-guard.int.test.ts`, lui, est committé avec 6 lignes qui ne sont pas
de moi** (le trigger `student_safety_constraints_retraction_only` et son
commentaire). C'est un registre partagé couplé à une migration déjà sur disque:
le test n'est vert qu'avec les deux jeux de lignes, et livrer un test rouge
serait pire. Rien n'est perdu — leur travail est préservé dans l'historique.

### Sortie

```
frontend: npx tsc -b --noEmit           → aucune erreur
frontend: npx vitest run                → 259 passed | 20 skipped
dont      coachProtocol.int.test.ts     → 19 passed
supabase migration up --local           → 20260805100000 appliquée
```

---

## 2026-08-05 13:xxZ — « Recommended food »: le coach parle en ALIMENTS

### Le défaut, et il tenait en un mot

L'écran demandait une posture sur **30 groupes abstraits** (« matière grasse
ajoutée », « légumes non féculents »), en pastilles tri-état qu'on faisait
défiler d'un tap. Deux reproches du produit, et c'était le même: **illisible**
ET **peu de choix**. Un coach ne pense pas en groupes. Il pense « huile de
coco », « carotte », « saumon ».

### La ligne de partage qui porte tout le lot: GRAMMAIRE vs OPINION

L'observation qui a débloqué la conception: *« l'huile de coco ce n'est pas
vraiment du timing, c'est plutôt un nombre de centilitres — mais l'huile
d'avocat peut être ok. En fait c'est la fréquence d'utilisation. »*

Elle sépare deux choses qu'on avait tendance à mélanger:

| | porte | exemple |
|---|---|---|
| `food_items` (global, curé) | **la grammaire** — groupe + AXE DE COMPTAGE | « une huile se compte en ml » |
| `coach_food_items` (par coach) | **l'opinion** — posture, fréquence, pourquoi | « max 2 c. à s./semaine, parce que… » |

Huile de coco et huile d'avocat ont la **même grammaire** (`volume`, ml) et
portent des opinions opposées. Aucune colonne du catalogue ne juge un aliment —
à une exception assumée, `default_why`, traitée plus bas.

### ⚠️ Ce qu'une règle par ALIMENT ne peut pas faire, et qui est écrit à l'écran

Elle n'est **pas vérifiable sur une photo**. L'analyse photo rend des GROUPES:
elle ne dira jamais « c'était de l'huile de coco » plutôt que « de la matière
grasse ajoutée ». Compiler « max 2 c. à s. d'huile de coco » en « max 2
portions de matière grasse ajoutée » donnerait au coach une **garantie fausse**.

D'où la séparation, dite dans `coach.food.freq.scope_note` **là où le coach
écrit la règle**, pas en note de bas de page:

* règles par **aliment** → ce que Sophia **construit** et **dit**;
* règles par **catégorie** → ce que Sophia **vérifie** dans l'assiette.

### La dérivation, et son cas difficile

`_shared/keel/food_items.ts` — pur, 17 tests. Que du « pour » ⇒ `encouraged`;
que du « contre » ⇒ la sévérité la plus forte gagne; **les deux à la fois ⇒
AUCUNE règle de groupe**, et un conflit rendu à l'écran.

Ce dernier cas est le seul qui pouvait fabriquer une opinion. Un coach qui
recommande le saumon et écarte le thon n'a pas d'avis sur « les poissons gras »:
il en a deux, opposés, sur deux aliments. Le test « un groupe en conflit ne
produit AUCUN engagement en bout de chaîne » le verrouille **à travers le vrai
compilateur**, pas sur `rules`.

### `default_why` — l'exception, assumée, et ses garde-fous

Un « pourquoi » livré par KEEL sous le nom du coach fait de KEEL l'autorité
nutritionnelle — ce que `coachProtocol.ts` interdit noir sur blanc
(« des préréglages de STRUCTURE et jamais de CONTENU »). L'objection a été
posée, **l'arbitrage produit est de le garder**: un champ vide sur 127 aliments
ne serait jamais rempli.

Trois garde-fous, tous **structurels**:

1. `default_why` décrit un **rôle dans l'assiette**, jamais un effet santé,
   jamais un chiffre. Aucune ligne du seed n'en contient.
2. Rien n'atteint l'élève avant **publication**, geste explicite avec diff. Un
   texte non retouché mais publié est un texte que le coach a validé.
3. `why_source` (`seeded`/`ai`/`coach`) est un **cliquet**: l'écriture IA porte
   `where why_source <> 'coach'`. Une régénération ne peut pas écraser une
   édition du coach, **y compris si l'écran a un bug**. Ce dépôt a payé ce
   défaut exact sur la carte de défense.

### Deux défauts trouvés en EXÉCUTANT, invisibles à la relecture

1. **`as` sur un type étranger = typecheck désarmé.** `generateWithGemini` rend
   `string | {tool,args}`; je l'avais casté en `{text?: string}`. `deno check`
   passait, les appels LLM rendaient 200 dans les logs, et les deux actions
   rendaient `null` **en silence**. Corrigé par une fonction `modelText()` qui
   lit la vraie union — le cast est retiré, pas réparé.

2. **Une écriture ratée était invisible.** `setErrorText` n'était rendu que
   sous `phase === "error"`: un insert refusé laissait une pastille qui ne
   colle pas et zéro message. C'est l'accusé fantôme servi à l'envers — le
   coach reclique. Séparé en `writeError`, rendu en bandeau **sans effacer la
   page**: une lecture ratée remplace l'écran (on ne sait pas quoi montrer),
   une écriture ratée ne doit pas faire perdre ce qu'il regardait.

### Les gardes de schéma, éprouvées sur la base réelle

```
G1 every_meal traînant un cutoff              → REFUSÉ (coach_food_items_slots_match_frequency)
G2 le même sans le trou en trop               → accepté
G3 amount_per_period sans direction           → REFUSÉ (même contrainte)
G4 slug de groupe hors vocabulaire            → REFUSÉ (FK food_groups)
G5 le même aliment de catalogue deux fois     → REFUSÉ (unique per protocol)
G6 « Kombucha » puis «  kombucha  »           → REFUSÉ (libellé replié)
G7 règle portant un AUTRE coach               → REFUSÉ (trigger coach_rule_matches_protocol, réutilisé)
G8 axe volume qui n'annonce pas des ml        → REFUSÉ (food_items_volume_is_ml)
```

`rowsecurity = t` sur les deux tables; `has_table_privilege('anon', …)` = false
— vérifié sur **`anon`**, jamais sur `public`.

### L'épreuve de réel (navigateur + edge function servie en local)

Écran, coach QA, brouillon créé à la première écriture (v2):

* recherche « oil » → déplie **Fats**, 5 huiles;
* tap **Coconut oil** → ligne en base, `why_source='seeded'`, pourquoi
  pré-rempli, panneau déplié;
* « Set a rule » → unité **ml** en tête (portions et g toujours offerts),
  montant **15** lu du catalogue, phrase « at least 15 ml per week », persistée;
* aperçu compilé: « added fat — at least 1 serving a day, flexible »;
* Coconut oil → *Never* + Avocado oil → *Build with it* ⇒ **SPLIT CATEGORIES**
  rendu, et l'aperçu repasse à « Nothing yet ». La catégorie ne compile plus, et
  le coach l'apprend là plutôt que chez son élève.

`coach-protocol-v1`, quatre chemins:

```
classify_food  kefir           → dairy_yogurt   / volume   + why cite la conviction du coach
classify_food  coconut aminos  → sauce_dressing / volume
classify_food  avocado oil spray → other_added_fat / volume
draft_why      why_source='coach'  → coach_owned   (texte du coach INTACT en base)
draft_why      why_source='seeded' → réécrit depuis la doctrine
draft_why      coach sans doctrine → no_doctrine   (refus, pas d'invention)
draft_why      item d'un autre coach → not_found
```

Aucune des sorties IA ne porte d'allégation de santé ni de chiffre.

### Suite immédiate: « Timing rules » et « Your words » retirés de l'écran

Arbitrage produit du même jour, après l'avoir vu en vrai: l'écran ne parle que
d'aliments. Les deux éditeurs sont supprimés, leurs 18 clés i18n avec eux.

Ce que ça ne coûte rien: **ni l'un ni l'autre n'a jamais rien écrit en base**.
`TimingRulesEditor` et `CoachTermsEditor` passaient tous les deux par
`onChange={setState}` — de l'état React local, perdu au rechargement. Aucune
donnée de coach ne disparaît.

Ce que l'écran continue de faire, et **exprès**: il CHARGE toujours
`coach_timing_rules` et `coach_terms`, et il les passe au compilateur.
`coach_terms` décide même du TITRE des engagements produits (`labelForGroup`).
Cesser de les lire changerait en silence ce que « What Sophia will check »
annonce, alors qu'aucune ligne n'a été supprimée en base. Personne ne perd une
règle parce qu'un écran a maigri.

### Sortie

```
deno test food_items_test.ts            → 17 passed
deno test _shared/ (hors doctrine_loader_test, cassé par une autre session)
                                        → 1509 passed | 2 failed
   (les 2 rouges = meal_generation_test, 199 lignes non committées d'autrui)
frontend: npx tsc -b --noEmit           → aucune erreur
frontend: npx vitest run                → 336 passed | 20 skipped
migration 20260805140000 appliquée en local, 127 aliments, 30 groupes couverts
```

### ⚠️ Blocage préexistant, non résolu par ce lot

`supabase migration up` reste **inapplicable**: `20260805090000` et
`20260805120000` existent chacun en **deux fichiers**, et pour `090000` les
**deux sont committés**. Ce lot n'y touche pas (fichiers d'autrui) et applique
sa propre migration directement, enregistrée à la main dans
`supabase_migrations.schema_migrations`. À trancher par quelqu'un qui possède
ces deux fichiers.

---

## Reste à faire

3. **La PUBLICATION.** L'écran écrit et lit son brouillon, l'aperçu compile en
   direct — mais le bouton « Publish to my students » n'a toujours **aucun
   `onClick`**, et rien ne relie le compilateur à `plan-publish-v1`. Aucun élève
   ne reçoit quoi que ce soit de cet écran. C'est le trou le plus important qui
   reste, et il précède le lot « Recommended food ».
   Concrètement: écrire les `coach_food_rules` **dérivés** au moment de publier
   (la dérivation est prête et testée), passer le protocole en `published`,
   superseder l'ancien.
3bis. Le remplacement de `/coach/templates`.
4. L'absorption de `/coach/import` en action d'amorçage.
5. La fin de la publication par élève (`plan_versions.student_id`) — **trois**
   épreuves d'absence: code applicatif, `pg_proc.prosrc`, vues.
6. La migration des coachs existants.
+ le gantelet §6: passe adversariale, épreuve de réel chronométrée,
contre-factuel, deux relectures à froid.
