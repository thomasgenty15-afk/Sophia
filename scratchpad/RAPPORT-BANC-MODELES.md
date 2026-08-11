# RAPPORT — le banc d'essai des modèles de composition

**Date :** 2026-08-11 · **Chantier A** du plan `PLAN-SUITE-ENTREES-ET-MODELE.md`
**Harnais :** `scratchpad/banc-modeles/` — rejouable, pas un one-off

## 0 · La porte, et la correction qu'elle impose

Le plan envisageait que le chantier soit sauté faute de clé de modèle en local.
**Ce n'est pas le cas, et le raisonnement qui l'aurait fait croire est un piège
qu'il faut nommer :**

| Ce qu'on vérifie | Réponse | Ce que ça vaut |
|---|---|---|
| `supabase/functions/.env` existe ? | **non** | ne prouve rien |
| `printenv OPENAI_API_KEY` **dans le conteneur** | **164 car.**, `sk-pro…` | c'est ça, la question |
| `printenv GEMINI_API_KEY` dans le conteneur | **39 car.** | idem |

Les clés sont injectées par `[edge_runtime.secrets]` de `config.toml` depuis
`supabase/.env`. Chercher le fichier plutôt que l'environnement du runtime donne
une réponse fausse — et une porte déclarée fermée à tort fait sauter un chantier
entier avec un rapport qui a l'air rigoureux.

⚠️ **`--env-file` de Deno ne lit pas ce fichier correctement.** Il abandonne à la
première valeur non quotée contenant un espace (mesuré : index 6, `Sofia on
earth`), et tout ce qui suit — dont `OPENAI_API_KEY` — n'est jamais posé. Le
symptôme est un `401` qui ressemble à une clé invalide alors que la clé n'a
simplement pas été lue. D'où `banc-modeles/env.ts`, un chargeur tolérant.

---

## 1 · Les identifiants, validés avant la campagne

`generation_model.ts` écrit que, pour un modèle OpenAI choisi par l'appelant,
`pickModelForAttempt` **rend le même identifiant à chaque tentative** : un
identifiant mort n'entraîne pas une dégradation, il **arrête** toute génération.
Le plan exige donc une validation sur une seule génération avant campagne.

`scratchpad/banc-modeles/list-models.ts` interroge les deux fournisseurs :
**130 modèles** côté OpenAI, **36** côté Gemini. Le défaut du produit,
`gpt-5.6-sol`, existe bien — comme `gpt-5.6-luna` et `gpt-5.6-terra`.

Les cinq candidats retenus, et pourquoi chacun :

| Modèle | Pourquoi il est au banc | Validé (1 génération) |
|---|---|---|
| `gpt-5.6-sol` | **le défaut actuel du produit** — sans lui il n'y a pas de ligne de base | ✅ |
| `gpt-5.6-terra` | frère du défaut, positionnement inconnu : c'est exactement ce qu'un banc sert à savoir | ✅ |
| `gpt-5.4-mini` | **la cible de retour arrière documentée**, et la moins chère | ✅ |
| `gemini-3.6-flash` | le comparateur non-OpenAI bon marché | ✅ |
| `gemini-3.1-pro-preview` | le comparateur non-OpenAI haut de gamme | ✅ |

Aucun identifiant mort. Les autres familles disponibles (`gpt-5.1`…`gpt-5.5`,
`gemini-2.5-*`, les modèles image/TTS/robotics, `gemma-4-*`) sont **hors
périmètre** : soit antérieures au défaut actuel, soit d'une autre modalité.

---

## 2 · Ce que le harnais mesure, et les trois écarts au plan

Tout vient des modules **réels** du produit — `buildMealPrompt`,
`parseGeneratedMeal`, `verdictFor`, `assessCoverage`, `correctionPlanFor`. Le
banc n'a **pas de notation à lui** : il lit la note que le produit se donne déjà
à chaque génération. C'est ce qui fait qu'améliorer le banc et améliorer le
produit sont le même geste.

### Écart 1 — les fixtures sont en CODE, pas en base

Le plan demandait douze profils **avec un plan publié**. Aucun élève de la flotte
QA n'en a un (`published = 0` sur toute la flotte), et en fabriquer douze aurait
été un chantier à part dont le résultat aurait été, précisément, une fixture qui
dérive.

Le piège n°1 du plan est : *« ne compare que sur des fixtures identiques — une
différence de fixture écrase toute différence de modèle »*. Une fixture en base
dérive dès qu'une autre session touche `student_goals` ou qu'un cron passe. Une
fixture en code est **byte-identique d'un modèle à l'autre et d'un rejeu à
l'autre** — la seule forme qui rende le banc rejouable au sens du plan.

### Écart 2 — l'appel au fournisseur est BRUT, pas via `generateWithGemini`

Le wrapper du dépôt fait trois choses qui fausseraient ce banc :

1. il **répare** le JSON (extraction, coercition, ré-essais) — or « fidélité
   structurelle JSON » est une colonne du tableau, et la mesurer à travers un
   réparateur mesure le réparateur ;
2. il **bascule** de modèle en cours de route. Le plan avertit qu'« une ligne qui
   bascule mesure les deux modèles » et demande de détecter les bascules. En
   appelant brut, **il n'y a rien à détecter** : chaque ligne mesure exactement
   un identifiant ;
3. ses timeouts et ses replis diffèrent selon la famille du modèle — donc un
   biais entre fournisseurs, exactement là où on veut comparer.

**Le prix de ce choix, dit franchement :** le banc mesure le **modèle**, pas le
pipeline complet. Ce que le pipeline ajoute ne peut qu'améliorer ces chiffres
bruts, jamais les dégrader — les colonnes sont donc des **planchers**.

### Écart 3 — la mesure d'adhérence négative, et les TROIS fois où elle était fausse

C'est la colonne qui décide du classement, et elle a été fausse trois fois de
suite. Chaque correction est écrite ici parce que chacune inversait le résultat.

**Faute 1 — un matcher maison.** Recherche de sous-chaîne sur le JSON entier.
Mesuré sur les 46 premières générations : **les douze violations relevées
étaient toutes des faux positifs.**

| Ce que le modèle a écrit | Ce que la mesure en faisait |
|---|---|
| `Wrap de tofu rôti, laitue et houmous` | violation « lait » |
| `Bol de yaourt de soja` (élève végane) | violation « yaourt » |
| `muesli sans miel` | violation « miel » |
| `certified gluten-free seeded bread` (cœliaque) | violation « bread » |
| `label confirmed suitable for a peanut allergy` | violation « peanut » |

Les cinq sont des **bonnes** réponses. La colonne classait le modèle qui
substitue correctement **en dessous** de celui qui ne propose rien.

Corrigé en passant à **`forbidden_matcher.ts`** — LE matcher des deux verrous de
sortie du produit. Bornes de mot par lookaround (« lait » ne matche plus dans
« laitue ») et liste **fermée** de constructions de négation, dont le
commentaire cite littéralement « gluten-free bread » servi à un cœliaque. Tout
ce que le matcher maison redécouvrait à ses frais y était déjà écrit, avec la
cicatrice qui l'avait payé.

**Faute 2 — le retour en arrière compté comme une faute.** Il restait neuf
violations. Vérifiées une par une dans `brut/` : toutes celles de `yaourt` et de
`bread` venaient de la **méthode**, pendant que l'ingrédient acheté disait
« yaourt de soja » ou « GF bread ». Une recette écrit l'aliment en entier une
fois, puis y renvoie en abrégé.

D'où la règle finale, en deux clauses :

> **(a)** le mot est dans un `term` d'ingrédient ou de liste de courses, sans
> qualificatif → **violation**. C'est ce qu'on met dans le caddie.
> **(b)** le mot est dans un **titre** ou une **méthode**, sans qualificatif,
> **et** aucun ingrédient qualifié ne l'explique → **violation** aussi.

La clause (b) sépare « verser le yaourt dans un bol » — légitime, l'ingrédient
dit « yaourt de soja » — de « Top with crushed peanut » servi à un
anaphylactique, que **rien** n'explique. Sans elle, un allergène nommé nulle
part ailleurs passerait ; avec (a) seule, on punirait la façon dont les recettes
s'écrivent. Le `why` n'est jamais une faute : c'est de la prose adressée à
l'élève, comptée comme **écho**.

S'y ajoute une liste **fermée** de qualificatifs de substitution que le matcher
du produit ne connaît pas — « soja », « soy », « amande », « GF »… — parce
qu'aucune négation ne blanchit « yaourt de soja ».

**Faute 3 — un mot mal choisi dans ma propre liste.** Il restait `batter`, sur
un `GF Pancakes` fait de `GF plain flour`. Une pâte à frire n'est pas un aliment
porteur de gluten, c'est un **état de préparation** — c'est la farine qui
décide, et elle était déjà couverte. Mot retiré de la fixture : *un mot mal
choisi punit le modèle pour une faute de la liste.*

**Ce qui reste après les trois corrections est vérifiable une par une** dans
`brut/`, et chaque faux positif est épinglé en test de régression
(`scoring_test.ts`, **21 cas**) avec sa contre-épreuve — le matcher doit
toujours mordre sur du vrai lait servi à une végane, du poulet servi à un
végétarien et du pain ordinaire servi à un cœliaque.

> La première campagne (13 générations) a été **jetée** dès que la faute 1 a été
> vue. Les fautes 2 et 3 ont été corrigées **sans repayer une génération** :
> chaque sortie brute est persistée, et `rescore.ts` refait toute la notation
> hors ligne. C'est ce qui a rendu trois itérations abordables au lieu de trois
> campagnes.

### Ce qui n'est pas mesuré, et qui ne le sera pas ici

**La qualité culinaire.** Le plan la désigne comme le seul axe non mesurable, et
comme celui sur lequel un humain croira le plus voir une différence. Aucune ligne
de ce rapport n'est un jugement de goût.

---

## 3 · Les douze fixtures

Fenêtre **fixe** pour tout le banc : mardi → lundi, sept jours, `2026-08-11`.

| Fixture | Langue | Ce qu'elle est là pour discriminer |
|---|---|---|
| `f01_fat_loss_en` | EN | la dynamique la plus fréquente, sans piège |
| `f02_muscle_gain_fr` | FR | plancher protéique haut, en français |
| `f03_recomposition_en` | EN | bande d'énergie étroite **des deux côtés** |
| `f04_performance_fr` | FR | glucides autour de l'entraînement |
| `f05_health_en` | EN | aucune dynamique forte — le modèle doit rester sobre |
| `f06_maintenance_fr` | FR | la dynamique où **rien ne pousse** le modèle |
| `f07_vegan_fr` | FR | **végan** : 25 formes exclues, fautes invisibles comprises (nuoc-mâm, gélatine, bouillon de volaille, saindoux) |
| `f08_vegetarian_en` | EN | **végétarien** : œufs et laitages RESTENT, la viande part |
| `f09_medical_allergy_en` | EN | **arachide anaphylactique** + lactose — la faute la plus chère du produit |
| `f10_restriction_flag_fr` | FR | **plancher TCA** : aucun chiffre sur la personne, l'enveloppe n'existe pas |
| `f11_away_and_intakes_en` | EN | **absences + apports fixes** : deux façons dont une case est prise d'avance |
| `f12_household_no_coach_en` | EN | **foyer de quatre, AUCUN coach** — la doctrine est vide, le modèle est seul |

Six en anglais, six en français, comme le plan l'exige : *« un modèle peut être
bon en anglais et mauvais en français, et le produit sort en `fr-FR` par
défaut »*.

Neuf fixtures portent une doctrine publiée (interdits + déconseillés + clés de
croyance) ; `f12` n'en a **aucune**, et c'est ce que voit un élève sans coach.

---

## 4 · Résultats

**180 générations** — 5 modèles × 12 fixtures × 3 runs. Coût total de la
campagne : **$12,57**. Zéro échec d'appel, zéro identifiant mort.

| Modèle | n | échecs appel | échecs parse | **runs avec violation négative** | violations | échos (obéissance) | issues/run | retry | couverture méd. | plats/run | hors bande | p50 | p95 | $/gén. |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `gpt-5.6-terra` | 36 | 0 | 0 | **0** (0 %) | 0 | 0 | 2.7 | 61 % | 80.2 % | 20.2 | 16 | 75 s | 86 s | $0.095 |
| `gemini-3.1-pro-preview` | 36 | 0 | 0 | **0** (0 %) | 0 | 4 | 4.6 | 64 % | 78.8 % | 19.6 | 10 | 95 s | 134 s | $0.085 |
| `gpt-5.6-sol` | 36 | 0 | 0 | **0** (0 %) | 0 | 7 | 5.8 | 33 % | 70.9 % | 17.2 | 8 | 164 s | 203 s | $0.130 |
| `gemini-3.6-flash` | 36 | 0 | 2 | **0** (0 %) | 0 | 1 | 4.6 | 59 % | 75.7 % | 19.6 | 5 | 52 s | 62 s | $0.025 |
| `gpt-5.4-mini` | 36 | 0 | 0 | **6** (17 %) | 7 | 5 | 8.0 | 81 % | 92.4 % | 19.6 | 19 | 31 s | 37 s | $0.015 |

### Anglais contre français — un modèle peut être bon dans une langue

| Modèle | runs EN | violations EN | runs FR | violations FR |
|---|--:|--:|--:|--:|
| `gpt-5.6-terra` | 21 | 0 (0 %) | 15 | 0 (0 %) |
| `gemini-3.1-pro-preview` | 21 | 0 (0 %) | 15 | 0 (0 %) |
| `gpt-5.6-sol` | 21 | 0 (0 %) | 15 | 0 (0 %) |
| `gemini-3.6-flash` | 19 | 0 (0 %) | 15 | 0 (0 %) |
| `gpt-5.4-mini` | 21 | 6 (29 %) | 15 | 0 (0 %) |

### Les fautes, par motif (nombre de runs qui le portent)

| Modèle | away_day_violated | bad_preparation | dangling_uses | dish_cap | eaten_before_cooked | fixed_intake_violated | fridge_overrun | leftovers_violated | numeric_target | other | unstructured_quantity |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `gpt-5.6-terra` | 1 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 9 | 5 | 32 |
| `gemini-3.1-pro-preview` | 0 | 1 | 6 | 0 | 0 | 0 | 1 | 0 | 14 | 20 | 29 |
| `gpt-5.6-sol` | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 16 | 6 | 31 |
| `gemini-3.6-flash` | 0 | 0 | 8 | 0 | 0 | 0 | 1 | 3 | 16 | 19 | 19 |
| `gpt-5.4-mini` | 3 | 3 | 5 | 2 | 15 | 3 | 21 | 3 | 0 | 26 | 36 |

### Par fixture — l'adhérence négative, là où elle se joue

| Fixture | `gpt-5.6-terra` | `gemini-3.1-pro-preview` | `gpt-5.6-sol` | `gemini-3.6-flash` | `gpt-5.4-mini` |
|---|--:|--:|--:|--:|--:|
| f01_fat_loss_en | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f02_muscle_gain_fr | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f03_recomposition_en | 0/3 | 0/3 | 0/3 | 0/2 | 0/3 |
| f04_performance_fr | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f05_health_en | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f06_maintenance_fr | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f07_vegan_fr | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f08_vegetarian_en | 0/3 | 0/3 | 0/3 | 0/2 | 2/3 |
| f09_medical_allergy_en | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| f10_restriction_flag_fr | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f11_away_and_intakes_en | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |
| f12_household_no_coach_en | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 |

### Les mots interdits qui sont sortis

| Mot | Fixture(s) | Modèles | Extrait — la preuve, pas la promesse |
|---|---|---|---|
| `beef` | f08_vegetarian_en | gpt-5.4-mini×1 | beef strips |
| `chicken` | f08_vegetarian_en | gpt-5.4-mini×2 | roast chicken thighs |
| `soy sauce` | f12_household_no_coach_en | gpt-5.4-mini×1 | soy sauce |
| `yogurt` | f09_medical_allergy_en | gpt-5.4-mini×3 | Greek yogurt |

### 4.1 — Le résultat principal, et il est net

**Quatre modèles sur cinq n'ont servi AUCUN aliment interdit**, sur 36
générations chacun, allergie anaphylactique et régime végan compris.

`gpt-5.4-mini` est le seul à en servir, et il le fait là où ça coûte le plus
cher :

| Fixture | Ce qu'il a mis dans la liste de courses | Combien de fois |
|---|---|---|
| `f09_medical_allergy_en` — intolérance au lactose | `Greek yogurt` | **3 runs sur 3** |
| `f08_vegetarian_en` — végétarien | `roast chicken thighs`, `beef strips` | 2 et 1 |
| `f12_household_no_coach_en` — foyer sans gluten | `soy sauce` (elle contient du blé) | 1 |

Ce sont des `term` d'ingrédient et de liste de courses : des choses **achetées
et mangées**, pas des mentions de prose. Chacune est vérifiable dans
`brut/gpt-5.4-mini__*.json`.

C'est la cible de retour arrière documentée par `generation_model.ts`. **Le
retour arrière est plus dangereux que la panne qu'il répare** — à noter dans ce
module.

### 4.2 — Le défaut actuel est le plus mauvais choix des cinq

`gpt-5.6-sol` ne sert rien d'interdit, et il perd sur tout le reste :

| Axe | `gpt-5.6-sol` | Le meilleur | Écart |
|---|---|---|---|
| latence p50 | **164 s** | 31 s (`gpt-5.4-mini`) | ×5,3 |
| latence p95 | **203 s** | 37 s | ×5,5 |
| coût / génération | **$0,130** | $0,015 | ×8,7 |
| couverture de résolution méd. | **70,9 %** | 92,4 % | −21,5 pts |
| plats par génération | **17,2** | 20,2 (`terra`) | −3 plats |
| issues par génération | 5,8 | 2,7 (`terra`) | ×2,1 |

Son seul bon chiffre — **33 % de retry**, le plus bas — est un **artefact
d'abstention** : avec 78 % de verdicts non calculables, la boucle de correction
n'a le plus souvent aucun jeton à produire. Un modèle qu'on ne sait pas noter
ne déclenche pas de relance ; ça ne veut pas dire qu'il compose mieux.

### 4.3 — L'ancre protéique sépare les familles

Le nombre de repas principaux **sans ancre protéique** (FF-037), cumulé sur
36 générations :

| Modèle | Repas sans ancre |
|---|---|
| `gpt-5.6-sol` | **9** |
| `gpt-5.6-terra` | **9** |
| `gpt-5.4-mini` | 36 |
| `gemini-3.6-flash` | 46 |
| `gemini-3.1-pro-preview` | **60** |

C'est le rapport de 1 à 6,7 entre le meilleur et le pire, sur exactement les
mêmes consignes. Chaque ancre manquante est une relance facturée en production.

### 4.4 — Les défaillances structurelles

| Modèle | Générations à **zéro plat** | Échecs de parse JSON |
|---|---|---|
| `gpt-5.6-terra` | 0 | 0 |
| `gpt-5.6-sol` | 0 | 0 |
| `gemini-3.1-pro-preview` | 1 | 0 |
| `gemini-3.6-flash` | 1 | **2** (5,6 %) |
| `gpt-5.4-mini` | **3** | 0 |

`gemini-3.6-flash` est le seul dont le JSON ne parse pas — deux fois, sur
`"state": raw` non quoté et une clé de propriété non quotée. Le wrapper du
produit réparerait probablement les deux ; le banc mesure le modèle nu.

`gpt-5.4-mini` porte par ailleurs **15 runs avec un lot mangé avant d'être
cuisiné** et **21 avec un dépassement de conservation au frigo** — contre 0 et
0 pour `gpt-5.6-sol`. Ce sont des plans inexécutables.

### 4.5 — LE RÉSULTAT QUI NE PARLE PAS DES MODÈLES

**Le moteur de composition s'abstient sur 67 % des générations.**

| Cause | Part des 178 générations parsées |
|---|---|
| couverture de résolution < 80 % | **48 %** |
| un inconnu de **classe dense** au-dessus de 80 % | 19 % |
| **total non calculable** | **67 %** |

Couverture médiane **80,2 %**, p10 **60,0 %**, minimum **39,4 %** — alors que la
gate de phase I avait mesuré 96,2 % de médiane. L'écart s'explique : la gate
portait sur des repas **déjà en base**, générés avec l'ancien prompt et un
vocabulaire déjà digéré par le référentiel. Sur des générations neuves, le
référentiel ne suit pas.

**C'est le plus gros levier de ce rapport, et il n'a rien à voir avec le choix
d'un modèle.** Deux tiers des plans ne peuvent recevoir ni verdict d'énergie, ni
verdict de densité, ni plancher protéique vérifié — donc la boucle de correction
de FF-040 est muette sur deux tiers du produit. Une passe de curation d'alias
vaut plus que n'importe quel changement de modèle, et `brut/` contient déjà les
2 000+ termes à trier.

---

## 5 · Recommandation

### Le gagnant : `gpt-5.6-terra`

| Ce qui décide | `gpt-5.6-terra` |
|---|---|
| Aliments interdits servis | **0 sur 36** |
| Issues par génération | **2,7** — le meilleur |
| Repas sans ancre protéique | **9** — ex æquo meilleur |
| Générations à zéro plat, échecs de parse | **0 et 0** |
| Plats par génération | **20,2** — le plus |
| Couverture de résolution médiane | 80,2 % — 2ᵉ |
| Latence p50 / p95 | 75 s / 86 s — **2,2× plus rapide** que le défaut |
| Coût par génération | $0,095 — **27 % moins cher** que le défaut |

Il gagne ou fait jeu égal sur **tous** les axes qui décident, et il bat le défaut
actuel sur la latence et le coût par-dessus le marché. Aucun autre candidat n'est
premier sur plus d'un axe sans être dernier sur un autre.

`gemini-3.6-flash` mérite d'être nommé : **$0,025 la génération, 52 s**, zéro
violation — quatre fois moins cher et 40 % plus rapide que `terra`. Ce qui
l'écarte, ce sont ses **2 échecs de parse** et ses **46 repas sans ancre**. Si la
curation d'alias et un durcissement du parseur les absorbent, il redevient le
meilleur rapport qualité/prix du lot, et **c'est le premier candidat de la
prochaine campagne**.

### Le coût, aux volumes

Le banc mesure la génération la plus lourde du produit — un plan `to_shop` de
**sept jours**. C'est donc un **plafond**, pas une moyenne.

| Modèle | $/génération | 100 gén./mois | 1 000 | 10 000 |
|---|---|---|---|---|
| `gpt-5.6-sol` (défaut) | $0,130 | $13 | $130 | $1 300 |
| **`gpt-5.6-terra`** | **$0,095** | **$9,50** | **$95** | **$950** |
| `gemini-3.6-flash` | $0,025 | $2,50 | $25 | $250 |

⚠️ **Les volumes de production ne sont pas lisibles d'ici** — la base locale est
un environnement QA. Le tableau donne l'arithmétique ; le propriétaire la
multiplie par ce qu'il sait. À `terra`, l'économie contre le défaut actuel est de
**27 %**, quel que soit le volume.

⚠️ **Les tarifs sont saisis à la main** (`PRICING` dans `run.ts`), aucune API ne
les rend. Ordres de grandeur, pas une facture.

### La commande à passer

Les secrets me sont bloqués. À exécuter par le propriétaire :

```bash
supabase secrets set KEEL_GENERATION_MODEL=gpt-5.6-terra
```

C'est une **variable**, pas un déploiement : le retour arrière est immédiat et
`generation_model.ts` explique pourquoi c'est ce qu'il faut sur un chemin sans
repli.

⚠️ **Avant de la passer**, vérifier `gpt-5.6-terra` sur **une** génération de
production. Le banc appelle le fournisseur en direct ; le produit passe par
`generateWithGemini`, dont la chaîne de repli ne s'applique pas à un modèle
OpenAI choisi par l'appelant.

### Ce qu'il faut faire AVANT, et qui rapporte plus

**La curation d'alias** (§4.5). Deux tiers des plans n'ont pas de verdict. Tant
que c'est vrai, la boucle de correction de FF-040 est muette sur deux tiers du
produit, et changer de modèle améliore une chose qu'on ne sait pas mesurer.

### ⚠️ Une correction à porter dans `generation_model.ts` — que je n'ai PAS faite

Le plan interdit de toucher ce fichier, et je l'ai laissé intact. Mais son
en-tête porte aujourd'hui un conseil que la mesure **contredit** :

> « Poser `KEEL_GENERATION_MODEL=gpt-5.4-mini` restaure exactement le
> comportement d'avant. »

C'est vrai, et c'est le problème : le comportement d'avant sert des aliments
interdits. `gpt-5.4-mini` est le **seul des cinq** à le faire — yaourt grec à un
intolérant au lactose 3 fois sur 3, poulet et bœuf à un végétarien, sauce soja à
un foyer sans gluten. Il porte en plus 15 lots mangés avant d'être cuisinés et
21 dépassements de conservation, contre 0 et 0 pour le défaut actuel.

Un module dont l'en-tête désigne comme « repli sûr » le seul candidat qui sert
des allergènes est un piège tendu à celui qui l'ouvrira en urgence, un soir de
panne. **Le repli propre est `gpt-5.6-sol`** — lent et cher, mais il n'a rien
servi d'interdit.

Texte proposé, à coller sous le paragraphe de la soupape :

```
 * ⚠️ MAIS PAS VERS `gpt-5.4-mini`, ET C'EST MESURÉ.
 * Banc du 2026-08-11 (180 générations, 5 modèles): sur les cinq candidats,
 * `gpt-5.4-mini` est le SEUL à servir des aliments interdits — `Greek yogurt`
 * à un intolérant au lactose 3 fois sur 3, `roast chicken thighs` et
 * `beef strips` à un végétarien, `soy sauce` à un foyer sans gluten. Ce sont
 * des lignes de liste de courses. Le repli propre est `gpt-5.6-sol`.
 * Détail: scratchpad/RAPPORT-BANC-MODELES.md §4.1
```

---

## 6 · Rejouer

```bash
# 1. les identifiants encore servis par les fournisseurs
deno run --allow-net --allow-read --allow-env scratchpad/banc-modeles/list-models.ts

# 2. la campagne (ajoute au JSONL — plusieurs passes possibles)
deno run --allow-net --allow-read --allow-write --allow-env \
  scratchpad/banc-modeles/run.ts --runs=3 --concurrency=10

# 3. le tableau
deno run --allow-read scratchpad/banc-modeles/agrege.ts --md
```

Chaque sortie brute est écrite dans `scratchpad/banc-modeles/brut/` : **la
notation peut être refaite hors ligne, sans rappeler un seul modèle.** C'est ce
qui a permis de corriger la mesure d'adhérence négative sans payer une troisième
campagne.

Les résultats et les sorties brutes sont **hors dépôt** (`.gitignore`) : ce sont
des données de mesure, pas du code, et elles se régénèrent.
