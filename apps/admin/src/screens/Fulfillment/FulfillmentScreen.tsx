import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  TextField,
  Typography,
} from "@mui/material";
import type { Order } from "@daedalus/shared";
import { formatEur } from "@daedalus/shared";
import { fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import "./FulfillmentScreen.scss";

type ListedOrder = Order & { id: string };

const listOrders = httpsCallable<
  { status?: string; limit?: number },
  { orders: ListedOrder[] }
>(fns, "listOrders");
const markOrderFulfilled = httpsCallable<
  { orderId: string; carrier: string; trackingNumber: string },
  { ok: boolean }
>(fns, "markOrderFulfilled");

const STATUS_COLORS: Record<Order["status"], "warning" | "success" | "default" | "info"> = {
  PENDING_FULFILLMENT: "warning",
  FULFILLED: "success",
  CANCELLED: "default",
  REFUNDED: "info",
};

/** Lifecycle: beta — order list + fulfillment (carrier/tracking). */
export function FulfillmentScreen() {
  const [orders, setOrders] = useState<ListedOrder[] | null>(null);
  const [fulfilling, setFulfilling] = useState<ListedOrder | null>(null);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listOrders({ limit: 50 });
    setOrders(res.data.orders);
  }, []);

  useEffect(() => {
    load().catch(() => setOrders([]));
  }, [load]);

  async function fulfill() {
    if (!fulfilling || !carrier.trim() || !tracking.trim()) return;
    setBusy(true);
    trackEvent("order_fulfill", { orderId: fulfilling.id });
    try {
      await markOrderFulfilled({
        orderId: fulfilling.id,
        carrier: carrier.trim(),
        trackingNumber: tracking.trim(),
      });
      setFulfilling(null);
      setCarrier("");
      setTracking("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!orders) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="fulfillment">
      {orders.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          No orders yet.
        </Typography>
      )}
      {orders.map((o) => (
        <Card key={o.id} className="order-card">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" flex={1}>
                {formatEur(o.amounts.totalCents)}
              </Typography>
              <Chip size="small" label={o.status} color={STATUS_COLORS[o.status]} />
            </Box>
            <Typography color="text.secondary" variant="body2">
              {o.customer.email} ·{" "}
              {o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}
            </Typography>
            <Typography variant="body2" mt={1}>
              {o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}
            </Typography>
            {o.status === "PENDING_FULFILLMENT" && (
              <Button size="small" sx={{ mt: 1 }} onClick={() => setFulfilling(o)}>
                Mark fulfilled
              </Button>
            )}
            {o.trackingNumber && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                {o.carrier} · {o.trackingNumber}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}

      <Drawer anchor="bottom" open={!!fulfilling} onClose={() => setFulfilling(null)}>
        <Box className="fulfill-sheet" p={3} pb={4}>
          <Typography variant="h6" mb={2}>
            Fulfill order
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Carrier"
              placeholder="Posti, DHL…"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
            <TextField
              label="Tracking number"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
            <Button
              variant="contained"
              disabled={busy || !carrier.trim() || !tracking.trim()}
              onClick={fulfill}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
