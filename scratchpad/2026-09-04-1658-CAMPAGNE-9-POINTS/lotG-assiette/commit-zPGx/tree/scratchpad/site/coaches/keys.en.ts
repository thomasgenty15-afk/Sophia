// ===========================================================================
// /coaches — LES CLÉS ANGLAISES. Namespace `coaches`.
// ===========================================================================
// À insérer dans `frontend/src/keel/i18n/en.ts`. Le namespace `landing`
// disparaît comme namespace de page : son contenu vit ici (AUDIT D3).
//
// L'ACHETEUR : un praticien qui vend une formation et veut que sa méthode
// réponde à toute sa cohorte sans qu'il écrive un message. Même acheteur que
// l'ancienne `/`, même argument central — la copie est refondue, pas traduite.
//
// ── TROIS CHOSES QUE CE FICHIER CORRIGE PAR RAPPORT À `landing.*` ──────────
//
// 1. « Every message is checked against your red lines » (landing.hero.subtitle,
//    landing.diff.lock1/lock2) est FAUX pour « every » (AUDIT B7/B8) : la
//    doctrine n'est injectée que par le composeur, et la relecture ne couvre
//    que 4 surfaces sur 8. La formulation tenable est B8b, écrite en deux
//    temps dans `coaches.lock.scope` — ce qui est une INSTRUCTION est nommé
//    comme telle, ce qui est un MÉCANISME aussi. C'est l'argument le plus fort
//    de la page et le seul du voisinage : personne ne vend la relecture avant
//    envoi (Coachvox vend la voix, Delphi vend la source).
//
// 2. « 21 of 34 wrote themselves a week » (landing.mock.intent_line) est une
//    PARAPHRASE présentée comme une citation : le moteur écrit « built »
//    (AUDIT B13, coach_synthesis.ts:566-568). Corrigé dans `fig.monday.line3`.
//
// 3. « How did today go? » avec « Good / Mixed / Hard » (landing.mock.chat_*)
//    est le même défaut sur le pouls du soir : le produit écrit « How was
//    today? » et ses boutons disent « All good / So-so / Rough »
//    (daily_pulse.ts:84-88 et :114). Corrigé dans `fig.chat.*`.
//
// ── CE QUI NE S'ÉCRIT PAS ICI, ET POURQUOI ────────────────────────────────
// « positif dès le premier élève » sans la réserve du siège (B6) · « 6 €
// quand votre élève a payé son année » (B2) · « votre nom sur les messages »
// (B18) · « quelles convictions vos élèves tiennent ou lâchent » (B16) ·
// « pas de score d'adhérence » comme règle gravée (B15 : le code émet encore
// une moyenne dès qu'une ligne existe) · un chiffre de rétention (B31) ·
// un chiffre sans source dans le dépôt (S8) · une boîte de réception (S1).
// ===========================================================================

export const coachesEn = {
  "coaches.seo_title": "Sophia — your method answers your students, every day",
  "coaches.seo_description":
    "Sophia learns how you coach — your convictions, your red lines, what you say instead — and answers your students in your method, every day. What she writes in the chat is read back against your red lines before it is sent, by code. On Monday you read one page. 7 € per student, per month, no platform fee.",

  // ── HERO ────────────────────────────────────────────────────────────────
  // Le titre survit à la refonte : il nomme la douleur (le cours finit) et la
  // promesse (le coaching, non) en six mots, et il n'a jamais été le problème.
  "coaches.hero.kicker": "For coaches who sell a method, not hours",
  "coaches.hero.title": "Your course ends. Your coaching doesn't.",
  "coaches.hero.lede":
    "You wrote the method once. Sophia answers your students in it, every day — the question at nine at night, the week they build for themselves, the meals she drafts for them. What you could only sell once becomes something worth paying for every month.",
  "coaches.hero.cta": "Start the 14-day trial",
  // B5 (14 jours / 3 élèves) · B32 (invitation e-mail, pas de lien à copier) ·
  // S1 (aucune boîte de réception, et l'absence est le produit).
  "coaches.hero.note":
    "14 days, up to 3 students, then it stops on its own. They join by email invitation and get a space of their own, chat included. Nothing comes back to an inbox on your side — there isn't one.",
  // B10 + B28. La légende porte les 4 points d'injection et la révision.
  "coaches.hero.fig_caption":
    "You record it once, in a guided interview: your convictions, your red lines, what you say instead, your vocabulary. Revise it whenever you like — an edit lands on the next message — and roll back to an earlier version without losing what your students already received.",

  "coaches.fig.method.title": "One method, four places it is written into",
  "coaches.fig.method.desc":
    "The published method on the left. On the right, the four things Sophia composes for a student: their chat, the week they build, the meals she drafts, their household's meals. Each one is composed with the method in it.",
  "coaches.fig.method.eq": "RECORDED ONCE",
  "coaches.fig.method.source": "YOUR METHOD",
  "coaches.fig.method.l1": "your convictions",
  "coaches.fig.method.l2": "your red lines",
  "coaches.fig.method.l3": "what you say instead",
  "coaches.fig.method.l4": "your vocabulary",
  "coaches.fig.method.out1": "their chat",
  "coaches.fig.method.out2": "the week they build",
  "coaches.fig.method.out3": "the meals she drafts",
  "coaches.fig.method.out4": "their household meals",

  // ── LA JOURNÉE ──────────────────────────────────────────────────────────
  "coaches.day.kicker": "Every day",
  "coaches.day.title": "The questions that arrive after the course is over.",
  "coaches.day.body":
    "The modules are recorded, the cohort is full, the method is good. Then Tuesday night arrives and a student has a question that is in no module, because it is about their evening, their kitchen, their week. Multiply it by everyone enrolled.",
  "coaches.day.q1": "“Can I swap the rice for pasta tonight?”",
  "coaches.day.q2": "“I'm starving at 4pm — is that normal?”",
  "coaches.day.q3": "“I ate badly at a wedding. Have I wrecked the week?”",
  "coaches.day.close":
    "Every one of them has an answer, and the answer is yours — you have made that call a hundred times. Nobody leaves because the method was wrong. They drift because on Tuesday night, nobody who thinks like you was there.",
  // B22 (trois boutons, un par jour) · B23 (la relance part AUSSI sur
  // « mitigé », pas seulement sur « dur » — l'ancienne page disait « if it was
  // hard », et `needsAxisFollowUp` dit `level !== "good"`).
  "coaches.day.fig_caption":
    "The exchange is an example. The evening question and its three buttons are the product's own words: one tap a day, and if the day was rough — or just so-so — one follow-up asks about energy, hunger or sleep.",

  "coaches.fig.chat.title": "One day in a student's chat",
  "coaches.fig.chat.desc":
    "The student writes what happened at lunch and gets an answer composed with their coach's method. In the evening, one question and three buttons: All good, So-so, Rough.",
  "coaches.fig.chat.heading": "In their chat, today",
  "coaches.fig.chat.them": "THEM",
  "coaches.fig.chat.sophia": "SOPHIA",
  "coaches.fig.chat.student": "Ate out at lunch — no idea what was in it.",
  "coaches.fig.chat.reply1": "Then keep tonight simple: a protein, greens,",
  "coaches.fig.chat.reply2": "a normal portion. One lunch out is not a week.",
  "coaches.fig.chat.evening": "IN THE EVENING",
  // MOT POUR MOT — `daily_pulse.ts:114` et `:84-88`. Ne pas « améliorer ».
  "coaches.fig.chat.question": "How was today?",
  "coaches.fig.chat.tap_good": "All good",
  "coaches.fig.chat.tap_mixed": "So-so",
  "coaches.fig.chat.tap_rough": "Rough",

  // ── LE BLOC SOMBRE — la relecture avant envoi ───────────────────────────
  "coaches.lock.kicker": "The part you should be most afraid of",
  "coaches.lock.title": "An AI speaking in your name is a risk. We treat it as one.",
  "coaches.lock.body":
    "A prompt is an instruction, not a guarantee. Tell any model “never recommend grazing between meals” and it will comply almost always — and almost always is the wrong number when one public contradiction of you is the thing your students will remember.",
  // B8b, en deux temps. L'asymétrie EST l'argument : nommer ce qui est une
  // instruction protège la seule phrase de la page qui est une garantie.
  "coaches.lock.scope":
    "So your method is written into everything Sophia composes for your students: the chat, every week, every meal. That much is an instruction. The second part is not: what she writes in the chat is read back against your red lines before it is sent, by code, with no model in that loop.",
  "coaches.lock.instead":
    "What goes out instead is not ours either. Each red line carries what you say in its place, in your own words, and it is signed with your name — so your student reads your position, and knows it is yours.",
  "coaches.lock.close":
    "They never get a refusal, and never get “ask your coach” — in a masterclass, that points at a door which doesn't exist. They get your answer.",

  "coaches.fig.lock.title": "A message held, and what went out instead",
  "coaches.fig.lock.desc":
    "A student's question, the draft that crossed a red line, the check that held it, and the sentence the coach wrote for that exact case going out in its place, signed with their name.",
  "coaches.fig.lock.eq": "IN THE CHAT, BEFORE IT IS SENT",
  "coaches.fig.lock.ask_label": "A STUDENT ASKS",
  "coaches.fig.lock.ask": "“Should I add a snack between lunch and dinner?”",
  "coaches.fig.lock.draft_label": "THE DRAFT SAID",
  "coaches.fig.lock.draft": "“A small snack mid-afternoon can help.”",
  "coaches.fig.lock.held": "held",
  "coaches.fig.lock.gate": "YOUR RED LINE — no grazing between meals",
  "coaches.fig.lock.gate_note": "no model in this loop",
  "coaches.fig.lock.sent_label": "WHAT WENT OUT",
  "coaches.fig.lock.sent1": "“Three real meals. If you're hungry between them,",
  "coaches.fig.lock.sent2": "the meal before was too small.”",
  "coaches.fig.lock.sign": "— Marc",

  // ── LE LUNDI ────────────────────────────────────────────────────────────
  "coaches.monday.kicker": "Every Monday",
  "coaches.monday.title": "One page, and no model wrote it.",
  // B11 : cron hebdo, texte rendu par gabarit (`renderSynthesisText` est pur).
  "coaches.monday.body":
    "Who is still talking, how the week felt, what your students set themselves. Rendered by a template out of what actually happened — and where there is not enough to say something, it says that instead of rounding it up.",
  // B14 : 48 h / 120 h, mesurés sur le dernier message ENTRANT. La dernière
  // phrase cite `CoachWeeklyPage.tsx:272` mot pour mot.
  // ⚠️ Ne PAS écrire « pas de score d'adhérence, pas de pourcentage » (B15) :
  // `coach_synthesis.ts:571-575` émet encore une moyenne dès qu'une ligne
  // existe. La page dit ce que la page fait, pas ce que le produit promet.
  "coaches.monday.thresholds":
    "In touch means they wrote within two days. Slipping is two to five days. Silent is five or more. And where there is no number, the page says “no number to show” rather than filling the gap.",
  "coaches.monday.fig_caption":
    "A schematic of the Monday page. The sentences are the ones the renderer emits, word for word; the cohort is an example.",

  // MOT POUR MOT — toutes ces chaînes viennent de l'écran réel. Elles restent
  // en anglais dans les deux locales : ce sont les mots du produit, pas ceux
  // de la page. Traduire une capture, c'est cesser d'en être une (S10).
  "coaches.fig.monday.title": "Monday, in one page",
  "coaches.fig.monday.desc":
    "The coach's weekly page: the week in prose first, then the students worth writing to with the reason attached, then the numbers, last and small.",
  "coaches.fig.monday.app_title": "This week",
  "coaches.fig.monday.week_label": "WEEK OF 2026-08-03",
  "coaches.fig.monday.week_to": "2026-08-09",
  "coaches.fig.monday.line1": "34 students this week: 25 in touch, 6 slipping, 3 silent.",
  "coaches.fig.monday.line2":
    "How the week felt: 21 holding up, 9 strained, 4 having a hard time.",
  // « built », pas « wrote » — AUDIT B13.
  "coaches.fig.monday.line3": "21 of 34 built themselves a week from your method.",
  "coaches.fig.monday.flagged_label": "WORTH A MESSAGE",
  "coaches.fig.monday.s1_name": "Chen Wei",
  "coaches.fig.monday.s1_reason": "Going quiet",
  "coaches.fig.monday.s1_state": "slipping",
  "coaches.fig.monday.s2_name": "Amina Diop",
  "coaches.fig.monday.s2_reason": "Has not written in days",
  "coaches.fig.monday.s2_state": "silent",
  "coaches.fig.monday.s3_name": "Luca Ferrari",
  "coaches.fig.monday.s3_reason": "Barely logged anything",
  "coaches.fig.monday.s3_none": "no number to show",
  "coaches.fig.monday.numbers_label": "THE NUMBERS",
  "coaches.fig.monday.n1_label": "responsive",
  "coaches.fig.monday.n2_label": "slipping",
  "coaches.fig.monday.n3_label": "silent",

  // ── LA NOTE 1:1 ─────────────────────────────────────────────────────────
  // B26. La section existe parce qu'un coach qui connaît ses dix élèves lit le
  // 1:N comme un refus de le servir. Elle reste APRÈS la relecture : elle
  // ajoute une entrée dans le prompt, et on rencontre la garantie avant.
  "coaches.note.kicker": "If you coach ten people you actually know",
  "coaches.note.title": "Your method is what you'd say to any of them. This is the rest.",
  "coaches.note.body":
    "One field, one student, 1,500 characters, in your words: that this one works nights, that one writes off Sunday. It reaches their chat, the week they build and the meals Sophia drafts for them — your method, read through what you know about them. And it never outranks anything: their allergies come first, your method second, the note third.",
  // ⚠️ « jamais citée » est une promesse de PROMPT sans vérificateur
  // déterministe (`coach_note.ts:126-128`). Elle ne se met pas au même rang
  // que les lignes rouges — et le dire est un argument, pas une concession.
  "coaches.note.limit":
    "Sophia is instructed never to quote it back to them. That one is an instruction, not a check, and we would rather tell you which is which. It is also a note about a person, so it belongs to them too: it is included if they ever ask for their data.",
  "coaches.note.mock_label": "ON THEIR PAGE, IN YOUR WORKSPACE",
  // VERBATIM — `CoachNoteCard.tsx:111`.
  "coaches.note.mock_heading": "What you have noticed about them",
  "coaches.note.mock_body": "Works nights, eats around 3am. Hates cooking on Sundays.",
  "coaches.note.mock_caption":
    "Leave it empty and nothing reaches the model to say you left it blank. Two hundred students, write none. Ten, write ten.",

  // ── LE PRIX ─────────────────────────────────────────────────────────────
  // B1 (7 €/élève, pas de forfait) · B4 (on arrête le mois où on éteint) ·
  // B5 (essai) · B6 (il faut un élève rattaché pour s'abonner : sans lui le
  // checkout refuse en `no_billable_seat`) · S12 (aucun SKU élève).
  // « No tier to outgrow » est une propriété de NOTRE grille, pas une
  // comparaison chiffrée avec un concurrent.
  "coaches.pricing.kicker": "Pricing",
  "coaches.pricing.title": "One line. It grows with what you sell.",
  "coaches.pricing.seat": "7 €",
  "coaches.pricing.seat_period": "per student, per month",
  "coaches.pricing.seat_label": "No platform fee. No setup. No tier to outgrow.",
  "coaches.pricing.body":
    "You pay for the students you have enrolled, and you stop paying the month you turn a seat off. What you charge them is yours, billed with your own tools — we never bill your student. The trial runs 14 days with up to 3 students; to subscribe when it ends you need at least one student enrolled, because the seat is the thing you pay for.",
  // B31 — la meilleure ligne des trois pages actuelles. Conservée.
  "coaches.pricing.no_number":
    "What one student who stays instead of drifting is worth is your number, not ours. We have no retention figure to sell you, and we are not going to invent one.",
  "coaches.pricing.cta": "Start the 14-day trial",
  "coaches.pricing.trial_note": "14 days, up to 3 students, then it stops on its own.",

  // ── LA SORTIE ───────────────────────────────────────────────────────────
  "coaches.closing.title":
    "You have already written the method. This is what makes it worth paying for every month.",
  "coaches.closing.cta": "Start the 14-day trial",
};
