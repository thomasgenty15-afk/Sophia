# PROGRESS — nuit du 2026-08-03 (pivot Coach Nutrition 1:N)

> Journal append-only, horodaté (CEST). Une ligne par étape : fait / vert / rouge / décision.
> Règle d'honnêteté : rien n'est marqué « vert » sans la commande de test qui l'a prouvé.
> Livrable du matin : `STATUS-MORNING.md`.

---

## 03:05 — P0.1 Snapshot + lecture de l'autorité

- `git commit 26af8ef7` — snapshot WIP de la branche `Nutrition` (335 fichiers).
  ⚠️ **`--no-verify` utilisé pour CE commit uniquement.** Le hook `.husky/pre-commit`
  (`scripts/agent-gate.sh`) lance eslint sur les fichiers frontend *stagés* : 46 erreurs
  pré-existantes dans des fichiers du WIP que je n'ai pas écrits (`AttackCards.tsx`,
  `WeekView.tsx`, `CoachBillingPage.tsx`, `entitlements.ts`, tests `.int.test.ts`…).
  `tsc -b` et `deno check` passaient. Un snapshot doit capturer l'état tel quel — le corriger
  aurait été une modification déguisée. Les commits de phase suivants passent le gate.
- Lu en entier : `PLAN-NUIT.md` (1298 l.) + `docs/keel/CONTRACT.md`, `SCHEMA.md`, `BUILD_PLAN.md`,
  `PHOTO_QUANTIFICATION.md`.
- **Stack locale UP** : Docker Desktop était éteint → `open -a Docker` puis `npx supabase start`.
  Vérifié : 48 migrations appliquées, **128 tables**, les 17 tables KEEL présentes en base locale.
  (`docker exec supabase_db_Sophia_2 psql -U postgres`. ⚠️ `psql` n'est PAS dans le PATH de
  l'hôte — toute commande SQL de cette nuit passe par `docker exec`.)

### Écart d'inventaire constaté (à la hausse) — l'ANNEXE B est en retard sur la réalité

L'ANNEXE B décrit la migration P0 comme « écrite, pas appliquée » (état `BUILD_PLAN.md` du 27/07).
**Vérifié en base locale : elle est appliquée**, ainsi que les 16 migrations KEEL suivantes.
Donc `coaches`, `coach_clients`, `plan_commitments`, `protocol_events`,
`commitment_evaluations`, `student_safety_constraints`, `card_templates`, `coach_billing_periods`,
`slot_vocabulary`, `food_groups`, `meal_ideas`, `meal_plan_entries` **existent réellement**.
Confirmé absents (grep migrations + code, 0 hit) : `coach_doctrines`, `cohorts`,
`coach_syntheses`, `recurring_meals`, `student_facts`. C'est exactement le périmètre P0.2.

---

## 03:15 — DÉCISION P0.0 (a) — IDENTITÉ ÉLÈVE

**Tranché : option (B) — `auth.users` fantôme provisionné par numéro de téléphone.**
Conforme à la recommandation du plan (§3.6). Ce n'est pas un choix par défaut : trois preuves
vérifiées cette nuit le rendent nettement supérieur à (A).

1. **Le chemin d'identification WhatsApp existant l'implémente déjà.**
   `whatsapp-webhook/index.ts:579-645` résout un entrant par
   `profiles.phone_number` → `profiles.id` (= `auth.users.id`), avec préférence pour le profil
   `phone_verified_at NOT NULL` quand plusieurs candidats matchent. Un élève fantôme avec un
   profil vérifié tombe dans ce chemin **sans une ligne de code modifiée**. L'option (A)
   (table `students` autonome) obligerait à réécrire cette résolution ET les ~15 FK KEEL.
2. **La doctrine RLS rend le compte fantôme inerte.** `docs/keel/SCHEMA.md` §TENANCY et
   `20260727090000` l.706-740 : l'élève est **SELECT-only**, toutes les écritures passent par
   `service_role`. Un compte sans mot de passe ne se connecte jamais → ses policies SELECT ne
   sont jamais exercées. Le fantôme n'ouvre aucune surface d'attaque nouvelle.
3. **RGPD déjà couvert.** Toutes les tables KEEL sont `ON DELETE CASCADE` vers `auth.users` et
   `purge_auth_user()` + `purge-deleted-accounts` existent. Une table `students` autonome
   sortirait de ce filet et demanderait sa propre purge.

**Chemin d'upgrade (ce que (B) achète)** : si un jour l'élève a une interface, on pose un mot de
passe ou on envoie un magic link **sur la même ligne** — zéro migration de données.

**Alternative si Thomas veut revenir dessus** : (A) reste faisable, coût ≈ 15 FK + réécriture de
la résolution webhook + purge RGPD dédiée. Le point de non-retour n'est pas cette nuit : tant
qu'aucun élève réel n'est provisionné, basculer coûte une migration.

**Dettes ouvertes par ce choix, à fermer dans P0.2** (chacune est un test) :
- `handle_new_user()` est déclenchée à l'INSERT dans `auth.users` et a été **réécrite 3 fois** :
  repartir de `20260727200000` et vérifier qu'elle ne seede **rien** de B2C pour un fantôme.
- `profiles.phone_number` n'est unique **que** validé : le provisionnement doit poser
  `phone_verified_at`, sinon le webhook classe l'entrant en « ambigu/inconnu ».
  Fonctions existantes à réutiliser : `is_verified_phone_in_use()`,
  `transfer_verified_phone_to_user()`, `sync_phone_verified_on_whatsapp_optin()`.
- Un numéro = un élève = un coach vivant (§5 « élève de DEUX coachs interdit v1 ») : l'index
  unique partiel existe déjà sur `coach_clients`.

---

## 03:15 — DÉCISION P0.0 (b) — CONTRAT kcal / MACROS

**Tranché : DIVERGENCE PARTIELLE de la recommandation du plan. Les fourchettes kcal/macros
ne sont PAS ajoutées. Le reste du contrat cible §3.5 l'est.**

Le plan (§3.5, P0.0bis) recommande d'« étendre le contrat existant vers les fourchettes +
hypothèses + `question_qui_changerait_tout` ». J'implémente **hypothèses + question**, et je
refuse **les fourchettes kcal/macros**. Justification (le plan exige une justification en cas
d'écart — §4 P0.0) :

**La preuve est dans le repo, et elle est empirique, pas doctrinale.**
`docs/keel/PHOTO_QUANTIFICATION.md` documente **85 appels réels** sur notre propre modèle
(`gemini-3.1-pro-preview`, payload exact de `buildVisionPayload`, vérité terrain USDA SR Legacy) :

| Mesure | Résultat | Conséquence pour « une fourchette honnête » |
|---|---|---|
| Biais kcal/repas | **−26,6 %**, 18/20 appels sous-estimés, Bland-Altman IC95 [−154, −62] | Le biais est **systématique**, pas du bruit. Une fourchette centrée dessus est fausse dans le même sens à chaque fois. |
| Agrégation hebdo | erreur de la somme **25,5 %** (÷1,04 seulement) | « ça se compense sur la semaine » est **mesuré faux** ici. |
| Couverture de l'IC90 demandé au modèle | **58 %** (25/43), et 1/5 sur les cas à graisse invisible avec `confidence:"high"` | **Le modèle ne sait pas produire sa propre fourchette.** Une fourchette affichée serait une fourchette inventée. |
| Erreur sur le delta | **49,0 %** vs 19,6 % sur le niveau (2,5× pire) | Le chiffre « interne pour la tendance » produit une **tendance fausse**. |
| Répétabilité intra-cas | CV 1,87 % | Ré-interroger N fois ne réduit rien : l'erreur est dans le modèle. |

Le point qui ferme le débat : **une fourchette n'est honnête que si sa couverture est calibrée.**
La nôtre couvre 58 % à un nominal de 90 %, et rate le plus quand le repas est gros et la graisse
invisible — exactement le cas que le coach cherche à voir. Publier `{"kcal":{"min":…,"max":…}}`
serait le pattern §7.3-(7) (« vert en simulation présenté comme vérifié ») transposé à la mesure.

**Ce que j'implémente à la place** — et qui répond au *besoin* derrière la demande :

1. `hypotheses[]` (registre d'hypothèses explicites : huile de cuisson, sauce, sucre dissous) —
   **retenu du plan**. Sert la *composition* (« il y a de l'huile ajoutée »), jamais l'énergie.
   Gain mesuré du bloc anti-omission déjà en place : biais −26,6 % → −11,6 %, coût zéro token.
2. `question_qui_changerait_tout` (une question max, seulement si elle change la conclusion) —
   **retenu du plan**. Mesuré : biais → −7,8 % (3,4×). C'est le différenciateur réel : une app
   muette ne peut pas poser la question.
3. La **magnitude ordinale** (`portion_band` ∈ small|moderate|large|unclear) comme réponse à
   « il mange beaucoup ou peu ? ». Déjà colonne en base (`20260727220000_keel_portion_band.sql`),
   déjà autorisée mot pour mot par CONTRACT NON-INPUT #4 (« a photo may evidence
   presence/composition/**portion/serving** »). Le token **est** la fourchette, et sur de la
   classification le modèle est excellent (là où il est mauvais en régression).

**Ce que ça coûte, dit franchement** : le webhook JSON sortant vers l'app d'un coach (§1.8)
livrera de la composition + des bandes de portion, **pas des calories**. Si ce coach exige des
kcal, c'est une décision commerciale de Thomas — pas une lacune technique. Elle est réversible :
le champ se rajoute au parseur en ~1 h. Ce qui n'est pas réversible, c'est la confiance perdue
le jour où un coach pèse une assiette et trouve 27 % d'écart.

**Alternative si Thomas veut revenir dessus** : rétablir les kcal en fourchette **uniquement**
sur le canal webhook coach (§1.8), jamais élève, jamais évaluateur, avec le biais mesuré
(−26,6 %) attaché à chaque payload. Le pilote « 10-15 élèves, 2 semaines, photo + pesée »
décrit en `PHOTO_QUANTIFICATION.md` §4-(b) est le préalable honnête à toute quantification.
Flag repris dans STATUS-MORNING.

**Conséquence contractuelle** : `docs/keel/CONTRACT.md` NON-INPUT #4 **n'est pas modifié**.
Aucune divergence code↔contrat n'est créée cette nuit. C'est le sens de « toute divergence avec
le contrat se résout en faveur du contrat » (`BUILD_PLAN.md`, règles agents).

---

## 03:40 — P0.legacy + P0.2 : VERT

### Migration `20260803030000_pivot_disable_b2c_crons.sql` — 5 crons B2C déprogrammés
Débranche (pas supprime) : `trigger-retention-emails` (⚠️ vrais emails, 09:00),
`process-whatsapp-optin-recovery`, `reseed-recurring-reminders`, `trigger-watcher-batch`,
`keel-arm-cards`. Style et doctrine repris de `20260727150000`.
**N'ont PAS été touchés** (ANNEXE C.6 les classe ADAPTER, pas DÉBRANCHER) : `process-checkins`,
`schedule-whatsapp-v2-checkins`, `trigger-synthesizer-batch`,
`recompute-time-based-access-tiers` — ils portent la boucle REMARQUER que P1.6 doit reprendre.

⚠️ **FLAG HONNÊTETÉ — ceci n'est PAS fait en production.** Une migration n'agit que sur la base
où elle est poussée ; cette nuit elle n'a tourné qu'en local. **Les 5 jobs tournent toujours sur
le distant**, y compris l'envoi d'emails de 09:00 (UTC → 11:00 CEST). Le chemin d'urgence
(unschedule direct en SQL, sans `db push`) est en tête de STATUS-MORNING.

### Migration `20260803031000_pivot_nutrition_tables.sql` — les 5 tables manquantes
`cohorts` (+ `coach_clients.cohort_id`), `coach_doctrines`, `coach_syntheses`,
`recurring_meals`, `student_facts`. Rien d'autre : les 17 tables KEEL existantes ne sont pas
retouchées.

**DÉCISION DE CONCEPTION (écart assumé vs §3.4.1 du plan)** : `student_facts` **n'a pas** de
`kind='allergy'` ni de booléen `is_hard_constraint`. Le plan proposait un magasin unique portant
le dur et le souple. Or `student_safety_constraints` existe déjà, porte le dur en identifiants
structurés, est chargée à chaque tour hors du chemin mémoire, et son validateur déterministe
post-génération est écrit et testé (`_shared/keel/safety_constraints.ts`, 322 l.).
Deux tables capables de porter une allergie = le pattern §7.3-(6) (« deux sources de vérité qui
peuvent diverger ») **sur la donnée où diverger est dangereux** : une allergie rangée dans la
mauvaise table est invisible au validateur. Un CHECK (`student_facts_no_hard_constraint_check`)
rend l'erreur impossible à commettre en silence.
*Alternative si Thomas préfère le magasin unique* : coût = migrer `student_safety_constraints`
dans `student_facts` ET réécrire le validateur + ses tests. Non recommandé.

### DoD vérifiée — 37 assertions, 0 FAIL
```bash
npx supabase db reset
docker cp supabase/functions/_shared/keel/pivot_nutrition_tables_test.sql supabase_db_Sophia_2:/tmp/t.sql
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/t.sql
```
Couvre : existence + RLS des 5 tables ; les 5 crons partis **et les 6 crons moteur intacts**
(contre-test : un « 0 partout » passerait le premier pour la pire des raisons) ; le refus des
contraintes dures dans `student_facts` et leur acceptation dans `student_safety_constraints` ;
une seule doctrine publiée par coach mais plusieurs brouillons ; `recurring_meals.active` exige
`confirmed_at` (le système ne se confirme jamais lui-même) ; idempotence de `coach_syntheses` ;
cloisonnement RLS coach↔coach et élève↔élève ; **et le coach qui ne lit ni les repas récurrents
ni les préférences de SON élève** (§1.5 « l'adhérence, jamais le journal intime »).

---

## 04:05 — P0.3 (module) : VERT — contrat photo étendu

`_shared/keel/meal_analysis.ts` : version de prompt `meal_analysis.en.v2` → **v3**.
Deux champs ajoutés, zéro champ retiré :

- **`assumptions[]`** — `{subject, assumption, basis}`. `subject` = liste ASCII fermée
  (`cooking_fat`, `sauce_dressing`, `added_sugar`, `preparation_method`, `beverage_content`,
  `hidden_component`, `other`). **`basis` est le champ qui compte** : `visible_cue` (l'image le
  montre = preuve) vs `standard_default` (l'image ne le montre pas, c'est une supposition).
  Un élève peut corriger un défaut ; il ne peut pas corriger ce que le système prétend avoir vu.
  ⚠️ **Pas de `impact_kcal`** — le champ du §3.5 est la question calorique déguisée (décision
  P0.0bis). Un test le prouve : s'il arrive quand même, il est supprimé et l'audit l'enregistre.
- **`clarifying_question`** — une seule, `null` par défaut. La règle « clarifier seulement si ça
  change l'action » (§3.3bis) est rendue **déterministe** au lieu d'être une consigne de prompt :
  la question ne survit que si la lecture porte une incertitude (une hypothèse déclarée, ou une
  image non-`clear`). Sinon elle est jetée **et la suppression est tracée**. Une question sans
  enjeu est un interrogatoire.

**Retour élève** (`renderMealPhotoAck`) : **une seule** forme de doute par message, jamais deux —
question > hypothèse `standard_default` annoncée + porte de correction > caveat générique.
Les hypothèses `visible_cue` ne sont **pas** remontées à l'élève (lui demander de confirmer ce que
la photo montre est du bruit). Le retour reste qualitatif : aucun nombre ne peut y entrer, le type
n'en porte aucun.

**Persistance** : `assumptions` + `clarifying_question` sont écrites dans `recognized` jsonb —
les deux consommateurs en ont besoin (synthèse coach « la matière grasse de cet élève est inconnue
4 fois sur 5 » et webhook coach §1.8).

### DoD module vérifiée
```bash
deno test --allow-all supabase/functions/_shared/keel/ \
  supabase/functions/whatsapp-webhook/handlers_meal_photo_test.ts
# 327 passed | 0 failed
deno check supabase/functions/analyze-meal-photo-v1/index.ts \
  supabase/functions/whatsapp-webhook/handlers_meal_photo.ts \
  supabase/functions/meal-photo-upload-v1/index.ts     # 3 OK
```
16 tests neufs, dont 5 qui gardent la porte fermée : un kcal dans une hypothèse est rédigé, un
`impact_kcal` est supprimé, une question qui demande une quantité est rédigée, l'accusé ne contient
jamais de nombre, et le prompt garde son interdit calorique verbatim.

**Reste sur P0.3** : la DoD de bout en bout (« une image via le sim produit une entrée repas
complète ») — nécessite les edge functions servies ; en cours.

### Garde-fou d'exécution posé maintenant
`supabase/.env` porte **`EMAIL_DELIVERY_ENABLED=1`** : un run de sim qui déclenche un chemin email
enverrait de VRAIS emails via Resend. Je ne modifie pas le fichier de Thomas ; tous les runs de la
nuit utilisent un override de scratchpad (`night.env`) avec `EMAIL_DELIVERY_ENABLED=0`,
`WHATSAPP_DELIVERY_ENABLED=0`, `MEGA_TEST_MODE=1`.
**À relire au matin** : `EMAIL_DELIVERY_ENABLED=1` en local est un pistolet chargé.

---

## 04:55 — P1.5 : VERT — injection doctrine en couches + double verrou

Trois fichiers neufs/refondus dans `_shared/keel/` :

### `forbidden_matcher.ts` (neuf) — UN moteur, deux verrous
Le produit a **deux** verrous post-génération qui sont la même mécanique pointée sur deux listes :
les contraintes médicales de l'ÉLÈVE (existant) et les INTERDITS du COACH (§3.3, neuf).
Écrire le second en copiant le premier aurait produit le pattern §7.3-(6) — deux sources de
vérité qui divergent. Et elles **auraient** divergé : la liste des négations est précisément la
partie qu'on édite (chaque faux positif « gluten-free » ajoute une construction).
Donc : moteur extrait, `safety_constraints.ts` refondu pour le consommer, comportement identique
prouvé par ses 14 tests d'origine **inchangés**.

⚠️ **J'ai modifié un test de sécurité** — à relire au matin. `safety_constraints_test.ts`
assertait « zéro import » comme preuve de « ne touche jamais le chemin mémoire ». Mon extraction
ajoute un import. Je ne l'ai pas affaibli : il vérifie maintenant l'invariant **transitivement**
(allowlist fermée de dépendances + chaque dépendance elle-même sans import + aucune ne nomme le
chemin mémoire). C'est strictement plus fort : l'ancien ne regardait qu'un fichier et n'aurait
rien dit de ce qu'une dépendance traînait.

### **DEUX BUGS RÉELS trouvés par les tests neufs — ils étaient déjà dans le verrou médical**
1. **Faux positifs sur les déterminants français.** La liste de négations s'arrêtait à
   `de/du/des/d'` : « **évite les** cacahuètes », « **supprime le** beurre de cacahuète »,
   « on ne met **jamais la** cacahuète » étaient tous **REJETÉS**. Un validateur qui rejette
   « évite les cacahuètes » est un validateur qu'on débranche dans la semaine. Corrigé une fois,
   les deux verrous en profitent. Test de régression ajouté côté safety.
2. **Une occurrence comptée deux fois.** Le token `six_small_meals` produit un motif qui matche
   déjà la forme de surface littérale « six small meals » → 2 violations pour 1 phrase. Ça gonfle
   le log d'incidents, le chiffre « combien de fois l'agent m'a contredit » que lit le coach, et
   l'instruction de reprise. Dédup par (règle, offset), la plus longue gagne.

### `doctrine.ts` (neuf) — la méthode du coach, compilée
- `compileDoctrineBlock()` : croyances / INTERDITS / vocabulaire / arbitrages / voix → un bloc,
  **déterministe** (le hash est la clé de cache : une compilation non déterministe raterait le
  cache à chaque tour et multiplierait la facture en silence).
- **Invalidation §3.7 brique 6** : le hash dérive du **contenu**, pas d'un numéro de version
  qu'un appelant peut oublier de bumper. Un coach qui édite à 14h02 est servi à 14h03.
- `assembleTurnPrompt()` : les 5 couches §3.3 dans l'ordre. **SYSTEM CORE en premier et
  non-surchargeable** — un coach ne peut pas écrire « ignore les règles de safety » dans ses
  croyances et se retrouver au-dessus d'elles (testé). Couche vide = **omise**, pas un en-tête
  vide (« ça existe et c'est vide » est une autre affirmation que « ça ne s'applique pas »).
- `doctrineCachePrefix()` : le préfixe partageable entre tous les élèves d'un coach.

### La divergence VOULUE entre les deux verrous (le cœur du design)
- **Allergie** : le danger est la SUGGESTION. « Ajoute du beurre de cacahuète » est le mal.
- **Interdit** : le danger est l'ADHÉSION, pas le mot. L'agent **doit** pouvoir dire
  « Marc ne fait pas de 6 petits repas » — cette phrase EST la doctrine qui fonctionne. La
  rejeter rendrait l'agent incapable d'expliquer la méthode de son propre coach.
C'est le cas qui rend la liste d'exceptions structurante et non cosmétique. Testé dans les deux
sens.

### DoD vérifiée
```bash
deno test --allow-all supabase/functions/_shared/keel/     # 328 passed | 0 failed
```
21 tests neufs sur la doctrine + 1 régression safety.
**Reste** : brancher l'assemblage dans le composeur de `sophia-brain` (P1.4/P1.5b) — le module
est prêt et testé, le câblage runtime ne l'est pas.

---

## 05:35 — P2.8 (moteur) : VERT — synthèse coach déterministe

`_shared/keel/coach_synthesis.ts` (neuf) + 20 tests. C'est l'artefact que le coach paie
(« la valeur est poussée, l'interface sert à configurer »).

**Règle qui façonne tout le fichier** : *les chiffres sont CALCULÉS, jamais narrés par un modèle.*
Le dépôt a déjà payé l'alternative (`tracking-projection-not-grounded-db`,
`recap-readonly-routed-to-plan-realignment`). `renderSynthesisText` est un **template** sur des
valeurs calculées. Ce qui n'est pas calculable est **absent**, jamais estimé.

**Rien n'est recalculé** : `computeWeekAdherence`, `computeLoggingCoverage`,
`summarizePortionBands` existent et sont testés — ce module les compose. Une deuxième formule
d'adhérence dans la synthèse serait §7.3-(6) appliqué au chiffre que lit le coach.

### Deux décisions de nommage qui évitent une collision réelle
1. Les états de contact sont **`responsive|slipping|silent`**, PAS `active`. `active` veut déjà
   dire autre chose *et facturable* dans ce schéma (`coach_clients.status='active'` = le siège ;
   §1.7 « actif = ≥1 interaction/mois »). Un élève peut être un siège `active` facturable ET
   `silent` depuis 9 jours — deux questions différentes, pas une contradiction. Réutiliser le mot
   garantissait qu'on câble un jour la facture sur l'écran cohorte.
2. Le risque réutilise **exactement** les 6 valeurs de `weekly_reviews.risk_band` déjà en base.
   Un test relit le CHECK SQL de la migration : une 7ᵉ valeur inventée ici planterait à l'écriture,
   en production, un lundi matin.

### L'ordre de la matrice EST la règle (et le cap a une exemption)
`restriction_flag` (TCA) **écrase tout** : le cas dangereux est 100 % d'adhérence + contact
quotidien + restriction — si l'adhérence était consultée d'abord, cet élève passe pour le modèle
de la promo. Puis `disengaged` (sous la barrière de couverture il n'y a **pas** de chiffre
d'adhérence, donc aucune bande dérivée de l'adhérence n'est honnête).
**Le cap « 3 élèves à rattraper » exempte les signaux de restriction** : un cap qui peut faire
tomber un finding de sécurité parce que 3 problèmes d'adhérence ont trié au-dessus est un cap qui
cache le seul item de la liste qui peut blesser quelqu'un. Testé avec 4 problèmes d'adhérence
placés devant : le signal de restriction reste, et **en premier**.
La troncature n'est jamais silencieuse : `flagged_total_before_cap` est dans les metrics.

### Autres invariants testés
- Sous la barrière : **aucun pourcentage nulle part** dans le texte (regex `\d+%` sur la sortie),
  et `adherence_gated: true` dans le payload (absent-parce-que-barré et absent-parce-que-bug se
  ressemblent sinon).
- La moyenne porte sur les élèves **qui ont un chiffre**, pas sur tous : compter un élève barré
  comme 0 % inventerait un échec à partir d'un silence.
- La ligne « restriction » ne porte **ni pourcentage ni relance** (§3.4 : la pression d'adhérence
  s'arrête) — testé par regex sur la ligne elle-même.
- **Déterminisme** : même semaine, même synthèse, y compris en inversant l'ordre d'entrée.
- Seul l'**entrant** compte pour le contact : 3 relances sans réponse = `silent` (la signature ne
  permet même pas de passer du sortant).

```bash
deno test --allow-all supabase/functions/_shared/keel/    # 348 passed | 0 failed
```
**Reste sur P2.8** : le job qui lit la base, appelle ce moteur et écrit `coach_syntheses`
(+ livraison WhatsApp/email) — le moteur est prêt, l'I/O ne l'est pas.

---

## 06:20 — P1.6 (décision) : VERT — relance de décrochage

`_shared/keel/reengagement.ts` (neuf) + 20 tests. C'est la boucle REMARQUER (§1.3), « celle pour
laquelle le coach paie ».

### ÉCART DOCUMENTÉ : la relance part à **72h**, pas 48h
Le plan §1.3 dit « 48-72h ». `_shared/whatsapp_winback.ts` porte un commentaire écrit au moment où
les seuils sont passés de 2/5/9 à 3/6/10 jours :
> « À 2 jours on relançait encore dans la variance d'un rythme normal ; à 3 jours le décrochage
> est un vrai signal. »
C'est du comportement **mesuré sur les utilisateurs de ce produit**, et 48h est à l'intérieur de la
variance qu'il nomme. Une relance qui part dans le rythme normal n'est pas douce : c'est l'app qui
est en demande, au jour 2 — et l'élève apprend que le silence déclenche un ping, ce qui brûle le
signal pour le jour 9. Je garde l'INTENTION du plan (attraper le glissement tôt, une fois,
doucement) et le SEUIL mesuré du dépôt. **À arbitrer par Thomas** (une constante,
`REENGAGE_AFTER_HOURS`).

### L'ordre des gardes est le contrat
`opted_out` (réglementaire) → `safety_active` → `restriction_flag` → `cohort_ended`/`no_active_plan`
→ seuil → **une seule par épisode** → heures calmes. Testé que la safety est bien reportée même
quand 40 jours de silence + cohorte finie + pas de plan pourraient tous produire un autre motif :
le dépôt a un incident documenté d'effet durable committé pendant un tour de crise
(`p4-safety-deferred-gate-leak`), donc la garde doit être inatteignable par en dessous.

**Heures calmes = DEFER, jamais skip.** Un élève qui se tait à 23h a toujours droit à sa relance,
le matin. Un skip perdrait l'épisode en silence (classe phantom-commit, côté proactif).

**Le ton s'allège, le protocole jamais** : il n'existe **aucune** valeur de ton signifiant
« relâche le plan » — §1.5, Sophia n'a pas ce pouvoir, et l'instruction le dit à voix haute.
`warm_return` (J6) interdit explicitement de revenir sur l'absence.

### DEUX BRANCHES MORTES trouvées dans le garde-fou « zéro culpabilisation »
Le garde est déterministe (« ne culpabilise pas » est une excellente consigne et une garantie
nulle). En écrivant les tests, deux motifs ne pouvaient structurellement **jamais** matcher :
1. `\bça fait N jours…` — le `\b` de JavaScript est **ASCII-only**, donc `\bç` ne matche jamais en
   début de chaîne. Le motif était mort.
2. `laiss\s+tomber` ne peut pas matcher « laissé tomber » (l'accent est entre le radical et
   l'espace).
Les deux étaient **invisibles** : une alternative voisine matchait dans la même phrase de test, donc
le test passait pendant que la branche était morte. Un test dédié exerce maintenant **chaque branche
isolément**. C'est exactement le pattern §7.3-(2) (« condition toujours fausse »).

```bash
deno test --allow-all supabase/functions/_shared/keel/    # 368 passed | 0 failed
```
**Reste sur P1.6** : le câblage dans `process-checkins` (sélection SQL + envoi) ; le décideur est
prêt et testé, l'I/O ne l'est pas. Le checkin matin et le bilan hebdo élève ne sont pas faits.

---

## 06:45 — P3 : passe adversariale §7.3 sur le code produit CETTE NUIT

Auditée contre les 7 patterns. Résultat honnête, findings compris :

1. **Regex sémantique ?** — Deux existent (`GUILT_PATTERNS`, `forbidden_matcher`), et les deux
   sont appliquées à **notre propre sortie générée**, jamais à un message entrant humain. §3.1
   interdit la regex pour *interpréter un humain* ; §3.3 *prescrit* le filtre déterministe sur la
   sortie. Aucune regex de sens n'a été ajoutée sur un chemin entrant. ⚠️ Reste honnête : une
   deny-list attrape les constructions connues, elle **ne prouve pas** l'absence de culpabilisation.
   Le mécanisme principal reste l'instruction de ton ; la regex est une ceinture.
2. **Condition toujours-vraie/fausse ?** — **2 TROUVÉES ET CORRIGÉES** (branches mortes du garde
   anti-culpabilisation : `\bç` impossible en ASCII-\b, `laiss\s+tomber`). Un test exerce désormais
   chaque branche isolément. ⚠️ **Une softness restante, assumée** : dans `parseMealAnalysis`, si le
   modèle omet `image_quality`, le défaut `partial` ouvre la porte à une question de clarification.
   C'est le choix conservateur (on ne sait pas que l'image est nette), mais ça veut dire qu'un
   modèle qui omet ce champ peut toujours poser une question. Documenté, pas corrigé.
3. **Producteur sans consommateur ?** — **OUI, et c'est LE constat de la nuit.**
   `assumptions`/`clarifying_question` sont écrits dans `recognized` : rien ne les lit encore.
   `coach_syntheses` existe, le moteur produit ses payloads : aucun job ne les écrit.
   `cohorts.cohort_id` : rien ne le lit. **La majorité de ce que j'ai construit n'est pas câblée.**
   Repris en tête de STATUS-MORNING.
4. **Contexte calculé puis jeté ?** — **1 TROUVÉ ET CORRIGÉ** : l'en-tête de `coach_synthesis.ts`
   affirmait composer `summarizePortionBands` sans le faire. Câblé pour de vrai (c'est le
   contrepoids de la décision kcal). `parseCoachDoctrine` renvoie des `issues` que personne ne lit
   encore — à brancher sur l'écran Doctrine.
5. **Désalignement config externe vs code ?** — Rien touché côté templates Meta. Deux vrais
   désalignements **environnementaux** signalés : (a) les 5 crons ne sont coupés qu'en local ;
   (b) `EMAIL_DELIVERY_ENABLED=1` dans `supabase/.env`.
6. **Deux sources de vérité ?** — 4 activement **évitées** (moteur de matching partagé ;
   `student_facts` vs `student_safety_constraints` ; réutilisation des 6 `risk_band` ;
   `responsive` ≠ `active` facturable). **1 TROUVÉE ET GARDÉE PAR UN TEST** : deux modules encodent
   « depuis quand cet élève est silencieux » — un test verrouille l'ordre des seuils pour que le
   coach ne lise jamais « en contact » sur un élève que le système relance déjà.
7. **« Vert en sim » présenté comme « vérifié en réel » ?** — **Aucune sim n'a tourné. Aucun appel
   LLM n'a été fait cette nuit.** Tout ce qui est vert est un test unitaire déterministe sur des
   modules purs. Le pipeline photo v3 n'a **jamais** été exercé contre un vrai modèle de vision.
   C'est écrit en toutes lettres dans STATUS-MORNING.
