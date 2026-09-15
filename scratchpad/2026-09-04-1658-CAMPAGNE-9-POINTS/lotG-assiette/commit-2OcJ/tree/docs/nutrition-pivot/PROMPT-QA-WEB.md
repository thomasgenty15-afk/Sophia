# MISSION QA — la version web de KEEL, en profondeur

> Prompt d'exécution autonome. Tu es un agent de QA sur le repo `Sophia 2`,
> branche `dewhatsapp`. Tu ne livres pas du code neuf : tu **éprouves** ce qui
> existe, tu **prouves** chaque verdict, et tu corriges ce que tu casses en
> chemin. Tu ne t'arrêtes pas tant que les 10 lots ne sont pas passés ou que
> chaque blocage restant n'est documenté avec un contournement tenté.

---

## 0. CE QUE TU TESTES, ET POURQUOI ÇA COMPTE

KEEL est un compagnon nutrition quotidien en 1:N. Un **coach** (nutrition,
épigénétique, biohacking — 50 à 500 élèves) écrit un programme et une
**doctrine** ; Sophia fait vivre ce programme auprès de ses élèves, chaque jour.
L'élève envoie des photos de repas, reçoit un tap du soir, discute ; le coach
voit sa cohorte et reçoit une synthèse le lundi.

**Le produit vient de changer de canal.** Il vivait sur WhatsApp Business API ;
il vit désormais dans une **bulle de chat in-app** (React 19 + Vite,
`frontend/`). Zéro fonction WhatsApp ne subsiste. Cette bascule est récente,
elle a été faite en une nuit, et **elle n'a jamais été éprouvée en largeur** :
c'est ta mission.

Ce qui rend cette QA différente d'une passe de tests : **le produit n'est pas
une application qu'on ouvre, c'est une conversation qui commence toute seule.**
Un écran qui s'affiche ne prouve rien. Ce qui compte est ce que la BASE porte
après le tour, et ce que l'élève A RÉELLEMENT REÇU.

Autorité documentaire, dans cet ordre :
`docs/keel/` (CONTRACT.md, SCHEMA.md, BUILD_PLAN.md) → `docs/nutrition-pivot/STATUS-DEWHATSAPP.md`
→ `docs/nutrition-pivot/PLAN-NUIT.md` (avec son encadré d'amendements en tête,
qui fait autorité sur le corps du texte).

---

## 1. LA MÉTHODE — le gantelet, version QA

Aucun verdict n'est rendu sur ce qu'affiche un écran. Chaque test franchit
**cinq épreuves**, dans cet ordre :

1. **L'épreuve du geste** — tu joues le parcours pour de vrai (navigateur pour
   l'UI, HTTP pour les fonctions, `psql` pour les crons). Pas de simulation
   mentale, pas de lecture de code tenant lieu d'exécution.
2. **L'épreuve de la base** — tu vérifies en SQL ce que le geste a écrit.
   « L'écran dit que c'est pris en compte » n'est pas un verdict ; `select` en
   est un. Cette épreuve a déjà attrapé le pire défaut de la nuit précédente
   (« c'est noté » sans ligne).
3. **L'épreuve adversariale** — pour chaque fonctionnalité, au minimum ces
   7 patterns : (a) **prémisse fausse** (l'état attendu n'existe pas : élève
   sans plan, coach sans élève, semaine sans donnée) ; (b) **concurrence**
   (deux requêtes simultanées, deux onglets) ; (c) **rejeu** (le même message
   deux fois) ; (d) **langue** (FR **et** EN — le test FR est déjà passé une
   fois par accident de grammaire) ; (e) **temps** (minuit, fuseaux, « demain »
   à 23h50, changement de semaine) ; (f) **état vide/null** (pas de doctrine,
   pas d'historique, `country` null) ; (g) **désalignement config↔code** (env
   var absente, valeur par défaut silencieuse).
4. **L'épreuve du contre-factuel** — quand tu conclus « ça marche », montre le
   cas où ça ne marcherait pas et vérifie qu'il échoue bien. Une garde qu'on n'a
   pas vue mordre est une garde qu'on croit sur parole.
5. **L'épreuve de relecture** — en fin de mission, deux passes à froid. La
   seconde cherche spécifiquement ce que la première a laissé passer.

**Verdict par test : VERT / AMBER / RED.** AMBER = ça marche mais quelque chose
te gêne (une formulation, une latence, un état vide moche). Pas de
« quasi-vert ». Un test que tu n'as pas joué est **NON TESTÉ**, jamais VERT.

**Sévérité des défauts** : `P0` = perte ou corruption de donnée, sécurité,
tenancy, safety, ou l'élève ne reçoit rien. `P1` = fonctionnalité cassée avec
contournement. `P2` = friction, formulation, esthétique.

---

## 2. RÈGLES D'ENGAGEMENT

1. **Branche** : travaille sur `dewhatsapp`. Premier geste : `git status`, et
   commit snapshot du WIP s'il y en a. Un commit par lot terminé.
2. **INTERDIT ABSOLU** (hook bloquant) : `supabase functions deploy`,
   `supabase db push`, `supabase secrets set/unset`, tout écrit sur le projet
   distant. Le LOCAL est autorisé, `supabase db reset` compris.
3. **Tu répares ce que tu trouves**, sauf si le correctif dépasse 30 minutes ou
   touche l'architecture — dans ce cas tu documentes et tu continues. Tout
   correctif est accompagné du test qui échouait avant lui.
4. **Journal** : `docs/nutrition-pivot/QA-WEB-JOURNAL.md`, append-only,
   horodaté. Une entrée par test : geste joué, preuve SQL/HTTP, verdict.
   Les preuves brutes (sorties SQL, JSON, captures) vont dans
   `docs/nutrition-pivot/qa-web/`.
5. **Livrable final** : `docs/nutrition-pivot/QA-WEB-REPORT.md` — verdict par
   lot, défauts classés par sévérité avec reproduction en 3 lignes, ce que tu
   as corrigé, et ce que la QA locale **ne peut pas** prouver.
6. **Règle des 30 minutes** : jamais bloqué plus longtemps sur le même mur.
   Documente, tente UN contournement, passe au suivant, reviens-y.
7. **Honnêteté** : un doute est un flag, jamais un vert optimiste. Si tu
   n'as pas pu jouer un parcours, écris **NON TESTÉ** et pourquoi.

---

## 3. L'ENVIRONNEMENT

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="$(npx supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
export SUPABASE_ANON_KEY="$(npx supabase status -o json | jq -r .ANON_KEY)"
export INTERNAL_FUNCTION_SECRET="$(grep -E '^INTERNAL_FUNCTION_SECRET=' supabase/.env | cut -d= -f2-)"
```

Front : `preview_start` (jamais `npm run dev` via Bash). SQL :
`docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "..."`.
Élève de test jetable : `deno run --allow-all scripts/dev_make_chat_student.ts`
(rend une ligne `localStorage.setItem(...)` à coller dans la console).

**Les suites qui doivent rester vertes de bout en bout :**

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
deno test --allow-all supabase/functions/meal-photo-upload-v1/ supabase/functions/chat-inbound-v1/
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

### Pièges connus de la stack locale — lis-les AVANT de conclure à un bug

- **Kong rend des 502 sans corps** sur les tours longs. Pas de trace = tour non
  fini, pas forcément défaut produit. Retente une fois avec le MÊME identifiant
  client avant de conclure.
- **`EMAIL_DELIVERY_ENABLED=1` traîne en local** : override obligatoire, sinon
  ta QA envoie de vrais emails.
- **`functions.invoke` n'envoie pas `x-internal-secret`** : les appels internes
  entre fonctions passent l'en-tête explicitement, sinon 403.
- **`auth.admin.createUser` échoue par intermittence** (la stack utilise les
  nouvelles clés `sb_secret_…`). Repli : `signUp` anon + `update profiles` en
  service_role, comme le fait `chat_seam_int_test.ts`.
- **Les crons acceptent une horloge simulée** dans le corps :
  `-d '{"now":"2026-08-04T18:30:00.000Z","limit":500}'`. L'horloge simulée doit
  rester **≥ l'heure réelle**, et il faut nettoyer `pending_actions` entre deux
  runs, sinon un run parasite l'autre.
- **Ne lance jamais deux runs QA en parallèle sur la même base** : un run purge
  ce que l'autre attend et produit des faux rouges.
- **101 tests d'intégration B2C sont ROUGES et l'étaient avant** (tables legacy
  droppées). Ne les compte pas comme ta régression ; vérifie-le en stashant.

---

## 4. LES 10 LOTS

Chaque lot se termine par une entrée de journal avec son verdict.

> **Un sous-lot conditionnel : L3-bis** (le repas déclaré en texte et la question
> de précision). Il porte sur le chantier `PROMPT-MEAL-PRECISION.md`, qui doit
> être passé AVANT cette QA. S'il n'a pas atterri, marque L3-bis **NON
> APPLICABLE** et continue — ne le construis pas.
>
> **Deux lignes rouges traversent cette QA**, et un manquement à l'une ou
> l'autre est un P0 quelle que soit son apparence :
> 1. **aucune question posée à l'élève ne demande une quantité** (L3-bis, L4) ;
> 2. **un repas mangé une fois ne produit jamais deux faits** (L3-bis, L4).

### L1 — ONBOARDING COACH, de zéro à un élève invité

`coach-signup-v1` → `/coach` → `/coach/doctrine` → `/coach/import` ou
`/coach/templates` → `plan-publish-v1` → `coach-invite-student-v1`.

À prouver : le coach crée son compte et atterrit au bon endroit
(`resolveHomePath`) ; il écrit sa doctrine et elle **arrive dans le prompt**
(pas seulement en base — vérifie qu'un tour d'élève la porte) ; il importe ou
compose un protocole ; il publie ; il invite un élève et **l'invitation part**
(regarde la ligne `coach_invitations` ET l'email en local via Inbucket).
Adversarial : coach sans doctrine, doctrine vide, protocole sans ligne, invit
d'un email déjà élève d'un AUTRE coach, deux invitations au même email.

### L2 — ENTRÉE ÉLÈVE, du lien à la première phrase

`/join?token=…` → `preview_coach_invitation` → signUp **ou** accept →
`accept_coach_invitation` (pose `keel_role='student'`) → `/app/chat`.

À prouver : le parcours complet **au navigateur**, pour un élève neuf ET pour un
élève déjà connecté ; `keel_role` posé ; l'atterrissage se fait bien dans le
chat (changement récent) ; l'état vide du chat dit quoi faire.
Adversarial : token invalide, expiré, déjà consommé, rejoué sur un second
appareil, `/join` sans token, élève qui abandonne au milieu et revient,
confirmation d'email (Inbucket) et son `emailRedirectTo`.
**Vérifie `profiles.country`** : s'il est null, la résolution de crise part sur
le mauvais pays — c'est un P0 connu dont seule la capture manque.

### L3 — LA CONVERSATION, en largeur

C'est le cœur. `chat-inbound-v1` → `sophia-brain` → `chat_messages` → Realtime.

Joue **au moins 12 conversations distinctes**, en anglais ET en français :
1. salutation banale, premier contact ;
2. déclaration d'un repas en texte (« I had eggs and rice for lunch ») ;
3. question sur le protocole (« what am I supposed to eat tonight ? ») ;
4. question hors-protocole que le coach n'a pas couverte (jeûne, supplément) ;
5. question qui contredit la doctrine du coach — le verrou doit se comporter ;
6. déclaration d'allergie (« I'm allergic to peanuts, badly ») ;
7. écart assumé (« j'ai craqué sur une pizza ») ;
8. demande de récap (« what did I actually eat this week ? ») ;
9. message ambigu de 3 mots (« bof », « ça va ») ;
10. message très long, multi-sujets ;
11. deux messages envoyés coup sur coup sans attendre la réponse ;
12. message de détresse (voir L8).

Pour chacun : la réponse arrive-t-elle **sans rechargement** (Realtime) ; est-elle
**grounded** (aucune invention de contenu alimentaire — un CHECK SQL l'interdit
sur `student_week_plans`, vérifie qu'il tient) ; les effets durables écrits
correspondent-ils au texte rendu (`protocol_events`, `planned_deviations`,
`student_safety_constraints`) ; l'historique survit-il au reload ; la pagination
« load earlier » fonctionne-t-elle.
Adversarial : deux onglets ouverts (double livraison Realtime), Realtime coupé
(le refetch à la resubscription doit rattraper), rejeu du même
`client_message_id`, message pendant qu'une réponse est en cours, message d'un
élève dont le compte est en suppression.

#### L3-bis — LE REPAS DÉCLARÉ EN TEXTE, ET LA QUESTION DE PRÉCISION

> **Conditionnel.** Ce sous-lot porte sur le chantier décrit par
> `docs/nutrition-pivot/PROMPT-MEAL-PRECISION.md`. Commence par vérifier s'il a
> atterri (`docs/nutrition-pivot/STATUS-MEAL-PRECISION.md` existe, et le module
> d'évaluation de complétude est appelé quelque part). **S'il n'est pas là,
> écris NON APPLICABLE et passe** — ne le construis pas, ce n'est pas ta mission.

Le chemin : « j'ai mangé du poulet » → `log_protocol_event` écrit le fait → une
question de précision part si un axe matériel manque → la réponse de l'élève
complète le fait.

À prouver :
- **Une déclaration pauvre déclenche une question.** « J'ai mangé du poulet »,
  « j'ai pris une salade », « un sandwich ». La question porte sur un axe
  autorisé : accompagnement, préparation, composition, créneau.
- **Une déclaration complète n'en déclenche AUCUNE.** « Poulet grillé, riz
  complet et brocolis à midi » doit passer en silence. C'est le contre-factuel,
  et il compte autant que le cas positif : un système qui questionne toujours
  est un système qu'on cesse de lire.
- **Une déclaration qui se suffit n'en déclenche aucune non plus** : « une
  pomme », « un verre d'eau ».
- **La réponse ne crée pas un repas en double.** LE test du lot :
  `select count(*) from protocol_events where user_id=… and local_date=…` avant
  et après la réponse. Un composant réellement ajouté (« avec du riz ») peut
  légitimement créer une ligne pour le riz ; le poulet, lui, ne doit jamais
  apparaître deux fois. Vérifie les deux moitiés.
- **Une correction amende** (« non, c'était de la dinde ») sans seconde ligne,
  et `recognized.amendments` porte les mots de l'élève.

🔴 **LA LIGNE ROUGE, et c'est le test le plus important de ce sous-lot :**
> **aucune question ne doit jamais demander une quantité.**

« Tu en as mangé combien ? », « c'était une grosse portion ? », « combien de
grammes ? » sont interdites par le contrat (non-input #4). Joue au moins six
déclarations pauvres différentes et **lis chaque question rendue** ; une seule
question quantitative est un **P0**, pas un P2. Cherche aussi les formes
détournées : « c'était copieux ? », « tu as bien mangé ? ».

Adversarial : intention future (« je vais manger du poulet ») — aucune écriture
et **aucune question** ; bande de safety non nulle — le flow ne s'ouvre pas ;
l'élève ignore la question et parle d'autre chose — le flow sort proprement et
son message suivant est traité normalement ; l'élève répond 40 minutes plus tard
— le timeout a fermé, rien n'est amendé par erreur ; deux déclarations coup sur
coup ; FR et EN.

### L4 — LA PHOTO DE REPAS

`meal-photo-upload-v1` → `analyze-meal-photo-v1` → `protocol_events` → bulle.

À prouver : upload depuis la bulle ET depuis `/app/today` ; l'analyse écrit
`recognized`, `food_group_ref`, `portion_band`, `disqualified_reason`,
`analyzed_at` ; l'accusé ne porte **jamais** de calorie ni de macro ni de
pourcentage ; le crédit annoncé correspond à la colonne.

**Les trois protections neuves — éprouve-les avec de VRAIES images** (pas des
PNG 1×1) :
- **filtre de sujet** : une assiette (doit compter), un menu de restaurant, une
  capture d'écran d'app de livraison, un rayon de supermarché, un selfie, un
  paysage, une étiquette nutritionnelle, une photo trop sombre. Vérifie
  `subject_kind` dans `recognized` ET `disqualified_reason` sur la colonne, et
  que les trois refus donnent trois phrases distinctes. **Rejoue deux fois la
  même image** : le verdict doit être stable (l'instabilité entre deux runs est
  le défaut d'origine).
- **dédup exacte** : la même photo renvoyée le même jour → un seul fait, réponse
  « I already have that photo ». Deux photos différentes → deux faits.
- **flow de correction** : photo, puis « non c'était du poulet » → la ligne est
  **amendée** (`recognized.amendments`), le crédit machine tombe, et
  `select count(*) from protocol_events` reste à 1. Puis les désarmements :
  changement de sujet, 30 minutes écoulées, tour de crise, message incompris.

**La question de clarification sur la photo** (elle existe depuis le contrat v3,
sa réponse est câblée depuis peu) :
- une assiette qui **cache quelque chose de significatif** — un poulet luisant
  (huile ?), une salade probablement assaisonnée, un plat en sauce — doit
  déclencher **une** question, et une seule ;
- une assiette qui ne cache rien — une pomme entière, des œufs pochés nature —
  ne doit en déclencher **aucune** ;
- la réponse de l'élève (« oui, à l'huile d'olive ») **amende** la ligne :
  `recognized.amendments` la porte, et le nombre de `protocol_events` ne bouge
  pas ;
- 🔴 **même ligne rouge qu'en L3-bis** : la question ne demande jamais une
  quantité. Relis chaque question rendue.

Si le chantier `PROMPT-MEAL-PRECISION.md` a atterri, vérifie en plus que
**photo et texte partagent le MÊME plafond quotidien** : déclare deux repas
pauvres en texte puis envoie une photo douteuse le même jour — la troisième
question ne doit pas partir. Deux compteurs séparés donneraient quatre questions
par jour à un élève assidu, ce qui est exactement le comportement qui fait
décrocher.

Adversarial : non-image déguisée, fichier > 8 Mo, upload sans plan publié,
deux uploads simultanés, photo pendant une crise safety, photo d'un élève dont
le plan vient d'être archivé.

### L5 — LES BOUCLES PROACTIVES

`keel-daily-pulse-v1` (tap du soir), `keel-reengage-v1` (décrochage),
`keel-weekly-flow-v1` (point hebdo), `coach-synthesis-v1` (lundi),
`provision-day-v1`, `keel-week-rollover-v1`, `process-checkins`,
`schedule-checkins-v2`.

À prouver, pour CHACUN : le job tourne, **il envoie réellement**
(`sent: N` non nul), le message arrive dans la bulle **d'un onglet ouvert**
sans rechargement, la question armée fonctionne (boutons + réponse libre
classée), et l'état est écrit (`student_daily_checkins`, `reengagement_episodes`,
`coach_syntheses.delivered_at`).
**Le piège à revérifier en priorité** : les trois décideurs lisaient
`profiles.whatsapp_opted_in`, faux par défaut, ce qui rendait **tout élève
KEEL muet** (`scanned: 108, sent: 0`). Ils lisent maintenant
`proactive_muted_at`. Vérifie qu'aucun autre décideur ne lit encore une colonne
gelée : `grep -rn "whatsapp_opted" supabase/functions supabase/migrations`.
Adversarial : élève muté (les proactifs s'arrêtent, la conversation directe
marche toujours) ; plafond quotidien respecté sous fan-out ; fuseau (un élève à
Los Angeles reçoit son tap à SON soir) ; élève sans plan actif ; double tick du
même cron ; `delivered_at` qui doit se remplir.

### L6 — LES ÉCRANS COACH ET LES STATISTIQUES

`/coach` (cohorte, sièges, invitations), `/coach/weekly` (l'écran du lundi),
`/coach/clients/:id`, `/coach/clients/:id/meals`, `/coach/templates`,
`/coach/doctrine`, `/coach/billing`, `/coach/import`.

À prouver : **chaque chiffre affiché est recalculable en SQL.** Prends la fiche
d'un élève dont tu connais l'historique (tu viens de le fabriquer) et
recalcule : jours actifs, nombre de photos, distribution des portions,
adhérence, risque de décrochage. Un écart = P0, parce que c'est ce que le coach
paie.
**Vérifie en particulier que les photos disqualifiées ne comptent pas** (filtre
neuf) et qu'un élève actif n'apparaît pas en « 0 of 7 days » (défaut P0-5 du
rapport AGENT-16 — à revérifier).
Tenancy : un coach ne voit QUE ses élèves. Prouve-le en SQL avec deux coachs et
un élève chacun, en interrogeant les vues (`coach_student_directory`,
`coach_student_events`) sous l'identité de chacun. Vérifie que
`log_coach_student_access` écrit bien avant chaque lecture de fiche.
États vides : coach sans élève, élève sans donnée, semaine sans activité — aucun
écran ne doit tomber ni afficher `NaN`.

### L7 — PROTOCOLES, PLANS, SEMAINES

`plan-import-v1`, `plan-template-v1`, `plan-publish-v1`,
`generate-week-plan-v1`, `keel-meal-plan-v1`, `generate-meal-v1`,
`meal-document-v1`, `/app/plan`, `/app/meals`, `/app/progress`, `/app/cards`.

À prouver : import d'un document réel de coach ; l'élève compose sa semaine à
partir des recommandations (le coach ne prescrit pas en 1:N) ; le plan est
**visible à la conversation** (défaut connu : `student_week_plans` sans lecteur
côté brain — revérifie) ; `/app/progress` affiche des chiffres justes ;
la bascule de semaine (`keel-week-rollover-v1`) ne perd rien.
Adversarial : import d'un PDF illisible, protocole avec une ligne contradictoire,
semaine à cheval sur un changement de mois, élève qui ne compose jamais sa
semaine.

### L8 — SAFETY, DOCTRINE, INTERDITS

À prouver, et **rien ici ne se juge sur le texte affiché** :
- **crise** : un message de détresse déclenche la bande, la hotline est celle du
  **pays du profil** (pas un défaut US), **zéro effet durable** n'est écrit
  pendant le tour, et le flow se **quitte** quand l'élève dit que ça va (le
  faux positif collant est une cicatrice connue).
- **allergie** : « I'm allergic to peanuts » écrit une ligne dans
  `student_safety_constraints`. **C'est un P0 connu (AGENT-16 P0-3) : l'accusé
  partait sans la ligne, puis l'allergène était suggéré plus tard.** Vérifie les
  deux moitiés : l'écriture, ET qu'aucune suggestion ultérieure ne contient
  l'allergène (double verrou : prompt + écran déterministe post-génération).
- **doctrine** : le verrou ne doit pas détruire des réponses honnêtes.
  **P0-4 connu** : `keel.output_lock.doctrine` remplaçait le texte visible par
  une ligne hors sujet, y compris sur un récap parfaitement grounded. Rejoue les
  deux cas du rapport (question sur le jeûne intermittent ; « what did I eat this
  week ? ») et regarde `llm_raw_response_events` pour voir le texte détruit.
- **restriction (TCA)** : la garde s'arme, et elle lit les notes d'élève **même
  sur une photo disqualifiée** (c'est voulu).

### L9 — CYCLE DE VIE DU COMPTE, RGPD, FACTURATION

`account-deletion-v1`, `account-restore-v1`, `account-export-v1`,
`purge-deleted-accounts`, `stripe-*`, `/account`, `/upgrade`, `/legal`.

À prouver : suppression → désactivation immédiate → restauration en se
reconnectant → purge J+7 (joue le cron avec une horloge simulée) ; l'export
contient **les tables du pivot** (`protocol_events`, `chat_messages`,
`student_week_plans`, `coach_clients`… — le lifecycle RGPD a déjà oublié des
tables neuves une fois) ; aucune donnée personnelle ne survit à la purge ;
`coach_syntheses` ne garde pas le prénom d'un élève supprimé.
Facturation : `stripe-reconcile-seats`, sièges par élève actif, `entitlements`.
Adversarial : suppression pendant une conversation en cours ; élève supprimé qui
poste (401/410 propre, pas de tour fantôme) ; coach supprimé avec des élèves.

### L10 — TRANSVERSE

- **i18n** : le site est passé en anglais. Chasse les chaînes françaises
  résiduelles côté élève ET coach, et les clés brutes (`join.accepted.cta` qui
  s'afficherait telle quelle).
- **Responsive** : 375 px, 768 px, 1280 px sur `/app/chat`, `/coach`,
  `/coach/weekly`. Rien ne doit déborder horizontalement.
- **Erreurs** : console navigateur propre (`read_console_messages`), aucun 4xx/5xx
  inattendu (`read_network_requests`), `system_error_logs` vide de surprises.
- **Sécurité** : RLS — un élève ne lit que ses lignes ; `anon` n'a aucun
  privilège sur les tables du pivot (vérifie `has_table_privilege('anon', …)`,
  jamais `'public'`) ; aucune fuite de slug interne ni de prompt système dans un
  texte visible.
- **Performance perçue** : latence du premier tour, latence d'une photo,
  l'indicateur « Sophia écrit » couvre-t-il vraiment l'attente.

---

## 5. DÉFAUTS CONNUS À REVÉRIFIER EN PRIORITÉ

Ils viennent des rapports QA de la veille (`docs/nutrition-pivot/qa/`). Certains
ont pu être corrigés depuis, d'autres non — **ne présume ni l'un ni l'autre,
rejoue-les**.

| Réf | Défaut | Où |
|---|---|---|
| AGENT-16 P0-3 | Allergie accusée mais `student_safety_constraints` vide, puis allergène suggéré | L8 |
| AGENT-16 P0-4 | Le verrou de doctrine détruit des réponses honnêtes et répond à côté | L3, L8 |
| AGENT-16 P0-5 | Un élève actif apparaît « 0 of 7 days » dans la synthèse coach | L6 |
| AGENT-16 P0-2 | La relance de décrochage n'écrit jamais d'épisode (`no_active_plan`) | L5 |
| AGENT-10 | La doctrine ne gouverne qu'une route sur trois | L1, L3 |
| AGENT-6 | Le plan de l'élève est invisible à la conversation | L7 |
| AGENT-1 | Qualité conversationnelle & voix du coach | L3 |
| STATUS-DEWHATSAPP | `/join` bout en bout jamais joué, `country` non capturé, bulle coach en mode test absente | L2, L6 |
| STATUS-DEWHATSAPP | La publication `supabase_realtime` était vide : sans elle la bulle s'abonne et ne reçoit **jamais** rien | L3 |

`AGENT-16 P0-1` (fenêtre 24 h WhatsApp) est **caduc** : le canal n'existe plus.
Ne le rejoue pas, mais vérifie qu'aucune trace de la garde 24 h ne subsiste.

---

## 6. CE QUE TU NE FAIS PAS

- Pas de déploiement, pas de `db push`, pas de secret distant, pas de webhook Meta.
- Pas de refonte d'architecture : tu éprouves, tu répares petit, tu documentes grand.
- Pas de refonte du billing.
- Pas de suppression de test au prétexte qu'il échoue : un rouge se comprend
  avant de se retirer.
- Pas de conclusion tirée d'une lecture de code là où un geste était possible.

## 7. LIVRABLES

1. `docs/nutrition-pivot/QA-WEB-JOURNAL.md` — le journal horodaté, avec preuves.
2. `docs/nutrition-pivot/qa-web/` — sorties SQL, JSON, captures.
3. `docs/nutrition-pivot/QA-WEB-REPORT.md` — verdict par lot (VERT/AMBER/RED),
   défauts par sévérité avec **reproduction en 3 lignes**, correctifs appliqués
   avec le test qui échouait avant, et la liste explicite de ce qui est
   **NON TESTÉ** et pourquoi.
4. Les suites de la §3 vertes, sorties collées.
5. Une **checklist du matin** pour Thomas : ce qui doit être vérifié en prod
   après déploiement, et ce que la QA locale ne peut structurellement pas prouver
   (latence réelle, coûts réels, comportement d'un vrai téléphone).
