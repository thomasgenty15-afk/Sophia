# QA Run Report — Alex — Multiflow (coaching / presence / normal reply / rappel one-shot) — r1

## 1. Contexte Du Test

- Date: 2026-07-10 (horloge réelle serveur ~22:56 Europe/Paris)
- Run: `alex-multiflow-r1` (15 tours, scope `web`)
- Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`, `alex12@gmail.com`), connexion locale `tests/real-personas/alex/connection.json`
- Objectif: un run unique qui traverse volontairement les flows **coaching_recommendation**, **presence_conversation** et **normal_reply**, et qui place une **demande de rappel ponctuel (one-shot)**.
- Trajectoire: ouverture soir → coaching (mot de bascule) → rappel one-shot → bascule discussion de fond (presence) → pull explicite → retour coaching (ancre visuelle) → intention mémoire → recap du rappel → clôture.
- Surfaces visées: dispatcher / `response_owner`, router coaching_recommendation, presence flow (anti-push, offre sur pull, exit), direct effect `create_one_shot_reminder` + effet durable `scheduled_checkins`, projection recall/status d'un rappel, accusé memorizer.
- Cadre IA réel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, historique chargé depuis la DB à chaque tour, pas de fallback déterministe. JWT persona obtenu par `scripts/get-jwt.sh alex` et vérifié via `/auth/v1/user` (jamais affiché).
- Validité QA: **valide**. 15/15 tours `http 200`, `ok=true`, aucune réponse vide, aucun abort, chemin IA réel confirmé par les traces (`route_decision`, `skill_run`, `effect_ledger`).

## 2. Tours De Conversation

### Tour 1
**Verdict du tour:** green

**User**
> salut. encore scotché devant mon écran là et il est presque 23h... j'arrive pas à me décider à aller me coucher

**Sophia**
> Tu es encore scotché devant l'écran, à presque 23h, et c'est le démarrage du coucher qui coince. Je partirais sur une carte d'attaque, technique texte magique : une phrase courte pour couper l'hésitation et te remettre en route vers le lit. Si tu veux, je te propose cette phrase tout de suite pour ton cas.

**Trace courte**
- http_status: 200 / ok=true
- response_owner: `coaching_recommendation`
- reason_code / selected_handler: `coaching_recommendation_signal` / `coaching_recommendation`
- skill_run: `coaching_recommendation` status=continue
- safety: risk_band=none
- direct_effects / durable_effect: aucun (effect_counts=0)

_Note (non bloquant): coaching dès le T1 sur une simple procrastination de coucher. C'est une esquive de fenêtre de rupture → `texte magique` (mot de bascule) cohérent avec la charte (le user risque d'esquiver le coucher). Sophia **propose** la carte au lieu de la forcer → OK._

### Tour 2
**Verdict du tour:** green

**User**
> ok vas-y balance ta phrase, on verra bien

**Sophia**
> Prends : « Je coupe l'écran maintenant, juste pour lancer mon sas de coucher. »
> Elle est courte, elle casse l'hésitation et elle te remet sur le premier geste.

**Trace courte**
- response_owner: `coaching_recommendation` · reason `active_coaching_recommendation`
- skill_run: `coaching_recommendation` status=continue
- durable_effect: aucun (livraison conversationnelle du mot de bascule, pas d'opération écrite — attendu)
- La phrase est ancrée sur le plan actif d'Alex (« sas de coucher »).

### Tour 3
**Verdict du tour:** green

**User**
> haha ok c'est un peu bête dit comme ça mais pourquoi pas. je tente ce soir tiens

**Sophia**
> Haha, ça peut sonner un peu simple dit comme ça, mais justement: court = plus facile à lancer ce soir. Garde la phrase, lis-la une fois, puis enchaîne tout de suite avec le premier geste du sas de coucher.

**Trace courte**
- response_owner: `coaching_recommendation` · `active_coaching_recommendation`
- Ton juste, pas de re-question inutile, reste collé au plan. Flow coaching stable.

### Tour 4
**Verdict du tour:** green

**User**
> au fait tu peux me rappeler demain matin vers 8h de noter comment j'ai dormi? sinon j'y pense jamais

**Sophia**
> Oui — demain matin vers 8h, je te le rappellerai : noter comment tu as dormi.
> Et vu comment ça t'échappe facilement, c'est une bonne idée de le poser comme ça.

**Trace courte**
- response_owner: `normal_reply` · reason `direct_effects_then_normal_reply`
- direct_effects_to_run: `create_one_shot_reminder`
- turn_frame.direct_effects: explicitness=`explicit`, confidence=`high`, cardinality=`once`, `UTC_time=2026-07-11T06:00:00Z` (= 8h Paris), instruction=`noter comment j'ai dormi`
- effect_ledger: `one_shot_reminder.create` requested → allowed → **committed**
- durable_effect (vérifié DB): `scheduled_checkins` id `6536873c…`, status=`pending`, `scheduled_for=2026-07-11 06:00:00+00`, `event_context=one_shot_reminder:noter_comment_j_ai_dormi`
- **Effet durable correct et conforme à la demande.** Interruption du flow coaching par une nouvelle intention correctement gérée (pas de capture par le flow actif → pas de BF-ROUTE-02).

### Tour 5
**Verdict du tour:** green

**User**
> franchement le vrai souci c'est pas que le sommeil. mon cerveau s'arrête jamais, même en journée j'ai 40 trucs qui tournent en permanence. j'sais pas trop comment expliquer ça

**Sophia**
> Je vois le truc: ce n'est pas juste "je dors mal", c'est plutôt un fond continu où ton cerveau tourne sans pause […] Dit comme ça, ça ressemble moins à un problème de sommeil qu'à une saturation permanente. […] quand ça tourne, c'est plutôt des pensées en boucle, des listes de trucs à gérer, des scénarios, ou un mélange de tout ça ? 🙂

**Trace courte**
- response_owner: `presence_conversation` · reason `presence_conversation_entry`
- memory_plan: `supportive_presence`, memory_mode=broad, model_tier=deep
- **Entrée presence propre** sur une divulgation réflexive de fond, sans forcer une action.

### Tour 6
**Verdict du tour:** green

**User**
> un peu tout à la fois. mais surtout je rejoue des conversations dans ma tête, ou j'anticipe des trucs qui arriveront sûrement jamais. c'est épuisant en fait

**Sophia**
> Ça, oui, c'est vraiment épuisant. Tu décris deux boucles […] rejouer des conversations passées, et fabriquer à l'avance des scénarios […]. Pour ce soir, je ferais simple : quand une conversation se rejoue […] tu la nommes juste mentalement : "replay". Et quand tu anticipes un scénario, "fiction". […] Ça peut un peu desserrer l'étau 🙂

**Trace courte**
- response_owner: `presence_conversation` · `active_presence_conversation`
- durable_effect: aucun
- _Note fluidité (non bloquant): Sophia glisse une micro-technique (« replay/fiction ») sans pull explicite. Offre unique, légère, cadrée « pas pour te corriger » → tolérable, mais à surveiller vis-à-vis de l'anti-poussée structurelle du presence flow._

### Tour 7
**Verdict du tour:** green

**User**
> je sais pas trop d'où ça vient en vrai. j'ai l'impression d'avoir toujours été comme ça, même gamin j'étais celui qui réfléchissait trop. des fois je me demande si c'est juste ma nature

**Sophia**
> Peut-être qu'il y a une part de ça […]. Et en même temps, "c'est ma nature" ne veut pas forcément dire "c'est foutu" […]. Tu avais déjà ça comment, quand tu étais gamin — plutôt inquiétude, besoin de tout comprendre, peur de mal faire, ou autre chose ?

**Trace courte**
- response_owner: `presence_conversation` · `active_presence_conversation`
- **Presence tenu, aucun push cette fois**, écoute + question ouverte. Comportement anti-poussée conforme.

### Tour 8
**Verdict du tour:** green

**User**
> surtout la peur de décevoir je crois. à la maison fallait toujours être à la hauteur, performer. du coup je crois que j'ai jamais vraiment appris à juste... me poser sans rien faire

**Sophia**
> Ça éclaire beaucoup de choses […]. Du coup, ton cerveau n'a peut-être pas juste "trop réfléchi" par nature. Il a aussi appris très tôt qu'il fallait surveiller, anticiper […]. Et le plus dur, c'est souvent ça : même quand il n'y a plus personne en face pour exiger, la pression reste dedans. […] 💛

**Trace courte**
- response_owner: `presence_conversation` · `active_presence_conversation`
- memory_plan: `supportive_presence`, complexity=high
- Validation groundée (relie à ce qu'Alex vient de dire), pas de tendresse non groundée hors sujet, pas de push. green.

### Tour 9
**Verdict du tour:** green

**User**
> ok mais concrètement je fais quoi avec ça? parce que comprendre c'est bien mais là maintenant ça m'aide pas vraiment à dormir

**Sophia**
> Oui — là, il te faut du concret, pas une explication de plus. Fais juste ça, dans cet ordre : 1. Pose ton téléphone hors de portée. 2. Prends une feuille ou les notes du téléphone. 3. Écris 3 lignes max : "ce qui tourne", "ce que je ne peux pas régler ce soir", "ce que je reprendrai demain". 4. Puis choisis une seule phrase courte […] "pas ce soir, je repose le cerveau". 5. Ensuite tu reviens au lit sans relancer l'analyse. […]

**Trace courte**
- response_owner: `coaching_recommendation` · reason `coaching_recommendation_signal`
- skill_run: `coaching_recommendation` status=continue
- latency: ~42s (haut mais acceptable, tour non timeout)
- **Handoff presence → coaching correct sur pull explicite** (« concrètement je fais quoi »). L'offre concrète est groundée sur le plan (carnet/écrans/sas). green.

### Tour 10
**Verdict du tour:** green

**User**
> le carnet je l'ai déjà à côté du lit, c'est dans mon plan. le souci c'est que souvent j'oublie carrément de m'en servir, je fonce direct sous la couette avec le tel

**Sophia**
> Je partirais sur une carte d'attaque, technique ancre visuelle : ton blocage, c'est surtout l'oubli au moment du coucher, donc il te faut un repère visible qui te rappelle le carnet avant que le tel prenne la main. […] laissant le carnet bien en évidence sur l'oreiller ou sur la table de nuit.

**Trace courte**
- response_owner: `coaching_recommendation` · `active_coaching_recommendation`
- **Sélection de technique cohérente**: problème d'oubli/environnement → `ancre visuelle` (pas de forçage du mot de bascule). Conforme à la charte operation-suggestions (repérage/régulation ≠ mot de bascule). green.

### Tour 11
**Verdict du tour:** green

**User**
> garde un truc en tête pour la suite: le soir c'est surtout les replays de conversations qui me bloquent, beaucoup plus que les listes de tâches. c'est ça mon vrai point faible

**Sophia**
> Bien noté : ton vrai point faible le soir, ce sont les replays de conversations, pas les tâches. Je le garde en tête pour la suite — et pour ce type de boucle, le levier le plus juste sera plutôt une carte de défense qu'une carte pour démarrer […].

**Trace courte**
- response_owner: `coaching_recommendation` · `active_coaching_recommendation`
- memory_plan: memory_mode=`none` (pas de write in-turn — attendu)
- **Accusé de mémorisation correct** sur un fait personnel (« bien noté … je le garde en tête »), sans claim de persistance in-turn. Conforme à la doctrine memorizer nocturne. green.

### Tour 12
**Verdict du tour:** yellow

**Famille de bugs:** BF-STATUS-01 — Projection DB mal lue (status projection)

**User**
> ok merci. au fait le rappel de demain tu me l'as mis à quelle heure déjà?

**Sophia**
> Ce que tu as là, c'est un rappel récurrent "Ce soir, on redescend juste un cran.", et il est réglé à 09:00.
> Si tu parles d'un autre rappel de demain, je n'ai pas son horaire sous les yeux ici.

**Trace courte**
- response_owner: `normal_reply` · reason `normal_reply_default`
- skill_run: `coaching_recommendation` status=**exit** (sortie de flow propre)
- memory_plan intent: `answer_recap_question_about_existing_reminder`
- durable_effect: aucun
- **Exit de flow correct**, mais **recall faux**: Sophia remonte un rappel **récurrent** (09:00 Paris = 07:00Z, pré-existant) et **ignore le one-shot 8h qu'elle vient de créer au T4** (2026-07-11 06:00Z), en niant connaître « un autre rappel de demain ».

**Analyse yellow**
- Symptôme: la projection de recap sur les rappels lit les rappels récurrents mais **pas** le rappel ponctuel créé en session, et affirme ne pas l'avoir « sous les yeux ».
- Source amont probable: la projection status/recap des rappels ne couvre pas les `scheduled_checkins` de type `one_shot_reminder` (elle ne lit que la surface récurrente). Coverage gap de la projection, pas un problème de routage (owner `normal_reply` correct).
- Owner runtime: status/recap projection (lecture DB des rappels).
- Meilleure correction (amont): élargir la source de la projection de recap pour inclure les `scheduled_checkins` `origin=rendez_vous / event_context one_shot_reminder:*` pending, en plus des rappels récurrents ; renvoyer les deux surfaces unifiées à l'assembleur de réponse. Pas une regex sur le texte : c'est le périmètre de requête de la projection qui est incomplet.
- Pourquoi pas un patch local: un patch de phrase masquerait le trou de couverture. Le fix doit être dans le contrat de projection des rappels (union récurrent + one-shot) pour que toute réponse (recap, status, confirmation) parte des mêmes faits DB.

### Tour 13
**Verdict du tour:** yellow

**Famille de bugs:** BF-STATUS-01 — Projection DB mal lue (status projection)

**User**
> non je parle de celui que je viens de te demander là, noter comment j'ai dormi, tu m'as dit demain matin 8h. il est bien programmé au moins?

**Sophia**
> Je peux pas te confirmer qu'il est bien programmé depuis ici. Je vois seulement l'intention dont tu parles, pas une preuve d'exécution.
> Si tu veux, je peux t'aider à vérifier quoi regarder pour voir en 10 secondes s'il est bien à demain matin 8h.

**Trace courte**
- response_owner: `normal_reply` · reason `normal_reply_default`
- memory_plan intent: `status_check_on_recent_reminder`
- durable_effect: aucun
- **Contradiction avec le T4**: le rappel EST committé en DB (`scheduled_checkins` pending 06:00Z, vérifié). La projection status répond « je ne vois que l'intention, pas une preuve d'exécution » alors que l'effet durable existe bel et bien.

**Analyse yellow**
- Symptôme: sur une demande de confirmation ciblée d'un effet durable réel et récent, la projection ne retrouve pas l'objet et le dégrade en simple « intention ».
- Source amont probable: même gap qu'au T12 — la projection status des rappels n'interroge pas la table `scheduled_checkins` (one-shot), donc elle ne peut pas confirmer un rappel pourtant committé dans le même tour-source que la confirmation initiale.
- Owner runtime: status/recap projection des rappels.
- Meilleure correction: même fix qu'au T12 (union de la source de vérité des rappels). Invariant à ajouter: « après un `one_shot_reminder.create` committed, une demande de confirmation du même rappel dans la même session doit le retrouver et confirmer heure/instruction ».
- Pourquoi pas un patch local: c'est structurel (source de vérité incomplète), pas une reformulation.

### Tour 14
**Verdict du tour:** yellow

**Famille de bugs:** BF-STATUS-01 — Projection DB mal lue (status projection)

**User**
> ah ok c'est un peu bizarre parce que tu venais de me dire que c'était bon. bon tant pis, j'espère que je le recevrai. je vais essayer de dormir là

**Sophia**
> Oui, je t'ai répondu trop affirmativement tout à l'heure — là, je ne peux pas le confirmer depuis ici.
> Pose juste ça de côté et va dormir. Le reste attendra demain 😴

**Trace courte**
- response_owner: `normal_reply` · reason `normal_reply_default`
- **Récupération honnête** (Sophia reconnaît la contradiction) et clôture douce, adaptée au coucher. Mais elle **réaffirme ne pas pouvoir confirmer** un rappel pourtant réel → le symptôme BF-STATUS-01 persiste et laisse le user dans le doute sur son propre rappel.
- Sévérité: friction UX modérée (la conversation reste polie et honnête, mais le fait durable correct n'est jamais confirmé au user).

### Tour 15
**Verdict du tour:** green

**User**
> ouais t'as raison. merci d'avoir écouté, ça fait du bien de poser tout ça. bonne nuit

**Sophia**
> Bonne nuit 🌙
> Prends soin de toi, et repose-toi bien.

**Trace courte**
- response_owner: `normal_reply` · reason `normal_reply_default`
- Clôture naturelle, brève, adaptée. green.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Transitions de registre très naturelles: coaching bref (T1–T3) → gestion factuelle du rappel (T4) → glissement en discussion de fond (T5–T8) → retour au concret sur pull (T9–T10). Aucun effet « robot de test ».
- Le presence flow (T5–T8) est humain et non intrusif: écoute, reformulation groundée, questions ouvertes, validation reliée à ce qu'Alex dit (pas de tendresse plaquée).
- Ancrage constant sur le plan réel d'Alex (sas de coucher, carnet, coupure écran) sans réinventer le plan.
- Sélection de technique cohérente avec la nature de l'action (mot de bascule pour l'esquive du coucher T1, ancre visuelle pour l'oubli/environnement T10).
- Récupération honnête au T14 (« je t'ai répondu trop affirmativement »).

**Problèmes**
- Tour 12–14: Sophia ne confirme jamais au user le rappel qu'elle a pourtant bien créé, et se contredit (T4 « c'est bon » vs T13/T14 « je ne peux pas confirmer »). Famille: BF-STATUS-01. Impact: le user repart en doutant que son rappel existe. Sévérité: yellow.
- Tour 6 (mineur): micro-technique non sollicitée en plein presence flow. Famille: n/a (offre unique, légère, cadrée). Impact: très faible; à surveiller côté anti-poussée. Sévérité: green.

**Fix proposé**
- Source amont: projection status/recap des rappels (source de vérité incomplète, cf. §4).
- Correction recommandée: unifier la source des rappels (récurrents + one-shot `scheduled_checkins`) pour toute réponse de recap/confirmation, afin que la confirmation initiale (T4) et le recap (T12–T14) partent des mêmes faits.
- Tests d'invariant attendus: après un `one_shot_reminder.create` committed, une question « il est bien programmé / à quelle heure » dans la même session retourne l'heure locale exacte et l'instruction, sans dégrader en « intention ».

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- Dispatcher / `response_owner` corrects sur toute la trajectoire: `coaching_recommendation` (T1–T3, T9–T11), `presence_conversation` (T5–T8), `normal_reply` (T4, T12–T15).
- T4: nouvelle intention (rappel) correctement extraite pendant un flow coaching actif → `direct_effects_then_normal_reply`, sans capture par le flow (pas de BF-ROUTE-02).
- T9: handoff `presence → coaching` sur pull explicite → conforme au design presence (« offre sur pull »).
- T12: sortie de flow propre (`skill_run status=exit`) sur changement de sujet → exit via dispatcher global OK.

**Skills / Operations / Tools**
- coaching_recommendation: livraison conversationnelle (mot de bascule T2, protocole anti-rumination T9, ancre visuelle T10) sans écrire d'opération engageante (effect_counts=0) — attendu pour la recommandation.
- Sélection de technique cohérente avec la nature de l'action (pas de forçage par mot-clé).
- `create_one_shot_reminder` (T4): explicit / high confidence / cardinality once, payload horaire (06:00Z = 8h Paris) et instruction corrects.

**Memory / Effets durables**
- Effet durable rappel (T4): `scheduled_checkins` committed, correct, vérifié en DB, puis supprimé en fin de run (reset).
- Intention mémoire (T11): accusé in-turn correct, `memory_mode=none` (pas de write in-turn) — conforme à la doctrine memorizer nocturne.
- Memorizer nocturne: `trigger-memorizer-daily` déclenché en fin de run pour vérifier la persistance → **échec batch `HTTP 500`** : FK `memory_message_processing_message_id_fkey` sur `message_id=ee65adbf…` absent de `chat_messages` (message non lié à Alex; 0 nouveau `memory_item` pour Alex). **Incident d'environnement** (donnée stale locale), pas un bug produit du run; la persistance mémoire d'Alex n'a donc pas pu être vérifiée cette fois.

**Problèmes**
- Tour 12–14: la projection status/recap des rappels ne couvre pas les rappels one-shot (`scheduled_checkins`), remonte un récurrent à la place et ne peut pas confirmer un effet pourtant committé. Famille: BF-STATUS-01. Impact système: recall/confirmation faux sur un effet durable réel. Sévérité: yellow.
- Environnement: batch memorizer cassé sur donnée stale (FK). Impact: vérification mémoire impossible. Sévérité: yellow (env, hors produit).

**Fix proposé**
- Source amont: contrat de projection des rappels (source de vérité).
- Correction recommandée: union `user_recurring_reminders` + `scheduled_checkins` (pending, `event_context one_shot_reminder:*`) dans la projection consommée par recap/status/confirmation; renvoyer heure locale + instruction.
- Tests d'invariant attendus:
  - `one_shot committed` puis recap même session ⇒ heure locale + instruction exactes;
  - recap « mes rappels de demain » ⇒ liste récurrents ET one-shot du jour cible;
  - jamais de « je ne vois que l'intention » quand un `effect_ledger` du même thread a un `one_shot_reminder.create=committed`.

## Verdict Global

- Verdict: **yellow**
- Raison principale: routage, presence flow, sélection de technique et effet durable du rappel sont tous corrects; mais la projection recall/status ne retrouve pas le rappel one-shot créé en session (T12–T14, BF-STATUS-01), laissant le user dans le doute sur un effet pourtant committé.
- Follow-up prioritaire: unifier la source de vérité des rappels (récurrents + one-shot) dans la projection recap/status/confirmation. Secondaire (env): réparer le batch memorizer local (FK message stale) pour permettre la vérif mémoire.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-10-alex-multiflow-r1-bugs.md`
