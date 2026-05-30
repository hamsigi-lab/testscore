export async function onRequestGet(context) {
  const { env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩이 설정되지 않았어요' }), { status: 500, headers });
  }

  const idsRaw = await env.SCORES_KV.get('sessions_index');
  if (!idsRaw) {
    return new Response(JSON.stringify({ sessions: [] }), { headers });
  }

  const ids = JSON.parse(idsRaw);
  const sessions = await Promise.all(
    ids.map(id => env.SCORES_KV.get(`session:${id}`).then(r => r ? JSON.parse(r) : null))
  );

  return new Response(JSON.stringify({ sessions: sessions.filter(Boolean) }), { headers });
}
