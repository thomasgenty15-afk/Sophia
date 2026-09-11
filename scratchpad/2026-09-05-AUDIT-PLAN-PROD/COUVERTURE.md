# Couverture de la checklist de 79 points

**Attention version :** ce tableau classe les observations réelles du 5 septembre. Au 6 septembre, « Garder », l’explication solo et le calcul énergétique ont reçu des correctifs : leurs statuts historiques demandent une nouvelle recette, ils ne décrivent pas automatiquement HEAD actuel. Les contournements allergiques ont été reproduits de nouveau sur HEAD actuel.

Statuts limités aux preuves de cette campagne : **PASS** = propriété observée sur les cas cités ; **FAIL** = contre-exemple ; **INCONCLUSIVE** = scénario non exercé ou preuve insuffisante. Un PASS ponctuel n’est pas une garantie générale. Les tests unitaires seuls ne valident pas une exigence de parcours réel. Les références A/B/C renvoient aux fichiers de réponse et de métadonnées de ce dossier.

| N° | Statut | Preuve ou limite |
|---:|---|---|
| 1 | FAIL | B01 : course unique samedi, poulet pour mardi sans congélation, session demandant un achat plus tardif. |
| 2 | INCONCLUSIVE | Styles et sessions visibles en API ; B03 minimal cinq personnes refusé. Pas de validation complète de la variété keen. |
| 3 | INCONCLUSIVE | B03 refuse la composition ; aucun pot minimal de ce foyer ne peut être inspecté. |
| 4 | INCONCLUSIVE | A05 et A07 : une session respectée et usages tardifs au congélateur ; rendu de leurs couvercles non vérifié. A05 perd mercredi. |
| 5 | INCONCLUSIVE | Recomptage des masses finales fourni ; plusieurs lignes non attribuables conservées. Ne pas assimiler automatiquement une ligne non attribuable à un orphelin. |
| 6 | INCONCLUSIVE | Couvert par tests déterministes existants ; campagne réelle sans comparaison isolant l’eau seule. |
| 7 | INCONCLUSIVE | Pas de scénario réel de garde-manger alimenté. |
| 8 | INCONCLUSIVE | B01 utilisait une mauvaise clé de fixture (`cooking_days`, lecteur `cook_days`) ; ne pas en déduire un défaut produit. |
| 9 | INCONCLUSIVE | B01 : deux sessions de 30 min ; A05 : dépassement annoncé, mais style balanced. Pas de plan minimal cinq personnes achevé. |
| 10 | FAIL | A03-r1 : couscous du jeudi utilisé mercredi ; ratatouille retirée mais encore promise dans les titres. |
| 11 | FAIL | C01 écrit zéro boîte alors que huit attendues ; B05 en avait six avant recomposition. |
| 12 | INCONCLUSIVE | Julie/Marc sur ancien plan : noms, grammes et kcal conditionnelles observés. Pas de revue visuelle complète du nouveau plan écrit. |
| 13 | FAIL | C01 enregistré sans boîtes ; cellules entièrement vides exclues du calcul (`delivery-probe.json`). A05 signale correctement certains trous en draft. |
| 14 | FAIL | Objectif de jetons non systématique : A03-r4 relance 11 380 / initial 15 631 ; A06-r4 7 801 / 8 119. Inclut le raisonnement, pas seulement le JSON visible. |
| 15 | PASS | A05 retire Nora de quatre repas sans boîtes incompatibles et expose `held_off_regime`. |
| 16 | INCONCLUSIVE | Pas de réparation de citation/item constatée dans les premiers cas (`0`) ; présence du mécanisme testée ne suffit pas. |
| 17 | FAIL | A03 : titres incluant « poulet ou tofu », plutôt qu’un titre neutre pour la base. Rendu des nouveaux couvercles non vérifié. |
| 18 | FAIL historique | A03-r1 : 8 écarts ≥200 après densification ; A05 : 10 ; B02 : 12. |
| 19 | INCONCLUSIVE | Voir `final-masses.json` : mesure finale, certains pots non vérifiables. Alertes de parseur antérieures au redimensionnement non prises pour verdict final. |
| 20 | INCONCLUSIVE | Compteurs archivés ; pas d’oracle indépendant validant toutes les bornes et chaque mouvement de densification. |
| 21 | FAIL | C01 n’a aucune quantité de boîte malgré des repas cuisinés et un objectif ; cohérence des masses existantes vérifiée séparément. |
| 22 | INCONCLUSIVE | `uses.kept = freezer` observé sur A05/A07 ; dates et double affichage de ces nouveaux plans non vérifiés. |
| 23 | FAIL | A06-r2 réel sert des œufs à Tom allergique ; parseur confirme le trou œ/oe. Autre contournement : lait sans lactose. Point positif : note du maître → allergie cashew de Tom persistée en C01. |
| 24 | PASS | A03-r1 : séparation 12/12 repas principaux, refus 0, swap 12/12. Limité à cette sortie ; les autres moments sont traités au point 32. |
| 25 | INCONCLUSIVE | Pas de cas réel inverse ni foyer entièrement végétarien dans cette campagne. |
| 26 | FAIL | A06-r2 : toute la table devient végétarienne, swap.flagrant=true (dit dans la rationale). A03/A05 réussissent sur ce point. |
| 27 | INCONCLUSIVE | Cannelloni scindés demandés en B03, mais aucune composition rendue. |
| 28 | PASS | B02 : même préparation de lasagnes, 488 g Alice / 900 g Marc. Atteinte énergétique insuffisante, voir 18. |
| 29 | PASS | B02 : lentilles demandées pour Alice, pois chiches dans la boîte de Marc, `separated=1`. Autres formes de compromis non exercées. |
| 30 | FAIL | B02 sert du pain complet malgré exclusion de table ; probes montrent aussi six sur-interdictions dues aux mots séparés. |
| 31 | INCONCLUSIVE | Clarification de portée du régime par conversation non exercée. |
| 32 | PASS | A05 : petits-déjeuners et collation incompatibles détectés pour Nora. Détection réussie, réparation incomplète. |
| 33 | INCONCLUSIVE | Causes et membres présents dans les diagnostics ; notification et carte après retrait non vérifiées sur le nouveau plan. |
| 34 | INCONCLUSIVE | B01 Montréal retire les repas passés, mais tir vers 14 h 49 locale, pas à 12 h. |
| 35 | INCONCLUSIVE | Pas de tir exactement à 16 h avec rythme déjeuner+dîner. |
| 36 | PASS | Tirs Paris après la coupure : départ au lendemain, `shopping_cutoff`, rationale explicite. |
| 37 | PASS | Montréal conserve le jour courant et sept jours ; Paris décale au lendemain. Fuseaux de fixture lus dans les profils. |
| 38 | FAIL | Trois jours → deux et sept → six après coupure. Absences individuelles non exercées. |
| 39 | INCONCLUSIVE | Pas de franchissement réel de minuit avec plan vivant. |
| 40 | FAIL historique | Solo corrigé depuis, à recetter ; auparavant pas d’explication solo ; B04/C01 explication vide ; B05 → C01 perd son explication. |
| 41 | FAIL | A03 explication de courses contredite par les dates ; B01 budget repris sans estimation ni arbitrage chiffré. |
| 42 | INCONCLUSIVE | Pas de culpabilisation constatée dans les explications conservées ; situations protégées et contraintes inventées non couvertes exhaustivement. |
| 43 | FAIL | A03 : poisson annoncé acheté près de jeudi mais course lundi. A05 : rationale annonce trois sessions puis une seule. |
| 44 | PASS | Explications non vides des sorties françaises observées en français. |
| 45 | FAIL | Dimensionnement non conforme aux enveloppes internes sur A03/A05/B02 ; C01 perd toutes les boîtes. |
| 46 | INCONCLUSIVE | Âges mineurs reconnus dans le dimensionnement ; pas de test réel complet des affichages TCA, coach sans comptage, âge inconnu. |
| 47 | INCONCLUSIVE | Pas de scénario de deux coachs avec interrupteurs divergents. |
| 48 | INCONCLUSIVE | Corps de fiche lu (`body_from_sheet`), mineurs reconnus ; grossesse/allaitement non exercés. |
| 49 | INCONCLUSIVE | Clamp mesuré, pas d’avant/après du changement d’algorithme sur version figée. |
| 50 | INCONCLUSIVE | Pas de comparaison réelle avec/sans note d’activité datée. |
| 51 | INCONCLUSIVE | Surface publique des fourchettes kcal non testée. |
| 52 | INCONCLUSIVE | Titres distincts comptés dans `observations.json`, mais titres différents peuvent cacher la même préparation. Pas de certification de variété sémantique. |
| 53 | INCONCLUSIVE | Titres de petits-déjeuners variés mais nombreuses bases yaourt ; seuil de variété sémantique restant à définir et mesurer. |
| 54 | PASS | B01 vraie pizza à la poêle ; B02 lasagnes ; B04/B05 fajitas demandées par le maître. A06-r2/r3/r4 conservent aussi pizza et raviolis, mais avec les autres défauts décrits. |
| 55 | INCONCLUSIVE | Liste coach individuelle non testée de bout en bout. |
| 56 | INCONCLUSIVE | B01 respecte l’absence de four et cite 25 ; absence de prix vérifiables ne permet pas de certifier le budget. |
| 57 | INCONCLUSIVE | C01 classe l’allergie dans la sécurité et l’envie dans next_plan ; pas de matrice complète des trois destinations ni des deux sources. |
| 58 | PASS | B04 : ligne betterave déclarée par le maître dans le prompt sous Marc avec THIS PERSON ONLY. Demande injectée dans compte secondaire retirée des défauts : hors parcours autorisé démontré. |
| 59 | INCONCLUSIVE | Anneau après « Voir » non vérifié. |
| 60 | FAIL | C01 : plan commun écrit sans validated_at ; RPC de validation refuse not_a_personal_plan. Aucun événement d’expiration produit par ce parcours. |
| 61 | FAIL historique | Ancien magasin non consommé le 5 septembre ; correctif présent le 6, recette réelle à refaire. |
| 62 | PASS | C01 : allergie médicale de Tom enfant sans compte persistée en table de sécurité par la note du maître. Pas une préférence expirante. |
| 63 | FAIL | C01 laisse deux envies sémantiquement équivalentes de fajitas ; duplicata exact et superseded non éprouvés. |
| 64 | INCONCLUSIVE | Récap du soir non exercé. |
| 65 | FAIL | Laitue/lait distingués, mais faux négatifs œufs/oeuf et lait sans lactose ; sur-interdictions multi-mots. |
| 66 | FAIL | Imports et appels rhythmOverlayFor/logisticsOverlayFor encore présents dans les générateurs. |
| 67 | INCONCLUSIVE | Réglages via chat, affichage et Défaire non exercés. |
| 68 | INCONCLUSIVE | Six rejeux frais terminés, 86 à 279 s. Neuf réussites locales dépassent 150 s ; pas de SLA hébergé validé. Attribution des premiers 546 au worker réutilisé distincte de la latence froide. |
| 69 | INCONCLUSIVE | 400, 401, 403, 409, 422 et 546 observés ; pas de revue de toutes les copies front dans les deux langues. |
| 70 | PASS | Usage réel enregistré avec gpt-5.6-luna pour la génération ; nano pour certaines compositions de référence. |
| 71 | FAIL | boxes_gate absent des drafts observés ; compteurs de boîtes/énergie à zéro possibles faute de boîtes, pas parce que tout va bien. |
| 72 | INCONCLUSIVE | Ancien plan Julie/Marc ouvert : couvercles, quantités, kcal conditionnelles. Nouveau plan C01 non inspecté en UI. |
| 73 | INCONCLUSIVE | about-you ancien compte ouvert ; anneau et disparition après validation non exercés. |
| 74 | FAIL historique | Carte désalignée avec about-you le 5 septembre ; rebranchement présent le 6, rendu actuel non vérifié. |
| 75 | INCONCLUSIVE | Vue 320×740 de l’ancien plan inspectée, document sans débordement global ; couverture des champs et sessions complexes incomplète. |
| 76 | INCONCLUSIVE | Solo/couple/3/4/5, objectifs opposés, enfant allergique, régime minoritaire, styles et fuseaux présents ; horaires précis et quelques variantes manquent. |
| 77 | INCONCLUSIVE | Requêtes/réponses/usage/empreintes et compteurs disponibles archivés ; champs absents nommés, courses orphelines non toutes résolues. |
| 78 | INCONCLUSIVE | Critères fixés avant tirs ; incident initial de concurrence documenté ; série de six rejeux frais terminés. Fixtures existantes non modifiées. |
| 79 | PASS | Limites statistiques, d’écran, de sécurité métier et de déploiement explicites dans le rapport. |

Le changement de compte dans le navigateur a été bloqué : première revue automatique refusant la déconnexion de la session QA existante, puis limite d’usage de l’outil de revue. Aucun contournement de session n’a été effectué. Les lectures et tests API sur les comptes isolés ont continué.
