// Seed anglais — le namespace `plan`, et lui seul.
// Assemblé dans `../en.ts`; une clé `plan.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enPlan = {
  // ══════════════════════════════════════════════════════════════════════════
  // L8/O2 — LA GÂCHETTE: PRENDRE LA MAIN (D2, D7)
  //
  // Sans ce bouton, `keel_validate_meal_plan` n'a AUCUN appelant: personne ne
  // peut prendre la main, donc rien n'est jamais proposé, donc ni fusion ni
  // défusion n'existent pour un vrai utilisateur. Sept lots de serveur
  // reposent dessus.
  //
  // ── LA POSTURE PAR DÉFAUT N'EST PAS UN REPROCHE ─────────────────────────
  // Ne rien faire est le cas NORMAL et le plus courant: on est composé dans le
  // plan du foyer comme une bouche ordinaire. Aucune phrase d'ici ne doit
  // laisser croire qu'il faut prendre la main pour bien faire.
  // ══════════════════════════════════════════════════════════════════════════
  "plan.hand.title": "You are cooked for by the household",
  "plan.hand.body":
    "By default the household plan feeds you, and that is the ordinary way to be here. If you would rather cook your own, build a plan below and take it on — then you cook it and you shop for it.",
  "plan.hand.take_cta": "Cook this one myself",
  "plan.hand.taking": "Taking it on...",
  "plan.hand.taken_title": "You are cooking this one",
  "plan.hand.taken_body":
    "The household plan does not cook for you over these days. Whoever runs the household can suggest folding this into it — you keep it either way.",
  "plan.hand.taken_on": "Taken on {date}.",
  // Le geste est IDEMPOTENT côté base: revalider ne redate pas. `already`
  // n'est donc pas un échec, c'est « c'était déjà fait » — et le traiter comme
  // une erreur ferait paniquer sur un double-clic.
  "plan.hand.already": "That plan was already yours to cook.",
  // ⚠️ `plan.hand.owner_note` PART AVEC LA BRANCHE MAÎTRE DE `TakeTheHandCard`.
  // Elle dit « compose-le depuis la page du foyer ». Dès que le maître compose
  // depuis CET écran-ci, la phrase envoie vers un écran qui ne compose plus.
  // Elle est encore là parce que son lecteur l'est: elles partent ensemble.
  "plan.hand.owner_note":
    "You run this household, so the plan you cook is the household one. Compose it from the household page.",

  // ── LES REFUS NOMMÉS DU SERVEUR, TRADUITS (dette L1, L2, L3, L4, L5, L7) ──
  //
  // Chaque lot serveur a nommé son refus PUIS laissé l'écran afficher le jeton
  // brut. C'est ici que la dette se solde. Liste FERMÉE, et un test de dérive
  // lit les fonctions edge: un refus ajouté côté serveur sans étiquette ici
  // fait rougir la suite au lieu de sortir en jargon devant quelqu'un.
  // Voir la note de `fr.ts`: la seule borne qui reste, dite sur les deux écrans.
  "plan.refusal.household_frozen":
    "This household is paused, so no new week is composed. Nothing has been deleted.",
  "plan.refusal.no_household": "You are not in a household.",
  "plan.refusal.not_owner": "Only whoever runs the household can do this.",
  "plan.refusal.empty_household": "There is nobody at this table yet.",
  "plan.refusal.goal_required":
    "Set a direction and a situation first — that is what the whole plan is built on.",
  "plan.refusal.no_coach":
    "There is no published method to cook from yet.",
  "plan.refusal.local_day_unresolved":
    "We could not tell what day it is where you are, and a plan is counted in days.",
  "plan.refusal.window_required": "That request named no days to cover.",
  "plan.refusal.bad_window":
    "Those dates cannot make a plan. A plan starts today or later, and fits in "
    + "seven days at most.",
  // C2 ② — refusé AVANT le modèle. Un départ au-delà de dimanche fabriquait une
  // consigne contradictoire (« today is: wed » à côté de « days to fill: tue »),
  // et le modèle refusait après 6,2 s facturées.
  // ⛔ `plan.refusal.window_beyond_this_week` retirée le 2026-09-06: voir `fr.ts`.
  // C2 ③ — le même mot que la base, refusé avant le modèle plutôt qu'après.
  "plan.refusal.plan_overlaps_existing":
    "Those days sit inside a plan you already have. Cover it to its last day, or replace it.",
  "plan.refusal.unknown_intent": "That request did not say what it replaces.",
  "plan.refusal.draft_in_flight":
    "A plan is already being composed for you. Give it a moment — it will appear on its own.",
  "plan.refusal.replaces_required": "That request did not say which plan it replaces.",
  "plan.refusal.plan_not_replaceable":
    "That plan is no longer the one to replace. Reload the page and try again.",
  "plan.refusal.mode_required": "Say where to start: from what you have, or shopping for it.",
  "plan.refusal.pantry_required":
    "Add what you have in, or switch to shopping for it.",
  "plan.refusal.unknown_operation": "That is not a gesture this page knows.",
  "plan.refusal.window_fully_away":
    "Nobody is eating here over those days, so there is nothing to cook.",
  "plan.refusal.all_members_have_own_plan":
    "Everybody here is already cooking from a plan of their own over those days.",
  "plan.refusal.safety_constraints_unreadable":
    "We could not read this household's allergies, and we never cook without them.",
  "plan.refusal.empty_meal":
    "Nothing usable came back. Your previous plan is untouched — try again.",
  "plan.refusal.meal_unparseable":
    "The answer came back in a shape we could not read. Your previous plan is untouched — try again.",
  "plan.refusal.model_returned_tool_call":
    "The answer came back in a shape we could not read. Your previous plan is untouched — try again.",
  "plan.refusal.plan_not_written":
    "The plan could not be saved. Your previous plan is untouched — try again.",
  "plan.refusal.plan_adoption_timed_out":
    "Saving took too long and was stopped. No incomplete plan was saved — try again.",
  "plan.refusal.house_rule_violated":
    "What came back broke one of this household's rules, so it was not kept.",
  "plan.refusal.mouth_unfed":
    "In what came back, somebody had nothing to eat at a meal, so it was not kept. Your previous plan is intact — try again, or ease one constraint.",
  // ⟳ 2026-09-14 · BÊTA 1B — same rule as the French line: no numbers.
  // ⟳ 2026-09-14 · BÊTA 2B — a composition is already in flight.
  // ⟳ 2026-09-14 · BÊTA 2C — the brake. No date promised: we do not know it.
  // ⟳ 2026-09-14 · BÊTA 2B — the call did not go through.
  "plan.refusal.composition_unavailable":
    "Building the plan did not go through this time. Nothing was changed — your current plan is untouched. Try again in a moment.",
  "plan.refusal.generation_paused":
    "Building new plans is paused for the moment. Your current plan, your shopping list and your recipes are all still there.",
  "plan.refusal.generation_lock_unavailable":
    "A new plan can't be started right now. Nothing was written and your current plan is untouched. Try again in a minute.",
  "plan.refusal.draft_store_unavailable":
    "The preview could not be saved, so nothing was written. Your current plan is untouched. Try again in a minute.",
  "plan.refusal.generation_lease_lost":
    "Another request took over this composition, and this one stopped without writing anything. Your current plan is untouched. Reload the page to see where the other one is.",
  "plan.refusal.generation_in_flight":
    "A plan is already being put together for this household. Wait for it to finish — the screen updates on its own. Your current plan is untouched.",
  "plan.refusal.plan_expired":
    "This plan was not finished. Nothing was written and your current plan has not changed: the composition stopped on its side before the end. Start a new one when you are ready.",
  "plan.refusal.plan_still_composing":
    "This is taking longer than expected. The composition is still running on its side — your current plan has not changed. Come back in a few minutes and reload the page; don't start another one, this household is still busy with this request.",
  "plan.refusal.plan_demand_infeasible":
    "What this plan has to serve does not fit in the meals it has. Your current plan is untouched. Add a meal slot to the day involved, or turn off the “light meal” setting, then try again.",
  "plan.refusal.plan_not_deliverable":
    "The new plan did not pass its last checks, so it was not kept. Your current plan is untouched — try again, or ease one constraint.",
  "plan.refusal.plan_validation_unavailable":
    "We could not finish checking the new plan, so it was not kept. Nothing is wrong with what you asked — your current plan is untouched, just try again.",
  // ══ ⟳ 2026-09-12 · ÉTAPE C5 — LES ÉCARTS D'UN PLAN LIVRÉ ════════════════
  //
  // ⛔ UN PLAN SERVABLE QUI NE TIENT PAS TOUT LE DIT. Le plan de clôture
  // (§ C5 ⑤): « une sortie utilisable mais sous un plancher nutritionnel ne
  // peut pas être présentée comme ayant atteint l'objectif ; une sortie
  // incomplète ne peut pas être présentée comme complète ».
  //
  // ⚠️ AUCUNE DE CES PHRASES NE PORTE UN CHIFFRE, et ce n'est pas un oubli:
  // les nombres de la garde (kcal servies, grammes de protéine) sont gardés par
  // les portes d'affichage calorique, et le serveur ne les persiste même pas.
  "plan.validation.title": "This plan is usable, and here is what it misses",
  "plan.validation.intact": "It has been saved. Nothing else has changed.",
  // ⟳ 2026-09-16 — the same notice inside the PREVIEW: nothing is saved until
  // you adopt it. The "it has been saved" footer said the opposite.
  "plan.validation.preview_intact":
    "This is only a preview: nothing is saved until you adopt it. Your current plan has not changed.",
  "plan.validation.at": "{day}, {slot}",
  "plan.validation.for": "for {name}",
  "plan.validation.term": "({term})",
  "plan.validation.incomplete_title": "What could not be checked",
  "plan.validation.control_line": "{control} — {count}",
  "plan.validation.cause.missing_meal": "A meal has nobody's portion on it",
  "plan.validation.cause.double_meal": "A meal is served twice on the same slot",
  "plan.validation.cause.energy_off": "A meal is off its target",
  "plan.validation.cause.protein_short": "A day falls short of its protein",
  "plan.validation.cause.protein_over": "A day goes over its protein",
  "plan.validation.cause.unmeasurable": "A portion could not be measured",
  "plan.validation.cause.shopping_missing": "An ingredient is on no shopping line",
  "plan.validation.cause.shopping_short": "A shopping line buys less than the recipe needs",
  "plan.validation.cause.shopping_unused":
    "A shopping line buys food that no recipe uses",
  "plan.validation.cause.shopping_undated": "A shopping line has no day",
  "plan.validation.cause.shopping_too_early": "Something fresh is bought too early",
  "plan.validation.cause.cooking_window": "A dish is eaten outside its cooking window",
  "plan.validation.cause.dangling": "A line of the plan points at nothing",
  "plan.validation.cause.forbidden": "A dish serves something this table excludes",
  "plan.validation.control.shopping_quantity":
    "Enough of an ingredient, when the pantry names no quantity",
  "plan.validation.control.cell_energy": "The energy served at a meal",
  "plan.validation.control.protein_floor": "The protein floor of a day",
  "plan.validation.control.mouth_energy": "The energy served to one person",
  "plan.validation.control.protein_floor_protected":
    "The protein floor, set aside on purpose for a day",
  "plan.validation.control.shopping_not_purchasable":
    "Tap water, measured in the cooking and on no shopping list",
  // ── LES ONZE REFUS DE FUSION (L4) ───────────────────────────────────────
  "plan.refusal.merge_member_required": "That gesture did not say whose plan to fold in.",
  "plan.refusal.merge_member_not_in_household": "That person is not in this household.",
  "plan.refusal.merge_member_is_owner":
    "The household plan is already yours: there is nothing to bring back.",
  "plan.refusal.merge_member_has_no_plan":
    "They have no validated plan of their own to fold in.",
  "plan.refusal.merge_no_household_plan":
    "There is no live household plan to fold into. Compose one first.",
  "plan.refusal.merge_windows_disjoint":
    "Their plan and the household plan share no day, so there is nothing to fold in.",
  "plan.refusal.merge_window_all_past":
    "Every day their plan shares with this one is already behind us.",
  "plan.refusal.merge_window_unreadable": "Those days could not be read.",
  "plan.refusal.merge_plan_vanished": "That plan is no longer readable. Try again.",
  "plan.refusal.merge_member_away_all_window":
    "They are marked away for every meal of those days.",
  "plan.refusal.merge_quota_exhausted":
    "This household has used its merges for the week. Nothing is lost, and it starts again next week.",
  // ── LES SIX REFUS DE DÉFUSION (L5) ──────────────────────────────────────
  "plan.refusal.unmerge_member_required": "That gesture did not say whom to take back out.",
  "plan.refusal.unmerge_member_not_in_household": "That person is not in this household.",
  "plan.refusal.unmerge_member_is_owner":
    "The household plan is yours: there is nobody to take out of it.",
  "plan.refusal.unmerge_member_not_merged":
    "No live household plan has brought them back to this table, so there is nothing to undo.",
  "plan.refusal.unmerge_window_all_past":
    "That household plan has no day left ahead of it. There is nothing left to cook differently.",
  "plan.refusal.unmerge_window_unreadable": "Those days could not be read.",

  // ── LES DEUX REFUS DU BROUILLON ─────────────────────────────────────────
  // Le chemin `draft` ne fait qu'UN saut par rapport à une composition: il
  // n'écrit pas. Ses deux refus disent donc d'abord ce qui n'a PAS bougé —
  // c'est la première peur de quelqu'un qui vient de cliquer sur un aperçu.
  "plan.refusal.draft_not_composed":
    "The preview didn't come through. Nothing was saved and your plan is untouched.",
  // ⛔ Voir le commentaire jumeau dans `fr.ts`: la cause ET la sortie.
  "plan.refusal.day_already_spent":
    "Your day is done: every meal for today has already gone by. Ask for a plan starting tomorrow.",
  "plan.refusal.cell_not_rendered":
    "I couldn't redo that meal. The preview is unchanged — rephrase, or redo the whole plan.",
  "plan.refusal.cell_unknown": "That meal is not in this preview. The preview is unchanged.",
  // ⟳ 2026-09-24 — "Replace".
  "plan.refusal.dish_unknown": "Those dishes are no longer in this preview. It is unchanged.",
  "plan.refusal.dish_not_rendered":
    "I couldn't change those dishes this time. The preview is unchanged: try \"Adjust the plan\" again.",
  "plan.refusal.edit_nothing_to_change":
    "No dish in this preview contains that: it stays as it is. It is kept for your next plans.",
  "plan.refusal.draft_has_no_source": "This preview is no longer available.",
  "plan.refusal.note_unusable":
    "I can't work from that sentence. Say again what you want changed in the plan.",

  // ── LES REFUS DES RPC DE LA PRISE DE MAIN ET DU RÉGLAGE ─────────────────
  "plan.validate.error.not_authenticated": "You are not signed in any more.",
  "plan.validate.error.not_your_plan": "That plan is not yours.",
  "plan.validate.error.plan_retired": "That plan has been replaced.",
  "plan.validate.error.not_a_personal_plan":
    "The household plan is not something to take on — it is already what everyone eats.",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — LES DEUX AUTRES CATALOGUES PARALLÈLES
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `CookingCapacityCard` (28 entrées) et `FoodPreferencesCard` (22) portaient
  // chacune un `COPY` local, comme `MealBuilder`. Trois catalogues hors de
  // `t()` sur un seul écran: c'est ce qui rendait `/app/plan` intraduisible
  // quoi qu'on écrive ici.
  //
  // ── CE QUE CETTE CARTE DÉCIDE VRAIMENT ────────────────────────────────────
  // Le générateur composait des sessions sans rien savoir de quatre choses:
  // quels jours on peut cuisiner, combien de temps, quel niveau de recette,
  // quel budget. Un plan parfait et inapplicable est la première cause
  // d'abandon.
  "plan.cooking.title": "How you cook",
  "plan.cooking.subtitle":
    "What you can actually do in a week. Without this, the plan is built for somebody else.",
  // « Change » et pas « Change this »: le lien est dans l'en-tête de la carte,
  // donc son objet est déjà nommé juste à côté. Aligné sur les cartes voisines.
  "plan.cooking.summary_open": "Change",
  "plan.cooking.summary_edit": "Tell me",
  "plan.cooking.summary_close": "Close",
  "plan.cooking.time_label": "Time per cooking session (approx.)",
  "plan.cooking.time_15": "15 minutes — get in and out",
  "plan.cooking.time_30": "30 minutes",
  "plan.cooking.time_60": "An hour, I do not mind",
  "plan.cooking.difficulty_label": "Recipes",
  "plan.cooking.difficulty_simple": "Simple — few steps, few pans",
  "plan.cooking.difficulty_normal": "Normal",
  "plan.cooking.difficulty_keen": "I like cooking",
  "plan.cooking.variety_label": "Variety",
  "plan.cooking.variety_repeat": "Happy to repeat the same meals",
  "plan.cooking.variety_some": "Some repetition is fine",
  "plan.cooking.variety_varied": "Keep it varied",
  "plan.cooking.budget_label": "Shopping budget",
  "plan.cooking.budget_pick": "Slide to choose your budget",
  // ── ⛔ ICI VIVAIENT LES SIX CLÉS DE « COMMENT TU CUISINES CETTE SEMAINE »
  // Retirées le 2026-09-06 avec le champ et son composant
  // (`CookingShapeField.tsx`, supprimé). Elles disaient « Laisse le plan
  // décider » / « Un seul plat pour tout le monde » / « Une cuisson, des plats
  // un peu différents » / « Chacun le sien ».
  //
  // Motif, à l'écran: « il y a déjà "Comment voulez-vous cuisiner ?" donc
  // pourquoi c'est en double ? ». Les deux questions n'étaient pas la même — le
  // STYLE dit l'effort, la FORME disait la séparation des assiettes — mais les
  // deux s'annonçaient « comment on cuisine », et c'est ce qui a tranché.
  //
  // ⚠️ LE MÉCANISME, LUI, EXISTE TOUJOURS côté serveur: un plafond de forme
  // (`styleCappedShape` → `capCookingShape`). ⟳ 2026-09-25 — ce qui le
  // déclenche n'est plus le style « le moins possible » (parti) mais l'effort
  // `simple`: peu de temps au-dessus du minimum du plan.
  // ⟳ 2026-09-25 — the "cook everything in one go" box is gone: "Once" is an
  // answer to "How many times you want to cook". The hint stays.
  "plan.cooking.one_session_hint": "Leftovers go in the freezer and come out the night before.",
  "plan.cooking.time_minutes": "{n} min",
  "plan.cooking.time_hours": "{n} hr",
  "plan.cooking.time_required": "Say how long a cooking session can last.",
  "plan.cooking.budget_required":
    "Say what this plan can cost. Without a number there is nothing to trade off.",
  // ── LE PLANCHER (2026-09-11) ─────────────────────────────────────────────
  // ⛔ LE REFUS DIT SON CHIFFRE, ET PAS « trop bas ». Un refus sans le montant
  // qui le lèverait laisse la personne deviner par essais successifs — c'est-à-
  // dire un bouton mort avec une phrase dessus.
  //
  // ⚠️ PAS DE SYMBOLE MONÉTAIRE DANS LA CHAÎNE. `{amount}` arrive déjà formaté
  // dans la langue de l'écran, et le champ juste au-dessus n'en porte pas non
  // plus: en poser un ici ferait une phrase en euros sur un compte américain.
  "plan.cooking.budget_below_floor":
    "This budget cannot buy this plan: these meals need at least {amount}. " +
    "Below that, there is no basket to build.",
  // ⛔ CE N'EST PAS UN REFUS, ET LA COPIE NE DOIT PAS EN AVOIR L'AIR. Elle dit
  // ce qui va CHANGER, à quelqu'un dont le budget est parfaitement recevable.
  // « Tu devrais mettre plus » serait un jugement sur son argent.
  "plan.cooking.budget_tight":
    "At this budget the plan leans on pulses, eggs and starches, and some " +
    "dishes will come back more than once.",
  "plan.cooking.save": "Save",
  "plan.cooking.saving": "Saving…",
  "plan.cooking.saved": "Saved.",
  "plan.cooking.no_goal": "Set your goal above first — this is saved alongside it.",
  "plan.cooking.none_picked": "Not set yet",

  // ── CE QUE L'ÉLÈVE A DIT, REMONTÉ DE LA CONVERSATION ──────────────────────
  // ⚠️ LE TITRE COUVRE LES DEUX CHOSES QUE LA CARTE PORTE. Depuis
  // l'élargissement du 2026-08-06, elle ne tient plus seulement des goûts:
  // « travaille de nuit trois fois par semaine » y arrive aussi, parce que
  // c'est elle qui décide de ce qu'on peut raisonnablement proposer à manger.
  // Un titre qui ne parlerait que de goûts ferait passer une contrainte de
  // travail pour un caprice alimentaire — et l'élève la retirerait.
  "plan.told.title": "What you have told me about your eating and your week",
  "plan.told.subtitle":
    "Picked up from your conversations — what you like, and what your week actually allows. Keep what is right, edit it, or drop it: what you keep is used when your week is put together.",
  "plan.told.suggested": "Worth keeping?",
  "plan.told.keep": "Keep",
  "plan.told.keep_like": "Keep: I like it",
  "plan.told.keep_avoid": "Keep: avoid it",
  "plan.told.update": "Update",
  "plan.told.replaces": "replaces",
  "plan.told.recheck_prefix": "You came back to this on",
  "plan.told.recheck_suffix": "— still right?",
  "plan.told.drop": "Not right",
  "plan.told.yours": "Old notes — kept here, they no longer feed the plan",
  "plan.told.edit": "Edit",
  "plan.told.remove": "Remove",
  "plan.told.save": "Save",
  "plan.told.cancel": "Cancel",
  "plan.told.empty":
    "Nothing yet. Tell me in Chat what you like, what you cannot stand, and when your week leaves you no time to cook — it turns up here.",
  "plan.told.no_goal": "Set your goal above first — this is saved alongside it.",
  "plan.told.saving": "Saving…",
  "plan.told.open": "Change",
  "plan.told.close": "Close",
  // Replié, on dit COMBIEN il y en a: « rien » et « quatre lignes que je ne
  // vois plus » sont deux états différents.
  "plan.told.summary_one": "1 thing you have told me",
  "plan.told.summary_many": "{count} things you have told me",
  "plan.told.summary_pending": " · {count} waiting for you",

  // ══════════════════════════════════════════════════════════════════════════
  // LOT 6 · `/app/plan` — L'ÉCRAN LUI-MÊME (`StudentWeekPlanPage`)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 1963 lignes sans un seul `t()`. Les clés vivent sous `plan.*`, à côté des
  // refus de composition qui y sont depuis le lot 2: c'est le même sujet — ce
  // que l'élève règle, et ce que le serveur refuse d'en faire.
  "plan.page.title": "My plan",
  // ⚠️ IL DISAIT « NEVER CALORIE COUNTS », ET FF-059 A RENDU CETTE PHRASE
  // FAUSSE SUR LE MÊME ÉCRAN: mesuré en run réel, « 537 kcal » s'affiche à trois
  // centimètres d'elle. Une promesse contredite par ce qu'on voit en même temps
  // ne coûte pas seulement sa crédibilité — elle apprend à ne pas lire les
  // autres. Ce qui reste est la promesse qui TIENT: rien ici ne note personne.

  // ── LES MOTS COMMUNS DE L'ÉCRAN ───────────────────────────────────────────
  "plan.save": "Save",
  "plan.cancel": "Cancel",
  "plan.change": "Change",
  "plan.add": "Add",
  // Trois points de suspension pendant une écriture. Ce n'est pas un mot, c'est
  // un état — même valeur que `meals.picker.saving`.
  "plan.busy": "…",

  // ── LA CARTE « ABOUT YOU », index de la fenêtre de réglages ──────────────
  "plan.about.title": "About you",
  "plan.about.setup": "Set up",
  "plan.about.done": "Done",
  "plan.about.empty":
    "Four short questions, one window. Your week gets built from your answers — nothing here is shared with your coach.",
  "plan.about.numbers": "Numbers",
  "plan.about.goal": "Goal",
  "plan.about.day": "Your day",
  "plan.about.cooking": "Cooking",
  // ⚠️ « Cooking » DÉCRIVAIT UN RÉGLAGE; ce n'en est plus un. Les jours et
  // la durée sont demandés à chaque composition, et ce que la fiche montre
  // est ce que la DERNIÈRE demande portait. Garder « Cooking » ferait
  // chercher un champ dans une carte qui ne l'a plus.
  "plan.about.last_request": "Last plan asked for",
  "plan.about.told": "Told me",
  // « pas encore réglé » est ce que l'élève doit LIRE pour savoir qu'il reste
  // quelque chose à faire — ce n'est pas un vide à masquer.
  "plan.about.not_set": "Not set yet",

  // ══════════════════════════════════════════════════════════════════════════
  // `/app/plan` ACCUEILLE LA DEMANDE DE PLAN — POUR TOUT LE MONDE
  //
  // ── LE DÉFAUT QUE CE BLOC REFERME ────────────────────────────────────────
  // La demande de plan était éparpillée sur TROIS écrans qui ne posaient pas
  // les mêmes questions: le formulaire de `/app/plan` (fermé au maître), une
  // carte du foyer qui demandait le BUDGET SEUL avec une fenêtre codée en dur,
  // et l'étape « request » du couloir d'entrée — la seule qui demandait les
  // dates et la présence. Trois formulaires pour un geste, et le maître était
  // renvoyé vers le plus pauvre des trois.
  //
  // Tout arrive ici. Ce qui décrit LES GENS reste au foyer (qui mange ici,
  // les corps, les interdits, les invitations); ce qui fabrique LA SEMAINE est
  // sur cet écran.
  // ══════════════════════════════════════════════════════════════════════════
  "plan.request.title": "Ask for a plan",
  // ⚠️ « QUI EST LÀ » ET PAS « COMBIEN DE PERSONNES ». Le générateur du foyer
  // DÉDUIT les couverts de la présence, jour par jour: demander un nombre à
  // côté produirait deux vérités et le serveur ignorerait la nôtre.
  "plan.request.presence_title": "Who eats at home",
  "plan.request.presence_open": "Edit",
  "plan.request.presence_all_home": "Home for every meal",
  "plan.request.presence_away_one": "{n} meal away",
  "plan.request.presence_away_other": "{n} meals away",
  // ⟳ 2026-09-23 — AWAY FOR THE WHOLE PLAN (holidays, a stay elsewhere). The
  // gesture writes every day of the window as a whole day away, in the column
  // that "Edit" already writes (`lib/presenceAbsence.ts`).
  "plan.request.presence_absence": "Away",
  "plan.request.presence_absence_aria": "{name}: away for this whole plan",
  "plan.request.presence_absence_undo": "Undo away",
  "plan.request.presence_absent": "Away — left out of this plan",
  "plan.request.presence_everyone_away":
    "Nobody is home over these dates: there is nothing to compose. Undo an absence or change the dates.",
  "plan.request.presence_you": "You",

  // ── L'ENVIE DE LA SEMAINE (venue de `household.envy.*`) ──────────────────
  //
  // ⚠️ LE TITRE EST LA PHRASE DE L'UTILISATEUR, MOT POUR MOT, EN FRANÇAIS.
  // Elle n'est pas du français canonique et ce n'est pas une coquille: c'est
  // une instruction produit explicite. La corriger est une décision humaine,
  // pas une décision de passage. L'anglais ci-dessous est la traduction du
  // SENS, pas de la faute.
  //
  // ⚠️ ET ELLE S'ÉCRIT SUR LA SEMAINE DU PLAN, PAS SUR CELLE D'AUJOURD'HUI.
  // Le générateur relit l'envie sur le lundi ISO de la DATE DE DÉPART. Tant que
  // la fenêtre était « d'ici dimanche », les deux ancres coïncidaient. Avec
  // deux dates libres, elles divergent — et l'envie disparaît sans erreur.
  "plan.envy.title": "Wishes",
  "plan.envy.placeholder": "Optional — Lea wants pasta, Marc is sick of chicken.",

  // ── QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT (venu de `household.reference.*`) ──
  //
  // ⚠️ LE LIBELLÉ DIT QUI, JAMAIS POURQUOI, et il ne nomme AUCUN objectif.
  // C'est une phrase de méthode; « qui est au régime » serait un verdict lu par
  // toute la table. Le titre plein NOMME les deux personnes et les deux
  // DIRECTIONS DE SERVICE qui s'opposent (`plan.reference.title_pair`) — une
  // direction se lit à voix haute sans blesser, un objectif non.
  //
  // ⚠️ ET IL NE PROMET PAS DE PORTION. Le référent ne change pas la taille de
  // la casserole — elle se dimensionne sur le plus petit besoin de la table.
  // Une copie qui laisserait croire l'inverse vendrait exactement le défaut que
  // FF-043 existe pour empêcher.
  "plan.reference.title": "Whose way of eating the shared dish follows",
  // ── LE TITRE QUAND ON SAIT QUI S'OPPOSE ─────────────────────────────────
  // Il répond à la seule question que l'ancien libellé laissait sans réponse:
  // POURQUOI ON ME DEMANDE ÇA, ET MAINTENANT. Il nomme les deux personnes, que
  // le roster porte déjà.
  //
  // ⛔ ET IL NE DÉTAILLE PAS LES DEUX CONSIGNES DE SERVICE, DÉLIBÉRÉMENT.
  // Les six chaînes de `SERVING_DIRECTION` sont déjà portées DEUX fois
  // (`mealprep.dir.*`, `couples.dir.*`), et les deux portages sont ÉPINGLÉS sur
  // le module par `servingDirections.int.test.ts`. Un troisième portage ici ne
  // le serait par rien: le module a déjà rendu la chaîne de `maintenance` pour
  // `health` pendant des semaines sans que rien n'échoue, et c'est exactement
  // ce que l'absence d'épingle laisse revenir. On nomme donc QUI s'oppose; le
  // `hint` juste en dessous dit ce que le choix change.
  //
  // ⚠️ ET SURTOUT: ON NE NOMME AUCUN OBJECTIF. « Christèle veut perdre du
  // poids » est un verdict lu par toute la table. Une direction de service se
  // lit à voix haute sans blesser; le motif qui la produit, non.
  "plan.reference.title_pair":
    "{first} and {second} do not eat the same way — the shared dish can only follow one of them",
  "plan.reference.hint":
    "When two grown-ups here follow different methods, the shared dish can only follow one of them. Pick whose. It changes what we cook, never how much anyone gets — helpings are worked out per person either way.",
  // LE DÉFAUT, NOMMÉ. « Personne » se lirait comme une panne.
  "plan.reference.default": "Whoever is composing that week",
  "plan.reference.saved": "Saved.",

  // ── « À TABLE » (venu de `household.portions.*`) ─────────────────────────
  // Sous le plan, jamais au-dessus: il dit comment on SERT ce que le plan dit
  // qu'on cuisine. L'inverse ferait lire des parts avant de savoir de quel plat.
  "plan.table.title": "At the table",
  "plan.table.standard": "A standard serving",

  // ── POURQUOI CES JOURS-LÀ (Lot A) ───────────────────────────────────────
  // ⛔ LE SEUL MOT DE CE BLOC QUI VIT ICI. Les phrases elles-mêmes sont
  // assemblées CÔTÉ SERVEUR, dans la langue du contenu, et rendues finies. Un
  // miroir de leurs gabarits dans `frontend/` serait une garde en double, et
  // une garde en double diverge — la cicatrice la plus chère de ce dépôt.
  "plan.rationale.title": "Why those days",
  // ⛔ « Choices », pas « explanations »: le bloc dit ce qui a été ARBITRÉ. Le
  // titre nomme un auteur — le bloc voisin est celui de l'app.
  "plan.explanation.title": "Sophia's choices",

  // ── LE BROUILLON (Lot C) ────────────────────────────────────────────────
  // Un aperçu n'écrit RIEN: ni plan, ni parts, ni quota de fusion. C'est ce que
  // `not_saved` dit à l'écran, et c'est pour ça qu'on peut le refaire.
  "plan.draft.cta": "Preview",
  "plan.draft.working": "Building a preview...",
  // ── LOT B (2026-09-15) · REAL PROGRESS, READ FROM THE ROW ────────────────
  // One line per stage the worker writes (`stage`), plus elapsed time.
  // Before: eight timed messages, the last one frozen for four minutes.
  "plan.progress.composing": "The model is composing the meals…",
  "plan.progress.checking": "Checking every plate…",
  "plan.progress.repairing": "Fixing what didn't hold…",
  "plan.progress.writing": "Saving the plan…",
  "plan.progress.relaunched": "Relaunched once — the first run stopped midway.",
  "plan.progress.elapsed": "{time} elapsed",
  "plan.composing.title": "Your plan is being composed",
  "plan.composing.waiting": "Starting…",
  "plan.composing.steps": "Composition steps",
  "plan.composing.step_composing": "Compose",
  "plan.composing.step_checking": "Check",
  "plan.composing.step_repairing": "Fix",
  "plan.composing.step_writing": "Tidy up",
  "plan.composing.eta": "Two to three minutes on average.",
  "plan.composing.keeps_current": "Your current plan stays in place until you adopt the new one.",
  // ── LOT D · LE RETOUR DE FIN DE PLAN ────────────────────────────────────
  // ⚠️ LES LIBELLÉS DES QUESTIONS NE SONT PAS ICI, et c'est délibéré: ils
  // vivent dans `_shared/keel/plan_feedback.ts`, dans les DEUX langues, avec
  // leur lecteur nommé à côté. Les recopier en clés d'écran ferait deux tables
  // de la même question, et celle qu'on regarde le moins garderait l'ancien
  // mot. Ce qui est ici est le CHROME: le titre, les deux gestes, et les
  // en-têtes des deux blocs que l'écran assemble lui-même.
  //
  // ⛔ AUCUNE PHRASE NE DEMANDE CE QUI A ÉTÉ MANGÉ NI CE QUI A ÉTÉ TENU. On
  // évalue le plan, jamais la personne.
  "plan.feedback.title": "This plan is over",
  "plan.feedback.intro":
    "A few things about the plan itself — what it asked of you, not what you " +
    "did with it. Nothing here is required.",
  "plan.feedback.dishes_title": "The dishes in it",
  "plan.feedback.dishes_hint":
    "Mark the ones worth having again, and the ones to leave out.",
  "plan.feedback.again": "Again",
  "plan.feedback.not_again": "Not again",
  "plan.feedback.envy_title": "Anything you fancy next",
  "plan.feedback.envy_hint":
    "One line, for the whole table. It goes to next week’s plan.",
  "plan.feedback.envy_placeholder": "Léa wants pasta, Marc is done with chicken",
  "plan.feedback.anything_else_placeholder":
    "Léa has dance on Tuesdays, we eat late on Fridays",
  "plan.feedback.send": "Send",
  "plan.feedback.sending": "Sending…",
  "plan.feedback.dismiss": "Not now",
  "plan.draft.title": "What your plan would look like",
  "plan.draft.tour": "Guided tour",
  // ⛔ 2026-09-20 — removed with the block's heading, on request (no reader):
  //   · plan.draft.note_label / plan.draft.note_hint
  "plan.draft.note_placeholder": "Too much fish, and more pasta for the kids.",
  // See `fr.ts`: one key for both steps of the gesture — it opens the
  // writing area, and the button beside the field sends it. `note_send`
  // ("Confirm") was removed.
  "plan.draft.remix": "Adjust the plan",
  "plan.draft.adopt": "Adopt this plan",
  "plan.draft.adopt_replace": "Replace my plan with this one",
  "plan.draft.adopting": "Saving...",
  "plan.draft.discard": "Drop it",
  // ⟳ 2026-09-20 — REMOVED FROM THE SCREEN, ON REQUEST (no reader left):
  //   · plan.draft.not_saved        "Nothing is saved yet."
  //   · plan.draft.adopt_recomposes "Adopting revalidates this preview…"
  // Both opened the preview dialog with contract text before the plan itself.
  // What they said still holds in code — it is just no longer written out.
  // ⟳ 2026-09-10 · LOT 7 — CE QU'UN MEMBRE SECONDAIRE LIT À LA PLACE DU BOUTON.
  // ⛔ ELLE NE FAIT ATTENDRE PERSONNE. Pas de « your plan is being prepared »:
  // rien n'est en cours, et une copie qui le laisserait croire ferait guetter
  // un écran qui ne changera pas. Elle dit QUI compose, et où se lit sa part.
  "plan.draft.owner_composes":
    "Whoever runs the household builds the week. Your share is just below, with what you eat and how much.",
  "plan.draft.note_too_long": "Too long. Say it in one sentence.",
  "plan.draft.note_rejected":
    "I can't work from that sentence. Say again what you want changed in the plan.",
  // ⚠️ LE PLAFOND SE DIT AVANT D'ÊTRE HEURTÉ, jamais découvert en le heurtant:
  // un bouton qui se désactive sans prévenir se lit comme une panne, et
  // quelqu'un qui aurait su qu'il lui restait UNE reprise aurait écrit une
  // autre phrase.
  "plan.draft.chars_left": "{count} characters left",
  // ⚠️ LE FAIT, JAMAIS LE MOTIF. Nommer la raison d'une clause écartée dirait à
  // quelqu'un qu'il est sous plancher TCA. Le motif reste interne et compté.
  "plan.draft.note_partial": "Part of what you wrote wasn't used. The rest was.",
  "plan.draft.note_nothing": "I found nothing to change in what you wrote. The plan is redone as is.",
  "plan.draft.note_who_unknown": "I couldn't tell who you meant, so I changed nothing. Name the person.",
  "plan.draft.question_who": "You wrote “{text}” — who is that for?",
  "plan.draft.question_none": "None of them",
  "plan.draft.question_skipped": "OK, I changed nothing for that sentence.",
  // ⟳ 2026-09-24 — QUESTIONS IN A LAYER, and "REPLACE" A DISH.
  "plan.draft.questions_title": "Before I redo the plan",
  "plan.draft.questions_continue": "Continue",
  "plan.draft.replace_title": "Why change this dish?",
  "plan.draft.replace_label": "Your reason (required)",
  "plan.draft.replace_placeholder": "E.g. too sweet, Paul doesn't like mushrooms, takes too long…",
  "plan.draft.replace_cancel": "Cancel",
  "plan.draft.replace_confirm": "Confirm",
  // ⟳ 2026-09-24 — "it also fits…": the same reason, offered for other dishes.
  "plan.draft.same_reason_looking": "Checking whether your reason fits other dishes…",
  "plan.draft.same_reason_title": "Your reason may also fit these dishes",
  "plan.draft.same_reason_skip": "No thanks",
  "plan.draft.same_reason_confirm_one": "Strike this one too",
  "plan.draft.same_reason_confirm_many": "Strike these {count} too",
  "plan.draft.struck_one": "1 dish to change",
  "plan.draft.struck_many": "{count} dishes to change",
  "plan.draft.struck_cap": "At most {max} dishes at once: adjust these first.",
  "plan.draft.dishes_replaced_one": "I changed 1 dish; the rest is identical ({kept} dishes kept as they were).",
  "plan.draft.dishes_replaced_many": "I changed {count} dishes; the rest is identical ({kept} dishes kept as they were).",
  "plan.draft.dishes_extended_one": "I also redid {dishes}: it contained a food you just ruled out.",
  "plan.draft.dishes_extended_many": "I also redid {dishes}: they contained a food you just ruled out.",
  "plan.draft.dishes_not_replaced": "Some dishes couldn't be changed this time ({count}): they stayed as they were.",
  "plan.draft.rejected_filed_one": "This dish is now in your turned-down dishes (“What Sophia knows about you”).",
  "plan.draft.rejected_filed_many": "These {count} dishes are now in your turned-down dishes (“What Sophia knows about you”).",
  "plan.draft.safety_not_written":
    "I couldn’t save this to the sheet: {lines}. Add it from the household sheet.",
  "plan.draft.cells_applied": "I redid {cells}; the rest is identical ({count} dishes kept as they were).",
  "plan.draft.note_at_edge": "Got it — but that is already at the end of the scale, there is no notch left to move.",
  "plan.draft.note_skipped": "I read it, but that is not something I can adjust from here yet. The plan is redone as is.",

  // ── LA PART DU RÉCLAMÉ (Lot E) ──────────────────────────────────────────
  // ⚠️ CETTE CARTE N'AFFICHE JAMAIS un objectif, un poids, une calorie, ni le
  // POURQUOI d'une part. `portion_note` est une INSTRUCTION DE SERVICE, garantie
  // sans raison ni vocabulaire de corps côté serveur — c'est ce qui permet de
  // l'afficher: l'instruction est publique, le pourquoi ne l'est pas.
  "plan.mine.title": "Your share",
  "plan.mine.standard": "A standard serving",
  "plan.mine.request_change": "Ask for a change",
  "plan.mine.change_label": "What you'd like changed",
  "plan.mine.change_sent": "Sent to the household.",
  "plan.mine.household_dishes": "What the house is cooking",

  // ── UN PLAN PAR PERSONNE (2026-08-14) ────────────────────────────────────
  // Remplace « à table », retirée le même jour: les MÊMES parts, mais dans la
  // grille, à côté du plat qu'elles servent. Ce n'est pas une perte, c'est un
  // déplacement — l'ancienne carte récitait la table entière loin du plan.
  //
  // ⚠️ MÊME RÈGLE QUE `plan.mine.*`, ET ELLE EST PLUS EXPOSÉE ICI: aucun
  // objectif, aucun poids, aucune calorie, aucun POURQUOI de part. Ces écrans
  // se lisent À TABLE, devant tout le monde. L'instruction de service est
  // publique, le motif qui la produit ne l'est pas.

  // ── LES CINQ SECTIONS DE LA FENÊTRE ──────────────────────────────────────
  "plan.section.basics.title": "Basic info",
  "plan.section.basics.intro":
    "Who you are and where you are now. Used to size your portions.",
  "plan.section.goal.title": "Your goal",
  "plan.section.goal.intro":
    "What you are after. It decides what your plan brings forward for you.",
  // ── ⟳ LOT 5 · LES CHIFFRES, DANS LA FENÊTRE « À PROPOS DE TOI » ─────────
  //
  // ⚠️ « Numbers », PAS « Calories ». Le fronton est lu par quelqu'un qui vient
  // régler autre chose; le mot « calories » y transformerait un réglage en
  // sujet. Les deux BOUTONS, eux, disent « calories » — parce qu'ils sont le
  // geste, et qu'un geste doit nommer ce qu'il fait.
  //
  // ⚠️ L'INTRO NE VEND RIEN ET NE PRÉVIENT DE RIEN. Ni « utile pour perdre du
  // poids » (ce serait un argument pour compter), ni « attention aux troubles
  // du comportement alimentaire » (ce serait un avertissement adressé à qui
  // vient d'ouvrir un menu). Elle dit d'où vient le chiffre et qu'il obéit.
  //
  // ⚠️ PAS « Numbers » TOUT COURT — mesuré à l'écran le 2026-09-01: la carte
  // rend déjà un libellé « Numbers » (`plan.about.numbers`, la taille et le
  // poids) à trois centimètres de là. Deux frontons du même mot dans le même
  // flux, pour deux choses sans rapport.
  //
  // ⚠️ ET L'INTRO NE REDIT PAS LA PHRASE DE LA RANGÉE. Elle portait « Turn it
  // off and it goes quiet everywhere », que `meals.energy.switch_hint` dit déjà
  // deux lignes plus bas — vu en double à l'écran. L'intro dit D'OÙ VIENT le
  // chiffre; la rangée dit qu'il obéit.
  "plan.section.numbers.title": "What your plan shows",
  "plan.section.numbers.intro":
    "Whether your plan shows what it adds up to — worked out from the quantities in it, never guessed.",
  "plan.section.day.title": "How your day runs",
  "plan.section.day.intro":
    "Tick the moments you actually eat. Nothing you did not name, none of yours dropped.",
  "plan.section.cooking.title": "How you cook",
  "plan.section.cooking.intro":
    "Which days you can cook, and for how long. Your sessions get built around this.",
  "plan.section.told.title": "What you have told me",
  "plan.section.told.intro":
    "Picked up from your conversations. Keep what is right, edit it, or drop it.",

  // ── LES SIX DYNAMIQUES ───────────────────────────────────────────────────
  // ⚠️ LES JETONS RESTENT ANGLAIS (R1) — ils sont dans le CHECK de
  // `student_goals.goal`, dans `goalScope` et dans les lignes déjà en base.
  // Seuls ces mots-ci se traduisent.
  //
  // Les trois premières légendes sont écrites autour de LA MÊME CHOSE: le sens
  // de l'aiguille. C'est le seul critère qu'un élève peut s'appliquer sans se
  // tromper, et c'est aussi, mot pour mot, ce que `directionIsWorking` mesure
  // ensuite dans `student_body.ts`. Si l'une change, l'autre est fausse.
  //
  // « Lose weight » et pas « Lose fat »: le second demande à l'élève de savoir
  // ce qu'il perd, ce que personne ne sait avant de commencer.
  "plan.goal.fat_loss.label": "Lose weight",
  "plan.goal.fat_loss.blurb":
    "You want the scale to come down — without the week becoming unlivable.",
  "plan.goal.muscle_gain.label": "Build muscle",
  "plan.goal.muscle_gain.blurb": "You want to gain, on purpose, and mostly as muscle.",
  // ── LES TROIS RETIRÉS, ET OÙ EST LEUR RAISON ──────────────────────────
  // `recomposition`, `performance` et `health` avaient leur libellé ici. Le
  // socle les a retirés le 2026-08-18 (`GOAL_TOKENS`, `RETIRED_GOAL_TOKENS`
  // dans `_shared/keel/tokens.ts`, qui porte le pourquoi et le repli sur
  // `maintenance`); leurs clés sont parties le 2026-09-11. Rien ne peut plus
  // les demander: les lecteurs bouclent sur `GOAL_TOKENS`, pas sur une liste
  // écrite à côté.
  "plan.goal.maintenance.label": "Hold what I have",
  "plan.goal.maintenance.blurb":
    "You are where you want to be. Keep it, with the lightest possible load.",
  "plan.goal.legend": "What you are after",

  // ── LA CIBLE DE LA DYNAMIQUE CHOISIE ─────────────────────────────────────
  "plan.goal.target_weight": "Weight I am aiming for",
  "plan.goal.target_waist": "Waist I am aiming for",
  "plan.goal.target_band": "Weight I want to stay around",
  "plan.goal.optional": "optional",
  "plan.goal.target_hint": "It sets the direction your portions are sized for. It is not a deadline, and nobody is scored against it.",
  // L'AXE, pour les deux dynamiques qu'aucun chiffre ne porte. Les six valeurs
  // sont celles du point du dimanche (`chat.weekly.axis.*`): l'objectif est
  // mesurable sans une saisie de plus.
  "plan.goal.axis_label": "The one thing I want to see improve",
  "plan.goal.axis_none": "Nothing in particular",
  "plan.goal.axis_hint": "One of the six you rate on Sunday — nothing extra to fill in.",
  "plan.goal.axis_unrated": "Nothing rated yet — you set this at Sunday's check-in.",
  "plan.goal.axis_last_sunday": "Last Sunday: {value} out of 5.",
  "plan.goal.axis_rising": "{axis} is going up — that is the one you picked.",
  "plan.goal.axis_falling": "{axis} is going down.",
  "plan.goal.axis_steady": "{axis} is holding steady.",
  // ⚠️ CETTE PHRASE EST CE QUI RENDAIT LA TABLE D'AXES INTRADUISIBLE. Elle
  // était « working on ${label.toLowerCase()} » — un gabarit anglais autour
  // d'une étiquette d'une troisième table locale. Baisser la casse d'un mot ne
  // le traduit pas, et la phrase française ne se compose pas comme l'anglaise.
  "plan.goal.working_on": "working on {axis}",
  "plan.goal.own_words": "In your own words",
  "plan.goal.own_words_placeholder": "Play football with my kids without being wrecked",
  "plan.goal.own_words_hint": "Optional. Why this matters to you — better than a number.",

  // ── LES TROIS FAITS DURABLES, ET LES DEUX MESURES ────────────────────────
  "plan.measures.height": "Height",
  "plan.measures.age": "Age",
  "plan.measures.sex": "Sex",
  "plan.measures.weight": "Weight",
  "plan.measures.waist": "Waist",
  "plan.measures.target": "Target",
  "plan.gender.female": "Female",
  "plan.gender.male": "Male",
  "plan.gender.other": "Other",
  // FF-031: la granularité de stockage n'est plus la semaine, donc la date
  // affichée ne l'est plus non plus — sauf pour une mesure d'AVANT la reprise,
  // où la semaine est la seule chose vraie qu'on puisse dire.
  "plan.measures.week_of": "week of {date}",
  "plan.measures.since_sunday":
    "Weighed yourself since Sunday? It goes to the same place as your Sunday check-in.",
  "plan.measures.none_yet": "No weight recorded yet. Add one above, or at Sunday's check-in.",
  "plan.measures.one_more":
    "One more entry and this can start showing a direction — a single measurement on its own is just a number.",
  // ⚠️ LE TROISIÈME ÉTAT MANQUAIT, ET SON ABSENCE FAISAIT AFFIRMER UN VERDICT.
  // « Tu es sorti de ta fourchette » suppose une fourchette; sans référence
  // saisie, `insideBand` vaut `null` et on ne conclut RIEN.
  "plan.measures.band_unset":
    "Set the weight you want to stay around and this will tell you when you drift.",
  "plan.measures.weeks_in_range_one": "{count} week inside your range.",
  "plan.measures.weeks_in_range_many": "{count} weeks inside your range.",
  "plan.measures.drifted": "You have drifted outside your range.",
  "plan.measures.week_by_week": "Week by week",
  "plan.measures.col_week": "Week",
  "plan.measures.col_change": "Change",

  // ── LA PHRASE DE TENDANCE (`api/bodyMeasures.ts`) ────────────────────────
  // ⚠️ ELLE SORTAIT LE JETON BRUT: « your weight is rising ». Un couple par
  // mesure et par tendance, parce que le verbe français dépend de la MESURE
  // qu'il décrit — un poids monte, un tour de taille se réduit — et qu'un
  // adjectif interpolé demanderait un accord que `t()` ne sait pas faire.
  //
  // Ce qu'elle ne fait JAMAIS: féliciter ou réprimander. Quand la direction se
  // produit on le CONSTATE; quand elle ne se produit pas, on ne dit rien de plus
  // que la mesure — `student_body.ts` documente la même symétrie côté serveur.
  // ⚠️ L'ANGLAIS EST MOT POUR MOT CELUI D'AVANT (« your weight is rising »):
  // ce lot rend la phrase TRADUISIBLE, il ne la réécrit pas.
  // `bodyMeasures.int.test.ts` la compare au caractère près.
  "plan.trend.weight.rising": "your weight is rising",
  "plan.trend.weight.falling": "your weight is falling",
  "plan.trend.weight.stable": "your weight is stable",
  "plan.trend.waist.rising": "your waist is rising",
  "plan.trend.waist.falling": "your waist is falling",
  "plan.trend.waist.stable": "your waist is stable",
  "plan.trend.and": " and ",
  "plan.trend.asked_for": "{observed} — that is what this goal is asking for.",

  // ── LA LIGNE REPLIÉE ─────────────────────────────────────────────────────
  "plan.summary.aiming_weight": "aiming for {value} kg",
  "plan.summary.aiming_waist": "aiming for {value} cm",
  "plan.summary.staying_around": "staying around {value} kg",
  "plan.summary.quoted": "“{text}”",
  "plan.summary.kept_one": "{count} thing kept",
  "plan.summary.kept_many": "{count} things kept",

  // ── LA SAISIE, ET CE QU'ELLE REFUSE ──────────────────────────────────────
  "plan.input.numbers_only": "{field}: numbers only.",
  "plan.input.out_of_range": "{field}: expected between {min} and {max}.",
  // BORNES LARGES, ET ELLES EXISTENT QUAND MÊME: elles n'attrapent pas une
  // erreur d'un an, elles attrapent le doigt qui glisse sur le siècle — après
  // quoi l'âge dérivé est absurde et personne ne voit d'où il vient.
  "plan.error.birth_date": "That date of birth does not look right.",
  "plan.error.unknown_value": "Unknown value.",
  "plan.error.no_profile": "Nothing was saved — we could not find your profile.",
  "plan.error.nothing_to_save": "Nothing to save — fill in a weight or a waist.",
  "plan.error.could_not_save": "could not save",
  // « tu n'as pas encore de plan » et « on n'a pas pu le lire » sont deux
  // phrases différentes, et montrer la première pour la seconde invite l'élève
  // à recomposer par-dessus quelque chose qui existe.
  "plan.error.load": "We could not load your week.",
  "plan.error.failed": "That did not go through.",
  // ⟳ 2026-09-04 — voir le commentaire jumeau dans `fr.ts`: la phrase dit les
  // DEUX faits (elle commence demain, elle est plus courte d'un jour) et ne
  // reproche jamais une absence.
  //
  // RETIRÉES PAR CE LOT (la case « je cuisine la veille » n'existe plus, et
  // `CookDayBeforeField.tsx` est supprimé — vérifié appelant par appelant):
  //   · plan.cooking.day_before_label
  //   · plan.cooking.day_before_hint
  //   · plan.cooking.day_before_starts_today
  //   · plan.cooking.day_before_no_room
  //
  // ── ⟳ 2026-09-25 · HOW MANY TIMES, AND HOW LONG ─────────────────────────
  // See the twin block in `fr/plan.ts` for the why of each sentence.
  "plan.cooking.sessions_label": "How many times you want to cook",
  "plan.cooking.sessions_unset": "Not answered yet",
  "plan.cooking.sessions_1": "Once",
  "plan.cooking.sessions_2": "Twice",
  "plan.cooking.sessions_3": "Three times",
  "plan.cooking.sessions_4": "Four times",
  "plan.cooking.sessions_only_one":
    "A one-day plan is cooked in a single session.",
  "plan.cooking.sessions_needs_freezer":
    "Without a freezer, a cooked dish keeps {d} days in the fridge: for {n} " +
    "days, you need to cook at least {min} times. To cook less often, tick " +
    "the freezer under \"What you cook with\".",
  "plan.cooking.sessions_required": "Say how many times you want to cook.",
  "plan.cooking.time_unset": "Not answered yet",
  "plan.cooking.time_band_30": "30 min",
  "plan.cooking.time_band_60": "1 h",
  "plan.cooking.time_band_90": "1 h 30",
  "plan.cooking.time_band_120": "2 h",
  "plan.cooking.time_band_150": "2 h 30",
  "plan.cooking.time_minimum":
    "Each session covers up to {d} days of meals: allow at least \"{band}\".",
  "plan.cooking.time_minimum_one_day":
    "Each session covers one day of meals: allow at least \"{band}\".",
  "plan.cooking.runs_label": "Food shops",
  "plan.cooking.runs_unset": "Not answered yet",
  "plan.cooking.runs_any": "No preference — the plan decides",
  "plan.cooking.runs_one": "Once",
  "plan.cooking.runs_two": "Twice",
  "plan.cooking.runs_three": "Three times",
  // ── L'OFFRE (2026-09-04) — chaque phrase est un MOTIF, jamais
  // « indisponible ». ⟳ 2026-09-25 — toutes s'affichent SOUS la liste: une
  // seule réponse possible est sélectionnée, la phrase dit pourquoi.
  "plan.cooking.runs_only_one_session":
    "You cook once: one food shop is enough.",
  // ⟳ 2026-09-04 (soir) — le plafond n'est pas le nombre de JOURS mais la
  // CONSERVATION: un lot couvre trois jours, donc deux jours ne demandent
  // qu'une course. « Two » est le seul nombre écrit, et un test le tient.
  "plan.cooking.runs_only_one_batch":
    "What you cook at the start keeps until the end of the plan.",
  "plan.cooking.runs_capped_days":
    "Two food shops cover {n} days: a cooked dish keeps for {d}.",
  // ⟳ 2026-09-25 — the session cap replaces the style cap.
  "plan.cooking.runs_capped_sessions":
    "You cook {k} times, so there are no more than {k} trips to the shop.",
  "plan.request.equipment_required":
    "Needed before the plan can start: tick at least what you have.",

  //
  // A8.3 — LE LECTEUR DU RESTE. La boîte d'une part non mangée, rendue là où la
  // part se lit: la carte du réclamé et le bloc jour du maître.
  //
  // ⚠️ AUCUNE DE CES DEUX PHRASES NE S'AFFICHE SUR UNE SUPPOSITION. C'est
  // `boxStillWaiting` qui décide, et il refuse un `not_eaten` sans suite comme
  // un jour de report DÉPASSÉ — « on ne sait pas » n'est pas « elle t'attend »,
  // et une boîte reportée à hier n'est plus une boîte. Les rendre sans passer
  // par cette décision serait le mensonge exact que FF-057 existe pour corriger.
  //
  // ⚠️ DEUX CLÉS ET PAS UNE, parce que la personne concernée change la phrase:
  // le maître lit « la boîte de Cy », la personne lit « ta boîte ». Une seule
  // clé avec un `{name}` vide dirait « la boîte de , encore au frigo ».
  "plan.box.still_fridge": "Your box from {day}, still in the fridge",
  "plan.box.still_fridge_named": "{name} — box from {day}, still in the fridge",
  // ══ ⟳ 2026-09-25 · THE DEMO PLAN AND ITS TOUR (`plan/demo`) ═════════════
  // Shown while a real plan is being composed. Everything in the demo is made
  // up, and every sentence makes that clear.
  "plan.demo.badge": "Demo",
  "plan.demo.banner_title": "Demo plan",
  "plan.demo.intro_title": "A quick tour, while your plan is on its way?",
  "plan.demo.intro_body":
    "Your plan is being composed: it takes two to three minutes. Meanwhile, we'll show you how to read the preview, on a sample plan with made-up data.",
  "plan.demo.intro_go": "Let's go",
  "plan.demo.intro_skip": "Skip",
  "plan.demo.invite": "While your plan is being composed, see how it reads on a sample plan.",
  "plan.demo.show": "See the demo plan",
  "plan.demo.tour_counter": "Step {n} of {total}",
  "plan.demo.tour_prev": "Back",
  "plan.demo.tour_next": "Next",
  "plan.demo.tour_done": "Done",
  "plan.demo.tour_skip": "Skip the tour",
  "plan.demo.step_recap_title": "The summary",
  "plan.demo.step_recap_body":
    "The week at a glance: shopping days, time spent cooking, and the day's calories for each person with a goal.",
  "plan.demo.step_rail_title": "The days",
  "plan.demo.step_rail_body": "Pick a day: everything about it shows just below.",
  "plan.demo.close": "Close the demo",
  "plan.demo.not_real":
    "This is a demo: nothing is saved. Your real plan will open in its place as soon as it's ready.",
  "plan.demo.step_groceries_title": "The day's shopping",
  "plan.demo.step_groceries_body":
    "Each day starts with what you do before eating. First the shopping: “See the list” opens everything to buy that day, sorted by aisle.",
  "plan.demo.step_session_title": "The cooking session",
  "plan.demo.step_session_body":
    "Then what you cook ahead, in one go. “See the detail” opens the session: the Preparation, then the Boxing.",
  "plan.demo.step_preparation_title": "The Preparation",
  "plan.demo.step_preparation_body":
    "The recipes to cook during the session, with their ingredients and method. “Overall run-through”, at the end of the line, says in which order to start everything.",
  "plan.demo.step_boxing_title": "The Boxing",
  "plan.demo.step_boxing_body":
    "After cooking, you fill one box per meal and per person. Each box carries its label — who, which day, which meal — and what goes in, to the gram. On the day, you just take it out of the fridge.",
  "plan.demo.step_menu_title": "On the menu",
  "plan.demo.step_menu_body":
    "Then the meals, moment by moment. Click a dish to open it: what to do at mealtime, and the boxes to take out of the fridge.",
  "plan.demo.step_adjust_title": "Adjust the plan: 2 ways",
  "plan.demo.step_adjust_body":
    "Something doesn't suit you? Press “Change” on a dish, or “Adjust the plan” at the bottom to say it in a few words.",
  "plan.demo.step_way1_title": "Way 1 of 2 — Change a dish",
  "plan.demo.step_way1_body":
    "The first: “Change” on a dish, and say why. Sophia suggests the other dishes it applies to, then “Adjust the plan” recomposes the ones you struck.",
  "plan.demo.step_way2_title": "Way 2 of 2 — Say what you want changed",
  "plan.demo.step_way2_body":
    "The second, without going through a dish: “Adjust the plan”, then say what you want changed. Sophia recomposes the plan and keeps what suits you.",
  "plan.demo.note_example": "Less rice, and more vegetables in the evening.",
  "plan.demo.step_end_body_ready":
    "Your plan is ready: it opens when you finish.",
  "plan.demo.ready_in_tour": "Your real plan is ready — it will open at the end of the tour.",
  "plan.demo.stopped":
    "Composing your plan stopped: finish the tour to see what happened.",
  "plan.demo.step_end_title": "Over to you",
  "plan.demo.step_end_body":
    "That's it. Your plan will open as soon as it's ready.",
} as const
