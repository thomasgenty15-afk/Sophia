# QA Operation Suggestion - Attack Card Technique Options - Alex - 2026-05-13 - attack-card-technique-options-r1

## 1. Contexte Du Test

- Date: 2026-05-13 Europe/Paris
- Run: `attack-card-technique-options-r1`
- Persona: Alex
- Connexion: `tests/real-personas/alex/connection.json`, JWT via `bash scripts/get-jwt.sh alex`
- Objectif: verifier le nouveau flow de carte d'attaque quand la technique n'est pas explicite: proposition de 2-3 techniques front, choix par numero, draft visible avant confirmation, creation DB, puis renvoi de la carte dans le chat avec emplacement Ressources.
- Trajectoire: demande vague de carte d'attaque -> clarification cible -> proposition de techniques -> choix ordinal -> draft -> confirmation -> effet durable.
- Surfaces visees: dispatcher `operation_intent`, `operation_flow`, handler `prepare_attack_card`, slot `target`, slot `technique`, confirmation, tool `prepare_attack_card`, DB `user_attack_cards`, rattachement `user_plan_items.attack_card_id`.
- Cadre IA reel: Supabase local, endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/remote.
- Validite QA: valide. Le run a ete mene tour par tour apres lecture des reponses et traces courtes; aucun tour vide, aucun abort, aucun fallback.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-technique-options-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-technique-options-r1.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-05-12-test1-attack-card-technique-options-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> J'ai besoin que tu me fasses une carte d'attaque pour ce soir, pour demarrer le truc du sommeil, mais je veux pas que ca devienne une nouvelle tache.

**Sophia**
> Il me manque l'action exacte à viser. Je peux viser "Préparer ta zone de déchargement" / "Bilan et ajustement du sas" / "Faire le sas de déchargement", ou une autre action si ce n'est pas ça.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=ask_question`, `slot=target`, candidates plan item proposes
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**User**
> Je parle de Faire le sas de dechargement. Le souci c'est que je repousse et je negocie avec moi-meme au moment de commencer.

**Sophia**
> Quelle technique d'attaque tu veux utiliser ?
>
> 1. Le texte magique (recommandee): aide quand le combat interieur demarre. Exemple pour "Faire le sas de déchargement": un texte court a relire quand tu negocies avec toi-meme.
> 2. Preparer le terrain: option simple pour faciliter le demarrage. Exemple pour "Faire le sas de déchargement": preparer l'environnement avant le moment critique.
>
> Reponds avec le nom ou le numero.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=ask_question`, `slot=technique`, `missing_slots=["technique"]`
- pending_confirmation: none
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

Slot state utile:

- target connu: `Faire le sas de déchargement`, `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- option 1: `technique_key=texte_recadrage`, title `Le texte magique`, recommended `true`
- option 2: `technique_key=preparer_terrain`, title `Preparer le terrain`

### Tour 3

**User**
> La premiere, le texte magique.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Le texte magique
> Je n'ai pas besoin de negocier Faire le sas de déchargement. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Mode d'emploi: Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: none
- operation: `status=pending_confirmation`, `operation_id=0e89880a-3165-48c4-abe0-7dfa2ceb9ec4`
- pending_confirmation: draft `Carte d'attaque - Faire le sas de déchargement`, technique `texte_recadrage`
- memory_plan: not material to the turn
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**User**
> Oui vas-y, cree cette carte d'attaque dans Sophia.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Le texte magique
> Je n'ai pas besoin de negocier Faire le sas de déchargement. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.
>
> Mode d'emploi : Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la modifier ou l'imprimer.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: `prepare_attack_card=success`
- operation: `status=executed`, `operation_id=0e89880a-3165-48c4-abe0-7dfa2ceb9ec4`, `attack_card_id=e096b47c-69d3-4639-9d0e-06018d57e057`
- pending_confirmation: cleared
- memory_plan: not material to the turn
- executed_tools: `["prepare_attack_card"]`
- durable_effect: active attack card written and linked to target plan item

Durable DB observe:

- `user_attack_cards.id=e096b47c-69d3-4639-9d0e-06018d57e057`
- `user_attack_cards.plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `content.summary=Carte d'attaque pour Faire le sas de déchargement.`
- `content.techniques[0].technique_key=texte_recadrage`
- `content.techniques[0].title=Le texte magique`
- `content.techniques[0].generated_result.output_title=Carte d'attaque - Faire le sas de déchargement`
- `content.techniques[0].generated_result.generated_asset=Je n'ai pas besoin de negocier Faire le sas de déchargement. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.`
- `content.techniques[0].generated_result.mode_emploi=Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.`
- `user_plan_items.id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- `user_plan_items.attack_card_id=e096b47c-69d3-4639-9d0e-06018d57e057`
- `user_plan_items.cards_status=ready`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia ne cree pas de carte avec une cible vague; elle demande la cible et propose des actions possibles.
- Tour 2: Sophia propose des techniques front reelles, limitees a 2 options pertinentes, avec recommandation et exemple applique a la cible.
- Tour 3: Sophia comprend un choix ordinal naturel (`La premiere`) et montre le draft avant creation.
- Tour 4: Sophia renvoie la carte dans le chat et indique clairement ou la retrouver pour modifier/imprimer.

**Problemes**
- Tour 1: l'ordre des candidats est imparfait; `Faire le sas de déchargement` arrive apres `Bilan et ajustement du sas` alors que la demande parle du sommeil et du sas. Impact: le user peut devoir lire plus que necessaire. Severite: yellow leger.
- Tours 3-4: le texte genere est grammaticalement maladroit: `Je n'ai pas besoin de negocier Faire le sas de déchargement`. Impact: la carte est comprehensible, mais pas assez naturelle pour un objet final imprime/modifie. Severite: yellow.
- Tour 2: l'offre affiche seulement 2 techniques au lieu de 2-3. C'est acceptable car les 2 sont pertinentes, mais le comportement attendu devrait rester explicite: 2 minimum, 3 si un troisieme signal est utile. Severite: green.

**Fix propose**
- Ameliorer le ranking des candidats cible avec les tokens de niveau/transformation (`sas`, `sommeil`, action active) pour mettre l'action la plus probable en premier.
- Ajouter une passe de formulation pour les assets `texte_recadrage`: utiliser `négocier avec l'idée de faire X` ou `me raconter des excuses au sujet de X`, pas `négocier X`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: `operation_flow/prepare_attack_card` selectionne correctement via `operation_intent_start`.
- Tour 2: le flow actif continue via `active_tool_skill_continue` et passe du slot `target` au slot `technique`.
- Tour 3: le choix ordinal est conserve dans le meme operation flow et produit un `pending_confirmation`.
- Tour 4: `pending_confirmation/execute_confirmed` priorise la confirmation et execute le tool apres oui explicite.

**Skills / Operations / Tools**
- Aucun executor ne tourne avant confirmation.
- Les techniques proposees utilisent les cles front attendues: `texte_recadrage` et `preparer_terrain`.
- Le draft confirme utilise `technique=texte_recadrage` et `technique_title=Le texte magique`.
- `prepare_attack_card` execute une seule fois au tour 4.

**Memory / Effets durables**
- La carte est creee active en DB avec `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`.
- `user_plan_items.attack_card_id` pointe vers `e096b47c-69d3-4639-9d0e-06018d57e057`.
- Le shape front est respecte: `content.summary`, `content.techniques[0].technique_key`, `title`, `pour_quoi`, `objet_genere`, `mode_emploi`, `generated_result.output_title`, `generated_asset`, `mode_emploi`, `keyword_trigger`.
- Le message final contient l'emplacement interface: `Ressources > Cartes d'attaque du plan`.

**Problemes**
- Aucun probleme systeme bloquant observe. Les warnings sont des sujets de qualite de formulation/ranking, pas de routage ni de side effect.

**Fix propose**
- Ajouter un test systeme supplementaire qui verifie directement le rendu de `content.techniques[0].technique_key` contre l'union front autorisee.
- Ajouter un test de ranking cible quand plusieurs items contiennent `sas`.

## Verdict Global

- Verdict: yellow
- Raison principale: le workflow systeme est vert et le nouveau comportement est valide, mais la qualite linguistique de la carte finale reste trop maladroite pour un verdict fluidite pleinement vert.
- Follow-up prioritaire: corriger la generation textuelle de `texte_recadrage` et ameliorer le ranking des candidats cible.
