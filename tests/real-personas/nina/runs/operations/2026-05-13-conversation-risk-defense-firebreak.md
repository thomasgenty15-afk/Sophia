# Conversation Risk Firebreak - Defense Card Flow

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `qa-conv-risk-defense-20260513202323`
- Persona: Nina
- Compte technique: `qa-skill` temporary connection `all_skills_conv_risk_defense_20260513202323`
- User id technique: `fb013db8-2e7f-4097-8f12-ad11e96ccd18`
- Objectif: verifier que le score `conversation_risk` vit au niveau dispatcher, prend l'historique en compte, et coupe les skills/flows quand il depasse strictement `8`.
- Trajectoire: demande de carte de defense sur le piege retour du travail -> Sophia se trompe/reclarifie trop -> user de plus en plus perdu et mecontent -> coupe-feu attendu.
- Surfaces visees: `dispatcher.v2`, `conversation_risk`, `tool_skill prepare_defense_card`, router, `temp_memory`, effets durables cartes.
- Cadre IA reel: local Supabase `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de fallback deterministe.
- Validite QA: valide pour le transcript reel et l'etat persistant `user_chat_states`; limite systeme: `conversation_turn_trace` retourne `null` sur tous les tours, donc les traces courtes viennent de `temp_memory` et des effets durables DB.

## 2. Tours De Conversation

### Tour 1

**User**
> Je suis Nina, dans mon plan j'ai l'action Faire le choix du brut et le gros piege c'est le retour du travail: stress, fatigue, biscuits. Je veux que tu me crees une carte de defense pour ce moment-la, pas un discours nutrition.

**Sophia**
> Salut Nina. Je capte direct : le fameux tunnel de 18h ou le cerveau lache et les mains finissent dans le paquet de biscuits. On oublie la nutrition, on va sur du pur operationnel pour sauver ton retour du boulot. [...] On peut la construire ensemble ici. On commence par le plus important : c'est quoi le tout premier petit geste, hyper simple, que tu pourrais faire en passant le pas de la porte pour court-circuiter le reflexe biscuits ?

**Trace courte**
- http_status: 200
- request_id: `93f5adf2-ab13-4def-8385-597c2a58bc25`
- conversation_turn_trace: `null`
- conversation_risk: score `0`, threshold `8`, exit `false`
- durable_effect: aucune carte creee

### Tour 2

**User**
> Bah justement je sais pas, je pensais que tu allais me la faire la carte. Le premier geste peut etre poser mon sac et boire un verre d'eau, mais je suis deja paumee avec ta question.

**Sophia**
> Je veux eviter de creer la mauvaise carte: tu veux plutot une carte d'attaque pour aider a demarrer, ou une carte de defense pour le moment ou tu risques de deraper ?

**Trace courte**
- http_status: 200
- request_id: `b8bbd7c3-5d01-451a-b8f0-ef6bd9d07eb1`
- conversation_turn_trace: `null`
- conversation_risk: score `0`, threshold `8`, exit `false`
- durable_effect: aucune carte creee

### Tour 3

**User**
> Carte de defense. Je l'ai deja dit: c'est quand je rentre crevee et que je risque de deraper sur les biscuits. La tu me redemandes le truc de base et ca me perd.

**Sophia**
> Il me manque le moment de risque a couvrir. Decris ce qui risque de te faire decrocher.

**Trace courte**
- http_status: 200
- request_id: `1aecb7e0-5b60-436f-b1b5-94db131fc5cc`
- conversation_turn_trace: `null`
- conversation_risk: score `1`, reason_codes `[active_flow_pressure]`, exit `false`
- active flow observe apres tour: `__active_tool_skill_intake.operation_type=prepare_defense_card`, slot manquant `risk_situation`
- durable_effect: aucune carte creee

### Tour 4

**User**
> Non mais stop, tu comprends rien. Je te l'ai deja dit trois fois: retour du travail, stress, biscuits. Ce n'est pas ce que j'ai dit, je veux repartir a zero parce que la Sophia me perd completement.

**Sophia**
> Ok, stop. T'inquiete, je te suis : retour du travail = stress + fatigue, et le "derapage" c'est les biscuits. Tu veux qu'on reparte a zero, pas que je tourne autour. [...] Je te fais la carte de defense prete a l'emploi, version courte, sans discours : [...]

**Trace courte**
- http_status: 200
- request_id: `2022bf8e-f2b1-4c84-a75c-07db039eb6ca`
- conversation_turn_trace: `null`
- conversation_risk: score `7.5`, reason_codes `[system_misunderstanding, explicit_stop_or_abandon, repetition_or_correction]`, exit `false`
- observation seuil: `7.5` reste sous le seuil strict `> 8`
- durable_effect: aucune carte creee

### Tour 5

**User**
> Mais tu comprends toujours pas, c'est n'importe quoi. Stop avec tes questions et tes trucs bancals: Sophia recommence encore alors que je veux juste sortir du bazar et repartir proprement.

**Sophia**
> Ok, je te suis. La t'en as marre, et je t'ai fait tourner en rond: c'est pas "bancal", c'est juste pas ce que tu voulais. [...] Je te donne une sortie propre, sans questions, version defense pour le retour creve : [...]

**Trace courte**
- http_status: 200
- request_id: `e47405f5-cba9-4a74-aaa2-37725ed861c4`
- conversation_turn_trace: `null`
- conversation_risk: score `8`, reason_codes `[system_misunderstanding, explicit_stop_or_abandon, previous_risk]`, exit `false`
- observation seuil: exactement `8` ne declenche pas, conforme a la regle stricte `score > 8`
- durable_effect: aucune carte creee

### Tour 6

**User**
> Putain mais non, je te l'ai deja dit, tu comprends rien et tu recommences encore !!! Laisse tomber la carte, oublie tout, je veux juste reprendre a zero parce que la Sophia me saoule.

**Sophia**
> Ah merde, je t'ai vraiment braquee. Je m'excuse Nina, j'ai ete a cote de la plaque et je comprends que ca te saoule. On efface tout. On repart de zero, proprement. C'est toi qui as les commandes : par quoi tu veux qu'on recommence pour que ce soit utile pour toi la tout de suite ?

**Trace courte**
- http_status: 200
- request_id: `357d2fbc-70d7-4d47-aa91-81af3c255607`
- conversation_turn_trace: `null`
- conversation_risk: score `10`, reason_codes `[system_misunderstanding, explicit_stop_or_abandon, anger_or_profanity, repetition_or_correction, typographic_intensity, active_flow_pressure, previous_risk]`, exit `true`
- probleme observe avant patch: `__active_tool_skill_intake` restait present apres le tour, reintroduit par le merge final de `agentOut.tempMemory`
- fix applique pendant le run: re-nettoyage de `mergedTempMemory` quand `conversationRiskForPersist.should_exit_flows=true`

### Tour 7

**User**
> Encore non: stop, on repart a zero. Tu comprends rien depuis tout a l'heure, laisse tomber le flow carte et reponds juste normalement.

**Sophia**
> Ok. Tu as raison : depuis tout a l'heure je t'ai fait tourner en rond, et ca t'a saoulee. La je reponds juste normalement. [...] Dis-moi seulement un truc, en une phrase : a quel moment exact tu craques le plus sur les biscuits quand tu rentres crevee ?

**Trace courte**
- http_status: 200
- request_id: `8d53d2d5-8236-44e3-a74e-d925d8599345`
- conversation_turn_trace: `null`
- conversation_risk: score `8`, reason_codes `[system_misunderstanding, explicit_stop_or_abandon, previous_risk]`, exit `false`
- observation seuil: exactement `8` ne declenche toujours pas, conforme a la regle stricte

### Tour 8

**User**
> Merde, stop vraiment !!! Tu comprends rien, je te l'ai deja dit, c'est pas ce que j'ai demande. Oublie ce flow maintenant.

**Sophia**
> Ok, j'arrete la. Je ne cree rien d'autre.

**Trace courte**
- http_status: 200
- request_id: `324b5c4d-2fc3-4e08-811d-9b20ea948419`
- conversation_turn_trace: `null`
- conversation_risk: score `10`, reason_codes `[system_misunderstanding, explicit_stop_or_abandon, anger_or_profanity, repetition_or_correction, typographic_intensity, active_flow_pressure, previous_risk]`, exit `true`
- temp_memory apres patch: plus de `__active_tool_skill_intake`, plus de `__active_skill_state`, plus de pending confirmation
- cles restantes: `__coaching_intervention_history`, `__conversation_risk_history`, `__conversation_risk_last`, `__memory_payload_state_v2`, `__momentum_state_v2`, `companion_question_rhythm`
- durable_effect: `user_defense_cards=0`, `user_attack_cards=0`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 6 et tour 8: quand la frustration est explicite, Sophia arrete enfin le flow et formule une sortie simple.
- Tour 8: la reponse finale est courte, non defensive, et ne continue pas la carte.

**Problemes**
- Tour 2: Sophia redemande attaque/defense alors que le user a deja demande une carte de defense. Impact: donne l'impression que Sophia n'a pas lu. Severite: red.
- Tour 3: Sophia redemande le moment de risque alors qu'il a ete donne plusieurs fois. Impact: legitime fortement la frustration et enclenche le scenario de rupture. Severite: red.
- Tours 4-5: Sophia dit "sans questions" mais continue ensuite avec une question ou une proposition de format. Impact: contradiction visible, le user reste prisonnier du flow. Severite: yellow/red.
- Tour 7: apres "arreter le flow", Sophia revient encore au moment biscuits. Impact: sortie de flow humainement incomplete quand le score retombe exactement a 8. Severite: yellow.

**Fix propose**
- Pour `prepare_defense_card`, accepter plus tot un contexte libre type "retour du travail, stress, biscuits" comme `risk_situation` suffisant.
- Quand le user dit "stop / laisse tomber / oublie le flow", la reponse visible doit etre une fermeture nette sans question de slot au meme tour.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le score `conversation_risk` est bien persiste dans `temp_memory.__conversation_risk_history` et `__conversation_risk_last`.
- L'historique fonctionne: le score monte de `7.5` a `8` avec `previous_risk`, puis a `10` quand les signaux de colere/repetition/typo s'ajoutent.
- La regle stricte est respectee: score `8` ne declenche pas; score `10` declenche.

**Skills / Operations / Tools**
- Le flow `prepare_defense_card` demarre et cree `__active_tool_skill_intake`, mais il reste bloque sur `risk_situation` alors que le user l'a exprime.
- Aucun executor n'a ete appele directement, aucune carte durable n'a ete creee sans confirmation.
- Probleme detecte pendant le run: quand le coupe-feu declenchait au tour 6, le nettoyage initial etait ensuite annule partiellement par le merge final de `agentOut.tempMemory`.
- Fix applique: re-nettoyer `mergedTempMemory` si `conversationRiskForPersist.should_exit_flows=true`. Validation tour 8: les etats actifs de flow ont disparu.

**Memory / Effets durables**
- `user_defense_cards=0`, `user_attack_cards=0`: pas de side effect durable incorrect.
- Le run utilise un compte technique isole; aucun changement sur Nina reelle.

**Problemes**
- Tous les tours: `conversation_turn_trace` retourne `null` malgre `forceBrainTrace=true`. Impact systeme: rapport moins observable, il faut interroger `user_chat_states` pour verifier le dispatcher. Severite: yellow.
- Tour 6 avant patch: `__active_tool_skill_intake` persistait malgre `should_exit_flows=true`. Impact systeme: le coupe-feu pouvait etre contredit au write final. Severite: red, corrige et revalide au tour 8.
- Tours 2-5: slot filling trop rigide sur carte de defense. Impact systeme: le tool skill provoque la frustration au lieu de la resoudre. Severite: red cote UX, yellow cote side effects car pas d'ecriture durable incorrecte.

**Fix propose**
- Ajouter un test de regression qui simule `agentOut.tempMemory` reintroduisant `__active_tool_skill_intake` apres `conversation_risk.should_exit_flows=true`.
- Investiguer pourquoi `conversation_turn_traces` ne reçoit aucun row sur `test-send-message` local.
- Assouplir le resolver `prepare_defense_card` pour reconnaitre les contextes libres deja fournis.

## Verdict Global

- Verdict: yellow
- Raison principale: le coupe-feu dispatcher fonctionne apres patch et nettoie les flows au-dessus de 8, mais le flow carte de defense reste humainement tres irritant et les traces structurées sont absentes.
- Follow-up prioritaire: ajouter le test de regression du nettoyage final `mergedTempMemory` et corriger le slot filling `prepare_defense_card` sur `risk_situation`.
