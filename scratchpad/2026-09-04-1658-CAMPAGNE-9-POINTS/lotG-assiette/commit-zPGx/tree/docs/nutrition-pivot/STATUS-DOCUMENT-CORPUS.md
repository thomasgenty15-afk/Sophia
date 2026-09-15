# ÉTAT — le corpus documentaire du coach (garder ce qu'on a lu)

> 2026-08-06. Branche **`dewhatsapp`**.
> **Rien n'est déployé.** Local uniquement — migration appliquée sur la stack
> Docker locale, `coach-doctrine-v1` et `account-export-v1` non redéployées.

---

## En une phrase

Le PDF que le coach dépose n'est plus jeté après lecture : son **texte est
découpé et gardé**, son **fichier est déposé** dans le bucket privé déjà réclamé
par le RGPD, et chaque entrée extraite garde la **phrase du document** dont elle
sort, ancrée à sa page.

---

## Pourquoi maintenant : la mesure, pas l'intuition

`docs/nutrition-pivot/qa-web/M1-block-budget.txt` — reproductible par
`deno run -A docs/nutrition-pivot/qa-web/M1_block_budget.ts`.

| Ce qui est injecté | Poids | Borné ? |
|---|---|---|
| Doctrine, interview seule (~25 entrées) | ~5 300 car. **≈ 1 300 tok.** | **non** |
| Doctrine, + un ebook extrait (~122 entrées) | ~40 000 car. **≈ 10 000 tok.** | **non** |
| Doctrine, 3 documents fusionnés (~350 entrées) | ~119 000 car. **≈ 30 000 tok.** | **non** |
| Mapping alimentaire, TOUS les groupes (30) | ≈ 1 200 tok. | oui — vocabulaire fermé |
| Note 1:1 du coach, au plafond | ≈ 530 tok. | oui — CHECK en base |

Seuils, en faisant croître le profil « ebook » : **2 000 tok. à ~23 entrées,
5 000 à ~62, 10 000 à ~124, 30 000 à ~374.**

Le compilateur ne compresse rien — c'est le contrat (`lock 1: INJECTED`). Le
bloc vaut *en-tête fixe (363 car.) + tout ce que le coach a écrit + 6 à 54 car.
de structure par entrée*. Donc la taille du prompt suit l'écriture du coach,
linéairement, et **aucune borne n'existe entre les deux** : ni CHECK en base
(`coach_doctrines` porte du jsonb nu), ni cap dans `parseCoachDoctrine`, ni cap
dans `parseDocumentExtraction`, et la fusion documentaire **ajoute sans jamais
retirer**.

Multiplication à ne pas perdre de vue : ce bloc part sur **trois** chemins
(conversation, `generate-week-plan-v1`, `generate-meal-v1`), à chaque appel,
pour chaque élève. À 10 000 tokens, un coach de 30 élèves qui parlent 5 fois par
jour paie **1,5 M tokens d'entrée par jour** sur la seule conversation.

**Conclusion opérationnelle :** la récupération sémantique n'est pas urgente
tant qu'un coach reste à l'interview ; elle le devient **au premier ebook**.
Et elle était **impossible**, parce qu'il n'y avait rien à récupérer — d'où ce
lot, qui persiste avant de retrouver.

---

## Ce que le lot ajoute

| Table | Ce qu'elle porte |
|---|---|
| `coach_documents` | le fichier (empreinte, pages, octets, chemin de stockage) et l'**état de son texte** |
| `coach_document_chunks` | le texte découpé, chaque morceau ancré à **sa** page |
| `coach_document_citations` | ce qui relie une entrée extraite à la phrase qui la justifie |

Plus : `_shared/keel/document_corpus.ts` (pur : découpage, ancrage, clés) et
`document_corpus_io.ts` (lecture du PDF, dépôt, écritures).

---

## Les décisions qui se réexpliqueraient sinon

**Le fichier va dans `plan-documents`, pas dans un bucket neuf.** Ce bucket est
déjà décrit comme « le dépôt source du coach », il est privé, et surtout il est
déjà réclamé par les deux routines RGPD (`account-export-v1` empaquette
`<user_id>/`, `purge-deleted-accounts` supprime `<user_id>/`, les deux marchent
récursivement). Un bucket neuf aurait été invisible à l'export et aurait survécu
à la purge tant que personne n'y pense — un défaut RGPD, pas un détail de
rangement. Convention de chemin porteuse : `<coaches.user_id>/doctrine/<id>.pdf`,
**jamais** `coaches.id`.

**Il n'y a PAS de colonne `embedding`.** Aucun écrivain, aucun lecteur. Ce dépôt
a déjà droppé `student_facts` et `recurring_meals` pour cette raison exacte. La
colonne s'ajoutera le jour où un chemin l'écrit et un chemin la lit — pgvector
est déjà installé pour la mémoire de l'élève.

**La citation est OPTIONNELLE sur une entrée de doctrine, OBLIGATOIRE sur une
proposition d'aliment.** Ce n'est pas une incohérence : le coach lit une
conviction et la juge directement, là où il accepte une règle d'aliment sans la
juger — c'est elle qui a besoin de sa preuve attachée. Exiger la citation
partout amputerait la doctrine de tout ce qu'un ebook dit sur trois pages sans
jamais le résumer en une phrase.

**La citation ne voyage PAS dans le brouillon.** Elle est retirée par
`parseDocumentExtraction` et rangée à part. Laissée dedans, elle serait jetée en
silence par `parseCoachDoctrine` (qui ignore les champs inconnus) — on aurait
payé la citation au modèle sans jamais la garder ; et si un jour le parseur la
gardait, elle finirait recopiée dans le bloc compilé, c'est-à-dire des pages
d'ebook injectées à chaque tour. Le brouillon rendu à l'écran est **exactement**
celui d'avant ce lot.

**La clé d'une citation est le TEXTE de l'entrée, replié.** Au moment de
l'extraction, l'entrée n'existe nulle part : le brouillon n'est pas enregistré,
le coach va le relire, le corriger, en supprimer. Un index de tableau serait faux
dès la première suppression ; un uuid désignerait une ligne qui n'existera
peut-être jamais. Conséquence assumée : si le coach réécrit la phrase, la
citation ne s'affiche plus en face — c'est exact, ce n'est plus la phrase du
document.

**Trois états nommés pour le texte, et `no_text_layer` n'est pas une panne.** Un
ebook exporté en images se lit très bien pour le modèle (il le *voit*) et ne rend
aucun texte. Confondre ça avec `extraction_failed` enverrait le coach chercher un
bug qui n'existe pas. Conséquence directe : **on ne tente l'ancrage d'une
citation que sur `extracted`**. Sur un document sans couche texte, toute citation
serait « introuvable » et on transformerait une propriété du fichier en soupçon
sur le modèle.

**Un chunk ne traverse jamais une page.** Le numéro de page est tout ce que la
citation apporte au coach ; « c'est écrit quelque part » ne se vérifie pas.
Fusionner deux pages courtes pour équilibrer les tailles échangerait la seule
propriété utile contre une statistique plus jolie.

**Rien de ce module ne peut coûter son extraction au coach.**
`persistDocumentCorpus` ne lance jamais et rend une raison **nommée** que
l'appelant journalise. Le coach vient d'attendre deux minutes qu'un modèle lise
cent pages ; lui rendre une erreur alors que son brouillon est prêt le ferait
redéposer le fichier pour obtenir le même échec. Un `catch` muet aurait été pire
que l'exception — c'est la cicatrice `as-cast-on-foreign-type-disarms-typecheck`.

---

## Deux bugs trouvés par le run réel, et pas autrement

**1. pdf.js DÉTACHE le buffer qu'on lui donne.** Après extraction, les mêmes
octets ne sont plus lisibles : `Cannot perform Construct on a detached
ArrayBuffer`. L'empreinte échouait, et comme le module ne lance jamais, ça se
voyait comme « le corpus n'a pas été écrit », sans cause lisible — un document
sur deux passait, l'autre non. Deux gardes, parce qu'une seule se perdrait au
prochain déplacement de ligne : l'empreinte est calculée **avant**, et
l'extracteur reçoit une **copie**.

**2. Redéposer le même PDF accumulait des citations.** Deux lectures du même
document ne rendent pas exactement les mêmes entrées : le modèle en formule une
autrement, sa clé naturelle change, et une citation de plus s'écrivait à chaque
passage — mesuré +1 au second dépôt. Le geste le plus fréquent d'un coach dont
la première tentative « ne répond pas » devenait une accumulation silencieuse de
citations ne correspondant à **aucune** entrée du brouillon courant. Un document
déjà connu n'en reçoit plus aucune : sa lecture de référence est la première.

---

## Ce qui marche, et comment on le sait

| Livrable | Preuve |
|---|---|
| Module pur (découpage, ancrage, clés, dédup) | `document_corpus_test.ts` — **18/18** |
| Citations retirées du brouillon | `doctrine_document_test.ts` — **26/26** (5 neufs) |
| Aucune régression sur `_shared/keel/` | `deno test -A supabase/functions/_shared/keel/` — **961/961** |
| Migration : CHECK, index uniques, RLS, cascades, `anon` | `coach_document_corpus_test.sql` — **33 assertions** |
| Conditions réelles (vraie fonction, vraie base, vrai bucket, vrai modèle) | `M2_document_corpus.ts` — **39/39**, sortie dans `qa-web/M2-document-corpus.txt` |
| L'éditeur de doctrine n'a pas bougé | `D3_doctrine_roundtrip.ts` — **13/13** |

Les cas réels couverts par M2 : PDF texte (citations ancrées 6/6 à la bonne
page), brouillon sans citation, re-dépôt du même fichier, second document,
**PDF sans couche texte**, citation non ancrable, **double dépôt simultané**
(course sur l'index unique), page longue accentuée découpée sans quitter sa
page, les quatre refus (`document_required`, `document_must_be_pdf`,
`document_unreadable`, `document_too_long`) qui n'écrivent **rien**, isolation
coach A / coach B par leur propre JWT, chemin de stockage RGPD vérifié dans le
bucket, l'interview qui ne touche pas au corpus, et le dépôt sans id auth
(le texte survit, le fichier est perdu, c'est dit).

**Mesure du corpus** (E14) : un ebook au plafond de 120 pages donne **360
chunks, 327 240 caractères (~82k tokens), écrits en 648 ms**. À comparer aux
~10 000 tokens du bloc compilé du même coach : le corpus est huit fois le
prompt, et c'est exactement pourquoi on récupère dedans au lieu de l'injecter.

---

## Réclamé par le RGPD

`account-export-v1` exporte les trois tables côté coach (`documents_source_coach`,
`passages_documents_coach`, `citations_documents_coach`), y compris le texte
intégral et `storage_path` — sans lui, le coach ne saurait pas quel PDF de
l'archive correspond à quelle ligne. Le fichier lui-même sortait déjà, via
`fichiers/documents-plan`. La purge est couverte par cascade
(`auth.users` → `coaches` → les trois tables) et par le walk récursif du bucket.

---

## Ce qui reste ouvert

- **Aucun écran ne montre le corpus.** Le coach ne voit pas encore « cette
  conviction vient de la page 42 », ni ce que l'extraction a **ignoré** de son
  document — qui était l'une des trois raisons du lot. La donnée est là ; l'écran
  reste à faire.
- **Rien n'est déployé.** Migration locale seulement ; `coach-doctrine-v1` et
  `account-export-v1` doivent partir ensemble (l'export lit trois tables qui
  n'existent pas encore à distance — `fetchKeelRows` les rangerait dans
  `tables_indisponibles`, ce qui est dégradé mais pas cassant).
- **La récupération elle-même n'existe pas.** C'est le lot suivant, et la ligne
  qui doit le gouverner est écrite : les **bornes** (interdits, aliments
  déconseillés, voix, et les CLÉS de convictions dont dépend
  `..._doctrine_traceable_check`) restent injectées entières ; seule la **prose**
  se récupère. Un interdit non récupéré est un verrou désarmé.
- **Un `entry_key` orphelin est invisible.** Si le coach réécrit une phrase, sa
  citation reste en base sans jamais s'afficher. Voulu (voir plus haut), mais
  personne ne les nettoie.
- **Découverte en passant, corrigée :** `D3_doctrine_roundtrip.ts` attendait
  **6** variantes compilées, figées en dur avant l'arrivée de `muscle_gain`
  (migration 20260805120000). Trois de ses assertions étaient rouges sans
  qu'aucune régression n'ait eu lieu — c'est-à-dire qu'elles avaient cessé de
  pouvoir en signaler une. Le compte se lit maintenant depuis `GOAL_TOKENS`.
