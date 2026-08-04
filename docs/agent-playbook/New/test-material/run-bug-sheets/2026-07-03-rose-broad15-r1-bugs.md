# Run Bug Sheet — rose-broad15-20260703-r1

Rapport associé: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-rose-broad15-r1.md`
Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`) · Plan `05393e65…` (« Arrêter le cannabis ») · Scope `qa-rose-broad15-20260703-r1`
Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

---

## R1-B01 — Statut d'item fabriqué sur ouverture (`normal_reply`)

- **Tours:** 1
- **Famille:** BF-STATUS-01 (Projection DB mal lue)
- **Domaine owner:** contexte/loader statut plan + garde-fou grounding `normal_reply`
- **Source amont:** projection de statut du plan pour synthèse d'ouverture — inférence LLM libre au lieu d'une lecture déterministe de `user_plan_item_entries`
- **Symptôme visible:** « tu as bien fait ton sas de décompression ce soir : il est marqué comme fait » alors que l'item est `active` et n'a aucune entry (baseline `user_plan_item_entries=0`), l'user n'a rien déclaré
- **Preuve système:** `user_plan_item_entries=0` avant run ; `response_owner=normal_reply` ; aucun `direct_effect` ; item sas `3db6278b-bd59-…` jamais tracké
- **Correction attendue:** un statut d'item ne peut être rendu que depuis une projection déterministe de `user_plan_item_entries` (source unique). Item sans entry ⇒ jamais « fait ». Le contexte d'ouverture ne doit pas laisser le LLM inventer un état de complétion.
- **Statut:** open
- **Fix reference:** —
- **Tests requis:** invariant « item sans entry jamais rendu completed sur `normal_reply` » ; paraphrase (autres items/ouvertures) ; anti-faux-positif (item réellement tracké rendu « fait »).

---

## R1-B02 — Reminder bloqué : « demain » off-by-one + doublon inter-run

- **Tours:** 7
- **Famille:** BF-EFFECT-03 (Payload durable faux — date) + hygiène inter-run (BF-TEST-01 transverse)
- **Domaine owner:** (1) compilateur payload temporel `create_one_shot_reminder` ; (2) isolation des effets QA `user_id` vs `scope`
- **Source amont:** (1) résolution de « demain à 18h » à ~01:54 Paris → `2026-07-03T16:00Z` (aujourd'hui) au lieu de `2026-07-04T16:00Z` (J+1) ; (2) effets durables au niveau `user_id`, non isolés par scope → dédup déclenchée par une ligne créée par un run concurrent
- **Symptôme visible:** « Il existe déjà un rappel identique demain à 18:00, donc je n'en crée pas un deuxième » — aucun rappel créé pour l'user
- **Preuve système:** ledger `requested=1, allowed=0, blocked=1, committed=0` ; `scheduled_checkins 6d4c049b` (`2026-07-03T16:00Z`, texte quasi identique, `created_at 23:54:32` par un run concurrent) ; `direct_effects.UTC_time=2026-07-03T16:00:00Z`
- **Correction attendue:** (1) résolution « demain » ancrée sur la date locale client, J+1 strict ; clarifier si l'heure tombe dans la journée courante déjà entamée. (2) Isoler les effets durables QA par run (persona/connexion jetable même pour vrais persona, ou namespacing des effets par scope) pour que la dédup ne croise pas d'autres sessions.
- **Statut:** volet (2) **éliminé** (triage concurrence 2026-07-03) — la ligne qui a déclenché la dédup vient d'un run parallèle, le garde a fonctionné comme conçu. Volet (1) reste **open** : résolution « demain » off-by-one après minuit (bug réel, famille temporelle commune avec `multiflow` T6 et `alex-r2` R2-B03).
- **Fix reference:** —
- **Tests requis:** résolution « demain 18h » à 01:54 → J+1 ; anti-faux-positif (vrai doublon même scope bloqué) ; test d'isolation (effet d'un scope A invisible pour la dédup du scope B).

---

## R1-B03 — `plan_item_id` structuré fabriqué dans `coaching_recommendation`

- **Tours:** 10
- **Famille:** BF-EFFECT-03 (Payload durable faux — identifiant) — à classifier (grounding sortie structurée)
- **Domaine owner:** intake `coaching_recommendation` / compilation `action_context`
- **Source amont:** le LLM **génère** un UUID d'item au lieu de le **sélectionner** dans le set de candidats réels
- **Symptôme visible:** aucun (réponse user correcte, carte « préparer le terrain » cohérente) — défaut latent dans la trace
- **Preuve système:** `action_context.plan_item_id=3db6278b-d744-4fc6-a7ed-fdccb195447a` → `select … where id=…` = 0 ligne ; vrai id sas = `3db6278b-bd59-4401-bbdf-80b575ee14bb` ; l'id fabriqué stitch le préfixe sas + suffixe de l'item `d62d828a-d744-4fc6-a7ed-fdccb195447a` ; `action_title` correct
- **Correction attendue (doctrine `00-architecture-doctrine.md`):** le `plan_item_id` n'est jamais un champ libre du modèle. Le modèle référence un item (titre/index) ; un mapping déterministe résout l'UUID réel avec validation stricte contre le set de candidats (rejet/erreur si non résolu). Empêche tout effet durable de se clé sur un id inexistant.
- **Statut:** open
- **Fix reference:** —
- **Tests requis:** invariant « tout `plan_item_id` émis existe dans les candidats du user » ; anti-faux-positif (id valide accepté) ; intégration (un effet keyé sur id invalide échoue proprement, pas de commit silencieux).

---

## R1-B04 — Échec de rappel d'un fait mémoire explicite (confabulation)

- **Tours:** 12 (contrat posé au Tour 4)
- **Famille:** BF-MEMORY-01 (Promesse mémoire non honorée)
- **Domaine owner:** memory planner (détection intention de rappel) + pipeline `coaching_recommendation`
- **Source amont:** `memory_plan` fixe `memory_mode=none` sur une demande directe de rappel ; l'historique en-contexte n'est pas exploité
- **Symptôme visible:** à « rappelle-moi pourquoi je me bats pour ça au fond ? », Sophia confabule une raison générique (« retrouver de l'air, liberté… ») et ne cite pas le fait demandé au Tour 4 (« mariage de mon frère en septembre, être clean et présent »)
- **Preuve système:** `memory_mode=none`, `retrieval=semantic_first` ; réponse sans référence au mariage ; contradiction avec l'accusé Tour 4 ; fait présent dans l'historique en-contexte du tour
- **Correction attendue:** une intention explicite de rappel (« rappelle-moi… », « pourquoi je fais ça déjà ») force `memory_mode≥light/targeted` et priorise les faits personnels récents (contexte + `memory_items`). À défaut du fait, admettre l'incertitude plutôt que confabuler. Une promesse « je garde en tête » (T4) instaure un contrat de rappel.
- **Statut:** open
- **Fix reference:** —
- **Tests requis:** « rappelle-moi pourquoi… » après un fait posé → `memory_mode≥light` et fait cité ; paraphrase (autres formulations de rappel) ; anti-faux-positif (petite causette sans intention de rappel reste `none`) ; anti-confabulation (fait absent ⇒ incertitude admise).

---

## R1-B05 — Feature non supportée : owner sous-optimal + réponse confuse

- **Tours:** 14
- **Famille:** BF-ROUTE-01 (Owner sous-optimal)
- **Domaine owner:** route policy product/feature_opportunity + application graduée de la préférence de ton
- **Source amont:** arbitrage owner (product_help capte une demande de capacité non supportée qui relève de `feature_opportunity` not-supported) ; compression excessive due à la préférence « cash » (T5) appliquée globalement
- **Symptôme visible:** « Pas de confirmation de cette alerte géolocalisée automatique ici. Si tu veux, je peux te dire comment la formuler en demande simple. » — l'user ne sait pas si la géoloc est possible ou non (positif : aucune hallucination de capacité)
- **Preuve système:** `response_owner=product_help` ; demande = capacité non supportée (géoloc/alerte auto)
- **Correction attendue:** une demande de capacité non supportée route `feature_opportunity` (branche not-supported) avec message explicite « ce n'est pas possible aujourd'hui, je le note comme retour produit ». La préférence « direct » ne doit pas raccourcir sous une borne basse de clarté.
- **Statut:** open
- **Fix reference:** —
- **Tests requis:** demande de capacité inexistante → owner `feature_opportunity` + impossibilité explicite ; anti-faux-positif (vraie question produit reste `product_help`) ; invariant « préférence direct ≠ message inintelligible ».

---

## Note transverse — Environnement (non-bug produit, hygiène QA)

- **Tours:** run entier (impact effets durables) ; 502 aux Tours 8, 10, 12
- **Famille:** BF-TEST-01 (Trace/suite/isolation malsaine)
- **Symptôme:** 3+ runs QA concurrents sur le même `user_id` Rose (`qa-rose-global15-20260703-r1`, `qa-global15-2026-07-03-rose-r1`, `web`) ; crashes/restart du conteneur edge-runtime sous charge → 502 upstream (retentés au point d'arrêt).
- **Preuve:** `chat_messages` de 4 scopes horodatés à quelques secondes d'intervalle ; `user_plan_item_entries` concurrentes `f9fc020b`/`099574ea`/`2d4854f9` ; conteneur `supabase_edge_runtime` « Up N seconds » répété.
- **Correction attendue:** isolation par run pour les personas partagés (connexion/persona jetable ou namespacing des effets `user_id` par run) ; sérialiser ou limiter la concurrence des runs QA sur un même persona pour éviter la contention provider/runtime.
- **Statut:** open (hygiène QA, pas un défaut conversationnel Sophia)
