# QA Run — Alex — untested20 r1 (draft rappel, track composite plage de dates, multi-intent double effet, billing, capacité impossible, presence approfondie — surfaces jamais testées, mode difficile)

## 1. Contexte Du Test

- Date: 2026-07-13 (horloge client simulée 18:00 → 18:56 Europe/Paris, +4 min/tour ; horloge serveur réelle ~15:33 → 16:10 UTC = 17:33 → 18:10 Paris → simulée toujours ≥ réel : pas d'artefact cron, fraîcheur intacte)
- Run: `alex-untested20-r1` (scénario 20.1 — nouvel objectif QA), scope DB dédié `qa-alex-untested17-2026-07-13-r1`
- Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`, `alex12@gmail.com`), connexion locale `tests/real-personas/alex/connection.json`. Plan actif réel (grounding DB) `f771a486` « Retrouver un sommeil réparateur » : habit « Carnet de décharge avant le lit » (`cb91224c`, 7/sem, `current_reps=2`), habit « Couper les écrans 30 min avant le lit » (`7df6d84d`, 4/sem, `current_reps=3`, in_maintenance), task « Préparer un sas de coucher » (`853f4649`), task « Noter l'heure de coucher réelle » (`d8c2c86d`). Série récurrente potion préexistante `1f05be22` (active) — préservée.
- Objectif: run 15 tours **mode difficile** ciblant les surfaces **jamais couvertes pour Alex** dans la fenêtre 10-13/07 (audit des 17 rapports 10-13/07) et **faisables via le chemin web réel**. Le flow daily/weekly (le plus gros angle mort fleet-wide) a été **écarté** : Alex n'a aucun setup WhatsApp (`phone_number=null`, `whatsapp_opted_in=false`, 0 pending) et la fiche 12-daily-weekly réserve ce flow à Paul/Rose ; le forcer aurait exigé de fabriquer numéro/opt-in/occurrences (interdit par la règle anti-hardcoding). Surfaces retenues :
  1. **Brouillon de rappel** (« montre-le-moi avant de le poser, je valide ») — jamais testé sur Alex ;
  2. **track composite plage de dates** (3 occurrences en un tour) — jamais testé sur Alex ;
  3. **multi-intent double effet durable** track+rappel dans un tour — le RED récurrent fleet (Eva global18 T9), jamais sur Alex ;
  4. **product_help abonnement/facturation** — jamais sur Alex ;
  5. **feature_opportunity sur capacité inexistante** — jamais sur Alex ;
  6. **presence mode ami approfondie** (entrée / anti-poussée / recovery / offre sur pull) — seulement effleurée sur Alex ;
  7. **adéquation carte de défense sur vrai moment de craquage** (piège inverse du mot-de-bascule-forcé global19 T5) ;
  8. re-checks des reds P4 landés le 13/07 : **replace atomique** (BF-EFFECT-02, red global19 T12 / alex-untested T6), **cancel+statut**, **comportement cible BF-PREF-01**, **mémoire bout-en-bout**.
- Trajectoire: brouillon rappel (T1) → modif brouillon + confirm = replace (T2) → track composite 3 soirs (T3) → multi-intent track+rappel (T4) → product_help billing (T5) → capacité impossible montre connectée (T6) → dépôt émotionnel → presence (T7) → presence approfondie anti-poussée (T8→T9) → offre sur pull (T10) → carte de défense moment de craquage (T11) → cancel+statut (T12) → intention mémoire (T13) → préférence de ton BF-PREF-01 (T14) → clôture + tenue du style (T15).
- Surfaces visées: dispatcher V2, `create/cancel_one_shot_reminder` (draft/replace/cancel/status + héritage d'ancre), `track_progress_plan_item` (composite multi-date + multi-intent), effect ledger, `product_help` (billing), `feature_opportunity` (capacité + coach_preferences), `presence_conversation` (entrée/collant/anti-poussée/offre sur pull/exit), `coaching_recommendation` (adéquation technique), memorizer nocturne (`trigger-memorizer-daily` scope user), session style commitments (P1).
- Cadre IA réel: local, Supabase local, `POST /functions/v1/test-send-message` avec `force_full_ai=true`, `disable_debounce=true`, `client_now_iso` par tour, `client_timezone=Europe/Paris`. Auth login password local (ANON_KEY réel via `supabase status`, token vérifié via `/auth/v1/user` 200, `x-user-authorization`). JWT jamais affiché. Chaque message choisi après lecture de la réponse et de la trace. Aucun renderer déterministe, aucun fallback `processMessage`.
- Incident d'environnement: au pré-check, faible activité fleet (2 messages d'un autre user, `bfa52a7a`=Eva, sur 10 min) — pas de run concurrent lourd. Parades : scope dédié, memorizer de fin de run **scopé `user_id` Alex** (`hours=1` → batch a vu `message_count=15` = uniquement mon scope), vérifs d'effets par `user_id` après chaque effet. Aucun impact observé sur Alex.
- Validité QA: **valide** — 15/15 tours HTTP 200, aucun vide/abort/timeout, 15 traces persistées, effets durables vérifiés en DB par `user_id` après chaque effet, memorizer déclenché + vérifié bout-en-bout, état remis à la baseline exacte.

## 2. Tours De Conversation

### Tour 1 — brouillon de rappel (« montre-le-moi avant de le poser, je valide ») — jamais testé sur Alex

**Verdict du tour:** yellow

**Famille de bugs:** `BF-INTAKE-03` — contrainte explicite perdue par le dispatcher (l'anti-instruction « montre d'abord, je valide » n'empêche pas le commit immédiat)

**User**
> salut. bon avant que joublie, jaimerais que tu me prépares un rappel pour demain soir 21h30 histoire de sortir mon carnet avant de dormir. mais montre le moi dabord avant de le poser pour de vrai, jveux valider le texte

**Sophia**
> Demain soir 21:30 : « sortir mon carnet avant de dormir ».

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `direct_effects_then_normal_reply`
- memory_plan.response_intent: **`confirm_and_wait_for_validation`** (l'intention de préview est pourtant reconnue)
- tool_skill_run: `create_one_shot_reminder`, status `success`, committed `780c0e9c` (`scheduled_for=2026-07-14T19:30Z` = 21h30 Paris)
- durable_effect: **committé immédiatement** — `pending one-shot=1` (`780c0e9c`) vérifié en DB, alors que le user demandait de valider avant.

**Analyse (yellow)**
- Symptome: le user pose une **anti-instruction explicite** — « montre-le-moi d'abord avant de le poser pour de vrai, je veux valider le texte ». Le dispatcher émet quand même un `create_one_shot_reminder` `explicit/high` qui **committe le rappel** ; le rendu « Demain soir 21:30 : … » est **ambigu** (se lit comme un brouillon présenté, alors que la ligne DB existe déjà). Si le user avait voulu changer/annuler après revue, il y aurait un effet durable non consenti à nettoyer. C'est le pendant « create » de l'anti-instruction non honorée observée pour `track` (alex-untested-surfaces T14, 12/07) : la contrainte est reconnue en intention (`confirm_and_wait_for_validation`) mais pas opposable en émission.
- Source amont probable: dispatcher/TurnFrame — pas de chemin brouillon/preview pour `create_one_shot_reminder` ; l'anti-instruction « ne poste pas encore » n'est pas portée comme contrainte du tour, donc la lane committe.
- Owner runtime: dispatcher (émission de l'effect) + admission `create_one_shot_reminder`.
- Meilleure correction: porter l'anti-instruction « preview/validate first » dans le TurnFrame comme contrainte explicite, et un garde d'admission déterministe : `response_intent=confirm_and_wait_for_validation` ⇒ la lane produit un **brouillon** (pas de ligne pending) + demande de validation, le commit n'a lieu qu'au tour de confirmation. Même philosophie que le blocage side-effects sous safety (garde d'admission, pas prompt).
- Pourquoi ce n'est pas un patch local: le prompt reconnaît déjà l'intention de preview mais ne la fait pas respecter à l'émission ; c'est un garde de contrainte (famille INTAKE-03), pas une phrase.

---

### Tour 2 — modif du « brouillon » + confirmation ⇒ replace atomique (re-check BF-EFFECT-02, red global19 T12)

**Verdict du tour:** green

**User**
> ah ok le texte me va. par contre finalement mets le à 21h00 pile plutôt que 21h30, et là cest bon tu peux le poser pour de vrai

**Sophia**
> C'est fait : ton rappel est posé pour demain à 21:00 — « sortir mon carnet avant de dormir ».

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · memory_plan.response_intent: **`confirm_reminder_replace`**
- direct_effects: **deux effects** `create_one_shot_reminder` + `cancel_one_shot_reminder`, tous deux `success`
- tool_skill_run: committed = cancel de `780c0e9c` (« mardi 14 juillet à 21:30 ») **ET** create `2acdcc82` (`2026-07-14T19:00Z` = 21h00 Paris). `turn_frame.direct_effects.payload_hint.intent="replace"`, `UTC_time` brut = aujourd'hui 19:00Z mais committé sur **demain** → héritage d'ancre appliqué.
- durable_effect: **OK** — DB post-T2 : `2acdcc82 pending` (21h00 demain), `780c0e9c cancelled`. **Exactement 1 rappel actif.**

**Analyse (green — régression positive)**
- Le **replace atomique + héritage d'ancre** fonctionne : le cancel de l'ancien et le create du nouveau sont émis **tous deux** dans le turn_frame, et l'heure nue « 21h00 » hérite du jour « demain » du rappel remplacé. C'est **exactement le chemin qui était RED en global19 T12 et alex-untested-surfaces T6** (frame aplati en cancel-seul, ou create bloqué `past_time`). Le fix P4-B (reclassification replace + héritage de jour) est **confirmé en run réel**. (Note : la mécanique de replace a été déclenchée ici par une modif de « brouillon » que le T1 avait déjà committé — cf. T1 ; l'état net après T2 reste correct = 1 rappel à 21h00.)

---

### Tour 3 — track composite plage de dates (3 soirs en un tour) — jamais testé sur Alex

**Verdict du tour:** red

**Famille de bugs:** `BF-AGENDA-01` — effet composite aplati (multi-cardinalité réduite à 1) ; contributeurs `BF-EFFECT-02` (2 des 3 soirs jamais écrits) et `BF-LEDGER-02` (rendu contredit le commit)

**User**
> et tant quon y est: jai tenu mon carnet de décharge tout le week-end en fait, vendredi samedi ET dimanche soir, les trois. compte les moi dans mon suivi stp

**Sophia**
> Bien joué, trois soirs d'affilée sur le week-end, c'est solide.
> Pour l'instant, dans ton suivi ici, je vois seulement 3/7 pour le carnet de décharge — pas encore les trois soirs de vendredi, samedi et dimanche comptés.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · memory_plan.response_intent: `log_plan_progress`
- tool_skill_run: `track_progress_plan_item`, status `logged`, **un seul effect** : cible `cb91224c` (carnet), `date_hint=2026-07-10` (**vendredi uniquement**), `progress_status=completed`, `value=1`
- turn_frame.direct_effects: **un seul** effect, `target_evidence="vendredi"` — samedi (11/07) et dimanche (12/07) **droppés à l'émission**
- durable_effect: **PARTIEL/FAUX** — DB post-T3 : **1 seule** entrée carnet (`e45787b8`, completed, effective 10/07), `current_reps` 2→3. Les deux autres soirs **jamais écrits**.

**Analyse (red)**
- Symptome: le user rapporte explicitement **trois** occurrences (« vendredi samedi ET dimanche, les trois »). Le système émet **un seul** `track_progress_plan_item` (vendredi 10/07) et **perd durablement** samedi 11/07 et dimanche 12/07. Pire, le rendu est **contradictoire** : il annonce « je vois seulement 3/7 … pas encore les trois soirs comptés » alors qu'il **vient de committer vendredi** (reps 2→3) — il sous-compte de 2 et prétend n'avoir rien enregistré des trois. Le user croit soit tout compté, soit rien ; en réalité un seul est passé, en silence.
- Source amont probable: dispatcher/TurnFrame — une intention de track à **multi-cardinalité** (N dates, N occurrences dans un tour) est aplatie en **un seul** `direct_effect` (la première date). C'est la **même racine architecturale** que les reds « composite bi-partie aplati » (global19 T10 retarget, T12 replace) — mais sur un axe **non couvert par les fix P4** : le P4-A/P4-B ont contractualisé retarget (X→Y) et replace (cancel+create) comme transactions à 2 pattes, **pas** le track multi-occurrence (N pattes homogènes).
- Owner runtime: dispatcher (émission des `direct_effects` d'un track multi-date) + admission `track_progress_plan_item` (fan-out des occurrences).
- Meilleure correction selon les guidelines: contractualiser le track multi-cardinalité comme **fan-out déterministe** — quand un tour porte plusieurs dates/occurrences explicites sur la même cible, émettre **N** `track_progress_plan_item` (un par date résolue) ou un effect `batch` que l'admission déplie en N écritures ; le rendu doit refléter le compte réel committé (jamais « pas encore comptés » sur un commit réussi, famille BF-LEDGER-02). Un garde d'admission déterministe doit refuser un rendu « 0 compté » quand ≥1 écriture a réussi.
- Pourquoi ce n'est pas un patch local: c'est la modélisation composite d'un effet à multi-cardinalité dans le ledger de progression (généralisation du même trou que retarget/replace), pas une formulation.

---

### Tour 4 — multi-intent double effet durable (track + rappel dans un tour) — le RED récurrent fleet, jamais sur Alex

**Verdict du tour:** green

**User**
> ok. deux trucs dun coup: note que jai préparé mon sas de coucher hier soir (ça cest fait), et en meme temps mets moi un rappel demain à 20h45 pour couper les écrans. les deux stp

**Sophia**
> Bien joué, ton sas de coucher est bien noté comme fait hier soir.
>
> Et le rappel de demain à 20:45 pour couper les écrans est posé.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · memory_plan.response_intent: `acknowledge_and_do`
- direct_effects: **deux effects** `create_one_shot_reminder` + `track_progress_plan_item`, tous deux `success` ; turn_frame porte **les deux** effects distincts
- tool_skill_run: track sas `853f4649` completed `date_hint=2026-07-12` (hier=dimanche) ; create écrans `0c21a0ca` (`2026-07-14T18:45Z` = 20h45 demain)
- durable_effect: **OK (les deux)** — DB post-T4 : entrée sas `fbd9fbc3` (completed 12/07) + 2 rappels pending (écrans 20:45 `0c21a0ca`, carnet 21:00 `2acdcc82`).

**Analyse (green)**
- Le multi-intent **cross-lane** (une écriture track + une écriture rappel) émet **deux** `direct_effects` distincts et les committe tous les deux. C'est le cas qui était RED en Eva global18 T9 / global19 T13 : ici il tient. **Contraste net avec le T3** : le double effet **hétérogène** (track + rappel) marche, mais le multi-cardinalité **homogène** (3 tracks) aplatit. Le trou est donc spécifiquement le fan-out d'occurrences dans une même lane, pas le multi-intent en soi.

---

### Tour 5 — product_help abonnement / facturation — jamais sur Alex

**Verdict du tour:** green

**User**
> sinon question pratique rien à voir: jpaye combien pour lappli là exactement? et si je pars en vacances genre 2 semaines cet été je peux mettre mon abonnement en pause ou faut résilier direct?

**Sophia**
> Pour le prix exact, je ne l'ai pas ici : il faut ouvrir **Compte > Gérer mon abonnement** ou la page **Upgrade**, où le détail chiffré s'affiche avant toute confirmation.
>
> Pour la pause de 2 semaines, je n'ai pas d'option de pause confirmée dans ce que je vois ici. Le portail de facturation te dira si elle existe, sinon tu pourras voir les options disponibles comme changer de formule ou résilier.

**Trace courte**
- http_status: 200 · response_owner: `product_help` · reason: `product_help_signal` · skill_run status `complete`
- memory_plan.response_intent: `product_help_pricing_subscription` · direct_effects: [] · durable_effect: aucun (lecture)

**Analyse (green)**
- Réponse **honnête et non hallucinée** : pas de prix inventé (renvoi vers Compte > Gérer mon abonnement / Upgrade où le chiffre s'affiche avant confirmation), pas de fonctionnalité de pause promise (« je n'ai pas d'option de pause confirmée … le portail te dira »). Frontière produit correcte, zéro mutation. Léger watch (non bloquant) : ne peut pas donner le tarif, mais c'est le comportement attendu (billing affiché dans le portail).

---

### Tour 6 — feature_opportunity sur capacité inexistante (montre connectée) — jamais sur Alex

**Verdict du tour:** yellow

**Famille de bugs:** `à classifier` (proche `BF-STATUS-01` — claim de capacité produit non groundé) ; mis-route (normal_reply au lieu de feature_opportunity)

**User**
> en vrai le truc qui maiderait le plus ce serait que tu te connectes direct à ma montre connectée pour compter mes heures de sommeil automatiquement et les rentrer toute seule dans le suivi. tu peux brancher ça?

**Sophia**
> Je ne peux pas me brancher directement à ta montre depuis ici. Par contre, je peux t'aider à voir si l'appli propose une synchro avec Apple Health, Google Fit ou Fitbit, et te dire où regarder dans la plateforme 🔗

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: `normal_reply_default` · memory_plan.response_intent: `product_capability_request`
- direct_effects: [] · durable_effect: aucun.

**Analyse (yellow)**
- Symptome: le refus de la connexion directe est bon et honnête, MAIS la 2e phrase **spécule sur une capacité produit non groundée** (« si l'appli propose une synchro avec Apple Health, Google Fit ou Fitbit ») et envoie le user chercher une intégration dont Sophia n'a aucune confirmation d'existence. Sur une **demande de capacité inexistante**, l'attendu est de router vers `feature_opportunity` (capter la demande honnêtement : « ça n'existe pas encore, je note l'idée ») plutôt que d'inventer des intégrations plausibles depuis `normal_reply`.
- Source amont probable: dispatcher — la demande de capacité produit inexistante n'est pas reconnue comme signal `feature_opportunity` ; le composeur `normal_reply` comble le vide en spéculant des intégrations.
- Owner runtime: dispatcher (routing feature_opportunity) + composeur normal_reply (grounding produit).
- Meilleure correction: router les demandes de capacité produit vers `feature_opportunity` (registre des capacités réelles) pour une réponse groundée — soit « existe, voici où », soit « pas dispo, idée notée » — jamais une spéculation « si l'appli propose… ». Invariant : aucune intégration nommée sans preuve registre.
- Pourquoi ce n'est pas un patch local: c'est un problème de routing + de grounding de capacité (projection produit), pas une phrase.

---

### Tour 7 — dépôt émotionnel → presence (mode ami), jamais approfondie sur Alex

**Verdict du tour:** green

**User**
> bon... franchement là jsuis un peu naze de tout ça pour etre honnete. jai limpression de me battre pour dormir depuis des semaines sans vraiment avancer, et ça déteint sur le reste, le taf, lhumeur. des fois jme demande si ça sert à qqchose tout ce que je fais

**Sophia**
> Ça pèse, et on sent le ras-le-bol derrière le "à quoi bon". Tu t'es quand même accroché à un truc très concret pendant des semaines, mais là l'usure prend le dessus, surtout si ça déborde sur le taf et l'humeur 💛
>
> Je peux juste t'aider à remettre du réel là-dedans : qu'est-ce qui te mine le plus en ce moment, le manque de résultats ou la fatigue de devoir y penser tout le temps ?

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason: **`distress_support_priority`** · memory_plan.response_intent: `supportive_presence`
- direct_effects: [] · durable_effect: aucun.

**Analyse (green)**
- Le pregate détecte la détresse (`distress_support_priority`) et priorise le soutien : ton juste, reflète le ras-le-bol, **anti-poussée** (aucune action forcée), ouvre une question pour approfondir. Le « à quoi bon / si ça sert à quelque chose » (fatigue existentielle bénigne, pas d'idéation) n'est **pas sur-escaladé** en safety — bonne calibration.

---

### Tour 8 — presence approfondie : dépôt vulnérable (« tapis roulant »)

**Verdict du tour:** yellow

**Famille de bugs:** `à classifier` (arbitrage presence/coaching — offre de technique sur dépôt émotionnel sans pull) ; proche `BF-INTAKE-06` (technique proposée hors du besoin du moment)

**User**
> les deux jpense... mais surtout jai limpression que meme quand je fais bien les trucs, au fond ça change rien. comme si jétais sur un tapis roulant, javance jamais vraiment. cest con hein

**Sophia**
> Ça n'a rien de con. Quand tu as l'impression de faire bien les choses sans voir d'effet, ça use et ça finit par vider le sens.
>
> Ici, ce qui colle le mieux, c'est **clarte** : quand l'effort tourne en rond et que tu perds le lien avec le pourquoi. Si tu veux, on peut remettre ça à plat en une phrase très simple.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · reason: `coaching_recommendation_signal` · skill_run status `continue`
- memory_plan.response_intent: **`supportive_emotional_reflection`** (l'intention est pourtant émotionnelle) · direct_effects: [] · durable_effect: aucun.

**Analyse (yellow)**
- Symptome: sur un moment **vulnérable de dépôt** (« tapis roulant, c'est con hein »), sans aucun pull vers une solution, Sophia **pivote en coaching_recommendation** et **propose une technique** (« clarte », « remettre à plat en une phrase »). C'est l'anti-pattern presence : offre d'action pendant un dépôt émotionnel, sans pull. L'intention est pourtant `supportive_emotional_reflection` (bonne lecture), mais l'owner passe en coaching et pousse une carte. Sur un « à quoi bon », un exercice peut faire sentir le user non-entendu.
- Source amont probable: dispatcher/arbitrage — le signal émotionnel réflexif est reclassé en `coaching_recommendation_signal` ; la doctrine presence (anti-poussée structurelle, offre unique **sur pull**) n'est pas prioritaire quand le contenu contient un thème « effort/sens » saisissable par le coaching.
- Owner runtime: dispatcher (arbitrage presence vs coaching) + skill coaching_recommendation.
- Meilleure correction: quand `response_intent=supportive_emotional_reflection` et qu'aucun pull d'action n'est présent, tenir la presence (refléter + rester) et **ne pas** offrir de technique tant que le user ne tire pas. Le doute d'adéquation doit basculer vers « rester » plutôt que « proposer » sur un dépôt.
- Pourquoi ce n'est pas un patch local: c'est l'arbitrage de flow (presence anti-poussée) au dispatcher, pas une phrase — récupéré au T9 mais seulement après refus explicite.

---

### Tour 9 — recovery : refus de l'exercice → retour presence

**Verdict du tour:** green

**User**
> mouais... jsais pas si jai envie de faire un exercice de reformulation là maintenant pour etre honnete. jai juste besoin de souffler un peu jcrois, pas dun truc de plus à faire

**Sophia**
> D'accord, et t'as raison de le dire.
>
> Là, entre la fatigue, l'impression de tourner sur place et le fait de devoir encore "faire un truc", ça peut juste être de trop. Donc non, pas d'exercice. Pas maintenant.
>
> Souffler un peu, ce n'est pas fuir ni laisser tomber. C'est juste arrêter d'ajouter de la charge à un moment où t'es déjà saturé. Je reste simplement là avec toi.

**Trace courte**
- http_status: 200 · response_owner: **`presence_conversation`** · reason: `presence_conversation_entry`
- skill_run: coaching_recommendation `status=exit`, `exit_target=global`, user_words captés (« juste besoin de souffler … pas dun truc de plus ») · memory_plan.response_intent: `supportive_presence`
- direct_effects: [] · durable_effect: aucun.

**Analyse (green — recovery)**
- Le coaching **exit proprement** (user_words capturés) et le tour route vers `presence_conversation_entry` : Sophia recule totalement (« pas d'exercice, pas maintenant … Je reste simplement là avec toi »). Anti-poussée honorée dès le refus. Même schéma miss→recovery que l'adéquation technique global19 T5→T6 : le doute aurait dû surgir au T8, il arrive au T9 après pushback.

---

### Tour 10 — offre concrète sur pull explicite (presence)

**Verdict du tour:** green

**User**
> ouais... merci. bon en vrai ptet que si, jvais pas rester planté. tu ferais quoi toi à ma place là, concretement, juste pour que ça empire pas cette semaine?

**Sophia** (extrait)
> Franchement, vu la fatigue, le côté "tapis roulant" et le fait que le soir ce sont surtout les écrans + les replays de conversations qui t'aspirent, moi je chercherais pas à "bien dormir" cette semaine. Je chercherais juste à éviter l'aggravation. [… 4 points : laptop hors du lit ; sas ultra-court ; objectif minimal « je ne laisse pas l'heure déraper » ; protéger les soirs de sport …] En une phrase : je ferais une semaine de protection, pas une semaine de performance. Si je devais te dire le tout premier truc à faire ce soir : laptop hors du lit, puis 5 minutes de carnet quand les replays commencent.

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · reason: `active_presence_conversation` · memory_plan.response_intent: `supportive_presence_with_concrete_guidance`
- direct_effects: [] · durable_effect: aucun.

**Analyse (green, watch mineur)**
- Sur le **pull explicite** (« tu ferais quoi concrètement »), presence délivre une guidance **groundée sur la mémoire réelle** d'Alex (écrans, carnet, « replays de conversations » = contenu du carnet, « soirs de sport » = futsal) et se termine sur **un premier pas unique** (« laptop hors du lit + 5 min de carnet »). Aucun side effect. Watch mineur non bloquant : la réponse est un **dump dense de 4 points** vs la doctrine « offre unique sur pull » — mais elle atterrit bien sur un seul geste concret, et le pull était large (« tu ferais quoi »).

---

### Tour 11 — carte de défense sur vrai moment de craquage (adéquation technique) — piège inverse de global19 T5

**Verdict du tour:** green

**User**
> ok le laptop hors du lit ça me parle. mais mon vrai piège cest quand jsuis déjà au lit et que jattrape mon tel pour 'juste 5 min' et que jy passe une heure sans men rendre compte. tu peux me filer une carte de défense pour CE moment précis là?

**Sophia**
> Oui, là c'est bien une **carte de défense libre** : ton vrai risque, ce n'est pas de commencer, c'est de te faire aspirer une fois le téléphone déjà en main.
>
> Je ne vais pas la remplir à ta place ici, mais si tu la crées dans **Dashboard > Ressources**, tu décris simplement ce moment-là avec tes mots : **au lit, téléphone en main, "juste 5 min" qui dérapent**. Ensuite la plateforme te fera passer les questions pour cadrer le moment critique, le piège, le geste de retour et le plan B simple.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · reason: `coaching_recommendation_signal` · skill_run status `continue`
- memory_plan.response_intent: `supportive_presence_with_tool_pull` · direct_effects: [] · durable_effect: aucun (aucun executor).

**Analyse (green)**
- **Adéquation technique correcte dès le 1er tour** : Sophia identifie que le besoin est un **moment de craquage** (« te faire aspirer une fois le téléphone déjà en main ») et choisit une **carte de défense**, la bonne technique pour une fenêtre de rupture. Contraste positif avec global19 T5 (mot-de-bascule forcé sur une action de lancement, accepté sans doute). Frontière chat/produit respectée (renvoi Ressources, refus honnête de créer à sa place, contenu utile fourni).

---

### Tour 12 — cancel rappel + statut multi-intent (re-check projection)

**Verdict du tour:** green

**User**
> ok jla ferai. au fait finalement annule moi le rappel des écrans de demain, jvais gérer ça avec la carte plutot. et du coup redis moi ce quil me reste comme rappels de prévu?

**Sophia**
> Le rappel de demain à 20:45 pour couper les écrans est annulé.
>
> Il te reste prévu :
> - 14 juil. à 21:00 — sortir mon carnet avant de dormir
> - 09:00 tous les jours — Petit check du soir : est-ce que ça a un peu redescendu, même de 5 % ?

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · memory_plan.response_intent: `supportive_presence_with_status_lookup`
- direct_effects: `cancel_one_shot_reminder` `success` (committed `0c21a0ca`) ; coaching_recommendation `status=exit`
- durable_effect: **OK** — DB post-T12 : `0c21a0ca cancelled`, `2acdcc82 pending` (carnet 21:00). Projection honnête (carnet demain + série récurrente), écrans correctement omis, **date « 14 juil » juste** (pas d'erreur de jour-de-semaine, contra BF-STATUS-03).

**Analyse (green)**
- Cancel + statut servis dans le même tour : l'annulation committe, le coaching exit proprement, et la projection couvre l'union one-shot restant + série récurrente sans faux pending ni erreur calendaire.

---

### Tour 13 — intention mémoire explicite (memorizer nocturne)

**Verdict du tour:** green

**User**
> un truc à retenir pour toi pour la suite: le dimanche soir cest vraiment mon pire moment, jappréhende la semaine qui arrive et jarrive jamais à couper ce soir là. garde le en tête pcq cest là que jai le plus besoin dun coup de pouce

**Sophia**
> C'est noté : le dimanche soir est ton pire moment, avec l'appréhension de la semaine et la difficulté à décrocher. Je le garderai en tête pour la suite. 💛

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · memory_plan.response_intent: `remember_user_context`
- direct_effect in-turn: aucun (conforme — écriture portée par le memorizer nocturne). **Vérif bout-en-bout** : `trigger-memorizer-daily` scopé Alex (`hours=1`, `message_count=15`) → `memory_items` 46→49, fait persisté « Le dimanche soir est une période de vulnérabilité majeure … appréhension de la semaine et incapacité à déconnecter » (voir §4).

**Analyse (green, watch mineur)**
- Accusé sobre, aucune écriture in-turn, fait bien capté au batch. Watch mineur (non bloquant) : le fait **explicitement demandé** (« garde-le en tête ») atterrit en `status=candidate`, tandis qu'un fait **inféré** (piège du tel au lit, T11) atterrit en `active` — inversion mineure de durabilité entre l'explicite et l'inféré.

---

### Tour 14 — préférence de ton en chat (comportement cible BF-PREF-01)

**Verdict du tour:** green

**User**
> et un dernier truc: parle moi plus cash stp, moins de 'je comprends que ça pèse' et moins de coeurs, direct au but. ça me parle bcp plus quand cest carré. tu peux faire ça pour la suite?

**Sophia**
> C'est appliqué, je serai plus cash et plus direct avec toi dès maintenant.
>
> Pour que ce soit permanent, règle-le dans **Preferences coach** — la version conversationnelle arrive plus tard.

**Trace courte**
- http_status: 200 · response_owner: `feature_opportunity` · reason: `feature_opportunity_signal` · skill_run status `continue`
- memory_plan.response_intent: `coach_style_feedback_acknowledgement` · direct_effects: [] · durable_effect: **aucun** (conforme WON'T-FIX BF-PREF-01 — pas d'écriture `user_relation_preferences`).

**Analyse (green — comportement cible)**
- **Les trois volets BF-PREF-01 sont respectés** : (1) application immédiate en **ouverture** (« C'est appliqué, je serai plus cash dès maintenant » — n'ouvre PAS par la limitation) ; (2) honnêteté sur le durable (« pour que ce soit permanent … la version conversationnelle arrive plus tard ») ; (3) renvoi vers **Preferences coach**. Aucune clé interne citée, aucune fausse promesse de persistance, aucune écriture DB. C'est le comportement cible, pas un bug.

---

### Tour 15 — clôture + tenue du style en session

**Verdict du tour:** green

**User**
> ok cool. bon jvais aller souffler un peu là et tenter de couper mon écran tot ce soir pour une fois. merci davoir pris le temps, ça ma fait du bien de vider tout ça

**Sophia**
> Bonne idée de couper tôt ce soir. Tu as déjà le bon move : souffler, puis fermer l'écran sans tirer dessus.
>
> Et pour la suite, je te répondrai plus cash, plus carré, avec moins de fioritures.

**Trace courte**
- http_status: 200 · response_owner: `feature_opportunity` (`active_feature_opportunity`, `status=complete`) · memory_plan.response_intent: `reflection`
- direct_effects: [] · durable_effect: aucun. **Style « cash » tenu en session** (plus direct, sans cœurs, sans « je comprends que ça pèse ») — `__session_style_commitments` présent dans `temp_memory` du scope. Aucun `__active_skill_state` résiduel post-run (vérifié).

**Analyse (green, watch mineur)**
- Clôture chaleureuse mais **carrée**, cohérente avec la préférence appliquée au T14 (P1 session style tenu). Watch mineur : la clôture reste ownée par `feature_opportunity` (le flow style) plutôt qu'un `normal_reply` propre, et re-mentionne « je te répondrai plus cash » une 3e fois — léger, non bloquant.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- **Le bloc presence/coaching est solide** : dépôt émotionnel accueilli sans sur-escalade (T7), recovery propre après refus d'exercice (T9), guidance groundée sur mémoire réelle et centrée sur un premier pas au moment du pull (T10), carte de défense correctement choisie pour un vrai moment de craquage (T11).
- Replace « brouillon → 21h00 » propre (T2), multi-intent track+rappel sans répétition (T4), product_help billing honnête (T5), cancel+statut clair et daté juste (T12), BF-PREF-01 comportement cible (T14) avec style tenu en clôture (T15).

**Problèmes**
- Tour 3: « compte-moi les trois soirs » → **un seul compté** (vendredi), samedi+dimanche perdus, et le rendu dit « pas encore les trois soirs comptés » alors qu'un a été committé. Le user croit son suivi à jour ou vide, il est en réalité faux. Famille: BF-AGENDA-01 (+BF-EFFECT-02/BF-LEDGER-02). Impact: suivi de plan durablement incomplet + rendu trompeur. Sévérité: red.
- Tour 8: technique (« clarte ») poussée en plein dépôt émotionnel vulnérable, sans pull. Famille: à classifier (arbitrage presence/coaching). Impact: risque de se sentir non-entendu ; corrigé seulement après refus explicite (T9). Sévérité: yellow.
- Tour 1: rappel committé malgré « montre-le-moi avant de le poser, je valide » ; rendu ambigu (brouillon vs créé). Famille: BF-INTAKE-03. Impact: effet durable non validé + confusion. Sévérité: yellow.
- Tour 6: spéculation d'intégrations non groundées (Apple Health/Google Fit/Fitbit) sur une capacité inexistante. Famille: à classifier. Impact: fausse piste possible. Sévérité: yellow.

**Fix proposé**
- Source amont: fan-out déterministe du track multi-date + rendu asservi au commit réel (T3) ; presence anti-poussée prioritaire sur dépôt sans pull (T8) ; brouillon/preview de rappel opposable en admission (T1) ; routing feature_opportunity + grounding capacité (T6).
- Correction recommandée: voir les fiches par tour ; priorité UX/effet T3.
- Tests d'invariant attendus: « fait X les 3 soirs » → 3 entrées + rendu « 3 comptés » ; dépôt émotionnel sans pull → pas d'offre de technique ; « montre avant de poster » → aucune ligne pending avant confirmation.

## 4. Analyse Système

**Verdict: red**

**Routage**
- Dispatcher varié et globalement juste sur 15 tours : `normal_reply` (T1-T4, T7, T12-T13), `product_help` (T5), `coaching_recommendation` (T8, T11), `presence_conversation` (T9-T10), `feature_opportunity` (T14-T15). Les frontières neuves tiennent : billing → renvoi portail sans mutation (T5), carte → renvoi Ressources sans executor (T11), presence entrée/exit propres (T9, T12).
- Deux mis-routes à noter : capacité inexistante restée en `normal_reply` avec spéculation d'intégrations au lieu de `feature_opportunity` (T6) ; dépôt émotionnel réflexif reclassé en `coaching_recommendation` avec offre de technique sans pull (T8).

**Skills / Operations / Tools**
- `create/cancel_one_shot_reminder`: **replace atomique + héritage d'ancre confirmé vert** (T2) — le fix P4-B tient, le red global19 T12 ne se reproduit pas. Cancel+statut honnête (T12). MAIS **brouillon/preview non honoré** : « montre avant de poster, je valide » committe quand même (T1, BF-INTAKE-03).
- `track_progress_plan_item`: multi-intent **cross-lane** track+rappel committe les deux (T4, vert — contra Eva global18 T9). MAIS multi-cardinalité **homogène** (3 dates même cible) **aplatie en 1** (T3, red) : même racine architecturale que les composites bi-parties (global19 T10/T12) mais **hors périmètre des fix P4-A/P4-B** (qui contractualisent retarget X→Y et replace cancel+create, pas le fan-out N-occurrences).
- `coaching_recommendation`: adéquation technique **correcte au 1er tour** sur moment de craquage (T11, contra global19 T5) ; mais **offre de technique sur dépôt émotionnel sans pull** (T8), récupérée au T9.
- `product_help` / `presence_conversation` / `feature_opportunity`: aucun executor appelé depuis le chat, aucune mutation non consentie, renvois produit honnêtes.

**Memory / Effets durables**
- Intention mémoire T13 : accusé sobre, aucune écriture in-turn, puis `trigger-memorizer-daily` scopé Alex → **fait persisté** (`memory_items` 46→49). **Aucune contamination hors-persona** cette fois (scope dédié, contra l'incident cannabis d'alex 12/07). Watch mineur : le fait explicitement demandé atterrit `candidate`, l'inféré `active`.
- Effet durable vs intention : **une divergence** — T3 (2 des 3 soirs de carnet jamais crédités). Les autres effets (replace T2, double effet T4, cancel T12) correspondent exactement à l'intention.

**Problèmes**
- Tour 3: track composite multi-date aplati en 1 + rendu contradictoire. Famille: BF-AGENDA-01 (+BF-EFFECT-02/BF-LEDGER-02). Impact système: suivi de plan durablement incomplet sur intention explicite. Sévérité: red.
- Tour 1: anti-instruction « preview/validate » non opposable → create committé. Famille: BF-INTAKE-03. Sévérité: yellow.
- Tour 8: arbitrage presence/coaching — technique poussée sans pull. Famille: à classifier. Sévérité: yellow.
- Tour 6: routing feature_opportunity manqué + claim capacité non groundé. Famille: à classifier / BF-STATUS-01. Sévérité: yellow.

**Fix proposé**
- Source amont: (1) contractualiser le track **multi-cardinalité** comme fan-out déterministe N-occurrences (généralisation de la doctrine composite P4 : retarget/replace → aussi track multi-date) + garde d'admission « rendu asservi au commit réel » ; (2) porter l'anti-instruction preview dans le TurnFrame + garde d'admission brouillon pour `create_one_shot_reminder` ; (3) presence anti-poussée prioritaire quand `response_intent=supportive_emotional_reflection` sans pull ; (4) routing feature_opportunity + grounding registre des capacités.
- Tests d'invariant attendus: (a) « fait X les 3 soirs » → 3 entrées + rendu « 3/… comptés » ; (b) « montre avant de poster » → 0 pending avant confirmation ; (c) dépôt émotionnel sans pull → 0 offre de technique ; (d) demande de capacité inexistante → route feature_opportunity, 0 intégration nommée sans preuve.

## Verdict Global

- Verdict: **red**
- Raison principale: **T3** — la demande explicite « compte-moi mon carnet vendredi, samedi ET dimanche » ne crédite **qu'un seul** soir (vendredi 10/07) ; samedi 11/07 et dimanche 12/07 sont **perdus durablement**, et le rendu prétend « pas encore les trois soirs comptés » alors qu'un a été committé (BF-AGENDA-01 + BF-EFFECT-02 + BF-LEDGER-02). C'est la **même racine architecturale** que les reds composites de global19 (T10 retarget, T12 replace) mais sur un axe **non couvert par les fix P4** : le fan-out d'occurrences homogènes dans une même lane track.
- Follow-up prioritaire: généraliser la doctrine « effet composite = transaction complète » au **track multi-cardinalité** (N dates → N écritures) + garde de rendu asservi au commit réel. Bonnes nouvelles à acter : **5 surfaces jamais testées sur Alex validées** (product_help billing honnête, presence approfondie avec recovery et offre sur pull, carte de défense adéquate au 1er tour, cancel+statut daté juste, capacité impossible refusée honnêtement) ; **replace atomique + héritage d'ancre confirmés verts en run réel (fix P4-B validé)** ; multi-intent cross-lane track+rappel vert ; BF-PREF-01 comportement cible respecté ; mémoire bout-en-bout Alex re-validée **sans contamination hors-persona**.

## 5. Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-13-alex-untested20-r1-bugs.md`

## Annexe — Hygiène / Reset

- Run mené hors sandbox, Supabase local, chemin IA réel (`test-send-message` + `force_full_ai=true`, `disable_debounce=true`), 15/15 HTTP 200, aucune réponse vide/abort/timeout.
- Daily/weekly **écarté à dessein** : Alex n'a aucun setup WhatsApp (`phone_number=null`, `whatsapp_opted_in=false`, 0 pending) et la fiche 12-daily-weekly réserve ce flow à Paul/Rose ; le fabriquer aurait violé la règle anti-hardcoding. Documenté comme angle mort fleet-wide non couvrable sur Alex.
- Rappels du run programmés sur demain (14/07) pour rester hors de portée du cron `process-checkins` ; aucun tour de pending WhatsApp dans le périmètre.
- Memorizer déclenché **une seule fois**, en fin de run, **scopé `user_id` Alex** (`hours=1`, header `x-internal-secret`) ; batch a vu `message_count=15` (= uniquement le scope du run, pas de sweep fleet-wide), `persisted_count=3`, extraction run `d7c45589`.
- Incident environnement: faible activité fleet au pré-check (2 msgs d'Eva `bfa52a7a` sur 10 min) ; isolation tenue (scope dédié, memorizer scopé user, vérifs par `user_id`). Aucun effet Alex parasité.
- Nettoyage vérifié contre la baseline pré-run : `memory_items=46` (3 items du batch + 15 processing rows + extraction run supprimés), `user_plan_item_entries=1` (baseline `7ae8ce40` écrans 09/07 conservée ; entrées de run `e45787b8` carnet + `fbd9fbc3` sas supprimées), `carnet current_reps=2`, `sas current_reps=null`, `écrans current_reps=3`, `pending one-shot=0` (rappels de run `780c0e9c`/`2acdcc82`/`0c21a0ca` supprimés), série potion `1f05be22` intacte (active), `conversation_turn_traces` du run supprimées (15), scope de run supprimé (30 messages + `user_chat_states`), aucun `__active_skill_state` résiduel (scope `web`).
- JWT obtenu via login password local (ANON_KEY réel), jamais affiché ; fichier token du scratchpad purgé en fin de run.
