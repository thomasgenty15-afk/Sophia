// Pack français — le namespace `household_claim`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `household_claim.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frHouseholdClaim = {
  // ══ /join-household — RÉCLAMER SA PLACE DANS UN FOYER ════════════════════
  //
  // La personne qui ouvre ce lien n'a le plus souvent aucun compte: quelqu'un
  // a déjà posé sa ligne (son prénom, ses allergies, ce que la maison ne sert
  // pas), et réclamer y rattache son compte. Rien n'est créé, rien n'est perdu.
  //
  // ⚠️ LE MOT « RÉCLAMER » A ÉTÉ GARDÉ, ET C'ÉTAIT UN ARBITRAGE. « Récupérer »
  // sonne comme reprendre quelque chose qu'on avait; « rejoindre » efface le
  // fait que la ligne EXISTE DÉJÀ, avec des allergies dessus, ce qui est
  // précisément ce que l'écran doit faire comprendre.
  "household_claim.seo_title": "Réclame ta place — Sophia",
  "household_claim.seo_description":
    "Rattache ton compte à la ligne que quelqu’un a déjà posée pour toi dans son foyer.",
  "household_claim.checking": "Vérification du lien…",
  "household_claim.title": "La place de {name} dans {household}",
  "household_claim.lead":
    "Quelqu’un a déjà posé cette ligne : le prénom de {name}, ses allergies, et ce que la maison ne sert pas. La réclamer y rattache ton compte — ça n’en crée pas une seconde, et rien de ce qui s’y trouve n’est perdu.",
  "household_claim.gains_label": "Ce que la réclamer te donne",
  "household_claim.gains_1": "Tu vois ce que le foyer cuisine, et ta propre part.",
  "household_claim.gains_2":
    "Tu poses ta direction — perdre de la masse grasse, prendre du muscle, ou aucune — et ta part la suit.",
  "household_claim.gains_3": "Ton prénom, tes allergies et ta ligne restent les tiens.",
  "household_claim.limits_label": "Ce que ça ne te donne pas",
  "household_claim.limits_1":
    "Tu ne composes pas le plan, et tu n’ajoutes ni ne retires personne. Une seule personne tient le menu.",
  "household_claim.limits_2":
    "Tu ne décides pas ce que la maison ne sert pas — et qui le décide est écrit à l’écran, jamais caché.",
  "household_claim.signed_in_as": "Tu es connecté en tant que {email}.",
  "household_claim.submit": "Réclamer cette place",
  "household_claim.working": "Réclamation en cours…",
  "household_claim.signed_out.body":
    "Cette invitation a été envoyée à {email}. Connecte-toi avec cette adresse pour la réclamer — le compte doit correspondre.",
  "household_claim.signed_out.cta": "Se connecter et réclamer",
  "household_claim.signed_out.or": "Pas encore de compte sur cette adresse ?",
  "household_claim.signup.cta": "Créer mon compte",
  "household_claim.signup.title": "Créer le compte de {email}",
  "household_claim.signup.lead":
    "Cette adresse est celle à qui l’invitation a été envoyée, et la seule qui puisse réclamer cette place. Ton compte est à toi — le foyer ne lit pas ton mot de passe, et tu peux partir quand tu veux.",
  "household_claim.signup.email_label": "Adresse e-mail",
  "household_claim.signup.email_hint":
    "Fixée par l’invitation. Réclamer avec une autre adresse est refusé.",
  "household_claim.signup.name_label": "Ton nom",
  "household_claim.signup.language_label":
    "La langue dans laquelle tu veux qu'on te parle",
  "household_claim.signup.language_hint":
    "Ton coach te répond dans cette langue, et écrit ton plan dedans. Tu pourras en changer plus tard.",
  "household_claim.signup.name_hint":
    "Sur ton compte. Le prénom posé sur la ligne du foyer, lui, ne bouge pas.",
  "household_claim.signup.password_label": "Mot de passe",
  "household_claim.signup.password_hint": "8 caractères minimum.",
  // Les quatre fragments de la ligne légale, recollés par le JSX autour de deux
  // liens. L'ordre français est le même que l'anglais, ce qui est un coup de
  // chance et pas une règle: si une langue le changeait, il faudrait une clé
  // unique avec ses ancres, pas quatre morceaux.
  "household_claim.signup.legal_prefix": "J’accepte les",
  "household_claim.signup.legal_terms": "Conditions générales",
  "household_claim.signup.legal_and": "et la",
  "household_claim.signup.legal_privacy": "Politique de confidentialité",
  "household_claim.signup.submit": "Créer mon compte et réclamer",
  "household_claim.signup.submitting": "Création de ton compte…",
  "household_claim.signup.error.legal":
    "Accepte les Conditions générales et la Politique de confidentialité pour continuer.",
  "household_claim.signup.error.existing":
    "Il existe déjà un compte sur cette adresse. Connecte-toi plutôt — ta place t’attend.",
  "household_claim.signup.closed":
    "La création de compte est fermée pour le moment (avant-lancement). Si tu en as déjà un, connecte-toi ci-dessus.",
  "household_claim.signup.check_email.title": "Confirme ton adresse e-mail",
  "household_claim.signup.check_email.body":
    "Ton compte est créé. Clique sur le lien qu’on vient d’envoyer à {email}, puis rouvre ton lien d’invitation — réclamer ta place demande une adresse confirmée.",
  "household_claim.no_token.title": "Ce lien est incomplet",
  "household_claim.no_token.body":
    "L’adresse n’a pas son code d’invitation. Ouvre le lien qu’on t’a envoyé en entier, ou demandes-en un nouveau.",
  "household_claim.refused.title": "Ce lien ne peut pas servir",
  "household_claim.refused.generic":
    "Impossible d’utiliser cette invitation. Demandes-en une nouvelle.",
  "household_claim.refused.unknown_token":
    "On ne reconnaît pas cette invitation. Vérifie que tu as copié le lien entier, ou demandes-en un nouveau.",
  "household_claim.refused.expired": "Cette invitation a expiré. Demandes-en une nouvelle.",
  "household_claim.refused.already_used":
    "Cette invitation a déjà servi. Si c’était toi, connecte-toi — ta place t’attend.",
  "household_claim.refused.already_claimed":
    "Cette ligne a déjà un compte dessus. Si c’est le tien, connecte-toi.",
  "household_claim.refused.email_mismatch":
    "Cette invitation a été envoyée à une autre adresse. Connecte-toi avec celle qui l’a reçue.",
  "household_claim.refused.already_in_household":
    "Ton compte est déjà dans un foyer, et un compte n’appartient qu’à un foyer à la fois.",
  "household_claim.refused.country_required":
    "Ton compte ne dit pas dans quel pays tu vis, et une place dans un foyer ne se réclame pas sans ça — c’est lui qui décide de la ligne d’écoute qu’on te donne.",
  "household_claim.refused.bad_country":
    "Ce code pays n’a pas été compris. Choisis-en un dans la liste.",
  "household_claim.refused.not_authenticated":
    "Ta session s’est terminée avant qu’on ait fini. Reconnecte-toi et rouvre le lien.",
  "household_claim.refused.unreachable":
    "Le serveur ne répond pas. L’invitation, elle, va bien — recharge la page et réessaie.",
  "household_claim.refused.ask_again":
    "La personne qui tient ce foyer peut renvoyer un lien en quelques secondes.",
  "household_claim.done.title": "Tu es dans {household}",
  "household_claim.done.body":
    "Ton compte est rattaché à la ligne qui avait déjà été posée pour toi. Pose ta direction quand tu veux — elle change ta part, pas celle des autres.",
  "household_claim.done.cta": "Ouvrir le foyer",
  "household_claim.home_link": "Retour à l’accueil",
} satisfies TranslatedMessagesOf<"household_claim">;
