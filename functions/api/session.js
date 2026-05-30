export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩이 설정되지 않았어요' }), { status: 500, headers });
  }

  if (request.method === 'GET') {
    const sessionId = await env.SCORES_KV.get('current_session_id');
    if (!sessionId) {
      return new Response(JSON.stringify({ session: null }), { headers });
    }
    const raw = await env.SCORES_KV.get(`session:${sessionId}`);
    return new Response(JSON.stringify({ session: raw ? JSON.parse(raw) : null }), { headers });
  }

  if (request.method === 'POST') {
    const { presenter } = await request.json();
    const sessionId = String(Date.now());
    const now = new Date();

    const session = {
      id: sessionId,
      date: now.toISOString().split('T')[0],
      presenter,
      evaluations: {},
      isComplete: false,
      totalScore: null,
      createdAt: now.toISOString()
    };

    await env.SCORES_KV.put(`session:${sessionId}`, JSON.stringify(session));
    await env.SCORES_KV.put('current_session_id', sessionId);

    const idsRaw = await env.SCORES_KV.get('sessions_index');
    const ids = idsRaw ? JSON.parse(idsRaw) : [];
    ids.push(sessionId);
    await env.SCORES_KV.put('sessions_index', JSON.stringify(ids));

    return new Response(JSON.stringify({ session }), { headers });
  }

  return new Response('Method not allowed', { status: 405 });
}
