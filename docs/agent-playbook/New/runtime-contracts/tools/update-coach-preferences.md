# update_coach_preferences Runtime Contract

## Mental Model

`update_coach_preferences` est un write-skill local léger.

Les préférences coach supportées sont simples, fermées et déjà lues par le
runtime. Quand la demande utilisateur est claire, durable, supportée et non
bloquée par safety/risk, le chat peut écrire directement dans
`user_profile_facts`.

Forme cible :

```txt
message user
-> update_coach_preferences.local_dispatcher
-> reducer / validator
-> writer DB si update locked
-> prompt visible stage-specific
-> réponse visible
```

Pendant un flow local actif, le dispatcher global ne tourne pas. Il reprend la
main uniquement si le dispatcher local retourne explicitement
`exit_to_global_dispatcher`.

Pendant ce flow actif, certaines questions inline restent dans le flow local :

- une question sur les préférences coach actives appelle `status_recap` comme
  sub-skill read-only DB-grounded ;
- une question d'explication produit sur les réglages coach appelle
  `product_help` comme sub-skill non-mutant ;
- après la réponse du sub-skill, `update_coach_preferences` reste owner du
  flow et conserve son état local.

## Scope Produit

Les seules clés durables supportées sont :

- `coach.tone`: `soft`, `warm_direct`, `direct`
- `coach.challenge_level`: `low`, `balanced`, `high`
- `coach.question_tendency`: `low`, `normal`, `high`

Les demandes hors de ces réglages ne sont pas stockées durablement depuis ce
skill : longueur exacte, emoji, jamais de question finale, ordre
action-avant-question, format de réponse, règle conditionnelle cachée ou style
trop spécifique.

Ces demandes doivent être traitées comme consigne ponctuelle, expliquées comme
non supportées, ou proposées comme mapping partiel vers un réglage supporté avec
confirmation explicite.

## Runtime Shape

```txt
router/run.ts
  -> si __coach_preference_flow_state_v1 actif: skip dispatcher global
  -> maybeRunUpdateCoachPreferencesOperation
  -> local_flow.ts: dispatcher local + reducer
  -> status.ts: writer borné user_profile_facts
  -> visible_agent.ts: message visible stage-specific
```

Chemins read-only séparés :

```txt
status question
  -> status_recap sub-skill inline, focus coach_preferences

runtime composer constraints
  -> runtime_policy.ts: loadCoachPreferenceRuntimePolicy

product explanation question
  -> product_help sub-skill inline, origin_flow update_coach_preferences
```

Le legacy `__coach_preference_handoff_state_v1` peut être lu pour migration
douce, mais ne pilote plus le chemin nominal.

## Dispatcher Local

Le dispatcher local retourne uniquement un JSON strict. Il reçoit :

- message utilisateur courant ;
- état local actif ;
- préférences actuelles connues ;
- mappings supportés ;
- proposition précédente éventuelle ;
- risk band safety.

Il distingue durable clair, ponctuel, ambigu, supporté, non supporté, mapping
partiel, confirmation, révision, status, explication produit, cancel, topic
change et safety.

Le dispatcher peut proposer une update. Le reducer est le seul composant qui
valide si cette update est structurellement writeable.

Pour `status_question` et `explain_preferences`, le dispatcher local ne répond
pas lui-même :

- `status_question` route vers `visible_task.kind=get_info_db`, puis le runtime
  appelle `status_recap` inline avec focus préférences coach ;
- `explain_preferences` route vers `visible_task.kind=get_info_product`, puis
  le runtime appelle `product_help` inline avec le contexte du flow ;
- ces sub-skills ne deviennent jamais owner final et ne clearent pas l'état
  `__coach_preference_flow_state_v1`.

## Reducer / Validator

Le reducer peut seulement faire des checks déterministes de contrat :

- JSON et enums ;
- clé supportée ;
- valeur supportée pour la clé ;
- statut `locked` requis pour écrire ;
- pas de doublon ;
- `confidence !== low` ;
- `risk_score` sous seuil ;
- `preference_intent.kind === durable_supported` ;
- `durability === durable` ;
- `support_status === supported` ;
- commit DB requis avant claim visible de succès.

Le reducer ne parse jamais le message utilisateur et ne mappe jamais des mots
vers des préférences.

## Writer DB

Le writer écrit uniquement dans `user_profile_facts` avec le pattern existant :

- `user_id`
- `scope = global`
- `key`
- `value.value`
- `status = active`
- `source_type = explicit_user`
- `last_source_message_id`
- `updated_at`
- `last_confirmed_at`

L’upsert est borné à `(user_id, scope, key)`. Si le write échoue, aucun succès
visible durable ne peut être rendu.

## Runtime Effects

Après commit DB réel :

- `toolExecution = "success"`
- `executedTools = ["update_coach_preferences"]`
- `committed_effects` contient `type = update_coach_preferences`,
  `preference_keys` et `preferences_update_ids` si disponibles.

Sans commit :

- `executedTools = []`
- `committed_effects = []`
- pas de platform handoff nominal ;
- pas de pending confirmation ;
- pas de confirmation token ;
- pas de phrase visible de succès durable.

## Visible Prompts

Les messages visibles sont produits par `visible_agent.ts` avec des stages :

- `preference_saved`
- `ask_durable_vs_punctual`
- `ask_setting_or_value`
- `confirm_supported_mapping`
- `punctual_instruction_ack`
- `unsupported_preference`
- `get_info_db`
- `get_info_product`
- `repeat_saved_preferences`
- `write_failed_or_blocked`
- `exit_or_cancel`
- `safety`

L’agent visible ne décide jamais de champ, de valeur, de mapping ou de write.

Exception de rendu :

- `get_info_db` peut être rendu par `status_recap` quand il s'agit de lire les
  préférences coach actives pendant le flow ;
- `get_info_product` peut être rendu par `product_help` quand le user demande
  à quoi correspondent les réglages ;
- dans les deux cas, `toolExecution="none"`, `executedTools=[]`,
  `committed_effects=[]` et `update_coach_preferences` reste le flow actif.

## Invariants

- Écriture DB uniquement pour préférence claire, durable, supportée, locked.
- Aucune écriture pour ponctuel, ambigu, unsupported, safety/risk bloqué.
- Pas de dispatcher global pendant un flow local actif.
- Pas de renderer déterministe dans le chemin nominal.
- Pas de regex métier ni `message.includes(...)` métier dans le chemin nominal.
- Pas de pending confirmation exécutable.
- Pas de platform handoff sur le chemin nominal write.
- Les claims visibles de succès dépendent d’un commit DB réel.
- Les préférences écrites sont relues par `runtime_policy.ts`.
- Les questions inline de status/produit pendant le flow passent par
  `status_recap` / `product_help` comme sub-skills, sans relancer le dispatcher
  global.
