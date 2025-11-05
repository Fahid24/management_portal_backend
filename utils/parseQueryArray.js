// utils/parseQueryArray.js
// Helper to parse comma-separated or array query params
function parseQueryArray(param) {
  if (!param) return undefined;
  if (Array.isArray(param)) return param;
  if (typeof param === 'string') return param.split(',').map(x => x.trim());
  return [param];
}

module.exports = parseQueryArray;
