# Bug Sheet — potion_support_admission_20260717_r1

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-17-potion-support-admission-r1.md`

## PSA-B01 — Contrat de sortie du dispatcher local non contraint (branche cancel morte)

- Tour concerné: Run A tour 3 (`presence_continuation`), Run C tour 1 (`first_reply`) — reproduit sur les deux phases et les deux `terminal_reason`.
- Famille: `BF-STATE-01` — mauvaise transition de flow (reducer/dispatcher local).
- Owner runtime: `supabase/functions/sophia-brain/skills/potion_support_admission/local_flow.ts` (SYSTEM_PROMPT + `normalizeDecision`).
- Source amont probable (PROUVÉE par replay réel, même prompt + même modèle, lecture seule) :
  le modèle répond correctement mais hors schéma —
  `{"action":"cancel_campaign","confidence":1.0,"relation":"The user explicitly requests to stop…","terminal_reason":"cancelled_user_boundary"}`
  (`confidence` numérique, `relation` prose anglaise). Le prompt dit seulement
  « Reponds uniquement en JSON: {action,confidence,relation,reason,terminal_reason} »
  sans énumérer les valeurs légales de `confidence` (`low|medium|high`) ni de
  `relation` (`related|session_boundary|campaign_boundary|other`).
  `normalizeDecision` écrase alors en `low`/`other`, et la ceinture default-deny
  (`high` + `campaign_boundary` + `terminal_reason` exigés) dégrade en
  `exit_to_global_dispatcher`. La ceinture n'a pas de tort ; le contrat est cassé
  (leçon P9 : toute ceinture porte sa condition de désarmement — ici la condition
  est structurellement inatteignable).
- Correction recommandée (anti-patching) :
  1. énumérer les valeurs légales des trois champs dans le contrat JSON du prompt ;
  2. coercition déterministe côté serveur des sorties structurellement fiables :
     `confidence` numérique ∈[0,1] → mappée (≥0.75 `high`, ≥0.4 `medium`, sinon `low`) ;
     si `action=cancel_campaign` avec `terminal_reason` valide, la frontière de
     campagne est prouvée par la structure → ne pas exiger l'écho lexical de
     `relation` ;
  3. conserver le default-deny inchangé pour toute sortie réellement incohérente
     (action inconnue, terminal_reason absent).
- Tests d'invariant attendus :
  - fixture rejouant la sortie modèle réelle capturée → `cancel_campaign` committé
    (reminder terminal + créneaux annulés) ;
  - fixture `confidence:0.2` ou `terminal_reason` absent → dégradée en exit, campagne intacte ;
  - re-run réel Runs A et C.
- Statut: fixed (17/07 soir) — prompt: valeurs légales énumérées + coercition déterministe dans `normalizeDecision` (confidence numérique mappée, campaign_boundary déduite de action+terminal_reason, echo session_boundary jamais coercé). Validé en réel run R2 (`2026-07-17-potion-support-admission-r2.md`) sur les deux phases. 6 fixtures unitaires ajoutées dont la capture réelle.

## PSA-B02 — Claim d'arrêt rendu alors que la note d'exit porte `campaign_status=active`

- Tour concerné: Run A tour 3 (« C'est noté : je n'enverrai plus de messages liés à cette potion ») ; forme atténuée Run C tour 1 (« je pars de ça pour la suite »).
- Famille: `BF-LEDGER-01` — claim sans commit.
- Owner runtime: composeur du tour post-exit (chemin `normal_reply` après note `potion_support_admission_v1`).
- Source amont probable: la note d'exit transporte explicitement `campaign_status: "active"` mais rien ne l'oppose au rendu ; le composeur global promet l'arrêt sur la seule foi du message user.
- Correction recommandée: faire de `campaign_status` un verrou de rendu — même famille que les gardes de parité rendu=ledger (P12) : tant que la note n'affiche pas `terminal_committed`, toute formulation d'arrêt de campagne est interdite ; à la place, honnêteté (« je n'ai pas pu arrêter le suivi sur ce tour »).
- Tests d'invariant attendus: note `campaign_status=active` → réponse sans claim d'arrêt ; note `terminal_committed` → claim autorisé et exact ; note `terminal_failed` → formulation d'échec honnête (déjà prévue dans le guidance de la note).
- Statut: fixed (17/07 soir) — la note d'exit non terminale porte `render_constraints: campaign_active_no_stop_claim`; le cas terminal_failed garde son guidance existant. Validé en réel R2 : les claims d'arrêt observés sont tous adossés à `terminal_committed`.

## PSA-B03 — Hors ownership, aucune surface chat ne peut arrêter la campagne (refus confabulé)

- Tour concerné: Run A tour 4.
- Famille: `BF-EFFECT-02` — effet attendu absent.
- Owner runtime: conséquence de PSA-B01 ; décision produit à acter pour le chemin hors-ownership (la lane rappels voit le reminder potion rendu « mini pause du jour » mais refuse la mutation, en contradiction avec l'accusé du tour précédent).
- Correction recommandée: corriger PSA-B01 d'abord (la boundary est alors captée pendant l'ownership). Ensuite, acter explicitement : soit une garde de re-capture (demande d'arrêt potion hors ownership → terminalisation via le même mécanisme), soit un renvoi honnête vers l'app — jamais un refus qui contredit un accusé antérieur.
- Tests d'invariant attendus: demande d'arrêt hors ownership → soit annulation committée, soit réponse honnête sans contradiction ; jamais claim+refus successifs sur la même campagne.
- Statut: closed via PSA-B01 (R2 tour A2-T4 : le tour de vérification post-annulation confirme depuis la DB, plus de refus confabulé). La décision produit « arrêt hors ownership » reste ouverte comme amélioration, non bloquante.
