require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

// --- App Setup ---
const app = express();
// app.use(cors());


app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://appointments-management-api.vercel.app'
  ]
}));


app.use(express.json());


const PORT = process.env.PORT || 3000;

// Option 1: Using individual env variables (simpler)
const pool = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: process.env.MYSQL_ADDON_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 5, 
  queueLimit: 0
});



(async () => {
  try {
    const conn = await pool.getConnection();

    // Create tables if not exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact VARCHAR(255)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patient_id INT NOT NULL,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id)
      )
    `);

    // Seed a default patient if table is empty
    const [rows] = await conn.query('SELECT COUNT(*) as count FROM patients');
    if (rows[0].count === 0) {
      await conn.query('INSERT INTO patients (name, contact) VALUES (?, ?)', ['John Doe', '123456789']);
      console.log('Seed patient added');
    }

    conn.release();
    console.log("Tables ready and seed check complete");
  } catch (err) {
    console.error("DB error:", err);
  }
})();


// --- Helpers ---
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isValidTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

async function ensurePatientExists(patientId) {
  const [rows] = await pool.query('SELECT id FROM patients WHERE id = ?', [patientId]);
  return rows.length > 0;
}

async function isSlotTaken(patientId, date, time) {
  const [rows] = await pool.query(
    'SELECT id FROM appointments WHERE patient_id = ? AND appointment_date = ? AND appointment_time = ?',
    [patientId, date, time]
  );
  return rows.length > 0;
}

// const swaggerSpec = swaggerJSDoc({
//   definition: {
//     openapi: '3.0.3',
//     info: {
//       title: 'Appointment Management API',
//       version: '1.0.0',
//       description: 'Simple API to create and manage appointments for patients.'
//     },
//     servers: [
//       { url: process.env.NODE_ENV === 'production'
//           ? 'https://appointments-management-api.vercel.app'
//           : 'http://localhost:' + PORT }
//     ],
//   },
//   apis: ['index.js'],
// });
// app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


const path = require('path');

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Appointment Management API',
      version: '1.0.0',
      description: 'Simple API to create and manage appointments for patients.'
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://appointments-management-api.vercel.app'
          : 'http://localhost:' + PORT
      }
    ],
  },
  apis: [path.join(__dirname, 'index.js')], // ✅ Absolute path
});


/**
 * @swagger
 * tags:
 *   name: Patients
 *   description: API to manage patients
 */

/**
 * @swagger
 * /patients:
 *   get:
 *     summary: Get all patients
 *     tags: [Patients]
 *     responses:
 *       200:
 *         description: List of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   contact:
 *                     type: string
 */


app.get('/patients', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, contact FROM patients ORDER BY id');
    console.log("Patients fetched:", rows); 
    res.json(rows);
  } catch (err) {
    console.error('DB Error:', err); 
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});


/**
 * @swagger
 * /patients:
 *   post:
 *     summary: Create a new patient
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               contact:
 *                 type: string
 *     responses:
 *       201:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 contact:
 *                   type: string
 */

app.post('/patients', async (req, res) => {
  const { name, contact } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid name' });
  }
  const [result] = await pool.query(
    'INSERT INTO patients (name, contact) VALUES (?, ?)',
    [name.trim(), contact || null]
  );
  res.status(201).json({
    id: result.insertId,
    name: name.trim(),
    contact: contact || null,
    message: 'Patient created successfully'
  });
});


/**
 * @swagger
 * /patients/{id}:
 *   get:
 *     summary: Get a patient by ID
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 PatientId:
 *                   type: integer
 *                   example: 1
 *                 name:
 *                   type: string
 *                   example: John Doe
 *                 contact:
 *                   type: string
 *                   example: "+1234567890"
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Database error
 */

// --- Get Patient by ID ---
app.get('/patients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid PatientId' });
    }

    const [rows] = await pool.query(
      'SELECT id AS PatientId, name, contact FROM patients WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});


/**
 * @swagger
 * /patients/{id}:
 *   put:
 *     summary: Update a patient by ID
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Patient ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               contact:
 *                 type: string
 *                 example: "+9876543210"
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Database error
 */

//--- Update Patient ---
app.put('/patients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, contact } = req.body;

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid PatientId' });
    }

    if (!name || !contact) {
      return res.status(400).json({ message: 'Name and contact are required' });
    }

    const [result] = await pool.query(
      'UPDATE patients SET name = ?, contact = ? WHERE id = ?',
      [name, contact, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json({ message: 'Patient updated successfully' });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});


/**
 * @swagger
 * /patients/{id}:
 *   delete:
 *     summary: Delete a patient by ID
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient deleted successfully
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Database error
 */

// --- Delete Patient ---
app.delete('/patients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid PatientId' });
    }

    const [result] = await pool.query(
      'DELETE FROM patients WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});


/**
 * @swagger
 * tags:
 *   name: Appointments
 *   description: API to manage appointments
 */


/**
 * @swagger
 * /appointments:
 *   get:
 *     summary: Get all appointments
 *     tags: [Appointments]
 *     responses:
 *       200:
 *         description: List of all appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   AppointmentId:
 *                     type: integer
 *                     example: 1
 *                   PatientId:
 *                     type: integer
 *                     example: 10
 *                   AppointmentDate:
 *                     type: string
 *                     format: date
 *                     example: "2025-08-19"
 *                   AppointmentTime:
 *                     type: string
 *                     example: "14:30"
 *                   Reason:
 *                     type: string
 *                     example: "Routine checkup"
 *       500:
 *         description: Database error
 */


app.get('/appointments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM appointments ORDER BY patient_id'
    );
    console.log("Appointments fetched:", rows); 
    res.json(rows);
  } catch (err) {
    console.error('DB Error:', err); 
    res.status(500).json({ message: 'Database error', error: err.message });
  }
});



/**
 * @swagger
 * /appointments:
 *   post:
 *     summary: Create a new appointment
 *     tags: [Appointments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - PatientId
 *               - AppointmentDate
 *               - AppointmentTime
 *               - Reason
 *             properties:
 *               PatientId:
 *                 type: integer
 *                 description: ID of the patient
 *                 example: 1
 *               AppointmentDate:
 *                 type: string
 *                 format: date
 *                 description: Date of the appointment (YYYY-MM-DD)
 *                 example: 2025-08-20
 *               AppointmentTime:
 *                 type: string
 *                 description: Time of the appointment (HH:MM 24h format)
 *                 example: "14:30"
 *               Reason:
 *                 type: string
 *                 description: Reason for the appointment
 *                 example: "Routine check-up"
 *     responses:
 *       201:
 *         description: Appointment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 AppointmentId:
 *                   type: integer
 *                   example: 123
 *                 PatientId:
 *                   type: integer
 *                   example: 1
 *                 AppointmentDate:
 *                   type: string
 *                   example: 2025-08-20
 *                 AppointmentTime:
 *                   type: string
 *                   example: "14:30"
 *                 Reason:
 *                   type: string
 *                   example: "Routine check-up"
 *                 Message:
 *                   type: string
 *                   example: "Appointment created successfully"
 *       400:
 *         description: Invalid input data
 *       404:
 *         description: Patient not found
 *       409:
 *         description: Time slot already booked
 */

// --- Create Appointment ---
app.post('/appointments', async (req, res) => {
  const { PatientId, AppointmentDate, AppointmentTime, Reason } = req.body || {};

  if (!Number.isInteger(PatientId) || PatientId <= 0) {
    return res.status(400).json({ message: 'Invalid PatientId' });
  }
  if (!isValidDate(AppointmentDate)) {
    return res.status(400).json({ message: "AppointmentDate must be 'YYYY-MM-DD'" });
  }
  if (!isValidTime(AppointmentTime)) {
    return res.status(400).json({ message: "AppointmentTime must be 'HH:MM' (24h)" });
  }
  if (!Reason || typeof Reason !== 'string' || !Reason.trim()) {
    return res.status(400).json({ message: 'Reason is required' });
  }

  if (!(await ensurePatientExists(PatientId))) {
    return res.status(404).json({ message: 'Patient not found' });
  }
  if (await isSlotTaken(PatientId, AppointmentDate, AppointmentTime)) {
    return res.status(409).json({ message: 'This time slot is already booked for this patient' });
  }

  const [result] = await pool.query(
    'INSERT INTO appointments (patient_id, appointment_date, appointment_time, reason) VALUES (?, ?, ?, ?)',
    [PatientId, AppointmentDate, AppointmentTime, Reason.trim()]
  );

res.status(201).json({
  id: result.insertId,          
  patient_id: PatientId,        
  appointment_date: AppointmentDate,
  appointment_time: AppointmentTime,
  reason: Reason.trim(),
  message: 'Appointment created successfully'
});
});


/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     summary: Get an appointment by ID
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 AppointmentId:
 *                   type: integer
 *                   example: 1
 *                 PatientId:
 *                   type: integer
 *                   example: 10
 *                 AppointmentDate:
 *                   type: string
 *                   format: date
 *                   example: "2025-08-19"
 *                 AppointmentTime:
 *                   type: string
 *                   example: "14:30"
 *                 Reason:
 *                   type: string
 *                   example: "Routine checkup"
 *       404:
 *         description: Appointment not found
 */


// --- Get Appointment ---
app.get('/appointments/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query(
    'SELECT id as AppointmentId, patient_id as PatientId, appointment_date as AppointmentDate, appointment_time as AppointmentTime, reason as Reason FROM appointments WHERE id = ?',
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found' });
  res.json(rows[0]);
});


/**
 * @swagger
 * /appointments/{id}:
 *   put:
 *     summary: Update an appointment by ID
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Appointment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               AppointmentDate:
 *                 type: string
 *                 format: date
 *                 example: 2025-08-20
 *               AppointmentTime:
 *                 type: string
 *                 example: "14:30"
 *               Reason:
 *                 type: string
 *                 example: "Updated reason"
 *     responses:
 *       200:
 *         description: Appointment updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Time slot already booked
 */


//--- Update Appointment ---
app.put('/appointments/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query('SELECT * FROM appointments WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ message: 'Appointment not found' });
  const appt = rows[0];

  const { AppointmentDate, AppointmentTime, Reason } = req.body || {};
  if (AppointmentDate && !isValidDate(AppointmentDate)) {
    return res.status(400).json({ message: "AppointmentDate must be 'YYYY-MM-DD'" });
  }
  if (AppointmentTime && !isValidTime(AppointmentTime)) {
    return res.status(400).json({ message: "AppointmentTime must be 'HH:MM' (24h)" });
  }

  const newDate = AppointmentDate || appt.appointment_date;
  const newTime = AppointmentTime || appt.appointment_time;
  const newReason = (typeof Reason === 'string' && Reason.trim()) || appt.reason;

  if ((await isSlotTaken(appt.patient_id, newDate, newTime)) &&
      !(newDate === appt.appointment_date && newTime === appt.appointment_time)) {
    return res.status(409).json({ message: 'This time slot is already booked for this patient' });
  }

  await pool.query(
    'UPDATE appointments SET appointment_date = ?, appointment_time = ?, reason = ? WHERE id = ?',
    [newDate, newTime, newReason, id]
  );

  res.json({
    AppointmentId: id,
    PatientId: appt.patient_id,
    AppointmentDate: newDate,
    AppointmentTime: newTime,
    Reason: newReason,
    Message: 'Appointment updated successfully'
  });
});


/**
 * @swagger
 * /appointments/{id}:
 *   delete:
 *     summary: Delete an appointment by ID
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment deleted successfully
 *       404:
 *         description: Appointment not found
 */


// --- Delete Appointment ---
app.delete('/appointments/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [result] = await pool.query('DELETE FROM appointments WHERE id = ?', [id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Appointment not found' });
  res.json({ AppointmentId: id, Message: 'Appointment deleted successfully' });
});


app.get('/', (req, res) => {
  res.json({ status: 'ok', docs: '/api-docs' });
});

// app.listen(PORT, () => {
//   console.log(`\n Server running on http://localhost:${PORT}`);
//   console.log('Swagger:       http://localhost:' + PORT + '/api-docs');
// });



app.listen(PORT, () => {
  if (process.env.NODE_ENV === 'production') {
    console.log(`\n Server running on https://appointments-management-api.vercel.app`);
    console.log('Swagger:       https://appointments-management-api.vercel.app/api-docs');
  } else {
    console.log(`\n Server running on http://localhost:${PORT}`);
    console.log('Swagger:       http://localhost:' + PORT + '/api-docs');
  }
});