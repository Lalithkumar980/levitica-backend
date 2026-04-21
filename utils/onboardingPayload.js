/**
 * Normalizes / whitelists public onboarding JSON (SinglePageApplicationPage).
 * Keeps storage predictable and avoids unexpected keys on formData.
 */

const MAX_TEXT = 2000;

/** BGV field ids — college block + experienced company block (must match frontend). */
const BGV_KEYS = new Set([
  'bCollegeName',
  'bCollegeOff',
  'bHodNum',
  'bCollegeMail',
  'bFriendNum',
  'companyName',
  'companyHrNumber',
  'colleague1Name',
  'colleague1Number',
  'colleague2Name',
  'colleague2Number',
]);

const PERSONAL_KEYS = new Set(['name', 'email', 'phone', 'dob', 'address']);

const EXP_ROW_KEYS = ['id', 'company', 'designation', 'fromDate', 'toDate', 'uan', 'ctc'];

function clipStr(s, max = MAX_TEXT) {
  if (typeof s !== 'string') return '';
  return s.slice(0, max);
}

function sanitizeBgv(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const k of BGV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) {
      out[k] = clipStr(String(raw[k] ?? ''));
    }
  }
  return out;
}

function sanitizePersonal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const k of PERSONAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) {
      out[k] = clipStr(String(raw[k] ?? ''));
    }
  }
  return out;
}

function sanitizeExpCompanies(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const o = {};
      for (const k of EXP_ROW_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        const v = row[k];
        if (k === 'id' && typeof v === 'number' && Number.isFinite(v)) {
          o[k] = v;
        } else {
          o[k] = clipStr(String(v ?? ''));
        }
      }
      return o;
    })
    .filter(Boolean);
}

function sanitizeDocumentSlots(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 80)
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const id = String(s.id ?? '').trim().slice(0, 120);
      const label = typeof s.label === 'string' ? s.label.slice(0, 300) : '';
      if (!id) return null;
      return { id, label, uploaded: Boolean(s.uploaded) };
    })
    .filter(Boolean);
}

/**
 * @param {object} raw - Parsed formData from multipart body
 * @returns {{ mode: 'fresher'|'experienced', personal: object, bgv: object, expCompanies: object[], documentSlots: object[] }}
 */
function sanitizeOnboardingFormData(raw) {
  const modeRaw = typeof raw?.mode === 'string' ? raw.mode.trim().toLowerCase() : '';
  const mode = modeRaw === 'experienced' ? 'experienced' : 'fresher';
  const out = {
    mode,
    personal: sanitizePersonal(raw?.personal),
    bgv: sanitizeBgv(raw?.bgv),
    documentSlots: sanitizeDocumentSlots(raw?.documentSlots),
  };
  if (mode === 'experienced') {
    out.expCompanies = sanitizeExpCompanies(raw?.expCompanies);
  } else {
    out.expCompanies = [];
  }
  return out;
}

module.exports = {
  sanitizeOnboardingFormData,
  BGV_KEYS,
};
