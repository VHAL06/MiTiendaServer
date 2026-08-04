const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializar base de datos SQLite
const db = new Database('mitienda.db');
db.pragma('journal_mode = WAL');

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS tiendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiendaId INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio REAL NOT NULL,
    seccion TEXT DEFAULT '',
    rutaImagen TEXT,
    FOREIGN KEY (tiendaId) REFERENCES tiendas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS registros_dia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiendaId INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    billetes REAL DEFAULT 0,
    monedas REAL DEFAULT 0,
    plataforma REAL DEFAULT 0,
    resta REAL DEFAULT 100,
    total REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS lista_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiendaId INTEGER NOT NULL,
    texto TEXT NOT NULL,
    fechaCreacion INTEGER NOT NULL,
    ttlHoras INTEGER DEFAULT 24
  );
`);

// ==================== TIENDAS ====================
app.get('/tiendas', (req, res) => {
  const tiendas = db.prepare('SELECT * FROM tiendas ORDER BY nombre').all();
  res.json(tiendas);
});

app.post('/tiendas', (req, res) => {
  const { nombre } = req.body;
  const result = db.prepare('INSERT INTO tiendas (nombre) VALUES (?)').run(nombre);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/tiendas/:id', (req, res) => {
  db.prepare('DELETE FROM tiendas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==================== PRODUCTOS ====================
app.get('/productos/:tiendaId', (req, res) => {
  const productos = db.prepare('SELECT * FROM productos WHERE tiendaId = ? ORDER BY seccion, nombre').all(req.params.tiendaId);
  res.json(productos);
});

app.post('/productos', (req, res) => {
  const { tiendaId, nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  const result = db.prepare(
    'INSERT INTO productos (tiendaId, nombre, descripcion, precio, seccion, rutaImagen) VALUES (?,?,?,?,?,?)'
  ).run(tiendaId, nombre, descripcion, precio, seccion, rutaImagen);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/productos/:id', (req, res) => {
  const { nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  db.prepare(
    'UPDATE productos SET nombre=?, descripcion=?, precio=?, seccion=?, rutaImagen=? WHERE id=?'
  ).run(nombre, descripcion, precio, seccion, rutaImagen, req.params.id);
  res.json({ ok: true });
});

app.delete('/productos/:id', (req, res) => {
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==================== REGISTROS DÍA ====================
app.get('/registros/:tiendaId', (req, res) => {
  const registros = db.prepare('SELECT * FROM registros_dia WHERE tiendaId = ? ORDER BY fecha DESC, hora DESC').all(req.params.tiendaId);
  res.json(registros);
});

app.post('/registros', (req, res) => {
  const { tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total } = req.body;
  db.prepare(
    'INSERT INTO registros_dia (tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total) VALUES (?,?,?,?,?,?,?,?)'
  ).run(tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total);
  res.status(201).json({ ok: true });
});

app.delete('/registros/:id', (req, res) => {
  db.prepare('DELETE FROM registros_dia WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==================== LISTA DE COMPRAS ====================
app.get('/lista_compras/:tiendaId', (req, res) => {
  const items = db.prepare('SELECT * FROM lista_compra WHERE tiendaId = ? ORDER BY fechaCreacion DESC').all(req.params.tiendaId);
  res.json(items);
});

app.post('/lista_compras', (req, res) => {
  const { tiendaId, texto, fechaCreacion, ttlHoras } = req.body;
  db.prepare(
    'INSERT INTO lista_compra (tiendaId, texto, fechaCreacion, ttlHoras) VALUES (?,?,?,?)'
  ).run(tiendaId, texto, fechaCreacion, ttlHoras);
  res.status(201).json({ ok: true });
});

app.delete('/lista_compras/:id', (req, res) => {
  db.prepare('DELETE FROM lista_compra WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Puerto de Render o 3000 local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});