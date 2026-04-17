# V3 Execution Playbook

## Statut

Document operationnel d'execution pour la refonte V3 (Heartbeat).

Ce document s'appuie sur:

- `docs/v3-context-prompt.md` — contexte V3 et decisions canoniques
- `docs/v2-technical-schema.md` — schema technique existant (sera etendu)
- `docs/v2-execution-playbook.md` — playbook V2 (pour reference)

Il ne redefinit pas la cible. Il dit exactement comment l'atteindre, etape par
etape, avec quel outil.

## Modeles et roles

### Claude (Cursor)

Acces complet au repo. Edite les fichiers, lance les commandes, a le contexte du
code.

Forces: architecture, validation, coherence cross-docs, code review, refactoring
structure, decisions de contrat.

Usage: decisions d'architecture, validation, structuration des types et prompts,
review de tout ce que GPT produit.

### GPT (Codex)

Acces au repo. Genere du code rapidement, implemente en volume.

Forces: implementation rapide, generation bulk, code boilerplate, migrations SQL,
generation de prompts LLM.

Usage: production de code, migrations, implementation de fonctions, wiring.

### Gemini (review Claude pour l'UI)

Pas d'acces repo direct. Travaille sur des specs/mockups. Review Claude valide.

Forces: UX/UI, design produit, organisation visuelle, prototypage d'ecrans,
critique UX.

Usage: design de flows, mockups, critique d'experience, structure de composants
UI.

### Regle d'orchestration

- Claude valide ce que GPT produit
- GPT implemente ce que Claude structure
- Gemini designe ce que Claude et GPT vont construire, Claude review
- Aucun code ne merge sans review Claude
- Aucun design UX ne se code sans validation Gemini + review Claude

---

# PARTIE 1 — VUE GLOBALE

## Lots V3

```
Lot A: Questions structurees + calibrage               [A FAIRE]
  A.1 Prompt questionnaire enrichi (Claude)
  A.2 Extraction champs structures (GPT)
  A.3 Integration dans plan generation input (GPT)

Lot A2: Onboarding V3 — Roadmap + suppression prio    [A FAIRE]
  A2.1  Prompt cristallisation enrichi — ordonnancement IA (Claude)
  A2.2  Composant RoadmapReview — roadmap + chat live (Claude + GPT)
  A2.2b Endpoint update-roadmap-v3 (Claude + GPT)
  A2.2c Mode roadmap_review dans sophia-brain (Claude)
  A2.3  Suppression choix duree dans MinimalProfile (GPT)
  A2.4  Ecran transition Roadmap V2 — post-plan gen (GPT)

Lot B: Nouveau modele de plan par phases               [FAIT]
  B.1 Types TypeScript V3 (Claude)
  B.2 Migration DB pour phases + journey_context (GPT)
  B.3 Prompt plan generation V3 — phases + split (Claude)
  B.4 Validateur plan V3 (Claude)
  B.5 Distribution V3 (GPT)
  B.6 Edge function generate-plan V3 + split logic (GPT)

Lot C: Dashboard V3 — Coeur                            [FAIT]
  C.0 UX specs V3 (Gemini + review Claude)
  C.1 Restaurer Preferences + Rendez-vous (GPT)
  C.2 StrategyHeader enrichi (Claude)
  C.3 Composant PhaseProgression (Claude)
  C.4 Indicateur parcours multi-part (Claude)
  C.5 Supprimer NorthStarV2 (Claude)
  C.6 Hooks dashboard V3 (Claude)
  C.7 Wiring page DashboardV3 (Claude)

Lot D: Atelier d'inspirations                          [A FAIRE]
  D.1 Narration inspirationnelle (Claude prompt + GPT implementation)
  D.2 Principes debloquables — tracking + UI (GPT)
  D.3 Composant AtelierInspirations (GPT)

Lot E: Adaptation systemes vivants                     [A FAIRE]
  E.1 Adapter active_load aux phases (GPT)
  E.2 Adapter daily/weekly bilan aux phases (GPT)
  E.3 Adapter morning nudge aux phases (GPT)
  E.4 Adapter momentum state aux phases (GPT)

Lot G: Carte de defense (systeme pulsions)             [A FAIRE]
  G.1 Types + migration DB carte de defense (Claude + GPT)
  G.2 Prompt LLM generation carte de defense (Claude)
  G.3 Edge function generate-defense-card-v3 (GPT)
  G.4 Endpoint update-defense-card-v3 (GPT)
  G.5 Composant DefenseCard (GPT + Gemini design)
  G.6 Quick-log victoires + courbe comptable (GPT)
  G.7 Detection conversationnelle victoires (Claude) — REFACTO: dispatcher signal + watcher batch
  G.7b Watcher batch: detection nouveaux triggers (Claude)
  G.8 Export imprimable PDF/image (GPT)

Lot F: Cleanup                                         [A FAIRE]
  F.1 Supprimer user_personal_actions du codebase (GPT)
  F.2 Supprimer North Star residuel (GPT)
  F.3 Supprimer PlanPriorities.tsx et references (GPT)
  F.4 Review finale Claude
```

## Timeline estimee

```
Semaine 1:    Lot A (questions structurees)
Semaine 1-3:  Lot A2 (onboarding V3 — roadmap conversationnelle + suppression prio)
Semaine 3-5:  Lot B (nouveau modele de plan — phases + split)
Semaine 3:    Lot C.0 (UX specs Gemini)
Semaine 5-6:  Lot C.1-C.7 (dashboard V3)
Semaine 6-7:  Lot D (atelier d'inspirations)
Semaine 7-8:  Lot G (carte de defense)
Semaine 8-9:  Lot E (adaptation systemes vivants)
Semaine 9:    Lot F (cleanup)
```

Note: Lot A et Lot A2 sont le chemin critique (A2 est plus complexe avec le chat
integre). Lot C.0 peut demarrer en parallele de Lot B. Lot D et Lot G peuvent
demarrer des que C.7 est livre (dashboard wire). Lot A et A2 sont presque
independants et peuvent etre traites en parallele.
Lot G peut etre traite en parallele de Lot D (2 sections dashboard independantes).

## Gestion des conversations

| Conversation | Contenu                                   | Fin de conversation                                              |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| Conv 1       | Lot A complet (A.1 → A.3)                | Quand les 4 questions structurees sont injectees dans le flow    |
| Conv 2       | Lot A2.1 + A2.3 (cristallisation + duree) | Quand ordonnancement IA et suppression duree fonctionnels       |
| Conv 2b      | Lot A2.2 → A2.2c (roadmap conversationnelle) | Quand chat + roadmap live fonctionnels                       |
| Conv 2c      | Lot A2.4 (ecran transition Roadmap V2)    | Quand transition post-split fonctionnelle                       |
| Conv 3       | Lot B.1 → B.4 (types + prompt + valid.)  | Quand le prompt V3 produit du JSON valide. **CP1**               |
| Conv 4       | Lot B.5 → B.6 (distribution + split)     | Quand plan generation V3 fonctionne end-to-end + split           |
| Conv 5       | Lot C.0 (UX specs Gemini)                | Quand mockups dashboard V3 valides par Claude                    |
| Conv 6       | Lot C.1 → C.4 (restore + header + phases)| Quand la progression par phases s'affiche. **CP2**               |
| Conv 7       | Lot C.5 → C.7 (cleanup NorthStar + wire) | Quand dashboard V3 complet                                       |
| Conv 8       | Lot D complet (D.1 → D.3)                | Quand atelier d'inspirations fonctionnel                         |
| Conv 9       | Lot G.1 → G.5 (carte defense backend+UI) | Quand carte de defense affichee sur dashboard                    |
| Conv 10      | Lot G.6 → G.8 (quick-log + courbe + PDF) | Quand logging victoires + export fonctionnels. **CP3b**          |
| Conv 11      | Lot E complet (E.1 → E.4)                | Quand systemes vivants adaptes aux phases. **CP3**               |
| Conv 12      | Lot F complet (F.1 → F.4)                | Quand cleanup termine, review finale                             |

---

# PARTIE 2 — CHECKPOINTS DE RECALIBRAGE

## CP1 — Apres Lot B.4 (Plan generation V3)

**Question:** le plan genere par le LLM est-il conforme au nouveau modele par
phases ?

Verifier:

- [ ] Le JSON genere contient `phases[]` avec des Heartbeat par phase
- [ ] La premiere phase est calibree selon struggle_duration / prior_attempts /
      self_confidence
- [ ] Le Heartbeat de chaque phase reflete l'ACTION, pas le but final
- [ ] Chaque phase a un `rationale`
- [ ] Les items des 3 dimensions sont presents dans les phases
- [ ] La chaine de transition entre phases est coherente
- [ ] Tester sur 5+ cas: poids, cigarette, procrastination, parentalite,
      sociabilite

## CP2 — Apres Lot C.3 (Dashboard phases)

**Question:** la progression par phases s'affiche-t-elle correctement ?

Verifier:

- [ ] Phase en cours depliee avec Heartbeat visible
- [ ] Phases futures verrouillees (titre seulement)
- [ ] Phases completees compactees
- [ ] Items dans la phase interactifs (check-in possible)
- [ ] Pas de regression sur les sections restaurees (RDV, preferences)

## CP3 — Apres Lot E (Systemes vivants)

**Question:** les systemes vivants fonctionnent-ils avec le modele par phases ?

Verifier:

- [ ] Active load calcule correctement par phase active
- [ ] Daily bilan cible les items de la phase en cours
- [ ] Weekly bilan peut proposer des ajustements intra-phase
- [ ] Morning nudge reflete la phase en cours
- [ ] Momentum state detecte les items stalled dans la phase active

---

# PARTIE 3 — LOTS DETAILLES

---

## LOT A — QUESTIONS STRUCTUREES + CALIBRAGE

### Objectif

Enrichir le questionnaire avec 4 questions obligatoires qui capturent
l'historique de tentatives et l'indicateur de reussite, puis passer ces donnees
au LLM de generation de plan.

### Ce qui change

- `QUESTIONNAIRE_SYSTEM_PROMPT` enrichi avec bloc de questions obligatoires
- Extraction backend des reponses `_system_*` en champs structures
- `PlanGenerationInput` enrichi avec les 4 champs
- `buildPlanGenerationUserPrompt` enrichi avec le bloc de calibrage

### Ce qui ne change PAS

- Le flow onboarding frontend (meme nombre d'ecrans)
- Les tables DB existantes (pas de nouvelle migration pour ce lot)
- Le schema du questionnaire (les 4 questions SONT des `QuestionnaireQuestion`,
  avec des `capture_goal` speciaux)

---

### Etape A.1 — Enrichir le prompt questionnaire

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** decision d'architecture du prompt, formulation des contraintes

**Prompt:**

```
# Tache: Etape A.1 — Enrichir le prompt questionnaire

Lis `docs/v3-context-prompt.md` puis:

1. Ouvre `supabase/functions/_shared/v2-prompts/questionnaire.ts`

2. Modifie `QUESTIONNAIRE_SYSTEM_PROMPT` pour ajouter un nouveau bloc apres les
   regles existantes:

   ## Questions obligatoires de calibrage

   En PLUS de tes questions libres, tu DOIS inclure ces 4 questions en FIN de
   questionnaire. Tu dois les formuler naturellement en t'adaptant au sujet de
   la transformation. La structure est imposee, la formulation est libre.
   Ces 4 questions doivent etre posees meme si une reponse proche existe deja
   dans `existing_answers`.

   Les IDs de ces questions doivent etre `sys_q1`, `sys_q2`, `sys_q3`,
   `sys_q4`.

   ### Question obligatoire 1 — Anciennete du probleme
   - capture_goal: "_system_struggle_duration"
   - kind: "single_choice"
   - options (5): equivalent de "Quelques semaines" / "Quelques mois" /
     "1-2 ans" / "Plus de 3 ans" / "Aussi loin que je me souvienne"
   - Formule la question en utilisant le sujet de la transformation, pas son
     titre brut. Ex: pour la perte de poids → "Depuis combien de temps ton
     poids est un sujet qui te pese ?"

   ### Question obligatoire 2 — Tentatives passees
   - capture_goal: "_system_prior_attempts"
   - kind: "single_choice"
   - options (4): equivalent de "C'est ma premiere fois" / "1-2 fois" /
     "3-5 fois" / "J'ai perdu le compte"

   ### Question obligatoire 3 — Confiance
   - capture_goal: "_system_self_confidence"
   - kind: "single_choice"
   - options (5): echelle de "Tres faible (1)" a "Tres confiant (5)"

   ### Question obligatoire 4 — Indicateur de reussite
   - capture_goal: "_system_success_indicator"
   - kind: "free_text"
   - Formule la question pour obtenir l'indicateur concret de reussite.
     Ex: pour la perte de poids → "C'est quoi ton objectif de poids ?"
     Ex: pour la parentalite → "C'est quoi la situation concrete avec tes
     enfants qui te ferait sentir que t'as vraiment change ?"

3. Ne modifie PAS les regles existantes du prompt, sauf:
   - la contrainte quantitative
   - la regle `Ne PAS poser une question si l'information est deja connue dans
     existing_answers`, qui doit explicitement exclure ces 4 questions
     obligatoires
   - la regle `Au moins 1 free_text`, qui devient `Au moins 1 free_text parmi
     tes questions libres` pour eviter qu'elle soit satisfaite uniquement par
     la question obligatoire `success_indicator`

4. Mets a jour les contraintes quantitatives: "Entre 3 et 8 questions" →
   "Entre 3 et 8 questions libres + 4 questions obligatoires de calibrage"

5. Verifie que `deno check` passe.
```

**Output:** `questionnaire.ts` mis a jour
**Validation:** le prompt genere toujours un JSON valide avec les 4 questions
supplementaires

---

### Etape A.2 — Extraction des champs structures

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** implementation mecanique, extraction de donnees

**Prompt:**

```
# Tache: Etape A.2 — Extraction des champs structures

Lis `docs/v3-context-prompt.md` puis:

1. Dans `supabase/functions/generate-plan-v2/index.ts`, apres la recuperation
   des `questionnaire_answers` de la transformation:

   - Cherche les reponses dont la cle commence par `_system_` ou dont le
     `capture_goal` du schema questionnaire contient `_system_`
   - Extrais-les en 4 champs types:
     - `struggle_duration: string | null` (la valeur de l'option choisie)
     - `prior_attempts: string | null`
     - `self_confidence: number | null` (1-5)
     - `success_indicator: string | null` (texte libre)

2. Ajoute ces 4 champs a `PlanGenerationInput` dans
   `supabase/functions/_shared/v2-prompts/plan-generation.ts`

3. Dans `buildPlanGenerationUserPrompt`, ajoute un nouveau bloc:

   ## Calibrage de l'effort initial

   - Anciennete du probleme: [struggle_duration]
   - Tentatives passees: [prior_attempts]
   - Confiance (1-5): [self_confidence]
   - Indicateur de reussite: [success_indicator]

4. Verifie que `deno check` passe sur les deux fichiers modifies.
```

**Output:** `plan-generation.ts` et `generate-plan-v2/index.ts` mis a jour
**Validation:** les 4 champs sont presents dans le prompt user envoye au LLM

---

### Etape A.3 — Test de bout en bout

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** validation de la chaine complete

**Action:** generer un questionnaire de test, verifier que les 4 questions
apparaissent, que les reponses sont correctement extraites, et que le prompt
de plan generation les recoit.

**Resultat:** 9 tests dans `calibration_chain_test.ts` couvrant:
- Presence des 4 capture_goals dans le prompt questionnaire
- Exception existing_answers pour les questions obligatoires
- Extraction option_id → label via schema
- Extraction directe via cles `_system_*`
- Fallback nulls quand pas de donnees
- Bloc calibrage dans le prompt plan generation (avec valeurs + fallback)
- Chaine complete: schema + answers → extraction → prompt plan
- `extractStructuredCalibrationFields` exportee pour testabilite

---

## LOT A2 — ONBOARDING V3: ROADMAP + SUPPRESSION PRIORISATION

### Objectif

Remplacer la priorisation manuelle (drag-and-drop) par un ordonnancement IA
avec re-priorisation conversationnelle en temps reel, supprimer le choix de
duree, et implementer le mecanisme Roadmap V1/V2.

### Ce qui change

- `CRISTALLISATION_SYSTEM_PROMPT` enrichi: l'IA ordonne les transformations
  logiquement et explique l'ordre
- `PlanPriorities.tsx` remplace par `RoadmapReview.tsx`: ecran avec roadmap
  visuelle + chat integre Sophia pour re-priorisation live
- `MinimalProfile.tsx` simplifie: suppression du choix `durationMonths`
- Nouvel ecran de transition post-plan-generation si la roadmap change (split)
- Nouvel endpoint `update-roadmap-v3` pour modifier les transformations en DB
  via les instructions de Sophia pendant le chat
- Mode `roadmap_review` dans sophia-brain pour donner a Sophia le contexte
  et les tools de modification de roadmap

### Ce qui ne change PAS

- Le flow capture → validation → cristallisation → questionnaire → profile → plan
- Les tables DB existantes
- Le mecanisme multi-transformation du cycle V2

---

### Etape A2.1 — Prompt cristallisation enrichi

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** decision d'architecture du prompt

**Prompt:**

```
# Tache: Etape A2.1 — Enrichir la cristallisation avec ordonnancement IA

Lis `docs/v3-context-prompt.md` puis:

1. Ouvre `supabase/functions/_shared/v2-prompts/cristallisation.ts`

2. Ajoute dans le prompt de cristallisation un bloc:

   ## Ordonnancement logique

   Tu dois proposer un ORDRE pour les transformations. Cet ordre n'est PAS
   base sur l'importance ressentie par l'utilisateur, mais sur la logique
   de dependance:

   - Les problemes fondamentaux d'abord (sommeil, sante de base, sante
     mentale critique)
   - Les habilitants ensuite (ce qui debloque le reste: energie, confiance,
     routine)
   - Les objectifs finaux en dernier (performance, social, projets specifiques)

   Pour chaque transformation, ajoute un champ `ordering_rationale` qui
   explique en 1 phrase pourquoi elle est a cette position.

   Exemple: "Le sommeil est fondamental: sans energie, rien d'autre ne
   tiendra."

3. Ajoute `ordering_rationale: string` au type de sortie de la cristallisation.

4. L'output de la cristallisation doit inclure `recommended_order` (qui
   existe deja) ET le nouveau `ordering_rationale` par transformation.
```

**Output:** prompt cristallisation enrichi
**Validation:** l'ordre propose est logique sur 3+ cas tests

---

### Etape A2.2 — Composant RoadmapReview (roadmap + chat live)

**Statut:** FAIT

**Modele:** Claude (architecture) + GPT (implementation)
**Pourquoi:** composant central de la re-priorisation, architecture chat + DB

**Prompt:**

```
# Tache: Etape A2.2.A — Composant RoadmapReview avec chat Sophia integre

Lis `docs/v3-context-prompt.md` section "Roadmap conversationnelle" puis:

1. Cree `frontend/src/components/onboarding-v2/RoadmapReview.tsx`:

   Layout split (mobile-first):
   - HAUT: vue visuelle de la roadmap (liste ordonnee des transformations)
     - Chaque transformation: titre + ordering_rationale + badge statut
     - Transformations faites: check vert, compactees
     - Transformation suivante: mise en valeur
     - Transformations futures: grises mais visibles
   - BAS: chat integre avec Sophia (reutiliser le composant chat existant
     ou en creer un leger)
   - Bouton "C'est parti" toujours visible (sticky bottom)

   Le chat:
   - Sophia ouvre avec un message contextuel:
     - Premier onboarding: "Voila l'ordre que je te propose pour ton
       parcours. [explication]. Tu veux qu'on en discute ou on demarre ?"
     - Transition: "Bravo pour [transfo terminee]! Voici la suite de ton
       parcours. Quelque chose a change depuis ? On ajuste ?"
   - Le user peut repondre en texte libre
   - Sophia peut modifier la roadmap en temps reel (voir A2.2b)

2. Props:
   - transformations: tableau des transformations avec ordre et statut
   - isFirstOnboarding: boolean (change le message d'accueil)
   - previousTransformation?: objet (pour le contexte de transition)
   - onConfirm: callback quand le user valide

3. La roadmap se rafraichit via un polling court (2s) ou un realtime
   subscription sur `user_transformations` pour refleter les changements
   faits par Sophia pendant le chat.

4. Remplace `PlanPriorities.tsx` dans le flow onboarding.
```

**Output:** `RoadmapReview.tsx` fonctionnel
**Validation:** le user voit la roadmap, peut chatter, la roadmap se met a jour

---

### Etape A2.2b — Endpoint update-roadmap-v3

**Statut:** FAIT

**Modele:** Claude (architecture) + GPT (implementation)
**Pourquoi:** backend pour la modification live de la roadmap

**Prompt:**

```
# Tache: Etape A2.2b — Endpoint update-roadmap-v3

1. Cree `supabase/functions/update-roadmap-v3/index.ts`:

   Actions supportees (envoyees par sophia-brain pendant le chat):
   - `reorder`: changer l'ordre des transformations
   - `add`: ajouter une nouvelle transformation (titre + description)
   - `remove`: supprimer une transformation (passer en status "cancelled")
   - `rename`: renommer une transformation

   Input: { user_id, action, payload }
   Output: { success, updated_transformations[] }

2. L'endpoint modifie directement `user_transformations` en DB:
   - `priority_order` pour le reorder
   - INSERT pour le add (status "pending", needs crystallization? or direct?)
   - UPDATE status pour le remove
   - UPDATE title pour le rename

3. Securite: verifier que le user_id correspond au JWT.

4. Cet endpoint est aussi callable comme "tool" par sophia-brain en mode
   `roadmap_review` (voir E.5).
```

**Output:** endpoint fonctionnel
**Validation:** les modifications sont persistees et visibles cote frontend

---

### Etape A2.2c — Mode roadmap_review dans sophia-brain

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** architecture du mode conversationnel

**Prompt:**

```
# Tache: Etape A2.2c — Mode roadmap_review pour sophia-brain

1. Dans le routeur sophia-brain, ajoute un mode `roadmap_review` qui:
   - Injecte dans le contexte:
     - La liste des transformations actuelles (ordre, statut, rationale)
     - Les resultats de la transformation precedente (si applicable)
     - Le ConversationPulse recent (si applicable)
   - Donne a Sophia un system prompt adapte:
     "Tu es en mode revue de roadmap. L'utilisateur voit sa roadmap et
     peut te demander de la modifier. Tu as acces a un outil
     `update_roadmap` pour modifier l'ordre, ajouter, supprimer ou
     renommer des transformations. Quand tu modifies la roadmap,
     l'utilisateur voit les changements en temps reel."
   - Enregistre `update-roadmap-v3` comme tool callable par le LLM
     (function calling / tool use)

2. Le mode est active quand le frontend ouvre le chat depuis
   `RoadmapReview.tsx` (un flag dans le message ou un endpoint specifique).

3. Le mode se termine quand le user valide la roadmap (bouton "C'est parti").
```

**Output:** mode roadmap_review fonctionnel dans sophia-brain
**Validation:** Sophia peut modifier la roadmap pendant le chat

---

### Etape A2.3 — Suppression choix duree

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape A2.3 — Supprimer le choix de duree dans MinimalProfile

1. Dans `frontend/src/components/onboarding-v2/MinimalProfile.tsx`:
   - Retire le bloc PACING_OPTIONS et le sélecteur de duree
   - Garde birth_date et gender

2. Dans `frontend/src/lib/onboardingV2.ts`:
   - Rends `durationMonths` optionnel ou retire-le du type `MinimalProfileDraft`

3. Dans `frontend/src/pages/OnboardingV2.tsx` (handleProfileSubmit):
   - Ne passe plus de duree choisie par l'utilisateur
   - Le flow actuel passe une valeur de reference par defaut (`2`) au cycle
     pour rester compatible avec `generate-plan-v2` tant que le Lot B
     n'a pas remplace la logique

4. L'IA decidera de la duree au plan generation (Lot B).
```

**Output:** MinimalProfile simplifie
**Validation:** l'ecran profile ne demande plus la duree

---

### Etape A2.4 — Ecran transition Roadmap V2

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape A2.4 — Ecran de transition Roadmap V2

Cree un ecran de transition qui s'affiche apres le plan generation SI la
roadmap a change (transformation splittee).

1. Le plan generation retourne un flag `roadmap_changed: boolean` et le
   nouveau `journey_context` s'il y a eu un split.
   - Implementation actuelle: `generate-plan-v2` expose deja ces 2 champs
     dans sa reponse. Tant qu'aucun split reel n'est produit par le plan V2,
     ils valent `false` / `null`.

2. Si `roadmap_changed`:
   - Affiche un ecran intermediaire avant le dashboard:
     - Titre: "Ton parcours a ete affine"
     - Explication: "D'apres tes reponses, [transformation] est un parcours
       en [N] etapes. Voici le plan mis a jour:"
     - Liste: les transformations mises a jour avec durees estimees
     - Indicateur: "Partie 1 sur [N] — ~[X] mois"
     - Bouton: "C'est parti"

3. Si pas de split: passer directement au dashboard (pas d'ecran).
```

**Output:** ecran transition Roadmap V2
**Validation:** l'ecran ne s'affiche que quand la roadmap change

---

## LOT B — NOUVEAU MODELE DE PLAN PAR PHASES

### Objectif

Remplacer la structure `dimensions[]` du plan par `phases[]` avec Heartbeat par
phase, tout en preservant les items des 3 dimensions a l'interieur de chaque
phase.

### Ce qui change

- `PlanContentV3` remplace `PlanContentV2` (ou V2 evolue vers V3)
- `PLAN_GENERATION_SYSTEM_PROMPT` reecrit pour les phases + calibrage + split
- `validatePlanOutput` adapte
- `distributePlanItems` adapte (ajout `phase_id` sur les rows)
- `user_plan_items` recoit une colonne `phase_id` ou `phase_order`
- `PlanContentV3` inclut `journey_context` pour les parcours multi-part
- `duration_months` n'est plus un input utilisateur mais un output IA
- Logique de split: si duree estimee > 6 mois, genere plan tranche 1 +
  `continuation_hint` + stub de transformation suivante

### Ce qui ne change PAS

- Les 3 dimensions (support, missions, habits) comme TYPES d'items
- Les `activation_condition` entre items au sein d'une phase
- Le cycle d'execution des items (entries, reps, maintenance)
- Les tables `user_cycles`, `user_transformations`
- Le mecanisme multi-transformation + handoff (reutilise pour le split)

---

### Etape B.1 — Types TypeScript V3

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** decision d'architecture des types

**Prompt:**

```
# Tache: Etape B.1 — Types TypeScript V3

Lis `docs/v3-context-prompt.md` puis:

1. Dans `supabase/functions/_shared/v2-types.ts`, ajoute les types suivants:

   type HeartbeatMetric = {
     title: string;        // ex: "Cigarettes notees par jour"
     unit: string;         // ex: "cigarettes", "jours", "occurrences/semaine"
     current: number | null;
     target: number;
     tracking_mode: "manual" | "inferred";
   };

   type PlanPhase = {
     phase_id: string;     // ex: "phase-1"
     phase_order: number;  // 1, 2, 3...
     title: string;        // ex: "Observer et comprendre"
     rationale: string;    // ex: "On commence par observer..."
     heartbeat: HeartbeatMetric;
     items: PlanContentItem[];  // items de toutes dimensions
   };

   type PlanContentV3 = {
     version: 3;
     cycle_id: string;
     transformation_id: string;
     duration_months: number;  // decide par l'IA (1-6), plus choisi par le user
     title: string;
     user_summary: string;
     internal_summary: string;
     strategy: {
       identity_shift: string | null;
       core_principle: string | null;
       success_definition: string;
       main_constraint: string;
     };
     inspiration_narrative: string;  // NOUVEAU: histoire forward-looking
     phases: PlanPhase[];
     timeline_summary: string;
     journey_context?: {  // NOUVEAU: pour les parcours multi-part (split > 6 mois)
       is_multi_part: boolean;
       part_number: number;
       estimated_total_parts: number;
       continuation_hint: string | null;
       estimated_total_duration_months: number | null;
     } | null;
     metadata: Record<string, unknown>;
   };

2. Garde `PlanContentV2` et `PlanContentItem` intacts (backward compat).
   `PlanContentItem` est reutilise tel quel dans les phases.

3. Ajoute un champ optionnel `phase_id: string | null` sur le type
   `UserPlanItemRow` (pour la distribution).

4. Miroir dans `frontend/src/types/v2.ts`.

5. Verifie `deno check` et `npx tsc --noEmit`.
```

**Output:** types V3 ajoutes dans les deux fichiers
**Validation:** compilation OK

---

### Etape B.2 — Migration DB pour phases + journey_context

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** generation SQL

**Prompt:**

```
# Tache: Etape B.2 — Migration DB pour phases + journey_context

Lis `docs/v3-context-prompt.md` puis:

1. Cree une migration additive:

   -- Ajouter phase_id et phase_order sur user_plan_items
   ALTER TABLE public.user_plan_items
     ADD COLUMN IF NOT EXISTS phase_id text NULL,
     ADD COLUMN IF NOT EXISTS phase_order integer NULL;

   CREATE INDEX IF NOT EXISTS user_plan_items_phase_idx
     ON public.user_plan_items (plan_id, phase_order);

   -- Ajouter ordering_rationale sur user_transformations (pour Roadmap V1)
   ALTER TABLE public.user_transformations
     ADD COLUMN IF NOT EXISTS ordering_rationale text NULL;

2. Pas besoin de nouvelle table pour les phases elles-memes: les phases vivent
   dans le JSON `user_plans_v2.content` (comme les dimensions avant). Seuls
   les `user_plan_items` distribues ont besoin du lien phase.

3. Le `journey_context` vit dans `user_plans_v2.content` (JSON), pas besoin
   de colonne separee.

4. `duration_months` existe deja sur `user_cycles` — il sera mis a jour par
   le plan generation au lieu d'etre set par le user.

5. Ne modifie AUCUNE table existante de facon destructive.
```

**Output:** migration SQL
**Validation:** `phase_id`, `phase_order`, `ordering_rationale` ajoutees

---

### Etape B.3 — Prompt plan generation V3

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** decision d'architecture critique, le prompt LLM est le coeur du
changement

**Prompt:**

```
# Tache: Etape B.3 — Prompt plan generation V3

Lis `docs/v3-context-prompt.md` puis:

1. Ouvre `supabase/functions/_shared/v2-prompts/plan-generation.ts`

2. Cree un nouveau `PLAN_GENERATION_V3_SYSTEM_PROMPT` qui remplace
   `PLAN_GENERATION_SYSTEM_PROMPT`. Le nouveau prompt doit:

   a. Expliquer l'architecture par phases (plus par dimensions plates)
   b. Definir le Heartbeat par phase: la metrique reflete l'ACTION de la
      phase, pas le but final
   c. Integrer les regles de calibrage:

      ## Calibrage de l'effort initial

      Tu recois 4 champs de calibrage:
      - struggle_duration: anciennete du probleme
      - prior_attempts: nombre de tentatives passees
      - self_confidence: confiance (1-5)
      - success_indicator: ce qui constitue le succes pour l'utilisateur

      Regles de calibrage:
      - Si self_confidence <= 2 OU prior_attempts >= 4: commence par une
        phase d'observation pure. Premiere habitude = effort < 2 minutes,
        pas de changement de comportement demande, juste observer/noter.
        Le Heartbeat mesure l'observation, pas le resultat.
      - Si self_confidence == 3 ET prior_attempts 1-3: premiere phase =
        effort modere. Habitude simple mais pas triviale.
      - Si self_confidence >= 4 ET premiere tentative: plan standard.
      - Plus le parcours est difficile, plus il y a de phases avec des
        paliers plus petits.

   d. Definir les transitions de phase: quand le Heartbeat atteint son
      seuil, la phase suivante se debloque
   e. Preciser que le Heartbeat peut CHANGER de metrique entre phases
   f. Preciser que les items au sein d'une phase utilisent toujours les
      activation_condition existantes entre eux
   g. Generer un champ `inspiration_narrative`: une histoire forward-looking
      basee sur ce que l'utilisateur a dit, montrant ou le parcours peut
      mener. 3-5 phrases, ton narratif et empathique.
   h. Conserver les regles sur les items (personnalisation, concretude,
      types par dimension)
   i. Adapter les caps de charge: au sein d'une phase, max 1-2 missions,
      1-2 supports recommended_now, max 2 habits en construction
   j. Integrer la logique de duree et de split:

      ## Duree et split

      L'IA decide la duree du plan basee sur les 4 champs de calibrage +
      le gap implicite dans le free text:
      - Duree max par plan: 6 mois
      - Si la duree estimee depasse 6 mois, genere UNIQUEMENT le plan
        pour la premiere tranche (max 6 mois) et renseigne
        `journey_context`:
        - `is_multi_part: true`
        - `part_number: 1`
        - `estimated_total_parts`: estimation raisonnable
        - `continuation_hint`: description de ce qui reste a faire
        - `estimated_total_duration_months`: estimation totale
      - Si la duree est <= 6 mois: `journey_context` est null

   Contraintes quantitatives:
   - 3 a 8 phases par plan (selon calibrage)
   - Chaque phase: 1 a 5 items (toutes dimensions confondues)
   - Au moins 1 habit par phase
   - Au moins 1 item actif des le debut de chaque phase
   - Chaque phase a un Heartbeat avec title, unit, target et tracking_mode
   - `duration_months` est un output IA (1 a 6), pas un input user

3. Mets a jour `PlanGenerationInput` pour inclure les 4 champs de calibrage.

4. Mets a jour `buildPlanGenerationUserPrompt` pour formater les phases
   attendues et le bloc de calibrage.

5. Verifie `deno check`.
```

**Output:** prompt V3 + input/builder mis a jour
**Validation:** le prompt est coherent et complet

---

### Etape B.4 — Validateur plan V3

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** validation structurelle critique

**Prompt:**

```
# Tache: Etape B.4 — Validateur plan V3

1. Dans `plan-generation.ts`, cree `validatePlanV3Output(raw)` qui valide:
   - version === 3
   - cycle_id, transformation_id, duration_months presents
   - phases est un array de 3 a 8 elements
   - Chaque phase a: phase_id unique, phase_order sequentiel, title,
     rationale, heartbeat (title, unit, target, tracking_mode)
   - Chaque phase a au moins 1 item
   - Les items respectent les memes regles que V2 (kinds, dimensions,
     tracking_type, activation_condition)
   - Les depends_on au sein d'une phase referencent des temp_id de la MEME
     phase (pas cross-phase)
   - inspiration_narrative est un string non vide
   - strategy est present et complet

2. Garde `validatePlanOutput` (V2) intact pour backward compat.

3. Verifie `deno check`.
```

**Output:** `validatePlanV3Output` dans `plan-generation.ts`
**Validation:** le validateur detecte les erreurs structurelles

---

### Etape B.5 — Distribution V3

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** implementation mecanique

**Prompt:**

```
# Tache: Etape B.5 — Distribution V3

1. Ouvre `supabase/functions/_shared/v2-plan-distribution.ts`

2. Cree `distributePlanItemsV3(supabase, planId, content: PlanContentV3)`
   qui:
   - Itere sur content.phases au lieu de content.dimensions
   - Pour chaque item, renseigne `phase_id` et `phase_order` dans la row
     user_plan_items
   - Resout les depends_on au sein de chaque phase (meme logique que V2)
   - La premiere phase a ses items actifs au demarrage (meme logique
     activation_condition null/immediate)
   - Les phases 2+ ont TOUS leurs items en `pending` (meme ceux avec
     activation_condition null) — ils ne s'activent que quand la phase
     se debloque
   - Stocke les phases et leur Heartbeat quelque part recuperable (dans
     le JSON content du plan, deja persiste dans user_plans_v2.content)

3. Garde `distributePlanItems` (V2) intact.

4. Verifie `deno check`.
```

**Output:** `distributePlanItemsV3` dans `v2-plan-distribution.ts`
**Validation:** items distribues avec `phase_id` correct

---

### Etape B.6 — Edge function generate-plan V3

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** wiring, implementation

**Prompt:**

```
# Tache: Etape B.6 — Edge function generate-plan V3 + split logic

1. Modifie `supabase/functions/generate-plan-v2/index.ts` pour:
   - Utiliser `PLAN_GENERATION_V3_SYSTEM_PROMPT` au lieu du V2
   - Appeler `validatePlanV3Output` au lieu de `validatePlanOutput`
   - Appeler `distributePlanItemsV3` au lieu de `distributePlanItems`
   - Passer les 4 champs de calibrage dans `PlanGenerationInput`

2. Ajoute la logique de split post-generation:
   - Si `content.journey_context?.is_multi_part === true`:
     a. Met a jour `duration_months` sur le cycle en cours avec la duree
        IA (pas la valeur user qui n'existe plus)
     b. Cree une transformation "pending" pour la partie suivante avec
        un titre derive du `continuation_hint`
     c. Retourne `roadmap_changed: true` dans la reponse au frontend
   - Si pas de split: `roadmap_changed: false`

3. Verifie que le endpoint accepte toujours le meme format d'appel
   (transformation_id) et retourne le meme format de reponse (+
   `roadmap_changed` et `journey_context` optionnels).

4. Verifie `deno check`.
```

**Output:** `generate-plan-v2/index.ts` mis a jour pour V3 + split
**Validation:** generation end-to-end fonctionnelle, split cree une transfo pending

---

## LOT C — DASHBOARD V3

### Objectif

Restructurer le dashboard autour de la progression par phases + Heartbeat,
restaurer les sections Preferences et Rendez-vous de la V1, absorber North Star
dans le header.

---

### Etape C.0 — UX specs V3

**Statut:** FAIT

**Modele:** Gemini + review Claude
**Pourquoi:** design UX avant implementation

**Prompt Gemini:**

```
# Tache: Specs UX Dashboard V3

Je travaille sur Sophia, une app de transformation personnelle. Le dashboard V3
remplace une structure a 3 sections plates (support/missions/habits) par une
progression verticale par phases.

Voici le layout cible:

1. StrategyHeader — hero avec titre, resume, intention, mantra,
   + success_definition et main_constraint (absorbes depuis North Star)

2. Atelier d'inspirations — histoire forward-looking + 5 principes japonais
   debloquables (Kaizen, Ikigai, Hara Hachi Bu, Wabi-sabi, Gambaru)

3. Progression par phases (section principale):
   - Chaque phase = un bloc vertical avec:
     - Objectif/Heartbeat (metrique + progression)
     - Items (habits, missions, support) depliables
   - Phase en cours: depliee, items interactifs
   - Phases futures: verrouillees (titre objectif + cadenas)
   - Phases completees: compactees avec check vert + resume
   - Progression visuelle entre phases (ligne verticale, fleches)

4. Section Rendez-vous — prochains RDV avec Sophia

5. Section Preferences — ton, challenge, etc.

Contraintes:
- Mobile-first (375px min)
- Design system: Tailwind, rounded-[28-32px] cards, stone palette,
  ombres douces
- Pas de surcharge visuelle — focus sur la phase en cours
- Les items dans une phase sont secondaires, le Heartbeat est le hero
- Les phases verrouillees creent de la curiosite (pas de frustration)

Produis des specs UX detaillees avec:
- Layout et hierarchie visuelle pour chaque section
- Etats: phase active, completee, verrouillée
- Micro-copy pour chaque etat
- Interactions: deplier/replier, logger un check-in, transition de phase
- Animations: transition de phase, deblocage de principe
- Edge cases: 1 seule phase, toutes completees, pas de plan
```

**Output:** `docs/v3-dashboard-ux-specs.md`
**Validation:** review Claude pour coherence avec l'architecture

---

### Etape C.1 — Restaurer Preferences + Rendez-vous

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** restauration mecanique de code supprime

**Prompt:**

```
# Tache: Etape C.1 — Restaurer Preferences et Rendez-vous

1. Restaure les 3 fichiers depuis le commit 13510e1^ (dernier etat avant
   suppression):

   git show 13510e1^:frontend/src/components/dashboard/PreferencesSection.tsx \
     > frontend/src/components/dashboard-v2/PreferencesSection.tsx

   git show 13510e1^:frontend/src/components/dashboard/RemindersSection.tsx \
     > frontend/src/components/dashboard-v2/RemindersSection.tsx

   git show 13510e1^:frontend/src/components/dashboard/CreateReminderModal.tsx \
     > frontend/src/components/dashboard-v2/CreateReminderModal.tsx

2. Mets a jour les imports relatifs si necessaire (le dossier cible est
   dashboard-v2, pas dashboard).

3. Integre les deux sections dans DashboardV2.tsx en bas de page, apres les
   sections principales.

4. Verifie que `npm run build` passe.
```

**Output:** 3 fichiers restaures, integres au dashboard
**Validation:** build OK, sections visibles

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape C.2 — StrategyHeader enrichi

**Statut:** FAIT

**Modele:** GPT (Codex)
**Pourquoi:** implementation simple

**Prompt:**

```
# Tache: Etape C.2 — Absorber success_definition et main_constraint

1. Modifie `StrategyHeader.tsx` pour accepter `successDefinition: string | null`
   et `mainConstraint: string | null` en props.

2. Ajoute une troisieme carte dans la grille (apres "Mon intention" et
   "Mon mantra"):
   - Si successDefinition: carte "Definition de reussite"
   - Si mainConstraint: bloc ambre "Contrainte a garder en tete"
     (reprendre le design de NorthStarV2)

3. Mets a jour DashboardV2.tsx pour passer ces props.

4. Verifie `npm run build`.
```


**Output:** `StrategyHeader.tsx` enrichi
**Validation:** les infos North Star apparaissent dans le header

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape C.3 — Composant PhaseProgression

**Statut:** FAIT

**Modele:** GPT (Codex), design Gemini valide
**Pourquoi:** composant central du nouveau dashboard

**Prompt:**

```
# Tache: Etape C.3 — Composant PhaseProgression

Cree `frontend/src/components/dashboard-v2/PhaseProgression.tsx`

Ce composant affiche la progression verticale par phases. Pour chaque phase:

1. Phase completee: carte compacte, fond vert subtil, check mark,
   titre + "Objectif atteint: [heartbeat.title] [heartbeat.target]
   [heartbeat.unit]"

2. Phase en cours: carte large depliee:
   - Badge "Phase [N] — En cours"
   - Titre de la phase
   - Heartbeat: barre de progression + "[current] / [target] [unit]"
   - Rationale: 1 phrase italic en dessous
   - Items: grille de PlanItemCard (reutiliser le composant existant)
   - Separateur visuel par dimension si souhaite (mais pas de headers
     lourds)

3. Phase future: carte grise, cadenas subtil, titre de l'objectif
   seulement. Texte: "Se debloque quand [phase precedente] est atteinte"

4. Ligne verticale entre les phases (connector visuel)

Props:
  - phases: tableau de phases du plan avec leurs items
  - currentPhaseId: string (phase active)
  - onComplete / onActivate: callbacks existants pour les items

Suis le design system existant: rounded-[28-32px], stone palette, ombres
douces, mobile-first.
```

**Output:** `PhaseProgression.tsx`
**Validation:** rendu correct sur mobile et desktop

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape C.4 — Indicateur parcours multi-part

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape C.4 — Indicateur parcours multi-part

Si le plan contient un `journey_context` avec `is_multi_part: true`,
afficher un indicateur visuel dans le StrategyHeader ou en haut du dashboard:

- Badge: "Partie [N] sur [total] — ~[X] mois"
- Indicateur de progression du parcours global (ex: barre segmentee)
- Texte explicatif au premier affichage: "Ce parcours est divise en
  [total] etapes pour maximiser tes chances de reussite"

Si `is_multi_part: false` ou absent: ne rien afficher.
```

**Output:** indicateur multi-part integre
**Validation:** visible uniquement sur les parcours multi-part

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape C.5 — Supprimer NorthStarV2

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** retirer `NorthStarV2` du dashboard, retirer l'import et le JSX.
Ne pas supprimer le fichier tout de suite (cleanup lot F).

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape C.6 — Hooks dashboard V3

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape C.6 — Adapter les hooks dashboard

1. Dans `useDashboardV2Data.ts`, charge le `content` du plan (qui contient
   maintenant les `phases`).

2. Dans `useDashboardV2Logic.ts`:
   - Determine la phase en cours: premiere phase dont le Heartbeat n'a pas
     atteint sa cible
   - Groupe les items par phase (via `phase_id` sur les plan items)
   - Expose: `phases`, `currentPhase`, `completedPhases`, `pendingPhases`
   - Conserve les mutations existantes (completeItem, activateItem)
   - Ajoute `transitionPhase(phaseId)` pour debloquer la phase suivante
     quand le Heartbeat est atteint
```

**Output:** hooks mis a jour
**Validation:** les donnees de phases sont correctement exposees

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape C.7 — Wiring page DashboardV3

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** assembler les 5 sections dans `DashboardV2.tsx`:

```
StrategyHeader (enrichi)
  │
  ├─ 1. PhaseProgression (C.3)         — plan de transformation
  ├─ 2. DefenseCard (lot G)            — carte de defense (placeholder si pas encore generee)
  ├─ 3. AtelierInspirations (lot D)    — histoire + principes
  ├─ 4. RemindersSection (C.1)         — rendez-vous
  └─ 5. PreferencesSection (C.1)       — preferences
```

Note: DefenseCard et AtelierInspirations auront un etat "loading/placeholder"
au premier affichage car ils sont generes en differe apres le plan.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

## LOT D — ATELIER D'INSPIRATIONS

### Objectif

Creer la section inspirationnelle du dashboard: histoire forward-looking +
5 principes japonais qui se debloquent progressivement.

---

### Etape D.1 — Narration inspirationnelle

**Statut:** FAIT

**Modele:** Claude (prompt) + GPT (implementation)
**Pourquoi:** Claude concoit le prompt LLM, GPT l'implemente

**Claude concoit le prompt:**

Le champ `inspiration_narrative` est genere par le prompt de plan generation V3
(deja inclus dans B.3). Il doit etre:
- 3-5 phrases
- Forward-looking: montre ou le parcours peut mener
- Base sur ce que l'utilisateur a dit (free text + questionnaire)
- Integre l'historique de tentatives ("Ca fait 5 ans que tu te bats...")
- Ton narratif et empathique, pas un resume de plan

**GPT implemente:** l'affichage dans le composant AtelierInspirations.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape D.2 — Principes debloquables

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape D.2 — Tracking des principes debloquables

Les 5 principes japonais se debloquent en fonction d'evenements specifiques.

1. Ajoute un champ `unlocked_principles` (JSON) sur `user_transformations`
   via migration additive:

   ALTER TABLE public.user_transformations
     ADD COLUMN IF NOT EXISTS unlocked_principles jsonb
       NOT NULL DEFAULT '{"kaizen": true}'::jsonb;

   Kaizen est toujours debloque par defaut.

2. Les conditions de deblocage:
   - Kaizen: toujours (defaut)
   - Ikigai: quand l'utilisateur mentionne son "pourquoi" en conversation
     → detecte par le ConversationPulse (highlight.wins contenant des
     signaux de sens/motivation)
   - Hara Hachi Bu: quand une habitude atteint la maintenance
     → detecte quand un plan_item habit passe en `in_maintenance`
   - Wabi-sabi: apres le premier trebuchement
     → detecte quand une entry avec kind `skip` ou `blocker` est logguee
   - Gambaru: apres un plateau ou stall
     → detecte quand un plan_item passe en `stalled`

3. Cree un helper `checkAndUnlockPrinciples(supabase, userId,
   transformationId, event)` qui verifie les conditions et met a jour
   le JSON si un nouveau principe est debloque.

4. Branche ce helper dans les points d'emission existants:
   - Apres logging d'une entry (pour wabi-sabi)
   - Apres transition de plan_item (pour hara hachi bu, gambaru)
   - Apres generation du ConversationPulse (pour ikigai)
```

**Output:** migration + helper + wiring
**Validation:** les principes se debloquent aux bons moments

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape D.3 — Composant AtelierInspirations

**Statut:** FAIT

**Modele:** GPT (Codex), design Gemini valide

**Prompt:**

```
# Tache: Etape D.3 — Composant AtelierInspirations

Cree `frontend/src/components/dashboard-v2/AtelierInspirations.tsx`

1. En haut: la narration inspirationnelle (texte italique, fond warm gradient)

2. En dessous: les 5 principes en cartes:
   - Principes debloques: carte coloree avec titre japonais + traduction +
     description courte + icone
   - Principes verrouilles: carte grise avec cadenas + "?" a la place du
     titre
   - Animation subtile quand un principe se debloque (ex: fade-in + scale)

3. Les 5 principes et leurs descriptions:
   - Kaizen (改善): "Un pas a la fois. Pas de revolution, juste 1% par jour."
   - Ikigai (生き甲斐): "Ta raison profonde. Ce qui te pousse quand la
     motivation s'eteint."
   - Hara Hachi Bu (腹八分目): "La moderation. Pas tout, pas rien — juste
     assez."
   - Wabi-sabi (侘寂): "La beaute de l'imperfection. Tu as trebuche, pas
     echoue."
   - Gambaru (頑張る): "Perseverer malgre tout. Le chemin continue."

4. Section collapsible par defaut sur mobile (titre "Atelier d'inspirations"
   + chevron)

Props:
  - inspirationNarrative: string
  - unlockedPrinciples: Record<string, boolean>
```

**Output:** `AtelierInspirations.tsx`
**Validation:** rendu correct, principes verrouilles/debloques visibles

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

## LOT E — ADAPTATION SYSTEMES VIVANTS

### Objectif

Adapter les systemes existants (active_load, bilans, nudges, momentum) pour
qu'ils fonctionnent avec le modele par phases au lieu des dimensions plates.

### Principe general

Les systemes vivants ne changent pas fondamentalement. La seule difference est
qu'au lieu de considerer TOUS les items actifs du plan, ils ne considerent que
les items de la **phase en cours** (+ les items en maintenance des phases
precedentes pour les habits).

---

### Etape E.1 — Adapter active_load aux phases

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** modifier `computeActiveLoad` dans `_shared/v2-active-load.ts` pour
filtrer les items par phase active. Les habitudes en maintenance des phases
anterieures comptent comme charge legere.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape E.2 — Adapter daily/weekly bilan aux phases

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** les bilans ciblent les items de la phase en cours. Le weekly peut
proposer une transition de phase si le Heartbeat est atteint.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape E.3 — Adapter morning nudge aux phases

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** le nudge matinal ne montre que les items de la phase en cours.
Si le Heartbeat de la phase est presque atteint, le nudge peut feliciter.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape E.4 — Adapter momentum state aux phases

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** `execution_traction` et `plan_fit` sont calcules sur la phase
en cours, pas sur tout le plan.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

## LOT G — CARTE DE DEFENSE (SYSTEME PULSIONS)

### Objectif

Creer un systeme de cartographie et de defense contre les pulsions dominantes,
genere par l'IA et iterable en conversation. La carte est un artefact separe
du plan, affiche comme section 2 du dashboard.

### Ce qui change

- Nouvelle table `user_defense_cards` en DB
- Nouvelle table `user_defense_wins` pour le tracking des victoires
- Nouvel appel LLM differe pour generer la carte (comme `inspiration_narrative`)
- Nouveau composant `DefenseCard.tsx` dans le dashboard
- Endpoint `update-defense-card-v3` pour modifications live
- Detection conversationnelle des victoires via signal dispatcher (plus de side-channel LLM)
- Detection batch des nouveaux triggers via watcher (toutes les ~4h)
- Export PDF/image

### Ce qui ne change PAS

- Le plan generation (la carte est generee APRES, en differe)
- Les 3 dimensions d'items dans le plan
- Le flow onboarding

---

### Etape G.1 — Types + migration DB

**Statut:** FAIT

**Modele:** Claude (types) + GPT (migration)
**Pourquoi:** architecture des types critique

**Prompt:**

```
# Tache: Etape G.1 — Types et migration DB carte de defense

Lis `docs/v3-context-prompt.md` section "Carte de defense" puis:

1. Dans `supabase/functions/_shared/v2-types.ts`, ajoute:

   type ImpulseTrigger = {
     trigger_id: string;         // ex: "trigger-1"
     situation: string;          // ex: "Retour du travail fatigue (18h-19h)"
     signal: string;             // ex: "Je pense au placard"
     defense_response: string;   // ex: "Boire un grand verre d'eau + 5 min dehors"
   };

   type DominantImpulse = {
     impulse_id: string;         // ex: "impulse-1"
     label: string;              // ex: "Manger hors des repas"
     triggers: ImpulseTrigger[];
     generic_defense: string;    // ex: "Je note cette pulsion et j'attends 10 min"
   };

   type DefenseCard = {
     id: string;
     transformation_id: string;
     user_id: string;
     impulses: DominantImpulse[];  // 1 a 3 pulsions
     generated_at: string;
     last_updated_at: string;
   };

   type DefenseWin = {
     id: string;
     defense_card_id: string;
     trigger_id: string | null;    // null si victoire generique
     impulse_id: string;
     source: "quick_log" | "conversation";
     logged_at: string;
   };

2. Miroir dans `frontend/src/types/v2.ts`.

3. Migration additive:

   CREATE TABLE IF NOT EXISTS public.user_defense_cards (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES auth.users(id),
     transformation_id uuid NOT NULL REFERENCES public.user_transformations(id),
     content jsonb NOT NULL DEFAULT '{}'::jsonb,
     generated_at timestamptz NOT NULL DEFAULT now(),
     last_updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE(transformation_id)
   );

   CREATE TABLE IF NOT EXISTS public.user_defense_wins (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     defense_card_id uuid NOT NULL REFERENCES public.user_defense_cards(id),
     impulse_id text NOT NULL,
     trigger_id text,
     source text NOT NULL CHECK (source IN ('quick_log', 'conversation')),
     logged_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE INDEX IF NOT EXISTS defense_wins_card_idx
     ON public.user_defense_wins (defense_card_id, logged_at DESC);
```

**Output:** types + migration
**Validation:** compilation OK + tables creees

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape G.2 — Prompt LLM generation carte de defense

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** architecture du prompt critique

**Prompt:**

```
# Tache: Etape G.2 — Prompt generation carte de defense

Cree `supabase/functions/_shared/v2-prompts/defense-card.ts`:

1. System prompt `DEFENSE_CARD_SYSTEM_PROMPT`:

   Tu es un expert en psychologie comportementale. Tu dois generer une
   "Carte de Defense" qui aide l'utilisateur a gerer ses pulsions
   dominantes dans le cadre de sa transformation.

   La carte contient 1 a 3 pulsions dominantes. Pour chaque pulsion:

   ## Le Stratege — Situations a risque (le TERRAIN)
   Identifie 3 a 6 situations concretes ou cette pulsion peut survenir.
   Sois SPECIFIQUE au contexte de l'utilisateur (son travail, sa vie,
   ses routines).
   Une situation = un contexte externe: quand, ou, avec qui, dans quel etat.

   ## Le Surveillant — Signaux d'alerte (le DECLENCHEUR INTERNE)
   Pour chaque situation, identifie le signal interne OBSERVABLE qui
   annonce la pulsion. Le signal n'est PAS la situation elle-meme,
   c'est ce que la personne RESSENT, PENSE ou FAIT inconsciemment
   juste avant de basculer. Concret et observable, pas vague.
   ✅ "Je soupire et regarde machinalement le placard"
   ❌ "Je suis stresse" (trop vague)

   ## Le Defenseur — Cartes de reaction
   Pour chaque situation, propose une reponse defensive CONCRETE, faisable
   en < 30 secondes, qui ne demande pas de volonte excessive.
   + Une reponse generique "fourre-tout" pour les situations imprevues.

   Regles:
   - Les pulsions sont DEDUITES du contexte, jamais demandees au user
   - Les reponses defensives doivent etre ultra concretes et faciles
   - Le ton est direct, pas paternaliste
   - Les situations doivent etre specifiques au profil du user

2. Input:
   - transformation_title, user_summary, free_text, questionnaire_answers
   - calibration: struggle_duration, prior_attempts, self_confidence
   - plan_strategy: identity_shift, core_principle

3. Output JSON: { impulses: DominantImpulse[] }

4. Validateur `validateDefenseCardOutput(raw)`.
```

**Output:** prompt + validateur
**Validation:** le prompt genere des cartes coherentes sur 5+ cas tests

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape G.3 — Edge function generate-defense-card-v3

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape G.3 — Edge function generation carte de defense

Cree `supabase/functions/generate-defense-card-v3/index.ts`:

1. Appelee en differe APRES le plan generation (pas pendant)
2. Recupere le contexte de la transformation (free text, questionnaire,
   plan strategy)
3. Appelle le LLM avec DEFENSE_CARD_SYSTEM_PROMPT
4. Valide le JSON avec validateDefenseCardOutput
5. Stocke le resultat dans user_defense_cards
6. Retourne la carte generee

Le frontend appelle cet endpoint apres avoir recu le plan, ou au premier
affichage du dashboard si la carte n'existe pas encore.
```

**Output:** edge function fonctionnelle
**Validation:** carte generee et stockee

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape G.4 — Endpoint update-defense-card-v3

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape G.4 — Endpoint modification carte de defense

Cree `supabase/functions/update-defense-card-v3/index.ts`:

Actions supportees (appelable par sophia-brain en conversation):
- add_trigger: ajouter une nouvelle situation a une pulsion
- update_trigger: modifier une situation/signal/defense
- remove_trigger: supprimer une situation
- add_impulse: ajouter une nouvelle pulsion dominante
- update_defense: modifier une reponse defensive

Input: { user_id, defense_card_id, action, payload }
Output: { success, updated_card }

Callable en conversation par sophia-brain (comme update-roadmap-v3).
```

**Output:** endpoint fonctionnel
**Validation:** modifications persistees

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape G.5 — Composant DefenseCard

**Statut:** FAIT

**Modele:** GPT (Codex) + Gemini (design)

**Prompt:**

```
# Tache: Etape G.5 — Composant DefenseCard

Cree `frontend/src/components/dashboard-v2/DefenseCard.tsx`:

Section 2 du dashboard (apres PhaseProgression, avant AtelierInspirations).

Layout:
- Titre: "Ta carte de defense" + icone bouclier
- Si plusieurs pulsions: tabs ou accordeon pour chaque pulsion
- Pour chaque pulsion:
  - Nom de la pulsion en titre
  - Grille 2x2 avec les 4 roles:
    - Stratege: liste des situations (icones contextuelles)
    - Surveillant: signaux d'alerte (orange/warm)
    - Defenseur: cartes de reaction (vert/action)
    - Comptable: mini courbe + compteur total de victoires
  - Bouton "+1 victoire" (quick-log) bien visible
- Bouton "Imprimer ma carte" en bas
- Collapsible sur mobile (section ouverte par defaut)

Design:
- Palette stone + accents shield/defense (ambre/orange pour les alertes,
  vert pour les reponses, bleu pour le stratege)
- Cards avec rounded-[28-32px], ombres douces
- Le comptable montre une mini courbe (spark line) des victoires par
  semaine avec tendance

Props:
- defenseCard: DefenseCard
- wins: DefenseWin[]
- onQuickLog: (impulseId, triggerId?) => void
- onExport: () => void
```

**Output:** `DefenseCard.tsx`
**Validation:** rendu correct, 4 roles visibles, quick-log fonctionnel

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape G.6 — Quick-log victoires + courbe comptable

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape G.6 — Quick-log et courbe du comptable

1. Quick-log:
   - Bouton "+1 victoire" dans DefenseCard
   - Au clic: choix rapide de la situation (ou "autre") + confirmation
   - INSERT dans user_defense_wins avec source = "quick_log"
   - Animation de celebration subtile (confetti ou pulse vert)

2. Courbe du comptable:
   - Spark line montrant les victoires par semaine (7 dernieres semaines)
   - La courbe est DECROISSANTE sur le long terme (c'est le signe que
     ca marche — moins de batailles = moins de victoires a noter)
   - Message contextuel:
     - Debut (courbe haute): "Tu es en pleine bataille — chaque victoire
       compte"
     - Plateau: "Tu tiens bon, la constance paie"
     - Descente: "Tes pulsions diminuent — ta transformation est en marche"
   - Compteur total: "42 victoires depuis le debut"

3. Hook `useDefenseCard(transformationId)`:
   - Charge la carte + les wins
   - Expose: card, wins, weeklyWins, totalWins, trend
   - Mutation: logWin(impulseId, triggerId?)
```

**Output:** quick-log + courbe + hook
**Validation:** victoires logguees, courbe affichee, messages contextuels

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape G.7 — Detection conversationnelle des victoires (REFACTO)

**Statut:** FAIT (refacto)

**Modele:** Claude (Cursor)
**Pourquoi:** architecture du signal de detection — optimisation LLM

**Architecture revisee:**

L'ancienne implementation (side-channel LLM `checkDefenseCardSignals` dans `agent_exec.ts`)
a ete remplacee par une architecture en 2 niveaux:

**Niveau 1 — Victoires (temps reel, dispatcher)**
- Le signal `defense_card_win` est integre dans le dispatcher existant (pas d'appel LLM supplementaire)
- Le dispatcher detecte quand le user raconte avoir RESISTE a une pulsion
- Le router logge la victoire dans `user_defense_wins` en parallele
- Un addon `__defense_card_win_addon` est injecte dans le contexte du companion
- Le companion felicite naturellement: "Bien joue ! Je note cette victoire."

**Niveau 2 — Nouveaux triggers (batch, watcher ~4h)**
- Le watcher batch (`defense_card_watcher.ts`) analyse les messages recents
- Un LLM detecte des situations non cartographiees dans la carte
- Les triggers potentiels sont stockes dans `__defense_card_pending_triggers` (temp_memory)
- Au prochain echange, le companion propose naturellement d'ajouter ces situations

**Fichiers modifies/crees:**
- `dispatcher.ts`: signal `defense_card_win` (types + prompt + parsing + defaults)
- `run.ts`: handler `maybeLogDefenseCardWinParallel` + addon dans `attachDynamicAddons`
- `agent_exec.ts`: suppression du side-channel `checkDefenseCardSignals`
- `defense_card_watcher.ts`: nouveau module de detection batch
- `watcher.ts`: appel a `detectDefenseCardNewTriggers`
- `loader.ts` + `types.ts`: addons `defenseCardWinAddon` + `defenseCardPendingTriggersAddon`

---

### Etape G.7b — Watcher batch: detection nouveaux triggers

**Statut:** FAIT

**Modele:** Claude (Cursor)
**Pourquoi:** detection asynchrone de nouveaux triggers sans surcharge LLM

Le module `defense_card_watcher.ts` est appele par le watcher batch existant
(toutes les ~4h). Il:
1. Charge la carte de defense de l'utilisateur
2. Envoie le transcript recent a un LLM pour identifier des situations non cartographiees
3. Stocke les triggers dans temp_memory pour proposition par le companion

---

### Etape G.8 — Export imprimable PDF/image

**Statut:** FAIT

**Modele:** GPT (Codex)

**Prompt:**

```
# Tache: Etape G.8 — Export PDF/image de la carte de defense

1. Bouton "Imprimer ma carte" dans DefenseCard.

2. Genere un PDF A4 ou une image (PNG haute resolution) avec:
   - Layout imprimable propre (pas le design web, un layout print adapte)
   - Les 4 roles clairement separes
   - Titre de la pulsion en gros
   - Situations et reponses defensives en colonnes
   - Espace pour le comptable (cases a cocher manuelles pour tracking
     hors-app)
   - Branding Sophia discret en bas

3. Utiliser une lib cote client (html2canvas + jsPDF, ou react-pdf)
   pour generer le PDF sans backend supplementaire.

4. Optionnel: format "fond d'ecran smartphone" (ratio 9:16) pour que
   le user puisse le mettre en wallpaper.
```

**Output:** export PDF + image fonctionnel
**Validation:** le PDF est lisible imprime en A4

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

## LOT F — CLEANUP

### Etape F.1 — Supprimer user_personal_actions

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** retirer toute reference a `user_personal_actions` dans le codebase
frontend et backend. La table reste en DB (pas de DROP) mais n'est plus
consommee.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape F.2 — Supprimer North Star residuel

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** retirer `NorthStarV2.tsx`, retirer `cycle_north_star_suggestion`
du prompt V2, retirer les references North Star dans les hooks et le plan
content.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape F.3 — Supprimer PlanPriorities et references

**Statut:** FAIT

**Modele:** GPT (Codex)

**Action:** retirer l'ancien ecran `PlanPriorities.tsx` s'il est toujours
reference dans le flow (remplace par l'ecran Roadmap V1 du lot A2).
Retirer les references au drag-and-drop de priorites dans le code et
les prompts.

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises

---

### Etape F.4 — Review finale

**Statut:** A FAIRE

**Modele:** Claude (Cursor)

**Action:** review complete du code V3, coherence cross-docs, verification
que rien de V2 n'est casse pour les plans existants (backward compat).

**Mise a jour docs (OBLIGATOIRE apres completion):**
- Marquer **Statut: FAIT** sur cette etape dans `docs/v3-execution-playbook.md`
- Dans `docs/v3-context-prompt.md`: mettre a jour la table avancement, ajouter les fichiers crees/modifies, documenter les decisions prises
