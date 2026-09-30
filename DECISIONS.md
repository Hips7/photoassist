# Décisions validées — PhotoAssist

Ce fichier prime sur les CDC en cas de conflit.

## Matériel

- Boîtier : Canon EOS 600D.
- Objectif unique : **Canon EF-S 17-85 mm f/4-5.6 IS USM**.
  - Ouverture max : f/4 à 17 mm, f/5.6 à 85 mm. Ouverture min : f/22.
  - Stabilisé (interrupteur STABILIZER) : ON à main levée, OFF sur trépied.
- Toutes les valeurs de `data/reglages.json` sont calées pour cet objectif.

## Périmètre

| Sujet | Décision | Raison |
|---|---|---|
| Écran « Réglages matériel » (CDC v1.1 §6.5) | Supprimé | Un seul objectif : la table est construite pour lui. Aucun recalcul = aucune valeur inventée. |
| Sujet « Macro » | Supprimé | Le 17-85 n'est pas un objectif macro. |
| ISO étendue 12800 | Non utilisée | Image très bruitée sur le 600D. Plafond ISO 6400. |
| Mode M | Non utilisé | Av et Tv couvrent tous les cas ; l'appareil calcule la 2e valeur, moins d'erreurs pour une novice. |
| Versioning SW (CDC v1.1 §9) | Simplifié | `reglages.json` en « réseau d'abord, cache si hors-ligne » ; le reste en cache avec numéro de version dans `sw.js`. |
| Export/import JSON des favoris | Reporté en v2 | Risque ITP faible si l'app est ouverte depuis l'écran d'accueil. |
| Photos des vignettes | Photos libres de droits (Unsplash / Pexels) | Crédit photographe affiché. À remplacer par ses propres photos plus tard si souhaité. |

## Table de compatibilité style → sujets

| Style | Sujets |
|---|---|
| Flou d'arrière-plan (bokeh) | Portrait rapproché, groupe |
| Portrait net | Portrait rapproché, groupe |
| Paysage grand angle | Paysage |
| Panoramique filé | Sport / action |
| Figé sport / action | Sport / action |
| Nuit / faible lumière | Portrait rapproché, groupe, ville & illuminations |
| Filé d'eau | Paysage (cascade, rivière, mer) |

Toutes les situations lumineuses sont proposées. Les combinaisons physiquement impossibles avec le 17-85 (ex. filé d'eau en plein soleil sans filtre ND) affichent une explication et un style alternatif, jamais une valeur inventée.

## Niveaux de lumière retenus (base du calcul d'exposition, ISO 100)

| Situation | EV |
|---|---|
| Plein soleil | 15 |
| Ciel voilé | 13 |
| Ombre | 12 |
| Intérieur lumineux | 8 |
| Intérieur sombre | 6 |
| Nuit / éclairage artificiel | 4 |

Chaque règle est contrôlée automatiquement (`tools/verif_table.js`) : l'exposition doit correspondre au niveau de lumière à ±2/3 d'IL près.

## UX

- Cible : novice totale. Chaque manipulation indique quel bouton, où il est, et ce qu'on doit voir.
- Thème nuit rouge : activé si style = Nuit **ou** situation = Nuit.
- Police ≥ 16 px partout, fort contraste.
- Écran d'aide à l'installation sur iPhone + écran « Repérer les boutons ».

## Corrections terrain

- 2026-09-30 — Molette des modes et interrupteur ON/OFF : **dessus, à droite** (côté poignée), pas à gauche. Erreur du CDC v1 corrigée (CDC, étapes, liste et schéma des boutons).
