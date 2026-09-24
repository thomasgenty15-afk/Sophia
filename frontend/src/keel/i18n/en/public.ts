// Seed anglais — le namespace `public`, et lui seul.
// Assemblé dans `../en.ts`; une clé `public.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enPublic = {
  "public.header.sign_in": "Sign in",
  // ⚠️ DEUX GESTES, UN PAR MONDE — et c'est un défaut fermé, pas une option.
  // `start_trial` est l'essai COACH (14 jours, 3 élèves, `/auth?role=coach`).
  // Il était offert sur TOUTES les pages de vente, y compris celles qui vendent
  // à un foyer: on proposait à un parent de créer un compte professionnel
  // payant. `start_household` est le geste du foyer et mène à `/start`.
  // Voir `PublicHeader.tsx`, constante `WORLDS`.
  "public.header.start_trial": "Start free trial",
  "public.header.start_household": "Get started",
  // Short form for the header; the footer keeps the fuller "Legal & privacy".
  "public.header.legal": "Legal",
  "public.locale.label": "Language",
  "public.locale.en": "EN",
  "public.locale.fr": "FR",
  "public.locale.switch_to_en": "Read this site in English",
  "public.language.en":
    "English",
  "public.language.fr":
    "Français",
  "public.locale.switch_to_fr": "Lire ce site en français",
  // Ce que voit quelqu'un de DÉJÀ connecté sur une page publique — typiquement
  // `/legal`, qui est dans la nav du shell. Lui proposer « Sign in » à cet
  // endroit était faux, et ne rien lui proposer en faisait un cul-de-sac.
  "public.header.back_to_app": "Back to my space",
  // ── DEUX MONDES, SIX PORTES ──────────────────────────────────────────────
  // Il y avait trois pages de vente, toutes professionnelles. Il y en a SIX,
  // réparties en deux mondes qui n'ont pas le même acheteur: un foyer qui
  // compose ses repas, un professionnel qui prête sa méthode. Le site a donc
  // deux halls (`/` et `/pro`) et trois portes sous chacun.
  //
  // Les libellés nomment L'ACHETEUR, pas le produit: c'est la seule chose qui
  // permet à quelqu'un de se reconnaître en un mot. D'où « Coaches » et non
  // « Home » pour la page qui vend à qui vend une formation.
  //
  // ⚠️ `public.nav.courses` A ÉTÉ RETIRÉE. Elle nommait `/` — qui vendait au
  // coach jusqu'au 2026-08-12 et vend désormais au foyer. Garder la clé aurait
  // laissé un libellé juste sur une destination fausse, ce qui ne casse aucun
  // test et trompe tous les visiteurs. Son remplaçant est `public.nav.coaches`,
  // qui pointe `/coaches`.
  //
  // Ces clés vivent dans `public.*` et non dans le namespace de chaque page:
  // c'est le seul texte que les six pages partagent VRAIMENT — six libellés de
  // nav qui divergeraient décriraient six sites.
  "public.nav.worlds_label": "Who Sophia is for",
  "public.nav.doors_label": "Pick your situation",

  // ── LES ANCRES DU HALL ───────────────────────────────────────────────
  // Les trois sections de `/`, portées par l'EN-TÊTE depuis le 2026-09-08.
  // ⚠️ SOUS `public.*` ET PAS `home.*`, ET C'EST UNE CONTRAINTE MÉCANIQUE:
  // `PublicHeader` est le chrome de toutes les pages publiques, et
  // `pageSeams.int.test.ts` n'y tolère que `public` et `brand`. Une clé
  // `home.*` lue par l'en-tête ferait « atteindre » le namespace du hall à
  // `/legal`, `/start` et `/join`.
  // ⚠️ Ces liens ne se rendent QUE sur le hall — ailleurs, une ancre vers
  // `#offre` ne mène nulle part.
  "public.nav.sections_label": "Sections of this page",
  "public.nav.experience": "Example",
  "public.nav.household": "Together",
  "public.nav.offer": "Pricing",
  "public.nav.world_household": "For your household",
  "public.nav.world_pro": "For professionals",
  // ⚠️ ON NOMME LA SITUATION, PAS LE SEGMENT (refonte du 2026-08-13).
  // « Meal prep », « Couples », « Families » nommaient nos TRIS. Personne ne
  // se dit « je suis un solo »; tout le monde se reconnaît dans une phrase qui
  // décrit sa cuisine. Le mot de segment reste dans le code, où il désigne une
  // branche réelle du parcours (`FunnelBranch = solo | pair | family`).
  //
  // ⚠️ CES TROIS VALEURS SONT LES MÊMES QUE `home.door.*.label`, et ce n’est pas
  // une duplication qu’on peut « factoriser »: un namespace par page, jamais de
  // clé partagée. Ce qui les tient ensemble est qu’elles se lisent À DEUX
  // CENTIMÈTRES l’une de l’autre — l’onglet de l’en-tête et la porte de la
  // clôture du hall. Les faire diverger se voit sur un seul écran.
  "public.nav.coaches": "Coaches",
  "public.nav.gyms": "Gyms",
  "public.nav.communities": "Communities",
  // ⚠️ LE PIED DE PAGE NE S’ADRESSE À PERSONNE, ET C’EST LA SEULE FORME
  // POSSIBLE (2026-08-13). Il disait « Your method, answering in your absence »,
  // et cette ligne portait DEUX défauts indépendants:
  //
  //   1. LE REGISTRE. Six pages sur huit vouvoient, deux tutoient
  //      (`/meal-prep`, `/coaches`) — et le pied de page est le même sur les
  //      huit. Une ligne par MONDE ne répare rien: `/meal-prep` tutoie et est
  //      un foyer, `/coaches` tutoie et est pro. Le monde et le registre ne se
  //      recouvrent pas.
  //   2. L’ACHETEUR. « Votre méthode » est la promesse PRO, servie telle
  //      quelle sous `/`, `/couples` et `/families`, où le lecteur n’a aucune
  //      méthode et n’a pas à en écrire une.
  //
  // D’où une ligne SANS ADRESSE AU LECTEUR: pas de « vous », pas de « tu »,
  // pas de possessif. Elle reste vraie des deux côtés — la semaine d’une
  // maison est composée d’avance, la méthode d’un pro répond sans lui.
  "public.footer.legal": "Legal & privacy",
  "public.footer.contact": "Contact",
  "public.footer.contact_email": "sophia@sophia-coach.ai",
  // ⚠️ « coaching software » a été retiré le 2026-09-01 — voir la note du pack
  // FR. Elle nommait un seul des deux mondes, et remettait le mot « coach » au
  // pied des quatre pages du foyer, dont aucune ne le prononce.
  "public.footer.copyright": "Sophia — your goal, at the table",

  // ── THE ADVERTISING CONSENT BANNER ───────────────────────────────────────
  // Two buttons of equal weight and no close cross: under French rules (CNIL
  // 2020-091) refusing must cost the same number of clicks as accepting, and a
  // dismissal is neither a yes nor a no. See `analytics/consent.ts`.
  "public.consent.title": "Measuring where you came from",
  "public.consent.body":
    "We would like to know which ad brought you here, so we can stop paying for the ones that do nothing. That needs an advertising cookie, and so your agreement. Refusing changes nothing about what you can do on the site.",
  "public.consent.accept": "Accept",
  "public.consent.refuse": "Refuse",
  "public.consent.learn_more": "What we collect",
} as const
