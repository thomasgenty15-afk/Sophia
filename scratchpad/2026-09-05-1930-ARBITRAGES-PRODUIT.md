# Arbitrages produit du 2026-09-05, 19 h 30 — pris par l'utilisateur

Posés par la session sophia-2-0f à la fin du mandat « production ready » en trinôme
(sophia-2-8a, sophia-2-74). Chaque ligne est une décision, pas une proposition. Le
« pourquoi » renvoie aux rapports du jour ; le « comment » est à écrire par le lot qui le porte.

| # | question | décision | ce que ça ouvre |
|---|---|---|---|
| 1 | Comment une assiette grossit quand la personne a un vrai besoin (boîtes à 89 % du besoin sur C03, plafond de masse 1,35 kcal/g et plafond de pot mordent 4 fois chacun avant densification) | **Plafond par densité mesurée** : une assiette peut peser plus si elle est dense ; le plafond se calcule sur la densité réelle du plat, pas sur un chiffre fixe. Compteur obligatoire (combien de fois il mord, avant/après). | lot génération, lane foyer + solo ; un tir avant/après sur C03 |
| 2 | « Garder » sur la carte « Ce que tu m'as dit » (page foyer) écrit `food_preferences`, que plus aucun générateur ne lit | **Rebrancher « Garder » sur les lignes retenues** (`retained_items`, que le générateur lit). La carte reste. | lot mémoire, front + port ; NOMENCLATURE §2.6 à réécrire (« fermé au lot C » devient « rebranché ») |
| 3 | Une note datée (« Léa danse le mardi, il lui faut un vrai repas ») arrive au modèle mais la boîte du mardi ne change pas | **Oui, d'une fraction fixe** : ce jour-là, la part de cette bouche augmente d'un cran fixe (ordre de grandeur +25 %, à fixer dans le lot). C'est ce que la phrase promet, et ce que NOMENCLATURE §8.1 phrase 6 promet déjà. | lot génération (enveloppe par bouche, `when` de la note) ; le banc des trois portes G6 devient mesurable |
| 4 | Lots orphelins α (composeur aligné sur l'entonnoir) et β (offre de cadence de courses) | **Corriger puis adopter, ensemble** : réparer la règle d'offre (miroir réel de `deriveCookingPlan`, `maxFridgeDays` compris, test dans les deux sens), documenter l'abandon des trois questions (`context`, `servings` solo, `from_pantry`) et retirer leurs lecteurs, puis poser α+β en un commit. | voir `2026-09-05-1735-CARTE-ARBRE-PROPRIETAIRES.md` §5 et le rapport R3 |
| 5 | Doctrine d'énergie sur un plan de FOYER quand un membre a son propre coach « on ne compte pas » | **Celle du foyer** (choix de 74 confirmé) : une casserole, une doctrine, celle du maître qui a composé ; le membre est protégé par son interrupteur et sa direction. | rien à coder ; `BOITES-PAR-REPAS.md` et l'en-tête de `box_energy_decision.ts` le disent déjà |
| 6 | Lecteurs morts `rhythmOverlayFor` / `logisticsOverlayFor` (0/0 depuis la campagne, encore servis dans les deux lanes) | **Retirer maintenant.** | petit lot génération ; la ligne `logistics.set` restante en base est à migrer ou à laisser mourir |
| 7 | Par quoi commencer | **Une campagne de mesure d'abord** : 20 à 30 générations sur des foyers variés (solo, couple, cinq bouches, un régime, une allergie), en comptant refus `mouth_unfed`, boîtes sous le besoin, plats carnés pour les omnivores, latence. On saura où on en est avant de toucher au code des arbitrages 1, 3, 6. | banc à écrire ; une génération à la fois ; Kong à 900 s ; runtime redémarré avant |

Ce qui reste hors arbitrage, et qui doit suivre : le `db push` des migrations `20260905180000` et
`20260905190000` et le déploiement (à la main de l'humain) ; `keel_properties/` hors du gate ; le
banc des clarifications sans cas `scope`.
