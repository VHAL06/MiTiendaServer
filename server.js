const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

cloudinary.config({
  cloud_name: 'h6vw8ezm',
  api_key: '456432475972364',
  api_secret: 'BunEXNLfZgFNarYWhsaSvuP2xco'
});

const DB_URL = "postgresql://neondb_owner:npg_ewJ89mLRtWIY@ep-empty-bread-af421lyh.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString: DB_URL,
});

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tiendas (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        tiendaId INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL,
        descripcion TEXT DEFAULT '',
        precio REAL NOT NULL,
        seccion TEXT DEFAULT '',
        rutaImagen TEXT
      );
      
      CREATE TABLE IF NOT EXISTS registros_dia (
        id SERIAL PRIMARY KEY,
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
        id SERIAL PRIMARY KEY,
        tiendaId INTEGER NOT NULL,
        texto TEXT NOT NULL,
        fechaCreacion BIGINT NOT NULL,
        ttlHoras INTEGER DEFAULT 24
      );
      
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombreUsuario TEXT UNIQUE NOT NULL,
        contrasena TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'usuario'
      );
    `);

    await pool.query(`
      INSERT INTO usuarios (nombreUsuario, contrasena, rol) 
      VALUES ('Delia', '1982', 'admin'), ('Victor', '2003', 'admin'), ('usuario', '2026', 'usuario') 
      ON CONFLICT (nombreUsuario) DO NOTHING;
    `);
    console.log("Base de datos inicializada correctamente");
  } catch (err) {
    console.error("Error iniciando DB:", err);
  }
};

initDB();

// --- PING ---
app.get('/ping', (req, res) => res.json({ ok: true }));

// --- USUARIOS ---
app.post('/login', async (req, res) => {
  const { nombreUsuario, contrasena } = req.body;
  const result = await pool.query(
    'SELECT * FROM usuarios WHERE nombreUsuario = $1 AND contrasena = $2',
    [nombreUsuario, contrasena]
  );
  if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
  res.json(result.rows[0]);
});

app.post('/registro', async (req, res) => {
  const { nombreUsuario, contrasena, claveEspecial } = req.body;
  const rol = (claveEspecial === 'C137') ? 'admin' : 'usuario';
  try {
    await pool.query(
      'INSERT INTO usuarios (nombreUsuario, contrasena, rol) VALUES ($1, $2, $3)',
      [nombreUsuario, contrasena, rol]
    );
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE nombreUsuario = $1',
      [nombreUsuario]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Usuario ya existe' });
  }
});

app.delete('/usuarios/:nombreUsuario', async (req, res) => {
  await pool.query('DELETE FROM usuarios WHERE nombreUsuario = $1', [req.params.nombreUsuario]);
  res.json({ ok: true });
});

// --- UPLOAD IMAGEN ---
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

// --- TIENDAS ---
app.get('/tiendas', async (req, res) => {
  const result = await pool.query('SELECT * FROM tiendas ORDER BY nombre');
  res.json(result.rows);
});

app.post('/tiendas', async (req, res) => {
  const { nombre } = req.body;
  const result = await pool.query(
    'INSERT INTO tiendas (nombre) VALUES ($1) RETURNING *',
    [nombre]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/tiendas/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  await pool.query('UPDATE tiendas SET nombre = $1 WHERE id = $2', [nombre, id]);
  res.json({ ok: true });
});

app.delete('/tiendas/:id', async (req, res) => {
  await pool.query('DELETE FROM tiendas WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// --- PRODUCTOS ---
app.get('/productos/:tiendaId', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM productos WHERE tiendaId = $1 ORDER BY seccion, nombre',
    [req.params.tiendaId]
  );
  res.json(result.rows);
});

app.post('/productos', async (req, res) => {
  const { tiendaId, nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  const result = await pool.query(
    `INSERT INTO productos (tiendaId, nombre, descripcion, precio, seccion, rutaImagen)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tiendaId, nombre, descripcion || '', precio, seccion || '', rutaImagen || null]
  );
  res.status(201).json(result.rows[0]);
});

app.put('/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { tiendaId, nombre, descripcion, precio, seccion, rutaImagen } = req.body;
  await pool.query(
    `UPDATE productos SET
       tiendaId = $2, nombre = $3, descripcion = $4, precio = $5, seccion = $6, rutaImagen = $7
     WHERE id = $1`,
    [id, tiendaId, nombre, descripcion || '', precio, seccion || '', rutaImagen || null]
  );
  res.json({ ok: true });
});

app.delete('/productos/:id', async (req, res) => {
  const { id } = req.params;
  // Eliminar imagen de Cloudinary si existe
  const result = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);
  const producto = result.rows[0];
  if (producto && producto.rutaimagen && producto.rutaimagen.includes('cloudinary')) {
    try {
      const urlPartes = producto.rutaimagen.split('/');
      const nombreConExtension = urlPartes[urlPartes.length - 1];
      const publicId = 'productos/' + nombreConExtension.split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {}
  }
  await pool.query('DELETE FROM productos WHERE id = $1', [id]);
  res.json({ ok: true });
});

// --- REGISTROS DÍA ---
app.get('/registros/:tiendaId', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM registros_dia WHERE tiendaId = $1 ORDER BY fecha DESC, hora DESC',
    [req.params.tiendaId]
  );
  res.json(result.rows);
});

app.post('/registros', async (req, res) => {
  const { tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total } = req.body;
  const result = await pool.query(
    `INSERT INTO registros_dia (tiendaId, fecha, hora, billetes, monedas, plataforma, resta, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tiendaId, fecha, hora, billetes || 0, monedas || 0, plataforma || 0, resta || 100, total || 0]
  );
  res.status(201).json(result.rows[0]);
});

app.delete('/registros/:id', async (req, res) => {
  await pool.query('DELETE FROM registros_dia WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// --- LISTA DE COMPRAS ---
app.get('/lista_compras/:tiendaId', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM lista_compra WHERE tiendaId = $1 ORDER BY fechaCreacion DESC',
    [req.params.tiendaId]
  );
  res.json(result.rows);
});

app.post('/lista_compras', async (req, res) => {
  const { tiendaId, texto, fechaCreacion, ttlHoras } = req.body;
  const result = await pool.query(
    `INSERT INTO lista_compra (tiendaId, texto, fechaCreacion, ttlHoras)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [tiendaId, texto, fechaCreacion, ttlHoras || 24]
  );
  res.status(201).json(result.rows[0]);
});

app.delete('/lista_compras/:id', async (req, res) => {
  await pool.query('DELETE FROM lista_compra WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
