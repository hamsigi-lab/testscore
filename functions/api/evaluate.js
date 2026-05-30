const ALL_MEMBERS = ['mom', 'dad', 'child1', 'child2'];
const MEMBER_ROLES = { mom: 'parent', dad: 'parent', child1: 'child', child2: 'child' };
const PRESENTER_POINTS = {
  parent: { A: 19, B: 18, C: 17, D: 16 },
  child:  { A: 20, B: 19, C: 18, D: 17 }
};

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩 미설정' }), { status: 500, headers });
  }

  // grades: ['A','B','C','D','A'] — 발표자 역할 기준으로 점수 계산
  const { roundId, evaluator, presenter, grades } = await request.json();

  const raw = await env.SCORES_KV.get(`round:${roundId}`);
  if (!raw) {
    return new Response(JSON.stringify({ error: '라운드를 찾을 수 없어요' }), { status: 404, headers });
  }

  const round = JSON.parse(raw);
  const presenterRole = MEMBER_ROLES[presenter];
  const points = PRESENTER_POINTS[presenterRole];
  const scores = grades.map(g => points[g]);
  const total = scores.reduce((a, b) => a + b, 0);

  if (!round.evaluations[evaluator]) round.evaluations[evaluator] = {};
  round.evaluations[evaluator][presenter] = {
    grades,  // 등급 저장 (재계산 가능하도록)
    scores,
    total,
    submittedAt: new Date().toISOString()
  };

  // 4명 × 4명 = 16개 완료 시 라운드 종료
  const isComplete = ALL_MEMBERS.every(ev =>
    round.evaluations[ev] && ALL_MEMBERS.every(pr => round.evaluations[ev][pr])
  );

  if (isComplete) {
    round.isComplete = true;
    round.presenterTotals = {};
    ALL_MEMBERS.forEach(pr => {
      round.presenterTotals[pr] = ALL_MEMBERS.reduce((sum, ev) => {
        return sum + (round.evaluations[ev]?.[pr]?.total || 0);
      }, 0);
    });
    await env.SCORES_KV.delete('current_round_id');
  }

  await env.SCORES_KV.put(`round:${roundId}`, JSON.stringify(round));
  return new Response(JSON.stringify({ round }), { headers });
}
