# FF-066 · L'aide sur l'app — Sophia sait dire où est le bouton

| | |
|---|---|
| **Identifiant** | `FF-066-l-aide-sur-l-app` |
| **Statut** | 🟠 En cours — lots 0 à 4 construits et mesurés en local le 2026-09-23, **non commités, non mis en ligne** ; les membres de foyer n'ont pas encore l'aide (§11) |
| **Date** | 2026-09-23 |
| **Autorité produit** | [conversation/README.md](README.md) (T7, T9) · [le-foyer/README.md](../le-foyer/README.md) (une personne gouverne le menu) · `CLAUDE.md` (« KEEL » n'apparaît sur aucune surface lue par un utilisateur, données injectées comprises) |
| **Dépend de** | [FF-023](FF-023-la-conversation-normale.md) — la réponse est écrite par le composeur de la conversation normale |
| **Effort estimé** | 5 jours pour les lots 0 à 3 ; 1 à 2 jours pour le lot 4 selon les arbitrages |

---

## 1. Le problème

Une personne demande à Sophia « comment je prends mon plat en photo ? », « est-ce
que c'est compté ? », « où est ma liste de courses ? », « comment je résilie ? ».
Aujourd'hui Sophia ne sait pas répondre, et en français elle répond **faux** :

- **Le prompt français décrit l'ancien produit.** Le bloc
  `PLATFORM_SKETCH_FOR_NORMAL_REPLY` (`sophia-brain/agents/companion.ts:939`) dit
  « Plan : actions, missions, habitudes et ajustements · Inspirations ·
  Préférences coach · Sections à nommer : Plan, Inspirations ». Il part à chaque
  tour en français. Un test l'oblige à rester
  (`agents/companion_prompt_contract_test.ts:37` et `:40`). Aucune de ces
  sections n'existe.
- **En anglais, il n'y a rien.** La règle `Platform boundary`
  (`companion.ts:836`) dit « renvoie vers l'app » sans dire où.
- **L'ancienne aide est partie sans remplaçante.** La lane `product_help`
  (catalogue de 1 106 lignes, enchaînement de 1 574 lignes) a été retirée le
  2026-08-06, commit `d9d8ddcb`. Elle décrivait l'ancien produit.
- `sophia-brain/knowledge/frontend-site-map.ts` liste les routes de l'ancien
  produit (`/dashboard`, `/grimoire`…). Aucun fichier ne l'importe.

**Ce que ça coûte de ne rien faire.** La personne suit une indication fausse,
cherche un écran qui n'existe pas, et conclut que l'app est cassée ou que Sophia
ne sait pas de quoi elle parle. Les deux ferment la porte du chat
(README, « ce que ça coûte de se tromper »).

## 2. Job stories

- Quand je viens de manger dehors et que je veux que ça compte, je veux savoir en
  une réponse où est le bouton photo et ce qui est enregistré, pour ne pas fouiller
  les écrans.
- Quand je cherche une chose que l'app ne fait pas (échanger un plat sur un plan
  adopté, scanner un code-barres), je veux un « non » net et ce que je peux faire
  à la place, pour ne pas chercher un bouton qui n'existe pas.
- Quand je suis membre d'un foyer et que je ne vois pas le bouton pour composer,
  je veux savoir pourquoi, pour ne pas croire à une panne.

## 3. Périmètre

### Dans le périmètre

- 46 fiches couvrant les écrans du produit B2C : `/app/setup`,
  `/app/plan`, `/app/today`, `/app/chat`, `/app/progress`, `/app/about-you`,
  `/app/household`, `/app/billing`, `/account`, `/join-household`, le lien de
  désinscription des e-mails. Liste au §5.
- Les fiches en français et en anglais.
- Des variantes selon la personne qui demande : titulaire du foyer, membre ayant
  réclamé sa place, personne seule ; et selon l'objectif (perte de poids, prise
  de muscle, maintien), parce que le bouton « + » n'existe que pour les deux
  premiers (`KeelAppShell.tsx`, `api/slotMeal.ts:163`).
- Les réponses « ça n'existe pas » (fiche `unknown_feature`).
- Le retrait du bloc périmé du prompt français, et une règle qui interdit à
  Sophia de nommer un écran qu'on ne lui a pas donné.
- Des tests qui font échouer la livraison quand un bouton cité change de nom.
- Une ligne de log à chaque tour, pour compter.

### Hors périmètre — engageant

| ❌ Interdit | Pourquoi |
|---|---|
| L'aide n'agit pas : elle ne compose pas, ne coche pas, ne résilie pas | le chat n'écrit pas le plan ; une aide qui agit devient un effet, avec ses gardes et son registre |
| Pas de fiche sur les écrans coach et pro | ils sont masqués (`VITE_B2C_ONLY`) ; s'ils rouvrent, leurs fiches seront un lot à part |
| Aucune fiche ne contient « KEEL » | le texte injecté au modèle est une surface utilisateur : la dernière fuite est passée par les données |
| Pas de base de données de fiches, pas de recherche par similarité (pgvector) | 46 fiches tiennent dans un fichier ; le dispatcher les trie déjà dans l'appel qu'il fait à chaque tour |
| Pas de lane dédiée, pas d'état sur plusieurs tours | une question d'aide se règle en un tour ; l'ancienne lane a coûté 1 574 lignes |
| Pas de fiche dont les libellés ne sont pas vérifiés par un test | une fiche non vérifiée ment dès le prochain renommage |
| Pas de page « Aide » dans l'app dans ce chantier | possible plus tard depuis la même source, sans aucun coût en tokens |

## 4. Le circuit

```
la personne écrit « comment je prends mon plat en photo ? »
        │
        ▼
dispatcher (appel déjà fait à chaque tour)
        │  nouveau : skill_signals.app_help = { detected: true, topics: ["meal_photo_how", "meal_photo_counted"] }
        │  le signal s'AJOUTE : il ne change pas qui répond (même principe que rule_question)
        ▼
routers.ts ── inchangé : crise, plancher TCA et détresse passent toujours devant
        ▼
run.ts, à côté de rule_question (≈ ligne 6706)
        │  1. garde au plus 3 identifiants connus de cards.ts
        │  2. rôle (household_members) et objectif (student_goals) :
        │     lus en base (`loadAppHelpViewer`), seulement si detected
        │     sous le plancher TCA ou pour un mineur : fiches de chiffres retirées
        │  3. choisit la variante de chaque fiche
        │  4. construit le bloc « AIDE SUR L'APP » (fr ou en selon la langue de réponse)
        │  5. l'ajoute à injectedContext (≈ ligne 6845)
        │  6. écrit la ligne de log keel/app_help (à chaque tour, détecté ou non)
        ▼
composeur (companion) : répond à partir du bloc, et seulement de lui
```

`injectedContext` est placé tôt dans `buildContextString`
(`context/loader.ts:1214`). Il survit donc à la coupe par la fin du prompt, qui
tombe au-delà de 8 000 tokens (`companion.ts:41`).

## 5. Modèle de données

**Rien en base.** Une seule source : `supabase/functions/_shared/keel/app_help/cards.ts`,
**sans aucun import** (données pures), pour que les tests vitest du front puissent
l'importer comme ils importent déjà `_shared/keel/tokens.ts`
(`MouthFormDialog.tsx:41`).

Forme d'une fiche (indicative) :

```ts
type AppHelpCard = {
  id: AppHelpTopicId;
  /** Une ligne, en français : c'est ce que lit le dispatcher pour choisir. */
  dispatcherHint: string;
  /** La réponse, 3 à 6 lignes, par langue. Une variante par rôle / objectif quand ça change la réponse. */
  answer: Record<"fr" | "en", string[]>;
  variants?: Array<{
    when: { role?: "owner" | "member" | "solo"; goal?: Array<"fat_loss" | "muscle_gain" | "maintenance"> };
    answer: Record<"fr" | "en", string[]>;
  }>;
  /** Chaque bouton cité : sa clé i18n et son texte exact, vérifiés par test. */
  labels: Array<{ key: string; fr: string; en: string }>;
  /** Chaque route citée, vérifiée contre App.tsx. */
  routes: string[];
  /** Ce qu'il ne faut pas promettre. */
  doesNotExist?: Record<"fr" | "en", string[]>;
};
```

**La liste des identifiants** (source des faits : les deux inventaires du
2026-09-23 ; **chaque fait est revérifié dans le code avant d'être écrit**, lot 1) :

| Famille | Identifiants |
|---|---|
| Le plan | `plan_create` · `plan_composing_time` · `plan_adopt` · `plan_change_dish` · `plan_window` · `plan_absence` · `plan_settings` · `plan_one_session` · `plan_envy` · `plan_end_feedback` · `plan_calories_display` |
| Cuisine et courses | `shopping_list` · `shopping_tick` · `cooking_sessions` · `boxes_freezer` |
| Suivi | `meal_default_eaten` · `meal_not_eaten` · `meal_photo_how` · `meal_photo_counted` · `meal_describe` · `meal_correct_past` · `weight_entry` · `progress_page` · `energy_number_origin` |
| Foyer | `household_add_person` · `household_invite` · `household_member_rights` · `household_who_composes` · `household_allergy_rule` · `household_remove` · `household_paused` |
| Sophia | `notifications_off` · `sophia_evening_messages` · `sophia_memory` · `sophia_can_do` · `voice_and_push` · `install_app` |
| Compte et abonnement | `price_trial` · `subscription_cancel` · `language_change` · `email_change` · `password_change` · `account_delete` · `data_export` · `emails_unsubscribe` |
| Le reste | `unknown_feature` — injecte les titres de toutes les fiches, pour que Sophia réponde « non, voici ce qui existe » |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Une fiche ne part au modèle **que sur le tour où la question est posée**, au plus 3 par tour | coût : environ +300 à +600 tokens sur ces tours-là, zéro sur les autres (mesure au §10). Mettre tout le catalogue dans le prompt coûterait 5 000 à 6 000 tokens à chaque tour, et la coupe à 8 000 tokens le ferait sauter, ou ferait sauter la mémoire |
| R2 | Sophia ne nomme un écran ou un bouton **que s'il figure dans le bloc du tour**. Sans bloc, elle n'en nomme aucun | c'est la seule règle qui l'empêche d'inventer. Remplace `PLATFORM_SKETCH_FOR_NORMAL_REPLY` et la ligne `Platform boundary`, dans les deux langues |
| R3 | Chaque libellé cité par une fiche est **égal au texte affiché**, vérifié par test en français et en anglais | un bouton renommé doit faire échouer un test, pas rendre une réponse fausse (T9 : les deux langues) |
| R4 | Le signal **s'ajoute**, il ne choisit pas qui répond | une question sur l'app posée dans un message de crise reste un tour de crise (T7). Même principe que `rule_question` (`dispatcher.prompts.ts`, règle 6-quinquies) |
| R5 | La **variante est choisie par le runtime** à partir de la base, jamais par le modèle | même doctrine que `keel_student` : ce qui décide d'une route vient de la base, pas du texte |
| R6 | La fiche dit **ce que fait le code**. Quand la doc produit dit autre chose, on corrige l'un des deux, et la fiche ne tranche pas en silence | voir Q7 : la doc interdit la coche automatique, le code en fait |
| R7 | La liste des identifiants dans le prompt du dispatcher est **générée depuis `cards.ts`** | deux listes tenues à la main finissent par diverger ; une seule source ne le peut pas |
| R8 | Cette liste vit dans la **partie fixe** du prompt du dispatcher (elle ne dépend que de `keelStudent`) | sinon elle sort du cache et se paie en entier à chaque tour |
| R9 | Une ligne `keel/app_help` part **à chaque tour d'utilisateur**, détecté ou non | sans le dénominateur, « 0 aide » ne se distingue pas de « 0 tour observé » (même raison que `keel/rule_question`) |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le dispatcher ne détecte pas la question | pas de bloc : Sophia ne nomme aucun écran et renvoie vers le menu. Visible dans le log (`detected: false`) et dans le banc |
| Le dispatcher renvoie un identifiant inconnu | le parseur le jette ; s'il ne reste rien, `unknown_feature`. Log `dropped_ids` |
| La lecture de l'objectif échoue | variante générale de la fiche, qui énonce la condition (« le bouton + apparaît si ton objectif est de perdre du poids ou de prendre du muscle »). Jamais la variante d'un autre profil |
| Un bouton change de nom dans `fr.ts` ou `en.ts` | test rouge avant livraison (R3) |
| Un bouton change d'écran sans changer de nom | **non détecté par les tests.** Seul le test des routes attrape un écran supprimé. Contre-mesure : la personne qui déplace un bouton relit les fiches qui citent sa clé (le test affiche la liste) |
| Le prompt dépasse 8 000 tokens | le bloc survit : il est dans `injectedContext`, placé en tête |
| Le même tour arme l'invitation photo (FF-025) et la fiche `meal_photo_how` | Sophia dirait deux fois « envoie une photo ». Le bloc d'aide gagne, l'invitation n'est pas ajoutée à ce tour, et le log le compte |

## 8. Critères d'acceptation

```gherkin
Étant donné une personne seule, objectif perte de poids, compte en français
Quand elle écrit « comment je prends mon plat en photo ? »
Alors la réponse cite « Photo d'un repas non prévu » et le bouton « + »
Et ne nomme aucun autre écran
Et le log keel/app_help porte detected=true et topics contenant meal_photo_how

Étant donné la même personne, compte en anglais
Quand elle écrit « how do I send a photo of my meal? »
Alors la réponse cite le libellé anglais exact tiré de en.ts

Étant donné une personne dont l'objectif est le maintien
Quand elle demande comment envoyer une photo
Alors la réponse ne cite pas le bouton « + »

Étant donné un membre ayant réclamé sa place dans un foyer
Quand il demande « comment je change le menu ? »
Alors la réponse dit que c'est la personne qui tient le foyer qui compose
Et ne lui propose aucun moyen de composer

Étant donné n'importe quel compte
Quand il écrit « je peux scanner un code-barres ? »
Alors la réponse dit que ça n'existe pas et nomme ce qui existe à la place
Et ne cite aucun écran absent de la fiche unknown_feature

Étant donné un message qui n'est pas une question sur l'app (« j'ai mangé une pizza ce midi »)
Alors le log porte detected=false et aucun bloc n'est injecté

Étant donné un message de crise qui contient aussi une question sur l'app
Alors la route de crise est inchangée

Étant donné qu'un libellé cité par une fiche est modifié dans fr.ts
Alors le test des libellés échoue et nomme la fiche

Étant donné le prompt français du composeur
Alors il ne contient plus « Inspirations » ni « PLATFORM_SKETCH_FOR_NORMAL_REPLY »
```

## 9. Rabbit holes

- **`/account` est en anglais, écrit en dur** (`frontend/src/components/UserProfile.tsx`,
  hors i18n). Le test des libellés ne peut pas vérifier ses boutons par une clé.
  Soit on traduit `/account` d'abord (lot 4, Q3), soit les fiches du compte
  citent le littéral du TSX et le test le lit dans le fichier. Recommandé :
  traduire.
- **Fichiers front en cours de modification par une autre session** (non
  commités au 2026-09-23) : `fr.ts`, `en.ts`, `StudentWeekPlanPage.tsx`,
  `TodayPage.tsx`, `StudentProgressPage.tsx`, `KeelAppShell.tsx`. Le lot 4 les
  touche : il attend que ce travail soit commité. **Jamais de `git stash`**, qui
  emporterait leur travail.
- **Le runtime edge garde en cache les `_shared` modifiés.** Avant tout vrai
  tour : `./scripts/local_extend_kong_functions_timeout.sh`, puis redémarrer
  `supabase_edge_runtime_Sophia_2`.
- **Un signal de plus peut en voler d'autres.** `plan_question` a déjà capté
  38 % de tours qui ne le concernaient pas. `app_help` s'ajoute sans changer qui
  répond, mais le modèle pourrait l'émettre à la place de `plan_feedback`,
  `profile_statement` ou `rule_question`. Le banc mesure leurs taux avant et après.
- **Une fiche importée par vitest ne doit rien importer.** Un import `npm:` ou
  par URL casse vitest.
- **La liste grossit.** Au-delà d'environ 200 fiches, le bloc du dispatcher
  coûte trop cher : il faudra alors trier les fiches autrement.

## 10. Ce qu'on mesure

**Point de départ** (local, `llm_usage_events`, 30 derniers jours, 38 tours) :

| | Tokens d'entrée par tour | Dont déjà en cache |
|---|---|---|
| Dispatcher | ~18 900 | ~12 300 |
| Composeur | ~6 500 | ~2 300 |

Prompt du dispatcher pour un utilisateur : 61 059 caractères, ~17 000 tokens.

**Le banc (lot 3).** Environ 45 questions × 2 langues, plus 30 messages qui ne
sont **pas** des questions sur l'app (repas déclaré, question sur un aliment du
plan, retour sur le plan, détresse légère). Trois comptes : titulaire seul en
perte de poids, titulaire d'une famille en maintien, membre ayant réclamé sa place.

| Mesure | Seuil proposé |
|---|---|
| La bonne fiche est dans les identifiants émis | ≥ 90 % |
| La réponse cite un écran ou un bouton absent du bloc | 0 |
| Libellés cités mot pour mot | ≥ 95 % |
| Messages hors aide qui déclenchent `app_help` | ≤ 5 % |

**La contre-mesure** — ce qui dirait que le chantier coûte plus qu'il ne rapporte :
- les tokens **non mis en cache** du dispatcher augmentent de plus de 1 000 par tour ;
- ou les taux de `plan_feedback`, `profile_statement` et `rule_question` baissent sur leur propre banc.

**En production**, le log `keel/app_help` dit quelles questions reviennent le
plus. Une fiche très demandée signale un écran qui ne s'explique pas tout seul :
c'est une information produit, pas seulement une charge du chat.

## 11. Questions ouvertes

### Arbitrées le 2026-09-23 (décisions déléguées par le propriétaire)

| # | Question | Décision | Où |
|---|---|---|---|
| Q1 | Où mettre l'interrupteur des calories ? | Sur `/app/about-you` (« Ce que Sophia sait »), section « Ce que ton plan affiche » : un écran où l'on vient régler. Une seule adresse, comme le voulait `energySwitchesPlacement.int.test.ts` ; la fenêtre de `/app/plan` n'avait plus d'ouvreur | `StudentKnownPage.tsx` (`PlanNumbersSection`), retrait dans `StudentWeekPlanPage.tsx`, `catalog.ts` |
| Q2 | « Je valide » sur « Ta part » ? | **Retiré.** Il affichait « Validé. » sans rien écrire, et aucune table ne porte cet accusé | `MyShareCard.tsx`, `StudentWeekPlanPage.tsx`, clés `plan.mine.approve*` retirées |
| Q3 | `/account` ? | Traduit en entier (fr/en). L'onglet abonnement ne garde qu'une phrase et un lien vers `/app/billing` (`/coach/billing` pour un coach). La pastille « Niveau : Initié… Maître bâtisseur » (vocabulaire de jeu de l'ancien produit) est retirée | `UserProfile.tsx`, `account/*.tsx`, namespace `account.*` |
| Q4 | Phrases « coach » en B2C | Réécrites en texte neutre, vrai dans les deux mondes : `today.no_plan_body`, `student_progress.restricted`, `plan.section.goal.intro`, aide de langue de `/account`, `install_app.lead` | `fr.ts`, `en.ts` |
| Q5 | `/installer-app` dans le menu ? | Oui, entrée « Installer l'app ». La page est traduite | `KeelAppShell.tsx`, `InstallAppGuide.tsx` |
| Q6 | Changer son mot de passe dans l'app ? | Oui, au plus simple : « Changer mon mot de passe » envoie le lien de réinitialisation à l'adresse du compte (même appel que « Mot de passe oublié ? ») | `UserProfile.tsx` |
| Q7 | La doc ou le code, pour la coche automatique ? | Le code : la doc avait un no-go resté en place après la décision humaine du 2026-08-18. Le README de la conversation est amendé | `conversation/README.md` |
| Q8 | Pas de photo depuis le chat pour le maintien : voulu ? | Voulu (FF-062). Vérifié : « Ajouter un repas » dans « Suivi » accepte une photo pour tous les objectifs. Les fiches le disent | fiches `meal_photo_how`, `meal_describe` |

### Trouvés en construisant, réparés au passage

- Le questionnaire de fin de plan affichait ses questions **en anglais** à un
  utilisateur français (`PlanFeedbackDialog.tsx` lisait `.en` en dur alors que le
  module porte le français) : il suit maintenant la langue de la page.
- « Retirer du foyer » effaçait une personne **au premier clic** ; le commentaire
  du code promettait une confirmation en deux temps. Elle existe maintenant.
- Le message du chat vide invitait à « envoyer une photo », bouton absent pour
  l'objectif maintien : il annonce maintenant l'aide sur l'app.
- `household.member.goal_from_profile` renvoyait vers « À propos de toi », écran
  retiré : la phrase ne nomme plus d'écran.

### Encore ouvertes

- **Les membres de foyer n'ont pas l'aide.** Un compte qui réclame sa place n'a
  jamais `keel_role = 'student'` : le signal `app_help` n'est pas proposé à son
  dispatcher, et tout le reste de la couche élève du chat est éteint (langue du
  compte, foyer, faits déclarés). Mesuré au banc : réponse en anglais à un membre
  français, sans fiche. Chantier proposé à part — c'est une décision produit et
  de sécurité, pas une retouche de cette fiche.
- La grille d'absences n'offre que des cases (les états « Dehors » / « Pas là »
  existent en i18n mais ne sont passés par aucun écran).
- `meals.picker.no_rhythm` renvoie vers une section de `/app/plan` qui n'existe
  plus.
- Le README de `analyze-meal-photo-v1` dit encore « pas de calories ».

## 12. Les lots

Ordre : 0 → 1 → 2 → 3. Le lot 4 avance en parallèle, dès que le §11 est tranché
et que les fichiers front sont commités par l'autre session.

### Lot 0 — Arrêter les réponses fausses · 0,5 jour

- `sophia-brain/agents/companion.ts` :
  - retirer `PLATFORM_SKETCH_FOR_NORMAL_REPLY` (`:939`) ;
  - remplacer `Frontière plateforme` (`:934`) et `Platform boundary` (`:836`) par
    la règle R2, dans les deux langues.
- `agents/companion_prompt_contract_test.ts` : inverser les assertions `:37` et
  `:40` (le bloc et « Inspirations » doivent être **absents**).
- Supprimer `sophia-brain/knowledge/frontend-site-map.ts`, après avoir revérifié
  qu'aucun fichier ne l'importe.
- Contrôle : `scripts/agent-gate.sh`.
- Mise en ligne, par toi : `supabase functions deploy sophia-brain`.

Effet attendu : Sophia cesse d'inventer des sections. Tant que le lot 2 n'est
pas livré, elle ne nomme plus aucun écran.

### Lot 1 — Les fiches · 1,5 à 2 jours

- `supabase/functions/_shared/keel/app_help/cards.ts` : les 46 fiches du §5,
  en français et en anglais, avec leurs variantes. Chaque fait est revérifié à
  sa ligne de code avant d'être écrit.
- `_shared/keel/app_help/cards_test.ts` (deno) :
  - identifiants uniques ;
  - chaque fiche existe dans les deux langues, en 6 lignes au plus ;
  - aucune fiche ne contient « KEEL » ni « coach » ;
  - taille maximale d'un bloc de 3 fiches.
- `frontend/src/keel/i18n/appHelpLabels.int.test.ts` (vitest) :
  - chaque libellé est égal à sa valeur dans `fr.ts` et `en.ts` ;
  - chaque route citée existe dans `App.tsx`.
- Aucun changement du chat dans ce lot.

### Lot 2 — Le branchement · 1,5 jour

- `contracts/turn_frame.v1.ts` : type `DispatcherAppHelpSignal { detected; topics? }`
  et champ `app_help` dans `DispatcherSkillSignals`.
- `router/dispatcher.ts` : valeur par défaut `{ detected: false }`.
- `dispatcher/dispatcher.v2.ts` : `sanitizeAppHelpSignal`, qui ne garde que des
  identifiants connus, 3 au plus (sur le modèle de `sanitizeRuleQuestionSignal`).
- `dispatcher/dispatcher.prompts.ts` : règle 6-sexies, envoyée seulement à un
  utilisateur (`keelStudent`), liste générée depuis `cards.ts` (R7, R8), avec
  des exemples en français et en anglais et ce qui **n'est pas** de l'aide :
  - « j'ai mangé dehors » est une déclaration de repas ;
  - « je peux remplacer le riz ? » est une question sur un aliment du plan ;
  - « pourquoi jamais de poulet ? » relève de `rule_question`.
- `_shared/keel/app_help/block.ts` : choix de la variante, construction du bloc,
  langue de réponse, et chemin sans bloc en cas d'échec.
- `router/run.ts` :
  - branchement à côté de `rule_question` (≈ `:6706`) ;
  - bloc ajouté à `injectedContext` (≈ `:6845`) ;
  - log `keel/app_help` ;
  - arbitrage avec l'invitation photo (§7).
- Tests :
  - contrat du prompt du dispatcher : règle présente pour un utilisateur, absente
    sinon, identifiants égaux à ceux de `cards.ts` ;
  - parseur ;
  - bloc (variantes, deux langues, chemin sans bloc) ;
  - câblage dans `run.ts`, sur le modèle des tests `run_*_test.ts`.
- Mise en ligne, par toi : `supabase functions deploy sophia-brain`.

### Lot 3 — Le banc · 1 jour

- Script qui envoie les questions du §10 par `chat-inbound-v1`, avec le JWT de
  comptes de test nommés.
- Relevés : lignes `keel/app_help` dans
  `docker logs supabase_edge_runtime_Sophia_2`, réponses dans `chat_messages`,
  tokens dans `llm_usage_events`.
- Rapport : les chiffres du §10, avant et après. Retouche des `dispatcherHint`
  qui ratent.

### Lot 4 — Les trous de l'app · 1 à 2 jours, selon les réponses Q1 à Q8

Chaque point est une petite réparation indépendante. Après chacune, on met à
jour la fiche concernée ; le test des libellés y oblige de toute façon.

| Réparation | Fichiers | Attend |
|---|---|---|
| Interrupteur des calories accessible | `StudentWeekPlanPage.tsx` et l'écran choisi | Q1 |
| « Je valide » enregistré ou retiré | `StudentWeekPlanPage.tsx:2742`, `plan/MyShareCard.tsx` | Q2 |
| `/account` traduit | `components/UserProfile.tsx`, `DataPrivacySection.tsx`, `fr.ts`, `en.ts` | Q3 |
| Phrases « coach » réécrites en neutre | `fr.ts`, `en.ts` | Q4 (texte à valider) |
| Lien vers `/installer-app` | `KeelAppShell.tsx` | Q5 |
| Changement de mot de passe | `/account` | Q6 |
| README conversation ou code aligné | `conversation/README.md` | Q7 |

## 13. État de livraison — 2026-09-23

### Ce qui existe (local, non commité)

| Lot | Fichiers |
|---|---|
| 0 | `sophia-brain/agents/companion.ts` (règle R2 fr/en, esquisse de l'ancien produit retirée) · `companion_prompt_contract_test.ts` · `sophia-brain/knowledge/frontend-site-map.ts` **supprimé** (aucun importeur) |
| 1 | `_shared/keel/app_help/cards.ts` (46 fiches, 182 libellés cités, tous vérifiés) · `block_title.ts` · `cards_test.ts` · `frontend/src/keel/i18n/appHelpLabels.int.test.ts` |
| 2 | `contracts/turn_frame.v1.ts` · `router/dispatcher.ts` · `router/turn_context_runtime.ts` · `dispatcher/dispatcher.v2.ts` · `dispatcher/dispatcher.prompts.ts` (règle 6-sexies) · `_shared/keel/app_help/block.ts` · `router/run.ts` (bloc, log `keel/app_help`, pas d'invitation photo sur un tour d'aide) · `_shared/keel/turn_ledger.ts` (une fiche photo désarme la règle photo) · tests `block_test.ts`, `dispatcher_app_help_test.ts`, `turn_ledger_test.ts` |
| 3 | `scripts/2026-09-23-banc-aide-app.py` |
| 4 | voir §11 « Arbitrées » et « Trouvés en construisant » |

Les fiches ont été générées depuis les libellés exacts de `fr.ts` / `en.ts`
(script jetable, hors dépôt) ; on les modifie désormais à la main dans
`cards.ts`, et les deux tests disent ce qui ne colle plus.

### Mesures — le banc, trois passages sur la pile locale

Comptes de test : titulaire d'un foyer en perte de poids (fr et en), personne
seule en maintien (fr et en), membre ayant réclamé sa place (fr). 41 questions
d'aide, 10 messages qui n'en sont pas.

| Passage | Bonne fiche | Déclenchements à tort | Changement avant le passage |
|---|---|---|---|
| 1 | 35 / 41 (85 %) | 0 / 10 | — |
| 2 | 38 / 41 (93 %) | 0 / 10 | règle 2-bis (« ce que l'app sait faire »), indications précisées |
| 3 | **39 / 41 (95 %)** | **0 / 10** | indications « accès au conjoint » et « messages du soir » |

- **Contre-mesure tenue** : sur les messages ordinaires, `rule_question`,
  `sizing_redirect` et `profile_redirect` se déclenchent toujours, dans les deux
  langues. L'aide n'a volé aucun tour.
- **Tokens** (passage 3, 51 tours) : dispatcher 20 831 tokens d'entrée par tour,
  dont 17 082 en cache (point de départ : 18 855 / 12 308) — la règle 6-sexies
  pèse ~1 750 tokens, dans la partie fixe. Composeur 7 369, dont 2 017 en cache
  (point de départ : 6 509 / 2 269) ; un bloc de deux fiches pèse ~370 tokens.
  Les points de départ viennent d'autres tours locaux : l'écart est indicatif.
- **Ratés restants** : « can I swap a dish in my plan? » n'est jamais détecté
  (3 passages sur 3), et une question change de verdict d'un passage à l'autre.
- **Sans fiche, le risque n'est pas nul** : au passage 3, un raté de détection a
  donné « dans cette app tu ne coches pas ce que tu as mangé » (faux). La règle a
  été durcie (« n'affirme rien sur ce que l'app fait ») ; sondé ensuite sur trois
  questions sans fiche, deux réponses restent prudentes, une affirme encore. Une
  consigne de prompt réduit ce risque, elle ne l'annule pas : c'est le taux de
  détection qui le borne.
- **Membre de foyer** : aucune ligne `keel/app_help` (il n'est pas élève), et la
  réponse sort **en anglais** à un compte français. Voir §11.

### Contrôles

- `deno test` : `_shared/keel/app_help/` et `sophia-brain/dispatcher/` 201 verts ;
  `sophia-brain/agents/` 22 verts ; `turn_ledger_test.ts` 40 verts ; suite keel du
  gate 7 974 verts.
- `vitest` : suite front du gate sans rouge hors liste ; `appHelpLabels` 93 verts.
- `tsc -p tsconfig.app.json` : propre.
- `scripts/agent-gate.sh` : **rouge sur le typage des fichiers de test**, à cause
  de fichiers d'une autre session en cours (`foldSection`, `householdMeasure`,
  `targetDetail`, `planDaySlots`, `mealBoxes`, `retainedItems` — types de boîtes
  `restOnTheDay` / `fromOtherSessions`). Aucun fichier de ce chantier n'y figure.

### Ce qui manque pour passer 🟢

1. Commiter (les fichiers `fr.ts`, `en.ts`, `catalog.ts`, `KeelAppShell.tsx`,
   `StudentWeekPlanPage.tsx`, `TodayPage.tsx`, `StudentProgressPage.tsx`,
   `HouseholdPage.tsx`, `MealBuilder.tsx` portent aussi le travail non commité
   d'autres sessions : jamais de commit par chemin de fichier entier, voir la
   méthode par index privé et découpe par morceau).
2. Mettre en ligne la fonction du chat (`supabase functions deploy sophia-brain`,
   à lancer par un humain) et le front.
3. Décider du sort des membres de foyer dans le chat (§11).
