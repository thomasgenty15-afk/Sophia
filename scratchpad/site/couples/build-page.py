#!/usr/bin/env python3
"""
Banc de composition de `/couples` — la page en CSS nue, pour la juger à 320 px.

POURQUOI CE BANC EXISTE. `CouplesPage.tsx` ne peut pas être rendue par le
serveur de dev : elle n'a pas de route, et ses clés `couples.*` n'entrent dans
`en.ts` qu'à l'intégration — `t()` lèverait à la première ligne. Or « composé à
320 px » est une consigne qu'on ne tient pas en la croyant : la seule façon de
voir un titre qui sort de l'écran est de le regarder sortir.

La CSS est celle de `design/hero.src.html`, reprise TELLE QUELLE : elle encode
déjà les paddings, les points de rupture et le plancher de lisibilité des
figures. La recopier en l'adaptant aurait produit un banc qui ment.

Le français seul : ses phrases sont les plus longues des deux langues, donc
c'est le pire cas de mise en page.

    python3 build-page.py
"""
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
DESIGN = HERE.parent / "design"

EXTRA_CSS = """
/* Ce que la maquette de direction n'avait pas : la carte de prix (primitive
   `PriceCard`) et la bande de faits en trois champs déjà présente. */
.pricecard { border: 1px solid var(--line); border-radius: var(--r-card);
  background: #fff; padding: 16px; }
.pricecard .amount { font-family: var(--font-display); font-size: 2.25rem;
  line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pricecard .period { margin: 8px 0 0; font-size: 14px; color: var(--ink-soft); }
.pricecard .what { margin: 12px 0 0; border-top: 1px solid var(--line);
  padding-top: 12px; font-size: 14px; font-weight: 600; }
.asked { margin: 20px 0 0; font-size: 14px; color: var(--ink-soft); max-width: 46ch; }
.cap { margin: 16px 0 0; font-size: 13px; color: var(--ink-soft); max-width: 46ch; }
"""


def body(figs):
    return f"""
<header><div class="wrap bar">
  <a class="mark eq" href="#">Sophia</a><span class="spacer"></span>
  <a class="locale" href="#">EN</a>
  <a class="btn btn-primary btn-sm" href="#">Commencer</a>
</div></header>

<main>
  <section class="wrap hero">
    <div class="hero-grid">
      <div>
        <p class="label eq">À deux</p>
        <h1>Deux objectifs. Une seule casserole.</h1>
        <p class="lede">Vous ne visez pas la même chose, et vous dînez quand même
          ensemble. Sophia compose la semaine de votre foyer en sessions de
          cuisine : un plat, et pour chacun la part qui va avec son objectif —
          en mots, jamais en grammes, et jamais dans une deuxième poêle.</p>
        <div class="cta-row"><a class="btn btn-primary" href="#">Commencer</a></div>
        <p class="terms"><b>12,99 €</b> par mois pour le foyer, <b>2 €</b> par mois
          pour un second profil. Le compte que vous ouvrez n’est jamais compté en plus.</p>
        <p class="reserve">L’inscription ouvre quand le programme du coach maison
          est publié.</p>
      </div>
      <div class="fig-slot"><div class="fig-scroll">{figs['plates']}</div>
        <p class="cap">Un exemple. Six objectifs envoient chacun la part dans leur direction.</p></div>
    </div>

    <div class="facts"><ul>
      <li><p class="label eq">L’unité</p><h3>La session de cuisine</h3>
        <p>Vous ne planifiez pas sept dîners. Vous planifiez les fois où la
           cuisine s’allume, et ce qu’elles couvrent.</p></li>
      <li><p class="label eq">La direction</p><h3>Six objectifs, six directions</h3>
        <p>Votre objectif décide du sens de votre part. Ce que vous avez en
           commun est cuit une fois ; le reste est une instruction de service.</p></li>
      <li><p class="label eq">Les mots</p><h3>Une phrase, pas un chiffre</h3>
        <p>La ligne de service de chaque bouche apparaît sur l’écran du foyer.
           Elle est écrite en mots ; aucun écran ne vous rend un gramme.</p></li>
    </ul></div>
  </section>

  <section class="pro"><div class="wrap pro-grid">
    <div>
      <p class="label eq">Le second profil</p>
      <h2>Un seul de vous deux a besoin de s’en occuper.</h2>
      <p class="lede">L’autre est dans le plan, avec ou sans compte : sa part se
        calcule sur son objectif, à côté de la vôtre. Pour avoir son propre accès
        — son objectif, modifiable quand on veut, sa ligne de service — le profil
        réclamé coûte 2 € par mois. Le compte que vous ouvrez, lui, n’est jamais
        compté en plus.</p>
      <p class="asked">Ce qu’on demande pour l’ajouter : un prénom, une date de
        naissance, un objectif, les allergies.</p>
    </div>
    <div class="fig-slot fig-scroll">{figs['who']}</div>
  </div></section>

  <section class="wrap" style="padding-block:84px 76px">
    <div class="pro-grid">
      <div class="fig-slot fig-scroll">{figs['chat']}</div>
      <div>
        <p class="label eq">Quand ça dérape</p>
        <h2>La semaine encaisse sans être refaite.</h2>
        <p class="lede">L’un rentre tard et le plan ne s’écroule pas. Dans le chat,
          on décale un plat, on décale la session entière, on dit que personne ne
          cuisine ce soir — ou que rien n’a besoin de changer. Ce sont les quatre
          réponses, et il n’y en a pas de cinquième : rien ne choisit un nouveau
          plat à votre place.</p>
      </div>
    </div>
  </section>

  <section class="dark"><div class="wrap">
    <p class="label eq">Ce que nous ne faisons pas</p>
    <p class="say">Il n’y a pas de courbe de poids ici, et pas de balance à
      ouvrir le matin.</p>
    <p class="say-note">Les chiffres sont éteints par défaut, et quatre verrous
      décident si on peut les allumer. Deux personnes qui dînent ne sont pas un
      tableau de bord.</p>
  </div></section>

  <section class="pro"><div class="wrap pro-grid">
    <div>
      <p class="label eq">Le prix</p>
      <h2>Un foyer, un prix.</h2>
      <p class="asked">À l’inscription, vous dites combien vous êtes à table, et
        le parcours à deux est celui sur lequel vous tombez.</p>
      <div class="cta-row"><a class="btn btn-primary" href="#">Commencer</a></div>
      <p class="reserve">L’inscription ouvre quand le programme du coach maison
        est publié.</p>
    </div>
    <div class="pricecard">
      <div class="amount">12,99 €</div>
      <p class="period">par mois, pour le foyer</p>
      <p class="what">Le second profil réclamé est à 2 € par mois. Jusqu’à huit
        bouches. Le compte que vous ouvrez n’est jamais compté.</p>
    </div>
  </div></section>
</main>
<footer class="wrap"><p>Banc de composition — /couples. Aucune photographie.</p></footer>
"""


def main():
    subprocess.run([sys.executable, "build-figs.py"], cwd=HERE, check=True)
    figs = {}
    for slug in ("plates", "who", "chat"):
        svg = (HERE / f"fig-{slug}.svg").read_text(encoding="utf-8")
        svg = svg.replace("<svg ", '<svg style="width:100%" ', 1)
        figs[slug] = svg

    src = (DESIGN / "hero.src.html").read_text(encoding="utf-8")
    style = src[src.index("<style>"): src.index("</style>") + len("</style>")]
    # Les polices : on réutilise la maquette déjà construite plutôt que de
    # refaire le base64 — hero.html a le bloc @font-face complet.
    hero = (DESIGN / "hero.html").read_text(encoding="utf-8")
    faces = re.findall(r"@font-face\s*\{.*?\}", hero, flags=re.S)
    style = style.replace("/* @FONTFACE_SLOT */", "\n".join(faces))
    style = style.replace("</style>", EXTRA_CSS + "</style>")

    out = (f'<!doctype html><html lang="fr"><head><meta charset="utf-8">'
           f'<meta name="viewport" content="width=device-width, initial-scale=1">'
           f'<title>Banc de composition — /couples</title>{style}</head>'
           f'<body>{body(figs)}</body></html>')
    (HERE / "verify-page.html").write_text(out, encoding="utf-8")
    print(f"  · verify-page.html écrit ({len(out)/1024:.0f} Ko, {len(faces)} polices)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
