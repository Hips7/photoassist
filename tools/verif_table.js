// Contrôle de cohérence de data/reglages.json
// Lancer : node tools/verif_table.js
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'reglages.json'), 'utf8'));

// Niveau de lumière de chaque situation (EV à ISO 100) — cf. DECISIONS.md
const EV = { plein_soleil: 15, ciel_voile: 13, ombre: 12, interieur_lumineux: 7, interieur_sombre: 5, nuit: 3 };
const OUVERTURES = [4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];
const ISO_AUTO = [100, 200, 400, 800, 1600, 3200, 6400]; // plage ISO AUTO en Tv (manuel p.80)
const VITESSES_600D = ['1/4000','1/3200','1/2500','1/2000','1/1600','1/1250','1/1000','1/800','1/640','1/500','1/400','1/320','1/250','1/200','1/160','1/125','1/100','1/80','1/60','1/50','1/40','1/30','1/25','1/20','1/15','1/13','1/10','1/8','1/6','1/5','1/4','0.3','0.4','0.5','0.6','0.8','1','1.3','1.6','2','2.5','3.2','4','5','6','8','10','13','15','20','25','30'];
// Ouverture max du 17-85 selon la focale (valeur la plus petite possible)
const OUV_MAX = { 17: 4, 24: 4.5, 35: 5, 50: 5.6, 85: 5.6 };
const OUV_MIN = 22;
const MODES_SCENE = ['portrait', 'ca', 'paysage', 'sports', 'flash_annule', 'gros_plan', 'auto'];

const secondes = v => v.includes('/') ? 1 / Number(v.split('/')[1]) : Number(v);

const erreurs = [];
const vus = new Set();
const sujetsIds = new Set(data.sujets.map(s => s.id));
const situIds = new Set(data.situations.map(s => s.id));
const stylesIds = new Set(data.styles.map(s => s.id));
const modesIds = new Set(data.modes.map(m => m.id));

for (const s of data.styles) {
  if (!modesIds.has(s.modeAppareil)) erreurs.push(`Mode appareil inconnu pour ${s.id}`);
  if (!s.astuces || !s.astuces.length) erreurs.push(`Astuces manquantes pour ${s.id}`);
  if (!fs.existsSync(path.join(__dirname, '..', s.image))) erreurs.push(`Image manquante pour ${s.id}`);
}

for (const r of data.regles) {
  const cle = `${r.style}+${r.situation}+${r.sujet}`;
  if (vus.has(cle)) erreurs.push(`Doublon : ${cle}`);
  vus.add(cle);
  if (!stylesIds.has(r.style) || !situIds.has(r.situation) || !sujetsIds.has(r.sujet)) erreurs.push(`Identifiant inconnu : ${cle}`);
  const style = data.styles.find(s => s.id === r.style);
  if (style && !style.sujets.includes(r.sujet)) erreurs.push(`Sujet non compatible avec le style : ${cle}`);

  if (r.indisponible) {
    if (!r.raison || !r.alternativeTexte) erreurs.push(`Indisponible sans explication : ${cle}`);
    if (r.alternative && !stylesIds.has(r.alternative)) erreurs.push(`Alternative inconnue : ${cle}`);
    const styleAlt = data.styles.find(s => s.id === r.alternative);
    if (r.alternativeSujet && !(styleAlt && styleAlt.sujets.includes(r.alternativeSujet))) erreurs.push(`alternativeSujet incompatible : ${cle}`);
    continue;
  }
  if (!(r.focale in OUV_MAX)) erreurs.push(`Focale non gérée ${r.focale} : ${cle}`);
  if (!r.conseil) erreurs.push(`Conseil manquant : ${cle}`);
  if (/f\/\d|1\/\d{3}/.test(r.conseil)) erreurs.push(`Conseil cite une valeur fixe (ouverture/vitesse) : ${cle}`);

  if (r.mode && !modesIds.has(r.mode)) erreurs.push(`Mode inconnu ${r.mode} : ${cle}`);
  const mode = r.mode || (style && style.modeAppareil);

  // Réglages manuels (mode « Je règle moi-même ») : présents et cohérents avec la lumière
  const m = r.manuel;
  if (!m) erreurs.push(`Réglage manuel manquant : ${cle}`);
  else {
    const N = Number(m.ouverture.replace('f/', ''));
    if (!['Av', 'Tv'].includes(m.mode)) erreurs.push(`Mode manuel invalide : ${cle}`);
    if (!ISO_AUTO.includes(m.iso)) erreurs.push(`ISO manuel invalide ${m.iso} : ${cle}`);
    if (!VITESSES_600D.includes(m.vitesse)) erreurs.push(`Vitesse manuelle invalide ${m.vitesse} : ${cle}`);
    if (!OUVERTURES.includes(N)) erreurs.push(`Ouverture manuelle invalide ${m.ouverture} : ${cle}`);
    if (N < OUV_MAX[r.focale] || N > OUV_MIN) erreurs.push(`Ouverture ${m.ouverture} impossible à ${r.focale} mm : ${cle}`);
    const ev = Math.log2(N * N / secondes(m.vitesse)) - Math.log2(m.iso / 100);
    if (!m.limite && Math.abs(ev - EV[r.situation]) > 0.7) erreurs.push(`Exposition manuelle fausse (écart ${(ev - EV[r.situation]).toFixed(2)} IL) : ${cle}`);
    if (m.limite && m.iso !== 6400 && !r.trepied) erreurs.push(`« limite » alors que l'ISO peut encore monter : ${cle}`);
    if (!r.trepied && !m.limite && m.vitesseMini && secondes(m.vitesse) > secondes(m.vitesseMini) * 1.12) erreurs.push(`Vitesse manuelle trop lente sans alerte : ${cle}`);
  }
  if (MODES_SCENE.includes(mode)) {
    // Modes automatiques : l'appareil règle tout, aucune valeur ne doit être imposée
    if (r.vitesse || r.iso || r.ouverture) erreurs.push(`Valeur imposée en mode automatique : ${cle}`);
    if (r.retardateur && !r.trepied) erreurs.push(`Retardateur sans trépied : ${cle}`);
    continue;
  }

  // Mode Tv + ISO AUTO : il doit exister un ISO donnant une ouverture possible
  if (r.iso !== 'AUTO') erreurs.push(`ISO doit être AUTO en Tv : ${cle}`);
  if (!VITESSES_600D.includes(r.vitesse)) { erreurs.push(`Vitesse invalide ${r.vitesse} : ${cle}`); continue; }
  const t = secondes(r.vitesse);
  const faisable = ISO_AUTO.some(iso => {
    const N = Math.sqrt(t * Math.pow(2, EV[r.situation]) * iso / 100);
    return N >= OUV_MAX[r.focale] * 0.9 && N <= OUV_MIN * 1.12; // tolérance 1/3 d'IL
  });
  if (!faisable) erreurs.push(`Exposition impossible en Tv ${r.vitesse} avec ISO AUTO : ${cle}`);
  if (!r.trepied && t > 1 / 15) erreurs.push(`Vitesse trop lente à main levée : ${cle}`);
}

// Couverture : chaque style × sujet compatible × situation doit exister
for (const s of data.styles) for (const su of s.sujets) for (const si of data.situations) {
  if (!vus.has(`${s.id}+${si.id}+${su}`)) erreurs.push(`Combinaison manquante : ${s.id}+${si.id}+${su}`);
}

const dispo = data.regles.filter(r => !r.indisponible).length;
console.log(`${data.regles.length} règles (${dispo} réglages, ${data.regles.length - dispo} indisponibles expliqués)`);
if (erreurs.length) { console.log('ERREURS :\n- ' + erreurs.join('\n- ')); process.exit(1); }
console.log('OK : table cohérente');
