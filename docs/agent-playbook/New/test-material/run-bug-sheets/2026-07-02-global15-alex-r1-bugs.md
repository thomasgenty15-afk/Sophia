# Bug Sheet — Global 15 — Alex — R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-global15-alex-r1.md`

## R1-B01

- Bug id: R1-B01
- Tours: 12, 14
- Famille: BF-ROUTE-03 (product/status/tool mal priorisé) + BF-LEDGER-01 (claim sans commit)
- Domaine owner: dispatcher / tool arbitration (one-shot vs recurring), `create_recurring_reminder_tool_skill`, EffectLedger / final response guard
- Source amont: arbitration qui décide entre le tool always-on `create_one_shot_reminder` et le `create_recurring_reminder_tool_skill` — ne détecte pas les marqueurs de cardinalité récurrente explicites ("tous les soirs")
- Symptome visible: user demande "tu pourrais pas me relancer tous les soirs vers 21h30" ; Sophia répond "Oui, c'est prévu tous les soirs vers 21h30" ; en réalité un seul `scheduled_checkins` (occurrence de ce soir uniquement) est créé, `user_recurring_reminders` reste à 0. Le recap du Tour 14 est fidèle à la DB réelle mais ne signale pas l'écart avec la promesse.
- Preuve systeme: `executed_tools=["create_one_shot_reminder"]` sur le Tour 12 ; `effect_ledger.counts.committed=1` ; requête DB post-tour : `scheduled_checkins` = 1 nouvelle ligne (`112ef6d8-2c2a-4610-9f72-cb88a5b1f7e8`, occurrence unique) ; `select count(*) from user_recurring_reminders where user_id=...` = 0.
- Correction attendue (révisée): `create_recurring_reminder_tool_skill` n'existe pas dans sophia-brain — le chemin produit d'un soutien récurrent depuis le chat est **initiatives** (feature_opportunity), conformément à la doctrine existante (« Un message tous les vendredis avant l'apéro pourrait m'aider » → initiatives). Une demande de relance récurrente ne doit donc jamais émettre `create_one_shot_reminder` : elle route vers feature_opportunity/initiatives.
- Statut: fix_applied (rerun requis)
- Fix reference: doctrine dispatcher (`dispatcher.prompts.ts`) — signal positif initiatives « relance-moi tous les soirs » + exemple doctrinal reprenant le message du T12 (0 direct effect, feature_opportunity détecté) ; bloc canonique one-shot global et local (`router/one_shot_reminder_prompt_contract.ts`) : demande récurrente sous toute forme ⇒ jamais create_one_shot_reminder, c'est initiatives ; sans commit one-shot, le claim « tous les soirs » disparaît mécaniquement (aucun contexte de confirmation fourni au renderer). Tests : `dispatcher_prompt_contract_test.ts` (« routes recurring reminder requests to initiatives »).
- Tests requis: test contractuel "marqueur de récurrence explicite → jamais `create_one_shot_reminder` seul" ; test d'intégration "réponse formulant une récurrence ⇒ `user_recurring_reminders` committé dans le même tour" ; rerun QA ciblé post-fix sur une demande de rappel récurrent avec Alex ou qa-skill.

## R1-B02

- Bug id: R1-B02
- Tours: 7, 8
- Famille: a classifier (répétition mécanique de contexte hors-sujet)
- Domaine owner: assembleur de réponse finale / pipeline de composition de contexte pour `coaching_recommendation`
- Source amont: un fragment de rappel déjà confirmé (Tours 5-6) est réinjecté verbatim en préambule de deux tours consécutifs à contenu émotionnel, sans lien avec le sujet du tour
- Symptome visible: "Je te relancerai ce soir à 22h30 pour la ligne du carnet." apparaît identique en tête des réponses aux Tours 7 et 8, alors que le user parle de découragement puis de honte de lui-même.
- Preuve systeme: comparaison textuelle directe des deux réponses (transcript ci-dessus, Tours 7 et 8).
- Correction attendue: conditionner l'inclusion d'un effet déjà confirmé à une pertinence explicite du tour courant (nouvel effet créé, ou user qui en parle), pas à sa simple présence en contexte court.
- Statut: fix_applied (rerun requis)
- Fix reference: cause identifiée — à HEAD, le bloc canonique visible ordonnait « confirme le rappel » sans condition alors que le contexte de confirmation persiste 5 tours (fenêtre ledger) ; la restriction « confirmation active uniquement le tour du commit » est dans le working tree (fix BF-LEDGER-02), durcie ici : ligne anti-préambule dans la branche fenêtre-ledger (`router/one_shot_reminder_prompt_contract.ts` — « n'ouvre jamais ta réponse par ce rappel ») + exception de `COACHING_VISIBLE_GLOBAL_RULES` resserrée (tour du commit uniquement, sinon seulement si le user en parle). Test « ledger-window branch forbids opening the reply with the committed reminder ».
- Tests requis: test de non-répétition d'un fragment de réponse identique sur 2 tours consécutifs sans rapport thématique avec le tour courant.

## R1-B03

- Bug id: R1-B03
- Tours: 8
- Famille: a classifier (accord grammatical de genre incorrect / personnalisation profil non appliquée)
- Domaine owner: génération de phrase courte d'apaisement dans `coaching_recommendation`
- Source amont: le profil user connu (genre) n'est pas injecté comme contrainte dans le prompt de génération de la phrase courte
- Symptome visible: phrase générée "Je suis fatiguée de lutter, mais je ne repars pas de zéro." accordée au féminin pour Alex, un persona homme (`persona.md` : "Alex est un homme de 27 ans").
- Preuve systeme: contenu de la réponse au Tour 8 (transcript ci-dessus), comparé à `tests/real-personas/alex/persona.md`.
- Correction attendue: injecter le genre/profil connu du user dans le prompt de génération de ces phrases courtes personnelles, ou neutraliser grammaticalement la formulation par défaut si le genre n'est pas fiable.
- Statut: fix_applied (rerun requis)
- Fix reference: constat — `profiles.full_name/birth_date/gender` n'étaient lus nulle part dans sophia-brain. Nouveau pack identité `context/user_identity.ts` (prénom/âge/genre) chargé une fois par tour (`router/run.ts`) et exposé aux visible agents des 5 skills conversationnels via `visible_runtime_context.user_identity`, avec doctrine canonique : accords genrés uniquement si `gender` connu, sinon formulation neutre (y compris phrases 1ère personne à répéter) ; prénom avec parcimonie ; âge jamais mentionné. Tests `context/user_identity_test.ts`.
- Tests requis: test de cohérence grammaticale de genre sur un échantillon de personas homme/femme pour les phrases générées par `coaching_recommendation`.
