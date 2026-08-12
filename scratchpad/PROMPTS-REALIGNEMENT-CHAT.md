# Les 14 prompts de réalignement du chat

> **Mode d'emploi.** Un agent par fonctionnalité, chacun repart de zéro.
> Le prompt d'un agent = **LE SOCLE COMMUN** (ci-dessous, à coller en premier)
> **+ le bloc de sa fonctionnalité**. Ne donne jamais un bloc sans le socle.
>
> **Ordre recommandé** (les dépendances sont réelles) :
> FF-008 → FF-009 → FF-017 → FF-025 → FF-023 → FF-026 → FF-027 → FF-028 →
> FF-016 → FF-010 → FF-011 → FF-029 → FF-020 → FF-021.
> Le chantier de retrait des comportements
> (`scratchpad/PROMPT-RETRAIT-COMPORTEMENTS-CHAT.md`) passe APRÈS FF-008/FF-009
> (l'accueil d'abord) et AVANT FF-017 (qui en dépend pour son plafond).

---

# LE SOCLE COMMUN — à coller en tête de chaque prompt

Tu travailles sur **Sophia/KEEL**, dépôt `/Users/ahmedamara/Dev/Sophia 2` :
app de planification de repas pour foyers (Supabase + edge functions Deno +
React). Le chat (`sophia-brain`, entrée produit `chat-inbound-v1`) est la porte
par laquelle la réalité rentre dans le plan.

Sa direction — la règle mère, le circuit d'ensemble et les règles transverses
**T1 à T9** — est écrite dans `docs/fonctionnalites/conversation/README.md` :
**lis-le en premier**, puis la fiche de TA fonctionnalité (donnée dans ton
bloc). La règle mère : *on ne collecte une donnée que si quelque chose en aval
la consomme* — le plan, une ceinture de sécurité, ou le coach.

## Ta mission, en six étapes — dans cet ordre

1. **Vérifier l'existant.** Si la fonctionnalité existe : établis, preuves à
   l'appui (fichiers:lignes, tests existants, lignes en base), ce que le code
   FAIT réellement — pas ce que les commentaires disent. Si elle n'existe pas
   ou partiellement : construis-la, en suivant la fiche section par section.
2. **La conformité à l'image.** Compare le comportement réel à CHAQUE règle
   (§6), mode de défaillance (§7) et critère (§8) de la fiche. Chaque écart se
   consigne : ou tu alignes le code sur la fiche, ou — si le code a raison —
   tu proposes l'amendement de la fiche SANS l'appliquer (l'humain tranche).
3. **Tests en conditions réelles** — vrai modèle, vraie base locale, vrai
   élève provisionné — sur quatre niveaux :
   - **easy** : le cas nominal de la fiche ;
   - **medium** : les variantes (formulations, langues, données limites) ;
   - **hard** : les modes de défaillance de §7 ;
   - **extra-hard** : les combinaisons (deux fonctionnalités qui se croisent,
     concurrence, états sales) — ton bloc en donne, ajoutes-en.
4. **Revue adversariale.** Tu changes de casquette : cherche activement quand
   ça casse, ce qui produirait une incohérence visible, ce qui ferait paraître
   Sophia non humaine (redemander une info donnée, confabuler, se contredire),
   ce qui contournerait une garde. Ton bloc donne des angles ; trouves-en
   d'autres. Écris chaque hypothèse AVANT de la tester.
5. **Re-tests** : chaque hypothèse adversariale devient un test exécuté. Une
   hypothèse non testable se consigne comme telle avec sa raison.
6. **Le rapport** : `scratchpad/RAPPORT-FF-XXX.md` (ton numéro). Structure
   imposée : état initial constaté (avec preuves) · écarts fiche/code et ce qui
   a été fait · tableau des tests (niveau, scénario, verdict, PREUVE — ligne
   DB citée, `context_elements`, ou texte de réponse) · hypothèses
   adversariales et leur sort · ce qui reste ouvert · commandes pour l'humain.

## Les règles du dépôt — non négociables

1. **Jamais seul** : `supabase db push`, `db reset` (distant), `functions
   deploy`, `secrets set/unset`, `link`. Un hook les bloque. Donne la commande
   exacte à copier-coller, l'humain l'exécute. Lectures (SELECT) permises.
2. **La base locale est partagée** avec d'autres sessions. Jamais de `db
   reset`. Migrations : `docker exec supabase_db_Sophia_2 psql …` puis
   enregistrement de la version dans `supabase_migrations.schema_migrations`.
   Fixtures préfixées `ffXXX_` (ton numéro), nettoyées en fin de run.
3. **Tests Deno** avec l'environnement PURGÉ, sinon 114 faux rouges :
   ```
   env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
     deno test --allow-read --allow-env --no-check <cibles>
   ```
   (En revanche, les scripts qa-web reçoivent leurs variables INLINE, commande
   par commande — jamais exportées dans le shell.)
4. **Typecheck frontend** : `npx tsc -b` (le tsconfig racine ne vérifie rien).
5. **Code edge modifié → `docker restart supabase_edge_runtime_Sophia_2`.**
   Le runtime sert des modules `_shared` périmés sinon — un run réel sur du
   code non rechargé invalide tout ce que tu mesures.
6. **Un commit par étape cohérente**, message en français descriptif,
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Aucun push.
7. Rouges préexistants : prouvés antérieurs par `git stash -u`, listés au
   rapport. Jamais « réparés » en passant.

## La méthode de test réel — l'outillage existe, ne réinvente rien

- **Le harnais** : `docs/nutrition-pivot/qa-web/harness.ts` — `makeCoach`,
  `makeStudent`, `publishPlanFor`, `turn(student, "message")` (qui appelle
  `chat-inbound-v1` et relit `chat_messages`), `sql`, `cleanup`. Lancement :
  ```
  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
    deno run -A <ton_script>.ts
  ```
  Regarde `L3_conversation.ts`, `L4_meal_photo.ts` comme modèles.
- **Un vrai élève KEEL exige** : `keel_role='student'`, `timezone`, `country`,
  **`locale` écrite explicitement** (le défaut en base est `fr-FR` — une
  fixture qui l'omet ment sur la langue), `coach_clients` actif avec
  consentement, **un plan publié** (`plan_versions` published +
  `plan_commitments`) et `student_week_plans` adopted — sans plan publié, le
  dispatcher a consigne de n'émettre AUCUN effet et toute conclusion « ça ne
  marche pas » est fausse. Plafond : 3 élèves par coach.
- **La vérité est en base, jamais dans la réponse HTTP.** Une réponse « c'est
  noté » sans ligne relue est un accusé fantôme — le défaut le plus cher du
  dépôt. Chaque verdict cite sa ligne.
- **Rejoue chaque cas 3 fois.** Le dispatcher est stochastique (mesuré :
  `[0,3,3,0]` sur une phrase identique). 1 échec sur 3 est un RED, pas un
  flake.
- **Teste en français ET en anglais.** Cicatrice
  `guard-tested-in-one-language-only` : une garde FR passait par accident de
  grammaire, `not` ne couvrait pas `doesn't`, `\b` ne mord pas après « é ».
- **Kong rend des 502 sans corps sous charge** : lance
  `./scripts/local_extend_kong_functions_timeout.sh` avant un run long ; un
  502 se retente avec le MÊME `client_message_id`, deux 502 = infra, pas
  produit.
- **Observabilité.** ⚠️ **Corrigé le 2026-08-12, troisième puce fausse de ce
  fichier** : `turn_summary_logs.context_elements` est **TOUJOURS NULL** —
  l'écrivain qui la remplirait n'a aucun appelant. **Ne bâtis aucune preuve
  dessus** ; toute consigne (y compris dans ce socle) qui te dit de prouver la
  présence d'un bloc par `context_elements` te demande l'impossible. Ce qui
  marche vraiment : le **comportement observé en base**, les compteurs
  applicatifs (ex. `chat_inbound_history_loaded`), et `full_chars` pour les
  tailles. `conversation_turn_traces` porte le frame et la route. Les
  `console.log` du runtime edge **sont** lisibles dans
  `docker logs supabase_edge_runtime_Sophia_2` (mesuré) — un lot a rapporté
  l'inverse pour `console.info` : vérifie toi-même plutôt que de choisir entre
  les deux.
- **Un RED se consigne, il ne se re-run pas jusqu'au vert.** Des probes verts
  ont déjà caché un run réel rouge. Si un résultat te surprend, lis la ligne
  en base avant de conclure.

## Les pièges transverses déjà payés par ce dépôt

- **Un paramètre de garde optionnel est une garde désarmée** — les paramètres
  de garde sont requis.
- **`as` sur un type étranger désarme le typecheck** — pas de cast sur les
  retours de chargeurs.
- **Ce qui OUVRE un effet durable ne transite jamais par le LLM du
  dispatcher** — plancher déterministe avant le modèle, toujours.
- **Le prompt du compagnon tronque PAR LA QUEUE.** ⚠️ **Chiffres corrigés le
  2026-08-12** : la métrique est **`full_chars`**, plafond **32 000
  caractères** — et non « 8 000 tokens » / `context_tokens` comme cette puce
  l'a longtemps dit. Une valeur de `full_chars = 32 222` est une **signature de
  troncature**, pas une marge. Les blocs KEEL étant **préfixés**, la troncature
  par la queue mange la mémoire long terme. Toute matière ajoutée se mesure
  avant/après, et le bloc doctrine doit survivre.
- ⚠️ **CORRIGÉ LE 2026-08-08 — l'ancienne version de cette puce a menti à tous
  les agents pendant quatre jours.** Elle affirmait « le chat in-app n'a AUCUN
  historique », `history: []`, « c'est un fait établi », et concluait par
  « vérifie avant de déboguer chez toi » — c'est-à-dire qu'elle **ordonnait
  d'arrêter d'enquêter** sur un symptôme dont la cause était déjà réparée.
  **La vérité, vérifiée le 2026-08-12** : `chat-inbound-v1` charge un
  historique récent (`_shared/chat/recent_history.ts`, commit `1414face`,
  fenêtre de 20 messages) et le passe à `processMessage`.
  **Ce fichier est figé et ne se met pas à jour tout seul : ne prends aucune de
  ses puces pour vraie sans la vérifier en code.** Le prix de cette leçon est
  écrit ci-dessus.
- **`user_chat_states.temp_memory` a deux écrivains concurrents** (le tour
  texte et le chemin photo), en lecture-modification-écriture complète — le
  dernier gagne. Toute continuité qui s'y appuie regarde cette course en face.

---
---

# BLOC 1 · FF-016 — La question d'alimentation

**Fiche** : `docs/fonctionnalites/conversation/FF-016-la-question-d-alimentation.md`
**État présumé** : la substitution (Tier 0) est livrée et testée ; la réponse
générale sous doctrine est livrée ; **le manque mesuré** : les aliments
recommandés du protocole (`protocolFoodBlock`,
`_shared/keel/protocol_compiler.ts:757` — sections « reach for these first » /
« steers away ») n'ont que deux appelants, les deux générateurs de repas,
**zéro dans `sophia-brain`**. Le chat connaît les interdits, jamais les
encouragés.

**Étape 1-2 (vérifier / construire)** :
- Vérifie la lane swap : `sophia-brain/skills/plan_question/` — la parité
  Tier 0/évaluateur est pinnée par `plan_question_test.ts`, l'anti-promesse
  par `no_coach_reply_promise_test.ts`. Établis qu'ils passent.
- Construis le branchement des recommandés : un extrait **borné** du protocole
  compilé entre dans le contexte du tour d'un élève dont le coach a un
  protocole publié. Mesure `context_tokens` avant/après — le bloc doctrine
  survit à la troncature.

**Tests réels** :
- *easy* : « je peux remplacer les pommes de terre par du riz ? » sur une
  ligne à policy permissive → oui en 2 s ; sur `autonomy='strict'` → refus.
- *medium* : même chose en anglais ; « qu'est-ce que je devrais manger au
  petit-déj ? » avec un protocole qui met en avant les œufs → la réponse
  s'appuie dessus.
- *hard* : substitution vers un groupe médicalement contraint → veto dur avant
  tout ; élève sans protocole publié → la réponse le dit et répond en nom
  propre, jamais au nom du coach.
- *extra-hard* : protocole qui déconseille un aliment + doctrine qui
  l'interdit + question qui le propose (les trois couches se croisent) ; deux
  questions de suite (aucun état ne doit coller) ; substitution acceptée puis
  vérification que l'évaluateur du soir ne note pas `missed` (la parité EN
  CONDITIONS RÉELLES, pas seulement dans le test unitaire).

**Angles adversariaux** : la réponse générale qui *prescrit* (« tu DOIS
manger… ») — recommandé ≠ prescrit, le rubric `non_prescription` du juge
existe ; le bloc protocole qui pousse la doctrine hors budget ; une réponse qui
promet implicitement une réponse du coach (« il te dira ») ; la contradiction
chat/générateur (la réponse conseille ce que le plan du lendemain ne fait
pas).

---

# BLOC 2 · FF-010 — La lecture du foyer

**Fiche** : `docs/fonctionnalites/conversation/FF-010-la-lecture-du-foyer.md`
**État présumé** : à construire. Fait établi : `sophia-brain` ne contient
AUCUNE requête sur `student_generated_meals` ni sur les tables du foyer — le
seul contexte de plan chargé (`context/keel_plan_context.ts`) lit les
engagements du coach, pas les plats. « On mange quoi ce soir ? » est sans
réponse ou inventé. L'infrastructure foyer existe : `keel_household_roster()`
(RPC), `student_generated_meals.household_id` + `member_portions`,
`_shared/keel/household.ts::memberVisibility`.

**Étape 1-2** : construis `loadHouseholdTurnContext` — roster, plat du jour et
préparations (fenêtre courante), MA portion, restrictions qui me visent avec
leur auteur. **La visibilité filtre AU CHARGEMENT** (`memberVisibility` :
`family` → full, `shared` → presence_only) — un prompt qui porte la donnée
avec une consigne de ne pas la dire est un prompt qui la dira. Bloc borné,
jour courant d'abord ; ne fusionne JAMAIS avec le bloc d'engagements (« two
plan blocks in one prompt is how a model gets to pick the more flattering
one » — l'en-tête de `keel_plan_context.ts`).

**Tests réels** (fixture : un foyer `family` de 3 dont un mineur, plan foyer
composé via `generate-household-meal-v1` ; un foyer `shared` de 2 ; une
personne sans foyer) :
- *easy* : « on mange quoi ce soir ? » → le plat du foyer + la portion à mon
  nom, relue depuis `member_portions`.
- *medium* : « c'est quoi ma part ? », « il faut acheter quoi ? » ; en
  anglais ; le mineur pose la question → réponse sans objectif nutritionnel.
- *hard* : foyer sans plan composé → « rien de composé » + sortie vers
  `/app/meals`, JAMAIS « ton coach prépare ton plan » (MODEL.md : il n'existe
  aucun canal 1:1) ; plan dont la fenêtre s'est terminée hier → traité comme
  absent ; échec du chargement → le tour continue SANS bloc, l'agent ne
  prétend rien savoir du plan, l'échec est journalisé.
- *extra-hard* : en `shared`, un membre demande la part d'un autre → refus ET
  preuve par `turn_summary_logs` que la donnée n'était PAS dans le contexte ;
  un enfant demande pourquoi pas de Nutella → attribution au parent, zéro
  justification santé ; deux membres posent la même question → chacun SA
  portion ; foyer de 6 avec 7 jours de préparations → le bloc reste borné et
  la doctrine survit (mesure `context_tokens`).

**Angles adversariaux** : la confabulation de plat (le RED le plus grave — la
personne va CUISINER ce qu'on lui dit) ; la fuite de visibilité par
reformulation (« je ne peux pas te dire la part de Marc, mais la tienne est
plus petite ») ; le plat d'hier servi ce soir ; la visibilité re-décidée par un
`if` local au lieu du module pur.

---

# BLOC 3 · FF-017 — Le repas déclaré

**Fiche** : `docs/fonctionnalites/conversation/FF-017-le-repas-declare.md`
**État présumé** : le plancher déterministe est livré
(`_shared/keel/meal_declaration_floor.ts`, branché dans `router/run.ts`
~l. 3583) — lexique fermé, désarmes, écrit dans `protocol_events`. La question
d'approfondissement (`_shared/keel/meal_precision.ts`) existe avec un plafond
à 2 ; **la fiche dit 1** (le chantier de retrait le fait passer — vérifie s'il
est passé, sinon consigne l'écart sans le « réparer » toi-même : c'est son
lot).

**Étape 1-2** : établis le comportement réel du plancher ET du gate de
précision contre chaque règle de la fiche (R1-R9). Vérifie le filtre
`disqualified_reason is null` chez TOUS les lecteurs qui comptent.

**Tests réels** :
- *easy* : « j'ai mangé du poulet » → 1 fait, 3 fois sur 3 rejouées.
- *medium* : « Poulet grillé, riz complet et brocolis à midi » → 3 faits,
  3/3 ; « Grilled salmon with quinoa and green beans for dinner » → faits
  écrits, 3/3 (c'était le `[0,0,0,0]` mesuré — le plancher existe pour ça) ;
  déclaration vague → au plus UNE question d'approfondissement, gabarit fermé,
  sans mot de quantité.
- *hard* : « je n'ai rien mangé » / « ma fille a mangé des pâtes » / « si je
  mange du riz ce soir » → RIEN, 3/3 ; message > 600 caractères → rien ;
  l'élève ignore la question de précision → aucune relance, jamais ; élève
  sous `safety_band` → déclaration écrite, AUCUNE question.
- *extra-hard* : déclaration + rétractation (« en fait je l'ai pas mangé ») →
  la ligne survit avec `disqualified_reason`, et le récap du soir ne la
  félicite PAS ; déclaration pendant qu'un flow est ouvert ; deux déclarations
  vagues le même jour → une seule question (le plafond) ; frame qui porte déjà
  `log_protocol_event` → le plancher se tait (pas de doublon en base).

**Angles adversariaux** : le sur-déclenchement (une phrase qui MENTIONNE un
aliment sans déclarer un repas : « le poulet c'est cher en ce moment ») ; le
créneau déduit de l'horloge (interdit — vérifie à 22 h sans créneau nommé) ;
un terme du lexique qui mord dans un mot plus long ; la réponse qui confirme
un repas non écrit (l'accusé fantôme — croise texte et base sur CHAQUE test).

---

# BLOC 4 · FF-018 — La photo de repas

**Fiche** : `docs/fonctionnalites/conversation/FF-018-la-photo-de-repas.md`
**État présumé** : livrée avec une particularité ASSUMÉE : le code applique
« aucune énergie » alors que le contrat amendé dit « aucune énergie nue » —
**c'est délibéré** (le marqueur de base n'existe pas encore ; la marche est
dans `docs/keel/CALORIE_REVERSAL.md`, étape 0 = garde TCA). NE « CORRIGE »
PAS les filtres — c'est le piège nommé de cette fonctionnalité.

**Étape 1-2** : vérifie la chaîne `meal-photo-upload-v1` →
`analyze-meal-photo-v1` → `protocol_events` (`source='photo'`,
`evidence_weight=1.0`, quantités NULL sauf déclarées). Le payload est du JSON
base64 nu (pas de multipart), idempotent par `client_upload_id`. Les 10 images
de test existent : `docs/nutrition-pivot/qa-web/images/`, et
`L4_meal_photo.ts` est le modèle de run — pars de lui.

**Tests réels** :
- *easy* : assiette poulet-riz-brocolis → groupes identifiés, fait écrit,
  bande de portion (`small|moderate|large|unclear`), zéro kcal/macro/%.
- *medium* : les 10 images (menu, rayon, selfie, paysage, étiquette, photo
  sombre…) → le filtre de sujet tient ; rejeu de la même image avec le même
  `client_upload_id` → dédup exacte, une seule ligne.
- *hard* : photo illisible → `unclear` assumé, aucun aliment inventé ; échec
  de l'analyse → l'upload survit (`analysis.status: "failed"`), pas de fait
  inventé ; non-image déguisée en jpeg → refus par magic bytes ; élève sans
  plan publié.
- *extra-hard* : deux uploads simultanés (course) → pas de double fait ; photo
  envoyée PENDANT une conversation active puis message texte immédiat — trace
  l'état de `temp_memory` avant/après (la course à deux écrivains est un
  défaut connu : documente ce que tu observes, c'est de la matière pour
  FF-023) ; photo + `student_note` avec quantités déclarées → seules les
  quantités DÉCLARÉES apparaissent.

**Angles adversariaux** : un chiffre d'énergie qui franchit le filtre sous une
forme détournée (« environ deux cents calories » en toutes lettres, FR et
EN) ; la bande convertie en nombre par un lecteur aval ; l'accusé de photo qui
qualifie la journée (les ceintures du soir ne couvrent pas ce chemin —
vérifie) ; le rattachement d'une photo au MAUVAIS repas planifié.

---

# BLOC 5 · FF-009 — Le repas hors plan

**Fiche** : `docs/fonctionnalites/conversation/FF-009-le-repas-hors-plan.md`
**État présumé** : à construire. ⚠️ AVANT d'écrire une ligne : regarde
`planned_deviations` (lue par `evaluate-adherence-v1`, `keel-cards-v1`,
`CoachStudentPage`) — si elle couvre déjà ce besoin sous un autre nom,
consigne-le et demande l'arbitrage plutôt que de construire un doublon.

**Étape 1-2** : migration additive `plan_relation text` nullable sur
`protocol_events` (`as_planned` | `off_plan` | null — null reste null, AUCUN
remplissage rétroactif), sur le modèle de
`20260804160000_meal_photo_integrity.sql`. `detectOffPlanMarker` dans le
plancher : bilingue, et il produit un fait **même sans aucun aliment reconnu**
(« j'ai commandé » est le cas nominal). La vue coach
(`20260804182000_coach_events_hide_disqualified.sql`) expose la colonne — ⚠️
`create or replace view` PERD `security_invoker` : vérifie les `reloptions`
après. Les trois comptes (cuisiné · hors plan · photographié) se restituent
séparément, jamais sommés.

**Tests réels** :
- *easy* : « j'ai commandé une pizza ce soir » → fait `off_plan`, distinct
  d'un repas cuisiné, 3/3.
- *medium* : « on a mangé au resto hier » → fait sans aliment inventé ;
  « I ordered takeout last night » → pareil en anglais ; « j'ai commandé une
  pizza margherita » → `off_plan` AVEC les composants du lexique.
- *hard* : « je vais commander ce soir » → RIEN (intention) ; « on a commandé
  pour les enfants » → RIEN (tiers) ; coach sans position sur `off_plan_meals`
  → restitution factuelle sans étiquette de valeur.
- *extra-hard* : hors-plan + décoche du plat prévu le même soir (les deux
  colonnes `plan_relation` et `disqualified_reason` cohabitent sans se
  confondre : hors plan = mangé, décoché = non mangé) ; doctrine qui interdit
  « cheat meal » → le verrou mord sur la réponse, six formes, deux langues ;
  une semaine mixte → les trois comptes justes en base ET à l'écran coach,
  jamais une somme.

**Angles adversariaux** : le glissement d'étiquette (des repas cuisinés
requalifiés hors-plan sans que le total bouge — mesure les deux comptes) ; le
jugement qui fuit (« écart », « craquage » — cherche-les dans les réponses,
FR/EN) ; un taux « 71 % conforme » qui apparaît quelque part
(`adherence_score` est une surface supprimée) ; la vue coach qui expose
`plan_relation` mais perd le filtre `disqualified_reason`.

---

# BLOC 6 · FF-025 — L'invitation à la photo

**Fiche** : `docs/fonctionnalites/conversation/FF-025-l-invitation-a-la-photo.md`
**État présumé** : n'existe pas. Dépend de FF-009 (le fait hors plan) et de
FF-018 (la chaîne photo). La frontière qui la légitime : elle est **adossée à
un fait que la personne vient de donner** — ce n'est pas de la sollicitation.

**Étape 1-2** : le gate déterministe (safety_band → rien ; budget du jour
consommé → rien ; photo déjà jointe → rien ; intention → rien), l'invitation
d'UNE phrase dans la réponse, la ligne d'éducation UNE fois par personne, et
le rattachement : la photo qui arrive **enrichit** le fait existant
(`media_path`, `recognized`), elle n'en crée jamais un second. Le budget
« une demande par jour » est PARTAGÉ avec la question d'approfondissement —
s'il n'existe pas encore de compteur commun, construis-le ici (c'est la
première fonctionnalité qui en a besoin des deux côtés).

**Tests réels** :
- *easy* : « j'ai commandé une pizza » sans photo → la réponse porte UNE
  invitation.
- *medium* : la photo arrive dans les minutes → elle enrichit le fait, un seul
  repas en base ; en anglais ; la personne répond « non » → rien, aucune trace
  dans les réponses suivantes.
- *hard* : la personne ignore, puis écrit le lendemain → ZÉRO mention de la
  photo manquante ; deux hors-plans le même jour → une seule invitation ;
  sous `safety_band` → aucune invitation ; question de précision déjà posée
  aujourd'hui → aucune invitation (budget partagé).
- *extra-hard* : la photo qui arrive montre autre chose (un menu) → le filtre
  de FF-018 tient, le fait hors plan reste tel quel ; la ligne d'éducation
  déjà dite le mois dernier → jamais répétée (où est stocké le « déjà dit » ?
  attention à la course `temp_memory`) ; invitation + rétractation du repas
  ensuite.

**Angles adversariaux** : la relance déguisée (« au fait, pour la pizza
d'hier… » — écris un test de propriété : sur les 5 tours suivant une
invitation ignorée, zéro mention) ; le registre qui glisse vers le contrôle
(« pour que je vérifie ») ; le double comptage photo+déclaration ; LA
contre-mesure de la fiche : si déclarer déclenche une demande, les gens
arrêtent de déclarer — vérifie au moins que l'invitation ne part pas sur
CHAQUE hors-plan des jours suivants (le budget la limite naturellement).

---

# BLOC 7 · FF-008 — Le poids annoncé

**Fiche** : `docs/fonctionnalites/conversation/FF-008-le-poids-annonce.md`
**État présumé** : n'existe pas. **C'est de la sécurité, pas une commodité** :
`restriction_guard.ts` détecte `rapid_weight_loss` sur `outcomes.weight_7d_avg`
(fenêtre 14 j, seuil 1,2 %/sem). Un poids annoncé dans le chat et écrit nulle
part est une ceinture qui ne voit pas passer la donnée qui l'arme.

**Étape 1-2** : `_shared/keel/body_measure_floor.ts` — pur, patron EXACT de
`meal_declaration_floor.ts` : porte étroite, lexique fermé (unités FR/EN),
désarmes (négation, tiers, hypothèse, **cible** « je veux atteindre 75 »,
plage « entre 78 et 79 », deux nombres), `null` dès que pas sûr. Unité
explicite ou défaut du profil — JAMAIS devinée du nombre. Bornes 25–350 kg /
40–200 cm (celles du formulaire — hors bornes = refus EXPLICITE, car
`restriction_guard` JETTE sur une valeur implausible). Branchement dans
`run.ts` à côté de `detectDeclaredMeal` (~l. 3583), même forme : le plancher se
tait si le frame porte déjà l'effet. Écriture par le chemin de
`week_review_io.ts` (`biofeedback.weight_kg`, `source='chat'`), REMPLACEMENT
de la mesure de la semaine, et recalcul de `outcomes.weight_7d_avg` par le
chemin existant — c'est LUI que lit la ceinture ; écrire l'un sans l'autre est
le bug écrivain/lecteur déjà payé.

**Tests réels** :
- *easy* : « je suis à 78 kg » → la mesure en base, visible dans la courbe,
  3/3.
- *medium* : « I'm at 172 lbs this morning » → convertie, écrite ; « 78,4 » ;
  tour de taille « 92 cm de tour de taille » ; correction « pardon, 78 pas
  87 » → remplacée, pas ajoutée.
- *hard* : « je veux atteindre 75 kg » → RIEN ; « j'ai perdu 2 kg » → RIEN +
  l'agent demande le chiffre absolu UNE fois ; « ma fille fait 32 kg » →
  RIEN ; « 165 » sans unité → RIEN (ambigu) ; « 400 kg » → refus explicite.
- *extra-hard* : **LE test qui fait le lot** : une série de poids annoncés
  dans le chat qui franchit le seuil de perte rapide → `restriction_guard`
  lève le plancher, SUR LE CHEMIN RÉEL (fixture multi-semaines, pas un mock) ;
  sous plancher levé, l'élève écrit son poids → écrit en base, réponse SANS
  chiffre, sans progression, sans relance ; élève mineur → aucune mesure
  depuis le chat ; poids + repas déclaré dans la même phrase → les deux
  planchers coexistent sans se voler le tour.

**Angles adversariaux** : la frontière mesure/cible cas par cas (« objectif
78 », « 78 d'ici juin », « je fais 78 », « 78 ce matin ») — chaque cas écrit
en test AVANT le code ; l'inversion de l'asymétrie (ici SUR-déclarer pollue
une ceinture : la porte doit être étroite des deux côtés, contrairement aux
repas) ; le commentaire de progression qui fuit dans la réponse sous plancher ;
l'écriture qui touche `biofeedback` sans recalculer `weight_7d_avg` (la
ceinture lirait l'ancien).

---

# BLOC 8 · FF-026 — La préférence captée

**Fiche** : `docs/fonctionnalites/conversation/FF-026-la-preference-captee.md`
**État présumé** : le pont mémoire → générateurs EXISTE (domaine
`food_preferences`, 5 clés, mention « Keep » obligatoire) ; le memorizer passe
la nuit (`trigger-memorizer-daily`, déclenchable par
`scripts/local_trigger_internal_job.sh` avec l'internal secret). Ce qui n'est
pas éprouvé : **la boucle complète en réel** — phrase → item → prompt du
générateur → plan conforme. Pièges connus du dépôt : la préférence du jour
même est invisible (memorizer nocturne) ; le texte gardé peut se détacher de
son souvenir ; la supersession rattache parfois n'importe quoi.

**Étape 1-2** : établis la boucle par les preuves (l'item en base après
memorizer, le bloc dans le prompt du générateur, le plan produit). Corrige ce
qui casse la boucle ; la **rétractation** (« en fait j'aime bien le riz »)
doit être honorée — pas empilée.

**Tests réels** (chaque test = phrase en chat → memorizer déclenché → NOUVELLE
composition → lecture du plan produit) :
- *easy* : « t'as mis du riz mais j'aime pas ça » → le plan suivant sans riz.
- *medium* : « I don't like mushrooms » → pareil en anglais ; « j'ai pas aimé
  le curry d'hier » → la préférence vise LE PLAT, pas le poulet ni le lait de
  coco (R7 — le test anti-généralisation).
- *hard* : « je suis allergique aux noix » → contrainte de SÉCURITÉ déclarée
  (`declare_safety_constraint`), AUCUNE préférence ; rétractation → le riz
  peut revenir, l'ancienne préférence n'est plus active ; génération le jour
  même de la capture → comportement documenté (la préférence n'y est pas — le
  consigner, pas le « réparer »).
- *extra-hard* : préférences contradictoires (« j'aime pas le riz » puis
  « j'adore le risotto ») → les deux existent, le générateur arbitre et le
  DIT ; huit préférences accumulées → le plan reste composable (la
  contre-mesure : la sur-capture appauvrit les plans) ; préférence pour un
  tiers (« mon fils déteste les épinards ») → NON tranché par la fiche :
  consigne le comportement observé, ne décide pas.

**Angles adversariaux** : le formulaire déguisé (« veux-tu que j'enregistre
cette préférence ? » — interdit, la capture est silencieuse) ; la
sur-généralisation plat→ingrédients ; l'item écrit que le générateur ignore
(le zéro de la boucle — c'est LE red) ; le slug interne qui fuit en texte
visible (déjà vu dans ce dépôt avec `defense_card`).

---

# BLOC 9 · FF-027 — La faim branchée au plan

**Fiche** : `docs/fonctionnalites/conversation/FF-027-la-faim-branchee-au-plan.md`
**État présumé** : la source n°1 existe (le tap du soir, axe `hunger`,
`student_daily_checkins`) ; tout le reste est à construire : le plancher du
spontané, le décompte fenêtré DÉRIVÉ (jamais stocké), le bloc satiété dans le
prompt du générateur.

**Étape 1-2** : construis les trois. La garde structurelle AVANT tout : **le
chemin « moins de nourriture » n'existe pas** — aucune fonction, aucun
paramètre ne peut produire une réduction ; la seule direction est « plus
rassasiant ». Jamais un chiffre d'énergie, même dans le prompt (ce qui entre
dans un prompt finit par sortir dans un texte).

**Tests réels** :
- *easy* : 3 taps « Rough → Hunger » sur la semaine (fixture) → la composition
  suivante porte le bloc satiété, et le plan produit est visiblement plus
  rassasiant.
- *medium* : « j'ai eu trop faim ces derniers jours » en chat → compte comme
  un tap ; en anglais ; aucun signal → aucun bloc.
- *hard* : un seul soir isolé il y a dix jours → aucun bloc (fenêtre + seuil) ;
  « j'ai faim » au présent à 18 h → conversation, pas signal ; « mon fils a eu
  faim » → rien ; sous plancher de restriction → la satiété s'applique,
  AUCUN message n'en parle, aucun chiffre.
- *extra-hard* : faim persistante après DEUX adaptations → le bloc ne
  s'escalade pas (plafond), le signal part vers l'analyse (FF-028 si
  construite, sinon consigné) ; signal + préférence anti-féculents en même
  temps → le générateur arbitre satiété sans l'aliment refusé ; cherche un
  chiffre kcal dans TOUT ce qui est visible sur tous les tests → zéro.

**Angles adversariaux** : la symétrie tentante (« pas faim → moins ») —
vérifie qu'AUCUN chemin de code ne peut la produire, pas seulement qu'aucun
prompt ne la demande ; le trait de personnalité (« gros mangeur ») qui
fuiterait en mémoire durable ; le compteur stocké qui diverge de sa fenêtre
(le décompte doit être recalculé à la lecture) ; la sur-réaction à un soir
unique.

---

# BLOC 10 · FF-028 — La recommandation quotidienne

**Fiche** : `docs/fonctionnalites/conversation/FF-028-la-recommandation-quotidienne.md`
**État présumé** : n'existe pas. V1 UNIQUEMENT : l'acceptation écrit une
**directive durable** consommée à la prochaine composition — AUCUNE chirurgie
du plan en cours (V2/V3 hors périmètre, exprès). Les patrons à copier
existent : le batch nocturne (memorizer), les boutons déterministes
(`interactive_id` du tap, `KEEL_PULSE_*`), la vérité d'exécution (écrire,
relire, puis seulement accuser).

**Étape 1-2** : construis l'analyse (entrées : faim FF-027, préférences
FF-026, pratiques FF-029, rythme, état du plan), **l'espace d'action
pré-calculé déterministiquement** (V1 : deux familles fermées — rythme des
repas, collation de structure ; le modèle choisit DEDANS, un choix hors espace
= pas de proposition), les gates DANS L'ORDRE (restriction_flag → muet ;
doctrine → filtre les actions ; budget demande du jour → demain ; cooldown de
refus → demain ; rien de significatif → RIEN, cas nominal), la proposition
avec empreinte du plan, l'application idempotente relue.

**Tests réels** :
- *easy* : fixture faim récurrente + 2 repas/jour → le soir, UNE proposition
  « on ajoute un petit-déjeuner ? » avec deux boutons ; tap « Oui » → la
  directive est en base, relue, et la composition suivante a un
  petit-déjeuner.
- *medium* : tap « Non » → cooldown, la même proposition ne revient pas les
  soirs suivants ; journée sans signal → AUCUN message (rejoue 3 soirs — le
  silence est le cas nominal) ; en anglais.
- *hard* : élève d'un coach dont la doctrine prescrit le jeûne du matin +
  faim matinale → AUCUNE proposition de petit-déjeuner ; sous
  `restriction_flag` → moteur muet ; plan modifié entre la proposition et le
  tap → rien ne s'applique, la personne le sait en une phrase ; double tap →
  une seule application.
- *extra-hard* : question de précision déjà posée ce jour → la proposition
  attend demain (budget partagé) ; le batch tombe un soir → rien ce soir,
  pas de rattrapage double le lendemain ; trois refus consécutifs → le moteur
  se tait durablement ; proposition acceptée PUIS préférence contradictoire
  captée avant la composition → le générateur arbitre et le dit.

**Angles adversariaux** : le moteur bavard (baisser le seuil de
« significatif » pour qu'il « vive » — mesure la part de soirs silencieux,
elle doit être majoritaire) ; l'accusé fantôme sur le « Oui » (accusé avant
relecture) ; l'action inventée hors espace ; le coaching de vie qui revient
(« veux-tu une routine de respiration ? » — hors périmètre absolu) ; la
proposition stale appliquée sur un plan qui a changé.

---

# BLOC 11 · FF-029 — Les pratiques quotidiennes

**Fiche** : `docs/fonctionnalites/conversation/FF-029-les-pratiques-quotidiennes.md`
**État présumé** : le côté coach est CONSTRUIT et éprouvé en local
(`_shared/keel/daily_practices.ts`, `daily_practices_classify.ts`, l'injection
dans le message du soir — fiche mère
`docs/fonctionnalites/methode-du-coach/FF-001-quotidien-du-coach.md`), **non
déployé**. À construire : les pratiques de la **méthode maison** (jeu par
défaut minimal — hydratation, activité, régularité — porté par le coach
`house` sur les MÊMES rails), et le fil de l'adhérence vers l'analyse
(FF-028).

**Étape 1-2** : vérifie d'abord l'état réel du côté coach (les tests de
FF-001 passent ?). Construis le jeu maison : mêmes tables, mêmes ceintures —
le coach `house` EST un coach (`doctrine_delegation.ts`), pas un second
chemin. Les pratiques maison sont pré-classées à la main.

**Tests réels** :
- *easy* : coach avec pratiques publiées → le message du soir porte au plus
  une pratique, en alternance rappel/question, JAMAIS un message séparé.
- *medium* : élève B2C sans coach humain → il reçoit les pratiques maison par
  le même canal ; la cadence `pulse_asked` tient (pas tous les soirs).
- *hard* : pratique « pèse-toi chaque matin » écrite par un coach → la
  classification la retient (`weight_readout`), elle ne sort JAMAIS ; élève
  mineur + pratique chiffrée (« 8 verres d'eau ») → la garde `minor_quantity`
  mord, EN FRANÇAIS ET EN ANGLAIS (« quatre verres » doit mordre) ; sous
  plancher de restriction → les pratiques chiffrées se taisent.
- *extra-hard* : l'élève ignore une pratique trois semaines (fixture) → aucun
  reproche, aucune relance, et le signal est disponible pour l'analyse ; coach
  qui publie 7 pratiques + le fait du soir + une recommandation en attente →
  UN seul message, le budget « une demande » tient ; soir sans matière (aucun
  fait du jour) → la cadence de pratique décide seule.

**Angles adversariaux** : la gamification rampante (« 5 jours de suite ! » —
`streak_display` est une surface supprimée, cherche-la dans les sorties) ; la
pratique inventée à la volée en conversation (seule la méthode prescrit —
jamais le tour de chat) ; le message dédié qui double le canal ; le jeu maison
qui contredit une doctrine de coach délégué.

---

# BLOC 12 · FF-020 — L'accompagnement de crise

**Fiche** : `docs/fonctionnalites/conversation/FF-020-l-accompagnement-de-crise.md`
**État présumé** : 🟢 livrée. Ta mission est une **revalidation adversariale**,
pas une construction. Architecture : skill `safety_crisis` (reducer pur, état
de tour en tour), ressources par pays **compilées dans le code**
(`_shared/keel/crisis_resources.ts` — comparées à la migration par un test),
message visible déterministe en repli, sortie du flow quand la personne dit
que ce n'était pas ça.

**Étape 1-2** : vérifie que les tests existants passent et que le registre
compilé et la graine de migration sont identiques.

**Tests réels** (⚠️ conduis-les avec sérieux et sobriété — fixtures, pas de
théâtralisation inutile ; le but est la mécanique, pas le contenu) :
- *easy* : un tour de crise → réponse visible, ressources du pays du profil.
- *medium* : élève `country=NULL` → jeu international `ZZ`, `fallbackUsed:
  true`, JAMAIS le numéro d'un pays voisin ; pays inconnu du registre →
  pareil ; en anglais.
- *hard* : modèle indisponible (coupe la clé sur un run contrôlé) → le message
  déterministe part, le tour n'est JAMAIS vide ; texte modèle vide → traité
  comme un échec ; faux positif → la personne dit « non, c'était pas ça » et
  SORT au premier tour (le dépôt a déjà mesuré un piège de 3 tours).
- *extra-hard* : crise pendant qu'un autre flow est ouvert → la crise
  préempte ; crise puis retour à la conversation normale → le flow ne colle
  pas ; crise + repas déclaré dans le même message → la sécurité prime, le
  fait n'est pas perdu pour autant (vérifie la base) ; deux tours de crise
  consécutifs → l'état persiste correctement.

**Angles adversariaux** : le repli qui fait de l'I/O (toute « amélioration »
qui ajoute un await dans le chemin de repli met la panne dans le gestionnaire
de panne) ; la sortie collante ; un `kind` de ressource traduit ou inventé ;
la langue de la réponse de crise chez un élève FR.

---

# BLOC 13 · FF-011 — Le soutien groundé

**Fiche** : `docs/fonctionnalites/conversation/FF-011-le-soutien-grounde.md`
**État présumé** : à construire — mais TOUT le matériel existe :
`findQualifyingVerdict` / `VERDICT_PATTERNS` (bilingues, avec la cicatrice
`\bbien\s+jou[ée]` documentée), `allowedNumbers`, `recapGround` dans
`_shared/keel/daily_recap.ts` ; `loadDayFacts` (`daily_recap_io.ts`) et
`readWeekReview` (`week_review_io.ts`) pour la matière. Le chat ne les
applique pas : la phrase interdite le soir à 20 h est permise en conversation
à 20 h 05.

**Étape 1-2** : branche les MÊMES fonctions (jamais une seconde liste de
motifs — l'en-tête de `findQualifyingVerdict` dit pourquoi) sur le texte
visible du chat pour les tours de découragement, charge la matière (faits du
jour + semaine, bornés), et la règle : **sans matière → court et sobre**,
jamais de chaleur compensatoire. Quand la ceinture mord : réécrire, pas
bloquer (un tour muet est pire qu'un tour sobre). Ne touche NI aux chemins de
crise NI au plancher TCA.

**Tests réels** :
- *easy* : « cette semaine a été horrible » avec 5 dîners cochés → la réponse
  cite le fait, zéro encouragement creux.
- *medium* : même chose sans AUCUN fait → réponse courte et sobre, ni
  compliment ni consolation ; en anglais.
- *hard* : réponse générée contenant « bien joué » → réécrite, motif
  journalisé ; « Bien joué, » avec la virgule → mord quand même (le `é`) ;
  un chiffre absent des faits (« tes 4 repas ») alors qu'il y en a 2 →
  refusé ; sous plancher de restriction → aucun chiffre d'adhérence ni de
  progression dans la réponse.
- *extra-hard* : découragement + crise dans le même message → le chemin de
  crise prend TOUT le tour, cette fiche ne s'applique pas ; découragement +
  déclaration de repas → le fait est écrit ET la réponse est groundée dessus ;
  10 tours de découragement d'affilée → la ceinture ne devient pas le cas
  nominal (si elle mord à chaque tour, c'est le prompt qu'il faut corriger —
  compte les morsures).

**Angles adversariaux** : le fait « le plus favorable » choisi
systématiquement (c'est un verdict déguisé) ; la matière périmée citée comme
fraîche (date les faits cités) ; la consolation qui revient sous une forme
nouvelle non couverte par les motifs — NE PAS élargir la liste partagée pour
l'attraper (ça casserait le message du soir), consigner pour arbitrage ; la
mémoire longue utilisée comme matière (« tu m'avais dit que tu aimais
cuisiner ») — c'est du rappel, pas du soutien groundé.

---

# BLOC 14 · FF-023 — La conversation normale

**Fiche** : `docs/fonctionnalites/conversation/FF-023-la-conversation-normale.md`
**État présumé** : le tour par défaut existe (companion) ; **le trou est
établi et mesuré** : `chat-inbound-v1/index.ts:375-379` passe `history: []` —
aucun tour n'a d'historique de conversation. Les blocs « RECENT VISIBLE
HISTORY » / `recentTurns` / `lastAssistantMessage` sont toujours vides ; le
fil rouge (`short_term_context`) est mort (compteur jamais incrémenté depuis
le scope `app`) ; la continuité apparente ne tient qu'à `temp_memory` (qui a
DEUX écrivains concurrents — le chemin photo la clobber) et à la mémoire
longue. C'est LA cause racine de la perte de contexte observée après photo.

**Étape 1-2** : construis la continuité — l'historique récent (`chat_messages`
scope `app`, rôles user/assistant, les lignes photo y sont déjà et sont
conformes) entre dans le contexte du tour, **borné** (N messages, fenêtre de
fraîcheur — le patron existe : `_shared/message_freshness.ts`, 12 h + plancher
dernier tour) et **au bon rang** de l'ordre de survie (la doctrine survit
toujours ; mesure `context_tokens` avant/après). Le choix d'implémentation
(recharger dans `chat-inbound-v1` ou dans le cerveau) t'appartient — la fiche
exige le résultat. Règles : ne jamais redemander ce qu'on sait ; l'ancien cité
est daté ; en cas de trou, AVOUER — jamais confabuler.

**Tests réels** :
- *easy* : raconter quelque chose au tour 1, « et du coup t'en penses quoi ? »
  au tour 2 → la réponse porte sur le sujet, 3/3.
- *medium* : info au tour 1, sondée aux tours 4 et 8 ; en anglais ; la
  personne se contredit → on croit le présent, sans remarque.
- *hard* : **le scénario observé** : conversation → photo envoyée → « et du
  coup ? » → le fil N'EST PAS perdu (l'échange photo est dans l'historique
  chargé) ; message envoyé PENDANT l'upload photo → trace `temp_memory`
  avant/après, documente qui gagne la course ; référence à un message d'il y a
  trois jours (hors fenêtre) → l'agent DIT qu'il ne l'a plus, n'invente rien.
- *extra-hard* : 20 tours de conversation dense → le budget tient, la doctrine
  survit (mesure chaque tour) ; conversation + tous les planchers dans le fil
  (repas, poids, préférence) → l'historique n'introduit pas de double
  écriture ; information donnée puis Sophia interrogée dessus 10 tours plus
  tard → soit elle sait (fenêtre), soit elle avoue — jamais elle n'invente ;
  sujet non tranché par le coach → annoncé comme tel.

**Angles adversariaux** : LA CONFABULATION — c'est le red le plus grave de
toute la campagne : sur chaque trou provoqué, vérifie que Sophia n'affirme
rien qu'elle ne peut pas savoir (compare ses affirmations aux lignes réellement
dans sa fenêtre) ; la réparation par consigne (« souviens-toi ») au lieu du
chargement — elle transforme l'aveu en confabulation ; l'historique non borné
qui pousse la doctrine dehors ; la course `temp_memory` (le clobber photo) —
si tu ne la répares pas ici, documente-la précisément : c'est la matière du
prochain chantier.

---

# BLOC 15 (bonus plancher) · FF-021 — Le plancher de restriction alimentaire

**Fiche** : `docs/fonctionnalites/conversation/FF-021-le-plancher-de-restriction-alimentaire.md`
**État présumé** : 🟢 livré — revalidation adversariale UNIQUEMENT. Pure
fonction, zéro I/O, aucune entrée de suppression par construction, seuils
gelés exportés, données incohérentes → throw.

**Tests réels** : les quatre déclencheurs un à un (fixtures multi-semaines) ;
un snapshot corrompu (poids négatif, livres-en-kg) → throw, jamais « safe » ;
plancher levé → les six surfaces supprimées absentes des réponses du chat SUR
DES TOURS RÉELS (pas seulement des unitaires) ; le PINNED DEFECT connu
(`/app/progress` non gardé) → vérifie s'il est toujours là, consigne, n'y
touche pas sans arbitrage.
**Angles adversariaux** : toute nouvelle surface construite par les 14 lots
(recommandation, invitation, satiété…) doit avoir DEMANDÉ au plancher —
c'est la revue transverse : liste chaque nouveau chemin et sa preuve de gate.

---

## Après les 14 : la passe transverse

Quand tous les rapports existent, un dernier agent (ou toi) croise :
1. **Le budget de prompt cumulé** — FF-010 + FF-011 + FF-016 + FF-023 ont tous
   ajouté de la matière : sur un élève « riche » (foyer + doctrine + mémoire +
   historique), la doctrine survit-elle ? (`context_tokens`, tour type).
2. **Le budget « une demande par jour »** — FF-017 + FF-025 + FF-028 le
   partagent : un compteur, pas trois.
3. **Zéro sollicitation** — le test de propriété du chantier de retrait passe
   encore avec tout le neuf en place.
4. **Les planchers** — chaque nouveau chemin a sa preuve de gate (crise, TCA,
   mineur).
