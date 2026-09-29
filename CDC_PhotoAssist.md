# Cahier des charges — PhotoAssist

PWA d'aide au réglage manuel pour Canon EOS 600D

## 1. Objectif

PWA permettant de choisir un style photo (bokeh, portrait, paysage, panoramique filé, sport, nuit, filé d'eau) et d'obtenir :

- le triplet de réglage (ouverture / vitesse / ISO) adapté au 600D
- le mode à sélectionner (Av / Tv / M)
- le chemin de manipulation pas-à-pas sur le boîtier physique

Usage : mémo de poche consulté avant la prise de vue. Pas de pilotage à distance (600D sans Bluetooth/Wi-Fi).

## 2. Contraintes techniques

| Contrainte | Détail |
|---|---|
| Plateforme | PWA installable via Safari ("Sur l'écran d'accueil"), compatible iPhone. Pas d'App Store. |
| Hors-ligne | Fonctionnement complet après premier chargement (Service Worker + cache). |
| Mesure de lumière | Saisie manuelle d'une situation (pas d'API de luminosité disponible sur Safari iOS). |
| Distance/sujet | Sélection d'une catégorie de sujet, pas de distance en mètres. |
| Appareil cible | Canon EOS 600D — ISO 100-6400 (ext. 12800), vitesses 1/4000s à 30s, ouverture selon objectif monté. |
| Stockage | LocalStorage / IndexedDB côté client, pas de backend, pas de compte utilisateur. |

## 3. Catalogue des styles (v1)

| Style | Logique de réglage |
|---|---|
| Flou d'arrière-plan (bokeh) | Grande ouverture (f/1.8-4), mode Av |
| Portrait net | Ouverture moyenne (f/4-5.6) |
| Paysage grand angle | Petite ouverture (f/8-16) |
| Panoramique filé | Vitesse lente (1/15-1/60s), mode Tv, suivi du sujet |
| Figé sport/action | Vitesse rapide (1/500-1/2000s), mode Tv |
| Nuit / faible lumière | ISO élevé (800-3200), ouverture max |
| Filé d'eau / longue expo | Vitesse très lente (1-5s), trépied requis |

Situations lumineuses (v1) : plein soleil, ciel voilé, ombre, intérieur lumineux, intérieur sombre, nuit/artificiel.

Catégories de sujet (v1) : portrait rapproché, groupe, paysage, sport/action, macro, nuit.

## 4. Logique de calcul

Moteur = table de correspondance statique (pas de calcul photométrique réel, pas d'IA).

Entrée : style + situation lumineuse + catégorie sujet
Sortie : `{ ouverture, vitesse, iso, mode }`

Exemple de règle :

```
SI style="Flou d'arrière-plan" ET situation="Ciel voilé" ET sujet="Portrait rapproché"
ALORS f/2.8, 1/200s, ISO 200, mode Av
```

La table complète (styles × situations × sujets) doit être validée par l'utilisateur avant intégration — c'est la partie experte, pas générable automatiquement de façon fiable.

## 5. Chemin de manipulation sur le boîtier

Chaque résultat doit afficher, en plus des valeurs, la procédure physique :

| Étape | Manipulation |
|---|---|
| Choix du mode | Molette de sélection des modes (dessus, gauche) → Av / Tv / M |
| Réglage ouverture | Mode Av/M : molette principale (près du déclencheur) |
| Réglage vitesse | Mode Tv/M : molette principale (près du déclencheur) |
| Réglage ISO | Bouton ISO (dessus du boîtier) → molette principale → SET |
| Vérification | Barregraphe d'exposition centré dans le viseur avant déclenchement |

⚠️ Emplacement exact du bouton Quick Control/Av en mode M à vérifier sur le boîtier réel (variations mineures selon firmware).

## 6. Écrans

1. Accueil/Galerie — grille de vignettes par style, tap → configuration
2. Configuration — 2 sélecteurs (situation lumineuse, catégorie sujet), bouton Calculer
3. Résultat — triplet de réglage + mode + chemin de manipulation pas-à-pas + bouton Sauvegarder
4. Favoris — liste des combos sauvegardés, triable par date, tap → réaffiche le résultat

## 7. Hors périmètre v1

- Mesure de lumière automatique
- Balance des blancs, mode mise au point, mode rafale
- Pilotage à distance de l'appareil
- Compte utilisateur / sync cloud
- Distribution App Store

## 8. Points à valider avant dev

- Liste définitive des situations lumineuses et catégories de sujet
- Objectif(s) réellement monté(s) sur le 600D (borne les ouvertures disponibles)
- Table de correspondance complète style × situation × sujet → réglage
- Photos d'exemple pour chaque vignette de style
- Vérification physique des emplacements de boutons en mode M
