# Lot 8 — rapport de vérification

**Chantier** : `docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`, § « Lot 8 — Corriger
le banc et prouver la chaîne sans nouvelle grande campagne ».
**Date** : nuit du 2026-09-10 au 2026-09-11.
**Dépôt** : `/Users/ahmedamara/Dev/Sophia 2`, branche `ff-001-quotidien-du-coach`.
**Rien n'est commité.**

> ⛔ **À LIRE EN PREMIER — CE QUI EST PROUVÉ, ET CE QUI NE L'EST PAS.**
>
> **Amendé le 2026-09-11 au matin.** La première version de ce rapport disait
> « aucune génération réelle, zéro appel modèle ». **Ce n'est plus vrai** : le
> propriétaire a demandé de traiter le point ③ de la relecture extérieure (« la
> priorité de test manquante est l'intégration du parcours complet »). Trois
> générations réelles ont été lancées contre la pile locale.
>
> **Ce qui est prouvé maintenant** : une requête réelle, par le vrai handler,
> jusqu'à la ligne écrite, **pour une personne** — et les sept refus
> d'admission, à vide, en une seconde (§ 1 bis).
>
> **Ce qui est prouvé aussi** : le même parcours **pour un foyer de deux
> bouches**, jusqu'à la ligne écrite (cinq tirs au total).
>
> **La dette qui reste** : **la durée est instable — 59 s à 144 s sur le même
> chemin — et sa queue dépasse le plafond de 150 s de l'hébergé.** Un tir sur
> cinq a été coupé. Ce n'est pas une question de taille de foyer (§ 4 bis).

---

## 1. Le compte, vérifiable commande par commande

| Famille du tableau § 8 | Fichier | Cas | Verdict |
|---|---|---|---|
| Identité / SQL | `supabase/functions/_shared/keel/lot8_identite_test.sql` | 39 | ✅ 39 verts · 0 échec |
| Autorisation (base) | `…/lot8_autorisation_test.sql` | 32 | ✅ 32 verts · 0 échec |
| Autorisation (décision) | `…/lot8_autorisation_test.ts` | 7 | ✅ 7 · 0 |
| Parité N = 1 | `…/lot8_parite_n1_test.ts` | 11 | ✅ 11 · 0 |
| Corps / énergie | `…/lot8_corps_energie_test.ts` | 14 | ✅ 14 · 0 |
| Allocation | `…/lot8_allocation_test.ts` | 10 | ✅ 10 · 0 |
| Densité | `…/lot8_densite_test.ts` | 12 | ✅ 12 · 0 |
| Mesure / service | `…/lot8_mesure_service_test.ts` | 16 | ✅ 16 · 0 |
| Réparations | `…/lot8_reparations_test.ts` | 8 | ✅ 8 · 0 |
| Banc | `scratchpad/2026-09-10-LOT8-BANC/test_banc.py` | 29 | ✅ 29 · 0 |

**Total : 178 cas neufs, 0 échec.**

### Comment vérifier

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"

# Les sept familles TypeScript
deno test --allow-all supabase/functions/_shared/keel/lot8_parite_n1_test.ts
deno test --allow-all supabase/functions/_shared/keel/lot8_corps_energie_test.ts
deno test --allow-all supabase/functions/_shared/keel/lot8_allocation_test.ts
deno test --allow-all supabase/functions/_shared/keel/lot8_densite_test.ts
deno test --allow-all supabase/functions/_shared/keel/lot8_mesure_service_test.ts
deno test --allow-all supabase/functions/_shared/keel/lot8_reparations_test.ts
deno test --allow-all supabase/functions/_shared/keel/lot8_autorisation_test.ts

# Les deux suites SQL — vraie base locale, transaction ANNULÉE
docker cp supabase/functions/_shared/keel/lot8_identite_test.sql \
  supabase_db_Sophia_2:/tmp/t.sql && \
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

docker cp supabase/functions/_shared/keel/lot8_autorisation_test.sql \
  supabase_db_Sophia_2:/tmp/t.sql && \
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

# Le banc (hors gate, volontairement : scratchpad n'est pas du code de production)
python3 scratchpad/2026-09-10-LOT8-BANC/test_banc.py
```

### La suite complète du dépôt

```bash
deno test --allow-all supabase/functions/_shared/keel/
```

**Résultat attendu : `6407 passed | 2 failed`.**

Les **2 rouges sont antérieurs au chantier** et prouvés tels contre `HEAD`
(`scratchpad/2026-09-10-MOTEUR-UNIQUE/00-etat-de-depart.md`) :

| Test rouge | Cause |
|---|---|
| `cooking_style_brief_test.ts:70` | `maxFridgeDays` requis et absent du décor — le champ n'existe pas à `HEAD` |
| `household_merge_quota_test.ts:190` | 5 portes de sortie entre la réclamation et la dépense ; **même mesure à `HEAD` : 1** |

⚠️ Aucun des deux n'a été ajouté à une liste de tolérance. Leur cause est du
travail non commité d'autres sessions, et une tolérance écrite pour un travail
en vol a la durée de vie de ce travail.

---

## 1 bis. La famille « intégration » — ajoutée le 2026-09-11

`supabase/functions/_shared/keel/lot8_integration_handler_test.ts`

**Pourquoi elle existe.** Le lot 1 était éprouvé de deux façons, et aucune ne
touchait la fonction : le résolveur en test **pur**, puis des **recherches de
chaînes** dans `index.ts`. Un test qui lit du texte source reste vert si la
ligne existe et ne s'exécute jamais. Ici on **POSTE** sur
`/functions/v1/generate-household-meal-v1`, avec un vrai jeton signé par
l'instance, et on lit le vrai refus.

| | Cas | Résultat |
|---|---|---|
| ① | un compte créé à l'instant porte **déjà** son foyer personnel | ✅ le lot 1, mesuré sur un compte qui vient de naître |
| ② | une personne seule franchit l'admission (N = 1) | ✅ |
| ③ | sans jeton d'utilisateur | ✅ 401 |
| ④ | un second compte réclame une bouche (`invite` → `join`, les RPC du produit) | ✅ |
| ⑤ | le membre secondaire compose | ✅ **403 `not_owner`** |
| ⑥ | **foyer gelé : le maître lit 402, le membre lit 403** | ✅ |
| ⑦ | dégelé, le maître d'un foyer pluriel passe (N > 1) | ✅ |
| ⑧ | N = 1, **jusqu'à la ligne écrite** | ✅ 200, plan écrit, contenu relu |
| ⑨ | **N = 2**, jusqu'à la ligne écrite | ✅ 200, plan écrit, `household_size: 2` |

**Les cas ① à ⑦ ne dépensent rien** : 7 verts en 1 s. Les cas ⑧ et ⑨ font un
vrai appel modèle et ne tournent que sous `LOT8_REAL_MODEL=1`.

```bash
# gratuit
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
  deno test --allow-net --allow-env \
    supabase/functions/_shared/keel/lot8_integration_handler_test.ts

# payant (2 appels modèle)
LOT8_REAL_MODEL=1 … deno test --allow-net --allow-env …
```

### Le banc mord — épreuve de mutation, faite

En inversant l'ordre des refus dans `generation_context.ts` (`household_frozen`
avant `not_owner`), le cas ⑥ passe **rouge** sur exactement la bonne assertion,
puis vert après restauration. Ça prouve deux choses d'un coup : le test garde,
et **le runtime local sert bien le code courant** — donc le vert mesurait le
code de cette nuit, pas une copie périmée.

### Trois faits que seul un run réel pouvait donner

1. **`not_authenticated` est inatteignable depuis cette lane.** La fonction
   porte sa propre garde de jeton **avant** d'appeler le résolveur, et rend
   `Unauthorized`. Même statut (401), contrat client intact — mais la branche
   `not_authenticated` de `resolveGenerationAdmission` ne s'exécute jamais ici.
2. **Un compte créé par l'admin API saute le coach maison.** La fonction refuse
   `no_coach` (409) huit portes après l'admission. Toute fixture d'intégration
   doit appeler `keel_join_house_coach`.
3. **La provenance du corps n'est pas celle qu'on croit.** J'attendais
   `weightKg.personal` ; le run rend `weightKg.member_sheet` — même pour le
   titulaire de **son propre** foyer personnel. La raison est structurelle : le
   corps est écrit par `keel_household_set_member_body`, la RPC de l'écran, et
   elle écrit la **fiche de bouche**. Seuls l'âge et le genre restent
   `personal` (ils viennent de `profiles`). **C'est le test qui avait tort** ;
   il a été corrigé pour épingler ce que le produit fait.

### Ce que la ligne écrite porte vraiment

Relu en base sur le plan `6efa849b-…` :

```
generation_context : {household_size: 1, write_scope: "household", coverage_unreadable: false}
mouth_facts        : {gender.personal:1, ageYears.personal:1,
                      weightKg.member_sheet:1, heightCm.member_sheet:1,
                      activityLevel.member_sheet:1, appetite.member_sheet:1,
                      activityAxes.member_sheet:1}
portion_sizing.final : {measured: false, reason: "single_mouth"}
```

Le verdict du lot 5 **s'abstient en le nommant** au lieu de rendre un zéro qui
se lirait « mesuré et conforme ». C'est exactement le comportement voulu pour
une bouche seule — il n'y a pas de contenant à peser.

**Et à deux bouches, il mesure pour de vrai** (plan `3f3d0f58-…`) :

```
portion_sizing.final : {measured: true, reason: "remeasured_after_pots",
                        dishes: 3, judged: 6,
                        verdicts: {in_bounds: 6, over_max: 0,
                                   under_min: 0, unmeasurable: 0},
                        pot_density_drifted: 0, pot_density_gone: 0}
```

**Six parts sur six dans leurs bornes**, repesées **après** le dimensionnement
des casseroles — c'est la chaîne mesure → application du lot 5, de bout en bout,
sur un vrai plan. Le banc épingle en plus que les quatre compteurs **totalisent
exactement** le nombre de parts jugées : une part qui sortirait du tri sans
tomber dans aucune case serait une part qu'aucun chiffre ne réclame.

---

## 2. Ce que chaque famille prouve, et comment

### 2.1 Identité / SQL — 39 cas

**Vrai Postgres.** Vraies migrations, vraie RLS, vrais déclencheurs. Seules les
données sont des fixtures, créées et **annulées par `rollback`**.

Cas neufs (ce que les 49 cas du lot 1 ne couvraient pas) : le rattrapage des
comptes anciens (aucun test avant), le backfill répété, la branche
`vide_conserve` d'une invitation depuis un foyer personnel, la branche `else`
du départ, la suppression de compte.

⚠️ **Limite nommée par son auteur** : la vraie concurrence (deux `ensure`
simultanés) **n'est pas reproductible** dans une transaction annulée — deux
sessions ne la partagent pas. Le test prouve le **verrou** (`pg_advisory_xact_lock`
pris avant la lecture, position vérifiée dans `prosrc`) et **l'index unique**,
pas la course.

### 2.2 Autorisation — 32 SQL + 7 TS

La **décision** est pure et éprouvée sans base (`resolveGenerationAdmission`).
La **base** prouve ce qu'un mock ne peut pas : 5 RPC fermées à `authenticated`,
l'écriture directe refusée, `plan_not_replaceable` sur le plan d'autrui, et la
RLS historique après rattachement — 8 lectures sous vrai rôle `authenticated`.

### 2.3 Parité N = 1 — 11 cas

Garde que la suppression de `generate-meal-v1` (5 755 lignes) n'a rien emporté.
L'inventaire du lot 0 (`scratchpad/2026-09-10-MOTEUR-UNIQUE/01-parite.md`) est
repris **en entier** dans un cas unique : 20 champs, chacun vérifié comme
atteignant la consigne.

⚠️ **Ce sont des tests de SOURCE.** Ils prouvent que le câble existe, **pas
qu'il conduit**. C'est assumé : ils ferment le mode d'échec n° 1 du dépôt — un
champ collecté, stocké, et jeté avant le calcul.

### 2.4 Corps / énergie — 14 cas

Contrôle anti-tautologie fait par son auteur : cinq nombres dérivés à la main
mutés d'une unité dans le fichier de test → 5 rouges, sur les cinq familles
attendues. Restauré par `cp`, relancé vert.

### 2.5 Allocation + Densité — 22 cas

**La famille la mieux éprouvée**, et la seule avec une vraie **épreuve de
mutation sur le code de production** :

| Mutation appliquée à la source | Rouges attrapés |
|---|---|
| `LIGHT_MEAL_KCAL_PER_G_FLOOR` 0,6 → 1,0 | 2 / 2 |
| `isMinor` → `false` | 1 / 1 |
| `mergeCorridors` revient au code d'avant le lot 4 | 2 / 2 |
| `slotPlanTargets` : dénominateur = créneaux couverts | 4 / 4 |

Méthode : muté par `perl -pi`, restauré par `cp`, `shasum` identique avant/après.
**Aucun `git stash`, aucun `git checkout`** — l'arbre est partagé.

Trois mesures qui portent :
- un **restaurant confondu avec un moment couvert** fait composer **960 kcal
  par-dessus** ;
- un **léger 588 kcal / plafond 700 g** donne bien **84** — et c'est le premier
  test du dépôt qui passe `light: true` à `plateBoundsFor` ;
- un **gros appétit** met `Dmin` à **91**, sous le plancher commun de 100.

### 2.6 Mesure / service — 16 cas

- **riz cru ≡ cuit** : 100 g cru et 260 g cuit donnent la même part standard
  (350 kcal). Contre-épreuve « lu comme du cru » : 676 g / 910 kcal.
- **l'eau d'un riz** ne pèse ni ne nourrit ; **l'eau d'une soupe**, si.
- **contenant partagé** : un bac de quatre à **1 040 g** (> 700) pendant que
  chaque part vaut 260 g **dans les bornes**. La règle du lot 5, démontrée.
- **densités extrêmes** : une soupe à 7,8 kcal/100 g perd **645 kcal** au
  plafond de 700 g ; de l'huile à 900 en gagne **1 550** au plancher.
- `PORTION_SIZING_MAX_MOUTHS` **lu, pas supposé : 12.** 13 ferme le chemin.

⚠️ **Limite nommée par son auteur** : pas de mutation du code de production (la
frontière de son lot l'interdisait). La morsure est établie par dérivation à la
main et contre-épreuve dans le même cas.

### 2.7 Réparations — 8 cas

La **décision** de réparer est éprouvée ailleurs et complètement
(`plan_repair_loop_test.ts`, 25 cas). Ce fichier couvre ce que personne ne
gardait : la **comptabilité des transmissions fournisseur**, et le fait que le
résultat persisté soit réellement contrôlé.

### 2.8 Banc — 29 cas

Les huit détecteurs du § 8 étaient vérifiés **à la main** sur archives réelles.
Ils sont maintenant des **tests qui rougissent**. Hors gate, volontairement :
`scratchpad/` n'est pas du code de production.

---

## 3. Les 9 défauts produit trouvés — aucun n'est corrigé

> Tous sont écrits en **tests de caractérisation verts** qui décrivent l'état
> d'aujourd'hui et **rougiront le jour où on les ferme**, avec le message
> « viens retourner ce test ».

### 3.1 Les trois que J'AI créés cette nuit — les plus urgents

| # | Défaut | Vérification |
|---|---|---|
| **D1** | **`redistributeDayBudget` n'a AUCUN appelant.** Écrite au lot 4, testée à 11 cas, jamais branchée. Le lot 4 en fait la sortie du couloir vide ; le couloir vide se produit (un test en fabrique un par la chaîne de production) et **ne déclenche rien**. | `grep -rn "redistributeDayBudget" supabase/functions frontend/src \| grep -v "_test\.\|portion_sizing.ts"` → **0** |
| **D2** | **Les compteurs que j'ai ajoutés ne sont lus par personne.** Leur commentaire dit « il doit rester rare ; s'il grimpe, la sortie est une recette séparée ». Personne ne peut savoir s'il grimpe. | `grep -c "floor_min_kept" …/generate-household-meal-v1/index.ts` → **0**<br>`grep -c "empty_intersection" …` → **0** |
| **D3** | **`DensityCorridor.incompatible` n'a aucun lecteur.** `densityFragment` ignore le champ : la consigne envoyée au modèle pour une **intersection vide** est indistinguable d'une bande tenable. | `grep -c "incompatible" …/household_portions.ts` → **0** |

⛔ **C'est exactement le mode d'échec que ce dépôt nomme « ceinture armée sur
coffre vide ».** Je l'ai reproduit moi-même en une nuit, et ce sont des agents
qui l'ont vu. C'est le premier argument pour une relecture indépendante.

### 3.2 Les six trouvés dans le code existant

| # | Défaut | Gravité |
|---|---|---|
| **D4** | **Une femme enceinte lit « Environ 16 semaines à ce rythme »** pendant que son assiette refuse le déficit. L'écran d'énergie zéro-ise l'écart ; la **fiche de bouche** ne lit aucune condition. ⚠️ **Jamais atteint sur cette base** : 92 lignes de contrainte, **aucune** ne porte de condition — et la grossesse n'est déclarable **qu'en le disant au chat**, il n'y a aucun écran. | ⟳ **2026-09-11 — tranché : PAS d'écran** (voir R3). Reste latent, et inatteignable aujourd'hui. |
| **D5** | **`envelopeDirectionFor` ne lit aucune condition.** La garde de grossesse vit chez son **appelant**, et un seul appelant l'applique. La fonction n'a même pas de paramètre où ranger la question — **aucun compilateur ne recensera la prochaine lane qui l'oubliera**. | Structurelle |
| **D6** | **Une panne de lecture se lit comme « cette bouche n'a jamais rien saisi ».** `read_failed` meurt au résolveur : en aval, les deux rendent `{factor: 1, reason: "no_body"}`. Une panne d'une semaine sur toute la base se lirait « ces bouches n'ont pas de corps ». | Moyenne |
| **D7** | **La protection d'âge sort sous le nom d'une panne de corps.** Compte = 15 ans, fiche = 19 : l'arbitrage **protège bien**, mais le motif rendu est `no_body` et `pace_unavailable_missing_body` sort sur un corps complet (178 cm / 73 kg). Le vocabulaire fermé n'a **aucun jeton** pour « ses deux dates se contredisent ». Contrefactuel mesuré : sans l'arbitrage, un garçon de 15 ans recevait le déficit plein d'un adulte. | Moyenne |
| **D8** | **Un ingrédient frais arrondi à 0 g sort du contenant sans compteur.** Dans les **deux** écrivains de `portion_sizing.ts` : la branche CASSEROLE fait `counts.items_unresolved++`, la branche FRAIS fait `continue` **sans rien compter**. Le plat et sa boîte ne disent plus la même chose. | Moyenne |
| **D9** | **`densityCorridorFor` rabat en silence un intervalle sans entier** — `[121, 121]` là où l'intervalle vrai est [120,265 ; 120,667]. Le chantier exige « explicitement incompatible ». ⚠️ **Mesuré inatteignable** par la chaîne au-dessus de 50 kcal (0 cas sur ~1,3 M échantillons). | Théorique |

### 3.3 Deux défauts trouvés ET corrigés cette nuit

| Défaut | Correction |
|---|---|
| **`not_authenticated` et `no_household` invisibles au scanner de refus.** Mon refactor les fait voyager par `error: admission.refusal` — une **expression**. Cicatrice connue : « la garde des refus ne lit que les littéraux ». Un mur muet à l'écran. | Le test d'inventaire les reçoit nommément ; la phrase est couverte. |
| **`provider_attempts` était un champ mort.** `noteProviderAttempts` n'avait **aucun appelant vivant** : le compteur partait sur chaque ligne écrite en valant toujours **zéro**. Zéro se lit « aucune relance ». | Rapporteur ajouté dans le transport, appelé **avant chaque envoi réel** et **après le disjoncteur**. |

---

## 4. Ce qui n'a PAS été fait

| | Quoi | Pourquoi |
|---|---|---|
| **A** | ~~Aucune génération réelle.~~ **LEVÉ le 2026-09-11** : trois générations réelles, une écrite. Voir § 1 bis et § 4 bis. | sur demande du propriétaire |
| **B** | **Le gate n'a jamais tourné en entier** cette nuit. Il s'arrête au premier rouge, et les 2 rouges préexistants sont dans la **première** étape : le typecheck des fichiers de test, **eslint** et le **build** n'ont **jamais été atteints** depuis le début du chantier. | conséquence des 2 rouges |
| **C** | **Le build frontend n'a pas été lancé.** Le § 8 le demande explicitement. | oubli, à faire |
| **D** | **La concurrence réelle** (deux `ensure` simultanés) n'est pas reproductible en transaction annulée. | limite de méthode, nommée |
| **E** | **Mutation testing** : fait sur Allocation/Densité uniquement. Corps/énergie a muté ses propres nombres ; Mesure/service n'a pas muté du tout. | frontières de lots |

---

## 4 bis. La durée est instable, et sa queue dépasse le plafond de l'hébergé

> ⚠️ **Cette section a été RÉÉCRITE le 2026-09-11.** Sa première version
> concluait « un foyer de deux bouches ne tient pas dans le plafond ». **C'était
> faux, et c'est une conclusion tirée d'un seul tir.** Le tir suivant à deux
> bouches est le plus RAPIDE des cinq. Ce qui suit est la version mesurée.

**Cinq générations réelles, par le vrai handler, jusqu'à la ligne écrite.**

| Foyer | Durée | Résultat |
|---|---|---|
| 1 bouche | 66 s | ✅ 200, plan écrit |
| 1 bouche | 144 s | ✅ 200, plan écrit |
| 1 bouche | 73 s | ✅ 200, plan écrit |
| 2 bouches | **> 150 s** | ❌ 504, coupé par Kong |
| 2 bouches | **59 s** | ✅ 200, plan écrit |

**Ce que ça dit** : la durée va de **59 s à plus de 150 s sur le même chemin**,
et la taille du foyer n'explique rien — le tir le plus rapide est celui à deux
bouches, le plus lent est un solo. **C'est la variance qui mord, pas le nombre
de personnes.**

**Pourquoi 150 s est le bon repère** : le `read_timeout` de Kong local vaut
`150000`, avec en commentaire *« Set request idle timeout to 150s to match
hosted project »*. C'est le plafond de la production, recopié exprès. **Un tir
sur cinq l'a dépassé.**

### Le patch de Kong, et la garde qui empêche qu'il mente

`scripts/local_extend_kong_functions_timeout.sh` porte le `read_timeout` à 600 s
par `kong reload`. **C'est comme ça que les runs longs de ce dépôt ont toujours
été mesurés** — l'en-tête du lot 0 de `index.ts` le dit : « un Kong local patché
à 900 s qui masquait justement la coupure ». ⚠️ **Le patch n'est pas permanent et ne PEUT pas l'être depuis ce dépôt.**
Le conteneur Kong n'a **aucun volume monté** : son `kong.yml` est écrit à chaque
démarrage par son propre `entrypoint`, depuis un heredoc que la CLI Supabase
fabrique au `supabase start`. Il n'existe donc aucun fichier du dépôt où poser
la valeur. Le script édite le fichier **dans le conteneur qui tourne**, puis
`kong reload` ; **tout redémarrage le ramène à 150 000**. Celui de cette pile a
redémarré le 2026-09-10 à 23:33, ce qui explique le 504 : la limite avait
simplement repris sa place.

**En pratique** : `scripts/local_serve_functions.sh` relève le plafond **puis**
sert les fonctions, en une commande — donc le relevé se refait tout seul à
chaque redémarrage, sans qu'on ait à y penser :

```bash
./scripts/local_serve_functions.sh   # = kong à 600 s + supabase functions serve
```

Et c'est aussi bien que le plafond ne tienne pas tout seul — une pile locale
durablement plus permissive que la production finit par mentir sur la
production.

⛔ **Le patch sert à CONNAÎTRE la durée, jamais à la PARDONNER.** Sans garde, un
banc sur Kong patché rendrait vert un plan qui serait coupé chez le client. Le
fichier de test compare donc lui-même la durée à `HOSTED_GATEWAY_TIMEOUT_MS =
150_000` et **rouge avec le nombre de millisecondes en trop**.

### Les trois codes, trois causes, à ne jamais confondre

| Code | Cause | Ce que ça n'est pas |
|---|---|---|
| **504** | Kong a coupé à 150 s | pas un défaut de composition |
| **546** | l'isolat edge a épuisé son CPU | § 10, hors périmètre |
| **502** | le conteneur edge a été **recréé** | pas une panne |

Le 502 rencontré cette nuit venait de **moi** : j'avais édité le fichier de test
pendant que la génération tournait, et la CLI Supabase surveille tout
`supabase/functions/**` — fichiers de test compris. `RestartCount: 0` avec un
`StartedAt` postérieur à l'appel : recréation, pas panne.

---

## 5. Recommandations, par ordre de ce qui peut faire mal

### R1 — Brancher `redistributeDayBudget` et faire remonter les compteurs (D1, D2, D3)

**Pourquoi d'abord** : c'est du travail que j'ai créé cette nuit, et c'est le
défaut le plus embarrassant du lot — un module complet, testé, que rien
n'appelle. Tant qu'il n'est pas branché, le lot 4 est **livré à moitié** : le
couloir vide est détecté et n'a aucune sortie.

**Coût** : faible. Le point d'insertion est connu (la sortie de
`requiredDensityFor` quand `incompatible === "empty_intersection"`).

**Risque si on ne fait rien** : un plan dont deux jours partagent un moment aux
bandes disjointes reçoit une consigne qu'aucun des deux jours ne peut tenir, et
**rien ne le dit**.

### R2 — Lancer les trois étapes du gate jamais atteintes (B, C)

**Pourquoi ensuite** : un build cassé ne se voit pas autrement. Trois étapes
n'ont **jamais** tourné depuis le début du chantier, et j'ai touché ~40 fichiers.

**Coût** : quelques minutes.

```bash
cd frontend && npx tsc -p tsconfig.test.json --noEmit
cd frontend && npx eslint <fichiers modifiés>
cd frontend && npm run build
```

### R3 — ✅ TRANCHÉ par le propriétaire le 2026-09-11 : **pas d'écran**

**La décision, dans ses mots** : « la grossesse à l'écran je l'ai pas pris en
compte et je veux pas l'afficher ».

**Ce que ça ferme** : la piste « une case dans la fiche de bouche ». Elle ne sera
pas ouverte. Une grossesse reste déclarable **uniquement en le disant au chat**,
et la fiche de bouche ne portera pas de condition de santé. Aucune surface B2C
ne demande cette donnée.

**Ce que ça laisse ouvert, et qui est une AUTRE question** : l'écran de
progression promet une date d'arrivée (« Environ 16 semaines à ce rythme »)
pendant que le moteur a annulé le déficit. Corriger ça ne demande **pas**
d'afficher la condition — il faudrait que le front sache « pas de direction,
donc pas de date », sans jamais savoir pourquoi. ⚠️ **Non atteignable
aujourd'hui** : 92 lignes de contrainte sur toute la base, **aucune** ne porte de
condition. À traiter le jour où une condition existe vraiment, pas avant.

**D5 est fait** : `envelopeDirectionFor` prend désormais un `deficitCancelled`
**obligatoire**. Le compilateur a recensé ses 6 appelants, tous corrigés, et
trois cas neufs l'épinglent dans `lot8_reparations_test.ts`.

### R4 — ✅ FAITE le 2026-09-11, et elle a trouvé quelque chose

**Ce qui était demandé** : 2 ou 3 générations, un foyer d'une personne et un
pluriel. **Ce qui a été fait** : trois tirs. Les trois chirurgies de la nuit
(lane individuelle supprimée, pesée remontée de ~2 000 lignes, sas déplacé) ont
**tourné pour de vrai**, et un plan est sorti et s'est écrit à une personne.

**Ce qu'elle a trouvé** : la **variance** de la durée (§ 4 bis) — 59 s à 144 s
sur le même chemin, un tir sur cinq coupé par le plafond de 150 s de l'hébergé.
Ce n'est pas une question de taille de foyer.

**Ce qui reste ouvert** : resserrer la queue de distribution, pas la moyenne —
la moyenne va déjà bien. Les pistes visibles sont le nombre d'allers-retours de
la boucle de réparation (chacun est un appel modèle de plus, et c'est le
candidat le plus probable pour un écart de 85 s entre deux tirs identiques) et
la longueur du prompt. **Aucune n'est à trancher par un agent seul.** Il faut
aussi plus de cinq points : cinq tirs donnent une queue, pas une distribution.

### R5 — Compléter l'épreuve de mutation (E)

**Pourquoi en dernier** : c'est la seule chose qui distingue un test qui garde
d'un test qui décore. Une seule famille sur sept l'a fait sur le code de
production, et elle a attrapé **9 rouges sur 9 mutations**.

**Ce que ça coûterait** : muter les constantes clés des six autres familles, une
par une, avec `cp` pour restaurer.

---

## 6. Pour Astra — points de contrôle suggérés

1. **Relancer les 10 commandes du § 1** et comparer aux chiffres annoncés.
2. **Vérifier les 3 `grep` du § 3.1** — ce sont des faits binaires, pas des
   opinions.
3. **Choisir trois cas au hasard** dans les familles et vérifier que le nombre
   asserté est **dérivé au-dessus de l'assertion**, pas recopié d'une sortie.
   C'est le seul contrôle qui distingue un test qui mesure d'un test qui
   enregistre.
4. **Chercher un test sans cas qui mord.** La règle du dépôt : chaque garde a
   besoin d'un cas qui passe **et** d'un cas qui échoue. Un test qui n'a que le
   premier est vert par construction.
5. **Vérifier que les 2 rouges sont bien antérieurs** — `git stash` est interdit
   sur cet arbre, mais `git show HEAD:<fichier>` permet de comparer.
6. **Contester les 9 défauts.** Trois sont de moi et je les ai peut-être
   sous-estimés ; six sont dans du code que je n'ai pas écrit et je les ai
   peut-être sur-estimés.
