# LOT D — les champs collectés et jamais lus

**2026-08-19** · branche `ff-001-quotidien-du-coach`
Périmètre reçu : ① l'envie du foyer · ② rythme / poids visé / séances · ③ le
commentaire de `PlanByPerson` · ④ la ligne de vente retirée.

**Runs réels consommés : 0** (plafond autorisé : 2). Le pourquoi est au §6.
**Mutations : 24 appliquées, 24 mordent** (3 ont d'abord SURVÉCU et ont fait
corriger la garde — elles sont nommées).
**Contrôles :** `npx tsc -b --force tsconfig.app.json` → **0 erreur** ·
`deno check` sur les 3 fichiers edge touchés → **0 erreur** ·
`npx vitest run` depuis `frontend/` → **4 échecs / 1666 passés / 20 ignorés**,
les 4 étant les rouges étrangers connus (`coverage-guard` ×2,
`household.int.test.ts:300` et `:323`). Référence tenue.

---

## 0. En une page

Sur les quatre points, **un seul était le défaut annoncé**. Les trois autres
étaient des **affirmations à vérifier** — et deux d'entre elles disaient
l'inverse de la réalité, dans les deux sens :

| | ce qui était annoncé | ce qui est vrai |
|---|---|---|
| ① | l'envie du foyer n'est pas transmise, et la justification écrite est fausse | **exact.** Corrigé, câblé, versionné, 7 mutations |
| ② | trois champs sans aucun lecteur | **faux pour les trois.** Le rythme en a deux (dont un dimensionne des grammes), le poids visé quatre, les séances trois. Et pour deux d'entre eux le lecteur demandé est **interdit par écrit**, daté d'hier |
| ③ | un commentaire promet une garantie que le code n'arme pas | **exact**, et le trou est plus étroit qu'il n'en a l'air : la fuite mesurée est dans un champ que cette vue ne rend pas |
| ④ | la ligne de vente a été retirée, à toi de trancher | **retrait confirmé** — et le retrait était **inachevé** : la page annonçait encore « six » dans quatre copies, dans deux langues |

Le motif du chantier s'est donc retourné : cette nuit, ce n'est pas seulement
« un champ collecté ressemble à un champ ignoré », c'est aussi **« une décision
produit écrite dans un commentaire ressemble à un oubli »**. Les deux se lisent
pareil depuis un `grep`, et les deux se réparent de la même façon : en armant la
propriété par un test, pas en la réécrivant dans un commentaire de plus.

---

## ① Le textarea d'envie du foyer — **corrigé et câblé**

### Ce qui était vrai

Le champ « ce dont ils ont envie pour ces repas » (`MealBuilder.tsx`, label
`meals.form.preferences_label`) est rendu **sans garde de lane** : un maître de
foyer le voit et le remplit. Il ne partait nulle part :

- la branche foyer du submit ne le passait pas ;
- `generateHouseholdMeal` (`api/household.ts`) ne l'acceptait pas dans sa
  signature ;
- le corps de la requête ne le portait pas ;
- `callGenerator` (`api/planDraft.ts`) le jetait aussi sur la lane foyer.

Et **le serveur le lit depuis toujours**, à trois endroits de
`generate-household-meal-v1/index.ts` — tous les trois nourris de `null` :

| ligne | lecteur | effet perdu |
|---|---|---|
| `:3582` | `buildMealPrompt({ preferences })` | la ligne « what they feel like eating THIS TIME » n'était **jamais** écrite pour un foyer |
| `:4569` | `reportOnRequest` (FF-061) | le compte-rendu de la demande était **structurellement vide** sur cette lane |
| `:4976` | payload de `write_student_meal_plan` | la colonne `preferences` du plan restait `null`, donc la reprise d'envie de `MealBuilder` (`preferencesCarried`, `:559`) ne pouvait **jamais** se déclencher au foyer |

### La justification fausse, et ce qu'elle a coûté

`api/planDraft.ts` portait : *« Lui envoyer les champs de la lane individuelle ne
les ferait pas lire, mais laisserait croire ici qu'ils comptent. »*

C'est cette phrase qui a fait tenir l'absence. Elle est vraie pour `mode`,
`meal_slot`, `servings`, `pantry` — et **fausse pour `preferences`**. Le
commentaire a survécu à la lecture qu'il déclarait impossible.

Preuve que rien n'intercepte le champ entre la requête et le prompt :
`const body = await req.json()` (`:861`), **jamais réassigné**, **aucune liste
blanche de clés**, aucun `delete`. Vérifié par grep sur `body =` / `delete body`.

### Ce qui a été fait

| fichier | geste |
|---|---|
| `frontend/src/keel/api/household.ts` | `preferences: string \| null` **REQUIS et nullable** dans la signature (jamais `?:` — cicatrice « paramètre de garde optionnel = garde désarmée ») + `preferences: args.preferences` dans le corps |
| `frontend/src/keel/components/MealBuilder.tsx` | la branche foyer passe `preferences: preferences.trim() \|\| null` — **la même expression, à l'octet près**, que la lane individuelle |
| `frontend/src/keel/api/planDraft.ts` | `preferences: input.preferences` sur la branche foyer + **le commentaire faux réécrit**, avec les trois lignes du serveur nommées |
| `_shared/keel/household_meal_generation.ts` | `HOUSEHOLD_PROMPT_VERSION` **v17 → v18** (`v18_what_they_feel_like_this_time`) |
| `_shared/keel/meal_generation.ts` | la note de l'axe ② disait « la lane foyer n'appelle jamais `preferences` » — **corrigée**, elle était vraie hier |

### La version : pourquoi l'axe foyer et pas le tronc

Le critère du dépôt est écrit dans `household_meal_generation.ts` : *« deux plans
stampés pareil peuvent-ils porter des consignes différentes ? »* Après ce lot,
oui — **pour les foyers où quelqu'un a tapé une envie**, et pour eux seuls.

- lane individuelle : **byte-identique**, elle envoyait déjà le champ ;
- foyer sans envie : **byte-identique** (`preferences: null` ⇒ aucune ligne) ;
- foyer avec envie : consigne **changée**.

Le précédent est **exact** : v17 (2026-08-18) a fait la même chose pour
`fixedIntakes`, un paramètre du tronc que cette lane passait vide.
`MEAL_PROMPT_VERSION` ne bouge donc pas — le bumper re-stamperait toute la lane
individuelle pour un changement qu'elle ne voit jamais.

⚠️ **Aucun octet de prompt n'a été réécrit.** Le seul texte modifié est un
identifiant de version, et il est stampé dans `generated_from.prompt_version`
(`index.ts:5060`), **pas dans le prompt**. Le piège n°3 du briefing (« le mode
JSON réécrit le prompt après la capture si le mot *json* disparaît ») ne
s'applique donc pas — et il reste tenu par un test armé, vérifié vert ce jour :
`meal_precedence_test.ts` → *« ⛔ le mot « json » survit aux deux moitiés, sur les
deux populations »*.

### La sécurité de ce branchement

Brancher une envie **sur une table** est plus dangereux que sur une bouche : la
sortie est lue à voix haute devant tout le monde. Ce branchement n'est sûr que
parce que l'axe ② du 2026-08-18 a **déjà** donné son rang à la ligne
(« never at the cost of a hard constraint, of their diet, or of this coach's
method »), après avoir mesuré sur le run `2a000000-3100-…` qu'une envie **nue**
qui nomme l'allergène médical de la personne ressort **21 fois** en sortie.
Le test `householdEnvyWiring.int.test.ts` **épingle cette phrase** : si elle
disparaît, le câblage rougit avec elle. Mutation M7 : mord.

### Mutations (7/7 mordent)

| | mutation | verdict |
|---|---|---|
| M1 | le submit foyer ne passe plus l'envie | mord |
| M2 | la signature redevient `preferences?:` | mord |
| M3 | `api/household.ts` n'envoie plus l'envie | mord |
| M4 | `planDraft.ts` n'envoie plus l'envie sur la branche **foyer** | mord *(voir ci-dessous)* |
| M5 | la version foyer reste sur v17 | mord |
| M6 | le serveur cesse de lire `body.preferences` pour le prompt | mord |
| M7 | le tronc reperd le rang de la ligne d'envie | mord |

⚠️ **M4 a d'abord SURVÉCU, et c'est le meilleur résultat du lot.** L'assertion
était `toContain("preferences: input.preferences,")` — satisfaite par la branche
**individuelle** du même fichier. La garde restait verte en retirant exactement
la ligne qu'elle devait protéger : le défaut qu'on ferme, reproduit à
l'intérieur du test qui le ferme. Remplacée par un **compte** (`=== 2`).

### Effet réel, dit sans maquillage

- `MealBuilder` → foyer : **effet immédiat**, c'est l'écran vivant.
- `planDraft` (aperçu/adoption) : **effet nul aujourd'hui** — ses deux appelants
  (`SetupPage`, `StudentWeekPlanPage`) passent `preferences: null` en dur,
  l'aperçu n'ayant pas de champ d'envie. Le corps cesse simplement de **mentir**
  sur ce que la fonction lit. C'est écrit dans le code, pas seulement ici.
- **Trouvé en passant, hors périmètre :** `PlanDraft.requestReport` /
  `requestReportRefusal` (`planDraft.ts:163-164`) sont lus depuis la réponse et
  **rendus par aucun composant** — `grep` sur tout `frontend/src` : zéro
  lecteur. FF-061 calcule un compte-rendu que personne n'affiche, sur les
  **deux** lanes. Même motif, autre lot.

---

## ② Rythme, poids visé, séances — **la prémisse est fausse, et deux exclusions sont écrites**

Audit fait **commentaires retirés** (cicatrice `caller-audit-must-strip-comments`),
sur tout `supabase/functions` + `frontend/src`, fichiers de test exclus.

### `target_pace_kg_per_week` — ⛔ **VOS DEUX GESTES SE TOUCHENT. JE M'ARRÊTE.**

Il a **deux lecteurs vivants**, et ils sont dans `HEAD`, pas dans un arbre de
travail :

- `generate-household-meal-v1/index.ts:4434-4457` (HEAD) le charge **par
  bouche**, deux sources avec précédence (`household_members` puis
  `student_goals`), et le donne au **dimensionnement** — il décide des
  **grammes** d'une assiette ;
- `meal-energy-v1/index.ts:737,767` le lit pour le **rythme exécuté** du conseil
  du midi (`executedPaceFor`), appelé en vrai par `useMealEnergy` dans
  `MealBuilder`.

**Je n'ai rien fait entrer dans le prompt, et voici pourquoi — deux raisons,
chacune suffirait :**

1. **Ce serait un taux de déficit.** « 0,5 kg par semaine » n'est pas une
   direction, c'est une vitesse de perte : la phrase d'un tracker, exactement le
   terrain d'énergie que `CONTRACT.md` clôture et que `meal_body.ts` refuse en
   toutes lettres pour le poids visé. Et sur un **mineur**, l'énoncer serait le
   défaut bloquant nommé dans mon propre brief.
2. **Le cran agit déjà, en grammes.** Le redire au modèle ferait **compter deux
   fois** le même curseur — deux sources pour une seule décision, et c'est
   toujours celle qu'on relit le moins qui gagne.

⚠️ **Signalement demandé, le voici.** Le fichier
`generate-household-meal-v1/index.ts` porte **350 lignes non commitées** et
`household_portions.ts` **1 086**, d'une session voisine, exactement sur ce
curseur. Mon geste (l'entrée dans la consigne) et le leur (le calcul des
grammes) ne se « touchent » pas seulement par le fichier : **ils visent la même
décision**, et la bonne destination du rythme est la leur. Je n'ai pas écrit une
ligne dans ces deux fichiers.

### `target_weight_kg` — exclu de la consigne **par écrit**, et la raison tient

Quatre lecteurs vivants, tous côté écran ou conformité : l'estimation d'arrivée
du formulaire (`household.mouth.arrival`, `MouthFormDialog.tsx:1037`) — qui est
mot pour mot ce que le libellé promet (*« With the pace below, this gives a date
to arrive on »*) —, le résumé de `/app/plan` (`plan.summary.aiming_weight`), la
bande de progression (`api/bodyMeasures.ts:527`), l'export RGPD.

L'exclusion du prompt est **écrite, motivée et toujours valable**, en tête de
`_shared/keel/meal_body.ts` (FF-030 R7) :

> Ce qui N'Y EST PAS, et n'y entrera pas : `target_weight_kg` et
> `target_waist_cm`. […] un modèle qui lit « vise 72, en pèse 98 » raisonne en
> écart, en déficit et en délai. La DIRECTION passe, elle, par le jeton `goal`
> et par `focus_axis`.

**La direction passe déjà.** Le champ n'est donc pas « sans lecteur » : il est
**délibérément muet à un endroit précis**. Renverser cette décision est un
arbitrage produit, pas un correctif de câblage.

### Les séances d'activité — « aucun générateur ne lit cette table » est une **propriété à maintenir**

Trois lecteurs vivants : l'écran `/app/progress`
(`StudentProgressPage.tsx:915` → `ActivitySessionsCard` → `api/activitySessions.ts`),
`week_review_io` (gelé par le cron du dimanche, désactivé), l'export RGPD + la
purge.

La migration `20260818180000_a_session_is_a_fact_not_an_energy.sql` — datée
**d'hier** — écrit :

> ⛔ ON NE RÈGLE RIEN DEPUIS UNE SÉANCE. Ni le plan, ni les repas, ni l'enveloppe
> du jour. […] **Aucun générateur ne lit cette table, et c'est une propriété à
> maintenir, pas un état transitoire.**

Avec ses nombres : déficit visé 400-500 kcal/jour, erreur d'une dépense
d'exercice déclarée ±30-50 % ⇒ la soustraire **augmente** l'incertitude du jour.

### Ce que j'ai livré à la place — et c'est le vrai remède

Une décision écrite dans un commentaire est une décision qu'on redécouvre par un
incident. **Ces trois propriétés n'étaient tenues par aucun test** : elles
vivaient dans un en-tête de module et un commentaire de migration, c'est-à-dire
dans les deux endroits qu'un `grep` de code ne regarde pas. C'est très
exactement pourquoi elles ont été rangées parmi les « champs sans lecteur ».

1. **`frontend/src/keel/api/mouthProfileReaders.int.test.ts` (nouveau)** — arme
   les trois propriétés **dans les deux sens** : rouge si un lecteur qui existe
   disparaît, rouge si le lecteur interdit apparaît. Ce n'est pas une
   interdiction définitive : c'est une demande que la décision soit **prise**.
2. **`frontend/src/keel/api/mouthProfile.ts`** — la carte des lecteurs est posée
   **à la porte d'écriture**, là où la question se pose, avec la raison de
   chaque silence. Il fallait lire quatre fichiers ailleurs pour l'apprendre.

### Mutations (9/9 mordent)

| | mutation | verdict |
|---|---|---|
| M15 | le foyer perd la source **roster** du rythme | mord |
| M15b | le foyer perd la source **compte** du rythme | mord |
| M16 | `meal-energy-v1` cesse de lire le rythme | mord |
| M17 | le rythme entre dans le tronc du prompt | mord |
| M18 | un poids visé entre dans `MealBodyContext` | mord |
| M19 | une lane de génération charge le poids visé | mord |
| M20 | une lane de génération lit `student_activity_sessions` | mord |
| M21 | `/app/progress` cesse de monter la carte des séances | mord |
| M22 | les séances entrent dans le tronc du prompt | mord |

⚠️ **M15, M16 et M21 ont d'abord SURVÉCU.**
M15/M16 : `toContain("target_pace_kg_per_week")` restait vert quand on retirait
la colonne d'**une** des deux requêtes — le jeton survivait dans l'autre, et la
moitié perdue (les bouches **sans compte**) ne disait rien. Remplacé par un
**compte de `.select(...)`**, en plancher (`>= 2`) et non en égalité, pour ne pas
rougir sur l'élargissement légitime du lot voisin.
M21 : `toContain("<ActivitySessionsCard")` restait vert sur
`<ActivitySessionsCardX`, un composant qui n'existe pas — la garde validait la
chaîne, pas le montage. Remplacé par une **frontière de mot**.

---

## ③ Le commentaire de `PlanByPerson` — **corrigé, filtre non touché**

### L'écart, mesuré

`PlanByPerson.tsx:33` promettait : *« `portion_note` […] garantie sans **motif**
ni vocabulaire de corps par `sanitizePortionNote` côté serveur »*.
La moitié « vocabulaire de corps » est vraie. La moitié « sans motif » ne l'est
pas — **et c'est la moitié qui rassure**.

Mesuré le 2026-08-19 en **appelant la fonction directement**
(`deno run` sur `sanitizePortionNote`, notes rendues **intactes**) :

| note | sortie |
|---|---|
| « One ladle of the vegan chilli » | **passe** |
| « Serve her the pescatarian plate » | **passe** |
| « Half a portion of the halal chicken » | **passe** |
| « Give her the gluten-free pasta » | **passe** |
| « Keep the sesame away from her plate » | **passe** |
| « A smaller share, for her fat loss » | mise à `null` |
| « elle fait attention à son poids » | mise à `null` |

`FORBIDDEN_PORTION_TERMS` contient le **mot** `regime` / `diet` — **pas les
régimes**. Le nom d'un régime et une contrainte médicale ne sont pas filtrés.

### Ce que ça coûte à **cette vue**, précisément

Contre-mesure en base, parce qu'un trou non exercé et un trou inoffensif ne sont
pas la même phrase :

- `member_portions` → **336 notes**, **0** contenant un nom de régime ;
- `dishes` → **18 plans de foyer sur 101** nomment un régime en clair, et les
  **29 occurrences sont TOUTES dans le champ `why`** (« *A non-vegan plate for
  Roxane…* », « *…keeps her meal separate from the shared vegan pot* ») ;
- **`PlanByPerson` ne rend pas le `why`** : `HouseholdDishView` ne le porte pas,
  et `DishListByDay` n'affiche que jour / moment / titre.

Donc : **le trou est réel et non exercé ici**. Rien ne l'empêche d'arriver ; seul
le modèle ne l'a pas encore écrit dans `portion_note`. C'est la forme exacte de
faux vert que ce chantier traque, et le commentaire d'origine l'aurait laissée
passer en la déclarant impossible.

### Geste

Le commentaire dit maintenant la vérité : ce que la liste fermée tient, ce
qu'elle ne tient pas, les sept phrases mesurées, les trois nombres de base, et
un ⛔ contre l'armement d'un filtre **côté écran** (une seconde garde diverge de
la première). **Je n'ai pas touché `sanitizePortionNote` ni
`FORBIDDEN_PORTION_TERMS`** — l'extension du verrou de sortie appartient à
l'autre lot, et le commentaire rappelle qu'elle doit porter la **tolérance des
négations**, sans quoi « Keep the sesame away » se ferait mordre par son propre
allergène.

---

## ④ La ligne de vente — **je confirme le retrait, et je termine le travail**

### Ce que j'ai vérifié avant de trancher

| question | réponse mesurée |
|---|---|
| le `CHECK` existe-t-il encore ? | **oui, et il est armé** : `student_week_plans_doctrine_traceable_check`, `NOT jsonb_path_exists(items, '$[*]?(@.kind == "nutrition" && (!(exists (@.source_belief_key)) \|\| @.source_belief_key == null))')` |
| a-t-il encore un écrivain ? | **non.** `generate-week-plan-v1/index.ts` est supprimé. Toutes les occurrences restantes de `student_week_plans` dans le code sont des **lecteurs** (`following_io`, `coach_synthesis_io`, `hunger_signal_io`, export RGPD) |
| la table est-elle vivante ? | 246 lignes, dernière écriture **2026-08-18 11:15** — avant le retrait de la lane |
| les plats tiennent-ils la promesse ? | **non, et pas par accident** |

Sur la seule lane vivante, `honours_belief_keys` est **informatif par arbitrage
produit du 2026-08-04**, écrit en tête de `meal_generation.ts` :

> Un plat est une application libre. […] `honours_belief_keys` est donc
> renseigné quand le modèle sait le dire, et il est INFORMATIF : **aucun CHECK ne
> l'exige**, et le lecteur de ce fichier ne doit pas croire qu'il le garantit.

Le test `meal_generation_test.ts` le confirme dans les deux sens : *« an invented
conviction key is dropped but does NOT cost the dish »* — la clé inventée est
jetée, **le plat est gardé**.

Mesure en base, 2026-08-19 : **1 598 plats sur 1 816 citent au moins une
conviction — 88,0 %**, et **31 plans sur 179 n'en citent aucune**.

### La décision

**Le retrait est confirmé. Je ne réécris pas la promesse, ni sur la semaine ni
sur les plats.**

Ce qui m'a décidé, dans cet ordre :

1. **Une garantie dont le point d'application ne peut plus tirer n'est pas
   tenue — elle en a l'air.** Le `CHECK` est toujours là, toujours armé, et il
   ne verra plus jamais une ligne. C'est le pire des trois états possibles : il
   *ressemble* à une garantie tenue, y compris à qui va vérifier.
2. **La version « sur les plats » n'est pas un rattrapage, c'est une
   contradiction.** 88 % n'est pas « chaque ligne » ; et surtout, exiger la
   citation sur un plat reviendrait à vendre **contre** l'arbitrage du
   2026-08-04, qui dit qu'un plat est une application **libre**. On ne réécrit
   pas une page de vente pour la rendre vraie contre le modèle produit.
3. **La règle qui en sort, et qui est maintenant écrite dans `en.ts` :** *une
   page de vente ne redit cette garantie que le jour où un `CHECK` la tient.*

### Le retrait était inachevé — quatre copies fausses, deux langues

La grille rend **cinq** lignes depuis cette nuit. Continuaient d'en annoncer
**six** :

| clé | avant | après |
|---|---|---|
| `pro.lines.title` (EN) | « **Six** places it breaks without you. **Six** answers. » | « **Five** places… **Five** answers. » |
| `pro.lines.title` (FR) | « **Six** fois où ça casse sans vous. **Six** réponses. » | « **Cinq** fois… **Cinq** réponses. » |
| `pro.hero.lede` (EN) | « …**six** things that have to hold… » | « …**five** things… » |
| `pro.hero.lede` (FR) | « …**six** choses qui doivent tenir… » | « …**cinq** choses… » |

Une page de vente qui se trompe sur **son propre compte** est la première phrase
fausse que le lecteur peut vérifier lui-même. C'est le même défaut que celui du
lot, une couche plus haut : le retrait a été fait dans la grille et dans les
clés, et pas dans les deux phrases qui **comptent** la grille.

Corrigé aussi : `fr.ts:402` renvoyait à « *voir le commentaire d'en.ts* » — **ce
commentaire n'existait pas**. Il existe maintenant, et il porte les nombres
ci-dessus plutôt qu'un souvenir.

### Le garde-fou

`frontend/src/keel/pages/proPageLines.int.test.ts` (nouveau) :

- le compte annoncé est **lu** dans `ProPage.tsx` (jamais recopié — même règle
  que `pageSeams.int.test.ts`) et confronté aux **quatre** copies, EN et FR ;
- aucune clé `pro.line.cite.*` n'est revenue ;
- ⚠️ **`generate-week-plan-v1/index.ts` n'existe toujours pas.** Le jour où
  l'écrivain revient, ce test rougit — non pas pour interdire la lane, mais pour
  dire : *la raison du retrait vient de changer, va re-trancher*. C'est la seule
  forme de trace qui survive à trois jours.

### Mutations (7/7 applicables mordent)

M8 titre EN → « Six » · M9 titre FR → « Six » · M10b lede EN → « six » ·
M11 lede FR → « six » · M12 une clé `pro.line.cite.*` revient ·
M13 une sixième ligne est rendue sans toucher au titre. **Toutes mordent.**

---

## 5. Un rouge de plus, et il était à moi — réparé

`cookingShape.int.test.ts` est passé au rouge sur mon geste ① :

```
expect(src, "le jeton ne part plus avec la demande").toMatch(/cookingShape,\s*\}\);/)
```

L'ancre voulait dire « **dernière propriété de l'objet** ». En branchant l'envie
juste après `cookingShape`, le jeton n'avait **pas bougé d'un octet** et la garde
tombait. Une garde qui dépend de l'**ordre** des propriétés d'un littéral
surveille la mise en page, pas le câblage.

Réancrée sur l'appel lui-même
(`/generateHouseholdMeal\(\{[\s\S]*?\bcookingShape,[\s\S]*?\n\s*\}\);/`), et
**revue mordre** : M14 (retirer `cookingShape,` du submit foyer) → mord.

---

## 6. Les runs : **0 consommé sur 2 autorisés**

Le plafond était de deux. Je n'en ai pris aucun, et ce n'est pas de la prudence
de façade — c'est que **le seul risque résiduel qu'un run aurait fermé se ferme
par lecture**, et que le poste est partagé.

Ce qui est prouvé **sans** run :

| maillon | preuve |
|---|---|
| l'écran → le corps de la requête | 7 mutations, toutes mordent |
| le corps → `body.preferences` | `const body = await req.json()`, jamais réassigné, aucune liste blanche, aucun `delete` — grep |
| `body.preferences` → le prompt | 3 lectures épinglées par un compte (M6 mord) |
| `args.preferences` → la ligne du prompt | `meal_precedence_test.ts`, **vert ce jour** : « ② l'envie porte son rang, et **SEULEMENT quand il y en a une** » |
| le mot « json » dans les deux moitiés | même fichier, test dédié, **vert ce jour** — et aucun octet de prompt n'a été réécrit |

Ce qu'un run aurait ajouté : la ligne « what they feel like eating THIS TIME »
**vue** dans un dump de `llm_raw_response_events` pour un foyer réel. C'est une
confirmation, pas un maillon manquant.

Et deux raisons de poste :

1. **le runtime edge sert des `_shared` périmés** — un run honnête aurait exigé
   `docker restart supabase_edge_runtime_Sophia_2`, c'est-à-dire de **tuer les
   runs en vol** d'au moins une session voisine, activement en train d'écrire
   `generate-household-meal-v1/index.ts` et `meal_generation.ts` (ce dernier a
   été modifié sous mes pieds **pendant** mes contrôles, à 11:50:45) ;
2. la consigne de coût dit « le reste en tests et lecture de code ».

⚠️ **Résidu nommé, pour qu'il ne soit pas découvert par surprise :** la ligne
d'envie du foyer n'a **jamais été vue dans un prompt réel**. Le premier run de
foyer avec une envie tapée doit être relu — un `--source` obligatoire, la lane
foyer portant souvent deux appels par `request_id`.

---

## 7. Fichiers touchés

**Modifiés** (mes hunks seulement ; plusieurs de ces fichiers portent aussi des
centaines de lignes d'autres sessions) :

- `frontend/src/keel/api/household.ts` — signature + corps ①
- `frontend/src/keel/components/MealBuilder.tsx` — branche foyer ①
- `frontend/src/keel/api/planDraft.ts` — corps + **commentaire faux corrigé** ①
- `supabase/functions/_shared/keel/household_meal_generation.ts` — **v17 → v18**
- `supabase/functions/_shared/keel/meal_generation.ts` — note ② de l'axe, corrigée
- `frontend/src/keel/components/plan/PlanByPerson.tsx` — garde n°1, corrigée ③
- `frontend/src/keel/i18n/en.ts` — « Five », lede, note de retrait B27 ④
- `frontend/src/keel/i18n/fr.ts` — « Cinq », lede ④
- `frontend/src/keel/api/mouthProfile.ts` — carte des lecteurs ②
- `frontend/src/keel/api/cookingShape.int.test.ts` — garde sur-ancrée, réparée §5

**Nouveaux :**

- `frontend/src/keel/api/householdEnvyWiring.int.test.ts` (6 tests)
- `frontend/src/keel/api/mouthProfileReaders.int.test.ts` (7 tests)
- `frontend/src/keel/pages/proPageLines.int.test.ts` (5 tests)

⛔ **Non touchés, comme demandé :** `household_portions.ts`,
`allergen_catalog.ts`, `keel_output_locks.ts`, `dietary_regime.ts`,
`doctrine_loader.ts`. Aucun `git add -A`, aucun `git stash`, aucun commit.

---

## 8. Ce que je remonte pour arbitrage humain

1. **⛔ Collision sur le rythme — la seule chose qui demande une réponse.** Sa
   destination légitime est le **dimensionnement**, pas la consigne. J'ai laissé
   les deux fichiers du lot voisin intacts. Si quelqu'un veut malgré tout le
   faire entrer dans le prompt, il faut d'abord répondre à : *comment énonce-t-on
   une vitesse de perte sans énoncer un déficit, et sans jamais l'énoncer sur un
   mineur ?*
2. **Deux exclusions écrites sont désormais armées** (poids visé, séances). Si
   elles doivent tomber, elles tombent par une décision produit — les portes sont
   nommées dans `meal_body.ts` (FF-030 R7) et dans la migration
   `20260818180000`, et le test dira quoi rouvrir.
3. **FF-061 calcule un compte-rendu que rien n'affiche**, sur les deux lanes.
   Hors périmètre, non touché ; il devient visible maintenant que la lane foyer
   a enfin une entrée à lui donner.
4. **`sanitizePortionNote` laisse passer le nom d'un régime et une contrainte
   médicale.** Non armé par moi (l'autre lot porte le verrou) ; le commentaire
   dit maintenant la vérité et rappelle la tolérance des négations.
5. **Le budget de lignes de `ProPage` est dépassé depuis avant cette nuit** : son
   en-tête promet « ≤ 245 lignes », le fichier en fait 268 (253 à `HEAD`). Pas
   touché — mais c'est la même classe de défaut que ③ et ④, dans le même fichier.
