# Audit réel du plan — critères fixés avant les tirs

Date : 2026-09-05. Code courant, empreinte SHA256 avant/après chaque tir. API et base exclusivement locales ; vrais appels fournisseur IA. Une génération à la fois. Fixtures qa-9pts existantes lues sans modification ; les variantes futures auront des comptes dédiés. Aucun déploiement, reset ou SQL d'écrasement.

## Verdicts

- PASS : résultat observé conforme au critère explicite.
- FAIL : au moins une violation observée, avec plat/personne/champ de preuve.
- INCONCLUSIVE : champ absent, refus empêchant d'observer, modification du code, cas non déclenché ou surface non exercée. Un HTTP 200 ne suffit pas.
- Un refus de sécurité correct est PASS pour la sécurité et FAIL pour la disponibilité si le scénario était réalisable. Un aperçu peut montrer un trou ; ce n'est pas une preuve que la publication accepte ce trou.

## Exigences communes

1. Fenêtre demandée respectée ; chaque personne présente reçoit exactement une boîte par cellule attendue ; aucune casserole mangée avant cuisson.
2. Zéro ingrédient allergène dans les plats, préparations et courses ; zéro composant incompatible avec le régime dans les items et préparations effectivement cités par la boîte de la personne. Inspection sémantique nécessaire pour synonymes/composés.
3. Une restriction personnelle ne prive pas silencieusement toute la table ; swap.flagrant=false et majorité des repas principaux omnivores gardent leur composant pour les foyers mixtes.
4. Pas de kcal individuels pour les mineurs/personnes protégées. Les adultes à objectifs différents ont des prescriptions appropriées ; unmet_band.gte_200 et densify.remaining_gte_200 doivent être nuls ou le manque explicitement dit.
5. Quantités des items et des boîtes cohérentes ; préparations citées existantes, cuisinées, assez abondantes ; courses sans orphelins ; congélation indiquée au-delà de la fenêtre de frigo.
6. explanation.lines présente, 1 à 8 lignes, français, arbitrages réels et cohérents avec rationale et assiettes. Pizza reste pizza sauf règle explicite ; dégoût contre envie expliqué.
7. Variété : aucun principal servi six fois sous balanced/keen ; au moins trois titres distincts aux petits-déjeuners d'une semaine ; pas de substitution végétarienne globale muette.
8. Latence <=120 s sans relance, <=360 s avec relances ; relever modèle, jetons et durée par appel. Au-delà : FAIL de l'objectif de latence local, pas une extrapolation de SLA hébergé.
9. Une session demandée reste une session, boîtes tardives congelées, courses conformes au plan.

## Première série

A01 : solo perte de poids, 3 jours. A02 : couple objectifs divergents + dégoût/envie contradictoires, 7 jours. A03 : 4 personnes dont une végane et un mineur, 7 jours. A04 : 5 personnes, objectifs opposés, végétarienne mineure, allergies œuf/arachide, dégoûts et envies, 7 jours. A05 : A03 en une seule session. A06 : A04, 3 jours, envies pizza/raviolis explicites. A07 : solo 7 jours en une session. A08 : couple 3 jours avec envie contraire au dégoût explicitement nominative.

Rejeux identiques sur les cas exposés après première lecture ; compléter par fixtures isolées pour budget/matériel, mémoire, fuseau et styles. Les tests automatiques, les API réelles et les écrans seront décomptés séparément. Aucune promesse d'absence absolue de défaut en production.

## Compléments et incidents du banc

B01 : solo Montréal, minimal, une course, 25 € sur 7 jours, pas de four, pizza à la poêle. B02 : couple perte/prise, exclusion multi-mots de table « pain complet » et lentilles exclues seulement pour Marc, envie de lasagnes/lentilles. B03 : cinq personnes, minimal, une course, allergies enfant œuf/arachide, régime végétarien minoritaire, cannelloni scindés et pizza. B04 : trois personnes dont un enfant ; propriétaire demande fajitas, Marc avec compte propre demande rougail et exclut courgettes, propriétaire exclut betterave pour Marc. Attendu : chaque magasin personnel est lu sous son nom. B05 : note « Tom est allergique aux noix de cajou » ; attendu : sécurité de Tom persistée lors de l'adoption, avant prochain plan.

Incident du banc initial : Node fetch impose un délai implicite d'en-têtes de 300 s malgré AbortSignal 900 s. A03 perd la réponse alors que le serveur continue. A04 a commencé avant la fin du serveur A03 ; le banc est arrêté, ces deux résultats ne servent pas de preuves de plans complets ni de latence isolée. Les traces serveur sont gardées. Correction de l'instrument : node:http avec délai explicite de 900 s, arrêt de la série en cas de statut inconnu/502/504. Reprise après fin du traitement serveur. Les fixtures initiales ont été relues après le tir car le header apikey opaque initial renvoyait des tableaux filtrés par RLS ; ce point est annoté dans les fichiers fixture. Les réponses de génération étaient bien authentifiées par le JWT utilisateur.

Documentation infrastructure vérifiée : https://supabase.com/docs/guides/functions/limits — délai sans réponse 150 s, durée worker 150 s gratuit / 400 s payant. Le Kong local est configuré à 900 s avant cet audit.


## Correction de périmètre — échange utilisateur

Les envies du plan commun sont réservées au maître. Vérification réelle sous le compte de Marc : `keel_household_submit_envy` refuse `not_owner` (member-envy-access-probe.json). Les sentinelles rougail/courgettes du compte secondaire ont été injectées directement par le banc ; aucun parcours utilisateur autorisé n’a été démontré pour les produire. Leur omission dans B04 est retirée des défauts avérés de production. Ne pas recommander de charger toutes les envies des comptes secondaires sur cette seule base. Le scénario valide est une déclaration du maître concernant un membre nommé.


Correction du banc : B01 porte `cooking_days` alors que le lecteur utilise `cook_days`. Son résultat ne permet donc PAS de conclure au non-respect des jours déclarés (critère 8). Les autres paramètres de ce cas sont lus : fuseau Montréal, budget, style, nombre de courses et matériel.
