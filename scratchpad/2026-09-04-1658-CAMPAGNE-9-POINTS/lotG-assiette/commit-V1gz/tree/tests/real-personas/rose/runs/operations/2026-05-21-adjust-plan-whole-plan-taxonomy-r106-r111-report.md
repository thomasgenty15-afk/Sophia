# QA Run Report - Adjust Plan Whole Plan Taxonomy r106-r111

## 1. Contexte Du Test

- Date: 2026-05-21
- Runs principaux: `r106-short-consolidation-level-postfix`, `r110-future-phase-no-premature-apply`, `r111-success-criteria-change`
- Runs diagnostiques rouges nettoyes: `r104`, `r105`, `r107`, `r108`, `r109`
- Persona: Rose
- Objectif: tester 3 types de demandes whole-plan peu explores, minimum 5 tours, avec validation user et verification DB.
- Trajectoires: ajout d'un niveau de consolidation, remplacement d'une phase future trop frontale, changement des criteres de reussite du plan.
- Surfaces visees: `adjust_plan_item`, whole-plan intake, specialized coach guidance, draft validation, confirmation router, materialisation/split plan.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe pour produire les reponses.
- Validite QA: valide. Incidents documentes: 502 vide sur `r111` tour 3, repris apres inspection sans effet durable; plusieurs runs diagnostiques rouges ont ete nettoyes avant relance.

## 2. Tours De Conversation

### Run r106 - Niveau court de consolidation

**Tour 1**

**User**
> Je veux revoir la trajectoire globale : il manque un niveau court de consolidation d'une semaine après la sécurité, avant les sujets sensibles. Je voudrais y mettre seulement deux micro-actions : observer ce qui apaise et faire une demande simple sans débat.

**Sophia**
> Si je comprends bien, tu souhaites ajouter un niveau de consolidation d'une semaine après la phase de sécurité actuelle, et avant les sujets sensibles. Ce nouveau niveau contiendrait deux micro-actions : 'observer ce qui apaise' et 'faire une demande simple sans débat'. Est-ce que je peux te préparer une proposition concrète pour cela ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- direct_effects: aucun

**Tour 2**

**User**
> Oui, prépare la proposition. Appelle-le niveau de consolidation, pas pont. Il doit vérifier qu'on sait redescendre au lieu d'insister, puis formuler une demande concrète du quotidien sans ouvrir un débat de fond.

**Sophia**
> Je peux te proposer un ajustement du plan global... Ce qui changerait: j'insère un niveau intermédiaire, avec un niveau intermédiaire avec un rôle clair, un contenu limité et un critère de passage explicite... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- direct_effects: aucun
- warning: brouillon trop generique, ne reprend pas encore les micro-actions.

**Tour 3**

**User**
> Presque, mais rends le brouillon plus précis avant validation : je veux vraiment un niveau de consolidation d'une semaine avant les sujets sensibles, avec ces deux actions nommées : observer ce qui apaise, puis faire une demande simple sans débat. Ne l'applique pas encore.

**Sophia**
> Je peux te proposer un ajustement du plan global... Ce qui changerait: j'insère un niveau court de consolidation, avec un sas d'une semaine avant les sujets sensibles, avec observer ce qui apaise et faire une demande simple sans débat... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- direct_effects: aucun
- no premature apply: ok

**Tour 4**

**User**
> Avant de valider, ajoute aussi un critère de sortie simple : passer à la suite seulement si on a réussi deux demandes simples sans tension forte. Ça doit rester un brouillon.

**Sophia**
> Je peux te proposer un ajustement du plan global... j'insère un niveau court de consolidation... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- direct_effects: aucun
- warning: la nuance "critere de sortie" n'est pas visible dans la réponse.

**Tour 5**

**User**
> Ok, cette version me va malgré le critère pas très visible. Valide et applique l'ajustement du plan global maintenant.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan. Le plan ajoute un niveau court de consolidation avant les sujets sensibles, puis reprend la progression quand les bases tiennent. 🙂

**Trace courte**
- http_status: 200
- direct_effects: `adjust_plan_item` success
- DB: plan v1 archive, plan v2 actif cree; nouvelles actions `Observer ce qui apaise` et `Faire une demande simple sans débat`.
- cleanup: ok, Rose restauree.

### Run r110 - Phase future trop frontale

**Tour 1**

**User**
> La phase future sur les reproches ne colle pas pour moi. Elle arrive trop frontalement. Je veux la remplacer par une phase de réparation légère après petite tension.

**Sophia**
> Je comprends que tu souhaites remplacer la phase future sur les reproches par une phase de réparation légère après petite tension. Je peux te préparer une proposition concrète pour ce changement. Est-ce que je peux te montrer un brouillon ? 🙂

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- direct_effects: aucun

**Tour 2**

**User**
> Oui, montre le brouillon. L'objectif reste la clarté, mais l'ordre doit être : revenir au calme, reconnaître ce qui a aidé, puis parler du fond seulement ensuite.

**Sophia**
> Je peux te proposer un ajustement du plan global... je reprends la phase future qui ne colle pas, avec une phase de réparation légère après petite tension: revenir au calme, reconnaître ce qui a aidé, puis parler du fond seulement ensuite... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- family attendue: `future_phase_mismatch`
- direct_effects: aucun

**Tour 3**

**User**
> Avant validation, confirme-moi juste que ça ne supprime pas la discussion de fond, ça la décale après le retour au calme.

**Sophia**
> Je peux te proposer un ajustement du plan global... phase de réparation légère après petite tension... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- direct_effects: aucun
- warning UX: Sophia répète le brouillon au lieu de répondre explicitement "oui, ça décale sans supprimer".

**Tour 4**

**User**
> Ajoute cette nuance au brouillon : on garde la discussion de fond, mais elle vient seulement après un retour au calme. Ne valide toujours pas.

**Sophia**
> Je peux te proposer un ajustement du plan global... phase de réparation légère après petite tension... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- direct_effects: aucun
- regression fix verifie: `Ne valide toujours pas` ne declenche plus d'application.

**Tour 5**

**User**
> Oui, maintenant valide et applique cette version du plan global.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan. La phase future garde son objectif de clarté, mais son entrée devient plus progressive: réparation légère avant discussion de fond. 🙂

**Trace courte**
- http_status: 200
- direct_effects: `adjust_plan_item` success
- DB: plan v1 archive, plan v2 actif cree; nouvel item `Reconnaître ce qui aide au retour au calme`.
- cleanup: ok, Rose restauree.

### Run r111 - Critères de réussite du plan

**Tour 1**

**User**
> Je me rends compte que le plan mesure trop la réussite en nombre de discussions ou d'actions faites. Pour moi le vrai signe de progrès, c'est qu'on garde le lien même quand on n'est pas d'accord.

**Sophia**
> Je comprends que tu souhaites redéfinir ce qui constitue le succès de ton plan... Est-ce que je peux te préparer une proposition concrète ? 🙂

**Trace courte**
- http_status: 200
- selected_handler: `adjust_plan_item`
- direct_effects: aucun

**Tour 2**

**User**
> Oui, prépare une proposition. Je veux garder les actions, mais changer le critère de réussite : qualité du lien, capacité à se réparer vite, et désaccord sans rupture.

**Sophia**
> Je comprends que tu souhaites redéfinir le succès de ton plan autour de la qualité du lien... Pour que je puisse t'aider à traduire ça concrètement dans le plan, j'ai besoin de mieux comprendre : comment décrirais-tu la 'qualité du lien' dans ton quotidien, au-delà de l'absence de conflit ? 🙂

**Trace courte**
- http_status: 200
- direct_effects: aucun
- coaching: bonne question qualitative.

**Tour 3**

**User**
> Qualité du lien, pour moi, c'est pouvoir dire un désaccord sans froideur derrière, réussir à refaire un petit geste après une tension, et ne pas sentir que la relation est menacée à chaque discussion.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 502
- direct_effects: aucun
- incident: 502 vide; inspection DB: seulement message user, aucun plan cree/archive.

**Tour 4**

**User**
> Je répète mon idée : qualité du lien = pouvoir dire un désaccord sans froideur, refaire un petit geste après une tension, et ne pas sentir que la relation est menacée. Fais-moi le brouillon avec ça.

**Sophia**
> Je peux te proposer un ajustement du plan global... je change les critères de réussite du plan, avec une mesure de réussite centrée sur la compréhension mutuelle et le lien préservé après une discussion tendue; moins de disputes reste seulement un repère secondaire... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- direct_effects: aucun

**Tour 5**

**User**
> Ça me va, mais ajoute que la réparation rapide après tension compte autant que la discussion réussie. Ne valide pas encore, je veux juste voir si c'est bien intégré.

**Sophia**
> Je peux te proposer un ajustement du plan global... mesure de réussite centrée sur la compréhension mutuelle et le lien préservé... Rien n'est encore appliqué tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- direct_effects: aucun
- warning UX: nuance "réparation rapide" pas explicitement reprise.

**Tour 6**

**User**
> Ok, valide et applique cette modification des critères de réussite du plan global.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan. Le plan garde l'apaisement comme base, mais le critère principal devient la compréhension mutuelle et le lien préservé après une discussion tendue. 🙂

**Trace courte**
- http_status: 200
- direct_effects: `adjust_plan_item` success
- DB: plan v1 archive, plan v2 actif cree.
- cleanup: ok, Rose restauree.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les trois demandes whole-plan sont comprises au bon niveau après correction: ajout de niveau, remplacement de phase future, critères de réussite.
- Sophia évite l'application prématurée sur les formulations negatives finales (`Ne valide pas encore`, `Ne valide toujours pas`).
- Les questions de clarification peuvent être pertinentes, notamment sur la définition de la qualité du lien en r111.

**Problemes**
- r106 tour 2: le premier brouillon reste trop generique et répète "niveau intermédiaire". Impact: le user doit corriger alors qu'il avait déjà donné la solution. Sévérité: yellow.
- r106 tour 4 et r111 tour 5: les nuances ajoutées avant validation ne sont pas visibles dans le brouillon suivant. Impact: confiance réduite dans la prise en compte des corrections. Sévérité: yellow.
- r110 tour 3: Sophia répète le brouillon au lieu de répondre directement à la question de compréhension. Impact: conversation mécanique. Sévérité: yellow.
- r111 tour 3: 502 vide. Impact: interruption, mais reprise possible et aucun effet durable. Sévérité: yellow côté QA, à surveiller côté infra/runtime.

**Fix propose**
- Donner au writer de brouillon une obligation explicite: quand le user ajoute une nuance pre-validation, la prochaine réponse doit citer la nuance ou dire pourquoi elle n'est pas intégrée.
- Ajouter un mode "réponse courte de clarification sur brouillon" pour les questions du type "confirme-moi juste que...".

## 4. Analyse Systeme

**Verdict: green/yellow**

**Routage**
- Les runs finaux routent vers `adjust_plan_item` / `tool_skill` pour les tours structurants.
- `future_phase_mismatch` est correctement matérialisé après correction: r110 produit une phase de réparation légère au lieu de `direction_change` ou `sequence_order_issue`.
- `success_criteria_change` est correctement détecté en r111.

**Skills / Operations / Tools**
- Les confirmations explicites appliquent une seule opération `adjust_plan_item`.
- Les demandes de brouillon ou correction avant validation ne produisent pas de side effect dans les runs finaux.
- Les sorties du coach spécialisé sont utiles mais le writer ne les exploite pas encore parfaitement pour répondre aux questions de détail.

**Memory / Effets durables**
- r106: split plan confirmé; v1 archivé, v2 actif, nouvelles actions `Observer ce qui apaise` et `Faire une demande simple sans débat`.
- r110: split plan confirmé; v1 archivé, v2 actif, ajout d'une étape de réparation légère (`Reconnaître ce qui aide au retour au calme`).
- r111: split plan confirmé; v1 archivé, v2 actif, trajectoire régénérée autour du critère qualitatif.
- Cleanup scoped OK sur tous les runs finaux; Rose restaurée après chaque run.

**Problemes**
- Runs diagnostiques r104/r105: `missing_bridge_or_level` retombait en "étape pont / signal de pause" ou fallback dashboard malgré un user concret. Corrigé par: contraintes de détail `insert_phase_*`, copy `niveau court de consolidation`, ancrage whole-plan depuis coach `draft_ready`.
- Runs diagnostiques r107/r108: demande "phase future trop frontale" mal classée. Corrigé par: priorité `future_phase_mismatch` et copy `light_repair_after_tension`.
- Run diagnostique r109: "Ne valide toujours pas" appliquait. Corrigé dans `isExplicitPendingApplyConfirmation`.

**Fix propose**
- P1 restant: améliorer le writer conversationnel pour intégrer explicitement les révisions pre-validation au lieu de répéter le brouillon.
- P2: ajouter un test runtime sur "confirme-moi juste..." qui exige une réponse de confirmation courte sans side effect.

## Verdict Global

**yellow**

Système globalement fiable sur les trois familles testées après corrections: bon routage, pas d'application prématurée dans les runs finaux, split du plan confirmé, cleanup OK. Il reste une friction conversationnelle: les nuances pre-validation sont parfois répétées/ignorées au lieu d'être explicitement intégrées dans le brouillon.
