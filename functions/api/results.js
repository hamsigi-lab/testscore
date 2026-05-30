export async function onRequestGet(context) {
  const { env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩 미설정' }), { status: 500, headers });
  }

  const idsRaw = await env.SCORES_KV.get('rounds_index');
  if (!idsRaw) return new Response(JSON.stringify({ rounds: [] }), { headers });

  const ids = JSON.parse(idsRaw);
  const rounds = await Promise.all(
    ids.map(id => env.SCORES_KV.get(`round:${id}`).then(r => r ? JSON.parse(r) : null))
  );

  return new Response(JSON.stringify({ rounds: rounds.filter(Boolean) }), { headers });
}
