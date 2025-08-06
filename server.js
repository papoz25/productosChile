
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_jyJzR5TC7AEZ@ep-proud-salad-acknzm47-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

app.post('/api/productos', async (req, res) => {
  const { nombre, estado, link, precio_usd, precio_ars, precio_clp } = req.body;
  try {
    await pool.query(
      'INSERT INTO productos (nombre, estado, link, precio_usd, precio_ars, precio_clp) VALUES ($1, $2, $3, $4, $5, $6)',
      [nombre, estado, link, precio_usd, precio_ars, precio_clp]
    );
    res.status(201).send('Producto guardado en Neon');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al guardar producto');
  }
});

app.listen(10000, () => console.log('API corriendo en puerto 10000'));
