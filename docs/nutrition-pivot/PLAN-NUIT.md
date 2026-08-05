# PLAN DE NUIT — Pivot « Coach Nutrition 1:N »

> ## ⚠️ AMENDEMENT DU 2026-08-03 — LIRE AVANT LE RESTE
>
> Trois décisions prises après la rédaction de ce plan en contredisent des passages
> **structurants**. Elles ont été appliquées dans le code ; le texte d'origine est conservé
> tel quel plus bas, mais **c'est cet encadré qui fait autorité** là où les deux divergent.
>
> **1. L'élève A une interface. §1.2 est caduc.**
> « L'élève n'a AUCUNE interface » et l'ANNEXE A qui marque `/app/*` en suppression ne
> décrivent plus le produit. L'élève a un compte et deux écrans : `/app/plan` (son plan de
> la semaine) et `/app/progress` (son avancée). La saisie quotidienne reste sur WhatsApp —
> **l'app sert à VOIR, WhatsApp à SAISIR** — ce qui préserve la thèse PUSH.
> *Coût nul côté identité* : la décision P0.0(a) (auth.users fantôme) avait été prise en
> gardant ce chemin ouvert.
>
> **2. Le coach RECOMMANDE, il ne prescrit pas. §1.5 change de forme.**
> Dans le modèle 1:N (50-500 élèves par cohorte), le coach n'écrit pas un plan par élève :
> il écrit UN programme (`plan_templates`) et une doctrine. **C'est l'élève qui compose sa
> semaine**, à partir de ces recommandations, de son objectif et de sa situation.
> L'autorité du coach n'est pas affaiblie, elle change de canal : elle passe par la
> doctrine (interdits inclus, avec leur double verrou) et par le contenu du programme.
> Sophia reste interdite d'inventer du contenu alimentaire — garanti par un CHECK SQL sur
> `student_week_plans`, pas seulement par un test.
>
> **3. L'ADHÉRENCE sort du périmètre 1:N.**
> Sans prescription individuelle, « l'élève a-t-il suivi ce qu'on lui a prescrit » n'a plus
> d'objet. L'évaluateur KEEL (`commitment_evaluations`, `adherence.ts`, et les crons
> `keel-provision-day` / `keel-sweep-day` / `keel-evaluate-adherence`) est **débranché, pas
> supprimé** : il reste juste, et un mode 1:1 le retrouve en replanifiant trois jobs.
> Ce que le coach lit le lundi : **couverture · vivabilité · portions · intentions**.
>
> Journal complet des décisions : `PROGRESS.md`. État livré : `STATUS-MORNING.md`.
>
> **Le point 2 a sa forme lisible et permanente dans [`docs/keel/MODEL.md`](../keel/MODEL.md).**
> Enterré ici, dans un plan de nuit que personne n'ouvre, il a dû être réexpliqué à la main
> plusieurs fois. C'est MODEL.md qu'on cite désormais, pas cet encadré.


> **Charte d'exécution pour l'agent de nuit.** Tu n'as pas le droit de t'arrêter tant que ce plan
> n'est pas entièrement en place OU que chaque blocage restant est documenté avec un contournement
> tenté. Tu tiens un journal (`docs/nutrition-pivot/PROGRESS.md`) et tu livres au matin un état
> (`docs/nutrition-pivot/STATUS-MORNING.md`). Tout ce que tu affirmes « fait » doit être vérifié
> par un test qui a réellement tourné — jamais sur parole.

---

## 1. CONTEXTE BUSINESS — pourquoi ce produit, pour qui, vers où (À LIRE EN ENTIER)

### 1.1 D'où on vient

Sophia était un coach IA B2C francophone sur WhatsApp (niche TDAH) : onboarding web → plan
généré par IA par personne → suivi proactif. Le moteur est excellent (proactif, mémoire,
machine à états, safety), mais le B2C posait un problème de rétention non prouvé et une
acquisition lente. **La demande du pivot vient du marché, pas de nous** : deux coachs
(nutrition + épigénétique) ont exprimé le besoin indépendamment, un entrepreneur du secteur a
confirmé où est l'argent, une coach business 1:1 est intéressée. Un coach a même déjà bricolé
sa propre IA sur ses contenus — preuve de demande ET avertissement (voir 1.6).

### 1.2 Le produit en une phrase

> **Le coach vend son programme ; nous, on fait vivre ce programme chaque jour sur WhatsApp —
> photo d'assiette, réponse dans sa méthode, relance quand un élève glisse — et il ne paie que
> pour les élèves actifs.**

Principe radical : **l'élève n'a AUCUNE interface.** Pas de compte, pas d'app, pas de site.
Son numéro de téléphone est son compte ; toute son expérience tient dans WhatsApp.
L'opt-in élève = UN message (« Bienvenue dans le programme de [Coach] 👋 C'est bien toi ? » → « Oui »).

### 1.3 Les trois boucles élève (tout le produit tient là-dedans)

1. **RÉAGIR** — il envoie une photo de son assiette → réponse en secondes : identification,
   estimation **en fourchettes** (jamais de faux précis), retour aligné sur le protocole du
   coach, dans sa voix. Une question seulement si elle change la conclusion (« cuisiné avec de
   l'huile ? »). Repas récurrents reconnus (« ton petit-déj habituel ? »).
2. **RÉPONDRE** — le moment critique : « je suis au resto, je prends quoi ? », « fringale à
   22h ». Réponse immédiate, doctrine du coach, jamais hors de ses interdits.
3. **REMARQUER** — 48-72h de silence → relance douce, zéro culpabilisation. « Semaine de
   merde » → on allège le TON et la CADENCE (jamais le protocole). Mini-bilan hebdo.
   C'est la boucle qui sauve le jour 9 — celle pour laquelle le coach paie.

**Supprimé volontairement** (simplicité) : cartes défense/attaque, potions, niveaux,
transformations, génération de plan par personne, onboarding web B2C, dashboard élève,
streaks et badges (anti-pattern assumé — un jour raté ne casse rien).

### 1.4 Côté coach : 4 écrans, pas un de plus + une synthèse poussée

1. **Protocole** — il colle son programme (PDF/texte) → parsing IA → structure par semaine
   (cibles, actions, oui/non alimentaires) → il valide/corrige. Le pipeline intake existant
   « texte brut → structuration IA → validation humaine » se réutilise tel quel.
2. **Doctrine** — éditeur texte : croyances, INTERDITS, vocabulaire, arbitrages, ton.
   Effet **immédiat** au message suivant (condition du sentiment « c'est MON agent »).
3. **Cohorte** — liste élèves : actif / glisse / silencieux.
4. **Mode test** — le coach parle à son propre agent sur WhatsApp AVANT d'exposer un élève.
   Triple effet : il vérifie (ose), il investit (effet IKEA), on collecte sa méthode.

Chaque lundi : **synthèse poussée** (WhatsApp/email) — qui est actif, qui décroche, les 3 élèves
à rattraper. Fin de cohorte : **rapport de complétion** (son argument marketing pour la
cohorte suivante). Un coach qui n'ouvre jamais le dashboard mais lit sa synthèse est un client
retenu : la valeur est poussée, l'interface sert à configurer.

**Process d'intégration coach (~30 min)** : setup protocole (20 min) → interview doctrine
(10 min, dont les 3 cas durs : « un élève écrit "j'ai craqué ce soir" — tu réponds quoi, mot
pour mot ? ») → mode test jusqu'à ce qu'il soit fier → il colle ses numéros → lancement.

### 1.5 La règle d'autorité (NON NÉGOCIABLE, structurante pour tout le code)

**Le coach est l'unique autorité. Sophia exécute, elle ne dirige pas.**
- Sophia ne modifie JAMAIS le protocole. Élève en difficulté chronique → signal remonté au
  coach dans la synthèse (« Julie ne tient pas les 3 repas protéinés depuis 2 semaines ») —
  c'est LUI qui décide.
- L'adaptation autorisée de Sophia porte sur SON comportement : ton, cadence, espacement des
  relances (détection d'état momentum/friction/évitement/pause → postures). Pas sur le contenu.
- Raison business : la double autorité (IA qui contredit le coach) est le tueur des modèles
  hybrides — un coach ne mettra jamais ses clients sur un outil qui peut le décrédibiliser.

### 1.6 Ce qu'on vend (et ce qu'on ne vend JAMAIS)

- **On ne vend jamais « une IA »** : les coachs savent en bricoler une (RAG maison sur leurs
  contenus). On vend **la présence quotidienne qu'ils ne peuvent pas assurer** et
  l'infrastructure qu'ils ne veulent pas construire (proactif, états, mémoire, safety).
- **On ne vend jamais la précision calorique** : identification photo ~68-86 % fiable,
  portions ~39 % — on vend « tes clients loguent ENFIN, parce que c'est juste une photo dans
  WhatsApp, et tu le vois ». Fourchettes honnêtes > faux précis.
- La personnalisation coach est **le ticket d'entrée, pas le différenciateur** (l'adjectif,
  pas le nom) : « tes élèves sont relancés au jour 9 — dans TA méthode et TA voix ».
- **Le pitch de prix** : on lui permet de vendre son programme plus cher (300 → 400 $ avec
  accompagnement quotidien). Ce qu'on facture est du bruit à côté.

### 1.7 Cibles, marché, pricing (pour comprendre les priorités produit)

**Cibles (ordre)** : ① vendeurs de programmes/challenges nutrition 1:N (50-500/cohorte,
douleur = taux de complétion → remboursements/témoignages ; un décideur ; ~13× le revenu par
vente vs coach 1:1 ; ~100 clients ≈ 1 M$ ARR) ; ② coachs 1:1 qui lancent leur programme
(segment-pont, 3 contacts tièdes existants) ; ③ coachs de protocole biohacking/épigénétique
(1 chaud, IA-friendly, premium). GLP-1/santé métabolique : vent arrière majeur (programmes
médicalisés passés de 11 % à 38 % du marché US) mais dans 6-12 mois, pas maintenant.

**Marché** : ~19 k coachs certifiés Precision Nutrition actifs (175 k formés — leur méthode
Skills→Practices est déjà un programme séquencé), ~108 k diététiciens US / 60-70 k EU / 17,5 k FR,
segment 1:N estimé 20-60 k dans le monde. Rétention moyenne du secteur fitness : 66,4 %/an —
un tiers de churn : c'est LA douleur qu'on vend. Réf. concurrent : Trainerize (400 k pros,
architecture PULL — le client doit ouvrir l'app ; notre différence de nature : PUSH sur WhatsApp).

**Pricing** : par élève ACTIF (actif = ≥1 interaction dans le mois — c'est un argument de
vente : « tu ne paies que pour ceux qui s'en servent », et ça aligne nos intérêts). Paliers
indicatifs : 99 $/mois ≤25 élèves, 299 $ ≤100, 699 $ ≤300. Pilotes fondateurs : 99 $ forfait
gelé 12 mois. **Jamais gratuit.** ⚠️ La vraie ligne de coût n'est pas le LLM (~0,12 $/élève/mois
photos comprises) mais **WhatsApp Business API** (facturation par message/conversation, tarifs
US élevés) → à instrumenter dès la construction (compteur de coût par élève).
**NOTE DE NUIT (après inventaire)** : un contrat coach « 49 $/mois + 12 $/élève actif » est
DÉJÀ implémenté (Stripe checkout + `stripe-reconcile-seats` + `entitlements.ts`). Les paliers
ci-dessus sont la cible commerciale, PAS un chantier de nuit : **l'agent ne refond pas le
billing** — il garde le contrat existant fonctionnel (il suffit pour les pilotes), et le choix
final des paliers est une décision de Thomas au matin (STATUS-MORNING).

### 1.8 Demande annexe validée : le flux d'analyse photo en JSON vers l'app d'un coach

Un coach veut recevoir la donnée d'analyse photo dans SON app. Décision : le moteur d'analyse
photo est construit comme **service interne avec un contrat JSON propre** (voir 3.5), consommé
par (a) l'agent WhatsApp et (b) un simple webhook sortant par coach. Pas de plateforme API
publique pour n=1 — juste le même contrat, deux consommateurs. Ce flux sera payant.

### 1.9 Métrique nord

**% d'élèves encore actifs en semaine 3** (vs baseline du coach) + taux de complétion de
cohorte. Tout le produit s'évalue contre ça.

---

## 2. ARTEFACTS EXISTANTS — à retrouver et exploiter AVANT de coder

Un audit multi-agents complet a déjà tourné (session parallèle). Cherche et lis ces artefacts
(`find`/`grep` dans le repo, le scratchpad et `~/.claude/projects/*/f*/workflows/`) :

- **`synthese.md` (~87 Ko)** : modèle de données proposé (notamment `plan_templates` — le coach
  édite un template, chaque élève est un clone+diff), roadmap, business chiffré.
- **Specs « no-regret »** : multi-tenancy (insight clé : PostgREST applique les droits par
  RÔLE — coach et élève sont tous deux `authenticated` → restreindre des colonnes par policy
  est impossible, il faut des **vues** — depuis IMPLÉMENTÉ, cf. ANNEXE B.5) ; vision photo
  repas (coût ~0,0015 $/photo ; ⚠️ le « blocage wa_parse jette l'image » mentionné dans cette
  spec est PÉRIMÉ — levé depuis, cf. §3.5 et ANNEXE C — ne pas le re-«corriger »).
- **`bon-ok-alors-j-ai-valiant-taco.md`** : plan de travail antérieur avec findings vérifiés.
- Audits : `transformation_id` référencé dans **147 fichiers** edge, `cycle_id` dans **83**,
  tous deux NOT NULL sur la colonne vertébrale des plans → stratégie strangler obligatoire (§6).

Si un artefact est introuvable, note-le dans PROGRESS.md et continue — ne bloque pas dessus.

**DÉCOUVERTE MAJEURE CÔTÉ DB (inventaire vérifié, voir ANNEXE B)** : les migrations
`20260727*`/`20260728*` (« KEEL », ~4 000 lignes, 26 tables) ont DÉJÀ construit la moitié de
la cible §3.6 : `coaches`, `plan_templates`, `protocol_events` (≈ meal_entries),
`coach_clients`, facturation par sièges (`coach_billing_periods` + fonctions `keel_*`),
invitations, cartes, et surtout **la tenancy par vues déjà en production**
(`coach_student_directory`, `coach_student_events` — « le coach voit l'adhérence, jamais le
journal intime » est déjà codé). Manquent : `coach_doctrines` (rien), `cohorts` (rien),
`coach_syntheses` (rien). ⚠️ **ET LE BLOCAGE N°1 DU PIVOT** : toutes les tables KEEL
rattachent l'élève à `auth.users(id)` NOT NULL CASCADE — en conflit direct avec §1.2
(« l'élève n'a pas de compte »). Décision d'architecture à trancher en P0.0 (voir §4).
Le débranchement legacy a d'ailleurs COMMENCÉ : `20260727150000_keel_disable_legacy_surfaces`
a déjà droppé 8 triggers et déprogrammé des crons B2C.

**DÉCOUVERTE MAJEURE CÔTÉ FRONTEND (inventaire vérifié, voir ANNEXE A)** : le repo contient
déjà un socle B2B coach sous `frontend/src/keel/` — 52 fichiers, récents : garde `CoachRoute`,
`PlanImportPage` (1436 l. : coller/uploader un programme → parsing IA `plan-import-v1` →
3 files de triage → validation humaine avec invalidation d'approbation à l'édition — la
règle d'autorité §1.5 DÉJÀ codée), `TemplatesPage` (plan_templates : le coach édite un
template, l'élève est un clone+diff), `CoachHomePage` (cohorte + sièges + invitations),
`CoachBillingPage` (ledger de sièges), design system complet (5 primitives Tailwind),
i18n EN fail-loud, `entitlements.ts` qui connaît déjà les tiers coach/student et un pricing
coach. **~70 % de l'UI coach cible existe.** Conséquence pour la nuit : sur le frontend,
on COMPLÈTE (écran Doctrine/Copilot à créer, mode test à câbler sur le simulateur existant,
Cohorte à re-mapper actif/glisse/silencieux) — on ne repart pas de zéro. Les deux écrans
manquants sont précisément : **Doctrine** (rien n'existe) et **Mode test** (briques : le
simulateur WhatsApp web `useChat`/`ChatInterface` + le deep-link wa.me de `PlanSavedModal`).

---

## 3. ARCHITECTURE CIBLE

### 3.1 Routing conversationnel — la règle d'or anti-regex

Leçon de la semaine (7 bugs en production) + état de l'art ([Redis — LLM router architecture](https://redis.io/blog/llm-router-architecture-best-practices/),
[aurelio-labs/semantic-router](https://github.com/aurelio-labs/semantic-router)) : le pattern
gagnant est **hybride à responsabilités strictes** :

- **Déterministe UNIQUEMENT pour** : le réglementaire (STOP/opt-out — ancré volontairement),
  le destructif (« mauvais numéro » — confiance maximale exigée), les identifiants exacts
  (payloads de boutons, `reply_to_wamid`), la dédup (wamid). <1 ms, zéro ambiguïté.
- **LLM pour TOUT le sens.** Jamais de regex pour interpréter un humain. Chaque regex
  sémantique est une dette qui meurt en silence (« Cest tout à fait moi » → ignoré). Si tu es
  tenté d'ajouter une regex de sens : c'est un cas pour le classifieur, avec du contexte.
- **Le classifieur reçoit toujours LA QUESTION posée**, pas juste des libellés flottants
  (leçon : le classifieur aveugle qui ratait un accord évident). Sortie structurée JSON
  `{choice|unrelated|unknown, confidence}` avec droit au doute → fallback dispatcher, jamais
  de choix forcé. Match des libellés NORMALISÉ (jamais de comparaison stricte).

**Ordre des gardes (sacré, dans cet ordre)** :
`dédup wamid → STOP/opt-out → wrong-number → safety pregate → contexte armé (dernier message
sortant attendant réponse, plafonné à 3 tours entrants, remplacé seulement par un contexte
plus récent — PAS par une réponse réactive de Sophia) → dispatcher global LLM → flow local
(avec local dispatcher) → réponse normale`.

### 3.2 Dispatcher global + flows locaux

- **Dispatcher global (LLM, sortie structurée)** : classe l'intention entrante
  (photo_repas | question_nutrition | report_action | détresse/safety | hors-sujet | smalltalk |
  admin) et route. Seuil de confiance ; sous le seuil → clarification courte, pas de devinette.
- **Flows locaux** (machines à états courtes, chacune avec SON local dispatcher LLM pour les
  edge cases internes) : `meal_photo` (analyse → confirmation → log), `checkin_matin`,
  `bilan_soir`, `bilan_hebdo`, `optin`, `coach_test_mode`. Règles pour CHAQUE flow :
  conditions d'entrée ET de sortie explicites, timeout, max-tours, et **escape hatch**
  obligatoire (l'utilisateur change de sujet → on sort proprement vers le dispatcher global —
  ne JAMAIS piéger quelqu'un dans un flow ; leçon : `blocked_exit_before_plan_ready`).
- Les réponses aux messages proactifs sont classées contre le contexte armé AVANT le
  dispatcher global (c'est le mécanisme template-armé existant, à généraliser à tout sortant
  qui pose une question).

### 3.3 Injection de la méthode coach (assemblage en couches + cache)

**Jamais de fine-tuning** (opaque, inauditables, réentraînement à chaque édition, ingérable
par coach). À la place, assemblage par couches à chaque appel :

```
[SYSTEM CORE]            — règles produit, safety, autorité coach (invariant)
[DOCTRINE COACH]         — croyances + INTERDITS + vocabulaire + arbitrages + voix
                           → PROMPT MIS EN CACHE par coach (Gemini context caching :
                           lectures ~10 % du prix, break-even à 1 lecture/heure —
                           largement dépassé avec des élèves actifs)
[PROTOCOLE — STRUCTURÉ]  — la semaine courante de CET élève depuis les tables (jamais
                           en prose : requêtable, traçable, ancre les relances)
[MÉMOIRE ÉLÈVE]          — digest : repas récurrents, préférences, allergies, état momentum
[FENÊTRE CONVERSATION]   — derniers tours
```

**Les INTERDITS ont un double verrou** : injectés dans le prompt ET vérifiés
post-génération par un filtre déterministe sur la sortie (liste de claims interdits par
coach). Une seule contradiction publique avec le coach détruit la confiance — ceinture et
bretelles obligatoires. L'édition de doctrine par le coach doit être visible au message
suivant (invalidation du cache à l'édition).

### 3.3bis Fluidité conversationnelle — état de l'art appliqué (recherche 2026)

Quatre patterns issus de la littérature récente, chacun avec sa traduction concrète ici :

- **Les arbres à décision : le squelette, jamais l'interprète.** Les flows locaux SONT des
  arbres à décision (nœuds = états, branches = transitions, sorties/timeouts/max-tours
  explicites) — c'est ce qui rend le système prévisible, testable et auditable. MAIS le
  branchement à chaque nœud est décidé par **classification LLM du sens**, jamais par regex.
  Formule : *l'arbre structure, le LLM comprend*. Un arbre sans LLM = chatbot rigide des
  années 2015 ; un LLM sans arbre = agent imprévisible et non testable. On veut les deux.
- **Dialogue State Tracking explicite** ([survey DST](https://arxiv.org/pdf/2207.14627)) :
  l'état de la conversation est un objet STRUCTURÉ maintenu à chaque tour (slot-values :
  semaine du protocole, dernier repas loggué, question armée en attente, momentum, flow
  actif), pas une relecture de l'historique à chaque fois. Le moteur existant fait déjà ça
  (whatsapp_state, contexte armé) — le généraliser, jamais le contourner.
- **Mixed-initiative** ([survey proactive dialogue](https://arxiv.org/pdf/2305.02750)) :
  les DEUX parties peuvent prendre l'initiative. L'élève peut interrompre, changer de sujet,
  poser autre chose en plein flow → escape hatch systématique (son initiative gagne toujours).
  Sophia prend l'initiative par le proactif (relances, check-ins) mais **cède immédiatement**
  si l'élève embraye ailleurs. Un flow qui retient un utilisateur contre son intention est un
  bug de conception, pas un cas limite.
- **Réparation et clarification** ([Learning to Clarify](https://arxiv.org/pdf/2406.00222)) :
  en cas d'ambiguïté, trois choix — deviner (interdit), clarifier (coûteux), continuer avec
  l'hypothèse la plus probable EN LA DISANT (« je pars sur ton petit-déj habituel — dis-moi si
  c'est autre chose »). Règle : clarifier UNIQUEMENT si l'ambiguïté change l'action (même
  critère que pour les photos) ; sinon, hypothèse annoncée + porte de correction. C'est ce qui
  fait la différence entre « fluide » et « interrogatoire ».
- **Évaluation multi-tours** ([Confident AI — multi-turn eval](https://www.confident-ai.com/blog/multi-turn-llm-evaluation-in-2026)) :
  on évalue des CONVERSATIONS entières, jamais des paires question-réponse isolées. D'où le
  scénario canonique §7.2 : chaque test d'intégration est un dialogue complet scripté, avec
  assertions sur la trajectoire (état final + étapes), pas sur des messages isolés.

### 3.4 Mémoire alimentaire (3 magasins + gouvernance) — SPÉCIFICATION PRÉCISE

#### 3.4.1 Schémas (niveau SQL — nommage à affiner, contrats fermes)

```sql
-- MAGASIN 1 : ÉPISODIQUE — le journal de repas
create table meal_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  eaten_at timestamptz not null,                -- résolu depuis le contexte, pas created_at
  meal_slot text check (meal_slot in ('breakfast','lunch','dinner','snack','unknown')),
  source text not null check (source in ('photo','text','button','recurring_confirm')),
  photo_media_id text,                          -- media WhatsApp (télécharger AVANT expiration)
  photo_storage_path text,                      -- copie persistée (bucket privé)
  items jsonb not null,                         -- [{nom, portion_g:{min,max,best}, confiance}]
  nutrients jsonb,                              -- {kcal:{min,max}, proteines_g:{...}, ...}
  assumptions jsonb not null default '[]',      -- registre d'hypothèses (huile, sauce…)
  overall_confidence numeric,
  matched_recurring_meal_id uuid,               -- si reconnu comme repas récurrent
  user_confirmation text check (user_confirmation in ('unconfirmed','confirmed','corrected')),
  correction_raw text,                          -- ce que l'élève a répondu pour corriger
  created_at timestamptz not null default now()
);

-- MAGASIN 2 : SÉMANTIQUE-STRUCTURÉ — les repas récurrents (connaissance distillée)
create table recurring_meals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  label text not null,                          -- "petit-déj habituel : skyr + granola + myrtilles"
  canonical_items jsonb not null,               -- items avec portions CONFIRMÉES par l'élève
  meal_slot text,
  occurrences int not null default 1,
  last_seen_at timestamptz,
  portion_bias jsonb,                           -- calibration : {riz: +25%, viande: ok}
  status text not null default 'active' check (status in ('candidate','active','stale')),
  created_at timestamptz not null default now()
);

-- MAGASIN 3 : SÉMANTIQUE-FAITS — préférences, contraintes, allergies
create table student_facts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  kind text not null check (kind in
    ('allergy','intolerance','diet_constraint',   -- végétarien/halal/casher…
     'preference','aversion','context','goal_note')),
  value jsonb not null,                         -- {label:"arachide", severity:"declared"}
  is_hard_constraint boolean not null default false,  -- TRUE pour allergy/intolerance/diet
  status text not null default 'active' check (status in ('active','invalidated')),
  source_message_id uuid,                       -- traçabilité : d'où vient ce fait
  declared_by text not null default 'student' check (declared_by in ('student','coach')),
  created_at timestamptz not null default now(),
  invalidated_at timestamptz
);
```

#### 3.4.2 Logiques de récupération — UNE PAR MAGASIN (jamais un RAG unique)

| Magasin | Récupération | Quand |
|---|---|---|
| `meal_entries` | SQL par date/slot (« qu'a-t-il mangé aujourd'hui/cette semaine ») | Bilans, synthèses coach, contexte du jour |
| `recurring_meals` | Matching de similarité d'items à l'analyse photo (canonique d'abord : mêmes items ± portions ; embeddings seulement si le canonique ne suffit pas — ne pas sur-ingénierer) | À CHAQUE photo, AVANT l'analyse complète |
| `student_facts` | **Toujours injectés** en digest compact (≤ ~300 tokens) dans la couche MÉMOIRE ÉLÈVE du prompt ; les `is_hard_constraint` sont EN PLUS vérifiés post-génération | Chaque appel LLM |

#### 3.4.3 Calibration par personne (l'algorithme, simple et suffisant)

1. À chaque `user_confirmation='corrected'` : stocker le delta (estimé vs corrigé) par
   catégorie d'aliment dans `recurring_meals.portion_bias` (si repas récurrent) ou dans un
   agrégat par élève (3 corrections mêmes-sens sur une catégorie → facteur de biais appliqué
   aux estimations suivantes, borné à ±40 %).
2. Le bruit aléatoire NE se corrige PAS (il se compense sur la semaine) ; seul le biais
   RÉPÉTÉ dans le même sens se corrige. Ne jamais sur-réagir à une correction unique.

#### 3.4.4 Consolidation nocturne (épisodique → sémantique)

Job batch quotidien (réutiliser le pattern « memorizer » existant du moteur) :
- Grouper les `meal_entries` des 14 derniers jours par similarité d'items →
  ≥3 occurrences similaires = promotion en `recurring_meals` (status `candidate`, passe
  `active` à la première confirmation conversationnelle « ton petit-déj habituel ? — oui »).
- `recurring_meals` non vus depuis 30 jours → `stale` (ne plus proposer).
- Extraire les candidats `student_facts` depuis les conversations du jour (préférences,
  aversions exprimées) — MAIS : **les allergies ne sont JAMAIS inférées**, uniquement créées
  sur déclaration explicite de l'élève (ou saisie coach). Une allergie déduite à tort qui
  bloque des suggestions est gênante ; une allergie ratée est dangereuse ; une allergie
  inventée détruit la confiance. Déclaration explicite ou rien.

#### 3.4.5 Le double verrou des contraintes dures (identique aux interdits coach)

Toute sortie LLM destinée à l'élève passe un filtre déterministe post-génération :
la suggestion contient-elle un aliment matchant un `student_facts` actif avec
`is_hard_constraint=true` ? → régénération avec le fait remonté en instruction explicite,
et log de l'incident. Même mécanique, même code, deux sources (interdits coach + contraintes
élève). C'est du safety, pas de la personnalisation.

**Ancrage état de l'art** : la taxonomie qui a convergé en 2026
([Designing Agentic Memory](https://thenuancedperspective.substack.com/p/designing-agentic-memory-in-2026),
pattern MemGPT/Letta core-archival-recall) mappe exactement nos magasins —
*épisodique* = le journal de repas (ce qui s'est passé, quand), *sémantique* = le registre
récurrent + préférences/allergies (la connaissance distillée), *procédurale* = doctrine et
protocole du coach (comment agir), *working* = la fenêtre de conversation + l'état DST.
Deux règles de production tirées de la littérature : (1) **des logiques de récupération
DIFFÉRENTES par type** — le journal se requête par date/repas (SQL), le sémantique par
pertinence, le procédural s'injecte toujours ; ne JAMAIS tout écraser en un seul RAG.
(2) **La consolidation est un processus explicite** : épisodique → sémantique (« 4 petits-déjs
identiques confirmés → repas récurrent avec portion calibrée ») tourne en batch nocturne —
le pattern « memorizer » du moteur existant fait déjà exactement ça, le réutiliser.

**Gouvernance** : correction utilisateur → propagation immédiate (l'ancienne valeur est
invalidée — protection contre la contamination mémoire) ; les états aigus ne se cristallisent
pas en faits identitaires ;
**garde-fou TCA** (troubles du comportement alimentaire) : jamais de jugement moral sur la
nourriture, jamais d'encouragement à la restriction extrême, détection de signaux
(obsession du chiffre, restriction sévère, purge) → posture douce + orientation pro. C'est
une extension du safety pregate existant, spécifique au vertical nutrition.

### 3.5 Pipeline photo (le contrat)

**CORRECTION D'INVENTAIRE (vérifiée, ANNEXE C)** : les deux blocages historiques sont
**DÉJÀ LEVÉS** par la couche KEEL — `wa_parse.ts` propage désormais `media_id`
(type `WhatsAppInboundMedia`), et `_shared/vision.ts` existe comme client multimodal séparé
(`gemini.ts` reste volontairement texte-seul, ~286 sites d'appel intouchés). Il existe même
déjà `analyze-meal-photo-v1` + `_shared/keel/meal_analysis.ts`. **Vérifier avant de coder —
ne pas refaire ce qui existe.**

**⚠️ ARBITRAGE PRODUIT P0.0bis — kcal/macros.** Le contrat EXISTANT de `meal_analysis.ts`
INTERDIT explicitement kcal/macros (« CONTRACT non-input #4 ») ; le contrat cible ci-dessous
les exige en fourchettes. Décision de nuit (documentée dans PROGRESS.md) : **étendre le
contrat existant** vers les fourchettes + hypothèses + `question_qui_changerait_tout`, en
gardant ses filtres et sa traçabilité — le retour à l'ÉLÈVE reste qualitatif-d'abord (le
chiffre en fourchette est secondaire, jamais un « 347 kcal » sec), et les fourchettes
alimentent la synthèse coach + le webhook coach (§1.8). Si un garde-fou TCA s'y oppose pour
un élève flaggé, le chiffre est masqué pour LUI (le garde `restriction_guard.ts` existe déjà).

Architecture en 2 étages : **vision LLM** (identifie les aliments, estime les portions en
fourchettes, génère les hypothèses) puis **base nutritionnelle** (USDA/CIQUAL : les nutriments
viennent d'une table de référence une fois « steak 180 g » posé — défendable, pas halluciné).

Contrat JSON (service interne, consommé par l'agent WhatsApp + webhook coach optionnel) :

```json
{
  "items": [{ "nom": "...", "portion_estimee_g": {"min":0,"max":0,"best":0}, "confiance": 0.0 }],
  "nutriments": { "kcal": {"min":0,"max":0}, "proteines_g": {...}, "glucides_g": {...}, "lipides_g": {...} },
  "hypotheses": [{ "sujet": "cuisson", "hypothese": "poêle + ~10g MG (non visible, standard)", "impact_kcal": 0 }],
  "question_qui_changerait_tout": "…| null",
  "confiance_globale": 0.0
}
```

Règles : fourchettes toujours, hypothèses toujours explicites (l'invisible — huile, sucre —
est supposé par défauts standards ET déclaré), une question max et seulement si elle change la
conclusion de coaching (test : à ±30 % l'estimation, le message change-t-il ?), reconnaissance
des repas récurrents avant ré-analyse complète. Le retour à l'élève est **qualitatif aligné
protocole** (« bonne portion de protéines, pile ce que [Coach] te demande cette semaine »),
le chiffre en fourchette est secondaire.

### 3.6 Modèle de données — RÉVISÉ après inventaire (ANNEXE B)

**La moitié de la cible existe déjà** (migrations KEEL). Mapping cible → existant :

| Cible | Existe déjà | Reste à faire |
|---|---|---|
| `coaches` | ✅ `coaches` | — |
| `programs`+`program_weeks` | ✅ `plan_templates` + `plan_versions.phase_plan` | aligner sur un découpage PAR SEMAINE |
| `meal_entries` | ✅ `protocol_events` (source photo/text, recognized) | étendre au contrat §3.5 (items/fourchettes/hypothèses) |
| `student_memory` | ✅ `memory_items` (+ `student_safety_constraints` pour les allergies) | adapter au domaine (§3.4) |
| facturation actif + coût WA | ✅ `coach_billing_periods` + `whatsapp_cost_events` + `keel_student_interaction_count()` | définir « actif = ≥1 interaction/mois » |
| tenancy par vues | ✅ `coach_student_directory`, `coach_student_events`, `coached_student_ids()` | étendre aux nouvelles tables |
| `coach_doctrines` | ❌ absent | **créer** (§3.7) |
| `cohorts` | ❌ absent (`coach_clients` est plat) | **créer** + `coach_clients.cohort_id` |
| `coach_syntheses` | ❌ absent | **créer** (P2.8) |
| `recurring_meals` | ⚠️ `meal_ideas` est côté coach | **créer côté élève** (§3.4) |

**⚠️ LA DÉCISION D'ARCHITECTURE P0.0 — l'identité élève.** Toutes les tables KEEL exigent
`student_id → auth.users(id)` NOT NULL. Notre cible : élève SANS compte (identité = numéro
WhatsApp). Deux options : (A) table `students` autonome avec son propre PK → migrer ~15 FK
KEEL ; (B) **provisionner un `auth.users` fantôme par numéro** (création programmatique à
l'invitation, sans mot de passe ni login) → zéro migration de FK, RLS intacte, et un chemin
d'upgrade si un jour l'élève a une interface. **Recommandation : (B)** — c'est la moins
invasive pour une nuit et elle est réversible ; l'agent documente son choix dans PROGRESS.md.
Petites dettes à fermer au passage : `plan_templates.coach_id` et `plan_documents.coach_id`
sans FK (TODO explicites en migration), `handle_new_user()` réécrite 3 fois — toute modif
repart de la version `20260727200000`.

### 3.7 Le Doctrine Copilot — le coach améliore son IA PAR l'IA (exigence produit centrale)

Le coach n'est ni prompt-engineer ni développeur. L'écran « Doctrine » n'est donc PAS un
textarea brut : c'est un **copilote conversationnel** qui transforme le savoir du coach en
configuration, et les conversations réelles en améliorations. Six briques, par ordre de
valeur :

1. **L'interview initiale (le setup §1.4 EST déjà ce copilote)** : un méta-agent interviewe
   le coach (croyances → interdits → vocabulaire → 3 cas durs → ton) et compile ses réponses
   en doctrine structurée. Le coach parle, l'IA configure. Sortie : `coach_doctrines` v1.
2. **Le replay différentiel** : le coach ouvre n'importe quel échange passé de son agent →
   « réécris avec ma doctrine actuelle » → affichage côte à côte avant/après → il valide ou
   ajuste encore. C'est LE geste qui rend l'édition de doctrine concrète (il voit l'effet sur
   de VRAIES conversations, pas sur une promesse), et c'est trivial à implémenter : rejouer
   l'assemblage §3.3 avec la nouvelle doctrine sur l'historique stocké.
3. **« Pourquoi tu as dit ça ? »** : chaque message sortant garde une trace de son assemblage
   (`prompt_trace` : quelle règle de doctrine, quel item de protocole, quel fait mémoire ont
   été injectés). Le coach clique un message → il voit les sources. Explicabilité = confiance
   = rétention coach. (Bonus : c'est aussi NOTRE outil de debug — l'observabilité qu'on n'a
   jamais eue, la table `llm_raw_response_events` vide est réparée par la même occasion.)
4. **Les suggestions hebdo (la boucle d'amélioration passive)** : miner les conversations de
   la semaine — classifications à faible confiance, fallbacks « unrelated », questions
   d'élèves restées vagues — et pousser au coach 3 situations : *« un élève m'a demandé X,
   j'ai répondu Y, j'étais incertaine. Tu aurais dit quoi ? »* Sa réponse devient un
   **arbitrage** versionné dans la doctrine (few-shot). L'agent s'améliore en travaillant,
   le coach investit 5 min/semaine, l'effet IKEA se renouvelle.
5. **Les scénarios de test auto-générés** : depuis le protocole, générer N situations
   d'élèves types (« Julie, semaine 2, envoie une photo de pizza un jeudi soir ») → l'agent
   répond → le coach note 👍/👎 et réécrit si besoin → chaque réécriture = arbitrage stocké.
   C'est le mode test §1.4, industrialisé.
6. **Versioning + rollback** : chaque publication de doctrine = version datée, diff visible,
   retour en un clic, **invalidation du cache** à la publication (§3.3). Un coach qui teste
   une formulation et se rate doit pouvoir revenir en 10 secondes.

Priorité de nuit : briques 1, 2, 6 (P2) ; briques 3 (P3 — liée à l'observabilité) ;
briques 4, 5 (post-nuit si le temps manque — les nommer dans STATUS-MORNING).

**Table associée** :
```sql
create table coach_doctrines (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches(id),
  version int not null,
  beliefs jsonb not null default '[]',        -- croyances/principes
  forbidden jsonb not null default '[]',      -- INTERDITS (double verrou §3.3)
  vocabulary jsonb not null default '[]',     -- termes du coach
  arbitrations jsonb not null default '[]',   -- cas durs : situation → réponse validée
  voice jsonb not null default '{}',          -- tutoiement, longueur, emojis, langue
  compiled_prompt text,                       -- le bloc compilé mis en cache
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (coach_id, version)
);
```

---

## 4. PHASES D'EXÉCUTION (chacune a une Definition of Done vérifiée par test)

**P0 — Fondations (bloquant tout le reste)**
0. **Les DEUX décisions d'architecture** (documentées dans PROGRESS.md avec alternative) :
   (a) identité élève — recommandation : auth.users fantôme par numéro (§3.6) ;
   (b) contrat kcal/macros — recommandation : étendre le contrat existant (§3.5).
1. Snapshot : commit WIP de la branche courante avant toute modif (`git add -A && commit`).
   Puis lire `docs/keel/` (BUILD_PLAN.md, CONTRACT.md, SCHEMA.md) — **l'autorité de la couche
   KEEL existante** — avant toute ligne de code.
2. Tables MANQUANTES uniquement (§3.6 : `coach_doctrines`, `cohorts`, `coach_syntheses`,
   `recurring_meals` côté élève, extensions `meal/protocol_events`) + extension des vues
   tenancy existantes. Migrations locales.
3. Pipeline photo : VÉRIFIER l'existant (`analyze-meal-photo-v1`, `vision.ts`, handler photo
   du webhook) puis ÉTENDRE au contrat §3.5 (fourchettes+hypothèses+question). Tests fixtures.
   *DoD : une image envoyée via le sim produit une entrée repas complète avec
   fourchettes+hypothèses, ET le retour élève reste qualitatif-d'abord.*

**P1 — La boucle élève**
4. Dispatcher global LLM + flows locaux `meal_photo`, `optin` (avec escape hatches, max-tours).
5. Injection doctrine (couches + cache + double verrou interdits + allergies).
6. Proactif nutrition : checkin matin (si protocole), relance décrochage 48-72h (ton adapté
   au momentum), bilan hebdo élève. Réutiliser le moteur outbound existant (caps, fenêtres,
   retries, contexte armé).
   *DoD : scénario scripté complet vert (voir §7) sur stack locale.*

**P2 — La boucle coach**
7. Parsing protocole (réutiliser le pipeline intake : texte brut → structuration → écran de
   validation) + **Doctrine Copilot briques 1, 2 et 6** (§3.7 : interview qui compile la
   doctrine, replay différentiel, versioning+rollback+invalidation cache) + mode test (le
   coach parle à son agent via le sim ou un numéro flaggé test).
8. Synthèse hebdo générée depuis les données réelles (actifs, adhérence, 3 à risque) +
   rapport de complétion de cohorte.
9. Écrans coach — **sur le socle KEEL existant** (ANNEXE A, §4 « socle UI coach ») :
   Protocole = adapter `PlanImportPage`+`CommitmentEditor` (regrouper par semaine) ;
   Cohorte = re-mapper `CoachHomePage` (actif/glisse/silencieux) + `InviteDialog` en collage
   de numéros ; Doctrine/Copilot = À CRÉER sur `KeelAppShell`+`Field`+`Card` ;
   Mode test = câbler `ChatPage`/`ChatInterface` (flag sim WhatsApp existant).
   *DoD : le niveau N3 (§7.4) passe : un coach fixture fait TOUT le parcours sans toucher la
   base à la main — programme collé → doctrine par interview → 10 questions pièges → publie →
   invite → 3 élèves fixtures → synthèse reçue.*

**P3 — Durcissement**
10. Passe adversariale (§7.3), edge cases (§5), **la semaine simulée N2 complète (§7.4) —
    c'est le juge de paix de la nuit**, nettoyage legacy phase 1 (§6), observabilité
    (`prompt_trace` — §3.7 brique 3 — + brancher réellement `llm_raw_response_events` — VIDE
    aujourd'hui), compteur de coût WhatsApp/élève (§1.7).

---

## 5. CATALOGUE D'EDGE CASES (obligatoires, chacun = un test)

Conversation : rafale de messages (3 messages en 30 s — le contexte armé doit tenir) ;
changement de sujet en plein flow (escape hatch) ; réponse à une question posée il y a 2 jours ;
photo floue/pas de la nourriture/menu de resto/écran ; vocal (non supporté → réponse honnête) ;
plusieurs photos d'affilée ; « j'ai craqué ce soir » (arbitrage coach, jamais de morale) ;
allergie déclarée en cours de route → mémoire + jamais contredite ensuite ; message dans une
autre langue ; STOP puis retour ; numéro inconnu (pas dans une cohorte) ; élève de DEUX coachs
(décision explicite : interdit v1 → message propre) ; coach qui édite sa doctrine pendant une
conversation en cours ; fuseau horaire élève ≠ coach ; fin de cohorte (que dit Sophia ?) ;
signaux TCA (restriction extrême, obsession) → posture + orientation, jamais de chiffres en
retour ; question médicale hors périmètre (« et avec mon diabète ? ») → orientation pro,
pas de conseil médical.

Système : élève sans photo pendant 5 jours mais qui répond aux textes (actif ? oui) ;
media WhatsApp expiré/échec de téléchargement ; timeout LLM en pleine analyse (best-effort,
jamais de silence total) ; double webhook (dédup) ; cache doctrine invalidé pendant une
conversation.

---

## 6. LEGACY — stratégie strangler, MANIFESTS EXHAUSTIFS EN ANNEXES

Les manifests précis, vérifiés fichier par fichier et table par table, sont en annexes —
**ils font autorité** sur cette section :
- **ANNEXE A** : frontend (28 routes, 30 pages, 10 groupes de composants, verdicts + socle
  UI coach avec chemins exacts).
- **ANNEXE B** : base de données (128 tables, 5 vues, ~147 fonctions SQL, contraintes de
  démolition avec les cycles de FK et **l'ordre de démolition validé feuilles→racine**).
- **ANNEXE C** : edge functions (65 fonctions : 27 GARDER / 15 ADAPTER / 5 DÉBRANCHER /
  18 SUPPRIMER-APRÈS-CUTOVER, modules `_shared/`, et les 26 jobs pg_cron avec verdicts).

Règles d'exécution :
1. **Construire à côté** — ne rien casser tant que P0-P2 ne sont pas verts.
2. **Débrancher cette nuit (actions urgentes identifiées)** : couper les crons
   `trigger-retention-emails` (⚠️ envoie de VRAIS emails B2C) et
   `process-whatsapp-optin-recovery` (winback B2C), `reseed-recurring-reminders`
   (brûle du LLM sur du legacy chaque dimanche), `trigger-watcher-batch`, `keel-arm-cards`.
   Débrancher = ne plus être appelé, pas supprimer. Le débranchement legacy a déjà commencé
   (`20260727150000` : 8 triggers droppés, 2 crons unschedulés) — continuer dans son style.
3. **La démolition du spine suit STRICTEMENT l'ordre de l'ANNEXE B §F** (2 FK sans ON DELETE
   à dropper d'abord, 2 cycles de FK à casser, 5 FK composites qui interdisent tout
   DROP COLUMN prématuré). Elle se fait APRÈS validation réelle du produit — pas cette nuit.
   Les groupes SANS FK spine (modules/architect/referral/core_identity) sont supprimables
   immédiatement — ⚠️ sauf referral : réécrire `handle_new_user()` d'abord (3 réécritures
   successives, repartir de la version `20260727200000`).
4. Ce qui reste vivant du moteur : outbound + retries + caps, machine à états, classifieur
   contextuel, safety pregate (+ `restriction_guard` TCA et `safety_constraints` allergies
   déjà écrits côté KEEL), mémoire (adaptée), infra WhatsApp, intake structuration,
   et TOUTE la couche KEEL (fonctions `keel-*`, `plan-import/template/publish-v1`,
   `provision-day-v1`, `evaluate-adherence-v1`, crons keel-*).

---

## 7. PROTOCOLE DE TEST (« tester jusqu'à ce que tout marche »)

### 7.1 Boucle standard par phase
`deno check` propre sur tout fichier touché → tests unitaires des fonctions pures (mapping
classifieur, maths portions/fourchettes, filtres interdits/allergies, décision de relance) →
intégration sur stack locale (Supabase local + `whatsapp-sim-inbound` + `MEGA_TEST_MODE=1`,
LLM réel via `force_full_ai` si clés dispo, sinon stubs + fixtures) → le scénario scripté de
la phase passe EN ENTIER. Rouge → fix → re-run. Pas de phase suivante avec un rouge.

### 7.2 Scénario canonique de bout en bout (le juge de paix de la nuit)
Coach fixture « Marc » (doctrine : jeûne intermittent, interdit « 6 petits repas », parle en
grammes, tutoie) + élève fixture « Julie » (allergie arachide déclarée) :
optin → photo petit-déj → retour aligné protocole → question resto → réponse doctrine →
2 jours de silence simulés (horloge) → relance douce → « semaine de merde » → allègement du
ton + signal dans la synthèse → photo d'un plat contenant des cacahuètes → l'agent ne suggère
JAMAIS d'en manger → bilan hebdo élève → synthèse coach avec Julie flaggée. Chaque flèche est
une assertion.

### 7.3 Passe adversariale finale — les 7 patterns qui nous ont eus cette semaine
Audite le code produit de la nuit contre chacun : (1) regex sémantique ancrée quelque part ?
(2) condition toujours-vraie/fausse (garde qui teste l'existence d'une donnée seedée par
défaut) ? (3) producteur qui n'écrit pas ce que le consommateur lit (ligne outbound manquante) ?
(4) contexte calculé puis jeté (un classifieur/LLM aveugle à la question posée) ?
(5) désalignement config externe vs code (nom/locale de template Meta, env vars — erreur 132001) ?
(6) deux sources de vérité qui peuvent diverger sur le même état ? (7) « vert en simulation »
présenté comme « vérifié en réel » ? Chaque finding → fix ou entrée STATUS-MORNING.

### 7.4 L'échelle de validation en conditions réelles (du sim au réel, dans l'ordre)

Chaque niveau est un gate : on ne monte pas tant que le niveau courant n'est pas vert.

**N1 — Sim local complet** (la nuit) : stack locale + `whatsapp-sim-inbound` +
`MEGA_TEST_MODE=1` (LLM réel via `force_full_ai` si clés dispo — sinon stubs + fixtures et
le noter). Tous les scénarios §7.2 et edge cases §5.

**N2 — La SEMAINE SIMULÉE (la nuit — le boss final du sim)** : le harnais d'horloge simulée
existe dans le repo (pattern QA : horloge ≥ réel, cleanup `whatsapp_pending_actions`) —
l'utiliser pour compresser 7 jours en une session. Script jour par jour, chaque ligne = des
assertions (messages attendus, état DST, tables) :

| Jour | Événements élève (sim) | Comportement attendu (assertions) |
|---|---|---|
| J1 matin | Opt-in « Oui » | Bienvenue au nom du coach ; student actif ; state propre |
| J1 midi | Photo poulet-riz | Analyse < contrat §3.5 ; retour aligné protocole, voix coach ; meal_entry complète |
| J1 soir | Photo + « avec de l'huile du coup ? » | Mise à jour de l'entrée, pas de double log |
| J2 matin | (rien) | Check-in matinal SI le protocole le prévoit, sinon SILENCE (caps respectés) |
| J2 midi | Même petit-déj que J1 en photo | Reconnaissance récurrente (« ton petit-déj habituel ? ») — PAS de ré-analyse complète |
| J2 soir | « je suis au resto, je prends quoi ? » | Réponse doctrine, jamais hors interdits ; aucune violation contrainte dure |
| J3 | « au fait je suis allergique aux noix » | student_facts allergy créé ; accusé réception sobre |
| J3 soir | Photo d'un plat avec noix visible | L'agent le SIGNALE avec douceur, ne suggère jamais d'en manger |
| J4-J5 | SILENCE TOTAL | J5 : relance douce (48-72h), UNE seule, ton adapté ; pas de spam ; momentum → glisse |
| J5 soir | « semaine de merde, j'ai tout lâché » | Allègement ton+cadence ; ZÉRO culpabilisation ; signal noté pour synthèse coach ; protocole INCHANGÉ |
| J6 | « bon on reprend » + photo | Reprise chaleureuse SANS revenir sur l'épisode ; log normal |
| J7 | (rien) | Bilan hebdo élève (court, honnête, sans streak) ; SYNTHÈSE COACH générée : actifs, adhérence, l'élève flaggé J4-J5, l'allergie notée |

Puis rejouer la même semaine avec un 2ᵉ élève fixture en parallèle (isolation des mémoires,
pas de fuite croisée) et vérifier la synthèse coach à 2 élèves.

**N3 — Onboarding COACH de bout en bout** (la nuit, via l'UI + sim) : créer un compte coach
réel → coller un vrai programme (utiliser un vrai PDF de programme nutrition trouvé/rédigé
en fixture) → valider le parsing → interview doctrine complète (les 5 couches) → mode test :
10 questions pièges dont 2 qui tentent de violer les interdits → publication → invitation
d'un élève. DoD : le coach fixture peut TOUT faire sans toucher à la base à la main.

**N4 — Réel Meta (le matin, Thomas — préparé par la nuit)** : la checklist §7.5 exécutable
en < 1h : deploy, templates (noms + locales vérifiés), vrai téléphone : opt-in réel → photo
RÉELLE d'un vrai repas → réponse → relance réelle (horloge staging avancée) → synthèse reçue.
Puis : onboarding du PREMIER VRAI COACH avec Thomas en pair-pilotage (§1.4, ~30 min).

### 7.5 Ce que la nuit NE PEUT PAS prouver (à écrire tel quel dans STATUS-MORNING.md)
Le sim ne traverse pas Meta. Resteront à faire au matin par Thomas : déploiement des fonctions
(interdit à l'agent), création/vérification des templates WhatsApp (noms ET locales exactes),
smoke test réel avec un vrai téléphone (photo réelle incluse), clés API réelles, coûts WhatsApp
réels. Livrer cette checklist prête à dérouler.

---

## 8. RÈGLES D'ENGAGEMENT DE LA NUIT

- **Branche** : travailler sur la branche courante (`Nutrition`). Premier geste : commit
  snapshot du WIP. Ensuite : un commit par phase verte (messages clairs, en anglais court).
- **INTERDIT ABSOLU** (hook + doctrine repo) : `supabase functions deploy`, `db push`,
  secrets, tout ce qui touche le distant. Local : migrations et reset locaux OK.
- **Jamais bloqué plus de 30 min sur le même mur** : documenter dans PROGRESS.md, tenter UN
  contournement, sinon passer au chantier suivant et y revenir. L'arrêt total est interdit ;
  la seule fin acceptable est : plan entièrement en place, ou chaque reste documenté avec
  cause + tentative + prochaine étape.
- **PROGRESS.md** : horodaté, append-only, une ligne par étape (fait/vert/rouge/décision).
- **STATUS-MORNING.md** : état par phase, tests qui tournent (commande exacte pour les
  rejouer), ce qui reste, la checklist réelle du matin, et les décisions prises seul dans la
  nuit (avec alternative si Thomas veut revenir dessus).
- **Honnêteté** : ne jamais écrire « fait » sans le test qui le prouve. Un doute = un flag.

---
---

# ANNEXE A — INVENTAIRE FRONTEND EXHAUSTIF (vérifié fichier par fichier)

**Racine :** `frontend/` · **Totaux (preuve d'exhaustivité)** : 28 routes (dont 1 dev-only +
1 redirect) · 30 pages (15 `src/pages/` + 15 `src/keel/pages/`) · 10 groupes de composants ·
39 fichiers `src/components/` · 52 fichiers `src/keel/` · 22 modules `src/lib/` (+8 tests) ·
7 hooks · 3 contexts · 3 security · 13 modules `src/keel/api/` (+3 tests) · **187 fichiers `src/`**.

**Synthèse** : le pivot antérieur « KEEL » (`src/keel/`) est un socle coach↔élève B2B complet
et récent. ~70 % de l'UI coach cible existe. Le legacy B2C restant : landing FR, onboarding-v2,
dashboard-v2, `/le-plan`, `/upgrade`. Les pages `architecte/*`, `grimoire/*`, `formules`,
`parrainage` sont DÉJÀ supprimées (aucun dossier `src/components/architect/`).

## A.1 Routes (28) — `src/App.tsx`

### Socle auth / légal / base — GARDER (8)

| Route | Composant | Verdict |
|---|---|---|
| `/auth` | `pages/Auth.tsx` (1320 l.) | GARDER — gère déjà `resolveHomePath` (keel) + `consumePendingCoachInvitation`. Retirer champ parrainage + fuseau B2C |
| `/reset-password` | `pages/ResetPassword.tsx` | GARDER tel quel |
| `/email-verified` | `pages/EmailVerified.tsx` | GARDER (traduire EN) |
| `/legal` | `pages/Legal.tsx` | GARDER — réécrire le contenu B2C→B2B |
| `/account` | `pages/Account.tsx` → `UserProfile` | ADAPTER — garder général + RGPD (`DataPrivacySection`), supprimer l'onglet abonnement B2C |
| `/admin` | `pages/AdminDashboard.tsx` | GARDER (interne) |
| `/admin/usage` | `pages/AdminUsageDashboard.tsx` (1019 l.) | GARDER — suit DÉJÀ coûts IA **et WhatsApp** (`whatsapp_cost_eur/usd`) = le compteur de coût par élève du §1.7 |
| `/admin/production-log` | `pages/AdminProductionLog.tsx` (864 l.) | GARDER |

### Routes coach KEEL — ADAPTER (7, socle des 4 écrans)

| Route | Composant | Verdict |
|---|---|---|
| `/` | `keel/pages/LandingPage.tsx` (484 l.) | ADAPTER — déjà écrite POUR LE COACH, EN ANGLAIS, avec une section doctrine. Réécrire pitch : présence quotidienne WhatsApp + pricing par élève actif |
| `/coach` | `keel/pages/CoachHomePage.tsx` (413 l.) | ADAPTER → **écran 3 Cohorte**. Remplacer `invited/active/paused/ended` par actif/glisse/silencieux |
| `/coach/import` | `keel/pages/PlanImportPage.tsx` (1436 l.) | ADAPTER → **écran 1 Protocole**. LE pipeline « brut → IA → validation humaine ». À adapter : structurer PAR SEMAINE |
| `/coach/templates` | `keel/pages/TemplatesPage.tsx` (1005 l.) | ADAPTER — bibliothèque `plan_templates` (template coach, élève = clone+diff). Fusionner avec Protocole ou 2ᵉ onglet |
| `/coach/billing` | `keel/pages/CoachBillingPage.tsx` (553 l.) | ADAPTER — ledger de sièges existe ; recâbler sur « actif = ≥1 interaction/mois » (§1.7) |
| `/join` | `keel/pages/JoinPage.tsx` (453 l.) | SUPPRIMER-APRÈS-CUTOVER — l'élève n'a plus de compte web ; opt-in = message WhatsApp. Garder en référence du flux invitation par token |
| `/keel/import` | redirect → `/coach/import` | SUPPRIMER (redirect legacy) |

### Élève web + reliquat B2C — SUPPRIMER-APRÈS-CUTOVER (13)

| Route | Composant | Verdict / motif |
|---|---|---|
| `/coach/clients/:id` | `keel/pages/CoachStudentPage.tsx` | ADAPTER partiel — lecture d'UN élève utile, mais remplacer `WeekView` par « historique WhatsApp + état ». GARDER le log d'accès (`log_coach_student_access`) |
| `/coach/clients/:studentId/meals` | `keel/pages/MealPlanPage.tsx` | SUPPRIMER — composition de menus, hors des 4 écrans |
| `/app/today` | `keel/pages/TodayPage.tsx` (1068 l.) | SUPPRIMER — élève = zéro interface (§1.2) |
| `/app/progress` | `keel/pages/ProgressPage.tsx` | SUPPRIMER — + streaks explicitement bannis (§1.3) |
| `/app/cards` | `keel/pages/CardsPage.tsx` (647 l.) | SUPPRIMER — cartes bannies (§1.3) |
| `/app/meals` | `keel/pages/mealPlan/StudentMealPlanPage.tsx` | SUPPRIMER |
| `/dashboard` | `pages/DashboardV2.tsx` (1716 l.) | SUPPRIMER — dashboard élève B2C |
| `/onboarding-v2` | `pages/OnboardingV2.tsx` (**3697 l.**) | SUPPRIMER — onboarding web B2C, plus gros fichier du repo |
| `/chat` | `pages/ChatPage.tsx` + `ChatInterface` | ADAPTER → candidat **écran 4 Mode test** (sinon supprimer) |
| `/le-plan` | `pages/ProductPlan.tsx` | SUPPRIMER — page produit B2C FR |
| `/upgrade` | `pages/UpgradePlan.tsx` (548 l.) | SUPPRIMER — formules B2C, remplacées par `/coach/billing` |
| `/installer-app` | `pages/InstallAppGuide.tsx` | SUPPRIMER — guide PWA élève |
| `/dev/plan-saved-modal` | preview DEV de `PlanSavedModal` | SUPPRIMER avec le modal (ou garder si le deep-link wa.me est réutilisé) |

> ⚠️ **Aucune route catch-all `*`** : après suppression, toute URL legacy rend un écran
> blanc. Ajouter une 404 AVANT de démonter des routes (tâche de cutover).

## A.2 Pages (30) — verdicts détaillés

### `src/pages/` (15)
GARDER : `Auth.tsx` (nettoyer), `ResetPassword`, `EmailVerified`, `Legal` (réécrire),
`AdminDashboard`, `AdminUsageDashboard` (clé §1.7), `AdminProductionLog`.
ADAPTER : `Account.tsx`, `ChatPage.tsx` (54 l. — chat web + **simulateur WhatsApp** derrière
`VITE_ENABLE_WHATSAPP_WEB_SIM`).
SUPPRIMER : `LandingPage.tsx` (573 l., DÉJÀ morte — 0 import), `ProductPlan`, `UpgradePlan`,
`InstallAppGuide`, `DashboardV2` (1716 l.), `OnboardingV2` (3697 l.).

### `src/keel/pages/` (15)
ADAPTER : `PlanImportPage` (1436), `TemplatesPage` (1005), `CoachHomePage` (413),
`CoachBillingPage` (553), `CoachStudentPage` (359, partiel), `LandingPage` (484).
SUPPRIMER-APRÈS-CUTOVER : `JoinPage` (453), `MealPlanPage` (301), `TodayPage` (1068),
`ProgressPage` (393), `CardsPage` (647), `mealPlan/StudentMealPlanPage` (209),
`mealPlan/MealWeekGrid` (187), `mealPlan/MealIdeaLibrary` (255),
`mealPlan/WeekCoveragePanel` (142). (+ `mealPlan/copy.ts`, `coachBilling.int.test.ts`)

## A.3 Groupes de composants (10)

| Groupe | Verdict |
|---|---|
| `keel/components/ui/` (5 : Badge, Button, Card, Field, Page) | ✅ GARDER — LE design system du produit coach. Tailwind pur, zéro lib |
| `keel/components/` (11) | MIXTE : GARDER `KeelAppShell`, `CoachRoute`, `CommitmentEditor` (976 l.), `InviteDialog`, `PublicHeader`, `KeelBadges` ; SUPPRIMER `AttackCards` (1317 l.), `DeviationDialog`, `KeelStudentRoute`, `WeekView` (641 l.), `CommitmentLine` (surfaces élève) |
| `components/ui/` (Toast) | ✅ GARDER — seul système de notification global (monté racine) |
| `components/account/` (DataPrivacySection, DeletionPendingScreen) | ✅ GARDER — obligation légale, indépendante du pivot |
| `components/admin/` (AdminShell) | ✅ GARDER |
| `components/` racine (7) | MIXTE : GARDER `ErrorBoundary`, `SEO` ; `ChatInterface` → mode test ; `UserProfile` (48 Ko) → casser en deux (compte vs abonnement B2C) ; SUPPRIMER `Footer` (FR B2C), `YinYangLoader`, `FrameworkHistoryModal` (mort) |
| `components/shared/` (ProfessionalSupportCard) | SUPPRIMER — mais rebâtir l'équivalent nutrition (safety TCA) |
| `components/dashboard-v2/` (17) | SUPPRIMER-APRÈS-CUTOVER — SAUF `PlanSavedModal.tsx` (85 l., deep-link wa.me réutilisable) |
| `components/onboarding-v2/` (9) | SUPPRIMER-APRÈS-CUTOVER — 3 fichiers = patterns de référence (voir A.4) |
| `components/dashboard/` (WeekCard, mort) | SUPPRIMER |

**Fichiers déjà morts (0 import — suppression sans risque)** : `pages/LandingPage.tsx`,
`components/dashboard/WeekCard.tsx`, `components/FrameworkHistoryModal.tsx`,
`components/onboarding-v2/{AspectValidation,RoadmapTransition,ProgressiveLoader}.tsx`,
tout `src/data/` (24 fichiers), `src/config/modules-registry.ts`, `src/types/grimoire.ts`.

## A.4 Socle UI coach — briques réutilisables (chemins exacts)

### Écran 1 — PROTOCOLE
| Brique | Chemin | Usage |
|---|---|---|
| Pipeline paste/upload → IA → validation | `keel/pages/PlanImportPage.tsx` | LA base : textarea + upload PDF/image base64 (l.818-826) → `plan-import-v1` → 3 files (`needs_review`/`gaps`/`ready`) ; `approveSection()` + **invalidation d'approbation à l'édition** (`voidApprovals`) = règle d'autorité §1.5 déjà codée. À adapter : regrouper PAR SEMAINE |
| Éditeur de ligne de protocole | `keel/components/CommitmentEditor.tsx` | Exports réutilisables : `blankCommitment()`, `validateDraft()` (miroir client des CHECK SQL), `toServerCommitment()`, `callPlanTemplate<T>()`, `loadVocabulary()` (vocabulaires servis par le serveur, zéro slug en dur), `reviewSafety()` + `<SafetyNote>` (debounce 400 ms) |
| Mise en forme du protocole | `keel/api/planStructure.ts` (507 l.) | `buildPlanStructure()` — forme unique partagée import+templates ; point d'extension « par semaine » |
| Labels fail-loud | `keel/api/labels.ts` (723 l.) | `commitmentSentence()`, `gapQuestion()`, `slotLabel()`, `foodGroupLabel()`… — lève sur token inconnu |
| Fenêtre temporelle | `keel/api/todayModel.ts` → `planWindowUntilNextSession()` + `keel/api/dates.ts` | « prochaine séance » ↔ `(anchor_week_start, duration_weeks)` en date locale |
| Patterns alternatifs (morts, référence UX) | `components/onboarding-v2/AspectValidation.tsx` (drag&drop de regroupement), `TransformationFocusStep.tsx` (accepter/éditer/supprimer léger) | référence si regroupement manuel voulu |

### Écran 2 — DOCTRINE / COPILOT
> **N'existe pas** (grep doctrine : uniquement du copy de landing). À CRÉER sur :
> `KeelAppShell` (variante coach) · `ui/Field` (+`inputClass`) · `ui/{Card,Button,Badge}` ·
> `ui/Page` (largeur `wide` pour éditeur 2 panneaux) · pattern sauvegarde debouncée
> (`PlanImportPage` l.780-805, `CustomQuestionnaire` 350 ms) · `Toast` pour confirmations.

### Écran 3 — COHORTE
| Brique | Chemin | Usage |
|---|---|---|
| Liste élèves + états + compteurs | `keel/pages/CoachHomePage.tsx` | `LoadState` fail-loud, `countActiveSeats()`, double lecture `coach_clients` + **`coach_student_directory` (vue Tier B — la réponse au problème PostgREST-par-rôle)**. Re-mapper les statuts |
| Pastilles | `keel/components/ui/Badge.tsx` (5 tons) | une pastille par état |
| Ajout d'élève | `keel/components/InviteDialog.tsx` (178 l.) | POST `coach-invite-student-v1` — convertir email → **collage de numéros de téléphone** |
| Fiche élève + trace | `keel/pages/CoachStudentPage.tsx` | garder le pattern `log_coach_student_access` AVANT lecture + panneau de refus RLS ; remplacer `WeekView` par l'historique WhatsApp |

### Écran 4 — MODE TEST
| Brique | Chemin | Usage |
|---|---|---|
| Simulateur WhatsApp navigateur | `pages/ChatPage.tsx` + `components/ChatInterface.tsx` + `hooks/useChat.ts` | flag `VITE_ENABLE_WHATSAPP_WEB_SIM`, `channel:'whatsapp'`, `sendWhatsAppSimButton()`, `triggerWhatsAppSimEvent()` — le seul chemin web → agent existant |
| Deep-link WhatsApp pré-rempli | `components/dashboard-v2/PlanSavedModal.tsx` (85 l.) | si le mode test se fait sur le VRAI WhatsApp du coach |

### Auth & garde (transverse)
`keel/components/CoachRoute.tsx` (150 l., vérifie une ligne `coaches` ACTIVE en base) ✅ tel
quel · `context/AuthProvider.tsx` (317 l.) + `AuthContext` ✅ (connaît déjà les tiers
coach/student) · `lib/entitlements.ts` ✅ ADAPTER (recaler sur les paliers §1.7) ·
`security/RouteGuards.tsx` MIXTE (garder `RequireUser`/`RequireAdmin` ; supprimer
`RequireAppAccess`, `RequirePrelaunchGate`, `RequireArchitecte`) · `security/prelaunch.ts` ✅
(utile pilotes) · `keel/api/postLogin.ts` ✅ (simplifier : plus de branche élève) ·
`keel/components/KeelStudentRoute.tsx` SUPPRIMER.

### Design system & fondations
`keel/components/ui/` (5 primitives) ✅ · `KeelAppShell` (garder variante coach) ·
`PublicHeader`/`PublicFooter` (lang=en) ✅ · **i18n fail-loud** `keel/i18n/en.ts` (1140 l.) +
`t.ts` ✅ (purger les clés `app.*`, `cards.*`, `meal.*`) · `Toast` ✅ · `ErrorBoundary` ✅ ·
`SEO` ✅ · `index.css` ADAPTER (purger ~200 l. d'animations B2C : `sophia-action-skin`,
`--action-green`…) · `lib/supabase.ts` ✅ · `lib/requestId.ts` ✅ (corrélation front↔edge↔admin) ·
`lib/localization.ts` ADAPTER (défauts fr-FR/Paris → EN/multi-fuseaux).

## A.5 lib/, hooks/, context/, annexes — verdicts

**lib/ GARDER** : `supabase`, `requestId`, `entitlements` (adapter), `localization` (adapter),
`isoWeek` (synthèse hebdo).
**lib/ SUPPRIMER** : `referral`, `onboardingV2` (846 l.), `onboardingBackNavigation`,
`multiPartTransitionQuestionnaire`, `transformationClosure`, `dashboardTransformations`,
`planSchedule` (376 l. — remplacé par `keel/api/dates`), `planItemTiming`, `planPhases`,
`baseDeVie` (235 l.), `labScope`, `actionCardsPreview`, `exportDefenseCard`,
`clarificationExercises`, `toolRecommendations`, `professionalSupport` (329 l. — ⚠️ rebâtir
l'équivalent nutrition/TCA), `ethicalValidation` (ÉVALUER — garde-fou éditorial réutilisable
pour la doctrine).
**hooks/** : ADAPTER `useChat` (226 l., mode test) ; SUPPRIMER `useAppInstall`,
`useDashboardV2Data` (439), `useDashboardV2Logic` (720), `useDefenseCard` (493),
`useLabCards` (338), `useOnboardingAmbientAudio`.
**context/** : GARDER `AuthContext`, `AuthProvider` ; SUPPRIMER
`OnboardingAmbientAudioContext` (⚠️ retirer le wrapper dans `App.tsx:60` + `public/audio/`).
**keel/api/** : GARDER/ADAPTER `dates`, `labels`, `planStructure`, `postLogin`,
`coachInvite`, `keelClient`, `types`, `index` ; SUPPRIMER `todayModel` (615), `weekModel`
(480), `progressModel`, `cards`, `mealPlanModel` ; ⚠️ `mealPhoto.ts` (155 l.) = référence
upload photo via edge function, à conserver.
**Autres** : `src/data/` (24, mort) SUPPRIMER · `src/types/v2.ts` SUPPRIMER ·
`security/rls-negative.int.test.ts` GARDER/ADAPTER · `src/edge/` (5 tests d'intégration)
GARDER/ADAPTER (`coverage-guard`, `whatsapp` structurants) · `e2e/` (3 Playwright) ADAPTER ·
`public/audio/` SUPPRIMER · `index.html` lang fr→en.

## A.6 Points d'attention de cutover (frontend)

1. **Ajouter une route 404 catch-all AVANT tout démontage** (aucune n'existe).
2. `OnboardingAmbientAudioProvider` enveloppe TOUTE l'app (`App.tsx:60`).
3. `pages/Auth.tsx` est LE point de couture legacy↔KEEL (importe déjà `keel/api/postLogin` et
   `coachInvite`) — à traiter en premier.
4. L'actif le plus précieux : le trio `PlanImportPage` + `CommitmentEditor` + `planStructure`
   (~2 900 l.) — « l'IA transcrit, n'écrit jamais », 3 files de triage, invalidation
   d'approbation, vocabulaires serveur.
5. Les 2 seuls écrans manquants : **Doctrine** (rien) et **Mode test** (briques existantes à câbler).

---
---

# ANNEXE B — INVENTAIRE BASE DE DONNÉES EXHAUSTIF (vérifié table par table)

**Source** : `supabase/migrations/20260522143735_squashed_schema.sql` (11 906 l.) + 47
migrations postérieures. **Totaux** : 87 tables (squash) + 41 (migrations) = **128 tables
`public`**, **5 vues**, **~147 fonctions SQL** (86 + 61).

## B.0 Découverte structurante — le mapping cible §3.6 ↔ existant KEEL

| Cible PLAN-NUIT §3.6 | Existe déjà sous le nom | Statut |
|---|---|---|
| `coaches` | `public.coaches` | ✅ identique |
| `programs`+`program_weeks` | `plan_templates` (+ `plan_versions.phase_plan` jsonb) | ✅ à aligner par semaine |
| `students` (identité = n° WhatsApp) | `coach_clients` (identité = `auth.users.id`) | ⚠️ **conflit d'identité — décision P0.0** |
| `meal_entries` | `protocol_events` (source photo/text, `recognized`, `evidence_weight`) | ✅ à étendre au contrat §3.5 |
| `coach_doctrines` (versionnées) | **absent** | ❌ à créer |
| `cohorts` | **absent** (`coach_clients` plat) | ❌ à créer |
| `student_protocol_state` | ≈ `plan_versions` + `commitment_evaluations` | ⚠️ partiel |
| `recurring_meals` | ≈ `meal_ideas` (côté COACH, pas élève) | ⚠️ à créer côté élève |
| `student_memory` | `memory_items` + `student_safety_constraints` (allergies) | ✅ réutilisable |
| `coach_syntheses` | **absent** (`weekly_reviews` est côté élève) | ❌ à créer |
| `activity_ledger` (actif + coût WA) | `coach_billing_periods` + `whatsapp_cost_events` + `keel_student_interaction_count()` | ✅ quasi complet |
| Tenancy par VUES | `coach_student_directory`, `coach_student_events`, `coached_student_ids()` | ✅ **déjà en production** |

> ⚠️ **Blocage n°1 du pivot** : toutes les tables KEEL rattachent l'élève à `auth.users(id)`
> NOT NULL CASCADE (`plan_versions.student_id`, `protocol_events.user_id`,
> `commitment_evaluations.user_id`, `student_cards.user_id`, `meal_plan_entries.student_id`,
> `coach_clients.student_user_id`…). Options : table `students` autonome (migrer ~15 FK) OU
> `auth.users` fantôme par numéro (recommandé §3.6).

## B.1 GARDER — infra/moteur (48 tables)

**Conversation & moteur de tour** : `chat_messages` (journal web+WhatsApp, 7 policies),
`user_chat_states` (état machine par scope, `temp_memory` jsonb porte les flows),
`conversation_scope_memories` (compaction), `conversation_turn_traces` (trace d'un tour :
`safety_pregate`, `dispatcher_run`, `route_decision`), `conversation_runtime_events`
(+ vue audit), `turn_summary_logs` (TTL 7 j), `system_error_logs`.

**LLM/coûts/rate limit** : `llm_usage_events` (ledger coût par appel),
`llm_pricing` (grille par modèle), `llm_raw_response_events` (**VIDE aujourd'hui — P3 la
branche**), `llm_retry_jobs` (service-role only, `claim_llm_retry_jobs()`),
`rate_limit_counters` (RPC `enforce_rate_limit`), `whatsapp_cost_events`
(**coût WA par message — directement le §1.7**).

**Infra WhatsApp** : `whatsapp_outbound_messages` (file+retries+caps),
`whatsapp_outbound_status_events` (callbacks Meta), `whatsapp_inbound_dedup` (`wamid_in`
unique), `whatsapp_unlinked_inbound_messages` (numéro inconnu — edge case §5),
`whatsapp_pending_actions` (actions différées), `whatsapp_monthly_quotas`,
`whatsapp_optin_recovery`, `scheduled_checkins` (**cœur du proactif** : `scheduled_for`,
`origin` CHECK 9 valeurs, `recurring_reminder_id`), `scheduled_checkins_delete_audit`,
`proactive_job_state` (idempotence/jour), `communication_logs`, `reengagement_episodes`
(**épisodes de relance après inactivité — littéralement la boucle REMARQUER §1.3**).

**Mémoire (17 tables — adapter au domaine, garder la machinerie)** : `memory_items`
(`embedding vector(768)`, `sensitivity_level`, `superseded_by_item_id`),
`memory_item_sources/_topics/_entities/_actions/_action_occurrences`, `memory_change_log`,
`memory_extraction_runs`, `memory_message_processing`, `memory_weekly_review_runs`,
`memory_observability_events`, `memory_eval_annotations`, `user_entities`,
`user_topic_memories`, `user_topic_keywords`, `user_profile_facts`,
`user_relation_preferences` (**`preferred_tone`, `max_proactive_intensity` = la posture
§1.5**). Note : `memory_item_actions.plan_item_id` = uuid SANS FK → aucun blocage spine.

**Observabilité/éval/plomberie** : `internal_admins`, `app_config`,
`conversation_eval_runs/_events/_judge_jobs`, `confirmation_tokens_consumed`,
`deletion_records`, `account_security_confirmations`, `stripe_webhook_events`,
`crisis_resources` (par pays — safety §5), `substances`, `substance_limits`,
`substance_interactions`, `student_safety_constraints` (**allergies — double verrou §3.4**),
`slot_vocabulary`, `food_groups`.

## B.2 ADAPTER (12 tables)

| Table | Modification |
|---|---|
| `profiles` (87 col.) | GARDER `phone_number`, `timezone`, `locale`, `whatsapp_opted_in/_state/_optout_*`, `phone_verified_at`, `country`, `display_unit_system`, `keel_role`. RETIRER `whatsapp_bilan_*` (5), `install_app_*` (3), `onboarding_completed`… `access_tier` CHECK B2C → rôles coach/élève. ⚠️ `profiles.id → auth.users` CASCADE = concerné par la décision identité. Colonnes billing sous trigger de protection. |
| `subscriptions` | B2C par user → B2B par coach ; `tier` CHECK à remplacer par les paliers §1.7 |
| `subscription_notifications` | Idempotence (`dedup_key` PK) — réutilisable côté coach |
| `coach_billing_periods` | Déjà B2B (`active_seat_count`, `stripe_seat_item_id`). Manque la définition « actif = ≥1 interaction/mois » — `keel_student_interaction_count()` existe |
| `user_recurring_reminders` | Moteur solide ; 4 FK spine toutes NULLABLE/SET NULL → dénouables. Retirer `source_potion_session_id` |
| `system_runtime_snapshots` | `cycle_id`/`transformation_id` nullables SET NULL → dénouables ; `snapshot_type` CHECK : 38 valeurs toutes B2C → réécrire |
| `scheduled_checkins` | `origin` CHECK à réécrire (`meal_checkin`/`decrochage`/`bilan_hebdo`) |
| `whatsapp_link_requests/_tokens` | Remplacés par `coach_invitations` (existante : `invite_token_hash`, `preview/accept_coach_invitation()`) |
| `plan_versions`/`plan_commitments`/`protocol_events` | Cible fonctionnelle, mais `student_id`/`user_id` NOT NULL → auth.users (décision P0.0) |
| `coach_clients` | Ajouter `cohort_id` |
| `plan_templates`/`plan_documents` | `coach_id` SANS FK (TODO explicites en migration) — dette à fermer |
| `user_framework_entries` | `plan_id` uuid sans FK — schéma générique, contenu B2C |

## B.3 TRANSFORMER (16 tables : le concept survit, le schéma change)

`user_plans_v2`→`plan_versions` · `user_plan_items`→`plan_commitments` ·
`user_plan_item_entries`→`protocol_events`+`commitment_evaluations` ·
`user_habit_week_plans/_occurrences`→`commitment_evaluations` (grains week/occasion) ·
`user_habit_week_reschedule_events`→`planned_deviations` ·
`user_defense_cards`/`user_attack_cards`→`card_templates`+`student_cards` ·
`user_defense_wins`→`card_wins` · `user_plan_review_requests`→`contract_change_requests`
(**règle §1.5 : `suggested_option` = brouillon, jamais appliqué**) ·
`user_metrics`→`weekly_reviews.outcomes` · `user_victory_ledger`→`card_wins`/`weekly_reviews` ·
`weekly_bilan_suggestion_events`→`weekly_reviews` · `user_rendez_vous`→`scheduled_checkins`
(**garder `budget_class` silent/light/notable — le budget de sollicitation**) ·
`user_core_identity(+_archive)`→`student_memory`/doctrine ·
`user_cycle_drafts`→pipeline intake coach (**le « brut → IA → validation » à réutiliser**).

## B.4 SUPPRIMER-APRÈS-CUTOVER — le spine B2C (26 tables)

**Colonne vertébrale** : `user_cycles` (racine ; `active_transformation_id` FK SANS ON
DELETE), `user_transformations` (`cycle_id` NOT NULL CASCADE),
`user_transformation_aspects`, `user_transformation_closure_feedback`, `user_plans_v2`
(FK composite), `user_plan_items`, `user_plan_item_entries` (4 colonnes spine NOT NULL),
`user_habit_week_plans/_occurrences/_reschedule_events` (4 colonnes spine chacune),
`user_plan_level_reviews`, `user_plan_level_generation_events`, `user_plan_review_requests`,
`user_metrics`, `user_victory_ledger`, `user_rendez_vous`, `user_inspiration_items`,
`user_support_cards`, `user_attack_cards`/`user_defense_cards`/`user_defense_wins`
(**cycle FK mutuel avec `user_plan_items`**), `user_potion_sessions`,
`user_level_tool_recommendations/_events`,
`user_professional_support_recommendations/_events` (⚠️ extraire la logique d'orientation
médicale AVANT suppression), `weekly_bilan_suggestion_events`.

**Déjà débranchés (triggers droppés par `20260727150000`)** : `user_week_states`,
`user_module_state_entries`, `user_module_archives` — supprimables immédiatement.
**Architecte** : `user_architect_{quotes,reflections,stories,wishes}` — aucune FK spine,
supprimables (8 fonctions de validation/normalisation à dropper avec).
**Referral B2C** : `referral_codes`/`referrals`/`referral_rewards` — sans objet en B2B ;
⚠️ `20260708160000` REDÉFINIT `handle_new_user()` : réécrire avant de supprimer.
**Onboarding web** : `user_cycle_drafts` (sauf recyclage intake coach).

## B.5 VUES (5)

`cost_fact_events` (∪ LLM + WhatsApp billable — **cœur du coût/élève**, GARDER) ·
`cost_fact_events_enriched` (GARDER) · `conversation_runtime_audit_events` (GARDER) ·
`coach_student_directory` (**CIBLE tenancy**, `security_invoker=off`) ·
`coach_student_events` (**« l'adhérence, pas le journal intime » déjà implémenté** : expose
`has_media`, masque `student_note`/`media_path`/`source_message_id`).

## B.6 FONCTIONS SQL/RPC notables

**GARDER (moteur)** : `enforce_rate_limit()`, `claim_whatsapp_outbound_retries()`,
`claim_llm_retry_jobs()`, `claim_conversation_eval_judge_jobs()`, `enqueue_llm_retry_job()`
(version watchdog `20260708113000`), `consume/release_whatsapp_monthly_quota()`,
`mark_proactive_job_sent()/_batch()`, `log_conversation_event()`, `log_turn_summary_log()`,
`match_core_identity_by_embedding()` (repointer sur `memory_items`),
`has_app_write_access()`, `is_verified_phone_in_use()`, `transfer_verified_phone_to_user()`,
`sync_phone_verified_on_whatsapp_optin()` (**unicité du numéro — « élève de DEUX coachs
interdit v1 » §5**), `purge_auth_user()`, RPC export RGPD, les `get_admin_*` (dashboard admin).

**CIBLE KEEL (déjà écrites)** : `coached_student_ids()` (SECURITY DEFINER),
`revoke_coach_access()`, `accept_coach_invitation()/_for_user()`,
`preview_coach_invitation()`, `coach_invite_token_hash()`, `log_coach_student_access()`,
`keel_coach_seat_ledger()`, `keel_my_seat_ledger()`, `keel_my_billing_summary()`,
`keel_active_student_threshold()`, `keel_coach_is_solvent()`,
`keel_student_interaction_count()`, `keel_recompute_seat_access_tiers()`,
`keel_seed_evaluations()`, `keel_sweep_day_evaluations()`,
`keel_invalidate_inflight_evaluations()`, `keel_cancel_inflight_checkins()`,
`keel_render_card()`, `keel_meal_plan_entry_touch()`.

**ADAPTER** : `handle_new_user()` (⚠️ réécrite 3× — repartir de `20260727200000`),
`recompute_profile_access_tier()` et famille (réécrites `20260727235000` — tier = siège
coach), `handle_new_profile_welcome_email()`, `queue_whatsapp_access_ended_notification()`,
`whatsapp_scheduling_access_eligible()`, `cleanup_whatsapp_scheduling_for_user()`.

**SUPPRIMER-APRÈS-CUTOVER** : `unlock_transformation_principle()`,
`guard_v2_plan_item_activation()`, `handle_forge_level_progression()`,
`initialize_user_modules()`, `handle_core_identity_trigger()`,
`handle_user_architect_*` (×3) + `normalize_architect_*` (×4) + `architect_*_are_valid` (×4),
`seed_default_coach_preferences()`, `request_onboarding_week1_validation_*`,
`request_lifecycle_recovery_on_tier_upgrade()`, `apply_referral_attribution()`,
`claim_referral_reward()`, `get_or_create_referral_code()`, etc. (liste complète §B.4).

## B.7 RLS

RLS activé sur 100 % des tables. **Service-role only (zéro policy, 11 tables)** :
`app_config`, `conversation_eval_judge_jobs`, `llm_retry_jobs`, `proactive_job_state`,
`stripe_webhook_events`, `user_cycle_drafts`, `whatsapp_link_requests/_tokens`,
`whatsapp_monthly_quotas`, `whatsapp_outbound_status_events`,
`whatsapp_unlinked_inbound_messages`. **Doctrine KEEL** (`20260727090000` l.706-740) :
élève = SELECT only, service_role fait toutes les écritures ; le coach n'a AUCUNE policy
directe — il passe par les vues + `coached_student_ids()`. **La tenancy cible est déjà la
doctrine en production.**

## B.8 CONTRAINTES DE DÉMOLITION (l'ordre fait loi)

**A. Les 2 FK sans ON DELETE (bloquantes en dur)** :
`user_cycles.(id,active_transformation_id) → user_transformations(cycle_id,id)` (l.7963) et
`user_defense_cards.transformation_id → user_transformations(id)` (l.7983). À
`DROP CONSTRAINT` en premier.

**B. Les 2 cycles de FK** : `user_cycles ⇄ user_transformations` ;
`user_plan_items ⇄ user_{defense,attack}_cards` (4 FK SET NULL). À casser avant tout DROP.

**C. Les 5 FK COMPOSITES** (`user_plan_items`, `user_plan_item_entries`,
`user_habit_week_plans/_occurrences/_reschedule_events` → toutes CASCADE vers le haut,
+ `user_plans_v2`/`user_metrics` → `user_transformations(cycle_id,id)`) : **impossible de
`DROP COLUMN transformation_id` sur `user_plan_items` sans dropper d'abord les 4 FK
composites enfants.** C'est la raison technique du « jamais cette nuit ».

**D. NOT NULL spine** : `cycle_id` NOT NULL sur 22 tables · `transformation_id` sur 14 ·
`plan_id` sur 11 · `plan_item_id` sur 4 (listes exhaustives vérifiées).

**E. Dénouable SANS DROP (nullable/SET NULL — nettoyage phase 1)** :
`system_runtime_snapshots.{cycle_id,transformation_id}`,
`user_recurring_reminders.{cycle_id,transformation_id,target_plan_item_id,source_potion_session_id}`,
et ~15 autres colonnes listées (aucune FK : `memory_item_actions.plan_item_id`,
`user_framework_entries.plan_id`).

**F. ORDRE DE DÉMOLITION VALIDÉ (feuilles → racine)** :
```
0. DROP les 2 FK sans ON DELETE + casser les 2 cycles (4 FK cartes↔items)
1. user_habit_week_reschedule_events
2. user_habit_week_occurrences, user_habit_week_plans
3. user_plan_item_entries
4. user_defense_wins → user_defense_cards ; user_attack_cards
5. user_level_tool_recommendation_events → user_level_tool_recommendations
6. user_professional_support_events → user_professional_support_recommendations
7. user_plan_level_generation_events → user_plan_level_reviews
8. user_plan_review_requests, user_transformation_closure_feedback
9. user_victory_ledger, user_metrics, user_inspiration_items, user_support_cards,
   user_potion_sessions, user_rendez_vous
10. user_plan_items → user_plans_v2 (FK composite)
11. user_transformation_aspects
12. user_transformations
13. user_cycles
14. Nettoyage colonnes résiduelles (E)
```
Groupes indépendants du spine, supprimables tout de suite : modules/semaines identitaires,
architecte, `weekly_bilan_suggestion_events`, `user_core_identity(+_archive)`, referral
(⚠️ `handle_new_user()` d'abord).

**Références** : squash `20260522143735` (tables l.584-6053, FK l.7648-8577) ; socle KEEL :
`20260727090000` (790 l.), `20260727120000` (tenancy, 531 l.), `20260727235000` (billing,
870 l.), `20260727230000` (cards, 1037 l.), `20260728120000` (meal scaffolding) ;
débranchement : `20260727150000`.

---
---

# ANNEXE C — INVENTAIRE EDGE FUNCTIONS EXHAUSTIF (65 fonctions + _shared + 26 crons)

**Répartition : GARDER 27 · ADAPTER 15 · DÉBRANCHER 5 · SUPPRIMER-APRÈS-CUTOVER 18 = 65.**
Constat structurant : la couche KEEL (`docs/keel/BUILD_PLAN.md` = l'autorité) est déjà un
produit coach→élève nutrition. Les deux blocages photo du §3.5 originel sont DÉJÀ levés
(`wa_parse.ts` propage `media_id` ; `_shared/vision.ts` = client multimodal séparé).

## C.1 GARDER (27)

| Fonction | Rôle | Justification |
|---|---|---|
| `whatsapp-send` | Envoi sortant (Graph, templates, tracking, gardes) | Moteur outbound §6.4 ; seule la garde de tier changera |
| `process-whatsapp-outbound-retries` | Worker retries sortants | Fiabilité de livraison |
| `process-llm-retry-jobs` | Worker retry LLM | Edge case « timeout LLM, jamais de silence » §5 |
| `whatsapp-sim-inbound` | Simulateur d'entrant → routeur brain | Pivot du protocole de test §7.1 |
| `test-send-message` | Appel direct du routeur hors WhatsApp | Harnais multi-tours §7.2 |
| `plan-import-v1` | Dump coach → commitments typés + verbatim + confiance + gaps | **L'écran Protocole §1.4 déjà codé** |
| `plan-template-v1` | CRUD des templates coach | Modèle « template, élève = clone+diff » §3.6 |
| `plan-publish-v1` | Publication à UN élève, tenancy service-role | Règle d'autorité §1.5 |
| `coach-signup-v1` | User authentifié → `coaches` | Porte d'entrée du seul compte restant |
| `provision-day-v1` | Ouvre/clôt la journée élève depuis le plan | Ancrage quotidien du protocole |
| `evaluate-adherence-v1` | → `commitment_evaluations` | Le chiffre d'adhérence de la synthèse |
| `keel-week-rollover-v1` | Avance de semaine nocturne | Sans lui la semaine casse en silence |
| `keel-meal-plan-v1` | Le coach compose les repas — aucun modèle appelé | Déjà conforme §1.5 |
| `trigger-memorizer-daily` | Consolidation mémoire nocturne | §3.4 le cite nommément |
| `trigger-topic-compaction` | Compaction (correction + nocturne) | Gouvernance mémoire §3.4 |
| `promote-candidate-memory-items` | Promotion des items candidats | Épisodique → sémantique |
| `trigger-memory-v2-alerts` | Alertes ops mémoire | Observabilité P3 |
| `get-memory-trace` / `get-memory-scorecard` | Trace + scorecard mémoire | Debug/éval |
| `get-momentum-trace` / `get-momentum-scorecard` | Trace + scorecard momentum | Le momentum pilote ton/cadence §1.5 |
| `stripe-reconcile-seats` | Sièges = élèves ACTIFS (`ACTIVE_STUDENT_MIN_INTERACTIONS`) | **Le pricing §1.7 déjà codé** |
| `stripe-create-portal-session` | Portail Stripe | Neutre |
| `purge-deleted-accounts` | Purge J+7 RGPD (buckets `meal-photos` inclus) | Légal |
| `account-deletion-v1` / `account-restore-v1` | Suppression/restauration self-service | Comptes coach ; l'élève passera par STOP |
| `notify-profile-change` | Email sécurité compte | Hors périmètre pivot |

## C.2 ADAPTER (15)

| Fonction | Modifs |
|---|---|
| `whatsapp-webhook` | GARDER dédup/STOP/parse média ; REMPLACER le routage sémantique par le dispatcher §3.1 (retirer `isDonePhrase`, `extractAfterDonePhrase`, `e164ToFrenchLocal` = regex de sens) |
| `sophia-brain` (330 fichiers, 17 sous-dossiers) | Cœur conservé ; dispatcher nutrition, flows locaux + escape hatch, garde TCA, retrait surfaces transformations/cartes |
| `analyze-meal-photo-v1` | Étendre au contrat §3.5 (l'actuel INTERDIT kcal/macros — arbitrage P0.0bis) |
| `process-checkins` | Moteur de la boucle REMARQUER ; retirer les touches winback B2C, rebrancher sur inactivité élève + momentum |
| `schedule-whatsapp-v2-checkins` | Réduire aux moments nutrition (contextes `action_*` legacy) |
| `whatsapp-optin` | UN message « Bienvenue dans le programme de [Coach] » ; retirer le tier B2C |
| `coach-invite-student-v1` | Email+token → **numéros WhatsApp collés** ; garder « pas de coach_clients avant acceptation » |
| `whatsapp-sim-trigger` | Remplacer les événements B2C par photo/relance/bilan/mode-test |
| `stripe-webhook` | Garder signature+idempotence ; retirer tiers B2C + parrainage |
| `stripe-create-checkout-session` | Supprimer la forme legacy ; garder le contrat coach ; recaler paliers §1.7 |
| `stripe-sync-subscription` | Tier B2C → contrat coach |
| `account-export-v1` | Repointer les allowlists sur meal/protocole/mémoire |
| `trigger-synthesizer-batch` | `scope` legacy → élève/coach |
| `get-coaching-intervention-trace` / `-scorecard` | Taxonomie → postures §1.5 |

## C.3 DÉBRANCHER (5)

`meal-photo-upload-v1` (chemin WEB de la photo — l'élève n'a pas d'interface ; seul le
chemin WhatsApp reste) · `keel-cards-v1` (cartes hors périmètre v1 — couper cron
`keel-arm-cards`) · `trigger-watcher-batch` (ancré cartes/transformations) ·
`classify-recurring-reminder` (couper `reseed-recurring-reminders` — LLM sur du legacy) ·
`ethical-text-validator` (entités B2C ; le principe survit dans le double verrou §3.3).

## C.4 SUPPRIMER-APRÈS-CUTOVER (18)

`generate-plan-v2` · `generate-questionnaire-v2` · `cycle-draft` ·
`draft-transformation-from-text-v1` · `intake-to-transformations-v2` (⚠️ miner les prompts
de `v2-intake-structuring.ts` avant) · `classify-plan-type-v1` · `review-plan-v1` ·
`activate-plan-item-v2` · `advance-phase-v2` · `draft-defense-card-v1` ·
`generate-defense-card-v3` · `update-defense-card-v3` (couper les routes frontend d'abord) ·
`generate-attack-card-v1` · `generate-attack-technique-v1` ·
`analyze-attack-technique-adjustment-v1` · `send-welcome-email` · `trigger-retention-emails`
(⚠️ couper le cron CETTE NUIT — envoie de vrais emails) · `process-whatsapp-optin-recovery`
(⚠️ couper le cron CETTE NUIT).

## C.5 `_shared/` — verdicts par module

**GARDER (infra)** : `cors.ts`, `http.ts`, `error-log.ts`, `rate-limit.ts`,
`internal-auth.ts`, `request_context.ts`, `common-validators.ts` · `gemini.ts`
(**texte-seul, ne pas y toucher** — ~286 sites) · `vision.ts` (**multimodal, étage 1 photo**) ·
`llm.ts`, `retry429.ts`, `llm-usage.ts`, `llm-raw-trace.ts` (**la brique du P3
observabilité**), `guard-log.ts`, `brain-trace.ts` · `whatsapp_graph.ts` (contient
`fetchWhatsAppMedia`) · `whatsapp_outbound_tracking.ts`, `whatsapp_templates.ts`,
`delivery.ts`, `message_freshness.ts` · `scheduled_checkins.ts`,
`proactive_checkin_timing.ts`, `proactive_template_queue.ts` · `time_of_day.ts`,
`user_time_context.ts`, `locale.ts` · `momentum_v2.ts`, `momentum-observability.ts` ·
`reengagement_episodes.ts`, `reengagement_extraction.ts` (**la boucle REMARQUER
instrumentée**) · tout `memory/` (runtime, memorizer, compaction, correction, prompts —
**la machinerie §3.4**) · `keel/` : `tokens.ts`, `evaluator.ts`, `adherence.ts`,
`day_targets.ts`, `provision_day.ts`, `relations.ts`, `render.ts`, `slot_reminders.ts`,
`locale.ts`, `labels.en.ts`, `prompts/plan_import.en.ts` ·
**`keel/safety_constraints.ts` + `keel/crisis_resources.ts`** (le double verrou allergies
§3.4 déjà écrit) · **`keel/restriction_guard.ts` + `restriction_runtime.ts`** (le garde-fou
TCA §3.4 déjà écrit — l'étendre, pas le réécrire) · `pgvector.ts`, `resend.ts`, `stripe.ts`,
`account_lifecycle.ts` · `v2-week-activation.ts` (dépendance de `keel-week-rollover-v1`
malgré le préfixe) · `v2-constants.ts`, `v2-events.ts`.

**ADAPTER** : `keel/meal_analysis.ts` (lever l'interdit kcal → fourchettes, arbitrage
P0.0bis) · `billing-tier.ts` (garder sièges/actifs, retirer tiers B2C) ·
`whatsapp_winback.ts` (squelette de la relance 48-72h : changer seuils/textes,
zéro-culpabilisation) · `subscription-notification.ts`, `access_ended_whatsapp.ts` ·
`daily_action_review.ts` + `daily_action_review/` (**la meilleure référence de flow local
du repo — réutiliser l'architecture reducer/effects pour `meal_photo`/`bilan_soir`**) ·
`weekly_review/` (squelette bilan hebdo + synthèse coach ; **retirer `plan_patch.ts`** —
§1.5) · `v2-intake-structuring.ts` (fusionner avec `keel/prompts/plan_import.en.ts`) ·
`v2-memory-retrieval.ts` (**écrase tout en un chemin — contredit §3.4 « récupérations
différentes par type »**) · `identity-manager.ts` · `action_occurrences.ts` (migrer vers
`keel/day_targets.ts`) · `off_schedule_credit.ts` (utile pour « répond aux textes sans
photo = actif » §5).

**DÉBRANCHER** : `checkin_scope.ts` (unique importeur = watcher) · `birthday_checkins.ts`
(hors des 3 boucles, budget WA §1.7) · `coaching_parent_bridge.ts`,
`local_child_flow_handoff.ts` (remplacés par l'escape hatch §3.2) ·
`v2-daily-bilan-decider.ts`, `v2-rendez-vous.ts`, `v2-cooldown-registry.ts`,
`v2-outreach-helpers.ts`, `v2-momentum-helpers.ts`, `v2-active-load.ts` (relire les règles
de cooldown/charge avant réécriture) · `weekly_adaptive_review.ts` + `_opening.ts`,
`weekly_progress_review.ts`, `week_plan_lifecycle.ts`, `week_day_distribution.ts` ·
`referral-reward.ts`.

**SUPPRIMER-APRÈS-CUTOVER** : `v2-types.ts`, `v2-runtime.ts` (**23 importeurs — LA colonne
vertébrale, jamais cette nuit**), `v2-phase1.ts`, `v2-plan-distribution.ts`,
`v2-intake-core.ts`, `v2-intake-unified.ts` · `v2-transformation-focus.ts`,
`v2-transformation-materialization.ts`, `v2-calibration-fields.ts`,
`v2-unlock-principles.ts`, `v2-weekly-bilan-engine.ts` (0 importeur), `v2-lab-context.ts` ·
`v2-defense-card-enrichment.ts`, `attack_keyword.ts`, `attack-keyword-support.ts` ·
`v2-prompts/` (⚠️ SAUVER AVANT : `structuration.ts` — pipeline intake §1.4 — et
`conversation-pulse.ts` — le pouls nourrit le DST §3.3bis) · `weeksContent.ts` ·
`memory/dashboard_routes.ts` · les ~60 `*_test.ts` des modules legacy (**ne pas les
supprimer avant leurs modules — filet du strangler**).

## C.6 pg_cron — 26 jobs (autorité : `20260615133000` + 11 migrations postérieures)

**GARDER (15)** : `process-whatsapp-outbound-retries` (`* * * * *`) ·
`process-llm-retry-jobs` (`*/2`) · `keel-provision-day` (`0 * * * *`) · `keel-sweep-day`
(`55 * * * *`) · `keel-evaluate-adherence` (`45 * * * *` — corps corrigé W7.5) ·
`keel-week-rollover-v1` (`10 0`) · `trigger-memorizer-daily` (`0 0`) ·
`memory-v2-topic-compaction-corrections` (`* * * * *`) · `memory-v2-topic-compaction-nightly`
(`17 3`) · `promote-candidate-memory-items` (`40 3`) · `purge-deleted-accounts` (`20 4`) ·
`purge-expired-rate-limit-counters` (`7 * * * *`) · `cleanup-turn-summary-event-stream`
(`15 3`) · `keel-reconcile-seats-monthly` (`20 3 1 * *`) · `keel-seat-entitlement-sweep`
(`35 2` — sans ce balayage un contrat expiré resterait servi).

**ADAPTER (4)** : `process-checkins` (`*/3` — repivoter les touches) ·
`schedule-whatsapp-v2-checkins` (`0 * * * *` — réduire aux moments nutrition) ·
`trigger-synthesizer-batch` (`*/10` — scope) · `recompute-time-based-access-tiers` (`15 3` —
tier temporel B2C → contrat coach).

**DÉBRANCHER CETTE NUIT (5)** : `trigger-watcher-batch` (`0 */4`) ·
`reseed-recurring-reminders` (`0 18 * * 0` — 1 génération LLM par rappel sur la flotte) ·
`keel-arm-cards` (`20 * * * *`) · **`trigger-retention-emails` (`0 9` — envoie de VRAIS
emails B2C)** · **`process-whatsapp-optin-recovery` (`0 10` — winback B2C)**.

**Déjà désactivés (2)** : `trigger-level-review-transitions-v1`,
`cleanup-architect-draft-scopes` (unschedulés par `20260727150000`).

## C.7 Trois points d'attention

1. **Ne pas réécrire l'existant** : `plan-import/template/publish-v1` couvrent l'écran
   Protocole ; `safety_constraints.ts` + `restriction_guard.ts` couvrent allergies + TCA.
2. **Les blocages photo §3.5 sont levés** — vérifier avant de coder.
3. **La seule vraie divergence de contrat** : l'interdit kcal/macros de `meal_analysis.ts`
   vs le contrat cible — arbitrage P0.0bis, AVANT toute ligne de code photo.

Chemins d'entrée : `supabase/functions/`, `supabase/functions/_shared/`,
`supabase/migrations/20260615133000_recreate_active_pg_cron_jobs.sql`,
**`docs/keel/` (BUILD_PLAN.md, CONTRACT.md, SCHEMA.md — l'autorité de la couche KEEL)**.
