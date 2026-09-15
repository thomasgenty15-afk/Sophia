# QA Run Report - select-state-potion-visible-agent-smoke-r3

## 1. Contexte Du Test

- Date: 2026-06-05
- Run: `select-state-potion-visible-agent-smoke-r3`
- Persona: `qa-skill`
- Connexion: `statepotion_visible_agent_smoke_r3` temporaire, nettoyee apres run
- Objectif: verifier que l'entree globale "je veux une potion mais je ne sais pas laquelle" route vers `select_state_potion` et produit une clarification naturelle sans lister deux labels de potions.
- Trajectoire: un tour smoke, ambiguite apaisement vs anti-decrochage.
- Surfaces visees: global dispatcher, `select_state_potion`, visible agent IA stage-specific, trace runtime, no-mutation.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide comme smoke cible mono-tour. Limite: le raw JSON complet n'a pas ete persiste en artefact; le rapport reprend la sortie courte capturee pendant le run avec le message exact, la reponse exacte et les champs de trace utiles.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-TEST-01` - trace/test incoherent ou suite malsaine

**User**
> Je veux une potion, je ne sais pas laquelle. Je suis partagé entre redescendre la pression maintenant et retrouver assez d’élan pour ne pas lâcher mon rythme.

**Sophia**
> Je comprends que tu hésites entre te sentir plus apaisé(e) et retrouver ton dynamisme. Quelle est la priorité pour toi en ce moment ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `normal_reply_default`
- safety: non observee / pas de signal safety dans le message
- direct_effects: aucun effet durable observe
- operation: `select_state_potion`
- pending_confirmation: aucun
- memory_plan: non inspecte dans cette sortie courte
- executed_tools: `null`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le comportement visible et l'owner sont bons, mais le `reason_code` ressort `normal_reply_default` alors que `response_owner=tool_skill` et `selected_handler=select_state_potion`.
- Source amont probable: mapping de trace / reason code apres resolution de route vers tool skill.
- Owner runtime: router / trace mapping / operation runtime response handler.
- Meilleure correction selon les guidelines: aligner le `reason_code` sur la decision structuree effectivement appliquee, sans changer le comportement conversationnel et sans patcher par phrase.
- Pourquoi ce n'est pas un patch local: il faut corriger la projection de trace depuis l'etat runtime, pas ajouter une exception textuelle au renderer ou au prompt.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La reponse est courte, naturelle et lisible.
- Sophia clarifie par besoin reel: redescendre la pression vs retrouver de l'elan.
- Elle ne force pas un choix arbitraire.
- Elle ne liste pas deux labels produit comme options.
- Elle garde un emoji, ce qui est conforme a la preference produit exprimee.

**Problemes**
- Aucun probleme visible bloquant sur ce tour.

**Fix propose**
- Source amont: aucun fix de fluidite requis sur ce smoke.
- Correction recommandee: conserver l'agent visible stage-specific avec garde contractuelle contre les listes de labels en clarification.
- Tests d'invariant attendus: garder un smoke IA reel sur ambiguite apaisement vs anti-decrochage et un test contractuel rejetant les clarifications qui listent deux noms de potions.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le routage fonctionnel est correct: `response_owner=tool_skill`, `selected_handler=select_state_potion`.
- Le user entre bien dans le monde potion sans passer par une clarification globale produit/emotion.
- Warning: `route_reason=normal_reply_default` est incoherent avec le handler selectionne.

**Skills / Operations / Tools**
- `select_state_potion` est bien le handler choisi.
- Aucun tool execute, ce qui est attendu: le chat ne cree ni ne lance de potion.
- Aucun effet durable observe, conforme au contrat no-mutation.

**Memory / Effets durables**
- Aucun effet durable attendu.
- Pas d'indice de creation DB, confirmation token ou mutation.
- Memory non inspectee dans cette sortie courte; pas de signal utilisateur qui requerait une ecriture memoire.

**Problemes**
- Tour 1: trace reason incoherente. Famille: `BF-TEST-01`. Impact systeme: les futurs rapports QA peuvent classer a tort le tour comme `normal_reply_default` alors que l'owner/handler montrent un tool skill actif. Severite: yellow.

**Fix propose**
- Source amont: mapping du `reason_code` apres resolution route/skill dans le pipeline runtime.
- Correction recommandee: propager un reason code du type `orientation_clarification_resolved_tool_skill` ou `skill_entry_signal` quand `selected_handler=select_state_potion`.
- Tests d'invariant attendus: test runtime trace qui assert `response_owner=tool_skill`, `selected_handler=select_state_potion` et `reason_code` non `normal_reply_default` pour une entree explicite "je veux une potion mais je ne sais pas laquelle".

## Verdict Global

- Verdict: yellow
- Raison principale: experience visible green et routing fonctionnel correct, mais trace systeme incoherente sur `reason_code`.
- Follow-up prioritaire: corriger la projection du reason code sans toucher au visible agent ni ajouter de patch lexical.
