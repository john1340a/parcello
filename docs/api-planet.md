# Intégration Planet Labs 🛰

Ce document explique comment Parcello communique avec les services de Planet Labs pour afficher de l'imagerie satellite haute résolution.

## Flux de données

Plutôt que d'utiliser des mosaïques globales figées (Basemaps API), Parcello utilise une approche dynamique basée sur la **Data API** pour s'adapter à tous les types de plans Planet (y compris les comptes Explorer standards).

1. **Calcul de l'emprise** : Lorsqu'un GeoJSON est importé, l'application extrait les coordonnées min/max pour créer un polygone englobant (Bounding Box).
2. **Recherche (Quick Search)** : Une requête POST est envoyée à `https://api.planet.com/data/v1/quick-search` avec :
   - Filtre géographique (la zone des parcelles).
   - Filtre temporel (3 derniers mois).
   - Filtre de qualité (couverture nuageuse < 20%).
3. **Sélection & Affichage** : Les résultats sont listés dans l'interface. L'image la plus récente est chargée par défaut via le service de tuiles XYZ.

## Service de Tuiles (Tiles API)

L'URL formatée pour MapLibre est :
`https://tiles0.planet.com/data/v1/PSScene/{item_id}/{z}/{x}/{y}.png?api_key={apiKey}`

## Limitations

- **Authentification** : Requiert une clé API valide dans le fichier `.env`.
- **Droits** : Si l'API renvoie une erreur 404 sur les tuiles, cela signifie généralement que la scène demandée n'est pas incluse dans votre quota de téléchargement/visualisation Planet.
