const { Pool } = require('pg');

// Configuración de la base de datos
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ FATAL ERROR: La variable de entorno DATABASE_URL no está definida.');
  process.exit(1); // Detiene la aplicación si la URL no existe
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});
async function initDatabase() {
  try {
    console.log('🔄 Inicializando base de datos...');
    
    // Crear tabla productos
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
    
    console.log('✅ Tabla "productos" creada/verificada exitosamente');
    
    // Crear índices para mejorar rendimiento
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
      CREATE INDEX IF NOT EXISTS idx_productos_estado ON productos(estado);
      CREATE INDEX IF NOT EXISTS idx_productos_created_at ON productos(created_at DESC);
    `);
    
    console.log('✅ Índices creados exitosamente');
    
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
    
    console.log('✅ Trigger de actualización automática creado');
    
    // Verificar conexión y mostrar información de la tabla
    const result = await pool.query('SELECT COUNT(*) FROM productos');
    console.log(`📊 Total de productos en la base de datos: ${result.rows[0].count}`);
    
    console.log('🎉 Base de datos inicializada correctamente');
    
  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔐 Conexión cerrada');
  }
}

initDatabase();
