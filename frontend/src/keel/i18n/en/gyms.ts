// Seed anglais — le namespace `gyms`, et lui seul.
// Assemblé dans `../en.ts`; une clé `gyms.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enGyms = {
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ L'ACHETEUR A CHANGÉ. Ce namespace parlait à une salle QUI COACHE — « you
  // coach three hours a week », « it only works if the method is yours ». La
  // grille des douleurs a recadré le segment: une salle vend une salle, PAS une
  // méthode, et ses clients n'ont pour la plupart AUCUN coach. Le mécanisme
  // « accompagner un client de salle après ses trois heures » a été retiré du
  // plan pour cette raison exacte.
  //
  // D'où, dans ce pack: on dit des CLIENTS (« élèves » est le mot de `/coaches`
  // seulement), jamais « votre équipe » (une salle à trois coachs est UN compte,
  // B20), et la salle ne prête pas de méthode — elle DÉLÈGUE (`gyms.house.*`).
  //
  // ⛔ TROIS CLAIMS SONT RETIRÉS DE CE NAMESPACE. Ne pas les réécrire:
  //   · « 6 € quand votre membre a payé son année » — FAUX, l'intervalle annuel
  //     est celui du COACH (B2). La bonne phrase est `gyms.price.annual`.
  //   · « quelles convictions vos clients tiennent ou lâchent » — rien ne le
  //     calcule (B16).
  //   · « c'est votre nom sur les messages » — aucune personnalisation de marque
  //     n'existe (B18), et aucun white-label (B19).
  // ══════════════════════════════════════════════════════════════════════════
  "gyms.seo_title": "Sophia for gyms — the nutrition tier you don’t have to write",
  "gyms.seo_description":
    "Your clients train seriously and eat at random. Sophia is a nutrition tier above the membership: an agent answers every client you enrol, every day, and you write nothing — you delegate to Sophia’s method, and the agent signs Sophia’s name, never yours. €7 per enrolled client, per month.",

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 1 · DOULEUR 01 — « mes clients s'entraînent sérieusement et
  // mangent au hasard ». Besoin: que la moitié qui décide du résultat soit
  // couverte, SANS embaucher un nutritionniste.
  //
  // Deux anciennes sections se replient ici, et pas en bandes à part:
  //   · `daily` — « il est réveillé à neuf heures un mardi soir » EST ce que
  //     « tenu chaque jour » veut dire, donc c'est une preuve de la réponse,
  //     pas un argument séparé.
  //   · `money` — le revenu n'est pas une douleur, c'est ce qui rend la
  //     réponse achetable. Le prix comme OFFRE vit en bande 4.
  //
  // « vingt et un repas » est de l'arithmétique du monde (3 × 7), pas une
  // mesure du dépôt. ⚠️ Le titre ne dit plus « VOUS coachez trois heures »:
  // la salle ne coache pas, le client s'entraîne.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.hero.eyebrow": "For independent gyms — boxes, strength halls, hybrid studios",
  "gyms.hero.title": "They train seriously. They eat at random.",
  "gyms.hero.lede":
    "Three hours a week in your room, and twenty-one meals where nobody is asking. That half decides what the mirror shows — and a client who stops seeing their body change does not argue, they just stop coming. Sophia is a nutrition tier above your membership: an agent answers every client you enrol, every day. Nobody writes a menu, and nobody hires a nutritionist.",
  "gyms.hero.cta": "Start the 14-day trial",
  // fact: B5 — 14 jours, 3 sièges, puis ça s'arrête tout seul.
  "gyms.hero.trial_note": "14 days, up to 3 clients, then it stops on its own.",

  // Figure 1 — la semaine d'un CLIENT (et non plus « ce que la salle coache »).
  // Concept, 480×240. Les 21 repas sont la pièce chaude; COMPTABLES et non
  // proportionnels — aucune forme n'affirme une mesure que le produit ne
  // calcule pas.
  "gyms.fig.week_t": "One client’s week: three sessions in the room, twenty-one meals elsewhere",
  "gyms.fig.week_d":
    "A week drawn as marks. The top row is the three sessions in the gym. The bottom row is the twenty-one meals that happen where the gym is not.",
  "gyms.fig.week_label": "ONE CLIENT’S WEEK",
  "gyms.fig.week_row1": "THREE HOURS IN THE ROOM",
  "gyms.fig.week_row2": "TWENTY-ONE MEALS, EVERYWHERE ELSE",

  // « Tenu chaque jour », et ce que ça veut dire concrètement.
  // fact: B10 — la doctrine atteint QUATRE points d'injection; trois sont
  // nommés ici (chat, semaine, repas). Ne pas écrire « chaque message ».
  "gyms.day.title": "It is awake at nine on a Tuesday evening. You are at home.",
  "gyms.day.body":
    "A client asks their question when they have it, and the answer is built from the method behind their account — in the chat, and in every meal Sophia writes.",

  // L'arithmétique. B30: l'exemple est juste ET étiqueté « exemple ». Les deux
  // ensemble sont ce qui le rend crédible — retirer l'étiquette en ferait une
  // prévision.
  //   250 × 15 % = 37,5 puis 37 (ARRONDI VERS LE BAS: une personne n'est pas
  //   divisible, et arrondir vers le haut flatterait notre côté)
  //   37 × 25 € = 925 €  |  37 × 7 € = 259 €  |  925 − 259 = 666 €  |  ×12 ≈ 8 000 €
  // Si l'un de ces nombres bouge, les cinq autres bougent avec.
  "gyms.money.title": "You sell it. You set the price.",
  "gyms.money.body":
    "You pay €7 for each client you enrol, and you decide what the tier costs on your side of the counter. No platform fee, no setup, and you stop paying the month you turn a seat off.",
  "gyms.money.caption":
    "An example, and it says so: we do not know your take-up or the price you would set, and those are the two numbers that decide the total.",
  // fact: B31 — à conserver VERBATIM. Rien dans le dépôt ne mesure le churn
  // contre un témoin, et c'est ici qu'un chiffre de rétention inventé aurait le
  // plus de valeur commerciale.
  "gyms.money.close":
    "What you are buying is months of membership. What is one client who stays three months longer worth to you? That is the number to put against €7, and it is yours, not ours: we have no retention figure to sell you, and we are not going to invent one.",

  // Figure 2 — l'exemple chiffré. Document vu de face, 480×240. Ce n'est PAS
  // une maquette: aucun écran ne rend cette addition.
  "gyms.fig.money_t": "A worked example for a gym with 250 clients",
  "gyms.fig.money_d":
    "Four lines of arithmetic. Thirty-seven clients at €25 each is €925 in; seven euros each to Sophia is €259 out; €666 stays with the gym.",
  "gyms.fig.money_label": "AN EXAMPLE — A GYM WITH 250 CLIENTS",
  "gyms.fig.money_uptake_label": "On the nutrition tier",
  "gyms.fig.money_uptake_value": "37 clients",
  "gyms.fig.money_uptake_hint": "15% take it up, rounded down to whole people",
  "gyms.fig.money_in_label": "They pay you €25 each",
  "gyms.fig.money_in_value": "€925",
  "gyms.fig.money_out_label": "You pay Sophia €7 each",
  "gyms.fig.money_out_value": "− €259",
  "gyms.fig.money_keep_label": "You keep, every month",
  "gyms.fig.money_keep_value": "€666",
  "gyms.fig.money_keep_hint": "about €8,000 a year",

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 2 · DOULEUR 02 — « je les perds sans les voir partir ». Besoin:
  // savoir qui décroche pendant qu'il est encore joignable.
  //
  // fact: B11 — cron '0 6 * * 1', `renderSynthesisText` est une fonction PURE:
  //   aucun modèle ne narre cette page.
  // fact: B14 — seuils 48 h / 120 h, mesurés sur le dernier ENTRANT.
  // fact: B17 — la cohorte est scopée par coach.
  // ⛔ S9/B15 — aucune bande de risque, aucune tuile « on track », aucun score
  //   d'adhérence. Le seul « chiffre » de la figure est son ABSENCE, citée mot
  //   pour mot (`coach.weekly.no_number`).
  // ⚠️ Rien ici ne PRÉTEND citer la synthèse. B13 est le défaut à ne pas
  //   refaire: paraphraser en annonçant du verbatim. Ce qui est cité l'est dans
  //   la figure, et seulement des libellés d'écran vérifiés.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.monday.eyebrow": "Every Monday",
  "gyms.monday.title": "The names worth a message, while you can still reach them.",
  "gyms.monday.body":
    "One page, computed from what happened and rendered from a template. No model narrates it, which is why it cannot flatter you. A client who wrote in the last two days is in touch; past two days they are slipping; past five they are silent — counted from their last message in, not from ours out.",
  "gyms.monday.close":
    "Slipping is the useful state: they are still reachable, and a message from you still lands. Your access log will tell you the same thing in six weeks, and by then the word is former client.",
  "gyms.monday.scope": "You see the clients you enrolled, and nobody else’s.",
  "gyms.monday.fig_caption":
    "A schematic of that page. The names are invented; the heading, the reasons and the states are the product’s own words.",

  // Figure 3 — le lundi. MAQUETTE DE PRODUIT, 480×248, chaque chaîne citée mot
  // pour mot (S10). Ces clés NE SE TRADUISENT PAS: l'app authentifiée est en
  // anglais, et une capture traduite montrerait un écran qui n'existe pas.
  "gyms.fig.monday_t": "The Monday page: the clients worth a message",
  "gyms.fig.monday_d":
    "Three clients worth a message, each with the observed reason and their contact state — and, on the third, a plain statement that there is no number to show.",
  "gyms.fig.monday_app": "This week", // coach.weekly.title, CoachWeeklyPage.tsx:192
  "gyms.fig.monday_worth": "WORTH A MESSAGE", // coach.weekly.flagged_title, rendu en capitales par `SectionLabel`
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "Going quiet", // coach.flag.slipping_contact
  "gyms.fig.monday_s1": "Going quiet", // coach.weekly.contact.slipping — ⚠️ le JETON BRUT n'atteint jamais l'écran: `CoachWeeklyPage.tsx:92-95` rend `contactLabel(state)`
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "Has not written in days", // coach.flag.silent_5d
  "gyms.fig.monday_s2": "Silent", // coach.weekly.contact.silent — même raison
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "Barely logged anything", // coach.flag.coverage_below_gate
  "gyms.fig.monday_s3": "no number to show", // coach.weekly.no_number

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 3 · DOULEUR 03 — « je n'ai pas de méthode à prêter, et pas la
  // légitimité d'en écrire une ». Besoin: que ça marche sans que je rédige
  // quoi que ce soit. C'EST LE SEUL ARGUMENT NEUF DE LA PAGE.
  //
  // ⚠️ C'est l'ancienne section `fit` RETOURNÉE. Elle disait « ça ne marche que
  // si la méthode est la vôtre » — vrai pour un coach, faux pour une salle, qui
  // n'a pas de méthode à prêter. Elle dit maintenant son contraire.
  //
  // fact: `coaches.doctrine_source = 'house'` — migration
  //   20260806230000_doctrine_delegation.sql · `_shared/keel/doctrine_delegation.ts`
  //   Bascule dans les DEUX sens (`coach-doctrine-v1`, action
  //   `set_doctrine_source`; écran `DoctrineStartDialog.tsx`).
  // fact: câblé aux DEUX endroits qui signent — `doctrine_loader.ts:362` (le
  //   bloc de prompt et la substitution du verrou) et
  //   `keel-coach-broadcast-v1:111` (le message de cohorte). Un seul des deux
  //   suffirait à donner DEUX identités au même client la même semaine.
  // fact: B20 — une salle à trois coachs est UN compte. ⛔ Jamais « votre équipe ».
  // ⏳ Le chemin existe; le CONTENU de cette doctrine est en cours
  //   d'établissement. `gyms.house.reserve` le dit, et il n'est pas négociable:
  //   une page qui promet une méthode maison déjà écrite ment aujourd'hui.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.house.eyebrow": "Nothing to write",
  "gyms.house.title": "You don’t have a method to lend. You don’t need one.",
  "gyms.house.body":
    "A gym sells a gym, not a doctrine, and inventing standing you do not have is the worst thing you could do with an agent. So you delegate: your clients are followed by Sophia’s own method, and the agent says so — it signs “Sophia”, never your name.",
  "gyms.house.sign_title": "One name, everywhere a name appears.",
  "gyms.house.sign_body":
    "The conversation and the weekly note to your cohort read the same answer to “who signs this”. A client never meets two identities.",
  "gyms.house.one_title": "One account, one signature.",
  "gyms.house.one_body":
    "A gym with three coaches is one account. There is no gym entity above it and no roster inside it.",
  "gyms.house.reserve":
    "Two things before you switch it on. It reverses: turn delegation off and the agent signs your name again and serves whatever you have published — nothing you wrote is deleted meanwhile. And the house method is being written right now, so what you turn on today is the delegation, not a finished library.",

  // Figure 4 — la délégation et la signature. CONCEPT sur fond sombre, 480×220.
  // Une maquette de produit ne se pose JAMAIS sur du sombre (le produit est en
  // clair; un écran sombre montrerait un produit qui n'existe pas) — celle-ci
  // est un schéma, donc elle a le droit d'y être. `.on-dark` remonte la pièce
  // chaude de 2,4:1 à 8,06:1.
  "gyms.fig.house_t": "Delegation: the gym writes nothing, and one name signs both surfaces",
  "gyms.fig.house_d":
    "On the left, the gym’s own method: an empty card. Two branches lead from it to the two places a client meets a name, and both are signed Sophia.",
  "gyms.fig.house_label": "WHO SIGNS",
  "gyms.fig.house_gym": "YOUR GYM",
  "gyms.fig.house_gym_v": "nothing written",
  "gyms.fig.house_s1": "THE CONVERSATION",
  "gyms.fig.house_s2": "THE WEEKLY NOTE",
  "gyms.fig.house_sign": "— Sophia",

  // ══════════════════════════════════════════════════════════════════════
  // BANDE 4 · LE PRIX ET LA CLÔTURE, fusionnés. Un seul CTA, le même qu'en
  // haut, vers `/auth?role=coach`.
  //
  // fact: B1 — 7 €/client/mois, le siège est le seul poste, aucun forfait
  //   plateforme. Le montant vit dans `STRIPE_PRICE_ID_COACH_SEAT_MONTHLY`.
  // fact: B3 — « 6 € pour un SIÈGE payé à l'année ». ⛔ Jamais « quand votre
  //   membre a payé son année » (B2, FAUX: l'intervalle est celui du coach).
  // fact: B4 — `stripe-reconcile-seats` RECALCULE depuis le registre, il
  //   n'incrémente jamais: on arrête de payer le mois où on éteint un siège.
  // fact: B6 — un compte à ZÉRO client est refusé au checkout
  //   (`no_billable_seat`), d'où « le premier siège vient avant la facture ».
  // fact: S12 — aucun SKU client dans `stripe-create-checkout-session`: on ne
  //   facture jamais le client, et `billing_note` le dit à voix haute.
  // ══════════════════════════════════════════════════════════════════════
  "gyms.price.eyebrow": "Pricing",
  "gyms.price.title": "€7 a client. You set what they pay.",
  "gyms.price.seat_period": "per enrolled client, per month",
  "gyms.price.seat_label": "No platform fee. No setup. Nothing else.",
  "gyms.price.annual": "€6 for a seat paid a year up front.",
  "gyms.price.why":
    "You pay for the seats you have opened, and you stop paying the month you turn one off. Subscribing needs at least one enrolled client, so the first seat comes before the first invoice.",
  "gyms.price.billing_note":
    "You bill your clients yourself, on whatever you already use for the membership. Sophia never touches their payment.",
  "gyms.price.cta": "Start the 14-day trial",
  "gyms.price.trial_note": "14 days, up to 3 clients, then it stops on its own.",
  "gyms.close.line": "You run the training. This is the other twenty-one meals.",
} as const
