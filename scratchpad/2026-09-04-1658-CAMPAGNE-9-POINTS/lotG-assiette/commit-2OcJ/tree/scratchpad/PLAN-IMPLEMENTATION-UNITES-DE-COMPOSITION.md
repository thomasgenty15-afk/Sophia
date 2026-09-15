# PLAN D'IMPLÉMENTATION — les unités de composition (chantier complet, deux phases)

> Prompt autoportant pour un agent qui n'a PAS le contexte de la conversation.
> Repo : `/Users/ahmedamara/Dev/Sophia 2`. Tout le design amont est déjà arbitré :
> tu n'as AUCUNE décision de produit à prendre, seulement des décisions d'exécution.
>
> Le chantier a HUIT étapes en DEUX phases. La phase I (étapes 1-4) se livre d'un
> trait. Entre les deux phases il y a une GATE MESURÉE (§ checkpoint) : la phase II
> (étapes 5-8) ne démarre que si la gate passe — et si elle ne passe pas, le rapport
> le dit et le chantier s'arrête là en attendant l'arbitrage du propriétaire.

---

---

## ⚠️ MISE À JOUR DU 2026-08-10 — LIS CECI D'ABORD

Du travail a été fait **en parallèle de ton run**, par une autre session. Il est
livré, testé, et il te concerne directement.

### Ce qui a changé sous tes pieds

**1. Le modèle de génération a changé.** `generate-meal-v1` et
`generate-week-plan-v1` passent désormais `model: keelGenerationModel()` dans
`meta` — nouveau module `_shared/keel/generation_model.ts`, défaut
`gpt-5.6-sol`, surchargeable par la variable d'environnement
`KEEL_GENERATION_MODEL`. Avant, ces deux fonctions tournaient sur
`gpt-5.4-mini`.

> **Conséquence pour toi, et elle est structurelle : ne calibre aucune constante
> avant que ce modèle soit effectivement en place.** Les plafonds de densité,
> les seuils d'abstention et la gate de couverture se calibrent en observation
> (étape 4) — calibrés contre l'ancien mini, ils seraient tous faux. Si tu
> constates que le modèle réel n'est pas celui-là, **dis-le dans ton rapport
> et ne fige aucun seuil.**

**2. Les régimes alimentaires ont leurs fondations.** Voir la fiche
[FF-042](../docs/fonctionnalites/composition-des-repas/FF-042-les-regimes-alimentaires.md).
Sont **livrés et verts** :

- `_shared/keel/dietary_regime.ts` — module pur (liste fermée, groupes exclus,
  formes de surface EN+FR, ligne de consigne, sentinelles incouvrables),
  10 tests dans `dietary_regime_test.ts`
- migration `20260810140000_dietary_regime_constraint.sql` — **déjà appliquée
  en local et vérifiée ré-appliquable**. N'y retouche pas.

**3. Une version de migration est prise.** `20260810140000`. Tes migrations
partent donc de **`20260810150000`** au minimum, pas de `20260810120000`.

### Ce que tu dois ABSORBER dans ton étape 1

Le câblage des régimes appartient à ton étape 1, parce qu'il touche exactement
les fichiers que l'ancre protéique ouvre déjà, avec exactement la même
machinerie (sous-ensemble fermé, lexique EN+FR sur `forbidden_matcher`,
vérification au parseur, **un seul** bump de `MEAL_PROMPT_VERSION`). Le faire à
part coûterait une seconde passe et un second bump.

Quatre gestes, et le premier est un piège :

1. **`safety_constraints.ts`** — `dietRef` dans le type `StudentSafetyConstraint`,
   dans le `select` du loader (`.select("id, user_id, kind, allergen_ref, …")` —
   ajoute `diet_ref`), et dans le mapping de ligne.
   🚫 **JAMAIS dans `safetyConstraintTokens()`.** Lis le pavé au-dessus de cette
   fonction : le 2026-08-06, `allergen_ref='diabetes'` a armé la ceinture sur le
   mot « diabetes » et a remplacé un message d'urgence par un refus poli, en run
   réel. Mettre `vegan` dans la liste ferait rejeter toute réponse décrivant un
   plat comme végan — les bonnes réponses, et seulement pour les végans. Ce qui
   entre dans la liste, c'est `excludedSurfaceFormsFor(regime)`.
2. **`safetyConstraintsPromptBlock`** — la ligne `dietaryRegimePromptLine(regime)`
   en tête, avec le reste des contraintes dures.
3. **Parseur** (`parseGeneratedMeal`, et `parseWeekPlan` si applicable) — tout
   plat dont un ingrédient matche une forme exclue est **REJETÉ**.
   ⚠️ **Différence avec l'ancre protéique, ne la rate pas par analogie :**
   l'ancre est un `pass-with-issue` (le plat reste) ; un régime est un **rejet
   dur**, comme un allergène. Même détection, sévérité opposée.
4. **Front** — la case dans « Basic info », écrivant `kind='diet'`,
   `severity='strict'`. Si le front n'est pas dans ton périmètre de run, dis-le
   et livre les trois premiers.

Critères d'acceptation dans FF-042 §8 — les quatre cases non cochées sont
exactement ton travail.

### Ce à quoi tu ne touches PAS

- `dietary_regime.ts` et son test : livrés, verts, ne les réécris pas.
- La migration `20260810140000` : appliquée, ré-appliquable, ne la modifie pas.
- `generation_model.ts` : si le modèle pose problème, **c'est un sujet pour le
  propriétaire**, pas une constante à changer.
- `generate-household-meal-v1/index.ts` et `household_portions.ts` : **un autre
  chantier y travaille en ce moment.** Ne les ouvre pas avant l'étape 7, et
  vérifie `git status` avant de le faire.

---

## 0. Les documents d'autorité, dans l'ordre

1. **`scratchpad/DESIGN-UNITES-DE-COMPOSITION.md`** — LE contrat de ce chantier. Lis-le en
   entier avant d'écrire une ligne. Ce plan en est l'ordonnancement exécutable ; en cas de
   divergence entre ce plan et le design, le design gagne, et tu le signales.
2. `docs/keel/MODEL.md` et `docs/keel/CONTRACT.md` — le modèle produit et ses interdits.
3. `docs/fonctionnalites/composition-des-repas/FF-030-le-contexte-de-composition.md` — l'état
   des entrées déjà branchées sur le générateur.
4. `CLAUDE.md` et `AGENTS.md` — les règles du dépôt, dont les commandes qui te sont bloquées.

## 1. Le produit en cinq lignes (ce que tu dois savoir pour ne rien casser)

- KEEL : un coach écrit une **doctrine** 1:N ; c'est **l'élève** qui génère son plan de repas.
  Aucun canal 1:1, aucune copie qui fasse « attendre » l'élève.
- La sortie du produit est **des plats avec recettes grammées** (« 400 g de cuisses de
  poulet »). Ce chantier ne change PAS ce format — il ajoute un moteur de calcul INVISIBLE.
- La frontière des chiffres : **sur l'ALIMENT, jamais sur la PERSONNE**. Une quantité
  d'ingrédient est normale ; « ton objectif 1800 kcal » est interdit, partout, toujours.
- Le **plancher TCA** (`restriction_flag`) est au-dessus de tout, coach compris. Sous flag :
  ni poids, ni taille, ni mesure dans un prompt, rien qui compte à rebours.
- La philosophie propre de Sophia est une **doctrine maison** (`doctrine_delegation.ts:30`,
  `DOCTRINE_SOURCES = ["own","house"]`) — jamais un chemin de code parallèle.

## 2. Les arbitrages déjà rendus (contrat, ne pas rediscuter)

Rendus par le propriétaire le 2026-08-10, détail au §7 du design :

- **A1** — le plafond de déficit (500 kcal/j) est un plancher produit. `deficit_style:
  "aggressive"` **n'existe pas dans le type** (pas un `if` qui le rejette).
- **A2** — sous un coach muet, seules les **sentinelles** s'appliquent (mécanisme produit) ;
  la table de cadences maison ne gouverne que les élèves sans coach. Frontière
  mécanisme/contenu lisible dans le code : deux structures distinctes.
- **A3** — le foyer se livrera sans slot de dressage (hors périmètre ici de toute façon).
- **A4** — k=5 d'anonymat sur tout agrégat coach dérivé de verdicts (hors périmètre ici).
- **§3.0 du design** — le coach ne voit JAMAIS les axes du moteur. Sa méthode se demande
  comme un débat de doctrine ; les jetons sont dérivés à la publication. (Étape 6, hors
  périmètre, mais aucune décision d'ici ne doit le contredire.)

## 3. La discipline du dépôt (déjà payée, non négociable)

- **Fiche FF avant code.** Toute fonctionnalité commence par une fiche dans
  `docs/fonctionnalites/` au gabarit maison (11 sections — copie la structure d'une fiche
  récente, ex. FF-030). Prends le **prochain numéro libre** dans `docs/fonctionnalites/README.md`
  et mets à jour les deux index (racine + dossier). Un identifiant n'est JAMAIS réutilisé.
- **Un paramètre de garde est REQUIS, jamais optionnel.** Ajouter un paramètre requis casse
  la compilation chez tous les appelants : c'est voulu, c'est le mécanisme qui les recense.
- **Une garantie est tenue au prompt ET au parseur.** Une règle qui n'existe que dans le
  prompt n'est pas une garantie.
- **Tout ce qui est exécutable vient d'une liste fermée** avec un matcher. Le moteur de
  matching est `forbidden_matcher.ts` (`normalizeForMatch`) — jamais une seconde
  normalisation.
- **Toute garde se teste dans les deux langues** (EN et FR) — le dépôt a déjà payé « `not`
  ne couvre pas `doesn't` ».
- **Toute ceinture porte sa condition de désarmement**, testée par **égalité de chaînes** :
  l'élève dont on ne sait rien reçoit une consigne identique au caractère près à la baseline.
- **Migrations** : version strictement supérieure à **`20260810140000`** (voir la mise à
  jour en tête : cette version est prise par la migration des régimes alimentaires).
  Avant d'appliquer quoi que ce soit : `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d`
  (les doublons de version bloquent le lignage).
  🚫 **`supabase db reset` est INTERDIT sur ce chantier. Sans exception, y compris en
  local, y compris « juste pour repartir propre ».** Le hook le bloque, et l'interdiction
  tient même si le hook ne le bloquait pas. Ne le lance pas, ne cherche pas d'équivalent
  qui produirait le même effet (`db wipe`, drop de schéma, recréation de la base), et ne
  demande PAS au propriétaire de le lancer à ta place — la demande est elle-même hors
  périmètre.
  Pour appliquer tes migrations : **`supabase migration up`**, ou psql directement contre
  la base locale. C'est suffisant pour tout ce que ce plan demande.
  Conséquence à intégrer dans ta façon d'écrire : **tes migrations doivent être
  ré-appliquables sur une base qui a déjà vécu** — `create table if not exists`,
  `drop constraint if exists` avant `add constraint`, `add column if not exists`. Tu n'as
  pas de filet de reset ; une migration qui ne passe qu'une fois sur une base vierge est
  une migration cassée.
- **Toute table neuve** naît dans sa migration avec : `revoke all ... from authenticated, anon`
  (les privilèges par défaut Supabase donnent TOUT à `authenticated`, y compris TRUNCATE),
  et sa **réclamation par le lifecycle RGPD** (export + suppression) si elle porte une
  donnée utilisateur. Cherche comment les migrations récentes le font
  (ex. `20260810090000_student_body_measures.sql`).
- **Commandes bloquées** (hook `.claude/hooks/block-risky-commands.sh`) : secrets, deploy,
  `db push`, reset distant. Si tu en as besoin, arrête-toi et donne la commande au
  propriétaire.
- **Typecheck front** : `frontend/tsconfig.json` est un solution-file (`files: []`) qui ne
  vérifie RIEN — utilise `npx tsc -p frontend/tsconfig.app.json --noEmit`.
- **Runtime edge local** : il sert des versions périmées des modules `_shared` modifiés —
  redémarre `supabase functions serve` avant tout run réel.
- **Tests** : jamais un test paramétré par la constante qu'il teste (mute la constante pour
  prouver que le test mord). `deno test` sur `supabase/functions/_shared/keel/`,
  `npm test` côté front si tu touches au front (tu ne devrais pas en avoir besoin ici).
- **`as` sur un type étranger désarme le typecheck** — jamais de cast pour faire passer une
  forme de données.

## 4. Les deux phases, et la gate entre elles

**Phase I — le socle en observation (étapes 1-4).** L'ancre protéique, le référentiel en
ombre, les quantités structurées, les enveloppes + verdicts écrits-jamais-actionnés. Dans
l'ordre, chaque étape committée et verte avant la suivante. À la fin de la phase I, le
moteur MESURE tout et ne CHANGE presque rien (seule l'ancre protéique touche l'assiette).

**⛔ CHECKPOINT — la gate des 80 %.** À la fin de l'étape 4, tu calcules la couverture de
résolution médiane sur les repas réellement générés (rejeu de l'étape 2 + les générations
nouvelles). Ce qu'elle protège : un verdict calculé sur des ingrédients qui ne résolvent
pas ne doit JAMAIS devenir une correction — ce serait corriger des plans sur du bruit.

La gate n'est pas un arrêt réflexe, elle a un chemin pour être passée **par toi** :

1. Sous 80 % ⇒ tu prends la worklist d'alias (les `unresolved_terms` les plus fréquents),
   tu cures les 50 premiers dans `food_composition_aliases`, et tu **remesures**.
2. Tu peux répéter ce cycle **deux fois au plus** (soit ~150 alias curés). Chaque passe
   est documentée dans le rapport : combien d'alias, quelle couverture avant/après.
3. Toujours sous 80 % après deux passes ⇒ **là seulement, la phase II ne démarre pas.** Tu
   livres le rapport, la worklist restante, ton diagnostic de POURQUOI ça résiste (des
   termes trop composés ? une locale mal couverte ? un seed Ciqual trop pauvre ?), et tu
   t'arrêtes. La décision appartient alors au propriétaire.

Un alias n'est jamais deviné pour faire monter le chiffre : si tu ne sais pas à quel
aliment un terme correspond, il reste non résolu. Gonfler la couverture avec de faux
appariements produirait exactement le bruit que la gate existe pour empêcher.

**Phase II — l'armement (étapes 5-8).** La boucle de correction, la méthode du coach
rendue exécutable + le pilotage maison, le foyer, puis sentinelles + plancher de
couverture + ré-ancrage. Même discipline : dans l'ordre, une étape = un commit vert.

Règle transverse : **aucun pré-câblage en avance de phase**. Pas de champ « pour plus
tard », pas de token dormant, pas de colonne vide. Chaque étape pose exactement ce qu'elle
utilise ; quand une étape ultérieure a besoin d'un paramètre de plus sur une fonction, elle
l'ajoute REQUIS à ce moment-là — la casse de compilation qui s'ensuit est le mécanisme qui
recense les appelants.

---

## ÉTAPE 0 — Les fiches FF (chaque phase écrit ses fiches AVANT son code)

**Avant la phase I** — ✅ **FAIT**, les trois fiches existent :

1. ✅ [FF-037](../docs/fonctionnalites/composition-des-repas/FF-037-l-ancre-proteique.md) — l'ancre protéique
2. ✅ [FF-038](../docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md) — le référentiel de composition
3. ✅ [FF-039](../docs/fonctionnalites/composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md) — enveloppes & verdicts en observation
4. ✅ [FF-042](../docs/fonctionnalites/composition-des-repas/FF-042-les-regimes-alimentaires.md) — **les régimes alimentaires** (écrite par l'autre
   session ; son §3 « à câbler » et son §8 sont ton travail d'étape 1)

Numéros pris jusqu'à **FF-042**. Les fiches suivantes partent de FF-043.

**Avant la phase II** (donc seulement si la gate passe), trois fiches de plus :

4. **La boucle de correction** — les jetons fermés, le lexique du registre de régime, le
   retry unique repassé par tous les verrous.
5. **La méthode du coach, rendue exécutable** — la question de doctrine, la dérivation des
   jetons à la publication, le pilotage maison, la hiérarchie de préséance (§3 du design
   EN ENTIER, y compris §3.0 : le coach ne voit jamais les axes).
6. **La résolution foyer** — verrou de lane sous flag, MIN des enveloppes adultes, deltas
   additifs sans slot de dressage (A3), mineurs, confidentialité.

(Les sentinelles + plancher + ré-ancrage de l'étape 8 s'écrivent dans la fiche 4 ou dans
une 7e courte, à ton jugement — mais écrites avant le code, comme les autres.)

Chaque fiche cite le design (`scratchpad/DESIGN-UNITES-DE-COMPOSITION.md`) comme document
d'origine et reprend les arbitrages A1-A4 qui la concernent.

---

# PHASE I — le socle en observation

## ÉTAPE 1 — L'ancre protéique **et les régimes alimentaires**, de bout en bout

**Le livrable** : chaque repas principal généré porte un aliment protéique identifiable
(garanti au prompt ET au parseur, mesuré avant/après), **et aucun plat ne contredit le
régime déclaré de l'élève** (rejet dur).

> Les deux vont ensemble parce que c'est **la même machinerie** — sous-ensemble fermé de
> `FOOD_GROUP_REFS`, lexique EN+FR sur `forbidden_matcher`, vérification dans le parseur,
> **un seul** bump de `MEAL_PROMPT_VERSION`. Les séparer coûterait deux passes sur les
> mêmes fichiers et deux bumps. Le volet régimes a ses fondations déjà livrées
> (`dietary_regime.ts` + migration) : voir la mise à jour en tête de document et
> [FF-042](../docs/fonctionnalites/composition-des-repas/FF-042-les-regimes-alimentaires.md) §3.
>
> ⚠️ **Sévérités opposées, ne les confonds pas :** l'ancre protéique manquante est un
> `pass-with-issue` (le plat reste, on note) ; un plat qui viole un régime est un **rejet
> dur**, comme un allergène.

### Où intervenir

- `supabase/functions/_shared/keel/tokens.ts:480` — `FOOD_GROUP_REFS` (30 groupes, liste
  fermée). Définis `PROTEIN_SOURCES` comme **sous-ensemble** de ces 30 groupes (jamais une
  taxonomie nouvelle). Vraisemblablement : viandes, poissons, œufs, légumineuses, produits
  laitiers protéiques, tofu/soja — vérifie les slugs réels dans la liste.
- Nouveau module pur `supabase/functions/_shared/keel/protein_anchor.ts` : le lexique
  EN+FR des aliments protéiques (formes de surface par groupe), apparié via
  `findForbiddenMatches`/`normalizeForMatch` de `forbidden_matcher.ts`, et
  `detectProteinAnchor(ingredients: DishIngredient[]): boolean`.
- `meal_generation.ts:907` (`buildMealPrompt`) — une ligne de consigne QUALITATIVE dans la
  section de composition : « every main meal is anchored by a full protein food » (formule
  exacte à écrire en anglais, registre existant du prompt ; JAMAIS un gramme, jamais
  « 30-40 g »).
- `meal_generation.ts:1430` (`parseGeneratedMeal`) — vérification de présence par plat
  principal (les slots repas, pas les snacks : lis `parseEatingRhythm`/`OCCASION_*` pour la
  liste des slots « principaux »). Plat sans ancre ⇒ issue nommée `protein_source_missing`
  + le plat **passe quand même** (pass-with-issue : un verdict n'est pas un blocage, seul le
  verrou de sécurité vide un repas).
- Même mouvement dans `week_plan_generation.ts` si le plan hebdo compose des plats (vérifie
  `parseWeekPlan` — si la structure des lignes hebdo ne porte pas d'ingrédients, documente
  pourquoi l'ancre ne s'y applique pas au lieu de forcer).
- **Un retry** quand ≥1 plat principal manque d'ancre : suis le patron
  `doctrineRetryInstruction` (`doctrine.ts:1127`) — une instruction anglaise SANS chiffre
  (« give each main meal a full protein food as its anchor »), une seule relance, la sortie
  du retry repasse par TOUS les verrous existants.
- `meal_generation.ts:493` — bump `MEAL_PROMPT_VERSION` (la consigne change).

### Les gardes de l'étape

- Sous `restriction_flag` : l'ancre SURVIT (elle est côté aliment, présence pas quantité).
  Aucune branche spéciale — et un test le prouve.
- Un plat non principal (snack) n'est jamais pénalisé.
- Condition de désarmement : un plat QUI A une ancre ⇒ zéro issue, zéro retry, sortie
  identique.

### Tests (nouveau `protein_anchor_test.ts` + extension des tests existants)

- détection dans les deux langues (« chicken thighs » ET « cuisses de poulet »),
- un plat sans ancre ⇒ issue nommée + plat conservé,
- retry déclenché une seule fois, instruction sans aucun chiffre,
- snack sans protéine ⇒ rien,
- mesure : un échantillon de sorties d'avant (si des fixtures existent) passé au détecteur,
  pour chiffrer l'avant/après dans ton rapport.

---

## ÉTAPE 2 — Le référentiel de composition, en ombre

**Le livrable** : une table de composition + un résolveur, rejoués sur les repas déjà
générés en base, produisant UN CHIFFRE de couverture de résolution. **Zéro assiette
changée** : aucun prompt, aucun parseur modifié dans son comportement.

### La migration (`202608XXXXXXXX_food_composition_refs.sql`, version > 20260810140000)

Table `food_composition_refs` :
- `slug` (réutilise les slugs de `food_items` là où ils existent — vérifie la table),
- FK vers les 30 groupes de `FOOD_GROUP_REFS` (le vocabulaire existant, jamais un nouveau),
- valeurs pour **100 g CRUS** : `energy_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`,
- drapeaux sentinelles **booléens** : `omega3_marine`, `iron_source`, `calcium_source`,
  `iodine_source`, `zinc_source`, `b12_source`, `folate_source` (JAMAIS des mg — variance
  ±30-50 %, c'est un arbitrage du design),
- `yield_class` (liste fermée de rendements cru→cuit : riz/pâtes/légumineuses ~×2-3 à la
  cuisson, viandes ~×0,7-0,75, légumes ~×0,9 — les classes exactes et leurs facteurs sont
  des constantes nommées du module, pas des nombres éparpillés),
- `atwater_discount` (défaut 1.0 ; ~0,72 pour fruits à coque entiers, réf. Novotny 2012).

Table `food_composition_aliases` : `alias` (normalisé) → `slug`, fermée et curée.

Seed : **~300 entrées Ciqual** (ANSES, licence Etalab). Télécharge la table Ciqual
(ciqual.anses.fr / data.gouv.fr) et génère le seed par script (garde le script dans
`scratchpad/`). Si le réseau t'est indisponible, construis les ~300 entrées les plus
fréquentes à la main depuis tes connaissances EN LE DISANT dans la migration (commentaire
« seed provisoire, à remplacer par l'extraction Ciqual scriptée ») — la structure prime, la
précision du seed s'améliore après.

Hygiène obligatoire dans la même migration : `revoke` sur `authenticated`/`anon` (lecture
service-role uniquement), et **PAS de réclamation RGPD** pour `food_composition_refs`
(données de référence, pas de donnée utilisateur) — mais documente ce choix dans la
migration, l'absence doit être un choix écrit, pas un oubli.

### Le module (`supabase/functions/_shared/keel/food_composition.ts`, PUR)

- `resolveIngredient(term: string)` : normalisation via `normalizeForMatch`
  (`forbidden_matcher.ts`), égalité exacte puis alias. Terme non résolu ⇒ `null`, **jamais
  deviné**, et compté dans `unresolved_terms`.
- `gramsRawOf(amount, unit, state, yield_class)` : conversions (g, ml, unit via
  `typical_amount`/`count_axis` de `food_items.ts:132-140`, tbsp/tsp en constantes),
  cuit→cru via `yield_class`. Non convertible ⇒ `null` compté.
- `energyOf`, `proteinOf`, etc. — un ingrédient non résolu propage **de l'inconnu, jamais
  du zéro** (un type `Nutrients | "unknown"`, pas un 0 silencieux).
- Imputation d'huile de friture : 12 % du poids cuit quand la méthode matche un **lexique
  fermé** de méthodes de friture (EN+FR).

### Le rejeu

Script Deno (dans `scratchpad/`) : lit les repas générés existants en base locale
(`student_generated_meals` — vérifie le nom exact de la table), passe chaque liste
d'ingrédients au résolveur, sort :
- couverture de résolution médiane et distribution,
- le top des `unresolved_terms` (c'est la **worklist d'alias** — livre-la dans ton rapport),
- le % de repas où l'énergie serait calculable.

**Ce chiffre décide de la suite** (gate 80 %). Il va dans ton rapport final, pas dans une
surface produit.

### Tests (`food_composition_test.ts`)

- résolution exacte + alias + non-résolu compté,
- « 100 g de riz » cru vs cuit ⇒ facteur ~3 (LE piège du chantier, teste-le nommément),
- l'inconnu se propage (un plat avec 1 ingrédient non résolu ⇒ énergie `unknown`, pas
  amputée),
- décote Atwater appliquée aux fruits à coque,
- imputation friture : matche en EN et FR, ne matche pas « sauté à sec ».

---

## ÉTAPE 3 — Les quantités structurées

**Le livrable** : le générateur émet `amount`/`unit`/`state` à côté de la prose, et le
parseur **recalcule** les grammes lui-même. L'arithmétique du modèle n'est jamais une preuve.

### Où intervenir

- `meal_generation.ts:355` (`DishIngredient`) : + `amount: number | null`,
  `unit: "g" | "ml" | "unit" | "tbsp" | "tsp" | null` (liste fermée),
  `state: "raw" | "cooked" | null`. Le champ `quantity` (prose) reste tel quel,
  `ENERGY_UNIT_RE` (l.1428) reste armé dessus.
- Le contrat JSON du system prompt (~l.877-900) : les trois champs ajoutés à l'exemple,
  avec la règle dite au modèle : `state` obligatoire pour tout ingrédient qui absorbe ou
  perd de l'eau à la cuisson (riz, pâtes, légumineuses, viandes), et la quantité prose
  reste destinée à l'humain.
- `parseGeneratedMeal` : lecture tolérante des trois champs (champ absent/illisible ⇒
  `null` **compté** dans les issues, jamais défaut-é), puis `gramsRaw` recalculé via le
  module de l'étape 2 — jamais lu d'un champ du modèle.
- Les DEUX appelants (`generate-meal-v1`, `generate-household-meal-v1`) : si tu ajoutes un
  paramètre aux fonctions partagées, il est REQUIS — le compilateur te listera les
  appelants.
- Bump `MEAL_PROMPT_VERSION`. Après le bump : surveille `rejected_numeric` et les issues
  sur un lot de générations locales (le prompt qui change fait parfois régresser ailleurs —
  le dépôt a déjà payé ça).

### Tests

- un ingrédient complet ⇒ `gramsRaw` recalculé correct (y compris tbsp/tsp, unit via
  `typical_amount`),
- `state` manquant sur du riz ⇒ `null` compté, PAS une valeur devinée,
- `quantity` prose intacte et toujours filtrée par `ENERGY_UNIT_RE`,
- `findNumericTarget` (`week_plan_generation.ts:306`) toujours armé sur titre/méthode/why,
- condition de désarmement : une sortie SANS les nouveaux champs (ancien format) parse
  exactement comme avant, issues en plus.

---

## ÉTAPE 4 — Enveloppes + verdicts, en observation

**Le livrable** : `meal_envelope.ts` + `meal_verdict.ts` (purs), les verdicts **écrits,
jamais actionnés** — aucun retry, aucun changement de consigne, hash de prompt inchangé
pour tous.

### `meal_envelope.ts`

Le type EXACT du design (§2.2) — l'union à deux formes est le mécanisme de sécurité :

```ts
type Envelope =
  | { mode: "per_kg";
      energy: { low: number; high: number } | null;
      proteinFloorG: number;
      proteinPerMealG: number | null;   // non-null ssi 60_plus, muscle_gain ou recomposition
      densityCeiling: number | null; }
  | { mode: "per_portion";
      // AUCUN champ par-kg, AUCUN densityCeiling : l'état illégal est irreprésentable
      proteinPortionPerMeal: true; };
```

`envelopeFor(goal, body, ageBand, restrictionFlag)` — **tous les paramètres requis**
(pas de `steering` dans la signature à cette étape ; l'étape 6 l'ajoutera comme paramètre
requis, ce qui recensera les appelants — c'est voulu, ne le pré-câble pas).

- Sous `restrictionFlag` **OU** corps absent ⇒ `per_portion`, par **UNE SEULE branche**
  partagée (pas deux chemins qui se ressemblent). Test d'indiscernabilité : tout ce qui
  est dérivable de l'enveloppe pour un élève flaggé et pour un élève au corps inconnu est
  identique **par égalité de chaînes** — le statut restriction ne doit être lisible nulle
  part en aval.
- Les bandes par dynamique : le tableau du design §2.2 (fat_loss [M−25 %, M−15 %] plafonné
  à 500 kcal/j — **A1 : le plafond est une constante produit, aucun token pour le
  débrayer** ; muscle_gain [M+5 %, M+10 %] ; etc. — recopie le tableau, chaque valeur en
  constante nommée avec sa référence d'étude en commentaire).
- Planchers protéiques en g/kg selon le tableau ; `proteinPerMealG` non-null uniquement
  pour les trois cas listés (60_plus, muscle_gain, recomposition) — partout ailleurs le
  champ N'EXISTE PAS à `null` près, et aucun paramètre ne le crée.
- Maintenance estimée : Mifflin-St Jeor × 1,5, en INTERNE, avec le régime « direction »
  seulement (verdict au-delà du bord de bande × 1,10) — le régime « bande » fine et le
  ré-ancrage sont à l'étape 8, hors périmètre.
- Lis `meal_body.ts` et `student_age.ts` avant d'écrire : `MealBodyContext` et `AgeBand`
  existent, réutilise-les.

### `meal_verdict.ts`

Le `CompositionVerdict` du design (§2.4) :

- `resolution` : {resolved, total, unresolvedEnergyDense} ;
- abstention avant erreur : résolution <80 % en nombre d'ingrédients OU un seul non-résolu
  de classe dense (matières grasses, fruits à coque, sucres) ⇒ `not_computable` ;
- `protein` : en **grammes calculés** via le référentiel (c'est ce qui distingue « eggs »
  à 6 g d'une vraie ancre) — mais le verdict reste `met`/`under`/`not_computable`, jamais
  un chiffre exporté ;
- `density` : abstention supplémentaire quand la méthode matche un lexique fermé de
  préparations aqueuses (soupes, bouillons, mijotés — EN+FR) ; plafonds ~1,3/~1,8 en
  constantes nommées **avouées comme opérationnelles** (commentaire : calibrées en
  observation, pas des seuils de littérature) ;
- `sentinels.missing` : à l'échelle de la SEMAINE, présence/absence par drapeau booléen
  du référentiel.

### Où écrire les verdicts

Nouvelle table interne `meal_composition_verdicts` (migration : service-role only,
`revoke` immédiat, **réclamée par le lifecycle RGPD** — elle référence des repas d'un
utilisateur) : `user_id`, `meal_id`, le verdict en jsonb, `envelope_mode` **SANS la
raison** (le statut restriction est dérivé à la lecture via
`evaluateRestrictionForStudent` — `restriction_runtime.ts:457` — jamais écrit),
`resolution_coverage`, `unresolved_terms`, `MEAL_PROMPT_VERSION` et la version de doctrine.
Écriture dans `generate-meal-v1` APRÈS le parse, dans un try/catch qui ne fait jamais
échouer la génération (l'observation ne casse pas le produit).

### Tests (`meal_envelope_test.ts`, `meal_verdict_test.ts`)

- le type `per_portion` ne PEUT PAS porter d'énergie (test de compilation : une
  construction illégale ne compile pas — commentaire `@ts-expect-error`) ;
- indiscernabilité flaggé/corps-inconnu par égalité de chaînes ;
- fat_loss : bande plafonnée à 500 kcal/j même pour un grand gabarit (A1) ;
- `proteinPerMealG` null hors des trois cas ;
- abstention : 79 % de résolution ⇒ `not_computable` ; 1 ingrédient dense non résolu ⇒
  `not_computable` même à 95 % ;
- une soupe ⇒ density `not_computable` ;
- protéine : un plat « eggs » sous-dosé ⇒ `under` (le calcul en grammes mord là où la
  présence ne mordait pas) ;
- verdict jamais actionné : la sortie de `parseGeneratedMeal` est IDENTIQUE avec et sans
  le calcul de verdict (égalité profonde).

---

---

# PHASE II — l'armement (ne démarre que si la gate des 80 % est passée)

## ÉTAPE 5 — La boucle de correction

**Le livrable** : un verdict hors bande déclenche **un** retry avec un jeton d'une liste
fermée — les nombres restent dans la boucle, le prompt ne voit que des mots.

### Où intervenir

- Nouveau module pur `meal_correction.ts` : la liste fermée des jetons du design §2.5,
  chaque jeton portant sa phrase anglaise **sans aucun nombre et sans registre de régime** :
  `raise_protein_component`, `lower_added_fat`, `lower_density`, `raise_energy`,
  `lower_energy`, `place_missing_sentinel` (les phrases exactes sont dans le design §2.5 —
  recopie-les telles quelles).
- Le mapping verdict → jeton est **exhaustif à la compilation** (un `switch` sur le
  verdict sans `default`, patron `dishCapFor` à `meal_generation.ts:608`) : un verdict
  nouveau qui n'a pas son jeton ne compile pas.
- Le retry suit le patron `doctrineRetryInstruction` (`doctrine.ts:1127`) : UNE relance,
  et la sortie du retry repasse par **TOUS** les verrous et le même vérificateur — jamais
  une sortie de retry acceptée sur bonne mine.
- `place_missing_sentinel` : le trou devient une **recette placée** (« include <group
  label> once this week »), jamais un mg, jamais un nom de nutriment dans la consigne.
- Préséance adhérence (design §2.4) : aucune correction pour un écart DANS la bande
  d'erreur du calcul, et aucune correction qui sacrifierait une déclaration de l'élève
  (préférence, rythme, contrainte pratique). Ça se code : la correction ne part que si le
  verdict est hors bande ET que le jeton choisi ne contredit aucune contrainte déclarée.
- **Ceinture lexicale nouvelle** : `DIET_REGISTER_LEXICON` (EN+FR : deficit/déficit,
  surplus, cut/sèche, restriction, calorie(s), macro(s)…) + un test qui le passe sur
  **TOUTES les constantes de prose du chantier** (jetons, accents, blocs de consigne).
  C'est le correctif d'un défaut fatal de la revue TCA : `findNumericTarget` mord sur les
  chiffres, pas sur le mot « déficit », et un accent qui parle le langage du régime se
  fait échoer par le modèle dans les `why` visibles. Mute une constante pour prouver que
  le test mord.
- Bump `MEAL_PROMPT_VERSION` si la consigne de base change ; surveille `rejected_numeric`
  et la distribution des verdicts avant/après sur un lot local.

### Tests (`meal_correction_test.ts`)

- mapping exhaustif (le `@ts-expect-error` sur un verdict non mappé),
- aucun jeton ne contient de chiffre ni de mot du lexique (test générique sur la table),
- un seul retry, sortie re-vérifiée par tous les verrous,
- verdict dans la bande d'erreur ⇒ zéro correction,
- correction qui contredirait une préférence déclarée ⇒ jeton non servi, issue nommée.

---

## ÉTAPE 6 — La méthode du coach, rendue exécutable + le pilotage maison

**Le livrable** : le coach répond à une question de doctrine dans SES mots ; la publication
en dérive des jetons exécutables ; la philosophie de Sophia devient une doctrine maison
publiée au même format. **Le coach ne voit jamais un axe du moteur** (§3.0 du design).

### Le modèle de données

- Migration : colonne `composition_steering jsonb NOT NULL DEFAULT '[]'` sur
  `coach_doctrines` (même mouvement que `dailyPractices` — regarde comment
  `20260808190000_house_daily_practices.sql` l'a fait).
- Le schéma `SteeringEntry` du design §3.1, EXACTEMENT — avec les décisions encodées dans
  le type : `deficit_style: "gentle" | "standard"` (**A1 : pas de token aggressive, c'est
  l'asymétrie voulue avec `surplus_style` qui, lui, a son `"aggressive"`**),
  `"protein" ∈ off` illégal (validation de publication bruyante), une seule grandeur
  primaire par objectif, `carb_timing` rejeté hors `performance` (compté, dit à l'écran).
- Parse strict dans `parseCoachDoctrine` (`doctrine.ts`) : entrée malformée écartée ET
  comptée, jamais un repli silencieux.
- **EXCLU de `compileDoctrineBlock`** (patron `dailyPractices`, `doctrine.ts:307-320`) :
  le hash du bloc chat doit être inchangé pour toute la base. Le test d'empreinte de cache
  existant doit rester vert octet pour octet (cherche le test du hash dans
  `doctrine_test.ts` / `doctrine_versions.ts`).

### La surface coach (frontend, `/coach/doctrine`)

- La question se pose comme un **débat du point de départ** (patron `STARTER_FORKS`,
  `doctrine_starter.ts`, consommé par `frontend/src/keel/api/coachDoctrine.ts`) : « sur
  quoi pilotes-tu une assiette ? qu'est-ce que tu refuses de compter ? » — des POSITIONS
  en langage coach, jamais des axes du moteur.
- Chaque position affiche **ce qu'elle produit** en langage plan/aliment (« avec cette
  réponse, la protéine porte au moins un quart de l'énergie du plan ; tes élèves ne
  verront jamais ce chiffre »). La règle zéro-chiffre est un plancher face à l'ÉLÈVE, pas
  une raison d'aveugler l'auteur d'une méthode.
- La publication écrit DEUX choses (design §3.2) : une `DoctrineBelief` ordinaire (citable,
  elle entre dans le bloc chat) et l'entrée de steering qui pointe vers elle par
  `belief_key`. Le moteur ne lit que le jeton ; le chat ne lit que la conviction. AUCUN
  parseur de prose, nulle part. `belief_key: null` ⇒ le moteur exécute, le chat n'invente
  rien.

### Le branchement moteur

- `applyPiloting(steering, envelope, restrictionFlag)` — fonction PURE, paramètres requis.
  Sous flag : le steering est **écrêté, jamais rerouté** — les axes `energy` et
  `proportions` n'ont structurellement rien à piloter (le type `per_portion` ne porte pas
  les champs), le reste survit tel quel. La dégradation vit DANS la fonction, jamais chez
  l'appelant.
- `steeredFocus(goal, steering)` **enveloppe** `focusFor` (`week_plan_generation.ts:231`,
  patron `weekEmphasis` de `student_body.ts`) — `focusFor` reste intouchée et testée là où
  elle est. Condition de désarmement par égalité de chaînes : coach sans steering ⇒
  consigne identique au caractère près à la baseline sans-steering de la même
  `MEAL_PROMPT_VERSION`.
- `envelopeFor` gagne `steering` comme paramètre REQUIS (c'est maintenant, pas à
  l'étape 4) — le compilateur recense les appelants.
- L'axe `micro_coverage` consomme les `FrequencyRule` **existantes** de
  `coach_food_items` (`food_items.ts:97`) : « saumon ≥2/semaine » devient vérifiable en
  comptant les occurrences dans le plan — zéro schéma coach nouveau.
- **Le pilotage maison** : publié comme entrée de steering sur la ligne `coach_doctrines`
  du coach maison existant (`doctrine_delegation.ts:30`) — même format, un seul chemin de
  code, la version part dans `generated_from`. **A2** : la table de cadences maison
  (contenu) ne s'applique qu'aux élèves du coach maison ; la détection sentinelle
  (mécanisme) s'applique partout — deux structures distinctes, la frontière lisible dans
  le code.
- La hiérarchie de préséance complète est celle du design §3.6 — encode-la dans l'ordre
  d'application de `applyPiloting` et teste chaque étage.

### Tests

- bloc chat octet-identique avant/après pour un coach avec et sans steering,
- `"protein" ∈ off` ⇒ erreur de publication bruyante,
- `deficit_style: "aggressive"` ne compile pas (`@ts-expect-error`),
- sous flag : steering énergie/proportions sans prise, le reste survit ; l'écrêtage est
  indiscernable du cas corps-inconnu (égalité de chaînes),
- coach muet ⇒ ordre mécanique de Sophia, aucune conviction maison citée (A2),
- `carb_timing` hors performance ⇒ rejeté, compté, visible à l'écran coach,
- entrée malformée dans le jsonb ⇒ écartée et comptée, le reste de la doctrine vit.

---

## ÉTAPE 7 — La résolution foyer

**Le livrable** : l'algorithme du design §4.1, dans la lane foyer existante
(`generate-household-meal-v1`, `household_portions.ts`).

### Dans l'ordre de l'algorithme

1. **Verrou de lane d'abord** : si UN membre du foyer est sous `restriction_flag`
   (`evaluateRestrictionForStudent`, `restriction_runtime.ts:457`), la lane foyer ENTIÈRE
   passe en `per_portion` — aucune enveloppe, aucun delta dimensionné, directions de
   service qualitatives existantes seulement. Le tronc qu'une personne flaggée mange ne
   peut pas être dimensionné sur les enveloppes de déficit d'autrui.
2. **Membre de référence** : colonne DÉCLARÉE à la configuration du foyer (migration sur
   la table foyer — `20260810120000_household_member_identity.sql` te montre les tables) ;
   défaut quand non déclaré : **le membre qui compose la session** (geste visible de tous,
   aucune fuite). JAMAIS dérivé d'une métrique ni d'un ordre d'objectifs — c'était un
   défaut fatal TCA : l'objectif d'un membre deviendrait inférable à table. Un mineur
   n'est jamais référent.
3. **Sécurité du tronc** : union des contraintes médicales de TOUS + union des
   `forbidden` de toutes les doctrines gouvernantes. Les `discouraged` d'une doctrine
   non-référente ne gouvernent PAS le tronc (opinions ≠ interdits) — elles gouvernent les
   add-ons de leur propre membre. Le verrou de sortie tourne N fois sur le tronc (une par
   doctrine distincte). Tronc incomposable ⇒ refus nommé `household_trunk_unsatisfiable`,
   message qui nomme des ALIMENTS, jamais des membres, des coachs ni des objectifs.
4. **Le tronc** : dimensionné dans le MOTEUR (jamais dans le prompt — le corps reste
   `null` dans la lane foyer, contrainte existante de `generate-household-meal-v1`) sur le
   **MIN des enveloppes adultes calculables**. Un adulte sans enveloppe = « portion
   standard », jamais une portion réduite. Zéro enveloppe calculable = cas NOMINAL : le
   tronc se compose comme aujourd'hui, structure seulement. Sentinelles vérifiées au
   niveau du tronc (couvertes là = couvertes pour tous).
5. **Deltas additifs** : catalogue fermé `{ food_ref, grams, moment: "cooking"|"plating" }`
   — des grammes d'ALIMENT, structurés, sans prose à assainir. **A3 : PAS de slot de
   dressage** — seulement (a) « plus du même » et (b) « accompagnement usuel servi à
   part ». ET l'instrumentation qui décide de la 2e itération : l'écart résiduel entre
   enveloppe cible et enveloppe atteinte par membre, écrit dans la table de verdicts
   (étape 4) — sans elle, la décision d'ajouter le slot se prendra à l'aveugle.
6. **Vérification par membre** : le verrou de sortie tourne sur tronc+deltas(M) dans le
   contexte doctrinal de M — l'add-on d'un membre ne peut pas contenir un aliment que SON
   coach interdit. Fréquence insatisfiable d'une doctrine non-référente ⇒ compteur agrégé
   dans la synthèse de son coach, JAMAIS nominatif.

### Mineur et confidentialité

- Mineur : `goal: null` par construction (`student_age.ts`, jamais de lecture de
  `student_goals`), aucune enveloppe, aucun delta dérivé d'un objectif. Les add-ons
  énergétiques (féculents) se rendent en **service familial** (plat au centre, chacun se
  sert) quand un mineur est à table.
- `sanitizePortionNote` (`household_portions.ts`) reste la ceinture sur TOUTE prose de
  portion — mode audit, mise à `null`, jamais de réécriture.
- Ne sortent JAMAIS, sur aucune surface foyer : la raison d'un delta, l'objectif d'un
  membre, un différentiel lisible, toute mention de corps ou de flag. Aucun comparatif
  entre assiettes, nulle part.

### Tests

- un membre flaggé ⇒ toute la lane en `per_portion` (et le résultat est indiscernable
  d'un foyer sans aucune enveloppe calculable — égalité de chaînes),
- MIN des enveloppes : l'adulte sans enveloppe compte « standard », jamais réduit,
- union des `forbidden` ; `discouraged` non-référent sans prise sur le tronc,
- `household_trunk_unsatisfiable` ne nomme ni membre ni coach ni objectif (test sur le
  texte du message),
- add-on d'un membre vérifié contre SA doctrine,
- mineur : aucun chemin ne lit `student_goals`, rendu en service familial,
- l'écart d'enveloppe par membre est écrit (l'instrumentation d'A3 existe).

---

## ÉTAPE 8 — Sentinelles, plancher de couverture, ré-ancrage

**Le livrable** : la boucle se ferme — les trous se détectent à la semaine, le plancher
protège les plans légers, la maintenance estimée se recale sur l'observé.

### Où intervenir

- **Sentinelles à l'échelle semaine** : zéro occurrence d'un groupe sentinelle sur la
  semaine = trou = le jeton `place_missing_sentinel` (étape 5) est servi à la génération
  suivante ou au retry. Présence/absence par les drapeaux booléens du référentiel, jamais
  des mg.
- **Plancher de couverture (~1550 kcal)** : si l'énergie DU PLAN (calculée depuis les
  recettes — côté plan, donc armé même en `per_portion`) passe sous ~1500-1600 kcal/j,
  les fréquences sentinelles deviennent contraintes dures dans la boucle de correction.
  Non satisfaisable après correction ⇒ **le plan sort quand même** ; drapeau
  `coverage_unsatisfiable` vers le coach au niveau doctrine/dynamique, JAMAIS nominatif.
  Fail-closed sur la prétention : `coverage_unverified` quand non calculable, jamais un
  vert par défaut. Le plancher ne fait qu'AJOUTER de la couverture — direction
  protectrice, jamais restrictive.
- **Ré-ancrage** : `recalibration: "observed_trend" | "static"` (champ du steering,
  défaut `observed_trend`). Mécanique : `trendOf` (`student_body.ts`, seuils de bruit
  1 kg / 2 cm existants) ; tendance contraire à la direction attendue pendant ≥3 semaines
  ⇒ décalage du centre de la bande de 5 %, cumul plafonné à 10 %, jamais sous le plancher
  de couverture. L'effet apparaît en AGRÉGÉ dans la synthèse coach — jamais par élève.
- **A4 — k=5** : tout agrégat coach dérivé de verdicts porte le plancher d'anonymat,
  y compris les compteurs d'apparence inoffensive (l'inférence par soustraction est le
  défaut visé : deux agrégats dont la différence isole un élève). Les élèves sous flag
  sont absents des agrégats dérivés d'enveloppes SANS trou étiqueté.
- La boucle avec le bilan hebdo existant : le chantier week-review (fiche + mémoire du
  dépôt) interroge les écarts d'exécution — c'est lui qui alimente `trendOf` en aval, ne
  le duplique pas.

### Tests

- une semaine sans aucun groupe `omega3_marine` ⇒ trou détecté ⇒ jeton servi,
- plan à 1400 kcal/j calculées ⇒ fréquences durcies ; insatisfiable ⇒ plan sorti + drapeau
  doctrine/dynamique (jamais un nom),
- `coverage_unverified` quand la résolution ne permet pas de calculer (jamais vert par
  défaut),
- décalage borné : 3 semaines contraires ⇒ 5 %, 6 semaines ⇒ 10 % et pas plus, jamais
  sous le plancher,
- k=5 : un agrégat à 4 élèves ne sort pas ; deux agrégats dont la soustraction isolerait
  un élève ne sortent pas ensemble,
- `static` ⇒ zéro recalage, sortie identique (égalité de chaînes).

---

## 5. Vérification finale et rapport

1. `deno test` complet sur `supabase/functions/_shared/keel/` (pas de `--no-check` — le
   dépôt a déjà payé des erreurs de type masquées).
2. `npx tsc -p frontend/tsconfig.app.json --noEmit` (des modules `_shared` sont importés
   par le front via `coachDoctrine.ts` — un import Deno ajouté au mauvais endroit casse le
   front, et c'est le bon moment pour l'apprendre).
3. Run réel local : redémarre le runtime edge d'abord (cache `_shared` périmé sinon),
   génère quelques repas sur une fixture AVEC plan publié (sans plan publié, aucun effet
   KEEL n'existe — piège connu), vérifie : l'ancre protéique dans la sortie, les verdicts
   écrits en base, zéro régression sur `rejected_numeric`.
4. Rejeu de l'étape 2 : le chiffre de couverture médiane, la worklist d'alias.
5. Commits : un par étape, message français descriptif en minuscules (style du dépôt),
   jamais de push/deploy/db push — le propriétaire s'en charge.
6. Rapport de PHASE dans `scratchpad/RAPPORT-UNITES-COMPOSITION.md` : un rapport à la fin
   de chaque phase. Fin de phase I : ce qui est livré étape par étape, l'avant/après de
   l'ancre protéique, la couverture de résolution et son verdict vis-à-vis de la gate des
   80 %, la worklist d'alias — et si la gate ne passe pas, c'est la FIN du run, en le
   disant. Fin de phase II : distribution des verdicts et des jetons servis, l'état des
   drapeaux coach, l'écart d'enveloppe par membre (l'instrumentation d'A3), ce que tu n'as
   PAS fait et pourquoi.
7. En phase II, les suites front s'ajoutent : `npm test` dans `frontend/` et une passe de
   vérification visuelle de l'écran doctrine (la question de méthode + l'effet des
   positions) — c'est la seule surface visible du chantier.

## 6. Les interdits absolus de ce chantier

- Aucun chiffre d'énergie/macro/mesure **sur la personne**, dans aucune surface, aucun
  prompt, aucun message d'erreur, aucun log lisible par l'élève. Côté coach : le sens de
  ses positions en langage plan/aliment, jamais un chiffre sur un élève.
- Aucun verdict qui bloque : seul le verrou de sécurité existant vide un repas (et le
  refus foyer `household_trunk_unsatisfiable`, qui nomme des aliments, jamais des gens).
- Aucune branche « élève maigre », aucun IMC, aucune catégorie de corps : non mesurable =
  non écrit.
- **`supabase db reset` : jamais, sous aucun prétexte** — ni toi, ni en le demandant au
  propriétaire. `supabase migration up` ou psql. Tes migrations sont écrites pour être
  ré-appliquables (`if not exists`, `drop ... if exists` avant `add`).
- Aucun pré-câblage en avance de phase : chaque étape pose exactement ce qu'elle utilise.
- La phase II ne démarre JAMAIS si la gate des 80 % n'est pas passée — quelle que soit la
  tentation de « continuer pendant qu'on y est ».
- Le coach ne voit jamais un axe du moteur ; sa surface est sa doctrine (§3.0 du design).
- Ne supprime rien du legacy 1:1 (`plan_versions`, `/coach/import`) : gardé exprès.
