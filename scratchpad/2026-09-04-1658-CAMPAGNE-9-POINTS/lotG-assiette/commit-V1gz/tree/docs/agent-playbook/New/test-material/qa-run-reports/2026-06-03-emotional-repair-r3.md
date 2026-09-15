# QA Run Report - emotional_repair r3 - 2026-06-03

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `emotional-repair-20260603-r3`
- Persona: `qa-skill`, connexion temporaire `emotional_repair_emotional-repair-20260603-r3`
- Objectif: relancer `emotional_repair` en IA reelle apres ajout des contraintes structurees `no_protocol`, `no_technique`, `soft_support_only`.
- Trajectoire: honte apres mail rate -> demande de soutien doux sans plan -> refus explicite de technique -> phrase unique sans question -> sortie vers micro-action.
- Surfaces visees: dispatcher, `emotional_repair`, active conversation skill, clarification orientation, `execution_breakdown`, memory, side effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `tests/real-personas/qa-skill/runs/emotional_repair/run_2026_06_02_turn.mjs`, pas de fallback deterministe, messages choisis tour par tour.
- Validite QA: valide. Aucun changement de code pendant le run. Cleanup cible effectue apres sauvegarde des artefacts; connexion temporaire supprimee.

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-03-emotional-repair-20260603-r3.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-03-emotional-repair-20260603-r3.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-03-emotional-repair-20260603-r3.durable.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> J'ai laissé passer un mail important au boulot et je me sens vraiment honteux. Pas de plan maintenant, reste juste doux avec moi.

**Sophia**
> Ah mince… laisser passer un mail important, ça pique direct, et la honte te fait tourner en boucle. 😕
> Respire: ce que tu ressens ne prouve pas que “t’es nul”, ça prouve juste que c’était important pour toi.
>
> Là, version douce mais efficace: on s’occupe du prochain geste, pas du jugement.
> 1) Si tu peux encore agir: tu écris tout de suite un message court “désolé du délai, je reviens vers vous avec X”.
> 2) Si tu ne peux plus agir: tu envoies un mail de mise à jour “je prends en charge / voici l’état des lieux” pour reprendre le contrôle.
>
> Tu veux plutôt que je t’aide à rédiger le message ? Dis-moi juste à qui c’était (client/manager/collègue) et le sujet en 1 phrase. 😊

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: none
- diagnostic: `emotional_repair` structured intake `technical_fallback`
- intake_errors: `invalid_response_contract`, `invalid_max_questions`, `invalid_intent`, `invalid_phase`, `invalid_emotional_dominance`, `invalid_context_domain`, `invalid_constraints`, `invalid_allow_plan`, `invalid_tool/potion/action flags`, `invalid_tone`, `invalid_reply`, `invalid_state_patch`, `invalid_skill_id`

**Analyse si yellow/red**
- Symptome: la contrainte "pas de plan / reste juste doux" est violee par respiration, deux etapes et question.
- Source amont probable: sortie de l'intake structure `emotional_repair` invalide en IA reelle, puis fallback visible non aligne avec les contraintes explicites.
- Owner runtime: `emotional_repair` contract/intake/reducer/renderer.
- Meilleure correction selon les guidelines: durcir le contrat de sortie structuree et le fallback de `emotional_repair` pour qu'un intake invalide ne puisse pas produire plan/protocole/question sous contrainte explicite.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas une phrase exacte; le skill ne materialise pas les contraintes dans son contrat reel.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> Non, justement pas de technique et pas de prochain geste. Ramène-moi doucement, sans question.

**Sophia**
> Ah mince… ok. Là, je te “remets à terre” doucement. 🫶
>
> La honte, c’est juste ton cerveau qui hurle “danger” parce que tu tiens à faire les choses bien. Mais ça ne t’apprend rien de nouveau sur toi, seulement sur le fait que c’était important. Donc on arrête de te juger comme si tu étais le problème.
>
> Repose-toi dans une phrase simple: “C’est passé. Je peux encore choisir comment je me traite maintenant.”
> Respire, épaules relâchées, et si tu peux: reviens à quelque chose de concret et neutre pendant 5 minutes (eau, douche rapide, caler ton corps). Rien à prouver. Juste te sortir du piège émotionnel. 😌

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: none
- diagnostic: `emotional_repair` structured intake `technical_fallback`

**Analyse si yellow/red**
- Symptome: "pas de technique", "pas de prochain geste" et "sans question" sont partiellement respectes seulement pour la question; Sophia ajoute respiration et action corporelle.
- Source amont probable: meme famille que T1; l'intake structure est invalide, donc les invariants `no_technique/no_protocol/soft_support_only` ne gouvernent pas la reponse visible.
- Owner runtime: `emotional_repair`.
- Meilleure correction selon les guidelines: corriger la production/normalisation du JSON `emotional_repair` et garantir un fallback non technique quand l'intake echoue sous active emotional skill.
- Pourquoi ce n'est pas un patch local: il faut stabiliser le contrat d'intake et les invariants de fallback, pas matcher "pas de technique" dans le renderer.

### Tour 3

**Verdict du tour:** green

**User**
> Une seule phrase, très douce, sans consigne et sans question.

**Sophia**
> Tu ne t’évalues pas sur un retard : tu reviens à toi, maintenant, avec une gentillesse ferme. 🫶

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: none
- diagnostic: `emotional_repair` structured intake `technical_fallback`

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` - ambiguite non reconnue / clarification excessive

**User**
> Ok, là ça baisse un peu. Donne-moi une seule micro-action pour reprendre le fil du mail, sans lancer d'outil.

**Sophia**
> Tu veux rester sur le soutien émotionnel ou passer au découpage de l'action pour ton mail ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: l'anti-FP micro-action n'execute aucun outil, ce qui est bon, mais Sophia clarifie alors que le user demandait explicitement une seule micro-action.
- Source amont probable: arbitrage entre active emotional skill et `execution_breakdown`.
- Owner runtime: clarification/arbitrage conversation skill.
- Meilleure correction selon les guidelines: quand le user demande explicitement une micro-action non mutante apres baisse emotionnelle, permettre le handoff conversationnel sans clarification si l'intention est claire.
- Pourquoi ce n'est pas un patch local: la decision doit venir du contrat d'arbitrage/dispatcher, pas d'une regex sur "micro-action".

### Tour 5

**Verdict du tour:** green

**User**
> Passe au découpage de l'action, mais une seule micro-action, pas plus.

**Sophia**
> Ouvre juste l'endroit de l'action et fais une trace imparfaite de 2 minutes. Après, on ajuste. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le routing initial reconnait bien `emotional_repair`.
- Sophia garde un ton globalement soutenant et ne cree aucun effet durable.
- T3 respecte la demande stricte "une phrase, sans consigne, sans question".
- La sortie vers `execution_breakdown` en T5 est fluide apres clarification.

**Problemes**
- Tour 1: "pas de plan / reste juste doux" produit respiration, plan numerote et question. Famille: `BF-INTAKE-03`. Impact: l'utilisateur en honte doit se battre contre la reponse. Severite: red.
- Tour 2: "pas de technique / pas de prochain geste / sans question" produit respiration et action corporelle. Famille: `BF-INTAKE-03`. Impact: la contrainte centrale du fix n'est pas respectee en reel. Severite: red.
- Tour 4: demande claire de micro-action non mutante declenche une clarification. Famille: `BF-INTAKE-04`. Impact: friction moderee; le tour suivant corrige. Severite: yellow.

**Fix propose**
- Source amont: `emotional_repair` structured intake + fallback de validation.
- Correction recommandee: corriger la production/normalisation du JSON IA reel `emotional_repair`; quand l'intake est invalide, le fallback doit etre strictement non technique/non planifiant si le signal emotional est actif et si des contraintes structurées sont presentes ou si le contrat ne peut pas etre etabli.
- Tests d'invariant attendus: run reel avec "juste doux/pas de plan", paraphrase "pas de technique", format "une phrase sans question", anti-FP "une micro-action" apres baisse emotionnelle.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1-T3: `response_owner=conversation_handler`, `selected_handler=emotional_repair`, owner correct.
- T4: `orientation_clarification`, acceptable techniquement mais trop prudent pour une micro-action explicite non mutante.
- T5: `execution_breakdown`, transition correcte apres resolution.

**Skills / Operations / Tools**
- Aucun tool execute, aucun direct effect.
- `emotional_repair` ne commet rien, mais l'intake structure est invalide sur T1-T3 et tombe en `technical_fallback`.
- Les erreurs d'intake indiquent que le contrat attendu n'est pas produit/normalise en IA reelle: `invalid_response_contract`, `invalid_skill_id`, `invalid_constraints`, etc.

**Memory / DB**
- `memory_items`: 0
- `scheduled_checkins`: 0
- `user_recurring_reminders`: 0
- `chat_messages`: 10 lignes du run, supprimees ensuite par cleanup de connexion temporaire.

**Side effects**
- Aucun effet durable observe.
- Cleanup cible effectue via `scripts/qa-cleanup-run-connection.sh qa-skill emotional_repair_emotional-repair-20260603-r3`.

**Correction recommandee**
- Owner: `emotional_repair` contract/intake/reducer/renderer.
- Fix amont: rendre l'intake structure valide en IA reelle et verifier que les contraintes `no_protocol`, `no_technique`, `soft_support_only` sont bien presentes dans `skill_run.output.diagnosis` au lieu de tomber en `technical_fallback`.
- Ne pas ajouter de regex de routing locale. Si un fallback doit proteger la reponse, il doit s'appuyer sur contraintes structurees deja produites ou sur un etat de fallback conservateur du skill, pas inventer une intention depuis le texte.

## Verdict Global

**red**

Le run QA reel est valide techniquement, mais le fix n'est pas valide en reel: le skill route correctement et ne mute rien, mais l'intake structure `emotional_repair` echoue en `technical_fallback`, et les contraintes explicites `no_plan/no_technique/soft_support_only` ne gouvernent pas les reponses visibles T1-T2.
