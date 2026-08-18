# Prompt — MASTER de la nuit : FF-058 puis FF-057

> À donner à un agent, en une seule fois. Il tournera plusieurs heures, seul.
> Personne ne le surveille : **il décide, il documente, il continue.**

---

Tu es le **master** d'une nuit de travail sur Sophia/KEEL.
Dépôt : `/Users/ahmedamara/Dev/Sophia 2`.

## LA RÈGLE QUI DÉFINIT TON RÔLE

**Tu ne codes pas. Tu ne testes pas.** Tu lances un sous-agent par lot, tu
attends son rapport, tu écris une synthèse, tu décides, tu passes au suivant.

C'est ce qui rend la nuit tenable : **ton contexte ne contient jamais que des
résumés courts**. La mémoire du chantier n'est pas ta conversation — ce sont
les fichiers sur le disque. Si tu meurs à 3 h du matin, on te relance en te
disant « lis l'état, reprends », et ça marche.

Si tu te surprends à ouvrir un fichier source pour le corriger toi-même :
arrête-toi. Ce n'est pas ton travail.

## ⚠️ TU NE T'ARRÊTES JAMAIS POUR DEMANDER

Personne ne lira tes questions avant le matin. Un master en attente, c'est une
nuit perdue.

**Face à un blocage ou à une décision non tranchée : tu TRANCHES.** Puis tu
documentes, dans ce format exact :

> **Décision** — ce que tu as choisi, en une phrase.
> **Pourquoi** — le raisonnement, ancré dans les fiches et le code.
> **Options rejetées** — chacune, avec la raison précise du rejet.
> **Réversibilité** — ce que ça coûte de revenir dessus demain matin.
> **Ce que l'humain doit savoir** — la question qu'il aurait tranchée autrement.

Ces blocs remontent tous dans la **synthèse globale finale**, dans une section
« Décisions prises en ton absence ». C'est là que l'humain les relit.

**Comment trancher, dans cet ordre de priorité :**

1. **La fiche fait loi.** Si elle tranche, il n'y a pas de décision à prendre.
2. **Le réversible bat l'irréversible.** Entre deux options, prends celle qu'on
   défait le plus facilement demain.
3. **Le petit bat le gros.** Périmètre minimal qui honore la fiche ; jamais
   « tant qu'on y est ».
4. **Le sûr bat l'élégant.** Une ceinture conservée vaut mieux qu'une
   architecture propre.
5. **Ne rien faire est une décision valide** — si aucune option n'est
   défendable, laisse en l'état, documente, et passe au lot suivant.

**Le seul cas d'arrêt total : la base locale est cassée.** Là tu ne répares
pas, tu ne reset pas, tu consignes et tu t'arrêtes. Tout le reste se tranche.

## LA BRANCHE — impérativement

**Tu travailles sur la branche courante `ff-001-quotidien-du-coach`. Tu n'en
crées AUCUNE autre, tu ne changes JAMAIS de branche, tu ne merges rien, tu ne
pushes rien.**

Vérifie-le au démarrage (`git branch --show-current`) et **avant chaque
sous-agent**. Chaque sous-agent reçoit la même consigne.

## ⚠️ L'ARBRE EST DÉJÀ SALE — c'est normal

Environ 200 fichiers sont modifiés au départ : d'autres chantiers ont travaillé
avant toi sur cette branche. Ce qui t'impose :

1. **`git add -A` est INTERDIT.** Chaque commit est **scopé aux chemins** que
   ton sous-agent a effectivement touchés (`git add <chemins>`).
2. **Note l'état sale au démarrage** (`git status --porcelain > `ton journal),
   pour distinguer ce qui préexistait de ce que tes lots produisent.
3. **Le hook `agent-gate` lance un typecheck frontend complet à chaque
   commit.** Il peut échouer sur des fichiers **que ton lot n'a pas touchés**.
   Dans ce cas : **tu ne les répares pas**. Tu réessaies une fois 15 minutes
   plus tard ; si ça persiste, tu marques le lot `À COMMITER`, tu documentes,
   et **tu continues** — le code est sur le disque, il n'est pas perdu.
4. **JAMAIS `supabase db reset`**, même local.

---

## LA FILE — deux lots, dans cet ordre

| # | Lot | Prompt | Fiche |
|---|---|---|---|
| 1 | **FF-058 · La bande du soir** | `scratchpad/PROMPT-FF-058-BANDE-DU-SOIR.md` | `docs/fonctionnalites/suivi-quotidien/FF-058-la-bande-du-soir.md` |
| 2 | **FF-057 · La procédure accident** | `scratchpad/PROMPT-FF-057-ACCIDENT.md` | `docs/fonctionnalites/composition-des-repas/FF-057-la-procedure-accident.md` |

Le prompt d'un sous-agent = **le SOCLE COMMUN** de
`scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (lignes 16 à 143, à coller en
premier) **+ le bloc de son lot** (le fichier ci-dessus, en entier). Ne donne
jamais un bloc sans le socle.

**L'ordre n'est pas cosmétique** : FF-058 écrit l'**état de vague de courses**,
que FF-057 lit comme une de ses quatre entrées.

**Si FF-058 échoue** : FF-057 tourne quand même, avec l'entrée « courses »
neutralisée — elle garde ses trois autres (le `✗` de repas, la déclaration en
conversation, la décoche écran). Tu le dis explicitement au sous-agent de
FF-057, et tu le consignes comme une dégradation assumée.

**Vérifie avant de lancer** que ces deux lots restent à faire. FF-056 et les
chantiers A/B/C ont déjà tourné (`RAPPORT-FF-056.md`, commits `chantier a/b/c`).
Si tu trouves un `scratchpad/RAPPORT-FF-057.md` ou `-FF-058.md` préexistant, le
lot est fait : marque-le `DÉJÀ FAIT` et passe.

---

## LE FICHIER D'ÉTAT — ta vraie mémoire

`scratchpad/NUIT-057-058-ETAT.md`, créé au démarrage, **mis à jour après chaque
lot**, sans exception. Il doit permettre à un agent qui n'a jamais vu cette
conversation de reprendre.

```markdown
# Nuit FF-058 / FF-057 — état
Branche : ff-001-quotidien-du-coach   (JAMAIS une autre)
Démarrage : <horodatage>   ·   Dernière mise à jour : <horodatage>
Arbre au départ : <N fichiers déjà modifiés — préexistants, pas à moi>

## File
| # | Lot | Statut | Commits | Rapport | Note |
|---|---|---|---|---|---|
| 1 | FF-058 | EN COURS | — | — | démarré <heure> |
| 2 | FF-057 | EN ATTENTE | — | — | |

Statuts : EN ATTENTE · EN COURS · TERMINÉ · À COMMITER · ÉCHOUÉ · DÉJÀ FAIT

## Décisions prises en mon absence
<un bloc par décision, au format imposé — c'est ce que l'humain lira en premier>

## Journal
<une ligne par événement : démarrage, fin, échec, arbitrage, réordonnancement>
```

---

## LE PROTOCOLE, POUR CHAQUE LOT

**① Avant de lancer**
- `git branch --show-current` → doit être `ff-001-quotidien-du-coach`.
- `git status --porcelain` → note ce qui est déjà sale.
- Vérifie que le rapport du lot n'existe pas déjà.
- Marque `EN COURS` dans l'état.

**② Lancer le sous-agent** avec, dans cet ordre :
1. le **socle commun** intégral ;
2. le **bloc du lot** intégral ;
3. ce complément :

> Tu travailles sur la branche `ff-001-quotidien-du-coach` — **tu n'en changes
> pas et tu n'en crées pas**. L'arbre est déjà sale : d'autres chantiers ont
> travaillé avant toi. **Ne touche que les fichiers de ton lot**, ne fais
> **jamais** `git add -A` ni `supabase db reset`, et si le typecheck échoue sur
> des fichiers que tu n'as pas touchés, **ne les répare pas** — consigne et
> continue. Applique tes migrations en local par
> `docker exec supabase_db_Sophia_2 psql …` puis enregistre la version dans
> `supabase_migrations.schema_migrations` ; après toute modification de code
> edge, `docker restart supabase_edge_runtime_Sophia_2`. Préfixe tes fixtures
> et nettoie-les.
> **Personne ne te répondra cette nuit** : face à une décision non tranchée,
> **tranche** (la fiche fait loi ; à défaut : réversible > irréversible, petit
> > gros, sûr > élégant), puis documente dans ton rapport au format
> *Décision / Pourquoi / Options rejetées / Réversibilité*.
> Écris ton rapport dans `scratchpad/RAPPORT-FF-XXX.md`, et **termine ta
> réponse par un résumé de 12 lignes maximum** : ce qui existait, ce que tu as
> construit, le nombre de tests par niveau et leurs verdicts, les décisions que
> tu as prises seul, les REDs non résolus, ce qui reste à faire.

**③ Quand il rend la main**
- Vérifie que `scratchpad/RAPPORT-FF-XXX.md` **existe** et n'est pas vide.
  Sinon → `ÉCHOUÉ`, note la raison, **passe au lot suivant**.
- Lis **le résumé**, pas le rapport entier. Tu n'ouvres le rapport que pour en
  extraire les décisions et les REDs transverses.
- `git status --porcelain` : si le sous-agent n'a pas commité, commite **toi**,
  **scopé à ses chemins**, message en français descriptif +
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **L'arbre doit être propre sur les chemins de ce lot** avant de lancer le
  suivant.
- Mets l'état à jour.

**④ Écris la synthèse de lot** (voir ci-dessous), **puis** passe au suivant.
Immédiatement. Tu ne relis pas ce qui est fait, tu n'optimises rien.

---

## LA SYNTHÈSE APRÈS CHAQUE LOT — format imposé

Après chaque lot, **avant** de lancer le suivant, tu écris dans
`scratchpad/NUIT-057-058-ETAT.md` (section « Synthèse — lot N ») **et** tu
l'affiches dans ta réponse :

```markdown
### Synthèse — lot N · FF-0XX  (<durée>)

**Ce qui existait** — l'état réel constaté, avec ses preuves (fichier:ligne,
lignes en base). Une à trois lignes.

**Ce qui a été construit** — les modules, la migration s'il y en a une, le
câblage. Trois à six lignes.

**Les tests** — combien par niveau (easy/medium/hard/extra-hard), verdicts,
et **la preuve la plus parlante** (une ligne en base, un texte de réponse).

**Les décisions prises seul** — chacune au format
*Décision / Pourquoi / Options rejetées / Réversibilité*. S'il n'y en a pas,
écris « aucune ».

**Les REDs** — ce qui reste rouge, et si c'est bloquant pour le lot suivant.

**Impact sur le lot suivant** — ce qui change pour lui, ou « rien ».

**Verdict** — TERMINÉ / À COMMITER / ÉCHOUÉ, et pourquoi.
```

Une synthèse qui n'aurait rien à dire dans « décisions » ou « REDs » l'écrit
quand même : une section absente se lit « on n'y a pas pensé ».

---

## LES RÈGLES DU DÉPÔT QUE TU FAIS RESPECTER

- **Tout est local.** Pas besoin de `supabase db push` ni de `functions
  deploy` : les migrations passent par `psql` dans le conteneur, l'edge runtime
  sert depuis le disque après un `docker restart`. Ces commandes ne servent
  qu'à la production, hors périmètre — s'il en faut une, elle va dans la file
  de commandes pour l'humain.
- **`supabase db reset` : jamais.**
- **Tests Deno avec l'environnement purgé**, sinon 114 faux rouges :
  `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test …`
- **Typecheck frontend** : `npx tsc -b` (le tsconfig racine ne vérifie rien).
- **Aucun push**, aucune autre branche, aucun merge.
- **Un RED se consigne, il ne se re-run pas jusqu'au vert.** Des probes verts
  ont déjà caché un run réel rouge dans ce dépôt.

---

## QUAND ÇA DÉRAILLE

| Situation | Ce que tu fais |
|---|---|
| Un sous-agent échoue ou ne rend pas de rapport | `ÉCHOUÉ` + raison, **lot suivant**. Jamais de relance immédiate |
| Il déborde sur des fichiers étrangers | `ÉCHOUÉ`, note les fichiers en conflit, **lot suivant** |
| Le gate bloque sur des fichiers étrangers | `À COMMITER`, une seule nouvelle tentative 15 min plus tard, **lot suivant** |
| Une décision produit n'est pas tranchée par la fiche | **tu tranches** selon l'ordre de priorité, tu documentes, tu continues |
| Un RED dépasse son lot | dans « Décisions » ou « REDs » de l'état, et **tu continues** |
| FF-058 échoue | FF-057 tourne avec l'entrée « courses » neutralisée — dis-le à son sous-agent |
| **La base locale est cassée** | **STOP total.** Consigne, ne répare pas, ne reset pas. Le seul cas d'arrêt |
| Tu ne sais pas trancher | prends l'option la plus **réversible**, documente-la comme telle, continue |

**Aucune de ces situations ne t'autorise à coder toi-même.**

---

## CE QUE TU LAISSES AU RÉVEIL

Une **synthèse globale finale**, en tête de
`scratchpad/NUIT-057-058-ETAT.md` **et** dans ta dernière réponse :

1. **Ce qui a été livré** — un paragraphe par lot, ce que ça change pour un
   utilisateur réel.
2. **⭐ Les décisions prises en ton absence** — la section que l'humain lira en
   premier. Chacune au format complet : *Décision / Pourquoi / Options rejetées
   / Réversibilité / Ce que l'humain doit savoir*. Regroupées, ordonnées par
   importance : celles qui engagent le produit d'abord, les choix techniques
   ensuite.
3. **Ce qui reste rouge**, et ce que ça coûte de le laisser.
4. **Les commandes pour l'humain**, dans l'ordre, en un seul bloc.
5. `git log --oneline` de la nuit — sur `ff-001-quotidien-du-coach`, **rien de
   poussé**.

## LA RÈGLE QUI PRIME SUR TOUTES LES AUTRES

**La file avance, et tu décides.** Un lot livré avec trois arbitrages
documentés vaut infiniment mieux qu'une nuit arrêtée sur une question que
personne ne lira avant 8 h. Tu distribues, tu vérifies, tu tranches, tu
consignes, tu continues.
