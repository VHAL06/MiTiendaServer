const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configurar Cloudinary
cloudinary.config({
  cloud_name: 'h6vw8ezm',
  api_key: '456432475972364',
  api_secret: 'BunEXNLfZgFNarYWhsaSvuP2xco'
});

// Base de datos persistente en disco
const DB_FILE = path.join(__dirname, 'mitienda.db');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS tiendas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY AUTOINCREMENT, tiendaId INTEGER NOT NULL, nombre TEXT NOT NULL, descripcion TEXT DEFAULT '', precio REAL NOT NULL, seccion TEXT DEFAULT '', rutaImagen TEXT);
  CREATE TABLE IF NOT EXISTS registros_dia (id INTEGER PRIMARY KEY AUTOINCREMENT, tiendaId INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, billetes REAL DEFAULT 0, monedas REAL DEFAULT 0, plataforma REAL DEFAULT 0, resta REAL DEFAULT 100, total REAL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS lista_compra (id INTEGER PRIMARY KEY AUTOINCREMENT, tiendaId INTEGER NOT NULL, texto TEXT NOT NULL, fechaCreacion INTEGER NOT NULL, ttlHoras INTEGER DEFAULT 24);
  CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombreUsuario TEXT UNIQUE NOT NULL, contrasena TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'usuario');
`);

// Ping para despertar rápido
app.get('/ping', (req, res) => res.json({ ok: true }));

// Usuarios
app.post('/registro', (req, res) => {
  const { nombreUsuario, contrasena, claveEspecial } = req.body;
  const existe = db.prepare('SELECT id FROM usuarios WHERE nombreUsuario = ?').get(nombreUsuario);
  if (existe) return res.status(400).json({ error: 'El usuario ya existe' });
  const rol = (claveEspecial === 'C137') ? 'admin' : 'usuario';
  db.prepare('INSERT INTO usuarios (nombreUsuario, contrasena, rol) VALUES (?,?,?)').run(nombreUsuario, contrasena, rol);
  const nuevo = db.prepare('SELECT * FROM usuarios WHERE nombreUsuario = ?').get(nombreUsuario);
  res.status(201).json(nuevo);
});

app.post('/login', (req, res) => {
  const { nombreUsuario, contrasena } = req.body;
  const usuario = db.prepare('SELECT * FROM usuarios WHERE nombreUsuario = ? AND contrasena = ?').get(nombreUsuario, contrasena);
  if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });
  res.json(usuario);
});

app.delete('/usuarios/:nombreUsuario', (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE nombreUsuario = ?').run(req.params.nombreUsuario);
  res.json({ ok: true });
});

// Subir imagen a Cloudinary
app.post('/upload', upload.single('imagen'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'productos',
      quality: 'auto',
      fetch_format: 'auto'
    });
    fs.unlinkSync(req.file.path);
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tiendas
app.get('/tiendas', (req, res) => res.json(db.prepare('SELECT * FROM tiendas ORDER BY nombre').all()));
app.post('/tiendas', (req, res) => {
  db.prepare('INSERT INTO tiendas (nombre) VALUES (?)').run(req.body.nombre);
  res.status(201).json({ ok: true });
});
app.delete('/tiendas/:id', (req, res) => {
  db.prepare('DELETE FROM tiendas WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM productos WHERE tiendaId = ?').run(req.params.id);
  res.json({ ok: true });
});

// Productos
app.get('/productos/:tiendaId', (req, res) => {
  res.json(db.prepare('SELECT * FROM productos WHERE tiendaId = ? ORDER BY seccion, nombre').all(req.params.tiendaId));
});
app.post('/productos', (req, res) => {
  const { tiendaId, nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  db.prepare('INSERT INTO productos (tiendaId, nombre, descripcion, precio, seccion, rutaImagen) VALUES (?,?,?,?,?,?)')
    .run(tiendaId, nombre, descripcion||'', precio, seccion||'', rutaImagen||null);
  res.status(201).json({ ok: true });
});
app.put('/productos/:id', (req, res) => {
  const { nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  db.prepare('UPDATE productos SET nombre=?, descripcion=?, precio=?, seccion=?, rutaImagen=? WHERE id=?')
    .run(nombre, descripcion||'', precio, seccion||'', rutaImagen||null, req.params.id);
  res.json({ ok: true });
});
app.delete('/productos/:id', async (req, res) => {
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (producto && producto.rutaImagen && producto.rutaImagen.includes('cloudinary')) {
    try {
      const urlPartes = producto.rutaImagen.split('/');
      const nombreConExtension = urlPartes[urlPartes.length - 1];
      const publicId = 'productos/' + nombreConExtension.split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {}
  }
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Registros del día
app.get('/registros/:tiendaId', (req, res) => {
  res.json(db.prepare('SELECT * FROM registros_dia WHERE tiendaId = ? ORDER BY fecha DESC, hora DESC').all(req.params.tiendaId));
});
app.post('/registros', (req, res) => {
  const { tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total } = req.body;
  db.prepare('INSERT INTO registros_dia (tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total) VALUES (?,?,?,?,?,?,?,?)')
    .run(tiendaId, fecha, hora, billetes||0, monedas||0, plataforma||0, resta||100, total||0);
  res.status(201).json({ ok: true });
});
app.delete('/registros/:id', (req, res) => {
  db.prepare('DELETE FROM registros_dia WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Lista de compras
app.get('/lista_compras/:tiendaId', (req, res) => {
  res.json(db.prepare('SELECT * FROM lista_compra WHERE tiendaId = ? ORDER BY fechaCreacion DESC').all(req.params.tiendaId));
});
app.post('/lista_compras', (req, res) => {
  const { tiendaId, texto, fechaCreacion, ttlHoras } = req.body;
  db.prepare('INSERT INTO lista_compra (tiendaId, texto, fechaCreacion, ttlHoras) VALUES (?,?,?,?)')
    .run(tiendaId, texto, fechaCreacion, ttlHoras||24);
  res.status(201).json({ ok: true });
});
app.delete('/lista_compras/:id', (req, res) => {
  db.prepare('DELETE FROM lista_compra WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
