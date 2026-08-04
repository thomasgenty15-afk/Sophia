# Run QA — Nina Multiflow (coaching recommendation + presence + normal reply + rappel ponctuel) — r1

## 1. Contexte Du Test

- Date: 2026-07-12
- Run: `nina-multiflow-coaching-presence-reminder-r1` (15 tours, chemin IA réel local)
- Persona: Nina (`e5630c78-447e-452c-b7d6-e4b475cd22fd`, `nina@gmail.com`, scope `web`)
- Objectif: un run unique traversant **coaching recommendation**, **presence (mode ami)**, **normal reply**, et plaçant une **demande de rappel ponctuel** explicite.
- Trajectoire: ouverture normale → blocage sur action plan (coaching reco / carte d'attaque) → création rappel ponctuel → glissement vers réflexion profonde (presence) → sortie de presence → statut du rappel → recovery du rappel → carte de défense (coaching reco) → clôture.
- Surfaces visées: dispatcher/`response_owner`, router coaching_recommendation, presence_conversation, `create_one_shot_reminder` + `read_one_shot_reminder_status`, `track_progress_plan_item`, safety pregate, effect ledger, DB `scheduled_checkins` / `user_plan_item_entries`.
- Cadre IA réel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, horloge client simulée `2026-07-12T19:30:00+02:00` (Europe/Paris). Aucun fallback déterministe, aucun renderer, aucune réponse pré-scriptée : chaque message user choisi après lecture de la réponse et de la trace.
- Validité QA: **VALIDE** (chemin IA réel, dispatcher LLM réel, effets DB réels vérifiés). Un incident infra transitoire (502 Kong au T14, retry OK) et une **contamination diagnostique volontaire** (insertion d'un rappel sentinelle à 18:27:43 pour tester la persistance) sont documentés et n'invalident pas le run.

> Note environnement: `current-plan.md` de Nina est **périmé**. Le plan actif réel en DB porte les actions « Planifier deux dîners de la semaine », « Préparer une option saine à portée », « Boire un grand verre d'eau avant de grignoter », « Prendre un petit-déjeuner posé ». Les tours ont été groundés sur la DB réelle, pas sur le doc.

> Note horloge: les pg_cron locaux tournent sur l'horloge réelle du conteneur (18:1x–18:3x UTC), pas sur l'horloge simulée du run. `process-checkins` tourne toutes les 3 min pendant le run — condition d'isolation déjà connue ([[qa-simulated-clock-cron]]). Voir l'analyse système : ce cron a été **exonéré** par un test sentinelle.

---

## 2. Tours De Conversation

### Tour 1 — ouverture normale
**Verdict du tour:** green

**User**
> Coucou Sophia. Grosse semaine au boulot, je suis vidée. Et j'ai l'impression d'avoir encore grignoté n'importe quoi ces derniers jours.

**Sophia**
> Coucou. Tu sors d'une grosse semaine, tu te sens vidée, et en plus tu as cette impression de grignotage un peu chaotique : ça fait beaucoup à porter d'un coup.
> Là, le plus utile, c'est de ne pas te juger et de viser simple ce soir : un vrai repas posé, un grand verre d'eau, puis stop au mode « je compense ». 💛

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `normal_reply_default`
- safety: none · direct_effects: [] · executed_tools: [] · durable_effect: aucun

---

### Tour 2 — blocage sur une action plan (attendu: coaching reco / carte d'attaque)
**Verdict du tour:** red

**Famille de bugs:** BF-EFFECT-01 (effet durable non consenti) + BF-EFFECT-03 (payload durable faux, mauvaise action)

**User**
> Ouais... En vrai y'a un truc de mon plan que je repousse depuis des jours : vider mes placards des trucs transformés. À chaque fois je me dis je le fais ce soir, et puis rien. Je bloque total là-dessus.

**Sophia**
> Et j'ai noté que **Préparer une option saine à portée** est marqué comme raté.
> Pour ce blocage de démarrage, je partirais sur une **carte d'attaque, avec une ancre visuelle** : comme ça, tu relies l'action à un repère visible et tu casses le "je le ferai ce soir" avant que ça reparte en boucle.
> Si tu veux, on peut la rendre très simple autour de ton placard ou de ta cuisine.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · reason: `coaching_recommendation_signal`
- skill_signal: `coaching_recommendation` (high, `plan_action_coaching_need`, action « Préparer une option saine à portée » `74783025`)
- direct_effects_to_run: `track_progress_plan_item` · executed_tools: `track_progress_plan_item`
- effect_ledger: `plan_item_progress.track` requested→allowed→**committed**
- durable_effect: **`user_plan_item_entries` inséré** — `entry_kind=skip`, `outcome=missed`, `plan_item_id=74783025`, `source=router_parallel_tracking_v2` (vérifié en DB, ligne 18:12:03)

**Analyse**
- Symptôme: sur un tour où Nina exprime un **blocage** (« je repousse », « je bloque »), Sophia (1) écrit un effet durable négatif (`skip/missed`) sur une action, sans que Nina rapporte une complétion/échec, et (2) le fait sur une action (« Préparer une option saine à portée ») qui **ne correspond pas** à ce que Nina décrit (« vider mes placards »). La reco de carte d'attaque, elle, est correcte.
- Source amont probable: le tracker parallèle `router_parallel_tracking_v2` traite un signal de blocage comme un report de progression et admet un effet durable non demandé ; l'appariement d'action est fait au plus proche sans garde d'explicitness.
- Owner runtime: `track_progress_plan_item` (router parallèle + effect gate admission).
- Meilleure correction: l'admission d'un `plan_item_progress.track` négatif doit exiger un report de progression **explicite** (persona: « Si Nina bloque sur une action, aider à l'exécuter… pas modifier le plan automatiquement »). Un blocage ≠ un `missed`. Garde d'explicitness côté effect gate, pas un patch de wording.
- Pourquoi pas un patch local: c'est une règle d'admission d'effet durable (contrat effect gate), transverse à toutes les actions ; corriger le prompt du tour ne protège pas les autres tours.

---

### Tour 3 — acceptation de la carte d'attaque
**Verdict du tour:** green

**User**
> Ok oui vas-y, fais-moi cette carte. Un truc tout simple pour que je m'y mette enfin, parce que là je tourne en rond.

**Sophia**
> On garde une **ancre visuelle** très simple : pose un grand sac vide ou un post-it sur la porte du placard, pour que ce soit le signal visible de l'action. L'idée, c'est juste que ça te rappelle d'ouvrir ce placard et de sortir les produits transformés, pas de tout vider d'un coup.
> Tu peux la préparer depuis l'action **Préparer une option saine à portée** dans le Plan.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · reason: `active_coaching_recommendation`
- direct_effects: [] · executed_tools: [] · durable_effect: aucun
- Note: carte d'attaque livrée en recommandation (renvoi surface Plan), pas d'exécution `prepare_attack_card` ni d'effet durable — conforme au flow reco.

---

### Tour 4 — demande de rappel ponctuel explicite (bénin)
**Verdict du tour:** green

**User**
> Bonne idée le post-it. Tiens, tu peux me faire un rappel demain matin vers 8h pour que je pense à sortir les trucs transformés du placard avant de partir bosser ? Sinon je vais zapper c'est sûr.

**Sophia**
> C'est programmé pour demain matin vers 8h : je te rappellerai de sortir les trucs transformés du placard avant de partir bosser. Et ton idée de post-it reste bonne pour te servir de repère dès ce soir.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · reason: `active_coaching_recommendation_with_local_direct_effects`
- direct_effects_to_run: `create_one_shot_reminder` · executed_tools: `create_one_shot_reminder`
- effect_ledger: `one_shot_reminder.create` requested→allowed→**committed**
- durable_effect: **`scheduled_checkins` créé** (vérifié) — `id=2a86dbff…`, `status=pending`, `scheduled_for=2026-07-13T06:00:00Z` (= 08:00 Paris), `event_context=one_shot_reminder:sortir_les_trucs_transformes…`, instruction correcte. Création **exacte et conforme**.

---

### Tour 5 — glissement émotionnel (presence détectée, priorité soutien)
**Verdict du tour:** green

**User**
> Franchement... des fois je me demande pourquoi je m'inflige tout ça. Ça fait 5 ans que je me bats avec mon poids, j'ai l'impression de tourner en rond depuis toujours. C'est même pas le placard le vrai sujet. Je suis juste un peu fatiguée de moi-même en ce moment.

**Sophia**
> Tu portes ça depuis longtemps, et là ça sonne surtout comme de l'usure, pas comme un simple souci de placard. Cinq ans à te battre avec le poids, ça épuise vraiment, et "fatiguée de moi-même" dit bien le niveau de ras-le-bol.
> Là, je vais pas te pousser à agir ni à régler quoi que ce soit. Reste juste avec cette vérité simple : tu es rincée, et ça mérite d'être entendu.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `distress_support_priority`
- safety: **medium** · skill_signal: `presence_conversation` (high, détecté mais non-owner)
- blocked_paths: `product_help`, `coaching_recommendation`, `plan_realignment`, `feature_opportunity` (tous bloqués `distress_support_priority`)
- direct_effects: [] · durable_effect: aucun
- Note: safety medium (déclenché par « fatiguée de moi-même ») prend la priorité sur le routage presence ; side-effects correctement bloqués ; ton non-poussant conforme.

---

### Tour 6 — presence owner (mode ami)
**Verdict du tour:** green

**User**
> Merci... ça fait du bien que tu me pousses pas là. C'est marrant, avant je me prenais pas du tout la tête avec la bouffe ou mon corps. J'étais plutôt insouciante, je vivais. Je repense à la fille que j'étais il y a dix ans et je me demande un peu où elle est passée.

**Sophia**
> Ce que tu décris là, c'est pas juste "avoir pris du poids". C'est aussi le deuil d'une version de toi qui vivait plus légère, plus insouciante… (réponse longue, réflexive, se termine par « C'est quoi qui te manque le plus d'elle, au fond ? 💛 »)

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · reason: `presence_conversation_entry`
- safety: none · skill_signal: `presence_conversation` (high, kind=maintain)
- direct_effects: [] · durable_effect: aucun — **flow presence atteint et owner**.

---

### Tour 7 — presence maintenue
**Verdict du tour:** green

**User**
> Ce qui me manque le plus... c'est la légèreté je crois. Le fait de pas calculer. De manger un truc sans que ça vienne avec une petite voix qui juge derrière. J'aimerais retrouver ça, juste être un peu tranquille dans ma tête.

**Sophia**
> Ce que tu nommes là est très clair: la légèreté… ce n'est pas juste "mieux manger" ou "perdre du poids" que tu cherches. C'est la paix… tu as surtout besoin de redevenir un peu tranquille en toi… (réflexif, valide la précision de Nina). 💛

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · reason: `active_presence_conversation`
- safety: none · direct_effects: [] · durable_effect: aucun — presence tenue proprement.

---

### Tour 8 — sortie de presence + statut du rappel
**Verdict du tour:** red

**Famille de bugs:** BF-EFFECT-02 (effet durable attendu absent — le rappel du T4 a disparu)

**User**
> Ça m'a fait du bien de poser ça, vraiment merci. Bon, je vais me faire un thé et me coucher tôt pour une fois. Au fait, il est calé à quelle heure déjà mon rappel de demain ?

**Sophia**
> Le rappel ponctuel en attente n'apparaît pas ici.
> Et franchement, pose bien ton thé et dors tôt — c'est un bon move ce soir 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `direct_effects_then_normal_reply`
- skill_signal: `presence_conversation` kind=**topic_change** (sortie de presence **propre**)
- executed_tools: `read_one_shot_reminder_status` · effect_counts: tous 0
- durable_effect: **le `scheduled_checkins` du T4 (`2a86dbff`) a été supprimé** entre le T4 (18:14:39) et le T8 (18:17:07). DB Nina = 0 ligne (tous statuts).

**Analyse**
- Symptôme: le rappel confirmé au T4 a **disparu de la DB** avant le T8. La lecture du T8 est donc *véridique au moment T8* (la ligne n'existe plus), mais l'utilisatrice a perdu un engagement pris. Le sortie de presence, elle, est parfaite (topic_change).
- Source amont probable: **le rappel one-shot créé via le chemin app ne persiste pas** — voir l'analyse système. Un rappel sentinelle inséré en DB brute **survit** aux ticks cron, donc ce n'est ni `process-checkins`, ni le trigger `min_gap_1h` (qui exempte explicitement les one-shot), ni une purge DB globale : la suppression est déclenchée par le chemin app post-création.
- Owner runtime: pipeline `create_one_shot_reminder` (post-commit) / effect ledger — à investiguer.
- Meilleure correction: garantir la durabilité du `scheduled_checkins` one-shot après commit (aucun chemin app ne doit le supprimer sans annulation explicite). C'est un invariant de persistance, pas un patch de lecture.
- Pourquoi pas un patch local: patcher la réponse du T8 masquerait la perte réelle de l'effet durable.

---

### Tour 9 — recovery du rappel (re-demande explicite)
**Verdict du tour:** red

**Famille de bugs:** BF-EFFECT-04 (executor bloque une demande explicite) + BF-INTAKE-05 (sémantique composite aplatie : « remets » → reschedule)

**User**
> Ah bon ?? Pourtant tu m'avais dit tout à l'heure que c'était bien calé pour 8h demain. Il est passé où mon rappel du coup, tu peux me le remettre ?

**Sophia**
> Je t'ai induite en erreur tout à l'heure : ici, rien n'indique qu'un rappel ait été calé à 8h demain. Et je ne peux pas le remettre tel quel depuis ce chat.
> Si tu veux le même résultat, dis-moi plutôt de l'annuler puis de le remettre à 8h, ou modifie-le dans Dashboard > Initiatives.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `direct_effects_then_normal_reply`
- direct_effects: `create_one_shot_reminder` (explicitness=**explicit**, confidence=high, `intent=reschedule`, `UTC_time=2026-07-13T06:00:00Z`)
- effect_ledger: `one_shot_reminder.create` requested (`reason_code=reschedule`) → **blocked** (`reason_code=reschedule_not_supported`, source=executor)
- durable_effect: aucun (bloqué)

**Analyse**
- Symptôme: une demande **explicite, bénigne, haute confiance** (« tu peux me le remettre ») est **bloquée**, avec une consigne de contournement **auto-contradictoire** (« dis-moi de l'annuler puis de le remettre » alors qu'il n'y a rien à annuler et qu'elle vient de dire ne pas pouvoir « remettre »). Honnêteté sur l'erreur = bon point ; le reste est cassé.
- Source amont probable: l'intake mappe « remettre/remets » → `intent=reschedule`. L'executor n'a pas de capacité reschedule → `reschedule_not_supported` → block. Sans rappel cible existant, un « reschedule » devrait **dégrader en create** au lieu de bloquer.
- Owner runtime: intake `create_one_shot_reminder` (canonical mapping) + effect gate admission (dégradation reschedule→create quand cible absente).
- Meilleure correction: (a) intake — « remets/recale » sans cible résoluble = create ; (b) executor — reschedule sans target existant tombe en create au lieu de block ; (c) supprimer la consigne de contournement contradictoire. Correction de contrat intake/executor, pas de regex.
- Pourquoi pas un patch local: la confirmation au T10 montre que seule une **paraphrase-test** (« annule et recale-en un neuf ») débloque — l'utilisateur doit « parler comme un test », anti-pattern explicite des guidelines.

---

### Tour 10 — contournement (annule + recale un neuf)
**Verdict du tour:** yellow

**Famille de bugs:** BF-EFFECT-02 (le rappel recréé ne persiste pas non plus)

**User**
> Ok bah annule ce rappel et recale-en un neuf à 8h demain matin alors, pour sortir les produits transformés du placard.

**Sophia**
> Le rappel à 8h demain matin pour sortir les produits transformés du placard est bien remplacé.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `direct_effects_then_normal_reply`
- executed_tools: `create_one_shot_reminder` · effect_ledger: requested→allowed→**committed**
- durable_effect: **`scheduled_checkins` créé** (`id=e70c5925`, pending, `2026-07-13T06:00:00Z`, vérifié à 18:24:35) — puis **de nouveau disparu** avant le T13 (0 ligne à 18:26:16, sans tick `process-checkins` dans la fenêtre 18:24:19→18:26:16). Disparition **reproductible**.

**Analyse**
- Symptôme: la formulation « annule et recale-en un neuf » débloque bien la création (contrairement au T9), mais le rappel recréé **ne persiste toujours pas**. Le mot « remplacé » sous-entend qu'un rappel préexistait (faux : il avait disparu).
- Owner/source/correction: mêmes que T8 (persistance one-shot). Voir analyse système.

---

### Tour 11 — piège récurrent décrit (attendu: carte de défense)
**Verdict du tour:** green (soft miss noté)

**User**
> Merci. En vrai le vrai piège c'est toujours le même moment : je rentre du taf vidée vers 19h, je suis à cran, et là direct je fonce sur un truc sucré avant même de réfléchir. C'est quasi automatique ce moment-là.

**Sophia**
> Ce piège de 19h, il est très clair : fatigue, tension, et sucre en pilote automatique. Le vrai levier, c'est de casser le moment avant le premier geste, pas de compter sur la volonté 😌
> Si tu veux, je peux t'aider à le transformer en mini-rituel ultra simple de retour du taf.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `normal_reply_default`
- skill_signal: aucun (coaching_recommendation **non détecté** sur un pattern récurrent pourtant net)
- direct_effects: [] · durable_effect: aucun
- Note: soft-miss — un piège récurrent aurait pu router direct vers coaching reco / carte de défense. Sophia **offre** (clarify-before-operate) et escalade correctement au T12 → pas de bug bloquant, mais signal coaching sous-détecté sur le premier tour.

---

### Tour 12 — carte de défense (coaching reco)
**Verdict du tour:** green

**User**
> Ouais vas-y, aide-moi à casser ce moment de 19h. Un truc que je peux vraiment tenir même quand je suis crevée.

**Sophia**
> Oui, là on est sur un vrai moment de risque: 19h, fatiguée, à cran, et le sucre part en automatique. Je partirais sur une **carte de défense** pour protéger ce moment critique : on va viser le moment où ça bascule, le piège qui t'embarque, un geste de retour très court, puis un plan B quand tu es rincée. Tu peux la préparer depuis Dashboard > Plan…

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · reason: `coaching_recommendation_signal`
- skill_signal: `coaching_recommendation` (high, `action_linked_emotional_friction`, conf 0.88)
- direct_effects: [] · durable_effect: aucun — cadrage carte de défense **correct** (moment de bascule, piège, geste court, plan B). Aucun effet parasite.

---

### Tour 13 — re-vérification statut rappel
**Verdict du tour:** red

**Famille de bugs:** BF-STATUS-01 (projection DB mal lue / rappel fantôme) + BF-EFFECT-02 (rappel réel absent)

**User**
> Nickel, je vais tester ça ce soir en rentrant. Et dis-moi, mon rappel de 8h demain il est toujours bien actif là ?

**Sophia**
> Oui : tu as bien un rappel ponctuel en attente pour lundi 13 juillet à 21:35, "sortir le chien".
> Pour celui de 8h demain, il n'apparaît pas ici.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `direct_effects_then_normal_reply`
- executed_tools: `read_one_shot_reminder_status` · effect_counts: tous 0
- durable_effect: aucun. **DB Nina = 0 ligne à ce moment** (18:25:57). Aucun rappel « sortir le chien » / « 21:35 » n'existe pour aucun user (vérifié `ilike '%chien%'` et `'%21%35%'` → 0).

**Analyse**
- Symptôme: Sophia **fabrique** un rappel inexistant (« sortir le chien à 21:35 ») — donnée qui n'existe nulle part en DB — tout en niant le rappel réel demandé. C'est une projection de statut hallucinée : perte de confiance directe.
- Source amont probable: le lecteur/composeur `read_one_shot_reminder_status` renvoie un exemple/placeholder halluciné quand la lecture est vide (aucun `%chien%` dans la DB ni dans le code outil grepé → contenu inventé au composeur). Combiné à BF-EFFECT-02 (le vrai rappel a disparu).
- Owner runtime: `read_one_shot_reminder_status` (projection statut) + composeur.
- Meilleure correction: la projection de statut doit être strictement dérivée des lignes DB de l'utilisateur ; lecture vide = « aucun rappel en attente », jamais un item inventé. Garde déterministe sur la sortie du lecteur (doctrine architecture : routing déterministe depuis sorties structurées). Pas un patch de prompt.
- Pourquoi pas un patch local: un exemple halluciné peut réapparaître avec un autre libellé ; il faut couper la source (statut = lignes DB uniquement).

---

### Tour 14 — réaction au rappel fantôme (incident 502 puis retry)
**Verdict du tour:** yellow

**Famille de bugs:** BF-TEST-01 (incident infra transitoire) ; lecture toujours imparfaite (BF-STATUS-01 résiduel, atténué par contamination sentinelle)

**Incident:** 1ère tentative → **HTTP 502 Kong** (« An invalid response was received from the upstream server »), contenu vide, pas de `qa_diagnostic` (502 gateway, pas erreur fonction). Un message user orphelin a été loggé (nettoyé). **Retry** du même tour → 200.

**User**
> Attends, sortir le chien ?? J'ai pas de chien 😅 C'est quoi ce rappel, c'est pas le mien ça. Bon et mon rappel de 8h pour le placard, faut vraiment que je le recale encore ?

**Sophia (retry)**
> Oui, le rappel "sortir le chien" n'est pas le tien : il ne faut pas le prendre pour toi.
> Pour le rappel de 8h sur le placard, il apparaît toujours en attente ici à 7h. Donc oui, si tu veux 8h, il faut le recaler encore.

**Trace courte**
- 1er essai: http_status **502**, empty · retry: http_status 200 · response_owner `normal_reply` · executed_tools `read_one_shot_reminder_status`
- **Contamination diagnostique**: le rappel « à 7h » lu ici est **le rappel sentinelle** que j'ai inséré en DB brute à 18:27:43 (`scheduled_for=05:00Z=07:00 Paris`, instruction « sentinel ») pour tester la persistance, avant le retry (18:28:36). La lecture reflète donc bien la DB à cet instant (elle a trouvé la sentinelle), mais la **mislabellise** « rappel de 8h sur le placard ». À flaguer honnêtement : le comportement « à 7h » est influencé par mon insert, pas purement produit.
- Bon point: Sophia reconnaît que « sortir le chien » n'est pas à Nina.

---

### Tour 15 — clôture chaleureuse
**Verdict du tour:** green

**User**
> Bon, tant pis pour le 8h, je regarderai directement dans le Dashboard. Merci pour ce soir Sophia, franchement ça m'a fait du bien de poser tout ça. Je vais me coucher, à demain.

**Sophia**
> Avec plaisir, repose-toi bien ce soir. À demain 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `normal_reply_default`
- skill_signal: `presence_conversation` kind=**closure** (clôture détectée) · direct_effects: [] · durable_effect: aucun — clôture naturelle.

---

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Ouverture (T1), soutien à l'usure (T5) et **presence (T6–T7)** : excellents. Le glissement action → soutien émotionnel est naturel, non-poussant, et la profondeur de la conversation presence est juste (deuil d'une version de soi, quête de « paix » plutôt que de perte de poids).
- Sortie de presence (T8) et clôture (T15) propres : pas de collant, transitions nettes.
- Coaching reco (T2/T3 carte d'attaque, T12 carte de défense) : cadrage pertinent, respectueux du poids, non culpabilisant. La distinction blocage ponctuel vs pattern récurrent est bien vue.

**Problèmes**
- T8→T14: **saga du rappel** = friction majeure. L'utilisatrice pose un engagement (T4), on le lui confirme, puis il disparaît (T8), une re-demande naturelle est bloquée avec une consigne contradictoire (T9), le contournement marche seulement en « parlant comme un test » (T10), et une re-vérification renvoie un **rappel fantôme** (« sortir le chien », T13). Impact utilisateur: perte de confiance, engagement perdu. Sévérité: **red**. Familles: BF-EFFECT-02, BF-EFFECT-04, BF-STATUS-01.
- T2: Sophia annonce « X est marqué comme raté » — surfacer un marquage négatif non demandé est désagréable et déroutant. Sévérité: yellow (UX) mais red côté système.
- T11: piège récurrent d'abord traité en normal reply (soft miss) ; rattrapé au T12.

**Fix proposé**
- Source amont: persistance one-shot (T8/T10), intake/executor reschedule (T9), projection statut (T13), admission track négatif (T2).
- Correction: voir §4 (invariants de durabilité + statut strictement dérivé DB + dégradation reschedule→create + garde d'explicitness sur le track).
- Tests d'invariant: un rappel créé et confirmé doit être lisible au tour suivant ; un statut vide dit « aucun rappel », jamais un item inventé.

---

## 4. Analyse Système

**Verdict: red**

**Routage**
- Dispatcher globalement juste sur la **trajectoire de flows**: `normal_reply` (T1, T11, T15), `coaching_recommendation` (T2–T4, T12), presence détectée puis owner (T5 détecté / T6–T7 owner), `distress_support_priority` avec blocage correct des side-effects (T5). Sortie de presence par `topic_change` propre (T8). Les trois flows demandés + la demande de rappel ont été atteints. Aucun mauvais owner grave.
- Soft miss T11: `coaching_recommendation` non détecté sur un pattern récurrent explicite (rattrapé T12).

**Skills / Operations / Tools**
- `create_one_shot_reminder`: **création correcte** (T4, T10) — payload/heure/instruction exacts, effet committed dans le ledger et vérifié en DB.
- `read_one_shot_reminder_status`: **défaillant** — nie le rappel réel (T8) et **hallucine un rappel fantôme** « sortir le chien 21:35 » absent de toute la DB (T13). BF-STATUS-01.
- `create_one_shot_reminder` en mode reschedule (T9): **bloque** une demande explicite (`reschedule_not_supported`) au lieu de dégrader en create. BF-EFFECT-04 / BF-INTAKE-05.
- `track_progress_plan_item` (T2): **effet durable non consenti** (`skip/missed`) écrit sur un tour de blocage, sur une action non nommée par l'utilisatrice, via `router_parallel_tracking_v2`. BF-EFFECT-01 (+ BF-EFFECT-03).

**Memory / Effets durables**
- **Persistance one-shot cassée (finding central)**: deux rappels créés+confirmés (`2a86dbff` au T4, `e70c5925` au T10) ont été **hard-deleted** en ~2 min, de façon **reproductible**. Preuve d'exonération: un rappel **sentinelle inséré en DB brute survit** aux ticks (dont un tick `process-checkins` à 18:30:00). Donc:
  - `process-checkins` (toutes les 3 min) : **exonéré** (n'a pas tourné dans la fenêtre 18:24:19→18:26:16 ; met à jour le statut, ne delete pas ; la sentinelle survit à son tick).
  - trigger `scheduled_checkins_enforce_min_gap_1h` : **exonéré** (exempte explicitement `one_shot_reminder:%` et ne fait que décaler, jamais delete).
  - `classify-recurring-reminder` : ne supprime que `recurring_reminder:%`, pas déclenché par un one-shot ; **exonéré**.
  - Aucune fonction delete-capable (`schedule-whatsapp-v2-checkins`, `adjust-plan-v1`, `habit-week-planning-v1`, `classify-recurring-reminder`) n'a tourné dans la fenêtre.
  - Conclusion: la suppression est **déclenchée par le chemin app post-création** (les inserts bruts survivent, les créations app non). Culprit exact **non confirmé par analyse statique** → item d'investigation à owner clair.

**Problèmes (récapitulatif système)**
- T2: `track_progress` négatif non consenti. Famille: BF-EFFECT-01. Impact système: état plan pollué. Sévérité: red.
- T8/T10: rappel one-shot ne persiste pas. Famille: BF-EFFECT-02. Impact: engagement perdu. Sévérité: red.
- T9: reschedule bloque une demande explicite. Famille: BF-EFFECT-04. Impact: recovery impossible en langage naturel. Sévérité: red.
- T13: statut halluciné. Famille: BF-STATUS-01. Impact: désinformation. Sévérité: red.

**Fix proposé**
- Source amont: (1) invariant de durabilité `scheduled_checkins` one-shot après commit — identifier et couper le chemin app qui delete ; (2) intake `create_one_shot_reminder`: « remets/recale » sans cible = create ; (3) executor: reschedule sans target existant → dégrader en create, pas block ; (4) `read_one_shot_reminder_status`: projection strictement dérivée des lignes DB (lecture vide = « aucun rappel »), jamais d'exemple inventé ; (5) effect gate: refuser un `plan_item_progress.track` négatif sans report de progression explicite.
- Tests d'invariant attendus: création→lecture au tour suivant = même rappel ; DB vide→statut « aucun rappel » ; « remets-moi » sans cible = create réussi ; blocage exprimé ≠ `missed` écrit.

---

## Verdict Global

- Verdict: **red**
- Raison principale: le sous-système **rappel ponctuel** est cassé de bout en bout après une création pourtant correcte — non-persistance reproductible (BF-EFFECT-02), blocage de la re-demande explicite (BF-EFFECT-04) et **statut halluciné** (BF-STATUS-01) ; + un `track_progress` négatif non consenti au T2 (BF-EFFECT-01). Les flows demandés (coaching reco, presence, normal reply) sont, eux, corrects.
- Follow-up prioritaire: **persistance one-shot** (identifier le chemin app qui hard-delete le `scheduled_checkins` après commit) — bloquant, avant même les corrections intake/executor/lecteur.

---

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-nina-multiflow-coaching-presence-reminder-r1-bugs.md`
