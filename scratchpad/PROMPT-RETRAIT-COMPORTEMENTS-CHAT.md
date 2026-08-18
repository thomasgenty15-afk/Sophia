# Prompt — Retirer définitivement les comportements de collecte du chat

> À donner tel quel à un agent. Il est autoportant.
> Distinct du retrait de CODE grand public (`scratchpad/PROMPT-RETRAIT-GRAND-PUBLIC.md`) :
> ici on retire des **comportements** de fonctionnalités qui restent.

---

Tu exécutes la décision produit du 2026-08-08, écrite dans
`docs/fonctionnalites/conversation/README.md` (« la direction » et « ce
qui meurt en B2C »). Lis-le d'abord, en entier.

La règle qui a tout tranché : **on ne collecte une donnée que si quelque chose
en aval la consomme** — le plan, une ceinture de sécurité, ou le coach. Quatre
comportements ne passent pas ce test. Tu les retires, tu le prouves, et tu
poses le filet qui empêche leur retour.

## Les quatre retraits

### R1 — Le plafond de précision passe de 2 à 1

- `supabase/functions/_shared/keel/meal_precision.ts:519` :
  `MEAL_PRECISION_DAILY_CAP = 2` → `1`.
- Mets à jour les tests qui pinnent la constante (`meal_precision_test.ts:399`
  en assert la valeur ; `meal_precision_cap_test.ts` l'utilise) — ils doivent
  pinner **1** et le POURQUOI (« deux, c'était déjà une relance ; une, c'est un
  approfondissement »).
- Le commentaire d'en-tête du module porte la décision et sa date.
- ⚠️ Le plafond se compte sur le **jour local** (`meal_precision_cap.ts`,
  replis nommés `missing_local_date` / `read_failed` qui REFUSENT). À 1, un
  fuseau mal résolu devient visible là où 2 le masquait — ne « corrige » pas un
  refus légitime en le prenant pour un bug.

### R2 — Le rythme de question du compagnon meurt

- `supabase/functions/sophia-brain/agents/companion.ts` : le mécanisme
  `QuestionGuidance` (`"avoid_now" | "optional" | "ask_now"`, ~l. 35, 393-460),
  `QUESTION_RHYTHM_WINDOW_SIZE` et l'état `companion_question_rhythm` dans
  `temp_memory`.
- Ce qui meurt : la poussée à poser une question **parce qu'on n'en a pas posé
  depuis N tours** (`ask_now`). C'est un mécanisme d'engagement hérité du
  produit grand public.
- Ce qui reste : une question qui **sert la réponse en cours** (clarification,
  désambiguïsation) reste permise — la frontière est « la question sert-elle le
  tour ? », et elle est écrite dans le README du domaine.
- Retire aussi les blocs de prompt correspondants (les instructions EN et FR
  autour de `ask_now`, ~l. 424-460) et l'état mort de `temp_memory` (lecture
  ET écriture — un état écrit que plus personne ne lit est le prochain
  faux-vivant).

### R3 — Le « comment tu te sens ? » quotidien : vérifier, puis verrouiller

Le message du soir a déjà été inversé (le fait d'abord, la question seulement
quand elle est due — `decideAskCadence`, `PULSE_ASK_INTERVAL_DAYS = 3`). Ta
tâche n'est PAS de supprimer le tap : **il garde un consommateur** (l'axe faim
alimente la fiche FF-027, et le message du soir est le véhicule des pratiques
FF-029 et de la future recommandation FF-028).

- **Vérifie** qu'aucun chemin n'envoie la question d'état **quotidiennement** :
  lis `_shared/keel/daily_pulse.ts` (`decideAskCadence` et ses constantes) et
  `keel-daily-pulse-v1`, et prouve par un test que sur 7 jours consécutifs sans
  situation particulière, la question part au plus ⌈7/3⌉ fois — le fait, lui,
  peut partir chaque soir où il y a matière.
- **Verrouille** : un test qui échouera si quelqu'un remet la cadence à 1 jour
  sans décision écrite (pinne la constante ET son pourquoi).
- Ne touche ni au fait du soir, ni aux ceintures (`VERDICT_PATTERNS`,
  `allowedNumbers`, `minor_quantity`) — elles sont partagées avec le bilan
  hebdo et la fiche FF-011 les étendra au chat.

### R4 — Les 6 axes du dimanche deviennent B2B-only

Le point hebdo B2C se réduit à : **poids, tour de taille**. Les six axes notés
(énergie, sommeil, etc.) ne sont consommés que par la synthèse coach — ils ne
se collectent donc que là où un coach existe.

- Frontend : `frontend/src/keel/components/WeeklyCheckInDialog.tsx` — les six
  axes ne se rendent que si l'élève est rattaché à un coach **humain** (pas le
  coach `house` : la méthode maison n'a pas de synthèse). Poids et tour de
  taille restent pour tous. Gate de montage : ne pas afficher puis cacher.
- Backend : les lecteurs (`_shared/keel/week_review.ts`,
  `week_review_io.ts::biofeedbackAxes`, `composeWeekReviewBody`) doivent
  **dégrader proprement** sur un biofeedback sans axes — un dimanche
  poids-seul est désormais le cas NOMINAL en B2C, pas un état partiel. Vérifie
  chaque lecteur ; celui qui traite « pas d'axes » comme « pas de revue »
  casse la boucle du poids.
- La contrainte de base (`student_daily_checkins_axis_coherent_check` — autre
  table, autre chose) ne bouge pas ; ne confonds pas le tap du soir et la
  revue du dimanche.
- Écris le POURQUOI dans l'en-tête du composant et du module : « les axes ne
  sont collectés que là où quelqu'un les lit ; en B2C personne ne les lit »
  — une contrainte documentée survit à sa cause, c'est voulu.

## Le filet — le test de propriété

Le retrait le plus important n'est pas un diff, c'est un test qui **empêche le
retour**. Un prompt sait redevenir bavard à la retouche suivante ; ce dépôt a
mesuré que les correctifs prompt-only régressent en run réel.

Écris (ou étends, s'il existe un harnais adapté dans
`sophia-brain/test_harness/`) un test de propriété : **sur 20 tours ordinaires
consécutifs d'un élève provisionné, zéro demande non sollicitée** — ni « t'as
mangé quoi ? », ni « comment tu te sens ? », ni relance d'une question restée
sans réponse. Les demandes légitimes (adossées à un fait que la personne vient
de donner : question d'approfondissement, invitation photo) sont comptées et
plafonnées à **une par jour**.

## Règles du dépôt — non négociables

1. **Jamais seul** : `supabase db push`, `db reset`, `functions deploy`,
   `secrets`, `link`. Tu donnes la commande exacte, l'humain l'exécute.
2. **Base locale partagée** — jamais de `db reset` ; migrations par
   `docker exec supabase_db_Sophia_2 psql …` + enregistrement de version.
3. **Tests Deno** avec l'environnement purgé (sinon 114 faux rouges) :
   ```
   env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
     deno test --allow-read --allow-env --no-check <cibles>
   ```
4. **Typecheck** : `npx tsc -b` (le tsconfig racine du frontend ne vérifie
   rien). **Vitest** pour le frontend.
5. Rouges préexistants prouvés antérieurs par `git stash -u`, listés au
   journal.
6. **Un commit par retrait** (R1 à R4 + le filet = 5 commits max), messages en
   français, `Co-Authored-By` requis. Aucun push.
7. Toute garde retirée ou modifiée se teste **dans les deux langues**.

## Ce que tu rends

`scratchpad/RETRAIT-COMPORTEMENTS-LOG.md` :

1. Par retrait : le diff résumé, la preuve (test vert + sortie), et ce qui a
   été **volontairement laissé** (le fait du soir, les ceintures, le tap).
2. Le test de propriété : son chemin, sa sortie, et ce qu'il attrape.
3. Les surprises — tout endroit où le code réel contredisait la fiche (ex. :
   une cadence déjà différente de la constante) se consigne, ne se « répare »
   pas en silence.
4. Les commandes restantes pour l'humain, en un bloc.

## La règle qui prime

Chaque retrait doit laisser le système **plus simple ET plus verrouillé**. Si
un retrait casse un consommateur légitime (le poids du dimanche, la faim de
FF-027, le véhicule du soir), arrête-toi et consigne — la fiche prime sur le
prompt, et l'humain tranche.
