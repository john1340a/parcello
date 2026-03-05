# Parcello

> Web SIG pour visualiser ses parcelles en temps réel avec le fond de carte satellite haute résolution **PlanetScope** (Planet Labs).

## Fonctionnalités

- 🛰 **Fond de carte satellite PlanetScope** (plusieurs mosaïques mensuelles disponibles)
- 🗺 Fond de carte OpenStreetMap en fallback (sans clé API)
- 📂 **Import GeoJSON par glisser-déposer** ou sélection de fichier
- 🔍 Zoom automatique sur la couche importée
- 🎨 Contrôles de style (remplissage, contour, étiquettes, opacité)
- 🖱 Clic sur une parcelle → affichage de ses propriétés
- 📍 Géolocalisation de l'utilisateur

## Prérequis

- [Node.js](https://nodejs.org/) ≥ 18
- Une clé API [Planet Labs](https://www.planet.com/account/) (optionnelle ; un fond OSM est disponible sans clé)

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Ouvrez [http://localhost:5173](http://localhost:5173).

## Production

```bash
npm run build
npm run preview
```

## Configuration de la clé API Planet

1. Copiez `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```
2. Renseignez votre clé API :
   ```
   VITE_PLANET_API_KEY=votre_cle_api_ici
   ```
3. Rechargez l'application.

La clé peut aussi être saisie directement dans l'interface sans redémarrer le serveur.

## Utilisation

1. *(Optionnel)* Entrez votre clé API Planet dans le champ prévu et cliquez sur **✓**.
2. Choisissez la mosaïque satellite souhaitée dans le menu déroulant.
3. Glissez votre fichier GeoJSON dans la zone prévue (ou cliquez pour le parcourir).
4. La carte zoome automatiquement sur vos parcelles.
5. Cliquez sur une parcelle pour voir ses propriétés.

## Stack technique

| Outil | Rôle |
|---|---|
| [Vite](https://vitejs.dev/) | Bundler / dev server |
| [MapLibre GL JS](https://maplibre.org/) | Moteur cartographique |
| [PlanetScope](https://www.planet.com/) | Imagerie satellite haute résolution |
| GeoJSON | Format de données des parcelles |
