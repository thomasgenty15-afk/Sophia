# Bug Sheet — paul-p9reval-r1 (2026-07-15)

Run: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-15-paul-p9reval-r1.md`
Verdict global: yellow (0 red). Les invariants P9-A/B/C tiennent en run réel ; les trois bugs
sont des coutures de rendu/projection/intake autour du cycle cancel.

## R1-B01 — Mass cancel committé mais non énuméré au rendu

- Bug id: R1-B01
- Tours: T10
- Famille: `BF-LEDGER-02` (commit réel mal rendu)
- Domaine owner: tool one_shot_reminder (lane mass-cancel) + EffectLedger + composeur
- Source amont: le chemin mass-cancel n'écrit qu'UNE entrée cancel au ledger (label du seul
  item « jeudi 16 juillet à 08:00 ») alors que 3 lignes DB passent à cancelled
  (`mass_cancel_executed` metadata `cancelled_count: 3`). Le composeur n'a pas la liste,
  il rend un pluriel vague + une phrase confuse (« il en reste de toute façon déjà aucun en
  attente ») au lieu d'énumérer + relire l'état restant (attendu P9-B).
- Symptome visible: l'utilisateur ne sait pas ce qui vient d'être annulé ; il doit re-demander (T11).
- Preuve systeme: DB 3/3 cancelled ✓ ; ledger counts committed=1 ; ligne guards `mass_cancel_executed`
  cancelled_count=3 ; transcript T10.
- Correction attendue: porter la cardinalité du mass-cancel au ledger — une entrée committed par
  item annulé (ou une entrée agrégée avec `cancelled_items[]` ids+labels) + directive de rendu
  « mass cancel ⇒ énumération des N items + état restant relu ». Extension du contrat P7-B
  (N commits ⇒ N annoncés) au cancel de masse.
- Statut: open
- Fix reference: —
- Tests requis: (1) positif mass-cancel 3 items ⇒ rendu énumère 3 + état restant ;
  (2) paraphrase (« vire tout ce que je t'ai mis ce matin ») ; (3) anti-FP re-joué
  (« ils sont tous bons, annule juste celui de Xh » ⇒ 1 seul) ; (4) contrat ledger :
  cancelled_count DB == entrées committed (ou longueur cancelled_items).

## R1-B02 — Vérification des annulés : exhaustivité affirmée sur liste tronquée (récidive C3 côté cancelled)

- Bug id: R1-B02
- Tours: T11
- Famille: `BF-STATUS-01` (projection DB mal lue)
- Domaine owner: context loader (projection status rappels)
- Source amont: `supabase/functions/sophia-brain/context/loader.ts:3046-3054` — snapshot des
  one-shot CANCELLED des dernières 24h en `.limit(5)`, tri scheduled_for ascendant, sans
  `count: "exact"`. Avec 6 cancelled, la 6e ligne (pharmacie vendredi 17/07 16:00 UTC) est
  tronquée en silence ; le composeur affirme « exactement ces 5 [...] et aucun autre ».
  Miroir exact du bug C3 (rose-r2 T15, cap silencieux à 5 sur les PENDING, fixé 2026-07-03
  par charge large + count exact) jamais porté à la branche cancelled.
- Symptome visible: réponse de vérification factuellement fausse ; l'utilisateur peut croire
  le rappel vendredi encore actif. Conflate aussi cancels-de-replace et annulations demandées.
- Preuve systeme: DB 6 lignes cancelled ; trace T11 sans aucune mention « 17 juillet » ;
  T12 (question ciblée) répond juste, preuve que seule la projection listée était tronquée.
- Correction attendue: appliquer le fix C3 à la branche cancelled — limite large + `count: exact`,
  et interdiction contractuelle d'affirmer l'exhaustivité si count > liste chargée. Bonus :
  distinguer dans la projection `cancelled_by_user_request` vs `cancelled_by_replace` pour que
  « lesquels tu viens d'annuler » réponde sur le bon sous-ensemble.
- Statut: open
- Fix reference: —
- Tests requis: (1) 6+ cancels en 24h ⇒ énumération complète ou refus d'exhaustivité ;
  (2) mélange replace-cancels + cancels directs ⇒ « viens d'annuler » scoped au tour/à la demande ;
  (3) anti-régression du C3 pending (count exact déjà en place) ; (4) invariant renderer :
  jamais « et aucun autre » quand la projection est plafonnée.

## R1-B03 — « Remets celui des X » sur antécédent annulé : contenu redemandé alors qu'il est résoluble

- Bug id: R1-B03
- Tours: T13 (résolu manuellement en T14)
- Famille: `BF-INTAKE-01` (slot fourni mais redemandé)
- Domaine owner: intake one_shot_reminder (héritage d'instruction / anaphore d'entité)
- Source amont: la résolution d'antécédent (P6-A héritage d'instruction, P10-E « celui du X »)
  semble bornée aux rappels PENDING : après le mass-cancel, « remets-le moi celui des poubelles,
  jeudi matin 8h » ne récupère pas l'instruction du rappel poubelles annulé (présente en DB,
  ligne 1ac0e5fe) et redemande « le texte précis ». L'issue est honnête et non destructive
  (conforme P9-A), mais le slot était résoluble.
- Symptome visible: un tour de friction ; l'utilisateur doit redicter un texte que Sophia connaît.
- Preuve systeme: transcript T13 (clarify, 0 commit) ; DB contient l'instruction du rappel annulé ;
  T14 create committé après slot.
- Correction attendue: étendre la condition d'éligibilité de l'héritage d'instruction aux
  antécédents CANCELLED récents (fenêtre 24h du snapshot) quand l'entité est nommée
  (« celui des poubelles ») et unique ; clarify seulement si plusieurs candidats. C'est la même
  condition d'antécédent résoluble que P9-A, élargie d'un statut.
- Statut: open
- Fix reference: —
- Tests requis: (1) positif : cancel puis « remets celui des X » ⇒ create avec instruction héritée,
  zéro redemande ; (2) ambiguïté : deux rappels annulés proches ⇒ clarify nominatif par item ;
  (3) anti-FP : « remets celui des X » sans aucun antécédent ⇒ clarify/create dégradé actuel
  inchangé (P0-4) ; (4) invariant non-destructif : jamais de replace/cancel d'un pending non lié.

## Notes hors-bug (non comptées)

- T12: émission d'effet parasite sur tour verify finie `blocked` par le gate — comportement
  P8-D voulu (garantie = récupération déterministe), à surveiller seulement si un claim fuit.
- P11: metadata de `mass_cancel_executed` porte `"error_name": "Error"` sur un événement
  d'audit nominal — cosmétique logger à nettoyer à l'occasion.
