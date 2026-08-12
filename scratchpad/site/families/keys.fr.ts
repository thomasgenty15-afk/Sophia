// `/families` — le pack FRANÇAIS. 97 clés, mêmes clés que `keys.en.ts`.
//
// À FUSIONNER dans `frontend/src/keel/i18n/fr.public.ts` (l'orchestrateur
// intègre; je n'y touche pas). Ce n'est PAS un calque: c'est une page de vente,
// réécrite pour sonner juste en français. Ce qui ne se traduit pas: la marque
// et les prix (12,99 € / 2 €), qui sont des faits commerciaux.
//
// ── COMPOSITION FRANÇAISE, NON NÉGOCIABLE (CHARTE §3) ─────────────────────
// · Apostrophe typographique ’ (U+2019), jamais '.
// · Espace insécable U+00A0 avant : ; ! ? » € %, et après «.
//   ⚠️ JAMAIS U+202F (espace fine insécable): mesuré SANS GLYPHE dans les
//   fichiers complets de Young Serif et Public Sans, et dans 24 autres
//   familles. Un seul caractère en repli système au milieu d'un mot se voit.
// · Pas de « → » en texte courant: absent des deux familles.

export const familiesFr = {
  "families.seo_title": "Une casserole pour un foyer aux besoins différents",
  "families.seo_description":
    "Sophia compose la semaine du foyer autour de chaque bouche de la table : l’allergie d’une seule gouverne toute la casserole, et quand les contraintes du foyer ne sont pas lisibles, rien n’est composé. 12,99 € par mois pour le foyer entier, jusqu’à huit bouches.",

  // ── Héros ────────────────────────────────────────────────────────────────
  "families.hero.kicker": "Trois bouches à nourrir, ou plus",
  "families.hero.title":
    "L’allergie d’une seule bouche gouverne toute la casserole.",
  "families.hero.lede":
    "Une casserole pour toute la table. L’exception ne se rattrape pas au moment de servir : les contraintes de toutes les bouches sont réunies avant que le plan existe, et si cette union ne peut pas être lue, rien n’est composé. Sophia refuse plutôt que de deviner.",
  "families.hero.cta": "Créer votre foyer",
  "families.hero.price_note":
    "12,99 € par mois, le foyer entier. Une bouche de plus ne change pas le prix.",

  "families.fig_pot.label": "LA TABLE GOUVERNE LA CASSEROLE",
  "families.fig_pot.a11y_title": "Les bouches du foyer, et la casserole",
  "families.fig_pot.a11y_desc":
    "Quatre bouches sont listées avec leurs allergies. Une seule porte une contrainte. Les quatre lignes se rassemblent en un seul trait qui entre dans la casserole : toute la casserole est composée sans cet aliment.",
  "families.fig_pot.col_mouths": "LES BOUCHES",
  "families.fig_pot.col_allergies": "ALLERGIES",
  "families.fig_pot.m1": "Vous",
  "families.fig_pot.m2": "Sami, 9 ans",
  "families.fig_pot.m2_allergy": "arachide",
  "families.fig_pot.m3": "Inès, 6 ans",
  "families.fig_pot.m4": "Jo",
  "families.fig_pot.none": "aucune",
  "families.fig_pot.pot_label": "TOUTE LA CASSEROLE",
  "families.fig_pot.pot_value": "composée sans arachide",

  // ── Le refus ─────────────────────────────────────────────────────────────
  "families.refusal.kicker": "Le refus",
  "families.refusal.title": "Quand la maison n’est pas lisible, rien n’est composé.",
  "families.refusal.body":
    "Les allergies de chaque bouche sont réunies en une seule contrainte, lue au moment où la semaine se fabrique. Si elle ne peut pas être lue, la fabrication s’arrête et nomme la raison. Elle ne compose pas une version prudente, elle ne prend pas le milieu des cas : elle s’arrête. C’est le sens de fail-closed — ici, le défaut, c’est le refus.",
  "families.refusal.line":
    "Un plan qui manque se redemande. Un plan qui a supposé se mange.",

  "families.fig_gate.label": "AVANT QUE LA SEMAINE EXISTE",
  "families.fig_gate.a11y_title": "Les deux sorties de la génération",
  "families.fig_gate.a11y_desc":
    "Les contraintes du foyer sont lues avant que la semaine se compose. Si elles sont lisibles, la semaine se compose. Si elles ne le sont pas, rien n’est composé et la génération s’arrête en nommant la raison.",
  "families.fig_gate.in_label": "LES CONTRAINTES",
  "families.fig_gate.in_value": "de toutes les bouches",
  "families.fig_gate.ok_label": "LISIBLES",
  "families.fig_gate.ok_value": "la semaine se compose",
  "families.fig_gate.no_label": "ILLISIBLES",
  "families.fig_gate.no_value": "rien n’est composé",
  "families.fig_gate.code": "safety_constraints_unreadable",

  // ── Les bouches sans compte ──────────────────────────────────────────────
  "families.mouths.kicker": "Les bouches sans compte",
  "families.mouths.title": "Vos enfants sont dans le plan. Ils n’ont ni compte, ni écran.",
  "families.mouths.body":
    "Une bouche existe par ce que vous en écrivez : prénom, date de naissance, objectif, allergies. C’est tout ce qu’on demande, et c’est vous qui l’écrivez — pas de mot de passe à créer pour un enfant de six ans, pas de profil à lui faire remplir, pas un écran de plus dans la maison.",

  "families.fig_sheet.label": "UNE BOUCHE, QUATRE CHAMPS",
  "families.fig_sheet.a11y_title": "Ce qu’on demande pour une bouche, et qui a un compte",
  "families.fig_sheet.a11y_desc":
    "À gauche, les quatre champs demandés pour ajouter une bouche : prénom, date de naissance, objectif, allergies. À droite, trois bouches du foyer : une seule a un compte, les deux autres existent dans le plan sans compte ni écran.",
  "families.fig_sheet.asked": "CE QU’ON DEMANDE",
  "families.fig_sheet.f1": "prénom",
  "families.fig_sheet.f2": "date de naissance",
  "families.fig_sheet.f3": "objectif",
  "families.fig_sheet.f4": "allergies",
  "families.fig_sheet.m1": "Vous",
  "families.fig_sheet.m2": "Sami, 9 ans",
  "families.fig_sheet.m3": "Inès, 6 ans",
  "families.fig_sheet.has_account": "UN COMPTE",
  "families.fig_sheet.no_account": "SANS COMPTE",
  "families.fig_sheet.caption": "ni compte, ni écran, ni mot de passe à retenir",

  // ── Les parts ────────────────────────────────────────────────────────────
  "families.portions.kicker": "Les parts",
  "families.portions.title": "La part suit l’âge. Un enfant n’est jamais mis au régime.",
  "families.portions.body":
    "Un mineur n’est jamais une cible : la règle tient dans la structure, pas dans une consigne de rédaction. Le champ « objectif » existe pour tout le monde, et une génération qui viserait un mineur est refusée — pas d’écran, pas de réglage, pas de chemin pour la contourner. La part d’un enfant suit son âge, et c’est tout ce qu’elle suit.",

  "families.fig_age.label": "LA PART SUIT L’ÂGE",
  "families.fig_age.a11y_title": "Deux parts du même plat, et un objectif qui ne s’applique pas",
  "families.fig_age.a11y_desc":
    "Deux assiettes reçoivent le même plat. À côté de la première, un adulte dont l’objectif s’applique. À côté de la seconde, un mineur : aucun objectif ne le vise, et la figure ne dessine aucune différence de taille.",
  "families.fig_age.adult_label": "UN ADULTE",
  "families.fig_age.adult_value": "son objectif s’applique",
  "families.fig_age.adult_note": "la part suit ce qu’il vise",
  "families.fig_age.minor_label": "UN MINEUR",
  "families.fig_age.minor_value": "aucun objectif ne le vise",
  "families.fig_age.minor_note": "la part suit son âge, et rien d’autre",

  // ── L'envie de la semaine ────────────────────────────────────────────────
  "families.envy.kicker": "L’envie de la semaine",
  "families.envy.title":
    "Vous écrivez en une ligne ce dont la maison a envie. Le plan compose avec.",
  "families.envy.body":
    "Une ligne, écrite par la personne qui tient le foyer, lue par le générateur au moment où la semaine se compose. Ce n’est pas un vote et ce n’est pas un formulaire : c’est une phrase, et elle vaut pour toute la maison. C’est là que se règle « ma famille ne mangera pas ça », et pas dans un filtre de plus.",

  "families.fig_envy.label": "UNE LIGNE, PUIS LA SEMAINE",
  "families.fig_envy.a11y_title": "Une ligne d’envie, et la semaine qui se compose avec",
  "families.fig_envy.a11y_desc":
    "Un champ d’une seule ligne, écrit par la personne qui tient le foyer. Le trait se répartit vers les sept jours de la semaine : le générateur lit cette ligne au moment de composer.",
  "families.fig_envy.field_label": "ÉCRITE PAR VOUS, EN UNE LIGNE",
  "families.fig_envy.line": "« Cette semaine, on a envie de plats qui se partagent. »",
  "families.fig_envy.caption": "le générateur compose la semaine avec cette ligne",

  // ── Le prix ──────────────────────────────────────────────────────────────
  "families.price.kicker": "Le prix",
  "families.price.title": "12,99 € le foyer. Pas par bouche.",
  "families.price.amount": "12,99 €",
  "families.price.period": "par mois, le foyer entier",
  "families.price.label": "Jusqu’à huit bouches. La vôtre n’est jamais comptée.",
  "families.price.body":
    "Ajouter une bouche ne change pas le prix, et le foyer est plafonné à huit. Un adulte qui veut son propre accès prend un profil réclamé, à 2 € par mois : c’est le seul supplément qui existe. Le produit ne vous fait pas payer d’être une famille.",

  "families.fig_price.label": "LE PRIX SUIT LE FOYER",
  "families.fig_price.a11y_title": "Huit places, un seul prix",
  "families.fig_price.a11y_desc":
    "Huit emplacements de bouche alignés. Le premier est le vôtre et n’est jamais compté. Le prix inscrit dessous ne change pas quand les emplacements se remplissent.",
  "families.fig_price.you": "VOUS",
  "families.fig_price.not_counted": "JAMAIS COMPTÉ",
  "families.fig_price.cap": "PLAFOND : 8 BOUCHES",
  "families.fig_price.amount": "12,99 €",
  "families.fig_price.note": "à une bouche comme à huit",

  // ── Ce qu'on ne promet pas ───────────────────────────────────────────────
  "families.limits.kicker": "Ce qu’on ne promet pas",
  "families.limits.title": "Ce que Sophia ne fait pas pour votre foyer.",
  "families.limits.i1":
    "La garde des allergies porte sur ce qui se fabrique : la semaine, le repas. Une réponse écrite dans le chat, elle, ne relit pas l’union des contraintes du foyer — c’est pour ça que le mot « partout » n’est écrit nulle part sur cette page.",
  "families.limits.i2":
    "Aucune courbe de poids pour une bouche du foyer : ce qui s’écrit s’écrase, sans date et sans série. Il n’y a rien à suivre.",
  "families.limits.i3":
    "Les chiffres restent éteints par défaut, et il faut passer plusieurs verrous pour les allumer. Rien ne s’affiche en chiffres tant que vous ne l’avez pas demandé.",
  "families.limits.i4":
    "Il n’y a pas de conseil de famille : personne ne vote, et le plan ne vous rend pas compte de ce qu’il a fait de votre ligne.",
  "families.limits.i5": "Pas d’application mobile : Sophia s’ouvre dans un navigateur.",
  "families.limits.i6":
    "Sophia ne remplace ni la lecture d’une étiquette, ni l’avis d’un médecin. Elle compose des repas ; elle ne soigne personne et ne diagnostique rien.",

  // ── La sortie ────────────────────────────────────────────────────────────
  "families.closing.kicker": "Commencer",
  "families.closing.title": "Créez votre foyer, une bouche à la fois.",
  "families.closing.body":
    "Pour chaque bouche, on demande quatre choses : prénom, date de naissance, objectif, allergies. Vous les écrivez une fois ; elles gouvernent la casserole ensuite.",
} as const;
