#!/usr/bin/env node
/*
 * MARINAFISK - Fase 3: crea el primer usuario Administrador.
 *
 * Hace falta un Administrador ya existente para poder dar de alta a los
 * demas usuarios (la API de usuarios es solo para Administrador) - este
 * script rompe ese circulo la primera vez. Se ejecuta una sola vez, a mano,
 * nunca desde la aplicacion web.
 *
 * Uso: node scripts/crear_admin.js <usuario> <nombre> <password>
 * Ejemplo: node scripts/crear_admin.js victor "Víctor" unaContraseñaSegura
 */
require('dotenv').config();
const { pool } = require('../src/db');
const { hashPassword } = require('../src/auth');

const [, , usuario, nombre, password] = process.argv;

if (!usuario || !nombre || !password) {
  console.error('Uso: node scripts/crear_admin.js <usuario> <nombre> <password>');
  process.exit(1);
}

async function main() {
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1,$2,$3,'ADMINISTRADOR')
     ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = 'ADMINISTRADOR', activo = true
     RETURNING id, usuario, nombre, rol`,
    [usuario, nombre, hash]
  );
  console.log('Administrador listo:', rows[0]);
  await pool.end();
}

main();
