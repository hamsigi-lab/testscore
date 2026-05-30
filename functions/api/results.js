const ALL_MEMBERS = ['mom', 'dad', 'child1', 'child2'];
const MEMBER_ROLES = { mom: 'parent', dad: 'parent', child1: 'child', child2: 'child' };
const PRESENTER_POINTS = {
  parent: { A: 19, B: 18, C: 17, D: 16 },
  child:  { A: 20, B: 19, C: 18, D: 17 }
};
// 구형 데이터: 평가자 기준으로 저장된 점수 → 등급 역산
const SCORE_TO_GRADE = {
  parent: { 19: 'A', 18: 'B', 17: 'C', 16: 'D' },
  child:  { 20: 'A', 19: 'B', 18: 'C', 17: 'D' }
};

function recalcTotal(evaluatorId, presenterId, evData) {
  const presenterRole = MEMBER_ROLES[presenterId];
  const points = PRESENTER_POINTS[presenterRole];

  // grades 필드가 있으면 그대로 사용, 없으면 평가자 기준으로 역산
  const grades = evData.grades
    ? evData.grades
    : evData.scores.map(s => SCORE_TO_GRADE[MEMBER_ROLES[evaluatorId]][s] || 'D');

  return grades.reduce((sum, g) => sum + (points[g] || 0), 0);
}

export async function onRequestGet(context) {
  const { env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩 미설정' }), { status: 500, headers });
  }

  const idsRaw = await env.SCORES_KV.get('rounds_index');
  if (!idsRaw) return new Response(JSON.stringify({ rounds: [] }), { headers });

  const ids = JSON.parse(idsRaw);
  const rawRounds = await Promise.all(
    ids.map(id => env.SCORES_KV.get(`round:${id}`).then(r => r ? JSON.parse(r) : null))
  );

  const rounds = rawRounds.filter(Boolean).map(round => {
    if (!round.isComplete) return round;

    // 항상 발표자 기준으로 재계산 (구형·신형 데이터 모두 처리)
    const presenterTotals = {};
    ALL_MEMBERS.forEach(presenter => {
      presenterTotals[presenter] = ALL_MEMBERS.reduce((sum, evaluator) => {
        const evData = round.evaluations?.[evaluator]?.[presenter];
        if (!evData) return sum;
        return sum + recalcTotal(evaluator, presenter, evData);
      }, 0);
    });

    return { ...round, presenterTotals };
  });

  return new Response(JSON.stringify({ rounds }), { headers });
}
