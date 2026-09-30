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

  // Mode de la molette pour un style (Portrait, Paysage, Sports, Flash annulé, CA ou Tv)
  function modeDe(styleId) {
    var id = style(styleId).modeAppareil;
    return DONNEES.modes.filter(function (m) { return m.id === id; })[0];
  }

  // Étapes basées sur le mode d'emploi Canon 600D : on utilise les modes intégrés
  // de la molette et l'ISO AUTO, l'appareil règle lui-même ce qu'il sait régler.
  function etapesPour(r) {
    var e = [];
    var m = modeDe(r.style);
    var tv = m.id === 'Tv';

    e.push({
      titre: 'Allume l\'appareil',
      ou: 'Interrupteur <b>sur le dessus, à droite</b>, à côté de la grande molette des modes : mets-le sur <span class="kbd">ON</span>.',
      voir: 'L\'écran au dos affiche les réglages. S\'il reste noir, appuie sur le bouton <span class="kbd">DISP.</span> (sur le dessus, à côté du bouton ISO).'
    });
    e.push({
      titre: 'Molette des modes sur « ' + m.nom + ' »',
      ou: 'Tourne la <b>grande molette sur le dessus, à droite</b> jusqu\'à ' + esc(m.repere) + ', face au trait blanc.',
      voir: esc(m.role)
    });
    if (m.id === 'ca') {
      e.push({
        titre: 'Choisis « arrière-plan net »',
        ou: 'Appuie sur le bouton <span class="kbd">Q</span> (au dos, près de la croix). Avec les flèches de la croix, va sur la ligne <b>flou ↔ net</b>. Tourne la <b>molette principale</b> (derrière le déclencheur) <b>vers la droite</b>, jusqu\'au bout.',
        voir: 'Le curseur est côté « net ». Appuie à moitié sur le déclencheur pour revenir.'
      });
    }
    if (tv) {
      e.push({
        titre: 'Règle la vitesse sur ' + vitesseTexte(r.vitesse),
        ou: 'Tourne la <b>molette principale</b> : la petite molette crantée <b>juste derrière le déclencheur</b>, sous ton index.',
        voir: 'L\'écran affiche <span class="kbd">' + esc(vitesseBoitier(r.vitesse)) + '</span>' + (r.vitesse.indexOf('/') > -1 ? ' (l\'appareil n\'écrit pas le « 1/ »).' : ' (le signe " veut dire secondes).') +
          ' L\'ISO doit être sur <b>AUTO</b> : sinon, bouton <span class="kbd">ISO</span> sur le dessus → AUTO → <span class="kbd">SET</span>.'
      });
    }
    e.push({
      titre: 'Zoom sur ' + r.focale + ' mm',
      ou: 'Tourne la <b>large bague en caoutchouc</b> de l\'objectif jusqu\'à ce que <b>' + r.focale + '</b> soit face au petit trait blanc.',
      voir: r.focale === 85 ? '85 = zoom au maximum (bague tournée jusqu\'au bout).' : r.focale === 17 ? '17 = le plus large (bague tournée jusqu\'au bout dans l\'autre sens).' : 'Pas besoin d\'être au millimètre près.'
    });
    if (r.trepied) {
      var dixSec = !tv; // en mode automatique, seul le retardateur 10 s est disponible (manuel p.64)
      e.push({
        titre: 'Trépied + retardateur ' + (dixSec ? '10' : '2') + ' secondes',
        ou: 'Pose l\'appareil sur le trépied. Puis au dos, appuie sur la <b>flèche gauche de la croix</b> (mode d\'acquisition) et choisis l\'<b>horloge « ' + (dixSec ? '10' : '2') + ' »</b>, puis <span class="kbd">SET</span>.',
        voir: 'L\'icône horloge s\'affiche à l\'écran : ton doigt ne fera pas bouger l\'appareil. Pense à revenir sur le rectangle simple après.'
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
        : 'Un « bip » et le <b>point vert</b> s\'allume à droite, en bas du viseur : c\'est net.'
    });
    if (tv) {
      e.push({
        titre: 'Regarde si l\'ouverture clignote',
        ou: 'En bas du viseur, le <b>2e nombre</b> est l\'ouverture choisie par l\'appareil (le 1er, à gauche, est ta vitesse).',
        voir: 'Fixe : tout va bien. Clignote sur un <b>petit nombre</b> (4 ou 5.6) : trop sombre → tourne la molette principale <b>vers la gauche</b> (plus lent). Clignote sur <b>22</b> : trop clair → molette <b>vers la droite</b> (plus rapide).'
      });
    } else if (!r.trepied) {
      e.push({
        titre: 'Regarde si la vitesse clignote',
        ou: 'Toujours à moitié enfoncé, regarde le <b>1er nombre en bas à gauche du viseur</b> : c\'est la vitesse choisie par l\'appareil.',
        voir: 'Fixe : tout va bien. S\'il <b>clignote</b>, l\'appareil te prévient d\'un risque de flou : appuie-toi contre un mur ou une table et tiens-toi bien immobile' + (r.focale > 17 ? ', ou dézoome vers 17' : '') + '. Le chiffre isolé tout à droite (ex. 9) n\'est pas la vitesse : c\'est le nombre de photos en rafale, ignore-le.'
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
      voir: r.trepied ? 'Ne touche à rien avant le « clac » de fin de photo.' : 'Un « clac » : la photo est prise et s\'affiche 2 secondes à l\'écran.'
    });
    e.push({
      titre: 'Regarde le résultat',
      ou: 'Bouton lecture <span class="kbd">▶</span> au dos, en bas à droite. Pour zoomer dans la photo : bouton loupe, au dos en haut à droite.',
      voir: 'Floue ? Relis le conseil ci-dessous. Pour revenir à la prise de vue, appuie à moitié sur le déclencheur.'
    });
    return e;
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
    var m = modeDe(styleId);
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

    html += '<section class="section"><h2 class="section-titre">Pas à pas sur ton Canon</h2>' +
      '<div class="progression"><div class="jauge"><i id="jauge"></i></div><span id="compteur"></span><button type="button" id="btn-raz">Tout décocher</button></div>' +
      '<ol class="etapes">';
    etapes.forEach(function (et, i) {
      html += '<li class="etape' + (cochees[i] ? ' faite' : '') + '" data-i="' + i + '">' +
        '<button type="button" class="coche" aria-pressed="' + !!cochees[i] + '" aria-label="Étape ' + (i + 1) + ' faite">' + (cochees[i] ? '✓' : i + 1) + '</button>' +
        '<div class="etape-corps"><h3>' + esc(et.titre) + '</h3><p class="ou">' + et.ou + '</p><p class="voir">' + et.voir + '</p></div></li>';
    });
    html += '</ol></section>';

    html += '<p class="encart conseil"><strong>💡 Conseil</strong>' + esc(r.conseil) + '</p>';

    var fav = estFavori(styleId, sujetId, situId);
    html += '<div class="section"><button type="button" class="bouton ' + (fav ? 'secondaire' : '') + '" id="btn-fav">' + (fav ? '★ Dans mes favoris' : '☆ Enregistrer dans mes favoris') + '</button>' +
      '<a class="bouton discret" href="#/style/' + styleId + '">Changer la lumière ou le sujet</a></div>';

    cadre({ titre: 'Réglages', retour: '#/style/' + styleId, onglet: 'styles', nuit: nuit, html: html });

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
      vueResultat(styleId, sujetId, situId);
    };
    document.getElementById('btn-fav').onclick = function () {
      var ajoute = basculerFavori(styleId, sujetId, situId);
      this.className = 'bouton ' + (ajoute ? 'secondaire' : '');
      this.textContent = ajoute ? '★ Dans mes favoris' : '☆ Enregistrer dans mes favoris';
      toast(ajoute ? 'Ajouté à tes favoris' : 'Retiré de tes favoris');
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
      ['1', 'Molette des modes', 'Dessus, à droite. Icônes : tête de profil = Portrait, montagnes = Paysage, personnage qui court = Sports, éclair barré = Flash annulé, CA = Créatif auto, et Tv.'],
      ['2', 'Interrupteur ON / OFF', 'Dessus, à droite, à côté de la molette des modes.'],
      ['3', 'Déclencheur', 'Dessus, à droite, sous ton index. À moitié = mise au point, à fond = photo.'],
      ['4', 'Molette principale', 'Dessus, juste derrière le déclencheur. Elle change la valeur affichée.'],
      ['5', 'Boutons ISO et DISP.', 'Dessus, derrière la molette principale. DISP. allume ou éteint l\'écran des réglages.'],
      ['6', 'Bouton Q', 'Au dos, près de la croix. Ouvre l\'écran de réglage rapide (utilisé en mode CA).'],
      ['7', 'Croix + SET', 'Au dos, à droite. SET au centre valide. La flèche gauche règle le retardateur.'],
      ['8', 'Bouton lecture ▶', 'Au dos, en bas à droite. Pour revoir tes photos.']
    ];
    var html = '<div class="intro"><h2>Les boutons du 600D</h2><p>Les repères utilisés dans les étapes.</p></div>' +
      schemaAppareil() + '<ul class="liste-aide">';
    reperes.forEach(function (r) {
      html += '<li><strong>' + r[0] + '. ' + esc(r[1]) + '</strong><span>' + esc(r[2]) + '</span></li>';
    });
    html += '<li><strong>Sur l\'objectif (côté gauche)</strong><span>Interrupteur AF/MF : toujours sur AF. Interrupteur STABILIZER : sur ON. La large bague en caoutchouc règle le zoom (17 à 85).</span></li></ul>' +
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
