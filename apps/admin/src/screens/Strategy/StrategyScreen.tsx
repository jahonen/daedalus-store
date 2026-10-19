import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
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
import type { Icp, MarketInsight } from "@daedalus/shared";
import { icpSchema, marketInsightSchema } from "@daedalus/shared";
import { db } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";
import "./StrategyScreen.scss";

type IcpDoc = { id: string } & Icp;
type InsightDoc = { id: string } & MarketInsight;

/**
 * Lifecycle: beta — strategy inputs feed every generation prompt
 * (see loadGenerationContext in services/functions).
 */
export function StrategyScreen() {
  const [icps, setIcps] = useState<IcpDoc[] | null>(null);
  const [insights, setInsights] = useState<InsightDoc[] | null>(null);
  const [sheet, setSheet] = useState<"icp" | "insight" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", painPoints: "", statusQuo: "", insight: "", source: "" });
  const [execute, busy] = useAsyncAction();

  useEffect(() => {
    return onSnapshot(
      collection(db, "strategy"),
      (snap) => {
        const icpList: IcpDoc[] = [];
        const insightList: InsightDoc[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.kind === "icp") {
            const parsed = icpSchema.safeParse(data);
            if (parsed.success) icpList.push({ id: d.id, ...parsed.data });
          }
          if (data.kind === "insight") {
            const parsed = marketInsightSchema.safeParse(data);
            if (parsed.success) insightList.push({ id: d.id, ...parsed.data });
          }
        }
        setIcps(icpList);
        setInsights(insightList);
      },
      (err) => console.error("[Strategy] snapshot error:", err),
    );
  }, []);

  async function save() {
    trackEvent("strategy_save", { kind: sheet });
    await execute(async () => {
      if (sheet === "icp") {
        await addDoc(collection(db, "strategy"), {
          kind: "icp",
          name: form.name,
          description: form.description,
          painPoints: form.painPoints.split("\n").filter(Boolean),
          statusQuo: form.statusQuo,
        });
      } else if (sheet === "insight") {
        await addDoc(collection(db, "strategy"), {
          kind: "insight",
          insight: form.insight,
          source: form.source,
          createdAt: new Date().toISOString(),
        });
      }
      setSheet(null);
      setForm({ name: "", description: "", painPoints: "", statusQuo: "", insight: "", source: "" });
    });
  }

  if (!icps || !insights) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box className="strategy">
      <Box display="flex" alignItems="center">
        <Typography variant="h6" flex={1}>
          Ideal Customer Profiles
        </Typography>
        <IconButton aria-label="add ICP" onClick={() => setSheet("icp")}>
          <Add />
        </IconButton>
      </Box>
      {icps.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No ICPs — generation falls back to generic copy.
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
                aria-label="delete ICP"
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

      <Box display="flex" alignItems="center" mt={2}>
        <Typography variant="h6" flex={1}>
          Market Insights
        </Typography>
        <IconButton aria-label="add insight" onClick={() => setSheet("insight")}>
          <Add />
        </IconButton>
      </Box>
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

      <Drawer anchor="bottom" open={!!sheet} onClose={() => setSheet(null)}>
        <Box className="strategy-sheet" p={3} pb={4}>
          <Typography variant="h6" mb={2}>
            {sheet === "icp" ? "New ICP" : "New insight"}
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            {sheet === "icp" ? (
              <>
                <TextField
                  label="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <TextField
                  label="Pain points (one per line)"
                  multiline
                  minRows={2}
                  value={form.painPoints}
                  onChange={(e) => setForm({ ...form, painPoints: e.target.value })}
                />
                <TextField
                  label="Status quo — what they use today"
                  value={form.statusQuo}
                  onChange={(e) => setForm({ ...form, statusQuo: e.target.value })}
                />
              </>
            ) : (
              <>
                <TextField
                  label="Insight"
                  multiline
                  minRows={2}
                  value={form.insight}
                  onChange={(e) => setForm({ ...form, insight: e.target.value })}
                />
                <TextField
                  label="Source"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
              </>
            )}
            <Button variant="contained" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
