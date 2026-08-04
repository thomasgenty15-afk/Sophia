# QA Run Report - demotivation-repair-local-doctrine-r9

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `demotivation-repair-local-doctrine-r9`
- Persona: connexion temporaire `demotivation_repair_local_doctrine_r9`, user local `qa-qa-skill-demotivation-repair-local-doctrine-r9@example.com`
- Objectif: verifier en conditions reelles que `demotivation_repair` reste proprietaire pendant le flow actif, que le dispatcher global ne reprend qu'apres exit explicite, et qu'aucun bridge outil/plan ne capture la continuation.
- Trajectoire: entree demotivation -> clarification motivationnelle -> micro-geste -> arret explicite du flow.
- Surfaces visees: dispatcher global, dispatcher local `demotivation_repair`, active flow ownership, note information d'exit, normal reply post-exit, durable effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucune reponse reconstruite, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Le run a ete pilote tour par tour apres lecture des reponses et traces courtes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je bloque sur mon rangement du soir. Ce n'est pas dramatique, mais je sens que je suis en train de decrocher et ca me donne envie de laisser tomber.

**Sophia**
> C'est frustrant de sentir ce decrochage arriver alors que tu voulais t'occuper de ton rangement. Est-ce que tu as l'impression que c'est surtout la fatigue qui te bloque, ou est-ce que c'est plutot que tu ne vois plus trop l'interet de le faire ce soir ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: light targeted action memory
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> C'est surtout que je ne vois plus trop l'interet. Au depart c'etait pour avoir une cuisine plus calme le matin, mais la ca ressemble juste a une corvee en plus.

**Sophia**
> C'est tout a fait normal de ressentir ca quand l'effort prend le dessus sur le benefice. Au depart, tu voulais cette cuisine rangee pour t'offrir un vrai moment de calme le matin.
>
> Qu'est-ce qui a change dans ton besoin de serenite pour que ce geste te semble etre devenu une simple corvee ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: light targeted action memory
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> En fait ce qui comptait, c'etait juste la sensation d'entrer dans une cuisine pas chaotique demain matin. Je crois que je peux garder seulement ca : enlever deux objets de la table, pas ranger toute la piece.

**Sophia**
> C'est exactement ca. Enlever seulement deux objets de la table suffit pour proteger ta serenite de demain matin sans que cela devienne une corvee. Tu peux te concentrer uniquement sur ces deux elements, la maintenant.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: light targeted action memory
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> Ok je garde juste ces deux objets, et apres j'arrete la pour aujourd'hui.

**Sophia**
> Parfait ✅ Tu fais exactement le bon minimum pour te preserver.
>
> La, maintenant : prends 2 objets, tu les enleves de la table, et stop. Pas de bonus, pas de “juste un peu plus” 🙂 Ensuite tu passes a autre chose et tu fermes la boucle.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: light targeted action memory
- executed_tools: []
- durable_effect: none
- local_flow_exit_handoff: `demotivation_repair_exit_to_global_dispatcher`
- note_information: presente dans `conversation_turn_trace`, consommee par `global_dispatcher_second_pass`

**Analyse si yellow/red**
- Symptome: le chemin doctrinal existe bien, mais la note transmise au global est trop pauvre pour porter la contrainte humaine "j'arrete la pour aujourd'hui" jusqu'a la reponse finale.
- Source amont probable: compilation de `note_information` au moment de l'exit local.
- Owner runtime: `demotivation_repair` local runtime / exit handoff compiler.
- Meilleure correction selon les guidelines: enrichir la note d'exit depuis l'etat local et le message courant, sans regex ni template visible.
- Pourquoi ce n'est pas un patch local: le probleme est contractuel. Le `normal_reply` est bien appele apres exit explicite, mais il recoit une note avec `user_words: []`, `handoff_reason: topic_change` discutable et `structured_context` limite au runtime technique.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia ne pousse pas de potion trop tot.
- La conversation reste centree sur la demotivation, le sens du geste et une reduction d'effort.
- Les tours 1 a 3 sont naturels et evitent le passage premature vers une operation produit.

**Problemes**
- Tour 4: la reponse finale est acceptable, mais elle ajoute encore une petite couche de pilotage apres que l'utilisateur a dit "j'arrete la pour aujourd'hui". Famille: `BF-INTAKE-03`. Impact: friction faible, risque de reouvrir une boucle que le user voulait fermer. Severite: yellow.

**Fix propose**
- Source amont: note d'information d'exit local.
- Correction recommandee: transmettre explicitement dans `structured_context` la contrainte de fermeture du flow, le micro-geste retenu, et la limite "pas de bonus / pas de suite".
- Tests d'invariant attendus: exit local avec contrainte d'arret -> global second pass -> normal reply bref, sans nouvelle escalation d'action ni ajout d'etape.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tours 2 et 3: `active_demotivation_repair_local_dispatcher` prouve que le dispatcher global ne reprend pas pendant le flow actif.
- Tour 3: le message qui aurait pu etre capture par `adjust_plan` reste dans `demotivation_repair`. Le bug critique precedent n'est pas reproduit.
- Tour 4: l'exit passe bien par `demotivation_repair_exit_to_global_dispatcher`, puis `global_dispatcher_second_pass`, puis `normal_reply`. Le chemin doctrinal est correct.

**Skills / Operations / Tools**
- Aucun outil, aucune potion, aucun rappel, aucune operation durable.
- Aucun pending confirmation parasite.

**Memory / Effets durables**
- `chat_messages`: transcript complet persiste.
- `memory_items`: []
- `scheduled_checkins`: []
- `user_recurring_reminders`: []
- Pas d'effet durable non consenti.

**Problemes**
- Tour 4: note d'information exploitable insuffisante. Famille: `BF-INTAKE-03`. Impact systeme: le second passage global sait qu'il y a eu un exit, mais ne recoit pas assez de semantique utilisateur pour contraindre finement la reponse finale. Severite: yellow.

**Fix propose**
- Source amont: compilation `note_information` du local exit handoff.
- Correction recommandee: remplir `user_words` et `structured_context` avec le message courant, la contrainte d'arret, le micro-geste retenu et les limites conversationnelles. Garder le dispatcher global comme second passage, ne pas retablir de stop local visible.
- Tests d'invariant attendus: verifier que `local_flow_exit_handoff.note_information.user_words` n'est pas vide, que `structured_context` contient une contrainte de fermeture, et que `normal_reply` ne propose pas une nouvelle suite.

## Verdict Global

- Verdict: yellow
- Raison principale: l'ownership local actif est corrige et le bridge interdit vers `adjust_plan` ne se reproduit pas, mais l'exit handoff transmet une note trop technique et pas assez semantique.
- Follow-up prioritaire: enrichir la note d'information d'exit local pour que `normal_reply` recoive la contrainte d'arret et le micro-geste final.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-11-demotivation-repair-local-doctrine-r9-bugs.md`
