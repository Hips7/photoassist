// Contrôle de cohérence de data/reglages.json
// Lancer : node tools/verif_table.js
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'reglages.json'), 'utf8'));

// Niveau de lumière de chaque situation (EV à ISO 100) — cf. DECISIONS.md
const EV = { plein_soleil: 15, ciel_voile: 13, ombre: 12, interieur_lumineux: 8, interieur_sombre: 6, nuit: 4 };
const ISO_600D = [100, 200, 400, 800, 1600, 3200, 6400];
const VITESSES_600D = ['1/4000','1/3200','1/2500','1/2000','1/1600','1/1250','1/1000','1/800','1/640','1/500','1/400','1/320','1/250','1/200','1/160','1/125','1/100','1/80','1/60','1/50','1/40','1/30','1/25','1/20','1/15','1/13','1/10','1/8','1/6','1/5','1/4','0.3','0.4','0.5','0.6','0.8','1','1.3','1.6','2','2.5','3.2','4','5','6','8','10','13','15','20','25','30'];
// Ouverture max du 17-85 selon la focale (valeur la plus petite possible)
const OUV_MAX = { 17: 4, 24: 4.5, 35: 5, 50: 5.6, 85: 5.6 };
const OUV_MIN = 22;

const secondes = v => v.includes('/') ? 1 / Number(v.split('/')[1]) : Number(v);
const fnum = o => Number(o.replace('f/', ''));

const erreurs = [];
const vus = new Set();
const sujetsIds = new Set(data.sujets.map(s => s.id));
const situIds = new Set(data.situations.map(s => s.id));
const stylesIds = new Set(data.styles.map(s => s.id));

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
  if (!['Av', 'Tv'].includes(r.mode)) erreurs.push(`Mode invalide : ${cle}`);
  if (!ISO_600D.includes(r.iso)) erreurs.push(`ISO invalide ${r.iso} : ${cle}`);
  if (!VITESSES_600D.includes(r.vitesse)) erreurs.push(`Vitesse invalide ${r.vitesse} : ${cle}`);
  if (!(r.focale in OUV_MAX)) erreurs.push(`Focale non gérée ${r.focale} : ${cle}`);
  const N = fnum(r.ouverture);
  if (N < OUV_MAX[r.focale]) erreurs.push(`Ouverture ${r.ouverture} impossible à ${r.focale} mm : ${cle}`);
  if (N > OUV_MIN) erreurs.push(`Ouverture ${r.ouverture} au-delà de f/22 : ${cle}`);
  if (!r.conseil) erreurs.push(`Conseil manquant : ${cle}`);

  // Exposition : EV100 = log2(N²/t) - log2(ISO/100) doit coller au niveau de la situation
  const ev = Math.log2(N * N / secondes(r.vitesse)) - Math.log2(r.iso / 100);
  const ecart = ev - EV[r.situation];
  if (Math.abs(ecart) > 0.7) erreurs.push(`Exposition fausse (écart ${ecart.toFixed(2)} IL) : ${cle}`);

  // Sans trépied : vitesse assez rapide pour ne pas avoir de flou de bougé
  if (!r.trepied) {
    if (r.mode === 'Av' && !r.vitesseMini) erreurs.push(`vitesseMini manquante (Av main levée) : ${cle}`);
    if (secondes(r.vitesse) > 1 / 15) erreurs.push(`Vitesse trop lente à main levée : ${cle}`);
    if (r.vitesseMini && secondes(r.vitesse) > secondes(r.vitesseMini)) erreurs.push(`Vitesse prévue plus lente que vitesseMini : ${cle}`);
  }
}

// Couverture : chaque style × sujet compatible × situation doit exister
for (const s of data.styles) for (const su of s.sujets) for (const si of data.situations) {
  if (!vus.has(`${s.id}+${si.id}+${su}`)) erreurs.push(`Combinaison manquante : ${s.id}+${si.id}+${su}`);
}

const dispo = data.regles.filter(r => !r.indisponible).length;
console.log(`${data.regles.length} règles (${dispo} réglages, ${data.regles.length - dispo} indisponibles expliqués)`);
if (erreurs.length) { console.log('ERREURS :\n- ' + erreurs.join('\n- ')); process.exit(1); }
console.log('OK : table cohérente');
