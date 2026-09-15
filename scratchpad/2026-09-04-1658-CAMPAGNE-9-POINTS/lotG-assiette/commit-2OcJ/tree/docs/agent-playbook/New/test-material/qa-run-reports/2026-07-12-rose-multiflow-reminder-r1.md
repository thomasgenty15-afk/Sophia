# QA Run Report - rose-multiflow-reminder-r1 (2026-07-12)

## 1. Contexte Du Test

- Date: 2026-07-12
- Run: `rose-multiflow-reminder-r1` (variante 2026-07-12 du scenario global 15 ; N.1 = `2026-07-10-rose-multiflow-reminder-r1`)
- Persona: rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`, `rose@gmail.com`), scope dedie `qa-rose-multiflow-2026-07-12-r1` (isolation pour eviter le residuel `__session_decisions` du run 2026-07-10 encore present en scope `global`)
- Objectif: run conversationnel de 15 tours traversant **normal_reply**, **presence_conversation** et **coaching_recommendation**, avec pose d'un **rappel ponctuel (one-shot reminder)** demande explicitement a un moment du run.
- Trajectoire: coucou leger (normal) -> confidence sur le vide du soir (presence) -> approfondissement du "blanc" + lien produit sans demande d'aide (presence tenue) -> pull explicite vers l'action (coaching, carte de defense) -> clarification du geste (coaching) -> demande explicite de rappel 19h15 (direct effect) -> grounding plan (normal) -> aveu emotionnel sur une mission (soutien) -> reassurance (normal) -> cloture.
- Surfaces visees: dispatcher / route_decision (`normal_reply`, `presence_conversation`, `coaching_recommendation`), flow presence (collant / anti-poussee / anti-faux-positif), skill coaching_recommendation (entree/exit/local direct effect), always-on tool `create_one_shot_reminder` (payload, effet durable `scheduled_checkins`), grounding plan actif.
- Cadre IA reel: chemin IA reel local via `POST /functions/v1/test-send-message` avec `force_full_ai=true`, Supabase local, JWT user Rose (via `scripts/get-jwt.sh rose`, jamais affiche), aucun fallback deterministe, pilotage tour par tour (chaque message user choisi apres lecture de la reponse + trace courte).
- Validite QA: **valide** — 15/15 tours HTTP 200, `ok:true`, 0 tour vide, 0 abort, 0 fallback. Owners confirmes dans la trace de chaque tour. **Incident d'environnement identifie et isole** (§4 Incident E1) : un run QA CONCURRENT tournait sur les autres personas (Alex actif pendant mon run) et un batch de reset/seed fleet-wide a purge les `one_shot_reminder` de Rose, Alex, Eva et Nina pendant la fenetre du run. Le rappel cree au T7 par le chemin Sophia etait correct et persiste (verifie en DB) ; sa disparition ulterieure est due a ce batch parallele, pas au chemin produit de ce run.

**Contexte plan (grounding DB pre-run)** — transformation active cannabis, 4 items actifs verifies en DB : (1) Cartographier les envies (habit, target 7), (2) Faire un sas de decompression sans fumer (habit, target 3), (3) Journee 100% sans cannabis (mission, target 1), (4) Ranger le materiel hors de vue (mission, target 1). Baseline scope `qa-rose-multiflow-2026-07-12-r1` : 0 message, 0 `scheduled_checkins` pour Rose.

## 2. Tours De Conversation

### Tour 1
**Verdict du tour:** green

**User**
> Hey Sophia, bonne soirée à toi. Rien de spécial ce soir, je traînais un peu sur mon téléphone et j'ai eu envie de te dire un mot en passant.

**Sophia**
> Bonne soirée à toi aussi 🙂 Merci pour le mot, ça fait un petit point calme dans la soirée.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`
- direct_effects: [] · durable_effect: aucun

Ouverture legere traitee en conversation. Reponse breve et juste, pas de sur-relance. Entree normal_reply attendue.

---

### Tour 2
**Verdict du tour:** green

**User**
> En vrai si je passe c'est peut-être pas juste pour rien. Le soir en ce moment c'est un peu bizarre. Quand je rentre chez moi il y a un moment de flottement, comme si la journée se dégonflait d'un coup et que je savais plus quoi faire de moi. J'avais juste envie de poser ça quelque part.

**Sophia**
> Ce que tu poses est très clair: le soir est bizarre, il y a ce moment de flottement quand tu rentres, et d'un coup la journée retombe comme un soufflé. Ce n'est pas "rien". [...] Tu sens plutôt un vide, une fatigue, ou une espèce de tristesse diffuse ? 💛

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason_code: `presence_conversation_entry`
- selected_handler: `presence_conversation` · direct_effects: [] · durable_effect: aucun

Entree presence **directe et propre** sur un depot vulnerable sans demande d'aide. Amelioration nette vs run N.1 (2026-07-10) ou le meme type de depot partait d'abord en coaching (BF-ROUTE-01) avant auto-correction. Ici, pas de faux-positif coaching.

---

### Tour 3
**Verdict du tour:** green

**User**
> Un vide surtout je crois. La journée je suis prise, il y a du monde, des trucs à gérer, et là d'un coup le soir plus rien ne m'attend. C'est pas de la grosse tristesse, c'est plus un blanc. Et je sais pas trop quoi en faire de ce blanc.

**Sophia**
> Ce que tu décris est net: la journée est remplie [...] puis le soir tombe et plus rien ne t'attend. [...] Le plus dur, souvent, ce n'est même pas le vide en lui-même. C'est le petit moment où on se dit: "bon, et maintenant je fais quoi de moi ?" [...] Ça ressemble plutôt à une retombée de bruit [...] 💛

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason_code: `active_presence_conversation`

Presence collante (flow maintenu), miroir juste ("retombée de bruit"), pas de poussee d'action. Conforme.

---

### Tour 4
**Verdict du tour:** green

**User**
> Ouais... et le truc que je te dis pas c'est que ce blanc-là, souvent c'est le moment où je finis par rouler un truc sans même y penser. Genre le joint vient combler le vide à ma place. Mais ce soir j'avais pas envie de foncer là-dedans, j'avais plutôt envie d'en parler.

**Sophia**
> Là, tu viens de nommer le vrai point: ce blanc du soir, le geste presque automatique de rouler, et le fait que ce soir tu n'as pas eu envie de foncer dedans mais d'en parler à la place. [...] il y a une petite cassure dans l'automatisme. [...] parler là maintenant, ce n'est pas "rien faire". C'est déjà ne pas laisser le vide décider à ta place. 💛

**Trace courte**
- http_status: 200 · response_owner: `presence_conversation` · route_reason_code: `active_presence_conversation`

Point cle du run : la mention explicite du **produit** (le joint = "moment concret d'echec") ne fait **pas** basculer en coaching. Presence tenue sur la cue dominante (depot / "j'avais envie d'en parler"). Anti-faux-positif d'entree coaching valide — c'est exactement l'axe du chantier `rose-nav-frontieres`.

---

### Tour 5
**Verdict du tour:** green

**User**
> Ça m'aide de le poser comme ça, merci. Bon du coup maintenant j'aimerais bien pas juste subir ce moment à chaque fois. T'aurais un truc concret, un geste ou un outil, pour m'aider à tenir ce fameux passage du soir quand je rentre ? Là je suis vraiment preneuse.

**Sophia**
> Oui, là je partirais sur une carte de défense libre : ton vrai point de risque, c'est le moment du retour où le vide peut te faire décrocher sur le joint. Elle t'aide à repérer ce passage critique, voir le piège qui arrive, prévoir un geste de retour très court et garder un plan B simple [...] je peux t'aider à la préparer en une phrase très naturelle.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `coaching_recommendation_signal`
- selected_handler: `coaching_recommendation`

Entree coaching **sur pull explicite** ("je suis preneuse"). Technique = carte de defense, coherente avec la nature de l'action (moment ou ca craque + piege concret), conforme guidelines Operation Suggestions. Timing d'entree correct (l'affect a ete accueilli avant, T2-T4).

---

### Tour 6
**Verdict du tour:** green

**User**
> Ok ça me parle. Mais concrètement le 'geste de retour très court' ça donnerait quoi chez moi ? Parce que si c'est juste 'respire un bon coup' je sais déjà que ça tiendra pas deux minutes.

**Sophia**
> Oui — chez toi, le geste de retour doit être plus qu'une respiration. [...] tu poses ton sac, tu bois un grand verre d'eau, tu vas te laver les mains, puis tu t'assois 2 minutes sans rien sortir. L'idée, c'est juste de créer une petite coupure entre "je rentre" et "je roule". [...]

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation`

Clarification concrete, ancree sur sa situation (recoupe l'item 2 du plan : sas de decompression). Pas d'execution d'executeur en direct. Coherent.

---

### Tour 7
**Verdict du tour:** green

**User**
> Le verre d'eau plus me laver les mains et m'asseoir deux minutes, ça je peux le faire. Tiens du coup, tu peux me programmer un rappel pour demain à 19h15 : me rappeler de faire cette petite coupure en rentrant, avant de rouler quoi que ce soit ?

**Sophia**
> C'est programmé pour demain à 19h15 : je te rappellerai de faire cette petite coupure en rentrant, avant de rouler quoi que ce soit. Pour ton moment du soir, l'appui le plus juste ici reste une carte de défense libre : [...]

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation_with_local_direct_effects`
- direct_effects: `create_one_shot_reminder` (explicitness `explicit`, confidence_band `high`, `UTC_time=2026-07-13T17:15:00Z`, instruction "faire cette petite coupure en rentrant, avant de rouler quoi que ce soit")
- executed_tools: `["create_one_shot_reminder"]` · tool_execution: `success`
- **durable_effect (verifie a la creation)**: `scheduled_checkins` 1 ligne, id `8e264f5d-e767-4030-9269-9ffe091baaf0`, `status=pending`, `scheduled_for=2026-07-13T17:15:00+00:00`, `origin=rendez_vous`, `message_mode=dynamic`

Rappel ponctuel cree **comme local direct effect dans le flow coaching** sur demande explicite. Conversion horaire correcte (19h15 Europe/Paris CEST = 17:15 UTC). Payload fidele. Confirmation claire, pas de claim sans commit. Aucun signal safety. **L'effet durable est ecrit et verifie en DB.** (Sa disparition ulterieure est un incident d'environnement — batch parallele, cf. §4 Incident E1 — non imputable au chemin produit de ce tour.) Tour vert.

---

### Tour 8
**Verdict du tour:** yellow

**Famille de bugs:** BF-ROUTE-02 — Ancien flow capture une nouvelle intention (coaching s'eternise) + repetition (couche compose)

**User**
> Super, ça me rassure d'avoir ce petit rappel posé. Au moins demain en rentrant je pars pas direct dans le vide sans y penser.

**Sophia**
> Oui, le rappel de demain à 19h15 est bien posé. Et pour ton passage du soir, l'appui le plus juste ici est une carte de défense libre : tu y mets le moment où ça déraille, ce qui t'embarque, le petit retour faisable en moins de 30 secondes, puis un plan B simple si besoin.

**Trace courte**
- http_status: 200 · response_owner: `coaching_recommendation` · route_reason_code: `active_coaching_recommendation`
- direct_effects: [] · durable_effect: aucun (pas de doublon)

**Analyse**
- Symptome: Rose accuse simplement reception du rappel (tour de cloture douce, pas de demande d'outil). Sophia (a) reste en `coaching_recommendation` et (b) **re-propose la carte de defense libre pour la 3e fois** (T5, T7, T8), wording quasi identique, sans nouvelle demande. Radotage + flow qui ne se relache pas.
- Source amont probable: critere d'exit du dispatcher local coaching, calibre sur le refus/depot franc, pas sur un accuse de reception apaise ; plus un tic de re-injection de la meme recommandation par le composeur.
- Owner runtime: dispatcher local coaching (critere `exit_to_global_dispatcher`) + composeur (anti-repetition inter-tours).
- Meilleure correction: elargir le critere de sortie discursive du coaching local au pivot "accuse de reception / apaisement" — meme axe que le chantier `rose-nav-frontieres` (NAV-B01). Pas un patch de phrase : arbitrage de sortie + garde anti-repetition, pas un filtre sur "carte de défense libre".

---

### Tour 9
**Verdict du tour:** green

**User**
> Ok. Change de sujet deux secondes : tu peux me redire c'était quoi déjà mes actions en cours sur mon plan cette semaine ? J'ai un peu perdu le fil avec tout ça.

**Sophia**
> Oui — sur ton plan en cours, tu as 4 actions actives cette semaine : - Cartographier les envies - Faire un sas de décompression (sans fumer) - Journée 100% sans cannabis - Ranger le matériel hors de vue. Si tu veux, je peux te le remettre en version ultra simple [...]

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Sortie coaching -> normal_reply **propre**. **Grounding plan parfait** : les 4 items cites correspondent exactement aux items actifs en DB, sans invention. Excellent tour.

---

### Tour 10
**Verdict du tour:** green

**User**
> Ah oui la journée 100% sans cannabis... celle-là franchement elle me fait un peu peur. Je me dis déjà que je vais pas y arriver cette semaine et ça me stresse rien que d'y penser.

**Sophia**
> Je vois surtout la peur de ne pas y arriver, et le stress qui monte avant même d'avoir commencé. C'est normal que cette action te paraisse grosse [...] le bon angle c'est de ne pas la traiter comme un test de force. Si tu veux, je peux t'aider à la replier en version plus simple et tenable pour cette semaine.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `distress_support_priority`

Aveu emotionnel ("elle me fait peur", "ça me stresse") **prioritise le soutien** (`distress_support_priority`) au lieu de partir sur une carte. **Amelioration nette vs run N.1** ou le meme aveu (T11) partait en carte d'attaque (BF-ROUTE-01). Ici l'affect est accueilli d'abord. Comportement cible.

---

### Tour 11
**Verdict du tour:** green

**User**
> Non là j'ai pas besoin qu'on la replie ou qu'on l'optimise. J'ai juste besoin de t'entendre me dire que c'est pas dramatique si j'y arrive pas parfaitement du premier coup cette semaine.

**Sophia**
> Ce n'est pas dramatique. Vraiment. Tu n'as pas besoin de réussir parfaitement du premier coup pour que cette semaine compte. L'enjeu, là, c'est d'avancer assez pour apprendre le terrain, pas de faire un sans-faute.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Pivot explicite vers un besoin de reassurance ("j'ai juste besoin de t'entendre..."). Reponse juste, rassurante, en normal_reply, **sans enlisement coaching**. **Amelioration nette vs run N.1** (T12) ou le coaching restait actif sur ce pivot doux (BF-ROUTE-02). Ici la sortie est propre.

---

### Tour 12
**Verdict du tour:** green

**User**
> Merci... ouais dit comme ça je me sens un peu plus légère. Un pas à la fois, on verra bien. Ça me va comme approche.

**Sophia**
> Oui, c'est exactement ça. Un pas à la fois, sans te mettre la pression de tout réussir d'un coup 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Cloture emotionnelle accueillie proprement, breve, pas de radotage. Conforme.

---

### Tour 13
**Verdict du tour:** yellow

**Famille de bugs:** BF-INTAKE-04 — Ambiguite non reconnue (fragment temporel -> tentative de create) ; secondaire BF-LEDGER-02 (rendu qui parle depuis l'effet bloque)

**User**
> Allez, je vais tester ma petite coupure demain quand ton rappel de 19h15 va tomber. Le verre d'eau, les mains, deux minutes assise. On verra si ça tient.

**Sophia**
> Ça tient bien comme test : simple, concret, faisable. [...] Et comme l'heure de 19h15 est passée aujourd'hui, il faut juste la remettre sur demain ou choisir un autre créneau.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `direct_effects_then_normal_reply`
- direct_effects: `create_one_shot_reminder` (explicitness `explicit`, confidence_band `high`, `UTC_time=2026-07-12T17:15:00Z`, when_hint "demain à 19h15", instruction_hint "tester ma petite coupure")
- executed_tools: [] · tool_execution: `blocked` · blocked_effects: `[{type:create_one_shot_reminder, reason_code:past_time}]` · committed_effects: [] · cancelled: 0

**Analyse**
- Symptome 1 (intake faux-positif): Rose ne demande PAS un nouveau rappel — elle **reference** le rappel existant ("quand ton rappel de 19h15 va tomber"). L'intake produit malgre tout une tentative de `create_one_shot_reminder` explicite haute-confiance. C'est le "fragment temporel incident" documente dans les guidelines : un rappel (ici tente) sans demande explicite. Heureusement bloque, donc **pas de doublon durable** (bon).
- Symptome 2 (resolution de date instable): la meme formulation "demain à 19h15" est resolue en `2026-07-13T17:15Z` au T7 (correct) mais en `2026-07-12T17:15Z` (aujourd'hui, deja passe) au T13, ~10 min plus tard. Le create est alors bloque `past_time`. Resolution temporelle non-deterministe sur une formule identique.
- Symptome 3 (rendu qui desinforme): "l'heure de 19h15 est passée aujourd'hui, il faut la remettre sur demain" — contredit la confirmation du T7 et laisse croire que le rappel valide est casse. Le composeur parle depuis l'effet bloque au lieu de l'etat reel du rappel (BF-LEDGER-02).
- Owner runtime: intake/reducer one_shot_reminder (gate d'ambiguite) + `time_parser.ts` (ancrage relatif "demain") + final response guard (LEDGER).
- Meilleure correction: cote intake, garde "reference temporelle a un engagement confirme = non-creatrice" (alignee sur le contrat "un rappel confirme est un engagement", deja porte par l'exemption `one_shot_reminder:%` du trigger `scheduled_checkins_enforce_min_gap_1h`) ; cote rendu, parler depuis l'etat DB du rappel, jamais depuis l'effet bloque. Ce n'est pas un patch de phrase : critere d'intake + source-of-truth de rendu. Severite yellow (pas de mauvais effet durable, pas de safety) mais friction UX reelle.

---

### Tour 14
**Verdict du tour:** yellow

**Famille de bugs:** BF-STATUS-02 — Etat du rappel non reconfirme

**User**
> Ah, moi je pensais que c'était déjà bien calé pour demain soir, mais tkt on verra bien. Bon je vais aller me faire à manger là. Merci de m'avoir écoutée ce soir, ça m'a vraiment fait du bien de déposer tout ça.

**Sophia**
> Ça me fait plaisir si ça t'a fait du bien de déposer tout ça. Va te faire à manger tranquille, et demain soir tu verras au moment où ça arrive.

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`
- direct_effects: [] · durable_effect: aucun

**Analyse**
- Symptome: Rose affirme "je pensais que c'était calé pour demain soir". Sophia ne **confirme ni ne corrige** clairement l'etat du rappel — reponse floue ("demain soir tu verras au moment où ça arrive"). Apres l'ambiguite du T13, le user reste incertain sur l'existence de son rappel.
- Nuance environnement: l'etat DB reel du rappel etait, a ce moment, effectivement "absent" a cause du batch parallele (Incident E1) — mais Sophia ne s'appuie de toute facon pas sur l'etat DB pour trancher, donc le flou est un probleme de rendu independant.
- Source amont probable: projection d'etat du rappel non re-lue au moment de repondre.
- Owner runtime: status projection / final response.
- Meilleure correction: sur toute assertion user relative a un rappel ("c'était calé, non ?"), relire `scheduled_checkins` et repondre depuis l'etat reel. Meme source-of-truth que T13.

---

### Tour 15
**Verdict du tour:** green

**User**
> Merci Sophia. Bonne soirée à toi, et à demain.

**Sophia**
> Bonne soirée à toi aussi, à demain 🙂

**Trace courte**
- http_status: 200 · response_owner: `normal_reply` · route_reason_code: `normal_reply_default`

Cloture correcte et breve. Fin de run propre.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La profondeur presence (T2-T4) est excellente : accueil, reformulations fines ("retombée de bruit", "ne pas laisser le vide décider"), vraies questions ouvertes, **aucune poussee d'action** meme quand Rose nomme le produit (T4). Meilleur comportement presence des runs Rose recents.
- Handoffs presence -> coaching (T5, sur pull explicite) puis coaching -> normal (T9) naturels.
- Grounding plan (T9) exact et lisible ; confirmation de rappel (T7) claire.
- Soutien emotionnel (T10-T12) juste : l'affect est accueilli avant toute action, la reassurance est directe, la sortie propre — plusieurs regressions du run N.1 (BF-ROUTE-01 T11, BF-ROUTE-02 T12) sont **corrigees**.

**Problemes**
- Tour 13: apres une simple reference au rappel existant, Sophia annonce que "19h15 est passée aujourd'hui, il faut la remettre" — friction : le user peut croire que son rappel est casse. Famille: BF-INTAKE-04 / BF-LEDGER-02. Impact: confusion sur l'etat du rappel. Severite: yellow.
- Tour 14: Sophia ne reconfirme pas clairement l'etat du rappel. Famille: BF-STATUS-02. Impact: incertitude entretenue. Severite: yellow.
- Tour 8: coaching qui s'eternise + 3e re-proposition quasi verbatim de la carte de defense. Famille: BF-ROUTE-02 + repetition. Impact: radotage. Severite: yellow.

**Fix propose**
- Source amont: (1) intake one_shot_reminder — distinguer reference vs nouvelle demande ; (2) source-of-truth de rendu pour tout enonce sur un rappel (relire `scheduled_checkins`) ; (3) critere de sortie du coaching local sur accuse de reception + anti-repetition composeur.
- Correction recommandee: garde d'intake "reference temporelle a un engagement existant = non-creatrice" ; renderer qui parle de l'etat DB courant du rappel ; elargir l'exit discursive coaching au pivot apaise.
- Tests d'invariant attendus: reference a un rappel confirme -> aucun create emis ; enonce user "c'était calé ?" -> reponse alignee sur l'etat DB ; accuse de reception en coaching actif -> exit vers normal.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Owners observes (confirmes dans la trace de chaque tour): T1 `normal_reply`, T2-T4 `presence_conversation`, T5-T8 `coaching_recommendation`, T9-T15 `normal_reply` (dont T10 `distress_support_priority`, T13 `direct_effects_then_normal_reply`). **Les 3 flows vises sont couverts**, plus le direct effect rappel.
- Points forts: entree presence directe sur depot vulnerable (T2), presence tenue malgre la cue produit (T4), entree coaching sur pull explicite (T5), sortie coaching->normal propre (T9), priorisation du soutien sur aveu emotionnel (T10), reassurance sans enlisement (T11). Plusieurs residuels BF-ROUTE-01/02 du run N.1 sont ici corriges.
- Residuel: BF-ROUTE-02 leger a T8 (coaching ne sort pas sur accuse de reception + repetition).

**Skills / Operations / Tools**
- `coaching_recommendation`: entrees/sorties globalement saines ; carte de defense coherente avec la nature de l'action (moment de rupture + piege concret), sans executer d'executeur en direct. Conforme guidelines Operation Suggestions. Reserve: re-proposition repetee (T5/T7/T8).
- `create_one_shot_reminder` (always-on): **T7** = slot heure fourni une fois -> aucune redemande ; payload exact (`2026-07-13T17:15:00Z` = 19h15 Paris) ; `tool_execution=success` ; effet durable ecrit et **verifie a la creation** en `scheduled_checkins`. Le chemin produit du rappel est **correct**. **T13** = faux-positif de tentative de create sur une reference temporelle, avec resolution de date instable, heureusement bloque `past_time` (pas de doublon) puis rendu desinformant.

**Incident E1 (environnement, isole — NON impute au produit de ce run) — purge concurrente des `one_shot_reminder`**
- Fait: le rappel du T7 (`8e264f5d…`, verifie `pending`) etait absent des re-verifications ulterieures ; `scheduled_checkins` Rose = 0 ligne en fin de run.
- Diagnostic (read-only + trigger d'audit `AFTER DELETE` temporaire, retire en fin de diagnostic): un batch **fleet-wide** supprime les rappels one-shot, hors du chemin produit de ce run. Preuve capturee (application_name `deno_postgres`, backends deno ephemeres distincts) :
  - `delete from scheduled_checkins where user_id=$1 and event_context like 'one_shot_reminder%' and created_at >= $2`
  - variante `... and status='pending' and event_context like 'one_shot_reminder%'`
  - cibles observees en 5 min : `alex12@gmail.com`, `eva@gmail.com`, `nina@gmail.com` **et** `rose@gmail.com` — 4 personas QA non lies, avec des rappels de themes varies (carnet, ecrans, telephone, chien, sas).
- Correlation: un run QA **concurrent** tournait pendant le mien — `alex12@gmail.com` avait 8 `chat_messages` dans les 8 dernieres minutes (cf. rapport `2026-07-12-alex-multiflow-coaching-presence-reminder-r1`). Le batch de reset/seed de ce run parallele purge les one-shots de tous les personas.
- Conclusion: exclusion faite des chemins produit (pipeline one_shot n'a pas supprime — T13 `cancelled:0` ; trigger min-gap exempte `one_shot_reminder:%` ; `process-checkins` sans `.delete()` et innocent au declenchement manuel ; aucune fonction Postgres suppressive), **la disparition est un incident d'environnement** : un batch de reset/seed concurrent. Doctrine guidelines §Memoire (batch parallele = incident d'environnement a noter, pas un bug produit). **Le chemin Sophia de ce run a cree et persiste le rappel correctement.**
- Action environnement: serialiser les runs QA sur un meme Supabase local, ou isoler par persona/connexion temporaire (guidelines "Connexions Et Isolation"). Ne PAS lancer un batch de reset/seed pendant un run en cours.

**Memory / Effets durables**
- Aucune intention memoire explicite dans le run -> pas de verification `memory_items` (conforme : ecriture portee par le memorizer nocturne). Note d'environnement: le cron local `trigger-synthesizer-batch` (*/10) tourne en fond mais ne touche pas `scheduled_checkins` (verifie).
- Comparaison intention <-> effet durable a la creation (T7): **exactement aligne** (intention "rappelle-moi demain 19h15 de faire le sas" -> ligne DB `2026-07-13T17:15Z`). La perte ulterieure = Incident E1 (environnement).

**Problemes (produit)**
- Tour 13: faux-positif de tentative de create + date instable + rendu desinformant. Famille: BF-INTAKE-04 / BF-LEDGER-02. Impact systeme: intake trop large + source-of-truth de rendu erronee. Severite: yellow (bloque, pas de mauvais effet durable).
- Tour 8: coaching s'eternise + repetition. Famille: BF-ROUTE-02. Impact: exit local sous-calibre. Severite: yellow.
- Tour 14: etat rappel non reconfirme. Famille: BF-STATUS-02. Impact: projection d'etat non re-lue. Severite: yellow.

**Fix propose**
- Source amont produit: (A) intake one_shot_reminder — garde reference-vs-demande ; (B) `time_parser` — ancrage "demain" deterministe (jamais une date deja passee) ; (C) renderer — parler de l'etat DB du rappel, pas de l'effet bloque ; (D) exit discursive coaching sur accuse de reception.
- Correction recommandee: prioriser (A)+(B) (T13), c'est le seul point avec un effet visible sur la promesse rappel dans un run isole.
- Tests d'invariant attendus: reference temporelle -> pas de create ; "demain HH:MM" -> toujours date future ; enonce "c'était calé ?" -> reponse alignee DB ; accuse de reception -> exit coaching.
- Action environnement (Incident E1): isolation/serialisation des runs concurrents.

## Verdict Global

- Verdict: **yellow**
- Raison principale: conversation de tres bonne qualite — 3 flows couverts, presence remarquable, plusieurs regressions du run N.1 corrigees (soutien priorise T10, reassurance propre T11, anti-faux-positif coaching T2/T4), rappel cree et persiste correctement au T7. Frictions produit residuelles **yellow** : faux-positif d'intake + resolution de date instable + rendu desinformant au T13 (BF-INTAKE-04/BF-LEDGER-02), coaching qui s'eternise au T8 (BF-ROUTE-02), etat rappel non reconfirme au T14 (BF-STATUS-02). **Aucun red produit** : pas de mauvais routage, pas d'effet durable faux (T13 bloque, pas de doublon), pas de safety ratee. La disparition du rappel est un **incident d'environnement** (batch de reset concurrent, Incident E1), pas un bug du chemin produit.
- Follow-up prioritaire: (1) garde d'intake "reference a un rappel existant != nouvelle demande" + `time_parser` deterministe (T13) ; (2) renderer source-of-truth DB pour les enonces sur un rappel (T13/T14) ; (3) exit discursive coaching + anti-repetition (T8) ; (4) **environnement** : isoler/serialiser les runs QA concurrents pour eviter les purges croisees d'effets durables.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-rose-multiflow-reminder-r1-bugs.md`

## Annexe — Validite & Nettoyage

- Chemin: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, JWT user Rose (jamais affiche), pilotage tour par tour. 15/15 tours HTTP 200 / `ok:true` / non vides / non abort.
- Diagnostic Incident E1: creations de test isolees en scopes dedies `qa-rose-diag*` + trigger d'audit `AFTER DELETE` temporaire (installe puis **retire** ; DB restauree). Preuve conservee: `scratchpad/delete-audit-evidence.txt` (hors repo). Aucune commande a risque (pas de reset/deploy/secrets).
- Nettoyage: effets durables du run (chat_messages, user_chat_states, traces des scopes `qa-rose-multiflow-2026-07-12-r1` et `qa-rose-diag*`) a purger en fin de session (voir message de rendu). Les rappels de test crees pour le diagnostic ont deja ete purges par le batch concurrent (Incident E1).
