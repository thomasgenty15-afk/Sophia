// /communities — le pack FRANÇAIS, à fusionner dans `frontend/src/keel/i18n/fr.public.ts`.
//
// ⚠️ `communities` était dans `PUBLIC_NAMESPACES_PENDING_TRANSLATION`
// (`i18n/catalog.ts:54`) : la page n'avait AUCUN français. Ce pack ferme cette
// dette — l'orchestrateur retire `communities` de cette liste et l'ajoute à
// `PUBLIC_NAMESPACES`, ce qui met le compilateur en garde sur la clé manquante
// suivante.
//
// CE N'EST PAS UNE TRADUCTION LITTÉRALE. C'est une page de vente : elle est
// réécrite pour sonner juste en français. Ne se traduisent pas : le nom de
// marque et les prix (ce sont des faits commerciaux, pas de la langue).
//
// ── LA TYPOGRAPHIE FRANÇAISE EST DANS LES OCTETS, PAS DANS UNE CONVENTION ──
// Les espaces insécables ci-dessous sont de VRAIS U+00A0, invisibles à la
// lecture. Elles se perdent au premier reformatage automatique, et personne ne
// s'en aperçoit avant de voir un `?` seul en début de ligne, chez un client.
// Deux contrôles à rejouer après toute édition de ce fichier :
//     grep -nE ' [?!;»%€]' keys.fr.ts     → doit être VIDE
//     grep -c $'\xc2\xa0' keys.fr.ts      → 33 lignes au dernier passage
// Règle appliquée : U+00A0 avant `:` `;` `!` `?` `»` `€` `%`, et après `«`.
// ⚠️ JAMAIS U+202F (espace fine insécable) : mesuré sans glyphe dans les
// fichiers COMPLETS de Young Serif et de Public Sans, et dans 24 autres
// familles. Elle tomberait en repli système au milieu d'un mot.
// L'apostrophe est TYPOGRAPHIQUE (’, U+2019), jamais `'`.
export const communitiesFr = {
  "communities.seo_title":
    "Sophia pour les communautés payantes — la réponse qu’un fil ne donne pas",
  "communities.seo_description":
    "Vous tenez une communauté payante. C’est un fil : vous répondez en public, au groupe, et aucun membre n’a jamais de réponse à lui. Sophia est la couche du dessous — chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir de votre méthode. Votre communauté ne bouge pas. 7 € par membre sur ce palier, par mois.",

  // ── HERO ─────────────────────────────────────────────────────────────────
  "communities.hero.kicker": "Pour ceux qui tiennent une communauté payante",
  "communities.hero.title": "Une communauté est un fil. Un fil ne répond pas à une personne.",
  "communities.hero.lede":
    "Vous répondez en public, au groupe — et aucune heure de plus n’y changera rien, parce que c’est la forme même de ce que vous avez construit. Vos membres le vivent comme ceci : ils n’ont jamais de réponse à eux. Sophia est la couche du dessous : chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir de votre méthode. Votre communauté ne bouge pas.",
  "communities.hero.cta": "Commencer l’essai de 14 jours",
  "communities.hero.note":
    "14 jours, 3 membres au plus, puis ça s’arrête tout seul. Vos membres entrent par une invitation e-mail envoyée depuis votre espace, et rien ne vous revient sous forme de boîte de réception.",
  "communities.hero.signin_prompt": "Déjà sur Sophia ?",
  "communities.hero.signin_link": "Se connecter",

  // ── FIGURE A ─────────────────────────────────────────────────────────────
  "communities.fig_lane.label": "UNE QUESTION, DEUX DESTINATIONS",
  "communities.fig_lane.alt_title": "Une réponse pour tous, ou une réponse à chacun",
  "communities.fig_lane.alt_desc":
    "Les mêmes quatre membres, dessinés deux fois. À gauche, un seul trait les ouvre tous les quatre : c’est une réponse publique, écrite pour convenir à tout le monde. À droite, chacun a son propre trait. Ce qui change n’est pas la quantité de travail, c’est le nombre de personnes à qui la réponse s’adresse.",
  "communities.fig_lane.thread_label": "DANS LE FIL",
  "communities.fig_lane.tier_label": "SUR LE PALIER COACHÉ",
  "communities.fig_lane.thread_caption": "une réponse pour tout le monde",
  "communities.fig_lane.tier_caption": "une réponse à chacun",

  // ── LE PALIER ────────────────────────────────────────────────────────────
  "communities.tier.kicker": "Ce que vous ajoutez",
  "communities.tier.title":
    "Un palier au-dessus de ce que vous vendez déjà. Rien ne bouge en dessous.",
  "communities.tier.body":
    "Même plateforme, même prix d’entrée, mêmes publications, mêmes gens. Au-dessus, vous ouvrez une option de plus : tout ce qu’ils ont déjà, et un agent qui les coache un par un dans votre méthode. Ceux qui en veulent montent. Les autres ne s’aperçoivent jamais qu’elle existe.",

  "communities.fig_tier.label": "LA MÊME OFFRE, ET UNE BANDE DE PLUS",
  "communities.fig_tier.alt_title":
    "Le palier se pose au-dessus, l’offre du dessous ne bouge pas",
  "communities.fig_tier.alt_desc":
    "Deux fois la même offre, dessinée par un seul élément appelé deux fois. Celle du dessus porte une bande de plus : l’agent de chaque membre. Rien d’autre ne change — ni la plateforme, ni le prix d’entrée, ni les publications.",
  "communities.fig_tier.band": "son agent à lui, chaque jour",
  "communities.fig_tier.tier_label": "LE PALIER COACHÉ",
  "communities.fig_tier.tier_value": "41 €",
  "communities.fig_tier.base_label": "VOTRE COMMUNAUTÉ",
  "communities.fig_tier.base_value": "29 €",
  "communities.fig_tier.cost_label": "VOTRE COÛT",
  "communities.fig_tier.cost_value": "7 €",

  "communities.tier.example":
    "Un exemple chiffré. Cinq cents membres, trois sur dix prennent le palier : 150 × 12 €, moins 150 sièges à 7 €. Environ 750 € par mois, sur des gens dont vous avez déjà payé l’acquisition.",
  "communities.tier.example_caption":
    "C’est écrit exemple parce que c’en est un : votre prix et votre taux de passage décident du total, et ces deux-là sont à vous. Ce qui n’est pas une estimation, c’est le 7 €, et le fait qu’il ne porte que sur les membres qui montent.",
  "communities.tier.billing":
    "Vous continuez de les encaisser là où vous les encaissez déjà. Aucun membre ne paie Sophia, ni ne nous voit comme quelque chose à payer.",

  // ── LES BORNES ───────────────────────────────────────────────────────────
  "communities.tier.not_label": "Et avant que vous demandiez ce qu’il faudra refaire : rien",
  "communities.tier.not1_title": "Aucune intégration à votre plateforme",
  "communities.tier.not1_body":
    "Il n’existe aucune intégration Skool, Circle, Discord ou Kajabi — aucune, et nous préférons le dire ici plutôt que vous le laisser découvrir le premier jour. Vos membres entrent par une invitation e-mail que vous envoyez depuis votre espace. Il n’y a pas de lien à copier, et c’est une propriété de sécurité, pas un bouton qui manque.",
  "communities.tier.not2_title": "Aucune seconde couche sociale",
  "communities.tier.not2_body":
    "Vos membres ne se voient jamais entre eux dans Sophia : pas de fil, pas de salon, pas de commentaire. Sophia ne peut pas devenir l’endroit où vos gens se retrouvent, parce qu’il n’y a pas d’endroit. La couche sociale, c’est la vôtre, et elle le reste.",
  "communities.tier.not3_title": "Aucun paiement demandé à vos membres",
  "communities.tier.not3_body":
    "Vous fixez le prix de votre palier, et vous l’encaissez là où vous encaissez déjà. Il n’existe nulle part dans le produit un tunnel de paiement pour un membre.",
  "communities.tier.not4_title": "Ce n’est pas un compteur",
  "communities.tier.not4_body":
    "Les chiffres d’énergie sont éteints par défaut sur le compte d’un membre, et une chaîne de gardes décide si on peut seulement les allumer. Ce qui lui revient, c’est ce qu’il a mangé, quand, et quelle taille de part.",

  // ── LES RÔLES ────────────────────────────────────────────────────────────
  "communities.roles.kicker": "Pourquoi ils restent",
  "communities.roles.title": "Gardez les pairs. Ajoutez ce qu’un groupe n’allait jamais faire.",
  "communities.roles.body":
    "Une communauté est bonne à ce à quoi une communauté est bonne : des gens qui traversent la même chose en même temps, qui se répondent à minuit et qui remarquent quand quelqu’un disparaît une semaine. Sophia n’y touche pas, et ne pourrait pas le prendre même en essayant — elle n’a ni fil ni salon où l’emmener. Ce qu’un groupe ne sait pas faire, c’est répondre à une personne, à 21 h, sur le dîner qu’elle a devant elle.",
  "communities.roles.group_title": "Reste dans votre communauté",
  "communities.roles.group_body":
    "Les pairs. La culture que vous avez bâtie. Vos publications, vos lives, les victoires que les gens affichent le vendredi. C’est pour ça qu’ils sont venus, et aucun agent ne le fabrique.",
  "communities.roles.agent_title": "Passe dans sa ligne à lui",
  "communities.roles.agent_body":
    "La question de 21 h sur son assiette à lui. La semaine composée à partir de votre méthode, pour sa cuisine et son emploi du temps. Et au troisième jour de silence, un message écrit à partir de la méthode que vous avez publiée — celui-là ne part pas entre 21 h et 8 h, il arrive donc dans sa matinée plutôt que par-dessus sa soirée.",

  // ── FIGURE C ─────────────────────────────────────────────────────────────
  "communities.fig_third_day.label": "LE TROISIÈME JOUR DE SILENCE",
  "communities.fig_third_day.alt_title": "Le troisième jour de silence",
  "communities.fig_third_day.alt_desc":
    "Une ligne de temps. À gauche, le dernier message d’un membre. Trois jours sans rien. Au troisième jour, un message part, composé à partir de la méthode publiée du coach. Puis la ligne repart nue : il n’en part jamais qu’un.",
  "communities.fig_third_day.last_label": "SON DERNIER MESSAGE",
  "communities.fig_third_day.last_value": "puis plus rien",
  "communities.fig_third_day.message_label": "UN MESSAGE",
  "communities.fig_third_day.message_value": "dans votre méthode",
  "communities.fig_third_day.silence": "trois jours de silence",
  "communities.fig_third_day.after": "puis ça s’arrête",
  "communities.roles.figure_caption":
    "Soixante-douze heures de silence, un message, et ça s’arrête là : un par épisode, et au plus un par semaine. Le membre qui décroche a de vos nouvelles pendant qu’on peut encore l’atteindre, et pas le mois où sa carte est refusée.",
  "communities.roles.close":
    "Vous n’arbitrez pas entre nous et une autre IA. Vous arbitrez entre un salon de plus — qui reste un salon, où l’on répond en public — et un salaire de plus, qu’il faut former à votre méthode et qui ne tient pas cinq cents membres.",

  // ── LE LUNDI ─────────────────────────────────────────────────────────────
  "communities.monday.kicker": "Ce qu’un fil ne vous dit jamais",
  "communities.monday.title": "Dans un fil, vous ne voyez jamais que les dix qui postent.",
  "communities.monday.body":
    "Dix personnes qui écrivent peuvent en cacher quatre-vingt-dix qui ont arrêté sans rien dire, et rien dans un fil ne distingue le membre qui va bien en silence de celui qui est parti dans sa tête il y a six semaines. Le lundi, vous avez une page, rendue par gabarit à partir de ce qui s’est vraiment passé et jamais racontée par un modèle — et la première chose dessus, ce sont ceux qui n’ont rien dit.",

  "communities.fig_monday.alt_title": "La page du lundi",
  "communities.fig_monday.alt_desc":
    "Schéma de la page hebdomadaire : d’abord qui parle encore — en contact, décrochage, silence — puis comment la semaine a été vécue, et en dernier combien de membres se sont composé une semaine à partir de la méthode du coach. Les silencieux sont sur la première ligne, avant tout le reste.",
  "communities.fig_monday.screen_title": "Cette semaine",
  "communities.fig_monday.contact_label": "QUI PARLE ENCORE",
  "communities.fig_monday.in_touch": "En contact",
  "communities.fig_monday.in_touch_hint": "ont répondu sous 2 jours",
  "communities.fig_monday.slipping": "Décrochage",
  "communities.fig_monday.slipping_hint": "silence de 2 à 5 jours",
  "communities.fig_monday.silent": "Silencieux",
  "communities.fig_monday.silent_hint": "silence de 5 jours ou plus",
  "communities.fig_monday.felt_label": "COMMENT LA SEMAINE A ÉTÉ VÉCUE",
  "communities.fig_monday.holding": "Tiennent le rythme",
  "communities.fig_monday.strained": "Sous tension",
  "communities.fig_monday.hard": "Période difficile",
  "communities.fig_monday.unknown": "Pas assez de points pour le dire",
  "communities.fig_monday.intent_line":
    "88 membres sur 150 se sont composé une semaine avec votre méthode.",
  "communities.monday.figure_caption":
    "Un schéma de la page du lundi. Les seuils sont ceux du produit : deux jours de silence ouvrent le décrochage, cinq jours ouvrent le silence, et les deux se mesurent sur leur dernier message entrant. La cohorte est l’exemple ci-dessus — les 150 membres d’une communauté de 500 qui ont pris le palier.",
  "communities.monday.close":
    "Et quand il n’y a pas de quoi dire quelque chose, la page le dit. Un membre qui a répondu deux fois ne vous a pas donné une semaine : il revient en « pas assez de points pour le dire » plutôt qu’en « va bien ».",

  // ── LA VOIX ──────────────────────────────────────────────────────────────
  "communities.voice.kicker": "Votre voix est l’actif",
  "communities.voice.title":
    "Il répond avec vos mots. Pas avec les nôtres, et pas dans un style maison.",
  "communities.voice.body":
    "Vos membres reconnaissent votre écriture au premier coup d’œil, au milieu de n’importe quel contenu santé — et cette reconnaissance est l’essentiel de ce qu’ils paient. Sophia n’a donc pas de personnalité à elle : elle prend votre méthode. Comment vous vous adressez aux gens, la longueur que vous vous donnez, les mots que vous employez et le sens que vous leur donnez, les positions que vous tenez, et ce que vous dites à la place quand on vous demande ce que vous ne recommandez pas. Vous l’écrivez une fois, dans un entretien guidé, et vous relisez ce qu’elle en a compris avant la moindre publication.",

  "communities.fig_voice.alt_title": "Ce que Sophia retient de votre voix",
  "communities.fig_voice.alt_desc":
    "Quatre champs de la doctrine, tels qu’ils sont écrits : la façon dont vous vous adressez aux gens, un terme à vous avec le sens que vous lui donnez, une ligne rouge, et ce que vous dites à la place de cette ligne rouge. La dernière fiche est ouverte par un trait, parce que c’est elle que votre membre reçoit.",
  "communities.fig_voice.screen_title": "Votre voix",
  "communities.fig_voice.address_label": "COMMENT VOUS LEUR PARLEZ",
  "communities.fig_voice.address_value": "Prénom, tutoiement. Deux ou trois phrases. Pas d’emojis.",
  "communities.fig_voice.term_label": "UN DE VOS TERMES",
  "communities.fig_voice.term_value1": "« Jour de reset » — un jour prévu léger exprès.",
  "communities.fig_voice.term_value2": "Pas un jour où l’on a échoué.",
  "communities.fig_voice.line_label": "UNE DE VOS LIGNES ROUGES",
  "communities.fig_voice.line_value": "Ne jamais conseiller de grignoter entre les repas.",
  "communities.fig_voice.instead_label": "ET CE QUE VOUS DITES À LA PLACE",
  "communities.fig_voice.instead_value1": "Trois vrais repas. Si tu as faim entre les deux,",
  "communities.fig_voice.instead_value2": "c’est que le repas d’avant était trop petit.",
  "communities.voice.traceable":
    "Et quand un membre se compose une semaine à partir de votre méthode, chaque ligne nomme la conviction qu’elle applique. La base refuse une ligne qui n’en nomme aucune — c’est une contrainte, pas une convention.",
  "communities.voice.revise":
    "Révisez ce que vous voulez quand vous voulez, et revenez à une version antérieure sans perdre ce que vos membres ont réellement reçu.",
  "communities.voice.close":
    "Ce qui pose la seule question qui vaille, une fois qu’on a confié sa voix à un logiciel : que se passe-t-il le jour où il écrit une phrase que vous n’écririez jamais, devant les gens qui savent comment vous écrivez.",

  // ── LE DOUBLE VERROU ─────────────────────────────────────────────────────
  "communities.lock.kicker": "Ce qui devrait vous faire le plus peur",
  "communities.lock.title":
    "Une IA qui écrit dans votre méthode, à vos propres membres, est un risque. Nous le traitons comme tel.",
  "communities.lock.body":
    "Un prompt est une consigne, pas une garantie. Dites à n’importe quel modèle « ne jamais conseiller de grignoter entre les repas » et il obéira presque toujours — et presque toujours est le mauvais chiffre quand une seule contradiction publique de votre part est la capture d’écran qui finit dans votre propre communauté. Votre méthode est donc tenue deux fois, par deux mécanismes qui échouent différemment.",
  "communities.lock.lock1_tag": "Injectée",
  "communities.lock.lock1":
    "Votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia rédige.",
  "communities.lock.lock2_tag": "Relue",
  "communities.lock.lock2":
    "Ce qu’elle écrit dans le chat est relu contre vos lignes rouges avant d’être envoyé. De façon déterministe, sans modèle dans cette boucle. C’est celui-là, la garantie.",

  "communities.fig_lock.label": "UN MESSAGE, RELU",
  "communities.fig_lock.alt_title": "Ce qui a été retenu, et ce qui est parti",
  "communities.fig_lock.alt_desc":
    "Trois temps, de haut en bas : la question d’un membre, le brouillon que la relecture a retenu parce qu’il contredit une ligne rouge, et le message réellement envoyé — celui que vous avez écrit à la place. Le troisième est ouvert par un trait, parce que c’est le seul que le membre reçoit.",
  "communities.fig_lock.ask_label": "UN MEMBRE DEMANDE",
  "communities.fig_lock.ask_value": "Je peux ajouter une collation entre midi et le dîner ?",
  "communities.fig_lock.draft_label": "LE BROUILLON DISAIT",
  "communities.fig_lock.draft_value": "Une petite collation l’après-midi peut aider.",
  "communities.fig_lock.held": "retenu",
  "communities.fig_lock.sent_label": "CE QUI EST PARTI",
  "communities.fig_lock.sent_value1": "Trois vrais repas. Si tu as faim entre les deux,",
  "communities.fig_lock.sent_value2": "c’est que le repas d’avant était trop petit.",
  "communities.lock.trace_note":
    "Ce remplacement n’est pas le nôtre. Chaque ligne rouge porte ce que vous faites à la place, dans vos mots, et c’est ça que votre membre reçoit.",
  "communities.lock.close":
    "Votre membre ne reçoit jamais un refus, et jamais un « demande dans le groupe » — qui le renverrait droit vers le fil que cette couche existe pour dépasser.",

  // ── LE PRIX ──────────────────────────────────────────────────────────────
  "communities.pricing.kicker": "Le prix",
  "communities.pricing.title": "Une ligne, et seulement pour les membres qui montent.",
  "communities.pricing.seat": "7 €",
  "communities.pricing.seat_period": "par membre et par mois",
  "communities.pricing.seat_label":
    "Pas de forfait de plateforme. Pas de frais de mise en route. Rien d’autre.",
  "communities.pricing.annual": "6 € pour un siège payé à l’année.",
  "communities.pricing.why":
    "Vous payez les membres que vous avez mis sur le palier coaché, et vous arrêtez de payer le mois où vous éteignez un siège. Le reste de votre communauté ne vous coûte rien, parce qu’il n’est pas là.",
  "communities.pricing.no_number":
    "Nous n’avons pas de chiffre de rétention à vous vendre, et nous n’allons pas en inventer un. Le chiffre qui décide de tout ça est le vôtre : ce que vaut, à votre prix, un membre qui reste trois mois de plus.",
  "communities.pricing.trial_note": "14 jours, 3 membres au plus, puis ça s’arrête tout seul.",

  // ── LA CLÔTURE ───────────────────────────────────────────────────────────
  "communities.closing.title":
    "Vous avez déjà les membres, le prix et la méthode. Ce qu’un fil ne peut pas leur donner, c’est une réponse à eux.",
  "communities.closing.cta": "Commencer l’essai de 14 jours",
  "communities.closing.signin_prompt": "Déjà sur Sophia ?",
  "communities.closing.signin_link": "Se connecter",
} as const;
