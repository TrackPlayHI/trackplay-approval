# Approval

Petite app web pour **valider d'un geste** les résultats proposés par les modèles de TrackPlay : une paire = une image et ce que le modèle y lit (une valeur, et des rectangles sur l'image). Les jugements repartent dans le dépôt des modèles et servent à l'entraînement suivant.

L'app est générique : elle affiche n'importe quelle file de paires au format ci-dessous (chiffres du tableau aujourd'hui, boîtes de joueurs demain).

## Le principe : M et J

- **M**, ce que propose un modèle : une **file** `queues/<famille>-vN.json` par version du modèle (sa lecture et ses boîtes pour 200 images douteuses).
- **J**, ce que tu juges : un seul fichier par famille, `judgments/<famille>.json`, pour toutes les versions. Chaque jugement porte sa valeur (texte, boîtes), son verdict, sa file d'origine et son heure.
- **Pour une image, J écrase M** : l'app montre J s'il existe, sinon M ; l'entraînement suivant apprend avec J. Un jugement fait sur une autre version est signalé (« jugé en v2 », et « v3 lit 4:18 » si la nouvelle lecture diffère).

Le cycle complet (étiquettes, entraînement, M, J) : README de [trackplay-models](https://github.com/TrackPlayHI/trackplay-models#le-cycle-en-bref).

## Installer sur le téléphone

1. Ouvrir l'adresse GitHub Pages du dépôt dans Chrome, puis menu ⋮ → **Ajouter à l'écran d'accueil**. L'app s'ouvre ensuite en plein écran, comme une app, et fonctionne hors ligne une fois la file chargée.
2. ☰ → Réglages :
   - **Dépôt des modèles** : `trackplayhi/trackplay-models`.
   - **Jeton GitHub** : jeton « fine-grained » (GitHub → Settings → Developer settings → Fine-grained tokens), limité au seul dépôt des modèles, avec le droit **Contents : Read and write**. Il reste sur le téléphone.
   - **File** : choisir une file, puis **Charger**.
3. **Essayer (exemple)** charge une file d'exemple incluse dans l'app, sans compte. Rien n'est envoyé.

## Juger

Les mêmes boutons dans les deux modes, en colonne à droite ; un seul est allumé, celui du jugement actuel de la paire. Un bouton juge la paire **sans changer de paire**.

| Bouton | Sens |
|---|---|
| ✓ (vert) | juste |
| ✗ (rouge) | faux : ouvre l'édition |
| ? (orange) | je ne sais pas (rien ne change pour l'apprentissage) |
| ⊘ (gris) | écarter : cette image ne doit servir ni à apprendre ni à mesurer (afficheur en train de changer, joueur devant le tableau, image coupée…) |
| ↺ | remet la paire à « non jugée » |

Partout, une paire montre **ce qui est validé** : la lecture du modèle, ou ta correction (« corrigé »), ou « — » (« écartée »). « vide » : rien à lire.

**Glissés** (hors édition) :

| Où | Glissé | Effet |
|---|---|---|
| écran partagé | vers le haut | paire suivante (ordre de la file, paires jugées comprises) |
| écran partagé | vers le bas | paire précédente |
| écran partagé | vers la gauche | la liste, placée sur cette paire |
| liste | une carte vers la droite | l'écran partagé sur cette carte |

Le bouton ≡ / ▣ de la barre fait aussi passer d'un mode à l'autre. Faire défiler la liste ne juge rien.

**Zoom** (écran partagé, aussi en édition) : deux doigts écartés ou rapprochés sur l'image zooment, jusqu'à ×16, et la déplacent. Image zoomée, hors édition, un doigt sur l'image la déplace aussi (les glissés de navigation restent possibles sur le bas de l'écran) ; en édition, un doigt sert aux boîtes, l'image se déplace à deux doigts. La pastille **🔍 ×N** en haut à droite de l'image remet l'image entière, comme changer de paire, de mode ou lancer le contexte. Traits, coins et caractères gardent leur taille à l'écran ; une marge autour de l'image garde entiers les coins et les caractères d'une boîte au bord. Le **clip de contexte** se zoome de la même façon (deux doigts jusqu'à ×16, un doigt le déplace une fois zoomé, sa pastille 🔍 le remet entier), en vue individuelle comme en édition ; un appui sans mouvement le referme.

- **Écran partagé** (par défaut, ouvert sur la première paire non jugée). En haut, l'image, avec son origine (salle, champ, moment dans la vidéo : « BCNA Geispolsheim · Temps de jeu · 20:55 ») et **▶ Contexte** pour voir la vidéo autour de l'image (±3 s du tableau entier, le champ encadré en jaune puis en rouge au moment de la paire ; joué en boucle à la place de l'image, zoomable comme elle, un appui sans mouvement le referme, aussi pendant une édition). Un appui long sur l'image n'ouvre pas le menu du navigateur. L'image est la plus grande possible sans jamais être déformée, et les boîtes suivent l'échelle de chaque axe : ce que tu vois est ce qui est enregistré. En bas, le résultat (valeur, et sur l'image la boîte de chaque caractère et un trait vertical au milieu) et les boutons.
- **Échauffement** : les 10 premières paires d'une file sont des paires très sûres (modèle et étiquette d'accord), pour prendre la main ; elles comptent comme les autres.
- **Liste** (glissé à gauche, ou ≡). Chaque carte montre l'image avec ses boîtes, ce qui est validé et ses boutons. ✗ ouvre l'écran partagé sur cette carte, en édition.
- **Édition** (après ✗, en écran partagé comme depuis la liste). Elle part de **ta correction si elle existe**, sinon de la lecture du modèle :
  - sur l'image, **une boîte par caractère** (rectangle qui l'englobe, coins haut-gauche et bas-droite), proposée par le modèle, avec le caractère au-dessus ; on ne corrige que les fausses :
    - **glisser un coin** (rond bleu) redimensionne la boîte ;
    - **glisser l'intérieur** déplace la boîte ;
    - **appuyer dans le vide** ajoute une boîte, de la taille des autres, à ajuster ;
    - **toucher** une boîte la sélectionne (en blanc) et fait apparaître la **poubelle** 🗑 sous l'image : glisser la boîte dessus l'efface, la toucher efface la boîte sélectionnée ;
    - **double appui** sur une boîte l'efface aussi ;
  - en dessous, **la valeur**, avec un **curseur** : toucher un caractère place le curseur juste avant ou juste après lui ; le pavé insère au curseur et ⌫ efface le caractère avant lui. La boîte du caractère juste avant le curseur a son caractère souligné. Pavé de calculatrice, séparateurs à droite (`7 8 9 -` / `4 5 6 :` / `1 2 3 .` / `? 0 ⌫ vide`) : `?` caractère illisible (en orange), ⌫ efface, « vide » vide la valeur ;
  - **que écrire** : ce que l'afficheur **veut dire**. Séparateurs fixés par le champ (temps de jeu « : », « . » seulement pendant la dernière minute), même si un seul point est visible ; `?` seulement pour un **chiffre** coupé ou illisible, jamais pour un séparateur ; un segment fantôme ne s'écrit pas ; temps-morts en LED : une boîte autour des points allumés, valeur = leur nombre (« 1 », « 2 », « 3 ») (règle complète : README de trackplay-models, « Files et jugements ») ;
  - **rien à lire** (afficheur éteint) : « vide » et toutes les boîtes effacées ; c'est une vraie étiquette, le modèle apprend à ne rien trouver ;
  - **Valider** n'est possible que si la valeur a **autant de caractères que de boîtes** (zéro compris), et si le résultat diffère de la lecture du modèle (sinon, c'est ✓) ; on revient aux boutons, ✗ allumé, la correction affichée ;
  - **Retour** revient aux boutons sans rien changer.

  L'app déduit ce qui était faux de ce qui a changé : la valeur, les boîtes, ou les deux. Une paire jugée **juste** valide aussi ses boîtes.
- **Files « boîtes seules »** (`kind` : `boxes`, comme la file du ballon) : pas de valeur à lire, seulement des boîtes. Le résultat dit « aucun ballon », « 1 ballon »… ; ✓ valide les boîtes proposées (aucune : pas de ballon) ; ✗ ouvre l'édition des boîtes, sans pavé : un appui dans le vide ajoute une boîte carrée (taille habituelle de l'objet), on ajuste ou on efface comme pour les caractères (toutes effacées : aucun ballon), puis **Valider** ; ⊘ écarte la vignette (floue, coupée…). **Exemple ballon** dans les réglages en montre une.
- **Files « points »** (`kind` : `points`, comme la file du terrain `court-vN`) : des points à poser sur l'image, ici les **6 points du Jeu** (4 coins et les 2 bouts de la ligne médiane). Le résultat dit « aucun point » (le modèle n'a rien trouvé) ou « 6 points » ; ✓ valide les points proposés ; ✗ ouvre l'édition, sans pavé, avec les gestes de la zone Jeu en édition dans GameAI :
  - **un appui dans le vide** pose un point, tant qu'il en manque ; les points se posent **dans n'importe quel ordre** ;
  - **glisser un point** le déplace ;
  - **double appui sur un point** le retire ;
  - **double appui sur un bord** (le contour relie les points dans l'ordre du tour) : le point est posé exactement sur la ligne (pratique pour un bout de médiane : poser les 4 coins, puis un double appui sur chaque bord long) ;
  - un point **caché ou hors du cadre** se pose là où il serait : deux doigts rapprochés dézooment jusqu'à ×0,5 et agrandissent la **marge grise** autour de l'image, où le point se pose et se glisse (jusqu'à une demi-image de chaque côté) ;
  - dès le 6e point, l'app les **numérote** d'elle-même (règle de GameAI, `docs/zones-auto.md` §4.4) : la ligne médiane est la paire de points opposés la mieux alignée avec ses voisins ; médiane verticale (caméra sur le côté) : 1 coin haut gauche, 2 bout du haut, 3 coin haut droit, 4 coin bas droit, 5 bout du bas, 6 coin bas gauche ; médiane horizontale (caméra derrière une ligne de fond) : 1 coin bas gauche, 2 bout gauche, 3 coin haut gauche, 4 coin haut droit, 5 bout droit, 6 coin bas droit ;
  - **Valider** n'est possible qu'avec les 6 points posés, différents de la proposition ; ⊘ écarte une image inutilisable. **Exemple terrain** dans les réglages en montre deux (terrains dessinés).
- **Envoyer les jugements**, à tout moment (☰ Réglages) ou dans le panneau de fin de file : ils rejoignent le fichier de la **famille** de la file dans le dépôt des modèles (`judgments/score-text.json`, `judgments/ball.json`), partagé par toutes les versions (`score-text-v2`, `-v3`…). L'app relit ce fichier, fusionne (pour une même image, le jugement le plus récent l'emporte, ↺ compris : un jugement déjà envoyé puis remis à « non jugée » ne compte plus), le réécrit trié par identifiant, et recommence si un autre appareil l'a changé entre-temps. On peut donc envoyer souvent : rien n'est compté deux fois. Les jugements restent sur le téléphone, rangés par famille (ceux d'avant, rangés par file, y sont repris).
- **À l'ouverture d'une file**, l'app reprend les jugements déjà dans le dépôt pour sa famille : une image jugée dans la v2 apparaît déjà jugée dans la v3 (même envoyée après la création de la v3). Le panneau de fin se ferme (✕) ; toucher la progression (« 200 / 200 ») le rouvre.
- Chaque envoi est un commit facile à retrouver (chercher « Approval · » dans les commits du dépôt des modèles) : `Approval · score-text : 214 jugements (171 ✓, 14 ✗, 10 ?, 5 ⊘), file score-text-v2`, avec l'appareil, la date et le fichier dans le corps du message ; l'historique git garde chaque version du fichier.
- ☰ Réglages, pour la file chargée (avec confirmation ; ce qui est déjà envoyé reste dans le dépôt) : **Effacer les justes** (garde les corrections et les « ? ») ou **Tout effacer**.

## Formats

**File** : `queues/<nom>.json` dans le dépôt des modèles, écrite par la CI après chaque entraînement (`trackplay_models.queue`) :

```json
{
  "name": "score-digits-v2",
  "model": "score.keras",
  "pairs": [
    {
      "id": "video-demo-1_tableau-complet/game_clock/13600",
      "image": "data:image/png;base64,…",
      "text": "413",
      "boxes": [[12.0, 3.5, 24.0, 28.5], [27.5, 9.0, 31.0, 23.0], [34.0, 3.5, 46.5, 28.5]],
      "confidence": 0.85,
      "reason": "désaccord",
      "clip": "score-text-v2/010.mp4",
      "where": { "hall": "BCNA Geispolsheim", "field": "game_clock", "time_s": 1255.2 }
    }
  ]
}
```

`boxes` : boîte de chaque caractère, `[x0, y0, x1, y1]` en pixels de l'image (coins haut-gauche et bas-droite). Les anciennes files donnent à la place `positions` (abscisse de chaque caractère) ; l'app en fait des boîtes étroites sur toute la hauteur.

File « boîtes seules » : en plus, `"kind": "boxes"`, `"object": "ballon"` et `"box_size"` (taille habituelle d'une boîte, en pixels) ; les paires n'ont pas de `text`, `boxes` peut être vide (rien à encadrer), `confidence` peut manquer (vignette sans proposition), `crop` (`[x0, y0, côté]` de la vignette dans l'image entière) et `where` sans `field`. Jugement : `boxes` validées ou corrigées (éventuellement vides), à `null` pour une vignette inutilisable ; pas de `correct`.

File « points » : en plus, `"kind": "points"`, `"count": 6` (nombre de points à poser) et `"aspect"` (largeur sur hauteur des images, 16:9 par défaut ; l'app mesure celle de chaque image chargée, pour numéroter en pixels) ; chaque paire a `points`, les points proposés `[[x, y], …]`, **normalisés** (0 à 1 dans l'image, de −0,5 à 1,5 dans la marge pour un point hors du cadre), vide si le modèle n'a rien trouvé ; pas de `text`. Jugement : `points` validés ou corrigés, numérotés (6 points du terrain, 4 décimales), `"wrong": ["points"]` pour une correction.

`clip` : clip de contexte (MP4, H.264) dans `queues/` du dépôt des modèles, lu par l'API GitHub avec le jeton ; `where` : salle, champ et moment (secondes) dans la vidéo.

Les paires arrivent par ordre de priorité, avec leur raison (`reason`) :
0. échauffement : 10 paires très sûres ;
1. désaccord entre le modèle et l'étiquette ;
2. lecture incertaine ;
3. échantillon sans étiquette ;
4. une part de cas sûrs tirés au hasard, pour mesurer la qualité réelle.

L'identifiant d'une paire désigne une **image** (fiche / champ / échantillon ; vidéo / image / ballon), pas une version : une file `score-text-v3` peut reproposer une image de la v2, avec le même identifiant. `family` (sinon le nom sans « -vN ») donne la famille de la file. Les nouvelles files évitent les images déjà jugées, sauf environ 5 % de contrôle (raison « contrôle »).

**Jugements** : un fichier par famille, `judgments/<famille>.json`, trié par identifiant, écrit par l'app (les anciens fichiers par envoi, `judgments/<file>/<appareil>-<date>.json`, restent lus par les modèles) :

```json
[
  { "id": "…", "text": "4:13", "verdict": "ok", "boxes": [[…], …], "at": "2026-10-29T08:00:00Z" },
  { "id": "…", "text": "4:13", "verdict": "wrong", "correct": "1:41",
    "boxes": [[2.0, 3.5, 9.0, 28.5], …], "wrong": ["value", "boxes"], "at": "…" }
]
```

`verdict` vaut `ok` (juste), `wrong` (faux), `unknown` (je ne sais pas), `discard` (écartée) ou `reset` (remise à « non jugée » : le jugement précédent ne compte plus). `at` : heure du jugement, qui départage deux jugements d'une même image.
- Une paire juste devient une étiquette pour l'entraînement suivant, avec ses boîtes.
- Une paire fausse **corrigée** (`correct`, avec les `boxes`) donne l'étiquette juste et les boîtes justes ; `correct` vide et aucune boîte : rien à lire, une vraie étiquette.
- Une paire **écartée** retire l'étiquette de cet échantillon (les anciens jugements « faux » sans `correct` comptent comme écartés).

## Développement

Pas de compilation : HTML, CSS et JavaScript simples.
- Tester en local : `python -m http.server`, puis <http://localhost:8000>.
- Tests des règles sans écran (`polygon.js` : numérotation des 6 points, contour, point posé sur un bord) : `node --test`, lancés aussi par `.github/workflows/tests.yml`. `tests/court-order.json` est une copie de `testdata/court-order.json` de GameAI (cas de parité de `geometry/CourtOrder`) : à recopier si GameAI les change.
- Publication : `.github/workflows/pages.yml` publie à chaque push sur `main`. Il faut avoir réglé une fois Settings → Pages → Source : **GitHub Actions**.
