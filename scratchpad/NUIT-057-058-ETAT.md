# Nuit FF-058 / FF-057 — état

Branche : `ff-001-quotidien-du-coach`   (**JAMAIS une autre**)
Démarrage : 2026-08-12 00:40 CEST   ·   Dernière mise à jour : 2026-08-12 00:45 CEST
Arbre au départ : **205 fichiers déjà modifiés** — préexistants, pas à moi.
Instantané figé dans `scratchpad/NUIT-ARBRE-DEPART.txt` (c'est la référence qui
sépare ce qui préexistait de ce que mes lots produisent).

---

# ⭐ SYNTHÈSE GLOBALE — à lire au réveil

**Les deux lots sont livrés.** Six commits sur `ff-001-quotidien-du-coach`,
**rien poussé**, aucune autre branche créée, aucun `db reset`. La base locale
est saine, la lignée de migrations est sans doublon.

## 1. Ce qui a été livré

**FF-058 · La bande du soir.** Pour un utilisateur réel, poser une coche ne
demande plus d'ouvrir l'app, de trouver l'écran et de retrouver ses plats : le
message du soir nomme les plats du jour et offre `[✓ Tout comme prévu]`. **Le
cas nominal coûte un tap.** Le soir d'une vague de courses — et **ce soir-là
seulement** — une ligne de plus demande si les courses sont faites ; c'est la
première fois que le produit le sait, les coches de la liste étant jusqu'ici du
`useState` mort au rechargement. Coût mesuré : +2 boutons et ~35 caractères ;
le pire soir composé délibérément tient en 288 caractères, 7 boutons et **une
seule question**.

**FF-057 · La procédure accident.** Ce qui manquait était la réponse à « et
maintenant ? ». Un `✗` ouvre un formulaire fermé à trois boutons ; une session
de cuisine déclarée non faite retire du plan **exactement** les repas qu'elle
nourrissait — et **les repas déjà cochés survivent**, parce qu'on croit le fait
et pas la déclaration ; un `Pas encore` de courses fait **calculer** un
décalage de cuisson et le propose en deux boutons, avec **quatre motifs de
refus nommés** quand il n'est pas viable. Effet secondaire important : la bande
du soir **cesse de nommer un plat qui n'a jamais été cuisiné** — le mensonge
structurel que la fiche décrit.

## 2. ⭐ Les décisions prises en ton absence

Onze décisions, détaillées plus bas dans la section « Décisions prises en mon
absence ». **Les quatre qui engagent le produit**, à relire en premier :

1. **`respondsForHousehold` rend `true` pour une personne sans foyer** (FF-058)
   — un fail-**open** assumé sur une règle de confidentialité de foyer (R14).
   Il ne tient que parce que la population de profils réclamés est à 0.
   *À réexaminer le jour où elle ne l'est plus.*
2. **L'entrée « conversation » n'ouvre pas le formulaire accident** (FF-057) —
   sur « j'ai commandé une pizza », le fait `off_plan` et l'invitation photo
   partent déjà ; le formulaire ferait re-choisir ce que la personne vient de
   dire. La fiche annonce trois entrées ; **deux sont livrées**.
3. **L'action « signaler un reste » n'est pas construite** (FF-057) — aucun
   consommateur en aval, donc T1. C'est une action sur cinq que la fiche
   nomme, délibérément absente.
4. **Un `✗` sur un plat jamais coché INSÈRE une ligne négative** (FF-058) —
   c'est le cas nominal (personne n'ouvre l'écran), et c'est ce qui alimente
   FF-057. Ça crée en base des lignes « pas mangé » pour des repas jamais
   déclarés mangés.

## 3. Ce qui reste rouge

| Rouge | Ce que ça coûte de le laisser |
|---|---|
| 🟠 **`grocery_wave_states` et `cooking_session_states` absents de l'export RGPD** | Deux tables de données personnelles non exportables. La **suppression** est couverte (`on delete cascade`) — c'est l'export seul qui manque. `account-export-v1/index.ts` était pris par une autre session **les deux fois** ; le patch exact est prêt (§4 ci-dessous). C'est le seul rouge qui demande une action. |
| **`restrictionFlag` câblé en dur à `false`** | La garde « muet sous `restriction_flag` » est armée et testée unitairement dans les deux lots, mais son **producteur n'existe plus** depuis son retrait le 2026-08-08. Un littéral à changer le jour où une source revient. Antérieur à cette nuit. |
| **Entrée « décoche sur l'écran Today »** | L'écran écrit par PostgREST sans passer par le chat : il n'y a nulle part où poser des boutons. À traiter côté écran, pas côté chat. |
| **2 rouges préexistants** dans `recent_history_test.ts` | Prouvés antérieurs par `git stash -u` au lot 1, non touchés par les deux lots. |
| **Collision de créneau non refusée** (FF-057) | Un glissement peut poser deux plats du même créneau le même jour quand aucun delta propre n'existe. C'est une préférence dans la recherche, pas un refus ; la fiche n'en parle pas. |

**Deux amendements de fiche sont proposés et NON appliqués** (l'humain
tranche) : FF-058 §11 affirme que la réclamation de profil n'existe pas — elle
existe en base depuis le 2026-08-10, sa population est à 0 ; et une ligne du §7
de FF-057 décrit un état structurellement inatteignable.

## 4. Les commandes pour l'humain, dans l'ordre

**a) Le seul patch qui reste à appliquer** — les deux tables neuves dans
l'export RGPD. Dans `supabase/functions/account-export-v1/index.ts`, à côté de
la ligne 593 (`fetchKeelRows(admin, "protocol_events", …)`), dans le même
tableau :

```ts
fetchKeelRows(
  admin,
  "cooking_session_states",
  // FF-057 — l'état d'une session de cuisine. Aucune donnée sensible: un
  // booléen, une date de cuisson et l'identifiant du plan.
  ["generated_meal_id", "cook_on", "happened", "answered_at", "answered_local_date"],
  "user_id",
  user.id,
  keelUnavailable,
),
fetchKeelRows(
  admin,
  "grocery_wave_states",
  // FF-058 — l'état d'une vague de courses.
  ["generated_meal_id", "buy_on", "done", "answered_at", "answered_local_date"],
  "user_id",
  user.id,
  keelUnavailable,
),
```

**b) Rejouer les quatre runs réels** (⚠️ le `docker restart` casse le DNS de
Kong — le script Kong le répare, il doit passer **après**) :

```bash
cd "/Users/ahmedamara/Dev/Sophia 2"
ANON=$(grep -m1 '^SUPABASE_ANON_KEY=' supabase/.env | cut -d= -f2-)
SVC=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' supabase/.env | cut -d= -f2-)
ISEC=$(grep -m1 '^INTERNAL_FUNCTION_SECRET=' supabase/.env | cut -d= -f2-)
docker restart supabase_edge_runtime_Sophia_2 && sleep 8
./scripts/local_extend_kong_functions_timeout.sh
for s in FF058_evening_strip FF058_adversarial FF057_accident FF057_adversarial; do
  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" \
    SUPABASE_SERVICE_ROLE_KEY="$SVC" INTERNAL_FUNCTION_SECRET="$ISEC" \
    deno run -A "docs/nutrition-pivot/qa-web/$s.ts"
done
# attendu: 30/0, 9/0, 70/0, 14/0
```

**c) Les tests unitaires** :

```bash
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/accident_test.ts \
  supabase/functions/_shared/keel/evening_strip_test.ts \
  supabase/functions/_shared/keel/daily_pulse_test.ts
# attendu: 111 passed | 0 failed
```

**d) Rien à déployer.** Les deux migrations sont appliquées **en local**
seulement. Le jour d'une mise en production, elles y vont par la voie normale —
hors périmètre de cette nuit.

## 5. Les commits de la nuit

```
46ce1278 rapport FF-057 : la procedure accident, ses trois defauts mesures et ses quatre decisions
ee30f8b2 FF-057 run reel : trois defauts trouves par la mesure, et corriges
81357602 FF-057 la procedure accident : le formulaire, la cascade de session et le glissement de dates
5c1014af FF-058 rapport de nuit : 30 tests reels verts 3/3, 24+37 unitaires, 10 hypotheses adversariales dont 2 defauts reels
d24ca47a FF-058 revue adversariale : la charge d'un bouton ecrivait le futur, et le plan d'autrui
d08d416d FF-058 la bande du soir : l'affordance qui rend la coche gratuite, et l'etat de vague de courses
```

Sur `ff-001-quotidien-du-coach`, **rien de poussé**. Les autres commits visibles
dans l'intervalle appartiennent aux sessions parallèles.

---

## File

| # | Lot | Statut | Commits | Rapport | Note |
|---|---|---|---|---|---|
| 1 | FF-058 · La bande du soir | **TERMINÉ** | `d08d416d` `d24ca47a` `5c1014af` | `RAPPORT-FF-058.md` (30 kB) | 40 min |
| 2 | FF-057 · La procédure accident | **TERMINÉ** | `81357602` `ee30f8b2` `46ce1278` | `RAPPORT-FF-057.md` (35 kB) | 46 min · entrée « courses » disponible, aucune dégradation |

Statuts : EN ATTENTE · EN COURS · TERMINÉ · À COMMITER · ÉCHOUÉ · DÉJÀ FAIT

**Vérifié au démarrage** : ni `RAPPORT-FF-057.md` ni `RAPPORT-FF-058.md`
n'existent → les deux lots restent à faire. `RAPPORT-FF-056.md` existe (lot
antérieur, hors périmètre de cette nuit).

---

## L'état du terrain constaté au démarrage (preuves)

- Branche : `git branch --show-current` → `ff-001-quotidien-du-coach` ✅
- Lignée de migrations : `uniq -d` sur les versions → **vide**, aucun doublon.
  Version la plus haute : `20260812091000_ciqual_english_aliases.sql`.
  Toute migration neuve doit porter une version **strictement supérieure**.
- **Les modules cœur de FF-058 sont TOUS propres** — `meal_tick.ts`,
  `daily_recap.ts`, `daily_recap_io.ts`, `daily_pulse.ts`, `meal_plan_window.ts`,
  `grocery_waves.ts`, `daily_ask_budget.ts`, `chat-inbound-v1/index.ts`,
  `_shared/chat/delivery.ts`, `ShoppingListPanel.tsx`. Le lot a un terrain net.
- **Une seule adjacence chaude** : `_shared/keel/daily_recap_io_test.ts` est
  modifié par une autre session (le **test**, pas le module). Interdit d'écriture.
- **Migration en vol** : `20260811140000_meal_plan_window_and_mode_guards.sql`
  est non commitée — une autre session touche `meal_plan_window`, qui est la
  source de vérité « quel plan possède ce jour » de FF-058. Lecture seule.

---

## Synthèse — lot 1 · FF-058 · La bande du soir  (40 min)

**Ce qui existait** — la coche (`meal_tick.ts`, idempotence garantie par un
index unique partiel Postgres), le message du soir (`daily_pulse.ts`), et
`grocery_waves.ts` qui calcule déjà `buyOn`. **Zéro bande.** Et l'hypothèse de
la fiche est confirmée en la regardant : les coches de
`ShoppingListPanel.tsx:123` sont bien du `React.useState` — elles meurent au
rechargement et n'atteignent jamais la base.

**Ce qui a été construit** — `_shared/keel/evening_strip.ts` (696 l., pur) +
`evening_strip_io.ts` (531 l.) + la bande injectée dans `renderPulseMessage` +
le traitement du tap dans `_shared/chat/deterministic_buttons.ts` (que
`chat-inbound-v1/index.ts:56` importait déjà — d'où le fait que
`chat-inbound-v1` n'a pas eu à être touché) + la table `grocery_wave_states`
(migration `20260812120000`). **R5 est tenue par un seul écrivain** partagé
avec l'écran : même table, même clé, même index d'unicité,
`disqualified_reason` en paramètre — pas de seconde implémentation de la coche.

**Les tests** — 64 unitaires verts (24 neufs FF-058, 5 neufs dans
`daily_pulse_test`) · **30 tests en conditions réelles, verts 3 runs sur 3**
(vrai cron, vrai modèle, taps réels par `chat-inbound-v1`, coches relues en
base) · 10 hypothèses adversariales écrites avant test.
**La preuve la plus parlante** : une charge de bouton forgée citant la
composition d'**un autre élève** faisait fuir son plat dans les faits de
l'attaquant — `student_note = "SECRET private dish of Vera"`. Le chemin tourne
sous `service_role` : RLS ne protégeait rien.

**Les décisions prises seul** — cinq, au format imposé, reprises intégralement
dans la section « Décisions prises en mon absence » ci-dessous.

**Les REDs** — un seul qui compte : `grocery_wave_states` **n'est pas dans
l'export RGPD** (la suppression, elle, est couverte par `on delete cascade`).
`account-export-v1/index.ts` est pris par une autre session, la modification
exacte est au §8 du rapport. Non bloquant pour le lot suivant.
Deux rouges **préexistants** dans `recent_history_test.ts`, prouvés antérieurs
par `git stash -u`, non touchés.

**Impact sur le lot suivant** — **FF-057 n'est PAS dégradée** : son entrée
« courses » existe (`grocery_wave_states`, `done = false` est le déclencheur
`Pas encore`), et son entrée « décoche » aussi, y compris sur un plat jamais
coché. Deux choses lui ont été transmises explicitement : la **question de
session n'a pas été construite** (c'est son ②), et la fiche §11 se trompe en
affirmant que la réclamation de profil n'existe pas — elle existe en base
depuis le 2026-08-10, sa population est à 0.
Trois pièges d'infra lui ont été passés, dont celui qui a coûté deux runs :
**`docker restart` de l'edge runtime casse le DNS de Kong**, il faut relancer
`local_extend_kong_functions_timeout.sh` derrière.

**Verdict** — **TERMINÉ.** Trois commits (`d08d416d`, `d24ca47a`, `5c1014af`),
chemins du lot propres, lignée de migrations toujours sans doublon, rien poussé.

---

## Synthèse — lot 2 · FF-057 · La procédure accident  (46 min)

**Ce qui existait** — **rien**. Seulement des renvois « c'est FF-057 » laissés
par le lot précédent dans `deterministic_buttons.ts` et `evening_strip_io.ts`.
Aucune table ne portait l'exécution d'une session de cuisine, et aucun écrivain
`off_plan` n'était appelable depuis un tap.

**Ce qui a été construit** — `_shared/keel/accident.ts` (pur : vocabulaire
`KEEL_FIX_`, la cascade, le glissement de dates à **quatre** motifs de refus
nommés, l'espace d'action fermé, deux ceintures armées FR+EN) +
`accident_io.ts` + `_shared/chat/accident_tap.ts` + la migration
`20260812140000_cooking_session_states` + le filtre de lecture qui fait que la
bande du soir **cesse de nommer un plat jamais cuisiné**.

**Les tests** — 50 unitaires (dont **2 mutations** de constante et un cas
qui-passe par famille interdite) · **70 en conditions réelles, 3 runs sur 3** ·
14 adversariaux, 3 sur 3. Zéro rouge.
**La preuve la plus parlante** : le filtre de cascade était **vert et ne
filtrait rien** — le `select` omettait `dishes` et `cooking_sessions`, donc le
filtre travaillait sur des lignes vides et « n'invalidait rien » avec
l'apparence du succès. Trouvé par la mesure, pas par la lecture.

**Les décisions prises seul** — six, reprises intégralement ci-dessous.

**Les REDs** — l'export RGPD, toujours (`account-export-v1/index.ts` était pris
par une autre session **les deux fois** de la nuit) ; l'entrée conversation et
l'entrée écran non branchées, argumentées ; la collision de créneau non
refusée ; `restrictionFlag` toujours sans producteur.

**Impact sur le lot suivant** — il n'y en a pas, c'était le dernier.

**Verdict** — **TERMINÉ.** Trois commits (`81357602`, `ee30f8b2`, `46ce1278`),
chemins du lot propres, lignée sans doublon, rien poussé.

---

## Décisions prises en mon absence

### Lot 2 · FF-057 — six décisions

> **Décision** — le marqueur de session vit dans une **table à part**
> (`cooking_session_states`), pas dans le payload jsonb du plan.
> **Pourquoi** — « le plus simple » n'est pas le plus court à écrire, c'est
> celui qui ne fabrique pas de course. Un drapeau dans `cooking_sessions`
> forcerait une lecture-modification-écriture complète de la ligne du plan, et
> **le second écrivain existe dans la même fiche** : le glissement réécrit ce
> même jsonb. Le drapeau se perdrait dessous, en silence.
> **Options rejetées** — (a) clé dans le jsonb : la course ci-dessus ; (b)
> `protocol_events` : une session n'est pas un fait de consommation ; (c) une
> ligne append-only par réponse : contredit « c'est un état ».
> **Réversibilité** — élevée : `drop table`, deux lecteurs.
> **Ce que l'humain doit savoir** — c'est le jumeau exact de la table de
> FF-058. Deux tables neuves cette nuit, même forme, même contrat.

> **Décision** — la clé de session est une **date calendaire**, jamais un jeton
> de jour (`sun`).
> **Pourquoi** — le glissement DÉPLACE les sessions. Un jeton cesse alors de
> désigner la même chose ; la date reste vraie. « La cuisson du 10 août n'a pas
> eu lieu » survit au glissement, et la nouvelle date n'a simplement aucune
> ligne — c'est-à-dire « on ne sait pas », l'état correct.
> **Options rejetées** — le jeton : il faudrait réécrire le marqueur à chaque
> glissement, donc un second écrivain sur un état.
> **Réversibilité** — **coûteuse** une fois des lignes écrites (migration de
> données). *C'est la décision la moins réversible de la nuit.*
> **Ce que l'humain doit savoir** — si tu veux la renverser, c'est maintenant,
> tant que la table est vide.

> **Décision** — **aucune table de proposition** pour le glissement ;
> l'empreinte du plan voyage dans la charge du bouton.
> **Pourquoi** — la fiche impose le **canal** de FF-028 ; la discipline a été
> reprise, pas la table. `student_daily_recommendations` porte
> `unique (user_id, local_date)` et `wasRecommendationSentToday` **gate le
> message du soir** : y écrire des lignes FF-057 **éteindrait la bande du soir
> le lendemain**. L'empreinte porte à elle seule les deux gardes voulues (plan
> changé ⇒ périmé, et double tap).
> **Options rejetées** — (a) écrire dans la table de FF-028 : casse l'unicité
> qui EST son arbitre, et éteint la bande ; (b) une table de propositions
> dédiée : un état de plus à expirer pour une proposition qui vit un échange.
> **Réversibilité** — élevée : la charge est un littéral, un tap périmé échoue
> proprement.

> **Décision** — l'action « signaler un reste disponible » **n'est pas
> construite**.
> **Pourquoi** — aucun consommateur en aval : ni table, ni générateur, ni
> écran. L'écrire violerait T1 dans la fiche qui cite T1.
> **Options rejetées** — l'écrire dans `temp_memory` : deux écrivains
> concurrents, le dernier gagne — un reste perdu est pire qu'un reste jamais
> noté.
> **Réversibilité** — triviale, le jour où un lecteur existe.
> **Ce que l'humain doit savoir** — c'est une des cinq actions que la fiche
> nomme. Quatre sur cinq sont livrées.

> **Décision** — l'entrée **conversation** n'ouvre **pas** le formulaire.
> **Pourquoi** — trois raisons convergentes. (1) Sur « j'ai commandé une
> pizza », FF-009 écrit déjà le fait `off_plan` et FF-025 envoie déjà
> l'invitation photo : le formulaire ferait re-choisir ce que la personne vient
> de dire — littéralement « redemander une info donnée ». (2) Ce qui manque
> vraiment sur ce chemin est la **décoche du plat prévu**, et savoir QUEL plat
> a été remplacé est une déduction — la fiche interdit d'inventer. (3) Émettre
> des **boutons** depuis la lane du cerveau n'existe pas : le routeur ajoute
> des phrases, les boutons sortent du chemin déterministe. Ce serait une
> modification structurelle de 5 600 lignes partagées, à 4 h du matin.
> **Options rejetées** — le construire quand même : risque élevé sur un fichier
> partagé, bénéfice produit négatif.
> **Réversibilité** — sans objet, rien n'a été écrit ; la couture est nommée.
> **Ce que l'humain doit savoir** — la recommandation du sous-agent est de
> capter la **décoche** quand le rapprochement identifie le plat sans
> ambiguïté, et de ne rien faire quand il hésite.

> **Décision** — un **quatrième** motif de refus, `no_session`.
> **Pourquoi** — la fiche en donne trois, mais un tap sur une date qui ne porte
> aucune cuisson doit dire quelque chose : un refus n'est jamais un silence.
> Le fondre dans un des trois autres mentirait sur la cause.
> **Réversibilité** — triviale.

### Lot 1 · FF-058 — cinq décisions

> **Décision** — l'ordre du message est **fait → bande → question**, les
> boutons suivent : bande d'abord, niveaux du pouls ensuite.
> **Pourquoi** — la fiche impose « le fait d'abord, la bande ensuite » mais ne
> place pas la question du pouls. Bande **après** la question, `✓ Tout comme
> prévu` se lirait comme une réponse à « ta journée ? ». Avec cet ordre, le
> dernier texte lu est la question et les derniers boutons sont ses réponses —
> le contrat d'adjacence que `pulseTemplateButtonComponents` documente déjà.
> **Options rejetées** — (a) bande en dernier : brise l'adjacence ; (b)
> supprimer la bande les soirs où le pouls demande : perd la bande 1 soir sur 3.
> **Réversibilité** — triviale, trois lignes dans `renderPulseMessage`.
> **Ce que l'humain doit savoir** — c'est un arbitrage d'ergonomie que la fiche
> ne tranchait pas ; l'ordre inverse est défendable si on juge la bande plus
> importante que le pouls.

> **Décision** — un `✗` sur un plat **jamais coché** INSÈRE la ligne avec
> `disqualified_reason`, au lieu de ne toucher aucune ligne.
> **Pourquoi** — c'est le cas **nominal** : personne n'a ouvert l'écran, donc
> rien n'est coché. Un `update` qui touche 0 ligne rend un 204 muet.
> **Options rejetées** — (a) n'écrire que si une coche existe : le ✗ ne dirait
> rien 9 fois sur 10 et FF-057 n'aurait aucune entrée ; (b) un `source`
> distinct : ferait diverger la couverture selon le chemin.
> **Réversibilité** — élevée, un paramètre du writer.
> **Ce que l'humain doit savoir** — ça crée des lignes « négatives » en base
> pour des repas jamais déclarés. C'est voulu, et c'est ce qui alimente FF-057.

> **Décision** — la ceinture anti-question juge **ce que nous écrivons**
> (en-têtes et libellés), pas les titres de plats ; les titres perdent
> seulement leur `?`.
> **Pourquoi** — un titre est de la DONNÉE. Le faire tomber sous la ceinture
> ferait disparaître la bande **tous les soirs, en silence**, chez l'élève dont
> un plat porte un mot malheureux : une panne permanente pour une ponctuation.
> **Options rejetées** — (a) ceinture sur le texte entier : panne silencieuse
> quotidienne ; (b) rien du tout : un `?` dans un titre ferait lire la bande
> comme une question.
> **Réversibilité** — élevée, un `join` dans `buildEveningStrip`.

> **Décision** — `respondsForHousehold` rend **`true` pour une personne sans
> foyer**.
> **Pourquoi** — c'est le cas nominal d'aujourd'hui (quasi tous les comptes).
> Rendre `false` ferait disparaître la ligne de courses pour tout le monde, et
> R14 serait « respectée » par le silence total.
> **Options rejetées** — fail-closed universel : R14 devient vraie et R15 morte.
> **Réversibilité** — une ligne.
> **Ce que l'humain doit savoir** — c'est un fail-**open** assumé sur une règle
> de confidentialité de foyer. Il tient parce que la population de profils
> réclamés est à 0 ; il devra être réexaminé le jour où elle ne l'est plus.

> **Décision** — l'état de vague est une **table** (`grocery_wave_states`), pas
> une colonne dans le payload du plan.
> **Pourquoi** — un état par `(user_id, plan, buy_on)` avec sa date de réponse
> et son unicité, dans un payload JSON, ne s'indexe pas et ne se contraint pas.
> **Options rejetées** — colonne dans le payload : pas d'unicité, pas d'index
> partiel, lecture par FF-057 coûteuse.
> **Réversibilité** — moyenne : une table à droper, un lecteur à réécrire.
> **Ce que l'humain doit savoir** — c'est la seule donnée neuve de la fiche, et
> elle est **absente de l'export RGPD** (voir « ce qui reste rouge »).

---

## Journal

- **00:40** — démarrage. Branche vérifiée, arbre figé (205 fichiers), lignée de
  migrations vérifiée sans doublon.
- **00:45** — lot 1 (FF-058) lancé : socle commun l. 16-143 + bloc intégral +
  complément de nuit.
- **01:25** — lot 1 rendu. Vérifié : rapport présent (30 kB), 3 commits, chemins
  du lot propres, lignée sans doublon, migration `20260812120000` au-dessus de
  la plus haute version. Le tap est bien branché (`chat-inbound-v1/index.ts:56`
  importait déjà `deterministic_buttons.ts`) — d'où le fait que le lot n'a pas
  eu à toucher un fichier partagé. **TERMINÉ.**
- **01:35** — lot 2 (FF-057) lancé. Entrée « courses » **disponible**, donc
  aucune dégradation à assumer. Le complément lui passe : le handoff FF-058
  (forme de `grocery_wave_states`, `respondsForHousehold`, le `✗` qui insère,
  la question de session **non construite**), deux corrections du socle devenu
  périmé (`history: []` corrigé cette nuit par une autre session — commit
  `1414face` ; métrique `full_chars`/32 000 et non `context_tokens`/8 000), et
  les trois pièges d'infra mesurés au lot 1.
- **02:21** — lot 2 rendu. Vérifié : rapport présent (35 kB), 3 commits, chemins
  du lot propres, lignée sans doublon, migration `20260812140000` au-dessus de
  la plus haute version, branche inchangée, **rien poussé**. **TERMINÉ.**
- **02:25** — synthèse globale écrite en tête de ce fichier. **File vide, nuit
  terminée.** Aucun lot `ÉCHOUÉ`, aucun `À COMMITER`, aucun arrêt.
- **01:35** — noté au passage : **d'autres sessions commitent sur cette branche
  pendant la nuit** (`e4bc5b07`, `1414face`, `df1e2b44`, `23f0fb34`, `dab3589f`,
  `217f401a`, `adcd07fe`). L'arbre bouge sous nos pieds ; c'est pourquoi chaque
  lot re-vérifie `git status --porcelain -- <chemin>` avant d'écrire.
