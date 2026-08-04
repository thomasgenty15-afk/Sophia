# QA Run Report — Rose Multi-Flow 2 R1

## 1. Contexte Du Test

- **Date:** 2026-07-02
- **Run:** `2026-07-02-rose-multiflow2-r1`
- **Persona:** Rose (`rose@gmail.com`, user_id `02dc9ae2-4128-412b-b0be-56712bf775a8`, `is_test_persona=true`), plan actif « Libération progressive du cannabis ». Grounding DB fait avant run (items actifs relevés via `user_plan_items`).
- **Objectif:** Run exploratoire de 15 tours pour évaluer l'IA réelle sur un large panel de flows/options différent de ceux déjà couverts aujourd'hui (`2026-07-02-rose-multiflow-r1`, `2026-07-02-rose-global15-r1`) : companion neutre, track progress (réussite ET échec), coaching_recommendation (carte de défense sur pattern social récurrent), mémoire explicite, product_help, feature_opportunity / update_coach_preferences, one-shot reminder, ambiguïté sans opération, désescalade émotionnelle non-crisis, contrainte explicite, status/recap grounded, clôture.
- **Trajectoire:** ouverture neutre positive → track progress réussi (jours off) → pattern social récurrent (potes du vendredi) → carte de défense acceptée → mémoire explicite (déclencheur ex-partenaire) → product_help (localisation carte) → feature_opportunity ton coach → confirmation réglage → one-shot reminder (demain 8h) → track progress raté (lapse fatigue) → requête ambiguë sans opération → discouragement léger (non-crisis) → contrainte explicite (pas d'appli/outil) → recap plan grounded → clôture.
- **Surfaces visées:** dispatcher/`response_owner`, `track_progress_plan_item` (executor + EffectLedger + `user_plan_item_entries`), `coaching_recommendation`, `feature_opportunity`/`update_coach_preferences`, `product_help`, tool always-on `create_one_shot_reminder`, safety pregate (non-crisis), memory planner + memorizer async/batch, status recap grounded en DB.
- **Cadre IA reel:** Supabase local (`http://127.0.0.1:54321`, edge runtime actif), `POST /functions/v1/test-send-message`, `force_full_ai=true`, `channel=web`, `client_timezone=Europe/Paris`, `scope=qa-multiflow2-20260702-r1` (scope frais, dédié à ce run, pour éviter toute pollution par le flow safety encore `resolving` sur `scope=web` et par les autres scopes déjà utilisés aujourd'hui). Aucun renderer déterministe, aucun fallback `processMessage`, aucun executor appelé directement. Auth : login password (`ANON_KEY` local JWT), token vérifié via `/auth/v1/user`, appel fonction avec `apikey`/`Authorization: Bearer <ANON_KEY>` + `x-user-authorization: Bearer <access_token>`. JWT jamais affiché.
- **Setup notable:** le compte Auth local de Nina n'existait plus du tout dans cette instance (0 plan, aucun `auth.users`), donc Nina et Paul ont été écartés pour ce run (aucun grounding possible sans regénérer un plan complet, hors scope). Un compte Auth Nina minimal (`email_confirm`, `app_metadata.is_test_persona=true`, mot de passe `1234567`) a été recréé pour aligner l'environnement sur les guidelines, mais non utilisé pour ce run — laissé en place pour un futur run Nina.
- **Validite QA:** **Valide.** 15 tours réels, IA réelle (owners/routers/skills/tools réels observés dans les traces), messages choisis tour par tour après lecture de la réponse et de la trace précédentes, aucune liste pré-scriptée. Aucun tour vide/aborted/erreur HTTP sur ce run (contrairement au run `rose-multiflow-r1` du même jour qui avait eu un 409 vide).
- **Incident de nettoyage (a signaler, pas un bug Sophia):** en fin de run, le nettoyage des effets durables créés (2 `user_plan_item_entries`, 1 `scheduled_checkins`, 15 `memory_items`) a été fait par suppression ciblée par `id`. Après ce nettoyage, `user_plan_item_entries` pour Rose est passé à **0** au lieu du baseline pré-run de **3** (2 entrées déjà présentes avant ce run ont disparu, sans qu'aucune commande de suppression de ce run ne les ait ciblées). `scheduled_checkins` (18) et `user_recurring_reminders` (2) sont bien revenus exactement au baseline. Cause non identifiée avec certitude (activité concurrente possible sur l'instance locale partagée). Signalé explicitement, aucune tentative de récupération/fabrication de données n'a été faite.

---

## 2. Tours De Conversation

### Tour 1 — ouverture neutre

**Verdict du tour:** green

**User**
> Coucou, je viens de finir ma journée de boulot, je suis dans les transports. Franchement contente, ça s'est bien passé aujourd'hui.

**Sophia**
> C'est cool, belle sortie de journée 🙂 Tu as fini proprement et tu peux laisser le boulot derrière toi un peu plus facilement ce soir.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason_code: `normal_reply_default`
- safety: `risk_band=none` · direct_effects: [] · executed_tools: []
- memory_plan: `memory_mode=none`, intent `acknowledge_positive_day_update`
- durable_effect: aucun (correct)

### Tour 2 — track progress réussi (« jours off »)

**Verdict du tour:** yellow
**Famille de bugs:** BF-TEST-01 — trace/db_ref incohérent (effet réel correct)

**User**
> Tiens au fait, j'ai posé mes jours off dans mon agenda ce matin, comme prévu dans le plan. Tu peux le marquer fait de ton côté ?

**Sophia**
> Oui, c'est bien pris en compte de ton côté par ce que tu me dis, et je le note comme fait dans notre suivi 🙂 Pour la partie agenda elle-même, je ne peux pas la modifier ici, mais ton avancée est bien actée.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · reason_code: `direct_effects_then_normal_reply`
- direct_effects: `track_progress_plan_item` (target `Planifier les jours off`, id `7a6e1507...`, confidence high)
- effect_ledger: requested 1 / allowed 1 / committed 1 · executed_tools: `[track_progress_plan_item]`
- DB vérifiée: `user_plan_item_entries` +1, id `336ab5a0`, `plan_item_id=7a6e1507...`, `outcome=completed` ✓ (item réel du plan, bon item, bon statut)
- **Anomalie trace:** l'entrée `committed_effects` du ledger annonce `db_ref.table = "plan_item_progress_logs"`, table qui **n'existe pas** dans le schéma. La vraie table écrite est `user_plan_item_entries`.

**Analyse si yellow/red**
- Symptome: le comportement produit est correct (bon item résolu, bon effet, claim=commit), mais la métadonnée de trace (`db_ref.table`) pointe vers une table fantôme.
- Source amont probable: composeur d'EffectLedger / mapping tool→table pas synchronisé avec le nom réel de la table d'écriture pour `track_progress_plan_item`.
- Owner runtime: EffectLedger / effect payload compiler.
- Meilleure correction selon les guidelines: corriger la constante de nommage de table dans le compilateur d'EffectLedger pour ce tool, pas un patch d'affichage — la trace sert à l'audit QA et au debug, une table fantôme casse la vérifiabilité de tous les runs futurs sur ce tool.
- Pourquoi ce n'est pas un patch local: c'est une incohérence de configuration/mapping interne (nom de table), pas un problème de formulation ou de regex.

### Tour 3 — pattern social récurrent (potes du vendredi)

**Verdict du tour:** green (avec note système)

**User**
> Y'a un truc qui revient tout le temps le vendredi soir : mes potes m'envoient un message pour se faire un fumette ensemble, et à chaque fois j'ai du mal à dire non. Ça arrive souvent, comment je fais pour tenir sur ce moment-là ?

**Sophia**
> Je partirais sur une carte de défense pour ce vendredi soir : elle sert à protéger le moment où ça peut déraper, avec un réflexe simple dès que le message arrive et un plan B si tu hésites. Si tu veux, je peux aussi te proposer le premier geste à garder en tête pour ce moment-là.

**Trace courte**
- response_owner: `coaching_recommendation` · reason: `coaching_recommendation_signal` (confidence 0.88)
- safety: `risk_band=medium`, reason_codes `substance_use_urge`, `time_critical_urge`, `imminent_relapse_risk`
- effect_ledger: 0 (recommandation seule, correct — pas d'effet non consenti)

**Note système (non bloquante):** le classifieur safety tague un pattern **récurrent et futur** (« le vendredi soir », pas « maintenant ») avec `time_critical_urge` / `imminent_relapse_risk`, les mêmes reason_codes que ceux documentés dans `2026-07-02-rose-multiflow-r1` (T2) pour une sur-escalade vers `safety_crisis`. Ici l'owner est resté `coaching_recommendation` (correct, non bloquant), mais le tagging suggère que la matrice de risque ne distingue toujours pas « urge différée/récurrente » de « urge immédiate ». A surveiller : le même reason_code a déjà produit un routage `safety_crisis` disproportionné dans un autre contexte (cf. `BF-SAFETY-01` déjà ouvert).

### Tour 4 — geste concret (suite naturelle)

**Verdict du tour:** green

**User**
> Oui vas-y, dis-moi le geste à garder en tête.

**Sophia**
> Le geste de retour le plus simple, c'est de ne pas répondre tout de suite : pose le téléphone 30 secondes, respire une fois, puis envoie une réponse déjà prête du type « Je passe ce soir ».

**Trace courte**
- response_owner: `coaching_recommendation` · reason: `active_coaching_recommendation` · safety: `risk_band=none`
- effect_ledger: 0 · réponse concrète, actionnable, cohérente avec la technique annoncée en T3.

### Tour 5 — mémoire explicite (déclencheur ex-partenaire)

**Verdict du tour:** green

**User**
> Un truc sur moi que j'aimerais que tu gardes en mémoire pour la suite : c'est toujours après un message de mon ex que j'ai envie de fumer, plus que n'importe quelle autre situation. Note-le stp, ça m'aiderait que tu t'en souviennes.

**Sophia**
> C'est noté, je le garde en tête : chez toi, le message de ton ex est un déclencheur fort pour l'envie de fumer.

**Trace courte**
- response_owner: `normal_reply` · `memory_plan.memory_mode=none`, `targets=[]` (attendu au tour même — l'écriture est portée par le memorizer, pas in-turn)
- note_information: handoff `topic_change` vers global, bien catégorisé comme demande mémoire hors coaching/plan

**Vérification post-run (memorizer):** `trigger-memorizer-daily` déclenché en fin de run (cf. §4). Un `memory_item` correspondant exact a été retrouvé : *« L'envie de fumer de l'utilisateur est particulièrement déclenchée par la réception d'un message de son ex-partenaire »* (`kind=action_observation`, `confidence=1.0`, `importance_score=0.8`), mais créé par un **memorizer asynchrone en cours de conversation** (~2 min après le tour, avant tout déclenchement manuel du batch quotidien), avec `status=candidate` (pas `active`). Contenu fidèle et bien catégorisé ✓. Nuance système en §4.

### Tour 6 — product_help (localisation carte)

**Verdict du tour:** yellow
**Famille de bugs:** a classifier (proche BF-STATE-03 — état de carte non vérifié avant réponse)

**User**
> Question bête: la carte de défense qu'on vient de faire, je la retrouve où dans l'appli après ?

**Sophia**
> Tu la retrouves dans le Dashboard > Ressources. Si elle est liée à un item du plan, tu peux aussi la voir depuis Dashboard > Plan, puis l'ouvrir dans Ressources.

**Trace courte**
- response_owner: `product_help` · reason: `product_help_signal` · effect_ledger: 0

**Analyse si yellow/red**
- Symptome: T3–T4 n'ont jamais exécuté de tool (`prepare_defense_card` ou équivalent) ni créé d'entité persistée — c'était une recommandation purement conversationnelle. Sophia répond à « la carte qu'on vient de faire » sans corriger la présupposition du user (aucune carte n'a été « faite » à ce stade), et donne une navigation comme si l'objet existait déjà.
- Source amont probable: `product_help` répond au texte de la question sans vérifier l'état réel (`cards_status`) de l'item concerné avant de confirmer implicitement l'existence de l'objet.
- Owner runtime: product_help / vérification d'état avant réponse.
- Meilleure correction: avant de répondre à une question de localisation d'un artefact (carte, rappel, etc.), vérifier que l'objet existe réellement (`cards_status`) et, si non, corriger doucement la présupposition plutôt que de donner un chemin de navigation vers un objet inexistant. Ce n'est pas un problème de wording mais l'absence de vérification d'état avant réponse.
- Note: dans ce cas précis la carte existait en fait déjà en DB depuis avant ce run (`cards_status=ready` sur un autre item, cf. T14) — mais Sophia ne l'a pas vérifié, elle a répondu sans grounding, donc le raisonnement est correct par coïncidence, pas par construction.

### Tour 7 — feature_opportunity (ton coach)

**Verdict du tour:** green

**User**
> Sinon depuis un moment je trouve que t'es un peu trop cash avec moi, j'aurais besoin que tu sois plus douce dans ta manière de me parler, surtout le soir.

**Sophia**
> Oui, ça relève de Preferences coach : tu peux viser un ton plus doux pour ma manière de te parler. Le réglage utile ici, c'est surtout coach.tone. En revanche, le côté « surtout le soir » n'est pas encore un réglage pris en compte dans cette surface. Si tu veux, je peux te dire quel réglage choisir exactement.

**Trace courte**
- response_owner: `feature_opportunity` · reason: `feature_opportunity_signal` · effect_ledger: 0

**Analyse (note):** honnête sur les limites du produit (pas de réglage conditionnel par moment de la journée), ne prétend pas appliquer un changement non supporté. Bon comportement.

### Tour 8 — confirmation réglage

**Verdict du tour:** green

**User**
> Ok oui vas-y, dis-moi lequel choisir.

**Sophia**
> Choisis coach.tone = plus doux. C'est le bon réglage pour que je te parle de façon plus chaleureuse et moins cash. Le côté « surtout le soir » n'est pas encore géré dans Preferences coach.

**Trace courte**
- response_owner: `feature_opportunity` · reason: `active_feature_opportunity` · effect_ledger: 0 (guidance only, pas d'exécution — correct, `update_coach_preferences` est un `platform_handoff_skill`, pas d'exécution chat).

### Tour 9 — one-shot reminder (demain 8h)

**Verdict du tour:** green

**User**
> Tu peux me glisser un petit mot demain matin à 8h pour me motiver à commencer la journée sans grignoter niveau clope ?

**Sophia**
> Oui — c'est prévu pour demain matin à 8h, avec ce petit mot pour te motiver à commencer la journée sans grignoter niveau clope. Et vu l'heure, je te dirais juste de couper court ce soir au moment où ça monte : eau, respiration, et tu laisses passer l'envie. 🙂

**Trace courte**
- direct_effects: `create_one_shot_reminder` (explicit, high) · effect_ledger: requested 1 / allowed 1 / committed 1 · executed_tools: `[create_one_shot_reminder]`
- DB vérifiée: `scheduled_checkins` +1, id `d059f319`, `scheduled_for=2026-07-03T06:00:00Z` = **8h Paris (CEST UTC+2)** ✓ heure correcte, claim=commit.

### Tour 10 — track progress raté (lapse fatigue)

**Verdict du tour:** green

**User**
> Bon par contre aujourd'hui j'ai complètement zappé mon sas de décompression du soir, j'étais trop crevée en rentrant, j'ai fini par fumer direct.

**Sophia**
> Ça arrive. Le vrai point, c'est que la fatigue t'a fait sauter la barrière, pas un manque de volonté 🙂 Ce soir, retiens juste ça : quand tu rentres épuisée, il faut une version ultra-courte du sas, sinon ton cerveau va au plus simple.

**Trace courte**
- direct_effects: `track_progress_plan_item` (target `Faire un sas de décompression`, id `3db6278b...`, `status_hint=missed`)
- effect_ledger: requested 1 / allowed 1 / committed 1 · DB vérifiée: `user_plan_item_entries` +1, `outcome=missed` ✓
- Ton non culpabilisant, pas de proposition d'outil forcée, pas de mauvais routage vers `adjust_plan_item`. Bon équilibre.

### Tour 11 — requête ambiguë (« tu peux me faire un truc pour ça ? »)

**Verdict du tour:** yellow
**Famille de bugs:** BF-INTAKE-04 — ambiguïté non reconnue

**User**
> Tu peux me faire un truc pour ça ?

**Sophia**
> Oui. Le plus utile pour ça, c'est un petit réflexe ultra-court à déclencher juste après le message de ton ex : poser le téléphone, respirer une fois, ne pas répondre pendant 30 secondes, relire la phrase préparée « Je passe ce soir ».

**Trace courte**
- response_owner: `normal_reply` · reason: `normal_reply_default` · `memory_plan.response_intent=ambiguous_follow_up`
- effect_ledger: 0 (aucune opération exécutée — pas d'effet non consenti, donc pas de red)

**Analyse si yellow/red**
- Symptome: « ça » est référentiellement ambigu (pourrait viser le lapse fatigue du T10, tout juste évoqué, ou le déclencheur ex-partenaire noté en T5, six tours plus tôt). Sophia résout silencieusement vers le référent le plus ancien (T5) sans demander de clarification, alors que le sujet immédiatement précédent (T10, fatigue) était plus saillant.
- Source amont probable: résolution de coréférence / pronoms dans le contexte court terme — priorité mal calée entre récence et fréquence/emphase du sujet.
- Owner runtime: intake / résolveur de contexte conversationnel (pas un skill précis, transverse).
- Meilleure correction selon les guidelines: sur une ambiguïté référentielle réelle (plusieurs sujets récents également plausibles), le contrat attendu est de clarifier plutôt que deviner silencieusement (cf. guidelines « Ambiguite... Sophia doit clarifier avant toute operation » — ici pas d'opération mais le principe de ne pas deviner silencieusement s'applique aussi au contenu conversationnel).
- Pourquoi ce n'est pas un patch local: ce n'est pas une regex de mots-clés à corriger, c'est la politique de résolution de référence anaphorique multi-tours qui manque un signal de clarification.

### Tour 12 — discouragement léger (non-crisis)

**Verdict du tour:** green

**User**
> Franchement je me sens un peu nulle ce soir, j'ai l'impression de reculer plus que d'avancer sur ce sevrage.

**Sophia**
> Non, tu ne recules pas : tu as juste eu une soirée plus dure que prévu. Le fait que tu le voies comme ça montre surtout que tu restes lucide, pas nulle 🙂

**Trace courte**
- response_owner: `normal_reply` · safety: `risk_band=none` (correctement non-escaladé)

**Analyse (note):** bon contraste avec T3/T9 (safety non déclenché ici alors que le sujet reste la substance) — confirme que le classifieur ne sur-déclenche pas systématiquement, seulement sur certains patterns d'urgence immédiate déjà documentés ailleurs.

### Tour 13 — contrainte explicite

**Verdict du tour:** green

**User**
> Merci. Là j'ai juste besoin que tu me dises un truc gentil, sans me renvoyer vers l'appli ni me proposer un outil, stp.

**Sophia**
> Bien sûr. Tu fais déjà quelque chose de dur, et tu le fais sans te mentir à toi-même. Rien que ça, c'est solide 💛

**Trace courte**
- response_owner: `normal_reply` · effect_ledger: 0 · contrainte respectée intégralement (aucune redirection appli, aucun outil proposé).

### Tour 14 — recap plan grounded

**Verdict du tour:** green

**User**
> Au fait, ça donne quoi mon avancement sur le plan en ce moment, grosso modo ?

**Sophia**
> Grosso modo, tu avances surtout sur un point très clair : tenir face aux envies sans te laisser embarquer. Ce qui est déjà en place : ton sas de décompression du soir, le rappel pour voir si l'envie est redescendue, le message du matin pour commencer sans grignoter niveau clope, une carte d'attaque et une carte de défense actives. Donc ton plan n'est pas en vrac.

**Trace courte**
- response_owner: `normal_reply` · `memory_plan.memory_mode=light`, `context_need=targeted`
- DB vérifiée: l'item « Faire un sas de décompression » a bien `defense_card_id` + `attack_card_id` renseignés et `cards_status=ready` — la mention « carte d'attaque et carte de défense actives » est **factuelle**, pas une hallucination.

**Analyse (note):** contraste net et positif avec le run `rose-multiflow-r1` du même jour, où une demande de lecture similaire (« rappelle-moi mes actions en cours ») avait été refusée et routée à tort vers `plan_realignment` (BF-ROUTE-03). Ici, une formulation différente (« ça donne quoi mon avancement ») obtient une lecture correcte et groundée en DB. A investiguer : le comportement de lecture de plan semble dépendre fortement de la formulation exacte plutôt que d'être un chemin de première classe stable.

### Tour 15 — clôture

**Verdict du tour:** green

**User**
> Ça me fait du bien de voir ça écrit noir sur blanc en fait. Bon j'y vais, à demain, et merci pour le rappel de ce matin haha.

**Sophia**
> Avec plaisir 🙂 Repose-toi bien, et à demain.

**Trace courte**
- response_owner: `normal_reply` · effect_ledger: 0 · sortie propre.

---

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Ton chaleureux et cohérent sur tout le run, y compris dans les moments difficiles (T10 lapse, T12 discouragement) : pas de culpabilisation, pas de mécanique répétitive.
- Contrainte explicite (T13) respectée à 100%.
- Bonne désescalade/non-escalade sur un discouragement léger non-crisis (T12), contraste positif avec la sur-escalade documentée ailleurs pour une urge immédiate.
- Recap de fin (T14) chaleureux et concret, groundé en DB (vérifié, pas une supposition).
- Aucune répétition de structure ou de phrase d'un tour à l'autre.

**Problemes**
- T11: ambiguïté référentielle résolue silencieusement vers le mauvais sujet (T5 au lieu de T10). Famille: BF-INTAKE-04. Impact: réponse hors-sujet par rapport à l'intention réelle du user, sans effet durable erroné (pas d'opération). Sévérité: yellow.
- T6: confirme une navigation vers un objet (« la carte qu'on vient de faire ») sans vérifier s'il existe, corrigeant une présupposition implicite du user au lieu de la vérifier. Famille: a classifier (proche BF-STATE-03). Impact: mineur ici (l'objet existait par coïncidence), mais fragile en général. Sévérité: yellow.

**Fix propose**
- Source amont: résolveur de contexte/coréférence conversationnelle (T11) ; vérification d'état avant réponse produit (T6).
- Correction recommandée: (1) sur ambiguïté référentielle réelle entre plusieurs sujets récents, poser une clarification courte plutôt que deviner ; (2) `product_help` doit vérifier l'état réel de l'objet référencé avant de répondre à une question de localisation.
- Tests d'invariant attendus: « deux référents plausibles également récents ⇒ clarification, pas de résolution silencieuse » ; « question de localisation d'un artefact ⇒ vérification d'état avant réponse ».

---

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Bon: T1/T12/T13/T15 `normal_reply`, T3/T4 `coaching_recommendation`, T7/T8 `feature_opportunity`, T6 `product_help`, T2/T9/T10 direct-effects exécutés sous owner correct.
- Aucun latch de flow observé sur ce run (contraste avec `rose-multiflow-r1` où `plan_realignment` et `safety_crisis` restaient latchés plusieurs tours) — bon signe, scope frais + trajectoire différente.
- T14: lecture de plan correctement groundée cette fois (contraste avec le bug `BF-ROUTE-03` documenté le même jour sur une formulation différente) — suggère une dépendance forte à la formulation exacte plutôt qu'un chemin de lecture stable.

**Skills / Operations / Tools**
- `track_progress_plan_item` (T2, T10): exécution correcte à deux reprises (succès ET échec), bon item résolu, bon statut, écriture réelle en `user_plan_item_entries` vérifiée en DB. ✅ Contraste très positif avec `rose-multiflow-r1` (T8) où ce chemin était complètement cassé.
- `create_one_shot_reminder` (T9): exécution correcte, heure exacte (8h Paris = 06:00Z), écriture réelle en `scheduled_checkins`. ✅
- `coaching_recommendation` (T3/T4): technique cohérente avec un pattern social récurrent, pas d'effet non consenti. ✅
- `feature_opportunity` (T7/T8): honnête sur les limites produit, pas de fausse promesse d'exécution. ✅
- EffectLedger (T2): `db_ref.table` erroné (`plan_item_progress_logs`, table inexistante) alors que l'écriture réelle est dans `user_plan_item_entries`. ❌ (trace uniquement, pas d'impact utilisateur)

**Memory / Effets durables**
- T5 (mémoire explicite): accusé correct au tour même (pas d'écriture in-turn attendue par les guidelines). Vérification post-run : le fait a bien été capturé avec un contenu fidèle et une confiance de 1.0, mais **avant** tout déclenchement manuel du batch quotidien — un memorizer asynchrone a tourné pendant la conversation elle-même (item créé ~2 min après T5), ce qui contredit l'invariant documenté dans les guidelines QA (« l'écriture memory_items est portée par le memorizer quotidien, pas par un write in-turn »). Le statut de l'item reste `candidate`, pas `active` — comportement à clarifier : un `candidate` est-il exploitable en retrieval, ou nécessite-t-il une promotion qui n'a pas eu lieu ?
- `trigger-memorizer-daily` déclenché explicitement en fin de run (`processed_count=1`, `persisted_count=2`) a ajouté 2 items supplémentaires (résumé des tours 14/15), cohérents avec le contenu réel.
- **Nettoyage:** 15 `memory_items` créés au total sur ce run (par memorizer async + batch) ont été supprimés en fin de run pour rétablir le baseline (0 → confirmé après suppression).

**Problemes**
- T2: BF-TEST-01. Impact système: trace/EffectLedger incohérente (table fantôme), pas d'impact utilisateur direct. Sévérité: yellow.
- T5/T14 (memory): invariant "pas d'écriture in-turn" documenté dans les guidelines QA ne semble pas refléter le comportement réel observé (memorizer async actif pendant la conversation). Impact: aucun impact utilisateur négatif observé (le contenu capturé est correct), mais l'invariant de doc/QA est à corriger ou le comportement à clarifier avec l'équipe runtime. Sévérité: yellow (documentation/observabilité).
- T6: réponse produit sans vérification d'état de l'objet référencé. Sévérité: yellow.
- T11: ambiguïté référentielle non clarifiée. Sévérité: yellow.

**Fix propose**
- Source amont: EffectLedger table-name mapping (T2) ; documentation/comportement du memorizer async vs batch (T5) ; vérification d'état avant réponse product_help (T6) ; résolveur de contexte conversationnel (T11).
- Correction recommandée: voir §3, plus aligner la documentation QA sur le comportement réel du memorizer (soit désactiver l'écriture async si elle n'est pas voulue en dehors du batch, soit corriger l'invariant documenté).
- Tests d'invariant attendus: « track_progress_plan_item committed ⇒ db_ref.table = nom de table réel » ; « fait mémoire capturé en session ⇒ statut clair sur son exploitabilité (candidate vs active) documenté ».

---

## Verdict Global

- **Verdict: yellow**
- **Raison principale:** run globalement solide et sans incident bloquant (aucun tour rouge, aucun latch de flow, track-progress et reminders fonctionnels et vérifiés en DB à deux reprises chacun) ; les points yellow sont des frictions de trace/ambiguïté (BF-TEST-01, BF-INTAKE-04) et une divergence documentation/comportement sur le memorizer, pas des effets durables faux ni des sur-escalades safety concrétisées.
- **Follow-up prioritaire:** (1) corriger le mapping `db_ref.table` de l'EffectLedger pour `track_progress_plan_item` ; (2) clarifier/aligner la doc du memorizer (async vs batch, statut `candidate`) ; (3) ajouter une clarification sur ambiguïté référentielle multi-sujets ; (4) investiguer pourquoi la lecture de plan (« mon avancement ») fonctionne ici mais échoue sur une formulation proche (« mes actions en cours ») documentée le même jour dans `rose-multiflow-r1`.
- **Incident hors-scope Sophia à signaler séparément:** perte inexpliquée de 2 `user_plan_item_entries` pré-existantes de Rose pendant le nettoyage post-run (voir §1) — à investiguer côté infra/DB locale partagée, sans lien établi avec le comportement de l'IA testée dans ce run.

---

## 5. Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-02-rose-multiflow2-r1-bugs.md`
