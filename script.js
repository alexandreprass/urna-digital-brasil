// Configuração Supabase
const SUPABASE_URL = 'https://wrbzltzglyfnfjvxiuqb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KcFm3ZHBGG9s0KvEh2xYqg_Cg_J2Z4G';

let supabase = null;
let currentInput = '';
let userState = 'SP'; // default
let votes = { lula: 0, flavio: 0, byState: {} };

// Inicializar
async function init() {
  // Carregar mapa
  await loadMap();
  
  // Detectar localização
  await detectLocation();
  
  // Conectar Supabase
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await loadVotes();
    subscribeRealtime();
  } catch (e) {
    console.warn('Erro ao conectar Supabase, usando modo local:', e);
    loadLocalVotes();
  }
  
  updateDisplay();
  document.getElementById('online').textContent = `Você está em: ${userState} (aproximado por IP)`;
}

async function loadMap() {
  const container = document.getElementById('map-container');
  container.innerHTML = `<object data="brazil-map.svg" type="image/svg+xml" id="brazil-svg" class="w-full h-auto" style="max-height:500px"></object>`;
  
  setTimeout(() => {
    const svg = document.getElementById('brazil-svg');
    if (svg && svg.contentDocument) {
      const states = svg.contentDocument.querySelectorAll('.state');
      states.forEach(s => {
        s.classList.add('neutral');
        s.addEventListener('click', () => alert(`Estado: ${s.id}`));
      });
    }
  }, 1000);
}

async function detectLocation() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data.country_code === 'BR' && data.region_code) {
      userState = data.region_code;
    }
  } catch (e) {
    console.log('Geo falhou, usando SP');
  }
}

function press(num) {
  if (currentInput.length < 2) {
    currentInput += num;
    document.getElementById('display').textContent = currentInput || 'Digite 13 ou 22';
  }
}

function corrigir() {
  currentInput = '';
  document.getElementById('display').textContent = 'Digite 13 ou 22';
}

function confirmar() {
  if (currentInput === '13') {
    vote('lula');
  } else if (currentInput === '22') {
    vote('flavio');
  } else {
    alert('Número inválido. Use 13 ou 22.');
  }
  currentInput = '';
  document.getElementById('display').textContent = 'Voto registrado!';
  setTimeout(() => document.getElementById('display').textContent = 'Digite 13 ou 22', 2000);
}

function votoRapido(cand) {
  vote(cand);
}

async function vote(candidate) {
  const lastVote = localStorage.getItem('lastVote');
  if (lastVote && Date.now() - parseInt(lastVote) < 2000) {
    alert('Aguarde 2 segundos entre votos.');
    return;
  }
  localStorage.setItem('lastVote', Date.now().toString());

  animateVote(candidate, userState);

  if (supabase) {
    const { error } = await supabase.from('votes').insert({
      candidate: candidate,
      state: userState,
      created_at: new Date().toISOString()
    });
    if (error) console.error(error);
  } else {
    votes[candidate]++;
    if (!votes.byState[userState]) votes.byState[userState] = { lula: 0, flavio: 0 };
    votes.byState[userState][candidate]++;
    saveLocalVotes();
    updateDisplay();
    updateMap();
  }
}

function animateVote(candidate, state) {
  const particle = document.createElement('div');
  particle.className = 'vote-particle';
  particle.textContent = '🗳️';
  particle.style.left = '50%';
  particle.style.top = '40%';
  const target = candidate === 'lula' ? document.getElementById('lula-photo') : document.getElementById('flavio-photo');
  const rect = target.getBoundingClientRect();
  const startRect = particle.getBoundingClientRect();
  const tx = rect.left - startRect.left;
  const ty = rect.top - startRect.top;
  particle.style.setProperty('--tx', tx + 'px');
  particle.style.setProperty('--ty', ty + 'px');
  document.body.appendChild(particle);
  setTimeout(() => particle.remove(), 1500);
}

function updateDisplay() {
  document.getElementById('lula-count').textContent = votes.lula || 0;
  document.getElementById('flavio-count').textContent = votes.flavio || 0;
  document.getElementById('total-count').textContent = (votes.lula || 0) + (votes.flavio || 0);
}

function updateMap() {
  const svg = document.getElementById('brazil-svg');
  if (!svg || !svg.contentDocument) return;
  Object.keys(votes.byState || {}).forEach(uf => {
    const el = svg.contentDocument.getElementById(uf);
    if (el) {
      const st = votes.byState[uf];
      el.classList.remove('red', 'green', 'neutral');
      if (st.lula > st.flavio) el.classList.add('red');
      else if (st.flavio > st.lula) el.classList.add('green');
      else el.classList.add('neutral');
    }
  });
}

function loadLocalVotes() {
  const saved = localStorage.getItem('urnaVotes');
  if (saved) votes = JSON.parse(saved);
  updateDisplay();
  updateMap();
}
function saveLocalVotes() {
  localStorage.setItem('urnaVotes', JSON.stringify(votes));
}

async function loadVotes() {
  const { data, error } = await supabase.from('votes').select('candidate, state');
  if (error) return;
  votes = { lula: 0, flavio: 0, byState: {} };
  data.forEach(v => {
    votes[v.candidate] = (votes[v.candidate] || 0) + 1;
    if (!votes.byState[v.state]) votes.byState[v.state] = { lula: 0, flavio: 0 };
    votes.byState[v.state][v.candidate]++;
  });
  updateDisplay();
  updateMap();
}

function subscribeRealtime() {
  supabase.channel('votes-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, payload => {
      const v = payload.new;
      votes[v.candidate] = (votes[v.candidate] || 0) + 1;
      if (!votes.byState[v.state]) votes.byState[v.state] = { lula: 0, flavio: 0 };
      votes.byState[v.state][v.candidate]++;
      updateDisplay();
      updateMap();
      animateVote(v.candidate, v.state);
    })
    .subscribe();
}

document.addEventListener('DOMContentLoaded', init);
