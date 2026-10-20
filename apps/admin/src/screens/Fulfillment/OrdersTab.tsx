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
import { useAsyncAction } from "../../lib/useAsyncAction";

type ListedOrder = Order & { id: string };

const listOrders = httpsCallable<
  { status?: string; limit?: number },
  { orders: ListedOrder[] }
>(fns, "listOrders");
const markOrderFulfilled = httpsCallable<
  {
    orderId: string;
    carrier: string;
    trackingNumber: string;
    serialAssignments: { orderItemIndex: number; serialNumber: string; ownerPhone: string }[];
  },
  { ok: boolean }
>(fns, "markOrderFulfilled");

const STATUS_COLORS: Record<Order["status"], "warning" | "success" | "default" | "info"> = {
  PENDING_FULFILLMENT: "warning",
  FULFILLED: "success",
  CANCELLED: "default",
  REFUNDED: "info",
};

/** Lifecycle: beta — order list + fulfillment with serial assignment. */
export function OrdersTab() {
  const [orders, setOrders] = useState<ListedOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState<ListedOrder | null>(null);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [serials, setSerials] = useState<Record<number, string>>({});
  const [phones, setPhones] = useState<Record<number, string>>({});
  const [execute, busy] = useAsyncAction();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await listOrders({ limit: 50 });
      setOrders(res.data.orders);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openFulfill(o: ListedOrder) {
    setFulfilling(o);
    setCarrier("");
    setTracking("");
    setSerials({});
    setPhones({});
  }

  async function fulfill() {
    if (!fulfilling || !carrier.trim() || !tracking.trim()) return;
    trackEvent("order_fulfill", { orderId: fulfilling.id });
    const serialAssignments = Object.entries(serials)
      .filter(([, v]) => v.trim())
      .map(([idx, serial]) => ({
        orderItemIndex: Number(idx),
        serialNumber: serial.trim(),
        ownerPhone: phones[Number(idx)]?.trim() ?? "",
      }));
    await execute(async () => {
      await markOrderFulfilled({
        orderId: fulfilling.id,
        carrier: carrier.trim(),
        trackingNumber: tracking.trim(),
        serialAssignments,
      });
      setFulfilling(null);
      await load();
    });
  }

  if (!orders && !loadError) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box textAlign="center" p={4}>
        <Typography color="error" gutterBottom>
          Failed to load orders
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {loadError}
        </Typography>
        <Button variant="outlined" onClick={load}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {orders?.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          No orders yet.
        </Typography>
      )}
      {orders?.map((o) => (
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
              <Button size="small" sx={{ mt: 1 }} onClick={() => openFulfill(o)}>
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
          {fulfilling && (
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

              <Typography variant="subtitle2" mt={1}>
                Heritage serial numbers
              </Typography>
              {fulfilling.items.map((item, idx) => (
                <Box key={idx} display="flex" gap={1} alignItems="center">
                  <Typography variant="body2" sx={{ minWidth: 100, flexShrink: 0 }}>
                    {item.qty} × {item.name}
                  </Typography>
                  <TextField
                    size="small"
                    label="Serial #"
                    placeholder="e.g. AUR-001"
                    value={serials[idx] ?? ""}
                    onChange={(e) => setSerials({ ...serials, [idx]: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Phone"
                    placeholder="+358…"
                    value={phones[idx] ?? ""}
                    onChange={(e) => setPhones({ ...phones, [idx]: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary">
                Serial numbers register each item in the Heritage program.
                Leave blank to skip.
              </Typography>

              <Button
                variant="contained"
                disabled={busy || !carrier.trim() || !tracking.trim()}
                onClick={fulfill}
              >
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
