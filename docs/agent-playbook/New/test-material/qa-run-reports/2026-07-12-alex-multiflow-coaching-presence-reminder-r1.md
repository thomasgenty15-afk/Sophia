# QA Run — Alex multiflow (coaching / presence / normal + one-shot reminder) — r1

## 1. Contexte Du Test

- Date: 2026-07-12
- Run: `alex-multiflow15-r1` (scénario 15.1)
- Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`, `alex12@gmail.com`), connexion locale `tests/real-personas/alex/connection.json`, plan actif « Retrouver un sommeil réparateur » (carnet de décharge, sas de coucher, couper les écrans).
- Objectif: run conversationnel de 15 tours traversant **coaching recommendation**, **presence**, **normal reply**, avec un **rappel ponctuel (one-shot reminder)** demandé explicitement.
- Trajectoire testée: ouverture normale → mécanisme du coucher → recommandation coaching (carte d'attaque, phrase) → **pivot émotionnel → présence** → **demande de rappel pendant la présence** → vérif statut rappel → re-demande hors flow → question produit → carte de défense (moment de craquage) → préférence de style durable → intention mémoire → présence → clôture.
- Surfaces visées: dispatcher / `response_owner`, active-flow arbitration (coaching ↔ presence), sortie présence (`tool_pull`), tool-skill `create_one_shot_reminder` + `one_shot_reminder_status`, effet durable `scheduled_checkins`, préférence de style session (`BF-PREF-01`), intention mémoire (memorizer nocturne).
- Cadre IA réel: local, Supabase local, `POST /functions/v1/test-send-message` avec `force_full_ai=true`, `client_now_iso` réel, `client_timezone=Europe/Paris`. History pilotée explicitement par tour (chaque message user choisi après lecture de la réponse + trace courte). Aucun renderer déterministe, aucun fallback `processMessage`.
- Incident environnement: pendant le run, **plusieurs runs QA concurrents** tournaient sur le même Supabase local (scopes `qa-rose-multiflow-2026-07-12-r1`, `qa-rose-diag*`, users tiers), plus les crons minute. `scheduled_checkins` très volatil (lignes tierces apparaissant/disparaissant en cours de lecture). Les vérifications s'appuient donc sur les **lectures live par tour, isolées par `user_id`** (fiables), pas sur un état DB global reconstruit. L'état d'Alex a été **remis au baseline exact** en fin de run (voir §4). Aucun `trigger-memorizer-daily` déclenché par le run.
- Validité QA: **valide** — 15 tours réels via le chemin IA local, traces par tour, vérifs DB par `user_id`.

## 2. Tours De Conversation

### Tour 1
**Verdict du tour:** green

**User**
> salut, journée un peu chargée là. jpense encore trop au taf le soir franchement

**Sophia**
> Ça te suit encore le soir, et avec une journée chargée c'est logique que ça déborde un peu. Le plus utile là, c'est de ne pas essayer de "couper" d'un coup, mais de faire redescendre la pression d'un cran. 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason: `normal_reply_default`
- direct_effects: [] · durable_effect: aucun

---

### Tour 2
**Verdict du tour:** green

**User**
> ouais c'est surtout au moment de me coucher, mon cerveau se met a lister tout ce que j'ai a faire demain et j'ai peur d'oublier un truc important. du coup je dors pas

**Sophia**
> Tu décris surtout le moment où la tête s'emballe au coucher, avec la peur d'oublier. Je partirais sur une carte d'attaque, technique texte magique : une phrase courte pour couper la boucle mentale et te remettre sur le geste de décharge avant de dormir.
> Si tu veux, je peux t'aider à formuler cette phrase pour ton cas.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason: `coaching_recommendation_signal`
- skill_run: `selected_skill_id=coaching_recommendation`, `status=continue` · durable_effect: aucun (recommandation)

**Note:** technique cohérente avec la nature du moment (fenêtre de rupture mentale au coucher → phrase-bascule courte), ancrée sur le carnet de décharge du plan actif.

---

### Tour 3
**Verdict du tour:** green

**User**
> ok vas y aide moi a trouver la phrase. genre un truc qui me rassure que jvais pas oublier

**Sophia**
> Tu peux partir sur : « Je n'ai pas besoin de tout retenir maintenant, juste de le déposer pour demain. »
> Et si tu veux une version un peu plus rassurante : « Si c'est important, je le retrouverai demain; là, je vide juste ma tête pour dormir. »

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason: `active_coaching_recommendation`
- durable_effect: aucun. Phrase reliée au carnet de décharge (déposer pour demain) — grounding plan correct.

---

### Tour 4
**Verdict du tour:** green

**User**
> merci... en vrai jsais meme pas pourquoi je me mets autant la pression. c'est comme si j'avais toujours peur de pas en faire assez, depuis tout petit. ça me fatigue cette course

**Sophia**
> Ça a l'air très ancien chez toi: cette pression de "pas assez", la peur de ne pas en faire assez, et cette course qui te fatigue maintenant pour de vrai. […] Tu te souviens de quand tu as commencé à sentir que tu devais toujours en faire plus ?

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason: `presence_conversation_entry`
- durable_effect: aucun. Entrée présence naturelle sur dépôt discursif de fond (pas de poussée d'action, écoute + question ouverte).

---

### Tour 5
**Verdict du tour:** green

**User**
> jsais pas trop... au college jcrois. mes parents attendaient bcp de moi, fallait toujours ramener des bonnes notes. jme suis jamais senti tranquille en fait

**Sophia**
> Ce que tu racontes là éclaire vraiment le reste. […] ton cerveau reste en mode surveillance, comme si tu devais toujours prouver quelque chose […] "Si je me sens en alerte, ce n'est pas parce qu'il y a vraiment danger. C'est un vieux réflexe. Je peux le remercier et redescendre." Rien que ça, c'est plus doux que de te traiter comme si tu étais cassé. 💛

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason: `active_presence_conversation`
- durable_effect: aucun. Présence tenue, réponse chaude, non prescriptive. (Longueur élevée mais conforme au registre présence.)

---

### Tour 6
**Verdict du tour:** red

**Famille de bugs:** `BF-LEDGER-01` — Claim sans commit (mécanisme `BF-EFFECT-02` — effet attendu absent via le chemin sortie-de-flow)

**User**
> ouais ça me parle. au fait tu peux me rappeler ce soir à 22h30 de préparer mon carnet avant de me coucher ? sinon jvais zapper c'est sur

**Sophia**
> Oui — ce soir à 22h30, je te le rappellerai pour préparer ton carnet avant de te coucher. Et pour le reste, ce que tu décrivais colle bien avec une pression ancienne qui t'épuise.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason: `direct_effects_then_normal_reply`
- log runtime: `[presence] transition=exit kind=tool_pull exit_reason=tool_pull` → `exit_reroute owner=normal_reply reason=direct_effects_then_normal_reply`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- tool_skill_run: `create_one_shot_reminder`, `status=success`, `committed_effects=[{id:4c2ef032-…, scheduled_for:2026-07-12T20:30:00Z, instruction:"préparer mon carnet avant de me coucher"}]`, `blocked_effects=[]`
- **durable_effect: AUCUN** — `scheduled_checkins` pour Alex: recherche par `id=4c2ef032…` = 0 ligne (psql superuser + PostgREST service-role), par `event_context like 'one_shot_reminder:%'` = 0 ligne Alex, count Alex inchangé (14). Aucun log `one_shot_reminder_insert_failed`.

**Analyse (red)**
- Symptôme: le rappel est demandé pendant une **présence active**; le dispatcher sort correctement la présence (`kind=tool_pull`) et re-route vers `normal_reply` avec le direct-effect `create_one_shot_reminder`. L'executor renvoie un `committed_effects` **avec un id** et `status=success`, et le user reçoit une **confirmation** (« je te le rappellerai ce soir à 22h30 »). Pourtant **aucune ligne n'est persistée** en base. « c'est programmé » sans effet DB.
- Preuve que ce n'est PAS l'incident environnement: A/B contrôlé dans le **même** environnement concurrent — un rappel demandé en contexte `normal_reply` **pur** (probe isolé scope `diag`, `id=8760d754…`) est **persisté et vérifiable par id immédiatement** (count 14→15). Le rappel du T6 (chemin sortie-de-présence) n'est jamais trouvable. Reproduit une 2e fois via le T8 hors flow (persiste, cf. T8). Le différenciateur est le **chemin d'exécution du direct-effect après sortie de flow local**, pas la concurrence.
- Source amont probable: `sophia-brain/router/run.ts` — bloc sortie présence (~L1121-1140: `presenceExited`, re-dispatch synchrone) + exécution du direct-effect lane après reroute (pré-loop `runOperationRuntimePipeline` ~L1283 et/ou ré-exec `reminderDirectEffectReexecuted` ~L1325-1365). Sur ce chemin, un `committed_effects.id` est produit sans upsert `scheduled_checkins` réellement landé (commit fantôme), et le garde final « claim sans commit » ne peut pas le rattraper puisque le ledger porte un id « committed ».
- Owner runtime: router direct-effect lane / effect ledger (final response guard).
- Meilleure correction selon les guidelines: rendre la persistance du rappel **transactionnellement liée** au commit visible sur le chemin de sortie de flow (le committed_effects ne doit être émis que si l'upsert a réellement retourné une ligne persistée du **même** chemin d'écriture); et faire échouer/relancer honnêtement (`insert_failed`) plutôt que de renvoyer un id fantôme. Invariant: `committed_effects` pour `create_one_shot_reminder` ⇒ ligne `scheduled_checkins` lisible par `id` immédiatement après le tour, quel que soit le flow qui sortait.
- Pourquoi ce n'est pas un patch local: c'est la **cohérence ledger↔writer sur le chemin sortie-de-flow**, pas une phrase ni une regex. Un garde de phrase masquerait le trou sans créer le rappel.
- Cross-ref: `2026-07-12-eva-multiflow-coaching-presence-reminder-r1.md` a observé le même « rappel committed puis ligne disparue » (T6, `2e7e8755…`) mais l'a classé **incident environnement**. Le présent A/B contrôlé suggère que c'est le **même bug produit sous-diagnostiqué** (rappel demandé pendant un flow local actif → non persisté).

---

### Tour 7
**Verdict du tour:** yellow

**Famille de bugs:** `BF-STATUS-02` — Historique/rendu de statut incohérent (symptôme aval du commit fantôme T6)

**User**
> c'est bien programmé pour ce soir du coup ? jveux etre sur

**Sophia**
> Oui, pour ce soir à 22h30 : aucun rappel ponctuel n'est en attente en ce moment.
> Et je te rassure au passage, ton besoin de sécurité est cohérent avec ce que tu disais, surtout si tu as peur d'oublier.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply`
- tool_skill_run: `one_shot_reminder_status`, `status=success`, `reason=status_report`, `committed_effects=[{type:one_shot_reminder_status, pending_count:0, pending_labels:[]}]`
- durable_effect DB confirmé: `pending_oneshot=0` pour Alex.

**Analyse (yellow)**
- Symptôme: la **projection est correcte** (`pending_count=0` — cohérent avec l'échec de persistance du T6), mais le **rendu visible est auto-contradictoire**: « Oui, pour ce soir à 22h30 » (lu comme une confirmation) immédiatement suivi de « aucun rappel ponctuel n'est en attente ». Le composeur réconcilie mal l'historique (confirmation fantôme du T6) et le statut réel.
- Source amont probable: renderer du status one-shot (final response pipeline) réutilisant la formulation d'engagement de l'historique T6 malgré `pending_count=0`. Racine = pollution d'historique par le commit fantôme du T6.
- Owner runtime: status renderer / final response pipeline.
- Meilleure correction: quand `pending_count=0`, le rendu de statut ne doit pas ré-affirmer un horaire issu de l'historique; formulation univoque (« il n'y a aucun rappel en attente pour ce soir »). Corrige surtout la cause amont (T6): sans commit fantôme, l'historique ne contient pas de confirmation à réconcilier.
- Pourquoi ce n'est pas un patch local: la contradiction est le symptôme du trou ledger du T6; patcher la phrase laisserait le rappel toujours absent.

---

### Tour 8
**Verdict du tour:** yellow

**Famille de bugs:** `BF-LEDGER-02` — Commit réel mal rendu

**User**
> ah bon?? bon bah reprogramme le alors. ce soir 22h30, rappelle moi de préparer mon carnet stp

**Sophia**
> C'est déjà prévu pour ce soir à 22h30 : préparer ton carnet.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason: `direct_effects_then_normal_reply`
- tool_skill_run: `create_one_shot_reminder`, `status=success`, `reason=payload`, `committed_effects=[{id:adf444e7-…, scheduled_for:2026-07-12T20:30:00Z, instruction:"préparer mon carnet"}]`
- **durable_effect: OK** — ligne `scheduled_checkins` `adf444e7…` `pending`, `2026-07-12 20:30:00+00`, instruction « préparer mon carnet » (count Alex 14→15). Heure locale 22:30 Paris correcte.

**Analyse (yellow)**
- Symptôme: la création hors flow **persiste correctement** (contraste net avec T6). Mais le rendu dit « C'est **déjà** prévu » alors que c'est une **création fraîche** (`reason_code=payload`, aucune ligne préexistante — le T6 n'avait rien laissé). Formulation trompeuse (laisse croire à une reconfirmation d'un rappel qui existait déjà).
- Source amont probable: composeur influencé par l'historique (T6 « je te le rappellerai » + T7) → « déjà prévu » au lieu de « c'est noté / je te le rappellerai ».
- Owner runtime: renderer create one-shot / final response pipeline.
- Meilleure correction: le rendu de création doit refléter le `reason_code` du committed (`payload` = création fraîche → « c'est noté / je te le rappellerai », pas « déjà prévu »). Découpler le rendu de l'historique conversationnel. Même cause racine amont que T7 (pollution d'historique par T6).
- Pourquoi ce n'est pas un patch local: c'est la fidélité rendu↔commit (LEDGER-02), pas une correction de phrase isolée.

---

### Tour 9
**Verdict du tour:** green

**User**
> ok cool merci. jdois écrire quoi dans le carnet exactement ? tout ce qui me passe par la tete ou juste les trucs du taf

**Sophia**
> Le plus utile, c'est pas tout ce qui te passe par la tête. Mets surtout ce qui te libère avant de dormir : les trucs du taf qui tournent encore, les idées à ne pas oublier, et les petites inquiétudes qui reviennent. Le reste, tu peux le laisser de côté 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason: `normal_reply_default` · durable_effect: aucun. Réponse pratique ancrée sur le carnet.

---

### Tour 10
**Verdict du tour:** green

**User**
> le vrai souci c'est qu'une fois couché je rallume mon tel pour verifier un dernier truc et la je scroll 1h sans m'en rendre compte. c'est ça qui me tue

**Sophia**
> Oui, c'est bien là le piège : tu te couches, tu reprends le téléphone pour "un dernier truc", puis ça part en scroll automatique. Ici, le bon levier, c'est une carte de défense pour protéger ce moment exact et te remettre sur les rails en moins de 30 secondes.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason: `coaching_recommendation_signal`
- durable_effect: aucun. Technique cohérente: **carte de défense** sur le moment précis de craquage (reprise du téléphone) — conforme aux guidelines opérations (identifier le moment où ça craque + le piège concret).

---

### Tour 11
**Verdict du tour:** green

**User**
> ouais vas y crée moi cette carte de défense

**Sophia**
> Je ne vais pas la créer depuis le chat. Depuis **Dashboard > Plan**, ouvre l'action **Couper les écrans 30 min avant le lit** puis lance la préparation de la **carte de défense**. L'idée ici, c'est de protéger le moment où tu reprends le téléphone après t'être couché : le **moment critique**, le **piège observable**, un **geste de retour en moins de 30 secondes** et un **plan B simple**.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason: `active_coaching_recommendation`
- durable_effect: aucun (correct). Aucun executor appelé depuis le chat — matérialisation renvoyée au produit, ancrée sur l'action plan « couper les écrans ». Conforme à la doctrine architecture.

---

### Tour 12
**Verdict du tour:** yellow

**Famille de bugs:** `BF-PREF-01` — Préférence non appliquée / promesse de persistance

**User**
> franchement le soir j'aimerais que tu sois plus courte dans tes messages, les gros pavés quand jsuis crevé ça me gave. tu peux retenir ça pour toujours ?

**Sophia**
> Oui, je retiens : le soir, je te répondrai plus court. ✅

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason: `normal_reply_default`
- memory_write_candidates: null · `temp_memory.web` **ne porte pas** `__session_style_commitments` après le tour.

**Analyse (yellow)**
- Symptôme: application immédiate en session **partielle** (le message EST court, tenu au T13), mais la réponse **promet une persistance** (« Oui, je retiens » en réponse à « pour toujours ») **sans** les deux autres volets attendus (arbitrage BF-PREF-01): (2) honnêteté « le réglage durable ne se fait pas encore depuis le chat, ça arrive plus tard », (3) renvoi vers Préférences coach. Et **aucune contrainte de style session n'est installée** (`__session_style_commitments` absent) → le style n'est pas tenu à travers les flows (cf. T14).
- Source amont probable: preference runtime policy — pas d'écriture d'un engagement de style session à partir du chat, et pas de gabarit de réponse « application + honnêteté + renvoi ».
- Owner runtime: preference runtime policy / composeur.
- Meilleure correction: sur une préférence de ton/style durable exprimée en chat → installer un `__session_style_commitments` (tenu en session, y compris par presence/coaching), + réponse en trois volets (applique / honnêteté durabilité / renvoi Préférences). Pas d'écriture `user_relation_preferences` (won't-fix acté), mais pas de promesse « pour toujours » nue.
- Pourquoi ce n'est pas un patch local: c'est la politique préférence + l'installation d'un engagement session lu par tous les composeurs, pas une phrase.

---

### Tour 13
**Verdict du tour:** green

**User**
> ah et retiens un truc: le matin ça va moi, je suis plutot carré. c'est vraiment le soir mon point faible

**Sophia**
> C'est noté : le matin ça va, et c'est surtout le soir que tu décroches. Ça colle bien avec ce que tu m'as déjà décrit 🌙

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · memory_write_candidates: null (attendu — écriture portée par le memorizer nocturne, pas in-turn).
- durable_effect: aucun in-turn (conforme). Accusé « c'est noté » = comportement attendu sur intention mémoire (fait personnel). Style resté bref (préférence T12 tenue ici).

---

### Tour 14
**Verdict du tour:** yellow

**Famille de bugs:** `BF-PREF-01` — Style session non tenu par le flow présence

**User**
> merci en tout cas... ça fait du bien de poser tout ça. j'ai l'impression de mieux comprendre pourquoi je suis comme ça le soir

**Sophia**
> Ça me fait plaisir que ça te fasse du bien. Là, tu viens de faire un truc important : tu as posé les choses, tu as mis le doigt sur le fait que le soir ce n'est pas "toi en général", c'est vraiment un moment où tu es plus fragile, plus vidé, moins carré. Et rien que voir ça clairement, ça change déjà la manière de te regarder. Quand tu dis "je comprends mieux pourquoi je suis comme ça le soir", c'est quoi le "pourquoi" que tu vois le plus nettement maintenant ?

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason: `presence_conversation_entry`
- durable_effect: aucun. Routage présence correct (ré-entrée sur dépôt réflexif).

**Analyse (yellow)**
- Symptôme: **routage bon** (présence ré-entrée), mais la réponse est un **long pavé** en soirée (~20h Paris) alors qu'Alex a explicitement demandé au T12 des messages courts le soir. La préférence de style **n'est pas tenue** par le composeur présence (cohérent avec l'absence de `__session_style_commitments`).
- Source amont probable: composeur présence n'applique pas l'engagement de style session (même cause que T12: aucun engagement installé/lisible).
- Owner runtime: preference runtime policy + presence composer.
- Meilleure correction: un engagement de style session (T12) doit être lu et appliqué par **tous** les composeurs (normal, coaching, presence, safety selon règle). Invariant: après « sois plus court le soir », un tour présence en soirée reste bref.
- Pourquoi ce n'est pas un patch local: c'est la propagation transverse de la contrainte de style, pas une troncature ad hoc.

---

### Tour 15
**Verdict du tour:** green

**User**
> je crois que c'est la peur de décevoir en fait. bon jvais aller préparer mon carnet, merci pour ce soir

**Sophia**
> Oui, ça ressemble bien à ça : la peur de décevoir, surtout le soir, peut prendre toute la place. Va préparer ton carnet tranquillement, et garde ça simple ce soir.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason: `normal_reply_default`
- durable_effect: aucun. Sortie de présence propre (closure), réponse brève + ancrée sur l'action carnet. Aucun `__active_skill_state` résiduel post-run (présence bien refermée).

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Ouverture et handoffs naturels: normal → coaching (T2) → présence (T4) → retour action → coaching défense (T10) → présence (T14) → clôture (T15). Les bascules soutien émotionnel ↔ action concrète sont fluides et non mécaniques.
- Présence chaleureuse, non prescriptive, question ouverte au bon moment; sortie de présence douce (T15).
- Coaching bien ciblé: carte d'attaque (phrase-bascule) sur la boucle mentale (T2-3), carte de défense sur le moment de craquage téléphone (T10), renvoi produit propre (T11). Techniques cohérentes avec la nature des moments.
- Accusé mémoire sobre et correct (T13).

**Problèmes**
- Tour 6→7→8: **cluster de confusion rappel**. « je te le rappellerai ce soir à 22h30 » (T6) → « aucun rappel n'est en attente » (T7, phrase auto-contradictoire) → « c'est déjà prévu » (T8, création fraîche présentée comme préexistante). Famille: `BF-LEDGER-01` (T6) / `BF-STATUS-02` (T7) / `BF-LEDGER-02` (T8). Impact: érode la confiance sur une fonction critique (rappel du soir dont Alex dit qu'il « va zapper c'est sûr »). Sévérité: red (le T6 laisse le user croire à un rappel inexistant).
- Tour 14: **verbosité** en soirée malgré la demande explicite de brièveté (T12). Famille: `BF-PREF-01`. Impact: la préférence exprimée n'est pas respectée là où elle compte le plus (soir, fatigue). Sévérité: yellow.
- Tour 12: réponse « je retiens pour toujours » sans honnêteté sur la non-persistance durable ni renvoi Préférences. Famille: `BF-PREF-01`. Sévérité: yellow.

**Fix proposé**
- Source amont: (a) cohérence ledger↔writer du rappel sur le chemin sortie-de-flow (T6, racine du cluster T6-T8); (b) engagement de style session installé + lu par tous les composeurs (T12/T14).
- Correction recommandée: `committed_effects(create_one_shot_reminder)` ⇒ ligne DB garantie; sinon `insert_failed` honnête. Rendu de création/statut fidèle au `reason_code` et au `pending_count`, découplé de l'historique.
- Tests d'invariant attendus: rappel demandé pendant présence/coaching actif → ligne `scheduled_checkins` lisible par `id` juste après le tour; statut `pending_count=0` → aucun rendu affirmant un horaire; préférence « plus court le soir » → tour présence soir bref.

## 4. Analyse Système

**Verdict: red**

**Routage**
- Dispatcher / `response_owner` corrects et variés: `normal_reply` (T1, T9, T12, T13, T15), `coaching_recommendation` (T2, T3, T10, T11), `presence_conversation` (T4, T5, T14). Les **trois flows ciblés atteints**, plus la demande de rappel. Entrée/sortie présence propres (`presence_conversation_entry`, `active_presence_conversation`, sortie `tool_pull` au T6, closure au T15). Le rappel demandé pendant présence n'est PAS avalé par le flow (sortie correcte + reroute direct-effect) — pas de `BF-ROUTE-02` ici.

**Skills / Operations / Tools**
- `coaching_recommendation`: techniques adaptées à la nature du moment (attaque/phrase vs défense/moment de craquage), grounding plan actif, aucun executor appelé depuis le chat (matérialisation carte renvoyée au produit, T11). Conforme.
- `create_one_shot_reminder`: **T6 = échec durable** (committed id + confirmation, mais 0 ligne DB) ; **T8 = succès durable** (`adf444e7…`, heure locale 22:30 Paris correcte, instruction propre). Le différenciateur est le **chemin d'exécution** (sortie de flow local vs contexte plain), pas la concurrence — prouvé par A/B contrôlé (probe plain `diag` persisté, cf. §2 T6).
- `one_shot_reminder_status` (T7): lecture correcte (`pending_count=0`) mais rendu contradictoire.

**Memory / Effets durables**
- Intention mémoire (T13): accusé correct, aucune écriture in-turn (memorizer nocturne). `memory_items` inchangé (48) — conforme.
- Préférence de style (T12): aucune écriture `user_relation_preferences` (won't-fix acté, correct) mais **aucun engagement session** installé non plus → style non tenu (T14).
- Effet durable observé vs intention: **divergence critique au T6** (rappel demandé et confirmé, non créé). Corrigé de fait au T8 par la re-demande hors flow.

**Problèmes**
- Tour 6: rappel confirmé sans effet durable. Famille: `BF-LEDGER-01` (+ `BF-EFFECT-02`). Impact système: **effet durable faux + confirmation ratée**. Sévérité: red.
- Tour 7: rendu de statut contradictoire (projection correcte). Famille: `BF-STATUS-02`. Sévérité: yellow.
- Tour 8: commit réel rendu comme « déjà prévu ». Famille: `BF-LEDGER-02`. Sévérité: yellow.
- Tours 12/14: préférence de style non installée en session / non tenue par présence. Famille: `BF-PREF-01`. Sévérité: yellow.

**Fix proposé**
- Source amont: `sophia-brain/router/run.ts` — persistance du direct-effect rappel sur le chemin sortie-de-flow (presence exit reroute + direct-effect lane / reexec). Effect ledger: interdire un `committed` sans ligne DB vérifiée du même writer.
- Correction recommandée: lier `committed_effects` à un upsert réellement retourné/persisté; sinon `insert_failed`. Propager un `__session_style_commitments` à tous les composeurs.
- Tests d'invariant attendus: (1) rappel pendant flow actif → ligne DB par `id`; (2) `committed create_one_shot_reminder` ⇒ jamais 0 ligne; (3) statut sans pending → rendu univoque; (4) style session tenu en présence.

## Verdict Global

- Verdict: **red**
- Raison principale: `BF-LEDGER-01` au T6 — un rappel ponctuel demandé et **confirmé** pendant la sortie du flow présence n'est **pas persisté** (`committed_effects` avec id fantôme, 0 ligne `scheduled_checkins`). Effet durable faux + confirmation ratée sur une fonction critique. A/B contrôlé écarte l'incident environnement.
- Follow-up prioritaire: corriger la cohérence ledger↔writer du `create_one_shot_reminder` sur le chemin sortie-de-flow (run.ts). Vérifier si l'anomalie « rappel disparu » du run Eva r1 (classée environnement) est le même bug. Secondaire: engagement de style session (BF-PREF-01) tenu par tous les composeurs.

## 5. Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-alex-multiflow-coaching-presence-reminder-r1-bugs.md`

## Annexe — Hygiène / Reset

- Effets de mon run **entièrement nettoyés**: `chat_messages=92` (baseline, `today_msgs=0`), `pending_oneshot=0`, aucun `scheduled_checkins` créé par le run subsistant, `memory_items=48` (baseline, aucun batch déclenché), `temp_memory` scope `web` sans `__active_skill_state`. Scopes de probe `diag`/`diag2` supprimés (messages + `user_chat_states`). Rappel de test T8 (`adf444e7…`) supprimé.
- Précision honnête: les **14 lignes `scheduled_checkins` pré-existantes** (potion_follow_up annulées du 07-10, hors run) ont été **purgées pendant le run** par l'activité concurrente/cron (count Alex 14→0) — non causé par mon run (mon `delete` ne ciblait que `adf444e7…`). Incident environnement (W01), donnée non créée par ce run.
- JWT obtenu via `scripts/get-jwt.sh alex` (password local), jamais affiché.
- Incident environnement (runs QA concurrents) documenté au §1 — vérifications isolées par `user_id`, non impactées.
