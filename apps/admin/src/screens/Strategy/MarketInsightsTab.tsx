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
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import type { MarketInsight } from "@daedalus/shared";
import { marketInsightSchema } from "@daedalus/shared";
import { db } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

type InsightDoc = { id: string } & MarketInsight;

/** Lifecycle: beta — market insights feeding generation prompts. */
export function MarketInsightsTab() {
  const [insights, setInsights] = useState<InsightDoc[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ insight: "", source: "" });
  const [execute, busy] = useAsyncAction();

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "strategy"), where("kind", "==", "insight")),
      (snap) => {
        const list: InsightDoc[] = [];
        for (const d of snap.docs) {
          const parsed = marketInsightSchema.safeParse(d.data());
          if (parsed.success) list.push({ id: d.id, ...parsed.data });
        }
        setInsights(list);
      },
      (err) => console.error("[Strategy] insight snapshot error:", err),
    );
  }, []);

  async function save() {
    trackEvent("strategy_save", { kind: "insight" });
    await execute(async () => {
      await addDoc(collection(db, "strategy"), {
        kind: "insight",
        insight: form.insight,
        source: form.source,
        createdAt: new Date().toISOString(),
      });
      setOpen(false);
      setForm({ insight: "", source: "" });
    });
  }

  if (!insights) {
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
          Market signals and trends shaping the copy.
        </Typography>
        <IconButton aria-label="add insight" onClick={() => setOpen(true)}>
          <Add />
        </IconButton>
      </Box>
      {insights.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No insights yet — add market signals to sharpen generation.
        </Typography>
      )}
      {insights.map((i) => (
        <Card key={i.id} className="strategy-card">
          <CardContent>
            <Box display="flex" alignItems="flex-start">
              <Typography variant="body2" flex={1}>
                {i.insight}
              </Typography>
              <IconButton
                aria-label="delete insight"
                onClick={() => deleteDoc(doc(db, "strategy", i.id))}
              >
                <Delete />
              </IconButton>
            </Box>
            {i.source && (
              <Typography variant="caption" color="text.secondary">
                {i.source}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}

      <Drawer anchor="bottom" open={open} onClose={() => setOpen(false)}>
        <Box className="strategy-sheet" p={3} pb={4}>
          <Typography variant="h6" mb={2}>New market insight</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Insight"
              multiline minRows={2}
              value={form.insight}
              onChange={(e) => setForm({ ...form, insight: e.target.value })}
            />
            <TextField
              label="Source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <Button variant="contained" disabled={busy || !form.insight.trim()} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
