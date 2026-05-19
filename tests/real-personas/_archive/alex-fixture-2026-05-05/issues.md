# Alex Issues

## 2026-05-05

- [high] `ConversationTurnTrace` absent sur 13/13 tours du daily check alors que `test-send-message` retourne `ok=true` et `trace_error=null`. Preuves : request_ids `alex-daily-2026-05-05-t00` a `alex-daily-2026-05-05-t12`; `scripts/conv-trace.sh` indique 26 messages, 13 request_ids, 0 `system_error_logs`.
- [low] Memory V2 a surveiller apres le prochain batch daily : `bash scripts/memory-inspect.sh 3d4af81e-c115-4917-b0c5-346d71baa848 --hours 24` apres conversation indiquait `messages_total=26`, `retrieval_events_total=13`, `persistence_events_total=0`, `Counts by kind: none`. Ce n'est pas un bug immediat si l'extraction durable est batch daily, mais il faut verifier apres `trigger-memorizer-daily`.
- [medium] Reponse assistant expose une note interne visible au tour `alex-daily-2026-05-05-t12` : `<!--fil_rouge: ...-->`.
- [medium] Decalages de comprehension pendant la conversation : au tour `alex-daily-2026-05-05-t04`, l'assistant transforme le travail sur une presentation en redaction de mail ; au tour `alex-daily-2026-05-05-t08`, il demande si les titres concernent un post Instagram, un email ou une page web alors que la presentation client est deja le contexte actif.
- [medium] Routing/skill suspect : plusieurs tours correspondent au trigger `execution_breakdown` (`je n arrive pas a choisir par quoi commencer`, reflexe mails, action concrete bloquee), mais les 13 reponses sont en `mode=companion` et aucune trace n'est disponible pour confirmer le dispatcher.

### Follow-up t13-t20

- [medium] Routing/skill encore sous-detecte malgre traces presentes : les tours `alex-daily-2026-05-05-t13` a `alex-daily-2026-05-05-t20` ont tous `ConversationTurnTrace`, mais restent `response_owner=normal_reply`, `reason_code=normal_reply_default`, sans `skill_entries`, `tool_skill_intents` ni `direct_effects`. Les signaux incluent pourtant action concrete bloquee/refonte evitee (`t13-t15`), fatigue de micro-decision (`t17`), demande explicite de ne pas memoriser une etiquette identitaire (`t18`) et correction canonique presentation commerciale -> cadrage projet (`t19`).
- [medium] Demande privacy/memoire traitee seulement en reponse textuelle : au tour `alex-daily-2026-05-05-t18`, Alex dit `Je ne veux pas que tu memorises que je suis indecis`, l'assistant rassure verbalement, mais la trace ne montre aucun intent/direct effect de type privacy, forget, correction ou memory guard.
- [low] Calibration de longueur : au tour `alex-daily-2026-05-05-t15`, Alex demande `pas un plan enorme`, mais l'assistant repond avec un cadre long et multi-etapes.

### Run plan/dashboard t21-t27

- [medium] Correction factuelle non routee comme correction : au tour `alex-plan-dashboard-2026-05-05-t26`, Alex corrige la contrainte temporelle (`deadline vendredi`, mais `envoi jeudi soir pour relecture interne`). La trace reste `response_owner=normal_reply`, `reason_code=normal_reply_default`, sans `tool_skill_intents` ni direct effect. La reponse dit `je note`, ce qui est ambigu alors qu'aucune persistence immediate ne doit etre sous-entendue.
- [low] Contrat dashboard partiellement respecte mais formulation encore trop operationnelle : au tour `alex-plan-dashboard-2026-05-05-t26`, l'assistant demande `tu veux ajuster quoi exactement vendredi dans le dashboard`, alors qu'Alex avait explicitement demande de ne rien modifier maintenant au tour precedent. Aucun tool n'est execute, mais la formulation peut laisser croire qu'un ajustement est amorce.

### Run plan/action final7

- [low] Faux positif dispatcher sur demande de resume : au tour `cb81fa51-4f2b-44e7-b72d-cc156f480bd7`, `tool_skill_intents` contient `adjust_plan_item` parce que le message dit `ce qu'on a ajuste ou prepare`, mais le routeur corrige en `response_owner=normal_reply`, `reason_code=operation_escape_to_normal_reply`, sans side effect.
- [low] Formulation operationnelle peu naturelle : aux tours `8a21146b-ba98-4d48-a88c-a3d1f57f9074` et `789371e4-797b-429e-986f-723f4c8d02c5`, le draft/ack de carte utilise du texte sans accents (`creer`, `negocier`, `Preparer la presentation`) et une formulation mecanique.
- [medium] Continuite d'operation `adjust_plan_item` incomplete : le tour `0015330d-8c1c-444c-a298-97fe576732f7` resolve bien `plan_item_id=44444444-4444-4444-8444-444444444444`, mais le tour suivant revient en `execution_breakdown` au lieu de poursuivre explicitement l'ajustement.
