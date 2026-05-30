export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  if (!env.SCORES_KV) {
    return new Response(JSON.stringify({ error: 'KV 바인딩 미설정' }), { status: 500, headers });
  }

  const { roundId } = await request.json();

  await env.SCORES_KV.delete(`round:${roundId}`);

  const idsRaw = await env.SCORES_KV.get('rounds_index');
  const ids = idsRaw ? JSON.parse(idsRaw) : [];
  await env.SCORES_KV.put('rounds_index', JSON.stringify(ids.filter(id => id !== roundId)));

  const currentId = await env.SCORES_KV.get('current_round_id');
  if (currentId === roundId) {
    await env.SCORES_KV.delete('current_round_id');
  }

  return new Response(JSON.stringify({ success: true }), { headers });
}
