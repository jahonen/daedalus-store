import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import type { Icp } from "@daedalus/shared";
import { icpSchema } from "@daedalus/shared";
import { db } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

type IcpDoc = { id: string } & Icp;

/** Lifecycle: beta — customer profiles (ICPs) feeding generation prompts. */
export function CustomerProfilesTab() {
  const [icps, setIcps] = useState<IcpDoc[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", painPoints: "", statusQuo: "" });
  const [execute, busy] = useAsyncAction();

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "strategy"), where("kind", "==", "icp")),
      (snap) => {
        const list: IcpDoc[] = [];
        for (const d of snap.docs) {
          const parsed = icpSchema.safeParse(d.data());
          if (parsed.success) list.push({ id: d.id, ...parsed.data });
        }
        setIcps(list);
      },
      (err) => console.error("[Strategy] icp snapshot error:", err),
    );
  }, []);

  async function save() {
    trackEvent("strategy_save", { kind: "icp" });
    await execute(async () => {
      await addDoc(collection(db, "strategy"), {
        kind: "icp",
        name: form.name,
        description: form.description,
        painPoints: form.painPoints.split("\n").filter(Boolean),
        statusQuo: form.statusQuo,
      });
      setOpen(false);
      setForm({ name: "", description: "", painPoints: "", statusQuo: "" });
    });
  }

  if (!icps) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={1}>
        <Typography variant="body2" color="text.secondary" flex={1}>
          Ideal customer profiles — who the copy is written for.
        </Typography>
        <IconButton aria-label="add profile" onClick={() => setOpen(true)}>
          <Add />
        </IconButton>
      </Box>
      {icps.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No profiles — generation falls back to generic copy.
        </Typography>
      )}
      {icps.map((i) => (
        <Card key={i.id} className="strategy-card">
          <CardContent>
            <Box display="flex" alignItems="center">
              <Typography variant="subtitle1" fontWeight={700} flex={1}>
                {i.name}
              </Typography>
              <IconButton
                aria-label="delete profile"
                onClick={() => deleteDoc(doc(db, "strategy", i.id))}
              >
                <Delete />
              </IconButton>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {i.description}
            </Typography>
            {i.painPoints.length > 0 && (
              <Box display="flex" gap={0.5} flexWrap="wrap" mt={1}>
                {i.painPoints.map((p) => (
                  <Chip key={p} size="small" label={p} variant="outlined" />
                ))}
              </Box>
            )}
            {i.statusQuo && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Status quo: {i.statusQuo}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}

      <Drawer anchor="bottom" open={open} onClose={() => setOpen(false)}>
        <Box className="strategy-sheet" p={3} pb={4}>
          <Typography variant="h6" mb={2}>New customer profile</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="Description"
              multiline minRows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <TextField
              label="Pain points (one per line)"
              multiline minRows={2}
              value={form.painPoints}
              onChange={(e) => setForm({ ...form, painPoints: e.target.value })}
            />
            <TextField
              label="Status quo — what they use today"
              value={form.statusQuo}
              onChange={(e) => setForm({ ...form, statusQuo: e.target.value })}
            />
            <Button variant="contained" disabled={busy || !form.name.trim()} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
