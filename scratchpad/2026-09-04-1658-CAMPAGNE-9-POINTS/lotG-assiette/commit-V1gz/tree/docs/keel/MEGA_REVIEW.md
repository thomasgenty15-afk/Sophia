# KEEL — REVIEW ADVERSARIALE FINALE

*Racine du dépôt : `/Users/ahmedamara/Dev/Sophia 2` (branche `Nutrition`). Tous les chemins ci-dessous sont à préfixer par cette racine. Méthode : 6 lentilles de lecture du code réel, puis vérification adversariale par exécution (SQL sur la base locale, curl sur la stack 54321, sondes `deno run` contre les modules réels, `cron.job` lu en base). Les findings réfutés à la vérification ne figurent pas dans ce rapport.*

---

## 1. VERDICT EN 5 LIGNES

Le socle est **meilleur que ce qu'une nuit produit d'habitude** — modèle de données à 4 axes cohérent, tenancy pensée, modules purs testés (2396 tests verts, tsc 0) — mais **le produit ne fonctionne pas de bout en bout** : `evaluate-adherence-v1` n'a **aucun appelant** (ni cron, ni trigger, ni client, ni brain), donc le balayage de 23h55 note `missed` chaque ligne que l'élève a réellement tenue.
**Démontrable ?** Oui, jusqu'à l'étape 7 sur 12 : signup coach → import → publication → invitation → `/app/today` → clic « Log it ». **Le lendemain matin, la ligne affiche `Missed`.** C'est exactement le périmètre que l'EXECUTION_LOG a observé — en appelant l'évaluateur à la main en curl entre le log et la relecture.
**Déployable ?** Non. Deux trous de sécurité BLOQUANTS et exploitables depuis un navigateur : les vues Tier B sont écrivables (destruction et **forge** de faits, any-authenticated → any-user), et `invoke_internal_edge_function` est exécutable par `anon`.
**Pour un premier élève réel, il manque :** brancher l'évaluateur, révoquer 2 ACL, écrire un producteur de `weekly_reviews`, filtrer le bouton sur `polarity='avoid'`, et faire parler l'IA en anglais.
Le travail restant est du **câblage**, pas de la conception. C'est la bonne nouvelle, et elle est réelle.

---

## 2. CE QUI TIENT

Vérifié à charge, pas sur parole.

**Le modèle de données.** Parité exacte des 16 vocabulaires `tokens.ts` ↔ CHECK SQL, valeur par valeur, dans les deux sens (`supabase/functions/_shared/keel/tokens.ts:169-194` vs `supabase/migrations/20260727090000_keel_p0_commitments.sql`). Les 3 CHECK de cohérence rejettent réellement : sur un import LLM réel, 4 lignes fausses que le parseur avait laissé passer avec confidence 0,99 ont été bloquées à l'INSERT. L'index unique fonctionnel `coalesce(slot_key,'no_slot')` est le bon outil et ses deux écrivains l'honorent correctement.

**Zéro compteur incrémental.** `information_schema.columns` sur les 9 tables KEEL : une seule colonne « count », un booléen. Aucun `+= 1`, aucun UPDATE incrémental. La classe de bug `current_reps` est structurellement exclue. `protocol_events` est append-only, le sweep écrit `cancelled` et jamais `delete`.

**Le gate d'affichage 4/7 n'a aucun contournement.** J'ai suivi les 7 chemins qui pourraient imprimer un pourcentage. L'union discriminée `{kind:"insufficient_data"} | {kind:"adherence", overallPct}` n'a pas de champ à omettre dans la variante de refus (`_shared/keel/adherence.ts:254-308`, `frontend/src/keel/api/progressModel.ts:92-121`). `grep adherence` sur `render.ts`, `slot_reminders.ts`, `provision_day.ts` : zéro occurrence — les rappels ne peuvent pas fuiter un score.

**Le plancher safety a un vrai point d'étranglement unique.** Les 3 seuls producteurs de `TurnFrame` (`router/run.ts:2836, 3858, 4504`) passent tous par `buildTurnFrameForRuntime`, qui applique `applySafetyFloorToTurnFrame` inconditionnellement. Clamp `max(llm, pregate)` idempotent. Je n'ai pas trouvé de chemin qui construise un frame ailleurs.

**L'ordre gate → exécution est respecté** sur le chemin nominal, avec deux portes default-deny du même verrou. Le write-through est réel dans les deux exécuteurs (`missing_readback_row` / `readback_mismatch`), et `db.ts` gère le 23505 par un SELECT explicite plutôt que de fabriquer un commit.

**La chaîne d'invitation est cryptographiquement correcte.** 32 octets CSPRNG, sha256 stocké seul, index UNIQUE, `FOR UPDATE` comme mutex, `unique_violation` rattrapée. La double acceptation concurrente ne peut pas produire deux liens. Le correctif D3 (révoquer son consentement enfermait l'élève chez son ex-coach) est une vraie trouvaille, corrigée au bon endroit.

**Le storage est fermé.** 3 buckets `public=false`, `pg_policies where schemaname='storage'` vide, un seul `createSignedUrl` dans tout le dépôt (TTL 15 min, chemin dérivé de l'utilisateur). `meal-photo-upload-v1` refuse un `user_id` du body et vérifie que les octets correspondent au MIME déclaré.

**La démolition W2 est réelle et propre.** 73 → 60 fonctions, −53 k lignes, `tsc --noEmit` 0 erreur, `deno test` 2396/0, vitest 60/0 (exécutés). Aucun import cassé vers les 18 fonctions supprimées. `activateDueWeekItemsForUser` a bien été relogé sur un cron actif **avant** la suppression de son appelant.

**Le câblage frontend est complet** : les 25 fichiers de `frontend/src/keel/` ont chacun un appelant de production, vérifié un par un. Le mode d'échec « le composant existe, personne ne le monte » a été soldé côté UI.

**L'honnêteté documentaire.** `publish.ts:33`, `provision_day.ts`, `EXECUTION_LOG.md` (D6/D7) signalent leurs propres défauts. C'est ce qui a rendu cet audit rapide — un dépôt qui ne s'écrit pas comme ça ne se laisse pas auditer en une session.

---

## 3. CE QUI VA CASSER

### BLOQUANT — rien ne doit partir avant

**B1. L'évaluateur n'est jamais appelé. Tout élève conforme est noté `missed`.**
`supabase/functions/evaluate-adherence-v1/index.ts` · `supabase/migrations/20260727175000_keel_provisioning.sql:145-217`
`grep evaluate-adherence` sur tout le dépôt : uniquement des commentaires, `config.toml`, et un import **de type** (`router/run.ts:248`). `select jobname from cron.job where command ilike '%evaluate-adherence%'` → 0 ligne. `pg_trigger` sur `protocol_events` → 0 ligne non-interne. Le corps de `keel_sweep_day_evaluations` ne référence **jamais** `protocol_events` : son CTE cible ne joint que `commitment_evaluations × plan_commitments × planned_deviations`.
**Scénario :** 00h05 le provisioning sème `unknown`. 09h00 l'élève tape « Log it » sur Vitamin D3 → ligne `protocol_events` parfaite avec `recognized.commitment_id`. 23h55 le sweep passe tout `unknown` → `missed`, `observed_value` NULL, `resolved_by='system'`.
**Preuve indépendante :** dans ta base locale, l'élève `bbbb…57d7` au 2026-07-27 porte 2 lignes `met` avec `resolved_at` à la **milliseconde** (timestamp JS = le curl manuel) et 2 lignes `missed` à la **microseconde** (`now()` SQL = le sweep). L'évaluateur n'a jamais tourné autrement qu'à la main, dans ta propre base e2e.
**Portée sous-estimée :** la couche dérivée sans faits affame aussi `_shared/keel/adherence.ts` (adhérence ≈ 0), `sophia-brain/context/keel_plan_context.ts:639` (**le LLM reçoit « l'élève a tout raté » et va le confronter**) et `restriction_runtime.ts:211` qui lit `observed_value` pour le garde-fou énergie/restriction.

**B2. Les vues Tier B sont écrivables — le coach n'est pas read-only, et n'importe quel compte peut FORGER des faits.**
`supabase/migrations/20260727120000_keel_tenancy.sql:333-341` (révocation faite sur les tables) vs `:507-510` (seul `anon` révoqué sur les vues)
Les deux vues sont `owned by postgres` (rolbypassrls), `security_invoker=off`, `relacl = {…, authenticated=arwdDxtm, …}` — les seules vues de `public` dans ce cas. Auto-updatable, sans `WITH CHECK OPTION`, aucune policy UPDATE/DELETE ni trigger derrière `protocol_events`.
**Reproduit en HTTP réel via Kong**, JWT coach : `PATCH /rest/v1/coach_student_events?user_id=eq.<élève> {"quantity":999}` → 200, 4 faits réécrits. `DELETE` → 204, table à 0. **Escalade non vue en première passe :** l'INSERT n'est filtré par rien — testé **en tant qu'élève** (dont `coached_student_ids()` est vide) : `INSERT 0 1`, événement forgé sur un autre utilisateur. Pour la forge, l'exposition est **any-authenticated → any-user, à l'échelle plateforme**.
`supabase/tests/keel/tenancy_rls_test.sql:290-293` affirme « coach insert into protocol_events was blocked » : vrai sur la table de base, **faux à travers la vue livrée par la même migration**. Aucun test du dépôt n'émet un seul DML contre ces vues.

**B3. `invoke_internal_edge_function` est exécutable par `anon` — bypass complet de `ensureInternalRequest` sur 28 fonctions.**
`supabase/migrations/20260706160000_recover_lifecycle_on_tier_upgrade.sql:19` (origine, pré-KEEL) · conservée par `20260727160000_keel_week_rollover.sql:128-129`
`proacl` inclut `anon=X`, `prosecdef=t`, aucun `revoke` nulle part — alors que le projet applique ce pattern à 12+ autres fonctions SECURITY DEFINER. **POST avec la seule clé publishable anon → HTTP 204.** `_shared/internal-auth.ts` ne vérifie **que** l'en-tête `x-internal-secret`.
**Pire que décrit :** `provision-day-v1` accepte `ignore_timezone_gate:true` → `{"mode":"sweep","ignore_timezone_gate":true}` force la clôture de journée **fleet-wide sans connaître un seul UUID**. Idem `whatsapp-send` (message arbitraire à n'importe quel `user_id`), `trigger-*-batch` (brûlure de coût LLM).
**Circonstance atténuante qui est en fait un cadeau :** `pg_proc.prosrc ilike '%invoke_internal_edge_function%'` → seule elle-même ; `cron.job` → 0 ligne. La migration KEEL a supprimé ses derniers appelants. **C'est une primitive morte, sans usage légitime. Le correctif est un `revoke`/`drop` d'une ligne.**

**B4. `contract_change_requests` : canal d'escalade IA → coach en écriture seule.**
`skills/plan_question/escalation.ts:5` · `_shared/keel/restriction_runtime.ts:377` · `grep contract_change_requests frontend/src` → **0 occurrence**
L'élève demande un swap hors policy → ligne `pending` écrite. Le coach ouvre `/coach` puis `/coach/clients/:id` : rien, jamais. Pire : quand le plancher TCA se lève, `escalateRestrictionSignal` écrit son `urgency='immediate'` **dans la même table**. Et `plan_question/renderer.ts` (DENY_TEXT) dit à l'élève « It is flagged to your coach right now so they can look at it straight away ». **C'est faux.** Le produit affirme à un élève potentiellement en danger qu'un humain a été alerté, alors qu'aucun humain ne peut l'être.

**B5. `weekly_reviews` n'a aucun écrivain — aucune adhérence n'est jamais affichée.**
`grep -icE "insert|upsert"` sur `weekly_reviews` → **0**. Trois lecteurs seulement : `keelClient.ts:192`, `CoachStudentPage.tsx:221`, `restriction_runtime.ts:150`.
Un élève qui logge 6/7 pendant 4 semaines voit « Insufficient data » à vie sur `/app/progress`, et le coach la même chose. `computeWeekAdherence` n'a **aucun appelant de production** : la formule ne tourne que dans ses tests. En cascade : `risk_band` jamais calculé (les 6 libellés `coach.dashboard.risk.*` sont morts), et 2 des 4 déclencheurs TCA (`rapid_weight_loss`, `overclaimed_adherence`) lisent une table vide.

**B6. Rappels, digest et plancher TCA proactif sont derrière l'opt-in WhatsApp et l'abonnement B2C legacy.**
`schedule-whatsapp-v2-checkins/index.ts:417` (`whatsapp_opted_in`, DEFAULT false), `:480` (`access_tier`, DEFAULT `'none'`), `:508` (`provisionKeelDayForUser`)
L'élève invité par son coach, qui utilise l'app web, est éjecté ~90 lignes avant le provisioning KEEL : zéro rappel, zéro digest, et le plancher TCA proactif — seul chemin qui coupe les nudges **et** écrit l'escalade coach — n'est jamais évalué pour lui. Deuxième gate au jour 15 quand le trial bascule. **Dans KEEL, c'est le coach qui paie le siège.** Le produit fait dépendre l'exécution du protocole de l'abonnement du produit qu'on vient de supprimer. Arbitrage n°3 du BUILD_PLAN (« rien de WhatsApp-only ») violé.

### GRAVE — casse au premier élève réel

**G1. Le bouton « Log it » sur une ligne `polarity='avoid'` INVERSE la note.**
`frontend/src/keel/components/CommitmentLine.tsx:33` (`const canLog = !line.isAutoSourced;` — aucune branche de polarité dans **tout** le front) + `_shared/keel/evaluator.ts:419` (branche liage explicite, sans garde de polarité) + `:899`
Sonde exécutée sur la ligne réelle de ta base (`0a2cdfc5…`, alcohol, `priority=core`) : *sans tap → `met` ; avec tap → `missed`*. Le tap porte `quantity=0` et est quand même noté `missed`. **Deux aggravations :** la ligne est `evaluation_grain='week'` → un seul tap fait passer la ligne core de **toute la semaine** à `missed` ; et `protocol_events` n'a **pas de policy DELETE** (`20260727090000:726-728`) → l'élève ne peut pas rétracter, seul `service_role` le peut. Le sweep ne répare rien (il ne touche que les `unknown`). Correctif : une ligne.

**G2. Un fait loggé par CHAT ne peut matcher aucune ligne sans `substance_ref` ni `food_group_ref`.**
`sophia-brain/tools/always_on/log_protocol_event/contract.ts:62-77` + `db.ts:57-72` · `evaluator.ts:478`
`grep recognized supabase/functions/sophia-brain/` → **zéro**. Les seuls écrivains de `recognized.commitment_id` sont le tap (`keelClient.ts:267`) et la photo (`meal-photo-upload-v1:420`). `matchEvent` n'a que 4 branches (liage, `substance_ref`, `avoid+substance_ref`, `food_group_ref`) — aucune sur le slot, aucun fallback → `return null`.
Sonde sur la ligne réelle « 10 minutes of daylight exposure » : *chat → `missed`, 0 match ; tap → `met`*. `SUBSTANCE_REFS` est un registre de molécules : aucun slug ne peut porter lumière, zone 2, coucher, pas, respiration. **Les 6 `activity_class` non-nutrition sont structurellement inloggables par conversation** — et le renderer répond quand même « Recorded for <date>. ». La preuve W4.7 portait sur la seule famille qui marche.

**G3. La lane KEEL n'est jamais ré-exécutée après une sortie de flow local — perte silencieuse d'écriture.**
`router/run.ts:3686` (appel unique, **hors** de la boucle `visibleOwnerDispatch` de 3746) vs `:3750` / `:3800` (ré-exécutions reminder + track)
Sous flow local, `buildNeutralTurnFrame` code en dur `direct_effects: []` → la lane pré-boucle sort en `null`. À la sortie (`exit_to_global`), le frame est rebâti, `log_protocol_event` entre dans `direct_effects_to_run`… et rien ne l'exécute. Chemin atteignable en **2 tours**, documenté par le flow lui-même : `coaching_recommendation/local_flow.ts:3211` ordonne la sortie précisément sur « c'est fait / j'ai fait X ». Pas de phantom-commit (le composeur est informé), mais l'écriture centrale du produit est perdue **sans que l'élève en soit averti**. Zéro test sur ce chemin.

**G4. Plancher TCA : le latch `closed` n'a ni TTL ni invalidation.**
`router/run.ts:1345-1347` (`restrictionEpisodeKey` = tri des codes, sans date) · `:1394-1410` · `active_flow_state.ts:197-201` (la clé KEEL n'est dans aucune liste de purge ; `updated_at` est **écrit et jamais relu**)
Sonde : latch posé le 27/04, même déclencheur `compensatory_language` trois mois plus tard → `conversationalRestrictionGuardForRouters` renvoie `null`, le tour part en `normal_reply`. **Seconde manifestation trouvée :** un épisode *abandonné* (`turn_count:5`, jamais clos) fait que le nouvel épisode ouvre directement sur `status:"exit"`, `max_turns_reached`, `resources_delivered:false` — l'élève reçoit une clôture sèche au premier tour au lieu des ressources TCA. Atténuation honnête : les surfaces proactives restent suspendues (re-évaluées en DB chaque jour) et le coach reste alerté. Ce qui est perdu, c'est le canal clinique conversationnel.

**G5. `plan-import-v1` : endpoint LLM sans authentification, rate-limit GLOBAL à la plateforme.**
`supabase/functions/plan-import-v1/index.ts:217-229` · `supabase/config.toml:446` (`verify_jwt=false`, avec le TODO d'aveu « Auth in-function once coach accounts exist (P3) » — ils existent)
Aucune occurrence de `auth`/`getUser` dans les 335 lignes. `enforceCors` retourne `null` sans en-tête Origin, par conception. La clé est la **constante** `"plan-import-v1"` — seul des 21 call sites sans identifiant. **Reproduit :** POST sans apikey → 200 en 2,9 s avec résultat Gemini réel ; 7 POST depuis 7 IP distinctes → `200,200,200,200,429,429,429`. La contrainte mordante n'est pas 20/jour mais **5 par 10 minutes pour toute la flotte** : trois coachs important deux plans chacun se 429 mutuellement, sans attaquant. `PlanImportPage.tsx:544` n'envoie que l'ANON_KEY, jamais la session — il n'existe même pas d'identité exploitable aujourd'hui.

**G6. `student_safety_constraints` n'a aucun écrivain, et le validateur médical ne couvre qu'une lane sur huit.**
`_shared/keel/safety_constraints.ts:130` (seul accès, un SELECT) · `plan_question/renderer.ts:115` (seul appel de `findMedicalConstraintViolations`) · `safety_constraints.ts:256` (`assertNoMedicalConstraintViolation`, **0 appelant**)
Aucune surface n'enregistre une allergie : pas d'intake élève, pas de formulaire coach, pas d'écriture depuis l'import. La ceinture W3.3 est armée sur un magasin vide. Et même remplie, un élève cœliaque qui demande « qu'est-ce que je prends au petit-déj ? » est routé `normal_reply` par un classifieur stochastique → aucun contrôle. **L'exception de négation est trop large** : « Yes, you can eat tree nuts » est bloqué, mais « There is no reason to avoid tree nuts » **passe** (`safety_constraints.ts:226-231`) — les deux formulations les plus naturelles d'une permission LLM.

**G7. Le correctif crise de W4 est lui-même inerte.**
`_shared/keel/crisis_resources.ts:272` (`crisisCountryForProfile`, 0 appelant), `:~360` (`fetchCrisisResources`, 0 appelant)
`JoinPage.tsx:172` force `locale:'en-US'` pour tout élève. Les 3 sites vivants importent `crisisCountryFromLocale`. Un élève britannique en idéation suicidaire reçoit **988/911** — numéros inexistants au Royaume-Uni — alors que `profiles.country` dit 'GB'. La table `crisis_resources` (23 lignes seedées) n'est lue par aucun runtime : corriger un numéro en base ne change rien.

**G8. La conversation répond en français, avec le persona du produit supprimé.**
`agents/companion.ts:628` (« Tu es Sophia, partenaire conversationnelle lucide, chaleureuse… ») · `_shared/keel/locale.ts:26` et `:56` (`buildResponseLanguageBlock`, 0 appelant) · `dispatcher.prompts.ts` intégralement français
App 100 % anglaise (`i18n/t.ts` : « Pilot: English only »), `render.ts` **throw** sur toute autre locale, coach anglophone — et l'IA répond en français en se présentant comme un autre produit. R3 du CONTRACT (`conversation_locale` persistée) n'existe qu'en commentaires : aucune colonne.

**G9. Fuite inter-coachs : les policies Tier A ne scopent que l'élève.**
`20260727120000_keel_tenancy.sql:372-395`
Sam quitte le coach A, accepte l'invitation de B. B fait `GET /rest/v1/plan_commitments?select=*` → protocole verbatim de A, `student_instruction`, `source_span` (page + citation + bbox du PDF de A), toutes les versions supersédées, les évaluations de la période A. Prédicat : `user_id = any(coached_student_ids())`, jamais `and coach_id = …`. La PI du coach A passe à un concurrent, sans trace.

**G10. `polarity='avoid'` ignore le comparateur numérique et le slot.**
`evaluator.ts:899-904` · `:773` + `:413-479`
« Pas plus de 3 cafés/jour » (avoid + `target_max=3`) : le premier café loggé → `missed`, `target_max` jamais lu. Toute la classe « X maximum » est ininstanciable. « Pas de glucides le soir » (avoid + `slot='dinner'`, seul encodage possible car le CHECK `avoid_grain` interdit le grain occasion) : des flocons d'avoine au **petit-déjeuner** → `missed`.

**G11. L'adhérence rend `0 %` — pas `insufficient_data` — quand rien n'est évaluable.**
`_shared/keel/adherence.ts:281-284` (`evaluable.length > 0 ? … : 0`)
Élève en vacances qui déclare **à l'avance** 7 déviations — le comportement exemplaire que le contrat récompense. Tout sort `not_applicable`, la porte 4/7 s'ouvre (il logge ses repas), le coach lit **0 %** sur la semaine la mieux gérée.

**G12. Une déviation d'un jour annule toute la semaine hebdomadaire.**
`evaluator.ts:684-692` + `:789-796` (`evaluateWeekGrain` passe `weekStartDate` comme `localDate`)
Restaurant déclaré le lundi → `deviationCovers` compare date+slot → couvre la ligne **hebdomadaire** « poisson gras 3×/semaine » → `not_applicable` pour la semaine entière. Idem « zéro alcool ».

**G13. Trois quarts des combinaisons ne sont résolues par aucun chemin déployé.**
Sur le plan réel publié en local (6 lignes) : 3 `nominal/occasion` semées puis balayées `missed` ; 2 `grain=week` **jamais** semées ni balayées ; 1 `grain=day, slot_kind NULL` idem (`20260727175000:78` et `:183` filtrent `slot_kind='nominal'`). **Zéro ligne sur six ne peut atteindre `met` depuis un fait.** Le commentaire qui justifie l'exclusion renvoie à l'évaluateur sans appelant. Le cron `keel-week-rollover-v1` (actif, 00h10) opère sur `user_plans_v2`, la table **legacy** (`keel-week-rollover-v1/index.ts:64-70`) : 0 élève KEEL concerné.

**G14. Le lundi matin du coach : une liste de noms, puis un mur de 190 lignes.**
`CoachHomePage.tsx:186-230` · `CoachStudentPage.tsx:402-430`
Par élève : un nom, une pastille de statut, une pastille de siège. **Zéro signal** — pas d'adhérence, pas de couverture, pas de risk_band, pas de « qui a besoin de vous ». La page élève rend `d.evaluations` en `<ul>` plate triée par date, sans regroupement ni résumé. Le livrable qui se vend n'existe pas.

**G15. Le coach doit taper à la main l'UUID brut de son élève pour publier.**
`PlanImportPage.tsx:467` et `:836-841` — un `<input>` monospace libre, aucun sélecteur, aucune liaison à `coach_clients`, aucune validation. Et `CoachHomePage` n'affiche jamais l'UUID (« We never fall back to the raw uuid »). Un caractère de travers → 403 `not_your_student` sans dire lequel.

**G16. Republication en milieu de semaine : la moitié de la semaine devient « Archived commitment ».**
`CoachStudentPage.tsx:475-483` (`titleOf`) · `reseed_on_publish.ts:100-107` · `evaluate-adherence-v1/index.ts:333-341` (`if (!meta) continue`)
Le coach corrige une virgule mercredi. Les évaluations lun-mar pointent vers les anciens `commitment_id`, absents de la version publiée → libellé de repli sur **chaque ligne** des deux premiers jours, et exclusion silencieuse du calcul hebdo pendant que la porte 4/7 compte les 7 jours. Le drapeau prévu (`plan_version_changed_midweek`) n'est écrit par personne.

**G17. Import LLM sur un vrai plan de 4 pages : 27 lignes, 2 signalées, 4 impubliables non signalées.**
`plan-import-v1/index.ts:151-158` (`.filter()` silencieux sur `scheduled_days`) et `:196`
(a) « Collation mar/jeu/sam » → le token « mar » throw, l'issue est enregistrée **mais le jour est retiré du tableau** : la ligne part avec `['thu','sat']` ; (b) 4 lignes violent les CHECK avec `needs_review=FALSE` et confidence 0,94-0,99 (« Jeûne 16/8 » : `between` sans borne ; « Coucher avant 23h » : `<=` avec `target_min`) — elles atterrissent dans la file « Ready » et bloquent la publication sans indiquer où regarder ; (c) « Fer avec vitamine C » devient un **commitment noté** alors que c'est une relation (NON-INPUT #1) → `missed` chaque jour ; (d) « Hydratation 30 ml/kg/j » rendu `water >= 1900` — le modèle a fait 63 kg × 30, exactement l'autorship que le contrat interdit, confidence 0,98 ; (e) la note manuscrite en marge disparaît sans apparaître ni en `gaps` ni en `unparsed_spans`.

**G18. La suppression de pression d'adhérence couvre 2 de ses 9 surfaces déclarées.**
`_shared/keel/restriction_guard.ts:84-96` vs `ProgressPage.tsx` (aucune lecture du flag)
Flag levé, l'élève ouvre `/app/progress` et voit toujours la barre « 3 of 7 days », le compteur de série courante **et** de meilleure série (`streak_display`, littéralement la surface citée) et le dépliant poids. Une ceinture annoncée et non tenue est pire qu'une ceinture absente.

**G19. Sur WhatsApp, `source_message_id` est un UUID aléatoire par requête HTTP.**
`whatsapp-webhook/wa_reply.ts:52-69` (`logMessages: false`) · `run.ts:2831` · `_shared/http.ts:5`
L'index unique partiel — que `executor.ts` documente comme LA source d'idempotence — ne peut jamais se déclencher sur le canal principal. Trois effets chaînés : chemin `already_logged` mort ; `protocol_events.source_message_id` pointe vers un identifiant qui n'existe dans aucune table (impossible de relier un fait au message) ; **debounce sauté** → deux messages à 1 s produisent deux `processMessage` concurrents qui écrasent mutuellement `temp_memory` (dont l'état d'épisode TCA, seule continuité de l'épisode). Aggravé par le fait que les deux paramètres d'idempotence du gate (`recent_writes_idempotency`, `db_idempotency_check`) ne sont **jamais** passés par `run.ts` : câblage mort.

**G20. `_shared/keel/day_targets.ts` — livrable W4.3, 273 lignes + 300 de tests, ZÉRO appelant.**
`day_targets.ts:165`. Les 5 appelants restants d'`action_occurrences.ts` utilisent tous encore la version buguée que ce module existait pour corriger.

### MOYEN — dette nommée

`planned_deviations` sans portée ni antériorité (un élève cœliaque peut mettre `not_applicable` sur son interdit médical `strict` — `evaluator.ts:886-894`) · le crash R7 sur `convertQuantity('g','serving')` abat **toute la semaine ISO** d'un élève (`evaluator.ts:332-343`, pas de try/catch par commitment ; non atteignable aujourd'hui faute d'appelant, et **effet de bord trouvé : la même ligne avec `unit=null` rend `met` sur 140 vs `>= 3 servings`**) · le liage explicite d'une **photo** court-circuite la branche micronutriment → `partial` sur une ligne nutriment, et `TodayPage.tsx:417-423` n'envoie jamais `commitmentId` donc c'est le chemin par défaut (`evaluator.ts:419-427`) · `profiles.keel_role` modifiable par l'utilisateur → le garde « un élève ne peut pas devenir coach » se contourne en un PATCH · l'acceptation d'invitation ne vérifie jamais l'e-mail du compte · le journal d'accès coach est purement décoratif (un appel client optionnel depuis une seule page ; PostgREST n'est jamais tracé) · verbatim élève exposé en Tier A (`student_safety_constraints.notes`, `upcoming_contexts.note` **sans drapeau de visibilité**) · DST à minuit (Santiago, La Havane, Beyrouth, Asunción) : l'heure locale 0 n'existe pas, la journée n'est jamais provisionnée · **deux colonnes de fuseau indépendantes** — `plan_versions.timezone` = navigateur du **coach**, `profiles.timezone` = celui de l'élève, sans aucun contrôle (`PlanImportPage.tsx:468` vs `JoinPage.tsx:173`) : rappels et notation dans deux calendriers · `scheduled_days='{}'` accepté (le CHECK `<@` est vrai pour le vide) → ligne invisible à vie · `polarity='capture'` ne compare jamais la cardinalité · `protocol_events.substance_ref`/`unit` sans FK ni CHECK (asymétrie avec `plan_commitments`) · `review-plan-v1` (999 l., orpheline, Gemini) sera déployée · `plan_documents` et `commitment_relations` sans écrivain · le crash d'un tour WhatsApp est définitif (dedup wamid marqué avant traitement, `llm_retry_jobs` sans producteur) · `confidence_band:"critical"` armé par le routeur et refusé par le gate, avec une clarification **en français** appendue à une réponse anglaise · `ensureCommittedRenderParity` aveugle aux deux effets KEEL · `ultimate.int.test.ts` skippé par défaut — le mécanisme de masquage de W2 est intact.

---

## 4. LE MODE D'ÉCHEC SYSTÉMIQUE DE CETTE NUIT

**Il ne s'est pas produit 3 fois. Il s'est produit au moins 13 fois**, et cette fois sur le cœur et sur la couche safety :

`evaluate-adherence-v1` · l'écrivain de `weekly_reviews` · `computeWeekAdherence` · le lecteur de `contract_change_requests` · l'écrivain de `student_safety_constraints` · `day_targets.ts` · `crisisCountryForProfile` + `fetchCrisisResources` · `assertNoMedicalConstraintViolation` · `locale.ts::buildResponseLanguageBlock` · `plan_documents` · `commitment_relations` + `relations.ts` · `persistTurnSummaryLog` · `review-plan-v1`.

**Pourquoi.** Un agent reçoit un ticket qui décrit un *artefact* (« écris l'évaluateur », « écris le module de contraintes de sécurité »), pas une *arête du graphe* (« fais en sorte que le sweep de 23h55 lise les faits »). Il livre l'artefact, écrit ses tests unitaires, et ils passent — parce que **un test unitaire est vert précisément quand le module est isolé**. Le seul artefact qui prouverait l'arête (un appelant) appartient au ticket de quelqu'un d'autre, souvent d'une vague ultérieure. En parallèle, personne ne possède l'arête. Les 2396 tests verts ne sont pas un mensonge : ils prouvent les branches, **jamais les frontières**. Et les cinq défauts les plus graves vivent tous exactement sur une frontière : cron↔fonction, client↔évaluateur, SQL↔TS, jsonb↔type, chat↔matching.

Corollaire, aussi coûteux : **les commentaires affirment des garanties structurelles que le code ne porte pas.** `evaluator.ts:37-41` (« Enforced structurally … it cannot match ») est faux dès qu'un liage explicite existe. `20260727175000` (« a swept row and an evaluator-computed row can never disagree ») est faux pour tout `slot_kind IS NULL`. `20260727120000:507` (« the coach is structurally read-only ») est faux. `tenancy_rls_test.sql:290` teste la table et pas la vue livrée par la même migration. **La garde et son test ont été écrits par le même raisonnement — donc le test ne peut pas trouver ce que la garde a manqué.**

**Les règles à adopter, dans l'ordre d'efficacité :**

1. **Test de câblage en CI, qui échoue au rouge.** Pour chaque edge function et chaque module de `_shared/keel/*`, asserter qu'il existe au moins **un appelant de production** (hors `*_test.ts`, hors commentaire, hors import de type) : cron, trigger, route frontend, ou import depuis une fonction déjà câblée. `coverage-guard.int.test.ts` est une liste d'exemption, pas ça. **C'est la seule des cinq qui empêche la vague suivante de reproduire le défaut.**
2. **Le Definition of Done d'un ticket devient une arête, pas un fichier.** « W4.1 : l'évaluateur » → « W4.1 : après `INSERT INTO protocol_events`, `commitment_evaluations.status` devient `met` dans la minute, prouvé par une sonde SQL ». Un ticket dont la vérification est un `curl` tapé à la main n'est pas fini.
3. **Un test ne peut pas être écrit par l'agent qui a écrit la garde.** Deuxième agent, énoncé de l'invariant seul, sans le code. C'est ce qui aurait attrapé B2.
4. **Deux inventaires mécaniques en CI**, deux requêtes SQL : (a) tout objet de `public` dont `relacl`/`proacl` accorde plus que `SELECT` à `authenticated`/`anon` → liste d'exemption explicite ; (b) toute fonction SECURITY DEFINER sans `revoke` de PUBLIC. B2 et B3 sont des **oublis de révocation ou d'héritage**, pas des erreurs de raisonnement — deux requêtes, pas deux jours de revue.
5. **Grep systématique des listes littérales.** Cinq findings sont la même faute de forme : une liste fermée écrite pour deux effets legacy à laquelle personne n'a ajouté les deux effets KEEL (`ensureCommittedRenderParity`, `reexec*`, les regex des ceintures, le cap de cardinalité, les exemptions du mot de bascule). Auditer *toutes* les listes de `effect_type`/`response_owner`/`skill_id` contre le vocabulaire KEEL, exhaustivement, pas cas par cas.
6. **Toute assertion « structurellement impossible » dans un commentaire doit citer le test qui la prouve** — ou être réécrite au conditionnel.

---

## 5. CE QUI RESTE À CONSTRUIRE (W7-W12)

| Vague | Existant | Manquant | Charge honnête |
|---|---|---|---|
| **W7 — bilans** | Les 3 **lecteurs** de `weekly_reviews` sont écrits ; `computeWeekAdherence` est écrit et testé | **L'écrivain entier.** Le bilan du soir n'est même pas planifié pour un élève KEEL (le scheduler sort avant, faute de `user_habit_*`). Segmentation republication-milieu-de-semaine spécifiée, zéro code | 3-4 j |
| **W8 — cartes d'attaque** | Rien de KEEL. `AttackCards.tsx` a **dupliqué une 3e fois** la source des 6 techniques (`generate-attack-card-v1` ↔ `attackTechniquePreviews.ts`) | Migration `card_templates`, unification des 3 sources | 3 j (dont 1 de dé-duplication) |
| **W9 — i18n runtime** | `locale.ts` écrit, **100 % mort** ; `render.ts` throw hors en-US | Câbler `buildResponseLanguageBlock`, colonne `conversation_locale`, traduire `dispatcher.prompts.ts` + `companion.ts` (intégralement français), réécrire le persona | 4-5 j — **prérequis démo** |
| **W10 — entitlements** | Rien | Siège hérité du coach. **Son absence bloque déjà W4.6** (B6) | 3 j |
| **W11 — QA personas** | `llm_as_judge` est toujours un tas de regex FR sans appel modèle | Juge réel, personas TCA, harness KEEL | 4 j |
| **W12 — runbooks** | Aucun fichier dans `docs/` | Runbooks incident, backfill, rotation secrets | 2 j |

**Plus le rattrapage W1-W6 : ~8-10 j** (les 6 BLOQUANTS + les GRAVE d'entrée : G1, G2, G5, G8, G14, G15). **Total réaliste avant pilote : 4 à 6 semaines**, pas une nuit. La bonne nouvelle : ce sont des jours de câblage et de garde, pas de conception.

---

## 6. LES 5 CHOSES À FAIRE EN PREMIER

1. **Révoquer les 3 ACL. (30 minutes.)** `revoke insert, update, delete on coach_student_events, coach_student_directory from authenticated` (+ `WITH CHECK OPTION` sur les vues) et `revoke all on function public.invoke_internal_edge_function from public, anon, authenticated` — ou `drop`, elle n'a **zéro appelant**. *Pourquoi en premier :* c'est le seul lot où le ratio dégât/effort est démentiel, ça ne dépend de rien, et tant que ce n'est pas fait il ne faut pas exposer une URL publique. (B2, B3)
2. **Câbler l'évaluateur, puis faire converger sweep et évaluateur.** Cron dédié **avant** le sweep + appel après chaque écriture de fait (tap, chat, photo). Et **une seule** implémentation de `deriveStatus` : aujourd'hui le SQL et le TS divergent sur `slot_kind IS NULL`. *Pourquoi ici :* sans ça, rien d'autre ne se mesure — B5, les déclencheurs TCA, `keel_plan_context` et l'adhérence sont tous affamés par le même trou. (B1, G13)
3. **Trois gardes d'une ligne sur la boucle de log.** (a) `canLog = !isAutoSourced && polarity !== 'avoid'` **+** garde de polarité dans la branche liage de `matchEvent` (le front seul ne suffit pas) ; (b) champ de liage (`commitment_id`) dans `ProtocolEventWriteInput` + résolution à l'intake, sinon 6 `activity_class` sur 9 restent inloggables par chat ; (c) `logMessages: true` sur WhatsApp pour rendre l'index d'idempotence effectif. *Pourquoi :* aujourd'hui la boucle « log par chat » est câblée pour une seule famille de lignes, et le geste de conformité produit une note d'échec **irréversible** (pas de policy DELETE). (G1, G2, G19)
4. **Fermer les deux mensonges de la couche safety.** `contract_change_requests` doit avoir un lecteur (une section « Needs your attention » sur `/coach/clients/:id`, `urgency='immediate'` en tête) — ou bien retirer du DENY_TEXT la phrase « It is flagged to your coach right now ». Et découpler le plancher TCA proactif de l'opt-in WhatsApp et de `access_tier`. *Pourquoi avant le produit :* on affirme à un élève en difficulté qu'un humain a été alerté alors qu'aucun humain ne peut l'être. C'est le seul finding qui n'est pas une question d'ingénierie. (B4, B6)
5. **Authentifier `plan-import-v1` + keyer son rate-limit sur `user.id`, et rendre la conversation anglophone.** *Pourquoi ces deux ensemble :* ce sont les deux seuls défauts qui cassent la **démo** elle-même — le parcours d'entrée se 429 tout seul dès que deux coachs importent dans la même fenêtre de 10 minutes, et l'IA se présente au coach anglophone comme « Sophia, partenaire conversationnelle » en français. (G5, G8)

*Et en parallèle, avant la vague suivante : le test de câblage (§4, règle 1). C'est le seul livrable qui empêche la prochaine nuit de reproduire cette nuit.*

---

## 7. CE QU'IL FAUT DIRE AU COACH DEMAIN

**Ce qui est montrable, aujourd'hui, sans mentir** (avec l'évaluateur appelé à la main entre le log et la relecture, ou après le point 2 ci-dessus) :

- L'import : coller un protocole texte → commitments structurés, `student_instruction` **verbatim**, `source_span` avec page et citation, file « À vérifier » séparée. C'est la partie la plus impressionnante et elle est réelle. *(Mais faire l'import **avant** la démo : la voie PDF/photo dépend d'une clé Gemini et le rate-limit est global.)*
- L'édition inline puis « Approve & publish » avec trace d'approbation horodatée.
- L'invitation par e-mail → `/join?token` → compte élève lié.
- `/app/today` côté élève : créneaux groupés, ligne par ligne, bouton de log, aucun score affiché.
- La doctrine, qui est **le vrai actif** : le coach écrit, l'IA n'écrit jamais ; deux nombres jamais fusionnés ; pas de pourcentage sous 4 jours de logs sur 7 ; un fait n'est jamais déduit d'un autre. Ces règles sont réellement dans le code et défendues par des tests.

**Ce qu'il ne faut PAS promettre :**

- ❌ Un chiffre d'adhérence. Aucune surface n'en affiche un, et ce n'est pas un réglage : il n'y a pas d'écrivain de `weekly_reviews`.
- ❌ Un tableau de bord de tri le lundi matin. `/coach` est une liste de noms sans signal ; la page élève est un mur d'évaluations non trié.
- ❌ Les rappels WhatsApp et le digest dominical pour un élève web.
- ❌ Une alerte quand un élève décroche, ou quand l'IA escalade une question — personne ne lit la table.
- ❌ Une conversation en anglais.
- ❌ La détection d'allergie/contrainte médicale : aucune surface ne permet de l'enregistrer.
- ❌ Toute prescription qui n'est pas « prendre/manger X » : plafonds (« max 2 verres »), interdits par créneau (« pas de glucides le soir »), fréquences (« 3×/semaine »), relations (« fer à 2 h du calcium ») sont soit mal notés, soit perdus à l'import.

**Les 4 questions dont les réponses débloquent la suite** (elles sont plus importantes que la démo) :

1. **Sur tes 10 derniers plans, quelle proportion des lignes est « prendre/manger X » ?** Si c'est 90 %, G2/G10 sont de la dette. Si c'est 50 % (sommeil, mouvement, exposition), le modèle a besoin d'une quatrième branche et d'un liage explicite avant tout pilote.
2. **Quand ton élève déclare un écart *après coup* (« en fait j'étais au resto hier »), qu'est-ce que tu veux qu'il se passe ?** Aujourd'hui le jour est figé et `coach_backdate_grant` est câblé en dur à `null` : le module sait le traiter, aucune surface ne l'expose. Ta réponse dit s'il faut construire une surface coach ou une règle automatique.
3. **Le lundi matin, tu veux voir quoi en premier ?** « Qui a décroché », « qui a un signal safety », ou « qui a tenu » ? C'est la spec de la seule chose qui se vend, et elle n'existe pas.
4. **Combien de latitude tu donnes ?** `swap_policy` a aujourd'hui **deux vocabulaires incompatibles** (la fixture d'acceptation de référence est illisible par le lecteur : `acceptance_fixtures.sql:125` vs `evaluate-adherence-v1/snapshot.ts:114-126`), et `hard_deny` — la contrainte médicale — n'est lu par **aucune ligne de code**. Il faut un vocabulaire unique avant d'y mettre un vrai protocole.

---

**Ce que je ne dirais pas :** que le travail est mauvais. Le modèle de données, la tenancy et les modules purs sont au-dessus de ce qu'une nuit produit d'habitude, et l'EXECUTION_LOG est assez honnête pour avoir rendu cet audit possible en une session.
**Ce que je dis :** aucun élève réel ne doit voir cet écran aujourd'hui, et le document qui affirmait le parcours vérifié s'est trompé sur le seul maillon qu'il n'a testé qu'en curl.