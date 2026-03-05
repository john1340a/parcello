# Structure et Architecture 📁

## Organisation des dossiers

```text
parcello/
├── docs/               # Documentation technique (Markdown)
├── public/             # Assets statiques (Favicon, etc.)
├── src/
│   ├── main.js         # Logique principale (Carte, API, Events)
│   └── style.css       # Design System et styles UI
├── .env                # Configuration locale (Ignoré par Git)
├── index.html          # Point d'entrée et structure UI
└── package.json        # Dépendances et scripts
```

## État de l'application (main.js)

L'état est géré de manière simple avec des variables globales pour les objets lourds :

- `map` : Instance de MapLibre.
- `geojsonData` : Stockage des parcelles chargées en mémoire.

## Principes de conception

- **Proximité des données** : Le calcul des emprises se fait côté client pour éviter des allers-retours serveur inutiles.
- **Robustesse** : Fallback automatique vers OpenStreetMap en cas de clé API absente ou d'erreur de chargement satellite.
