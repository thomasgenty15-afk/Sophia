# QA Run Report — paul-p9reval-r1 (revalidation P9 en run réel)

## 1. Contexte Du Test

- Date: 2026-07-15 (run 04:27–04:45 heure réelle Paris ; horloge simulée 09:02→10:29 Europe/Paris, toujours ≥ réel)
- Run: paul-p9reval-r1 (vague 25)
- Persona: Paul (`paul@gmail.com`, user_id `d265435c-...bfff`), scope dédié `qa-paul-p9reval-20260715`, channel web
- Objectif: revalidation EN RUN RÉEL des fixes du chantier P9 — P9-A (antécédent résoluble sur coercition reschedule/« remets »), P9-B (exemption de masse cancel + anti-faux-positif), P9-C (vérité d'exécution sur reschedule) — + vérification passive P11 (gardes dans `system_error_logs`)
- Trajectoire: 15 tours en un fil naturel — create simple → fan-out 2 rappels → « remets celui » sans antécédent DB → reschedule clitique familier « decale le a jeudi meme heure » → récap read-only → cancel ciblé avec « tous » non adjacent → tour humain → reschedule vers vendredi → contexte déplacement → mass cancel « tous les rappels que je t'ai mis aujourd'hui » → vérif énumération → vérif ciblée → re-create anaphorique post-cancel → slot clarify → clôture
- Surfaces visées: one_shot_reminder (create/cancel/replace/mass-cancel), routing direct effects, projection status/récap, EffectLedger, gardes P9/P11
- Cadre IA réel: local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso` ≥ heure réelle (Europe/Paris), aucun renderer déterministe, aucun fallback, aucun code modifié pendant le run
- Hygiène pré-run: `temp_memory` sans `__active_skill_state` résiduel ; inventaire initial = 0 rappel one-shot, 0 entrée tracking récente, 0 memory_item
- Validité QA: **valide** (15/15 tours servis par le chemin IA réel, aucun retry nécessaire, DB vérifiée après chaque tour à effet)

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Salut Sophia ! Grosse journée au boulot qui m'attend. Tu peux me mettre un rappel ce soir à 21h30 pour que je prépare mon sac de sport ?

**Sophia**
> C’est fait : ce soir à 21h30, tu prépareras ton sac de sport.
> Et bon courage pour ta grosse journée au boulot 💛

**Trace courte**
- http_status: 200 ; response_owner: normal_reply ; route_reason: direct_effects_then_normal_reply
- direct_effects: create_one_shot_reminder ; ledger requested=1/committed=1
- durable_effect: ligne `scheduled_checkins` 75fbd444 pending `2026-07-15 19:30 UTC` (= 21:30 Paris) ✓

### Tour 2 — Bloc A, fan-out

**Verdict du tour:** green

**User**
> Ah et tant que j'y pense, deux trucs pour demain : un rappel à 7h45 pour prendre mes vitamines, et un autre à 18h pour passer à la pharmacie avant la fermeture.

**Sophia**
> C’est pris pour demain : à 7h45 pour prendre tes vitamines, et à 18h pour passer à la pharmacie avant la fermeture 🙂

**Trace courte**
- ledger requested=2/committed=2 (parité P8-A/P10-B tenue) ; db_ref 4f1424e0 (16/07 05:45 UTC) + 5b61a623 (16/07 16:00 UTC)
- durable_effect: 2 lignes pending correctes, rendu annonce les 2 ✓

### Tour 3 — Bloc A, P9-A : « remets celui » sans antécédent DB

**Verdict du tour:** green

**User**
> Ah oui et remets-moi aussi celui pour sortir les poubelles demain matin à 8h, je crois qu'il avait sauté la semaine dernière.

**Sophia**
> C’est pris pour demain matin à 8h : sortir les poubelles.

**Trace courte**
- ledger requested=1/committed=1, effet = one_shot_reminder.create (dégradé en create, pas de replace)
- durable_effect: nouvelle ligne 1ac0e5fe pending 16/07 06:00 UTC ; **les 3 rappels pré-existants inchangés en DB (aucun cancel/replace)** ✓ — comportement P9-A attendu (le fan-out T2 ayant committé 2/2, la variante testée est l'antécédent inexistant avec contenu re-précisé)

### Tour 4 — Bloc C, P9-C : reschedule clitique familier + jour nommé + même heure

**Verdict du tour:** green

**User**
> bon en fait le sport ce soir c'est mort, trop de taf. le rappel sac de sport decale le a jeudi meme heure

**Sophia**
> C’est décalé à jeudi à 21h30 pour préparer ton sac de sport.

**Trace courte**
- ledger: cancel committed (75fbd444, « mercredi 15 juillet à 21:30 ») + create committed (da9278a7, « jeudi 16 juillet à 21:30 », instruction héritée « préparer mon sac de sport »)
- durable_effect: replace atomique — ancienne ligne cancelled, nouvelle pending 16/07 19:30 UTC = jeudi 21:30 Paris, même heure ✓ ; l'annonce « c'est décalé » est adossée à un commit réel (vérité d'exécution P9-C) ✓

### Tour 5 — récap read-only

**Verdict du tour:** green

**User**
> tu peux juste me confirmer ce que j'ai comme rappels en cours là ? histoire d'être sûr qu'on est raccord

**Sophia**
> Oui — en cours, tu as 4 rappels ponctuels en attente :
> - demain à 07:45 : prendre tes vitamines
> - demain à 08:00 : sortir les poubelles
> - demain à 18:00 : passer à la pharmacie avant la fermeture
> - demain à 21:30 : préparer mon sac de sport
> Et aucun rappel récurrent actif.

**Trace courte**
- route_reason: normal_reply_default ; ledger all-zero (aucun effet émis) ✓
- Énumération exacte = 4 pendings DB, heures locales correctes ✓ (nit micro : écho premières-personne « mon sac de sport »)

### Tour 6 — Bloc B anti-FP : « tous » non adjacent, cancel ciblé

**Verdict du tour:** green

**User**
> nickel, ils sont tous bons du coup. annule juste celui de 7h45, les vitamines je les prends direct au petit dej maintenant

**Sophia**
> C’est annulé pour 7h45 : prendre tes vitamines.
> Le reste de tes rappels est toujours bon ✅

**Trace courte**
- ledger: 1 cancel committed, db_ref 4f1424e0 ✓
- durable_effect: SEULES les vitamines cancelled ; poubelles/pharmacie/sport restent pending ✓ — pas de faux positif masse malgré « tous » dans la phrase ✓

### Tour 7 — tour humain

**Verdict du tour:** green

**User**
> franchement la journée s'annonce dense, trois réunions d'affilée ce matin et un dossier à rendre. je vais me chercher un café avant que ça commence

**Sophia**
> Ça sent la matinée chargée, avec les trois réunions d’affilée et le dossier à rendre. Va te prendre ce café, ça te donnera un peu d’air avant d’attaquer ☕

**Trace courte**
- owner normal_reply, ledger all-zero ✓ ; ton naturel, aucune poussée d'outil ✓

### Tour 8 — Bloc C : reschedule clitique vers vendredi, même heure

**Verdict du tour:** green

**User**
> au fait pour la pharmacie, demain 18h ca va etre chaud avec le deplacement. decale la a vendredi meme heure

**Sophia**
> Je te la décale pour vendredi à 18:00 : passer à la pharmacie avant la fermeture.

**Trace courte**
- ledger: cancel committed (5b61a623, jeudi 18:00) + create committed (1c4df5b2, « vendredi 17 juillet à 18:00 », instruction héritée)
- durable_effect: replace atomique vers 17/07 16:00 UTC = vendredi 18h Paris ✓, bonne cible, autres lignes intactes ✓

### Tour 9 — contexte déplacement

**Verdict du tour:** green

**User**
> bon bah super, on vient de m'annoncer que je pars a Lyon ce soir pour le reste de la semaine. tout mon planning tombe a l'eau

**Sophia**
> Aïe, là ton contexte a vraiment bougé d’un coup. Entre Lyon pour le reste de la semaine et la journée déjà dense, c’est normal que le plan ne colle plus.
> Si tu veux, tu peux ouvrir Dashboard > Plan > Ajuster mon plan et y décrire ce qui ne tient plus [...] Au passage, le rappel pharmacie de vendredi 18:00 est bien toujours prévu.

**Trace courte**
- owner plan_realignment (route_reason plan_realignment_signal), ledger all-zero ✓
- « tout mon planning tombe à l'eau » est un vrai signal de réalignement : redirection one-shot légitime, aucune mutation, et le rappel vendredi cité est exact. Note fluidité mineure (CTA produit sur un vent) mais accueil d'abord respecté.

### Tour 10 — Bloc B : mass cancel « tous les rappels que je t'ai mis aujourd'hui »

**Verdict du tour:** yellow

**Famille de bugs:** BF-LEDGER-02 — commit réel mal rendu

**User**
> ouais je verrai pour le plan plus tard. par contre du coup ca sert plus a rien tout ca : annule tous les rappels que je t'ai mis aujourd'hui stp

**Sophia**
> J’ai annulé les rappels de ce jour-ci que tu avais mis, et ils ne partiront pas.
> En pratique, il en reste de toute façon déjà aucun en attente.

**Trace courte**
- durable_effect: **les 3 pendings créés aujourd'hui (poubelles, sport-jeudi, pharmacie-vendredi) passent tous à cancelled en DB** ✓ (exemption P9-B levée correctement)
- system_error_logs: ligne `guards` / `mass_cancel_executed`, metadata `cancelled_count: 3`, timestamp du tour ✓ (exigence P11)
- ledger: 1 seule entrée cancel committed (label « jeudi 16 juillet à 08:00 »), pas d'entrées par item ni de liste agrégée

**Analyse**
- Symptome: l'effet de masse est exact en DB, mais la réponse n'énumère PAS les rappels annulés (attendu P9-B : énumération + état restant relu) et la 2e phrase (« il en reste de toute façon déjà aucun en attente ») est confuse — elle peut se lire « il n'y avait déjà rien à annuler ».
- Source amont probable: le chemin mass-cancel ne pousse au ledger qu'une entrée agrégée sans les labels des N items annulés ; le composeur ne peut donc pas énumérer et retombe sur un pluriel vague.
- Owner runtime: executor one_shot_reminder (lane mass-cancel) + EffectLedger.
- Meilleure correction: porter la cardinalité du mass-cancel au ledger (une entrée par item annulé, ou une entrée agrégée avec `cancelled_items[]` labels+ids) et une directive de rendu « mass cancel ⇒ énumérer les items + relire l'état restant » — symétrique de P7-B (N commits ⇒ N annoncés) appliqué au cancel de masse.
- Pourquoi ce n'est pas un patch local: c'est le même invariant contractuel rendu=ledger déjà acté (P7-B) ; la lacune est structurelle (le ledger ne transporte pas l'information), pas une phrase à corriger.

### Tour 11 — vérification de l'énumération post-mass-cancel

**Verdict du tour:** yellow

**Famille de bugs:** BF-STATUS-01 — projection DB mal lue (troncature silencieuse)

**User**
> ok mais du coup tu peux me redire lesquels tu viens d'annuler exactement ? je veux etre sur qu'on a rien oublie

**Sophia**
> Oui — j’ai annulé exactement ces 5 rappels-là, et aucun autre :
> - 15 juil. à 21:30 : préparer mon sac de sport
> - 16 juil. à 07:45 : prendre mes vitamines
> - 16 juil. à 08:00 : sortir les poubelles
> - 16 juil. à 18:00 : passer à la pharmacie avant la fermeture
> - 16 juil. à 21:30 : préparer mon sac de sport
> Il n’en reste pas d’autre en attente pour aujourd’hui.

**Trace courte**
- ledger all-zero (read-only ✓), route normal_reply_default
- DB réelle: **6** lignes cancelled ; la ligne pharmacie **vendredi 17/07 18:00** (1c4df5b2, annulée au T10) est absente de la liste ET absente de toute la trace (0 mention de « 17 juillet » dans le contexte injecté)

**Analyse**
- Symptome: « exactement ces 5 [...] et aucun autre » est factuellement faux — un 6e rappel annulé (pharmacie vendredi) est omis. Paul pourrait croire ce rappel encore actif. La liste conflate aussi les cancels internes des replaces (T4/T8) avec les annulations demandées.
- Source amont probable: `supabase/functions/sophia-brain/context/loader.ts:3046-3054` — le snapshot des one-shot ANNULÉS des dernières 24h est plafonné `.limit(5)` (tri scheduled_for ascendant, sans `count: exact`). Avec 6 cancelled, la ligne du 17/07 (dernière en tri ascendant) est tronquée en silence, et le composeur affirme l'exhaustivité sur une liste tronquée. C'est le miroir exact du bug C3 (rose-r2 T15, BF-STATUS-01, cap silencieux à 5 sur les PENDING, corrigé le 2026-07-03) jamais porté à la branche cancelled.
- Owner runtime: context loader (projection status).
- Meilleure correction: appliquer le fix C3 à la branche cancelled — charger large + `count: exact`, et interdire au rendu toute affirmation d'exhaustivité (« et aucun autre ») si `count > liste.length`. Ajouter la distinction « annulé sur demande » vs « annulé par replace » dans la projection pour que « lesquels tu viens d'annuler » réponde sur le bon sous-ensemble.
- Pourquoi ce n'est pas un patch local: la faille est dans la projection source (troncature silencieuse) ; corriger la phrase du composeur laisserait la liste fausse.

### Tour 12 — vérification ciblée de la ligne tronquée

**Verdict du tour:** green

**User**
> attends et celui de la pharmacie que t'avais decale a vendredi 18h, il est annule aussi ou il va partir quand meme ?

**Sophia**
> Il est annulé aussi, il ne partira pas. La ligne correspondante est bien dans les rappels annulés, donc il ne partira pas vendredi 18h 🙂

**Trace courte**
- ledger: requested=1 / **blocked=1** / committed=0 — une émission d'effet parasite sur un tour de pure vérification a été bloquée par le gate déterministe ; la réponse reste read-only et conforme DB ✓ (vérité d'exécution P9-C tenue : rien d'affirmé qui ne soit en DB)
- Réponse factuellement exacte (la ligne 17/07 est bien cancelled). Nits: fuite de vocabulaire interne (« la ligne correspondante »), répétition « il ne partira pas » x2. Le blocage silencieux du parasite est le comportement voulu (P8-D : l'émission LLM reste stochastique, la garantie est la récupération déterministe).

### Tour 13 — re-create anaphorique post-cancel

**Verdict du tour:** yellow

**Famille de bugs:** BF-INTAKE-01 — slot fourni mais redemandé

**User**
> en vrai y'en a un que je garde : remets-le moi celui des poubelles, jeudi matin 8h, ma voisine peut les sortir si je lui envoie un message

**Sophia**
> Il me manque juste le contenu exact du rappel à remettre pour celui des poubelles : je n’ai pas de rappel actif à restaurer tel quel, et je ne peux pas le reconstituer sans son texte précis.
> Pour remplacer ce rappel il me manque ce qu'il doit rappeler — rien n'a été annulé pour l'instant.

**Trace courte**
- Aucun effet committé ; clarify honnête + « rien n'a été annulé » ✓ (non destructif, P9-A/P8-F respectés)
- durable_effect: aucun ✓

**Analyse**
- Symptome: l'objet est nommé dans le message (« celui des poubelles », jeudi matin 8h) et l'historique de session contient le texte exact (« sortir les poubelles ») ; Sophia redemande quand même le contenu. Issue P9-A acceptable (clarify honnête plutôt que create), mais friction : slot déjà fourni.
- Source amont probable: la résolution d'antécédent sur un rappel CANCELLED refuse d'hériter l'instruction (héritage P6-A restreint aux pending ?) et le clarify ne consomme pas le créneau nominal « celui des poubelles » (P10-E).
- Owner runtime: intake one_shot_reminder (héritage d'instruction / anaphore d'entité).
- Meilleure correction: étendre l'héritage d'instruction P6-A/P10-E aux antécédents cancelled récents (la ligne existe en DB avec son instruction) — « remets celui des poubelles » ⇒ copie de l'instruction du dernier rappel poubelles annulé + create additif ; garder le clarify seulement si plusieurs candidats.
- Pourquoi ce n'est pas un patch local: c'est la même mécanique d'antécédent résoluble que P9-A ; la condition d'éligibilité (pending only) est trop étroite, c'est un ajustement du contrat d'héritage, pas une regex.

### Tour 14 — slot fourni

**Verdict du tour:** green

**User**
> le texte c'est juste : envoyer un message a ma voisine pour les poubelles. jeudi 8h du matin donc

**Sophia**
> C’est pris pour jeudi à 8h : envoyer un message à ma voisine pour les poubelles.

**Trace courte**
- ledger requested=1/committed=1 ; ligne 0036b49e pending 16/07 06:00 UTC = jeudi 8h Paris, texte exact du user ✓

### Tour 15 — clôture

**Verdict du tour:** green

**User**
> parfait, merci d'avoir suivi le rythme, c'etait le bazar ce matin. allez, j'attaque mes reunions

**Sophia**
> Bon rythme malgré le bazar, tu gères. Va poser ça en mode réunions, une chose après l’autre 🙂

**Trace courte**
- ledger all-zero ✓ ; clôture sobre, pas de relance parasite ✓

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Fil conversationnel naturel de bout en bout : Paul parle familier (fautes, clitiques sans trait d'union), Sophia suit sans jamais exiger un « langage de test ».
- Confirmations courtes et exactes sur les effets (T1-T4, T6, T8, T14), récap propre (T5), accueil humain sur les tours émotion/contexte (T7, T9, T15).
- Les clarifies sont honnêtes et n'affirment jamais un effet non committé (T13).

**Problemes**
- Tour 10: réponse au mass cancel vague et confuse (« il en reste de toute façon déjà aucun en attente ») sans énumération. Famille: BF-LEDGER-02. Impact: le user ne sait pas ce qui a été annulé exactement, doit re-demander (ce que T11 a dû faire). Sévérité: yellow.
- Tour 11: « exactement ces 5 et aucun autre » faux (6e omis) — corrigé seulement quand Paul pointe la ligne manquante (T12). Famille: BF-STATUS-01. Impact: confiance entamée sur une demande explicite de vérification. Sévérité: yellow.
- Tour 13: redemande d'un contenu déjà fourni + formulation répétitive (« il me manque » x2). Famille: BF-INTAKE-01. Impact: un tour de friction supplémentaire. Sévérité: yellow.
- Nits verts: fuite de vocabulaire interne « la ligne correspondante » (T12), écho première personne « préparer mon sac de sport » dans les récaps (T5/T11 — invariance de contenu voulue, mais un accord de personne serait plus naturel).

**Fix propose**
- Source amont: ledger mass-cancel sans cardinalité (T10), snapshot cancelled tronqué à 5 (T11), héritage d'instruction restreint aux pending (T13).
- Correction recommandee: voir feuille de bugs (3 lignes, corrections contractuelles).
- Tests d'invariant attendus: mass-cancel N≥2 ⇒ rendu énumère N ; 6+ cancels en 24h ⇒ jamais « aucun autre » sur liste tronquée ; « remets celui des X » avec X annulé récent ⇒ create hérité sans re-demande.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- 13/15 tours en normal_reply (direct effects ou défaut), 1 tour plan_realignment (T9, signal légitime, one-shot propre), 0 misroute. Dispatcher correct sur fan-out, cancel ciblé, mass cancel, verify.

**Skills / Operations / Tools**
- P9-A ✓ : antécédent non résoluble ⇒ create additif (T3) ou clarify honnête (T13), JAMAIS de replace/cancel destructif d'un rappel non lié — vérifié en DB après chaque tour.
- P9-B ✓ : mass cancel explicite exécuté 3/3 en DB + garde `mass_cancel_executed` loggée ; anti-FP ✓ (T6 : « tous » non adjacent ⇒ 1 seul cancel).
- P9-C ✓ : chaque « c'est décalé/annulé/pris » est adossé à un commit DB relu (T4, T6, T8, T14) ; l'unique émission parasite (T12, tour verify) a fini `blocked` sans claim.
- Replaces atomiques ✓ (T4, T8) avec héritage d'instruction.

**Memory / Effets durables**
- Aucune intention mémoire dans le run ⇒ pas de batch memorizer déclenché ; memory_items = 0 avant/après ✓.
- Tous les effets durables committés = lignes DB vérifiées (7 lignes créées, 6 cancelled en fin de conversation, 1 pending T14). Aucun commit fantôme, aucun déni de commit.

**Problemes**
- Tour 10: ledger porte 1 entrée agrégée pour 3 cancels DB — la comptabilité rendu=ledger (P7-B) n'a pas de matière pour énumérer. Famille: BF-LEDGER-02. Impact systeme: parité N-commits⇒N-annoncés non vérifiable sur le chemin mass-cancel. Sévérité: yellow.
- Tour 11: projection `loader.ts` cancelled snapshot `.limit(5)` sans count exact ⇒ affirmation d'exhaustivité fausse. Famille: BF-STATUS-01 (récidive structurelle du C3 côté cancelled). Sévérité: yellow.
- Tour 13: héritage d'instruction non appliqué sur antécédent cancelled nommé. Famille: BF-INTAKE-01. Sévérité: yellow.
- Note d'observabilité (non compté): la ligne `mass_cancel_executed` porte un metadata `{"error_name": "Error"}` parasite — le logger d'audit emprunte le format erreur pour un événement nominal ; cosmétique à nettoyer côté P11.

**Fix propose**
- Source amont: executor mass-cancel (ledger), context loader (snapshot cancelled), intake one_shot_reminder (héritage).
- Correction recommandee: détail dans la feuille de bugs.
- Tests d'invariant attendus: cf. feuille de bugs.

## Verdict Global

- Verdict: **yellow**
- Raison principale: les trois fixes P9 (A/B/C) tiennent en run réel — zéro effet durable faux sur 15 tours — mais la couture de RENDU/PROJECTION autour du mass-cancel fuit : pas d'énumération des annulés (T10) et une vérification qui affirme « aucun autre » sur une liste tronquée à 5 par le loader (T11), plus une redemande de slot sur re-create anaphorique (T13).
- Follow-up prioritaire: porter le fix C3 (charge large + count exact + interdiction d'exhaustivité sur liste tronquée) à la branche des one-shot CANCELLED du loader, et donner la cardinalité du mass-cancel au ledger.

## Observabilité P11

- Fenêtre lue: `system_error_logs` du 2026-07-15T02:27:00Z à la fin du run, `source IN ('guards','safety')`.
- Résultat: **1 ligne exactement** — `guards` / `mass_cancel_executed`, metadata `cancelled_count: 3`, timestamp 02:37:11Z = tour 10. Cohérente avec l'unique mass-cancel du run. ✓
- `safety`: 0 ligne — attendu, aucun signal safety dans le run. ✓
- Nit: metadata contient `"error_name": "Error"` sur un événement d'audit nominal (formatage du logger, pas un bug fonctionnel).

## Cleanup

- 7 lignes `scheduled_checkins` (one_shot_reminder) du run supprimées ; 30 `chat_messages` + `user_chat_states` du scope `qa-paul-p9reval-20260715` supprimés.
- Vérifié post-cleanup: 0 rappel one-shot, 0 entrée tracking, 0 memory_item (y compris candidate) pour Paul — état identique à l'inventaire pré-run.
- `system_error_logs` et `conversation_turn_traces` conservés (observabilité).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-15-paul-p9reval-r1.md`
