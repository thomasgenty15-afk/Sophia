# WhatsApp Template Catalog

Catalogue source pour la simulation WhatsApp dans le chat web. Les templates sont ajoutes a partir des captures Meta fournies, puis pourront etre convertis en catalogue code pour le rendu `web_whatsapp_sim`.

## 1. weekly_planning_validation_v1

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `weekly_planning_validation`
- **Env associee probable** : `WHATSAPP_WEEKLY_PLANNING_TEMPLATE_NAME`
- **Variables probables** :
  - `{{1}}` : `dashboard_url`
- **Boutons** : aucun visible

### Body

```text
Ton planning de la semaine prochaine est prêt à valider.

Tu peux le vérifier ici : "{{1}}"
```

### Exemple Visible Sur La Capture

```text
Ton planning de la semaine prochaine est prêt à valider.

Tu peux le vérifier ici : "https://sophia-coach.ai/"
```

## 2. sophia_winback_step1_soft

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `daily_bilan_winback` / `winback_step1_soft`
- **Env associee probable** : a confirmer
- **Variables probables** : aucune visible
- **Boutons** :
  - Je veux bien
  - Pas maintenant
  - J'ai décroché

### Body

```text
Je te laisse un petit mot ici au cas où.
Si tu veux reprendre doucement, je suis là. 🧙
```

## 3. sophia_winback_step3_opendoor

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `daily_bilan_winback` / `winback_step3_opendoor`
- **Env associee probable** : a confirmer
- **Variables probables** : aucune visible
- **Boutons** :
  - Salut
  - Pause
  - Stop

### Body

```text
Je te laisse la porte ouverte, sans urgence.
Même un simple “salut” et on repart tranquillement.
```

## 4. sophia_winback_step2_refocus

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `daily_bilan_winback` / `winback_step2_refocus`
- **Env associee probable** : a confirmer
- **Variables probables** : aucune visible
- **Boutons** :
  - On fait simple
  - Pas cette semaine
  - Laisse-moi revenir

### Body

```text
Je retente juste une fois comme ça.
Si tu veux, on peut reprendre en version très simple, sans se prendre la tête. 😊
```

## 5. sophia_reminder_consent_v1_

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `recurring_reminder`
- **Env associee probable** : `WHATSAPP_RECURRING_REMINDER_TEMPLATE_NAME`
- **Variables probables** : aucune visible
- **Boutons** :
  - Avec plaisir !
  - Not this time

### Body

```text
Hello, tu veux que je t'envoie ton rendez-vous maintenant ? 😊
```

## 6. end_subscription_v1

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `end_subscription`
- **Env associee probable** : `WHATSAPP_END_SUBSCRIPTION_TEMPLATE_NAME`
- **Variables probables** :
  - `{{1}}` : prenom / `full_name`
- **Boutons** :
  - Avec plaisir!
  - Pas pour le moment!

### Body

```text
Coucou {{1}}, ton abonnement Sophia s'est terminé. 🥲
Si tu veux, je peux t'envoyer le lien pour réactiver ton accès et continuer ensemble. Tu veux ? ☺️
```

### Exemple Visible Sur La Capture

```text
Coucou Thomas, ton abonnement Sophia s'est terminé. 🥲
Si tu veux, je peux t'envoyer le lien pour réactiver ton accès et continuer ensemble. Tu veux ? ☺️
```

## 7. end_trial_v1

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `end_trial`
- **Env associee probable** : `WHATSAPP_END_TRIAL_TEMPLATE_NAME`
- **Variables probables** :
  - `{{1}}` : prenom / `full_name`
- **Boutons** :
  - C'est parti !
  - Pas pour le moment

### Body

```text
Coucou {{1}}, ton essai s'est terminé. 🥲
Si tu as trouvé l'aide que tu cherchais, je peux t'envoyer le lien pour continuer ensemble. Tu veux ? ☺️
```

### Exemple Visible Sur La Capture

```text
Coucou Thomas, ton essai s'est terminé. 🥲
Si tu as trouvé l'aide que tu cherchais, je peux t'envoyer le lien pour continuer ensemble. Tu veux ? ☺️
```

## 8. sophia_bilan_weekly_v1

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `weekly_progress_review` / `weekly_bilan`
- **Env associee probable** : `WHATSAPP_WEEKLY_BILAN_TEMPLATE_NAME` ou `WHATSAPP_WEEKLY_PROGRESS_REVIEW_TEMPLATE_NAME`
- **Variables probables** :
  - `{{1}}` : prenom / `full_name`
- **Boutons** :
  - Go !
  - La semaine prochaine!

### Body

```text
Hello {{1}}, c'est l'heure de ton bilan de la semaine (important!). 😉
On y va ?
```

### Exemple Visible Sur La Capture

```text
Hello Thomas, c'est l'heure de ton bilan de la semaine (important!). 😉
On y va ?
```

## 9. sophia_checkin_v2

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `scheduled_checkin`
- **Env associee probable** : `WHATSAPP_CHECKIN_TEMPLATE_NAME`
- **Variables probables** :
  - `{{1}}` : prenom / `full_name`
- **Boutons** :
  - Oui !
  - Une prochaine fois !

### Body

```text
Hello {{1}} 🙂
J’aimerais prendre rapidement de tes nouvelles. C’est ok pour toi ?
```

### Exemple Visible Sur La Capture

```text
Hello Thomas 🙂
J’aimerais prendre rapidement de tes nouvelles. C’est ok pour toi ?
```

## 10. sophia_optin_v2

- **Langue** : French
- **Categorie Meta** : Marketing
- **Status Meta visible** : Actif - Qualite en attente
- **Purpose Sophia probable** : `optin`
- **Env associee probable** : `WHATSAPP_OPTIN_TEMPLATE_NAME`
- **Variables probables** :
  - `{{1}}` : prenom / `full_name`
- **Boutons** :
  - Absolument !
  - Euh.. Mauvais numéro !

### Body

```text
Hello {{1}}, c’est Sophia.
Prêt pour devenir la meilleure version de toi-même ? 👊
```

### Exemple Visible Sur La Capture

```text
Hello Thomas, c’est Sophia.
Prêt pour devenir la meilleure version de toi-même ? 👊
```

### Exemple Visible Sur La Capture

```text
Hello, tu veux que je t'envoie ton rendez-vous maintenant ? 😊
```

### Exemple Visible Sur La Capture

```text
Je retente juste une fois comme ça.
Si tu veux, on peut reprendre en version très simple, sans se prendre la tête. 😊
```

### Exemple Visible Sur La Capture

```text
Je te laisse la porte ouverte, sans urgence.
Même un simple “salut” et on repart tranquillement.
```

### Exemple Visible Sur La Capture

```text
Je te laisse un petit mot ici au cas où.
Si tu veux reprendre doucement, je suis là. 🧙
```
