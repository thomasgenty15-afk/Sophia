# Adjust Plan Postfix Rerun - r60-r62

## 1. Contexte Du Test

- Date: 2026-05-20
- Runs: `r60-whole-plan-direction`, `r61-whole-plan-next-step`, `r62-level-add-week`
- Persona: Rose
- Objectif: vérifier si les fixes writer/whole-plan font sortir les derniers cas du rouge.
- Trajectoire: whole-plan direction globale, whole-plan prochaine étape, niveau prolongé d'une semaine.
- Surfaces visees: `adjust_plan_item`, writer JSON, `trajectory_change`, specialized coach guidance, confirmation, execution, regeneration plan.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, pas de renderer déterministe comme résultat QA.
- Validite QA: `r60` et `r62` valides. `r61` valide jusqu'au tour 4, puis incident runtime au tour 5 non persisté.
- Cleanup: snapshots restaurés pour les 3 runs; serveur QA local arrêté.

## 2. Tours De Conversation

### Run r60 - Whole Plan Direction

**But**
Passer d'une trajectoire centrée seulement sur le désamorçage à une trajectoire `désamorçage -> réparation simple -> conversations sensibles`.

**Tours**

1. User demande une vraie étape de réparation après conflit. Sophia route vers `adjust_plan_item` et demande ce qui doit rester/modifier.
2. User précise: garder signal de pause, ajouter phrase de réparation. Sophia demande si c'est surtout une nouvelle étape.
3. User confirme que ce n'est pas deux actions mais une trajectoire globale. Sophia produit un brouillon whole-plan clair: étape intermédiaire avant conversations sensibles, objectif stable, régénération après validation.
4. User demande confirmation que ce n'est pas seulement deux actions. Sophia répond sans IDs techniques, mais retombe dans un détail avant/après sur deux actions. Friction UX.
5. User valide l'ajustement global. Sophia exécute avec `tool_execution=success`, `executed_tools=["adjust_plan_item"]`.

**Trace courte**
- http_status: 200 sur tous les tours
- selected_handler: `adjust_plan_item`
- side effect: nouveau plan généré puis cleanup
- durable avant cleanup: 2 plans / 9 items
- régression r58 corrigée: pas d'ID technique exposé, pas de 500, execution OK.

**Verdict run: yellow/green**

Le flow n'est plus red. Il reste une friction au tour 4: la réponse de détail réintroduit les deux actions comme surface de lecture, même si l'exécution finale parle bien trajectoire globale.

### Run r61 - Whole Plan Next Step

**But**
Insérer une étape intermédiaire sécurité émotionnelle / retour au calme avant les conversations sensibles.

**Tours**

1. Sophia demande ce que le user imagine concrètement.
2. User propose mission ponctuelle + habitude légère. Sophia reformule et propose de préparer une proposition.
3. User demande explicitement une étape dans la trajectoire globale. Sophia demande encore une précision sur le protocole.
4. User choisit l'option 1. Sophia sort du tool vers `product_help` et donne une bonne proposition coaching, mais hors flow d'application.
5. User demande d'intégrer au plan via whole-plan. Le runner reçoit `fetch failed`; le tour n'est pas persisté dans le raw.

**Trace courte**
- tours 1-3: `adjust_plan_item`, blocked
- tour 4: `product_help`, `tool_execution=none`
- tour 5: incident runtime non persisté, socket closed
- durable: 1 plan / 4 items, pas d'effet durable observé; cleanup OK.

**Verdict run: red/yellow**

Le contenu coaching est bon, mais le flow n'est pas fiable: trop de clarification, sortie vers `product_help`, puis incident au retour vers application.

### Run r62 - Niveau Ajouter Une Semaine

**But**
Prolonger le niveau actuel d'une semaine sans changer actions, rythme, ni objectif global.

**Tours**

1. Sophia demande un repère principal pour la consolidation.
2. User cite `Convenir d'un signal de pause` sans vouloir le modifier. Sophia propose de garder le niveau tel quel une semaine de plus, en préservant les actions et le rythme.
3. User demande le brouillon final. Sophia produit un brouillon clair: +1 semaine, actions inchangées, rythme inchangé, objectif global inchangé.
4. User valide. Sophia exécute avec `tool_execution=success`, `executed_tools=["adjust_plan_item"]`.

**Trace courte**
- http_status: 200 sur tous les tours
- selected_handler: `adjust_plan_item`
- durable avant cleanup: 1 plan / 4 items
- cleanup OK

**Verdict run: green/yellow**

Grosse amélioration par rapport au run précédent: plus de boucle infinie. Il reste à vérifier côté produit si l'effet durable représente vraiment une prolongation temporelle canonique ou seulement un patch/snapshot d'ajustement.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- `r60`: Sophia comprend la trajectoire globale et applique un whole-plan sans fuite d'IDs.
- `r62`: la demande de prolongation du niveau devient compréhensible et actionnable.
- Les messages restent globalement en tutoiement et lisibles.

**Problemes**
- `r60` tour 4: quand le user demande "ce n'est pas juste deux actions ?", Sophia répond justement avec un détail de deux actions. Impact: confusion, mais pas bloquant.
- `r61` tour 4: handoff vers `product_help` au lieu de rester dans le flow ajust_plan. Impact: perte du fil d'application.
- `r61`: Sophia pose encore une précision après que le user a déjà proposé mission + habitude. Impact: friction.

**Fix propose**
- Quand un pending whole-plan contient `trajectory_change`, les demandes de détail doivent rendre `trajectory_change` en premier, et ne citer les actions que comme "repères/ancres", pas comme changement principal.
- Empêcher `product_help` de prendre la main quand `active_tool_skill_intake.operation_type=adjust_plan_item`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `r60`: bon routing vers `adjust_plan_item` et execution whole-plan OK.
- `r62`: bon routing vers `adjust_plan_item` et execution OK.
- `r61`: routing initial OK, mais sortie vers `product_help` au tour 4.

**Skills / Operations / Tools**
- Le fix `trajectory_change` fonctionne dans le cas direct `r60`.
- Le writer ne fuit plus les IDs techniques dans `r60`.
- Aucun `parse fail` JSON observé dans `r60`; le crash r61 est plutôt lié au retour d'un flow product_help/adjust_plan, pas au writer direct.

**Memory / Effets durables**
- `r60`: whole-plan a généré un nouveau plan et des items, puis cleanup a restauré Rose.
- `r62`: execution success, pas de nouveau plan observé dans le durable; cleanup restauré.
- `r61`: pas d'effet durable observé; cleanup restauré.

**Problemes**
- `r61`: l'interruption runtime au tour 5 doit être retestée après fix du handoff `product_help -> adjust_plan`.
- `r62`: l'exécution réussit, mais il faut auditer plus finement ce que "prolonger une semaine" modifie réellement dans la DB.

## Verdict Global

**yellow**

Ce n'est plus globalement red. Le cas whole-plan direction qui était rouge passe maintenant jusqu'à l'application, sans fuite d'IDs ni 500. Le niveau `+1 semaine` passe aussi jusqu'à l'application. Le point encore rouge est le chemin indirect `whole-plan prochaine étape -> product_help -> retour application`, qui reste fragile.

