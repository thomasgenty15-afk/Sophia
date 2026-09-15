# Bug Sheet - paul-untested15-r1 (2026-07-12)

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-paul-untested15-r1.md`

Run 15 tours Paul cible sur les surfaces non couvertes par les rapports du
10-12/07 (track consenti +/-, multi-intent, recurrent, cancel, statut
post-cancel, needs_research, plan_realignment sous insistance, product_help
abonnement, memoire batch). Verdict global **red** (T10).

## R1-B01 — Question de statut classee create explicite => rappel recree silencieusement

- Bug id: `R1-B01`
- Tours: T10 (contre-preuve T14 ; contexte T4)
- Famille: `BF-INTAKE-04` (ambiguite non reconnue — interrogatif traite comme commande), contributeur `BF-LEDGER-02` (commit reel rendu comme continuite d'un rappel annule)
- Domaine owner: dispatcher / lane `direct_effects` (turn_frame), en aval tool `one_shot_reminder`
- Source amont: classification direct_effects — « mon rappel de demain matin 8h ... il est toujours bon hein ? » sort en `create_one_shot_reminder, explicitness=explicit, confidence_band=high` alors que le MEME frame porte `memory_plan.response_intent=status_check_reminder`. L'executor commit (133d1e2d) car le frame est explicit/high ; l'admission ne peut pas rattraper.
- Symptome visible: Sophia confirme « il est bien confirmé et il partira bien » un rappel que le user a fait annuler au T4 — en realite elle vient d'en creer un NOUVEAU sans le dire. Etat mental user faux + effet durable non consenti.
- Preuve systeme: turn_frame T10 (direct_effects create explicit/high VS response_intent status_check_reminder) ; ledger requested->allowed->committed `scheduled_checkins:133d1e2d` pending 06:00Z ; `64631913` cancelled au T4 ; audit delete sans purge concurrente ; T14 (question statut sans slots) => 0 effet, projection exacte.
- Correction attendue: invariant de coherence intra-frame au dispatcher : `response_intent=status_check_*` => aucun `create` direct sans confirmation ; classification des references interrogatives a un rappel existant en `status_read`, et en `needs_clarify` quand la presupposition contredit la DB (rappel annule => enoncer l'etat reel + proposer la re-creation explicitement). Pas de regex sur la phrase : regle contractuelle frame-level.
- Tests requis: positif (paraphrases interrogatives avec slots complets « c'est bien calé pour 8h ? », « il est toujours prévu mon rappel de X ? » => 0 create, reponse depuis la projection y compris `cancelled`) ; anti-faux-positif (vraie demande « remets-le moi pour 8h » => create) ; integration (sequence create->cancel->question statut => reponse « annulé a ta demande, je le remets ? »).
- Statut: `fix_applied` (2026-07-13, chantier P2-1)
- Fix reference: invariant de cohérence intra-frame au sanitizer (`dispatcher.v2.ts`) : `memory_plan.response_intent=status_check_*` → tout create PUR est droppé (cancel/replace/status survivent — anti-FP rose T14 testé) ; l'admission ne pouvait pas rattraper, le sanitizer si. Règle 39 : la question avec slots complets = intent='status' MÊME avec heure+objet (verbatim T10) ; rappel annulé → énoncer l'état + proposer la re-création. Triplet dispatcher.test.ts. Probe live T10 : zéro create, zéro pending recréé, état « annulé » énoncé — 2× GREEN.## R1-B02 — Recap post-incident sans reparation ni ownership

- Bug id: `R1-B02`
- Tours: T11
- Famille: `BF-STATUS-02` (historique restitue mais etat courant non tranche, reparation absente)
- Domaine owner: companion / final response policy
- Source amont: aucune regle de reparation quand le recap expose un effet cree sans demande — Sophia dit « un nouveau rappel a été recréé » (voix passive, sans repondre a « t'as recréé sans me demander ? ») et propose « t'aider à repérer lequel est encore actif » alors qu'elle vient d'enoncer lequel est actif ; l'annulation evidente (user bosse de chez lui) n'est pas proposee, le user doit la redemander (T12).
- Symptome visible: l'utilisateur porte la charge de la correction apres une erreur systeme.
- Preuve systeme: T11 ledger vide (aucune action) alors que la DB montre 1 pending non voulu ; T12 necessaire pour le cancel.
- Correction attendue: regle de contrat companion « effet durable expose comme non consenti => assumer en voix active + proposer l'action corrective (cancel/modif) dans le meme tour ».
- Tests requis: scenario create non consenti puis confrontation => la reponse contient l'aveu actif et l'offre de correction ; anti-faux-positif : effet consenti confronte => pas de fausse excuse.
- Statut: `fix_applied` (2026-07-13, chantier P2-7, volet doctrine)
- Fix reference: guidance committed/status : ordre accueil-d'abord + interdits de voix passive sur un effet non consenti. Volet « aveu actif + action corrective dans le même tour » reste doctrine composeur — à surveiller au rejeu.## R1-B03 — `feature_opportunity` capture un tour d'annulation pure

- Bug id: `R1-B03`
- Tours: T12
- Famille: `BF-ROUTE-01` (owner discutable ; impact nul ce tour)
- Domaine owner: dispatcher / route policy (arbitrage skill signal vs direct effect)
- Source amont: signal `feature_opportunity` medium (`feature=initiatives`, `opportunity_kind=recurring_context`) prend l'ownership d'un tour dont l'intention est un cancel explicite ; la lane direct-effect a bien execute le cancel et aucun pitch n'est sorti, mais l'ownership est fragile (risque de derive du tour transactionnel si le skill pitche un jour).
- Symptome visible: aucun (reponse sobre correcte, cancel commite).
- Preuve systeme: trace T12 `response_owner=feature_opportunity`, `skill_signals.feature_opportunity confidence=medium`, ledger cancel committed, DB 0 pending.
- Correction attendue: regle d'arbitrage « direct effect explicite dans le tour > skill signal medium » — le signal feature reste candidat pour un tour calme ulterieur.
- Tests requis: tour cancel/create explicite + signal feature medium simultane => owner lane direct-effect + normal_reply ; anti-faux-positif : tour sans direct effect avec signal fort => feature_opportunity garde la main.
- Statut: `fix_applied` (2026-07-13, chantier P2-8)
- Fix reference: arbitrage structurel dans routers.ts : un direct effect EXPLICITE dans le tour retire l'ownership à un signal feature_opportunity MEDIUM (le signal reste candidat pour un tour calme) ; high/critical garde la main.## R1-B04 — KB `product_help` sans domaine abonnement/facturation

- Bug id: `R1-B04`
- Tours: T9
- Famille: `a classifier` (couverture de contenu KB — aucune famille routing/effets ne correspond ; le garde-fou honnetete a fonctionne comme concu)
- Domaine owner: skill `product_help` (base de connaissance)
- Source amont: grep du skill — aucune entree abonnement ; face a « comment passer a la formule au-dessus ? je perds un truc en cours de mois ? », Sophia repond honnetement « je ne peux pas te dire... sans info produit fiable » + renvoi vague (« espace abonnement de l'appli ou support »).
- Symptome visible: question legitime d'un client payant sans reponse concrete (contraste avec la precision du renvoi plan T6).
- Preuve systeme: trace T9 owner `product_help` `complete`, reponse d'indisponibilite.
- Correction attendue: ajouter au KB une section abonnement groundee (surface produit exacte, regles upgrade/downgrade, proratisation Stripe), versionnee avec le produit. Pas de patch de phrase : sans source de verite, toute reponse serait hallucinee.
- Tests requis: question upgrade => chemin produit concret sans chiffre invente ; question proratisation => reponse groundee KB ou renvoi explicite support.
- Statut: `fix_applied` (2026-07-13, chantier P2-8)
- Fix reference: entrée KB `account.subscription` groundée sur le produit réel (portail de facturation Stripe via Compte, page Upgrade, détail affiché AVANT confirmation, annulation immédiate sans prorata à la suppression de compte) + sophia_must_not_claim (jamais de montant/date/prorata chiffré : le portail fait foi).## R1-B05 — Loader memoire actif casse par un item `candidate` residuel

- Bug id: `R1-B05`
- Tours: transversal (2 tours du run avec `brain:memory_v2_active_loader_failed`)
- Famille: `a classifier` (memory runtime — la famille la plus proche serait BF-MEMORY mais le defaut est un invariant de chargement, pas une promesse non persistee)
- Domaine owner: memory runtime (`_shared/memory/runtime/active_loader.ts` + `loader.ts`)
- Source amont: la requete du loader actif remonte un item `status=candidate` (`memory_items d5416413`, residu d'un run precedent du 12/07 01:16Z jamais nettoye) ; le garde `assertOnlyActiveMemoryItems` (loader.ts:93) jette => le recall memoire du tour echoue silencieusement. Degradation fleet-wide tant qu'un candidate existe pour un user.
- Symptome visible: aucun directement (recall degrade en silence).
- Preuve systeme: `conversation_runtime_events` event `brain:memory_v2_active_loader_failed`, payload `memory_v2_loader_invalid_item_status:d5416413:candidate` (2 occurrences pendant le run).
- Correction attendue: double volet — (1) produit : filtrer `status='active'` dans la requete du loader (l'assert reste en ceinture) ou faire tolerer/skiper les non-active avec warning ; (2) hygiene QA : purger le residu `d5416413` et rappeler dans les guidelines que les items `candidate` des batchs de test doivent etre nettoyes.
- Tests requis: loader avec item candidate en DB => recall OK sans exception + warning trace ; test existant `loader_test.ts:73` a completer par le chemin requete.
- Statut: `fix_applied` (2026-07-13, chantier P2-5a)
- Fix reference: le seul chemin sans filtre de statut (jointure topic, `loadTopicItems`) filtre désormais `status='active'` — un candidate résiduel ne casse plus le recall du tour ; l'assert reste en ceinture. Test loader recalé sur le contrat filtre. Résidu d5416413 + 2 candidates alex purgés ; hygiène QA ajoutée aux guidelines.## R1-B06 — Hygiene memorizer : objets rappel persistes en memoire

- Bug id: `R1-B06`
- Tours: post-run (batch memorizer sur les messages du run)
- Famille: `a classifier` (memorizer extraction — filtrage d'objets techniques)
- Domaine owner: memorizer (`_shared/memory/memorizer/extract.ts`, prompt/filtres)
- Source amont: le batch a persiste « Le 13 juillet 2026 à 8h, un rappel était demandé pour préparer le sac de sport » (event, active) et « L'utilisateur veut, de façon durable, un rappel tous les matins à 8h » (statement, candidate) — des objets rappel, alors que le precedent Nina g15-r8 (10/07) validait leur exclusion, et que le second item est contredit par la fin du run (T12 « je veux zéro rappel demain », teletravail). Risque: memoire qui re-injecte des rappels annules/refuses dans les contextes futurs.
- Symptome visible: aucun immediat (pollution memoire latente).
- Preuve systeme: `memory_items 1e89c02d` (event rappel) et `860432f4` (candidate volonte recurrente) crees par le batch 21:26Z (nettoyes en fin de run).
- Correction attendue: regle d'extraction contractuelle « les objets rappel/checkin (demandes, annulations, horaires de rappels) ne sont pas des faits memorisables » — seule la donnee de vie sous-jacente l'est (ex. « travaille a domicile le 13/07 », qui a d'ailleurs ete correctement extraite).
- Tests requis: batch sur conversation riche en rappels => 0 item objet-rappel, faits de vie conserves ; anti-faux-positif : preference durable exprimee hors mecanique rappel => conservee.
- Statut: `fix_applied` (2026-07-13, chantier P2-5b)
- Fix reference: filtre de persistance `reminder_object_state` au write policy (vocabulaire rappel + horaire, ou recouvrement avec une instruction de rappel réelle) + prompt d'extraction renforcé des 2 verbatims du run. Le fait de vie sous-jacent (« travaille à domicile le 13/07 ») passe (anti-FP testé).## Warnings non classes (a suivre, pas de ligne dediee)

- `db_ref.id=None` sur les commits `one_shot_reminder.cancel` (T4, T12) : l'id de la ligne annulee n'est pas trace dans l'entree ledger committed — nit d'observabilite (owner effect ledger writer).
- Incidents d'environnement documentes au rapport (E1 runs concurrents, E2 batch memorizer concurrent pendant la queue du run, E3 residu candidate pre-run) : pas des bugs produit ; E3 est l'origine de R1-B05 cote hygiene.
