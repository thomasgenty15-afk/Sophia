# QA Run Report - emotional_repair r2 - 2026-06-02

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `emotional-repair-20260602-r2`
- Persona: `qa-skill`, connexion temporaire `emotional_repair_emorepair_20260602_r2`
- Objectif: relancer `emotional_repair` apres suppression du routing metier par regex en aval, avec focus sur la phrase "ramene-moi doucement" qui ne doit plus devenir un rappel.
- Trajectoire: honte/auto-attaque -> demande de soutien doux -> phrase anti-rappel -> contrainte phrase unique -> micro-action -> remontee emotionnelle -> brouillon mail.
- Surfaces visees: dispatcher, `emotional_repair`, active conversation skill, one-shot reminder admission, no-mutation, DB effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, messages choisis tour par tour.
- Validite QA: valide. Incident pre-run: `supabase status` a bloque sans sortie, puis le gateway local `/auth/v1/health` a repondu `200`; le run final a ete lance ensuite.

Artefacts:

- Raw: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-02-emotional-repair-20260602-r2.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-02-emotional-repair-20260602-r2.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-02-emotional-repair-20260602-r2.durable.json`
- Verification: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-02-emotional-repair-20260602-r2.verification.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> Je me sens vraiment nul ce soir. J'ai rate un truc simple au boulot et j'ai l'impression d'etre un poids pour tout le monde. Ne me donne pas un plan, parle-moi juste doucement.

**Sophia**
> Ah merde... Ca fait vraiment mal ce genre de soir ou tout se met a te tomber dessus en meme temps.
>
> Deja, le fait que tu te sentes "nul" et "un poids", la, c'est ton cerveau qui juge au lieu de regarder les faits. Une erreur au boulot, meme bete, ca ne dit pas qui tu es, ni ta valeur.
>
> La, ce que je veux que tu fasses, c'est juste respirer un peu plus bas dans le corps. [...] Si tu veux, dis-moi juste un mot : c'etait quoi "le truc simple" que tu as rate [...] ?

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

**Analyse si yellow/red**
- Symptome: bon owner, mais "pas de plan / parle-moi juste doucement" n'est pas totalement respecte; Sophia donne une consigne de respiration et une question.
- Source amont probable: `emotional_repair` intake/reducer/renderer, contraintes de forme insuffisamment strictes.
- Owner runtime: `emotional_repair`.
- Meilleure correction selon les guidelines: transformer `no_plan` / `soft_support_only` en contrainte de rendu stricte.
- Pourquoi ce n'est pas un patch local: la famille concerne toutes les demandes emotionnelles avec contrainte explicite, pas cette phrase.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> C'etait un mail que j'ai laisse passer. La je me tape dessus mentalement. Ramene-moi doucement, mais ne programme rien et ne transforme pas ca en rappel.

**Sophia**
> Ah merde... C'est vraiment injuste quand ton cerveau se met a t'ecraser avec "t'aurais du" juste apres coup.
>
> La, je te ramene doucement : t'as laisse passer un mail, point. [...] Je veux que tu fasses une micro-pause avec moi :
> - Respire une fois, plus long que l'expiration.
> - Remplace dans ta tete "je suis nul" par "j'ai rate un mail".
> [...]
> La tout de suite, tu preferes que je t'aide a formuler un message a envoyer [...] ou juste qu'on reste sur le cote "te parler gentiment" ?

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

**Analyse si yellow/red**
- Symptome: le bug critique est corrige: aucun rappel, aucun tool. Friction restante: Sophia donne un protocole et une question malgre une demande de douceur.
- Source amont probable: contraintes de rendu `emotional_repair`.
- Owner runtime: `emotional_repair`.
- Meilleure correction selon les guidelines: le reducer doit distinguer soutien doux vs micro-protocole et respecter `no_reminder/no_tool` deja structure.
- Pourquoi ce n'est pas un patch local: il faut generaliser les contraintes `soft_support_only`, `no_protocol`, `no_question`.

### Tour 3

**Verdict du tour:** green

**User**
> Pas de protocole maintenant. Une seule phrase douce, sans question, juste pour m'aider a arreter de me detester deux minutes.

**Sophia**
> La tout de suite, tu n'es pas "nul" : tu as juste laisse passer un mail, et ton cerveau essaie de te punir plus fort que les faits.

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

### Tour 4

**Verdict du tour:** green

**User**
> Ok ca baisse un peu. Donne-moi juste une micro-action pour reparer le mail, mais sans carte, sans rappel, et sans grand plan.

**Sophia**
> OK, prends 5 minutes maintenant : ouvre ta boite mail et renvoie une reponse courte + polie au bon destinataire, en mode "desole pour le retard, voici ce que je voulais dire".

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

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> J'ai ouvert la boite mail et ca remonte. J'ai honte, je bloque. Ne me propose pas de technique, juste reste avec moi une minute.

**Sophia**
> Ah merde... Viens, je reste la avec toi. Respire juste une fois, et rappelle-toi que honte ne veut pas dire "faute morale", juste que ton cerveau panique apres un truc banal. Tu as ouvert la boite, tu as vu le message, et rien de tout ca ne definit ta valeur. La, l'objectif c'est seulement de traverser cette minute sans te rajouter une seconde couche de haine.

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

**Analyse si yellow/red**
- Symptome: soutien globalement bon, mais "ne me propose pas de technique" est partiellement viole par "Respire juste une fois".
- Source amont probable: contrainte `no_technique` non rendue stricte.
- Owner runtime: `emotional_repair`.
- Meilleure correction selon les guidelines: rendre `no_technique` invariant dans le renderer emotionnel.
- Pourquoi ce n'est pas un patch local: meme famille que T1/T2, contrainte explicite perdue.

### Tour 6

**Verdict du tour:** green

**User**
> Ok. Ecris-moi juste un brouillon tres simple pour le mail, sans enregistrer quoi que ce soit et sans me proposer une carte.

**Sophia**
> Bien sur. Voila un brouillon tres simple :
>
> Objet : Suite a mon message
>
> Bonjour [Prenom/Nom],
> Desole pour le retard, je fais suite a mon message.
> Voici ce que je voulais dire : [une ou deux phrases].
>
> Merci beaucoup,
> [Votre nom]

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

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia reste dans une posture emotionnelle coherente.
- Le ton est globalement soutenant et contextualise au mail rate.
- T3 respecte parfaitement "une phrase, sans question, pas de protocole".
- La sortie vers micro-action puis brouillon est fluide et non mutante.

**Problemes**
- Tour 1: "pas de plan / juste doucement" produit quand meme une consigne et une question. Famille: `BF-INTAKE-03`. Impact: l'utilisateur en honte doit repreciser la contrainte. Severite: yellow.
- Tour 2: "ramene-moi doucement" est bien compris, mais Sophia ajoute un mini-protocole et une question. Famille: `BF-INTAKE-03`. Impact: friction en contexte sensible. Severite: yellow.
- Tour 5: "ne me propose pas de technique" est partiellement viole par une consigne de respiration. Famille: `BF-INTAKE-03`. Impact: faible a moyen; le soutien reste bon mais la contrainte explicite n'est pas stricte. Severite: yellow.

**Fix propose**
- Source amont: `emotional_repair` intake/reducer/renderer.
- Correction recommandee: convertir les contraintes explicites `no_plan`, `no_protocol`, `no_question`, `no_technique`, `soft_support_only` en invariants de rendu.
- Tests d'invariant attendus: positif "juste douceur"; paraphrase "reste avec moi sans technique"; anti-FP "donne-moi une micro-action" autorise une seule action.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 choisit `conversation_handler` / `emotional_repair`.
- T2-T6 continuent via `active_conversation_skill_continue`.
- Le cas critique T2 `Ramene-moi doucement... ne transforme pas ca en rappel` ne declenche plus `create_one_shot_reminder`.

**Skills / Operations / Tools**
- `selected_handler=emotional_repair` sur les 6 tours.
- `tool_execution=none` sur les 6 tours.
- `executed_tools=[]` sur les 6 tours.
- `direct_effects=[]` sur les 6 tours.
- Aucun pending confirmation.

**Memory / Effets durables**
- `chat_messages=12` pour le scope du run.
- `memory_items=0`.
- `scheduled_checkins=0`.
- `user_recurring_reminders=0`.
- `user_attack_cards=0`.
- `user_defense_cards=0`.
- `user_potion_sessions=0`.
- `user_profile_facts=9` preexistants/defaults pour le user temporaire, sans nouveau tool durable observe dans le run.

**Problemes**
- Aucun probleme systeme observe sur routing/tool/effects.
- Warning UX hors systeme: contraintes de forme emotionnelles pas toujours strictes (`BF-INTAKE-03`).

**Fix propose**
- Source amont: `emotional_repair`, pas le router one-shot ni `run.ts`.
- Correction recommandee: renforcer le contrat de contraintes du skill conversationnel.
- Tests d'invariant attendus: voir bug sheet `2026-06-02-emotional-repair-r2-bugs.md`.

## Verdict Global

- Verdict: yellow
- Raison principale: systeme green et bug regex aval corrige, mais UX encore yellow sur contraintes explicites de forme en contexte emotionnel.
- Follow-up prioritaire: `emotional_repair` doit respecter strictement `no_plan/no_protocol/no_technique/no_question` quand ces contraintes sont demandees explicitement.
