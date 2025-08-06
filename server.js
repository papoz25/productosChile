const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_jyJzR5TC7AEZ@ep-proud-salad-acknzm47-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Crear tabla si no existe
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        estado VARCHAR(50) CHECK (estado IN ('nuevo', 'usado')),
        link TEXT,
        precio_usd DECIMAL(10,2),
        precio_ars DECIMAL(15,2),
        precio_clp DECIMAL(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Crear función para actualizar updated_at automáticamente
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS update_productos_updated_at ON productos;
      CREATE TRIGGER update_productos_updated_at
          BEFORE UPDATE ON productos
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `);
    
    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error al crear tabla:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rutas API

// Obtener todos los productos
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nuevo producto
app.post('/api/productos', async (req, res) => {
  try {
    const { nombre, estado, link, precio_usd, precio_ars, precio_clp } = req.body;
    
    // Validación básica
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO productos (nombre, estado, link, precio_usd, precio_ars, precio_clp) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre.trim(), estado, link, precio_usd, precio_ars, precio_clp]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Actualizar producto
app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, estado, link, precio_usd, precio_ars, precio_clp } = req.body;
    
    // Validación básica
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    
    const result = await pool.query(
      `UPDATE productos 
       SET nombre = $1, estado = $2, link = $3, precio_usd = $4, 
           precio_ars = $5, precio_clp = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [nombre.trim(), estado, link, precio_usd, precio_ars, precio_clp, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// Eliminar producto
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// Servir la aplicación frontend para todas las rutas no API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo salió mal!' });
});

// Inicializar base de datos y servidor
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
});

// Manejo graceful de cierre
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});
