const adminEmails = {
  "michaeldavidscales@gmail.com": true,
  "avafitlife@gmail.com": false,
};

export async function POST(request) {
  let email = "";

  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch (_error) {
    email = "";
  }

  return Response.json({
    allowed: adminEmails[email] === true,
  });
}
