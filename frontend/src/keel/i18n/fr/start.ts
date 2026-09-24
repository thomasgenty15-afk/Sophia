// Pack français — le namespace `start`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `start.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frStart = {
  // ── /start — LA PORTE D'INSCRIPTION DU FOYER ─────────────────────────────
  //
  // ⚠️ VOUVOIEMENT (2026-08-12). Ce namespace tutoyait, et c'était la couture
  // signalée au lot précédent: `/` vouvoie, `/auth` vouvoie, et le visiteur
  // traverse les trois d'affilée — « Commencer » sur le hall, ou « Créer un
  // compte gratuit » sur l'écran de connexion, atterrissent ICI. Trois surfaces
  // d'un même parcours qui changent d'adresse en deux clics.
  // ⚠️ LE LOT « À PART » A ÉTÉ FAIT LE 2026-09-01: `/meal-prep` et `/app/setup`
  // sont passés au vouvoiement, soixante-quatre clés. Il ne reste `/coaches`,
  // qui s'adresse à un vendeur de méthode — un autre monde, un autre registre.
  "start.seo_title": "Créer votre compte",
  "start.seo_description":
    "Ouvrez votre compte Sophia. Sophia compose la semaine autour des " +
    "personnes qui mangent vraiment à votre table.",
  "start.loading": "Un instant…",

  "start.title": "Créez votre compte.",
  "start.lead":
    "D’abord le compte. Ensuite, vous décrivez qui mange à votre table et ce " +
    "qu’il faut à chacun : c’est autour de ça que Sophia compose le plan.",

  // ⚠️ `start.price` RETIRÉE LE 2026-09-01. Elle vivait SOUS le bouton
  // d'envoi — un prix qui arrive après la décision qu'il devait éclairer —
  // et elle ne disait rien de la semaine offerte, que `/families` promettait
  // en amont. L'offre est maintenant le bloc partagé `offer`, rendu
  // au-dessus de la fiche par `ui/OfferLines.tsx`.
  "start.coach_line":
    "Un coach vous a invité ? Votre porte est le lien de son e-mail, pas celle-ci.",

  "start.sheet.form": "Inscription",
  "start.sheet.repair": "Rattachement",

  "start.form.name": "Votre prénom",
  "start.form.email": "Adresse e-mail",
  "start.form.password": "Mot de passe",
  "start.form.password_hint": "8 caractères au minimum.",
  // ⚠️ CE BLOC A REMPLACÉ LA QUESTION DU PAYS, ET LE REMPLACEMENT EST LA
  // DÉCISION. « Où vous vivez » se justifiait par le numéro d'urgence — un
  // sujet que le produit ne traite pas aujourd'hui — et occupait la place
  // de la seule réponse qui change quelque chose tous les jours. Le pays se
  // déduit désormais du fuseau (`api/countryFromTimezone.ts`).
  "start.form.language":
    "La langue dans laquelle vous voulez qu'on vous parle",
  "start.form.legal_prefix": "J’accepte les",
  // « conditions générales » et pas « conditions d'utilisation »: c'est le nom
  // que porte le même document sur `/auth`. Un document change de nom entre
  // deux portes, et on ne sait plus si c'en est un seul.
  "start.form.legal_terms": "conditions générales",
  "start.form.legal_and": "et la",
  "start.form.legal_privacy": "politique de confidentialité",
  "start.form.cta": "Créer mon compte",
  "start.form.submitting": "Création du compte…",
  "start.form.have_account": "Vous avez déjà un compte ?",
  "start.have_account_cta": "Se connecter",

  "start.repair.title": "Il reste un champ.",
  "start.repair.body":
    "Votre compte existe, mais il n’est pas encore rattaché. Dites-nous où vous " +
    "vivez, et ce sera fait en un clic.",
  "start.repair.cta": "Rattacher mon compte",

  "start.check_email.title": "Confirmez votre adresse.",
  "start.check_email.body":
    "Votre compte est créé et déjà rattaché : l’e-mail ne sert qu’à ouvrir votre " +
    "session. Ouvrez la confirmation qu’on vient de vous envoyer, elle vous " +
    "emmène directement aux trois étapes qui composent votre premier plan.",

  "start.joined.title": "Votre compte est prêt.",
  "start.joined.body":
    "Trois étapes courtes, et votre premier plan est composé. Rien ne se prépare " +
    "en coulisses : vous répondez, et il se construit.",
  "start.joined.cta": "Régler ma cuisine",
  "start.existing.title": "Vous avez déjà un compte.",
  "start.existing.body":
    "Cette adresse est déjà inscrite. Connectez-vous, et on reprend exactement ici.",
  "start.existing.cta": "Se connecter",

  "start.unavailable.title": "L’inscription est en pause.",
  "start.unavailable.body":
    "On ne crée pas de comptes en ce moment : un compte neuf n’aurait rien pour " +
    "fonctionner. Réessayez un peu plus tard — et si un coach vous a invité, " +
    "passez plutôt par le lien de son e-mail.",

  "start.error.legal":
    "Acceptez les conditions générales et la politique de confidentialité pour continuer.",
  "start.error.already_coached":
    "Votre compte suit déjà un coach. Vous n’avez pas besoin de vous inscrire ici.",
  "start.error.caller_is_coach":
    "C’est un compte coach. Votre espace est l’espace coach, pas celui-ci.",
  "start.error.unavailable":
    "L’inscription n’est pas disponible en ce moment. Rien n’a été créé — réessayez plus tard.",
  "start.error.generic": "Ça n’est pas passé. Rien n’a changé — réessayez.",
} satisfies TranslatedMessagesOf<"start">;
