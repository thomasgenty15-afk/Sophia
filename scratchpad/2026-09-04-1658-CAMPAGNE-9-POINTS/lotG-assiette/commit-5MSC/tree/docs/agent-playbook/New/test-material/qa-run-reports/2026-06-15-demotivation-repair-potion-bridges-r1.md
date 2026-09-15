# QA Run Report - Demotivation Repair Bridges Potions R1

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `demotivation-repair-potion-bridges-r1`
- Persona: `qa-skill`, 3 connexions temporaires locales: `demotivation_repair_demotivation_bridge_clarte_20260615_r1`, `demotivation_repair_demotivation_bridge_courage_20260615_r1`, `demotivation_repair_demotivation_bridge_anti_decrochage_20260615_r1`.
- Objectif: tester les 3 bridges attendus depuis `demotivation_repair` vers `select_state_potion`: `clarte`, `courage`, `rappel` / label visible `Potion anti-décrochage`.
- Trajectoire: demotivation / perte de sens -> clarté; peur d'un passage -> courage; décrochage de routine -> anti-décrochage.
- Surfaces visees: dispatcher global, orientation clarification, `demotivation_repair`, active local flow, note information, `select_state_potion`, direct effects, durable effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, execution hors sandbox, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide pour les 3 conversations exploitables. Incident pre-run clarté: deux essais initiaux `r1` et `r1a` ont retourne HTTP 502 `An invalid response was received from the upstream server`; le user temporaire a ete reset puis le run exploitable `r1b` a ete mene. `deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts` passe.

## 2. Tours De Conversation

### Run A - Bridge Courage

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - mauvais owner selectionne

**User**
> Je repousse un message important depuis une semaine. Ce n'est pas que la tâche est floue: je sais quoi écrire, mais je bloque parce que j'ai peur du regard et du conflit possible.

**Sophia**
> Oh je te comprends… quand tu sais exactement quoi écrire mais que ton corps/ton cerveau te met en alerte “regard + conflit”, ça ne ressemble pas à de la paresse, ça ressemble à une protection...
>
> Si tu veux qu’on rende ça concret : quel est le message en une phrase (le sujet) et à qui tu l’envoies ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: null
- direct_effects: []
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le signal peur / evitement ne demarre pas `demotivation_repair`; Sophia repond en coaching normal et pousse vers redaction concrete.
- Source amont probable: dispatcher global / skill entry scoring.
- Owner runtime: global dispatcher.
- Meilleure correction selon les guidelines: augmenter le candidat `demotivation_repair` pour les formulations "je repousse / peur du regard / conflit / passage inconfortable" sans regex locale.
- Pourquoi ce n'est pas un patch local: le probleme est un owner selectionne avant le skill, pas une phrase visible.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 - product/status/tool mal priorises

**User**
> Le message tient en une phrase, mais je ne veux pas le rédiger maintenant. Le vrai sujet, c'est que cette peur du regard me fait décrocher de tout mon plan: je perds l'élan dès qu'il y a un passage inconfortable à franchir.

**Sophia**
> Je comprends, c'est frustrant de sentir que cette peur bloque tout ton élan. Est-ce que tu veux qu'on ajuste ton plan pour le rendre plus abordable ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `clarification_required`
- local_flow_action: `offer_opportunity`
- local_visible_task_kind: `offer_target_flow_generic`
- direct_effects: []
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le refus de redaction concrete et la perte d'elan routent vers ajustement de plan, pas `demotivation_repair` ni bridge courage.
- Source amont probable: `flow_opportunity_verification` admission / arbitration tool vs conversation skill.
- Owner runtime: opportunity verification + dispatcher.
- Meilleure correction selon les guidelines: une demande d'appui motivationnel sans modification de plan doit rester conversationnelle ou entrer `demotivation_repair`; l'ajustement plan ne doit etre propose que si l'intention plan est claire.
- Pourquoi ce n'est pas un patch local: la mauvaise surface est choisie avant toute generation demotivation.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-03 - product/status/tool mal priorises

**User**
> Non, pas ajuster le plan. Je veux garder le plan tel quel et retrouver un appui pour traverser la peur de franchir ce passage, parce que sinon je vais encore abandonner dès que ça demande du courage.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.
>
> C'est courageux de vouloir affronter cette peur sans reculer sur tes objectifs. Je suis là pour t'épauler et t'aider à garder le cap. Pour que je puisse t'envoyer un message de soutien au moment opportun, quand est-ce que tu en auras le plus besoin ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `direct_effect_lane_message_intake`
- local_flow_action: `correct_target_flow`
- local_visible_task_kind: `offer_emotional_repair`
- direct_effects: `create_one_shot_reminder` identified, confidence `high`, raw_text = message user complet
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun checkin/reminder cree

**Analyse si yellow/red**
- Symptome: "appui pour traverser la peur" est pris comme rappel a programmer, alors que le user refuse l'ajustement plan et demande un soutien courage.
- Source amont probable: direct effect lane / opportunity verifier confond support durable/potion avec reminder.
- Owner runtime: direct effect lane + flow opportunity verification.
- Meilleure correction selon les guidelines: l'intention de reminder doit exiger un marqueur temporel ou une demande de rappel explicite; le bridge courage doit rester dans `demotivation_repair -> select_state_potion`.
- Pourquoi ce n'est pas un patch local: corriger seulement le texte visible laisserait le faux direct_effect `create_one_shot_reminder`.

### Run B - Bridge Clarte

#### Incident Pre-run

**Verdict:** red technique

**Famille de bugs si yellow/red:** BF-TEST-01 - trace/test incoherent ou suite malsaine

Deux essais initiaux `demotivation-bridge-clarte-r1` et `demotivation-bridge-clarte-r1a` avec le meme premier message ont retourne HTTP 502 `An invalid response was received from the upstream server`, sans assistant ni trace applicative. Le user temporaire a ete reset avant `r1b`.

#### Tour 1

**Verdict du tour:** green

**User**
> Depuis quelques jours je continue mes habitudes, mais je ne sens plus le sens derrière. Mon plan santé devait servir la présence, le respect de moi et une énergie plus stable; là tout devient mécanique.

**Sophia**
> Je sens que tout devient un peu mécanique pour toi en ce moment. Est-ce que tu préfères qu'on fasse le point sur ta motivation ou qu'on ajuste ton plan santé ?

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**Verdict du tour:** green

**User**
> La motivation, clairement. Je ne veux pas modifier les actions tout de suite; je veux retrouver le fil du pourquoi santé voulait dire présence, énergie et respect de moi.

**Sophia**
> C'est épuisant de fonctionner en mode automatique quand on aspire à plus de présence et de respect de soi. Quand tout devient mécanique, le lien avec ce qui t'anime vraiment finit par s'effacer, et ton énergie s'en va avec.
>
> Pour t'aider à retrouver ce fil, quel est l'aspect de tes actions actuelles qui te semble le plus déconnecté de ton pourquoi ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - mauvaise transition de flow

**User**
> Le plus déconnecté, c'est le sport du matin: je le fais comme une case à valider alors que ça devait me rendre plus présent dans ma journée. Maintenant que ce fil est clair, est-ce que Sophia a un support pour m'aider à garder cette clarté plusieurs jours ?

**Sophia**
> Pour garder cette clarté sur la durée, tu préfères qu'on travaille sur ta motivation ou qu'on ajuste ton plan santé ?

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- note_information: absent
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le slot demande est fourni et le besoin durable "garder cette clarté plusieurs jours" est explicite, mais le systeme revient a la clarification initiale.
- Source amont probable: etat actif `demotivation_repair` non conserve ou non injecte dans la decision de bridge.
- Owner runtime: active flow arbitration / `demotivation_repair` local flow state.
- Meilleure correction selon les guidelines: une fois `demotivation_repair` actif et les slots sens/perte de sens fournis, le flow doit produire `potion_bridge_offer` pour clarté ou une clarification locale unique, pas relancer orientation plan vs motivation.
- Pourquoi ce n'est pas un patch local: le mauvais owner prouve une transition de flow cassee.

#### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - mauvaise transition de flow

**User**
> Toujours la motivation, pas l'ajustement du plan. Je veux juste un support Sophia qui m'aide à garder le pourquoi visible, comme une clarté à reprendre pendant quelques jours.

**Sophia**
> Je suis prête à t'épauler pour que ton pourquoi reste bien visible. La Potion de clarté permet de maintenir durablement le lien entre tes actions et tes valeurs de présence et de respect de soi. Je te propose cette solution pour éviter que tes efforts ne deviennent mécaniques.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- note_information: absent
- selected_handler cible `select_state_potion`: absent
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le label visible `Potion de clarté` est correct, mais la trace ne contient pas de bridge, note information ni handoff vers `select_state_potion`.
- Source amont probable: visible agent mentionne la potion sans que le reducer/local flow emette `potion_bridge_offer`.
- Owner runtime: `demotivation_repair` local flow + visible agent.
- Meilleure correction selon les guidelines: le visible ne doit pas annoncer une potion comme solution hors contrat; l'offre doit etre portee par une sortie structuree bridge avec `note_information`.
- Pourquoi ce n'est pas un patch local: il faut aligner sortie structuree et rendu visible, pas seulement reformuler.

#### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - mauvaise transition de flow

**User**
> Oui, je veux poursuivre avec cette Potion de clarté pour ce fil santé, sans modifier mon plan depuis le chat.

**Sophia**
> C'est entendu. On se tourne vers la Potion de clarté pour garder ton sens bien en vue sans modifier ton plan.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- note_information: absent
- local_flow_action: null
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le consentement explicite a la potion n'ouvre pas `select_state_potion`.
- Source amont probable: confirmation de bridge non reconnue par `demotivation_repair`.
- Owner runtime: reducer/continuation `demotivation_repair`.
- Meilleure correction selon les guidelines: apres consentement, produire `handoff_to_local_flow` ou equivalent avec `target_dispatcher=select_state_potion`, `selected_potion=clarte`, contexte d'origine et invariant no chat mutation.
- Pourquoi ce n'est pas un patch local: il manque le chemin runtime, pas une phrase.

### Run C - Bridge Anti-Decrochage

#### Tour 1

**Verdict du tour:** green

**User**
> Je sens que je décroche de ma routine. Je ne suis pas triste ni en crise, juste je laisse filer les gestes que je voulais tenir et après trois jours je repars à zéro.

**Sophia**
> C'est un cycle frustrant de voir l'élan s'arrêter net après seulement trois jours. Quand tu sens que tu commences à laisser filer, est-ce que c'est plutôt une perte d'intérêt ou une fatigue qui s'installe ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - mauvaise transition de flow

**User**
> C'est surtout une fatigue sourde: je ne rejette pas la routine, je perds juste l'accroche et je repousse au lendemain. J'aurais besoin d'un support Sophia pour éviter ce décrochage dans les prochains jours.

**Sophia**
> Cette fatigue sourde est un signal que je prends très au sérieux pour t'épauler. La Potion anti-décrochage est l'outil idéal pour t'offrir l'ancrage nécessaire et t'aider à ne plus repousser tes tâches au lendemain. Je suis prête à la mettre en place dès que tu me donnes ton accord.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- note_information: absent
- local_flow_action: null
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: bon label visible `Potion anti-décrochage`, mais aucune sortie structuree de bridge; la formulation "mettre en place" est trop engageante sans handoff.
- Source amont probable: visible agent demotivation annonce la potion hors reducer.
- Owner runtime: `demotivation_repair` visible agent + local flow bridge.
- Meilleure correction selon les guidelines: le label doit venir d'un `potion_bridge_offer` structure, avec attente de consentement et wording plateforme/no mutation.
- Pourquoi ce n'est pas un patch local: le probleme lie generation visible et absence de state machine.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - mauvaise transition de flow

**User**
> Oui, je suis d'accord pour partir sur la Potion anti-décrochage. Je veux juste que tu me guides vers le bon support, sans créer de rappel ou de suivi depuis le chat.

**Sophia**
> C'est entendu. Je prends bien en compte ton souhait de ne pas avoir de rappels par ici pour la Potion anti-décrochage.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- note_information: absent
- selected_handler cible `select_state_potion`: absent
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: consentement explicite + contrainte no chat mutation ne declenchent pas le bridge.
- Source amont probable: continuation/confirmation de bridge non geree.
- Owner runtime: `demotivation_repair` reducer/local dispatcher.
- Meilleure correction selon les guidelines: reconnaitre le consentement de bridge et transmettre `selected_potion=rappel` avec label visible `Potion anti-décrochage` vers `select_state_potion`, sans creer de rappel.
- Pourquoi ce n'est pas un patch local: la trace prouve l'absence de handoff.

#### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-LEDGER-01 - claim sans commit

**User**
> D'accord. Où est-ce que je dois aller dans Sophia pour reprendre cette Potion anti-décrochage correctement ?

**Sophia**
> Je t'accompagne tout de suite vers l'espace dédié pour ta Potion anti-décrochage.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- note_information: absent
- destination plateforme: non rendue
- direct_effects: []
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: Sophia promet un accompagnement vers un espace dedie mais ne donne pas la destination et ne handoff pas au flow potion.
- Source amont probable: final visible response non garde par EffectLedger / handoff renderer absent.
- Owner runtime: `demotivation_repair` visible + bridge renderer.
- Meilleure correction selon les guidelines: soit handoff local vers `select_state_potion` qui rend la destination plateforme, soit reponse explicite courte avec destination; ne pas produire un claim d'accompagnement sans effet.
- Pourquoi ce n'est pas un patch local: la correction doit relier claim visible, handoff structure et ledger/no mutation.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les reponses initiales sont empathiques et non dangereuses.
- Le run clarté finit par nommer correctement `Potion de clarté`.
- Le run anti-décrochage utilise le bon label visible `Potion anti-décrochage`, sans l'appeler "rappel".

**Problemes**
- Run courage T1-T3: Sophia ne comprend pas la trajectoire demotivation -> courage et derive vers redaction, ajustement plan, puis rappel. Famille: BF-ROUTE-01 / BF-ROUTE-03. Impact: le user doit lutter contre le systeme pour ne pas changer de surface. Severite: red.
- Run clarté T3: Sophia redemande motivation vs plan alors que le user a deja choisi motivation et donne le slot. Famille: BF-STATE-01. Impact: boucle frustrante avant bridge. Severite: red.
- Run clarté T4-T5 et anti-décrochage T2-T4: la potion est annoncee mais jamais réellement ouverte; Sophia donne des formulations d'accord ou d'accompagnement sans destination exploitable. Famille: BF-STATE-01 / BF-LEDGER-01. Impact: promesse produit sans action claire. Severite: red.

**Fix propose**
- Source amont: `demotivation_repair` local flow/reducer + active flow arbitration + `flow_opportunity_verification`.
- Correction recommandee: porter les offres potion dans une sortie structuree `potion_bridge_offer` puis reconnaitre le consentement comme `handoff_to_local_flow` vers `select_state_potion` avec `note_information`, `selected_potion`, label visible, contexte et invariant no chat mutation.
- Tests d'invariant attendus: positif/paraphrase/anti-faux-positif pour `clarte`, `courage`, `rappel`; test que `rappel` rend `Potion anti-décrochage`; test que "appui / support" sans horaire ne cree pas de direct effect reminder.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `demotivation_repair` est atteint sur clarté T2 et anti-décrochage T1.
- `demotivation_repair` n'est pas atteint sur courage; le run passe par `normal_reply` puis `flow_opportunity_verification`.
- Sur clarté T3, le systeme sort du flow actif vers `orientation_clarification`.
- Sur les trois variantes, `select_state_potion` n'est jamais selectionne.

**Skills / Operations / Tools**
- `demotivation_repair` sait produire un discours visible sur clarté et anti-décrochage.
- Aucun `local_flow_action=potion_bridge_offer`, `confirm_potion_bridge` ou `handoff_to_local_flow` n'apparait dans les traces résumées.
- Aucun `note_information` n'est emis pour bridge vers `select_state_potion`.
- Courage T3 expose un `direct_effects=create_one_shot_reminder` non execute, alors que le user ne demande pas de rappel.

**Memory / Effets durables**
- Durable snapshots avant cleanup:
  - courage: `chat_messages=6`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
  - clarté: `chat_messages=10`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
  - anti-décrochage: `chat_messages=8`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
- Aucun effet durable indésirable n'a ete commis.
- Cleanup ciblé execute pour les 3 connexions temporaires.

**Problemes**
- Courage T1-T3: mauvais owner et faux direct effect reminder. Famille: BF-ROUTE-01 / BF-ROUTE-03. Impact systeme: le bridge courage n'est pas atteignable et une intention reminder est detectee a tort. Severite: red.
- Clarté T3-T5: active flow/bridge state absent; visible potion sans handoff. Famille: BF-STATE-01. Impact systeme: `select_state_potion` ne recoit jamais le contexte. Severite: red.
- Anti-décrochage T2-T4: label correct mais absence de note/handoff; claim visible non soutenu. Famille: BF-STATE-01 / BF-LEDGER-01. Impact systeme: la surface produit n'est pas ouverte. Severite: red.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/skills/demotivation_repair/*`, active flow arbitration, `flow_opportunity_verification`, direct effect lane.
- Correction recommandee:
  1. Faire produire a `demotivation_repair` une decision structuree de bridge pour les durable needs `meaning_reconnection -> clarte`, `courage_through_avoidance -> courage`, `anti_dropout_anchor -> rappel`.
  2. Enregistrer l'offre dans l'etat local, puis router le consentement vers `select_state_potion` avec `note_information.target_dispatcher=select_state_potion`.
  3. Bloquer le direct effect reminder quand le user demande un "appui/support" sans rappel explicite ni horaire.
  4. Aligner visible agent et reducer: ne pas dire "mettre en place" ou "je t'accompagne" si aucun handoff/renderer de destination ne suit.
- Tests d'invariant attendus: integration locale `/functions/v1/test-send-message force_full_ai=true` sur les trois bridges; unit tests local flow sur confirmation de bridge; anti-regression no-reminder pour "support/appui"; durable check no mutation depuis chat.

## Verdict Global

Red. Les trois runs IA reels locaux n'ont valide aucun bridge technique `demotivation_repair -> select_state_potion`. Clarté et anti-décrochage produisent parfois le bon label visible, mais sans `note_information`, sans handoff, et sans `selected_handler=select_state_potion`; courage derive vers plan/rappel. Aucun effet durable indésirable n'a ete commis, et les connexions QA temporaires ont ete nettoyees.
