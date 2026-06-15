const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRecipients(value) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .filter(isValidEmail);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Allow": "POST, OPTIONS",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== requestUrl.host) {
        return jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
      }
    } catch {
      return jsonResponse({ ok: false, error: "Invalid origin." }, 403);
    }
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ ok: false, error: "Expected JSON request." }, 415);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 20000) {
    return jsonResponse({ ok: false, error: "Request too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body." }, 400);
  }

  const website = cleanText(body.website, 200);
  if (website) {
    // Honeypot: respond as if successful without sending an email.
    return jsonResponse({ ok: true });
  }

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 180).toLowerCase();
  const institution = cleanText(body.institution, 180);
  const subject = cleanText(body.subject, 180);
  const message = cleanText(body.message, 5000);
  const startedAt = Number(body.startedAt || 0);
  const elapsed = Date.now() - startedAt;

  if (
    !name ||
    !isValidEmail(email) ||
    !subject ||
    message.length < 10 ||
    !Number.isFinite(elapsed) ||
    elapsed < 900
  ) {
    return jsonResponse({
      ok: false,
      error: "Please complete the required fields."
    }, 400);
  }

  const recipients = parseRecipients(env.CONTACT_TO_EMAILS);

  if (
    !env.RESEND_API_KEY ||
    !env.CONTACT_FROM_EMAIL ||
    recipients.length === 0
  ) {
    console.error("RedeC2 contact backend is missing required environment variables.");
    return jsonResponse({
      ok: false,
      error: "Contact service is not configured."
    }, 503);
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeInstitution = escapeHtml(institution || "Not provided");
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  const emailSubject = `[RedeC2 website] ${subject}`.slice(0, 220);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#171717">
      <h1 style="font-size:24px;color:#6E1F1D">New RedeC2 website message</h1>
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
      <p><strong>Institution:</strong> ${safeInstitution}</p>
      <p><strong>Subject:</strong> ${safeSubject}</p>
      <hr style="border:0;border-top:1px solid #d7ddc5;margin:24px 0">
      <p style="line-height:1.6">${safeMessage}</p>
    </div>
  `;

  const text = [
    "New RedeC2 website message",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Institution: ${institution || "Not provided"}`,
    `Subject: ${subject}`,
    "",
    message
  ].join("\n");

  let resendResponse;

  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: recipients,
        reply_to: email,
        subject: emailSubject,
        html,
        text
      })
    });
  } catch (error) {
    console.error("Resend request failed:", error);
    return jsonResponse({
      ok: false,
      error: "Email delivery failed."
    }, 502);
  }

  const resendBody = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    console.error("Resend rejected the message:", resendBody);
    return jsonResponse({
      ok: false,
      error: "Email delivery failed."
    }, 502);
  }

  return jsonResponse({
    ok: true,
    id: resendBody.id || null
  });
}

export async function onRequest() {
  return jsonResponse({
    ok: false,
    error: "Method not allowed."
  }, 405);
}
