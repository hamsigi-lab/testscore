let state = {
  currentSession: null,
  activeTab: null
};

// ── Init ─────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const ev = params.get('evaluator');

  await refreshSession();

  if (!state.currentSession) {
    showView('presenter');
  } else {
    // QR로 접속한 경우 해당 탭으로 바로 진입
    if (ev && CONFIG.members[ev]) {
      state.activeTab = ev;
      showView('evaluate');
    } else {
      showView('main');
    }
  }
}

async function refreshSession() {
  try {
    const res = await fetch('/api/session');
    if (res.ok) {
      const { session } = await res.json();
      state.currentSession = session;
    }
  } catch {
    state.currentSession = null;
  }
}

// ── View router ───────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  window.scrollTo(0, 0);

  const renders = {
    presenter: renderPresenter,
    main:      renderMain,
    evaluate:  renderEvaluate,
    results:   renderResults,
    qr:        renderQR
  };
  if (renders[name]) renders[name]();
}

function backToMain() {
  if (state.currentSession && !state.currentSession.isComplete) {
    showView('main');
  } else {
    showView('presenter');
  }
}

async function goResults() {
  showView('results');
}

async function newPresenter() {
  if (!confirm('새로운 발표를 시작할까요?')) return;
  state.currentSession = null;
  showView('presenter');
}

// ── Presenter selection ───────────────────────────────

function renderPresenter() {
  document.getElementById('presenter-grid').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => `
      <div class="member-card" onclick="startSession('${id}')">
        <div class="emoji">${m.emoji}</div>
        <div class="name">${m.name}</div>
        <div class="role">${m.role === 'parent' ? '부모' : '자녀'}</div>
      </div>
    `).join('');
}

async function startSession(presenterId) {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presenter: presenterId })
    });
    const { session } = await res.json();
    state.currentSession = session;
    showView('main');
  } catch {
    alert('오류가 발생했어요. 다시 시도해 주세요.');
  }
}

// ── Main ──────────────────────────────────────────────

async function renderMain() {
  await refreshSession();

  const session = state.currentSession;
  if (!session) { showView('presenter'); return; }

  const presenter = CONFIG.members[session.presenter];
  const evalCount = Object.keys(session.evaluations || {}).length;

  document.getElementById('main-title').textContent = `${presenter.emoji} ${presenter.name} 발표 중`;
  document.getElementById('main-progress').textContent = `${evalCount} / 4 평가 완료`;

  document.getElementById('main-grid').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => {
      const done = !!(session.evaluations && session.evaluations[id]);
      return `
        <div class="member-card ${done ? 'card-done' : ''}" onclick="openEvaluate('${id}')">
          <div class="emoji">${m.emoji}</div>
          <div class="name">${m.name}</div>
          <div class="card-status">${done ? '✓ 완료' : '탭해서 평가'}</div>
        </div>
      `;
    }).join('');

  document.getElementById('main-complete').style.display = session.isComplete ? 'block' : 'none';
}

function openEvaluate(evaluatorId) {
  state.activeTab = evaluatorId;
  showView('evaluate');
}

// ── Evaluate (tabbed) ─────────────────────────────────

function renderEvaluate() {
  const session = state.currentSession;
  const presenter = CONFIG.members[session.presenter];

  document.getElementById('eval-presenter-title').textContent =
    `${presenter.emoji} ${presenter.name} 발표 평가`;

  if (session.isComplete) {
    document.getElementById('eval-complete-banner').style.display = 'block';
  }

  renderTabs();
  renderTabContent(state.activeTab);
}

function renderTabs() {
  const session = state.currentSession;
  document.getElementById('eval-tabs').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => {
      const done = !!(session.evaluations && session.evaluations[id]);
      const active = id === state.activeTab;
      return `
        <button class="eval-tab ${active ? 'tab-active' : ''} ${done ? 'tab-done' : ''}"
          onclick="switchTab('${id}')">
          ${m.emoji} ${m.name}${done ? ' ✓' : ''}
        </button>
      `;
    }).join('');
}

function switchTab(id) {
  state.activeTab = id;
  renderTabs();
  renderTabContent(id);
  window.scrollTo(0, 0);
}

function renderTabContent(evaluatorId) {
  const session = state.currentSession;
  const evaluator = CONFIG.members[evaluatorId];
  const points = CONFIG.gradePoints[evaluator.role];
  const existing = session.evaluations && session.evaluations[evaluatorId];

  document.getElementById('eval-content').innerHTML = `
    <div class="evaluator-label">
      ${evaluator.emoji} ${evaluator.name} 평가
      <span class="max-label">(만점 ${CONFIG.maxScore[evaluator.role]}점)</span>
    </div>
    ${CONFIG.items.map((item, i) => {
      const savedGrade = existing
        ? Object.entries(points).find(([, v]) => v === existing.scores[i])?.[0]
        : null;
      return `
        <div class="item-card">
          <div class="item-name">${i + 1}. ${item.name}</div>
          <div class="item-desc">${item.desc}</div>
          <div class="grade-options">
            ${['A', 'B', 'C', 'D'].map(g => `
              <label class="grade-btn ${savedGrade === g ? 'selected' : ''}" id="grade-${item.id}-${g}">
                <input type="radio" name="item-${item.id}" value="${g}" style="display:none"
                  ${savedGrade === g ? 'checked' : ''}
                  onchange="onGradeSelect('${item.id}', '${g}')">
                <div class="grade-label">${g}</div>
                <div class="grade-points">${points[g]}점</div>
                <div class="grade-desc">${item.grades[g]}</div>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;

  updateSaveBtn();
}

function onGradeSelect(itemId, grade) {
  ['A', 'B', 'C', 'D'].forEach(g => {
    document.getElementById(`grade-${itemId}-${g}`).classList.toggle('selected', g === grade);
  });
  updateSaveBtn();
}

function updateSaveBtn() {
  const allSelected = CONFIG.items.every(item =>
    document.querySelector(`input[name="item-${item.id}"]:checked`)
  );
  const btn = document.getElementById('save-btn');
  btn.disabled = !allSelected;

  const existing = state.currentSession.evaluations?.[state.activeTab];
  const status = document.getElementById('save-status');
  if (existing) {
    btn.textContent = '다시 저장';
    status.textContent = '저장된 평가가 있어요';
    status.className = 'save-status saved';
  } else {
    btn.textContent = '저장';
    status.textContent = '';
  }
}

async function saveEvaluation() {
  const evaluatorId = state.activeTab;
  const points = CONFIG.gradePoints[CONFIG.members[evaluatorId].role];

  const scores = CONFIG.items.map(item => {
    const checked = document.querySelector(`input[name="item-${item.id}"]:checked`);
    return points[checked.value];
  });

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.currentSession.id,
        evaluator: evaluatorId,
        scores
      })
    });
    const { session } = await res.json();
    state.currentSession = session;

    const status = document.getElementById('save-status');
    status.textContent = '✓ 저장됐어요!';
    status.className = 'save-status saved';
    btn.textContent = '다시 저장';
    btn.disabled = false;

    renderTabs();

    if (session.isComplete) {
      document.getElementById('eval-complete-banner').style.display = 'block';
    }
  } catch {
    alert('저장 중 오류가 발생했어요.');
    btn.disabled = false;
    btn.textContent = '저장';
  }
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

    content.innerHTML = `
      <div style="padding: 20px;">
        ${ranked.length ? `
          <div class="section-title">누적 순위 (평균 점수)</div>
          ${ranked.map((r, i) => {
            const m = CONFIG.members[r.id];
            return `
              <div class="rank-card">
                <div class="rank-medal">${medals[i] || (i + 1)}</div>
                <div class="rank-emoji">${m.emoji}</div>
                <div class="rank-info">
                  <div class="rank-name">${m.name}</div>
                  <div class="rank-sub">${r.count}회 발표 · 최고 ${Math.max(...r.scores)}점</div>
                </div>
                <div class="rank-score">${r.avg}<small>점</small></div>
              </div>
            `;
          }).join('')}
        ` : ''}
        <div class="section-title">발표 기록</div>
        ${[...sessions].reverse().map(s => {
          const m = CONFIG.members[s.presenter];
          const evalCount = Object.keys(s.evaluations || {}).length;
          return `
            <div class="history-item" onclick="toggleDetail('${s.id}')">
              <div class="history-header">
                <span class="history-presenter">${m.emoji} ${m.name}</span>
                ${s.isComplete
                  ? `<span class="history-score">${s.totalScore} / ${CONFIG.totalMaxScore}점</span>`
                  : `<span class="history-pending">평가 중 ${evalCount}/4</span>`
                }
              </div>
              <div class="history-date">${formatDate(s.date)}</div>
              ${s.isComplete ? `
                <div id="detail-${s.id}" class="history-detail" style="display:none">
                  ${Object.entries(s.evaluations).map(([evId, ev]) => {
                    const evMember = CONFIG.members[evId];
                    return `<div class="detail-row">
                      <span>${evMember.emoji} ${evMember.name}</span>
                      <span>${ev.total}점</span>
                    </div>`;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch {
    content.innerHTML = '<div class="empty-state"><p>결과를 불러오지 못했어요.</p></div>';
  }
}

function toggleDetail(id) {
  const el = document.getElementById(`detail-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function formatDate(d) {
  const [, m, day] = d.split('-');
  return `${parseInt(m)}월 ${parseInt(day)}일`;
}

// ── QR ────────────────────────────────────────────────

function renderQR() {
  const base = window.location.origin;
  document.getElementById('qr-content').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => `
      <div class="qr-card">
        <div class="qr-emoji">${m.emoji}</div>
        <div class="qr-name">${m.name}</div>
        <canvas id="qr-${id}"></canvas>
        <div class="qr-url">${base}?evaluator=${id}</div>
      </div>
    `).join('');

  Object.keys(CONFIG.members).forEach(id => {
    QRCode.toCanvas(document.getElementById(`qr-${id}`), `${base}?evaluator=${id}`, {
      width: 150, margin: 1,
      color: { dark: '#1E1B4B', light: '#FFFFFF' }
    });
  });
}

// ── Boot ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
