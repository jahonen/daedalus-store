import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref as storageRef, uploadBytes } from "firebase/storage";
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
import { Send, ContentCopy, AddPhotoAlternate, AutoFixHigh, Close } from "@mui/icons-material";
import { BLUESKY_MAX_GRAPHEMES, integrationsSettingsSchema } from "@daedalus/shared";
import { db, fns, storage, storageBucket } from "../../lib/firebase";
import { autocropTo } from "../../lib/autocrop";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

const chatDraftPost = httpsCallable<
  { message: string; history: { role: "user" | "assistant"; text: string }[] },
  { reply: string; draft: { text: string; graphemes: number } | null }
>(fns, "chatDraftPost");
const publishSocialPost = httpsCallable<
  {
    text: string;
    images: { storagePath: string; alt: string; width: number; height: number }[];
  },
  { postUrl: string }
>(fns, "publishSocialPost");
const listSocialPosts = httpsCallable<
  Record<string, never>,
  { posts: { id: string; text: string; postUrl?: string; postedAt?: string }[] }
>(fns, "listSocialPosts");
const generateSocialImage = httpsCallable<
  { prompt: string; altText: string },
  { mediaId: string; storagePath: string; url: string }
>(fns, "generateSocialImage");

interface Msg {
  role: "user" | "assistant";
  text: string;
}

interface Attachment {
  storagePath: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  file?: File; // kept for aspect re-crop; absent for generated images
}

type Aspect = "4:3" | "1:1" | "original";

function graphemes(text: string): number {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)]
    .length;
}

function firstLink(text: string): string | null {
  const m = /https?:\/\/[^\s<>"'()[\]]+/.exec(text);
  return m ? m[0] : null;
}

function publicUrl(path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Lifecycle: alpha — AI-assisted Bluesky drafting. Chat with the copy engine
 * (strategy + products injected server-side); the draft it returns is editable,
 * supports up to 4 cropped/generated images, and publishes via
 * publishSocialPost with clickable-link facets + image/OG embeds.
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [genPrompt, setGenPrompt] = useState("");
  const [bskyReady, setBskyReady] = useState(false);
  const [posts, setPosts] = useState<
    { id: string; text: string; postUrl?: string; postedAt?: string }[]
  >([]);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendExecute, sendBusy] = useAsyncAction();
  const [postExecute, postBusy] = useAsyncAction();
  const [genExecute, genBusy] = useAsyncAction();
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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

  async function attachFile(file: File) {
    setAttachBusy(true);
    setError(null);
    try {
      const { blob, width, height } = await autocropTo(file, "4:3", 1600, "image/jpeg");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.\w+$/, ".jpg");
      const path = `public/social/${Date.now()}-${safe}`;
      await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
      setAttachments((a) => [
        ...a,
        { storagePath: path, url: publicUrl(path), alt: "", width, height, file },
      ]);
      trackEvent("social_image_attach");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAttachBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function setAspect(att: Attachment, aspect: Aspect) {
    if (!att.file) return;
    setAttachBusy(true);
    try {
      const { blob, width, height } = await autocropTo(att.file, aspect, 1600, "image/jpeg");
      await uploadBytes(storageRef(storage, att.storagePath), blob, {
        contentType: "image/jpeg",
      });
      const url = `${att.url}&v=${Date.now()}`;
      setAttachments((a) =>
        a.map((x) => (x.storagePath === att.storagePath ? { ...x, url, width, height } : x)),
      );
    } finally {
      setAttachBusy(false);
    }
  }

  async function generate() {
    const prompt = genPrompt.trim();
    if (!prompt) return;
    setError(null);
    trackEvent("social_image_generate");
    await genExecute(async () => {
      const res = await generateSocialImage({ prompt, altText: prompt.slice(0, 200) });
      const dims = await measureImage(res.data.url);
      setAttachments((a) => [
        ...a,
        {
          storagePath: res.data.storagePath,
          url: res.data.url,
          alt: prompt.slice(0, 200),
          width: dims.width,
          height: dims.height,
        },
      ]);
      setGenPrompt("");
    }).catch((e) => setError(e instanceof Error ? e.message : "Generation failed"));
  }

  async function post() {
    setError(null);
    setPostResult(null);
    trackEvent("social_post_publish");
    await postExecute(async () => {
      const res = await publishSocialPost({
        text: draft,
        images: attachments.map((a) => ({
          storagePath: a.storagePath,
          alt: a.alt,
          width: a.width,
          height: a.height,
        })),
      });
      setPostResult(res.data.postUrl);
      setDraft("");
      setHasDraft(false);
      setAttachments([]);
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
            {link && attachments.length === 0 && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Link card: {link} — title, description and image are pulled from
                its OG tags at publish time.
              </Typography>
            )}
            {attachments.length > 0 && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                {link
                  ? "Attached images replace the link card (links stay clickable)."
                  : "Attached images publish as a native Bluesky image embed."}
              </Typography>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <Box className="attach-tray" mt={2}>
                {attachments.map((att) => (
                  <Box key={att.storagePath} className="attach-item">
                    <img src={att.url} alt={att.alt || "attachment"} />
                    <IconButton
                      className="attach-remove"
                      size="small"
                      onClick={() =>
                        setAttachments((a) =>
                          a.filter((x) => x.storagePath !== att.storagePath),
                        )
                      }
                    >
                      <Close fontSize="small" />
                    </IconButton>
                    {att.file && (
                      <Box className="attach-aspects">
                        {(["4:3", "1:1", "original"] as Aspect[]).map((asp) => (
                          <Chip
                            key={asp}
                            size="small"
                            label={asp === "original" ? "Orig" : asp}
                            onClick={() => void setAspect(att, asp)}
                            disabled={attachBusy}
                          />
                        ))}
                      </Box>
                    )}
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Alt text"
                      value={att.alt}
                      onChange={(e) =>
                        setAttachments((a) =>
                          a.map((x) =>
                            x.storagePath === att.storagePath
                              ? { ...x, alt: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </Box>
                ))}
              </Box>
            )}

            {/* Image tools */}
            <Box display="flex" gap={1} mt={2} alignItems="center" flexWrap="wrap">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void attachFile(f);
                }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddPhotoAlternate />}
                disabled={attachBusy || attachments.length >= 4}
                onClick={() => fileInput.current?.click()}
              >
                {attachBusy ? "Cropping…" : "Attach image"}
              </Button>
              <TextField
                size="small"
                placeholder="Describe an image to generate…"
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                sx={{ flex: 1, minWidth: 180 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void generate();
                  }
                }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={genBusy ? <CircularProgress size={14} /> : <AutoFixHigh />}
                disabled={!genPrompt.trim() || genBusy || attachments.length >= 4}
                onClick={() => void generate()}
              >
                Generate
              </Button>
            </Box>

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
