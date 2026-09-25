"""Les trois foyers du banc du 2026-09-25 — comptes `banc0925.*@keeltest.dev`, mot de passe 1234567."""

CAS = {
    # ── A · SOLO, sèche forte, végétarienne, allergie arachide, sans four ni
    #        congélateur, 30 min, une course, petit budget, 4 jours, 2 sessions.
    "A": {
        "email": "banc0925.a.camille@keeltest.dev",
        "nom": "Camille",
        "profile": {"birth_date": "1996-04-11", "gender": "female", "height_cm": 158},
        "weight_kg": 64.0,
        "goal": "fat_loss", "pace": 0.75, "target": 55.0,
        "diet": "vegetarian",
        "pc": {
            "kitchen_equipment": ["stovetop", "microwave", "blender"],
            "cooking_time_min": 30, "grocery_runs": 1, "budget_amount": 35,
            "recipe_difficulty": "simple", "variety": "repeat",
            "eating_rhythm": [
                {"slot": "breakfast", "at": None, "size": "small"},
                {"slot": "lunch", "at": None, "size": "medium"},
                {"slot": "snack_pm", "at": None, "size": "small"},
                {"slot": "dinner", "at": None, "size": "medium"},
            ],
        },
        "membres": [
            {"owner": True, "prenom": "Camille", "birth_date": "1996-04-11",
             "body": (158, 64, "female", "seated", "3_4", "small"),
             "allergies": ["arachides"], "exclusions": [("champignons", "mushroom", "Je n'aime pas les champignons")],
             "habits": [
                 {"kind": "household_dish", "slot": "breakfast", "usual": ""},
                 {"kind": "household_dish", "slot": "lunch", "usual": "", "side_courses": {"dessert": True}},
                 {"kind": "own_usual", "slot": "snack_pm", "usual": "un yaourt et une pomme"},
                 {"kind": "household_dish", "slot": "dinner", "usual": "", "light": True, "side_courses": {"starter": True}},
             ]},
        ],
        "envie": "J'ai envie de cuisine asiatique cette semaine, et pas trop de pâtes.",
        "window": {"starts_on": "2026-09-28", "duration_days": 4},
        "sessions": 2,
    },
    # ── B · FAMILLE DE QUATRE, 7 jours, 3 sessions, tout l'équipement.
    #        Père en prise de muscle + shaker + sans porc ; mère pescétarienne
    #        en perte ; ado allergique au lactose absent le midi en semaine ;
    #        enfant de 6 ans sans gluten absente le midi en semaine.
    "B": {
        "email": "banc0925.b.karim@keeltest.dev",
        "nom": "Karim",
        "profile": {"birth_date": "1988-02-17", "gender": "male", "height_cm": 188},
        "weight_kg": 86.0,
        "goal": "muscle_gain", "pace": 0.25, "target": 90.0,
        "diet": None,
        "pc": {
            "kitchen_equipment": ["oven", "stovetop", "microwave", "freezer", "air_fryer", "pressure_cooker", "blender"],
            "cooking_time_min": 90, "grocery_runs": 2, "budget_amount": 140,
            "recipe_difficulty": "normal", "variety": "varied",
            "eating_rhythm": [
                {"slot": "breakfast", "at": None, "size": "large"},
                {"slot": "snack_am", "at": None, "size": "medium"},
                {"slot": "lunch", "at": None, "size": "large"},
                {"slot": "snack_pm", "at": None, "size": "medium"},
                {"slot": "dinner", "at": None, "size": "large"},
            ],
            "fixed_intakes": [
                {"days": [], "slot": "snack_pm", "unit": "g", "label": "shaker whey", "amount": 30,
                 "food_ref": "declared_shaker_whey", "nutrition": "declared", "replaces_meal": False,
                 "serving_grams": 30, "protein_g_per_serving": 24, "energy_kcal_per_serving": 120},
            ],
        },
        "membres": [
            {"owner": True, "prenom": "Karim", "birth_date": "1988-02-17",
             "body": (188, 86, "male", "physical_job", "3_4", "large"),
             "exclusions": [("porc", "pork_filet_mignon", "Pas de porc pour moi, jamais")],
             "habits": [
                 {"kind": "household_dish", "slot": "lunch", "usual": "", "side_courses": {"dessert": True}},
                 {"kind": "household_dish", "slot": "dinner", "usual": "",
                  "side_courses": {"bread": True, "cheese": True, "dessert": True}},
             ]},
            {"prenom": "Inès", "birth_date": "1991-06-03", "goal": "fat_loss", "pace": 0.25, "target": 57.0,
             "body": (164, 61, "female", "seated", "1_2", "average"),
             "diet": "pescatarian",
             "rhythm": [("breakfast", "small"), ("lunch", "medium"), ("dinner", "medium")],
             "away": [{"day": "wed", "kind": "away", "slots": ["dinner"]}],
             "habits": [
                 {"kind": "household_dish", "slot": "lunch", "usual": "", "side_courses": {"starter": True}},
             ]},
            {"prenom": "Yanis", "birth_date": "2012-03-09", "goal": None,
             "body": (163, 50, "male", "on_feet", "3_4", "large"),
             "allergies": ["lactose"], "restrictions": ["épinards"],
             "rhythm": [("breakfast", "medium"), ("lunch", "large"), ("snack_pm", "medium"), ("dinner", "large")],
             "away": [{"day": d, "kind": "away", "slots": ["lunch"]} for d in ("mon", "tue", "thu", "fri")]},
            {"prenom": "Lina", "birth_date": "2019-11-20", "goal": None,
             "body": (118, 21, "female", "on_feet", "none", "small"),
             "diet": "gluten_free",
             "rhythm": [("breakfast", "small"), ("lunch", "small"), ("snack_pm", "small"), ("dinner", "small")],
             "away": [{"day": d, "kind": "away", "slots": ["lunch"]} for d in ("mon", "tue", "thu", "fri")],
             "habits": [
                 {"kind": "household_dish", "slot": "dinner", "usual": "", "side_courses": {"dessert": True}},
             ]},
        ],
        "envie": "On aimerait des lasagnes et un curry de poisson.",
        "window": {"starts_on": "2026-09-26", "duration_days": 7},
        "sessions": 3,
    },
    # ── C · COLOCATION DE TROIS ADULTES, 3 jours, UNE session, four + plaques,
    #        ni congélateur ni micro-ondes, 150 min, une course, budget serré.
    #        Grosse perte à 1 kg/sem ; végane sportive allergique soja + fruits
    #        à coque ; senior allergique poisson + sésame, sans épices fortes.
    "C": {
        "email": "banc0925.c.thomas@keeltest.dev",
        "nom": "Thomas",
        "profile": {"birth_date": "1979-09-01", "gender": "male", "height_cm": 176},
        "weight_kg": 104.0,
        "goal": "fat_loss", "pace": 1.0, "target": 85.0,
        "diet": None,
        "pc": {
            "kitchen_equipment": ["oven", "stovetop"],
            "cooking_time_min": 150, "grocery_runs": 1, "budget_amount": 45,
            "recipe_difficulty": "keen", "variety": "some",
            "eating_rhythm": [
                {"slot": "breakfast", "at": None, "size": "medium"},
                {"slot": "lunch", "at": None, "size": "large"},
                {"slot": "dinner", "at": None, "size": "large"},
            ],
        },
        "membres": [
            {"owner": True, "prenom": "Thomas", "birth_date": "1979-09-01",
             "body": (176, 104, "male", "seated", "none", "large"),
             "habits": [
                 {"kind": "own_usual", "slot": "breakfast", "usual": "un café noir, rien d'autre"},
             ]},
            {"prenom": "Jade", "birth_date": "2001-01-15", "goal": "muscle_gain", "pace": 0.25, "target": 59.0,
             "body": (172, 56, "female", "on_feet", "5_plus", "large"),
             "diet": "vegan", "allergies": ["soja", "fruits à coque"],
             "rhythm": [("breakfast", "large"), ("snack_am", "medium"), ("lunch", "large"),
                        ("snack_pm", "medium"), ("dinner", "large")],
             "habits": [
                 {"kind": "household_dish", "slot": "lunch", "usual": "", "side_courses": {"dessert": True}},
             ]},
            {"prenom": "Marc", "birth_date": "1954-05-30", "goal": "maintenance",
             "body": (170, 71, "male", "on_feet", "1_2", "small"),
             "allergies": ["poisson", "sésame"], "exclusions": [("épices fortes", "chili_pepper", "Marc ne supporte pas les épices fortes")],
             "rhythm": [("breakfast", "small"), ("lunch", "medium"), ("dinner", "small")],
             "habits": [
                 {"kind": "household_dish", "slot": "dinner", "usual": "", "light": True,
                  "side_courses": {"bread": True, "cheese": True}},
             ]},
        ],
        "envie": "Un bon plat mijoté au four qu'on partage le soir.",
        "window": {"starts_on": "2026-09-29", "duration_days": 3},
        "sessions": 1,
    },
}
