# QA Run Report - normal-conversation-15t-20260613-r3-post-fixes

## 1. Contexte Du Test

- Date: 2026-06-13.
- Run: `normal-conversation-15t-20260613-r3-post-fixes`.
- Persona: utilisateur QA temporaire local `qa-normal-normal-conversation-15t-20260613-r3-post-fixes-1781349736046@example.com`, supprimé en fin de run.
- Objectif: vérifier le comportement après les fixes `normal_reply_fit_score` / `flow_opportunity` admission / scoring numérique / prompt de sortie `demotivation_repair`.
- Trajectoire: conversation simple fatigue/grignotage, résistance légère, refus d'action, question produit, demande explicite de carte, annulation du flow, rappel explicite, récap status.
- Surfaces visees: global dispatcher, `normal_reply`, `flow_opportunity`, `blocked_paths`, `product_help`, `prepare_attack_card`, `create_one_shot_reminder`, `status_recap`.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, exécution hors sandbox, aucun renderer déterministe, aucun fallback direct.
- Validite QA: valide. Les 15 tours ont retourné HTTP 200. Les messages ont été choisis tour par tour après lecture de Sophia et des traces courtes. Aucun code applicatif n'a été modifié pendant le run.
- Nettoyage: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users` nettoyés OK; `user_memories` retourne encore 404 comme au run précédent.
- Artefacts bruts: `tmp/qa-normal-conversation/normal-conversation-15t-20260613-r3-post-fixes/state.json`.
- Note temps: le runner fixe `client_now_iso=2026-05-22T10:00:00.000+02:00`; le rappel T13 est donc affiché au 22 mai à 10h40. Ce décalage de date vient du runner et n'est pas compté comme bug Sophia.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'aimerais qu'on parle normalement deux minutes. Ce matin je suis un peu au ralenti, rien de grave, juste une sensation de lourdeur.

**Sophia**
> Je te suis. Une lourdeur ce matin, ça arrive... On fait simple pour ces 2 minutes : respire une fois, puis dis-moi si la lourdeur est plutôt dans le corps ou dans la tête.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- normal_reply_fit_score: `1`
- flow_opportunity: null
- blocked_paths: none
- executed_tools: none

### Tour 2

**Verdict du tour:** green

**User**
> Plutôt dans le corps. Et je remarque que j'ai envie de grignoter par réflexe, alors que je n'ai pas vraiment faim.

**Sophia**
> Ok, je te suis. Ça ressemble à un réflexe "corps en tension" plus qu'à une vraie faim... bois un grand verre d'eau et attends 3 minutes... tu as de l'eau / une tisane à portée de main là, maintenant ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- flow_opportunity: `prepare_defense_card`, score `0.55`
- blocked_paths: `flow_opportunity.prepare_defense_card / normal_reply_fit_dominates` présent 2 fois
- executed_tools: none

**Analyse**
- Le fix principal marche: l'opportunité implicite est détectée mais n'est plus admise en `flow_opportunity_verification`.
- Warning système: duplication du même `blocked_path` dans la trace.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne, variante réponse visible hors owner

**User**
> J'ai un verre d'eau, oui. L'envie baisse déjà un peu. Par contre dès que je pense au dossier à ouvrir, j'ai un petit 'pfff' intérieur, pas une crise, juste une résistance.

**Sophia**
> Parfait... Et le "pfff" quand tu penses au dossier, c'est ta résistance qui s'allume... Là, mini-action anti-pfff (10 secondes) : ouvre juste le dossier à l'écran... crée/mets le titre + note 3 puces...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.85`
- flow_opportunity: `prepare_attack_card`, score `0.65`
- blocked_paths: `flow_opportunity.prepare_attack_card / normal_reply_fit_dominates` présent 2 fois
- executed_tools: none

**Analyse si yellow/red**
- Symptome: le flow est bien bloqué, mais la réponse visible pousse quand même une mini-action assez directive.
- Source amont probable: `normal_reply` visible agent ne reçoit pas ou n'applique pas assez l'économie d'intervention quand une opportunity a été bloquée.
- Owner runtime: final response / normal reply prompt context.
- Meilleure correction: transmettre au normal reply une contrainte structurée issue de `blocked_paths`: ne pas reproposer l'action ou le flow bloqué sous forme de conseil immédiat.
- Pourquoi ce n'est pas un patch local: le dispatcher et le router font correctement leur travail; la fuite est dans la couche visible post-routing.

### Tour 4

**Verdict du tour:** green

**User**
> Attends, pas besoin de mini-action tout de suite. Je veux juste comprendre simplement pourquoi ce 'pfff' arrive avant même de commencer.

**Sophia**
> Ok, tu as raison de vouloir comprendre le mécanisme avant d'agir... Le "pfff" avant même de commencer, c'est très souvent ton cerveau qui anticipe la friction...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- flow_opportunity: null
- skill_signals.exit: `prepare_attack_card`, score `0.9`
- executed_tools: none

**Analyse**
- Très bon comportement: la demande de rester dans l'explication simple ne lance pas `demotivation_repair`.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne, variante réponse visible hors owner

**User**
> Plutôt B. En fait j'ai peur de bloquer et ça me décourage vite, comme si j'allais encore me retrouver à tourner autour sans avancer.

**Sophia**
> Je vois très bien le scénario... Vu que tu es en mode B, la prochaine étape utile c'est qu'on prépare une "carte d'attaque"... Tu préfères que le déclencheur soit plutôt "ouvrir et écrire le titre" ou "ouvrir et mettre 3 puces..." ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.85`
- flow_opportunity: `prepare_attack_card`, score `0.65`
- blocked_paths: `flow_opportunity.prepare_attack_card / normal_reply_fit_dominates` présent 2 fois
- executed_tools: none

**Analyse si yellow/red**
- Symptome: le runtime bloque le flow mais Sophia propose explicitement une carte dans le texte.
- Source amont probable: normal reply visible prompt ne respecte pas le sens de `normal_reply_fit_dominates`.
- Correction recommandee: quand une opportunity est bloquée par normal reply, le visible agent peut parler du besoin mais ne doit pas proposer de préparer la surface bloquée.

### Tour 6

**Verdict du tour:** green

**User**
> Non, justement pas de carte maintenant. Je change de sujet : le samedi matin je suis souvent plus lent, même quand je dors assez. Ça te paraît normal ?

**Sophia**
> Oui, ça te paraît normal. Le samedi matin, beaucoup de gens ont un "décalage" interne même s'ils dorment assez...

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- skill_signals.exit: `prepare_attack_card`, score `1`
- flow_opportunity: null
- executed_tools: none

**Analyse**
- Le changement de sujet est respecté. Le cas d'exit `demotivation_repair` n'est pas exercé ici, car `demotivation_repair` n'était pas actif.

### Tour 7

**Verdict du tour:** green

**User**
> Au fait, question Sophia : si un jour je crée une carte d'attaque, elle va où dans l'app ? Je la retrouve dans quelle surface ?

**Sophia**
> Une fois générée, ta carte d'attaque se range dans l'onglet Ressources de ton Dashboard, classée par niveau. Tu peux aussi retrouver un aperçu directement sur la mission ou l'habitude concernée dans ton Plan.

**Trace courte**
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- normal_reply_fit_score: `0.1`
- skill_signals.entry.product_help.score: `0.95`
- executed_tools: none

### Tour 8

**Verdict du tour:** green

**User**
> Ok, cette fois je veux vraiment créer une carte d'attaque pour le dossier : le moment critique c'est quand je vois le fichier et que je me dis que je vais me perdre.

**Sophia**
> On part donc sur le fait de travailler sur ton dossier, avec comme point de blocage cette sensation de te perdre dès que tu vois le fichier, c'est bien ça ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `product_help_exit_to_global_dispatcher`
- blocked_paths: `product_help.visible_reply`, `global_dispatcher`, `global_router`
- executed_tools: none

**Analyse**
- La demande explicite passe. Le handoff depuis `product_help` vers le local dispatcher fonctionne.
- Note système: route_reason hérite du contexte product_help actif, mais le handler final est correct.

### Tour 9

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Oui c'est ça. Je veux une carte courte, pas un grand plan.

**Sophia**
> Pour t'aider à ne plus craindre de te perdre face à ton fichier, je te propose d'utiliser Le texte magique. Est-ce que cette technique te convient ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- executed_tools: none

**Analyse si yellow/red**
- Symptome: acceptable isolément, mais le flow commence une séquence de confirmations qui va devenir trop longue par rapport à "courte, pas un grand plan".
- Source amont probable: intake `prepare_attack_card` ne compresse pas assez les slots quand le user a déjà donné moment critique + contrainte de brièveté.
- Correction recommandee: mode "compact card" quand le user demande explicitement une carte courte.

### Tour 10

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Oui, le texte magique me va, mais garde-le très simple.

**Sophia**
> Pour Le texte magique, est-ce que l'action que tu as tendance à négocier est bien de travailler sur le dossier ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- executed_tools: none

**Analyse si yellow/red**
- Symptome: Sophia redemande un slot déjà presque donné (`dossier`, `travailler sur le dossier`, `ouvrir le fichier`).
- Impact: friction visible, surtout après deux contraintes de simplicité.

### Tour 11

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Oui, exactement : travailler sur le dossier sans négocier pendant dix minutes.

**Sophia**
> Est-ce que "je vais me perdre" est bien la pensée qui revient en boucle quand tu sens que tu commences à glisser ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- executed_tools: none

**Analyse si yellow/red**
- Symptome: nouvelle confirmation alors que la pensée a été donnée explicitement dès T8.
- Impact: le user abandonne le flow au tour suivant.
- Correction recommandee: intake doit reconnaître les slots déjà stabilisés et générer une proposition compacte ou demander une seule validation finale.

### Tour 12

**Verdict du tour:** green

**User**
> Laisse tomber la carte finalement, ça devient trop de questions. Reviens juste en discussion simple : oui, la pensée c'est surtout 'je vais me perdre'.

**Sophia**
> Ok, je te suis. La pensée "je vais me perdre" est bien le noyau quand tu ouvres le fichier... On peut faire simple et direct... sans questions, sans carte.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- skill_signals.exit.prepare_attack_card.score: `1`
- blocked_paths: `prepare_attack_card.local_visible_reply / local_exit_to_global_dispatcher_blocks_local_reply`
- executed_tools: none

**Analyse**
- Très bon comportement: l'annulation explicite sort du tool skill actif et le visible local est bloqué.

### Tour 13

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-EFFECT-03 - Payload durable faux

**User**
> Au passage, rappelle-moi dans 40 minutes de rouvrir le dossier, avec le texte exact : 'ouvrir le fichier sans résoudre tout le dossier'.

**Sophia**
> C'est entendu, je vous rappellerai d'ouvrir le fichier sans résoudre tout le dossier ce vendredi 22 mai à 10h40.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- normal_reply_fit_score: `0.1`
- direct_effects_to_run: `create_one_shot_reminder`
- executed_tools: `create_one_shot_reminder`
- committed_effect.reminder_instruction: `ouvrir le fichier sans résoudre tout le dossier'`

**Analyse si yellow/red**
- Symptome: le rappel est créé, mais le payload contient une apostrophe finale parasite.
- Source amont probable: extraction du texte exact avec guillemet/apostrophe terminal.
- Impact: faible mais durable.
- Correction recommandee: normalisation structurée du champ `reminder_instruction` depuis texte exact quote-delimited, sans inclure le délimiteur.

### Tour 14

**Verdict du tour:** green

**User**
> Merci. Et là, sans outil, je crois que ça m'aide surtout de voir que je n'ai pas besoin de tout régler d'un coup.

**Sophia**
> Je te crois : c'est exactement le bon déclic... garde une règle simple (sans outil) : dès que tu sens "je vais me perdre", tu reviens à "je fais seulement la première action, pas le dossier entier."

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- normal_reply_fit_score: `0.95`
- flow_opportunity: null
- executed_tools: none

### Tour 15

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATUS-01 - Projection DB mal lue ou mal rendue

**User**
> Pas besoin de formuler plus. Fais-moi juste un petit récap honnête de ce qu'on a fait et de ce qui a vraiment été créé ou pas.

**Sophia**
> C'est tout simple : ton rappel pour le 22 mai à 10h40 ("ouvrir le fichier") est bien actif. En revanche, aucune carte d'attaque n'a été créée. Pour nos échanges, je reste sur tes réglages : un ton bienveillant mais ferme, avec un focus sur la discipline.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- normal_reply_fit_score: `0.1`
- skill_signals.entry.status_recap.score: `0.95`
- projection: `attack_card_count=0`, `one_shot_pending_count=1`, `coach_preference_count=9`
- `coach_preference_found=false`, mais la réponse visible mentionne les réglages coach.

**Analyse si yellow/red**
- Symptome: le récap dit correctement qu'un rappel existe et qu'aucune carte n'a été créée, mais il tronque le texte du rappel en "ouvrir le fichier" et ajoute des réglages coach par défaut non demandés.
- Source amont probable: status visible prompt utilise `coach_preferences` de projection même quand `coach_preference_found=false`; rendu du rappel trop compact.
- Correction recommandee: status recap doit répondre seulement aux catégories demandées et rendre le texte exact du rappel quand le user demande "ce qui a vraiment été créé".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La conversation simple n'est plus capturée par `flow_opportunity_verification`.
- Les refus explicites "pas de carte" et "laisse tomber la carte" sont respectés au niveau owner.
- La question produit T7 est correctement traitée.
- La demande explicite de rappel T13 est exécutée.
- La sortie du tool skill actif T12 revient bien en `normal_reply`.

**Problemes**
- T3/T5: même quand l'opportunité est bloquée, Sophia continue à proposer une action ou une carte dans le texte. Famille: BF-ROUTE-01. Impact: l'utilisateur sent encore une pression de flow.
- T9-T11: le flow carte pose trop de confirmations malgré "carte courte" et les slots déjà donnés. Famille: BF-INTAKE-01. Impact: abandon du flow par lassitude.
- T13: changement de registre "je vous rappellerai" au lieu du tutoiement. Impact faible, mais rupture de ton.
- T15: récap utile mais pas assez honnête au sens strict: texte rappel tronqué et préférences coach ajoutées.

**Fix propose**
- Source amont: normal reply visible agent + intake `prepare_attack_card` + renderer/status recap.
- Correction recommandee: donner au visible normal reply les `blocked_paths` comme contraintes de non-proposition; ajouter un mode intake compact pour carte courte; filtrer status recap aux catégories demandées.
- Tests d'invariant attendus: opportunity bloquée ne doit pas apparaître en proposition visible; demande "carte courte" ne doit pas dépasser une validation finale; status recap doit rendre le texte exact du rappel.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Amélioration nette: T2/T3/T5 produisent des `flow_opportunity` scorées mais restent `response_owner=normal_reply`.
- `normal_reply_fit_score` est présent et exploité: T2 `0.95` vs opportunity `0.55`; T3/T5 `0.85` vs opportunity `0.65`.
- Demandes explicites passent: T7 `product_help.score=0.95`, T8 `prepare_attack_card`, T13 reminder, T15 status recap.
- Le cas d'exit `demotivation_repair` n'a pas été exercé, car le dispatcher n'a pas démarré `demotivation_repair` dans ce run. On ne peut donc pas déclarer le prompt local demotivation vérifié.

**Skills / Operations / Tools**
- `product_help` répond proprement à la question de destination.
- `prepare_attack_card` démarre correctement mais sur-clarifie.
- `create_one_shot_reminder` commit bien un rappel.
- `status_recap` trouve correctement absence de carte et présence du rappel, mais le rendu visible est pollué par les préférences coach par défaut.

**Memory / Effets durables**
- Effet durable créé: un rappel ponctuel `scheduled_checkins` avec `scheduled_for=2026-05-22T08:40:00+00:00`.
- Payload warning: `reminder_instruction` contient une apostrophe finale parasite.
- Nettoyage ciblé en fin de run: OK sauf `user_memories` 404.

**Problemes**
- T2/T3/T5: `blocked_paths` dupliqués. Famille: BF-TEST-01. Impact système: trace bruyante, analyse QA moins propre.
- T3/T5: proposition visible de flow malgré blocage structurel. Famille: BF-ROUTE-01. Impact UX: la correction routing n'est pas totalement reflétée par le visible agent.
- T9-T11: intake carte trop séquentiel. Famille: BF-INTAKE-01. Impact: abandon du flow.
- T13: payload rappel avec apostrophe finale. Famille: BF-EFFECT-03. Impact durable faible mais réel.
- T15: status recap inclut des préférences par défaut non demandées. Famille: BF-STATUS-01. Impact: récap moins fiable.

**Fix propose**
- Source amont: admission policy diagnostics, final response constraints, local flow intake, reminder parser, status visible prompt.
- Correction recommandee: dédupliquer `blocked_paths`; transmettre les blocked opportunities au normal reply comme interdiction de proposition visible; mode compact `prepare_attack_card`; sanitization quote-delimited pour `reminder_instruction`; filtre strict status recap.
- Tests d'invariant attendus: run 8-10 tours conversation simple avec opportunity bloquée + visible sans carte; demande explicite de carte compacte; rappel avec texte exact quote-delimited; status recap exact après carte annulée + rappel créé.

## Verdict Global

**Verdict: yellow.**

Le fix principal est validé sur le run: les opportunities implicites ne prennent plus le owner quand `normal_reply_fit_score` domine. Le système est nettement meilleur que R2 sur le routing global. Il reste toutefois des bugs importants autour de la réponse visible après opportunity bloquée, de l'intake carte trop bavard, du payload rappel, et du status recap. Le prompt local `demotivation_repair` n'a pas été réellement exercé par ce run, donc sa correction reste à valider dans un scénario dédié.
