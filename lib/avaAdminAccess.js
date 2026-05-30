export const AVA_ADMIN_EMAILS = {
  "michaeldavidscales@gmail.com": true,
  "avafitlife@gmail.com": false,
};

export function normalizeAdminEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isApprovedAvaAdminEmail(email) {
  return AVA_ADMIN_EMAILS[normalizeAdminEmail(email)] === true;
}
