# Prompt — MASTER du chantier chat (les 14 fonctionnalités)

> À donner tel quel à un agent, en une seule fois. Il tournera plusieurs heures,
> sans surveillance. Ce n'est pas grave si ce n'est pas fini demain matin.

---

Tu es le **master** d'un chantier long : réaligner les 14 fonctionnalités du
chat de Sophia/KEEL sur leurs fiches. Dépôt : `/Users/ahmedamara/Dev/Sophia 2`.

## LA RÈGLE QUI DÉFINIT TON RÔLE

**Tu ne codes pas. Tu ne testes pas. Tu distribues, tu vérifies, tu consignes.**

Pour chaque fonctionnalité, tu lances **un sous-agent** avec son prompt complet,
tu attends son rapport, tu lis son résumé, tu vérifies l'état du dépôt, tu mets
à jour le fichier d'état, et tu passes à la suivante.

C'est ce qui rend le chantier tenable sur 20 à 40 heures : **ton contexte ne
contient jamais que des résumés courts**. La mémoire du chantier n'est pas ta
conversation — ce sont les fichiers sur le disque. Si tu meurs à 3 h du matin,
on te relance en te disant « lis l'état, reprends », et ça marche.

Si tu te surprends à ouvrir un fichier source pour le corriger toi-même :
arrête-toi. Ce n'est pas ton travail, et ça détruit la propriété ci-dessus.

---

## LA BRANCHE — impérativement

**Tu travailles sur la branche courante `ff-001-quotidien-du-coach`. Tu n'en
crées AUCUNE autre, tu ne changes JAMAIS de branche, tu ne merges rien, tu ne
pushes rien.**

Vérifie-le au démarrage (`git branch --show-current`) et **avant chaque
sous-agent**. Chaque sous-agent reçoit la même consigne dans son prompt.

Raison : un autre chantier est déjà en cours sur cette même branche (voir plus
bas), et une branche parallèle produirait deux histoires à réconcilier sur un
dépôt que personne ne surveille pendant la nuit.

---

## ⚠️ UN AUTRE AGENT TRAVAILLE EN MÊME TEMPS QUE TOI

Le **chantier de retrait des comportements**
(`scratchpad/PROMPT-RETRAIT-COMPORTEMENTS-CHAT.md`) est **déjà lancé** et tourne
sur la même branche, la même base locale, le même dépôt. Il a déjà commité au
moins son R3 (`131a7370`, la cadence du soir). Il touche :
`_shared/keel/meal_precision.ts` (plafond 2→1), `sophia-brain/agents/companion.ts`
(le rythme `ask_now`), `_shared/keel/daily_pulse.ts`,
`frontend/src/keel/components/WeeklyCheckInDialog.tsx` et
`_shared/keel/week_review*.ts` (les 6 axes).

**Ce que ça t'impose, et ce n'est pas négociable :**

1. **Tu ne touches JAMAIS à ses fichiers.** Si un sous-agent en a besoin, il le
   consigne au rapport et tu réordonnes — tu ne modifies pas.
2. **JAMAIS de `supabase db reset`, même local.** Tu effacerais ses fixtures en
   cours de run. (C'est aussi une commande à validation humaine.)
3. **`git add -A` est INTERDIT.** Chaque commit est **scopé aux chemins** que le
   sous-agent a effectivement touchés (`git add <chemins>`), sinon tu balaies
   son travail en cours dans ton commit.
4. **Le hook `agent-gate` lance un typecheck frontend complet à chaque commit.**
   Il peut donc **échouer sur SES fichiers à lui**, pas les tiens — c'est arrivé
   au moment d'écrire ce prompt (`WeeklyCheckInDialog.tsx`, `ChatPage.tsx`). Si
   le gate échoue sur des fichiers que ton sous-agent n'a pas touchés : **tu ne
   les répares pas**. Tu attends 15 minutes, tu réessaies une fois, et si ça
   persiste tu consignes le travail comme `À COMMITER` dans l'état, et **tu
   continues** — le code est sur le disque, il n'est pas perdu.
5. **FF-017 dépend de lui** (le plafond 2→1). Avant de la lancer, vérifie
   `MEAL_PRECISION_DAILY_CAP` dans `_shared/keel/meal_precision.ts` : si elle
   vaut encore 2, **saute FF-017** et remets-la en fin de file.

---

## LA FILE — ordre imposé, dépendances réelles

Les prompts des sous-agents sont dans
**`scratchpad/PROMPTS-REALIGNEMENT-CHAT.md`** : un **socle commun** en tête, puis
un **bloc par fonctionnalité**. Le prompt d'un sous-agent =
**socle commun intégral + son bloc intégral**. Ne donne jamais un bloc sans le
socle. Ajoutes-y la consigne de branche.

L'autorité produit de chaque sous-agent est sa fiche dans
`docs/fonctionnalites/conversation/`, et la direction du domaine est le README
de ce dossier (règle mère + règles transverses T1–T9). **Ces fichiers sont sur
le disque mais peuvent être non commités — c'est normal, ils font autorité
quand même.**

| # | Fiche | Bloc | Dépend de |
|---|---|---|---|
| 1 | FF-008 · Le poids annoncé | BLOC 7 | — (**sécurité : arme `restriction_guard`**) |
| 2 | FF-009 · Le repas hors plan | BLOC 5 | — (migration additive) |
| 3 | FF-023 · La conversation normale | BLOC 14 | — (**la cause racine du bug de contexte**) |
| 4 | FF-025 · L'invitation à la photo | BLOC 6 | FF-009 |
| 5 | FF-017 · Le repas déclaré | BLOC 3 | **le chantier de retrait** (plafond 1) |
| 6 | FF-026 · La préférence captée | BLOC 8 | — |
| 7 | FF-027 · La faim branchée au plan | BLOC 9 | — |
| 8 | FF-028 · La recommandation quotidienne | BLOC 10 | FF-026, FF-027 |
| 9 | FF-016 · La question d'alimentation | BLOC 1 | — |
| 10 | FF-010 · La lecture du foyer | BLOC 2 | — |
| 11 | FF-011 · Le soutien groundé | BLOC 13 | — |
| 12 | FF-029 · Les pratiques quotidiennes | BLOC 11 | — |
| 13 | FF-018 · La photo de repas | BLOC 4 | — (revalidation) |
| 14 | FF-020 · L'accompagnement de crise | BLOC 12 | — (revalidation) |
| 15 | FF-021 · Le plancher de restriction | BLOC 15 | **tout le reste** (revue transverse des gates) |

**L'ordre n'est pas cosmétique** : 1 à 3 sont la sécurité, l'accueil de la
réalité et la continuité — c'est ce qui change ce que les gens vivent. 8 consomme
6 et 7. 15 vérifie que tous les chemins neufs demandent bien au plancher, donc
elle passe en dernier.

Une dépendance non satisfaite → **saute, et remets en fin de file**. Ne bloque
jamais la file.

---

## LE FICHIER D'ÉTAT — ta vraie mémoire

`scratchpad/CHANTIER-CHAT-ETAT.md`, que tu **crées au démarrage** et **mets à
jour après chaque fonctionnalité**, sans exception. Il doit permettre à un agent
qui n'a jamais vu cette conversation de reprendre.

```markdown
# État du chantier chat
Branche : ff-001-quotidien-du-coach   (JAMAIS une autre)
Dernière mise à jour : <horodatage>

## File
| # | Fiche | Bloc | Statut | Commit | Rapport | Note |
|---|---|---|---|---|---|---|
| 1 | FF-008 | 7 | TERMINÉ | a1b2c3d | RAPPORT-FF-008.md | 2 REDs consignés |
| 2 | FF-009 | 5 | EN COURS | — | — | démarré <heure> |
| 3 | FF-023 | 14 | EN ATTENTE | — | — | |
…

Statuts : EN ATTENTE · EN COURS · TERMINÉ · À COMMITER · ÉCHOUÉ · SAUTÉ

## Commandes pour l'humain (à exécuter au réveil)
```bash
<une ligne par commande, dans l'ordre, avec ce qu'elle sert>
```

## REDs qui dépassent une seule fonctionnalité
<ce qu'un sous-agent a trouvé et qui concerne le produit entier>

## Journal
<une ligne par événement : démarrage, fin, échec, décision de réordonnancement>
```

---

## LE PROTOCOLE, POUR CHAQUE FONCTIONNALITÉ

**① Avant de lancer**
- `git branch --show-current` → doit être `ff-001-quotidien-du-coach`.
- `git status --porcelain` → note ce qui est déjà sale (c'est l'autre agent).
- Vérifie la dépendance de la ligne. Non satisfaite → SAUTÉ, fin de file.
- Marque `EN COURS` dans l'état.

**② Lancer le sous-agent** avec, dans cet ordre :
1. le **socle commun** intégral de `PROMPTS-REALIGNEMENT-CHAT.md` ;
2. **son bloc** intégral ;
3. ce complément :

> Tu travailles sur la branche `ff-001-quotidien-du-coach` — **tu n'en changes
> pas et tu n'en crées pas**. Un autre agent travaille sur le même dépôt et la
> même base locale en parallèle : **ne touche que les fichiers de ta
> fonctionnalité**, ne fais **jamais** `git add -A` ni `supabase db reset`, et
> si le typecheck échoue sur des fichiers que tu n'as pas touchés, **ne les
> répare pas** — consigne-le et continue. Applique tes migrations en local par
> `docker exec supabase_db_Sophia_2 psql …` puis enregistre la version dans
> `supabase_migrations.schema_migrations` ; après toute modification de code
> edge, `docker restart supabase_edge_runtime_Sophia_2`. Préfixe tes fixtures
> `ffXXX_` et nettoie-les. Écris ton rapport dans
> `scratchpad/RAPPORT-FF-XXX.md`, et **termine ta réponse par un résumé de 10
> lignes maximum** : ce qui existait, ce que tu as construit, le nombre de tests
> par niveau et leurs verdicts, les REDs non résolus, ce qui reste à faire.

**③ Quand il rend la main**
- Vérifie que `scratchpad/RAPPORT-FF-XXX.md` **existe** et n'est pas vide. Sinon
  → `ÉCHOUÉ`, note la raison, passe à la suivante.
- Lis **le résumé**, pas le rapport entier. Tu n'ouvres le rapport que si le
  résumé annonce un RED transverse.
- `git status --porcelain` : si le sous-agent n'a pas commité, commite **toi**,
  **scopé aux chemins qu'il a touchés** (`git add <chemins>`), message en
  français descriptif + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
  Gate en échec sur des fichiers étrangers → `À COMMITER`, on continue.
- **L'arbre doit être propre sur les chemins de cette fonctionnalité avant de
  lancer la suivante** — sinon l'agent N+1 hérite du chantier de N et son diff
  devient illisible.
- Mets l'état à jour : statut, commit, rapport, note.

**④ Passe à la suivante.** Immédiatement. Tu ne fais pas de synthèse
intermédiaire, tu ne relis pas ce qui est fait, tu n'optimises rien.

---

## LES RÈGLES DU DÉPÔT QUE TU FAIS RESPECTER

- **Local, tout est local.** Tu n'as besoin ni de `supabase db push` ni de
  `functions deploy` : les migrations passent par `psql` dans le conteneur, et
  l'edge runtime sert les fonctions depuis le disque après un `docker restart`.
  Ces deux commandes ne servent qu'au déploiement **en production**, qui est
  hors périmètre de cette nuit — s'il en faut une, elle va dans la file de
  commandes pour l'humain.
- **`supabase db reset` : jamais.** Un autre agent travaille dans cette base.
- **Tests Deno avec l'environnement purgé**, sinon 114 faux rouges :
  `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test …`
- **Aucun push**, aucune autre branche, aucun merge.
- **Un RED se consigne, il ne se re-run pas jusqu'au vert.** Des probes verts ont
  déjà caché un run réel rouge dans ce dépôt.

---

## QUAND ÇA DÉRAILLE

| Situation | Ce que tu fais |
|---|---|
| Un sous-agent échoue ou ne rend pas de rapport | `ÉCHOUÉ` + raison, **suivante**. Jamais de relance immédiate |
| Il déborde sur les fichiers de l'autre agent | `ÉCHOUÉ`, note les fichiers en conflit, **suivante** |
| Le gate bloque sur des fichiers étrangers | `À COMMITER`, une seule nouvelle tentative 15 min plus tard, **suivante** |
| Un RED dépasse sa fonctionnalité | dans « REDs transverses » de l'état, et **tu continues** |
| Une dépendance manque | `SAUTÉ`, fin de file |
| La base locale est cassée | **STOP total.** Consigne, ne répare pas, ne reset pas. C'est le seul cas d'arrêt |
| Tu ne sais pas trancher | tranche vers **continuer la file** et consigne la question pour l'humain |

**Aucune de ces situations ne t'autorise à coder toi-même.**

---

## LA PASSE TRANSVERSE — après la file, pas avant

Quand la file est vide (terminées, échouées ou sautées), lance **un dernier
sous-agent** avec ce mandat :

> Quatre fonctionnalités ont ajouté de la matière au même prompt (FF-010,
> FF-011, FF-016, FF-023) ; trois se partagent le budget « une demande par
> jour » (FF-017, FF-025, FF-028). Vérifie en conditions réelles, sur un élève
> « riche » (foyer + doctrine + mémoire + historique) :
> ① le bloc doctrine survit-il à la troncature (`context_tokens` sur un tour
> type) ? ② le budget de demande est-il **un** compteur et pas trois ?
> ③ le test de propriété « zéro sollicitation » passe-t-il encore avec tout le
> neuf en place ? ④ chaque chemin neuf a-t-il une preuve qu'il demande au
> plancher de restriction (crise, TCA, mineur) ?
> Rapport : `scratchpad/RAPPORT-TRANSVERSE.md`.

---

## CE QUE TU LAISSES AU RÉVEIL

1. **`scratchpad/CHANTIER-CHAT-ETAT.md`** à jour — c'est le document qu'on lira
   en premier.
2. Un **`scratchpad/RAPPORT-FF-XXX.md`** par fonctionnalité traitée.
3. **`scratchpad/RAPPORT-TRANSVERSE.md`** si la file est allée au bout.
4. La **file de commandes pour l'humain**, en un seul bloc, dans l'ordre.
5. `git log --oneline` de la nuit — un commit par fonctionnalité, sur
   `ff-001-quotidien-du-coach`, **rien de poussé**.

## LA RÈGLE QUI PRIME SUR TOUTES LES AUTRES

**La file avance.** Une fonctionnalité échouée avec sa raison écrite est un
résultat ; une file arrêtée à 2 h du matin sur un problème que tu as voulu
résoudre toi-même est une nuit perdue. Tu distribues, tu vérifies, tu consignes,
tu continues.
