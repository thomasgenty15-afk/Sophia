# Audit du plan et de la mémoire — campagne du 5 septembre, clôture le 6 septembre 2026

**Avis : mise en production déconseillée en l’état (NO-GO).** Les problèmes touchent les gardes de sécurité, la cohérence des consignes, le parcours de mémoire et la validation complète du plan après ses corrections successives. Des tests déterministes nombreux passent alors que des plans réels restent incohérents.

**21 requêtes réelles de génération lancées**, dont 15 réponses avec des plats et une adoption écrite en base. Ces réponses ne sont pas toutes conformes. Le détail des statuts, erreurs du banc, rejouages, quantités et latences est dans [RESULTATS.md](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/RESULTATS.md>) ; chaque point de la checklist a un statut dans [COUVERTURE.md](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/COUVERTURE.md>). Aucun déploiement ni correctif produit n’a été effectué par cet audit.

**Changement de version pendant l’audit.** Les appels réels du 5 septembre ont tous utilisé les mêmes sources : HEAD initial `54a1114aa46a1a9fae6ccc00660132d081e2c76d` + modifications locales, empreinte des modules partagés et endpoints `7dbdcc21e9973759c352173a965520cd1c5d74e05d6606c8c84604d7fb3b6b10`. Au retour le 6 septembre, HEAD est `fa224681c937ef89bc82d85d351505c38a027214`, empreinte `d95f31a2eee43130a1cfd2df077912035c3d026a23ae20bf7883b767c5c532bc`. Les correctifs intervenus entre-temps ne doivent pas être jugés sur les chiffres de la veille.

| Point | État vérifié le 6 septembre |
|---|---|
| Œufs malgré allergie ; lait sans lactose | **Toujours reproduits avec le vrai parseur du code actuel**, [current-egg-parser-probe.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/current-egg-parser-probe.json>) et [current-milk-parser-probe.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/current-milk-parser-probe.json>). Ce seul P0 justifie le NO-GO actuel. |
| « Garder » dans le foyer | Correctif `ede40358` : chemin vers les lignes retenues ajouté et branché dans la page du foyer. Recette réelle du nouveau bouton non faite ; ne plus présenter l’ancien défaut comme inchangé. |
| Explication solo | Correctif `e8709708` : consigne, extraction et retour ajoutés. Génération réelle après ce correctif non faite. |
| Jours de cuisine déclarés | Correctif `3d00d6e2` présent. Le cas B01 de notre banc était impropre à tester ce point. |
| Énergie et plafonds de masse | `092b2bba`, `a9de04dc`, `fa224681` modifient l’attribution, la densité et les aliments non résolus. Les manques chiffrés ci-dessous sont historiques, **à requalifier avec une nouvelle campagne réelle**. |
| Demande depuis le compte secondaire | Retirée des défauts : scénario artificiellement injecté, hors parcours maître ; la vraie porte refuse `not_owner`. |
| Adoption, fusion partielle, matcher, expiration next_plan | Les fichiers centraux concernés n’ont pas été modifiés par ces commits. Les observations réelles ci-dessous portent néanmoins sur la version du 5 septembre. |

La contre-vérification actuelle comprend **5 562 tests backend réussis, 1 ignoré ; 553 tests frontend réussis ; vérification de types des deux endpoints réussie**. Les 12 cas adversariaux du parseur conservent 6 acceptations dangereuses (variantes d’œufs et de lait), malgré ces suites vertes. Les quatre suites de propriétés exécutées le 5 septembre avaient 49 succès et 1 échec parce qu’un test lit un ancien `ProgressPage.tsx` absent : échec de banc, pas preuve d’une fuite TCA.

## Constats détaillés de la campagne du 5 septembre

Lire ces constats avec le tableau de version ci-dessus : certains ont depuis un correctif en code, sans recette réelle de ce correctif.

### P0 — La sécurité allergique laisse passer des œufs en génération réelle, et du lait dans le test adversarial

**Reproduction réelle A06-r2, HTTP 200 :** Tom est allergique à l’œuf dans `household_member_allergies` depuis avant la campagne. Le prompt archivé transmet explicitement `Tom: egg / eggs / oeuf — allergy, severity=medical`. Pourtant, le plan final contient `œufs` dans `prep_ravioli_shared`, avec `group = eggs`, et attribue à Tom une boîte utilisant cette préparation au déjeuner du lundi. Une seconde préparation de raviolis contient aussi des œufs.

Le test ciblé du vrai parseur confirme la cause : `oeuf` et `oeufs` sont rejetés, mais `œuf` et `œufs` sont acceptés. La normalisation retire les accents sans convertir la ligature `œ` en `oe`, et le catalogue ne donne que `oeuf`. Le groupe `eggs` déclaré n’empêche pas cette acceptation. Preuves : [A06-allergy-pizza-r2.response.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A06-allergy-pizza-r2.response.json>), `.raw.json`, [A06-current-allergies.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/A06-current-allergies.json>), [egg-parser-probe.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/egg-parser-probe.json>) ; source [forbidden_matcher.ts:76](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/forbidden_matcher.ts:76>), [allergen_surface_forms.ts:109](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/allergen_surface_forms.ts:109>).

Reproduction avec le **vrai `parseGeneratedMeal`**, les contraintes issues de `householdAllergyConstraints` et une réponse modèle construite pour attaquer la garde : `lait de vache` est retiré du plat et des courses ; `lait sans lactose` et `lait sans lactose de vache` sont conservés. L’ingrédient porte même le groupe `dairy_milk`. Le contrôle `boisson de riz` est correctement accepté. Ce sont des sorties adversariales synthétiques, pas une observation d’un modèle ayant réellement servi du lait à une personne allergique.

Le défaut se trouve dans les exceptions de négation du matcher : un `sans` après un terme peut neutraliser son interdiction sans vérifier ce qui est absent. « Sans lactose » ne signifie pas sans protéines du lait ([information hospitalière NHS](https://www.cuh.nhs.uk/patient-information/milk-allergy/)).

**À faire avant ouverture :** normaliser correctement ligatures, variantes Unicode et langues, puis tester les ingrédients usuels réellement produits. Dissocier allergène clinique, ingrédient et revendication « sans … » ; ne neutraliser que l’allergène explicitement absent ; conserver une garde indépendante sur la composition structurée et le groupe. Tester les formes françaises et anglaises, les dérivés, les produits composés et les négations imbriquées sur toutes les surfaces finales. Un allergène non reconnu doit provoquer un refus exploitable, jamais un assouplissement silencieux.

Preuves : [safety-parser-probe.ts](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/safety-parser-probe.ts>), [safety-parser-probe.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/safety-parser-probe.json>), [probes.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/probes.json>). Source : [forbidden_matcher.ts:359](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/forbidden_matcher.ts:359>), [allergen_surface_forms.ts:105](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/allergen_surface_forms.ts:105>).

### Historique P1 — « Garder » écrivait dans un magasin non lu (correctif présent le 6 septembre)

Le 5 septembre, « Garder » dans `FoodPreferencesCard` écrivait l’ancien magasin `food_preferences`, que les générateurs ne lisaient plus. Sur le compte QA Julie, « champignons » apparaissait sur `/app/about-you`, mais sa carte dans le foyer affichait « Rien pour l’instant ». Le nouveau branchement est désormais présent en code.

**À vérifier après le correctif :** conserver le sujet de chaque information déclarée par le maître et tester « le maître écrit pour Marc → la ligne apparaît sous Marc → le plan adapte Marc sans transformer cette ligne en règle de table ».

**Correction du périmètre après échange avec l’utilisateur :** les envies du plan commun sont réservées au maître. Le test réel [member-envy-access-probe.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/member-envy-access-probe.json>) confirme que le compte de Marc reçoit `{ok:false, reason:"not_owner"}`. Le rougail et l’exclusion courgettes de B04 avaient été injectés directement dans le magasin du compte secondaire par le script de fixture, pas déposés par un parcours utilisateur démontré. Leur absence du plan **n’est donc pas retenue comme défaut de production**. La non-lecture de ce magasin existe dans le code, mais ne justifie pas à elle seule d’élargir les droits ni le périmètre des envies. Les demandes du maître nommant un membre restent dans le périmètre de l’audit.

Sources : [FoodPreferencesCard.tsx:183](</Users/ahmedamara/Dev/Sophia 2/frontend/src/keel/components/FoodPreferencesCard.tsx:183>), [api/foodPreferences.ts:338](</Users/ahmedamara/Dev/Sophia 2/frontend/src/keel/api/foodPreferences.ts:338>) ; garde maître `supabase/migrations/20260810210000_household_envy_master_line.sql:174`. B04 prouve que les fajitas déclarées par le maître arrivent au plan ; il ne prouve pas un droit de demande du membre.

### P1 — Les repas peuvent être impossibles à exécuter après les corrections

Sur A03-r1, **le déjeuner et le dîner du mercredi consomment `prep_couscous_thu`, cuisiné le jeudi**. Les titres promettent aussi une ratatouille dont la préparation a été retirée. Pourtant, `meals_delivered.missing = 0`. Le modèle de relance a réparé cinq cellules par fusion partielle ; l’objet final n’a pas été entièrement revérifié sur le calendrier et les références.

Le rejeu A03-r3 rend même un aperçu sans **aucun déjeuner ni dîner sur les six jours** : douze cellules vides, zéro préparation, zéro boîte. Le compteur énergétique revient alors à zéro faute de boîtes à mesurer ; ce zéro ne signifie pas que les besoins sont couverts.

Sur A05, une seule session est bien rendue, mais deux repas du mercredi disparaissent après le contrôle de conservation et quatre repas de Nora restent manquants. C’est un **aperçu** : il annonce les trous, et cela ne prouve pas que son adoption les enregistrerait. En revanche, un test ciblé du calcul de complétude montre qu’un plan sans plat obtient `allFed = true` : les cellules entièrement vides sont volontairement hors du dénominateur. Le refus d’enregistrement `mouth_unfed` ne couvre que les personnes manquantes dans des cellules avec plat.

**À faire :** définir les cellules attendues depuis le rythme, la présence et la fenêtre, indépendamment des plats générés. À la fin de toutes les transformations, vérifier chaque cellule, chaque personne, chaque préparation, son jour de cuisson et sa disponibilité. Une fusion ne doit être acceptée que si l’ensemble final satisfait ces invariants. Un aperçu incomplet doit être explicitement non adoptable tant que la réparation ne réussit pas.

Sources : [retry_merge.ts](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/retry_merge.ts>), `generate-household-meal-v1/index.ts:6296`, `:6588` ; [meals_delivered.ts:187](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/meals_delivered.ts:187>), `:308`. Preuves : A03-r1, A05, [delivery-probe.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/delivery-probe.json>).

### P1 — Courses, conservation et texte du plan se contredisent

Sur A03-r1 : filets de colin achetés lundi, non marqués à congeler, cuisinés jeudi ; l’explication dit pourtant que le poisson est acheté près de la session du jeudi. La ligne de courses n’a pas de `food_group`. La table interne accorde un jour au poisson blanc ; l’absence de classification prive le contrôle de cette information.

Sur B01 : une seule course le samedi est annoncée ; tout le poulet est acheté samedi sans congélation, mais la session du mardi demande explicitement du poulet frais acheté mardi ou la veille. Le plan n’est donc pas réalisable en suivant simplement la liste et la session promises.

**À faire :** calculer les courses depuis les préparations et leurs dates finales, avec classification alimentaire connue ou signalement bloquant pour les denrées périssables inconnues. Une course unique doit produire soit une congélation explicite et ses dates de sortie, soit une demande claire de modification du nombre de courses. Régénérer rationale et explication depuis ces décisions finales.

Preuves : A03-r1 et B01, champs `shopping_list`, `cooking_sessions`, `rationale`, `explanation`. Le constat porte sur la cohérence avec les règles internes, pas sur une certification sanitaire de la chaîne du froid.

### Historique P1 — Des boîtes restent sous les enveloppes calculées (calcul modifié depuis les tirs)

A03-r1 : neuf écarts d’au moins 200 kcal avant densification, huit encore présents après. A05 : dix, puis dix. B02, couple perte de poids / prise de masse : douze, puis douze. Le texte ne donne pas d’explication utile de ces insuffisances. Ces compteurs décrivent l’écart à l’enveloppe **interne du moteur** ; ils ne constituent pas un diagnostic clinique.

Le couple reçoit bien des quantités différentes d’un même plat (par exemple, lasagnes 488 g pour Alice et 900 g pour Marc). Le routage des objectifs fonctionne donc partiellement ; ce n’est pas une preuve que les quantités finales atteignent l’objectif.

**À faire :** revérifier l’énergie après ajustement des masses et densification ; traiter ensemble taille des préparations, plafond de portion, densité et apports des autres repas. Un compteur ne suffit pas : imposer une réparation ou une sortie explicitement incomplète. Faire valider les règles nutritionnelles et les protections mineurs/TCA/grossesse par le responsable métier.

Ne pas confondre les anciennes alertes de masse dans `issues` avec le contenu final : un recomptage des masses après redimensionnement est fourni dans [final-masses.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/final-masses.json>). Certains pots sont corrigés ; d’autres restent non vérifiables faute de référence de composition.

### P1 — Les exclusions multi-mots sont mal interprétées, et une exclusion de table peut rester servie

Six contre-exemples déterministes montrent une tokenisation trop large : exclure « pain complet » frappe aussi « pain blanc » et « riz complet » ; exclure « pommes de terre » frappe « pommes » ; « noix de coco » frappe « noix de cajou » ; « beurre de cacahuète » frappe « beurre doux » ; « chou-fleur » frappe « fleur de sel ».

Dans B02, le plan rend réellement « Poulet rôti, salade, tomates et pain complet » malgré l’exclusion de table `pain complet`. La violation est reconnue dans `issues`, mais elle reste dans le plan et n’est pas expliquée dans `explanation`. À l’inverse, la demande de lentilles pour Alice produit bien une boîte d’échange pour Marc (`exclusion_belt.separated = 1`).

**À faire :** conserver l’expression alimentaire complète et ses synonymes, plutôt que l’union de ses mots. Distinguer un dégoût individuel avec échange autorisé d’une exclusion de table explicitement stricte. Vérifier le respect final après toutes les relances ; si un compromis est autorisé, le faire apparaître dans le texte réellement lu, avec la personne concernée.

Sources : [food_exclusion_belt.ts:135](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/food_exclusion_belt.ts:135>), `generate-household-meal-v1/index.ts:6033`, `:6076`. Preuves : B02 et [probes.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/probes.json>).

### P1 — Le régime minoritaire peut devenir celui de toute la table

A06-r2 produit `swap.flagrant = true`, avec zéro repas principal portant le composant animal attendu sur quatre. Le modèle de relance n’a pas corrigé ce point ; toute la table reçoit finalement une alimentation végétarienne au nom de Lea. La rationale le dit explicitement, ce qui évite une omission silencieuse mais ne respecte pas le critère produit. D’autres tirs (A03-r1/A05) réussissent à séparer les protéines : le comportement est instable.

**À faire :** vérifier les composants effectivement servis à chaque groupe après fusion, et ne pas traiter le drapeau comme un simple diagnostic. Le respect du régime de Lea doit être garanti, avec maintien des choix des autres personnes conformément au contrat défini par le maître.

### P1 — Certaines demandes au modèle sont contradictoires avant même la génération

B03, cinq personnes avec allergies d’enfants, régime végétarien, prise de masse et style minimal, retourne `422 draft_not_composed`. La trace brute explique pourquoi : le modèle rend tous les tableaux vides en invoquant un budget insuffisant de plats.

Le prompt réel limite la sortie à 36 plats, demande six moments chaque jour pendant six jours, annonce encore six plats dédiés, puis ordonne à Marc un plat séparé « At EVERY meal they eat here ». Ailleurs, seule sa collation est décrite comme propre à lui. Le modèle compte alors 60 plats et refuse. Son calcul suit la formulation générale, tandis que le serveur compte les seules cellules dédiées : le problème est déjà dans le contrat transmis.

**À faire :** produire une liste unique de cellules attendues, avec leurs personnes et leurs éventuels plats dédiés ; générer le budget et toutes les consignes depuis cette liste. Pour un shaker au goûter, limiter le plat propre à ces cellules, au lieu de dire « chaque repas ». Vérifier la satisfaisabilité du contrat avant de payer un appel modèle.

Preuve : [B03-minimal-five-allergy.raw.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/B03-minimal-five-allergy.raw.json>) (prompt et sortie) ; source [household_meal_generation.ts:1519](</Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/household_meal_generation.ts:1519>), `generate-household-meal-v1/index.ts:4471`.

### P1 — Adopter recompose un nouveau plan et réduit ses possibilités de réparation

`writeFromDraft` rappelle le générateur avec la même demande et `adopting_draft = true`, sans transmettre un brouillon serveur immuable. Cela lance un **nouvel appel modèle**. L’interface prévient de la recomposition : ce n’est pas un changement caché par le code. Mais l’adoption peut produire autre chose que le plan relu, et ce chemin saute les relances protéines, exclusions, repas manquants et séparation des régimes, avec un délai modèle de 100 secondes.

**Reproduction réelle C01 :** le même formulaire et la même note que B05 sont adoptés avec `prepare_next`. L’aperçu avait six boîtes et une explication ; le plan enregistré en base a zéro boîte et aucune explication. La trace persistée dit `boxes.expected = 8`, `boxes.boxes = 0`, `delivery = none_delivered`. Le serveur répond néanmoins 200. Ce défaut est observé sur un vrai plan écrit, pas seulement inféré du code.

**À faire :** conserver le brouillon validé côté serveur, identifié et daté, avec les versions des données personnelles utilisées. L’adoption doit revérifier ce brouillon puis l’écrire de façon idempotente. Si les données médicales ou la présence ont changé, demander une nouvelle composition explicite. Ne jamais réduire les garanties de qualité au moment où le plan devient réel.

Sources : [frontend/src/keel/api/planDraft.ts:480](</Users/ahmedamara/Dev/Sophia 2/frontend/src/keel/api/planDraft.ts:480>), `:616`, `:627` ; `generate-household-meal-v1/index.ts:1291`, `:5884`, `:6034`, `:6224`, `:6360`.

### P1 — Le cycle « prochain plan validé » ne se ferme pas sur le plan commun

C01 enregistre bien un plan `household`, mais `validated_at` reste nul. L’appel réel à `keel_validate_meal_plan` est refusé avec `not_a_personal_plan` : la RPC n’accepte que les plans personnels. Le lecteur des envies attend pourtant un `validated_at` postérieur à leur écriture pour les faire expirer. Le parcours de plan commun testé ne produit donc pas l’événement d’expiration promis.

La même note « fajitas » laisse deux entrées proches en mémoire (`Des fajitas pour le prochain plan` et `des fajitas`). Ce n’est pas une preuve que deux chaînes identiques ne sont jamais dédupliquées ; c’est un doublon sémantique réel dans ce cas.

**À faire :** définir l’événement de validation/adoption du plan commun, le produire dans le parcours maître et aligner tous les lecteurs sur lui. Préserver l’instant de la demande pour qu’un événement antérieur ne l’expire pas. Tester plusieurs notes le même jour, régénérations, refus, adoption et rechargement.

**Point positif vérifié :** « Tom est allergique aux noix de cajou », écrit par le maître dans la note d’adoption, crée bien une ligne `cashew` dans `household_member_allergies` pour Tom, enfant sans compte. Elle n’est pas transformée en simple préférence périssable. Preuve : [C01-child-allergies.json](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/C01-child-allergies.json>).

### P1 — Les délais locaux ne sont pas compatibles avec une requête HTTP hébergée ordinaire

Les réponses finales A03-r1 (174,8 s), A05 (169,3 s), B01 (201,1 s) et B02 (198,8 s) dépassent 150 secondes. Supabase documente un délai d’inactivité de requête de 150 secondes, ainsi qu’une durée maximale de worker de 150 s en gratuit / 400 s en payant ([limites officielles](https://supabase.com/docs/guides/functions/limits)). Le Kong local attend 900 secondes ; ses HTTP 200 ne prouvent donc pas que le même parcours fonctionne hébergé.

Deux appels sur un worker réutilisé finissent en 546 ; la somme des durées successives atteint environ 400 secondes. Des rejeux avec redémarrage du runtime avant chaque tir distinguent ce phénomène d’une lenteur propre au scénario. L’incident initial du client Node est documenté à part et exclu des conclusions de latence isolée.

**À faire :** lancer un job persistant, rendre immédiatement son identifiant, afficher son avancement et reprendre la lecture après déconnexion. Ajouter un budget global de temps/coût/relances, une clé d’idempotence, une limite de concurrence par utilisateur et une reprise après panne. Tester ensuite le déploiement réel et ses délais, pas uniquement localhost.

### P2 — Explication, fenêtre et diagnostics ne respectent pas encore le contrat produit

- Le 5 septembre, la lane solo ne retournait pas `explanation.lines`, y compris sur les cas réussis ; le correctif du 6 septembre reste à recetter avec le modèle réel. Le foyer rendait aussi des lignes vides (B04 et C01).
- Après fusion partielle, l’explication est encore extraite du texte de base. Après une relance d’exclusion acceptée, le plan change également sans mise à jour associée de `mealSourceText`.
- A05 annonce trois sessions puis une seule ; A01 annonce deux sessions alors qu’une seule est rendue.
- Après la coupure des courses à Paris, trois jours deviennent deux et sept deviennent six. Le texte le dit, mais le critère 38 exige de garder le nombre de jours. B01 Montréal conserve sept jours et retire les repas déjà passés du jour courant.
- Certains diagnostics exigés, dont `boxes_gate`, ne figurent pas dans les réponses draft observées. Absence de compteur ≠ zéro défaut.

**À faire :** trancher le contrat de fenêtre, unifier le contrat de sortie solo/foyer, produire les explications à partir du plan final et de décisions traçables, puis vérifier leur vérité. Garder les messages techniques dans les traces, et rendre les compromis compréhensibles en français.

## Ce que ces mesures ne prouvent pas

Un HTTP 200 n’est pas un plan conforme. Un contrôle déterministe vert n’est pas une preuve de réussite du parcours utilisateur. Une déclaration de groupe alimentaire par le modèle n’est pas une vérité indépendante. Trois ou quatre sorties d’un modèle ne constituent pas un taux de fiabilité en production.

La campagne ne certifie pas l’isolement complet multi-tenant, les protections de toutes les situations médicales, le passage de minuit, la charge concurrente, le déploiement hébergé ni l’intégralité des écrans après adoption. Les points non exercés restent explicitement non concluants dans la couverture de la checklist.

## Ordre de travail recommandé

1. Corriger la garde allergique et l’ensemble des contournements voisins. Aucun lancement public avant ce point.
2. Construire le contrôle final unique : complétude, sécurité, références, calendrier, conservation, quantités et objectifs. Le rejouer après chaque transformation et avant écriture.
3. Réunir toutes les informations autorisées du foyer avec provenance et sujet ; recetter le correctif « Garder » et réparer le cycle de vie du prochain plan.
4. Enregistrer un brouillon immuable et adopter sans nouveau modèle. Rendre le traitement asynchrone avec idempotence, reprise et budgets.
5. Aligner les écrans et explications ; compléter les scénarios manquants ; exécuter la même campagne sur une version figée en staging.

La condition d’ouverture doit être fondée sur des preuves : zéro contournement allergique connu, zéro référence temporelle impossible, zéro cellule attendue silencieusement vide, chaque information autorisée effectivement lue sous le bon sujet, adoption conforme au brouillon, aucun diagnostic critique ignoré. Ajouter ensuite une campagne répétée et une vérification métier des plans complets, avec suivi des refus et incidents par version.
