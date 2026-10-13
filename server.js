const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const sessions = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], issues: [] }, null, 2));

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDb = (db) => {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
};
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clean = (value, max = 500) => String(value || '').trim().slice(0, max);
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
const verifyPassword = (password, stored) => {
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
};
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
const body = async (req) => {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Payload muito grande');
  }
  return raw ? JSON.parse(raw) : {};
};
const cookie = (req, name) => {
  const found = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
};
const currentUser = (req, db) => {
  const userId = sessions.get(cookie(req, 'session'));
  return db.users.find(user => user.id === userId) || null;
};
const publicUser = ({ passwordHash, ...user }) => user;
const requireUser = (req, res, db) => {
  const user = currentUser(req, db);
  if (!user) json(res, 401, { error: 'Faça login para continuar.' });
  return user;
};

async function api(req, res, pathname) {
  const db = readDb();
  if (pathname === '/api/bootstrap' && req.method === 'GET') {
    const user = currentUser(req, db);
    return json(res, 200, { needsSetup: db.users.length === 0, user: user && publicUser(user) });
  }
  if (pathname === '/api/setup' && req.method === 'POST') {
    if (db.users.length) return json(res, 409, { error: 'O administrador já foi configurado.' });
    const data = await body(req);
    const name = clean(data.name, 80), email = clean(data.email, 120).toLowerCase();
    if (!name || !email || String(data.password || '').length < 8) return json(res, 400, { error: 'Informe nome, e-mail e uma senha de pelo menos 8 caracteres.' });
    const user = { id: id(), name, email, role: 'admin', passwordHash: hashPassword(data.password), createdAt: now() };
    db.users.push(user); saveDb(db);
    const token = id(); sessions.set(token, user.id);
    return json(res, 201, { user: publicUser(user) }, { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/` });
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    const data = await body(req);
    const user = db.users.find(item => item.email === clean(data.email, 120).toLowerCase());
    if (!user || !verifyPassword(String(data.password || ''), user.passwordHash)) return json(res, 401, { error: 'E-mail ou senha inválidos.' });
    const token = id(); sessions.set(token, user.id);
    return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/` });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    sessions.delete(cookie(req, 'session'));
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/' });
  }
  const user = requireUser(req, res, db); if (!user) return;
  if (pathname === '/api/users' && req.method === 'GET') return json(res, 200, db.users.map(publicUser));
  if (pathname === '/api/users' && req.method === 'POST') {
    if (user.role !== 'admin') return json(res, 403, { error: 'Somente administradores podem cadastrar usuários.' });
    const data = await body(req), email = clean(data.email, 120).toLowerCase(), name = clean(data.name, 80);
    if (!name || !email || String(data.password || '').length < 8) return json(res, 400, { error: 'Preencha os dados e use uma senha de pelo menos 8 caracteres.' });
    if (db.users.some(item => item.email === email)) return json(res, 409, { error: 'Este e-mail já está cadastrado.' });
    const created = { id: id(), name, email, role: data.role === 'admin' ? 'admin' : 'member', passwordHash: hashPassword(data.password), createdAt: now() };
    db.users.push(created); saveDb(db); return json(res, 201, publicUser(created));
  }
  if (pathname === '/api/issues' && req.method === 'GET') return json(res, 200, db.issues);
  if (pathname === '/api/issues' && req.method === 'POST') {
    const data = await body(req);
    const client = clean(data.client, 120), title = clean(data.title, 160), description = clean(data.description, 3000), action = clean(data.action, 2000);
    if (!client || !title || !description || !data.assigneeId) return json(res, 400, { error: 'Cliente, pendência, descrição e responsável são obrigatórios.' });
    if (!db.users.some(item => item.id === data.assigneeId)) return json(res, 400, { error: 'Responsável inválido.' });
    const issue = { id: id(), client, title, description, action, assigneeId: data.assigneeId, priority: ['baixa','media','alta','urgente'].includes(data.priority) ? data.priority : 'media', status: 'nova', dueDate: clean(data.dueDate, 10), createdBy: user.id, createdAt: now(), updatedAt: now(), updates: [{ id: id(), authorId: user.id, text: 'Pendência criada.', createdAt: now() }] };
    db.issues.unshift(issue); saveDb(db); return json(res, 201, issue);
  }
  const issueMatch = pathname.match(/^\/api\/issues\/([^/]+)$/);
  if (issueMatch && req.method === 'PATCH') {
    const issue = db.issues.find(item => item.id === issueMatch[1]);
    if (!issue) return json(res, 404, { error: 'Pendência não encontrada.' });
    const data = await body(req), allowed = ['nova','analise','aguardando','execucao','concluida'];
    if (data.status && allowed.includes(data.status) && data.status !== issue.status) {
      issue.status = data.status;
      issue.updates.push({ id: id(), authorId: user.id, text: `Moveu a pendência para “${data.status}”.`, createdAt: now() });
    }
    issue.updatedAt = now(); saveDb(db); return json(res, 200, issue);
  }
  const updateMatch = pathname.match(/^\/api\/issues\/([^/]+)\/updates$/);
  if (updateMatch && req.method === 'POST') {
    const issue = db.issues.find(item => item.id === updateMatch[1]);
    if (!issue) return json(res, 404, { error: 'Pendência não encontrada.' });
    const data = await body(req), text = clean(data.text, 3000);
    if (!text) return json(res, 400, { error: 'Descreva o que foi feito.' });
    issue.updates.push({ id: id(), authorId: user.id, text, createdAt: now() });
    issue.updatedAt = now(); saveDb(db); return json(res, 201, issue);
  }
  return json(res, 404, { error: 'Rota não encontrada.' });
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (pathname === '/health') return json(res, 200, { status: 'ok' });
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(PUBLIC_DIR, requested);
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: 'Arquivo não encontrado.' });
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Não foi possível concluir a operação.' });
  }
});

server.listen(PORT, HOST, () => console.log(`Painel disponível em http://${HOST}:${PORT}`));
