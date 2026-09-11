# Sophia — propositions de logo

Ouvrir `comparatif.html` pour comparer les trois pistes. `comparatif.png` est sa capture de référence.

| Piste | Symbole | Logo horizontal | Intention |
| --- | --- | --- | --- |
| 01 — L’assiette composée | `01-assiette-symbol.svg` | `01-assiette-lockup.svg` | Un repas et plusieurs portions ; lecture alimentaire explicite. |
| 02 — Le bol du quotidien | `02-bol-symbol.svg` | `02-bol-lockup.svg` | Un repas chaud ; forme compacte et accueillante. |
| 03 — La tartine partagée | `03-tartine-symbol.svg` | `03-tartine-lockup.svg` | Deux parts de pain ; quotidien et partage, avec une connotation petit déjeuner. |

## Construction

Symboles dessinés manuellement avec des coordonnées SVG natives (`path`, `circle`, `g`), sans outil de génération d’images, image matricielle, tracé automatique ni icône empruntée. Grille de 64 unités, traits de 3,5 unités ; symbole figue `#632C4C`, nom encre `#23191F`. Une idée par objet, aucun monogramme.

Les six SVG ont un vrai fond transparent : aucun rectangle de fond ni peinture papier pour simuler une découpe. Les vides sont transparents. La planche HTML, elle, dispose volontairement d’un fond papier `#FBF8FA` et de surfaces lavis `#EFE0E9` / encre pour évaluer les logos. La réserve claire est une simulation CSS sur la planche, pas un septième fichier livré.

Le nom est exactement « Sophia », avec ph et S capitale. Les logos horizontaux utilisent **Young Serif 400**, depuis `frontend/src/assets/fonts/youngserif-latin.woff2` : le fichier local est incorporé en `data:font/woff2` dans chaque SVG. Le texte reste éditable, non vectorisé ; aucune police externe à télécharger. Un logiciel SVG qui ignore les polices WOFF2 incorporées doit charger ce fichier Young Serif local ou vectoriser le texte avant export ; sinon il utilise Georgia. Aucun faux gras. Les descriptions de la planche utilisent Public Sans local, également incorporé. Les deux polices sont sous OFL 1.1 d’après `docs/keel/CHARTE-VITRINE.md`.

Symboles prévus à partir de 24 px ; 16 px est présenté comme test de résistance (les détails des portions se réduisent). Lockup conseillé à partir de 170 px de largeur : le corps typographique reste au-dessus des 20 px demandés par la charte. Garder une zone libre d’au moins 8/64 de la hauteur du symbole et ne pas déformer les proportions.

Références inspectées : `AGENTS.md`, `docs/keel/CHARTE-VITRINE.md`, `frontend/src/tokens.css`, `frontend/src/keel/pages/HomePage.tsx`, `frontend/src/keel/components/PublicHeader.tsx`, polices locales. Les proportions de l’assiette sont un signe de marque, pas des données nutritionnelles ni une promesse de répartition calculée.

## Choix retenu — 10 septembre 2026

Le propriétaire a retenu la **piste 01, variante avatar** (`01-assiette-avatar.svg`, sans la
fourchette). Elle est recopiée en `../sophia-mark.svg`, qui est désormais **la source** : le tracé
se retouche là, jamais dans ce dossier.

Ce que ce fichier alimente :

- `frontend/src/keel/components/BrandMark.tsx` — le symbole des écrans (en-tête de la vitrine, pied
  de page, barre de l’application, entonnoir, connexion, abonnement) ;
- `frontend/scripts/brand-icons.mjs` — `favicon.svg`, `favicon.png`, `apple-touch-icon.png` et
  `icon-512.png`, en réserve claire sur tuile figue ;
- `frontend/scripts/og-image.mjs` — le lockup de la planche d’aperçu de lien.

Les cinq autres fichiers restent des propositions non branchées.

Ces fichiers ont été livrés comme propositions autonomes. Aucun fichier préexistant n’a été remplacé
à ce moment-là.

## Vérifications réalisées le 10 septembre 2026

- Six documents XML/SVG valides ; aucun élément `image`, `foreignObject`, `filter`, dégradé, script ou rectangle de fond.
- Trois noms visibles contrôlés : `Sophia` exactement ; Young Serif incorporée chargée dans Chromium.
- Rendu des six fichiers sur fond transparent : canal alpha allant de 0 à 255, quatre coins totalement transparents.
- Planche inspectée visuellement à 1440 × 1080 ; 24 images chargées, polices locales chargées, aucun débordement horizontal. Contrôle mobile à 390 px : aucun débordement horizontal.
- Petites tailles comparées à 16, 24, 32 et 48 px ; surfaces papier, lavis et réserve claire examinées.
- Preview PNG créée avec Playwright/Chromium déjà présents, sans installation de dépendance. Seuls des fichiers nouveaux ont été créés dans ce dossier, sans modification du code de l’application.
