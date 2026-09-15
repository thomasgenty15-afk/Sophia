# QA Run Report - qa-always-on-tools-20260611-r2

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `qa-always-on-tools-20260611-r2`
- Persona: Rose, user test local `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: rerun reel apres correction de `create_one_shot_reminder`, et verification conjointe de `track_progress_plan_item`.
- Trajectoire: creation de rappel ponctuel explicite -> log de progres de plan.
- Surfaces visees: dispatcher, direct effects always-on, `create_one_shot_reminder`, `track_progress_plan_item`, EffectLedger, DB `scheduled_checkins`, DB `user_plan_item_entries`, `system_runtime_snapshots`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `Authorization: Bearer <ANON_KEY>`, `x-user-authorization: Bearer <access_token>`. Aucun renderer deterministe ni fallback direct.
- Validite QA: valide. Auth locale Rose verifiee, compte marque `is_test_persona=true`, token accepte par `/auth/v1/user`.
- Nettoyage: effectue apres run. Supprimes: 1 `scheduled_checkins`, 1 `user_plan_item_entries`, 1 `system_runtime_snapshots`, 4 `chat_messages`, 1 `user_chat_states`. Verification finale: 0 artefact restant dans le scope `qa-always-on-tools-20260611-r2`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Tu peux me mettre un rappel unique demain à 8h45 pour sortir le tapis et faire le sas de décompression sans fumer ?

**Sophia**
> C'est programmé pour vendredi 12 juin à 08:45.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder` via `router_decision_v2.tool_skill_runtime`
- safety: side effects allowed
- direct_effects: `create_one_shot_reminder`, `explicitness=explicit`, `target_status=identified`, `confidence_band=high`
- payload_hint: `when_hint="demain 8h45"`, `instruction_hint="sortir le tapis et faire le sas de décompression sans fumer"`
- EffectLedger: requested 1, allowed 1, committed 1, blocked 0, failed 0
- durable_effect: `scheduled_checkins.id=cfe62833-7615-47f5-be59-0dcc8cf9c594`, `scheduled_for=2026-06-12T06:45:00+00:00`, `status=pending`, `event_context=one_shot_reminder:sortir_le_tapis_et_faire_le_sas_de_decompression_sans_fumer`

### Tour 2

**Verdict du tour:** green

**User**
> Et côté plan, ce soir j'ai fait le sas de décompression sans fumer : tapis sorti, respiration faite, zéro cigarette.

**Sophia**
> Note pour Faire un sas de décompression (sans fumer): fait.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `track_progress_plan_item` via `router_decision_v2.tool_skill_runtime`
- safety: side effects allowed
- direct_effects: `track_progress_plan_item`, `target_item_id=3db6278b-bd59-4401-bbdf-80b575ee14bb`, `target_title="Faire un sas de décompression (sans fumer)"`, `status_hint=completed`, `confidence_band=high`
- EffectLedger: requested 1, allowed 1, committed 1, blocked 0, failed 0
- durable_effect: `user_plan_item_entries.id=b8e78c06-668f-4970-aba3-a304bcd3fded`, `entry_kind=checkin`, `outcome=completed`, `value_numeric=1`
- snapshot: `system_runtime_snapshots.id=8e9e16ed-89ca-4d6c-bda9-ad3482738635`, `snapshot_type=plan_item_entry_logged_v2`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le rappel ponctuel est confirme directement, sans redemander un horaire deja fourni.
- La reponse est courte et ne pretend pas plus que l'effet durable commis.
- Le passage au log de progres de plan est naturel; Sophia note l'action cible correcte sans relancer sur le rappel.

**Problemes**
- Aucun probleme bloquant observe sur ce run.

**Fix propose**
- Aucun nouveau fix requis pour ce scenario.
- Invariant a conserver: un `when_hint` exploitable doit produire un `scheduled_for` et un commit DB avant toute formulation "programme".

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `create_one_shot_reminder` est route correctement au tour 1.
- `track_progress_plan_item` est route correctement au tour 2.
- Le run ne montre pas de collision entre rappel ponctuel pending et log de progres de plan.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: succes systeme. Le parser local produit `scheduled_for=2026-06-12T06:45:00+00:00`, l'executor commit `scheduled_checkins`, et l'EffectLedger expose requested/allowed/committed.
- `track_progress_plan_item`: succes systeme. La cible de plan est identifiee, le status `completed` est loggue, et le snapshot runtime est cree.

**Memory / Effets durables**
- Pendant le run: 1 `scheduled_checkins`, 1 `user_plan_item_entries`, 1 `system_runtime_snapshots`, 4 `chat_messages`, 1 `user_chat_states`.
- Apres cleanup cible: 0 `scheduled_checkins`, 0 `user_plan_item_entries`, 0 `system_runtime_snapshots`, 0 `chat_messages`, 0 `user_chat_states` pour le scope/run.

**Problemes**
- Aucun probleme systeme observe.
- Note technique: le `db_ref.table` de l'EffectLedger pour le progres affiche `plan_item_progress_logs`, mais la ligne durable reelle est dans `user_plan_item_entries`. Le cleanup a verifie et supprime la ligne reelle `user_plan_item_entries.id=b8e78c06-668f-4970-aba3-a304bcd3fded`.

**Fix propose**
- Aucun fix requis pour le comportement teste.
- Invariant de regression attendu: `scheduled_checkins.scheduled_for` correct en Europe/Paris, `committed_effects` present avant reponse visible de succes, `user_plan_item_entries` nettoyable par id apres run.

## Verdict Global

Green. Le rerun IA reel local valide la correction de `create_one_shot_reminder`: le rappel ponctuel explicite est cree sans clarification inutile. `track_progress_plan_item` reste green et commit correctement le progres du plan.
