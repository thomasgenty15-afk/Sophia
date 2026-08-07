# KEEL — LEGAL

> **Ce document n'est pas un avis juridique et ne remplace pas un conseil.** Il est écrit pour
> que le fondateur sache **ce qu'il faut faire relire**, **où le code contredit déjà la promesse
> légale**, et **quelle formulation exacte utiliser** en attendant. Les points marqués
> **⚖️ À FAIRE VALIDER** doivent passer devant un avocat avant le premier élève payant.
>
> Le produit : un coach santé/nutrition écrit un protocole ; KEEL l'exécute, observe des faits et
> en dérive une adhérence. **KEEL n'écrit jamais le plan.** Cette phrase n'est pas un slogan :
> c'est la ligne de défense principale de tout ce document. Voir [CONTRACT.md](CONTRACT.md).

---

## 1. « Not a medical device » — le positionnement, et ce qui le tient

### 1.1 La position

KEEL est un **outil de bien-être général** et un **outil de travail pour un professionnel**.
Il ne diagnostique pas, ne traite pas, n'atténue pas et ne prévient pas une maladie. Il
n'interprète pas de données cliniques et ne produit aucune recommandation thérapeutique.

Aux États-Unis, un logiciel peut tomber sous la définition de *device* (FD&C Act § 201(h)) ;
le 21st Century Cures Act (§ 3060) et la guidance FDA *General Wellness: Policy for Low Risk
Devices* excluent les logiciels de bien-être général à faible risque. **Le fil qui sépare les
deux est la revendication**, pas la technologie. Une seule phrase marketing (« améliore votre
insulinorésistance ») fait basculer le produit du bon côté au mauvais.

### 1.2 Ce qui tient cette position dans le code — et qui doit y rester

| Garantie produit | Où elle vit | Ce qui la casserait |
|---|---|---|
| L'IA n'est jamais l'auteur d'une prescription | `plan-publish-v1`, `student_instruction` copiée **verbatim** | une « suggestion » du modèle appliquée sans revue du coach |
| Aucune quantité inférée d'une photo | CONTRACT non-input #4 : un fait photo ne produit **jamais** de `micronutrient`/`energy` | afficher un compte calorique comme un fait |
| Aucun nutriment déduit d'un aliment | CONTRACT non-input #3 | une table de composition qui « complète » les apports |
| `unknown` n'est jamais transformé en `met` par le silence | balayage de fin de journée | une inférence « il n'a rien dit donc c'est bon » |
| Aucun pourcentage sous 4 jours loggés sur 7 | union discriminée sans champ de pourcentage | un affichage « estimé » |

**Ces cinq lignes sont autant juridiques que techniques.** Elles sont ce qui permet de dire
« nous n'interprétons pas, nous restituons ». Une régression sur l'une d'elles n'est pas un bug
d'UX, c'est un changement de catégorie réglementaire.

### 1.3 Formulations exactes

**Dans l'app (pied de page persistant, coach et élève)** :

> KEEL is a general wellness and coaching tool. It is not a medical device. It does not diagnose,
> treat, cure, or prevent any disease. It does not replace advice from a licensed healthcare
> professional. Always consult your physician before changing your diet, supplements, or exercise,
> particularly if you have a medical condition, are pregnant or breastfeeding, or take medication.

**À l'écran d'un élève, à la première ouverture, avec accusé de réception** :

> Your coach wrote this protocol. KEEL runs it — it never writes it, changes it, or adds to it.
> KEEL is not a medical service and cannot tell you whether this protocol is right for you.
> If something feels wrong, stop and talk to your coach or your doctor.

**Sur toute ligne « molécule » (supplément, micronutriment)** :

> Supplement information provided by your coach. These statements have not been evaluated by the
> Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent
> any disease.

**Sur une ligne au-dessus d'une limite supérieure de sécurité (UL)** :

> 🔄 **Changement produit, 2026-07-28.** Ce paragraphe imposait la **dégradation au rendu** en
> suggestion éducative « food-first » : l'élève recevait la ligne sans la dose, et le coach un
> bouton « Mark as clinician-ordered » pour la récupérer. **Ce gate n'existe plus.** Le coach est
> le prescripteur ; la ligne part telle qu'il l'a écrite, dose comprise. Ce qui reste est une
> **note factuelle visible du coach seul** (« Above the NIH upper limit (4000 IU/day) »), qui ne
> bloque rien et n'exige rien. Le risque assumé est décrit en §5.2.

Le disclaimer DSHEA ci-dessus s'applique inchangé à ces lignes. **Aucune phrase de KEEL ne dit à
l'élève que sa dose est trop élevée** : ce serait un avis clinique rendu par le logiciel sur la
prescription d'un professionnel — exactement l'inverse de la position défendable de §5.1. La
question « cette dose est-elle la bonne ? » se pose au coach, à qui la note est adressée.

> ⚠️ Rappel du CONTRACT : le dosage fonctionnel **au-dessus de l'UL est le cas nominal**
> (D3 5000 UI vs UL 4000), pas un cas limite. C'est précisément pourquoi une ceinture qui le
> traitait comme une anomalie ne pouvait pas tenir : un coach l'aurait contournée à chaque ligne,
> et une ceinture contournée à chaque ligne ne protège personne.

### ⚖️ À FAIRE VALIDER
Formulation store (App Store / Play) si une app mobile arrive ; usage du mot « adherence » face
à un régulateur ; pertinence du disclaimer DSHEA quand KEEL ne vend aucun supplément mais relaie
la prescription d'un tiers.

---

## 2. Consentement granulaire à l'intake

### 2.1 Le principe
**Un consentement par finalité, chacun refusable séparément, aucun pré-coché, chacun horodaté et
révocable.** Un consentement global « j'accepte les CGU » ne couvre ni les données de santé, ni
WhatsApp, ni les photos. Sous RGPD, les données de santé sont une catégorie particulière
(art. 9) : la base légale du pilote est le **consentement explicite** (art. 9(2)(a)).

### 2.2 Les 6 consentements, séparés

| # | Finalité | Texte (EN) | Refusable ? | Conséquence du refus |
|---|---|---|---|---|
| 1 | Traitement de données de santé | *I agree that KEEL processes health-related information (my protocol, what I log, my notes) so my coach can follow my progress.* | non | pas de compte — c'est le produit |
| 2 | Partage avec **ce** coach nommé | *I agree that <Coach Name> can see what I log and the adherence KEEL derives from it.* | non | pas de lien coach |
| 3 | Photos de repas | *I agree to send meal photos for analysis. Photos are private, stored encrypted, and never used to train models.* | **oui** | logging texte uniquement |
| 4 | WhatsApp | *I agree to receive reminders and to log by WhatsApp. Message rates may apply.* | **oui** | app web uniquement |
| 5 | Analyse par IA | *I understand my messages and photos are processed by an AI model to structure what I report.* | non | c'est le runtime |
| 6 | Recherche / amélioration produit | *(optionnel)* | **oui** | aucune |

**Le n°6 doit être décoché par défaut.** C'est le seul qui n'a aucune contrepartie fonctionnelle,
donc le seul où un pré-cochage serait manifestement non libre.

### 2.3 Ce que le consentement ne couvre PAS, et qu'il faut dire
- **Un changement de coach ne re-consent pas automatiquement.** Le consentement n°2 nomme un
  coach. Un nouveau coach = un nouveau consentement, explicite. Voir § 5 : aujourd'hui le code
  ne tient pas cette promesse.
- **La révocation est un geste produit**, pas un e-mail au support :
  `revoke_coach_access()` existe et passe le lien à `ended`. Le bug qui enfermait l'élève chez le
  coach congédié a été corrigé (W1 D3) ; le test RLS le prouve (*« student can switch coach after
  revoking »*).

### 2.4 Mineurs
**Pas d'élève de moins de 18 ans dans le pilote.** Vérification à l'intake, en dur. Un mineur
déclenche COPPA (US, < 13), le régime « enfant » du RGPD, et — au Royaume-Uni — l'interdiction de
diriger une communication de contrôle du poids vers un mineur (§ 6). Le coût de conformité est
sans rapport avec la valeur d'un élève de plus dans un pilote de 15.

### ⚖️ À FAIRE VALIDER
Base légale retenue (consentement vs contrat), texte des CGU EN, durées de conservation,
politique de rétention après résiliation du coach, et le fait que **le coach est destinataire**
et non simple lecteur.

---

## 3. DPA coach — qui est *controller*, qui est *processor*

### 3.1 La répartition
- **Le coach est le *controller*.** C'est lui qui décide de la finalité (accompagner cet élève),
  qui écrit le protocole, qui choisit ce qu'il collecte. C'est sa relation professionnelle.
- **KEEL est le *processor*.** Il exécute des instructions : semer les journées, observer,
  dériver, restituer. Il n'ajoute aucune finalité propre.
- **KEEL redevient *controller*** pour ses propres finalités : facturation, sécurité, logs
  techniques, prévention de la fraude. Cette bascule doit être **écrite**, pas implicite.

Cette répartition n'est pas cosmétique : elle décide **qui répond à une demande d'accès**, qui
notifie une violation, et qui est en première ligne face à une autorité. Le fait que la doctrine
produit dise « le coach écrit, l'IA exécute » est aligné avec le fait juridique — c'est rare et
c'est un actif. Ne le perds pas.

### 3.2 Ce que le DPA doit contenir (art. 28 RGPD)
Objet, durée, nature et finalité · catégories de données (santé) et de personnes concernées ·
instructions documentées · confidentialité du personnel · mesures de sécurité (art. 32) ·
**sous-traitants ultérieurs autorisés, nommés** · assistance aux droits des personnes ·
notification de violation **sous 72 h vers le coach** · restitution/suppression en fin de
contrat · droit d'audit.

### 3.3 Sous-traitants ultérieurs — la liste réelle, à nommer

| Sous-traitant | Rôle | Où sont les données | À vérifier |
|---|---|---|---|
| Supabase | base, auth, storage, edge functions | **région du projet à choisir explicitement** | résidence UE si élèves UE |
| Google (Gemini) | structuration de plan, chat, analyse photo | API, transfert hors UE | **exclusion d'entraînement à obtenir par écrit** |
| Meta (WhatsApp Cloud API) | transport des messages | | contenu de santé sur un canal grand public : § 4.4 |
| Vercel | hébergement front + analytics | | § 4.3 — problème ouvert |
| Resend | e-mails transactionnels | | |
| Stripe | facturation coach | | pas de données de santé |

**Transferts hors UE** : chacun a besoin de sa base (clauses contractuelles types, Data Privacy
Framework selon le cas). ⚖️ **À FAIRE VALIDER** avant d'ouvrir à un coach européen.

### 3.4 Le DPA est un prérequis d'onboarding, pas une formalité de fin
Un coach qui envoie 15 élèves avant d'avoir signé le DPA crée une exposition rétroactive que rien
ne rattrape. **Le DPA se signe avant la création du premier `coach_clients`.**

---

## 4. La règle ZÉRO PIXEL

### 4.1 La règle
**Aucun pixel publicitaire ni SDK de tracking tiers sur une surface authentifiée.**
Ni Meta Pixel, ni Google Ads / GTM / GA, ni TikTok, ni LinkedIn Insight, ni Hotjar, ni aucun
enregistreur de session. Ni sur `/app/*`, ni sur `/coach/*`, ni sur `/join`.

### 4.2 Pourquoi — ce n'est pas une préférence esthétique
C'est **le risque d'enforcement n°1** pour un produit santé grand public aux États-Unis. La FTC a
sanctionné GoodRx et BetterHelp pour avoir transmis des informations de santé à des plateformes
publicitaires via des pixels, au titre de la **Health Breach Notification Rule** — et la HBNR
s'applique **hors HIPAA**, précisément aux applications de santé non couvertes. Un pixel sur une
page où l'URL contient un identifiant d'élève transmet un fait de santé à un annonceur. Il n'y a
pas de version « anonymisée » de ça : l'annonceur possède déjà l'identité.

Le mode d'échec n'est jamais une décision : c'est **un pixel ajouté sur la landing page
marketing, puis un layout partagé**, et il se retrouve derrière l'authentification sans que
personne ne l'ait voulu.

### 4.3 ⚠️ Le code ne respecte pas encore complètement la règle — vérifié le 27/07

**Aucun pixel publicitaire** dans `frontend/src` (grep `fbq|gtag|googletagmanager|tiktok|hotjar|
clarity|mixpanel|segment|posthog` : zéro résultat). C'est bon.

**Mais `<Analytics />` de `@vercel/analytics` est monté globalement** dans
`frontend/src/main.tsx:10`, donc sur **toutes** les surfaces authentifiées. Deux fuites concrètes :

1. **`/coach/clients/:id`** — l'`id` est l'**UUID de l'élève**. Le chemin part vers un service
   tiers d'analytics. Ce n'est pas un identifiant publicitaire, mais c'est un identifiant
   d'élève d'une application de santé transmis hors du périmètre, sans base légale nommée dans
   le consentement § 2.
2. **`/join?token=…`** — le jeton d'invitation vit dans la query string. Tout composant
   d'analytics qui capture la query string capture **un secret d'authentification**.

**Correctif** (propriétaire à désigner, pré-pilote) :
- soit retirer `<Analytics />` des routes authentifiées (le monter uniquement sur les surfaces
  publiques),
- soit le configurer pour n'émettre **aucun** chemin dynamique ni query string,
- et, indépendamment : **sortir le jeton d'invitation de la query string** (fragment `#` ou POST).

Un fragment `#token=` n'est jamais envoyé au serveur ni, en pratique, aux analytics — c'est le
correctif le moins coûteux pour le point 2.

### 4.4 Ce que la CSP tient déjà
`frontend/vercel.json` fixe une CSP stricte : `script-src 'self' https://va.vercel-scripts.com`,
`frame-ancestors 'none'`, `object-src 'none'`. **Un pixel Meta ou Google serait bloqué par le
navigateur**, pas seulement interdit par une règle. C'est la bonne architecture : la règle est
appliquée par le runtime, pas par la discipline. **Ne relâche jamais `script-src` pour faire
passer un outil marketing** — c'est exactement la porte que la CSP ferme.

### 4.5 Vérification en CI
`scripts/ci/pixel-check.mjs` (livré en W11.5) tourne dans `npm run ci:keel` :
`pixel-check OK (176 files scanned, 7 rules)`. Vérification manuelle équivalente si besoin :

```bash
grep -rniE "fbq|connect\.facebook\.net|gtag\(|googletagmanager|google-analytics|tiktok|hotjar|clarity\.ms|mixpanel|segment\.com|posthog" frontend/src frontend/index.html frontend/public
# attendu: aucun résultat (hors contenu éditorial mentionnant TikTok comme sujet de conversation)
```

> ⚠️ Un grep de SDK **ne voit pas** le problème du § 4.3 : `@vercel/analytics` est un import npm,
> pas un script tiers, et il passe la CSP par construction. La règle « zéro pixel » et la règle
> « aucun identifiant d'élève hors du périmètre » sont deux règles distinctes ; seule la première
> est automatisée.

### 4.6 WhatsApp et le contenu de santé
Le canal de tracking du produit est WhatsApp. Le contenu des messages transite par
l'infrastructure Meta. **À dire explicitement dans le consentement n°4** (§ 2.2) : c'est
précisément pourquoi ce consentement est séparé et refusable, avec un repli web complet.

---

## 5. Périmètre d'exercice — qui a le droit de dire quoi, et où

### 5.1 États-Unis : **il n'existe aucune licence fédérale** en nutrition
La régulation est **au niveau des États**, et se répartit en trois régimes :

1. **Licence (practice act)** — l'État réserve **l'acte** de conseil nutritionnel, pas seulement
   le titre. Un coach non licencié qui donne un conseil nutritionnel individualisé y exerce
   illégalement, même sans se présenter comme diététicien.
2. **Titre protégé (title act / certification)** — l'acte est libre, mais les titres
   (*Dietitian*, *Licensed Nutritionist*, parfois *Nutritionist*) sont réservés.
3. **Enregistrement ou absence de régulation** — pas de restriction d'exercice.

**Trois conséquences opérationnelles :**

- **Un champ « État d'exercice » du coach est obligatoire à l'inscription.** Sans lui, personne
  ne peut savoir dans quel régime il opère.
- **La *medical nutrition therapy* — conseil nutritionnel pour une maladie diagnostiquée — est
  l'acte restreint à peu près partout.** C'est la frontière la plus nette, et la seule que le
  produit doit refuser structurellement.
- **Le titre affiché dans l'app est du contenu réglementé.** Si le coach saisit son titre en
  texte libre, KEEL le publie. ⚖️ **À FAIRE VALIDER** : afficher un titre déclaratif, sans
  vérification, engage-t-il KEEL ?

**La position défendable de KEEL** : *le coach est responsable de son périmètre d'exercice ;
KEEL est un outil.* Elle doit être **écrite dans les CGU coach**, avec une garantie du coach
qu'il détient les qualifications requises dans son État, et une indemnisation.

### 5.2 Ce que le produit refuse déjà, structurellement
- Aucune prescription générée par l'IA (`plan-publish-v1` copie **verbatim**).
- Un validateur déterministe rejette toute sortie du modèle contenant un token
  `severity='medical'` : une contrainte médicale ne peut pas devenir une phrase de l'IA.
- Le plancher TCA (`disordered_eating_guard`) suspend la pression d'adhérence et rend des
  ressources **cliniques** — pas la hotline suicide, et **aucun chiffre affiché** pendant le flow.

#### ⚠️ Risque assumé, tracé : la responsabilité de prescription est celle du coach (2026-07-28)

Le **gate provenance n'existe plus**. Il n'y a plus de `provenance='clinician_ordered'` à obtenir,
plus de dégradation au rendu, plus de bouton de sign-off. **Les colonnes `provenance` et
`requires_clinician_signoff` restent en base mais ne sont lues par aucun code** (en-tête de la
migration `20260727090000_keel_p0_commitments.sql`).

**Ce que cela veut dire, sans euphémisme :** un coach qui n'est ni diététicien enregistré ni
clinicien peut inscrire un dosage **au-dessus d'une UL NIH** ou touchant la watchlist
d'interactions, et **KEEL le transmettra à l'élève tel quel, dose comprise**, sans dégradation,
sans blocage, sans deuxième paire d'yeux. Le seul artefact produit est une note factuelle que le
coach est libre d'ignorer.

**Pourquoi c'est une décision et pas un oubli.** Le dosage fonctionnel au-dessus de l'UL est le
cas nominal du métier visé, pas un incident : une ceinture déclenchée sur le cas nominal est
contournée à chaque ligne, et une ceinture contournée à chaque ligne ne protège personne — elle
donne seulement l'illusion documentaire d'une supervision. Le produit assume la position de §5.1
jusqu'au bout : *le coach est responsable de son périmètre d'exercice ; KEEL est un outil.*

**Ce que cela impose ailleurs, et qui n'est PAS encore fait :**

| À faire | Pourquoi |
|---|---|
| ⚖️ **CGU coach** : garantie explicite de qualification + indemnisation, couvrant nommément la prescription de dosages | C'était la contrepartie implicite du gate. Sans le gate, elle devient la **seule** protection contractuelle. |
| ⚖️ **Champ « État / statut d'exercice »** obligatoire à l'inscription coach | Déjà listé en §5.1. Il n'est plus seulement utile : il est le seul endroit où le régime du prescripteur est connu. |
| ⚖️ **À FAIRE VALIDER** par un conseil : relayer verbatim une posologie au-dessus d'une UL, sans vérification du titre du prescripteur, engage-t-il KEEL ? | Question ouverte. Elle doit être posée **avant** le pilote payant, pas après. |

### 5.3 Ce que le produit ne tient PAS encore — à dire avant le pilote

| Promesse | État réel |
|---|---|
| « Vos données sont cloisonnées entre coachs » | **Faux aujourd'hui.** Quand un élève change de coach, les policies Tier A ne scopent que l'élève : le nouveau coach lit le protocole verbatim de l'ancien, `source_span` compris (page + citation du PDF). MEGA_REVIEW G9 |
| « Nous détectons les contraintes médicales » | `student_safety_constraints` **n'a aucun écrivain** : aucune surface ne permet d'enregistrer une allergie. La ceinture est armée sur un magasin vide. MEGA_REVIEW G6 |
| « Votre coach est alerté quand l'IA escalade » | `contract_change_requests` est en **écriture seule** : aucune surface coach ne la lit. Le texte affiché à l'élève (*« It is flagged to your coach right now »*) est **factuellement faux**. MEGA_REVIEW B4 |

**Le troisième est le seul point de ce document qui n'est pas une question d'ingénierie.**
Affirmer à un élève potentiellement en difficulté qu'un humain a été alerté, alors qu'aucun humain
ne peut l'être, est un problème avant d'être un risque. **Tant que le lecteur n'existe pas,
retire la phrase du texte de refus** — c'est une modification d'une ligne, et elle ne peut pas
attendre une vague.

### 5.4 Crise et ressources par pays
La table `crisis_resources` (23 lignes, US/GB/FR + fallback) et la colonne `profiles.country`
existent. Le résolveur par pays a été livré mais les trois sites vivants importaient encore la
résolution par locale — un élève britannique recevait **988/911**, numéros inexistants au
Royaume-Uni. **Vérifie ce chemin en bout de course avant tout élève non américain** : c'est un
défaut qui ne se voit que le jour où il compte.

---

## 6. Copy publicitaire — ce qu'on ne dit jamais

### 6.1 Interdits absolus, partout

**Pas de before/after.** Aucune photo avant/après, aucune paire de silhouettes, aucun témoignage
illustré par une transformation corporelle. Trois raisons qui se cumulent :
- c'est le format que les régulateurs examinent en premier (résultats non typiques) ;
- Meta l'interdit dans ses politiques publicitaires (images « avant/après » et gros plans
  corporels), donc la campagne est refusée avant même la question légale ;
- c'est en contradiction directe avec la doctrine du produit — KEEL mesure l'**adhérence à un
  protocole**, pas une transformation corporelle. Vendre l'après contredit ce qu'on affiche.

**Pas de promesse de résultat.** « Perdez X kg », « en N semaines », « résultats garantis ».
KEEL ne produit aucun résultat de santé : il exécute le protocole de quelqu'un d'autre.

**Pas de revendication de maladie.** « Inverse le prédiabète », « soigne le SII », « équilibre
vos hormones ». C'est la phrase qui fait basculer un logiciel de bien-être en *device* (§ 1.1).

**Pas de comparaison implicite à un professionnel de santé.** « Comme un diététicien, en mieux ».
Renvoie directement au § 5.

### 6.2 Royaume-Uni — **CAP Code section 13 (Weight control and slimming)**
Le régime britannique est plus strict que l'américain sur ce point précis, et l'ASA agit
**sur plainte**, ce qui rend le risque réel même à petite échelle.

Ce que la section 13 impose en substance :
- **Aucun taux ni montant de perte de poids** dans une période donnée (« 1 kg par semaine »,
  « −5 kg en un mois »). C'est l'interdit le plus souvent enfreint, et le plus facile à repérer.
- Le traitement de l'**obésité** relève d'une **supervision médicale** — un programme grand
  public ne peut pas se présenter comme tel.
- Une communication de contrôle du poids ne doit **pas être dirigée vers des mineurs**
  (cohérent avec § 2.4).
- Les témoignages et les images ne doivent pas suggérer un résultat **non typique**.
- Les revendications d'efficacité doivent être **étayées par des preuves**.

⚖️ **À FAIRE VALIDER** : les numéros de règle exacts de la section 13 et leur version en vigueur,
avec un conseil britannique, **avant** toute campagne au Royaume-Uni. Les principes ci-dessus sont
solides ; leur numérotation change au fil des révisions du Code et ne doit pas être citée de
mémoire dans un document opposable.

### 6.3 Ce qu'on PEUT dire — et qui est plus fort
La copy honnête décrit le mécanisme, pas le résultat :

> Your coach writes the protocol. KEEL runs it — reminders at the right moment, logging by
> WhatsApp photo or text, and an adherence view your coach can trust because nothing is inferred.

> No percentage until four days of the week are logged. A day you didn't log is not a day you
> failed.

> KEEL never writes your plan and never invents a number.

**Le différenciateur du produit est l'honnêteté de la mesure.** Une copy qui promet un résultat
détruit exactement l'actif qu'on vend — et c'est le seul argument qui rende la contrainte
réglementaire indolore : ici, la règle et le positionnement disent la même chose.

### 6.4 Photos et calories — la ligne à ne jamais franchir en marketing
*Révisé le 2026-08-06, après l'amendement non-input #4 du CONTRACT. La mesure n'a pas bougé ; ce
qu'on en déduit, si.*

La recherche interne ([PHOTO_QUANTIFICATION.md](PHOTO_QUANTIFICATION.md)) mesure un biais de
**−26,6 %** sur l'estimation calorique **par photo seule**, avec une couverture d'intervalle réelle
de **58 %** pour un intervalle demandé à 90 % — le modèle **ne sait pas qu'il ne sait pas**. Et le
biais penche du côté flatteur : un élève en surplus lit un chiffre rassurant.

La même recherche mesure **2,3 % d'erreur quand les quantités sont fournies**. Les deux conditions
n'ont donc pas la même véracité, et la règle marketing suit cette ligne-là, pas celle du mot
« calorie » :

**Ce qui reste interdit, sans négociation :**
- annoncer un **comptage calorique par photo** ou un « suivi des macros par photo » — c'est
  précisément la condition à −26,6 % ;
- présenter un chiffre issu d'une photo comme un **fait**, une **cible**, ou une base de décision ;
- toute copy qui laisse croire que le chiffre est vérifié quand il est deviné.

**Ce qui devient permis, à une condition :** annoncer un chiffre **qui porte sa base**. Calculé
quand l'élève a donné les quantités, estimé quand le modèle les a devinées, et l'interface le dit.
Le marqueur n'est pas un ornement juridique : c'est ce qui fait la différence entre les deux
conditions mesurées ci-dessus.

**⚖️ À FAIRE VALIDER avant que le chiffre atteigne l'élève** — la décision produit du 2026-08-06 le
rend visible à l'élève, pas seulement au coach. Cela rouvre un risque qui avait été fermé par le
refus total : `no_calorie_to_student_property_test.ts` cite **Levinson 2017 — 73 % des patients TCA
déclarent qu'un tracker de calories a contribué à leur trouble** (et note au passage que le « 83 % »
de la revue 2025 est une erreur de citation, à ne pas propager). Un chiffre visible par l'élève
demande donc, au minimum : une interaction explicite avec `disordered_eating_guard`, et une règle
écrite disant qui ne le voit pas. Tant que ce n'est pas tranché, la copy publique reste au point
neutre — elle ne promet aucun chiffre (voir `landing.doctrine.no_calories_*`, formulé au
conditionnel exprès).

---

## 7. Rétention, export, suppression

Ce qui existe déjà (W1.2, et vérifié colonne par colonne) :

- **Export RGPD** étendu à 13 tables KEEL, bundlé.
- **Suppression de compte** avec purge à J+7 (`purge-deleted-accounts`, cron `20 4 * * *`),
  purge paginée des buckets, et les deux troncatures silencieuses de la marche storage
  corrigées : une purge qui laisse des fichiers **jette** désormais au lieu de se déclarer
  réussie (W1 D4).
- **Départ d'un coach** → `coach_clients.status = 'ended'`, pas de suppression des faits de
  l'élève (ils sont à lui).

### ⚖️ À FAIRE VALIDER
- **Durée de conservation par catégorie** — nulle part définie aujourd'hui. Les photos de repas
  méritent la durée la plus courte du produit : elles ont une valeur probante de quelques jours
  et une sensibilité permanente.
- **Que devient le protocole quand le coach part ?** C'est la PI du coach *et* la donnée de
  santé de l'élève. Les deux réponses sont défendables ; il faut en choisir une et l'écrire.
- **Rétention des logs techniques** (`system_error_logs`, `llm_usage_events`,
  `llm_raw_response_events`) : le troisième contient du **texte utilisateur brut** et doit rester
  désactivé par défaut (DEPLOY § 3).

---

## 8. Checklist avant le premier élève réel

| # | Item | Bloquant ? |
|---|---|---|
| 1 | DPA coach signé **avant** le premier `coach_clients` | oui |
| 2 | Les 6 consentements implémentés, n°6 décoché par défaut | oui |
| 3 | Disclaimer § 1.3 visible sur toute surface authentifiée | oui |
| 4 | `<Analytics />` retiré des routes authentifiées + jeton hors query string (§ 4.3) | oui |
| 5 | Grep anti-pixel vert (§ 4.5) | oui |
| 6 | Phrase « It is flagged to your coach right now » **retirée** tant que personne ne lit `contract_change_requests` (§ 5.3) | oui |
| 7 | État d'exercice du coach collecté à l'inscription (§ 5.1) | oui |
| 8 | Barrière < 18 ans à l'intake (§ 2.4) | oui |
| 9 | Ressources de crise vérifiées de bout en bout pour un élève non américain (§ 5.4) | oui |
| 10 | Ce qui n'est **pas** cloisonné entre coachs dit au coach par écrit (§ 5.3) | oui |
| 11 | Résidence des données Supabase choisie explicitement | si élèves UE |
| 12 | Exclusion d'entraînement obtenue par écrit auprès du fournisseur de modèle | oui |
| 13 | CGU EN + politique de confidentialité relues par un conseil | oui |
| 14 | Copy marketing relue contre § 6 (et § 6.2 si UK) | oui |

**Les items 4, 6 et 7 sont des modifications de quelques lignes.** Les laisser pour « après le
pilote » est le mauvais arbitrage : ce sont exactement ceux dont le coût explose une fois qu'un
vrai élève est passé dessus.
