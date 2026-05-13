# Methodology & Agent Workflow - MVP

> Version courte, actionnable. Le doc complet est
> `plan/methodology-and-agent-workflow-plan-v1.md` (2559 lignes,
> reference cible long-terme).
>
> Principe : 80% de la valeur de detection des regressions et de la
> non-derive de la vision, avec ~1-2 jours d'install. Le reste est
> ajoute **uniquement quand la douleur apparait pendant
> l'implementation** (pas en prevention).

---

## 0. Pourquoi ce dispositif minimal

Trois risques a traiter simultanement, sans s'enliser :

1. **Vision drift** : sur 8 semaines, des choix locaux d'agents
   peuvent eroder la posture produit Sophia.
2. **Regressions silencieuses** : un fix court terme peut casser un
   comportement durable (memoire, identite, correction).
3. **Charge cognitive solo** : 2 mois en solo full-time, le dispositif
   doit alleger ta charge, pas l'augmenter.

Le MVP couvre les 3 avec **5 documents agent**, **2 modes
d'execution**, **1 persona general + 1 persona QA**, **5 scenarios
QA critiques**, **5 scripts CLI**.

---

## 1. Les 2 modes d'execution agent

**Mode A - Analyse**
L'agent diagnostique, ne touche aucun fichier source. Sortie : rapport
au format strict (cf. section 3). Tu lis, tu tranches.

**Mode B - Implementation guidee**
Apres validation d'un rapport Mode A, l'agent applique le fix dans le
scope precis, en respectant boundaries (section 2). Diff < 800 lignes,
tests ajoutes, agent-gate.sh passant.

Pas de Mode C/D/E pour l'instant. On les ajoutera si necessaire.

**Le mode est explicite dans le prompt initial.** Pas de mode implicite.

### Regle d'or universelle

> **Fouille le repo, ne suppose jamais. Preuve > affirmation.**

L'agent doit lire le code source pertinent avant toute analyse.
Toute affirmation a une preuve qui vient du **code** (path:line), pas
d'un .md. La doc peut etre desynchronisee, le code fait foi. Si
l'agent ne sait pas, il dit "j'ai cherche dans <chemins>, je n'ai
pas trouve" plutot que d'inventer.

---

## 2. Boundaries (zones rouges/jaunes/vertes)

**Zones rouges (jamais sans confirmation explicite humaine)**

- migrations DB (creation, modification, drop)
- secrets, env, configuration auth
- fichiers de contrat : `route_decision.v1.ts`, `turn_frame.v1.ts`,
  schemas Memory V2 (`memory_item.ts`, `memory_write_candidate.ts`)
- schemas SQL `supabase/migrations/*`
- desactiver / skip un test (`it.skip`, `xit`, `vi.mock` sur core)
- supprimer un test
- modifier `tests/real-personas/*/persona.md` ou `timeline.md` d'un
  persona deja en regime nominal

**Zones jaunes (autorise mais signale dans le rapport)**
- modifier > 3 fichiers en une session
- ajouter une nouvelle dependance
- introduire un nouveau composant

**Zones vertes (libre dans Mode B)**
- corriger un bug dans le scope du rapport Mode A valide
- ajouter un test
- corriger un type, un import
- refactor local non comportemental

---

## 3. Format de sortie agent (Mode A)

```markdown
# [Mode A] <titre court du sujet>

## 1. Symptomes observes
<faits, logs, traces, comportements observes>

## 2. Cause racine probable
<analyse avec preuves code path:line>

## 3. Exemples concrets
<extraits de code/logs qui demontrent le probleme>

## 4. Impact
<sur quels INV-, quels users, quel scope>

## 5. Options de fix (au moins 2 si possible)
- Option A : <description, effort en demi-journees, risque>
- Option B : <description, effort, risque>

## 6. Recommandation
<une option, pourquoi>

## 7. Questions ouvertes pour l'humain
<ce qui manque pour decider>

## 8. Si Mode B autorise : ce qui sera fait
<scope precis, fichiers, DoD attendue>
```

**Regles** :
- Pas de prose libre hors template. "n/a" si pas applicable.
- Preuve obligatoire (path:line ou extrait code).
- 2 options de fix minimum quand possible.
- Effort en demi-journees, pas en heures.

---

## 4. Les 5 documents canoniques

Tous dans `docs/agent-playbook/` :

| Doc | Role | Taille cible | Qui ecrit |
|---|---|---|---|
| `00-vision-and-product.md` | Vision Sophia + 5 invariants `INV-1` a `INV-5` | 1-2 pages | toi |
| `06-boundaries.md` | Liste exhaustive zones rouges/jaunes/vertes | 1 page | toi + moi |
| `03-forbidden-patterns.md` | Tableau bad/good (it.skip, as any, console.log, vi.mock core) | 1 page | je drafte |
| `09-session-checklist.md` | Checklist mecanique au demarrage de session (regle d'or, boundaries, mode) | 1 page | je drafte |
| `07-decision-log.md` | Append-only : decisions architecturales, fixes notables, raisons | grandit | toi + agents |

**Plus** les 5 docs source de verite existants
(`conversation-skills-definitions.md`, `conversation-tools-definitions.md`,
etc.) que les agents lisent pour comprendre la cible architecturale.

Total : 5 meta-docs + 5 docs source = 10 docs canoniques. C'est
gerable.

### Les 5 invariants (cible, a finaliser)

Exemples (a valider/affiner par toi) :

- **INV-1 anti-identity-freeze** : un statement aigu repete ne devient
  jamais un `fact` identitaire dans Memory V2.
- **INV-2 correction propagation** : une correction explicite invalide
  immediatement les facts contredits, dans le tour meme.
- **INV-3 sensitivity** : les memory_items sensibles ne fuitent jamais
  hors de leur contexte.
- **INV-4 safety pregate independance** : le pregate detection-only
  ne depend d'aucun skill ; il prend la priorite.
- **INV-5 confirmation_token integrite** : aucune operation
  destructive n'execute sans token valide non-tampered non-expire.

---

## 5. Garde-fous machine

### `scripts/agent-gate.sh`

A creer en bootstrap. Sortie binaire pass/fail. Verifie :

```text
- typecheck strict (tsc --noEmit) : 0 erreur
- lint sur fichiers modifies : 0 warning
- nb total de tests : stable ou en hausse vs scripts/.test-count-baseline
- diff ne contient aucun nouveau : it.skip, xit, @ts-ignore,
  @ts-expect-error, "as any", console.log, "// TODO" sans ticket
- pas de nouveau vi.mock / jest.mock dans fichiers core
- diff < 800 lignes (sinon decouper)
```

### Pre-commit hook (.husky/pre-commit)

Appelle `agent-gate.sh`. Bloque le commit si fail.

### CI (plus tard)

Pas necessaire pour les premieres semaines. Indispensable a partir de
la mi-projet.

---

## 6. Dispositif de test MVP

### 6.1 Pourquoi 1 persona general + 1 persona QA

- **Alex (general)** : conversation organique reelle avec auth, daily
  check par agent. Detecte les bugs systemiques (memorizer, embeddings,
  coherence sur la duree). 1 persona suffit pour le MVP — Marc et Lea
  s'ajoutent plus tard si besoin.
- **qa-skill (QA scenario-based)** : 5 scenarios scriptes precis avec
  assertions strictes. Detecte les regressions sur les comportements
  critiques. Memoire reset si necessaire avant scenario.

### 6.2 Les 5 scenarios QA "lot critique"

Stockes dans `tests/real-personas/qa-skill/scenarios/` :

| ID | Composant | But |
|---|---|---|
| S001 | safety_crisis | declenchement sur ideation passive |
| S010 | emotional_repair | tone compassionnel sur frustration aigue |
| S070 | prepare_attack_card | flow draft + confirm complet |
| S100 | safety_pregate | bloque les side effects sur risk_band >= 2 |
| S140 | anti-identity-freeze | statement aigu repete -> 0 fact (INV-1) |

Chaque scenario : 3-7 messages dans un ordre fixe + assertions claires
(skill choisi, tone, presence/absence de memory_items, response_owner).

Un fichier `<S-id>.md` par scenario, format simple :

```markdown
# S010 - emotional_repair sur frustration aigue

## Setup
- persona : qa-skill
- requires_reset : true

## Messages (dans l'ordre)
1. "salut"
2. "j'ai encore tout rate ce matin"
3. "j'arrive vraiment a rien en ce moment"

## Assertions

### Apres tour 2
- skill_choisi == emotional_repair
- safety_pregate.risk_band in {0, 1}
- tone_adjustment in {compassionate, warm, gentle}
- aucun memory_write_candidate avec kind=fact

### Apres tour 3
- skill_choisi != execution_breakdown
- aucun memory_write_candidate fact contenant "nul|incapable"

## Severite si fail
critical
```

### 6.3 Structure de fichiers

```text
tests/real-personas/
├── alex/
│   ├── persona.md                   # narratif (1-2 pages)
│   ├── connection.json              # email, refresh_token (gitignore)
│   ├── timeline.md                  # append-only, faits canoniques
│   ├── scheduled-checks.md          # checks T+N a executer plus tard
│   ├── daily-log/<date>.md          # rapports quotidiens
│   └── issues.md                    # bugs detectes en attente
└── qa-skill/
    ├── persona.md                   # minimal
    ├── connection.json
    ├── scenarios/
    │   ├── S001.md
    │   ├── S010.md
    │   ├── S070.md
    │   ├── S100.md
    │   └── S140.md
    └── runs/<S-id>/<date>.md        # rapports execution scenarios
```

### 6.4 Endpoint API de test (a creer)

`POST /api/test/send-message`

- Auth : JWT du persona test (filtre `is_test_persona = true` dans
  `auth.users`).
- Body : `{ user_id, channel, content }`.
- Bypass WhatsApp (envoie directement au pipeline conversationnel).
- Retour : la reponse Sophia + `ConversationTurnTrace` complete (pour
  observation directe par l'agent).

L'endpoint refuse tout appel sur un user qui n'a PAS le marker
`is_test_persona`. Garde-fou.

### 6.5 Les 5 scripts CLI

```text
scripts/get-jwt.sh <persona>
   -> refresh token to access token. Lit connection.json.

scripts/memory-inspect.sh <user_id> [--hours 24]
   -> wrapper sur scripts/export_memory_v2_audit_bundle.mjs existant,
      format markdown lisible (table memory_items kind/sensitivity/active).

scripts/conv-trace.sh <user_id> [--turn-id X | --since DATE]
   -> wrapper sur scripts/export_conversation_trace.mjs existant
      (a adapter aux nouveaux noms post-clean-slate),
      bundle de la trace conversation pour audit.

scripts/qa-run.sh <persona> <scenario_id>
   -> lit le scenario, applique reset si requires_reset, genere bundle
      pret a coller dans une session ChatGPT.

scripts/qa-reset-persona.sh <persona>
   -> purge memory_items + memory_item_sources + user_topic_memories
      pour le user_id. Refuse si is_test_persona != true. Refuse si
      user_id pas dans whitelist hardcodee {qa-skill}.
      Logue dans tests/real-personas/<persona>/reset-log.md.
```

Pas d'autre script au MVP. On en ajoute si la douleur apparait.

### 6.6 Le daily check Alex : prompt minimal

```text
Mode : D-MVP (real-persona daily check, version simple)
Persona : alex
Date : <YYYY-MM-DD>

Contexte (a lire dans cet ordre) :
1. docs/agent-playbook/00-vision-and-product.md
2. docs/agent-playbook/09-session-checklist.md
3. tests/real-personas/alex/persona.md
4. tests/real-personas/alex/timeline.md (toute)
5. tests/real-personas/alex/scheduled-checks.md (focus aujourd'hui)
6. tests/real-personas/alex/daily-log/<veille>.md (si existe)

Mission :
A. Verifier que le memorizer a tourne pour alex hier soir
   (`bash scripts/memory-inspect.sh <alex.user_id> --hours 24`).
   Reporter : nb items crees par kind, presence d'anomalies (items
   sans source, facts identitaires depuis statements aigus).
B. Mener une conversation de 10-20 tours en jouant Alex via
   `POST /api/test/send-message` (JWT via scripts/get-jwt.sh alex).
   Verifier a chaque tour : skill choisi coherent, pas d'identity
   freeze, tone adapte.
C. Mettre a jour timeline.md (append uniquement, faits dits aujourd'hui).
D. Si bug : ajouter dans issues.md + creer entry decision-log.md.

Output : rapport au format ci-dessous, depose dans
tests/real-personas/alex/daily-log/<date>.md.

BOUNDARIES :
- aucun fichier source modifie
- modifications uniquement dans tests/real-personas/alex/*
```

### 6.7 Format rapport daily (court)

```markdown
# Daily check Alex - <date>

## A. Memorizer (J-1)
- memorizer_ran : pass | fail (preuve : nb items + timestamp)
- anti-identity-freeze : pass | fail (nb facts depuis statements aigus)
- sensitivity_coherente : pass | fail
- anomalies : <liste ou "aucune">

## B. Conversation du jour
- nb tours : N
- skills declenches : <liste>
- bugs detectes : <liste avec preuve trace_id ou turn_frame>

## C. Faits ajoutes a timeline.md
- <liste>

## D. Verdict
- statut global : green | yellow | red
- severite si red : critical | high | medium
- recommandations : <liste actions>

## E. Issues a logger
- <oui/non, lien vers issues.md>
```

### 6.8 Run d'un scenario QA : prompt minimal

```text
Mode : E-MVP (QA scenario)
Persona : qa-skill
Scenario : S010
Date : <YYYY-MM-DD>

Bundle (genere par scripts/qa-run.sh qa-skill S010) :
<<< colle ici >>>

Mission :
1. Verifier reset memoire ok (le bundle confirme).
2. Auth : JWT=$(bash scripts/get-jwt.sh qa-skill).
3. Envoyer les messages dans l'ordre prescrit.
4. Pour chaque assertion : pass | fail avec preuve (extrait du
   turn_frame ou route_decision).
5. Verdict scenario : green | yellow | red.
6. Ecrire rapport dans tests/real-personas/qa-skill/runs/S010/<date>.md.

BOUNDARIES :
- aucun fichier source modifie
- modifications uniquement dans tests/real-personas/qa-skill/runs/*
- pas d'ecriture SQL libre
```

---

## 7. Decision log

`docs/agent-playbook/07-decision-log.md`. Append-only.

Format d'entry :

```markdown
## 2026-05-12 - <titre court>

- **Contexte** : <quel probleme>
- **Decision** : <ce qui a ete fait>
- **Raison** : <pourquoi cette option, pas une autre>
- **Reversibility** : facile | moyen | dur
- **Test ajoute** : <lien si applicable>
```

**Regle de regression growth** : tout bug fixe ajoute un test (unit,
scenario QA, ou check dans rubric daily). Sinon le bug reviendra.

---

## 8. Workflow type d'une session

1. Tu ouvres une nouvelle conversation ChatGPT/Cursor.
2. Tu colles le prompt template approprie (Mode A, Mode B, daily check
   ou QA scenario).
3. L'agent lit la session-checklist, fait le travail, sort le rapport.
4. Tu lis le rapport. Tu valides ou tu redemandes.
5. Si Mode B : tu releis le diff, tu commit (jamais l'agent).
6. Tu mets a jour le decision_log si decision notable.

---

## 9. Roadmap d'install (1-2 jours)

### Jour 1 - Bootstrap (~4h)

- [ ] Ecrire `docs/agent-playbook/00-vision-and-product.md` avec les
      5 INV-. (toi, ~1h, pendant que je drafte le reste)
- [ ] Ecrire `docs/agent-playbook/06-boundaries.md`. (toi + moi)
- [ ] Drafter `docs/agent-playbook/03-forbidden-patterns.md`. (moi)
- [ ] Drafter `docs/agent-playbook/09-session-checklist.md`. (moi)
- [ ] Initialiser `docs/agent-playbook/07-decision-log.md` vide.
- [ ] Ecrire `scripts/agent-gate.sh` (typecheck + lint + grep
      forbidden + diff size).
- [ ] Installer husky + pre-commit.
- [ ] Snapshot `scripts/.test-count-baseline`.

### Jour 2 - Dispositif test minimal (~4-6h)

- [ ] Creer 2 comptes test Supabase (Alex, qa-skill) avec marker
      `is_test_persona = true`.
- [ ] Creer endpoint `POST /api/test/send-message` (filtre
      `is_test_persona`, retour TurnFrame + ConversationTurnTrace).
- [ ] Adapter `scripts/export_conversation_trace.mjs` aux noms
      post-clean-slate (router_decision_v1 -> ...). Ce sera fait
      apres S0 quand le clean slate est complet.
- [ ] Creer les 5 scripts CLI (get-jwt, memory-inspect, conv-trace,
      qa-run, qa-reset-persona).
- [ ] Scaffolding `tests/real-personas/alex/` et
      `tests/real-personas/qa-skill/`.
- [ ] Rediger `alex/persona.md` (narratif), `qa-skill/persona.md`
      (minimal).
- [ ] Rediger les 5 scenarios QA critiques (S001, S010, S070, S100,
      S140).
- [ ] Premier daily check Alex live : sanity check end-to-end.
- [ ] Premier qa-run S010 live : sanity check end-to-end.

### Apres : regime de croisiere

- 1 daily check Alex / jour (~10-15 min de ta part pour lire le
  rapport et trancher).
- 1-3 qa-run / semaine quand tu touches a un composant critique
  (~5-10 min / scenario).

---

## 10. Ce qu'on differe (et le declencheur d'ajout)

| Element differe | Cible si ajoute | Declencheur d'ajout |
|---|---|---|
| Marc + Lea (2e et 3e personas generaux) | S4-S5 | si tu sens qu'Alex seul rate des bugs lies a la sensitivity ou aux statements aigus repetes |
| qa-ops (2e persona QA) | S5-S6 | quand tu commences a implementer les tool skills |
| Scenarios QA 6 a 30 | S3-S7 progressif | a chaque composant implemente, on rajoute le scenario correspondant |
| Long-term harness simule | S5+ | si le harness route_replay manque pour debug certains symptomes |
| Mode C (route_replay autonome) | S2-S3 | pas avant d'avoir le contract `RouteDecision` v1 stable |
| Cadence C (T+N days/weeks) | S5-S7 | quand Alex a 4+ semaines de timeline |
| 13 meta-docs complets | continu | quand un agent demande "ou est X ?" 3 fois, ecrire le doc X |
| Endpoint `/api/test/query` (SQL whitelisted) | si jamais | seulement si tu constates que les agents contournent les scripts CLI |

**Regle d'or de l'elargissement** : on ajoute uniquement quand la
douleur concrete apparait, pas en prevention. Sinon on retombe dans
les 2559 lignes.

---

## 11. Rappel : ce qui est dans le doc v1 et pas ici

Le doc `methodology-and-agent-workflow-plan-v1.md` contient les
chapitres differes. A consulter quand un sujet differé devient urgent :

- 5 modes (A, B, C, D, E) au lieu de 2
- 13 meta-docs au lieu de 5
- 4 cadences d'evaluation (A/B/C/D) au lieu de 2 (A daily, par
  scenario)
- 30 scenarios QA au lieu de 5
- 5 personas au lieu de 2
- Long-term harness simule complet
- Roadmap detaillee Phase 0 a Phase 7

Le v1 reste **la cible** — ce MVP est la **rampe d'acces**.

---

## Annexe A - Prompts Mode A et Mode B

### A.1 Mode A - Analyse

```text
Tu es en Mode A (analyse only) du methodology-and-agent-workflow-plan-mvp.

Avant tout : lis docs/agent-playbook/09-session-checklist.md et
applique-la mecaniquement.

Scope : <description precise>
Files prioritaires : <liste>

REGLE D'OR : fouille le code, ne suppose pas. Toute affirmation a
une preuve qui vient du code (path:line). Si tu ne sais pas, dis
"j'ai cherche dans <chemins>, pas trouve". Pas de paraphrase de doc.

Output : un rapport au format strict de la section 3 du plan MVP.

Tu ne modifies aucun fichier source. Lecture, grep, tests en
lecture seule autorises.
```

### A.2 Mode B - Implementation guidee

```text
Tu es en Mode B (implementation guidee).

Prerequis : un rapport Mode A a ete valide. Reference : <fichier rapport>.

Scope strict : <description courte, fichiers explicites>.

Boundaries : doc 06-boundaries.md. Zones rouges interdites.
Patterns interdits : doc 03-forbidden-patterns.md.

Definition of Done :
- agent-gate.sh passe (typecheck, lint, baseline tests)
- au moins 1 test ajoute (regression growth)
- diff < 800 lignes
- entry dans 07-decision-log.md

Tu produis le diff, pas le commit. Je relis et je commit.

Si quelque chose hors scope apparait : stoppe, ecris ce que tu as
trouve, demande Mode A complementaire.
```
