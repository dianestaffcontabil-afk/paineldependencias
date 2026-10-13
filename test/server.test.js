const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('fluxo principal do painel', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-'));
  const port = 32100 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir } });
  t.after(() => { server.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { server.stdout.on('data', resolve); server.on('exit', code => reject(new Error(`Servidor encerrou com ${code}`))); });
  const base = `http://127.0.0.1:${port}`;
  let cookie = '';
  const request = async (url, options = {}) => {
    const response = await fetch(base + url, { headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...options });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { response, data: await response.json() };
  };
  let health = await request('/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.data.status, 'ok');
  let result = await request('/api/bootstrap');
  assert.equal(result.data.needsSetup, true);
  result = await request('/api/setup', { method: 'POST', body: JSON.stringify({ name: 'Admin', email: 'admin@empresa.com', password: 'senha-segura' }) });
  assert.equal(result.response.status, 201);
  result = await request('/api/users', { method: 'POST', body: JSON.stringify({ name: 'Responsável', email: 'resp@empresa.com', password: 'outra-senha', role: 'member' }) });
  assert.equal(result.response.status, 201);
  const assigneeId = result.data.id;
  result = await request('/api/issues', { method: 'POST', body: JSON.stringify({ client: 'Cliente Exemplo', title: 'Divergência no e-CAC', description: 'Imposto com valor divergente', action: 'Conferir apuração', assigneeId, priority: 'alta' }) });
  assert.equal(result.response.status, 201);
  const issueId = result.data.id;
  result = await request(`/api/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify({ status: 'analise' }) });
  assert.equal(result.data.status, 'analise');
  result = await request(`/api/issues/${issueId}/updates`, { method: 'POST', body: JSON.stringify({ text: 'Apuração conferida e relatório anexado.' }) });
  assert.equal(result.response.status, 201);
  assert.match(result.data.updates.at(-1).text, /Apuração conferida/);
});
