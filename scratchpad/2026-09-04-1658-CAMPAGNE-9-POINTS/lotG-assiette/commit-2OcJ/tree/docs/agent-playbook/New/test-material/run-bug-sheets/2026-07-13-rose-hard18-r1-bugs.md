# Feuille De Suivi Bugs — rose-hard18-r1 (2026-07-13)

Run: `rose-hard18-r1` — Persona Rose (web) — Verdict global **yellow** (aucun red).
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-rose-hard18-r1.md`

Contexte: run difficile 15 tours sur surfaces **vierges/sous-couvertes sur Rose** — discriminateur de technique operation-suggestion (carte d'attaque/mot de bascule/carte de défense), activation potion + consentement, `needs_research` multi-tours, `product_help` hors facturation. Tous les bugs sont de la friction UX du flow `coaching_recommendation` ; **aucun effet durable faux**, aucune divergence claim↔DB.

---

## R1-B01 — Flow coaching ne converge pas vers une proposition

- **Bug id**: R1-B01
- **Tours**: 3 (corollaire au T5/T6)
- **Famille**: BF-STATE-01 (mauvaise transition de flow — reste en clarify)
- **Domaine owner**: reducer local `sophia-brain/skills/coaching_recommendation` (`local_flow.ts`)
- **Source amont**: politique de transition clarify→proposition ; pas de seuil « situation + moment nommés → proposer une technique »
- **Symptome visible**: 3 tours de questions de cadrage consécutifs (T1→T3) avant toute proposition ; la préparation tarde alors que Rose a déjà nommé la situation (soirée samedi) et l'axe (anticipation, arrivée + moment du joint).
- **Preuve systeme**: T3 trace `skill status=continue`, `response_intent=reflection`, `op_suggestion=null`, `direct_effects=[]` ; aucune `operation_suggestion` émise sur 3 tours.
- **Correction attendue**: quand la cible (situation + moment de rupture) est déjà résolue, avancer à une proposition de technique plutôt qu'un nouveau slot de cadrage. Critère de convergence explicite du reducer.
- **Tests requis**: positif « situation + moment nommés → proposition (pas nouveau slot) » ; anti-faux-positif « cible réellement ambiguë → clarify légitime » ; paraphrase (variantes de wording d'anticipation).
- **Statut**: `fix_applied` (chantier P6, 2026-07-13) — P6-G: règle CRITÈRE DE CONVERGENCE dans le dispatcher local coaching (le flow propose au plus tard quand les slots suffisent).

## R1-B02 — Slot fourni + consentement redemandés (confirmation redondante)

- **Bug id**: R1-B02
- **Tours**: 5
- **Famille**: BF-INTAKE-01 (slot fourni mais redemande)
- **Domaine owner**: reducer local `coaching_recommendation` (`local_flow.ts`) — consommation slot/consent in-turn
- **Source amont**: le tour porte à la fois le consentement explicite (« vas-y prépare-la ») et le slot `piège` rempli ; le reducer ré-émet une question de cadrage de départ (« on part bien sur… ? ») sans consommer ni l'un ni l'autre.
- **Symptome visible**: Rose consent + détaille le piège (pression du groupe, peur de la rabat-joie), Sophia redemande confirmation du point de départ → sensation de ne pas être écoutée.
- **Preuve systeme**: T5 trace `skill status=continue`, `direct_effects=[]`, `op_suggestion=null` ; le slot détaillé du message user n'apparaît pas consommé (aucun avancement d'état).
- **Correction attendue**: un tour portant consentement explicite + slot rempli doit acter le slot et avancer (construction / proposition finale), jamais re-confirmer le départ. Invariant : un slot fourni n'est jamais redemandé.
- **Tests requis**: positif « consent + slot in-turn → avancement » ; anti-faux-positif « consent sans slot requis manquant → demande le slot manquant seulement » ; intégration flow coaching complet.
- **Statut**: `fix_applied` (chantier P6, 2026-07-13) — P6-G: règle CONSENTEMENT + SLOT DANS LE MÊME TOUR (jamais re-demander un slot déjà fourni ni re-confirmer un consentement déjà donné).

## R1-B03 — Nature « carte libre » (non durable) explicitée tardivement

- **Bug id**: R1-B03
- **Tours**: 6 (résolu par honnêteté au T7)
- **Famille**: BF-STATE-01 (transition/état — `operation_suggestion` jamais émise ; durabilité non signalée au moment de la création)
- **Domaine owner**: skill `coaching_recommendation` + `operation_suggestion_resolver` (non atteint)
- **Source amont**: sur « crée-la maintenant », le skill livre le contenu complet de la carte sans (a) émettre d'`operation_suggestion` (résolveur/tool-skill/executor non atteints) ni (b) signaler que c'est une carte libre de coaching non enregistrée. La nature coaching-only n'est explicitée qu'au T7, sur relance de Rose.
- **Symptome visible**: ambiguïté momentanée « est-ce que ma carte est en place ? » entre T6 et T7.
- **Preuve systeme**: T6 trace `op_suggestion=null`, `direct_effects=[]`, `ledger 0` ; DB `user_defense_cards=0`, items `cards_status=not_required` (carte durable non provisionnée) ; **pas de claim fantôme** (Sophia ne dit pas « enregistrée »).
- **Nuance**: PAS un red — carte libre coaching = comportement documenté pour items non provisionnés (multiflow-reminder) ; honnêteté correcte dès qu'interrogée (T7). Le défaut est le **timing** du signalement.
- **Correction attendue**: sur une intention « crée/enregistre » d'un objet non provisionné (`cards_status=not_required`), acter explicitement dès le tour que c'est une carte libre à relancer côté Ressources ; quand `cards_status` le permet, émettre l'`operation_suggestion` pour router vers le tool durable.
- **Tests requis**: positif « crée carte non provisionnée → mention coaching-only in-turn » ; positif « item provisionné → operation_suggestion émise vers tool durable » ; anti-faux-positif « ne jamais claim un enregistrement absent ».
- **Statut**: `fix_applied` (chantier P6, 2026-07-13) — P6-G: règle CARTE LIBRE — durabilité annoncée DANS le tour de livraison (+ operation_suggestion si provisionné).

---

## Positifs vérifiés (à capitaliser, pas des bugs)

- **Discrimination de technique** (T2→T4) : « mot de bascule » forcé non créé aveuglément ; carte de défense sélectionnée pour le moment de rupture. Doctrine operation-suggestion respectée.
- **Honnêteté de durabilité** (T7, T10, T15) : aucun commit fantôme carte/potion ; distinction explicite conversation vs état durable ; renvoi vers surfaces produit **réelles** (`Ressources / Défense`, `Ressources / Potions` — groundées dans `product_surface_registry`). Contre-exemple direct des reds verify hard17/lifecycle16.
- **`needs_research` multi-tours** (T11-T12) : détecté 0.96 puis 0.93 sur contestation, grounding cohérent, nuance anecdote↔donnée, pas de capitulation.
- **`product_help` hors billing** (T14) : routage `product_help` correct, explication carte vs potion exacte.
- **Bilan hebdo conversationnel** (T13) : récap groundé DB, aucune complétion fabriquée, honnête sur l'absence de validation d'habitude.
- **Frontière durable propre** : 0 effet durable créé sur tout le run malgré demandes explicites (carte « crée-la », potion « active-la ») — refus honnête plutôt que mensonge.
