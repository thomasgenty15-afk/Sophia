// Pack français — le namespace `legal`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `legal.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frLegal = {
  // ── chantier-0904/FF-060 — fin ──


  // ── /legal — MENTIONS LÉGALES, CGU, CONFIDENTIALITÉ, CGV, PARRAINAGE ────
  //
  // VOUVOIEMENT, comme `/` et `/auth`: la ligne de partage du lot 1 est la
  // porte, et cette page se lit avant d'entrer — souvent par quelqu'un qui
  // vérifie qui nous sommes avant d'acheter.
  //
  // ⚠️ CE N'EST PAS UNE TRADUCTION NEUVE, C'EST UNE RÉCUPÉRATION. La page a
  // été française jusqu'au 2026-08-03 (commit `0328448a`, « le site passe
  // entierement en anglais »); les tournures juridiques d'origine — « au
  // capital social de », « à titre informatif et d'aide à la décision »,
  // « obligation de moyens » — sont reprises telles quelles quand la section
  // a survécu. Les sections écrites APRÈS ce commit (l'identité complète, la
  // conservation RGPD, le parrainage) sont traduites ici pour la première fois.
  //
  // ⚠️ DEUX CITATIONS RESTENT ANGLAISES DANS `legal.privacy.s5_p1`, et c'est la
  // règle des citations d'écran: `/account` n'est pas déclarée traduite, donc
  // son menu dit « Account → Options → My data » à un francophone aussi. Le
  // traduire enverrait la lectrice chercher un menu qui n'existe pas.
  "legal.seo.title": "Mentions légales & conditions",
  "legal.seo.description":
    "Mentions légales de {domain} : éditeur, siège social, numéro de TVA, hébergement, conditions d'utilisation, politique de confidentialité et conditions de vente.",
  "legal.page.title": "Mentions légales & conditions",
  "legal.page.intro":
    "Qui édite {domain}, comment nous joindre, et les conditions qui régissent le service.",
  "legal.page.updated": "Dernière mise à jour : {date}",

  "legal.nav.mentions": "Mentions légales",
  "legal.nav.cgu": "Conditions d'utilisation",
  "legal.nav.privacy": "Confidentialité",
  "legal.nav.cgv": "Conditions de vente",
  "legal.nav.referral": "Parrainage",

  "legal.mentions.title": "Mentions légales",
  "legal.mentions.subtitle":
    "L'identité de l'éditeur, telle que l'exige l'article 6-III de la LCEN",
  "legal.mentions.intro":
    "Le site {domain} et le service Sophia sont édités par {name}, {form} au capital social de {capital}, immatriculée au registre du commerce et des sociétés (RCS) sous le numéro {rcs}, dont le siège social est situé {office}.",
  "legal.mentions.row_publisher": "Éditeur",
  "legal.mentions.row_form": "Forme juridique",
  "legal.mentions.row_capital": "Capital social",
  "legal.mentions.row_rcs": "Numéro RCS",
  "legal.mentions.row_vat": "Numéro de TVA intracommunautaire",
  "legal.mentions.row_office": "Siège social",
  "legal.mentions.row_director": "Directeur de la publication",
  "legal.mentions.row_contact": "Contact",
  "legal.mentions.row_phone": "Téléphone",
  "legal.mentions.form_value": "Société par actions simplifiée (SAS), France",
  "legal.mentions.hosting_title": "Hébergement",
  "legal.mentions.hosting_body":
    "Le site est hébergé par {name}, {street}, {city}, {region} {postal}, États-Unis.",
  "legal.mentions.ip_title": "Propriété intellectuelle",
  "legal.mentions.ip_body":
    "L'ensemble de ce site relève de la législation française et internationale sur le droit d'auteur et la propriété intellectuelle. Tous les droits de reproduction sont réservés, y compris pour les documents téléchargeables et pour les représentations iconographiques et photographiques.",

  "legal.cgu.title": "Conditions générales d'utilisation",
  "legal.cgu.subtitle": "Les règles d'accès et d'usage de la plateforme",
  "legal.cgu.s1_title": "1. Objet et acceptation",
  "legal.cgu.s1_p1":
    "Les présentes conditions générales d'utilisation (les « CGU ») régissent l'accès et l'utilisation de la plateforme SaaS « Sophia » (le « Service »), éditée par {name} (l'« Éditeur »).",
  "legal.cgu.s1_p2":
    "L'utilisation du Service implique l'acceptation sans réserve des présentes CGU. L'utilisateur reconnaît avoir pris connaissance de l'ensemble des conditions avant de cocher la case « J'accepte » lors de son inscription.",
  "legal.cgu.s2_title": "2. Description du Service",
  "legal.cgu.s2_p1":
    "Sophia est un assistant virtuel intelligent (IA) dédié au développement personnel, à la productivité et à l'architecture de vie. Le Service permet notamment de :",
  "legal.cgu.s2_li1":
    "Générer des plans d'action personnalisés pour organiser son quotidien et atteindre ses objectifs.",
  "legal.cgu.s2_li2":
    "Interagir avec une IA conversationnelle pour le soutien motivationnel et le suivi d'habitudes.",
  "legal.cgu.s2_li3":
    "Accéder à des outils de structuration de l'identité et de suivi de progression.",
  "legal.cgu.ai_notice_label": "Avertissement IA :",
  "legal.cgu.ai_notice_body":
    "Les conseils et contenus générés par Sophia sont produits par des algorithmes d'intelligence artificielle. Ils sont fournis à titre informatif et d'aide à la décision, et ne sauraient remplacer le jugement professionnel humain ni constituer un conseil juridique, médical ou financier certifié.",
  "legal.cgu.s3_title": "3. Accès au Service",
  "legal.cgu.s3_p1":
    "Le Service est accessible 24 h/24 et 7 j/7, sauf cas de force majeure ou maintenance. L'Éditeur se réserve le droit de suspendre, d'interrompre ou de limiter l'accès à tout ou partie du Service pour des raisons techniques ou de sécurité, sans que cela n'ouvre droit à indemnisation.",
  "legal.cgu.s4_title": "4. Compte utilisateur",
  "legal.cgu.s4_p1":
    "L'inscription est obligatoire pour accéder aux fonctionnalités. L'Utilisateur est seul responsable de la confidentialité de ses identifiants. Toute action effectuée depuis son compte est réputée être effectuée par lui. En cas de perte ou de vol d'identifiants, l'Utilisateur doit en informer l'Éditeur sans délai.",
  "legal.cgu.s5_title": "5. Propriété intellectuelle",
  "legal.cgu.s5_service_label": "Contenu du Service :",
  "legal.cgu.s5_service_body":
    "L'ensemble des éléments du Service (structure, design, codes, algorithmes, marques « Sophia ») est la propriété exclusive de la société {name}. Toute reproduction est interdite sans autorisation.",
  "legal.cgu.s5_user_label": "Contenu de l'Utilisateur :",
  "legal.cgu.s5_user_body":
    "Les données, textes et informations fournis par l'Utilisateur restent sa propriété. L'Utilisateur concède à l'Éditeur un droit d'utilisation de ces contenus pour les seuls besoins de fonctionnement et d'amélioration du Service (notamment l'entraînement des modèles d'IA, sous forme anonymisée).",
  "legal.cgu.s6_title": "6. Responsabilité",
  "legal.cgu.s6_p1":
    "L'Éditeur fournit le Service dans le cadre d'une obligation de moyens. Sa responsabilité ne saurait être engagée pour :",
  "legal.cgu.s6_li1":
    "Les dommages indirects (perte de chiffre d'affaires, perte de chance, etc.).",
  "legal.cgu.s6_li2":
    "L'inadéquation des conseils de l'IA à la situation particulière de l'Utilisateur.",
  "legal.cgu.s6_li3": "Les problèmes liés à la connexion internet de l'Utilisateur.",
  "legal.cgu.s6_li4":
    "Les conséquences d'une panne, d'un incident de sécurité ou d'un piratage survenu sur l'infrastructure de prestataires tiers (hébergement, fournisseurs de modèles d'IA, acheminement des messages), en l'absence de faute prouvée de l'Éditeur dans le choix ou la configuration de ces services.",

  "legal.privacy.title": "Politique de confidentialité",
  "legal.privacy.subtitle": "La protection de vos données personnelles (RGPD)",
  "legal.privacy.s1_title": "1. Données collectées",
  "legal.privacy.s1_p1":
    "Lorsque vous utilisez Sophia, nous collectons les données suivantes :",
  "legal.privacy.s1_li1_label": "Données d'identité :",
  "legal.privacy.s1_li1_body":
    "nom, prénom, adresse e-mail, numéro de téléphone (identifiant du compte).",
  "legal.privacy.s1_li2_label": "Données de vie et d'objectifs :",
  "legal.privacy.s1_li2_body":
    "réponses au questionnaire, objectifs personnels, plans d'action générés.",
  "legal.privacy.s1_li3_label": "Données de conversation :",
  "legal.privacy.s1_li3_body": "l'historique des échanges avec l'assistant Sophia.",
  "legal.privacy.s1_li4_label": "Données techniques :",
  "legal.privacy.s1_li4_body":
    "journaux de connexion, adresse IP, type de navigateur.",
  "legal.privacy.s2_title": "2. Finalités du traitement",
  "legal.privacy.s2_p1": "Vos données sont traitées pour les raisons suivantes :",
  "legal.privacy.s2_li1":
    "Fournir et personnaliser le Service (base légale : exécution du contrat).",
  "legal.privacy.s2_li2":
    "Envoyer les notifications et rappels dans l'application (base légale : consentement).",
  "legal.privacy.s2_li3":
    "Améliorer en continu les algorithmes d'IA (base légale : intérêt légitime).",
  "legal.privacy.s2_li4": "Gérer la facturation et le support client.",
  "legal.privacy.s3_title": "3. Partage des données",
  "legal.privacy.s3_p1":
    "Vos données sont strictement confidentielles. Elles ne sont transmises qu'aux sous-traitants techniques sans lesquels nous ne pouvons pas fonctionner (hébergement cloud, fournisseur d'API d'IA, service d'acheminement des messages), tenus aux mêmes obligations de sécurité.",
  "legal.privacy.s3_never_sell":
    "Nous ne vendons jamais vos données à des annonceurs.",
  "legal.privacy.s4_title": "4. Sécurité",
  "legal.privacy.s4_p1":
    "Nous mettons en place des mesures de sécurité techniques (chiffrement SSL/TLS, bases de données sécurisées) et organisationnelles pour protéger vos données contre tout accès non autorisé, perte ou altération.",
  "legal.privacy.s5_title": "5. Vos droits",
  "legal.privacy.s5_p1":
    "Le RGPD vous ouvre des droits d'accès, de rectification, d'effacement, de limitation et de portabilité sur vos données. Vous exercez l'effacement et la portabilité directement dans l'application, sans nous écrire : menu « Account → Options → My data » (exporter vos données) et « Delete my account ».",
  "legal.privacy.s6_title": "6. Conservation et suppression des données",
  "legal.privacy.s6_self_label": "Suppression du compte en autonomie :",
  "legal.privacy.s6_self_body":
    "vous pouvez supprimer votre compte à tout moment depuis l'application. La suppression se fait en deux temps :",
  "legal.privacy.s6_li1_label": "Immédiatement :",
  "legal.privacy.s6_li1_body":
    "votre accès est désactivé, Sophia cesse de vous écrire et votre abonnement est résilié sans nouveau prélèvement.",
  "legal.privacy.s6_li2_label": "Sous 7 jours :",
  "legal.privacy.s6_li2_body":
    "l'ensemble de vos données (profil, plans, conversations, souvenirs) est supprimé définitivement et irréversiblement de nos bases. Pendant ce délai, vous pouvez annuler la suppression en vous reconnectant.",
  "legal.privacy.s6_kept_title": "Données conservées après la suppression :",
  "legal.privacy.s6_kept_li1":
    "Les factures liées à vos paiements, conservées au titre de l'obligation légale de conservation comptable (article L.123-22 du code de commerce).",
  "legal.privacy.s6_kept_li2":
    "Une trace anonymisée minimale de la suppression (empreintes cryptographiques de l'adresse e-mail et du numéro de téléphone, et date de suppression), conservée comme preuve de conformité. Elle ne permet pas de vous identifier.",
  "legal.privacy.s6_kept_li3":
    "Les mesures techniques d'usage (volumes et coûts de calcul), anonymisées au moment de la suppression : elles ne sont plus rattachées à personne.",
  "legal.privacy.s6_backups_label": "Sauvegardes techniques :",
  "legal.privacy.s6_backups_body":
    "des copies de sauvegarde de nos bases peuvent subsister temporairement après la suppression. Elles expirent d'elles-mêmes au fil de leur rotation et ne sont jamais utilisées pour restaurer des données supprimées, sauf incident technique majeur touchant l'ensemble du service.",
  "legal.privacy.s6_export_label": "Export de vos données :",
  "legal.privacy.s6_export_body":
    "vous pouvez télécharger une copie de vos données (profil, plans, conversations, souvenirs) au format JSON à tout moment depuis le menu du compte. Par sécurité, une nouvelle authentification est demandée, une notification vous est envoyée à chaque demande, et les exports sont limités à un par 24 heures.",
  "legal.privacy.rights_label": "Exercer vos droits.",
  "legal.privacy.rights_body":
    "Pour toute demande concernant vos données, écrivez-nous à",

  "legal.cgv.title": "Conditions générales de vente",
  "legal.cgv.subtitle": "Abonnements, paiements et rétractation",
  "legal.cgv.s1_title": "1. Offres et prix",
  "legal.cgv.s1_p1":
    "Les services sont proposés sous forme d'abonnements (mensuels ou annuels) ou d'achats ponctuels. Les prix sont indiqués en euros (€) toutes taxes comprises sur la page « Tarifs ». {name} se réserve le droit de modifier ses prix à tout moment, mais le Service est facturé aux prix en vigueur au moment de la confirmation de la commande.",
  "legal.cgv.s2_title": "2. Paiement",
  "legal.cgv.s2_p1":
    "Le paiement s'effectue par carte via notre prestataire de paiement sécurisé (Stripe). Le paiement est exigible immédiatement à la commande. En cas d'échec du paiement, l'accès au Service est suspendu immédiatement.",
  "legal.cgv.s3_title": "3. Renouvellement et résiliation",
  "legal.cgv.s3_renewal_label": "Renouvellement :",
  "legal.cgv.s3_renewal_body":
    "les abonnements se renouvellent automatiquement pour une durée identique à celle souscrite initialement, sauf résiliation par l'Utilisateur.",
  "legal.cgv.s3_cancel_label": "Résiliation :",
  "legal.cgv.s3_cancel_body":
    "l'Utilisateur peut résilier son abonnement à tout moment depuis l'espace « Mon compte ». La résiliation prend effet à la fin de la période d'abonnement en cours. Aucun remboursement au prorata n'est effectué pour une période déjà entamée.",
  "legal.cgv.s4_title": "4. Absence de droit de rétractation",
  "legal.cgv.s4_notice":
    "Conformément à l'article L.221-28 du code de la consommation, le droit de rétractation ne peut être exercé pour les contrats de fourniture d'un contenu numérique non fourni sur un support matériel (SaaS) dont l'exécution a commencé après accord préalable exprès du consommateur et renoncement exprès à son droit de rétractation.",
  "legal.cgv.s4_p1":
    "En souscrivant au Service et en accédant immédiatement aux fonctionnalités numériques, l'Utilisateur renonce expressément à son droit de rétractation.",
  "legal.cgv.s5_title": "5. Droit applicable",
  "legal.cgv.s5_p1":
    "Les présentes conditions générales de vente sont soumises au droit français. En cas de litige, compétence est attribuée aux tribunaux compétents du ressort du siège social de la société {name}, nonobstant pluralité de défendeurs ou appel en garantie.",

  "legal.referral.title": "Programme de parrainage",
  "legal.referral.subtitle": "Les conditions du programme",
  "legal.referral.s1_title": "1. Fonctionnement",
  "legal.referral.s1_p1":
    "Chaque Utilisateur dispose d'un code de parrainage personnel, partageable sous forme de lien ou de code. Lorsqu'une personne (le « Filleul ») crée un compte Sophia avec ce code, son essai gratuit passe à 30 jours au lieu de 14. Le code doit être saisi à l'inscription : il ne peut pas être ajouté ensuite à un compte existant.",
  "legal.referral.s2_title": "2. Récompense du parrain",
  "legal.referral.s2_lead":
    "Le Parrain reçoit un (1) mois d'abonnement offert, à hauteur du prix mensuel de son offre en cours, sous forme d'avoir déduit de ses prochaines factures. Cette récompense n'est créditée",
  "legal.referral.s2_condition":
    "que lorsque le Filleul règle une première facture d'un montant strictement supérieur à zéro",
  "legal.referral.s2_no_entitlement":
    "La simple inscription du Filleul, la période d'essai ou une facture à 0 € n'ouvrent droit à aucune récompense.",
  "legal.referral.s2_held":
    "Si le Parrain n'est pas encore abonné au moment où son Filleul convertit, la récompense est mise en attente et appliquée automatiquement à ses premières factures dès qu'il souscrit un abonnement.",
  "legal.referral.s3_title": "3. Plafond",
  "legal.referral.s3_p1":
    "Les mois offerts sont plafonnés à douze (12) mois par période glissante de douze (12) mois et par Parrain. Au-delà de ce plafond, les parrainages restent comptabilisés mais n'ouvrent plus droit à récompense.",
  "legal.referral.s4_title": "4. Réserve anti-fraude",
  "legal.referral.s4_notice":
    "L'auto-parrainage (même personne, même numéro de téléphone, ou comptes multiples) est interdit. Le Filleul doit être un nouvel utilisateur ne disposant pas déjà d'un compte Sophia. {name} se réserve le droit de refuser, suspendre ou annuler toute récompense obtenue en violation de ces conditions ou par tout moyen frauduleux ou abusif, et de suspendre les comptes concernés.",
  "legal.referral.s5_title": "5. Nature de la récompense",
  "legal.referral.s5_p1":
    "Les mois offerts n'ont aucune valeur monétaire : ils ne sont ni remboursables, ni cessibles, ni convertibles en espèces. {name} peut modifier ou mettre fin au programme de parrainage à tout moment ; les récompenses déjà acquises restent dues.",
} satisfies TranslatedMessagesOf<"legal">;
