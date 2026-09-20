#!/usr/bin/env node
// Fase 3, punto 4: copia de seguridad real de la base de datos.
//
// Sustituye al concepto de "backup de la carpeta compartida" del programa
// actual (que a veces se generó con datos incompletos por usar cachés, ver
// FASE_0 punto 6). Un pg_dump siempre lee el estado real y completo de la
// base de datos en el momento de ejecutarse — no hay ninguna caché de por
// medio que pueda quedarse "congelada".
//
// Usa el formato "custom" de pg_dump (-Fc): más pequeño y es el que sabe
// restaurar pg_restore de forma fiable, tabla por tabla si hiciera falta.
//
// Uso:  node scripts/backup.js
// Guarda el archivo en backend/backups/marinafisk_<fecha-hora>.dump
// (esa carpeta está en .gitignore: los backups contienen datos reales de
// clientes y no deben subirse al repositorio de código).
require('dotenv').config();
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const carpetaBackups = path.join(__dirname, '..', 'backups');
fs.mkdirSync(carpetaBackups, { recursive: true });

const marca = new Date().toISOString().replace(/[:.]/g, '-');
const rutaSalida = path.join(carpetaBackups, `marinafisk_${marca}.dump`);

const host = process.env.PGHOST || 'localhost';
const port = process.env.PGPORT || '5432';
const database = process.env.PGDATABASE || 'marinafisk';
const user = process.env.PGUSER || 'marinafisk_app';

console.log(`Generando copia de seguridad de "${database}" en ${host}:${port}...`);
try {
  execFileSync('pg_dump', ['-h', host, '-p', port, '-U', user, '-Fc', '-f', rutaSalida, database], {
    env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'marinafisk_dev' },
    stdio: 'inherit',
  });
} catch (err) {
  console.error('✘ La copia de seguridad ha fallado. No se ha borrado nada de la base de datos, pero revisa el error de arriba.');
  process.exit(1);
}

const tamañoMB = (fs.statSync(rutaSalida).size / (1024 * 1024)).toFixed(2);
console.log(`✔ Copia de seguridad guardada: ${rutaSalida} (${tamañoMB} MB)`);
console.log('');
console.log('Para restaurarla en una base de datos vacía llamada, por ejemplo, "marinafisk_restaurada":');
console.log(`  createdb -h ${host} -p ${port} -U ${user} marinafisk_restaurada`);
console.log(`  pg_restore -h ${host} -p ${port} -U ${user} -d marinafisk_restaurada "${rutaSalida}"`);
