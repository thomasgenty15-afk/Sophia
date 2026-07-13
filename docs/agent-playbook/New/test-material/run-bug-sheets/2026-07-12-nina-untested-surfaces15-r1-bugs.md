# Bug Sheet — nina-untested-surfaces15-r1 — 2026-07-12

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-nina-untested-surfaces15-r1.md`

Run rouge. 15 tours, IA réelle locale, `force_full_ai=true`. Objectif : surfaces non couvertes les 10–12/07 (multi-intent, track positif committé, needs_research, récurrent chat, cancel isolé, potion frontale, frontière adjust, statut post-cancel, memorizer+recall, récap groundé).

## R1-B01 — Intention track avalée dans un tour multi-intentions

- Bug id: R1-B01
- Tours: T1
- Famille: BF-AGENDA-01
- Domaine owner: dispatcher V2 / TurnAgenda / lane always-on `track_progress_plan_item`
- Source amont: quand le dispatcher route `product_help`, l'intention de report de progression détectée par le frame (`memory_plan.response_intent = "product_help_question_with_track_progress_note"`) ne produit ni `requested_effect` track (tool_skill_run null) ni restitution visible. Contraste : T6–T7 et T11 montrent que les tool skills tournent bien en parallèle d'autres owners.
- Symptome visible: « ça c'est fait tu peux le noter » (avec preuve) est ignoré en silence ; la réponse ne traite que la question WhatsApp.
- Preuve systeme: trace T1 — `direct_effects_to_run: []`, `tool_skill_run: null`, `user_plan_item_entries = 0` post-tour ; frame ayant explicitement noté la double intention.
- Correction attendue: contrat d'agenda — toute intention d'effet détectée au frame émet soit un effet dans la lane dédiée, soit une ligne de restitution/clarification visible, quel que soit le `response_owner`. Jamais zéro des deux.
- Statut: `fix_applied` (2026-07-13, chantier P2-4, volet prompt)
- Fix reference: règle 3d-quater BI-INTENTION (verbatim T1) : question produit + report explicite avec claim → émettre LES DEUX (signal + effet track), jamais zéro-des-deux — la lane track tourne en parallèle de tout owner (mécanique déjà en place, l'émission manquait).
- Tests requis: positif (bi-intention product_help + track avec preuve → requested_effect track présent) ; paraphrase (bi-intention feature_opportunity + track) ; anti-faux-positif (question produit mentionnant une action sans annonce de complétion → aucun effet track).

## R1-B02 — Question de clarification `needs_clarify` supprimée par le composeur

- Bug id: R1-B02
- Tours: T2 (racine), T3 (conséquence)
- Famille: BF-LEDGER-02
- Domaine owner: companion / final response pipeline (contrat O router→composeur)
- Source amont: le router `track_progress_plan_item` renvoie un outcome `needs_clarify` avec la question contractuelle (« Tu parles de quelle action exactement ? Je pensais à "X"… ») ; la réponse visible la remplace par du jargon sans question (« dans ce fil, elle reste seulement signalée, pas confirmée comme enregistrée »). La boucle 3g (`pending_direct_effect_clarification`) est donc inarmable côté user.
- Symptome visible: refus opaque, aucune question posée, le user ne sait pas quoi répondre pour débloquer.
- Preuve systeme: trace T2 — tool_skill_run `needs_clarify` / `target_not_evidenced` avec reply contractuel côté router ; réponse visible sans `?`.
- Correction attendue: invariant de rendu — un outcome `needs_clarify` d'un tool skill DOIT aboutir à une question visible adressant le slot manquant (reformulation permise, suppression interdite). Même mécanique que la ré-application post-génération des commitments (P1) : vérifier l'état final, pas la consigne.
- Statut: `fix_applied` (2026-07-13, chantier P2-2)
- Fix reference: invariant de rendu structurel `ensureClarifyQuestionVisible` (finalVisibleText, point unique des 4 chemins visibles) : outcome needs_clarify + texte final sans question → la question contractuelle de la lane est ré-injectée (reformuler permis, supprimer interdit). Test run_test.ts (ré-injection + 2 anti-FP).
- Tests requis: contractuel (tout tour avec status `needs_clarify` → réponse contenant une question sur le slot manquant) ; intégration (séquence T2→T3 rejouée : la réponse au tour suivant ré-émet l'effet complet via 3g) ; anti-faux-positif (outcome `logged` → pas de question parasite).

## R1-B03 — Confirmation de la cible nommée par Sophia ne vaut pas evidence (G1)

- Bug id: R1-B03
- Tours: T3 (avec T2)
- Famille: BF-INTAKE-01
- Domaine owner: `tools/always_on/track_progress_plan_item/router.ts` (garde G1 `trackTargetEvidenceVerified`) + dispatcher 3g
- Source amont: la garde G1 exige le nommage verbatim titre/alias par le user, même quand Sophia vient elle-même de nommer la cible au tour précédent et que le user CONFIRME (« Tu parles de "préparer une option saine à portée" » → « bah si je te confirme… à 100%, note-la »). Deux blocages consécutifs `target_not_evidenced` sur un track positif légitime, avec cible et date correctement résolues dans requested_effects.
- Symptome visible: « Tu me donnes bien la cible, et le geste est clair » suivi d'un refus d'écrire ; le user doit citer le titre exact entre guillemets (T4) pour committer.
- Preuve systeme: traces T2/T3 (même reason_code, bonne cible, `date_hint 2026-07-11` extrait), commit T4 immédiat après citation verbatim.
- Correction attendue: au niveau 3g/G1 — pour un track POSITIF, une confirmation affirmative du user portant sur la cible que Sophia a nommée au tour précédent vaut `target_evidence` (explicitness=explicit, target_status=identified, conformément au 3g existant). La rigueur verbatim reste entière pour `missed` (P1-1, nina R1-B04 du 08/07).
- Statut: `fix_applied` (2026-07-13, chantier P2-4b)
- Fix reference: triple couche : (1) G1 assoupli pour le POSITIF — le titre nommé par Sophia dans la fenêtre d'évidence vaut nommage (`allow_window_title_match`, jamais pour missed) ; (2) règle 3d-ter CONFIRMATION + 3g CONFIRMATION PURE (re-émettre depuis les known_slots) ; (3) ré-arm DÉTERMINISTE runtime : confirmation classée (kind=yes) + clarify de cible pendant à slots complets → effet synthétisé depuis les known_slots même sans ré-émission dispatcher ; et une ré-émission vers la cible proposée avec un correction=true parasite est normalisée (résolution ≠ correction). Probe live nina T2-T3 : committé au plus tard à T2, une seule fois — GREEN stabilisé.
- Tests requis: positif (annonce descriptive → Sophia nomme → user confirme → commit) ; anti-faux-positif (confirmation vague sans nommage préalable par Sophia → clarify) ; négatif (même séquence avec `missed` → toujours nommage strict requis).

## R1-B04 — Réponse product_help erronée sur la surface des rappels ponctuels

- Bug id: R1-B04
- Tours: T1 (secondaire)
- Famille: BF-STATUS-01
- Domaine owner: product_help (grounding produit / explain_limit)
- Source amont: le mode `explain_limit` répond « les rappels ponctuels se gèrent dans Dashboard > Initiatives » — faux (les ponctuels se créent/annulent dans le chat, cf. T7/T11 de ce même run ; Initiatives couvre le récurrent) ; et reste évasif sur l'existence du canal WhatsApp alors que le produit le supporte (linking + templates).
- Symptome visible: information produit inexacte et non-réponse à la question posée.
- Preuve systeme: llm op `product_help.visible.explain_limit` au T1 ; contradiction interne au run (T6 renvoie Initiatives pour le récurrent, T7 crée un ponctuel dans le chat).
- Correction attendue: grounding de la surface produit injecté à product_help (matrice canal/surface par type de rappel), pas une phrase corrigée.
- Statut: `fix_applied` (2026-07-13, chantier P2-8)
- Fix reference: matrice canal/surface injectée à la KB rappel ponctuel (création/annulation/statut = CHAT ; gestion visuelle = Dashboard > Initiatives ; récurrent = Initiatives ; WhatsApp délivré si compte lié) + sophia_must_not_claim (« se gèrent dans Initiatives » interdit comme réponse à « où les créer », honnêteté sur le canal WhatsApp).
- Tests requis: positif (« où gère-t-on un rappel ponctuel ? » → chat/Sophia) ; paraphrase WhatsApp (réponse honnête sur le canal + condition de linking) ; anti-faux-positif (question récurrent → Initiatives).

## R1-B05 — Demande frontale de potion non adressée (substitution silencieuse)

- Bug id: R1-B05
- Tours: T8 (récupéré T9)
- Famille: BF-AGENDA-01
- Domaine owner: coaching_recommendation (intake + composeur reco)
- Source amont: le user demande un outil nommé (« tu peux m'activer une potion pour ça ? ») ; la reco substitue une carte de défense sans accuser réception de la potion ni motiver la différence (doctrine cartes : garder un doute, expliquer, proposer les options proches). T9 prouve que le skill sait produire l'explication quand le user insiste.
- Symptome visible: question directe ignorée, le user doit re-poser.
- Preuve systeme: T8 response_owner coaching_recommendation, aucun mot sur la potion ; T9 explication complète + honnêteté frontière (pas d'activation depuis le chat).
- Correction attendue: règle de complétude reco — outil demandé ≠ outil recommandé ⇒ la réponse porte les deux (accusé + différence), dès le premier tour.
- Statut: `fix_applied` (2026-07-13, chantier P2-7)
- Fix reference: règle OUTIL DEMANDÉ ≠ OUTIL RECOMMANDÉ (dispatcher local coaching) : accusé de la demande de potion + différence en une phrase + option ouverte, DÈS le premier tour — la substitution silencieuse est l'erreur nommée.
- Tests requis: positif (demande potion → reco carte AVEC explication de l'écart) ; paraphrase (demande carte d'attaque → reco défense) ; anti-faux-positif (demande cohérente → pas de digression comparative).

## R1-B06 — Ambiguïté « fais-moi un truc » non clarifiée + pitch répété

- Bug id: R1-B06
- Tours: T13
- Famille: BF-INTAKE-04
- Domaine owner: coaching_recommendation (intake / gate de confiance) + composeur reco (anti-répétition)
- Source amont: cible non nommée (« un truc pour le week-end », « je dérape ») → la fiche persona exige une clarification avant toute proposition ; la reco part directement, et récite la même structure en 4 temps qu'au T8 (moment critique / piège / geste de retour / plan B). Rejoint le follow-up anti-répétition intra-flow ouvert sur Eva 07-10 T3.
- Symptome visible: réponse plausible mais présomptueuse et mécanique (2e récitation quasi verbatim).
- Preuve systeme: T8 vs T13, structures identiques ; aucun tour de clarification.
- Correction attendue: gate d'ambiguïté intake (cible absente + signal faible → une question de cadrage) + mémoire courte de session côté composeur reco (une technique déjà expliquée se référence, ne se ré-explique pas à l'identique).
- Statut: `fix_applied` (2026-07-13, chantier P2-7)
- Fix reference: GATE D'AMBIGUÏTÉ (cible absente + signal flou → UNE question de cadrage avant toute proposition) + ANTI-RÉCITATION intra-session (une technique déjà expliquée se référence, ne se re-déroule jamais à l'identique).
- Tests requis: positif (« fais-moi un truc pour X flou » → question de cadrage) ; anti-faux-positif (cible claire → reco directe) ; répétition (2e demande même technique → référence courte, pas récitation).

## R1-B07 — Memory items genrés au masculin pour une utilisatrice

- Bug id: R1-B07
- Tours: batch memorizer (post-T14)
- Famille: a classifier (qualité d'extraction memorizer — aucune famille BF-MEMORY ne couvre l'attribution de genre ; BF-MEMORY-01 = persistance, hors sujet)
- Domaine owner: memorizer (`_shared/memory/memorizer/extract.ts`, prompt d'extraction)
- Source amont: les 4 items persistés rédigent Nina au masculin (« Il est allergique aux noix de cajou », « il a préparé 5 petits sachets… ») alors que le profil est féminin. Risque aval : réinjection runtime de formulations mal genrées dans les réponses.
- Symptome visible: aucun in-run (le recall T15 a reformulé en 2e personne), mais contenu DB faux.
- Preuve systeme: `memory_items.content_text` des 4 items du batch `4ae3ecb1` (relevés dans le rapport avant purge).
- Correction attendue: injecter le genre/profil du user dans le prompt d'extraction OU imposer un style neutre (2e personne / prénom) dans le contrat de rédaction des items.
- Statut: `fix_applied` (2026-07-13, chantier P2-5c)
- Fix reference: `user_profile` (prénom/genre depuis profiles) injecté au payload d'extraction + règle GENRE ET STYLE DE RÉDACTION (jamais de masculin par défaut ; sans genre → style neutre). Plombé dans trigger-memorizer-daily.
- Tests requis: positif (persona féminine → items au bon genre ou style neutre) ; paraphrase (persona masculine) ; test de non-régression sur le format canonical_key/embedding.

## Incidents environnement (hors produit)

- **E1 — batch memorizer externe mid-run** : deux exécutions `trigger-memorizer-daily` `hours=30` non initiées par le run (21:25:14 et 21:28:53 UTC). Le cron local est quotidien (`0 0 * * *`) → appelant inconnu à auditer (candidats : `trigger-synthesizer-batch` toutes les 10 min, autre process local). 3e occurrence de la famille « batch concurrent » (Eva global15 r1, Rose multiflow 07-12 E1). Action : identifier l'appelant et sérialiser les batchs memorizer hors runs QA.

## Notes de couverture

- Sous-système rappel one-shot (create/cancel/statut hors flow) : VERT sur ce run — pas de reproduction de BF-EFFECT-02/BF-LEDGER-01 sur ces chemins.
- `needs_research` : consommé pour la première fois depuis le recâblage V4 sur un run persona (grounding Gemini réel tracé).
- Frontières produit honnêtes partout (récurrent→Initiatives, potion/carte→Ressources, plan→Ajuster mon plan) : aucune écriture sauvage.
- Recall mémoire validé seulement intra-session — un test cross-session (nouvelle conversation après purge de l'historique chat, memory_items conservés) reste à faire.
