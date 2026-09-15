# Flow « Présence » (mode ami) — design verrouillé + plan de mise en place

Date: 2026-07-09. Origine: conversation nocturne du 09/07 (user f3bd26a5, sujet
intime) où coaching_recommendation a sur-poussé potion/carte pendant que le user
voulait seulement discuter — comparée à une conversation ChatGPT jugée très
supérieure (présence, miroir des faits du user, nuance honnête, zéro produit).

## 1. Principe

Un flow local à part entière (`presence_conversation`), collant, dont le métier
est d'être présent sur les discussions de fond. Le produit n'y est pas poussé:
il se surface uniquement sur traction explicite du user (pull), une fois.

**Inversion du défaut**: sur un sujet de fond, la conversation est le mode
normal et l'outil l'exception — aujourd'hui l'architecture fait l'inverse.

## 2. Décisions actées

- **Poubelle, pas pause**: si un flow coaching est actif au moment de l'entrée,
  il est fermé définitivement (pas d'état parqué à ré-injecter — trop complexe,
  et son contexte serait périmé de toute façon).
- **Exit uniquement vers le dispatcher global** (charte anti-patching, cmd 17):
  jamais de handoff direct flow→flow. Quand le user accepte un outil, le flow
  présence se ferme et le tour est re-routé globalement; c'est coaching qui,
  en entrant, re-synthétise son contexte depuis la conversation courante.
- **Entrée conservatrice** (règle des deux tours, voir §4).
- **Offre unique** sur pivot_action; outil refusé/ignoré = plus jamais ré-offert
  dans cette instance du flow, sauf re-mention explicite par le user.
- **Expiration**: 6h d'inactivité OU changement de jour local (premier atteint).
- **Zéro regex métier** pour entrée/sortie/pivot: tout passe par les signaux
  sémantiques du dispatcher (charte cmd 0/14).

## 3. Signaux dispatcher (nouveaux)

`turn_frame.skill_signals.presence_conversation`:

- `detected` + `confidence_band` — définition: sujet lourd/intime/personnel
  + intention discursive (déposer, explorer, raisonner) + AUCUNE demande
  d'action, d'outil ou de produit dans le tour.
- `kind` (pendant le flow): `maintain` | `pivot_action` (le user bascule vers
  « concrètement je fais quoi / une technique ? ») | `closure` (clôture
  naturelle) | `topic_change` (pivot net vers un autre sujet/tâche).

Anti-faux-positifs écrits DANS le prompt dispatcher: sujet lourd + demande
explicite d'outil ≠ presence; coup de blues isolé d'une ligne ≠ presence
(confidence basse); question produit ≠ presence.

## 4. Entrée (dure à ouvrir)

- Signal `high`/`critical` (message long, vulnérable, récit personnel) →
  entrée immédiate.
- Signal `medium` → pas d'entrée; normal_reply répond. Si le signal se répète
  au tour suivant (`candidate_since` posé dans l'état) → entrée.
- Verrous durs (jamais d'entrée si): safety ≥ medium (la préemption détresse
  de routers.ts reste au-dessus), confirmation en attente, onboarding actif,
  demande explicite de feature dans le tour, weekly review active.
- À l'entrée: tout flow conversationnel actif (coaching, product_help…) est
  fermé (poubelle).

## 5. Maintien

Le dispatcher tourne à chaque tour (safety, direct_effects, signaux) mais ne
re-choisit pas l'owner: branche `continue_active` dans routers.ts comme les
autres flows. Les tours ambigus (« oui mais comment ? », « ? ») ne sortent
JAMAIS.

**Parenthèse tâche** (pas une sortie): une demande d'effet direct (rappel,
coche de progression) est exécutée par la voie des effets directs normale
pendant que le flow reste actif — même mécanique que
`active_coaching_recommendation_with_direct_effects`. Une question factuelle
courte (statut d'action) est répondue dans le tour sans fermer le flow.

## 6. Sorties (toutes vers le dispatcher global)

| Sortie | Déclencheur (signal sémantique) | Comportement |
|---|---|---|
| Safety | pregate/préemption existants | immédiate, structurelle, inchangée |
| Pull produit | user accepte/demande un outil | flow fermé (`closed:tool_pull`), tour re-routé globalement → coaching entre avec un contexte re-synthétisé par LUI |
| Topic change | `kind=topic_change` | flow fermé (`closed:topic_change`), routing global |
| Clôture | `kind=closure` | flow fermé (`closed:natural`); ré-entrée rapide (sans règle des 2 tours) si le user revient en mode discussion dans les 2h |
| Expiration | 6h inactivité ou changement de jour local | fermeture silencieuse au tour suivant, avant routing |

Collant contre le flou, transparent à l'explicite (charte cmd 9): une intention
explicite nouvelle traverse toujours.

## 7. Garantie anti-poussée (structurelle, pas par règle)

Le prompt du mode présence NE CONTIENT PAS le catalogue produit (pas de
potions/cartes/reco/dashboard capabilities/surface opportunities). Le modèle ne
peut pas pousser ce qu'il ne voit pas.

Sur `pivot_action` uniquement: injection d'une mini-fiche d'UN outil (réutilise
les entrées `product_guidance` du catalogue coaching), consigne = protocole
concret d'abord en langage courant, puis UNE phrase conditionnelle d'offre
(comportement décrit, pas gabarit à trous — charte cmd 13). Offre enregistrée
dans l'état (`offers[]`); jamais ré-injectée pour le même outil sauf re-mention
explicite du user.

## 8. Contexte & génération

Injecté à fond:
- transcript intégral depuis l'entrée + les tours qui ont déclenché l'entrée
  (plafond tokens avec résumé de tête en cas de débordement);
- mémoire V2 budget large (l'histoire du user est la matière du miroir);
- état momentum (l'arc);
- identité user + facts de style coach;
- **outcome des effets du tour courant** (contrat total `effects_outcome` —
  charte cmd 15/16: si un rappel est commité en mode présence, le renderer
  doit pouvoir le confirmer honnêtement; on ne strip pas ça).

Retiré: les ~40 règles produit, dashboard capabilities, surface opportunity,
résumés d'effets durables « marketing », catalogue features, reco active.

Prompt court (mandat de présence): valider en profondeur MAIS nuancer
honnêtement; refléter les faits du user (ses victoires, son historique) plutôt
que des généralités; nommer l'évolution; poser UNE vraie question qui creuse
quand le user se livre; longueur à la hauteur du message; style de base
(tutoiement, Sophia au féminin, pas d'internals, pas de claim sans effet
commité).

Modèle: tier `deep` forcé (agent_model_selection.ts —
`SOPHIA_COMPANION_MODEL_DEEP`), génération via l'agent companion (pas de gros
visible agent bespoke).

## 9. Plan de mise en place (phases)

### Phase P0 — Contrats & signaux dispatcher
Fichiers: `contracts/turn_frame.v1.ts`, `contracts/route_decision.v1.ts`,
`dispatcher/dispatcher.prompts.ts`, `dispatcher/dispatcher.v2.ts`.
1. Ajouter `skill_signals.presence_conversation` au contrat turn_frame
   (detected, confidence_band, kind) + normalisation dans dispatcher.v2.
2. Ajouter `presence_conversation` aux owners de route_decision.
3. Prompt dispatcher: définition du signal + kinds + anti-faux-positifs
   (exemples positifs/négatifs).
4. Tests: normalisation, contrat, cas dispatcher (signal fort/moyen/absent,
   pivot_action, closure, topic_change, anti-faux-positifs).

### Phase P1 — Squelette du skill (machine à états pure)
Fichiers: `skills/presence_conversation/{contract.ts,local_flow.ts,skill.ts}`,
`routers.ts`, registre des skills.
1. `contract.ts`: état du flow — `{version, status, entered_at, entry_reason,
   turns_in_flow, candidate_since, offers: [{feature, at_turn, outcome}],
   last_activity_at, local_date, closed_reason}`. Stockage via le même
   mécanisme `active_skill_state` que les autres skills.
2. `local_flow.ts`: transitions PURES et testées — enter (immédiat/2 tours),
   maintain, parenthèse tâche, offer (pivot_action), close (tool_pull /
   topic_change / natural / expired). Aucune génération ici.
3. `routers.ts`: (a) branche `continue_active` pour presence (même pattern que
   coaching, lignes ~385-403); (b) gating d'entrée après la préemption détresse
   et avant les flows produits; (c) fermeture des flows actifs à l'entrée.
4. Sortie même-tour: reproduire le pattern d'exit d'un flow existant
   (weekly_review/plan_realignment) — le flow marque `closed` et le tour est
   re-routé par le dispatcher global (cmd 17). Investiguer le pattern exact en
   début de phase.
5. Tests unitaires de toutes les transitions (dont: refus d'entrée sous
   confirmation pendante; expiration; ré-entrée rapide post-clôture).

### Phase P2 — Génération (contexte, prompt, modèle)
Fichiers: `skills/presence_conversation/visible_prompt.ts` (léger),
`context/loader.ts` (profil ou options dédiées), `router/run.ts` (branchement
owner→génération), `agent_model_selection.ts` (rien à coder: hint `deep`).
1. Assemblage contexte présence: transcript complet depuis entrée (+ tours
   déclencheurs), memory_plan forcé large, momentum, identité; PAS d'addons
   produit. Garder l'injection `effects_outcome` du tour courant.
2. Prompt mandat de présence (court) + règles de style de base.
3. Mini-fiche d'offre injectée seulement sur pivot_action (réutilise
   product_guidance), enregistrement dans `offers[]`.
4. Modèle: model_tier_hint forcé `deep` pour ce owner.
5. Tests: composition du prompt (présence/absence des blocs selon l'état),
   offre-unique (2e pivot_action sur même outil → pas de fiche).

### Phase P3 — Effets directs & honnêteté des claims
1. Vérifier (test) qu'un `create_one_shot_reminder` passe en mode présence par
   la voie normale et que le renderer reçoit l'outcome (`committed`) — pattern
   identique au rappel créé dans coaching le 09/07 03:35.
2. Vérifier qu'un effet bloqué produit un outcome visible (cmd 15/16), pas un
   claim inventé.

### Phase P4 — Fin de vie & observabilité
1. Expiration (6h/jour local) évaluée avant routing quand le flow est actif.
2. Traces: `skill_run` porte enter/maintain/offer/close+raison;
   `active_flow_arbitration` rempli comme pour les autres flows. Événement
   d'observabilité par transition (pattern momentum observability).
3. Entrée dans `15-chantiers-log.md` + familles BF-* (routing/intake).

### Phase P5 — Tests bout-en-bout & QA
1. Replay étalon: la conversation du 09/07 via le test harness
   (`test_harness/conversation_route_replay`) — attendus: entrée à 03:09,
   maintien sur « Oui mais comment on fait ça ? », UNE offre potion au premier
   pivot, silence produit ensuite, parenthèse rappel OK, sortie tool_pull sur
   « Ok vas y » carte.
2. Paraphrase + anti-faux-positif + mini-run multi-skill (cmd 11).
3. Run QA staging (cadre staging-test/README.md) avec persona, rapport
   structuré.
4. Rollout: flag `SOPHIA_PRESENCE_FLOW_ENABLED` (défaut off), staging on,
   `SOPHIA_COMPANION_MODEL_DEEP` configuré (secret posé par le requester).

### Chantier connexe (famille séparée, PAS couvert par ce flow)
Intake coaching_recommendation: re-synthétiser `difficulty_summary` depuis la
conversation courante à l'entrée du flow quand le sujet a pivoté (bug « peur de
craquer » du 09/07 03:16). À traiter dans coaching, indépendamment.

## 10. Conformité charte anti-patching (mapping)

- Cmd 0/14: entrée/sortie/pivot = signaux sémantiques dispatcher, zéro regex.
- Cmd 1/2/3: owner dédié pour une famille (discussions de fond) aujourd'hui
  sans owner; fix amont (routing/arbitrage), pas garde aval.
- Cmd 4/6: logique dans le skill; dispatcher oriente, skill décide, executor
  écrit, renderer parle.
- Cmd 9: collant contre l'ambigu, transparent à l'explicite.
- Cmd 13: offre = comportement décrit, pas gabarit à trous.
- Cmd 15/16: effects_outcome conservé dans le contexte de génération.
- Cmd 17: toutes les sorties passent par le dispatcher global.
- Cmd 8/11: contre-exemples et replays exigés aux phases P0/P5.

## Révision 2026-07-10 — simplification « conversation pure » (validée en LLM réel)

Décision user: AUCUNE offre produit dans le flow. Cette révision REMPLACE le §7
(offre sur pivot_action → supprimée) et précise §6/§8.

- **Zéro offre**: la machinerie d'offre (pivot_action, mini-fiche, offers[])
  est supprimée. Une demande de méthode (« concrètement je fais quoi ? ») est
  un `maintain`: la réponse se donne EN CONVERSATION (protocole en langage
  courant). Kinds restants: maintain | tool_pull | closure | topic_change.
- **Sortie same-turn**: la transition est calculée juste après le routing;
  une sortie (tool_pull/topic_change/closure/expired) purge l'état et
  RE-DISPATCHE le même tour via le dispatcher global (cmd 17) — « prépare-moi
  une carte » atterrit dans coaching CE tour-ci. Validé live: exit_reroute →
  owner=coaching_recommendation, état actif = coaching après le tour.
- **Dispatcher présence-aware minimal**: `flow_state_context.
  presence_conversation_active=true` (booléen, pas d'état) pour qu'il classe
  le kind du tour courant. Doctrine mise à jour; sur tool_pull/topic_change il
  émet AUSSI les signaux du nouveau besoin pour router la sortie.
- **Fil de la discussion** (`thread.ts`): verbatim intégral depuis l'entrée
  (remplace recentTurns tronqué), budget 60 msgs / 40k chars; en débordement,
  repli incrémental du plus ancien dans un résumé riche porté par l'état
  (`thread_summary`, faits du user + positions déjà données + arc), queue
  toujours verbatim. Fail-open si le repli échoue.
- **Ban artefact formaté**: le prompt interdit de produire une fiche/carte
  inline (faux livrable, bug observé en QA r6 avant simplification).
- **Entrée**: jamais sur un tour classé tool_pull/closure/topic_change.

Validation LLM réelle (local, rose, gpt-5.4 deep): entrée ✅, maintien sur
ambigu ET demande de méthode ✅ (réponse conversationnelle concrète, zéro
produit, zéro artefact), sortie tool_pull same-turn vers coaching ✅.
