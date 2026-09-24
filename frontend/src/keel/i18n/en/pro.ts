// Seed anglais — le namespace `pro`, et lui seul.
// Assemblé dans `../en.ts`; une clé `pro.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enPro = {
  //
  // ── LE VOCABULAIRE DE CETTE PAGE, ET C'EST UN PIÈGE ──────────────────────
  // Le générique est « pros ». Les gens qu'ils accompagnent sont des CLIENTS
  // ici — « students » est le mot de `/coaches` SEULEMENT, là où quelqu'un a
  // choisi un coach pour apprendre de lui. L'ancien `pro.proof.title` disait
  // « student » sur ce hall: c'est corrigé par sa suppression.
  // ⛔ « personalised follow-up » reste interdit partout. ⛔ Jamais « your
  // team »: une salle à trois coachs est UN compte (B20).
  "pro.seo_title": "Sophia for professionals — your method, answering every day",
  "pro.seo_description":
    "Record your method once; Sophia answers your clients with it, in chat and in every week and meal it writes. €7 per client per month.",

  "pro.hero.kicker": "For people who sell a method, not hours",
  "pro.hero.title": "Your method, working on the days you are not there.",
  "pro.hero.lede":
    "Coaches, gyms, paid communities — five things that have to hold when you are not there.",
  "pro.hero.cta": "Start the 14-day trial",
  // B5 (14 jours / 3 clients) + B1 (le siège est le seul poste).
  "pro.hero.note":
    "14 days, up to 3 clients, then it stops on its own. After that, €7 per client per month.",

  "pro.lines.kicker": "The whole product",
  // ⚠️ « Six pains » se lit comme une plainte médicale en anglais — et surtout,
  // personne ne se dit « j’ai six douleurs ». C’était le nom de NOTRE grille,
  // servi au lecteur.
  // ⚠️ CINQ, ET C'ÉTAIT « SIX » JUSQU'AU 2026-08-19. Le compte n'est pas un
  // effet de style: la grille en dessous rend exactement autant de lignes, et
  // un titre qui en promet une de plus est la première phrase fausse de la
  // page. La ligne 05 « chaque ligne cite la conviction qu'elle applique »
  // (B27) a été retirée le 2026-08-19 avec ses clés — voir le bloc juste en
  // dessous et le commentaire à sa place dans `ProPage.tsx`. Le `lede` du hero
  // porte le même compte, et il a bougé avec.
  "pro.lines.title": "Five places it breaks without you. Five answers.",

  // ── ⛔ `pro.line.cite.*` — RETIRÉES LE 2026-08-19, ET ELLES NE REVIENNENT
  // PAS REFORMULÉES ─────────────────────────────────────────────────────────
  // Elles portaient B27, « chaque ligne cite la conviction qu'elle applique »,
  // adossé au CHECK `student_week_plans_doctrine_traceable_check`. Vérifié le
  // 2026-08-19: le CHECK existe TOUJOURS et il est armé — et il n'a plus aucun
  // écrivain, la lane `generate-week-plan-v1` ayant été retirée le même jour
  // faute d'un seul appelant vivant. Il ne reste que des LECTEURS
  // (`following_io`, `coach_synthesis_io`, `hunger_signal_io`, l'export RGPD).
  //
  // ⛔ ET PAS D'ÉQUIVALENT SUR LES PLATS. Sur la seule lane vivante,
  // `honours_belief_keys` est INFORMATIF par arbitrage produit du 2026-08-04
  // (« un plat est une application libre », `meal_generation.ts`): aucun CHECK
  // ne l'exige, et un plat qui invente une clé est CONSERVÉ, sa clé jetée
  // (`meal_generation_test.ts`, « an invented conviction key is dropped but
  // does NOT cost the dish »). Mesuré en base le 2026-08-19: 1 598 plats sur
  // 1 816 citent au moins une conviction — 88 %, et 31 plans sur 179 n'en
  // citent aucune. « Chaque ligne » n'est donc pas vrai, et le rendre vrai
  // serait vendre CONTRE le modèle produit, pas le rattraper.
  //
  // La règle qui en sort: une page de vente ne redit cette garantie que le
  // jour où un CHECK la tient.

  // 01 — la seule page du site qui dit que la méthode peut être la nôtre.
  "pro.line.method.pain":
    "What has to be said every day cannot depend on your being there.",
  "pro.line.method.title": "A method recorded once, then it answers.",
  "pro.line.method.body":
    "Yours — or ours, if you have none of your own. That path is built; the house method itself is still being written.",

  // 02 — B10, quatre points d'injection.
  "pro.line.daily.pain": "Your clients have questions between two sessions.",
  "pro.line.daily.title": "Daily support, held by your method.",
  "pro.line.daily.body":
    "It reaches three places: the chat, the meal they cook, and the one they cook for a table.",

  // 03 — FORMULATION B8b, IMPOSÉE. « Chaque message sortant est vérifié » est
  // faux (4 surfaces scannées, 4 non scannées) et « la doctrine entre à chaque
  // message » aussi (un seul appelant). Ceci est vrai.
  "pro.line.lock.pain": "An AI that speaks for you will contradict you.",
  "pro.line.lock.title": "The double lock.",
  "pro.line.lock.body":
    "Your method goes into the chat, into every week and into every meal; and what it writes in the chat is read back against your red lines before it is sent — with no model in that loop.",

  // 04 — B11 (cron du lundi, texte rendu par gabarit) · B14 (48 h / 120 h) ·
  // B17 (cohortes scopées).
  "pro.line.monday.pain":
    "You find out a client dropped off once they have gone.",
  "pro.line.monday.title": "Monday, in one page.",
  "pro.line.monday.body":
    "Who answered, who went quiet after two days, who has been silent for five. Computed, never written by a model — and only your own clients.",

  // ⚠️ LA LIGNE 05 (B27, « chaque ligne cite la conviction ») A ÉTÉ RETIRÉE LE
  // 2026-08-19, AVEC SES TROIS CLÉS. Elle vendait une garantie adossée au CHECK
  // `student_week_plans_doctrine_traceable_check`, tenu par la lane de semaine
  // — retirée le même jour faute d'un seul appelant. La garantie n'était donc
  // déjà tenue pour personne. ⛔ NE PAS LA REFORMULER: aucune copie ne doit
  // annoncer une traçabilité par ligne tant qu'aucun CHECK ne la tient. Les
  // plats portent `generated_from.belief_keys`, à l'échelle du PLAN, informatif
  // et jamais vérifié.
  // 05 — B1, B4.
  "pro.line.seat.pain": "Platforms bill you by tier.",
  // « poste » = *line item*. « line » seul ne veut rien dire ici.
  "pro.line.seat.title": "The seat is the only line item.",
  "pro.line.seat.body":
    "€7 per client per month. Turn a seat off and it stops being billed that month. No platform fee.",

  // La figure — géométrie et libellés MESURÉS dans les deux langues, gardés
  // tels quels de la version du 2026-08-12.
  "pro.fig.alt":
    "Your method and your red lines go in; what crosses a line is held and replaced before it is sent.",
  "pro.fig.method": "YOUR METHOD",
  "pro.fig.method_2": "written once",
  "pro.fig.lines": "YOUR RED LINES",
  "pro.fig.lines_2": "and what you do instead",
  "pro.fig.check": "checked",
  "pro.fig.sent": "SENT",
  "pro.fig.held": "HELD",
  "pro.fig.held_2": "in your words",
  "pro.fig.caption":
    "An instruction is followed almost always. A check is not an instruction: it runs on what is about to leave.",

  // B31 — à conserver verbatim, la meilleure ligne des trois anciennes pages.
  "pro.close.title":
    "We have no retention figure to sell you, and we are not going to invent one.",
  "pro.close.body":
    "Nothing here measures churn against a control, so a number printed here would be decoration.",
  "pro.close.cta": "Start the 14-day trial",

  // ⚠️ « practice » EXCLUT LA SALLE: une salle indépendante n’en est pas une,
  // et c’est exactement le recadrage de segment de ce chantier. Le français
  // disait déjà « métiers ».
  "pro.doors.title": "Three trades, three pages.",
  "pro.door.coaches.title": "You sell a course",
  // ⚠️ CETTE CARTE CITAIT LE H1 DE `/coaches` À UN REGISTRE PRÈS: la même
  // phrase, deux adresses, à un clic d’écart. Le registre de chaque page est un
  // arbitrage tenu (en-tête de `fr.ts`); ce qu’il ne supporte pas, c’est la MÊME
  // phrase des deux côtés de la porte. La carte dit donc ce qu’on y trouve, pas
  // ce que la page dira.
  "pro.door.coaches.body": "What you could only sell once, billed every month.",
  "pro.door.coaches.cta": "See it for a course",
  "pro.door.gyms.title": "You run an independent gym",
  "pro.door.gyms.body": "Three hours a week with you; twenty-one meals without.",
  "pro.door.gyms.cta": "See it for a gym",
  "pro.door.communities.title": "You run a paid community",
  "pro.door.communities.body":
    "A thread has no recipient. This is the individual layer underneath.",
  "pro.door.communities.cta": "See it for a community",
} as const
