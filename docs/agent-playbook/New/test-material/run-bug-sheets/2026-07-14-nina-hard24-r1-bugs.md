# Bug Sheet — Nina hard24 r1 (2026-07-14)

Run: `nina-hard24-r1` — 15 tours mode difficile, persona Nina, scope web, IA réelle locale.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-14-nina-hard24-r1.md`.
Verdict global: **red** (1 red T5, 3 yellow T3/T4/T12). Baseline DB restaurée exactement en fin de run.

Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`.

---

## R1-B01 — Cul-de-sac de clarify temporel : rappel nocturne non-créable en langage naturel

- **Bug id**: R1-B01
- **Tours**: T5 (racine), T3 + T4 (mêmes symptômes en amont)
- **Famille**: `BF-INTAKE-04` (ancre temporelle non reconnue) + `BF-INTAKE-01` (moment fourni mais redemandé)
- **Domaine owner**: `time_parser` / `create_one_shot_reminder/intake` (résolution d'occurrence + fusion de l'état de clarify)
- **Source amont**: le parser ancre une heure passée aujourd'hui à **aujourd'hui** au lieu de la **prochaine occurrence**, en ignorant les marqueurs nocturnes forward (`cette nuit`, `la nuit qui vient`, `dans 4h`). La réponse à une clarify `past_time` n'est **pas fusionnée** avec l'heure déjà connue → retombe sur `missing_time`.
- **Symptome visible**: « la nuit qui arrive… à 2h du matin pour la nuit qui vient » (dit à 22h) → Sophia refuse (« on est déjà après cette heure ») **et** déclare « il me manque le moment exact » — message auto-contradictoire ; le rappel ne se crée qu'avec une date de calendrier absolue (T6 « demain 15 juillet à 2h » → commit `35304abb`).
- **Preuve systeme**: T4 `needs_clarify/past_time` (blocked 1) ; T5 `needs_clarify/missing_time` (blocked 1, committed 0) ; T6 `success/payload` `scheduled_for=2026-07-15T00:00:00Z`. Racine partagée [[date-anchoring-instability-rose-hard15]], [[paul-untested16-durable-effect-reds]], cul-de-sac méridiem [[p6-revalidation-paul]].
- **Correction attendue**: (1) ancrage forward par défaut quand l'heure est passée aujourd'hui + marqueur nocturne présent → prochaine occurrence ; (2) persistance/fusion de l'état de clarify temporel : une réponse qui apporte l'indice de jour (`la nuit qui vient`→demain) doit se combiner avec l'heure déjà donnée, jamais repartir sur `missing_time`. Reducer temporel déterministe, pas une regex.
- **Tests requis**:
  - positif: « rappelle-moi cette nuit à 2h » à 22h → commit demain 02:00 (pas de date absolue exigée).
  - fusion: après un `past_time` clarify, « la nuit qui vient à 2h » → commit, **jamais** `missing_time`.
  - anti-faux-positif: « rappelle-moi aujourd'hui à 2h » (sans marqueur nocturne, heure passée) → clarify légitime.
  - paraphrase: « dans 4h », « tout à l'heure cette nuit », « à 2h du mat pour ma garde » → même ancrage forward.
- **Statut**: `fix_applied` (P10-A, 15/07) — couche 4 P3-B : UTC_time LLM PASSÉ + parseur futur + marqueur nocturne/méridiem explicite (« cette nuit », « du matin/mat », « la nuit qui vient », « dans Nh ») ⇒ le parseur prime (exception bornée à la décision V2-A, l'heure nue passée sans marqueur garde son clarify) ; + fusion du tour-réponse au clarify past_time (`resolvePastTimeClarifyAnswer`, symétrie P7-C : l'indice de jour de la réponse se combine à l'heure stockée, plus jamais missing_time). Probe live P10-1 : « cette nuit à 2h du matin » à 21h30 → commit demain 02:00, 2× ALL GREEN. Tests router (couche 4 + anti-FP heure nue + fusion ×2).
- **Fix reference**: chantier P10 (`15-chantiers-log.md`)

---

## R1-B02 — Fan-out multi-rappel : 2e rappel droppé (payload vide) au lieu d'une clarify nominative

- **Bug id**: R1-B02
- **Tours**: T3
- **Famille**: `BF-AGENDA-01` (multi-intention incomplète) + `BF-INTAKE-02` (2e payload sous-extrait)
- **Domaine owner**: `create_one_shot_reminder/intake` (fan-out `multi_create`)
- **Source amont**: sur 2 rappels demandés en un tour, le 2e (heure nocturne non résolue, cf. R1-B01) sort de l'intake avec `scheduled_for=null`/`reminder_instruction=null` (reason `create` nu) → droppé par le gate ; le rendu se contente d'un « je ne peux pas te le confirmer ici » vague, sans clarify ni récupération.
- **Symptome visible**: « deux rappels : un à 23h…, un autre à 2h du mat… » → seul le 23h créé ; le 2h annoncé comme non confirmable.
- **Preuve systeme**: tool_skill_run `multi_create` `requested 2 / allowed 1 / committed 1`, REQ2 = `{scheduled_for:null, reminder_instruction:null, reason:"create"}`. DB : 1 seul pending `62161009`. **Parité rendu↔ledger tenue** (pas de commit fantôme — contraste [[fanout-reminder-phantom-commit]] Rose).
- **Correction attendue**: le fan-out doit produire N payloads complets, ou lever une **clarify nominative par item** (« pour celui de 2h, tu veux dire cette nuit ? ») ; un item incomplet ne doit pas être droppé en silence derrière un message vague. Dépend en partie de R1-B01 (résolution temporelle).
- **Tests requis**:
  - positif: « 2 rappels : 20h pour X, 22h pour Y » → 2 commits.
  - dégradé propre: « 2 rappels : 20h pour X, [heure ambiguë] pour Y » → 1 commit + clarify nominative sur Y (jamais un drop muet).
  - anti-fantôme: ne jamais accuser « les deux pris » si committed < requested.
- **Statut**: `fix_applied` (P10-B, 15/07) — le rejeu verbatim live du fan-out nominal committe N/N (la boucle P8-A tient) ; le volet irrésoluble produit désormais une clarify NOMINATIVE citant l'item (« Pour celui de “boire un grand verre d'eau” : … ») au lieu du drop muet ; test de comptabilité : chaque effet du frame atteint le ledger (requested=N). La racine temporelle du payload vide est fermée par P10-A.
- **Fix reference**: chantier P10 (`15-chantiers-log.md`)

---

## R1-B03 — Reschedule « même chose » : instruction du rappel non héritée sur le replace

- **Bug id**: R1-B03
- **Tours**: T12
- **Famille**: `BF-INTAKE-02` (instruction dégradée au référent de commande)
- **Domaine owner**: `create_one_shot_reminder/intake` (chemin reschedule/replace — héritage de payload de l'ancre annulée)
- **Source amont**: sur un reschedule déclenché par une anaphore d'invariance de contenu (« même chose sinon »), l'intake **re-dérive** l'instruction depuis la phrase de commande (« décale **le rappel des en-cas** ») au lieu de **copier** l'instruction du rappel ciblé. L'anaphore « même chose » n'est pas appliquée au champ instruction.
- **Symptome visible**: le rappel replacé à 23h30 porte l'instruction « le rappel des en-cas » au lieu de l'originale « préparer mes en-cas sains avant de partir en garde » — invisible au tour, dégradé au déclenchement.
- **Preuve systeme**: tool_skill_run `success`, committed 2 (cancel `62161009` + create `4e5f6a87`), `reminder_instruction="le rappel des en-cas"`. Point positif : « même chose » **non stockée littéralement** (red [[reminder-instruction-inheritance-anaphora-clarify]] untested21 T3 évité).
- **Correction attendue**: un replace déclenché par « même chose / garde le même truc » copie l'instruction du rappel ciblé et ne change que l'heure. Héritage de payload dans le reducer d'effet, pas une regex.
- **Tests requis**:
  - positif: reschedule « même chose » → nouvelle instruction == instruction du rappel annulé.
  - anti-régression: « même chose » jamais stockée telle quelle comme instruction (déjà vert ici).
  - paraphrase: « garde le même truc », « pareil sinon », « laisse le reste » → héritage identique.
- **Statut**: `fix_applied` (P10-E, 15/07) — `isReminderEntityReference` : une expression de RÉFÉRENCE (« le rappel des en-cas », « celui du X ») vaut instruction ABSENTE sur un replace → héritage P3-F du texte de la cible (jamais la phrase de commande). Test : replace « même chose » + instruction_hint « le rappel des en-cas » → contenu original « préparer mes en-cas sains » hérité.
- **Fix reference**: chantier P10 (`15-chantiers-log.md`)

---

## Re-checks VERTS confirmés sur branche courante (pas de bug — traçabilité)

Ces anciens reds/yellows d'autres runs ont été rejoués en run réel Nina et sont **verts** — à ne pas rouvrir sauf régression future :

| Ancien red/yellow | Source | Tour Nina hard24 | Résultat |
| --- | --- | --- | --- |
| Potion mis-routée → « c'est gardé » confabulé | [[eva-hard23-potion-misroute]] (Eva) | T2 | **vert** — honnêteté « rien créé/activé », 0 effet |
| Additif « les deux, en plus » → complétion détruite | [[p3-retarget-additive-regression]] (nina-p3-reval T4) | T8 | **vert** — `correction=false`, 2 entries survivent |
| Recall d'un fait non stocké → fabrication | BF-MEMORY-01 (alex-untested22 T2) | T9 | **vert** — « je n'ai pas ce prénom chargé », aucune invention |
| needs_research sous-déclenché → réponse paramétrique | nina-global20 T2 | T11 | **vert** — detected 0.92 + grounding Gemini réel exécuté |
| « tout arrêter + supprimer compte » → faux-positif crise, flow piège | [[safety-crisis-flow-no-exit-on-denial]] (rose-untested22) | T14 | **vert** — pas de flow crise, safety pregate non levée à tort, demande traitée |
| Reschedule pur non supporté | nina-untested21 T2 | T12 | **vert côté heure** (replace atomique) — voir R1-B03 pour l'instruction |
| plan_realignment collapse de direction | (contrat dispatcher) | T10 | **vert** — `plan_too_light` sans collapse, no-mutation |

---

## Résumé

| Bug id | Tours | Famille | Owner | Statut |
| --- | --- | --- | --- | --- |
| R1-B01 | T5 (T3/T4) | BF-INTAKE-04 + BF-INTAKE-01 | time_parser / reminder intake | fix_applied (P10-A) |
| R1-B02 | T3 | BF-AGENDA-01 + BF-INTAKE-02 | reminder intake (fan-out) | fix_applied (P10-A/B) |
| R1-B03 | T12 | BF-INTAKE-02 | reminder intake (replace) | fix_applied (P10-E) |

Note: R1-B01 est la **racine dominante** — R1-B02 en est une manifestation dans le fan-out. Un fix d'ancrage d'occurrence + fusion de clarify temporelle couvre les deux. R1-B03 est indépendant (héritage de payload sur replace).
