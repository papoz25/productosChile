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

// Test de conexión
pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en PostgreSQL:', err);
});

// Crear tabla si no existe
async function initDB() {
  try {
    console.log('🔄 Inicializando base de datos...');
    
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
    
    // Verificar que la tabla existe
    const result = await pool.query("SELECT COUNT(*) FROM productos");
    console.log(`✅ Base de datos inicializada. Productos existentes: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error al inicializar base de datos:', error);
    throw error; // Re-lanzar el error para detener el servidor si falla
  }
}

// Health check endpoint mejorado
app.get('/health', async (req, res) => {
  try {
    // Test de conexión a la base de datos
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'Error', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// Rutas API con mejor manejo de errores

// Obtener todos los productos
app.get('/api/productos', async (req, res) => {
  try {
    console.log('📥 Solicitando productos...');
    const result = await pool.query('SELECT * FROM productos ORDER BY created_at DESC');
    console.log(`📊 Enviando ${result.rows.length} productos`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error al obtener productos:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// Crear nuevo producto
app.post('/api/productos', async (req, res) => {
  try {
    const { nombre, estado, link, precio_usd, precio_ars, precio_clp } = req.body;
    
    console.log('📝 Creando producto:', { nombre, estado });
    
    // Validación básica
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO productos (nombre, estado, link, precio_usd, precio_ars, precio_clp) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre.trim(), estado, link, precio_usd, precio_ars, precio_clp]
    );
    
    console.log('✅ Producto creado con ID:', result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error al crear producto:', error);
    res.status(500).json({ 
      error: 'Error al crear producto',
      details: error.message 
    });
  }
});

// Actualizar producto
app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, estado, link, precio_usd, precio_ars, precio_clp } = req.body;
    
    console.log('✏️ Actualizando producto ID:', id);
    
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
    
    console.log('✅ Producto actualizado:', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error al actualizar producto:', error);
    res.status(500).json({ 
      error: 'Error al actualizar producto',
      details: error.message 
    });
  }
});

// Eliminar producto
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Eliminando producto ID:', id);
    
    const result = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    console.log('✅ Producto eliminado:', id);
    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error('❌ Error al eliminar producto:', error);
    res.status(500).json({ 
      error: 'Error al eliminar producto',
      details: error.message 
    });
  }
});

// Servir la aplicación frontend para todas las rutas no API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err.stack);
  res.status(500).json({ 
    error: 'Algo salió mal!',
    details: err.message 
  });
});

// Inicializar base de datos y servidor
async function startServer() {
  try {
    await initDB();
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
      console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: https://productoschile.onrender.com`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

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

startServer();
