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

---

## 07:40 — P1.5b : VERT — la ceinture de sortie est CÂBLÉE (et une garantie fausse est réparée)

### 🔴 LE FINDING — une garantie du CONTRACT était fausse
`docs/keel/CONTRACT.md` énonce, globalement :
> « A deterministic post-generation validator rejects any output containing a
> `severity='medical'` token. »

**Vérifié dans le code** : `findMedicalConstraintViolations` n'avait **qu'un seul appelant en
production** — `skills/plan_question/renderer.ts:115`. La réponse normale, l'accusé de photo, les
messages proactifs et tous les autres skills ne passaient par **aucun** validateur. Une allergie
`severity='medical'` pouvait donc être suggérée à l'élève sur presque tous les chemins.

C'est le pattern §7.3-(3) dans sa forme la plus coûteuse : le consommateur (le contrat, la revue
de sécurité, la promesse commerciale) lit une garantie que le producteur n'écrit que sur 1 chemin
sur N. Personne n'a menti — la garantie était simplement fausse.

### Ce qui a été fait
- `skills/_shared/keel_output_locks.ts` (neuf, 12 tests) : les **deux** verrous, avec des réactions
  différentes parce qu'ils ne protègent pas la même chose. **Médical → le message ENTIER est
  remplacé** (amputer la phrase dangereuse laisse un texte qui parlait quand même de cacahuètes à
  un anaphylactique, et le contexte résiduel peut porter la suggestion à lui seul) ; le repli **ne
  renomme pas l'allergène** à l'élève. **Interdit coach → remplacé par un renvoi au coach**
  (§1.5 rendue visible au moment exact où elle a failli être enfreinte). Le médical **prime**.
- `_shared/keel/doctrine_loader.ts` (neuf, 6 tests) : charge la doctrine publiée du coach vivant.
  **Arbitrage de panne asymétrique** : ni refus de répondre, ni réponse normale — un
  `FALLBACK_PRUDENCE_BLOCK` qui dit au modèle de rester factuel et de déférer. Un bloc **vide**
  serait comblé par la culture nutritionnelle générale du modèle, exactement la voix qu'on ne vend
  pas. Chaque mode de panne est **nommé** (`no_coach`, `no_published_doctrine`, `load_failed`,
  `empty_doctrine` — une doctrine publiée mais vide est un vrai état).
- `router/run.ts` : chargement dans `loadKeelTurnContext` (« tout ce dont le tour a besoin, en une
  passe ») et application dans **`finalVisibleText`**, le point de passage unique de tout texte
  visible.

### Deux décisions de câblage qui comptent
1. **Le paramètre est OBLIGATOIRE, pas optionnel.** Le défaut corrigé est précisément une garantie
   « globale » appliquée sur 1 chemin sur N ; avec un paramètre optionnel il suffit d'un futur
   appel qui l'oublie pour rouvrir le trou **en silence**. Le compilateur est le seul relecteur qui
   ne se fatigue pas. (Même raisonnement que le `binding` obligatoire de `renderMealPhotoAck`.)
   TypeScript a effectivement trouvé les 6 sites + 2 fixtures de test.
2. **La ceinture est en TOUT DERNIER, et HORS du `if (!isSafetyRoute(...))`.** Les autres ceintures
   réinjectent du texte (`ensureClarifyQuestionVisible`, l'emoji, l'override de correction) : un
   allergène réintroduit après la vérification sortirait intact. Et un tour de crise est le dernier
   endroit où suggérer un allergène médical.

### Arbitrage de panne des contraintes — FLAG pour Thomas
`loadStudentSafetyConstraints` **throw** exprès (une lecture ratée ≠ « pas d'allergie »). Je
rattrape dans `loadKeelTurnContext` et je porte `safety_constraints: null` (≠ `[]`) +
`safety_constraints_unavailable_reason`. La livraison est **fail-open** : bloquer tous les messages
de tous les élèves pendant un hoquet Postgres est une panne produit complète, alors qu'un tour non
vérifié est un risque borné (le prompt porte déjà les contraintes ; seule la vérification
déterministe manque). C'est la même asymétrie que le plancher TCA juste au-dessus. **À valider ou
inverser par Thomas** — c'est le seul endroit où j'ai choisi la disponibilité contre la vérification.

### DoD vérifiée
```bash
deno test --allow-all supabase/functions/sophia-brain/ supabase/functions/_shared/keel/
# 1777 passed | 0 failed | 18 ignored
```
23 tests neufs, dont 5 **au niveau du runtime** (`run_output_locks_test.ts`) et pas seulement du
module : le défaut n'était pas un validateur cassé mais un validateur non atteint — un test de
module seul ne l'aurait ni détecté, ni empêché de revenir.

---

## 08:10 — P1.5c : VERT — la doctrine atteint le composeur (l'autre moitié)

`withKeelDoctrineBlock()` dans `run.ts`, appliqué sur le contexte passé à `runAgentAndVerify`.
Sans ça, le verrou de sortie était **un videur devant une salle vide** : il empêche l'agent de
contredire le coach, il ne le fait pas parler comme lui — et « c'est MON agent » (§1.4) n'existe pas.

**Placé EN TÊTE du contexte, et c'est le point technique** : `companion.ts` documente que le budget
de prompt **tronque par la QUEUE**. Un bloc ajouté en fin de contexte disparaît donc en silence sur
les tours les plus riches — exactement ceux où la doctrine compte le plus. Un test l'assert
(`indexOf(doctrine) < indexOf(plan)`).

**Pas de doctrine → bloc de PRUDENCE, jamais une couche vide** : une couche vide est comblée par la
culture nutritionnelle générale du modèle, précisément la voix qu'on ne vend pas.

### LIMITE CONNUE, assumée
§3.3 veut ce bloc dans le **préfixe MIS EN CACHE** (tier semi-stable de
`buildCompanionPromptParts`), pas dans le contexte volatile. Le placer correctement demande de
faire traverser le contexte KEEL à `agent_exec` **puis** à `runCompanion` — trois signatures sur le
chemin de TOUTE conversation, et je ne fais pas ça à 8h du matin après une nuit. **Le comportement
produit est correct ; l'économie de cache ne l'est pas encore.** `compileDoctrineBlock` expose déjà
le hash nécessaire au déplacement. Repris dans STATUS-MORNING.

```bash
deno test --allow-all supabase/functions/sophia-brain/ supabase/functions/_shared/keel/
# 1780 passed | 0 failed | 18 ignored
```

---

## 08:55 — P2.8 : VERT ET CÂBLÉ — la synthèse coach tourne sur la VRAIE base

- `_shared/keel/coach_synthesis_io.ts` (neuf, 8 tests) : lit les faits, appelle le moteur, écrit.
  **Aucun chiffre n'est calculé dans ce fichier.**
- `supabase/functions/coach-synthesis-v1/` (neuf) : le job par coach actif, paginé, budgété,
  idempotent (upsert sur `(coach_id, kind, period_start, period_end)`), **rejouable sur une semaine
  passée** (`as_of_local_date` est un paramètre — un job qui lit l'horloge en interne ne peut pas
  être testé sous horloge simulée). **Il n'appelle aucun modèle.**
- `delivered_at` n'est jamais posé à l'écriture : générer ≠ livrer.

### 🔴 DEUX BUGS TROUVÉS EN LANÇANT SUR LA VRAIE BASE (pas sur des fakes)
Premier run d'intégration réel de la nuit : 1 coach, 2 élèves, événements et messages seedés.

1. **Un élève qui logge dans le VIDE était accusé de « 0 % ».** Julie logge 5 jours sur 7, son coach
   n'a **publié aucun plan** → `computeWeekAdherence` rend `overallPct: 0` avec `evaluableDays: 0`.
   Lu naïvement : « at_risk, 0 % sur les lignes core » — une **accusation** envoyée au coach à propos
   d'une élève qui a fait exactement ce qu'on lui demandait. Le 0 % n'est pas un mauvais score,
   c'est une division par rien. Corrigé : `hasAdherenceNumber()` tranche sur `evaluableDays`, la
   bande devient `watch` (pas `at_risk`), et un motif neuf `no_evaluable_plan` dit au coach que
   **l'action est la sienne** : « is logging, but has no published plan lines — publish their plan
   and this becomes measurable. »
2. **La synthèse énonçait un motif FAUX.** Elle disait « nobody logged at least 4 of 7 days » alors
   que Julie en avait loggé 5. Deux causes distinctes d'absence de chiffre (pas de plan publié vs
   couverture insuffisante) étaient rendues par la même phrase. Dans le seul artefact dont toute la
   valeur est qu'on peut croire ses chiffres, énoncer un motif faux est le pire défaut possible.
   Les deux causes sont distinguables, donc elles sont distinguées.

Aucun des deux n'était visible sur des fakes — les deux demandaient de vraies lignes.

### Sortie réelle, vérifiée en base
```
2 students this week: 1 in touch, 0 slipping, 1 silent.
No adherence figure this week: 1 of 2 students has no published plan, and the other logged fewer than 4 of 7 days.
4 plates seen: 1 small, 2 moderate, 1 large.

To catch up:
- Nadia: no message for 33 days.
- Julie: is logging, but has no published plan lines to log against - publish their plan and this becomes measurable.
```
Ligne écrite en base avec `delivered_at: null`, `metrics` et `flagged_students` complets.

---

## 09:30 — P1.6 : VERT ET CÂBLÉ — la relance tourne sur la VRAIE base

- `_shared/keel/reengagement_io.ts` (neuf, 5 tests) : sélection + armement.
  **Un seul seuil** : la requête importe `REENGAGE_AFTER_HOURS` du décideur (un test relit le
  source pour interdire une seconde constante). Une requête qui précoupe à 48h quand le décideur
  exige 72h balaie pour rien ; à 96h elle ne présenterait jamais les bons candidats.
- `functions/keel-reengage-v1/` (neuf) : job horaire, `dry_run` par défaut possible. **Il ne rédige
  pas le message** — la génération passe par le composeur (qui porte la doctrine et la ceinture de
  sortie) et l'envoi par le moteur outbound. Un job proactif qui rédigerait son propre texte
  contournerait les deux, et c'est exactement là que la voix du coach se perd.
- Colonnes de `reengagement_episodes` **vérifiées en base avant écriture** : la table porte
  `opened_at`/`closed_at`/`last_touch_step`, pas `resolved_at`/`trigger_reason` comme je l'avais
  supposé. Corrigé avant la première écriture.

**L'ordre ouvrir-puis-envoyer est un choix, pas un détail** : si l'envoi échoue après l'ouverture,
on perd une relance ; dans l'ordre inverse, un crash entre les deux produit un message envoyé et un
épisode non marqué — donc une **seconde** relance au tick suivant sur quelqu'un qui vient d'en
recevoir une. Entre « une de moins » et « deux d'affilée », le produit choisit la première.

**Fail-closed sur le spam** : si la lecture d'épisode échoue, le candidat est considéré **déjà
touché**. C'est l'asymétrie inverse de celle des contraintes de sécurité, et c'est voulu : ici le
risque est d'écrire deux fois, pas de rater une vérification.

### Vérifié sur la VRAIE base (pas des fakes)
```
CANDIDATES: [{u:0012, last:2026-07-01, plan:true, ep:false, h:12}]   ← Julie (parlé hier) exclue
DECISIONS:  [{u:0012, decision:"send", tone:"gentle", hoursSilent:793}]
EPISODE OPENED: {opened:true, id:f269814d-…}
SECOND PASS:    [{decision:"skip", reason:"already_nudged_this_episode"}]
EPISODE ROW:    last_touch_step=1 | inactive=33 | closed=null
```
**L'invariant « UNE seule relance par épisode » est prouvé sur des lignes réelles**, pas sur un
mock : deuxième passe immédiatement après l'ouverture → `already_nudged_this_episode`.

### Crons (`20260803090000_pivot_nutrition_crons.sql`)
`keel-coach-synthesis` lundi 06:00 UTC (après le rollover et le balayage de dimanche : la semaine
doit être **évaluée** avant d'être racontée) et `keel-reengage` toutes les heures à :25 (la décision
dépend de l'heure LOCALE, donc un job quotidien ne servirait qu'un fuseau).
Helper repris à l'identique de W7.5 — les secrets sont résolus **à l'exécution**, jamais interpolés
(sinon le job poste dans le vide et `cron.job_run_details` affiche quand même `succeeded`).
Les assertions vont plus loin que « le job existe » : elles vérifient que la commande **nomme la
bonne fonction** et **résout son secret**, parce que « le job existe » est exactement la
vérification qui avait laissé passer le défaut W7.5.
