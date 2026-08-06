// KEEL — le pack FRANÇAIS de la vitrine.
//
// Périmètre: les namespaces listés dans `PUBLIC_NAMESPACES` (catalog.ts), et
// EXACTEMENT eux. Le type `PublicMessages` est dérivé du seed anglais: une clé
// ajoutée à `en.ts` sous un namespace public casse la compilation de ce fichier
// tant qu'elle n'est pas traduite. C'est la seule garantie qui tienne — un
// `Partial` avec repli anglais produirait un écran français avec une phrase
// anglaise au milieu, découvert par un client et pas par un test.
//
// CE N'EST PAS UNE TRADUCTION LITTÉRALE. C'est une page de vente: elle est
// réécrite pour sonner juste en français, pas transposée mot à mot. Les
// tournures anglaises (« Your course ends. Your coaching doesn't. ») ont un
// rythme qui ne survit pas au calque.
//
// Ce qui NE se traduit pas: le nom de marque, l'adresse e-mail, et les prix
// (ce sont des faits commerciaux, pas de la langue).

import type { PublicMessages } from "./catalog";

export const fr: PublicMessages = {
  // ── Marque ───────────────────────────────────────────────────────────────
  "brand.wordmark": "Sophia",

  // ── Chrome public ────────────────────────────────────────────────────────
  "public.header.sign_in": "Se connecter",
  "public.header.start_trial": "Essai gratuit",
  "public.header.legal": "Mentions légales",
  "public.locale.label": "Langue",
  // Les deux ÉTIQUETTES ne se traduisent pas: un sélecteur de langue nomme
  // chaque langue DANS cette langue. « Anglais » écrit en français ne sert que
  // celui qui lit déjà le français — c'est-à-dire celui qui n'en a pas besoin.
  "public.locale.en": "EN",
  "public.locale.fr": "FR",
  "public.locale.switch_to_en": "Read this site in English",
  "public.locale.switch_to_fr": "Lire ce site en français",
  "public.header.back_to_app": "Retour à mon espace",
  "public.nav.label": "À qui s'adresse Sophia",
  "public.nav.courses": "Formations",
  "public.nav.gyms": "Salles de sport",
  "public.nav.communities": "Communautés",
  "public.footer.tagline": "Ta méthode, qui répond en ton absence.",
  "public.footer.legal": "Mentions légales & confidentialité",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  "public.footer.copyright": "Sophia — logiciel de coaching",

  // ── Passerelles d'authentification ───────────────────────────────────────
  "auth.coach_link.prompt": "Tu es coach ?",
  "auth.coach_link.cta": "Créer un compte coach",
  "auth.coach_link.back_prompt": "Tu n'es pas coach ?",
  "auth.coach_link.back_cta": "Aller à la connexion classique",

  // ── SEO ──────────────────────────────────────────────────────────────────
  "landing.seo_title":
    "Sophia — transforme ta formation en programme de coaching",
  "landing.seo_description":
    "Sophia est l'IA qui répond à tes élèves avec ta méthode et tes mots, tous les jours. Une méthode que tu ne pouvais vendre qu'une fois devient un programme qu'on paie chaque mois. Tu enregistres ta méthode une fois ; chaque message sortant est vérifié contre tes lignes rouges avant de partir. Le lundi, tu lis une page — qui parle encore, comment la semaine a été vécue, ce que tes élèves se sont fixé.",

  // ── Hero ─────────────────────────────────────────────────────────────────
  "landing.hero.kicker": "Pour les coachs qui vendent une méthode, pas des heures",
  "landing.hero.title": "Ta formation se termine. Ton coaching, non.",
  "landing.hero.subtitle":
    "Sophia apprend ta façon de coacher — tes convictions, tes lignes rouges, les arbitrages que tu fais sur les cas difficiles — et répond à tes élèves à ta place, tous les jours. Une méthode que tu ne pouvais vendre qu'une fois devient un programme qu'on paie chaque mois. Chaque message est vérifié contre tes lignes rouges avant de partir.",
  "landing.hero.cta_trial": "Démarrer l'essai de 14 jours",
  "landing.hero.cta_signin": "Se connecter",
  "landing.hero.note":
    "14 jours, jusqu'à 3 élèves. Ils rejoignent sur invitation et reçoivent un espace à eux, conversation comprise. Il n'y a aucune boîte de réception en tête-à-tête à suivre.",
  "landing.hero.try_prompt": "Tu veux d'abord voir ce que ça donne côté élève ?",
  "landing.hero.try_cta": "Essayer le programme gratuit",

  // ── Maquette du lundi ────────────────────────────────────────────────────
  "landing.mock.monday_title": "Lundi",
  "landing.mock.monday_subtitle": "Une page. Pas un tableau de bord.",
  "landing.mock.contact_label": "Qui parle encore",
  "landing.mock.contact_line":
    "34 élèves cette semaine : 25 en contact, 6 qui décrochent, 3 silencieux.",
  "landing.mock.contact_responsive": "En contact",
  "landing.mock.contact_slipping": "Décrochage",
  "landing.mock.contact_silent": "Silencieux",
  "landing.mock.contact_responsive_hint": "ont répondu sous 2 jours",
  "landing.mock.contact_slipping_hint": "silence de 2 à 5 jours",
  "landing.mock.contact_silent_hint": "silence de 5 jours ou plus",
  "landing.mock.felt_label": "Comment la semaine a été vécue",
  "landing.mock.felt_line":
    "Comment la semaine a été vécue : 18 tiennent le rythme, 8 sont sous tension, 3 traversent une période difficile.",
  "landing.mock.felt_sustainable": "Tiennent le rythme",
  "landing.mock.felt_strained": "Sous tension",
  "landing.mock.felt_hard": "Période difficile",
  "landing.mock.felt_unknown": "Pas assez de points pour le dire",
  "landing.mock.felt_caption":
    "Cinq élèves ont répondu moins de trois fois. Ils sont volontairement absents de la phrase ci-dessus — une réponse ne fait pas une semaine, et personne n'est classé « ça va » par défaut.",
  "landing.mock.intent_label": "Ce qu'ils se sont fixé",
  "landing.mock.intent_line":
    "21 élèves sur 34 se sont écrit une semaine à partir de ta méthode.",
  "landing.mock.caption":
    "Un schéma de la page du lundi. Les formulations sont celles du produit ; la cohorte est un exemple.",
  "landing.mock.wa_label": "Dans leur conversation, aujourd'hui",
  "landing.mock.photo_alt": "Photo d'une assiette, envoyée par un élève",
  "landing.mock.chat_student": "Déjeuner — obligé de manger dehors aujourd'hui",
  "landing.mock.chat_sophia":
    "Des légumes verts et une protéine, portion modérée. C'est la ligne que tu t'es fixée lundi — c'est noté.",
  "landing.mock.chat_evening": "Ça a donné quoi, aujourd'hui ?",
  "landing.mock.chat_tap_good": "Bien",
  "landing.mock.chat_tap_mixed": "Mitigé",
  "landing.mock.chat_tap_hard": "Difficile",
  "landing.mock.chat_tap_caption":
    "Trois boutons. Si c'était difficile, une seule relance — énergie, faim ou sommeil. C'est toute la soirée.",
  "landing.mock.note_label": "Sur leur page, dans ton espace",
  "landing.mock.note_heading": "Ce que tu as remarqué chez lui",
  "landing.mock.note_body":
    "Travaille de nuit, mange vers 3 h du matin. Déteste cuisiner le dimanche.",
  "landing.mock.note_caption":
    "Un champ, un élève, 1 500 caractères. Réécris-le dès que sa situation change ; le message suivant utilise la nouvelle version.",

  // ── Le problème ──────────────────────────────────────────────────────────
  "landing.problem.kicker": "Le problème",
  "landing.problem.title":
    "Une formation se paie une fois. Le travail dure un an.",
  "landing.problem.body":
    "Tu as enregistré les modules, la promo est pleine, et la méthode est bonne. Puis arrive le mardi soir, et un élève a une question qui n'est dans aucun module — parce qu'elle porte sur sa soirée, sa cuisine, sa semaine à lui. Multiplie par tous les inscrits. Il n'existe aucune version de toi qui réponde à tout ça, donc les modules sont l'endroit où ta relation avec eux s'arrête.",
  "landing.problem.q1":
    "« Je peux remplacer le riz par des pâtes ce soir ? »",
  "landing.problem.q2":
    "« Je meurs de faim à 16 h — c'est normal ? »",
  "landing.problem.q3":
    "« J'ai mal mangé à un mariage. J'ai foutu ma semaine en l'air ? »",
  "landing.problem.close":
    "Chacune de ces questions a une réponse, et cette réponse est la tienne — tu as tranché ça cent fois. Personne ne part parce que ta méthode était mauvaise. Ils décrochent parce que le mardi soir, personne qui pense comme toi n'était là. Et un élève qui décroche n'obtient pas de résultat, ne revient pas, et ne t'envoie personne.",

  // ── Comment ça marche ────────────────────────────────────────────────────
  "landing.how.kicker": "Comment ça marche",
  "landing.how.title": "Enregistrée une fois. Elle répond toute la semaine.",
  "landing.how.step1_when": "Une fois",
  "landing.how.step1_title": "Tu enregistres ta méthode",
  "landing.how.step1_body":
    "Un entretien guidé transforme ta façon de coacher en quelque chose que l'agent peut porter : tes convictions, tes lignes rouges, ton vocabulaire, ta manière de trancher les cas difficiles, ton ton. Tu relis exactement ce qu'il a compris, puis tu publies. Tu la révises quand tu veux — une modification s'applique dès le message suivant — et tu reviens à n'importe quelle version antérieure sans perdre l'historique de ce que tes élèves ont réellement reçu.",
  "landing.how.step2_when": "Tous les jours",
  "landing.how.step2_title": "Tes élèves la vivent, jour après jour",
  "landing.how.step2_body":
    "Ils envoient la photo d'une assiette ou une phrase sur leur journée, et reçoivent une réponse dans ta méthode — dans leur conversation, dans le fil qui reste ouvert toute la journée. Le soir, un seul appui dit comment la journée s'est passée.",
  "landing.how.space_when": "Quand ils veulent",
  "landing.how.space_title": "Et un espace à eux",
  "landing.how.space_body":
    "Pas un endroit où on les pousse — ils l'ouvrent quand ils en ont envie. C'est là qu'ils construisent leur semaine à partir de ta méthode : Sophia la propose, ils l'adoptent seulement s'ils s'y reconnaissent, et la conviction dont chaque ligne alimentaire découle est imprimée en dessous. C'est aussi là qu'ils regardent en arrière — leur régularité, comment les journées se sont passées, leurs assiettes.",
  "landing.how.step3_when": "Chaque lundi",
  "landing.how.step3_title": "Tu lis une page",
  "landing.how.step3_body":
    "Qui parle encore, comment la semaine a été vécue, ce que tes élèves se sont fixé. Calculé à partir de ce qui s'est réellement passé, jamais raconté par un modèle — et quand il n'y a pas de quoi dire quelque chose, c'est ça qui est écrit.",

  // ── La note 1:1 ──────────────────────────────────────────────────────────
  "landing.note.kicker": "Si tu coaches en tête-à-tête",
  "landing.note.title":
    "Dix élèves que tu connais vraiment. Dis à Sophia ce que tu sais.",
  "landing.note.body":
    "Ta méthode, c'est ce que tu dirais à n'importe lequel d'entre eux. Mais tu sais aussi que celui-là travaille de nuit, que celle-ci revient d'une blessure au genou, que cet autre raye le dimanche toutes les semaines. Rien de tout ça n'a sa place dans ta méthode — ce n'est vrai de personne d'autre. Donc ça va ailleurs : une note, sur un élève, avec tes mots.",
  "landing.note.rule1_title": "Elle atteint tout ce qu'il reçoit",
  "landing.note.rule1_body":
    "Sa conversation, la semaine qu'il se construit, les repas que Sophia lui propose. Pas une seconde méthode qui tournerait à côté de la tienne — ta méthode, lue à travers ce que tu sais de lui.",
  "landing.note.rule2_title": "Elle ne prime jamais sur rien",
  "landing.note.rule2_body":
    "Ses allergies d'abord, ta méthode ensuite, la note en troisième. Partout où la note rencontre l'une des deux, c'est l'autre qui gagne. Elle ne peut pas débloquer un aliment qu'une contrainte exclut, et elle n'ouvre aucune conviction que tu n'as pas : chaque ligne que Sophia construit remonte toujours à ta méthode, ou la base refuse de l'enregistrer.",
  "landing.note.rule3_title": "Sophia s'en sert. Elle ne la cite jamais.",
  "landing.note.rule3_body":
    "Ton élève ne lit jamais « ton coach a noté que tu… ». Il reçoit une réponse qui se trouve lui correspondre, sans explication de pourquoi. Et parce que c'est une note sur une personne, elle lui appartient aussi : elle est incluse s'il demande un jour ses données, et l'écran te le dit avant que tu écrives.",
  "landing.note.rule4_title": "Vide veut dire vide",
  "landing.note.rule4_body":
    "Aucun rappel, aucun champ qui t'attend, et rien qui parte vers le modèle pour dire que tu l'as laissé blanc. Deux cents élèves, n'en écris aucune. Dix, écris-en dix. C'est la seule forme sous laquelle un champ par élève ne devient pas discrètement une corvée par élève.",
  "landing.note.close":
    "C'est tout le mode tête-à-tête. C'est une note, pas une messagerie — personne n'y répond, et il n'y a toujours rien à suivre de ton côté.",

  // ── Le double verrou ─────────────────────────────────────────────────────
  "landing.diff.kicker": "Ce qui devrait te faire le plus peur",
  "landing.diff.title":
    "Une IA qui parle en ton nom est un risque. On le traite comme tel.",
  "landing.diff.body":
    "Un prompt est une consigne, pas une garantie. Dis à n'importe quel modèle « ne recommande jamais de grignoter entre les repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique de ta part est ce que tes élèves retiendront. Donc tes lignes rouges sont tenues deux fois, par deux mécanismes qui échouent différemment.",
  "landing.diff.lock1_tag": "Verrou 1 — injecté",
  "landing.diff.lock1": "Ta méthode entre dans le prompt, à chaque message.",
  "landing.diff.lock2_tag": "Verrou 2 — vérifié",
  "landing.diff.lock2":
    "Chaque message sortant est passé au crible de tes lignes rouges avant d'être envoyé. Déterministe, aucun modèle dans cette boucle. C'est celui-là, la garantie.",
  "landing.diff.trace_label": "Ce que ça donne, sur un message",
  "landing.diff.trace_example":
    "Exemple — un coach dont la méthode exclut le grignotage",
  "landing.diff.trace_ask": "Un élève demande",
  "landing.diff.trace_ask_text":
    "« Je devrais ajouter une collation entre le déjeuner et le dîner ? »",
  "landing.diff.trace_draft": "Le brouillon disait",
  "landing.diff.trace_draft_text":
    "« Une petite collation en milieu d'après-midi peut aider — essaie six petits repas répartis sur la journée. »",
  "landing.diff.trace_held": "Retenu par le verrou 2",
  "landing.diff.trace_sent": "Ce qui est parti à la place",
  "landing.diff.trace_sent_text":
    "« Trois vrais repas. Si tu as faim entre les deux, c'est que le repas d'avant était trop léger — corrige le repas, pas l'écart. »",
  "landing.diff.trace_note":
    "Ce remplacement n'est pas le nôtre. Chaque ligne rouge porte ce que tu fais à la place, avec tes mots, et c'est ça que ton élève reçoit.",
  "landing.diff.close":
    "Ton élève ne reçoit jamais un refus, et jamais un « demande à ton coach » — dans une masterclasse, ça désigne une porte qui n'existe pas. Il reçoit ta réponse.",

  // ── Doctrine ─────────────────────────────────────────────────────────────
  "landing.doctrine.kicker": "Notre doctrine",
  "landing.doctrine.title": "Trois règles sur lesquelles on ne cède pas",
  "landing.doctrine.rule1_title":
    "Tu enseignes. Ils décident. Personne n'est noté.",
  "landing.doctrine.rule1_body":
    "Aucun score d'assiduité, aucun pourcentage, aucune série, aucun classement de tes élèves. On ne note pas quelqu'un contre un plan qu'il n'a jamais signé. La semaine enregistre comment ça s'est passé ; le jugement reste le tien.",
  "landing.doctrine.rule2_title":
    "Chaque ligne nomme la conviction dont elle découle.",
  "landing.doctrine.rule2_body":
    "Quand un élève construit sa semaine à partir de ta méthode, chaque ligne alimentaire dit laquelle de tes convictions elle applique — et la base refuse une ligne qui n'en nomme aucune. C'est une contrainte, pas une convention. Ton élève lit la conviction sous la ligne, pour que vous puissiez juger tous les deux si c'était une lecture juste de toi.",
  "landing.doctrine.rule3_title": "Le silence n'est jamais arrondi au mieux.",
  "landing.doctrine.rule3_body":
    "Un élève qui a répondu deux fois ne nous a pas donné une semaine. Il revient en « pas assez de points », jamais en « ça va ». Ça nous coûte une page plus flatteuse, et c'est la seule raison pour laquelle cette page vaut la peine d'être lue.",
  // Miroir de `en.ts` — voir le commentaire long là-bas pour ce qui a changé le
  // 2026-08-06 et pourquoi. En deux lignes: le refus d'identité est retiré (le
  // produit va fournir un calcul approximatif), la MESURE reste, et
  // `docs/keel/LEGAL.md` §6.4 interdit toujours d'annoncer un comptage
  // calorique par photo. Ce fichier est chargé par `t.ts` et gardé par
  // `parity.int.test.ts`: le laisser en arrière, c'est publier l'ancienne
  // doctrine en français pendant qu'on en tient une autre en anglais.
  "landing.doctrine.no_calories_title":
    "Les calories — ce qu'une photo peut vraiment te dire.",
  "landing.doctrine.no_calories_body":
    "On l'a mesuré sur notre propre modèle avant de trancher. Quand on lui donne les quantités, il est juste : 2,3 % d'erreur moyenne face aux données de référence de l'USDA. Quand on lui demande de les deviner sur une photo, il ne l'est pas — sur 85 analyses réelles, l'estimation était en moyenne 26,6 % en dessous de la vérité, et cette erreur penche du même côté à chaque fois au lieu de se compenser sur la semaine. Quand le modèle donne sa propre marge d'erreur, la vérité tombe dedans à peine plus d'une fois sur deux.",
  "landing.doctrine.no_calories_body2":
    "Alors Sophia part de la moitié qu'une photo sait faire : ce qui a été mangé, quand, et en quelle quantité — petite, modérée ou grande. Celle-là, ton élève la vérifie d'un coup d'œil, et une erreur se corrige en un message. Là où un chiffre apparaît, c'est une estimation et c'est écrit comme telle : jamais une cible contre laquelle on mesure ton élève, jamais une note, et jamais un substitut à ta méthode. Prescrire des chiffres reste à ceux qui sont qualifiés pour le faire.",

  // ── Tarif ────────────────────────────────────────────────────────────────
  "landing.pricing.kicker": "Tarif",
  "landing.pricing.title": "Une seule ligne. Elle grandit avec ce que tu vends.",
  "landing.pricing.seat": "7 €",
  "landing.pricing.seat_period": "par élève et par mois",
  "landing.pricing.seat_label":
    "Aucun abonnement de plateforme. Aucun frais de mise en route. Rien d'autre.",
  "landing.pricing.why":
    "Tu paies pour les élèves que tu as inscrits, et tu arrêtes de payer le mois où tu libères une place. Facture-leur ce que tu veux par-dessus — un élève, dix, cinq cents : le calcul est le même, et il est positif dès le premier. Le chiffre auquel comparer ça, ce ne sont pas les heures que tu gagnes : c'est ce que vaut pour toi un élève qui reste au lieu de décrocher.",
  "landing.pricing.cta": "Démarrer l'essai de 14 jours",
  "landing.pricing.trial_note":
    "14 jours, jusqu'à 3 élèves, puis ça s'arrête tout seul.",

  // ── Clôture ──────────────────────────────────────────────────────────────
  "landing.closing.title":
    "Tu as déjà écrit la méthode. Voilà ce qui la rend payable chaque mois.",
  "landing.closing.cta": "Démarrer l'essai de 14 jours",
  "landing.closing.signin_prompt": "Tu utilises déjà Sophia ?",
  "landing.closing.signin_link": "Se connecter",
};
