import { createHash } from "crypto";
import { safeEqual } from "@/lib/security/safe-compare";
import type { PricingTierId } from "./pricing";
import { getPaidTier, pricingIdToTierId } from "./pricing";
import type { SubscriptionTier } from "@prisma/client";

export type MidtransMode = "sandbox" | "production";

const ENDPOINTS = {
  sandbox: {
    snap: "https://app.sandbox.midtrans.com",
    core: "https://api.sandbox.midtrans.com",
  },
  production: {
    snap: "https://app.midtrans.com",
    core: "https://api.midtrans.com",
  },
} as const;

/** Resolve sandbox vs production. Explicit env always wins. */
export function getMidtransMode(): MidtransMode {
  const forced = process.env.MIDTRANS_IS_PRODUCTION;
  if (forced === "true") return "production";
  if (forced === "false") return "sandbox";

  const key = process.env.MIDTRANS_SERVER_KEY ?? "";
  if (key.startsWith("SB-") || key.includes("-SB-")) {
    return "sandbox";
  }
  if (key.startsWith("Mid-server-")) {
    return "production";
  }
  return "sandbox";
}

export function getMidtransClientKey() {
  return process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
}

export function isMidtransConfigured() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  return serverKey.length > 20;
}

export function isClientKeyValid() {
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
  return clientKey.length >= 20;
}

export function getMidtransConfigHint(): string | null {
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";

  if (!serverKey || !clientKey) {
    return "MIDTRANS_SERVER_KEY dan NEXT_PUBLIC_MIDTRANS_CLIENT_KEY wajib diisi.";
  }
  if (serverKey.length < 25 || clientKey.length < 20) {
    return "Key Midtrans terlihat tidak lengkap. Salin ulang dari Midtrans Dashboard.";
  }
  return null;
}

function getServerKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi");
  return key;
}

function getAuthHeader() {
  return `Basic ${Buffer.from(`${getServerKey()}:`).toString("base64")}`;
}

export async function createSnapToken(params: {
  orderId: string;
  amount: number;
  tierId: PricingTierId;
  customer: { email: string; name?: string | null };
  itemName?: string;
}) {
  const hint = getMidtransConfigHint();
  if (hint) throw new Error(hint);

  const tier = getPaidTier(params.tierId);
  if (!tier) throw new Error("Paket tidak valid");

  const mode = getMidtransMode();
  const response = await fetch(
    `${ENDPOINTS[mode].snap}/snap/v1/transactions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: params.orderId,
          gross_amount: params.amount,
        },
        item_details: [
          {
            id: tier.id,
            price: params.amount,
            quantity: 1,
            name: (params.itemName ?? `ArroBuild ${tier.name}`).slice(0, 50),
          },
        ],
        customer_details: {
          email: params.customer.email,
          first_name: (params.customer.name ?? "ArroBuild User").slice(0, 50),
        },
        callbacks: {
          finish: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard?payment=finish`,
        },
      }),
    }
  );

  const data = (await response.json()) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
    status_code?: string;
  };

  if (!response.ok || !data.token) {
    const msg = data.error_messages?.join(", ");
    if (response.status === 401) {
      throw new Error(
        msg ??
          "Key Midtrans ditolak (401). Pastikan Server Key & Client Key cocok (sandbox vs production) dan disalin lengkap."
      );
    }
    throw new Error(msg ?? "Gagal membuat token pembayaran Midtrans");
  }

  return { token: data.token, redirectUrl: data.redirect_url };
}

export async function getTransactionStatus(orderId: string) {
  const mode = getMidtransMode();
  const response = await fetch(
    `${ENDPOINTS[mode].core}/v2/${orderId}/status`,
    {
      headers: { Authorization: getAuthHeader(), Accept: "application/json" },
    }
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as {
    order_id: string;
    transaction_status: string;
    status_code: string;
    gross_amount: string;
    signature_key?: string;
  };
}

export function verifyWebhookSignature(payload: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}): boolean {
  const serverKey = getServerKey();
  const expected = createHash("sha512")
    .update(payload.order_id + payload.status_code + payload.gross_amount + serverKey)
    .digest("hex");
  return safeEqual(expected, payload.signature_key);
}

export function tierIdToSubscriptionTier(tierId: PricingTierId): SubscriptionTier {
  return pricingIdToTierId(tierId);
}

export function isSuccessfulTransactionStatus(status: string) {
  return status === "capture" || status === "settlement";
}
