# Notes de première main — orchestrateur (2026-09-07)

Tout ce qui suit a été lu PAR MOI, directement, pas rapporté par un agent.
Sert de témoin pour recouper les rapports d'agents.

## Routes testées

| Route | État | Preuve |
|---|---|---|
| `itunes.apple.com/search?term=X&country=fr&entity=software` | OK | a rendu trackId Jow 1301257625 |
| `itunes.apple.com/lookup?id=ID&country=fr` | OK | resultCount 0 si mauvais id |
| `itunes.apple.com/fr/rss/customerreviews/page=N/id=ID/sortby=mostrecent/json` | OK | avis verbatim, ~50/page |
| `fr.trustpilot.com/review/DOM?stars=1&stars=2&stars=3&page=N` | OK | 20 avis verbatim rendus |
| `google.com/complete/search?q=..&client=firefox&hl=fr&gl=fr` | OK | suggestions FR |
| `reddit.com` + `old.reddit.com` (WebFetch) | **BLOQUÉ** | "Claude Code is unable to fetch from www.reddit.com" |
| `reddit.com` (navigateur intégré) | **BLOQUÉ** | "https://reddit.com is blocked by policy" |
| `play.google.com/store/apps/details` | INEXPLOITABLE | HTML tronqué, aucun avis |
| Google Trends / Keyword Planner | NON TESTABLE | login/JS |

## Chiffres durs relevés (iTunes, FR, 2026-09-07)

- Jow — trackId 1301257625 — note 4,811 — **45 902 avis** — "Gratuit" — MàJ 2026-08-31
- Marmiton — trackId 318796083 — note 4,592 — **139 152 avis** — "Gratuit" — MàJ 2026-09-03
- 750g — trackId 344532371 — note 4,534 — 15 449 avis — "Gratuit" — MàJ 2026-08-31
- Kuri — trackId 1510387870 — note 4,803 — 3 815 avis — "Gratuit" — MàJ 2026-02-03
- Frigo Magic — trackId 977681072 — note 4,414 — 3 001 avis — "Gratuit" — **MàJ 2024-11-20 (abandonnée ?)**
- Too Good To Go — 586 507 avis (repère d'échelle)

## Trustpilot Jow — https://fr.trustpilot.com/review/jow.fr

TrustScore 4,3/5 — 367 avis — 5★ 63 % / 4★ 18 % / 3★ 5 % / 2★ 5 % / 1★ 9 %

**J'ai lu les 20 avis 1-2-3★ de la page 1.** Comptage de première main :

- avis lus : 20
- mentionnant foyer / portions par personne / plusieurs régimes à table : **0**
- thèmes réellement présents :
  - passage au payant / abonnement : 5 (Iman Bourdais, Romane Bellerre, Lucas M, + 2)
  - bugs, panier perdu, déconnexions : 8
  - service client, remboursements, double prélèvement : 6
  - qualité/répétitivité des recettes : 3
  - **besoin d'un chiffre personnel : 1** (Roland, 3★, 28 févr. 2026)

Citation la plus proche du sujet Sophia — et elle parle d'UN corps, pas d'un foyer :
> « Hélas, toujours impossible de choisir le montant calorique journalier, alors qu'ils ont pu
> faire cette possibilité pour mettre une limite de budget. Techniquement ça ne serait pas plus
> difficile ! Et je suis certain que cette fonction apporterait beaucoup de nouveaux abonnés. »
> — Roland, 3★, 28 févr. 2026, fr.trustpilot.com/review/jow.fr

Seule occurrence du mot « proportions », et elle porte sur les recettes, pas sur les convives :
> « 80 pour cent des recettes sont juste nulle , pas bonne , mal proportionnées, les temps de
> cuissons sont juste foireuses à chaque fois »
> — Cazaux Margot, 2★, 12 juin 2025

Preuve de niveau B sur le PRIX (Jow est passé payant, et ça fait partir des fidèles) :
> « Cinq ans que j'utilise l'application au quotidien [...] Et aujourd'hui, je découvre un message
> qui me remercie d'être là « depuis le début »… juste avant de me demander de passer à un
> abonnement pour continuer à utiliser ce dont je me servais jusqu'ici. [...] Après cinq ans, je
> vais devoir changer mes habitudes. »
> — Romane Bellerre, 2★, 29 juil. 2026

## App Store Jow, page 1 du flux RSS (lu de première main)

4 des 5 premiers avis rendus portent sur le passage au payant :
- 1★ « Tout est passé payant » / « Application inutilisable sans payer ! » — hhphdulnv
- 1★ « Dommage » — Gawk sis : « Nous sommes obligés d'être affilié à une enseigne ou à payer un
  abonnement pour pouvoir changer son menu ou générer une liste de course. »
- 1★ « Payant… » — Rem911 : « Je veux perdre du poids pas de l'argent ;) »
- 4★ « Déçu » — Aangel672 : « aujourd'hui j'ai une notification qui me demande de m'abonner pour
  pouvoir continuer à l'utiliser.. c'est hors budget pour moi je désinstalle.. dommage !!! »

→ Signal double et contradictoire à tenir : le marché SE MONÉTISE (bon pour le seuil ③),
  et la monétisation FAIT PARTIR (mauvais pour un prix à 12,99 €).

## Autocomplétion Google FR (lu de première main)

`q=menu semaine` → menu semaine / menu semaine facile et rapide / menu semaine facile et rapide
pas cher / **menu semaine famille** / menu semaine 37 / **menu semaine famille 4 personnes** /
menu semaine facile et rapide équilibré / menu semaine régime ménopause / menu semaine équilibré /
menu semaine pour côlon irritable
→ 2/10 mentionnent la famille ; 0/10 mentionne des besoins différents par personne.

`q=comment organiser les repas` → de la semaine / d'un bébé de 7 mois / d'un bébé de 6 mois /
d'un bébé de 5 mois / de bebe / d'un bébé de 8 mois / comment preparer les repas pour la semaine /
comment gérer les repas de la semaine / comment preparer les repas so shape / des repas de bébé
→ 6/10 portent sur le BÉBÉ. Aucune sur un foyer à plusieurs profils adultes.

---

## Deux planificateurs FRANÇAIS que personne n'avait listés (trouvés et lus de première main)

| appli | id | note | nb avis | prix abonnement | MàJ |
|---|---|---|---|---|---|
| Batchii - Mon Batch Cooking | 1522027905 | 4,43 | **42** | **Mensuel 9,99 € / Trim. 22,49 € / Annuel 59,99 €** | 2026-08-20 |
| GoodSesame \| recettes & menus | 1532374008 | 4,58 | **101** | Mensuel 9,99 € / Trim. 24,99 € / Annuel 49,99 € (plusieurs offres affichées) | 2026-09-01 |

Sources : `itunes.apple.com/lookup?id=…&country=fr` et `apps.apple.com/fr/app/id…` (section Achats intégrés).

**Fait d'échelle, central :** les applis françaises DÉDIÉES à la planification hebdo pèsent 42 et
101 avis. Jow, généraliste + courses, en pèse 45 902 ; Marmiton 139 152. La niche « planification »
en tant que telle est minuscule ; c'est la niche que Sophia vise.

### Batchii — les 14 avis de la page 1 lus intégralement (comptage de première main)

- avis lus : 14 ; dont 1-3★ : 6
- mentionnant des **besoins différents par personne** dans le foyer : **0**
- mentionnant le **prix comme motif de rejet** : **4 sur 6 des avis négatifs**

Le meilleur fait de niveau B de toute l'étude sur le PRIX — il nomme le substitut réel, le livre :
> « Très bon appli mais trop cher ! 10€/mois soit 120€/an on peut acheter 5 livres par an à ce
> prix là Il faut revoir la politique de prix »
> — absolutben, 2★, App Store FR
> https://itunes.apple.com/fr/rss/customerreviews/page=1/id=1522027905/sortby=mostrecent/json

> « Hors de prix pour une application de recettes assez limitées au final. »
> — VioletGeneve, 2★, titre « Aussitôt installée aussitôt désinstallée »

> « Hélas je ne donnerai pas suite… l'abonnement mensuel est trop coûteux pour moi. »
> — Coline39, 3★

> « cela aurait été bien d'ajouter qu'il n'y a que 12 jours d'essai gratuit et qu'ensuite un
> abonnement payant démarre…. J'ai désinstaller l'application finalement. »
> — meunou2804, 1★

**Ce que Batchii sait DÉJÀ faire, dit par ses utilisateurs — le nombre de convives, pas les corps :**
> « Parfait pour planifier ses menus et personnaliser en fonction du nombre de personnes. »
> — Hugo Plt, 5★
> « J'ai pu choisir mon nombre de repas par semaine, le nombre de personnes à table et des plats
> végétariens sans problème ! »
> — Lorottea, 5★

→ Le marché sait déjà faire « combien de parts ». Personne, dans ce corpus, ne demande
  « des parts DIFFÉRENTES ».

Seule occurrence de « proportion », encore une fois sur les ingrédients, pas sur les convives :
> « les recettes sont très mal proportionnées.. 8 oignons pour faire une tarte à l'oignon.. 2
> oignons pour faire une salade de riz pour 3 personnes »
> — Quidia, 3★

## Autocomplétion, suite (première main)

`q=je ne sais pas quoi` → **« je ne sais pas quoi manger ce soir » arrive en 3e position**,
« je ne sais pas quoi faire a manger » en 6e, « je ne sais pas quoi manger » en 7e.
→ La douleur GÉNÉRIQUE de la décision du soir est massive et documentée.
→ Aucune suggestion ne porte sur des besoins différents par personne.

## ⚠️ Rejeté pour absence de source

Une réponse de moteur de recherche a affirmé des tailles de groupes Facebook
(« plus de 100 000 membres », « 69k membres ») SANS URL ouvrable vers le groupe.
**Non retenu.** Aucun groupe Facebook n'a été ouvert ni vérifié à ce stade.

---

# ⚑ LE CŒUR DE L'ÉTUDE — la promesse de Sophia est DÉJÀ construite, et par personne connue

Vérifié de première main, page par page, le 2026-09-07.

## 1. « Portions Meal Planner » (ex-Zest), Moonlighter Apps LLC — App Store US

https://apps.apple.com/us/app/portions-meal-planner/id6744140502
Métriques : `itunes.apple.com/lookup?id=6744140502&country=us`
- **Sorti le 2025-10-02**, dernière MàJ 2026-06-18
- note 5,0 — **userRatingCount : 2**
- Basic **4,99 $/mois** (jusqu'à 2 profils) — Premium **9,99 $/mois** (jusqu'à 9 profils)

Description officielle, verbatim — c'est mot pour mot la promesse de Sophia :
> « One plan, one grocery list, for the whole household. Set up a Profile for each person who
> eats from the plan, with their own macros and calorie targets. Cook one meal for everyone or
> different meals for different Profiles. Portions still gives you a single coherent week and a
> single shopping trip, with nutrition that stays accurate per Profile, all the way down to the
> last swap. »
> « • Multi-Profile Households: separate goals per eater, one shared plan. »

**Et le modèle tarifaire est aussi celui de Sophia : un socle + un plafond de profils.**

Les 2 seuls avis (flux RSS US, l'appli s'appelait « Zest ») valident la fonction :
> « I can create separate profiles for each person in my household, which is a lifesaver since we
> all have different dietary needs. »
> — ELMO1850, 5★
> https://itunes.apple.com/us/rss/customerreviews/page=1/id=6744140502/sortby=mostrecent/json

→ **Onze mois en ligne, 2 notes.** La fonction ravit les rares qui la trouvent ; presque personne
  ne la trouve. Ce n'est pas une preuve que le besoin n'existe pas : c'est une preuve que ce
  besoin, seul, ne fait pas venir les gens.

## 2. PlateSync — https://www.getplatesync.com/ — produit VIVANT

> Titre : « Everyone at the table gets exactly what they need »
> « PlateSync builds weekly meal plans with per-person portions based on each family member's
> health profile. »
> « Protein, calories, and portions personalised for every family member — from toddlers to adults. »
> « Targets adjust per day based on each person's weekly training schedule. More food on training
> days, less on rest days. »

Prix : gratuit (1 utilisateur, 20 recettes) — **Family 7,99 AUD/mois ou 69,99 AUD/an**, essai 30 j
sans carte. Inscription ouverte sur app.getplatesync.com.
→ ~4,80 €/mois pour toute la famille. **Sophia à 12,99 € + 1,99 €/profil est très au-dessus.**

## 3. Balanceat — https://balanceat.app/meal-planning-app/ — EN BÊTA, pas encore un produit

> « each member has their own profile, calorie and macro needs. The plan covers everyone, and the
> grocery list accounts for all portions. »
> « Free during the beta — we're building it with our first 100 users »
→ Encore un acteur sur la même promesse, qui n'a pas dépassé les 100 premiers utilisateurs.

## 4. ⭐ Eat This Much — LE LEADER DOCUMENTE LE TROU ET REFUSE DE LE COMBLER

https://help.eatthismuch.com/help/how-does-the-family-meal-planning-work
> « This won't automatically handle multiple people's different nutrition targets for you, but
> there are some workarounds you can try. »
Le contournement officiellement recommandé :
> « Set the planner's nutrition targets to match whoever's targets are the lowest of the two of
> you » — puis la personne qui a les besoins les plus élevés ajoute un repas séparé d'environ
> 400 calories par jour.

**C'est la pièce la plus forte de toute l'étude, et elle coupe dans les deux sens :**
- POUR Sophia : le problème est assez réel pour que le leader du secteur lui consacre une page
  d'aide, et la solution qu'il propose est humiliante — « nourris tout le monde au plus petit
  appétit et rajoute une collation ». C'est exactement le trou que Sophia comble.
- CONTRE Sophia : Eat This Much, qui planifie algorithmiquement depuis plus de dix ans et sait
  parfaitement calculer des besoins individuels, a **choisi de ne pas le construire**.

## 5. Non vérifié — AdaptiMeal

https://adaptimeal.com/ et https://www.adaptimeal.com/ → **HTTP 403 Forbidden** les deux fois.
Un résumé de moteur de recherche prête à ce site la promesse « one meal plan for the whole family
[…] from one pot while meeting different calorie needs ». **Je n'ai pas pu ouvrir la page :
cette affirmation n'est PAS retenue comme fait.**

## Repères de taille (iTunes FR, première main)

- Yazio : 141 849 avis — MyFitnessPal FR : 51 597 — Cal AI : 12 052
→ Le suivi calorique MONO-personne pèse des dizaines de milliers d'avis en France.
  Le planificateur MULTI-personnes en pèse 2 (Portions) et 42 (Batchii).

---

# COMPTAGE CONSOLIDÉ — seuil ② (saillance de la douleur spécifique)

| corpus | avis lus | dont 1-3★ | mentions foyer/portions/régimes | dont « portions DIFFÉRENTES par personne » |
|---|---|---|---|---|
| Moi — Jow Trustpilot p1 | 20 | 20 | 0 | 0 |
| Moi — Batchii App Store p1 | 14 | 6 | 0 | 0 |
| Agent — Marmiton | 450 | 354 | 14 | **0** |
| Agent — 750g | 150 | 71 | 1 | 0 |
| Agent — CuisineAZ | 14 | 1 | 0 | 0 |
| Agent — 13 applis FR (Frigo Magic, Kuri, Jow, Basta, Eatr, Mes menus, etc.) | 1 017 | 464 | ~37 (8 %) | **1** |
| **TOTAL** | **~1 665** | **~916** | **~52** | **1** |

**Le seul avis, sur ~1 665, qui formule la thèse de Sophia** (à vérifier en phase 5) :
> « Nous avons plusieurs repas dans la famille et j'aurais pouvoir dupliquer les planning repas
> pourque chacun ai le sien »
> — Planificateur Menu Semaine, avis 1-3★, titre « manque des options »
> https://itunes.apple.com/fr/rss/customerreviews/page=2/id=6460821436/sortby=mostrecent/json

→ Seuil ② : les mentions « foyer/portions/régimes » au sens LARGE tournent autour de **5,7 %**
  (52/916) — bas de la fourchette « douleur réelle mais secondaire ».
→ Mais au sens STRICT de la thèse Sophia (des quantités différentes par personne à la même table),
  c'est **1 sur ~916, soit 0,1 %** — très en dessous du seuil de 5 %.
  Ce que les gens réclament réellement, dans l'ordre : le paywall, les bugs, les filtres de régime.

# LE CIMETIÈRE FRANÇAIS (agent, App Store FR, écarts de MàJ au 2026-09-07)

Mortes ou abandonnées : **Menus - Planificateur de repas** (244 avis, 4,63 — morte depuis 37 mois,
et c'était la seule établie qui calculait les quantités selon le nombre de personnes) ·
Chefclub (2 511 avis, 48 mois) · Mes menus (1 215 avis, 24 mois) · Cuisine Actuelle (13 004 avis,
28 mois) · Frigo Magic (3 001 avis, 21 mois) · Semainier · Bemeal · Miam · Planificateur de Repas IA.

Nées en 2026, revendiquant explicitement la thèse « plusieurs corps », **17 avis à elles trois** :
- **Repa** (id 6800404662, 1 avis, 5,99 €/m) : « Deux adultes et un enfant de six ans ? Les portions suivent. »
- **Tablée** (id 6762468127, 7 avis) : « Age des enfants (du bébé à l'adolescent) pris en compte »
- **BAEAT Casher** (id 6760655030, 9 avis) : « nombre de personnes, âge des enfants »

Plus de **25 applis « menu semaine » sorties/mises à jour en 2026 avec 0 à 5 avis**.
→ Le marché n'est pas vide : il est **saturé de nouveaux entrants sans aucune traction**.

# CE QUE LES GÉANTS FR NE VENDENT PAS

Marmiton, CuisineAZ et 750g monétisent la **publicité** (et du papier : magazine Marmiton 29 €/an),
**aucune fonction produit**. Marmiton a **supprimé** son planificateur hebdo en janvier 2023 (v7.1.1),
et des utilisateurs le réclament encore en 1-2★. Jow : « quantités ajustées à votre foyer » — mais
le foyer y est un **scalaire** (un nombre de couverts), jamais des corps distincts.

# ⚠️ DIVERGENCE DE ROUTE À NOTER DANS LE RAPPORT

Deux agents ont eu **HTTP 403 (challenge AWS WAF)** sur `fr.trustpilot.com`.
**Moi, j'ai lu Trustpilot avec succès** (20 avis Jow verbatim, page 1, filtre 1-2-3★).
→ Trustpilot est donc accessible par intermittence. Mes données Trustpilot de première main
  restent valides ; l'absence de Trustpilot dans deux rapports d'agents est un trou de collecte,
  pas une preuve d'inaccessibilité.

---

# SEUIL ③ — LE PRIX. Le fait le plus dur de l'étude.

Prix relevés sur les fiches App Store FR (section « Achats intégrés ») et pages tarif officielles.
Jow vérifié de première main : https://apps.apple.com/fr/app/id1301257625
> « Plan mensuel 2,99 € » · « Plan semestriel 9,99 € » · « Plan annuel 34,99 € »

| service | €/mois | €/an | portée |
|---|---|---|---|
| **Jow (leader, 45 907 avis)** | **2,99** | **34,99** | foyer = un scalaire |
| Liste Courses & Repas | 1,99 | 8,99 | — |
| 750g Premium | 1,99 | 9,99 | retrait de pub |
| Menu de la Semaine (JOJO) | 3,99 | 17,99 | — |
| Kuri | 4,99 | 39,99 | — |
| Repa (né 2026, 1 avis) | 5,99 | 34,99 | revendique les portions par personne |
| Samsung Food | 7,99 | 69,99 | — |
| Basta Batchcooking | 7,99–9,99 | 39,99–74,99 | — |
| **Batchii** | **9,99** | 59,99 | « trop cher » dans 4 avis négatifs sur 6 |
| GoodSesame | 9,99 | 49,99 | — |
| CROQ' (perte de poids, individuel) | 14,99 | — | **un corps**, pas un foyer |
| PlateSync (AU, portions par personne) | ~4,80 (7,99 AUD) | ~42 | famille entière incluse |
| Portions Meal Planner (US) | 4,68 (4,99 $) / 9,36 (9,99 $) | — | 2 profils / 9 profils |
| **SOPHIA — foyer de 2** | **14,98** | 180 | |
| **SOPHIA — foyer de 4** | **18,96** | **227** | |

**Ce que ça donne franchement :**
- Sophia pour un foyer de 4 coûte **18,96 €/mois**, soit **6,3× le prix annuel de Jow**
  (227 € contre 34,99 €) et **2× l'appli la plus chère du marché de la planification** (9,99 €).
- Le seul acteur français au-dessus de 15 €/mois (CROQ', 14,99 €) vend un **objectif individuel
  de perte de poids**, pas un service de foyer.
- Les deux produits au monde qui font la promesse exacte de Sophia la vendent **moins cher qu'elle
  pour la famille entière** : PlateSync ~4,80 €/mois, Portions 9,36 €/mois pour 9 profils.
- Et à 9,99 €, Batchii se fait déjà répondre : « 10€/mois soit 120€/an on peut acheter 5 livres
  par an à ce prix là ».

→ Verdict du seuil ③ : des payants existent bien entre 2 et 10 €/mois, donc **le principe de
  l'abonnement est acquis**. Mais **12,99 € + 1,99 €/profil sort de la fenêtre observée**, et la
  structure « on paie plus quand on est plus nombreux » va à contre-courant de tout le marché,
  où être plus nombreux ne coûte rien de plus.

---

# PHASE 2 — forums français : 5 surfaces sur 9 sont INACCESSIBLES

magicmaman.com, aufeminin.com, doctissimo.fr, marmiton.org (forum), parents.fr : refusés.
jeuxvideo.com : HTTP 403 sur chaque fetch — **aucun message JVC lu**. vegeweb.org : 403.
momes.net : accessible mais **n'a pas de forum**.
→ Les forums de parents et de femmes, là où la charge mentale des repas se raconte, sont
  **hors de portée de cette étude**. Trou structurel, à écrire au rapport.

Sur ce qui a pu être ouvert (hardware.fr, lesfoodies) : **27 messages lus, 1 « plusieurs corps »
(3,7 %)**. En allant chercher les communautés définies par une contrainte (minceur, allergie,
végétarisme) : 46 messages lus, 11 « plusieurs corps » (23,9 %).

**L'observation la plus utile de toute la phase 2 :**
> la douleur « plusieurs corps » existe, mais elle ne se raconte pas dans les forums de repas —
> elle se raconte dans les forums de la contrainte.
→ C'est un problème de **canal d'acquisition** autant que de produit.

Et quand le foyer a réellement des régimes contradictoires, la solution décrite n'est **jamais**
un outil : c'est la délégation, l'imposition, ou la modulation à l'assiette :
> « Notre diner hier soir : tarte a la carotte. Cuisinee sans sel pour nous tous, les adultes
> salent dans leur assiette, servie avec une salade verte pour nous, des tomates cerises pour
> elle.... » — CecB, https://www.linecoaching.com/forum-topic/manger-sereinement-table-avec-des-enfants
> « certains cuisinent deux plats totalement différents ou alors chacun cuisine son plat de son
> côté. Chez nous cela ne colle pas. » — France Tronel,
> https://www.commentjaichangedevie.fr/vie-famille-divergences-alimentaires/

Aucun niveau A sur les forums. Aucun bricolage tableur/Pinterest/ardoise sur 46 messages.

---

# VÉRIFICATIONS DE PREMIÈRE MAIN (phase 5, anticipée sur les citations porteuses)

✅ **VÉRIFIÉE** — la seule citation, sur ~1 665 avis, qui formule la thèse de Sophia :
> « Nous avons plusieurs repas dans la famille et j'aurais pouvoir dupliquer les planning repas
> pourque chacun ai le sien »
> — gothysmeeth, **3★**, titre « manque des options », appli « Planificateur Menu Semaine »
> https://itunes.apple.com/fr/rss/customerreviews/page=2/id=6460821436/sortby=mostrecent/json
Note : il demande **un planning par personne**, c'est-à-dire de DUPLIQUER l'outil — pas un plat
commun décliné en portions. Ce n'est donc même pas tout à fait la promesse de Sophia.

✅ **VÉRIFIÉE** — Repa, née le 2026-08-25 (1 avis), vend déjà le positionnement de Sophia :
> « ADAPTÉ À TA VRAIE VIE Deux adultes et un enfant de six ans ? Les portions suivent. […]
> Allergie aux arachides, halal, végétarien, low-carb ? Filtré dès le départ, chaque semaine. »
> « La plupart des applis te donnent un calendrier vide et des recettes : le travail reste pour
> toi. Repa décide. Tu ouvres, et la semaine est déjà là. »
> https://itunes.apple.com/lookup?id=6800404662&country=fr — 5,99 €/mois · 34,99 €/an

## ⭐ SEUIL ④ — LE CONTRE-EXEMPLE LE PLUS LOURD : Marmiton a construit puis TUÉ son planificateur

Marmiton (139 152 avis, la plus grosse marque culinaire française) a eu une fonction « ma semaine »
de planification des repas. Elle a été **supprimée en janvier 2023 (v7.1.1)**, remplacée par un
« panier ». Les utilisateurs la réclamaient encore un an après. Vérifié de première main :
https://itunes.apple.com/fr/rss/customerreviews/page=3/id=318796083/sortby=mostrecent/json
> « Je trouve ça très décevant que l'option de planning pour planifier les recettes est été
> supprimé » — kexflex, 1★, 2023-01-16, titre « Planning »
> « c'est une grosse perte de plus pouvoir préparer son planning de la semaine »
> — Idriss Cagnet, 2★, 2023-01-18, titre « Plus de semaine »
> « la fonction « semaine » pour planifier les repas à disparu ainsi que mes recettes »
> — st.deshayes, 3★, 2023-01-08, titre « Disparition de la fonctionnalité « semaine » »
> « Dommage que la création de menu ne fonctionne plus. C'était vraiment pratique. »
> — BluishPinkSpirit, 4★, 2024-01-29
> « La fonctionnalité « ma semaine » ne fonctionne pas, c'était pour cette fonctionnalité »
> — Ade-duf, 2★, 2022-12-04

→ L'acteur qui avait la plus grosse distribution de France a jugé que la planification hebdo ne
  valait pas d'être maintenue. C'est le cimetière le plus parlant de l'étude : pas une startup
  sans moyens, mais le leader, qui abandonne la fonction même que Sophia vend.

## Jow ne fait PAS les corps — vérifié de première main

https://itunes.apple.com/lookup?id=1301257625&country=fr — description officielle :
> « Jow vous recommande des recettes sur mesure selon vos goûts, votre foyer et vos ustensiles. »
> « Moins de gaspillage grâce aux quantités ajustées à votre foyer. »
> « Dites-nous qui vous êtes (foyer, goûts, régimes, ustensiles) »
La description ne contient **aucune** occurrence de « enfants », « adultes » ni « allergies ».
→ Le « foyer » de Jow est un **scalaire** (un nombre de couverts) + des régimes **globaux**.
  Le trou que vise Sophia est donc **réel chez le leader**. (jow.fr/faq → HTTP 404.)

---

# SEUIL ③ COMPLÉTÉ — les payants français confirmés

| service | €/mois | €/an | preuve de payeurs actifs |
|---|---|---|---|
| **Cookidoo** (Vorwerk/Thermomix) | 6,00 (Apple) — « l'équivalent de 5 € / mois » (site) | **60** | **257 k notes App Store FR** ; « Je paye tous les mois mon abonnement depuis des années » |
| **CROQ'Kilos** | **14,99** | 144,99 | prélèvements réels documentés (145 €, 78,99 €, 40,99 €) ; cliente « depuis 2017 » |
| **Basta Batchcooking** (entrant 2026) | 7,99–9,99 | 39,99–74,99 | **1 300 notes en quelques mois** ; « payé un mois », « acheter l'abonnement à l'année » |
| Batchii | 9,99 | 59,99 | 42 notes |
| Jow | prix officiel **INTROUVABLE** (SPA) ; Apple : « Plan mensuel 2,99 € » | 19,99→49,99 | abonnement confirmé par une réponse officielle Jow du 25/08/2026 |

Page tarif Cookidoo : https://cookidoo.fr/foundation/fr-FR/get-subscription
> « Abonnement annuel / 60 € / an / (soit l'équivalent de 5 € / mois) »
> « Adaptez le nombre de parts de vos recettes selon vos besoins avec « Choix des portions » »
→ encore **un nombre de parts unique**, une assiette dupliquée.

CROQ : https://apps.apple.com/fr/app/id1527539073
> « Atteignez vos objectifs avec le rééquilibrage alimentaire CROQ pour seulement 14,99 € par mois »

**Réponse au seuil ③** : des payants existent bien entre 5 et 15 €/mois avec des utilisateurs
actifs (Cookidoo 5-6 €, Basta 8-10 €, Batchii 10 €, CROQ 14,99 €). **Au-dessus de 15 €/mois :
rien de confirmé.** CROQ plafonne pile à 14,99 € — et vend un objectif individuel, pas un foyer.

## 🔴 LA RÉSISTANCE AU PRIX EST DOCUMENTÉE, ET ELLE MORD DÈS 8 €

https://itunes.apple.com/fr/rss/customerreviews/page=1/id=6752601333/sortby=mostrecent/json
> « un abonnement mensuel de 7,99€ quand même ! Rien est accessible gratuitement, c'est dommage.
> […] à ce prix là, je m'achète un nouveau livre de batchcooking tous les deux mois »
> — @Polaup, 1★, titre « Prix excessif »
> « Trop cher. La com se base sur les économies à réaliser et on me demande 8€/mois. Je préférerais
> avoir de la pub. » — @Wattman_69, 1★, titre « 8€/mois »
> « Obliger de prendre un abonnement à 10€ par mois !!! » — @Bejilop, 1★, titre « Payant ! »

→ Deux corpus indépendants (Basta et Batchii) rendent le **même** verdict : à 8-10 €/mois, les
  Français comparent spontanément l'abonnement au **livre de batch cooking** et refusent.
  Sophia demande 12,99 € seul et 18,96 € à quatre.

## ⚠️ CORRECTION AU BRIEF — « Kitchendraft » n'existe pas

Vérifié trois fois : `dig` rend **0 enregistrement A** sur kitchendraft.com/.fr/.app/.io/.net ;
l'API iTunes rend `resultCount 0` sur « kitchendraft » et « kitchen draft » ; la recherche web ne
rend que **KitchenDraw** (logiciel de conception de cuisines, sans rapport).
→ Le concurrent listé dans le brief est un fantôme. À écrire au rapport.

## ⭐ LA CITATION QUI S'EN APPROCHE LE PLUS — et pourquoi elle ne prouve PAS la thèse

https://fr.trustpilot.com/review/croq-kilos.com?stars=1&stars=2&stars=3
> « Aucune possibilité. De le personnaliser en fonction de nos activités. Tout le monde a le même
> quota de calories, vraiment si j'avais su, je ne l'aurais pas pris. »
> — Annaick, 1★, 18 févr. 2026

C'est une **payante à 14,99 €/mois qui résilie parce que le programme donne à tous le même quota
calorique**. Niveau A + B, le plus fort de l'étude sur la personnalisation au corps.
**MAIS** : chez CROQ, « tout le monde » désigne l'ensemble des abonnés, pas les membres d'un foyer.
C'est une preuve que **la personnalisation au corps se paie et que son absence fait résilier** —
ce n'est **pas** une preuve que des corps différents à la même table soient une douleur.
Ne pas surinterpréter : c'est exactement le glissement que le brief interdit.

Autre payante CROQ qui part sur le goût du foyer :
> « Aujourd'hui je vois dans mes menus (que ça soit plaisir, famille ou petits budgets) que des
> choses végétarienne […] Et des plats qui ne correspondent pas du tout au goût de tout le monde »
> — Deborah Josse, 1★, 16 févr. 2026

## Chiffre à manier avec réserve (l'agent le signale lui-même)

Cookidoo « plus de 6 millions d'abonnés fin 2025, +14,5 % » —
https://www.direct-selling-magazine.de/umsatz-mit-thermomix-und-cookidoo-abos-betrug-2025-rund-21-milliarden-euro/
Chiffre **mondial**, obtenu via un outil qui résume la page, **non re-vérifié en HTML brut**.
Et Cookidoo est adossé à un robot à ~1 300 € : ce n'est pas un abonnement logiciel autonome.

---

# ⚠️ CORRECTION — le prix de Jow n'est PAS 2,99 €/mois

J'avais relevé « Plan mensuel 2,99 € » sur la fiche App Store. C'est **un SKU parmi dix**, et le
lire comme « le prix de Jow » est faux. État réel, après balayage complet :

- Apple, bloc Achats intégrés : « Plan mensuel 2,99 € », « Plan semestriel 9,99 € », et
  **cinq prix annuels différents** — 19,99 / 24,99 / 29,99 / 34,99 / 49,99 €.
  → **Jow est en train d'A/B tester ses prix.**
- Source tierce (happyparrain.com, maj 25/03/2026) : « Mensuel : 9,99 € / mois ».
- Ce que les utilisateurs disent payer en août-septembre 2026, verbatim :
  > « 11,99 € pour des recettes, ce sera sans moi. » — sassou002, 1★
  > « l'appli est devenue payante pour tout… 11€ par mois » — Najyåná, 1★
  > « rendre l'accès aux recettes créées par les users payantes (11e par mois, rien que ça) » — Okey-doke sweet monkey, 1★
  > « L'application est devenue payante à presque trois euros par semaine » — Fannylaw, 1★
- **Le prix officiel n'est publié nulle part de récupérable** : jow.fr/help est une coquille JS,
  0 occurrence de « abonn » et 0 montant en euros dans le HTML servi.

**Lecture honnête : le mensuel réellement facturé se situe autour de 10-12 €/mois.**
→ Conséquence sur le seuil ③ : Sophia à **12,99 € pour un foyer seul est DANS la fenêtre**,
  au niveau du leader. C'est le **+1,99 € par profil** qui la fait sortir : à quatre, 18,96 €/mois
  (227 €/an), soit au-dessus de tout ce qui est observé sur ce marché.
→ Et le passage au payant de Jow (juillet-août 2026) provoque une **vague de désinstallations**
  d'utilisateurs de 4 à 6 ans d'ancienneté. Le marché se monétise, dans la douleur.

# JOW — CHIFFRES DURS

- **3 500 000 utilisateurs actifs en France** (article du 21 février 2024) ; **33 M€ levés** au
  total, dont 13 M€ en série B — https://polesocietes.com/actualites/levee-de-fonds/jow-boucle-une-serie-b-de-13-millions-euros-pour-se-lancer-aux-etats-unis
- Revendication 2026 : « Déjà plus de 10 millions d'utilisateurs ont adopté Jow » (description App Store)
- Commission historique : « 0,99 euros TTC à JOW » par commande (CGU art. 8)
- Chiffre d'affaires : **introuvable** en source ouverte.

# JOW — LE COMPTAGE QUI COMPTE

**~540 avis balayés, dont 258 en 1-3★. Sur les 193 lus intégralement : 10 mentionnent
foyer/portions/régimes (5,2 %). Sur ~408 avis balayés au total : ZÉRO** n'exprime le besoin
« un plat cuisiné une fois, des quantités différentes par personne ». Aucun n'évoque un végane,
un enfant et un allergique à la même table.

Le seul avis en 3 ans qui conteste le calibrage des portions — et il parle d'adultes indifférenciés :
> « Les recettes ne sont pas très bien calibrés, souvent des recettes pour 4 ne font que 3
> personnes adultes et je ne suis pas un énorme mangeur. »
> — Yoann, 1★, 17 oct. 2023, https://fr.trustpilot.com/review/jow.fr?stars=1&stars=2&stars=3&page=3

Le plus proche de la thèse, et il demande des régimes **par repas**, pas par convive :
> « il serait sympa de choisir les régimes au moment où l'on choisit le nombre de menus. […]
> J'aurai aimé pouvoir dire je veux 6 repas sans régime, 1 repas végétarien et 3 repas sans
> gluten (par exemple). »
> — Tiboutch, 5★, https://itunes.apple.com/fr/rss/customerreviews/page=1/id=1301257625/sortby=mosthelpful/json

**L'aveu de conception, à retenir** — un utilisateur décrit le modèle de Jow tel qu'il est :
> « On a qu'à choisir le nombre de menus en fonction du nombre de personnes du foyer et selon le
> régime alimentaire de la famille » — inima_13, 5★
→ Le foyer de Jow = **UN nombre de personnes + UN régime familial unique**. C'est exactement la
  limite que Sophia vise. **Et personne ne s'en plaint.**

Les plaintes de régime sont toutes du type « le catalogue ne couvre pas MON régime »
(végane : 2 recettes ; diabétique type 2 : rien ; allergies au-delà du lactose/gluten : rien) —
c'est un problème de **profondeur de catalogue pour un régime unique**, pas de **réconciliation
de régimes**. La nuance décide de tout.

**Aucun niveau C** dans ce corpus : pas un seul avis ne raconte un tableur, un Pinterest ou un
planning papier.

## Vérifications de première main faites sur ce lot
✅ Annaick (CROQ, 1★, 18 févr. 2026) « Tout le monde a le même quota de calories » — RETROUVÉE
✅ Polaup / Wattman_69 / Bejilop (Basta, résistance au prix) — RETROUVÉES toutes les trois
