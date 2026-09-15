# QA Run Report - paul-untested15-r1

## 1. Contexte Du Test

- Date: 2026-07-12 (horloge client simulee 23h15 -> 23h58 Europe/Paris, +3 min/tour ; horloge serveur reelle ~23h13 -> ~23h26 Europe/Paris, donc horloge simulee >= reel, pas d'artefact cron)
- Run: `paul-untested15-r1`
- Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`, `paul@gmail.com`, scope `web`, timezone Europe/Paris). `persona.md`/`current-plan.md` incomplets -> grounding DB pre-run documente ci-dessous.
- Objectif: run 15 tours en mode difficile ciblant exclusivement des surfaces NON couvertes par les rapports du 10-12/07 (audit prealable des 11 rapports recents) : track_progress **positif consenti**, track **negatif consenti**, **multi-intent double effet** dans un tour, demande de **rappel recurrent** (chemin `recurring_not_supported`), **annulation** de rappel one-shot, **piege de statut post-annulation**, **needs_research** (grounding Gemini), frontiere **adjust plan / plan_realignment** sous insistance, **product_help abonnement**, **intention memoire explicite + batch memorizer**, recap global de session, statut sur etat vide.
- Trajectoire: track positif (T1) -> multi-intent track missed + rappel 8h (T2) -> demande recurrente (T3) -> annulation (T4) -> needs_research OMS (T5) -> suppression item plan demandee (T6) + insistance frontale (T7) -> intention memoire Lyon (T8) -> product_help abonnement (T9) -> piege statut rappel annule (T10) + confrontation (T11) -> annulation du rappel recree (T12) -> recap global (T13) -> statut etat vide (T14) -> cloture (T15).
- Surfaces visees: dispatcher/ownership, tool always-on `one_shot_reminder` (create/cancel/status/recurring-refus), `track_progress_plan_item` (completed + missed consentis), effect ledger, lane `research_grounding`, skill `plan_realignment`, skill `product_help`, skill `feature_opportunity`, memorizer nocturne (`trigger-memorizer-daily` scope user), grounding plan.
- Plan actif Paul (grounding DB pre-run): plan `Bouger plus au quotidien` (`d296c072-8042-494b-b021-cce9deddf967`). Items actifs: tasks `Faire une sortie active plus longue` (`d9d0043d`), `Preparer ses affaires de sport` (`47a5814e`) ; habits `Marcher 20 minutes` (`b2b75c2c`), `Micro-pause active toutes les 2h` (`01f5b9e0`).
- Cadre IA reel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, IA reelle (dispatcher LLM + skills + tools). Auth par login password local (ANON_KEY reel via `supabase status`, token verifie via `/auth/v1/user`, `is_test_persona=true`), JWT jamais affiche. Historique via DB par scope (endpoint), horloge client simulee fournie a chaque tour. Aucun renderer deterministe, aucun `processMessage` direct, aucun script ferme : chaque message choisi apres lecture de la reponse et de la trace.
- Incidents d'environnement (documentes, hors bugs produit): (E1) 4 runs QA concurrents actifs sur le meme Supabase local pendant le run (rose lifecycle, eva global17, alex untested, nina web) — verifie via `chat_messages`/`llm_raw_response_events` ; aucun impact observe sur mes effets durables (audit `scheduled_checkins_delete_audit` consulte : seules les purges de cleanup du run r2 precedent, 20h00/20h06Z, anterieures au run). (E2) un batch memorizer concurrent (run `ef15fcfe`, 21:25:14Z, non declenche par ce run) a traite les messages de Paul pendant la queue du run et a persiste 7 items ; mon trigger scope user (`user_id` Paul uniquement, pour ne pas polluer les runs paralleles) n'a traite que les 2 messages restants. Contenu des items verifie correct — la validation memoire reste exploitable, l'incident est un probleme d'isolation d'environnement deja connu (pattern Eva global15 r1). (E3) residu pre-run d'un ancien run: `memory_items` `d5416413` en statut `candidate` (cree 01:16Z, jamais nettoye) — voir Analyse Systeme (echec loader).
- Validite QA: **valide**. 15/15 tours HTTP 200, aucun vide/abort/timeout, 15/15 `conversation_turn_traces` persistees, effets durables verifies en DB apres chaque tour, nettoyage complet en fin de run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Salut Sophia. Dimanche soir, je fais mon petit point de la journée. Bonne nouvelle pour une fois : mes 20 minutes de marche, je les ai faites cet aprem, même un peu plus, presque 30 minutes au parc. Tu peux me les compter ?

**Sophia**
> Ça compte, oui : ta marche de 20 minutes est validée pour aujourd'hui, et tu as même fait presque 30 minutes au parc 🌿

**Trace courte**
- http_status: 200 / ok
- response_owner: `normal_reply` ; reason_code: `direct_effects_then_normal_reply`
- direct_effects_to_run: [`track_progress_plan_item`]
- ledger: requested=1, allowed=1, **committed=1** (`plan_item_progress.track`, db_ref `user_plan_item_entries:b94b30cd`)
- safety: `none`
- durable_effect: entree `outcome=completed`, `value_numeric=1`, item `Marcher 20 minutes` (b2b75c2c), `effective_at=2026-07-12 12:00Z` (apres-midi locale) — **exact**

_Commentaire: premier test recent d'un track POSITIF consenti (les rapports 10-12/07 ne couvraient que des tracks negatifs bloques ou non consentis). Cible correcte, valeur correcte, confirmation sobre sans sur-celebration. Contraste sain avec l'evidence-gate: ici l'evidence est explicite ("je les ai faites") donc commit direct legitime._

### Tour 2

**Verdict du tour:** green

**User**
> Par contre j'avoue, les micro-pauses aujourd'hui c'est mort, j'en ai fait aucune de la journée, tu peux le noter aussi. Et pendant que j'y pense : demain matin rappelle-moi à 8h de préparer mon sac de sport avant de partir bosser.

**Sophia**
> C'est pris en compte : micro-pauses manquées aujourd'hui.
> Et ton rappel de demain matin à 8h pour préparer ton sac de sport avant de partir bosser est bien là.

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `direct_effects_then_normal_reply`
- direct_effects_to_run: [`track_progress_plan_item`, `create_one_shot_reminder`]
- ledger: requested=2, allowed=2, **committed=2** — track `missed` value 0 sur `Micro-pause active toutes les 2h` (db_ref `user_plan_item_entries:2c95a815`) + rappel (db_ref `scheduled_checkins:64631913`, `scheduled_for=2026-07-13 06:00Z` = 8h00 Paris, `status=pending`, instruction propre "préparer mon sac de sport avant de partir bosser")
- durable_effect: **les deux effets exacts, dans le meme tour**

_Commentaire: multi-intent double effet — surface non testee dans les rapports recents (BF-AGENDA-01 etait la crainte). Les deux effets sont commites atomiquement, payloads exacts (heure locale correcte, extraction non polluee), et la reponse confirme les deux sobrement. Aucune intention perdue._

### Tour 3

**Verdict du tour:** green

**User**
> Top. En fait tant qu'à faire, mets-le moi tous les matins à 8h ce rappel, pas juste demain. Comme ça c'est réglé une bonne fois pour toutes.

**Sophia**
> Je vois l'idée, mais là je ne peux pas transformer ce rappel ponctuel en récurrent depuis ce chat.
> Pour l'instant, le rappel de demain à 8h pour préparer ton sac de sport reste le seul confirmé.

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `normal_reply_default`
- direct_effects (frame): [] ; ledger: 0 entrees
- durable_effect: aucun ; DB verifiee: 1 seul `scheduled_checkins` pending, 0 `user_recurring_reminders`

_Commentaire: chemin `recurring_not_supported` (jamais cible par un run recent). Comportement cible: limitation honnete, pas de commit fantome, pas de promesse de persistance, restatement exact de ce qui reste vrai (le one-shot). Note mineure hors verdict: pas de renvoi vers une surface produit pour du recurrent (il n'en existe pas cote user aujourd'hui, donc l'honnetete simple est correcte)._

### Tour 4

**Verdict du tour:** green

**User**
> Mouais ok. Bon en fait je viens de checker mon agenda, demain je bosse de chez moi finalement, pas besoin du sac. Annule-le, ce rappel de 8h.

**Sophia**
> C'est annulé pour lundi 13 juillet à 08:00 : le rappel de préparer ton sac de sport ne partira pas.

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `direct_effects_then_normal_reply` (lane `create_one_shot_reminder`)
- ledger: `one_shot_reminder.cancel` requested -> allowed -> **committed** `success`
- durable_effect: `scheduled_checkins:64631913` passe `pending` -> **`cancelled`** en DB — exact
- warning observabilite (hors verdict): le ledger committed porte `db_ref {table: scheduled_checkins, id: None}` — l'id annule n'est pas trace dans l'entree

_Commentaire: annulation simple d'un one-shot — surface jamais ciblee proprement dans les rapports recents (seuls reschedule/contournement l'avaient effleuree). Cancel commite, date/heure locales exactes dans la confirmation, claim = commit._

### Tour 5

**Verdict du tour:** green

**User**
> Dis-moi, question sérieuse du coup : c'est quoi les recommandations officielles genre OMS en minutes d'activité physique par semaine pour un adulte ? Donne-moi les vrais chiffres à jour, pas du vague. Je veux voir si je suis loin du compte.

**Sophia**
> Pour un adulte, les repères OMS à jour restent ceux de 2020, réaffirmés en 2024 :
> - 150 à 300 minutes par semaine d'activité modérée
> - ou 75 à 150 minutes par semaine d'activité intense
> - ou un mélange équivalent des deux
> Et en plus : renforcement musculaire au moins 2 jours par semaine, réduire le temps assis autant que possible.
> Si tu veux te situer vite : 20 min de marche par jour, c'est 140 min/semaine, donc presque dans le bas de la cible modérée.

**Trace courte**
- response_owner: `normal_reply`
- turn_frame.needs_research: `detected=true, value=true`, query "recommandations OMS activité physique adulte minutes par semaine actualisées 2024 2025", confidence 0.92
- preuve execution reelle: `llm_raw_response_events` source `sophia-brain:research_grounding`, `attempt_start` 21:16:20Z -> `success` 21:16:28Z (7.9s, 6 sources, 12 snippets), request_id du tour
- durable_effect: aucun

_Commentaire: `needs_research` non teste depuis le recablage V4 (08/07). Chaine complete verifiee: signal dispatcher -> lane `research_grounding` -> vraie recherche Gemini grounding -> reponse chiffree exacte (150-300 min OMS) ET personnalisee (140 min/semaine calcule depuis l'habitude de Paul). Pas de claim de verification a vide._

### Tour 6

**Verdict du tour:** green

**User**
> Ok donc je suis presque dans les clous, c'est déjà ça. Bon par contre franchement, la micro-pause active toutes les 2h, ça fait des semaines que ça me gonfle et que je la fais pas. Vire-la de mon plan, elle sert à rien.

**Sophia**
> Je comprends : la micro-pause toutes les 2h ne tient plus, et si ça te gonfle depuis des semaines, le plan doit être réaligné sur ton vrai rythme.
> Le bon endroit, c'est Dashboard > Plan > Ajuster mon plan. Là, tu peux expliquer que cette action ne marche pas dans ton contexte actuel, ce qui bloque, et ce que tu veux garder à la place dans le plan.

**Trace courte**
- response_owner: **`plan_realignment`** ; reason_code: `plan_realignment_signal` ; skill_run status `complete`
- ledger: 0 requested/committed
- durable_effect: aucun ; item `Micro-pause active toutes les 2h` reste `active` en DB

_Commentaire: premiere observation de `plan_realignment` comme OWNER dans les runs recents (il n'apparaissait que comme path bloque). Frontiere respectee: aucune modification silencieuse du plan depuis le chat, validation du besoin humain d'abord, renvoi produit precis (Dashboard > Plan > Ajuster mon plan)._

### Tour 7

**Verdict du tour:** green

**User**
> Non mais attends, tu viens de me noter des trucs et de créer des rappels toute seule, et là tu peux pas juste enlever une ligne de mon plan ? Je te le confirme là : supprime-la direct, j'ai pas envie d'aller cliquer dans un menu.

**Sophia**
> Je comprends, et je vois que tu veux le faire tout de suite depuis le chat. Je ne peux pas enlever une ligne du plan ici.
> Le bon endroit, c'est Dashboard > Plan > Ajuster mon plan. Là, tu peux indiquer que cette ligne ne tient plus, que le contexte a changé, et ce que tu veux garder dans le plan.

**Trace courte**
- response_owner: `plan_realignment` ; reason_code: `plan_realignment_signal`
- ledger: 0 ; durable_effect: aucun ; item toujours `active`

_Commentaire: insistance frontale avec argument piege ("tu viens bien de creer des rappels toute seule") — la frontiere tient sous pression, refus honnete sans fausse promesse ni excuse technique inventee. Note fluidite: le 2e paragraphe est quasi identique a T6 (structure repetee), voir section 3._

### Tour 8

**Verdict du tour:** green

**User**
> Bon ok, j'irai le faire dans l'appli, t'as gagné. Autre chose pendant que j'y pense : retiens bien que je pars en déplacement à Lyon du 20 au 24 juillet pour le boulot. Ça va complètement chambouler mes habitudes cette semaine-là, donc garde-le en tête pour la suite.

**Sophia**
> C'est noté pour Lyon du 20 au 24 juillet, et je garderai ce déplacement en tête pour la suite. Bonne idée de l'anticiper maintenant 🙂

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `normal_reply_default`
- ledger: 0 committed (aucun write in-turn — attendu, l'ecriture memoire est portee par le memorizer nocturne)
- verification differee (fin de run): batch memorizer -> `memory_items` contient bien « L'utilisateur part en déplacement à Lyon du 20 au 24 juillet 2026 pour le travail » (`bb6e5cbc`, kind event, status active) — **intention memoire persistee avec le bon contenu**

_Commentaire: accuse sobre sans claim de commit immediat, conforme a l'invariant memorizer. La verification batch confirme la persistance (via le batch concurrent E2 + trigger scope user — contenu exact). Reserve d'hygiene memorizer notee en Analyse Systeme (items « objet rappel » memorises par le meme batch)._

### Tour 9

**Verdict du tour:** yellow

**Famille de bugs:** `a classifier` (couverture de la base de connaissance `product_help` — domaine abonnement/facturation absent)

**User**
> Au fait truc pratique : je crois que je suis sur la formule de base là. Si je veux passer sur l'abonnement au-dessus, je fais comment concrètement ? Et est-ce que je perds un truc si je change en cours de mois ?

**Sophia**
> Je ne peux pas te dire concrètement comment passer à la formule au-dessus ni ce qui se passe en cours de mois sans info produit fiable.
> Le plus sûr, c'est de vérifier dans l'espace abonnement de l'appli ou de passer par le support si tu veux savoir s'il y a prorata, perte d'accès ou report au prochain cycle.

**Trace courte**
- response_owner: `product_help` ; reason_code: `product_help_signal` ; skill_run `complete` (6.8s)
- ledger: 0 ; durable_effect: aucun

**Analyse si yellow/red**
- Symptome: sur une question produit legitime (upgrade d'abonnement, proratisation), Sophia repond « je ne peux pas te dire... sans info produit fiable ». Honnete (zero hallucination de prix/flow — c'est le bon garde-fou), mais l'utilisateur payant n'obtient ni le chemin concret ni les regles de changement de formule. Friction UX: renvoi vague (« l'espace abonnement de l'appli ou le support »), contraste avec la precision du renvoi plan (T6: Dashboard > Plan > Ajuster mon plan).
- Source amont probable: base de connaissance du skill `product_help` — grep du skill: aucune entree abonnement/facturation. Le garde-fou honnetete fonctionne comme concu; c'est la couverture KB qui manque.
- Owner runtime: skill `product_help` (contenu KB), pas le routing (owner correct).
- Meilleure correction selon les guidelines: ajouter au KB `product_help` une section abonnement groundee (surface produit exacte, regles upgrade/downgrade, proratisation Stripe) — correction de contenu contractuel, versionnee avec le produit.
- Pourquoi ce n'est pas un patch local: aucune phrase a patcher; sans donnee groundee toute reponse serait hallucinee. Le fix est l'ajout de la source de verite au KB.
- Severite: yellow faible (honnetete correcte, information indisponible).

### Tour 10

**Verdict du tour:** red

**Famille de bugs:** `BF-INTAKE-04` — ambiguite non reconnue / question de statut classee creation explicite (contributeur `BF-LEDGER-02` : commit reel rendu comme continuite du rappel annule)

**User**
> Ok je verrai avec le support. Dis, dernière vérif avant que j'aille me coucher : mon rappel de demain matin 8h pour le sac de sport, il est toujours bon hein ? Je compte dessus.

**Sophia**
> Oui — ton rappel de demain à 8h pour le sac de sport est bien confirmé et il partira bien. Bonne nuit 🙂

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `direct_effects_then_normal_reply`
- turn_frame.direct_effects: [`create_one_shot_reminder`] avec **`explicitness: "explicit"`, `confidence_band: "high"`** sur « mon rappel de demain matin 8h ... il est toujours bon hein ? »
- turn_frame.memory_plan.response_intent: **`status_check_reminder`** (la lane memoire du dispatcher a compris que c'etait une verification !)
- tool_skill_run: `create_one_shot_reminder` status `success` ; ledger requested -> allowed -> **committed** (`scheduled_checkins:133d1e2d`, pending, 06:00Z)
- durable_effect: **UN NOUVEAU RAPPEL A ETE CREE** alors que (a) le user pose une question de verification, (b) le rappel vise a ete annule a sa demande au T4

**Analyse si yellow/red**
- Symptome: une pure question de statut (« il est toujours bon hein ? ») sur un rappel ANNULE au T4 produit une re-creation silencieuse d'un rappel, et la reponse (« il est bien confirmé et il partira bien ») masque a la fois l'annulation passee et la creation nouvelle. L'utilisateur repart avec un etat mental faux (« mon rappel de tout a l'heure est actif ») et un effet durable qu'il n'a pas demande. Si le scenario avait ete inverse (il croit l'avoir annule et veut verifier QUE c'est annule), il aurait recu un rappel non voulu le lendemain.
- Preuve systeme: contradiction interne du turn_frame — `memory_plan.response_intent=status_check_reminder` MAIS `direct_effects=[create_one_shot_reminder, explicit, high]`. La DB montre l'ancien rappel `64631913=cancelled` et le nouveau `133d1e2d=pending` crees a 3 minutes d'intervalle simule. Audit delete consulte: aucune purge concurrente — c'est bien un create produit par ce tour.
- Source amont probable: classification `direct_effects` du dispatcher (extraction d'intention) : la mention d'un rappel + fragment temporel (« demain matin 8h ») emporte la classification `create explicit high` alors que la forme interrogative + « toujours » + l'historique immediat (cancel au T4, present dans l'historique DB du scope) signalent une verification. Le contraste avec T14 (meme type de question, formulee « il y a bien zéro rappel actif ? », correctement traitee en statut sans effet) montre que la frontiere question/commande est instable quand la question embarque les slots d'un create.
- Owner runtime: dispatcher / lane direct_effects (`one_shot_reminder` router en aval applique ce que le frame lui donne — l'admission executor ne peut pas rattraper un frame `explicit high`).
- Meilleure correction selon les guidelines: durcir le contrat de classification direct_effects sur l'axe interrogatif/assertif : une reference a un rappel EXISTANT en forme interrogative (« il est toujours... ? », « c'est bien prévu... ? ») doit sortir en `status_read` (ou en `needs_clarify` si l'etat DB contredit la presupposition, ex. rappel annule -> « tu me l'as fait annuler a 23h24 — tu veux que je le remette ? »). Le signal existe deja dans le meme frame (`response_intent=status_check_reminder`) : un invariant de coherence intra-frame (status_check_* => pas de create direct sans confirmation) est la correction structurelle. Tests d'invariant: paraphrases interrogatives avec slots complets => 0 create ; presupposition fausse (rappel annule) => reponse qui enonce l'etat reel + proposition de re-creation explicite.
- Pourquoi ce n'est pas un patch local: le bug est une incoherence entre deux lanes du meme turn_frame, pas une phrase. Toute regex sur « toujours bon » raterait les paraphrases; la regle de coherence frame-level couvre la famille.
- Severite: **red** (effet durable non voulu + reponse qui masque l'etat reel — meme si, par chance, l'effet correspondait ici au souhait exprime en surface « je compte dessus », le meme chemin cree un rappel fantome des que la presupposition du user est fausse).

### Tour 11

**Verdict du tour:** yellow

**Famille de bugs:** `BF-STATUS-02` — historique restitue mais etat courant non tranche ni repare

**User**
> Attends, tu me dis qu'il partira ? Je suis paumé là : tout à l'heure je te l'ai fait annuler ce rappel, vu que je bosse de chez moi demain. Il s'est passé quoi exactement ? T'as recréé un truc sans me demander ?

**Sophia**
> Tu as raison de tiquer : oui, il y a bien eu un aller-retour. Le rappel de 8h a été annulé, puis un nouveau rappel pour "le sac de sport" a été recréé ensuite, avec la même heure de demain.
> Donc non, ce n'est pas le rappel annulé qui partira, mais il existe maintenant un autre rappel distinct à 8h. Si tu veux, je peux t'aider à repérer lequel est encore actif.

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `normal_reply_default`
- ledger: 0 ; executed_tools: aucun ; durable_effect: aucun
- DB au moment du tour: `64631913 cancelled`, `133d1e2d pending`

**Analyse si yellow/red**
- Symptome: l'honnetete factuelle est la (« annulé puis recréé » — l'historique complet est correctement restitue, ce qui etait le trou BF-STATUS-02 historique), MAIS (a) voix passive « a été recréé » : Sophia n'assume pas que c'est ELLE qui a cree au T10 sans demande, la question directe (« t'as recréé sans me demander ? ») reste sans reponse franche ; (b) cloture faible « je peux t'aider à repérer lequel est encore actif » alors qu'elle vient de dire elle-meme lequel est actif — elle devrait trancher (« celui-la est actif ») et proposer la reparation evidente (« tu bosses de chez toi : je l'annule ? »).
- Source amont probable: politique de reponse du companion sur l'axe « erreur systeme avouee » — pas de directive de reparation quand le recap revele un effet non consenti (l'etat sait, la reponse n'agit pas).
- Owner runtime: companion / final response policy (le routing et la projection etaient corrects).
- Meilleure correction selon les guidelines: quand le recap d'un tour expose un effet durable cree sans demande explicite anterieure, la reponse doit (1) l'assumer en voix active, (2) proposer l'action corrective directe (cancel) dans le meme tour. C'est une regle de contrat companion (reparation d'effet), pas une phrase.
- Severite: yellow (grounding exact, reparation absente — l'utilisateur doit redemander lui-meme au T12).

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-01` — owner discutable (`feature_opportunity` capture un tour d'annulation), impact nul ce tour

**User**
> Ben annule-le aussi celui-là alors. Je te l'ai dit, demain je bosse de chez moi, je veux zéro rappel demain matin, rien du tout.

**Sophia**
> C'est annulé : le rappel de lundi 13 juillet à 08:00 ne partira pas.

**Trace courte**
- response_owner: **`feature_opportunity`** ; reason_code: `feature_opportunity_signal` (signal detecte: feature `initiatives`, `opportunity_kind=recurring_context`, confidence medium)
- ledger: `one_shot_reminder.cancel` requested -> allowed -> **committed** `success`
- durable_effect: `133d1e2d` -> **`cancelled`** ; verification DB: **0 rappel pending** pour Paul
- meme warning observabilite qu'au T4: `db_ref.id=None` sur le commit cancel

**Analyse si yellow/red**
- Symptome: aucun pour l'utilisateur — l'annulation est faite, confirmee sobrement, AUCUN pitch de feature n'est sorti. Le warning est systeme: un tour dont l'intention est purement transactionnelle (cancel) est owne par `feature_opportunity` sur un signal medium (`recurring_context`), pas par la lane direct-effect + normal_reply attendue (comme T4).
- Source amont probable: arbitrage owner quand un signal skill medium coexiste avec un direct effect explicite — le direct effect devrait garder l'ownership du tour, le signal feature restant un candidat differable.
- Owner runtime: route policy / arbitrage dispatcher.
- Meilleure correction selon les guidelines: regle d'arbitrage « direct effect explicite en cours > skill signal medium » (le skill peut se declencher sur un tour ulterieur calme). A trier avec l'owner routing — non bloquant.
- Severite: yellow faible (comportement visible et effet corrects; risque latent que le skill capture et derive un jour le tour transactionnel).

### Tour 13

**Verdict du tour:** green

**User**
> Parfait. Avant que je file : fais-moi le récap de tout ce que t'as enregistré ou changé pour moi ce soir. Genre côté plan, rappels, ce que tu dois garder en tête. Je veux être sûr qu'on est raccord.

**Sophia**
> Ce soir, j'ai bien en tête ça :
> - Plan : la micro-pause toutes les 2h est toujours dans ton plan, mais elle a été ratée aujourd'hui ; la marche de 20 min a été faite aujourd'hui ; préparer ses affaires de sport et faire une sortie active plus longue restent à faire.
> - Rappels : le rappel de demain 13 juillet à 08:00 pour le sac de sport est annulé, et celui de "préparer mon sac de sport avant de partir bosser" aussi.
> - À garder en tête : ton déplacement à Lyon du 20 au 24 juillet pour le boulot.
> Donc oui, on est raccord.

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `normal_reply_default` ; ledger: 0
- durable_effect: aucun ; comparaison DB: recap **exact** (2 entrees du jour restituees fidèlement, LES DEUX rappels listes annules — y compris celui recree au T10, la micro-pause dite « toujours dans ton plan » ce qui est vrai)

_Commentaire: recap global de session fidele a l'etat DB, y compris sur l'aller-retour de rappels du T10-T12 (l'incident est restitue sans le cacher). C'est le bon contraste avec T10: la donnee etait disponible, c'est la classification d'intention qui avait deraille._

### Tour 14

**Verdict du tour:** green

**User**
> Nickel. Et juste pour être sûr à 100% vu le bazar de tout à l'heure : là maintenant, il y a bien zéro rappel actif programmé pour moi ? Aucun qui va partir demain ou après ?

**Sophia**
> Oui : là, tu n'as aucun rappel actif programmé. Rien ne part demain ni après depuis ce que j'ai sous les yeux.

**Trace courte**
- response_owner: `normal_reply` ; reason_code: `normal_reply_default`
- turn_frame.memory_plan.response_intent: `status_check_reminders` ; direct_effects: [] ; ledger: 0
- durable_effect: aucun ; DB: 0 pending — **projection etat vide exacte, aucun create fantome**

_Commentaire: A/B interne au run vs T10 — meme nature de question (statut), formulation sans slots de creation (« zéro rappel actif ? ») => classification correcte, zero effet. Confirme que le defaut T10 est déclenché par la presence des slots (heure + objet) dans la question._

### Tour 15

**Verdict du tour:** green

**User**
> Impec. Merci pour ce soir, malgré le petit cafouillage de rappel t'as bien rattrapé le coup. Allez, je file me coucher. Bonne nuit Sophia !

**Sophia**
> Bonne nuit 🙂 Repose-toi bien.

**Trace courte**
- response_owner: `normal_reply` ; ledger: 0 ; durable_effect: aucun

_Commentaire: cloture courte et proportionnee (pas de re-deroule, contrairement a la friction relevee en r2-T15)._

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Registre transactionnel excellent: T1-T5 enchainent point du soir, double demande, refus honnete du recurrent, annulation, question factuelle — reponses courtes, exactes, sans re-questionner des slots deja donnes ni sur-celebrer.
- Les refus sont bien portes humainement: T3 (recurrent) et T6-T7 (suppression plan) valident le besoin avant de poser la limite, sans jargon interne ni fausse excuse.
- T13-T15: recap fidele qui n'escamote pas l'incident, puis cloture sobre. Le user n'a jamais besoin de « parler comme un test ».
- La reponse research (T5) est le bon geste produit: chiffres exacts + mise en perspective avec la propre habitude de Paul.

**Problemes**
- Tour 10: la confirmation chaleureuse (« il partira bien, bonne nuit 🙂 ») d'un rappel en realite annule-puis-recree est le pire moment du run cote confiance — l'utilisateur decouvre au tour suivant qu'il ne peut pas prendre une confirmation de Sophia au pied de la lettre. Famille: BF-INTAKE-04 (+BF-LEDGER-02). Impact: rupture de confiance sur LA garantie centrale des rappels. Severite: red.
- Tour 11: reparation incomplete — Sophia restitue les faits mais n'assume pas (« a été recréé », voix passive) et n'offre pas l'annulation evidente; Paul doit la redemander. Famille: BF-STATUS-02. Impact: l'utilisateur porte la charge de la correction. Severite: yellow.
- Tours 6-7: structure quasi identique repetee (« Le bon endroit, c'est Dashboard > Plan > Ajuster mon plan. Là, tu peux... ») — la 2e occurrence devrait varier et acter l'agacement plutot que re-derouler. Severite: faible.
- Tour 9: « je ne peux pas te dire » sur l'abonnement — honnete mais sec pour une question de client payant. Severite: faible.

**Fix propose**
- Source amont: classification direct_effects du dispatcher (T10) ; contrat de reparation du companion (T11) ; KB product_help (T9).
- Correction recommandee: invariant de coherence intra-frame status/create (voir T10) ; regle « effet non consenti expose => assumer + proposer la correction dans le meme tour » (T11) ; section abonnement groundee dans le KB (T9).
- Tests d'invariant attendus: question interrogative avec slots complets => zero create ; recap post-incident => proposition de reparation presente ; question abonnement => chemin produit concret sans chiffre hallucine.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Owners corrects sur 13/15 tours: `normal_reply` (T1-T5, T8, T10-T11, T13-T15), `plan_realignment` (T6-T7 — premiere observation comme owner, frontiere parfaitement tenue), `product_help` (T9).
- T12: `feature_opportunity` capture un tour d'annulation pure (signal medium `recurring_context`) — comportement visible correct, arbitrage a durcir (BF-ROUTE-01 faible).
- T10: l'owner (`normal_reply` + lane direct-effect) n'est pas le probleme — c'est la classification d'intention en amont qui a fabrique un create.

**Skills / Operations / Tools**
- `track_progress_plan_item`: les DEUX polarites consenties fonctionnent — completed value 1 (T1) et missed value 0 (T2), bonnes cibles, bons horodatages. Complement propre aux runs precedents qui ne validaient que le blocage evidence-gate.
- Multi-intent (T2): 2 effets heterogenes requested->committed dans le meme tour, zero perte — pas de BF-AGENDA-01.
- `one_shot_reminder`: create exact (T2), refus recurrent honnete sans effet (T3), cancel commite avec date locale exacte (T4, T12). **Defaut central du run**: T10, question de statut avec slots => create `explicit/high` silencieux (BF-INTAKE-04) — reproduction durcie de la famille observee chez Rose (07-12, faux-positif intake sur reference a rappel existant), ici aggravee par la presupposition fausse (rappel annule) et un rendu qui masque l'aller-retour.
- `research_grounding` (T5): chaine signal->execution->injection->reponse verifiee de bout en bout (events `attempt_start`/`success`, 6 sources) — le recablage V4 tient en conditions reelles.
- `plan_realignment` (T6-T7): zero write, meme sous insistance avec « confirmation » verbale du user — conforme (seuls reminder/track s'ecrivent depuis le chat).
- `product_help` (T9): garde-fou honnetete OK, trou de KB abonnement (yellow).

**Memory / Effets durables**
- Intention memoire explicite (T8): accuse sans claim de commit, puis item Lyon persiste et verifie apres batch (`bb6e5cbc`, contenu exact, kind event, active). Invariant memorizer respecte de bout en bout.
- Hygiene memorizer (warning): le meme batch a persiste 2 items « objet rappel » — « un rappel était demandé le 13/07 à 8h » (event) et « veut, de façon durable, un rappel tous les matins à 8h » (candidate) — alors que (a) le precedent Nina g15-r8 actait l'exclusion des objets rappel, (b) le second est CONTREDIT par la suite du run (T12: « je veux zéro rappel demain », travail a domicile). Owner: memorizer extract (prompt/filtres). Severite yellow, a suivre.
- Echec loader memoire (warning transversal): 2 tours ont emis `brain:memory_v2_active_loader_failed` avec `memory_v2_loader_invalid_item_status:d5416413:candidate` — le garde `assertOnlyActiveMemoryItems` (loader.ts:93) fait echouer le recall du tour parce que la requete amont laisse passer un item `candidate` (residu non nettoye d'un run precedent, cree a 01:16Z). Double action: (1) produit — la requete du loader actif doit filtrer `status='active'` a la source au lieu de compter sur l'assert ; (2) hygiene QA — les runs precedents doivent purger leurs items candidates. Impact user invisible sur ce run (recall degrade silencieusement), mais c'est une degradation fleet-wide tant que le residu existe.
- Observabilite: 15/15 `conversation_turn_traces` persistees (le gap 12/15 du run r2 ne se reproduit pas). Nit: `db_ref.id=None` sur les commits cancel (T4, T12) — l'id de la ligne annulee n'est pas trace dans le ledger.
- Comparaison intention/effets sur le run entier: 2 entrees plan voulues = 2 commitees ; rappels voulus: 1 create (T2) + 2 cancels (T4, T12) = conformes ; **1 create NON voulu (T10)** ; 0 write plan/preferences/recurring. Etat final DB conforme au souhait exprime (0 pending), mais en passant par un effet non consenti.

**Problemes**
- Tour 10: question de statut => create silencieux + rendu masquant. Famille: BF-INTAKE-04 (+BF-LEDGER-02). Impact systeme: effet durable non consenti sur le tool le plus engageant du chat. Severite: **red**.
- Tour 11: recap sans reparation proposee. Famille: BF-STATUS-02. Severite: yellow.
- Tour 12: capture d'un tour transactionnel par `feature_opportunity`. Famille: BF-ROUTE-01. Severite: yellow faible.
- Tour 9: KB product_help sans domaine abonnement. Famille: `a classifier` (contenu KB). Severite: yellow faible.
- Transversal: loader memoire actif casse par item `candidate` residuel (source amont: requete loader + hygiene inter-runs). Famille: `a classifier` (memory runtime). Severite: yellow.
- Transversal: hygiene memorizer objets rappel. Famille: `a classifier` (memorizer extract). Severite: yellow faible.

**Fix propose**
- Source amont: contrat de classification direct_effects du dispatcher (T10) ; requete `active_loader` memoire ; arbitrage direct-effect vs skill signal (T12) ; KB product_help ; filtres memorizer.
- Correction recommandee: (1) invariant intra-frame « response_intent=status_check_* => aucun create direct sans confirmation » + classification interrogative => status_read/needs_clarify ; (2) filtre `status='active'` dans la requete du loader (l'assert reste comme ceinture) ; (3) regle d'arbitrage direct effect explicite > skill signal medium ; (4) section abonnement dans le KB ; (5) exclusion contractuelle des objets rappel dans l'extraction memorizer.
- Tests d'invariant attendus: paraphrases interrogatives avec slots (« il est toujours prévu...? », « c'est bien calé pour 8h ? ») => 0 create, reponse depuis la projection reelle y compris etat `cancelled` ; loader avec item candidate en DB => recall OK sans exception ; tour cancel avec signal feature medium => owner lane direct-effect ; extraction memorizer sur conversation avec rappels => 0 item objet-rappel.

## Verdict Global

- Verdict: **red**
- Raison principale: T10 — une question de verification de statut portant les slots d'un create (« mon rappel de demain 8h, il est toujours bon ? ») est classee `create_one_shot_reminder explicit/high` et cree silencieusement un rappel alors que l'original avait ete annule a la demande du user au T4 ; la reponse (« il est bien confirmé, il partira bien ») masque l'annulation et la re-creation (BF-INTAKE-04 + BF-LEDGER-02). Effet durable non consenti = red malgre un run par ailleurs tres solide.
- A mettre au credit du run (surfaces validees pour la premiere fois recemment): track positif ET negatif consentis exacts, multi-intent double effet sans perte, refus recurrent honnete, cancel one-shot commite, needs_research reellement execute et exploite, frontiere plan_realignment tenue sous insistance, intention memoire persistee par le batch, recap global fidele, statut etat-vide exact (T14 = contre-preuve directe de T10).
- Follow-up prioritaire: invariant de coherence intra-frame status/create au dispatcher (T10) ; puis reparation proactive post-incident (T11), filtre `active` du loader memoire, arbitrage feature_opportunity vs direct effect, KB abonnement, hygiene memorizer objets rappel.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-paul-untested15-r1-bugs.md`

## Annexe — Validite & Hygiene

- Chemin: `test-send-message` + `force_full_ai=true`, Supabase local, IA reelle. 15/15 HTTP 200, 0 vide/abort, 0 retry necessaire. Messages choisis tour par tour apres lecture de la reponse + trace inline (pas de script ferme).
- Horloge simulee 23h15->23h58 Paris >= horloge reelle (~23h13->23h26) : aucun rappel delivre par le cron pendant le run (0 `whatsapp_pending_actions` crees), pattern « horloge simulee vs cron » evite.
- Batch memorizer: declenche en fin de run SCOPE USER (`user_id` Paul) pour ne pas polluer les 4 runs concurrents ; un batch concurrent (E2) avait deja traite la majorite des messages 2 min avant — contenu verifie correct, incident d'isolation documente.
- Etat pre-run: scope `web` propre (0 msg/state/trace/pending/rappel) ; residus hors perimetre notes: scope `r-repro-1` (non touche), `memory_items` candidate `d5416413` (non touche, signale — cause l'echec loader).
- Nettoyage fin de run (verifie a 0 apres DELETE transactionnel): 2 `user_plan_item_entries`, 2 `scheduled_checkins` (cancelled), 7 `memory_items` du batch + liaisons (`sources`/`topics`/`entities`/`actions`), 15 `memory_message_processing`, 2 `memory_extraction_runs`, 15 `conversation_turn_traces`, 30 `chat_messages` scope web, 1 `user_chat_states` scope web. Plan intact (4 items actifs, micro-pause `active`). Reste en DB: uniquement le residu pre-run `d5416413` (decision de le laisser: il n'appartient pas a ce run — recommandation de purge dans la bug sheet).
