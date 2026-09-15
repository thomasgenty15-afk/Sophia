# Templates Meta & WhatsApp Flow — à créer côté Meta

**Statut : RIEN DE CE DOCUMENT N'A ÉTÉ SOUMIS À META.**
Toute création de template et de Flow se fait sur le compte Meta Business, ce
qui est du distant. Ce fichier contient les payloads exacts et la marche à
suivre ; l'exécution est humaine.

**Une approbation Meta prend de quelques heures à quelques jours.** C'est le
chemin critique du pilote : tout le reste est prêt et attend ça.

---

## Pourquoi ces templates existent

WhatsApp ferme la **fenêtre de service client à 24h** après le dernier message
entrant de l'utilisateur. Hors de cette fenêtre, seul un **template approuvé**
peut partir.

Et c'est exactement la population qu'on veut mesurer. Un élève qui n'a pas
écrit depuis 30h est hors fenêtre — c'est-à-dire précisément celui dont le tap
du soir dirait quelque chose d'utile. **Sans ces templates, le produit ne
mesure que les élèves déjà actifs**, c'est-à-dire ceux dont on n'avait pas
besoin de mesurer.

---

## 1. `keel_daily_pulse_v1` — le tap du soir

**Trois boutons de réponse rapide.** C'est le plafond dur de Meta, et c'est la
raison pour laquelle l'échelle a trois niveaux et pas dix.

⚠️ **Les libellés doivent être identiques au caractère près** à
`_shared/keel/daily_pulse.ts::LEVEL_LABELS_EN`. Dans la fenêtre 24h le message
est rendu par notre code ; hors fenêtre par ce template. Un libellé qui diverge
produit deux expériences différentes selon l'heure d'envoi, et un test
`daily_pulse_test.ts` vérifie déjà le plafond de 20 caractères côté code.

```json
{
  "name": "keel_daily_pulse_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "How was today?" },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "All good" },
        { "type": "QUICK_REPLY", "text": "So-so" },
        { "type": "QUICK_REPLY", "text": "Rough" }
      ]
    }
  ]
}
```

**Catégorie UTILITY et pas MARKETING** : c'est un suivi demandé par
l'utilisateur, pas une sollicitation. UTILITY passe plus facilement et coûte
moins cher. Un refus sur ce point signifie généralement que le corps sonne
promotionnel — le garder aussi sec que ci-dessus est délibéré.

**Piège de l'`interactive_id`.** Une réponse à un bouton de TEMPLATE revient
dans `messages[].button.payload`, pas dans `interactive.button_reply.id`.
`wa_parse.ts` normalise déjà les deux vers `interactive_id` (branche
`type === "button"`), donc `readPulseReply` fonctionne des deux côtés — mais
**le `payload` du template doit valoir l'identifiant attendu**, pas le libellé.

Le payload **n'est pas fixé à la création** du template — il est fourni **à
chaque envoi**, dans le composant `button`. C'est ce qui permet de garder
`readPulseReply` strictement déterministe, sans jamais interpréter un libellé :

```json
"components": [
  { "type": "button", "sub_type": "quick_reply", "index": "0",
    "parameters": [{ "type": "payload", "payload": "KEEL_PULSE_GOOD" }] },
  { "type": "button", "sub_type": "quick_reply", "index": "1",
    "parameters": [{ "type": "payload", "payload": "KEEL_PULSE_MIXED" }] },
  { "type": "button", "sub_type": "quick_reply", "index": "2",
    "parameters": [{ "type": "payload", "payload": "KEEL_PULSE_HARD" }] }
]
```

`whatsapp-send` accepte déjà des `components` sur un message de type
`template`, et `wa_parse` remonte `button.payload` dans `interactive_id`. La
chaîne existe donc de bout en bout — **il reste à ce que
`keel-daily-pulse-v1` construise ce payload quand la fenêtre est fermée**, ce
qui n'est pas écrit aujourd'hui (le job envoie toujours un
`interactive_buttons`).

**L'ordre des `index` est le contrat** : `0/1/2` doivent correspondre à l'ordre
des boutons dans le template, donc à `PULSE_LEVELS` (`good`, `mixed`, `hard`).
Inverser deux index enregistrerait « Rough » pour un élève qui a tapé
« All good » — une donnée fausse, silencieuse, et impossible à repérer après
coup.

---

## 2. `keel_pulse_axis_v1` — ~~à créer~~ PAS NÉCESSAIRE (décision 2026-08-04)

Retiré de la liste, et le raisonnement tient tout seul : la question d'axe
part **dans le même message** que l'accusé, en réponse SYNCHRONE au tap de
niveau. Or un tap de bouton est un message entrant — il ouvre la fenêtre 24h à
l'instant même. Aucun chemin du code ne repose la question d'axe plus tard :
il n'existe donc AUCUN état où elle serait émise hors fenêtre.

Corollaire budget : chaque conversation template coûte ; les réponses en
fenêtre de service sont gratuites. Un template ici serait un coût récurrent
pour couvrir un cas qui ne peut pas se produire.

(Si un jour on ajoute une re-relance d'axe différée, ce template redevient
nécessaire — le jour où ce chemin existe, pas avant.)

---

## 3. `keel_reengage_v1` — la relance de silence

Part par définition **hors fenêtre** : le seuil est 72h sans message entrant.
Ce template est donc obligatoire, pas optionnel.

`{{1}}` est le prénom. **Vérifier ce paramètre sur un vrai téléphone avant
d'ouvrir la vanne** : le dépôt porte deux incidents de paramètre de template
mal câblé (`sophia_checkin_v2` dont le corps Meta disait « Hello Thomas » pour
tout le monde, et un `{{1}}` de bilan hebdomadaire rempli avec le prénom).

```json
{
  "name": "keel_reengage_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}} - no rush, just checking in. How is the week going?",
      "example": { "body_text": [["Julie"]] }
    }
  ]
}
```

Trois tons existent côté code (`gentle` / `lighter` / `warm_return`,
`_shared/keel/reengagement.ts`). **Commencer avec le seul `gentle`** : trois
templates à faire approuver pour une nuance de ton est un mauvais échange tant
que le premier n'a pas tourné en réel.

---

## 4. Le Flow hebdomadaire — `keel_weekly_checkin`

C'est le plus gros morceau, et il se fait en **deux temps distincts**.

### 4a. Créer et publier le Flow

1. Meta Business Manager → WhatsApp Manager → **Flows** → Create Flow
2. Nom : `keel_weekly_checkin`, catégorie **SURVEY**
3. Coller le Flow JSON produit par
   `_shared/keel/weekly_flow.ts::weeklyFlowJson()`.
   **Ne pas le retaper à la main** — le générer et le copier :

   ```bash
   deno eval --no-check 'import { weeklyFlowJson } from "./supabase/functions/_shared/keel/weekly_flow.ts"; console.log(JSON.stringify(weeklyFlowJson(), null, 2))'
   ```

   Le module est la source de vérité pour le formulaire ET pour le parseur. Un
   test (`every axis the form asks for is an axis the parser reads`) les tient
   ensemble — mais **il ne peut rien pour une divergence introduite en modifiant
   le Flow dans l'éditeur Meta**. Toute retouche se fait dans le code, puis se
   recolle.
4. Endpoint : **aucun**. Ce Flow est en mode « data exchange » désactivé, tout
   se règle à la soumission finale via `response_json`. Pas de serveur à tenir.
5. **Publier.** Un Flow en brouillon ne peut être envoyé qu'en mode preview.
6. Relever le **Flow ID** et le poser en secret :

   ```
   KEEL_WEEKLY_FLOW_ID=<l_identifiant_du_flow>
   ```

   Tant que ce secret est absent, `keel-weekly-flow-v1` écarte tout le monde sur
   `flow_not_configured` et n'envoie rien. C'est voulu.

### 4b. Le template porteur (pour l'envoi hors fenêtre)

Le dimanche 18h-21h locales, un élève est très souvent hors fenêtre 24h.

```json
{
  "name": "keel_weekly_checkin_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "Two minutes on how the week actually went?" },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "FLOW",
          "text": "Take the check-in",
          "flow_id": "<KEEL_WEEKLY_FLOW_ID>",
          "navigate_screen": "WEEK_FELT",
          "flow_action": "navigate"
        }
      ]
    }
  ]
}
```

> ⚠️ **Non implémenté côté code.** `whatsapp-send` sait envoyer un
> `interactive_flow` (dans la fenêtre 24h). Il ne sait PAS envoyer un template à
> bouton Flow. Tant que ce chemin n'existe pas, le point hebdomadaire ne part
> qu'aux élèves ayant écrit dans les 24h — la même amputation que le tap
> quotidien, et pour la même raison.

---

## Ordre de soumission conseillé

| # | Quoi | Pourquoi ce rang |
|---|------|------------------|
| 1 | `keel_reengage_v1` | Le seul qui n'a **aucune** alternative : 72h de silence est toujours hors fenêtre. |
| 2 | Flow `keel_weekly_checkin` + `KEEL_WEEKLY_FLOW_ID` | Débloque la moitié « métriques » du produit, aujourd'hui à vide. |
| 3 | `keel_daily_pulse_v1` | Dégrade proprement sans lui (envoi dans la fenêtre uniquement). Demande le chemin d'envoi template + payloads côté code. |
| 4 | `keel_weekly_checkin_v1` (template Flow) | Demande d'abord le chemin d'envoi côté code. |
| 5 | `keel_pulse_axis_v1` | Cas rare. |

---

## Le test qui compte, et qu'aucune suite ne remplace

Une fois approuvés : **envoyer chacun à un vrai téléphone, et vérifier le corps
rendu chez Meta, pas dans nos logs.**

Le dépôt porte un incident précis là-dessus : `sophia_checkin_v2` était vert
partout côté code et son corps chez Meta disait « Hello Thomas 🙂 » à tout le
monde. Nos logs enregistrent ce qu'on ENVOIE ; le screenshot du téléphone
montre ce que l'élève REÇOIT. Seul le second fait foi.

---

## Périmètre exact — ce qu'il ne faut PAS créer (vérifié 2026-08-03)

- **`keel_slot_reminder` / `keel_sunday_digest`** : chemin 1:1 d'origine —
  les rappels de créneau dérivent de `plan_commitments`, qu'un élève de
  masterclasse n'a pas, et le digest est émis par `provision-day-v1`,
  déprogrammé depuis N5. Ne pas créer tant que le 1:1 n'est pas relancé.
- **Les accusés** (`keel_daily_pulse_ack`, réponse d'axe…) : une réponse à un
  tap rouvre la fenêtre 24h par définition. Jamais besoin d'un template.
- **Tout le legacy B2C** (`sophia_checkin_v2`, bilans, anniversaire, winback…) :
  hors périmètre du pilote masterclasse.
- **Premier contact** : rien dans le code n'initie un message vers un élève
  qui n'a JAMAIS écrit. Recommandation pilote : lien `wa.me` à l'adoption du
  plan (l'élève écrit en premier → fenêtre ouverte → zéro template). L'autre
  option — Sophia écrit la première — exige un template d'opt-in de plus et
  une décision produit.

## ⚠️ Le piège du fallback (côté code, AVANT d'ouvrir la vanne)

`whatsapp-send::getFallbackTemplate` ne connaît PAS les purposes du pivot
(`keel_daily_pulse`, `keel_weekly_flow`, `keel_reengage`). Hors fenêtre 24h,
un envoi avec ces purposes retombe aujourd'hui sur **`global_reach_template`
en FRANÇAIS** — le motif exact de l'incident du 2026-07-12 (3× global_reach,
purposes hors table). En local ça échoue faute de secrets ; en prod ça
enverrait « J'ai une info pour toi » à un élève anglophone.

Donc, une fois les templates approuvés chez Meta, il reste DEUX gestes de
code avant tout envoi hors fenêtre :
1. mapper les trois purposes vers leurs templates dans `getFallbackTemplate`
   (+ variables `WHATSAPP_KEEL_*_TEMPLATE_NAME/LANG`) ;
2. le chemin template du tap avec payloads de boutons à l'envoi
   (index 0/1/2 = good/mixed/hard — voir §1).

---

## 6. `keel_optin_v1` — le premier message (décision 2026-08-03 : Sophia écrit la première)

Le seul template SANS lequel la relation ne démarre pas : un élève qui vient
de créer son compte n'a jamais écrit sur WhatsApp, sa fenêtre 24h n'a jamais
existé. Meta exige un template pour tout message initié par l'entreprise — et
exige surtout que le CONSENTEMENT existe AVANT l'envoi : c'est la case à
cocher à l'inscription qui crée le droit d'écrire (`whatsapp_opted_in`), pas
le template.

```json
{
  "name": "keel_optin_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{1}} — I'm Sophia, the assistant for {{2}}'s programme. This is where your day-to-day happens: send a photo of a meal, or just write to me, any time. Tap below to get started.",
      "example": { "body_text": [["Julie", "Marc"]] }
    },
    { "type": "FOOTER", "text": "Reply STOP anytime to opt out." },
    {
      "type": "BUTTONS",
      "buttons": [{ "type": "QUICK_REPLY", "text": "Let's go" }]
    }
  ]
}
```

Pourquoi cette forme :
- **Le bouton est le mécanisme**, pas la décoration : le tap de l'élève OUVRE
  la fenêtre 24h. Aucun handler déterministe à écrire — `wa_parse` remonte le
  texte du bouton comme un message normal et le dispatcher répond.
- **Le footer STOP** aide l'approbation UTILITY et rend l'opt-out visible dès
  le premier message (le handler STOP existe déjà côté code).
- **UTILITY tient** parce que le corps est transactionnel (conséquence d'une
  inscription), sans promesse ni marketing. Ne pas l'enrichir.

⚠️ CÔTÉ CODE, RIEN N'ENVOIE CE TEMPLATE AUJOURD'HUI. C'est le trou
d'onboarding (agent QA 15) : il faut un déclencheur à l'adoption du plan (ou à
la liaison du numéro), envoyé avec `require_opted_in: false` (c'est le message
qui matérialise l'opt-in donné au signup) et `purpose: "keel_optin"` mappé
dans `getFallbackTemplate`.

## Ordre de soumission RÉVISÉ (opt-in inclus)

1. `keel_optin_v1` — sans lui, aucune relation ne démarre.
2. `keel_reengage_v1` — aucune alternative (toujours hors fenêtre).
3. Flow `keel_weekly_checkin` + secret `KEEL_WEEKLY_FLOW_ID`.
4. `keel_weekly_checkin_v1` (porteur du Flow).
5. `keel_daily_pulse_v1`.
