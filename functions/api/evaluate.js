const MEMBER_ROLES = {
  mom: 'parent', dad: 'parent',
  child1: 'child', child2: 'child'
};

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩이 설정되지 않았어요' }), { status: 500, headers });
  }

  const { sessionId, evaluator, scores } = await request.json();

  const raw = await env.SCORES_KV.get(`session:${sessionId}`);
  if (!raw) {
    return new Response(JSON.stringify({ error: '세션을 찾을 수 없어요' }), { status: 404, headers });
  }

  const session = JSON.parse(raw);
  const total = scores.reduce((a, b) => a + b, 0);

  session.evaluations[evaluator] = {
    scores,
    total,
    submittedAt: new Date().toISOString()
  };

  // 4명 전원 완료 시 세션 종료
  if (Object.keys(MEMBER_ROLES).every(m => session.evaluations[m])) {
    session.isComplete = true;
    session.totalScore = Object.values(session.evaluations).reduce((a, e) => a + e.total, 0);
    await env.SCORES_KV.delete('current_session_id');
  }

  await env.SCORES_KV.put(`session:${sessionId}`, JSON.stringify(session));

  return new Response(JSON.stringify({ session }), { headers });
}
