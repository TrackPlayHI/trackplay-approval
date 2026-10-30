# Approval

Petite app web pour **valider d'un geste** les résultats proposés par les modèles de TrackPlay : une paire = une image et ce que le modèle y lit (une valeur, et des rectangles sur l'image). Les jugements repartent dans le dépôt des modèles et servent à l'entraînement suivant.

L'app est générique : elle affiche n'importe quelle file de paires au format ci-dessous (chiffres du tableau aujourd'hui, boîtes de joueurs demain).

## Installer sur le téléphone

1. Ouvrir l'adresse GitHub Pages du dépôt dans Chrome, puis menu ⋮ → **Ajouter à l'écran d'accueil**. L'app s'ouvre ensuite en plein écran, comme une app, et fonctionne hors ligne une fois la file chargée.
2. ☰ → Réglages :
   - **Dépôt des modèles** : `trackplayhi/trackplay-models`.
   - **Jeton GitHub** : jeton « fine-grained » (GitHub → Settings → Developer settings → Fine-grained tokens), limité au seul dépôt des modèles, avec le droit **Contents : Read and write**. Il reste sur le téléphone.
   - **File** : choisir une file, puis **Charger**.
3. **Essayer (exemple)** charge une file d'exemple incluse dans l'app, sans compte. Rien n'est envoyé.

## Juger

Les mêmes boutons dans les deux modes, en colonne à droite ; un seul est allumé, celui du jugement actuel de la paire :

| Bouton | Sens |
|---|---|
| ✓ (vert) | juste |
| ✗ (rouge) | faux : ouvre la correction |
| ? (orange) | je ne sais pas |
| ↺ | remet la paire à « non jugée » |

Rien n'est jugé sans bouton : ni en faisant défiler la liste, ni en changeant de mode.

- **Écran partagé** (par défaut). En haut, l'image, avec son origine (salle, champ, moment dans la vidéo : « BCNA Geispolsheim · Temps de jeu · 20:55 ») et des boutons : **Au hasard** pour une paire tirée au sort, **Douteux** pour la paire la moins sûre, **▶ Contexte** pour voir la vidéo autour de l'image (±3 s du tableau entier, le champ encadré en jaune puis en rouge au moment de la paire ; joué en boucle à la place de l'image, un appui le referme, aussi pendant une correction). Un appui long sur l'image n'ouvre pas le menu du navigateur. En bas, le résultat est affiché tout de suite : la valeur, et sur l'image la boîte de chaque caractère et un trait vertical au milieu. Après ✓ ou ?, l'app passe à la paire suivante ; **↶** en haut revient en arrière.
- **Échauffement** : les 10 premières paires d'une file sont des paires très sûres (modèle et étiquette d'accord), pour prendre la main ; elles comptent comme les autres.
- **Liste** (bouton ≡ / ▣). Chaque ligne montre l'image avec la boîte de chaque caractère, la valeur et ses boutons. Une fois jugée, elle montre ce qui a été validé : la lecture, ou ta correction (« corrigé »), ou rien (« sans valeur »). ✗ sur une ligne déjà jugée rouvre la correction depuis la lecture d'origine.
- **Faux → correction.** ✗ (en écran partagé comme en liste) ouvre la correction à la place du panneau noir :
  - sur l'image, **une boîte par caractère** (rectangle qui l'englobe, coins haut-gauche et bas-droite), proposée par le modèle, avec le caractère au-dessus ; on ne corrige que les fausses :
    - **glisser un coin** (rond bleu) redimensionne la boîte ;
    - **glisser l'intérieur** déplace la boîte ;
    - **appuyer dans le vide** ajoute une boîte, de la taille des autres, à ajuster ;
    - **toucher** une boîte la sélectionne (en blanc) et fait apparaître la **poubelle** 🗑 sous l'image : glisser la boîte dessus l'efface, la toucher efface la boîte sélectionnée ;
    - **double appui** sur une boîte l'efface aussi ;
  - en dessous, **la valeur**, avec un **curseur** : toucher un caractère place le curseur juste avant ou juste après lui ; le pavé insère au curseur et ⌫ efface le caractère avant lui. La boîte du caractère juste avant le curseur a son caractère souligné. Pavé de téléphone, séparateurs à droite (`1 2 3 -` / `4 5 6 :` / `7 8 9 .` / `? 0 ⌫ vide`) : `?` caractère illisible (en orange), ⌫ efface, « vide » rien à lire ;
  - **Valider** n'est possible que si la valeur a **autant de caractères que de boîtes**, et si quelque chose a changé ;
  - **Sans valeur** : faux, sans correction (illisible pour toi aussi). **↶** revient à la paire sans rien juger.

  L'app déduit ce qui était faux de ce qui a changé : la valeur, les boîtes, ou les deux. Une paire jugée **juste** valide aussi ses boîtes.
- **↶** (en haut) annule le dernier jugement.
- À la fin de la file, **Envoyer les jugements** les écrit dans le dépôt des modèles. Les jugements sont gardés sur le téléphone jusque-là. Le panneau de fin se ferme (✕) ; toucher la progression (« 200 / 200 ») le rouvre.
- Chaque envoi est un commit facile à retrouver (chercher « Approval · » dans les commits du dépôt des modèles) : `Approval · score-text-v2 : 200 jugements (171 ✓, 14 ✗, 15 ?)`, avec l'appareil, la date et le fichier dans le corps du message.
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

`clip` : clip de contexte (MP4, H.264) dans `queues/` du dépôt des modèles, lu par l'API GitHub avec le jeton ; `where` : salle, champ et moment (secondes) dans la vidéo.

Les paires arrivent par ordre de priorité, avec leur raison (`reason`) :
0. échauffement : 10 paires très sûres ;
1. désaccord entre le modèle et l'étiquette ;
2. lecture incertaine ;
3. échantillon sans étiquette ;
4. une part de cas sûrs tirés au hasard, pour mesurer la qualité réelle.

**Jugements** : `judgments/<file>/<appareil>-<date>.json`, écrits par l'app :

```json
[
  { "id": "…", "text": "4:13", "verdict": "ok", "boxes": [[…], …], "at": "2026-10-29T08:00:00Z" },
  { "id": "…", "text": "4:13", "verdict": "wrong", "correct": "1:41",
    "boxes": [[2.0, 3.5, 9.0, 28.5], …], "wrong": ["value", "boxes"], "at": "…" }
]
```

`verdict` vaut `ok` (juste), `wrong` (faux) ou `unknown` (je ne sais pas).
- Une paire juste devient une étiquette pour l'entraînement suivant, avec ses boîtes.
- Une paire fausse **corrigée** (`correct`, avec les `boxes`) donne l'étiquette juste et les boîtes justes. Une paire fausse sans valeur (`correct` à `null`) retire l'étiquette de cet échantillon.

## Développement

Pas de compilation : HTML, CSS et JavaScript simples.
- Tester en local : `python -m http.server`, puis <http://localhost:8000>.
- Publication : `.github/workflows/pages.yml` publie à chaque push sur `main`. Il faut avoir réglé une fois Settings → Pages → Source : **GitHub Actions**.
