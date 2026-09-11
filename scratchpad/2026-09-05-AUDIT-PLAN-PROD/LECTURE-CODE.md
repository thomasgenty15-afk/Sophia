# Lecture du circuit des données

**Note historique du 5 septembre.** Pour l’état du code vérifié le 6 septembre, lire [RAPPORT.md](</Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-05-AUDIT-PLAN-PROD/RAPPORT.md>). « Garder », l’explication solo et le calcul énergétique ont depuis reçu des correctifs. Les demandes artificiellement injectées depuis un compte secondaire sont hors du parcours autorisé et ne constituent pas un défaut retenu.

Base auditée : HEAD `54a1114aa46a1a9fae6ccc00660132d081e2c76d` + modifications locales déjà présentes. Aucune modification du code produit par cet audit. Empreinte complète des sources partagées et deux endpoints dans chaque fichier `.meta.json`.

## Parcours

1. `MealBuilder` / `planDraft` / `household` construisent les requêtes des deux lanes, `generate-meal-v1` et `generate-household-meal-v1`.
2. L'identité est issue du JWT ; seul le propriétaire peut composer le foyer. Le serveur charge roster, présence, habitudes, profil/corps, objectifs, doctrine du foyer, sécurité de chaque compte et allergies des membres sans compte.
3. `student_goals.practical_constraints` porte contraintes pratiques, préférences structurées, éléments du prochain plan et mémo. Les membres nommés dans LE magasin du titulaire sont routés par sujet.
4. Le prompt est assemblé avec modèle dédié `keelGenerationModel()`, parseur structurel et ceintures de sécurité. Des relances indépendantes peuvent corriger protéines, exclusions, personnes sans repas et séparation des régimes.
5. Les masses sont ajustées, les préparations/courses sont réécrites, les textes de rationale et explication sont filtrés. Les plans persistés passent par RPC ; le mode draft saute l'écriture du plan, mais peut enrichir les référentiels de composition et écrire les événements d'usage.

## Constats établis par le code, à distinguer des résultats IA

- **Les magasins des autres comptes ne sont pas chargés pour le plan commun.** `generate-household-meal-v1/index.ts:2910–3026` lit `goalRow.practical_constraints` du propriétaire et `nextPlanItemsFor({userId})` du propriétaire. Les voix structurées ne rechargent pas les données des comptes secondaires. La sécurité utilise un autre circuit : ne pas extrapoler ce défaut aux allergies.
- **« Garder » garde encore au mauvais endroit.** `FoodPreferencesCard.tsx:183–225` appelle `saveFoodPreferences`; `api/foodPreferences.ts:338` écrit `food_preferences`, `food_preferences_dismissed`, `food_preferences_origin`. Les générateurs ne consomment plus ce magasin. La carte reste montée dans la fiche du foyer. L'arbitrage produit n°2 n'est pas réalisé dans cet arbre.
- **Pas de bloc explication dans la lane solo.** Aucun appel à `gatePlanExplanation` ni retour `explanation` dans `generate-meal-v1`; le retour draft à partir de la ligne 4317 expose rationale et request_report seulement. Le foyer expose explicitement explanation à la ligne 8925.
- **Après la coupure des courses, la fenêtre se raccourcit.** Le solo appelle `withoutSpentFirstDay` et reprend sa `durationDays` (`1603–1629`). C'est un comportement déterministe expliqué à l'écran, en conflit avec le critère 38 de la checklist. Il faut trancher/corriger le contrat ; ce n'est pas une hallucination du modèle.
- **L'explication peut survivre à une fusion partielle sans décrire le plan final.** Lors de `mergeRetryByCell`, `meal` change mais `mealSourceText` reste celui du plan de base ; `extractExplanation(mealSourceText)` est ensuite évalué. La garde détecte des formulations interdites, pas la vérité des arbitrages après fusion.
- **Le manque énergétique est mesuré, mais ne bloque pas la publication.** Le refus `mouth_unfed` porte l'absence de repas et intervient avant le dimensionnement final. `unmet_band` et `densify.remaining_gte_200` sont des compteurs, pas un invariant final de publication. Bien distinguer « une boîte existe » de « son contenu couvre l'enveloppe interne ».
- **Les relances sont séquentielles et leur budget est local à chaque famille.** Trois `unfed_retry` possibles en plus des autres familles, avec timeout de 300 s PAR appel. Pas de budget global de durée suffisamment court pour la limite HTTP hébergée.
- **Les garanties de brouillon ne sont pas absolues.** Les plans ne sont pas écrits, mais les journaux et promotions du référentiel le sont. Mesurer et isoler aussi ce référentiel lors d'une campagne reproductible.
- **Les lecteurs `rhythmOverlayFor` et `logisticsOverlayFor` sont encore importés/appelés.** Arbitrage n°6 encore ouvert.

## Infrastructure

Le client attend une réponse JSON finale ; pas de réponse de job avec reprise/polling dans ces deux endpoints. Supabase documente un délai HTTP inactif de 150 s et une durée worker de 150 s (gratuit) / 400 s (payant). Source vérifiée le 2026-09-05 : https://supabase.com/docs/guides/functions/limits . Le Kong local est déjà à 900 s. Une réussite locale de plusieurs minutes ne valide pas un déploiement tel quel.

## Vérification d'écran effectuée

Compte QA existant `qa-9pts-duo`, plan antérieur à cette campagne : `/app/plan`, `/app/about-you`, `/app/household` ouverts dans le navigateur. À 320×740 : largeur document 320, pas de débordement horizontal global ; les tableaux internes dépassent 320 dans leur conteneur. Boîtes de Julie et Marc et kcal de Marc visibles sur le plan. La préférence champignons de Julie est visible sur about-you, tandis que la fiche foyer « Ce que tu m'as dit / Dans ton plan » annonce rien pour l'instant. Cela confirme deux surfaces désalignées. Cette inspection ne valide ni un nouveau plan de cinq personnes, ni la congélation, ni l'anneau « Voir » après une nouvelle note.

## Vérifications automatiques

- `deno test --no-check --allow-env --allow-read --allow-write=/private/tmp supabase/functions/_shared/keel` : 5 539 succès, 0 échec, 1 ignoré. Ce sont des tests déterministes, dont certains vérifient le texte source.
- `deno check` des deux endpoints : succès (code de sortie 0).
- 25 fichiers frontend ciblant plan/boîtes/mémoire/courses : 549 succès.
- Les premières sélections (375 backend et 190 frontend) recoupent ces suites ; ne pas additionner les tests communs.


## Correction de périmètre — échange utilisateur

Les envies du plan commun sont réservées au maître. Vérification réelle sous le compte de Marc : `keel_household_submit_envy` refuse `not_owner` (member-envy-access-probe.json). Les sentinelles rougail/courgettes du compte secondaire ont été injectées directement par le banc ; aucun parcours utilisateur autorisé n’a été démontré pour les produire. Leur omission dans B04 est retirée des défauts avérés de production. Ne pas recommander de charger toutes les envies des comptes secondaires sur cette seule base. Le scénario valide est une déclaration du maître concernant un membre nommé.


Les quatre suites de propriétés hors du dossier partagé rendent 49 succès et 1 échec : le test épinglé tente de lire un ancien `ProgressPage.tsx` absent. Cet échec de banc n’est pas une démonstration de fuite calorique TCA. La suite simulated_week n’a pas été lancée car elle contient des suppressions SQL de fixtures préexistantes, interdites par AGENTS.md ; les scénarios réels de cet audit utilisent des fixtures isolées sans suppression.
