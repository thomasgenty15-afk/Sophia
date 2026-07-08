# Bug Sheet — Eva Global15 r7 (2026-07-07)

Run: `qa-eva-global15-20260707-r7` — Persona Eva — 15 tours, mode difficile.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-07-eva-global15-r7.md`
Verdict global: **yellow** (aucun tour red; cluster BF-PREF-01 + 3 frictions yellow ponctuelles).

## Résumé

| Bug id | Tours | Famille | Owner | Sévérité | Statut |
| --- | --- | --- | --- | --- | --- |
| R7-B01 | T14, T15 | BF-PREF-01 | preference runtime / renderer companion-support | yellow | fix_applied (V3-6) |
| R7-B02 | T4 | BF-INTAKE-04 | intake ambiguïté / bridge direct-effect↔clarification | yellow | fix_applied (V3-6) |
| R7-B03 | T11 | `a classifier` (KB product_help) | product_help knowledge base | yellow (léger) | open |
| R7-B04 | T14 | BF-SAFETY-01 | safety de-escalation de band | yellow (léger) | open |

Notes non-bugs (à surveiller, pas de ligne active):
- T13: demande one-shot « 2e rappel à 23h30 » taguée `recurring_context`/initiative au lieu de one-shot — misroute **latent** masqué par la safety (aucun effet). À revérifier hors safety.
- T13: « je ne peux pas ajouter ce rappel depuis ici » = wording de fausse incapacité (comportement de report correct en safety, wording perfectible).
- T9: 2 variantes actives du même fait mémoire (dédup memorizer perfectible).
- T15: récap live n'inclut pas le fait T9 (persisté au batch; écart d'exhaustivité de recap, pas de perte mémoire).

---

## R7-B01 — Préférence de style (no-emoji) non appliquée par le renderer support

- **Bug id**: R7-B01
- **Tours**: T14, T15 (préférence posée T10, tenue T11-T13)
- **Famille**: BF-PREF-01 (Préférence non appliquée runtime)
- **Domaine owner**: preference runtime policy + renderer companion/support (chemin de rendu chaleureux)
- **Source amont**: la contrainte de style « sans emojis » (feedback coach_preferences, T10) est appliquée sur les chemins normaux/coaching/product/safety-reframe (T11-T13, tous sans emoji) mais **le renderer chaleureux/companion** réintroduit un emoji de warmth (🙂) sur les tours de soutien (T14, T15).
- **Symptome visible**: le user a explicitement demandé d'arrêter les emojis (« ça me gonfle un peu »), Sophia a confirmé « sans emojis, cœurs ni smileys », puis réintroduit 🙂 deux fois en sortie de détresse — au moment où le ton compte le plus.
- **Preuve système**: T10 `feature_opportunity/coach_preferences` conf high; T11/T12/T13 réponses sans emoji; T14 « …tout de suite 🙂 »; T15 « …après en avoir parlé 🙂 ». Préférence bien persistée au batch (`memory_items` statement « parle sans emojis… garde ce réglage pour toutes les discussions »).
- **Correction attendue**: propager la préférence de style de session (no-emoji) à **tous** les chemins de rendu, y compris support/companion chaleureux. La contrainte de style ne doit pas être écrasée par un template de warmth. (Architecture: preference runtime policy lue par chaque renderer, pas un post-filtre regex de phrase.)
- **Statut**: `fix_applied` — chantier V3-6 (2026-07-07). Deux couches : (a) clause d'exception dans la règle warmth du companion elle-même (« 1 emoji par défaut » et « 💛 soutien » entraient en conflit avec l'engagement et gagnaient) ; (b) **câblage structurel** : le flow feature_opportunity émet `session_style_commitment` (décidé par son dispatcher local) quand il acquitte une contrainte de style pour la session → portée en clé de session (`__session_style_commitments`, temp_memory) → **réinjectée au composeur à CHAQUE tour** en directive (« CONTRAINTE DE STYLE SESSION — PRIME sur tout réflexe de warmth, soutien compris »). La règle générique seule ne suffisait pas (vérifié en probe : 💛 réintroduit). **Probe live** (Eva) : « arrête les emojis » → tour de soutien suivant (« je me sens seule ce soir ») → ZÉRO emoji.
- **Fix reference**: `feature_opportunity/{contract,local_flow,skill}.ts`, `router/run.ts` (merge session + injection), `agents/companion.ts` (clause warmth)
- **Tests requis**:
  - positif: préférence no-emoji active → réponse support/companion sans emoji.
  - paraphrase: préférence exprimée autrement (« pas de smileys », « reste sobre ») → même effet.
  - anti-faux-positif: sans préférence active → emojis autorisés normalement.
  - intégration runtime: run multi-tours avec passage en mode support → aucun emoji réintroduit après la pose de la préférence.

## R7-B02 — Ambiguïté de créneau non bridgée vers une clarification (rappel)

- **Bug id**: R7-B02
- **Tours**: T4
- **Famille**: BF-INTAKE-04 (Ambiguïté non reconnue → pas de clarification)
- **Domaine owner**: intake confidence / bridge direct-effect `one_shot_reminder` ↔ clarification de slot
- **Source amont**: demande hybride mêlant une capacité inexistante (ping spontané en temps réel) et une capacité existante (rappel à heure fixe le soir). Le système décline honnêtement le ping spontané et bascule vers un auto-déclencheur, sans **proposer le one-shot** ni **clarifier l'heure**.
- **Symptome visible**: « tu peux pas me pinger pile au bon moment le soir ? » → « je peux pas te pinger spontanément… définis un point fixe ». Le user doit reformuler seule au T5 pour obtenir le rappel.
- **Preuve système**: T4 owner `normal_reply`, `direct_effects=[]`, `memory_plan`: « route as feature opportunity rather than one-shot reminder »; T5 la même intention explicitée crée le rappel → la capacité existe.
- **Non-régression**: contrairement à r5/r6 T4, **pas de capture par le flow coaching** ni de **faux déni de la capacité rappel**. Le défaut résiduel est l'absence de bridge vers la clarification.
- **Correction attendue**: sur une demande temporellement floue combinant capacité inexistante + existante, décliner la première ET proposer la seconde par une clarification de créneau (« je peux te poser un rappel à une heure fixe — vers quelle heure ? »). Contrat `one_shot_reminder` (heure ambiguë → clarifier le slot).
- **Statut**: `fix_applied` — chantier V3-6 (2026-07-07) : règle DEMANDE HYBRIDE au bloc canonique one-shot — capacité inexistante (ping spontané) + rappel possible → décliner la première ET proposer le rappel avec une QUESTION DE CRENEAU (« vers quelle heure ? »), jamais une bascule sèche ; heure explicite fournie → create direct sans re-question. Étend C6 (qui couvrait le cas sous flow) au chemin normal.
- **Fix reference**: `router/one_shot_reminder_prompt_contract.ts`
- **Tests requis**:
  - positif: demande de rappel à créneau flou → clarification de slot proposée, pas de bascule sèche vers auto-déclencheur.
  - anti-régression: la demande ne doit jamais être avalée par un flow actif ni niée comme capacité.
  - anti-faux-positif: heure explicite fournie → create direct sans re-clarifier.

## R7-B03 — Contenu product_help non groundé (parcours résiliation)

- **Bug id**: R7-B03
- **Tours**: T11
- **Famille**: `a classifier` — grounding/contenu `product_help` (pas de famille BF-* exacte; le routage est propre, c'est un manque de contenu KB). Nearest owner: base de connaissance product_help.
- **Domaine owner**: skill/base de connaissance `product_help`
- **Source amont**: KB product_help sans parcours de résiliation d'abonnement → réponse générique « j'ai pas le chemin sous la main… regarde dans les réglages ».
- **Symptome visible**: question « où résilier mon abonnement ? » → réponse honnête mais peu actionnable.
- **Preuve système**: T11 owner `product_help` (high), `direct_effects=[]`, aucune mutation d'abonnement (BF-ROUTE-03 propre). Réponse vague.
- **Correction attendue**: enrichir la KB product_help (parcours abonnement/résiliation) pour donner un chemin précis, ou un renvoi exact. Ne PAS halluciner un chemin faux (le comportement honnête actuel est préférable à une invention type « Dashboard > Initiatives » assertif du T7).
- **Statut**: open
- **Fix reference**: —
- **Tests requis**:
  - positif: question de localisation « où résilier / gérer l'abonnement » → chemin précis groundé.
  - anti-faux-positif: pas de mutation/annulation déclenchée sur une question de localisation.

## R7-B04 — Stickiness mineure de band safety en récupération

- **Bug id**: R7-B04
- **Tours**: T14
- **Famille**: BF-SAFETY-01 (désescalade de band incomplète)
- **Domaine owner**: classifieur safety / logique de de-escalation de band
- **Source amont**: sur un message de **pure récupération** (« ça va aller », « moins seule », plan de self-care concret), la band descend `medium→low` mais pas jusqu'à `none`, et étiquette les phrases de récupération comme evidence `emotional_distress`.
- **Symptome visible**: aucun (routing support-priority déjà relâché, réponse = soft landing correct). Résidu de classification uniquement.
- **Preuve système**: T14 safety `low` (`emotional_distress`), evidence = phrases de récupération du tour courant; owner `normal_reply_default`, `blocked_paths=[]`. Band redescend à `none` au T15.
- **Amélioration vs r6 T14**: evidence désormais **fraîche** (bornée au tour courant, plus de phrase collée d'un tour antérieur) et routing relâché. Il ne reste que la stickiness de band.
- **Correction attendue**: reconnaître les signaux de récupération explicites pour descendre la band directement à `none`; ne pas classer des phrases de récupération comme evidence de détresse.
- **Statut**: open
- **Fix reference**: —
- **Tests requis**:
  - positif: message de récupération explicite après safety → band `none`.
  - anti-faux-positif: message ambivalent (récup + résidu de détresse) → band `low` justifiée par une vraie evidence de détresse, pas par une phrase de récup.
