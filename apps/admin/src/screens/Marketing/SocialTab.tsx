import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Send, ContentCopy } from "@mui/icons-material";
import { BLUESKY_MAX_GRAPHEMES, integrationsSettingsSchema } from "@daedalus/shared";
import { db, fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

const chatDraftPost = httpsCallable<
  { message: string; history: { role: "user" | "assistant"; text: string }[] },
  { reply: string; draft: { text: string; graphemes: number } | null }
>(fns, "chatDraftPost");
const publishSocialPost = httpsCallable<{ text: string }, { postUrl: string }>(
  fns,
  "publishSocialPost",
);
const listSocialPosts = httpsCallable<
  Record<string, never>,
  { posts: { id: string; text: string; postUrl?: string; postedAt?: string }[] }
>(fns, "listSocialPosts");

interface Msg {
  role: "user" | "assistant";
  text: string;
}

function graphemes(text: string): number {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)]
    .length;
}

function firstLink(text: string): string | null {
  const m = /https?:\/\/[^\s<>"'()[\]]+/.exec(text);
  return m ? m[0] : null;
}

/**
 * Lifecycle: alpha — AI-assisted Bluesky drafting. Chat with the copy engine
 * (strategy + products injected server-side); the draft it returns is editable
 * and publishes via publishSocialPost with clickable-link facets + an OG card.
 */
export function SocialTab() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Tell me what to post — a product push, a Heritage story, an insight angle. I know the catalogue and the strategy docs; I'll keep it under 300 characters and link products properly.",
    },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [bskyReady, setBskyReady] = useState(false);
  const [posts, setPosts] = useState<
    { id: string; text: string; postUrl?: string; postedAt?: string }[]
  >([]);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendExecute, sendBusy] = useAsyncAction();
  const [postExecute, postBusy] = useAsyncAction();
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "integrations"), (snap) => {
      const parsed = snap.exists()
        ? integrationsSettingsSchema.safeParse(snap.data())
        : null;
      const b = parsed?.success ? parsed.data.bluesky : undefined;
      setBskyReady(!!b?.handle && !!b.appPassword);
    });
  }, []);

  useEffect(() => {
    void listSocialPosts({})
      .then((r) => setPosts(r.data.posts))
      .catch(() => {});
  }, [postResult]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, sendBusy]);

  const count = graphemes(draft);
  const overLimit = count > BLUESKY_MAX_GRAPHEMES;
  const link = firstLink(draft);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    trackEvent("social_chat_send");
    await sendExecute(async () => {
      const res = await chatDraftPost({
        message: text,
        history: messages.slice(-20),
      });
      setMessages((m) => [...m, { role: "assistant", text: res.data.reply }]);
      if (res.data.draft) {
        setDraft(res.data.draft.text);
        setHasDraft(true);
      }
    }).catch((e) => setError(e instanceof Error ? e.message : "Draft failed"));
  }

  async function post() {
    setError(null);
    setPostResult(null);
    trackEvent("social_post_publish");
    await postExecute(async () => {
      const res = await publishSocialPost({ text: draft });
      setPostResult(res.data.postUrl);
      setDraft("");
      setHasDraft(false);
    }).catch((e) => setError(e instanceof Error ? e.message : "Publish failed"));
  }

  return (
    <Box className="social-compose" display="flex" flexDirection="column" gap={2}>
      <Card className="chat-card">
        <CardContent>
          <div className="chat-thread" ref={threadRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.text}
              </div>
            ))}
            {sendBusy && (
              <div className="chat-msg assistant pending">
                <CircularProgress size={14} /> Thinking…
              </div>
            )}
          </div>
          <Box display="flex" gap={1} mt={1}>
            <TextField
              size="small"
              fullWidth
              placeholder="e.g. Draft a post about the Aurora lamp for craft-minded buyers"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <IconButton
              color="primary"
              disabled={!input.trim() || sendBusy}
              onClick={() => void send()}
            >
              <Send />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {hasDraft && (
        <Card className="draft-card">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Typography variant="subtitle2">Draft</Typography>
              <Chip
                size="small"
                label={`${count}/${BLUESKY_MAX_GRAPHEMES}`}
                color={overLimit ? "error" : count > 260 ? "warning" : "default"}
                variant="outlined"
              />
            </Box>
            <TextField
              multiline
              minRows={3}
              fullWidth
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {link && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Link card: {link} — title, description and image are pulled from
                its OG tags at publish time.
              </Typography>
            )}
            <Box display="flex" gap={1} mt={2} alignItems="center">
              <Button
                variant="contained"
                disabled={!draft.trim() || overLimit || postBusy || !bskyReady}
                onClick={() => void post()}
              >
                {postBusy ? "Posting…" : "Post to Bluesky"}
              </Button>
              <Button
                variant="outlined"
                startIcon={<ContentCopy />}
                onClick={() => void navigator.clipboard.writeText(draft)}
              >
                Copy
              </Button>
              {!bskyReady && (
                <Typography variant="caption" color="error">
                  Set Bluesky credentials in Settings → Integrations to post.
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {postResult && (
        <Typography variant="body2" color="success.main">
          Posted —{" "}
          <a href={postResult} target="_blank" rel="noreferrer">
            {postResult}
          </a>
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      {posts.length > 0 && (
        <Card className="history-card">
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Recent posts
            </Typography>
            {posts.map((p) => (
              <Box key={p.id} className="history-item">
                <Typography variant="body2" className="history-text">
                  {p.text}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {p.postedAt ? new Date(p.postedAt).toLocaleString() : ""}
                  {p.postUrl && (
                    <>
                      {" · "}
                      <a href={p.postUrl} target="_blank" rel="noreferrer">
                        View
                      </a>
                    </>
                  )}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
