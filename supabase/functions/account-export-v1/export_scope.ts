// ============================================================================
// L'ALLOWLIST DE COLONNES DE L'EXPORT RGPD — LE CONTRAT DE PORTÉE
//
// ── POURQUOI CE FICHIER EXISTE, ET IL A ÉTÉ EXTRAIT LE 2026-08-22 ──────────
//
// Elle vivait dans `index.ts`, qui est en `@ts-nocheck` et qui monte un
// serveur au premier import: AUCUN test ne pouvait donc la LIRE autrement
// qu'en la parsant comme du texte. Conséquence mesurée le 2026-08-22 (lot
// `S5`): **145 colonnes**, sur **35** des 38 tables lues, sont hors de cette
// allowlist — dont `student_generated_meals.composition_unknowns` et
// `composition_energy_sources`, alors que la migration du lot 18 affirme en
// commentaire que « la table est déjà exportée en entier ». C'est faux, et
// rien ne pouvait le dire.
//
// ⚠️ L'ALLOWLIST EST PAR COLONNE, ET C'EST VOULU: une colonne neuve est
// ABSENTE PAR DÉFAUT, donc elle ne sort pas. C'est la bonne direction pour un
// prompt système ou un score interne, et la pire pour une donnée de santé.
// Ce que le dépôt n'avait pas, c'est le filet qui fait la différence: il est
// dans `keel_gdpr_lifecycle_test.ts`, il ÉNUMÈRE `information_schema`, et il
// exige que chaque colonne soit soit exportée, soit NOMMÉE comme exclue.
//
// La règle de portée, inchangée: NO system prompts, NO internal
// scores/classifications (risk_band, momentum, confidence, sensitivity
// levels…), NO raw LLM logs.
// ============================================================================

// embeddings, raw metadata) never leaves the database.
export const SCOPE = {
  cycles:
    "id,status,raw_intake_text,duration_months,requested_pace,created_at,completed_at,archived_at",
  transformations:
    "id,cycle_id,priority_order,status,title,user_summary,success_definition,main_constraint,questionnaire_answers,completion_summary,created_at,activated_at,completed_at",
  plans: "id,cycle_id,transformation_id,status,version,title,content,created_at,activated_at,completed_at,archived_at",
  planItems:
    "id,plan_id,dimension,kind,status,title,description,tracking_type,cadence_label,scheduled_days,time_of_day,target_reps,current_reps,created_at,activated_at,completed_at",
  planEntries:
    "id,plan_item_id,entry_kind,outcome,value_numeric,value_text,difficulty_level,blocker_hint,effective_at,created_at",
  memories: "id,kind,content_text,normalized_summary,observed_at,event_start_at,event_end_at,created_at",
  conversations: "role,content,scope,created_at",

  // --- KEEL (docs/keel/SCHEMA.md) --------------------------------------------
  // Same contract as above: the coach's prescription and the student's own
  // facts leave the database verbatim; internal scores never do.
  //
  // `published_by` is stripped: another person's id has no portability value
  // and the student cannot act on it. `user_id`/`student_id` are redundant with
  // the export itself and omitted everywhere.
  //
  // `coach_id` IS exported, but only on the tenancy rows below (coachClients,
  // coachAccessEvents, coachInvitations) where it is the whole point: it is the
  // key that makes two access log lines attributable to the same coach, and the
  // student is entitled to see who held a grant on their file. It stays out of
  // the protocol tables, where it would just be noise.
  //
  // DECISION — coach-authored rows are exported via `coach_id = user.id`, but
  // ONLY the ones that carry no third-party payload: plan_templates (the
  // clonable skeleton, the coach's own work) and plan_documents (their uploaded
  // source). plan_versions / plan_commitments are NOT exported on the coach
  // side: those rows are the protocol OF a named student, so they belong to
  // that student's export, not their coach's. A coach who wants them reads them
  // in the app.
  planTemplates:
    "id,title,description,content_locale,default_swap_policy,default_autonomy,default_flex_allowance,default_adherence_target_pct,commitments,version,status,created_at,updated_at",
  // ocr_result and layout_probe are excluded: machine parse artifacts (typed
  // blocks, bboxes, confidence) — the "generation snapshot" class already
  // excluded above. The source file itself ships in fichiers/documents-plan/.
  planDocuments:
    "id,template_id,storage_path,mime_type,original_filename,page_count,ingestion_path,status,parse_error,created_at",
  planVersions:
    "id,source_document_id,version,status,title,content_locale,timezone,anchor_week_start,duration_weeks,week_starts_on,phase_plan,adherence_target_pct,flex_allowance_per_week,published_at,supersedes_version_id,notes_for_student,created_at",
  commitments:
    "id,plan_version_id,polarity,activity_class,anchor_kind,slot_key,clock_local,tolerance_minutes,window_start_local,window_end_local,measure,unit,target_op,target_min,target_max,tolerance_pct,substance_ref,food_group_ref,evidence_kind,evidence_required,auto_source,counts_toward_adherence,evaluation_grain,slot_kind,scheduled_days,required_days_per_week,expected_occasions_per_day,priority,autonomy,flex_eligible,provenance,requires_clinician_signoff,title,student_instruction,content,content_locale,source_span,phase_id,auto_generated,status,created_at",
  // recognition_confidence and evidence_weight are internal scores (see header).
  // media_path is kept: it is the join key to fichiers/photos-repas/.
  protocolEvents:
    "id,occurred_at,local_date,slot_key,source,media_path,recognized,quantity,unit,substance_ref,food_group_ref,student_note,content_locale,created_at",
  // `confidence` is an internal score.
  evaluations:
    "id,commitment_id,plan_version_id,local_date,slot_key,grain,expected,observed_value,observed,status,timing_status,evidence,resolved_at,resolved_by,created_at",
  plannedDeviations:
    "id,plan_version_id,local_date,slot_key,kind,declared_at,declared_via,note,content_locale,consumed_flex,coach_visible,created_at",
  upcomingContexts: "id,local_date,slot_key,kind,source,note,content_locale,created_at",
  // LES QUESTIONS DE PRÉCISION POSÉES À L'ÉLÈVE.
  //
  // Table neuve (`20260804170000`), et elle porte de la donnée personnelle: le
  // texte exact de ce que le produit lui a demandé, et quand. Elle manquait à
  // l'export — c'est la deuxième fois que le lifecycle RGPD oublie une table
  // du pivot, et la première fois avait déjà été payée. `asked_for_message_id`
  // est un identifiant interne de corrélation, pas une donnée de l'élève: il
  // reste dehors.
  mealPrecisionQuestions:
    "id,local_date,asked_at,source,axis,protocol_event_id,question",
  // FF-031 — LES MESURES CORPORELLES DATÉES.
  //
  // Table neuve (`20260810090000`), et elle porte de la donnée personnelle de
  // santé: ce que l'élève a déclaré de son corps, jour par jour, avec ses mots
  // quand il l'a dit en conversation. C'est la TROISIÈME fois qu'une table du
  // pivot doit être réclamée au cycle de vie après coup; celle-ci l'est dans le
  // même lot que sa création. `id` est exporté parce qu'il est la seule façon
  // de distinguer deux pesées du même jour l'une de l'autre.
  bodyMeasures:
    "id,measured_at,local_date,kind,value_si,source,content_locale,student_note,created_at",
  // risk_band is named in the header as a non-exportable classification;
  // coach_draft_reply is the coach's unsent draft, not the student's data.
  weeklyReviews:
    "id,plan_version_id,week_start_date,plan_version_changed_midweek,logging_coverage,core_adherence_pct,overall_adherence_pct,evaluable_days,flex_used,flex_allowance,self_rated_adherence,biofeedback,outcomes,outcome_direction,lapse_context,student_narrative,content_locale,created_at",
  // sophia_evidence is the internal evidence snapshot (ids + scores); the
  // human-readable summary the coach actually reads is exported.
  changeRequests:
    "id,plan_version_id,commitment_id,raised_by,reason_code,student_words,sophia_summary,suggested_option,urgency,status,coach_decision,content_locale,created_at,resolved_at",
  // Health data declared by or about the user: exported in full.
  // ⟳ 2026-08-22 (`S5`) — « exported in full » ÉTAIT FAUX. Le filet qui
  // énumère a mesuré HUIT colonnes dehors, dont `condition_ref` et `diet_ref`:
  // c'est-à-dire la MALADIE et le RÉGIME déclarés, sur la table dont le
  // commentaire au-dessus promet l'export intégral des données de santé. Le
  // cycle de vie de la déclaration (`status`, `retracted_at`,
  // `retracted_reason`, `superseded_by_constraint_id`) sort aussi: une
  // contrainte rétractée reste une chose qu'on a dite de soi, et cette table
  // ne supprime jamais ses lignes. `source_message_id` est le message de
  // l'ÉLÈVE lui-même — même arbitrage que `student_facts` avant son DROP:
  // c'est la trace de « d'où vient ce que le système croit de moi ».
  safetyConstraints:
    "id,kind,allergen_ref,substance_ref,condition_ref,diet_ref,medication_class,severity," +
    "declared_by,notes,status,retracted_at,retracted_reason,superseded_by_constraint_id," +
    "source_message_id,content_locale,created_at,updated_at",
  // La note 1:1 du coach sur un élève (2026-08-05). Elle est exportée DES DEUX
  // CÔTÉS, et le côté élève est le seul qui soit obligatoire: c'est une donnée
  // personnelle le concernant, écrite par un tiers, donc couverte par son droit
  // d'accès. L'écran coach le lui dit avant qu'il n'écrive.
  coachNotes: "id,coach_id,student_user_id,note,created_at,updated_at",
  // W1.4 R5 — commitment_relations. The evaluator must never read this table
  // (CONTRACT.md NON-INPUTS #1), but that is a rule about GRADING, not about
  // portability: the rows are part of the protocol written for this student
  // ("take it with fat", "keep 2 h from the iron") and the app shows them.
  // The table has no user_id — it hangs off plan_commitments — so it is fetched
  // by commitment id, not by owner.
  commitmentRelations:
    "id,commitment_a,commitment_b,relation_kind,param_minutes,cofactor_ref,created_at",

  // --- PIVOT NUTRITION (20260803031000, 20260803160000) ----------------------
  // AGENT 13 — ces cinq tables portent ce que l'élève DÉCIDE et ce qu'il
  // DÉCLARE. Elles étaient absentes de l'export: un compte exporté rendait un
  // `tables_indisponibles: []` (donc « rien ne manque ») en ayant laissé son
  // objectif, son plan de la semaine, ses taps du soir, ses repas habituels et
  // ses préférences dans la base. Mesuré sur un élève « plein », 2026-08-03.
  //
  // `generated_from` EST exporté: c'est la réponse à « pourquoi Sophia m'a
  // proposé ça », et le §3.7 brique 3 en fait une exigence d'observabilité.
  // Les deux cibles sont des données que l'ÉLÈVE a déclarées sur son corps: si
  // quoi que ce soit doit sortir dans son export, c'est bien ça. L'allowlist
  // est par colonne, donc une colonne neuve est absente par défaut — ce dépôt a
  // déjà oublié neuf tables du pivot dans ce même fichier.
  studentGoals:
    // ⟳ 2026-08-22 (`S5`) — `target_pace_kg_per_week` manquait: c'est le RYTHME
    // que l'élève a choisi, exactement de la même famille que la cible de poids
    // juste à côté, et il était muet.
    "id,goal,situation,aspiration,focus_axis,practical_constraints,target_weight_kg," +
    "target_pace_kg_per_week,target_waist_cm,content_locale,created_at,updated_at",

  // --- C3 ③ · SA PLACE DANS UN FOYER (20260808000000, 20260810120000) --------
  //
  // ⚠️ CETTE TABLE N'APPARAISSAIT NULLE PART DANS CET EXPORT, et c'est le seul
  // endroit du produit où survivent des données personnelles APRÈS la
  // suppression du compte. La purge J+7 (`keel_household_purge_user`) DÉTACHE
  // la ligne — `user_id` passe à NULL — au lieu de la supprimer: c'est
  // l'arbitrage D3 (« une bouche sans compte reste une bouche du foyer »), il
  // est voulu et testé. Ce qui n'avait jamais été décidé, c'est ce que la
  // bouche GARDE: `first_name` et `birth_date` survivaient sans être ni
  // exportés, ni nommés nulle part.
  //
  // TRANCHÉ PAR C3: ils survivent, et ils sont DÉCLARÉS ici. Le prénom sert la
  // question « pour qui je cuisine »; la date de naissance sert l'âge, donc les
  // PARTS des autres — l'effacer dégraderait la composition d'un foyer que la
  // personne quitte, ce qui est exactement ce que D3 refuse. Ce qui manquait
  // n'était pas l'effacement, c'était de le dire.
  //
  // ⚠️ SA LIGNE, ET SA LIGNE SEULE (`user_id = <lui>`). Les autres bouches du
  // foyer sont d'autres personnes: exporter le roster ferait de l'export RGPD
  // de l'un une divulgation sur les autres.
  //
  // `away_days` EST DEDANS: c'est une déclaration de la personne (ou de son
  // foyer) sur son emploi du temps, donc de la donnée personnelle au sens
  // plein. `goal` aussi, pour la même raison.
  //
  // ⟳ 2026-08-22 (`S5`) — SIX COLONNES DE PLUS, et elles étaient muettes: le
  // régime (`diet`), le rythme des repas (`eating_rhythm`), la cible et
  // l'allure de poids, le déjeuner au travail, les prises fixes. Ce sont des
  // déclarations de la personne sur ce qu'elle mange et sur son corps —
  // strictement la même famille que `goal` et `away_days`, déjà là. Elles sont
  // entrées par des lots ultérieurs, l'allowlist n'a pas bougé, et rien ne le
  // disait: c'est le défaut PAR COLONNE que `S5` ferme.
  householdMembers:
    "member_id,household_id,role,first_name,birth_date,goal,away_days," +
    "eating_rhythm,diet,target_weight_kg,target_pace_kg_per_week,work_lunch," +
    "fixed_intakes,departs_with_account,joined_at",

  // --- SON CORPS DANS LE FOYER (20260812220000) ------------------------------
  //
  // ⚠️ RÉCLAMÉE DÈS SA MIGRATION, ET PAS APRÈS. Le dépôt a la cicatrice
  // inverse — neuf tables neuves absentes de cet export pendant des mois, sans
  // que rien ne le dise — et celle-ci est la pire candidate possible à
  // l'oubli: elle porte taille, poids et sexe, y compris **de mineurs**, y
  // compris de bouches qui n'ont jamais eu de compte.
  //
  // ⚠️ SA LIGNE, ET SA LIGNE SEULE. Même règle que `householdMembers` juste
  // au-dessus, et elle mord plus fort ici: le roster des corps est le poids de
  // chaque personne du foyer. L'exporter ferait de l'export RGPD de l'un une
  // divulgation médicale sur les autres — y compris sur ses enfants. La table
  // n'a d'ailleurs AUCUN grant à `authenticated` pour cette raison exacte
  // (sondé le 2026-08-12: la policy de `household_members` est household-wide,
  // donc un co-membre lisait déjà toutes les lignes de son foyer).
  //
  // ⚠️ `household_id` N'EN EST PAS. Il est déjà dans `householdMembers`, et le
  // répéter sur la ligne du corps n'apprend rien.
  //
  // CE QUI SURVIT, ET LA DIFFÉRENCE AVEC LA LIGNE MEMBRE: rien. La purge
  // (`keel_household_purge_user`, 20260812220000) EFFACE le corps dans ses deux
  // branches, là où elle CONSERVE prénom et date de naissance. L'arbitrage est
  // écrit dans la migration: prénom et date répondent à « pour qui je
  // cuisine »; une taille et un poids sont des métriques d'une personne qui a
  // quitté le produit.
  //
  // ⟳ 2026-08-22 (`S5`) — SEPT COLONNES DE PLUS. Le niveau d'activité, le
  // sport, l'appétit, le pain/fromage/dessert: ce que la personne a déclaré de
  // sa vie et de sa table. Les `*_asked_at` restent dehors — ils disent quand
  // l'écran a POSÉ la question, pas ce qu'elle a répondu.
  householdMemberBody:
    "member_id,height_cm,weight_kg,gender,activity_level,day_activity," +
    "sport_frequency,takes_dessert,takes_cheese,takes_bread,appetite," +
    "recorded_at,updated_at",
  // G1 (2026-08-14) — CE QU'ELLE MANGE QUAND CE N'EST PAS LE PLAT DE LA MAISON.
  //
  // ⚠️ RÉCLAMÉE LE JOUR OÙ ELLE EST CRÉÉE, et c'est le point. « Le lifecycle
  // RGPD ne réclame pas les tables neuves » est une cicatrice chiffrée de ce
  // dépôt — neuf tables mesurées hors export. `slots` et `note` portent LES
  // MOTS de la personne sur ce qu'elle mange: c'est de la donnée personnelle,
  // elle sort dans l'archive.
  //
  // `updated_by` N'EN EST PAS: c'est l'id d'un AUTRE compte (le maître qui a
  // rempli pour une bouche sans compte). L'exporter livrerait un identifiant
  // de tiers dans l'archive de quelqu'un.
  householdMemberHabits: "member_id,slots,note,updated_at",

  // --- S5 (2026-08-22) · SES ALLERGIES ET LES RÈGLES QUI LA VISENT ----------
  //
  // ⛔ CE SONT DES DONNÉES DE SANTÉ, ET ELLES N'ÉTAIENT RÉCLAMÉES NULLE PART:
  // ni par l'export, ni par la purge, ni par le seul test qui prétend garder le
  // cycle de vie RGPD. Mesuré le 2026-08-22:
  // `grep -c 'household_member_allergies\|household_food_restrictions'
  //  supabase/functions/account-export-v1/index.ts` → **0**.
  //
  // ⚠️ LA GRANULARITÉ EST TRANCHÉE (décision n° 24 du plan, 2026-08-21), et
  // elle est A ET B SELON LA BOUCHE: une bouche SANS compte n'a aucun moyen
  // d'exporter — le maître les porte; une bouche AVEC un compte exporte LES
  // SIENNES. Ici on est dans le second cas, donc la lecture est faite par le
  // `member_id` de SA PROPRE LIGNE, exactement comme le corps et les
  // habitudes. Passer les `member_id` du roster mettrait les allergies de ses
  // enfants dans son archive: une divulgation médicale sur des tiers, servie
  // par le droit d'accès de quelqu'un d'autre.
  //
  // `created_by` N'EN EST PAS: c'est l'id d'un AUTRE compte (le maître qui a
  // déclaré pour une bouche sans compte). Même règle qu'`updated_by` sur les
  // habitudes. `household_id` non plus — il est déjà dans `householdMembers`.
  householdMemberAllergies: "id,member_id,label,created_at",
  // Le POUVOIR DOMESTIQUE (« pas de Nutella pour Léa »), pas une raison
  // médicale. Elle sort quand même, et par le même chemin: c'est un fait
  // déclaré SUR cette personne, elle a le droit de savoir ce que le produit en
  // retient. La table n'a délibérément aucune colonne de raison.
  householdFoodRestrictions: "id,member_id,label,created_at",
  studentWeekPlans:
    "id,week_start,generated_from,items,status,adopted_at,content_locale,created_at,updated_at",
  studentDailyCheckins: "id,local_date,overall,axis,source,created_at",
  // LE LOG DE SÉANCE (2026-08-18, migration 20260818180000).
  //
  // ⚠️ RÉCLAMÉE DANS LE MÊME LOT QUE SA MIGRATION, et pas après. « Le cycle de
  // vie RGPD ne réclame pas les tables neuves » est une cicatrice CHIFFRÉE de
  // ce dépôt — neuf tables du pivot mesurées hors export pendant des mois,
  // pendant que le manifeste rendait `tables_indisponibles: []`, c'est-à-dire
  // « rien ne manque ».
  //
  // TOUTES LES COLONNES SORTENT: ce que quelqu'un a fait de son corps, quel
  // jour et combien de temps, est de la donnée personnelle au sens plein. Il
  // n'y a rien à retenir ici — aucun identifiant de tiers, et surtout AUCUN
  // chiffre d'énergie: la table n'en porte pas, par décision (voir l'en-tête
  // de la migration, la raison y est chiffrée).
  studentActivitySessions:
    "id,local_date,kind,duration_min,intensity,source,created_at",
  // FF-056 — LES ÉPISODES DE DIVERGENCE.
  //
  // ⟳ RACCORD DÉBLOQUÉ LE 2026-08-22 (`S5`). Le rapport FF-056 §8 B1 l'avait
  // écrit noir sur blanc: « purge ✅ garantie, export ❌ BLOQUÉ — la liste est
  // en dur dans `account-export-v1/index.ts`, fichier modifié par une autre
  // session ». La table rejoignait donc le cycle de vie À MOITIÉ, et le filet
  // qui énumère l'a redit: elle était RÉCLAMÉE par la purge et NOMMÉE comme
  // non exportée au même instant — deux affirmations qui ne peuvent pas être
  // vraies ensemble.
  //
  // Elle ne porte AUCUNE prose de l'élève (fiche §5: « stocker les mots de
  // quelqu'un qui explique pourquoi il n'a pas perdu de poids créerait un
  // dossier ») — que des jetons de listes fermées. Elle dit quand même que le
  // poids de quelqu'un n'a pas suivi son plan, et pourquoi: donnée de santé,
  // elle sort en entier. `user_id` seul reste dehors, comme partout.
  weightDivergenceEpisodes:
    "id,state,category,detector_version,shape,goal_direction,plan_fingerprint," +
    "opened_local_date,opened_at,last_turn_at,closed_at,turn_count," +
    "observation_opened_on,observation_ends_on,opening_chat_message_id," +
    "content_locale,created_at,updated_at",
  // FF-027 — la faim déclarée en conversation. `student_note` porte LES MOTS DE
  // L'ÉLÈVE: c'est de la donnée personnelle, elle sort donc dans l'archive.
  studentHungerReports:
    "id,local_date,source,matched,student_note,content_locale,created_at",
  // Le repas généré porte le CONTEXTE DE VIE que l'élève a écrit (« mariage
  // mardi ») et le contenu de ses placards. C'est de la donnée personnelle au
  // sens plein, et elle sort avec le reste.
  //
  // ⟳ 2026-08-22 (`S5`) — ONZE COLONNES DE PLUS, ET LA MIGRATION DU LOT 18
  // AFFIRMAIT EN COMMENTAIRE QUE « LA TABLE EST DÉJÀ EXPORTÉE EN ENTIER ».
  // C'était faux, mesuré: `composition_unknowns` et
  // `composition_energy_sources` (ce que la composition n'a pas su résoudre sur
  // SES repas), les préparations, les sessions de cuisine, ses préférences, et
  // la fenêtre du plan (`plan_kind`, `starts_on`, `duration_days`, `ends_on`).
  //
  // ⚠️ `member_portions` RESTE DEHORS, et c'est une décision, pas un oubli: ce
  // sont les parts des AUTRES bouches du foyer. Même règle que
  // `householdMembers` — l'export RGPD de l'un ne divulgue pas les autres.
  studentGeneratedMeals:
    "id,scope,mode,meal_slot,servings,context,pantry,preferences,dishes,preparations," +
    "cooking_sessions,shopping_list,plan_kind,starts_on,duration_days,ends_on," +
    "composition_unknowns,composition_energy_sources,generated_from,validated_at," +
    "retired_at,content_locale,created_at,updated_at",
  // `storage_path` sort aussi: c'est ce qui relie la ligne au PDF joint dans
  // `fichiers/`, et sans lui le manifeste et les octets ne se recollent pas.
  studentMealDocuments:
    "id,meal_id,kind,storage_path,filename,delivery_status,delivery_error,sent_at,created_at,updated_at",
  // FF-039 — LE JOURNAL DE MESURE DE LA COMPOSITION.
  //
  // C'est de la donnée INTERNE (l'élève ne le voit nulle part) et c'est
  // exactement pour ça qu'elle sort: ce que le système a calculé SUR SES
  // repas lui appartient, et un export qui ne rend que ce qu'on lui a déjà
  // montré n'est pas un export.
  //
  // `envelope_mode` sort tel qu'il est stocké — SANS sa raison. Il ne dit pas
  // pourquoi une enveloppe a dégradé: le plancher TCA et le corps inconnu
  // produisent la même valeur, par construction (FF-039 R2/R14).
  mealCompositionVerdicts:
    "id,meal_id,verdict,envelope_mode,resolution_coverage,unresolved_terms,tokens_served,coverage_flag,prompt_version,doctrine_version,created_at",
  // `portion_bias` est une calibration ORDINALE (bandes), pas un score interne:
  // elle est lisible par l'élève et sort avec le reste.
  recurringMeals:
    "id,label,canonical_items,slot_key,occurrences,last_seen_at,portion_bias,status,confirmed_at,content_locale,created_at,updated_at",
  // `source_message_id` reste dedans ici (contrairement à protocol_events): sur
  // student_facts c'est un id de message de l'élève LUI-MÊME, donc la trace de
  // « d'où vient ce que le système croit de moi » — précisément ce qu'un
  // export doit permettre de contester.
  studentFacts:
    "id,kind,value,note,content_locale,status,invalidated_at,superseded_by_fact_id,source_message_id,declared_by,created_at,updated_at",

  // --- CARTES: RETIRÉES DE L'EXPORT (retrait résidus grand public) -----------
  // `student_cards`, `card_armings`, `card_wins` sont DROPPÉES par
  // 20260808070000 — cartes démontées au pivot (route et cron débranchés le
  // 2026-08-03), retrait confirmé par l'humain le 2026-08-08 (0 utilisateur
  // grand public). Même traitement que recurring_meals/student_facts plus bas:
  // la section reste dans le bundle, vide, sans interroger la base.

  // --- ÉCHAFAUDAGE REPAS: RETIRÉ DE L'EXPORT (20260804210000) ---------------
  // `meal_ideas` était exporté scopé sur `meal_ideas.student_id`, et
  // `meal_plan_entries` sur `student_id` — les deux ont disparu avec la
  // composition 1:1. La bibliothèque de recettes est désormais GLOBALE: elle
  // appartient au coach, elle est identique pour toute sa cohorte, et elle ne
  // contient aucune donnée personnelle de CET élève.
  //
  // Un export RGPD porte les données de la personne, pas le matériel qu'elle a
  // consulté. Les y remettre gonflerait l'archive du contenu d'un tiers — et le
  // scoper serait impossible: il n'existe plus aucune colonne qui relie une
  // recette à un élève.

  // --- CÔTÉ COACH (20260803031000) -------------------------------------------
  // La doctrine est la propriété intellectuelle du coach, et elle est à lui.
  // `compiled_prompt` / `compiled_prompt_hash` sont exclus: bloc de prompt
  // assemblé et sa clé de cache — la classe « no system prompts » de l'en-tête.
  // `published_by` exclu (id d'un tiers).
  coachDoctrines:
    "id,version,beliefs,forbidden,vocabulary,arbitrations,voice,content_locale,published_at,created_from_version,change_note,created_at,updated_at",
  cohorts:
    "id,label,content_locale,plan_template_id,starts_on,duration_weeks,status,created_at,updated_at",
  // DÉCISION — `narrative` et `flagged_students` NE SONT PAS exportés.
  // Ce sont des listes d'AUTRES personnes (nom rendu, uuid, risk_band,
  // adhérence). Les faire sortir dans l'archive d'un coach transformerait son
  // export en dump des scores internes de ses élèves — exactement la raison
  // pour laquelle `plan_versions` / `plan_commitments` sont déjà hors du côté
  // coach. Ce qui sort est l'AGRÉGAT de sa propre pratique.
  coachSyntheses:
    "id,cohort_id,kind,period_start,period_end,metrics,content_locale,generated_at,delivered_at,delivery_channel,created_at",
  // 20260806100000 — les aliments lus dans les DOCUMENTS du coach, en attente
  // de son tri. Tout sort, y compris `quote`: la citation vient de son propre
  // PDF, elle est à lui, et c'est précisément la colonne qui lui permet de
  // vérifier ce que la lecture automatique a retenu de son matériel. Aucune
  // colonne ne désigne un tiers.
  coachFoodProposals:
    "id,term,quote,content_locale,stance,food_group_ref,food_item_ref,source_label,status,created_at,resolved_at",
  // 20260806140000 — le corpus des documents du coach. Tout sort: c'est SON
  // ebook, son texte, ses citations. `storage_path` sort aussi, et il n'est
  // pas décoratif — le fichier lui-même part dans `fichiers/documents-plan`
  // (bucket `plan-documents`), et sans le chemin il ne saurait pas quel PDF de
  // l'archive correspond à quelle ligne.
  coachDocuments:
    "id,filename,byte_size,page_count,content_locale,content_sha256,storage_path,text_status,text_chars,chunk_count,created_at",
  // Le texte intégral de ses propres documents. Volumineux, et c'est la
  // raison de l'exporter: c'est exactement ce qu'on a gardé de lui.
  coachDocumentChunks: "id,document_id,ordinal,page_number,text,char_count",
  coachDocumentCitations:
    "id,document_id,chunk_id,entry_kind,entry_key,quote,page_number,created_at",

  // TENANCY (20260727120000).
  coachClients:
    "id,coach_id,student_user_id,invited_email,status,consent_granted_at,seat_state,started_at,ended_at,created_at",
  // Server-written audit log, readable by the student (SCHEMA.md TENANCY): the
  // point of exporting it is that the student sees who opened their file.
  coachAccessEvents: "id,coach_id,student_user_id,surface,occurred_at",
  // W1.4 R5 — coach_invitations used to be excluded WHOLESALE because of
  // `invite_token_hash`. Excluding a table to exclude one column also hid who
  // invited the student, when, and whether the offer is still standing. The
  // allowlist keeps the facts and drops the hash: a hash of a live credential
  // has no place in an archive the user is told to keep on their own disk.
  // `invite_token_hash` must NEVER be added to this list.
  coachInvitations:
    "id,coach_id,email,status,expires_at,created_at,accepted_at",
};
