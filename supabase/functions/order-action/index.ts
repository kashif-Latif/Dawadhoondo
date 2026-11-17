// DawaDhoondo — order-action
// Opened from the buttons in the pharmacy's email. Moves the order through
// placed → confirmed → dispatched → delivered (or cancelled), emails the customer,
// then redirects to the website which shows the result.
//
// Deploy: supabase functions deploy order-action --no-verify-jwt
// Secrets: BREVO_API_KEY, MAIL_FROM, SITE_URL (same as order-notify)

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO = Deno.env.get("BREVO_API_KEY");
const FROM = Deno.env.get("MAIL_FROM");
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// action → [allowed current statuses, new status, timestamp column]
const FLOW: Record<string, [string[], string, string]> = {
  confirm: [["placed"], "confirmed", "confirmed_at"],
  dispatch: [["placed", "confirmed"], "dispatched", "dispatched_at"],
  deliver: [["confirmed", "dispatched"], "delivered", "delivered_at"],
  cancel: [["placed", "confirmed"], "cancelled", "cancelled_at"],
};

function back(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  if (SITE_URL) return Response.redirect(`${SITE_URL}/?${q}`, 302);
  return new Response(`Done: ${q}`, { status: 200, headers: { "Content-Type": "text/plain" } });
}

async function mailCustomer(o: any, status: string) {
  if (!o.email || !BREVO || !FROM) return;
  const pickup = o.mode === "pickup";
  const msg: Record<string, string> = {
    confirmed: `${o.pharmacies.name} has confirmed your order and is preparing it.`,
    dispatched: pickup ? `Your order is ready for pickup at ${o.pharmacies.name}, ${o.pharmacies.address}.` : `Your order is on the way with ${o.courier}. Expected: ${o.eta_text}.`,
    delivered: pickup ? "You've collected your order. Get well soon!" : "Your order has been delivered. Get well soon!",
    cancelled: `${o.pharmacies.name} could not fulfil this order, so it was cancelled. No payment was taken.`,
  };
  const track = SITE_URL ? `<p><a href="${SITE_URL}/?track=${o.order_no}" style="color:#0d9488;font-weight:700">Track order ${esc(o.order_no)}</a></p>` : "";
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "DawaDhoondo", email: FROM },
      to: [{ email: o.email, name: o.customer_name }],
      subject: `Order ${o.order_no}: ${status}`,
      htmlContent: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:20px">
        <h2 style="color:#0d9488;margin:0 0 8px">💊 DawaDhoondo</h2>
        <p>Hi ${esc(o.customer_name)},</p><p>${esc(msg[status])}</p>
        <p style="color:#64748b">${esc(o.medicines.product_name)} × ${o.qty} · Total Rs ${Math.round(o.total)}</p>${track}</div>`,
    }),
  }).catch((e) => console.error("mail", e));
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const token = u.searchParams.get("t") ?? "";
  const action = u.searchParams.get("a") ?? "";
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(id) || !uuid.test(token) || !FLOW[action]) return back({ pa: "error", msg: "Invalid link" });

  try {
    const r = await db(`orders?id=eq.${id}&pharmacy_token=eq.${token}&select=*,medicines(product_name),pharmacies(name,address)`);
    const [o] = await r.json();
    if (!o) return back({ pa: "error", msg: "Order not found" });

    const [allowed, next, col] = FLOW[action];
    if (o.status === next) return back({ pa: next, o: o.order_no });
    if (!allowed.includes(o.status)) return back({ pa: "error", o: o.order_no, msg: `Can't ${action} this order — it is currently ${o.status}` });

    const patch: Record<string, unknown> = { status: next, [col]: new Date().toISOString() };
    if (action === "dispatch" && !o.confirmed_at) patch.confirmed_at = patch[col];
    await db(`orders?id=eq.${id}&status=eq.${o.status}`, { method: "PATCH", body: JSON.stringify(patch) });

    if (action === "cancel") {
      const inv = await (await db(`inventory?pharmacy_id=eq.${o.pharmacy_id}&medicine_id=eq.${o.medicine_id}&select=stock`)).json();
      if (inv[0]) {
        await db(`inventory?pharmacy_id=eq.${o.pharmacy_id}&medicine_id=eq.${o.medicine_id}`,
          { method: "PATCH", body: JSON.stringify({ stock: inv[0].stock + o.qty }) });
      }
    }

    await mailCustomer(o, next);
    return back({ pa: next, o: o.order_no });
  } catch (e) {
    console.error(e);
    return back({ pa: "error", msg: "Something went wrong" });
  }
});
