# Contexte V3 Sophia — A donner au debut de chaque nouvelle conversation

## Projet

Sophia est une app de transformation personnelle. La V2 est livree (onboarding,
modele metier, plan 3 dimensions, dashboard, systemes vivants). La V3 est une
refonte majeure du modele de plan et du dashboard, inspiree par la philosophie
Kaizen japonaise: commencer petit, prouver qu'on peut tenir une promesse, puis
augmenter graduellement.

## Branche

`v3-heartbeat` (a partir de `v2-redesign`)

## Documents de reference

Tous dans `docs/`. Lire dans cet ordre si besoin de contexte:

1. `docs/v3-context-prompt.md` — **ce fichier** (contexte V3 a coller au debut
   de chaque conversation)
2. `docs/v3-execution-playbook.md` — playbook V3 etape par etape avec prompts,
   checkpoints, repartition des modeles
3. `docs/v2-context-prompt.md` — contexte V2 (pour reference, decisions
   anterieures)
4. `docs/v2-technical-schema.md` — schema technique V2 (source de verite tables,
   enums, types existants — sera etendu par la V3)
5. `docs/v2-execution-playbook.md` — playbook V2 (pour reference)

## Vision V3 — Le Heartbeat

### Probleme resolu

La V2 genere un plan en 3 dimensions plates (support, missions, habits) avec des
`activation_condition` entre items individuels. Il n'y a pas de fil narratif, pas
de calibrage du premier pas en fonction de l'historique d'echecs, et la North
Star est une metrique abstraite que personne n'utilise.

### Solution: le plan par phases avec Heartbeat

Le plan V3 est organise en **phases sequentielles**. Chaque phase a:

- Un **Heartbeat** (objectif/metrique) qui reflete l'ACTION de la phase, pas le
  but final de la transformation
- Des items des 3 dimensions (support, missions, habits) qui servent cet
  objectif
- Un **rationale** expliquant pourquoi ce rythme, pourquoi ce pas
- Une condition de transition: quand le Heartbeat atteint son seuil, la phase
  suivante se debloque

**Principe cle:** la premiere phase doit etre ridiculement facile si l'historique
d'echecs le justifie. Le Heartbeat de la phase 1 mesure la capacite a tenir une
promesse, pas un resultat de transformation.

**Exemple — arret de la cigarette:**

```
PHASE 1 — Objectif: "Cigarettes notees par jour" → cible: 10/10
  ├─ Habit: noter chaque cigarette fumee
  ├─ Support: framework "Qu'est-ce que m'apporte l'arret"
  └─ Mission: identifier mes 3 triggers

PHASE 2 — Objectif: "Cigarettes par jour" → cible: 5
  ├─ Habit: remplacer 1 clope par 5 min de marche sur un trigger
  ├─ Support: technique de gestion de craving
  └─ Mission: prevenir mon entourage

PHASE 3 — Objectif: "Cigarettes par jour" → cible: 0
  ├─ Habit: routine matinale de remplacement
  └─ Mission: jeter les paquets

PHASE 4 — Objectif CHANGE → "Jours sans fumer" → cible: 30
  ├─ Habit: check-in quotidien
  └─ Support: outil de secours rechute
```

## Decisions canoniques V3

### Structure du plan

- Le plan est organise en **phases** (plus en 3 dimensions plates)
- Chaque phase contient des items de toutes les dimensions (support, missions,
  habits)
- Le Heartbeat d'une phase reflete l'ACTION principale, pas le but final
- Le Heartbeat peut CHANGER entre phases (la metrique evolue)
- Les transitions de phase sont declenchees par l'atteinte du seuil Heartbeat
- `user_plan_items` reste la source de verite d'execution (avec un
  `phase_id` supplementaire)
- `user_plans_v2.content` change de shape: `phases[]` remplace `dimensions[]`

### Flow onboarding V3

Le flow V3 modifie l'onboarding V2 sur 3 points:

1. **Suppression de la priorisation manuelle** — l'IA decide l'ordre logique des
   transformations (sommeil avant sport, etc.) a la cristallisation. Plus de
   drag-and-drop.

2. **Suppression du choix de duree** — plus de 1/2/3 mois dans MinimalProfile.
   L'IA decide la duree au plan generation, basee sur les 4 questions structurees.

3. **Roadmap V1 → V2** — la roadmap est presentee deux fois:
   - **Roadmap V1** (post-cristallisation): basee sur le free text seul. Ordre
     logique, pas de durees precises. "Voila l'ordre que je propose."
   - **Roadmap V2** (post-plan generation): si le scope est trop gros (> 6 mois),
     le plan generation scinde la transformation et met a jour la roadmap. Un
     ecran de transition explique le changement: "D'apres ce que tu m'as dit,
     ce parcours va prendre plusieurs etapes. Voici le plan mis a jour."
   - Si pas de scission: Roadmap V2 = Roadmap V1, pas d'ecran supplementaire.

4. **Roadmap conversationnelle (re-priorisation live)** — a chaque transition
   entre transformations (quand le user termine une transfo et passe a la
   suivante), un ecran "Roadmap Review" s'affiche:
   - La roadmap actuelle est affichee visuellement
   - Le user peut discuter avec Sophia en temps reel pour ajuster l'ordre,
     ajouter/supprimer des transformations, ou exprimer de nouveaux besoins
   - Sophia met a jour la roadmap **en temps reel sous les yeux du user**
     pendant la conversation (via un endpoint dedie qui modifie l'ordre et
     le statut des transformations en DB)
   - Quand le user est satisfait, il valide et passe au questionnaire de la
     transformation suivante
   - Ce mecanisme s'applique aussi a la toute premiere presentation de la
     Roadmap V1 (post-cristallisation): meme ecran, meme chat

```
PREMIER ONBOARDING:
capture → validation → cristallisation + Roadmap V1
                          ↓
                    Ecran Roadmap + chat Sophia (re-priorisation live)
                          ↓
                    questionnaire sur mesure (3-8 questions libres + 4 questions de calibrage pour transfo #1)
                          ↓
                    profile (birth date, gender — plus de duree)
                          ↓
                    plan generation (duree de reference backend aujourd'hui, IA decidee en Lot B + split si > 6 mois)
                          ↓
                    SI split → Ecran transition: "Ton parcours a ete affine"
                          ↓
                    Dashboard

TRANSITION ENTRE TRANSFORMATIONS:
fin transfo N → Ecran Roadmap + chat Sophia (re-priorisation live)
                          ↓
                    questionnaire sur mesure (3-8 questions libres + 4 questions de calibrage pour transfo N+1)
                          ↓
                    plan generation
                          ↓
                    Dashboard
```

### Duree et split des transformations

- **Cap dur: une transformation = max 6 mois**
- L'IA estime la duree au plan generation, basee sur les 4 questions structurees
  (struggle_duration, prior_attempts, self_confidence, success_indicator)
- Etat actuel A2:
  - le choix utilisateur de duree a bien ete retire de `MinimalProfile`
  - `generate-plan-v2` renvoie deja `roadmap_changed` et `journey_context`
    quand disponibles
  - tant que le split reel n'est pas implemente dans le Lot B, le flow
    continue avec une duree de reference backend et n'affiche pas l'ecran
    de transition
- Si la duree estimee depasse 6 mois, l'IA:
  1. Genere le plan pour la **premiere tranche** (max 6 mois)
  2. Stocke un `journey_context` dans le plan:
     - `is_multi_part: true`
     - `part_number: 1`
     - `estimated_total_parts: 3`
     - `continuation_hint: "Continuer la perte de poids, objectif -15kg"`
     - `estimated_total_duration_months: 14`
  3. Cree un stub de transformation "pending" pour la suite
- Au handoff (fin de la premiere tranche), le systeme:
  - Reprend le `continuation_hint`
  - Repose les 4 questions structurees (contextualisees)
  - Genere le plan de la tranche suivante
- Le multi-transformation existant (cycle V2 + handoff V2.1) supporte deja ce
  mecanisme

### Questionnaire enrichi

- 4 questions structurees obligatoires ajoutees en fin de questionnaire, formulees
  par le LLM (pas `transformation.title` en brut):
  1. `_system_struggle_duration` — anciennete du probleme (single_choice, 5 options)
  2. `_system_prior_attempts` — nombre de tentatives passees (single_choice, 4 options)
  3. `_system_self_confidence` — confiance a changer (scale 1-5)
  4. `_system_success_indicator` — indicateur de reussite concret (free_text)
- Ces 4 questions ont des IDs fixes `sys_q1` a `sys_q4` pour fiabiliser
  l'extraction backend tout en gardant `capture_goal` comme contrat semantique
- Le questionnaire total contient donc 3 a 8 questions libres + ces 4 questions
  de calibrage, toujours placees en fin de questionnaire
- Ces reponses sont extraites en champs structures (pas noyees dans
  `questionnaire_answers` generique)
- Passees au LLM de plan generation comme bloc de calibrage explicite

### Calibrage de l'effort initial

Les 3 premieres questions structurees determinent le nombre et la granularite des
phases:

- `self_confidence <= 2` OU `prior_attempts >= 4` → premiere phase =
  observation/ancrage pur (le "verre d'eau"), effort < 2 minutes
- `self_confidence == 3` ET `prior_attempts 1-3` → premiere phase = effort
  modere, habitude simple mais pas triviale
- `self_confidence >= 4` ET premiere tentative → plan standard

Plus le parcours est difficile, plus il y a de phases avec des paliers plus
petits.

La 4eme question (`success_indicator`) + le gap implicite dans le free text
permettent a l'IA d'estimer la taille totale du parcours et de decider si un
split est necessaire.

### Roadmap conversationnelle (re-priorisation live)

A chaque point de transition (premier onboarding + chaque fin de transformation),
le user voit un ecran "Roadmap Review" qui combine:

1. **Vue visuelle de la roadmap** — les transformations dans l'ordre, avec statut
   (faite, en cours, a venir), durees estimees si disponibles
2. **Chat integre avec Sophia** — le user peut:
   - Demander de changer l'ordre ("je voudrais commencer par X")
   - Ajouter une nouvelle transformation ("j'ai aussi envie de travailler sur Y")
   - Supprimer une transformation ("finalement Z c'est plus un sujet")
   - Poser des questions ("pourquoi tu me proposes cet ordre ?")
3. **Mise a jour en temps reel** — Sophia appelle un endpoint dedie qui modifie
   les transformations en DB (ordre, statut, ajout/suppression), et la vue
   roadmap se rafraichit visuellement pendant la conversation
4. **Validation** — quand le user est satisfait, il confirme et le flow continue

**Architecture technique:**
- Endpoint `update-roadmap-v3` (edge function) qui recoit les instructions de
  modification et met a jour les transformations en DB
- Le chat utilise le `sophia-brain` existant avec un mode/contexte "roadmap_review"
  qui donne a Sophia la capacite d'appeler `update-roadmap-v3` comme tool
- Cote frontend: composant `RoadmapReview.tsx` avec la roadmap en haut et le
  chat en bas, la roadmap se rafraichit via polling ou realtime subscription

**Contexte enrichi pour Sophia lors du review:**
- Resultats de la transformation precedente (si ce n'est pas le premier)
- ConversationPulse recente
- Transformations restantes avec leur ordering_rationale
- Donnees de calibrage de la transformation terminee

### Dashboard restructure — 5 sections

Le dashboard V3 est organise en 5 sections sous le `StrategyHeader`:

```
StrategyHeader (hero: titre, resume, intention, mantra, success_def, constraint)
  │
  ├─ 1. Plan de transformation (PhaseProgression)
  │     Progression verticale par phases + Heartbeat
  │
  ├─ 2. Carte de defense (DefenseCard)
  │     Cartographie des pulsions + 4 roles
  │
  ├─ 3. Atelier d'inspirations (AtelierInspirations)
  │     Histoire forward-looking + 5 principes japonais
  │
  ├─ 4. Rendez-vous (RemindersSection)
  │     Prochains RDV avec Sophia
  │
  └─ 5. Preferences (PreferencesSection)
        Ton, challenge, etc.
```

**Bloc North Star supprime** — remplace par le Heartbeat dans les phases.
`success_definition` et `main_constraint` absorbes dans le `StrategyHeader`.

#### Section 1 — Plan de transformation (PhaseProgression)

- Progression verticale par phases, chaque phase affiche son objectif Heartbeat +
  ses items
  - Phase en cours: depliee, items visibles et interactifs
  - Phases futures: visibles mais verrouillees (titre de l'objectif seulement)
  - Phases completees: compactees avec resume
- **Focus = la transformation** (phases + Heartbeat), pas les items individuels

#### Section 2 — Carte de defense (DefenseCard)

Voir section dediee "Carte de defense" ci-dessous.

#### Section 3 — Atelier d'inspirations (AtelierInspirations)

- Contient:
  1. **"Ton histoire"** — narration inspirationnelle forward-looking generee en
     differe (appel LLM separe), basee sur ce que l'utilisateur a dit + son
     historique de tentatives. Montre jusqu'ou ca peut aller.
  2. **Les 5 principes japonais** — cartes qui se debloquent progressivement:
     - Kaizen: jour 1 (toujours visible)
     - Ikigai: quand le "pourquoi" emerge en conversation
     - Hara Hachi Bu: quand une habitude atteint la maintenance
     - Wabi-sabi: apres le premier trebuchement (skip/blocker)
     - Gambaru: apres un plateau ou un moment de stall

#### Section 4 — Rendez-vous (RemindersSection)

- Restaure depuis le commit `13510e1^` (tables DB toujours presentes)

#### Section 5 — Preferences (PreferencesSection)

- Restaure tel quel (preferences `coach.tone`, `coach.challenge_level`, etc.)

### Carte de defense — systeme de gestion des pulsions

La Carte de defense est un artefact central de la transformation, genere par un
appel LLM **separe et differe** (pas dans le plan generation, pour ne pas
ralentir). Elle cartographie les pulsions dominantes et fournit un systeme
de defense structure.

**Les 4 roles:**

1. **Le Stratege** 🗺️ — cartographie toutes les situations/moments ou la pulsion
   peut survenir. C'est le **terrain** : quand, ou, avec qui, dans quel contexte.
   Pre-rempli par l'IA basee sur le contexte de la transformation, le free text,
   et les reponses au questionnaire.
   Ex: "Retour du travail fatigue, 18h-19h" / "Soiree seul devant la tele"

2. **Le Surveillant** 👁️ — identifie le **signal interne observable** qui annonce
   la pulsion dans chaque situation. Ce n'est PAS la situation elle-meme, c'est
   ce qui se passe dans le corps/les pensees/le micro-comportement juste avant
   la bascule. Le signal doit etre concret et observable, pas vague.
   Pre-rempli par l'IA.
   ✅ "Je soupire, je regarde machinalement le placard"
   ✅ "Je prends mon tel sans but depuis 5 min"
   ✅ "Serrement dans le ventre, respiration courte"
   ❌ "Je suis stresse" (trop vague → reformuler en signal observable)
   ❌ "Je suis fatigue" (c'est une situation, pas un signal)

3. **Le Defenseur** 🛡️ — une carte de reactions pour chaque situation. Quand le
   trigger arrive, voila EXACTEMENT quoi faire (< 30 secondes, ultra concret).
   Pre-rempli par l'IA avec des reponses adaptees au profil.

4. **Le Comptable** 📊 — note chaque victoire (pulsion dominee), meme la plus
   petite. Pas les echecs, UNIQUEMENT les wins.

**La courbe du Comptable:**

La courbe attendue est **decroissante** sur le long terme:
- Debut: beaucoup de pulsions a combattre → beaucoup de victoires a noter
- Progression: le cerveau se reprogramme → moins de batailles → moins de wins
- Maturite: tres peu de pulsions → la carte devient un souvenir de victoire

Message cle au user: "Si tes victoires diminuent, c'est le signe que ta
transformation fonctionne — il y a moins de batailles a mener."

**Identification des pulsions:**

L'IA deduit la ou les pulsions dominantes du contexte (free text + questionnaire
+ type de transformation). Le user ne les renseigne PAS lui-meme. La carte peut
contenir 1 a 3 pulsions, chacune avec ses propres situations/signaux/reponses.

**Generation et iteration:**

- Generee par un appel LLM differe apres le plan generation (comme
  `inspiration_narrative`)
- Stockee comme artefact separe en DB (pas dans `PlanContentV3`, mais liee a la
  transformation)
- Iterable: Sophia peut proposer des modifications en conversation ("Tu m'as
  parle d'une nouvelle situation — je l'ajoute a ta carte ?")
- Un endpoint `update-defense-card-v3` permet les modifications live

**Logging des victoires (Le Comptable):**

Deux modes de saisie:
1. **Quick-log** — bouton rapide directement dans la carte sur le dashboard
   ("+1 victoire" avec choix de la situation)
2. **Conversationnel** — Sophia detecte les victoires en conversation et
   les logge automatiquement ("Bien joue! Tu as resiste au grignotage hier
   soir — je note ca.")

**Export imprimable:**

La carte peut etre exportee en PDF/image, formatee pour impression A4 ou
smartphone wallpaper. Le user peut la coller sur son frigo, son bureau, etc.
C'est du "nudge physique" dans l'environnement reel.

### Elements supprimes

- **Actions personnelles** (`user_personal_actions`) — tuees. Sophia se concentre
  sur la transformation. Si le user n'y arrive pas seul, c'est une
  transformation. S'il y arrive, il n'a pas besoin de l'app.
- **North Star** (`cycle_north_star_suggestion`) — remplacee par
  le Heartbeat par phase
- **Priorisation manuelle** (`PlanPriorities`, route `/plan-priorities`) —
  retiree. La roadmap review conversationnelle remplace le drag-and-drop.

## Architecture cle (inchangee)

- Frontend: React + TypeScript + Tailwind (mobile-first)
- Backend: Supabase Edge Functions (Deno)
- Brain: `supabase/functions/sophia-brain/` (routeur, momentum, coaching,
  memory, etc.)
- DB: PostgreSQL via Supabase

## Ce qui est heritage de la V2 et ne change PAS

- Onboarding flow (capture → validation → cristallisation → questionnaire →
  profile → plan) — le questionnaire est enrichi, la priorisation manuelle est
  supprimee et remplacee par un ordonnancement IA, le choix de duree est supprime
- Systemes vivants (momentum, bilans, coaching, nudges, memoire) — adaptes aux
  phases mais pas refondus
- ConversationPulse, daily/weekly bilans, proactive windows — inchanges
  (juste scopes a la phase en cours)
- Dispatcher et routing — inchanges
- Schema DB existant — etendu, pas casse
- Multi-transformation + handoff — reutilises pour les parcours > 6 mois

## Regles

- Ne jamais modifier les tables legacy destructivement
- Ne jamais push sur le remote sans demande explicite
- Ne jamais run `supabase db reset` ou commandes destructives
- Toujours verifier la conformite avec `v2-technical-schema.md`
- Les items des 3 dimensions (support, missions, habits) EXISTENT TOUJOURS,
  ils sont juste regroupes par phase au lieu d'etre en 3 listes plates

## Avancement des lots

| Lot | Etape | Statut |
|-----|-------|--------|
| A — Questions structurees + calibrage | A.1 Enrichir prompt questionnaire | FAIT |
| A — Questions structurees + calibrage | A.2 Extraction champs structures | FAIT |
| A — Questions structurees + calibrage | A.3 Test bout en bout | FAIT |
| A2 — Onboarding V3: Roadmap + suppression priorisation | A2.1 Prompt cristallisation enrichi | FAIT |
| A2 — Onboarding V3: Roadmap + suppression priorisation | A2.2 Composant RoadmapReview | FAIT |
| A2 — Onboarding V3: Roadmap + suppression priorisation | A2.2b Endpoint update-roadmap-v3 | FAIT |
| A2 — Onboarding V3: Roadmap + suppression priorisation | A2.2c Mode roadmap_review sophia-brain | FAIT |
| A2 — Onboarding V3: Roadmap + suppression priorisation | A2.4 Suppression choix duree MinimalProfile | A FAIRE |
| B — Nouveau modele de plan par phases | B.1 Types TypeScript V3 | FAIT |
| B — Nouveau modele de plan par phases | B.2 Migration DB phases + journey_context | FAIT |
| B — Nouveau modele de plan par phases | B.3 Prompt plan generation V3 | FAIT |
| B — Nouveau modele de plan par phases | B.4 Validateur plan V3 | FAIT |
| B — Nouveau modele de plan par phases | B.5 Distribution V3 | FAIT |
| B — Nouveau modele de plan par phases | B.6 Endpoint generate-plan-v2 adapte V3 | FAIT |
| C — Dashboard V3 | C.0 UX specs V3 | FAIT |
| C — Dashboard V3 | C.1 Restaurer Preferences + Rendez-vous | FAIT |
| C — Dashboard V3 | C.2 StrategyHeader enrichi | FAIT |
| C — Dashboard V3 | C.3 Composant PhaseProgression | FAIT |
| C — Dashboard V3 | C.4 Indicateur parcours multi-part | FAIT |
| C — Dashboard V3 | C.5 Supprimer NorthStarV2 | FAIT |
| C — Dashboard V3 | C.6 Hooks dashboard V3 | FAIT |
| C — Dashboard V3 | C.7 Wiring page DashboardV3 | FAIT |
| D — Atelier d'inspirations | D.1 Narration inspirationnelle | FAIT |
| D — Atelier d'inspirations | D.2 Principes debloquables | FAIT |
| D — Atelier d'inspirations | D.3 Composant AtelierInspirations | FAIT |
| E — Adaptation systemes vivants | E.1 Active load scope par phase | FAIT |
| E — Adaptation systemes vivants | E.2 Daily/weekly bilan scopes par phase | FAIT |
| E — Adaptation systemes vivants | E.3 Morning nudge scope phase + heartbeat proche | FAIT |
| E — Adaptation systemes vivants | E.4 Momentum state scope par phase | FAIT |
| F — Cleanup | F.1 Supprimer user_personal_actions | FAIT |
| F — Cleanup | F.2 Supprimer North Star residuel | FAIT |
| F — Cleanup | F.3 Supprimer PlanPriorities et references | FAIT |
| G — Carte de defense (pulsions) | G.1 Types + migration DB | FAIT |
| G — Carte de defense (pulsions) | G.2 Prompt LLM generation carte | FAIT |
| G — Carte de defense (pulsions) | G.3 Edge function generate-defense-card-v3 | FAIT |
| G — Carte de defense (pulsions) | G.4 Endpoint update-defense-card-v3 | FAIT |
| G — Carte de defense (pulsions) | G.5 Composant DefenseCard | FAIT |
| G — Carte de defense (pulsions) | G.6 Quick-log victoires + courbe comptable | FAIT |
| G — Carte de defense (pulsions) | G.7 Detection conversationnelle victoires | FAIT |
| G — Carte de defense (pulsions) | G.8 Export PDF/image | FAIT |

## Fichiers crees/modifies (V3)

| Fichier | Nature |
|---------|--------|
| `supabase/functions/_shared/v2-prompts/questionnaire.ts` | Modifie — bloc questions obligatoires de calibrage |
| `supabase/functions/_shared/v2-prompts/plan-generation.ts` | Modifie — 4 champs calibrage dans PlanGenerationInput + bloc calibrage dans le user prompt |
| `supabase/functions/generate-plan-v2/index.ts` | Modifie — extractStructuredCalibrationFields (exportee) |
| `supabase/functions/generate-plan-v2/calibration_chain_test.ts` | Cree — 9 tests chaine calibrage A.3 |
| `supabase/functions/_shared/v2-prompts/cristallisation.ts` | Modifie — ordonnancement logique (dependance), `order_rationale` → `ordering_rationale` |
| `supabase/functions/crystallize-v2/index.ts` | Modifie — Zod schema + references `ordering_rationale` |
| `supabase/functions/cycle-draft/index.ts` | Modifie — reference `ordering_rationale` |
| `frontend/src/lib/onboardingV2.ts` | Modifie — type + usage `ordering_rationale` |
| `frontend/src/components/onboarding-v2/RoadmapReview.tsx` | Cree — roadmap visuelle + chat Sophia + polling live |
| `frontend/src/pages/OnboardingV2.tsx` | Modifie — stage priorities affiche RoadmapReview inline; cleanup F retire les derniers reliquats PlanPriorities/North Star |
| `supabase/functions/update-roadmap-v3/index.ts` | Cree — endpoint CRUD roadmap (reorder, add, remove, rename) avec logique exportee |
| `supabase/functions/sophia-brain/agents/roadmap_review.ts` | Cree — agent roadmap_review avec 4 tools LLM + execution + follow-up |
| `supabase/functions/sophia-brain/router/agent_exec.ts` | Modifie — case roadmap_review dans le switch |
| `supabase/functions/sophia-brain/state-manager.ts` | Modifie — AgentMode + 'roadmap_review' |
| `supabase/functions/sophia-brain/index.ts` | Modifie — extraction roadmapContext du body, forceMode roadmap_review |
| `supabase/functions/sophia-brain/router/run.ts` | Modifie — roadmapContext dans opts processMessage, forward a runAgentAndVerify |
| `supabase/functions/_shared/v2-types.ts` | Modifie — B.1: types V3 (`HeartbeatMetric`, `PlanPhase`, `PlanContentV3`) + `phase_id` sur `UserPlanItemRow` |
| `frontend/src/types/v2.ts` | Modifie — B.1: miroir des types V3 |
| `supabase/functions/_shared/v2-prompts/plan-generation.ts` | Modifie — B.3/B.4: `PLAN_GENERATION_V3_SYSTEM_PROMPT`, `buildPlanGenerationV3UserPrompt`, `validatePlanV3Output`, `duration_months` optionnel dans `PlanGenerationInput` |
| `supabase/functions/_shared/v2-plan-distribution.ts` | Modifie — B.1 fix: `phase_id: null` dans le mapping V2 |
| `docs/v3-dashboard-ux-specs.md` | Cree — C.0: Specs UX du nouveau Dashboard V3 (phases, heartbeat, restauration V1) |
| `frontend/src/components/dashboard-v2/PreferencesSection.tsx` | Cree — C.1: restauration du composant Preferences depuis `13510e1^` |
| `frontend/src/components/dashboard-v2/RemindersSection.tsx` | Cree — C.1: restauration du composant Rendez-vous depuis `13510e1^` |
| `frontend/src/components/dashboard-v2/CreateReminderModal.tsx` | Cree — C.1: restauration du modal de creation/edition des rendez-vous |
| `frontend/src/pages/DashboardV2.tsx` | Modifie — C.1: integration de `RemindersSection` et `PreferencesSection` en bas de page |
| `frontend/src/components/dashboard-v2/StrategyHeader.tsx` | Modifie — C.2+C.4: ajout `successDefinition`, `mainConstraint`, `journeyContext` props + badge multi-part + barre segmentee |
| `frontend/src/components/dashboard-v2/PhaseProgression.tsx` | Cree — C.3: progression verticale par phases (3 etats: completed/active/future), HeartbeatGauge, timeline |
| `frontend/src/hooks/useDashboardV2Data.ts` | Modifie — C.6: ajout `planContentV3` state, parsing V3 via `toPlanContentV3()` |
| `frontend/src/hooks/useDashboardV2Logic.ts` | Modifie — C.6: ajout `PhaseRuntimeData`, `buildPhaseRuntime()`, `phases`, `currentPhase`, `completedPhases`, `pendingPhases` |
| `frontend/src/pages/DashboardV2.tsx` | Modifie — C.5+C.7+D.3: suppression du bloc North Star, layout conditionnel V2/V3, placeholder DefenseCard, AtelierInspirations wired |
| `frontend/src/App.tsx` | Modifie — F.3: route legacy `/plan-priorities` retiree |
| `frontend/src/hooks/useDashboardV2Data.ts` | Modifie — F.2: fetch cycle North Star retire, hook recentre sur plan V2/V3 + items runtime |
| `frontend/src/components/dashboard-v2/NorthStarV2.tsx` | Supprime — F.2: composant residuel retire du codebase |
| `frontend/src/pages/PlanPriorities.tsx` | Supprime — F.3: ancien ecran drag-and-drop retire du codebase |
| `frontend/src/types/v2.ts` | Modifie — F.2: `cycle_north_star_suggestion` retire de `PlanContentV2` |
| `supabase/functions/_shared/v2-types.ts` | Modifie — F.2: `cycle_north_star_suggestion` retire du contrat backend `PlanContentV2` |
| `supabase/functions/_shared/v2-prompts/plan-generation.ts` | Modifie — F.2: prompt V2 nettoye, plus de suggestion North Star dans le JSON attendu |
| `supabase/functions/_shared/v2-plan-distribution.ts` | Modifie — F.2: distribution V2/V3 ne cree plus ni ne journalise de North Star cycle-level |
| `supabase/functions/_shared/v2-plan-distribution_test.ts` | Modifie — F.2: fixtures/algo alignes sur la suppression du reliquat North Star |
| `supabase/functions/generate-plan-v2/index.ts` | Modifie — F.2: reponse cleanup, plus de `north_star_metric_id` |
| `supabase/functions/generate-plan-v2/index_test.ts` | Modifie — F.2: fixture de validation alignee sur le contrat V3 actuel |
| `supabase/functions/sophia-brain/knowledge/frontend-site-map.ts` | Modifie — F.3: `/plan-priorities` retire de la cartographie frontend |
| `supabase/migrations/20260327120000_add_unlocked_principles.sql` | Cree — D.2: ajout `unlocked_principles` jsonb sur `user_transformations` (defaut `{"kaizen": true}`) |
| `supabase/functions/_shared/v2-unlock-principles.ts` | Cree — D.2: helper `checkAndUnlockPrinciples` (detection + persistence) |
| `supabase/functions/_shared/v2-types.ts` | Modifie — D.2: ajout `unlocked_principles` sur `UserTransformationRow` |
| `frontend/src/types/v2.ts` | Modifie — D.2: miroir `unlocked_principles` sur `UserTransformationRow` |
| `supabase/functions/sophia-brain/conversation_pulse_builder.ts` | Modifie — D.2: wiring ikigai unlock apres generation du pulse |
| `frontend/src/hooks/useDashboardV2Logic.ts` | Modifie — D.2: wiring wabi-sabi/hara-hachi-bu/gambaru unlock apres logItemEntry |
| `frontend/src/components/dashboard-v2/AtelierInspirations.tsx` | Cree — D.3: narration inspirationnelle + 5 principes japonais (locked/unlocked cards, collapsible) |
| `supabase/functions/_shared/v2-runtime.ts` | Modifie — E.1/E.2/E.3/E.4: ajout du scope partage `current_phase`, contexte Heartbeat et helper de filtrage des items runtime |
| `supabase/functions/_shared/v2-active-load.ts` | Modifie — E.1: active load scope sur la phase courante + habitudes en maintenance des phases completes comptees en charge legere |
| `supabase/functions/trigger-daily-bilan/index.ts` | Modifie — E.2: daily bilan charge maintenant les items scopes sur la phase courante |
| `supabase/functions/_shared/v2-prompts/weekly-recalibrage.ts` | Modifie — E.2: ajout `phase_context` dans l'input LLM weekly (Heartbeat, transition_ready, almost_reached) |
| `supabase/functions/trigger-weekly-bilan/v2_weekly_bilan.ts` | Modifie — E.2: propagation du `phaseContext` dans l'assemblage du bilan hebdo |
| `supabase/functions/trigger-weekly-bilan/index.ts` | Modifie — E.2: weekly bilan charge maintenant le runtime scope phase via `getScopedPlanItemRuntime()` |
| `supabase/functions/sophia-brain/momentum_morning_nudge.ts` | Modifie — E.3: nudge matinal scope sur la phase courante, contexte Heartbeat dans le grounding, celebration possible quand la phase approche du seuil |
| `supabase/functions/sophia-brain/momentum_state.ts` | Modifie — E.4: `execution_traction`, `plan_fit` et blockers consolides sur les items scopes a la phase courante |
| `supabase/functions/sophia-brain/active_load_engine_test.ts` | Modifie — E.1: test du scope phase + charge legere maintenance |
| `supabase/functions/_shared/v2-weekly-bilan-engine_test.ts` | Modifie — E.2: test `phase_context` dans l'input weekly |
| `supabase/functions/sophia-brain/momentum_morning_nudge_test.ts` | Modifie — E.3: test celebration ping quand le Heartbeat est presque atteint |
| `supabase/functions/sophia-brain/momentum_state_v2_test.ts` | Modifie — E.4: fixtures alignees sur le contrat `phase_id` runtime |
| `supabase/migrations/20260327130000_create_defense_card_tables.sql` | Cree — G.1: tables `user_defense_cards` et `user_defense_wins` avec RLS et index |
| `supabase/functions/_shared/v2-types.ts` | Modifie — G.1: types `ImpulseTrigger`, `DominantImpulse`, `DefenseCardContent`, `UserDefenseCardRow`, `UserDefenseWinRow` |
| `frontend/src/types/v2.ts` | Modifie — G.1: miroir des types defense card |
| `supabase/functions/_shared/v2-prompts/defense-card.ts` | Cree — G.2: `DEFENSE_CARD_SYSTEM_PROMPT`, `buildDefenseCardUserPrompt`, `validateDefenseCardOutput` |
| `supabase/functions/generate-defense-card-v3/index.ts` | Cree — G.3: edge function generation carte de defense (LLM jsonMode + validation + persist) |
| `supabase/functions/update-defense-card-v3/index.ts` | Cree — G.4: endpoint CRUD carte de defense (5 actions: add_trigger, update_trigger, remove_trigger, add_impulse, update_defense) |
| `frontend/src/components/dashboard-v2/DefenseCard.tsx` | Cree — G.5: composant DefenseCard (4 roles, tabs impulses, SparkLine, quick-log picker) |
| `frontend/src/hooks/useDefenseCard.ts` | Cree — G.6: hook `useDefenseCard` (card + wins + weeklyWins + trend + logWin + generate) |
| `frontend/src/pages/DashboardV2.tsx` | Modifie — G.5+G.6: integration DefenseCard + useDefenseCard + export |
| `supabase/functions/sophia-brain/agents/defense_card_reviewer.ts` | Cree — G.7: agent detection conversationnelle victoires (2 tools: log_defense_win, add_trigger_to_card) — LEGACY, remplace par dispatcher signal |
| `supabase/functions/sophia-brain/agents/defense_card_watcher.ts` | Cree — G.7b: detection batch (watcher 4h) de nouveaux triggers dans conversations recentes |
| `supabase/functions/sophia-brain/router/agent_exec.ts` | Modifie — G.7: side-channel defense card SUPPRIME, victoires detectees par dispatcher |
| `supabase/functions/sophia-brain/router/dispatcher.ts` | Modifie — G.7b: signal `defense_card_win` ajoute au dispatcher (detection + prompt + parsing) |
| `supabase/functions/sophia-brain/router/run.ts` | Modifie — G.7b: handler `defense_card_win` → log DB + addon companion, appel parallele |
| `supabase/functions/sophia-brain/context/loader.ts` | Modifie — G.7b: addons `defenseCardWinAddon` + `defenseCardPendingTriggersAddon` |
| `supabase/functions/sophia-brain/context/types.ts` | Modifie — G.7b: champs `defenseCardWinAddon` + `defenseCardPendingTriggersAddon` dans LoadedContext |
| `frontend/src/lib/exportDefenseCard.ts` | Cree — G.8: export PDF (print window) + PNG (html2canvas fallback) de la carte de defense |
| `frontend/src/types/html2canvas.d.ts` | Cree — G.8 fix: declaration locale pour garder `html2canvas` optionnel sans casser TypeScript |
| `supabase/functions/generate-plan-v2/index.ts` | Modifie — Fix transitive type-check: `unlocked_principles: null` sur les split transformations |

## Decisions prises en cours de route

- Les questions obligatoires de calibrage sont TOUJOURS reposees meme si une reponse
  existe deja dans `existing_answers` (exception explicite dans le prompt)
- La cible UX "~6 questions" a ete precisee comme etant pour les questions libres
  uniquement (hors les 4 obligatoires)
- `extractStructuredCalibrationFields` exportee pour testabilite
- `order_rationale` renomme en `ordering_rationale` partout (cristallisation type,
  Zod, crystallize-v2, cycle-draft, frontend) pour aligner avec le contrat V3
- L'ordonnancement dans le prompt de cristallisation est maintenant base sur la
  logique de dependance (fondamentaux → habilitants → objectifs finaux), plus sur
  l'importance percue ou le quick win
- Le stage `"priorities"` dans OnboardingV2 affiche maintenant `RoadmapReview`
  inline (plus de navigation vers `/plan-priorities`). Meme avec 1 seule transfo,
  la roadmap est affichee.
- L'onboarding passe de 5 a 6 etapes (la roadmap a sa propre etape "Ton parcours")
- Le chat dans RoadmapReview utilise le scope `roadmap_review` pour sophia-brain
  (le mode/agent correspondant reste a implementer — A2.3)
- `PlanPriorities.tsx` et la route `/plan-priorities` sont maintenant supprimes.
  Le stage `"priorities"` est conserve comme identifiant technique du draft /
  backend pour eviter une migration de contrat inutile.
- `executeRoadmapAction` est exportee depuis `update-roadmap-v3/index.ts` pour
  etre reutilisee directement par l'agent roadmap_review (pas d'appel HTTP interne)
- L'agent roadmap_review utilise le function calling natif de Gemini (4 tools
  declares en `function_declarations`). Quand le LLM choisit un tool, l'agent
  l'execute puis fait un second appel LLM pour generer le message de confirmation
- Le mode roadmap_review est active automatiquement quand `scope === "roadmap_review"`
  (detecte dans index.ts, force en tant que `forceMode` dans processMessage)
- Le frontend envoie `cycle_id`, `transformations`, `is_first_onboarding` dans le
  body du call sophia-brain quand scope est roadmap_review — ces champs sont
  forwards comme `roadmapContext` jusqu'a l'agent via opts
- `AgentMode` enrichi avec `'roadmap_review'` — pas de risque de regression car
  le default case dans agent_exec reste `companion`
- B.1: `phase_id: string | null` ajoute sur `UserPlanItemRow` (backend + frontend).
  `phase_order?: number | null` ajoute en optionnel pour la distribution. `PlanContentV2`
  et `PlanContentItem` inchanges (backward compat).
- B.1: `v2-plan-distribution.ts` corrige pour passer `phase_id: null` (sinon erreur TS)
- B.3: `PlanGenerationInput.duration_months` rendu optionnel (`?:`) — V3 ne l'utilise
  plus comme input (l'IA decide). V2 continue de le passer.
- B.3: `buildPlanGenerationV3UserPrompt` est une NOUVELLE fonction (V2 builder intact).
  Le user prompt V3 ne mentionne plus la duree comme input.
- B.3: format temp_id V3 = `gen-p{N}-{dimension}-{NNN}` (au lieu de `gen-{dimension}-{NNN}`)
- B.4: `validatePlanV3Output` valide le format temp_id V3 via regex, verifie la
  coherence phase_number dans le temp_id, et verifie `after_habit_traction.min_completions`
- B.4: le validateur V2 (`validatePlanOutput`) a ete legerement refactore pour utiliser
  des helpers `isNonEmptyString`/`isPlainObject` partages — meme logique, code plus lisible
- C.0: Les sections "Préférences" et "Rendez-vous" du Dashboard V1 ont été analysées via l'historique Git (`13510e1^`) et leurs spécifications UX ont été intégrées dans le nouveau layout V3.
- C.1: Les composants legacy `PreferencesSection`, `RemindersSection` et `CreateReminderModal`
  ont ete restaures dans `dashboard-v2` depuis `13510e1^`; les imports relatifs
  n'ont pas eu besoin de changer car le modal reste sibling et les chemins
  `../../lib/*` / `../../context/*` restent valides apres le deplacement.
- C.1: `DashboardV2.tsx` affiche maintenant les sections Rendez-vous puis Preferences
  en bas du dashboard, apres les sections principales et le bloc "Prochain focus".
- C.2+C.4: `StrategyHeader` accepte maintenant `successDefinition`, `mainConstraint` et
  `journeyContext` en props. `success_definition` est dans une carte Trophy, `main_constraint`
  dans un bloc ambre AlertCircle. Multi-part: badge violet
  "Partie N sur total" + barre segmentee + texte explicatif. N'apparait que si
  `journey_context.is_multi_part === true`.
- C.3: `PhaseProgression.tsx` cree avec 3 sous-composants (CompletedPhase, ActivePhase,
  FuturePhase). Timeline verticale avec nodes colores par etat. HeartbeatGauge affiche
  une barre de progression violette + compteur "[current] / [target] [unit]". Les items
  de la phase active reutilisent `PlanItemCard` (pas de composant duplique).
- C.5 puis F.2: le reliquat `NorthStarV2.tsx` a finalement ete supprime. Les infos
  `success_definition` et `main_constraint` restent absorbees dans le `StrategyHeader`,
  et le hook dashboard ne fetch plus la metric cycle-level associee.
- F.1: aucun code runtime frontend/backend ne consommait encore `user_personal_actions`.
  Les references historiques laissees en base/migrations sont conservees volontairement:
  pas de DROP, pas de reecriture de l'historique SQL.
- F.2: `cycle_north_star_suggestion` est retire du contrat `PlanContentV2`, du prompt
  V2 et de la distribution legacy. `generate-plan-v2` ne renvoie plus
  `north_star_metric_id`.
- F.3: la cartographie frontend et le routing ont ete nettoyes pour retirer
  `PlanPriorities` et toute exposition du flow drag-and-drop obsolete.
- C.6: `useDashboardV2Data` expose `planContentV3: PlanContentV3 | null` en plus de
  `planContent: PlanContentV2 | null`. Parsing conditionnel via `content.version`.
  `useDashboardV2Logic` accepte `planContentV3` en param et expose `phases`,
  `currentPhase`, `completedPhases`, `pendingPhases` (type `PhaseRuntimeData`).
  L'etat d'une phase est determine par les statuts de ses items (tous completed/maintenance
  = phase completed; premier non-complete = active; reste = future). La logique V2
  (dimensionGroups) est conservee pour backward compat.
- C.7: `DashboardV2.tsx` rend conditionnellement le layout V3 (PhaseProgression) ou V2
  (DimensionSections) selon `planContentV3 != null`. Placeholders pour DefenseCard (Lot G)
  et AtelierInspirations (Lot D) affiches uniquement en mode V3. Le guard
  `!planContent` remplace par `!activePlanContent` (union V2/V3) pour accepter les plans V3.
- C.7: Les references textuelles "V2" dans les messages UI (loading, empty state) ont ete
  neutralisees ("Dashboard" au lieu de "Dashboard V2").
- D.1: `inspiration_narrative` est deja genere par le prompt V3 (B.3) et valide par
  `validatePlanV3Output` (B.4). D.1 consiste uniquement a l'afficher dans le composant
  `AtelierInspirations` — pas de travail prompt supplementaire necessaire.
- D.2: `unlocked_principles` est stocke sur `user_transformations` (pas sur `user_plans_v2`)
  car les principes sont lies au parcours de transformation, pas au plan courant.
  Defaut `{"kaizen": true}` applique a toutes les lignes existantes et nouvelles.
- E.1/E.2/E.3/E.4: un helper partage dans `v2-runtime.ts` determine la phase courante
  pour les plans V3. La regle reprend celle du dashboard: une phase est "completee"
  si TOUS ses items sont `completed` ou `in_maintenance`; la premiere phase non completee
  devient la phase active; les suivantes restent hors scope.
- E.1/E.2/E.3/E.4: les systemes vivants V3 ne regardent plus tout le plan. Ils
  consomment les items de la phase active, plus les habitudes en maintenance des
  phases deja completees pour conserver un rappel leger des acquis.
- E.1: les habitudes en maintenance des phases precedentes ajoutent +1 de charge
  chacune dans `active_load` (charge legere), sans rouvrir les compteurs mission /
  support / habit building.
- E.2: le weekly recoit maintenant un `phase_context` explicite (phase active,
  Heartbeat, `heartbeat_almost_reached`, `transition_ready`). Le prompt peut
  suggere qu'une transition de phase est proche ou possible dans le reasoning /
  coaching_note, mais aucun nouvel ajustement JSON n'a ete ajoute pour materialiser
  la transition automatiquement.
- E.3: le morning nudge reutilise ce meme contexte de phase. Quand le Heartbeat
  est proche, il peut basculer sur `celebration_ping` meme sans victoire ledger
  recente, avec un message qui felicite l'approche du seuil sans annoncer une
  transition comme certaine.
- E.3: `heartbeat_almost_reached` est calcule prioritairement via `heartbeat.current / target`
  quand disponible. Si `current` est absent, fallback pragmatique sur la completion
  des items de la phase (`>= 75%` = "presque atteint", `100%` = transition ready).
- D.2: Le helper `checkAndUnlockPrinciples` est fire-and-forget (`.catch()`) pour ne pas
  bloquer le flow principal (logging d'entree, generation de pulse). Les erreurs sont
  loguees mais n'impactent pas l'UX.
- D.2: La detection ikigai est basee sur des keywords dans `highlights.wins` du
  ConversationPulse. Approche pragmatique — peut etre affinee plus tard avec un scoring
  LLM si les faux positifs sont trop frequents.
- D.2: Le wiring frontend pour wabi-sabi/hara-hachi-bu/gambaru est dans `logItemEntry`
  de `useDashboardV2Logic` car c'est le point unique ou les entries sont logguees et les
  statuts mis a jour cote frontend. Le backend (conversation_pulse_builder) gere ikigai.
- D.3: `AtelierInspirations` est collapsible par defaut (ferme au chargement). Choix UX:
  le contenu inspirationnel ne doit pas occuper de l'espace dans le dashboard quotidien,
  mais etre accessible en un tap.
- D.3: Les principes verrouilles affichent un cadenas + "?" sans indication du nom, pour
  creer un effet de decouverte/surprise lors du deblocage.
- G.1: La carte de defense est stockee dans une table separee `user_defense_cards` (pas dans
  `PlanContentV3`) car c'est un artefact iterable independamment du plan. La relation est via
  `transformation_id` avec contrainte UNIQUE (1 carte par transformation).
- G.1: `user_defense_wins` a un index composite `(defense_card_id, logged_at DESC)` pour
  l'affichage chronologique performant dans le composant comptable. Les policies RLS
  `SELECT` et `INSERT` passent par une verification d'appartenance via `user_defense_cards`
  (la table des wins n'a pas de `user_id` propre).
- G.2: Le prompt du defenseur exige des reponses realisables en < 30 secondes et ne demandant
  pas de volonte excessive. Si le contexte ne permet pas d'identifier de pulsions claires, une
  carte "resistance au changement" est generee par defaut.
- G.3: `generate-defense-card-v3` retourne la carte existante si elle existe deja pour la
  transformation (idempotent), mais le controle d'ownership est fait AVANT ce retour.
  La generation est declenchee par le frontend au premier affichage du dashboard.
- G.3: La fonction `extractStructuredCalibrationFields` est importee depuis `generate-plan-v2`
  pour reutiliser l'extraction des champs calibrage sans duplication.
- G.4: `executeDefenseCardAction` est exportee depuis `update-defense-card-v3/index.ts` pour
  etre reutilisee par l'agent `defense_card_reviewer` (meme pattern que roadmap_review).
- G.4: Les 5 actions supportees couvrent l'ajout/modification/suppression de triggers et
  impulses. La suppression du dernier trigger est interdite.
- G.5: Le composant DefenseCard utilise des tabs pour switcher entre pulsions multiples
  (plutot qu'un accordeon) pour garder un layout compact.
- G.5: La palette est stone + accents: sky pour le stratege, amber pour le surveillant,
  emerald pour le defenseur, stone neutre pour le comptable.
- G.6: La courbe SparkLine affiche les 7 dernieres semaines. Le trend est calcule sur les
  3 dernieres semaines (rising/stable/falling). Messages contextuels adaptes.
- G.6: Le hook `useDefenseCard` expose une methode `generate()` pour declencher la creation
  de la carte depuis le dashboard si elle n'existe pas encore. Les quick-logs
  verifient maintenant les erreurs DB et ne celebrent plus un succes si l'insert a echoue.
- G.7: ARCHITECTURE REVISEE — La detection des victoires (`defense_card_win`) est integree
  directement dans le dispatcher existant comme signal supplementaire (pas de side-channel LLM).
  Quand le dispatcher detecte une victoire, le router:
  1. Logge la victoire dans `user_defense_wins` (source = "conversation")
  2. Injecte un addon `__defense_card_win_addon` dans le companion pour qu'il felicite l'utilisateur
  L'ancien side-channel `checkDefenseCardSignals` dans `agent_exec.ts` a ete SUPPRIME.
- G.7b: La detection de NOUVEAUX TRIGGERS (situations non cartographiees) est deplacee dans
  le watcher batch (toutes les ~4h). Le watcher analyse les messages recents avec un LLM
  et stocke les triggers potentiels dans `__defense_card_pending_triggers` (temp_memory).
  Au prochain echange, le companion peut proposer naturellement d'ajouter ces situations a la carte.
- G.7 (legacy): L'agent `defense_card_reviewer.ts` reste en codebase pour reference mais
  n'est plus appele par le router. Les 2 tools restent utilisables par `update-defense-card-v3`.
- G.8: L'export utilise `window.open` + `window.print()` pour le PDF (pas de dependance
  externe). Fallback html2canvas pour l'export PNG. L'import est runtime-only et garde
  le package optionnel: si `html2canvas` n'est pas installe, on retombe proprement sur
  l'impression PDF. Le layout print est adapte A4 avec des cases a cocher manuelles pour
  le tracking hors-app.

## Rituel de fin de conversation

**OBLIGATOIRE avant de fermer.** Copier-coller ce bloc tel quel:

```
Avant de finir cette conversation, execute le rituel de cloture complet:

## 1. MISE A JOUR DU SUIVI (`docs/v3-context-prompt.md`)

- Mets a jour le statut de chaque lot/etape
- Ajoute dans "Decisions prises en cours de route" toute decision importante
- Si un nouveau fichier a ete cree, l'ajouter dans la table "Fichiers crees"
- Si une decision canonique a change, mettre a jour la section correspondante

## 2. MISE A JOUR DU PLAYBOOK (`docs/v3-execution-playbook.md`)

- Marque les etapes terminees avec **Statut: FAIT**
- Si une etape a diverge du plan initial, mets a jour le contenu

## 3. PROPAGATION DES CHANGEMENTS

- Un nouveau fichier a ete cree? → Verifier les references croisees
- Un type ou table a change? → Verifier v2-technical-schema.md
- Une decision de contrat a change? → Propager dans les docs impactes

## 4. CHECK DE COHERENCE RAPIDE

- Pas de reference a des noms V2 obsoletes (dimensions plates, north_star)
- Pas de type duplique entre docs
- Les numeros de section dans les renvois sont encore corrects

## 5. RESUME DE FIN

Ecris un court resume de ce qui a ete fait, ce qui reste, et les points
d'attention pour la conversation suivante.
```
