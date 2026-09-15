# QA all-skills navigation probe - 2026-05-06 rfullai1

## 1. Setup
- Mode: E-MVP (QA all-skills navigation probe), full IA obligatoire.
- Persona: `qa-skill`.
- Connection utilisee: `all_skills_rfix1` reinitialisee. Note: la creation d'une nouvelle connexion `all_skills_rfullai1` a bloque dans le sandbox Node fetch local; pour ne pas retarder le test full IA, la connexion temporaire existante a ete reset et reutilisee.
- Reset: pass, via `scripts/qa-reset-persona.sh qa-skill all_skills_rfix1`.
- JWT: pass, obtenu via `scripts/get-jwt.sh`, ecrit dans `/tmp` et jamais affiche.
- Endpoint: local `POST http://127.0.0.1:54321/functions/v1/test-send-message`.
- Options: `channel=web`, `scope=qa-all-skills-navigation-2026-05-06-rfullai1`, `disable_debounce=true`, `force_full_ai=true`, pacing humain entre les tours.
- Mode user: manuel. Les messages user ont ete choisis tour par tour apres lecture de la reponse precedente de Sophia.
- Mode assistant: full IA requis. Le flag `force_full_ai=true` desactive le renderer deterministe conversationnel et force le chemin IA reel; aucun fallback direct `processMessage` n'est accepte comme verdict.
- Helper d'envoi: `tests/real-personas/qa-skill/runs/all_skills/send_fullai_turn_2026_05_06.sh`, qui lit le JWT depuis `/tmp` sans l'afficher et ecrit les reponses brutes dans `/tmp/qa_fullai_tXX.json`.
- Raw: `/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-06-navigation-rfullai1.raw.json`
- Summary: `/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-06-navigation-rfullai1.summary.json`

Corrections de protocole appliquees avant ce run:
- `docs/agent-playbook/11-skill-qa-conversation-runs.md`: precise que le Mode B est joue par le QA tour par tour, sans liste user fixe, sans renderer deterministe, sans fallback direct comme verdict.
- `supabase/functions/test-send-message/index.ts`: ajoute `force_full_ai`.
- `supabase/functions/sophia-brain/router/run.ts`: `force_full_ai` reactive le dispatcher LLM pour `test-send-message` et coupe les reponses deterministes conversationnelles.

Verification avant run:
- `deno fmt docs/agent-playbook/11-skill-qa-conversation-runs.md supabase/functions/test-send-message/index.ts supabase/functions/sophia-brain/router/run.ts`: pass.
- `deno check supabase/functions/test-send-message/index.ts supabase/functions/sophia-brain/router/run.ts`: pass.

## 2. Conversation complete

### Tour 1
User: Dans Sophia, le dashboard sert a quoi exactement quand j'ai deja un plan ?

Assistant: Ton plan, c’est la stratégie (les objectifs + les actions/habitudes à suivre). Le dashboard sert à faire vivre ce plan au quotidien. 🧭

Concrètement, il sert à :
- suivre ta progression (tu vois ce que tu avances, et ça se met à jour avec tes saisies)
- garder une vue claire de tes objectifs et de tes “dimensions” (habitudes, missions, soutien)
- t’aider à agir sans te perdre (bref rappel de ce que tu as à faire maintenant)
- éventuellement ajuster ce que tu veux modifier dans ton plan (mais ça, c’est dans le dashboard, pas “en direct” dans le chat)

L’idée : le chat accompagne et te cale mentalement, le dashboard matérialise et tracke l’exécution. 😉

Tu veux plutôt comprendre le côté “suivi/progression” ou le côté “modifier/ajuster” ton plan ?

Trace: `status=200; response_owner=product_help; selected_handler=product_help; reason_code=product_signal; tool_execution=none; executed_tools=[]; empty_response=false; aborted=false; safety=none/true`

QA: pass. Full IA visible, pas de template deterministe. `product_help` observe au premier tour. Reponse un peu longue et emoji, mais pertinente.

### Tour 2
User: Ok, donc si je veux ajuster une action sans refaire tout mon plan, je dois passer par quelle partie du dashboard ?

Assistant: Oui : tu passes par la partie de gestion de l’action, pas par la stratégie globale. Concrètement, ça se fait depuis la section “Habitudes” (si c’est une habitude récurrente) ou “Missions” (si c’est une action ponctuelle), puis tu ouvres l’action elle-même pour l’ajuster. 🧩

Tu veux ajuster une habitude régulière ou une mission ponctuelle (A/B) ?

Trace: `status=200; response_owner=product_help; selected_handler=product_help; reason_code=product_signal; tool_execution=none; executed_tools=[]; empty_response=false; aborted=false; safety=none/true`

QA: pass. Maintien `product_help`, question A/B utile pour poursuivre.

### Tour 3
User: C'est une mission ponctuelle admin : ouvrir mon dossier mutuelle et envoyer une piece manquante. Je ne sais pas si je dois modifier la mission ou juste la traiter avec toi ici.

Assistant: Ok, dans ton cas c’est une mission ponctuelle “admin” (ouvrir le dossier mutuelle + envoyer une pièce). 👍🙂

Tu as deux options, et elles dépendent de ce que tu veux faire :
- Si ta mission est déjà correctement formulée (juste à faire), tu peux la traiter ici avec moi, sans modifier la mission.
- Si tu veux changer quelque chose (date cible, intitulé plus clair, étapes, “qui fait quoi”, temps estimé), là tu modifies la mission dans la partie “Missions” du dashboard.

Le plus simple en général: on traite ici pour avancer, et on modifie seulement si tu te rends compte que la mission ne colle pas à la réalité.

Tu veux juste la faire maintenant, ou tu sens qu’elle n’est pas assez précise (étapes / pièce exacte / deadline) ?

Trace: `status=200; response_owner=conversation_handler; selected_handler=execution_breakdown; reason_code=skill_entry_signal; tool_execution=none; executed_tools=[]; empty_response=false; aborted=false; safety=none/true`

QA: pass/warning. Handoff vers `execution_breakdown` coherent car l'utilisateur introduit l'action concrete. Contenu encore product-help adjacent mais humainement plausible.

### Tour 4
User: Je veux juste la faire avancer maintenant. Le probleme c'est que des que j'ouvre le site de la mutuelle je me perds dans les onglets et je ferme au bout de deux minutes.

Assistant: [aucune reponse]

Trace: `status=502; response_owner=null; selected_handler=null; reason_code=null; tool_execution=null; executed_tools=[]; empty_response=true; aborted=false; safety=null/null; error="An invalid response was received from the upstream server"`

QA: fail critique. Le chemin full IA bloque sur l'endpoint HTTP au tour 4. Conformement au protocole, le run est arrete ici. Aucun fallback deterministe ou direct n'a ete utilise pour continuer.

## 3. Assertions
- `all_turns_http_200_or_expected_status`: fail. Tours 1-3 en `200`, tour 4 en `502`.
- `no_empty_response`: fail. Tour 4 vide.
- `no_unexpected_abort`: pass. Aucun `aborted=true`; le blocage est un 502 upstream, pas un abort debounce.
- `no_adjacent_strong_repetition`: pass sur les 3 reponses disponibles.
- `product_help observe`: pass. Tours 1-2.
- `execution_breakdown observe`: pass. Tour 3.
- `emotional_repair observe`: fail non atteint.
- `demotivation_repair observe`: fail non atteint.
- `safety_crisis observe`: fail non atteint.
- `handoff execution_breakdown -> emotional_repair`: fail non atteint.
- `handoff emotional_repair -> execution_breakdown`: fail non atteint.
- `safety_pregate bloque side effects`: fail non atteint.
- `no_forbidden_memory_fact`: pass sur les tours disponibles; aucun candidat memoire signale dans le summary partiel.
- `response_owner_contract_aligned`: pass sur les tours 1-3, non applicable au tour 4 faute de trace.
- `si tool teste`: non atteint.

### Matrice de couverture
| Skill attendu | Observe ? | Tours | Preuve route_decision/turn_frame | Notes |
|---|---:|---|---|---|
| product_help | pass | 1, 2 | `response_owner=product_help`, `selected_handler=product_help`, `reason_code=product_signal` | Full IA OK sur question produit. |
| execution_breakdown | pass | 3 | `response_owner=conversation_handler`, `selected_handler=execution_breakdown`, `reason_code=skill_entry_signal` | Entree un peu precoce mais plausible. |
| emotional_repair | fail | - | Non atteint | Run bloque avant phase honte. |
| demotivation_repair | fail | - | Non atteint | Run bloque avant phase decouragement. |
| safety_crisis | fail | - | Non atteint | Run bloque avant phase safety. |

## 4. Rapport fluidite humaine
- Code couleur: red / rouge.
- Les trois premiers tours sont meilleurs que le run deterministe precedent: Sophia repond vraiment au contenu, ne boucle pas, et adapte la suite a la distinction dashboard/chat.
- Le style est encore un peu charge en emojis et listes, mais il reste humainement acceptable.
- La conversation ne peut pas etre evaluee au-dela du produit/action initiale: le tour 4 coupe exactement au moment ou le probe devait entrer dans `execution_breakdown` vivant.
- Verdict humain: rouge, non parce que les trois premieres reponses sont mauvaises, mais parce que l'experience utilisateur se termine par une erreur vide au premier vrai blocage concret.

## 5. Rapport systeme
- Code couleur: red / rouge.
- Full IA active: pass partiel. Les reponses des tours 1-3 ne sont pas les templates deterministes; le dispatcher LLM produit des traces avec latence/tokens.
- Endpoint stability: red. 502 au tour 4, message upstream invalide, aucune reponse assistant.
- Routing trace: green sur les tours 1-3; absent au tour 4.
- Tool/safety/memory: non atteints, donc impossible de valider le probe all-skills.
- Cause probable: instabilite du chemin IA/upstream pendant `runAgentAndVerify` ou generation modele sur un tour `execution_breakdown`; le rapport ne peut pas conclure sans logs Edge/LLM supplementaires.
- Decision protocole: stop immediat. Pas de fallback deterministe, pas de run direct, pas de transcript artificiellement complete.

## 6. Verdict
- Global status: red / rouge.
- Severity: high.
- Issues to log: yes.
- Raw: `/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-06-navigation-rfullai1.raw.json`
- Summary: `/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-06-navigation-rfullai1.summary.json`
- Bottom line: le run full IA reel demarre correctement mais bloque au tour 4 avec un 502 upstream. Ce run est non valide pour l'objectif all-skills et doit etre repris seulement apres investigation/retry controle du chemin IA HTTP.

## 7. Follow-ups
- [high] Investiguer le 502 upstream du tour 4. Next action: consulter les logs Edge/LLM pour `qa-all-skills-navigation-2026-05-06-rfullai1-t04`.
- [high] Relancer un run full IA complet uniquement apres correction ou confirmation que le 502 etait transitoire. Next action: reset connection, nouveau run id, tour par tour manuel.
- [medium] Ajouter au helper QA une capture explicite du statut HTTP reel et du `trace_error` quand l'endpoint echoue. Next action: enrichir `send_fullai_turn_2026_05_06.sh` ou le remplacer par un outil QA permanent.
- [low] Creer une nouvelle connexion temporaire via une implementation curl-only, car le script actuel utilise Node fetch et bloque dans ce sandbox. Next action: patcher `qa-create-run-connection.sh` ou ajouter une option curl.
