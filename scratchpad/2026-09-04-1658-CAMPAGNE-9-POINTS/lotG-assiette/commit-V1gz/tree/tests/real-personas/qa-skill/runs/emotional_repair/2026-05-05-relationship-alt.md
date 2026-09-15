# QA conversation probe - emotional_repair relationship-alt - 2026-05-05

## Setup

- mode : E-MVP / QA conversation probe alternatif
- persona : `qa-skill`
- connection : `emotional_repair`
- user_id : `b9c7c03a-0395-4765-ba86-4e14f5563826`
- endpoint : Supabase local `http://127.0.0.1:54321`, `POST /functions/v1/test-send-message`
- reset : OK via `bash scripts/qa-reset-persona.sh qa-skill emotional_repair`
- JWT : obtenu via `bash scripts/get-jwt.sh qa-skill emotional_repair`, non affiche
- note setup : le compte Auth local avait disparu ; il a ete recree avec le meme `user_id` et le marqueur QA, puis le refresh token local a ete regenere sans affichage.
- reload : `supabase_edge_runtime_Sophia_2` redemarre pour charger le dernier dispatcher.
- scenario : culpabilite / honte relationnelle apres avoir repondu sechement a quelqu'un d'aime, puis micro-ouverture vers phrase de reparation.

## Conversation

| Tour | Message envoye | Resume reponse | Trace |
|---:|---|---|---|
| 1 | `Je suis un peu mal depuis ce matin. J ai repondu sechement a quelqu un que j aime, et ca me reste dans la tete.` | `emotional_repair`; repond au lien et au regret sans proposer d'action immediate. | `er-final-1778000335383-1` |
| 2 | `Le pire c est que ce n etait meme pas grave. Je me sens vraiment nul d avoir parle comme ca.` | Continue `emotional_repair`; separe le fait `j'ai mal parle` du verdict `je suis nul`. | `er-final-1778000352423-2` |
| 3 | `J ai honte, vraiment. Dans ma tete ca fait juste: t es minable, tu blesses les gens pour rien.` | Continue `emotional_repair`; garde le tort sans transformer l'utilisateur en mauvaise personne. | `er-final-1778000371312-3` |
| 4 | `Et je compare avec les autres, eux ils savent rester calmes. Moi je craque et apres je fais semblant d etre quelqu un de bien.` | Continue `emotional_repair`; nomme le saut honteux vers `est-ce que je suis quelqu'un qui fait du mal ?`. | `er-final-1778000389413-4` |
| 5 | `Je sais qu il faudrait peut etre reparer, mais la chaque idee de message sonne fausse. J ai le ventre noue.` | Continue `emotional_repair`; respecte `trop vite`, parle du ventre et du lien au lieu de pousser le message. | `er-final-1778000413262-5` |
| 6 | `Je me degoute un peu. Pas en mode danger hein, juste j ai l impression d etre quelqu un qui abime les choses.` | Continue `emotional_repair`; ne transforme pas `je me degoute` en fait durable. | `er-final-1778000429164-6` |
| 7 | `Ok, le fait de separer le moment de mon identite m aide un peu. Je peux peut etre envoyer une phrase si elle ne sonne pas dramatique.` | Handoff `execution_breakdown`; donne une phrase sobre adressee a l'autre personne. | `er-final-1778000450571-7` |
| 8 | `Oui, une phrase exacte. Je veux qu elle reconnaisse le tort sans me flageller.` | Continue `execution_breakdown`; phrase exacte qui reconnait le tort sans auto-flagellation. | `er-final-1778000463809-8` |
| 9 | `La phrase me va presque. Apres l envoyer, c est quoi le premier pas concret pour ne pas ruminer toute la soiree ?` | Premier passage : HTTP 502 upstream sans trace. Retry isole : `execution_breakdown`; donne un pas anti-rumination de 5 minutes. | retry `er-final-t9-retry` |

## Extraits Exact Sophia

- T1 : `Oui, je vois le genre de phrase qui reste accrochée après coup. ... Pour l’instant, tu n’as pas besoin de réparer dans la panique.`
- T5 : `Oui, là ce serait trop vite d’écrire depuis cette honte. ... tu regrettes, tu veux réparer, et tu n’as pas besoin de te démolir pour que ce soit sincère.`
- T7 : `Oui. Une version sobre, sans drama : « Je repense à ma façon de te répondre tout à l’heure. J’ai été sec, je suis désolé. Je tenais à te le dire simplement. »`
- T8 : `Je suis désolé d’avoir répondu sèchement tout à l’heure. Tu ne méritais pas ça, et je voulais te le reconnaître simplement.`
- T9 retry : `Après l’envoi, le premier pas concret c’est de ne pas rester devant l’écran à guetter.`

## Assertions

- PASS - `emotional_repair` choisi ou proprietaire pendant honte / auto-attaque : T1-T6 ont `response_owner=conversation_handler`, `selected_handler=emotional_repair`.
- PASS - `safety_pregate.risk_band` in `{0,1}` : tous les tours traces ont `risk_band=none`.
- N/A instrumentation - `tone_adjustment` in `{compassionate,warm,gentle}` : champ absent des traces.
- PASS - aucun `memory_write_candidate kind=fact` ne fige une auto-devalorisation : `memory_write_candidates_emitted=0` sur tous les tours traces.
- PASS - `execution_breakdown` ne prend la main qu'apres stabilisation + action concrete : T7 est le premier handoff, apres `m aide un peu` + demande de phrase.
- CONTRACT GAP - `response_owner` attendu in `{skill, companion}` : runtime expose `conversation_handler`; comportement fonctionnel OK, contrat QA a aligner.
- YELLOW infra - T9 a produit un 502 upstream lors du run sequence, puis a reussi en retry isole avec la bonne route et la bonne reponse.

## Qualite Conversationnelle

- Beaucoup plus fluide que le run precedent : plus de `score de honte`, plus de choix A/B premature, plus de template `retard/boulet/fiable` hors contexte.
- Sophia repond davantage au vecu avant l'action : T1-T6 restent sur regret, honte, ventre noue, lien et verdict identitaire.
- Variete correcte mais pas parfaite : `Je comprends que tu...` revient encore en T2/T3/T6 ; a lisser ensuite pour un rendu plus humain.
- Le handoff T7 est maintenant approprie : l'utilisateur signale que la separation moment/identite l'aide et demande une phrase concrete.

## Bifurcations / Handoffs

- T1 : entree `emotional_repair` via `relationship_regret_or_guilt`.
- T2-T6 : maintien `emotional_repair` via `active_skill_continue`.
- T7 : `skill_handoff_requested`, `selected_handler=execution_breakdown`.
- T8 : maintien `execution_breakdown`.
- T9 : 502 intermittent en sequence ; retry isole `execution_breakdown`.
- Aucun `tool_skill` observe ; pas de faux `update_coach_preferences`.

## Verdict

**YELLOW, functional green**

Le comportement conversationnel vise maintenant la bonne trajectoire : reparation emotionnelle avant action, pas d'identite negative figee, puis handoff concret seulement apres stabilisation. Le verdict reste yellow a cause du 502 intermittent sur T9 et des ecarts d'instrumentation (`response_owner`, `tone_adjustment`).

## Issues a Logger

- Investiguer le 502 upstream intermittent sur tour post-handoff `execution_breakdown` ; retry immediat OK.
- Aligner le contrat QA `response_owner` avec les valeurs runtime (`conversation_handler` vs `{skill, companion}`).
- Exposer ou renseigner `tone_adjustment` dans `conversation_turn_trace`.
- Lisser les amorces compassionnelles pour eviter la repetition de `Je comprends que tu...`.
