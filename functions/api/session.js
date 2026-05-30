export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩 미설정' }), { status: 500, headers });
  }

  if (request.method === 'GET') {
    const roundId = await env.SCORES_KV.get('current_round_id');
    if (!roundId) return new Response(JSON.stringify({ round: null }), { headers });
    const raw = await env.SCORES_KV.get(`round:${roundId}`);
    return new Response(JSON.stringify({ round: raw ? JSON.parse(raw) : null }), { headers });
  }

  if (request.method === 'POST') {
    const roundId = String(Date.now());
    const now = new Date();
    const round = {
      id: roundId,
      date: now.toISOString().split('T')[0],
      // evaluations[evaluatorId][presenterId] = { scores, total }
      evaluations: {},
      isComplete: false,
      presenterTotals: null,
      createdAt: now.toISOString()
    };

    await env.SCORES_KV.put(`round:${roundId}`, JSON.stringify(round));
    await env.SCORES_KV.put('current_round_id', roundId);

    const idsRaw = await env.SCORES_KV.get('rounds_index');
    const ids = idsRaw ? JSON.parse(idsRaw) : [];
    ids.push(roundId);
    await env.SCORES_KV.put('rounds_index', JSON.stringify(ids));

    return new Response(JSON.stringify({ round }), { headers });
  }

  return new Response('Method not allowed', { status: 405 });
}
