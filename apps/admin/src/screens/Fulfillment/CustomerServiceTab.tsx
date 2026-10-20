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
import type { HeritageRegistry } from "@daedalus/shared";
import { fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

type Listed = HeritageRegistry & { id: string };

const getHeritageRecord = httpsCallable<
  { serialNumber: string },
  { record: Listed }
>(fns, "getHeritageRecord");
const listHeritageRecords = httpsCallable<
  { productId?: string; classification?: string; limit?: number },
  { records: Listed[] }
>(fns, "listHeritageRecords");
const transferOwnership = httpsCallable<
  { serialNumber: string; newOwnerName: string; newOwnerEmail: string; newOwnerPhone: string; notes: string },
  { ok: boolean }
>(fns, "transferOwnership");

/** Lifecycle: alpha — heritage registry browse, serial lookup, ownership transfer. */
export function CustomerServiceTab() {
  const [records, setRecords] = useState<Listed[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchSerial, setSearchSerial] = useState("");
  const [searchResult, setSearchResult] = useState<Listed | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<Listed | null>(null);
  const [execute, busy] = useAsyncAction();

  // Transfer form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await listHeritageRecords({ limit: 50 });
      setRecords(res.data.records);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSearch() {
    if (!searchSerial.trim()) return;
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await getHeritageRecord({ serialNumber: searchSerial.trim() });
      setSearchResult(res.data.record);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Not found");
    }
  }

  function openTransfer(record: Listed) {
    setTransferring(record);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setTransferNotes("");
  }

  async function handleTransfer() {
    if (!transferring || !newName.trim() || !newEmail.trim()) return;
    trackEvent("heritage_transfer", { serial: transferring.serialNumber });
    await execute(async () => {
      await transferOwnership({
        serialNumber: transferring.serialNumber,
        newOwnerName: newName.trim(),
        newOwnerEmail: newEmail.trim(),
        newOwnerPhone: newPhone.trim(),
        notes: transferNotes.trim(),
      });
      setTransferring(null);
      setSearchResult(null);
      await load();
    });
  }

  function HeritageCard({ r }: { r: Listed }) {
    return (
      <Card className="order-card">
        <CardContent>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h6" flex={1}>{r.serialNumber}</Typography>
            <Chip
              size="small"
              label={r.classification}
              color={r.classification === "heirloom" ? "secondary" : "default"}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Owner: {r.ownerName} · {r.ownerEmail}
            {r.ownerPhone ? ` · ${r.ownerPhone}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Registered: {new Date(r.registeredAt).toLocaleDateString()} ·
            Warranty until: {new Date(r.warrantyExpiresAt).toLocaleDateString()}
          </Typography>
          {r.ownershipHistory.length > 1 && (
            <Box mt={1}>
              <Typography variant="caption" fontWeight={600}>Ownership history</Typography>
              {r.ownershipHistory.map((h, i) => (
                <Typography key={i} variant="caption" display="block" color="text.secondary">
                  {new Date(h.transferredAt).toLocaleDateString()} — {h.ownerName}
                  {h.transferType === "concierge_transfer" ? " (transfer)" : " (purchase)"}
                  {h.notes ? ` — ${h.notes}` : ""}
                </Typography>
              ))}
            </Box>
          )}
          <Button size="small" sx={{ mt: 1 }} onClick={() => openTransfer(r)}>
            Transfer ownership
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!records && !loadError) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {/* Serial lookup */}
      <Box display="flex" gap={1} mb={2}>
        <TextField
          size="small"
          label="Serial number lookup"
          value={searchSerial}
          onChange={(e) => setSearchSerial(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          sx={{ flex: 1 }}
        />
        <Button variant="outlined" onClick={handleSearch} disabled={busy}>
          Search
        </Button>
      </Box>
      {searchError && (
        <Typography variant="body2" color="error" mb={2}>{searchError}</Typography>
      )}
      {searchResult && (
        <Box mb={3}>
          <Typography variant="subtitle2" mb={1}>Search result</Typography>
          <HeritageCard r={searchResult} />
        </Box>
      )}

      {/* Full list */}
      {loadError ? (
        <Box textAlign="center" p={4}>
          <Typography color="error" gutterBottom>Failed to load registry</Typography>
          <Button variant="outlined" onClick={load}>Retry</Button>
        </Box>
      ) : (
        <>
          {records?.length === 0 && (
            <Typography color="text.secondary" textAlign="center" py={4}>
              No heritage records yet. Serial numbers are registered when orders are fulfilled.
            </Typography>
          )}
          {records?.map((r) => <HeritageCard key={r.id} r={r} />)}
        </>
      )}

      {/* Transfer drawer */}
      <Drawer anchor="bottom" open={!!transferring} onClose={() => setTransferring(null)}>
        <Box p={3} pb={4}>
          <Typography variant="h6" mb={1}>
            Transfer ownership
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {transferring?.serialNumber} → promotes to Heirloom
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField label="New owner name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <TextField label="New owner email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <TextField label="New owner phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <TextField label="Transfer notes" multiline minRows={2} value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)} />
            <Button
              variant="contained"
              disabled={busy || !newName.trim() || !newEmail.trim()}
              onClick={handleTransfer}
            >
              {busy ? "Transferring…" : "Confirm transfer"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
