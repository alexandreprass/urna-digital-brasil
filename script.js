const SUPABASE_URL = 'https://wrbzltzglyfnfjvxiuqb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KcFm3ZHBGG9s0KvEh2xYqg_Cg_J2Z4G';

const UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

const CANDIDATES = {
  lula: { number: '13', name: 'LULA', party: 'Partido: PT', photo: 'lula.webp' },
  flavio: { number: '22', name: 'FLÁVIO BOLSONARO', party: 'Partido: PL', photo: 'flavio.webp' }
};

let db = null;
let channel = null;
let currentInput = '';
let branco = false;
let locked = false;
let origin = { kind: 'state', code: 'SP', name: 'São Paulo' };
let votes = { lula: 0, flavio: 0, byState: {}, abroad: { lula: 0, flavio: 0 } };
let shownPct = null;
let audioCtx = null;

function beep(freq, dur) {
  try {
    audioCtx = audioCtx || new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (error) {}
}

async function init() {
  await loadMap();
  await detectLocation();
  document.getElementById('online').textContent = 'Seu voto entra em ' + placeName();
  try {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const loaded = await loadVotes();
    if (!loaded) loadLocalVotes();
    await subscribeLive();
  } catch (error) {
    loadLocalVotes();
  }
  renderScreen();
  updateDisplay();
  updateMap();
}

function svgMarkup(text) {
  return text.replace(/^\uFEFF/, '').replace(/<\?xml[\s\S]*?\?>/, '');
}

async function loadMap() {
  const [brazil, world] = await Promise.all([
    fetch('brazil-map.svg').then((res) => res.text()),
    fetch('world-map.svg').then((res) => res.text())
  ]);
  const container = document.getElementById('map-container');
  container.innerHTML = svgMarkup(brazil);
  container.querySelectorAll('.state').forEach((el) => {
    el.addEventListener('pointerenter', () => showTip(el));
    el.addEventListener('pointerleave', () => {
      document.getElementById('map-tip').textContent = 'Passe o mouse no estado ou no exterior para ver os votos.';
    });
  });
  const globe = document.getElementById('globe-container');
  globe.innerHTML = svgMarkup(world);
  const globeBox = document.getElementById('globe');
  globeBox.addEventListener('pointerenter', showAbroadTip);
  globeBox.addEventListener('pointerleave', () => {
    document.getElementById('map-tip').textContent = 'Passe o mouse no estado ou no exterior para ver os votos.';
  });
}

function showTip(el) {
  const uf = el.id.toUpperCase();
  const st = (votes.byState && votes.byState[uf]) || { lula: 0, flavio: 0 };
  const nome = el.getAttribute('aria-label') || UF[uf] || uf;
  document.getElementById('map-tip').textContent = nome + ' · Lula ' + st.lula + ' · Flávio ' + st.flavio;
}

function showAbroadTip() {
  const st = votes.abroad || { lula: 0, flavio: 0 };
  document.getElementById('map-tip').textContent = 'Exterior · Lula ' + st.lula + ' · Flávio ' + st.flavio;
}

function placeName() {
  if (origin.kind === 'country') return 'Exterior';
  return UF[origin.code] || origin.code;
}

async function detectLocation() {
  try {
    const res = await fetch('https://ipwho.is/');
    const data = await res.json();
    const country = data && data.country_code ? String(data.country_code).toUpperCase() : '';
    if (country === 'BR' && UF[data.region_code]) {
      origin = { kind: 'state', code: data.region_code, name: UF[data.region_code] };
    } else if (/^[A-Z]{2}$/.test(country) && country !== 'BR') {
      origin = { kind: 'country', code: country, name: 'Exterior' };
    }
  } catch (error) {}
}

function press(num) {
  if (locked || currentInput.length >= 2) return;
  branco = false;
  currentInput += num;
  beep(880, 0.05);
  renderScreen();
}

function corrigir() {
  if (locked) return;
  currentInput = '';
  branco = false;
  beep(440, 0.05);
  renderScreen();
}

function votoBranco() {
  if (locked) return;
  currentInput = '';
  branco = true;
  beep(440, 0.05);
  renderScreen();
}

function confirmar() {
  if (locked) return;
  if (branco) {
    showFim();
    return;
  }
  if (currentInput === '13') finishVote('lula');
  else if (currentInput === '22') finishVote('flavio');
  else if (currentInput.length < 2) setHelp('Digite o número com dois dígitos.');
  else setHelp('Número inexistente. Aperte CORRIGE.');
}

function finishVote(candidate) {
  if (!vote(candidate)) return;
  showFim();
}

function showFim() {
  locked = true;
  document.getElementById('screen').classList.add('fim');
  beep(660, 0.08);
  setTimeout(() => beep(990, 0.14), 90);
  setTimeout(() => {
    locked = false;
    currentInput = '';
    branco = false;
    document.getElementById('screen').classList.remove('fim');
    renderScreen();
  }, 1100);
}

function renderScreen() {
  document.getElementById('d1').textContent = currentInput[0] || '';
  document.getElementById('d2').textContent = currentInput[1] || '';
  const photo = document.getElementById('cand-photo');
  const name = document.getElementById('cand-name');
  const party = document.getElementById('cand-party');
  photo.hidden = true;
  document.getElementById('silhouette').hidden = false;
  name.textContent = '';
  party.textContent = '';
  if (branco) {
    name.textContent = 'VOTO EM BRANCO';
    setHelp('BRANCO não entra no placar. CONFIRMA encerra. CORRIGE volta.');
    return;
  }
  const cand = currentInput === '13' ? CANDIDATES.lula : currentInput === '22' ? CANDIDATES.flavio : null;
  if (cand) {
    photo.hidden = false;
    photo.src = cand.photo;
    photo.alt = cand.name;
    document.getElementById('silhouette').hidden = true;
    name.textContent = cand.name;
    party.textContent = cand.party;
    setHelp('CONFIRMA para confirmar este voto. CORRIGE para reiniciar.');
  } else if (currentInput.length === 2) {
    name.textContent = 'NÚMERO ERRADO';
    setHelp('Aperte CORRIGE e digite de novo.');
  } else {
    setHelp('Digite 13 ou 22 e aperte CONFIRMA.');
  }
}

function setHelp(text) {
  document.getElementById('screen-help').textContent = text;
}

function vote(candidate) {
  const lastVote = Number(localStorage.getItem('lastVote') || 0);
  if (Date.now() - lastVote < 2000) {
    setHelp('Aguarde 2 segundos entre votos.');
    return false;
  }
  localStorage.setItem('lastVote', String(Date.now()));
  if (origin.kind === 'country') {
    applyAbroad(candidate, true);
    if (channel) {
      channel.send({ type: 'broadcast', event: 'vote', payload: { candidate: candidate, abroad: true } });
    }
    if (db) {
      db.rpc('cast_abroad_vote', { p_candidate: candidate }).then(({ error }) => {
        if (error) console.warn(error.message || error);
      });
    }
  } else {
    applyVote(candidate, origin.code, true);
    if (channel) {
      channel.send({ type: 'broadcast', event: 'vote', payload: { candidate: candidate, state: origin.code } });
    }
    if (db) {
      db.rpc('cast_vote', { p_candidate: candidate, p_state: origin.code }).then(({ error }) => {
        if (error) console.warn(error.message || error);
      });
    }
  }
  return true;
}

function applyVote(candidate, uf, animate) {
  if (!CANDIDATES[candidate] || !UF[uf]) return;
  votes[candidate] += 1;
  if (!votes.byState) votes.byState = {};
  if (!votes.byState[uf]) votes.byState[uf] = { lula: 0, flavio: 0 };
  votes.byState[uf][candidate] += 1;
  saveLocalVotes();
  updateDisplay();
  updateMap();
  if (animate) flyVote(candidate, uf, false);
}

function applyAbroad(candidate, animate) {
  if (!CANDIDATES[candidate]) return;
  votes[candidate] += 1;
  if (!votes.abroad) votes.abroad = { lula: 0, flavio: 0 };
  votes.abroad[candidate] += 1;
  saveLocalVotes();
  updateDisplay();
  updateMap();
  if (animate) flyVote(candidate, '', true);
}

function flyVote(candidate, code, abroad) {
  const svg = abroad ? null : document.querySelector('#map-container svg');
  const state = svg && svg.querySelector('#' + code.toLowerCase());
  const target = document.getElementById(candidate === 'lula' ? 'lula-score' : 'flavio-score');
  if (!target) return;
  const end = target.getBoundingClientRect();
  let x;
  let y;
  if (state) {
    const start = state.getBoundingClientRect();
    x = start.left + start.width / 2;
    y = start.top + start.height / 2;
  } else {
    const map = document.getElementById(abroad ? 'globe' : 'map-container').getBoundingClientRect();
    x = map.left + map.width / 2;
    y = map.top + map.height / 2;
  }
  const dot = document.createElement('div');
  dot.className = 'fly ' + candidate;
  dot.textContent = CANDIDATES[candidate].number;
  dot.style.left = x + 'px';
  dot.style.top = y + 'px';
  document.body.appendChild(dot);
  const dx = end.left + end.width / 2 - x;
  const dy = end.top + end.height / 2 - y;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dot.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.45)';
      dot.style.opacity = '0.15';
    });
  });
  setTimeout(() => {
    target.classList.add('pop');
    setTimeout(() => target.classList.remove('pop'), 220);
    dot.remove();
  }, 900);
}

function formatPct(part, total) {
  if (!total) return '0%';
  const rounded = Math.round((part / total) * 1000) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return text + '%';
}

function updateDisplay() {
  const lula = votes.lula || 0;
  const flavio = votes.flavio || 0;
  const total = lula + flavio;
  document.getElementById('lula-count').textContent = lula;
  document.getElementById('flavio-count').textContent = flavio;
  document.getElementById('total-count').textContent = total;
  const lulaPct = total ? (lula / total) * 100 : 0;
  const flavioPct = total ? 100 - lulaPct : 0;
  paintTrend('lula-trend', lulaPct);
  paintTrend('flavio-trend', flavioPct);
  shownPct = { lula: lulaPct, flavio: flavioPct };
  document.getElementById('lula-pct').textContent = formatPct(lula, total);
  document.getElementById('flavio-pct').textContent = formatPct(flavio, total);
  document.getElementById('lula-bar').style.width = lulaPct + '%';
  document.getElementById('flavio-bar').style.width = flavioPct + '%';
  document.getElementById('race-bar').setAttribute('aria-label', 'Lula ' + formatPct(lula, total) + ', Flávio ' + formatPct(flavio, total));
}

function paintTrend(id, now) {
  const el = document.getElementById(id);
  const key = id === 'lula-trend' ? 'lula' : 'flavio';
  if (!shownPct || Math.abs(now - shownPct[key]) < 0.05) {
    el.textContent = '';
    el.className = 'trend';
    return;
  }
  if (now > shownPct[key]) {
    el.textContent = '▲';
    el.className = 'trend up';
  } else {
    el.textContent = '▼';
    el.className = 'trend down';
  }
}

function updateMap() {
  const svg = document.querySelector('#map-container svg');
  if (svg) {
    svg.querySelectorAll('.state').forEach((el) => {
      el.classList.remove('red', 'green');
      const st = votes.byState[el.id.toUpperCase()];
      if (!st) return;
      if (st.lula > st.flavio) el.classList.add('red');
      else if (st.flavio > st.lula) el.classList.add('green');
    });
  }
  updateWorld();
}

function updateWorld() {
  const face = document.querySelector('.globe-face');
  if (!face) return;
  const row = votes.abroad || { lula: 0, flavio: 0 };
  face.classList.remove('red', 'green');
  if (row.lula > row.flavio) face.classList.add('red');
  else if (row.flavio > row.lula) face.classList.add('green');
}

function loadLocalVotes() {
  try {
    const saved = JSON.parse(localStorage.getItem('urnaVotes') || 'null');
    if (saved && saved.byState) {
      votes = saved;
      if (!votes.abroad) {
        votes.abroad = { lula: 0, flavio: 0 };
        const old = votes.byCountry || {};
        Object.keys(old).forEach((code) => {
          votes.abroad.lula += old[code].lula || 0;
          votes.abroad.flavio += old[code].flavio || 0;
        });
      }
    }
  } catch (error) {}
  updateDisplay();
  updateMap();
}

function saveLocalVotes() {
  localStorage.setItem('urnaVotes', JSON.stringify(votes));
}

async function loadVotes() {
  const { data, error } = await db.from('state_totals').select('state, lula, flavio');
  if (error || !data) return false;
  const abroad = await db.from('abroad_totals').select('lula, flavio').limit(1);
  votes = { lula: 0, flavio: 0, byState: {}, abroad: { lula: 0, flavio: 0 } };
  data.forEach((row) => {
    if (!UF[row.state]) return;
    const lula = Number(row.lula) || 0;
    const flavio = Number(row.flavio) || 0;
    votes.byState[row.state] = { lula: lula, flavio: flavio };
    votes.lula += lula;
    votes.flavio += flavio;
  });
  if (abroad.data && abroad.data[0]) {
    votes.abroad.lula = Number(abroad.data[0].lula) || 0;
    votes.abroad.flavio = Number(abroad.data[0].flavio) || 0;
    votes.lula += votes.abroad.lula;
    votes.flavio += votes.abroad.flavio;
  }
  saveLocalVotes();
  updateDisplay();
  updateMap();
  return true;
}

function subscribeLive() {
  channel = db.channel('urna-live');
  channel.on('broadcast', { event: 'vote' }, ({ payload }) => {
    if (!payload) return;
    if (payload.abroad || payload.country) applyAbroad(payload.candidate, true);
    else applyVote(payload.candidate, payload.state, true);
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') finish();
    });
    setTimeout(finish, 3000);
  });
}

document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.getAttribute('data-key');
    if (key === 'corrige') corrigir();
    else if (key === 'confirma') confirmar();
    else if (key === 'branco') votoBranco();
    else press(key);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key >= '0' && event.key <= '9') press(event.key);
  else if (event.key === 'Backspace') { event.preventDefault(); corrigir(); }
  else if (event.key === 'Enter') confirmar();
});

document.addEventListener('DOMContentLoaded', init);
