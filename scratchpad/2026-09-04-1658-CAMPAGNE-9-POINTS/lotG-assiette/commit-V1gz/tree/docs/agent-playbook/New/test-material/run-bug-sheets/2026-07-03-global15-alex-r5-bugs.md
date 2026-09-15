# Bug Sheet — Global 15 — Alex — R5 (validation chantiers C/O/F)

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-global15-alex-r5.md`
Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`), scope dédié `qa-phase3-alex-r1-1783111159`, plan `a15b08a7`. Reset post-run complet vérifié (état = baseline).

Note de tendance: run de validation des chantiers du 2026-07-03. **Validés en réel** : altitude émotionnelle (T1), progression coaching sur acceptation molle (T3), exit info sous flow + snapshot exact (T4), date_hint ISO + ancrage effective_at (T5/T6), cycle create/verify/cancel reminder (T9-T11), count rappels exact (T12), exclusion mémoire des états produit (post-run), non-régressions doublon/auto-collision (T10). **2 red nouveaux** sur la partie la plus récente (garde d'évidence F2 + correction de cible), 2 yellow.

---

## R5-B01 — Garde d'évidence de cible contournée par un token calendaire générique

- Tours: T7
- Famille: **BF-INTAKE-04** (cible devinée committée)
- Domaine owner: `tools/always_on/track_progress_plan_item/router.ts` (`trackTargetEvidenced`, garde F2)
- Source amont: sur « j'ai avancé sur un autre truc du plan **cette semaine** », le dispatcher devine l'item « Planifier mes soirées de la **semaine** » ; la garde d'évidence matche le token « semaine » (mot calendaire présent dans le titre ET dans le message) et laisse committer. L'item était de plus déjà `completed` en DB.
- Symptome visible: « C'est fait pour Planifier mes soirées de la semaine ✅ » sur une action jamais nommée.
- Preuve systeme: `direct_effects=[track_progress_plan_item]` target `47ecbb7c`, `tool_skill=logged committed=1`, entry créée (supprimée au reset). Message user sans aucun token distinctif du titre.
- Correction attendue: durcir l'évidence — étendre `EVIDENCE_STOPWORDS` aux mots calendaires/génériques de titres (« semaine », « plan », « nuit/nuits », « bilan », « jour »…) et/ou exiger un token **distinctif** (n'appartenant qu'au titre d'un seul item actif). Conserver le fail-open. Donnée de garde, pas de regex d'intention.
- Statut: `fix_applied` (chantier G1, validé en conditions réelles 2026-07-03)
- Fix reference: le matching lexical (et sa liste de stopwords) est SUPPRIMÉ, remplacé par le **contrat de citation d'évidence** (3d-ter) : le dispatcher fournit `payload_hint.target_evidence` = citation verbatim des mots du user qui nomment l'action ; le runtime vérifie (1) que la citation existe telle quelle dans le message ou la fenêtre récente, (2) qu'elle partage au moins un token avec le titre/aliases/description de l'item choisi (cohérence citation↔cible — intersection ensembliste pure, zéro liste). La sémantique reste 100 % dans le prompt (+ exemple négatif « un autre truc du plan » = citation INVALIDE, observé en probe et bloqué). **Probe réel** : le message exact du T7 → `needs_clarify target_not_evidenced` (0 commit), question posée ; « c'était la cartographie de mes ruminations » au tour suivant → ré-arm 3g (règle de fusion des slots précisée : la réponse du user PRIME sur la cible devinée de known_slots) → commit sur la bonne cible.
- Tests requis: positif (« un autre truc du plan cette semaine » + cible devinée → needs_clarify `target_not_evidenced`, 0 commit) ; anti-faux-positif (« j'ai fait ma nuit sans écran » → token distinctif « ecran » → commit direct) ; fail-open préservé (titre sans token exploitable → comportement actuel).

## R5-B02 — Correction de cible : claim « je corrige » sans aucun effet

- Tours: T8 (propagation T14)
- Famille: **BF-LEDGER-01** (claim d'action sans commit) + contrat dispatcher 3h incomplet
- Domaine owner: dispatcher (contrat track 3h) + runtime track_progress (capacité de correction de cible) + politique de claim (vocabulaire default-deny)
- Source amont: 3h ne couvre que la correction de **statut** ; une correction de **cible** (« c'était X, pas Y ») n'émet aucun effet — l'entry erronée reste, la bonne cible n'est pas committée. Le composeur improvise « Je corrige le fil là-dessus ✅ » (verbe « corriger » hors du vocabulaire default-deny « fait/noté/enregistré/programmé », et aucun outcome à exposer puisque rien n'est demandé au runtime).
- Symptome visible: correction acquittée avec ✅, suivi inchangé ; le recap T14 restitue ensuite l'action erronée comme « faite ».
- Preuve systeme: T8 `direct_effects=[]`, `tool_skill=null`, DB inchangée (entry `47ecbb7c` toujours là, aucune entry `8c7e41cb`).
- Correction attendue: (1) étendre 3h — correction de cible explicite ⇒ effet structuré `correction de cible` (invalidation de l'entry visée du jour + commit sur la cible corrigée, `correction=true`) ; (2) capacité runtime correspondante (invalidate/retarget d'une entry du jour, idempotente) ; (3) étendre le vocabulaire default-deny aux claims de correction (« je corrige / c'est corrigé » ⇒ outcome committed exigé).
- Statut: `fix_applied` (chantier G2, validé en conditions réelles 2026-07-03)
- Fix reference: (1) contrat 3h-bis : correction de cible ⇒ track sur X avec `correction=true` + `retarget_from=Y` + `target_evidence` ; (2) runtime : `logPlanItemProgressV2` stocke désormais `item_patch_prior` (état de l'item avant patch) dans la metadata de chaque entry, et `invalidateChatEntryForRetarget` supprime l'entry conversationnelle du jour sur Y puis **restaure exactement** l'état antérieur de l'item (revert déterministe, pas de devinette) avant le commit sur X ; (3) « corrigé » ajouté au vocabulaire default-deny (companion + règle EN + ligne canonique). **Probe réel** : « j'ai fait mon sas » (commit, sas 0/3→1/3) puis « non c'était pas le sas, c'était cibler le réflexe écran — corrige » → entry sas supprimée, sas restauré 0/3 active, commit sur la bonne cible, réponse « C'est corrigé sur "Cibler le réflexe écran au lit" » adossée au commit.
- Tests requis: positif (« c'était X, pas Y » → entry Y invalidée + entry X committée, correction=true) ; contrat (claim de correction impossible sans commit) ; anti-faux-positif (« ah oui tu as raison » sans demande de correction → aucun effet) ; intégration (recap post-correction reflète la cible corrigée).

## R5-B03 — Fait mémoire explicite persisté sans sa précision

- Tours: T13 (vérifié post-run au batch)
- Famille: **BF-MEMORY-01** (fait confié non restituable tel quel)
- Domaine owner: `_shared/memory/memorizer` — extraction/write_policy (pas le pre-filtre : le message a bien été processed)
- Source amont: « c'est toujours vers **23h** que je craque, **jamais en début de soirée** — garde ça en tête » passe le pre-filtre (signal memorize OK) mais le batch ne persiste qu'un statement générique « bascule le soir » (issu du T1) ; la précision horaire explicitement confiée est perdue (probable dédup/absorption à l'extraction, 10 rejets sur le run).
- Symptome visible: aucun in-turn (accusé conforme) ; le fait précis ne sera pas restituable dans les conversations futures.
- Preuve systeme: batch scopé `persisted_count=4` ; aucun des 4 items ne contient « 23h » ; le plus proche est le statement générique du T1.
- Correction attendue: à l'extraction, un fait explicitement confié (« retiens que / garde en tête ») doit être persisté avec sa formulation précise, et ne pas être absorbé/dédupliqué dans un statement plus vague — la précision (heure, condition) fait partie du fait.
- Statut: open
- Fix reference: —
- Tests requis: positif (« retiens que c'est vers 23h que je craque » → memory_item contenant « 23h » après batch) ; anti-dédup (un fait générique préexistant n'absorbe pas la version précise — supersede attendu) ; non-régression exclusion états produit (validée ce run).

## R5-B04 — Précision de projection dans les listes spontanées (mineur)

- Tours: T12 (secondaire T14 pour l'omission des entries — voir rapport)
- Famille: **BF-STATUS-01** (mineur, variance)
- Domaine owner: companion (usage des blocs SNAPSHOT/SEMAINE)
- Source amont: en listant le plan spontanément, un item `pending` est mélangé aux actifs sans distinction (T4 distinguait correctement — variance d'usage du bloc, le statut y figure) ; au T14 le narratif s'appuie sur les statuts d'items et omet les `executions_semaine` de la session.
- Symptome visible: liste plan légèrement imprécise ; mini-point qui ne cite pas le fait/raté de la soirée.
- Correction attendue: observer sur les prochains runs ; si récurrent, renforcer la ligne d'usage (statut toujours restitué en liste ; `executions_semaine` cité dans tout « où j'en suis »). Pas d'action immédiate (T14 est surtout la propagation de B01/B02).
- Statut: open (à observer)
- Fix reference: —
- Tests requis: recap « où j'en suis » après N check-ins de session → chaque entry citée ; liste d'items → statuts distingués.

---

### Récap verdicts tours

| Tour | Verdict | Famille |
| --- | --- | --- |
| T1 | green | — |
| T2 | green | — |
| T3 | green | — |
| T4 | green | — |
| T5 | green | — |
| T6 | green | — |
| T7 | red | BF-INTAKE-04 |
| T8 | red | BF-LEDGER-01 |
| T9 | green | — |
| T10 | green | — |
| T11 | green | — |
| T12 | yellow | BF-STATUS-01 |
| T13 | green (in-turn) / yellow au batch | BF-MEMORY-01 |
| T14 | yellow | BF-STATUS-02 (propagation T7/T8) |
| T15 | green | — |

Global: **red** (analyse système red — effet durable faux T7 + claim de correction sans effet T8). 11 green / 2 red / 2-3 yellow.
