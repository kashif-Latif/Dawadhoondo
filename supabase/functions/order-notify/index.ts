// DawaDhoondo — order-notify
// Sends the order confirmation email to the customer and the new-order email
// (with Confirm / Dispatch / Deliver / Cancel buttons) to the pharmacy, via Brevo.
//
// Deploy: supabase functions deploy order-notify --no-verify-jwt
// Secrets: BREVO_API_KEY, MAIL_FROM (verified sender in Brevo), PHARMACY_INBOX, SITE_URL
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO = Deno.env.get("BREVO_API_KEY");
const FROM = Deno.env.get("MAIL_FROM");
const PHARMACY_INBOX = Deno.env.get("PHARMACY_INBOX");
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const rs = (n: unknown) => `Rs ${Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

export async function sendMail(to: string, toName: string, subject: string, html: string) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO!, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "DawaDhoondo", email: FROM }, to: [{ email: to, name: toName }], subject, htmlContent: html }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#eef6f6;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbeafe">
    <div style="background:linear-gradient(135deg,#0d9488,#0ea5e9);padding:22px 26px;color:#fff">
      <div style="font-size:20px;font-weight:800">💊 DawaDhoondo</div>
      <div style="font-size:14px;opacity:.9;margin-top:4px">${esc(title)}</div>
    </div>
    <div style="padding:24px 26px;font-size:14px;line-height:1.6">${body}</div>
    <div style="padding:14px 26px;background:#f8fafc;color:#64748b;font-size:11px">Hackathon demo · pharmacy stock is demo data · no payment taken.</div>
  </div></body></html>`;
}

function summary(o: any) {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#64748b">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse">
    ${row("Order no.", esc(o.order_no))}
    ${row("Medicine", `${esc(o.medicines.product_name)} × ${o.qty}`)}
    ${row("Pharmacy", `${esc(o.pharmacies.name)}, ${esc(o.pharmacies.address)}`)}
    ${row("Delivery", `${esc(o.courier)} · ${esc(o.eta_text)}`)}
    ${row("Subtotal", rs(o.subtotal))}
    ${row("Delivery fee", rs(o.delivery_fee))}
    <tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;font-weight:800">Total (cash on delivery)</td>
        <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:800;color:#0d9488">${rs(o.total)}</td></tr>
  </table>`;
}

const btn = (href: string, label: string, color: string) =>
  `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:12px;background:${color};color:#fff;text-decoration:none;font-weight:700">${label}</a>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BREVO || !FROM) return json({ error: "Email not configured (BREVO_API_KEY, MAIL_FROM)" }, 500);

  try {
    const { order_id } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id))) return json({ error: "Bad order id" }, 400);

    const r = await db(`orders?id=eq.${order_id}&select=*,medicines(product_name,strength),pharmacies(name,address,city,email)`);
    const [o] = await r.json();
    if (!o) return json({ error: "Order not found" }, 404);
    if (o.emailed_at) return json({ ok: true, already: true });
    if (Date.now() - new Date(o.created_at).getTime() > 15 * 60 * 1000) return json({ error: "Order too old" }, 400);

    const sent: string[] = [];
    const errors: string[] = [];
    const track = SITE_URL ? `${SITE_URL}/?track=${o.order_no}` : "";

    if (o.email) {
      try {
        await sendMail(o.email, o.customer_name, `Order ${o.order_no} received — ${o.medicines.product_name}`,
          shell("Your order is placed", `
            <p>Hi ${esc(o.customer_name)},</p>
            <p>Thanks! We've sent your order to <b>${esc(o.pharmacies.name)}</b>. You'll get another email when the pharmacy confirms it.</p>
            ${summary(o)}
            ${track ? `<p style="margin-top:18px">${btn(track, "Track your order", "#0d9488")}</p><p style="color:#64748b;font-size:12px">You'll need the phone number you ordered with.</p>` : ""}`));
        sent.push("customer");
      } catch (e) { errors.push(String(e)); }
    }

    const pharmacyTo = o.pharmacies.email || PHARMACY_INBOX;
    if (pharmacyTo) {
      const act = (a: string) => `${SB_URL}/functions/v1/order-action?id=${o.id}&t=${o.pharmacy_token}&a=${a}`;
      try {
        await sendMail(pharmacyTo, o.pharmacies.name, `New order ${o.order_no} — ${o.medicines.product_name} × ${o.qty}`,
          shell(`New order for ${o.pharmacies.name}`, `
            <p><b>Customer:</b> ${esc(o.customer_name)} · ${esc(o.phone)}${o.email ? ` · ${esc(o.email)}` : ""}<br/>
            <b>${o.mode === "pickup" ? "Pickup" : "Deliver to"}:</b> ${o.mode === "pickup" ? "Customer will collect" : esc(o.address)}</p>
            ${summary(o)}
            <p style="margin-top:18px">
              ${btn(act("confirm"), "✅ Confirm order", "#0d9488")}
              ${btn(act("dispatch"), o.mode === "pickup" ? "📦 Ready for pickup" : "🛵 Out for delivery", "#0ea5e9")}
              ${btn(act("deliver"), o.mode === "pickup" ? "🤝 Collected" : "🏠 Delivered", "#6366f1")}
              ${btn(act("cancel"), "✖ Cancel", "#ef4444")}
            </p>`));
        sent.push("pharmacy");
      } catch (e) { errors.push(String(e)); }
    }

    await db(`orders?id=eq.${o.id}`, { method: "PATCH", body: JSON.stringify({ emailed_at: new Date().toISOString() }) });
    if (errors.length) console.error(errors);
    return json({ ok: errors.length === 0, sent, errors });
  } catch (e) {
    console.error(e);
    return json({ error: "Notify failed" }, 500);
  }
});
