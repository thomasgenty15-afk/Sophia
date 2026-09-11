# Refonte de la page Suivi — étude de première version

Date : 9 septembre 2026. Périmètre : analyse du code local, des contrats de données et du parcours de repas hors plan. Aucune modification de l’application ni de la base. L’état déployé et les données du compte affiché dans le navigateur n’ont pas été inspectés. Le dépôt contient des travaux en cours ; les constats portent sur cet état local.

## Décision proposée

La page doit permettre de répondre à trois questions : **quel est mon repère calorique quotidien ? Qu’ai-je renseigné pour chaque repas, et que manque-t-il ? Comment évolue mon poids ?**

Retenir trois blocs :

1. **Ton repère quotidien** : la cible calorique existante, son objectif associé, sa base et la date de référence disponible.
2. **Ta semaine dans l’assiette** : des vignettes par journée, puis les repas de la journée sélectionnée. Le plan, les photos et les descriptions convergent ici.
3. **Ton poids dans le temps** : la courbe actuelle, avec un historique indépendant de la semaine alimentaire.

Cette proposition supprime les compteurs de valeur produit, les points du soir, la grille de rythme, le récapitulatif séparé des plats mangés, la distribution des portions et les séances de sport. La régularité ne mérite pas de bloc dans cette V1 : l’état des journées suffit à orienter la personne vers les informations manquantes.

## 1. Ce qui explique la confusion actuelle

| Élément actuel | Ce qu’il fait réellement | Proposition |
| --- | --- | --- |
| Ce qui a été fait | Compte des plans, plats composés et séances présentes dans les plans. Un plan « mené au bout » exige une période terminée et au moins une coche vivante, pas tous les repas confirmés. | Retirer. Ces compteurs ne démontrent pas un bénéfice mesuré. |
| Minutes gagnées | Le texte dit justement qu’aucun temps économisé n’a été mesuré. | Retirer ce texte avec le bloc. |
| Régularité | Compte les jours ayant au moins un événement alimentaire admissible. | Ne pas en faire un indicateur principal. |
| Comment ça s’est passé ? | Lit encore `student_daily_checkins`. | Retirer cette lecture et le bloc devenu inutile au regard du parcours demandé. |
| Semaine dans l’assiette, rythme, journal et assiettes | Exploitent plusieurs fois les événements, avec des regroupements différents. | Un seul journal par date et repas. |
| Ton objectif, jour par jour | Rend des totaux jour/semaine/plan ; ne transporte pas la cible quotidienne destinée à être affichée. | Séparer la cible des apports renseignés. |
| Décrire | Enregistre les mots dans `protocol_events.student_note`, sans calcul calorique. | Compléter le circuit de description et rendre le texte enregistré. |
| Séances | Suivi sportif distinct. | Retirer de cet écran. |
| Poids | Dispose d’une source de mesures et de plusieurs périodes d’affichage. | Conserver et corriger le périmètre temporel. |

Sources : `frontend/src/keel/pages/StudentProgressPage.tsx`, `frontend/src/keel/components/TrackingCards.tsx`, `supabase/functions/_shared/keel/tracking_window.ts`.

## 2. Fonctionnement de la nouvelle page

### Le repère quotidien

Réutiliser la **fourchette** déjà calculée par le chemin de `meal-energy-v1`, plutôt que créer un nouveau chiffre ponctuel. Exemple purement illustratif : « 1 900–2 100 kcal par jour ». Afficher l’objectif associé et la date de référence disponible ; garder l’explication du calcul dans un détail dépliable.

Le champ `target` interne du suivi actuel ne convient pas : il représente une fourchette d’entretien utilisée pour estimer les repas manquants, pas la cible dirigée montrée dans le plan. Il faut partager le calcul de cible existant, avec ses paramètres et ses règles d’affichage, puis l’exposer dans le rapport de suivi.

Conserver les préférences d’affichage et les protections existantes. Si la cible n’est pas disponible, expliquer l’information manquante lorsque c’est pertinent ; le journal alimentaire doit rester utilisable sans calories. Aujourd’hui le bloc objectif disparaît notamment sans direction de perte/prise : le journal ne doit plus dépendre de cette condition.

### Des journées en vignettes

Reprendre le principe du plan : journées sélectionnables, aujourd’hui ouvert par défaut, détail d’une journée et accès à la vue de semaine. Sur ordinateur, une grille de cartes est possible ; sur mobile, privilégier les vignettes compactes et un seul détail ouvert.

Afficher les dates complètes et permettre de remonter les semaines. Une semaine civile peut traverser deux plans : la jointure se fait sur la date réelle et la personne. Les jours à venir restent identifiés comme tels. Aucun bouton « à compléter » ne doit être présenté comme un retard avant l’heure du repas.

Chaque repas montre seulement : le moment, un nom court ou la description, son origine, son état et ses calories si elles sont disponibles. Les détails de recette restent accessibles dans le plan.

### Le mardi midi au bureau

| Situation | Affichage | Action |
| --- | --- | --- |
| Petit déjeuner du plan confirmé | Nom du repas, « Plan · confirmé », calories de la portion | Voir le plan si nécessaire ; pas de description à refaire |
| Déjeuner extérieur, moment encore à venir | « Au bureau · hors plan · à venir » | Pas de demande de rattrapage |
| Déjeuner extérieur passé, sans information | « Déjeuner à compléter » | Ajouter une photo ou décrire |
| Photo du déjeuner reçue | Vignette, contenu reconnu, estimation calorique si disponible | Voir et corriger/rattacher le repas |
| Description reçue | Texte visible, résultat estimé ou état d’analyse explicite | Compléter/corriger ; ne pas redemander le même repas |
| Dîner du plan confirmé | Nom du repas, calories de la portion | Pas de description à refaire |

Photo et description sont deux moyens de documenter **le même repas**. La galerie doit être la vue de ces repas, et non un second ensemble de données à additionner. Une présentation filtrée « Photos » peut venir plus tard ; elle n’est pas nécessaire au premier écran.

## 3. Règles de calcul à fixer avant la mise en œuvre

**Prévu, confirmé et estimé sont trois informations différentes.** Un repas du plan non confirmé conserve ses calories prévues ; elles ne deviennent pas silencieusement des calories consommées. Aucune nouvelle obligation de confirmation n’est nécessaire : les confirmations du plan et de la conversation sont réutilisées.

Pour un jour incomplet, afficher par exemple « Sous-total renseigné : 1 100 kcal — déjeuner non inclus ». Ne pas le présenter comme le total final et ne pas le comparer à la cible comme si la journée était complète. Un repas manquant vaut « inconnu », jamais zéro ni une consommation déduite de la cible. Cela change volontairement le fonctionnement actuel qui additionne des estimations conventionnelles de créneaux.

Un total contenant une estimation sur photo doit rester explicitement estimé. Les portions d’un plan permettent un calcul à partir de la recette, pas une mesure exacte de ce que la personne a réellement mangé. Une carte peut rester utile même si certains chiffres sont indisponibles.

Les **repères par repas**, s’ils sont proposés, doivent reprendre la répartition déjà utilisée par le moteur. Ils sont secondaires à la cible quotidienne ; ne pas inventer une seconde règle de répartition dans l’interface.

### Remplacement, ajout et repas sauté

- « J’ai mangé autre chose à la place » : le repas de remplacement prend la place du prévu dans le suivi de consommation.
- « J’ai mangé cela en plus » : créer un apport supplémentaire distinct, même au même moment de la journée.
- « Je n’ai pas mangé ce repas » : état explicite ; ne pas inventer un repas extérieur ni une estimation pour combler ce créneau.
- « J’ai donné la portion au voisin » : ce n’est pas une consommation de la personne. Réutiliser les mécanismes de devenir des portions quand ils sont disponibles ; ne pas déduire cela d’une absence de coche.
- Une photo du plat du plan confirme/documente ce plat ; elle ne s’y additionne pas.
- Une photo sans date ou créneau fiable reste à rattacher. Demander le rattachement une fois, sans la compter simultanément dans deux repas.
- Plusieurs plats et plusieurs photos peuvent appartenir au même repas. Dédupliquer les preuves, sans effacer un vrai supplément.

Il faut un rattachement explicite : personne, date locale, repas/occasion et, si applicable, identifiant du plan et des plats concernés. La provenance photo/texte reste séparée de la relation au plan.

## 4. Écarts techniques constatés

### Détection des créneaux

Le suivi actuel définit les créneaux manquants par `eating_rhythm` moins les créneaux des plats et ceux des faits chiffrés. Il ne lit pas les états détaillés de présence, les apports fixes, les repas restants ni toutes les raisons de case vide visibles dans le plan.

Cela explique une catégorie de faux « Décrire », mais **ne prouve pas la cause exacte sur le compte regardé**. Dans un scénario local où les trois plats ont des créneaux valides, aucun bouton n’est demandé pour ces trois créneaux. Il faut donc vérifier le rattachement des plats réels, les jetons de créneau et les autres occasions déclarées avant d’attribuer ce défaut à une cause unique.

Réutiliser les règles de calendrier, présence et couverture du plan, en partageant la décision côté serveur. Ne pas considérer toutes les cases sans plat comme des repas oubliés : un apport fixe, une absence et un déjeuner au bureau ont des sens différents.

Le canal proactif existe : le code local distingue les repas composés (`planned`) des repas non couverts (`uncovered`), avec actions photo/description, ainsi que confirmation ou remplacement du prévu. Il utilise le fuseau, les horaires, un interrupteur et une prévention des questions répétées. Son extension locale du 8 septembre inclut aussi les occasions du rythme non couvertes par un plan : le périmètre « journée de plan », les absences et la suppression d’une demande après réception d’une photo doivent être vérifiés de bout en bout. L’existence de ces branches ne prouve pas leur exécution sur l’environnement déployé.

### Descriptions et photos

`tracking_describe_io.ts` rend toujours `energy: null`. Le rapport ne transporte ni `student_note` ni un identifiant d’événement utilisable pour corriger la ligne ; il transforme les événements ordinaires en entrées nommées `photos`, y compris sans image. Le texte peut donc être enregistré sans être restitué dans la carte.

Le formulaire permet actuellement un rattrapage de 14 jours, alors que la page affiche jusqu’à 30 jours. Les actions proposées doivent respecter cette limite ou une nouvelle décision explicite. Les erreurs techniques comme `too_old` et `already_declared` doivent avoir des messages lisibles.

### Totaux

Le moteur additionne les calories des plats et celles des photos sans rapprochement suffisant. Une photo portant déjà `planRelation: as_planned` est malgré tout ajoutée aux calories du plan. La propriété existe dans les entrées mais ne résout pas ce cumul.

Les jours sans plan peuvent recevoir un total conventionnel complet issu des habitudes. Les repas futurs du jour peuvent également être présents dans la somme : la décision reçoit une date, sans heure pour distinguer le dîner à venir.

### Foyer et historique

Les plans de foyer ne reçoivent pas de calories individuelles dans `toTrackingPlan` ; un plat comptable sans calories rend le total de la journée indisponible. Le chemin `meal-energy-v1` dispose d’une logique de portions par lecteur : il faut la partager, pas diviser une casserole par son nombre de portions ou additionner les assiettes des autres membres.

Le chargeur de poids peut lire jusqu’à dix ans, mais `buildTrackingReport` refiltre les mesures sur la fenêtre alimentaire de 7/30 jours. Les boutons « 3 mois », « tout », etc. ne peuvent pas retrouver ce qui a été retiré. Dissocier les deux fenêtres.

Pour les plans retirés, remplacés ou décalés, vérifier l’unicité du repas effectif à une date donnée. L’agrégat actuel parcourt tous les plans chargés pour les plats ; l’indicateur `retired` ne filtre pas cette boucle. Une suppression générale des plans retirés ne serait pas une correction suffisante : leurs repas historiques peuvent avoir été consommés.

## 5. Ajouts utiles, sans gonfler la V1

À intégrer immédiatement :

- **Les éléments à compléter**, directement dans la bonne journée, et uniquement quand ils sont pertinents.
- **La correction d’un repas**, notamment son jour, son créneau et sa relation au plan. C’est essentiel aux totaux, pas un raffinement graphique.
- **La fraîcheur du repère et de la pesée** : afficher la date disponible. Une cible actuelle ne doit pas se faire passer pour celle des semaines passées.
- **Les apports déjà connus hors recette** : collations, apports fixes et portions réutilisées lorsqu’ils existent dans les données et appartiennent à la personne.

À garder pour une version suivante :

- Une moyenne calorique sur les journées suffisamment renseignées, avec le nombre de journées incluses. Pas de moyenne naïve sur les jours incomplets.
- Une lecture de variété alimentaire à partir des groupes/aliments reconnus, libellée « dans les repas renseignés ». Les photos, souvent prises dehors, ne constituent pas un échantillon représentatif de toute l’alimentation.
- Une tendance de poids plus lisible si les mesures disponibles le permettent. Ne pas fabriquer une projection de date d’atteinte de l’objectif.

Écarter pour cette V1 : temps économisé, score global, séries de jours, dépenses sportives, nombre de recettes générées, économies monétaires non mesurées et nouvelle collecte quotidienne de ressenti.

## 6. Ordre de réalisation et validation

1. Partager le modèle de repas : couverture réelle, identité, remplacement/ajout, date et personne. Corriger les cumuls et la fenêtre du poids.
2. Brancher la cible existante, la lecture individuelle des portions et le circuit texte/photo. Exposer les descriptions et les états d’analyse ; une analyse indisponible ne doit pas bloquer l’enregistrement du repas.
3. Construire les trois blocs, retirer les anciennes sections et leurs requêtes, puis vérifier le rendu mobile.
4. Tester le parcours complet sur un compte de test, y compris la conversation et la reprise dans Suivi.

Scénarios indispensables : mardi midi extérieur sans photo ; puis photo ; puis description seule ; photo d’un repas du plan ; remplacement explicite ; apport en plus ; repas réellement sauté ; créneau futur ; absence ; apport fixe ; repas de foyer individuel ; changement de plan ; photo après minuit ; correction et absence de doublon ; calories masquées ; historique de poids supérieur à 30 jours.

### Vérifications réalisées pour cette étude

Les **32 tests existants** de `tracking_window_test.ts` passent, avec cache local et sans accès réseau. Ils valident surtout le contrat actuel ; leur succès ne valide pas le nouveau besoin produit.

Quatre scénarios synthétiques ont aussi été exécutés contre le véritable `buildTrackingReport`, sans base de données :

| Entrée | Sortie observée |
| --- | --- |
| Trois repas du plan à 450, 600 et 650 kcal, sans confirmation | 1 700 kcal, base `assumed`, aucun créneau manquant |
| Même jour, sans plat au déjeuner | 2 000 kcal : 1 100 prévues + 900 de convention pour le déjeuner |
| Trois repas du plan + photo du déjeuner à 600 kcal, relation `as_planned` | 2 300 kcal : déjeuner compté deux fois |
| Aucun plan ni événement, trois occasions déclarées | 2 200 kcal issus exclusivement d’estimations de créneaux |

Dans ces scénarios, une pesée du 1er août fournie en entrée est supprimée d’un rapport demandé pour le 8 septembre. Reproduction : `/tmp/sophia-progress-audit-20260909.ts` (script temporaire ; les résultats utiles sont consignés ici).

### Fichiers principaux examinés

- `frontend/src/keel/pages/StudentProgressPage.tsx`
- `frontend/src/keel/components/TrackingCards.tsx`
- `frontend/src/keel/components/TrackingDescribeDialog.tsx`
- `frontend/src/keel/components/WeightCurveCard.tsx`
- `frontend/src/keel/lib/planDayView.ts`
- `frontend/src/keel/api/tracking.ts`
- `supabase/functions/_shared/keel/tracking_window.ts`
- `supabase/functions/_shared/keel/tracking_window_io.ts`
- `supabase/functions/_shared/keel/tracking_describe_io.ts`
- `supabase/functions/_shared/keel/slot_meal_ask.ts`
- `supabase/functions/_shared/keel/slot_meal_io.ts`
- `supabase/functions/meal-energy-v1/index.ts`

L’aperçu joint à l’étude illustre le repère et la navigation quotidienne avec des données fictives. Ses interactions restent locales ; la photo est un scénario simulé et le texte ne déclenche pas d’analyse réelle. Il ne constitue pas une modification de l’application.

Vérification de cet aperçu : navigation quotidienne, scénario photo et saisie de description fonctionnels ; aucun débordement horizontal à 736 et 360 pixels en thèmes clair et sombre ; aucune erreur JavaScript ; capture du rendu inspectée.
