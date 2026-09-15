# QA Run Report - Weekly Local Dispatcher Real AI

## 1. Contexte Du Test

- Date: 2026-06-12, Europe/Paris.
- Run: `qa-weekly-local-dispatcher-20260612-r1`.
- Persona: Alex, connexion locale dediee via Supabase local.
- Objectif: verifier en conditions reelles que le flow weekly actif reste sous dispatcher local, puis passe proprement a un autre dispatcher local quand le user demande une carte d'attaque.
- Trajectoire: weekly active -> plan handoff interne -> handoff local `prepare_attack_card` -> continuation du flow carte d'attaque.
- Surfaces visees: `weekly_adaptive_review_v1`, `prepare_attack_card`, routing actif, note_information, visible agents locaux, effets durables.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, auth locale de persona, aucun renderer deterministe, aucun fallback direct `processMessage`, aucun staging/deploy.
- Validite QA: valide. Un premier harness Node a echoue avant tout appel utile a cause du format module CommonJS/ESM; il a ete relance en ESM. Les 3 tours conversationnels valides sont ceux ci-dessous.
- Limite du run: ce run commence avec un `__active_skill_state` weekly deja installe. Il ne couvre pas l'ouverture proactive du point weekly ni le prompt initial `opening_weekly_review`/premier message emis par le trigger weekly.
- Nettoyage: scope QA isole supprime apres run: 1 `user_chat_states`, 6 `chat_messages`, 3 `conversation_turn_traces`; compteurs revenus a 0.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Oui, ca colle: j'ai un peu avance, mais je suis rince. J'aimerais garder ca vivable la semaine prochaine, sans gros changement.

**Sophia**
> C'est entendu, on va privilegier la recuperation pour que ta semaine reste vivable. On se retrouve dans ton Plan pour ajuster le rythme, notamment tes seances de sport matinales. Sur quel objectif ou action specifique veux-tu que je me concentre en priorite pour alleger la charge ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- blocked_paths: `global_dispatcher` bloque avec `active_weekly_review_uses_local_dispatcher`
- operation: `weekly_review_local_prepare_plan_handoff`
- flow_action: `prepare_plan_handoff`
- direct_effects: aucun
- executed_tools: aucun
- durable_effect: aucun; etat weekly reste actif, stage `plan_handoff`

### Tour 2

**Verdict du tour:** green

**User**
> Concentre-toi sur Reprendre le sport le matin. Et plutot que juste alleger, prepare-moi une carte d'attaque: je decroche des que la matinee est pressee.

**Sophia**
> Pour eviter de decrocher quand tes matinees sont trop speed, on pourrait utiliser la technique Preparer le terrain afin de te faciliter la tache pour reprendre le sport le matin. Ca te va ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `weekly_adaptive_review_v1_handoff_to_prepare_attack_card`
- blocked_paths: `global_dispatcher` bloque avec `weekly_adaptive_review_v1_handoff_to_prepare_attack_card_skips_global_dispatcher`
- note_information: presente dans `turn_frame`; consommee par `prepare_attack_card.local_flow`
- operation: `prepare_attack_card_local_ask_or_confirm_technique`
- flow_action cible: `confirm_technique_proposal`
- direct_effects: aucun
- executed_tools: aucun
- durable_effect: aucun; etat weekly ferme, `__active_attack_card_handoff` cree

### Tour 3

**Verdict du tour:** green

**User**
> Oui, ca me va. L'action a simplifier, c'est juste enfiler la tenue et sortir 10 minutes avant de consulter mes messages.

**Sophia**
> Pour appliquer la technique Preparer le terrain, qu'est-ce que tu pourrais preparer concretement a l'avance pour enlever de la friction le matin ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- blocked_paths: `global_dispatcher` bloque avec `active_prepare_attack_card_uses_local_dispatcher`
- operation: `prepare_attack_card_local_ask_platform_field`
- flow_action: `answer_current_field`
- direct_effects: aucun
- executed_tools: aucun
- durable_effect: aucun; technique verrouillee, `action_to_simplify` verrouille, prochain champ `prep_in_advance`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia garde le contexte weekly sans demander au user de reparler comme un test.
- Le passage de "rendre la semaine vivable" vers une cible concrete est naturel.
- La demande explicite de carte d'attaque est reprise sans rupture: Sophia propose une technique et demande confirmation.
- Le T3 continue le flow carte d'attaque avec une question unique, concrete, et liee au bloqueur.

**Problemes**
- Aucun probleme bloquant observe. Legere friction de wording: "Preparer le terrain" est rendu sans accent dans les sorties, mais cela ne degrade pas le flow ni la comprehension.

**Fix propose**
- Aucun fix prioritaire. Optionnel: verifier les libelles humanises des techniques si l'accentuation visible est un standard produit.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: le dispatcher global normal est bien saute pendant le flow weekly actif.
- T2: le changement de dispatcher passe par un handoff local vers `prepare_attack_card`, avec `turn_frame.note_information` present et trace `note_information_consumed`.
- T3: le nouveau dispatcher local reste proprietaire; le global dispatcher est encore explicitement bloque.
- Non couvert: la premiere activation du weekly depuis le trigger/proactif et le prompt visible d'ouverture.

**Skills / Operations / Tools**
- Weekly local dispatcher stabilise les signaux humains et passe en `plan_handoff`.
- Prepare attack card verrouille correctement la cible `Reprendre le sport le matin`, le bloqueur `la matinee est pressee`, puis la technique `preparer_terrain`.
- Les champs plateforme progressent sans execution prematuree: `action_to_simplify` est rempli, `prep_in_advance` devient le champ courant.

**Memory / Effets durables**
- Aucun effet durable de carte ou plan n'a ete applique depuis le chat.
- `tool_execution` apparait `blocked` pour les tours carte, ce qui correspond au boundary no-chat-mutation/platform-handoff observe; aucun outil durable n'a ete execute.
- Micro-memory cote carte: trace `micro_memory_items_count=0`, coherent avec ce besoin.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Aucun fix requis. Tests d'invariant utiles a conserver: global dispatcher skipped while active weekly; handoff local requires note_information; target dispatcher consumes note_information; no durable mutation from chat.

## Verdict Global

- Verdict: green
- Raison principale: le flow actif weekly route par dispatcher local, saute le global dispatcher, transfere vers `prepare_attack_card` avec note_information, puis le dispatcher cible continue la collecte sans effet durable.
- Follow-up prioritaire: lancer un run complementaire dedie a l'ouverture proactive weekly pour verifier le prompt initial avant le premier message user.
