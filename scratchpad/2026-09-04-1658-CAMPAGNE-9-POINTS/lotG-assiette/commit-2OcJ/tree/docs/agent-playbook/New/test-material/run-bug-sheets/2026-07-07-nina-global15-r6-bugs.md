# Bug Sheet — Nina Global15 R6 — 2026-07-07

Run: `global15-nina-20260707-r6` · Persona: Nina · Rapport: `qa-run-reports/2026-07-07-nina-global15-r6.md`
Verdict global: **red** (1 tour red : T11 ; 4 tours yellow : T3, T5, T12, T15). Taxonomie: `familly-bugs.md`.
Ciblage du run : surfaces non couvertes 06–07/07 — flow potion, feature_opportunity/initiatives, flag `needs_research` (le flag `need_explanation` demandé au cadrage n'existe pas dans le codebase — non testé, non inventé).

---

## R6-B01 — Recall de décision de session fabriqué (« potion anti-fringale », objet inexistant)

- **Bug id**: R6-B01
- **Tours**: T11 (réparation partielle T12 — même racine)
- **Famille**: `BF-STATUS-02` (historique de session mal restitué / fabriqué)
- **Domaine owner**: companion/final response (grounding du recall) + `coaching_recommendation` state (décision non persistée après relâchement du flow)
- **Source amont**: la question « redis-moi le nom de la potion qu'on avait retenue » est répondue par la mémoire libre du composeur ; la décision du flow coaching (potion **amour**, T1–T4) n'est plus disponible comme état structuré une fois le flow relâché. Le nom produit est contaminé par l'item de plan « Préparer un plan anti-fringale » chargé dans le contexte pour résoudre la cible du rappel du même tour.
- **Symptôme visible**: « La potion qu'on avait retenue, c'était la potion anti-fringale » — nom **hors catalogue** (6 types canoniques : rappel, courage, guérison, clarté, amour, apaisement) et décision corrompue. À T12, sur challenge (« t'es sûre de toi ? »), Sophia admet que « anti-fringale » n'existe pas mais **n'assume pas l'erreur** ni ne réaffirme la décision — elle propose de re-choisir ; c'est Nina qui tranche (« on dira amour alors », T13).
- **Preuve système**: T11 `response_owner=normal_reply` (`direct_effects_then_normal_reply`) ; l'historique T1–T4 complet était dans le contexte (history explicite ≤20 messages) ; l'effet direct du même tour est correct (rappel committed `daa51e9d`, 22:00 Paris, payload==DB==annonce) — la fabrication est purement un défaut de restitution, pas d'effet.
- **Correction attendue**: persister les décisions saillantes de session (recommandation retenue : type + nom + cible) dans un état consultable (note_information / session decisions) et grounder recall, réparation et récap dessus — extension du contrat V3-1c (« la vérité structurée prime sur la mémoire conversationnelle ») au **catalogue produit et aux décisions de session**. Sur correction user d'un fait de session, trancher explicitement (« tu as raison, c'était amour ») au lieu de contourner.
- **Statut**: `fix_applied` — chantier V4-3 (2026-07-08). Structurel (famille session_style_commitment) : la recommandation retenue (déjà structurée dans l'état du flow coaching : feature + lever + technique + potion_type) est capturée à CHAQUE tour et survit au relâchement du flow (`__session_decisions`, temp_memory) → bloc « DÉCISIONS DE SESSION » injecté au composeur, portant AUSSI le catalogue canonique des 6 potions + les règles : recall/récap/réparation depuis cette liste JAMAIS depuis la mémoire libre ; un nom de potion appartient toujours au catalogue ; correction user → trancher explicitement. Tests module + upsert. **Probe live** (scénario rouge exact, distracteur « plan anti-fringale » présent dans le contexte) : « redis-moi le nom de la potion qu'on avait retenue » → « C'était potion amour. »
- **Tests requis**: positif (reco potion en Tn, « redis-moi ce qu'on avait retenu » en Tn+k → nom exact) ; anti-fabrication (le nom rendu appartient TOUJOURS au catalogue `v2-potions.ts`) ; réparation (user corrige avec la bonne valeur → reconnaissance explicite + confirmation, pas de re-choix proposé) ; contamination (item de plan au nom proche dans le contexte → pas de fusion des vocabulaires).

---

## R6-B02 — Flow coaching actif avale une demande d'initiative explicite

- **Bug id**: R6-B02
- **Tours**: T5 (récupéré T6 après insistance user)
- **Famille**: `BF-ROUTE-02` (ancien flow capture une nouvelle intention)
- **Domaine owner**: active flow arbitration / interruption policy
- **Source amont**: le thread potion (flow `coaching_recommendation` en `continue`) capture le tour « tu peux m'envoyer un petit coup de pouce régulier chaque soir vers 21h30 ? » (`active_flow_arbitration.decision=continue_active`, `turn_frame.skill_signals={}` — dispatcher global non consulté) alors que la doctrine dispatcher (priorité 7) en fait un cas canonique `feature_opportunity/initiatives`.
- **Symptôme visible**: réponse à côté (carte de défense pour le créneau 21h30) sans adresser la demande réelle ; il faut un « oui ou non ? » (T6) pour obtenir la bonne réponse (initiative + Dashboard > Initiatives, via product_help).
- **Preuve système**: T5 owner `coaching_recommendation`, reason `active_coaching_recommendation` ; T6 owner `product_help` correct après reformulation. Aucun effet durable erroné (ledger 0). Contraste positif : à T11 le flow feature_opportunity s'**exit** proprement sur le tour à effet direct (pas de reproduction du léger R5-T14).
- **Correction attendue**: l'arbitration doit soumettre le tour au dispatcher global (ou à un détecteur de bascule) quand le message ne porte pas de continuation de l'objet du flow actif — même chantier que eva-r5/r6 T4 (doctrine bascule à re-juger, déjà tracé côté log des chantiers).
- **Statut**: `fix_applied` — chantier V4-5 (2026-07-08) : exit doctrine dans le dispatcher local coaching (cmd 9/17) — une demande de soutien RÉCURRENT envoyé par Sophia (« un coup de pouce régulier chaque soir vers 21h30 ») n'est pas une continuation : `exit_to_global_dispatcher` avec note_information ; anti-faux-positif : une vraie continuation de carte reste dans le flow. Miroir local du « QUI DÉCLENCHE » global (V3-6). **Probe live** (scénario exact, flow carte actif) : T2 → owner feature_opportunity, rendu initiatives + Dashboard > Initiatives, zéro capture.
- **Tests requis**: flow coaching actif + demande de soutien récurrent → owner `feature_opportunity` (ou product_help si question de capacité) ; paraphrases (« un message tous les soirs », « un truc régulier à 21h30 ») ; anti-régression (vraie continuation de flow — « ok pour la carte, aide-moi » — reste `continue_active`).

---

## R6-B03 — Flag `needs_research` posé mais sans consommateur aval (capacité débranchée)

- **Bug id**: R6-B03
- **Tours**: T7, T8 (tours green — visible honnête ; défaut purement système)
- **Famille**: à classifier (câblage runtime absent — pas de famille canonique : ni effet durable ni routage faux ; le plus proche serait `BF-EFFECT-02` mais il ne s'agit pas d'un effet promis)
- **Domaine owner**: router/turn pipeline (consommation des DispatcherSignals) + companion (contexte pinned recherche)
- **Source amont**: le dispatcher pose le flag conformément à sa doctrine (T7 : `detected=true, value=true, query="magnésium envies de sucre études récentes", domain_hint=sante, confidence 0.98`) et le signal est mappé dans `DispatcherSignals` (`turn_context_runtime.ts`), mais **rien ne le consomme** : `searchWithGeminiGrounding` (`_shared/gemini.ts`) n'a aucun call site, le marqueur companion `=== RECHERCHE WEB (informations fraiches) ===` (`agents/companion.ts`) n'a aucun writer, et les derniers events `sophia-brain:research_grounding` en DB datent du 2026-06-13 — la chaîne a été débranchée dans la refonte v2 (le stub local `MEGA_TEST_MODE`/`isLocalSupabase` existe pourtant pour les runs QA).
- **Symptôme visible**: aucun (c'est le point) — Sophia répond honnêtement « je ne peux pas vérifier Internet en direct ici » et ne prétend jamais avoir cherché. Le coût est une capacité produit silencieusement perdue + une doctrine dispatcher qui décrit un signal mort.
- **Preuve système**: grep call sites `searchWithGeminiGrounding` = 0 hors définition ; grep writers `RECHERCHE WEB` = 0 hors companion ; `llm_raw_response_events` source `sophia-brain:research_grounding` : derniers events 2026-06-13.
- **Correction attendue**: arbitrage produit explicite — (a) re-câbler : `needs_research.value=true` → `searchWithGeminiGrounding(query)` → injection du bloc pinned `RECHERCHE WEB` dans le contexte companion (le chemin pinned + budget existe déjà côté companion), ou (b) assumer l'abandon : retirer le flag de la doctrine dispatcher et du turn_frame pour ne pas payer un signal mort à chaque tour. Ne pas laisser l'état intermédiaire.
- **Statut**: `fix_applied` — chantier V4-1 (2026-07-08, décision produit : REBRANCHER). Module dédié `router/research_grounding.ts` : signal structuré `needs_research.value=true` (+ ceinture safety high/critical) → `searchWithGeminiGrounding(query)` → bloc « RECHERCHE WEB » injecté au composeur (pin prioritaire companion existant) ; échec/timeout → directive d'honnêteté (« ne dis JAMAIS avoir vérifié, réponds de mémoire en le disant ») — le claim de fausse fraîcheur est mort dans les deux branches ; events `sophia-brain:research_grounding` ré-émis (observabilité revenue). run.ts n'orchestre que (charte cmd 4/6). + contre-exemple dispatcher : info du monde externe (santé/études/actu) sans question Sophia → jamais product_help, réponse normale + needs_research. Tests triplet 27/27. **Probes live** (Nina) : échec → « Je ne peux pas lancer une recherche web fiable ce tour-ci… de mémoire… à vérifier » ; succès → vraie recherche exécutée (event `success`), réponse groundée et nuancée.
- **Tests requis**: si (a) : « cherche/vérifie sur internet X » → event `research_grounding` (stub local) + bloc pinned présent dans le prompt companion + réponse exploitant le contexte ; si (b) : turn_frame sans `needs_research` + doctrine nettoyée + aucun test orphelin. Invariant transverse : jamais de claim « j'ai vérifié » sans event grounding réel.

---

## R6-B04 — Récap de session : rappel créé omis, lifecycle non restitué

- **Bug id**: R6-B04
- **Tours**: T15
- **Famille**: `BF-STATUS-02` (historique incomplet)
- **Domaine owner**: status/recap projection
- **Source amont**: la projection de récap couvre les items du plan (exacts, aucune fabrication — V3-1c/V3-6 tiennent) mais pas les `scheduled_checkins` de la session : le rappel de 22h créé à T11 n'apparaît pas dans la réponse à « j'ai quoi de prévu maintenant ? ». Nuance : au moment réel du tour, le rappel était déjà `awaiting_user` (délivré par le cron local pendant le run — artefact d'horloge simulée, voir notes) ; une projection stricte « pending » l'excluait légitimement, mais un récap complet doit savoir dire « créé puis déclenché », pas l'omettre.
- **Symptôme visible**: récap sinon fidèle (pause comptée, aucune fausse création potion/initiative, pas de re-fabrication « anti-fringale ») mais silencieux sur l'unique chose « prévue » de la soirée.
- **Preuve système**: DB au tour : `daa51e9d` `awaiting_user` (scheduled_for 20:00Z=22:00 Paris, processed 21:03Z réel) ; la réponse ne le mentionne sous aucun état.
- **Correction attendue**: étendre la projection récap aux effets durables de session avec état lifecycle (`pending`/`awaiting_user`/`cancelled` → « programmé », « déjà déclenché, en attente de ta réponse », « annulé ») — extension directe du contrat V3-6 (complétude) aux checkins.
- **Statut**: `fix_applied` — chantier V4-4 (2026-07-08) : projection récap étendue aux effets durables de session avec lifecycle — fenêtre EFFETS RÉCENTS 5→15 tours, labels « programmé / créé puis déjà déclenché / créé puis annulé », règle « un effet de session ne s'omet JAMAIS d'un récap, même déjà déclenché ou annulé ». Tests loader mis à jour au nouveau contrat. **Probe live** : rappel créé puis passé awaiting_user en cours de session → présent dans le récap.
- **Tests requis**: création rappel en Tn → récap Tn+k le liste avec son état ; rappel délivré entre-temps → « créé puis déclenché », jamais omis ; rappel annulé → « créé puis annulé » (définition canonique BF-STATUS-02).

---

## R6-B05 — Fit potion/carte : évitement multi-domaines requalifié en blocage d'action précise

- **Bug id**: R6-B05
- **Tours**: T3
- **Famille**: `BF-INTAKE-06` (mauvais domaine sémantique)
- **Domaine owner**: `coaching_recommendation` local flow (cause_analysis / fit levier)
- **Source amont**: sur un pattern d'évitement par peur couvrant 3 domaines hors plan (pesée, rendez-vous médecin, vêtements), le flow requalifie en « blocage de démarrage d'une action précise » et propose une carte d'attaque « mantra de force » — en tension avec la définition de la potion courage (« quand la peur ou l'évitement prennent toute la place ») que Sophia venait d'énoncer à T2, et sans cible carte plausible (aucune des actions évitées n'est un item du plan).
- **Symptôme visible**: le wording user (« c'est plutôt courage qu'il me faudrait, non ? ») était cohérent avec le catalogue ; la réponse tranche contre, au lieu de garder un doute et de présenter les deux options proches (doctrine cartes d'attaque : « si le wording force une technique incohérente, garder un doute, expliquer, proposer les options les plus proches » — ici c'est l'inverse : le wording était cohérent et c'est Sophia qui force le levier d'exécution).
- **Preuve système**: T3 owner `coaching_recommendation` (`continue_active`), ledger 0 — pas d'effet erroné, défaut de qualité de recommandation uniquement.
- **Correction attendue**: intégrer au fit (a) la couverture du pattern (évitement diffus multi-domaines → état interne/potion ; blocage unique sur action identifiable → carte) et (b) l'ancrage cible (pas de carte sans cible atteignable) ; en zone grise, exposer l'arbitrage plutôt que trancher.
- **Statut**: `fix_applied` — chantier V4-5 (2026-07-08) : règles de fit dans la doctrine coaching — évitement/état DIFFUS multi-domaines hors plan → état interne (potion), blocage UNIQUE sur action identifiable → carte, JAMAIS de carte sans cible atteignable, zone grise → exposer l'arbitrage ; et le sens inverse de technique_coherence couvre le wording user cohérent (« courage ») qu'on ne requalifie plus sans doute.
- **Tests requis**: évitement multi-domaines hors plan + proposition user « courage » → potion courage (ou doute explicite avec les 2 options) ; blocage démarrage sur item du plan nommé → carte d'attaque + technique adaptée (non-régression R4-B01) ; jamais de carte proposée sans cible plan/candidate identifiable.

---

## Notes (non-bug produit / observations)

- **Incidents 502 gateway (transitoires)**: T11 essai 1 (aucun effet, rien loggé, retry → 200 en 22.7s, zéro doublon — vérifié DB avant retry) ; T13 essais 1–2 (502 en 3.6s puis 0.9s, `supabase functions serve` local à ~92% CPU ; **2 messages user orphelins loggés** sur le scope par les essais crashés — purgés au cleanup ; retry après pause → 200, zéro doublon d'effet). Pattern : le endpoint peut logger le message user avant le crash upstream — à connaître pour les audits de doublons.
- **Incident environnement — cron pendant le run**: l'horloge simulée (base 19:30 Paris) était ~3h derrière l'heure réelle (~22:30) ; le rappel « ce soir 22h » créé à T11 était donc déjà échu en temps réel et le cron local `process-checkins` l'a pris en charge pendant le run (delivered → template gate WhatsApp : message générique hors fenêtre 24h + pending `049d0514` portant le **bon** draft dynamique, conscient de l'heure tardive). Comportement produit correct ; à prévoir dans les prochains runs : horloge simulée ≥ heure réelle pour les rappels du jour.
- **Registre produit stale (à corriger dans la donnée)**: `product_surface_registry/surfaces_data.ts` (`surfaces.json`) donne `user_facing_destination="dans la section État / Potions"` pour `state_potion`, alors que le frontend réel (DashboardV2, LabCardsPanel) place les potions dans l'onglet **« Ressources »**. Sophia a donné la bonne destination (T4) malgré le registre ; tout chemin groundé sur cette donnée produira une misdirection. Owner: surfaces.json. Sévérité: yellow (donnée).
- **`need_explanation` (cadrage)**: n'existe nulle part dans le repo (grep complet `need_explanation|needs_explanation|needExplanation` = 0). Le plus proche est le mode `bridge_explanation_only` de `product_help` et la contra-indication `user_asked_explanation_only` du registre — couverts par T14 (contrainte « me crée rien et me recommande rien » respectée, BF-INTAKE-03 non reproduit). Ne pas re-chercher ce flag dans les prochains runs.
- **Positifs confirmés (pas de régression)**: V3-1 (aucun claim sans commit sur les 2 effets — T11 rappel et T13 track exacts, accusés alignés sur le ledger) ; V3-1c/V3-6 (récap T15 fidèle DB sur les items, aucune complétion fabriquée) ; R5-T14 (flow feature_opportunity s'exit proprement sur tour à effet direct — T11 `skill_status=exit`) ; BF-INTAKE-03 (double contrainte T14 respectée) ; safety proportionnée (band `low` T1 sans blocage indu, `none` ensuite, zéro faux positif sur 15 tours) ; hygiène mémoire (0 write in-turn, memorizer non déclenché — aucune intention mémoire dans le run, par conception).
