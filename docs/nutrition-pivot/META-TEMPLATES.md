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

## 2. `keel_pulse_axis_v1` — la relance d'axe

Même forme. N'est nécessaire que si la relance d'axe peut partir hors fenêtre —
ce qui n'arrive que si l'élève tape « So-so » ou « Rough » puis laisse passer
24h avant de répondre. **Rare, et à faire en second.**

```json
{
  "name": "keel_pulse_axis_v1",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    { "type": "BODY", "text": "What was hard?" },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Energy" },
        { "type": "QUICK_REPLY", "text": "Hunger" },
        { "type": "QUICK_REPLY", "text": "Sleep" }
      ]
    }
  ]
}
```

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
