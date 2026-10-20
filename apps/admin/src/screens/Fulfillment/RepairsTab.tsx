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
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import type { RepairRecord } from "@daedalus/shared";
import { formatEur } from "@daedalus/shared";
import { fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

type Listed = RepairRecord & { id: string };

const listRepairRecords = httpsCallable<
  { serialNumber?: string; status?: string; limit?: number },
  { records: Listed[] }
>(fns, "listRepairRecords");
const createRepairRecord = httpsCallable<
  { serialNumber: string; warrantyType: string; description: string; technician?: string },
  { repairId: string }
>(fns, "createRepairRecord");
const updateRepairRecord = httpsCallable<
  Record<string, unknown>,
  { ok: boolean }
>(fns, "updateRepairRecord");

const STATUS_COLORS: Record<RepairRecord["status"], "warning" | "info" | "primary" | "success" | "default"> = {
  requested: "warning",
  received: "info",
  in_progress: "primary",
  completed: "success",
  returned: "default",
};

const STATUSES: RepairRecord["status"][] = ["requested", "received", "in_progress", "completed", "returned"];

/** Lifecycle: alpha — repair service tracking. */
export function RepairsTab() {
  const [records, setRecords] = useState<Listed[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Listed | null>(null);
  const [execute, busy] = useAsyncAction();

  // Create form state
  const [serial, setSerial] = useState("");
  const [warrantyType, setWarrantyType] = useState<"lifetime" | "premium">("lifetime");
  const [description, setDescription] = useState("");
  const [technician, setTechnician] = useState("");

  // Edit form state
  const [editStatus, setEditStatus] = useState<RepairRecord["status"]>("requested");
  const [editNotes, setEditNotes] = useState("");
  const [editTech, setEditTech] = useState("");
  const [editParts, setEditParts] = useState("");
  const [editCost, setEditCost] = useState(0);
  const [editInCarrier, setEditInCarrier] = useState("");
  const [editInTracking, setEditInTracking] = useState("");
  const [editOutCarrier, setEditOutCarrier] = useState("");
  const [editOutTracking, setEditOutTracking] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await listRepairRecords({ limit: 50 });
      setRecords(res.data.records);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(r: Listed) {
    setEditing(r);
    setEditStatus(r.status);
    setEditNotes(r.repairNotes);
    setEditTech(r.technician);
    setEditParts(r.partsUsed.join("\n"));
    setEditCost(r.costCents / 100);
    setEditInCarrier(r.inboundCarrier);
    setEditInTracking(r.inboundTracking);
    setEditOutCarrier(r.outboundCarrier);
    setEditOutTracking(r.outboundTracking);
  }

  async function handleCreate() {
    if (!serial.trim() || !description.trim()) return;
    trackEvent("repair_create", { serial });
    await execute(async () => {
      await createRepairRecord({
        serialNumber: serial.trim(),
        warrantyType,
        description: description.trim(),
        technician: technician.trim() || undefined,
      });
      setCreating(false);
      setSerial("");
      setDescription("");
      setTechnician("");
      await load();
    });
  }

  async function handleUpdate() {
    if (!editing) return;
    trackEvent("repair_update", { repairId: editing.id });
    await execute(async () => {
      await updateRepairRecord({
        repairId: editing.id,
        status: editStatus,
        repairNotes: editNotes,
        technician: editTech,
        partsUsed: editParts.split("\n").map((s) => s.trim()).filter(Boolean),
        costCents: Math.round(editCost * 100),
        inboundCarrier: editInCarrier,
        inboundTracking: editInTracking,
        outboundCarrier: editOutCarrier,
        outboundTracking: editOutTracking,
      });
      setEditing(null);
      await load();
    });
  }

  if (!records && !loadError) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;
  }

  if (loadError) {
    return (
      <Box textAlign="center" p={4}>
        <Typography color="error" gutterBottom>Failed to load repairs</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>{loadError}</Typography>
        <Button variant="outlined" onClick={load}>Retry</Button>
      </Box>
    );
  }

  return (
    <Box>
      {records?.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          No repair records yet.
        </Typography>
      )}
      {records?.map((r) => (
        <Card key={r.id} className="order-card" sx={{ cursor: "pointer" }} onClick={() => openEdit(r)}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" flex={1}>{r.serialNumber}</Typography>
              <Chip size="small" label={r.status.replace("_", " ")} color={STATUS_COLORS[r.status]} />
              <Chip size="small" label={r.warrantyType} variant="outlined" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {r.description.slice(0, 100)}{r.description.length > 100 ? "…" : ""}
            </Typography>
            {r.costCents > 0 && (
              <Typography variant="body2" mt={0.5}>Cost: {formatEur(r.costCents)}</Typography>
            )}
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              {new Date(r.createdAt).toLocaleDateString()}
              {r.technician ? ` · ${r.technician}` : ""}
            </Typography>
          </CardContent>
        </Card>
      ))}

      <Button variant="contained" sx={{ mt: 2 }} onClick={() => setCreating(true)}>
        New repair
      </Button>

      {/* Create drawer */}
      <Drawer anchor="bottom" open={creating} onClose={() => setCreating(false)}>
        <Box p={3} pb={4}>
          <Typography variant="h6" mb={2}>New repair record</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField label="Serial number" value={serial} onChange={(e) => setSerial(e.target.value)} />
            <TextField
              select label="Warranty type" value={warrantyType}
              onChange={(e) => setWarrantyType(e.target.value as "lifetime" | "premium")}
            >
              <MenuItem value="lifetime">Lifetime (normal wear)</MenuItem>
              <MenuItem value="premium">Premium</MenuItem>
            </TextField>
            <TextField label="Issue description" multiline minRows={2} value={description}
              onChange={(e) => setDescription(e.target.value)} />
            <TextField label="Technician" value={technician} onChange={(e) => setTechnician(e.target.value)} />
            <Button variant="contained" disabled={busy || !serial.trim() || !description.trim()} onClick={handleCreate}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Edit drawer */}
      <Drawer anchor="bottom" open={!!editing} onClose={() => setEditing(null)}>
        <Box p={3} pb={4} sx={{ maxHeight: "80vh", overflowY: "auto" }}>
          <Typography variant="h6" mb={2}>
            Repair · {editing?.serialNumber}
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField select label="Status" value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as RepairRecord["status"])}>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace("_", " ")}</MenuItem>)}
            </TextField>
            <TextField label="Repair notes" multiline minRows={2} value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)} />
            <TextField label="Parts used (one per line)" multiline minRows={2} value={editParts}
              onChange={(e) => setEditParts(e.target.value)} />
            <TextField label="Technician" value={editTech} onChange={(e) => setEditTech(e.target.value)} />
            {editing?.warrantyType === "premium" && (
              <TextField label="Cost €" type="number" value={editCost}
                onChange={(e) => setEditCost(Number(e.target.value))} />
            )}
            <Typography variant="subtitle2">Inbound shipping</Typography>
            <Box display="flex" gap={1}>
              <TextField size="small" label="Carrier" value={editInCarrier} onChange={(e) => setEditInCarrier(e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Tracking" value={editInTracking} onChange={(e) => setEditInTracking(e.target.value)} sx={{ flex: 1 }} />
            </Box>
            <Typography variant="subtitle2">Outbound shipping</Typography>
            <Box display="flex" gap={1}>
              <TextField size="small" label="Carrier" value={editOutCarrier} onChange={(e) => setEditOutCarrier(e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Tracking" value={editOutTracking} onChange={(e) => setEditOutTracking(e.target.value)} sx={{ flex: 1 }} />
            </Box>
            <Button variant="contained" disabled={busy} onClick={handleUpdate}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
