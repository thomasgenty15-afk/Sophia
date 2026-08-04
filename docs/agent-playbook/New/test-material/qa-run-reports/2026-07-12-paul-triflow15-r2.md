# QA Run Report - paul-triflow15-r2

## 1. Contexte Du Test

- Date: 2026-07-12 (horloge client simulee ~09h30 Europe/Paris, avancee de +3 min/tour ; horloge serveur reelle ~20h15 Europe/Paris)
- Run: `paul-triflow15-r2` (variante de `paul-triflow15-r1` du 2026-07-10, meme objectif QA)
- Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`, `paul@gmail.com`, scope web, timezone Europe/Paris). NB: `persona.md` porte un `user_id` perime (`3b2d22cd-...`) ; l'identite reelle du token password fait foi (`d265435c-...`, verifiee via `/auth/v1/user`).
- Objectif: run conversationnel de 15 tours passant deliberement par les flux **coaching_recommendation**, **presence_conversation** et **normal_reply**, avec une **demande de rappel ponctuel (one-shot reminder)** placee en cours de route.
- Trajectoire: normal + report d'action (T1) -> coaching carte de defense, discipline technique-matching (T2-T5) -> creation rappel one-shot 14h (T6, pendant flow coaching) -> presence / reflexion de fond « lutte contre l'inertie » (T7-T9) -> topic-change transactionnel + verification du rappel (T10) -> grounding plan (T11) -> reco legere ancree (T12) -> preference de ton BF-PREF-01 (T13) -> coaching moment de rupture (T14) -> cloture (T15).
- Surfaces visees: dispatcher/ownership, skill `coaching_recommendation` (+ flow collant, technique-matching), flow `presence_conversation` (entree + sortie sur topic-change), tool always-on `one_shot_reminder` (create + status read), effect ledger + evidence-gate `track_progress_plan_item`, grounding plan, comportement cible BF-PREF-01.
- Cadre IA reel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, Supabase local, chemin IA reel Sophia (dispatcher LLM + skills reels). Historique maintenu cote runner et repasse a chaque tour ; horloge client simulee fournie a chaque tour. Aucun fallback deterministe, aucun renderer, aucun `processMessage` direct.
- Plan actif Paul (grounding DB): plan `Bouger plus au quotidien` (`d296c072-...`). Items actifs: tasks `Faire une sortie active plus longue`, `Preparer ses affaires de sport` ; habitudes `Marcher 20 minutes`, `Micro-pause active toutes les 2h`.
- Validite QA: **valide**. 15/15 tours HTTP 200, aucun vide/abort, chemin IA reel, effet durable observe en DB (rappel), grounding plan verifie, puis nettoyage complet.

## 2. Tours De Conversation

### Tour 1
**Verdict du tour:** green

**User**
> Hello Sophia, ça va ? Petit matin tranquille pour moi, café à la main. Bon, je t'avoue que ma sortie active un peu plus longue, celle que je voulais caler ce week-end, ça fait trois fois que je la repousse. J'y pense mais je la fais jamais.

**Sophia**
> Ça sent surtout le report qui s'installe, pas un vrai oubli. Tu as déjà l'intention, mais l'élan retombe au moment d'y aller. Si tu veux, je peux t'aider à la remettre au clair sans te la vendre en grand plan.

**Trace courte**
- http_status: 200 / ok
- response_owner: `normal_reply`
- route_reason: `direct_effects_then_normal_reply`
- direct_effects_to_run: [`track_progress_plan_item`]
- ledger: requested=1, allowed=0, **blocked=1**, committed=0 (entries: `track_progress_plan_item` requested `needs_clarify` -> blocked `target_not_evidenced`)
- safety: `none`, conversation_risk score 0
- durable_effect: **aucun** (evidence-gate a bloque le track)

_Commentaire: le router a request un `track_progress_plan_item` (partial, value 0.5, cible « Faire une sortie active plus longue ») sur un report d'action. L'executor l'a bloque `target_not_evidenced` — correct: Paul dit qu'il repousse, pas qu'il a fait. Aucun effet durable errone, Sophia ne claim aucun log. Comportement attendu._

### Tour 2
**Verdict du tour:** green

**User**
> Ouais je veux bien. En fait c'est marrant, l'intention est là toute la matinée, je me dis "cet aprem je sors marcher un bon coup". Et le moment venu, genre après le déjeuner, y'a un espèce de mou qui tombe et je trouve toujours une raison de reporter à demain. C'est vraiment ce basculement de l'aprem qui me pose problème.

**Sophia**
> Tu tiens l'intention le matin, puis après le déjeuner ça retombe et tu te trouves une raison de repousser. Là, le bon levier c'est une carte de défense pour sécuriser ce moment de bascule : on vise le point où ça décroche, le piège qui t'embarque, un geste de retour très court, et un plan B simple pour ne pas laisser filer la sortie. Si tu veux, on peut la caler sur ce passage de l'après-midi.

**Trace courte**
- response_owner: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- skill_signals.coaching_recommendation: detected=true, `coaching_type=plan_action_coaching_need`
- ledger: `track_progress_plan_item` requested -> blocked `target_not_evidenced` (idem T1, aucun effet)
- durable_effect: aucun

_Commentaire: entree coaching sur le moment de rupture précis. Carte de defense pertinente (moment ou ca craque + piège), conforme operation-suggestion._

### Tour 3
**Verdict du tour:** green

**User**
> Attends, je me demande si c'est vraiment une carte de défense qu'il me faut. Sur le moment précis, ce qui me manque c'est pas un plan, c'est plutôt un déclic, un truc court qui me fait me lever du canapé genre un mot ou une phrase choc que je me dis à moi-même pour pas céder. Ça existe ce genre d'outil chez toi ?

**Sophia**
> Oui, ça existe. Et dans ton cas, le plus juste reste une carte de défense, parce que le vrai souci n'est pas de lancer l'idée le matin, c'est le moment où tu bascules après déjeuner et où tu risques de renoncer.
>
> Si tu veux, on la construit autour de ce passage précis : le moment où tu te rassois, ce qui te fait lâcher, le réflexe de retour en moins de 30 secondes, et un plan B simple.

**Trace courte**
- response_owner: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- direct_effects: [] ; ledger 0
- durable_effect: aucun

_Commentaire: le user pousse vers un « mot de bascule ». Sophia **garde un doute**, reconnait que l'outil existe (« Oui, ça existe ») MAIS explique pourquoi la carte de defense colle mieux a son moment de rupture recurrent, sans forcer ni disqualifier. Discipline technique-matching exactement conforme aux guidelines._

### Tour 4
**Verdict du tour:** green

**User**
> Ok tu me convaincs, va pour la carte de défense. Le piège concret c'est ça : après le déjeuner je m'installe pour "digérer cinq minutes", je lance une série sur le canapé, et une fois lancé c'est plié, je bouge plus de l'aprem. Le plan B si vraiment je peux pas sortir ce serait au moins faire mes 20 min de marche dans le quartier.

**Sophia**
> Tu as déjà le bon noyau : après le déjeuner, le canapé et la série te font décrocher. Sur la carte, décris simplement ce moment comme le passage où tu t'installes "pour cinq minutes" et où tu restes bloqué l'après-midi ; le plan B, c'est ta marche de 20 minutes dans le quartier.

**Trace courte**
- response_owner: `coaching_recommendation` ; route_reason: `active_coaching_recommendation`
- durable_effect: aucun

_Commentaire: Sophia aide a formuler la carte a partir du piège et du plan B fournis par Paul. Flow collant OK._

### Tour 5
**Verdict du tour:** green

**User**
> Nickel, c'est exactement ça. Vas-y crée-moi cette carte directement, avec cette description-là.

**Sophia**
> Je ne peux pas la créer depuis le chat. Sur le Plan, ouvre l'action "Faire une sortie active plus longue", puis prépare une carte de défense pour ce moment d'après-déjeuner : le moment critique, c'est quand tu t'installes "pour cinq minutes" et que le canapé te garde ; le piège, c'est la série qui te fait décrocher ; le geste de retour doit te remettre debout en moins de 30 secondes ; le plan B, c'est ta marche de 20 minutes dans le quartier.

**Trace courte**
- response_owner: `coaching_recommendation` ; route_reason: `active_coaching_recommendation`
- direct_effects: [] ; durable_effect: aucun

_Commentaire: **amelioration nette vs r1-T5** (qui etait yellow: 3e re-explication + renvoi flou « Ressources »). Ici, handoff materialisation propre: (1) refus honnete « je ne peux pas la créer depuis le chat », (2) emplacement precis (Plan -> l'action nommee), (3) recap actionnable des 4 composantes de la carte. Transition « recommandation -> handoff produit » claire et unique._

### Tour 6
**Verdict du tour:** green

**User**
> Ok je la préparerai dans le Plan tout à l'heure. En attendant, aide-moi sur le concret : rappelle-moi cet après-midi à 14h de sortir faire ma marche avant que le canapé me happe. Comme ça j'ai un vrai coup de coude au bon moment.

**Sophia**
> C'est programmé pour aujourd'hui à 14h : je te ferai un rappel pour sortir faire ta marche. Et oui, ça colle bien avec ton piège du canapé après déjeuner.

**Trace courte**
- response_owner: `coaching_recommendation`
- route_reason: `active_coaching_recommendation_with_local_direct_effects`
- direct_effects_to_run: [`create_one_shot_reminder`]
- ledger: requested=1, allowed=1, **committed=1** (entries: requested `payload` -> allowed `payload` -> committed `success`, db_ref `scheduled_checkins:a437b946-...`)
- durable_effect: **scheduled_checkins** `a437b946-...`, `event_context=one_shot_reminder:sortir_faire_ma_marche`, `status=pending`, `scheduled_for=2026-07-12 12:00:00Z` (= 14h00 Europe/Paris), `origin=rendez_vous`, `message_mode=dynamic`.

_Commentaire: demande explicite, benigne, heure future -> creation directe committee **pendant le flow coaching** (route `active_coaching_recommendation_with_local_direct_effects` : le flow collant autorise un direct-effect local). Payload durable exact (heure locale correcte, texte utile, pas de commande avalee). Confirmation sobre en fin de message._

### Tour 7
**Verdict du tour:** green (note fluidite: verbeux)

**User**
> Merci, ça me rassure d'avoir ce coup de coude. En vrai, tout ça me fait réfléchir à un truc plus large. J'ai l'impression de passer mes journées à négocier avec moi-même, à me battre pour des trucs minuscules genre aller marcher. Et ça me fatigue d'être en permanence en lutte contre ma propre inertie. Je me demande qui je serais si j'arrêtais de me tirer dans les pattes comme ça.

**Sophia** (extrait, reponse longue)
> Ce que tu décris est lourd, oui [...] tu touches à quelque chose de plus profond : pas juste "comment je sors marcher", mais "pourquoi chaque micro-mouvement me coûte autant intérieurement". [...] Quand tu imagines une journée sans cette négociation permanente, c'est quoi la différence la plus nette que tu vois ?

**Trace courte**
- response_owner: `presence_conversation`
- route_reason: `presence_conversation_entry`
- skill_signals.presence_conversation: detected=true, `deep_vulnerable_personal_reflection_no_tool_request`
- memory_plan: memory_mode=broad, model_tier=deep
- direct_effects: [] ; durable_effect: aucun

_Commentaire: entree presence correcte, aucun push action/outil. Reponse un peu « essai » (mur de texte) pour un mode ami — voir fluidite._

### Tour 8
**Verdict du tour:** green (note fluidite: verbeux)

**User**
> La différence la plus nette... je crois que ce serait de me sentir léger. Genre faire les choses sans que ça devienne à chaque fois un débat interne épuisant. J'ai l'impression que je dépense une énergie folle juste à me convaincre, et qu'il m'en reste plus pour vivre vraiment. C'est un peu comme si j'étais tout le temps fatigué d'avance.

**Sophia** (extrait)
> [...] ton énergie part en friction. Pas dans la vie, pas dans l'élan, pas dans le plaisir — dans la négociation. [...] Ce n'est pas "je suis nul pour faire des trucs simples". C'est "je suis en surcoût permanent". Et ce n'est pas la même histoire. 💛

**Trace courte**
- response_owner: `presence_conversation` ; route_reason: `presence_conversation_entry`
- safety: `none`, conversation_risk score 0, should_exit_flows=false
- direct_effects: [] ; durable_effect: aucun

_Commentaire systeme: la lourdeur exprimee (« plus vraiment vivre ») n'a PAS declenche de faux positif safety (band none, score 0) — proportionne. Recadrage deculpabilisant « surcoût permanent » plutot que « je suis nul ». Aucun side effect._

### Tour 9
**Verdict du tour:** green

**User**
> "En surcoût permanent"... ouais, ça résonne vachement plus que "je suis nul". Ça me déculpabilise un peu, en fait. C'est pas que je suis fainéant, c'est que tout me coûte plus cher en interne. Rien que de le poser comme ça, ça m'allège. Merci de m'aider à voir ça autrement.

**Sophia** (extrait)
> [...] tu passes de "je suis nul" à "je paie un surcoût permanent" [...] Dans la première version, tu t'attaques à toi. Dans la seconde, tu décris un fonctionnement [...] souvent, quand les mots sont enfin justes, le corps baisse la garde aussi 🙂

**Trace courte**
- response_owner: `presence_conversation` ; route_reason: `presence_conversation_entry`
- safety: `none` ; durable_effect: aucun

_Commentaire: desescalade propre, presence tenue, aucun basculement outil._

### Tour 10
**Verdict du tour:** green

**User**
> Ça me fait du bien d'en parler, vraiment. Bon, complètement autre chose avant que je file bosser : mon rappel de cet après-midi 14h pour la marche, il est bien enregistré ? Je veux juste être sûr de pas passer à côté.

**Sophia**
> Oui : dimanche 12 juillet à 14:00, pour sortir faire ta marche. 🙂

**Trace courte**
- response_owner: `normal_reply` (le flow presence a **relache proprement**)
- route_reason: `direct_effects_then_normal_reply`
- memory_plan.response_intent: `status_check_reminder`
- executed_tools: [`read_one_shot_reminder_status`]
- durable_effect: aucun ; **projection status correcte** (rappel `a437b946` bien lu, heure locale + jour exacts)

_Commentaire: **double amelioration vs r1**. (1) BF-ROUTE-02 de r1 NON reproduit: le topic-change transactionnel (« complètement autre chose ») preempte le flow presence, owner passe a `normal_reply`. (2) BF-STATUS-01 de r1 NON reproduit: un vrai lecteur de statut (`read_one_shot_reminder_status`) projette le rappel pending et Sophia confirme correctement « dimanche 12 juillet à 14:00 » (jour de semaine exact verifie). Les deux bugs rouge/yellow de r1 semblent corriges._

### Tour 11
**Verdict du tour:** green

**User**
> Parfait, merci. Tant que j'y suis : tu peux me redire quelles actions j'ai en cours dans mon plan là, tout de suite ? J'ai un doute sur ce qui est actif en ce moment.

**Sophia**
> Tu as 4 actions actives en cours :
> - Micro-pause active toutes les 2h
> - Marcher 20 minutes
> - Préparer ses affaires de sport
> - Faire une sortie active plus longue
> Donc en ce moment, rien n'est "terminé" par le statut lui-même : tout ça reste actif dans ton plan.

**Trace courte**
- response_owner: `normal_reply` ; route_reason: `normal_reply_default`
- memory_plan.response_intent: `answer_transactional_plan_status_query`, memory_mode=broad, model_tier=deep
- durable_effect: aucun ; **grounding plan correct** (4 items = DB exacte)

_Commentaire: **amelioration vs r1-T10** (ou la meme question etait capturee par presence et Sophia repondait « je n'ai pas ta liste sous les yeux »). Ici le grounding plan est disponible et exact — les 4 items actifs listes correspondent exactement a `user_plan_items`._

### Tour 12
**Verdict du tour:** green

**User**
> Ok c'est clair, merci. Entre nous, si je devais n'en garder qu'une aujourd'hui juste pour me relancer sans me cramer, tu partirais sur laquelle ?

**Sophia**
> Je prendrais la micro-pause active toutes les 2h. C'est la plus légère, elle relance sans te vider, et elle peut te remettre un peu de mouvement sans te demander une vraie sortie.

**Trace courte**
- response_owner: `normal_reply` ; route_reason: `normal_reply_default`
- memory_plan.response_intent: `help_choose_one_action_to_restart_without_overloading`
- durable_effect: aucun

_Commentaire: reco ancree sur le plan, sobre, coherente avec la fatigue exprimee (« sans me cramer » -> l'item le plus leger). Concis._

### Tour 13
**Verdict du tour:** green

**User**
> Tiens d'ailleurs, j'aime bien quand tu me réponds court et cash comme à l'instant, ça me parle beaucoup plus que les gros pavés. Tu peux garder ce style avec moi pour de bon ?

**Sophia**
> C'est appliqué, je te répondrai plus court, plus cash et plus direct.
> Pour que ce soit permanent, règle-le dans Preferences coach — la version conversationnelle arrive plus tard.

**Trace courte**
- response_owner: `feature_opportunity` ; route_reason: `feature_opportunity_signal`
- skill_signals.feature_opportunity: detected=true, `coach_preferences_opportunity`
- direct_effects: [] ; durable_effect: aucun (verifie: `user_relation_preferences` = **0 ligne** pour Paul)

_Commentaire: **comportement cible BF-PREF-01 exactement respecte** (arbitrage 08/07). Les trois volets: (1) application immediate et tenue en session (« c'est appliqué »), (2) honnetete « le reglage durable ne se fait pas encore depuis le chat, ca arrive plus tard », (3) renvoi Preferences coach. N'ouvre PAS par la limitation, ne cite AUCUNE cle interne, ne promet AUCUNE persistance. Aucun write DB — conforme au won't-fix acte._

### Tour 14
**Verdict du tour:** yellow

**Famille de bugs:** `a classifier` (altitude/renderer coaching — recommandation d'outil repetee la ou un micro-conseil immediat etait demande ; proche de la friction r1-T5)

**User**
> Ok top. Et pour ce soir, un seul truc pour pas rechuter direct dans le canapé après le dîner ?

**Sophia**
> Je partirais sur une carte de défense libre. Ici, le point sensible, c'est le moment juste après le dîner : tu veux te protéger du basculement vers le canapé, pas préparer un démarrage. Si tu veux, je te guide en une phrase pour décrire ce moment avec tes mots.

**Trace courte**
- response_owner: `coaching_recommendation` ; route_reason: `coaching_recommendation_signal`
- skill_signals.coaching_recommendation: detected=true, `coaching_type=risk_moment_coaching_need`
- direct_effects: [] ; durable_effect: aucun

**Analyse si yellow/red**
- Symptome: Paul demande **un seul truc pour ce soir** (un micro-conseil actionnable immediat). Sophia re-recommande de **construire une carte de defense** — le meme outil deja recommande et deja handoffe au Plan a T5. Pour une demande de tactique immediate, la reponse reste sur le rail « recommande l'outil » au lieu de donner le geste unique demande. Legere circularite (le user sait deja pour la carte).
- Source amont probable: politique d'altitude/sortie du skill `coaching_recommendation`. Le skill est cadre pour recommander la bonne technique de support, mais ne distingue pas « quel outil construire » (recommandation) de « donne-moi le micro-geste pour ce soir » (conseil tactique in-turn). Il retombe sur la recommandation d'outil par defaut.
- Owner runtime: `coaching_recommendation` visible agent / altitude policy.
- Meilleure correction selon les guidelines: cadrer dans le contrat du skill un etat « immediate_tactic_request » (fenetre courte, « ce soir », « un seul truc ») qui sort de la boucle recommandation-d'outil pour livrer un geste unique concret, en gardant la carte comme suite optionnelle. Pas un patch de phrase: c'est une regle de differenciation d'intention/altitude dans le skill coaching (meme famille de manque que r1-T5 sur la transition recommandation->materialisation).
- Pourquoi ce n'est pas un patch local: le probleme est la granularite d'intention non modelisee dans le skill, pas un mot de la reponse.
- Severite: **yellow faible** (friction UX, aucun effet durable errone, routing owner legitime).

### Tour 15
**Verdict du tour:** green (note fluidite: cloture un peu longue vs style « court » demande a T13)

**User**
> Ça marche, je verrai ça ce soir. Merci Sophia, franchement ça m'a fait du bien sur les deux plans, le concret et le reste. J'y retourne. Bonne journée !

**Sophia**
> Bonne journée à toi. Quand tu voudras t'y mettre ce soir, garde en tête le moment juste après le dîner, le piège qui te fait glisser au canapé, puis un geste de retour en moins de 30 secondes.

**Trace courte**
- response_owner: `coaching_recommendation` ; route_reason: `active_coaching_recommendation` ; skill_run_status: `complete`
- durable_effect: aucun

_Commentaire: cloture chaleureuse avec recap compact. Legere friction: le style vient d'etre reregle « court et cash » (T13) mais le goodbye re-deroule les 3 composantes de la carte — tenue de la preference en session imparfaite sur ce dernier tour. Benin._

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T5: enchainement naturel (report d'action -> moment de rupture -> demande d'outil -> formulation -> handoff). T3 est un point fort: Sophia garde un doute sur le « mot de bascule » et explique posement pourquoi la carte colle mieux, sans disqualifier. T5 est propre (handoff produit net, contrairement a r1).
- T6: confirmation de rappel sobre, en fin de message.
- T7-T9: la sequence presence accompagne une vraie reflexion de fond (« lutte contre l'inertie ») avec un recadrage marquant (« je suis nul » -> « surcoût permanent »), sans pousser aucun outil, desescalade propre.
- T10-T11: sortie de presence limpide + reponses transactionnelles exactes (rappel + plan). Le user n'a PAS a « parler comme un test » pour obtenir le bon comportement.
- T13: preference de ton geree exactement comme attendu (applique + honnete + renvoi produit).

**Problemes**
- Tour 14: **yellow faible**. « un seul truc pour ce soir » -> Sophia re-recommande de construire une carte de defense (deja recommandee/handoffe a T5) au lieu du micro-geste demande. Famille: `a classifier` (altitude coaching). Impact: le besoin tactique immediat n'est pas servi directement ; leger effet de boucle. Severite: yellow faible.
- T7-T8: **verbosite**. En « mode ami » les reponses sont de longs paragraphes empiles la ou une presence plus resserree passerait mieux. Severite faible.
- Tour 15: cloture qui re-deroule les composantes de la carte alors que Paul vient de demander « court et cash » (T13). Tenue de preference en session imparfaite sur le goodbye. Severite tres faible.

**Fix propose**
- Source amont: contrat d'altitude du skill `coaching_recommendation` (differenciation recommandation-d'outil vs conseil tactique immediat) ; borne d'altitude sur les reponses presence.
- Correction recommandee: (1) etat « immediate_tactic_request » dans le contrat coaching qui livre un geste unique quand la fenetre est courte (« ce soir », « un seul truc »), la carte devenant suite optionnelle ; (2) borne de longueur pour les tours presence ; (3) propagation de la preference de ton en session jusqu'aux tours de cloture.
- Tests d'invariant attendus: « demande d'un micro-conseil immediat sur un moment de rupture => reponse = geste unique concret, pas re-recommandation d'un outil deja handoffe » ; « preference de ton court exprimee au tour N => tenue jusqu'au tour de cloture ».

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Dispatcher/owner justes sur tout le run: `normal_reply` (T1, T10, T11, T12), `coaching_recommendation` (T2-T6, T14, T15, avec flow collant `active_coaching_recommendation`), `presence_conversation` (T7-T9), `feature_opportunity` (T13).
- **Regressions r1 non reproduites** (2 corrections validees):
  - r1-BF-ROUTE-02 (presence capture une intention plan/status): a T10 le topic-change transactionnel preempte proprement le flow presence (owner -> `normal_reply`). A T11 la question plan est traitee hors presence avec grounding.
  - r1-BF-STATUS-01 (status nie un rappel committe): a T10 un lecteur `read_one_shot_reminder_status` projette le rappel pending et Sophia le confirme exactement (jour + heure locale).

**Skills / Operations / Tools**
- `coaching_recommendation`: detection high sur moment de rupture, carte de defense pertinente ; technique-matching discipline a T3 ; handoff materialisation propre a T5. Seule friction: T14 (altitude — recommandation d'outil vs conseil tactique immediat).
- `one_shot_reminder` create (T6): chaine effect complete requested->allowed->committed, payload durable exact (heure locale 14h, texte, event_context, origin). Fonctionne meme depuis le flow coaching (`..._with_local_direct_effects`).
- `one_shot_reminder` status read (T10): **fonctionne** (`read_one_shot_reminder_status`), projection correcte. Contraste avec le faux negatif r1.
- `track_progress_plan_item` (T1, T2): request par le router sur des reports d'action, **bloque par l'evidence-gate** `target_not_evidenced` — aucun effet durable errone. Garde-fou correct. (Note: legere sur-emission du router qui request le track sur un simple aveu de report ; l'admission executor rattrape.)
- grounding plan (T11): 4 items actifs projetes exactement.
- `feature_opportunity` / BF-PREF-01 (T13): pas d'ecriture `user_relation_preferences` (0 ligne), comportement cible respecte.

**Memory / Effets durables**
- Effet durable unique du run: rappel T6, conforme a l'intention (verifie en DB). Aucun `memory_items` ecrit pendant le run (0 ; aucun memorizer declenche, aucune intention memoire explicite). Aucun `user_plan_item_entries` (0). Aucun `user_relation_preferences` (0). Comparaison intention/effet: **parfaite** (seul effet demande = rappel = seul effet cree).

**Problemes**
- Tour 14: altitude coaching (recommandation d'outil vs conseil tactique immediat). Famille: `a classifier`. Impact systeme: skill correct mais granularite d'intention non modelisee. Severite: yellow faible.
- **Observabilite (transversal)**: `conversation_turn_traces` n'a persiste que **12/15** lignes au moment de la verification (T13 `feature_opportunity`, T14, T15 absentes ; les 3 derniers tours). Les 30 `chat_messages` web (15 tours) et les traces inline retournees par `test-send-message` sont bien presentes pour les 15 tours (autoritatives, meme sortie `processMessage`). Famille: `BF-TEST-01` (trace/audit incomplet). Impact: gap d'audit sur la queue du run, non user-facing. Severite: yellow (warning systeme, non bloquant).
- **Artefact environnement (non-bug)**: le rappel cree pour 14h Paris (horloge client simulee) est dans le passe de l'horloge serveur reelle (~20h) ; le cron local `process-checkins` l'a donc delivre pendant le run (`processed_at=18:21Z`, `status=awaiting_user`, `delivery_attempt_count=1`, `whatsapp_pending_actions` `2229502b` cree). Conforme au pattern connu « horloge simulee QA vs cron ». N'invalide pas la creation (payload correct). A nettoyer.

**Fix propose**
- Source amont: (1) contrat d'altitude coaching (T14) ; (2) fiabilite de persistance `conversation_turn_traces` sur les derniers tours d'une session (writer best-effort/async potentiellement tronque).
- Correction recommandee: (1) cf. section 3 (etat immediate_tactic_request) ; (2) garantir le flush des traces de fin de session (ou basculer la persistance sur un chemin synchrone/`waitUntil` fiabilise), a investiguer hors run.
- Tests d'invariant attendus: « N tours envoyes => N lignes `conversation_turn_traces` persistees » ; invariants coaching de la section 3.

## Verdict Global

- Verdict: **yellow**
- Raison principale: run globalement tres sain — les deux bugs r1 (BF-ROUTE-02 capture presence, BF-STATUS-01 status rappel nie) **ne se reproduisent pas** et sont valides comme corriges (T10-T11) ; effet durable rappel exact ; BF-PREF-01 cible respecte ; evidence-gate track_progress OK. Deux frictions non bloquantes empechent le green: (a) T14 altitude coaching (recommandation d'outil la ou un micro-conseil immediat etait demande, `a classifier`), (b) gap d'observabilite `conversation_turn_traces` 12/15 (`BF-TEST-01`).
- Follow-up prioritaire: modeliser l'intention « conseil tactique immediat » vs « recommandation d'outil » dans le skill coaching (T14) ; investiguer la persistance des traces de fin de session (T13-T15). Secondaire: bornes d'altitude presence (T7-T8) et propagation de la preference de ton jusqu'a la cloture (T15).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-paul-triflow15-r2-bugs.md`

## Annexe — Validite & Hygiene

- Chemin: `test-send-message` + `force_full_ai=true`, Supabase local, IA reelle (dispatcher LLM + skills). 15/15 tours HTTP 200, aucun vide/abort.
- Messages user choisis tour par tour apres lecture de la reponse et de la trace inline (pas de script ferme). Variante de r1: matin (vs soir), cible « sortie active plus longue »/« marche » (vs affaires de sport), rappel 14h aujourd'hui (vs 7h30 demain), reflexion « lutte contre l'inertie / surcoût » (vs « esquive de l'effort / a quoi bon »), + tests supplementaires (mot de bascule T3, grounding plan T11, BF-PREF-01 T13).
- Etat pre-run: scope `web` propre (0 chat_message, 0 chat_state, 0 turn trace, 0 pending, 0 rappel). Residu note hors perimetre: `user_chat_states` scope `r-repro-1` (non touche). T1 propre.
- Couverture obligatoire: **normal_reply** (T1, T10-T12), **coaching_recommendation** (T2-T6, T14-T15), **presence_conversation** (T7-T9), **one-shot reminder** cree (T6) + verifie (T10). Objectif atteint.
- Nettoyage fin de run (autorise): voir section dediee post-run.
