# Cahier des charges — PhotoAssist v1.1
PWA d'aide au réglage manuel pour Canon EOS 600D
*(Révision après audit — voir §11 Journal des modifications)*

## 1. Objectif
Inchangé. PWA de mémo pré-prise de vue, pas de pilotage à distance (600D sans BT/Wi-Fi).

## 2. Contraintes techniques

| Contrainte | Détail |
|---|---|
| Plateforme | PWA installable via Safari ("Sur l'écran d'accueil"), iPhone. |
| Hors-ligne | Service Worker cache-first + **versioning explicite** (voir §9). |
| Mesure de lumière | Saisie manuelle. |
| Distance/sujet | Catégorie, pas de mètres. |
| Appareil cible | 600D — ISO 100-6400 (ext. 12800 via Custom Function C.Fn I-3, **pas le bouton ISO seul**), vitesses 1/4000-30s, ouverture bornée par l'objectif monté. |
| Stockage | LocalStorage/IndexedDB, pas de backend. **Risque ITP** : sur iOS, si la PWA n'est pas ouverte depuis l'écran d'accueil pendant 7j, Safari peut purger le stockage. Mitigation : usage en mode standalone + export/import JSON des favoris en secours (§6). |
| Hébergement de test | localhost ne permet pas l'installation réelle sur iPhone (Safari exige HTTPS hors réseau local trusté). Déployer à chaque itération sur GitHub Pages ou Netlify (gratuit, HTTPS auto) — voir §10. |

## 3. Catalogue des styles (v1) — inchangé
7 styles, cf. version initiale.

**Ajout — objectif monté (nouveau, structurant) :**
Le CDC initial mentionne l'ouverture "selon objectif monté" (§8 initial) sans aucun écran pour la capturer. C'est une variable manquante qui borne tous les calculs Av/M.
→ Ajout écran **Réglages matériel** (§6.5) : l'utilisateur saisit une fois l'ouverture mini/maxi de son (ses) objectif(s). Le moteur ne proposera jamais une ouverture hors de cette plage.

**Ajout — mapping style → sujets pertinents :**
Le croisement brut 7 styles × 6 situations × 6 sujets = 252 combinaisons théoriques, dont beaucoup sont absurdes (ex. "Filé d'eau" + sujet "Sport/action"). 
→ Table de compatibilité à définir avant remplissage de `reglages.json` :

| Style | Sujets pertinents |
|---|---|
| Bokeh | Portrait rapproché, groupe, macro |
| Portrait net | Portrait rapproché, groupe |
| Paysage grand angle | Paysage |
| Panoramique filé | Sport/action |
| Figé sport/action | Sport/action |
| Nuit / faible lumière | Portrait rapproché, paysage, nuit |
| Filé d'eau | Paysage |

Ceci réduit la table réelle à ~30-40 lignes utiles au lieu de 252, et permet de **filtrer le sélecteur "sujet" dynamiquement selon le style choisi** à l'écran Configuration (évite les combinaisons non couvertes).

## 4. Logique de calcul

Entrée : style + situation lumineuse + sujet (filtré par compatibilité §3) + ouverture mini/maxi objectif (settings)
Sortie : `{ ouverture, vitesse, iso, mode }`

**Schéma de données `reglages.json` (à valider) :**
```json
{
  "version": 1,
  "regles": [
    {
      "style": "bokeh",
      "situation": "ciel_voile",
      "sujet": "portrait_rapproche",
      "ouverture": "f/2.8",
      "vitesse": "1/200s",
      "iso": 200,
      "mode": "Av"
    }
  ]
}
```
- `version` sert au cache-busting du Service Worker (§9).
- Clé de recherche = `style+situation+sujet` (concaténation, index simple côté JS).

**Fallback combo absente (nouveau — non défini dans la v1 initiale) :**
Si aucune règle ne correspond exactement :
1. Chercher une règle avec même style + même sujet, situation la plus proche en luminosité (ordre fixe : nuit < intérieur sombre < intérieur lumineux < ombre < ciel voilé < plein soleil).
2. Si aucune trouvée, afficher un état "Réglage non disponible pour cette combinaison" plutôt qu'une valeur inventée — **ne jamais halluciner une valeur technique**.

## 5. Chemin de manipulation sur le boîtier

Table inchangée + **ajouts spécifiques par style** (absents de la v1 initiale) :

| Style concerné | Ajout au chemin de manipulation |
|---|---|
| Filé d'eau | Trépied obligatoire (mentionné en §3 initial mais absent du parcours utilisateur réel) + rappel retardateur 2s ou télécommande pour éviter le flou de déclenchement |
| Panoramique filé | Rafale hors périmètre (§7) → note technique dans le résultat : "un seul déclenchement possible, anticiper le passage du sujet" |
| Nuit / faible lumière | ISO étendue 12800 → passer par Menu > C.Fn I-3 > Extension ISO, pas seulement le bouton ISO dessus boîtier |

## 6. Écrans

1. **Accueil/Galerie** — inchangé
2. **Configuration** — sélecteur situation + sélecteur sujet **filtré dynamiquement par le style choisi** (§3)
3. **Résultat** — triplet + mode + chemin pas-à-pas + bouton Sauvegarder + **état "non disponible" si fallback échoue** (§4)
4. **Favoris** — liste triable par date **+ suppression individuelle** (absente de la v1 initiale) + **export/import JSON** (mitigation ITP)
5. **Réglages matériel** (nouveau) — saisie ouverture mini/maxi de l'objectif monté, réutilisable si changement d'objectif

**Thème nuit (nouveau) :** quand style = "Nuit / faible lumière", basculer automatiquement sur un thème sombre à dominante rouge (préserve la vision nocturne du photographe, écran plein blanc en pleine nuit = éblouissant et contre-productif sur le terrain).

**Lisibilité plein soleil (nouveau) :** contraste élevé + taille de police mini 16px sur l'écran Résultat — usage réel en extérieur, pas juste un mémo consulté au bureau.

## 7. Hors périmètre v1 — inchangé

## 8. Points à valider avant dev — inchangé + ajout :
- Validation de la table de compatibilité style→sujets (§3)
- Validation du schéma JSON (§4)
- Ouverture mini/maxi réelle du/des objectif(s) possédés

## 9. Cycle de vie / mise à jour (nouveau)

Sans stratégie de versioning, un Service Worker cache-first agressif bloque l'utilisateur sur une version obsolète de `reglages.json` indéfiniment après correction d'une valeur — problème silencieux et invisible pour un non-dev.

- Le champ `version` dans `reglages.json` doit être comparé au démarrage de l'app.
- Si version serveur > version en cache : re-fetch + invalidation du cache SW pour cette ressource, sans casser le mode hors-ligne.
- Bandeau discret "Nouvelles données disponibles" possible en v1.1+ (hors scope v1 strict, à discuter).

## 10. Déploiement de test (nouveau — absent du CLAUDE.md initial)

Pour tester réellement "Sur l'écran d'accueil" sur iPhone à chaque itération :
- Option recommandée : GitHub Pages (gratuit, HTTPS automatique, déploiement en push).
- Alternative rapide sans repo public : Netlify Drop (glisser-déposer un dossier, URL HTTPS immédiate).
- Claude Code doit, à chaque étape livrée, indiquer la commande exacte de déploiement (pas seulement un serveur local `python -m http.server`, insuffisant pour tester l'installation PWA réelle sur iPhone).

## 11. Journal des modifications (audit multi-passes)

| Passe | Sujet audité | Écart trouvé |
|---|---|---|
| 1 | Faisabilité iOS/Safari | ITP purge storage, tailles icônes absentes, pas de stratégie cache, test localhost impossible sur iPhone réel |
| 2 | Modèle de données | Schéma JSON non défini, pas de fallback combo absente, objectif monté non capturé, ISO étendue mal documentée |
| 3 | Écrans/UX | Pas d'état vide, pas de suppression favori, sujets non filtrés par style, pas de thème nuit, lisibilité plein soleil non traitée |
| 4 | Cohérence table | 252 combinaisons théoriques vs. réel utile, trépied absent du parcours filé d'eau, rafale/panoramique à clarifier |
| 5 | Cycle de vie | Pas de mécanisme de mise à jour de la table après publication, pas de sauvegarde des favoris hors téléphone |
