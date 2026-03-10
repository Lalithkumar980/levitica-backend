/**
 * CSV generation helper — escape values and build CSV string from documents.
 */

/** Escape a cell value for CSV (quote if contains comma, quote, or newline). */
function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Build CSV string from array of documents and header keys.
 * @param {object[]} docs - Array of plain objects (e.g. .lean() results)
 * @param {string[]} headers - Column keys in order
 * @returns {string} CSV content (header row + data rows)
 */
function toCSV(docs, headers) {
  const rows = [headers.join(',')];
  docs.forEach((doc) => {
    rows.push(headers.map((h) => escapeCell(doc[h])).join(','));
  });
  return rows.join('\n');
}

module.exports = {
  escapeCell,
  toCSV,
};
