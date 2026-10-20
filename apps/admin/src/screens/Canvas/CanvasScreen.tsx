import { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowDownward, ArrowUpward, AutoFixHigh, Send } from "@mui/icons-material";
import type { StorefrontBlock, StorefrontPage } from "@daedalus/shared";
import { storefrontPageSchema } from "@daedalus/shared";
import { db, fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";
import "./CanvasScreen.scss";

const PAGES = [
  { slug: "home", label: "Home" },
  { slug: "heritage", label: "Heritage" },
] as const;
type PageSlug = (typeof PAGES)[number]["slug"];

const generateStorefront = httpsCallable<{ pageSlug: string }>(fns, "generateStorefront");
const chatEditBlock = httpsCallable<{ pageSlug: string; blockId: string; message: string }>(
  fns,
  "chatEditBlock",
);
const regenerateBlock = httpsCallable<{ pageSlug: string; blockId: string }>(
  fns,
  "regenerateBlock",
);

const BLOCK_LABELS: Record<StorefrontBlock["type"], string> = {
  hook: "Hook",
  reframe: "Commercial Reframe",
  inaction: "Cost of Inaction",
  spotlight: "Spotlight",
  outcomes: "Outcomes",
};

/** Lifecycle: beta — storefront canvas: reorder, chat-edit, regenerate, publish. */
export function CanvasScreen() {
  const [pageSlug, setPageSlug] = useState<PageSlug>("home");
  const [page, setPage] = useState<StorefrontPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [chatBlock, setChatBlock] = useState<StorefrontBlock | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [execute] = useAsyncAction();

  const pageRef = doc(db, "storefrontPages", pageSlug);

  useEffect(() => {
    setLoading(true);
    return onSnapshot(
      doc(db, "storefrontPages", pageSlug),
      (snap) => {
        const parsed = snap.exists() ? storefrontPageSchema.safeParse(snap.data()) : null;
        setPage(parsed?.success ? parsed.data : null);
        setLoading(false);
      },
      (err) => {
        console.error("[Canvas] snapshot error:", err);
        setLoading(false);
      },
    );
  }, [pageSlug]);

  async function moveBlock(idx: number, dir: -1 | 1) {
    if (!page || busy) return;
    const blocks = [...page.blocks];
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    trackEvent("block_reorder", { blockId: blocks[idx].id });
    // Partial update — only touch blocks + updatedAt, not the whole doc.
    await execute(() =>
      updateDoc(pageRef, { blocks, updatedAt: new Date().toISOString() }),
    );
  }

  async function runGenerate() {
    setBusy("generate");
    trackEvent("storefront_generate");
    await execute(async () => {
      await generateStorefront({ pageSlug });
    });
    setBusy(null);
  }

  async function runRegenerate(block: StorefrontBlock) {
    setBusy(block.id);
    trackEvent("block_regenerate", { blockId: block.id });
    await execute(async () => {
      await regenerateBlock({ pageSlug, blockId: block.id });
    });
    setBusy(null);
  }

  async function sendChat() {
    if (!chatBlock || !chatMessage.trim()) return;
    setBusy(chatBlock.id);
    trackEvent("block_chat_edit", { blockId: chatBlock.id });
    await execute(async () => {
      await chatEditBlock({
        pageSlug,
        blockId: chatBlock.id,
        message: chatMessage,
      });
      setChatMessage("");
      setChatBlock(null);
    });
    setBusy(null);
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (!page) {
    return (
      <Box className="canvas-empty" textAlign="center" p={4}>
        <Box display="flex" gap={1} justifyContent="center" mb={3}>
          {PAGES.map((p) => (
            <Chip
              key={p.slug}
              label={p.label}
              color={pageSlug === p.slug ? "primary" : "default"}
              onClick={() => setPageSlug(p.slug)}
            />
          ))}
        </Box>
        <Typography variant="h6" gutterBottom>
          No page yet
        </Typography>
        <Typography color="text.secondary" mb={3}>
          Generate one from your strategy inputs and active products.
        </Typography>
        <Button
          variant="contained"
          disabled={busy === "generate"}
          onClick={runGenerate}
        >
          {busy === "generate" ? "Generating…" : "Generate page"}
        </Button>
      </Box>
    );
  }

  return (
    <Box className="canvas">
      <Box display="flex" gap={1} mb={2}>
        {PAGES.map((p) => (
          <Chip
            key={p.slug}
            label={p.label}
            color={pageSlug === p.slug ? "primary" : "default"}
            onClick={() => setPageSlug(p.slug)}
          />
        ))}
      </Box>
      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <Chip label={page.status} color={page.status === "published" ? "success" : "default"} />
        <Box flex={1} />
        <Typography variant="body2" color="text.secondary">
          Published
        </Typography>
        <Switch
          checked={page.status === "published"}
          disabled={!!busy}
          onChange={(e) =>
            execute(() =>
              updateDoc(pageRef, {
                status: e.target.checked ? "published" : "draft",
                updatedAt: new Date().toISOString(),
              }),
            )
          }
        />
      </Box>

      {page.blocks.map((block, idx) => (
        <Card key={block.id} className="block-card">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Chip size="small" label={BLOCK_LABELS[block.type]} />
              {block.manuallyEdited && <Chip size="small" label="edited" variant="outlined" />}
              <Typography variant="caption" color="text.secondary">
                v{block.version}
              </Typography>
              <Box flex={1} />
              <IconButton
                aria-label="move up"
                disabled={idx === 0}
                onClick={() => moveBlock(idx, -1)}
              >
                <ArrowUpward />
              </IconButton>
              <IconButton
                aria-label="move down"
                disabled={idx === page.blocks.length - 1}
                onClick={() => moveBlock(idx, 1)}
              >
                <ArrowDownward />
              </IconButton>
            </Box>
            <Typography variant="h6" gutterBottom>
              {block.headline}
            </Typography>
            <Typography color="text.secondary" whiteSpace="pre-wrap">
              {block.body}
            </Typography>
            <Box display="flex" gap={1} mt={2}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setChatBlock(block)}
              >
                Chat edit
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoFixHigh />}
                disabled={busy === block.id}
                onClick={() => runRegenerate(block)}
              >
                {busy === block.id ? "Working…" : "Regenerate"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      ))}

      <Button fullWidth variant="outlined" disabled={busy === "generate"} onClick={runGenerate}>
        {busy === "generate" ? "Regenerating all…" : "Regenerate entire page"}
      </Button>

      <Drawer anchor="bottom" open={!!chatBlock} onClose={() => setChatBlock(null)}>
        <Box className="chat-sheet" p={3} pb={4}>
          <Typography variant="h6" gutterBottom>
            Edit “{chatBlock?.headline}”
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Describe the change — e.g. “shorter, more urgent”, “mention free
            returns”.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            placeholder="Your instruction…"
            autoFocus
          />
          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 2 }}
            endIcon={<Send />}
            disabled={!chatMessage.trim() || busy === chatBlock?.id}
            onClick={sendChat}
          >
            {busy === chatBlock?.id ? "Applying…" : "Apply"}
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
