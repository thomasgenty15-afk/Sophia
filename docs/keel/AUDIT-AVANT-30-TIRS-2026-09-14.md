# Audit avant la campagne des 30 tirs

## Verdict

**Il ne reste pas seulement les 30 tirs.** Les corrections ont amélioré la composition, les protections, les quantités et l'adoption. Mais des défauts de reprise et des écarts de quantités subsistent, et les preuves de la dernière version sont incomplètes. Lancer immédiatement 30 générations mélangerait une validation de qualité et le débogage de chemins encore non fermés.

Ce rapport est une revue, pas un nouveau plan d'architecture. Il conserve les critères B1–B7 du `PLAN-BETA-AUTONOME-2026-09-14.md` et la passation existante. Aucune logique applicative modifiée, aucune génération payante, aucune migration appliquée et aucune donnée métier écrite pendant l'audit.

## 1. Méthode et niveau de preuve

- Lecture des rapports de clôture, lots bêta, campagne, parcours navigateur, passation et `BETA-VERDICT-2026-09-14.md`.
- Comparaison des 15 empreintes de fichiers publiées dans le dernier verdict (§ D du `BETA-VERDICT-2026-09-14.md`) : **15 correspondent au disque**, revérifiées à la clôture de l'audit. Cela confirme ces fichiers, pas toute la version exécutée par un serveur déjà démarré ; le manifeste ne couvre pas tous les modules transitifs, la configuration ni le référentiel.
- Lecture des chemins de génération, adoption, publication, verrouillage, statut et reprise client ; des contrôles finaux, empreintes de contraintes, ajustements de portions et relevés de réconciliation.
- Relecture des 25 résultats individuels de l'ancienne campagne, de leurs réponses, prompts et échanges fournisseur archivés ; vérification des deux pilotes b10 et des artefacts B4.
- Le relevé ligne à ligne de ces 25 résultats (empreinte SHA-256 de chaque artefact, statut, durée, état persisté, appels de réparation, causes de défaut, contrôles incomplets) est dans `AUDIT-AVANT-30-TIRS-2026-09-14-MESURES.json`, à côté de ce rapport. Le § 2 en est la lecture.
- Vérification **en lecture seule** de la base locale : migrations installées, corps de fonctions, verrous anciens et résultat de la RPC de statut. L'identité de session utilisée pour cette lecture est celle du propriétaire du verrou ; aucun compte ni enregistrement n'a été modifié.
- Tests exécutés : **256 tests Deno ciblés, 0 échec** ; **25 tests Vitest ciblés, 0 échec**. Ils couvrent notamment adoption, contrôle de masse, garde finale, réduction/croissance, empreintes, patches et certains branchements. Une partie des tests vérifie le texte des sources : ils ne démontrent pas une transaction SQL concurrente ou un parcours navigateur.
- Pas de nouvelle campagne réelle, de parcours navigateur complet ni de revue clinique des équations nutritionnelles dans cet audit. Les garanties observées restent celles des logiciels et des données testés.

## 2. Ce que disent vraiment les 25 anciens tirs

Source : `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir<P>-s<N>-*.json`, P = 1, 2, 6, 8, 9 et N = 1…5. Le sixième profil maintien n'a pas été exécuté.

| Mesure | Recalcul depuis les fichiers | Interprétation |
|---|---:|---|
| Demandes | 25 | Cinq profils mesurés, pas six. |
| HTTP 200 / ligne livrée selon les résultats | 22 | Succès de livraison, pas preuve automatique de conformité complète. |
| Étiquette `conforme` | 20 | Étiquette produite par la version historique de la garde. |
| Étiquette `livrable_avec_ecarts` | 2 | N=4, s4 et s5 ; écarts effectifs détaillés ci-dessous. |
| 422 | 2 | Dîner du lundi absent ; refus de livraison justifié. |
| 546 | 1 | Worker interrompu ; issue opérationnelle à traiter. |
| 200 sans rattrapage déclaré | 13/25 | 52 %, inférieur au seuil de premier jet. |
| Délai médian des 200 | 119 474 ms | Près de deux minutes. |
| p95 des 200 selon le script historique | 248 398 ms | Plus de quatre minutes ; le p95 au rang supérieur sur les 25 demandes donne ici le même nombre. |
| 200 au-delà de 150 s | 7/22 | Ne prouve pas que le parcours hébergé les récupère correctement. |

### La correction 20 → 22 était juste, mais son sens a été trop élargi

Le résumé filtrait auparavant la valeur interne anglaise `deliverable_with_gaps` au lieu de la valeur persistée française `livrable_avec_ecarts`. Corriger le comptage donne bien **22 livrés**.

Il ne faut toutefois pas en déduire 22 plans satisfaisant tous les critères de bêta :

- **N=4 s4** : `cell_energy_off`, `cell_bounds_off`, `protein_floor_short`.
- **N=4 s5** : trois occurrences de `protein_floor_short`.
- Les **22** réponses réussies signalent un contrôle `mouth_energy` incomplet ; deux signalent aussi `shopping_quantity` incomplet. Cela ne prouve pas à lui seul une assiette incorrecte, car des contrôles peuvent se recouvrir, mais cela interdit de présenter cette série comme une preuve de contrôle complet sans expliquer les non-applicabilités et les contrôles qui font autorité.

Mes réponses précédentes qui reprenaient « 22 utilisables » doivent donc se lire plus prudemment : **22 plans livrés par l'ancienne politique, 20 étiquetés conformes, conformité complète non démontrée par ce comptage seul**. Les protections renforcées depuis n'ont pas été testées rétroactivement par ces appels.

### Le coût et le temps ont aussi été simplifiés à tort

La somme des champs `etapes.appels` archivés donne :

| Nature des échanges recensés | Nombre | Durée médiane |
|---|---:|---:|
| Génération initiale | 24 | 100 819 ms |
| Réparation du plan | 17 | 42 614 ms |
| Appel auxiliaire `final_repair_fill` | 9 | 1 928 ms |
| Total recensé | **50** | — |

Le cas 546 n'a pas un relevé complet : ces 50 échanges ne sont donc ni une facture certifiée ni un décompte exhaustif garanti. Mais ils ne soutiennent pas l'estimation « environ 36 appels = 25 + 11 » du rapport.

Les demandes réussies avec 0, 1 et 2 réparations ont des médianes respectives de **102,7 s**, **143,2 s** et **177,7 s**. Dire « chaque réparation coûte environ 90 s » masque cette distribution. Et le premier appel consomme déjà environ 101 s en médiane : les rattrapages aggravent le délai, ils ne sont pas son unique cause.

Conséquence : le budget des 30 tirs doit compter les auxiliaires et replis ; le SLO doit mesurer la disponibilité effective du résultat. Ajouter une lecture d'état ne rend pas la composition plus rapide.

## 3. Attribution des deux échecs N=1 : ce qui est établi

J'ai relu les premiers jets bruts de `campagne-tir1-s3` et `campagne-tir2-s2` : **8 plats**, et aucun `mon/dinner`.

La case était pourtant explicitement demandée dans les deux prompts, avec cible et bornes : 859 kcal pour l'un, 1 019 kcal et un minimum protéique pour l'autre. Ce n'est donc pas, sur ces deux cas, une case oubliée par le contrat envoyé ou retirée seulement après génération. Le modèle l'a omise dans sa réponse initiale. Ces deux observations ne suffisent pas à expliquer tous les autres rattrapages de la campagne.

Ensuite les deux chemins divergent :

- Perte s3 : deux échanges de réparation sont archivés ; la préparation créée n'était pas rattachée à une session valide, puis la candidate a régressé. Les correctifs de rattachement peuvent aider ces réparations, sous réserve du rejeu complet.
- Prise s2 : aucun appel de réparation archivé ; le rapport et le correctif ciblent le refus de contexte tronqué. Débloquer une demande de réparation est un progrès du moteur, pas une preuve d'amélioration du premier jet.

**Acquis conservé :** la garde a empêché de livrer les deux plans auxquels manquait un dîner. **Non acquis :** les changements de réparation ne prouvent pas que le modèle écrit désormais les neuf cases dès son premier jet.

## 4. État local actualisé : un blocage du rapport a disparu

Le dernier verdict disait que la migration `20260914170000_le_bail_caste_la_duree.sql` n'était pas appliquée. Lors de cet audit, les six migrations `100000`, `110000`, `143000`, `150000`, `160000` et `170000` sont présentes dans la table des migrations locales.

La fonction locale `keel_household_publish_generation` contient bien `p_duration_days::smallint`. **Le défaut SQL connu du pilote 409 est donc corrigé dans cette pile locale.** Aucune migration n'a été appliquée par cet audit.

Cela ne prouve pas un nouveau succès de publication : l'artefact b10 perte reste un 409 à **127 962 ms**, et b10 prise un 502 à **171 858 ms**, sans ligne écrite dans ces résultats. Le 502 n'est pas expliqué par le cast : son corps ne contient qu'un message de réponse amont invalide.

Il faut un petit parcours/pilote de contrôle sur cette pile, pas traiter ces deux anciens échecs comme des succès après correction. L'état d'un environnement distant n'a pas été vérifié ici.

## 5. Défauts ou limites de preuve encore importants

### R1 — Une demande morte peut rester « en cours » pendant des heures — confirmé en base

Fichier : `supabase/migrations/20260914160000_generation_request_status.sql:67`.

La RPC rend `in_flight` lorsqu'une ligne de verrou correspond, **sans comparer `started_at` à une échéance**. Une ligne `running` du magasin d'aperçu est également interprétée comme du travail vivant ; sa durée de conservation et le nettoyage périodique ne constituent pas une échéance précise d'exécution.

Lecture locale : **deux verrous âgés de plus de 400 secondes**. Pour le plus ancien, la RPC appelée avec l'identité de son propriétaire répond **`in_flight` à 973 minutes d'âge**. Ce n'est pas une hypothèse.

À la clôture de l'audit, ces deux verrous sont identifiés. Ils appartiennent exactement aux deux terminaisons anormales déjà connues, et à rien d'autre :

| Verrou (`started_at`) | Compte propriétaire | Tir correspondant | Âge à la clôture |
|---|---|---|---:|
| 2026-09-14 05:01:30 | `lotf.camp8.s5@keeltest.dev` | `campagne-tir8-s5` → **546** `WORKER_LIMIT` | 63 582 s (17,7 h) |
| 2026-09-14 16:16:13 | `lotf.camp2.b10@keeltest.dev` | `campagne-tir2-b10` → **502** amont | 23 098 s (6,4 h) |

Le compte et la seconde de départ coïncident avec les artefacts ; l'identifiant de demande, lui, ne peut pas être rapproché parce que le harnais ne l'archive pas. Conclusion factuelle : **ni un 546 ni un 502 ne libère le verrou**, et la RPC de statut, dont le corps en base ne lit pas `started_at`, les présente comme du travail vivant sans limite de durée. Le foyer concerné reste bloqué jusqu'à la prochaine tentative de prise, seul moment où le bail périmé est balayé. C'est le cas exact « worker mort, spinner infini » que B5 interdit, reproduit sur des données réelles de la campagne.

Le bail est supprimé à sa péremption lors d'une nouvelle tentative de prise, pas automatiquement par cette lecture. Côté client, `awaitDurableRequest` attend puis peut encore rendre `in_flight`; `waitForDraft` finit par `plan_still_composing`. Une nouvelle visite peut recommencer cette attente. Le nettoyage des brouillons est planifié une fois par heure dans la pile locale, pas à chaque échéance de demande.

**Impact B5 :** une phrase rassurante peut remplacer indéfiniment une issue réelle. Corriger l'état expiré/échoué et sa lecture avant de prétendre garantir un délai total. Une source persistée n'est pas nécessairement une source à jour.

### R2 — L'adoption SQL est idempotente, le chemin applicatif ne l'est pas complètement — confirmé dans le code

Fichiers : `draft_adopt.ts:556`, `draft_store.ts:227`, migration `20260914143000_adoption_de_brouillon_atomique.sql`.

La RPC sait rendre le même `meal_id` quand le brouillon est déjà adopté. Mais avant de l'appeler, `adoptDraft` passe par `adoptability`, qui retourne **409 `draft_already_adopted`** dans ce cas. Le test existant attend explicitement ce refus.

Ainsi, un second appel reçu après la réussite du premier ne bénéficie pas de la réponse idempotente de la RPC. L'absence de double écriture est protégée ; la récupération transparente du succès ne l'est pas par ce chemin.

Le client crée un nouvel identifiant pour chaque invocation. Sa récupération recherche par cet identifiant, alors que le plan écrit par adoption conserve le payload du brouillon et que ce dernier porte la demande de composition initiale. Il faut tester la perte de réponse après adoption et récupérer par l'identité stable du brouillon/adoption, pas seulement par une nouvelle requête sans résultat associé.

**Impact B5 :** l'utilisateur peut voir un échec alors que son plan existe. Le scénario SQL atomique et le scénario utilisateur doivent être vérifiés ensemble.

### R3 — Une modification d'allure d'objectif n'entre pas dans l'empreinte d'adoption — constat de source, rejeu de bout en bout à ajouter

Fichiers : `generate-household-meal-v1/index.ts:8242`, `safety_fingerprint.ts:147`, `draft_adopt.ts:637`.

La composition lit `paceByMember` et le passe comme `paceKgPerWeek` aux calculs de cible. L'empreinte d'adoption inclut direction d'objectif, corps, présence, rythme et repas léger, mais **pas cette allure**. Le constructeur `liveSafety` ne la transmet pas, et le normaliseur ne la conserve pas.

Si cette seule allure change entre aperçu et adoption, l'empreinte ne le détecte pas. La garde d'adoption relit ensuite les cibles nutritionnelles **gelées avec le brouillon**, pas une nouvelle cible calculée sur cette allure.

**Impact B2/B3 :** une portion validée contre l'ancienne demande peut être activée après modification de la demande. Ajouter le cas réel de changement d'allure, puis invalider ou revalider selon le contrat. Ne pas prétendre qu'il faut recomposer tout aperçu : l'adoption sans modèle reste le bon acquis.

### R4 — La réconciliation de masse progresse, mais B4 n'est pas fermé — confirmé par les artefacts

Source complémentaire omise du résumé : `scratchpad/2026-09-14-B4-FINAL/TABLES.md` et les fichiers `perte-b4-n4-final` / `perte-b4-n4-away-final`.

Points positifs :

- Le correctif `scaleIngredients` conserve les réductions au-dessus du plafond de croissance.
- Sur le plan historique 6 146/6 181 g, le helper de production remonte la production à **6 187 g**, soit **6 g de surplus** au lieu de 35 g manquants.
- La garde de masse refuse les préparations servies déficitaires ou illisibles ; les tests ciblés passent.

Mais le cas N=4 présences complètes (`n4-ref4` dans `tables.json`) comporte **260 g de `lentils_dry` dans les courses finales et aucune lentille dans les ingrédients de sa seule préparation ni de ses plats**. C'est vérifié dans le JSON, pas seulement repris du commentaire. Le cas N=4 avec Nils absent le mardi n'est pas dans `tables.json` (son banc a tourné après l'écriture du fichier) ; son journal `n4-away.banc.log` porte exactement les mêmes compteurs (`pot_removed: 1`, `lines_dropped: 2`, `lines_unattributed: 1`, `shopping_unattributed: 1`), et seul `TABLES.md` nomme la ligne comme les mêmes 260 g de lentilles. Le rapport détaillé l'explique par une préparation retirée et une identité cuite différente de l'identité sèche. Un reste d'achat orphelin n'est pas une portion utile.

Ne pas confondre avec l'entrée `n4-away-tir9s1` de `tables.json` : c'est un autre plan, celui du tir 9-s1 de la campagne mesuré hors handler, où les 914 g de lentilles sèches sont bien attribués à des casseroles. Ce n'est pas un orphelin.

Autres limites du relevé B4 :

- Le cas nommé `sna1` précise lui-même que le titulaire y a encore un âge : il ne prouve pas le chemin sans âge de cette version.
- La correction du plan historique a été exécutée hors handler ; sa tentative de rejeu dans un autre foyer échouait pour des IDs et un plafond de plats incompatibles. Cet échec n'est pas une preuve de contrôle de masse.
- Six cases sont signalées `unmeasurable` par un relevé intermédiaire N=4. Leur nature doit être rapprochée de la garde finale et de ses non-applicabilités ; ne pas conclure que six cases numériques invalides ont été servies à partir de ce seul compteur.
- Le script calcule `reste = prêt − prélevé`, puis teste l'égalité `prêt = prélevé + reste`. Cette égalité est tautologique ; la preuve utile est la mesure indépendante des ingrédients, l'absence de déficit, l'explication du surplus et la réconciliation des achats.

**Impact B4 :** conserver les fixes, fermer la ligne orpheline et refaire les deux preuves manquantes avec les bonnes identités/personnes. Ne pas assimiler l'ajout d'un compteur ou le succès d'un helper à toute la chaîne correcte.

### R5 — Les limites de temps et de coût après reprise ne sont pas démontrées

Les changements apportent un bail unique, une vérification du jeton avant écriture et un contrôle de l'état persistant : c'est une amélioration réelle.

Ils ne constituent pas une file d'exécution durable. Le travail reste dans le worker de la requête initiale ; une lecture répétée ne le redémarre pas. La durée de vie réelle de cet environnement doit être vérifiée, pas déduite uniquement d'un commentaire « 400 s ».

Le rapport propose 145 s de HTTP puis 235 s de lecture, une disponibilité p95 de 180 s et une échéance de 380 s. Ce changement de promesse n'est pas une preuve qu'elle tient. Les lectures réseau ont elles-mêmes une durée ; l'ancien verrou démontre déjà l'absence d'un état terminal fiable à l'échéance.

Le harnais de campagne n'archive pas le `request_id` de la demande ; on ne peut donc pas relier un artefact à sa ligne de verrou ou de brouillon autrement que par le compte et l'horodatage. À ajouter avant les 30 tirs, sinon la reprise ne sera pas auditable.

Les migrations ajoutées ne persistent pas un compteur d'appels modèle consommés par demande. Si « reprise » signifie seulement retrouver un résultat, elle ne paye pas de nouvel appel ; si elle relance un travail mort, le respect d'un maximum global de deux réparations exige une preuve supplémentaire. Ne pas annoncer « 1 à 3 appels au total, reprise comprise » à partir des seuls compteurs en mémoire, d'autant que les anciens relevés contiennent des appels auxiliaires.

## 6. Ce qui est déjà bien et ne mérite pas une réécriture

- Une génération manquant un repas a réellement été refusée dans la campagne.
- L'attribution par personne/créneau et les variantes ont des preuves ciblées, dont une preuve navigateur N=2.
- Les contrôles essentiels absents peuvent désormais bloquer la livraison ; le simple `conforme` historique n'est plus la seule décision.
- L'adoption réutilise le brouillon validé au lieu de demander une seconde recette au modèle. Corriger sa récupération, pas supprimer cet acquis.
- Le jeton de bail protège contre l'écriture d'un exécuteur remplacé ; ses tests statiques doivent être complétés par des tests de concurrence, pas remplacés par un verrou client.
- Les correctifs de réduction et de croissance des préparations sont testés. Le problème restant porte sur la réconciliation complète et ses preuves.
- La migration du cast de durée est déjà appliquée localement : ne pas faire rejouer une opération humaine devenue inutile.

## 7. Conditions avant de financer les 30 tirs

Rester dans la passation actuelle. L'ordre utile est :

1. Fermer R1/R2 : statuts expirés, reprise d'adoption et résultats déjà écrits, avec tests locaux de transaction et client. Aucune génération payante nécessaire pour prouver ces transitions.
2. Traiter R3 et finir R4 : changement d'allure, achats orphelins, bonne fixture sans âge, revalidation nutritionnelle et courses après correction.
3. Rejouer Composer → résultat → rechargement et Prévisualiser → Adopter → actif → rechargement sur la version finale, avec le profil maintien et les chemins de panne/concurrence.
4. Vérifier l'environnement et expliquer le 502 avec ses logs serveur/passerelle ; approuver, si nécessaire, un contrat de temps réaliste avant la campagne. Le 502 ne doit pas être absorbé dans « erreur modèle » sans preuve.
5. Figer toutes les dépendances pertinentes puis lancer deux pilotes N=2/N=4. Seulement si ces préconditions passent, compléter la campagne préétablie de 30 demandes avec son budget autorisé.

Le budget doit compter toutes les catégories d'appels ; les métriques doivent distinguer livré, sans écart essentiel, contrôlé, sans rattrapage et délai de disponibilité. Une campagne qui réussit sur une version ne valide pas la suivante.

## 8. Les trois garanties de la revue du 14 septembre, relues ici

La revue qui a précédé le plan bêta avait fixé trois garanties comme définition de « terminé », fondées sur l'assiette livrée. Elles sont couvertes par B1–B7 ; voici où chacune en est après cet audit.

| Garantie | Critères | État après audit |
|---|---|---|
| Chaque personne reçoit un repas compatible avec ses contraintes. | B1, B6 | Acquis partiels sérieux (attribution, variantes N=2 au navigateur). Non-régression N=4 et compte neuf non rejouée sur cette version. R3 : une allure d'objectif modifiée entre aperçu et adoption passe l'empreinte. |
| Le statut « conforme » correspond au contrat réellement respecté. | B2, B3 | Garde renforcée dans le code. Mais 22 livrés ≠ 22 conformes (§ 2), et les 22 réponses portent un contrôle `mouth_energy` incomplet non expliqué. L'adoption relit des cibles gelées, pas la demande courante. |
| Les quantités servies, cuisinées et achetées se réconcilient. | B4 | Surplus de 6 g au lieu de 35 g manquants sur le plan historique. **260 g de lentilles achetées pour aucune recette** sur le cas N=4 présences complètes, vérifié dans le JSON ; mêmes compteurs de retrait et de ligne non attribuée sur le cas avec absence (R4). Six cases `unmeasurable` par cas N=4 à rapprocher de la garde finale. |

Aucune des trois n'est fermée. La première et la deuxième dépendent d'un rejeu sur la version finale plus que d'un correctif ; la troisième a un défaut concret à corriger.

## 9. Bilan B1–B7 de cet audit

| Critère | Conclusion |
|---|---|
| B1 attribution | Acquis partiels sérieux ; régression finale N=4/compte neuf à vérifier. |
| B2 cible/contrat | Maintien UI non prouvé ; allure absente de l'empreinte d'adoption à traiter. |
| B3 vérité du verdict | Renforcé dans le code ; ancien comptage de 22 plans ne le prouve pas, adoption finale à exercer. |
| B4 quantités/courses | **Encore ouvert**, achat orphelin et preuves finales incomplètes. |
| B5 autonomie | **Encore ouvert**, statut ancien `in_flight` reproduit et récupération d'adoption incomplète. |
| B6 protections | Tests ciblés et acquis conservés ; pas d'audit exhaustif des accès ni de tous les scénarios dans ce tour. |
| B7 campagne | **Pas prête à démarrer directement à 30** ; version, préconditions opérationnelles, délai et budget à fixer. |

Le résultat n'est pas « tout est à refaire ». Plusieurs problèmes de calcul et de branchement ont été réellement corrigés. Le saut qui reste consiste à rendre cohérents les états et les preuves sur le plan final, au lieu de faire confiance à un test de module, un compteur ou un résumé de campagne pris isolément.

## 10. Clôture de l'audit — 2026-09-15

L'audit a été interrompu après l'écriture du rapport et repris pour être clos. Rien n'a été modifié dans le code, la base ou les artefacts entre les deux ; ce qui suit a été revérifié sur l'arbre courant.

- **Arbre inchangé.** Aucun fichier de `supabase/`, `frontend/src` ou `scripts/` n'a été modifié après l'écriture du rapport le 14 à 23:21. Les constats des § 4 et 5 portent sur l'arbre courant : base git `a14c6be1` plus le diff non commité partagé du poste.
- **Tests relancés à la clôture.** Suite Deno complète du dossier keel, avec la commande du gate : **7 330 réussis, 0 échec, 2 ignorés, 50 s**. Vitest ciblé sur sept fichiers (`planDraft`, `household`, `mealGeneration`, `groceryWaves`, `planDraftEnergy`, `planDraftQuestion`, `shoppingWhen`) : **110 réussis, 0 échec**, sur node 18.17.0, hors gate. Ces suites ne couvrent pas les défauts R1 à R4 : elles sont vertes **avec** ces défauts présents. C'est le point : un feu vert de suite n'est pas la preuve demandée.
- **Base locale à la clôture** (lecture seule, conteneur `supabase_db_Sophia_2`) : six migrations `20260914*` installées ; `keel_household_publish_generation` contient le cast `smallint` ; `keel_household_request_status` ne contient pas `started_at` ; deux verrous morts identifiés au § R1 ; un seul brouillon, en `done`, aucun brouillon `pending` ou `running` périmé.
- **Empreintes** : 15 sur 15 du verdict correspondent au disque.
- **Non fait, exprès** : aucun parcours navigateur, aucune génération payante, aucune écriture en base, aucune migration. Les cinq étapes du § 7 restent l'ordre d'attaque du prochain agent.

### Reproduire les constats

```bash
# Empreintes du verdict (15 lignes)
sed -n '196,210p' docs/keel/BETA-VERDICT-2026-09-14.md | awk '{print $1"  "$2}' | shasum -a 256 -c

# Verrous morts, âge en secondes, et corps de la RPC de statut (lecture seule)
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c "select request_id, left(actor_user_id::text,8), started_at, round(extract(epoch from (now()-started_at))) from public.household_generation_lock order by started_at;"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -At -c "select proname, prosrc like '%started_at%' from pg_proc where proname='keel_household_request_status';"

# Achat orphelin : lentilles sèches achetées, par cas B4
# (l'entrée n4-away-tir9s1 est un autre plan : ses 914 g sont attribués, ce n'est pas l'orphelin)
python3 -c "import json;d=json.load(open('scratchpad/2026-09-14-B4-FINAL/tables.json'));print([(c.get('nom'),[s['quantity'] for s in c.get('shopping_final',[]) if s.get('ref')=='lentils_dry']) for c in d])"

# Suite Deno du dossier keel (commande du gate)
deno test --allow-read --allow-env supabase/functions/_shared/keel/
```
