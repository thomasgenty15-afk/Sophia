// ===========================================================================
// /gyms — LE PACK DE CLÉS ANGLAIS. Namespace `gyms`, à fusionner dans
// `frontend/src/keel/i18n/en.ts` par l'orchestrateur.
//
// L'acheteur : le PROPRIÉTAIRE d'une salle indépendante (box, salle de force,
// studio hybride). Sa douleur est le CHURN — l'abonné vient pour changer de
// corps, ne voit rien changer dans son assiette, et part.
//
// ── TROIS CLAIMS FAUX ONT ÉTÉ RETIRÉS DE CETTE PAGE, NE PAS LES RÉÉCRIRE ───
//  1. B2 — « 6 € quand votre membre a payé son année ». L'intervalle annuel est
//     celui du COACH (`stripe-create-checkout-session:124-125` lit
//     `body.interval`, posé par les boutons du coach). Un gérant qui lit ça
//     construit une offre annuelle sur une remise qu'il ne peut pas déclencher.
//     Remplacé par B3 : « 6 € pour un siège payé à l'année » (`gyms.price.annual`).
//  2. B16 — « quelles parties de votre méthode vos membres tiennent, lesquelles
//     ils lâchent, à quelle saison ». RIEN ne calcule ça : `source_belief_key`
//     n'a qu'un seul lecteur dans le front, et c'est la semaine de l'ÉLÈVE
//     (`weekPlan.ts:36-37`). Supprimé sans remplacement.
//  3. B18 — « c'est votre nom sur les messages que vos membres lisent ». Faux :
//     l'agent s'appelle Sophia partout, et il n'existe AUCUNE personnalisation
//     de marque — ni colonne, ni écran, ni chaîne. Le nom du coach apparaît à
//     deux endroits seulement, dont la substitution du verrou 2 : c'est ce que
//     `gyms.lock.instead` dit, et rien de plus. Ne pas dériver vers le
//     white-label (B19), qui n'a jamais été réclamé.
//
// ── LES AUTRES INTERDITS QUI PÈSENT SUR CETTE PAGE ────────────────────────
//  · B20 — une salle à trois coachs = UN compte coach. Il n'y a pas d'entité
//    salle, pas de roster. `gyms.fit.one_*` le dit à voix haute plutôt que de
//    laisser « votre équipe » s'installer dans une phrase.
//  · B23 — la relance du soir part dès que le tap n'est pas « All good »
//    (`needsAxisFollowUp(level) = level !== "good"`), donc AUSSI sur « So-so ».
//    `gyms.daily.body` est écrit à ce mot près.
//  · B24 / S5 — ne JAMAIS écrire « rien n'arrive la nuit ». Les heures calmes
//    21 h-8 h ne couvrent que la RELANCE ; le tap du soir a sa propre fenêtre
//    20 h-22 h et peut tomber à 21 h 50. `gyms.daily.quiet_body` le dit.
//  · S12 — aucun SKU élève dans Stripe : `gyms.price.billing_note` n'est pas
//    une précaution, c'est le fait qui perd un pilote s'il est découvert après
//    signature.
//  · S1 — aucun canal 1:1 élève → coach. Rien ici ne suggère une boîte de
//    réception, une file de réponses, ni « votre coach vous répondra ».
//  · S9 — aucune bande de risque, aucune tuile « on track » : elles viennent de
//    l'évaluateur d'adhérence, débranché du 1:N par `20260803200000`.
//
// ── LES CHAÎNES CITÉES MOT POUR MOT, ET POURQUOI ELLES NE SE TRADUISENT PAS ─
// Les clés `gyms.fig.thread_*` et `gyms.fig.monday_*` reprennent des chaînes du
// PRODUIT (S10 : une maquette reprend le vrai champ mot pour mot, ou ce n'est
// pas une maquette). L'app authentifiée est déclarée en anglais
// (`i18n/catalog.ts`) : les traduire en français montrerait un écran qui
// n'existe pas. Elles sont donc IDENTIQUES dans `fr.public.ts`, et c'est
// délibéré. Chacune porte son ancre en commentaire.
// ===========================================================================

export const gymsEn = {
  "gyms.seo_title": "Sophia for gyms — a nutrition tier your members pay for",
  "gyms.seo_description":
    "An independent gym's second line of revenue: a nutrition tier above the membership, answered every day by an agent that works from your method. You pay 7 € per enrolled member and charge what you like on top. What Sophia writes in the chat is re-read against your red lines before it is sent, with no model in that loop. On Monday, one computed page names the members worth a message while they can still be reached.",

  // ── HERO ────────────────────────────────────────────────────────────────
  // La douleur d'abord, le revenu juste après. Un argument de charge de travail
  // plafonne au temps du gérant et nous fait comparer à un logiciel de gestion
  // de salle ; la douleur, elle, est ce qu'il a déjà en tête en arrivant.
  // « vingt et un repas » est de l'arithmétique du monde (3 × 7), pas une
  // mesure du produit : aucun chiffre du dépôt n'est engagé ici.
  "gyms.hero.eyebrow": "For independent gyms — boxes, strength halls, hybrid studios",
  "gyms.hero.title": "You coach three hours a week. They eat twenty-one meals without you.",
  "gyms.hero.lede":
    "That is where the plateau comes from, and a member who stops seeing their body change does not argue with you about it: they come less, then they come on Saturdays, then they stop coming. Sophia is a nutrition tier above your membership. You record how you feed athletes once, and an agent answers every member you enrol, every day, from your method.",
  "gyms.hero.cta": "Start the 14-day trial",
  "gyms.hero.trial_note": "14 days, up to 3 members, then it stops on its own.",
  // B32 : l'invitation par e-mail est une propriété de sécurité (le jeton est
  // minté serveur, seul son sha256 est stocké), pas un manque de partage.
  "gyms.hero.note":
    "Members join one email address at a time, by invitation. There is no shareable link to copy around, and that is the point. It runs beside whatever you already use to run the gym — there is nothing to connect.",

  // Figure 1 — la semaine d'un membre. Concept, vue de face, 480×240.
  "gyms.fig.week_t": "One member's week: three coached sessions, twenty-one meals elsewhere",
  "gyms.fig.week_d":
    "A week drawn as marks. On the first row, the three sessions coached in the room. On the second, the twenty-one meals that happen where the gym is not — the part this page is about.",
  "gyms.fig.week_label": "ONE MEMBER'S WEEK",
  "gyms.fig.week_row1": "THREE HOURS IN THE ROOM",
  "gyms.fig.week_row2": "TWENTY-ONE MEALS, EVERYWHERE ELSE",

  // ── L'ARITHMÉTIQUE ──────────────────────────────────────────────────────
  // B30 : l'exemple est juste ET étiqueté « exemple ». Les deux, ensemble, sont
  // ce qui le rend crédible — retirer l'étiquette en ferait une prévision.
  //   250 × 15 % = 37,5 → 37 (ARRONDI VERS LE BAS : une personne n'est pas
  //   divisible, et arrondir vers le haut flatterait notre côté)
  //   37 × 25 € = 925 €  |  37 × 7 € = 259 €  |  925 − 259 = 666 €  |  ×12 ≈ 8 000 €
  // Si l'un de ces nombres bouge, les cinq autres bougent avec.
  "gyms.money.eyebrow": "The arithmetic",
  "gyms.money.title": "A tier your members pay for, on top of the membership.",
  "gyms.money.body":
    "You pay 7 € for each member you enrol and you set what they pay you. No platform fee, no setup fee, and you stop paying the month you turn a seat off. Nobody at your gym writes a menu, so the tier costs you no hours — which is exactly why the number to weigh it against is not the time it saves.",
  // B31 — à conserver telle quelle. C'est la meilleure ligne des trois pages,
  // et elle tombe ici parce que c'est ici qu'un chiffre de rétention inventé
  // aurait le plus de valeur commerciale.
  "gyms.money.close":
    "What you are buying is months of membership. What is one member who stays three months longer worth to you? That is the number to put against 7 €, and it is yours, not ours: we have no retention figure to sell you, and we are not going to invent one.",
  "gyms.money.caption":
    "An example, and it says so. We do not know your take-up or the price you would set, and those are the two numbers that decide the total. The one that is not an estimate is ours: 7 € per enrolled member.",

  // Figure 2 — l'exemple chiffré. Document vu de face, 480×240.
  "gyms.fig.money_t": "A worked example for a gym with 250 members",
  "gyms.fig.money_d":
    "Four lines of arithmetic. Thirty-seven members on the nutrition tier at 25 € each is 925 € in; seven euros each to Sophia is 259 € out; 666 € stays with the gym every month.",
  "gyms.fig.money_label": "AN EXAMPLE — A GYM WITH 250 MEMBERS",
  "gyms.fig.money_uptake_label": "On the nutrition tier",
  "gyms.fig.money_uptake_value": "37 members",
  "gyms.fig.money_uptake_hint": "15% take it up, rounded down to whole people",
  "gyms.fig.money_in_label": "They pay you 25 € each",
  "gyms.fig.money_in_value": "925 €",
  "gyms.fig.money_out_label": "You pay Sophia 7 € each",
  "gyms.fig.money_out_value": "− 259 €",
  "gyms.fig.money_keep_label": "You keep, every month",
  "gyms.fig.money_keep_value": "666 €",
  "gyms.fig.money_keep_hint": "about 8,000 € a year",

  // ── TOUS LES JOURS ──────────────────────────────────────────────────────
  // B22 : trois boutons, fenêtre 20 h-22 h, un message par jour au plus.
  // B23 : la relance d'axe part dès que le niveau n'est pas « good » — donc
  // aussi sur « So-so ». La phrase est écrite au mot près : « anything other
  // than All good ». Ne pas la ramener à « si c'était dur ».
  "gyms.daily.eyebrow": "Every day",
  "gyms.daily.title": "It is awake at nine on a Tuesday evening. You are at home.",
  "gyms.daily.body":
    "A member sends a photo of a plate or a sentence about their day, and gets an answer built from your method, in a thread that stays open. In the evening, one tap says how the day went — three buttons, and on anything other than All good, one follow-up asks whether it was energy, hunger or sleep. That is the whole evening.",
  // B21 : un message par épisode (`reengagement.ts:211-213`) et
  // REENGAGE_MIN_GAP_HOURS = 24×7 avant qu'un autre soit seulement possible.
  // B24 / S5 : les heures calmes ne couvrent QUE la relance. Le tap du soir a
  // sa propre fenêtre et peut tomber à 21 h 50 — d'où « ten to ten », qui est
  // là pour empêcher la phrase interdite de repousser.
  "gyms.daily.quiet_title": "Three days of silence, one message.",
  "gyms.daily.quiet_body":
    "Then it goes quiet: one nudge per episode, and a week before another one is even possible. A nudge on day two would only teach people that silence gets pinged, and it would burn the signal for day nine. That nudge holds off between 9pm and 8am. The evening tap has its own window, and it can land at ten to ten.",
  "gyms.daily.fig_caption":
    "Every word in this thread is the product's own: the question, the three buttons, the follow-up, and what the composer says when it is empty.",

  // Figure 3 — le fil du soir. MAQUETTE DE PRODUIT, 480×320, et chaque chaîne
  // est citée mot pour mot (S10). Ces six clés NE SE TRADUISENT PAS : l'app
  // authentifiée est en anglais, et une capture traduite montrerait un écran
  // qui n'existe pas.
  "gyms.fig.thread_t": "The evening thread, as the product renders it",
  "gyms.fig.thread_d":
    "A chat surface. Sophia asks how the day went and offers three buttons; a second question asks which axis was hard and offers three more. At the bottom, the composer the member writes into.",
  "gyms.fig.thread_app": "Sophia", // chat.title
  "gyms.fig.thread_sub": "Your day-to-day, with your coach's method behind it.", // chat.subtitle
  "gyms.fig.thread_q1": "How was today?", // PULSE_QUESTION_EN, daily_pulse.ts:114
  "gyms.fig.thread_b1": "All good", // LEVEL_LABELS_EN.good, daily_pulse.ts:85
  "gyms.fig.thread_b2": "So-so", // LEVEL_LABELS_EN.mixed, daily_pulse.ts:86
  "gyms.fig.thread_b3": "Rough", // LEVEL_LABELS_EN.hard, daily_pulse.ts:87
  "gyms.fig.thread_q2": "What was hard?", // PULSE_AXIS_QUESTION_EN, daily_pulse.ts:115
  "gyms.fig.thread_a1": "Energy", // AXIS_LABELS_EN.energy, daily_pulse.ts:90
  "gyms.fig.thread_a2": "Hunger", // AXIS_LABELS_EN.hunger, daily_pulse.ts:91
  "gyms.fig.thread_a3": "Sleep", // AXIS_LABELS_EN.sleep, daily_pulse.ts:92
  "gyms.fig.thread_composer": "Write to Sophia", // chat.input.placeholder
  "gyms.fig.thread_send": "Send", // chat.send

  // ── LE LUNDI ────────────────────────────────────────────────────────────
  // B11 : cron hebdomadaire, texte rendu par GABARIT (`renderSynthesisText` est
  // une fonction pure), jamais narré par un modèle.
  // B14 : les seuils sont mesurés sur le dernier ENTRANT — répondu < 48 h,
  // slipping 48-120 h, silencieux ≥ 120 h.
  // B17 : la cohorte est scopée par coach — une salle ne voit que ses membres.
  "gyms.monday.eyebrow": "Every Monday",
  "gyms.monday.title": "The names worth a message, while they can still be reached.",
  "gyms.monday.body":
    "One page, computed from what happened and rendered from a template. No model narrates it, which is why it cannot flatter you. A member who wrote in the last two days is in touch; between two and five days they are slipping; past five days they are silent.",
  "gyms.monday.close":
    "Slipping is the useful one. Those members are still reachable, and a message from you still lands. Your access log will tell you the same thing in six weeks, and by then the word for it is former member.",
  "gyms.monday.scope": "You see the members you enrolled, and nobody else's.",
  "gyms.monday.fig_caption":
    "A schematic of that page. The names are made up; the labels, the reasons and the states are the product's own words.",

  // Figure 4 — le lundi. MAQUETTE DE PRODUIT, 480×280, chaînes citées mot pour mot.
  // Ces clés ne se traduisent pas non plus. Le bloc « The numbers » de l'écran réel
  // n'est PAS dessiné: c'était une seconde idée dans la même figure, et le sujet est
  // la liste des noms. Les seuils, eux, sont dans la copie (B14).
  "gyms.fig.monday_t": "The Monday page: the members worth a message",
  "gyms.fig.monday_d":
    "The weekly page of a gym owner. Three members worth a message, each with the observed reason and their contact state — and, on the third, a plain statement that there is no number to show.",
  "gyms.fig.monday_app": "This week", // KeelAppShell title, CoachWeeklyPage.tsx:192
  "gyms.fig.monday_worth": "WORTH A MESSAGE", // CoachWeeklyPage.tsx:231, rendu en capitales par `SectionLabel`
  "gyms.fig.monday_n1": "Chen Wei",
  "gyms.fig.monday_r1": "Going quiet", // FLAG_REASON_COPY.slipping_contact
  "gyms.fig.monday_s1": "slipping", // contact_state, rendu brut
  "gyms.fig.monday_n2": "Amina Diop",
  "gyms.fig.monday_r2": "Has not written in days", // FLAG_REASON_COPY.silent_5d
  "gyms.fig.monday_s2": "silent", // contact_state, rendu brut
  "gyms.fig.monday_n3": "Luca Ferrari",
  "gyms.fig.monday_r3": "Barely logged anything", // FLAG_REASON_COPY.coverage_below_gate
  "gyms.fig.monday_s3": "no number to show", // CoachWeeklyPage.tsx:272

  // ── UNE FOIS ────────────────────────────────────────────────────────────
  // La section dont le travail est de PERDRE une vente : le gérant qui délègue
  // l'entretien à un salarié récupère une doctrine remplie sous contrainte, et
  // un agent générique est le mode d'échec du produit, pas une version moindre.
  // B20 est dit ici à voix haute : un compte coach = une méthode. C'est une
  // limite, et l'écrire empêche « votre équipe » de s'installer plus loin.
  // B28 : révision et rollback sans perdre l'historique de ce que les membres
  // ont réellement reçu.
  "gyms.fit.eyebrow": "Once",
  "gyms.fit.title": "It only works if the method is yours.",
  "gyms.fit.body":
    "A guided interview turns what you already say on the floor into something an agent can hold: what you are convinced of, what you rule out, the calls you make on the hard cases, your words. You read back exactly what it understood before you publish. Revise it whenever you like, and roll back to an earlier version without losing the history of what your members actually received.",
  "gyms.fit.one_title": "One account, one method.",
  "gyms.fit.one_body":
    "A gym with three coaches records one method, not three. There is no gym entity above the account and no roster inside it: whoever sits the interview is who the agent works from, and that person has to be the one who benefits from it.",
  "gyms.fit.no_title": "Not the appointed nutritionist.",
  "gyms.fit.no_body":
    "Hand the interview to someone on staff and you get back what you put in: a doctrine filled in under duress, and an agent that sounds like every other food app. A generic agent is this product's failure mode, not a smaller version of it.",

  // ── LE DOUBLE VERROU — le bloc sombre, un seul par page ──────────────────
  // ⚠️ FORMULATION B8b, ET PAS CELLE DES PAGES ACTUELLES. Les deux pages en
  // ligne sur-vendent : `withKeelDoctrineBlock` n'a qu'UN appelant (le
  // composeur), et « chaque message sortant » est faux — quatre surfaces sont
  // scannées (chat, repas, semaines, reco du jour), quatre ne le sont pas
  // (relance, récap du soir, bilan du dimanche, broadcast coach).
  // Ce qui est écrit ici, et rien de plus : la méthode ENTRE dans le chat,
  // dans chaque semaine et dans chaque repas ; ce qui est écrit DANS LE CHAT
  // est relu contre les lignes rouges avant d'être envoyé.
  "gyms.lock.eyebrow": "The part to be most afraid of",
  "gyms.lock.title": "An agent that answers for you is a risk. We treat it as one.",
  "gyms.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model never to recommend grazing between meals and it will comply almost always — and almost always is the wrong number when one public contradiction of you, in front of someone who trains under your name, is what the room remembers.",
  "gyms.lock.l1_tag": "Your method goes in",
  "gyms.lock.l1":
    "It enters the chat, and every week and every meal Sophia writes.",
  "gyms.lock.l2_tag": "What comes out of the chat is re-read",
  "gyms.lock.l2":
    "What Sophia writes in the chat is checked against your red lines before it is sent. Deterministic, with no model in that loop. That one is the guarantee.",
  // B9 : chaque ligne rouge porte son `instead`, dans les mots du coach, signé
  // de son nom (`keel_output_locks.ts:99-113`). C'est le seul endroit de la
  // page où le nom du gérant apparaît, et c'est le seul endroit où il apparaît
  // dans le produit avec le suffixe du broadcast. Ne pas en tirer B18.
  "gyms.lock.instead":
    "Your member never receives a refusal. Each red line carries what you do instead, in your words and signed with your name, and that is what arrives.",
  "gyms.lock.trace_example": "Example — a gym whose method rules out grazing between meals.",
  // B27 : CHECK `student_week_plans_doctrine_traceable_check`. Portée : la
  // semaine seulement. Les plats ne citent pas, délibérément.
  "gyms.lock.traceable":
    "And when a member builds a week out of your method, the database refuses a line that names none of your convictions. A constraint, not a convention.",
  "gyms.lock.close":
    "Your member gets your answer at nine on a Tuesday evening, on a question you have answered a hundred times on the floor.",

  // Figure 5 — la trace. CONCEPT sur fond sombre (F12 : une maquette de produit
  // ne se pose jamais sur un fond sombre — le produit est en clair uniquement,
  // et un écran sombre montrerait un produit qui n'existe pas).
  // Le mot « held » est dessiné en contour sourd, pas en rouge : sur une page
  // de vente il n'y a pas d'instant, et une pastille colorée y serait de la
  // décoration portant le costume du sens (F10).
  "gyms.fig.trace_t": "One message, from the question to what was sent",
  "gyms.fig.trace_d":
    "Three stages. A member's question, the draft that broke a red line and was held, and the line that went out instead — the one the gym owner wrote.",
  "gyms.fig.trace_label": "ONE MESSAGE, END TO END",
  "gyms.fig.trace_s1": "A MEMBER ASKS",
  "gyms.fig.trace_t1": "“Should I add a snack between lunch and dinner?”",
  "gyms.fig.trace_s2": "THE DRAFT SAID",
  "gyms.fig.trace_t2": "“A small snack mid-afternoon can help.”",
  "gyms.fig.trace_held": "held",
  "gyms.fig.trace_s3": "WHAT WENT OUT INSTEAD",
  "gyms.fig.trace_t3": "“Three real meals. If you are hungry between them, the meal before was too small.”",

  // ── LE PRIX ─────────────────────────────────────────────────────────────
  // B1 : 7 €/membre/mois, pas de forfait plateforme. Le montant vit dans
  // `STRIPE_PRICE_ID_COACH_SEAT_MONTHLY`, pas dans le code.
  // B3 : « pour un siège payé à l'année ». L'intervalle est celui du COACH.
  //      ⚠️ C'est la correction du claim FAUX B2. Ne pas revenir à « quand
  //      votre membre a payé son année » : c'est le claim retiré.
  // B4 : `stripe-reconcile-seats` RECALCULE depuis le ledger, il n'incrémente
  //      jamais — on arrête de payer le mois où on éteint un siège.
  // B5 : essai 14 jours / 3 élèves, puis ça s'arrête.
  // B6 : ⚠️ un coach à ZÉRO élève est refusé au checkout (`no_billable_seat`).
  //      D'où « subscribing needs at least one enrolled member » : la marge est
  //      positive dès le premier, mais le premier doit exister.
  "gyms.price.eyebrow": "Pricing",
  "gyms.price.title": "7 € a member. You set what they pay.",
  "gyms.price.seat": "7 €",
  "gyms.price.seat_period": "per enrolled member, per month",
  "gyms.price.seat_label": "No platform fee. No setup. Nothing else.",
  "gyms.price.annual": "6 € for a seat paid for a year up front.",
  "gyms.price.why":
    "You pay for the seats you have opened, and you stop paying the month you turn one off. Subscribing needs at least one enrolled member, so the first seat comes before the first invoice — after that the arithmetic is the same at one member and at five hundred.",
  "gyms.price.billing_note":
    "You bill your members yourself, on whatever you already use for the membership. Sophia never touches their payment and never sees it.",
  "gyms.price.cta": "Start the 14-day trial",
  "gyms.price.trial_note": "14 days, up to 3 members, then it stops on its own.",

  // ── LA CLÔTURE ──────────────────────────────────────────────────────────
  "gyms.close.title": "You already coach the training. This is the other twenty-one meals.",
  "gyms.close.cta": "Start the 14-day trial",
  // Pas de « Sign in » ici: `PublicHeader` porte déjà cette porte, et un second lien
  // à côté du seul CTA de la page serait une seconde offre.
  "gyms.close.trial_note": "14 days, up to 3 members, then it stops on its own.",
} as const;
