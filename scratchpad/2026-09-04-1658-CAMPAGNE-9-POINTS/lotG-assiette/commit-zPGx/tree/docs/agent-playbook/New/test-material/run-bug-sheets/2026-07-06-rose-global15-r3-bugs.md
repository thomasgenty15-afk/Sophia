# Bug Sheet — Rose Global 15 — 2026-07-06 R3

Run: `global15-rose-20260706-r3` — scope `qa-global15-rose-2026-07-06-r3`
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-rose-global15-r3.md`
Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`) — transformation « Arrêter le cannabis », plan V2 `05393e65`.
Verdict global: **yellow** (fluidité green, système yellow).

## Bugs

### R3-B01 — Patch compteur/statut habitude avalé silencieusement (cible atteinte)

- **Bug id:** R3-B01
- **Tours:** T4
- **Famille:** `BF-EFFECT-04` (write technique fragile) → conséquence `BF-STATUS-01` (projection habitude divergente)
- **Domaine owner:** tool `track_progress_plan_item` (writer `db.ts`) + couche migrations DB (triggers `guard_unlocked_principles_update` / `unlock_v2_principles_from_item_transition`)
- **Source amont:** `supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/db.ts` lignes ~384-401 (second write « contrat dashboard », non-bloquant) + triggers sur `user_plan_items` / `user_transformations`.
- **Symptôme visible:** Sophia confirme « c'est bien compté pour hier ✅ » (vrai, entry commitée) mais la projection habitude ne bouge pas : dashboard reste « 1/2 » et l'habitude n'entre jamais en maintenance quand la cible est atteinte.
- **Preuve système:**
  - Entry `45d7d885` commitée : `d62d828a`, completed, value 1, `effective_at=2026-07-05` ✅ ; ledger requested 1/allowed 1/committed 1.
  - Item `d62d828a` **inchangé** : `current_reps=1` (attendu 2), `status=active` (attendu `in_maintenance`), `current_habit_state=active_building`, `updated_at=2026-07-03` (figé). Metadata entry `item_patch_prior.current_reps=1` (le patch était prévu).
  - Repro DB : `BEGIN; UPDATE user_plan_items SET current_reps=2, status='in_maintenance', current_habit_state='in_maintenance' WHERE id='d62d828a…';` → `ERROR P0001: Direct modification of unlocked_principles is not allowed` via `unlock_v2_principles_from_item_transition` → `unlock_transformation_principle()` → `guard_unlocked_principles_update()`. Le guard n'autorise que `auth.role()='service_role'` ; le track tourne sous `authenticated` → rejet → patch « non-bloquant » avalé (`console.warn`).
- **Correction attendue:** exécuter le second write (compteur/statut) sous une connexion **service_role**, OU relâcher `guard_unlocked_principles_update()` pour le chemin de trigger interne (flag de session `set_config('app.allow_principle_unlock','1', true)` posé par `unlock_transformation_principle()` et vérifié par le guard). Ne plus avaler `patchResult.error` en silence : remonter un événement d'observabilité et/ou retry service_role. (Pas un patch de phrase — c'est un conflit de contrat durable/DB.)
- **Statut:** `known-issue V1 — won't fix (arbitrage produit 2026-07-06)` : toucher au trigger/service_role = bourbier refusé pour la V1. Seule l'observabilité est corrigée (chantier W5) : l'échec du patch n'est plus un `console.warn` avalé mais un `console.error` structuré `item_patch_failed` (plan_item_id, patch, message, code) — greppable. L'entry reste la source de vérité ; le compteur dashboard peut diverger quand une cible est atteinte via chat. À réévaluer post-V1.
- **Fix reference:** observabilité seule, chantier W (2026-07-06)
- **Tests requis:**
  - Positif : track habitude count/boolean atteignant la cible sous rôle `authenticated` → `current_reps` incrémenté + `status/current_habit_state` en maintenance + principe débloqué.
  - Non-régression : track n'atteignant pas la cible → increment simple, pas de transition, pas d'erreur.
  - Anti-faux-positif : sur échec du patch, l'erreur est visible (observabilité), pas silencieuse.
  - Intégration runtime : run QA track → recap ultérieur cohérent avec compteur.

### R3-B02 — Recap rappels incomplet (récurrents actifs omis)

- **Bug id:** R3-B02
- **Tours:** T6
- **Famille:** `BF-STATUS-02` (inventaire/historique incomplet) ; accessoirement `BF-ROUTE-03` (status/tool mal priorisé)
- **Domaine owner:** projection status/recap des rappels + arbitrage dispatcher (recap « liste mes rappels » routé `product_help`)
- **Source amont:** absence d'une projection qui agrège `scheduled_checkins` (pending) + `user_recurring_reminders` (actifs) pour répondre à « qu'est-ce qui est programmé pour moi ».
- **Symptôme visible:** à « dis-moi exactement ce que t'as de programmé côté rappels », Sophia surface le one-shot du soir mais **omet le récurrent actif de 9h** (`98a417ff`) et disclame « pas de vue globale » — alors que l'utilisatrice craint précisément d'être « noyée sous les notifs ».
- **Preuve système:** T6 owner `product_help`, ledger 0. DB : `user_recurring_reminders` `98a417ff` `status=active`, daily 09:00, non archivé (`initiative_kind=potion_generated`). Incohérence interne avec T7/T8 où le système sait que « initiatives = messages récurrents » et où l'on peut pause/supprimer un rappel.
- **Correction attendue:** recap rappels doit lire et agréger `scheduled_checkins` pending + `user_recurring_reminders` actifs (y compris `potion_generated`) et les restituer ; ne pas répondre par une explication de surface générique quand l'intention est un **inventaire**.
- **Statut:** `fix_applied` — chantier W2 (2026-07-06). La projection agrégée EXISTAIT déjà (bloc ÉTAT DURABLE : tous les pending + récurrents actifs, injecté en companion) — le trou était le routage : l'inventaire capté par `product_help` qui ne possède pas cette projection. Fix : doctrine product_help « un INVENTAIRE d'état personnel est TOUJOURS object_status_question avec db_sources_required=true » → l'exit structurel existant vers le global tire, la réponse normale rend l'inventaire exact. À confirmer au prochain run.
- **Fix reference:** chantier W (2026-07-06)
- **Tests requis:**
  - Positif : 1 one-shot + 1 récurrent actif → recap cite les deux (heure locale correcte).
  - Négatif : 0 rappel → « aucun rappel ».
  - Paraphrase : « c'est quoi mes rappels / mes notifs / ce qui est programmé » → même inventaire.

### R3-B03 — Intention mémoire explicite non persistée

- **Bug id:** R3-B03
- **Tours:** T13
- **Famille:** `BF-MEMORY-01` (promesse mémoire non persistée)
- **Domaine owner:** memorizer nocturne (`trigger-memorizer-daily`, extraction) — `supabase/functions/_shared/memory/memorizer/extract.ts`
- **Source amont:** extraction du batch qui n'a pas retenu un fait personnel spécifique marqué d'une intention mémoire explicite.
- **Symptôme visible:** Sophia acquitte « c'est noté, je le garde en tête » (ACK correct, comportement attendu) mais le fait « solitude du weekend / samedi après-midi seule → replonge, jamais avec des potes » **n'existe dans aucun `memory_item`** après batch.
- **Preuve système:** extraction_run `3697ccbf`, 15 msgs, 7 items persistés — aucun ne porte le fait weekend/solitude (recherche `ilike '%solitud%|%weekend%|%week-end%|%samedi%|%pote%'` → 0 match pertinent). Ce n'est **pas** un rejet explicite : les 10 rejets loggés correspondent aux tours non-personnels (T9 vague weekend, T10 identité/désespoir, T11/T12 cadence plan, T14 suppression, T15 tracking). Le fait T13 a été **non extrait**. Des faits moins saillants (automatisme matinal, moment critique, « préfère comprendre » candidate) et 2 statements rappel superseded sont, eux, stockés.
- **Correction attendue:** renforcer l'extraction sur les marqueurs d'intention mémoire explicite (« retiens que… », « garde ça en tête… », « un truc à retenir sur moi… ») : un fait personnel spécifique explicitement marqué ne doit pas être omis. (Owner extraction/prompt, pas patch de phrase renderer.)
- **Statut:** `open — sous surveillance v3` : la règle « PRECISION DES FAITS CONFIES » du prompt d'extraction v3 (chantier Z, déployée le même jour) cible exactement ce cas ; ce run n'a probablement pas permis de la juger proprement (timing déploiement/run incertain). À trancher au prochain batch réel : si le fait confié est encore omis sous v3, escalader (owner extraction).
- **Fix reference:** — (chantier Z v3 à confirmer)
- **Tests requis:**
  - Positif : message « retiens que <fait personnel spécifique> » → ≥1 `memory_item` actif portant le fait après batch.
  - Paraphrase : variantes de marqueur d'intention (« garde en tête », « à retenir sur moi ») → même persistance.
  - Anti-faux-positif : marqueur d'intention sans fait personnel (ex. « retiens de me rappeler à 9h ») → pas de memory_item (reste objet app/rappel).

## Notes

- Effets durables du run (nettoyés en fin de run) : entry `45d7d885` (T4), checkin `d8fcf05f` (T5), 7 `memory_items` + extraction_run `3697ccbf` (batch de test).
- Aucune mutation de plan, aucune carte créée en chat, safety jamais contournée, aucune claim LEDGER sans commit.
- Baseline restaurée et vérifiée en fin de run.
