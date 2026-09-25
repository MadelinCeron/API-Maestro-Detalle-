import 'dotenv/config';
import express from 'express';
import sql from 'mssql';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

app.get('/', (req, res) => {
  res.json({ mensaje: 'API Maestro-Detalle funcionando' });
});

app.get('/api/misiones', async (req, res) => {
  try {
    const conexion = await sql.connect(dbConfig);
    const resultado = await conexion.request().query(`
      SELECT MisionID, Nombre, Descripcion
      FROM Misiones
      ORDER BY MisionID
    `);

    res.json(resultado.recordset);
  } catch (error) {
    console.error('Error al consultar misiones:', error.message);
    res.status(500).json({ error: 'No se pudieron consultar las misiones' });
  }
});

app.get('/api/estudiantes', async (req, res) => {
  try {
    const conexion = await sql.connect(dbConfig);
    const resultado = await conexion.request().query(`
      SELECT
        e.Carnet,
        e.Nombre,
        e.Correo,
        m.MisionID,
        m.Nombre AS Mision,
        em.Estado
      FROM Estudiantes AS e
      LEFT JOIN EstudianteMisiones AS em
        ON em.Carnet = e.Carnet
      LEFT JOIN Misiones AS m
        ON m.MisionID = em.MisionID
      ORDER BY e.Nombre, m.MisionID
    `);

    const estudiantes = new Map();

    for (const fila of resultado.recordset) {
      if (!estudiantes.has(fila.Carnet)) {
        estudiantes.set(fila.Carnet, {
          carnet: fila.Carnet,
          nombre: fila.Nombre,
          correo: fila.Correo,
          misiones: []
        });
      }

      if (fila.MisionID !== null) {
        estudiantes.get(fila.Carnet).misiones.push({
          misionId: fila.MisionID,
          nombre: fila.Mision,
          estado: Boolean(fila.Estado)
        });
      }
    }

    res.json([...estudiantes.values()]);
  } catch (error) {
    console.error('Error al consultar estudiantes:', error.message);
    res.status(500).json({ error: 'No se pudieron consultar los estudiantes' });
  }
});

app.post('/api/registro', async (req, res) => {
  const { maestro, detalle } = req.body ?? {};

  const carnet = maestro?.carnet?.trim();
  const nombre = maestro?.nombre?.trim();
  const correo = maestro?.correo?.trim();

  if (
    typeof carnet !== 'string' || !carnet || carnet.length > 25 ||
    typeof nombre !== 'string' || !nombre || nombre.length > 150 ||
    typeof correo !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
    correo.length > 150 ||
    !Array.isArray(detalle) || detalle.length === 0 ||
    detalle.some(item =>
      !item ||
      !Number.isSafeInteger(item.misionId) ||
      item.misionId < 1 ||
      typeof item.estado !== 'boolean'
    )
  ) {
    return res.status(400).json({
      error: 'El maestro o el detalle contiene datos inválidos'
    });
  }

  const ids = detalle.map(item => item.misionId);

  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({
      error: 'No repitas un misionId dentro del mismo envío'
    });
  }

  let transaccion;

  try {
    const conexion = await sql.connect(dbConfig);
    transaccion = new sql.Transaction(conexion);
    await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    // Verificar todas las referencias antes de modificar datos.
    const catalogo = await new sql.Request(transaccion).query(`
      SELECT MisionID FROM Misiones
    `);

    const idsValidos = new Set(
      catalogo.recordset.map(mision => mision.MisionID)
    );
    const idsInexistentes = ids.filter(id => !idsValidos.has(id));

    if (idsInexistentes.length > 0) {
      await transaccion.rollback();
      transaccion = null;

      return res.status(422).json({
        error: 'Hay misiones que no existen en el catálogo',
        misionIds: idsInexistentes
      });
    }

    const estudianteExistente = await new sql.Request(transaccion)
      .input('carnet', sql.VarChar(25), carnet)
      .query(`
        SELECT Carnet
        FROM Estudiantes WITH (UPDLOCK, HOLDLOCK)
        WHERE Carnet = @carnet
      `);

    const yaExistia = estudianteExistente.recordset.length > 0;

    if (yaExistia) {
      await new sql.Request(transaccion)
        .input('carnet', sql.VarChar(25), carnet)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('correo', sql.NVarChar(150), correo)
        .query(`
          UPDATE Estudiantes
          SET Nombre = @nombre, Correo = @correo
          WHERE Carnet = @carnet
        `);
    } else {
      await new sql.Request(transaccion)
        .input('carnet', sql.VarChar(25), carnet)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('correo', sql.NVarChar(150), correo)
        .query(`
          INSERT INTO Estudiantes (Carnet, Nombre, Correo)
          VALUES (@carnet, @nombre, @correo)
        `);
    }

    for (const item of detalle) {
      const misionExistente = await new sql.Request(transaccion)
        .input('carnet', sql.VarChar(25), carnet)
        .input('misionId', sql.Int, item.misionId)
        .query(`
          SELECT DetalleID
          FROM EstudianteMisiones WITH (UPDLOCK, HOLDLOCK)
          WHERE Carnet = @carnet AND MisionID = @misionId
        `);

      if (misionExistente.recordset.length > 0) {
        await new sql.Request(transaccion)
          .input('carnet', sql.VarChar(25), carnet)
          .input('misionId', sql.Int, item.misionId)
          .input('estado', sql.Bit, item.estado)
          .query(`
            UPDATE EstudianteMisiones
            SET Estado = @estado
            WHERE Carnet = @carnet AND MisionID = @misionId
          `);
      } else {
        await new sql.Request(transaccion)
          .input('carnet', sql.VarChar(25), carnet)
          .input('misionId', sql.Int, item.misionId)
          .input('estado', sql.Bit, item.estado)
          .query(`
            INSERT INTO EstudianteMisiones (Carnet, MisionID, Estado)
            VALUES (@carnet, @misionId, @estado)
          `);
      }
    }

    await transaccion.commit();
    transaccion = null;

    res.status(yaExistia ? 200 : 201).json({
      mensaje: yaExistia
        ? 'Estudiante y misiones actualizados'
        : 'Estudiante y misiones registrados',
      carnet,
      misionesProcesadas: detalle.length
    });
  } catch (error) {
    if (transaccion) {
      try {
        await transaccion.rollback();
      } catch (errorRollback) {
        console.error('Error al cancelar transacción:', errorRollback.message);
      }
    }

    console.error('Error al registrar:', error.message);

    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({
        error: 'El correo ya está registrado con otro carnet'
      });
    }

    res.status(500).json({ error: 'No se pudo guardar el registro' });
  }
});

const puerto = Number(process.env.PORT || 3000);

app.listen(puerto, '0.0.0.0', () => {
  console.log(`Servidor activo en el puerto ${puerto}`);
});