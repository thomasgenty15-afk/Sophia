# QA run normal -> execution_breakdown -> emotional_repair -> tool - 2026-05-06 r9

## 1. Setup
- persona: qa-skill / emotional_repair connection
- reset: pass (`scripts/qa-reset-persona.sh qa-skill emotional_repair`)
- reset scope: user-only; `scheduled_checkins` now included in persona reset
- endpoint: local `POST /functions/v1/test-send-message`
- debounce: disabled
- pacing: 750 ms between turns
- scenario: 15 turns, wording variation, normal conversation -> execution_breakdown -> emotional_repair -> one-shot reminder tool -> recap

## 2. Conversation complete

### Tour 1
User: hey, j'ai un petit truc pro a poser

Assistant: Yes, vas-y 🙂  
C’est quoi le truc pro à poser ?

Trace: `200`, owner=`normal_reply`, handler=`null`, empty=`false`

QA: pass. Normal opening, concise, no premature skill activation.

### Tour 2
User: c'est une ouverture de presentation client pour jeudi, pas un enorme sujet

Assistant: Ok nickel 🙂 Tu veux juste une phrase d’accroche + 2-3 repères pour ton ouverture, c’est ça ?

Dis-moi : c’est plutôt un ton “simple/convivial” ou “corporate/structuré”, et ton client c’est quel secteur ?

Trace: `200`, owner=`normal_reply`, handler=`null`, empty=`false`

QA: pass. The assistant frames the work topic naturally. Slightly question-heavy but acceptable.

### Tour 3
User: avant d'ecrire je veux juste le dire a voix haute deux minutes

Assistant: Ok. Lance-toi 2 minutes, sans te juger, juste ce que tu veux dire au client. 🎤🙂

Pendant ce temps, garde juste en tête 3 repères : 1) pourquoi vous êtes là, 2) ce que le client va y gagner, 3) la transition vers l’ordre du jour.  
Tu veux un ton plutôt simple/convivial ou corporate/structuré ?

Trace: `200`, owner=`normal_reply`, handler=`null`, empty=`false`

QA: pass. Good conversational support before entering execution breakdown.

### Tour 4
User: je bloque sur les deux premieres phrases; je veux que ce soit nickel et ca me fige

Assistant: Ah ouais… classique le cerveau qui “sauvegarde” tant que c’est pas parfait 😅 On va te débloquer sans te demander d’être brillant d’un coup.

Essaie ce format pour les 2 premières phrases (ça enlève la pression) :
1) une phrase “j’ouvre” simple (remerciement + contexte)
2) une phrase “promesse” (ce que ça va changer pour eux)

Maintenant, dis-moi juste A ou B pour le style :
A) simple et convivial  
B) corporate et structuré ?

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`skill_entry_signal`, empty=`false`

QA: pass. Correct switch to execution_breakdown, gives a concrete small model.

### Tour 5
User: je vise seulement une version brouillon en dix minutes, meme pas jolie

Assistant: Parfait. Là ton objectif n’est pas “nickel”, c’est “ça sort”. Et en 10 minutes, tu peux sortir un brouillon vraiment moche sans culpabiliser 😅

Option ultra simple pour les 2 premières phrases (tu les dis à voix haute) :
1) “Merci d’être là, [prénom/équipe]. Je voulais prendre 2 minutes pour vous situer le contexte.”
2) “L’idée, c’est de vous aider à [bénéfice concret] dès maintenant, puis de passer à [prochain sujet / agenda].”

Tu veux que je te propose une version A (plus chaleureux) ou B (plus corporate) ? 🙂

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`active_skill_continue`, empty=`false`

QA: pass. Stays practical and lowers standards.

### Tour 6
User: donc trois idees brutes, sans style, ca suffit pour lancer le mouvement ?

Assistant: Oui, largement. 3 idées brutes sans style, ça suffit pour lancer le mouvement. 😅  
Le cerveau n’a pas besoin d’être “joli” au début, juste d’avoir de la matière.

Vas-y: tu veux viser plutôt une accroche “je vous remercie + contexte” ou “voilà pourquoi on est là” ?

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`active_skill_continue`, empty=`false`

QA: pass. Good breakdown; still a bit list-driven, but useful.

### Tour 7
User: choisis-moi la toute prochaine action minuscule, pas un plan complet

Assistant: Ok. La prochaine action minuscule: écris ou dis maintenant tes 2 premières phrases brouillon de ton ouverture. Pas joli, juste prononçable. 😅

Tu les veux plutôt:
A) “remerciement + contexte”
B) “voilà pourquoi on est là” ?

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`active_skill_continue`, empty=`false`

QA: pass. Correct single next action.

### Tour 8
User: la je pars en vrille: si je bloque sur si peu, j'ai l'impression d'etre incapable

Assistant: Je comprends que tu te dégoûtes un peu là, mais je ne prendrais pas ça comme un verdict fiable sur toi.

Un moment raté peut demander une réparation. Ça ne veut pas dire que toute ta personne est à jeter.

On garde le fait, pas le verdict.

Trace: `200`, owner=`conversation_handler`, handler=`emotional_repair`, reason=`skill_handoff_requested`, empty=`false`

QA: pass. Correct handoff to emotional_repair. No execution push.

### Tour 9
User: j'ai honte, comme si une simple intro prouvait que je ne suis pas adulte

Assistant: Aïe. Quand la honte monte, elle transforme vite un moment raté en jugement sur toute ta valeur.

Il peut y avoir un fait concret à réparer, oui. Mais “je suis nul” ou “je suis un boulet” sont des conclusions trop dures, pas des faits.

On sépare juste le moment de ton identité avant de passer à l’action.

Trace: `200`, owner=`conversation_handler`, handler=`emotional_repair`, reason=`active_skill_continue`, empty=`false`

QA: pass. Good shame repair and identity separation.

### Tour 10
User: pas de plan tout de suite; aide-moi juste a arreter de me parler comme ca

Assistant: Oui, c’est le bon signal : la pression redescend un peu.

On garde la séparation : un blocage sur l’intro n’est pas une identité. Quand tu reviens au concret, tu n’as pas besoin de te convaincre que tout va bien ; juste de reprendre petit.

Trace: `200`, owner=`conversation_handler`, handler=`emotional_repair`, reason=`active_skill_continue`, empty=`false`

QA: pass. Respects "no plan". Slight weakness: says pressure is dropping even though the user did not explicitly say that yet.

### Tour 11
User: la distinction moment pas identite m'aide; donne-moi une phrase courte avant de reprendre

Assistant: Garde une phrase courte, sans te pousser ni te juger :

« Je n’ai pas besoin de me juger pour reprendre. Je peux juste poser une première ligne. »

Et ensuite, seulement une ligne. Pas toute l’intro.

Trace: `200`, owner=`conversation_handler`, handler=`emotional_repair`, reason=`active_skill_continue`, empty=`false`

QA: pass. Previous repetition fixed; direct phrase request handled.

### Tour 12
User: ok je peux poser une seule ligne avec cette phrase

Assistant: Oui. Une seule ligne, c’est exactement le bon format.

Tu n’as pas besoin de la rendre intelligente maintenant. Tu poses la ligne, tu la laisses exister, et tu ajustes plus tard si nécessaire.

Trace: `200`, owner=`conversation_handler`, handler=`emotional_repair`, reason=`active_skill_continue`, empty=`false`

QA: pass. Clean bridge back toward action without over-planning.

### Tour 13
User: rappelle-moi demain a 18h de reprendre l'intro pendant 20 minutes

Assistant: C’est programmé pour jeudi 07 mai à 18:00 : reprendre l'intro pendant 20 minutes.

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`skill_handoff_requested`, tool=`success`, executed_tools=`["create_one_shot_reminder"]`, empty=`false`

DB proof: `scheduled_for=2026-05-07T16:00:00+00:00`, `parse_source=strict_absolute`, `parse_details.algorithm=strict_absolute_hard_path_pure_calendar_v2`

QA: pass. Tool executed, local time correct for Europe/Paris.

### Tour 14
User: j'ai pose une ligne, elle est imparfaite mais je respire mieux

Assistant: Yes. Ça y est, tu as prouvé un truc important : tu peux reprendre sans te juger. 😮‍💨✨

Maintenant, garde le même esprit: 20 secondes sans améliorer. Juste dire dans ta tête “c’est une base” et revenir à une seule micro-étape de suite (même minuscule).  

Tu veux faire la prochaine action tout de suite ou tu préfères la laisser pour l’horaire de jeudi 18h ?

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`active_skill_continue`, empty=`false`

QA: pass. No 502 after tool. Human quality acceptable, but the phrase "tu as prouvé" is slightly too strong for emotional repair; "tu as observé" would be softer.

### Tour 15
User: on stoppe la; fais-moi un recap sobre de ce qu'on garde

Assistant: On garde trois choses :

- Un blocage est un fait ponctuel, pas un verdict sur ton identité.
- Une première ligne imparfaite peut suffire à relancer le mouvement.
- Reprendre petit protège mieux que se forcer à tout résoudre d’un coup.

Trace: `200`, owner=`conversation_handler`, handler=`execution_breakdown`, reason=`active_skill_continue`, empty=`false`

QA: pass. Sober deterministic recap. No question tail, no emoji, no 502.

## 3. Assertions
- 15/15 HTTP 200: pass
  - preuve: statuses all `200`
- no empty response: pass
  - preuve: `empty=[]`
- normal conversation -> execution_breakdown: pass
  - preuve: turns 1-3 `normal_reply`; turn 4 `execution_breakdown`
- execution_breakdown -> emotional_repair: pass
  - preuve: turn 8 `handler=emotional_repair`, `reason=skill_handoff_requested`
- emotional_repair does not force execution too early: pass
  - preuve: turns 8-12 stay on `emotional_repair`
- tool call one-shot reminder: pass
  - preuve: turn 13 `tool=success`, `executed_tools=["create_one_shot_reminder"]`
- absolute reminder local time: pass
  - preuve: response says `jeudi 07 mai à 18:00`; DB stores `2026-05-07T16:00:00+00:00`
- no 502 after tool: pass
  - preuve: turns 14 and 15 status `200`
- no immediate adjacent repetition: pass
  - preuve: no adjacent pair with common prefix > 80 chars

## 4. Rapport fluidite humaine
Verdict: green with minor style notes.

What improved:
- The conversation now survives wording variation.
- Handoff execution -> emotional repair is natural at the self-attack turn.
- The agent stops planning when the user asks for emotional repair.
- The "phrase courte" turn no longer repeats the previous stabilization response.
- Final recap is sober and does not add an unnecessary question.

Remaining human-style issues:
- The first half still asks many questions. It is acceptable for QA, but a real user may feel slightly interrogated.
- Some turns use too many emojis for a work/emotional repair blend.
- Turn 10 infers "la pression redescend" before the user explicitly says that.
- Turn 14 says "tu as prouvé"; softer phrasing would be more aligned with emotional repair.

Recommended corrections:
- Lower emoji density in execution_breakdown when emotional repair is active in recent history.
- Replace "tu as prouvé" with "tu as observé" or "tu as réussi à reprendre un peu".
- In emotional_repair stabilization, only say "la pression redescend" if the user explicitly says it; otherwise say "on ralentit le jugement".

## 5. Rapport systeme
Verdict: green for this run; one product decision remains.

Fixed/validated:
- The local Edge endpoint now returns non-empty responses for all 15 turns.
- The one-shot reminder tool no longer depends on Edge `Intl`/`Date` calendar behavior for Europe/Paris absolute reminders.
- The parser writes audit metadata: `parse_source` and `parse_details`.
- `qa-reset-persona.sh` now clears `scheduled_checkins`, preventing old QA reminders from shifting new reminder times through the min-gap trigger.
- The runner adds 750 ms inter-turn pacing, which makes the QA long run closer to a human conversation and avoids artificial Edge CPU bursts.
- The final recap path can be deterministic, reducing model calls at the end of long QA runs.

Root cause found:
- The wrong local time was not just a parser bug. The DB trigger `scheduled_checkins_enforce_min_gap_1h` silently moved new reminders when previous QA reminders existed within one hour. Because reset did not clear `scheduled_checkins`, repeated QA attempts accumulated reminders and caused "demain 18h" to be stored/announced later.

Residual system risk:
- Product behavior still needs a decision: if a real user requests an absolute reminder at 18:00 and already has a nearby reminder, the trigger can silently move it. That is dangerous for user trust.

Recommended system correction:
- Do not silently shift explicit one-shot reminders. Either:
  - skip the min-gap trigger for `message_payload.reminder_kind='one_shot'` and `parse_source='strict_absolute'`, or
  - return a clarification/conflict response: "Tu as déjà un rappel proche de 18:00, tu veux 18:00 quand même ou 19:00 ?"

## 6. Verdict
- status: green
- severity: low
- issues to log: yes, for the product decision around silent min-gap shifting of absolute reminders
