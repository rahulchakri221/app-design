import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!keyId || !keySecret || !supabaseUrl || !serviceKey) return json({ error: "Payment service is not configured" }, 500);

    const body = await req.json();
    const appOrderId = String(body.app_order_id ?? "");
    const paymentOrderId = String(body.razorpay_order_id ?? "");
    const paymentId = String(body.razorpay_payment_id ?? "");
    const signature = String(body.razorpay_signature ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(appOrderId) || !/^order_[A-Za-z0-9]+$/.test(paymentOrderId) ||
        !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^[0-9a-f]{64}$/i.test(signature)) {
      return json({ error: "Invalid payment verification request" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: order, error: orderError } = await supabase.from("orders")
      .select("id,total_amount,razorpay_order_id,payment_status")
      .eq("id", appOrderId).maybeSingle();
    if (orderError || !order || order.razorpay_order_id !== paymentOrderId) return json({ error: "Order not found" }, 404);

    const expected = await hmacHex(keySecret, `${order.razorpay_order_id}|${paymentId}`);
    if (!safeEqual(expected, signature.toLowerCase())) return json({ error: "Payment signature did not match" }, 400);

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}` },
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) return json({ error: "Could not verify payment with Razorpay" }, 502);
    const expectedPaise = Math.round(Number(order.total_amount) * 100);
    if (payment.order_id !== order.razorpay_order_id || payment.amount !== expectedPaise || payment.currency !== "INR") {
      return json({ error: "Payment details do not match this order" }, 400);
    }
    if (payment.status !== "captured") {
      if (payment.status === "failed") {
        await supabase.from("orders").update({ payment_status: "failed" }).eq("id", appOrderId).neq("payment_status", "paid");
      }
      return json({ verified: false, payment_status: payment.status ?? "pending" }, 409);
    }

    const { error: updateError } = await supabase.from("orders").update({
      payment_status: "paid",
      razorpay_payment_id: paymentId,
    }).eq("id", appOrderId).eq("razorpay_order_id", paymentOrderId);
    if (updateError) throw new Error("Could not save verified payment");
    return json({ verified: true, payment_status: "paid", app_order_id: appOrderId });
  } catch (error) {
    console.error("verify-razorpay-payment error", error);
    return json({ error: "Payment verification could not be completed" }, 500);
  }
});
