// Pack français — le namespace `join`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `join.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frJoin = {
  // ══ /join — LA PORTE D'ENTRÉE DE L'ÉLÈVE ═════════════════════════════════
  //
  // La seule page du produit qu'on atteint sans compte et sans session. La
  // personne ne vient PAS de la vitrine: elle vient de l'e-mail de son coach,
  // et elle a déjà un coach. Ce n'est donc pas de la copie d'acquisition —
  // c'est l'accueil de quelqu'un qui a décidé, et qui veut savoir dans quoi il
  // entre.
  //
  // ⚠️ `{coach}` EST TOUJOURS LA FORME DE MILIEU DE PHRASE. L'appelant passe le
  // prénom du coach, ou « ton coach » quand la RPC rend `null`. Aucune clé
  // ci-dessous ne doit ouvrir une phrase sur `{coach}`, sinon le repli sort en
  // minuscule. `invite.accept_title` est le seul usage en ouverture, et il a sa
  // propre forme capitalisée.
  //
  // Le génitif anglais (`{coach}'s method`) devient un complément en français
  // (« la méthode de {coach} »): les clés sont réécrites autour de ça, jamais
  // découpées en fragments que le code recollerait.
  "join.lead":
    "Sophia est l’assistante de {coach}, et à partir d’aujourd’hui elle est aussi la tienne. Elle porte sa méthode — ses convictions, ses lignes rouges, les arbitrages qu’il fait quand ça se complique — et te répond avec, tous les jours, dans ta conversation ici.",
  "join.lead_form_note":
    "Le formulaire est tout en bas. Lis d’abord ceci — c’est ce à quoi tu dis oui.",
  "join.seo_title": "L’invitation de ton coach",
  "join.seo_description":
    "Ce qu’est Sophia, à quoi ressembleront tes journées, et exactement ce que ton coach voit et ne voit pas — avant que tu crées quoi que ce soit.",
  "join.refusal.invalid_token":
    "Ce lien d’invitation n’est pas valable. Vérifie que tu as copié le lien entier depuis l’e-mail, ou demande à ton coach de t’en envoyer un nouveau.",
  "join.refusal.revoked": "Ton coach a annulé cette invitation. Demande-lui-en une nouvelle.",
  "join.refusal.already_accepted":
    "Cette invitation a déjà servi. Si c’était toi, connecte-toi — ton espace t’attend.",
  "join.refusal.coach_unavailable":
    "Le compte de ce coach n’est pas actif en ce moment, l’invitation ne peut donc pas être acceptée.",
  "join.refusal.already_coached":
    "Ton compte suit déjà le programme d’un autre coach. Mets d’abord fin à cette relation depuis la page de ton compte — on ne te fait jamais changer de coach à ta place.",
  "join.refusal.self_invitation": "Cette invitation vient de ton propre compte coach.",
  "join.refusal.preview_unreachable":
    "Impossible de vérifier cette invitation pour le moment. Recharge la page pour réessayer.",
  "join.refusal.accept_failed":
    "Ça n’est pas passé. Rien n’a changé — recharge et réessaie.",
  "join.state.checking": "Vérification de l’invitation…",
  "join.state.joining": "On te rattache…",
  "join.check_email.title": "Confirme ton adresse e-mail",
  "join.check_email.body":
    "Ton compte est créé et tu es déjà rattaché au programme de {coach}. Ouvre l’e-mail de confirmation qu’on vient de t’envoyer pour finir de te connecter.",
  // La forme de MILIEU de phrase, sans capitale: « le programme de ton coach ».
  "join.coach_fallback": "ton coach",
  "join.refused.title": "Cette invitation ne peut pas servir",
  "join.refused.signin_cta": "Me connecter à un compte existant",
  "join.accepted.title": "Tu es dedans.",
  "join.accepted.title_with_coach": "Tu es dedans, avec {coach}.",
  "join.accepted.body":
    "Ton espace est ouvert. Sophia t’attend dans ta conversation, et ta semaine vit ici aussi.",
  "join.accepted.cta": "Parler à Sophia",

  // Ce à quoi les journées ressemblent VRAIMENT. Le surtitre nomme la SURFACE,
  // parce que « sur quel écran ça se passe » est le fait utile.
  "join.day.title": "Concrètement, ça donne quoi",
  "join.day.where_chat": "Dans ta conversation",
  "join.day.where_app": "Dans cette application",
  "join.day.photo_title": "Tu envoies une photo de ton assiette, quand tu veux.",
  "join.day.photo_body":
    "Une photo, aucun formulaire à remplir et rien à poser sur une balance pour ça. Ce qui revient est une réponse dans la méthode de {coach} — ce que l’assiette fait bien, ce qui lui manque, avec ses mots à lui plutôt qu’avec ceux d’une étiquette nutritionnelle.",
  "join.day.evening_title": "Le soir, une question et un geste.",
  "join.day.evening_body":
    "Bonne journée, moyenne, ou dure. Si ce n’était pas une bonne journée, un geste de plus dit si c’était l’énergie, la faim ou le sommeil. C’est tout, et tu peux laisser tomber les jours où tu n’en as pas envie.",
  "join.day.app_title": "Ta semaine, et comment elle se passe.",
  "join.day.app_body":
    "Sophia ébauche une semaine à partir de la méthode de {coach} et de ce que ta vie permet vraiment, et elle n’est pas la tienne tant que tu ne l’as pas dit. À côté : les jours que tu as notés, comment les soirs se sont passés, à quoi ressemblaient tes assiettes.",
  "join.day.tap_good": "Ça va",
  "join.day.tap_mixed": "Moyen",
  "join.day.tap_hard": "Dur",

  // Le bloc sombre. La vitrine dépense son unique fond sombre sur la garantie
  // qui intéresse un coach; cette page-ci la dépense sur celle qui intéresse un
  // élève.
  "join.grade.kicker": "Ce qui change vraiment",
  "join.grade.title": "Compté, jamais noté",
  "join.grade.lead":
    "Des choses sont bien comptées ici — les jours que tu as notés, les assiettes que tu as photographiées, ce qui est apparu dessus. La différence est dans la suite : rien de tout ça ne devient une note à courir après, et une semaine difficile ne se transforme jamais en chiffre que tu devrais rattraper.",
  "join.grade.one_title": "Aucun score, aucune série, aucun pourcentage sur tes écrans.",
  "join.grade.one_body":
    "Des comptes existent, et tu peux les lire dans ton espace — mais aucun ne court contre toi. Un jour que tu sautes ne casse rien, parce qu’il n’y a aucune série à casser et aucun total à gâcher.",
  "join.grade.two_title": "Une photo ne devient jamais un chiffre.",
  "join.grade.two_body":
    "Jamais depuis une photo — rien n’est lu sur ton assiette comme une calorie ou un macro, ni stocké, ni transmis. On a mesuré pourquoi avant de trancher : sur 85 analyses réelles, une estimation de calories à partir d’une photo tombait en moyenne 26,6 % sous la vérité, et la marge d’erreur annoncée par le modèle contenait la vérité à peine plus d’une fois sur deux. Là où un chiffre existe dans ce produit, il est calculé à partir de quantités que quelqu’un a réellement données — jamais à partir d’une image.",
  "join.grade.three_title": "Un jour que tu ne notes pas n’est pas un jour raté.",
  "join.grade.three_body":
    "Le silence est enregistré comme inconnu, et l’inconnu n’est jamais transformé en échec dans ton dos. C’est la seule chose que ce produit refuse de deviner à ton sujet.",

  // Le bloc qui liste. On donne la liste réelle, pas une phrase rassurante.
  "join.seen.kicker": "Avant même ta première photo",
  "join.seen.title": "Ce que {coach} voit, et ce qu’il ne voit pas",
  "join.seen.lead":
    "Tu vas commencer à montrer ce que tu manges à un logiciel. Tu mérites la liste exacte, pas une formule rassurante. La voici.",
  "join.seen.sees_label": "Ce qui passe de l’autre côté",
  "join.seen.never_label": "Ce qui reste chez toi",
  "join.seen.sees_1": "Ton nom, et le fuseau horaire où tu vis.",
  "join.seen.sees_2": "La dernière fois que tu as écrit, et combien de fois dans la semaine écoulée.",
  "join.seen.sees_3":
    "Ce que tu as noté et quand — y compris les groupes d’aliments lus sur une assiette, et le fait qu’une photo l’accompagnait ou non.",
  "join.seen.sees_4":
    "Comment la semaine s’est passée : combien de jours bons, moyens ou durs, et lequel de l’énergie, de la faim ou du sommeil revient le plus quand ça ne va pas.",
  "join.seen.sees_5":
    "Chaque fois qu’il ouvre ton espace. C’est écrit noir sur blanc, et ça te revient si tu demandes tes données.",
  "join.seen.never_1":
    "Ce que tu écris. Sa fenêtre sur ta conversation a deux colonnes : quand tu as écrit pour la dernière fois, et à quelle fréquence. Il n’existe aucune colonne qui contienne les mots.",
  "join.seen.never_2":
    "Tes photos. Elles arrivent à Sophia et s’arrêtent là. Ce que la vue de ton coach porte, c’est qu’une photo a existé, jamais la photo.",
  "join.seen.never_3": "Tout ce que tu ajoutes avec tes propres mots à côté d’un repas.",
  // ⟳ RE-RÉÉCRITE LE 2026-09-01 — voir le pack EN pour le pourquoi en entier.
  // « Ton coach n’en voit jamais » était faux: `CoachStudentPage` rend
  // « Maintenance ≈ {low}–{high} kcal/day » dès la première pesée. Ce qui est
  // vrai se dit en entier — rien de ce que l’élève MANGE ne traverse, et la
  // fourchette que le coach voit sort de la pesée seule.
  "join.seen.never_4":
    "Un nombre de calories lu sur ce que tu manges. Rien de ce que tu manges ne devient un chiffre de son côté, et une photo n’en produit jamais. Ce qu’il voit, c’est une fourchette d’entretien calculée à partir de ta seule pesée — la fourchette dans laquelle il travaillerait, jamais une lecture de tes assiettes.",
  "join.seen.exception_label": "Une exception, et elle est voulue",
  "join.seen.exception_body":
    "Si ce que tu écris laisse penser que ton rapport à la nourriture se retourne contre toi, cette phrase part chez {coach} le jour même, marquée urgente. Un logiciel ne devrait pas être seul à porter ça.",
  "join.limit.title": "Il n’y a pas de ligne directe vers {coach}",
  "join.limit.body":
    "Ce n’est pas une messagerie avec ton coach au bout du fil. Il enseigne une méthode à tous ceux qu’il coache, et Sophia est la façon dont elle t’atteint au quotidien. Ce que tu partages nourrit le tableau hebdomadaire qu’il lit — ce n’est pas un message qui attend sa réponse.",

  "join.form.title": "Crée ton espace",
  "join.form.lead": "Tu es relié à {coach} dès que tu as fini.",
  "join.form.name": "Ton nom",
  "join.form.language":
    "La langue dans laquelle tu veux qu'on te parle",
  "join.form.language_hint":
    "Ton coach te répond dans cette langue, et écrit ton plan dedans. Tu pourras en changer plus tard.",
  "join.form.email": "E-mail",
  "join.form.password": "Mot de passe",
  "join.form.password_hint": "8 caractères minimum.",
  "join.form.submitting": "Création de ton espace…",
  "join.form.have_account": "Tu as déjà un compte ?",
  "join.form.have_account_cta": "Se connecter et accepter depuis là",
  "join.form.signed_in_as": "Connecté en tant que {email}.",
  "join.form.signed_in_body":
    "Accepter ouvre à {coach} exactement la fenêtre décrite plus haut, et rien de plus large. Il lit ; il ne peut jamais agir à ta place. Tu peux y mettre fin depuis la page de ton compte quand tu veux.",
  "join.no_token.title": "Il te faut le lien de ton coach",
  "join.no_token.body":
    "On ne s’inscrit pas ici. Un espace ne se crée jamais qu’à partir d’une invitation que ton coach t’envoie, avec ton adresse dessus. Demande-la-lui, et ouvre-la sur ton téléphone.",
  "join.no_token.have_account": "Tu as déjà un compte ?",
  "join.no_token.have_account_cta": "Se connecter",
  "join.no_token.what_is_this": "Ce dans quoi tu entrerais",
} satisfies TranslatedMessagesOf<"join">;
