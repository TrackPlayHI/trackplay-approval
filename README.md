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
- **↶** annule le dernier jugement.
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
      "boxes": [[x0, y0, x1, y1], …],
      "confidence": 0.85,
      "reason": "désaccord"
    }
  ]
}
```

Les paires arrivent par ordre de priorité, avec leur raison (`reason`) :
1. désaccord entre le modèle et l'étiquette ;
2. lecture incertaine ;
3. échantillon sans étiquette ;
4. une part de cas sûrs tirés au hasard, pour mesurer la qualité réelle.

**Jugements** : `judgments/<file>/<appareil>-<date>.json`, écrits par l'app :

```json
[{ "id": "…", "text": "413", "verdict": "ok", "at": "2026-10-29T08:00:00Z" }]
```

`verdict` vaut `ok` (juste), `wrong` (faux) ou `unknown` (je ne sais pas).
- Une paire juste devient une étiquette pour l'entraînement suivant.
- Une paire fausse retire l'étiquette de cet échantillon.

## Développement

Pas de compilation : HTML, CSS et JavaScript simples.
- Tester en local : `python -m http.server`, puis <http://localhost:8000>.
- Publication : `.github/workflows/pages.yml` publie à chaque push sur `main`. Il faut avoir réglé une fois Settings → Pages → Source : **GitHub Actions**.
