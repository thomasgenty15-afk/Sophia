# Bug Sheet — Alex — Multiflow r1 (2026-07-10)

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-10-alex-multiflow-coaching-presence-reminder-r1.md`
Run: `alex-multiflow-r1` · persona Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`) · scope web · IA réelle locale `force_full_ai=true`.

## Lignes De Bug

| Tour | Famille | Owner runtime | Source amont probable | Correction recommandée | Tests d'invariant attendus | Statut |
| --- | --- | --- | --- | --- | --- |
| T12 | `BF-STATUS-01` | Projection status/recap des rappels | La projection de recap des rappels ne lit que la surface récurrente (`user_recurring_reminders`) et ignore les rappels one-shot (`scheduled_checkins`, `event_context one_shot_reminder:*`). Sur « le rappel de demain à quelle heure ? », remonte un récurrent 09:00 et nie connaître le one-shot 8h créé au T4. | Élargir le périmètre de requête de la projection: union récurrents + one-shot pending du jour cible; renvoyer heure locale + instruction unifiées. | Recap « mes rappels de demain » ⇒ liste récurrents ET one-shot; aucun « je n'ai pas son horaire sous les yeux » si un one-shot pending existe pour la date. | `fix_applied` (2026-07-11, chantier R — lane status + bloc rendez-vous rebordé, cf. feuille paul-triflow R1-B01) |
| T13 | `BF-STATUS-01` | Projection status/recap des rappels | Même gap: sur une confirmation ciblée d'un rappel réel et committé au T4 (`scheduled_checkins` pending 06:00Z, vérifié), la projection ne le retrouve pas et le dégrade en « je ne vois que l'intention, pas une preuve d'exécution ». | Même fix (source de vérité unifiée). Ajouter garde: si un `one_shot_reminder.create=committed` existe dans le thread, la confirmation doit partir de la ligne `scheduled_checkins`. | Après `one_shot committed`, question « il est bien programmé ? » même session ⇒ confirme heure locale + instruction, jamais « seulement l'intention ». | `fix_applied` (2026-07-11, chantier R — lane status + bloc rendez-vous rebordé, cf. feuille paul-triflow R1-B01) |
| T14 | `BF-STATUS-01` | Projection status/recap des rappels | Persistance du même symptôme: Sophia reconnaît honnêtement la contradiction (T4 vs T13) mais réaffirme ne pas pouvoir confirmer un rappel pourtant réel. Récupération conversationnelle correcte, fond du bug identique aux T12/T13. | Résolu par le même fix amont; pas de correctif de phrase distinct. | Une fois la source unifiée, plus de contradiction confirmation(T4)/recap(T12–14) dans un même thread. | `fix_applied` (2026-07-11, chantier R — lane status + bloc rendez-vous rebordé, cf. feuille paul-triflow R1-B01) |

## Incident Environnement (hors taxonomie produit)

- `trigger-memorizer-daily` (fin de run): `HTTP 500`, FK `memory_message_processing_message_id_fkey` violée sur `message_id=ee65adbf-622a-457b-8b12-480c7ac4850d` (absent de `chat_messages`, non lié à Alex). Batch avorté, 0 `memory_item` créé pour Alex ⇒ persistance de l'intention mémoire (T11) non vérifiable ce run.
- Nature: donnée stale locale / intégrité `memory_message_processing`, pas un bug du chemin conversationnel. À nettoyer côté environnement (purger la ligne `memory_message_processing` orpheline) avant la prochaine vérif memorizer.
- **Résolu 2026-07-12 (chantier V6-7)** : audit local — 0 ligne orpheline restante (`memory_message_processing` vs `chat_messages`), le message incriminé n'existe plus nulle part (purgé avec la recréation des personas). `trigger-memorizer-daily` rejoué : HTTP 200, 3 users traités, zéro erreur FK. Cause identifiée : le batch charge ses candidats depuis `chat_messages` — la FK ne casse que si un cleanup QA supprime des messages PENDANT le batch (course bénigne, à éviter en ne lançant pas reset et memorizer en parallèle).

## Notes De Cadrage (non-bugs confirmés)

- T4 rappel one-shot: effet durable **correct** (payload 8h / instruction / once / committed). Le bug est en lecture (recall), pas en écriture.
- T11 accusé mémoire: comportement **attendu** (accusé in-turn, write différé au memorizer nocturne) — pas BF-MEMORY-01.
- T6 micro-technique en presence: offre unique et légère, cadrée; observation fluidité, pas de ligne BF.
- T9 handoff presence→coaching sur pull explicite: **attendu** (design presence « offre sur pull »), pas un mauvais routage.

## Reset Effectué

- `scheduled_checkins` one-shot `6536873c…` (créé T4) supprimé (`DELETE 1`), vérifié `count=0`.
- Rappels récurrents pré-existants intacts.
- `user_chat_states.temp_memory`: pas de `__active_skill_state` résiduel (flow sorti au T12); transcript conservé.
