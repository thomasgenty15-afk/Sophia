# Prompt — La doctrine du coach tient-elle, du chat jusqu'à l'assiette ?

> À donner à un agent, en une fois. Run long, autonome.

---

Tu travailles sur **Sophia/KEEL**, dépôt `/Users/ahmedamara/Dev/Sophia 2` :
app de planification de repas (Supabase local + edge functions Deno + React).

## 1. La question à laquelle ce run répond

**Un coach écrit une philosophie et des aliments recommandés. Est-ce que ça
tient — dans ce que Sophia RÉPOND, et dans ce que le générateur COMPOSE ?**

Deux surfaces, la même doctrine :

| Surface | Ce qu'on vérifie |
|---|---|
| **Le chat** | les réponses portent la position du coach, pas une nutrition générique |
| **La génération de plan** | les plats composés respectent les aliments encouragés et **n'incluent jamais** les exclus |

⚠️ **CE QUE CE RUN NE TESTE PAS** : l'adéquation du plan à la personne. Les cinq
élèves sont provisionnés **avec exactement les mêmes informations** (même
objectif, même foyer, même rythme, mêmes contraintes). **C'est voulu** : on
neutralise la variable « utilisateur » pour que **la seule** différence entre
cinq résultats soit la doctrine. Un écart entre deux élèves ne peut donc venir
que de la doctrine — c'est ce qui rend ce run concluant.

## 2. Le cadre QA — obligatoire, et il prime

**Lis `docs/agent-playbook/New/test-material/14-qa-test-guidelines.md` en entier
avant de commencer**, ainsi que `01-qa-run-report-structure.md` et
`familly-bugs.md` (pour les familles `BF-*`). Ce qui en découle et qui n'est pas
négociable :

- **Run IA réel**, chemin local : `POST /functions/v1/test-send-message` avec
  `force_full_ai: true` dans le corps, ou l'entrée produit `chat-inbound-v1`.
  Jamais un renderer déterministe ni un `processMessage` direct pour fabriquer
  un succès.
- **Pilotage tour par tour.** Chaque message est choisi **après lecture** de la
  réponse précédente. **Aucune liste fermée de messages pré-écrits.** Les cinq
  intentions ci-dessous sont des **intentions de test**, pas des phrases à
  rejouer — et surtout pas mot pour mot d'un coach à l'autre (le cadre l'interdit
  explicitement).
- **Un verdict `green` / `yellow` / `red` par tour**, et pour chaque `yellow` ou
  `red`, la famille `BF-*`.
- **La vérité est en base, jamais dans la réponse HTTP.**
- **Ne jamais afficher un JWT.** Mot de passe des personas locaux : `1234567`.
- **Interdits** : commandes de reboot (`supabase restart/stop`) — s'il y a un
  problème de pile, **tu arrêtes le run et tu le signales** ; corriger du code
  pendant un run ; staging/remote/deploy.
- **Rapport obligatoire** : sans rapport exploitable, le run ne compte pas.

## 3. L'état du dépôt — vérifié le 2026-08-12, réutilise, ne réinvente pas

### Où vit une doctrine

| Table | Ce qu'elle porte |
|---|---|
| `coach_doctrines` | `beliefs`, `forbidden`, `vocabulary`, `arbitrations`, `voice`, `foods`, `composition_steering`, `composition_positions`, `activity_stance`, **`compiled_prompt`**, `compiled_prompt_hash`, `published_at` |
| `coach_food_items` | l'aliment NOMMÉ : `food_item_ref`, `label`, `stance`, `frequency_template`, `direction`, `amount`, `amount_unit`, `period`, `cutoff_local`, `slot_key`, `why` |
| `coach_food_rules` | le GROUPE : `food_group_ref`, `stance`, `goal_scope`, `rationale` |

Vocabulaires **fermés** (CHECK en base — une valeur hors liste est refusée) :
- `stance` : `encouraged` · `discouraged` · `excluded`
- `frequency_template` : `amount_per_period` · `every_meal` · `not_after` · `at_slot`
- `direction` : `at_least` · `at_most` · `amount_unit` : `portion` · `g` · `ml` · `unit` · `period` : `day` · `week`
- `goal_scope` ⊆ `fat_loss` `muscle_gain` `recomposition` `performance` `health` `maintenance`
- ⚠️ `coach_food_items_slots_match_frequency` : chaque `frequency_template`
  **impose exactement** quelles colonnes sont remplies et lesquelles doivent
  rester `NULL`. Lis ce CHECK avant d'écrire, il refusera tout à-peu-près.
- ⚠️ `coach_food_rules.food_group_ref` est une **clé étrangère** vers
  `food_groups.slug`. **Liste les slugs existants** avant d'écrire une règle ;
  n'invente pas un groupe.

### 🔴 LE PIÈGE N°1 — une doctrine écrite à la main ne DIT RIEN

`doctrine_loader.ts:355` sélectionne **`compiled_prompt`**. C'est
`compileDoctrineBlock` — appelé par `coach-doctrine-v1` à la publication
(`index.ts:663`, `:797`, `:380-381`) — qui le remplit.

**Une ligne `coach_doctrines` insérée en SQL avec `published_at` mais sans
`compiled_prompt` se charge sans erreur et n'injecte AUCUNE position.** Le run
serait alors entièrement faux, et vert d'apparence : cinq coachs indistinguables
parce qu'aucun n'a de voix.

→ **Publie par le chemin réel** (`coach-doctrine-v1`), ou, si tu écris en base,
appelle `compileDoctrineBlock` toi-même et renseigne `compiled_prompt` **et**
`compiled_prompt_hash`. **Puis prouve que le bloc est non vide et différent d'un
coach à l'autre** avant de lancer le moindre tour. C'est ton étape 0.

### Par où passe une génération de 4 jours

`POST /functions/v1/generate-meal-v1`, corps :
`{ mode, window: { kind: "days", count: 4 }, servings, ... }`.
`readWindowRequest` (`generate-meal-v1/index.ts:227`) accepte `until_sunday`,
`days` (avec `count`) et `exact` (`starts_on` + `duration_days`). Le résultat
atterrit dans `student_generated_meals` (`scope`, `mode`, `dishes`,
`preparations`, `cooking_sessions`, `starts_on`, `duration_days` — ⚠️ `ends_on`
est **générée**, ne l'insère pas).

`generate-week-plan-v1` lit la doctrine par `doctrineBeliefsFor` /
`doctrineBlockFor` et `loadDoctrineForCaller`. Les logs edge portent
`keel.doctrine.variant` avec `reason`, `beliefs_kept`, `arbitrations_kept` —
**c'est ta preuve que la doctrine est bien entrée dans la génération**, et un
`reason: "no_published_doctrine"` te dit immédiatement que ton montage est faux.

## 4. Les cinq doctrines — des partis PRIS, et volontairement contradictoires

Elles doivent être **fortes et mutuellement incompatibles** : c'est ce qui rend
une fuite visible. Si le coach n°2 et le coach n°3 produisent la même réponse,
la doctrine ne s'applique pas — et on le voit sans interprétation.

| # | Le parti pris | Encouragé | Exclu | Ce qu'il contredit |
|---|---|---|---|---|
| **D1** | **Jeûne du matin** — premier repas à midi, la matinée se passe à jeun | café noir, eau | tout aliment au petit-déjeuner (`not_after` / `at_slot` à l'appui) | D5 (qui charge le matin) |
| **D2** | **Tout animal** — la protéine animale à chaque repas, les féculents sont accessoires | viande rouge, œufs, abats, poisson gras | légumineuses, céréales | D3, frontalement |
| **D3** | **Végétal strict** — aucune chair animale, la légumineuse est la base | légumineuses, tofu, céréales complètes | viande, poisson, charcuterie | D2, frontalement |
| **D4** | **Zéro ultra-transformé** — tout est fait maison, rien d'industriel | brut, légumes, produits non transformés | plats préparés, produits industriels | D1 et D5 sur le fond, aucun sur la forme |
| **D5** | **Soir minimal, matin chargé** — dîner très léger, l'essentiel se mange tôt | petit-déjeuner copieux, soupe et légumes le soir | repas lourd après une heure de coupure (`not_after` avec `cutoff_local`) | D1, frontalement |

**Chaque doctrine porte AU MOINS** : deux `beliefs` explicites, une `arbitration`
(que faire quand deux règles se contredisent), un `voice` (la langue de réponse —
tu peux tout faire en `fr-FR`), **deux `coach_food_items` `encouraged`** et
**deux `excluded`**, et **une `coach_food_rules` de groupe**.

⚠️ **Écris des positions, pas des étiquettes.** « Végétarien » est un mot ;
« aucune chair animale, la légumineuse porte la protéine de chaque repas » est
une position que le générateur peut appliquer et que le chat peut citer.

## 5. Le déroulé

### Étape 0 — le montage, et sa PREUVE

1. Cinq coachs, cinq doctrines publiées **et compilées** (voir le piège n°1).
2. **Preuve à produire avant tout tour** : pour chacun, `compiled_prompt` non
   vide, et les cinq blocs **différents deux à deux**. Cite les longueurs et un
   extrait de chacun dans le rapport.
3. Cinq élèves, **un par coach**, `is_test_persona: true`, `locale` **écrite
   explicitement** (le défaut en base est `fr-FR` — une fixture qui l'omet ment
   sur la langue), `timezone`, `country`, `coach_clients` actif, **plan publié**.
   ⚠️ Plafond : **3 élèves par coach** — ici un seul chacun, donc pas de souci.
4. **Informations utilisateur RIGOUREUSEMENT IDENTIQUES** entre les cinq :
   même objectif, même rythme déclaré, mêmes contraintes, même foyer, mêmes
   mesures. Consigne la valeur exacte de chaque champ dans le rapport — c'est ce
   qui permet d'attribuer tout écart à la doctrine.

### Étape 1 — cinq questions d'affilée, par coach (25 tours minimum)

Cinq **intentions**, dans le même ordre pour les cinq coachs, **reformulées à
chaque fois** et choisies après lecture de la réponse précédente :

1. **Une idée de petit-déjeuner.** (D1 doit refuser ou renvoyer au jeûne ; D5
   doit charger ; les autres doivent rester eux-mêmes.)
2. **« Comment je mets assez de protéines ? »** (D2 et D3 doivent diverger
   radicalement.)
3. **Un aliment que SA doctrine exclut nommément** — « je peux manger X ? ».
   C'est le test le plus direct : le refus doit être *motivé par la position du
   coach*, pas par une règle nutritionnelle générique.
4. **Un dîner rapide ce soir.** (D5 doit alléger ; D4 doit refuser l'industriel.)
5. **Une question de fond** — « pourquoi tu me dis ça ? », « c'est quoi ta
   logique ? ». La **voix** et les **beliefs** doivent apparaître.

**À chaque tour, mesure et consigne :**
- la réponse exacte ;
- le verdict `green` / `yellow` / `red` (+ famille `BF-*` si non vert) ;
- la trace courte (`handled_by` ou `delivery_reason`, `response_owner`) ;
- **le log `keel.doctrine.variant`** : `reason`, `beliefs_kept`,
  `arbitrations_kept`. Un `beliefs_kept: 0` sur un coach qui a trois convictions
  est un **rouge**, même si la réponse « a l'air » bonne.

**Rejoue chaque intention 3 fois** sur au moins un coach : le dispatcher est
stochastique (mesuré `[0,3,3,0]` sur une phrase identique). Un échec sur trois
est un RED, pas un flake.

### Étape 2 — deux générations de 4 jours

Sur **deux coachs aux doctrines opposées** (recommandé : **D2 et D3**, la
contradiction est totale et l'écart est donc lisible sans interprétation) :

`POST /functions/v1/generate-meal-v1` avec `window: { kind: "days", count: 4 }`.

**Ce que tu mesures dans `student_generated_meals.dishes` :**
- **aucun aliment `excluded`** de cette doctrine n'apparaît — c'est le critère
  dur, et une seule occurrence est un `red` ;
- les aliments `encouraged` **apparaissent réellement**, et pas une fois par
  politesse : donne le compte par jour ;
- les deux plans, **à informations utilisateur identiques**, sont
  **substantiellement différents**. S'ils se ressemblent, la doctrine n'a pas
  été appliquée — quel que soit le contenu de chacun pris isolément ;
- le log `keel.doctrine.variant` du tour de génération : `reason` doit être un
  vrai chargement, **jamais `no_published_doctrine`**.

### Étape 3 — l'angle adversarial (écris tes hypothèses AVANT de tester)

Au minimum :
- **La fuite entre coachs.** L'élève de D3 (végétal) reçoit-il jamais une
  position de D2 ? Cherche activement dans les 25 tours.
- **La doctrine générique.** Une réponse qui serait valable pour n'importe
  quel coach est un `yellow` : la doctrine n'a rien changé.
- **L'exclu qui rentre par la porte de derrière.** Demande une recette qui
  contient naturellement l'aliment exclu, sans le nommer (« un couscous »
  chez D2 qui exclut les céréales). La garde tient-elle sur l'implicite ?
- **La contradiction interne.** Pose une question qui oppose deux règles du même
  coach et regarde si l'`arbitration` sert à quelque chose.
- **Le silence.** Un coach sans position sur le sujet demandé : Sophia
  invente-t-elle une position, ou reste-t-elle neutre ? Inventer est un `red`.

## 6. Les règles du dépôt

1. **Branche courante** — n'en change pas, n'en crée pas, **ne pousse rien**.
2. **`git add -A` est INTERDIT** : ~200 fichiers appartiennent à d'autres
   sessions qui travaillent **en parallèle de toi**. Vérifie
   `git status --porcelain -- <chemin>` avant d'écrire dans un fichier partagé ;
   s'il est déjà sale, consigne ce qu'il aurait fallu y faire et continue.
3. **`supabase db reset` : JAMAIS**, même local. La base est partagée.
4. **Code edge modifié → `docker restart supabase_edge_runtime_Sophia_2`**, et
   ⚠️ **ce restart casse le DNS de Kong** : relance
   `./scripts/local_extend_kong_functions_timeout.sh` **après**, sinon 503 puis
   502. (Tu ne devrais pas avoir à modifier de code — c'est un run.)
5. **Tests Deno avec l'environnement purgé**, sinon 114 faux rouges :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test …`
6. **Toute sonde distingue « erreur » de « vide ».** Jamais de `?? []` sur un
   retour Supabase sans avoir testé `error` : une requête sur un nom de colonne
   inexistant a déjà fait conclure « 0 ligne » sur des cas qui en écrivaient
   trois. Vérifie tes noms de colonnes (`\d <table>`) avant d'écrire la sonde.
7. **Fixtures préfixées et nettoyées en fin de run** (autorisation explicite du
   cadre pour le reset de fin).
8. **Un RED se consigne, il ne se re-run pas jusqu'au vert.**

## 7. Ce que tu rends

`docs/agent-playbook/New/test-material/qa-run-reports/<date>-doctrine-5-coachs.md`,
à la structure de `01-qa-run-report-structure.md`, **plus** :

- **le tableau des cinq doctrines** : le parti pris, les aliments encouragés et
  exclus, et la **preuve de compilation** (longueur du `compiled_prompt`, extrait) ;
- **la table des informations utilisateur**, identique aux cinq, champ par champ ;
- **la matrice 5 coachs × 5 intentions** : un verdict par case, lisible d'un
  coup d'œil ;
- **les deux plans de 4 jours** côte à côte, avec le compte d'aliments encouragés
  et exclus par jour ;
- **le verdict sur la question centrale** : la doctrine s'applique-t-elle, dans
  le chat et dans l'assiette ? Réponds en une phrase, puis justifie ;
- une **feuille de bugs** dans `run-bug-sheets/` si un seul tour est `yellow` ou
  `red`.

Si un montage se révèle faux en cours de route (doctrine non compilée, élèves
pas identiques, `no_published_doctrine`), **dis-le, refais le montage, et
n'utilise pas les tours produits avant la correction** — le cadre interdit de
mélanger des essais ratés avec le run final.

**Termine ta réponse par un résumé de 12 lignes maximum** : le montage, le
nombre de tours, la matrice en une ligne, les rouges, et la réponse à la question
centrale.
