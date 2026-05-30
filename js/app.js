let state = {
  evaluator: null,
  currentSession: null,
  lastSubmission: null
};

// ── Init ─────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const ev = params.get('evaluator');
  if (ev && CONFIG.members[ev]) state.evaluator = ev;

  await refreshSession();

  if (!state.evaluator) {
    showView('select-who');
  } else {
    showView('home');
  }
}

async function refreshSession() {
  try {
    const res = await fetch('/api/session');
    if (res.ok) {
      const data = await res.json();
      state.currentSession = data.session;
    }
  } catch {
    state.currentSession = null;
  }
}

// ── View router ───────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${name}`);
  if (el) el.classList.add('active');

  const renders = {
    'select-who':  renderSelectWho,
    'home':        renderHome,
    'new-session': renderNewSession,
    'evaluate':    renderEvaluate,
    'results':     renderResults,
    'qr':          renderQR
  };
  if (renders[name]) renders[name]();
  window.scrollTo(0, 0);
}

// ── Select who ────────────────────────────────────────

function renderSelectWho() {
  document.getElementById('select-who-grid').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => `
      <div class="member-card" onclick="selectEvaluator('${id}')">
        <div class="emoji">${m.emoji}</div>
        <div class="name">${m.name}</div>
        <div class="role">${m.role === 'parent' ? '부모' : '자녀'}</div>
      </div>
    `).join('');
}

function selectEvaluator(id) {
  state.evaluator = id;
  const url = new URL(window.location.href);
  url.searchParams.set('evaluator', id);
  window.history.replaceState({}, '', url.toString());
  showView('home');
}

// ── Home ──────────────────────────────────────────────

function renderHome() {
  const m = CONFIG.members[state.evaluator];
  document.getElementById('home-evaluator-badge').textContent = `${m.emoji} ${m.name}`;

  const content = document.getElementById('home-content');

  if (!state.currentSession) {
    content.innerHTML = `
      <div class="session-card">
        <div class="empty-state">
          <div class="empty-emoji">🎤</div>
          <p>아직 발표가 시작되지 않았어요</p>
        </div>
      </div>
      <div class="home-actions">
        <button onclick="showView('new-session')" class="btn-primary">새 발표 시작하기</button>
      </div>
    `;
    return;
  }

  const session = state.currentSession;
  const presenter = CONFIG.members[session.presenter];
  const evalCount = Object.keys(session.evaluations || {}).length;
  const alreadyEvaluated = !!(session.evaluations && session.evaluations[state.evaluator]);

  const chips = Object.entries(CONFIG.members).map(([id, mem]) => {
    const done = session.evaluations && session.evaluations[id];
    return `<span class="evaluator-chip ${done ? 'done' : 'pending'}">${mem.emoji} ${mem.name} ${done ? '✓' : ''}</span>`;
  }).join('');

  content.innerHTML = `
    <div class="session-card">
      <div class="presenter-emoji">${presenter.emoji}</div>
      <div class="presenter-name">${presenter.name} 발표 중</div>
      <div class="session-status">${evalCount} / 4 평가 완료</div>
      <div class="evaluators-status">${chips}</div>
    </div>
    <div class="home-actions">
      ${alreadyEvaluated
        ? `<button class="btn-secondary" style="opacity:0.5;cursor:default">✓ 이미 평가했어요</button>`
        : `<button onclick="showView('evaluate')" class="btn-primary">평가하기</button>`
      }
      <button onclick="confirmNewSession()" class="btn-text">다른 발표 시작하기</button>
    </div>
  `;
}

async function confirmNewSession() {
  if (!confirm('현재 평가를 종료하고 새 발표를 시작할까요?')) return;
  state.currentSession = null;
  showView('new-session');
}

// ── New session ───────────────────────────────────────

function renderNewSession() {
  document.getElementById('new-session-grid').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => `
      <div class="member-card" onclick="createSession('${id}')">
        <div class="emoji">${m.emoji}</div>
        <div class="name">${m.name}</div>
      </div>
    `).join('');
}

async function createSession(presenterId) {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presenter: presenterId })
    });
    const data = await res.json();
    state.currentSession = data.session;
    showView('home');
  } catch {
    alert('오류가 발생했어요. 다시 시도해 주세요.');
  }
}

// ── Evaluate ──────────────────────────────────────────

function renderEvaluate() {
  const session = state.currentSession;
  const presenter = CONFIG.members[session.presenter];
  const evaluator = CONFIG.members[state.evaluator];
  const points = CONFIG.gradePoints[evaluator.role];

  document.getElementById('evaluate-title').textContent = `${presenter.name} 발표 평가`;
  document.getElementById('evaluate-subtitle').textContent = `평가자: ${evaluator.emoji} ${evaluator.name}`;

  document.getElementById('items-container').innerHTML = CONFIG.items.map((item, i) => `
    <div class="item-card">
      <div class="item-name">${i + 1}. ${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="grade-options">
        ${['A', 'B', 'C', 'D'].map(g => `
          <label class="grade-btn" id="grade-${item.id}-${g}">
            <input type="radio" name="item-${item.id}" value="${g}" style="display:none"
              onchange="onGradeSelect('${item.id}', '${g}')">
            <div class="grade-label">${g}</div>
            <div class="grade-points">${points[g]}점</div>
            <div class="grade-desc">${item.grades[g]}</div>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  document.getElementById('evaluate-form').onsubmit = submitEvaluation;
  updateSubmitBtn();
}

function onGradeSelect(itemId, grade) {
  ['A', 'B', 'C', 'D'].forEach(g => {
    document.getElementById(`grade-${itemId}-${g}`).classList.toggle('selected', g === grade);
  });
  updateSubmitBtn();
}

function updateSubmitBtn() {
  const allSelected = CONFIG.items.every(item =>
    document.querySelector(`input[name="item-${item.id}"]:checked`)
  );
  document.getElementById('submit-btn').disabled = !allSelected;
}

async function submitEvaluation(e) {
  e.preventDefault();
  const role = CONFIG.members[state.evaluator].role;
  const points = CONFIG.gradePoints[role];

  const scores = CONFIG.items.map(item => {
    const checked = document.querySelector(`input[name="item-${item.id}"]:checked`);
    return points[checked.value];
  });

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '제출 중...';

  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.currentSession.id,
        evaluator: state.evaluator,
        scores
      })
    });
    const data = await res.json();
    state.currentSession = data.session;
    state.lastSubmission = { scores, total: scores.reduce((a, b) => a + b, 0), role };
    renderDoneView();
    showView('done');
  } catch {
    alert('제출 중 오류가 발생했어요.');
    btn.disabled = false;
    btn.textContent = '제출하기';
  }
}

// ── Done ──────────────────────────────────────────────

function renderDoneView() {
  const { scores, total, role } = state.lastSubmission;
  const evaluator = CONFIG.members[state.evaluator];

  document.getElementById('done-message').textContent =
    `${evaluator.name}의 평가가 접수되었어요!`;

  const rows = CONFIG.items.map((item, i) => `
    <div class="score-row">
      <span>${item.name}</span>
      <span>${scores[i]}점</span>
    </div>
  `).join('');

  document.getElementById('done-score-card').innerHTML = `
    ${rows}
    <div class="score-row total">
      <span>합계</span>
      <span>${total} / ${CONFIG.maxScore[role]}점</span>
    </div>
  `;
}

async function loadAndShowResults() {
  showView('results');
}

// ── Results ───────────────────────────────────────────

async function renderResults() {
  const content = document.getElementById('results-content');
  content.innerHTML = '<div class="center-fill"><div class="spinner"></div></div>';

  try {
    const res = await fetch('/api/results');
    const { sessions } = await res.json();

    if (!sessions || sessions.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">📊</div>
          <p>아직 평가 기록이 없어요</p>
        </div>
      `;
      return;
    }

    // 누적 순위 집계
    const board = {};
    sessions.filter(s => s.isComplete).forEach(s => {
      if (!board[s.presenter]) board[s.presenter] = { count: 0, total: 0, scores: [] };
      board[s.presenter].count++;
      board[s.presenter].total += s.totalScore;
      board[s.presenter].scores.push(s.totalScore);
    });

    const ranked = Object.entries(board)
      .map(([id, d]) => ({ id, ...d, avg: Math.round(d.total / d.count) }))
      .sort((a, b) => b.avg - a.avg);

    const medals = ['🥇', '🥈', '🥉'];

    const rankHTML = ranked.length ? `
      <div class="section-title">누적 순위 (평균 점수 기준)</div>
      ${ranked.map((r, i) => {
        const m = CONFIG.members[r.id];
        return `
          <div class="rank-card rank-${i + 1}">
            <div class="rank-medal">${medals[i] || (i + 1)}</div>
            <div class="rank-emoji">${m.emoji}</div>
            <div class="rank-info">
              <div class="rank-name">${m.name}</div>
              <div class="rank-sub">${r.count}회 · 최고 ${Math.max(...r.scores)}점</div>
            </div>
            <div class="rank-score">
              ${r.avg}<small>점</small>
            </div>
          </div>
        `;
      }).join('')}
    ` : '';

    const historyHTML = `
      <div class="section-title">발표 기록</div>
      ${[...sessions].reverse().map(s => {
        const m = CONFIG.members[s.presenter];
        const evalCount = Object.keys(s.evaluations || {}).length;
        return `
          <div class="history-item">
            <div class="history-header">
              <span class="history-presenter">${m.emoji} ${m.name}</span>
              ${s.isComplete
                ? `<span class="history-score">${s.totalScore} / ${CONFIG.totalMaxScore}점</span>`
                : `<span class="history-pending">평가 중 ${evalCount}/4</span>`
              }
            </div>
            <div class="history-date">${formatDate(s.date)} ${formatTime(s.createdAt)}</div>
          </div>
        `;
      }).join('')}
    `;

    content.innerHTML = rankHTML + historyHTML;
  } catch {
    content.innerHTML = '<div class="empty-state"><p>결과를 불러오지 못했어요.</p></div>';
  }
}

function formatDate(d) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// ── QR ────────────────────────────────────────────────

function renderQR() {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const content = document.getElementById('qr-content');

  content.innerHTML = Object.entries(CONFIG.members).map(([id, m]) => `
    <div class="qr-card">
      <div class="qr-emoji">${m.emoji}</div>
      <div class="qr-name">${m.name}</div>
      <canvas id="qr-${id}"></canvas>
      <div class="qr-url">${base}?evaluator=${id}</div>
    </div>
  `).join('');

  Object.keys(CONFIG.members).forEach(id => {
    QRCode.toCanvas(document.getElementById(`qr-${id}`), `${base}?evaluator=${id}`, {
      width: 150,
      margin: 1,
      color: { dark: '#1E1B4B', light: '#FFFFFF' }
    });
  });
}

// ── Boot ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
