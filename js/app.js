let state = {
  evaluator: null,     // 현재 사용자 (평가자)
  currentRound: null,  // 진행 중인 라운드
  activePresenter: null // 현재 선택된 발표자 탭
};

// ── Init ─────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const ev = params.get('evaluator');

  if (ev && CONFIG.members[ev]) {
    state.evaluator = ev;
    await refreshRound();
    showView('evaluate');
  } else {
    showView('select-who');
  }
}

async function refreshRound() {
  try {
    const res = await fetch('/api/session');
    if (res.ok) {
      const data = await res.json();
      state.currentRound = data.round || null;
    }
  } catch {
    state.currentRound = null;
  }
}

// ── View router ───────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  window.scrollTo(0, 0);

  const renders = {
    'select-who': renderSelectWho,
    'evaluate':   renderEvaluate,
    'results':    renderResults,
    'qr':         renderQR
  };
  if (renders[name]) renders[name]();
}

// ── 누구세요? ────────────────────────────────────────

function renderSelectWho() {
  document.getElementById('who-grid').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => `
      <div class="member-card" onclick="selectWho('${id}')">
        <div class="emoji">${m.emoji}</div>
        <div class="name">${m.name}</div>
        <div class="role">${m.role === 'parent' ? '부모' : '자녀'}</div>
      </div>
    `).join('');
}

async function selectWho(id) {
  state.evaluator = id;
  const url = new URL(window.location.href);
  url.searchParams.set('evaluator', id);
  window.history.replaceState({}, '', url.toString());

  await refreshRound();
  showView('evaluate');
}

// ── 평가 화면 ─────────────────────────────────────────

async function renderEvaluate() {
  await refreshRound();

  const m = CONFIG.members[state.evaluator];
  document.getElementById('eval-who-badge').textContent = `${m.emoji} ${m.name}`;

  if (!state.currentRound) {
    document.getElementById('no-round').style.display = 'flex';
    document.getElementById('round-active').style.display = 'none';
    return;
  }

  document.getElementById('no-round').style.display = 'none';
  document.getElementById('round-active').style.display = 'block';

  renderProgressBar();
  renderPresenterTabs();
  checkMyCompletion();

  // 아직 안 한 첫 번째 발표자 탭으로 기본 선택
  if (!state.activePresenter) {
    const myEvals = state.currentRound.evaluations[state.evaluator] || {};
    const first = Object.keys(CONFIG.members).find(id => !myEvals[id])
      || Object.keys(CONFIG.members)[0];
    state.activePresenter = first;
  }

  renderTabContent(state.activePresenter);
}

async function startRound() {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const { round } = await res.json();
    state.currentRound = round;
    state.activePresenter = null;
    renderEvaluate();
  } catch {
    alert('오류가 발생했어요. 다시 시도해 주세요.');
  }
}

// ── 진행 현황 바 ──────────────────────────────────────

function renderProgressBar() {
  const round = state.currentRound;
  const completedCount = Object.keys(CONFIG.members).filter(evId => {
    const evals = round.evaluations[evId] || {};
    return Object.keys(CONFIG.members).every(prId => evals[prId]);
  }).length;

  document.getElementById('round-progress-bar').innerHTML = `
    <div class="progress-inner">
      <span class="progress-label">전체 진행</span>
      <div class="progress-dots">
        ${Object.entries(CONFIG.members).map(([id, m]) => {
          const evals = round.evaluations[id] || {};
          const done = Object.keys(CONFIG.members).every(pr => evals[pr]);
          const isMe = id === state.evaluator;
          return `<span class="progress-dot ${done ? 'dot-done' : ''} ${isMe ? 'dot-me' : ''}"
            title="${m.name}">${m.emoji}${done ? '✓' : ''}</span>`;
        }).join('')}
      </div>
      <span class="progress-count">${completedCount}/4 완료</span>
    </div>
  `;
}

// ── 발표자 탭 ─────────────────────────────────────────

function renderPresenterTabs() {
  const round = state.currentRound;
  const myEvals = round.evaluations[state.evaluator] || {};

  document.getElementById('presenter-tabs').innerHTML =
    Object.entries(CONFIG.members).map(([id, m]) => {
      const done = !!myEvals[id];
      const active = id === state.activePresenter;
      return `
        <button class="eval-tab ${active ? 'tab-active' : ''} ${done ? 'tab-done' : ''}"
          onclick="switchPresenter('${id}')">
          ${m.emoji} ${m.name}${done ? ' ✓' : ''}
        </button>
      `;
    }).join('');
}

function switchPresenter(id) {
  state.activePresenter = id;
  renderPresenterTabs();
  renderTabContent(id);
  window.scrollTo(0, 0);
}

// ── 루브릭 내용 ───────────────────────────────────────

function renderTabContent(presenterId) {
  const round = state.currentRound;
  const presenter = CONFIG.members[presenterId];
  // 점수 기준: 발표자 역할 기준 (평가자 역할과 무관)
  const points = CONFIG.gradePoints[presenter.role];
  const existing = round.evaluations[state.evaluator]?.[presenterId];
  const isSelf = state.evaluator === presenterId;

  // 저장된 등급 불러오기 (신형: grades 필드, 구형: scores에서 역산)
  const savedGrades = existing
    ? (existing.grades || existing.scores.map(s => {
        const evalRole = CONFIG.members[state.evaluator].role;
        return CONFIG.scoreToGrade[evalRole]?.[s] || null;
      }))
    : null;

  document.getElementById('eval-content').innerHTML = `
    <div class="evaluator-label">
      ${presenter.emoji} <strong>${presenter.name}</strong> 발표 평가
      ${isSelf ? '<span class="self-badge">본인</span>' : ''}
      <span class="max-label">만점 ${CONFIG.maxScore[presenter.role]}점</span>
    </div>
    ${CONFIG.items.map((item, i) => {
      const savedGrade = savedGrades ? savedGrades[i] : null;
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

  const existing = state.currentRound.evaluations?.[state.evaluator]?.[state.activePresenter];
  const status = document.getElementById('save-status');
  if (existing) {
    btn.textContent = '수정 저장';
    status.textContent = '이미 저장된 평가';
    status.className = 'save-status saved';
  } else {
    btn.textContent = '저장';
    status.textContent = '';
  }
}

function checkMyCompletion() {
  const myEvals = state.currentRound.evaluations[state.evaluator] || {};
  const allDone = Object.keys(CONFIG.members).every(id => myEvals[id]);
  document.getElementById('eval-done-banner').style.display = allDone ? 'block' : 'none';
}

// ── 저장 ──────────────────────────────────────────────

async function saveEval() {
  // 등급(A/B/C/D)을 서버로 전송 — 점수 계산은 서버에서 발표자 기준으로 처리
  const grades = CONFIG.items.map(item => {
    const checked = document.querySelector(`input[name="item-${item.id}"]:checked`);
    return checked.value;
  });

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundId: state.currentRound.id,
        evaluator: state.evaluator,
        presenter: state.activePresenter,
        grades
      })
    });
    const { round } = await res.json();
    state.currentRound = round;

    // 저장 후 다음 미완료 탭으로 자동 이동
    const myEvals = round.evaluations[state.evaluator] || {};
    const next = Object.keys(CONFIG.members).find(id => !myEvals[id] && id !== state.activePresenter);

    renderProgressBar();
    renderPresenterTabs();
    checkMyCompletion();

    if (next) {
      state.activePresenter = next;
      renderPresenterTabs();
      renderTabContent(next);
      document.getElementById('save-status').textContent = '✓ 저장됐어요!';
      document.getElementById('save-status').className = 'save-status saved';
    } else {
      renderTabContent(state.activePresenter);
    }

    // 라운드 완료 시 결과 페이지로
    if (round.isComplete) {
      setTimeout(() => {
        if (confirm('🎉 모든 평가가 완료됐어요! 결과를 확인할까요?')) {
          showView('results');
        }
      }, 500);
    }
  } catch {
    alert('저장 중 오류가 발생했어요.');
    btn.disabled = false;
    btn.textContent = '저장';
  }
}

// ── 결과 ──────────────────────────────────────────────

async function renderResults() {
  const content = document.getElementById('results-content');
  content.innerHTML = '<div class="center-fill"><div class="spinner"></div></div>';

  try {
    const res = await fetch('/api/results');
    const { rounds } = await res.json();

    if (!rounds || rounds.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">📊</div>
          <p>아직 평가 기록이 없어요</p>
        </div>
      `;
      return;
    }

    // 누적 순위: 발표자별 평균 점수
    const board = {};
    rounds.filter(r => r.isComplete).forEach(r => {
      Object.entries(r.presenterTotals).forEach(([id, score]) => {
        if (!board[id]) board[id] = { count: 0, total: 0, scores: [] };
        board[id].count++;
        board[id].total += score;
        board[id].scores.push(score);
      });
    });

    const ranked = Object.entries(board)
      .map(([id, d]) => ({ id, ...d, avg: Math.round(d.total / d.count) }))
      .sort((a, b) => b.avg - a.avg);

    const medals = ['🥇', '🥈', '🥉'];

    content.innerHTML = `
      <div style="padding: 20px;">
        ${ranked.length ? `
          <div class="section-title">누적 순위 (발표 평균 점수)</div>
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

        <div class="section-title">평가 기록</div>
        ${[...rounds].reverse().map(r => {
          const totalDone = Object.values(r.evaluations).filter(evs =>
            Object.keys(CONFIG.members).every(pr => evs[pr])
          ).length;

          return `
            <div class="history-item">
              <div class="history-header" onclick="toggleRoundDetail('${r.id}')">
                <span class="history-presenter">${formatDate(r.date)} 평가</span>
                <div style="display:flex;align-items:center;gap:8px">
                  ${r.isComplete
                    ? `<span class="history-score">완료</span>`
                    : `<span class="history-pending">${totalDone}/4 제출</span>`
                  }
                  <button class="btn-delete" onclick="deleteRound('${r.id}', event)">🗑️</button>
                </div>
              </div>
              ${r.isComplete ? `
                <div id="detail-${r.id}" class="history-detail" style="display:none">
                  ${Object.entries(r.presenterTotals)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, score]) => {
                      const m = CONFIG.members[id];
                      const max = CONFIG.roundMaxScore[m.role];
                      return `<div class="detail-row">
                        <span>${m.emoji} ${m.name}</span>
                        <span class="detail-score">${score} / ${max}점</span>
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

function toggleRoundDetail(id) {
  const el = document.getElementById(`detail-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function deleteRound(roundId, event) {
  event.stopPropagation();
  if (!confirm('이 평가 기록을 삭제할까요?')) return;
  try {
    await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId })
    });
    renderResults();
  } catch {
    alert('삭제 중 오류가 발생했어요.');
  }
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
