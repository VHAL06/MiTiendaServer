const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configurar Cloudinary (reemplazá con tus datos)
cloudinary.config({
  cloud_name: 'h6vw8ezm',
  api_key: '456432475972364',
  api_secret: 'BunEXNLfZgFNarYWhsaSvuP2xco'
});

const DB_FILE = 'mitienda.db';
let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const buffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`CREATE TABLE IF NOT EXISTS tiendas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY AUTOINCREMENT, tiendaId INTEGER NOT NULL, nombre TEXT NOT NULL, descripcion TEXT DEFAULT '', precio REAL NOT NULL, seccion TEXT DEFAULT '', rutaImagen TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS registros_dia (id INTEGER PRIMARY KEY AUTOINCREMENT, tiendaId INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, billetes REAL DEFAULT 0, monedas REAL DEFAULT 0, plataforma REAL DEFAULT 0, resta REAL DEFAULT 100, total REAL DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS lista_compra (id INTEGER PRIMARY KEY AUTOINCREMENT, tiendaId INTEGER NOT NULL, texto TEXT NOT NULL, fechaCreacion INTEGER NOT NULL, ttlHoras INTEGER DEFAULT 24)`);
  saveDB();
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryRun(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

// ==================== SUBIR IMAGEN A CLOUDINARY ====================
app.post('/upload', upload.single('imagen'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'productos',
      quality: 'auto',
      fetch_format: 'auto'
    });
    fs.unlinkSync(req.file.path); // borrar archivo temporal
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TIENDAS ====================
app.get('/tiendas', (req, res) => {
  res.json(queryAll('SELECT * FROM tiendas ORDER BY nombre'));
});

app.post('/tiendas', (req, res) => {
  queryRun('INSERT INTO tiendas (nombre) VALUES (?)', [req.body.nombre]);
  res.status(201).json({ ok: true });
});

app.delete('/tiendas/:id', (req, res) => {
  db.run('DELETE FROM tiendas WHERE id = ?', [req.params.id]);
  db.run('DELETE FROM productos WHERE tiendaId = ?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

// ==================== PRODUCTOS ====================
app.get('/productos/:tiendaId', (req, res) => {
  res.json(queryAll('SELECT * FROM productos WHERE tiendaId = ? ORDER BY seccion, nombre', [req.params.tiendaId]));
});

app.post('/productos', (req, res) => {
  const { tiendaId, nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  queryRun('INSERT INTO productos (tiendaId, nombre, descripcion, precio, seccion, rutaImagen) VALUES (?,?,?,?,?,?)',
    [tiendaId, nombre, descripcion||'', precio, seccion||'', rutaImagen||null]);
  res.status(201).json({ ok: true });
});

app.put('/productos/:id', (req, res) => {
  const { nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  db.run('UPDATE productos SET nombre=?, descripcion=?, precio=?, seccion=?, rutaImagen=? WHERE id=?',
    [nombre, descripcion||'', precio, seccion||'', rutaImagen||null, req.params.id]);
  saveDB();
  res.json({ ok: true });
});

app.delete('/productos/:id', (req, res) => {
  db.run('DELETE FROM productos WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

// ==================== REGISTROS DÍA ====================
app.get('/registros/:tiendaId', (req, res) => {
  res.json(queryAll('SELECT * FROM registros_dia WHERE tiendaId = ? ORDER BY fecha DESC, hora DESC', [req.params.tiendaId]));
});

app.post('/registros', (req, res) => {
  const { tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total } = req.body;
  queryRun('INSERT INTO registros_dia (tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total) VALUES (?,?,?,?,?,?,?,?)',
    [tiendaId, fecha, hora, billetes||0, monedas||0, plataforma||0, resta||100, total||0]);
  res.status(201).json({ ok: true });
});

app.delete('/registros/:id', (req, res) => {
  db.run('DELETE FROM registros_dia WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

// ==================== LISTA DE COMPRAS ====================
app.get('/lista_compras/:tiendaId', (req, res) => {
  res.json(queryAll('SELECT * FROM lista_compra WHERE tiendaId = ? ORDER BY fechaCreacion DESC', [req.params.tiendaId]));
});

app.post('/lista_compras', (req, res) => {
  const { tiendaId, texto, fechaCreacion, ttlHoras } = req.body;
  queryRun('INSERT INTO lista_compra (tiendaId, texto, fechaCreacion, ttlHoras) VALUES (?,?,?,?)',
    [tiendaId, texto, fechaCreacion, ttlHoras||24]);
  res.status(201).json({ ok: true });
});

app.delete('/lista_compras/:id', (req, res) => {
  db.run('DELETE FROM lista_compra WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ ok: true });
});

initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
});
