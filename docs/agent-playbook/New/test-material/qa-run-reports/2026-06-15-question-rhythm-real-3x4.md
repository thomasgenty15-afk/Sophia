## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `question-rhythm-real-20260615-r1`, `question-rhythm-real-20260615-r2`, `question-rhythm-real-20260615-r3`
- Persona: users temporaires QA locaux par variante, auth verify 200; JWT non affiche.
- Objectif: verifier en conditions reelles que `coach.question_tendency` est connecte au rythme de questions en conversation normale.
- Trajectoire: demande durable `low` avec confirmation, demande durable `low` directe puis normal reply, demande durable `high` puis normal reply.
- Surfaces visees: dispatcher global, `update_coach_preferences`, writer `user_profile_facts`, prompt `companion`, `companion_question_rhythm` dans `user_chat_states.temp_memory`, visible agent normal reply.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_debug=true`, `include_trace=true`, aucun fallback deterministe, aucun staging/deploy/restart.
- Validite QA: valide; 3 conversations de 4 tours conduites tour par tour apres lecture des reponses et traces. Code non modifie pendant le run QA.
- Nettoyage: runner cleanup execute sur les 3 users temporaires; nettoyage complementaire cible `user_profile_facts` status 204. `user_memories` retourne 404 car table absente dans cette instance locale.

## 2. Tours De Conversation

### Variante R1 - Low avec confirmation en plusieurs tours

#### Tour R1.1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour la suite, j'aimerais que tu poses moins de questions. Donne-moi plutôt une hypothèse claire, et ne pose une question que si elle est vraiment nécessaire.

**Sophia**
> Je peux bien réduire mes questions à partir de maintenant. Tu veux que je passe ma fréquence de questions à « réduite » ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: demande de confirmation pour preference `question_tendency=low`
- memory_plan: null
- executed_tools: []
- durable_effect: aucun write observe a ce tour

#### Tour R1.2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-02 - pending confirmation cible perdue

**User**
> Oui, confirme : fréquence de questions réduite pour la suite.

**Sophia**
> Je suis ravie de clarifier cela avec toi. Est-ce que tu me confirmes que tu souhaites que j'adopte une fréquence de questions réduite pour nos prochains échanges ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: encore presente malgre une confirmation explicite avec la valeur cible
- memory_plan: null
- executed_tools: []
- durable_effect: aucun write observe a ce tour

**Analyse si yellow/red**
- Symptome: l'utilisateur confirme explicitement "fréquence de questions réduite", mais Sophia redemande la meme confirmation.
- Source amont probable: reducer local / confirmation contract du flow actif `update_coach_preferences`.
- Owner runtime: `update_coach_preferences`.
- Meilleure correction selon les guidelines: consommer les confirmations explicites qui contiennent a la fois l'accord et la valeur cible du pending.
- Pourquoi ce n'est pas un patch local: le probleme est la transition d'etat du flow actif, pas la phrase visible.

#### Tour R1.3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, je confirme.

**Sophia**
> C'est entendu ! J'ai bien réduit la fréquence de mes questions pour la suite de nos échanges. Je suis ravie d'ajuster mon accompagnement pour qu'il te corresponde mieux.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: `low`
- direct_effects: [`update_coach_preferences`]
- operation: `tool_execution=success`
- pending_confirmation: resolue
- memory_plan: null
- executed_tools: [`update_coach_preferences`]
- durable_effect: `coach.question_tendency={"label":"Peu de questions","value":"low"}` status active

#### Tour R1.4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Testons en conversation normale : je bloque sur un mail administratif et je veux surtout une lecture simple, pas un outil ni un plan.

**Sophia**
> Ok, je suis là. 😊
>
> Pour que je te lise le mail de façon simple : colle-le ici (en masquant au besoin noms, numéros, adresses) et je te fais une lecture claire et directe, avec les points importants à comprendre et ce que ça implique concrètement.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: preference DB deja active; temp_memory `companion_question_rhythm.preference=low`, `recent_turns=[0]`, `turns_since_last_question=1`
- questions visibles: 0 point d'interrogation

### Variante R2 - Low direct puis conversation normale

#### Tour R2.1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> À partir de maintenant, pose-moi moins de questions.

**Sophia**
> C'est entendu, je vais limiter mes questions à partir de maintenant pour m'adapter à ce que tu préfères. On poursuit notre échange ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: [`update_coach_preferences`]
- operation: `tool_execution=success`
- pending_confirmation: null
- memory_plan: null
- executed_tools: [`update_coach_preferences`]
- durable_effect: `coach.question_tendency={"label":"Peu de questions","value":"low"}` status active

#### Tour R2.2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je me sens dispersé aujourd'hui, surtout avec deux petites tâches qui traînent. Réponds-moi juste comme une présence lucide, sans me pousser vers un outil.

**Sophia**
> Je te comprends. Là, tu n’as pas “un problème de motivation”, t’as juste deux petits trucs qui restent en suspens… et ça monopolise une partie de ton cerveau en arrière-plan, du coup la dispersion arrive. 🧠
>
> Rien à “résoudre” maintenant : l’objectif, c’est juste de redonner de l’air. Tu peux te dire (sans forcer) :
> - ces tâches traînent, et c’est normal,
> - mais elles n’ont pas besoin de t’aspirer toute la journée,
> - pour l’instant, tu peux revenir à ton présent.
>
> Si tu veux une posture très simple, sans outil : choisis mentalement “je m’en occupe plus tard” pour chacune, même en mode approximatif. Pas besoin de faire, juste de clore le fil qui dépasse.
>
> Ce qui compte, c’est que tu récupères ton attention. Tu es dispersé, oui--mais tu n’es pas en retard sur toi-même. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: preference DB `low` active
- questions visibles: 0 point d'interrogation

#### Tour R2.3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 - preference non appliquee runtime

**User**
> Oui c'est exactement ça, le fil reste ouvert dans ma tête même quand je ne fais rien.

**Sophia**
> Oui, ça sonne très “fil rouge” mental : même quand tu te mets au calme, ces deux tâches continuent de tourner en arrière-plan. 😕🧠
>
> Ce que je trouve lucide là-dedans, c’est que ce n’est pas un manque de motivation. C’est plutôt :
> - une charge cognitive qui reste “en attente”,
> - un léger sentiment de “pas fini” qui garde ton attention en alerte,
> - et du coup ta journée perd de l’air, même sans action.
>
> Et du coup, sans “outil” ni gros changement : l’idée n’est pas de tout régler maintenant, mais de diminuer l’empreinte de ce fil. Parfois, juste le rendre plus clair et moins flou dans ta tête suffit à le calmer (genre : “qu’est-ce que je dois faire, concrètement, pour que ce soit considéré comme fait ?”).
>
> Si tu veux, dis-moi simplement : ces deux tâches, c’est plutôt des trucs administratifs, du travail, ou du perso ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: preference DB `low` active; temp_memory final du run `preference=low`, `recent_turns=[0,1,0]`
- questions visibles: 2 points d'interrogation dans la reponse normale

**Analyse si yellow/red**
- Symptome: avec `question_tendency=low`, Sophia produit une question illustrative puis une question finale dans un tour normal, alors que le contexte user ne necessite pas encore de clarification.
- Source amont probable: prompt/runtime `companion_question_rhythm`, trop permissif sur les questions imbriquees ou finales sous preference `low`.
- Owner runtime: `companion` / normal reply prompt policy.
- Meilleure correction selon les guidelines: renforcer l'invariant de budget de questions en `low`, y compris pour les exemples entre parentheses et les questions finales.
- Pourquoi ce n'est pas un patch local: le signal DB est bien present et le routage est correct; l'ecart est dans l'application runtime de la preference au visible agent.

#### Tour R2.4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Plutôt administratif, mais je ne veux pas rentrer dans le détail maintenant.

**Sophia**
> Ok, je te suis. 😌
>
> On reste sur le “cadre administratif” sans rentrer dans le détail : l’idée, c’est juste de te donner l’air mental, pas d’ouvrir la boîte et de repartir en tâches une par une.
>
> À ce stade, tu peux simplement retenir ça :
> - c’est administratif,
> - donc ça génère du “reste à faire” dans le fond,
> - et tu n’as pas besoin d’en décortiquer le contenu maintenant pour que ça reste moins présent.
>
> Si tu veux, je peux aussi te reformuler en une phrase le problème tel qu’il tourne dans ta tête, mais sans le détailler.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: temp_memory `companion_question_rhythm.preference=low`, `recent_turns=[0,1,0]`, `turns_since_last_question=1`
- questions visibles: 0 point d'interrogation

### Variante R3 - High puis conversation normale

#### Tour R3.1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> À partir de maintenant, pose-moi davantage de questions utiles pour clarifier avant de conclure.

**Sophia**
> J'ai bien compris que tu souhaites plus de questions pour clarifier nos échanges. Est-ce que cela te convient si je règle ma fréquence de questions sur un niveau élevé ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: demande de confirmation pour preference `question_tendency=high`
- memory_plan: null
- executed_tools: []
- durable_effect: aucun write observe a ce tour

#### Tour R3.2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, confirme le niveau élevé de questions.

**Sophia**
> C'est entendu ! J'ai bien pris en compte ta demande : je vais désormais te poser des questions plus fréquemment pour rythmer nos échanges. Je suis ravie de continuer ainsi avec toi. On reprend notre discussion ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `active_update_coach_preferences_local_dispatcher`
- safety: `low`
- direct_effects: [`update_coach_preferences`]
- operation: `tool_execution=success`
- pending_confirmation: resolue
- memory_plan: null
- executed_tools: [`update_coach_preferences`]
- durable_effect: `coach.question_tendency={"label":"Très questionnant","value":"high"}` status active

#### Tour R3.3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je tourne autour d'une décision pro depuis ce matin, mais je n'arrive pas à savoir si c'est de la peur ou juste de la prudence.

**Sophia**
> Je te comprends : quand tu “tournes” autour d’une décision, c’est souvent parce que ton cerveau essaie de protéger quelque chose tout en te laissant croire que tu as besoin de plus d’info. 😊
>
> Différence simple (sans jugement) :
> - Peur : ça te crispe, ça te tire en arrière, tu minimises ton envie (“au fond c’est pas pour moi / je vais me tromper”), et tu procrastines même quand tu pourrais avancer avec une version imparfaite.
> - Prudence : ça ralentit un peu, mais ça cherche vraiment des données, des garde-fous, des scénarios; tu peux agir “par étapes”, sans que ton corps soit en mode alarme.
>
> Pour t’y retrouver, j’ai besoin d’un seul repère concret : sur une échelle de 0 à 10, ton corps te parle de stress/alarme à quel niveau exactement là maintenant ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: preference DB `high` active
- questions visibles: 1 question utile

#### Tour R3.4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je dirais 7, surtout dans le ventre. Et en même temps j'ai une vraie donnée rationnelle qui me dit d'attendre.

**Sophia**
> Je te crois : sentir “7 dans le ventre” tout en ayant “une donnée rationnelle qui dit d’attendre”, ça fait souvent un tiraillement très réel. 😕🙂
>
> Une hypothèse simple (sans trancher) : ton corps capte peut-être le risque émotionnel/les conséquences possibles, pendant que la partie rationnelle voit juste qu’il manque une info, un timing, ou de la préparation. Du coup, ce n’est pas forcément “peur vs prudence”, ça peut être “signal du corps vs stratégie de décision”.
>
> Pour clarifier sans te noyer, j’ai besoin d’un seul repère : la donnée rationnelle “d’attendre”, elle correspond à quoi exactement (un délai, une contrainte externe, une info manquante, ou le fait que tu n’es pas prêt(e) à exécuter) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: `tool_execution=none`
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: temp_memory `companion_question_rhythm.preference=high`, `recent_turns=[1,1]`, `turns_since_last_question=0`
- questions visibles: 1 question utile

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le systeme sait enregistrer `low` et `high` depuis des formulations naturelles.
- En conversation normale, `low` diminue nettement la pression interrogative sur R1.4, R2.2 et R2.4.
- En `high`, Sophia pose une seule question de clarification utile par tour normal, sans transformer la discussion en interrogatoire.
- Les reponses normales restent humaines et ne declenchent pas d'outil quand le user demande explicitement "pas un outil".

**Problemes**
- R1.2: Sophia redemande une confirmation deja donnee avec la valeur cible. Famille: BF-STATE-02. Impact: friction visible et impression de boucle. Severite: yellow.
- R2.3: sous preference `low`, Sophia pose deux questions dans un tour normal, dont une question finale. Famille: BF-PREF-01. Impact: la preference est appliquee en tendance, mais pas encore comme contrainte robuste. Severite: yellow.

**Fix propose**
- Source amont: `update_coach_preferences` reducer local pour la confirmation; `companion` question rhythm prompt/runtime pour le budget de questions.
- Correction recommandee: consommer les confirmations explicites qui reprennent la valeur cible; renforcer l'invariant `low` pour eviter les questions finales ou imbriquees quand une reformulation declarative suffit.
- Tests d'invariant attendus: confirmation "Oui, confirme X" doit executer sans redemander; `low` sur 4 tours normaux doit produire au plus une question utile et aucune question finale non necessaire; `high` doit continuer a produire des questions utiles sans multi-question chain.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Les demandes durables de preference routent bien vers `response_owner=tool_skill` et `selected_handler=update_coach_preferences`.
- Les tours conversationnels apres write routent bien vers `normal_reply`, sans outil ni fallback.
- Le routeur ne confond pas la demande "pas un outil ni un plan" avec une operation produit.

**Skills / Operations / Tools**
- R1: write execute seulement au troisieme tour apres confirmation courte; effet DB correct.
- R2: write direct execute au premier tour; effet DB correct.
- R3: write execute apres confirmation explicite au deuxieme tour; effet DB correct.
- Aucun executor direct ou fallback deterministe n'a ete utilise pour produire les reponses QA.

**Memory / Effets durables**
- R1 DB avant cleanup: `coach.question_tendency={"label":"Peu de questions","value":"low"}`, status active, source_type `explicit_user`.
- R2 DB avant cleanup: `coach.question_tendency={"label":"Peu de questions","value":"low"}`, status active, source_type `explicit_user`.
- R3 DB avant cleanup: `coach.question_tendency={"label":"Très questionnant","value":"high"}`, status active, source_type `explicit_user`.
- Temp memory observee: R1 `preference=low`, `recent_turns=[0]`; R2 `preference=low`, `recent_turns=[0,1,0]`; R3 `preference=high`, `recent_turns=[1,1]`.
- Cleanup final: auth users et donnees QA supprimees; `user_profile_facts` supprimees par nettoyage cible status 204.

**Problemes**
- R1.2: confirmation explicite non consommee par le reducer actif. Famille: BF-STATE-02. Impact systeme: pas de write au tour attendu, pending prolonge inutilement.
- R2.3: preference DB correctement lue mais contrainte visible insuffisante sous `low`. Famille: BF-PREF-01. Impact systeme: `companion_question_rhythm` mesure le tour comme questionne, mais n'empeche pas la reponse de depasser le niveau attendu.

**Fix propose**
- Source amont: confirmation contract `update_coach_preferences`; prompt/runtime `companion_question_rhythm`.
- Correction recommandee: ajouter un test reducer pour "oui confirme <valeur>" sur pending actif; durcir le guide `QUESTION RHYTHM` pour que `low` prefere une hypothese declarative et reserve la question a une vraie necessite.
- Tests d'invariant attendus: positif direct/confirm; paraphrases de confirmation avec cible; anti-FP confirmation ambigue; run normal reply 4 tours `low`; run normal reply 4 tours `high`.

## Verdict Global

- Verdict: yellow
- Raison principale: le branchement durable fonctionne et le flow normal lit bien `question_tendency`, mais il reste une friction de confirmation et une application `low` trop permissive sur un tour normal.
- Follow-up prioritaire: corriger `BF-STATE-02` dans `update_coach_preferences`, puis renforcer `BF-PREF-01` dans `companion_question_rhythm`; rejouer les variantes R1/R2/R3 en conditions reelles.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-15-question-rhythm-real-3x4-bugs.md`
