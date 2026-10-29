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

## Gestes

Les mêmes dans les deux modes :

| Geste | Sens |
|---|---|
| ↑ haut | juste |
| ← gauche | faux |
| → droite | je ne sais pas |

- **Écran partagé** (par défaut). En haut, l'image, avec deux boutons : **Au hasard** pour une paire tirée au sort, **Douteux** pour la paire la moins sûre. En bas, le panneau noir. Doigt posé : le résultat apparaît (la valeur, les rectangles sur l'image et un trait vertical au milieu). On glisse sans lever le doigt, et le panneau prend la couleur du jugement. Relâché sans geste : rien n'est jugé.
- **Liste** (bouton ≡ / ▣). Les paires défilent vers le haut : une paire qui sort par le haut sans geste est **juste**. On pousse une ligne à gauche (fausse) ou à droite (je ne sais pas).
- **Faux → correction.** Une paire jugée fausse (glissée à gauche, en écran partagé comme en liste) ouvre la correction à la place du panneau noir :
  - sur l'image, **un point avec un trait vertical par caractère**, placé où le modèle l'a lu, avec le caractère au-dessus :
    - **glisser** un point le déplace ;
    - **appuyer dans le vide** ajoute un point ;
    - **toucher** un point le sélectionne (en blanc) et fait apparaître la **poubelle** 🗑 sous l'image : glisser le point dessus l'efface, la toucher efface le point sélectionné ;
    - **double appui** sur un point l'efface aussi ;
  - en dessous, **la valeur**, avec un **curseur** : toucher un caractère place le curseur juste avant ou juste après lui ; le pavé insère au curseur et ⌫ efface le caractère avant lui. Le point du caractère juste avant le curseur est souligné sur l'image. Pavé : `0`–`9`, `:`, `.`, `-`, `?` (caractère illisible, en orange), ⌫, « vide » (rien à lire) ;
  - **Valider** n'est possible que si la valeur a **autant de caractères que de points**, et si quelque chose a changé ;
  - **Sans valeur** : faux, sans correction (illisible pour toi aussi). **↶** revient à la paire sans rien juger.

  L'app déduit ce qui était faux de ce qui a changé : la valeur, les positions, ou les deux.
- **↶** (en haut) annule le dernier jugement.
- À la fin de la file, **Envoyer les jugements** les écrit dans le dépôt des modèles. Les jugements sont gardés sur le téléphone jusque-là.

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
      "positions": [18.5, 31.0, 40.2, 52.7],
      "confidence": 0.85,
      "reason": "désaccord"
    }
  ]
}
```

`positions` : abscisse de chaque caractère, en pixels de l'image. Les anciennes files donnent à la place `boxes` (rectangles `[x0, y0, x1, y1]`) ; l'app en prend le milieu.

Les paires arrivent par ordre de priorité, avec leur raison (`reason`) :
1. désaccord entre le modèle et l'étiquette ;
2. lecture incertaine ;
3. échantillon sans étiquette ;
4. une part de cas sûrs tirés au hasard, pour mesurer la qualité réelle.

**Jugements** : `judgments/<file>/<appareil>-<date>.json`, écrits par l'app :

```json
[
  { "id": "…", "text": "4:13", "verdict": "ok", "at": "2026-10-29T08:00:00Z" },
  { "id": "…", "text": "4:13", "verdict": "wrong", "correct": "1:41",
    "positions": [6.0, 20.5, 31.0, 44.5], "wrong": ["value"], "at": "…" }
]
```

`verdict` vaut `ok` (juste), `wrong` (faux) ou `unknown` (je ne sais pas).
- Une paire juste devient une étiquette pour l'entraînement suivant.
- Une paire fausse **corrigée** (`correct`, avec les `positions`) donne l'étiquette juste. Une paire fausse sans valeur (`correct` à `null`) retire l'étiquette de cet échantillon.

## Développement

Pas de compilation : HTML, CSS et JavaScript simples.
- Tester en local : `python -m http.server`, puis <http://localhost:8000>.
- Publication : `.github/workflows/pages.yml` publie à chaque push sur `main`. Il faut avoir réglé une fois Settings → Pages → Source : **GitHub Actions**.
