# Bug Sheet — Potion Support Post-fix Adversarial R1 (2026-07-16)

Run: `potion_support_postfix_adversarial_20260716_r1`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-16-potion-support-postfix-adversarial-r1.md`  
Verdict global: **red**. Les six connexions temporaires ont été nettoyées.

## R1-B01 — J1 rejette une preuve d'activation correcte à cause de sa fraîcheur

- **Tours**: ouverture proactive J1 ; callback WhatsApp après « Oui ! »
- **Famille**: `BF-PROACTIVE-01` — preuve -> décision proactive cassée
- **Domaine owner**: reducer/runtime potion, `preparePotionSupportOpening`
- **Source amont**: le reducer peut marquer une preuve `potion_answer` comme `fresh`, tandis que la validation runtime définit implicitement `fresh` comme « référence un message chat user du segment ». Les deux couches donnent donc deux sens différents au même champ.
- **Symptome visible**: aucun message J1 ; après le template WhatsApp, le bouton est consommé sans ouverture dynamique.
- **Preuve systeme**: focus `unresolved_thread`, texte exact et `evidence_refs=potion_answer.pressure_source`, puis `skip_no_grounding` et slot `cancelled`.
- **Correction attendue**: modéliser explicitement la provenance/fraîcheur (`activation_baseline`, `fresh_user_chat`, `carried_ledger`) et faire sélectionner un focus J1 compatible avec la baseline. La validation doit contrôler ce contrat, pas déduire une catégorie depuis le type de source après coup.
- **Tests requis**: J1 baseline seul ; J1 baseline paraphrasée ; anti-FP preuve assistant-only ; J2 fresh chat ; mauvaise étiquette de fraîcheur ; callback template Oui.
- **Statut**: open

## R1-B02 — Un progrès frais masque le fil non résolu porté par la même preuve

- **Tours**: admission du scénario de préemption
- **Famille**: `BF-PROACTIVE-01` — preuve -> décision proactive cassée
- **Domaine owner**: sélection du focus dans le reducer potion
- **Source amont**: le reducer produit à la fois un `progress_fact` valide et un `open_thread` frais, mais choisit `focus_decision.kind=progress`. Le runtime exige ensuite qu'un fil frais soit couvert par un focus `unresolved_thread` et annule le slot.
- **Symptome visible**: aucune ouverture malgré « la pause aide, mais la tension revient si quelqu'un coupe ».
- **Preuve systeme**: même message user dans les refs du progrès et du fil ouvert ; décision finale `skip_no_grounding`.
- **Correction attendue**: séparer extraction des unités et sélection. La priorité `fresh unresolved_thread > progress > baseline` doit appartenir à un contrat/policy stable sur les unités validées, pas à une rédaction libre contredite par un guard aval.
- **Tests requis**: progrès seul ; progrès + fil résiduel même message ; progrès + fil plus récent ; fil assistant-only ; contradiction et paraphrase.
- **Statut**: open

## R1-B03 — `skip_resolved` terminalise la campagne avec un fil ouvert et une boundary locale

- **Tours**: ouverture proactive J2 du rerun complet
- **Famille**: `BF-PROACTIVE-01` — preuve -> décision proactive cassée
- **Domaine owner**: décision terminale reducer/runtime potion
- **Source amont**: le runtime honore `skip_resolved` sans exiger une preuve de résolution cohérente avec `open_threads`; la seule boundary détectée cible `conversation_session`.
- **Symptome visible**: J2 non envoyé, reminder terminé, J3 inatteignable alors que « la gorge se serre » reste ouvert.
- **Preuve systeme**: ledger avec open thread et progress fact, `boundary_target=conversation_session`, décision `skip_resolved`, terminal reason `completed_resolved`.
- **Correction attendue**: rendre la terminalité default-deny : `skip_resolved` exige absence de fil ouvert, preuve user de résolution et cohérence de portée. Une boundary de session ferme Presence uniquement ; seule une boundary campagne ou une résolution prouvée peut terminer sept jours.
- **Tests requis**: clôture « pour ce soir » ; résolution émotionnelle explicite ; opt-out campagne ; fil ouvert + clôture locale ; contradiction ancien/nouveau ; rerun J1 -> J3.
- **Statut**: open

## R1-B04 — Safety web ne terminalise pas la campagne et le backstop ne la voit pas

- **Tours**: premier tour safety ; scheduler après fenêtre calme
- **Famille**: `BF-ROUTE-04` — safety ne préempte pas tout
- **Domaine owner**: routeur safety, `cancelPotionSupportCampaign`, backstop `process-checkins`
- **Source amont**: l'appel post-route ne donne aucune preuve d'annulation persistée et son échec est seulement loggé en warning ; au delivery, le backstop consulte l'active skill WhatsApp alors que le flow safety actif est sur le scope web.
- **Symptome visible**: reminder `active`, J2-J7 `pending`; J1 n'est bloqué que par `skip_no_grounding`, pas par safety.
- **Preuve systeme**: réponse owner `safety`, puis aucune metadata `cancelled_safety`; état `safety_crisis` présent sur web ; second scheduler ne terminalise rien.
- **Correction attendue**: produire un outcome durable et vérifié `cancelled_safety` dès toute route safety, avec client privilégié obligatoire et idempotence. Le scheduler doit vérifier un statut campagne terminal et/ou un ledger safety cross-channel, jamais uniquement `temp_memory` WhatsApp.
- **Tests requis**: safety initiée web ; safety initiée WhatsApp ; safety pendant Presence potion ; échec du client d'annulation ; retry idempotent ; scheduler après 2 h et après 24 h ; absence totale de template futur.
- **Statut**: open — bloquant release

## R1-B05 — Une mise à jour émotionnelle sans demande de dispositif entre dans coaching

- **Tours**: intersession J1 -> J2 ; premier essai de course
- **Famille**: `BF-ROUTE-01` — mauvais owner sélectionné
- **Domaine owner**: dispatcher global / arbitrage Présence vs `coaching_recommendation`
- **Source amont**: le signal `action_linked_emotional_friction` suffit à ouvrir coaching même quand le `memory_plan` décrit `supportive_presence` et qu'aucun pull vers une carte, potion, technique ou plan n'est exprimé.
- **Symptome visible**: Sophia demande de choisir un axe de coaching, puis ignore une fois « pas construire un exercice ; je m'arrête là ».
- **Preuve systeme**: owner `coaching_recommendation`, reason `coaching_recommendation_signal`; sur une paraphrase voisine, Presence gagne, ce qui montre une frontière instable.
- **Correction attendue**: réserver l'entrée coaching à une demande structurée explicite de dispositif/levier. Les dépôts émotionnels sans outil doivent rester Presence/normal. Le fix appartient au dispatcher et au flow coaching, pas au runtime potion.
- **Tests requis**: demande explicite de carte ; demande de technique ; simple état émotionnel ; « tu ferais quoi ? » ; refus d'exercice ; clôture ; topic change ; paraphrases.
- **Statut**: open — dépendance externe à potion support

## Positifs vérifiés

- `sophia_potion_reminder_v1` est bien le template envoyé hors fenêtre 24 h.
- Le template crée un pending et n'exécute pas l'ouverture avant le bouton user.
- Un pending Daily et un pending Weekly annulent le slot potion avec `potion_support_preempted_by_pending_daily_weekly`.
- Un message arrivé après `read_cutoff` et pendant la génération fait passer le slot en `retrying` avec `potion_support_activity_during_generation`; aucun draft obsolète n'est envoyé.
- Sur le scénario concurrent, `opening_evidence_refs` cite exactement le message user portant le focus frais.
- Les request ids principaux n'ont aucun `system_error_logs`.
- Aucun code produit n'a été modifié pendant le run.

## Statut du bug précédent R2-B01

- La provenance structurée est correcte dans le scénario concurrent positif.
- Aucun J3 visible réussi n'a été obtenu : le rerun complet s'arrête à J2.
- `2026-07-15-potion-support-j2-j3-intersession-r2-bugs.md#R2-B01` reste donc `fixed_in_code_pending_real_qa`; ce run ne permet pas de le fermer.
