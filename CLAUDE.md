# PhotoAssist — Instructions projet

## Contexte

Utilisateur non-développeur pilotant via prompts. Toute réponse de Claude Code doit être exécutable sans compétence en code de ma part : pas de "faites X vous-même dans le terminal" sans la commande exacte à copier-coller.

## Stack imposée

- PWA vanilla (HTML/CSS/JS) — pas de framework (React/Vue) sauf justification technique claire
- Service Worker + manifest.json pour installation iOS Safari et fonctionnement hors-ligne
- Stockage : LocalStorage ou IndexedDB, aucun backend, aucune dépendance serveur
- Pas de build complexe (éviter Webpack/Vite si un simple JS suffit) — priorité à la simplicité de maintenance par un non-dev

## Contraintes fonctionnelles

- Cible unique : iPhone / Safari — tester toute API utilisée pour compatibilité Safari iOS avant de l'employer
- Aucune API de capteur de lumière (non supportée par Safari iOS) — sélection manuelle uniquement
- L'app doit fonctionner 100% hors-ligne après premier chargement

## Données de référence

La table de correspondance (styles × situations lumineuses × catégories de sujet → réglages) est dans `data/reglages.json`. Ne pas inventer de valeurs techniques (ouverture/vitesse/ISO) hors de cette table — demander si absente.

## Méthode de travail

- Avancer écran par écran dans l'ordre : Accueil → Configuration → Résultat → Favoris
- Après chaque étape, donner une explication en langage simple de ce qui a été fait et comment le tester
- Avant toute décision structurante (arborescence de fichiers, choix de librairie), demander confirmation plutôt que trancher seul
- Toujours indiquer la commande exacte à lancer pour voir le résultat, et la commande de déploiement GitHub Pages

## Documents de référence (ordre de priorité)

1. `DECISIONS.md` — arbitrages validés, prime sur tout le reste
2. `CDC_PhotoAssist_v1.1.md` — révision du CDC
3. `CDC_PhotoAssist.md` — CDC initial (v1)
4. `docs/manuel_600D_FR.pdf` (+ `.txt` pour la recherche) — mode d'emploi officiel Canon. **Toute indication sur un bouton ou un menu doit y être vérifiée.** Non publié sur GitHub (droits Canon) : si absent, le retélécharger :
   `curl -L -o docs/manuel_600D_FR.pdf http://gdlp01.c-wss.com/gds/8/0300008088/01/EOS_600D_Instruction_Manual_FR.pdf`

## Déploiement

- Dépôt : https://github.com/Hips7/photoassist (public, branche `main`)
- App en ligne : https://hips7.github.io/photoassist/
- Déployer = `git add -A && git commit -m "message" && git push` (GitHub Pages republie tout seul en ~1 min)
- Après toute modification d'un fichier de l'app : incrémenter `VERSION` dans `sw.js` (sinon l'iPhone garde l'ancienne version en cache)
