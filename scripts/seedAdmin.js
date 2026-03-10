/**
 * Run once to create an admin user if none exists.
 * Usage: node scripts/seedAdmin.js
 * Requires MONGODB_URI and that backend/config/db and models are loadable from project root.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@levitica.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Arjun Kapoor';

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log('Admin user already exists:', ADMIN_EMAIL);
    process.exit(0);
  }
  await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'Admin',
    department: 'Management',
    viewAll: true,
    delete: true,
    export: true,
    admin: true,
    bulkImport: true,
    viewReports: true,
    modules: ['/dashboard', '/leads', '/contacts', '/companies', '/deals -6'],
  });
  console.log('Admin user created:', ADMIN_EMAIL, '(password:', ADMIN_PASSWORD + ')');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
