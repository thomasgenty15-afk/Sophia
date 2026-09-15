# Passation — terminer la bêta autonome

## Mandat du nouvel agent

Terminer les blocages restants du parcours autonome, conserver les acquis, puis apporter les preuves sur une version figée. Ce document précise le reste à faire ; les critères B1–B7 de `PLAN-BETA-AUTONOME-2026-09-14.md` restent le contrat de lancement. Ne pas recommencer tous les lots historiques et ne pas déclarer la bêta prête sur le seul `agent-gate: pass`.

Trois lots séquentiels ci-dessous. Les lectures, corrections locales, tests contrôlés et préparation des migrations sont dans le mandat. Pas d'appel fournisseur payant sans budget restant explicitement autorisé pour cette nouvelle campagne ; les anciennes dépenses ne constituent pas une nouvelle enveloppe. Pas de déploiement, secrets, SQL destructif ni application de migration par l'agent : respecter `AGENTS.md`. Ne pas modifier des comptes réels pour fabriquer des tests.

Le dépôt est partagé et comporte de nombreux changements non committés. Relever l'état et les versions avant de travailler, préserver les changements des autres agents. Ne pas confondre le diff cumulé avec les modifications de cette passation.

## Lire dans cet ordre

1. `AGENTS.md` et `docs/keel/PLAN-BETA-AUTONOME-2026-09-14.md` : contraintes et critères fixes.
2. `docs/keel/BETA-PARCOURS-REEL-2026-09-14.md` : dernier état du navigateur ; il corrige le diagnostic de bouton mort.
3. `docs/keel/BETA-CAMPAGNE-2026-09-14.md` : résultats individuels à retrouver et méthode de comptage corrigée.
4. `docs/keel/BETA-LOT-1-2026-09-14.md`, `BETA-LOT-2-2026-09-14.md`, `BETA-LOT-3-2026-09-14.md` : preuves et contexte, avec attention à leur version. Les sections anciennes peuvent être dépassées par le rapport de parcours réel.

## État de départ — ne pas repartir d'un diagnostic périmé

| Sujet | Établi ou rapporté | Ce qu'il reste à prouver |
|---|---|---|
| Bouton « Composer » | Le diagnostic « mort » a été retiré : le formulaire affichait un refus de budget. Avec budget, une composition a abouti en 215 s. | Parcours autonome borné, récupération après incident ; pas une réécriture du bouton. |
| Variante à l'écran | Cas N=2 : viande chez Max, aucune chez Lea ; rechargement et courses vérifiés. | Non-régression sur la version finale et couverture N=4, compte neuf et contraintes actuelles. |
| Aperçu / adoption | Aperçu réussi en 147 s. Adoption échouée : délai client 145 s, puis appel serveur expiré vers 206 s. | Aller jusqu'à l'adoption réussie et récupérable ; le chemin recompose actuellement au moment d'adopter. |
| Erreurs affichées | Les replis du parcours mesuré ont été traduits ; motif client `plan_still_composing`. | Une phrase d'attente n'est pas un suivi d'état et ne prouve pas que le serveur travaille encore. |
| Réduction de préparation | `portion_scaling.ts:scaleIngredients` permet désormais une réduction même si l'ingrédient reste au-dessus du plafond de croissance. 169 g retirés sur 170 demandés, contre 7 auparavant. | Réconciliation totale : le ratio 0,93 rapporté ne prouve pas l'égalité. |
| Conservation des quantités | Le dernier parcours rapporte 6 146 g produits contre 6 181 g prélevés, soit −35 g. `pot_reconcile.reste` est maintenant un compteur. | Fermer l'écart ou démontrer précisément sa cause de conversion/arrondi ; ajouter le comportement de garde nécessaire. |
| Campagne | 22/25 plans livrables, dont 13/25 sans rattrapage ; p95 ≈ 248 s ; un 546. | Campagne finale après corrections ; les 25 demandes ne valident pas le code modifié ensuite. |
| Profil maintien | Non mesuré : `size: light` ne traversait pas le canal utilisé par le harnais. | Distinguer défaut du profil de test et défaut du vrai parcours UI → stockage → lecteur → contrat. |

Attention au vocabulaire : `planDraft.ts` et `household.ts` sont deux chemins client vers le même moteur foyer, pas le retour d'une lane solo. Le compte maître reste seul autorisé à générer.

## Lot 1 — Fermer les quantités et la préférence « repas léger »

### 1.1 Préparations, prélèvements et courses

Points d'entrée : `supabase/functions/_shared/keel/portion_scaling.ts`, `portion_sizing.ts`, `portion_boundary.ts`, `quantity_render.ts`, `final_plan_audit.ts`, `final_plan_gate.ts`, et les étapes `pot_reconcile`, `pot_shrink`, quantités finales et courses dans `generate-household-meal-v1/index.ts`.

1. Retrouver les artefacts exacts de `sna1` et du parcours à −35 g. Les conserver immuables. Rejouer avec le correctif actuel de `scaleIngredients` avant d'ajouter du code.
2. Pour chaque préparation, relever les ingrédients avant/après, unités, conversions cru/cuit, eau retenue, masse prête, tous les prélèvements de la fenêtre, reste prévu et arrondis. Localiser la première étape qui casse l'égalité. Ne pas raisonner seulement sur un ratio global : deux pots peuvent avoir des écarts opposés qui se compensent.
3. Corriger le producteur de l'écart. Une préparation partagée sur plusieurs jours doit couvrir tous ses prélèvements, y compris ceux de personnes dont les parts sont qualitatives. Après un changement de masse, reconstituer les besoins d'achat depuis les ingrédients réellement cuisinés, avec le référentiel et les conversions de production.
4. Préserver le correctif de réduction et les garanties de croissance : facteur < 1 qui reste au-dessus de 500 g, facteur > 1 plafonné, facteur = 1, grammes, millilitres, unités dénombrables, quantités inconnues et ingrédients protéiques.
5. Après les derniers arrondis, vérifier par pot : produit = prélèvements + reste intentionnel. Un surplus de conditionnement acheté n'est pas un surplus cuisiné. Un « reste » n'est pas une variable d'ajustement inventée après coup.
6. Si l'écart vient d'arrondis, donner leur borne calculable à partir des opérations réellement réalisées ; conserver les unités pratiques et mesurer la sortie arrondie. Ne pas réutiliser les 15 % du déclencheur de rétrécissement comme tolérance de conservation. Une borne numérique justifiée est une question d'implémentation ; elle ne requiert pas un nouvel arbitrage nutritionnel.
7. Une quantité manquante réellement nécessaire empêche l'activation. Si une mesure indispensable demeure inconnue, ne pas déclarer le contrôle réussi. Le compteur `reste` seul ne clôture pas B4.

**Preuves de sortie :** tableau avant/après des deux cas, équation par pot, courses correspondantes, portions remesurées en grammes/calories/protéines selon les contrats applicables ; contrôle final et publication réellement exercés. Aucune tolérance nutritionnelle élargie.

### 1.2 Maintien, petit appétit et dîner léger

Points d'entrée : formulaire réellement utilisé, `frontend/src/keel/api/onboarding.ts`, stockage des préférences, RPC `keel_household_roster_for`, lecteur de contexte du handler, grille et prompt. Retrouver les migrations qui définissent la RPC plutôt que supposer une table source.

1. Créer le cas via l'interface ou les mêmes API dans un environnement de test. Tracer la préférence à chaque étape. Le harnais doit suivre ce vrai canal ; ne pas faire passer le test uniquement avec `--leger` si l'UI écrit ailleurs.
2. Corriger le lecteur/écrivain fautif si le produit perd la préférence, ou corriger la fixture si elle ne respectait pas le contrat actuel. Ne pas dupliquer durablement une préférence dans deux sources.
3. Vérifier maintien sans déficit/surplus ajouté, effet prévu du petit appétit et du repas léger, renormalisation de la journée et faisabilité. Ne pas ajouter d'extras ni imposer un créneau supplémentaire sans choix explicite de l'utilisateur.

**Preuves de sortie :** préférence retrouvée après rechargement et dans le contrat réellement envoyé ; cas nominal et cas devenu incompatible, avec issue UI correcte. Ce profil rejoint la matrice finale ; il ne reste pas marqué « non testé ».

## Lot 2 — Une demande récupérable, jusqu'à l'activation

### 2.1 Diagnostiquer le temps et réduire les rattrapages utiles à éviter

Réutiliser les 25 réponses de campagne. Ne pas relancer une campagne pour comprendre un défaut déjà enregistré.

- Par demande, relever temps et défauts au premier jet, après parsing, après dimensionnement, après chaque réparation, après validation et après écriture. Compter les cases distinctes, pas toutes leurs occurrences dans les journaux.
- Examiner les deux échecs du lundi soir à N=1 : plat absent de la réponse brute, supprimé au parseur, hors calendrier ou perdu après réparation ? Prouver la cause avant de changer le prompt. Vérifier la présence de toutes les cases requises dans le contrat envoyé et leur adressage dans les patches.
- Prioriser les motifs fréquents expliquant les 12 demandes qui n'ont pas réussi sans rattrapage. Corriger les informations perdues ou contradictions de prompt ; préserver CIQUAL, poids cuits, références et couloirs. Ne pas augmenter le nombre de rattrapages et ne pas faire de ceux-ci le chemin normal.
- Lire la configuration effective de modèle, effort, mode rapide, repli fournisseur et limites. Aucun passage opportuniste à un autre modèle/effort pour réussir un test sans nouvelle mesure de qualité. Tracer tous les appels, y compris retries et replis.

### 2.2 Suivi d'état et limites cohérentes sur tous les chemins

Points d'entrée : `frontend/src/keel/api/planDraft.ts`, `api/household.ts`, `components/MealBuilder.tsx`, `components/plan/PlanDraftDialog.tsx`, `copy/planRefusals.ts`, handler, `plan_publication.ts`, migration `20260914100000_une_seule_generation_a_la_fois_par_foyer.sql` et RPC de verrouillage associées.

1. Cartographier Composer, Prévisualiser et Adopter, leurs appels, délais client/serveur/fournisseur et écritures. Le rapport actuel donne 145 s pour `planDraft.ts` et aucune borne explicite pour `household.ts` : relire le code avant de traiter cela comme encore vrai.
2. Étendre ou réutiliser une demande persistante identifiable : état en attente/en cours/réussie/échouée/expirée, propriétaire, version, résultat, dates et motif de fin. Un verrou de foyer n'est pas à lui seul un journal de demandes ni une file de travail durable.
3. Un timeout client affiche un état prudent et déclenche une lecture de l'état serveur. Dire « la composition continue » seulement si cet état est établi ; une réponse perdue peut aussi cacher une réussite ou un worker déjà mort. Le rechargement retrouve la demande, l'aperçu ou le plan sans nouveau paiement automatique.
4. Vérifier la concurrence de la même demande : `reclaimed: true` ne doit pas permettre à deux exécuteurs vivants de composer et publier en parallèle. Reprise après expiration et acquisition par un exécuteur doivent être atomiques ; une exécution tardive ne peut pas publier après avoir perdu son droit d'exécuter.
5. Après 546, fermeture de processus ou perte réseau, la demande finit dans un état observable et récupérable. Ne pas dépendre de `catch`/`finally` pour libérer indéfiniment le foyer. Toute reprise respecte le budget total d'appels et ne refacture pas silencieusement le même résultat.
6. Ne pas résoudre les délais en augmentant seulement le timeout client ou celui de la passerelle. Un worker Edge ne survit pas à sa limite de vie. Si une exécution durable est nécessaire, séparer l'acceptation de la demande de son exécution dans un mécanisme réellement persistant ; utiliser les capacités existantes après inventaire. Pas de `waitUntil` ou promesse en mémoire présentés comme une file durable.
   > ⟳ **2026-09-15 — appliqué, et amendé sur un point.** La file est la ligne `student_meal_drafts` (`mode='async'`, `stage`, `attempt`, `relaunch_of`) ; l'ordonnanceur est `pg_cron` (`keel-relaunch-meal-drafts`, une relance au plus) ; l'échéance est celle du bail (`keel_generation_stale_after()`, 440 s). `EdgeRuntime.waitUntil` ne porte aucune durabilité : il sert seulement à ce que le worker finisse le travail qu'il a déjà accepté après avoir rendu son 202 — Supabase tue à 150 s toute fonction qui n'a pas répondu, et une composition de foyer en prend 244 à 281. Si ce worker meurt, rien n'est perdu que du temps ; c'est la ligne, pas la promesse, qui est relue et relancée. Sa durée de vie réelle a été **mesurée** (`keel-runtime-probe-v1`, table `keel_runtime_probes` : 392 s vécues en eu-west-3), pas déduite.
7. Sur l'adoption, établir si le contrat produit exige la recomposition. Si un aperçu validé peut être adopté tel quel, réutiliser cet objet après revalidation des contraintes et de la version, publication atomique et quota cohérent. Si l'adoption recompose, l'écran doit le dire et ce travail utilise la même demande récupérable. Ne pas activer un aperçu périmé pour gagner du temps.
8. Préserver le plan existant seulement s'il reste valide avec les contraintes actuelles. Une modification d'allergie, d'objectif autorisé ou de présence peut exiger revalidation ; les échecs ne doivent pas restaurer aveuglément une ancienne assiette incompatible.

### 2.3 Le délai de lancement ne se change pas en cachette

Le contrat initial exige p95 ≤ 100 s et issue bornée à 120 s sur le chemin synchrone ; la campagne ne les satisfait pas. Un message à 145 s ne satisfait pas ces critères et une réponse HTTP rapide d'acceptation ne mesure pas le délai de mise à disposition du plan.

Travailler sur la correction des causes, la récupération et la réduction des appels sans attendre une décision. Si le besoin de plusieurs minutes subsiste, présenter AVANT la nouvelle campagne une proposition concrète : architecture exécutable, délai d'acceptation, délai de disponibilité p95, échéance totale, coût, reprise et ce que voit l'utilisateur. Toute nouvelle durée de service est soumise au propriétaire une seule fois, avec ces éléments ; ne pas inventer son accord ni abaisser les critères après les résultats.

La décision de durée ne bloque pas le lot 1, le diagnostic des rattrapages ni les tests de reprise. Elle bloque uniquement la validation d'une nouvelle promesse de délai. Les éventuels déploiements restent des opérations humaines selon AGENTS.md.

**Preuves de sortie lot 2 :** vrai parcours navigateur Composer → résultat → rechargement ; Prévisualiser → Adopter → résultat actif → rechargement. Ajouter budget invalide, panne fournisseur, timeout avant/après écriture, 546 contrôlé, deux onglets, même request ID concurrent, verrou expiré, nouvelle contrainte et autre foyer. Un état final attendu et zéro publication/quota en double pour chaque cas. Pas de simple preuve que le bouton clique ou que le message d'erreur est traduit.

## Lot 3 — Refaire uniquement la validation devenue nécessaire

### 3.1 Fixer la version et vérifier hors ligne

- Figer code, configuration, schéma réellement appliqué, prompts et fixtures par commit ou manifeste d'empreintes. Vérifier la version du serveur actif ; les anciens rapports ont déjà mélangé des versions.
- Rejouer la matrice B1–B6 du plan principal avec les cas ajoutés ci-dessus. Conserver les acquis : attribution dans les deux ordres, variantes N=2/N=4, portions qualitatives, protections, ingrédients exclus injectés après réparation, complément, arrondi et cohérence des courses.
- Exécuter tests des modules modifiés, banc de mesure, `deno check` et `scripts/agent-gate.sh`. Aucun test essentiel écarté au motif qu'il est déjà dans une liste tolérée ; ne pas modifier cette liste pour obtenir un pass.
- Vérifier le parcours réel avec compte neuf en environnement de test. Les captures du plan existant et les anciennes réponses synthétiques ne prouvent pas une génération nouvelle.

### 3.2 Nouvelle campagne réelle bornée

Appliquer la campagne du plan principal : six profils, cinq demandes par profil, soit 30, avec le profil maintien désormais opérationnel, les fenêtres offertes et un petit test de concurrence. Préparer la liste, les coûts et le plafond global ; obtenir l'autorisation de dépense restante avant tout appel. Ne pas déduire une réserve du seul plafond historique théorique.

Deux pilotes N=2/N=4 d'abord ; arrêter sur défaut essentiel ou dépassement inexpliqué. Si le code change, ne pas mélanger leurs résultats avec la campagne finale. Le maximum de deux réparations est global à la demande, même après reprise ; retries/replis sont tracés et bornés.

Recalculer les taux depuis les résultats individuels en distinguant le type interne `deliverable_with_gaps` de la valeur persistée `livrable_avec_ecarts`. Ne pas assimiler HTTP 200, plan livré et plan satisfaisant les critères essentiels. Le même script doit produire le résumé et les tableaux par profil ; leurs sommes doivent correspondre.

### 3.3 Décision finale inchangée

- Zéro violation essentielle B1–B6 sur un plan activé et aucune preuve essentielle absente.
- Au moins 24/30 plans utilisables sans rattrapage modèle, 27/30 après le parcours complet, au moins 4/5 dans chacun des six profils.
- Délai conforme au contrat initial ou à son amendement explicitement accepté avant la campagne. Zéro 546 inexpliqué et aucune demande abandonnée sans issue récupérable.
- Preuve d'au moins une réparation réelle utile à N=2 et N=4 sur la configuration finale, avec budget ciblé distinct si aucun cas naturel ne les exerce.
- Recettes exécutables, variantes conservées à l'écran, quantités/courses réconciliées et parcours d'adoption achevé. Une vérification de lancement n'est pas une revue manuelle de chaque futur plan.

## Rapport à rendre au propriétaire

Une table B1–B7 avec état, version et lien de preuve, puis :

1. Ce qui a été fermé et les mesures avant/après.
2. Ce qui bloque encore, rattaché à un critère existant.
3. Résultats de campagne réconciliés, temps, dépenses et limites de preuve.
4. Opérations humaines restantes pour déployer, avec commandes préparées et environnement vérifié.

Ne pas annoncer « terminé » si B4, B5 ou B7 restent non prouvés. Ne pas ouvrir un nouveau chantier pour les ~90 préfixes techniques hors du parcours de bêta, une préférence souple ou un commentaire sans effet ; les consigner pour plus tard. Toute nouvelle découverte n'entre ici que si elle casse B1–B7 dans le périmètre de lancement.

Verdict : **bêta bloquée**, **correctifs vérifiés — campagne finale restante**, ou **bêta autonome ouvrable dans le périmètre validé**. Le nouvel agent doit poursuivre jusqu'au verdict justifié ou jusqu'à une dépendance humaine concrète qu'il a préparée intégralement.
