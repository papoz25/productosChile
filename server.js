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
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ FATAL ERROR: La variable de entorno DATABASE_URL no está definida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
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

// Crear tabla si no existe con las nuevas columnas
async function initDB() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      estado VARCHAR(50) CHECK (estado IN ('nuevo', 'usado')),
      precio_usd DECIMAL(10,2),
      precio_ars DECIMAL(15,2),
      precio_clp DECIMAL(15,2),
      precio_mayorista DECIMAL(15,2),
      precio_minorista DECIMAL(15,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  // Agregar las nuevas columnas si no existen
  const addColumnsQuery = `
    DO $$ 
    BEGIN
      BEGIN
        ALTER TABLE productos ADD COLUMN precio_mayorista DECIMAL(15,2);
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END;
      
      BEGIN
        ALTER TABLE productos ADD COLUMN precio_minorista DECIMAL(15,2);
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END;
    END $$;
  `;
  
  try {
    console.log('🔄 Inicializando base de datos...');
    await pool.query(createTableQuery);
    console.log('✅ Tabla "productos" creada o ya existente.');
    
    // Agregar nuevas columnas si no existen
    await pool.query(addColumnsQuery);
    console.log('✅ Columnas actualizadas.');
    
    const result = await pool.query("SELECT COUNT(*) FROM productos");
    console.log(`📊 Productos existentes: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
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

// --- Rutas API ---

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
    const { nombre, estado, precio_usd, precio_ars, precio_clp, precio_mayorista, precio_minorista } = req.body;
    
    console.log('📝 Creando producto:', { nombre, estado });
    
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    
    const result = await pool.query(
      `INSERT INTO productos (nombre, estado, precio_usd, precio_ars, precio_clp, precio_mayorista, precio_minorista) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nombre.trim(), estado, precio_usd, precio_ars, precio_clp, precio_mayorista, precio_minorista]
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
    const { nombre, estado, precio_usd, precio_ars, precio_clp, precio_mayorista, precio_minorista } = req.body;
    
    console.log('✏️ Actualizando producto ID:', id);
    
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre del producto es requerido' });
    }
    
    const result = await pool.query(
      `UPDATE productos 
       SET nombre = $1, estado = $2, precio_usd = $3, 
           precio_ars = $4, precio_clp = $5, precio_mayorista = $6, 
           precio_minorista = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [nombre.trim(), estado, precio_usd, precio_ars, precio_clp, precio_mayorista, precio_minorista, id]
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
    });
  } catch (error) {
    console.error('❌ Error fatal al iniciar servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre
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

// Iniciar el servidor
startServer();
