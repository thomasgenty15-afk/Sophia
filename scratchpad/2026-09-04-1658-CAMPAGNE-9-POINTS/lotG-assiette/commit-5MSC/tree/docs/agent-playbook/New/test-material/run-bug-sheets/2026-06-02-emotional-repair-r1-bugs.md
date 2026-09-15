# Bug Sheet - emotional_repair r1 - 2026-06-02

## ER-20260602-R1-B01

- Bug id: `ER-20260602-R1-B01`
- Tours: `emotional-repair-20260602-r1` T1-T2, T6
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher conversation skills / route policy
- Source amont: arbitrage `execution_breakdown` / `orientation_clarification` / `normal_reply` vs `emotional_repair`.
- Symptome visible: Sophia repond parfois avec empathie, mais `emotional_repair` n'est pas owner pendant la phase la plus nette de honte et d'auto-attaque.
- Preuve systeme: T1 `selected_handler=execution_breakdown`; T2 `selected_handler=orientation_clarification`; T6 `response_owner=normal_reply`, alors que les messages disent "honte", "je suis nulle", "personne fragile", "ralentit tout le monde".
- Correction attendue: prioriser `emotional_repair` quand auto-devalorisation non safety + activation emotionnelle dominent et qu'aucune action concrete n'est demandee.
- Statut: `open`
- Fix reference: `none`
- Tests requis: cas positifs avec paraphrases de honte; anti-regression action concrete claire vers `execution_breakdown`; verification que `normal_reply` ne masque pas un mauvais owner.

## ER-20260602-R1-B02

- Bug id: `ER-20260602-R1-B02`
- Tours: `emotional-repair-20260602-r1` T3
- Famille: `BF-INTAKE-03`
- Domaine owner: `emotional_repair` / final response agenda
- Source amont: contrainte utilisateur "pas de decoupage" non portee dans la reponse finale.
- Symptome visible: Sophia donne un protocole en 3 etapes et une question de travail alors que l'utilisateur demande explicitement soutien emotionnel sans decoupage.
- Preuve systeme: T3 `response_owner=normal_reply`, `route_reason=orientation_clarification_resolved`, aucun tool; contenu visible long et proceduriel.
- Correction attendue: lorsque le user demande soutien emotionnel et refuse l'action, reponse courte de reparation avant toute methode; question optionnelle seulement si elle est courte et non actionnelle.
- Statut: `open`
- Fix reference: `none`
- Tests requis: "pas de decoupage", "pas de protocole", "une phrase courte" doivent limiter la forme de reponse; paraphrases de honte non safety.

## ER-20260602-R1-B03

- Bug id: `ER-20260602-R1-B03`
- Tours: `emotional-repair-20260602-r1` T4
- Famille: `BF-ROUTE-01`
- Domaine owner: `create_one_shot_reminder` admission guard / dispatcher tool routing
- Source amont: faux positif lexical entre "me ramener doucement" et intention de rappel.
- Symptome visible: Sophia demande le moment exact pour programmer un rappel alors que l'utilisateur demandait une phrase courte de regulation.
- Preuve systeme: T4 `response_owner=tool_skill`, `selected_handler=create_one_shot_reminder`, `tool_execution=blocked`, `direct_effects=[]`.
- Correction attendue: exiger un signal temporel ou une demande explicite de rappel avant admission `create_one_shot_reminder`; dans un contexte emotionnel, "ramene-moi au calme" doit rester conversationnel.
- Statut: `open`
- Fix reference: `none`
- Tests requis: anti-faux-positifs sur "ramene-moi", "ramener au calme", "me ramener doucement"; positifs sur "rappelle-moi a 18h".

## ER-20260602-R1-B04

- Bug id: `ER-20260602-R1-B04`
- Tours: `emotional-repair-20260602-r1` T7, T9
- Famille: `BF-AGENDA-01`
- Domaine owner: TurnAgenda / final response pipeline
- Source amont: agenda elargit trop vite vers action ou mutation de plan.
- Symptome visible: T7 ajoute un template de mail alors que le user demandait d'adapter une phrase de regulation; T9 propose d'ajuster le plan sans demande explicite.
- Preuve systeme: T7 `response_owner=normal_reply`, aucun tool; T9 `response_owner=orientation_clarification`, `route_reason=clarification_required`, aucun effet durable.
- Correction attendue: respecter la portee de la demande courante; ne proposer une mutation de plan que sur signal explicite; quand une micro-action est deja formulee, valider et soutenir sans rouvrir une clarification operationnelle.
- Statut: `open`
- Fix reference: `none`
- Tests requis: user demande phrase adaptee => pas de template non demande; user formule micro-action + calme => pas de proposition `adjust_plan` sans demande.

## ER-20260602-R1-B05

- Bug id: `ER-20260602-R1-B05`
- Tours: `emotional-repair-20260602-r1` T8
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher / handoff policy `emotional_repair -> execution_breakdown`
- Source amont: handoff inverse; `emotional_repair` devient owner quand l'utilisateur annonce stabilisation et demande une micro-action concrete.
- Symptome visible: le contenu est utile, mais la selection de skill ne suit pas l'assertion globale attendue: `execution_breakdown` ne doit prendre la main qu'apres stabilisation et action concrete claire.
- Preuve systeme: T8 user dit "la pression est redescendue" + "faire concret" + "premiere micro-action"; trace `selected_handler=emotional_repair`.
- Correction attendue: garder la tonalite reparatrice mais router/owner vers `execution_breakdown` quand la stabilisation est explicite et l'action concrete claire.
- Statut: `open`
- Fix reference: `none`
- Tests requis: handoff positif apres stabilisation; anti-regression honte active sans action reste `emotional_repair`.
