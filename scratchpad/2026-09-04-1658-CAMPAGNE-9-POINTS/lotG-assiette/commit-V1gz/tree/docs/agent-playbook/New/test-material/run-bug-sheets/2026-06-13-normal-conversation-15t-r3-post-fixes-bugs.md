# Bug Sheet - normal-conversation-15t-20260613-r3-post-fixes

## R3-B01 - Opportunity bloquée mais reproposée dans la réponse visible

- Bug id: `R3-B01`
- Tours: T3, T5
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne, variante frontière visible
- Domaine owner: final response / normal reply visible agent
- Source amont: le routeur bloque `flow_opportunity`, mais la couche visible normal reply continue à proposer l'action ou la carte associée.
- Symptome visible: Sophia dit "mini-action anti-pfff" puis "on prépare une carte d'attaque" alors que le flow a été bloqué par `normal_reply_fit_dominates`.
- Preuve systeme:
  - T3: `response_owner=normal_reply`, `flow_opportunity.prepare_attack_card.score=0.65`, `normal_reply_fit_score=0.85`, blocked path `normal_reply_fit_dominates`.
  - T5: mêmes signaux avec proposition visible explicite de carte.
- Correction attendue: les `blocked_paths` doivent devenir des contraintes visibles pour `normal_reply`: parler du besoin humain, mais ne pas reproposer le flow bloqué ni une action quasi équivalente.
- Statut: `open`
- Fix reference: R3 prouve que l'admission runtime est fixée, mais pas la couche visible.
- Tests requis:
  - Positif: "je veux créer une carte" lance bien le tool.
  - Paraphrase: "mini résistance, pas une crise" reste normal sans proposition de carte.
  - Anti-faux-positif: normal reply peut proposer une micro-observation non-outil, mais pas la surface bloquée.
  - Integration: 8 tours conversation normale avec `blocked_paths.flow_opportunity.*`.

## R3-B02 - `blocked_paths` dupliqués pour les flow opportunities

- Bug id: `R3-B02`
- Tours: T2, T3, T5
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: routing diagnostics / `intervention_policy`
- Source amont: `evaluateFlowOpportunityIntervention` est appliqué dans `runConversationRouters` puis réappliqué avant `maybeRunFlowOpportunityVerificationRuntime`, et les mêmes diagnostics sont concaténés.
- Symptome visible: aucun impact utilisateur.
- Preuve systeme:
  - T2: deux entrées identiques `flow_opportunity.prepare_defense_card / normal_reply_fit_dominates`.
  - T3/T5: deux entrées identiques `flow_opportunity.prepare_attack_card / normal_reply_fit_dominates`.
- Correction attendue: appliquer l'admission à deux portes si nécessaire, mais dédupliquer les diagnostics ou marquer la source (`router_policy`, `runtime_admission`) sans doublon.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Test unitaire: une opportunity bloquée ne produit qu'un `blocked_path` final par path/reason.
  - Integration: trace QA avec opportunity bloquée garde un diagnostic unique.

## R3-B03 - Carte d'attaque courte sur-clarifiée

- Bug id: `R3-B03`
- Tours: T9, T10, T11
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `prepare_attack_card` local flow / intake
- Source amont: slot filler et reducer local ne compactent pas assez quand le user demande une carte courte et fournit déjà moment critique, action, pensée et contrainte de simplicité.
- Symptome visible: Sophia demande confirmation de technique, puis action, puis pensée, jusqu'à ce que le user annule le flow.
- Preuve systeme:
  - T8: user donne `moment critique`: voir le fichier et penser "je vais me perdre".
  - T9: user confirme et demande "carte courte, pas un grand plan".
  - T10/T11: le flow redemande action puis pensée.
  - T12: user annule: "ça devient trop de questions".
- Correction attendue: mode intake compact: quand les slots sont suffisamment fournis, produire une proposition courte avec une seule validation finale, au lieu d'une question par slot.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: demande carte courte avec 3 slots préremplis aboutit à une proposition compacte.
  - Paraphrase: "pas un grand plan" / "garde-le simple" compresse l'intake.
  - Anti-faux-positif: si les slots essentiels sont absents, le flow peut clarifier.

## R3-B04 - Payload rappel contient le délimiteur final

- Bug id: `R3-B04`
- Tours: T13
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: `create_one_shot_reminder` parser / payload compiler
- Source amont: extraction du texte exact quote-delimited inclut l'apostrophe terminale.
- Symptome visible: faible, la réponse visible omet l'apostrophe.
- Preuve systeme:
  - User: texte exact `'ouvrir le fichier sans résoudre tout le dossier'`.
  - committed effect: `reminder_instruction="ouvrir le fichier sans résoudre tout le dossier'"`.
- Correction attendue: extraction structurée du texte exact sans inclure les délimiteurs; préserver le contenu interne seulement.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: texte exact entre apostrophes et guillemets conserve le contenu sans délimiteurs.
  - Paraphrase: "avec le texte exact : ..." fonctionne.
  - Anti-faux-positif: apostrophe interne légitime, par exemple `l'objectif`, reste conservée.

## R3-B05 - Status recap ajoute des préférences coach par défaut non demandées

- Bug id: `R3-B05`
- Tours: T15
- Famille: `BF-STATUS-01` - Projection DB mal lue ou mal rendue
- Domaine owner: `status_recap` visible prompt / projection filtering
- Source amont: projection contient `coach_preference_count=9` defaults, mais `coach_preference_found=false`; la réponse visible mentionne quand même "tes réglages".
- Symptome visible: récap ajoute "ton bienveillant mais ferme, focus discipline" alors que le user demande ce qui a été créé ou pas dans l'échange.
- Preuve systeme:
  - T15: `projection_summary.coach_preference_count=9`.
  - T15: `coach_preference_found=false`.
  - Réponse visible: "Pour nos échanges, je reste sur tes réglages..."
- Correction attendue: status recap doit respecter `requested_categories` et ne pas rendre les defaults coach comme une création ou modification du run quand `coach_preference_found=false`.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: recap après rappel + carte annulée mentionne uniquement rappel et absence de carte.
  - Paraphrase: "qu'est-ce qui a vraiment été créé ?" exclut les defaults.
  - Anti-faux-positif: si une préférence coach a vraiment été modifiée dans le run, elle peut être mentionnée avec preuve.

## R3-B06 - Status recap tronque le texte exact du rappel

- Bug id: `R3-B06`
- Tours: T15
- Famille: `BF-STATUS-02` - Historique incomplet
- Domaine owner: `status_recap` renderer / reminder fact rendering
- Source amont: rendu compact du rappel ne restitue pas le texte complet demandé.
- Symptome visible: Sophia dit `("ouvrir le fichier")` alors que le rappel créé était "ouvrir le fichier sans résoudre tout le dossier".
- Preuve systeme:
  - T13: texte demandé: "ouvrir le fichier sans résoudre tout le dossier".
  - T15 projection filtered fact: instruction complète présente, avec apostrophe parasite.
  - T15 réponse visible: texte tronqué.
- Correction attendue: quand le user demande ce qui a vraiment été créé, rendre le `reminder_instruction` complet, pas un résumé partiel.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: status recap affiche le texte complet du rappel.
  - Paraphrase: "récap honnête" et "qu'est-ce qui est actif ?" gardent le texte complet.
  - Anti-faux-positif: en recap très haut niveau non demandé, un résumé peut rester acceptable.
