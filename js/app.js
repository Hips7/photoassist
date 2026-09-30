/* PhotoAssist — application (JS simple, sans framework) */
(function () {
  'use strict';

  var DONNEES = null;               // contenu de data/reglages.json
  var choixParStyle = {};           // mémorise sujet/situation choisis pour chaque style
  var etapesCochees = {};           // étapes cochées par résultat (le temps de la session)
  var CLE_FAVORIS = 'photoassist.favoris';
  var CLE_INSTALL_VU = 'photoassist.installVu';

  var $vue = document.getElementById('vue');
  var $titre = document.getElementById('titre');
  var $retour = document.getElementById('btn-retour');
  var $toast = document.getElementById('toast');

  // ---------- Utilitaires ----------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function style(id) { return DONNEES.styles.filter(function (s) { return s.id === id; })[0]; }
  function sujet(id) { return DONNEES.sujets.filter(function (s) { return s.id === id; })[0]; }
  function situation(id) { return DONNEES.situations.filter(function (s) { return s.id === id; })[0]; }

  function lireStockage(cle, defaut) {
    try { var v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch (e) { return defaut; }
  }
  function ecrireStockage(cle, valeur) {
    try { localStorage.setItem(cle, JSON.stringify(valeur)); return true; } catch (e) { return false; }
  }

  // "1/250" -> "1/250 s" ; "4" -> "4 s"
  function vitesseTexte(v) { return v + ' s'; }
  // Ce que le 600D affiche : "1/250" -> "250" ; "4" -> 4" ; "0.5" -> 0"5
  function vitesseBoitier(v) {
    if (v.indexOf('/') > -1) return v.split('/')[1];
    return v.replace('.', '"') + (v.indexOf('.') > -1 ? '' : '"');
  }

  var ORDRE_LUMIERE = ['nuit', 'interieur_sombre', 'interieur_lumineux', 'ombre', 'ciel_voile', 'plein_soleil'];

  // Recherche de la règle (clé style+situation+sujet), avec repli CDC §4 :
  // même style + même sujet, situation la plus proche en luminosité. Jamais de valeur inventée.
  function trouverRegle(styleId, sujetId, situId) {
    var regles = DONNEES.regles.filter(function (r) { return r.style === styleId && r.sujet === sujetId; });
    var exacte = regles.filter(function (r) { return r.situation === situId; })[0];
    if (exacte) return { regle: exacte, repli: false };
    var rang = ORDRE_LUMIERE.indexOf(situId);
    var meilleure = null, ecart = 99;
    regles.forEach(function (r) {
      if (r.indisponible) return;
      var d = Math.abs(ORDRE_LUMIERE.indexOf(r.situation) - rang);
      if (d < ecart) { ecart = d; meilleure = r; }
    });
    return meilleure ? { regle: meilleure, repli: true } : null;
  }

  function lienResultat(styleId, sujetId, situId) { return '#/resultat/' + styleId + '/' + sujetId + '/' + situId; }

  function toast(message, action) {
    clearTimeout(toast.t);
    $toast.innerHTML = '<span>' + esc(message) + '</span>' + (action ? '<button type="button">' + esc(action.texte) + '</button>' : '');
    $toast.hidden = false;
    if (action) $toast.querySelector('button').onclick = function () { $toast.hidden = true; action.faire(); };
    toast.t = setTimeout(function () { $toast.hidden = true; }, action ? 6000 : 2500);
  }

  function estStandalone() {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }
  function estIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // ---------- Favoris ----------

  function favoris() { return lireStockage(CLE_FAVORIS, []); }
  function cleFavori(s, su, si) { return s + '+' + si + '+' + su; }
  function estFavori(s, su, si) { return favoris().some(function (f) { return f.cle === cleFavori(s, su, si); }); }
  function basculerFavori(s, su, si) {
    var liste = favoris();
    var cle = cleFavori(s, su, si);
    var idx = -1;
    liste.forEach(function (f, i) { if (f.cle === cle) idx = i; });
    if (idx > -1) { liste.splice(idx, 1); ecrireStockage(CLE_FAVORIS, liste); return false; }
    liste.push({ cle: cle, style: s, sujet: su, situation: si, date: new Date().toISOString() });
    if (!ecrireStockage(CLE_FAVORIS, liste)) toast("Impossible d'enregistrer (mémoire du téléphone pleine ?)");
    return true;
  }
  function dateCourte(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) +
      ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Cadre commun des vues ----------

  function cadre(opts) {
    $titre.textContent = opts.titre || 'PhotoAssist';
    document.title = opts.titre ? opts.titre + ' · PhotoAssist' : 'PhotoAssist';
    $retour.hidden = !opts.retour;
    $retour.onclick = function () {
      if (history.length > 1 && sessionStorage.getItem('pa.nav')) history.back();
      else location.hash = opts.retour;
    };
    document.body.classList.toggle('theme-nuit', !!opts.nuit);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', opts.nuit ? '#000000' : '#FAF7F2');
    document.querySelectorAll('.tab').forEach(function (t) {
      if (t.getAttribute('data-tab') === opts.onglet) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    $vue.innerHTML = opts.html;
    $toast.hidden = true;
    window.scrollTo(0, 0);
  }

  // ---------- Écran 1 : Accueil / Galerie ----------

  function vueAccueil() {
    var montrerInstall = estIOS() && !estStandalone();
    var html = '';
    if (montrerInstall) {
      html += '<a class="bandeau-install" href="#/installer">' +
        '<img class="ico" src="icons/icon-192.png" alt="">' +
        '<div><strong>Installe l\'app sur ton iPhone</strong><span>Elle marchera même sans réseau</span></div>' +
        '<span class="fleche" aria-hidden="true">›</span></a>';
    }
    html += '<div class="intro"><h2>Quel effet veux-tu&nbsp;?</h2>' +
      '<p>Touche une photo : je te donne les réglages et je te guide bouton par bouton sur ton Canon.</p></div>';
    html += '<div class="raccourcis">' +
      '<a class="raccourci express" href="#/express"><span class="ico" aria-hidden="true">⚡</span><strong>Photo express</strong><small>Pas le temps ? 6 gestes</small></a>' +
      '<a class="raccourci" href="#/preparer"><span class="ico" aria-hidden="true">🎒</span><strong>Préparer l\'appareil</strong><small>Avant une sortie</small></a>' +
      '</div>';
    html += '<div class="galerie">';
    DONNEES.styles.forEach(function (s, i) {
      html += '<a class="carte-style' + (i === DONNEES.styles.length - 1 && DONNEES.styles.length % 2 ? ' large' : '') + '" href="#/style/' + s.id + '">' +
        '<img src="' + esc(s.image) + '" alt="" loading="' + (i < 4 ? 'eager' : 'lazy') + '">' +
        '<div class="txt"><h3>' + esc(s.nom) + '</h3><p>' + esc(s.sousTitre) + '</p></div></a>';
    });
    html += '</div>';
    cadre({ titre: 'PhotoAssist', onglet: 'styles', html: html });
  }

  // ---------- Écran 2 : Configuration ----------

  function vueConfiguration(styleId) {
    var s = style(styleId);
    if (!s) return vueIntrouvable();
    var c = choixParStyle[styleId] || (choixParStyle[styleId] = {});
    if (s.sujets.length === 1) c.sujet = s.sujets[0];
    var nuit = styleId === 'nuit' || c.situation === 'nuit';

    var html = '<div class="entete-style"><img src="' + esc(s.image) + '" alt="">' +
      '<div><h2>' + esc(s.nom) + '</h2><p>' + esc(s.sousTitre) + '</p></div></div>' +
      '<p class="explication">' + esc(s.explication) + '</p>';

    // Étape 1 : sujet (filtré selon le style)
    html += '<section class="section"><h2 class="section-titre"><span class="num-etape">1</span>Que photographies-tu&nbsp;?</h2>';
    if (s.sujets.length === 1) {
      var su = sujet(s.sujets[0]);
      html += '<p class="option-unique">' + su.icone + ' <b>' + esc(su.nom) + '</b> — c\'est le seul sujet possible pour cet effet.</p>';
    } else {
      html += '<div class="choix" role="radiogroup" aria-label="Sujet">';
      s.sujets.forEach(function (id) {
        var su = sujet(id);
        html += '<button type="button" class="option" role="radio" data-sujet="' + id + '" aria-checked="' + (c.sujet === id) + '">' +
          '<span class="ico" aria-hidden="true">' + su.icone + '</span><span><strong>' + esc(su.nom) + '</strong><small>' + esc(su.aide) + '</small></span></button>';
      });
      html += '</div>';
    }
    html += '</section>';

    // Étape 2 : lumière
    html += '<section class="section"><h2 class="section-titre"><span class="num-etape">2</span>Quelle lumière&nbsp;?</h2>' +
      '<p class="section-aide">Regarde autour de toi et choisis ce qui ressemble le plus.</p>' +
      '<div class="choix deux-col" role="radiogroup" aria-label="Lumière">';
    DONNEES.situations.forEach(function (si) {
      html += '<button type="button" class="option" role="radio" data-situation="' + si.id + '" aria-checked="' + (c.situation === si.id) + '">' +
        '<span class="ico" aria-hidden="true">' + si.icone + '</span><strong>' + esc(si.nom) + '</strong><small>' + esc(si.aide) + '</small></button>';
    });
    html += '</div></section>';

    var pret = c.sujet && c.situation;
    html += '<div class="barre-action"><button type="button" class="bouton" id="btn-voir"' + (pret ? '' : ' disabled') + '>Voir les réglages</button></div>' +
      '<p class="aide-bouton" id="aide-voir"' + (pret ? ' hidden' : '') + '>' + (c.sujet ? 'Choisis la lumière pour continuer' : 'Choisis le sujet et la lumière pour continuer') + '</p>';

    cadre({ titre: s.nom, retour: '#/', onglet: 'styles', nuit: nuit, html: html });

    $vue.querySelectorAll('[data-sujet]').forEach(function (b) {
      b.onclick = function () { c.sujet = b.getAttribute('data-sujet'); rafraichirChoix(); };
    });
    $vue.querySelectorAll('[data-situation]').forEach(function (b) {
      b.onclick = function () {
        c.situation = b.getAttribute('data-situation');
        document.body.classList.toggle('theme-nuit', styleId === 'nuit' || c.situation === 'nuit');
        rafraichirChoix();
      };
    });
    document.getElementById('btn-voir').onclick = function () {
      if (c.sujet && c.situation) location.hash = lienResultat(styleId, c.sujet, c.situation);
    };

    // Signale d'avance les lumières impossibles pour ce style + sujet
    function marquerImpossibles() {
      $vue.querySelectorAll('[data-situation]').forEach(function (b) {
        var t = c.sujet && trouverRegle(styleId, c.sujet, b.getAttribute('data-situation'));
        var impossible = !!(t && t.regle.indisponible);
        b.classList.toggle('impossible', impossible);
        var note = b.querySelector('.note-impossible');
        if (impossible && !note) b.insertAdjacentHTML('beforeend', '<em class="note-impossible">Pas adapté à cet effet</em>');
        if (!impossible && note) note.remove();
      });
    }
    marquerImpossibles();

    function rafraichirChoix() {
      marquerImpossibles();
      $vue.querySelectorAll('[data-sujet]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-sujet') === c.sujet)); });
      $vue.querySelectorAll('[data-situation]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-situation') === c.situation)); });
      var ok = !!(c.sujet && c.situation);
      document.getElementById('btn-voir').disabled = !ok;
      var aide = document.getElementById('aide-voir');
      aide.hidden = ok;
      aide.textContent = c.sujet ? 'Choisis la lumière pour continuer' : 'Choisis le sujet et la lumière pour continuer';
      // Premier choix de sujet : amener la lumière à l'écran
      if (c.sujet && !c.situation) {
        var sec = $vue.querySelectorAll('.section')[1];
        if (sec && sec.getBoundingClientRect().top > window.innerHeight * 0.6) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // ---------- Écran 3 : Résultat ----------

  // Mode de la molette : celui de la règle s'il est précisé, sinon celui du style
  function modeDe(styleId, r) {
    var id = (r && r.mode) || style(styleId).modeAppareil;
    return DONNEES.modes.filter(function (m) { return m.id === id; })[0];
  }

  // Dépannages réutilisés (source : mode d'emploi Canon 600D, guide de dépannage p.278-287)
  var AIDE = {
    allumage: [
      ['Rien ne s\'allume', 'Batterie déchargée ou mal enfoncée. Vérifie aussi que les couvercles de la batterie (dessous) et de la carte (côté droit) sont bien fermés.'],
      ['L\'appareil est allumé mais l\'écran est noir', 'Appuie sur DISP. (dessus, à côté d\'ISO). L\'écran s\'éteint aussi tout seul quand tu regardes dans le viseur : c\'est normal.'],
      ['Il s\'éteint tout seul', 'C\'est la mise en veille automatique. Appuie à moitié sur le déclencheur pour le réveiller.']
    ],
    molette: [
      ['Je ne trouve pas l\'icône', 'Regarde le schéma dans Aide → Repérer les boutons. La molette tourne dans les deux sens, sans butée.'],
      ['L\'écran n\'affiche pas le bon mode', 'L\'icône doit être pile en face du petit trait blanc, pas entre deux.']
    ],
    boutonQ: [
      ['Je ne trouve pas le bouton Q', 'Il est petit, collé au bord droit de l\'écran, juste sous le bouton Av. Il porte un « Q » et une petite imprimante.'],
      ['Rien ne se passe en appuyant sur Q', 'Appuie d\'abord à moitié sur le déclencheur pour réveiller l\'appareil, puis sur Q. L\'écran doit afficher les réglages (sinon, DISP.).']
    ],
    vitesseTv: [
      ['La molette ne change pas la vitesse', 'Vérifie que la molette des modes est bien sur Tv. Si un menu est ouvert, appuie à moitié sur le déclencheur pour le fermer.'],
      ['Je ne sais pas si l\'ISO est sur AUTO', 'Appuie sur le bouton ISO (dessus) : la liste s\'affiche. Choisis AUTO avec la molette, puis SET.']
    ],
    zoom: [
      ['Je ne vois pas les chiffres', 'Ils sont gravés sur la large bague en caoutchouc. Le repère est un petit trait sur la partie fixe de l\'objectif, juste derrière la bague.']
    ],
    retardateur: [
      ['Il n\'y a pas d\'horloge « 2 »', 'Dans les modes à icônes, seul le retardateur 10 secondes existe (manuel p.64). Prends l\'horloge « 10 ».'],
      ['La photo ne se prend pas', 'Avec le retardateur, la photo part 2 ou 10 secondes après : la petite lampe à l\'avant clignote pendant l\'attente.']
    ],
    miseAuPoint: [
      ['Pas de bip, rien ne bouge', 'Le petit interrupteur sur le côté de l\'objectif est sur MF : mets-le sur AF. (Le bip peut aussi avoir été coupé dans le menu.)'],
      ['Le point vert clignote', 'L\'appareil n\'arrive pas à faire le net : sujet trop proche (moins de 35 cm), trop sombre ou tout uni (mur, ciel). Vise un endroit contrasté à la même distance, garde à moitié, puis recadre.'],
      ['Le net se fait sur le mauvais endroit', 'Place le sujet au centre du viseur, appuie à moitié, garde le doigt, recadre, puis appuie à fond (verrouillage de la mise au point, manuel p.53).']
    ],
    clignoteVitesse: [
      ['Le chiffre clignote tout le temps', 'Il manque de lumière. Appuie-toi (mur, table), rapproche-toi d\'une lumière, ou utilise un trépied.'],
      ['Je vois un « 9 » à droite', 'C\'est le nombre de photos possibles en rafale, pas un réglage : ignore-le.']
    ],
    clignoteOuverture: [
      ['Ça clignote même en tournant la molette', 'La lumière est trop forte ou trop faible pour cet effet. Change de situation ou choisis un autre style.']
    ],
    declenchement: [
      ['Le déclencheur ne déclenche pas', 'Le point vert clignote : la mise au point n\'est pas faite (voir l\'étape précédente). Ou bien un message s\'affiche dans le viseur (voir ci-dessous).'],
      ['« Card » dans le viseur', 'Pas de carte mémoire, ou mal insérée. Vérifie aussi le petit taquet sur le côté de la carte : il ne doit pas être sur LOCK.'],
      ['« FuLL » dans le viseur', 'Carte pleine : efface des photos ou change de carte.'],
      ['« buSY » dans le viseur', 'L\'appareil enregistre ou le flash se recharge : attends une seconde.']
    ],
    resultat: [
      ['La photo est floue', 'Objectif sur AF ? STABILIZER sur ON ? Appuie doucement sur le déclencheur, sans à-coup. Si la vitesse clignotait, il manquait de lumière.'],
      ['Des zones clignotent en noir sur l\'écran', 'C\'est l\'alerte « trop clair » : ces zones sont brûlées. Ce n\'est pas un défaut de la photo, juste un avertissement.'],
      ['La photo est trop sombre ou trop claire', 'Appuie sur Q, puis ▲▼ jusqu\'à la ligne « Réglage standard » et choisis l\'ambiance « Plus clair » ou « Plus sombre » avec la molette (manuel p.65).']
    ],
    ambiance: [
      ['Je ne trouve pas « Réglage standard »', 'Après Q, monte ou descends avec les flèches ▲▼ de la croix : le nom de la ligne choisie s\'affiche en bas de l\'écran.'],
      ['L\'effet a disparu', 'L\'ambiance s\'efface quand tu changes de mode ou éteins l\'appareil : refais ce réglage.']
    ]
  };

  // Étapes basées sur le mode d'emploi Canon 600D : on utilise les modes intégrés
  // de la molette et l'ISO AUTO, l'appareil règle lui-même ce qu'il sait régler.
  function etapesPour(r) {
    var e = [];
    var s = style(r.style);
    var m = modeDe(r.style, r);
    var tv = m.id === 'Tv';

    e.push({
      titre: 'Allume l\'appareil',
      ou: 'Interrupteur <b>sur le dessus, à droite</b>, à côté de la grande molette des modes : mets-le sur <span class="kbd">ON</span>.',
      voir: 'L\'écran au dos affiche les réglages. S\'il reste noir, appuie sur <span class="kbd">DISP.</span> (sur le dessus, à côté du bouton ISO).',
      aide: AIDE.allumage
    });
    e.push({
      titre: 'Molette des modes sur « ' + m.nom + ' »',
      ou: 'Tourne la <b>grande molette sur le dessus, à droite</b> jusqu\'à ' + esc(m.repere) + ', face au trait blanc.',
      voir: esc(m.role),
      aide: AIDE.molette
    });
    if (m.id === 'ca') {
      e.push({
        titre: 'Choisis « arrière-plan net »',
        ou: 'Appuie sur <span class="kbd">Q</span> : au dos, collé au bord droit de l\'écran, sous le bouton Av. Avec les flèches de la croix, va sur la ligne <b>flou ↔ net</b>, puis tourne la <b>molette principale vers la droite</b>, jusqu\'au bout.',
        voir: 'Le curseur est côté « net ». Appuie à moitié sur le déclencheur pour revenir.',
        aide: AIDE.boutonQ.concat([['La ligne flou ↔ net est grisée', 'Le flash est sorti : repousse-le doucement du doigt (manuel p.57).']])
      });
    }
    if (s.ambiance === 'monochrome') {
      e.push({
        titre: 'Choisis l\'ambiance « Monochrome »',
        ou: 'Appuie sur <span class="kbd">Q</span> (bord droit de l\'écran, sous Av). Avec les flèches <b>▲▼</b>, va sur la ligne <b>« Réglage standard »</b>. Tourne la molette principale jusqu\'à <b>« Monochrome »</b>. Puis flèche <b>▼</b> : choisis <b>« N&B »</b> avec la molette.',
        voir: '« Monochrome » s\'affiche à l\'écran. Il s\'efface si tu changes de mode ou éteins l\'appareil.',
        aide: AIDE.boutonQ.concat(AIDE.ambiance)
      });
    }
    if (tv) {
      e.push({
        titre: 'Règle la vitesse sur ' + vitesseTexte(r.vitesse),
        ou: 'Tourne la <b>molette principale</b> : la petite molette crantée <b>juste derrière le déclencheur</b>, sous ton index.',
        voir: 'L\'écran affiche <span class="kbd">' + esc(vitesseBoitier(r.vitesse)) + '</span>' + (r.vitesse.indexOf('/') > -1 ? ' (l\'appareil n\'écrit pas le « 1/ »).' : ' (le signe " veut dire secondes).') + ' L\'ISO doit être sur <b>AUTO</b> (voir « Préparer l\'appareil »).',
        aide: AIDE.vitesseTv
      });
    }
    e.push({
      titre: 'Zoom sur ' + r.focale + ' mm',
      ou: 'Tourne la <b>large bague en caoutchouc</b> de l\'objectif jusqu\'à ce que <b>' + r.focale + '</b> soit face au petit trait blanc.',
      voir: r.focale === 85 ? '85 = zoom au maximum (bague tournée jusqu\'au bout).' : r.focale === 17 ? '17 = le plus large (bague tournée jusqu\'au bout dans l\'autre sens).' : 'Pas besoin d\'être au millimètre près.',
      aide: AIDE.zoom
    });
    if (r.trepied) {
      var dixSec = !tv; // en mode à icône, seul le retardateur 10 s est disponible (manuel p.64)
      e.push({
        titre: 'Trépied + retardateur ' + (dixSec ? '10' : '2') + ' secondes',
        ou: 'Pose l\'appareil sur le trépied. Au dos, appuie sur la <b>flèche gauche de la croix</b> (mode d\'acquisition) et choisis l\'<b>horloge « ' + (dixSec ? '10' : '2') + ' »</b>, puis <span class="kbd">SET</span>.',
        voir: 'L\'icône horloge s\'affiche à l\'écran : ton doigt ne fera pas bouger l\'appareil. Pense à revenir sur le rectangle simple après.',
        aide: AIDE.retardateur
      });
    }
    e.push({
      titre: 'Vise et fais la mise au point',
      ou: m.id === 'sports'
        ? 'Place le <b>carré central</b> du viseur sur le sujet et appuie <b>à moitié</b> sur le déclencheur. Garde-le à moitié en suivant le sujet.'
        : r.style === 'panning'
          ? 'Place le <b>carré central</b> du viseur sur le sujet et suis-le en tournant le haut du corps, déclencheur <b>à moitié</b> enfoncé.'
          : 'Place le sujet dans le viseur et appuie <b>à moitié</b> sur le déclencheur, sans aller au bout.' + (m.id === 'portrait' ? ' Vise le <b>visage</b>.' : ''),
      voir: m.id === 'sports' || r.style === 'panning'
        ? 'Un petit bip continu : l\'appareil suit le sujet. C\'est normal que le point vert ne reste pas allumé.'
        : 'Un « bip » et le <b>point vert</b> s\'allume à droite, en bas du viseur : c\'est net.',
      aide: AIDE.miseAuPoint
    });
    if (tv) {
      e.push({
        titre: 'Regarde si l\'ouverture clignote',
        ou: 'En bas du viseur, le <b>2e nombre</b> est l\'ouverture choisie par l\'appareil (le 1er, à gauche, est ta vitesse).',
        voir: 'Fixe : tout va bien. Clignote sur un <b>petit nombre</b> (4 ou 5.6) : trop sombre → tourne la molette principale <b>vers la gauche</b> (plus lent). Clignote sur <b>22</b> : trop clair → molette <b>vers la droite</b> (plus rapide).',
        aide: AIDE.clignoteOuverture
      });
    } else if (!r.trepied) {
      e.push({
        titre: 'Regarde si la vitesse clignote',
        ou: 'Toujours à moitié enfoncé, regarde le <b>1er nombre en bas à gauche du viseur</b> : c\'est la vitesse choisie par l\'appareil.',
        voir: 'Fixe : tout va bien. S\'il <b>clignote</b>, l\'appareil te prévient d\'un risque de flou : appuie-toi contre un mur ou une table et reste bien immobile' + (r.focale > 17 ? ', ou dézoome vers 17' : '') + '.',
        aide: AIDE.clignoteVitesse
      });
    }
    e.push({
      titre: 'Prends la photo',
      ou: r.trepied
        ? 'Appuie <b>à fond</b> sur le déclencheur puis <b>lâche tout</b> : la photo se prend seule quelques secondes plus tard.'
        : m.id === 'sports'
          ? 'Appuie <b>à fond</b> au bon moment. Garde le doigt appuyé pour une rafale (plusieurs photos par seconde).'
          : r.style === 'panning'
            ? 'Appuie <b>à fond</b> sans arrêter de suivre le sujet, et continue à le suivre après le déclic.'
            : 'Appuie <b>doucement à fond</b> sur le déclencheur, sans donner de coup.',
      voir: r.trepied ? 'Ne touche à rien avant le « clac » de fin de photo.' : 'Un « clac » : la photo est prise et s\'affiche 2 secondes à l\'écran.',
      aide: AIDE.declenchement
    });
    e.push({
      titre: 'Regarde le résultat',
      ou: 'Bouton lecture <span class="kbd">▶</span> : au dos, collé au bord droit de l\'écran, en bas. Pour zoomer dans la photo : bouton loupe, au dos en haut à droite.',
      voir: 'Pour revenir à la prise de vue, appuie à moitié sur le déclencheur.',
      aide: AIDE.resultat
    });
    return e;
  }

  // Bulle « ça ne marche pas ? » : liste symptôme → solution
  function bulleAide(aide) {
    if (!aide || !aide.length) return '';
    return '<details class="aide-etape"><summary><span aria-hidden="true">?</span> Ça ne marche pas ?</summary><ul>' +
      aide.map(function (a) { return '<li><b>' + esc(a[0]) + '</b>' + esc(a[1]) + '</li>'; }).join('') + '</ul></details>';
  }

  function vueResultat(styleId, sujetId, situId) {
    var s = style(styleId), su = sujet(sujetId), si = situation(situId);
    if (!s || !su || !si) return vueIntrouvable();
    choixParStyle[styleId] = { sujet: sujetId, situation: situId };
    var nuit = styleId === 'nuit' || situId === 'nuit';
    var trouve = trouverRegle(styleId, sujetId, situId);
    var fil = '<ul class="fil"><li>' + su.icone + ' ' + esc(su.nom) + '</li><li>' + si.icone + ' ' + esc(si.nom) + '</li></ul>';
    var html = '<div class="entete-style"><img src="' + esc(s.image) + '" alt=""><div><h2>' + esc(s.nom) + '</h2>' + fil + '</div></div>';

    // Aucune règle, ou combinaison impossible : on explique, jamais de valeur inventée
    if (!trouve || trouve.regle.indisponible) {
      var r0 = trouve && trouve.regle;
      html += '<div class="indispo"><h2>Pas de réglage possible ici</h2>' +
        '<p>' + esc(r0 ? r0.raison : 'Aucun réglage n\'est prévu pour cette combinaison.') + '</p>' +
        (r0 && r0.alternativeTexte ? '<p><b>' + esc(r0.alternativeTexte) + '</b></p>' : '') + '</div>';
      html += '<div class="section">';
      if (r0 && r0.alternative) {
        var alt = style(r0.alternative);
        var sujetAlt = r0.alternativeSujet || (alt.sujets.indexOf(sujetId) > -1 ? sujetId : alt.sujets[0]);
        var altRegle = trouverRegle(alt.id, sujetAlt, situId);
        var altDirect = altRegle && !altRegle.repli && !altRegle.regle.indisponible;
        choixParStyle[alt.id] = { sujet: sujetAlt, situation: altDirect ? situId : undefined };
        html += '<a class="bouton" href="' + (altDirect ? lienResultat(alt.id, sujetAlt, situId) : '#/style/' + alt.id) + '">Essayer « ' + esc(alt.nom) + ' »</a>';
      }
      html += '<a class="bouton ' + (r0 && r0.alternative ? 'secondaire' : '') + '" href="#/style/' + styleId + '">Changer la lumière ou le sujet</a></div>';
      cadre({ titre: 'Réglages', retour: '#/style/' + styleId, onglet: 'styles', nuit: nuit, html: html });
      return;
    }

    var r = trouve.regle;
    var m = modeDe(styleId, r);
    var tv = m.id === 'Tv';
    var cleRes = styleId + '+' + sujetId + '+' + situId;
    var cochees = etapesCochees[cleRes] || (etapesCochees[cleRes] = {});
    var etapes = etapesPour(r);

    if (trouve.repli) {
      html += '<p class="encart materiel"><strong>Réglage approché</strong>Pas de réglage exact pour « ' + esc(si.nom) + ' » : voici celui de la lumière la plus proche (« ' + esc(situation(r.situation).nom) + ' »). Vérifie bien le résultat à l\'écran.</p>';
    }

    html += '<div class="reglages">' +
      '<div class="tuile mode"><div class="valeur">' + esc(m.nom) + '</div><div><div class="etiquette">Molette des modes</div><div class="role">' + esc(m.role) + '</div></div></div>' +
      (tv ? tuile('Vitesse', vitesseTexte(r.vitesse), 'Molette principale', false) : '') +
      tuile('Zoom', r.focale + ' mm', r.focale === 85 ? 'Zoom au maximum' : r.focale === 17 ? 'Le plus large' : 'Bague de l\'objectif', false) +
      (tv ? tuile('ISO', 'AUTO', 'L\'appareil l\'ajuste', true) : '') +
      '</div>' +
      (tv ? '' : '<p class="legende-tuiles">L\'appareil règle seul l\'ouverture, la vitesse et l\'ISO' + (m.id === 'portrait' || m.id === 'ca' ? ', et sort le flash si besoin' : '') + '.</p>');

    if (r.trepied) {
      html += '<p class="encart materiel"><strong>🔧 Trépied obligatoire</strong>La photo dure longtemps : à la main, elle serait floue.</p>';
    }

    html += htmlEtapes('Pas à pas sur ton Canon', etapes, cochees);

    html += '<p class="encart conseil"><strong>💡 Conseil</strong>' + esc(r.conseil) + '</p>';
    if (s.astuces && s.astuces.length) {
      html += '<div class="encart info"><strong>📘 Astuces du mode d\'emploi</strong><ul class="astuces">' +
        s.astuces.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
    }

    var fav = estFavori(styleId, sujetId, situId);
    html += '<div class="section"><button type="button" class="bouton ' + (fav ? 'secondaire' : '') + '" id="btn-fav">' + (fav ? '★ Dans mes favoris' : '☆ Enregistrer dans mes favoris') + '</button>' +
      '<a class="bouton discret" href="#/style/' + styleId + '">Changer la lumière ou le sujet</a></div>';

    cadre({ titre: 'Réglages', retour: '#/style/' + styleId, onglet: 'styles', nuit: nuit, html: html });

    brancherEtapes(etapes, cochees, function () { vueResultat(styleId, sujetId, situId); });
    document.getElementById('btn-fav').onclick = function () {
      var ajoute = basculerFavori(styleId, sujetId, situId);
      this.className = 'bouton ' + (ajoute ? 'secondaire' : '');
      this.textContent = ajoute ? '★ Dans mes favoris' : '☆ Enregistrer dans mes favoris';
      toast(ajoute ? 'Ajouté à tes favoris' : 'Retiré de tes favoris');
    };
  }

  // Liste d'étapes à cocher (résultat, express, préparation)
  function htmlEtapes(titre, etapes, cochees) {
    var html = '<section class="section"><h2 class="section-titre">' + esc(titre) + '</h2>' +
      '<div class="progression"><div class="jauge"><i id="jauge"></i></div><span id="compteur"></span><button type="button" id="btn-raz">Tout décocher</button></div>' +
      '<ol class="etapes">';
    etapes.forEach(function (et, i) {
      html += '<li class="etape' + (cochees[i] ? ' faite' : '') + '" data-i="' + i + '">' +
        '<button type="button" class="coche" aria-pressed="' + !!cochees[i] + '" aria-label="Étape ' + (i + 1) + ' faite">' + (cochees[i] ? '✓' : i + 1) + '</button>' +
        '<div class="etape-corps"><h3>' + esc(et.titre) + '</h3><p class="ou">' + et.ou + '</p>' + (et.voir ? '<p class="voir">' + et.voir + '</p>' : '') + bulleAide(et.aide) + '</div></li>';
    });
    return html + '</ol></section>';
  }

  function brancherEtapes(etapes, cochees, reafficher) {
    function majProgression() {
      var n = Object.keys(cochees).filter(function (k) { return cochees[k]; }).length;
      document.getElementById('jauge').style.width = (100 * n / etapes.length) + '%';
      document.getElementById('compteur').textContent = n + ' / ' + etapes.length;
      document.getElementById('btn-raz').hidden = n === 0;
    }
    $vue.querySelectorAll('.etape').forEach(function (li) {
      var i = +li.getAttribute('data-i');
      li.querySelector('.coche').onclick = function () {
        cochees[i] = !cochees[i];
        li.classList.toggle('faite', cochees[i]);
        this.setAttribute('aria-pressed', String(cochees[i]));
        this.textContent = cochees[i] ? '✓' : i + 1;
        majProgression();
      };
    });
    document.getElementById('btn-raz').onclick = function () {
      Object.keys(cochees).forEach(function (k) { delete cochees[k]; });
      reafficher();
    };
    majProgression();
  }

  function tuile(etiquette, valeur, role, auto) {
    return '<div class="tuile' + (auto ? ' auto' : '') + '"><div class="etiquette">' + etiquette + '</div>' +
      '<div class="valeur">' + (auto && valeur !== 'AUTO' ? '≈ ' : '') + esc(valeur) + '</div><div class="role">' + role + '</div>' +
      '<span class="badge">' + (auto ? 'Automatique' : 'Tu règles') + '</span></div>';
  }

  // ---------- Écran 4 : Favoris ----------

  var triFavoris = 'recents';

  function vueFavoris() {
    var liste = favoris().filter(function (f) { return style(f.style) && sujet(f.sujet) && situation(f.situation); });
    liste.sort(function (a, b) { return triFavoris === 'recents' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date); });
    var html;
    if (!liste.length) {
      html = '<div class="vide"><div class="ico" aria-hidden="true">☆</div><h2>Aucun favori pour l\'instant</h2>' +
        '<p>Quand un réglage te plaît, touche <b>« ☆ Enregistrer dans mes favoris »</b> en bas de l\'écran des réglages. Il apparaîtra ici pour le retrouver en un geste.</p>' +
        '<a class="bouton" href="#/">Choisir un style</a></div>';
    } else {
      html = '<div class="outils-favoris"><span>' + liste.length + ' favori' + (liste.length > 1 ? 's' : '') + '</span>' +
        '<div class="segment" role="group" aria-label="Trier">' +
        '<button type="button" data-tri="recents" aria-pressed="' + (triFavoris === 'recents') + '">Récents</button>' +
        '<button type="button" data-tri="anciens" aria-pressed="' + (triFavoris === 'anciens') + '">Anciens</button></div></div>' +
        '<ul class="liste-favoris">';
      liste.forEach(function (f) {
        var s = style(f.style), su = sujet(f.sujet), si = situation(f.situation);
        html += '<li class="favori"><a href="' + lienResultat(f.style, f.sujet, f.situation) + '">' +
          '<img src="' + esc(s.image) + '" alt=""><div class="txt"><strong>' + esc(s.nom) + '</strong>' +
          '<div class="meta">' + su.icone + ' ' + esc(su.nom) + ' · ' + si.icone + ' ' + esc(si.nom) + '</div>' +
          '<div class="meta">' + dateCourte(f.date) + '</div></div></a>' +
          '<button type="button" class="suppr" data-cle="' + esc(f.cle) + '" aria-label="Supprimer ce favori">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></li>';
      });
      html += '</ul>';
    }
    cadre({ titre: 'Mes favoris', onglet: 'favoris', html: html });

    $vue.querySelectorAll('[data-tri]').forEach(function (b) {
      b.onclick = function () { triFavoris = b.getAttribute('data-tri'); vueFavoris(); };
    });
    $vue.querySelectorAll('.suppr').forEach(function (b) {
      b.onclick = function () {
        var cle = b.getAttribute('data-cle');
        var tous = favoris();
        var retire = tous.filter(function (f) { return f.cle === cle; })[0];
        ecrireStockage(CLE_FAVORIS, tous.filter(function (f) { return f.cle !== cle; }));
        vueFavoris();
        toast('Favori supprimé', {
          texte: 'Annuler',
          faire: function () {
            var l = favoris(); l.push(retire); ecrireStockage(CLE_FAVORIS, l);
            if (location.hash === '#/favoris') vueFavoris();
          }
        });
      };
    });
  }

  // ---------- Aide ----------

  function vueAide() {
    var html = '<div class="intro"><h2>Aide</h2><p>Tout ce qu\'il faut savoir pour bien démarrer.</p></div>' +
      '<a class="lien-carte" href="#/boutons"><span class="ico" aria-hidden="true">📷</span>Repérer les boutons de l\'appareil</a>' +
      '<a class="lien-carte" href="#/depannage"><span class="ico" aria-hidden="true">🛠️</span>Ça ne marche pas ? (dépannage)</a>' +
      '<a class="lien-carte" href="#/preparer"><span class="ico" aria-hidden="true">🎒</span>Préparer l\'appareil</a>' +
      '<a class="lien-carte" href="#/bases"><span class="ico" aria-hidden="true">📖</span>Comprendre ouverture, vitesse et ISO</a>' +
      '<a class="lien-carte" href="#/installer"><span class="ico" aria-hidden="true">📲</span>Installer l\'app sur l\'iPhone</a>' +
      '<section class="section"><h2 class="section-titre">À propos</h2>' +
      '<p class="section-aide">Réglages prévus pour le <b>' + esc(DONNEES.appareil) + '</b> avec l\'objectif <b>' + esc(DONNEES.objectif) + '</b>. ' +
      'Ce sont des points de départ : regarde toujours le résultat à l\'écran et ajuste l\'ISO si besoin.</p></section>' +
      '<section class="section"><h2 class="section-titre">Crédits photos</h2><ul class="credits">';
    DONNEES.styles.forEach(function (s) {
      if (!s.credit) return;
      html += '<li>' + esc(s.nom) + ' : ' + esc(s.credit.auteur) + ' (' + esc(s.credit.licence) + ', <a href="' + esc(s.credit.source) + '" target="_blank" rel="noopener">source</a>)</li>';
    });
    html += '</ul></section>';
    cadre({ titre: 'Aide', onglet: 'aide', html: html });
  }

  function vueBoutons() {
    var reperes = [
      ['1', 'Molette des modes', 'Dessus, à droite. Icônes : A+ = tout automatique, tête de profil = Portrait, montagnes = Paysage, fleur = Gros-plan, personnage qui court = Sports, éclair barré = Flash annulé, CA = Créatif auto, et Tv.'],
      ['2', 'Interrupteur ON / OFF', 'Dessus, à droite, à côté de la molette des modes.'],
      ['3', 'Déclencheur', 'Dessus, à droite, sous ton index. À moitié = mise au point, à fond = photo.'],
      ['4', 'Molette principale', 'Dessus, juste derrière le déclencheur. Elle change la valeur affichée.'],
      ['5', 'Boutons ISO et DISP.', 'Dessus, derrière la molette principale. DISP. allume ou éteint l\'écran des réglages.']
    ];
    var html = '<div class="intro"><h2>Les boutons du 600D</h2><p>Les repères utilisés dans les étapes.</p></div>' +
      '<h2 class="section-titre">Le dessus</h2>' + schemaAppareil() + '<ul class="liste-aide">';
    reperes.forEach(function (r) {
      html += '<li><strong>' + r[0] + '. ' + esc(r[1]) + '</strong><span>' + esc(r[2]) + '</span></li>';
    });
    html += '<li><strong>Sur l\'objectif (côté gauche)</strong><span>Interrupteur AF/MF : toujours sur AF. Interrupteur STABILIZER : sur ON. La large bague en caoutchouc règle le zoom (17 à 85).</span></li></ul>' +
      '<h2 class="section-titre section">Le dos</h2>' + schemaDos() + '<ul class="liste-aide">' +
      [['A', 'MENU', 'En haut à gauche. Ouvre les menus (réglages avancés, signal sonore…).'],
        ['B', 'INFO.', 'À côté de MENU. Change les informations affichées à l\'écran.'],
        ['H', 'Correcteur dioptrique', 'Petite molette juste à droite du viseur : rend le viseur net pour ta vue.'],
        ['C', 'Av ±', 'Collé au bord droit de l\'écran, en haut. Pas utilisé dans l\'app.'],
        ['D', 'Q (réglage rapide)', 'Juste sous Av, marqué « Q » et une petite imprimante. Sert en mode CA et pour les ambiances.'],
        ['E', 'Croix + SET', 'À droite de Q. Flèche gauche = retardateur. SET au centre valide.'],
        ['F', 'Lecture ▶', 'Collé au bord droit de l\'écran, en bas. Pour revoir tes photos.'],
        ['G', 'Loupe', 'En haut à droite. Zoome dans une photo en lecture.']
      ].map(function (r) { return '<li><strong>' + r[0] + '. ' + esc(r[1]) + '</strong><span>' + esc(r[2]) + '</span></li>'; }).join('') + '</ul>' +
      '<section class="section"><h2 class="section-titre">Lire le bas du viseur</h2>' +
      '<table class="table-lecture"><thead><tr><th>Position</th><th>Ce que c\'est</th></tr></thead><tbody>' +
      '<tr><td>1er nombre à gauche</td><td>La <b>vitesse</b>. <span class="kbd">250</span> = 1/250 s, <span class="kbd">30</span> = 1/30 s, <span class="kbd">4"</span> = 4 secondes. S\'il clignote : risque de flou.</td></tr>' +
      '<tr><td>2e nombre</td><td>L\'<b>ouverture</b> (ex. <span class="kbd">5.6</span>).</td></tr>' +
      '<tr><td>Chiffre tout à droite</td><td>Le nombre de photos en <b>rafale</b> (ex. <span class="kbd">9</span>). Pas un réglage : ignore-le.</td></tr>' +
      '<tr><td>Point vert rond à droite</td><td>La mise au point est faite : c\'est net.</td></tr>' +
      '</tbody></table></section>';
    cadre({ titre: 'Repérer les boutons', retour: '#/aide', onglet: 'aide', html: html });
  }

  // Schéma simplifié vu du dessus : repères 1 à 5
  function schemaAppareil() {
    function rep(n, x, y) { return '<circle class="repere" cx="' + x + '" cy="' + y + '" r="12"/><text class="repere-txt" x="' + x + '" y="' + (y + 4.5) + '" text-anchor="middle">' + n + '</text>'; }
    // Orientation : comme quand on tient l'appareil et qu'on regarde le dessus
    // (objectif devant = en haut du schéma, écran vers soi = en bas, poignée à droite)
    return '<svg class="schema" viewBox="0 0 340 210" role="img" aria-label="Schéma du dessus de l\'appareil, tenu en main">' +
      '<text x="170" y="18" text-anchor="middle">Vu du dessus, tenu dans tes mains</text>' +
      '<rect class="piece" x="130" y="28" width="80" height="44" rx="6"/><text x="170" y="55" text-anchor="middle">objectif</text>' +
      '<rect class="corps" x="30" y="72" width="280" height="90" rx="18"/>' +
      '<rect class="piece" x="148" y="100" width="44" height="34" rx="6"/><text x="170" y="122" text-anchor="middle">flash</text>' +
      // Toutes les commandes du dessus sont à droite (côté poignée)
      '<circle class="piece" cx="232" cy="130" r="22"/><text x="232" y="135" text-anchor="middle">modes</text>' +
      '<path class="piece" d="M206 114 q-12 16 0 32" fill="none"/>' +
      '<circle class="piece" cx="284" cy="88" r="10"/>' +
      '<rect class="piece" x="268" y="103" width="32" height="11" rx="5"/>' +
      '<rect class="piece" x="276" y="122" width="16" height="9" rx="3"/>' +
      '<text x="80" y="122" text-anchor="middle">(rien ici)</text>' +
      '<text x="170" y="182" text-anchor="middle">écran (dos) = de ton côté</text>' +
      '<text x="170" y="200" text-anchor="middle">↓ toi</text>' +
      rep('1', 244, 96) + rep('2', 190, 152) + rep('3', 310, 80) + rep('4', 318, 108) + rep('5', 312, 134) +
      '</svg>';
  }

  function vueBases() {
    var html = '<div class="intro"><h2>Les 3 réglages de base</h2><p>Pas besoin de tout retenir : l\'app te dit quoi mettre. Mais c\'est utile de comprendre.</p></div>' +
      '<ul class="liste-aide">' +
      '<li><strong>Ouverture (f/…)</strong><span>La taille du trou qui laisse entrer la lumière. <b>Petit chiffre</b> (f/4, f/5.6) = beaucoup de lumière et <b>fond flou</b>. <b>Grand chiffre</b> (f/11, f/22) = moins de lumière et <b>tout est net</b>.</span></li>' +
      '<li><strong>Vitesse (1/… s)</strong><span>Le temps pendant lequel la photo se prend. <b>Rapide</b> (1/1000 s) = le mouvement est <b>figé</b>. <b>Lente</b> (1/15 s, 4 s) = le mouvement devient <b>flou</b>, et il faut un trépied.</span></li>' +
      '<li><strong>ISO</strong><span>La sensibilité à la lumière. <b>100</b> = photo la plus propre, pour le plein jour. <b>3200 ou 6400</b> = pour le soir, mais la photo a du « grain ».</span></li>' +
      '<li><strong>Les modes à icônes</strong><span>Portrait, Paysage, Sports, Flash annulé, CA : l\'appareil règle lui-même ouverture, vitesse et ISO pour obtenir l\'effet. C\'est ce que l\'app utilise le plus souvent.</span></li>' +
      '<li><strong>Mode Tv</strong><span>Tu choisis la vitesse, l\'appareil calcule le reste. Utilisé pour le panoramique filé et le filé d\'eau, les deux effets qui n\'ont pas d\'icône.</span></li>' +
      '</ul>';
    cadre({ titre: 'Les bases', retour: '#/aide', onglet: 'aide', html: html });
  }

  function vueInstaller() {
    var partage = '<span class="picto" aria-label="bouton Partager"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11v9h12v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>';
    var plus = '<span class="picto" aria-label="icône plus"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>';
    var html;
    if (estStandalone()) {
      html = '<div class="vide"><div class="ico" aria-hidden="true">✅</div><h2>L\'app est installée</h2><p>Tu l\'utilises depuis ton écran d\'accueil. Elle marche même sans réseau.</p><a class="bouton" href="#/">Choisir un style</a></div>';
    } else {
      html = '<div class="intro"><h2>Installer sur l\'iPhone</h2><p>En 4 gestes, l\'app aura son icône sur ton écran d\'accueil et marchera même sans réseau (en randonnée, en avion…).</p></div>' +
        '<ol class="install-etapes">' +
        '<li>Ouvre cette page dans <b>Safari</b> (la boussole bleue), pas dans une autre app.</li>' +
        '<li>Touche le bouton <b>Partager</b> ' + partage + ' en bas de l\'écran.<br><small>Tu ne le vois pas ? Touche d\'abord les <b>•••</b> en bas à droite, puis <b>Partager</b>.</small></li>' +
        '<li>Fais défiler vers le bas et touche <b>« Sur l\'écran d\'accueil »</b> ' + plus + '.</li>' +
        '<li>Touche <b>Ajouter</b> en haut à droite. C\'est fini : ouvre toujours l\'app avec sa nouvelle icône <b>PhotoAssist</b>.</li>' +
        '</ol>' +
        '<p class="encart info"><strong>Important</strong>Ouvre l\'app au moins une fois avec du réseau après l\'installation : c\'est à ce moment qu\'elle se copie sur le téléphone pour marcher hors ligne. Les favoris enregistrés dans Safari ne sont pas repris dans l\'app installée.</p>';
    }
    try { localStorage.setItem(CLE_INSTALL_VU, '1'); } catch (e) { /* stockage indisponible */ }
    cadre({ titre: 'Installation', retour: '#/aide', onglet: 'aide', html: html });
  }

  // ---------- Photo express (mode Scène intelligente auto) ----------

  var cochesExpress = {};
  function vueExpress() {
    var etapes = [
      { titre: 'Allume l\'appareil', ou: 'Interrupteur <b>sur le dessus, à droite</b> : mets-le sur <span class="kbd">ON</span>.', aide: AIDE.allumage },
      { titre: 'Molette des modes sur A+', ou: 'Tourne la <b>grande molette sur le dessus, à droite</b> jusqu\'à l\'icône <b>A+</b> (petit cadre avec un A et un +).', voir: 'L\'appareil analyse la scène et règle tout seul, flash compris.', aide: AIDE.molette },
      { titre: 'Cadre avec le zoom', ou: 'Tourne la <b>large bague en caoutchouc</b> : vers <b>85</b> pour te rapprocher du sujet, vers <b>17</b> pour en voir plus.', aide: AIDE.zoom },
      { titre: 'Vise et appuie à moitié', ou: 'Place le sujet <b>au centre du viseur</b> et appuie <b>à moitié</b> sur le déclencheur.', voir: 'Un « bip » et le <b>point vert</b> en bas à droite du viseur : c\'est net.', aide: AIDE.miseAuPoint },
      { titre: 'Appuie à fond', ou: 'Appuie <b>doucement à fond</b>, sans donner de coup.', voir: 'La photo s\'affiche 2 secondes à l\'écran.', aide: AIDE.declenchement },
      { titre: 'Vérifie', ou: 'Bouton lecture <span class="kbd">▶</span> : au dos, collé au bord droit de l\'écran, en bas.', aide: AIDE.resultat.slice(0, 2) }
    ];
    var html = '<div class="intro"><h2>Photo express</h2><p>Pas le temps de choisir un effet ? L\'appareil fait tout, tu cadres et tu déclenches.</p></div>' +
      htmlEtapes('6 gestes', etapes, cochesExpress) +
      '<p class="encart info"><strong>Le flash sort tout seul ?</strong>C\'est normal en mode A+ quand il fait sombre. Pour garder l\'ambiance sans flash, choisis le style « Nuit / peu de lumière ».</p>' +
      '<div class="section"><a class="bouton secondaire" href="#/">Choisir un effet précis</a></div>';
    cadre({ titre: 'Photo express', retour: '#/', onglet: 'styles', html: html });
    brancherEtapes(etapes, cochesExpress, vueExpress);
  }

  // ---------- Préparer l'appareil (avant une sortie) ----------

  var cochesPreparer = {};
  function vuePreparer() {
    var etapes = [
      { titre: 'Batterie chargée', ou: 'Allume l\'appareil et regarde l\'<b>icône batterie</b> sur l\'écran : 3 barres = OK. Si elle clignote, recharge-la avec le chargeur.', voir: 'Une charge complète donne environ 550 photos sans flash (manuel p.33).', aide: AIDE.allumage.slice(0, 1) },
      { titre: 'Carte mémoire en place', ou: 'La carte SD est dans la trappe sur le <b>côté droit</b> (côté poignée). Le petit taquet sur le côté de la carte doit être <b>vers le haut</b> (pas sur LOCK).', voir: 'L\'écran affiche le nombre de photos possibles (en bas à droite).', aide: AIDE.declenchement.slice(1, 3) },
      { titre: 'Objectif prêt', ou: 'Sur le <b>côté gauche de l\'objectif</b> : <span class="kbd">AF/MF</span> sur <b>AF</b> et <span class="kbd">STABILIZER</span> sur <b>ON</b>.', voir: 'Sur MF, la mise au point automatique ne marche pas : c\'est la première cause de photos floues.' },
      { titre: 'ISO sur AUTO', ou: 'Mets la molette des modes sur <b>Tv</b>. Appuie sur <span class="kbd">ISO</span> (dessus), tourne la molette principale jusqu\'à <b>AUTO</b>, puis <span class="kbd">SET</span>.', voir: 'Utile pour le panoramique filé et le filé d\'eau. Dans les modes à icônes, l\'ISO est toujours automatique.', aide: AIDE.vitesseTv.slice(1) },
      { titre: 'Photo par photo', ou: 'Au dos, <b>flèche gauche de la croix</b> → choisis le <b>rectangle simple</b> (vue par vue) → <span class="kbd">SET</span>.', voir: 'Le retardateur reste réglé même quand on change de mode : cette vérification évite une attente surprise de 10 secondes.' },
      { titre: 'Viseur net pour ta vue', ou: 'Regarde dans le viseur et tourne la <b>petite molette juste à droite du viseur</b> (correcteur dioptrique) jusqu\'à ce que les petits carrés soient bien nets.', voir: 'Réglage à faire une seule fois (manuel p.39). Sans lui, tu crois que la photo est floue alors qu\'elle est nette.' }
    ];
    var html = '<div class="intro"><h2>Préparer l\'appareil</h2><p>À vérifier avant une sortie photo. Ensuite, chaque guide va droit au but.</p></div>' +
      htmlEtapes('Check-list', etapes, cochesPreparer) +
      '<div class="encart info"><strong>Bien tenir l\'appareil (manuel p.39)</strong><ul class="astuces">' +
      '<li>Main droite autour de la poignée, main gauche sous l\'objectif.</li>' +
      '<li>Coudes serrés contre le corps, un pied légèrement devant l\'autre.</li>' +
      '<li>L\'appareil appuyé contre le visage, l\'œil au viseur.</li></ul></div>';
    cadre({ titre: 'Préparer l\'appareil', retour: '#/', onglet: 'styles', html: html });
    brancherEtapes(etapes, cochesPreparer, vuePreparer);
  }

  // ---------- Dépannage (source : guide de dépannage du manuel, p.278-287) ----------

  function vueDepannage() {
    var groupes = [
      ['Allumage et écran', AIDE.allumage],
      ['Mise au point', AIDE.miseAuPoint],
      ['Le déclencheur ne marche pas', AIDE.declenchement],
      ['Flash et lumière', [
        ['Le flash sort tout seul', 'Normal dans les modes A+, Portrait, Gros-plan et Portrait de nuit quand il fait sombre (manuel p.282). Pour l\'éviter : style « Nuit / peu de lumière » (mode Flash annulé).'],
        ['La vitesse clignote dans le viseur', AIDE.clignoteVitesse[0][1]]
      ]],
      ['Après la photo', AIDE.resultat],
      ['Viseur', [
        ['Tout est flou dans le viseur', 'Tourne la petite molette juste à droite du viseur (correcteur dioptrique) jusqu\'à ce que les petits carrés soient nets.']
      ]],
      ['Message « Err » sur l\'écran', [
        ['Err 01', 'Mauvais contact avec l\'objectif : nettoie délicatement les contacts dorés de l\'objectif et de l\'appareil, puis remonte l\'objectif.'],
        ['Err 02', 'Problème de carte : retire-la et remets-la, ou change de carte.'],
        ['Err 04', 'Carte pleine : efface des photos ou change de carte.'],
        ['Err 05', 'Flash bloqué : éteins puis rallume l\'appareil.'],
        ['Autre numéro', 'Éteins, retire la batterie, remets-la et rallume. Si ça persiste, note le numéro pour le SAV Canon.']
      ]]
    ];
    var html = '<div class="intro"><h2>Ça ne marche pas ?</h2><p>Les problèmes les plus courants et leur solution, d\'après le guide de dépannage du mode d\'emploi Canon.</p></div>';
    groupes.forEach(function (g) {
      html += '<section class="section"><h2 class="section-titre">' + esc(g[0]) + '</h2><ul class="liste-aide">' +
        g[1].map(function (a) { return '<li><strong>' + esc(a[0]) + '</strong><span>' + esc(a[1]) + '</span></li>'; }).join('') + '</ul></section>';
    });
    cadre({ titre: 'Dépannage', retour: '#/aide', onglet: 'aide', html: html });
  }

  // Schéma simplifié du dos (d'après le manuel p.19) : repères A à G
  function schemaDos() {
    function rep(n, x, y) { return '<circle class="repere" cx="' + x + '" cy="' + y + '" r="11"/><text class="repere-txt" x="' + x + '" y="' + (y + 4.5) + '" text-anchor="middle">' + n + '</text>'; }
    return '<svg class="schema" viewBox="0 0 340 200" role="img" aria-label="Schéma du dos de l\'appareil">' +
      '<text x="170" y="16" text-anchor="middle">Vu de dos (côté écran)</text>' +
      '<rect class="corps" x="14" y="26" width="312" height="160" rx="18"/>' +
      '<rect class="piece" x="140" y="32" width="56" height="30" rx="6"/><text x="168" y="52" text-anchor="middle">viseur</text>' +
      '<circle class="piece" cx="208" cy="44" r="6"/>' +
      '<rect class="piece" x="30" y="70" width="176" height="106" rx="6"/><text x="118" y="128" text-anchor="middle">écran</text>' +
      '<rect class="piece" x="36" y="38" width="30" height="12" rx="4"/><rect class="piece" x="76" y="38" width="30" height="12" rx="4"/>' +
      '<circle class="piece" cx="274" cy="44" r="8"/><circle class="piece" cx="300" cy="44" r="8"/>' +
      '<rect class="piece" x="214" y="76" width="22" height="16" rx="4"/>' +
      '<rect class="piece" x="214" y="100" width="22" height="16" rx="4"/>' +
      '<circle class="piece" cx="272" cy="126" r="26"/><circle class="piece" cx="272" cy="126" r="10"/><text x="272" y="130" text-anchor="middle" style="font-size:9px">SET</text>' +
      '<rect class="piece" x="214" y="156" width="22" height="16" rx="4"/>' +
      '<rect class="piece" x="290" y="160" width="20" height="14" rx="4"/>' +
      rep('A', 51, 30) + rep('B', 91, 30) + rep('C', 225, 84) + rep('D', 204, 108) + rep('E', 304, 104) + rep('F', 225, 164) + rep('G', 300, 64) + rep('H', 222, 34) +
      '</svg>';
  }

  function vueIntrouvable() {
    cadre({ titre: 'PhotoAssist', retour: '#/', onglet: 'styles', html: '<div class="vide"><div class="ico">🤔</div><h2>Page introuvable</h2><a class="bouton" href="#/">Retour aux styles</a></div>' });
  }

  // ---------- Routeur ----------

  function router() {
    var h = (location.hash || '#/').slice(1);
    var p = h.split('/').filter(Boolean);
    if (!p.length) return vueAccueil();
    if (p[0] === 'style' && p[1]) return vueConfiguration(p[1]);
    if (p[0] === 'resultat' && p.length === 4) return vueResultat(p[1], p[2], p[3]);
    if (p[0] === 'favoris') return vueFavoris();
    if (p[0] === 'aide') return vueAide();
    if (p[0] === 'boutons') return vueBoutons();
    if (p[0] === 'bases') return vueBases();
    if (p[0] === 'installer') return vueInstaller();
    if (p[0] === 'express') return vueExpress();
    if (p[0] === 'preparer') return vuePreparer();
    if (p[0] === 'depannage') return vueDepannage();
    vueIntrouvable();
  }

  window.addEventListener('hashchange', function () {
    try { sessionStorage.setItem('pa.nav', '1'); } catch (e) { /* ignoré */ }
    router();
  });

  // ---------- Démarrage ----------

  fetch('data/reglages.json')
    .then(function (rep) { if (!rep.ok) throw new Error(rep.status); return rep.json(); })
    .then(function (d) { DONNEES = d; router(); })
    .catch(function () {
      $vue.innerHTML = '<div class="vide"><div class="ico">📡</div><h2>Impossible de charger les réglages</h2>' +
        '<p>Connecte-toi à Internet une fois, puis rouvre l\'app.</p><button class="bouton" onclick="location.reload()">Réessayer</button></div>';
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* hors-ligne indisponible */ }); });
  }
})();
