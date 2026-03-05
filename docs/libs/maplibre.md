# Cartographie (MapLibre GL JS) 🗺️

Parcello repose sur **MapLibre GL JS**, un fork open-source de Mapbox GL JS performant utilisant WebGL pour le rendu fluide des cartes vectorielles et rasters.

## Style de Base

Par défaut, la carte utilise le style **OpenStreetMap** (OSM) servi en tuiles rasters :
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`

## Couches de données (Parcelles)

Les parcelles importées sont gérées via une `GeoJSON Source`. Trois couches superposées sont créées :

1. `parcelles-fill` : Remplissage translucide personnalisable.
2. `parcelles-outline` : Lignes de contour pour la structure.
3. `parcelles-label` : Affichage dynamique des étiquettes (basé sur les propriétés `nom`, `name` ou `id` du GeoJSON).

## Intégration Planet

Le fond de carte Planet est ajouté dynamiquement en changeant le `style` de la carte. Pour conserver les parcelles lors du changement de fond de carte, l'application ré-injecte la source et les couches après chaque modification de style (`map.setStyle`).
