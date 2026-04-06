const dns = require('dns');
const mongoose = require('mongoose');

// Helps some Windows setups where IPv6 DNS/SRV resolution fails for mongodb+srv://
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

/**
 * Connect to MongoDB (Atlas mongodb+srv:// or local mongodb://).
 * Never exits the process; returns whether the connection succeeded.
 *
 * @returns {Promise<boolean>}
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (uri == null || String(uri).trim() === '') {
    console.warn(
      'Warning: MONGODB_URI is not set. The server will start without a database connection.',
    );
    return false;
  }

  const trimmed = String(uri).trim();

  try {
    await mongoose.connect(trimmed, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('MongoDB connected successfully');
    console.log(`MongoDB database name in use: "${mongoose.connection.name}" (login users must exist in this DB)`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`MongoDB connection error: ${message}`);

    if (message.includes('querySrv')) {
      console.error(
        '→ Atlas uses a DNS (SRV) lookup for mongodb+srv://. This error usually means DNS or the network blocked that lookup, not a wrong password.',
      );
      console.error(
        '  Try: (1) ipconfig /flushdns  (2) Set DNS to 8.8.8.8 or 1.1.1.1  (3) Disable VPN / try another network  (4) Allow Node/your IDE through firewall',
      );
      console.error(
        '  In Atlas → Connect → Drivers: copy the connection string again; if Atlas offers a non-SRV string (mongodb://… with host list), you can use that instead.',
      );
    } else if (message.includes('ECONNREFUSED') && message.includes('127.0.0.1')) {
      console.error(
        '→ Nothing is listening on 127.0.0.1:27017. Start MongoDB locally (mongod) or use an Atlas URI in MONGODB_URI.',
      );
    }

    return false;
  }
}

module.exports = connectDB;
