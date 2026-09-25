// Pack français — le namespace `start`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `start.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frStart = {
  // ── /start — LA PORTE D'INSCRIPTION DU FOYER ─────────────────────────────
  //
  // ⚠️ TUTOIEMENT DEPUIS LE 2026-09-25 (en-tête d'`auth.ts`). Ce namespace a
  // vouvoyé du 2026-08-12 à cette date, pour ne pas changer d'adresse entre
  // `/`, `/auth` et `/start`, que le visiteur traverse d'affilée — « Commencer »
  // sur le hall, ou « Créer un compte gratuit » sur l'écran de connexion,
  // atterrissent ICI. La raison tient toujours: ces surfaces changent de
  // registre ensemble, ou pas du tout.
  "start.seo_title": "Créer ton compte",
  "start.seo_description":
    "Ouvre ton compte Sophia. Sophia compose la semaine autour des " +
    "personnes qui mangent vraiment à ta table.",
  "start.loading": "Un instant…",

  "start.title": "Crée ton compte.",
  "start.lead":
    "D’abord le compte. Ensuite, tu décris qui mange à ta table et ce " +
    "qu’il faut à chacun : c’est autour de ça que Sophia compose le plan.",

  // ⚠️ `start.price` RETIRÉE LE 2026-09-01. Elle vivait SOUS le bouton
  // d'envoi — un prix qui arrive après la décision qu'il devait éclairer —
  // et elle ne disait rien de la semaine offerte, que `/families` promettait
  // en amont. L'offre est maintenant le bloc partagé `offer`, rendu
  // au-dessus de la fiche par `ui/OfferLines.tsx`.
  "start.coach_line":
    "Un coach t’a invité ? Ta porte est le lien de son e-mail, pas celle-ci.",

  "start.sheet.form": "Inscription",
  "start.sheet.repair": "Rattachement",

  "start.form.name": "Ton prénom",
  "start.form.email": "Adresse e-mail",
  "start.form.password": "Mot de passe",
  "start.form.password_hint": "8 caractères au minimum.",
  // ⚠️ CE BLOC A REMPLACÉ LA QUESTION DU PAYS, ET LE REMPLACEMENT EST LA
  // DÉCISION. « Où vous vivez » se justifiait par le numéro d'urgence — un
  // sujet que le produit ne traite pas aujourd'hui — et occupait la place
  // de la seule réponse qui change quelque chose tous les jours. Le pays se
  // déduit désormais du fuseau (`api/countryFromTimezone.ts`).
  "start.form.language":
    "La langue dans laquelle tu veux qu'on te parle",
  "start.form.legal_prefix": "J’accepte les",
  // « conditions générales » et pas « conditions d'utilisation »: c'est le nom
  // que porte le même document sur `/auth`. Un document change de nom entre
  // deux portes, et on ne sait plus si c'en est un seul.
  "start.form.legal_terms": "conditions générales",
  "start.form.legal_and": "et la",
  "start.form.legal_privacy": "politique de confidentialité",
  "start.form.cta": "Créer mon compte",
  "start.form.submitting": "Création du compte…",
  "start.form.have_account": "Tu as déjà un compte ?",
  "start.have_account_cta": "Se connecter",

  "start.repair.title": "Il reste un champ.",
  "start.repair.body":
    "Ton compte existe, mais il n’est pas encore rattaché. Dis-nous où tu " +
    "vis, et ce sera fait en un clic.",
  "start.repair.cta": "Rattacher mon compte",

  "start.check_email.title": "Confirme ton adresse.",
  "start.check_email.body":
    "Ton compte est créé et déjà rattaché : l’e-mail ne sert qu’à ouvrir ta " +
    "session. Ouvre la confirmation qu’on vient de t’envoyer, elle " +
    "t’emmène directement aux trois étapes qui composent ton premier plan.",

  "start.joined.title": "Ton compte est prêt.",
  "start.joined.body":
    "Trois étapes courtes, et ton premier plan est composé. Rien ne se prépare " +
    "en coulisses : tu réponds, et il se construit.",
  "start.joined.cta": "Régler ma cuisine",
  "start.existing.title": "Tu as déjà un compte.",
  "start.existing.body":
    "Cette adresse est déjà inscrite. Connecte-toi, et on reprend exactement ici.",
  "start.existing.cta": "Se connecter",

  "start.unavailable.title": "L’inscription est en pause.",
  "start.unavailable.body":
    "On ne crée pas de comptes en ce moment : un compte neuf n’aurait rien pour " +
    "fonctionner. Réessaie un peu plus tard — et si un coach t’a invité, " +
    "passe plutôt par le lien de son e-mail.",

  "start.error.legal":
    "Accepte les conditions générales et la politique de confidentialité pour continuer.",
  "start.error.already_coached":
    "Ton compte suit déjà un coach. Tu n’as pas besoin de t’inscrire ici.",
  "start.error.caller_is_coach":
    "C’est un compte coach. Ton espace est l’espace coach, pas celui-ci.",
  "start.error.unavailable":
    "L’inscription n’est pas disponible en ce moment. Rien n’a été créé — réessaie plus tard.",
  "start.error.generic": "Ça n’est pas passé. Rien n’a changé — réessaie.",
} satisfies TranslatedMessagesOf<"start">;
