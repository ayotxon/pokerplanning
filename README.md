# Planning Poker

Outil de Planning Poker collaboratif, auto-hébergeable. React + Vite côté front, mini-serveur Express en mémoire côté back. Une seule commande pour démarrer, un seul process à déployer.

## Fonctionnalités

- Créer une salle ou en rejoindre une via un code à 6 caractères
- Suite de Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕)
- Révélation automatique quand tout le monde a voté
- Chrono optionnel (30 sec → 5 min)
- Statistiques : moyenne, médiane, étendue, mode, suggestion alignée Fibonacci, détection de consensus
- Rôle animateur transmis automatiquement si l'hôte quitte
- Plusieurs salles en parallèle, indépendantes

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5173. Le serveur d'API tourne sur le port 3001 ; Vite proxifie `/api` automatiquement.

## Build et exécution en production

```bash
npm install
npm run build
npm start
```

Un seul process sert le bundle statique **et** l'API sur le port `PORT` (3001 par défaut).

## Déploiement

Le projet est conçu pour les plateformes "git push and go". L'état des salles est conservé en mémoire — chaque redémarrage du serveur réinitialise les salles, ce qui est généralement acceptable pour des sessions de planning courtes.

### Render / Railway / Fly.io / Heroku

| Champ | Valeur |
|---|---|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Node version | 18+ |

Aucune variable d'environnement requise. La plateforme injecte `PORT` automatiquement.

### Docker

```bash
docker build -t planning-poker .
docker run -p 3001:3001 planning-poker
```

## Structure

```
planning-poker/
├── server.js          # Express, stockage en mémoire, sert le build en prod
├── index.html         # Entrée Vite, charge Tailwind via CDN
├── vite.config.js     # Config Vite + proxy /api → :3001 en dev
└── src/
    ├── main.jsx
    ├── App.jsx        # UI
    └── api.js         # Client REST (fetchRoom / saveRoom / updateRoom)
```

## Persistance

Le serveur garde les salles dans une `Map` en mémoire. Une salle inactive depuis plus de 24 h est purgée toutes les heures. Pour persister à travers les redémarrages, remplacer le `Map` dans `server.js` par Redis, SQLite ou un fichier JSON.
