// Conexion unica a la base de datos (Prisma Client), compartida por toda la app.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = { prisma };
