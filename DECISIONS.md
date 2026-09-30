# Décisions validées — PhotoAssist

Ce fichier prime sur les CDC en cas de conflit.

## Matériel

- Boîtier : Canon EOS 600D.
- Objectif unique : **Canon EF-S 17-85 mm f/4-5.6 IS USM**.
  - Ouverture max : f/4 à 17 mm, f/5.6 à 85 mm. Ouverture min : f/22.
  - Stabilisé (interrupteur STABILIZER) : laissé sur ON (manuel : OFF sur trépied seulement pour économiser la batterie).
- Toutes les valeurs de `data/reglages.json` sont calées pour cet objectif.

## Périmètre

| Sujet | Décision | Raison |
|---|---|---|
| Écran « Réglages matériel » (CDC v1.1 §6.5) | Supprimé | Un seul objectif : la table est construite pour lui. Aucun recalcul = aucune valeur inventée. |
| Sujet « Macro » | Supprimé | Le 17-85 n'est pas un objectif macro. |
| ISO étendue 12800 | Non utilisée | Image très bruitée sur le 600D. Plafond ISO 6400. |
| Modes utilisés | **Modes intégrés de la molette** : Portrait (fond flou), CA réglé sur « net » (portrait net), Paysage, Sports (action figée), Flash annulé (nuit). **Tv + ISO AUTO** seulement pour panoramique filé et filé d'eau (pas de mode dédié). Av et M non utilisés. | Retour terrain : le guide Av/ISO manuel était trop long et échouait en faible lumière (vitesse 1/15). Les modes intégrés gèrent ISO et flash seuls. Contrepartie : le triplet ouverture/vitesse/ISO n'est plus affiché pour ces styles (écart assumé au CDC §1). |
| Versioning SW (CDC v1.1 §9) | Simplifié | `reglages.json` en « réseau d'abord, cache si hors-ligne » ; le reste en cache avec numéro de version dans `sw.js`. |
| Export/import JSON des favoris | Reporté en v2 | Risque ITP faible si l'app est ouverte depuis l'écran d'accueil. |
| Styles ajoutés (v3) | **Gros-plan** (mode fleur, sujet « fleur ou petit objet ») et **Noir & blanc** (ambiance Monochrome via Q, en mode Portrait ou Paysage selon le sujet). | Fonctions intégrées du 600D (manuel p.61, p.65-66), aucune valeur à régler. |
| Aides (v3) | Bulle « Ça ne marche pas ? » sur chaque étape, écrans Photo express (mode A+), Préparer l'appareil, Dépannage, schéma du dos, astuces du manuel par style. | Retour terrain : utiliser tout le mode d'emploi. Contenu tiré du guide de dépannage p.278-287. |
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

## Niveaux de lumière retenus (contrôle de faisabilité des réglages Tv, ISO 100)

| Situation | EV |
|---|---|
| Plein soleil | 15 |
| Ciel voilé | 13 |
| Ombre | 12 |
| Intérieur lumineux | 8 |
| Intérieur sombre | 6 |
| Nuit / éclairage artificiel | 4 |

Chaque règle Tv est contrôlée automatiquement (`tools/verif_table.js`) : avec ISO AUTO (100-6400), il doit exister une ouverture possible (f/4-5.6 à f/22) pour cette vitesse et cette lumière. Les règles en mode intégré ne doivent imposer aucune valeur.

## UX

- Cible : novice totale. Chaque manipulation indique quel bouton, où il est, et ce qu'on doit voir.
- Thème nuit rouge : activé si style = Nuit **ou** situation = Nuit.
- Police ≥ 16 px partout, fort contraste.
- Écran d'aide à l'installation sur iPhone + écran « Repérer les boutons ».

## Corrections terrain

- 2026-09-30 — Molette des modes et interrupteur ON/OFF : **dessus, à droite** (côté poignée), pas à gauche. Erreur du CDC v1 corrigée (CDC, étapes, liste et schéma des boutons).
- 2026-09-30 — Test « Fond flou » : l'ancien seuil « vitesse ≥ 60 » était irréaliste en intérieur. Le « 9 » vu dans le viseur est le compteur de rafale, pas la vitesse. Refonte vers les modes intégrés (voir Périmètre) ; guide basé sur le mode d'emploi officiel (`docs/`, non publié : droits Canon).
- 2026-09-30 — Bouton DISP. : **sur le dessus** (manuel p.18), pas au dos. Au dos en haut à gauche = INFO.
- 2026-09-30 — En modes à icônes, seul le retardateur 10 s est disponible (manuel p.64) ; 2 s uniquement en Tv.
