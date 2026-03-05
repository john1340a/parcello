# Installation et Configuration 🚀

## Prérequis

- **Node.js** : Version 20.19+ ou 22.12+ (Requis par Vite 7). _Note : Le projet a été testé avec succès sur Node v25._
- **Navigateur** : Compatible WebGL/WebGPU pour MapLibre GL JS.

## Installation

1. Clonez le projet.
2. Installez les dépendances :
   ```bash
   npm install
   ```

## Configuration (API Planet)

Le projet utilise des variables d'environnement gérées par Vite.

1. Créez un fichier `.env` à la racine (basé sur `.env.example`).
2. Ajoutez votre clé :
   ```env
   VITE_PLANET_API_KEY=PLAK...
   ```

## Commandes utiles

- `npm run dev` : Lance le serveur de développement sur [http://localhost:5173](http://localhost:5173).
- `npm run build` : Génère les fichiers optimisés dans `/dist`.
- `npm run preview` : Teste localement le build de production.
