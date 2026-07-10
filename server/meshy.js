/**
 * Meshy AI API client (server-side)
 * Docs: https://docs.meshy.ai/en/api/text-to-3d
 *
 * Endpoints used:
 *  POST https://api.meshy.ai/openapi/v2/text-to-3d     (preview + refine)
 *  GET  https://api.meshy.ai/openapi/v2/text-to-3d/:id (poll status)
 *
 * Optional later:
 *  POST /openapi/v1/image-to-3d
 *  Auto-rig / animation (Pro)
 */

const BASE = 'https://api.meshy.ai/openapi/v2';

const TEST_KEY = 'msy_dummy_api_key_for_test_mode_12345678';

export function resolveApiKey(userKey) {
  return (
    userKey ||
    process.env.MESHY_API_KEY ||
    TEST_KEY
  );
}

async function meshyFetch(path, { method = 'GET', key, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resolveApiKey(key)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.task_error?.message || res.statusText;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Create preview mesh from text */
export async function createPreview(prompt, key, opts = {}) {
  return meshyFetch('/text-to-3d', {
    method: 'POST',
    key,
    body: {
      mode: 'preview',
      prompt: String(prompt).slice(0, 600),
      should_remesh: true,
      pose_mode: opts.poseMode || 'a-pose',
      target_polycount: opts.polycount || 30000,
      target_formats: ['glb'],
      ai_model: opts.aiModel || 'meshy-5',
      moderation: true,
    },
  });
}

/** Texture the preview */
export async function createRefine(previewTaskId, key, opts = {}) {
  return meshyFetch('/text-to-3d', {
    method: 'POST',
    key,
    body: {
      mode: 'refine',
      preview_task_id: previewTaskId,
      enable_pbr: opts.enablePbr !== false,
      target_formats: ['glb'],
      texture_prompt: opts.texturePrompt || undefined,
      ai_model: opts.aiModel || 'meshy-5',
    },
  });
}

export async function getTask(taskId, key) {
  return meshyFetch(`/text-to-3d/${encodeURIComponent(taskId)}`, { key });
}

export async function waitTask(taskId, key, { onProgress, timeoutMs = 15 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const task = await getTask(taskId, key);
    onProgress?.(task);
    if (task.status === 'SUCCEEDED') return task;
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      throw new Error(task.task_error?.message || `Meshy task ${task.status}`);
    }
    await sleep(3000);
  }
  throw new Error('Meshy timeout');
}

/**
 * Full pipeline for RPG characters:
 * preview (A-pose mesh) → refine (PBR textures) → { glbUrl, thumbnail, task }
 */
export async function generateCharacterModel(prompt, key, { onProgress } = {}) {
  const charPrompt =
    `${prompt}. Full body game character, single character only, A-pose, clean topology, ` +
    `RPG fantasy style, no background props, vertical humanoid proportions`;

  onProgress?.({ stage: 'preview', progress: 0, message: 'Criando mesh (preview)…' });
  const previewRes = await createPreview(charPrompt, key, { poseMode: 'a-pose', polycount: 25000 });
  const previewId = previewRes.result;
  if (!previewId) throw new Error('Meshy não retornou preview task id');

  const previewTask = await waitTask(previewId, key, {
    onProgress: (t) =>
      onProgress?.({
        stage: 'preview',
        progress: t.progress || 0,
        message: `Preview: ${t.status} ${t.progress || 0}%`,
        task: t,
      }),
  });

  onProgress?.({ stage: 'refine', progress: 0, message: 'Aplicando texturas (refine)…' });
  const refineRes = await createRefine(previewId, key, {
    enablePbr: true,
    texturePrompt: prompt,
  });
  const refineId = refineRes.result;
  if (!refineId) throw new Error('Meshy não retornou refine task id');

  const refined = await waitTask(refineId, key, {
    onProgress: (t) =>
      onProgress?.({
        stage: 'refine',
        progress: t.progress || 0,
        message: `Refine: ${t.status} ${t.progress || 0}%`,
        task: t,
      }),
  });

  const glbUrl = refined.model_urls?.glb || previewTask.model_urls?.glb;
  if (!glbUrl) throw new Error('Sem URL GLB na resposta Meshy');

  onProgress?.({ stage: 'done', progress: 100, message: 'Personagem pronto!' });
  return {
    glbUrl,
    thumbnailUrl: refined.thumbnail_url || previewTask.thumbnail_url || null,
    previewTaskId: previewId,
    refineTaskId: refineId,
    task: refined,
    prompt: charPrompt,
  };
}

/** Download GLB bytes to disk */
export async function downloadGlb(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao baixar GLB');
  const buf = Buffer.from(await res.arrayBuffer());
  const fs = await import('fs');
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export { TEST_KEY, BASE };
