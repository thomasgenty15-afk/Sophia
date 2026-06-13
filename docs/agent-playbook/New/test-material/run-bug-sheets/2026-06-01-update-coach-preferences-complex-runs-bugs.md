# 2026-06-01 — update_coach_preferences complex runs bugs

## C1-B01

- Tours: explain-then-handoff T1
- Famille: `BF-STATUS-01` — Projection / catalogue produit incomplet ou stale
- Domaine owner: `product_help`
- Source amont: catalogue `coach_preferences` rendu par product_help
- Symptome visible: Sophia explique seulement que les preferences reglent "ton
  global, niveau de challenge et tendance a poser des questions", sans decrire
  ce que chaque reglage fait.
- Preuve systeme: route `product_help`, `reason_code=skill_entry_signal`,
  reponse visible avec ancien texte court; aucun effet durable.
- Correction attendue: product_help doit rendre la description enrichie des
  trois reglages, avec limites `zero emoji` / `trois lignes` non supportees
  comme preferences durables.
- Statut: `open`
- Fix reference: code local ajoute dans `product_help/knowledge.ts`, mais non
  verifie en run reel.
- Tests requis: run product_help reel "ca fait quoi ton/challenge/questions";
  test catalogue; anti-regression no operation.

## C1-B02

- Tours: explain-then-handoff T3, revise-after-explain T2
- Famille: `BF-STATE-01` — Mauvaise transition de flow
- Domaine owner: `update_coach_preferences`
- Source amont: active handoff follow-up classification / explain lifecycle
- Symptome visible: une question de comprehension pendant un handoff actif n'est
  pas rendue comme explication: T3 retourne un raté technique, T2 repete un
  handoff au lieu d'expliquer l'effet combine.
- Preuve systeme: `selected_handler=update_coach_preferences`; T3
  `status=blocked`; T2 `status=revise_handoff`, `user_intent=explain`; aucun
  effet durable.
- Correction attendue: pendant un handoff actif, les questions "ca change quoi",
  "concretement ca fait quoi", "difference entre X et Y" doivent rester dans le
  skill et produire une explication no-mutation en preservant le draft.
- Statut: `open`
- Fix reference: detection locale ajoutee partiellement, mais manque "ca change
  quoi" et le chemin `user_intent=explain` non actif.
- Tests requis: active handoff + "ca change quoi"; active handoff +
  "concretement ca fait quoi X et Y ensemble"; no mutation; state preserve.

## C2-B01

- Tours: unsupported-then-supported T1-T3
- Famille: `BF-ROUTE-03` — Product/status/tool mal priorises
- Domaine owner: dispatcher / orientation clarification /
  update_coach_preferences
- Source amont: arbitrage product_help vs preference handoff pour demandes de
  capacite/limites
- Symptome visible: "zero emoji et trois lignes pour toujours" declenche une
  clarification generique en vouvoiement au lieu d'expliquer que ce n'est pas
  couvert; la suite "moins de questions" sort en normal_reply avec "OK, je fais
  ca" sans transition; "redis-moi quoi changer" redemande une clarification.
- Preuve systeme: T1/T3 `orientation_clarification`, T2 `normal_reply`;
  `executed_tools=[]`, `committed_effects=[]`; DB baseline facts 9 -> after 9.
- Correction attendue: les questions de limites sur preferences coach doivent
  etre resolues par product_help ou `update_coach_preferences` sans
  clarification generique; une demande durable supportee juste apres doit lancer
  le handoff.
- Statut: `open`
- Fix reference: none
- Tests requis: unsupported durable preference question; follow-up supported
  preference after product question; repeat handoff after unsupported/product
  help path.

## C3-B01

- Tours: revise-after-explain T4
- Famille: `BF-STATE-01` — Mauvaise transition de flow
- Domaine owner: active handoff arbitration / update_coach_preferences
- Source amont: repeat/destination follow-up detection
- Symptome visible: "Ou est-ce que je fais ca ?" pendant un handoff actif
  retourne un raté technique au lieu de repeter la destination plateforme.
- Preuve systeme: route `tool_skill`, selected `update_coach_preferences`,
  `status=blocked`, no mutation.
- Correction attendue: "ou est-ce que je fais ca", "ou changer ca", "ou le
  regler" doivent etre traites comme `repeat_handoff` / destination handoff
  no-mutation.
- Statut: `open`
- Fix reference: none
- Tests requis: active handoff + destination question; repeat handoff preserves
  latest revised draft.
