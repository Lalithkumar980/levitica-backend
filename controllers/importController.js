const { Readable } = require('stream');
const csv = require('csv-parser');
const Lead = require('../models/Lead');
const ImportHistory = require('../models/ImportHistory');

const LEAD_SOURCE_ENUM = [
  'Website', 'Referral', 'Cold Call', 'LinkedIn', 'Email Campaign', 'Event/Trade Show',
  'Partner', 'Walk-in', 'Database', 'Social Media', 'Advertisement', 'Other',
];
const LEAD_INDUSTRY_ENUM = [
  'Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing', 'Education',
  'Real Estate', 'Logistics', 'Hospitality', 'Legal', 'Media', 'Other',
];

function normHeader(h) {
  return String(h || '').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

const HEADER_MAP = {
  fname: ['fname', 'first_name', 'firstname', 'first name'],
  lname: ['lname', 'last_name', 'lastname', 'last name'],
  company: ['company', 'organisation', 'organization'],
  phone: ['phone', 'mobile', 'telephone', 'contact'],
  email: ['email', 'email_address'],
  industry: ['industry'],
  city: ['city'],
  country: ['country'],
  source: ['source', 'lead_source', 'source_type'],
  status: ['status'],
  notes: ['notes', 'note', 'remarks'],
};

function getRowValue(rowObj, field) {
  const aliases = HEADER_MAP[field] || [field];
  const normalizedKeys = Object.keys(rowObj || {}).reduce((acc, k) => {
    acc[normHeader(k)] = rowObj[k];
    return acc;
  }, {});
  for (const a of aliases) {
    const val = normalizedKeys[normHeader(a)];
    if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

function rowObjToLead(rowObj, ownerId) {
  const get = (f) => getRowValue(rowObj, f);
  const source = get('source') || 'Other';
  const industry = get('industry');
  return {
    fname: get('fname'),
    lname: get('lname'),
    company: get('company') || undefined,
    phone: get('phone'),
    email: get('email') || undefined,
    industry: LEAD_INDUSTRY_ENUM.includes(industry) ? industry : undefined,
    city: get('city') || undefined,
    country: get('country') || 'India',
    source: LEAD_SOURCE_ENUM.includes(source) ? source : 'Other',
    status: 'New',
    owner: ownerId,
    notes: get('notes') || undefined,
  };
}

function parseCSVLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      out.push(current.trim());
      current = '';
    } else current += c;
  }
  out.push(current.trim());
  return out;
}

function parseCSV(csvStr) {
  const lines = csvStr.split(/\n/).filter((l) => l.length > 0);
  return lines.map((line) => parseCSVLine(line));
}

function findHeaderIndex(headers, field) {
  const normalized = headers.map((h) => normHeader(h));
  const aliases = HEADER_MAP[field] || [field];
  for (const a of aliases) {
    const idx = normalized.indexOf(normHeader(a));
    if (idx !== -1) return idx;
  }
  return -1;
}

function rowToLead(row, indices, ownerId) {
  const get = (field) => {
    const i = indices[field];
    return i !== undefined && i >= 0 && row[i] !== undefined ? String(row[i]).trim() : '';
  };
  const source = get('source') || 'Other';
  const industry = get('industry');
  return {
    fname: get('fname'),
    lname: get('lname'),
    company: get('company') || undefined,
    phone: get('phone'),
    email: get('email') || undefined,
    industry: LEAD_INDUSTRY_ENUM.includes(industry) ? industry : undefined,
    city: get('city') || undefined,
    country: get('country') || 'India',
    source: LEAD_SOURCE_ENUM.includes(source) ? source : 'Other',
    status: 'New',
    owner: ownerId,
    notes: get('notes') || undefined,
  };
}

async function getHistory(req, res) {
  try {
    const list = await ImportHistory.find()
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ history: list });
  } catch (err) {
    console.error('Import history error:', err);
    res.status(500).json({ message: 'Failed to fetch import history' });
  }
}

async function uploadLeadsCsv(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No CSV file uploaded. Use multipart/form-data with field "file".' });
    }
    const rows = await new Promise((resolve, reject) => {
      const results = [];
      Readable.from(req.file.buffer)
        .pipe(csv({ skipLines: 0 }))
        .on('data', (row) => results.push(row))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
    if (rows.length === 0) return res.status(400).json({ message: 'CSV has no data rows' });

    const ownerId = req.user._id;
    const results = [];
    const errors = [];
    let duplicates = 0;
    const existingByPhone = new Set();
    const existingByEmail = new Set();
    const existingLeads = await Lead.find({}, { phone: 1, email: 1 }).lean();
    existingLeads.forEach((l) => {
      if (l.phone) existingByPhone.add(String(l.phone).trim().toLowerCase());
      if (l.email) existingByEmail.add(String(l.email).trim().toLowerCase());
    });

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      try {
        const lead = rowObjToLead(rows[i], ownerId);
        if (!lead.fname || !lead.lname || !lead.phone) {
          errors.push({ row: rowNum, reason: 'Missing required field (fname, lname, or phone)' });
          continue;
        }
        const phoneNorm = lead.phone.trim().toLowerCase();
        const emailNorm = (lead.email || '').trim().toLowerCase();
        const isDup = (emailNorm && existingByEmail.has(emailNorm)) || existingByPhone.has(phoneNorm);
        if (isDup) {
          duplicates++;
          continue;
        }
        results.push(lead);
        if (lead.phone) existingByPhone.add(phoneNorm);
        if (lead.email) existingByEmail.add(emailNorm);
      } catch (err) {
        errors.push({ row: rowNum, reason: err.message || 'Validation failed' });
      }
    }

    if (results.length > 0) await Lead.insertMany(results);
    const totalRows = rows.length;
    await ImportHistory.create({
      filename: req.file.originalname,
      totalRows,
      imported: results.length,
      duplicates,
      failed: errors.length,
      uploadedBy: ownerId,
      status: 'Done',
      errors,
    });
    res.status(201).json({
      message: 'Import completed',
      imported: results.length,
      duplicates,
      errors,
      totalRows,
    });
  } catch (err) {
    console.error('Import leads upload error:', err);
    res.status(500).json({ message: err.message || 'Import failed' });
  }
}

async function importLeadsBody(req, res) {
  try {
    const csvStr = req.body?.csv ?? req.body?.data ?? (typeof req.body === 'string' ? req.body : '');
    const filename = req.body?.filename ?? 'upload.csv';
    if (!csvStr || typeof csvStr !== 'string') {
      return res.status(400).json({
        message: 'CSV content required. Send JSON body: { csv: "<csv string>", filename?: "leads.csv" }',
      });
    }
    const rows = parseCSV(csvStr);
    if (rows.length < 2) return res.status(400).json({ message: 'CSV must have a header row and at least one data row' });

    const headerRow = rows[0];
    const dataRows = rows.slice(1);
    const indices = {
      fname: findHeaderIndex(headerRow, 'fname'),
      lname: findHeaderIndex(headerRow, 'lname'),
      company: findHeaderIndex(headerRow, 'company'),
      phone: findHeaderIndex(headerRow, 'phone'),
      email: findHeaderIndex(headerRow, 'email'),
      industry: findHeaderIndex(headerRow, 'industry'),
      city: findHeaderIndex(headerRow, 'city'),
      country: findHeaderIndex(headerRow, 'country'),
      source: findHeaderIndex(headerRow, 'source'),
      notes: findHeaderIndex(headerRow, 'notes'),
    };
    const ownerId = req.user._id;
    const history = await ImportHistory.create({
      filename,
      totalRows: dataRows.length,
      imported: 0,
      duplicates: 0,
      failed: 0,
      uploadedBy: ownerId,
      status: 'Processing',
      errors: [],
    });
    let imported = 0, duplicates = 0, failed = 0;
    const errors = [];
    const existingByPhone = new Set();
    const existingByEmail = new Set();
    const existingLeads = await Lead.find({}, { phone: 1, email: 1 }).lean();
    existingLeads.forEach((l) => {
      if (l.phone) existingByPhone.add(String(l.phone).trim().toLowerCase());
      if (l.email) existingByEmail.add(String(l.email).trim().toLowerCase());
    });

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;
      try {
        const lead = rowToLead(row, indices, ownerId);
        if (!lead.fname || !lead.lname || !lead.phone) {
          failed++;
          errors.push({ row: rowNum, reason: 'Missing required field (fname, lname, or phone)' });
          continue;
        }
        const phoneNorm = lead.phone.trim().toLowerCase();
        const emailNorm = (lead.email || '').trim().toLowerCase();
        const isDup = (emailNorm && existingByEmail.has(emailNorm)) || existingByPhone.has(phoneNorm);
        if (isDup) {
          duplicates++;
          errors.push({ row: rowNum, reason: 'Duplicate (email or phone already exists)' });
          continue;
        }
        await Lead.create(lead);
        imported++;
        if (lead.phone) existingByPhone.add(phoneNorm);
        if (lead.email) existingByEmail.add(emailNorm);
      } catch (err) {
        failed++;
        errors.push({ row: rowNum, reason: err.message || 'Validation or insert failed' });
      }
    }
    history.imported = imported;
    history.duplicates = duplicates;
    history.failed = failed;
    history.status = failed === dataRows.length ? 'Failed' : 'Done';
    history.errors = errors;
    await history.save();
    res.status(201).json({
      message: 'Import completed',
      importId: history._id,
      totalRows: dataRows.length,
      imported,
      duplicates,
      failed,
      status: history.status,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    console.error('Import leads error:', err);
    res.status(500).json({ message: err.message || 'Import failed' });
  }
}

module.exports = {
  getHistory,
  uploadLeadsCsv,
  importLeadsBody,
};
