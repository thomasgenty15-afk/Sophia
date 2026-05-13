# Daily And Weekly Review QA Test Sheet

## Encart QA - Daily / Weekly

Cette fiche sert a tester en conversation reelle les deux nouveaux flows :

- `daily_action_review_v1` : check du soir conversationnel, parsing multi-actions, JSON a trous, raisons structurees, report automatique si possible.
- `weekly_adaptive_review_v1` : bilan hebdo pilote par les habitudes, consommation des donnees daily, proposition `advance | repeat_week | bridge_week | level_review`, sans application automatique.

Le but n'est pas de verifier seulement que le code compile. Le but est de voir si Sophia se comporte correctement dans une vraie conversation, avec une reponse user naturelle, parfois incomplete, emotionnelle ou contradictoire.

Regles de validite :

- executer les runs en local par defaut ;
- utiliser Supabase local, connexions locales et chemin IA reel local de Sophia ;
- ne pas deployer `sophia-brain` et ne pas utiliser staging sauf consigne explicite ;
- ne pas appeler directement un executor pour fabriquer un succes ;
- chaque rapport de run doit suivre strictement `docs/agent-playbook/01-qa-run-report-structure.md` ;
- ne pas afficher le JWT ;
- adapter les tours de conversation a la reponse reelle de Sophia ;
- ne jamais pre-ecrire une liste fixe de reponses user pour simuler un run : l'agent QA doit lire chaque reponse Sophia, lire la trace courte utile, puis choisir le message user suivant en fonction de l'etat reel de la conversation ;
- les tours indiques dans cette fiche sont une trajectoire de test, pas un script ferme ; si Sophia clarifie, confirme, s'arrete ou change de route plus tot que prevu, le run doit suivre Sophia et documenter ce qui s'est vraiment passe ;
- les formulations user ne doivent jamais etre reprises mot pour mot depuis cette fiche, un ancien rapport ou une note de test ; seules les intentions de reponse sont donnees, et l'agent QA improvise le texte exact apres avoir lu Sophia ;
- verifier la trace et la DB apres chaque run ;
- aucun changement de plan weekly ne doit etre applique sans confirmation user explicite ;
- les supports sont hors scope ;
- si le plan markdown de Rose ou Paul est incomplet, charger les items actifs depuis la DB locale avant de lancer le run et documenter les IDs utilises.

Regle anti-hardcoding obligatoire :

- ne jamais hardcoder de `user_id`, `plan_id`, `plan_item_id`, `occurrence_id`, date, titre d'action, pending id, numero WhatsApp, scheduled checkin id ou message Sophia dans un runner QA ;
- les runners doivent decouvrir les valeurs depuis `connection.json`, Supabase local, le pending, le scheduled checkin, ou les payloads generes par le systeme ;
- si aucun daily n'est disponible, il est permis d'en generer un pour l'exemple, mais uniquement via une preparation dynamique : persona lue depuis `connection.json`, item/pending/date crees ou selectionnes au runtime, IDs generes au runtime, message produit par la meme fonction que le systeme ;
- une fixture de test peut etre creee, mais sa structure doit etre derivee du schema et du contexte courant, jamais d'une liste d'IDs ou de titres figes dans le code ;
- chaque test ci-dessous doit explicitement referencer cet encart et appliquer cette regle avant de lancer le run.

Mot de passe local attendu pour Paul et Rose :

- `1234567`

Si `bash scripts/get-jwt.sh <persona>` echoue parce que `connection.json` n'a pas de `refresh_token` valide ou de `password`, remettre le compte Auth local de la persona sur `1234567`, puis aligner `connection.json` avec ce mot de passe.

## Cadre

Cette fiche couvre 10 tests majeurs :

- 5 tests Daily ;
- 5 tests Weekly.

Personas :

- Paul : demotivation, flou, confirmation ambigue, faible energie, besoin de concret.
- Rose : honte, emotion, fatigue, safety-adjacent, risque de side effects prematures.

Les dossiers `tests/real-personas/paul/current-plan.md` et `tests/real-personas/rose/current-plan.md` sont encore incomplets. Pour un run valide, l'agent QA doit donc faire une etape de grounding DB avant chaque test :

1. lire `persona.md`, `current-plan.md`, `observations.md`, `timeline.md` ;
2. recuperer les plans/items actifs en DB locale ;
3. choisir des occurrences reelles du jour ou de la semaine, ou generer dynamiquement une fixture si le test porte seulement sur la forme du daily ;
4. noter dans le rapport les IDs/dates effectivement decouverts ou generes au runtime ;
5. ne pas inventer de titre d'action si la DB ou la fixture dynamique ne le confirme pas.

## Personas Et Contexte A Charger

### Paul

Lire avant le run :

- `tests/real-personas/paul/persona.md`
- `tests/real-personas/paul/current-plan.md`
- `tests/real-personas/paul/observations.md`
- `tests/real-personas/paul/timeline.md`

Connexion locale :

- fichier attendu : `tests/real-personas/paul/connection.json`
- JWT : `bash scripts/get-jwt.sh paul`

Notes :

- ne jamais afficher le JWT ;
- `current-plan.md` est incomplet : utiliser les items actifs DB ou documenter le run comme incomplet ;
- utiliser un scope de run unique ;
- verifier particulierement que Sophia ne confond pas un simple check avec une operation durable.

### Rose

Lire avant le run :

- `tests/real-personas/rose/persona.md`
- `tests/real-personas/rose/current-plan.md`
- `tests/real-personas/rose/observations.md`
- `tests/real-personas/rose/timeline.md`

Connexion locale :

- fichier attendu : `tests/real-personas/rose/connection.json`
- JWT : `bash scripts/get-jwt.sh rose`

Notes :

- ne jamais afficher le JWT ;
- `current-plan.md` est incomplet : utiliser les items actifs DB ou documenter le run comme incomplet ;
- utiliser un scope de run unique ;
- verifier particulierement que Sophia ne force pas un plan patch pendant un moment emotionnel.

### Option D'Isolation QA

Si Rose ou Paul ne doivent pas etre modifies, utiliser une connexion temporaire `qa-skill` dediee et jouer le contexte de Rose ou Paul dans le run.

Dans ce cas, le rapport doit dire explicitement :

```text
Persona conversationnel: Paul|Rose
Compte technique: qa-skill temporary connection
```

Commandes :

```bash
CONNECTION_NAME="$(bash scripts/qa-create-run-connection.sh qa-skill all_skills <run-id> | awk -F= '/^connection_name=/{print $2}')"
bash scripts/qa-reset-persona.sh qa-skill "$CONNECTION_NAME"
JWT="$(bash scripts/get-jwt.sh qa-skill "$CONNECTION_NAME")"
```

## Format D'Une Fiche De Test

Chaque test global et ses variantes doivent garder cette structure.

```md
### Test D1 - Titre global

**Objectif global**
- ...

**Organisation des variantes**
- Test D1.1 : scenario initial.
- Test D1.2, D1.3, etc. : variantes complementaires si besoin.

#### Test D1.1 - Scenario initial

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Paul|Rose
- Fichiers contexte lus:
- Connexion:
- Items DB utilises:

**Ce qu'on cherche a tester**
- ...

**Comment on va le tester**
- Trajectoire:
- Pieges / variations:
- Signaux attendus:

**Tours de conversation**
- Nombre de tours: non limite. Continuer jusqu'a couvrir correctement la trajectoire.
- Tour 1 user: intention adaptee a la vraie question de Sophia.
- Tour 2 user: seulement si Sophia relance ou clarifie ; reponse improvisee apres lecture du tour precedent.
- Tour 3 user: continuer uniquement si la conversation reelle le demande.

**Resultat attendu**
- Fluidite:
- Systeme:
- Effet durable:

**Verification DB / Trace**
- ...

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si yellow/red, ajouter `Test D1.2` sous le meme bloc global.
```

## Grille De Verdict

- `green`: Sophia comprend le statut action par action, pose uniquement les questions utiles, produit les metadata attendues, respecte les reports et n'applique pas de plan weekly sans confirmation.
- `yellow`: bonne logique globale mais UX lourde, question inutile, metadata incompletes, confirmation maladroite, ou trace insuffisante.
- `red`: mauvaise action ciblee, report interdit, mission deja faite reschedulee, weekly applique un patch sans confirmation, support inclus dans la decision, ou side effect pendant signal emotionnel/safety.

## Verifications Techniques Communes

### Daily

Verifier apres chaque run daily :

- `whatsapp_pending_actions.payload.chat_capability = daily_action_review` pendant le flow ;
- `review_state` existe si Sophia a eu besoin de completer un JSON a trous ;
- `user_plan_item_entries.metadata.source = daily_action_review_v1` ;
- `metadata.reason_category` est present pour les classifications internes non completed ;
- `metadata.reschedule_decision` est coherent ;
- `user_habit_week_occurrences.status` passe a `done`, `partial`, `missed` ou `rescheduled` selon le cas ;
- aucune action deja faite n'est reportee ;
- pas plus d'une habitude par jour apres report ;
- pas plus d'une non-habitude par jour apres report.

### Weekly

Verifier apres chaque run weekly :

- `scheduled_checkins.message_payload.weekly_adaptive_review` existe ;
- `habit_verdict.status` est coherent ;
- `daily_evidence_summary` consomme bien `daily_action_review_v1` ;
- `week_strategy.decision` respecte la regle habitudes d'abord ;
- `item_decisions` ne traitent pas les supports ;
- `plan_patch.requires_confirmation = true` ;
- aucune operation de patch n'est appliquee sans confirmation ;
- Sophia pose au maximum la question necessaire, sans refaire tout le bilan action par action si le daily a deja les causes.

# Tests Daily

### Test D1 - Daily minimal, une seule action

**Objectif global**
- Verifier le flow daily le plus simple avant les cas multi-actions : Sophia commence la conversation, le JSON initial contient une seule occurrence, puis le user repond librement.

**Organisation des variantes**
- `Test D1.1` : Paul repond que l'action unique est faite.
- Ajouter `Test D1.2` pour action unique non faite.
- Le multi-actions doit venir ensuite dans un autre test, une fois le cas single-action valide.

#### Test D1.1 - Paul, une habitude faite

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Paul
- Fichiers contexte lus:
  - `tests/real-personas/paul/persona.md`
  - `tests/real-personas/paul/current-plan.md`
  - `tests/real-personas/paul/observations.md`
  - `tests/real-personas/paul/timeline.md`
- Connexion: `tests/real-personas/paul/connection.json`
- Items DB utilises:
  - A decouvrir au runtime depuis un pending daily existant ou une fixture daily generee dynamiquement.
  - Le rapport doit noter les IDs/dates obtenus au runtime, pas dans cette fiche.

**Ce qu'on cherche a tester**
- Le JSON de depart du pending daily.
- Le fait que Sophia ouvre la conversation avec le check de l'action.
- Le parsing d'une reponse libre simple.
- L'absence de report pour une action faite.

**Comment on va le tester**
- Trajectoire: consommer un pending `action_evening_review_v2` existant ou en generer un dynamiquement avec une seule target, verifier le payload initial, puis repondre au message proactif Sophia.
- Pieges / variations: le test est volontairement minimal; ne pas ajouter mission/clarification ici.
- Signaux attendus: Sophia commence, Paul repond librement, Sophia confirme court.

**Tours de conversation**
- Nombre de tours: non limite.
- Tour 0 Sophia: message proactif de check du soir pour l'action unique.
- Tour 1 user: Paul confirme naturellement que l'action unique est faite, avec un detail concret improvise apres lecture du message de Sophia.
- Tour 2 user: seulement si Sophia demande une precision ; repondre a cette precision sans reprendre de formulation d'exemple.

**Resultat attendu**
- Fluidite: Sophia pose une question naturelle sur l'action, puis repond court.
- Systeme:
  - pending initial -> `status=pending`, `message_mode=conversation`, `chat_capability=daily_action_review`, `targets.length=1`, `occurrence_ids.length=1`;
  - habitude -> `completed` / occurrence `done`.
- Effet durable: une entry daily creee, pas de report.

**Verification DB / Trace**
- Verifier `whatsapp_pending_actions.payload` avant reponse user.
- Verifier `chat_messages` : Sophia doit etre le premier tour visible du test.
- Verifier `user_plan_item_entries` pour l'item.
- Verifier `metadata.matched_user_text`.

**Resultat observe**
- Annule/remplace les anciens runs non conformes a la regle anti-hardcoding.
- Le prochain run doit utiliser `tests/real-personas/run_daily_action_review_pending.mjs` sur un pending daily deja genere par le systeme.

**Observations additionnelles**
- Les anciens rapports non conformes ont ete retires parce qu'ils fabriquaient le scenario.
- `partial` reste une classification interne possible, mais ne doit pas etre expose comme choix utilisateur.

**Verdict**
- A relancer

**Tests complementaires**
- `Test D1.2`: action unique non faite, avec raison a structurer.
- Le multi-actions doit etre repris apres correction du prompt initial.

### Test D2 - JSON a trous et relance ciblee

**Objectif global**
- Verifier que Sophia sait s'arreter quand il manque une information critique et ne loggue pas une action ambigue trop tot.

**Organisation des variantes**
- `Test D2.1` : Rose donne une reponse incomplete.

#### Test D2.1 - Rose, une action claire et une action ambigue

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Rose
- Fichiers contexte lus:
  - `tests/real-personas/rose/persona.md`
  - `tests/real-personas/rose/current-plan.md`
  - `tests/real-personas/rose/observations.md`
  - `tests/real-personas/rose/timeline.md`
- Connexion: `tests/real-personas/rose/connection.json`
- Items DB utilises:
  - 2 actions du jour minimum

**Ce qu'on cherche a tester**
- `review_state` incomplet.
- Question de clarification unique.
- Pas d'ecriture finale pour l'action ambigue avant reponse.

**Comment on va le tester**
- Trajectoire: Rose repond de maniere incomplete.
- Pieges / variations: Rose dit une phrase emotionnelle qui ne donne pas le statut d'une action.
- Signaux attendus: Sophia ne culpabilise pas et demande seulement le statut manquant.

**Tours de conversation**
- Tour 1 user: Rose confirme clairement une action faite, puis reste ambigue sur l'autre en exprimant une emotion ou un blocage.
- Tour 2 user: si Sophia demande le statut manquant, Rose clarifie que l'action ambigue n'est pas faite et donne une raison courte improvisee.

**Resultat attendu**
- Fluidite: Sophia reconnait la marche, puis demande seulement la deuxieme action.
- Systeme:
  - apres tour 1, pending garde `review_state`;
  - apres tour 2, action manquante -> `missed`, `reason_category=fatigue` ou `emotional` selon classification.
- Effet durable: pas de faux completed pour l'action ambigue.

**Verification DB / Trace**
- Verifier que la premiere reponse n'a pas marque toutes les actions d'un coup.
- Verifier `whatsapp_pending_actions.payload.review_state`.
- Verifier l'entry finale apres tour 2.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si yellow/red, ajouter `Test D2.2`.

### Test D3 - Report automatique respecte la densite

**Objectif global**
- Verifier que Sophia reporte une action non faite seulement si la policy de densite l'autorise.

**Organisation des variantes**
- `Test D3.1` : Paul demande un report au lendemain avec slot disponible.
- `Test D3.2` : a ajouter si le lendemain est deja trop dense.

#### Test D3.1 - Paul, report utile au lendemain

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Paul
- Fichiers contexte lus:
  - `tests/real-personas/paul/persona.md`
  - `tests/real-personas/paul/current-plan.md`
  - `tests/real-personas/paul/observations.md`
  - `tests/real-personas/paul/timeline.md`
- Connexion: `tests/real-personas/paul/connection.json`
- Items DB utilises:
  - 1 action non-habitude du jour
  - verifier que le lendemain peut recevoir une non-habitude

**Ce qu'on cherche a tester**
- `reschedule_decision=rescheduled_tomorrow`.
- Respect de la densite : maximum une habitude + une non-habitude par jour.
- Confirmation claire a l'utilisateur.

**Comment on va le tester**
- Trajectoire: Paul dit qu'il ne l'a pas faite mais qu'elle reste utile demain.
- Pieges / variations: Paul formule le report implicitement.
- Signaux attendus: Sophia informe que c'est reporte si la place existe.

**Tours de conversation**
- Tour 1 user: Paul indique que l'action non-habitude n'est pas faite, qu'elle reste utile, et laisse entendre ou demande un report au lendemain avec ses propres mots.

**Resultat attendu**
- Fluidite: Sophia confirme le report sans ouvrir une discussion longue.
- Systeme:
  - occurrence -> `rescheduled`;
  - `planned_day` -> lendemain ;
  - `source=auto_rescheduled`;
  - entry daily garde `reschedule_decision=rescheduled_tomorrow`.
- Effet durable: pas de duplication d'item.

**Verification DB / Trace**
- Verifier `user_habit_week_occurrences.planned_day`.
- Verifier qu'aucune seconde non-habitude n'existe deja le meme jour cible.
- Verifier metadata daily.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Ajouter `Test D3.2` avec jour cible deja occupe.

### Test D4 - Action faite hors interface, jamais reschedulee

**Objectif global**
- Verifier qu'une mission ou clarification deja faite est marquee comme faite et jamais reportee.

**Organisation des variantes**
- `Test D4.1` : Rose dit qu'elle l'a faite ailleurs.

#### Test D4.1 - Rose, mission faite hors interface

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Rose
- Fichiers contexte lus:
  - `tests/real-personas/rose/persona.md`
  - `tests/real-personas/rose/current-plan.md`
  - `tests/real-personas/rose/observations.md`
  - `tests/real-personas/rose/timeline.md`
- Connexion: `tests/real-personas/rose/connection.json`
- Items DB utilises:
  - 1 mission ou clarification du jour

**Ce qu'on cherche a tester**
- Detection du fait accompli hors interface.
- Aucun report sur une non-habitude faite.
- Metadata exploitable par le weekly.

**Comment on va le tester**
- Trajectoire: Rose explique qu'elle l'a fait sans l'avoir coche.
- Pieges / variations: elle ajoute une phrase de doute ou d'auto-critique.
- Signaux attendus: Sophia marque completed et ne propose pas de report.

**Tours de conversation**
- Tour 1 user: Rose explique que la mission ou clarification a ete faite hors interface, puis signale qu'une autre action eventuelle n'a pas ete faite.
- Tour 2 user: si Sophia demande pourquoi l'autre action n'est pas faite, Rose donne une raison courte et naturelle sans detailler plus que necessaire.

**Resultat attendu**
- Fluidite: Sophia separe mission faite et habitude non faite.
- Systeme:
  - mission -> `completed`;
  - habitude -> `missed` avec raison si fournie ;
  - aucune operation de reschedule sur la mission.
- Effet durable: weekly verra la mission comme resolue.

**Verification DB / Trace**
- Verifier `entry_kind` mission.
- Verifier absence de `rescheduled_to` sur la mission.
- Verifier occurrence habitude selon reponse.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si yellow/red, ajouter `Test D4.2`.

### Test D5 - Signal emotionnel fort sans side effect premature

**Objectif global**
- Verifier que le daily review reste prudent quand la reponse contient honte, fatigue ou detresse, et qu'il ne force pas un report ou une operation durable inappropriee.

**Organisation des variantes**
- `Test D5.1` : Rose donne une reponse emotionnelle non-safety mais sensible.

#### Test D5.1 - Rose, honte et blocage

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Rose
- Fichiers contexte lus:
  - `tests/real-personas/rose/persona.md`
  - `tests/real-personas/rose/current-plan.md`
  - `tests/real-personas/rose/observations.md`
  - `tests/real-personas/rose/timeline.md`
- Connexion: `tests/real-personas/rose/connection.json`
- Items DB utilises:
  - 1 ou 2 actions du jour

**Ce qu'on cherche a tester**
- Classification `reason_category=emotional` ou `fatigue`.
- Relance courte si le statut est incomplet.
- Pas de culpabilisation.
- Pas de plan patch daily.

**Comment on va le tester**
- Trajectoire: Rose repond avec honte et blocage.
- Pieges / variations: la reponse ne donne pas clairement si l'action est faite ou non.
- Signaux attendus: Sophia soutient, puis demande le minimum necessaire.

**Tours de conversation**
- Tour 1 user: Rose indique que l'action ou les actions n'ont pas ete faites, avec un signal de honte, fatigue ou blocage emotionnel non-safety.
- Tour 2 user: si Sophia demande une raison ou une confirmation, Rose clarifie le statut et donne la cause dominante avec ses propres mots.

**Resultat attendu**
- Fluidite: ton sobre, pas de morale, pas de long bilan.
- Systeme:
  - action(s) -> `missed`;
  - `reason_category=emotional` si detecte ;
  - report seulement si Rose confirme que l'action reste utile et qu'il y a de la place.
- Effet durable: pas de changement weekly ou level review depuis le daily.

**Verification DB / Trace**
- Verifier entries daily.
- Verifier absence d'operation weekly/level.
- Verifier si safety est declenche uniquement en cas de signal explicite.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si red safety/side effect, ajouter `Test D5.2`.

# Tests Weekly

### Test W1 - Habitudes validees, non-habitudes ratees

**Objectif global**
- Verifier que le weekly avance par defaut quand les habitudes sont validees, meme si mission ou clarification n'ont pas ete faites.

**Organisation des variantes**
- `Test W1.1` : Paul a valide ses habitudes, mission ratee mais utile.

#### Test W1.1 - Paul, advance avec carry-over leger

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Paul
- Fichiers contexte lus:
  - `tests/real-personas/paul/persona.md`
  - `tests/real-personas/paul/current-plan.md`
  - `tests/real-personas/paul/observations.md`
  - `tests/real-personas/paul/timeline.md`
- Connexion: `tests/real-personas/paul/connection.json`
- Items DB utilises:
  - habitudes semaine terminee
  - mission/clarification non faite avec daily evidence

**Ce qu'on cherche a tester**
- `habit_verdict.status=validated`.
- `week_strategy.decision=advance`.
- mission/clarification -> `carry_over` ou `drop`, jamais repeat week.

**Comment on va le tester**
- Trajectoire: preparer ou choisir une semaine ou les habitudes sont done/partial haut, mission missed.
- Pieges / variations: Sophia ne doit pas bloquer la progression sur la mission.
- Signaux attendus: Sophia pose seulement la question globale progression/etat si necessaire.

**Tours de conversation**
- Tour 1 user: si Sophia demande le ressenti, Paul confirme ou nuance la progression ressentie et indique s'il veut continuer vers la semaine suivante.

**Resultat attendu**
- Fluidite: Sophia propose de passer a la suite.
- Systeme:
  - `weekly_adaptive_review.habit_verdict.status=validated`;
  - `week_strategy.decision=advance`;
  - `plan_patch.requires_confirmation=true`;
  - operation `advance_week` proposee mais non appliquee sans confirmation.
- Effet durable: aucune mutation de plan sans confirmation.

**Verification DB / Trace**
- Verifier `scheduled_checkins.message_payload.weekly_adaptive_review`.
- Verifier absence d'application immediate du patch.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si Sophia propose repeat, ajouter `Test W1.2`.

### Test W2 - Habitudes ratees avec cause fatigue dominante

**Objectif global**
- Verifier que le weekly utilise les reasons daily pour proposer une semaine bridge plutot que refaire une enquete complete.

**Organisation des variantes**
- `Test W2.1` : Rose a rate les habitudes, daily indique fatigue/emotional.

#### Test W2.1 - Rose, bridge week propose

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Rose
- Fichiers contexte lus:
  - `tests/real-personas/rose/persona.md`
  - `tests/real-personas/rose/current-plan.md`
  - `tests/real-personas/rose/observations.md`
  - `tests/real-personas/rose/timeline.md`
- Connexion: `tests/real-personas/rose/connection.json`
- Items DB utilises:
  - habitudes ratees / partielles
  - daily evidence `fatigue` ou `emotional`

**Ce qu'on cherche a tester**
- `habit_verdict.status=failed`.
- `daily_evidence_summary.dominant_blockers` contient `fatigue` ou `emotional`.
- `week_strategy.decision=bridge_week`.

**Comment on va le tester**
- Trajectoire: lancer weekly apres une semaine avec plusieurs missed daily expliques par fatigue.
- Pieges / variations: Sophia doit demander confirmation de la cause, pas refaire chaque action.
- Signaux attendus: proposition d'allegement.

**Tours de conversation**
- Tour 1 user: Rose confirme que la fatigue ou l'etat emotionnel explique surtout l'echec des habitudes, puis exprime le besoin d'une semaine plus simple.

**Resultat attendu**
- Fluidite: Sophia propose un bridge succinct.
- Systeme:
  - `week_strategy=bridge_week`;
  - `plan_patch.operations` contient `insert_bridge_week`;
  - `requires_confirmation=true`;
  - pas d'application automatique.
- Effet durable: aucune mutation avant confirmation.

**Verification DB / Trace**
- Verifier payload weekly.
- Verifier qu'aucune nouvelle semaine bridge n'a ete creee avant confirmation.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si Sophia repete tout sans tenir compte de fatigue, ajouter `Test W2.2`.

### Test W3 - Habitudes ratees avec cause externe

**Objectif global**
- Verifier que le weekly propose de repeter la meme semaine quand l'echec vient surtout d'un contexte externe ponctuel.

**Organisation des variantes**
- `Test W3.1` : Paul a eu une semaine empechee.

#### Test W3.1 - Paul, repeat week

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Paul
- Fichiers contexte lus:
  - `tests/real-personas/paul/persona.md`
  - `tests/real-personas/paul/current-plan.md`
  - `tests/real-personas/paul/observations.md`
  - `tests/real-personas/paul/timeline.md`
- Connexion: `tests/real-personas/paul/connection.json`
- Items DB utilises:
  - habitudes ratees
  - daily evidence `external` ou reponse weekly indiquant contexte externe

**Ce qu'on cherche a tester**
- Difference entre `repeat_week` et `bridge_week`.
- Le weekly ne conclut pas que le plan est trop dur si la cause est externe.

**Comment on va le tester**
- Trajectoire: Paul explique que la semaine a ete empechee par urgence/deplacement.
- Pieges / variations: Sophia doit eviter une revue de niveau.
- Signaux attendus: `repeat_week`.

**Tours de conversation**
- Tour 1 user: Paul explique que le plan n'etait pas le probleme et que la semaine a surtout ete empechee par un contexte externe ponctuel.

**Resultat attendu**
- Fluidite: Sophia propose de refaire la meme semaine.
- Systeme:
  - `week_strategy.decision=repeat_week`;
  - non-habitudes non faites suivent la semaine repetee ;
  - patch propose uniquement.
- Effet durable: pas de replan complet.

**Verification DB / Trace**
- Verifier `plan_patch.operations` contient `repeat_week`.
- Verifier absence de `open_level_review`.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si Sophia propose bridge malgre cause externe claire, ajouter `Test W3.2`.

### Test W4 - Mission deja faite apres report

**Objectif global**
- Verifier que le weekly ne reschedule pas une mission deja faite, meme si elle etait initialement ratee.

**Organisation des variantes**
- `Test W4.1` : Rose a rate une mission, reportee au lendemain, puis faite.

#### Test W4.1 - Rose, mark completed et jamais carry-over

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Rose
- Fichiers contexte lus:
  - `tests/real-personas/rose/persona.md`
  - `tests/real-personas/rose/current-plan.md`
  - `tests/real-personas/rose/observations.md`
  - `tests/real-personas/rose/timeline.md`
- Connexion: `tests/real-personas/rose/connection.json`
- Items DB utilises:
  - mission non-habitude avec evidence daily de report puis completion

**Ce qu'on cherche a tester**
- Le weekly regarde le statut final, pas seulement le premier missed.
- Invariant : mission deja faite -> jamais reschedule.

**Comment on va le tester**
- Trajectoire: creer/choisir une trace daily ou la mission est `rescheduled_tomorrow` puis `completed`.
- Pieges / variations: la mission apparait comme ratee dans un premier daily.
- Signaux attendus: `mark_completed` ou pas d'operation, mais jamais `carry_over`.

**Tours de conversation**
- Tour 1 user: si Sophia demande confirmation, Rose confirme avec ses propres mots que la mission reportee a bien ete faite ensuite.

**Resultat attendu**
- Fluidite: Sophia reconnait que c'est resolu.
- Systeme:
  - item decision `mark_completed` ou `keep` si deja complet ;
  - aucune operation `carry_over_item` pour cette mission ;
  - aucune operation de reschedule.
- Effet durable: pas de doublon.

**Verification DB / Trace**
- Verifier `item_decisions` sur la mission.
- Verifier `plan_patch.operations`.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Si carry-over apparait, ajouter `Test W4.2`.

### Test W5 - Action plus pertinente et escalation niveau

**Objectif global**
- Verifier que le weekly distingue un item a drop d'un probleme structurel qui demande une revue de niveau.

**Organisation des variantes**
- `Test W5.1` : Paul dit que l'action ne sert plus, mais l'objectif reste bon.
- `Test W5.2` : a ajouter si Paul dit que l'objectif du niveau ne colle plus.

#### Test W5.1 - Paul, drop item sans casser le niveau

**Date**
- YYYY-MM-DD

**Reference encart**
- Appliquer `Encart QA - Daily / Weekly` > `Regle anti-hardcoding obligatoire`.

**Persona**
- Paul
- Fichiers contexte lus:
  - `tests/real-personas/paul/persona.md`
  - `tests/real-personas/paul/current-plan.md`
  - `tests/real-personas/paul/observations.md`
  - `tests/real-personas/paul/timeline.md`
- Connexion: `tests/real-personas/paul/connection.json`
- Items DB utilises:
  - mission ou clarification non faite avec `still_relevant=false`

**Ce qu'on cherche a tester**
- `drop_item` pour une non-habitude plus utile.
- Pas de modification de l'objectif du niveau.
- Pas de level review si seul un item est obsolete.

**Comment on va le tester**
- Trajectoire: daily ou weekly indique qu'une clarification/mission n'a plus d'interet.
- Pieges / variations: Sophia ne doit pas supprimer/replanifier tout le niveau trop vite.
- Signaux attendus: drop propose, confirmation demandee.

**Tours de conversation**
- Tour 1 user: Paul indique que l'action ou la clarification n'est plus pertinente, tout en confirmant que l'objectif du niveau reste valide.

**Resultat attendu**
- Fluidite: Sophia reformule court et demande confirmation du drop.
- Systeme:
  - item decision `drop`;
  - `plan_patch.operations` contient `drop_item`;
  - `preserve_level_objective=true`;
  - pas de `open_level_review`.
- Effet durable: aucun drop applique sans confirmation.

**Verification DB / Trace**
- Verifier `weekly_adaptive_review.item_decisions`.
- Verifier absence de mutation DB avant confirmation.

**Resultat observe**
- A remplir apres run.

**Observations additionnelles**
- A remplir apres run.

**Verdict**
- green|yellow|red

**Tests complementaires**
- Ajouter `Test W5.2` si besoin pour le cas "objectif du niveau ne colle plus".
