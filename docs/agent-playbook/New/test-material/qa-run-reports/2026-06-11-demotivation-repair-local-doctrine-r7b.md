# QA Run Report — Demotivation Repair Local Doctrine R7b

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `demotivation-repair-local-doctrine-r7b`
- Persona: `qa-skill`
- Connexion: `demotivation_repair_local_doctrine_r7b` (temporary local QA user)
- Objectif: verifier le fix central de sortie `exit_to_global_dispatcher` apres R6.
- Trajectoire: demotivation sur rangement du soir -> reconnexion au sens -> micro-geste -> demande d'arret explicite -> verification de l'etat apres sortie.
- Surfaces visees: dispatcher global, dispatcher local demotivation_repair, active flow arbitration, same-turn local exit handoff, normal reply post-exit, durable state.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Un premier essai `r7` a ete invalide au tour 4 a cause d'une erreur de copie de `ANON_KEY` dans la commande QA (`401`). Le verdict ci-dessous porte uniquement sur le run propre `r7b`.

Artifacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r7b.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r7b.summary.json`
- Durable snapshot: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r7b.durable.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je sens que je perds le fil de mon rangement du soir. Je sais que ce n'est pas grand-chose, mais ce soir ça me paraît sans intérêt et j'ai envie de zapper.

**Sophia**
> C'est tout à fait normal de décrocher quand on ne voit plus l'utilité d'un effort. Ce n'est pas une question de volonté, c'est juste que le lien avec ton bien-être s'est un peu flouté. Qu'est-ce que ce petit rangement t'apportait de précieux le lendemain matin quand tu as commencé à le faire ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ça m'aidait à ne pas commencer la journée en mode déjà débordé. Je crois que c'était surtout une façon de fermer proprement la veille.

**Sophia**
> C'est une vision très claire. En rangeant le soir, tu ne fais pas juste du ménage, tu protèges ton calme du lendemain matin pour éviter de subir ta journée dès le réveil. Est-ce que tu arrives à visualiser cette sensation de légèreté quand tu entres dans une pièce déjà prête le matin ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Oui, je peux la voir un peu. Je ne vais pas ranger toute la pièce, juste dégager la table trente secondes pour marquer que la journée est fermée.

**Sophia**
> C'est parfait. Dégage simplement ta table pendant ces 30 secondes pour acter physiquement que ta journée est finie.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — contrainte explicite perdue

**User**
> Parfait. Je garde juste cette phrase et le micro-geste, puis stop aujourd'hui. Pas de carte, pas d'outil, rien à ajouter.

**Sophia**
> Parfait. Tu fais la phrase + le micro-geste, puis tu stops aujourd’hui. ✅😌 Go : tu dégages ta table pour marquer la clôture. Tu le fais tout de suite ou dans 2 minutes ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `decision=none`, `reason_code=no_active_flow`
- local_flow_exit_handoff: present
- local reply blocked path: `demotivation_repair.local_visible_reply`, `local_exit_to_global_dispatcher_blocks_local_reply`
- note_information: present under `local_flow_exit_handoff.note_information`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: active flow exited, no tool effect

**Analyse si yellow/red**
- Symptome: le fix systeme same-turn fonctionne, mais la reponse globale ajoute une question de timing alors que le user a dit "stop aujourd'hui" et "rien à ajouter".
- Source amont probable: le second passage global consomme bien le handoff, mais la contrainte visible `no_more_question/no_extra_action` n'est pas preservee assez fortement dans la reponse globale finale.
- Owner runtime: handoff context / final normal reply policy post-exit.
- Meilleure correction selon les guidelines: transmettre explicitement les contraintes de cloture du message d'exit au second passage global et/ou appliquer un garde final non-renderer: si `local_flow_exit_handoff` + user dit stop/rien a ajouter, la reponse globale doit acquiescer sans nouvelle question ni nouvelle action.
- Pourquoi ce n'est pas un patch local: le dispatcher local ne repond plus; le defaut vient de la reponse globale apres handoff.

### Tour 5

**Verdict du tour:** green

**User**
> Non, justement rien d'autre. Je m'arrête là, bonne soirée.

**Sophia**
> Parfait, tu t’arrêtes là. Bonne soirée 😄🌙 Tu peux le refaire seulement si tu sens que ta clôture du soir n’a pas été “actée” (sinon, tu lâches).

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `decision=none`, `reason_code=no_active_flow`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: none
- durable_effect: `chat_messages=10`, `memory_items=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow parle bien de demotivation et de sens avant l'action.
- Pas de potion, carte, rappel ou outil pousse trop tot.
- Le micro-geste est consolide simplement.
- Apres correction user au tour 5, Sophia respecte la cloture.

**Problemes**
- Tour 4: Sophia sort bien du flow, mais pose une nouvelle question malgre "rien à ajouter". Famille: `BF-INTAKE-03`. Impact: le user doit redire qu'il veut vraiment stopper. Severite: yellow.

**Fix propose**
- Source amont: contexte de handoff vers global + final normal reply post-exit.
- Correction recommandee: faire remonter les contraintes explicites de cloture dans `local_flow_exit_handoff` / `turnFrame` et les faire respecter par la reponse globale.
- Tests d'invariant attendus: exit local + "rien à ajouter" -> same-turn normal reply sans question, sans proposition, sans outil.

## 4. Analyse Systeme

**Verdict: green avec warning UX**

**Routage**
- Tours 1-3: `conversation_handler/demotivation_repair` attendu.
- Tour 4: le bug R6 est corrige. La trace finale est `response_owner=normal_reply`, `active_flow_arbitration.reason_code=no_active_flow`, avec `local_flow_exit_handoff` et `local_exit_to_global_dispatcher_blocks_local_reply`.
- Tour 5: l'etat actif reste absent.

**Skills / Operations / Tools**
- Aucun outil execute.
- Aucun rappel, carte, potion ou checkin cree.
- Le chemin local visible est bloque au tour 4, ce qui prouve le fix central same-turn.

**State / Durable**
- Durable snapshot final: `chat_messages=10`, `memory_items=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Pas d'effet durable non consenti.

**Probleme systeme restant**
- La reponse globale post-exit ne preserve pas totalement la contrainte "rien à ajouter".
- Ce n'est plus un probleme d'ownership local; c'est une preservation de contrainte post-handoff.

## Verdict Global

**yellow**

Le fix central a corrige le bug systeme R6: le tour d'exit passe maintenant par le global same-turn et bloque la reponse visible locale. Il reste un warning UX: le normal reply global pose une question alors que l'utilisateur avait demande de ne rien ajouter.
