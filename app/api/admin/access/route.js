import { isApprovedAvaAdminEmail, normalizeAdminEmail } from "../../../../lib/avaAdminAccess";

export async function POST(request) {
  let email = "";

  try {
    const body = await request.json();
    email = normalizeAdminEmail(body.email);
  } catch (_error) {
    email = "";
  }

  return Response.json({
    allowed: isApprovedAvaAdminEmail(email),
  });
}
