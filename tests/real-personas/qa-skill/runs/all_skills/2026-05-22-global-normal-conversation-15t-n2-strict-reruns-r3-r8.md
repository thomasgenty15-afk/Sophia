# Global Normal Conversation 15T - N2 Strict Reruns R3-R8

## 1. Contexte Du Test

- Date: 2026-05-22
- Runs: `global15_20260522_n2_strict_r3` à `global15_20260522_n2_strict_r8`
- Persona: users QA temporaires locaux, créés via Auth local puis nettoyés.
- Objectif: relancer le scénario N2 en run conversationnel strict, non pré-scripté, avec IA réelle et `force_full_ai=true`.
- Surfaces visées: dispatcher, `execution_breakdown`, `prepare_defense_card`, `create_one_shot_reminder`, `product_help`, mémoire locale, `update_coach_preferences`, `emotional_repair`.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, aucun renderer déterministe ni fallback `processMessage`.
- Validité QA: les tours envoyés ont été choisis après lecture des réponses précédentes. Les runs r4/r5/r6/r7/r8 ont été arrêtés dès bug bloquant plutôt que maquillés.

## 2. Résumé Des Relances

### R3

Run complet de 16 tours, dont un HTTP 502 retenté proprement.

Points verts:
- carte de défense créée après confirmation;
- rappel ponctuel créé pour samedi 23 mai 2026 à 07:35;
- aide produit rappel correcte;
- préférence coach finalement écrite en DB (`coach.question_tendency=low`, `source_type=explicit_user`).

Points bloquants:
- tour 11: “enregistre une préférence de coaching” a d'abord été traité par `execution_breakdown`, sans `update_coach_preferences`;
- tour 14: après préférence appliquée, Sophia propose encore deux gestes + une potion;
- tour 15: Sophia ne répond pas au résumé demandé;
- demande “retiens” sans mémoire durable: `memory_items` reste vide.

Verdict r3: red exploitable.

### Correctifs Après R3

- `ou` français dans “vidé ou vraiment crevé” ne bloque plus à tort les préférences coach comme si c'était une question “où dans l'app”.
- `Bien noté` sans effet durable est réécrit en repère conversationnel, pas promesse mémoire.
- “résume seulement ce qui est en place” est reconnu comme recap-only.

Tests:
- `deno test ...run_product_help_guard.test.ts ...update_coach_preferences/tests.ts`: 18 puis 19 passed.
- `deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts`: OK.

### R4

Échec tour 1: HTTP 502 avant réponse Sophia. Serveur local `supabase functions serve` trouvé arrêté; redémarrage effectué.

Verdict r4: invalide technique, user QA nettoyé.

### R5

Échec tour 2: demande explicite “Prépare-moi une carte de défense” reclassée en `immediate_mode_request_not_defense_card`; Sophia a produit une pseudo-carte conversationnelle sans pending confirmation.

Correctif:
- une demande explicite `prepare-moi une carte de défense` ne peut plus être bloquée par le garde “maintenant / apaisement immédiat”.

Verdict r5: red exploitable, user QA nettoyé.

### R6

Échec tour 7: après création d'un rappel, la question pronominale “le changer ou l'annuler” a reçu une réponse erronée parlant de `Ressources/Cartes`.

Correctif:
- `oneShotReminderManagementReplyForTest` couvre maintenant les follow-ups pronominaux du type “le changer/l'annuler”.

Verdict r6: red exploitable, user QA nettoyé.

### R7

Échec tour 1: demande large “sauver le minimum / sans grand plan” a lancé `prepare_attack_card`.

Correctif:
- garde anti-faux départ élargi à `sauver le minimum`, `minimum utile`, `sans grand plan`, `pas un plan complet`.

Verdict r7: red exploitable, user QA nettoyé.

### R8

Progression jusqu'au tour 9, puis arrêt.

Points verts:
- tour 1: faux départ `prepare_attack_card` bloqué (`broad_rescue_request_not_attack_card`);
- tours 2-4: carte de défense draft -> ajustement -> confirmation -> création OK;
- tour 7: aide produit pronominale rappel corrigée et conforme.

Points bloquants:
- tour 6: rappel créé à la bonne heure (`2026-05-23T05:45:00+00:00`) mais libellé visible/metadata pollué: `45 de prendre le carnet sur la table`;
- tour 8: HTTP 502, retenté après vérification;
- tour 9: “retiens juste pour cette conversation” routé à tort vers `update_coach_preferences`.

Verdict r8: red exploitable, user QA nettoyé.

## 3. Analyse De Fluidité Humaine

**Verdict: red**

La conversation est parfois naturelle, mais pas assez stable pour un green strict. Les principaux irritants utilisateur sont:
- propositions de cartes ou menus quand l'utilisateur demande un minimum;
- promesses “noté/retiens” encore ambiguës selon le chemin;
- réponses incomplètes en fin de conversation;
- libellé de rappel pollué par l'heure.

## 4. Analyse Système

**Verdict: red**

Les correctifs ont amélioré plusieurs routes, mais deux bugs bloquent encore le vert:
- parsing du rappel ponctuel: l'heure `7h45` fuit dans l'instruction (`45 de prendre...`);
- distinction mémoire locale vs préférence coach: “retiens juste pour cette conversation” ne doit pas démarrer `update_coach_preferences`.

Les nettoyages ciblés des users QA r3 à r8 ont été effectués dans le périmètre test. Le cleanup signale `user_memories` en 404 car la table n'existe pas dans le schema local, sans impact sur les tables réellement présentes.

## Verdict Global

**Verdict: red exploitable.**

Relance effectuée avec IA réelle et autorisation externe explicite. Le run strict n'est pas vert. Les derniers correctifs passent les tests ciblés et `deno check`, mais il reste au moins deux corrections avant une relance green crédible: parser rappel `7h45` et exclure “juste pour cette conversation” de `update_coach_preferences`.
