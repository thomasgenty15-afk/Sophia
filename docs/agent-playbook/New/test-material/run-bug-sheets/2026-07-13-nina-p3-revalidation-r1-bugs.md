# Run Bug Sheet - nina-p3-revalidation-r1

## Metadata

- Date: 2026-07-13
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-nina-p3-revalidation-r1.md`
- Run id: `nina-p3-revalidation-r1` (scope `qa-nina-p3reval-2026-07-13-r1`)
- Persona / scenario: Nina — re-validation réelle du chantier P3 (safety×effets, temps déterministe, correction/retarget, recall/memorizer, replace, abonnement), mode difficile, 15 tours
- Verdict run: **red**
- Validite QA: valide (15/15 HTTP 200, IA réelle, force_full_ai, Supabase local, effets vérifiés en DB par user_id, memorizer scopé, baseline restaurée)
- Agent owner: QA

## Synthese

- Familles dominantes: `BF-EFFECT-03` / `BF-INTAKE-03` (auto-retarget P3-C sur-applique sur l'additif), puis `BF-AGENDA-01`, `BF-LEDGER-01` (adjacent), `a classifier` (greffe statut de rappel).
- Bug le plus bloquant: **B01 (T4)** — l'auto-retarget P3-C prend un suivi **additif** explicite pour une correction et **détruit silencieusement** une complétion légitime (petit-déj), réponse trompeuse. Régression symétrique introduite par le fix P3-C.
- Fix architectural prioritaire: dans l'auto-retarget P3-C, consommer le marqueur additif (« aussi / en plus / les deux ») pour **bloquer le retarget** et router vers un commit additif ; garde d'admission `track_progress` qui n'invalide **jamais** une entrée sous marqueur additif. Substitution et additif doivent produire des effets **opposés** sur l'ancienne entrée.
- Rerun requis: oui après fix B01/B02 (rejouer T1→T4 : substitution → retarget ; additif → 2 commits). Re-vérifier B03 (différé honnête stabilizing), B05 (greffe statut).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NINA-P3REVAL-B01` | T4 | `BF-EFFECT-03` (racine `BF-INTAKE-03`) | dispatcher (classification correction/retarget) + `track_progress_plan_item` (garde d'admission auto-retarget) | auto-retarget P3-C déclenché sur un tour à marqueur additif : `payload_hint.correction=true, retarget_from=501e541b` alors que le user dit « les deux, en plus » | Réponse « l'eau est marqué comme fait » ; DB après tour : 1 seule entry (eau `acf36edb`), **entry petit-déj `0ded050c` supprimée**, `Prendre un petit-déjeuner posé` revenu à `current_reps=null`/active | Marqueur additif (aussi/en plus/les deux) bloque le retarget → commit additif ; substitution (« pas X, c'est Y ») → retarget. Jamais invalider une complétion sous marqueur additif | `fix_applied` | P4-A 13/07 — `trackMessageIsAdditive` (router track) : marqueur additif SANS marqueur de substitution ⇒ retarget/correction droppés, commit additif ; triplet unitaire + probe live P4-1 GREEN (2 complétions coexistent, petit-déj intact) | substitution→retarget ; additif→2 commits coexistent ; anti-régression paul-T2 vs additif = effets opposés — **tests unitaires verts + probe P4-1 verte** |
| `NINA-P3REVAL-B02` | T3 | `BF-INTAKE-03` | `track_progress_plan_item` (garde de bascule) + intake | user dit « note que j'ai **aussi** bu … ça compte » → garde `target_switch_ambiguous` demande « en plus ou à la place ? » | ledger requested=2/blocked=1 ; `tool_status=needs_clarify reason=target_switch_ambiguous` ; clarify levée malgré « aussi » | La garde de bascule ne lève une clarify que sans marqueur additif ; « aussi/en plus » → commit additif direct | `fix_applied` | P4-A 13/07 — la garde `target_switch_ambiguous` est court-circuitée par le marqueur additif (commit direct) ; anti-FP : même shape SANS marqueur → clarify conservée (test unitaire) | « fait X » puis « note aussi Y » → 2 commits 0 clarify ; « note Y » sans marqueur → clarify — **tests verts** |
| `NINA-P3REVAL-B03` | T12 | `BF-LEDGER-01` (adjacent) | composeur safety / pipeline réponse | rappel psy bénin demandé en stabilizing : correctement **non committé** (P3-A strict) mais **avalé en silence** — aucun « je le garde pour après » (contrairement au T11 idéation) | ledger tout à 0 (ni committed ni blocked visible pour le rappel) ; réponse = means-removal seul, rappel psy jamais mentionné ; DB 2 pending inchangés | Tout blocage de lane sous safety (idéation ET stabilizing) → accusé de différé honnête sobre, jamais silence | `fix_applied` | P4-C 13/07 — BACKSTOP déterministe dans run.ts (bloc safety) : quand les DEUX LLM ratent la demande (zéro effet émis), `classifyOneShotReminderDirectIntent` re-détecte le create sur le message ⇒ stage `product_tool_boundary` forcé (différé énoncé) + payload conservé dans `__safety_deferred_reminder` | rappel sous safety toute phase → 0 commit + ligne de différé honnête (backstop même si l'émission LLM rate) |
| `NINA-P3REVAL-B04` | T7, T8 | `BF-AGENDA-01` | `coaching_recommendation` (intake technique + composeur) + dispatcher (arbitrage flow collant vs intention mémoire) | T7 : demande « un mot / un déclic » (mot de bascule) → carte de défense substituée sans discrimination. T8 : intention mémoire explicite « garde en tête … travail de nuit » avalée par le flow coaching qui re-pousse la carte 3e fois | T7 owner `coaching_recommendation`, objet « mot » non adressé. T8 owner `coaching_recommendation` reason `active_coaching_recommendation`, memory_plan intent `reflection` (pas acknowledge/store) | Objet/technique demandé accusé + différence motivée ; intention mémoire explicite accusée quel que soit le flow ; anti-répétition intra-flow | `fix_applied` | P4-D 13/07 — les 4 INVALIDES de la vague (alex T5, eva T8, paul T7, nina T7) ancrés verbatim dans le contrat technique_coherence du flow coaching (cas d : le « mot » demandé est NOMMÉ, servi ou écarté avec raison) + règle INTENTION MÉMOIRE pendant flow (accusé d'abord, jamais de 3e re-pitch) | « un mot » → mot de bascule nommé ; « garde en tête X » sous flow → accusé mémoire ; même technique 2 tours → variation — à re-observer en run réel (doctrine) |
| `NINA-P3REVAL-B05` | T14 | `a classifier` (greffe statut de rappel — P3-F « statut jamais greffé non demandé » non tenu) | composeur / final response pipeline (garde anti-greffe de statut) | sortie de crise émotionnelle : la réponse greffe spontanément « Le rappel pour ta diététicienne demain matin est bien là » (non demandé), après un conseil de means-removal | owner `normal_reply` ; aucune demande de statut dans le message user ; statut greffé sur tour sensible | Étendre la garde P3-F « pas de statut de rappel non sollicité » à tous les chemins (sortie safety / normal_reply post-crise inclus) | `fix_applied` | P4-C 13/07 — règle companion (TASK_OVERLAYS) : « Statut de rappel : jamais énoncé spontanément si le user ne le demande pas ce tour — surtout tour émotionnel/sortie de crise » (couvre le chemin normal_reply que la guidance de lane ne voit pas) | tour sans demande de statut → aucun statut de rappel énoncé, quel que soit le owner — à re-observer en run réel (doctrine companion) |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-13 | P3 largement re-validé en réel (P3-A defer/servi/traîne, P3-B demain→J+1, P3-C substitution, P3-E recall/slug/memorizer, P3-F replace/KB abonnement) — sauf B01 | Run réel Nina après probes P3 | QA | rapport §Verdict Global |
| 2026-07-13 | B01 tracé comme **régression introduite par P3-C** (pas un ancien bug) : additif traité comme substitution | L'auto-retarget « dernier commit frais sur autre cible » ne consulte pas le marqueur additif | QA | rapport T4 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-13 | B01 | DB post-T4 : entries pour Nina | 1 entry (eau), petit-déj supprimé, item petit-déj `current_reps=null`/active | rapport T4 |
| 2026-07-13 | B02 | ledger + tool_status T3 | requested=2, blocked=1, `target_switch_ambiguous` | rapport T3 |
| 2026-07-13 | B03 | ledger + DB pending T12 | 0 commit, rappel psy non mentionné, 2 pending inchangés | rapport T12 |
| 2026-07-13 | — (P3-C OK) | DB post-T2 (substitution) | ancienne entry supprimée + nouvelle, 1 complétion, `retarget` correct | rapport T2 |
| 2026-07-13 | — (P3-A OK) | ledger T10/T11/T12 | medium servi (committed=1), idéation blocked `safety_crisis_deferred`, stabilizing 0 commit | rapport T10–T12 |
| 2026-07-13 | — (P3-E OK) | memory_items post-batch scope Nina | 8 items français, féminin, fait « travail de nuit » exact, idéation non persistée, embedding présent | rapport §Memory |
