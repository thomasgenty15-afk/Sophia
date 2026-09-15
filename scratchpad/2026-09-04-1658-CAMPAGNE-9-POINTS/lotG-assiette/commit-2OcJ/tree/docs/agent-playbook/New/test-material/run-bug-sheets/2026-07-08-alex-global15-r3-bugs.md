# Run Bug Sheet — Alex global15 r3 (2026-07-08)

Rapport associé: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-08-alex-global15-r3.md`

Run: `qa-global15-alex-2026-07-08-r3` — Persona Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`).
Verdict global: **red** (1 red, 1 yellow, 13 green). 15/15 HTTP 200, chemin IA réel local, `force_full_ai=true`.

Objectif du run : valider **en run complet** les correctifs du chantier V4 (08-07) jusque-là seulement testés par probes. Résultat : **4 fixes V4 validés en conditions réelles** (research grounding réel T1/T2, démenti de commit T6, correction same-day T7, technique_coherence T5) + V3-2 event daté au batch (T15). Deux défauts restants ci-dessous.

---

## R3-B01 — Recall d'une décision de session mal-owné vers `product_help` (fausse amnésie)

- Bug id: `R3-B01`
- Tours: **T10** (défaut) ; contre-preuve **T11** (même donnée, owner correct, remonte)
- Famille: **BF-ROUTE-01** (Mauvais owner sélectionné)
- Domaine owner: dispatcher / arbitration d'owner (classification recall-de-session vs question produit)
- Source amont: la phrase « c'était quoi déjà la potion que tu m'avais conseillée tout à l'heure ? » est classée `product_help` (`reason=product_help_signal`). Or c'est un **recall d'une recommandation de session**. Le bloc `DECISIONS DE SESSION` (`sessionDecisionsPromptBlock`, `run.ts`) est injecté dans le contexte **companion/normal_reply**, pas dans le skill `product_help` → l'owner qui répond ne voit jamais `apaisement`. La doctrine V4-3 (« recall/recap depuis la liste, jamais la mémoire libre ») est **contournée par le routage**, pas par la persistance.
- Symptome visible: fausse amnésie — « Je n'ai pas la potion exacte sous la main. Si tu me redonnes juste l'état de ce soir en une phrase, je te dis vite laquelle c'était. » sur une potion recommandée 7 tours plus tôt.
- Preuve système: `response_owner=product_help` (T10) vs `response_owner=normal_reply` (T11, qui cite « la potion apaisement ») ; `__session_decisions` en DB = `{lever:state_potion, potion_type:apaisement}` **présent aux deux tours**. → défaut d'owner, pas de perte d'état.
- Régression: même famille que R2-B02 (BF-ROUTE-01) et que le red nina-r6 B01 (V4-3), ressurgie sous une **formulation de recall naturelle** que le classifieur pousse vers `product_help`. `product_help` continue de capter des intentions non-produit (cf. R2-B02 sur la recherche).
- Correction attendue: le dispatcher doit reconnaître une intention **recall/recap d'une décision de session** (« la potion/carte que tu m'avais conseillée », « c'était quoi déjà… ») et la router vers l'owner companion qui consomme `__session_decisions` — **jamais** `product_help`. Le champ (intent structuré) décide, le routage suit. Aligner sur la doctrine V4-3 et le pattern BF-ROUTE-01. Ne PAS patcher en injectant le bloc décisions dans `product_help` (une vraie question produit sur les potions ne doit pas porter l'état de session) ni en forçant un mot-clé « potion ».
- Statut: `fix_applied` (2026-07-08, chantier V5-4)
- Fix reference: (a) SOURCE, comme demandé — contre-exemple dispatcher (« c'était quoi déjà la potion que tu m'avais conseillée ? » → JAMAIS product_help, skill_signals={}, la réponse vient des décisions de session ; anti-faux-positif: « à quoi sert une potion ? » reste product_help) dans `dispatcher.prompts.ts` ; (b) ceinture (sans déplacer l'ownership): le bloc DECISIONS DE SESSION est injecté dans le runtime_context de tous les skills et le visible product_help a la règle anti-amnésie (répondre depuis le bloc, jamais « je ne peux pas retrouver »). Tests: `dispatcher_prompt_contract_test.ts` (« recall de session n'est jamais product_help »).
- Tests requis:
  - positif: après une reco potion en session, « c'était quoi la potion que tu m'as conseillée ? » → owner companion + réponse `apaisement`.
  - paraphrases: « redis-moi la potion » / « c'était quoi déjà… » / « tu m'avais dit quelle potion ? » → même owner, même valeur.
  - anti-faux-positif: « c'est quoi une potion d'apaisement dans l'app ? » (vraie question produit) → reste `product_help`.
  - régression croisée: le recall d'une carte/technique de session suit le même routage (pas `product_help`).

## R3-B02 — Préférence de style durable réduite à « cette conversation » + fuite de clés internes

- Bug id: `R3-B02`
- Tours: **T12**
- Famille: **BF-PREF-01** (Préférence non appliquée / mal rendue au runtime)
- Domaine owner: skill `feature_opportunity` (branche `coach_preferences`) — politique de portée + rendu
- Source amont: sur un feedback de style explicitement **durable** (« pour la suite et pas juste ce soir / toutes nos prochaines discussions »), la réponse **mène par « Je le fais sur cette conversation »** — la formulation que V4-7 devait supprimer (« zéro `sur cette conversation` sec ») — et **expose des identifiants de registre** au user (`coach.tone / coach.question_tendency`). Le volet « honnêteté version prochaine » n'est pas explicitement porté.
- Symptome visible: « Je le fais sur cette conversation : je serai plus courte et plus directe. Pour que ce style soit réglé durablement, passe par Preferences coach et choisis coach.tone / coach.question_tendency selon ce que tu veux. »
- Preuve système: `response_owner=feature_opportunity`, `reason=coach_preferences_opportunity`, `opportunity_kind=coach_style_feedback`. Progrès vs r2 T15 : le **renvoi vers Preferences coach est présent** (volet 3 acquis). Reste : scope-to-turn en tête + fuite de libellé. Note : le memorizer a par ailleurs persisté la préférence (`statement`/`active`), donc la portée durable existe côté données — le défaut est au **rendu**.
- Correction attendue: ouvrir par la **prise en compte durable** (« je vais l'appliquer, et pour le figer durablement… »), retirer le « sur cette conversation » sec, **décrire** la surface en langage user (« ton » / « tendance à poser des questions ») sans citer `coach.tone`/`coach.question_tendency`. Trois volets V4-7 : application + honnêteté « version prochaine » + renvoi Préférences coach.
- Statut: `fix_applied` (2026-07-08, chantier V5-7)
- Fix reference: `skills/feature_opportunity/visible_agent.ts` — (a) ordre des volets sur demande explicitement durable: APPLICATION d'abord, honnêteté de portée ensuite, interdiction d'OUVRIR par la limitation (« je le fais sur cette conversation » en 1re phrase) ; (b) clés internes (`coach.tone`, `coach.challenge_level`, `coach.question_tendency`) déclarées INTERNES, jamais écrites dans un message visible — langage utilisateur imposé.
- Tests requis:
  - positif: feedback de style « pour la suite » → réponse ouvre sur la prise en compte durable, pas de « sur cette conversation » sec.
  - langage: aucune occurrence de `coach.tone` / `coach.question_tendency` (ni autre clé de registre) dans le texte user-facing.
  - anti-faux-positif: feedback ponctuel explicite (« juste pour ce message ») → là le scope-turn est légitime.

---

## Notes de validation (fixes V4 confirmés en run réel — pas des bugs)

- **V4-1 research grounding (T1/T2)** : vrai fetch Gemini (`llm_raw_response_events` : `attempt_start`→`success`, 13-16s), bloc « RECHERCHE WEB » injecté, réponses groundées sans hallucination, étude 2025 réelle nommée. Owner `normal_reply` stable (fin de R2-B02 côté recherche). Réserve cosmétique : sources non affichées malgré « du sourcé » (T1).
- **V4-4 démenti de commit (T6)** : complétion committée → rendu positif, zéro démenti (régression r2 T9 morte). DB reps 1→2.
- **X1/V4-2 correction same-day (T7)** : `correction:true` → supersede de l'entry `completed`, revert reps 2→1, rendu honnête « marqué comme raté », aucune entry contradictoire.
- **V4-5 technique_coherence (T5)** : forçage « courage » → `forced_mismatch`, doute + options, décision de session non écrasée.
- **V4-3 décisions de session** : `__session_decisions` correctement écrit et lisible par l'owner companion (T11) — seul le routage T10 échoue (R3-B01).
- **V3-2 event daté (T15, batch)** : fait futur → event `active`, `event_start_at=2026-07-26 00:00 Europe/Paris`, `time_precision=day`. Anti-fossilisation OK (états transitoires T3/T5 non persistés).
- **Environnement** : `trigger-memorizer-daily` local a complété **sans 502** ce run (contrairement à r2) — persistance batch vérifiée.
- **Hygiène** : état durable entièrement réinitialisé et re-vérifié (memory_items 9, sas 1/3, 0 reminder, scope vide).
