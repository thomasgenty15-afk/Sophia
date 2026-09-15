# Bêta autonome — contrat de lancement et plan d'exécution

## Objectif fixe

Un compte maître peut créer son foyer, renseigner les personnes et leurs contraintes, demander un plan, comprendre le résultat, faire les courses et utiliser les recettes sans intervention d'Ahmed ni d'un agent. En cas d'impossibilité ou de panne, le produit protège le plan existant et propose une suite compréhensible et réalisable dans l'interface.

Autonomie ne signifie pas que chaque réponse du modèle réussit. Elle signifie que le produit ne livre pas un résultat incorrect comme utilisable et que les échecs ordinaires n'exigent pas de dépannage manuel.

Ce document remplace les listes de travaux successives pour la décision de lancement. Les rapports précédents restent des preuves. Trois lots strictement séquentiels ; aucun lot ne se déclare terminé sur un test exécuté avant sa dernière modification.

## Périmètre et règles d'exécution

- Conserver une lane foyer, y compris à une personne. Le compte maître seul génère ; aucun nouveau droit de génération pour les secondaires.
- Couvrir N=1, N=2 et N=4, des présences différentes, des régimes différents et toutes les durées proposées par l'interface de la bêta. Une capacité non validée doit être indisponible explicitement côté UI ET API ; ne pas réduire le périmètre après un échec de test pour obtenir le feu vert.
- Conserver les règles nutritionnelles et les protections existantes, les références canoniques et les grammes finaux arrondis. Ne pas modifier une cible, une tolérance, une exclusion ou un plafond pour blanchir un cas. Ne pas présenter la vérification du calcul comme une validation clinique de ses hypothèses.
- Les préférences souples ne valent pas les exclusions impératives. Les protections et les cas sans cible doivent être couverts par les tests même si certains parcours ne proposent pas d'objectif chiffré.
- Les extras hors plan restent exclus. Un complément prévu dans le plan appartient au repas et participe à tous ses totaux.
- Réutiliser le banc, les modules de calcul et les composants UI existants. Pas de réécriture générale de `index.ts`, pas de nouvel orchestrateur concurrent, pas d'augmentation automatique du nombre de réparations.
- L'agent implémente et teste localement sans attendre une validation intermédiaire pour les corrections comprises ici. Aucun appel fournisseur payant dans les lots 1 et 2. Le lot 3 prépare un budget explicite avant toute campagne payante ; ce document ne vaut pas autorisation de dépense illimitée.
- Respecter `AGENTS.md` : déploiement Supabase, migrations appliquées, secrets et commandes interdites restent exécutés par l'humain. Préparer les fichiers et les commandes exactes seulement lorsque le résultat local est vérifié. Ne pas toucher aux données réelles pour fabriquer un cas de test.

## État de départ vérifié le 14 septembre

Lecture de `CLOTURE-FOYER-2026-09-14.md`, du rapport détaillé et des modules cités ci-dessous. Les mesures chiffrées du chantier précédent restent attribuées à ses artefacts ; cette préparation n'a relancé ni tests complets ni appels fournisseur.

| Constat | Point d'appui | Conséquence pour la bêta |
|---|---|---|
| Une attribution refusée est retirée si un plat de table a déjà été conservé | `meal_generation.ts`, lecture de `declaredFor`, `ownerOf`, `keptCells` | Le correctif dépend de l'ordre d'entrée et ne prouve pas qu'une variante nécessaire a été servie. |
| Le partage par boîte reste non fermé ; certains plats dédiés demandés disparaissent | Rapport de clôture, points 1, 6 et 8 | Présence d'un contenant et respect de la décision alimentaire doivent être vérifiés séparément. |
| Une incompatibilité de densité peut être représentée par un intervalle plafonné | `portion_sizing.ts:densityCorridorFor` renvoie aussi `incompatible` | Tous les consommateurs doivent traiter ce motif, pas seulement lire les deux nombres. |
| La garde construit `incomplete` mais choisit `state` seulement selon `blocking` et `gaps` | `final_plan_gate.ts:finalGateDelivery` | `conforme` seul ne garantit pas que les contrôles requis ont conclu. |
| La publication accepte des plans sans refus bloquant | `plan_publication.ts:decidePlanPublication` | Le contrat de publication de la bêta doit traiter explicitement les écarts essentiels et les mesures manquantes. |
| Le composant de validation évite déjà une fausse pastille verte et filtre les chiffres protégés | `PlanValidationNotice.tsx`, `api/planValidation.ts` | Conserver ces protections ; ne pas inventer un nouveau problème de pastille verte. |
| Réduction finale des parts sans réconciliation complète des préparations | Rapport, cas `sna1`, 277 g non servis | Réconcilier portions, cuisine et courses après les dernières mutations. |
| La demande non-draft a une limite client de 120 s ; le draft n'a pas cette limite explicite | `frontend/src/keel/api/planDraft.ts`, `functions.invoke` | Mesurer les deux parcours et aligner les délais. Les 546 ne peuvent plus être différés pour cette bêta. |

## Les critères qui décideront du lancement

Ils sont fixés avant les corrections. Toute évolution doit apparaître dans le rapport comme une modification de périmètre, jamais être intégrée silencieusement.

| ID | Garantie obligatoire | Preuve attendue |
|---|---|---|
| B1 | Chaque personne présente reçoit le repas prévu, avec une attribution sans ambiguïté et compatible avec ses contraintes impératives. | Contrat personne × date × créneau comparé aux ingrédients et parts finaux, y compris variantes et compléments. |
| B2 | Les objectifs et bornes utilisés proviennent des mêmes données et règles dans le calcul, le prompt, le contrôle et la réponse affichée. | Cas limites et traçabilité des entrées ; aucun couloir impossible envoyé comme faisable. |
| B3 | Aucun plan utilisable n'a d'écart essentiel non résolu ou de contrôle essentiel applicable resté inconnu. | Garde finale sur l'objet livré ; absence réelle d'activation en cas d'échec. |
| B4 | Grammes, calories, protéines, préparations et courses décrivent la même nourriture après arrondi. | Réconciliation des quantités finales ; restes explicites ; aucun ingrédient utile perdu ou compté deux fois. |
| B5 | Un incident ordinaire a une issue autonome et bornée dans le temps ; aucune double publication ou double consommation de quota due à la reprise. | Tests UI/API de délai, coupure, rechargement, double clic, erreur fournisseur, validation et concurrence. |
| B6 | Les protections d'accès et d'affichage survivent à tous les chemins de génération et de réparation. | Compte maître/secondaire/autre foyer, absence de cible, âge inconnu et profils protégés ; aucun chiffre interdit ni ingrédient exclu livré. |
| B7 | La version finale produit réellement assez de plans corrects, avec un coût et un délai compatibles avec la bêta. | Campagne réelle prédéfinie au lot 3 ; tous les échecs conservés dans le dénominateur. |

« Essentiel » comprend : exclusions, attribution, présence, quantités mesurables nécessaires, calories et protéines quand leur contrat s'applique, bornes, intégrité des références, cuisine/courses exécutables et conservation selon les règles existantes. Une préférence de variété ou un incident de journalisation sans perte de validation ne devient pas automatiquement bloquant.

## Lot 1 — Terminer le contrat alimentaire, de la demande à l'objet livré

### 1A. Attribution et variantes indépendantes de l'ordre

Fichiers principaux : `household_cells.ts`, `meal_generation.ts`, `portion_sizing.ts`, `swap_presence.ts`, `final_plan_gate.ts` et leurs appelants dans `generate-household-meal-v1/index.ts`.

1. Utiliser la décision de la grille pour distinguer repas partagé compatible, variante nécessaire, variante facultative et complément. Ne pas déduire ces obligations de ce que le modèle a réussi à écrire.
2. Résoudre les identités et les candidats d'une case avant de décider lequel conserver. L'ordre table → dédié ou dédié → table doit produire le même résultat fonctionnel. Ne jamais attribuer au hasard un plat dont le destinataire est invalide.
3. Si l'attribution d'un plat nécessaire échoue, conserver cette obligation comme défaut réparable de la bonne case. Ne pas transformer la suppression du plat en réussite. Une recette commune peut remplacer une variante seulement si elle satisfait réellement le contrat de la personne.
4. Fermer le partage par boîte : les ingrédients propres à une personne survivent au dimensionnement sans contaminer les autres parts. Si la représentation actuelle ne le permet pas proprement, utiliser les plats dédiés déjà supportés et normaliser la sortie vers cette représentation ; ne pas conserver deux modes dont un détruit les ingrédients silencieusement.
5. Traiter `swap.flagrant` à partir de l'obligation réelle, pas en rendant aveuglément tous les compteurs bloquants. Une préférence souple non suivie peut être annoncée ; une incompatibilité impérative non résolue empêche l'activation.
6. La cardinalité correcte est un repas logique par personne/créneau, éventuellement composé de plusieurs contenants. Ne pas interdire un complément valide sous prétexte qu'il existe deux contenants ; interdire deux repas concurrents accidentels.

Tests : deux ordres du même JSON, deux plats de table, identifiant inconnu, identifiant d'un membre du foyer non autorisé pour cette case, variante manquante, variante correcte, complément, membres absents, mélange végane/omnivore N=2 puis N=4, exclusion injectée après réparation. Prouver à la fois adoption du candidat correct et non-publication du candidat incorrect.

### 1B. Faisabilité, cible unique et vérité du verdict

Fichiers : `energy_target.ts`, `mouth_anchor.ts`, `portion_sizing.ts:densityCorridorFor` / `mergeCorridors`, `household_cells.ts`, `final_plan_gate.ts`, `plan_validation.ts`, `plan_publication.ts` et construction des prompts.

1. Tracer les données effectivement lues pour chaque personne : source du poids, activité, données manquantes, objectif, rythme, appétit, repas léger, présences et protections. Vérifier avec les fonctions de production la cible journalière et sa distribution, y compris les apports fixes conservés par le produit. Une fenêtre ne couvrant qu'une partie de la journée doit être contrôlée contre sa part de contrat, pas contre toute la journée.
2. Vérifier les branches protégées réellement appelées ; les commentaires évoquant `goalApplies` ne constituent aucune preuve. Corriger les commentaires s'ils sont seuls faux ; corriger le comportement si les objectifs interdits passent réellement. Ne pas rebrancher mécaniquement une fonction inutilisée.
3. Calculer le couloir exact puis son éventuelle représentation pour le prompt. Un intervalle vide, un plafond technique dépassé et une donnée manquante sont trois états différents. Ne pas inventer un intervalle faisable en rabattant ses deux extrémités sur 250.
4. Le plafond `MAX_ASKABLE_DENSITY_PER_100G` est une politique du moteur, pas une loi physiologique. Déterminer son statut explicite dans le contrat. Pour ce chantier, ne pas le relever pour faire passer Nils ; si la demande dépasse la capacité acceptée du produit, elle doit être traitée avant l'appel fournisseur.
5. Essayer la redistribution seulement dans les créneaux, les limites et les préférences que l'utilisateur a déjà autorisés. Si elle ne suffit pas, exposer une demande incompatible et une action UI concrète : modifier la répartition, le réglage léger ou ajouter un créneau. Toute modification d'un choix utilisateur doit être visible et validée par lui. Ne pas baisser sa cible calorique ou agrandir ses bornes silencieusement.
6. Une intersection de densité entre personnes est un filtre de faisabilité, pas une preuve de recette compatible. Conserver le contrôle des protéines, restrictions et parts finales. Modifier `repairabilityOf` uniquement si un cas faisable est bloqué et qu'un candidat validé pour tous en apporte la preuve.
7. Définir les contrôles requis par contrat. Distinguer « applicable et réussi », « applicable et échoué », « applicable et non mesurable/non exécuté », « non applicable avec motif ». Un dénominateur nul ne suffit pas à décider laquelle de ces situations existe.
8. Faire dépendre la publication bêta des contrôles essentiels, pas seulement du libellé `conforme`. Un plan déficient ou invérifiable peut être conservé comme diagnostic interne ; il ne devient pas un nouveau plan actif utilisable. Les écarts non essentiels peuvent rester visibles sans refus. Réutiliser les états existants quand leur sens suffit ; ne pas ajouter un second verdict divergent dans l'UI.
9. Remesurer l'objet final après toutes ses transformations, avant son écriture et son affichage. Aucun contrôle ne doit lire un instantané antérieur aux boîtes ou aux quantités finales. Préserver une ancienne version seulement si elle reste compatible avec les contraintes actuelles : une allergie nouvellement déclarée peut invalider l'ancien plan.

Tests : cas Nils avec données exactes de la fixture (ne pas recalculer sa distribution à partir du seul total 4 099), incompatibilité commune, cas faisable voisin, protéines sous cible, inconnue nutritionnelle, sans cible légitime, validation manquante, fenêtre partielle et contradiction préférence/calcul. Vérifier zéro appel modèle sur une impossibilité déjà établie avant composition.

### 1C. Une seule quantité finale et des recettes encore exécutables

Fichiers : `portion_sizing.ts:splitPlateWithComplement`, `portion_boundary.ts`, `quantity_render.ts`, finalisation des quantités/préparations/courses dans le handler, `final_plan_audit.ts`.

1. Fixer l'ordre : composition → allocation des parts → bornes du repas complet → arrondi pratique → réconciliation des préparations et courses → mesures et garde finales. Si une étape modifie une quantité après une mesure, remesurer les dépendances affectées avant publication.
2. Chaque préparation vérifie, dans la même unité prête à servir : produit = somme de tous les prélèvements sur la fenêtre + reste explicitement prévu. Les différences dues à la cuisson, aux unités ou à l'arrondi doivent être nommées, pas mélangées dans un ratio de tolérance globale.
3. Les courses dérivent des ingrédients nécessaires aux préparations finales et aux ingrédients directs. Distinguer surplus de conditionnement acheté et surplus réellement cuisiné. Ne pas réduire un pot destiné à plusieurs jours en oubliant ses futurs consommateurs.
4. Fermer le cas `sna1` : les 277 g non servis disparaissent de la préparation et des besoins d'achat ou deviennent un reste intentionnel, utilisable et déclaré. Ne pas transformer tout résidu de bug en « reste » pour obtenir l'égalité.
5. Garder les valeurs exactes pour les contraintes ; les grammes affichés sont ceux réellement utilisés dans les mesures. Le test 241,1 contre un plafond affiché à 241 ne doit pas échouer si le plafond exact applicable vaut 241,27. Inversement un dépassement réel ne disparaît pas par l'arrondi de l'affichage.
6. Corriger les écarts dus à l'arrondi avec une redistribution locale bornée qui préserve les proportions et les unités pratiques, puis remesurer ; pas de boucle illimitée ni de virgules réintroduites dans les portions.
7. Vérifier l'identité culinaire après dimensionnement : un ingrédient structurant du titre ou des étapes ne doit pas devenir une trace symbolique, comme 1 g de couscous. Réutiliser les garde-fous de proportion/identité existants ; distinguer ingrédient principal, condiment et décoration. Ne pas imposer le même minimum à l'huile, au sel et au féculent. Si la recette ne tient pas les contraintes sans perdre son identité, elle doit être recomposée, pas déclarée correcte parce que les calories passent.
8. Un retrait de consommateurs peut justifier des écarts d'arrondi, pas une réécriture nutritionnelle arbitraire des autres parts. Tester leur compatibilité finale et expliquer les variations ; l'identité au gramme n'est pas une obligation universelle.

Acceptation lot 1 : B1–B4 démontrés sur les fixtures nominales et adversariales ; B6 sur les chemins alimentaires. Les réponses originales restent immuables. Aucun défaut essentiel connu ne subsiste comme simple compteur.

## Lot 2 — Rendre le parcours autonome, y compris quand il échoue

Fichiers de départ : `frontend/src/keel/api/planDraft.ts`, `api/mealGeneration.ts`, `api/planValidation.ts`, `components/MealBuilder.tsx`, `components/plan/PlanValidationNotice.tsx`, `copy/planRefusals.ts`, `api/onboarding.ts`, `api/planRouting.ts`, le handler, `plan_publication.ts` et les mécanismes de quota/admission existants.

### 2A. Parcours utilisateur complet

- Partir d'un compte neuf : création du foyer d'une personne, saisie des informations requises, ajout de membres, présences, demande, aperçu, activation, rechargement, portions, recettes et courses. Aucun SQL manuel ni configuration cachée pour réussir le parcours.
- Toute incompatibilité nommée au lot 1 mène au bon réglage depuis l'interface, avec les saisies préservées. Aucun code brut ou message « contactez Ahmed » comme seule sortie d'un problème ordinaire.
- Un plan refusé reste absent des écrans qui le présentent comme utilisable ; un ancien plan préservé est clairement identifié comme ancien. L'aperçu et l'activation appliquent les mêmes garanties ; une modification du foyer entre les deux exige revalidation.
- Les explications restent compatibles avec les portes d'affichage. Une explication d'échec peut être utile sans exposer de calories ou d'objectifs protégés.
- Vérifier les usages qui modifient réellement le plan pendant la bêta : remplacement, changement de présence, recalcul des courses et activation d'un aperçu. Toute action exposée qui contourne la garde finale doit être raccordée ou désactivée explicitement pour cette bêta.

### 2B. Temps, reprise et publication unique

- Mesurer séparément lecture du contexte, premier appel, parsing, dimensionnement, réparation 1, réparation 2, validation et écriture. Tracer modèle réellement utilisé, configuration, repli fournisseur et temps restant ; ne pas supposer que « fast » résout un 546. Vérifier la configuration déjà demandée sans nouveau changement de modèle opportuniste.
- Un budget total couvre tous les appels. Ne pas démarrer une réparation qui ne laisse pas le temps de valider et publier. Conserver le plafond actuel de réparations (au plus deux appels de rattrapage), sans boucles imbriquées qui le dépassent.
- Aligner la limite client de 120 s, le délai serveur et le délai fournisseur sur les deux intentions draft/activation. Un timeout client n'est pas une preuve d'arrêt serveur : le produit doit pouvoir retrouver l'issue avant de relancer.
- Tester erreur 546, 429, réponse fournisseur invalide, réseau coupé avant/après écriture, rafraîchissement, double clic et deux onglets. Vérifier la déduplication côté serveur, pas seulement le bouton désactivé. Réutiliser l'identifiant de demande/admission existant ; ajouter une clé stable uniquement si la protection manque réellement.
- Une nouvelle tentative ne doit ni publier deux plans concurrents ni consommer deux fois le quota pour le même résultat logique. En cas d'état incertain, lire l'état connu avant toute nouvelle composition. Pas de remboursement local présumé si l'écriture a réussi à distance.
- Objectif de bêta : résultat terminal en au plus 120 s dans le parcours synchrone, avec une cible p95 de 100 s sur la campagne réelle et une issue UI explicite avant expiration. Ces nombres sont des critères produit proposés pour ce lancement, pas des garanties du fournisseur. Si le chemin ne peut pas les respecter, résoudre le budget ou mettre en place une exécution durable avec reprise avant lancement ; tout changement de SLO doit être décidé et documenté AVANT une nouvelle campagne, pas ajusté après ses résultats.
- Ne pas garder un processus Edge comme tâche de fond après sa limite de vie. Une éventuelle exécution durable exige un état persistant, une publication unique et des délais visibles. Ce n'est pas une refonte à engager sans preuve du besoin.

### 2C. Accès, observabilité et arrêt de la bêta

- Vérifier propriétaire/secondaire et isolement entre deux foyers par l'API : génération, statut d'une demande, plan, données des membres et courses. Réutiliser les tests d'autorisation/RLS existants ; ne pas conclure sur le seul masquage d'un bouton.
- Produire un relevé par demande relié à la version du code, du prompt, des contrats et du modèle : personnes/créneaux attendus, défauts par case et par étape, motifs de non-applicabilité, appels, temps, verdict et identifiant du plan réellement publié. Distinguer défaut unique et occurrences répétées dans plusieurs contrôles.
- Mesurer automatiquement les taux de premier jet, rattrapage utile, refus, demande incompatible, résultat inconnu, timeout/546, double écriture et écart cuisine/portions. Minimiser les données personnelles des journaux ; les rapports de bêta n'ont pas besoin d'exposer les profils ou prompts bruts.
- Vérifier le mécanisme permettant de suspendre les nouvelles générations tout en laissant lire les plans encore valides. Préparer le retour à la version précédente ; ne pas mettre à disposition un plan connu incorrect pendant un incident.
- La surveillance sert à détecter les incidents, pas à faire relire chaque plan humainement. Ne pas créer d'automatisation ni envoyer de message à des tiers dans ce chantier sans demande correspondante.

Acceptation lot 2 : B5–B6 démontrés par les vrais chemins UI/API, avec dépendances contrôlées pour les pannes. Un test de présence de chaîne dans un fichier ne suffit pas. Les changements de journaux doivent inclure `output_lock_journal_failed` dans la trace persistée quand possible, sans confondre échec de journal et échec de validation.

## Lot 3 — Version figée, campagne réelle et décision de lancement

### 3A. Matrice hors ligne sur le code final

Exécuter les tests des modules modifiés, le banc de mesure, `deno check` du handler et `scripts/agent-gate.sh`. Conserver les tolérances et les listes de tests connus ; un échec préexistant qui touche B1–B7 reste pertinent même s'il est dans une liste tolérée.

Rejouer après le dernier changement l'ensemble des références N=1/N=2/N=4 et les deux patches réels conservés, puis les cas de chaque section ci-dessus. La matrice minimale comprend : attribution dans les deux ordres, variantes nécessaires/facultatives, compléments, absence de cible, incompatibilité, protéines, arrondi, ingrédient principal devenu symbolique, pot partagé sur plusieurs jours, préparation non mesurable, incident de validation, changement de contrainte, reprise et accès d'un autre foyer.

Vérifier trois niveaux : verdict du moteur, contenu relu après écriture contrôlée, contenu effectivement affiché. Compter aussi les échecs attendus et les non-publications. Une correction synthétique adoptée est une preuve technique ; un ancien patch rejeté correctement peut être une réussite du test sans être une réparation utile.

Figer le commit testé ou, si l'arbre partagé ne peut pas être committé proprement, un manifeste des empreintes des sources, de la configuration et des fixtures. Aucune mesure réalisée avant un changement pertinent ne valide la version suivante.

### 3B. Tests réels, budget borné, pas de sélection après résultat

Préparer la campagne puis soumettre son coût maximal et l'environnement avant de payer les appels. Aucun recours aux données d'utilisateurs réels pour fabriquer les profils. En environnement déployé, faire appliquer par l'humain les opérations nécessaires conformément à AGENTS.md, puis vérifier la version servie.

Campagne proposée : **30 demandes complètes prédéfinies, six profils × cinq répétitions** :

1. N=1, objectif de perte, rythme courant.
2. N=1, objectif de prise, besoin élevé mais demande démontrée faisable.
3. N=1, maintien et préférences d'appétit/repas léger compatibles.
4. N=2, végane/omnivore avec variante alimentaire nécessaire selon le contrat.
5. N=2, objectifs et portions différents, préparations communes et cas de complément nécessaire.
6. N=4, présences variables, recettes partagées et variantes ; durées représentatives de celles offertes en bêta.

Inclure la durée maximale offerte au moins une fois dans chaque profil où elle est disponible. Les cas impossibles et protégés restent testés à part ; ils ne peuvent pas remplacer après coup des échecs de la série faisable. Le couple de pilotes N=2/N=4 compte dans les 30 si aucun code/configuration ne change ensuite.

Lancer d'abord ces deux pilotes séquentiellement. Arrêter immédiatement sur violation essentielle, timeout inexpliqué ou dépassement de budget ; pas de rafale pour espérer un bon résultat. Après passage, poursuivre la liste préétablie. Réserver un petit groupe de demandes au test de trois comptes indépendants concurrents pour mesurer la capacité réelle, et annoncer cette limite de charge pour la bêta.

Budget maximum théorique : 30 générations initiales + jusqu'à 60 réparations, en incluant les relances/replis fournisseur dans le budget total approuvé. C'est un plafond, jamais un objectif de consommation. Si le prix est trop élevé, faire d'abord les pilotes ; ne pas prétendre avoir passé le critère de lancement avec deux essais.

### 3C. Seuils d'ouverture de la bêta

- **Zéro violation de B1–B6 sur un plan activé**, y compris dans les tests de reprise ; zéro fuite entre foyers, ingrédient exclu, activation malgré validation manquante ou double publication.
- Sur les 30 demandes faisables, **au moins 24/30 utilisables sans appel modèle de réparation**, et **au moins 27/30 utilisables après le parcours automatique complet**. Le dimensionnement déterministe normal compte dans le premier jet ; les réécritures de composition doivent être tracées séparément. Au moins 4/5 résultats utilisables dans chacun des six profils.
- Les échecs restants aboutissent tous à une issue autonome explicite, sans nouveau plan incorrect ni ancien plan incompatible présenté comme solution.
- Au moins un appel de réparation réel utile à N=2 et un à N=4, sur la configuration finale. Si aucun cas naturel de la série ne déclenche ces chemins, préparer deux réparations ciblées supplémentaires sur défauts contrôlés, avec budget distinct ; elles prouvent ces chemins et ne modifient pas le taux des 30 générations.
- p95 de bout en bout ≤ 100 s pour le parcours synchrone proposé, aucune attente UI sans issue au-delà de 120 s, zéro 546 inexpliqué dans la campagne. En cas d'architecture durable validée, appliquer le SLO approuvé avant la campagne, pas celui inventé après mesure.
- Revue des recettes finales d'au moins un plan par profil avant ouverture : titres, ingrédients structurants, quantités pratiques, étapes, matériel, durée et courses permettent réellement de cuisiner. Une relecture de lancement n'est pas une validation manuelle de chaque futur plan. Documenter les limites : aucune métrique ne prouve à elle seule le goût d'une recette.

Ces seuils sont des critères d'acceptation pour une petite bêta, pas une estimation précise de la fiabilité en population. Ils évitent à la fois d'ouvrir sur deux réussites sélectionnées et de promettre une perfection non mesurée.

### 3D. Ouverture et suivi initial

Commencer avec **10 à 20 comptes maîtres invités**, capables d'utiliser seuls le périmètre validé, sans revue systématique de leurs plans. Conserver la limite de charge testée. Offrir un signalement depuis le plan avec identifiant de demande, sans demander à l'utilisateur de comprendre les logs.

Durant la première semaine, suivre les mêmes B1–B7 et les mêmes définitions de taux. Une violation essentielle sur un plan actif déclenche suspension des nouvelles générations concernées, identification des plans affectés et correctif vérifié ; une baisse de fiabilité ou une série de timeouts suspend l'élargissement. Les communications externes et mesures sur des comptes réels suivent l'autorisation du propriétaire.

## Traitement des onze points du rapport précédent

| Point de clôture | Destination et décision |
|---|---|
| 1, partage par boîte | Lot 1A : support correct ou normalisation vers une variante dédiée fonctionnelle. |
| 2, arrondi/densité | Lot 1C : valeurs exactes, quantités finales et tolérances inchangées. |
| 3, `goalApplies` | Lot 1B : preuve des protections réellement appliquées ; commentaire seul faux = documentation. |
| 4, note de journal perdue | Lot 2C : trace persistée ; ne bloque pas seule un plan validé. |
| 5, dissident qui gèle | Lot 1B : corriger si cela bloque un cas nécessaire au périmètre ; pas de réécriture abstraite. |
| 6 et 8, variante nécessaire absente mais succès | Lots 1A–1B : défaut essentiel, non-activation tant que non résolu. |
| 7, ordre et deux plats de table | Lot 1A : résolution indépendante de l'ordre, cardinalité du repas logique. |
| 9, couloir impossible / ingrédient symbolique | Lots 1B–1C : faisabilité explicite et recette exécutable. |
| 10, portions restantes légèrement modifiées | Lot 1C : compatible et expliqué ; invariance absolue non exigée. |
| 11, pot non redimensionné | Lot 1C : réconciliation complète ou reste intentionnel déclaré. |

## Discipline de nos prochains allers-retours

Le rapport de chaque livraison tient en une table **B1 à B7 → état → version → preuve → défaut bloquant éventuel**, suivie des commandes exécutées et du coût. Ajouter les régressions démontrées, les anciens défauts découverts et les preuves manquantes dans trois catégories distinctes.

Une nouvelle découverte ne prolonge ce chantier que si elle casse B1–B7 dans le périmètre annoncé. Sinon, la consigner pour après la bêta. Ne pas appeler « arbitrage produit » une contradiction avec une garantie déjà acceptée. Ne pas ajouter un nouveau lot parce qu'un commentaire est imparfait.

Après correction d'un échec, rejouer le cas et les chemins dépendants ; refaire la matrice finale si la décision commune, le dimensionnement ou la publication a changé. Pour B7, ne pas mélanger les générations de versions différentes. Arrêter les appels payants avant correction plutôt que financer une campagne périmée.

Verdicts finaux autorisés : **bêta bloquée** (ID et preuve manquante), **correctifs vérifiés hors ligne — validation réelle restante**, ou **bêta autonome ouvrable dans le périmètre validé**. Le nombre de tests verts, l'exécution des trois lots ou un HTTP 200 ne remplace aucun de ces critères.
