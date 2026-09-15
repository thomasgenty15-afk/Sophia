# QA Run Report - Test 1.7 Attack Card Technique Discovery

## 1. Contexte Du Test

- Date: 2026-05-13
- Runs: `attack-card-mot-secours-r2`, `attack-card-alt-technique-r1`
- Persona: Alex, connexion locale dediee
- Objectif: tester si Sophia choisit une technique d'attaque autre que `Le texte magique` / `Preparer le terrain` avec un wording user peu expert.
- Trajectoire: demande de carte d'attaque avec besoin de signal de secours, puis variante avec besoin de repere visuel.
- Surfaces visees: dispatcher, `prepare_attack_card`, `product_help`, choix technique, effet durable.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`; messages choisis tour par tour apres lecture des reponses.
- Validite QA: valide.

## 2. Tours De Conversation

### Run A - `attack-card-mot-secours-r2`

**Tour 1**
- User: "Je veux une carte d'attaque pour le sas du soir. Quand je sens que je vais craquer, il me faudrait un signal tres simple a utiliser, sans devoir lire un long texte."
- Sophia: part en `product_help`, donne une proposition de signal `PAUSE`, mais n'ouvre pas l'operation.
- Trace: `response_owner=product_help`, aucun tool.

**Tour 2**
- User: "Non, je ne veux pas aller regler ca moi-meme. Fais-moi la carte ici pour le sas, avec ton meilleur choix."
- Sophia: demande la cible entre `Faire le sas de déchargement` et `Bilan et ajustement du sas`.
- Trace: `response_owner=operation_flow`, `selected_handler=prepare_attack_card`, `ask_question`.

**Tour 3**
- User: "Le sas, pas le bilan. Celui que je dois faire le soir."
- Sophia: propose seulement `Preparer le terrain` et `Le texte magique`.
- Trace: `ask_question`, options insuffisantes pour le besoin initial.

**Tour 4**
- User: "Je sais pas le nom. Choisis ce qui colle au fait d'avoir un signal de secours quand je sens que je vais craquer."
- Sophia: choisit `Le texte magique`, pas `Mot de bascule`.
- Trace: `pending_confirmation`, aucun tool.

**Tour 5**
- User: "Non, stop. Ne cree pas cette carte."
- Sophia: annule.
- Trace: `cancelled`, aucun effet durable.

### Run B - `attack-card-alt-technique-r1`

**Tour 1**
- User: "Je veux une carte d'attaque pour le sas du soir. Mon probleme c'est que si rien ne me le rappelle visuellement, je pars ailleurs. Il me faudrait un repere simple dans la piece."
- Sophia: demande la cible entre `Faire le sas de déchargement` et `Bilan et ajustement du sas`.
- Trace: `operation_flow`, `prepare_attack_card`, `ask_question`.

**Tour 2**
- User: "Le sas de dechargement, pas le bilan. Je parle du rituel du soir."
- Sophia: propose seulement `Preparer le terrain` et `Le texte magique`.
- Trace: `ask_question`.

**Tour 3**
- User: "Je ne connais pas les techniques. Choisis celle qui marche avec un rappel visuel, un repere que je vois avant de zapper."
- Sophia: propose `Ancre visuelle`.
- Trace: `pending_confirmation`, `operation_id=68000354-8107-477a-a8af-6690b1aca049`.

**Tour 4**
- User: "Oui, cree-la."
- Sophia: cree la carte.
- Trace: `execute_confirmed`, `executed_tools=["prepare_attack_card"]`, `attack_card_id=c7ec2f16-0123-48c1-a2c6-f0dfa209ac01`.
- Durable: `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`, technique `ancre_visuelle`.

**Tour 5**
- User: "Stop, rien d'autre."
- Sophia: "Ok, j'arrête là. Je ne crée rien d'autre."
- Trace: `normal_reply`, aucun nouveau tool.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Quand le user reformule avec `rappel visuel`, Sophia sait finalement choisir `Ancre visuelle`.
- La creation de la carte `Ancre visuelle` est claire, confirmee, rattachee au bon item, et indique l'emplacement Ressources.
- Le stop final est propre.

**Problemes**
- Run A tour 1: une demande "fais-moi une carte d'attaque" part en aide produit au lieu d'operation. Impact: le user doit corriger Sophia. Severite: yellow.
- Run A tours 3-4: Sophia ne propose pas ou ne choisit pas `Mot de bascule` malgre "signal de secours / craquer / sans long texte". Impact: mauvais choix technique. Severite: red pour cet objectif.
- Run B tour 2: Sophia perd le signal "repere visuel" apres clarification de cible et revient aux deux options par defaut. Impact: le user doit repeter son besoin. Severite: yellow.

**Fix propose**
- Conserver les signaux de technique du premier tour dans `known_slots` pendant la clarification cible.
- Ajouter `signal`, `secours`, `declencher`, `craquer`, `mot`, `alerte rapide` aux signaux `pre_engagement`.
- Quand le user dit "choisis", Sophia doit choisir parmi toutes les techniques pertinentes, pas seulement les deux options par defaut.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `product_help` intercepte une vraie demande operationnelle au Run A tour 1.
- `prepare_attack_card` fonctionne apres correction explicite du user.

**Skills / Operations / Tools**
- Run A: pas d'effet durable, annulation correcte.
- Run B: `prepare_attack_card` execute correctement `ancre_visuelle` apres confirmation.

**Memory / Effets durables**
- Run B cree `attack_card_id=c7ec2f16-0123-48c1-a2c6-f0dfa209ac01`.
- Durable OK: rattache a `Faire le sas de déchargement`, `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`.

**Problemes**
- Run A: le besoin "signal de secours" aurait du pointer vers `pre_engagement` / `Mot de bascule`; le systeme choisit `texte_recadrage`.
- Run B: `ancre_visuelle` n'apparait pas dans les options initiales malgre le signal visuel du premier message.

**Fix propose**
- Etendre `recommendedTechniqueOptions` et `inferTechniqueChoiceFromMessage` aux techniques non couvertes actuellement: `pre_engagement`, `ancre_visuelle`, `mantra_force`, `visualisation_matinale`.
- Propager `technique_signal_hints` entre target clarification et technique selection.

## Verdict Global

- Verdict: red
- Raison principale: l'objectif "laisser Sophia choisir Mot de bascule / technique alternative sans trop orienter" echoue pour `Mot de bascule` et demande une reformulation explicite pour `Ancre visuelle`.
- Follow-up prioritaire: corriger la conservation et le ranking des signaux technique hors `texte_recadrage` / `preparer_terrain`.
