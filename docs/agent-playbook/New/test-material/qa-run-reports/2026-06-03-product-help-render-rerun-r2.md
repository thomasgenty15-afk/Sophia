# QA Run Report — Product Help Render Rerun R2

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `product-help-render-rerun-20260603-r2`
- Persona:
  `qa-normal-product-help-render-rerun-20260603-r2-1780511981135@example.com`
- Objectif: relancer la matrice réelle après correction `product_help` pour
  vérifier la stabilité des modifications.
- Trajectoire: comparaison produit -> follow-up de choix -> création
  attack+defense -> clarification -> résolution défense -> interruption
  localisation.
- Surfaces visees: `product_help`, `orientation_clarification`,
  `prepare_defense_card`, active flow interruption, effects guard.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, aucun fallback déterministe.
- Validite QA: valide avec un incident technique documenté. Un appel a retourné
  `502` Edge Runtime et a été relancé sans être compté comme verdict produit.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Explique-moi la différence entre une carte d'attaque et une carte de défense.

**Sophia**

> Une carte d’attaque et une carte de défense, c’est la même logique mais pas le
> même moment dans le cycle “je panique / je tiens bon” 😄
>
> Carte d’attaque = ce que tu fais pour avancer quand ça te tire vers le bas.
>
> - But: déclencher l’action, créer de l’élan, casser l’inertie.
> - Forme typique: un geste concret, une phrase-coup-de-poing, un “go” du
>   cerveau.
> - Timing: plutôt quand tu te sens capable mais freiné, ou quand tu veux
>   reprendre la main.
>
> Carte de défense = ce que tu fais pour empêcher le pire ou limiter les dégâts.
>
> - But: te stabiliser, te protéger de la spirale, réduire l’impact (stress,
>   excuses, rechute, surpensée).
> - Forme typique: un frein + une respiration + un rappel de limites, “pas
>   maintenant”, “je reviens à l’essentiel”.
> - Timing: plutôt quand tu es en tension, submergé, au bord de lâcher ou de
>   partir en vrille.
>
> Version ultra simple:
>
> - Attaque = je fais.
> - Défense = je me protège pour pouvoir faire.
>
> Tu veux que je te donne un exemple concret pour ton cas (par ex:
> procrastination, stress, motivation, conflit, discipline perso) ? 🙂

**Lecture humaine** Sophia compare bien les deux cartes et reste non-mutante. La
phrase “même logique” est discutable, mais elle distingue ensuite les usages.

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- n/a

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-RENDER-01` — Réponse incomplète ou
surface mal rendue

**User**

> Ok, dit autrement : attaque vs défense, je choisis quoi quand je veux juste me
> mettre à l'action ?

**Sophia**

> Cartes d'attaque et de defense: Une carte d'attaque aide a demarrer ou
> preparer une action: elle reduit la friction avant de commencer et clarifie le
> premier geste. Une carte de defense protege un moment de risque: elle anticipe
> ce qui peut faire derailler l'action et prepare une reponse simple ou un plan
> B. En pratique, l'attaque repond a « comment je m'y mets ? »; la defense
> repond a « qu'est-ce qui risque de me faire devier, et quoi faire a ce
> moment-la ? ».
>
> Comment l'utiliser: Utilise une carte d'attaque quand l'action est voulue mais
> difficile a lancer, ou quand il faut preparer le terrain avant le moment
> d'action. Utilise une carte de defense quand le probleme est un piege sur le
> moment: evitement, impulsion, pression, fatigue, reaction automatique ou
> risque de craquer. Les deux peuvent coexister pour une meme action: attaque
> pour entrer dans l'action, defense pour tenir quand le contexte deraille.
>
> Ce que ca apporte:
>
> - Evite de confondre preparation de l'action et protection contre un risque.
> - Aide a choisir la bonne ressource selon le besoin actuel. 🙂

**Lecture humaine** Le défaut est revenu: Sophia ne répond pas directement
“choisis attaque pour te mettre à l’action”. Elle rend un bloc catalogue
complet.

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- Symptome: follow-up de choix aplati en réponse catalogue.
- Source amont probable: intake `product_help` laisse le modèle choisir sans
  garantir une `reply` ciblée, et le fallback renderer ne s'applique pas quand
  le modèle rend déjà une réponse complète.
- Owner runtime: `product_help`.
- Meilleure correction selon les guidelines: renforcer la
  validation/post-traitement de `compare_features` au niveau `product_help`, à
  partir de l'intent structuré, pas par regex de routing.
- Pourquoi ce n'est pas un patch local: le problème concerne toute réponse
  `compare_features` où le modèle ignore le besoin courant et renvoie le
  catalogue.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Maintenant ce n'est plus une explication : j'aimerais créer une carte de
> défense et une carte d'attaque.

**Sophia**

> Par laquelle veux-tu commencer : la carte d'attaque ou la carte de défense ?
> 🙂

**Lecture humaine** La demande d’action n’est pas capturée par `product_help`;
elle passe par clarification et n’exécute rien.

**Trace courte**

- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: clarification présente, non mutante
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- n/a

### Incident Technique A

**Verdict du tour:** red technique, non compté comme verdict produit

**Famille de bugs si yellow/red:** `BF-TEST-01` — Trace/test incohérent ou suite
malsaine

**User**

> La défense d'abord.

**Sophia**

> Réponse vide, HTTP `502`.

**Trace courte**

- http_status: `502`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- Symptome: Edge Runtime renvoie un `502`.
- Source amont probable: incident runtime local.
- Owner runtime: infrastructure QA locale.
- Meilleure correction selon les guidelines: relancer le même message sans
  reconstruire le transcript.
- Pourquoi ce n'est pas un patch local: aucun chemin produit exploitable n'a
  répondu.

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> La défense d'abord.

**Sophia**

> Ok, je comprends. Quelle action ou quel contexte veux-tu protéger avec cette
> carte de défense ? 🙂

**Lecture humaine** La clarification reprend proprement vers
`prepare_defense_card`, sans création et sans executor.

**Trace courte**

- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_defense_card` intake seulement
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun; `tool_execution=blocked`

**Analyse si yellow/red**

- n/a

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-RENDER-01` — Réponse incomplète ou
surface mal rendue

**User**

> Stop pour la création, je veux juste savoir où je retrouverai une carte
> d'attaque si elle existe.

**Sophia**

> Ok je te stoppe là. 🙂\
> Une carte d’attaque, si elle existe déjà, tu la retrouves dans le tableau de
> bord à l’endroit des “Cartes” (cartes plan item), dans la section liée à la
> carte d’action/attaque.
>
> Tu veux la retrouver vite: tu cherches plutôt sur “cartes” ou tu sais déjà le
> nom/objectif associé à la carte d’attaque ?

**Lecture humaine** La réponse n’est plus une fiche catalogue complète, donc une
partie du fix tient. Mais elle reste vague: elle ne donne pas la localisation
contractuelle `Dashboard > Ressources > Cartes d'attaque du plan`, ne rappelle
pas assez clairement l’absence de preuve d’existence, et pose une question alors
que l’utilisateur demandait une réponse directe.

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_inline_resume_active_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**

- Symptome: localisation conditionnelle trop vague et question inutile.
- Source amont probable: intake `product_help` fournit une `reply` libre qui
  contourne le renderer `where_is_it` plus strict.
- Owner runtime: `product_help`.
- Meilleure correction selon les guidelines: durcir les invariants du
  renderer/final reply pour `where_is_it` quand
  `feature_id=resources.attack_card`, en se basant sur l'intent et la feature
  structurés.
- Pourquoi ce n'est pas un patch local: le défaut vient de la frontière entre
  reply LLM libre et rendu contractuel product_help.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**

- Le routage reste correct: `product_help` pour explication/localisation,
  `orientation_clarification` pour création attack+defense.
- Aucun tool n'est exécuté.
- Aucun effet durable n'est observé.
- La clarification puis la reprise vers `prepare_defense_card` fonctionnent.

**Problemes**

- Tour 2: le follow-up de choix retombe sur une fiche catalogue. Famille:
  `BF-RENDER-01`. Impact: Sophia ne répond pas à la question concrète “je
  choisis quoi”. Severite: yellow.
- Tour 5: localisation trop vague et question inutile. Famille: `BF-RENDER-01`.
  Impact: la réponse est moins fiable que le contrat produit attendu. Severite:
  yellow.
- Incident technique: un `502` Edge Runtime. Famille: `BF-TEST-01`. Impact:
  bruit QA local, relancé avec succès.

**Fix propose**

- Source amont: `product_help` structured reply handling.
- Correction recommandee: ne pas laisser une `reply` LLM libre supplanter le
  renderer contractuel quand `intent=compare_features` ou `intent=where_is_it`
  et que la réponse ne respecte pas les invariants; préférer le rendu structuré.
- Tests d'invariant attendus: en run réel, T2 doit dire clairement carte
  d'attaque pour se mettre à l'action; T5 doit contenir
  `Dashboard > Ressources > Cartes d'attaque du plan` et l'absence de
  confirmation d'existence.

## 4. Verdict Global

yellow — les routes et les garanties non mutantes tiennent, mais les deux
défauts de rendu product_help ne sont pas stabilisés en conditions réelles.
