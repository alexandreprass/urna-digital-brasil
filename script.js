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

let supabase = null;
let channel = null;
let currentInput = '';
let branco = false;
let locked = false;
let userState = 'SP';
let votes = { lula: 0, flavio: 0, byState: {} };
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
  document.getElementById('online').textContent = 'Seu voto entra em ' + (UF[userState] || userState);
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

async function loadMap() {
  const res = await fetch('brazil-map.svg');
  const text = await res.text();
  const container = document.getElementById('map-container');
  container.innerHTML = text.replace(/^\uFEFF/, '');
  container.querySelectorAll('.state').forEach((el) => {
    el.addEventListener('pointerenter', () => showTip(el));
    el.addEventListener('pointerleave', () => {
      document.getElementById('map-tip').textContent = 'Passe o mouse no estado para ver os votos.';
    });
  });
}

function showTip(el) {
  const uf = el.id.toUpperCase();
  const st = votes.byState[uf] || { lula: 0, flavio: 0 };
  const nome = el.getAttribute('aria-label') || UF[uf] || uf;
  document.getElementById('map-tip').textContent = nome + ' · Lula ' + st.lula + ' · Flávio ' + st.flavio;
}

async function detectLocation() {
  try {
    const res = await fetch('https://ipwho.is/');
    const data = await res.json();
    if (data && data.country_code === 'BR' && UF[data.region_code]) userState = data.region_code;
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
  applyVote(candidate, userState, true);
  if (channel) {
    channel.send({ type: 'broadcast', event: 'vote', payload: { candidate: candidate, state: userState } });
  }
  if (supabase) {
    supabase.from('votes').insert({ candidate: candidate, state: userState }).then(({ error }) => {
      if (error) console.warn(error.message || error);
    });
  }
  return true;
}

function applyVote(candidate, uf, animate) {
  if (!CANDIDATES[candidate] || !UF[uf]) return;
  votes[candidate] += 1;
  if (!votes.byState[uf]) votes.byState[uf] = { lula: 0, flavio: 0 };
  votes.byState[uf][candidate] += 1;
  saveLocalVotes();
  updateDisplay();
  updateMap();
  if (animate) flyVote(candidate, uf);
}

function flyVote(candidate, uf) {
  const svg = document.querySelector('#map-container svg');
  const state = svg && svg.querySelector('#' + uf.toLowerCase());
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
    const map = document.getElementById('map-container').getBoundingClientRect();
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

function updateDisplay() {
  document.getElementById('lula-count').textContent = votes.lula || 0;
  document.getElementById('flavio-count').textContent = votes.flavio || 0;
  document.getElementById('total-count').textContent = (votes.lula || 0) + (votes.flavio || 0);
}

function updateMap() {
  const svg = document.querySelector('#map-container svg');
  if (!svg) return;
  svg.querySelectorAll('.state').forEach((el) => {
    el.classList.remove('red', 'green');
    const st = votes.byState[el.id.toUpperCase()];
    if (!st) return;
    if (st.lula > st.flavio) el.classList.add('red');
    else if (st.flavio > st.lula) el.classList.add('green');
  });
}

function loadLocalVotes() {
  try {
    const saved = JSON.parse(localStorage.getItem('urnaVotes') || 'null');
    if (saved && saved.byState) votes = saved;
  } catch (error) {}
  updateDisplay();
  updateMap();
}

function saveLocalVotes() {
  localStorage.setItem('urnaVotes', JSON.stringify(votes));
}

async function loadVotes() {
  const { data, error } = await supabase.from('votes').select('candidate, state');
  if (error || !data) return false;
  votes = { lula: 0, flavio: 0, byState: {} };
  data.forEach((row) => {
    if (!CANDIDATES[row.candidate] || !UF[row.state]) return;
    votes[row.candidate] += 1;
    if (!votes.byState[row.state]) votes.byState[row.state] = { lula: 0, flavio: 0 };
    votes.byState[row.state][row.candidate] += 1;
  });
  saveLocalVotes();
  updateDisplay();
  updateMap();
  return true;
}

function subscribeLive() {
  channel = supabase.channel('urna-live');
  channel.on('broadcast', { event: 'vote' }, ({ payload }) => {
    if (!payload) return;
    applyVote(payload.candidate, payload.state, true);
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
